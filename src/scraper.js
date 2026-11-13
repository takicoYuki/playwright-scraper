// ログインが必要な一覧ページを Playwright で巡回し、表のデータを集める。
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

export class LoginError extends Error {
  constructor(message = 'ログインに失敗しました（ユーザー名・パスワードを確認してください）') {
    super(message);
    this.name = 'LoginError';
  }
}

/** "¥1,280" → 1280、"在庫なし" → 0 */
export function parseNumber(text) {
  const digits = String(text).replace(/[^\d-]/g, '');
  return digits === '' ? 0 : Number(digits);
}

/**
 * @param {object} options
 * @param {string} options.baseUrl     対象サイトの URL（例: http://localhost:3000）
 * @param {string} options.username
 * @param {string} options.password
 * @param {number} [options.maxPages]  巡回する最大ページ数
 * @param {boolean} [options.details]  商品詳細ページも開いて説明文を取るか
 * @param {string} [options.screenshotDir] 指定すると各ページのスクリーンショットを保存する
 * @param {boolean} [options.headless]
 * @param {number} [options.timeout]   1 操作あたりの待ち時間の上限（ミリ秒）
 * @param {(msg: string) => void} [options.onProgress]
 * @returns {Promise<{items: object[], pages: number}>}
 */
export async function scrape({
  baseUrl,
  username,
  password,
  maxPages = Infinity,
  details = false,
  screenshotDir,
  headless = true,
  timeout = 10_000,
  onProgress = () => {},
}) {
  if (!baseUrl || !username || !password) {
    throw new Error('baseUrl・username・password は必須です');
  }
  const browser = await chromium.launch({ headless });
  try {
    const context = await browser.newContext({ locale: 'ja-JP' });
    context.setDefaultTimeout(timeout);
    const page = await context.newPage();

    await login(page, baseUrl, username, password);
    onProgress('ログインしました');

    if (screenshotDir) await mkdir(screenshotDir, { recursive: true });

    const items = [];
    let pages = 0;
    while (pages < maxPages) {
      const status = await waitForList(page);
      pages += 1;
      const rows = await extractRows(page, baseUrl);
      items.push(...rows);
      onProgress(`${status}：${rows.length} 件取得`);

      if (screenshotDir) {
        await page.screenshot({ path: join(screenshotDir, `page-${pages}.png`), fullPage: true });
      }

      const next = page.getByRole('link', { name: '次へ' });
      if ((await next.count()) === 0) break;
      await Promise.all([page.waitForURL(/page=\d+/), next.click()]);
    }

    if (details) {
      for (const item of items) {
        await page.goto(item.url);
        item.description = (await page.locator('#description').textContent())?.trim() ?? '';
      }
      onProgress(`詳細ページを ${items.length} 件開きました`);
    }
    return { items, pages };
  } finally {
    await browser.close();
  }
}

async function login(page, baseUrl, username, password) {
  await page.goto(new URL('/login', baseUrl).href);
  await page.getByLabel('ユーザー名').fill(username);
  await page.getByLabel('パスワード').fill(password);
  await page.getByRole('button', { name: 'ログイン' }).click();

  // 一覧に移るか、エラーメッセージが出るかのどちらかを待つ
  const error = page.getByRole('alert');
  await Promise.race([page.waitForURL(/\/products/), error.waitFor()]);
  if (await error.isVisible()) throw new LoginError();
}

/** 一覧は JavaScript で後から描画されるので、件数表示が出るまで待つ。 */
async function waitForList(page) {
  const status = page.locator('#status');
  await status.filter({ hasText: /ページ \d+ \/ \d+/ }).waitFor();
  return (await status.textContent()).trim();
}

async function extractRows(page, baseUrl) {
  const raw = await page.locator('#rows tr').evaluateAll((trs) => trs.map((tr) => {
    const cells = [...tr.querySelectorAll('td')].map((td) => td.innerText.trim());
    return { cells, href: tr.querySelector('a')?.getAttribute('href') ?? '' };
  }));
  return raw.map(({ cells: [id, name, category, price, stock], href }) => ({
    id: Number(id),
    name,
    category,
    price: parseNumber(price),
    stock: parseNumber(stock),
    url: new URL(href, baseUrl).href,
  }));
}
