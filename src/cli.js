#!/usr/bin/env node
// コマンドラインの入口。
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { LoginError, scrape } from './scraper.js';
import { formatFromPath, writeOutput } from './output.js';

const HELP = `使い方: playwright-scraper [オプション]

  --url <URL>            対象サイト（既定: http://127.0.0.1:3000）
  --out <ファイル>       出力先。拡張子 .csv / .json で形式を決める（既定: output/products.csv）
  --max-pages <数>       巡回する最大ページ数
  --details              商品詳細ページも開いて説明文を取得する
  --screenshots <フォルダ> 各ページのスクリーンショットを保存する
  --headed               ブラウザを表示して動かす（動きの確認用）
  -h, --help             このヘルプを表示する

ユーザー名とパスワードは環境変数 SCRAPER_USER / SCRAPER_PASSWORD で渡してください
（コマンド履歴にパスワードが残らないようにするため）。`;

export async function main(argv = process.argv.slice(2), env = process.env) {
  let args;
  try {
    ({ values: args } = parseArgs({
      args: argv,
      options: {
        url: { type: 'string', default: 'http://127.0.0.1:3000' },
        out: { type: 'string', default: 'output/products.csv' },
        'max-pages': { type: 'string' },
        details: { type: 'boolean', default: false },
        screenshots: { type: 'string' },
        headed: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    }));
  } catch (e) {
    console.error(`${e.message}\n\n${HELP}`);
    return 2;
  }
  if (args.help) {
    console.log(HELP);
    return 0;
  }

  const maxPages = args['max-pages'] === undefined ? Infinity : Number(args['max-pages']);
  if (!(maxPages >= 1)) {
    console.error('--max-pages には 1 以上の数を指定してください');
    return 2;
  }
  if (!env.SCRAPER_USER || !env.SCRAPER_PASSWORD) {
    console.error('環境変数 SCRAPER_USER と SCRAPER_PASSWORD を設定してください');
    return 2;
  }

  try {
    const format = formatFromPath(args.out);
    const { items, pages } = await scrape({
      baseUrl: args.url,
      username: env.SCRAPER_USER,
      password: env.SCRAPER_PASSWORD,
      maxPages,
      details: args.details,
      screenshotDir: args.screenshots,
      headless: !args.headed,
      onProgress: (msg) => console.log(msg),
    });
    await writeOutput(args.out, items, format);
    console.log(`${pages} ページから ${items.length} 件を取得し、${args.out} に保存しました`);
    return 0;
  } catch (e) {
    console.error(e instanceof LoginError ? e.message : `エラー: ${e.message}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
