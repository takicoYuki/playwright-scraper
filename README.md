# playwright-scraper

![CI](https://github.com/takicoYuki/playwright-scraper/actions/workflows/ci.yml/badge.svg)

**ログインが必要なページ** を Playwright で巡回し、一覧の表データを集めて **CSV / JSON に保存** するスクレイパーです。
一覧が JavaScript で後から描画されるページにも対応しています（HTML を取得するだけでは中身が取れないケース）。

対象として、ローカルで動く **デモサイト**（ログイン → 商品一覧 3 ページ → 商品詳細）を同梱しています。
実在のサイトにはアクセスしません。

```console
$ npm run demo
デモサイトを起動しました: http://127.0.0.1:3000（ユーザー名 demo / パスワード demo1234）

$ SCRAPER_USER=demo SCRAPER_PASSWORD=demo1234 npm run scrape -- --details
ログインしました
ページ 1 / 3（全 23 件）：10 件取得
ページ 2 / 3（全 23 件）：10 件取得
ページ 3 / 3（全 23 件）：3 件取得
詳細ページを 23 件開きました
3 ページから 23 件を取得し、output/products.csv に保存しました
```

```csv
id,name,category,price,stock,url,description
1,ボールペン 0.5mm,文房具,100,0,http://127.0.0.1:3000/products/1,ボールペン 0.5mm の商品説明です。デモ用のデータです。
2,A5 ノート,文房具,477,7,http://127.0.0.1:3000/products/2,A5 ノート の商品説明です。デモ用のデータです。
```

## できること

| 機能 | 内容 |
|---|---|
| ログイン | ラベル名でフォームを探して入力。失敗したら画面のエラー表示を見て `LoginError` にする |
| 動的なページの待ち合わせ | 固定の `sleep` ではなく「ページ N / M」の表示が出るまで待つ |
| ページ送り | 「次へ」リンクがなくなるまでたどる（`--max-pages` で上限） |
| 詳細ページ | `--details` で各商品のページを開き、説明文も取得 |
| 値の整形 | `¥1,280` → `1280`、`在庫なし` → `0` のように数値にそろえる |
| 出力 | CSV（Excel で文字化けしないよう BOM 付き、カンマ・改行・`"` をエスケープ）/ JSON |
| スクリーンショット | `--screenshots <フォルダ>` で各ページを保存（取得結果の確認用） |

## 使い方

```bash
npm install
npx playwright install chromium

npm run demo                                   # 別のターミナルでデモサイトを起動
export SCRAPER_USER=demo SCRAPER_PASSWORD=demo1234
npm run scrape                                 # output/products.csv に保存
npm run scrape -- --out output/products.json --max-pages 1 --screenshots output/shots
npm run scrape -- --headed                     # ブラウザを表示して動きを確認
```

| オプション | 説明 |
|---|---|
| `--url` | 対象サイト（既定: `http://127.0.0.1:3000`） |
| `--out` | 出力先。拡張子 `.csv` / `.json` で形式を決める |
| `--max-pages` | 巡回する最大ページ数 |
| `--details` | 詳細ページも開いて説明文を取得する |
| `--screenshots` | 各ページのスクリーンショットを保存するフォルダ |
| `--headed` | ブラウザを表示して動かす |

ユーザー名とパスワードは **環境変数で渡す** ようにしています。コマンドライン引数にするとシェルの履歴に残るためです。
終了コードは、成功 0・取得失敗やログイン失敗 1・指定の誤り 2 です。

## 構成

```
demo-site/server.js   デモサイト（Node.js 標準の http だけで動く。一覧は /api/products から JS で描画）
src/scraper.js        ログイン・ページ送り・表の読み取り
src/output.js         CSV / JSON への書き出し
src/cli.js            コマンドライン
test/                 node:test によるテスト
```

## テスト

```bash
npm test
```

テストのたびにデモサイトを空いているポートで起動し、実際にブラウザを動かして確認しています。

| テスト | 内容 |
|---|---|
| `scraper.test.js` | 全ページの取得件数と値、`--max-pages`、ログイン失敗、詳細ページ、スクリーンショット、未ログイン時のアクセス制御、CLI の終了コード |
| `output.test.js` | CSV のエスケープ（カンマ・`"`・改行）、BOM、出力先フォルダの作成、金額表記の数値化 |

CI では、テストに加えてデモサイトに対して CLI を実行し、取得した CSV とスクリーンショットを成果物（Artifacts）として保存しています。

## スクレイピングするときの注意

実在のサイトに使う場合は、利用規約で自動取得が禁止されていないか、`robots.txt` の指定を必ず確認してください。
ログインが必要なサイトは、自分のアカウントで見てよいデータかどうかも含めて判断が必要です。
アクセスの間隔を空ける・必要なページだけ取得するなど、相手のサーバーに負荷をかけないようにしてください。

## ライセンス

MIT
