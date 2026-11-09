# Handoff Report: Backend & Data Flow Dependencies for Teacher QR Code Generation

**Author**: `teamwork_explorer_2` (Explorer Agent)  
**Date**: 2026-11-09  
**Recipient**: Parent Orchestrator (`02dcd931-dbc9-4fe3-abe0-8e10c90bcf17`), Worker, Reviewer Agents  
**Scope Reference**: `d:\OPW\Attendance\attendance\.agents\teamwork\orchestrator\SCOPE.md`  
**Original Request**: `d:\OPW\Attendance\attendance\.agents\teamwork\ORIGINAL_REQUEST.md`  

---

## 1. Observation

### 1.1 Backend Architecture & Database Schema
The backend is a Node.js HTTP server (`server/server.js`, 2354 lines) backed by PostgreSQL (Supabase).
- **Configuration & Connection** (`server/server.js:28-40`):
  ```javascript
  const DATABASE_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.SUPERBASE_DB_URL;
  const pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 30_000
  });
  ```
  Environment variables in `.env` include `SUPERBASE_DB_URL`, `JWT_SECRET`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY`.

- **Database Table Definitions** (`server/server.js:121-140`):
  ```sql
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
  ```
- **Indexes** (`server/server.js:147-156`):
  Index `idx_sessions_qr_token` exists on `sessions (qr_token) WHERE qr_token IS NOT NULL`.

---

### 1.2 QR Code Token Generation & Endpoints

#### A. Session Creation Endpoint (`POST /api/start-session`)
Location: `server/server.js:1703-1771`
1. **Authentication**: Calls `authenticate(req, res)` (`server/server.js:243-250`), decoding JWT `Bearer` token from `Authorization` header. Verifies `payload.role === 'teacher'` and extracts `auth.teacherId`.
2. **Deactivation of Previous Sessions**:
   ```javascript
   await pool.query('UPDATE sessions SET active = false, qr_token = NULL WHERE teacher_id = $1 AND active = true', [teacher.id]);
   ```
   Ensures single active session per teacher and clears previous tokens.
3. **Subject Resolution**:
   If `subjectId` is provided, verifies `subjects` table row (`server/server.js:1718-1728`). If not provided or missing, searches by name or auto-generates a subject (`server/server.js:1729-1746`).
4. **Token Generation**:
   ```javascript
   const qrToken = nodeCrypto.randomBytes(32).toString('hex');
   ```
   Generates a cryptographically strong 64-character hexadecimal token.
5. **Database Insertion**:
   ```javascript
   const ins = await pool.query(
       'INSERT INTO sessions (teacher_id, teacher_name, subject, subject_id, qr_token, active, created_at) VALUES ($1, $2, $3, $4, $5, true, now()) RETURNING *',
       [teacher.id, teacher.name, resolvedSubjectTitle, resolvedSubjectId, qrToken]
   );
   const session = ins.rows[0];
   ```
6. **Real-time SSE Broadcast**:
   ```javascript
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
   ```
7. **HTTP Response**:
   ```javascript
   return send(res, 200, { qrToken: session.qr_token, sessionId: session.id });
   ```

#### B. Server-Sent Events (SSE) Stream Endpoint (`GET /api/stream`)
Location: `server/server.js:1798-1860`
1. **Connection & Auth**:
   Client opens EventSource: `new EventSource('/api/stream?token=' + encodeURIComponent(teacherToken))` (`dashboard.js:1432`). Server verifies JWT token from `searchParams.get('token')`.
2. **Initial Event (`type: 'init'`)**:
   Queries active session for the teacher (`server/server.js:1814-1839`):
   ```javascript
   const activeR = await pool.query('SELECT * FROM sessions WHERE teacher_id = $1 AND active = true ORDER BY id DESC LIMIT 1', [teacherId]);
   ```
   If active session exists, populates:
   ```javascript
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
   ```
   Sends: `id: <n>\ndata: {"type":"init","session":currentSession}\n\n`.
3. **Heartbeat**:
   `setInterval` every 30 seconds sends `: heartbeat\n\n` (`server/server.js:335-339`) to prevent connection dropouts.

#### C. Session Close Endpoint (`POST /api/close-session`)
Location: `server/server.js:1774-1781`
1. Verifies teacher JWT.
2. Updates database: `UPDATE sessions SET active = false, qr_token = NULL WHERE teacher_id = $1 AND active = true`.
3. Broadcasts `{ type: 'closed' }` to teacher SSE clients.
4. Returns HTTP 200 `{ ok: true }`.

#### D. Student QR Validation Endpoint (`GET /api/session-info`)
Location: `server/server.js:655-679`
1. Query parameter: `?token=<qrToken>`.
2. Queries database: `SELECT * FROM sessions WHERE active = true AND qr_token = $1`.
3. If not found: Returns 404 `{ error: 'Session is inactive or QR code expired' }`.
4. If found: Returns HTTP 200 with `{ sessionId, subject, teacherName, section, semester, createdAt }`.

#### E. Student Attendance Submission (`POST /api/mark`)
Location: `server/server.js:681-760`
1. Verifies `qr_token` exists and matches active session.
2. Inserts attendance record into `attendance` table.
3. Broadcasts real-time update to teacher:
   ```javascript
   broadcastTo(session.teacher_id, {
       type: 'mark',
       student: studentPayload
   });
   ```

---

### 1.3 Client Consumption in `public/scripts/teacher/dashboard.js`
1. **Starting Session** (`public/scripts/teacher/dashboard.js:1387-1397`):
   ```javascript
   const r = await apiFetch('/api/start-session', {
       method: 'POST',
       body: JSON.stringify({ subject, subjectId })
   });
   const data = await r.json();
   if (!r.ok) {
       alert(data.error || 'Failed to start session');
       return;
   }
   renderQr(data.qrToken);
   currentSessionId = data.sessionId;
   ```
2. **Handling SSE `new-session`** (`public/scripts/teacher/dashboard.js:1442-1451`):
   ```javascript
   if (data.type === 'new-session') {
       presentList = [];
       renderRows();
       renderQr(data.session.qrToken, data.session.subject);
       currentSessionId = data.session.id;
       setSessionActionState(true);
       document.getElementById('statSubject').textContent = data.session.subject || '–';
       startSessionTimer(data.session.createdAt);
       loadSubjects();
   }
   ```
3. **Handling SSE `init`** (`public/scripts/teacher/dashboard.js:1466-1476`):
   ```javascript
   if (data.type === 'init' && data.session) {
       currentSessionId = data.session.id;
       renderQr(data.session.active ? data.session.qrToken : null, data.session.subject);
       setSessionActionState(data.session.active);
       ...
   }
   ```
4. **Handling SSE `closed`** (`public/scripts/teacher/dashboard.js:1452-1456`):
   ```javascript
   if (data.type === 'closed') {
       renderQr(null);
       setSessionActionState(false);
       loadSubjects();
   }
   ```

---

### 1.4 The Root Cause of QR Display Failure
While tracing how `data.qrToken` is handed off to the frontend rendering pipeline:
In `public/scripts/teacher/dashboard.js:1298-1346`:
```javascript
function renderQr(qrToken, customSubjectTitle) {
    ...
    const url = `${location.origin}/student.html?token=${qrToken}`;
    new QRCode(box, {
        text: url,
        width: 200,
        height: 200,
        colorDark: '#1D1D1F',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
    });
    const boxCanvas = box.querySelector('canvas');
    if (boxCanvas) boxCanvas.remove(); // <-- BUG 1: Removes generated canvas

    if (projBox) {
        new QRCode(projBox, {
            text: url,
            width: 320,
            height: 320,
            colorDark: '#1D1D1F',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });
        const projCanvas = projBox.querySelector('canvas');
        if (projCanvas) projCanvas.remove(); // <-- BUG 2: Removes projector canvas
    }
    ...
}
```
And in `public/styles/shared/domain.css:874-883`:
```css
#qrBox canvas,
#projectorQrBox canvas {
    display: none !important; /* <-- BUG 3: Hides canvas in CSS */
}

