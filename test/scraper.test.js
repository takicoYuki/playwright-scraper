import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEMO_USER, PAGE_SIZE, PRODUCTS, startDemoServer } from '../demo-site/server.js';
import { LoginError, scrape } from '../src/scraper.js';
import { main } from '../src/cli.js';

let server;
let baseUrl;
const credentials = () => ({ baseUrl, username: DEMO_USER.username, password: DEMO_USER.password });

before(async () => {
  ({ server, url: baseUrl } = await startDemoServer(0));
});
after(() => server.close());

test('ログインして全ページを巡回し、全商品を取得する', async () => {
  const { items, pages } = await scrape(credentials());

  assert.equal(pages, Math.ceil(PRODUCTS.length / PAGE_SIZE));
  assert.equal(items.length, PRODUCTS.length);
  assert.deepEqual(items.map((i) => i.id), PRODUCTS.map((p) => p.id));

  const first = items[0];
  assert.equal(first.name, PRODUCTS[0].name);
  assert.equal(first.category, PRODUCTS[0].category);
  assert.equal(first.price, PRODUCTS[0].price);  // "¥1,234" 表記から数値に変換できている
  assert.equal(first.url, `${baseUrl}/products/1`);
});

test('在庫なしの表記は 0 として扱う', async () => {
  const { items } = await scrape(credentials());
  const soldOut = PRODUCTS.filter((p) => p.stock === 0).map((p) => p.id);
  assert.ok(soldOut.length > 0);
  for (const id of soldOut) assert.equal(items.find((i) => i.id === id).stock, 0);
});

test('maxPages で巡回するページ数を制限できる', async () => {
  const { items, pages } = await scrape({ ...credentials(), maxPages: 1 });
  assert.equal(pages, 1);
  assert.equal(items.length, PAGE_SIZE);
});

test('パスワードが違うと LoginError になる', async () => {
  await assert.rejects(scrape({ ...credentials(), password: 'wrong' }), LoginError);
});

test('details を指定すると詳細ページの説明文も取得する', async () => {
  const { items } = await scrape({ ...credentials(), maxPages: 1, details: true });
  assert.equal(items[0].description, PRODUCTS[0].description);
});

test('各ページのスクリーンショットを保存する', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shots-'));
  await scrape({ ...credentials(), screenshotDir: dir });
  assert.deepEqual((await readdir(dir)).sort(), ['page-1.png', 'page-2.png', 'page-3.png']);
});

test('ログインしていないと一覧や API にアクセスできない', async () => {
  const page = await fetch(`${baseUrl}/products`, { redirect: 'manual' });
  assert.equal(page.status, 303);
  assert.equal(page.headers.get('location'), '/login');
  assert.equal((await fetch(`${baseUrl}/api/products`)).status, 401);
});

test('CLI: 環境変数の認証情報で実行し、CSV に保存する', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cli-'));
  const out = join(dir, 'products.csv');
  const env = { SCRAPER_USER: DEMO_USER.username, SCRAPER_PASSWORD: DEMO_USER.password };

  assert.equal(await main(['--url', baseUrl, '--out', out], env), 0);
  const lines = (await readFile(out, 'utf8')).split('\r\n');
  assert.equal(lines[0], '\uFEFFid,name,category,price,stock,url');
  assert.ok(lines.some((l) => l.includes('"チョコレート, ビター"')));
});

test('CLI: 認証情報がない・オプションが不正なときは終了コード 2', async () => {
  assert.equal(await main(['--url', baseUrl], {}), 2);
  const env = { SCRAPER_USER: 'demo', SCRAPER_PASSWORD: 'x' };
  assert.equal(await main(['--max-pages', '0'], env), 2);
  assert.equal(await main(['--unknown'], env), 2);
});

test('CLI: ログインに失敗したら終了コード 1', async () => {
  const env = { SCRAPER_USER: 'demo', SCRAPER_PASSWORD: 'wrong' };
  assert.equal(await main(['--url', baseUrl, '--out', join(tmpdir(), 'x.json')], env), 1);
});
