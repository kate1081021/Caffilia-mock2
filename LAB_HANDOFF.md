# 試作ラボの引き継ぎ（LAB_HANDOFF）

別の会話（Claude Code）が続きを進めるためのメモ。最初にこれと `LAB_PROGRESS.md` を読む。

## 頼まれていること（オーナー、10/13）

- 指示書 `.claude/lab/LAB_00_base.md` 〜 `LAB_K_time.md` を、LAB_00 の「5. 進める順番」どおりに全部実装する。
  - 順番: 00 → C → A → D → E → G → H → F → B → I → K → J。
- 質問しない。止まらない。あいまいな所は一番シンプルな解釈で決めて、`DECISIONS.md` に「ラボ:」として書く。
- 時間をかけてよい。きっちり。うまくいかなかった所は、オーナーがあとで直す。
- 作業は `lab` ブランチだけ。main・grow には戻さない。公開（`tools/publish.js`）はしない。
- 展示用のチュートリアル・ステージ・シナリオ・デモには触らない。

## 今の状態（10/13 夜）

- **10/16 夕: N の進行をクエスト制にした（NQ）。** 元は NOTES の「強化とクエスト」（オーナー 10/16）。データと進み方 `lab_quest.js`、拠点の画面 `lab_quest_ui.js`（上のバーの「N クエスト」・`index.html#q`）。戦闘はクエストごとに盤面の写し `labQ_<id>` を LAB_PRESETS に足して読む（H1 周回と同じやり方）。育ちの画面に「拠点に戻る」（lab_target_ui.js）。lab_rules.js は1か所（`s.labTargetCount`: クエストが決めたミッションの数）。N の連戦（labNs・labNq）はなくした。決めたことは `DECISIONS.md` の「ラボ N クエスト制」。
- **10/16: LAB_N（強化と変化）を足した。** 元はオーナーの「強化と変化のまとめ（10/16）」（`.claude/強化と変化のまとめ_20261016.md`）。データ `lab_change.js`、ルールは lab_rules.js の「N」の節（M の土台の上。N0 がオンのあいだ道が N の形に替わる。変化した魔法は castMore の先頭、覚醒先の自然は `s.labAwk` の印）、画面は lab_target_ui.js の N の描き分けと ui.js の `LX.awkTile`（覚醒先の自然のマスの金の縁）。rules.js は触っていない。ミッションの仕分けの確かめは `node tests/lab_nsort.js [盤面…] --pairs`。確かめ方のガイドは `lab_n_guide.js`（上のバーの「N 確認ガイド」・`index.html#n`）。状態は `LAB_PROGRESS.md` の「N」、気づきは `LAB_REPORT.md` の「N」、決めたことは `DECISIONS.md` の「ラボ N」。`lab-n` ブランチ。
- **10/15: LAB_M（強化の方向は3つ・41のミッション）を足した。** 元はオーナーの「強化の材料まとめ（2026-10-15）」。指示書は `.claude/lab/LAB_M_power.md`（材料まとめを、仮の仕分けつきで書き起こしたもの）。データ `lab_power.js`、ルールは lab_rules.js の「M」の節（L0 の土台の上で、M0 がオンのあいだ L の道の関数が M の形に替わる）、画面は lab_target_ui.js の M の描き分け（ミッションの仕分けの画面も）。rules.js の差し込み口を3つ足した（`LX.onResult`・`LX.keepTile`・`LX.passUnit`）。状態は `LAB_PROGRESS.md` の「M」、気づきは `LAB_REPORT.md` の「M」、決めたことは `DECISIONS.md` の「ラボ M」。
- **10/15 夜: オーナー判断（草は決め手でなくてよい・道はクリアで進む・育つが前提）を入れ、L6 クエストで方向を選ぶ（クエスト連戦 labLq1〜4）・LE 覚醒を敵が先に見せる（labLE）・覚醒した駒の印を足した。**
- **10/15: LAB_L2（方向を 作る・決める・止める・動かす に組み直す。10/15 追記の作るの覚醒 森・山・川 も）を足した。** 指示書はオーナーがチャットで渡した `LAB_L2_direction.md`。状態は `LAB_PROGRESS.md` の「L2」、気づきは `LAB_REPORT.md` の「L2」、決めたことは `DECISIONS.md` の「ラボ L2」。新しいシナリオは「ラボ: ターゲット 動かす」（labLM）と、作り直した「草の道（森か茨の牢か）」（labLP）。連戦は4戦（labLs1〜4）。LAB_L と同じく、まだコミットしていない。
- **10/14: LAB_L（ターゲットで育つ）を足した。** 指示書は `.claude/lab/LAB_L_target.md`。ターゲット `lab_targets.js`・道 `lab_paths.js`・画面 `lab_target_ui.js`、ルールは lab_rules.js の「L」の節。rules.js の差し込み口は `LX.planStart`（敵の番の始め）・`LX.afterPlan`（予告が出そろったあと）・`LX.afterAct`（味方が1人動いたあと）・`LX.spreadBonus`・`LX.plantLike`（大樹）・`LX.formName`（覚醒した名前）。オーナーの未コミットの作業（見て判定）と同じファイルを触ったので、コミットはしていない。

