/*
 * 展示ステージ③（3人でつなぐ。.claude/IMPROVE_stage3.md）のテスト。  node tests/ex3.js
 *   魔法の出し方は BALANCE.turnMode（chain: 一斉に発動 simul／instant: 1人ずつ single）。テストの中で切り替え、終わったら元に戻す。
 *   オーナー 10/29〜30 に組み直した形（10×7・ボス HP20・魔法は①②と同じ・桜吹雪は標準の扇）で確かめる。
 */
var R = require('../game/rules.js');
var B = require('../game/balance.js');
var TEXTS = require('../game/texts.js');

var passed = 0, failed = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed.push(name); console.log('  NG  ' + name); console.log('        ' + (e && e.message)); }
  finally { B.turnMode = 'single'; }
}
function eq(a, b, msg) { var x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error((msg ? msg + ': ' : '') + 'expected ' + y + ' but got ' + x); }
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function mode(m) { B.turnMode = m === 'instant' ? 'single' : 'simul'; }
function start() { return R.startBattle(R.loadPreset('ex3')).state; }
function byMagic(s, m) { return R.controllableOf(s).filter(function (a) { return a.magic === m; })[0]; }
function boss(s) { return R.enemiesOf(s).filter(function (e) { return e.stand === 'boss'; })[0]; }
function minions(s) { return R.enemiesOf(s).filter(function (e) { return e.stand === 'float'; }); }
function count(s, t) { return s.tiles.filter(function (x) { return x === t; }).length; }
function at(s, m) { var a = byMagic(s, m); return [a.x, a.y]; }
// その場で待機する手
function wait(s, m) { return [m, at(s, m), 'up', false]; }
// 手（[[魔法, [x,y], 向き, 撃つか], …]）をそのターンに打ち、ターンを終える
function playTurn(s, moves) {
  var ev = [];
  moves.forEach(function (m) {
    if (s.result) return;
    var u = byMagic(s, m[0]);
    var r = R.act(s, u.id, { to: m[1], dir: m[2], shoot: m[3] });
    if (!r.ok) throw new Error(m[0] + ': ' + r.error);
    ev = ev.concat(r.events); s = r.state;
  });
  if (!s.result) { var t = R.endTurn(s); ev = ev.concat(t.events); s = t.state; }
  return { state: s, events: ev };
}
function idle(s) { return playTurn(s, [wait(s, 'mount'), wait(s, 'fire'), wait(s, 'wind')]); }
// 1ターンで山 → 火山 → 桜吹雪（一斉・1人ずつのどちらでも勝てる手。rules.js の ex3 の desc の一掃の例）
//   山使いが (1,3) から右へ（十字の真ん中 (3,3)）→ 火使いが (2,4) から上へ（十字の左の腕 (2,3) に火）→ 風使いが (1,2) から右へ（十字の上の腕 (3,2) に風）
var EARTH = ['mount', [1, 3], 'right'], FIRE = ['fire', [2, 4], 'up'], WIND = ['wind', [1, 2], 'right'];

console.log('\n■ 盤面');
test('横長（10×7）。味方は左端に山・火・風、ボス（3×3・HP20）と浮いている取り巻き（HP1）は右端から', function () {
  var s = start();
  eq([s.size, R.rowsOf(s)], [10, 7]);
  eq(R.controllableOf(s).map(function (a) { return a.magic; }), ['mount', 'fire', 'wind']);
  ok(R.controllableOf(s).every(function (a) { return a.x <= 2; }), '味方は左端');
  var b = boss(s);
  eq([b.size, b.hp, b.maxHp, b.name], [3, 20, 20, 'ボス']);
  ok(minions(s).length === 2 && minions(s).every(function (e) { return e.hp === 1 && e.body === 'float'; }), '取り巻き2体（HP1・浮く）');
  ok(R.TUTORIALS.some(function (t) { return t.id === 'ex3' && t.tutorial === 3; }), 'チュートリアルの③');
  ok(R.allyMagics(s).indexOf('smash') < 0 && R.allyMagics(s).indexOf('bite') < 0, '敵の攻撃は味方の魔法にない');
});
test('魔法は①②と同じ（オーナー 10/29 から、このステージだけの上書きはない）: 山は十字5マス、火は正面1マス', function () {
  var s = start();
  eq(R.findPreset('ex3').overrides, undefined, '上書きなし');
  eq(R.shapeCells(s, 'mount', 1, 3, 'right').length, 5);
  eq(R.shapeCells(s, 'fire', 2, 6, 'up'), [[2, 5]]);
  eq(B.shapes.mount.length, 5, 'BALANCE の山の形は元のまま');
  eq(B.shapes.fire, [[0, 1]], 'BALANCE の火の形は元のまま');
  ok(R.validOverrides({ 'shapes.fire': [[0, 1], [0, 2]] }) && !R.validOverrides({ 'shapes.fire': 3 }) && !R.validOverrides({ shapes: {} }), '形は配列でだけ上書きできる');
});

