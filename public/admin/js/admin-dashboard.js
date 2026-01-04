// Admin Dashboard Main Logic
const API_BASE = '/api';
let token = localStorage.getItem('adminToken');
let currentPage = 'dashboard';

// Check authentication
if (!token) {
    window.location.href = '/admin/index.html';
}

// Logout
document.getElementById('logoutBtn')?.addEventListener('click', () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    window.location.href = '/admin/index.html';
});

// Sidebar toggle
document.getElementById('sidebarToggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
});

// Page navigation
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        currentPage = page;

        // Update active nav
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        // Show page
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(`${page}Page`).classList.add('active');

        // Update breadcrumb
        document.getElementById('currentPage').textContent = item.querySelector('span').textContent;

        // Load page-specific data
        if (page === 'analytics') {
            loadAnalyticsPage();
        }
    });
});

// Load initial data
async function loadDashboardData() {
    try {
        // Get dashboard stats
        const dashboardRes = await fetchAPI('/admin/dashboard');
        if (dashboardRes.success) {
            const data = dashboardRes.data;
            document.getElementById('statToday').textContent = data.todayPageviews?.toLocaleString() || '0';
            document.getElementById('statActive').textContent = data.activeSessions || '0';
            document.getElementById('liveViewers').textContent = data.activeSessions || '0';
        }

        // Get detailed stats
        const statsRes = await fetchAPI('/admin/stats?period=7d');
        if (statsRes.success) {
            const stats = statsRes.data;
            
            // Calculate week total from pageviews
            const weekTotal = stats.pageviews?.reduce((sum, day) => sum + (day.count || 0), 0) || 0;
            document.getElementById('statWeek').textContent = weekTotal.toLocaleString();
            document.getElementById('statMonth').textContent = '-';
        }

        // Load charts
        loadTrendChart();
        loadDeviceChart();

        // Load watchers
        loadWatchers();

    } catch (error) {
        console.error('Failed to load dashboard data:', error);
        
        // Set fallback values
        document.getElementById('statToday').textContent = '0';
        document.getElementById('statWeek').textContent = '0';
        document.getElementById('statMonth').textContent = '0';
        document.getElementById('statActive').textContent = '0';
        document.getElementById('liveViewers').textContent = '0';
    }
}

async function loadWatchers() {
    try {
        const res = await fetchAPI('/admin/watchers');
        const watchers = res.data || [];

        const container = document.getElementById('watchersList');
        document.getElementById('watcherCount').textContent = watchers.length;

        if (watchers.length === 0) {
            container.innerHTML = '<div class="empty-state">No active watchers</div>';
            return;
        }

        container.innerHTML = watchers.map(w => `
            <div class="watcher-item">
                <div class="watcher-flag">${getCountryFlag(w.country)}</div>
                <div class="watcher-info">
                    <div class="watcher-location">${w.city || 'Unknown'}, ${w.country || 'Unknown'}</div>
                    <div class="watcher-content">${w.currentContent ? w.currentContent : (w.currentPage || 'Browsing')}</div>
                    <div class="watcher-device">${w.device || ''} • ${w.browser || ''}</div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to load watchers:', error);
        document.getElementById('watchersList').innerHTML = '<div class="empty-state">No active watchers</div>';
    }
}

function getCountryFlag(code) {
    if (!code || code.length !== 2) return '🌍';
    const codePoints = code.toUpperCase().split('').map(c => 127397 + c.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
}

// Load data on start
loadDashboardData();

// Realtime refresh every 5 seconds
setInterval(() => {
    if (currentPage === 'dashboard') {
        loadDashboardData();
    }
}, 5000);

// Show last updated time
function updateTimestamp() {
    const now = new Date();
    console.log(`[Dashboard] Last updated: ${now.toLocaleTimeString()}`);
}

// ==================== USER MANAGEMENT ====================
async function loadUsers() {
    try {
        const res = await fetchAPI('/admin/users');
        const users = res.data || [];
        
        const container = document.getElementById('usersList');
        
        if (users.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 30px; color: #999;">
                    <p>No admin users in database yet.</p>
                    <p style="font-size: 12px; margin-top: 10px;">Default login: admin / admin123</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = users.map(user => `
            <div class="user-item" style="display: flex; align-items: center; justify-content: space-between; padding: 15px; background: #2a2a2a; border-radius: 8px; margin-bottom: 10px;">
                <div>
                    <div style="font-weight: bold; color: #fff;">${user.username}</div>
                    <div style="font-size: 12px; color: #999;">${user.email}</div>
                    <div style="font-size: 11px; color: #666;">Role: ${user.role} • Last login: ${user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}</div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <span style="padding: 5px 10px; background: ${user.isActive ? '#2d5a2d' : '#5a2d2d'}; border-radius: 4px; font-size: 12px;">
                        ${user.isActive ? '✅ Active' : '❌ Inactive'}
                    </span>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to load users:', error);
        document.getElementById('usersList').innerHTML = '<div class="empty-state">Failed to load users</div>';
    }
}

// Add user form handler
document.getElementById('addUserForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('newUsername').value;
    const email = document.getElementById('newEmail').value;
    const password = document.getElementById('newPassword').value;
    const role = document.getElementById('newRole').value;
    
    const messageDiv = document.getElementById('addUserMessage');
    
    try {
        const res = await fetch('/api/admin/users/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ username, email, password, role })
        });
        
        const data = await res.json();
        
        if (data.success) {
            messageDiv.innerHTML = '<span style="color: #4CAF50;">✅ User created successfully!</span>';
            document.getElementById('addUserForm').reset();
            loadUsers();
        } else {
            messageDiv.innerHTML = `<span style="color: #f44336;">❌ ${data.error || 'Failed to create user'}</span>`;
        }
    } catch (error) {
        messageDiv.innerHTML = `<span style="color: #f44336;">❌ ${error.message}</span>`;
    }
});

// Load users when users page is shown
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        if (item.dataset.page === 'users') {
            loadUsers();
        }
    });
});

// Initialize dashboard on page load
console.log('Admin Dashboard initialized');
loadDashboardData();
