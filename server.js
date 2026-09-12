// PostgreSQL-backed attendance server for Render + Supabase. Run: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const nodeCrypto = require('crypto');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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
const DATABASE_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('FATAL: No DATABASE_URL or SUPABASE_DB_URL set in environment.'); process.exit(1); }

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-change-in-production';
const BCRYPT_ROUNDS = 10;

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,                    // max connections in pool
    idleTimeoutMillis: 30_000,  // close idle connections after 30s
    connectionTimeoutMillis: 5_000  // fail fast if pool is exhausted (5s)
});

// --- Static file cache ---
// Pre-load all HTML pages into memory at startup so disk I/O is paid once,
// not on every incoming request.
const STATIC_FILES = ['student.html', 'admin.html', 'superadmin.html', 'profile.html'];
const staticCache = new Map();
for (const file of STATIC_FILES) {
    try {
        staticCache.set(file, fs.readFileSync(path.join(__dirname, 'public', file)));
    } catch (_) {
        console.warn(`[static] Could not pre-load ${file}`);
    }
}
console.log(`[static] Pre-loaded ${staticCache.size} HTML file(s) into memory.`);

// --- Database Schema Initialization ---
async function initDb() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS superadmins (
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
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS students (
                enrollment TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                section TEXT DEFAULT '',
                avatar TEXT DEFAULT '',
                about TEXT DEFAULT ''
            );
            ALTER TABLE students ADD COLUMN IF NOT EXISTS avatar TEXT DEFAULT '';
            ALTER TABLE students ADD COLUMN IF NOT EXISTS about TEXT DEFAULT '';

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
            CREATE INDEX IF NOT EXISTS idx_sessions_qr_token    ON sessions (qr_token) WHERE qr_token IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_sessions_active      ON sessions (active)   WHERE active = true;
            CREATE INDEX IF NOT EXISTS idx_attendance_session   ON attendance (session_id);
            CREATE INDEX IF NOT EXISTS idx_attendance_enrollment ON attendance (enrollment);
            CREATE INDEX IF NOT EXISTS idx_subjects_teacher     ON subjects (teacher_id);
        `);
        console.log('Database indexes ensured.');

        // If superadmins table is completely empty, insert initial superadmin account
        const adminCheck = await pool.query('SELECT 1 FROM superadmins LIMIT 1');
        if (adminCheck.rows.length === 0) {
            const initialUser = process.env.SUPERADMIN_USER || 'admin';
            const initialPass = process.env.SUPERADMIN_PASS || 'admin123';
            const hashedPass = await bcrypt.hash(initialPass, BCRYPT_ROUNDS);
            await pool.query(
                'INSERT INTO superadmins (id, username, password) VALUES ($1, $2, $3)',
                ['admin-1', initialUser, hashedPass]
            );
            console.log(`Initial superadmin account initialized (${initialUser}) with hashed password.`);
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
        { table: 'superadmins', idCol: 'id' },
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
        if (req.method === 'GET' && ['/', '/student.html', '/checkin.html', '/profile.html', '/profile', '/admin.html', '/superadmin.html'].includes(pathname)) {
            let file = pathname === '/' ? 'student.html' : pathname.slice(1);
            if (file === 'profile') file = 'profile.html';
            if (file === 'checkin.html') file = 'student.html';
            const headers = { 'Content-Type': 'text/html' };
            if (file === 'student.html' || file === 'profile.html') headers['Cache-Control'] = 'no-store';
            res.writeHead(200, headers);
            return res.end(staticCache.get(file) ?? fs.readFileSync(path.join(__dirname, 'public', file)));
        }

        // --- student registration ---
        if (req.method === 'POST' && pathname === '/api/register') {
            const body = await readBody(req);
            const v = validateStudentFields(body.name, body.enrollment, body.section);
            if (v.error) return send(res, 400, { error: v.error });

            const existing = await pool.query(
                'SELECT enrollment, name, section, avatar, about FROM students WHERE enrollment = $1',
                [v.enrollment]
            );
            if (existing.rows.length) {
                const st = existing.rows[0];
                return send(res, 409, { error: 'Student with this enrollment ID is already registered', student: st });
            }

            await pool.query(
                'INSERT INTO students (enrollment, name, section, avatar, about) VALUES ($1, $2, $3, $4, $5)',
                [v.enrollment, v.name, v.section || '', body.avatar || '', body.about || '']
            );

            return send(res, 200, { ok: true, student: { name: v.name, enrollment: v.enrollment, section: v.section || '', avatar: body.avatar || '', about: body.about || '' } });
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

            // Auto-resolve section from active teacher subject if student section is blank
            let resolvedSection = student.section || '';
            if (!resolvedSection && session.subject_id) {
                const subjR = await pool.query('SELECT section FROM subjects WHERE id = $1', [session.subject_id]);
                if (subjR.rows.length && subjR.rows[0].section) {
                    resolvedSection = subjR.rows[0].section;
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

            // 2. Per-subject attendance breakdown — all done in SQL
            const bySubjectRows = await pool.query(`
                SELECT
                    subj.id,
                    subj.name,
                    subj.code,
                    subj.department,
                    subj.section,
                    COUNT(DISTINCT sess.id)::int                                          AS "totalHeld",
                    COUNT(DISTINCT CASE WHEN a.enrollment = $1 THEN a.session_id END)::int AS "attended",
                    MIN(sess.teacher_name)                                                 AS "teacherName"
                FROM subjects subj
                LEFT JOIN sessions sess
                    ON sess.subject_id = subj.id
                    OR sess.subject    = subj.name
                    OR sess.subject    = subj.code || ' ' || subj.name
                LEFT JOIN attendance a
                    ON a.session_id = sess.id
                GROUP BY subj.id, subj.name, subj.code, subj.department, subj.section
                ORDER BY subj.name ASC
            `, [enrollment]);

            const bySubject = bySubjectRows.rows.map(row => {
                const totalHeld = row.totalHeld;
                const attended  = row.attended;
                const percentage = totalHeld > 0 ? Math.round((attended / totalHeld) * 100) : 100;
                const isRedFlag  = totalHeld > 0 && percentage < 75;
                const classesToRecover = isRedFlag
                    ? Math.max(1, Math.ceil((0.75 * totalHeld - attended) / 0.25))
                    : 0;
                return {
                    id: row.id,
                    name: row.name,
                    code: row.code,
                    department: row.department,
                    section: row.section,
                    teacherName: row.teacherName || 'Instructor',
                    totalHeld,
                    attended,
                    percentage,
                    isRedFlag,
                    classesToRecover
                };
            });

            // 3. Overall stats — single aggregated query
            const overallRow = await pool.query(`
                SELECT
                    COUNT(DISTINCT sess.id)::int                                          AS "totalHeld",
                    COUNT(DISTINCT CASE WHEN a.enrollment = $1 THEN a.session_id END)::int AS "totalAttended"
                FROM sessions sess
                LEFT JOIN attendance a ON a.session_id = sess.id
            `, [enrollment]);

            const totalHeldOverall     = overallRow.rows[0].totalHeld;
            const totalAttendedOverall = overallRow.rows[0].totalAttended;
            const overallPercentage    = totalHeldOverall > 0
                ? Math.round((totalAttendedOverall / totalHeldOverall) * 100)
                : 100;
            const isOverallRedFlag     = totalHeldOverall > 0 && overallPercentage < 75;
            const overallClassesToRecover = isOverallRedFlag
                ? Math.max(1, Math.ceil((0.75 * totalHeldOverall - totalAttendedOverall) / 0.25))
                : 0;

            // 4. Recent check-in history — sorted & limited in SQL
            const recentRows = await pool.query(`
                SELECT a.session_id AS "sessionId", sess.subject, sess.teacher_name AS "teacherName", a.time
                FROM attendance a
                JOIN sessions sess ON sess.id = a.session_id
                WHERE a.enrollment = $1
                ORDER BY a.time DESC
                LIMIT 15
            `, [enrollment]);

            const recent = recentRows.rows.map(r => ({
                sessionId:   r.sessionId,
                subject:     r.subject || 'Class Session',
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

            // Single SQL query: join subjects → sessions → attendance, aggregate in DB
            const r = await pool.query(`
                SELECT
                    subj.id,
                    subj.name,
                    subj.code,
                    subj.department,
                    subj.section,
                    subj.created_at,
                    COUNT(DISTINCT sess.id)::int                        AS "totalSessions",
                    COUNT(DISTINCT a.id)::int                           AS "totalPresent",
                    BOOL_OR(sess.active)                                AS "isActive",
                    MIN(CASE WHEN sess.active THEN sess.id END)         AS "activeSessionId"
                FROM subjects subj
                LEFT JOIN sessions sess
                    ON  sess.teacher_id = $1
                    AND (sess.subject_id = subj.id
                         OR sess.subject  = subj.name
                         OR sess.subject  = subj.code || ' ' || subj.name)
                LEFT JOIN attendance a ON a.session_id = sess.id
                WHERE subj.teacher_id = $1
                GROUP BY subj.id, subj.name, subj.code, subj.department, subj.section, subj.created_at
                ORDER BY subj.created_at ASC
            `, [teacherId]);

            const subjects = r.rows.map(s => ({
                id:              s.id,
                name:            s.name,
                code:            s.code,
                department:      s.department,
                section:         s.section,
                createdAt:       s.created_at.toISOString(),
                totalSessions:   s.totalSessions,
                totalPresent:    s.totalPresent,
                isActive:        !!s.isActive,
                activeSessionId: s.activeSessionId ?? null
            }));

            return send(res, 200, subjects);
        }

        // --- teacher subjects: create ---
        if (req.method === 'POST' && pathname === '/api/teacher/subjects') {
            const auth = authenticate(req, res);
            if (!auth) return;
            const { teacherId } = auth;
            const { name, code, department, section } = await readBody(req);

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
            const auth = authenticate(req, res);
            if (!auth) return;
            const { teacherId } = auth;
            const { subjectId, name, code, department, section } = await readBody(req);

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
            if (!username || !password) return send(res, 400, { error: 'Username and password required' });
            const r = await pool.query('SELECT id, username, password FROM superadmins WHERE username = $1', [username]);
            if (!r.rows.length) return send(res, 401, { error: 'Invalid credentials' });
            const admin = r.rows[0];
            const match = await bcrypt.compare(password, admin.password);
            if (!match) return send(res, 401, { error: 'Invalid credentials' });
            const token = signToken({ role: 'admin', adminId: admin.id, username: admin.username });
            return send(res, 200, { ok: true, adminId: admin.id, username: admin.username, token });
        }

        if (req.method === 'GET' && pathname === '/api/admin/teachers') {
            if (!authenticateAdmin(req, res)) return;
            const r = await pool.query('SELECT id, name, username FROM teachers ORDER BY name ASC');
            return send(res, 200, r.rows);
        }

        if (req.method === 'POST' && pathname === '/api/admin/teachers') {
            if (!authenticateAdmin(req, res)) return;
            const { name, username, password } = await readBody(req);
            if (!name || !username || !password) return send(res, 400, { error: 'missing fields' });

            const check = await pool.query('SELECT 1 FROM teachers WHERE username = $1', [username]);
            if (check.rows.length) {
                return send(res, 409, { error: 'username taken' });
            }

            const id = nodeCrypto.randomUUID();
            const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
            await pool.query('INSERT INTO teachers (id, name, username, password) VALUES ($1, $2, $3, $4)', [id, name, username, hashedPassword]);
            return send(res, 200, { ok: true, id });
        }

        if (req.method === 'POST' && pathname === '/api/admin/teachers/delete') {
            if (!authenticateAdmin(req, res)) return;
            const { id } = await readBody(req);
            await pool.query('DELETE FROM teachers WHERE id = $1', [id]);
            return send(res, 200, { ok: true });
        }

        if (req.method === 'GET' && pathname === '/api/admin/students') {
            if (!authenticateAdmin(req, res)) return;
            const r = await pool.query('SELECT enrollment, name, section FROM students ORDER BY name ASC');
            return send(res, 200, r.rows);
        }

        if (req.method === 'POST' && pathname === '/api/admin/students/delete') {
            if (!authenticateAdmin(req, res)) return;
            const { enrollment } = await readBody(req);
            if (!enrollment) return send(res, 400, { error: 'Enrollment is required' });
            await pool.query('DELETE FROM students WHERE enrollment = $1', [enrollment.trim().toUpperCase()]);
            return send(res, 200, { ok: true });
        }

        if (req.method === 'POST' && pathname === '/api/admin/change-password') {
            const authPayload = authenticateAdmin(req, res);
            if (!authPayload) return;
            const { currentPassword, newPassword } = await readBody(req);
            if (!currentPassword || !newPassword) return send(res, 400, { error: 'Missing required fields' });
            const check = await pool.query('SELECT id, password FROM superadmins WHERE id = $1', [authPayload.adminId]);
            if (!check.rows.length) return send(res, 404, { error: 'Admin not found' });
            const matches = await bcrypt.compare(currentPassword, check.rows[0].password);
            if (!matches) return send(res, 401, { error: 'Current password incorrect' });
            const newHashed = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
            await pool.query('UPDATE superadmins SET password = $1 WHERE id = $2', [newHashed, authPayload.adminId]);
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