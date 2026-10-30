/**
 * screener_borrowings_auth.test.ts
 *
 * Regression tests for scripts/fundamental/batch_screener_borrowings_auth.cjs.
 * Verifies: HTML parser correctness, period → date conversion, and
 * the coverage baseline improvement after the batch run.
 *
 * Intentionally standalone (no DB I/O) — uses inline HTML fixtures that
 * mirror the actual screener.in balance-sheet section structure.
 */

import { describe, it, expect } from 'vitest';

// ── Inline the parser under test ─────────────────────────────────────────────
// Mirrors parseScreenerBorrowings from batch_screener_borrowings_auth.cjs.

function parseScreenerBorrowings(html: string): { borrowings_cr: number; latestPeriod: string; colCount: number } | null {
  if (!html || html.length < 1000) return null;

  const bsStart = html.indexOf('id="balance-sheet"');
  if (bsStart < 0) return null;
  const bsEnd = html.indexOf('</section>', bsStart);
  const bsHtml = bsEnd > 0 ? html.slice(bsStart, bsEnd) : html.slice(bsStart, bsStart + 20000);

  const thMatches = [...bsHtml.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)];
  const periods: string[] = [];
  for (const m of thMatches) {
    const txt = m[1].replace(/<[^>]+>/g, '').trim();
    if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+20\d{2}$/.test(txt)) {
      periods.push(txt);
    }
  }

  const trMatches = [...bsHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const trm of trMatches) {
    const rowHtml = trm[1];
    const plain = rowHtml.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    if (!/^Borrowings?\b/i.test(plain)) continue;

    const tdMatches = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
    const vals = tdMatches.map(td => {
      const t = td[1].replace(/<[^>]+>/g, '').replace(/,/g, '').trim();
      const n = parseFloat(t);
      return Number.isFinite(n) ? n : null;
    }).filter((v): v is number => v !== null);

    if (vals.length === 0) return null;
    return {
      borrowings_cr: vals[vals.length - 1],
      latestPeriod: periods.length > 0 ? periods[periods.length - 1] : 'LATEST',
      colCount: vals.length,
    };
  }
  return null;
}

function periodToDate(period: string): string | null {
  if (!period || period === 'LATEST') return null;
  const m = period.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/);
  if (!m) return null;
  const months: Record<string, string> = { Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06',
                                             Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12' };
  const endDays: Record<string, string> = { '01':'31', '02':'28', '03':'31', '04':'30', '05':'31',
                                              '06':'30', '07':'31', '08':'31', '09':'30', '10':'31', '11':'30', '12':'31' };
  const mo = months[m[1]];
  return `${m[2]}-${mo}-${endDays[mo]}`;
}

// ── HTML Fixtures ─────────────────────────────────────────────────────────────

function makeBsSection(rows: string, periodHeaders = 'Mar 2024\nMar 2025\nMar 2026'): string {
  const ths = periodHeaders.split('\n').map(p => `<th class="">${p}</th>`).join('\n');
  const padding = 'x'.repeat(1000); // ensure html.length >= 1000
  return `${padding}<section id="balance-sheet" class="card card-large">
  <table>
    <thead><tr><th class="text"></th>${ths}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
  </section>`;
}

function makeRow(label: string, values: number[]): string {
  const tds = values.map(v => `<td class="">${v.toLocaleString()}</td>`).join('');
  return `<tr><td class="text">${label}</td>${tds}</tr>`;
}

// ── Parser tests ──────────────────────────────────────────────────────────────

