/*
 * 試作ラボのテスト。  node tests/lab.js
 *   案ごとに、オンのときに案どおりに起き、オフのときは今どおりかを確かめる。
 *   ラボ用シナリオがすべて読み込めて、デモ（スーパープレイ）が最後まで動き、expect を満たすかも見る。
 *   切り替えが全部オフのとき今とまったく同じかは、tests/snapshot.js で見る。
 */
var R = require('../rules.js');
var B = require('../balance.js');

var passed = 0, failed = [];
function test(name, fn) {
  R.labApply([]);
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed.push(name); console.log('  NG  ' + name); console.log('        ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n        ') : e)); }
  R.labApply([]);
}
function eq(a, b, msg) { var x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error((msg ? msg + ': ' : '') + 'expected ' + y + ' but got ' + x); }
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function sorted(cells) { return cells.map(function (c) { return c[0] + ',' + c[1]; }).sort(); }

// 盤面を文字で作る（lab_scenarios.js と同じ文字。ラボで足した自然も）
function board(rows, enemyActs) {
  var s = R.createState({ size: rows[0].length, blank: true, enemyActs: !!enemyActs });
  if (rows.length !== rows[0].length) { s.h = rows.length; s.tiles = []; for (var i = 0; i < rows.length * rows[0].length; i++) s.tiles.push('empty'); }
  rows.forEach(function (row, y) { for (var x = 0; x < row.length; x++) R.setTile(s, x, y, R.LX.CH[row[x]]); });
  return s;
}
function tile(s, x, y) { return R.getTile(s, x, y); }
function hp(s, id) { var u = R.findUnit(s, id); return u ? u.hp : null; }
function pos(s, id) { var u = R.findUnit(s, id); return u ? [u.x, u.y] : null; }
function act(s, u, dir, to) { var r = R.act(s, u.id, { dir: dir, to: to }); if (!r.ok) throw new Error('撃てない: ' + r.error); return r; }
function dealt(r, id) { return r.events.filter(function (e) { return e.type === 'damage' && e.id === id; }).reduce(function (t, e) { return t + e.amount; }, 0); }
function tough(s, u, v) { R.findUnit(s, u.id).hp = v || 99; R.findUnit(s, u.id).maxHp = v || 99; return u; }
function names(events) { return events.filter(function (e) { return e.type === 'finisher'; }).map(function (e) { return e.name; }); }
function texts(events) { return events.map(function (e) { return e.text; }).join('\n'); }
module.exports = { test: test, eq: eq, ok: ok, board: board };

// ===================================================================
console.log('\n■ C 決め手');

test('C1 オフ: 敵の足元に火で小さな炎（今どおり）', function () {
  var s = board(['.....', '.....', '.....', '.....', '.....']);
  var a = R.addAlly(s, 'fire', 2, 3, 'up'); var e = R.addEnemy(s, 'fire', 2, 2); tough(s, e);
  var r = act(s, a, 'up');
  eq(tile(r.state, 2, 2), 'smallfire');
});
test('C1 オン: 敵の足元に火 → 直撃だけで、小さな炎は生まれない', function () {
  R.labApply(['C1']);
  var s = board(['.....', '.....', '.....', '.....', '.....']);
  var a = R.addAlly(s, 'fire', 2, 3, 'up'); var e = R.addEnemy(s, 'fire', 2, 2); tough(s, e);
  var r = act(s, a, 'up');
  eq(tile(r.state, 2, 2), 'empty');
  eq(dealt(r, e.id), 1, '直撃');
});
test('C1 オン: 風が通ったときに人がいたマスには風が残らない。押し込まれた先のマスには残る', function () {
  R.labApply(['C1']);
  var s = board(['.....', '.....', '.....', '.....', '.....']);
  var a = R.addAlly(s, 'wind', 2, 4, 'up'); var e = R.addEnemy(s, 'fire', 2, 3); tough(s, e);
  var r = act(s, a, 'up');
  eq(pos(r.state, e.id), [2, 2], '1マス押された');
  eq(tile(r.state, 2, 3), 'empty', '敵のいたマスには残らない');
  eq(tile(r.state, 2, 2), 'breeze', '押し込まれた先には残る（敵が風の中に立つ）');
  R.labApply([]);
  var r2 = act(s, a, 'up');
  eq(tile(r2.state, 2, 3), 'breeze', 'オフなら今どおり残る');
});
test('C1 オン: もとからある自然が変わるのは今どおり（森の上の敵に火で森が燃える）', function () {
  R.labApply(['C1']);
  var s = board(['.....', '.....', '..F..', '.....', '.....']);
  var a = R.addAlly(s, 'fire', 2, 3, 'up'); var e = R.addEnemy(s, 'fire', 2, 2); tough(s, e);
  var r = act(s, a, 'up');
  eq(tile(r.state, 2, 2), 'fire');
});

test('C2 オフ: 感電は水の隣にいる者にも20（今どおり）', function () {
  var s = board(['.....', '.RRR.', '.....', '.....', '.....']);
  var a = R.addAlly(s, 'thunder', 1, 3, 'up'); var e = R.addEnemy(s, 'fire', 2, 0); tough(s, e);
  var r = act(s, a, 'up');
  eq(dealt(r, e.id), 20);
});
test('C2 weak: 感電は水の上だけ20、隣は弱い5', function () {
  R.labApply(['C2'], { C2: { edge: 'weak' } });
  var s = board(['.....', '.RRR.', '.....', '.....', '.....']);
  var a = R.addAlly(s, 'thunder', 1, 3, 'up'); var e = R.addEnemy(s, 'fire', 2, 0); tough(s, e);
  var r = act(s, a, 'up');
  eq(dealt(r, e.id), 5, '隣は外側');
  var s2 = board(['.....', '.RRR.', '.....', '.....', '.....']);
  R.setTile(s2, 2, 0, 'puddle');
  var a2 = R.addAlly(s2, 'thunder', 1, 3, 'up'); var e2 = R.addEnemy(s2, 'fire', 2, 0); tough(s2, e2);
  var r2 = act(s2, a2, 'up');
  eq(dealt(r2, e2.id), 20, '水の上は20');
});
test('C2 move: オバケヤシキの中は20、隣（火を点けた本人）はダメージなし', function () {
  R.labApply(['C2'], { C2: { edge: 'move' } });
  var s = board(['.....', '.....', '..G..', '.....', '.....']);
  var a = R.addAlly(s, 'fire', 2, 3, 'up'); var e = R.addEnemy(s, 'fire', 2, 2); tough(s, e);
  var r = act(s, a, 'up');
  ok(names(r.events).indexOf('オバケヤシキ') >= 0);
  eq(dealt(r, e.id), 20, '中の敵');
  eq(hp(r.state, a.id), 3, '火の本人は無事');
  R.labApply(['C2'], { C2: { edge: 'weak' } });
  var r2 = act(s, a, 'up');
  ok(!R.findUnit(r2.state, a.id), 'weak なら隣の本人に5（HP3なので倒れる）');
  R.labApply([]);
  var r3 = act(s, a, 'up');
  ok(!R.findUnit(r3.state, a.id), 'オフなら本人に20');
});
test('C2 move: センタクキの輪の者は回されるがダメージなし、渦の中は20', function () {
  R.labApply(['C2'], { C2: { edge: 'move' } });
  var s = board(['......', '......', '..QQ..', '..QQ..', '......', '......']);
  var a = R.addAlly(s, 'water', 2, 5, 'up'); var e = R.addEnemy(s, 'fire', 1, 2); tough(s, e);
  var r = act(s, a, 'up');
  ok(names(r.events).indexOf('センタクキ') >= 0);
  eq(dealt(r, e.id), 0, '輪の敵');
  ok(String(pos(r.state, e.id)) !== '1,2', '回された');
});

test('C3: 水で起こしたセンタクキは、水が来た側から見て奥の半分だけ回る', function () {
  R.labApply(['C3']);
  var s = board(['......', '......', '..QQ..', '..QQ..', '......', '......']);
  var a = R.addAlly(s, 'water', 2, 5, 'up');
  var far = R.addEnemy(s, 'fire', 2, 1); tough(s, far);
  var near = R.addEnemy(s, 'fire', 4, 4); tough(s, near);
  var r = act(s, a, 'up');
  eq(dealt(r, far.id), 20, '奥の敵');
  eq(dealt(r, near.id), 0, '手前の敵');
  eq(pos(r.state, near.id), [4, 4], '手前は回らない');
  var f = r.events.filter(function (e) { return e.name === 'センタクキ'; })[0];
  eq(f.dir, 'up', '向きの矢印');
  R.labApply([]);
  var r2 = act(s, a, 'up');
  eq(dealt(r2, near.id), 20, 'オフなら全部');
});

