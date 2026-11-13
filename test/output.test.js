import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { escapeCsv, formatFromPath, toCsv, writeOutput } from '../src/output.js';
import { parseNumber } from '../src/scraper.js';

test('カンマ・ダブルクォート・改行を含む値は "" で囲んでエスケープする', () => {
  assert.equal(escapeCsv('ボールペン'), 'ボールペン');
  assert.equal(escapeCsv('チョコレート, ビター'), '"チョコレート, ビター"');
  assert.equal(escapeCsv('コーヒー豆 "深煎り"'), '"コーヒー豆 ""深煎り"""');
  assert.equal(escapeCsv('1行目\n2行目'), '"1行目\n2行目"');
  assert.equal(escapeCsv(null), '');
  assert.equal(escapeCsv(0), '0');
});

test('CSV は BOM 付き・CRLF 区切りで、列の順番を指定できる', () => {
  const csv = toCsv([{ id: 1, name: 'A' }, { id: 2, name: 'B, C' }], { columns: ['name', 'id'] });
  assert.equal(csv, '\uFEFFname,id\r\nA,1\r\n"B, C",2\r\n');
  assert.equal(toCsv([{ a: 1 }], { bom: false }), 'a\r\n1\r\n');
});

test('出力形式は拡張子で決める', () => {
  assert.equal(formatFromPath('out/a.CSV'), 'csv');
  assert.equal(formatFromPath('a.json'), 'json');
  assert.throws(() => formatFromPath('a.txt'), /\.csv か \.json/);
});

test('出力先のフォルダがなければ作る', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'scraper-'));
  const file = join(dir, 'nested', 'items.json');
  await writeOutput(file, [{ id: 1 }]);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), [{ id: 1 }]);
});

test('金額や在庫の表記から数値を取り出す', () => {
  assert.equal(parseNumber('¥1,280'), 1280);
  assert.equal(parseNumber('12'), 12);
  assert.equal(parseNumber('在庫なし'), 0);
});
