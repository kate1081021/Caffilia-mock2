/*
 * プレイ集（game/plays.js）のテスト。  node tests/plays.js
 *   記録はルールの関数をそのまま打つだけ。画面と同じ「一斉」（turnMode: 'simul'）で確かめ、終わったら元に戻す。
 *   オーナー 11/10
 */
var R = require('../game/rules.js');
var B = require('../game/balance.js');
var S = require('../game/stages_io.js');
var P = require('../game/plays.js');

var passed = 0, failed = [];
function test(name, fn) {
  B.turnMode = 'simul';
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed.push(name); console.log('  NG  ' + name); console.log('        ' + (e && e.message)); }
  finally { B.turnMode = 'single'; }
}
function eq(a, b, msg) { var x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error((msg ? msg + ': ' : '') + 'expected ' + y + ' but got ' + x); }
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }

function start(id) { return R.startBattle(R.loadPreset(id)).state; }
function idOf(s, magic) { return R.controllableOf(s).filter(function (a) { return a.magic === magic; })[0].id; }
function rec(ops, stage) { return { id: 'p1', name: 'テスト', stage: stage || { kind: 'tut', uid: 'tut:tut1', name: '①' }, turns: P.split(ops), at: 1 }; }

console.log('\n■ ステージの背番号');
test('背番号のない前からのステージ・ゴミ箱の中身に付ける（名前から決まる。ゴミ箱は消す前の名前）。あるものは変えない', function () {
  var stages = { '森': { def: { rows: ['.'] }, at: 1 }, '山': { def: { rows: ['.'], uid: 'sXYZ' }, at: 2 } };
  var trash = { '川（2）': { name: '川', rec: { def: { rows: ['.'] } }, deletedAt: 3 } };
  var r = P.stamp(stages, trash);
  eq([r.changed, r.stages['森'].def.uid, r.stages['山'].def.uid, r.trash['川（2）'].rec.def.uid], [true, 'n:森', 'sXYZ', 'n:川']);
  eq([stages['森'].def.uid, trash['川（2）'].rec.def.uid], [undefined, undefined], '元の入れ物は変えない');
  eq(P.stamp(r.stages, r.trash).changed, false, '2回目は何も変わらない');
  eq(P.uidOf(r.stages['森'], '森の新しい名前'), 'n:森', '付けたあとは、名前を変えても同じ背番号');
});
test('ゴミ箱へ移して戻すと「名前（2）」になっても、背番号はそのまま（記録がついていく）', function () {
  var st = P.stamp({ '森': { def: { rows: ['.'] }, at: 1 } }, {}).stages;
  var t = S.trashPut(st, {}, '森', 10);
  var back = S.trashRestore(Object.assign({ '森': { def: { rows: ['.'], uid: 'sNEW' }, at: 2 } }, t.stages), t.trash, t.key);
  eq([back.name, P.uidOf(back.stages[back.name], back.name), P.uidOf(back.stages['森'], '森')], ['森（2）', 'n:森', 'sNEW']);
});

console.log('\n■ 打って確かめる');
test('① 火を (1,2) から上 → 発動で燃え広がり、クリア', function () {
  var s = start('tut1'), f = idOf(s, 'fire');
  var ops = [['move', f, 1, 2], ['act', f, 'up', 1], ['fire']];
  var r = P.run(R, s, ops);
  ok(r.ok, r.error);
  eq(r.state.result, 'win');
  eq(P.check(R, s, rec(ops)), { ok: true, turns: 1 });
});
test('② 山 → 水で川の壁 → クリアする（seal）', function () {
  var s = start('tut2'), m = idOf(s, 'mount'), w = idOf(s, 'water');
  var ops = [['act', m, 'up', 1], ['move', w, 1, 4], ['act', w, 'up', 1], ['fire'], ['seal']];
  eq(P.check(R, s, rec(ops)), { ok: true, turns: 2 });
});
test('③ 土・火・風で、1ターンでボスを倒す', function () {
  var s = start('ex3');
  var ops = [['move', idOf(s, 'mount'), 1, 3], ['act', idOf(s, 'mount'), 'right', 1],
    ['move', idOf(s, 'fire'), 2, 4], ['act', idOf(s, 'fire'), 'up', 1],
    ['move', idOf(s, 'wind'), 1, 2], ['act', idOf(s, 'wind'), 'right', 1], ['fire']];
  eq(P.check(R, s, rec(ops)), { ok: true, turns: 1 });
});
test('クリアにならない記録は、何ターン目で・なぜかが分かる', function () {
  var s = start('tut1'), f = idOf(s, 'fire');
  var miss = P.check(R, s, rec([['move', f, 0, 3], ['act', f, 'up', 1], ['fire']]));
  eq([miss.ok, miss.turn], [false, 2]);
  ok(/クリアにならない/.test(miss.why), miss.why);
  var bad = P.check(R, s, rec([['fire'], ['move', f, 9, 9]]));
  eq([bad.ok, bad.turn], [false, 2]);
  ok(/2ターン目で打てない手/.test(bad.why), bad.why);
  var after = P.check(R, s, rec([['move', f, 1, 2], ['act', f, 'up', 1], ['fire'], ['fire']]));
  ok(!after.ok && /勝負がついたあと/.test(after.why), after.why);
  eq(P.check(R, null, rec([['fire']])).why, 'ステージが見つからない');
});
test('ステージを変えると、古い記録はずれる（同じ手でも勝てない）', function () {
  var def = S.toDef(R, R.loadPreset('tut1'), '①の改造');
  def.enemies.forEach(function (e) { e[3] = Object.assign({}, e[3], { hp: 99 }); });
  var s0 = start('tut1'), f = idOf(s0, 'fire');
  var ops = [['move', f, 1, 2], ['act', f, 'up', 1], ['fire']];
  ok(P.check(R, s0, rec(ops)).ok, '元のステージでは勝てる');
  var s1 = R.startBattle(R.buildPreset(def)).state;
  ok(!P.check(R, s1, rec(ops)).ok, '敵が硬いと勝てない');
});

