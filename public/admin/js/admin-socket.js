// Socket.IO Real-time Updates
let socket = null;

function initSocket() {
    socket = io('http://localhost:3000');

    socket.on('connect', () => {
        console.log('✅ Socket connected');
        socket.emit('join-admin');
    });

    socket.on('viewer-update', (data) => {
        console.log('📊 Viewer update:', data);
        document.getElementById('liveViewers').textContent = data.count;
        updateWatchers(data.watchers);
    });

    socket.on('disconnect', () => {
        console.log('❌ Socket disconnected');
    });
}

function updateWatchers(watchers) {
    const container = document.getElementById('watchersList');
    if (!container) return;

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
}

// Initialize socket on load
if (typeof io !== 'undefined') {
    initSocket();
}
