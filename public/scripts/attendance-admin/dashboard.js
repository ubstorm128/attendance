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
    window.location.href = '/login';
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
                    <button class="btn btn-secondary" type="button" title="Reset Password" aria-label="Reset password for ${escapeHtml(t.name)}" onclick="resetTeacherPassword('${escapeHtml(t.email || '')}')" ${!t.email ? 'disabled title="No email registered"' : ''}><i data-lucide="key" width="18" height="18"></i></button>
                    <button class="btn btn-secondary" type="button" title="Edit" aria-label="Edit ${escapeHtml(t.name)}" onclick="openEditTeacherModal('${t.id}', '${escapeHtml(t.name)}', '${escapeHtml(t.username)}', '${escapeHtml(t.email || '')}')"><i data-lucide="edit" width="18" height="18"></i></button>
                    <button class="btn btn-danger" type="button" title="Remove" aria-label="Remove ${escapeHtml(t.name)}" onclick="removeTeacher('${t.id}')"><i data-lucide="trash-2" width="18" height="18"></i></button>
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

        async function resetTeacherPassword(email) {
            if (!email) return alert('This teacher does not have an email registered.');
            if (!confirm(`Send password reset email to ${email}?`)) return;
            
            try {
                const r = await adminApiFetch('/api/admin/teachers/reset-password', {
                    method: 'POST',
                    body: JSON.stringify({ email })
                });
                const data = await r.json();
                if (r.ok) {
                    alert('Password reset email sent successfully via Supabase!');
                } else {
                    alert(data.error || 'Failed to send reset email.');
                }
            } catch (err) {
                alert('Network error while trying to reset password.');
            }
        }

        async function addStudent() {
            const name = document.getElementById('studentName').value.trim();
            const enrollment = document.getElementById('studentEnrollment').value.trim();
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
                    body: JSON.stringify({ name, enrollment, section, email, password })
                });
                const data = await r.json();
                if (r.ok) {
                    document.getElementById('studentName').value = '';
                    document.getElementById('studentEnrollment').value = '';
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
                const actionId = `student-actions-${index}`;
                div.innerHTML = `<div class="record-identity">
                    <strong>${escapeHtml(s.name)}</strong>
                    <span class="handle">${escapeHtml(s.enrollment)}${s.section ? ' · Sec ' + escapeHtml(s.section) : ''}</span>
                </div>
                <button class="record-summary" type="button" aria-expanded="false" aria-controls="${actionId}">
                    <span class="record-summary-text"><strong>${escapeHtml(s.name)}</strong><span>${escapeHtml(s.enrollment)}${s.section ? ' · Sec ' + escapeHtml(s.section) : ''}</span></span>
                    <i data-lucide="chevron-down" aria-hidden="true"></i>
                </button>
                <div class="action-btns" id="${actionId}">
                    <button class="btn btn-secondary" type="button" title="Reset Password" aria-label="Reset password for ${escapeHtml(s.name)}" onclick="resetStudentPassword('${escapeHtml(sEmail)}')" ${!sEmail ? 'disabled title="No email registered"' : ''}><i data-lucide="key" width="18" height="18"></i></button>
                    <button class="btn btn-secondary" type="button" title="Edit" aria-label="Edit ${escapeHtml(s.name)}" onclick="openEditStudentModal('${escapeHtml(s.enrollment)}', '${escapeHtml(s.name)}', '${escapeHtml(sEmail)}')"><i data-lucide="edit" width="18" height="18"></i></button>
                    <button class="btn btn-danger" type="button" title="Remove" aria-label="Remove ${escapeHtml(s.name)}" onclick="removeStudent('${escapeHtml(s.enrollment)}')"><i data-lucide="trash-2" width="18" height="18"></i></button>
                </div>`;
                setupRecordActionDisclosure(div);
                el.appendChild(div);
            });
            if (window.lucide) window.lucide.createIcons();
        }

        function toggleAddStudent() {
            const b = document.getElementById('addStudentBlock');
            b.hidden = !b.hidden;
            if (!b.hidden) b.querySelector('input')?.focus();
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

        function openEditStudentModal(enrollment, name, email) {
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
                const newEmail = document.getElementById('editStudentEmail').value;

                try {
                    const r = await adminApiFetch('/api/admin/students/edit', {
                        method: 'POST',
                        body: JSON.stringify({ oldEnrollment: enrollment, name: newName, enrollment: newEnroll, email: newEmail })
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
            if (!confirm(`Send password reset email to ${email}?`)) return;
            
            try {
                const r = await adminApiFetch('/api/admin/students/reset-password', {
                    method: 'POST',
                    body: JSON.stringify({ email })
                });
                const data = await r.json();
                if (r.ok) {
                    alert('Password reset email sent successfully via Supabase!');
                } else {
                    alert(data.error || 'Failed to send reset email.');
                }
            } catch (err) {
                alert('Network error while trying to reset password.');
            }
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