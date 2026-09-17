/**
 * Helper to safely perform fetch and parse JSON with automatic retry on rate limits (429 / "Rate exceeded.")
 */
export async function safeFetchJson<T = any>(
  url: string,
  options?: RequestInit,
  retries = 3,
  backoffMs = 800
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      const text = await res.text();

      // Handle 429 Rate Exceeded or plain text rate limit responses
      const isRateLimited =
        res.status === 429 ||
        text.includes('Rate exceeded') ||
        text.includes('Too Many Requests');

      if (isRateLimited) {
        if (attempt < retries) {
          // Add randomized jitter (200ms - 500ms) to stagger retries and avoid thundering herd rate limit collisions
          const jitter = 200 + Math.floor(Math.random() * 300);
          const delay = backoffMs * Math.pow(2, attempt) + jitter;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        return {
          ok: false,
          status: res.status || 429,
          data: null,
          error: 'Rate limit exceeded. Please try again shortly.'
        };
      }

      let parsed: T | null = null;
      if (text && text.trim().length > 0) {
        try {
          parsed = JSON.parse(text) as T;
        } catch {
          if (attempt < retries && !res.ok) {
            await new Promise((resolve) => setTimeout(resolve, backoffMs * Math.pow(2, attempt)));
            continue;
          }
          return {
            ok: false,
            status: res.status,
            data: null,
            error: `Server response was not valid JSON: ${text.slice(0, 100)}`
          };
        }
      }

      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          data: parsed,
          error: (parsed as any)?.message || (parsed as any)?.error || `HTTP ${res.status}`
        };
      }

      return {
        ok: true,
        status: res.status,
        data: parsed
      };
    } catch (err: any) {
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs * Math.pow(2, attempt)));
        continue;
      }
      return {
        ok: false,
        status: 0,
        data: null,
        error: err.message || 'Network request failed'
      };
    }
  }

  return {
    ok: false,
    status: 0,
    data: null,
    error: 'Maximum retry attempts reached'
  };
}

export async function downloadXirrAuditExcel(portfolioName: string | string[]) {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const portStr = Array.isArray(portfolioName) ? portfolioName.join(',') : (portfolioName || 'Combined');
    const safePort = portStr.replace(/[^a-zA-Z0-9_-]/g, '_');
    const url = `/api/portfolio/xirr-audit-excel?portfolio=${encodeURIComponent(portStr)}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      let errorMsg = 'Failed to generate XIRR audit Excel report.';
      try {
        const errJson = await response.json();
        if (errJson && errJson.message) errorMsg = errJson.message;
      } catch {}
      throw new Error(errorMsg);
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', `XIRR_Audit_${safePort}_${todayStr}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  } catch (err: any) {
    console.error('XIRR Excel Download Error:', err);
    alert(`Failed to download XIRR audit Excel: ${err.message || 'Unknown error'}`);
  }
}

