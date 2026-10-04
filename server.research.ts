// Lightweight WealthOS research server.
//
// Purpose:
// - Keep Discover / Analyze360 / scrip search responsive during stock-research
//   sessions.
// - Avoid loading the full portfolio, PMS, tax, import, dashboard, and scheduler
//   stack in server.ts.
// - Do not start background jobs or mutate data at startup.

import { config as loadEnv } from 'dotenv';
loadEnv();

import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import express from 'express';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

import infraRouter from './src/server/routes/infra.js';
import { strategiesRouter } from './src/server/routes/strategies.js';
import { dossierRouter } from './src/server/routes/dossierRoutes.js';

const app = express();
const port = Number(process.env.PORT || 3000);

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-app-password, x-requested-with');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/api/remote/health', (_req, res) => {
  res.json({ ok: true, mode: 'research' });
});

// Research / stock-selection APIs only.
app.use('/api', infraRouter);
app.use('/api/strategies', strategiesRouter);
app.use('/api/dossier-runs', dossierRouter);

async function mountFrontend() {
  const rootDir = process.cwd();
  if (process.env.NODE_ENV === 'development' && fs.existsSync(path.join(rootDir, 'vite.config.ts'))) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom'
    });
    app.use(vite.middlewares);
    app.get('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api/')) return next();
      try {
        const indexPath = path.join(rootDir, 'index.html');
        let template = await fs.promises.readFile(indexPath, 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
    return;
  }

  const distPath = fs.existsSync(path.join(rootDir, 'dist', 'index.html'))
    ? path.join(rootDir, 'dist')
    : rootDir;
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.originalUrl.startsWith('/api/')) return next();
    const indexPath = fs.existsSync(path.join(distPath, 'index.html'))
      ? path.join(distPath, 'index.html')
      : path.join(rootDir, 'index.html');
    res.sendFile(indexPath);
  });
}

await mountFrontend();

app.listen(port, () => {
  console.log(`✅ WealthOS research server READY at http://localhost:${port}`);
  console.log('   Mounted APIs: /api/scrips/search, /api/analyze360/*, /api/strategies/*');
  console.log('   Background schedulers/startup jobs: disabled');
});

export { app };
