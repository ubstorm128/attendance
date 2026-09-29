// PostgreSQL-backed attendance server for Render + Supabase. Run: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const nodeCrypto = require('crypto');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

// Load .env variables if available (for local development)
try {
    require('fs').readFileSync('.env', 'utf8').split('\n').forEach(line => {
        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) return;
        const k = line.slice(0, eqIdx).trim();
        const v = line.slice(eqIdx + 1).trim();
        if (k) process.env[k] = v;
    }); 
} catch (_) {}

const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const MAX_PORT_ATTEMPTS = 10;
let currentPort = DEFAULT_PORT;

// Credentials must live in environment variables, never in source code.
// Priority: SUPABASE_DB_URL for local dev, DATABASE_URL for Render deployment.
const DATABASE_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.SUPERBASE_DB_URL;
if (!DATABASE_URL) { console.error('FATAL: No DATABASE_URL or SUPABASE_DB_URL set in environment.'); process.exit(1); }

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-change-in-production';
const BCRYPT_ROUNDS = 10;

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,                    // max connections in pool
    idleTimeoutMillis: 30_000,  // close idle connections after 30s
    connectionTimeoutMillis: 30_000  // fail fast if pool is exhausted (30s to allow Supabase to wake up)
});

const supabaseUrl = process.env.SUPABASE_URL || 'https://hddezwltrmtxizbxuvvf.supabase.co'; // Inferring URL from SUPABASE_DB_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
let supabase = null;
if (supabaseAnonKey) {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
}

// --- Static file cache ---
// Pre-load all HTML pages into memory at startup so disk I/O is paid once,
// not on every incoming request.
const STATIC_FILES = ['pages/student/dashboard.html', 'pages/teacher/dashboard.html', 'pages/attendance-admin/dashboard.html', 'pages/student/profile.html', 'pages/auth/login.html', 'pages/auth/main.html', 'pages/auth/register-student.html', 'pages/auth/register-teacher.html', 'pages/auth/reset-password.html'];
const staticCache = new Map();
for (const file of STATIC_FILES) {
    try {
        staticCache.set(file, fs.readFileSync(path.join(__dirname, '../public', file)));
    } catch (_) {
        console.warn(`[static] Could not pre-load ${file}`);
    }
}
console.log(`[static] Pre-loaded ${staticCache.size} HTML file(s) into memory.`);

// --- Database Schema Initialization ---
async function initDb() {
    try {
        // Safely rename attendance_admins table to attendance_admins if migrating
        try {
            await pool.query('ALTER TABLE IF EXISTS attendance_admins RENAME TO attendance_admins;');
        } catch(e) {}

        await pool.query(`
            CREATE TABLE IF NOT EXISTS attendance_admins (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );

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
                semester TEXT DEFAULT '',
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            ALTER TABLE subjects ADD COLUMN IF NOT EXISTS semester TEXT DEFAULT '';

            CREATE TABLE IF NOT EXISTS students (
                enrollment TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                section TEXT DEFAULT '',
                avatar TEXT DEFAULT '',
                about TEXT DEFAULT ''
            );
            ALTER TABLE students ADD COLUMN IF NOT EXISTS avatar TEXT DEFAULT '';
            ALTER TABLE students ADD COLUMN IF NOT EXISTS about TEXT DEFAULT '';
            ALTER TABLE students ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;
            ALTER TABLE students ADD COLUMN IF NOT EXISTS password TEXT;
            ALTER TABLE teachers ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;
            ALTER TABLE attendance_admins ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;

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

        // --- Performance indexes ---
        // These make the most-queried columns use index scans instead of
        // sequential table scans. CREATE INDEX IF NOT EXISTS is idempotent.
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_sessions_teacher_id  ON sessions (teacher_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_subject_id  ON sessions (subject_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_qr_token    ON sessions (qr_token) WHERE qr_token IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_sessions_active      ON sessions (active)   WHERE active = true;
            CREATE INDEX IF NOT EXISTS idx_attendance_session   ON attendance (session_id);
            CREATE INDEX IF NOT EXISTS idx_attendance_enrollment ON attendance (enrollment);
            CREATE INDEX IF NOT EXISTS idx_subjects_teacher     ON subjects (teacher_id);
        `);
        console.log('Database indexes ensured.');

        // Reconcile legacy sessions where subject_id is NULL by linking them to matching teacher subjects
        try {
            await pool.query(`
                UPDATE sessions s
                SET subject_id = sub.id
                FROM subjects sub
                WHERE s.subject_id IS NULL
                  AND s.teacher_id = sub.teacher_id
                  AND (
                      s.subject = sub.name
                      OR s.subject LIKE '%' || sub.name || '%'
                      OR s.subject LIKE '%' || sub.code || '%'
                  );
            `);
        } catch (mErr) {
            console.warn('Note on legacy session reconciliation:', mErr.message);
        }

        // If attendance_admins table is completely empty, insert initial attendance_admin account
        const adminCheck = await pool.query('SELECT 1 FROM attendance_admins LIMIT 1');
        if (adminCheck.rows.length === 0) {
            const initialUser = process.env.ATTENDANCE_ADMIN_USER || 'admin';
            const initialPass = process.env.ATTENDANCE_ADMIN_PASS || 'admin123';
            const initialEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
            const hashedPass = await bcrypt.hash(initialPass, BCRYPT_ROUNDS);
            await pool.query(
                'INSERT INTO attendance_admins (id, username, password, email) VALUES ($1, $2, $3, $4)',
                ['admin-1', initialUser, hashedPass, initialEmail]
            );
            console.log(`Initial attendance_admin account initialized (${initialUser}) with hashed password and email (${initialEmail}).`);
        }

        // --- One-time migration: hash any existing plain-text passwords ---
        await migratePlainTextPasswords();

        console.log('PostgreSQL database initialized successfully.');
    } catch (err) {
        console.error('Database initialization error:', err);
    }
}

// Detects and bcrypt-hashes any plain-text password rows (runs once on startup)
async function migratePlainTextPasswords() {
    const tables = [
        { table: 'attendance_admins', idCol: 'id' },
        { table: 'teachers', idCol: 'id' }
    ];
    for (const { table, idCol } of tables) {
        const rows = await pool.query(`SELECT ${idCol}, password FROM ${table}`);
        for (const row of rows.rows) {
            // bcrypt hashes always start with '$2a$' or '$2b$' — if it doesn't, it's plain text
            const isHashed = typeof row.password === 'string' && row.password.startsWith('$2');
            if (!isHashed) {
                const hashed = await bcrypt.hash(row.password, BCRYPT_ROUNDS);
                await pool.query(`UPDATE ${table} SET password = $1 WHERE ${idCol} = $2`, [hashed, row[idCol]]);
                console.log(`[migration] Hashed plain-text password for ${table} id=${row[idCol]}`);
            }
        }
    }
}

// --- JWT helpers ---
function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Reads and verifies the Bearer token from the Authorization header.
 * Returns decoded payload or null if invalid/missing.
 */
function verifyToken(req) {
    const auth = req.headers['authorization'] || '';
    if (!auth.startsWith('Bearer ')) return null;
    try {
        return jwt.verify(auth.slice(7), JWT_SECRET);
    } catch (_) {
        return null;
    }
}

/**
 * Middleware-style helper: verifies the teacher JWT.
 * Returns { teacherId, teacherName } or sends 401 and returns null.
 */
function authenticate(req, res) {
    const payload = verifyToken(req);
    if (!payload || payload.role !== 'teacher') {
        send(res, 401, { error: 'Authentication required. Please log in again.' });
        return null;
    }
    return payload;
}

/**
 * Middleware-style helper: verifies the admin JWT.
 * Returns { adminId, username } or sends 401/403 and returns null.
 */
function authenticateAdmin(req, res) {
    const payload = verifyToken(req);
    if (!payload) {
        send(res, 401, { error: 'Authentication required. Please log in again.' });
        return null;
    }
    if (payload.role !== 'admin') {
        send(res, 403, { error: 'Forbidden: admin access only.' });
        return null;
    }
    return payload;
}