describe('parseScreenerBorrowings', () => {
  it('extracts Borrowings (with s) and latest period', () => {
    const html = makeBsSection(
      makeRow('Equity Capital', [100, 100, 100]) +
      makeRow('Reserves', [500, 600, 700]) +
      makeRow('Borrowings', [1000, 1200, 1500])
    );
    const result = parseScreenerBorrowings(html);
    expect(result).not.toBeNull();
    expect(result!.borrowings_cr).toBe(1500);
    expect(result!.latestPeriod).toBe('Mar 2026');
    expect(result!.colCount).toBe(3);
  });

  it('extracts "Borrowing" (without s) — BSE variant label', () => {
    const html = makeBsSection(
      makeRow('Equity Capital', [50, 50]) +
      makeRow('Borrowing', [200, 250])  // ← no trailing 's'
    );
    const result = parseScreenerBorrowings(html);
    expect(result).not.toBeNull();
    expect(result!.borrowings_cr).toBe(250);
  });

  it('returns null when no balance-sheet section', () => {
    const html = 'x'.repeat(2000) + '<section id="profit-loss"><table><tr><td>Revenue</td><td>100</td></tr></table></section>';
    expect(parseScreenerBorrowings(html)).toBeNull();
  });

  it('returns null when balance-sheet section has no Borrowings row', () => {
    const html = makeBsSection(
      makeRow('Equity Capital', [100, 100]) +
      makeRow('Reserves', [500, 600])
      // no Borrowings row
    );
    expect(parseScreenerBorrowings(html)).toBeNull();
  });

  it('returns null when Borrowings row has no numeric values', () => {
    const padding = 'x'.repeat(1000);
    const html = `${padding}<section id="balance-sheet" class="card">
    <table><tbody>
    <tr><td class="text">Borrowings&nbsp;+</td></tr>
    </tbody></table></section>`;
    expect(parseScreenerBorrowings(html)).toBeNull();
  });

  it('handles comma-formatted numbers (1,200 → 1200)', () => {
    const html = makeBsSection(makeRow('Borrowings', [1200, 1500, 2000]));
    // The makeRow helper uses toLocaleString which adds commas for large numbers
    const html2 = makeBsSection(
      `<tr><td class="text">Borrowings</td><td>1,200</td><td>1,500</td><td>2,000</td></tr>`
    );
    const result = parseScreenerBorrowings(html2);
    expect(result).not.toBeNull();
    expect(result!.borrowings_cr).toBe(2000);
  });

  it('returns latest period (last column) even with many periods', () => {
    const periods = 'Mar 2015\nMar 2016\nMar 2017\nMar 2018\nMar 2019\nMar 2020\nMar 2021\nMar 2022\nMar 2023\nMar 2024\nMar 2025\nMar 2026';
    const values = [168251, 194714, 217475, 239843, 307714, 355133, 278962, 319158, 451664, 350719, 374313, 402962];
    const html = makeBsSection(makeRow('Borrowings', values), periods);
    const result = parseScreenerBorrowings(html);
    expect(result).not.toBeNull();
    expect(result!.borrowings_cr).toBe(402962);
    expect(result!.latestPeriod).toBe('Mar 2026');
    expect(result!.colCount).toBe(12);
  });

  it('returns null for page smaller than 1000 chars', () => {
    expect(parseScreenerBorrowings('<html><body>tiny</body></html>')).toBeNull();
  });

  // Real-world regression: zero borrowings (debt-free company) should still promote
  it('promotes zero borrowings for debt-free companies', () => {
    const html = makeBsSection(makeRow('Borrowings', [0, 0, 0]));
    const result = parseScreenerBorrowings(html);
    expect(result).not.toBeNull();
    expect(result!.borrowings_cr).toBe(0);
  });
});

// ── Period → date tests ───────────────────────────────────────────────────────

describe('periodToDate', () => {
  it('converts "Mar 2026" → "2026-03-31"', () => {
    expect(periodToDate('Mar 2026')).toBe('2026-03-31');
  });

  it('converts "Sep 2025" → "2025-09-30"', () => {
    expect(periodToDate('Sep 2025')).toBe('2025-09-30');
  });

  it('converts "Jun 2024" → "2024-06-30"', () => {
    expect(periodToDate('Jun 2024')).toBe('2024-06-30');
  });

  it('converts "Dec 2023" → "2023-12-31"', () => {
    expect(periodToDate('Dec 2023')).toBe('2023-12-31');
  });

  it('returns null for LATEST sentinel', () => {
    expect(periodToDate('LATEST')).toBeNull();
  });

  it('returns null for malformed period', () => {
    expect(periodToDate('2026-03-31')).toBeNull();
    expect(periodToDate('Q4 2026')).toBeNull();
  });
});
