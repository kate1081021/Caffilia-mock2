/*
 * lab_power.js — 試作ラボ LAB_M「強化の方向（3つ）とミッション」のデータ。データだけ（処理は lab_rules.js の「M」の節）。
 * ブラウザでは グローバル変数 LAB_POWER、node では module.exports で読める。
 * 元: オーナーの「強化の材料まとめ（2026-10-15）」（.claude/lab/LAB_M_power.md）。仕分け・名前・数はすべて【仮】。
 *
 * 3つの方向（作るの方向は作らない。作る系のミッションは方向を持たず、M4 で単純強化か目印）
 *   decide 決める（攻）／stop 止める（守）／move 動かす（走）／make 作る系（方向なし）
 *
 * ミッションの形（lab_targets.js と同じ。no は材料まとめの番号）
 *   id・no・dir・name・text・check・taker（省略は hand）・needsGrow／needsVillage／needsCarry
 *   check.kind は lab_rules.js の L と M の judge が見る。end: true は勝ったときに決まるミッション
 *
 * 変化先（FORMS）: 属性 → 方向 → { name, mark, prop, lv2: { name, mark } }
 *   1段目（変化）で prop の性質を持つ（レベル1）。2段目（覚醒）でレベル2（1段強く・長く）。性質は PROPS
 *   環境の変え方とシナジーは元の魔法のまま（変化先の魔法の動詞とシナジーは未決）
 */
