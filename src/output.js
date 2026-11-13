// 集めたデータを CSV / JSON に書き出す。
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname } from 'node:path';

/** CSV の 1 項目をエスケープする（カンマ・ダブルクォート・改行を含むときは "" で囲む）。 */
export function escapeCsv(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * オブジェクトの配列を CSV 文字列にする。
 * Excel で開いても文字化けしないよう、既定で先頭に BOM を付ける。
 */
export function toCsv(rows, { columns, bom = true } = {}) {
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const lines = [cols.map(escapeCsv).join(','), ...rows.map((r) => cols.map((c) => escapeCsv(r[c])).join(','))];
  return (bom ? '\uFEFF' : '') + lines.join('\r\n') + '\r\n';
}

export function formatFromPath(file) {
  const ext = extname(file).toLowerCase();
  if (ext === '.csv') return 'csv';
  if (ext === '.json') return 'json';
  throw new Error(`出力ファイルの拡張子は .csv か .json にしてください: ${file}`);
}

export async function writeOutput(file, rows, format = formatFromPath(file)) {
  await mkdir(dirname(file), { recursive: true });
  const text = format === 'csv' ? toCsv(rows) : JSON.stringify(rows, null, 2) + '\n';
  await writeFile(file, text, 'utf8');
  return file;
}
