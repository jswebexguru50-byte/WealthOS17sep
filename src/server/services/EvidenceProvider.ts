/**
 * src/server/services/EvidenceProvider.ts
 * Fetches and validates evidence URLs from various sources
 */

export class EvidenceProvider {
  private static instance: EvidenceProvider;
  private readonly VALID_PROTOCOLS = ['http:', 'https:'];

  static getInstance(): EvidenceProvider {
    if (!EvidenceProvider.instance) {
      EvidenceProvider.instance = new EvidenceProvider();
    }
    return EvidenceProvider.instance;
  }

  validateUrls(urls: string[]): void {
    if (!Array.isArray(urls)) {
      throw new Error('INVALID_URL_ARRAY');
    }

    if (urls.length === 0) {
      throw new Error('EMPTY_URL_ARRAY');
    }

    for (const url of urls) {
      if (!this.isValidUrl(url)) {
        throw new Error('INVALID_URL_FORMAT');
      }
    }
  }

  private isValidUrl(url: string): boolean {
    if (!url || typeof url !== 'string') {
      return false;
    }

    // Check for malicious patterns first
    if (url.includes('javascript:')) {
      throw new Error('INVALID_PROTOCOL');
    }
    if (url.includes('data:')) {
      throw new Error('INVALID_PROTOCOL');
    }

    try {
      const parsed = new URL(url);
      if (!this.VALID_PROTOCOLS.includes(parsed.protocol)) {
        throw new Error('INVALID_PROTOCOL');
      }

      return true;
    } catch (e: any) {
      if (e.message === 'INVALID_PROTOCOL') {
        throw e;
      }
      return false;
    }
  }

  validateUrlsAgainstWhitelist(urls: string[], whitelist: string[]): void {
    this.validateUrls(urls);

    for (const url of urls) {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;

      const isWhitelisted = whitelist.some(host =>
        hostname === host || hostname.endsWith('.' + host)
      );

      if (!isWhitelisted) {
        throw new Error('NOT_IN_WHITELIST');
      }
    }
  }

  deduplicateUrls(urls: string[]): string[] {
    return Array.from(new Set(urls));
  }

  async fetchEvidenceUrls(portfolioId: string): Promise<string[]> {
    // Stub: would fetch from broker APIs, caches, etc.
    return [];
  }
}
