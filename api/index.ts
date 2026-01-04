import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

// API endpoints
const API_BASE = 'https://api.sansekai.my.id/api';
const ANIME_API = 'https://www.sankavollerei.com/anime/samehadaku';
const KOMIK_API = 'https://api-manga-five.vercel.app';
const KOMIK_PROVIDER = 'shinigami';

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
        if (pathStr.startsWith('dramabox/')) {
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
            
            const items = (response.data?.data || []).map((item: any) => ({
                id: item.animeId,
                urlId: item.animeId,
                judul: item.title,
                title: item.title,
                image: item.poster,
                thumbnail_url: item.poster,
                episode: item.tvInfo?.sub || item.tvInfo?.eps || '?',
                rating: item.rating || '?',
                type: item.type || 'TV'
            }));
            
            return res.json(items);
        } catch (error: any) {
            console.error(`[Anime ${action} Error]:`, error.message);
            return res.status(500).json({ error: `Failed to fetch ${action} anime` });
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
            
            const items = (response.data?.data || []).map((item: any) => ({
                id: item.animeId,
                urlId: item.animeId,
                judul: item.title,
                title: item.title,
                image: item.poster,
                thumbnail_url: item.poster,
                episode: item.tvInfo?.sub || '?',
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
            
            const items = (response.data?.data || []).map((item: any) => ({
                id: item.animeId,
                urlId: item.animeId,
                judul: item.title,
                title: item.title,
                image: item.poster,
                thumbnail_url: item.poster,
                episode: item.tvInfo?.sub || '?',
                rating: item.rating || '?',
                type: item.type || 'TV'
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
