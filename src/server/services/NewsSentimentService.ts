import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
import Parser from 'rss-parser';
import crypto from 'node:crypto';
import { getDB, dbRun, dbAll } from '../database.js';

export interface NewsArticle {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  snippet?: string;
  catalyst?: string;
}

export interface NewsSentimentResult {
  articles: NewsArticle[];
  overallSentimentScore: number; // -1 to +1
  sentimentVerdict: 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONG_BEARISH';
  laymanSummary: string;
  portfolioImpact: string;
  sourceBreakdown: { source: string; count: number }[];
  keyCatalysts?: string[];
  riskFactors?: string[];
}

export interface StockEventContext {
  symbol: string;
  isAdverse: boolean;
  adverseReason?: string;
  materialityScore: number; // 0-100
  sentimentScore: number;   // 0-100
  tailwindScorePts: number; // +0 to +10
  recentHeadlines: Array<{
    headline: string;
    date: string;
    impact: 'POSITIVE' | 'NEUTRAL' | 'CAUTION';
    source: string;
    snippet: string;
  }>;
}

export class NewsSentimentService {
  private static instance: NewsSentimentService;
  private parser: Parser;

  public static getInstance(): NewsSentimentService {
    if (!NewsSentimentService.instance) {
      NewsSentimentService.instance = new NewsSentimentService();
    }
    return NewsSentimentService.instance;
  }

