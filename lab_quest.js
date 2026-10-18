/*
 * lab_quest.js — 試作ラボ N「クエスト制」のデータと、戦闘の外の進み方（純粋な関数）。画面は lab_quest_ui.js。
 * ブラウザでは グローバル変数 LAB_QUEST、node では module.exports で読める。
 * 元: NOTES.md「強化とクエスト」10/16 オーナー「進行は連戦ではなくクエスト制にしたい」。名前・話・報酬・数はすべて【仮】。
 *
 *   クエスト1件で1戦。拠点のクエストボードから1件選び、連れていく仲間（3人）を決めて戦う。ミッションを取った魔法が育ち（N の印）、拠点に戻る。
 *   クエストは盤面（お題）とミッションを組で持つ。受ける前に、戦い・ミッション（育ちやすい方向）・報酬・おすすめの魔法が見える。
 *   区切りは章。その章のキークエストを全部クリアすると次の章が開く。ほかのクエストは受けなくても進める。
 *   分岐は裏クエスト。受けると治安が変わり、そのあとボードに並ぶクエストが変わる（when）。
 *   クリアしたクエストは、1周の中ではボードから消える（slot で数える。治安で入れ替わる同じ枠のクエストは、どちらかをクリアすれば消える）。
 *   育った道は N の道のまま持ち越す（lab_target_ui.js の cafilia-lab-change）。乱数は使わない。
 *
 * クエスト（QUESTS）
 *   id       名前の元（戦闘の盤面の id は labQ_ ＋ id）
 *   ch       章
 *   kind     'key' キークエスト ／'side' 寄り道（受けなくても進める）／'dark' 裏クエスト
 *   slot     枠（省略は id）。治安で入れ替わるクエストは同じ枠にする
 *   when     ボードに出る条件（{ order: 'calm' } など。省略はいつも）
 *   board    盤面（lab_scenarios.js のシナリオの id）。味方の並びが「おすすめの魔法」になる
 *   missions ミッション（N の 44 から）。数がそのまま、この戦闘のミッションの数
 *   reward   報酬の中身 { join: 魔法 }（新しい仲間）。ミッションで育つのは、どのクエストも同じ
 *   accept   受けたときに変わること { order: 'rough' }（裏クエスト）
 */
