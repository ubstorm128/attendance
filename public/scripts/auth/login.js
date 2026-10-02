if (window.location.hash && window.location.hash.includes('type=recovery')) {
    window.location.replace('/reset-password' + window.location.hash);
}

const urlParams = new URLSearchParams(window.location.search);
let currentRole = urlParams.get('role');
if (!currentRole) {
    try { currentRole = sessionStorage.getItem('selectedRole'); } catch(e) {}
}
if (!currentRole) currentRole = 'student';
currentRole = currentRole.toLowerCase().trim();

function initLoginUI() {
    // Setup titles
    const heading = document.getElementById('loginHeading');
    const subtitle = document.getElementById('loginSubtitle');
    const sForm = document.getElementById('studentForm');
    const stForm = document.getElementById('staffForm');
    const footer = document.getElementById('loginFooter');
    
    if (currentRole === 'student') {
        if (heading) heading.textContent = 'Student Login';
        if (subtitle) subtitle.textContent = 'Sign in to access your student dashboard.';
        if (sForm) sForm.classList.remove('hidden');
        if (sForm) sForm.style.display = 'block';
        if (stForm) stForm.classList.add('hidden');
        if (stForm) stForm.style.display = 'none';
        
        if (footer) {
            footer.innerHTML = `<span>No student account?</span> <a href="/register/student">Register here</a>`;
            footer.classList.remove('hidden');
        }
    } else if (currentRole === 'teacher' || currentRole === 'admin') {
        if (heading) heading.textContent = currentRole === 'teacher' ? 'Teacher Login' : 'Admin Login';
        if (subtitle) subtitle.textContent = currentRole === 'teacher' ? 'Sign in to access your teacher dashboard.' : 'Sign in to access the attendance administration dashboard.';
        if (sForm) sForm.classList.add('hidden');
        if (sForm) sForm.style.display = 'none';
        if (stForm) stForm.classList.remove('hidden');
        if (stForm) stForm.style.display = 'block';
        
        if (footer) {
            if (currentRole === 'teacher') {
                footer.innerHTML = `<span>No teacher account?</span> <a href="/register/teacher">Register here</a>`;
                footer.classList.remove('hidden');
            } else {
                footer.classList.add('hidden');
            }
        }
    }
    
    const loginMsg = document.getElementById('loginMsg');
    if (loginMsg) loginMsg.style.display = 'none';
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLoginUI);
} else {
    initLoginUI();
}

function backToRoles() {
    window.location.href = '/main';
}

function showMsg(msg, isSuccess = false) {
    const el = document.getElementById('loginMsg');
    el.textContent = msg;
    el.className = 'auth-msg ' + (isSuccess ? 'success' : '');
    el.style.display = 'block';
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

async function loginStudent() {
    const identifier = document.getElementById('studentIdentifier').value.trim();
    const password = document.getElementById('studentPass').value;
    if (!identifier || !password) return showMsg('Please enter your Enrollment ID/Email and password');

    try {
        const btn = document.getElementById('btnStudent');
        btn.textContent = 'Authenticating...';
        
        const res = await fetch('/api/student/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier, password })
        });
        const data = await res.json();
        
        btn.textContent = 'Sign In';
        
        if (!res.ok) {
            return showMsg(data.error || 'Login failed');
        }
        
        localStorage.setItem('student_token', data.token);
        localStorage.setItem('student_data', JSON.stringify({ enrollment: data.enrollment, name: data.name }));
        const urlParams = new URLSearchParams(window.location.search);
        const redirect = urlParams.get('redirect');
        window.location.href = redirect ? decodeURIComponent(redirect) : '/student/profile';
        
    } catch (e) {
        document.getElementById('btnStudent').textContent = 'Sign In';
        showMsg('Network error. Please try again.');
    }
}

async function loginStaff() {
    const user = document.getElementById('staffUser').value.trim();
    const pass = document.getElementById('staffPass').value;
    
    if (!user || !pass) return showMsg('Please enter both username and password.');
    
    const endpoint = currentRole === 'teacher' ? '/api/login' : '/api/admin/login';
    const redirectUrl = currentRole === 'teacher' ? '/teacher/dashboard' : '/attendance-admin/dashboard';
    const storageKey = currentRole === 'teacher' ? 'teacher_token' : 'admin_token';
    const storageData = currentRole === 'teacher' ? 'teacher_data' : 'admin_data';
    
    try {
        const btn = document.getElementById('btnStaff');
        btn.textContent = 'Authenticating...';
        
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });
        
        const data = await res.json();
        btn.textContent = 'Sign In';
        
        if (res.ok) {
            localStorage.setItem(storageKey, data.token);
            if(currentRole === 'teacher') {
                localStorage.setItem(storageData, JSON.stringify({ id: data.teacherId, name: data.teacherName }));
            } else {
                localStorage.setItem(storageData, JSON.stringify({ id: data.adminId, name: data.username }));
            }
            window.location.href = redirectUrl;
        } else {
            showMsg(data.error || 'Login failed');
        }
    } catch (e) {
        document.getElementById('btnStaff').textContent = 'Sign In';
        showMsg('Network error. Please try again.');
    }
}

// --- Supabase Google OAuth ---
const supabaseUrl = 'https://hddezwltrmtxizbxuvvf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkZGV6d2x0cm10eGl6Ynh1dnZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxOTc0MjQsImV4cCI6MjEwNDc3MzQyNH0.AmTVu6EKNkjkZ8KM_di7ev3jgDlOMHvwHYEvC6tRu7c';
let supabaseClient = null;
if (window.supabase) {
    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
}

async function loginWithGoogle() {
    showMsg('Google Authentication is coming soon!');
}
