/*
 * lab_targets.js — 試作ラボ LAB_L のターゲット（戦闘の中のサブクエスト・ミッション）。データだけ。
 * ブラウザでは グローバル変数 LAB_TARGETS、node では module.exports で読める。
 *
 * 4つの方向（LAB_L2 で組み直した。色と印は【仮】。ターゲットの一覧・魔法の道・予測で同じものを使う）
 *   make 作る ／ decide 決める ／ stop 止める ／ move 動かす
 *   作るは全魔法に共通の道。決める・止める・動かすは、属性ごとに1〜2つの「得意な方向」（lab_paths.js）
 *
 * ターゲットの形
 *   id      ターゲットの番号（シナリオの labState.labTargetList に並べる）
 *   dir     方向（上の4つ）
 *   name    一覧に出す名前（短く）
 *   text    表示の一言（何をすれば取れるか。結果だけを書く。どの魔法でも取れる書き方を基本にする）
 *   taker   取る魔法（省略は 'hand'）
 *             hand    達成の一手を撃った魔法（L1 の last／choose はこれにだけ効く）
 *             maker   変えられた自然を作った魔法
 *             stopper 敵の足を止めた魔法
 *             mover   敵を動かした魔法
 *   check   達成の判定。kind ごとの処理は lab_rules.js の「L ターゲット」の節
 *             chain       … この1発で変わったマスを含む、同じ自然のかたまりが n マス以上
 *             farNature   … 敵から dist マス以上離れたマスに、空きから自然を作った
 *             enemyChange … 敵の魔法で、味方が作った自然が別の自然に変わった
 *             twoStage    … 一段の自然を二段に育てた（草むら → 森、丘 → 山、水たまり → 川、風 → 強風、小さな炎 → 炎）
 *             finKill     … 決め手で敵を倒した
 *             finHits     … 1発の決め手で、敵 n 体以上に当てた
 *             finChain    … 1つの手で決め手が n 個以上（決め手から決め手へ連鎖。J4 の数え方と同じ）
 *             kill        … 敵を1体倒した（何でも）
 *             held        … 敵が自分の番に動けなかった（泥沼・凍結・蔓・囲まれた・茨の牢・閉じこめ・道の足止め）。turns: 2 で2ターン続けて
 *             foiled      … 敵が予告した決め手が起きなかった
 *             heldFin     … 足が止まっている敵を、決め手に巻き込んだ
 *             push        … 1つの手で、敵を n マス以上動かした（動く前と後の縦横の歩数）
 *             redirect    … 動かした敵の予告（その敵の魔法）が、別の敵に当たった
 *             pushInto    … 動かした敵が、泥沼・森・川（立てる水: 水たまり・葦原）の中に入った
 *             hitTile     … （ステージだけの目標）cells のマスに magic を当てた。tile があれば、当てる前にその自然だったとき
 *   needsGrow 育つ（X1）が入のときだけ出す
 *
 * ステージだけの目標は、シナリオの labTargetList に { id, dir, name, text, check, stage: true } をそのまま書く。
 * 1つのターゲットは1戦に1回だけ取れる。1つの手で複数を達成したら、それぞれ取る。
 */
