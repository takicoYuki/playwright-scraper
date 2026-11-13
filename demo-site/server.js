// スクレイピングの練習・テスト用のデモサイト（ログイン → 商品一覧 → 商品詳細）。
// 一覧は JavaScript で後から描画するので、HTML を取得するだけでは中身が取れない。
// 外部ライブラリは使わず、Node.js 標準の http モジュールだけで動く。
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const DEMO_USER = { username: 'demo', password: 'demo1234' };
export const PAGE_SIZE = 10;

const CATEGORIES = ['文房具', '家電', '食品'];
const NAMES = [
  'ボールペン 0.5mm', 'A5 ノート', '付箋（75mm × 75mm）', 'ホッチキス', '修正テープ',
  'USB 充電器', 'ワイヤレスマウス', 'モバイルバッテリー', 'LED デスクライト', 'Bluetooth スピーカー',
  '緑茶 500ml', 'コーヒー豆 "深煎り" 200g', 'ミックスナッツ', 'チョコレート, ビター', 'はちみつ 300g',
  'クリアファイル 10 枚', '蛍光ペン 5 色', '電卓', 'イヤホン', 'キッチンタイマー',
  'ドリップバッグ 10 袋入り', '玄米 2kg', 'ミネラルウォーター 2L',
];

export const PRODUCTS = NAMES.map((name, i) => ({
  id: i + 1,
  name,
  category: CATEGORIES[Math.floor(i / 5) % CATEGORIES.length],
  price: 100 + ((i * 377) % 4900),
  stock: (i * 7) % 13,
  description: `${name} の商品説明です。デモ用のデータです。`,
}));

const yen = (n) => `¥${n.toLocaleString('ja-JP')}`;

const layout = (title, body) => `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><title>${title} | デモショップ</title>
<style>
  body { font-family: sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: .4rem .6rem; text-align: left; }
  .error { color: #c00; }
  nav.pager { display: flex; gap: 1rem; margin-top: 1rem; }
</style></head>
<body>${body}</body></html>`;

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const loginPage = (error) => layout('ログイン', `
  <h1>ログイン</h1>
  ${error ? '<p class="error" role="alert">ユーザー名またはパスワードが違います</p>' : ''}
  <form method="post" action="/login">
    <p><label>ユーザー名 <input name="username" autocomplete="username"></label></p>
    <p><label>パスワード <input name="password" type="password" autocomplete="current-password"></label></p>
    <button type="submit">ログイン</button>
  </form>`);

// 一覧はクライアント側で /api/products を呼んで描画する（動的なページの例）
const listPage = () => layout('商品一覧', `
  <h1>商品一覧</h1>
  <p><a href="/logout">ログアウト</a></p>
  <p id="status" aria-live="polite">読み込み中…</p>
  <table>
    <thead><tr><th>ID</th><th>商品名</th><th>カテゴリ</th><th>価格</th><th>在庫</th></tr></thead>
    <tbody id="rows"></tbody>
  </table>
  <nav class="pager" aria-label="ページ送り"></nav>
  <script>
    const page = Number(new URLSearchParams(location.search).get('page') || 1);
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    setTimeout(async () => {  // わざと少し遅らせて、待ち合わせが必要な状況を作る
      const res = await fetch('/api/products?page=' + page);
      const data = await res.json();
      document.getElementById('rows').innerHTML = data.items.map((p) =>
        '<tr><td>' + p.id + '</td><td><a href="/products/' + p.id + '">' + esc(p.name) + '</a></td><td>' + esc(p.category) +
        '</td><td>¥' + p.price.toLocaleString('ja-JP') + '</td><td>' + (p.stock > 0 ? p.stock : '在庫なし') + '</td></tr>').join('');
      const nav = [];
      if (data.page > 1) nav.push('<a href="/products?page=' + (data.page - 1) + '">前へ</a>');
      if (data.page < data.totalPages) nav.push('<a href="/products?page=' + (data.page + 1) + '">次へ</a>');
      document.querySelector('nav.pager').innerHTML = nav.join('');
      document.getElementById('status').textContent = 'ページ ' + data.page + ' / ' + data.totalPages + '（全 ' + data.total + ' 件）';
    }, 300);
  </script>`);

