import Database from 'better-sqlite3';
const db = new Database('portfolio.db');

const row2 = db.prepare(`SELECT response_json, endpoint FROM fundamental_endpoint_snapshots WHERE provider='TRENDLYNE_MCP' AND symbol='AETHER' AND endpoint='statement_history_parameters' ORDER BY fetched_at DESC LIMIT 1`).get();
const payload2 = JSON.parse(row2.response_json);
let text = '';
if (payload2.content && payload2.content[0] && payload2.content[0].text) {
  try { 
      text = JSON.parse(payload2.content[0].text).data || payload2.content[0].text; 
  } catch (e) { 
      text = payload2.content[0].text; 
  }
} else if (payload2.structuredContent && payload2.structuredContent.result) {
  text = JSON.parse(payload2.structuredContent.result).data || payload2.structuredContent.result;
}
if (text) {
    const blocks = text.split('\n---\n').map(b => b.split('\n')[0].trim());
    console.log('statement_history blocks:', blocks);
} else {
    console.log('Could not find text in payload', Object.keys(payload2));
}

const map = db.prepare(`SELECT * FROM field_mapping_catalog WHERE canonical_metric IN ('debt', 'totalBorrowings', 'trade_receivables_cr')`).all();
console.table(map);