console.log('\n■ 3段のシナジー');
test('つながる: 位置が整っていれば1ターンで 山 → 火山 → 桜吹雪。ボスと扇の中の取り巻きが倒れて勝ち', function () {
  mode('chain');
  var t = playTurn(start(), [EARTH, FIRE, WIND]);
  ok(t.events.some(function (e) { return e.type === 'kindle' && e.made === 'volcano'; }), '火山になった');
  var f = t.events.filter(function (e) { return e.type === 'finisher' && e.name === '桜吹雪'; })[0];
  ok(f, '桜吹雪');
  eq(t.state.result, 'win');
  ok(!boss(t.state), 'ボスが倒れた');
  eq(R.enemiesOf(t.state).length, 0, '扇の中の取り巻きもまとめて倒れた');
  eq(Math.max.apply(null, f.cells.map(function (c) { return c[0]; })), 4 + B.eruption.depth, '扇はつながった火山の一番先 (x=4) から eruption.depth 段先まで');
  ok(count(t.state, 'petals') > 10, '空きに花びらが積もる');
  eq(count(t.state, 'volcano'), 0, '吹き終えた火山は山に戻る');
});
test('撃った瞬間に発動（1人ずつ）: 同じ順に撃てば同じく勝てる', function () {
  mode('instant');
  eq(playTurn(start(), [EARTH, FIRE, WIND]).state.result, 'win');
});
test('火山の隣にいる者は、ターン終了ごとに熱で2（敵にも味方にも）', function () {
  mode('instant');
  var t = playTurn(start(), [EARTH, FIRE, ['wind', [0, 2], 'up', false]]);
  var heat = t.events.filter(function (e) { return e.type === 'damage' && e.src === 'heat'; });
  ok(heat.some(function (e) { return e.id === byMagic(t.state, 'fire').id && e.amount === B.stage3.heat; }), '火山の隣の火の人');
  ok(heat.some(function (e) { return e.id === byMagic(t.state, 'mount').id; }), '火山の隣の山の人');
  ok(!heat.some(function (e) { return e.id === byMagic(t.state, 'wind').id; }), '離れている風の人には当たらない');
});

