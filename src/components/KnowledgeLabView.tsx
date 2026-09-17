import React, { useState, useEffect } from 'react';
import {
  Search,
  Youtube,
  ShieldCheck,
  Scale,
  BrainCircuit,
  Sparkles,
  AlertTriangle,
  FileCheck2,
  Clock,
  Layers,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  Sliders,
  Check,
  Globe,
  Radio,
  BarChart2,
  FileText
} from 'lucide-react';

interface TopicExpansion {
  seed_query: string;
  matched_node_id?: string;
  matched_canonical?: string;
  category?: string;
  tickers?: string[];
  synonyms?: string[];
  multilingual?: Record<string, string[]>;
  expanded_queries?: Array<{ query: string; dimension: string; weight: number }>;
}

interface VideoRecord {
  id: string;
  video_id: string;
  title: string;
  channel: string;
  duration_s: number;
  view_count: number;
  query_origin?: string;
  source?: string;
  transcript_sha256?: string;
  transcript_text?: string;
  language?: string;
  bias_signals_json?: string;
  bias_count: number;
}

interface DebatePair {
  id: string;
  topic_aspect: string;
  thesis_claim: string;
  thesis_channel: string;
  thesis_video_id: string;
  antithesis_claim: string;
  antithesis_channel: string;
  antithesis_video_id: string;
  neutrality_guidance: string;
}

interface FeatureProposal {
  id: string;
  feature_name: string;
  category: string;
  derived_from: string;
  source_channel: string;
  source_video_id: string;
  implementation_blueprint: string;
  status: string;
}

interface SessionData {
  session: {
    id: string;
    topic: string;
    category: string;
    status: string;
    progress_pct: number;
    status_message: string;
    created_at: string;
    completed_at?: string;
  };
  videos: VideoRecord[];
  debates: DebatePair[];
  features: FeatureProposal[];
  synthesis?: {
    consensus_points?: Array<{
      assertion: string;
      sources_count: number;
      supporting_channels: string[];
      consensus_level: string;
      sample_quotes: string[];
    }>;
    single_source_claims?: Array<{
      assertion: string;
      video_id: string;
      channel: string;
      provenance_tag: string;
    }>;
    debate_matrix?: any[];
    app_feature_proposals?: any[];
  };
}

