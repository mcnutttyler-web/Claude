/** RFC 4180-style CSV parser: quoted fields, escaped quotes, CRLF/LF, BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  for (; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

/** Parse CSV into objects keyed by normalized header (lower-case, alphanumerics only). */
export function parseCsvObjects(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const all = parseCsv(text);
  const header = all[0] ?? [];
  const headers = header.map(normHeader);
  const rows = all.slice(1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, idx) => {
      o[h] = (r[idx] ?? '').trim();
    });
    return o;
  });
  return { headers, rows };
}

export function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function toCsv(rows: (string | number | null)[][]): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v === null ? '' : String(v);
          return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\r\n');
}