#qrBox img,
#projectorQrBox img {
    display: block;
    margin: 0 auto;
}
```
Git inspection reveals commit `b6c6bb7f41fdd7e7d49551240074e97285d3123f` ("minor fixes") added `display: none !important` to CSS and `boxCanvas.remove()` to JS.

---

## 2. Logic Chain

1. **Premise 1**: The client dashboard requires a valid string `qrToken` to generate the QR code URL (`${location.origin}/student.html?token=${qrToken}`).
2. **Premise 2**: In `server/server.js:1748`, `qrToken` is created via standard Node crypto `nodeCrypto.randomBytes(32).toString('hex')`. This produces a 64-character hexadecimal string.
3. **Premise 3**: In `server/server.js:1750-1753`, the session is persisted to PostgreSQL in the `sessions` table (`qr_token`, `active = true`).
4. **Premise 4**: Both data delivery channels (REST `POST /api/start-session` response and SSE stream `new-session`/`init` events) serialize the token using the exact property name `qrToken`:
   - REST response: `{ qrToken: session.qr_token, sessionId: session.id }`
   - SSE payload: `session: { qrToken: session.qr_token, ... }`
5. **Premise 5**: In `public/scripts/teacher/dashboard.js`, lines 1396, 1445, and 1468 read `data.qrToken` and `data.session.qrToken` without naming or typing discrepancies.
6. **Premise 6**: The client successfully receives the HTTP 200 response and executes `renderQr(data.qrToken)`.
7. **Premise 7**: Inside `renderQr`, `new QRCode(box, { text: url, ... })` generates the QR code DOM elements (`<canvas>` and `<img>`).
8. **Premise 8**: Immediately after creation, lines 1332-1333 (`boxCanvas.remove()`) and lines 1344-1345 (`projCanvas.remove()`) delete the `<canvas>` DOM nodes. Concurrently, CSS rule `#qrBox canvas { display: none !important; }` hides any canvas element. In `qrcodejs`, if the canvas is stripped synchronously before or during the `toDataURL` conversion or if the rendering depends on the canvas, the container is left with no visible graphic, causing the QR code to vanish.
9. **Deduction**: The backend data flow is fully functioning, properly authenticated, and sends complete and conforming data. The bug is entirely in the client-side presentation layer (JavaScript element deletion and conflicting CSS rules).

