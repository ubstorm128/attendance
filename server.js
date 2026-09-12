// PostgreSQL-backed attendance server for Render + Supabase. Run: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const nodeCrypto = require('crypto');
const { Pool } = require('pg');

const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const MAX_PORT_ATTEMPTS = 10;
let currentPort = DEFAULT_PORT;
const SUPERADMIN_USER = process.env.SUPERADMIN_USER || 'admin';
const SUPERADMIN_PASS = process.env.SUPERADMIN_PASS || 'admin123';

const SUPABASE_DB_URL = 'postgresql://postgres.hddezwltrmtxizbxuvvf:reT5QVBJYaxrnxvx@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';
const DATABASE_URL = process.env.DATABASE_URL || SUPABASE_DB_URL;

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- Database Schema Initialization ---
async function initDb() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS teachers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS subjects (
                id TEXT PRIMARY KEY,
                teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                code TEXT DEFAULT 'GEN',
                department TEXT DEFAULT 'GENERAL',
                section TEXT DEFAULT '',
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS students (
                enrollment TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                section TEXT DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id SERIAL PRIMARY KEY,
                teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
                teacher_name TEXT NOT NULL,
                subject TEXT,
                subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
                qr_token TEXT,
                active BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS attendance (
                id SERIAL PRIMARY KEY,
                session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                enrollment TEXT NOT NULL,
                name TEXT NOT NULL,
                section TEXT DEFAULT '',
                time TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE(session_id, enrollment)
            );
        `);

        // Seed default teacher if empty
        const teacherCheck = await pool.query('SELECT 1 FROM teachers WHERE id = $1', ['teacher-default-1']);
        if (teacherCheck.rows.length === 0) {
            await pool.query(`
                INSERT INTO teachers (id, name, username, password)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (id) DO NOTHING
            `, ['teacher-default-1', 'Wanraplang Nongbri', 'WanraplangNongbri', 'teacher001']);
        }

        // Seed default subjects if empty
        const subjCheck = await pool.query('SELECT 1 FROM subjects WHERE teacher_id = $1', ['teacher-default-1']);
        if (subjCheck.rows.length === 0) {
            await pool.query(`
                INSERT INTO subjects (id, teacher_id, name, code, department, section)
                VALUES 
                    ('subj-1', 'teacher-default-1', 'Advance Application Development', '24BCAO3101R', 'BCA', 'C'),
                    ('subj-2', 'teacher-default-1', 'UI UX Lab', '24BCAO3101R', 'BCA', 'C')
                ON CONFLICT (id) DO NOTHING
            `);
        }

        console.log('PostgreSQL database initialized successfully in Supabase.');
    } catch (err) {
        console.error('Database initialization error:', err);
    }
}

// --- SSE clients (in-memory, per-process) ---
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
    const str = String(v ?? '');
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function toCsv(subject, rows) {
    const header = 'Name,Enrollment,Section,Subject,Time\n';
    return header + rows.map(r => {
        const timeStr = typeof r.time === 'string' ? r.time : (r.time ? new Date(r.time).toISOString() : '');
        return [r.name, r.enrollment, r.section, subject || '', timeStr].map(csvEscape).join(',');
    }).join('\n');
}

function safeFilename(teacherName, subject, sessionId) {
    const base = `${teacherName || 'teacher'}-${subject || 'no-subject'}-session-${sessionId}`;
    return base.replace(/[^a-zA-Z0-9 \-_.]/g, '').trim().replace(/\s+/g, '-') + '.csv';
}

// --- Enrollment sorting helpers ---
function getEnrollmentNumber(enrollment) {
    if (!enrollment) return Infinity;
    const parts = enrollment.split('/');
    const num = Number(parts[parts.length - 1]);
    return isNaN(num) ? Infinity : num;
}

function sortStudentsByEnrollment(students) {
    return [...students].sort((a, b) =>
        getEnrollmentNumber(a.enrollment) - getEnrollmentNumber(b.enrollment)
    );
}

// --- Validation helpers ---
const NAME_REGEX = /^[A-Za-z]+(?:\s+[A-Za-z]+)*$/;
const ENROLLMENT_REGEX = /^ADTU\/\d+\/\d{4}-\d{2,4}\/[A-Z0-9]+\/\d+$/;
const SECTION_REGEX = /^[A-Z0-9]{1,6}$/;

function validateStudentFields(name, enrollment, section) {
    const n = (name || '').trim();
    const e = (enrollment || '').trim().toUpperCase();
    const s = (section || '').trim().toUpperCase();
    if (!n) return { error: 'Name is required' };
    if (n.length > 100) return { error: 'Name must not exceed 100 characters' };
    if (!NAME_REGEX.test(n)) return { error: 'Name must contain letters and spaces only' };
    if (!e) return { error: 'Enrollment ID is required' };
    if (!ENROLLMENT_REGEX.test(e)) return { error: 'Invalid enrollment ID format. Expected format: ADTU/1/2023-26/BCAO/012' };
    if (s && !SECTION_REGEX.test(s)) return { error: 'Section must be alphanumeric (e.g. A, B, S-1)' };
    return { name: n, enrollment: e, section: s || '' };
}

const server = http.createServer(async (req, res) => {
    try {
        const host = (req.headers && req.headers.host) ? req.headers.host : `localhost:${currentPort}`;
        const { pathname, searchParams } = new URL(req.url ?? '/', `http://${host}`);

        // --- static pages ---
        if (req.method === 'GET' && ['/', '/student.html', '/admin.html', '/superadmin.html'].includes(pathname)) {
            const file = pathname === '/' ? 'student.html' : pathname.slice(1);
            const headers = { 'Content-Type': 'text/html' };
            if (file === 'student.html') headers['Cache-Control'] = 'no-store';
            res.writeHead(200, headers);
            return res.end(fs.readFileSync(path.join(__dirname, 'public', file)));
        }

        // --- student registration ---
        if (req.method === 'POST' && pathname === '/api/register') {
            const body = await readBody(req);
            const v = validateStudentFields(body.name, body.enrollment, body.section);
            if (v.error) return send(res, 400, { error: v.error });

            const existing = await pool.query('SELECT 1 FROM students WHERE enrollment = $1', [v.enrollment]);
            if (existing.rows.length) {
                return send(res, 409, { error: 'Student with this enrollment ID is already registered' });
            }

            await pool.query(
                'INSERT INTO students (enrollment, name, section) VALUES ($1, $2, $3)',
                [v.enrollment, v.name, v.section || '']
            );

            return send(res, 200, { ok: true, student: { name: v.name, enrollment: v.enrollment, section: v.section || '' } });
        }

        // --- get session info by token ---
        if (req.method === 'GET' && pathname === '/api/session-info') {
            const tok = searchParams.get('token') || '';
            const sessR = await pool.query('SELECT * FROM sessions WHERE active = true AND qr_token = $1', [tok]);
            if (!sessR.rows.length) return send(res, 404, { error: 'Session is inactive or QR code expired' });
            const session = sessR.rows[0];

            let resolvedSection = '';
            if (session.subject_id) {
                const subjR = await pool.query('SELECT section FROM subjects WHERE id = $1', [session.subject_id]);
                if (subjR.rows.length && subjR.rows[0].section) {
                    resolvedSection = subjR.rows[0].section;
                }
            }

            return send(res, 200, {
                ok: true,
                subject: session.subject || 'Class Session',
                teacherName: session.teacher_name || 'Instructor',
                section: resolvedSection
            });
        }

        // --- mark attendance ---
        if (req.method === 'POST' && pathname === '/api/mark') {
            const { enrollment, token } = await readBody(req);
            const normEnrollment = (enrollment || '').trim().toUpperCase();
            if (!normEnrollment) return send(res, 400, { error: 'enrollment is required' });
            if (!token) return send(res, 400, { error: 'missing QR token — scan the code again' });

            const sR = await pool.query('SELECT * FROM students WHERE enrollment = $1', [normEnrollment]);
            if (!sR.rows.length) return send(res, 404, { error: 'register first' });
            const student = sR.rows[0];

            const sessR = await pool.query('SELECT * FROM sessions WHERE active = true AND qr_token = $1', [token]);
            if (!sessR.rows.length) return send(res, 401, { error: 'QR code is invalid or expired' });
            const session = sessR.rows[0];

            // Auto-resolve section from active teacher subject if student section is blank
            let resolvedSection = student.section || '';
            if (!resolvedSection && session.subject_id) {
                const subjR = await pool.query('SELECT section FROM subjects WHERE id = $1', [session.subject_id]);
                if (subjR.rows.length && subjR.rows[0].section) {
                    resolvedSection = subjR.rows[0].section;
                }
            }

            const existingAtt = await pool.query('SELECT * FROM attendance WHERE session_id = $1 AND enrollment = $2', [session.id, normEnrollment]);
            if (existingAtt.rows.length) {
                const existing = existingAtt.rows[0];
                return send(res, 200, {
                    ok: true,
                    already: true,
                    subject: session.subject || 'Class Session',
                    teacherName: session.teacher_name || 'Instructor',
                    time: existing.time.toISOString(),
                    section: existing.section || resolvedSection
                });
            }

            const insR = await pool.query(
                'INSERT INTO attendance (session_id, enrollment, name, section, time) VALUES ($1, $2, $3, $4, now()) RETURNING *',
                [session.id, normEnrollment, student.name, resolvedSection]
            );
            const record = insR.rows[0];

            const studentPayload = {
                name: student.name,
                enrollment: normEnrollment,
                section: resolvedSection,
                time: record.time.toISOString()
            };

            broadcastTo(session.teacher_id, {
                type: 'mark',
                student: studentPayload
            });

            return send(res, 200, {
                ok: true,
                already: false,
                subject: session.subject || 'Class Session',
                teacherName: session.teacher_name || 'Instructor',
                time: record.time.toISOString(),
                section: resolvedSection
            });
        }

        // --- debug log ---
        if (req.method === 'POST' && pathname === '/api/debug-log') {
            const body = await readBody(req);
            console.log('DEBUG:', body);
            return send(res, 200, { ok: true });
        }

        // --- student: my attendance summary ---
        if (req.method === 'GET' && pathname === '/api/my-attendance') {
            const enrollment = (searchParams.get('enrollment') || '').trim().toUpperCase();
            if (!enrollment) return send(res, 400, { error: 'enrollment is required' });

            const stCheck = await pool.query('SELECT 1 FROM students WHERE enrollment = $1', [enrollment]);
            if (!stCheck.rows.length) return send(res, 404, { error: 'Student not registered' });

            const sessQuery = await pool.query(`
                SELECT s.id, s.subject, s.teacher_name, s.created_at,
                       a.time AS attended_time
                FROM sessions s
                LEFT JOIN attendance a ON a.session_id = s.id AND a.enrollment = $1
                ORDER BY s.id DESC
            `, [enrollment]);

            const map = {};
            const recent = [];

            for (const row of sessQuery.rows) {
                const subKey = row.subject || 'No subject';
                if (!map[subKey]) {
                    map[subKey] = {
                        subject: subKey,
                        teacherName: row.teacher_name || 'Instructor',
                        totalSessions: 0,
                        presentSessions: 0
                    };
                }
                map[subKey].totalSessions++;

                if (row.attended_time) {
                    map[subKey].presentSessions++;
                    recent.push({
                        subject: subKey,
                        teacherName: row.teacher_name || 'Instructor',
                        time: row.attended_time.toISOString()
                    });
                }
            }

            recent.sort((a, b) => new Date(b.time) - new Date(a.time));

            return send(res, 200, {
                bySubject: Object.values(map),
                recent: recent.slice(0, 15)
            });
        }

        // --- teacher auth ---
        if (req.method === 'POST' && pathname === '/api/login') {
            const { username, password } = await readBody(req);
            const r = await pool.query('SELECT id, name FROM teachers WHERE username = $1 AND password = $2', [username, password]);
            if (!r.rows.length) return send(res, 401, { error: 'invalid credentials' });
            return send(res, 200, { ok: true, teacherId: r.rows[0].id, teacherName: r.rows[0].name });
        }

        // --- teacher subjects: list ---
        if (req.method === 'GET' && pathname === '/api/teacher/subjects') {
            const teacherId = searchParams.get('teacherId') || '';
            const tR = await pool.query('SELECT 1 FROM teachers WHERE id = $1', [teacherId]);
            if (!tR.rows.length) return send(res, 401, { error: 'not logged in' });

            const subjR = await pool.query('SELECT * FROM subjects WHERE teacher_id = $1 ORDER BY created_at ASC', [teacherId]);
            const sessR = await pool.query('SELECT id, subject, subject_id, active FROM sessions WHERE teacher_id = $1', [teacherId]);
            const attR = await pool.query(`
                SELECT a.session_id, s.subject_id, s.subject
                FROM attendance a
                JOIN sessions s ON a.session_id = s.id
                WHERE s.teacher_id = $1
            `, [teacherId]);

            const subjects = subjR.rows.map(s => {
                const matchingSessions = sessR.rows.filter(sess =>
                    sess.subject_id === s.id || sess.subject === s.name || sess.subject === `${s.code} ${s.name}`
                );
                const activeSession = matchingSessions.find(sess => sess.active);
                const totalPresent = attR.rows.filter(a =>
                    a.subject_id === s.id || a.subject === s.name || a.subject === `${s.code} ${s.name}`
                ).length;

                return {
                    id: s.id,
                    name: s.name,
                    code: s.code,
                    department: s.department,
                    section: s.section,
                    createdAt: s.created_at.toISOString(),
                    totalSessions: matchingSessions.length,
                    totalPresent,
                    isActive: !!activeSession,
                    activeSessionId: activeSession ? activeSession.id : null
                };
            });

            return send(res, 200, subjects);
        }

        // --- teacher subjects: create ---
        if (req.method === 'POST' && pathname === '/api/teacher/subjects') {
            const { teacherId, name, code, department, section } = await readBody(req);
            const tR = await pool.query('SELECT 1 FROM teachers WHERE id = $1', [teacherId]);
            if (!tR.rows.length) return send(res, 401, { error: 'not logged in' });

            const sName = (name || '').trim();
            const sCode = (code || '').trim().toUpperCase();
            const sDept = (department || '').trim().toUpperCase();
            const sSection = (section || '').trim().toUpperCase();
            if (!sName) return send(res, 400, { error: 'Subject name is required' });

            const id = 'subj-' + nodeCrypto.randomUUID().slice(0, 8);
            const ins = await pool.query(
                'INSERT INTO subjects (id, teacher_id, name, code, department, section, created_at) VALUES ($1, $2, $3, $4, $5, $6, now()) RETURNING *',
                [id, teacherId, sName, sCode || 'GEN', sDept || 'GENERAL', sSection || '']
            );
            const row = ins.rows[0];

            return send(res, 200, {
                ok: true,
                subject: {
                    id: row.id,
                    name: row.name,
                    code: row.code,
                    department: row.department,
                    section: row.section,
                    createdAt: row.created_at.toISOString()
                }
            });
        }

        // --- teacher subjects: edit ---
        if (req.method === 'POST' && pathname === '/api/teacher/subjects/edit') {
            const { teacherId, subjectId, name, code, department, section } = await readBody(req);
            const check = await pool.query('SELECT * FROM subjects WHERE id = $1 AND teacher_id = $2', [subjectId, teacherId]);
            if (!check.rows.length) return send(res, 404, { error: 'Subject not found' });

            const cur = check.rows[0];
            const newName = name && name.trim() ? name.trim() : cur.name;
            const newCode = code && code.trim() ? code.trim().toUpperCase() : cur.code;
            const newDept = department && department.trim() ? department.trim().toUpperCase() : cur.department;
            const newSec = section !== undefined ? (section || '').trim().toUpperCase() : cur.section;

            const upd = await pool.query(
                'UPDATE subjects SET name = $1, code = $2, department = $3, section = $4 WHERE id = $5 AND teacher_id = $6 RETURNING *',
                [newName, newCode, newDept, newSec, subjectId, teacherId]
            );
            const row = upd.rows[0];

            return send(res, 200, {
                ok: true,
                subject: {
                    id: row.id,
                    name: row.name,
                    code: row.code,
                    department: row.department,
                    section: row.section,
                    createdAt: row.created_at.toISOString()
                }
            });
        }

        // --- teacher subjects: delete ---
        if (req.method === 'POST' && pathname === '/api/teacher/subjects/delete') {
            const { teacherId, subjectId } = await readBody(req);
            const del = await pool.query('DELETE FROM subjects WHERE id = $1 AND teacher_id = $2', [subjectId, teacherId]);
            if (del.rowCount === 0) return send(res, 404, { error: 'Subject not found' });
            return send(res, 200, { ok: true });
        }

        // --- start session ---
        if (req.method === 'POST' && pathname === '/api/start-session') {
            const { teacherId, subject, subjectId } = await readBody(req);
            const tR = await pool.query('SELECT id, name FROM teachers WHERE id = $1', [teacherId]);
            if (!tR.rows.length) return send(res, 401, { error: 'not logged in' });
            const teacher = tR.rows[0];

            // Close any previous active sessions for this teacher
            await pool.query('UPDATE sessions SET active = false, qr_token = NULL WHERE teacher_id = $1 AND active = true', [teacher.id]);

            const qrToken = nodeCrypto.randomBytes(32).toString('hex');
            const subjectVal = subject && subject.trim() ? subject.trim() : null;

            const ins = await pool.query(
                'INSERT INTO sessions (teacher_id, teacher_name, subject, subject_id, qr_token, active, created_at) VALUES ($1, $2, $3, $4, $5, true, now()) RETURNING *',
                [teacher.id, teacher.name, subjectVal, subjectId || null, qrToken]
            );
            const session = ins.rows[0];

            broadcastTo(teacher.id, {
                type: 'new-session',
                session: {
                    id: session.id,
                    teacherId: session.teacher_id,
                    teacherName: session.teacher_name,
                    subject: session.subject,
                    subjectId: session.subject_id,
                    qrToken: session.qr_token,
                    present: {},
                    createdAt: session.created_at.toISOString(),
                    active: session.active
                }
            });

            return send(res, 200, { qrToken: session.qr_token, sessionId: session.id });
        }

        // --- close session ---
        if (req.method === 'POST' && pathname === '/api/close-session') {
            const { teacherId } = await readBody(req);
            await pool.query('UPDATE sessions SET active = false, qr_token = NULL WHERE teacher_id = $1 AND active = true', [teacherId]);
            broadcastTo(teacherId, { type: 'closed' });
            return send(res, 200, { ok: true });
        }

        // --- delete session ---
        if (req.method === 'POST' && pathname === '/api/delete-session') {
            const { teacherId, sessionId } = await readBody(req);
            const r = await pool.query('DELETE FROM sessions WHERE id = $1 AND teacher_id = $2', [Number(sessionId), teacherId]);
            if (r.rowCount === 0) return send(res, 404, { error: 'not found or not your session' });
            return send(res, 200, { ok: true });
        }

        // --- SSE stream ---
        if (req.method === 'GET' && pathname === '/api/stream') {
            const teacherId = searchParams.get('teacherId') || '';
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive'
            });

            const activeR = await pool.query('SELECT * FROM sessions WHERE teacher_id = $1 AND active = true ORDER BY id DESC LIMIT 1', [teacherId]);
            let currentSession = null;
            if (activeR.rows.length) {
                const sess = activeR.rows[0];
                const attR = await pool.query('SELECT enrollment, name, section, time FROM attendance WHERE session_id = $1 ORDER BY id ASC', [sess.id]);
                const presentMap = {};
                for (const a of attR.rows) {
                    presentMap[a.enrollment] = {
                        name: a.name,
                        enrollment: a.enrollment,
                        section: a.section,
                        time: a.time.toISOString()
                    };
                }
                currentSession = {
                    id: sess.id,
                    teacherId: sess.teacher_id,
                    teacherName: sess.teacher_name,
                    subject: sess.subject,
                    subjectId: sess.subject_id,
                    qrToken: sess.qr_token,
                    present: presentMap,
                    createdAt: sess.created_at.toISOString(),
                    active: sess.active
                };
            }

            res.write(`data: ${JSON.stringify({ type: 'init', session: currentSession })}\n\n`);
            clients.push({ res, teacherId });
            req.on('close', () => {
                clients = clients.filter(c => c.res !== res);
            });
            return;
        }

        // --- history ---
        if (req.method === 'GET' && pathname === '/api/history') {
            const teacherId = searchParams.get('teacherId') || '';
            const subjectFilter = (searchParams.get('subject') || '').trim();
            const subjectIdFilter = (searchParams.get('subjectId') || '').trim();

            let query = `
                SELECT s.id, s.subject, s.subject_id, s.created_at, s.active, COUNT(a.id)::int AS count
                FROM sessions s
                LEFT JOIN attendance a ON a.session_id = s.id
                WHERE s.teacher_id = $1
            `;
            const params = [teacherId];

            if (subjectIdFilter) {
                params.push(subjectIdFilter);
                query += ` AND s.subject_id = $${params.length}`;
            } else if (subjectFilter) {
                params.push(subjectFilter);
                query += ` AND (s.subject = $${params.length} OR s.subject_id = $${params.length})`;
            }

            query += ` GROUP BY s.id ORDER BY s.id DESC`;

            const r = await pool.query(query, params);
            const mapped = r.rows.map(s => ({
                id: s.id,
                subject: s.subject,
                subjectId: s.subject_id,
                createdAt: s.created_at.toISOString(),
                count: s.count,
                active: s.active
            }));
            return send(res, 200, mapped);
        }

        // --- single session ---
        if (req.method === 'GET' && pathname === '/api/session') {
            const id = Number(searchParams.get('id'));
            const sessR = await pool.query('SELECT * FROM sessions WHERE id = $1', [id]);
            if (!sessR.rows.length) return send(res, 404, { error: 'not found' });
            const sess = sessR.rows[0];

            const attR = await pool.query('SELECT enrollment, name, section, time FROM attendance WHERE session_id = $1 ORDER BY id ASC', [id]);
            const presentMap = {};
            for (const a of attR.rows) {
                presentMap[a.enrollment] = {
                    name: a.name,
                    enrollment: a.enrollment,
                    section: a.section,
                    time: a.time.toISOString()
                };
            }
            return send(res, 200, {
                id: sess.id,
                teacherId: sess.teacher_id,
                teacherName: sess.teacher_name,
                subject: sess.subject,
                subjectId: sess.subject_id,
                qrToken: sess.qr_token,
                present: presentMap,
                createdAt: sess.created_at.toISOString(),
                active: sess.active
            });
        }

        // --- export csv ---
        if (req.method === 'GET' && pathname === '/api/export') {
            const id = Number(searchParams.get('id'));
            const sessR = await pool.query('SELECT * FROM sessions WHERE id = $1', [id]);
            if (!sessR.rows.length) return send(res, 404, { error: 'not found' });
            const sess = sessR.rows[0];

            const attR = await pool.query('SELECT enrollment, name, section, time FROM attendance WHERE session_id = $1', [id]);
            const rows = sortStudentsByEnrollment(attR.rows.map(r => ({
                name: r.name,
                enrollment: r.enrollment,
                section: r.section,
                time: r.time.toISOString()
            })));

            res.writeHead(200, {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="${safeFilename(sess.teacher_name, sess.subject, sess.id)}"`
            });
            return res.end(toCsv(sess.subject, rows));
        }

        // --- super-admin ---
        if (req.method === 'POST' && pathname === '/api/admin/login') {
            const { username, password } = await readBody(req);
            return send(res, username === SUPERADMIN_USER && password === SUPERADMIN_PASS ? 200 : 401, { ok: true });
        }

        if (req.method === 'GET' && pathname === '/api/admin/teachers') {
            const r = await pool.query('SELECT id, name, username FROM teachers ORDER BY name ASC');
            return send(res, 200, r.rows);
        }

        if (req.method === 'POST' && pathname === '/api/admin/teachers') {
            const { name, username, password } = await readBody(req);
            if (!name || !username || !password) return send(res, 400, { error: 'missing fields' });

            const check = await pool.query('SELECT 1 FROM teachers WHERE username = $1', [username]);
            if (check.rows.length) {
                return send(res, 409, { error: 'username taken' });
            }

            const id = nodeCrypto.randomUUID();
            await pool.query('INSERT INTO teachers (id, name, username, password) VALUES ($1, $2, $3, $4)', [id, name, username, password]);
            return send(res, 200, { ok: true, id });
        }

        if (req.method === 'POST' && pathname === '/api/admin/teachers/delete') {
            const { id } = await readBody(req);
            await pool.query('DELETE FROM teachers WHERE id = $1', [id]);
            return send(res, 200, { ok: true });
        }

        // --- edit student attendance ---
        if (req.method === 'POST' && /^\/api\/session\/\d+\/student\/edit$/.test(pathname)) {
            const sessionId = Number(pathname.split('/')[3]);
            const { teacherId: reqTeacherId, oldEnrollment, name, enrollment, section } = await readBody(req);

            const tR = await pool.query('SELECT id FROM teachers WHERE id = $1', [reqTeacherId]);
            if (!tR.rows.length) return send(res, 401, { error: 'Not authenticated' });

            const sessR = await pool.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
            if (!sessR.rows.length) return send(res, 404, { error: 'Session not found' });
            if (sessR.rows[0].teacher_id !== reqTeacherId) return send(res, 403, { error: 'Not authorized to modify this session' });

            const v = validateStudentFields(name, enrollment, section);
            if (v.error) return send(res, 400, { error: v.error });
            const normalizedOld = (oldEnrollment || '').trim().toUpperCase();
            if (!normalizedOld) return send(res, 400, { error: 'Old enrollment ID is required' });

            const attR = await pool.query('SELECT * FROM attendance WHERE session_id = $1 AND enrollment = $2', [sessionId, normalizedOld]);
            if (!attR.rows.length) return send(res, 404, { error: 'Attendance record not found in this session' });
            const originalTime = attR.rows[0].time;

            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                if (normalizedOld !== v.enrollment) {
                    await client.query('INSERT INTO students (enrollment, name, section) VALUES ($1, $2, $3) ON CONFLICT (enrollment) DO UPDATE SET name = $2, section = $3', [v.enrollment, v.name, v.section]);
                    await client.query('DELETE FROM attendance WHERE session_id = $1 AND enrollment = $2', [sessionId, normalizedOld]);
                    await client.query('INSERT INTO attendance (session_id, enrollment, name, section, time) VALUES ($1, $2, $3, $4, $5)', [sessionId, v.enrollment, v.name, v.section, originalTime]);
                } else {
                    await client.query('UPDATE students SET name = $1, section = $2 WHERE enrollment = $3', [v.name, v.section, v.enrollment]);
                    await client.query('UPDATE attendance SET name = $1, section = $2 WHERE session_id = $3 AND enrollment = $4', [v.name, v.section, sessionId, v.enrollment]);
                }

                await client.query('COMMIT');
            } catch (txErr) {
                await client.query('ROLLBACK');
                throw txErr;
            } finally {
                client.release();
            }

            broadcastTo(reqTeacherId, {
                type: 'student-updated',
                oldEnrollment: normalizedOld,
                student: { name: v.name, enrollment: v.enrollment, section: v.section, time: originalTime.toISOString() }
            });
            return send(res, 200, { ok: true });
        }

        // --- delete student attendance ---
        if (req.method === 'POST' && /^\/api\/session\/\d+\/student\/delete$/.test(pathname)) {
            const sessionId = Number(pathname.split('/')[3]);
            const { teacherId: reqTeacherId, enrollment } = await readBody(req);

            const tR = await pool.query('SELECT id FROM teachers WHERE id = $1', [reqTeacherId]);
            if (!tR.rows.length) return send(res, 401, { error: 'Not authenticated' });

            const sessR = await pool.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
            if (!sessR.rows.length) return send(res, 404, { error: 'Session not found' });
            if (sessR.rows[0].teacher_id !== reqTeacherId) return send(res, 403, { error: 'Not authorized to modify this session' });

            const normalizedEnrollment = (enrollment || '').trim().toUpperCase();
            if (!normalizedEnrollment) return send(res, 400, { error: 'Enrollment ID is required' });

            const del = await pool.query('DELETE FROM attendance WHERE session_id = $1 AND enrollment = $2', [sessionId, normalizedEnrollment]);
            if (del.rowCount === 0) return send(res, 404, { error: 'Attendance record not found in this session' });

            broadcastTo(reqTeacherId, {
                type: 'student-deleted',
                enrollment: normalizedEnrollment
            });
            return send(res, 200, { ok: true });
        }

        send(res, 404, { error: 'not found' });
    } catch (err) {
        console.error('Server error:', err);
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
    server.listen(port, () => console.log(`Attendance server running at: http://localhost:${port}`));
}

initDb()
    .then(() => startServer(DEFAULT_PORT))
    .catch(err => {
        console.error('Failed to initialize database:', err);
        process.exit(1);
    });