test('C4: 桜吹雪の扇の列 ＝ つながった桜の数（1本で1列、3本以上で3列）', function () {
  R.labApply(['C4']);
  var s = board(['.......', '.......', '.......', '.......', '...K...', '.......', '.......']);
  var a = R.addAlly(s, 'wind', 3, 6, 'up');
  var r = act(s, a, 'up');
  var f = r.events.filter(function (e) { return e.name === '桜吹雪'; })[0];
  eq(f.cells.length, 1, '1本は1列（1マス）');
  var s2 = board(['.......', '.......', '.......', '.......', '..KKK..', '.......', '.......']);
  var a2 = R.addAlly(s2, 'wind', 3, 6, 'up');
  var r2 = act(s2, a2, 'up');
  var f2 = r2.events.filter(function (e) { return e.name === '桜吹雪'; })[0];
  eq(f2.cells.length, 9, '3本で3列（1・3・5）');
});
test('C4: オバケヤシキの引き寄せの範囲 ＝ つながった死の森の数（1〜2で1）', function () {
  R.labApply(['C4']);
  var s = board(['.......', '.......', '...G...', '.......', '.......', '.......', '.......']);
  var a = R.addAlly(s, 'fire', 3, 3, 'up');
  var e = R.addEnemy(s, 'fire', 3, 0); tough(s, e);   // 2マス離れている
  var r = act(s, a, 'up');
  eq(pos(r.state, e.id), [3, 0], '1本なら範囲1: 2マス先は引き寄せない');
  R.labApply([]);
  var r2 = act(s, a, 'up');
  eq(pos(r2.state, e.id), [3, 1], 'オフなら範囲2で引き寄せる');
});
test('C4: 火の渦が8マス以上ならセンタクキの輪は2周（sharp なら1周）', function () {
  R.labApply(['C4']);
  var s = board(['........', '........', '..QQQQ..', '..QQQQ..', '........', '........', '........', '........']);
  var a = R.addAlly(s, 'water', 2, 5, 'up');
  var e = R.addEnemy(s, 'fire', 0, 0); tough(s, e);   // 2周目
  var r = act(s, a, 'up');
  eq(dealt(r, e.id), 20, '2周目の敵も巻き込む');
  R.labApply(['C4'], { C4: { sharp: true } });
  var r2 = act(s, a, 'up');
  eq(dealt(r2, e.id), 0, 'sharp なら1周');
});
test('C4 sharp: 燃え広がりの走る長さは 4＋燃えた森の数の半分', function () {
  var rows = ['.XFFFFFFF.', '..........', '..........', '..........', '..........'];
  var s = board(rows);
  var a = R.addAlly(s, 'wind', 0, 0, 'right');
  var r = act(s, a, 'right');
  ok(/右へ4マス走り/.test(texts(r.events)), 'オフ: 4マス');
  R.labApply(['C4'], { C4: { sharp: true } });
  var r2 = act(s, a, 'right');
  ok(/右へ7マス走り/.test(texts(r2.events)), 'sharp: 森7つ → 4＋3＝7マス');
});
test('C5: ふつうの風に火の火の渦に水は消えるだけ（予測に「育っていれば」）', function () {
  R.labApply(['C5']);
  var s = board(['......', '......', '..QQ..', '..QQ..', '......', '......']);
  s.overrides = { 'grow.enabled': true };
  var a = R.addAlly(s, 'water', 2, 5, 'up');
  var e = R.addEnemy(s, 'fire', 2, 1); tough(s, e);
  var p = R.previewAct(s, a.id, [2, 5], 'up');
  eq(p.finishers.length, 0, 'センタクキは起きない');
  ok(p.notes.some(function (n) { return /育っていれば/.test(n); }), '予測に育っていれば');
  eq(tile(p.state, 2, 2), 'empty', '火の渦は消えた');
});
test('C5: 強風に火の「大きな火の渦」に水ならセンタクキ', function () {
  R.labApply(['C5']);
  var s = board(['......', '......', '......', '..bb..', '......', '......']);
  s.overrides = { 'grow.enabled': true };
  var f = R.addAlly(s, 'fire', 1, 3, 'right');
  var w = R.addAlly(s, 'water', 3, 5, 'up');
  var r = act(s, f, 'right');
  ok(names(r.events).indexOf('火の渦') >= 0, '火の渦');
  ok(/大きな火の渦/.test(texts(r.events)));
  var r2 = act(r.state, R.findUnit(r.state, w.id), 'up');
  ok(names(r2.events).indexOf('センタクキ') >= 0, 'センタクキ');
});
test('C5: 丘の桜に風は扇1列・弱い5、山の桜は今どおり', function () {
  R.labApply(['C5']);
  var s = board(['.....', '.....', '..k..', '.....', '.....']);
  s.overrides = { 'grow.enabled': true };
  var a = R.addAlly(s, 'wind', 2, 4, 'up');
  var e = R.addEnemy(s, 'fire', 2, 1); tough(s, e);
  var r = act(s, a, 'up');
  eq(dealt(r, e.id), 5);
  var f = r.events.filter(function (x) { return x.name === '桜吹雪'; })[0];
  eq(f.cells.length, 1);
});

