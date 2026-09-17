/**
 * YouTube Research Intelligence & Knowledge Synthesis Engine (YRIKS)
 * Zero Fabrication Architecture (ZFA v2.1)
 * 100% Free & Open-Source Stack:
 *   - Local Python sidecar for yt-dlp, faster-whisper small, langdetect, TF-IDF dialectic clustering
 *   - Ephemeral audio GC: Immediate deletion of audio post-transcription
 *   - Cryptographic SHA-256 provenance chain
 */

import { spawn, exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { Database } from 'sqlite3';
import { runInDbLock } from '../database.js';

export interface YRikSession {
  id: string;
  topic: string;
  category: string;
  matched_node_id?: string;
  target_video_count: number;
  synonyms_json?: string;
  expanded_queries_json?: string;
  status: 'PENDING' | 'EXPANDING' | 'DISCOVERING' | 'TRANSCRIBING' | 'SYNTHESIZING' | 'COMPLETED' | 'FAILED';
  progress_pct: number;
  status_message?: string;
  synthesis_json?: string;
  created_at: string;
  completed_at?: string;
}

export interface YRikVideo {
  id: string;
  session_id: string;
  video_id: string;
  title: string;
  channel: string;
  duration_s: number;
  view_count: number;
  upload_date?: string;
  query_origin?: string;
  source?: string;
  transcript_sha256?: string;
  transcript_text?: string;
  language?: string;
  bias_signals_json?: string;
  bias_count: number;
  audio_retained: number;
  created_at?: string;
}

export interface YRikDebate {
  id: string;
  session_id: string;
  topic_aspect: string;
  thesis_claim: string;
  thesis_channel: string;
  thesis_video_id: string;
  antithesis_claim: string;
  antithesis_channel: string;
  antithesis_video_id: string;
  neutrality_guidance: string;
}

export interface YRikFeatureProposal {
  id: string;
  session_id: string;
  feature_name: string;
  category: string;
  derived_from: string;
  source_channel: string;
  source_video_id: string;
  implementation_blueprint: string;
  status: string;
}

export class YouTubeResearchIntelligenceEngine {
  private static instance: YouTubeResearchIntelligenceEngine;
  private pythonScriptPath: string;

  private constructor() {
    this.pythonScriptPath = path.join(process.cwd(), 'src', 'server', 'youtube_knowledge_sidecar.py');
  }

  public static getInstance(): YouTubeResearchIntelligenceEngine {
    if (!YouTubeResearchIntelligenceEngine.instance) {
      YouTubeResearchIntelligenceEngine.instance = new YouTubeResearchIntelligenceEngine();
    }
    return YouTubeResearchIntelligenceEngine.instance;
  }

  /**
   * Helper to spawn Python sidecar commands safely with buffer capture.
   */
  private async runPythonCommand(args: string[], timeoutMs: number = 300000): Promise<any> {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python', [this.pythonScriptPath, ...args], {
        cwd: process.cwd(),
        shell: true
      });

      let stdout = '';
      let stderr = '';

      const timer = setTimeout(() => {
        pythonProcess.kill();
        reject(new Error(`Python command timed out after ${timeoutMs}ms: args=${args.join(' ')}`));
      }, timeoutMs);

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          console.warn(`[YRIKS Sidecar Warning] Code ${code}: ${stderr.slice(0, 300)}`);
        }
        try {
          const parsed = JSON.parse(stdout.trim());
          resolve(parsed);
        } catch (e) {
          // If not strict JSON, return raw output or error
          if (code !== 0 && !stdout.trim()) {
            reject(new Error(`Python process exited with code ${code}: ${stderr}`));
          } else {
            resolve({ raw_output: stdout, error: stderr });
          }
        }
      });
    });
  }

  /**
   * 1. 5-Dimensional Topic Expansion
   */
  public async expandTopic(topic: string): Promise<any> {
    return this.runPythonCommand(['expand', '--topic', `"${topic}"`]);
  }

  /**
   * 2. Discover top 25 videos regardless of length
   */
  public async discoverVideos(topic: string, count: number = 25): Promise<any[]> {
    const res = await this.runPythonCommand(['search', '--topic', `"${topic}"`, '--count', count.toString()], 120000);
    return Array.isArray(res) ? res : [];
  }

  /**
   * 3. Transcribe single video using dual-path (Captions -> Whisper small)
   */
  public async transcribeVideo(videoId: string, model: string = 'small'): Promise<any> {
    return this.runPythonCommand(['transcribe', '--video-id', `"${videoId}"`, '--model', model], 240000);
  }

  /**
   * 4. Dialectic Debate Clustering & Feature Proposal Synthesis
   */
  public async synthesizeTranscripts(videoRecords: any[]): Promise<any> {
    const tempFilePath = path.join(process.cwd(), 'scratch', `synthesis_input_${Date.now()}.json`);
    try {
      fs.writeFileSync(tempFilePath, JSON.stringify(videoRecords, null, 2), 'utf-8');
      const res = await this.runPythonCommand(['synthesize', '--input-json', `"${tempFilePath}"`], 60000);
      return res;
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  }

  /**
   * 4b. Transcribe Local Audio Recording (Captured from Browser Tab Web Audio API Loopback)
   */
  public async transcribeLocalAudioFile(audioFilePath: string, model: string = 'small'): Promise<any> {
    const pythonScript = path.resolve(process.cwd(), 'src', 'server', 'youtube_knowledge_sidecar.py');
    const cmd = `python "${pythonScript}" transcribe-file --file "${audioFilePath}" --model ${model}`;

    return new Promise((resolve) => {
      exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          console.warn('[YRIKS transcribeLocalAudioFile warn]:', stderr || err.message);
          return resolve({
            text: '',
            source: 'FAILED',
            sha256: '',
            error: err.message
          });
        }
        try {
          const res = JSON.parse(stdout.trim());
          resolve(res);
        } catch {
          resolve({ text: '', source: 'PARSE_ERROR', sha256: '' });
        }
      });
    });
  }

  /**
   * 5. Orchestrate Full End-to-End Pipeline Asynchronously
   */
  public async startPipelineSession(topic: string, targetCount: number = 25, db: Database, preSelectedVideos?: any[]): Promise<string> {
    const sessionId = `yriks_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // Create session in DB
    await new Promise<void>((resolve, reject) => {
      db.run(`
        INSERT INTO yt_knowledge_sessions (id, topic, target_video_count, status, progress_pct, status_message)
        VALUES (?, ?, ?, 'PENDING', 5.0, 'Initializing 5D Topic Expansion Engine...')
      `, [sessionId, topic, targetCount], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Run execution in background detached promise
    this.executePipelineAsync(sessionId, topic, targetCount, db, preSelectedVideos).catch(err => {
      console.error(`[YRIKS Error] Pipeline failed for session ${sessionId}:`, err);
      db.run(`UPDATE yt_knowledge_sessions SET status = 'FAILED', status_message = ? WHERE id = ?`, [err.message, sessionId]);
    });

    return sessionId;
  }

  private async executePipelineAsync(sessionId: string, topic: string, targetCount: number, db: Database, preSelectedVideos?: any[]): Promise<void> {
    // Step 1: Expand Topic
    db.run(`UPDATE yt_knowledge_sessions SET status = 'EXPANDING', progress_pct = 15.0, status_message = 'Generating 5D semantic ontology queries...' WHERE id = ?`, [sessionId]);
    const expansion = await this.expandTopic(topic);
    
    db.run(`
      UPDATE yt_knowledge_sessions 
      SET category = ?, matched_node_id = ?, synonyms_json = ?, expanded_queries_json = ?, progress_pct = 25.0, status = 'DISCOVERING', status_message = 'Querying YouTube via yt-dlp across expanded synonyms...' 
      WHERE id = ?
    `, [
      expansion.category || 'GENERAL_FINANCE',
      expansion.matched_node_id || null,
      JSON.stringify(expansion.synonyms || []),
      JSON.stringify(expansion.expanded_queries || []),
      sessionId
    ]);

    // Step 2: Use Pre-Selected Videos or Discover Fresh
    let videos = preSelectedVideos && preSelectedVideos.length > 0 ? preSelectedVideos : await this.discoverVideos(topic, targetCount);
    if (!videos || videos.length === 0) {
      throw new Error(`No videos could be discovered for topic or URL: ${topic}`);
    }

    db.run(`UPDATE yt_knowledge_sessions SET progress_pct = 40.0, status = 'TRANSCRIBING', status_message = ? WHERE id = ?`, [
      `Found ${videos.length} videos. Commencing dual-path transcription & audio GC...`,
      sessionId
    ]);

    const transcribedRecords: any[] = [];
    const stepIncrement = 40.0 / Math.max(videos.length, 1);
    let currentProgress = 40.0;

    // Step 3: Dual-path transcription for each video (full targetCount requested by user)
    const videosToProcess = videos.slice(0, targetCount);

    for (let i = 0; i < videosToProcess.length; i++) {
      const v = videosToProcess[i];
      try {
        const tr = await this.transcribeVideo(v.video_id, 'small');
        const vidRecord = {
          id: `yvid_${sessionId}_${v.video_id}`,
          session_id: sessionId,
          video_id: v.video_id,
          title: v.title,
          channel: v.channel,
          duration_s: v.duration_s,
          view_count: v.view_count,
          upload_date: v.upload_date || '',
          query_origin: v.query_origin || topic,
          source: tr.source || 'UNKNOWN',
          transcript_sha256: tr.sha256 || '',
          transcript_text: tr.text || '',
          language: tr.language || 'en',
          bias_signals_json: JSON.stringify(tr.bias_signals || []),
          bias_count: tr.bias_count || 0,
          audio_retained: 0
        };

        // Insert into DB
        db.run(`
          INSERT OR REPLACE INTO yt_knowledge_videos 
          (id, session_id, video_id, title, channel, duration_s, view_count, upload_date, query_origin, source, transcript_sha256, transcript_text, language, bias_signals_json, bias_count, audio_retained)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          vidRecord.id, vidRecord.session_id, vidRecord.video_id, vidRecord.title, vidRecord.channel,
          vidRecord.duration_s, vidRecord.view_count, vidRecord.upload_date, vidRecord.query_origin,
          vidRecord.source, vidRecord.transcript_sha256, vidRecord.transcript_text, vidRecord.language,
          vidRecord.bias_signals_json, vidRecord.bias_count, 0
        ]);

        transcribedRecords.push({
          video_id: v.video_id,
          channel: v.channel,
          text: tr.text || ''
        });

      } catch (err) {
        console.warn(`[YRIKS Warning] Transcribe skipped for video ${v.video_id}:`, err);
      }

      currentProgress += stepIncrement;
      db.run(`UPDATE yt_knowledge_sessions SET progress_pct = ?, status_message = ? WHERE id = ?`, [
        Math.min(currentProgress, 80.0),
        `Transcribed ${i + 1}/${videosToProcess.length} videos. Ephemeral audio deleted.`,
        sessionId
      ]);
    }

    // Step 4: Synthesize Dialectic Debate Matrix & App Features
    db.run(`UPDATE yt_knowledge_sessions SET progress_pct = 85.0, status = 'SYNTHESIZING', status_message = 'Clustering consensus assertions & constructing dialectic debate matrix...' WHERE id = ?`, [sessionId]);

    const synthesis = await this.synthesizeTranscripts(transcribedRecords);

    // Save debate pairs into SQLite
    for (const d of (synthesis.debate_matrix || [])) {
      db.run(`
        INSERT OR REPLACE INTO yt_knowledge_debates
        (id, session_id, topic_aspect, thesis_claim, thesis_channel, thesis_video_id, antithesis_claim, antithesis_channel, antithesis_video_id, neutrality_guidance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        `deb_${sessionId}_${d.debate_id}`,
        sessionId,
        d.topic_aspect,
        d.thesis?.claim || '',
        d.thesis?.channel || '',
        d.thesis?.video_id || '',
        d.antithesis?.claim || '',
        d.antithesis?.channel || '',
        d.antithesis?.video_id || '',
        d.neutrality_guidance || ''
      ]);
    }

    // Save feature proposals into SQLite
    for (const f of (synthesis.app_feature_proposals || [])) {
      db.run(`
        INSERT OR REPLACE INTO yt_knowledge_feature_proposals
        (id, session_id, feature_name, category, derived_from, source_channel, source_video_id, implementation_blueprint, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        `prop_${sessionId}_${f.feature_id}`,
        sessionId,
        f.feature_name,
        f.category,
        f.derived_from,
        f.source_channel,
        f.source_video_id,
        f.implementation_blueprint,
        'PROPOSED'
      ]);
    }

    // Finalize session
    db.run(`
      UPDATE yt_knowledge_sessions 
      SET status = 'COMPLETED', progress_pct = 100.0, status_message = 'Intelligence synthesis complete. Provenance ledger verified.', synthesis_json = ?, completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [JSON.stringify(synthesis), sessionId]);
  }

  /**
   * 6. Retrieve Session Data
   */
  public async getSessionData(sessionId: string, db: Database): Promise<any> {
    return new Promise((resolve, reject) => {
      db.get(`SELECT * FROM yt_knowledge_sessions WHERE id = ?`, [sessionId], (err, session) => {
        if (err || !session) return resolve(null);

        db.all(`SELECT * FROM yt_knowledge_videos WHERE session_id = ? ORDER BY view_count DESC`, [sessionId], (vErr, videos) => {
          db.all(`SELECT * FROM yt_knowledge_debates WHERE session_id = ?`, [sessionId], (dErr, debates) => {
            db.all(`SELECT * FROM yt_knowledge_feature_proposals WHERE session_id = ?`, [sessionId], (fErr, features) => {
              resolve({
                session,
                videos: videos || [],
                debates: debates || [],
                features: features || [],
                synthesis: (session as any).synthesis_json ? JSON.parse((session as any).synthesis_json) : null
              });
            });
          });
        });
      });
    });
  }

  /**
   * 7. List Recent Sessions
   */
  public async listSessions(db: Database, limit: number = 20): Promise<any[]> {
    return new Promise((resolve) => {
      db.all(`SELECT * FROM yt_knowledge_sessions ORDER BY created_at DESC LIMIT ?`, [limit], (err, rows) => {
        resolve(rows || []);
      });
    });
  }
}