- **LAB_00〜LAB_K を全部作った**（判定パネルの123枚すべて「未実装」なし）。案ごとの状態は `LAB_PROGRESS.md`、気づきは `LAB_REPORT.md`（最後に「全体を通して」）、決めたことは `DECISIONS.md` の「試作ラボ」の節。
- オーナーの割り込み（10/13）: 「味方に魔法を当てたとき、足元に自然が残らないのは違和感」→ 標準のルールとして `ideas.natureUnderUnits`（初期値 true）を入れた。草・土・水を人に当てると、立てる自然なら足元にもできる（敵にも同じ）。影響で2つのデモ（燃え広がり・護衛）を差し替え、`tests/snapshot.js` の記録を取り直した。
- 次: オーナーが判定パネルで判定する。直す・捨てる案は、`lab_rules.js` の関数と rules.js の `LX.…` の差し込み口を探す。
- 周回（H1）は `lab_run.js`（戦闘の外の画面）。
- テスト: run.js 275件・scenarios.js・lab.js 284件・tune.js・snapshot 8561件 すべて通る。

## ファイルの分け方

| ファイル | 中身 |
|---|---|
| `balance.js` の `lab` | 案ごとの切り替え（`{ on: false, …数値 }`）。初期値はすべてオフ。案を足したらここに足す |
| `lab_rules.js` | 案の処理の本体。`bind(I)` で rules.js の道具を受け取って、関数を返す |
| `rules.js` | `lab('XX')` を見て `LX.…` を呼ぶ差し込み口だけ。新しい差し込み口が要るときだけ触る |
| `lab_cards.js` | 判定パネルのカード（全123案）。`scen` にシナリオ id、`needs`、`opts`（文字の切り替え）、`params`（数値） |
| `lab_scenarios.js` | ラボ用シナリオ（`lab: ['XX']`・`labOpts`・`overrides`・`enemyActs: false`・`demo`）。敵・味方の4つ目の `lab: {…}` はユニットに足す項目 |
| `lab_ui.js` | 判定パネル・上のバー（G8 の次の戦いへ・J7・J8 のボタンも）。ui.js の `app.loadScenario`・`app.playLabDemo` などを使う |
| `lab_run.js` | H1 周回のミニ版の画面（パーティ → 道 → 戦闘 → 強化 → … → 結果） |
| `tests/lab.js` | 案のテスト（オン／オフ）＋全ラボ用シナリオの読み込み＋デモの再生と `expect` |

### lab_rules.js にすでにある差し込み口

続きの案は、ここに関数を足せば rules.js を触らずに済むことが多い。

- `castMore`: 新しい魔法・撃ち方（I の新しい魔法、G4 融合、G7 まとう、F7 作業台）
- `afterShotMore`: 撃ったあと（G7 まとう、I1 照らす）
- `placeMore`: 置く・点ける魔法の1マスの作用（B の組み合わせ）
- `darkExtra`: 闇の1マスの作用（B13・B19・B20）
- `originMore`・`cellsMore`・`confMore`: 魔法の起点・形・ユニットの数値（F1・F3・G2・G3・G6）
- `hitMore`: ダメージの決まり
- `afterMoveMore`: 移動のあと
- `cannotMore`・`enclose`: 予告できない（E9）
- `decoyList`: E2 偽の姿（D1「逃げる」がもう参照している）
- `touchFireExtra`・`pillarNet`: B・I8 用

ほかに rules.js 側にある差し込み口:

- `LX.castMagic`: shoot の最初
- `LX.placeCell`
- `LX.hidden`
- `LX.reach`: 移動の探し方。氷・追い風・大きい敵など
- `LX.planEnemy`: 敵の手の選び方
- `LX.nextPaths`: forecast の `labPaths`
- `LX.onSetTile`
- `LX.filterHit`・`LX.beforeApply`: ダメージ
- `LX.catchesFire`・`LX.spreadsFire`: 燃え移り
- `LX.useLabShock`・`LX.useLabDark`
- `waterTile`（葦原・飛び石も水として数える）

「ラボの自然」（葦原 e・底なし沼 n・砂嵐 S・霜 f・暗がり y・深い森 Z・氷の壁 J・雪山 N・灰 a・岩 r・飛び石 t・蔓の橋 v・金の柱 l）は、lab_rules.js が `TILE_INFO` とシナリオの文字 `CH` に足す。エディットの自然の並び（`TILES`）には入れていない。

## 守ること

- **全部オフなら今と同じ。** 盤面の状態（`s`・ユニット）に新しい項目を足すのは、案がオンのときだけにする。足すと `tests/snapshot.js` の記録とずれる。
- 変えたら次を全部通す。
  - `node tests/run.js`（275件）
  - `node tests/scenarios.js`
  - `node tests/lab.js`
  - `node tests/tune.js`
  - `node tests/snapshot.js`（記録と同じ 8561件）
  - すべての .js に `node --check`
- 画面は `.claude/.claude/launch.json` の「mock」（`tests/serve.js`、http://localhost:8765）と内蔵ブラウザで確かめる。最初に出る遊び方のダイアログは `document.getElementById('howto').hidden=true` で閉じられる。
- 1カテゴリ終わるごとに、次の順で済ませる。
  1. `LAB_PROGRESS.md`・`LAB_REPORT.md`・`DECISIONS.md` を更新する
  2. コミットする（日本語のメッセージ。末尾に Co-Authored-By）

## 道具

- `node tests/lab_show.js <シナリオid> [P1:x,y:向き[:wait] … T]`: 盤面を文字で出して、手を打つ（T はターン終了）。シナリオとデモを作るときに使う。
- `node tests/lab_try.js <シナリオid> <決め手名> [数] [前の手…]`: 1ターン分の全部の手から、その決め手で敵が倒れる手順を探す。
  - `LOSS=1` で1人まで倒れてよい。
  - `LABOFF=XX` でその案だけオフ。
- `node tests/lab_search.js <シナリオid> [ターン] [幅]`: ビームサーチで勝ち筋を探す。

## 詰まった所（同じ失敗をしないために）

- **Windows の python3 で `open(..., 'w')` すると改行が CRLF になる。** `newline=''` を付けるか、Edit ツールを使う。
- **Bash の1回の呼び出しに、ヒアドキュメント（`<<'EOF'`）を2つ以上入れると、ときどき「unexpected EOF」で全体が実行されない。** 長い中身は Write ツールでファイルに書いてから、スクリプトに渡す。
- **python から `/tmp/...` は見えない。** 引数で渡したパスは、git bash が変換してくれる。
- **ui.js の `loadScenario` は、盤面を作る前にラボの切り替えを決める。** 大きい敵の `size: 'D3'` は、切り替えで大きさが変わるため。
- **デモの id は、シナリオの allies の順に P1・P2・P3、enemies は E4 から。**
- デモは味方3人が行動すると、自動でターン終了する（tests/lab.js も同じ）。

## 残りの案で、先に考えておいたこと

- **E2 偽の姿**: 偽の姿は `s.units` に入れない。計算は2か所ですでに足場がある。
  - 狙い: `planEnemy`・`trialShot` で、形のマスに偽の姿の場所が入ったら、味方に当たったと数える。
  - 逃げる敵: `decoyList(s)` → `[{ at: [x, y] }]` を返す。
- **E9**:
  - 閉じこめられる場所: オバケヤシキ・火の渦・底なし沼のマス。
  - 敵は `cannotMore` で予告を消す。
  - 味方は act で「撃てない」。
  - 閉じこめた瞬間に出ていた予告は、`enclose(s, o, ev)` で消す。
- **G 強化**: ユニットに `boosts: [...]` を持たせる。G4・G5・G7 は「1マスに魔法が当たったときの作用」が要る（C6 の `touchFire` と同じ形で、水・風・草・土の版を作る）。
- **H1 周回**: 戦闘の外の画面。ui.js 側に作る。強化の3択は乱数（戦闘の外だけ。カードに書いてある）。
- **K1 時間なし**: `timePasses` の中で、燃え移り・燃え尽き・消える／やむ を止める。炎の上と火傷のダメージは残す。
