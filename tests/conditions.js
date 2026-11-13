/*
 * 条件（勝ち負け・ふさぎ・ミッションを、ステージのデータに書く。.claude/IMPROVE_条件.md）のテスト。  node tests/conditions.js
 *   部品・数え・同時に成り立ったときの決め方・ひな形・前のステージの読み替え・画面の文と、
 *   意図した変更3つ（風で帰り口に運ばれて勝つ／突進の道とふさぎが同じ通り方／この自然を作ったら、発動がぜんぶ終わってから勝つ）。オーナー 11/13
 */
var R = require('../game/rules.js');
var S = require('../game/stages_io.js');
var B = require('../game/balance.js');
var fs = require('fs'), path = require('path');

var passed = 0, failed = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed.push(name); console.log('  NG  ' + name); console.log('        ' + (e && e.message)); }
  finally { B.turnMode = 'single'; }
}
function eq(a, b, msg) { var x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error((msg ? msg + ': ' : '') + 'expected ' + y + ' but got ' + x); }
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }

function blank(n, template, params) {
  var s = R.createState({ size: n || 5, blank: true, enemyActs: false });
  return template ? R.setTemplate(s, template, params) : s;
}
function ids(s) { return R.conditionsOf(s).map(function (c) { return c.id; }); }
function see(s, c, ev) { return R.evalCond(s, c, ev); }
function withConds(s, list, counters) {   // 条件をまるごと入れ替える（ステージのデータに書いたのと同じ）
  var bad = R.checkConditions(list, counters);
  if (bad) throw new Error(bad);
  s.conditions = list; if (counters) s.counters = counters; else delete s.counters;
  delete s.cond;
  return s;
}
function by(s, m) { return R.controllableOf(s).filter(function (a) { return a.magic === m; })[0]; }

