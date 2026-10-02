const supabaseUrl = 'https://hddezwltrmtxizbxuvvf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkZGV6d2x0cm10eGl6Ynh1dnZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxOTc0MjQsImV4cCI6MjEwNDc3MzQyNH0.AmTVu6EKNkjkZ8KM_di7ev3jgDlOMHvwHYEvC6tRu7c';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

document.addEventListener('DOMContentLoaded', async () => {
    const statusEl = document.getElementById('callbackStatus');
    const msgEl = document.getElementById('callbackMsg');
    const btnBack = document.getElementById('btnBack');

    function showError(msg) {
        if (statusEl) statusEl.textContent = 'Access Denied';
        if (msgEl) {
            msgEl.textContent = msg;
            msgEl.className = 'auth-msg';
            msgEl.style.display = 'block';
        }
        if (btnBack) btnBack.classList.remove('hidden');
    }

    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error || !session) {
            return showError('Authentication failed. Please try again.');
        }

        const selectedRole = sessionStorage.getItem('selectedRole') || 'student';
        
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single();

        if (profileError || !profile) {
            console.error('Error fetching profile:', profileError);
            return showError('Could not verify your role. Please contact an administrator.');
        }

        const databaseRole = profile.role;

        if (selectedRole.toLowerCase() === databaseRole.toLowerCase()) {
            // Role matches, set backwards compatibility tokens if necessary
            // For now, Supabase session is available globally via supabase.auth.getSession()
            
            if (statusEl) statusEl.textContent = 'Success! Redirecting...';
            
            if (selectedRole === 'student') {
                const urlParams = new URLSearchParams(window.location.search);
                const redirect = urlParams.get('redirect');
                window.location.href = redirect ? decodeURIComponent(redirect) : '/student/profile';
            } else if (selectedRole === 'teacher') {
                window.location.href = '/teacher/dashboard';
            } else if (selectedRole === 'admin') {
                window.location.href = '/attendance-admin/dashboard';
            }
        } else {
            // Role mismatch
            const roleFormatted = selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1);
            showError(`This Google account is not registered as a ${roleFormatted}.`);
            await supabase.auth.signOut(); // Log them out so they can try another account
        }

    } catch (e) {
        console.error(e);
        showError('An unexpected error occurred.');
    }
});
