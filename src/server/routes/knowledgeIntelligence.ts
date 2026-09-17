/**
 * YouTube Research Intelligence & Knowledge Synthesis Pipeline (YRIKS) Router
 * Endpoints for 5D topic expansion, video discovery, dual-path transcription,
 * dialectic debate matrix, and app feature proposal synthesis.
 */

import { Router } from 'express';
import { YouTubeResearchIntelligenceEngine } from '../services/YouTubeResearchIntelligenceEngine.js';
import { UniversalKnowledgeCompiler } from '../services/UniversalKnowledgeCompiler.js';
import { getDB } from '../database.js';

const router = Router();
const engine = YouTubeResearchIntelligenceEngine.getInstance();
const compiler = UniversalKnowledgeCompiler.getInstance();

// 1. Topic Expansion Preview (5D Framework)
router.get('/expand', async (req, res) => {
  try {
    const topic = req.query.topic as string;
    if (!topic) {
      return res.status(400).json({ success: false, error: 'Topic query param is required' });
    }
    const expansion = await engine.expandTopic(topic);
    res.json({ success: true, data: expansion });
  } catch (err: any) {
    console.error('[YRIKS Route Error /expand]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Discover Top 25 Videos Preview
router.get('/search', async (req, res) => {
  try {
    const topic = req.query.topic as string;
    const count = parseInt(req.query.count as string, 10) || 25;
    if (!topic) {
      return res.status(400).json({ success: false, error: 'Topic query param is required' });
    }
    const videos = await engine.discoverVideos(topic, count);
    res.json({ success: true, count: videos.length, data: videos });
  } catch (err: any) {
    console.error('[YRIKS Route Error /search]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Launch Full Pipeline Session Asynchronously
router.post('/session', async (req, res) => {
  try {
    const { topic, targetCount, selectedVideos } = req.body;
    if (!topic) {
      return res.status(400).json({ success: false, error: 'Topic is required in request body' });
    }
    const count = parseInt(targetCount, 10) || 25;
    const db = getDB();
    const sessionId = await engine.startPipelineSession(topic, count, db, selectedVideos);
    res.json({
      success: true,
      message: 'Intelligence synthesis pipeline initialized successfully',
      sessionId
    });
  } catch (err: any) {
    console.error('[YRIKS Route Error /session POST]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Get Session Status and Synthesized Results
router.get('/session/:id', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const db = getDB();
    const data = await engine.getSessionData(sessionId, db);
    if (!data) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    res.json({ success: true, data });
  } catch (err: any) {
    console.error('[YRIKS Route Error /session/:id GET]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. List Recent Intelligence Sessions
router.get('/sessions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const db = getDB();
    const sessions = await engine.listSessions(db, limit);
    res.json({ success: true, count: sessions.length, data: sessions });
  } catch (err: any) {
    console.error('[YRIKS Route Error /sessions GET]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Google NotebookLM Source Dossier Export
router.get('/export/notebooklm/:id', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const db = getDB();
    const dossier = await compiler.generateNotebookLMDossier(db, sessionId);
    
    // Support ?download=true for direct .md file attachment
    if (req.query.download === 'true') {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="NotebookLM_Source_${sessionId}.md"`);
      return res.send(dossier.markdown);
    }

    res.json({
      success: true,
      sessionId,
      wordCount: dossier.wordCount,
      sourceCount: dossier.sourceCount,
      markdown: dossier.markdown,
      mindmapMermaid: dossier.mindmapMermaid
    });
  } catch (err: any) {
    console.error('[YRIKS Route Error /export/notebooklm/:id GET]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Live Browser Tab Audio Stream Transcription (Bypasses all DRM, Blobs, Login-Walls)
router.post('/transcribe-live-audio', async (req, res) => {
  try {
    const { audioBase64, title, channel, durationSeconds, sessionId } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ success: false, error: 'audioBase64 payload is required' });
    }

    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');

    const buffer = Buffer.from(audioBase64, 'base64');
    const tempFile = path.join(os.tmpdir(), `tab_loopback_${Date.now()}.webm`);
    fs.writeFileSync(tempFile, buffer);

    try {
      const result = await engine.transcribeLocalAudioFile(tempFile, 'small');
      
      // If an active session exists, persist this captured record
      if (sessionId) {
        const db = getDB();
        const vidId = `tab_${Date.now()}`;
        db.run(`
          INSERT INTO yt_knowledge_videos
          (id, session_id, video_id, title, channel, duration_s, view_count, upload_date, query_origin, source, transcript_sha256, transcript_text, language, bias_signals_json, bias_count, audio_retained)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          `yvid_${sessionId}_${vidId}`,
          sessionId,
          vidId,
          title || 'Live Browser Tab Capture',
          channel || 'Browser Tab Loopback',
          durationSeconds || 60,
          1,
          new Date().toISOString(),
          'BROWSER_TAB_LOOPBACK',
          'BROWSER_TAB_CAPTURE',
          result.sha256 || '',
          result.text || '',
          result.detected_language || 'en',
          JSON.stringify(result.bias_signals || []),
          result.bias_signals?.length || 0,
          0
        ]);
      }

      res.json({
        success: true,
        source: 'BROWSER_TAB_CAPTURE',
        text: result.text,
        segments: result.segments,
        sha256: result.sha256,
        audio_deleted: true
      });
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  } catch (err: any) {
    console.error('[YRIKS Route Error /transcribe-live-audio POST]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
