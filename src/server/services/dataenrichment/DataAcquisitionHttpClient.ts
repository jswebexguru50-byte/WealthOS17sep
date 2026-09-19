import { getSourceCapability } from './DataSourceRegistry';

export class DataAcquisitionHttpClient {
  public readonly sourceId: string;
  private accessToken?: string;

  constructor(sourceId: string) {
    this.sourceId = sourceId;
    const capability = getSourceCapability(sourceId);
    
    if (!capability) {
      throw new Error(`SOURCE_UNKNOWN:${sourceId}`);
    }

    if (capability.authenticationRequired) {
      if (sourceId === 'UPSTOX_V3') {
        this.accessToken = process.env.UPSTOX_ACCESS_TOKEN;
        if (!this.accessToken) {
          throw new Error('AUTHENTICATION_REQUIRED');
        }
      } else if (sourceId.startsWith('NSE')) {
        this.accessToken = process.env.NSE_DATA_API_TOKEN;
        if (!this.accessToken) {
          throw new Error('AUTHENTICATION_REQUIRED');
        }
      } else {
        throw new Error(`UNSUPPORTED_AUTH_STRATEGY:${sourceId}`);
      }
    }
  }

  async get(url: string, params: Record<string, string> = {}, headers: Record<string, string> = {}): Promise<any> {
    const fetchHeaders: Record<string, string> = { ...headers };
    
    if (this.accessToken) {
      fetchHeaders['Authorization'] = `Bearer ${this.accessToken}`;
    }
    fetchHeaders['Accept'] = 'application/json';

    const query = new URLSearchParams(params).toString();
    const finalUrl = query ? `${url}?${query}` : url;

    const response = await fetch(finalUrl, { headers: fetchHeaders });
    
    if (response.status === 401 || response.status === 403) {
      throw new Error('AUTHENTICATION_REQUIRED');
    }
    
    if (!response.ok) {
      throw new Error(`HTTP_ERROR:${response.status}:${response.statusText}`);
    }
    
    return response.json();
  }
}
