import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.resolve(process.cwd(), 'scratch', 'semantic_concall_cache.json');

// Conversational filler phrases and concall operator boilerplate
const BOILERPLATE_PATTERNS = [
  /welcome to the (earnings|quarterly|investor|analyst) (call|conference|webcast|presentation)/gi,
  /thank you for (joining|standing by|attending)/gi,
  /ladies and gentlemen,? (good day|welcome|thank you)/gi,
  /as a reminder,? (all participant lines will be in the listen-only mode|this conference is being recorded)/gi,
  /safe harbor (statement|disclaimer)/gi,
  /statements (that are not historical facts|may contain forward-looking)/gi,
  /i would now like to (turn the conference over to|hand over)/gi,
  /without further ado,? let'?s/gi,
  /we will now begin the (question-and-answer|q&a) session/gi,
  /our next question comes from the line of/gi,
  /please go ahead (with your question)?/gi,
  /\b(um|uh|erm|you know|sort of|kind of|like i said|basically|literally)\b/gi,
];

export interface TargetedContexts {
  orderBookText: string;
  rawMaterialText: string;
  pricingPowerText: string;
  capexCapacityText: string;
  condensedPrompt: string;
  stats: {
    rawWordCount: number;
    compressedWordCount: number;
    tokenReductionPct: number;
  };
}

export class TranscriptMicroRagOptimizer {
  private static cache: Record<string, any> = TranscriptMicroRagOptimizer.loadCache();

  private static loadCache(): Record<string, any> {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      }
    } catch (err) {
      console.warn('[MicroRAG] Semantic cache load warning:', err);
    }
    return {};
  }

  private static saveCache() {
    try {
      const dir = path.dirname(CACHE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify(this.cache, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[MicroRAG] Semantic cache save warning:', err);
    }
  }

  public static generateHash(symbol: string, rawText: string): string {
    return crypto.createHash('sha256').update(`${symbol}::${rawText.slice(0, 1500)}`).digest('hex').slice(0, 16);
  }

  /**
   * Cleans conference call text and extracts targeted forensic paragraphs
   */
  public static optimizeConcall(symbol: string, rawText: string): TargetedContexts {
    if (!rawText || rawText.trim().length === 0) {
      return {
        orderBookText: '',
        rawMaterialText: '',
        pricingPowerText: '',
        capexCapacityText: '',
        condensedPrompt: 'No transcript text available.',
        stats: { rawWordCount: 0, compressedWordCount: 0, tokenReductionPct: 0 }
      };
    }

    const hash = this.generateHash(symbol, rawText);
    if (this.cache[hash]) {
      return this.cache[hash];
    }

    const rawWords = rawText.trim().split(/\s+/);
    const rawWordCount = rawWords.length;

    // Step 1: Strip boilerplate
    let cleaned = rawText;
    for (const pattern of BOILERPLATE_PATTERNS) {
      cleaned = cleaned.replace(pattern, ' ');
    }

    // Step 2: Split into paragraphs / coherent chunks of 3-5 sentences
    const paragraphs = cleaned
      .split(/\n\s*\n|\r\n\s*\r\n/)
      .map(p => p.trim())
      .filter(p => p.length > 50 && p.split(/\s+/).length >= 10);

    // If paragraphs are too few, chunk by sentence windows
    let chunks: string[] = [];
    if (paragraphs.length >= 6) {
      chunks = paragraphs;
    } else {
      const sentences = cleaned.split(/(?<=[.?!])\s+/).filter(s => s.trim().length > 20);
      for (let i = 0; i < sentences.length; i += 4) {
        chunks.push(sentences.slice(i, i + 4).join(' '));
      }
    }

    // Step 3: BM25 / Keyword Frequency Scoring for 4 Forensic Dimensions
    const scoreChunk = (chunk: string, keywords: string[]): number => {
      const lower = chunk.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        const regex = new RegExp(`\\b${kw}\\b`, 'gi');
        const matches = lower.match(regex);
        if (matches) score += matches.length;
      }
      return score;
    };

    const orderBookKw = ['order', 'book', 'backlog', 'execution', 'timeline', 'months', 'orders', 'unexecuted', 'visibility', 'inflow', 'inflows', 'tender', 'pipeline'];
    const rawMatKw = ['raw', 'material', 'input', 'cost', 'costs', 'inflation', 'margin', 'margins', 'gross', 'commodity', 'freight', 'supply', 'chain', 'procurement'];
    const pricingKw = ['pricing', 'power', 'price', 'hike', 'hikes', 'realization', 'realizations', 'pass', 'through', 'contract', 'contracts', 'customer', 'premium'];
    const capexKw = ['capacity', 'utilization', 'capex', 'brownfield', 'greenfield', 'expansion', 'commissioning', 'debottlenecking', 'facility', 'plant', 'mw', 'mtpa'];

    const getTopChunks = (kw: string[], limit: number = 2): string[] => {
      const scored = chunks.map(c => ({ text: c, score: scoreChunk(c, kw) }));
      return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(s => s.text);
    };

    const orderBookChunks = getTopChunks(orderBookKw, 2);
    const rawMatChunks = getTopChunks(rawMatKw, 2);
    const pricingChunks = getTopChunks(pricingKw, 2);
    const capexChunks = getTopChunks(capexKw, 2);

    const orderBookText = orderBookChunks.join('\n---\n');
    const rawMaterialText = rawMatChunks.join('\n---\n');
    const pricingPowerText = pricingChunks.join('\n---\n');
    const capexCapacityText = capexChunks.join('\n---\n');

    // Assemble unified micro-RAG context
    const condensedPrompt = `[TARGETED CONCALL & MD&A EVIDENCE FOR ${symbol}]
=== ORDER BOOK & EXECUTION VISIBILITY ===
${orderBookText || 'No explicit order book backlog commentary in this disclosure.'}

=== RAW MATERIAL & SUPPLY CHAIN EXPOSURE ===
${rawMaterialText || 'No explicit raw material inflation commentary in this disclosure.'}

=== PRICING POWER & REALIZATIONS ===
${pricingPowerText || 'No explicit price hike commentary in this disclosure.'}

=== CAPACITY UTILIZATION & EXPANSION CAPEX ===
${capexCapacityText || 'No explicit capacity utilization commentary in this disclosure.'}`;

    const compressedWords = condensedPrompt.split(/\s+/).length;
    const tokenReductionPct = Math.max(0, Math.round((1 - compressedWords / Math.max(1, rawWordCount)) * 100));

    const result: TargetedContexts = {
      orderBookText,
      rawMaterialText,
      pricingPowerText,
      capexCapacityText,
      condensedPrompt,
      stats: {
        rawWordCount,
        compressedWordCount: compressedWords,
        tokenReductionPct
      }
    };

    this.cache[hash] = result;
    this.saveCache();
    return result;
  }
}
