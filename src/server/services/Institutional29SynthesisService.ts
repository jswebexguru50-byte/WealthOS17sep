import { GoogleGenAI } from '@google/genai';

interface SynthesisSection {
  questionId: number;
  title: string;
  answer: string;
  evidenceState: 'SUPPORTIVE' | 'MIXED_WATCH' | 'CONCERN' | 'MISSING_CONFLICTING';
  evidenceRefs: string[];
}

export interface Institutional29Synthesis {
  title: string;
  executiveSummary: string;
  sections: SynthesisSection[];
  finalConclusion: string;
  citations: Array<{ ref: string; source: string; period?: string; scope?: string }>;
}

export interface Institutional29SynthesisResult {
  analysis: Institutional29Synthesis;
  markdown: string;
  provider: string;
  model: string;
  promptVersion: string;
  rawText: string;
}

const PROMPT_VERSION = 'INSTITUTIONAL29_SYNTHESIS_V2';

export class Institutional29SynthesisService {
  private static instance: Institutional29SynthesisService;
  static getInstance(): Institutional29SynthesisService {
    if (!this.instance) this.instance = new Institutional29SynthesisService();
    return this.instance;
  }

  isConfigured(): boolean {
    return Boolean(this.groqKey() || this.apiKey() || this.bedrockConfigured());
  }

  private groqKey(): string | null {
    const key = String(process.env.GROQ_API_KEY || '').trim();
    return key && key !== 'MY_GROQ_API_KEY' ? key : null;
  }

  private apiKey(): string | null {
    const key = [
      process.env.GEMINI_API_KEY,
      process.env.GEMINI_API_KEY_1,
      process.env.GEMINI_API_KEY_2,
      process.env.GEMINI_API_KEY_3,
      process.env.GEMINI_API_KEY_4,
      process.env.GEMINI_API_KEY_5,
    ].find(candidate => candidate && candidate.trim() && candidate !== 'MY_GEMINI_API_KEY');
    return key?.trim() || null;
  }

  private bedrockConfigured(): boolean {
    return Boolean(
      String(process.env.AWS_ACCESS_KEY_ID || '').trim()
      && String(process.env.AWS_SECRET_ACCESS_KEY || '').trim()
      && String(process.env.AWS_REGION || '').trim()
    );
  }

  private validate(value: any): Institutional29Synthesis {
    if (!value || typeof value !== 'object') throw new Error('LLM_INVALID_OBJECT');
    if (!Array.isArray(value.sections) || value.sections.length !== 29) throw new Error('LLM_MUST_RETURN_29_SECTIONS');
    const ids = value.sections.map((section: any) => Number(section.questionId));
    if (ids.some((id: number, index: number) => id !== index + 1)) throw new Error('LLM_SECTION_IDS_INVALID');
    for (const section of value.sections) {
      if (typeof section.answer !== 'string' || section.answer.trim().split(/\s+/).length < 80) throw new Error(`LLM_SECTION_${section.questionId}_TOO_SHORT`);
      if (!Array.isArray(section.evidenceRefs)) throw new Error(`LLM_SECTION_${section.questionId}_MISSING_EVIDENCE_REFS`);
      if (!['SUPPORTIVE', 'MIXED_WATCH', 'CONCERN', 'MISSING_CONFLICTING'].includes(section.evidenceState)) throw new Error(`LLM_SECTION_${section.questionId}_INVALID_STATE`);
    }
    return value as Institutional29Synthesis;
  }

  private markdown(analysis: Institutional29Synthesis, symbol: string, asOf: string): string {
    const lines = [`# ${analysis.title}`, '', `**Symbol:** ${symbol}  `, `**Evidence cut-off:** ${asOf}  `, `**Synthesis contract:** ${PROMPT_VERSION}`, '', '## Executive summary', '', analysis.executiveSummary, ''];
    for (const section of analysis.sections) {
      lines.push(`## ${section.questionId}. ${section.title}`, '', section.answer.trim(), '', `**Evidence state:** ${section.evidenceState}`, '', `**Evidence references:** ${section.evidenceRefs.length ? section.evidenceRefs.join(', ') : 'No verified reference available'}`, '');
    }
    lines.push('## Final conclusion', '', analysis.finalConclusion, '', '## Citations', '');
    for (const citation of analysis.citations || []) lines.push(`- ${citation.ref}: ${citation.source}${citation.period ? `; ${citation.period}` : ''}${citation.scope ? `; ${citation.scope}` : ''}`);
    return lines.join('\n');
  }