const detailPage = (p) => layout(p.name, `
  <h1 id="name">${escapeHtml(p.name)}</h1>
  <dl>
    <dt>カテゴリ</dt><dd id="category">${escapeHtml(p.category)}</dd>
    <dt>価格</dt><dd id="price">${yen(p.price)}</dd>
    <dt>説明</dt><dd id="description">${escapeHtml(p.description)}</dd>
  </dl>
  <p><a href="/products">一覧へ戻る</a></p>`);

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((c) => c.trim().split('=')).filter(([k]) => k));
}

async function readBody(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return new URLSearchParams(body);
}

export function createDemoServer() {
  const sessions = new Set();

  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const loggedIn = sessions.has(parseCookies(req.headers.cookie).session);
    const send = (status, body, type = 'text/html; charset=utf-8', headers = {}) => {
      res.writeHead(status, { 'Content-Type': type, ...headers });
      res.end(body);
    };
    const redirect = (location, headers = {}) => send(303, '', 'text/plain', { Location: location, ...headers });

    if (url.pathname === '/robots.txt') return send(200, 'User-agent: *\nAllow: /\n', 'text/plain');
    if (url.pathname === '/' ) return redirect(loggedIn ? '/products' : '/login');
    if (url.pathname === '/login' && req.method === 'GET') return send(200, loginPage(url.searchParams.has('error')));
    if (url.pathname === '/login' && req.method === 'POST') {
      const form = await readBody(req);
      if (form.get('username') !== DEMO_USER.username || form.get('password') !== DEMO_USER.password) {
        return redirect('/login?error=1');
      }
      const id = randomUUID();
      sessions.add(id);
      return redirect('/products', { 'Set-Cookie': `session=${id}; HttpOnly; SameSite=Lax; Path=/` });
    }
    if (url.pathname === '/logout') {
      sessions.delete(parseCookies(req.headers.cookie).session);
      return redirect('/login', { 'Set-Cookie': 'session=; Max-Age=0; Path=/' });
    }

    if (!loggedIn) {
      return url.pathname.startsWith('/api/')
        ? send(401, JSON.stringify({ error: 'login required' }), 'application/json')
        : redirect('/login');
    }

    if (url.pathname === '/products') return send(200, listPage());
    if (url.pathname === '/api/products') {
      const totalPages = Math.ceil(PRODUCTS.length / PAGE_SIZE);
      const page = Math.min(Math.max(Number(url.searchParams.get('page')) || 1, 1), totalPages);
      const items = PRODUCTS.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
        .map(({ description, ...rest }) => rest);
      return send(200, JSON.stringify({ page, totalPages, total: PRODUCTS.length, items }), 'application/json');
    }
    const detail = url.pathname.match(/^\/products\/(\d+)$/);
    if (detail) {
      const p = PRODUCTS.find((x) => x.id === Number(detail[1]));
      return p ? send(200, detailPage(p)) : send(404, layout('見つかりません', '<h1>見つかりません</h1>'));
    }
    return send(404, layout('見つかりません', '<h1>見つかりません</h1>'));
  });
}

/** デモサイトを起動する。port に 0 を渡すと空いているポートを使う。 */
export function startDemoServer(port = 3000) {
  return new Promise((resolve) => {
    const server = createDemoServer();
    server.listen(port, '127.0.0.1', () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 3000;
  const { url } = await startDemoServer(port);
  console.log(`デモサイトを起動しました: ${url}（ユーザー名 ${DEMO_USER.username} / パスワード ${DEMO_USER.password}）`);
}