(function (root) {
  var ROSTER_START = ['grass', 'fire', 'water', 'wind'];   // 最初の仲間（土は寄り道の報酬で加わる）
  var ROSTER_ORDER = ['grass', 'earth', 'fire', 'water', 'wind'];
  var PARTY_SIZE = 3;
  var NAME = { grass: '草', earth: '土', fire: '火', water: '水', wind: '風' };

  var ORDER = {
    calm: { name: 'おだやか', text: '村の人がふつうに依頼を出してくる' },
    rough: { name: '荒れている', text: '隣の村が焼けてから、村の人は依頼を出し渋り、街道にはうしろ暗い話が増えた' }
  };
  var KIND = {
    key: { name: 'キー', text: 'この章のキークエスト。全部クリアすると次の章が開く' },
    side: { name: '寄り道', text: '受けなくても先へ進める' },
    dark: { name: '裏', text: '裏クエスト。受けると治安が変わり、そのあとボードに並ぶクエストが変わる' }
  };

  var CHAPTERS = [
    { no: 1, name: '森の村', keyUndecided: true,   // どの盤面をキークエストにするかは未決（オーナー、10/16）。拠点の画面で付け替えられる
      text: { calm: '森に囲まれた小さな村。北の森に魔物が住みついて、村長が困っている。', rough: '森に囲まれた小さな村。隣の村が焼けたうわさで、村はぴりぴりしている。' } },
    { no: 2, name: '街道',
      text: { calm: '魔物を退けた村から、街へ荷を出すことになった。街道は丘を越えていく。', rough: '隣の村が焼けてから、街道は荒れている。荷を運ぶ話にも、黒衣の男が絡んでくる。' } }
  ];

  var QUESTS = [
    // ---- 第1章 森の村（いまの4つの盤面＋裏クエスト） ----
    { id: 'c1burn', ch: 1, kind: 'key', name: '森の魔物を焼け', client: '村長', board: 'labN1',
      story: '北の森に、火を吐く魔物が2体住みついた。森ごと焼いてかまわない。',
      missions: ['finKill', 'kill', 'nextTo'] },
    { id: 'c1guard', ch: 1, kind: 'key', name: '村を守れ', client: '村長', board: 'labN2',
      story: '森を焼かれて怒った魔物の仲間が、村へ下りてくる。下の段の家を守ってほしい。',
      missions: ['foiled', 'villagesSafe', 'kinds3'] },
    { id: 'c1lure', ch: 1, kind: 'side', name: '谷の魔物を誘い出せ', client: '土の魔法使い', board: 'labN3',
      story: '谷の3体を、互いの攻撃でつぶし合わせてみせてくれ。うまくいったら仲間になろう。',
      missions: ['redirect', 'bump', 'finKill'], reward: { join: 'earth' } },
    { id: 'c1field', ch: 1, kind: 'side', name: '畑の森を育てて', client: '村の農家', board: 'labN4', when: { order: 'calm' },
      story: '畑のまわりの草むらを森に育てたい。ついでに居座っている魔物も追い払って。お礼は少ないけれど。',
      missions: ['bigFin', 'twoStage'] },
    { id: 'c1dark', ch: 1, kind: 'dark', name: '守るはずの村', client: '黒衣の男', board: 'labND',
      story: '隣の村を焼いてくれ。トロッコも、居座っている魔法使いもだ。礼ははずむ。',
      missions: ['darkVillage', 'darkCart', 'darkWizard'], accept: { order: 'rough' },
      acceptText: '黒衣の男の依頼を受けた。村の治安が「荒れている」になった（村の依頼が減り、街道の話が変わる）' },
    // ---- 第2章 街道（第1章のキークエストを全部クリアすると開く） ----
    { id: 'c2cargo', ch: 2, kind: 'key', name: '荷を街まで運べ', client: '村長', board: 'labNe', slot: 'c2cargo', when: { order: 'calm' },
      story: '村の荷を積んだ馬車を、右の端（街の門）まで送り届けてほしい。',
      missions: ['carry', 'noWalk', 'noLoss'] },
    { id: 'c2loot', ch: 2, kind: 'key', name: '焼け跡の荷を運び出せ', client: '黒衣の男', board: 'labNe', slot: 'c2cargo', when: { order: 'rough' },
      story: '焼けた村から持ち出した荷だ。街の門まで運べ。じゃまをする者は片づけていい。',
      missions: ['carry', 'kill', 'push2'] },
    { id: 'c2hill', ch: 2, kind: 'key', name: '丘の見張りを下ろせ', client: '街の門番', board: 'labNd',
      story: '街道の丘に魔物が陣取って、通る者を狙っている。丘から下ろして、足を止めてくれ。',
      missions: ['held', 'blocked', 'lower'] },
    { id: 'c2grass', ch: 2, kind: 'side', name: '敵の草むらを使え', client: '森番', board: 'labNn',
      story: '草の魔物が街道に草むらを敷いて回っている。その草むらごと燃やしてしまえ。',
      missions: ['enemyNatFin', 'overwrite', 'enemyChange'] }
  ];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function quest(id) { return QUESTS.filter(function (q) { return q.id === id; })[0] || null; }
  function slotOf(q) { return q.slot || q.id; }
  function lastChapter() { return CHAPTERS[CHAPTERS.length - 1].no; }
  function chapter(no) { return CHAPTERS.filter(function (c) { return c.no === no; })[0] || null; }

  // ---- 1周の進み（拠点の外に持ち越す。localStorage は画面が持つ） ----
  function newCampaign() {
    return { v: 1, roster: ROSTER_START.slice(), cleared: {}, taken: {}, flags: { order: 'calm' }, keys: {}, log: [], done: false };
  }
  // 古い形・壊れた中身をそろえる
  function norm(c0) {
    var c = c0 && typeof c0 === 'object' ? clone(c0) : newCampaign(), d = newCampaign();
    Object.keys(d).forEach(function (k) { if (c[k] === undefined || c[k] === null || typeof c[k] !== typeof d[k]) c[k] = d[k]; });
    c.roster = ROSTER_ORDER.filter(function (m) { return c.roster.indexOf(m) >= 0; });
    if (!c.roster.length) c.roster = ROSTER_START.slice();
    if (!ORDER[c.flags.order]) c.flags.order = 'calm';
    return c;
  }
  // キークエストか（未決の章は、拠点の画面で付け替えた keys を使う）
  function isKey(c, q) {
    var ch = chapter(q.ch);
    if (q.kind === 'dark') return false;
    if (ch && ch.keyUndecided && c.keys && c.keys[q.id] !== undefined) return !!c.keys[q.id];
    return q.kind === 'key';
  }
  function shows(c, q) {
    var w = q.when || {};
    return Object.keys(w).every(function (k) { return c.flags[k] === w[k]; });
  }
  // 章のキークエストの枠（いまの治安で出るものだけ）。全部クリアで章が終わる
  function keySlots(c, no) {
    var out = [];
    QUESTS.forEach(function (q) { if (q.ch === no && shows(c, q) && isKey(c, q) && out.indexOf(slotOf(q)) < 0) out.push(slotOf(q)); });
    return out;
  }
  function chapterDone(c, no) { return keySlots(c, no).every(function (sl) { return !!c.cleared[sl]; }); }
  // 開いている章（1章は最初から。前の章のキークエストを全部クリアすると次が開く）
  function openChapter(c) {
    var n = 1;
    while (n < lastChapter() && chapterDone(c, n)) n++;
    return n;
  }
  // ボードに並ぶクエスト（開いた章まで・いまの治安で出る・まだクリアしていない）
  function board(c) {
    var top = openChapter(c);
    return QUESTS.filter(function (q) { return q.ch <= top && shows(c, q) && !c.cleared[slotOf(q)]; });
  }
  function allDone(c) { return openChapter(c) === lastChapter() && chapterDone(c, lastChapter()); }

  // おすすめの魔法（盤面の味方の並び）
  function recommend(q, findPreset) { var p = findPreset(q.board); return p ? p.allies.map(function (a) { return a[0]; }) : []; }
  // 最初に選んでおく仲間: おすすめのうち仲間にいる者 → 残りを仲間の並びから
  function defaultParty(c, q, findPreset) {
    var rec = recommend(q, findPreset), out = rec.filter(function (m) { return c.roster.indexOf(m) >= 0; });
    c.roster.forEach(function (m) { if (out.length < PARTY_SIZE && out.indexOf(m) < 0) out.push(m); });
    return out.slice(0, PARTY_SIZE);
  }
  // 味方の並びに仲間を入れる（おすすめの魔法はその場所のまま。ほかの場所に残りの仲間を順に）
  function placeParty(allies, party) {
    var left = party.slice(), out = allies.map(function () { return null; });
    allies.forEach(function (a, i) { var k = left.indexOf(a[0]); if (k >= 0) { out[i] = clone(a); left.splice(k, 1); } });
    allies.forEach(function (a, i) {
      if (out[i] || !left.length) return;
      var b = clone(a);
      b[0] = left.shift();
      if (b[3] && b[3].lab) { delete b[3].lab.labPath; if (!Object.keys(b[3].lab).length) delete b[3].lab; }
      out[i] = b;
    });
    return out.filter(Boolean);
  }
  // 戦闘の盤面を作る（盤面のシナリオの写し。ミッション・味方・切り替えだけ差しかえる）
  //   opts.dark: 仲間が闇の力を持っている（L7 をオンにしないと、闇の力が効かない）
  //   opts.seg: N7 区切りの道（10/19）の切り替え { on, len, star, awakeLater, fuseLater }。省略は入（初期の値）。on: false なら N6（3マスの道）のまま
  function preset(q, party, findPreset, opts) {
    var base = findPreset(q.board);
    if (!base) return null;
    var p = clone(base);
    ['demo', 'labQuests', 'labSeries', 'labSeriesStart', 'labNext', 'labDark', 'labDarkBoard', 'labDarkFrom'].forEach(function (k) { delete p[k]; });
    p.id = 'labQ_' + q.id;
    p.hidden = true;
    p.name = 'クエスト「' + q.name + '」';
    p.desc = '【クエスト制・第' + q.ch + '章・' + KIND[q.kind].name + '】' + q.client + 'の依頼: ' + q.story + ' ' + base.desc;
    p.lab = (p.lab || []).filter(function (x) { return x !== 'L6'; });
    if (p.lab.indexOf('N0') < 0) p.lab.unshift('N0');
    if (p.lab.indexOf('N6') < 0) p.lab.push('N6');   // 1本の道（.claude/IMPROVE_road.md）
    var seg = segOpts(opts && opts.seg);
    if (seg) { if (p.lab.indexOf('N7') < 0) p.lab.push('N7'); p.labOpts = Object.assign({}, p.labOpts || {}, { N7: seg }); }   // N7 区切りの道（10/19）
    else p.lab = p.lab.filter(function (x) { return x !== 'N7'; });
    if ((opts && opts.dark) || q.kind === 'dark') { if (p.lab.indexOf('L7') < 0) p.lab.push('L7'); }
    p.labState = Object.assign({}, p.labState || {}, { labTargetList: q.missions.slice(), labTargetCount: q.missions.length });
    p.allies = placeParty(base.allies, party);
    p.labQuestRun = q.id;
    return p;
  }

  // N7 区切りの道の切り替え（クエスト制・強化ためしでは入が初期）。null は切（N6 のまま）
  var SEG_DEFAULT = { len: 5, star: 'own', awakeLater: 'own', fuseLater: 'range' };
  var SEG_LENS = [3, 5, 7];
  function segOpts(o) {
    if (o && o.on === false) return null;
    var out = clone(SEG_DEFAULT);
    Object.keys(SEG_DEFAULT).forEach(function (k) { if (o && o[k] !== undefined && o[k] !== null) out[k] = o[k]; });
    if (SEG_LENS.indexOf(Number(out.len)) < 0) out.len = SEG_DEFAULT.len;
    out.len = Number(out.len);
    return out;
  }

  // 受ける（裏クエストは、ここで治安が変わる）。{ c, notes }
  function accept(c0, id) {
    var c = norm(c0), q = quest(id), notes = [];
    if (!q) return { c: c, notes: notes };
    c.taken[q.id] = true;
    if (q.accept) Object.keys(q.accept).forEach(function (k) { c.flags[k] = q.accept[k]; });
    if (q.acceptText) notes.push(q.acceptText);
    c.log.push('「' + q.name + '」を受けた');
    return { c: c, notes: notes };
  }
  // 戦闘のあと（勝てばクリア・報酬・章が開く）。{ c, notes }
  function finish(c0, id, won) {
    var c = norm(c0), q = quest(id), notes = [];
    if (!q) return { c: c, notes: notes };
    if (!won) { notes.push('「' + q.name + '」は達成できなかった（ボードに残る。受け直せる）'); c.log.push('「' + q.name + '」に負けた'); return { c: c, notes: notes }; }
    var before = openChapter(c);
    c.cleared[slotOf(q)] = true;
    notes.push('「' + q.name + '」をクリアした');
    c.log.push('「' + q.name + '」をクリア');
    if (q.reward && q.reward.join && c.roster.indexOf(q.reward.join) < 0) {
      c.roster = ROSTER_ORDER.filter(function (m) { return m === q.reward.join || c.roster.indexOf(m) >= 0; });
      notes.push('新しい仲間: ' + NAME[q.reward.join] + 'の魔法使いが加わった');
      c.log.push(NAME[q.reward.join] + 'が仲間に');
    }
    var after = openChapter(c);
    if (after > before) { notes.push('第' + after + '章「' + chapter(after).name + '」が開いた'); c.log.push('第' + after + '章が開いた'); }
    if (allDone(c) && !c.done) { c.done = true; notes.push('最後の章のキークエストを全部クリアした（1周の終わり）'); c.log.push('1周の終わり'); }
    return { c: c, notes: notes };
  }
  // 未決の章のキークエストを付け替える（ラボの中だけ）
  function setKey(c0, id, on) {
    var c = norm(c0), q = quest(id), ch = q && chapter(q.ch);
    if (!q || !ch || !ch.keyUndecided || q.kind === 'dark') return c;
    if (!!on === (q.kind === 'key')) delete c.keys[id]; else c.keys[id] = !!on;
    c.done = allDone(c) && c.done;
    return c;
  }

  var api = { NAME: NAME, ROSTER_START: ROSTER_START, ROSTER_ORDER: ROSTER_ORDER, PARTY_SIZE: PARTY_SIZE, ORDER: ORDER, KIND: KIND, CHAPTERS: CHAPTERS, QUESTS: QUESTS,
    quest: quest, chapter: chapter, slotOf: slotOf, newCampaign: newCampaign, norm: norm, isKey: isKey, shows: shows, keySlots: keySlots, chapterDone: chapterDone,
    openChapter: openChapter, board: board, allDone: allDone, recommend: recommend, defaultParty: defaultParty, placeParty: placeParty, preset: preset,
    accept: accept, finish: finish, setKey: setKey, segOpts: segOpts, SEG_DEFAULT: SEG_DEFAULT, SEG_LENS: SEG_LENS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LAB_QUEST = api;
})(this);