  async synthesize(bundle: any, instructions: string): Promise<Institutional29SynthesisResult> {
    const groqKey = this.groqKey();
    const apiKey = this.apiKey();
    const compactBundle = {
      contractVersion: bundle.contractVersion,
      evidencePolicyVersion: bundle.evidencePolicyVersion,
      symbol: bundle.symbol,
      asOf: bundle.asOf,
      summary: bundle.summary,
      synthesisGuardrails: bundle.synthesisGuardrails,
      factConflicts: (bundle.factConflicts || []).slice(0, 20),
      technicalDiagnostics: bundle.technicalDiagnostics,
      questions: bundle.questions.map((question: any) => ({
        id: question.id,
        topic: question.topic,
        status: question.status,
        missing: question.missing,
        evidence: (question.metricChecks || []).flatMap((check: any) => (check.evidence || []).slice(0, 1)).slice(0, 2).map((fact: any) => ({
          metric: fact.metric, value: fact.value, unit: fact.unit, periodEnd: fact.periodEnd,
          periodType: fact.periodType, scope: fact.scope, provider: fact.provider,
          sourceType: fact.sourceType, factId: fact.factId,
        })),
      })),
    };
    const prompt = `Use only the frozen evidence below. Return JSON with title, executiveSummary, sections[29]{questionId,title,answer,evidenceState,evidenceRefs}, finalConclusion, citations[{ref,source,period,scope}]. Write at least 80 words per section; if missing, state the consequence without inventing facts.\n\nFROZEN_BUNDLE:\n${JSON.stringify(compactBundle)}`;
    const systemInstruction = 'You are an evidence-bounded institutional equity research synthesizer. Never create facts, citations or calculations absent from the supplied frozen bundle.';
    let rawText = '';
    let provider = '';
    let model = '';
    const requestedProvider = String(process.env.INSTITUTIONAL29_LLM_PROVIDER || '').trim().toUpperCase();
    if (groqKey && (requestedProvider === 'GROQ' || !requestedProvider)) {
      model = process.env.INSTITUTIONAL29_GROQ_MODEL || 'openai/gpt-oss-120b';
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: systemInstruction }, { role: 'user', content: prompt }],
          temperature: 0.15,
          max_tokens: 3500,
          response_format: { type: 'json_object' },
        }),
      });
      if (!response.ok) {
        const body = (await response.text()).slice(0, 500);
        throw new Error(`GROQ_HTTP_${response.status}: ${body}`);
      }
      const payload: any = await response.json();
      rawText = String(payload?.choices?.[0]?.message?.content || '');
      if (!rawText) throw new Error('GROQ_EMPTY_RESPONSE');
      provider = 'GROQ';
    } else if (apiKey && requestedProvider !== 'BEDROCK') {
      const client = new GoogleGenAI({ apiKey });
      model = process.env.INSTITUTIONAL29_LLM_MODEL || 'gemini-3.8-flash';
      let response: any;
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await client.models.generateContent({
            model,
            contents: prompt,
            config: { responseMimeType: 'application/json', temperature: 0.15, maxOutputTokens: 32768, systemInstruction } as any,
          });
          break;
        } catch (error: any) {
          lastError = error;
          const text = String(error?.message || error);
          if (!/(429|500|503|UNAVAILABLE|high demand|temporar)/i.test(text) || attempt === 2) throw error;
          await new Promise(resolve => setTimeout(resolve, [5_000, 15_000, 30_000][attempt]));
        }
      }
      if (!response) throw lastError || new Error('GEMINI_NO_RESPONSE');
      rawText = String(response?.text || '');
      provider = 'GOOGLE_GEMINI';
    } else if (this.bedrockConfigured()) {
      const { BedrockService } = await import('./BedrockService.js');
      const response = await BedrockService.getInstance().invoke(
        [{ role: 'user', content: prompt }],
        { systemPrompt: systemInstruction, maxTokens: 24000, model: process.env.INSTITUTIONAL29_BEDROCK_MODEL, purposeTag: `institutional29:${bundle.symbol}` },
      );
      rawText = response.text;
      model = response.model;
      provider = 'AWS_BEDROCK';
    } else {
      throw new Error('LLM_NOT_CONFIGURED');
    }
    rawText = rawText.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    let parsed: any;
    try { parsed = JSON.parse(rawText); } catch { throw new Error('LLM_INVALID_JSON'); }
    const analysis = this.validate(parsed);
    return { analysis, markdown: this.markdown(analysis, bundle.symbol, bundle.asOf), provider, model, promptVersion: PROMPT_VERSION, rawText };
  }
}
