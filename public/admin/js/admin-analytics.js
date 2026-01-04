// Analytics Page - uses fetchAPI from admin-utils.js

// Charts for analytics page (separate from dashboard charts)
let analyticsHourlyChart = null;
let analyticsWeeklyChart = null;

// Load Analytics Page Data
async function loadAnalyticsPage() {
    try {
        // Load peak hours by country
        loadPeakHoursData();
        
        // Load hourly chart
        loadHourlyChart();
        
        // Load weekly chart
        loadWeeklyChart();
        
        // Load geo table
        loadGeoTable();
    } catch (error) {
        console.error('Failed to load analytics page:', error);
    }
}

// Load Peak Hours Table
async function loadPeakHoursData() {
    const container = document.getElementById('peakHoursTable');
    if (!container) return;
    
    try {
        const response = await fetchAPI('/analytics/peak-hours');
        const data = response.data || [];
        
        if (data.length === 0) {
            container.innerHTML = '<p style="color: #999; padding: 20px;">No data available yet. Visitors will appear here once they browse your site.</p>';
            return;
        }
        
        container.innerHTML = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: rgba(255,107,0,0.1); color: #ff6b00;">
                        <th style="padding: 12px; text-align: left;">Country</th>
                        <th style="padding: 12px; text-align: left;">Peak Hour</th>
                        <th style="padding: 12px; text-align: right;">Visitors</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(item => `
                        <tr style="border-bottom: 1px solid #333;">
                            <td style="padding: 12px;">
                                <span class="flag-icon">${getCountryFlag(item.countryCode || item.country?.substring(0,2))}</span>
                                ${item.country || 'Unknown'}
                            </td>
                            <td style="padding: 12px; color: #ff6b00; font-weight: 600;">
                                🕐 ${item.peakHour || '00:00'}
                            </td>
                            <td style="padding: 12px; text-align: right; font-weight: 600;">${(item.visitors || 0).toLocaleString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        console.error('Peak hours error:', error);
        container.innerHTML = '<p style="color: #ff4444; padding: 20px;">Failed to load data</p>';
    }
}

// Load Hourly Chart
async function loadHourlyChart() {
    const canvas = document.getElementById('hourlyChart');
    if (!canvas) return;
    
    try {
        const response = await fetchAPI('/analytics/hourly');
        const data = response.data || { labels: [], values: [] };
        
        if (analyticsHourlyChart) analyticsHourlyChart.destroy();
        
        analyticsHourlyChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Visitors',
                    data: data.values,
                    backgroundColor: 'rgba(255, 107, 0, 0.6)',
                    borderColor: '#ff6b00',
                    borderWidth: 1
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
                        grid: { color: '#333' },
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
        console.error('Failed to load hourly chart:', error);
    }
}

// Load Weekly Chart
async function loadWeeklyChart() {
    const canvas = document.getElementById('weeklyChart');
    if (!canvas) return;
    
    try {
        const response = await fetchAPI('/analytics/country-detail');
        const data = response.data || { weekdayData: [] };
        
        if (analyticsWeeklyChart) analyticsWeeklyChart.destroy();
        
        analyticsWeeklyChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: data.weekdayData.map(d => d.day),
                datasets: [{
                    label: 'Visitors',
                    data: data.weekdayData.map(d => d.count),
                    borderColor: '#ff6b00',
                    backgroundColor: 'rgba(255, 107, 0, 0.2)',
                    fill: true,
                    tension: 0.4
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
                        grid: { color: '#333' },
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
        console.error('Failed to load weekly chart:', error);
    }
}

// Load Geographic Table
async function loadGeoTable() {
    const container = document.getElementById('geoTable');
    if (!container) return;
    
    try {
        const response = await fetchAPI('/analytics/geo');
        const data = response.data || [];
        
        if (data.length === 0) {
            container.innerHTML = '<p style="color: #999; padding: 20px;">No geographic data available yet.</p>';
            return;
        }
        
        // Calculate total for percentage
        const total = data.reduce((sum, item) => sum + (item.visitors || 0), 0);
        
        container.innerHTML = `
            <div style="display: grid; gap: 10px; padding: 10px;">
                ${data.map(item => {
                    const percentage = total > 0 ? ((item.visitors || 0) / total * 100) : 0;
                    return `
                    <div style="display: flex; align-items: center; gap: 15px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                        <span style="font-size: 24px;">${getCountryFlag(item.countryCode || item.country?.substring(0,2))}</span>
                        <div style="flex: 1;">
                            <div style="font-weight: 600;">${item.country || 'Unknown'}</div>
                            <div style="font-size: 12px; color: #999;">${(item.visitors || 0).toLocaleString()} visits</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="color: #ff6b00; font-weight: 700;">${percentage.toFixed(1)}%</div>
                            <div style="height: 4px; width: 60px; background: #333; border-radius: 2px; overflow: hidden;">
                                <div style="height: 100%; width: ${percentage}%; background: #ff6b00;"></div>
                            </div>
                        </div>
                    </div>
                `}).join('')}
            </div>
        `;
    } catch (error) {
        console.error('Geo table error:', error);
        container.innerHTML = '<p style="color: #ff4444; padding: 20px;">Failed to load geographic data</p>';
    }
}

// Get flag emoji from country code (use getCountryFlag from admin-utils.js)
// getFlagEmoji is deprecated, use getCountryFlag instead
