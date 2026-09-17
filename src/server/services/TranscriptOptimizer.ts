import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
export type TokenOptimizationMode = 'BALANCED' | 'TURBO_EFFICIENT' | 'EXHAUSTIVE';

export interface TokenOptimizationStats {
  mode: TokenOptimizationMode;
  rawInputWords: number;
  distilledWords: number;
  compressionRatioPercent: number;
  tokensSavedEstimate: number;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CACHE_FILE = path.join(DATA_DIR, 'semantic_extraction_cache.json');

// Conversational filler phrases and video outro/intro noise patterns
const FILLER_PATTERNS = [
  /welcome back to (the|my) (channel|video|course|tutorial|series)/gi,
  /welcome to (the|my|this) (course|video|tutorial|lecture|lesson)/gi,
  /(don't forget to|make sure to|please) (like and subscribe|hit the bell|leave a comment|subscribe to the channel)/gi,
  /smash that like button/gi,
  /in today'?s video,? (we are going to|we'?ll|we will)/gi,
  /without further ado,? let'?s (get started|jump right in|dive in)/gi,
  /thanks for watching,? (see you in the next|i'?ll see you in the next|until next time)/gi,
  /see you guys (next time|in the next video|later)/gi,
  /as we (saw|discussed|mentioned) in the (last|previous) (video|lesson|lecture)/gi,
  /let me know in the comments (down below|what you think)/gi,
  /let me open up my (browser|screen|terminal|editor)/gi,
  /as you can see (here|right here|on my screen)/gi,
  /\b(um|uh|erm|you know|sort of|kind of|like i said|basically|literally|to be honest|at the end of the day)\b/gi,
];

// High-signal indicators: action verbs, mathematical/empirical markers, conditional logic
const HIGH_SIGNAL_PATTERNS = [
  /\b(must|should|always|never|ensure|avoid|require|calculate|configure|optimize|implement|verify|deploy|execute)\b/i,
  /\b(rule|principle|formula|strategy|framework|metric|ratio|threshold|standard|benchmark|pitfall|risk)\b/i,
  /\b(if|when|because|therefore|in order to|results in|leads to|causes|prevents|enables)\b/i,
  /\b(\d+(\.\d+)?%?|\b\d+x\b|\bzero\b|\brank\b|\bweight\b|\bparameter\b)\b/i,
  /\b(architecture|algorithm|model|data|gradient|loss|return|drawdown|capital|latency|throughput)\b/i,
];

interface CacheStore {
  [hash: string]: {
    concepts: any[];
    cachedAt: string;
    courseTitle?: string;
    lectureTitle?: string;
  };
}

export class TranscriptOptimizer {
  private static cache: CacheStore = TranscriptOptimizer.loadCache();

  private static loadCache(): CacheStore {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.warn('Semantic cache read error, initializing empty:', err);
    }
    return {};
  }

  public static clearCache() {
    TranscriptOptimizer.cache = {};
    TranscriptOptimizer.saveCache();
  }

  private static saveCache() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(CACHE_FILE, JSON.stringify(this.cache, null, 2), 'utf-8');
    } catch (err) {
      console.warn('Failed to save semantic cache:', err);
    }
  }

  /**
   * Generates a deterministic hash for lecture content and hierarchy
   */
  static generateHash(courseTitle: string, sectionTitle: string, itemTitle: string, transcript: string = ''): string {
    const norm = `${courseTitle.toLowerCase().trim()}::${sectionTitle.toLowerCase().trim()}::${itemTitle.toLowerCase().trim()}::${transcript.slice(0, 1000).trim()}`;
    return crypto.createHash('sha256').update(norm).digest('hex').slice(0, 16);
  }

  /**
   * Check if extracted concepts already exist in semantic cache (0 token cost)
   */
  static getCachedConcepts(hash: string): any[] | null {
    if (this.cache[hash] && Array.isArray(this.cache[hash].concepts)) {
      return this.cache[hash].concepts;
    }
    return null;
  }

  /**
   * Store extracted concepts in semantic cache
   */
  static setCachedConcepts(hash: string, concepts: any[], courseTitle?: string, lectureTitle?: string) {
    this.cache[hash] = {
      concepts,
      cachedAt: new Date().toISOString(),
      courseTitle,
      lectureTitle,
    };
    this.saveCache();
  }

  /**
   * Distills and compresses raw video transcript to minimize token consumption
   * while prioritizing high-signal actionable sentences, principles, and rules.
   */
  static optimizeTranscript(
    rawText: string,
    mode: TokenOptimizationMode = 'BALANCED'
  ): {
    distilledText: string;
    stats: TokenOptimizationStats;
  } {
    if (!rawText || rawText.trim().length === 0) {
      return {
        distilledText: '',
        stats: {
          mode,
          rawInputWords: 0,
          distilledWords: 0,
          compressionRatioPercent: 0,
          tokensSavedEstimate: 0,
        },
      };
    }

    const rawWords = rawText.trim().split(/\s+/);
    const rawWordCount = rawWords.length;

    // Step 1: Strip verbal boilerplate & filler phrases
    let cleanedText = rawText;
    for (const pattern of FILLER_PATTERNS) {
      cleanedText = cleanedText.replace(pattern, ' ');
    }

    // Split into sentences
    const sentences = cleanedText
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 15 && s.split(/\s+/).length >= 4);

    if (sentences.length <= 4) {
      // Very short transcript, keep as-is with basic cleanup
      const distilled = sentences.join(' ');
      const distilledWords = distilled.split(/\s+/).length;
      return {
        distilledText: distilled,
        stats: {
          mode,
          rawInputWords: rawWordCount,
          distilledWords,
          compressionRatioPercent: Math.max(0, Math.round((1 - distilledWords / rawWordCount) * 100)),
          tokensSavedEstimate: Math.max(0, Math.round((rawWordCount - distilledWords) * 1.33)),
        },
      };
    }

    // Step 2: Score sentences based on informative density and signals
    const scoredSentences = sentences.map((sentence, idx) => {
      let score = 0;

      // Position bias: first and last 15% of sentences often contain summaries/key takeaways
      const relPos = idx / sentences.length;
      if (relPos < 0.15 || relPos > 0.85) {
        score += 0.3;
      }

      // Check high signal keywords
      for (const pattern of HIGH_SIGNAL_PATTERNS) {
        if (pattern.test(sentence)) {
          score += 1.0;
        }
      }

      // Length penalty: excessively long rambling run-on sentences (> 45 words) get reduced weight
      const wordCount = sentence.split(/\s+/).length;
      if (wordCount > 40) score -= 0.3;
      if (wordCount >= 8 && wordCount <= 28) score += 0.4; // Sweet spot for crisp declarative rule

      return { sentence, score, originalIndex: idx };
    });

    // Step 3: Filter based on optimization mode threshold
    let targetRatio = 0.55; // default for BALANCED
    let minScore = 0.5;

    if (mode === 'TURBO_EFFICIENT') {
      targetRatio = 0.35; // keep only top 35% most informative sentences (massive token savings)
      minScore = 0.8;
    } else if (mode === 'EXHAUSTIVE') {
      targetRatio = 0.80; // keep 80% of sentences
      minScore = 0.2;
    }

    // Sort by score descending to find cutoff
    const sorted = [...scoredSentences].sort((a, b) => b.score - a.score);
    const targetCount = Math.max(4, Math.min(sentences.length, Math.round(sentences.length * targetRatio)));
    const selectedIndices = new Set<number>();

    for (let i = 0; i < sorted.length && selectedIndices.size < targetCount; i++) {
      if (sorted[i].score >= minScore || selectedIndices.size < 4) {
        selectedIndices.add(sorted[i].originalIndex);
      }
    }

    // Reconstruct selected sentences in original chronological order for coherence
    const selectedSentences = scoredSentences
      .filter((item) => selectedIndices.has(item.originalIndex))
      .map((item) => item.sentence);

    const distilledText = selectedSentences.join(' ');
    const distilledWords = distilledText.split(/\s+/).length;
    const compressionRatioPercent = Math.max(0, Math.round((1 - distilledWords / rawWordCount) * 100));
    const tokensSavedEstimate = Math.max(0, Math.round((rawWordCount - distilledWords) * 1.33));

    return {
      distilledText,
      stats: {
        mode,
        rawInputWords: rawWordCount,
        distilledWords,
        compressionRatioPercent,
        tokensSavedEstimate,
      },
    };
  }
}