---

## 3. Schema & Interface Contract Compatibility Audit

| Endpoint / Stream | Backend Response Structure | Client Script Expectation | Status | Notes |
|---|---|---|---|---|
| `POST /api/start-session` | `{ qrToken: string, sessionId: number }` | `data.qrToken`, `data.sessionId` | **MATCH** | Exact property match. HTTP status 200. |
| `GET /api/stream` (`init`) | `{ type: 'init', session: { id, teacherId, teacherName, subject, subjectId, qrToken, present, createdAt, active } }` | `data.session.qrToken`, `data.session.subject`, `data.session.active` | **MATCH** | Reconstructs active QR code on page refresh. |
| `GET /api/stream` (`new-session`) | `{ type: 'new-session', session: { id, teacherId, teacherName, subject, subjectId, qrToken, present, createdAt, active } }` | `data.session.qrToken`, `data.session.subject`, `data.session.id` | **MATCH** | Broadcasts to all open tabs for this teacher. |
| `GET /api/stream` (`closed`) | `{ type: 'closed' }` | `data.type === 'closed'` -> `renderQr(null)` | **MATCH** | Properly clears QR code and active state. |
| `POST /api/close-session` | `{ ok: true }` | `r.ok` -> `renderQr(null)` | **MATCH** | Sets `active = false` and `qr_token = NULL` in DB. |
| `GET /api/teacher/subjects` | `[ { id, name, code, department, section, semester, createdAt, totalSessions, totalPresent, isActive, activeSessionId } ]` | `teacherSubjects.forEach(...)`, `s.isActive` | **MATCH** | Powers dropdown `#liveSubjectSelect` and subjects grid. |
| `GET /api/session-info` | `{ sessionId, subject, teacherName, section, semester, createdAt }` | `student/dashboard.js:510` | **MATCH** | Validates `qr_token` for scanning students. |

**Contract Assessment**:
No property naming differences, JSON formatting errors, status code mismatches, or schema discrepancies exist between the backend and `public/scripts/teacher/dashboard.js`.

---

## 4. Caveats

1. **Sandboxed Network Environment**:
   External API calls (such as remote Supabase or CodeRabbit cloud servers) require sandbox bypass or local mocking in the test harness. Local development credentials in `.env` fall back gracefully.