// ---------------------------------------------------------------
console.log('\n■ ひな形と、今あるステージの読み替え');
// ---------------------------------------------------------------
var IDS = {
  annihilate: ['npcDown', 'allDown', 'killAll'],
  defense: ['npcDown', 'allDown', 'villageLost', 'hold', 'seal', 'killAll'],
  escort: ['npcDown', 'allDown', 'wagonLost', 'wagonGoal'],
  retrieve: ['npcDown', 'allDown', 'bringBack'],
  boss: ['anyDown', 'bossDown']
};
test('ひな形の中身（条件の名前と並び順）。どれも条件の形として正しい', function () {
  R.TEMPLATES.forEach(function (t) {
    var x = R.expandTemplate(t, { turns: 4 });
    eq(x.conditions.map(function (c) { return c.id; }), IDS[t], t);
    eq(R.checkConditions(x.conditions, x.counters), '', t + ' の形');
    ok(x.conditions.every(function (c) { return c.text && c.done; }), t + ': どの条件にも説明の文と、成り立ったときの文がある');
  });
  eq(Object.keys(R.expandTemplate('defense').counters), ['lostVillages'], '防衛は壊れた村を数える');
  eq(R.templateParams(blank(5, 'defense', { turns: 7 })).turns, 7, '守るターン数は、条件 hold の数に入る');
  ok(/ターン7の終わりまで/.test(R.conditionsOf(blank(5, 'defense', { turns: 7 })).filter(function (c) { return c.id === 'hold'; })[0].text), '文にも入る');
});
// 今あるステージが、読むとどのひな形・何ターンになるか（前の決まり: お題の名前・ボスの決まり・守るターン数の上書き）
var EXPECT = { mDefense: ['defense', 5], mEscort: ['escort'], mRetrieve: ['retrieve'], tut2: ['defense', 5], ex3: ['boss'] };
test('PRESETS・TUTORIALS: 読むと、今の決まりと同じひな形の条件になる（②は防衛5ターン、③はボス＋ミッション「火山を作る」）', function () {
  R.PRESETS.concat(R.TUTORIALS).forEach(function (p) {
    var s = R.loadPreset(p.id), want = EXPECT[p.id] || ['annihilate'];
    eq(R.templateOf(s), want[0], p.id);
    eq(ids(s), IDS[want[0]].concat(p.id === 'ex3' ? ['volcano'] : []), p.id + ' の条件');
    if (want[1]) eq(R.templateParams(s).turns, want[1], p.id + ' の守るターン数');
    ok(!s.overrides || !Object.keys(s.overrides).some(function (k) { return /^mission\.defense/.test(k); }), p.id + ': 前の形の上書きは残さない');
    ok(!s.ex || !s.ex.missions, p.id + ': ミッションは条件に移る（ex.missions は残さない）');
  });
  eq(R.loadPreset('tut2').overrides, { 'enemy.rushMove': 1 }, '②に残る上書きは突進1マスだけ');
  var v = R.conditionsOf(R.loadPreset('ex3')).filter(function (c) { return c.id === 'volcano'; })[0];
  eq([v.then, v.when, v.once, v.text], ['mission', ['afterShot'], true, '火山を作る'], '③のミッション（見るときは今のまま: 撃ったあとだけ）');
});
test('stages/草からはじめる.json（前の形のファイル）: 12ステージとも読めて、全滅8・防衛4（3・4・3・3ターン）', function () {
  var back = S.fromFiles(R, fs.readFileSync(path.join(__dirname, '..', 'stages', '草からはじめる.json'), 'utf8'));
  eq([back.items.length, back.errors.length], [12, 0]);
  var got = back.items.map(function (it) {
    var s = S.build(R, it.def).state, t = R.templateOf(s);
    eq(ids(s), IDS[t], it.name);
    ok(!s.overrides, it.name + ': 守るターン数の上書きは条件へ');
    return t === 'defense' ? 'defense' + R.templateParams(s).turns : t;
  });
  eq(got.filter(function (t) { return t === 'annihilate'; }).length, 8);
  eq(got.filter(function (t) { return t !== 'annihilate'; }), ['defense3', 'defense4', 'defense3', 'defense3']);
});
test('ステージの定義は、展開した条件（conditions）と札（template）を持つ。書き出して読み直しても同じ', function () {
  R.PRESETS.concat(R.TUTORIALS).forEach(function (p) {
    var s = R.loadPreset(p.id), def = S.toDef(R, s, 'x');
    eq([def.template, def.conditions], [R.templateOf(s), R.conditionsOf(s)], p.id);
    ok(!def.overrides || !Object.keys(def.overrides).some(function (k) { return /^mission\.defense/.test(k); }), p.id + ': 定義に前の形の上書きを書かない');
    var b = S.build(R, def);
    ok(b.ok, b.error);
    eq([R.templateOf(b.state), R.conditionsOf(b.state), R.countersOf(b.state)], [R.templateOf(s), R.conditionsOf(s), R.countersOf(s)], p.id + ' 読み直し');
    var lay = R.importLayout(R.exportLayout(s));
    ok(lay.ok, lay.error);
    eq(R.conditionsOf(lay.state).filter(function (c) { return c.then !== 'mission'; }), R.conditionsOf(s).filter(function (c) { return c.then !== 'mission'; }), p.id + ' 配置の JSON でも同じ');
  });
  eq(S.winKind(S.toDef(R, R.loadPreset('ex3'), 'x')), 'boss');
  eq(S.winKind(S.toDef(R, R.loadPreset('tut2'), 'x')), 'defense');
});
test('前の「配置」の JSON（お題の名前と、守るターン数の上書き）も読める', function () {
  var s = blank(5, 'defense');
  var d = JSON.parse(R.exportLayout(s));
  delete d.conditions; delete d.counters; delete d.template;
  d.overrides = { 'mission.defense.turns': 3, 'mission.defense.sealWin': true };
  var r = R.importLayout(d);
  ok(r.ok, r.error);
  eq([R.templateOf(r.state), R.templateParams(r.state).turns, r.state.overrides], ['defense', 3, undefined]);
});
test('形の正しくない条件は読まない（理由の文を返す）', function () {
  var base = R.expandTemplate('annihilate').conditions;
  var bad = function (c, counters) { return R.checkConditions(base.concat([c]), counters); };
  ok(/when/.test(bad({ id: 'a', when: ['sometime'], 'if': { see: 'turn', min: 1 }, then: 'win' })), '知らない「いつ見るか」');
  ok(/then/.test(bad({ id: 'a', when: ['turnEnd'], 'if': { see: 'turn', min: 1 }, then: 'draw' })), '知らない「起きること」');
  ok(/if/.test(bad({ id: 'a', when: ['turnEnd'], 'if': { see: 'tiles', tile: 'nothing' }, then: 'win' })), '知らないタイル');
  ok(/if/.test(bad({ id: 'a', when: ['turnEnd'], 'if': { see: 'counter', name: 'x', min: 1 }, then: 'win' })), 'ない数え');
  ok(/同じ名前/.test(bad({ id: 'killAll', when: ['turnEnd'], 'if': { see: 'turn', min: 1 }, then: 'win' })), '同じ名前');
  ok(/always/.test(bad({ id: 'a', when: ['always'], 'if': { see: 'turn', min: 1 }, then: 'win' })), '「いつでも」は canClear 専用');
  ok(/always/.test(bad({ id: 'a', when: ['turnEnd'], 'if': { see: 'turn', min: 1 }, then: 'canClear' })), 'canClear は「いつでも」だけ');
  eq(bad({ id: 'a', when: ['turnEnd'], 'if': { see: 'turn', min: 1 }, then: 'win' }), '', '正しい形');
  var def = S.toDef(R, blank(5), 'x');
  def.conditions.push({ id: 'z', when: ['never'], then: 'win' });
  ok(!S.build(R, def).ok, 'ステージのファイルでも、形の正しくない条件は読まない');
});

