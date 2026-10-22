import { Router } from 'express';
import fetch from 'node-fetch';
import { env } from 'process';

export const aiStudioProxyRouter = Router();


aiStudioProxyRouter.use(async (req, res) => {
    try {
        const REMOTE_KEY = env.WEALTHOS_REMOTE_KEY || '';
        
        if (req.method !== 'GET') {
            return res.status(405).json({ error: 'Method Not Allowed - Remote Bridge is Read-Only' });
        }

        const isAllowed = 
            /^\/company\/[^\/]+$/.test(req.path) ||
            /^\/company\/[^\/]+\/intelligence$/.test(req.path) ||
            /^\/company\/[^\/]+\/fundamentals$/.test(req.path) ||
            /^\/company\/[^\/]+\/technical$/.test(req.path) ||
            /^\/portfolio$/.test(req.path) ||
            /^\/portfolio\/[^\/]+$/.test(req.path);

        if (!isAllowed) {
            return res.status(403).json({ error: 'Forbidden - Route not allowlisted for Remote Bridge' });
        }

        const REMOTE_URL = env.VITE_WEALTHOS_REMOTE_URL || 'https://api.wealthos.win/api/remote';
        const targetUrl = `${REMOTE_URL}${req.url}`;
        console.log(`[AI Studio Proxy] Forwarding ${req.method} ${req.url} -> ${targetUrl}`);
        
        if (!REMOTE_KEY) {
            console.error('[AI Studio Proxy] WEALTHOS_REMOTE_KEY is not set on the server.');
            return res.status(500).json({ error: 'Server misconfiguration: missing remote key' });
        }

        const headers: Record<string, string> = {
            'Authorization': `Bearer ${REMOTE_KEY}`,
            'Content-Type': req.header('Content-Type') || 'application/json',
            'Accept': req.header('Accept') || 'application/json',
        };

        const response = await fetch(targetUrl, { method: 'GET', headers });
        
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            return res.status(response.status).json(data);
        } else {
            const text = await response.text();
            return res.status(response.status).send(text);
        }
    } catch (error: any) {
        console.error('[AI Studio Proxy] Error:', error.message);
        return res.status(500).json({ error: 'AI Studio Proxy Error', details: 'An internal error occurred during remote proxying' });
    }
});