console.log('\n■ 迷った手をまとめる');
test('動き直し・向きの迷い・待機 ⇄ 構えは、最後の形だけになる（結果は同じ）', function () {
  var s = start('tut1'), f = idOf(s, 'fire');
  var raw = [['move', f, 0, 3], ['act', f, 'left', 1], ['move', f, 1, 1], ['act', f, 'up', 0], ['move', f, 1, 2], ['act', f, 'right', 1], ['act', f, 'up', 1], ['fire']];
  var t = P.tidy(R, s, raw);
  eq(t, [['move', f, 1, 2], ['act', f, 'up', 1], ['fire']]);
  ok(P.sameState(R, P.run(R, s, t).state, P.run(R, s, raw).state), '同じ盤面になる');
});
test('動いて元の位置に戻っただけ・向きが最初と同じなら、手は残らない', function () {
  var s = start('tut2'), m = idOf(s, 'mount'), u = R.findUnit(s, m);
  var raw = [['move', m, u.x, u.y - 1], ['move', m, u.x, u.y], ['act', m, 'left', 1], ['act', m, u.facing, 1], ['fire']];
  eq(P.tidy(R, s, raw), [['fire']]);
});
test('発動の順番（▲▼）は、最後の並びになるように入れ替える', function () {
  var s = start('tut2'), m = idOf(s, 'mount'), w = idOf(s, 'water');
  var raw = [['act', m, 'up', 1], ['move', w, 1, 4], ['act', w, 'up', 1], ['order', w, -1], ['order', w, 1], ['order', w, -1], ['fire']];
  var t = P.tidy(R, s, raw);
  eq(t.filter(function (op) { return op[0] === 'order'; }), [['order', w, -1]]);
  ok(P.sameState(R, P.run(R, s, t).state, P.run(R, s, raw).state), '同じ盤面になる');
});
test('待機から構えに戻すと最後に並ぶ（ルールどおり）。まとめても同じ順番', function () {
  var s = start('tut2'), m = idOf(s, 'mount'), w = idOf(s, 'water');
  var raw = [['act', m, 'up', 0], ['act', m, 'up', 1], ['move', w, 1, 4], ['fire']];
  var t = P.tidy(R, s, raw);
  ok(P.sameState(R, P.run(R, s, t).state, P.run(R, s, raw).state), '同じ盤面になる');
  eq(R.stanceList(P.run(R, s, t).state).map(function (a) { return a.id; }), [w, m], '水が先・山が後');
});
test('2ターン以上でも、ターンごとにまとめる。クリアは変わらない', function () {
  var s = start('tut2'), m = idOf(s, 'mount'), w = idOf(s, 'water');
  var raw = [['act', m, 'left', 1], ['fire'],
    ['act', m, 'down', 1], ['act', m, 'up', 1], ['move', w, 1, 4], ['act', w, 'up', 1], ['fire'], ['seal']];
  var r0 = P.run(R, s, raw);
  eq([r0.ok, r0.state.result], [true, 'win'], '元の手でクリア');
  var t = P.tidy(R, s, raw);
  ok(t.length < raw.length, '短くなる');
  eq(P.split(t).length, 3, 'ターンの数は同じ');
  eq(P.run(R, s, t).state.result, 'win');
});
test('打てない手のある記録は、まとめずにそのまま', function () {
  var s = start('tut1');
  var raw = [['move', 'nobody', 1, 1], ['fire']];
  eq(P.tidy(R, s, raw), raw);
});

