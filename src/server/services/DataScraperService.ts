import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { YoutubeTranscript } from 'youtube-transcript';
import { TranscriptOptimizer } from './TranscriptOptimizer.js';

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
            // Strip .NS or .BO for Screener search
            const cleanSymbol = symbol.replace('.NS', '').replace('.BO', '');
            const url = `https://www.screener.in/company/${cleanSymbol}/consolidated/`;
            
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                signal: AbortSignal.timeout(10000)
            });

            if (!response.ok) {
                console.warn(`[DataScraper] Failed to fetch screener for ${symbol} - Status ${response.status}`);
                return { about: '', pros: [], cons: [], peers: [] };
            }

            const html = await response.text();
            const $ = cheerio.load(html);

            const about = $('.company-profile .about p').text().trim();
            
            const pros: string[] = [];
            $('.pros .metrics li').each((i, el) => {
                pros.push($(el).text().trim());
            });

            const cons: string[] = [];
            $('.cons .metrics li').each((i, el) => {
                cons.push($(el).text().trim());
            });

            // Peers are usually in a table with class 'data-table' inside section with id 'peers'
            const peers: string[] = [];
            $('#peers table tr td:nth-child(2) a').each((i, el) => {
                const peerName = $(el).text().trim();
                // Avoid extracting the target company itself if it appears, though usually it's in the list
                peers.push(peerName);
            });

            return { about, pros, cons, peers };
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
