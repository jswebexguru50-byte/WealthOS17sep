import { apiFetch } from './apiTransport';
export type RemoteStatus = 'AVAILABLE' | 'DATA_INSUFFICIENT' | 'SOURCE_UNAVAILABLE' | 'REMOTE_MISSING' | 'UNAUTHORIZED';

export interface RemoteResponse<T = any> {
    status: RemoteStatus;
    data?: T;
    error?: string;
}

export class WealthOSApiClient {
    static getBaseUrl(): string {
        const isRemoteMode = 
            (typeof window !== 'undefined' && (window as any).WEALTHOS_REMOTE_MODE) ||
            (typeof process !== 'undefined' && process.env.VITE_WEALTHOS_REMOTE_MODE === 'true') ||
            (typeof (import.meta as any) !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_WEALTHOS_REMOTE_MODE === 'true');
        return isRemoteMode ? '/api/ai-studio-proxy' : '/api';
    }

    static async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<RemoteResponse<T>> {
        const baseUrl = this.getBaseUrl();
        const isRemoteMode = baseUrl.includes('/api/ai-studio-proxy');
        
        let path = endpoint;
        if (path.startsWith('/api')) path = path.substring(4);
        if (!path.startsWith('/')) path = '/' + path;

        const urlParts = path.split('?');
        const basePath = urlParts[0];
        const queryParams = urlParts.length > 1 ? '?' + urlParts[1] : '';

        // --- REMOTE CAPABILITY MAPPING ---
        if (isRemoteMode) {
            let mappedPath = null;
            if (basePath.match(/^\/scrip-dossier\/([^\/]+)$/) || basePath.match(/^\/v2\/company-intelligence\/([^\/]+)$/)) {
                const parts = basePath.split('/');
                const symbol = parts[parts.length - 1];
                mappedPath = '/company/' + symbol + '/intelligence';
            }
            // 2. Fundamentals -> mapped to remote fundamentals
            else if (basePath.match(/^\/scrip-dossier\/([^\/]+)\/fundamentals$/)) {
                const symbol = basePath.split('/')[2];
                mappedPath = '/company/' + symbol + '/fundamentals';
            }
            // 3. Technical -> mapped to remote technical
            else if (basePath.match(/^\/market-data\/adjusted-ohlcv\/([^\/]+)$/)) {
                const symbol = basePath.split('/')[3];
                mappedPath = '/company/' + symbol + '/technical';
            }
            // 4. Portfolio -> mapped to remote portfolio
            else if (basePath === '/portfolios') {
                mappedPath = '/portfolio';
            }
            else if (basePath.match(/^\/portfolios\/([^\/]+)$/)) {
                const id = basePath.split('/')[2];
                mappedPath = '/portfolio/' + id;
            }
            
            // 5. Missing Capabilities -> Intercept and return REMOTE_MISSING
            if (!mappedPath) {
                return {
                    status: 'REMOTE_MISSING',
                    error: 'Remote WealthOS capability not yet connected.'
                };
            }
            path = mappedPath + queryParams;
        }
        // ---------------------------------

        const url = baseUrl + path;
        const headers = new Headers(options.headers || {});
        
        const newInit: RequestInit = { ...options, headers };
        try {
            const response = await apiFetch(url, newInit);
            if (response.status === 401) return { status: 'UNAUTHORIZED' };
            if (response.status === 404) return { status: 'REMOTE_MISSING' };
            if (response.status >= 500) return { status: 'SOURCE_UNAVAILABLE' };

            const data = await response.json();
            
            if (response.status >= 400) {
                return { status: 'DATA_INSUFFICIENT', error: data.error || data.message || 'Unknown error' };
            }

            return {
                status: 'AVAILABLE',
                data: data
            };
        } catch (e: any) {
            return {
                status: 'SOURCE_UNAVAILABLE',
                error: e.message
            };
        }
    }
}