  constructor() {
    this.parser = new Parser({
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
  }

  /**
   * Advanced Contextual Financial Sentiment & Catalyst Parser
   * Accurately handles turnaround negations, revenue/profit beats, order wins, and regulatory probes.
   */
  private analyzeContextualSentiment(text: string): { sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'; catalyst?: string } {
    const lowerText = text.toLowerCase();

    // 1. Contextual Turnaround / Negation Patterns (High Bullish Conviction)
    const turnaroundBullishPatterns = [
      /loss(es)?\s+(narrow(ed|s)?|shrink(s)?|shrinkage|decline(d)?|fell|halved|drop(ped)?|reduce(d)?)/i,
      /net\s+loss\s+(cut|down|lower|reduced)/i,
      /debt\s+(free|repaid|cleared|reduced|slashed|cut)/i,
      /profit\s+(surges?|jump(s|ed)?|soars?|rall(ies|y)|doubles?|triples?|climbs?|beats?|rises?)/i,
      /ebitda\s+(margin\s+)?(expand(s|ed)?|grow(s|n)?|surge(s|d)?)/i,
      /order\s+book\s+(cross(es|ed)?|expand(s|ed)?|surges?|record)/i,
      /revenue\s+(jump(s|ed)?|grows?|up|surges?|accelerat(es|ed)?)/i,
      /target\s+(hiked|raised|upgraded)/i,
      /rating\s+(upgraded?|reiterates\s+buy)/i,
      /secures?\s+(major\s+)?(contract|order|approval|license|deal)/i,
      /bags?\s+(new\s+)?(order|contract|project|deal)/i,
      /capex\s+(expansion|investment|plan)/i
    ];

    for (const pattern of turnaroundBullishPatterns) {
      if (pattern.test(lowerText)) {
        return { sentiment: 'POSITIVE', catalyst: 'Turnaround / Growth Catalyst' };
      }
    }

    // 2. Contextual Breakdown / Negation Patterns (High Bearish Conviction)
    const breakdownBearishPatterns = [
      /profit\s+(fall(s)?|fell|drop(ped)?|plunge(d)?|slump(s|ed)?|miss(es|ed)?|decline(d)?|down)/i,
      /margin(s)?\s+(compress(ed|ion)?|contract(s|ed)?|hit|erod(ed|ing)?|drop)/i,
      /revenue\s+(down|slump(s|ed)?|fall(s)?|fell|miss(es)?)/i,
      /loss\s+(widen(s|ed)?|surge(s|d)?|mount(s)?|expand(s|ed)?)/i,
      /debt\s+(concern(s)?|mount(s|ing)?|spike(s|d)?|burden)/i,
      /sebi\s+(probe|notice|inquiry|bar(s)?|investigation|penalty|fine)/i,
      /it\s+(raid|survey|search|tax\s+demand)/i,
      /gst\s+(demand|notice|penalty|investigation)/i,
      /cbi\s+|ed\s+(probe|raid|arrest|chargesheet|summons)/i,
      /promoter(s)?\s+(pledge|sell(s|ing)?|offload(s|ed)?|stake\s+cut)/i,
      /rating\s+(downgrade(d)?|cut|negative\s+outlook)/i,
      /target\s+(cut|slashed|reduced|downgraded)/i,
      /resigns?|auditor\s+quit|accounting\s+irregularit(y|ies)/i,
      /plant\s+(shutdown|fire|halt(ed)?|strike)/i
    ];

    for (const pattern of breakdownBearishPatterns) {
      if (pattern.test(lowerText)) {
        return { sentiment: 'NEGATIVE', catalyst: 'Regulatory / Margin Headwind' };
      }
    }

    // 3. Fallback Multi-Word Financial Lexicon Scoring
    const positiveWords = [
      'record', 'dividend', 'acquisition', 'milestone', 'approved', 'secures', 'outperform',
      'gain', 'all-time high', 'multi-bagger', 'fii buying', 'bonus shares', 'buyback', 'partnership'
    ];
    const negativeWords = [
      'litigation', 'fine', 'penalty', 'warning', 'tumble', 'selloff', 'default', 'fraud',
      'weakness', 'slump', 'scandal', 'dispute', 'delayed', 'cancellation'
    ];

    let posScore = 0;
    let negScore = 0;

    for (const word of positiveWords) {
      if (lowerText.includes(word)) posScore++;
    }
    for (const word of negativeWords) {
      if (lowerText.includes(word)) negScore++;
    }

    if (posScore > negScore) return { sentiment: 'POSITIVE', catalyst: 'Positive Business Sentiment' };
    if (negScore > posScore) return { sentiment: 'NEGATIVE', catalyst: 'Negative News Sentiment' };
    return { sentiment: 'NEUTRAL' };
  }

  async fetchNews(symbol: string): Promise<NewsSentimentResult> {
    const cleanSym = symbol.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    const isUs = ['VOO', 'QQQ', 'VGT', 'SCHG', 'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'TSLA'].includes(cleanSym);

    const allArticles: NewsArticle[] = [];
    const feedUrls: { name: string; url: string }[] = [];

    if (isUs) {
      feedUrls.push(
        { name: 'Yahoo Finance', url: `https://finance.yahoo.com/rss/headline?s=${encodeURIComponent(cleanSym)}` },
        { name: 'Google News US', url: `https://news.google.com/rss/search?q=${encodeURIComponent(cleanSym + ' stock news')}&hl=en-US&gl=US&ceid=US:en` },
        { name: 'MarketWatch', url: `https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines` }
      );
    } else {
      feedUrls.push(
        {
          name: 'Google News India',
          url: `https://news.google.com/rss/search?q=${encodeURIComponent(cleanSym + ' share price OR ' + cleanSym + ' quarterly results')}&hl=en-IN&gl=IN&ceid=IN:en`
        },
        {
          name: 'Economic Times',
          url: `https://news.google.com/rss/search?q=${encodeURIComponent('site:economictimes.indiatimes.com ' + cleanSym)}&hl=en-IN&gl=IN&ceid=IN:en`
        },
        {
          name: 'Livemint',
          url: `https://news.google.com/rss/search?q=${encodeURIComponent('site:livemint.com ' + cleanSym)}&hl=en-IN&gl=IN&ceid=IN:en`
        },
        {
          name: 'Moneycontrol',
          url: `https://news.google.com/rss/search?q=${encodeURIComponent('site:moneycontrol.com ' + cleanSym)}&hl=en-IN&gl=IN&ceid=IN:en`
        },
        {
          name: 'Business Standard',
          url: `https://news.google.com/rss/search?q=${encodeURIComponent('site:business-standard.com ' + cleanSym)}&hl=en-IN&gl=IN&ceid=IN:en`
        }
      );
    }

    // Fetch all feeds concurrently with fault tolerance
    const results = await Promise.allSettled(
      feedUrls.map(async (feedObj) => {
        try {
          const feed = await this.parser.parseURL(feedObj.url);
          return (feed.items || []).slice(0, 4).map((item) => {
            const rawTitle = (item.title || '').replace(/ - .*$/, '').trim();
            const { sentiment, catalyst } = this.analyzeContextualSentiment(rawTitle + ' ' + (item.contentSnippet || ''));
            return {
              title: rawTitle,
              link: item.link || '',
              pubDate: item.pubDate || new Date().toISOString(),
              source: feedObj.name,
              sentiment,
              catalyst,
              snippet: item.contentSnippet || ''
            };
          });
        } catch (e) {
          return [];
        }
      })
    );

    results.forEach((res) => {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        allArticles.push(...res.value);
      }
    });

    // Deduplicate by title similarity
    const uniqueArticles: NewsArticle[] = [];
    const seenTitles = new Set<string>();

    for (const art of allArticles) {
      const normalized = art.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 35);
      if (!seenTitles.has(normalized) && art.title.length > 10) {
        seenTitles.add(normalized);
        uniqueArticles.push(art);
      }
    }

    // Score calculation
    let posCount = 0;
    let negCount = 0;
    const catalysts: string[] = [];
    const risks: string[] = [];

    uniqueArticles.forEach((a) => {
      if (a.sentiment === 'POSITIVE') {
        posCount++;
        if (a.catalyst && !catalysts.includes(a.title)) catalysts.push(a.title);
      }
      if (a.sentiment === 'NEGATIVE') {
        negCount++;
        if (a.catalyst && !risks.includes(a.title)) risks.push(a.title);
      }
    });

    const total = uniqueArticles.length || 1;
    const score = Number(((posCount - negCount) / total).toFixed(2));

    let sentimentVerdict: 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONG_BEARISH' = 'NEUTRAL';
    let laymanSummary = 'Media coverage is balanced with steady regular corporate updates.';
    let portfolioImpact = 'Neutral for Portfolio: Maintain existing position.';

    if (score >= 0.45) {
      sentimentVerdict = 'STRONG_BULLISH';
      laymanSummary = `Strong positive news flow: Earnings momentum, contract wins, or debt reductions dominating coverage.`;
      portfolioImpact = `Growth Catalyst (Good for Portfolio): Favorable momentum supports multiple expansion.`;
    } else if (score >= 0.15) {
      sentimentVerdict = 'BULLISH';
      laymanSummary = `Constructive press coverage outpaces negative news with positive business catalysts.`;
      portfolioImpact = `Positive Tailwind: Accumulate on technical pullbacks.`;
    } else if (score <= -0.45) {
      sentimentVerdict = 'STRONG_BEARISH';
      laymanSummary = `Elevated negative news: Profit warnings, regulatory scrutiny, or major order overhangs reported.`;
      portfolioImpact = `Downside Risk Alert (Bad for Portfolio): Enforce strict stop-losses or consider hedging.`;
    } else if (score <= -0.15) {
      sentimentVerdict = 'BEARISH';
      laymanSummary = `Recent news indicates margin compression, sectoral headwinds, or broker downgrades.`;
      portfolioImpact = `Caution Advised: Monitor support levels closely before adding fresh capital.`;
    }

    // Source breakdown stats
    const sourceCountMap: { [k: string]: number } = {};
    uniqueArticles.forEach((a) => {
      sourceCountMap[a.source] = (sourceCountMap[a.source] || 0) + 1;
    });
    const sourceBreakdown = Object.entries(sourceCountMap).map(([source, count]) => ({ source, count }));

    return {
      articles: uniqueArticles.slice(0, 10),
      overallSentimentScore: score,
      sentimentVerdict,
      laymanSummary,
      portfolioImpact,
      sourceBreakdown,
      keyCatalysts: catalysts.slice(0, 4),
      riskFactors: risks.slice(0, 4)
    };
  }

  /**
   * Evaluates event intelligence for a scrip, detecting adverse governance/regulatory
   * overhangs that require automatic suppression from actionable recommendations (Stage 3.5).
   */
  async evaluateStockEventContext(symbol: string): Promise<StockEventContext> {
    const cleanSym = symbol.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    let newsRes: NewsSentimentResult;
    try {
      newsRes = await this.fetchNews(cleanSym);
    } catch {
      newsRes = {
        articles: [],
        overallSentimentScore: 0,
        sentimentVerdict: 'NEUTRAL',
        laymanSummary: 'Market news feed unavailable; baseline sentiment maintained.',
        portfolioImpact: 'Neutral',
        sourceBreakdown: []
      };
    }

    const adversePatterns = [
      { regex: /sebi\s+(probe|inquiry|notice|bar(s)?|penalty|order|investigation)/i, reason: 'SEBI Regulatory Investigation or Penalty Notice', materiality: 90 },
      { regex: /it\s+(raid|search|survey|tax\s+demand)/i, reason: 'Income Tax Raid or Search Survey Action', materiality: 85 },
      { regex: /ed\s+(probe|raid|arrest|summons|attachment)|cbi\s+(probe|raid|fir|chargesheet)/i, reason: 'Enforcement Directorate / CBI Criminal Action', materiality: 95 },
      { regex: /auditor\s+(resign(s|ed)?|quit|steps?\s+down)|accounting\s+irregularit(y|ies)|forensic\s+audit/i, reason: 'Auditor Resignation or Forensic Accounting Irregularity', materiality: 95 },
      { regex: /debt\s+default|nclt\s+insolvency|bankruptcy\s+petition|liquidation/i, reason: 'Debt Default or NCLT Insolvency Proceedings', materiality: 95 },
      { regex: /promoter\s+(pledge\s+invoc(ation|ed)|margin\s+call|shares\s+invoked)/i, reason: 'Promoter Pledge Margin Call Invocation', materiality: 85 },
      { regex: /plant\s+(fire|fatal\s+accident|shutdown|blast|closure)/i, reason: 'Severe Industrial Disaster or Plant Shutdown', materiality: 80 }
    ];

    const tailwindPatterns = [
      { regex: /secures?\s+(major\s+)?(order|contract|deal)\s+worth|bags?\s+order/i, pts: 6 },
      { regex: /debt\s+free|slashes?\s+debt|prepays?\s+loans/i, pts: 5 },
      { regex: /usfda\s+(approv(al|ed)|clear(ance|ed)|eir|zero\s+483)/i, pts: 8 },
      { regex: /capex\s+(expansion|commissioning|operationalized)/i, pts: 5 }
    ];

    let isAdverse = false;
    let adverseReason: string | undefined = undefined;
    let maxMateriality = 0;
    let tailwindScorePts = 0;

    for (const art of newsRes.articles) {
      const fullText = `${art.title} ${art.snippet || ''}`;
      for (const pat of adversePatterns) {
        if (pat.regex.test(fullText)) {
          isAdverse = true;
          adverseReason = pat.reason;
          if (pat.materiality > maxMateriality) maxMateriality = pat.materiality;
        }
      }

      for (const tPat of tailwindPatterns) {
        if (tPat.regex.test(fullText)) {
          tailwindScorePts = Math.min(10, tailwindScorePts + tPat.pts);
        }
      }
    }

    // Convert overallSentimentScore (-1 to +1) to 0-100 scale
    const rawScore = Math.round(((newsRes.overallSentimentScore + 1) / 2) * 100);
    const sentimentScore = Math.min(100, Math.max(0, rawScore + tailwindScorePts - (isAdverse ? 40 : 0)));

    const recentHeadlines = newsRes.articles.slice(0, 4).map(a => {
      let headlineDate = new Date().toISOString().split('T')[0];
      if (a.pubDate) {
        try {
          const parsed = new Date(a.pubDate);
          if (!isNaN(parsed.getTime())) {
            headlineDate = parsed.toISOString().split('T')[0];
          }
        } catch (_) {}
      }
      return {
        headline: a.title,
        date: headlineDate,
        impact: a.sentiment === 'POSITIVE' ? 'POSITIVE' as const : a.sentiment === 'NEGATIVE' ? 'CAUTION' as const : 'NEUTRAL' as const,
        source: a.source,
        snippet: a.snippet || ''
      };
    });

    // Persist to EventIntelligenceLog
    try {
      const db = getDB();
      const today = new Date().toISOString().split('T')[0];
      const eventType = isAdverse ? 'ADVERSE' : tailwindScorePts > 0 ? 'TAILWIND' : 'ROUTINE';
      const headlineStr = recentHeadlines[0]?.headline || `Regular news feed scan for ${cleanSym}`;
      const sentimentDelta = (newsRes.overallSentimentScore * 10).toFixed(1);

      await dbRun(db, `
        INSERT INTO EventIntelligenceLog 
          (event_date, symbol, headline, event_type, materiality_score, sentiment_delta_pts, auto_suppressed, suppression_reason, source_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        today,
        cleanSym,
        headlineStr,
        eventType,
        isAdverse ? maxMateriality : tailwindScorePts * 5,
        parseFloat(sentimentDelta),
        isAdverse ? 1 : 0,
        isAdverse ? adverseReason : null,
        'SOURCED_RSS_EXCHANGE_DISCLOSURE'
      ]);
    } catch {
      // Table or DB non-blocking
    }

    return {
      symbol: cleanSym,
      isAdverse,
      adverseReason,
      materialityScore: maxMateriality,
      sentimentScore,
      tailwindScorePts,
      recentHeadlines
    };
  }

  // ─── NSE Corporate Announcements Fetcher ─────────────────────────────────

  private static readonly NSE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.nseindia.com/',
  };

  private static readonly ADVERSE_SUBJECTS = [
    'sebi', 'enforcement directorate', 'ed ', ' cbi', 'fraud', 'irregularit',
    'restatement', 'auditor resignation', 'auditor quit', 'default', 'insolvency',
    'winding up', 'nclt', 'it raid', 'income tax search', 'forensic audit'
  ];

  async fetchNseAnnouncements(symbol: string): Promise<Array<{
    headline: string; date: string; isAdverse: boolean; adverseReason?: string; sourceId: string;
  }>> {
    const cleanSym = symbol.trim().toUpperCase().replace(/\.NS$|\.BO$/g, '');
    try {
      const url = `https://www.nseindia.com/api/corp-announcements?index=equities&symbol=${encodeURIComponent(cleanSym)}`;
      const res = await fetch(url, {
        headers: NewsSentimentService.NSE_HEADERS,
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) return [];
      const json: any = await res.json();
      const items: any[] = Array.isArray(json) ? json : (json.data || json.announcements || []);

      return items.slice(0, 20).map((item: any) => {
        const subject = (item.subject || item.desc || '').toLowerCase();
        const isAdverse = NewsSentimentService.ADVERSE_SUBJECTS.some(k => subject.includes(k));
        const adverseReason = isAdverse ? `NSE Announcement: ${item.subject || 'Adverse disclosure'}` : undefined;
        const headline = item.subject || item.desc || `NSE Corporate Announcement (${cleanSym})`;
        const date = item.an_dt || item.date || new Date().toISOString().split('T')[0];
        const sourceId = crypto.createHash('sha256').update(`${cleanSym}:${headline}:${date}`).digest('hex').slice(0, 16);
        return { headline, date, isAdverse, adverseReason, sourceId };
      });
    } catch {
      return [];
    }
  }

  // ─── Batch Progress Tracker ───────────────────────────────────────────────

  static batchProgress: {
    status: 'IDLE' | 'RUNNING' | 'COMPLETE' | 'ERROR';
    processed: number;
    total: number;
    newEvents: number;
    adverseFound: number;
    startedAt: string | null;
    completedAt: string | null;
  } = { status: 'IDLE', processed: 0, total: 0, newEvents: 0, adverseFound: 0, startedAt: null, completedAt: null };

  // ─── Batch Ingest for Universe ────────────────────────────────────────────

  async batchIngestForUniverse(symbols: string[]): Promise<{
    processed: number; newEvents: number; adverseFound: number;
  }> {
    NewsSentimentService.batchProgress = {
      status: 'RUNNING', processed: 0, total: symbols.length,
      newEvents: 0, adverseFound: 0,
      startedAt: new Date().toISOString(), completedAt: null
    };

    const db = getDB();
    let newEvents = 0;
    let adverseFound = 0;
    const CHUNK = 20;

    for (let i = 0; i < symbols.length; i += CHUNK) {
      const chunk = symbols.slice(i, i + CHUNK);

      await Promise.all(chunk.map(async (sym) => {
        try {
          // RSS-based event context
          const ctx = await this.evaluateStockEventContext(sym);
          if (ctx.isAdverse) adverseFound++;

          // NSE official announcements
          await new Promise(r => setTimeout(r, 300)); // 300ms rate limit for NSE
          const nseAnnouncements = await this.fetchNseAnnouncements(sym);

          for (const ann of nseAnnouncements) {
            if (ann.isAdverse) adverseFound++;
            // Check dedup by source_id
            const existing = await dbAll(db,
              `SELECT event_id FROM EventIntelligenceLog WHERE source_id = ? LIMIT 1`,
              [ann.sourceId]
            ).catch(() => []);
            if ((existing as any[]).length > 0) continue;

            const eventId = crypto.randomUUID();
            await dbRun(db, `
              INSERT OR IGNORE INTO EventIntelligenceLog
                (event_id, symbol, event_type, headline, sentiment_score, materiality_score,
                 is_adverse, source_url, published_at, source_id, data_source)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              eventId, sym.toUpperCase(),
              ann.isAdverse ? 'ADVERSE' : 'NSE_ANNOUNCEMENT',
              ann.headline, 0,
              ann.isAdverse ? 85 : 20,
              ann.isAdverse ? 1 : 0,
              `https://www.nseindia.com/companies-listing/corporate-filings-announcements`,
              ann.date, ann.sourceId, 'NSE_ANNOUNCEMENTS'
            ]).catch(() => {});
            newEvents++;
          }
        } catch {
          // per-symbol errors are non-fatal
        }
      }));

      NewsSentimentService.batchProgress.processed = Math.min(symbols.length, i + CHUNK);
      NewsSentimentService.batchProgress.newEvents = newEvents;
      NewsSentimentService.batchProgress.adverseFound = adverseFound;
    }

    NewsSentimentService.batchProgress = {
      ...NewsSentimentService.batchProgress,
      status: 'COMPLETE', processed: symbols.length,
      completedAt: new Date().toISOString()
    };

    return { processed: symbols.length, newEvents, adverseFound };
  }
}