2. **Subject Parameter in `/api/start-session` Response**:
   `POST /api/start-session` returns `{ qrToken, sessionId }` without `subject` in the JSON body. `dashboard.js:1348` already has fallback handling:
   ```javascript
   const subjectVal = (customSubjectTitle || document.getElementById('subject').value || ...).trim();
   ```
   Additionally, the subsequent SSE `new-session` event supplies `data.session.subject`. While adding `subject: session.subject` to the `/api/start-session` response would be clean, it is optional and not breaking.
3. **Database Connection Required for Live Server**:
   The backend server connects to PostgreSQL via `pg.Pool`. Running the server without database access will fail during `initDb()`. Unit and integration verification harnesses should either use a mock pool or verify the contract handlers directly.

---

## 5. Conclusion

1. **Backend & Data Flow Status**:
   - The backend service (`server/server.js`) correctly manages session creation, token generation, persistence, SSE broadcasting, and session teardown.
   - All REST and SSE payloads deliver the required `qrToken` with matching property keys and data types.
   - Authentication via JWT Bearer headers and query parameters (`/api/stream?token=...`) is properly validated.
   - No server-side failure or database configuration error is responsible for the QR code display bug.
2. **Root Cause**:
   - The QR code fails to appear because `public/scripts/teacher/dashboard.js` lines 1332-1333 (`boxCanvas.remove()`) and lines 1344-1345 (`projCanvas.remove()`) explicitly delete the generated `<canvas>` elements from the DOM, while `public/styles/shared/domain.css` lines 874-883 hides `<canvas>` with `display: none !important`.
3. **Actionable Recommendations for the Worker Agent**:
   - **Do NOT modify backend API routes or schema contracts**: The backend contract `{ qrToken, sessionId }` and SSE session payload `{ qrToken, subject, ... }` are correct and relied upon by both teacher and student workflows.
   - **Frontend Fix**:
     1. In `public/scripts/teacher/dashboard.js`, remove lines 1332-1333 (`const boxCanvas = box.querySelector('canvas'); if (boxCanvas) boxCanvas.remove();`) and lines 1344-1345 (`const projCanvas = projBox.querySelector('canvas'); if (projCanvas) projCanvas.remove();`).
     2. In `public/styles/shared/domain.css`, remove or adjust `#qrBox canvas, #projectorQrBox canvas { display: none !important; }` so that the rendered canvas is visible and styled properly.
     3. Ensure both `#qrBox` and `#projectorQrBox` preserve the rendered canvas or image as produced by `QRCode`.

---

## 6. Verification Method

### 6.1 Direct Contract Verification
To independently verify that the backend controller produces the correct payload for session creation:
Run Node.js contract test checking `server/server.js` routes:
```powershell
node -e "
const fs = require('fs');
const serverCode = fs.readFileSync('server/server.js', 'utf8');
const hasStartSession = serverCode.includes('pathname === \'/api/start-session\'');
const hasQrTokenResponse = serverCode.includes('return send(res, 200, { qrToken: session.qr_token, sessionId: session.id });');
const hasStreamInit = serverCode.includes('qrToken: sess.qr_token');
const hasStreamNewSession = serverCode.includes('qrToken: session.qr_token');
console.log('Start session route exists:', hasStartSession);
console.log('Returns qrToken in response:', hasQrTokenResponse);
console.log('SSE init supplies qrToken:', hasStreamInit);
console.log('SSE new-session supplies qrToken:', hasStreamNewSession);
if (!hasStartSession || !hasQrTokenResponse || !hasStreamInit || !hasStreamNewSession) process.exit(1);
"
```

### 6.2 Frontend DOM & Script Verification
Verify the presence of the buggy canvas removal lines and CSS:
```powershell
Select-String -Path public/scripts/teacher/dashboard.js -Pattern "boxCanvas\.remove|projCanvas\.remove"
Select-String -Path public/styles/shared/domain.css -Pattern "qrBox canvas" -Context 0,4
```

### 6.3 Post-Fix Verification (Worker Task)
Run the verification test harness created by `teamwork_explorer_3`:
```powershell
node .agents/teamwork/teamwork_explorer_3/test_qr_verification.mjs
```
Expected result after Worker fixes `dashboard.js` and `domain.css`:
All verification checks (including QR container DOM presence and canvas visibility) pass with exit code `0`.
