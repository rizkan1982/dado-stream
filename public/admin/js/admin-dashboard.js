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
        // Get realtime data in one call
        const realtimeRes = await fetchAPI('/analytics/realtime');
        if (realtimeRes.success) {
            const data = realtimeRes.data;
            document.getElementById('statToday').textContent = data.visitors.today.toLocaleString();
            document.getElementById('statWeek').textContent = data.visitors.week.toLocaleString();
            document.getElementById('statMonth').textContent = data.visitors.month.toLocaleString();
            document.getElementById('statActive').textContent = data.visitors.active;
            document.getElementById('liveViewers').textContent = data.visitors.active;
        }

        // Load charts
        loadTrendChart();
        loadDeviceChart();

        // Load watchers
        loadWatchers();

    } catch (error) {
        console.error('Failed to load dashboard data:', error);
        
        // Fallback to individual calls
        try {
            const statsRes = await fetchAPI('/analytics/stats');
            if (statsRes.success) {
                document.getElementById('statToday').textContent = statsRes.data.today.toLocaleString();
                document.getElementById('statWeek').textContent = statsRes.data.week.toLocaleString();
                document.getElementById('statMonth').textContent = statsRes.data.month.toLocaleString();
            }
            
            const activeRes = await fetchAPI('/analytics/active');
            if (activeRes.success) {
                document.getElementById('statActive').textContent = activeRes.data.count;
                document.getElementById('liveViewers').textContent = activeRes.data.count;
            }
        } catch (e) {
            console.error('Fallback also failed:', e);
        }
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
                <div class="watcher-flag">${getCountryFlag(w.location?.countryCode)}</div>
                <div class="watcher-info">
                    <div class="watcher-location">${w.location?.city || 'Unknown'}, ${w.location?.country || 'Unknown'}</div>
                    <div class="watcher-content">${w.currentContent ? `${w.currentContent.type}: ${w.currentContent.title}` : 'Browsing'}</div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to load watchers:', error);
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