(function (root) {
  var LAB_DIRS = {
    make:   { name: '作る',   mark: '作', color: '#2f9e5b', desc: '自然を作る、広げる、つなげる（全魔法に共通の道）' },
    decide: { name: '決める', mark: '決', color: '#d24a3c', desc: '決め手を起こす、敵を倒す' },
    stop:   { name: '止める', mark: '止', color: '#3d73c9', desc: '敵を止める、敵の手を潰す' },
    move:   { name: '動かす', mark: '動', color: '#8b5cf6', desc: '敵や物の位置を変える（敵の予告は位置と向きに固定なので、攻撃の落ちる場所も変わる）' }
  };
  var LAB_DIR_ORDER = ['make', 'decide', 'stop', 'move'];
  var LAB_TAKERS = { hand: '達成の一手を撃った魔法', maker: '変えられた自然を作った魔法', stopper: '止めた魔法', mover: '動かした魔法' };

  // 型（どのステージにも出せる）【仮】
  var LAB_TARGETS = [
    // 作る
    { id: 'chain5', dir: 'make', name: '同じ自然を5マス', text: '同じ自然を5マス以上つなげる', check: { kind: 'chain', n: 5 } },
    { id: 'farNature', dir: 'make', name: '敵から離れた所に自然', text: '敵から3マス以上離れたマスに自然を作る', check: { kind: 'farNature', dist: 3 } },
    { id: 'enemyChange', dir: 'make', name: '敵に変えさせる', text: '敵の魔法で、こちらの作った自然を別の自然に変えさせる', check: { kind: 'enemyChange' }, taker: 'maker' },
    { id: 'twoStage', dir: 'make', name: '二段に育てる', text: '自然を二段に育てる（草むら → 森、丘 → 山 など）', check: { kind: 'twoStage' }, needsGrow: true },
    // 決める
    { id: 'finKill', dir: 'decide', name: '決め手で倒す', text: '決め手で敵を倒す', check: { kind: 'finKill' } },
    { id: 'finTwo', dir: 'decide', name: '決め手で2体', text: '決め手で敵2体以上に当てる', check: { kind: 'finHits', n: 2 } },
    { id: 'finChain', dir: 'decide', name: '決め手の連鎖', text: '決め手から決め手へ連鎖させる（1つの手で決め手が2つ以上）', check: { kind: 'finChain', n: 2 } },
    { id: 'kill', dir: 'decide', name: '敵を1体倒す', text: '敵を1体倒す（手は問わない）', check: { kind: 'kill' } },
    // 止める
    { id: 'held', dir: 'stop', name: '敵が動けなかった', text: '敵が自分の番に動けなかった（泥沼・凍結・蔓・囲まれた、など理由は問わない）', check: { kind: 'held', turns: 1 }, taker: 'stopper' },
    { id: 'held2', dir: 'stop', name: '2ターン続けて止める', text: '同じ敵を2ターン続けて、自分の番に動けなくする', check: { kind: 'held', turns: 2 }, taker: 'stopper' },
    { id: 'foiled', dir: 'stop', name: '予告の決め手を潰す', text: '敵が予告した決め手が起きなかった', check: { kind: 'foiled' } },
    { id: 'heldFin', dir: 'stop', name: '止めた敵を巻き込む', text: '足が止まっている敵を、決め手に巻き込む', check: { kind: 'heldFin' }, taker: 'stopper' },
    // 動かす
    { id: 'push2', dir: 'move', name: '敵を2マス動かす', text: '1つの手で、敵を2マス以上動かす', check: { kind: 'push', n: 2 } },
    { id: 'redirect', dir: 'move', name: '予告を別の敵に', text: '動かした敵の予告が、別の敵に当たる', check: { kind: 'redirect' }, taker: 'mover' },
    { id: 'pushInto', dir: 'move', name: '泥沼・森・川へ', text: '敵を泥沼・森・川（立てる水: 水たまり・葦原）の中へ動かし入れる', check: { kind: 'pushInto' } }
  ];

  // L6 クエストで方向を選ぶ【仮】: 同じ盤面で、どの方向のミッションが出るかをクエストとして選ぶ。
  //   QUEST_POOL  方向ごとのミッション（出しやすい順）。クエストのミッションは、この上から2つ＋盤面のもとのミッションから別の方向を1つ（＋4つ目は3番目）
  //   QUEST_NAME  クエストの名前
  //   QUEST_LEAN  お題ごとに合う方向（防衛なら止める寄り）。お題に合うクエストを先頭に出す
  var QUEST_POOL = {
    make: ['chain5', 'farNature', 'twoStage', 'enemyChange'],
    decide: ['finKill', 'kill', 'finTwo', 'finChain'],
    stop: ['held', 'foiled', 'heldFin', 'held2'],
    move: ['pushInto', 'push2', 'redirect']
  };
  var QUEST_NAME = { make: '開拓', decide: '討伐', stop: '足止め', move: '誘導' };
  var QUEST_LEAN = { annihilate: 'decide', defense: 'stop', escort: 'move', retrieve: 'move' };   // 戦闘は決める・防衛は止める・護衛と奪取は動かす

  var api = { DIRS: LAB_DIRS, DIR_ORDER: LAB_DIR_ORDER, TARGETS: LAB_TARGETS, TAKERS: LAB_TAKERS,
    QUEST_POOL: QUEST_POOL, QUEST_NAME: QUEST_NAME, QUEST_LEAN: QUEST_LEAN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LAB_TARGETS = api;
})(this);
