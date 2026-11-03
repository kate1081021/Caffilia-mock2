# 進捗（PROGRESS）— 進行モック（クエスト制とステージ制）

仕様: `.claude/進行モック_指示書.md`。ブランチ `progress`（simul から。一斉発動・チュートリアル3つ・文章も入っている。そちらの進捗は simul ブランチの PROGRESS.md）。

- [x] 1. ブランチ（simul から progress。worktree）
- [x] 2. 中身（`progress_data.js`）: 戦闘8つ（既存の盤面＋ボス）、クエストのボード（2章）、ステージの道（6つ）、強化の方向（5魔法×2）、数
- [x] 3. 決まり（`progress.js`）: 1周の状態、ボード・道、仲間を選ぶ、戦闘の盤面（強化を重ねる）、勝ち負け、報酬（新しい魔法・強化の候補）、結果
- [x] 4. 画面（`progress_ui.js`）: タイトル、クエストボード／ステージの道、連れていく仲間、戦闘の帯、報酬、パーティ、1周の結果
- [x] 5. ui.js の入口（戦闘を始める・決着を知らせる・やり直し）と、戦闘中に道具を隠す
- [x] 6. 画面のことばを texts.js の `run` に（文章パネルの「進行モックのことば」）
- [x] 7. テスト（`tests/progress.js`）と、設計者向けの数（`tests/progress_search.js`・`tests/progress_run.js`）
- [x] 8. 内蔵ブラウザで確かめる（パソコンとスマホの幅、コンソールエラーなし）
- [x] 9. REPORT・DECISIONS・PROGRESS

## 遊び方（オーナー向け）

- `index.html` をダブルクリック（このフォルダ: `.claude/worktrees/progress/`）。または `node tests/serve.js 8767` → http://localhost:8767/#run
- 上のバーの「進行モック」→ クエスト制／ステージ制。

## テスト

- `node tests/progress.js`（21件）… 進行の決まり・盤面・最初の3人でどの戦闘も勝てる
- `node tests/run.js`（273件）・`node tests/scenarios.js`・`node tests/simul.js`（56件）… 今までのもの
- `node tests/progress_search.js` … 戦闘ごとに、どの3人なら勝てるか（自動プレイ）
- `node tests/progress_run.js` … 1周を最後まで回した長さ（自動プレイ）