// ---------------------------------------------------------------
console.log('\n■ 部品');
// ---------------------------------------------------------------
test('units・unitIn・tiles・turn と、かつ・または・ではない', function () {
  var s = blank(5);
  R.addAlly(s, 'fire', 0, 4, 'up'); var n = R.addAlly(s, 'wind', 1, 4, 'up'); n.npc = true;
  var e = R.addEnemy(s, 'fire', 4, 0, 'down'); e.stand = 'rush';
  R.addEnemy(s, 'earth', 3, 0, 'down');
  R.addObject(s, 'village', 2, 4);
  R.setTile(s, 2, 2, 'forest'); R.setTile(s, 3, 2, 'forest');
  ok(see(s, { see: 'units', where: { side: 'enemy' }, eq: 2 }));
  ok(see(s, { see: 'units', where: { side: 'enemy', stand: 'rush' }, eq: 1 }));
  ok(see(s, { see: 'units', where: { side: 'enemy', not: { stand: 'rush' } }, eq: 1 }), '絞り方の「ではない」');
  ok(see(s, { see: 'units', where: { side: 'ally', npc: false }, eq: 1 }) && see(s, { see: 'units', where: { side: 'ally', npc: true }, eq: 1 }));
  ok(see(s, { see: 'units', where: { kind: 'village' } }), '数を書かなければ「1以上」');
  ok(see(s, { see: 'units', where: { magic: 'earth' }, max: 1 }) && !see(s, { see: 'units', where: { magic: 'ice' } }));
  ok(see(s, { see: 'unitIn', where: { side: 'enemy' }, cells: [[4, 0], [0, 0]] }) && !see(s, { see: 'unitIn', where: { side: 'ally' }, cells: [[4, 0]] }));
  ok(see(s, { see: 'tiles', tile: 'forest', min: 2 }) && !see(s, { see: 'tiles', tile: 'forest', min: 3 }));
  ok(see(s, { see: 'tiles', tile: 'forest', 'in': [[2, 2], [0, 0]], eq: 1 }), 'マスを決めて数える');
  ok(see(s, { see: 'turn', eq: 1 }) && !see(s, { see: 'turn', min: 2 }));
  ok(see(s, { all: [{ see: 'turn', eq: 1 }, { see: 'tiles', tile: 'forest' }] }) && !see(s, { all: [{ see: 'turn', eq: 1 }, { see: 'tiles', tile: 'volcano' }] }));
  ok(see(s, { any: [{ see: 'turn', eq: 9 }, { see: 'tiles', tile: 'forest' }] }) && !see(s, { any: [{ see: 'turn', eq: 9 }, { see: 'tiles', tile: 'volcano' }] }));
  ok(see(s, { not: { see: 'tiles', tile: 'volcano' } }) && !see(s, { not: { see: 'tiles', tile: 'forest' } }));
  s.mission.goal = [[4, 0]];
  ok(see(s, { see: 'unitIn', where: { side: 'enemy' }, cells: 'goal' }), 'ゴールのマスは名前で指せる');
});
test('died: この操作の中で、ここまでに倒れた・壊れたものを見る（絞り方は units と同じ）', function () {
  var s = blank(5);
  var a = R.addAlly(s, 'fire', 2, 4, 'up');
  var e = R.addEnemy(s, 'fire', 2, 3, 'down'); e.stand = 'still'; e.hp = 1;
  R.addEnemy(s, 'fire', 0, 0, 'down');
  var r = R.act(s, a.id, { dir: 'up' });
  ok(!R.findUnit(r.state, e.id), '敵が倒れた');
  ok(see(r.state, { see: 'died', where: { side: 'enemy' } }, r.events));
  ok(see(r.state, { see: 'died', where: { side: 'enemy', stand: 'still', magic: 'fire' } }, r.events), '動き方・魔法でも絞れる');
  ok(!see(r.state, { see: 'died', where: { side: 'ally' } }, r.events) && !see(r.state, { see: 'died', where: { side: 'enemy', stand: 'rush' } }, r.events));
  ok(!see(r.state, { see: 'died', where: { side: 'enemy' } }, []), '次の操作では、もう「このとき」ではない');
});
test('path: 出発点・行き先・通り方・人の扱いを渡して、つながっているか', function () {
  var s = blank(5);
  var e = R.addEnemy(s, 'earth', 2, 0, 'down');
  R.addObject(s, 'village', 2, 4);
  var p = function (more) { var o = { see: 'path', from: [{ units: { side: 'enemy' } }], to: { nextTo: { kind: 'village' } }, walk: 'rush' }; Object.keys(more || {}).forEach(function (k) { o[k] = more[k]; }); return o; };
  ok(see(s, p()) && !see(s, p({ is: 'closed' })), '何もなければ着ける');
  [0, 1, 2, 3].forEach(function (x) { R.setTile(s, x, 2, 'mountain'); });
  ok(see(s, p()), '1マスあいていれば着ける');
  var a = R.addAlly(s, 'fire', 4, 2, 'up');
  ok(see(s, p()) && see(s, p({ people: 'ignore' })), '人はいないものとして見る（省略と ignore）');
  ok(!see(s, p({ people: 'block' })) && see(s, p({ people: 'block', is: 'closed' })), '人のいるマスは通れない、も選べる');
  s.units = s.units.filter(function (u) { return u.id !== a.id; });
  R.setTile(s, 4, 2, 'mud');
  ok(!see(s, p()) && see(s, p({ is: 'closed' })), '突進の通り方では、泥沼は通れない');
  ok(see(s, p({ walk: 'foot' })), '歩く通り方（通れる地形）なら、泥沼は通れる');
  ok(see(s, p({ to: { cells: [[0, 1]] } })) && !see(s, p({ to: { cells: [[0, 4]] } })), '行き先はマスでも書ける');
  s.units = s.units.filter(function (u) { return u.id !== e.id; });
  ok(!see(s, p({ is: 'closed' })) && !see(s, p()), '出発点が1つもなければ、「ふさいだ」も「着ける」も成り立たない');
  s.spawn = { x: 2, y: 0, facing: 'down', magic: 'earth', stand: 'rush' };
  ok(see(s, p({ from: ['spawn'], is: 'closed' })), '増援の出てくる所も出発点にできる');
  ok(see(s, { see: 'spawn', where: { stand: 'rush' } }) && !see(s, { see: 'spawn', where: { stand: 'move' } }), '増援の出てくる所があるか');
});