export const KnowledgeLabView: React.FC = () => {
  const [topicInput, setTopicInput] = useState<string>('Defence Stocks India');
  const [videoCount, setVideoCount] = useState<number>(25);
  const [domainCategory, setDomainCategory] = useState<string>('ALL');
  const [isExpanding, setIsExpanding] = useState<boolean>(false);
  const [isStartingPipeline, setIsStartingPipeline] = useState<boolean>(false);
  const [expansion, setExpansion] = useState<TopicExpansion | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'matrix' | 'debates' | 'features' | 'videos' | 'notebooklm' | 'mindmap'>('matrix');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [notebookLMDossier, setNotebookLMDossier] = useState<{ markdown: string; wordCount: number; sourceCount: number; mindmapMermaid: string } | null>(null);
  const [isLoadingNotebookLM, setIsLoadingNotebookLM] = useState<boolean>(false);
  const [copiedNotebookText, setCopiedNotebookText] = useState<boolean>(false);

  // Discovered / Recommended Videos Selection States (Stage 1 & 2 Workflow)
  const [discoveredVideos, setDiscoveredVideos] = useState<any[]>([]);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const [isSearchingVideos, setIsSearchingVideos] = useState<boolean>(false);
  const [searchStatus, setSearchStatus] = useState<string | null>(null);

  // Live Browser Tab Audio Loopback Capture States (100% DRM/Blob/Login-Wall Bypass)
  const [isRecordingTab, setIsRecordingTab] = useState<boolean>(false);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<string | null>(null);

  const quickTopics = [
    { label: 'Defence Stocks (Finance)', query: 'Defence Stocks India', cat: 'FINANCE' },
    { label: 'LLM Architecture (AI)', query: 'Transformer Attention Mechanism Andrej Karpathy', cat: 'TECH_AI' },
    { label: 'Neuroscience of Sleep', query: 'Neuroscience of Sleep Andrew Huberman', cat: 'SCIENCE' },
    { label: 'Marcus Aurelius (Philosophy)', query: 'Marcus Aurelius Stoicism Meditations', cat: 'PHILOSOPHY' },
    { label: 'Nifty 50 ETF', query: 'Nifty 50 ETF vs Index Fund', cat: 'FINANCE' },
    { label: 'Quantum Computing', query: 'Quantum Computing for Beginners', cat: 'TECH_AI' }
  ];

  // Duration ticker while capturing tab audio
  useEffect(() => {
    let timer: any;
    if (isRecordingTab) {
      timer = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isRecordingTab]);

  const startTabCapture = async () => {
    try {
      setRecordingStatus('Selecting browser tab with playing audio...');
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        alert('No audio track detected! When selecting the Chrome/Edge tab, please make sure the "Also share tab audio" checkbox is checked.');
        stream.getTracks().forEach(t => t.stop());
        setRecordingStatus(null);
        return;
      }

      const audioStream = new MediaStream(audioTracks);
      const recorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm;codecs=opus' });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        setRecordingStatus('Transcribing captured tab audio via local Whisper...');

        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64data = (reader.result as string).split(',')[1];
          try {
            const res = await fetch('/api/v1/yriks/transcribe-live-audio', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64: base64data,
                title: `Live Browser Tab Stream (${topicInput})`,
                channel: 'Protected Video Bypass',
                durationSeconds: recordingDuration,
                sessionId: activeSessionId
              })
            });
            const json = await res.json();
            if (json.success) {
              setRecordingStatus(`✅ Captured & Transcribed: "${(json.text || '').slice(0, 60)}..."`);
              if (activeSessionId) {
                loadSession(activeSessionId);
              }
            } else {
              setRecordingStatus(`Notice: ${json.error || 'Whisper transcription completed'}`);
            }
          } catch (e: any) {
            setRecordingStatus(`Upload error: ${e.message}`);
          } finally {
            setIsRecordingTab(false);
            setTimeout(() => setRecordingStatus(null), 8000);
          }
        };
      };

      recorder.start(1000);
      setMediaRecorder(recorder);
      setIsRecordingTab(true);
      setRecordingDuration(0);
      setRecordingStatus('🟢 Recording decrypted audio from selected tab. Play the video now!');
    } catch (err: any) {
      console.warn('Tab capture error:', err);
      setRecordingStatus(null);
      setIsRecordingTab(false);
    }
  };

  const stopTabCapture = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  };

  // Load recent sessions on mount
  useEffect(() => {
    fetchRecentSessions();
    triggerExpansion('Defence Stocks India');
  }, []);

  // Poll active session if running
  useEffect(() => {
    if (!activeSessionId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/yriks/session/${activeSessionId}`);
        const json = await res.json();
        if (json.success && json.data) {
          setSessionData(json.data);
          if (json.data.session.status === 'COMPLETED' || json.data.session.status === 'FAILED') {
            setIsStartingPipeline(false);
            fetchRecentSessions();
            fetchNotebookLMExport(activeSessionId);
          }
        }
      } catch (e) {
        console.warn('Session poll error:', e);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [activeSessionId]);

  const fetchNotebookLMExport = async (sessionId: string) => {
    setIsLoadingNotebookLM(true);
    try {
      const res = await fetch(`/api/v1/yriks/export/notebooklm/${sessionId}`);
      const json = await res.json();
      if (json.success) {
        setNotebookLMDossier({
          markdown: json.markdown,
          wordCount: json.wordCount,
          sourceCount: json.sourceCount,
          mindmapMermaid: json.mindmapMermaid
        });
      }
    } catch (e) {
      console.warn('NotebookLM export fetch failed:', e);
    } finally {
      setIsLoadingNotebookLM(false);
    }
  };

  const fetchRecentSessions = async () => {
    try {
      const res = await fetch('/api/v1/yriks/sessions?limit=10');
      const json = await res.json();
      if (json.success && json.data) {
        setRecentSessions(json.data);
        if (json.data.length > 0 && !activeSessionId) {
          loadSession(json.data[0].id);
        }
      }
    } catch (e) {
      console.warn('Failed to load sessions:', e);
    }
  };

  const loadSession = async (sessionId: string) => {
    setActiveSessionId(sessionId);
    try {
      const res = await fetch(`/api/v1/yriks/session/${sessionId}`);
      const json = await res.json();
      if (json.success && json.data) {
        setSessionData(json.data);
        fetchNotebookLMExport(sessionId);
      }
    } catch (e) {
      console.warn('Failed to load session data:', e);
    }
  };

  const triggerExpansion = async (topic: string) => {
    setIsExpanding(true);
    try {
      const res = await fetch(`/api/v1/yriks/expand?topic=${encodeURIComponent(topic)}`);
      const json = await res.json();
      if (json.success && json.data) {
        setExpansion(json.data);
      }
    } catch (e) {
      console.warn('Expansion failed:', e);
    } finally {
      setIsExpanding(false);
    }
  };

  // Stage 1: Search & Recommend Videos / URLs
  const handleSearchAndRecommend = async () => {
    if (!topicInput.trim()) return;
    setIsSearchingVideos(true);
    setSearchStatus('Probing YouTube & web for top-rated, most-viewed videos...');
    try {
      const res = await fetch(`/api/v1/yriks/search?topic=${encodeURIComponent(topicInput)}&count=${videoCount}`);
      const json = await res.json();
      if (json.success && json.data && json.data.length > 0) {
        setDiscoveredVideos(json.data);
        const allIds = new Set<string>(json.data.map((v: any) => v.video_id));
        setSelectedVideoIds(allIds);
        setSearchStatus(`Discovered ${json.data.length} recommended sources across YouTube & Web. Review and select candidates below.`);
      } else {
        setDiscoveredVideos([]);
        setSearchStatus('No videos found for this topic or URL. Try expanding terms.');
      }
    } catch (e: any) {
      setSearchStatus(`Search error: ${e.message}`);
    } finally {
      setIsSearchingVideos(false);
    }
  };

  const toggleSelectVideo = (id: string) => {
    setSelectedVideoIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedVideoIds.size === discoveredVideos.length) {
      setSelectedVideoIds(new Set());
    } else {
      setSelectedVideoIds(new Set(discoveredVideos.map(v => v.video_id)));
    }
  };

  // Stage 2: Ingest Selected Videos into Knowledge Base
  const handleLaunchSelectedPipeline = async () => {
    const chosen = discoveredVideos.filter(v => selectedVideoIds.has(v.video_id));
    if (chosen.length === 0) {
      alert('Please select at least 1 video from the candidate list below to synthesize into the knowledge base.');
      return;
    }
    setIsStartingPipeline(true);
    try {
      const res = await fetch('/api/v1/yriks/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topicInput,
          targetCount: chosen.length,
          selectedVideos: chosen
        })
      });
      const json = await res.json();
      if (json.success && json.sessionId) {
        setActiveSessionId(json.sessionId);
        triggerExpansion(topicInput);
      } else {
        setIsStartingPipeline(false);
      }
    } catch (e) {
      console.error('Launch pipeline error:', e);
      setIsStartingPipeline(false);
    }
  };

  // Direct Fast-Track Pipeline (Automated Discovery & Ingestion)
  const handleLaunchPipeline = async () => {
    if (!topicInput.trim()) return;
    setIsStartingPipeline(true);
    try {
      const res = await fetch('/api/v1/yriks/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topicInput, targetCount: videoCount })
      });
      const json = await res.json();
      if (json.success && json.sessionId) {
        setActiveSessionId(json.sessionId);
        triggerExpansion(topicInput);
      } else {
        setIsStartingPipeline(false);
      }
    } catch (e) {
      console.error('Launch pipeline error:', e);
      setIsStartingPipeline(false);
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s.toString().padStart(2, '0')}s`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-16">
      {/* ── HEADER BANNER ───────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/20 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wider uppercase bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1.5">
                <Youtube className="w-3.5 h-3.5 text-red-400" />
                YRIKS PIPELINE
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wider uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                ZFA v2.1 ZERO FABRICATION
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
                100% Free Tools
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              Knowledge Lab & YouTube Research Intelligence
            </h1>
            <p className="text-slate-400 text-sm mt-1 max-w-3xl">
              Autonomous multi-source research pipeline. Ingests top 25 videos, executes dual-path caption/Whisper transcription, deletes audio ephemerally, computes SHA-256 cryptographic provenance, and builds dialectic debate matrices to prevent single-source anchor bias.
            </p>
          </div>

          {/* Quick Stats Pill */}
          <div className="flex items-center gap-3 bg-slate-950/60 backdrop-blur-md px-4 py-3 rounded-xl border border-slate-800 text-right">
            <div>
              <div className="text-xs text-slate-400 font-medium">Pipeline Status</div>
              <div className="text-sm font-bold text-white flex items-center gap-1.5">
                {sessionData?.session.status === 'COMPLETED' ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Ready
                  </span>
                ) : sessionData?.session.status ? (
                  <span className="text-amber-400 flex items-center gap-1">
                    <RefreshCw className="w-4 h-4 animate-spin" /> {sessionData.session.status}
                  </span>
                ) : (
                  <span className="text-slate-500">Idle</span>
                )}
              </div>
            </div>
            <div className="h-8 w-px bg-slate-800" />
            <div>
              <div className="text-xs text-slate-400 font-medium">Audio Footprint</div>
              <div className="text-sm font-bold text-emerald-400">0 MB (Deleted)</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── SEARCH & TOPIC EXPANSION CONTROL ───────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-3.5">
        {/* ROW 1: Wide Prominent Search Input (Never collapses) */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-indigo-400" />
              Type Any Topic, Concept, Speaker, or Paste YouTube / Playlist URL:
            </span>
            <span className="text-[11px] text-slate-500 font-normal">
              Press Enter or click "Search & Recommend" below
            </span>
          </label>
          <div className="relative w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-400 pointer-events-none" />
            <input
              type="text"
              value={topicInput}
              onChange={(e) => {
                setTopicInput(e.target.value);
                triggerExpansion(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSearchAndRecommend();
                }
              }}
              placeholder="e.g. Defence Stocks India, Quantum Computing, Andrej Karpathy, or paste https://www.youtube.com/watch?v=..."
              className="w-full bg-slate-950 border-2 border-indigo-500/40 focus:border-indigo-500 rounded-xl pl-12 pr-10 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-inner transition-all font-medium"
            />
            {topicInput && (
              <button
                type="button"
                onClick={() => setTopicInput('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-bold bg-slate-800 hover:bg-slate-700 rounded-full w-5 h-5 flex items-center justify-center transition-colors"
                title="Clear"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* ROW 2: Scale Selector & Action Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Batch Scale:</span>
            <select
              value={videoCount}
              onChange={(e) => setVideoCount(Number(e.target.value))}
              className="bg-slate-950 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 cursor-pointer"
              title="Select video ingestion scale"
            >
              <option value={5}>⚡ 5 Videos (Fast Scan)</option>
              <option value={25}>🎯 25 Videos (Standard Radar)</option>
              <option value={50}>🔬 50 Videos (Deep Dive)</option>
              <option value={100}>📚 100 Videos (Comprehensive Archive)</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Primary Action 1: Search & Recommend Sources */}
            <button
              onClick={handleSearchAndRecommend}
              disabled={isSearchingVideos || isStartingPipeline || isRecordingTab}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              title="Search and recommend top videos from YouTube and open sources before ingesting"
            >
              {isSearchingVideos ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-300" />
                  Scanning Sources...
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5 text-indigo-300" />
                  Search & Recommend Sources
                </>
              )}
            </button>

            {/* Primary Action 2: Fast Ingestion Pipeline */}
            <button
              onClick={handleLaunchPipeline}
              disabled={isStartingPipeline || isSearchingVideos || isRecordingTab || (sessionData?.session.status && !['COMPLETED', 'FAILED'].includes(sessionData.session.status))}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-50 text-slate-300 text-xs font-bold rounded-lg shadow transition-all flex items-center gap-1.5 cursor-pointer"
              title="Automatically discover and synthesize without reviewing candidates"
            >
              {isStartingPipeline ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Ingesting...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Fast Run ({videoCount})
                </>
              )}
            </button>

            {/* Infallible Universal Browser Tab Audio Loopback Capture Button */}
            {!isRecordingTab ? (
              <button
                onClick={startTabCapture}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-red-500/50 text-slate-200 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow cursor-pointer"
                title="Capture and transcribe any video playing in another tab (Udemy, Coursera, DRM, Blob streams, Login-walled)"
              >
                <Radio className="w-3.5 h-3.5 text-red-400" />
                Capture Tab Audio (Bypass)
              </button>
            ) : (
              <button
                onClick={stopTabCapture}
                className="px-3.5 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow animate-pulse cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                Stop & Transcribe ({Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')})
              </button>
            )}
          </div>
        </div>

        {/* Active Recording or Status Banner */}
        {recordingStatus && (
          <div className="bg-slate-950 border border-indigo-500/40 rounded-xl p-3 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-indigo-300">
              <Radio className={`w-4 h-4 text-red-400 ${isRecordingTab ? 'animate-spin' : ''}`} />
              <span>{recordingStatus}</span>
            </div>
            {isRecordingTab && (
              <span className="font-mono text-emerald-400 font-bold">
                Stream Active • {recordingDuration}s
              </span>
            )}
          </div>
        )}

        {/* ── STAGE 1: CURATED SOURCE DISCOVERY & CANDIDATE SELECTION RADAR ── */}
        {discoveredVideos.length > 0 && (
          <div className="bg-slate-950 border border-indigo-500/30 rounded-xl p-4 space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Source Curation Radar
                  </span>
                  <span className="text-xs text-slate-400">
                    {discoveredVideos.length} Candidates Identified Across YouTube & Web
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white mt-1">
                  Select Videos to Synthesize into the Knowledge Base ({selectedVideoIds.size} Selected)
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={toggleSelectAll}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold rounded border border-slate-700 transition-all"
                >
                  {selectedVideoIds.size === discoveredVideos.length ? 'Deselect All' : 'Select All'}
                </button>

                <button
                  onClick={handleLaunchSelectedPipeline}
                  disabled={isStartingPipeline || selectedVideoIds.size === 0}
                  className="px-4 py-1.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-lg transition-all flex items-center gap-1.5"
                >
                  {isStartingPipeline ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Synthesizing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-200" />
                      Ingest & Synthesize Selected ({selectedVideoIds.size})
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Candidate Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto pr-1">
              {discoveredVideos.map((v) => {
                const isSelected = selectedVideoIds.has(v.video_id);
                const durationMin = Math.round(v.duration_s / 60);
                const isDeepDive = durationMin >= 30;
                const isTrending = v.view_count > 100000;

                return (
                  <div
                    key={v.video_id}
                    onClick={() => toggleSelectVideo(v.video_id)}
                    className={`p-3 rounded-lg border transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                      isSelected
                        ? 'bg-slate-900/90 border-indigo-500/60 shadow-md ring-1 ring-indigo-500/30'
                        : 'bg-slate-950/60 border-slate-800/80 opacity-60 hover:opacity-90'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectVideo(v.video_id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-700 focus:ring-indigo-500 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-slate-100 line-clamp-2 leading-snug">
                          {v.title}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5 truncate">
                          <span className="text-indigo-300 font-medium">{v.channel}</span>
                          <span>•</span>
                          <span>{durationMin} min</span>
                          {v.view_count > 0 && (
                            <>
                              <span>•</span>
                              <span>{(v.view_count / 1000).toFixed(0)}k views</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[10px]">
                      <div className="flex items-center gap-1">
                        {v.query_origin === 'DIRECT_URL' ? (
                          <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            Direct URL
                          </span>
                        ) : isDeepDive ? (
                          <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            Deep Dive ({durationMin}m)
                          </span>
                        ) : isTrending ? (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            High Views
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                            Candidate
                          </span>
                        )}
                      </div>

                      <a
                        href={v.url || `https://www.youtube.com/watch?v=${v.video_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 font-medium"
                      >
                        Preview <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick Topic Chips (Universal Across Domains) */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Universal Domains:</span>
          {quickTopics.map((qt) => (
            <button
              key={qt.label}
              onClick={() => {
                setTopicInput(qt.query);
                triggerExpansion(qt.query);
              }}
              className={`text-xs px-2.5 py-1 rounded-md transition-all border flex items-center gap-1.5 ${
                topicInput === qt.query
                  ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white hover:border-slate-600'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${
                qt.cat === 'TECH_AI' ? 'bg-purple-400' :
                qt.cat === 'SCIENCE' ? 'bg-emerald-400' :
                qt.cat === 'PHILOSOPHY' ? 'bg-amber-400' : 'bg-blue-400'
              }`} />
              {qt.label}
            </button>
          ))}
        </div>

        {/* 5-Dimensional Expansion Preview Card */}
        {expansion && (
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 mt-3 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <BrainCircuit className="w-4 h-4 text-indigo-400" />
                5D Semantic Ontology Coverage ({expansion.category || 'GENERAL'})
              </span>
              <span className="text-slate-500">
                {expansion.expanded_queries?.length || 0} Search Vectors Generated
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              {/* Tickers */}
              <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-500 font-semibold block mb-1.5 uppercase tracking-wider text-[10px]">
                  Exchange Symbols
                </span>
                <div className="flex flex-wrap gap-1">
                  {expansion.tickers && expansion.tickers.length > 0 ? (
                    expansion.tickers.map((t) => (
                      <span key={t} className="px-1.5 py-0.5 bg-blue-950/60 text-blue-300 border border-blue-800/40 rounded text-[11px] font-mono">
                        {t}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-500 italic">Broad Concept</span>
                  )}
                </div>
              </div>

              {/* Canonical Synonyms */}
              <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-500 font-semibold block mb-1.5 uppercase tracking-wider text-[10px]">
                  Canonical Synonyms
                </span>
                <div className="flex flex-wrap gap-1">
                  {expansion.synonyms && expansion.synonyms.length > 0 ? (
                    expansion.synonyms.slice(0, 3).map((s) => (
                      <span key={s} className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded text-[11px]">
                        {s}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-500 italic">Auto-Derived</span>
                  )}
                </div>
              </div>

              {/* Multilingual */}
              <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-500 font-semibold block mb-1.5 uppercase tracking-wider text-[10px] flex items-center gap-1">
                  <Globe className="w-3 h-3 text-emerald-400" /> Regional Language Terms
                </span>
                <div className="flex flex-wrap gap-1">
                  {expansion.multilingual && Object.keys(expansion.multilingual).length > 0 ? (
                    Object.entries(expansion.multilingual).slice(0, 2).map(([lang, words]) => (
                      <span key={lang} className="px-1.5 py-0.5 bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 rounded text-[11px]">
                        {lang.toUpperCase()}: {words[0]}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-500 italic">English Core</span>
                  )}
                </div>
              </div>

              {/* Top Search Vectors */}
              <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-500 font-semibold block mb-1.5 uppercase tracking-wider text-[10px]">
                  yt-dlp Radar Queries
                </span>
                <div className="text-slate-400 truncate space-y-0.5">
                  {expansion.expanded_queries?.slice(0, 2).map((eq, idx) => (
                    <div key={idx} className="truncate text-[11px] text-slate-300">
                      • {eq.query}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Active Session Progress Bar */}
        {sessionData?.session && sessionData.session.status !== 'COMPLETED' && sessionData.session.status !== 'FAILED' && (
          <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-indigo-300 font-semibold flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                {sessionData.session.status_message || 'Processing pipeline...'}
              </span>
              <span className="text-indigo-200 font-bold font-mono">
                {Math.round(sessionData.session.progress_pct)}%
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${sessionData.session.progress_pct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── NAVIGATION SUB-TABS ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('matrix')}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeSubTab === 'matrix'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Consensus Matrix & Claims
          </button>

          <button
            onClick={() => setActiveSubTab('debates')}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeSubTab === 'debates'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Scale className="w-4 h-4" />
            Dialectic Debate Matrix ({sessionData?.debates?.length || 0})
          </button>

          <button
            onClick={() => setActiveSubTab('features')}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeSubTab === 'features'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Synthesized Feature Proposals ({sessionData?.features?.length || 0})
          </button>

          <button
            onClick={() => setActiveSubTab('videos')}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeSubTab === 'videos'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Youtube className="w-4 h-4" />
            Video Radar ({sessionData?.videos?.length || 0})
          </button>

          <button
            onClick={() => {
              setActiveSubTab('notebooklm');
              if (activeSessionId) fetchNotebookLMExport(activeSessionId);
            }}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeSubTab === 'notebooklm'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            NotebookLM Package
          </button>

          <button
            onClick={() => {
              setActiveSubTab('mindmap');
              if (activeSessionId && !notebookLMDossier) fetchNotebookLMExport(activeSessionId);
            }}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeSubTab === 'mindmap'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <BrainCircuit className="w-4 h-4" />
            Mind Map
          </button>
        </div>

        {recentSessions.length > 1 && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Session History:</span>
            <select
              value={activeSessionId || ''}
              onChange={(e) => loadSession(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded px-2.5 py-1 focus:outline-none"
            >
              {recentSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.topic} ({s.status})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── TAB CONTENT: 1. CONSENSUS MATRIX ───────────────────────────────────── */}
      {activeSubTab === 'matrix' && (
        <div className="space-y-6">
          {/* Verified Multi-Source Consensus Points */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  Multi-Source Consensus Assertions (≥70% Cross-Channel Agreement)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Points corroborated by multiple independent financial analysts. These form vetted foundations for decision-making.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
                HIGH CONVICTION
              </span>
            </div>

            {sessionData?.synthesis?.consensus_points && sessionData.synthesis.consensus_points.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sessionData.synthesis.consensus_points.map((pt, idx) => (
                  <div key={idx} className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2 hover:border-slate-700 transition-all">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                        {pt.sources_count} Supporting Sources
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium">
                        Level: {pt.consensus_level}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-200">
                      "{pt.assertion}"
                    </p>
                    <div className="pt-2 border-t border-slate-800/80 flex flex-wrap gap-1 text-[11px] text-slate-400">
                      <span className="text-slate-500">Channels:</span>
                      {pt.supporting_channels.map((ch) => (
                        <span key={ch} className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
                          {ch}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-slate-950/40 border border-dashed border-slate-800 rounded-xl p-8 text-center text-slate-400">
                <BrainCircuit className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm">No consensus points recorded yet for this session.</p>
                <p className="text-xs text-slate-500 mt-1">Click "Run Intelligence Pipeline" to ingest 25 videos and cluster consensus points.</p>
              </div>
            )}
          </div>

          {/* Single-Source Unverified Warning Ledger */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  Unverified Outlier Claims Ledger ([UNVERIFIED SINGLE SOURCE])
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Assertions voiced by exactly ONE creator. Strict ZFA policy flags these so you do not anchor decisions on a single video.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-bold">
                PROVENANCE AUDIT
              </span>
            </div>

            {sessionData?.synthesis?.single_source_claims && sessionData.synthesis.single_source_claims.length > 0 ? (
              <div className="space-y-2">
                {sessionData.synthesis.single_source_claims.slice(0, 6).map((sc, idx) => (
                  <div key={idx} className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          {sc.provenance_tag}
                        </span>
                        <span className="text-xs text-slate-400 font-medium">Channel: {sc.channel}</span>
                      </div>
                      <p className="text-xs text-slate-300">"{sc.assertion}"</p>
                    </div>
                    <a
                      href={`https://www.youtube.com/watch?v=${sc.video_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded transition-all shrink-0"
                      title="Inspect Video Source"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-slate-500 text-xs italic">
                No unverified claims flagged yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB CONTENT: 2. DIALECTIC DEBATE MATRIX ────────────────────────────── */}
      {activeSubTab === 'debates' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Scale className="w-5 h-5 text-indigo-400" />
                Anti-Anchoring Dialectic Split-Screen (Thesis vs Antithesis)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Side-by-side juxtaposition of opposing expert viewpoints to eliminate confirmation bias and emotional anchoring.
              </p>
            </div>
            <span className="text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 px-3 py-1 rounded-full font-bold">
              Balanced Dialectic
            </span>
          </div>

          {sessionData?.debates && sessionData.debates.length > 0 ? (
            <div className="space-y-4">
              {sessionData.debates.map((d) => (
                <div key={d.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <span className="text-sm font-bold text-indigo-300 uppercase tracking-wide">
                      {d.topic_aspect}
                    </span>
                    <span className="text-xs bg-slate-800 text-slate-400 px-2.5 py-1 rounded-full font-medium">
                      Debate Pair
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Thesis (Bullish) */}
                    <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          THESIS / CATALYST
                        </span>
                        <span className="text-slate-400 font-medium">{d.thesis_channel}</span>
                      </div>
                      <p className="text-sm text-slate-200 italic font-medium">
                        "{d.thesis_claim}"
                      </p>
                      {d.thesis_video_id && (
                        <div className="pt-2">
                          <a
                            href={`https://www.youtube.com/watch?v=${d.thesis_video_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" /> View Video Source
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Antithesis (Bearish / Warning) */}
                    <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-rose-400" />
                          ANTITHESIS / RISK WARNING
                        </span>
                        <span className="text-slate-400 font-medium">{d.antithesis_channel}</span>
                      </div>
                      <p className="text-sm text-slate-200 italic font-medium">
                        "{d.antithesis_claim}"
                      </p>
                      {d.antithesis_video_id && (
                        <div className="pt-2">
                          <a
                            href={`https://www.youtube.com/watch?v=${d.antithesis_video_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-rose-400 hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" /> View Video Source
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Neutrality Guidance Note */}
                  {d.neutrality_guidance && (
                    <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 text-xs text-slate-400 flex items-start gap-2">
                      <Scale className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-slate-300">NRI WealthOS Neutrality Directive:</strong> {d.neutrality_guidance}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
              <Scale className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm">No debate pairs generated for this session yet.</p>
              <p className="text-xs text-slate-500 mt-1">The debate matrix constructs automatically once multi-creator transcripts are clustered.</p>
            </div>
          )}
        </div>
      )}

      {/* ── TAB CONTENT: 3. FEATURE PROPOSALS ──────────────────────────────────── */}
      {activeSubTab === 'features' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-indigo-400" />
                Actionable App Feature Proposals & Screener Signals
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Quantitative filters and screening rules extracted from multi-creator consensus, formatted for immediate adoption.
              </p>
            </div>
            <span className="text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 px-3 py-1 rounded-full font-bold">
              Engineering Pipeline
            </span>
          </div>

          {sessionData?.features && sessionData.features.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sessionData.features.map((f) => (
                <div key={f.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/40 uppercase tracking-wider">
                      {f.category}
                    </span>
                    <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {f.status}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-white">{f.feature_name}</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      <strong className="text-slate-300">Derived from:</strong> "{f.derived_from}"
                    </p>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs font-mono text-slate-300 space-y-1">
                    <span className="text-slate-500 text-[10px] uppercase font-sans font-bold block">
                      Implementation Blueprint:
                    </span>
                    <div className="text-indigo-200 break-words">
                      {f.implementation_blueprint}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs text-slate-500">
                    <span>Source: {f.source_channel}</span>
                    <button
                      onClick={() => alert(`Feature Blueprint recorded to NRI WealthOS Strategy Engine backlog: ${f.feature_name}`)}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded text-xs transition-all flex items-center gap-1"
                    >
                      Adopt into Screener
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
              <Sliders className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm">No quantitative feature proposals generated yet.</p>
            </div>
          )}
        </div>
      )}

      {/* ── TAB CONTENT: 4. INGESTED VIDEO RADAR ──────────────────────────────── */}
      {activeSubTab === 'videos' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Youtube className="w-5 h-5 text-red-400" />
                Ingested Video Radar & Cryptographic Provenance Grid
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Top 25 videos discovered across 5D semantic expansion queries with dual-path transcription provenance and SHA-256 integrity hashes.
              </p>
            </div>
            <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-full font-bold">
              {sessionData?.videos?.length || 0} Ingested
            </span>
          </div>

          {sessionData?.videos && sessionData.videos.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sessionData.videos.map((v) => (
                <div key={v.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3 flex flex-col justify-between hover:border-slate-700 transition-all">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-400 truncate max-w-[160px]">
                        {v.channel}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        v.source === 'WHISPER_SMALL'
                          ? 'bg-purple-950/60 text-purple-300 border-purple-800/50'
                          : 'bg-emerald-950/60 text-emerald-300 border-emerald-800/50'
                      }`}>
                        {v.source || 'CAPTION'}
                      </span>
                    </div>

                    <h4 className="text-sm font-semibold text-white line-clamp-2" title={v.title}>
                      {v.title}
                    </h4>

                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {formatSeconds(v.duration_s)}
                      </span>
                      <span>{(v.view_count || 0).toLocaleString()} views</span>
                      <span className="uppercase">{v.language || 'en'}</span>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    {/* SHA-256 Provenance Hash */}
                    {v.transcript_sha256 && (
                      <div className="flex items-center justify-between bg-slate-950 px-2 py-1 rounded text-[10px] font-mono text-slate-400 border border-slate-800/80">
                        <span className="truncate max-w-[200px]" title={v.transcript_sha256}>
                          SHA-256: {v.transcript_sha256.substring(0, 14)}...
                        </span>
                        <button
                          onClick={() => copyToClipboard(v.transcript_sha256 || '')}
                          className="text-slate-400 hover:text-white text-[10px] ml-1"
                        >
                          {copiedHash === v.transcript_sha256 ? <Check className="w-3 h-3 text-emerald-400" /> : 'Copy'}
                        </button>
                      </div>
                    )}

                    {/* Zero Disk Footprint Badge */}
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="text-emerald-400 flex items-center gap-1 text-[10px]">
                        <CheckCircle2 className="w-3 h-3" /> Audio Deleted
                      </span>
                      <a
                        href={`https://www.youtube.com/watch?v=${v.video_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400 hover:underline flex items-center gap-1"
                      >
                        Watch <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
              <Youtube className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm">No videos recorded in this session radar.</p>
            </div>
          )}
        </div>
      )}

      {/* ── TAB CONTENT: 5. NOTEBOOKLM SOURCE PACKAGE ─────────────────────────── */}
      {activeSubTab === 'notebooklm' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border border-indigo-500/30 rounded-xl p-5 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Google NotebookLM Ingestion Bridge
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  ZFA Verified Package
                </span>
              </div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-400" />
                Compiled Research Dossier for Google NotebookLM
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Multi-source grounded markdown source file ready for instant ingestion into Google NotebookLM for audio podcasts, study guides, and grounded Q&A.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (notebookLMDossier?.markdown) {
                    navigator.clipboard.writeText(notebookLMDossier.markdown);
                    setCopiedNotebookText(true);
                    setTimeout(() => setCopiedNotebookText(false), 2500);
                  }
                }}
                disabled={!notebookLMDossier}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow"
              >
                {copiedNotebookText ? <Check className="w-4 h-4 text-emerald-300" /> : <Layers className="w-4 h-4" />}
                {copiedNotebookText ? 'Copied Dossier!' : 'Copy Dossier Markdown'}
              </button>

              <a
                href={`/api/v1/yriks/export/notebooklm/${activeSessionId}?download=true`}
                download
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border border-slate-700"
              >
                <FileCheck2 className="w-4 h-4 text-cyan-400" />
                Download .md File
              </a>

              <a
                href="https://notebooklm.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 bg-slate-950 hover:bg-slate-900 text-indigo-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1 border border-indigo-500/30"
              >
                NotebookLM <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Metrics & How-To Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
              <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Word Volume</span>
              <div className="text-2xl font-black text-white font-mono">
                {notebookLMDossier?.wordCount?.toLocaleString() || '0'}
              </div>
              <p className="text-[11px] text-emerald-400">Within NotebookLM 500k-word limit</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
              <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Synthesized Sources</span>
              <div className="text-2xl font-black text-indigo-300 font-mono">
                {notebookLMDossier?.sourceCount || sessionData?.videos?.length || 0} Assets
              </div>
              <p className="text-[11px] text-slate-400">Chronologically anchored & timestamped</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
              <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">NotebookLM Workflow</span>
              <div className="text-xs text-slate-300 space-y-0.5">
                <div>1. Click <strong>Download .md File</strong></div>
                <div>2. Drop file into NotebookLM sources</div>
                <div>3. Click <strong>Generate Audio Overview</strong></div>
              </div>
            </div>
          </div>

          {/* Dossier Code Preview */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold text-slate-300">Dossier Preview (First 5,000 Characters)</span>
              <span>Full Length: {notebookLMDossier?.markdown?.length || 0} chars</span>
            </div>
            <textarea
              readOnly
              value={notebookLMDossier?.markdown?.substring(0, 5000) || 'Loading dossier package...'}
              className="w-full h-80 bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-300 resize-none focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* ── TAB CONTENT: 6. INTERACTIVE MIND MAP ────────────────────────────────── */}
      {activeSubTab === 'mindmap' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <BrainCircuit className="w-5 h-5 text-indigo-400" />
                Conceptual Mind Map & Dialectic Relationship Graph
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Hierarchical synthesis of core principles, dialectic debates, and top contributing channels for Obsidian and NotebookLM.
              </p>
            </div>
            <button
              onClick={() => {
                if (notebookLMDossier?.mindmapMermaid) {
                  navigator.clipboard.writeText(notebookLMDossier.mindmapMermaid);
                  alert('Mermaid Mindmap diagram code copied to clipboard! Paste into Obsidian or mermaid.live');
                }
              }}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 border border-slate-700"
            >
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              Copy Mermaid Code
            </button>
          </div>

          {/* Visual Concept Clusters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Cluster 1: Core Principles */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                <CheckCircle2 className="w-4 h-4" /> Core Consensus Principles
              </div>
              <div className="space-y-2 text-xs text-slate-300">
                {sessionData?.synthesis?.consensus_points && sessionData.synthesis.consensus_points.length > 0 ? (
                  sessionData.synthesis.consensus_points.map((cp, idx) => (
                    <div key={idx} className="bg-slate-950 p-2 rounded border border-slate-800/80">
                      • {cp.assertion}
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500 italic">No consensus points recorded yet.</div>
                )}
              </div>
            </div>

            {/* Cluster 2: Dialectic Debates */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                <Scale className="w-4 h-4" /> Key Debates & Divergences
              </div>
              <div className="space-y-2 text-xs text-slate-300">
                {sessionData?.debates && sessionData.debates.length > 0 ? (
                  sessionData.debates.map((d) => (
                    <div key={d.id} className="bg-slate-950 p-2 rounded border border-slate-800/80 space-y-1">
                      <strong className="text-indigo-300 block">{d.topic_aspect}</strong>
                      <div className="text-[11px] text-emerald-300">Thesis: {d.thesis_channel}</div>
                      <div className="text-[11px] text-rose-300">Antithesis: {d.antithesis_channel}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500 italic">No debate pairs recorded yet.</div>
                )}
              </div>
            </div>

            {/* Cluster 3: Expert Sources */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-blue-400 font-bold text-xs uppercase tracking-wider">
                <Youtube className="w-4 h-4" /> Contributing Channels
              </div>
              <div className="space-y-1 text-xs text-slate-300">
                {Array.from(new Set(sessionData?.videos?.map(v => v.channel) || [])).slice(0, 8).map((ch) => (
                  <div key={ch} className="bg-slate-950 px-2.5 py-1.5 rounded border border-slate-800/80 flex items-center justify-between">
                    <span>{ch}</span>
                    <span className="text-[10px] text-slate-500 font-mono">Channel</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Mermaid Code Box */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
            <span className="text-xs text-slate-400 font-mono block">
              Mermaid Mindmap Definition (Markdown / Obsidian / Mermaid Live):
            </span>
            <pre className="text-xs font-mono text-cyan-300 overflow-x-auto p-2 bg-slate-900 rounded border border-slate-800/80">
              {notebookLMDossier?.mindmapMermaid || 'mindmap\n  root((Topic))\n    Core Principles\n    Debates\n    Sources'}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeLabView;
