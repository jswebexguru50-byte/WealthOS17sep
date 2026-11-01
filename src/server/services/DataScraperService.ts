import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { YoutubeTranscript } from 'youtube-transcript';
import { TranscriptOptimizer } from './TranscriptOptimizer.js';
import { ScreenerService } from './screenerService.js';

export class DataScraperService {
    private static instance: DataScraperService;
    private constructor() {}

    public static getInstance(): DataScraperService {
        if (!DataScraperService.instance) {
            DataScraperService.instance = new DataScraperService();
        }
        return DataScraperService.instance;
    }

    public async scrapeScreener(symbol: string): Promise<{ about: string, pros: string[], cons: string[], peers: string[] }> {
        try {
            const cleanSymbol = symbol.replace('.NS', '').replace('.BO', '');
            const data = await ScreenerService.getInstance().fetchScreenerData(cleanSymbol);
            if (!data) return { about: '', pros: [], cons: [], peers: [] };
            return {
                about: data.about || '',
                pros: data.pros || [],
                cons: data.cons || [],
                peers: (data.peers || []).map(p => p.name)
            };
        } catch (error) {
            console.error(`[DataScraper] Error scraping screener for ${symbol}:`, error);
            return { about: '', pros: [], cons: [], peers: [] };
        }
    }

    public async scrapeNewsAndSocial(symbol: string): Promise<string[]> {
        try {
            const cleanSymbol = symbol.replace('.NS', '').replace('.BO', '');
            const url = `https://news.google.com/rss/search?q=${cleanSymbol}+stock+OR+video+OR+social`;
            
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                },
                signal: AbortSignal.timeout(10000)
            });

            if (!response.ok) return [];

            const xml = await response.text();
            const $ = cheerio.load(xml, { xmlMode: true });

            const newsTitles: string[] = [];
            $('item title').each((i, el) => {
                if (i < 5) newsTitles.push($(el).text().trim());
            });

            return newsTitles;
        } catch (error) {
            console.error(`[DataScraper] Error scraping news for ${symbol}:`, error);
            return [];
        }
    }

    public async scrapeYouTubeConcall(symbol: string): Promise<string> {
        try {
            const cleanSymbol = symbol.replace('.NS', '').replace('.BO', '');
            // We search Google News RSS or YouTube directly for a concall video. 
            // The easiest free way is to use a Google News RSS search for video
            const url = `https://news.google.com/rss/search?q=site:youtube.com+"${cleanSymbol}"+"earnings+call"`;
            
            const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) });
            if (!response.ok) return '';

            const xml = await response.text();
            const $ = cheerio.load(xml, { xmlMode: true });

            let videoUrl = '';
            $('item link').each((i, el) => {
                if (i === 0) videoUrl = $(el).text().trim();
            });

            if (!videoUrl) return '';

            const transcript = await YoutubeTranscript.fetchTranscript(videoUrl);
            const rawText = transcript.map(t => t.text).join(' ');

            // Optimize the transcript using the imported Token Optimizer logic
            const optimized = TranscriptOptimizer.optimizeTranscript(rawText, 'TURBO_EFFICIENT');
            return optimized.distilledText;
        } catch (error) {
            console.error(`[DataScraper] Error scraping YouTube concall for ${symbol}:`, error);
            return '';
        }
    }
}