// ---------------------------------------------------------------
console.log('\n■ 数え');
// ---------------------------------------------------------------
test('倒れた・壊れたで増える数え: 防衛の「村が壊れたら負け」は、壊れた村の数えを見る（数は条件に書ける）', function () {
  var mk = function (loseAt) {
    var s = blank(5, 'defense', { turns: 9, loseAt: loseAt });
    var a = R.addAlly(s, 'fire', 2, 4, 'up');
    R.addEnemy(s, 'fire', 0, 0, 'down');
    R.addObject(s, 'village', 2, 3); R.addObject(s, 'village', 4, 4);
    return R.act(s, a.id, { dir: 'up' }).state;   // 味方の火で村が1つ壊れる
  };
  var one = mk(1), two = mk(2);
  eq([one.cond.n.lostVillages, one.result, one.resultText], [1, 'lose', '村が壊された…（敗北）']);
  eq([two.cond.n.lostVillages, two.result], [1, null], '2つ壊れたら負け、と書けばまだ負けない');
});
test('数えるとき（on）に成り立っていれば1増える・reset の条件で0に戻る・やり直しをまたいで残せる（のちのヒント用の枠）', function () {
  var counters = {
    noForest: { add: { not: { see: 'tiles', tile: 'forest' } }, on: 'turnEnd', reset: { see: 'tiles', tile: 'forest' } },
    ends: { add: { see: 'turn', min: 1 }, keepOnRetry: true }   // on を書かなければ、ターン終了処理のあと
  };
  var list = R.expandTemplate('annihilate').conditions.concat([
    { id: 'late', when: ['turnEnd'], 'if': { see: 'counter', name: 'noForest', min: 3 }, then: 'lose', text: '森がないまま3ターン過ぎる' }]);
  var s = withConds(blank(5), list, counters);
  R.addAlly(s, 'grass', 2, 4, 'up'); R.addEnemy(s, 'fire', 0, 0, 'down').stand = 'still';
  s = R.endTurn(R.endTurn(s).state).state;
  eq([s.cond.n.noForest, s.cond.n.ends, s.result], [2, 2, null]);
  R.setTile(s, 4, 4, 'forest');
  s = R.endTurn(s).state;
  eq([s.cond.n.noForest, s.cond.n.ends], [0, 3], '森ができたら0に戻る');
  R.setTile(s, 4, 4, 'empty');
  for (var i = 0; i < 3; i++) s = R.endTurn(s).state;
  eq([s.result, s.resultText], ['lose', '森がないまま3ターン過ぎる'], '成り立ったときの文がなければ、説明の文');
  // やり直しをまたぐ数え
  var p = { id: 'cKeep', tutorial: true, name: 'k', rows: ['...', '...', '...'], allies: [['grass', 1, 2]], enemies: [['fire', 1, 0, { stand: 'still' }]],
    template: 'annihilate', conditions: R.expandTemplate('annihilate').conditions, counters: counters };
  R.TUTORIALS.push(p);
  try {
    var t = R.endTurn(R.startBattle(R.loadPreset('cKeep')).state).state;
    eq([t.cond.n.ends, t.cond.n.noForest], [1, 1]);
    var again = R.retryStage(t).state;
    eq([again.cond.n.ends, again.cond.n.noForest, again.tries], [1, undefined, 1], 'keepOnRetry の数えだけ持ち越す');
  } finally { R.TUTORIALS.pop(); }
});