console.log('\n■ 記録の形');
test('split と flat は戻る。最後のターンは発動で終わらなくてよい', function () {
  var ops = [['move', 'a', 1, 1], ['fire'], ['act', 'a', 'up', 1], ['fire'], ['seal']];
  eq(P.split(ops), [[['move', 'a', 1, 1], ['fire']], [['act', 'a', 'up', 1], ['fire']], [['seal']]]);
  eq(P.flat(P.split(ops)), ops);
});
test('valid: 形の正しい記録だけ', function () {
  ok(P.valid(rec([['fire']])));
  ok(!P.valid(rec([['jump']])), '知らない手');
  ok(!P.valid(rec([['move', 'a', 1]])), '足りない');
  ok(!P.valid(rec([['act', 'a', 'up', 2]])), '構え・待機は 1 か 0');
  ok(!P.valid(Object.assign(rec([['fire']]), { stage: { kind: 'x', uid: 'a' } })), '知らない置き場所');
  ok(!P.valid(Object.assign(rec([['fire']]), { turns: [] })), '手がない');
});

console.log('\n■ ステージの背番号');
test('背番号は定義の uid。ないときは名前から（n:名前）', function () {
  eq(P.uidOf({ def: { uid: 's123' } }, 'A'), 's123');
  eq(P.uidOf({ def: {} }, 'A'), 'n:A');
  eq(P.uidOf(null, 'A'), 'n:A');
  ok(P.newId('s') !== P.newId('s'), '毎回ちがう');
  ok(/^s/.test(P.newId('s')));
});
test('背番号は盤面の読み書き（ステージの定義の確かめ）を通る', function () {
  var def = S.toDef(R, R.loadPreset('tut1'), 'x');
  def.uid = 's1';
  ok(S.build(R, def).ok);
});

console.log('\n■ 流す順番');
function items() {
  return [{ key: 'A', rec: 'a1' }, { key: 'A', rec: 'a2' }, { key: 'B', rec: 'b1' }, { key: 'C', rec: 'c1' }, { key: 'C', rec: 'c2' }, { key: 'C', rec: 'c3' }];
}
function seeded(n) { return function () { n = (n * 9301 + 49297) % 233280; return n / 233280; }; }
function take(pl, n) { var out = []; for (var i = 0; i < n; i++) { var it = pl.next(); out.push(it ? it.rec : null); } return out; }
test('順番どおり・止まる: 一覧の順に1回ずつ流して止まる', function () {
  eq(take(P.playlist(items(), { order: 'seq', end: 'stop' }), 7), ['a1', 'a2', 'b1', 'c1', 'c2', 'c3', null]);
});
test('順番どおり・ループ: 頭に戻る', function () {
  eq(take(P.playlist(items(), { order: 'seq', end: 'loop' }), 8), ['a1', 'a2', 'b1', 'c1', 'c2', 'c3', 'a1', 'a2']);
});
test('ランダム・止まる: どのステージも1回ずつ（記録はその中から1つ）で止まる', function () {
  for (var seed = 1; seed < 40; seed++) {
    var got = take(P.playlist(items(), { order: 'random', end: 'stop' }, seeded(seed)), 4);
    eq(got[3], null, '3つで止まる');
    eq(got.slice(0, 3).map(function (r) { return r[0]; }).sort(), ['a', 'b', 'c'], 'どのステージも1回');
  }
});
test('ランダム・ループ: 同じステージが続かない（周のつなぎ目でも）。出ないステージがない。同じステージの記録は回る', function () {
  for (var seed = 1; seed < 40; seed++) {
    var got = take(P.playlist(items(), { order: 'random', end: 'loop' }, seeded(seed)), 3 * 12);
    for (var i = 1; i < got.length; i++) ok(got[i][0] !== got[i - 1][0], 'seed ' + seed + ' で ' + got.join());
    for (var r = 0; r < 12; r++) eq(got.slice(r * 3, r * 3 + 3).map(function (x) { return x[0]; }).sort(), ['a', 'b', 'c'], '各周に全部');
    var cs = got.filter(function (x) { return x[0] === 'c'; });
    for (var k = 0; k + 3 <= cs.length; k += 3) eq(cs.slice(k, k + 3).sort(), ['c1', 'c2', 'c3'], 'C の記録は3回で一回り');
  }
});
test('1つのステージだけをループ: その記録を繰り返す（記録が複数なら回る）', function () {
  eq(take(P.playlist([{ key: 'B', rec: 'b1' }], { order: 'random', end: 'loop' }), 3), ['b1', 'b1', 'b1']);
  var two = take(P.playlist([{ key: 'A', rec: 'a1' }, { key: 'A', rec: 'a2' }], { order: 'random', end: 'loop' }, seeded(3)), 6);
  for (var i = 1; i < two.length; i++) ok(two[i] !== two[i - 1], '同じ記録が続かない ' + two.join());
});
test('空の一覧は何も流さない', function () {
  eq(P.playlist([], { order: 'random', end: 'loop' }).next(), null);
});

console.log('\n' + passed + ' passed, ' + failed.length + ' failed');
if (failed.length) process.exit(1);