console.log('\n■ 敵');
test('ボス: 1ターンに1マス前へ進み、体の前の2列に一撃を予告する。山でふさがれたら進まない', function () {
  var s = start();
  var b = boss(s);
  eq([b.x, b.y, b.intent], [6, 2, true], '1ターン目の始めに1マス進んで予告');
  var fc = R.forecast(s).enemies.filter(function (p) { return p.id === b.id; })[0];
  eq(fc.cells.length, 6, '体の前の2列（3×2）');
  ok(fc.cells.every(function (c) { return c[0] === 4 || c[0] === 5; }));
  mode('instant');
  var t = playTurn(s, [EARTH, wait(s, 'fire'), wait(s, 'wind')]);   // 十字の山の右の端は (4,3)
  eq(boss(t.state).x, 5, 'ターン2の始めに x=5 まで');
  t = idle(t.state);
  eq(boss(t.state).x, 5, 'x=5 で山にふさがれて止まる');
  ok(t.events.some(function (e) { return /前をふさがれて進めない/.test(e.text || ''); }), 'ふさがれた一言');
});
test('ボス: 普通の魔法（直撃）はほとんど効かない（直撃は1）。桜吹雪の威力（20）1発で倒れる（HP20。オーナー 10/29）', function () {
  ok(B.ally.power === 1);
  eq(boss(start()).hp, B.eruption.base);
});
test('取り巻き: 風の人へ進み、隣に来たら体当たり。当たった風の人は倒れて負け。やり直すと頭から', function () {
  mode('instant');
  var s = start(), t = { state: s };
  for (var i = 0; i < 8 && !t.state.result; i++) t = idle(t.state);
  eq(t.state.result, 'lose');
  ok(t.events.some(function (e) { return e.type === 'death' && e.id === byMagic(s, 'wind').id; }), '風の人が倒れた');
  var r = R.retryStage(t.state);
  eq([r.state.turn, r.state.tries, r.state.result], [1, 1, null], 'やり直すと頭から');
});
test('取り巻きは山の上も浮いて進む', function () {
  var s = start();
  var m = minions(s)[0], w = byMagic(s, 'wind');
  for (var x = 1; x < m.x; x++) R.setTile(s, x, m.y, 'mountain');
  var plan = R.planEnemy(s, m);
  eq(plan.dist, B.stage3.minionMove, '2マス進む');
  eq(R.getTile(s, plan.to[0], plan.to[1]), 'mountain', '山の上に止まれる');
  ok(Math.abs(plan.to[0] - w.x) + Math.abs(plan.to[1] - w.y) < Math.abs(m.x - w.x) + Math.abs(m.y - w.y), '風の人へ近づく');
});
test('取り巻きは2ターンごとにボスの後ろから湧く', function () {
  mode('instant');
  var t = { state: start() }, counts = [];
  for (var i = 0; i < 4 && !t.state.result; i++) {
    t = idle(t.state);
    counts.push(t.events.filter(function (e) { return e.type === 'spawn'; }).length);
  }
  eq(counts, [0, 1, 0, 1]);
});

console.log('\n■ ヒント・文章');
test('山がないまま2ターン → ヒント（noMountain）。火山があるのに桜吹雪なしで2ターン → ヒント（noSakura）。1回の挑戦で1度だけ', function () {
  mode('step');
  var t = idle(start());
  ok(!t.events.some(function (e) { return e.type === 'exHint'; }), '1ターン目はまだ');
  t = idle(t.state);
  ok(t.events.some(function (e) { return e.type === 'exHint' && e.key === 'noMountain'; }), '2ターン目の終わりにヒント');
  t = playTurn(t.state, [['mount', at(t.state, 'mount'), 'right'], wait(t.state, 'fire'), wait(t.state, 'wind')]);
  ok(!t.events.some(function (e) { return e.type === 'exHint' && e.key === 'noMountain'; }), '2度は出ない');
  ok(count(t.state, 'mountain') > 0, '山ができた');
  var mts = [];
  t.state.tiles.forEach(function (x, i) { if (x === 'mountain') mts.push([i % t.state.size, Math.floor(i / t.state.size)]); });
  // 火の人を山の隣へ動かして火を点ける
  var f = byMagic(t.state, 'fire'), reach = R.reachableCells(t.state, f.id), hit = null;
  Object.keys(reach).some(function (k) {
    var p = k.split(',').map(Number);
    return R.DIR_ORDER.some(function (d) {
      var cells = R.shapeCells(t.state, 'fire', p[0], p[1], d);
      if (cells.some(function (c) { return mts.some(function (m) { return m[0] === c[0] && m[1] === c[1]; }); })) { hit = [p, d]; return true; }
      return false;
    });
  });
  ok(hit, '火を点けられる場所がある');
  t = playTurn(t.state, [wait(t.state, 'mount'), ['fire', hit[0], hit[1]], wait(t.state, 'wind')]);
  ok(count(t.state, 'volcano') > 0, '火山');
  if (!t.state.result) t = idle(t.state);
  ok(t.events.some(function (e) { return e.type === 'exHint' && e.key === 'noSakura'; }) || t.state.result, '火山のまま2ターンでヒント');
});
test('texts.js に、開始・ヒント2つ・ミッション・やり直し・クリアの文の置き場所と、ミッションの名前がある', function () {
  var st = TEXTS.stages.ex3;
  ok(st, 'stages.ex3');
  ['start', 'hint:noMountain', 'hint:noSakura', 'mission', 'retry', 'win'].forEach(function (k) { ok(st.scenes[k] && st.scenes[k].length, k); });
  eq(st.missions.volcano, '火山を作る');
});

console.log('\n' + passed + ' 件成功 / ' + failed.length + ' 件失敗');
if (failed.length) process.exit(1);
