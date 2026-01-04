import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// API endpoints
const API_BASE = 'https://api.sansekai.my.id/api';
const ANIME_API = 'https://www.sankavollerei.com/anime/samehadaku';
const KOMIK_API = 'https://api-manga-five.vercel.app';
const KOMIK_PROVIDER = 'shinigami';

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'dado-stream-secret-key-2024';
const MONGODB_URI = process.env.MONGODB_URI || '';

// MongoDB Connection (cached for serverless)
let cachedDb: typeof mongoose | null = null;

async function connectDB() {
    if (cachedDb && mongoose.connection.readyState === 1) {
        return cachedDb;
    }
    
    if (!MONGODB_URI) {
        console.log('MongoDB URI not configured, using fallback mode');
        return null;
    }

    try {
        cachedDb = await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 10000,
            maxPoolSize: 10,
            minPoolSize: 1,
        });
        console.log('MongoDB connected');
        return cachedDb;
    } catch (error) {
        console.error('MongoDB connection error:', error);
        return null;
    }
}

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'superadmin'], default: 'admin' },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

// Analytics Schema
const analyticsSchema = new mongoose.Schema({
    eventType: { type: String, required: true },
    page: String,
    contentId: String,
    contentType: String,
    contentTitle: String,
    userAgent: String,
    ip: String,
    country: String,
    city: String,
    device: String,
    browser: String,
    os: String,
    sessionId: String,
    timestamp: { type: Date, default: Date.now }
});

// Session Schema
const sessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true },
    ip: String,
    userAgent: String,
    device: String,
    browser: String,
    os: String,
    country: String,
    city: String,
    currentPage: String,
    currentContent: String,
    isActive: { type: Boolean, default: true },
    startTime: { type: Date, default: Date.now },
    lastActivity: { type: Date, default: Date.now }
});

// Get or create models (avoid re-compilation in serverless)
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Analytics = mongoose.models.Analytics || mongoose.model('Analytics', analyticsSchema);
const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);