// --- SSE clients & replay buffer ---
//
// Each connected teacher gets their response object tracked.
// A per-teacher ring buffer (last MAX_REPLAY events) allows reconnecting
// clients to catch up on missed events via the Last-Event-ID header.
//
const MAX_REPLAY = 50;
let clients = [];            // [{ res, teacherId }]
let eventIdCounter = 0;      // global monotonic event ID
const replayBuffers = {};    // teacherId → [{ id, data }]

function getBuffer(teacherId) {
    if (!replayBuffers[teacherId]) replayBuffers[teacherId] = [];
    return replayBuffers[teacherId];
}

function pushToBuffer(teacherId, data) {
    const id = ++eventIdCounter;
    const buf = getBuffer(teacherId);
    buf.push({ id, data });
    if (buf.length > MAX_REPLAY) buf.shift();  // keep ring buffer bounded
    return id;
}

function broadcastTo(teacherId, data) {
    const id = pushToBuffer(teacherId, data);
    const msg = `id: ${id}\ndata: ${JSON.stringify(data)}\n\n`;
    clients
        .filter(c => c.teacherId === teacherId)
        .forEach(c => { try { c.res.write(msg); } catch (_) {} });
}

// Heartbeat: send a comment ping every 30s to prevent proxies/LBs from
// closing idle SSE connections. Comments (lines starting with ':') are
// ignored by the EventSource API on the client side.
const heartbeatInterval = setInterval(() => {
    const ping = ': heartbeat\n\n';
    clients.forEach(c => { try { c.res.write(ping); } catch (_) {} });
}, 30_000);
heartbeatInterval.unref(); // don't block process exit

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
const SECTION_REGEX = /^[A-Z0-9-]+$/i;

function validateStudentFields(name, enrollment, section) {
    const n = (name || '').trim();
    const e = (enrollment || '').trim().toUpperCase();
    const s = (section || '').trim();
    if (!n) return { error: 'Name is required' };
    if (n.length > 100) return { error: 'Name must not exceed 100 characters' };
    if (!NAME_REGEX.test(n)) return { error: 'Name must contain letters and spaces only' };
    if (!e) return { error: 'Enrollment ID is required' };
    if (!ENROLLMENT_REGEX.test(e)) return { error: 'Invalid enrollment ID format. Expected format: ADTU/1/2023-26/BCAO/012' };
    if (s && !SECTION_REGEX.test(s)) return { error: 'Section can contain letters, numbers, and hyphens only (e.g. A, B, Sec-1)' };
    return { name: n, enrollment: e, section: s ? s.toUpperCase() : '' };
}

