// ── State ──────────────────────────────────────────────────────────
const studentToken = localStorage.getItem('student_token');
const studentDataStr = localStorage.getItem('student_data');

if (!studentToken || !studentDataStr) {
    window.location.href = '/login';
}

let profile = JSON.parse(studentDataStr);
let latestAttendanceData = null;
let currentTimelineFilter = 'ALL';

// ── DOM Elements ───────────────────────────────────────────────────
const dashboardView = document.getElementById('dashboardView');
const profileChip = document.getElementById('profileChip');
const chipAvatar = document.getElementById('chipAvatar');
const chipName = document.getElementById('chipName');
const switchProfileBtn = document.getElementById('switchProfileBtn');

// Dashboard Elements
        const profileAvatarInitials = document.getElementById('profileAvatarInitials');
        const profileAvatarImg = document.getElementById('profileAvatarImg');
        const avatarFileInput = document.getElementById('avatarFileInput');
        const removeAvatarBtn = document.getElementById('removeAvatarBtn');
        const dashStudentName = document.getElementById('dashStudentName');
        const dashEnrollment = document.getElementById('dashEnrollment');
        const dashSectionPill = document.getElementById('dashSectionPill');

        const editAboutBtn = document.getElementById('editAboutBtn');
        const aboutTextDisplay = document.getElementById('aboutTextDisplay');
        const aboutEditBlock = document.getElementById('aboutEditBlock');
        const aboutTextInput = document.getElementById('aboutTextInput');

        const overallStandingPill = document.getElementById('overallStandingPill');
        const overallPercentageText = document.getElementById('overallPercentageText');
        const overallRatioText = document.getElementById('overallRatioText');
        const overallRedFlagBox = document.getElementById('overallRedFlagBox');
        const overallRedFlagDesc = document.getElementById('overallRedFlagDesc');
        const metricTotalClasses = document.getElementById('metricTotalClasses');
        const metricAttended = document.getElementById('metricAttended');
        const metricMissed = document.getElementById('metricMissed');

        const leaderboardList = document.getElementById('leaderboardList');
        const subjectsListContainer = document.getElementById('subjectsListContainer');
        const timelineContainer = document.getElementById('timelineContainer');

        
        
        
        

        // ── Security Helper ────────────────────────────────────────────────
        function escapeHtml(str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        
function updateCoordinatorButtons(isCoord) {
    const dashCoordBtn = document.getElementById('dashCoordinatorBtn');
    if (dashCoordBtn) dashCoordBtn.style.display = isCoord ? 'inline-flex' : 'none';

    const navCoordBtn = document.getElementById('navCoordinatorBtn');
    if (navCoordBtn) navCoordBtn.style.display = isCoord ? 'inline-flex' : 'none';

    const coordinatorNavGroup = document.getElementById('coordinatorNavGroup');
    if (coordinatorNavGroup) coordinatorNavGroup.style.display = isCoord ? 'inline-flex' : 'none';

    if (isCoord && window.lucide) {
        window.lucide.createIcons();
    }
}

async function initPortal() {
    renderProfileChip();
    const isCoord = Boolean(profile && profile.is_coordinator);
    updateCoordinatorButtons(isCoord);
    await loadStudentAttendanceAndProfile();
}



function handleSignOut() {
    if (!confirm('Sign out of student portal?')) return;

    if (profileChip) {
        profileChip.hidden = true;
    }

    localStorage.removeItem('student_token');
    localStorage.removeItem('student_data');
    window.location.href = '/login';
}

if (switchProfileBtn) {
    switchProfileBtn.addEventListener('click', handleSignOut);
}


        function renderProfileChip() {
            if (!profileChip) return;
            
            if (!profile) {
                profileChip.hidden = true;
                return;
            }
            const parts = (profile.name || '').trim().split(/\s+/);
            const initials = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]) : (parts[0] ? parts[0].slice(0, 2) : 'ST');
            
            if (profile.avatar) {
                if (chipAvatar) chipAvatar.innerHTML = `<img class="avatar-image" src="${escapeHtml(profile.avatar)}" alt="Avatar">`;
            } else {
                if (chipAvatar) chipAvatar.textContent = initials.toUpperCase();
            }
            if (chipName) chipName.textContent = parts[0] || 'Student';
            profileChip.hidden = false;
        }



        

        // ── Fetch Attendance & Profile Data ────────────────────────────────
        async function loadStudentAttendanceAndProfile(month = 'all') {
            if (!profile || !profile.enrollment) return;

            try {
                let url = `/api/my-attendance?enrollment=${encodeURIComponent(profile.enrollment)}`;
                if (month !== 'all') {
                    url += `&month=${month}`;
                }
                const res = await fetch(url, { headers: { 'Authorization': `Bearer ${studentToken}` } });
                if (!res.ok) {
                    console.error('Failed to fetch attendance data');
                    return;
                }
                const data = await res.json();
                latestAttendanceData = data;
                renderAttendanceDashboard(data);
            } catch (err) {
                console.error('Network error loading attendance dashboard:', err);
            }
        }

        // ── Render Dashboard UI ────────────────────────────────────────────
        function renderAttendanceDashboard(data) {
            // 1. Profile Hero Section
            const p = data.profile || data.student || {};
            dashStudentName.textContent = p.name || profile.name || 'Student';
            dashEnrollment.textContent = p.enrollment || profile.enrollment || '';
            dashSectionPill.textContent = p.section ? `Section ${p.section}` : 'General Cohort';

            const dashSemesterPill = document.getElementById('dashSemesterPill');
            if (dashSemesterPill) {
                if (p.semester) {
                    dashSemesterPill.textContent = p.semester;
                    dashSemesterPill.style.display = 'inline-block';
                } else {
                    dashSemesterPill.style.display = 'none';
                }
            }
            const editSemesterSelect = document.getElementById('editSemesterSelect');
            if (editSemesterSelect && p.semester) {
                editSemesterSelect.value = p.semester;
            }

            // Sync updated profile to localStorage
            const isCoord = Boolean(p.is_coordinator);
            profile.is_coordinator = isCoord;
            updateCoordinatorButtons(isCoord);

            if (p.name && profile) {
                profile.name = p.name;
                if (p.avatar !== undefined) profile.avatar = p.avatar;
                if (p.section !== undefined) profile.section = p.section;
                if (p.semester !== undefined) profile.semester = p.semester;
                localStorage.setItem('profile', JSON.stringify(profile));
                localStorage.setItem('student_data', JSON.stringify(profile));
                renderProfileChip();
            }

            // Avatar Picture or Initials
            if (p.avatar && p.avatar.trim()) {
                profileAvatarImg.src = p.avatar;
                profileAvatarImg.hidden = false;
                profileAvatarInitials.hidden = true;
                if (removeAvatarBtn) removeAvatarBtn.hidden = false;
            } else {
                const parts = (p.name || profile.name || '').trim().split(/\s+/);
                const initials = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]) : (parts[0] ? parts[0].slice(0, 2) : 'ST');
                profileAvatarInitials.textContent = initials.toUpperCase();
                profileAvatarInitials.hidden = false;
                profileAvatarImg.hidden = true;
                profileAvatarImg.src = '';
                if (removeAvatarBtn) removeAvatarBtn.hidden = true;
            }

            // About Me Bio
            if (p.about && p.about.trim()) {
                aboutTextDisplay.textContent = p.about.trim();
                aboutTextDisplay.classList.remove('empty');
            } else {
                aboutTextDisplay.textContent = 'No bio added yet. Tap edit to write about yourself, academic interests, or notes.';
                aboutTextDisplay.classList.add('empty');
            }

            // 2. Overall Attendance & Red Flag Notice
            const ov = data.overall || { totalHeld: 0, totalAttended: 0, percentage: 0, isRedFlag: false, classesToRecover: 0 };
            overallPercentageText.textContent = `${ov.percentage}%`;
            overallRatioText.textContent = `${ov.totalAttended} of ${ov.totalHeld} session${ov.totalHeld === 1 ? '' : 's'} attended`;

            metricTotalClasses.textContent = ov.totalHeld;
            metricAttended.textContent = ov.totalAttended;
            metricMissed.textContent = Math.max(0, ov.totalHeld - ov.totalAttended);

            if (ov.isRedFlag) {
                overallPercentageText.classList.remove('good');
                overallPercentageText.classList.add('bad');
                overallStandingPill.className = 'standing-pill bad';
                overallStandingPill.innerHTML = '<i class="small-control-icon" data-lucide="alert-triangle"></i> Attendance Shortage (&lt; 75%)';
                overallRedFlagBox.hidden = false;
                
                const currentPctEl = document.getElementById('alertCurrentPct');
                if (currentPctEl) currentPctEl.textContent = `${ov.percentage}%`;
                
                const consecEl = document.getElementById('alertConsecutive');
                if (consecEl) {
                    consecEl.textContent = ov.classesToRecover > 0 ? ov.classesToRecover : 'N/A';
                }

                const descEl = document.getElementById('overallRedFlagDesc');
                if (descEl) {
                    descEl.textContent = ov.classesToRecover > 0 
                        ? 'Attend these classes without absence to reach 75%.'
                        : 'Your overall attendance is below the 75% requirement.';
                }
            } else {
                overallPercentageText.classList.remove('bad');
                overallPercentageText.classList.add('good');
                overallStandingPill.className = 'standing-pill good';
                overallStandingPill.innerHTML = '<i class="small-control-icon" data-lucide="check-circle"></i> In Good Standing (≥ 75%)';
                overallRedFlagBox.hidden = true;
            }

            // 3. Real-Time Leaderboard (strictly students with attendance > 75%)
            const lbData = data.leaderboard || [];
            if (lbData.length === 0) {
                leaderboardList.innerHTML = `
                    <div class="empty-leaderboard-box">
                        <div class="empty-leaderboard-icon"><i data-lucide="star"></i></div>
                        <strong>No students above 75% yet</strong>
                        <p class="empty-leaderboard-copy">Only students maintaining strictly &gt;75% attendance qualify for the leaderboard. Attend upcoming classes to take the lead!</p>
                    </div>
                `;
            } else {
                leaderboardList.innerHTML = lbData.map((item, idx) => {
                    const rank = idx + 1;
                    let rankBadgeClass = 'rank-default';
                    let rankContent = `#${rank}`;
                    if (rank === 1) { rankBadgeClass = 'rank-1'; rankContent = '<i class="rank-award-icon" data-lucide="award"></i>'; }
                    else if (rank === 2) { rankBadgeClass = 'rank-2'; rankContent = '<i class="rank-award-icon" data-lucide="award"></i>'; }
                    else if (rank === 3) { rankBadgeClass = 'rank-3'; rankContent = '<i class="rank-award-icon" data-lucide="award"></i>'; }

                    const isMe = item.isCurrentStudent;
                    const nameParts = (item.name || '').trim().split(/\s+/);
                    const inits = nameParts.length > 1 ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]) : (nameParts[0] ? nameParts[0].slice(0, 2) : 'ST');
                    
                    const avatarHtml = item.avatar 
                        ? `<img src="${item.avatar}" alt="${escapeHtml(item.name)}">`
                        : inits.toUpperCase();

                    const attCount = item.totalAttended ?? item.attended ?? 0;
                    const totCount = item.totalHeld ?? item.total ?? 0;
                    const sessionDesc = totCount > 0 ? `${attCount}/${totCount} attended` : `${item.percentage}% record`;

                    return `
                        <div class="leaderboard-item ${isMe ? 'is-me' : ''}">
                            <div class="leaderboard-left">
                                <div class="leaderboard-rank-badge ${rankBadgeClass}">${rankContent}</div>
                                <div class="leaderboard-avatar">${avatarHtml}</div>
                                <div class="leaderboard-name-block">
                                    <div class="leaderboard-name">
                                        <span>${escapeHtml(item.name)}</span>
                                        ${isMe ? '<span class="leaderboard-me-badge">YOU</span>' : ''}
                                    </div>
                                    <div class="leaderboard-sec-tag">${item.section ? 'Sec ' + escapeHtml(item.section) : 'Student'} · ${sessionDesc}</div>
                                </div>
                            </div>
                            <div class="leaderboard-badge-right">
                                <div class="leaderboard-percentage">${item.percentage}%</div>
                            </div>
                        </div>
                    `;
                }).join('');
            }

            // 4. Course Breakdown & Subject Red Flags
            const subjects = data.bySubject || [];
            if (subjects.length === 0) {
                subjectsListContainer.innerHTML = `
                    <div class="empty-subjects-message">
                        No enrolled subjects recorded for this section yet.
                    </div>
                `;
            } else {
                subjectsListContainer.innerHTML = subjects.map(s => {
                    const isRed = s.isRedFlag;
                    const pctClass = isRed ? 'danger' : 'safe';
                    const fillWidth = Math.min(100, Math.max(0, s.percentage));

                    const redFlagNotice = isRed ? `
                        <div class="subject-redflag-pill">
                            <svg class="red-flag-notice-icon" width="14" height="14" viewBox="0 0 24 24" fill="none">
                                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" fill="currentColor"/>
                                <line x1="4" y1="22" x2="4" y2="15" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
                            </svg>
                            <span>Low Attendance Warning (${s.percentage}%): Attend next <strong>${s.classesToRecover}</strong> lecture${s.classesToRecover > 1 ? 's' : ''} to reach 75%</span>
                        </div>
                    ` : '';

                    return `
                        <div class="subject-item-box ${isRed ? 'red-flag' : ''}">
                            <div class="subject-item-top">
                                <div class="subject-item-meta">
                                    <div class="subject-item-title">
                                        ${escapeHtml(s.name)} 
                                        ${s.code ? `<span class="subject-code-inline">(${escapeHtml(s.code)})</span>` : ''}
                                        ${s.semester ? `<span class="subject-semester-tag">${escapeHtml(s.semester)}</span>` : ''}
                                    </div>
                                    <div class="subject-item-instructor">
                                        ${s.teacherName ? 'Instructor: ' + escapeHtml(s.teacherName) : 'Course Module'}${s.section ? ' · Sec ' + escapeHtml(s.section) : ''}
                                    </div>
                                    <div class="subject-stat-capsule">
                                        <span>Total: <strong>${s.totalHeld}</strong></span>
                                        <span>Attended: <strong class="subject-attended-count">${s.attended}</strong></span>
                                        <span>Absent: <strong class="subject-absent-count ${s.absent > 0 ? 'has-absences' : ''}">${s.absent}</strong></span>
                                        <span>Attendance: <strong>${s.percentage}%</strong></span>
                                    </div>
                                </div>
                                <div class="subject-percent-badge ${pctClass}">
                                    ${isRed ? '<i class="subject-percent-icon" data-lucide="flag"></i>' : '<i class="subject-percent-icon" data-lucide="check"></i>'} ${s.percentage}%
                                </div>
                            </div>

                            <progress class="subject-progress-fill ${pctClass}" max="100" value="${fillWidth}">${fillWidth}%</progress>

                            ${redFlagNotice}
                        </div>
                    `;
                }).join('');
            }

            // 5. Recent Verified Check-Ins Timeline & Subject Filter Chips
            const recents = data.recent || [];
            const filterChipsEl = document.getElementById('timelineFilterChips');

            const subjectMap = new Map();
            recents.forEach(r => {
                const key = r.subjectId || r.subject;
                if (key && !subjectMap.has(key)) {
                    subjectMap.set(key, { key, name: r.subject, code: r.code });
                }
            });

            function renderFilteredTimeline() {
                const filtered = (currentTimelineFilter === 'ALL')
                    ? recents
                    : recents.filter(r => (r.subjectId === currentTimelineFilter || r.subject === currentTimelineFilter));

                if (filtered.length === 0) {
                    timelineContainer.innerHTML = `
                        <div class="empty-timeline-message">
                            ${recents.length === 0 ? 'No check-in history recorded yet.' : 'No check-ins found for the selected subject filter.'}
                        </div>
                    `;
                } else {
                    timelineContainer.innerHTML = filtered.map(r => {
                        const d = new Date(r.time || r.timestamp);
                        const timeStr = isNaN(d.getTime()) ? 'Recently' : (d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                        return `
                            <div class="timeline-row">
                                <div class="timeline-left">
                                    <div class="timeline-sub">${escapeHtml(r.subject)} ${r.code ? `<span class="timeline-code-inline">(${escapeHtml(r.code)})</span>` : ''}</div>
                                    <div class="timeline-teach">${r.teacherName ? escapeHtml(r.teacherName) : 'Class Session'}</div>
                                </div>
                                <div class="timeline-time">${timeStr}</div>
                            </div>
                        `;
                    }).join('');
                }
            }

            if (filterChipsEl) {
                if (subjectMap.size > 1) {
                    filterChipsEl.hidden = false;
                    let chipsHtml = `<button type="button" class="timeline-chip ${currentTimelineFilter === 'ALL' ? 'active' : ''}" data-filter="ALL">All Subjects (${recents.length})</button>`;
                    subjectMap.forEach(s => {
                        const label = s.code ? `${s.code}` : s.name;
                        chipsHtml += `<button type="button" class="timeline-chip ${currentTimelineFilter === s.key ? 'active' : ''}" data-filter="${escapeHtml(s.key)}">${escapeHtml(label)}</button>`;
                    });
                    filterChipsEl.innerHTML = chipsHtml;
                    filterChipsEl.querySelectorAll('.timeline-chip').forEach(btn => {
                        btn.onclick = () => {
                            currentTimelineFilter = btn.getAttribute('data-filter');
                            filterChipsEl.querySelectorAll('.timeline-chip').forEach(b => b.classList.toggle('active', b.getAttribute('data-filter') === currentTimelineFilter));
                            renderFilteredTimeline();
                        };
                    });
                } else {
                    filterChipsEl.hidden = true;
                }
            }

            renderFilteredTimeline();
            if (window.lucide) window.lucide.createIcons();
        }

        // ── Profile Photo Upload System (Canvas Downscaled Base64) ───────────
        function triggerAvatarUpload() {
            if (avatarFileInput) avatarFileInput.click();
        }

        function handleAvatarFileSelected(event) {
            const file = event.target.files && event.target.files[0];
            if (!file || !profile) return;

            if (!file.type.startsWith('image/')) {
                alert('Please select an image file (PNG, JPG, WebP).');
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const maxDim = 200;
                    let width = img.width;
                    let height = img.height;

                    const minDim = Math.min(width, height);
                    const sx = (width - minDim) / 2;
                    const sy = (height - minDim) / 2;

                    canvas.width = maxDim;
                    canvas.height = maxDim;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, maxDim, maxDim);

                    const base64Data = canvas.toDataURL('image/jpeg', 0.82);

                    profileAvatarImg.src = base64Data;
                    profileAvatarImg.hidden = false;
                    profileAvatarInitials.hidden = true;

                    chipAvatar.innerHTML = `<img class="avatar-image" src="${base64Data}" alt="Avatar">`;

                    profile.avatar = base64Data;
                    localStorage.setItem('profile', JSON.stringify(profile));

                    if (removeAvatarBtn) removeAvatarBtn.hidden = false;

                    saveAvatarToServer(base64Data);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        async function removeAvatarPhoto(event) {
            if (event) event.stopPropagation();
            if (!profile || !profile.enrollment) return;
            if (!confirm('Remove profile picture and revert to initials?')) return;

            profile.avatar = '';
            localStorage.setItem('profile', JSON.stringify(profile));

            profileAvatarImg.src = '';
            profileAvatarImg.hidden = true;
            profileAvatarInitials.hidden = false;

            if (removeAvatarBtn) removeAvatarBtn.hidden = true;

            renderProfileChip();

            await saveAvatarToServer('');
        }

        async function saveAvatarToServer(base64Data) {
            if (!profile || !profile.enrollment) return;
            try {
                await fetch('/api/student/profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        enrollment: profile.enrollment,
                        avatar: base64Data
                    })
                });
            } catch (err) {
                console.error('Error saving avatar to server:', err);
            }
        }

        // ── About Me Bio Editing System ─────────────────────────────────────
        function toggleEditAbout() {
            aboutEditBlock.hidden = false;
            aboutTextDisplay.hidden = true;
            editAboutBtn.hidden = true;
            const cur = aboutTextDisplay.textContent;
            aboutTextInput.value = (cur && !cur.startsWith('No bio added yet')) ? cur : '';
            aboutTextInput.focus();
        }

        function cancelEditAbout() {
            aboutEditBlock.hidden = true;
            aboutTextDisplay.hidden = false;
            editAboutBtn.hidden = false;
        }

        async function saveAbout() {
            const text = aboutTextInput.value.trim();
            if (!profile || !profile.enrollment) return;

            try {
                const res = await fetch('/api/student/profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        enrollment: profile.enrollment,
                        about: text
                    })
                });

                if (res.ok) {
                    aboutTextDisplay.textContent = text || 'No bio added yet. Tap edit to write about yourself, academic interests, or notes.';
                    if (text) {
                        aboutTextDisplay.classList.remove('empty');
                    } else {
                        aboutTextDisplay.classList.add('empty');
                    }
                    cancelEditAbout();
                } else {
                    alert('Failed to save bio. Please check your connection.');
                }
            } catch (e) {
                console.error('Error saving bio:', e);
                alert('Network error while saving bio.');
            }
        }

        // ── Semester Editing System ─────────────────────────────────────────
        function toggleEditSemester(show) {
            const row = document.getElementById('semesterEditRow');
            if (!row) return;
            const isVisible = show !== undefined ? show : row.style.display !== 'none';
            row.style.display = isVisible ? 'none' : 'flex';
            if (row.style.display === 'flex') {
                const sel = document.getElementById('editSemesterSelect');
                if (sel) {
                    sel.value = profile?.semester || latestAttendanceData?.student?.semester || '';
                    sel.focus();
                }
            }
        }

        async function saveSemester() {
            if (!profile || !profile.enrollment) return;
            const sel = document.getElementById('editSemesterSelect');
            const newSem = sel ? sel.value.trim() : '';

            try {
                const res = await fetch('/api/student/profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        enrollment: profile.enrollment,
                        semester: newSem
                    })
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data.student) {
                        profile.semester = data.student.semester || '';
                        localStorage.setItem('profile', JSON.stringify(profile));
                        localStorage.setItem('student_data', JSON.stringify(profile));
                    }
                    toggleEditSemester(false);
                    loadStudentAttendanceAndProfile();
                } else {
                    alert('Failed to update semester.');
                }
            } catch (err) {
                console.error('Error updating semester:', err);
                alert('Network error while updating semester.');
            }
        }

        // Run
        initPortal();

        // Month Filter Logic
        function applyMonthFilter(month, btnEl) {
            // Update active state on buttons
            if (btnEl) {
                const buttons = document.querySelectorAll('.month-btn');
                buttons.forEach(b => b.classList.remove('active'));
                btnEl.classList.add('active');
            }
            
            // Un-flip the card
            const overallCard = document.getElementById('overallCard');
            if (overallCard) {
                overallCard.classList.remove('flipped');
            }

            // Update caption
            const captionEl = document.getElementById('overallGaugeCaption');
            if (captionEl) {
                if (month === 'all') {
                    captionEl.textContent = 'Overall (All Months)';
                } else {
                    const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                    captionEl.textContent = `Overall (${monthNames[month]})`;
                }
            }

            // Fetch new data
            loadStudentAttendanceAndProfile(month);
        }

        // ── Coordinator Mode Controller ────────────────────────────────────
        let coordTeachersList = [];
        let coordStudentsList = [];
        let coordSubjectsList = [];
        let parsedBulkRecords = [];

        function switchPortalTab(tab) {
            const dashView = document.getElementById('dashboardView');
            const manageView = document.getElementById('coordinatorManageView');
            const btnAtt = document.getElementById('btnTabAttendance');
            const btnManage = document.getElementById('btnTabManage');

            if (tab === 'manage') {
                if (dashView) dashView.style.display = 'none';
                if (manageView) manageView.style.display = 'block';
                if (btnAtt) btnAtt.classList.remove('active');
                if (btnManage) btnManage.classList.add('active');
                loadCoordinatorData();
            } else {
                if (manageView) manageView.style.display = 'none';
                if (dashView) dashView.style.display = 'block';
                if (btnManage) btnManage.classList.remove('active');
                if (btnAtt) btnAtt.classList.add('active');
            }
        }

        async function coordinatorApiFetch(url, options = {}) {
            options.headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
            options.headers['Authorization'] = `Bearer ${studentToken}`;
            return fetch(url, options);
        }

        async function loadCoordinatorData() {
            try {
                // Update scope pill
                const scopePill = document.getElementById('coordClassScopePill');
                if (scopePill) {
                    scopePill.textContent = `${profile.semester || 'Current Sem'} · Section ${profile.section || 'A'}`;
                }
                const scopeInfo = document.getElementById('coordSubjectScopeInfo');
                if (scopeInfo) {
                    scopeInfo.textContent = `Class Scope: Locked to ${profile.semester || 'Semester'} · Section ${profile.section || ''}`;
                }

                // Fetch subjects, teachers, and class students concurrently
                const [subRes, teachRes, studRes] = await Promise.all([
                    coordinatorApiFetch('/api/coordinator/subjects'),
                    coordinatorApiFetch('/api/coordinator/teachers'),
                    coordinatorApiFetch('/api/coordinator/students')
                ]);

                if (subRes.status === 403) {
                    const nav = document.getElementById('coordinatorNavGroup');
                    if (nav) nav.style.display = 'none';
                    switchPortalTab('attendance');
                    return;
                }

                if (subRes.ok) {
                    coordSubjectsList = await subRes.json();
                    renderCoordinatorSubjects(coordSubjectsList);
                }
                if (teachRes.ok) {
                    coordTeachersList = await teachRes.json();
                    populateTeacherSelect(coordTeachersList);
                }
                if (studRes.ok) {
                    coordStudentsList = await studRes.json();
                }

                // Update metrics
                const totalSubjsEl = document.getElementById('coordMetricTotalSubjects');
                if (totalSubjsEl) totalSubjsEl.textContent = coordSubjectsList.length;

                const electivesCount = coordSubjectsList.filter(s => s.is_elective).length;
                const electivesEl = document.getElementById('coordMetricElectives');
                if (electivesEl) electivesEl.textContent = electivesCount;

                const studentsEl = document.getElementById('coordMetricClassStudents');
                if (studentsEl) studentsEl.textContent = coordStudentsList.length;

                if (window.lucide) window.lucide.createIcons();
            } catch (err) {
                console.error('Error loading coordinator data:', err);
            }
        }

        function renderCoordinatorSubjects(subjects) {
            const container = document.getElementById('coordSubjectsContainer');
            if (!container) return;

            if (!subjects || subjects.length === 0) {
                container.innerHTML = `
                    <div style="grid-column: 1 / -1; padding: 48px 24px; text-align: center; background: rgba(0,0,0,0.02); border: 1px dashed rgba(0,0,0,0.1); border-radius: 14px;">
                        <i data-lucide="book-plus" style="width: 36px; height: 36px; color: var(--ink-3); margin-bottom: 8px;"></i>
                        <h4 style="font-size: 15px; font-weight: 600; color: var(--ink); margin: 0 0 4px 0;">No subjects added yet</h4>
                        <p style="font-size: 13px; color: var(--ink-2); margin: 0 0 16px 0;">Start configuring your class curriculum by adding your first subject.</p>
                        <button type="button" class="btn btn-primary compact-button" onclick="openAddSubjectModal()">
                            <i data-lucide="plus" style="width: 14px; height: 14px;"></i> Add Subject
                        </button>
                    </div>
                `;
                if (window.lucide) window.lucide.createIcons();
                return;
            }

            container.innerHTML = subjects.map(s => {
                const isElective = Boolean(s.is_elective);
                const enrolledCount = Array.isArray(s.enrolled_enrollments) ? s.enrolled_enrollments.length : 0;
                const teacherName = s.teacher_name || 'Instructor';

                return `
                    <div class="coord-subject-card">
                        <div>
                            <div class="coord-subject-header">
                                <span class="coord-subject-code-tag">${escapeHtml(s.code || 'GEN')}</span>
                                ${isElective 
                                    ? `<span class="badge-elective"><i data-lucide="sparkles" style="width: 11px; height: 11px;"></i> Elective (${enrolledCount} Enrolled)</span>` 
                                    : `<span class="badge-core"><i data-lucide="layers" style="width: 11px; height: 11px;"></i> Core Subject</span>`
                                }
                            </div>
                            <h4 class="coord-subject-name">${escapeHtml(s.name)}</h4>
                        </div>

                        <div class="coord-subject-meta">
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <i data-lucide="user" style="width: 13px; height: 13px; color: var(--ink-3);"></i>
                                <span><strong>Teacher:</strong> ${escapeHtml(teacherName)}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <i data-lucide="map-pin" style="width: 13px; height: 13px; color: var(--ink-3);"></i>
                                <span><strong>Class:</strong> ${escapeHtml(s.semester || profile.semester || '')} · Sec ${escapeHtml(s.section || profile.section || '')}</span>
                            </div>
                        </div>

                        <div class="coord-subject-actions">
                            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                                ${isElective ? `
                                    <button type="button" class="btn btn-secondary compact-button" onclick="openElectiveRosterModal('${escapeHtml(s.id)}')">
                                        <i data-lucide="users" style="width: 13px; height: 13px;"></i> Roster
                                    </button>
                                ` : ''}
                                <button type="button" class="btn btn-primary compact-button" onclick="openBulkUploadModal('${escapeHtml(s.id)}', '${escapeHtml(s.name)}', ${isElective})">
                                    <i data-lucide="upload-cloud" style="width: 13px; height: 13px;"></i> Upload Excel
                                </button>
                            </div>
                            <div style="display: flex; gap: 4px;">
                                <button type="button" class="icon-btn" title="Edit Subject" onclick="openEditSubjectModal('${escapeHtml(s.id)}')" style="padding: 6px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.08); background: transparent; cursor: pointer; color: var(--ink-2);">
                                    <i data-lucide="edit-2" style="width: 14px; height: 14px;"></i>
                                </button>
                                <button type="button" class="icon-btn" title="Delete Subject" onclick="deleteSubject('${escapeHtml(s.id)}')" style="padding: 6px; border-radius: 8px; border: 1px solid rgba(220, 38, 38, 0.2); background: transparent; cursor: pointer; color: var(--bad);">
                                    <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            if (window.lucide) window.lucide.createIcons();
        }

        function populateTeacherSelect(teachers) {
            const sel = document.getElementById('coordSubjTeacher');
            if (!sel) return;
            const curVal = sel.value;
            sel.innerHTML = '<option value="">Select a teacher...</option>' + 
                teachers.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join('');
            if (curVal) sel.value = curVal;
        }

        // ── Subject Modals: Add & Edit ─────────────────────────────────────
        function openAddSubjectModal() {
            document.getElementById('coordSubjectModalTitle').textContent = 'Add Class Subject';
            document.getElementById('coordSubjectModalDesc').textContent = 'Create a new subject for your class.';
            document.getElementById('coordSubjectEditId').value = '';
            document.getElementById('coordSubjName').value = '';
            document.getElementById('coordSubjCode').value = '';
            document.getElementById('coordSubjTeacher').value = '';
            document.getElementById('coordSubjIsElective').checked = false;
            document.getElementById('coordSubjectError').style.display = 'none';

            const overlay = document.getElementById('coordSubjectModal');
            if (overlay) {
                overlay.style.display = 'flex';
                requestAnimationFrame(() => overlay.classList.add('active'));
            }
            if (window.lucide) window.lucide.createIcons();
        }

        function openEditSubjectModal(id) {
            const subj = coordSubjectsList.find(s => s.id === id);
            if (!subj) return;

            document.getElementById('coordSubjectModalTitle').textContent = 'Edit Class Subject';
            document.getElementById('coordSubjectModalDesc').textContent = 'Modify course details.';
            document.getElementById('coordSubjectEditId').value = subj.id;
            document.getElementById('coordSubjName').value = subj.name || '';
            document.getElementById('coordSubjCode').value = subj.code || '';
            document.getElementById('coordSubjTeacher').value = subj.teacher_id || '';
            document.getElementById('coordSubjIsElective').checked = Boolean(subj.is_elective);
            document.getElementById('coordSubjectError').style.display = 'none';

            const overlay = document.getElementById('coordSubjectModal');
            if (overlay) {
                overlay.style.display = 'flex';
                requestAnimationFrame(() => overlay.classList.add('active'));
            }
            if (window.lucide) window.lucide.createIcons();
        }

        function closeCoordSubjectModal() {
            const overlay = document.getElementById('coordSubjectModal');
            if (overlay) {
                overlay.classList.remove('active');
                overlay.style.display = 'none';
            }
        }

        async function saveCoordSubject() {
            const btn = document.getElementById('btnSaveCoordSubject');
            const errEl = document.getElementById('coordSubjectError');
            errEl.style.display = 'none';

            const editId = document.getElementById('coordSubjectEditId').value;
            const name = document.getElementById('coordSubjName').value.trim();
            const code = document.getElementById('coordSubjCode').value.trim().toUpperCase();
            const teacherId = document.getElementById('coordSubjTeacher').value;
            const isElective = document.getElementById('coordSubjIsElective').checked;

            if (!name || !teacherId) {
                errEl.textContent = 'Subject Name and Assigned Teacher are required.';
                errEl.style.display = 'block';
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Saving...';

            try {
                const url = editId ? '/api/coordinator/subjects/edit' : '/api/coordinator/subjects';
                const body = editId ? { id: editId, name, code, teacherId, isElective } : { name, code, teacherId, isElective };

                const res = await coordinatorApiFetch(url, {
                    method: 'POST',
                    body: JSON.stringify(body)
                });
                const data = await res.json();

                if (!res.ok) {
                    errEl.textContent = data.error || 'Failed to save subject.';
                    errEl.style.display = 'block';
                    btn.disabled = false;
                    btn.textContent = 'Save Subject';
                    return;
                }

                closeCoordSubjectModal();
                btn.disabled = false;
                btn.textContent = 'Save Subject';
                await loadCoordinatorData();
                loadStudentAttendanceAndProfile();
            } catch (e) {
                errEl.textContent = 'Network error while saving subject.';
                errEl.style.display = 'block';
                btn.disabled = false;
                btn.textContent = 'Save Subject';
            }
        }

        async function deleteSubject(id) {
            const subj = coordSubjectsList.find(s => s.id === id);
            const name = subj ? subj.name : 'this subject';
            if (!confirm(`Are you sure you want to delete "${name}"?\n\nThis will remove the subject and any sessions/attendance linked to it.`)) return;

            try {
                const res = await coordinatorApiFetch('/api/coordinator/subjects/delete', {
                    method: 'POST',
                    body: JSON.stringify({ id })
                });
                const data = await res.json();
                if (!res.ok) {
                    alert(data.error || 'Failed to delete subject.');
                    return;
                }
                await loadCoordinatorData();
                loadStudentAttendanceAndProfile();
            } catch (e) {
                alert('Network error while deleting subject.');
            }
        }

        // ── Elective Roster Modal ──────────────────────────────────────────
        function openElectiveRosterModal(subjectId) {
            const subj = coordSubjectsList.find(s => s.id === subjectId);
            if (!subj) return;

            document.getElementById('coordRosterSubjectId').value = subjectId;
            document.getElementById('coordRosterTitle').textContent = `Elective Roster: ${subj.name}`;
            document.getElementById('coordRosterSubtitle').textContent = `Select students from ${profile.semester || ''} · Section ${profile.section || ''} enrolled in this elective.`;
            document.getElementById('coordRosterSearch').value = '';
            document.getElementById('coordRosterError').style.display = 'none';

            const enrolledSet = new Set(Array.isArray(subj.enrolled_enrollments) ? subj.enrolled_enrollments : []);
            renderRosterList(enrolledSet);

            const overlay = document.getElementById('coordRosterModal');
            if (overlay) {
                overlay.style.display = 'flex';
                requestAnimationFrame(() => overlay.classList.add('active'));
            }
            if (window.lucide) window.lucide.createIcons();
        }

        function renderRosterList(enrolledSet) {
            const container = document.getElementById('coordRosterList');
            if (!container) return;

            if (!coordStudentsList || coordStudentsList.length === 0) {
                container.innerHTML = '<p style="padding: 12px; color: var(--ink-2); font-size: 13px; text-align: center;">No students found in your class scope.</p>';
                updateRosterCount();
                return;
            }

            container.innerHTML = coordStudentsList.map(s => {
                const isChecked = enrolledSet.has(s.enrollment);
                return `
                    <label class="roster-item" data-search="${(s.name + ' ' + s.enrollment).toLowerCase()}" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; margin-bottom: 4px; background: #ffffff; border-radius: 8px; border: 1px solid rgba(0,0,0,0.05); cursor: pointer; transition: background 0.15s ease;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <input type="checkbox" class="roster-chk" value="${escapeHtml(s.enrollment)}" ${isChecked ? 'checked' : ''} onchange="updateRosterCount()" style="width: 16px; height: 16px; accent-color: #7c3aed;">
                            <div>
                                <div style="font-size: 13.5px; font-weight: 600; color: var(--ink);">${escapeHtml(s.name)}</div>
                                <div style="font-size: 11px; color: var(--ink-3); font-family: 'JetBrains Mono', monospace;">${escapeHtml(s.enrollment)}</div>
                            </div>
                        </div>
                        <span style="font-size: 11px; color: var(--ink-2); background: rgba(0,0,0,0.04); padding: 2px 6px; border-radius: 4px;">Sec ${escapeHtml(s.section || '')}</span>
                    </label>
                `;
            }).join('');

            updateRosterCount();
        }

        function filterRosterChecklist() {
            const q = (document.getElementById('coordRosterSearch').value || '').toLowerCase().trim();
            const items = document.querySelectorAll('.roster-item');
            items.forEach(item => {
                const text = item.getAttribute('data-search') || '';
                item.style.display = !q || text.includes(q) ? 'flex' : 'none';
            });
        }

        function selectAllRoster(select) {
            const items = document.querySelectorAll('.roster-item');
            items.forEach(item => {
                if (item.style.display !== 'none') {
                    const chk = item.querySelector('.roster-chk');
                    if (chk) chk.checked = select;
                }
            });
            updateRosterCount();
        }

        function updateRosterCount() {
            const chks = document.querySelectorAll('.roster-chk:checked');
            const countEl = document.getElementById('coordRosterCount');
            if (countEl) {
                countEl.textContent = `${chks.length} student${chks.length === 1 ? '' : 's'} selected`;
            }
        }

        function closeCoordRosterModal() {
            const overlay = document.getElementById('coordRosterModal');
            if (overlay) {
                overlay.classList.remove('active');
                overlay.style.display = 'none';
            }
        }

        async function saveCoordRoster() {
            const subjectId = document.getElementById('coordRosterSubjectId').value;
            const btn = document.getElementById('btnSaveCoordRoster');
            const errEl = document.getElementById('coordRosterError');
            errEl.style.display = 'none';

            const chks = document.querySelectorAll('.roster-chk:checked');
            const enrollments = Array.from(chks).map(c => c.value);

            btn.disabled = true;
            btn.textContent = 'Saving...';

            try {
                const res = await coordinatorApiFetch('/api/coordinator/electives', {
                    method: 'POST',
                    body: JSON.stringify({ subjectId, enrollments })
                });
                const data = await res.json();
                if (!res.ok) {
                    errEl.textContent = data.error || 'Failed to update roster.';
                    errEl.style.display = 'block';
                    btn.disabled = false;
                    btn.textContent = 'Save Roster';
                    return;
                }

                closeCoordRosterModal();
                btn.disabled = false;
                btn.textContent = 'Save Roster';
                await loadCoordinatorData();
                loadStudentAttendanceAndProfile();
            } catch (e) {
                errEl.textContent = 'Network error while saving roster.';
                errEl.style.display = 'block';
                btn.disabled = false;
                btn.textContent = 'Save Roster';
            }
        }

        // ── Bulk Attendance Upload Modal ───────────────────────────────────
        function openBulkUploadModal(subjectId, subjectName, isElective) {
            document.getElementById('coordUploadSubjectId').value = subjectId;
            document.getElementById('coordUploadSubtitle').textContent = `Upload attendance for "${subjectName}"`;
            
            // Set default date to today YYYY-MM-DD
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('coordUploadDate').value = today;
            document.getElementById('coordUploadTitle').value = '';
            document.getElementById('coordFileInput').value = '';
            document.getElementById('coordFileLabel').textContent = 'Click to browse Excel file';
            document.getElementById('coordUploadPreview').style.display = 'none';
            document.getElementById('coordUploadError').style.display = 'none';
            parsedBulkRecords = [];

            const noticeEl = document.getElementById('coordUploadElectiveNotice');
            if (noticeEl) {
                noticeEl.style.display = isElective ? 'block' : 'none';
            }

            const overlay = document.getElementById('coordUploadModal');
            if (overlay) {
                overlay.style.display = 'flex';
                requestAnimationFrame(() => overlay.classList.add('active'));
            }
            if (window.lucide) window.lucide.createIcons();
        }

        function closeCoordUploadModal() {
            const overlay = document.getElementById('coordUploadModal');
            if (overlay) {
                overlay.classList.remove('active');
                overlay.style.display = 'none';
            }
        }

        async function handleCoordFileSelect(event) {
            const file = event.target.files && event.target.files[0];
            if (!file) return;

            const errEl = document.getElementById('coordUploadError');
            errEl.style.display = 'none';

            if (typeof XLSX === 'undefined') {
                errEl.textContent = 'Excel parsing library not loaded. Please check your internet connection.';
                errEl.style.display = 'block';
                return;
            }

            try {
                const data = await file.arrayBuffer();
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const rawJson = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                if (!rawJson || rawJson.length < 2) {
                    errEl.textContent = 'The Excel file appears to be empty or lacks data rows.';
                    errEl.style.display = 'block';
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
                    errEl.textContent = 'Could not find an "Enrollment ID" or "Roll No" column in the Excel file.';
                    errEl.style.display = 'block';
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
                    errEl.textContent = 'No valid student records found in the uploaded file.';
                    errEl.style.display = 'block';
                    return;
                }

                parsedBulkRecords = records;
                document.getElementById('coordFileLabel').textContent = `${file.name} (${records.length} students)`;
                document.getElementById('coordUploadCount').textContent = records.length;
                document.getElementById('coordUploadPreview').style.display = 'block';
            } catch (e) {
                console.error('Error parsing Excel file:', e);
                errEl.textContent = 'Error parsing Excel file. Please ensure it is a valid .xlsx or .xls file.';
                errEl.style.display = 'block';
            }
        }

        async function submitCoordBulkUpload() {
            const errEl = document.getElementById('coordUploadError');
            errEl.style.display = 'none';

            const subjectId = document.getElementById('coordUploadSubjectId').value;
            const sessionDate = document.getElementById('coordUploadDate').value;
            const sessionTitle = document.getElementById('coordUploadTitle').value.trim();

            if (!sessionDate) {
                errEl.textContent = 'Please choose a session date.';
                errEl.style.display = 'block';
                return;
            }

            if (!parsedBulkRecords || parsedBulkRecords.length === 0) {
                errEl.textContent = 'Please select a valid Excel file containing student records.';
                errEl.style.display = 'block';
                return;
            }

            const btn = document.getElementById('btnSubmitCoordUpload');
            btn.disabled = true;
            btn.textContent = 'Uploading...';

            try {
                const res = await coordinatorApiFetch('/api/coordinator/attendance/bulk-upload', {
                    method: 'POST',
                    body: JSON.stringify({
                        subjectId,
                        records: parsedBulkRecords,
                        sessionDate: new Date(sessionDate).toISOString(),
                        sessionTitle
                    })
                });
                const data = await res.json();

                if (!res.ok) {
                    errEl.textContent = data.error || 'Failed to upload attendance records.';
                    errEl.style.display = 'block';
                    btn.disabled = false;
                    btn.textContent = 'Upload & Record';
                    return;
                }

                alert(`Successfully recorded attendance for ${data.count} students!`);
                closeCoordUploadModal();
                btn.disabled = false;
                btn.textContent = 'Upload & Record';
                loadStudentAttendanceAndProfile();
                loadCoordinatorData();
            } catch (e) {
                errEl.textContent = 'Network error during bulk attendance upload.';
                errEl.style.display = 'block';
                btn.disabled = false;
                btn.textContent = 'Upload & Record';
            }
        }

        // Close modal on click outside
        document.addEventListener('click', (e) => {
            ['coordSubjectModal', 'coordRosterModal', 'coordUploadModal'].forEach(id => {
                const el = document.getElementById(id);
                if (el && e.target === el) {
                    el.classList.remove('active');
                    el.style.display = 'none';
                }
            });
        });

        // Expose global coordinator handlers for HTML onclick attributes
        window.switchPortalTab = switchPortalTab;
        window.loadCoordinatorData = loadCoordinatorData;
        window.openAddSubjectModal = openAddSubjectModal;
        window.openEditSubjectModal = openEditSubjectModal;
        window.closeCoordSubjectModal = closeCoordSubjectModal;
        window.saveCoordSubject = saveCoordSubject;
        window.deleteSubject = deleteSubject;
        window.openElectiveRosterModal = openElectiveRosterModal;
        window.closeCoordRosterModal = closeCoordRosterModal;
        window.saveCoordRoster = saveCoordRoster;
        window.filterRosterChecklist = filterRosterChecklist;
        window.selectAllRoster = selectAllRoster;
        window.updateRosterCount = updateRosterCount;
        window.openBulkUploadModal = openBulkUploadModal;
        window.closeCoordUploadModal = closeCoordUploadModal;
        window.handleCoordFileSelect = handleCoordFileSelect;
        window.submitCoordBulkUpload = submitCoordBulkUpload;
        window.toggleEditSemester = toggleEditSemester;
        window.saveSemester = saveSemester;
        window.handleSignOut = handleSignOut;
        window.triggerAvatarUpload = triggerAvatarUpload;
        window.handleAvatarFileSelected = handleAvatarFileSelected;
        window.removeAvatarPhoto = removeAvatarPhoto;
        window.toggleEditAbout = toggleEditAbout;
        window.cancelEditAbout = cancelEditAbout;
        window.saveAbout = saveAbout;
        window.applyMonthFilter = applyMonthFilter;