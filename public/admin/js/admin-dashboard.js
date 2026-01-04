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
