import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { aiStudioProxyRouter } from '../../src/server/routes/aiStudioProxyRouter.js';
import { WealthOSApiClient } from '../../src/lib/apiClient.js';

const app = express();
app.use('/api/ai-studio-proxy', (req, res, next) => {
    if (process.env.APP_PASSWORD && req.headers['x-app-password'] !== process.env.APP_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized local session' });
    }
    next();
}, aiStudioProxyRouter);

describe('AI Studio Proxy Integration', () => {
    beforeAll(() => {
        process.env.WEALTHOS_REMOTE_KEY = 'test_key';
        process.env.APP_PASSWORD = 'supersecret';
    });
    afterAll(() => {
        delete process.env.WEALTHOS_REMOTE_KEY;
        delete process.env.APP_PASSWORD;
    });

    it('rejects unauthenticated local session', async () => {
        const res = await request(app).get('/api/ai-studio-proxy/company/TCS/intelligence');
        expect(res.status).toBe(401);
    });

    it('rejects non-allowlisted routes', async () => {
        const res = await request(app)
            .get('/api/ai-studio-proxy/company/TCS/secret')
            .set('x-app-password', 'supersecret');
        expect(res.status).toBe(403);
    });

    it('accepts allowlisted routes with proper auth', async () => {
        // Just checking it hits the proxy (might 500 because it actually fetches, but shouldn't be 401/403/404)
        // Since remote url might be unreachable in tests, we'll intercept fetch if we can, or just expect it passes our guards.
        const res = await request(app)
            .get('/api/ai-studio-proxy/company/TCS/intelligence')
            .set('x-app-password', 'supersecret');
        // It should NOT be 403 from OUR allowlist. It might be 500 if fetch fails, or whatever the remote returns.
        // As long as it is not our allowlist 403 error.
        expect(res.body.error).not.toBe('Forbidden - Route not allowlisted for Remote Bridge');
        expect(res.status).not.toBe(401);
    });
});

describe('WealthOSApiClient Mapping', () => {
    beforeAll(() => {
        process.env.VITE_WEALTHOS_REMOTE_MODE = 'true';
    });
    
    it('maps scrip-dossier to remote intelligence', () => {
        const url = WealthOSApiClient.getBaseUrl();
        expect(url).toBe('/api/ai-studio-proxy');
        
        // This is a unit test of the path mapping without actually fetching
        // We'll mock the fetch
        const origFetch = global.fetch;
        let requestedUrl = '';
        global.fetch = vi.fn().mockImplementation((url) => {
            requestedUrl = url;
            return Promise.resolve({
                status: 200,
                json: () => Promise.resolve({ data: 'ok' })
            });
        });

        return WealthOSApiClient.request('/api/scrip-dossier/TCS').then(() => {
            expect(requestedUrl).toContain('/company/TCS/intelligence');
            global.fetch = origFetch;
        });
    });

    it('maps v2 company intelligence to remote intelligence', () => {
        const origFetch = global.fetch;
        let requestedUrl = '';
        global.fetch = vi.fn().mockImplementation((url) => {
            requestedUrl = url;
            return Promise.resolve({
                status: 200,
                json: () => Promise.resolve({ data: 'ok' })
            });
        });

        return WealthOSApiClient.request('/api/v2/company-intelligence/INFY').then(() => {
            expect(requestedUrl).toContain('/company/INFY/intelligence');
            global.fetch = origFetch;
        });
    });
});