(function (root) {
  var DIRS = {
    decide: { name: '決める', mark: '決', color: '#d24a3c', power: '攻', desc: '敵を倒す力（決め手・倒す）' },
    stop:   { name: '止める', mark: '止', color: '#3d73c9', power: '守', desc: '敵の手を止める・守る力（足止め・予告を潰す・守る）' },
    move:   { name: '動かす', mark: '動', color: '#8b5cf6', power: '走', desc: '位置と向きを変える力（押す・引く・向きを変える・自分が動く）' },
    make:   { name: '作る系', mark: '作', color: '#8a8f86', power: '', desc: '方向を持たないミッション（作ることは最初から全部できる）。取ると単純強化か、目印だけ（M4）' }
  };
  var DIR_ORDER = ['decide', 'stop', 'move'];   // 方向（作る系は入らない）
  var LIST_ORDER = ['decide', 'stop', 'move', 'make'];

  var TAKERS = {
    hand: '達成の一手を撃った魔法', maker: '変えられた自然を作った魔法', stopper: '止めた魔法', mover: '動かした魔法',
    helper: '材料を作った味方か、その敵を動かした味方', last: '決着の一手を撃った魔法', still: '1度も歩かなかった仲間',
    carrier: '運んだ仲間', blocker: '道をふさいだ魔法'
  };

  // ミッション（41）【仮】の仕分け。画面の「ミッションの仕分け」で変えられる
  var MISSIONS = [
    // ---- 決める ----
    { no: 1, id: 'finKill', dir: 'decide', name: '決め手で倒す', text: '決め手で敵を倒す', check: { kind: 'finKill' } },
    { no: 2, id: 'finTwo', dir: 'decide', name: '1つの決め手で2体', text: '1つの決め手で、敵2体以上に当てる', check: { kind: 'finHitsOne', n: 2 } },
    { no: 3, id: 'finChain', dir: 'decide', name: '決め手の連鎖', text: '決め手から決め手へ連鎖させる（1つの手で決め手が2つ以上）', check: { kind: 'finChain', n: 2 } },
    { no: 4, id: 'finTurn2', dir: 'decide', name: '1ターンに決め手2つ', text: '1ターンのうちに、味方の手で決め手を2つ起こす', check: { kind: 'finTurn', n: 2 } },
    { no: 5, id: 'fin3', dir: 'decide', name: '3段のシナジー', text: '3段のシナジー（変わった自然をさらに壊す決め手）を起こす', check: { kind: 'fin3' } },
    { no: 6, id: 'kill', dir: 'decide', name: '敵を1体倒す', text: '敵を1体倒す（手は問わない）', check: { kind: 'kill' } },
    { no: 8, id: 'lastFin', dir: 'decide', name: '最後の1体を決め手で', text: '最後の1体を、決め手で倒す', check: { kind: 'lastFin' } },
    { no: 9, id: 'farFin', dir: 'decide', name: '離れた所で決め手', text: '撃ったマスから4マス以上離れた所で、決め手が起きる', check: { kind: 'farFin', dist: 4 } },
    { no: 10, id: 'bigFin', dir: 'decide', name: '5マスの自然を決め手に', text: '5マス以上つながった自然を、まとめて決め手にする', check: { kind: 'bigFin', n: 5 } },
    { no: 12, id: 'enemyNatFin', dir: 'decide', name: '敵の自然で決め手', text: '敵が作った自然を使って、決め手を起こす', check: { kind: 'enemyNatFin' } },
    { no: 13, id: 'enemyFinKill', dir: 'decide', name: '敵の決め手で倒す', text: '敵の決め手で、別の敵を倒す', check: { kind: 'enemyFinKill' }, taker: 'helper' },
    { no: 37, id: 'allThree', dir: 'decide', name: '3人の決め手', text: '3人全員の魔法が関わった決め手を起こす', check: { kind: 'allThree' } },
    { no: 38, id: 'turnWin', dir: 'decide', name: '3ターン以内に勝つ', text: '3ターン以内に勝つ', check: { kind: 'turnWin', turns: 3, end: true }, taker: 'last' },
    // ---- 止める ----
    { no: 7, id: 'killBefore', dir: 'stop', name: '予告の前に倒す', text: '予告している敵を、その予告が起きる前に倒す', check: { kind: 'killBefore' } },
    { no: 16, id: 'held', dir: 'stop', name: '敵が動けなかった', text: '敵が自分の番に動けなかった（泥沼・凍結・蔓・囲まれた、など理由は問わない）', check: { kind: 'held', turns: 1 }, taker: 'stopper' },
    { no: 17, id: 'held2', dir: 'stop', name: '2ターン続けて止める', text: '同じ敵を2ターン続けて、自分の番に動けなくする', check: { kind: 'held', turns: 2 }, taker: 'stopper' },
    { no: 18, id: 'heldFin', dir: 'stop', name: '止めた敵を巻き込む', text: '足が止まっている敵を、決め手に巻き込む', check: { kind: 'heldFin' }, taker: 'stopper' },
    { no: 26, id: 'foiled', dir: 'stop', name: '予告の決め手を潰す', text: '敵が予告した決め手が起きなかった', check: { kind: 'foiled' } },
    { no: 28, id: 'rescue', dir: 'stop', name: '予告から味方を出す', text: '敵の予告の範囲にいた味方を、魔法で範囲の外へ出す', check: { kind: 'rescue' } },
    { no: 29, id: 'neverShot', dir: 'stop', name: '1度も撃たせずに倒す', text: '1度も魔法を撃てなかった敵を倒す', check: { kind: 'neverShot' } },
    { no: 36, id: 'noLoss', dir: 'stop', name: '誰も倒されずに勝つ', text: '味方が誰も倒されずに勝つ', check: { kind: 'noLoss', end: true }, taker: 'last' },
    { no: 39, id: 'villagesSafe', dir: 'stop', name: '村を守り切る', text: '村を1つも壊されずに勝つ', check: { kind: 'villagesSafe', end: true }, taker: 'last', needsVillage: true },
    // ---- 動かす ----
    { no: 14, id: 'redirect', dir: 'move', name: '予告を別の敵に', text: '動かした（向きを変えた）敵の予告が、別の敵に当たる', check: { kind: 'redirect' }, taker: 'mover' },
    { no: 19, id: 'push2', dir: 'move', name: '敵を2マス動かす', text: '1つの手で、敵を2マス以上動かす', check: { kind: 'push', n: 2 } },
    { no: 20, id: 'pushInto', dir: 'move', name: '泥沼・森・川へ', text: '敵を泥沼・森・川（立てる水: 水たまり・葦原）の中へ動かし入れる', check: { kind: 'pushInto' } },
    { no: 21, id: 'bump', dir: 'move', name: '敵を敵にぶつける', text: '動かした敵を、別の敵にぶつける（押した先に別の敵がいて止まる）', check: { kind: 'bump' } },
    { no: 22, id: 'gather', dir: 'move', name: '2体を隣り合わせに', text: '動かして、2体以上の敵を隣り合わせに集める', check: { kind: 'gather' } },
    { no: 23, id: 'lower', dir: 'move', name: '高い所から下ろす', text: '丘の上にいた敵を、丘の上から下ろす（動かす・丘を崩す）', check: { kind: 'lower' } },
    { no: 24, id: 'blocked', dir: 'move', name: '予定の道をふさぐ', text: '敵が予定していた行き先（D2 の矢印）への道をふさいで、通れなくする', check: { kind: 'blocked' }, taker: 'blocker' },
    { no: 25, id: 'edge', dir: 'move', name: '端まで追い込む', text: '敵を、盤面の端のマスまで動かす', check: { kind: 'edge' } },
    { no: 27, id: 'turnIntent', dir: 'move', name: '予告の向きを変える', text: '敵の予告の向きを変えさせる', check: { kind: 'turnIntent' } },
    { no: 40, id: 'carry', dir: 'move', name: '宝・馬車を運ぶ', text: '宝や馬車を、目的の場所まで運ぶ', check: { kind: 'carry', end: true }, taker: 'carrier', needsCarry: true },
    { no: 41, id: 'noWalk', dir: 'move', name: '歩かずに勝つ', text: '1度も歩かなかった仲間がいるまま勝つ（魔法で運ばれるのは歩いたうちに入らない）', check: { kind: 'noWalk', end: true }, taker: 'still' },
    // ---- 作る系（方向なし） ----
    { no: 11, id: 'enemyChange', dir: 'make', name: '敵に変えさせる', text: '敵の魔法で、こちらの作った自然を別の自然に変えさせる', check: { kind: 'enemyChange' }, taker: 'maker' },
    { no: 15, id: 'overwrite', dir: 'make', name: '敵の自然を上書き', text: '敵の作った自然を上書きして、こちらの自然にする', check: { kind: 'overwrite' } },
    { no: 30, id: 'chain5', dir: 'make', name: '同じ自然を5マス', text: '同じ自然を5マス以上つなげる', check: { kind: 'chain', n: 5 } },
    { no: 31, id: 'twoStage', dir: 'make', name: '二段に育てる', text: '自然を二段に育てる（草むら → 森、丘 → 山 など）', check: { kind: 'twoStage' }, needsGrow: true },
    { no: 32, id: 'kinds3', dir: 'make', name: '3種類の自然', text: '味方の作った自然を、盤面に3種類出す', check: { kind: 'kinds', n: 3 } },
    { no: 33, id: 'waterDown', dir: 'make', name: '高い所から水を流す', text: '高い所から低い所へ水を流す（丘の上から水を撃つ・山や丘に水を当てて川にする）', check: { kind: 'waterDown' } },
    { no: 34, id: 'half', dir: 'make', name: '盤面の半分を自然に', text: '盤面の半分以上を自然にする', check: { kind: 'half' } },
    { no: 35, id: 'nextTo', dir: 'make', name: '敵の隣に自然', text: '敵の隣のマスに自然を作る', check: { kind: 'nextTo' } }
  ];

  // 3段のシナジー（変わった自然を、さらに壊す決め手）。2段目までは現実の災害、3段目は超常の必殺技（CLAUDE.md 3章）
  var STAGE3 = ['センタクキ', 'オバケヤシキ', '桜吹雪', '花筏', '水蒸気爆発', '粉塵爆発', 'かまいたち', '火の粉', '火炎竜巻'];

  // 性質（変化先が持つもの。材料まとめの「変化した魔法が持てる性質の候補」の番号）。t1 レベル1（変化）、t2 レベル2（覚醒）
  var PROPS = {
    wound:     { no: 12, name: '傷',         t1: '当たった者は傷を負う（ターン終了ごとに2ダメージ、2回）', t2: '傷が3回に長くなる' },
    pierce:    { no: 20, name: '貫く',       t1: '人のいるマスを貫いて、その奥の1マスにも届く', t2: '奥の2マスまで届く' },
    untilHit:  { no: 21, name: '当たるまで', t1: '何かに当たるまで流れる（池の長さで止まらない）', t2: '人も貫いて流れ続ける' },
    boost:     { no: 14, name: '大きくする', t1: '当たった者の、次の魔法の形が2マス大きくなる', t2: '4マス大きくなる' },
    hold:      { no: 1,  name: '足止め',     t1: '当たった者は、次の移動ができない', t2: '2回続けて移動できない' },
    guard:     { no: 13, name: '守る',       t1: '当たった者は、相手の次の攻撃を1回防ぐ（味方に当てれば味方を、敵に当てれば敵を守る）', t2: '2回防ぐ' },
    delay:     { no: 3,  name: '遅らせる',   t1: '当たった敵の予告が1ターン遅れる（その場で構えたまま、次のターンに撃つ）', t2: '2ターン遅れる' },
    cancel:    { no: 4,  name: '予告を消す', t1: '当たった敵の予告が消える', t2: '予告が消え、次の移動もできない' },
    pull:      { no: 10, name: '引き寄せる', t1: '当たった者を、術者のほうへ1マス引き寄せる', t2: '2マス引き寄せる' },
    push:      { no: 9,  name: '押す',       t1: '当たった者を、魔法の向きへ1マス押す', t2: '止まるまで押す' },
    turn:      { no: 7,  name: '向きを変える', t1: '当たった者の向きが、魔法の向きに変わる（予告の向きも変わる）', t2: '向きが変わり、次の移動もできない' },
    lure:      { no: 8,  name: '術者を向かせる', t1: '当たった敵の予告が、術者のほうを向く', t2: '術者のほうを向き、次の移動もできない' },
    moveAfter: { no: 15, name: '撃ったあと動く', t1: '撃ったあと、術者が1マス動ける（撃たずに「待機」で動く）', t2: '2マス動ける' },
    silence:   { no: 5,  name: '撃たせない', t1: '当たった敵は、次のターン魔法を撃てない（予告を出せない）', t2: '2ターン撃てない' }
  };

  // 変化先【仮】（1段目 → 2段目の覚醒）。印は駒に出す1文字
  function f(name, mark, prop, n2, m2) { return { name: name, mark: mark, prop: prop, lv2: { name: n2, mark: m2 } }; }
  var FORMS = {
    grass:   { decide: f('茨', '茨', 'wound', '千本茨', '千'),   stop: f('蔓縛り', '蔓', 'hold', '茨の牢', '牢'),     move: f('手繰り蔓', '手', 'pull', '大樹の腕', '腕') },
    earth:   { decide: f('岩槍', '槍', 'pierce', '大岩槍', '岩'), stop: f('城壁', '壁', 'guard', '大城壁', '城'),      move: f('地鳴り', '鳴', 'push', '大地鳴動', '轟') },
    water:   { decide: f('奔流', '奔', 'untilHit', '大瀑布', '瀑'), stop: f('大波', '波', 'delay', '津波', '津'),     move: f('早瀬', '瀬', 'turn', '激流', '激') },
    fire:    { decide: f('業火', '業', 'wound', '劫火', '劫'),   stop: f('炎の壁', '炎', 'cancel', '炎獄', '獄'),     move: f('狐火', '狐', 'lure', '鬼火', '鬼') },
    wind:    { decide: f('追い風', '追', 'boost', '天つ風', '天'), stop: f('向かい風', '向', 'hold', '颪', '颪'),      move: f('疾風', '疾', 'moveAfter', '烈風', '烈') },
    thunder: { decide: f('落雷', '落', 'pierce', '轟雷', '雷'),  stop: f('雷縛り', '縛', 'silence', '雷獄', '獄'),   move: f('稲妻', '稲', 'moveAfter', '迅雷', '迅') },
    ice:     { decide: f('氷柱', '柱', 'wound', '氷槍', '氷'),   stop: f('凍土', '凍', 'hold', '永久凍土', '永'),     move: f('氷の道', '道', 'push', '氷河', '河') },
    dark:    { decide: f('宵闇', '宵', 'pierce', '深闇', '深'),  stop: f('影縛り', '影', 'hold', '影縫い', '縫'),     move: f('闇の手', '手', 'pull', '深淵', '淵') }
  };
  // 見え方の一言（性質が起きたときの言葉。属性の動詞に合わせる）
  var FLAVOR = {
    wound: { grass: '棘が刺さった', fire: '炎が体に残った', ice: '氷の棘が刺さった' },
    hold: { grass: '足に蔓が絡んだ', wind: '向かい風で足が止まった', ice: '足が凍りついた', dark: '影に足を縫いとめられた' },
    pull: { grass: '蔓に手繰り寄せられた', dark: '闇の手に引き寄せられた' },
    push: { earth: '盛り上がる大地に押し出された', ice: '氷の上を押し出された' }
  };

  // M1 two: 属性ごとに2つの方向【仮】（どの方向も2つ以上の属性が持つ）
  var TWO = { grass: ['stop', 'move'], earth: ['stop', 'move'], water: ['decide', 'move'], fire: ['decide', 'stop'], wind: ['decide', 'move'],
    thunder: ['decide', 'stop'], ice: ['stop', 'move'], dark: ['decide', 'move'] };

  // L6 クエスト（M の方向で）。方向ごとのミッションの出しやすい順
  var QUEST_POOL = {
    decide: ['finKill', 'kill', 'finTwo', 'lastFin', 'farFin', 'finChain'],
    stop: ['held', 'killBefore', 'foiled', 'rescue', 'noLoss', 'heldFin'],
    move: ['push2', 'pushInto', 'redirect', 'gather', 'edge', 'bump'],
    make: ['chain5', 'nextTo', 'kinds3', 'twoStage', 'half', 'overwrite']
  };
  var QUEST_NAME = { decide: '討伐', stop: '守り', move: '誘導', make: '開拓' };
  var QUEST_ORDER = ['decide', 'stop', 'move', 'make'];

  // M5 強化の候補（まだ判定していないもの・覚醒でできるようになるかもしれないもの）。エディットで人に付けて試す
  var CANDS = [
    { id: 'power', group: 'undecided', name: '直撃の威力', text: '直撃の威力が上がる（+2）' },
    { id: 'effect', group: 'undecided', name: '効き目が1段強く', text: '魔法がもともと持っている、当たった者への効き目が1段強く・長くなる（風の運ぶ・闇の引き寄せ・火の火傷、変化先の性質）' },
    { id: 'standOn', group: 'undecided', name: '足場で形が増える', text: '決まった自然の上に立って撃つと、形が2マス増える（草: 森・草むら／土: 丘／水: 立てる水／火: 炎のそば／風: 風の上 など）' },
    { id: 'linger', group: 'undecided', name: 'もう1ターン残る', text: '1ターンで消える自然（風・強風・小さな炎・花びら）が、もう1ターン残る' },
    { id: 'silence', group: 'undecided', name: '次のターン撃てない', text: '当たった敵は、次のターン魔法を撃てない' },
    { id: 'guard', group: 'undecided', name: '攻撃を1回防ぐ', text: '当たった者は、相手の次の攻撃を1回防ぐ' },
    { id: 'twice', group: 'undecided', name: '2回撃てる', text: '1ターンに2回撃てる（そのぶん形は半分。2回目は動けない）' },
    { id: 'trap', group: 'undecided', name: '置いておく', text: '撃つと形のマスに置いておき、人が入ったときに発動する（敵でも味方でも）' },
    { id: 'pierce', group: 'undecided', name: '貫く', text: '人を貫いて、その奥の1マスにも届く' },
    { id: 'skip', group: 'undecided', name: '手前を飛ばす', text: '手前の1マスを飛ばして、離れた所から形が始まる' },
    { id: 'hold', group: 'awaken', name: '次の移動を止める', text: '当たった者の次の移動を止める' },
    { id: 'cancel', group: 'awaken', name: '予告を消す', text: '当たった敵の予告を消す' },
    { id: 'delay', group: 'awaken', name: '予告を遅らせる', text: '当たった敵の予告を1ターン遅らせる' },
    { id: 'shrink', group: 'awaken', name: '形を小さく', text: '当たった者の、次の魔法の形が小さくなる（1マスだけ）' },
    { id: 'moveAfter', group: 'awaken', name: '撃ったあと動ける', text: '撃ったあとでも1マス移動できる' },
    { id: 'leap', group: 'awaken', name: '撃った先へ移る', text: '撃ったあと、形の一番奥の立てるマスへ術者が移る' }
  ];
  // 決まった自然（standOn）: 属性ごとに、立つと形が増える自然
  var STAND_ON = {
    grass: ['forest', 'thicket', 'deepforest'], earth: ['hill', 'hillsakura'], water: ['puddle', 'reeds'], fire: ['smallfire', 'fire'],
    wind: ['breeze', 'gale'], thunder: ['hill', 'hillsakura'], ice: ['ice'], dark: ['deadforest']
  };

  var api = { DIRS: DIRS, DIR_ORDER: DIR_ORDER, LIST_ORDER: LIST_ORDER, TAKERS: TAKERS, MISSIONS: MISSIONS, STAGE3: STAGE3,
    PROPS: PROPS, FORMS: FORMS, FLAVOR: FLAVOR, TWO: TWO, QUEST_POOL: QUEST_POOL, QUEST_NAME: QUEST_NAME, QUEST_ORDER: QUEST_ORDER,
    CANDS: CANDS, STAND_ON: STAND_ON };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LAB_POWER = api;
})(this);
