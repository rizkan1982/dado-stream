// Admin Authentication
const API_BASE = '/api';

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const errorMessage = document.getElementById('errorMessage');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        // Show loading
        loginBtn.disabled = true;
        loginBtn.querySelector('.btn-text').style.display = 'none';
        loginBtn.querySelector('.btn-loader').style.display = 'flex';
        errorMessage.style.display = 'none';

        try {
            const response = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Login failed');
            }

            // Save token
            localStorage.setItem('adminToken', data.token);
            localStorage.setItem('adminUser', JSON.stringify(data.user));

            // Redirect to dashboard
            window.location.href = '/admin/dashboard.html';

        } catch (error) {
            errorMessage.textContent = error.message;
            errorMessage.style.display = 'block';
        } finally {
            loginBtn.disabled = false;
            loginBtn.querySelector('.btn-text').style.display = 'inline';
            loginBtn.querySelector('.btn-loader').style.display = 'none';
        }
    });
});
