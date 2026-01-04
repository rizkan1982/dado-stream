// Admin Utilities
function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function formatDate(date) {
    return new Date(date).toLocaleDateString('id-ID', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatTime(date) {
    return new Date(date).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
}

function getCountryFlag(code) {
    if (!code || code.length !== 2) return '🌍';
    const codePoints = code.toUpperCase().split('').map(c => 127397 + c.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
}

// API Helper - fetch with auth token
async function fetchAPI(endpoint) {
    const token = localStorage.getItem('adminToken');
    console.log('fetchAPI called:', endpoint, 'Token exists:', !!token);
    
    if (!token) {
        console.error('No auth token found');
        window.location.href = '/admin/index.html';
        return { success: false, error: 'No token' };
    }
    
    try {
        const url = `/api${endpoint}`;
        console.log('Fetching:', url);
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        console.log('Response status:', response.status);
        
        if (response.status === 401) {
            console.error('Unauthorized - redirecting to login');
            localStorage.removeItem('adminToken');
            window.location.href = '/admin/index.html';
            return { success: false, error: 'Unauthorized' };
        }
        
        const data = await response.json();
        console.log('API Response:', data);
        return data;
    } catch (error) {
        console.error('API Error:', error);
        return { success: false, error: error.message };
    }
}