const server = http.createServer(async (req, res) => {
    try {
        const host = (req.headers && req.headers.host) ? req.headers.host : `localhost:${currentPort}`;
        const { pathname, searchParams } = new URL(req.url ?? '/', `http://${host}`);

        // --- static pages ---
        const pageRoutes = {
            '/': 'pages/auth/main.html',
            '/main': 'pages/auth/main.html',
            '/login': 'pages/auth/login.html',
            '/register': 'pages/auth/register-student.html', // default redirect
            '/register/student': 'pages/auth/register-student.html',
            '/register/teacher': 'pages/auth/register-teacher.html',
            '/reset-password': 'pages/auth/reset-password.html',
            '/student/dashboard': 'pages/student/dashboard.html',
            '/student.html': 'pages/student/dashboard.html',
            '/checkin.html': 'pages/student/dashboard.html',
            '/teacher/dashboard': 'pages/teacher/dashboard.html',
            '/admin.html': 'pages/teacher/dashboard.html',
            '/attendance-admin/dashboard': 'pages/attendance-admin/dashboard.html',
            '/attendance_admin.html': 'pages/attendance-admin/dashboard.html',
            '/student/profile': 'pages/student/profile.html',
            '/profile.html': 'pages/student/profile.html',
            '/profile': 'pages/student/profile.html'
        };
        
        if (req.method === 'GET' && pageRoutes[pathname]) {
            const file = pageRoutes[pathname];
            const headers = { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache, no-store, must-revalidate' };
            res.writeHead(200, headers);
            try {
                const htmlContent = (process.env.NODE_ENV === 'production' && staticCache.has(file))
                    ? staticCache.get(file)
                    : fs.readFileSync(path.join(__dirname, '../public', file));
                return res.end(htmlContent);
            } catch (e) {
                return send(res, 404, {error: 'Page not found'});
            }
        }

        // --- static CSS files ---
        if (req.method === 'GET' && (pathname.startsWith('/styles/') || pathname.startsWith('/scripts/'))) {
            try {
                const filePath = path.join(__dirname, '../public', pathname);
                const fileContent = fs.readFileSync(filePath);
                const mime = pathname.endsWith('.css') ? 'text/css' : 'application/javascript';
                res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache, must-revalidate' });
                return res.end(fileContent);
            } catch (err) {
                // Ignore missing file, fallback to 404 below
            }
        }

        
        // --- teacher registration ---
        if (req.method === 'POST' && pathname === '/api/register/teacher') {
            const body = await readBody(req);
            const { name, username, password } = body;
            
            if (!name || !username || !password) {
                return send(res, 400, { error: 'All fields are required.' });
            }
            
            const existing = await pool.query('SELECT 1 FROM teachers WHERE username = $1', [username]);
            if (existing.rows.length) {
                return send(res, 409, { error: 'Username already taken.' });
            }
            
            const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
            const tId = 'teacher-' + Date.now();
            
            await pool.query(
                'INSERT INTO teachers (id, name, username, password) VALUES ($1, $2, $3, $4)',
                [tId, name, username, hashed]
            );
            
            return send(res, 200, { ok: true });
        }

        // --- student registration ---
        if (req.method === 'POST' && pathname === '/api/register') {
            const body = await readBody(req);
            const v = validateStudentFields(body.name, body.enrollment, body.section);
            if (v.error) return send(res, 400, { error: v.error });
            
            const email = (body.email || '').trim().toLowerCase();
            const password = body.password || '';
            
            if (!email || !password) {
                return send(res, 400, { error: 'Email and password are required' });
            }

            const existing = await pool.query(
                'SELECT enrollment FROM students WHERE enrollment = $1 OR email = $2',
                [v.enrollment, email]
            );
            if (existing.rows.length) {
                return send(res, 409, { error: 'Student with this enrollment ID or Email is already registered' });
            }

            const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);

            await pool.query(
                'INSERT INTO students (enrollment, name, section, email, password) VALUES ($1, $2, $3, $4, $5)',
                [v.enrollment, v.name, v.section || '', email, hashed]
            );

            return send(res, 200, { ok: true, message: 'Student registered successfully' });
        }

        // --- student login ---
        if (req.method === 'POST' && pathname === '/api/student/login') {
            const { identifier, password } = await readBody(req);
            const id = (identifier || '').trim();
            if (!id || !password) return send(res, 400, { error: 'Identifier and password are required' });

            const checkR = await pool.query(
                'SELECT * FROM students WHERE (enrollment = $1 OR email = $1)',
                [id]
            );
            if (!checkR.rows.length) return send(res, 404, { error: 'Student not found' });

            const student = checkR.rows[0];
            if (!student.password) return send(res, 401, { error: 'Password not set for this account. Please register again or reset password.' });

            const match = await bcrypt.compare(password, student.password);
            if (!match) return send(res, 401, { error: 'Invalid password' });

            const token = jwt.sign({ type: 'student', enrollment: student.enrollment }, JWT_SECRET, { expiresIn: '7d' });
            return send(res, 200, { ok: true, token, enrollment: student.enrollment, name: student.name });
        }


        // --- student/teacher password reset confirm ---
        if (req.method === 'POST' && pathname === '/api/auth/reset-password-confirm') {
            const { token, newPassword } = await readBody(req);
            if (!token || !newPassword) return send(res, 400, { error: 'Token and password required' });
            if (!supabase) return send(res, 500, { error: 'Supabase configuration missing' });

            // Ask Supabase to verify the token and return the user
            const { data: { user }, error } = await supabase.auth.getUser(token);
            if (error || !user) return send(res, 401, { error: 'Invalid or expired reset token' });

            // We have the user's email. Hash the new password and update Postgres.
            const hashed = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
            
            const studentCheck = await pool.query('SELECT enrollment FROM students WHERE email = $1', [user.email]);
            const teacherCheck = await pool.query('SELECT id FROM teachers WHERE email = $1', [user.email]);
            
            if (studentCheck.rows.length) {
                await pool.query('UPDATE students SET password = $1 WHERE email = $2', [hashed, user.email]);
            } else if (teacherCheck.rows.length) {
                await pool.query('UPDATE teachers SET password = $1 WHERE email = $2', [hashed, user.email]);
            }

            // Optional: also update the auth.users table in Supabase so their Supabase account stays in sync
            // Since we have their token, we can temporarily set the session and update
            await supabase.auth.setSession({ access_token: token, refresh_token: '' });
            await supabase.auth.updateUser({ password: newPassword });
            
            return send(res, 200, { ok: true, message: 'Password updated' });
        }

        // --- get session info by token ---
        if (req.method === 'GET' && pathname === '/api/session-info') {
            const tok = searchParams.get('token') || '';
            const sessR = await pool.query('SELECT * FROM sessions WHERE active = true AND qr_token = $1', [tok]);
            if (!sessR.rows.length) return send(res, 404, { error: 'Session is inactive or QR code expired' });
            const session = sessR.rows[0];

            let resolvedSection = '';
            let resolvedSemester = '';
            if (session.subject_id) {
                const subjR = await pool.query('SELECT section, semester FROM subjects WHERE id = $1', [session.subject_id]);
                if (subjR.rows.length) {
                    if (subjR.rows[0].section) resolvedSection = subjR.rows[0].section;
                    if (subjR.rows[0].semester) resolvedSemester = subjR.rows[0].semester;
                }
            }

            return send(res, 200, {
                ok: true,
                subject: session.subject || 'Class Session',
                teacherName: session.teacher_name || 'Instructor',
                section: resolvedSection,
                semester: resolvedSemester
            });
        }

        // --- mark attendance ---
        if (req.method === 'POST' && pathname === '/api/mark') {
            const { enrollment, token } = await readBody(req);
            const normEnrollment = (enrollment || '').trim().toUpperCase();
            if (!normEnrollment) return send(res, 400, { error: 'enrollment is required' });
            if (!token) return send(res, 400, { error: 'missing QR token — scan the code again' });

            const sR = await pool.query(
                'SELECT enrollment, name, section FROM students WHERE enrollment = $1',
                [normEnrollment]
            );
            if (!sR.rows.length) return send(res, 404, { error: 'register first' });
            const student = sR.rows[0];

            const sessR = await pool.query(
                'SELECT id, teacher_id, teacher_name, subject, subject_id, qr_token FROM sessions WHERE active = true AND qr_token = $1',
                [token]
            );
            if (!sessR.rows.length) return send(res, 401, { error: 'QR code is invalid or expired' });
            const session = sessR.rows[0];

            // Auto-resolve section and semester from active teacher subject if student section is blank
            let resolvedSection = student.section || '';
            let resolvedSemester = '';
            if (session.subject_id) {
                const subjR = await pool.query('SELECT section, semester FROM subjects WHERE id = $1', [session.subject_id]);
                if (subjR.rows.length) {
                    if (!resolvedSection && subjR.rows[0].section) {
                        resolvedSection = subjR.rows[0].section;
                    }
                    if (subjR.rows[0].semester) {
                        resolvedSemester = subjR.rows[0].semester;
                    }
                }
            }

            const existingAtt = await pool.query(
                'SELECT id, time, section FROM attendance WHERE session_id = $1 AND enrollment = $2',
                [session.id, normEnrollment]
            );
            if (existingAtt.rows.length) {
                const existing = existingAtt.rows[0];
                return send(res, 200, {
                    ok: true,
                    already: true,
                    subject: session.subject || 'Class Session',
                    teacherName: session.teacher_name || 'Instructor',
                    time: existing.time.toISOString(),
                    section: existing.section || resolvedSection,
                    semester: resolvedSemester
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
                section: resolvedSection,
                semester: resolvedSemester
            });
        }

        // --- debug log ---
        if (req.method === 'POST' && pathname === '/api/debug-log') {
            const body = await readBody(req);
            console.log('DEBUG:', body);
            return send(res, 200, { ok: true });
        }

        // --- student: my attendance summary & leaderboard ---
        // --- student: my attendance summary & leaderboard ---
        if (req.method === 'GET' && pathname === '/api/my-attendance') {
            const enrollment = (searchParams.get('enrollment') || '').trim().toUpperCase();
            if (!enrollment) return send(res, 400, { error: 'enrollment is required' });

            // 1. Verify student exists
            const stCheck = await pool.query(
                'SELECT enrollment, name, section, avatar, about FROM students WHERE enrollment = $1',
                [enrollment]
            );
            if (!stCheck.rows.length) return send(res, 404, { error: 'Student not registered' });
            const currentStudent = stCheck.rows[0];
            const studentSection = currentStudent.section || '';

            // 2. Per-subject attendance breakdown — strictly filtered by subject_id
            const bySubjectRows = await pool.query(`
                SELECT
                    subj.id,
                    subj.name,
                    subj.code,
                    subj.department,
                    subj.section,
                    subj.semester,
                    COUNT(DISTINCT sess.id)::int                                          AS "totalHeld",
                    COUNT(DISTINCT CASE WHEN a.enrollment = $1 THEN a.session_id END)::int AS "attended",
                    MIN(sess.teacher_name)                                                 AS "teacherName"
                FROM subjects subj
                LEFT JOIN sessions sess
                    ON sess.subject_id = subj.id
                LEFT JOIN attendance a
                    ON a.session_id = sess.id
                WHERE (
                    ($2 != '' AND subj.section != '' AND subj.section = $2)
                    OR subj.section = ''
                    OR $2 = ''
                    OR EXISTS (
                        SELECT 1 FROM attendance att2
                        JOIN sessions s2 ON att2.session_id = s2.id
                        WHERE att2.enrollment = $1 AND s2.subject_id = subj.id
                    )
                )
                GROUP BY subj.id, subj.name, subj.code, subj.department, subj.section, subj.semester
                ORDER BY subj.name ASC
            `, [enrollment, studentSection]);

            let totalHeldOverall = 0;
            let totalAttendedOverall = 0;

            const bySubject = bySubjectRows.rows.map(row => {
                const totalHeld = row.totalHeld;
                const attended  = row.attended;
                const absent    = Math.max(0, totalHeld - attended);
                const percentage = totalHeld > 0 ? Math.round((attended / totalHeld) * 100) : 100;
                const isRedFlag  = totalHeld > 0 && percentage < 75;
                const classesToRecover = isRedFlag
                    ? Math.max(1, Math.ceil((0.75 * totalHeld - attended) / 0.25))
                    : 0;

                totalHeldOverall += totalHeld;
                totalAttendedOverall += attended;

                return {
                    id: row.id,
                    name: row.name,
                    code: row.code,
                    department: row.department,
                    section: row.section,
                    semester: row.semester || '',
                    teacherName: row.teacherName || 'Instructor',
                    totalHeld,
                    attended,
                    absent,
                    percentage,
                    isRedFlag,
                    classesToRecover
                };
            });

            // 3. Overall stats — strictly computed from the sum of the student's relevant subjects
            const overallAbsent = Math.max(0, totalHeldOverall - totalAttendedOverall);
            const overallPercentage = totalHeldOverall > 0
                ? Math.round((totalAttendedOverall / totalHeldOverall) * 100)
                : 100;
            const isOverallRedFlag = totalHeldOverall > 0 && overallPercentage < 75;
            const overallClassesToRecover = isOverallRedFlag
                ? Math.max(1, Math.ceil((0.75 * totalHeldOverall - totalAttendedOverall) / 0.25))
                : 0;

            // 4. Recent check-in history — with subjectId and code for subject filtering
            const recentRows = await pool.query(`
                SELECT
                    a.session_id AS "sessionId",
                    sess.subject_id AS "subjectId",
                    COALESCE(sub.name, sess.subject, 'Class Session') AS "subject",
                    COALESCE(sub.code, '') AS "code",
                    sess.teacher_name AS "teacherName",
                    a.time
                FROM attendance a
                JOIN sessions sess ON sess.id = a.session_id
                LEFT JOIN subjects sub ON sub.id = sess.subject_id
                WHERE a.enrollment = $1
                ORDER BY a.time DESC
                LIMIT 30
            `, [enrollment]);

            const recent = recentRows.rows.map(r => ({
                sessionId:   r.sessionId,
                subjectId:   r.subjectId || '',
                subject:     r.subject || 'Class Session',
                code:        r.code || '',
                teacherName: r.teacherName || 'Instructor',
                time:        r.time.toISOString()
            }));

            // 5. Leaderboard — students with >75% attendance, ranked by SQL
            const leaderboardRows = await pool.query(`
                SELECT
                    st.enrollment,
                    st.name,
                    st.section,
                    st.avatar,
                    COUNT(a.session_id)::int AS attended,
                    ${totalHeldOverall}      AS total
                FROM students st
                JOIN attendance a ON a.enrollment = st.enrollment
                GROUP BY st.enrollment, st.name, st.section, st.avatar
                HAVING ${totalHeldOverall} > 0
                    AND ROUND(COUNT(a.session_id)::numeric / ${totalHeldOverall} * 100) > 75
                ORDER BY attended DESC, st.name ASC
            `);

            const leaderboard = leaderboardRows.rows.map((s, idx) => ({
                rank:             idx + 1,
                name:             s.name,
                section:          s.section,
                avatar:           s.avatar || '',
                percentage:       totalHeldOverall > 0 ? Math.round((s.attended / totalHeldOverall) * 100) : 100,
                attended:         s.attended,
                total:            s.total,
                totalAttended:    s.attended,
                totalHeld:        s.total,
                isCurrentStudent: s.enrollment === enrollment
            }));

            return send(res, 200, {
                ok: true,
                profile: {
                    name:       currentStudent.name,
                    enrollment: currentStudent.enrollment,
                    section:    currentStudent.section,
                    avatar:     currentStudent.avatar || '',
                    about:      currentStudent.about  || ''
                },
                student: {
                    name:       currentStudent.name,
                    enrollment: currentStudent.enrollment,
                    section:    currentStudent.section,
                    avatar:     currentStudent.avatar || '',
                    about:      currentStudent.about  || ''
                },
                overall: {
                    totalHeld:        totalHeldOverall,
                    totalAttended:    totalAttendedOverall,
                    absent:           overallAbsent,
                    percentage:       overallPercentage,
                    isRedFlag:        isOverallRedFlag,
                    classesToRecover: overallClassesToRecover
                },
                bySubject,
                leaderboard,
                recent
            });
        }

        // --- student: update profile (avatar, about) ---
        if (req.method === 'POST' && pathname === '/api/student/profile') {
            const { enrollment, name, avatar, about } = await readBody(req);
            const normEnrollment = (enrollment || '').trim().toUpperCase();
            if (!normEnrollment) return send(res, 400, { error: 'enrollment is required' });

            const stCheck = await pool.query(
                'SELECT enrollment, name, section, avatar, about FROM students WHERE enrollment = $1',
                [normEnrollment]
            );
            if (!stCheck.rows.length) return send(res, 404, { error: 'Student not registered' });
            const current = stCheck.rows[0];

            const newName = name && name.trim() ? name.trim() : current.name;
            const newAvatar = avatar !== undefined ? avatar : (current.avatar || '');
            const newAbout = about !== undefined ? about : (current.about || '');

            const upd = await pool.query(
                'UPDATE students SET name = $1, avatar = $2, about = $3 WHERE enrollment = $4 RETURNING *',
                [newName, newAvatar, newAbout, normEnrollment]
            );
            const row = upd.rows[0];

            return send(res, 200, {
                ok: true,
                student: {
                    name: row.name,
                    enrollment: row.enrollment,
                    section: row.section,
                    avatar: row.avatar,
                    about: row.about
                }
            });
        }

        // --- frontend config ---
        if (req.method === 'GET' && pathname === '/api/config') {
            return send(res, 200, {
                url: process.env.SUPABASE_URL || 'https://hddezwltrmtxizbxuvvf.supabase.co',
                anonKey: process.env.SUPABASE_ANON_KEY || 'dummy-key-to-prevent-crash-until-configured'
            });
        }

        // --- supabase auth exchange ---
        if (req.method === 'POST' && pathname === '/api/auth/supabase-login') {
            const { access_token } = await readBody(req);
            if (!access_token || !supabase) return send(res, 400, { error: 'Missing token or Supabase not configured' });
            
            // Verify token with Supabase
            const { data: { user }, error } = await supabase.auth.getUser(access_token);
            if (error || !user || !user.email) {
                return send(res, 401, { error: 'Invalid Supabase token' });
            }

            const email = user.email;
            
            // 1. Check Attendance_Admin
            const saCheck = await pool.query('SELECT id, username FROM attendance_admins WHERE email = $1', [email]);
            if (saCheck.rows.length) {
                const admin = saCheck.rows[0];
                const token = signToken({ role: 'admin', adminId: admin.id, username: admin.username });
                return send(res, 200, { ok: true, role: 'admin', token, username: admin.username });
            }

            // 2. Check Teacher
            const tCheck = await pool.query('SELECT id, name FROM teachers WHERE email = $1', [email]);
            if (tCheck.rows.length) {
                const teacher = tCheck.rows[0];
                const token = signToken({ role: 'teacher', teacherId: teacher.id, teacherName: teacher.name });
                return send(res, 200, { ok: true, role: 'teacher', teacherId: teacher.id, teacherName: teacher.name, token });
            }

            // 3. Check Student
            const stCheck = await pool.query('SELECT enrollment, name FROM students WHERE email = $1', [email]);
            if (stCheck.rows.length) {
                const student = stCheck.rows[0];
                const token = signToken({ role: 'student', enrollment: student.enrollment });
                return send(res, 200, { ok: true, role: 'student', enrollment: student.enrollment, token });
            }

            // 4. Not found in any role -> send a special status to allow linking enrollment if they are a student
            return send(res, 200, { ok: true, role: 'unlinked_student', email });
        }

        // --- student enrollment linking ---
        if (req.method === 'POST' && pathname === '/api/student/link') {
            const { access_token, enrollment } = await readBody(req);
            if (!access_token || !enrollment || !supabase) return send(res, 400, { error: 'Missing required fields' });
            
            const { data: { user }, error } = await supabase.auth.getUser(access_token);
            if (error || !user || !user.email) return send(res, 401, { error: 'Invalid token' });

            // Check if enrollment exists
            const stCheck = await pool.query('SELECT enrollment FROM students WHERE enrollment = $1', [enrollment]);
            if (!stCheck.rows.length) return send(res, 404, { error: 'Enrollment ID not found' });
            
            // Ensure not already linked
            const existingLink = await pool.query('SELECT email FROM students WHERE enrollment = $1', [enrollment]);
            if (existingLink.rows[0].email) return send(res, 400, { error: 'Enrollment ID already linked to an account' });

            // Link
            await pool.query('UPDATE students SET email = $1 WHERE enrollment = $2', [user.email, enrollment]);
            const token = signToken({ role: 'student', enrollment });
            return send(res, 200, { ok: true, role: 'student', enrollment, token });
        }

        // --- check email existence ---
        if (req.method === 'GET' && pathname === '/api/student/check-email') {
            const email = searchParams.get('email');
            if (!email) return send(res, 400, { error: 'Email required' });
            const stCheck = await pool.query('SELECT enrollment FROM students WHERE email = $1', [email]);
            return send(res, 200, { registered: stCheck.rows.length > 0 });
        }

        // --- lookup email by enrollment ---
        if (req.method === 'GET' && pathname === '/api/student/lookup-email') {
            const enrollment = searchParams.get('enrollment');
            if (!enrollment) return send(res, 400, { error: 'Enrollment required' });
            const stCheck = await pool.query('SELECT email FROM students WHERE enrollment = $1', [enrollment.toUpperCase()]);
            if (stCheck.rows.length === 0) return send(res, 404, { error: 'Student not found' });
            return send(res, 200, { email: stCheck.rows[0].email });
        }

        // --- unified auth-and-mark for QR scanning ---
        if (req.method === 'POST' && pathname === '/api/student/auth-and-mark') {
            const { access_token, qr_token } = await readBody(req);
            if (!access_token || !supabase) return send(res, 400, { error: 'Missing required fields' });
            
            const { data: { user }, error } = await supabase.auth.getUser(access_token);
            if (error || !user || !user.email) return send(res, 401, { error: 'Invalid Supabase token' });

            // Validate QR session if provided
            let session = null;
            let resolvedSection = '';
            let resolvedSemester = '';
            if (qr_token) {
                const sessR = await pool.query('SELECT id, teacher_id, teacher_name, subject, subject_id, qr_token FROM sessions WHERE active = true AND qr_token = $1', [qr_token]);
                if (!sessR.rows.length) return send(res, 401, { error: 'QR code is invalid or expired' });
                session = sessR.rows[0];
            }

            // Check if student exists
            const stCheck = await pool.query('SELECT enrollment, name, section FROM students WHERE email = $1', [user.email]);
            if (!stCheck.rows.length) {
                return send(res, 200, { ok: true, require_registration: true, email: user.email });
            }

            const student = stCheck.rows[0];

            if (!session) {
                return send(res, 200, { ok: true, profile: student });
            }

            // Resolve subject info
            resolvedSection = student.section || '';
            if (session.subject_id) {
                const subjR = await pool.query('SELECT section, semester FROM subjects WHERE id = $1', [session.subject_id]);
                if (subjR.rows.length) {
                    if (!resolvedSection && subjR.rows[0].section) resolvedSection = subjR.rows[0].section;
                    if (subjR.rows[0].semester) resolvedSemester = subjR.rows[0].semester;
                }
            }

            // Check duplicate attendance
            const existingAtt = await pool.query(
                'SELECT id, time, section FROM attendance WHERE session_id = $1 AND enrollment = $2',
                [session.id, student.enrollment]
            );
            
            if (existingAtt.rows.length) {
                const existing = existingAtt.rows[0];
                return send(res, 200, {
                    ok: true, already: true, subject: session.subject || 'Class Session',
                    teacherName: session.teacher_name || 'Instructor',
                    time: existing.time.toISOString(), section: existing.section || resolvedSection,
                    semester: resolvedSemester
                });
            }

            // Insert attendance
            await pool.query(
                'INSERT INTO attendance (session_id, enrollment, name, section) VALUES ($1, $2, $3, $4)',
                [session.id, student.enrollment, student.name, resolvedSection]
            );

            return send(res, 200, {
                ok: true, already: false, subject: session.subject || 'Class Session',
                teacherName: session.teacher_name || 'Instructor',
                time: new Date().toISOString(), section: resolvedSection, semester: resolvedSemester
            });
        }

        // --- unified register-and-mark for QR scanning ---
        if (req.method === 'POST' && pathname === '/api/student/register-and-mark') {
            const { access_token, name, enrollment, qr_token } = await readBody(req);
            if (!access_token || !name || !enrollment || !supabase) return send(res, 400, { error: 'Missing required fields' });
            
            const v = validateStudentFields(name, enrollment, '');
            if (v.error) return send(res, 400, { error: v.error });
            
            const { data: { user }, error } = await supabase.auth.getUser(access_token);
            if (error || !user || !user.email) return send(res, 401, { error: 'Invalid Supabase token' });

            // Ensure enrollment not taken
            const existing = await pool.query('SELECT enrollment FROM students WHERE enrollment = $1', [v.enrollment]);
            if (existing.rows.length) return send(res, 409, { error: 'Student with this enrollment ID is already registered' });
            
            // Validate QR session if provided
            let session = null;
            let resolvedSection = '';
            let resolvedSemester = '';
            if (qr_token) {
                const sessR = await pool.query('SELECT id, teacher_id, teacher_name, subject, subject_id, qr_token FROM sessions WHERE active = true AND qr_token = $1', [qr_token]);
                if (!sessR.rows.length) return send(res, 401, { error: 'QR code is invalid or expired' });
                session = sessR.rows[0];
                
                if (session.subject_id) {
                    const subjR = await pool.query('SELECT section, semester FROM subjects WHERE id = $1', [session.subject_id]);
                    if (subjR.rows.length) {
                        if (subjR.rows[0].section) resolvedSection = subjR.rows[0].section;
                        if (subjR.rows[0].semester) resolvedSemester = subjR.rows[0].semester;
                    }
                }
            }

            // Create student record
            await pool.query(
                'INSERT INTO students (enrollment, name, section, avatar, about, email) VALUES ($1, $2, $3, $4, $5, $6)',
                [v.enrollment, v.name, resolvedSection, '', '', user.email]
            );

            if (!session) {
                return send(res, 200, { ok: true, profile: { name: v.name, enrollment: v.enrollment } });
            }

            // Mark attendance
            await pool.query(
                'INSERT INTO attendance (session_id, enrollment, name, section) VALUES ($1, $2, $3, $4)',
                [session.id, v.enrollment, v.name, resolvedSection]
            );

            return send(res, 200, {
                ok: true, already: false, subject: session.subject || 'Class Session',
                teacherName: session.teacher_name || 'Instructor',
                time: new Date().toISOString(), section: resolvedSection, semester: resolvedSemester
            });
        }

        // --- teacher auth ---
        if (req.method === 'POST' && pathname === '/api/login') {
            const { username, password } = await readBody(req);
            if (!username || !password) return send(res, 400, { error: 'Username and password required' });
            const r = await pool.query('SELECT id, name, password FROM teachers WHERE username = $1', [username]);
            if (!r.rows.length) return send(res, 401, { error: 'Invalid credentials' });
            const teacher = r.rows[0];
            const match = await bcrypt.compare(password, teacher.password);
            if (!match) return send(res, 401, { error: 'Invalid credentials' });
            const token = signToken({ role: 'teacher', teacherId: teacher.id, teacherName: teacher.name });
            return send(res, 200, { ok: true, teacherId: teacher.id, teacherName: teacher.name, token });
        }

        // --- teacher subjects: list ---
        if (req.method === 'GET' && pathname === '/api/teacher/subjects') {
            const auth = authenticate(req, res);
            if (!auth) return;
            const { teacherId } = auth;

            // Single SQL query: join subjects → sessions → attendance, strictly by subject_id
            const r = await pool.query(`
                SELECT
                    subj.id,
                    subj.name,
                    subj.code,
                    subj.department,
                    subj.section,
                    subj.semester,
                    subj.created_at,
                    COUNT(DISTINCT sess.id)::int                        AS "totalSessions",
                    COUNT(DISTINCT a.id)::int                           AS "totalPresent",
                    BOOL_OR(sess.active)                                AS "isActive",
                    MIN(CASE WHEN sess.active THEN sess.id END)         AS "activeSessionId"
                FROM subjects subj
                LEFT JOIN sessions sess
                    ON  sess.teacher_id = $1
                    AND sess.subject_id = subj.id
                LEFT JOIN attendance a ON a.session_id = sess.id
                WHERE subj.teacher_id = $1
                GROUP BY subj.id, subj.name, subj.code, subj.department, subj.section, subj.semester, subj.created_at
                ORDER BY subj.created_at ASC
            `, [teacherId]);

            const subjects = r.rows.map(s => ({
                id:              s.id,
                name:            s.name,
                code:            s.code,
                department:      s.department,
                section:         s.section,
                semester:        s.semester || '',
                createdAt:       s.created_at.toISOString(),
                totalSessions:   s.totalSessions,
                totalPresent:    s.totalPresent,
                isActive:        !!s.isActive,
                activeSessionId: s.activeSessionId ?? null
            }));

            return send(res, 200, subjects);
        }

        // --- teacher: subject attendance details & student roster ---
        if (req.method === 'GET' && pathname === '/api/teacher/subject-attendance') {
            const auth = authenticate(req, res);
            if (!auth) return;
            const { teacherId } = auth;
            const subjectId = (searchParams.get('subjectId') || '').trim();
            if (!subjectId) return send(res, 400, { error: 'subjectId is required' });

            const sCheck = await pool.query(
                'SELECT id, name, code, department, section, semester, created_at FROM subjects WHERE id = $1 AND teacher_id = $2',
                [subjectId, teacherId]
            );
            if (!sCheck.rows.length) return send(res, 404, { error: 'Subject not found' });
            const subject = sCheck.rows[0];

            // All sessions strictly for this subject
            const sessR = await pool.query(
                'SELECT id, subject, active, created_at FROM sessions WHERE subject_id = $1 ORDER BY id DESC',
                [subjectId]
            );
            const sessions = sessR.rows;
            const totalHeld = sessions.length;

            // Attendance roster strictly for this subject
            const attR = await pool.query(`
                SELECT
                    a.enrollment,
                    COALESCE(st.name, a.name)                           AS name,
                    COALESCE(st.section, a.section)                     AS section,
                    COUNT(DISTINCT a.session_id)::int                   AS attended,
                    MAX(a.time)                                         AS "lastAttended"
                FROM attendance a
                JOIN sessions s ON s.id = a.session_id
                LEFT JOIN students st ON st.enrollment = a.enrollment
                WHERE s.subject_id = $1
                GROUP BY a.enrollment, COALESCE(st.name, a.name), COALESCE(st.section, a.section)
                ORDER BY attended DESC, name ASC
            `, [subjectId]);

            const students = attR.rows.map(row => {
                const attended = row.attended;
                const absent = Math.max(0, totalHeld - attended);
                const percentage = totalHeld > 0 ? Math.round((attended / totalHeld) * 100) : 100;
                return {
                    enrollment: row.enrollment,
                    name: row.name,
                    section: row.section,
                    attended,
                    absent,
                    totalHeld,
                    percentage,
                    lastAttended: row.lastAttended ? row.lastAttended.toISOString() : null
                };
            });

            return send(res, 200, {
                ok: true,
                subject: {
                    id: subject.id,
                    name: subject.name,
                    code: subject.code,
                    department: subject.department,
                    section: subject.section,
                    semester: subject.semester || '',
                    createdAt: subject.created_at.toISOString()
                },
                totalHeld,
                sessions: sessions.map(s => ({
                    id: s.id,
                    subject: s.subject,
                    active: s.active,
                    createdAt: s.created_at.toISOString()
                })),
                students
            });
        }

        // --- teacher subjects: create ---
        if (req.method === 'POST' && pathname === '/api/teacher/subjects') {
            const auth = authenticate(req, res);
            if (!auth) return;
            const { teacherId } = auth;
            const { name, code, department, section, semester } = await readBody(req);

            const sName = (name || '').trim();
            const sCode = (code || '').trim().toUpperCase();
            const sDept = (department || '').trim().toUpperCase();
            const sSection = (section || '').trim().toUpperCase();
            const sSemester = (semester || '').trim();
            if (!sName) return send(res, 400, { error: 'Subject name is required' });

            const id = 'subj-' + nodeCrypto.randomUUID().slice(0, 8);
            const ins = await pool.query(
                'INSERT INTO subjects (id, teacher_id, name, code, department, section, semester, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, now()) RETURNING *',
                [id, teacherId, sName, sCode || 'GEN', sDept || 'GENERAL', sSection || '', sSemester]
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
                    semester: row.semester || '',
                    createdAt: row.created_at.toISOString()
                }
            });
        }

        // --- teacher subjects: edit ---
        if (req.method === 'POST' && pathname === '/api/teacher/subjects/edit') {
            const auth = authenticate(req, res);
            if (!auth) return;
            const { teacherId } = auth;
            const { subjectId, name, code, department, section, semester } = await readBody(req);

            const check = await pool.query('SELECT * FROM subjects WHERE id = $1 AND teacher_id = $2', [subjectId, teacherId]);
            if (!check.rows.length) return send(res, 404, { error: 'Subject not found' });

            const cur = check.rows[0];
            const newName = name && name.trim() ? name.trim() : cur.name;
            const newCode = code && code.trim() ? code.trim().toUpperCase() : cur.code;
            const newDept = department && department.trim() ? department.trim().toUpperCase() : cur.department;
            const newSec = section !== undefined ? (section || '').trim().toUpperCase() : cur.section;
            const newSem = semester !== undefined ? (semester || '').trim() : (cur.semester || '');

            const upd = await pool.query(
                'UPDATE subjects SET name = $1, code = $2, department = $3, section = $4, semester = $5 WHERE id = $6 AND teacher_id = $7 RETURNING *',
                [newName, newCode, newDept, newSec, newSem, subjectId, teacherId]
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
                    semester: row.semester || '',
                    createdAt: row.created_at.toISOString()
                }
            });
        }

        // --- teacher subjects: delete ---
        if (req.method === 'POST' && pathname === '/api/teacher/subjects/delete') {
            const auth = authenticate(req, res);
            if (!auth) return;
            const { teacherId } = auth;
            const { subjectId } = await readBody(req);
            const del = await pool.query('DELETE FROM subjects WHERE id = $1 AND teacher_id = $2', [subjectId, teacherId]);
            if (del.rowCount === 0) return send(res, 404, { error: 'Subject not found' });
            return send(res, 200, { ok: true });
        }

        // --- start session ---
        if (req.method === 'POST' && pathname === '/api/start-session') {
            const auth = authenticate(req, res);
            if (!auth) return;
            const { subject, subjectId } = await readBody(req);
            // Re-fetch teacher name from DB to ensure accuracy
            const tR = await pool.query('SELECT id, name FROM teachers WHERE id = $1', [auth.teacherId]);
            if (!tR.rows.length) return send(res, 401, { error: 'Teacher not found' });
            const teacher = tR.rows[0];

            // Close any previous active sessions for this teacher
            await pool.query('UPDATE sessions SET active = false, qr_token = NULL WHERE teacher_id = $1 AND active = true', [teacher.id]);

            let resolvedSubjectId = subjectId || null;
            let resolvedSubjectTitle = subject && subject.trim() ? subject.trim() : null;

            if (resolvedSubjectId) {
                const sCheck = await pool.query('SELECT * FROM subjects WHERE id = $1 AND teacher_id = $2', [resolvedSubjectId, teacher.id]);
                if (sCheck.rows.length) {
                    const sRow = sCheck.rows[0];
                    if (!resolvedSubjectTitle) {
                        resolvedSubjectTitle = `${sRow.code ? sRow.code + ' ' : ''}${sRow.name}${sRow.section ? ' (Sec ' + sRow.section + ')' : ''}`;
                    }
                } else {
                    resolvedSubjectId = null;
                }
            }
            if (!resolvedSubjectId && resolvedSubjectTitle) {
                // Try matching an existing subject for this teacher
                const sMatch = await pool.query(
                    'SELECT id FROM subjects WHERE teacher_id = $1 AND (name = $2 OR code || \' \' || name = $2 OR $2 LIKE \'%\' || name || \'%\') LIMIT 1',
                    [teacher.id, resolvedSubjectTitle]
                );
                if (sMatch.rows.length) {
                    resolvedSubjectId = sMatch.rows[0].id;
                } else {
                    // Auto-create a subject entry for this teacher
                    const newSubjId = 'subj-' + nodeCrypto.randomUUID().slice(0, 8);
                    await pool.query(
                        'INSERT INTO subjects (id, teacher_id, name, code, department, section, semester, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, now())',
                        [newSubjId, teacher.id, resolvedSubjectTitle, 'GEN', 'GENERAL', '', '']
                    );
                    resolvedSubjectId = newSubjId;
                }
            }

            const qrToken = nodeCrypto.randomBytes(32).toString('hex');
            const ins = await pool.query(
                'INSERT INTO sessions (teacher_id, teacher_name, subject, subject_id, qr_token, active, created_at) VALUES ($1, $2, $3, $4, $5, true, now()) RETURNING *',
                [teacher.id, teacher.name, resolvedSubjectTitle, resolvedSubjectId, qrToken]
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
            const auth = authenticate(req, res);
            if (!auth) return;
            const { teacherId } = auth;
            await pool.query('UPDATE sessions SET active = false, qr_token = NULL WHERE teacher_id = $1 AND active = true', [teacherId]);
            broadcastTo(teacherId, { type: 'closed' });
            return send(res, 200, { ok: true });
        }

        // --- delete session ---
        if (req.method === 'POST' && pathname === '/api/delete-session') {
            const auth = authenticate(req, res);
            if (!auth) return;
            const { teacherId } = auth;
            const { sessionId } = await readBody(req);
            const r = await pool.query('DELETE FROM sessions WHERE id = $1 AND teacher_id = $2', [Number(sessionId), teacherId]);
            if (r.rowCount === 0) return send(res, 404, { error: 'not found or not your session' });
            return send(res, 200, { ok: true });
        }

        // --- SSE stream ---
        // EventSource (browser) cannot send custom headers, so the JWT is passed as ?token=
        // The Last-Event-ID header is sent automatically by the browser on reconnect,
        // allowing us to replay any events the client missed during the disconnect.
        if (req.method === 'GET' && pathname === '/api/stream') {
            const qToken = searchParams.get('token') || '';
            let payload = null;
            try { payload = qToken ? jwt.verify(qToken, JWT_SECRET) : null; } catch (_) {}
            if (!payload || payload.role !== 'teacher') {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Authentication required.' }));
            }
            const { teacherId } = payload;
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no'   // disable Nginx buffering for SSE
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

            // Replay missed events if the client sends Last-Event-ID
            const lastId = Number(req.headers['last-event-id'] || 0);
            const initId = ++eventIdCounter;
            const initMsg = `id: ${initId}\ndata: ${JSON.stringify({ type: 'init', session: currentSession })}\n\n`;
            res.write(initMsg);

            if (lastId > 0) {
                const buf = getBuffer(teacherId);
                const missed = buf.filter(e => e.id > lastId);
                for (const e of missed) {
                    res.write(`id: ${e.id}\ndata: ${JSON.stringify(e.data)}\n\n`);
                }
            }

            clients.push({ res, teacherId });
            req.on('close', () => {
                clients = clients.filter(c => c.res !== res);
            });
            return;
        }

        // --- history ---
        if (req.method === 'GET' && pathname === '/api/history') {
            const auth = authenticate(req, res);
            if (!auth) return;
            const { teacherId } = auth;
            const subjectFilter = (searchParams.get('subject') || '').trim();
            const subjectIdFilter = (searchParams.get('subjectId') || '').trim();

            let query = `
                SELECT
                    s.id,
                    s.subject,
                    s.subject_id,
                    sub.code,
                    sub.section,
                    sub.semester,
                    s.created_at,
                    s.active,
                    COUNT(a.id)::int AS count
                FROM sessions s
                LEFT JOIN subjects sub ON sub.id = s.subject_id
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

            query += ` GROUP BY s.id, sub.code, sub.section, sub.semester ORDER BY s.id DESC`;

            const r = await pool.query(query, params);
            const mapped = r.rows.map(s => ({
                id: s.id,
                subject: s.subject,
                subjectId: s.subject_id,
                code: s.code || '',
                section: s.section || '',
                semester: s.semester || '',
                createdAt: s.created_at.toISOString(),
                count: s.count,
                active: s.active
            }));
            return send(res, 200, mapped);
        }

        // --- single session ---
        if (req.method === 'GET' && pathname === '/api/session') {
            const id = Number(searchParams.get('id'));
            const sessR = await pool.query(
                'SELECT id, teacher_id, teacher_name, subject, subject_id, qr_token, active, created_at FROM sessions WHERE id = $1',
                [id]
            );
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
            const sessR = await pool.query(
                'SELECT id, teacher_name, subject FROM sessions WHERE id = $1',
                [id]
            );
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

        // --- super-admin auth & management ---
        if (req.method === 'POST' && pathname === '/api/admin/login') {
            const { username, password } = await readBody(req);
            if (!username || !password) return send(res, 400, { error: 'Username or email and password required' });
            const r = await pool.query('SELECT id, username, password FROM attendance_admins WHERE username = $1 OR email = $1', [username]);
            if (!r.rows.length) return send(res, 401, { error: 'Invalid credentials' });
            const admin = r.rows[0];
            const match = await bcrypt.compare(password, admin.password);
            if (!match) return send(res, 401, { error: 'Invalid credentials' });
            const token = signToken({ role: 'admin', adminId: admin.id, username: admin.username });
            return send(res, 200, { ok: true, adminId: admin.id, username: admin.username, token });
        }

        if (req.method === 'GET' && pathname === '/api/admin/teachers') {
            if (!authenticateAdmin(req, res)) return;
            const r = await pool.query('SELECT id, name, username, email FROM teachers ORDER BY name ASC');
            return send(res, 200, r.rows);
        }

        if (req.method === 'POST' && pathname === '/api/admin/teachers') {
            if (!authenticateAdmin(req, res)) return;
            const { name, username, email, password } = await readBody(req);
            if (!name || !username || !password) return send(res, 400, { error: 'missing fields (name, username, password)' });

            const check = await pool.query('SELECT 1 FROM teachers WHERE username = $1 OR (email = $2 AND email IS NOT NULL)', [username, email || null]);
            if (check.rows.length) {
                return send(res, 409, { error: 'username or email already taken' });
            }

            const id = nodeCrypto.randomUUID();
            let hashedPassword = null;
            if (password) {
                hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
            } else {
                hashedPassword = await bcrypt.hash(nodeCrypto.randomUUID(), BCRYPT_ROUNDS);
            }
            await pool.query('INSERT INTO teachers (id, name, username, password, email) VALUES ($1, $2, $3, $4, $5)', [id, name, username, hashedPassword, email || null]);
            return send(res, 200, { ok: true, id });
        }

        if (req.method === 'POST' && pathname === '/api/admin/teachers/delete') {
            if (!authenticateAdmin(req, res)) return;
            const { id } = await readBody(req);
            await pool.query('DELETE FROM teachers WHERE id = $1', [id]);
            return send(res, 200, { ok: true });
        }

        if (req.method === 'POST' && pathname === '/api/admin/teachers/edit') {
            if (!authenticateAdmin(req, res)) return;
            const { id, name, username, email } = await readBody(req);
            if (!id) return send(res, 400, { error: 'ID is required' });
            if (!name || !username) return send(res, 400, { error: 'Name and Username are required' });
            
            const normalizedUsername = username.trim();
            const normalizedEmail = (email || '').trim().toLowerCase() || null;
            
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(
                    'UPDATE teachers SET name = $1, username = $2, email = $3 WHERE id = $4',
                    [name.trim(), normalizedUsername, normalizedEmail, id]
                );
                await client.query('COMMIT');
                return send(res, 200, { ok: true });
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(err);
                return send(res, 409, { error: 'Failed to update teacher. Username or email might be taken.' });
            } finally {
                client.release();
            }
        }

        if (req.method === 'POST' && pathname === '/api/admin/teachers/reset-password') {
            if (!authenticateAdmin(req, res)) return;
            const { email } = await readBody(req);
            if (!email) return send(res, 400, { error: 'Email is required' });
            if (!supabase) return send(res, 500, { error: 'Supabase is not configured' });
            
            const proto = req.headers['x-forwarded-proto'] || (req.headers.host.includes('localhost') ? 'http' : 'https');
            const redirectTo = `${proto}://${req.headers.host}/reset-password`;
            
            const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
            if (error) return send(res, 400, { error: error.message });
            return send(res, 200, { ok: true });
        }

        if (req.method === 'GET' && pathname === '/api/admin/students') {
            if (!authenticateAdmin(req, res)) return;
            const r = await pool.query('SELECT enrollment, name, section, email FROM students ORDER BY name ASC');
            return send(res, 200, r.rows);
        }

        if (req.method === 'POST' && pathname === '/api/admin/students/edit') {
            if (!authenticateAdmin(req, res)) return;
            const { oldEnrollment, name, enrollment, email } = await readBody(req);
            if (!oldEnrollment) return send(res, 400, { error: 'Old Enrollment is required' });
            
            const normalizedOld = oldEnrollment.trim().toUpperCase();
            const normalizedNew = (enrollment || '').trim().toUpperCase();
            const normalizedEmail = (email || '').trim().toLowerCase() || null;
            
            if (!normalizedNew) return send(res, 400, { error: 'Enrollment is required' });
            if (!name || !name.trim()) return send(res, 400, { error: 'Name is required' });

            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                
                await client.query(
                    'UPDATE students SET name = $1, enrollment = $2, email = $3 WHERE enrollment = $4',
                    [name.trim(), normalizedNew, normalizedEmail, normalizedOld]
                );
                
                if (normalizedOld !== normalizedNew) {
                    await client.query(
                        'UPDATE attendance SET enrollment = $1, name = $2 WHERE enrollment = $3',
                        [normalizedNew, name.trim(), normalizedOld]
                    );
                } else {
                    await client.query(
                        'UPDATE attendance SET name = $1 WHERE enrollment = $2',
                        [name.trim(), normalizedOld]
                    );
                }
                
                await client.query('COMMIT');
                return send(res, 200, { ok: true });
            } catch (e) {
                await client.query('ROLLBACK');
                console.error(e);
                return send(res, 409, { error: 'Failed to update student. Ensure enrollment and email are unique and not already taken.' });
            } finally {
                client.release();
            }
        }

        if (req.method === 'POST' && pathname === '/api/admin/students/delete') {
            if (!authenticateAdmin(req, res)) return;
            const { enrollment } = await readBody(req);
            if (!enrollment) return send(res, 400, { error: 'Enrollment is required' });
            await pool.query('DELETE FROM students WHERE enrollment = $1', [enrollment.trim().toUpperCase()]);
            return send(res, 200, { ok: true });
        }

        if (req.method === 'POST' && pathname === '/api/admin/students/reset-password') {
            if (!authenticateAdmin(req, res)) return;
            const { email } = await readBody(req);
            if (!email) return send(res, 400, { error: 'Email is required' });
            if (!supabase) return send(res, 500, { error: 'Supabase is not configured' });
            
            const proto = req.headers['x-forwarded-proto'] || (req.headers.host.includes('localhost') ? 'http' : 'https');
            const redirectTo = `${proto}://${req.headers.host}/reset-password`;
            
            const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
            if (error) return send(res, 400, { error: error.message });
            return send(res, 200, { ok: true });
        }

        if (req.method === 'POST' && pathname === '/api/admin/change-password') {
            const authPayload = authenticateAdmin(req, res);
            if (!authPayload) return;
            const { currentPassword, newPassword } = await readBody(req);
            if (!currentPassword || !newPassword) return send(res, 400, { error: 'Missing required fields' });
            const check = await pool.query('SELECT id, password FROM attendance_admins WHERE id = $1', [authPayload.adminId]);
            if (!check.rows.length) return send(res, 404, { error: 'Admin not found' });
            const matches = await bcrypt.compare(currentPassword, check.rows[0].password);
            if (!matches) return send(res, 401, { error: 'Current password incorrect' });
            const newHashed = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
            await pool.query('UPDATE attendance_admins SET password = $1 WHERE id = $2', [newHashed, authPayload.adminId]);
            return send(res, 200, { ok: true });
        }

        // --- edit student attendance ---
        if (req.method === 'POST' && /^\/api\/session\/\d+\/student\/edit$/.test(pathname)) {
            const auth = authenticate(req, res);
            if (!auth) return;
            const sessionId = Number(pathname.split('/')[3]);
            const { oldEnrollment, name, enrollment, section } = await readBody(req);

            const sessR = await pool.query(
                'SELECT teacher_id FROM sessions WHERE id = $1',
                [sessionId]
            );
            if (!sessR.rows.length) return send(res, 404, { error: 'Session not found' });
            if (sessR.rows[0].teacher_id !== auth.teacherId) return send(res, 403, { error: 'Not authorized to modify this session' });

            const v = validateStudentFields(name, enrollment, section);
            if (v.error) return send(res, 400, { error: v.error });
            const normalizedOld = (oldEnrollment || '').trim().toUpperCase();
            if (!normalizedOld) return send(res, 400, { error: 'Old enrollment ID is required' });

            const attR = await pool.query(
                'SELECT time FROM attendance WHERE session_id = $1 AND enrollment = $2',
                [sessionId, normalizedOld]
            );
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

            broadcastTo(auth.teacherId, {
                type: 'student-updated',
                oldEnrollment: normalizedOld,
                student: { name: v.name, enrollment: v.enrollment, section: v.section, time: originalTime.toISOString() }
            });
            return send(res, 200, { ok: true });
        }

        // --- delete student attendance ---
        if (req.method === 'POST' && /^\/api\/session\/\d+\/student\/delete$/.test(pathname)) {
            const auth = authenticate(req, res);
            if (!auth) return;
            const sessionId = Number(pathname.split('/')[3]);
            const { enrollment } = await readBody(req);

            const sessR = await pool.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
            if (!sessR.rows.length) return send(res, 404, { error: 'Session not found' });
            if (sessR.rows[0].teacher_id !== auth.teacherId) return send(res, 403, { error: 'Not authorized to modify this session' });

            const normalizedEnrollment = (enrollment || '').trim().toUpperCase();
            if (!normalizedEnrollment) return send(res, 400, { error: 'Enrollment ID is required' });

            const del = await pool.query('DELETE FROM attendance WHERE session_id = $1 AND enrollment = $2', [sessionId, normalizedEnrollment]);
            if (del.rowCount === 0) return send(res, 404, { error: 'Attendance record not found in this session' });

            broadcastTo(auth.teacherId, {
                type: 'student-deleted',
                enrollment: normalizedEnrollment
            });
            return send(res, 200, { ok: true });
        }

        // --- unified password reset confirmation ---
        if (req.method === 'POST' && pathname === '/api/auth/reset-password-confirm') {
            const { token, newPassword } = await readBody(req);
            if (!token || !newPassword) return send(res, 400, { error: 'Token and new password required' });
            if (!supabase) return send(res, 500, { error: 'Supabase is not configured' });
            
            // 1. Exchange the recovery token for an active Supabase session
            // Note: Since Supabase returns token in hash, usually the client calls supabase.auth.updateUser.
            // But since this is a server endpoint, we verify the user by updating auth.
            // Wait, Supabase provides supabase.auth.admin.updateUserById, but we just use updateUser if we have the session token.
            // Actually, the client passes the access_token. We can just use that token!
            const { data, error } = await supabase.auth.getUser(token);
            if (error || !data.user) {
                return send(res, 400, { error: 'Invalid or expired token.' });
            }
            
            const email = data.user.email;
            
            // Create a user-specific client using their token to update their password
            const userClient = require('@supabase/supabase-js').createClient(supabaseUrl, supabaseAnonKey, {
                global: { headers: { Authorization: `Bearer ${token}` } }
            });
            const { error: updateErr } = await userClient.auth.updateUser({ password: newPassword });
            if (updateErr) return send(res, 400, { error: updateErr.message });
            
            // Hash the password for our local PostgreSQL database
            const hashed = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
            
            // Try updating students first, then teachers
            const sRes = await pool.query('UPDATE students SET password = $1 WHERE email = $2', [hashed, email]);
            if (sRes.rowCount === 0) {
                const tRes = await pool.query('UPDATE teachers SET password = $1 WHERE email = $2', [hashed, email]);
                if (tRes.rowCount === 0) {
                    return send(res, 400, { error: 'Account not found for this email.' });
                }
            }
            
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
    server.once('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            const nextPort = port + 1;
            if (nextPort <= DEFAULT_PORT + MAX_PORT_ATTEMPTS) {
                console.log(`Port ${port} is busy. Trying ${nextPort} instead...`);
                // Close the server instance properly before trying again
                server.close(() => {
                    startServer(nextPort);
                });
                return;
            }
        }
        console.error('Fatal server error:', error);
        process.exit(1);
    });
    server.listen(port, () => console.log(`Attendance server running at: http://localhost:${port}`));
}

initDb()
    .then(() => startServer(DEFAULT_PORT))
    .catch(err => {
        console.error('Failed to initialize database:', err);
        process.exit(1);
    });