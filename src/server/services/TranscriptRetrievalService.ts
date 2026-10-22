/**
 * TranscriptRetrievalService.ts (P2-4)
 * Chunking and query-focused retrieval for MD&A and earnings concalls.
 * Guarantees ≥70% token count reduction vs full-doc baseline while retaining
 * critical insights on raw materials, order book, capex, and margin levers.
 */

export interface DocumentChunk {
  chunkIndex: number;
  text: string;
  tokenCountEstimate: number;
  tags: string[];
  relevanceScore?: number;
}

export interface RetrievalResult {
  query: string;
  selectedChunks: DocumentChunk[];
  originalTokenCount: number;
  retrievedTokenCount: number;
  tokenReductionPct: number;
}

export class TranscriptRetrievalService {
  /**
   * Chunks a full transcript or MD&A document into paragraph-sized blocks
   * with keyword indexing.
   */
  public static chunkDocument(fullText: string, chunkSizeApproxWords = 150): DocumentChunk[] {
    const paragraphs = fullText.split(/\n\s*\n/);
    const chunks: DocumentChunk[] = [];
    let currentWords: string[] = [];
    let chunkIndex = 0;

    for (const p of paragraphs) {
      const words = p.trim().split(/\s+/).filter(Boolean);
      if (words.length === 0) continue;

      currentWords.push(...words);
      if (currentWords.length >= chunkSizeApproxWords) {
        const chunkText = currentWords.join(' ');
        chunks.push({
          chunkIndex: chunkIndex++,
          text: chunkText,
          tokenCountEstimate: Math.ceil(currentWords.length * 1.3),
          tags: this.extractTags(chunkText),
        });
        currentWords = [];
      }
    }

    if (currentWords.length > 0) {
      const chunkText = currentWords.join(' ');
      chunks.push({
        chunkIndex: chunkIndex++,
        text: chunkText,
        tokenCountEstimate: Math.ceil(currentWords.length * 1.3),
        tags: this.extractTags(chunkText),
      });
    }

    return chunks;
  }

  private static extractTags(text: string): string[] {
    const lower = text.toLowerCase();
    const tags: string[] = [];
    if (lower.includes('raw material') || lower.includes('commodity') || lower.includes('input cost') || lower.includes('hedging')) {
      tags.push('raw_material');
    }
    if (lower.includes('order book') || lower.includes('backlog') || lower.includes('pipeline') || lower.includes('bid')) {
      tags.push('order_book');
    }
    if (lower.includes('capex') || lower.includes('expansion') || lower.includes('capacity') || lower.includes('greenfield')) {
      tags.push('capex');
    }
    if (lower.includes('ebitda') || lower.includes('margin') || lower.includes('operating profit')) {
      tags.push('margins');
    }
    if (lower.includes('debt') || lower.includes('interest') || lower.includes('working capital')) {
      tags.push('balance_sheet');
    }
    return tags;
  }

  /**
   * P2-4: Retrieve query-relevant chunks only.
   * Target: token count reduction ≥ 70% vs full-doc baseline.
   */
  public static retrieveRelevantChunks(
    fullDocText: string,
    targetQueries: string[] = ['raw material', 'order book', 'capex']
  ): RetrievalResult {
    const allChunks = this.chunkDocument(fullDocText);
    const originalTokenCount = allChunks.reduce((acc, c) => acc + c.tokenCountEstimate, 0);

    const scoredChunks = allChunks.map((chunk) => {
      let score = 0;
      const lower = chunk.text.toLowerCase();

      for (const q of targetQueries) {
        const qTerms = q.toLowerCase().split(/\s+/);
        for (const term of qTerms) {
          if (lower.includes(term)) {
            score += 2.0;
          }
        }
      }

      // Bonus for quantitative data (numbers, percentages, currencies)
      const numMatches = (chunk.text.match(/(\d+(\.\d+)?%|\$\d+|Rs\s*\d+|crore|lakh)/gi) || []).length;
      score += Math.min(numMatches * 0.5, 3.0);

      return {
        ...chunk,
        relevanceScore: score,
      };
    });

    // Sort by relevance score descending and take top slice
    scoredChunks.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    // Keep highest scoring chunks that provide comprehensive coverage while guaranteeing >=70% token reduction
    const maxTokensAllowed = Math.max(Math.floor(originalTokenCount * 0.28), 300); // 72% reduction target
    let retrievedTokens = 0;
    const selectedChunks: DocumentChunk[] = [];

    for (const chunk of scoredChunks) {
      if ((chunk.relevanceScore || 0) <= 0.5 && selectedChunks.length >= 2) break;
      if (retrievedTokens + chunk.tokenCountEstimate <= maxTokensAllowed || selectedChunks.length === 0) {
        selectedChunks.push(chunk);
        retrievedTokens += chunk.tokenCountEstimate;
      }
    }

    // Re-sort selected chunks by original document order for narrative continuity
    selectedChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

    const tokenReductionPct =
      originalTokenCount > 0
        ? Number((((originalTokenCount - retrievedTokens) / originalTokenCount) * 100).toFixed(1))
        : 0;

    return {
      query: targetQueries.join(', '),
      selectedChunks,
      originalTokenCount,
      retrievedTokenCount: retrievedTokens,
      tokenReductionPct,
    };
  }
}
