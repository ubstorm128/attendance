// register.js
function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    
    const eyeOpen = btn.querySelector('.eye-open');
    const eyeSlashed = btn.querySelector('.eye-slashed');
    
    if (input.type === 'text') {
        if(eyeOpen) eyeOpen.style.display = 'none';
        if(eyeSlashed) eyeSlashed.style.display = 'block';
    } else {
        if(eyeOpen) eyeOpen.style.display = 'block';
        if(eyeSlashed) eyeSlashed.style.display = 'none';
    }
}

function showMsg(msg, isSuccess = false) {
    const regMsg = document.getElementById('regMsg');
    if (!regMsg) return;
    regMsg.textContent = msg;
    regMsg.style.display = 'block';
    if(isSuccess) regMsg.classList.add('success');
    else regMsg.classList.remove('success');
}

async function registerStudent() {
    const name = document.getElementById('regStudentName').value.trim();
    const enrollment = document.getElementById('regStudentId').value.trim();
    const email = document.getElementById('regStudentEmail').value.trim();
    const section = document.getElementById('regStudentSection').value.trim();
    const password = document.getElementById('regStudentPass').value;
    
    if(!name || !enrollment || !email || !password) return showMsg('Name, Enrollment ID, Email, and Password are required.');
    
    const btn = document.getElementById('btnRegStudent');
    btn.textContent = 'Registering...';
    
    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, enrollment, email, section, password })
        });
        
        const data = await res.json();
        btn.textContent = 'Register Student';
        
        if (res.ok) {
            showMsg('Student account created successfully! Please log in.', true);
            setTimeout(() => {
                window.location.href = '/login';
            }, 2000);
        } else {
            showMsg(data.error || 'Registration failed');
        }
    } catch (e) {
        document.getElementById('btnRegStudent').textContent = 'Register Student';
        showMsg('Network error. Please try again.');
    }
}

async function registerTeacher() {
    const name = document.getElementById('regTeacherName').value.trim();
    const username = document.getElementById('regTeacherUser').value.trim();
    const password = document.getElementById('regTeacherPass').value;
    
    if(!name || !username || !password) return showMsg('All fields are required.');
    
    const btn = document.getElementById('btnRegTeacher');
    btn.textContent = 'Registering...';
    
    try {
        const res = await fetch('/api/register/teacher', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, username, password })
        });
        
        const data = await res.json();
        btn.textContent = 'Register Teacher';
        
        if (res.ok) {
            showMsg('Teacher account created successfully! Please log in.', true);
            setTimeout(() => {
                window.location.href = '/login';
            }, 2000);
        } else {
            showMsg(data.error || 'Registration failed');
        }
    } catch (e) {
        document.getElementById('btnRegTeacher').textContent = 'Register Teacher';
        showMsg('Network error. Please try again.');
    }
}