// ---------------------------------------------------------------
console.log('\n■ 同時に成り立ったとき・条件を外す');
// ---------------------------------------------------------------
test('同じときに成り立ったら負けが先。同じ側は並び順で先のもの', function () {
  var win = function (id) { return { id: id, when: ['turnEnd'], 'if': { see: 'turn', min: 1 }, then: 'win', text: id }; };
  var lose = function (id) { return { id: id, when: ['turnEnd'], 'if': { see: 'turn', min: 1 }, then: 'lose', text: id }; };
  var run = function (list) { var s = withConds(blank(5), list); R.addAlly(s, 'fire', 0, 4, 'up'); s = R.endTurn(s).state; return [s.result, s.resultText]; };
  eq(run([win('w1'), lose('l1'), lose('l2'), win('w2')]), ['lose', 'l1']);
  eq(run([win('w1'), win('w2')]), ['win', 'w1']);
  eq(run([win('w2'), win('w1')]), ['win', 'w2']);
});
test('ひな形に入っている条件は普通の条件: 外せば起きない（構える味方が倒れても負けない・ふさいでもボタンが出ない）', function () {
  var mk = function (drop) {
    var s = blank(5);
    var list = R.conditionsOf(s).filter(function (c) { return c.id !== drop; });
    s = withConds(s, list);
    var a = R.addAlly(s, 'fire', 2, 4, 'up');
    var n = R.addAlly(s, 'wind', 2, 3, 'up'); n.npc = true; n.hp = 1;
    R.addEnemy(s, 'fire', 0, 0, 'down').stand = 'still';
    return R.act(s, a.id, { dir: 'up' }).state;
  };
  eq([mk(null).result, mk(null).resultText], ['lose', '構える味方が倒れた…（失敗）']);
  eq(mk('npcDown').result, null, 'npcDown を外したステージでは、構える味方が倒れても続く');
  var t2 = R.loadPreset('tut2');
  var noSeal = withConds(R.clone(t2), R.conditionsOf(t2).filter(function (c) { return c.id !== 'seal'; }), R.countersOf(t2));
  [0, 1, 2, 3, 4, 5].forEach(function (x) { R.setTile(t2, x, 3, 'river'); R.setTile(noSeal, x, 3, 'river'); });
  eq([R.sealReady(t2), R.sealReady(noSeal), R.claimSeal(noSeal).ok], [true, false, false]);
  ok(!/ふさい/.test(R.missionInfo(noSeal).win), '外した条件は、勝ち方の文にも出ない');
});

// ---------------------------------------------------------------
console.log('\n■ 意図した変更 1: 奪取は、風で運ばれて帰り口に着いても勝ち');
// ---------------------------------------------------------------
function carried(exit) {
  var s = blank(5, 'retrieve');
  s.mission.exit = exit;
  var c = R.addAlly(s, 'grass', 2, 3, 'up'), w = R.addAlly(s, 'wind', 2, 4, 'up');
  R.addEnemy(s, 'fire', 0, 0, 'down');
  s.mission.carrier = c.id;
  return { s: s, c: c, w: w };
}
test('宝を持った味方が、仲間の風で帰り口のマスへ運ばれたら勝ち', function () {
  var x = carried([[2, 2]]);
  var r = R.act(x.s, x.w.id, { dir: 'up' });
  ok(r.ok, r.error);
  var c = R.findUnit(r.state, x.c.id);
  eq([c.x, c.y], [2, 2], '風で1マス運ばれて、帰り口の上');
  eq([r.state.result, r.state.resultText], ['win', '宝を持ち帰った！（勝利）']);
});
test('帰り口でないマスへ運ばれても勝たない。宝を持っていない味方が帰り口へ運ばれても勝たない', function () {
  var x = carried([[2, 1]]);
  eq(R.act(x.s, x.w.id, { dir: 'up' }).state.result, null);
  var y = carried([[2, 2]]);
  y.s.mission.carrier = null; y.s.mission.treasure = [0, 4];
  eq(R.act(y.s, y.w.id, { dir: 'up' }).state.result, null);
});
test('一斉でも同じ: 構えの発動で運ばれたら勝ち。自分で移動を終えて勝つのも今までどおり', function () {
  B.turnMode = 'simul';
  var x = carried([[2, 2]]);
  var s = R.act(x.s, x.c.id, { shoot: false }).state;
  s = R.act(s, x.w.id, { dir: 'up' }).state;
  eq(s.result, null, '構えただけではまだ');
  eq(R.endTurn(s).state.result, 'win');
  B.turnMode = 'single';
  var z = carried([[2, 1]]);
  eq(R.move(z.s, z.c.id, [2, 1]).state.result, 'win', '自分で帰り口に入る');
});
test('風で宝のマスへ運ばれても、宝は拾わない（拾うのは条件ではなく、しくみ。今のまま）', function () {
  var x = carried([[0, 0]]);
  x.s.mission.carrier = null; x.s.mission.treasure = [2, 2];
  var r = R.act(x.s, x.w.id, { dir: 'up' });
  eq([r.state.mission.carrier, r.state.mission.treasure], [null, [2, 2]]);
});

