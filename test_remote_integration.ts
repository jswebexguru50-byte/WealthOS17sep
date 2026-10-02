import assert from 'assert';
import express from 'express';
import { aiStudioProxyRouter } from './src/server/routes/aiStudioProxyRouter.js';
import { WealthOSApiClient } from './src/lib/apiClient.js';
import fetch from 'node-fetch';

const app = express();
app.use(express.json());

process.env.APP_PASSWORD = 'supersecret_test';
process.env.WEALTHOS_REMOTE_KEY = 'test_remote_key';
app.use('/api/ai-studio-proxy', (req, res, next) => {
    if (process.env.APP_PASSWORD && req.headers['x-app-password'] !== process.env.APP_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized local session' });
    }
    next();
}, aiStudioProxyRouter);

const server = app.listen(0, async () => {
    const port = server.address().port;
    process.env.VITE_WEALTHOS_REMOTE_URL = `http://127.0.0.1:${port}/mock-remote`;
    process.env.VITE_WEALTHOS_REMOTE_MODE = 'true';

    app.get('/mock-remote/company/:symbol/intelligence', (req, res) => {
        res.status(200).json({ success: true, data: { symbol: req.params.symbol, test: 'intelligence' } });
    });
    
    app.get('/mock-remote/company/:symbol/technical', (req, res) => {
        
        res.status(200).json({ success: true, data: { queried: req.params.symbol } });
    });

    global.window = {
        fetch: (...args) => {
            global.window.fetchCalls = (global.window.fetchCalls || 0) + 1;
            if (global.window.fetchCalls > 2) throw new Error("RECURSION DETECTED");
            return fetch(...args);
        },
        WEALTHOS_REMOTE_MODE: true
    };
    global.window.fetch.__isPatched = true;
    global.window.__originalFetch = (...args) => {
        return fetch(...args);
    };

    const baseUrl = `http://127.0.0.1:${port}`;
    
    try {
        global.sessionStorage = { getItem: () => null };
        global.localStorage = { getItem: () => null };
        
        const origGetBaseUrl = WealthOSApiClient.getBaseUrl;
        WealthOSApiClient.getBaseUrl = () => baseUrl + '/api/ai-studio-proxy';
        
        const res1 = await WealthOSApiClient.request('/api/scrip-dossier/TCS');
        assert.strictEqual(res1.status, 401, 'Expected 401 for missing password');

        global.sessionStorage = { getItem: (k) => k === 'app-password' ? 'supersecret_test' : null };
        const res2 = await WealthOSApiClient.request('/api/scrip-dossier/TCS');
        if(res2.status !== 200) console.log(await res2.text()); assert.strictEqual(res2.status, 200, 'Expected 200 for valid password');
        const data2 = await res2.json();
        assert.strictEqual(data2.data.symbol, 'TCS', 'Expected mapped TCS response');
        
        const res4 = await WealthOSApiClient.request('/api/technical-momentum?symbol=RELIANCE');
        assert.strictEqual(res4.status, 200, 'Expected 200 for technical query');
        const data4 = await res4.json();
        assert.strictEqual(data4.data.queried, 'RELIANCE', 'Query parameter did not survive the proxy');

        const res5 = await WealthOSApiClient.request('/api/dashboard/stats');
        assert.strictEqual(res5.status, 501, 'Expected 501 for unsupported route');

        console.log('? All integration tests passed.');
        process.exit(0);
    } catch (e) {
        console.error('? Integration test failed:', e);
        process.exit(1);
    }
});




