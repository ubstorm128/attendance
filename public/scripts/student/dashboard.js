// Ã¢-â‚¬Ã¢-â‚¬ State Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬
if (window.location.hash && window.location.hash.includes('type=recovery')) {
    window.location.replace('/reset-password' + window.location.hash);
}

let token = new URLSearchParams(location.search).get('token');
        let profile = JSON.parse(localStorage.getItem('profile') || 'null');
        let supabaseClient = null;
        let googleAccessToken = null;
        let authEmail = null;

        // Ã¢-â‚¬Ã¢-â‚¬ Validation regex Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬
        const NAME_REGEX = /^[A-Za-z]+(?:\s+[A-Za-z]+)*$/;
        const ENROLLMENT_REGEX = /^ADTU\/\d+\/\d{4}-\d{2,4}\/[A-Z0-9]+\/\d+$/;

        // Ã¢-â‚¬Ã¢-â‚¬ Sensory Haptics & Audio Chime Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬
        function triggerSensoryFeedback() {
            if ('vibrate' in navigator) {
                try { navigator.vibrate([35, 45, 35]); } catch (e) { }
            }
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const now = ctx.currentTime;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(587.33, now); // D5
                osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.3);
            } catch (e) { }
        }

        // Ã¢-â‚¬Ã¢-â‚¬ Security Helper Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬
        function escapeHtml(str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        // Ã¢-â‚¬Ã¢-â‚¬ DOM Elements Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬
        const loadingView = document.getElementById('loadingView');
        const authView = document.getElementById('authView');
        const standbyView = document.getElementById('standbyView');
        const receiptView = document.getElementById('receiptView');

        const headerProfileLink = document.getElementById('headerProfileLink');
        const profileChip = document.getElementById('profileChip');
        const chipAvatar = document.getElementById('chipAvatar');
        const chipName = document.getElementById('chipName');
        const switchProfileBtn = document.getElementById('switchProfileBtn');

        const sessionDetectedBanner = document.getElementById('sessionDetectedBanner');
        const detectedSubjectText = document.getElementById('detectedSubjectText');
        const detectedTeacherText = document.getElementById('detectedTeacherText');
        const stepPillLabel = document.getElementById('stepPillLabel');
        const regHeading = document.getElementById('regHeading');
        const regSubtitle = document.getElementById('regSubtitle');

        const nameInput = document.getElementById('nameInput');
        const enrollmentInput = document.getElementById('enrollmentInput');
        const emailInput = document.getElementById('emailInput');
        const otpInput = document.getElementById('otpInput');
        const nameCell = document.getElementById('nameCell');
        const enrollmentCell = document.getElementById('enrollmentCell');
        const regSubmitBtn = document.getElementById('regSubmitBtn');
        const regBtnLabel = document.getElementById('regBtnLabel');
        const fieldErrorMsg = document.getElementById('fieldErrorMsg');
        const fieldErrorText = document.getElementById('fieldErrorText');
        const regGroup = document.getElementById('regGroup');

        const plaqueAvatar = document.getElementById('plaqueAvatar');
        const plaqueName = document.getElementById('plaqueName');
        const plaqueEnrollment = document.getElementById('plaqueEnrollment');
        const standbySwitchBtn = document.getElementById('standbySwitchBtn');

        const receiptCard = document.getElementById('receiptCard');
        const receiptHeading = document.getElementById('receiptHeading');
        const receiptStatusSub = document.getElementById('receiptStatusSub');
        const receiptSubject = document.getElementById('receiptSubject');
        const receiptTeacher = document.getElementById('receiptTeacher');
        const receiptSection = document.getElementById('receiptSection');
        const receiptTime = document.getElementById('receiptTime');
        const receiptStudentId = document.getElementById('receiptStudentId');

        // Ã¢-â‚¬Ã¢-â‚¬ Input Focus Helpers Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬
        nameInput.addEventListener('focus', () => nameCell.classList.add('focused'));
        nameInput.addEventListener('blur', () => nameCell.classList.remove('focused'));
        nameInput.addEventListener('input', () => clearError());

        enrollmentInput.addEventListener('focus', () => enrollmentCell.classList.add('focused'));
        enrollmentInput.addEventListener('blur', () => enrollmentCell.classList.remove('focused'));
        enrollmentInput.addEventListener('input', (e) => {
            const cur = e.target.value;
            const upper = cur.toUpperCase();
            if (cur !== upper) e.target.value = upper;
            clearError();
        });

        const emailInputGroup = document.getElementById('modernEmailGroup');
        if (emailInput && emailInputGroup) {
            emailInput.addEventListener('input', () => { document.getElementById('emailLoginError').style.display = 'none'; });
        }

        const otpBoxes = document.querySelectorAll('.otp-box');
        if (otpBoxes.length > 0) {
            otpBoxes.forEach((box, index) => {
                box.addEventListener('input', (e) => {
                    box.value = box.value.replace(/[^0-9]/g, '');
                    if (box.value && index < otpBoxes.length - 1) {
                        otpBoxes[index + 1].focus();
                    }
                    updateHiddenOtp();
                });

                box.addEventListener('keydown', (e) => {
                    if (e.key === 'Backspace' && !box.value && index > 0) {
                        otpBoxes[index - 1].focus();
                    }
                });
                
                box.addEventListener('paste', (e) => {
                    e.preventDefault();
                    const pastedData = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
                    if (pastedData) {
                        for (let i = 0; i < otpBoxes.length; i++) {
                            if (i < pastedData.length) {
                                otpBoxes[i].value = pastedData[i];
                            }
                        }
                        const nextFocus = Math.min(pastedData.length, otpBoxes.length - 1);
                        otpBoxes[nextFocus].focus();
                        updateHiddenOtp();
                    }
                });
            });
        }
        
        function updateHiddenOtp() {
            if(otpInput) {
                otpInput.value = Array.from(otpBoxes).map(b => b.value).join('');
                document.getElementById('otpError').style.display = 'none';
            }
        }

        // Click top chip to open profile portal
        profileChip.addEventListener('click', (e) => {
            if (e.target.closest('#switchProfileBtn')) return;
            window.location.href = '/student/profile';
        });

        const loginView = document.getElementById('loginView');
        const emailAuthView = document.getElementById('emailAuthView');
        const resetPasswordView = document.getElementById('resetPasswordView');

        function showView(view) {
            loadingView.style.display = view === 'loading' ? 'flex' : 'none';
            
            if (resetPasswordView) {
                resetPasswordView.style.display = view === 'resetPassword' ? 'block' : 'none';
                resetPasswordView.classList.toggle('hidden', view !== 'resetPassword');
            }
            
            if (loginView) {
                if(loginView) loginView.style.display = view === 'login' ? 'block' : 'none';
                if(loginView) loginView.classList.toggle('hidden', view !== 'login');
            }

            if(emailAuthView) emailAuthView.style.display = view === 'email' ? 'block' : 'none';
            if(emailAuthView) emailAuthView.classList.toggle('hidden', view !== 'email');
            
            if(authView) authView.style.display = view === 'auth' ? 'block' : 'none';
            if(authView) authView.classList.toggle('hidden', view !== 'auth');
            
            standbyView.style.display = view === 'standby' ? 'block' : 'none';
            standbyView.classList.toggle('hidden', view !== 'standby');
            
            receiptView.style.display = view === 'receipt' ? 'block' : 'none';
            receiptView.classList.toggle('hidden', view !== 'receipt');
        }

        

        const emailStep1 = document.getElementById('emailStep1');
        const emailStep2 = document.getElementById('emailStep2');
        const verifySubtitle = document.getElementById('verifySubtitle');

        let pendingEmail = '';
        let isRegistering = false;
        let pendingName = '';
        let pendingEnrollment = '';

        async function handleLogin() {
            const btn = document.getElementById('loginBtn');
            const err = document.getElementById('loginErrorMsg');
            const identifier = document.getElementById('loginIdentifierInput').value.trim();
            const password = document.getElementById('loginPasswordInput').value;

            if (!identifier || !password) {
                err.textContent = 'Please enter your email/enrollment and password.';
                err.style.display = 'block';
                return;
            }

            btn.disabled = true;
            btn.style.opacity = '0.7';
            err.style.display = 'none';

            let emailToUse = identifier;
            if (!identifier.includes('@')) {
                // Lookup email by enrollment
                try {
                    const res = await fetch('/api/student/lookup-email?enrollment=' + encodeURIComponent(identifier));
                    if (res.ok) {
                        const data = await res.json();
                        emailToUse = data.email;
                    } else {
                        err.textContent = 'Invalid Enrollment ID or Password.';
                        err.style.display = 'block';
                        btn.disabled = false;
                        btn.style.opacity = '1';
                        return;
                    }
                } catch(e) {
                    err.textContent = 'Network error during lookup.';
                    err.style.display = 'block';
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    return;
                }
            }

            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: emailToUse,
                password: password,
            });

            if (error) {
                err.textContent = error.message;
                err.style.display = 'block';
                btn.disabled = false;
                btn.style.opacity = '1';
            } else if (data.session) {
                googleAccessToken = data.session.access_token;
                authEmail = data.session.user.email;
                initApp(true);
            }
        }

        async function handleForgotPassword() {
            const btn = document.getElementById('loginBtn');
            const err = document.getElementById('loginErrorMsg');
            const identifier = document.getElementById('loginIdentifierInput').value.trim();

            if (!identifier) {
                err.textContent = 'Please enter your email or enrollment ID first.';
                err.style.display = 'block';
                return;
            }

            btn.disabled = true;
            btn.style.opacity = '0.7';
            const originalText = btn.textContent;
            btn.textContent = 'Sending link...';
            err.style.display = 'none';

            try {
                let emailToUse = identifier;
                if (!identifier.includes('@')) {
                    const res = await fetch('/api/student/lookup-email?enrollment=' + encodeURIComponent(identifier));
                    if (res.ok) {
                        const data = await res.json();
                        emailToUse = data.email;
                    } else {
                        err.textContent = 'Invalid Enrollment ID.';
                        err.style.display = 'block';
                        btn.disabled = false;
                        btn.style.opacity = '1';
                        btn.textContent = originalText;
                        return;
                    }
                }
                
                const { error } = await supabaseClient.auth.resetPasswordForEmail(emailToUse, {
                    redirectTo: window.location.origin + '/student.html'
                });
                
                if (error) {
                    err.textContent = error.message;
                    err.style.display = 'block';
                } else {
                    alert('Password reset link has been sent to ' + emailToUse);
                }
            } catch(e) {
                err.textContent = 'Network error during password reset.';
                err.style.display = 'block';
            } finally {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.textContent = originalText;
            }
        }

        async function submitNewPassword() {
            const btn = document.getElementById('submitNewPasswordBtn');
            const err = document.getElementById('resetErrorMsg');
            const password = document.getElementById('newPasswordInput').value;

            if (!password || password.length < 6) {
                err.textContent = 'Password must be at least 6 characters.';
                err.style.display = 'block';
                return;
            }

            btn.disabled = true;
            btn.style.opacity = '0.7';
            btn.textContent = 'Updating...';
            err.style.display = 'none';

            const { error } = await supabaseClient.auth.updateUser({ password: password });
            
            if (error) {
                err.textContent = error.message;
                err.style.display = 'block';
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.textContent = 'Update Password';
            } else {
                alert('Password updated successfully!');
                initApp(true);
            }
        }

        async function checkEmail() {
            const btn = document.getElementById('sendOtpBtn');
            const err = document.getElementById('emailLoginError');
            pendingEmail = emailInput.value.trim();
            if (!pendingEmail) {
                err.textContent = 'Please enter an email address';
                err.style.display = 'block';
                return;
            }
            
            btn.disabled = true;
            btn.style.opacity = '0.7';
            err.style.display = 'none';

            try {
                const res = await fetch('/api/student/check-email?email=' + encodeURIComponent(pendingEmail));
                const data = await res.json();
                
                if (data.registered) {
                    err.textContent = 'Email already registered. Please login instead.';
                    err.style.display = 'block';
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    return;
                }
                
                isRegistering = true;
                await sendOtp(pendingEmail);
            } catch (e) {
                err.textContent = 'Network error. Please try again.';
                err.style.display = 'block';
                btn.disabled = false;
                btn.style.opacity = '1';
            }
        }

        async function sendOtp(email) {
            if (!supabaseClient) return alert('Auth not initialized yet');
            const err = document.getElementById('emailLoginError');
            err.style.display = 'none';
            
            const options = {};
            if (typeof token !== 'undefined' && token) {
                options.emailRedirectTo = window.location.origin + '/student.html?token=' + encodeURIComponent(token);
            }
            
            const { error } = await supabaseClient.auth.signInWithOtp({ 
                email, 
                options 
            });
            
            if (error) {
                err.textContent = error.message;
                err.style.display = 'block';
            } else {
                emailInput.disabled = true;
                document.getElementById('sendOtpBtn').style.display = 'none';
                
                emailStep2.classList.remove('hidden');
                verifySubtitle.textContent = `Enter the 6-digit code sent to ${email} or click the magic link in the email.`;
                if (typeof otpBoxes !== 'undefined' && otpBoxes.length > 0) otpBoxes[0].focus();
            }
        }

        async function verifyOtp() {
            const btn = document.getElementById('verifyOtpBtn');
            const err = document.getElementById('otpError');
            const tokenValue = otpInput.value.trim();
            
            if (!tokenValue) {
                err.textContent = 'Please enter the code';
                err.style.display = 'block';
                return;
            }
            
            btn.disabled = true;
            btn.style.opacity = '0.7';
            err.style.display = 'none';
            
            const { data, error } = await supabaseClient.auth.verifyOtp({
                email: pendingEmail,
                token: tokenValue,
                type: 'email'
            });
            
            if (error) {
                err.textContent = error.message;
                err.style.display = 'block';
                btn.disabled = false;
                btn.style.opacity = '1';
            } else if (data.session) {
                googleAccessToken = data.session.access_token;
                authEmail = data.session.user.email;
                if (isRegistering) {
                    showRegistrationForm(pendingEmail);
                } else {
                    initApp(true);
                }
            }
        }

        function resetEmailAuth() {
            emailInput.disabled = false;
            document.getElementById('sendOtpBtn').style.display = 'block';
            emailStep2.classList.add('hidden');
            emailInput.value = '';
            otpInput.value = '';
            if (typeof otpBoxes !== 'undefined') otpBoxes.forEach(b => b.value = '');
            document.getElementById('emailLoginError').style.display = 'none';
            document.getElementById('otpError').style.display = 'none';
        }

        // Ã¢-â‚¬Ã¢-â‚¬ Application Router (Classroom Google Lens Journey) Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬
        async function initApp(skipAuthCheck = false) {
            renderProfileChip();
            showView('loading');
            
            const isRecovery = window.location.hash.includes('type=recovery');
            if (isRecovery) {
                window.history.replaceState(null, '', window.location.pathname);
                showView('resetPassword');
                return;
            }
            
            const studentToken = localStorage.getItem('student_token');
            const studentDataStr = localStorage.getItem('student_data');
            let isSignedIn = false;
            
            if (studentToken && studentDataStr) {
                try {
                    const data = JSON.parse(studentDataStr);
                    if (data.enrollment) {
                        profile = { name: data.name, enrollment: data.enrollment };
                        localStorage.setItem('profile', JSON.stringify(profile));
                        isSignedIn = true;
                    }
                } catch(e) {}
            }
            
            if (!isSignedIn) {
                // Bounce to unified login page
                const redir = token ? encodeURIComponent('/checkin.html?token=' + token) : '';
                window.location.href = '/login' + (redir ? '?redirect=' + redir : '');
                return;
            }

            if (token) {
                await processMarkAttendance(token);
            } else {
                renderProfileChip();
                showView('standby');
                updatePlaque();
            }
        }

        function showRegistrationForm(email) {
            showView('auth');
            stepPillLabel.textContent = token ? 'QR Scanned · 1-Time Setup' : '1-Time Setup';
            regHeading.textContent = 'Student Registration';
            regSubtitle.textContent = `Registering as ${email}. Enter your details below.`;
            regBtnLabel.textContent = token ? 'Confirm & Mark Present' : 'Save Profile';
            if (token) loadSessionInfo(token);
            else sessionDetectedBanner.style.display = 'none';
        }

        async function loadSessionInfo(qrToken) {
            try {
                const res = await fetch(`/api/session-info?token=${encodeURIComponent(qrToken)}`);
                const data = await res.json();
                if (res.ok && data.subject) {
                    const secPart = data.section ? ` (Sec ${data.section})` : '';
                    const semPart = data.semester ? ` · ${data.semester}` : '';
                    detectedSubjectText.textContent = `${data.subject}${secPart}${semPart}`;
                    detectedTeacherText.textContent = data.teacherName ? `Instructor: ${data.teacherName}` : 'Live Class Session';
                    sessionDetectedBanner.style.display = 'block';
                } else {
                    sessionDetectedBanner.style.display = 'none';
                }
            } catch (e) {
                sessionDetectedBanner.style.display = 'none';
            }
        }

        function renderProfileChip() {
            if (!profile) {
                profileChip.style.display = 'none';
                if (headerProfileLink) headerProfileLink.style.display = 'none';
                return;
            }
            const parts = (profile.name || '').trim().split(/\s+/);
            const initials = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]) : (parts[0] ? parts[0].slice(0, 2) : 'ST');
            
            if (profile.avatar) {
                chipAvatar.innerHTML = `<img src="${profile.avatar}" alt="Avatar" class="avatar-image">`;
            } else {
                chipAvatar.textContent = initials.toUpperCase();
            }
            chipName.textContent = parts[0] || 'Student';
            profileChip.style.display = 'flex';
            if (headerProfileLink) headerProfileLink.style.display = 'inline-flex';
        }

        function updatePlaque() {
            if (!profile) return;
            const parts = (profile.name || '').trim().split(/\s+/);
            const initials = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]) : (parts[0] ? parts[0].slice(0, 2) : 'ST');
            
            if (profile.avatar) {
                plaqueAvatar.innerHTML = `<img src="${profile.avatar}" alt="Avatar" class="avatar-image">`;
            } else {
                plaqueAvatar.textContent = initials.toUpperCase();
            }
            plaqueName.textContent = profile.name || 'Student';
            plaqueEnrollment.textContent = profile.enrollment || '';
        }

        // Ã¢-â‚¬Ã¢-â‚¬ Error Feedback Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬
        function showError(msg) {
            fieldErrorText.textContent = msg;
            fieldErrorMsg.style.display = 'flex';
            regGroup.classList.remove('shake-field');
            void regGroup.offsetWidth;
            regGroup.classList.add('shake-field');
        }

        function clearError() {
            fieldErrorMsg.style.display = 'none';
            fieldErrorText.textContent = '';
        }

        // Ã¢-â‚¬Ã¢-â‚¬ Registration Handler Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬
        regSubmitBtn.addEventListener('click', handleRegister);

                async function handleRegister() {
            clearError();

            const name = nameInput.value.trim();
            const enrollment = enrollmentInput.value.trim().toUpperCase();
            const passwordInput = document.getElementById('regPasswordInput');
            const password = passwordInput ? passwordInput.value : '';

            if (!name) {
                showError('Please enter your full name.');
                nameInput.focus();
                return;
            }
            if (name.length > 100) {
                showError('Name cannot exceed 100 characters.');
                return;
            }
            if (!NAME_REGEX.test(name)) {
                showError('Name must contain only letters and single spaces.');
                return;
            }

            if (!enrollment) {
                showError('Please enter your enrollment ID.');
                enrollmentInput.focus();
                return;
            }
            if (!ENROLLMENT_REGEX.test(enrollment)) {
                showError('Format: ADTU/1/2024-27/BCAO/012');
                return;
            }

            if (!password || password.length < 6) {
                showError('Password must be at least 6 characters.');
                if (passwordInput) passwordInput.focus();
                return;
            }

            regSubmitBtn.disabled = true;
            regBtnLabel.textContent = 'Saving Profile...';

            const { error } = await supabaseClient.auth.updateUser({ password: password });
            if (error) {
                showError(error.message);
                regSubmitBtn.disabled = false;
                regBtnLabel.textContent = token ? 'Confirm & Verify' : 'Save Profile';
                return;
            }

            pendingName = name;
            pendingEnrollment = enrollment;
            
            await finishRegistration();
            
            regSubmitBtn.disabled = false;
            regBtnLabel.textContent = token ? 'Confirm & Verify' : 'Save Profile';
        }

        async function finishRegistration() {
            showView('loading');
            try {
                const body = { access_token: googleAccessToken, name: pendingName, enrollment: pendingEnrollment };
                if (token) body.qr_token = token;

                const res = await fetch('/api/student/register-and-mark', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });

                const data = await res.json();

                if (!res.ok) {
                    showView('auth');
                    showError(data.error || 'Registration failed. Please check your details.');
                    return;
                }

                profile = data.profile || { name: pendingName, enrollment: pendingEnrollment };
                localStorage.setItem('profile', JSON.stringify(profile));
                renderProfileChip();

                if (token) {
                    // Marked attendance automatically during registration!
                    triggerSensoryFeedback();
                    showReceipt({
                        subject: data.subject || 'Lecture Session',
                        teacherName: data.teacherName || 'Course Instructor',
                        section: data.section || 'General',
                        semester: data.semester || '',
                        time: data.time || new Date().toISOString(),
                        already: data.already || false
                    });
                } else {
                    // Standby setup complete: show ready for class screen
                    showView('standby');
                    updatePlaque();
                }
            } catch (err) {
                console.error('Registration network error:', err);
                showError('Network error. Check connection and try again.');
            }
        }

        // Ã¢-â‚¬Ã¢-â‚¬ Attendance Marking Engine Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬
        async function processMarkAttendance(qrToken) {
            if (!profile || !qrToken) return;

            try {
                const res = await fetch('/api/mark', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        enrollment: profile.enrollment,
                        token: qrToken
                    })
                });

                const data = await res.json();

                if (res.ok) {
                    triggerSensoryFeedback();
                    showReceipt({
                        subject: data.subject || 'Lecture Session',
                        teacherName: data.teacherName || 'Course Instructor',
                        section: data.section || 'General',
                        semester: data.semester || '',
                        time: data.time || new Date().toISOString(),
                        already: data.already || false
                    });
                } else {
                    showView('standby');
                    alert(data.error || 'Session is inactive or QR code expired.');
                }
            } catch (err) {
                console.error('Mark attendance fetch error:', err);
                showView('standby');
                alert('Failed to mark attendance. Check campus Wi-Fi.');
            }
        }

        function showReceipt(info) {
            receiptHeading.textContent = info.already ? 'Already Recorded' : 'Marked Present!';
            receiptStatusSub.textContent = info.already ? 'You have already checked in to this session.' : 'Attendance verified & recorded digitally.';
            receiptSubject.textContent = info.subject;
            receiptTeacher.textContent = info.teacherName;
            receiptSection.textContent = (info.section ? `Section ${info.section}` : 'Standard') + (info.semester ? ` · ${info.semester}` : '');
            
            const d = new Date(info.time);
            receiptTime.textContent = isNaN(d.getTime()) ? 'Just now' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
            receiptStudentId.textContent = `${profile.name} · ${profile.enrollment}`;

            showView('receipt');
            receiptCard.style.display = 'block';
        }

        // Ã¢-â‚¬Ã¢-â‚¬ Profile Switching Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬
        function handleSwitchProfile() {
            if (!confirm('Switch student profile? You can enter a different Name and Enrollment ID.')) return;

            if (profileChip) {
                profileChip.style.display = 'none';
            }

            localStorage.removeItem('profile');
            profile = null;
            nameInput.value = '';
            enrollmentInput.value = '';
            initApp();
        }

        switchProfileBtn.addEventListener('click', handleSwitchProfile);
        standbySwitchBtn.addEventListener('click', handleSwitchProfile);



        // Ã¢-â‚¬Ã¢-â‚¬ Handle Scanned Link Re-Entry Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬Ã¢-â‚¬
        function checkUrlToken() {
            const urlTok = new URLSearchParams(location.search).get('token');
            if (urlTok && urlTok !== token) {
                token = urlTok;
                initApp();
            }
        }
        window.addEventListener('pageshow', checkUrlToken);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUrlToken(); });

        // Run
        initApp();