// ---------------------------------------------------------------
console.log('\n■ 意図した変更 2: ふさぎの道は、突進の敵が動くときと同じ通り方');
// ---------------------------------------------------------------
test('ふさぎの条件の道は walk: rush。突進の敵の足（rushRoute）と、同じ通り方の部品（R.WALKS.rush）を使う', function () {
  var seal = R.expandTemplate('defense').conditions.filter(function (c) { return c.id === 'seal'; })[0];
  var p = seal['if'].all.filter(function (c) { return c.see === 'path'; })[0];
  eq([p.walk, p.people, p.is], ['rush', 'ignore', 'closed']);
  // 通り方の部品を差し替えると、突進の敵の道も、ふさぎの答えも、いっしょに変わる（同じ部品を見ている）
  var s = blank(5, 'defense');
  var e = R.addEnemy(s, 'earth', 2, 0, 'down'); e.stand = 'rush';
  R.addObject(s, 'village', 2, 4);
  [0, 1, 2, 3, 4].forEach(function (x) { R.setTile(s, x, 2, 'forest'); });
  eq([R.rushRoute(s, e).reach, R.sealReady(s)], [true, false], '森は通れる');
  var saved = R.WALKS.rush;
  R.WALKS.rush = function (t) { return t !== 'forest' && saved(t); };
  try { eq([R.rushRoute(s, e).reach, R.sealReady(s)], [false, true], '森を通れない通り方にすると、両方が変わる'); }
  finally { R.WALKS.rush = saved; }
});
test('どの地形で壁を作っても、「突進の敵が村へ届かない」と「ふさいだ」が同じ答えになる（人がいないとき）', function () {
  var seen = { open: 0, closed: 0 };
  R.TILES.forEach(function (tile) {
    var s = blank(5, 'defense');
    var e = R.addEnemy(s, 'earth', 2, 0, 'down'); e.stand = 'rush';
    R.addObject(s, 'village', 2, 4);
    [0, 1, 2, 3, 4].forEach(function (x) { R.setTile(s, x, 2, tile); });
    var reach = R.rushRoute(s, e).reach;
    eq(R.sealReady(s), !reach, tile);
    seen[reach ? 'open' : 'closed']++;
    R.setTile(s, 4, 2, 'empty');   // 1マスあける
    eq([R.rushRoute(s, e).reach, R.sealReady(s)], [true, false], tile + '（1マスあき）');
  });
  ok(seen.open > 0 && seen.closed > 0, '通れる地形も、通れない地形もある');
});
test('人は今までどおり数えない: 味方やトロッコが道に立っているだけでは、ふさいだことにならない（敵は足止めされる）', function () {
  var s = blank(5, 'defense');
  var e = R.addEnemy(s, 'earth', 2, 0, 'down'); e.stand = 'rush';
  R.addObject(s, 'village', 2, 4);
  [0, 1, 2, 3].forEach(function (x) { R.setTile(s, x, 2, 'mountain'); });
  R.addObject(s, 'wagon', 4, 2);
  eq([R.rushRoute(s, e).reach, R.sealReady(s)], [false, false], 'トロッコが立っている間は届かないが、ふさいだとは言わない');
});
test('敵が全員突進のときだけ成り立つ（今までどおり）', function () {
  var s = blank(5, 'defense');
  var e = R.addEnemy(s, 'earth', 2, 0, 'down'); e.stand = 'rush';
  R.addObject(s, 'village', 2, 4);
  [0, 1, 2, 3, 4].forEach(function (x) { R.setTile(s, x, 2, 'mountain'); });
  ok(R.sealReady(s));
  R.addEnemy(s, 'fire', 0, 0, 'down');
  ok(!R.sealReady(s), '突進でない敵が1体でもいると成り立たない');
});