// Default admin credentials (fallback when no MongoDB)
const FALLBACK_ADMIN = {
    username: 'admin',
    password: 'admin123',
    role: 'superadmin'
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { path } = req.query;
    const pathStr = Array.isArray(path) ? path.join('/') : path || '';

    try {
        // Route handling
        if (pathStr.startsWith('auth/')) {
            return await handleAuth(pathStr.replace('auth/', ''), req, res);
        } else if (pathStr.startsWith('admin/')) {
            return await handleAdmin(pathStr.replace('admin/', ''), req, res);
        } else if (pathStr.startsWith('analytics/')) {
            return await handleAnalytics(pathStr.replace('analytics/', ''), req, res);
        } else if (pathStr.startsWith('dramabox/')) {
            return await handleDramabox(pathStr.replace('dramabox/', ''), req, res);
        } else if (pathStr.startsWith('anime/')) {
            return await handleAnime(pathStr.replace('anime/', ''), req, res);
        } else if (pathStr.startsWith('komik/')) {
            return await handleKomik(pathStr.replace('komik/', ''), req, res);
        } else if (pathStr.startsWith('proxy/')) {
            return await handleProxy(pathStr.replace('proxy/', ''), req, res);
        }

        return res.status(404).json({ error: 'Not found' });
    } catch (error: any) {
        console.error('API Error:', error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// ==================== AUTH HANDLERS ====================
async function handleAuth(action: string, req: VercelRequest, res: VercelResponse) {
    if (action === 'login' && req.method === 'POST') {
        const { username, password } = req.body || {};

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        await connectDB();

        // Try MongoDB first
        if (mongoose.connection.readyState === 1) {
            try {
                const user = await User.findOne({
                    $or: [{ username }, { email: username }]
                });

                if (!user) {
                    return res.status(401).json({ error: 'Invalid credentials' });
                }

                if (!user.isActive) {
                    return res.status(403).json({ error: 'Account is inactive' });
                }

                const isPasswordValid = await bcrypt.compare(password, user.password);
                if (!isPasswordValid) {
                    return res.status(401).json({ error: 'Invalid credentials' });
                }

                // Update last login
                user.lastLogin = new Date();
                await user.save();

                const token = jwt.sign(
                    { id: user._id, username: user.username, role: user.role },
                    JWT_SECRET,
                    { expiresIn: '7d' }
                );

                return res.json({
                    success: true,
                    token,
                    user: {
                        id: user._id,
                        username: user.username,
                        email: user.email,
                        role: user.role
                    }
                });
            } catch (error: any) {
                console.error('Login DB error:', error);
            }
        }

        // Fallback to hardcoded admin
        if (username === FALLBACK_ADMIN.username && password === FALLBACK_ADMIN.password) {
            const token = jwt.sign(
                { id: 'fallback-admin', username: FALLBACK_ADMIN.username, role: FALLBACK_ADMIN.role },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            return res.json({
                success: true,
                token,
                user: {
                    id: 'fallback-admin',
                    username: FALLBACK_ADMIN.username,
                    email: 'admin@dadostream.com',
                    role: FALLBACK_ADMIN.role
                }
            });
        }

        return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (action === 'verify') {
        const authHeader = req.headers.authorization;
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        try {
            const decoded = jwt.verify(token, JWT_SECRET) as any;
            return res.json({ success: true, user: decoded });
        } catch (error) {
            return res.status(401).json({ error: 'Invalid token' });
        }
    }

    if (action === 'logout') {
        return res.json({ success: true, message: 'Logged out successfully' });
    }

    return res.status(404).json({ error: 'Unknown auth action' });
}

// ==================== ADMIN HANDLERS ====================
async function handleAdmin(action: string, req: VercelRequest, res: VercelResponse) {
    // Verify admin token
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }

    await connectDB();

    if (action === 'dashboard') {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        let totalUsers = 0, activeSessions = 0, todayPageviews = 0;

        if (mongoose.connection.readyState === 1) {
            try {
                [totalUsers, activeSessions, todayPageviews] = await Promise.all([
                    User.countDocuments(),
                    Session.countDocuments({ isActive: true, lastActivity: { $gte: new Date(Date.now() - 5 * 60 * 1000) } }),
                    Analytics.countDocuments({ eventType: 'pageview', timestamp: { $gte: today } })
                ]);
            } catch (error) {
                console.error('Dashboard stats error:', error);
            }
        }

        return res.json({
            success: true,
            data: {
                totalUsers,
                activeSessions,
                todayPageviews,
                serverUptime: process.uptime()
            }
        });
    }

    if (action === 'watchers') {
        const limit = parseInt(req.query.limit as string) || 20;
        let watchers: any[] = [];

        if (mongoose.connection.readyState === 1) {
            try {
                watchers = await Session.find({
                    isActive: true,
                    lastActivity: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
                })
                .sort({ lastActivity: -1 })
                .limit(limit)
                .lean();
            } catch (error) {
                console.error('Watchers error:', error);
            }
        }

        return res.json({ success: true, data: watchers });
    }

    if (action === 'stats') {
        const period = req.query.period as string || '7d';
        let stats: any = { pageviews: [], topContent: [], devices: [], countries: [] };

        if (mongoose.connection.readyState === 1) {
            try {
                const days = period === '30d' ? 30 : period === '24h' ? 1 : 7;
                const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

                // Get pageviews by day
                const pageviewsAgg = await Analytics.aggregate([
                    { $match: { eventType: 'pageview', timestamp: { $gte: startDate } } },
                    { $group: { 
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
                        count: { $sum: 1 }
                    }},
                    { $sort: { _id: 1 } }
                ]);

                // Get top content
                const topContentAgg = await Analytics.aggregate([
                    { $match: { eventType: { $in: ['watch', 'read'] }, timestamp: { $gte: startDate } } },
                    { $group: { 
                        _id: { contentId: '$contentId', contentTitle: '$contentTitle', contentType: '$contentType' },
                        views: { $sum: 1 }
                    }},
                    { $sort: { views: -1 } },
                    { $limit: 10 }
                ]);

                // Get devices
                const devicesAgg = await Analytics.aggregate([
                    { $match: { timestamp: { $gte: startDate } } },
                    { $group: { _id: '$device', count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ]);

                // Get countries
                const countriesAgg = await Analytics.aggregate([
                    { $match: { timestamp: { $gte: startDate } } },
                    { $group: { _id: '$country', count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: 10 }
                ]);

                stats = {
                    pageviews: pageviewsAgg,
                    topContent: topContentAgg.map(item => ({
                        ...item._id,
                        views: item.views
                    })),
                    devices: devicesAgg,
                    countries: countriesAgg
                };
            } catch (error) {
                console.error('Stats error:', error);
            }
        }

        return res.json({ success: true, data: stats });
    }

    if (action === 'users') {
        let users: any[] = [];

        if (mongoose.connection.readyState === 1) {
            try {
                users = await User.find().select('-password').sort({ createdAt: -1 }).lean();
            } catch (error) {
                console.error('Users error:', error);
            }
        }

        return res.json({ success: true, data: users });
    }

    return res.status(404).json({ error: 'Unknown admin action' });
}

// ==================== ANALYTICS HANDLERS ====================
async function handleAnalytics(action: string, req: VercelRequest, res: VercelResponse) {
    await connectDB();

    if (action === 'track' && req.method === 'POST') {
        const eventData = req.body || {};
        
        if (mongoose.connection.readyState === 1) {
            try {
                // Parse user agent
                const userAgent = req.headers['user-agent'] || '';
                const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
                           req.headers['x-real-ip'] as string || 
                           'unknown';

                const analytics = new Analytics({
                    ...eventData,
                    userAgent,
                    ip,
                    timestamp: new Date()
                });
                await analytics.save();

                // Update or create session
                if (eventData.sessionId) {
                    await Session.findOneAndUpdate(
                        { sessionId: eventData.sessionId },
                        {
                            $set: {
                                lastActivity: new Date(),
                                currentPage: eventData.page,
                                currentContent: eventData.contentTitle,
                                isActive: true,
                                userAgent,
                                ip
                            },
                            $setOnInsert: {
                                startTime: new Date()
                            }
                        },
                        { upsert: true, new: true }
                    );
                }
            } catch (error) {
                console.error('Track error:', error);
            }
        }

        return res.json({ success: true });
    }

    if (action === 'heartbeat' && req.method === 'POST') {
        const { sessionId } = req.body || {};

        if (sessionId && mongoose.connection.readyState === 1) {
            try {
                await Session.findOneAndUpdate(
                    { sessionId },
                    { lastActivity: new Date(), isActive: true }
                );
            } catch (error) {
                console.error('Heartbeat error:', error);
            }
        }

        return res.json({ success: true });
    }

    return res.status(404).json({ error: 'Unknown analytics action' });
}

// Dramabox handlers
async function handleDramabox(action: string, req: VercelRequest, res: VercelResponse) {
    const config = { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } };

    if (action === 'latest' || action === 'trending' || action === 'vip' || action === 'foryou') {
        const response = await axios.get(`${API_BASE}/dramabox/${action}`, config);
        // API returns array directly or { data: [...] } or { value: [...] }
        const results = Array.isArray(response.data) ? response.data : (response.data?.data || response.data?.value || []);
        return res.json(results);
    }

    if (action === 'dubindo') {
        const classify = req.query.classify || 'terbaru';
        const response = await axios.get(`${API_BASE}/dramabox/dubindo`, {
            ...config,
            params: { classify }
        });
        const results = Array.isArray(response.data) ? response.data : (response.data?.data || response.data?.value || []);
        return res.json(results);
    }

    if (action === 'search') {
        const q = req.query.q || req.query.query;
        if (!q) return res.status(400).json({ error: 'Query required' });
        const response = await axios.get(`${API_BASE}/dramabox/search`, {
            ...config,
            params: { query: q }
        });
        const results = Array.isArray(response.data) ? response.data : (response.data?.data || response.data?.value || []);
        return res.json(results);
    }

    if (action === 'detail') {
        const { bookId } = req.query;
        if (!bookId) return res.status(400).json({ error: 'bookId required' });
        const response = await axios.get(`${API_BASE}/dramabox/detail`, {
            ...config,
            params: { bookId }
        });
        // API can return { data: {...} } or object directly
        const result = response.data?.data || response.data;
        return res.json(result);
    }

    if (action === 'allepisode') {
        const { bookId } = req.query;
        if (!bookId) return res.status(400).json({ error: 'bookId required' });
        const response = await axios.get(`${API_BASE}/dramabox/allepisode`, {
            ...config,
            params: { bookId }
        });
        // API returns array directly, not { data: [...] }
        const results = Array.isArray(response.data) ? response.data : (response.data?.data || []);
        return res.json(results);
    }

    return res.status(404).json({ error: 'Unknown dramabox action' });
}

// Anime handlers
async function handleAnime(action: string, req: VercelRequest, res: VercelResponse) {
    const config = { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } };

    // Latest anime episodes
    if (action === 'latest' || !action) {
        try {
            const page = req.query.page || '1';
            const response = await axios.get(`${ANIME_API}/recent`, {
                ...config,
                params: { page }
            });
            
            const animeList = response.data?.data?.animeList || [];
            const items = animeList.map((item: any) => ({
                id: item.animeId,
                urlId: item.animeId,
                judul: item.title,
                title: item.title,
                image: item.poster,
                thumbnail_url: item.poster,
                episode: item.episodes || 'Latest',
                releaseDate: item.releasedOn,
                type: 'Anime'
            }));
            
            return res.json(items);
        } catch (error: any) {
            console.error('[Anime Latest Error]:', error.message);
            return res.status(500).json({ error: 'Failed to fetch latest anime' });
        }
    }

    // Trending/Popular anime
    if (action === 'trending' || action === 'popular') {
        try {
            const page = req.query.page || '1';
            const response = await axios.get(`${ANIME_API}/popular`, {
                ...config,
                params: { page }
            });
            
            const animeList = response.data?.data?.animeList || [];
            const items = animeList.map((item: any) => ({
                id: item.animeId,
                urlId: item.animeId,
                judul: item.title,
                title: item.title,
                image: item.poster,
                thumbnail_url: item.poster,
                episode: item.episodes || '?',
                rating: item.rating || '?',
                type: 'Anime'
            }));
            
            return res.json(items);
        } catch (error: any) {
            console.error(`[Anime ${action} Error]:`, error.message);
            return res.status(500).json({ error: `Failed to fetch ${action} anime` });
        }
    }

    // Movie anime
    if (action === 'movie') {
        try {
            const page = req.query.page || '1';
            const response = await axios.get(`${ANIME_API}/movies`, {
                ...config,
                params: { page }
            });
            
            const animeList = response.data?.data?.animeList || [];
            const items = animeList.map((item: any) => ({
                id: item.animeId,
                urlId: item.animeId,
                judul: item.title,
                title: item.title,
                image: item.poster,
                thumbnail_url: item.poster,
                episode: 'Movie',
                type: 'Movie'
            }));
            
            return res.json(items);
        } catch (error: any) {
            console.error('[Anime Movie Error]:', error.message);
            return res.status(500).json({ error: 'Failed to fetch anime movies' });
        }
    }

    // Ongoing anime
    if (action === 'ongoing') {
        try {
            const page = req.query.page || '1';
            const response = await axios.get(`${ANIME_API}/ongoing`, {
                ...config,
                params: { page, order: 'popular' }
            });
            
            const animeList = response.data?.data?.animeList || [];
            const items = animeList.map((item: any) => ({
                id: item.animeId,
                urlId: item.animeId,
                judul: item.title,
                title: item.title,
                image: item.poster,
                thumbnail_url: item.poster,
                episode: item.episodes || '?',
                rating: item.rating || '?',
                type: 'Ongoing'
            }));
            
            return res.json(items);
        } catch (error: any) {
            return res.status(500).json({ error: 'Failed to fetch ongoing anime' });
        }
    }

    // Search anime
    if (action === 'search') {
        try {
            const query = req.query.q || req.query.query;
            const page = req.query.page || '1';
            
            if (!query) {
                return res.status(400).json({ error: 'Query parameter required' });
            }
            
            const response = await axios.get(`${ANIME_API}/search`, {
                ...config,
                params: { q: query, page }
            });
            
            const animeList = response.data?.data?.animeList || [];
            const items = animeList.map((item: any) => ({
                id: item.animeId,
                urlId: item.animeId,
                judul: item.title,
                title: item.title,
                image: item.poster,
                thumbnail_url: item.poster,
                episode: item.episodes || '?',
                rating: item.rating || '?',
                type: 'Anime'
            }));
            
            return res.json(items);
        } catch (error: any) {
            console.error('[Anime Search Error]:', error.message);
            return res.status(500).json({ error: 'Failed to search anime' });
        }
    }

    // Anime detail
    if (action === 'detail') {
        try {
            const urlId = req.query.urlId || req.query.id;
            if (!urlId) {
                return res.status(400).json({ error: 'urlId required' });
            }
            
            const response = await axios.get(`${ANIME_API}/anime/${urlId}`, config);
            const data = response.data?.data;
            
            if (!data) {
                return res.status(404).json({ error: 'Anime not found' });
            }
            
            // Parse episodes
            const episodes = (data.episodeList || []).map((ep: any) => ({
                id: ep.episodeId,
                chapterUrlId: ep.episodeId,
                title: ep.title,
                judul: ep.title,
                releaseDate: ep.releaseDate,
                releasedOn: ep.releaseDate
            }));
            
            const result = {
                id: data.animeId,
                urlId: data.animeId,
                title: data.title,
                judul: data.title,
                poster: data.poster,
                image: data.poster,
                thumbnail_url: data.poster,
                synopsis: data.synopsis?.paragraphs?.join('\\n\\n') || 'No synopsis available',
                rating: data.rating || '?',
                type: data.type || 'TV',
                status: data.status || 'Unknown',
                releaseDate: data.releaseDate || 'Unknown',
                totalEpisodes: episodes.length,
                genreList: (data.genreList || []).map((g: any) => g.title).join(', '),
                episodes: episodes
            };
            
            return res.json(result);
        } catch (error: any) {
            console.error('[Anime Detail Error]:', error.message);
            return res.status(500).json({ error: 'Failed to fetch anime detail' });
        }
    }

    // Get video streaming links
    if (action === 'getvideo') {
        try {
            const episodeId = req.query.episodeId || req.query.episode_id || req.query.chapterUrlId;
            if (!episodeId) {
                return res.status(400).json({ error: 'episodeId required' });
            }
            
            console.log('[Anime Video] Fetching episode:', episodeId);
            
            // Get episode detail with streaming servers
            const response = await axios.get(`${ANIME_API}/episode/${episodeId}`, config);
            const data = response.data?.data;
            
            if (!data) {
                console.log('[Anime Video] Episode not found');
                return res.json({
                    data: [],
                    sources: [],
                    subtitles: [],
                    error: 'streaming_unavailable',
                    message: 'Episode tidak ditemukan'
                });
            }
            
            // Get default streaming URL
            const defaultStreamUrl = data.defaultStreamingUrl;
            
            // Get server qualities
            const servers: any[] = [];
            if (data.server?.qualities) {
                for (const quality of data.server.qualities) {
                    const qualityName = quality.title;
                    for (const server of (quality.serverList || [])) {
                        servers.push({
                            quality: qualityName,
                            server: server.title,
                            serverId: server.serverId
                        });
                    }
                }
            }
            
            console.log(`[Anime Video] Found ${servers.length} servers`);
            
            // If we have servers, get the first server's embed URL
            let videoUrl = defaultStreamUrl;
            if (servers.length > 0) {
                try {
                    const firstServer = servers[0];
                    const serverResponse = await axios.get(`${ANIME_API}/server/${firstServer.serverId}`, config);
                    videoUrl = serverResponse.data?.data?.url || defaultStreamUrl;
                    console.log('[Anime Video] Got server URL:', videoUrl?.substring(0, 50));
                } catch (err) {
                    console.error('[Anime Video] Server fetch error:', err);
                }
            }
            
            if (!videoUrl) {
                return res.json({
                    data: [],
                    sources: [],
                    subtitles: [],
                    error: 'streaming_unavailable',
                    message: 'Tidak ada link streaming tersedia'
                });
            }
            
            // Return in format expected by frontend
            const streamArray = [{
                link: videoUrl,
                reso: 'auto'
            }];
            
            return res.json({
                data: [{
                    stream: streamArray.map(s => `link=${s.link};reso=${s.reso}`)
                }],
                sources: [{ url: videoUrl, quality: 'auto' }],
                subtitles: [],
                servers: servers
            });
            
        } catch (error: any) {
            console.error('[Anime Video Error]:', error.message);
            return res.json({
                data: [],
                sources: [],
                subtitles: [],
                error: 'server_error',
                message: 'Gagal mengambil video anime'
            });
        }
    }

    return res.status(404).json({ error: 'Unknown anime action' });
}

// Komik handlers
async function handleKomik(action: string, req: VercelRequest, res: VercelResponse) {
    const config = { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } };

    if (action === 'recommended' || action === 'popular') {
        try {
            const response = await axios.get(`${KOMIK_API}/popular`, {
                ...config,
                params: { provider: KOMIK_PROVIDER }
            });
            return res.json(response.data?.data || []);
        } catch (error: any) {
            console.error('[Komik Popular Error]:', error.message);
            return res.status(500).json({ error: 'Failed to fetch popular komik' });
        }
    }

    if (action === 'search') {
        try {
            const q = req.query.q || req.query.query || req.query.keyword;
            if (!q) return res.status(400).json({ error: 'Query required' });
            const response = await axios.get(`${KOMIK_API}/search`, {
                ...config,
                params: { keyword: q, provider: KOMIK_PROVIDER }
            });
            return res.json(response.data?.data || []);
        } catch (error: any) {
            console.error('[Komik Search Error]:', error.message);
            return res.status(500).json({ error: 'Failed to search komik' });
        }
    }

    if (action === 'detail') {
        try {
            const mangaId = req.query.manga_id || req.query.mangaId || req.query.id;
            if (!mangaId) return res.status(400).json({ error: 'manga_id required' });
            
            const response = await axios.get(`${KOMIK_API}/detail/${mangaId}`, {
                ...config,
                params: { provider: KOMIK_PROVIDER }
            });
            
            const raw = response.data?.data;
            if (!raw) {
                return res.status(404).json({ error: 'Komik not found' });
            }
            
            // Map to detail format like server.ts
            const detail = {
                title: raw.title,
                judul: raw.title,
                description: raw.description,
                synopsis: raw.description,
                status: raw.status,
                author: raw.author,
                rating: raw.rating,
                cover: raw.thumbnail,
                thumbnail: raw.thumbnail,
                genres: (raw.genre || []).map((g: any) => typeof g === 'string' ? g : g.title)
            };
            
            return res.json({ success: true, data: detail });
        } catch (error: any) {
            console.error('[Komik Detail Error]:', error.message);
            return res.status(500).json({ error: 'Failed to fetch komik detail' });
        }
    }

    if (action === 'chapterlist') {
        try {
            const mangaId = req.query.manga_id || req.query.mangaId || req.query.id;
            if (!mangaId) return res.status(400).json({ error: 'manga_id required' });
            
            const response = await axios.get(`${KOMIK_API}/detail/${mangaId}`, {
                ...config,
                params: { provider: KOMIK_PROVIDER }
            });
            
            const chapters = (response.data?.data?.chapter || []).map((ch: any) => ({
                chapter_id: ch.href?.split('/').pop() || ch.id,
                title: ch.title,
                chapter_number: ch.number || ch.title,
                date: ch.date
            }));
            
            return res.json({ success: true, chapters });
        } catch (error: any) {
            console.error('[Komik Chapterlist Error]:', error.message);
            return res.json({ success: false, chapters: [] });
        }
    }

    if (action === 'getimage') {
        try {
            const chapterId = req.query.chapter_id || req.query.chapterId || req.query.id;
            if (!chapterId) return res.status(400).json({ error: 'chapter_id required' });
            
            // Try /read/ endpoint first (like server.ts), then /chapter/
            let response;
            try {
                response = await axios.get(`${KOMIK_API}/read/${chapterId}`, {
                    ...config,
                    params: { provider: KOMIK_PROVIDER }
                });
            } catch {
                response = await axios.get(`${KOMIK_API}/chapter/${chapterId}`, {
                    ...config,
                    params: { provider: KOMIK_PROVIDER }
                });
            }
            
            // Handle different response formats
            const panels = response.data?.data?.[0]?.panel || response.data?.data || [];
            return res.json({ success: true, images: panels });
        } catch (error: any) {
            console.error('[Komik Getimage Error]:', error.message);
            return res.status(500).json({ error: 'Failed to fetch chapter images' });
        }
    }

    return res.status(404).json({ error: 'Unknown komik action' });
}

// Proxy handler
async function handleProxy(action: string, req: VercelRequest, res: VercelResponse) {
    if (action === 'image') {
        const { url } = req.query;
        if (!url || typeof url !== 'string') {
            return res.status(400).json({ error: 'URL required' });
        }

        try {
            // Determine referer based on URL
            let referer = '';
            try {
                referer = new URL(url).origin;
            } catch {
                referer = 'https://shinigami.id';
            }
            
            // Special handling for shinigami/shngm images
            if (url.includes('shngm.id') || url.includes('shinigami')) {
                referer = 'https://shinigami.id';
            }
            
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': referer,
                    'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
                }
            });

            const contentType = response.headers['content-type'] || 'image/jpeg';
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.setHeader('Access-Control-Allow-Origin', '*');
            return res.send(Buffer.from(response.data));
        } catch (error: any) {
            console.error('[Image Proxy Error]:', error.message, 'URL:', url);
            return res.status(404).json({ error: 'Image not found' });
        }
    }

    if (action === 'video') {
        const { url } = req.query;
        if (!url || typeof url !== 'string') {
            return res.status(400).json({ error: 'URL required' });
        }

        // Determine referer based on URL pattern
        let referer = 'https://www.dramabox.com';
        let origin = 'https://www.dramabox.com';
        
        if (url.includes('dramabox')) {
            referer = 'https://www.dramabox.com';
            origin = 'https://www.dramabox.com';
        } else if (url.includes('/_v7/') || url.includes('megacloud') || url.includes('rapid-cloud')) {
            referer = 'https://megacloud.tv';
            origin = 'https://megacloud.tv';
        } else {
            try {
                referer = new URL(url).origin;
                origin = referer;
            } catch {}
        }

        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 30000,
                maxContentLength: 100 * 1024 * 1024, // 100MB max
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': referer,
                    'Origin': origin,
                    'Accept': '*/*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Range': req.headers.range || 'bytes=0-'
                }
            });

            const contentType = response.headers['content-type'] || 'video/mp4';
            res.setHeader('Content-Type', contentType);
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            if (response.headers['content-length']) {
                res.setHeader('Content-Length', response.headers['content-length']);
            }
            if (response.headers['accept-ranges']) {
                res.setHeader('Accept-Ranges', response.headers['accept-ranges']);
            }
            return res.send(Buffer.from(response.data));
        } catch (error: any) {
            console.error('[Video Proxy Error]:', error.message);
            return res.status(404).json({ error: 'Video not found', details: error.message });
        }
    }

    return res.status(404).json({ error: 'Unknown proxy action' });
}
