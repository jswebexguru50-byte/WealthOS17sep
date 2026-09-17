/**
 * Universal CSV Export Utility for WealthOS Tables
 * Provides RFC-4180 compliant CSV export with automatic quoting and browser download.
 */

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): void {
  const escapeCell = (val: any): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvLines: string[] = [];
  // Add headers
  csvLines.push(headers.map(escapeCell).join(','));

  // Add rows
  for (const row of rows) {
    csvLines.push(row.map(escapeCell).join(','));
  }

  const csvContent = '\uFEFF' + csvLines.join('\r\n'); // Include UTF-8 BOM for Excel compatibility
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const cleanName = filename.toLowerCase().endsWith('.csv') ? filename : `${filename}.csv`;
  link.setAttribute('download', cleanName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
