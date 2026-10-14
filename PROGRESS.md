# 進捗（PROGRESS）— 一斉発動・チュートリアル3つ・文章

仕様: `.claude/IMPROVE_simul.md`（10/17 の展示に向けて）。ブランチ `simul`（grow から。main・lab には入れない）。

- [x] 1. ブランチ（grow から simul。lab の作業ツリーには触らず worktree で）
- [x] 2. ターンの形の切り替え（上のバー。初期値は一斉、localStorage に覚える）
- [x] 3. 一斉発動のルール（構え・構え直し・並べ替え・構えた順に発動・合体・予測は全部起きたあと）
- [x] 4. 一斉発動の画面（構えの印と番号・発動の順番の一覧 ▲▼・発動ボタン・1人ずつ間をあけて見せる・決め手をつなぐ・合体の帯）
- [x] 5. チュートリアル①②を一斉でも（構える味方は最初から構え、いつも最後。ヒントは形ごと）
- [x] 6. チュートリアル③「3人で合わせる」（配置の探索 `tests/tut3_search.js`・デモ）
- [x] 7. texts.js（名前・目標・場面・ヒント・クリアと負け・決め手の表示名・合体・操作の案内）と texts_io.js
- [x] 8. 会話の窓（きっかけ・次へ・✎）と文章パネル（ステージ → きっかけ → 文、場面を流す、保存・ダウンロード・書き出す・捨てる、未保存）
- [x] 9. テスト（`tests/simul.js`）と、くらべる記録（`tests/simul_compare.js`）
- [x] 10. 内蔵ブラウザで確かめる（パソコンとスマホの幅、コンソールエラーなし）
- [x] 11. REPORT・DECISIONS・PROGRESS

## 遊び方（オーナー向け）

- `index.html` をダブルクリック（このフォルダ: `.claude/worktrees/simul/`）。または `node tests/serve.js 8766` → http://localhost:8766
- 上のバー「ターンの形」で 一斉に発動／1人ずつ。「チュートリアル ▾」から ①②③。
- 「文章」で文を書き換える →「保存」（最初の1回だけリポジトリの texts.js を選ぶ）。

## テスト

- `node tests/run.js`（273件）・`node tests/scenarios.js` … 1人ずつで今までどおり
- `node tests/simul.js`（56件）… 一斉・チュートリアル3つを両方の形で・文章
- `node tests/tut3_search.js` … チュートリアル③の勝てる手と、外したあとの立て直し
- `node tests/simul_compare.js` … 両方の形をくらべる数（REPORT に載せた）
