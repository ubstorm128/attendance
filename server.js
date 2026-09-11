// Local JSON-backed attendance server. Run: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const nodeCrypto = require('crypto');

const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const MAX_PORT_ATTEMPTS = 10;
let currentPort = DEFAULT_PORT;
const SUPERADMIN_USER = process.env.SUPERADMIN_USER || 'admin';
const SUPERADMIN_PASS = process.env.SUPERADMIN_PASS || 'admin123';

const DATA_FILE = path.join(__dirname, 'data.json');

// In-memory data store with JSON file persistence
let db = {
    teachers: {},
    students: {},
    sessions: [],
    nextSessionId: 1
};

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            if (raw.trim()) {
                db = JSON.parse(raw);
            }
        }
    } catch (e) {
        console.error('Warning: could not read data.json, starting with clean store:', e.message);
    }
    if (!db.teachers) db.teachers = {};
    if (!db.students) db.students = {};
    if (!db.sessions) db.sessions = [];
    if (!db.nextSessionId) db.nextSessionId = 1;

    // Ensure default teacher exists if teachers map is empty
    if (Object.keys(db.teachers).length === 0) {
        const defaultId = 'teacher-default-1';
        db.teachers[defaultId] = {
            id: defaultId,
            name: 'Wanraplang Nongbri',
            username: 'WanraplangNongbri',
            password: 'teacher001',
            subjects: [
                { id: 'subj-1', name: 'Data Structures & Algorithms', code: 'CS-204', department: 'CSE', section: 'A', createdAt: new Date().toISOString() },
                { id: 'subj-2', name: 'Database Management Systems', code: 'CS-301', department: 'CSE', section: 'B', createdAt: new Date().toISOString() },
                { id: 'subj-3', name: 'Web Technology & Design', code: 'IT-102', department: 'IT', section: 'A', createdAt: new Date().toISOString() }
            ]
        };
        saveData();
    } else {
        let modified = false;
        for (const t of Object.values(db.teachers)) {
            if (!t.subjects || t.subjects.length === 0) {
                t.subjects = [
                    { id: 'subj-1', name: 'Data Structures & Algorithms', code: 'CS-204', department: 'CSE', section: 'A', createdAt: new Date().toISOString() },
                    { id: 'subj-2', name: 'Database Management Systems', code: 'CS-301', department: 'CSE', section: 'B', createdAt: new Date().toISOString() },
                    { id: 'subj-3', name: 'Web Technology & Design', code: 'IT-102', department: 'IT', section: 'A', createdAt: new Date().toISOString() }
                ];
                modified = true;
            }
        }
        if (modified) saveData();
    }
}

function saveData() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving data.json:', e);
    }
}

loadData();

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

function activeSessionFor(teacherId) {
    return db.sessions.slice().reverse().find(s => s.teacherId === teacherId && s.active) || null;
}

