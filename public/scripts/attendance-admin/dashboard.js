const adminToken = localStorage.getItem('admin_token');
const adminDataStr = localStorage.getItem('admin_data');

if (!adminToken || !adminDataStr) {
    window.location.href = '/login';
}

let currentAdminUser = 'admin';
try {
    const adminData = JSON.parse(adminDataStr);
    currentAdminUser = adminData.name || 'admin';
} catch(e) {}

// Helper: fetch() with admin Authorization header automatically attached
function adminApiFetch(url, options = {}) {
    options.headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    options.headers['Authorization'] = `Bearer ${adminToken}`;
    return fetch(url, options);
}

function togglePassVisibility(btn) {
    const wrap = btn.closest('.password-wrap');
    if (!wrap) return;
    const input = wrap.querySelector('input');
    if (!input) return;
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
    btn.setAttribute('aria-pressed', String(isHidden));
    const openEye = btn.querySelector('.eye-open');
    const slashedEye = btn.querySelector('.eye-slashed');
    if (openEye && slashedEye) {
        openEye.style.display = isHidden ? 'none' : 'block';
        slashedEye.style.display = isHidden ? 'block' : 'none';
    }
}
window.togglePassVisibility = togglePassVisibility;

function setupPasswordToggles() {
    const toggles = document.querySelectorAll('[data-password-toggle]:not([data-toggle-bound])');
    toggles.forEach((toggle) => {
        toggle.setAttribute('data-toggle-bound', 'true');
        toggle.addEventListener('click', () => togglePassVisibility(toggle));
    });
}

document.addEventListener('DOMContentLoaded', setupPasswordToggles);
setupPasswordToggles();

function showTab(tab) {
    const tabs = {
        teachers: ['tabTeachers', 'panelTeachers'],
        students: ['tabStudents', 'panelStudents'],
        security: ['tabSecurity', 'panelSecurity']
    };

    Object.entries(tabs).forEach(([name, [tabId, panelId]]) => {
        const isActive = name === tab;
        const tabButton = document.getElementById(tabId);
        const panel = document.getElementById(panelId);
        tabButton.classList.toggle('active', isActive);
        tabButton.setAttribute('aria-selected', String(isActive));
        tabButton.tabIndex = isActive ? 0 : -1;
        panel.classList.toggle('is-hidden', !isActive);
        panel.hidden = !isActive;
    });

    const tabsContainer = document.getElementById('tabs') || document.querySelector('.segmented-control');
    if (tabsContainer) {
        tabsContainer.dataset.activeTab = tab;
    }

    if (tab === 'teachers') loadTeachers();
    if (tab === 'students') loadStudents();
}

document.querySelector('[role="tablist"]').addEventListener('keydown', (event) => {
    const tabButtons = Array.from(document.querySelectorAll('[role="tab"]'));
    const currentIndex = tabButtons.indexOf(document.activeElement);
    if (currentIndex === -1) return;

    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabButtons.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabButtons.length) % tabButtons.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabButtons.length - 1;
    if (nextIndex === currentIndex) return;

    event.preventDefault();
    tabButtons[nextIndex].focus();
    tabButtons[nextIndex].click();
});

function logout() { 
    localStorage.removeItem('admin_token'); 
    localStorage.removeItem('admin_data');
    window.location.href = '/main';
}

// Initial load
loadTeachers();

