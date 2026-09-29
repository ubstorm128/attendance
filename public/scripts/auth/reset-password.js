let accessToken = null;

// Parse the hash fragment for access_token on load
window.addEventListener('DOMContentLoaded', () => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    if (params.has('access_token')) {
        accessToken = params.get('access_token');
    } else {
        // Fallback: check query params if they somehow came in as ?token=
        const queryParams = new URLSearchParams(window.location.search);
        if (queryParams.has('token')) {
            accessToken = queryParams.get('token');
        } else {
            showError("No reset token found in URL. Please click the link in your email again.");
            document.getElementById('btnSubmit').disabled = true;
        }
    }
});

function showError(msg) {
    const errBlock = document.getElementById('resetError');
    errBlock.querySelector('span').textContent = msg;
    errBlock.hidden = false;
}

function clearError() {
    document.getElementById('resetError').hidden = true;
}

async function submitReset() {
    clearError();
    const newPass = document.getElementById('newPassword').value;
    const confirmPass = document.getElementById('confirmPassword').value;
    const btn = document.getElementById('btnSubmit');

    if (!accessToken) {
        return showError("No valid reset token. Cannot update password.");
    }
    
    if (newPass.length < 6) {
        return showError("Password must be at least 6 characters.");
    }
    
    if (newPass !== confirmPass) {
        return showError("Passwords do not match.");
    }

    try {
        btn.textContent = 'Updating...';
        btn.disabled = true;

        const res = await fetch('/api/auth/reset-password-confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: accessToken, newPassword: newPass })
        });

        const data = await res.json();
        
        if (res.ok) {
            btn.textContent = 'Success!';
            setTimeout(() => {
                window.location.href = '/';
            }, 1500);
        } else {
            showError(data.error || 'Failed to reset password');
            btn.textContent = 'Update Password';
            btn.disabled = false;
        }
    } catch (e) {
        showError("Network error. Please try again.");
        btn.textContent = 'Update Password';
        btn.disabled = false;
    }
}

function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    
    if (input.type === 'password') {
        input.type = 'text';
        btn.setAttribute('aria-pressed', 'true');
    } else {
        input.type = 'password';
        btn.setAttribute('aria-pressed', 'false');
    }
}
