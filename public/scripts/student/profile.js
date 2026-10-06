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

        
async function initPortal() {
    renderProfileChip();
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

            // Sync updated profile to localStorage
            if (p.name && profile) {
                profile.name = p.name;
                if (p.avatar !== undefined) profile.avatar = p.avatar;
                if (p.section !== undefined) profile.section = p.section;
                localStorage.setItem('profile', JSON.stringify(profile));
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