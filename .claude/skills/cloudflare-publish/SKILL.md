---
name: cloudflare-publish
description: カフィーリアのモックを Cloudflare に公開する（tools/publish.js）。オーナーが「クラウドフレアにあげて」「公開して」「最新版を出して」「固定版で出して」と言ったときに使う。
---

# Cloudflare に公開する

公開先: https://caffilia-jkwzvlbc7.kate108superstar.workers.dev/
しくみ: モックのフォルダ（CLAUDE.md がある、リポジトリの一番上）の `publish/` は別の git リポジトリ。
`tools/publish.js` が index.html の読み込むファイルを写し、commit して main に push すると、Cloudflare が2〜3分で公開する。

コマンドはすべて、モックのフォルダで動かす。

## 1. どの版か決める

| オーナーの言葉 | 動かすもの |
|---|---|
| 「あげて」「公開して」「最新版」（ふつうはこれ） | `node tools/publish.js latest` |
| 「固定版で」「○○ という名前で」 | `node tools/publish.js <名前>`（英数字・`-`・`_`）。同じ名前があると止まるので、そのときは相談する |
| 「トップのボタンにして」 | 上に `--top=<ラベル>` を足す。言われたときだけ |

## 2. 出す前に確かめる

1. `git status --short`。コミットしていない変更は、そのまま公開に入る（作業中のファイルを写すため）。あれば「コミットしていない変更も出ます」と伝え、コミットするか聞く。
2. すべての .js に `node --check`（`for f in game/*.js tests/*.js tools/*.js; do node --check "$f"; done`）。通らなければ出さずに止める。
3. `publish/` が main で、変更がないこと（`git -C publish status --short`・`git -C publish branch --show-current`）。違えば止めて相談する。

## 3. 出す

```
node tools/publish.js latest
```

最後に「push しました」と URL が出れば送れている。
`git -C publish log --oneline -1` で publish のコミット、`publish/<版>/version.js` で今回の `publishedAt` を控える。

## 4. 出たか確かめる

Cloudflare に出るまで2〜3分かかる。待つのはバックグラウンドで（`run_in_background`）。

```
for i in $(seq 1 40); do curl -s "https://caffilia-jkwzvlbc7.kate108superstar.workers.dev/<版>/version.js?t=$i" | grep -q '<控えた publishedAt>' && { echo "LIVE"; exit 0; }; sleep 15; done; echo "NOT LIVE"; exit 1
```

見るのは `version.js` か `/<版>/`。`/<版>/index.html` は `/<版>/` へ転送（307）されて中身が空なので、そこを grep しても出たと分からない。

出たら内蔵ブラウザで `/<版>/` を開き、次を見る。

- 題字の画面が出る。コンソールにエラーがない。
- `/api/all` が `{"ok":true,...}` と答える（みんなのステージ・展示の並びの置き場所）。

10分たっても出なければ、Cloudflare の画面を見てもらうよう伝える。

## 5. 伝える

短く。版・時刻・URL・publish のコミットだけ。

```
最新版を公開しました（10/31 11:11、publish e45fa00）
https://caffilia-jkwzvlbc7.kate108superstar.workers.dev/latest/
```

## やらないこと

- `publish/` のファイルを手で書きかえない（`tools/publish.js` が毎回作り直す）。
- モック側のリポジトリは push しない（公開と関係がない）。
- 公開を、頼まれていないのに自分から行わない。外に出る操作なので、オーナーが頼んだときだけ。
