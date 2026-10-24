import crypto from 'node:crypto';

export function providerPayload(result) {
  let payload = result;
  const text = result?.content?.find(c => c.type === 'text')?.text;
  if (text) { try { payload = JSON.parse(text); } catch { payload = { result: text }; } }
  if (payload?.status === 'error') throw new Error(`PROVIDER_ERROR:${payload.message || 'Unknown provider failure'}`);
  return payload;
}

function normaliseLabel(value) {
  return String(value).toLowerCase().replace(/annual/g, 'ann').replace(/quarter/g, 'qtr')
    .replace(/revenue/g, 'rev').replace(/activity/g, 'act').replace(/expense/g, 'exp')
    .replace(/percentage/g, '%').replace(/[^a-z0-9%]/g, '');
}

export function parseParameterResponse(result, requestedSymbols, definitions = []) {
  const payload = providerPayload(result);
  const text = typeof payload?.data === 'string' ? payload.data : typeof payload?.result === 'string' ? payload.result : '';
  const requested = new Set(requestedSymbols.map(s => s.toUpperCase()));
  const bySymbol = Object.fromEntries([...requested].map(s => [s, {}]));
  const observations = [], rejected = [], identities = [];
  const valueText = text.replace(/\\n/g, '\n');
  for (const line of valueText.split('\n')) {
    const match = line.match(/^(\d+)\|([^|]+)\|([^|]+)\|([^|]*)\|(\d{4}-\d{2}-\d{2})/);
    if (match && requested.has(match[3].trim().toUpperCase())) identities.push({ stockId: match[1], companyName: match[2], symbol: match[3].trim().toUpperCase(), exchangeCode: match[4], observationDate: match[5] });
  }
  const verified = new Set(identities.map(i => i.symbol));
  for (const block of valueText.split(/\n\s*---\s*\n/)) {
    const lines = block.split('\n').map(s => s.trim()).filter(Boolean);
    for (let n = 0; n < lines.length; n++) {
      const m = lines[n].match(/^([A-Z0-9&_.-]+)\s*:\s*(None|null|-?\d[\d,.]*(?:e[+-]?\d+)?)\s*$/i);
      if (!m) continue;
      const symbol = m[1].toUpperCase(), rawValue = m[2];
      const label = lines.slice(0, n).reverse().find(s => !s.includes('|') && !/^[A-Z0-9&_.-]+\s*:/.test(s));
      if (!requested.has(symbol) || !verified.has(symbol)) { rejected.push({ symbol, label, reason: 'UNVERIFIED_OR_UNREQUESTED_IDENTITY' }); continue; }
      if (!label) continue;
      const candidates = definitions.filter(d => normaliseLabel(d.helping_text || d.label) === normaliseLabel(label));
      const token = candidates.length === 1 ? candidates[0].parameter : null;
      const value = /^(None|null)$/i.test(rawValue) ? null : Number(rawValue.replaceAll(',', ''));
      const observation = { symbol, label, token, value, rawValue, unit: /%/.test(label + ' ' + (candidates[0]?.helping_text || '')) ? 'PERCENTAGE' : 'UNKNOWN',
        period: 'NOT_EXPLICITLY_ANCHORED', status: value == null ? 'PROVIDER_REPORTED_MISSING' : 'RETRIEVED_UNPROMOTED_OBSERVATION' };
      observations.push(observation);
      if (token) bySymbol[symbol][token] = observation;
    }
  }
  return { identities, bySymbol, observations, rejected };
}

export function parseDocumentResponse(result, symbol, asOf, fetchedAt) {
  const payload = providerPayload(result);
  let text = payload?.markdown_data ?? payload?.result ?? '';
  if (typeof text !== 'string') return { documents: [], rejected: [], status: 'NO_TEXT_DOCUMENT_PAYLOAD' };
  try { const decoded = JSON.parse(text); if (typeof decoded === 'string') text = decoded; } catch {}
  text = text.replace(/\\n/g, '\n');
  const regex = /^"?(\d+)\|([^|\n]+)\|([^|\n]+)\|(\d+)\|([^|\n]+)\|(\d{4}-\d{2}-\d{2})/gm;
  const headers = [...text.matchAll(regex)], documents = [], rejected = [];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i], content = text.slice(h.index + h[0].length, headers[i + 1]?.index ?? text.length).trim();
    if (h[3].trim().toUpperCase() !== symbol.toUpperCase() || h[6] > asOf) {
      rejected.push({ documentId: h[1], companyName: h[2], symbol: h[3], date: h[6], reason: h[6] > asOf ? 'AFTER_CUTOFF' : 'COMPANY_IDENTITY_MISMATCH' });
      continue;
    }
    documents.push({ providerDocumentId: h[1], stockId: h[4], symbol: h[3], companyName: h[2], title: `${h[2]} ${h[5]}`, type: /annual/i.test(h[5]) ? 'annual_report' : h[5], date: h[6], content, text: content,
      fetchedAt, sourceTool: 'get_document_search_results', sourceUrl: null, identityVerified: true,
      provenanceStatus: 'MATCHED_COMPANY_SECONDARY_DOCUMENT_EXCERPT', contentSha256: crypto.createHash('sha256').update(content).digest('hex') });
  }
  return { documents, rejected, status: documents.length ? 'MATCHED_DOCUMENT_EXCERPTS_RETRIEVED' : 'NO_MATCHING_COMPANY_DOCUMENTS' };
}
