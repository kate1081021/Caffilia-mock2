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
        var r = R.act(s, a.id, { to: a.to, dir: a.dir, shoot: a.shoot !== false });
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