// ---------------------------------------------------------------
console.log('\n■ 意図した変更 3: この自然を作ったら勝ち（発動がぜんぶ終わってから）');
// ---------------------------------------------------------------
// ③の盤面と一掃の手（山 → 火で火山 → 風で桜吹雪）で、ボスの決まりを外し、動かない敵を1体だけ遠くに置く
var EARTH = ['mount', [1, 3], 'right'], FIRE = ['fire', [2, 4], 'up'], WIND = ['wind', [1, 2], 'right'];
function volcanoStage(extra, counters) {
  var p = R.clone(R.findPreset('ex3'));
  delete p.ex; delete p.tutorial;
  p.id = 'cVolcano';
  p.enemies = [['fire', 9, 0, { stand: 'still' }, 'left']];
  p.template = 'annihilate';
  p.conditions = R.expandTemplate('annihilate').conditions.concat(extra);
  if (counters) p.counters = counters;
  eq(R.checkConditions(p.conditions, p.counters), '');
  return R.startBattle(R.buildPreset(p)).state;
}
function chain(s, moves) {
  var ev = [];
  moves.forEach(function (m) {
    if (s.result) return;
    var r = R.act(s, by(s, m[0]).id, { to: m[1], dir: m[2] });
    if (!r.ok) throw new Error(m[0] + ': ' + r.error);
    ev = ev.concat(r.events); s = r.state;
  });
  if (!s.result) { var t = R.endTurn(s); ev = ev.concat(t.events); s = t.state; }
  return { state: s, events: ev };
}
function casts(r) { return r.events.filter(function (e) { return e.type === 'cast'; }).length; }
function fin(r) { return r.events.some(function (e) { return e.type === 'finisher'; }); }
function at(r, type) { for (var i = 0; i < r.events.length; i++) if (r.events[i].type === type) return i; return -1; }
// 一度でも火山ができたら数える（撃ったあとに数える）。勝つのは、発動がぜんぶ終わったあとか、ターン終了処理のあと
var MADE = { madeVolcano: { add: { see: 'tiles', tile: 'volcano', min: 1 }, on: 'afterShot' } };
var MAKE = { id: 'makeVolcano', when: ['afterFire', 'turnEnd'], 'if': { see: 'counter', name: 'madeVolcano', min: 1 }, then: 'win', text: '火山を作る', done: '火山ができた！（勝利）' };
test('一斉: 2人目で火山ができても、3人目の風（桜吹雪）まで撃ち終えてから勝つ', function () {
  B.turnMode = 'simul';
  var r = chain(volcanoStage([MAKE], MADE), [EARTH, FIRE, WIND]);
  eq([r.state.result, r.state.resultText, r.state.turn], ['win', '火山ができた！（勝利）', 1]);
  eq(casts(r), 3, '3人とも撃った');
  ok(fin(r), '桜吹雪が起きた');
  ok(at(r, 'finisher') < at(r, 'result'), '決め手のあとに決着');
  ok(at(r, 'turnEnd') < 0, 'ターン終了処理の前に決着（発動がぜんぶ終わったあと）');
});
test('くらべ: 同じ条件を「撃ったあと」で見ると、2人目で決着して3人目は撃たない（だから作ったら勝ちには使わない）', function () {
  B.turnMode = 'simul';
  var early = { id: 'makeVolcano', when: ['afterShot'], 'if': { see: 'tiles', tile: 'volcano', min: 1 }, then: 'win', text: '火山を作る' };
  var r = chain(volcanoStage([early]), [EARTH, FIRE, WIND]);
  eq([r.state.result, casts(r), fin(r)], ['win', 2, false]);
});
test('全滅の勝ち（A1）の見るときは今のまま: 途中で敵が全滅したら、そこで決着する', function () {
  B.turnMode = 'simul';
  var s = volcanoStage([MAKE], MADE);
  var e = R.enemiesOf(s)[0];
  e.x = 2; e.y = 3; e.hp = 1;   // 火使いの火が当たる所に置く
  var r = chain(s, [['mount', [0, 3], 'up'], FIRE, WIND]);
  eq([r.state.result, r.state.resultText], ['win', '敵を全員倒した！（勝利）']);
  ok(casts(r) < 3, '全滅した時点で止まる');
});
test('「盤面に残っていたら勝ち」とも書ける: 桜吹雪で火山を壊してしまうと、残っていないので勝たない', function () {
  B.turnMode = 'simul';
  var stay = { id: 'keepVolcano', when: ['afterFire', 'turnEnd'], 'if': { see: 'tiles', tile: 'volcano', min: 1 }, then: 'win', text: '火山を残す' };
  var blown = chain(volcanoStage([stay]), [EARTH, FIRE, WIND]);
  eq([blown.state.result, casts(blown), blown.state.tiles.indexOf('volcano') < 0], [null, 3, true], '火山は桜吹雪で壊れた');
  var kept = chain(volcanoStage([stay]), [EARTH, FIRE, ['wind', [0, 0], 'up']]);
  eq([kept.state.result, casts(kept)], ['win', 3], '壊さなければ、発動が終わってから勝つ');
});
test('1人ずつ: その味方が撃ち終えたら見る（火使いが火山を作った手で勝つ）', function () {
  var r = chain(volcanoStage([MAKE], MADE), [EARTH, FIRE, WIND]);
  eq([r.state.result, casts(r), r.state.turn], ['win', 2, 1]);
});
test('ターン終了処理のあとも見る: 発動のあとにできた自然（敵の魔法・燃え移りなど）でも、ターンの終わりに勝つ', function () {
  var burn = { id: 'burn3', when: ['afterFire', 'turnEnd'], 'if': { see: 'tiles', tile: 'fire', min: 3 }, then: 'win', text: '炎を3マスに広げる' };
  var s = withConds(blank(5), R.expandTemplate('annihilate').conditions.concat([burn]));
  var a = R.addAlly(s, 'fire', 2, 4, 'up');
  R.addEnemy(s, 'fire', 0, 0, 'down').stand = 'still';
  R.setTile(s, 2, 3, 'forest'); R.setTile(s, 1, 3, 'forest'); R.setTile(s, 3, 3, 'forest');
  var r = R.act(s, a.id, { dir: 'up' });
  eq([r.state.result, r.state.tiles.filter(function (t) { return t === 'fire'; }).length], [null, 1], '撃った時点では炎は1マス');
  var t = R.endTurn(r.state);
  eq([t.state.result, t.state.resultText, t.state.turn], ['win', '炎を3マスに広げる', 1], '燃え移って3マスになり、ターン終了処理のあとに勝つ');
  ok(at(t, 'fireSpread') < at(t, 'result'), '燃え移りを見せてから決着');
});
test('予測も同じ条件を聞く: 発動で決着するなら敵の予告は消える。守り切って終わるターンは、突進の予告を出さない', function () {
  B.turnMode = 'simul';
  var s = volcanoStage([MAKE], MADE);
  R.enemiesOf(s)[0].intent = true;
  [EARTH, FIRE, WIND].forEach(function (m) { s = R.act(s, by(s, m[0]).id, { to: m[1], dir: m[2] }).state; });
  ok(R.forecast(s).enemies.every(function (e) { return e.cancelled; }), '火山ができて勝つので、敵の魔法は発動しない');
  B.turnMode = 'single';
  var d = R.startBattle(R.loadPreset('tut2')).state;
  ok(R.forecast(d).rushes.length > 0, '1ターン目は突進の予告がある');
  d.turn = 5;
  eq(R.forecast(d).rushes.length, 0, '5ターン目（守り切って終わる）は出さない');
});

