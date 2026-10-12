        function toggleMobileMenu() {
            const navRight = document.getElementById('navRight');
            const hamburger = document.getElementById('hamburgerIcon');
            const close = document.getElementById('closeMenuIcon');
            
            if (navRight) {
                const isActive = navRight.classList.toggle('active');
                if (hamburger && close) {
                    hamburger.style.display = isActive ? 'none' : 'block';
                    close.style.display = isActive ? 'block' : 'none';
                }
            }
        }

        function setupPasswordToggles() {
            const toggles = document.querySelectorAll('[data-password-toggle]');
            toggles.forEach((toggle) => {
                toggle.addEventListener('click', () => {
                    const input = toggle.closest('.password-wrap').querySelector('input');
                    const isHidden = input.type === 'password';
                    input.type = isHidden ? 'text' : 'password';
                    toggle.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
                    toggle.setAttribute('aria-pressed', String(isHidden));
                });
            });
        }

        setupPasswordToggles();

        let teacherId = null, teacherName = null, teacherToken = null;
        let currentSessionId = null;
        let currentSelectedSubject = null;
        let teacherSubjects = [];
        let activeHistorySubjectFilter = '';
        let presentList = [];
        let sessionTimerInterval = null;
        let sessionStartTime = null;
        let _activeEventSource = null;
        let _reconnectDelay = 3000;
        let _reconnectTimer = null;
        let currentAttendanceSubjectId = null;
        let currentAttendanceMonth = 'all';
        let currentAttendanceData = null;
        let currentAttendanceSubTab = 'roster';

        // Helper: fetch() with Authorization header automatically attached
        function apiFetch(url, options = {}) {
            options.headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
            if (teacherToken) options.headers['Authorization'] = `Bearer ${teacherToken}`;
            return fetch(url, options);
        }

        function getInitials(name) {
            if (!name) return 'ST';
            const parts = name.trim().split(/\s+/);
            if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }

        function getEnrollmentNumber(enrollment) {
            if (!enrollment) return Infinity;
            const parts = enrollment.split('/');
            const num = Number(parts[parts.length - 1]);
            return isNaN(num) ? Infinity : num;
        }

        function sortStudentsByEnrollment(students) {
            return [...students].sort((a, b) => getEnrollmentNumber(a.enrollment) - getEnrollmentNumber(b.enrollment));
        }

        function renderRows() {
            const tbody = document.getElementById('rows');
            const emptyMsg = document.getElementById('emptyRosterMsg');
            tbody.innerHTML = '';

            if (emptyMsg) emptyMsg.hidden = presentList.length !== 0;
            if (presentList.length !== 0) {
                sortStudentsByEnrollment(presentList).forEach(s => addRow(s, false));
            }

            document.getElementById('rosterCount').textContent = presentList.length;
            document.getElementById('statPresent').textContent = presentList.length;
            const projCount = document.getElementById('projectorCount');
            if (projCount) projCount.textContent = presentList.length;
        }


        let supabaseClient = null;

        async function initAuth() {
            const r = await fetch('/api/config');
            if(r.ok) {
                const cfg = await r.json();
                supabaseClient = supabase.createClient(cfg.url, cfg.anonKey);
                
                const { data: { session } } = await supabaseClient.auth.getSession();
                if (session) {
                    await exchangeSupabaseToken(session.access_token);
                } else {
                    supabaseClient.auth.onAuthStateChange(async (event, session) => {
                        if (event === 'SIGNED_IN' && session) {
                            await exchangeSupabaseToken(session.access_token);
                        }
                    });
                }
            }
        }
        initAuth();

        const teacherTokenStr = localStorage.getItem('teacher_token');
        const teacherDataStr = localStorage.getItem('teacher_data');
        if (teacherTokenStr && teacherDataStr) {
            try {
                const data = JSON.parse(teacherDataStr);
                teacherId = data.id;
                teacherName = data.name;
                teacherToken = teacherTokenStr;
                enterDash();
            } catch(e) {
                window.location.href = '/login';
            }
        } else {
            window.location.href = '/login';
        }

        async function login() {
            const username = document.getElementById('user').value;
            const password = document.getElementById('pass').value;
            const r = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await r.json();
            if (r.ok) {
                teacherId = data.teacherId;
                teacherName = data.teacherName;
                teacherToken = data.token;
                localStorage.setItem('teacherAuth', JSON.stringify({ teacherId, teacherName, token: teacherToken }));
                enterDash();
            } else {
                document.getElementById('loginMsg').textContent = data.error || 'Invalid credentials';
            }
        }

        async function loginWithGoogle() {
            if(!supabaseClient) return alert('Auth not initialized');
            document.getElementById('loginMsg').textContent = 'Redirecting to Google...';
            const { error } = await supabaseClient.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: window.location.origin + '/admin.html' }
            });
            if (error) document.getElementById('loginMsg').textContent = error.message;
        }

        async function exchangeSupabaseToken(access_token) {
            const r = await fetch('/api/auth/supabase-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ access_token })
            });
            const data = await r.json();
            if (r.ok && data.role === 'teacher') {
                teacherId = data.teacherId;
                teacherName = data.teacherName;
                teacherToken = data.token;
                localStorage.setItem('teacher_token', teacherToken);
                localStorage.setItem('teacher_data', JSON.stringify({ id: teacherId, name: teacherName }));
                enterDash();
            } else if (r.ok) {
                document.getElementById('loginMsg').textContent = 'Unauthorized: Not a teacher account.';
                supabaseClient.auth.signOut();
            } else {
                document.getElementById('loginMsg').textContent = data.error || 'Login failed';
            }
        }

        function logout() {
            localStorage.removeItem('teacher_token');
            localStorage.removeItem('teacher_data');
            window.location.href = '/login?role=teacher';
        }

        function enterDash() {
            document.getElementById('hello').textContent = teacherName ? `Welcome, ${teacherName}` : 'Welcome, Teacher';
            document.getElementById('teacherBadgeName').textContent = teacherName || 'Teacher';
            document.getElementById('teacherAvatar').textContent = getInitials(teacherName || 'Teacher');
            document.getElementById('today').textContent = new Date().toLocaleDateString(undefined, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            connectStream();
            refreshStats();
            loadSubjects();
            showTab('subjects');
        }

        function showTab(tab) {
            document.getElementById('subjectsTab').hidden = tab !== 'subjects';
            document.getElementById('liveTab').hidden = tab !== 'live';
            document.getElementById('historyTab').hidden = tab !== 'history';
            const attTab = document.getElementById('attendanceTab');
            if (attTab) attTab.hidden = tab !== 'attendance';

            document.getElementById('tabSubj').classList.toggle('active', tab === 'subjects' || tab === 'attendance');
            document.getElementById('tabLive').classList.toggle('active', tab === 'live');
            document.getElementById('tabHist').classList.toggle('active', tab === 'history');

            document.getElementById('tabs').dataset.activeTab = tab === 'attendance' ? 'subjects' : tab;

            if (tab === 'subjects') loadSubjects();
            if (tab === 'history') loadHistory();
        }

        /* ── Subjects Management ── */
        async function loadSubjects() {
            try {
                const r = await apiFetch(`/api/teacher/subjects`);
                teacherSubjects = await r.json();
                renderSubjectsGrid();
                renderHistoryFilters();
                const activeSess = teacherSubjects.find(s => s.isActive);
                if (activeSess && !currentSelectedSubject) {
                    currentSelectedSubject = activeSess;
                    const liveSelect = document.getElementById('liveSubjectSelect');
                    if (liveSelect) liveSelect.value = activeSess.id;
                    document.getElementById('crumbSubjectName').textContent = activeSess.name;
                    const metaParts = [activeSess.department || 'GENERAL'];
                    if (activeSess.section) metaParts.push('Sec ' + activeSess.section);
                    if (activeSess.semester) metaParts.push(activeSess.semester);
                    document.getElementById('crumbSubjectDept').textContent = metaParts.join(' · ');
                    document.getElementById('subjectBanner').hidden = false;
                }
            } catch (e) {
                console.error('Failed to load subjects:', e);
            }
        }

        function populateLiveSubjectDropdown() {
            const select = document.getElementById('liveSubjectSelect');
            if (!select) return;
            const currentVal = select.value || (currentSelectedSubject ? currentSelectedSubject.id : '');
            select.innerHTML = '<option value="">-- Choose Subject to Launch Register --</option>';
            teacherSubjects.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                const secPart = s.section ? ` (Sec ${s.section})` : '';
                const semPart = s.semester ? ` · ${s.semester}` : '';
                opt.textContent = `${s.code ? s.code + ' ' : ''}${s.name}${secPart}${semPart}`;
                select.appendChild(opt);
            });
            if (currentVal && teacherSubjects.some(s => s.id === currentVal)) {
                select.value = currentVal;
            }
        }

        function onLiveSubjectSelectChange() {
            const select = document.getElementById('liveSubjectSelect');
            const sid = select.value;
            if (!sid) {
                currentSelectedSubject = null;
                document.getElementById('subject').value = '';
                document.getElementById('crumbSubjectName').textContent = 'General Session';
                document.getElementById('crumbSubjectDept').textContent = '';
                document.getElementById('subjectBanner').hidden = true;
                document.getElementById('statSubject').textContent = '–';
                return;
            }
            const subj = teacherSubjects.find(s => s.id === sid);
            if (subj) selectSubject(subj);
        }

        function renderSubjectsGrid() {
            const grid = document.getElementById('subjectsGrid');
            grid.innerHTML = '';
            populateLiveSubjectDropdown();

            if (!teacherSubjects || teacherSubjects.length === 0) {
                grid.innerHTML = `
                    <div class="subject-empty-state">
                        <svg class="subject-empty-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--ink-2)" stroke-width="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                        <h3 class="subject-empty-title">No subjects added yet</h3>
                        <p class="subject-empty-description">Add your first course subject to start taking classroom attendance.</p>
                        <button class="btn btn-primary" onclick="openAddSubjectModal()">+ Add Your First Subject</button>
                    </div>
                `;
                return;
            }

            teacherSubjects.forEach(s => {
                const card = document.createElement('div');
                card.className = 'card';
                card.innerHTML = `
                    <div>
                        <div class="subject-card-header">
                            <div>
                                <span class="dept-pill">${esc(s.department || 'GENERAL')}</span>
                                ${s.section ? `<span class="section-pill">Sec ${esc(s.section)}</span>` : ''}
                                ${s.semester ? `<span class="semester-pill">${esc(s.semester)}</span>` : ''}
                                <span class="code-tag">${esc(s.code || '')}</span>
                            </div>
                            <div class="subject-card-tools">
                                <button class="card-action-btn" title="Edit Subject" onclick="openEditSubjectModal('${esc(s.id)}')">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                </button>
                                <button class="card-action-btn delete-btn" title="Remove Subject" onclick="openDeleteSubjectModal('${esc(s.id)}')">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                </button>
                            </div>
                        </div>
                        <h3 class="subject-card-title">${esc(s.name)}</h3>
                        <div class="subject-card-meta">
                            <span><strong>${s.totalSessions || 0}</strong> sessions held</span>
                            ${s.isActive ? '<span class="live-session-badge"><span class="dot-live"></span> Live Session</span>' : ''}
                        </div>
                    </div>
                    <div class="subject-card-footer">
                        <button class="btn btn-secondary subject-card-action" onclick="openSubjectAttendancePage('${esc(s.id)}')">
                            <svg class="subject-card-action-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
                            View Attendance
                        </button>
                        <button class="btn ${s.isActive ? 'btn-primary' : 'btn-dark'} subject-card-action" onclick="selectSubjectById('${esc(s.id)}')">
                            ${s.isActive ? 'Resume Session' : 'Launch Session'}
                        </button>
                    </div>
                `;
                grid.appendChild(card);
            });
        }

        function selectSubjectById(subjectId) {
            const subj = teacherSubjects.find(s => s.id === subjectId);
            if (!subj) return;
            selectSubject(subj);
        }

        function selectSubject(subject) {
            currentSelectedSubject = subject;
            const fullTitle = `${subject.code ? subject.code + ' ' : ''}${subject.name}${subject.section ? ' (Sec ' + subject.section + ')' : ''}`;
            document.getElementById('subject').value = fullTitle;
            const liveSelect = document.getElementById('liveSubjectSelect');
            if (liveSelect) liveSelect.value = subject.id;
            document.getElementById('crumbSubjectName').textContent = subject.name;
            const metaParts = [subject.department || 'GENERAL'];
            if (subject.section) metaParts.push('Sec ' + subject.section);
            if (subject.semester) metaParts.push(subject.semester);
            document.getElementById('crumbSubjectDept').textContent = metaParts.join(' · ');
            document.getElementById('subjectBanner').hidden = false;
            document.getElementById('statSubject').textContent = subject.name;
            showTab('live');
        }

        /* ── Subject Attendance Page & Session Management ── */
        async function openSubjectAttendancePage(subjectId) {
            currentAttendanceSubjectId = subjectId;
            currentAttendanceMonth = 'all';
            currentAttendanceSubTab = 'roster';
            showTab('attendance');
            await loadSubjectAttendancePage(subjectId, 'all');
        }

        function openSubjectAttendanceModal(subjectId) {
            return openSubjectAttendancePage(subjectId);
        }

        async function loadSubjectAttendancePage(subjectId, month = 'all') {
            if (!subjectId) subjectId = currentAttendanceSubjectId;
            if (!subjectId) return;
            currentAttendanceSubjectId = subjectId;
            currentAttendanceMonth = month;

            // Render Month Buttons in #pageMonthFilterGrid
            const monthGrid = document.getElementById('pageMonthFilterGrid');
            if (monthGrid) {
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                let btnHtml = `<button class="month-btn ${month === 'all' ? 'active' : ''}" onclick="loadSubjectAttendancePage('${esc(subjectId)}', 'all')">All Months</button>`;
                months.forEach((m, idx) => {
                    const mVal = idx + 1;
                    btnHtml += `<button class="month-btn ${month == mVal ? 'active' : ''}" onclick="loadSubjectAttendancePage('${esc(subjectId)}', ${mVal})">${m}</button>`;
                });
                monthGrid.innerHTML = btnHtml;
            }

            const contentEl = document.getElementById('pageRosterContent');
            if (!contentEl) return;
            contentEl.innerHTML = `<p class="subject-report-loading" style="padding: 30px 0;"><span class="dot-live" style="margin-right: 8px;"></span>Fetching subject records & session history…</p>`;

            try {
                const r = await apiFetch(`/api/teacher/subject-attendance?subjectId=${encodeURIComponent(subjectId)}&month=${encodeURIComponent(month)}`);
                const data = await r.json();
                if (!r.ok) {
                    contentEl.innerHTML = `<p class="subject-report-error" style="padding: 30px 0;">${esc(data.error || 'Failed to load subject records')}</p>`;
                    return;
                }

                currentAttendanceData = data;
                const s = data.subject;
                const metaParts = [];
                if (s.code) metaParts.push(s.code);
                if (s.department) metaParts.push(s.department);
                if (s.section) metaParts.push('Sec ' + s.section);
                if (s.semester) metaParts.push(s.semester);

                const titleEl = document.getElementById('pageSubjTitle');
                if (titleEl) titleEl.textContent = s.name;
                const metaEl = document.getElementById('pageSubjMeta');
                if (metaEl) metaEl.textContent = metaParts.length ? metaParts.join(' · ') : 'Subject Attendance Report';

                const students = data.students || [];
                const sessions = data.sessions || [];
                const totalHeld = data.totalHeld || 0;
                const totalPresentAgg = students.reduce((acc, st) => acc + (st.attended || 0), 0);
                const avgPct = (students.length > 0 && totalHeld > 0)
                    ? Math.round((totalPresentAgg / (students.length * totalHeld)) * 100)
                    : (totalHeld > 0 ? 0 : 100);

                renderSubjectAttendanceBody(data, avgPct);
            } catch (err) {
                console.error(err);
                contentEl.innerHTML = `<p class="subject-report-error" style="padding: 30px 0;">Network error loading subject attendance.</p>`;
            }
            if (window.lucide) window.lucide.createIcons();
        }

        function renderSubjectAttendanceBody(data, avgPct) {
            const contentEl = document.getElementById('pageRosterContent');
            if (!contentEl) return;

            const students = data.students || [];
            const sessions = data.sessions || [];
            const totalHeld = data.totalHeld || 0;
            const s = data.subject;

            contentEl.innerHTML = `
                <!-- 3 KPI Summary Cards -->
                <div class="subject-report-kpis">
                    <div class="subject-report-kpi">
                        <div class="subject-report-kpi-label">Total Classes Held</div>
                        <div class="subject-report-kpi-value">${totalHeld} <span class="subject-report-kpi-unit">Sessions</span></div>
                    </div>
                    <div class="subject-report-kpi">
                        <div class="subject-report-kpi-label">Students Recorded</div>
                        <div class="subject-report-kpi-value">${students.length} <span class="subject-report-kpi-unit">Students</span></div>
                    </div>
                    <div class="subject-report-kpi">
                        <div class="subject-report-kpi-label">Average Attendance</div>
                        <div class="subject-report-kpi-value ${avgPct >= 75 ? 'is-good' : 'is-warning'}">${totalHeld > 0 ? avgPct + '%' : 'N/A'}</div>
                    </div>
                </div>

                <!-- View Switch Tabs: Roster vs Sessions -->
                <div class="subject-subtabs-bar">
                    <button class="subject-subtab-btn ${currentAttendanceSubTab === 'roster' ? 'active' : ''}" onclick="switchAttendanceSubTab('roster')">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                        Student Attendance Roster (${students.length})
                    </button>
                    <button class="subject-subtab-btn ${currentAttendanceSubTab === 'sessions' ? 'active' : ''}" onclick="switchAttendanceSubTab('sessions')">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        Class Sessions Held (${sessions.length})
                    </button>
                </div>

                <!-- Subtab 1: Student Roster Container -->
                <div id="subtabRosterView" ${currentAttendanceSubTab === 'roster' ? '' : 'hidden'}>
                    <div class="subject-report-toolbar">
                        <div class="subject-report-heading-text">Student Attendance Records for this Subject</div>
                        <input type="search" id="rosterSearchInput" class="form-control subject-report-search" oninput="filterRosterTable()" placeholder="Search student name or enrollment…">
                    </div>

                    <div class="subject-report-table-scroll">
                        <table class="roster-table roster-table-flush" id="rosterTable">
                            <thead>
                                <tr>
                                    <th>Student</th>
                                    <th>Enrollment ID</th>
                                    <th>Section</th>
                                    <th>Attended</th>
                                    <th>Absent</th>
                                    <th>Total Classes</th>
                                    <th>Attendance %</th>
                                    <th>Last Attended</th>
                                </tr>
                            </thead>
                            <tbody id="rosterTableBody">
                                ${students.length === 0 ? `
                                    <tr>
                                        <td colspan="8" class="roster-empty-cell">
                                            No student records found for this period. Click "Launch Session" to take live attendance or "Upload Excel" to import existing records.
                                        </td>
                                    </tr>
                                ` : students.map(st => {
                                    const isSafe = st.percentage >= 75;
                                    const dateStr = st.lastAttended ? new Date(st.lastAttended).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–';
                                    const initials = getInitials(st.name);
                                    return `
                                        <tr class="roster-row" data-search="${esc((st.name + ' ' + st.enrollment + ' ' + (st.section || '')).toLowerCase())}">
                                            <td>
                                                <div class="student-cell">
                                                    <div class="student-avatar">${initials}</div>
                                                    <span class="cell-name">${esc(st.name)}</span>
                                                </div>
                                            </td>
                                            <td class="roster-enrollment">${esc(st.enrollment)}</td>
                                            <td><span class="cell-section">${esc(st.section || '–')}</span></td>
                                            <td><strong class="roster-attended">${st.attended}</strong></td>
                                            <td><span class="roster-absent ${st.absent > 0 ? 'has-absences' : ''}">${st.absent}</span></td>
                                            <td>${st.totalHeld}</td>
                                            <td>
                                                <span class="pct-badge ${isSafe ? 'good' : 'warn'}">
                                                    ${isSafe ? '<i class="report-pct-icon" data-lucide="check"></i>' : '<i class="report-pct-icon" data-lucide="flag"></i>'} ${st.percentage}%
                                                </span>
                                            </td>
                                            <td class="roster-date">${dateStr}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Subtab 2: Sessions List Container -->
                <div id="subtabSessionsView" ${currentAttendanceSubTab === 'sessions' ? '' : 'hidden'}>
                    <div class="subject-report-toolbar">
                        <div class="subject-report-heading-text">Classroom Sessions Recorded for ${esc(s.name)}</div>
                        <button class="btn btn-primary compact-button" onclick="launchLiveSessionForCurrentSubject()">+ Launch New Session</button>
                    </div>

                    <div class="subject-sessions-list" id="subjectSessionsList">
                        ${sessions.length === 0 ? `
                            <div class="history-empty" style="background: rgba(0,0,0,0.02); border-radius: 12px; border: 1px dashed var(--hair); padding: 36px 16px;">
                                <p style="margin: 0 0 12px; font-weight: 500;">No attendance sessions held for this subject yet.</p>
                                <button class="btn btn-primary compact-button" onclick="launchLiveSessionForCurrentSubject()">Launch First Session</button>
                            </div>
                        ` : sessions.map(sess => {
                            const dateStr = new Date(sess.createdAt).toLocaleDateString([], {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            });
                            return `
                                <div class="hist-row session-card-row">
                                    <div class="session-info-col">
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <strong style="font-size: 15px; color: var(--ink);">${esc(sess.subject || s.name)}</strong>
                                            <span class="badge ${sess.active ? '' : 'closed'}">${sess.active ? 'active' : 'closed'}</span>
                                        </div>
                                        <span class="muted" style="font-size: 13px;">${dateStr} · <strong style="color: var(--primary);">${sess.count || 0}</strong> students checked in</span>
                                    </div>
                                    <div class="history-row-actions">
                                        <button class="btn btn-secondary compact-button" onclick="openSessionDetailModal(${sess.id})" title="View attendees">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                            View Students
                                        </button>
                                        <button class="card-action-btn" onclick="location.href='/api/export?id=${sess.id}'" title="Export CSV">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                        </button>
                                        <button class="card-action-btn delete-btn" onclick="deleteSessionFromSubject(${sess.id})" title="Delete Session">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                        </button>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons();
        }

        function switchAttendanceSubTab(subTab) {
            currentAttendanceSubTab = subTab;
            const rView = document.getElementById('subtabRosterView');
            const sView = document.getElementById('subtabSessionsView');
            if (rView) rView.hidden = subTab !== 'roster';
            if (sView) sView.hidden = subTab !== 'sessions';

            const btns = document.querySelectorAll('.subject-subtab-btn');
            btns.forEach(b => {
                const isRosterBtn = b.textContent.includes('Student Attendance Roster');
                b.classList.toggle('active', (subTab === 'roster' && isRosterBtn) || (subTab === 'sessions' && !isRosterBtn));
            });
        }

        function filterRosterTable() {
            const query = (document.getElementById('rosterSearchInput')?.value || '').trim().toLowerCase();
            const rows = document.querySelectorAll('#rosterTableBody .roster-row');
            rows.forEach(r => {
                const text = r.getAttribute('data-search') || '';
                r.hidden = Boolean(query) && !text.includes(query);
            });
        }

        function launchLiveSessionForCurrentSubject() {
            if (!currentAttendanceSubjectId) return;
            selectSubjectById(currentAttendanceSubjectId);
        }

        /* ── Session Detail Modal ── */
        async function openSessionDetailModal(sessionId) {
            closeModal();
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

            overlay.innerHTML = `
                <div class="modal-dialog wide modal-dialog-scroll">
                    <div class="subject-report-header" style="margin-bottom: 16px;">
                        <div>
                            <h2 class="subject-report-title" id="sessionModalTitle">Session Attendance</h2>
                            <p class="sub subject-report-meta" id="sessionModalMeta">Loading session records…</p>
                        </div>
                        <div class="subject-report-tools">
                            <button class="btn btn-secondary compact-button" onclick="location.href='/api/export?id=${sessionId}'" title="Download CSV">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                Export CSV
                            </button>
                            <button class="btn btn-secondary compact-button" onclick="closeModal()">Close</button>
                        </div>
                    </div>
                    <div id="sessionModalContent" style="min-height: 180px;">
                        <p class="subject-report-loading" style="padding: 30px 0;">Loading students present in this session…</p>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            requestAnimationFrame(() => overlay.classList.add('active'));

            try {
                const r = await apiFetch(`/api/session?id=${sessionId}`);
                const sess = await r.json();
                if (!r.ok || !sess) {
                    document.getElementById('sessionModalContent').innerHTML = `<p class="subject-report-error">${esc(sess.error || 'Failed to load session records')}</p>`;
                    return;
                }

                const dateStr = new Date(sess.createdAt).toLocaleDateString([], {
                    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
                });

                document.getElementById('sessionModalTitle').textContent = sess.subject || 'Class Session';
                document.getElementById('sessionModalMeta').textContent = `${dateStr} · Status: ${sess.active ? 'Active' : 'Closed'}`;

                const students = Object.values(sess.present || {});

                const contentEl = document.getElementById('sessionModalContent');
                contentEl.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                        <div style="font-weight: 600; font-size: 14px; color: var(--ink);">
                            Present Students: <span style="color: var(--primary); font-weight: 700;">${students.length}</span>
                        </div>
                        <input type="search" class="form-control" style="max-width: 240px; height: 34px; font-size: 13px;" placeholder="Search session attendees…" oninput="filterSessionAttendees(this.value)">
                    </div>
                    <div class="subject-report-table-scroll" style="max-height: 380px;">
                        <table class="roster-table roster-table-flush" id="sessionAttendeesTable">
                            <thead>
                                <tr>
                                    <th>Student</th>
                                    <th>Enrollment ID</th>
                                    <th>Section</th>
                                    <th>Check-in Time</th>
                                    <th class="text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${students.length === 0 ? `
                                    <tr><td colspan="5" class="roster-empty-cell">No students recorded present in this session.</td></tr>
                                ` : students.map(st => {
                                    const timeStr = st.time ? new Date(st.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '–';
                                    const initials = getInitials(st.name);
                                    return `
                                        <tr class="session-attendee-row" data-search="${esc((st.name + ' ' + st.enrollment + ' ' + (st.section || '')).toLowerCase())}">
                                            <td>
                                                <div class="student-cell">
                                                    <div class="student-avatar">${initials}</div>
                                                    <span class="cell-name">${esc(st.name)}</span>
                                                </div>
                                            </td>
                                            <td class="roster-enrollment">${esc(st.enrollment)}</td>
                                            <td><span class="cell-section">${esc(st.section || '–')}</span></td>
                                            <td class="attendance-time">${timeStr}</td>
                                            <td class="text-right">
                                                <button class="card-action-btn delete-btn" title="Remove from session" onclick="deleteStudentFromSession(${sessionId}, '${esc(st.enrollment)}')">
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                                </button>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="subject-report-actions" style="margin-top: 16px;">
                        <button class="btn btn-secondary" onclick="closeModal()">Close</button>
                    </div>
                `;
            } catch (e) {
                console.error(e);
                document.getElementById('sessionModalContent').innerHTML = `<p class="subject-report-error">Error loading session.</p>`;
            }
        }

        function filterSessionAttendees(query) {
            const q = (query || '').trim().toLowerCase();
            const rows = document.querySelectorAll('#sessionAttendeesTable tbody .session-attendee-row');
            rows.forEach(r => {
                const text = r.getAttribute('data-search') || '';
                r.hidden = Boolean(q) && !text.includes(q);
            });
        }

        async function deleteStudentFromSession(sessionId, enrollment) {
            if (!confirm(`Remove ${enrollment} from this session's attendance?`)) return;
            try {
                const r = await apiFetch(`/api/session/${sessionId}/student/delete`, {
                    method: 'POST',
                    body: JSON.stringify({ enrollment })
                });
                if (r.ok) {
                    openSessionDetailModal(sessionId);
                    if (currentAttendanceSubjectId) {
                        loadSubjectAttendancePage(currentAttendanceSubjectId, currentAttendanceMonth);
                    }
                    loadHistory();
                    refreshStats();
                    loadSubjects();
                }
            } catch (e) {
                console.error(e);
            }
        }

        async function deleteSessionFromSubject(sessionId) {
            if (!confirm('Delete this session? This will permanently remove all attendance records for it.')) return;
            try {
                await apiFetch('/api/delete-session', {
                    method: 'POST',
                    body: JSON.stringify({ sessionId })
                });
                if (currentAttendanceSubjectId) {
                    loadSubjectAttendancePage(currentAttendanceSubjectId, currentAttendanceMonth);
                }
                loadHistory();
                refreshStats();
                loadSubjects();
            } catch (e) {
                console.error(e);
            }
        }

        /* ── Excel Export ── */
        function downloadAttendanceExcel() {
            if (!currentAttendanceData || !currentAttendanceData.subject) {
                alert('Please select and open a subject attendance report first.');
                return;
            }
            if (typeof XLSX === 'undefined') {
                alert('Excel library is still loading. Please try again in a moment.');
                return;
            }

            const s = currentAttendanceData.subject;
            const students = currentAttendanceData.students || [];
            const sessions = currentAttendanceData.sessions || [];
            const totalHeld = currentAttendanceData.totalHeld || 0;

            const wb = XLSX.utils.book_new();

            // Sheet 1: Student Roster
            const rosterData = [
                ['Course / Subject', s.name],
                ['Course Code', s.code || '–'],
                ['Department', s.department || '–'],
                ['Section', s.section || '–'],
                ['Semester', s.semester || '–'],
                ['Total Classes Held', totalHeld],
                [],
                ['#', 'Student Name', 'Enrollment ID', 'Section', 'Classes Attended', 'Classes Absent', 'Total Classes', 'Attendance %', 'Status', 'Last Attended']
            ];

            students.forEach((st, idx) => {
                const status = st.percentage >= 75 ? 'Eligible' : 'Shortage (< 75%)';
                const lastAtt = st.lastAttended ? new Date(st.lastAttended).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–';
                rosterData.push([
                    idx + 1,
                    st.name,
                    st.enrollment,
                    st.section || '–',
                    st.attended,
                    st.absent,
                    st.totalHeld,
                    `${st.percentage}%`,
                    status,
                    lastAtt
                ]);
            });

            const wsRoster = XLSX.utils.aoa_to_sheet(rosterData);
            wsRoster['!cols'] = [
                { wch: 5 },
                { wch: 26 },
                { wch: 28 },
                { wch: 10 },
                { wch: 16 },
                { wch: 14 },
                { wch: 14 },
                { wch: 14 },
                { wch: 18 },
                { wch: 22 }
            ];
            XLSX.utils.book_append_sheet(wb, wsRoster, 'Student Roster');

            // Sheet 2: Sessions List
            const sessionData = [
                ['Course / Subject', s.name],
                ['Total Sessions Held', totalHeld],
                [],
                ['#', 'Session ID', 'Date & Time', 'Students Checked In', 'Session Status']
            ];

            sessions.forEach((sess, idx) => {
                const sessDate = sess.createdAt ? new Date(sess.createdAt).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–';
                sessionData.push([
                    idx + 1,
                    sess.id,
                    sessDate,
                    sess.count || 0,
                    sess.active ? 'Active' : 'Completed'
                ]);
            });

            const wsSessions = XLSX.utils.aoa_to_sheet(sessionData);
            wsSessions['!cols'] = [
                { wch: 5 },
                { wch: 12 },
                { wch: 24 },
                { wch: 22 },
                { wch: 16 }
            ];
            XLSX.utils.book_append_sheet(wb, wsSessions, 'Class Sessions');

            const cleanSubj = (s.name || 'Subject').replace(/[^a-zA-Z0-9_-]/g, '_');
            const monthLabel = currentAttendanceMonth === 'all' ? 'All_Months' : `Month_${currentAttendanceMonth}`;
            const filename = `${cleanSubj}_Attendance_${monthLabel}.xlsx`;

            XLSX.writeFile(wb, filename);
        }

        /* ── Bulk Attendance Excel Upload ── */
        async function handleBulkAttendanceUpload(event) {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            event.target.value = '';

            if (!currentAttendanceSubjectId) {
                alert('Please choose or open a subject before uploading attendance.');
                return;
            }
            if (typeof XLSX === 'undefined') {
                alert('Excel library is still loading. Please try again.');
                return;
            }

            try {
                const data = await file.arrayBuffer();
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const rawJson = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                if (!rawJson || rawJson.length < 2) {
                    alert('The Excel file appears to be empty or lacks data rows.');
                    return;
                }

                let headerRowIdx = -1;
                let colEnrollment = -1;
                let colName = -1;
                let colSection = -1;

                for (let i = 0; i < Math.min(10, rawJson.length); i++) {
                    const row = rawJson[i];
                    if (!Array.isArray(row)) continue;
                    for (let j = 0; j < row.length; j++) {
                        const cell = String(row[j] || '').trim().toLowerCase();
                        if (/enrollment|enrolment|roll|reg|student\s*id/i.test(cell)) colEnrollment = j;
                        if (/^(student\s*)?name|full\s*name$/i.test(cell)) colName = j;
                        if (/section|batch|sec$/i.test(cell)) colSection = j;
                    }
                    if (colEnrollment !== -1) {
                        headerRowIdx = i;
                        break;
                    }
                }

                if (headerRowIdx === -1) {
                    alert('Could not find an "Enrollment ID" or "Roll No" column in the Excel file.\n\nPlease ensure your spreadsheet includes a column header for Enrollment ID.');
                    return;
                }

                const records = [];
                for (let r = headerRowIdx + 1; r < rawJson.length; r++) {
                    const row = rawJson[r];
                    if (!row || !row[colEnrollment]) continue;
                    const enrollment = String(row[colEnrollment] || '').trim().toUpperCase();
                    if (!enrollment) continue;

                    const name = colName !== -1 && row[colName] ? String(row[colName]).trim() : enrollment;
                    const section = colSection !== -1 && row[colSection] ? String(row[colSection]).trim() : '';

                    records.push({ enrollment, name, section });
                }

                if (records.length === 0) {
                    alert('No valid student records found in the uploaded file.');
                    return;
                }

                if (!confirm(`Found ${records.length} students in "${file.name}".\n\nUpload and record attendance for these students?`)) {
                    return;
                }

                const res = await apiFetch('/api/teacher/attendance/bulk-upload', {
                    method: 'POST',
                    body: JSON.stringify({
                        subjectId: currentAttendanceSubjectId,
                        records,
                        sessionDate: new Date().toISOString()
                    })
                });

                const resData = await res.json();
                if (!res.ok) {
                    alert(resData.error || 'Failed to upload attendance records.');
                    return;
                }

                alert(`Successfully recorded attendance for ${resData.count} students!`);
                loadSubjectAttendancePage(currentAttendanceSubjectId, currentAttendanceMonth);
                refreshStats();
                loadSubjects();
            } catch (e) {
                console.error('Error parsing Excel:', e);
                alert('Error parsing Excel file. Please ensure it is a valid .xlsx or .xls file.');
            }
        }

        /* ── Subject Modals ── */
        function buildSemesterChoices(currentSemester = '') {
            const semesters = ['1st Sem', '2nd Sem', '3rd Sem', '4th Sem', '5th Sem', '6th Sem', '7th Sem', '8th Sem'];
            const hasCustomSemester = Boolean(currentSemester && !semesters.includes(currentSemester));
            const options = [
                `<option value="" ${currentSemester ? '' : 'selected'}>Select semester</option>`,
                ...semesters.map(value => `<option value="${value}" ${currentSemester === value ? 'selected' : ''}>${value}</option>`),
                `<option value="__custom__" ${hasCustomSemester ? 'selected' : ''}>Other / custom</option>`
            ].join('');
            return { hasCustomSemester, options };
        }

        function toggleCustomSemester(selectId, inputId) {
            const customSemester = document.getElementById(inputId);
            customSemester.hidden = document.getElementById(selectId).value !== '__custom__';
            if (!customSemester.hidden) customSemester.focus({ preventScroll: true });
        }

        function openAddSubjectModal() {
            const semesterChoices = buildSemesterChoices();
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
            overlay.innerHTML = `
                <div class="modal-dialog modal-dialog-scroll add-subject-dialog">
                    <h2>Add Course Subject</h2>
                    <p class="sub">Add a subject to your teaching catalog across your departments.</p>
                    <div class="add-subject-grid">
                        <div class="add-subject-field modern-input-group" style="margin-bottom: 0;">
                            <div class="modern-input-body">
                                <label for="newSubjName">Course / Subject Name</label>
                                <input id="newSubjName" placeholder="e.g. Data Structures & Algorithms">
                            </div>
                        </div>
                        <div class="add-subject-field modern-input-group" style="margin-bottom: 0;">
                            <div class="modern-input-body">
                                <label for="newSubjCode">Course Code</label>
                                <input id="newSubjCode" placeholder="e.g. CS-204">
                            </div>
                        </div>
                        <div class="add-subject-field modern-input-group" style="margin-bottom: 0;">
                            <div class="modern-input-body">
                                <label for="newSubjDept">Department / Stream</label>
                                <input id="newSubjDept" placeholder="e.g. CSE, IT, BCA">
                            </div>
                        </div>
                        <div class="add-subject-field modern-input-group" style="margin-bottom: 0; flex-direction: column; align-items: stretch;">
                            <div class="modern-input-body">
                                <label for="newSubjSemester">Semester</label>
                                <select id="newSubjSemester" style="border: none; outline: none; background: transparent; font-size: 16px; color: #10264B; font-weight: 500; width: 100%;" onchange="toggleCustomSemester('newSubjSemester', 'newSubjSemesterCustom')">
                                    ${semesterChoices.options}
                                </select>
                                <input id="newSubjSemesterCustom" class="semester-custom-input" style="margin-top: 8px; border-top: 1px dashed #E2E8F0; padding-top: 8px;" placeholder="Enter a custom semester" hidden>
                            </div>
                        </div>
                        <div class="add-subject-field modern-input-group" style="margin-bottom: 0;">
                            <div class="modern-input-body">
                                <label for="newSubjSection">Section / Batch</label>
                                <input id="newSubjSection" placeholder="e.g. A, B, Sec-1" oninput="this.value = this.value.toUpperCase()">
                            </div>
                        </div>
                    </div>
                    <p class="modal-error" id="newSubjError"></p>
                    <div class="modal-actions" style="margin-top: 24px; align-items: center;">
                        <button class="modern-btn-secondary" style="width: auto; padding: 0 24px; height: 44px; margin-top: 0;" onclick="closeModal()">Cancel</button>
                        <button class="modern-btn-primary" id="addSubjectBtn" style="width: auto; padding: 0 24px; height: 44px;" onclick="submitAddSubject()">Save Subject</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            document.getElementById('newSubjName').focus({ preventScroll: true });
        }

        async function submitAddSubject() {
            const btn = document.getElementById('addSubjectBtn');
            const errEl = document.getElementById('newSubjError');
            errEl.textContent = '';

            const name = document.getElementById('newSubjName').value.trim();
            const code = document.getElementById('newSubjCode').value.trim();
            const department = document.getElementById('newSubjDept').value.trim();
            const semesterChoice = document.getElementById('newSubjSemester').value;
            const semester = semesterChoice === '__custom__'
                ? document.getElementById('newSubjSemesterCustom').value.trim()
                : semesterChoice;
            const section = document.getElementById('newSubjSection').value.trim();

            if (!name) {
                errEl.textContent = 'Please enter a subject name';
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Saving…';

            try {
                const r = await apiFetch('/api/teacher/subjects', {
                    method: 'POST',
                    body: JSON.stringify({ name, code, department, section, semester })
                });
                const data = await r.json();
                if (!r.ok) {
                    errEl.textContent = data.error || 'Failed to save subject';
                    btn.disabled = false;
                    btn.textContent = 'Save Subject';
                    return;
                }
                closeModal();
                loadSubjects();
            } catch (e) {
                errEl.textContent = 'Network error. Please try again.';
                btn.disabled = false;
                btn.textContent = 'Save Subject';
            }
        }

        function openEditSubjectModal(subjectId) {
            const subj = teacherSubjects.find(s => s.id === subjectId);
            if (!subj) return;
            const currentSemester = subj.semester || '';
            const semesterChoices = buildSemesterChoices(currentSemester);

            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
            overlay.innerHTML = `
                <div class="modal-dialog modal-dialog-scroll edit-subject-dialog">
                    <h2>Edit Course Subject</h2>
                    <p class="sub">Update subject details and department information.</p>
                    <div class="edit-subject-grid">
                        <div class="edit-subject-field modern-input-group" style="margin-bottom: 0;">
                            <div class="modern-input-body">
                                <label for="editSubjName">Course / Subject Name</label>
                                <input id="editSubjName" value="${esc(subj.name)}">
                            </div>
                        </div>
                        <div class="edit-subject-field modern-input-group" style="margin-bottom: 0;">
                            <div class="modern-input-body">
                                <label for="editSubjCode">Course Code</label>
                                <input id="editSubjCode" value="${esc(subj.code || '')}">
                            </div>
                        </div>
                        <div class="edit-subject-field modern-input-group" style="margin-bottom: 0;">
                            <div class="modern-input-body">
                                <label for="editSubjDept">Department / Stream</label>
                                <input id="editSubjDept" value="${esc(subj.department || '')}">
                            </div>
                        </div>
                        <div class="edit-subject-field modern-input-group" style="margin-bottom: 0; flex-direction: column; align-items: stretch;">
                            <div class="modern-input-body">
                                <label for="editSubjSemester">Semester</label>
                                <select id="editSubjSemester" style="border: none; outline: none; background: transparent; font-size: 16px; color: #10264B; font-weight: 500; width: 100%;" onchange="toggleCustomSemester('editSubjSemester', 'editSubjSemesterCustom')">
                                    ${semesterChoices.options}
                                </select>
                                <input id="editSubjSemesterCustom" class="semester-custom-input" style="margin-top: 8px; border-top: 1px dashed #E2E8F0; padding-top: 8px;" value="${semesterChoices.hasCustomSemester ? esc(currentSemester) : ''}" placeholder="Enter a custom semester" ${semesterChoices.hasCustomSemester ? '' : 'hidden'}>
                            </div>
                        </div>
                        <div class="edit-subject-field modern-input-group" style="margin-bottom: 0;">
                            <div class="modern-input-body">
                                <label for="editSubjSection">Section / Batch</label>
                                <input id="editSubjSection" value="${esc(subj.section || '')}" placeholder="e.g. A, B, Sec-1" oninput="this.value = this.value.toUpperCase()">
                            </div>
                        </div>
                    </div>
                    <datalist id="semesterList">
                        <option value="1st Sem">
                        <option value="2nd Sem">
                        <option value="3rd Sem">
                        <option value="4th Sem">
                        <option value="5th Sem">
                        <option value="6th Sem">
                        <option value="7th Sem">
                        <option value="8th Sem">
                    </datalist>
                    <p class="modal-error" id="editSubjError"></p>
                    <div class="modal-actions" style="margin-top: 24px; align-items: center;">
                        <button class="modern-btn-secondary" style="width: auto; padding: 0 24px; height: 44px; margin-top: 0;" onclick="closeModal()">Cancel</button>
                        <button class="modern-btn-primary" id="saveEditSubjectBtn" style="width: auto; padding: 0 24px; height: 44px;" onclick="submitEditSubject('${esc(subj.id)}')">Save Changes</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            document.getElementById('editSubjName').focus({ preventScroll: true });
        }

        async function submitEditSubject(subjectId) {
            const btn = document.getElementById('saveEditSubjectBtn');
            const errEl = document.getElementById('editSubjError');
            errEl.textContent = '';

            const name = document.getElementById('editSubjName').value.trim();
            const code = document.getElementById('editSubjCode').value.trim();
            const department = document.getElementById('editSubjDept').value.trim();
            const semesterChoice = document.getElementById('editSubjSemester').value;
            const semester = semesterChoice === '__custom__'
                ? document.getElementById('editSubjSemesterCustom').value.trim()
                : semesterChoice;
            const section = document.getElementById('editSubjSection').value.trim();

            if (!name) {
                errEl.textContent = 'Please enter a subject name';
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Saving…';

            try {
                const r = await apiFetch('/api/teacher/subjects/edit', {
                    method: 'POST',
                    body: JSON.stringify({ subjectId, name, code, department, section, semester })
                });
                const data = await r.json();
                if (!r.ok) {
                    errEl.textContent = data.error || 'Failed to update subject';
                    btn.disabled = false;
                    btn.textContent = 'Save Changes';
                    return;
                }
                closeModal();
                loadSubjects();
            } catch (e) {
                errEl.textContent = 'Network error. Please try again.';
                btn.disabled = false;
                btn.textContent = 'Save Changes';
            }
        }

        function openDeleteSubjectModal(subjectId) {
            const subj = teacherSubjects.find(s => s.id === subjectId);
            if (!subj) return;

            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
            overlay.innerHTML = `
                <div class="modal-dialog">
                    <h2>Remove Course Subject</h2>
                    <p class="sub modal-confirmation-copy">Are you sure you want to remove <strong>${esc(subj.name)}</strong> from your catalog?</p>
                    <p class="modal-confirmation-note">Past attendance records for completed sessions will remain safely preserved.</p>
                    <p class="modal-error" id="deleteSubjError"></p>
                    <div class="modal-actions">
                        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                        <button class="btn btn-danger" id="deleteSubjConfirmBtn" onclick="confirmDeleteSubject('${esc(subj.id)}')">Remove</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
        }

        async function confirmDeleteSubject(subjectId) {
            const btn = document.getElementById('deleteSubjConfirmBtn');
            btn.disabled = true;
            btn.textContent = 'Removing…';

            try {
                const r = await apiFetch('/api/teacher/subjects/delete', {
                    method: 'POST',
                    body: JSON.stringify({ subjectId })
                });
                closeModal();
                loadSubjects();
            } catch (e) {
                closeModal();
            }
        }

        /* ── Session & QR Lifecycle ── */
        function startSessionTimer(startTime) {
            sessionStartTime = startTime ? new Date(startTime) : new Date();
            if (sessionTimerInterval) clearInterval(sessionTimerInterval);

            function updateTimer() {
                const diffMs = Math.max(0, new Date() - sessionStartTime);
                const mins = Math.floor(diffMs / 60000);
                const secs = Math.floor((diffMs % 60000) / 1000);
                const timeStr = `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;

                const dot = document.getElementById('statSessionDot');
                if (dot) dot.className = 'stat-indicator live';
                const text = document.getElementById('statSessionStatusText');
                if (text) text.innerHTML = `<span class="session-live-label">Live</span> · ${timeStr}`;
            }

            updateTimer();
            sessionTimerInterval = setInterval(updateTimer, 1000);
        }

        function stopSessionTimer() {
            if (sessionTimerInterval) {
                clearInterval(sessionTimerInterval);
                sessionTimerInterval = null;
            }
            const dot = document.getElementById('statSessionDot');
            if (dot) dot.className = 'stat-indicator';
            const total = document.getElementById('statSessions').textContent || '0';
            const text = document.getElementById('statSessionStatusText');
            if (text) text.innerHTML = `Inactive · <span id="statSessions" class="stat-session-total">${total}</span>`;
        }

        function renderQr(qrToken, customSubjectTitle) {
            const box = document.getElementById('qrBox');
            const shell = document.getElementById('qrShell');
            const placeholder = document.getElementById('qrPlaceholder');
            const live = document.getElementById('qrLive');
            const statusPill = document.getElementById('qrStatusPill');
            const projBox = document.getElementById('projectorQrBox');

            box.innerHTML = '';
            if (projBox) projBox.innerHTML = '';
            document.getElementById('qrHint').hidden = true;

            if (!qrToken) {
                shell.classList.remove('live');
                placeholder.hidden = false;
                live.hidden = true;
                if (statusPill) {
                    statusPill.textContent = 'Idle';
                    statusPill.classList.remove('is-active');
                    statusPill.classList.add('is-idle');
                }
                stopSessionTimer();
                return;
            }

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
            if (boxCanvas) boxCanvas.remove();

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
                if (projCanvas) projCanvas.remove();
            }

            const subjectVal = (customSubjectTitle || document.getElementById('subject').value || (currentSelectedSubject ? currentSelectedSubject.name : '') || 'Class Session').trim();
            document.getElementById('subject').value = subjectVal;
            document.getElementById('qrSubjectName').textContent = subjectVal;
            const projTitle = document.getElementById('projectorSubjectTitle');
            if (projTitle) projTitle.textContent = subjectVal;

            document.getElementById('qrHint').hidden = false;
            shell.classList.add('live');
            placeholder.hidden = true;
            live.hidden = false;

            if (statusPill) {
                statusPill.textContent = 'Active';
                statusPill.classList.remove('is-idle');
                statusPill.classList.add('is-active');
            }
        }

        function setSessionActionState(isActive) {
            document.getElementById('startBtn').hidden = isActive;
            document.getElementById('closeBtn').hidden = !isActive;
        }

        async function generateSession() {
            const liveSelect = document.getElementById('liveSubjectSelect');
            let subjectId = currentSelectedSubject ? currentSelectedSubject.id : (liveSelect ? liveSelect.value : null);
            if (!subjectId && liveSelect && liveSelect.value) {
                subjectId = liveSelect.value;
                currentSelectedSubject = teacherSubjects.find(s => s.id === subjectId) || null;
            }
            if (!subjectId && teacherSubjects && teacherSubjects.length > 0) {
                alert('Please choose a subject from your catalog before launching attendance.');
                if (liveSelect) liveSelect.focus();
                return;
            }

            const subject = document.getElementById('subject').value.trim() || (currentSelectedSubject ? `${currentSelectedSubject.code ? currentSelectedSubject.code + ' ' : ''}${currentSelectedSubject.name}${currentSelectedSubject.section ? ' (Sec ' + currentSelectedSubject.section + ')' : ''}` : 'General Session');

            try {
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
                presentList = [];
                renderRows();
                setSessionActionState(true);
                document.getElementById('statSubject').textContent = (currentSelectedSubject ? currentSelectedSubject.name : subject) || 'General';
                startSessionTimer(new Date());
                refreshStats();
                loadSubjects();
            } catch (err) {
                console.error(err);
                alert('Network error while starting attendance session.');
            }
        }

        async function closeSession() {
            await apiFetch('/api/close-session', {
                method: 'POST',
                body: JSON.stringify({})
            });
            setSessionActionState(false);
            renderQr(null);
            closeProjectorModal();
            refreshStats();
            loadSubjects();
        }

        function connectStream() {
            // Close any existing connection before opening a new one
            if (_activeEventSource) {
                _activeEventSource.onmessage = null;
                _activeEventSource.onerror = null;
                _activeEventSource.close();
                _activeEventSource = null;
            }

            const es = new EventSource(`/api/stream?token=${encodeURIComponent(teacherToken || '')}`);
            _activeEventSource = es;

            es.onopen = () => {
                // Connection established — reset the backoff delay
                _reconnectDelay = 3000;
            };

            es.onmessage = (e) => {
                const data = JSON.parse(e.data);
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
                if (data.type === 'closed') {
                    renderQr(null);
                    setSessionActionState(false);
                    loadSubjects();
                }
                if (data.type === 'mark') {
                    presentList.push(data.student);
                    renderRows();
                    const newTr = document.getElementById('rows').querySelector(`tr[data-enrollment="${CSS.escape(data.student.enrollment)}"]`);
                    if (newTr) {
                        const stamp = newTr.querySelector('.stamp');
                        if (stamp) stamp.classList.add('animate');
                    }
                }
                if (data.type === 'init' && data.session) {
                    currentSessionId = data.session.id;
                    renderQr(data.session.active ? data.session.qrToken : null, data.session.subject);
                    setSessionActionState(data.session.active);
                    document.getElementById('statSubject').textContent = data.session.subject || '–';
                    presentList = Object.values(data.session.present || {});
                    renderRows();
                    if (data.session.active) {
                        startSessionTimer(data.session.createdAt);
                    }
                }
                if (data.type === 'student-updated') {
                    const oldEnr = data.oldEnrollment;
                    const s = data.student;
                    const idx = presentList.findIndex(p => p.enrollment === oldEnr);
                    if (idx !== -1) {
                        presentList[idx] = { name: s.name, enrollment: s.enrollment, section: s.section, time: s.time };
                        renderRows();
                    }
                }
                if (data.type === 'student-deleted') {
                    presentList = presentList.filter(p => p.enrollment !== data.enrollment);
                    renderRows();
                }
            };

            es.onerror = () => {
                // Connection dropped — schedule a reconnect with exponential backoff
                es.close();
                _activeEventSource = null;
                clearTimeout(_reconnectTimer);
                _reconnectTimer = setTimeout(() => {
                    _reconnectDelay = Math.min(_reconnectDelay * 2, 30000); // cap at 30s
                    connectStream();
                }, _reconnectDelay);
            };
        }


        function esc(str) {
            const d = document.createElement('div');
            d.textContent = str || '';
            return d.innerHTML;
        }

        function addRow(s, animate) {
            const tr = document.createElement('tr');
            tr.setAttribute('data-enrollment', s.enrollment);
            const initials = getInitials(s.name);
            const timeFormatted = new Date(s.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            tr.innerHTML = `
                <td>
                    <div class="student-cell">
                        <div class="student-avatar">${initials}</div>
                        <span class="cell-name">${esc(s.name)}</span>
                    </div>
                </td>
                <td class="hide-on-mobile"><span class="cell-enrollment">${esc(s.enrollment)}</span></td>
                <td class="hide-on-mobile"><span class="cell-section">${esc(s.section)}</span></td>
                <td class="attendance-time">${timeFormatted}</td>
                <td class="hide-on-mobile"><span class="stamp${animate ? ' animate' : ''}">Present</span></td>
                <td class="text-right">
                    <div class="subject-card-tools" style="justify-content: flex-end;">
                        <button class="card-action-btn" data-name="${esc(s.name)}" data-enrollment="${esc(s.enrollment)}" data-section="${esc(s.section)}" onclick="openEditModal(this)" title="Edit">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="card-action-btn delete-btn" data-enrollment="${esc(s.enrollment)}" onclick="openDeleteModal(this)" title="Delete">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </td>
            `;
            document.getElementById('rows').appendChild(tr);
        }

        async function refreshStats() {
            try {
                const r = await apiFetch(`/api/history`);
                const list = await r.json();
                document.getElementById('statSessions').textContent = `${list.length} total`;
            } catch (e) {
                console.error(e);
            }
        }

        /* ── History Filter & Listing ── */
        function renderHistoryFilters() {
            const container = document.getElementById('historyFilters');
            if (!container) return;
            container.innerHTML = '';

            const allBtn = document.createElement('button');
            allBtn.className = `filter-chip ${!activeHistorySubjectFilter ? 'active' : ''}`;
            allBtn.textContent = 'All Subjects';
            allBtn.onclick = () => {
                activeHistorySubjectFilter = '';
                loadHistory();
            };
            container.appendChild(allBtn);

            teacherSubjects.forEach(s => {
                const btn = document.createElement('button');
                btn.className = `filter-chip ${activeHistorySubjectFilter === s.id ? 'active' : ''}`;
                const secLabel = s.section ? ` (Sec ${s.section})` : '';
                btn.textContent = `${s.code ? s.code + ' ' : ''}${s.name}${secLabel}`;
                btn.onclick = () => {
                    activeHistorySubjectFilter = s.id;
                    loadHistory();
                };
                container.appendChild(btn);
            });
        }

        async function loadHistory() {
            try {
                let url = `/api/history`;
                if (activeHistorySubjectFilter) {
                    url += `?subjectId=${encodeURIComponent(activeHistorySubjectFilter)}`;
                }
                const r = await apiFetch(url);
                const list = await r.json();
                const el = document.getElementById('histList');
                el.innerHTML = list.length ? '' : '<p class="history-empty">No sessions found for this selection.</p>';

                renderHistoryFilters();

                list.forEach(s => {
                    const div = document.createElement('div');
                    div.className = 'hist-row';
                    const dateStr = new Date(s.createdAt).toLocaleDateString([], {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    div.innerHTML = `
                        <div>
                            <strong>${esc(s.subject || 'General Session')}</strong><br>
                            <span class="muted">${dateStr} · <strong>${s.count}</strong> students present</span>
                        </div>
                        <div class="history-row-actions" style="display: flex; align-items: center; gap: 8px;">
                            <span class="badge ${s.active ? '' : 'closed'}">${s.active ? 'active' : 'closed'}</span>
                            <div class="subject-card-tools" style="margin-left: 8px;">
                                <button class="card-action-btn" onclick="location.href='/api/export?id=${s.id}'" title="Export CSV">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                </button>
                                <button class="card-action-btn delete-btn" onclick="deleteSession(${s.id})" title="Delete Session">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                </button>
                            </div>
                        </div>
                    `;
                    el.appendChild(div);
                });
            } catch (e) {
                console.error(e);
            }
        }

        async function deleteSession(sessionId) {
            if (!confirm('Delete this session? This will permanently remove all attendance records for it.')) return;
            await apiFetch('/api/delete-session', {
                method: 'POST',
                body: JSON.stringify({ sessionId })
            });
            loadHistory();
            refreshStats();
            loadSubjects();
        }

        /* ── Projector Mode Handlers ── */
        function openProjectorModal() {
            document.getElementById('projectorModal').hidden = false;
        }

        function closeProjectorModal() {
            document.getElementById('projectorModal').hidden = true;
        }

        /* ── Student Edit/Delete Modal Helpers ── */
        function closeModal() {
            const overlay = document.querySelector('.modal-overlay');
            if (overlay) overlay.remove();
        }

        function openEditModal(btn) {
            const name = btn.getAttribute('data-name');
            const enrollment = btn.getAttribute('data-enrollment');
            const section = btn.getAttribute('data-section');

            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
            overlay.innerHTML = `
                <div class="modal-dialog">
                    <h2>Edit Student Details</h2>
                    <p class="sub">Update the attendance record for this student.</p>
                    <label>Full Name</label>
                    <input id="editName" value="${esc(name)}">
                    <label>Enrollment ID</label>
                    <input id="editEnrollment" value="${esc(enrollment)}" oninput="this.value = this.value.toUpperCase()">
                    <label>Section</label>
                    <input id="editSection" value="${esc(section)}" maxlength="6" oninput="this.value = this.value.toUpperCase()">
                    <p class="modal-error" id="editError"></p>
                    <div class="modal-actions">
                        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                        <button id="editSubmitBtn" onclick="submitEdit('${esc(enrollment)}')">Save Changes</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            document.getElementById('editName').focus();
        }

        async function submitEdit(oldEnrollment) {
            const btn = document.getElementById('editSubmitBtn');
            const errEl = document.getElementById('editError');
            errEl.textContent = '';
            btn.disabled = true;
            btn.textContent = 'Saving…';

            const name = document.getElementById('editName').value;
            const enrollment = document.getElementById('editEnrollment').value;
            const section = document.getElementById('editSection').value;

            if (!currentSessionId) {
                errEl.textContent = 'No active session found';
                btn.disabled = false;
                btn.textContent = 'Save Changes';
                return;
            }

            try {
                const r = await apiFetch(`/api/session/${currentSessionId}/student/edit`, {
                    method: 'POST',
                    body: JSON.stringify({ oldEnrollment, name, enrollment, section })
                });
                const data = await r.json();
                if (!r.ok) {
                    errEl.textContent = data.error || 'Failed to update student';
                    btn.disabled = false;
                    btn.textContent = 'Save Changes';
                    return;
                }
                closeModal();
            } catch (e) {
                errEl.textContent = 'Network error. Please try again.';
                btn.disabled = false;
                btn.textContent = 'Save Changes';
            }
        }

        function openDeleteModal(btn) {
            const enrollment = btn.getAttribute('data-enrollment');

            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
            overlay.innerHTML = `
                <div class="modal-dialog">
                    <h2>Remove Attendance</h2>
                    <p class="sub modal-confirmation-copy">Are you sure you want to remove this student's attendance from the current session?</p>
                    <p class="modal-confirmation-note">This will remove them from today's register but preserves their student profile.</p>
                    <p class="modal-error" id="deleteError"></p>
                    <div class="modal-actions">
                        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                        <button class="btn btn-danger" id="deleteConfirmBtn" onclick="confirmDelete('${esc(enrollment)}')">Remove</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
        }

        async function confirmDelete(enrollment) {
            const btn = document.getElementById('deleteConfirmBtn');
            btn.disabled = true;
            btn.textContent = 'Removing…';

            if (!currentSessionId) {
                closeModal();
                return;
            }

            try {
                await apiFetch(`/api/session/${currentSessionId}/student/delete`, {
                    method: 'POST',
                    body: JSON.stringify({ enrollment })
                });
                closeModal();
            } catch (e) {
                closeModal();
            }
        }