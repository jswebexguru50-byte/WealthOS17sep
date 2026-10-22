import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
dotenv.config();

export class GeminiService {
    private static instance: GeminiService;
    private genAI: GoogleGenerativeAI | null = null;
    private initialized = false;

    private constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (apiKey) {
            this.genAI = new GoogleGenerativeAI(apiKey);
            this.initialized = true;
        } else {
            console.warn('[GeminiService] GEMINI_API_KEY is missing from .env. Service will run in mock/fallback mode.');
        }
    }

    public static getInstance(): GeminiService {
        if (!GeminiService.instance) {
            GeminiService.instance = new GeminiService();
        }
        return GeminiService.instance;
    }

    public async synthesizeForensicData(
        targetSymbol: string,
        targetScrapedData: string,
        peersData: { symbol: string, data: string, concall: string }[],
        socialNewsData: string[] = [],
        targetConcallData: string = ''
    ): Promise<any> {
        if (!this.initialized || !this.genAI) {
            return this.mockSynthesize(targetSymbol);
        }

        const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

        let peersContext = '';
        if (peersData && peersData.length > 0) {
            peersContext = 'PEERS DATA:\n' + peersData.map(p => `--- PEER: ${p.symbol} ---\n${p.data}\nConcall/Guidance: ${p.concall}`).join('\n\n');
        }

        let socialContext = '';
        if (socialNewsData && socialNewsData.length > 0) {
            socialContext = 'NEWS & SOCIAL MEDIA (YOUTUBE/TWITTER) PROXY HEADLINES:\n' + socialNewsData.join('\n');
        }
        
        let targetConcallContext = '';
        if (targetConcallData) {
            targetConcallContext = 'TARGET CONCALL / MANAGEMENT PRESENTATION TRANSCRIPT:\n' + targetConcallData;
        }

        const prompt = `
You are an elite, battle-tested Expert Financial Analyst preparing a critical dossier for a Senior Portfolio Manager.
I am providing you with scraped fundamental and news data for a target company and its peers, as well as transcripts of their earnings calls or management presentations.

CRITICAL INSTRUCTION: You must objectively review the OVERALL HEALTH of the business before making any investment or trade recommendations. You are specifically trained to actively hunt for BOTH positive catalysts (tailwinds, capacity expansions, order wins) AND negative red flags (headwinds, regulatory issues, slowing demand, poor earnings). 

DO NOT blindly summarize the news or concalls. You must PARAMETERIZE the data. Extract forward-looking parameters, growth vectors, shifting goalposts, systemic sector risks, and hidden operational realities. Derive insights about the company's growth trajectory and whether management is "walking the talk" compared to their historical guidance. Be brutally objective; eliminate bias and do not act as a cheerleader.

TARGET COMPANY: ${targetSymbol}
TARGET DATA:
${targetScrapedData}

${targetConcallContext}

${peersContext}

${socialContext}

Output MUST be a raw JSON object with the following schema exactly (no markdown, just JSON):
{
  "peerAnalysis": {
      "closestPeers": ["PEER1", "PEER2"],
      "competitiveAdvantage": "1-2 sentences on how the target is doing better than peers",
      "sectorVulnerabilities": "1-2 sentences on what could go wrong in this sector based on peer concalls"
  },
  "operationsEconomics": {
      "rawMaterialConstraints": "Details on raw material constraints",
      "inputPriceEscalation": "Details on price escalation",
      "orderBookDynamics": "Details on order book / execution visibility"
  },
  "governanceRisk": {
      "redFlags": ["Red flag 1", "Red flag 2"],
      "managementChurn": "Details on management/board churn",
      "hostileTakeoverRisk": "Details on hostile takeover probability based on shareholding"
  },
  "valuationProjections": {
      "baseCaseGrowthPct": 10,
      "bestCaseGrowthPct": 15,
      "worstCaseGrowthPct": 5,
      "impliedForwardPE": 20,
      "basePriceTarget": 150,
      "bestPriceTarget": 180,
      "worstPriceTarget": 120,
      "growthDrivers": ["Specific vector 1 (e.g. 5MW capacity expansion in Q3)", "Specific vector 2"]
  },
  "socialAndMediaSentiment": "Parameterized insight on news trajectory and media operational reality (not a summary)",
  "walkTheTalkScore": "Score out of 10 based on management's delivery of past guidance",
  "managementGuidanceAudit": "Detailed assessment of whether management is walking the talk, shifting goalposts, or missing capacity expansion targets.",
  "systemicSectorRisk": "Detect systemic sector issues by cross-referencing target concall against peer concalls (e.g. slowing global demand).",
  "bullCaseCatalysts": ["Positive tailwind 1", "Order win 2"],
  "bearCaseRedFlags": ["Negative headwind 1", "Regulatory issue 2"],
  "overallBusinessHealth": "Objective assessment of the overall health of the business to advise the portfolio manager on an invest/trade decision."
}
`;

        try {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            let text = response.text();
            
            // Clean up markdown block if present
            text = text.replace(/^\`\`\`json/m, '').replace(/\`\`\`$/m, '').trim();
            
            return JSON.parse(text);
        } catch (error) {
            console.error('[GeminiService] Error during Gemini LLM extraction:', error);
            return this.mockSynthesize(targetSymbol);
        }
    }

    private mockSynthesize(symbol: string) {
        // ... (Keep the mock logic we wrote earlier as a fallback)
        const hash = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return {
            peerAnalysis: {
                closestPeers: ['MOCK1.NS', 'MOCK2.NS'],
                competitiveAdvantage: 'Fallback Mock Advantage',
                sectorVulnerabilities: 'Fallback vulnerabilities'
            },
            operationsEconomics: {
                rawMaterialConstraints: 'Fallback Mock Raw Mat',
                inputPriceEscalation: 'Fallback Mock Inflation',
                orderBookDynamics: 'Fallback Mock Order Book'
            },
            governanceRisk: {
                redFlags: ['Fallback Mock Clean Audit'],
                managementChurn: 'Fallback Mock Stable',
                hostileTakeoverRisk: 'Fallback Mock Low'
            },
            valuationProjections: {
                baseCaseGrowthPct: 10,
                bestCaseGrowthPct: 15,
                worstCaseGrowthPct: 5,
                impliedForwardPE: 20,
                basePriceTarget: 110,
                bestPriceTarget: 130,
                worstPriceTarget: 90,
                growthDrivers: ['Fallback Driver 1']
            },
            socialAndMediaSentiment: 'Fallback Mock Social Media Sentiment - No current virality detected.'
        };
    }
}