function formatSession(s) {
    if (!s) return null;
    return {
        id: s.id,
        teacherId: s.teacherId,
        teacherName: s.teacherName,
        subject: s.subject,
        subjectId: s.subjectId || null,
        qrToken: s.qrToken,
        present: s.present || {},
        createdAt: s.createdAt,
        active: s.active
    };
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

            if (db.students[v.enrollment]) {
                return send(res, 409, { error: 'Student with this enrollment ID is already registered' });
            }

            db.students[v.enrollment] = {
                name: v.name,
                enrollment: v.enrollment,
                section: v.section || ''
            };
            saveData();
            return send(res, 200, { ok: true, student: db.students[v.enrollment] });
        }

        // --- get session info by token ---
        if (req.method === 'GET' && pathname === '/api/session-info') {
            const tok = searchParams.get('token') || '';
            const session = db.sessions.find(s => s.active && s.qrToken === tok);
            if (!session) return send(res, 404, { error: 'Session is inactive or QR code expired' });

            let resolvedSection = '';
            if (session.subjectId) {
                const teacher = db.teachers[session.teacherId];
                if (teacher && teacher.subjects) {
                    const subj = teacher.subjects.find(s => s.id === session.subjectId);
                    if (subj && subj.section) resolvedSection = subj.section;
                }
            }

            return send(res, 200, {
                ok: true,
                subject: session.subject || 'Class Session',
                teacherName: session.teacherName || 'Instructor',
                section: resolvedSection
            });
        }

        // --- mark attendance ---
        if (req.method === 'POST' && pathname === '/api/mark') {
            const { enrollment, token } = await readBody(req);
            const normEnrollment = (enrollment || '').trim().toUpperCase();
            const student = db.students[normEnrollment];
            if (!student) return send(res, 404, { error: 'register first' });
            if (!token) return send(res, 400, { error: 'missing QR token — scan the code again' });

            const session = db.sessions.find(s => s.active && s.qrToken === token);
            if (!session) return send(res, 401, { error: 'QR code is invalid or expired' });

            if (!session.present) session.present = {};

            // Auto-resolve section from active teacher subject if student section is blank
            let resolvedSection = student.section || '';
            if (!resolvedSection && session.subjectId) {
                const teacher = db.teachers[session.teacherId];
                if (teacher && teacher.subjects) {
                    const subj = teacher.subjects.find(s => s.id === session.subjectId);
                    if (subj && subj.section) resolvedSection = subj.section;
                }
            }

            if (session.present[normEnrollment]) {
                const existing = session.present[normEnrollment];
                return send(res, 200, {
                    ok: true,
                    already: true,
                    subject: session.subject || 'Class Session',
                    teacherName: session.teacherName || 'Instructor',
                    time: existing.time,
                    section: existing.section || resolvedSection
                });
            }

            const timeStr = new Date().toISOString();
            const record = {
                name: student.name,
                enrollment: student.enrollment,
                section: resolvedSection,
                time: timeStr
            };
            session.present[normEnrollment] = record;
            saveData();

            broadcastTo(session.teacherId, {
                type: 'mark',
                student: record
            });
            return send(res, 200, {
                ok: true,
                already: false,
                subject: session.subject || 'Class Session',
                teacherName: session.teacherName || 'Instructor',
                time: timeStr,
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

            if (!db.students[enrollment]) {
                return send(res, 404, { error: 'Student not registered' });
            }

            const map = {};
            const recent = [];

            for (const s of db.sessions) {
                const subKey = s.subject || 'No subject';
                if (!map[subKey]) {
                    map[subKey] = {
                        subject: subKey,
                        teacherName: s.teacherName || 'Instructor',
                        totalSessions: 0,
                        presentSessions: 0
                    };
                }
                map[subKey].totalSessions++;

                if (s.present && s.present[enrollment]) {
                    map[subKey].presentSessions++;
                    recent.push({
                        subject: s.subject || 'No subject',
                        teacherName: s.teacherName || 'Instructor',
                        time: s.present[enrollment].time
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
            const teacher = Object.values(db.teachers).find(t => t.username === username && t.password === password);
            if (!teacher) return send(res, 401, { error: 'invalid credentials' });
            return send(res, 200, { ok: true, teacherId: teacher.id, teacherName: teacher.name });
        }

        // --- teacher subjects: list ---
        if (req.method === 'GET' && pathname === '/api/teacher/subjects') {
            const teacherId = searchParams.get('teacherId') || '';
            const teacher = db.teachers[teacherId];
            if (!teacher) return send(res, 401, { error: 'not logged in' });

            const subjects = (teacher.subjects || []).map(s => {
                const matchingSessions = db.sessions.filter(sess => 
                    sess.teacherId === teacherId && 
                    (sess.subjectId === s.id || sess.subject === s.name || sess.subject === `${s.code} ${s.name}`)
                );
                const activeSession = matchingSessions.find(sess => sess.active);
                const totalPresent = matchingSessions.reduce((acc, sess) => acc + Object.keys(sess.present || {}).length, 0);
                
                return {
                    ...s,
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
            const teacher = db.teachers[teacherId];
            if (!teacher) return send(res, 401, { error: 'not logged in' });

            const sName = (name || '').trim();
            const sCode = (code || '').trim().toUpperCase();
            const sDept = (department || '').trim().toUpperCase();
            const sSection = (section || '').trim().toUpperCase();
            if (!sName) return send(res, 400, { error: 'Subject name is required' });

            if (!teacher.subjects) teacher.subjects = [];
            const id = 'subj-' + nodeCrypto.randomUUID().slice(0, 8);
            const newSubj = {
                id,
                name: sName,
                code: sCode || 'GEN',
                department: sDept || 'GENERAL',
                section: sSection || '',
                createdAt: new Date().toISOString()
            };
            teacher.subjects.push(newSubj);
            saveData();
            return send(res, 200, { ok: true, subject: newSubj });
        }

        // --- teacher subjects: edit ---
        if (req.method === 'POST' && pathname === '/api/teacher/subjects/edit') {
            const { teacherId, subjectId, name, code, department, section } = await readBody(req);
            const teacher = db.teachers[teacherId];
            if (!teacher) return send(res, 401, { error: 'not logged in' });

            const subj = (teacher.subjects || []).find(s => s.id === subjectId);
            if (!subj) return send(res, 404, { error: 'Subject not found' });

            if (name && name.trim()) subj.name = name.trim();
            if (code && code.trim()) subj.code = code.trim().toUpperCase();
            if (department && department.trim()) subj.department = department.trim().toUpperCase();
            if (section !== undefined) subj.section = (section || '').trim().toUpperCase();
            saveData();
            return send(res, 200, { ok: true, subject: subj });
        }

        // --- teacher subjects: delete ---
        if (req.method === 'POST' && pathname === '/api/teacher/subjects/delete') {
            const { teacherId, subjectId } = await readBody(req);
            const teacher = db.teachers[teacherId];
            if (!teacher) return send(res, 401, { error: 'not logged in' });

            const idx = (teacher.subjects || []).findIndex(s => s.id === subjectId);
            if (idx === -1) return send(res, 404, { error: 'Subject not found' });

            teacher.subjects.splice(idx, 1);
            saveData();
            return send(res, 200, { ok: true });
        }

        // --- start session ---
        if (req.method === 'POST' && pathname === '/api/start-session') {
            const { teacherId, subject, subjectId } = await readBody(req);
            const teacher = db.teachers[teacherId];
            if (!teacher) return send(res, 401, { error: 'not logged in' });

            // Close any previous active sessions for this teacher
            const prev = activeSessionFor(teacher.id);
            if (prev) {
                prev.active = false;
                prev.qrToken = null;
            }

            const qrToken = nodeCrypto.randomBytes(32).toString('hex');
            const subjectVal = subject && subject.trim() ? subject.trim() : null;

            const session = {
                id: db.nextSessionId++,
                teacherId: teacher.id,
                teacherName: teacher.name,
                subject: subjectVal,
                subjectId: subjectId || null,
                qrToken,
                present: {},
                createdAt: new Date().toISOString(),
                active: true
            };

            db.sessions.push(session);
            saveData();

            broadcastTo(teacher.id, {
                type: 'new-session',
                session: formatSession(session)
            });

            return send(res, 200, { qrToken: session.qrToken, sessionId: session.id });
        }

        // --- close session ---
        if (req.method === 'POST' && pathname === '/api/close-session') {
            const { teacherId } = await readBody(req);
            const session = activeSessionFor(teacherId);
            if (session) {
                session.active = false;
                session.qrToken = null;
                saveData();
                broadcastTo(teacherId, { type: 'closed' });
            }
            return send(res, 200, { ok: true });
        }

        // --- delete session ---
        if (req.method === 'POST' && pathname === '/api/delete-session') {
            const { teacherId, sessionId } = await readBody(req);
            const idx = db.sessions.findIndex(s => s.id === Number(sessionId));
            if (idx === -1) return send(res, 404, { error: 'not found' });
            if (db.sessions[idx].teacherId !== teacherId) return send(res, 403, { error: 'not your session' });

            db.sessions.splice(idx, 1);
            saveData();
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
            const current = activeSessionFor(teacherId);
            res.write(`data: ${JSON.stringify({ type: 'init', session: formatSession(current) })}\n\n`);
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

            let list = db.sessions.filter(s => s.teacherId === teacherId);
            if (subjectIdFilter) {
                list = list.filter(s => s.subjectId === subjectIdFilter);
            } else if (subjectFilter) {
                list = list.filter(s => s.subject === subjectFilter || s.subjectId === subjectFilter);
            }

            const mapped = list.sort((a, b) => b.id - a.id).map(s => ({
                id: s.id,
                subject: s.subject,
                subjectId: s.subjectId || null,
                createdAt: s.createdAt,
                count: Object.keys(s.present || {}).length,
                active: s.active
            }));
            return send(res, 200, mapped);
        }

        // --- single session ---
        if (req.method === 'GET' && pathname === '/api/session') {
            const id = Number(searchParams.get('id'));
            const session = db.sessions.find(s => s.id === id);
            if (!session) return send(res, 404, { error: 'not found' });
            return send(res, 200, formatSession(session));
        }

        // --- export csv ---
        if (req.method === 'GET' && pathname === '/api/export') {
            const id = Number(searchParams.get('id'));
            const session = db.sessions.find(s => s.id === id);
            if (!session) return send(res, 404, { error: 'not found' });
            const rows = sortStudentsByEnrollment(Object.values(session.present || {}));
            res.writeHead(200, {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="${safeFilename(session.teacherName, session.subject, session.id)}"`
            });
            return res.end(toCsv(session.subject, rows));
        }

        // --- super-admin ---
        if (req.method === 'POST' && pathname === '/api/admin/login') {
            const { username, password } = await readBody(req);
            return send(res, username === SUPERADMIN_USER && password === SUPERADMIN_PASS ? 200 : 401, { ok: true });
        }

        if (req.method === 'GET' && pathname === '/api/admin/teachers') {
            const list = Object.values(db.teachers)
                .map(({ password, ...rest }) => rest)
                .sort((a, b) => a.name.localeCompare(b.name));
            return send(res, 200, list);
        }

        if (req.method === 'POST' && pathname === '/api/admin/teachers') {
            const { name, username, password } = await readBody(req);
            if (!name || !username || !password) return send(res, 400, { error: 'missing fields' });
            if (Object.values(db.teachers).some(t => t.username === username)) {
                return send(res, 409, { error: 'username taken' });
            }
            const id = nodeCrypto.randomUUID();
            db.teachers[id] = { id, name, username, password };
            saveData();
            return send(res, 200, { ok: true, id });
        }

        if (req.method === 'POST' && pathname === '/api/admin/teachers/delete') {
            const { id } = await readBody(req);
            delete db.teachers[id];
            saveData();
            return send(res, 200, { ok: true });
        }

        // --- edit student attendance ---
        if (req.method === 'POST' && /^\/api\/session\/\d+\/student\/edit$/.test(pathname)) {
            const sessionId = Number(pathname.split('/')[3]);
            const { teacherId: reqTeacherId, oldEnrollment, name, enrollment, section } = await readBody(req);

            const teacher = db.teachers[reqTeacherId];
            if (!teacher) return send(res, 401, { error: 'Not authenticated' });

            const session = db.sessions.find(s => s.id === sessionId);
            if (!session) return send(res, 404, { error: 'Session not found' });
            if (session.teacherId !== teacher.id) return send(res, 403, { error: 'Not authorized to modify this session' });

            const v = validateStudentFields(name, enrollment, section);
            if (v.error) return send(res, 400, { error: v.error });
            const normalizedOld = (oldEnrollment || '').trim().toUpperCase();
            if (!normalizedOld) return send(res, 400, { error: 'Old enrollment ID is required' });

            if (!session.present || !session.present[normalizedOld]) {
                return send(res, 404, { error: 'Attendance record not found in this session' });
            }

            const originalTime = session.present[normalizedOld].time;
            const enrollmentChanged = normalizedOld !== v.enrollment;

            if (enrollmentChanged && db.students[v.enrollment]) {
                return send(res, 409, { error: 'This enrollment ID is already registered' });
            }

            // Update student profile
            if (enrollmentChanged) {
                delete db.students[normalizedOld];
            }
            db.students[v.enrollment] = { name: v.name, enrollment: v.enrollment, section: v.section };

            // Update attendance in this and other sessions
            for (const s of db.sessions) {
                if (s.present && s.present[normalizedOld]) {
                    const recTime = s.present[normalizedOld].time;
                    delete s.present[normalizedOld];
                    s.present[v.enrollment] = {
                        name: v.name,
                        enrollment: v.enrollment,
                        section: v.section,
                        time: recTime
                    };
                }
            }
            saveData();

            broadcastTo(teacher.id, {
                type: 'student-updated',
                oldEnrollment: normalizedOld,
                student: { name: v.name, enrollment: v.enrollment, section: v.section, time: originalTime }
            });
            return send(res, 200, { ok: true });
        }

        // --- delete student attendance ---
        if (req.method === 'POST' && /^\/api\/session\/\d+\/student\/delete$/.test(pathname)) {
            const sessionId = Number(pathname.split('/')[3]);
            const { teacherId: reqTeacherId, enrollment } = await readBody(req);

            const teacher = db.teachers[reqTeacherId];
            if (!teacher) return send(res, 401, { error: 'Not authenticated' });

            const session = db.sessions.find(s => s.id === sessionId);
            if (!session) return send(res, 404, { error: 'Session not found' });
            if (session.teacherId !== teacher.id) return send(res, 403, { error: 'Not authorized to modify this session' });

            const normalizedEnrollment = (enrollment || '').trim().toUpperCase();
            if (!normalizedEnrollment) return send(res, 400, { error: 'Enrollment ID is required' });

            if (!session.present || !session.present[normalizedEnrollment]) {
                return send(res, 404, { error: 'Attendance record not found in this session' });
            }

            delete session.present[normalizedEnrollment];
            saveData();

            broadcastTo(teacher.id, {
                type: 'student-deleted',
                enrollment: normalizedEnrollment
            });
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
    server.listen(port, () => console.log(`Attendance server running at: http://localhost:${port}`));
}

startServer(DEFAULT_PORT);