async function addTeacher() {
            const name = document.getElementById('name').value.trim();
            const username = document.getElementById('username').value.trim();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;

            if (!name || !username || !password) {
                return alert('Please fill in Name, Username, and Password.');
            }

            try {
                const r = await adminApiFetch('/api/admin/teachers', {
                    method: 'POST',
                    body: JSON.stringify({ name, username, email, password })
                });
                const data = await r.json();
                if (r.ok) {
                    document.getElementById('name').value = '';
                    document.getElementById('username').value = '';
                    document.getElementById('email').value = '';
                    document.getElementById('password').value = '';
                    loadTeachers();
                } else {
                    alert(data.error || 'Failed to add teacher');
                }
            } catch (e) {
                console.error('Failed to add teacher:', e);
                alert('Network error while adding teacher');
            }
        }

        window.allTeachers = [];
        async function loadTeachers() {
            try {
                const r = await adminApiFetch('/api/admin/teachers');
                window.allTeachers = await r.json();
                filterTeachers();
            } catch (e) {
                console.error('Failed to load teachers:', e);
            }
        }

        function filterTeachers() {
            const q = (document.getElementById('teacherSearch').value || '').toLowerCase();
            const list = window.allTeachers.filter(t => t.name.toLowerCase().includes(q) || t.username.toLowerCase().includes(q) || (t.email && t.email.toLowerCase().includes(q)));
                    document.getElementById('teacherCount').textContent = list.length;
            renderTeachers(list);
        }

        function syncRecordActionDisclosure(row, isMobile = window.matchMedia('(max-width: 720px)').matches) {
            const summary = row.querySelector('.record-summary');
            const actions = row.querySelector('.action-btns');
            if (!isMobile) row.classList.remove('show-actions');
            const isExpanded = isMobile && row.classList.contains('show-actions');
            summary.setAttribute('aria-expanded', String(isExpanded));
            actions.inert = isMobile && !isExpanded;
            actions.setAttribute('aria-hidden', String(isMobile && !isExpanded));
        }

        window.matchMedia('(max-width: 720px)').addEventListener('change', (event) => {
            document.querySelectorAll('.admin-record-row').forEach(row => {
                syncRecordActionDisclosure(row, event.matches);
            });
        });

        function setupRecordActionDisclosure(row) {
            const summary = row.querySelector('.record-summary');
            summary.addEventListener('click', () => {
                if (!window.matchMedia('(max-width: 720px)').matches) return;
                row.classList.toggle('show-actions');
                syncRecordActionDisclosure(row);
            });
            syncRecordActionDisclosure(row);
        }

        function escapeHtml(str) {
            if (!str) return '';
            return String(str).replace(/[&<>"']/g, function(m) {
                return {
                    '&': '&amp;', '<': '&lt;', '>': '&gt;',
                    '"': '&quot;', "'": '&#39;'
                }[m];
            });
        }

        function jsArg(val) {
            return escapeHtml(JSON.stringify(val == null ? '' : val));
        }

        function renderTeachers(list) {
            const el = document.getElementById('list');
            el.innerHTML = list.length ? '' : '<p class="empty">No teachers found.</p>';
                    list.forEach((t, index) => {
                const div = document.createElement('div');
                div.className = 'row admin-record-row';
                        const actionId = `teacher-actions-${index}`;
                        div.innerHTML = `<div class="record-identity">
                    <strong>${escapeHtml(t.name)}</strong>
                    <span class="handle">@${escapeHtml(t.username)}</span>
                </div>
                        <button class="record-summary" type="button" aria-expanded="false" aria-controls="${actionId}">
                            <span class="record-summary-text"><strong>${escapeHtml(t.name)}</strong><span>${escapeHtml(t.username)}</span></span>
                            <i data-lucide="chevron-down" aria-hidden="true"></i>
                        </button>
                        <div class="action-btns" id="${actionId}">
                    <button class="btn btn-secondary" type="button" title="Reset Password" aria-label="Reset password for ${escapeHtml(t.name)}" onclick="openResetPasswordModal('teacher', ${jsArg(String(t.id))}, ${jsArg(t.name)}, ${jsArg(t.email || '')})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><path d="m2 21 9.6-9.6"/><path d="m7.5 15.5 2.3 2.3a1 1 0 0 1 0 1.4l-2.1 2.1a1 1 0 0 1-1.4 0L4 19"/><circle cx="15.5" cy="7.5" r="5.5"/></svg></button>
                    <button class="btn btn-secondary" type="button" title="Edit" aria-label="Edit ${escapeHtml(t.name)}" onclick="openEditTeacherModal(${jsArg(String(t.id))}, ${jsArg(t.name)}, ${jsArg(t.username)}, ${jsArg(t.email || '')})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                    <button class="btn btn-danger" type="button" title="Remove" aria-label="Remove ${escapeHtml(t.name)}" onclick="removeTeacher(${jsArg(String(t.id))})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                </div>`;
                        setupRecordActionDisclosure(div);
                el.appendChild(div);
            });
            if (window.lucide) window.lucide.createIcons();
        }

        function toggleAddTeacher() {
            const b = document.getElementById('addTeacherBlock');
            b.hidden = !b.hidden;
            if (!b.hidden) b.querySelector('input')?.focus();
        }


        async function removeTeacher(id) {
            if (!confirm(`Remove teacher?`)) return;
            const r = await adminApiFetch('/api/admin/teachers/delete', {
                method: 'POST',
                body: JSON.stringify({ id })
            });
            if (r.ok) loadTeachers();
            else alert('Failed to remove teacher');
        }

        function openEditTeacherModal(id, name, username, email) {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            
            overlay.addEventListener('click', (e) => { 
                if (e.target === overlay) {
                    overlay.classList.remove('active');
                    setTimeout(() => document.body.removeChild(overlay), 200);
                } 
            });

            overlay.innerHTML = `
                <div class="modal-dialog">
                    <h2 class="modal-title">Edit Teacher</h2>
                    <p class="modal-desc">Update the teacher's details.</p>
                    <label>Name</label>
                    <input type="text" id="editTeacherName" class="form-control" value="${name}">
                    <label>Username</label>
                    <input type="text" id="editTeacherUsername" class="form-control" value="${username}">
                    <label>Email</label>
                    <input type="email" id="editTeacherEmail" class="form-control" value="${email}">
                    <p id="editTeacherError" class="status-message is-error" style="display:none;"></p>
                    <div class="modal-actions">
                        <button class="btn btn-secondary" onclick="const ov = this.closest('.modal-overlay'); ov.classList.remove('active'); setTimeout(() => ov.remove(), 200);">Cancel</button>
                        <button class="btn btn-primary" id="editTeacherSaveBtn">Save Changes</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(overlay);
            requestAnimationFrame(() => overlay.classList.add('active'));

            document.getElementById('editTeacherSaveBtn').addEventListener('click', async (e) => {
                const btn = e.target;
                const errEl = document.getElementById('editTeacherError');
                errEl.style.display = 'none';
                btn.disabled = true;
                btn.textContent = 'Saving...';

                const newName = document.getElementById('editTeacherName').value;
                const newUsername = document.getElementById('editTeacherUsername').value;
                const newEmail = document.getElementById('editTeacherEmail').value;

                try {
                    const r = await adminApiFetch('/api/admin/teachers/edit', {
                        method: 'POST',
                        body: JSON.stringify({ id: id, name: newName, username: newUsername, email: newEmail })
                    });
                    const data = await r.json();
                    if (r.ok) {
                        overlay.classList.remove('active');
                        setTimeout(() => document.body.removeChild(overlay), 200);
                        loadTeachers();
                    } else {
                        errEl.textContent = data.error || 'Failed to update';
                        errEl.style.display = 'block';
                        btn.disabled = false;
                        btn.textContent = 'Save Changes';
                    }
                } catch (err) {
                    errEl.textContent = 'Network error.';
                    errEl.style.display = 'block';
                    btn.disabled = false;
                    btn.textContent = 'Save Changes';
                }
            });
        }

        function openResetPasswordModal(type, targetId, name, email) {
            const isTeacher = type === 'teacher';
            const roleLabel = isTeacher ? 'Teacher' : 'Student';
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            
            overlay.addEventListener('click', (e) => { 
                if (e.target === overlay) {
                    overlay.classList.remove('active');
                    setTimeout(() => document.body.removeChild(overlay), 200);
                } 
            });

            overlay.innerHTML = `
                <div class="modal-dialog">
                    <h2 class="modal-title">Reset Password</h2>
                    <p class="modal-desc">Set a new password for <strong>${escapeHtml(name)}</strong> (${roleLabel}).</p>
                    
                    <div class="form-field">
                        <label for="adminNewUserPass">New Password</label>
                        <div class="password-wrap" style="position:relative;">
                            <input type="password" id="adminNewUserPass" class="form-control" placeholder="At least 6 characters" autocomplete="new-password">
                            <button type="button" class="password-toggle" data-password-toggle aria-label="Show password" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; padding:6px; color:var(--ink-3);">
                                <svg class="eye-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                <svg class="eye-slashed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" style="display: none;"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle><line x1="2" y1="2" x2="22" y2="22"></line></svg>
                            </button>
                        </div>
                    </div>

                    <div class="form-field" style="margin-top:12px;">
                        <label for="adminConfUserPass">Confirm Password</label>
                        <input type="password" id="adminConfUserPass" class="form-control" placeholder="Re-enter new password" autocomplete="new-password">
                    </div>

                    <p id="resetUserPassMsg" class="status-message is-error" style="display:none; margin-top:10px;"></p>
                    <p id="resetUserPassSuccess" class="status-message is-success" style="display:none; margin-top:10px;"></p>

                    <div class="modal-actions" style="margin-top:20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                        ${email ? `<button type="button" class="btn btn-secondary" id="sendEmailResetBtn" style="font-size:12px;">Send Reset Email</button>` : '<span></span>'}
                        <div style="display:flex; gap:8px; margin-left:auto;">
                            <button type="button" class="btn btn-secondary" onclick="const ov = this.closest('.modal-overlay'); ov.classList.remove('active'); setTimeout(() => ov.remove(), 200);">Cancel</button>
                            <button type="button" class="btn btn-primary" id="saveNewUserPassBtn">Save Password</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);
            requestAnimationFrame(() => overlay.classList.add('active'));

            const passToggle = overlay.querySelector('[data-password-toggle]');
            if (passToggle) {
                passToggle.setAttribute('data-toggle-bound', 'true');
                passToggle.addEventListener('click', () => togglePassVisibility(passToggle));
            }

            const saveBtn = overlay.querySelector('#saveNewUserPassBtn');
            const errEl = overlay.querySelector('#resetUserPassMsg');
            const succEl = overlay.querySelector('#resetUserPassSuccess');

            saveBtn.addEventListener('click', async () => {
                errEl.style.display = 'none';
                succEl.style.display = 'none';
                const pass = document.getElementById('adminNewUserPass').value;
                const conf = document.getElementById('adminConfUserPass').value;

                if (!pass || pass.length < 6) {
                    errEl.textContent = 'Password must be at least 6 characters.';
                    errEl.style.display = 'block';
                    return;
                }
                if (pass !== conf) {
                    errEl.textContent = 'Passwords do not match.';
                    errEl.style.display = 'block';
                    return;
                }

                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';

                try {
                    const endpoint = isTeacher ? '/api/admin/teachers/reset-password' : '/api/admin/students/reset-password';
                    const payload = isTeacher
                        ? { id: targetId, newPassword: pass }
                        : { enrollment: targetId, newPassword: pass };

                    const r = await adminApiFetch(endpoint, {
                        method: 'POST',
                        body: JSON.stringify(payload)
                    });
                    const data = await r.json();

                    if (r.ok) {
                        succEl.textContent = 'Password successfully reset!';
                        succEl.style.display = 'block';
                        setTimeout(() => {
                            overlay.classList.remove('active');
                            setTimeout(() => overlay.remove(), 200);
                        }, 1000);
                    } else {
                        errEl.textContent = data.error || 'Failed to update password.';
                        errEl.style.display = 'block';
                        saveBtn.disabled = false;
                        saveBtn.textContent = 'Save Password';
                    }
                } catch (e) {
                    errEl.textContent = 'Network error.';
                    errEl.style.display = 'block';
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Save Password';
                }
            });

            const emailBtn = overlay.querySelector('#sendEmailResetBtn');
            if (emailBtn) {
                emailBtn.addEventListener('click', async () => {
                    errEl.style.display = 'none';
                    succEl.style.display = 'none';
                    emailBtn.disabled = true;
                    emailBtn.textContent = 'Sending...';

                    try {
                        const endpoint = isTeacher ? '/api/admin/teachers/reset-password' : '/api/admin/students/reset-password';
                        const r = await adminApiFetch(endpoint, {
                            method: 'POST',
                            body: JSON.stringify({ email })
                        });
                        const data = await r.json();

                        if (r.ok) {
                            succEl.textContent = `Reset email sent to ${email}!`;
                            succEl.style.display = 'block';
                            emailBtn.textContent = 'Email Sent';
                        } else {
                            errEl.textContent = data.error || 'Failed to send reset email.';
                            errEl.style.display = 'block';
                            emailBtn.disabled = false;
                            emailBtn.textContent = 'Send Reset Email';
                        }
                    } catch (e) {
                        errEl.textContent = 'Network error.';
                        errEl.style.display = 'block';
                        emailBtn.disabled = false;
                        emailBtn.textContent = 'Send Reset Email';
                    }
                });
            }
        }

        async function resetTeacherPassword(email) {
            if (!email) return alert('This teacher does not have an email registered.');
            const t = (window.allTeachers || []).find(x => x.email === email);
            if (!t) return alert('Teacher not found.');
            openResetPasswordModal('teacher', String(t.id), t.name, email);
        }

        async function addStudent() {
            const name = document.getElementById('studentName').value.trim();
            const enrollment = document.getElementById('studentEnrollment').value.trim();
            const semester = (document.getElementById('studentSemester')?.value || '').trim();
            const section = document.getElementById('studentSection').value.trim();
            const email = document.getElementById('studentEmail').value.trim();
            const password = document.getElementById('studentPassword').value;

            if (!name || !enrollment || !email || !password) {
                return alert('Please fill in Name, Enrollment ID, Email, and Password.');
            }

            try {
                // we can use the regular public registration endpoint
                const r = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, enrollment, section, semester, email, password })
                });
                const data = await r.json();
                if (r.ok) {
                    document.getElementById('studentName').value = '';
                    document.getElementById('studentEnrollment').value = '';
                    if (document.getElementById('studentSemester')) document.getElementById('studentSemester').value = '';
                    document.getElementById('studentSection').value = '';
                    document.getElementById('studentEmail').value = '';
                    document.getElementById('studentPassword').value = '';
                    loadStudents();
                } else {
                    alert(data.error || 'Failed to add student');
                }
            } catch (e) {
                console.error('Failed to add student:', e);
                alert('Network error while adding student');
            }
        }

        window.allStudents = [];
        async function loadStudents() {
            try {
                const r = await adminApiFetch('/api/admin/students');
                window.allStudents = await r.json();
                filterStudents();
            } catch (e) {
                console.error('Failed to load students:', e);
            }
        }

        function filterStudents() {
            const q = (document.getElementById('studentSearch').value || '').toLowerCase();
            const list = window.allStudents.filter(s => s.name.toLowerCase().includes(q) || s.enrollment.toLowerCase().includes(q) || (s.email && s.email.toLowerCase().includes(q)));
            document.getElementById('studentCount').textContent = list.length;
            renderStudents(list);
        }

        function renderStudents(list) {
            const el = document.getElementById('studentList');
            el.innerHTML = list.length ? '' : '<p class="empty">No students found.</p>';
            list.forEach((s, index) => {
                const div = document.createElement('div');
                div.className = 'row admin-record-row';
                const sEmail = s.email || '';
                const isCoord = Boolean(s.is_coordinator);
                const actionId = `student-actions-${index}`;
                const metaParts = [
                    escapeHtml(s.enrollment),
                    s.semester ? escapeHtml(s.semester) : '<span style="color:var(--ink-3)">No Sem</span>',
                    s.section ? 'Sec ' + escapeHtml(s.section) : '<span style="color:var(--ink-3)">No Sec</span>'
                ].filter(Boolean).join(' · ');

                const coordBadge = isCoord
                    ? `<span class="badge-coordinator" style="display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:600; color:#0071e3; background:rgba(0,113,227,0.12); border:1px solid rgba(0,113,227,0.25); border-radius:999px; padding:2px 8px; margin-left:6px; vertical-align:middle;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg> Coordinator</span>`
                    : '';

                div.innerHTML = `<div class="record-identity">
                    <strong>${escapeHtml(s.name)}${coordBadge}</strong>
                    <span class="handle">${metaParts}</span>
                </div>
                <button class="record-summary" type="button" aria-expanded="false" aria-controls="${actionId}">
                    <span class="record-summary-text"><strong>${escapeHtml(s.name)}${coordBadge}</strong><span>${metaParts}</span></span>
                    <i data-lucide="chevron-down" aria-hidden="true"></i>
                </button>
                <div class="action-btns" id="${actionId}">
                    <button class="btn ${isCoord ? 'btn-primary' : 'btn-secondary'} btn-coordinator-toggle" type="button" title="${isCoord ? 'Revoke Coordinator Role' : 'Grant Coordinator Role'}" aria-label="${isCoord ? 'Revoke Coordinator' : 'Grant Coordinator'}" onclick="toggleCoordinatorRole(${jsArg(s.enrollment)}, ${!isCoord})">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                        <span>${isCoord ? 'Coordinator' : 'Make Coordinator'}</span>
                    </button>
                    <button class="btn btn-secondary" type="button" title="Reset Password" aria-label="Reset password for ${escapeHtml(s.name)}" onclick="openResetPasswordModal('student', ${jsArg(s.enrollment)}, ${jsArg(s.name)}, ${jsArg(sEmail)})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><path d="m2 21 9.6-9.6"/><path d="m7.5 15.5 2.3 2.3a1 1 0 0 1 0 1.4l-2.1 2.1a1 1 0 0 1-1.4 0L4 19"/><circle cx="15.5" cy="7.5" r="5.5"/></svg></button>
                    <button class="btn btn-secondary" type="button" title="Edit" aria-label="Edit ${escapeHtml(s.name)}" onclick="openEditStudentModal(${jsArg(s.enrollment)}, ${jsArg(s.name)}, ${jsArg(sEmail)}, ${jsArg(s.section || '')}, ${jsArg(s.semester || '')})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                    <button class="btn btn-danger" type="button" title="Remove" aria-label="Remove ${escapeHtml(s.name)}" onclick="removeStudent(${jsArg(s.enrollment)})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                </div>`;
                setupRecordActionDisclosure(div);
                el.appendChild(div);
            });
            if (window.lucide) window.lucide.createIcons();
        }

        async function toggleCoordinatorRole(enrollment, grant) {
            const actionText = grant ? 'grant Coordinator privileges to' : 'revoke Coordinator privileges from';
            if (!confirm(`Are you sure you want to ${actionText} ${enrollment}?`)) return;

            try {
                const r = await adminApiFetch('/api/admin/students/coordinator', {
                    method: 'POST',
                    body: JSON.stringify({ enrollment, value: grant })
                });
                const data = await r.json();
                if (!r.ok) {
                    alert(data.error || 'Failed to update coordinator status.');
                    return;
                }
                loadStudents();
            } catch (e) {
                alert('Network error while updating coordinator status.');
            }
        }

        function toggleAddStudent() {
            const b = document.getElementById('addStudentBlock');
            b.hidden = !b.hidden;
            if (!b.hidden) b.querySelector('input')?.focus();
        }


        function openEditStudentModal(enrollment, name, email, section = '', semester = '') {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            
            overlay.addEventListener('click', (e) => { 
                if (e.target === overlay) {
                    overlay.classList.remove('active');
                    setTimeout(() => document.body.removeChild(overlay), 200);
                } 
            });

            overlay.innerHTML = `
                <div class="modal-dialog">
                    <h2 class="modal-title">Edit Student</h2>
                    <p class="modal-desc">Update the student's details.</p>
                    <label>Name</label>
                    <input type="text" id="editStudentName" class="form-control" value="${name}">
                    <label>Enrollment</label>
                    <input type="text" id="editStudentEnrollment" class="form-control" value="${enrollment}">
                    <label>Semester</label>
                    <select id="editStudentSemester" class="form-control">
                        <option value="">Select Semester</option>
                        ${['1st Sem', '2nd Sem', '3rd Sem', '4th Sem', '5th Sem', '6th Sem', '7th Sem', '8th Sem'].map(s => `<option value="${s}" ${semester === s ? 'selected' : ''}>${s}</option>`).join('')}
                        ${semester && !['1st Sem', '2nd Sem', '3rd Sem', '4th Sem', '5th Sem', '6th Sem', '7th Sem', '8th Sem'].includes(semester) ? `<option value="${semester}" selected>${semester}</option>` : ''}
                    </select>
                    <label>Section</label>
                    <input type="text" id="editStudentSection" class="form-control" value="${section}" placeholder="A">
                    <label>Email</label>
                    <input type="email" id="editStudentEmail" class="form-control" value="${email}">
                    <p id="editStudentError" class="status-message is-error" style="display:none;"></p>
                    <div class="modal-actions">
                        <button class="btn btn-secondary" onclick="const ov = this.closest('.modal-overlay'); ov.classList.remove('active'); setTimeout(() => ov.remove(), 200);">Cancel</button>
                        <button class="btn btn-primary" id="editStudentSaveBtn">Save Changes</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(overlay);
            // Trigger animation
            requestAnimationFrame(() => overlay.classList.add('active'));

            document.getElementById('editStudentSaveBtn').addEventListener('click', async (e) => {
                const btn = e.target;
                const errEl = document.getElementById('editStudentError');
                errEl.style.display = 'none';
                btn.disabled = true;
                btn.textContent = 'Saving...';

                const newName = document.getElementById('editStudentName').value;
                const newEnroll = document.getElementById('editStudentEnrollment').value;
                const newSem = document.getElementById('editStudentSemester').value;
                const newSec = document.getElementById('editStudentSection').value;
                const newEmail = document.getElementById('editStudentEmail').value;

                try {
                    const r = await adminApiFetch('/api/admin/students/edit', {
                        method: 'POST',
                        body: JSON.stringify({ oldEnrollment: enrollment, name: newName, enrollment: newEnroll, email: newEmail, section: newSec, semester: newSem })
                    });
                    const data = await r.json();
                    if (r.ok) {
                        overlay.classList.remove('active');
                        setTimeout(() => document.body.removeChild(overlay), 200);
                        loadStudents();
                    } else {
                        errEl.textContent = data.error || 'Failed to update';
                        errEl.style.display = 'block';
                        btn.disabled = false;
                        btn.textContent = 'Save Changes';
                    }
                } catch (err) {
                    errEl.textContent = 'Network error.';
                    errEl.style.display = 'block';
                    btn.disabled = false;
                    btn.textContent = 'Save Changes';
                }
            });
        }

        async function removeStudent(enrollment) {
            if (!confirm(`Remove student ${enrollment}?`)) return;
            const r = await adminApiFetch('/api/admin/students/delete', {
                method: 'POST',
                body: JSON.stringify({ enrollment })
            });
            if (r.ok) loadStudents();
        }

        async function resetStudentPassword(email) {
            if (!email) return alert('This student does not have an email registered.');
            const s = (window.allStudents || []).find(x => x.email === email);
            if (!s) return alert('Student not found.');
            openResetPasswordModal('student', s.enrollment, s.name, email);
        }

        async function changeAdminPassword() {
            const currentPassword = document.getElementById('currPass').value;
            const newPassword = document.getElementById('newPass').value;
            const confPass = document.getElementById('confPass').value;
            const msgEl = document.getElementById('secMsg');

            if (!currentPassword || !newPassword) {
                msgEl.classList.add('is-error');
                msgEl.classList.remove('is-success');
                msgEl.textContent = 'Please fill all password fields.';
                return;
            }
            if (newPassword !== confPass) {
                msgEl.classList.add('is-error');
                msgEl.classList.remove('is-success');
                msgEl.textContent = 'New passwords do not match.';
                return;
            }

            const r = await adminApiFetch('/api/admin/change-password', {
                method: 'POST',
                body: JSON.stringify({
                    currentPassword,
                    newPassword
                })
            });
            const data = await r.json();
            if (r.ok) {
                msgEl.classList.add('is-success');
                msgEl.classList.remove('is-error');
                msgEl.textContent = 'Password updated successfully in database.';
                document.getElementById('currPass').value = '';
                document.getElementById('newPass').value = '';
                document.getElementById('confPass').value = '';
            } else {
                msgEl.classList.add('is-error');
                msgEl.classList.remove('is-success');
                msgEl.textContent = data.error || 'Failed to update password.';
            }
        }