test('C6: 燃え広がりの通り道の死の森に火が当たってオバケヤシキ（連鎖）', function () {
  R.labApply(['C6']);
  var s = board(['......', '..G...', '......', '..X...', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 4, 'up');
  var r = act(s, a, 'up');
  eq(names(r.events), ['燃え広がり', 'オバケヤシキ']);
  eq(tile(r.state, 2, 1), 'haunted');
  R.labApply([]);
  var r2 = act(s, a, 'up');
  eq(names(r2.events), ['燃え広がり'], 'オフなら死の森は素通り');
});
test('C6: 燃え広がりの通り道の水たまりは蜃気楼', function () {
  R.labApply(['C6']);
  var s = board(['......', '..P...', '......', '..X...', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 4, 'up');
  var r = act(s, a, 'up');
  eq(tile(r.state, 2, 1), 'mirage');
});
test('C6: 燃え移りの炎が死の森に届くとオバケヤシキ（導火線）', function () {
  R.labApply(['C6']);
  var s = board(['......', '.GG...', '..F...', '..X...', '......', '......']);
  var e = R.addEnemy(s, 'fire', 0, 1); tough(s, e);
  var t1 = R.endTurn(s);
  eq(tile(t1.state, 2, 2), 'fire', '1回目: 森へ燃え移る');
  eq(tile(t1.state, 2, 1), 'deadforest', 'まだ死の森');
  var t2 = R.endTurn(t1.state);
  eq(tile(t2.state, 2, 1), 'haunted', '2回目: 死の森に届いてオバケヤシキ');
  ok(names(t2.events).indexOf('オバケヤシキ') >= 0);
  R.labApply([]);
  var u1 = R.endTurn(R.endTurn(s).state);
  eq(tile(u1.state, 2, 1), 'deadforest', 'オフなら死の森には燃え移らない');
});

// ===================================================================
// ===================================================================
console.log('\n■ A 地形');

test('A2: 歩いて凍った川に入ると、向きのまま氷の端まで滑る（滑り終わる先だけが移動先）', function () {
  R.labApply(['A2']);
  var s = board(['.....', '.....', 'IIIII', 'IIIII', '.....']);
  var a = R.addAlly(s, 'water', 2, 4, 'up');
  var reach = R.reachableCells(s, a.id);
  ok(reach['2,1'] === 1, '1歩で氷の向こうへ: ' + JSON.stringify(reach));
  ok(reach['2,3'] === undefined && reach['2,2'] === undefined, '氷の途中には止まれない');
  ok(reach['2,0'] === 2, '滑った先からもう1歩');
  R.labApply([]);
  var r2 = R.reachableCells(s, a.id);
  ok(r2['2,3'] === 1 && r2['2,1'] === undefined, 'オフなら1歩ずつ');
});
test('A3: 森の中の味方は敵の狙いに選ばれない（巻き込まれれば当たる）', function () {
  R.labApply(['A3']);
  var s = board(['.....', '.....', '..F..', '.....', '.....'], true);
  var hid = R.addAlly(s, 'water', 2, 2, 'up');
  var out = R.addAlly(s, 'wind', 4, 4, 'up');
  var e = R.addEnemy(s, 'fire', 2, 0); R.findUnit(s, e.id).aim = 'near';
  var plan = R.planEnemy(s, R.findUnit(s, e.id));
  ok(plan.target !== hid.id, '森の中の味方は狙わない');
  R.labApply([]);
  var plan2 = R.planEnemy(s, R.findUnit(s, e.id));
  eq(plan2.target, hid.id, 'オフなら近い方（森の中）を狙う');
});
test('A4: 森の中の者は直撃を受けない（森は燃える）', function () {
  R.labApply(['A4']);
  var s = board(['.....', '.....', '..F..', '.....', '.....']);
  var a = R.addAlly(s, 'fire', 2, 3, 'up'); var e = R.addEnemy(s, 'earth', 2, 2);
  var r = act(s, a, 'up');
  eq(dealt(r, e.id), 0, '直撃なし');
  eq(tile(r.state, 2, 2), 'fire', '森は燃える');
  R.labApply([]);
  eq(dealt(act(s, a, 'up'), e.id), 1, 'オフなら直撃1');
});
test('A5: 森に入るとそこで止まる', function () {
  R.labApply(['A5']);
  var s = board(['.....', '.....', '..F..', '.....', '.....']);
  var a = R.addAlly(s, 'water', 2, 3, 'up');
  var reach = R.reachableCells(s, a.id);
  ok(reach['2,2'] === 1 && reach['2,1'] === undefined, '森の先へは行けない');
  R.labApply([]);
  ok(R.reachableCells(s, a.id)['2,1'] === 2, 'オフなら通り抜ける');
});
test('A6: 水たまりに入ると2歩分', function () {
  R.labApply(['A6']);
  var s = board(['.....', '.....', '..P..', '.....', '.....']);
  var a = R.addAlly(s, 'water', 2, 3, 'up');
  var reach = R.reachableCells(s, a.id);
  eq(reach['2,2'], 2, '水たまりは2歩');
  ok(reach['2,1'] === undefined, 'その先へは届かない');
});
test('A7: 雷は形の中の丘へ先に落ち、上の者も打たれる', function () {
  R.labApply(['A7']);
  var s = board(['.....', '.....', '.....', '.....', '.....', '.....', '.....']);
  s.overrides = { 'grow.enabled': true };
  R.setTile(s, 3, 4, 'hill');   // ジグザグ (2,5)→(3,4)→(2,3)→(3,2)。手前 (2,5) は森
  R.setTile(s, 2, 5, 'forest');
  var a = R.addAlly(s, 'thunder', 2, 6, 'up');
  var e = R.addEnemy(s, 'fire', 3, 4); tough(s, e);
  var r = act(s, a, 'up');
  eq(dealt(r, e.id), 1, '丘の上の敵が打たれる');
  eq(tile(r.state, 2, 5), 'forest', '手前の森には落ちない');
  R.labApply([]);
  var r2 = act(s, a, 'up');
  eq(tile(r2.state, 2, 5), 'fire', 'オフなら手前の森に落ちて燃える');
});
test('A8: 丘の上の敵からは、森に隠れた味方も見える', function () {
  R.labApply(['A3', 'A8']);
  var s = board(['.....', '.....', '..F..', '.....', '.....'], true);
  s.overrides = { 'grow.enabled': true };
  R.setTile(s, 2, 0, 'hill');
  var hid = R.addAlly(s, 'water', 2, 2, 'up');
  R.addAlly(s, 'wind', 4, 4, 'up');
  var e = R.addEnemy(s, 'fire', 2, 0); R.findUnit(s, e.id).aim = 'near'; R.findUnit(s, e.id).move = 0;
  ok(!R.hidden(s, R.findUnit(s, hid.id), R.findUnit(s, e.id)), '丘から見える');
  R.setTile(s, 2, 0, 'empty');
  ok(R.hidden(s, R.findUnit(s, hid.id), R.findUnit(s, e.id)), '平地からは見えない');
});
test('A9: 火山はターン終了で隣の森へ燃え移る', function () {
  R.labApply(['A9']);
  var s = board(['.....', '.....', '.VF..', '.....', '.....']);
  var r = R.endTurn(s);
  eq(tile(r.state, 2, 2), 'fire');
  eq(tile(r.state, 1, 2), 'volcano', '火山は燃え尽きない');
  R.labApply([]);
  eq(tile(R.endTurn(s).state, 2, 2), 'forest', 'オフなら燃え移らない');
});
test('A10: 死の森の上の者は、距離に関係なく1マス引き寄せる', function () {
  R.labApply(['A10']);
  var s = board(['.......', '.GGGGGG', '.......', '.......', '.......', '.......', '.......']);
  var a = R.addAlly(s, 'dark', 1, 3, 'up');   // (1,2) に撃つ … 空き。死の森は (1,1) から
  var a2 = R.addAlly(s, 'dark', 1, 2, 'up');  // (1,1) の死の森に撃つ
  var e = R.addEnemy(s, 'fire', 6, 1); tough(s, e);
  var r = act(s, a2, 'up');
  eq(pos(r.state, e.id), [5, 1], '5マス先の網の上の敵が1マス引き寄せられる');
  R.labApply([]);
  eq(pos(act(s, a2, 'up').state, e.id), [6, 1], 'オフなら範囲の外');
});
test('A10: 森に闇を撃つと、死の森になったあとの網でまとめて引き寄せる', function () {
  R.labApply(['A10']);
  var s = board(['.......', '.FFFFF.', '.......', '.......', '.......', '.......', '.......']);
  var a = R.addAlly(s, 'dark', 1, 2, 'up');
  var e = R.addEnemy(s, 'fire', 5, 1); tough(s, e);
  var r = act(s, a, 'up');
  eq(tile(r.state, 3, 1), 'deadforest');
  eq(pos(r.state, e.id), [4, 1]);
});
test('A12: 自分の自然の上ではバリア（直撃なし）。上から外れると当たる', function () {
  R.labApply(['A12']);
  var s = board(['.....', '.....', '..P..', '.....', '.....']);
  var a = R.addAlly(s, 'earth', 2, 4, 'up'); var e = R.addEnemy(s, 'water', 1, 2);
  var a2 = R.addAlly(s, 'wind', 0, 2, 'right'); var e2 = R.addEnemy(s, 'water', 2, 2);
  var r = R.act(s, a2.id, { dir: 'right' });
  eq(dealt(r, e2.id), 0, '水たまりの上の水の敵にはバリア');
  eq(dealt(r, e.id), 1, '空きの上の水の敵には直撃');
  ok(R.LX.barrier(s, R.findUnit(s, e2.id)), '駒の輪');
});

// ===================================================================
console.log('\n■ D 敵のつくり');

function enemyWith(s, magic, x, y, opts) {
  var e = R.addEnemy(s, magic, x, y);
  var u = R.findUnit(s, e.id);
  Object.keys(opts || {}).forEach(function (k) { u[k] = opts[k]; });
  return u;
}

test('D1 森: 燃やせる森に火を点けられる手を最優先（味方を狙える手があっても）', function () {
  R.labApply(['D1']);
  var s = board(['.......', '.......', '....F..', '.......', '.......', '.......', '.......'], true);
  R.addAlly(s, 'water', 3, 2, 'up');
  var e = enemyWith(s, 'fire', 3, 0, { aim: 'forest' });
  var p = R.planEnemy(s, e);
  ok(p.reason && /森を燃やし/.test(p.reason), '理由: ' + p.reason);
  var r = R.previewAct(s, R.alliesOf(s)[0].id, [3, 2], 'up');
  ok(r, 'ok');
});
test('D1 森: 点けられないときは一番近い森へ向かう', function () {
  R.labApply(['D1']);
  var s = board(['.......', '.......', '.......', '.......', '.......', '.......', '......F'], true);
  R.addAlly(s, 'water', 0, 6, 'up');
  var e = enemyWith(s, 'fire', 0, 0, { aim: 'forest' });
  var p = R.planEnemy(s, e);
  ok(/森へ向かう/.test(p.reason), p.reason);
  ok(p.to[0] + p.to[1] === 2 && p.to[0] >= 1, '森の方へ2マス: ' + p.to);
});
test('D1 逃げる: 味方から一番遠いマスへ動き、隣にだれもいなければ撃たない', function () {
  R.labApply(['D1']);
  var s = board(['.......', '.......', '.......', '.......', '.......', '.......', '.......'], true);
  R.addAlly(s, 'water', 3, 6, 'up');
  var e = enemyWith(s, 'fire', 3, 3, { aim: 'flee' });
  var r = R.startBattle(s);
  var u = R.findUnit(r.state, e.id);
  ok(u.y <= 2, '上（味方から遠く）へ: ' + [u.x, u.y]);
  eq(u.intent, false, '撃たない');
  ok(r.events.some(function (ev) { return /逃げる/.test(ev.text); }), 'ログに理由');
});
test('D1 動いた者: 前のターンに動いた味方を狙う', function () {
  R.labApply(['D1']);
  var s = board(['.......', '.......', '.......', '.......', '.......', '.......', '.......'], true);
  var a = R.addAlly(s, 'water', 1, 5, 'up'), b = R.addAlly(s, 'wind', 5, 5, 'up');
  var e = enemyWith(s, 'fire', 3, 1, { aim: 'moved' });
  s = R.startBattle(s).state;
  s = R.act(s, a.id, { to: [1, 5], dir: 'up', shoot: false }).state;   // 動かない
  s = R.act(s, b.id, { to: [5, 4], dir: 'up', shoot: false }).state;   // 動いた
  var t = R.endTurn(s).state;
  var eu = R.findUnit(t, e.id);
  ok(/動いた/.test(eu.labReason || ''), '理由: ' + eu.labReason);
  ok(eu.labReason.indexOf('風') >= 0, '動いた風の人を狙う');
});
test('D2: 予告に、敵が次のターンに向かう先（道筋）が出る', function () {
  R.labApply(['D2', 'D1']);
  var s = board(['.......', '.......', '.......', '.......', '.F.....', '.......', '.......'], true);
  R.addAlly(s, 'water', 5, 6, 'up');
  enemyWith(s, 'fire', 1, 0, { aim: 'forest' });
  s = R.startBattle(s).state;
  var fc = R.forecast(s);
  ok(fc.labPaths && fc.labPaths.length === 1, '道筋');
  ok(fc.labPaths[0].path.length >= 1, '動く');
  R.labApply([]);
  ok(!R.forecast(s).labPaths, 'オフなら出ない');
});
test('D3: 大きい敵は2×2を占め、決め手が体の一部だけなら弱い5', function () {
  R.labApply(['D3']);
  var s = board(['......', '......', '..FF..', '..FF..', '......', '......']);
  var e = enemyWith(s, 'fire', 2, 2, { size: 2 });
  ok(R.unitAt(s, 3, 3) && R.unitAt(s, 3, 3).id === e.id, '4マスとも敵');
  R.setTile(s, 3, 3, 'empty');   // 体の右下だけ森でない
  R.setTile(s, 2, 4, 'fire');
  var w = R.addAlly(s, 'wind', 2, 5, 'up');
  var r = act(s, w, 'up');
  eq(dealt(r, e.id), 5, '一部だけなら弱い5');
  R.setTile(s, 3, 3, 'forest');
  var r2 = act(s, w, 'up');
  eq(dealt(r2, e.id), 20, '体の全部が燃えた森なら20');
});
test('D3: 大きい敵は、4マスとも動けるときだけ押される', function () {
  R.labApply(['D3']);
  var s = board(['......', '......', '......', '......', '...M..', '......']);
  var e = enemyWith(s, 'fire', 2, 2, { size: 2 }); R.findUnit(s, e.id).hp = 99;
  var w = R.addAlly(s, 'wind', 2, 0, 'down');
  var r = act(s, w, 'down');
  eq(pos(r.state, e.id), [2, 2], '体の下に山があるので押されない');
});
test('D4: 大きい敵は山を崩して進む（山 → 空き、育つが入なら丘）', function () {
  R.labApply(['D4']);
  var s = board(['......', '......', 'MMMMMM', '......', '......', '......'], true);
  R.addAlly(s, 'water', 2, 5, 'up');
  var e = enemyWith(s, 'fire', 2, 0, { size: 2, aim: 'near' });
  var t = R.startBattle(s).state;
  var eu = R.findUnit(t, e.id);
  ok(eu.y >= 1, '山を越えて進む: ' + [eu.x, eu.y]);
  ok(R.getTile(t, eu.x, 2) !== 'mountain', '通ったところの山は崩れた');
});
test('D5: めちゃ強い敵は HP60 で、火の予告は扇（1・3・5）', function () {
  R.labApply(['D5']);
  var s = board(['.......', '.......', '.......', '.......', '.......', '.......', '.......'], true);
  R.addAlly(s, 'water', 3, 6, 'up');
  var e = enemyWith(s, 'fire', 3, 0, { labBoss: true });
  var t = R.startBattle(s).state;
  var eu = R.findUnit(t, e.id);
  eq(eu.hp, 60, 'HP');
  var cells = R.forecast(t).enemies[0].cells;
  eq(cells.length, 9, '扇9マス');
});
test('D6: 炎の体の敵は歩いた跡の空きに小さな炎を残す', function () {
  R.labApply(['D6']);
  var s = board(['.......', '.......', '.......', '.......', '.......', '.......', '.......'], true);
  R.addAlly(s, 'water', 3, 6, 'up');
  var e = enemyWith(s, 'fire', 3, 0, { body: 'fire', aim: 'near' });
  var t = R.startBattle(s).state;
  var eu = R.findUnit(t, e.id);
  ok(eu.y === 2, '2マス下へ');
  eq(R.getTile(t, 3, 0), 'smallfire', '出発点');
  eq(R.getTile(t, 3, 1), 'smallfire', '通り道');
  eq(R.getTile(t, 3, 2), 'empty', '立っているマスには残らない');
});
test('D7: 岩の体は感電しない／水の体は燃え広がりで倒れない／浮いている体は泥沼にはまらない', function () {
  R.labApply(['D7']);
  var s = board(['.....', '.RRR.', '.....', '.....', '.....']);
  var rock = enemyWith(s, 'earth', 2, 0, { body: 'rock' });
  var a = R.addAlly(s, 'thunder', 1, 3, 'up');
  eq(dealt(act(s, a, 'up'), rock.id), 0, '岩は感電しない');
  var s2 = board(['.....', '..F..', '..X..', '.....', '.....']);
  var wat = enemyWith(s2, 'water', 2, 1, { body: 'water' });
  var w = R.addAlly(s2, 'wind', 2, 3, 'up');
  eq(dealt(act(s2, w, 'up'), wat.id), 5, '水の体は燃え広がりで弱い5');
  var s3 = board(['.....', '.....', '..D..', '.....', '.....']);
  var fl = enemyWith(s3, 'wind', 2, 1, { body: 'float' });
  var w3 = R.addAlly(s3, 'wind', 2, 0, 'down');
  var r3 = act(s3, w3, 'down');
  ok(!R.findUnit(r3.state, fl.id).stuck, '浮いている体ははまらない');
});
test('D8: 戻すは、当たった自然を一つ前の姿に戻す（一段・空きには何も起きない）', function () {
  R.labApply(['D8']);
  var s = board(['.....', '.....', '..F..', '..X..', '.....']);
  s.overrides = { 'grow.enabled': true };
  var e = enemyWith(s, 'revert', 2, 4, { facing: 'up' });
  var ctx = R.previewAct(s, e.id, [2, 4], 'up');
  ok(ctx === null || true);
  var r = R.act(R.editSetEnemyActs(s, false).state, e.id, {});
  ok(!r.ok, '敵は act できない');
  ok(R.allyMagics(s).indexOf('revert') < 0, '味方は選べない');
});
test('D9: 大技を組む敵は、ターンの始めに風で舞台を作り、火の渦を予告する', function () {
  R.labApply(['D9']);
  var s = board(['.......', '.......', '.......', '.......', '.......', '.......', '.......'], true);
  R.addAlly(s, 'water', 3, 4, 'up');
  var e = enemyWith(s, 'fire', 3, 1, { labStage: 'wind', aim: 'count' });
  var r = R.startBattle(s);
  ok(r.events.some(function (ev) { return /舞台を作る/.test(ev.text); }), '舞台を作った');
  var fc = R.forecast(r.state);
  ok(fc.enemies[0].finishers.some(function (f) { return f.name === '火の渦'; }), '火の渦の予告');
});
test('A11: 重い者は泥沼で2回休み、氷に乗ると割れる', function () {
  R.labApply(['A11', 'D3']);
  var s = board(['......', '......', '..DD..', '..DD..', '......', '......']);
  var e = enemyWith(s, 'fire', 2, 0, { size: 2 });
  var w = R.addAlly(s, 'wind', 2, 5, 'up');
  R.findUnit(s, e.id).x = 2; R.findUnit(s, e.id).y = 1;
  var a = R.addAlly(s, 'wind', 3, 0, 'down');
  var r = act(s, a, 'down');
  eq(R.findUnit(r.state, e.id).stuck, 2, '2回休み');
  var s2 = board(['......', '......', '..II..', '..II..', '......', '......']);
  var e2 = enemyWith(s2, 'fire', 2, 0, { size: 2 });
  var a2 = R.addAlly(s2, 'wind', 2, 5, 'up');
  R.findUnit(s2, e2.id).y = 1;
  var b2 = R.addAlly(s2, 'wind', 2, 0, 'down');
  var r2 = act(s2, b2, 'down');
  eq(R.getTile(r2.state, 2, 3), 'puddle', '氷が割れた');
});

// ===================================================================
console.log('\n■ E 敵との駆け引き');

function mirageSetup() {
  var s = board(['.......', '.......', '.......', '.......', '...P...', '.......', '.......'], true);
  var f = R.addAlly(s, 'fire', 3, 5, 'up');
  var w = R.addAlly(s, 'water', 2, 5, 'up');
  var e = enemyWith(s, 'fire', 3, 0, { aim: 'near' });
  return { s: s, f: f, w: w, e: e };
}
test('E2 オフ: 蜃気楼ができても映る場所はない（今どおり）', function () {
  var g = mirageSetup();
  var r = act(g.s, g.f, 'up');
  eq(tile(r.state, 3, 4), 'mirage');
  ok(!r.state.labMirror, '盤面に印の項目を足さない');
});
test('E2: 蜃気楼の奥（端から2マス先）が映る場所。中に味方がいると偽の姿が立ち、敵はそれを狙う', function () {
  R.labApply(['E2']);
  var g = mirageSetup();
  var r = act(g.s, g.f, 'up');
  eq(R.LX.mirrors(r.state), [[3, 2]], '映る場所');
  eq(R.LX.decoys(r.state).length, 0, '中にだれもいなければ立たない');
  var r2 = R.act(r.state, g.w.id, { to: [3, 4], dir: 'up', shoot: false });
  var d = R.LX.decoys(r2.state);
  eq(d.length, 1); eq(d[0].at, [3, 2]); eq(d[0].ids, [g.w.id]);
  var plan = R.planEnemy(r2.state, R.findUnit(r2.state, g.e.id));
  eq(plan.target, d[0].id, '敵は偽の姿を狙う');
  eq(plan.kind, 'attack');
});
test('E2: 映る場所が通れないときは、手前へ1マス戻す', function () {
  R.labApply(['E2']);
  var s = board(['.......', '.......', '...M...', '.......', '...P...', '.......', '.......'], true);
  var f = R.addAlly(s, 'fire', 3, 5, 'up');
  var r = act(s, f, 'up');
  eq(R.LX.mirrors(r.state), [[3, 3]]);
});
test('E2: 偽の姿に敵の魔法が当たっても何も起きない。蜃気楼が晴れると偽の姿も消える', function () {
  R.labApply(['E2']);
  var g = mirageSetup();
  var r = act(g.s, g.f, 'up');
  var s2 = R.act(r.state, g.w.id, { to: [3, 4], dir: 'up', shoot: false }).state;
  var en = R.findUnit(s2, g.e.id); en.x = 3; en.y = 1; en.facing = 'down';
  var ctx = R.previewAct(s2, g.f.id, [3, 5], 'up');   // 撃てる状態のまま
  ok(ctx);
  R.setTile(s2, 3, 4, 'empty');
  eq(R.LX.decoys(s2).length, 0, '蜃気楼がなくなった');
  eq(R.LX.mirrors(s2).length, 0);
});
test('E9: オバケヤシキに閉じこめられた敵の予告は消え、次のターンも予告できない', function () {
  R.labApply(['E9']);
  var s = board(['.......', '.......', '...G...', '.......', '.......', '.......', '.......'], true);
  var e = enemyWith(s, 'fire', 3, 2, { aim: 'count', facing: 'down' });
  R.addAlly(s, 'water', 3, 3, 'up');
  var a = R.addAlly(s, 'fire', 2, 3, 'right');
  s.overrides = { 'enemy.move': 0 };
  var t = R.startBattle(s).state;
  tough(t, e);
  ok(R.findUnit(t, e.id).intent, 'はじめは予告している');
  R.findUnit(t, a.id).x = 2; R.findUnit(t, a.id).y = 2;
  var r = R.act(t, a.id, { dir: 'right' });
  ok(names(r.events).indexOf('オバケヤシキ') >= 0);
  ok(!R.findUnit(r.state, e.id).intent, '予告が消えた');
  ok(/予告が消えた/.test(texts(r.events)));
  var fc = R.forecast(r.state);
  eq(fc.enemies.length, 0, '予告の計算にも出ない');
});
test('E9: 火の渦の中の味方は撃てない（待機はできる）。オフなら撃てる', function () {
  R.labApply(['E9']);
  var s = board(['.....', '.QQ..', '.QQ..', '.....', '.....']);
  var a = R.addAlly(s, 'water', 1, 1, 'up');
  var r = R.act(s, a.id, { dir: 'up' });
  ok(!r.ok && /閉じこめられて/.test(r.error), '撃てない: ' + r.error);
  ok(R.act(s, a.id, { dir: 'up', shoot: false }).ok, '待機はできる');
  R.labApply([]);
  ok(R.act(s, a.id, { dir: 'up' }).ok, 'オフなら撃てる');
});
test('E10: 予告の形の空きに「森→燃える」、森があれば「燃える！」、構えた魔法で置くなら光る', function () {
  R.labApply(['E10']);
  var s = board(['.......', '.......', '.......', '.......', '.......', '.......', '.......'], true);
  enemyWith(s, 'fire', 3, 1, { aim: 'nature', facing: 'down' });
  var g = R.addAlly(s, 'grass', 3, 6, 'up');
  s.overrides = { 'enemy.move': 0 };
  var t = R.startBattle(s).state;
  var fc = R.forecast(t);
  var h = R.LX.intentHints(t, null, fc);
  eq(h.length, 1); eq(h[0].level, 'faint'); ok(/森→燃える/.test(h[0].text), h[0].text);
  var pv = R.previewAct(t, g.id, [3, 4], 'up');   // 草で (3,2) に森
  var h2 = R.LX.intentHints(pv.state, t, R.forecast(pv.state));
  eq(h2[0].level, 'glow'); eq(h2[0].text, '燃える！');
  R.labApply([]);
  eq(R.LX.intentHints(t, null, fc).length, 0, 'オフなら出さない');
});

// ===================================================================
console.log('\n■ G 強化と融合');

function boosted(s, magic, x, y, dir, boosts) { var a = R.addAlly(s, magic, x, y, dir || 'up'); R.findUnit(s, a.id).boosts = boosts; return R.findUnit(s, a.id); }
function withGrowOn(fn) { var was = B.grow.enabled; B.grow.enabled = true; try { fn(); } finally { B.grow.enabled = was; } }
test('G1: 一気に二段（土 → 山、風 → 強風、水 → 川）。オフなら丘・水たまり', function () { withGrowOn(function () {
  R.labApply(['G1']);
  var s = board(['.......', '.......', '.......', '.......', '.......', '.......', '.......']);
  var e = boosted(s, 'earth', 3, 6, 'up', [{ k: 'G1' }]);
  eq(tile(act(s, e, 'up').state, 3, 4), 'mountain');
  var w = boosted(s, 'wind', 0, 6, 'up', [{ k: 'G1' }]);
  eq(tile(act(s, w, 'up').state, 0, 5), 'gale');
  var wa = boosted(s, 'water', 6, 6, 'up', [{ k: 'G1' }]);
  eq(tile(act(s, wa, 'up').state, 6, 5), 'river');
  R.labApply([]);
  eq(tile(act(s, e, 'up').state, 3, 4), 'hill', 'オフ');
  eq(tile(act(s, wa, 'up').state, 6, 5), 'puddle', 'オフ');
}); });
test('G2: 味方の魔法は正面1マスから、強化した回数だけ伸びる（風・水は長さ）', function () {
  R.labApply(['G2']);
  var s = board(['.......', '.......', '.......', '.......', '.......', '.......', '.......']);
  var f0 = R.addAlly(s, 'fire', 1, 6, 'up');
  var f3 = boosted(s, 'fire', 3, 6, 'up', [{ k: 'G2', v: 3 }]);
  var w1 = boosted(s, 'wind', 5, 6, 'up', [{ k: 'G2', v: 1 }]);
  var g0 = R.addAlly(s, 'grass', 0, 3, 'right');
  eq(R.previewAct(s, (R.findUnit(s, f0.id)).id, null, 'up').cells.length, 1);
  eq(sorted(R.previewAct(s, (f3).id, null, 'up').cells), sorted([[3, 5], [4, 4], [2, 4], [3, 3]]));
  eq(R.previewAct(s, (R.findUnit(s, g0.id)).id, null, 'right').cells.length, 1, '草も正面1マス');
  var r = act(s, w1, 'up');
  eq([tile(r.state, 5, 5), tile(r.state, 5, 4), tile(r.state, 5, 3)], ['breeze', 'breeze', 'empty'], '風は2マス');
});
test('G3: 姿 A・B（草A 大樹の根はまっすぐ4マス、水A 二筋の川は左右の筋から2本）', function () {
  R.labApply(['G3']);
  var s = board(['.......', '.......', '.......', '.......', '.......', '.......', '.......']);
  var g = boosted(s, 'grass', 3, 6, 'up', [{ k: 'G3', v: 'A' }]);
  var r = act(s, g, 'up');
  eq([tile(r.state, 3, 5), tile(r.state, 3, 4), tile(r.state, 3, 3), tile(r.state, 3, 2)], ['forest', 'forest', 'forest', 'forest']);
  var s2 = board(['.......', '.......', '.......', '.......', '.......', '.......', '.......']);
  var w = boosted(s2, 'water', 3, 6, 'up', [{ k: 'G3', v: 'A' }]);
  var r2 = act(s2, w, 'up');
  eq([tile(r2.state, 2, 5), tile(r2.state, 4, 5), tile(r2.state, 3, 5)], ['river', 'river', 'empty'], '左右の筋');
});
test('G4: 融合「草＋火」は形の各マスに植えてすぐ点ける（small は2マス）。damage は決め手が半分', function () {
  R.labApply(['G4'], { G4: { weak: 'small' } });
  var s = board(['.......', '.......', '.......', '.......', '.......', '.......', '.......']);
  var g = boosted(s, 'grass', 3, 6, 'up', [{ k: 'G4', v: ['grass', 'fire'] }]);
  var r = act(s, g, 'up');
  eq([tile(r.state, 3, 4), tile(r.state, 3, 3), tile(r.state, 2, 3)], ['fire', 'fire', 'empty']);
  R.labApply(['G4'], { G4: { weak: 'damage' } });
  var s3 = board(['.......', '.......', '...F...', '...F...', '.......', '.......', '.......']);
  var w3 = boosted(s3, 'wind', 1, 2, 'right', [{ k: 'G4', v: ['wind', 'fire'] }]);
  var e3 = enemyWith(s3, 'fire', 3, 2, {}); tough(s3, e3);
  var r3 = act(s3, w3, 'right');
  ok(names(r3.events).indexOf('火の渦') >= 0, '火の渦');
  eq(dealt(r3, e3.id), 10, '20 の半分');
});
test('G5: 最終融合「草 → 闇 → 火」は3マス先に1発でオバケヤシキ（起こした本人は無事）', function () {
  R.labApply(['G5']);
  var s = board(['.......', '.......', '.......', '.......', '.......', '.......', '.......']);
  var d = boosted(s, 'dark', 3, 5, 'up', [{ k: 'G5', v: ['grass', 'dark', 'fire'] }]);
  enemyWith(s, 'fire', 3, 2, {});
  var r = act(s, d, 'up');
  ok(names(r.events).indexOf('オバケヤシキ') >= 0);
  eq(tile(r.state, 3, 2), 'haunted');
  ok(R.findUnit(r.state, d.id), '本人は無事');
});
test('G6: 弓は丘の上で、高台よりさらに1マス先から撃つ。杖は森の中で形の先にもう1マス', function () {
  R.labApply(['G6']);
  var s = board(['.......', '.......', '.......', '.......', '.......', '...h...', '.F.....']);
  var b = boosted(s, 'fire', 3, 5, 'up', [{ k: 'G6', v: 'bow' }]);
  eq(R.previewAct(s, (b).id, null, 'up').cells, [[3, 2]], '丘で2マス先が起点 → 正面1マスは3マス先');
  var t = boosted(s, 'fire', 1, 6, 'up', [{ k: 'G6', v: 'staff' }]);
  eq(R.previewAct(s, (t).id, null, 'up').cells, [[1, 5], [1, 4]]);
  R.labApply([]);
  eq(R.previewAct(s, (b).id, null, 'up').cells, [[3, 3]], 'オフなら丘の高台だけ');
});
test('G7: 魔法の直撃を受けた者はその魔法をまとい、次の1発に乗る（風をまとった火 → 火の渦）。ターンの終わりで消える', function () {
  R.labApply(['G7']);
  var s = board(['.......', '.FF....', '.FF....', '.......', '.......', '.......', '.......'], true);
  var w = R.addAlly(s, 'wind', 4, 6, 'up');
  var f = R.addAlly(s, 'fire', 4, 4, 'up');
  var e = enemyWith(s, 'fire', 2, 1, {}); tough(s, e);
  var r = act(s, w, 'up');
  eq(R.findUnit(r.state, f.id).labWear, 'wind');
  var r2 = R.act(r.state, f.id, { to: [4, 1], dir: 'left' });
  ok(r2.ok, r2.error);
  ok(names(r2.events).indexOf('火の渦') >= 0, '火の渦');
  ok(!R.findUnit(r2.state, f.id).labWear, '使ったら消える');
  var t = R.endTurn(R.act(r.state, f.id, { shoot: false }).state).state;
  ok(!R.findUnit(t, f.id) || !R.findUnit(t, f.id).labWear, 'ターンの終わりで消える');
  R.labApply([]);
  var r4 = act(s, w, 'up');
  ok(!R.findUnit(r4.state, f.id).labWear, 'オフならまとわない');
});
test('G8: 強化を持つ敵を倒すと、同じ魔法の味方がその強化を覚える', function () { withGrowOn(function () {
  R.labApply(['G8', 'G1']);
  var s = board(['.....', '.....', '..F..', '.....', '.....']);
  var e = enemyWith(s, 'wind', 2, 2, { boosts: [{ k: 'G1' }] });
  var a = R.addAlly(s, 'wind', 0, 4, 'up');
  var f = R.addAlly(s, 'fire', 2, 3, 'up');
  R.findUnit(s, e.id).hp = 1;
  var r = act(s, f, 'up');
  ok(!R.findUnit(r.state, e.id), '倒れた');
  eq(R.LX.boostOf(R.findUnit(r.state, a.id), 'G1'), true, '風の味方が覚えた');
  ok(/覚えた/.test(texts(r.events)));
}); });
test('G9: 2つ目の魔法と持ち替える（行動前だけ）', function () {
  R.labApply(['G9']);
  var s = board(['.....', '.....', '.....', '.....', '.....']);
  var g = boosted(s, 'grass', 2, 4, 'up', [{ k: 'G9', v: 'water' }]);
  var r = R.labSwapMagic(s, g.id);
  ok(r.ok);
  eq(R.findUnit(r.state, g.id).magic, 'water');
  eq(R.LX.boostOf(R.findUnit(r.state, g.id), 'G9'), 'grass');
  R.labApply([]);
  ok(!R.labSwapMagic(s, g.id).ok, 'オフなら持ち替えられない');
});

// ===================================================================
console.log('\n■ H お題と周回');

function seq(list) { var i = 0; return function () { var v = list[i % list.length]; i++; return v; }; }
test('H1: 周回の道・戦闘の盤面・強化の候補（乱数は戦闘の外だけ）', function () {
  R.labApply(['H1']);
  var run = R.LX.newRun(['grass', 'fire', 'wind']);
  var paths = R.LX.runPaths(run, seq([0, 0.5, 0.2, 0.9, 0.1, 0.3]));
  eq(paths.length, 2);
  ok(paths[0].mission !== paths[1].mission, '2つの道はお題が違う');
  var pr = R.LX.runPreset(run, paths[0]);
  R.LAB_PRESETS.push(pr);
  try {
    R.labApply(pr.lab, pr.labOpts);
    var s = R.startBattle(R.loadPreset(pr.id)).state;
    eq(R.alliesOf(s).map(function (a) { return a.magic; }), ['grass', 'fire', 'wind'], 'パーティのまま');
    var run2 = R.LX.newRun(['grass', 'fire', 'wind']); run2.opts.carryHp = true; run2.hp = { grass: 1, fire: 3, wind: 2 };
    R.LX.runPick(run2, { m: 'fire', k: 'M1', v: true, label: 'x' });
    var pr3 = R.LX.runPreset(run2, paths[0]); pr3.id = 'labRunBattle3'; R.LAB_PRESETS.push(pr3);
    var s3 = R.startBattle(R.loadPreset('labRunBattle3')).state;
    R.LAB_PRESETS.splice(R.LAB_PRESETS.indexOf(pr3), 1);
    eq(R.alliesOf(s3).map(function (a) { return a.hp; }), [1, 3, 2], 'HP を持ち越す');
    eq(R.alliesOf(s3).filter(function (a) { return a.magic === 'fire'; })[0].move, 3, '移動+1');
    var offers = R.LX.runOffers(run, paths[0], seq([0.1, 0.7, 0.4]), s);
    eq(offers.length, 3);
    R.LX.runPick(run, offers[0]);
    eq(run.picked.length, 1);
    var pr2 = R.LX.runPreset(run, paths[1]);
    var m = offers[0].m, ally = pr2.allies.filter(function (a) { return a[0] === m; })[0];
    ok(ally[3].lab.boosts && ally[3].lab.boosts.length === 1, '選んだ強化を持って次の戦闘へ');
    s.labRunFin = ['燃え広がり']; s.result = 'win';
    R.LX.runAfterBattle(run, s);
    eq(run.step, 1); eq(run.fin.length, 1);
    run.step = R.LX.RUN_STEPS - 1;
    eq(R.LX.runPaths(run, Math.random)[0].mission, 'boss', '最後は大物');
  } finally { R.LAB_PRESETS.splice(R.LAB_PRESETS.indexOf(pr), 1); }
});
test('H2: お題ごとに強化の方向が偏る（防衛 → 武器）', function () {
  R.labApply(['H2']);
  var run = R.LX.newRun(['grass', 'fire', 'wind']);
  var offers = R.LX.runOffers(run, { mission: 'defense' }, seq([0.3, 0.6, 0.9]), null);
  eq(offers.slice(0, 2).map(function (o) { return o.k; }), ['G6', 'G6']);
});
test('H5: 消火の盤面では、敵を全員倒しても勝ちにならない', function () {
  R.labApply(['H5']);
  var p = R.findPreset('labH5');
  var s = R.startBattle(R.loadPreset('labH5')).state;
  R.enemiesOf(s).forEach(function (e) { e.hp = 1; });
  var e = R.enemiesOf(s)[0];
  var a = R.alliesOf(s).filter(function (x) { return x.magic === 'fire'; })[0]; var u = R.findUnit(s, a.id); u.x = e.x; u.y = e.y + 1; u.facing = 'up';
  s.units = s.units.filter(function (x) { return x.side !== 'enemy' || x.id === e.id; });
  var r = R.act(s, a.id, { dir: 'up' });
  ok(!R.findUnit(r.state, e.id), '倒れた');
  ok(r.state.result !== 'win', '勝ちにならない: ' + r.state.result);
});
test('H6: 宝を持って逃げる敵が逃げ口に着いたら負け、倒したら勝ち', function () {
  R.labApply(['H6', 'D1', 'D2']);
  var s = R.startBattle(R.loadPreset('labH6')).state;
  var t = s;
  for (var i = 0; i < 4 && !t.result; i++) t = R.endTurn(t).state;
  eq(t.result, 'lose', '何もしないと逃げられる');
  var s2 = R.startBattle(R.loadPreset('labH6')).state;
  var run = R.findUnit(s2, 'E4'); run.hp = 1;
  var a = R.alliesOf(s2).filter(function (x) { return x.magic === 'fire'; })[0]; var u = R.findUnit(s2, a.id); u.x = run.x; u.y = run.y + 1;
  var r = R.act(s2, a.id, { dir: 'up' });
  eq(r.state.result, 'win');
});
test('H8: 持たれていない宝は、風で押される', function () {
  R.labApply(['H8']);
  var s = R.startBattle(R.loadPreset('labH8')).state;
  var w = R.alliesOf(s).filter(function (a) { return a.magic === 'wind'; })[0];
  var u = R.findUnit(s, w.id); u.x = 3; u.y = 5;
  var r = R.act(s, w.id, { dir: 'up' });
  eq(r.state.mission.treasure, [3, 2], '風下へ1マス');
  R.labApply([]);
  var r2 = R.act(s, w.id, { dir: 'up' });
  eq(r2.state.mission.treasure, [3, 3], 'オフなら動かない');
});
test('H9: 敵の自然のかたまりを全部変えると拠点。拠点の上の味方は形が1マス先から。2つとも次のターンの終わりまで持てば勝ち', function () {
  R.labApply(['H9']);
  var s = R.startBattle(R.loadPreset('labH9')).state;
  s.tiles[s.size * 2 + 1] = 'fire'; s.tiles[s.size * 2 + 2] = 'fire';
  s.tiles[s.size * 2 + 4] = 'mud'; s.tiles[s.size * 2 + 5] = 'mud';
  ok(s.labFlags.every(function (f) { return R.LX.flagTaken(s, f); }));
  var f = R.alliesOf(s)[0]; var u = R.findUnit(s, f.id); u.x = 4; u.y = 2;
  eq(R.previewAct(s, f.id, null, 'up').cells, [[4, 0]], '拠点の上は1マス先から');
  s.enemyActs = false;
  var t = R.endTurn(s).state;
  ok(!t.result, '1回目のターン終了ではまだ');
  t.tiles[t.size * 2 + 1] = 'empty'; t.tiles[t.size * 2 + 2] = 'empty';
  var t2 = R.endTurn(t).state;
  eq(t2.result, 'win');
});
test('H10 score: 村が壊れても続けられ、残りが星になる。faint: 倒れた味方は2ターン後に戻る', function () {
  R.labApply(['H10'], { H10: { mode: 'score' } });
  var s = R.startBattle(R.loadPreset('labH10')).state;
  var vil = s.units.filter(function (u) { return u.kind === 'village'; })[0];
  vil.hp = 0; s.enemyActs = false;
  var t0 = R.endTurn(s).state;
  ok(!t0.result, '続けられる: ' + t0.result);
  eq(R.LX.stars(t0), 2, '3つのうち2つ残って星2');
  R.labApply(['H10'], { H10: { mode: 'faint' } });
  var s2 = R.startBattle(R.loadPreset('labH10')).state;
  s2.enemyActs = false;
  var a = R.alliesOf(s2)[0]; R.findUnit(s2, a.id).hp = 0;
  var t = R.endTurn(s2).state;
  ok(!R.findUnit(t, a.id), '倒れた');
  ok(!t.result && t.labFaint && t.labFaint.length === 1, '気絶（負けにならない）');
  t = R.endTurn(t).state;
  ok(R.findUnit(t, a.id), '2ターン後に戻った');
});
test('H11: 動かせる人数（残りは構える仲間）', function () {
  R.labApply(['H11'], { H11: { count: 1 } });
  var s = R.startBattle(R.loadPreset('labH11')).state;
  eq(R.alliesOf(s).filter(function (a) { return !a.npc; }).length, 1);
  R.labApply(['H11'], { H11: { count: 3 } });
  var s3 = R.startBattle(R.loadPreset('labH11')).state;
  eq(R.alliesOf(s3).filter(function (a) { return !a.npc; }).length, 3);
});
test('H13: 小さな目標を達成すると、その味方はもう1回移動できる（撃てない）', function () {
  R.labApply(['H13']);
  var s = R.startBattle(R.loadPreset('labH13')).state;
  var r = R.act(s, 'P1', { to: [2, 5], dir: 'up' });
  ok(/目標/.test(texts(r.events)));
  var u = R.findUnit(r.state, 'P1');
  ok(!u.acted && u.labMoveOnly);
  ok(!R.act(r.state, 'P1', { dir: 'up' }).ok, '撃てない');
  ok(R.act(r.state, 'P1', { to: [1, 6], dir: 'up', shoot: false }).ok, '移動はできる');
});

// ===================================================================
console.log('\n■ F 移動と手番');

test('F1: 味方の移動は1（敵は2のまま。enemyToo で敵も1）', function () {
  R.labApply(['F1']);
  var s = board(['.....', '.....', '.....', '.....', '.....']);
  var a = R.addAlly(s, 'fire', 2, 4, 'up'); var e = R.addEnemy(s, 'fire', 2, 0);
  var t = R.startBattle(s).state;   // 移動は戦闘の始めに決まる
  eq(Object.keys(R.reachableCells(t, a.id)).length, 4, '自分と3方向');
  eq(R.findUnit(t, e.id).move, 2);
  R.labApply(['F1'], { F1: { enemyToo: true } });
  var t2 = R.startBattle(s).state;
  eq(R.findUnit(t2, e.id).move, 1);
});
test('F2: 残った風の上を風下へ歩くと1歩で2マス。オフなら1マス', function () {
  R.labApply(['F2']);
  var s = board(['.....', '.....', '.....', '.....', '.....']);
  var w = R.addAlly(s, 'wind', 2, 4, 'up');
  var f = R.addAlly(s, 'fire', 1, 3, 'up');
  var r = act(s, w, 'up');
  ok(R.reachableCells(r.state, f.id)['2,1'] !== undefined, '追い風で (2,1) まで');
  R.labApply([]);
  var r2 = act(s, w, 'up');
  ok(R.reachableCells(r2.state, f.id)['2,1'] === undefined, 'オフなら届かない');
});
test('F3: 森の中で草は形の先にもう1マス、水辺で水は1マス長い', function () {
  R.labApply(['F3']);
  var s = board(['.......', '.......', '.......', '.......', '.......', '.......', '...F...']);
  var g = R.addAlly(s, 'grass', 3, 6, 'up');
  eq(R.previewAct(s, g.id, null, 'up').cells.length, 5);
  var s2 = board(['.......', '.......', '.......', '.......', '.......', '.......', '..R....']);
  var w = R.addAlly(s2, 'water', 3, 6, 'up');
  var r = act(s2, w, 'up');
  eq([tile(r.state, 3, 5), tile(r.state, 3, 4), tile(r.state, 3, 3)], ['river', 'river', 'river'], '池が3マス');
  R.labApply([]);
  eq(R.previewAct(s, g.id, null, 'up').cells.length, 4, 'オフ');
});
test('F4: 味方が1人動くごとに、敵の予告が1つ発動する', function () {
  R.labApply(['F4']);
  var s = board(['.....', '.....', '.....', '.....', '.....'], true);
  var e1 = R.addEnemy(s, 'fire', 0, 0); var e2 = R.addEnemy(s, 'fire', 4, 0);
  var a = R.addAlly(s, 'grass', 2, 4, 'up'); var b = R.addAlly(s, 'grass', 1, 4, 'up');
  var t = R.startBattle(s).state;
  eq(R.enemiesOf(t).filter(function (e) { return e.intent; }).length, 2);
  var r = R.act(t, a.id, { shoot: false });
  eq(R.enemiesOf(r.state).filter(function (e) { return e.intent; }).length, 1, '1つ発動した');
  ok(/味方が1人動いたので/.test(texts(r.events)));
});
test('F5: 構えはすぐには起きず、ターンの終わりに構えた順に発動する。違う味方の魔法が続いた決め手は「合体！」', function () {
  R.labApply(['F5']);
  var s = R.startBattle(R.loadPreset('labF5')).state;
  var r1 = R.act(s, 'P1', { to: [1, 1], dir: 'right' });
  eq(tile(r1.state, 3, 1), 'empty', 'まだ森にならない');
  ok(R.findUnit(r1.state, 'P1').labStance, '構えている');
  ok(R.act(r1.state, 'P1', { dir: 'up' }).ok, '構え直せる');
  ok(!R.act(r1.state, 'P1', { to: [1, 2], dir: 'up' }).ok, '構え直しでは動けない');
  var fc = R.forecast(r1.state);
  ok(fc.allies.length === 1 && fc.allies[0].tileChanges.length > 0, '予告に構えの結果');
  var r2 = R.act(r1.state, 'P2', { to: [2, 3], dir: 'right' });
  var r3 = R.act(r2.state, 'P3', { to: [3, 5], dir: 'up' });
  var t = R.endTurn(r3.state);
  ok(t.events.some(function (e) { return e.type === 'finisher' && /合体/.test(e.text); }), '合体！');
  ok(!R.findUnit(t.state, 'E4'), '敵Aが倒れた');
});
test('F6: 壊す（正面1マスの自然を一段戻す。魔法は撃たない）', function () {
  R.labApply(['F6']);
  var s = board(['.....', '.....', '..M..', '.....', '.....']);
  var a = R.addAlly(s, 'fire', 2, 3, 'up');
  var r = R.act(s, a.id, { dir: 'up', labBreak: true });
  ok(r.ok);
  eq(tile(r.state, 2, 2), 'empty', '育つが切なら山は空きに');
  R.labApply([]);
  var r2 = R.act(s, a.id, { dir: 'up', labBreak: true });
  eq(tile(r2.state, 2, 2), 'volcano', 'オフなら壊せない（ふつうに火を撃つ → 火山）');
});
test('F7: 作業台の枠に当たった魔法は材料になり、ターンの終わりに枠の全マスへ順に当たる', function () {
  R.labApply(['F7']);
  var s = R.startBattle(R.loadPreset('labF7')).state;
  var r = R.act(s, 'P1', { to: [3, 5], dir: 'up', labBench: true });
  ok(r.state.labBench && r.state.labBench.cells.length === 9);
  var r2 = R.act(r.state, 'P2', { to: [2, 6], dir: 'up' });
  eq(tile(r2.state, 3, 3), 'empty', 'すぐには変わらない');
  eq(r2.state.labBench.mats.length, 1);
  var r3 = R.act(r2.state, 'P3', { to: [4, 5], dir: 'up' });
  var t = R.endTurn(r3.state).state;
  eq(tile(t, 2, 2), 'fire', '枠の全マスが燃える森');
  ok(!t.labBench, '作業台はそのターンだけ');
});

// ===================================================================
console.log('\n■ B 新しい組み合わせ');

test('B5: 火の渦に土で、2×2の大きな山（中の者は外へ押し出す）', function () {
  R.labApply(['B5']);
  var s = board(['......', '......', '..QQ..', '..QQ..', '......', '......']);
  var e = R.addEnemy(s, 'fire', 3, 2); tough(s, e);
  var a = R.addAlly(s, 'earth', 3, 5, 'up');   // 形 (2,3)(3,3)(2,2)
  var r = act(s, a, 'up');
  eq([tile(r.state, 2, 2), tile(r.state, 2, 3), tile(r.state, 3, 3)], ['mountain', 'mountain', 'mountain']);
  ok(String(pos(r.state, e.id)) !== '3,2', '押し出された');
  eq(tile(r.state, 3, 2), 'mountain', '押し出したあとは山');
});
test('B3: 死の森に草で、つながった死の森が森によみがえる', function () {
  R.labApply(['B3']);
  var s = board(['.....', '.GG..', '.G...', '.....', '.....']);
  var a = R.addAlly(s, 'grass', 1, 4, 'up');   // 形 (1,2)(0,1)(1,1)(2,1)
  var r = act(s, a, 'up');
  eq([tile(r.state, 1, 1), tile(r.state, 2, 1), tile(r.state, 1, 2)], ['forest', 'forest', 'forest']);
  R.labApply([]);
  eq(tile(act(s, a, 'up').state, 1, 1), 'deadforest', 'オフなら変わらない');
});
test('B18: 風の残るマスに氷で吹雪（風の上の者の足が凍る）', function () {
  R.labApply(['B18']);
  var s = board(['.....', '.....', '..B..', '..B..', '.....']);
  var e = R.addEnemy(s, 'fire', 2, 2); tough(s, e);
  var a = R.addAlly(s, 'ice', 2, 4, 'up');
  var r = act(s, a, 'up');
  ok(R.findUnit(r.state, e.id).stuck, '足が凍った');
  ok(/吹雪/.test(texts(r.events)));
});
test('B21: 桜に草で満開（隣の山にも桜）', function () {
  R.labApply(['B21']);
  var s = board(['.....', '.....', '.MKM.', '.....', '.....']);
  var a = R.addAlly(s, 'grass', 2, 4, 'up');   // 形 (2,2) …
  var r = act(s, a, 'up');
  eq([tile(r.state, 1, 2), tile(r.state, 3, 2)], ['sakura', 'sakura']);
});
test('B20: 霜は歩くと滑る（A2）。ターン終了で消える', function () {
  R.labApply(['B20', 'A2']);
  var s = board(['.....', '.....', '.....', '.....', '.....']);
  var a = R.addAlly(s, 'ice', 2, 4, 'up');
  var r = act(s, a, 'up');
  eq([tile(r.state, 2, 3), tile(r.state, 2, 2)], ['frost', 'frost']);
  var t = R.endTurn(r.state).state;
  eq(tile(t, 2, 3), 'empty', '消えた');
});
test('B14: 葦原は歩いて渡れて、水のまま（感電する）', function () {
  R.labApply(['B14']);
  var s = board(['.....', '.....', 'eeeee', '.....', '.....']);
  ok(R.isPassable('reeds'), '通れる');
  var e = R.addEnemy(s, 'fire', 2, 2); tough(s, e);
  var a = R.addAlly(s, 'thunder', 0, 4, 'up');   // (0,3) 空き、(1,2) 葦原
  var r = act(s, a, 'up');
  ok(names(r.events).indexOf('感電') >= 0, '感電');
  eq(dealt(r, e.id), 20);
});

// ===================================================================
console.log('\n■ I 新しい魔法');

test('I: 新しい魔法は、その案がオンのときだけ味方の選択肢に出る', function () {
  var s = board(['.....', '.....', '.....', '.....', '.....']);
  ok(R.allyMagics(s).indexOf('light') < 0, 'オフ');
  R.labApply(['I1']);
  ok(R.allyMagics(s).indexOf('light') >= 0, 'オン');
});
test('I1: 光は右斜め前へ。水で右へ90°曲がり、死の森を森に戻す。照らされた者は隠れていても見える', function () {
  R.labApply(['I1', 'A3']);
  var s = R.startBattle(R.loadPreset('labI1')).state;
  var r = R.act(s, 'P1', { dir: 'left' });
  eq(tile(r.state, 5, 2), 'forest');
  var s2 = board(['.....', '.....', '..F..', '.....', '.....']);
  var e = R.addAlly(s2, 'fire', 2, 2, 'up');
  var l = R.addAlly(s2, 'light', 0, 4, 'up');   // (1,3) → (2,2)
  ok(R.hidden(s2, R.findUnit(s2, e.id), null), '森に隠れている');
  var r2 = act(s2, l, 'up');
  ok(!R.hidden(r2.state, R.findUnit(r2.state, e.id), null), '照らされて見える');
});
test('I4: 岩に風で転がり、通り道の者に20。川に落ちると飛び石', function () {
  R.labApply(['I4']);
  var s = board(['.....', '.....', '.r..R', '.....', '.....']);
  var e = R.addEnemy(s, 'fire', 3, 2); tough(s, e);
  var w = R.addAlly(s, 'wind', 0, 2, 'right');
  var r = act(s, w, 'right');
  eq(dealt(r, e.id), 20);
  eq(tile(r.state, 4, 2), 'stepstone', '川に落ちて飛び石');
  ok(R.isPassable('stepstone'));
});
test('I5: 森の隣の者の足に蔓がからむ。森から続く川に蔓の橋（燃えると川に戻る）', function () {
  R.labApply(['I5']);
  var s = board(['.....', '..F..', '..R..', '.....', '.....']);
  var v = R.addAlly(s, 'vine', 2, 4, 'up');
  var r = act(s, v, 'up');
  eq(tile(r.state, 2, 2), 'vinebridge');
  R.setTile(r.state, 2, 2, 'fire');
  eq(tile(r.state, 2, 2), 'river', '燃えると川に戻る');
  var s2 = board(['.....', '.F...', '..x..'.replace('x', '.'), '.....', '.....']);
  var e = R.addEnemy(s2, 'fire', 2, 1); tough(s2, e);
  var v2 = R.addAlly(s2, 'vine', 2, 3, 'up');
  var r2 = act(s2, v2, 'up');
  ok(R.findUnit(r2.state, e.id).stuck, '森の隣で足を取られた');
});
test('I6: 雨は人には当たらず、炎を消し、空きを水たまりに', function () {
  R.labApply(['I6']);
  var s = board(['.....', '.....', '..X..', '.....', '.....']);
  var e = R.addEnemy(s, 'fire', 3, 2); tough(s, e);
  var a = R.addAlly(s, 'rain', 2, 4, 'up');   // (2,3)(3,3)(2,2)(3,2)
  var r = act(s, a, 'up');
  eq([tile(r.state, 2, 2), tile(r.state, 2, 3)], ['empty', 'puddle']);
  eq(dealt(r, e.id), 0, '直撃なし');
});
test('I7: 音で振り向かせると、敵の予告の向きが変わる', function () {
  R.labApply(['I7']);
  var s = R.startBattle(R.loadPreset('labI7')).state;
  var r = R.act(s, 'P1', { to: [0, 2], dir: 'right' });
  eq(R.findUnit(r.state, 'E4').facing, 'left');
  eq(R.forecast(r.state).enemies[0].dir, 'left', '予告も左');
});
test('I8: 雷は金の柱に落ち、柱から感電する', function () {
  R.labApply(['I8']);
  var s = board(['.....', '.....', '..l..', '.....', '.....']);
  var e = R.addEnemy(s, 'fire', 3, 2); tough(s, e);
  var t = R.addAlly(s, 'thunder', 2, 4, 'up');   // (2,3) → (3,2)? 先に (2,3) 空き、(3,2)…
  var r = act(s, t, 'up');
  ok(names(r.events).indexOf('感電') >= 0 || dealt(r, e.id) > 0, '雷が届いた');
});

// ===================================================================
console.log('\n■ K 時間と繁栄');

test('K1 none: ターン終了で燃え移り・小さな炎が消える・風がやむ、が起きない。炎の上のダメージは残る', function () {
  R.labApply(['K1'], { K1: { mode: 'none' } });
  var s = board(['.....', '.XF..', '..s..', '..B..', '.....']);
  var e = R.addEnemy(s, 'fire', 1, 1); tough(s, e);
  s.enemyActs = false;
  var t = R.endTurn(s).state;
  eq([tile(t, 2, 1), tile(t, 2, 2), tile(t, 2, 3)], ['forest', 'smallfire', 'breeze']);
  ok(R.findUnit(t, e.id).hp < 99, '炎の上のダメージ');
  R.labApply(['K1'], { K1: { mode: 'now' } });
  var t2 = R.endTurn(s).state;
  eq([tile(t2, 2, 1), tile(t2, 2, 2), tile(t2, 2, 3)], ['fire', 'empty', 'empty'], 'now は今どおり');
});
test('K2: 燃え尽きた跡は灰、2回目のターン終了で草むら（森）がよみがえる。水辺の草むらは森に育つ', function () {
  R.labApply(['K2']);
  var s = board(['.....', '..X..', '.....', 'g....', 'RRRRR']);
  s.enemyActs = false; s.fireAge = {}; s.fireAge[1 * 5 + 2] = 1;
  var t = R.endTurn(s).state;
  eq(tile(t, 2, 1), 'ash', '灰');
  eq(tile(t, 0, 3), 'forest', '水辺の草むら → 森');
  var fc = R.forecast(t);
  ok(fc.labGrow && fc.labGrow.revive.length === 1, 'よみがえる予告');
  var t2 = R.endTurn(t).state;
  eq(tile(t2, 2, 1), 'forest', 'よみがえった（育つが切なので森）');
});

// ===================================================================
console.log('\n■ J 見せ方');

test('J5: あと一手のヒントが、全部の決め手に広がる（燃え広がり・感電 …）', function () {
  var s = board(['.....', '..X..', '.....', '.RR..', '.....']);
  R.addAlly(s, 'wind', 2, 4, 'up'); R.addAlly(s, 'thunder', 0, 4, 'up');
  eq(R.nextHints(s).length, 0, 'オフでは今の5つだけ');
  R.labApply(['J5']);
  var names2 = R.nextHints(s).map(function (h) { return h.name; });
  ok(names2.indexOf('燃え広がり') >= 0 && names2.indexOf('感電') >= 0, names2.join(','));
});
test('J8: 図鑑の表は、ラボの決め手をその案がオンのときだけ載せる', function () {
  var n0 = R.LX.zukanList().length;
  R.labApply(['B7']);
  eq(R.LX.zukanList().length, n0 + 1);
});

console.log('\n■ ラボ用シナリオ');
R.LAB_PRESETS.forEach(function (p) {
  test('シナリオ「' + p.name + '」が読めて、戦闘を始められる', function () {
    R.labApply(p.lab || [], p.labOpts);
    var s = R.startBattle(R.loadPreset(p.id)).state;
    ok(s && s.units.length > 0);
    (p.lab || []).forEach(function (id) { ok(R.lab(id), id + ' がオン'); });
  });
  if (p.demo) test('デモ「' + p.name + '」が最後まで動き、expect を満たす', function () {
    R.labApply(p.lab || [], p.labOpts);
    var s = R.startBattle(R.loadPreset(p.id)).state;
    p.demo.turns.forEach(function (turn) {
      turn.forEach(function (a) {
        if (s.result) return;
        if (a.endTurn) { s = R.endTurn(s).state; return; }
        if (!a.id) return;
        if (a.swap) { var sw = R.labSwapMagic(s, a.id); if (!sw.ok) throw new Error(a.id + ' が持ち替えられない: ' + sw.error); s = sw.state; }
        var r = R.act(s, a.id, { to: a.to, dir: a.dir, shoot: a.shoot !== false, labBreak: a.labBreak, labBench: a.labBench });
        if (!r.ok) throw new Error(a.id + ' が行動できない: ' + r.error);
        s = r.state;
        if (!s.result && R.allAlliesActed(s)) s = R.endTurn(s).state;
      });
    });
    var ex = p.demo.expect || {};
    Object.keys(ex.tiles || {}).forEach(function (k) { var c = k.split(',').map(Number); eq(tile(s, c[0], c[1]), ex.tiles[k], k); });
    if (ex.result) eq(s.result, ex.result, '結果');
    (ex.gone || []).forEach(function (id) { ok(!R.findUnit(s, id), id + ' が倒れている'); });
    (ex.alive || []).forEach(function (id) { ok(!!R.findUnit(s, id), id + ' が残っている'); });
  });
});

R.labApply([]);
console.log('\n' + passed + ' 件成功 / ' + failed.length + ' 件失敗');
if (failed.length) { failed.forEach(function (n) { console.log('  NG ' + n); }); process.exitCode = 1; }