// ---------------------------------------------------------------
console.log('\n■ 画面の文');
// ---------------------------------------------------------------
test('勝ち方・負け方・ミッションは、条件の説明の文（text）から出る。出すとき（showIf）が成り立たない文は出さない', function () {
  var a = R.missionInfo(R.loadPreset('spread'));
  eq([a.win, a.lose, a.missions, a.template], ['敵を全員倒す', '味方が全員倒れる', [], 'annihilate']);
  eq(R.missionInfo(R.loadPreset('tut1')).lose, '構える味方が倒れる／味方が全員倒れる', '構える味方がいるステージだけ');
  eq(R.missionInfo(R.loadPreset('tut2')).win, 'ターン5の終わりまで村を守る／村への道をふさいだら、その場でクリアにできる／敵を全員倒す');
  eq(R.missionInfo(R.loadPreset('mDefense')).win, 'ターン5の終わりまで村を守る／敵を全員倒す', '突進の敵がいなければ、ふさぐ文は出さない');
  eq(R.missionInfo(R.loadPreset('mDefense')).lose, '味方が全員倒れる／村が1つ壊れる');
  eq([R.missionInfo(R.loadPreset('mEscort')).win, R.missionInfo(R.loadPreset('mEscort')).lose], ['トロッコがゴールに入る', '味方が全員倒れる／トロッコが壊れる']);
  eq(R.missionInfo(R.loadPreset('mRetrieve')).win, '宝を持って帰り口に入る');
  var b = R.missionInfo(R.loadPreset('ex3'));
  eq([b.win, b.lose, b.missions], ['ボスを倒す', '味方が1人でも倒れる（ステージの頭からやり直し）', [{ id: 'volcano', text: '火山を作る', done: false }]]);
});
test('③: 火山を作るとミッション達成（一度だけ。出来事と、文の達成の印）。残りの数は今までどおり', function () {
  B.turnMode = 'simul';
  var s = R.startBattle(R.loadPreset('ex3')).state;
  eq(R.missionInfo(s).status, ['ボス HP 20/20', '取り巻き 2体']);
  var r = chain(s, [EARTH, FIRE, ['wind', [0, 0], 'up']]);
  var got = r.events.filter(function (e) { return e.type === 'mission'; });
  eq(got.map(function (e) { return [e.id, e.text]; }), [['volcano', 'ミッション達成: 火山を作る']]);
  eq(R.missionInfo(r.state).missions[0].done, true);
  var next = R.endTurn(r.state);
  ok(!next.events.some(function (e) { return e.type === 'mission'; }), '2回は出ない');
  eq(R.startBattle(r.state).state.cond, undefined, '遊び始めに戻すと、達成の覚えも消える');
});
test('エディットの勝ち方: ひな形を選ぶと条件が入れ替わる。ボスを外すとミッションも外れ、戻すと戻る', function () {
  var s3 = R.loadPreset('ex3');
  var keep = S.keepEx(R, s3);
  var d = S.setWin(R, s3, 'defense', 7);
  eq([S.winOf(R, d), ids(d), S.turnsOf(R, d), !!d.ex, d.mission.type], ['defense', IDS.defense, 7, false, 'defense']);
  var b = S.setWin(R, d, 'boss', 0, keep);
  eq([S.winOf(R, b), ids(b), b.ex, b.mission.type], ['boss', IDS.boss.concat(['volcano']), s3.ex, 'annihilate']);
  var old = S.setWin(R, d, 'boss', 0, { spawn: { magic: 'bite', hp: 1 }, missions: [{ id: 'volcano', tile: 'volcano', name: '火山を作る' }] });
  eq([ids(old), old.ex], [IDS.boss.concat(['volcano']), { spawn: { magic: 'bite', hp: 1 } }], '前に覚えておいた形（ex.missions）からも戻せる');
  eq(ids(R.editSetMission(R.loadPreset('spread'), 'escort').state), IDS.escort, 'お題を変えても同じ');
});

console.log('\n' + passed + ' 件成功 / ' + failed.length + ' 件失敗');
if (failed.length) { console.log('失敗: ' + failed.join(' ／ ')); process.exit(1); }
