// Chart.js Configuration
let trendChart = null;
let deviceChart = null;
let hourlyChart = null; // New hourly chart

async function loadTrendChart() {
    try {
        const res = await fetchAPI('/admin/stats?period=7d');
        const pageviews = res.data?.pageviews || [];

        const ctx = document.getElementById('trendChart');
        if (!ctx) return;

        if (trendChart) trendChart.destroy();

        // Generate last 7 days labels
        const labels = [];
        const values = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            labels.push(date.toLocaleDateString('id-ID', { weekday: 'short' }));
            
            const found = pageviews.find(p => p._id === dateStr);
            values.push(found ? found.count : 0);
        }

        trendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Visitors',
                    data: values,
                    borderColor: '#FF6700',
                    backgroundColor: 'rgba(255, 103, 0, 0.1)',
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: '#FF6700'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#2a2a2a' },
                        ticks: { color: '#999' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#999' }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Failed to load trend chart:', error);
    }
}

async function loadHourlyChart() {
    try {
        const res = await fetchAPI('/analytics/hourly');
        const data = res.data || Array(24).fill(0); // Expecting array of 24 numbers

        const ctx = document.getElementById('hourlyChart');
        if (!ctx) return;

        if (hourlyChart) hourlyChart.destroy();

        hourlyChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
                datasets: [{
                    label: 'Peak Times',
                    data: data,
                    backgroundColor: data.map((v, i) => {
                        const max = Math.max(...data);
                        return v === max && v > 0 ? '#FF6700' : 'rgba(255, 103, 0, 0.4)';
                    }),
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => `Visitors: ${context.raw}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#2a2a2a' },
                        ticks: { color: '#999', stepSize: 1 }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#999', font: { size: 10 } }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Failed to load hourly chart:', error);
    }
}

async function loadDeviceChart() {
    try {
        const res = await fetchAPI('/analytics/devices');
        const devices = res.data || [];

        const ctx = document.getElementById('deviceChart');
        if (!ctx) return;

        if (deviceChart) deviceChart.destroy();

        const labels = devices.map(d => d.device || 'unknown');
        const data = devices.map(d => d.count);

        deviceChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
                datasets: [{
                    data: data,
                    backgroundColor: ['#FF6700', '#FFFFFF', '#333333', '#666666'],
                    borderWidth: 2,
                    borderColor: '#1a1a1a'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#999', padding: 15, font: { size: 12 } }
                    }
                },
                cutout: '70%'
            }
        });
    } catch (error) {
        console.error('Failed to load device chart:', error);
    }
}
