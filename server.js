// plain Node + pg. Run: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const nodeCrypto = require('crypto');
const { Pool } = require('pg');

const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const MAX_PORT_ATTEMPTS = 10;
let currentPort = DEFAULT_PORT;
const SUPERADMIN_USER = process.env.SUPERADMIN_USER || 'admin';
const SUPERADMIN_PASS = process.env.SUPERADMIN_PASS || 'changeme';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function initDb() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS teachers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS students (
            enrollment TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            section TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            id SERIAL PRIMARY KEY,
            teacher_id TEXT NOT NULL,
            teacher_name TEXT NOT NULL,
            subject TEXT,
            qr_token TEXT,
            active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS attendance (
            id SERIAL PRIMARY KEY,
            session_id INTEGER NOT NULL REFERENCES sessions(id),
            enrollment TEXT NOT NULL,
            name TEXT NOT NULL,
            section TEXT NOT NULL,
            time TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE(session_id, enrollment)
        );
    `);
}

// --- SSE clients (in-memory, per-process — fine for a single Render instance) ---
let clients = [];
function broadcastTo(teacherId, data) {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    clients.filter(c => c.teacherId === teacherId).forEach(c => c.res.write(msg));
}

function send(res, code, body) {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
            try {
                const raw = Buffer.concat(chunks).toString('utf8');
                resolve(raw ? JSON.parse(raw) : {});
            } catch (e) { reject(e); }
        });
    });
}

function csvEscape(v) {
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function toCsv(subject, rows) {
    const header = 'Name,Enrollment,Section,Subject,Time\n';
    return header + rows.map(r =>
        [r.name, r.enrollment, r.section, subject || '', r.time.toISOString()].map(csvEscape).join(',')
    ).join('\n');
}

function safeFilename(teacherName, subject, sessionId) {
    const base = `${teacherName}-${subject || 'no-subject'}-session-${sessionId}`;
    return base.replace(/[^a-zA-Z0-9 \-_.]/g, '').trim().replace(/\s+/g, '-') + '.csv';
}

// --- DB helpers ---
async function getTeacherById(id) {
    if (!id) return null;
    const r = await pool.query('SELECT * FROM teachers WHERE id = $1', [id]);
    return r.rows[0] || null;
}
async function getActiveSession(teacherId) {
    const r = await pool.query('SELECT * FROM sessions WHERE teacher_id = $1 AND active = true ORDER BY id DESC LIMIT 1', [teacherId]);
    return r.rows[0] || null;
}
async function getPresentMap(sessionId) {
    const r = await pool.query('SELECT enrollment, name, section, time FROM attendance WHERE session_id = $1 ORDER BY time', [sessionId]);
    const present = {};
    for (const row of r.rows) {
        present[row.enrollment] = { name: row.name, enrollment: row.enrollment, section: row.section, time: row.time.toISOString() };
    }
    return present;
}
async function sessionToJson(session) {
    if (!session) return null;
    const present = await getPresentMap(session.id);
    return {
        id: session.id,
        teacherId: session.teacher_id,
        teacherName: session.teacher_name,
        subject: session.subject,
        qrToken: session.qr_token,
        present,
        createdAt: session.created_at.toISOString(),
        active: session.active
    };
}

const server = http.createServer(async (req, res) => {
    try {
        const host = (req.headers && req.headers.host) ? req.headers.host : `localhost:${currentPort}`;
        const { pathname, searchParams } = new URL(req.url ?? '/', `http://${host}`);

        // --- static pages ---
        if (req.method === 'GET' && ['/', '/student.html', '/admin.html', '/superadmin.html'].includes(pathname)) {
            const file = pathname === '/' ? 'student.html' : pathname.slice(1);
            res.writeHead(200, { 'Content-Type': 'text/html' });
            return res.end(fs.readFileSync(path.join(__dirname, 'public', file)));
        }

        // --- student registration ---
        if (req.method === 'POST' && pathname === '/api/register') {
            const { name, enrollment, section } = await readBody(req);

            const normalizedName = (name || '').trim();
            const normalizedEnrollment = (enrollment || '').trim().toUpperCase();
            const normalizedSection = (section || '').trim().toUpperCase();

            if (!normalizedName) return send(res, 400, { error: 'Name is required' });
            if (!normalizedEnrollment) return send(res, 400, { error: 'Enrollment ID is required' });
            if (!normalizedSection) return send(res, 400, { error: 'Section is required' });

            const nameRegex = /^[A-Za-z]+(?:\s+[A-Za-z]+)*$/;
            if (normalizedName.length > 100) return send(res, 400, { error: 'Name must not exceed 100 characters' });
            if (!nameRegex.test(normalizedName)) return send(res, 400, { error: 'Name must contain letters and spaces only' });

            const enrollmentRegex = /^ADTU\/\d+\/\d{4}-\d{2,4}\/[A-Z0-9]+\/\d+$/;
            if (!enrollmentRegex.test(normalizedEnrollment))
                return send(res, 400, { error: 'Invalid enrollment ID format. Expected format: ADTU/1/2023-26/BCAO/012' });

            const sectionRegex = /^[A-Z]$/;
            if (!sectionRegex.test(normalizedSection)) return send(res, 400, { error: 'Section must be a single letter (e.g. A, B, C)' });

            const existing = await pool.query('SELECT 1 FROM students WHERE enrollment = $1', [normalizedEnrollment]);
            if (existing.rows.length) return send(res, 409, { error: 'Student with this enrollment ID is already registered' });

            await pool.query('INSERT INTO students (enrollment, name, section) VALUES ($1, $2, $3)', [normalizedEnrollment, normalizedName, normalizedSection]);
            return send(res, 200, { ok: true });
        }

        // --- mark attendance ---
        if (req.method === 'POST' && pathname === '/api/mark') {
            const { enrollment, token } = await readBody(req);
            const studentR = await pool.query('SELECT * FROM students WHERE enrollment = $1', [enrollment]);
            const student = studentR.rows[0];
            if (!student) return send(res, 404, { error: 'register first' });
            if (!token) return send(res, 400, { error: 'missing QR token — scan the code again' });

            const sessionR = await pool.query('SELECT * FROM sessions WHERE active = true AND qr_token = $1', [token]);
            const session = sessionR.rows[0];
            if (!session) return send(res, 401, { error: 'QR code is invalid or expired' });

            const dupe = await pool.query('SELECT 1 FROM attendance WHERE session_id = $1 AND enrollment = $2', [session.id, enrollment]);
            if (dupe.rows.length) return send(res, 200, { ok: true, already: true });

            const time = new Date();
            await pool.query(
                'INSERT INTO attendance (session_id, enrollment, name, section, time) VALUES ($1, $2, $3, $4, $5)',
                [session.id, student.enrollment, student.name, student.section, time]
            );
            broadcastTo(session.teacher_id, {
                type: 'mark',
                student: { name: student.name, enrollment: student.enrollment, section: student.section, time: time.toISOString() }
            });
            return send(res, 200, { ok: true });
        }

        // --- teacher auth ---
        if (req.method === 'POST' && pathname === '/api/login') {
            const { username, password } = await readBody(req);
            const r = await pool.query('SELECT * FROM teachers WHERE username = $1 AND password = $2', [username, password]);
            const teacher = r.rows[0];
            if (!teacher) return send(res, 401, { error: 'invalid credentials' });
            return send(res, 200, { ok: true, teacherId: teacher.id, teacherName: teacher.name });
        }

        // --- start session ---
        if (req.method === 'POST' && pathname === '/api/start-session') {
            const { teacherId, subject } = await readBody(req);
            const teacher = await getTeacherById(teacherId);
            if (!teacher) return send(res, 401, { error: 'not logged in' });

            await pool.query('UPDATE sessions SET active = false, qr_token = NULL WHERE teacher_id = $1 AND active = true', [teacher.id]);

            const qrToken = nodeCrypto.randomBytes(32).toString('hex');
            const subjectVal = subject && subject.trim() ? subject.trim() : null;
            const insert = await pool.query(
                'INSERT INTO sessions (teacher_id, teacher_name, subject, qr_token, active) VALUES ($1, $2, $3, $4, true) RETURNING *',
                [teacher.id, teacher.name, subjectVal, qrToken]
            );
            const session = await sessionToJson(insert.rows[0]);
            broadcastTo(teacher.id, { type: 'new-session', session });
            return send(res, 200, { qrToken: session.qrToken, sessionId: session.id });
        }

        // --- close session ---
        if (req.method === 'POST' && pathname === '/api/close-session') {
            const { teacherId } = await readBody(req);
            const r = await pool.query('UPDATE sessions SET active = false, qr_token = NULL WHERE teacher_id = $1 AND active = true RETURNING id', [teacherId]);
            if (r.rows.length) broadcastTo(teacherId, { type: 'closed' });
            return send(res, 200, { ok: true });
        }

        // --- SSE stream ---
        if (req.method === 'GET' && pathname === '/api/stream') {
            const teacherId = searchParams.get('teacherId') || '';
            res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
            const current = await getActiveSession(teacherId);
            const currentJson = await sessionToJson(current);
            res.write(`data: ${JSON.stringify({ type: 'init', session: currentJson })}\n\n`);
            clients.push({ res, teacherId });
            req.on('close', () => { clients = clients.filter(c => c.res !== res); });
            return;
        }

        // --- history ---
        if (req.method === 'GET' && pathname === '/api/history') {
            const teacherId = searchParams.get('teacherId') || '';
            const r = await pool.query(`
                SELECT s.id, s.subject, s.created_at, s.active, COUNT(a.id) AS count
                FROM sessions s
                LEFT JOIN attendance a ON a.session_id = s.id
                WHERE s.teacher_id = $1
                GROUP BY s.id
                ORDER BY s.id DESC
            `, [teacherId]);
            const list = r.rows.map(row => ({
                id: row.id, subject: row.subject, createdAt: row.created_at.toISOString(),
                count: Number(row.count), active: row.active
            }));
            return send(res, 200, list);
        }

        // --- single session ---
        if (req.method === 'GET' && pathname === '/api/session') {
            const id = Number(searchParams.get('id'));
            const r = await pool.query('SELECT * FROM sessions WHERE id = $1', [id]);
            if (!r.rows[0]) return send(res, 404, { error: 'not found' });
            const session = await sessionToJson(r.rows[0]);
            return send(res, 200, session);
        }

        // --- export csv ---
        if (req.method === 'GET' && pathname === '/api/export') {
            const id = Number(searchParams.get('id'));
            const sessionR = await pool.query('SELECT * FROM sessions WHERE id = $1', [id]);
            const session = sessionR.rows[0];
            if (!session) return send(res, 404, { error: 'not found' });
            const rowsR = await pool.query('SELECT * FROM attendance WHERE session_id = $1 ORDER BY time', [id]);
            res.writeHead(200, {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="${safeFilename(session.teacher_name, session.subject, session.id)}"`
            });
            return res.end(toCsv(session.subject, rowsR.rows));
        }

        // --- super-admin ---
        if (req.method === 'POST' && pathname === '/api/admin/login') {
            const { username, password } = await readBody(req);
            return send(res, username === SUPERADMIN_USER && password === SUPERADMIN_PASS ? 200 : 401, { ok: true });
        }

        if (req.method === 'GET' && pathname === '/api/admin/teachers') {
            const r = await pool.query('SELECT id, name, username FROM teachers ORDER BY name');
            return send(res, 200, r.rows);
        }

        if (req.method === 'POST' && pathname === '/api/admin/teachers') {
            const { name, username, password } = await readBody(req);
            if (!name || !username || !password) return send(res, 400, { error: 'missing fields' });
            const existing = await pool.query('SELECT 1 FROM teachers WHERE username = $1', [username]);
            if (existing.rows.length) return send(res, 409, { error: 'username taken' });
            const id = nodeCrypto.randomUUID();
            await pool.query('INSERT INTO teachers (id, name, username, password) VALUES ($1, $2, $3, $4)', [id, name, username, password]);
            return send(res, 200, { ok: true, id });
        }

        if (req.method === 'POST' && pathname === '/api/admin/teachers/delete') {
            const { id } = await readBody(req);
            await pool.query('DELETE FROM teachers WHERE id = $1', [id]);
            return send(res, 200, { ok: true });
        }

        send(res, 404, { error: 'not found' });
    } catch (err) {
        console.error(err);
        if (!res.headersSent) send(res, 500, { error: 'server error' });
    }
});

function startServer(port) {
    currentPort = port;
    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            const nextPort = port + 1;
            if (nextPort <= DEFAULT_PORT + MAX_PORT_ATTEMPTS) {
                console.log(`Port ${port} is busy. Trying ${nextPort} instead...`);
                startServer(nextPort);
                return;
            }
            throw error;
        }
        throw error;
    });
    server.listen(port, () => console.log(`http://localhost:${port}`));
}

initDb()
    .then(() => startServer(DEFAULT_PORT))
    .catch(err => {
        console.error('Failed to initialize database:', err);
        process.exit(1);
    });