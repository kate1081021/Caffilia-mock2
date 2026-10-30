/*
 * ルールのテスト（v2）。  node tests/run.js
 */
var R = require('../rules.js');
var B = require('../balance.js');

var passed = 0;
var failed = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (e) {
    failed.push(name);
    console.log('  NG  ' + name);
    console.log('        ' + (e && e.message));
  }
}
function eq(actual, expected, msg) {
  var a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error((msg ? msg + ': ' : '') + 'expected ' + b + ' but got ' + a);
}
function ok(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function sorted(cells) { return cells.map(function (c) { return c[0] + ',' + c[1]; }).sort(); }

// ---------------------------------------------------------------
// 盤面を文字で作る
//   . 空き  F 森  M 山  R 川  X 炎  s 小さな炎  V 火山  D 泥沼  P 水たまり  H 蜃気楼
// ---------------------------------------------------------------
var CH = { '.': 'empty', F: 'forest', M: 'mountain', R: 'river', X: 'fire', s: 'smallfire', V: 'volcano', D: 'mud', P: 'puddle', H: 'mirage', I: 'ice', L: 'lava', W: 'whirlwind', T: 'tornado', B: 'breeze', Q: 'firewhirl', K: 'sakura', p: 'petals', G: 'deadforest', O: 'haunted' };
function board(rows, enemyActs) {
  var s = R.createState({ size: rows.length, blank: true, enemyActs: !!enemyActs });
  rows.forEach(function (row, y) {
    for (var x = 0; x < row.length; x++) R.setTile(s, x, y, CH[row[x]]);
  });
  return s;
}
function empty(n, enemyActs) {
  var rows = [];
  for (var i = 0; i < n; i++) rows.push(new Array(n + 1).join('.'));
  return board(rows, enemyActs);
}
function tile(s, x, y) { return R.getTile(s, x, y); }
function hp(s, id) { var u = R.findUnit(s, id); return u ? u.hp : null; }
function pos(s, id) { var u = R.findUnit(s, id); return u ? [u.x, u.y] : null; }
// 味方 a がその場で dir に撃つ
function fire(s, a, dir) {
  var r = R.act(s, a.id, { dir: dir });
  if (!r.ok) throw new Error('撃てない: ' + r.error);
  return r;
}
// その1発で id が受けたダメージ（倒れても分かる）
function dealt(r, id) { return r.events.filter(function (e) { return e.type === 'damage' && e.id === id; }).reduce(function (t, e) { return t + e.amount; }, 0); }
// 決め手（20）で倒れないように、動きを確かめたい者の HP を上げる
function tough(s, u) { R.findUnit(s, u.id).hp = 99; return u; }
function names(events, type) { return events.filter(function (e) { return e.type === type; }).map(function (e) { return e.name; }); }

console.log('\n■ 形の回転');

test('草の形が4方向で正しく回転する', function () {
  var s = empty(9);
  eq(sorted(R.shapeCells(s, 'grass', 4, 4, 'up')), sorted([[4, 2], [3, 1], [4, 1], [5, 1]]), '上');
  eq(sorted(R.shapeCells(s, 'grass', 4, 4, 'right')), sorted([[6, 4], [7, 3], [7, 4], [7, 5]]), '右');
  eq(sorted(R.shapeCells(s, 'grass', 4, 4, 'down')), sorted([[4, 6], [5, 7], [4, 7], [3, 7]]), '下');
  eq(sorted(R.shapeCells(s, 'grass', 4, 4, 'left')), sorted([[2, 4], [1, 5], [1, 4], [1, 3]]), '左');
});
test('土の形が4方向で正しく回転する（術者から見て左に寄る）', function () {
  var s = empty(9);
  eq(sorted(R.shapeCells(s, 'earth', 4, 4, 'up')), sorted([[3, 2], [4, 2], [3, 1]]), '上');
  eq(sorted(R.shapeCells(s, 'earth', 4, 4, 'right')), sorted([[6, 3], [6, 4], [7, 3]]), '右');
  eq(sorted(R.shapeCells(s, 'earth', 4, 4, 'down')), sorted([[5, 6], [4, 6], [5, 7]]), '下');
  eq(sorted(R.shapeCells(s, 'earth', 4, 4, 'left')), sorted([[2, 5], [2, 4], [1, 5]]), '左');
});
test('火の形は正面1マスで、4方向に回転する', function () {
  var s = empty(9);
  eq(R.shapeCells(s, 'fire', 4, 4, 'up'), [[4, 3]], '上');
  eq(R.shapeCells(s, 'fire', 4, 4, 'right'), [[5, 4]], '右');
  eq(R.shapeCells(s, 'fire', 4, 4, 'down'), [[4, 5]], '下');
  eq(R.shapeCells(s, 'fire', 4, 4, 'left'), [[3, 4]], '左');
});
test('術者に近いマスから順に並ぶ', function () {
  var s = empty(9);
  eq(R.shapeCells(s, 'grass', 4, 4, 'up')[0], [4, 2]);
});
test('盤の外にはみ出したマスは無視される', function () {
  var s = empty(6);
  eq(R.shapeCells(s, 'grass', 0, 5, 'left'), []);
  eq(sorted(R.shapeCells(s, 'grass', 0, 5, 'up')), sorted([[0, 3], [0, 2], [1, 2]]));
  eq(R.shapeCells(s, 'fire', 0, 1, 'up'), [[0, 0]]);
  var a = R.addAlly(s, 'grass', 0, 5);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 0, 3), tile(r.state, 0, 2), tile(r.state, 1, 2)], ['forest', 'forest', 'forest']);
});

console.log('\n■ 置く・点ける');

test('置く: ユニットがいるマスは直撃し、足元にも自然ができる（natureUnderUnits）', function () {
  var s = empty(6);
  var a = R.addAlly(s, 'grass', 2, 5);
  var e = R.addEnemy(s, 'fire', 2, 3);       // (0,2) のマス
  var r = fire(s, a, 'up');
  eq(tile(r.state, 2, 3), 'forest', '敵の足元にも森');
  eq(hp(r.state, e.id), B.enemy.hp - B.ally.power);
  eq([tile(r.state, 1, 2), tile(r.state, 2, 2), tile(r.state, 3, 2)], ['forest', 'forest', 'forest']);
});
test('置く: 味方に当てても足元に自然ができる。山（通れない）は足元には盛らない', function () {
  var s = empty(6);
  var a = R.addAlly(s, 'grass', 2, 5);
  var b = R.addAlly(s, 'earth', 2, 3);
  var r = fire(s, a, 'up');
  eq(tile(r.state, 2, 3), 'forest', '味方の足元に森');
  var s2 = empty(6);
  var c = R.addAlly(s2, 'earth', 2, 5);      // 形 (1,3)(2,3)(1,2)
  var d = R.addAlly(s2, 'grass', 2, 3);
  var r2 = fire(s2, c, 'up');
  eq(tile(r2.state, 2, 3), 'empty', '育つが切なら土は山なので、足元には盛らない');
  eq(tile(r2.state, 1, 3), 'mountain');
});
test('置く: natureUnderUnits を切ると、ユニットがいるマスは直撃だけで自然は変わらない（前の決まり）', function () {
  B.ideas.natureUnderUnits = false;
  try {
    var s = empty(6);
    var a = R.addAlly(s, 'grass', 2, 5);
    var e = R.addEnemy(s, 'fire', 2, 3);
    var r = fire(s, a, 'up');
    eq(tile(r.state, 2, 3), 'empty', '敵のマス');
  } finally { B.ideas.natureUnderUnits = true; }
});
test('置く: 土で空きは山、川は泥沼', function () {
  var s = board(['......', '......', '..R...', '......', '......', '......']);
  var a = R.addAlly(s, 'earth', 2, 5);   // 形 (1,3)(2,3)(1,2)
  var r = fire(s, a, 'up');
  eq([tile(r.state, 1, 3), tile(r.state, 2, 3), tile(r.state, 1, 2)], ['mountain', 'mountain', 'mountain']);
  var s2 = board(['......', '......', '.R....', '......', '......', '......']);
  var a2 = R.addAlly(s2, 'earth', 2, 5);
  eq(tile(fire(s2, a2, 'up').state, 1, 2), 'mud', '川 → 泥沼');
});
test('置く: 自分の形に味方がいれば、味方にも直撃', function () {
  var s = empty(6);
  var a = R.addAlly(s, 'grass', 2, 5);
  var b = R.addAlly(s, 'fire', 2, 3);
  eq(hp(fire(s, a, 'up').state, b.id), B.ally.hp - B.ally.power);
});
test('点ける: 空き→小さな炎、森→炎、山→火山【新案】', function () {
  var s = board(['......', '..M...', '......', '..F...', '......', '......']);
  eq(tile(fire(s, R.addAlly(s, 'fire', 2, 4), 'up').state, 2, 3), 'fire', '森 → 炎');
  var s1 = board(['......', '..M...', '......', '..F...', '......', '......']);
  eq(tile(fire(s1, R.addAlly(s1, 'fire', 2, 2), 'up').state, 2, 1), 'volcano', '山 → 火山');
  var s2 = empty(6);
  var a2 = R.addAlly(s2, 'fire', 2, 5);
  var r2 = fire(s2, a2, 'up');
  eq([tile(r2.state, 2, 4), tile(r2.state, 2, 3)], ['smallfire', 'empty'], '正面1マスだけ');
});
test('点ける: 森の上の敵には直撃＋森が燃える', function () {
  var s = board(['......', '......', '......', '..F...', '......', '......']);
  var a = R.addAlly(s, 'fire', 2, 4);
  var e = R.addEnemy(s, 'fire', 2, 3);
  var r = fire(s, a, 'up');
  eq(tile(r.state, 2, 3), 'fire');
  eq(hp(r.state, e.id), B.enemy.hp - B.ally.power);
});

console.log('\n■ 流れる（水）【水たまりと源流】');

// 水だけなら水たまり（balance.js の waterPuddle）を、この中だけ v にする
function withPuddle(v, fn) { var keep = B.waterPuddle; B.waterPuddle = v; try { fn(); } finally { B.waterPuddle = keep; } }
test('水だけなら正面に水たまり（2マス）。流れるのは山にかけたときだけ（オーナー 10/17）', function () {
  eq(B.waterPuddle, true, '標準');
  var s = empty(6);
  var a = R.addAlly(s, 'water', 2, 5);
  var r = fire(s, a, 'up');
  eq([4, 3, 2].map(function (y) { return tile(r.state, 2, y); }), ['puddle', 'puddle', 'empty']);
  ok(r.events.some(function (e) { return /水たまりができた（2マス）/.test(e.text || ''); }), 'ログは「水たまり」');
  ok(R.reachableCells(r.state, a.id)['2,4'] === 1, '水たまりは通れる');
});
test('【元】waterPuddle を切ると、水だけなら正面に池（川2マス・通れない）', function () { withPuddle(false, function () {
  var s = empty(6);
  var a = R.addAlly(s, 'water', 2, 5);
  var r = fire(s, a, 'up');
  eq([4, 3, 2].map(function (y) { return tile(r.state, 2, y); }), ['river', 'river', 'empty']);
  ok(r.events.some(function (e) { return /池ができた（2マス）/.test(e.text || ''); }), 'ログは「池」');
}); });
test('水たまりにした水でも、感電・凍結・泥沼の材料になる', function () {
  var s = empty(6);
  var w = R.addAlly(s, 'water', 2, 5);
  var r = fire(s, w, 'up');
  var e = tough(r.state, R.addEnemy(r.state, 'fire', 1, 3));   // 水たまり (2,3) の隣
  var t = R.addAlly(r.state, 'thunder', 2, 2);
  var r2 = fire(r.state, t, 'down');
  eq(names(r2.events, 'finisher'), ['感電']);
  eq(dealt(r2, e.id), B.shock.base, '隣の敵に感電');
});
test('山に当たると、山を下って盤の端まで川になる（源流）', function () {
  var s = board(['......', '......', '......', '......', '..M...', '......']);
  var a = R.addAlly(s, 'water', 2, 5);
  var r = fire(s, a, 'up');
  eq(tile(r.state, 2, 4), 'mountain', '山は残る');
  eq([3, 2, 1, 0].map(function (y) { return tile(r.state, 2, y); }), ['river', 'river', 'river', 'river']);
});
test('水の先（2マス以内）に山があれば源流になる。3マス目の山には届かない', function () {
  var s = board(['......', '......', '......', '..M...', '......', '......']);
  var a = R.addAlly(s, 'water', 2, 5);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 4), tile(r.state, 2, 2), tile(r.state, 2, 0)], ['puddle', 'river', 'river'], '山の手前は水たまり、山の先は川');
  var s2 = board(['......', '......', '..M...', '......', '......', '......']);
  var a2 = R.addAlly(s2, 'water', 2, 5);
  var r2 = fire(s2, a2, 'up');
  eq([tile(r2.state, 2, 4), tile(r2.state, 2, 3), tile(r2.state, 2, 1)], ['puddle', 'puddle', 'empty']);
});
test('源流は川・水たまりを越え、次の山も通り抜ける', function () {
  var s = board(['......', '..M...', '..P...', '..R...', '..M...', '......']);
  var a = R.addAlly(s, 'water', 2, 5);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 2), tile(r.state, 2, 0)], ['river', 'river']);
});
test('ユニットで止まって直撃', function () {
  var s = board(['......', '......', '......', '......', '..M...', '......']);
  var a = R.addAlly(s, 'water', 2, 5);
  var e = R.addEnemy(s, 'fire', 2, 1);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 3), tile(r.state, 2, 2), tile(r.state, 2, 1), tile(r.state, 2, 0)], ['river', 'river', 'empty', 'empty']);
  eq(hp(r.state, e.id), B.enemy.hp - B.ally.power);
});
test('炎を消して止まる', function () {
  var s = board(['......', '......', '......', '......', '..X...', '......']);
  var a = R.addAlly(s, 'water', 2, 5);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 4), tile(r.state, 2, 3)], ['empty', 'empty']);
});
test('森・火山で止まって何も起きない', function () {
  var s = board(['......', '......', '......', '......', '..F...', '......']);
  var a = R.addAlly(s, 'water', 2, 5);
  eq(tile(fire(s, a, 'up').state, 2, 3), 'empty');
  var s2 = board(['......', '......', '......', '......', '..V...', '......']);
  var a2 = R.addAlly(s2, 'water', 2, 5);
  var r2 = fire(s2, a2, 'up');
  eq([tile(r2.state, 2, 4), tile(r2.state, 2, 3)], ['volcano', 'empty']);
});

console.log('\n■ 吹き抜ける（風）');

test('山の手前で止まる（山の陰には届かない）', function () {
  var s = board(['......', '......', '..M...', '......', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 5);
  var front = R.addEnemy(s, 'fire', 2, 3);
  var behind = R.addEnemy(s, 'fire', 2, 1);
  var r = fire(s, a, 'up');
  eq(hp(r.state, front.id), B.enemy.hp - B.ally.power, '手前は当たる');
  eq(pos(r.state, front.id), [2, 3], '山があるので押せない');
  eq(hp(r.state, behind.id), B.enemy.hp, '山の陰');
});
test('通り道の敵を押す（遠い方から処理するので、並んでいても両方押せる）', function () {
  var s = empty(6);
  var a = R.addAlly(s, 'wind', 2, 5);
  var near = R.addEnemy(s, 'fire', 2, 4);
  var farE = R.addEnemy(s, 'fire', 2, 3);
  var r = fire(s, a, 'up');
  eq(pos(r.state, farE.id), [2, 2]);
  eq(pos(r.state, near.id), [2, 3]);
  eq([hp(r.state, near.id), hp(r.state, farE.id)], [B.enemy.hp - B.ally.power, B.enemy.hp - B.ally.power]);
});
test('押せないとき（盤の端・ユニット・通れないマス）はダメージだけ', function () {
  var s = empty(6);
  var a = R.addAlly(s, 'wind', 2, 2);
  var e = R.addEnemy(s, 'fire', 2, 0);
  var r = fire(s, a, 'up');
  eq(pos(r.state, e.id), [2, 0]);
  eq(hp(r.state, e.id), B.enemy.hp - B.ally.power);
  // 風の届かない川には押せない
  var s2 = board(['..R...', '......', '......', '......', '......', '......']);
  var a2 = R.addAlly(s2, 'wind', 2, 3);
  var e2 = R.addEnemy(s2, 'fire', 2, 1);
  eq(pos(fire(s2, a2, 'up').state, e2.id), [2, 1], '川の手前');
});
test('【新案】川の上を吹くと、川と風下の通り道が水たまりになる', function () {
  var s = board(['......', '......', '......', '......', '..R...', '......']);
  var a = R.addAlly(s, 'wind', 2, 5);
  var r = fire(s, a, 'up');
  eq([4, 3, 2].map(function (y) { return tile(r.state, 2, y); }), ['puddle', 'puddle', 'empty']);
});
test('【新案】川が水たまりになると通れるので、その先へ敵を押せる', function () {
  var s = board(['......', '..R...', '......', '......', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 3);
  var e = R.addEnemy(s, 'fire', 2, 2);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 1), pos(r.state, e.id)], ['puddle', [2, 1]]);
});
test('押した先が泥沼ならはまる', function () {
  var s = board(['......', '......', '..D...', '......', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 5);
  var e = R.addEnemy(s, 'fire', 2, 3);
  var r = fire(s, a, 'up');
  eq(pos(r.state, e.id), [2, 2]);
  eq(R.findUnit(r.state, e.id).stuck, true);
});
test('【新案】水たまりは通れる・土で泥沼・水が流れると川に戻る', function () {
  var s = board(['......', '......', '......', '......', '..P...', '......']);
  var a = R.addAlly(s, 'fire', 2, 5);
  ok(R.reachableCells(s, a.id)['2,4'] === 1, '通れる');
  var s2 = board(['......', '......', '......', '.P....', '......', '......']);
  var a2 = R.addAlly(s2, 'earth', 2, 5);
  eq(tile(fire(s2, a2, 'up').state, 1, 3), 'mud', '土で泥沼');
  var s3 = board(['......', '......', '......', '......', '..P...', '......']);
  var a3 = R.addAlly(s3, 'water', 2, 5);
  eq(tile(fire(s3, a3, 'up').state, 2, 4), 'river', '水で川');
});
test('炎に当たって燃え広がり（その先へは風が届かない）', function () {
  var s = board(['......', '......', '..X...', '......', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 4);
  var r = fire(s, a, 'up');
  eq(names(r.events, 'finisher'), ['燃え広がり']);
  eq(tile(r.state, 2, 2), 'fire', '起点の炎はそのまま');
  eq([tile(r.state, 2, 1), tile(r.state, 2, 0)], ['smallfire', 'smallfire'], '通り道の空きは小さな炎');
});

console.log('\n■ 燃え広がり');

test('小さな炎からでも起きる', function () {
  var s = board(['......', '......', '..s...', '......', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 4);
  eq(names(fire(s, a, 'up').events, 'finisher'), ['燃え広がり']);
});
test('起点にいる者は押されずにダメージを受ける（森でないので弱い炎）', function () {
  var s = board(['......', '......', '..s...', '......', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 4);
  var e = tough(s, R.addEnemy(s, 'fire', 2, 2));
  var r = fire(s, a, 'up');
  eq(pos(r.state, e.id), [2, 2]);
  eq(dealt(r, e.id), B.fire.weakDamage);
});
test('通り道の空きが小さな炎になり、最大4マス', function () {
  var s = board(['.........', '.........', '.........', '.........', '.........', '..X......', '.........', '.........', '.........']);
  var a = R.addAlly(s, 'wind', 2, 7);
  var r = fire(s, a, 'up');
  eq([4, 3, 2, 1, 0].map(function (y) { return tile(r.state, 2, y); }), ['smallfire', 'smallfire', 'smallfire', 'smallfire', 'empty']);
});
test('川・山の手前で止まる', function () {
  var s = board(['......', '..R...', '......', '..X...', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 5);
  var e = R.addEnemy(s, 'fire', 2, 0);
  var r = fire(s, a, 'up');
  eq(r.events.filter(function (e) { return e.type === 'finisher'; })[0].cells.length, 2, '起点＋1マス');
  eq(hp(r.state, e.id), B.enemy.hp);
  var s2 = board(['......', '..M...', '......', '..X...', '......', '......']);
  var a2 = R.addAlly(s2, 'wind', 2, 5);
  eq(fire(s2, a2, 'up').events.filter(function (e) { return e.type === 'finisher'; })[0].cells.length, 2);
});
test('つながった森が全部燃え、ダメージは一定（決め手20）、味方も巻き込む', function () {
  var s = board([
    '.......',
    '.FF....',
    '..F....',
    '..F....',
    '..X....',
    '.......',
    '....F..'
  ]);
  var w = R.addAlly(s, 'wind', 2, 6);
  var e = R.addEnemy(s, 'fire', 1, 1);      // つながった森の上
  var friend = R.addAlly(s, 'fire', 2, 0);  // 通り道の先（4マス目）
  var r = fire(s, w, 'up');
  ['1,1', '2,1', '2,2', '2,3'].forEach(function (k) {
    var c = k.split(',').map(Number);
    eq(tile(r.state, c[0], c[1]), 'fire', k);
  });
  eq(tile(r.state, 4, 6), 'forest', '離れた森');
  eq(dealt(r, e.id), 20, '森の数によらず一定');
  eq(R.findUnit(r.state, e.id), null, '敵は1発で倒れる');
  eq(R.findUnit(r.state, friend.id), null, '味方も巻き込まれて倒れる');
});

console.log('\n■ 【新案】雷（走る・ジグザグ）と感電');

test('雷の形はジグザグで、4方向に回転する', function () {
  var s = empty(9);
  eq(R.shapeCells(s, 'thunder', 4, 8, 'up'), [[4, 7], [5, 6], [4, 5], [5, 4]], '上');
  eq(R.shapeCells(s, 'thunder', 0, 4, 'right'), [[1, 4], [2, 5], [3, 4], [4, 5]], '右');
});
test('雷だけなら直撃（威力1）で、地形は変わらない', function () {
  var s = empty(6);
  var a = R.addAlly(s, 'thunder', 2, 5);
  var e = R.addEnemy(s, 'fire', 3, 3);
  var r = fire(s, a, 'up');
  eq(hp(r.state, e.id), B.enemy.hp - B.ally.power);
  eq(r.state.tiles, s.tiles);
});
test('雷が水に触れると、つながった水全体に走り、その上と隣の全員が感電（一定）', function () {
  var s = board(['......', '.RRRR.', '...P..', '......', '......', '......']);
  var a = R.addAlly(s, 'thunder', 2, 5);           // 形 (2,4)(3,3)(2,2)(3,1)
  var onP = R.addEnemy(s, 'fire', 3, 2);            // 水たまりの上
  var side = R.addEnemy(s, 'fire', 0, 1);           // 川の隣
  var far = R.addEnemy(s, 'fire', 0, 3);            // 水に触れていない
  var r = fire(s, a, 'up');
  eq(names(r.events, 'finisher'), ['感電']);
  var dmg = B.shock.base + 5 * B.shock.perWater;
  eq([dealt(r, onP.id), dealt(r, side.id), dealt(r, far.id)], [dmg, dmg, 0]);
});
test('同じ水に何マス触れても感電は1回。味方も巻き込まれる', function () {
  var s = board(['...R..', '...R..', '..RR..', '...R..', '......', '......']);
  var a = R.addAlly(s, 'thunder', 2, 5);
  var friend = R.addAlly(s, 'fire', 4, 1);
  var r = fire(s, a, 'up');
  eq(names(r.events, 'finisher'), ['感電']);
  eq(R.findUnit(r.state, friend.id), null, '川の隣の味方も倒れる');
});

console.log('\n■ 【新案】火山と桜吹雪');

test('標準の起こし方は「火山に風」で、花びらが舞う（オーナー 10/17）', function () {
  eq([B.sakura.from, B.sakura.petals], ['fire', true]);
});
// 桜吹雪の扇を火山の大きさで決める（balance.js の eruption.scale）を、この中だけ v にする
function withScale(v, fn) { var keep = B.eruption.scale; B.eruption.scale = v; try { fn(); } finally { B.eruption.scale = keep; } }
function finText(r) { return r.events.filter(function (ev) { return ev.type === 'finisher'; })[0].text; }
test('火山1つなら、風下へ扇形（1・3・5マス）に花びらが舞う（今までと同じ）', function () {
  eq(B.eruption.scale, true, '標準は火山の大きさで');
  var s = board(['.......', '.......', '.......', '.......', '...V...', '.......', '.......']);
  var a = R.addAlly(s, 'wind', 3, 6);
  var r = fire(s, a, 'up');
  eq(names(r.events, 'finisher'), ['桜吹雪']);
  eq(sorted(r.state.tiles.map(function (t, i) { return t === 'petals' ? [i % 7, Math.floor(i / 7)] : null; }).filter(Boolean)),
    sorted([[3, 3], [2, 2], [3, 2], [4, 2], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1]]), '1・3・5マス');
  ok(!/扇は火山の幅/.test(finText(r)), '火山1つなら扇の一言は出さない');
});
test('並んだ火山は、その幅から扇が始まる（火山2つ横並び: 2・4・6マス）。森は燃えず、火山は山に戻る', function () {
  var s = board(['.......', '.......', '...F...', '.......', '..VV...', '.......', '.......']);
  var a = R.addAlly(s, 'wind', 3, 6);
  var e = tough(s, R.addEnemy(s, 'fire', 1, 1));
  var r = fire(s, a, 'up');
  eq(names(r.events, 'finisher'), ['桜吹雪']);
  eq(dealt(r, e.id), B.eruption.base + 2 * B.eruption.perVolcano);
  eq([tile(r.state, 2, 3), tile(r.state, 3, 3), tile(r.state, 1, 2), tile(r.state, 4, 2), tile(r.state, 0, 1), tile(r.state, 5, 1)],
    ['petals', 'petals', 'petals', 'petals', 'petals', 'petals'], '幅2から 2・4・6マス');
  eq(tile(r.state, 3, 2), 'forest', '森は燃えない');
  eq([tile(r.state, 1, 3), tile(r.state, 6, 1)], ['empty', 'empty'], '扇の外');
  eq([tile(r.state, 2, 4), tile(r.state, 3, 4)], ['mountain', 'mountain'], 'つながった火山がまとめて山に戻る');
  ok(/火山2つの花びらが上へ舞い散った/.test(finText(r)));
  ok(/火山の大きさの分、扇が広がった（12マス）/.test(finText(r)), finText(r));
  eq(R.endTurn(r.state).state.tiles.filter(function (t) { return t === 'petals'; }).length, 0, '花びらはターン終了で散る');
});
test('風の向きに長い火山は、当たった火山から数えて先の火山の中を通る分だけ伸び、先にも3列届く（縦に2つ: 3・5・7マス）', function () {
  var s = empty(9);
  R.setTile(s, 4, 5, 'volcano'); R.setTile(s, 4, 6, 'volcano');
  var a = R.addAlly(s, 'wind', 4, 8);             // 風は (4,7) を通って、後ろの火山 (4,6) に当たる
  var r = fire(s, a, 'up');
  eq(sorted(r.state.tiles.map(function (t, i) { return t === 'petals' ? [i % 9, Math.floor(i / 9)] : null; }).filter(Boolean)),
    sorted([[3, 4], [4, 4], [5, 4], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2]]), '火山の先に 3・5・7マス');
  eq([tile(r.state, 4, 1), tile(r.state, 4, 5)], ['empty', 'mountain'], '3列より先には届かない・先の火山も山に戻る');
  ok(/火山の大きさの分、扇が広がった（15マス）/.test(finText(r)), finText(r));
});
test('火山の大きさで扇を決めても、元の形より小さくはならない（L字の火山3つ: 元の扇のマスをすべて含む）', function () {
  var rows = ['......', '......', '...VV.', '...V..', '......', '......'];
  var cellsWith = function (v) {
    var out = null;
    withScale(v, function () {
      var s = board(rows);
      var a = R.addAlly(s, 'wind', 3, 5);
      var r = fire(s, a, 'up');
      out = r.events.filter(function (e) { return e.type === 'finisher'; })[0].cells.map(function (c) { return c.join(','); });
    });
    return out;
  };
  var now = cellsWith(true), old = cellsWith(false);
  ok(old.every(function (k) { return now.indexOf(k) >= 0; }), '元: ' + old.join(' ') + ' / 今: ' + now.join(' '));
  ok(now.length > old.length, '今のほうが広い');
});
test('【元】eruption.scale を切ると、並んだ火山でも当たった火山から1・3・5マス', function () { withScale(false, function () {
  var s = board(['.......', '.......', '...F...', '.......', '..VV...', '.......', '.......']);
  var a = R.addAlly(s, 'wind', 3, 6);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 3, 3), tile(r.state, 2, 2), tile(r.state, 4, 2), tile(r.state, 5, 1)], ['petals', 'petals', 'petals', 'petals']);
  eq([tile(r.state, 0, 1), tile(r.state, 2, 3)], ['empty', 'empty'], '扇の外');
  ok(!/扇は火山の幅/.test(finText(r)));
}); });
test('標準では、山に草を植えても桜は咲かない（土 → 草 → 風はなくした）', function () {
  var s = board(['......', '......', '..M...', '......', '......', '......']);
  var a = R.addAlly(s, 'grass', 2, 5);
  eq(tile(fire(s, a, 'up').state, 2, 2), 'mountain');
});

// 元の試しの起こし方（山に草で桜）
B.sakura.from = 'grass';
test('【試し】山に草を植えると桜が咲く（森にはならない）。空きには森', function () {
  var s = board(['......', '......', '..M...', '......', '......', '......']);
  var a = R.addAlly(s, 'grass', 2, 5);              // 上向き: (2,3)(1,2)(2,2)(3,2)
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 2), tile(r.state, 2, 3), tile(r.state, 1, 2)], ['sakura', 'forest', 'forest']);
  eq(R.isPassable('sakura'), false);
});
test('【試し】桜に風で桜吹雪: 花びらが扇形に舞い、空きは花びら（燃えない）。桜は散って山に戻る', function () {
  var s = board(['.......', '.......', '...F...', '.......', '..KK...', '.......', '.......']);
  var a = R.addAlly(s, 'wind', 3, 6);
  var e = tough(s, R.addEnemy(s, 'fire', 3, 1));
  var r = fire(s, a, 'up');
  eq(names(r.events, 'finisher'), ['桜吹雪']);
  eq(dealt(r, e.id), B.eruption.base + 2 * B.eruption.perVolcano);
  eq([tile(r.state, 3, 3), tile(r.state, 3, 2), tile(r.state, 1, 1)], ['petals', 'forest', 'petals'], '森は燃えない');
  eq([tile(r.state, 2, 4), tile(r.state, 3, 4)], ['mountain', 'mountain']);
  eq(R.endTurn(r.state).state.tiles.filter(function (t) { return t === 'petals'; }).length, 0, '花びらはターン終了で散る');
});
test('【試し】桜の起こし方のとき、火山に風は止まるだけ', function () {
  var s = board(['......', '......', '..V...', '......', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 5);
  eq(names(fire(s, a, 'up').events, 'finisher'), []);
});

// ここから火山に風（標準）。火の粉の2つは、元の見せ方（sakura.petals を切る）
B.sakura.from = 'fire';
B.sakura.petals = false;
test('【元】花びらを切ると、風が火山に当たって風下へ扇形（1・3・5マス）に火の粉が舞う', function () {
  var s = board(['.......', '.......', '.......', '.......', '...V...', '.......', '.......']);
  var a = R.addAlly(s, 'wind', 3, 6);
  var e = R.addEnemy(s, 'fire', 1, 1);
  var r = fire(s, a, 'up');
  eq(names(r.events, 'finisher'), ['桜吹雪']);
  eq([tile(r.state, 3, 3), tile(r.state, 2, 2), tile(r.state, 4, 2), tile(r.state, 1, 1), tile(r.state, 5, 1)], ['smallfire', 'smallfire', 'smallfire', 'smallfire', 'smallfire']);
  eq(tile(r.state, 0, 1), 'empty', '扇の外');
  eq(dealt(r, e.id), B.eruption.base + B.eruption.perVolcano);
  eq(tile(r.state, 3, 4), 'mountain', '噴き終えた火山は山に戻る');
});
test('【元】花びらを切ると、つながった火山がまとめて冷え、森に落ちれば森が燃える', function () {
  var s = board(['.......', '.......', '...F...', '.......', '..VV...', '.......', '.......']);
  var a = R.addAlly(s, 'wind', 3, 6);
  var e = R.addEnemy(s, 'fire', 3, 1);
  var r = fire(s, a, 'up');
  eq(dealt(r, e.id), B.eruption.base + 2 * B.eruption.perVolcano);
  eq(tile(r.state, 3, 2), 'fire');
  eq([tile(r.state, 2, 4), tile(r.state, 3, 4)], ['mountain', 'mountain']);
});
B.sakura.petals = true;
test('山は風をさえぎる（決め手は起きない）が、火山は桜吹雪になる', function () {
  var s = board(['......', '......', '..M...', '......', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 5);
  eq(names(fire(s, a, 'up').events, 'finisher'), []);
});


console.log('\n■ 【新案】雷は高い所に落ちる');

test('雷は通り道で最初に当たった森に落ちて、森が燃える（その先の川には届かない）', function () {
  var s = board(['......', '...R..', '..R...', '...F..', '......', '......']);
  var a = R.addAlly(s, 'thunder', 2, 5);           // 上向き: (2,4)(3,3)(2,2)(3,1)
  var r = fire(s, a, 'up');
  eq(tile(r.state, 3, 3), 'fire');
  eq(names(r.events, 'finisher'), [], '川まで届かないので感電しない');
});
test('雷は山・火山に落ちると、そこで止まる', function () {
  var s = board(['......', '...R..', '......', '...M..', '......', '......']);
  var a = R.addAlly(s, 'thunder', 2, 5);
  var r = fire(s, a, 'up');
  eq(names(r.events, 'finisher'), []);
  eq(tile(r.state, 3, 3), 'mountain');
});
test('雷はユニットに落ちたら直撃して止まる', function () {
  var s = board(['......', '...R..', '......', '......', '......', '......']);
  var a = R.addAlly(s, 'thunder', 2, 5);
  var e = R.addEnemy(s, 'fire', 3, 3);
  var r = fire(s, a, 'up');
  eq(hp(r.state, e.id), B.enemy.hp - B.ally.power);
  eq(names(r.events, 'finisher'), [], '先の川には届かない');
});
test('何にも当たらなければ地面に落ちて、何も起きない', function () {
  var s = empty(6);
  var a = R.addAlly(s, 'thunder', 2, 5);
  var r = fire(s, a, 'up');
  eq(r.state.tiles, s.tiles);
});

console.log('\n■ 【新案】蜃気楼');

test('火が水たまりに当たると蜃気楼になる（川はならない）', function () {
  var s = board(['......', '......', '..R...', '......', '..P...', '......']);
  var a = R.addAlly(s, 'fire', 2, 5);              // (2,4) と (2,2)
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 4), tile(r.state, 2, 2)], ['mirage', 'river']);
});
test('蜃気楼の中にいる味方は敵に狙われない。全員隠れると敵は見失う', function () {
  var s = board(['......', '......', '......', '......', '......', '..H...'], true);
  var e = R.addEnemy(s, 'fire', 2, 0);
  R.addAlly(s, 'water', 2, 5);
  var r = R.endTurn(s);
  eq(pos(r.state, e.id), [2, 0], '動かない');
  ok(r.events.some(function (ev) { return /見失った/.test(ev.text); }));
  ok(!r.events.some(function (ev) { return ev.type === 'cast' && ev.id === e.id; }), '撃たない');
});
test('隠れていない味方がいれば、そちらを狙う', function () {
  var s = board(['......', '......', '......', '......', '......', '..H...'], true);
  var e = R.addEnemy(s, 'fire', 2, 0);
  var hiddenAlly = R.addAlly(s, 'water', 2, 5);
  var seen = R.addAlly(s, 'fire', 5, 5);
  var plan = R.planEnemy(s, R.findUnit(s, e.id));
  ok(plan.kind !== 'lost');
  ok(plan.target === undefined || plan.target === seen.id, 'target=' + plan.target);
  ok(hiddenAlly);
});
test('蜃気楼に水が流れると川に戻る', function () {
  var s = board(['......', '......', '......', '......', '..H...', '......']);
  var a = R.addAlly(s, 'water', 2, 5);
  eq(tile(fire(s, a, 'up').state, 2, 4), 'river');
});

console.log('\n■ 【新案】氷（凍らせる）と凍結');

test('冷気が水に触れると、つながった水（川・水たまり）がまとめて凍る', function () {
  var s = board(['..R...', '..R...', '..RRR.', '....P.', '......', '......']);
  var a = R.addAlly(s, 'ice', 2, 4);
  var r = fire(s, a, 'up');
  eq(names(r.events, 'finisher'), ['凍結']);
  eq(['2,0', '2,1', '2,2', '3,2', '4,2', '4,3'].map(function (k) { var c = k.split(',').map(Number); return tile(r.state, c[0], c[1]); }), ['ice', 'ice', 'ice', 'ice', 'ice', 'ice']);
});
test('凍った川は歩いて渡れる', function () {
  var s = board(['......', '......', '......', 'IIIIII', '......', '......']);
  var a = R.addAlly(s, 'fire', 2, 4);
  ok(R.reachableCells(s, a.id)['2,2'] === 2, '氷を越えて2マス先へ');
});
test('凍った水たまりの上にいた者は足が凍りつく（次の移動が1回できない）', function () {
  var s = board(['......', '......', '......', '..PP..', '......', '......']);
  var a = R.addAlly(s, 'ice', 2, 5);
  var e = R.addEnemy(s, 'fire', 3, 3);
  var r = fire(s, a, 'up');
  ok(R.findUnit(r.state, e.id).stuck);
  eq(hp(r.state, e.id), B.enemy.hp, '凍結にダメージはない');
});
test('冷気は最初に当たったものに作用して止まる（炎は消える・ユニットは直撃して凍りつく）', function () {
  var s = board(['......', '......', '..R...', '..X...', '......', '......']);
  var a = R.addAlly(s, 'ice', 2, 4);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 3), tile(r.state, 2, 2)], ['empty', 'river'], '炎を消して止まり、川までは届かない');
  var s2 = empty(6);
  var a2 = R.addAlly(s2, 'ice', 2, 5);
  var e2 = R.addEnemy(s2, 'fire', 2, 4);
  var r2 = fire(s2, a2, 'up');
  eq(hp(r2.state, e2.id), B.enemy.hp - B.ally.power);
  ok(R.findUnit(r2.state, e2.id).stuck);
});
test('火が氷に当たると溶けて水たまり。水は氷の上を流れていく', function () {
  var s = board(['......', '......', '......', '......', '..I...', '......']);
  var a = R.addAlly(s, 'fire', 2, 5);
  eq(tile(fire(s, a, 'up').state, 2, 4), 'puddle');
  var s2 = board(['......', '......', '......', '......', '..I...', '......']);
  var a2 = R.addAlly(s2, 'water', 2, 5);
  var r2 = fire(s2, a2, 'up');
  eq([tile(r2.state, 2, 4), tile(r2.state, 2, 3)], ['ice', 'puddle'], '氷の先の空きは水たまり');
});

console.log('\n■ 【新案】噴火と溶岩');

test('【試し・標準】溶岩なし: 火が山に点くと、山脈がまとめて火山になるだけ（決め手ではない）', function () {
  eq(B.funka.lava, false);
  var s = board(['......', '..F...', '.RMM..', '...M..', '......', '......']);
  var a = R.addAlly(s, 'fire', 2, 3);
  var e = R.addEnemy(s, 'fire', 4, 2);
  var r = fire(s, a, 'up');
  eq(names(r.events, 'finisher'), []);
  eq([tile(r.state, 2, 2), tile(r.state, 3, 2), tile(r.state, 3, 3)], ['volcano', 'volcano', 'volcano'], '山脈ごと火山');
  eq([tile(r.state, 2, 1), tile(r.state, 1, 2)], ['forest', 'river'], 'まわりは変わらない');
  eq(hp(r.state, e.id), B.enemy.hp, 'ダメージなし');
});

// ここから元の噴火（溶岩あり）
B.funka.lava = true;
test('【元】火が山に点くと、つながった山（山脈）がまとめて火山になり、まわりに溶岩があふれる', function () {
  var s = board(['......', '......', '..MM..', '...M..', '......', '......']);
  var a = R.addAlly(s, 'fire', 2, 3);              // 上向き: (2,2) の山に火
  var r = fire(s, a, 'up');
  eq(names(r.events, 'finisher'), ['噴火']);
  eq([tile(r.state, 2, 2), tile(r.state, 3, 2), tile(r.state, 3, 3)], ['volcano', 'volcano', 'volcano'], '山脈ごと火山');
  eq([tile(r.state, 2, 1), tile(r.state, 1, 2), tile(r.state, 4, 3), tile(r.state, 3, 4)], ['lava', 'lava', 'lava', 'lava'], 'まわりに溶岩');
});
test('【元】あふれた先: 森は燃え、水は冷えて山になり、ユニットはダメージ（山脈が大きいほど強い）', function () {
  var s = board(['......', '..F...', '.RM...', '......', '......', '......']);
  var a = R.addAlly(s, 'fire', 2, 3);
  var e = R.addEnemy(s, 'fire', 3, 2);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 1), tile(r.state, 1, 2)], ['fire', 'mountain']);
  eq(hp(r.state, e.id), B.enemy.hp - (B.funka.base + 1 * B.funka.perMountain));
});
B.funka.lava = false;
test('溶岩は水が流れてくると冷えて山になる。冷気でも山になる', function () {
  var s = board(['......', '......', '......', '......', '..L...', '......']);
  var a = R.addAlly(s, 'water', 2, 5);
  eq(tile(fire(s, a, 'up').state, 2, 4), 'mountain');
  var s2 = board(['......', '......', '......', '......', '..L...', '......']);
  var a2 = R.addAlly(s2, 'ice', 2, 5);
  eq(tile(fire(s2, a2, 'up').state, 2, 4), 'mountain');
});
test('溶岩は通れず、燃え広がりも止める', function () {
  var s = board(['......', '..L...', '......', '..X...', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 5);
  var r = fire(s, a, 'up');
  eq(r.events.filter(function (e) { return e.type === 'finisher'; })[0].cells.length, 2, '起点＋1マス');
  var s2 = board(['......', '......', '......', '......', '..L...', '......']);
  var a2 = R.addAlly(s2, 'fire', 2, 5);
  ok(R.reachableCells(s2, a2.id)['2,4'] === undefined);
});

console.log('\n■ 【新案】つむじ風・竜巻・火炎竜巻・センタクキ（今は外している。作り方を選べば動く）');

test('竜巻を外している（標準）ときは、風はつむじ風を残さず、竜巻は起きない', function () {
  eq(B.tornadoRecipe, 'off');
  var s = empty(6);
  var a = R.addAlly(s, 'wind', 2, 5);
  eq(fire(s, a, 'up').state.tiles.filter(function (t) { return t === 'whirlwind'; }).length, 0);
  var s2 = board(['......', '......', '..W...', '......', '......', '......']);
  var w = R.addAlly(s2, 'water', 2, 4);
  eq(fire(s2, w, 'up').state.tiles.filter(function (t) { return t === 'tornado'; }).length, 0);
});
B.tornadoRecipe = 'windWater';
B.windMode = 'line';   // 竜巻は4マスの風（元の形）で作るもの

test('風が吹き抜けた先の最後のマスに、つむじ風が残る', function () {
  var s = empty(6);
  var a = R.addAlly(s, 'wind', 2, 5);
  var r = fire(s, a, 'up');
  eq(tile(r.state, 2, 1), 'whirlwind');
});
test('最後のマスにユニットがいる・燃え広がりになった、ならつむじ風は残らない', function () {
  var s = empty(6);
  var a = R.addAlly(s, 'wind', 2, 5);
  R.addEnemy(s, 'fire', 2, 0);
  var r = fire(s, a, 'up');                         // 敵は押されて盤の端で止まる。最後のマス (2,1) は空き
  ok(r.state.tiles.filter(function (t) { return t === 'whirlwind'; }).length <= 1);
  var s2 = board(['......', '......', '......', '..s...', '......', '......']);
  var a2 = R.addAlly(s2, 'wind', 2, 5);
  var r2 = fire(s2, a2, 'up');
  eq(r2.state.tiles.filter(function (t) { return t === 'whirlwind'; }).length, 0);
});
// ここから「元の作り方」（tornadoRecipe: windWind）
B.tornadoRecipe = 'windWind';
test('【元】つむじ風に風を当てると、2×2の竜巻に育つ（中には入れない）', function () {
  var s = board(['......', '......', '..W...', '......', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 5);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 2), tile(r.state, 3, 2), tile(r.state, 2, 1), tile(r.state, 3, 1)], ['tornado', 'tornado', 'tornado', 'tornado']);
  var b = R.addAlly(r.state, 'fire', 1, 2);
  ok(R.reachableCells(r.state, b.id)['2,2'] === undefined, '竜巻には入れない');
});
test('【元】竜巻に火を入れると火炎竜巻: 竜巻とまわりが燃え上がる', function () {
  var s = board(['......', '.FTT..', '..TT..', '......', '......', '......']);
  var a = R.addAlly(s, 'fire', 2, 3);              // (2,2) 竜巻に火
  var e = R.addEnemy(s, 'fire', 4, 2);
  var r = fire(s, a, 'up');
  eq(names(r.events, 'finisher'), ['火炎竜巻']);
  eq([tile(r.state, 2, 1), tile(r.state, 3, 2), tile(r.state, 1, 1), tile(r.state, 4, 0)], ['fire', 'fire', 'fire', 'smallfire']);
  eq(dealt(r, e.id), B.fireTornado.damage);
});
test('【元】竜巻に水を入れるとセンタクキ: まわりの輪が回り、竜巻は消える', function () {
  var s = board(['......', '..TT..', '..TT..', '......', '......', '......']);
  var a = R.addAlly(s, 'water', 2, 4);             // (2,3) 水たまり、(2,2) 竜巻
  var e = tough(s, R.addEnemy(s, 'fire', 1, 0));   // 輪の左上
  var r = fire(s, a, 'up');
  eq(names(r.events, 'finisher'), ['センタクキ']);
  eq(pos(r.state, e.id), [4, 0], '輪を4分の1回って右上へ');
  eq(dealt(r, e.id), B.sentakuki.damage);
  eq([tile(r.state, 2, 1), tile(r.state, 3, 2)], ['empty', 'empty'], '竜巻は跡形もなく消えた');
  eq(r.state.tiles.filter(function (t) { return t === 'puddle'; }).length, 1, '雨は降らない（水たまりは撃った水の1マスだけ。輪と一緒に回る）');
});
test('【元】【仮】あと一手のヒント: 竜巻があると「水でセンタクキ」。今撃てる水の味方を教える', function () {
  var s = board(['......', '..TT..', '..TT..', '......', '......', '......']);
  var h = R.nextHints(s);
  eq(h.map(function (x) { return [x.name, x.magic, x.cells.length, x.shooters.length]; }), [['センタクキ', 'water', 4, 0]], '水の味方がいなくても札は出る');
  var w = R.addAlly(s, 'water', 4, 5);             // (3,4) へ動いて上に撃てば竜巻に届く
  R.addAlly(s, 'fire', 2, 5);
  h = R.nextHints(s);
  eq(h[0].shooters.map(function (x) { return x.id; }), [w.id], '水の味方だけが撃てる');
  var p = h[0].shooters[0];
  eq(R.previewAct(s, w.id, p.to, p.dir).finishers.map(function (f) { return f.name; }), ['センタクキ'], '教えた立ち位置・向きで本当に起きる');
  w.acted = true;
  eq(R.nextHints(s)[0].shooters.length, 0, '撃ったあとの味方は数えない');
  eq(R.nextHints(empty(6)).length, 0, '竜巻がなければ何も出ない');
});

// ここから「新しい作り方」（tornadoRecipe: windWater。今の標準）
B.tornadoRecipe = 'windWater';
test('つむじ風に水を流すと、水を巻き上げて2×2の竜巻に育つ', function () {
  var s = board(['......', '......', '..W...', '......', '......', '......']);
  var a = R.addAlly(s, 'water', 2, 4);             // (2,3) 水たまり、(2,2) つむじ風
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 2), tile(r.state, 3, 2), tile(r.state, 2, 1), tile(r.state, 3, 1)], ['tornado', 'tornado', 'tornado', 'tornado']);
  eq(tile(r.state, 2, 3), 'puddle', '手前は水たまり');
});
test('つむじ風に風を当てても竜巻にはならない（風は吹き抜ける）', function () {
  var s = board(['......', '......', '..W...', '......', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 5);
  var r = fire(s, a, 'up');
  eq(r.state.tiles.filter(function (t) { return t === 'tornado'; }).length, 0);
});
test('竜巻に火を入れるとセンタクキ（火炎竜巻にはならない）', function () {
  var s = board(['......', '..TT..', '..TT..', '......', '......', '......']);
  var a = R.addAlly(s, 'fire', 2, 3);              // (2,2) 竜巻に火
  var e = tough(s, R.addEnemy(s, 'fire', 1, 0));
  var r = fire(s, a, 'up');
  eq(names(r.events, 'finisher'), ['センタクキ']);
  eq(pos(r.state, e.id), [4, 0], '輪を4分の1回って右上へ');
  eq(dealt(r, e.id), B.sentakuki.damage);
});
test('竜巻に水を入れても何も起きない（吸いこまれる）', function () {
  var s = board(['......', '..TT..', '..TT..', '......', '......', '......']);
  var a = R.addAlly(s, 'water', 2, 4);
  var r = fire(s, a, 'up');
  eq(names(r.events, 'finisher'), []);
  eq(tile(r.state, 2, 2), 'tornado');
});
test('【仮】あと一手のヒント: 竜巻があると「火でセンタクキ」', function () {
  var s = board(['......', '..TT..', '..TT..', '......', '......', '......']);
  eq(R.nextHints(s).map(function (x) { return [x.name, x.magic]; }), [['センタクキ', 'fire']]);
  var f = R.addAlly(s, 'fire', 2, 5);
  eq(R.nextHints(s)[0].shooters.map(function (x) { return x.id; }), [f.id]);
});

console.log('\n■ 【新案・試し】旋風（巻く）');

B.tornadoRecipe = 'senpu';
test('旋風は正面の2×2につむじ風を巻く。ユニットのいるマスは直撃だけ', function () {
  var s = empty(6);
  var a = R.addAlly(s, 'senpu', 2, 5);
  var e = R.addEnemy(s, 'fire', 3, 2);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 3), tile(r.state, 3, 3), tile(r.state, 2, 2), tile(r.state, 3, 2)], ['whirlwind', 'whirlwind', 'whirlwind', 'empty']);
  eq(hp(r.state, e.id), B.enemy.hp - 1);
});
test('旋風の作り方では、風はつむじ風を残さない', function () {
  var s = empty(6);
  var a = R.addAlly(s, 'wind', 2, 5);
  var r = fire(s, a, 'up');
  eq(r.state.tiles.filter(function (t) { return t === 'whirlwind'; }).length, 0);
});
test('つむじ風に水を流すと、つながったつむじ風がまるごと竜巻になる（大きく巻けば大きな竜巻）', function () {
  var s = board(['......', '.WWW..', '.WWW..', '......', '......', '......']);
  var b = R.addAlly(s, 'water', 2, 4);             // (2,3) 池、(2,2) つむじ風
  var r = fire(s, b, 'up');
  eq(r.state.tiles.filter(function (t) { return t === 'tornado'; }).length, 6);
});
test('旋風の竜巻に火でセンタクキ。何も残らない', function () {
  var s = board(['......', '..WW..', '..WW..', '......', '......', '......']);
  var w = R.addAlly(s, 'water', 0, 2);
  var r = fire(s, w, 'right');                     // (1,2) 池、(2,2) つむじ風 → 竜巻
  eq(tile(r.state, 3, 1), 'tornado');
  var f = R.addAlly(r.state, 'fire', 2, 3);         // (2,2) 竜巻に火
  var r2 = fire(r.state, f, 'up');
  eq(names(r2.events, 'finisher'), ['センタクキ']);
  eq(r2.state.tiles.filter(function (t) { return t === 'tornado'; }).length, 0);
  eq(tile(r2.state, 2, 1), 'empty');
});
B.tornadoRecipe = 'off';
B.windMode = 'breeze';

console.log('\n■ 【新案・試し】風の形 2マス（風が残る）・火の渦');

B.windMode = 'breeze';
test('風は正面2マス。通り道の空きに風が残り、敵は運ばれる', function () {
  var s = empty(6);
  var a = R.addAlly(s, 'wind', 2, 5);
  var e = R.addEnemy(s, 'fire', 2, 4);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 4), tile(r.state, 2, 3), tile(r.state, 2, 2)], ['breeze', 'breeze', 'empty']);
  eq(pos(r.state, e.id), [2, 3], '運ばれた先も風の中');
});
test('風に火を入れると火の渦: 火が風を強くして2×2の渦に。中の全員に一定のダメージ', function () {
  var s = board(['......', '......', '..B...', '..B...', '......', '......']);
  var e = R.addEnemy(s, 'fire', 3, 2);
  var a = R.addAlly(s, 'fire', 2, 4);                // (2,3) の風に火
  var r = fire(s, a, 'up');
  eq(names(r.events, 'finisher'), ['火の渦']);
  eq([tile(r.state, 2, 2), tile(r.state, 3, 2), tile(r.state, 2, 3), tile(r.state, 3, 3)], ['firewhirl', 'firewhirl', 'firewhirl', 'firewhirl'], '風の2マスと、火を入れた者から見て右の2マス');
  eq(dealt(r, e.id), B.fire.weakDamage, '森がないので弱い炎');
  eq(R.isPassable('firewhirl'), false);
});
test('2×2を選ぶ順: 風を多く含む → 奥 → 右（横向きの風なら奥へ広がる）', function () {
  var s = board(['......', '......', '......', '..BB..', '......', '......']);
  var b = R.addAlly(s, 'fire', 3, 5);
  var r = fire(s, b, 'up');                          // (3,4) 空き → 風に当たらなければ何も起きない
  eq(names(r.events, 'finisher'), []);
  var s2 = board(['......', '......', '......', '..BB..', '......', '......']);
  var c = R.addAlly(s2, 'fire', 3, 4);               // (3,3) の風に火
  var r2 = fire(s2, c, 'up');
  eq([tile(r2.state, 2, 2), tile(r2.state, 3, 2), tile(r2.state, 2, 3), tile(r2.state, 3, 3)], ['firewhirl', 'firewhirl', 'firewhirl', 'firewhirl'], '奥（上）へ広がる');
  eq(R.findUnit(r2.state, c.id).hp, B.ally.hp, '火を入れた本人は巻き込まれない');
});
test('火の渦に水でセンタクキ: まわりの輪が回り、渦は跡形もなく消える', function () {
  var s = board(['......', '..QQ..', '..QQ..', '......', '......', '......']);
  var a = R.addAlly(s, 'water', 2, 4);               // (2,3) 池、(2,2) 火の渦
  var e = tough(s, R.addEnemy(s, 'fire', 1, 0));
  var r = fire(s, a, 'up');
  eq(names(r.events, 'finisher'), ['センタクキ']);
  eq(pos(r.state, e.id), [4, 0], '輪を4分の1回って右上へ');
  eq(r.state.tiles.filter(function (t) { return t === 'firewhirl'; }).length, 0);
});
test('火の渦に風が当たると燃え広がり（火が先、風が後）', function () {
  var s = board(['......', '..QQ..', '..QQ..', '......', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 4);
  eq(names(fire(s, a, 'up').events, 'finisher'), ['燃え広がり']);
});
test('火の渦はターン終了で解けて炎になり、隣の森へ燃え移る', function () {
  var s = board(['......', '.FQQ..', '..QQ..', '......', '......', '......']);
  R.addAlly(s, 'fire', 0, 5);
  var r = R.endTurn(s);
  eq([tile(r.state, 2, 1), tile(r.state, 1, 1)], ['fire', 'fire']);
});
test('火が先で風が後なら、今までどおり燃え広がり（風は残らない）', function () {
  var s = board(['......', '......', '......', '..X...', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 5);
  var r = fire(s, a, 'up');
  eq(names(r.events, 'finisher'), ['燃え広がり']);
  eq(r.state.tiles.filter(function (t) { return t === 'breeze'; }).length, 0);
});
test('吹いていた風はターン終了でやむ', function () {
  var s = board(['......', '......', '..BB..', '......', '......', '......']);
  R.addAlly(s, 'fire', 0, 5);
  var r = R.endTurn(s);
  eq(r.state.tiles.filter(function (t) { return t === 'breeze'; }).length, 0);
});
test('元の形（4マス）に切り替えると、正面4マスまで吹き抜け、風は残らない', function () {
  B.windMode = 'line';
  try {
    var s = empty(6);
    var a = R.addAlly(s, 'wind', 2, 5);
    var e = R.addEnemy(s, 'fire', 2, 1);
    var r = fire(s, a, 'up');
    eq(pos(r.state, e.id), [2, 0]);
    eq(r.state.tiles.filter(function (t) { return t === 'breeze'; }).length, 0);
  } finally { B.windMode = 'breeze'; }
});

console.log('\n■ 【新案・試し】闇（吸う）・死の森・オバケヤシキ');

test('闇を撃つと、そのマスのまわり2マス以内の者を1マス引き寄せる（ダメージなし。もともと隣の者は動かない）', function () {
  var s = empty(6);
  var a = R.addAlly(s, 'dark', 2, 4);               // (2,3) に闇
  var e1 = R.addEnemy(s, 'fire', 2, 1);              // 2マス上 → (2,2)
  var e2 = R.addEnemy(s, 'fire', 4, 3);              // 2マス右 → (3,3)
  var e3 = R.addEnemy(s, 'fire', 5, 0);              // 遠い
  var r = fire(s, a, 'up');
  eq([pos(r.state, e1.id), pos(r.state, e2.id), pos(r.state, e3.id), pos(r.state, a.id)], [[2, 2], [3, 3], [5, 0], [2, 4]]);
  eq([hp(r.state, e1.id), hp(r.state, e2.id)], [B.enemy.hp, B.enemy.hp]);
  eq(names(r.events, 'finisher'), []);
});
test('森に闇: つながった森がまとめて死の森になる', function () {
  var s = board(['......', '..FF..', '..F...', '......', '....F.', '......']);
  var a = R.addAlly(s, 'dark', 2, 3);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 2), tile(r.state, 2, 1), tile(r.state, 3, 1), tile(r.state, 4, 4)], ['deadforest', 'deadforest', 'deadforest', 'forest']);
});
test('【仮】死の森に火でオバケヤシキ（火が当たった1マス）: まわり2マス以内を引き寄せ、中と隣の全員に一定のダメージ', function () {
  var s = board(['......', '..GG..', '......', '......', '......', '......']);
  var a = R.addAlly(s, 'fire', 2, 2);               // (2,1) 死の森に火
  var e1 = tough(s, R.addEnemy(s, 'fire', 4, 1));    // 2マス右 → (3,1) へ引き寄せられて隣
  var e2 = R.addEnemy(s, 'fire', 1, 1);              // もともと隣
  var r = fire(s, a, 'up');
  eq(names(r.events, 'finisher'), ['オバケヤシキ']);
  eq([tile(r.state, 2, 1), tile(r.state, 3, 1)], ['haunted', 'deadforest'], '森全部ではなく1マス');
  eq(R.isPassable('haunted'), false);
  eq(pos(r.state, e1.id), [3, 1]);
  eq([dealt(r, e1.id), dealt(r, e2.id)], [B.haunt.damage, B.haunt.damage]);
  eq(R.findUnit(r.state, a.id), null, '【課題】火は1マスなので、火を点けた本人も必ず隣にいて倒れる');
});
test('闇で水は凍らない（いったん外した）', function () {
  var s = board(['......', '......', '..RR..', '......', '......', '......']);
  var a = R.addAlly(s, 'dark', 2, 3);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 2), tile(r.state, 3, 2)], ['river', 'river']);
});

console.log('\n■ 炎の強さ・火傷・燃え尽き（IMPROVE_fire）');

test('燃え広がり: 燃えた森のマスは強い炎（20）、それ以外のマスは弱い炎（5＋火傷）', function () {
  var s = board(['......', '..F...', '......', '..X...', '......', '......']);
  var w = R.addAlly(s, 'wind', 2, 5);
  var onForest = tough(s, R.addEnemy(s, 'fire', 2, 1));
  var onPath = tough(s, R.addEnemy(s, 'fire', 2, 2));
  var r = fire(s, w, 'up');
  eq([dealt(r, onForest.id), dealt(r, onPath.id)], [B.fire.strongDamage, B.fire.weakDamage]);
  eq([R.findUnit(r.state, onForest.id).burn, R.findUnit(r.state, onPath.id).burn], [0, B.fire.burnTurns], '弱い炎だけ火傷');
  eq(R.previewAct(s, w.id, [2, 5], 'up').finishers[0].strong, [[2, 1]], '強い炎のマスが分かる');
});
test('森なしの火 → 風では、弱い炎（威力は弱い炎のまま）', function () {
  var s = empty(6);
  var f = R.addAlly(s, 'fire', 2, 4);
  var w = R.addAlly(s, 'wind', 2, 5);
  var e = tough(s, R.addEnemy(s, 'fire', 2, 1));
  var st = fire(s, f, 'up').state;                     // (2,3) に小さな炎
  var r = R.act(st, w.id, { to: [2, 5], dir: 'up' });  // (2,4) を越えて (2,3) の小さな炎に風
  eq(names(r.events, 'finisher'), ['燃え広がり']);
  eq(dealt(r, e.id), B.fire.weakDamage);
});
test('森なしの風 → 火（火の渦）は弱い炎。2×2に森があれば、そのマスは強い炎', function () {
  var s = board(['......', '......', '..B...', '..B...', '......', '......']);
  var e = tough(s, R.addEnemy(s, 'fire', 3, 2));
  var a = R.addAlly(s, 'fire', 2, 4);
  var r = fire(s, a, 'up');
  eq(dealt(r, e.id), B.fire.weakDamage);
  var s2 = board(['......', '......', '..BF..', '..B...', '......', '......']);
  var e2 = R.addEnemy(s2, 'fire', 3, 2);               // 森の上
  var a2 = R.addAlly(s2, 'fire', 2, 4);
  var r2 = fire(s2, a2, 'up');
  eq(names(r2.events, 'finisher'), ['火の渦']);
  eq(R.findUnit(r2.state, e2.id), null, '森の上の敵は強い炎で倒れる');
});
test('1人が強い炎と弱い炎の両方に当たっても、1発につき1回（大きい方）', function () {
  var s = board(['......', '..F...', '......', '..X...', '......', '......']);
  var w = R.addAlly(s, 'wind', 2, 5);
  var e = tough(s, R.addEnemy(s, 'fire', 2, 1));
  var r = fire(s, w, 'up');
  eq(r.events.filter(function (ev) { return ev.type === 'damage' && ev.id === e.id; }).length, 1);
});
test('火傷: ターン終了ごとに2、2回で治る。重ねがけは回数が最大に戻るだけ', function () {
  var s = empty(6);
  var e = tough(s, R.addEnemy(s, 'fire', 0, 0));
  R.addAlly(s, 'water', 5, 5);
  R.findUnit(s, e.id).burn = B.fire.burnTurns;
  var r1 = R.endTurn(s);
  eq([hp(r1.state, e.id), R.findUnit(r1.state, e.id).burn], [99 - B.fire.burnDamage, B.fire.burnTurns - 1]);
  var r2 = R.endTurn(r1.state);
  eq([hp(r2.state, e.id), R.findUnit(r2.state, e.id).burn], [99 - 2 * B.fire.burnDamage, 0], '治った');
  var r3 = R.endTurn(r2.state);
  eq(hp(r3.state, e.id), 99 - 2 * B.fire.burnDamage, '治ったあとは減らない');
  // 重ねがけ: 火傷中にもう一度弱い炎に当たると、残りが最大に戻る（ダメージは増えない）
  var s2 = board(['......', '......', '..s...', '......', '......', '......']);
  var e2 = tough(s2, R.addEnemy(s2, 'fire', 2, 1));
  R.findUnit(s2, e2.id).burn = 1;
  var w2 = R.addAlly(s2, 'wind', 2, 4);
  var after = fire(s2, w2, 'up').state;
  eq(R.findUnit(after, e2.id).burn, B.fire.burnTurns);
  var r4 = R.endTurn(after);
  eq(r4.events.filter(function (ev) { return ev.src === 'burnStatus' && ev.id === e2.id; }).map(function (ev) { return ev.amount; }), [B.fire.burnDamage]);
});
test('火傷は水か氷が当たると治る', function () {
  var s = empty(6);
  var e = tough(s, R.addEnemy(s, 'fire', 2, 2));
  R.findUnit(s, e.id).burn = 2;
  var w = R.addAlly(s, 'water', 2, 4);
  eq(R.findUnit(fire(s, w, 'up').state, e.id).burn, 0, '水');
  var s2 = empty(6);
  var e2 = tough(s2, R.addEnemy(s2, 'fire', 2, 3));
  R.findUnit(s2, e2.id).burn = 2;
  var ic = R.addAlly(s2, 'ice', 2, 4);
  eq(R.findUnit(fire(s2, ic, 'up').state, e2.id).burn, 0, '氷');
});
test('炎は、できてからターン終了を2回迎えると燃え尽きて空きに戻る。燃え移った炎はそこから数える', function () {
  var s = board(['......', '.FF...', '......', '......', '......', '......']);
  var a = R.addAlly(s, 'fire', 0, 1);
  var st = fire(s, a, 'right').state;                  // (1,1) の森が炎に
  var r1 = R.endTurn(st);                              // 1回目: (2,1) へ燃え移る。(1,1) は残る
  eq([tile(r1.state, 1, 1), tile(r1.state, 2, 1)], ['fire', 'fire']);
  eq(R.forecast(r1.state).burnOut, [[1, 1]], '次で燃え尽きる炎を予告');
  var r2 = R.endTurn(r1.state);                        // 2回目: (1,1) は燃え尽き、(2,1) は1回目
  eq([tile(r2.state, 1, 1), tile(r2.state, 2, 1)], ['empty', 'fire']);
  ok(r2.events.some(function (ev) { return ev.type === 'burnOut'; }));
  var r3 = R.endTurn(r2.state);
  eq(tile(r3.state, 2, 1), 'empty');
});
test('火の渦が解けてできた炎も、解けた時点から数える', function () {
  var s = board(['......', '..QQ..', '..QQ..', '......', '......', '......']);
  R.addAlly(s, 'fire', 0, 5);
  var r1 = R.endTurn(s);
  eq(tile(r1.state, 2, 1), 'fire', '解けて炎');
  var r2 = R.endTurn(r1.state);
  eq(tile(r2.state, 2, 1), 'fire', '1回目');
  eq(tile(R.endTurn(r2.state).state, 2, 1), 'empty', '2回目で燃え尽き');
});
test('予告: ターン終了の火傷のダメージも含める', function () {
  var s = empty(6, true);
  var a = R.addAlly(s, 'water', 2, 5);
  R.findUnit(s, a.id).burn = 1;
  eq(R.forecast(s).burn.filter(function (b) { return b.id === a.id; })[0].amount, B.fire.burnDamage);
});
test('敵は、自分や仲間を弱い炎で焼く（火傷させる）手を選ばない', function () {
  var s = board(['......', '......', '..s...', '......', '......', '......'], true);
  var e = R.addEnemy(s, 'wind', 2, 4);                 // その場で上へ風: (2,3) → (2,2) の小さな炎から上へ燃え広がり
  var other = R.addEnemy(s, 'fire', 2, 1);              // 燃え広がりの通り道
  var a = R.addAlly(s, 'water', 2, 0);
  var plan = R.planEnemy(s, R.findUnit(s, e.id));
  var pv = R.previewAct(s, e.id, plan.to, plan.dir);
  ok(!pv.damages.some(function (d) { return d.id === other.id; }), JSON.stringify(plan));
  ok(a);
});

console.log('\n■ 【新案】小さなシナジー（balance.js の ideas）');

test('氷の上は滑る: 風で押された者は、氷が途切れるまで滑る', function () {
  var s = board(['......', '......', '......', '..I...', '..I...', '......']);
  s.tiles[0 * 6 + 2] = 'fire';                                  // (2,0) に炎
  var a = R.addAlly(s, 'wind', 2, 5);
  var e = R.addEnemy(s, 'fire', 2, 4);                         // 氷の上
  var r = fire(s, a, 'up');
  eq(pos(r.state, e.id), [2, 2], '1マス押されて氷 (2,3) に乗り、その先の空き (2,2) で止まる');
});
test('氷の上は滑る: 何かにぶつかったら、その手前で止まる', function () {
  var s = board(['..M...', '..I...', '..I...', '..I...', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 5);
  var e = R.addEnemy(s, 'fire', 2, 4);
  var r = fire(s, a, 'up');
  eq(pos(r.state, e.id), [2, 1], '山の手前まで滑る');
});
test('水辺の森はよく育つ: 水に接して植えると、水に接したとなりの空きにも森が広がる', function () {
  var s = board(['......', '......', 'RRRRRR', '......', '......', '......']);
  var a = R.addAlly(s, 'grass', 2, 5);                         // 形 (2,3)(1,2)(2,2)(3,2) → 川の上は植えられず、(2,3) だけ森
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 3), tile(r.state, 1, 3), tile(r.state, 3, 3)], ['forest', 'forest', 'forest'], '川沿いに左右へ広がった');
  eq(tile(r.state, 2, 4), 'empty', '水に接していない所には広がらない');
});
test('土をかぶせて火を消す: 炎・小さな炎に土を盛ると、山になる', function () {
  var s = board(['......', '......', '.X....', '..s...', '......', '......']);
  var a = R.addAlly(s, 'earth', 2, 5);                         // 形 (1,3)(2,3)(1,2)
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 3), tile(r.state, 1, 2)], ['mountain', 'mountain']);
});
test('風で蜃気楼が晴れる', function () {
  var s = board(['......', '......', '......', '..H...', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 5);
  eq(tile(fire(s, a, 'up').state, 2, 3), 'breeze', '晴れたあとに風が吹いている');
});
test('燃え広がりは氷を溶かす（通り道の氷は水たまりに）', function () {
  var s = board(['......', '..I...', '......', '..X...', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 5);
  eq(tile(fire(s, a, 'up').state, 2, 1), 'puddle');
});
test('ideas を false にすると、その案だけ切れる', function () {
  B.ideas.earthSmother = false;
  try {
    var s = board(['......', '......', '......', '..s...', '......', '......']);
    var a = R.addAlly(s, 'earth', 2, 5);
    eq(tile(fire(s, a, 'up').state, 2, 3), 'smallfire');
  } finally { B.ideas.earthSmother = true; }
});

console.log('\n■ 1発の中のダメージは1回');

test('風で炎の起点へ押し込まれても、ダメージは大きい方の1回だけ', function () {
  var s = board(['......', '......', '..X...', '......', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 4);
  var e = tough(s, R.addEnemy(s, 'fire', 2, 3));
  var r = fire(s, a, 'up');
  eq(pos(r.state, e.id), [2, 2], '起点に押し込まれた');
  eq(dealt(r, e.id), B.fire.weakDamage, '直撃1＋燃え広がり ではなく 燃え広がりだけ');
  eq(r.events.filter(function (ev) { return ev.type === 'damage' && ev.id === e.id; }).length, 1);
});

console.log('\n■ 手番');

test('撃ったら、その味方はもう移動も撃つこともできない', function () {
  var s = R.createState();
  var r = R.act(s, 'P1', { to: [1, 4], dir: 'up' });
  ok(r.ok, r.error);
  ok(!R.act(r.state, 'P1', { to: [1, 3], dir: 'up' }).ok);
  eq(R.reachableCells(s, 'P1')['1,3'], 2);
});
test('移動は最大2マス・通れるマスだけ', function () {
  var s = board(['......', '......', '......', '......', '.MMM..', '......']);
  var a = R.addAlly(s, 'fire', 2, 5);
  var reach = R.reachableCells(s, a.id);
  ok(reach['2,4'] === undefined && reach['0,5'] === 2 && reach['4,5'] === 2 && reach['5,5'] === undefined);
  ok(!R.act(s, a.id, { to: [5, 5], dir: 'up' }).ok);
});
test('泥沼にはまっていると移動できない（撃つことはできる）。次の行動で解除', function () {
  var s = board(['......', '......', '......', '......', '..D...', '......']);
  var a = R.addAlly(s, 'fire', 2, 5);
  var r = R.act(s, a.id, { to: [2, 4], dir: 'up' });
  ok(R.findUnit(r.state, a.id).stuck, 'はまった');
  var t = R.endTurn(r.state);
  eq(Object.keys(R.reachableCells(t.state, a.id)), ['2,4'], '今の位置だけ');
  ok(!R.act(t.state, a.id, { to: [2, 3], dir: 'up' }).ok, '動けない');
  var r2 = R.act(t.state, a.id, { dir: 'left' });
  ok(r2.ok, '撃てる');
  ok(!R.findUnit(r2.state, a.id).stuck, '解除');
  var t2 = R.endTurn(r2.state);
  ok(R.reachableCells(t2.state, a.id)['2,3'] === 1, '次のターンは動ける');
});
test('泥沼は通り抜けられない', function () {
  var s = board(['......', '......', '......', '..D...', '......', '......']);
  var a = R.addAlly(s, 'fire', 2, 4);
  var reach = R.reachableCells(s, a.id);
  ok(reach['2,3'] === 1 && reach['2,2'] === undefined);
});
test('待機（撃たない）でも手番は終わる。3人とも終えたら allAlliesActed', function () {
  var s = R.createState({ enemyActs: false });
  var r = R.act(s, 'P1', { dir: 'left', shoot: false });
  ok(r.ok && R.findUnit(r.state, 'P1').acted);
  eq(R.findUnit(r.state, 'P1').facing, 'left');
  r = R.act(r.state, 'P2', { shoot: false });
  ok(!R.allAlliesActed(r.state));
  r = R.act(r.state, 'P3', { shoot: false });
  ok(R.allAlliesActed(r.state));
  var t = R.endTurn(r.state);
  ok(!R.allAlliesActed(t.state));
  eq(t.state.turn, 2);
});
test('元の state は書き換えない', function () {
  var s = R.createState();
  var before = JSON.stringify(s);
  R.act(s, 'P1', { to: [1, 4], dir: 'up' });
  R.endTurn(s);
  R.forecast(s);
  R.guideMap(s, 'P1');
  eq(JSON.stringify(s), before);
});

console.log('\n■ ターン終了');

test('燃え移りは1ターンに1マス分', function () {
  var s = board(['......', '.XFF..', '......', '......', '......', '......']);
  var r1 = R.endTurn(s);
  eq([tile(r1.state, 2, 1), tile(r1.state, 3, 1)], ['fire', 'forest']);
  eq(tile(R.endTurn(r1.state).state, 3, 1), 'fire');
});
test('炎の上で2ダメージ、小さな炎は消える（ダメージなし）', function () {
  var s = board(['......', '.X....', '......', '...s..', '......', '......']);
  var a = R.addAlly(s, 'fire', 1, 1);
  var e = R.addEnemy(s, 'fire', 3, 3);
  var r = R.endTurn(s);
  eq(hp(r.state, a.id), B.ally.hp - B.fireTileDamage);
  eq(hp(r.state, e.id), B.enemy.hp);
  eq(tile(r.state, 3, 3), 'empty');
});
test('ターン終了は途中の状態（steps）を順番に返す', function () {
  var s = board(['......', '.XF...', '......', '...s..', '......', '......'], true);
  R.addAlly(s, 'fire', 0, 5);
  R.addEnemy(s, 'fire', 5, 0);
  var r = R.endTurn(s);
  ok(r.steps.length >= 4, 'steps=' + r.steps.length);
  eq(R.getTile(r.steps[1].state, 2, 1), 'fire', '燃え移りのあと');
});

console.log('\n■ 敵の行動（移動と予告 → 味方 → 発動 → ターン終了）');

// 敵に予告を持たせる（位置と向きは今のまま）
function intend(s, e, dir) { var u = R.findUnit(s, e.id); u.facing = dir; u.intent = true; return u; }
function casts(events, id) { return events.filter(function (ev) { return ev.type === 'cast' && ev.id === id; }); }

test('戦闘の最初に、敵の予告がすでに出ている', function () {
  var s = empty(6, true);
  var e = R.addEnemy(s, 'fire', 2, 0);
  R.addAlly(s, 'water', 2, 5);
  var st = R.startBattle(s).state;
  ok(R.findUnit(st, e.id).intent, '予告中');
  eq(R.forecast(st).enemies.map(function (p) { return p.id; }), [e.id]);
});
test('予告した敵は、味方の手番のあいだ自分では動かない', function () {
  var s = empty(6, true);
  var e = R.addEnemy(s, 'fire', 2, 0);
  var a = R.addAlly(s, 'water', 0, 5);
  var b = R.addAlly(s, 'fire', 5, 5);
  var st = R.startBattle(s).state;
  var before = [pos(st, e.id), R.findUnit(st, e.id).facing];
  st = R.act(st, a.id, { shoot: false }).state;
  st = R.act(st, b.id, { shoot: false }).state;
  eq([pos(st, e.id), R.findUnit(st, e.id).facing], before);
});
test('味方に当たる位置があれば、そこへ動いて予告し、発動で当たる', function () {
  var s = empty(6, true);
  var e = R.addEnemy(s, 'fire', 2, 0);
  var a = R.addAlly(s, 'water', 2, 3);
  var st = R.startBattle(s).state;
  eq([pos(st, e.id), R.findUnit(st, e.id).facing], [[2, 2], 'down']);
  var r = R.endTurn(st);
  ok(r.events.some(function (ev) { return ev.type === 'death' && ev.id === a.id; }), '味方に3ダメージで倒れる');
});
test('予告を見て逃げれば、発動は空振りする', function () {
  var s = empty(6, true);
  var e = R.addEnemy(s, 'fire', 2, 0);
  var a = R.addAlly(s, 'water', 2, 3);
  var st = R.startBattle(s).state;
  st = R.act(st, a.id, { to: [0, 3], shoot: false }).state;
  var r = R.endTurn(st);
  ok(R.findUnit(r.state, a.id), '味方は無事');
  eq(casts(r.events, e.id).length, 1, '予告どおりに撃つ');
});
test('予告のあとで味方が森を足すと、発動の結果が変わる（小さな炎 → 森が燃える）', function () {
  var s = empty(6, true);
  var e = R.addEnemy(s, 'fire', 2, 1);
  intend(s, e, 'down');                                // (2,2) に火
  var g = R.addAlly(s, 'grass', 2, 5);
  eq(R.forecast(s).enemies[0].tileChanges.map(function (c) { return c.to; }), ['smallfire']);
  var pv = R.previewAct(s, g.id, [2, 5], 'up');        // 草: (2,3)(1,2)(2,2)(3,2)
  eq(R.forecast(pv.state).enemies[0].tileChanges.map(function (c) { return [c.from, c.to]; }), [['forest', 'fire']], '撃つ前の予測で、敵の予告の結果も計算し直せる');
  var st = R.act(s, g.id, { dir: 'up' }).state;
  var r = R.endTurn(st);
  eq(tile(r.state, 2, 2), 'fire');
});
test('風で押された敵は、押された先から同じ向きで撃つ', function () {
  var s = empty(6, true);
  var e = R.addEnemy(s, 'fire', 2, 2);
  intend(s, e, 'down');
  var w = R.addAlly(s, 'wind', 0, 2);
  var st = R.act(s, w.id, { dir: 'right' }).state;     // (1,2)(2,2) に風。敵は (3,2) へ
  eq(pos(st, e.id), [3, 2]);
  eq(R.forecast(st).enemies[0].cells, [[3, 3]], '予告の形も一緒に動く');
  var r = R.endTurn(st);
  eq([tile(r.state, 3, 3), tile(r.state, 2, 3)], ['empty', 'empty'], '小さな炎はターン終了で消える');
  eq(casts(r.events, e.id)[0].from, [3, 2]);
});
test('倒れた敵の予告は発動しない', function () {
  var s = empty(6, true);
  var e = R.addEnemy(s, 'fire', 2, 2);
  intend(s, e, 'down');
  R.findUnit(s, e.id).hp = 1;
  var f = R.addAlly(s, 'fire', 2, 4);
  var st = R.act(s, f.id, { to: [2, 3], dir: 'up' }).state;  // 直撃で倒す
  ok(!R.findUnit(st, e.id) || st.result === 'win');
  var s2 = empty(6, true);
  var e1 = R.addEnemy(s2, 'fire', 0, 0);
  var e2 = R.addEnemy(s2, 'fire', 4, 0);
  intend(s2, e1, 'down'); intend(s2, e2, 'down');
  R.findUnit(s2, e1.id).hp = 1;
  var f2 = R.addAlly(s2, 'fire', 0, 2);
  var st2 = R.act(s2, f2.id, { to: [0, 1], dir: 'up' }).state;
  var r = R.endTurn(st2);
  eq(casts(r.events, e1.id).length, 0, '倒れた敵は撃たない');
  eq(casts(r.events, e2.id).length, 1, 'ほかの敵は撃つ');
});
test('発動はターン終了処理より先（味方の風に敵の火が当たると火の渦になる）', function () {
  var s = empty(6, true);
  var e = R.addEnemy(s, 'fire', 2, 0);
  intend(s, e, 'down');                                // (2,1) に火
  var w = R.addAlly(s, 'wind', 2, 3);
  var st = R.act(s, w.id, { dir: 'up' }).state;        // (2,2)(2,1) に風
  eq(R.forecast(st).enemies[0].finishers.map(function (f) { return f.name; }), ['火の渦']);
  var r = R.endTurn(st);
  var names2 = r.events.map(function (ev) { return ev.type === 'finisher' ? ev.name : ev.type; });
  ok(names2.indexOf('火の渦') >= 0 && names2.indexOf('火の渦') < names2.indexOf('turnEnd'), names2.join(','));
});
test('予告を決める時点で、自分や他の敵を巻き込む組み合わせは選ばれない', function () {
  var s = empty(6, true);
  var e = R.addEnemy(s, 'grass', 2, 0);                // 下向き: (2,2)(1,3)(2,3)(3,3)
  var other = R.addEnemy(s, 'fire', 3, 3);
  var a = R.addAlly(s, 'water', 1, 3);
  var plan = R.planEnemy(s, R.findUnit(s, e.id));
  ok(!(plan.to[0] === 2 && plan.to[1] === 0 && plan.dir === 'down'), 'その場から下は仲間に当たる');
  var pv = R.previewAct(s, e.id, plan.to, plan.dir);
  var hit = pv.damages.map(function (d) { return d.id; });
  ok(hit.indexOf(a.id) >= 0 && hit.indexOf(other.id) < 0, JSON.stringify(plan));
});
test('先に予告した仲間の魔法の中へ、自分から入る手は選ばない', function () {
  var s = empty(6, true);
  var a = R.addEnemy(s, 'fire', 2, 1);
  intend(s, a, 'down');                                // 敵Aの火は (2,2)
  var b = R.addEnemy(s, 'fire', 4, 2);                 // 味方に当てられるのは (2,2) から左だけ
  R.addAlly(s, 'water', 1, 2);
  var plan = R.planEnemy(s, R.findUnit(s, b.id));
  ok(!(plan.to[0] === 2 && plan.to[1] === 2), JSON.stringify(plan));
});
test('自分の点けた火が足元に燃え移る手は選ばない', function () {
  var s = board(['......', '..F...', '..F...', '......', '......', '......'], true);
  var e = R.addEnemy(s, 'fire', 2, 1);                 // 森の上
  R.addAlly(s, 'water', 2, 3);
  var plan = R.planEnemy(s, R.findUnit(s, e.id));
  var pv = R.previewAct(s, e.id, plan.to, plan.dir);
  var later = R.endTurn(pv.state);
  ok(!later.events.some(function (ev) { return ev.type === 'damage' && ev.id === e.id; }), JSON.stringify(plan));
});
test('狙い「人数」: ダメージを受ける味方が多い組み合わせ', function () {
  var s = empty(6, true);
  var e = R.addEnemy(s, 'grass', 2, 0);
  R.addAlly(s, 'water', 1, 3);
  R.addAlly(s, 'fire', 3, 3);
  R.addAlly(s, 'wind', 5, 5);
  var plan = R.planEnemy(s, R.findUnit(s, e.id));
  eq([plan.to, plan.dir, plan.hits], [[2, 0], 'down', 2]);
});
test('狙い「近い人」: 一番近い味方に当たる組み合わせ（ほかに多く当たる手があっても）', function () {
  var s = empty(6, true);
  var e = R.addEnemy(s, 'grass', 2, 0);
  R.findUnit(s, e.id).aim = 'near';
  R.addAlly(s, 'water', 1, 3);
  R.addAlly(s, 'fire', 3, 3);
  var n = R.addAlly(s, 'wind', 5, 0);                  // 道のり3で一番近い
  var plan = R.planEnemy(s, R.findUnit(s, e.id));
  eq([plan.target, plan.to, plan.dir], [n.id, [2, 0], 'right']);
});
test('狙い「自然」: 変わる自然のマスが多い組み合わせ', function () {
  var s = board(['......', '....F.', '......', '......', '......', '......'], true);
  var e = R.addEnemy(s, 'fire', 2, 0);
  R.findUnit(s, e.id).aim = 'nature';
  R.addAlly(s, 'water', 2, 5);
  var plan = R.planEnemy(s, R.findUnit(s, e.id));
  eq([plan.kind, plan.to, plan.dir], ['nature', [4, 0], 'down']);
});
test('当たる組み合わせがなければ、一番近い味方へ近づいてその方を向く', function () {
  var s = empty(6, true);
  var e = R.addEnemy(s, 'fire', 0, 0);
  R.addAlly(s, 'water', 5, 5);
  var st = R.startBattle(s).state;
  eq(R.findUnit(st, e.id).facing, 'down', '縦の差が大きい');
  var d = Math.abs(5 - pos(st, e.id)[0]) + Math.abs(5 - pos(st, e.id)[1]);
  eq(d, 8, '2マス近づいた');
});
test('道がなければ、その場で一番近い味方の方を向いて予告する', function () {
  var s = board(['......', '......', '......', 'MMMMMM', '......', '......'], true);
  var e = R.addEnemy(s, 'wind', 2, 0);
  R.addAlly(s, 'fire', 2, 5);
  var r = R.startBattle(s);
  eq([pos(r.state, e.id), R.findUnit(r.state, e.id).facing], [[2, 0], 'down']);
  ok(r.events.some(function (ev) { return /道がない/.test(ev.text); }));
  ok(R.findUnit(r.state, e.id).intent);
});
test('「危ない所も避ける」敵は、炎・泥沼を通らず移動先にもしない／「通れない所だけ」の敵は通る', function () {
  var s = board(['......', 'XXDXXX', '......', '......', '......', '......'], true);
  var e = R.addEnemy(s, 'fire', 2, 0);
  R.addAlly(s, 'water', 2, 5);
  var reachWall = R.reachableCells(s, e.id);
  ok(reachWall['1,1'] !== undefined && reachWall['2,1'] !== undefined, '通れない所だけ: 炎・泥沼に入れる');
  R.findUnit(s, e.id).avoid = 'danger';
  var reachDanger = R.reachableCells(s, e.id);
  eq(Object.keys(reachDanger).filter(function (k) { return k.split(',')[1] !== '0'; }), [], '危ない所も: 上の段から出られない');
});
test('「川を渡る」敵は川の上を進める', function () {
  var s = board(['......', 'RRRRRR', '......', '......', '......', '......'], true);
  var e = R.addEnemy(s, 'fire', 2, 0);
  R.addAlly(s, 'water', 2, 5);
  ok(R.reachableCells(s, e.id)['2,2'] === undefined, 'なし: 渡れない');
  R.findUnit(s, e.id).cross = 'river';
  eq(R.reachableCells(s, e.id)['2,2'], 2, '川を渡る: 川を越えて2マス先へ');
});
test('泥沼にはまった敵は移動できないが、予告して発動する', function () {
  var s = empty(6, true);
  var e = R.addEnemy(s, 'fire', 0, 0);
  R.findUnit(s, e.id).stuck = true;
  R.addAlly(s, 'water', 5, 5);
  var st = R.startBattle(s).state;
  R.findUnit(st, e.id).stuck = true;                   // startBattle はそろえ直すので、もう一度はめる
  var r = R.endTurn(st);                               // 発動 → 次のターンの予告（はまっているので動けない）
  ok(casts(r.events, e.id).length === 1, '発動した');
  ok(r.events.some(function (ev) { return ev.type === 'mudSkip' && ev.id === e.id; }));
});
test('敵だけの魔法は、味方の選択肢に出ない（敵は使える）', function () {
  var s = R.createState();
  s.enemyOnlyMagics = ['thunder'];
  ok(R.allyMagics(s).indexOf('thunder') < 0);
  var a = R.alliesOf(s)[0], e = R.enemiesOf(s)[0];
  ok(!R.editSetMagic(s, a.id, 'thunder').ok, '味方には付けられない');
  ok(R.editSetMagic(s, e.id, 'thunder').ok, '敵には付けられる');
  eq(B.enemyOnlyMagics, [], 'balance.js の一覧は最初は空');
});
test('同じ盤面からは、何度やっても同じ予告になる', function () {
  var a = R.startBattle(R.loadPreset('fireEnemy')).state;
  var b = R.startBattle(R.loadPreset('fireEnemy')).state;
  eq(JSON.stringify(a.units), JSON.stringify(b.units));
  var a2 = R.endTurn(a).state, b2 = R.endTurn(b).state;
  eq(JSON.stringify(a2), JSON.stringify(b2));
});
test('「何もしない」設定では移動も予告もしない', function () {
  var s = empty(6, false);
  var e = R.addEnemy(s, 'fire', 2, 0);
  R.addAlly(s, 'water', 2, 5);
  var st = R.startBattle(s).state;
  eq([pos(st, e.id), R.findUnit(st, e.id).intent], [[2, 0], false]);
  eq(pos(R.endTurn(st).state, e.id), [2, 0]);
});

console.log('\n■ 予測・導き・予告');

test('予測: 移動先と向きから、変化とダメージが分かる', function () {
  var s = board(['......', '......', '..s...', '......', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 5);
  var e = R.addEnemy(s, 'fire', 2, 1);
  var p = R.previewAct(s, a.id, [2, 4], 'up');
  eq(p.finishers[0].name, '燃え広がり');
  eq(p.damages.filter(function (d) { return d.id === e.id; })[0].amount, B.fire.weakDamage);
});
test('導き: 空きマスに何かを作るだけの立ち位置には印を付けない', function () {
  var s = empty(6);
  var a = R.addAlly(s, 'fire', 2, 5);
  eq(R.guideMap(s, a.id), {});
  var s2 = board(['......', '......', '......', '..F...', '......', '......']);
  var a2 = R.addAlly(s2, 'fire', 2, 5);
  eq(R.guideMap(s2, a2.id)['2,4'], 'change', '(2,4) から上へ撃つと森が燃える');
});
test('導き: 炎の後ろに回れるマスは「決め手」', function () {
  var s = board(['......', '......', '..X...', '......', '......', '......']);
  var a = R.addAlly(s, 'wind', 0, 4);
  var g = R.guideMap(s, a.id);
  eq(g['2,4'], 'finisher');
});
test('予告: 発動したら何が起きるか（敵の順に続けて計算）と、そのあとの燃え移り', function () {
  var s = board(['......', '......', '...F..', '...F..', '......', '......'], true);
  var e1 = R.addEnemy(s, 'fire', 2, 2);
  var e2 = R.addEnemy(s, 'wind', 3, 0);
  intend(s, e1, 'right');                              // (3,2) の森に火
  intend(s, e2, 'down');                               // 風: (3,1)(3,2) … 前の敵が点けた炎に当たって燃え広がり
  R.addAlly(s, 'water', 0, 5);
  var f = R.forecast(s);
  eq(f.enemies.map(function (p) { return p.id; }), [e1.id, e2.id]);
  eq(f.enemies[0].tileChanges.map(function (c) { return [c.x, c.y, c.to]; }), [[3, 2, 'fire']]);
  eq(f.enemies[1].finishers.map(function (x) { return x.name; }), ['燃え広がり'], '前の敵の結果が次の敵の盤面になる');
});

console.log('\n■ エディット・保存・初期シナリオ');

test('盤面サイズを変えると味方を下の段、敵を上の段に並べ直す', function () {
  var s = R.createState();
  var r = R.editResize(s, 8);
  eq(r.state.size, 8);
  eq(R.alliesOf(r.state).map(function (a) { return a.y; }), [7, 7, 7]);
  eq(R.enemiesOf(r.state)[0].y, 0);
  eq(R.editResize(s, 99).state.size, B.maxBoardSize);
});
test('魔法と向きを変えられる（敵も）', function () {
  var s = R.createState();
  var e = R.enemiesOf(s)[0];
  var r = R.editSetMagic(s, e.id, 'water');
  r = R.editSetFacing(r.state, e.id, 'left');
  eq([R.findUnit(r.state, e.id).magic, R.findUnit(r.state, e.id).facing], ['water', 'left']);
});
test('敵の個性はエディットで変えられる（決まった値だけ）', function () {
  var s = R.createState();
  var e = R.enemiesOf(s)[0], a = R.alliesOf(s)[0];
  var r = R.editSetPersona(s, e.id, 'aim', 'nature');
  r = R.editSetPersona(r.state, e.id, 'avoid', 'danger');
  r = R.editSetPersona(r.state, e.id, 'cross', 'river');
  var u = R.findUnit(r.state, e.id);
  eq([u.aim, u.avoid, u.cross], ['nature', 'danger', 'river']);
  ok(!R.editSetPersona(s, e.id, 'aim', 'smart').ok, '知らない値');
  ok(!R.editSetPersona(s, a.id, 'aim', 'near').ok, '味方には個性がない');
});
test('JSON の書き出しと読み込みで同じ配置に戻る', function () {
  var s = R.loadPreset('fireEnemy');
  var json = R.exportLayout(s);
  var r = R.importLayout(json);
  ok(r.ok, r.error);
  eq(r.state.tiles, s.tiles);
  eq(r.state.units.map(function (u) { return [u.side, u.magic, u.x, u.y, u.facing]; }), s.units.map(function (u) { return [u.side, u.magic, u.x, u.y, u.facing]; }));
  var t = R.loadPreset('trap');
  var r2 = R.importLayout(R.exportLayout(t));
  eq(R.enemiesOf(r2.state).map(function (e) { return [e.aim, e.avoid, e.cross]; }), [['count', 'wall', 'none'], ['count', 'danger', 'none']], '敵の個性も保存される');
  eq(R.importLayout(R.exportLayout(R.loadPreset('enemyThunder'))).state.enemyOnlyMagics, ['thunder'], '敵だけの魔法も保存される');
  ok(!R.importLayout('{').ok);
  ok(!R.importLayout({ size: 6, tiles: [] }).ok);
});
test('初期シナリオ（お題3つ・敵の3つを含む18）が読み込める', function () {
  eq(R.PRESETS.length, 18);
  eq(['mDefense', 'mEscort', 'mRetrieve'].map(function (id) { return R.loadPreset(id).mission.type; }), ['defense', 'escort', 'retrieve']);
  R.PRESETS.forEach(function (p) {
    var s = R.loadPreset(p.id);
    ok(s && s.size >= 6, p.id);
    eq(R.alliesOf(s).length, 3, p.id);
  });
  eq(R.alliesOf(R.loadPreset('spread')).map(function (a) { return a.magic; }), ['grass', 'fire', 'wind']);
  eq(R.enemiesOf(R.loadPreset('fireEnemy')).length, 2);
});

// ---------------------------------------------------------------
// お題（IMPROVE_mission）
// ---------------------------------------------------------------
function mission(rows, type, enemyActs) {
  var s = board(rows, enemyActs);
  s = R.editSetMission(s, type).state;
  return s;
}
function wagonAt(s) { var w = R.objectsOf(s, 'wagon')[0]; return w ? [w.x, w.y] : null; }

console.log('\n■ お題: 防衛');

test('村は敵の直撃で壊れて、負けになる', function () {
  var s = mission(['.....', '.....', '.....', '.....', '.....'], 'defense', true);
  R.addAlly(s, 'fire', 0, 4, 'up');
  var v = R.addObject(s, 'village', 2, 4);
  var e = R.addEnemy(s, 'fire', 2, 3, 'down');
  e.intent = true;
  var r = R.endTurn(s);
  ok(!R.findUnit(r.state, v.id), '村が壊れる');
  eq(r.state.result, 'lose');
  ok(/村/.test(r.state.resultText), r.state.resultText);
});
test('村は味方の決め手（燃え広がり）でも壊れる', function () {
  var s = mission(['.....', '..F..', '..F..', '..X..', '.....'], 'defense');
  var w = R.addAlly(s, 'wind', 2, 4, 'up');
  R.addAlly(s, 'grass', 0, 4, 'up');
  var v = R.addObject(s, 'village', 2, 1);
  var r = fire(s, w, 'up');
  ok(names(r.events, 'finisher').indexOf('燃え広がり') >= 0, '燃え広がりが起きる');
  ok(!R.findUnit(r.state, v.id), '森の上の村は壊れる');
  eq(r.state.result, 'lose');
});
test('村はターン終了で炎の上にいると2受けて壊れる', function () {
  var s = mission(['.....', '.....', '..F..', '..X..', '.....'], 'defense');
  R.addAlly(s, 'fire', 0, 4, 'up');
  var v = R.addObject(s, 'village', 2, 2);
  var r = R.endTurn(s);
  ok(r.events.some(function (e) { return e.type === 'damage' && e.id === v.id && e.src === 'burn'; }), '炎の上のダメージ');
  ok(!R.findUnit(r.state, v.id));
  eq(r.state.result, 'lose');
});
test('村が残ったまま決まったターンのターン終了を迎えると勝ち', function () {
  var s = mission(['.....', '.....', '.....', '.....', '.....'], 'defense');
  R.addAlly(s, 'fire', 0, 4, 'up');
  R.addEnemy(s, 'fire', 4, 0, 'down');
  R.addObject(s, 'village', 2, 4);
  for (var i = 1; i < B.mission.defense.turns; i++) { s = R.endTurn(s).state; eq(s.result, null, 'ターン' + i + 'ではまだ'); }
  eq(s.turn, B.mission.defense.turns);
  s = R.endTurn(s).state;
  eq(s.result, 'win');
});
test('防衛は敵の全滅でも勝ち', function () {
  var s = mission(['.....', '.....', '.....', '.....', '.....'], 'defense');
  var a = R.addAlly(s, 'fire', 2, 4, 'up');
  var e = R.addEnemy(s, 'fire', 2, 3, 'down');
  R.findUnit(s, e.id).hp = 1;
  R.addObject(s, 'village', 0, 4);
  eq(fire(s, a, 'up').state.result, 'win');
});
test('村は風で押されない（動かない）', function () {
  var s = mission(['.....', '.....', '.....', '.....', '.....'], 'defense');
  var w = R.addAlly(s, 'wind', 2, 4, 'up');
  var v = tough(s, R.addObject(s, 'village', 2, 3));
  var r = fire(s, w, 'up');
  eq(pos(r.state, v.id), [2, 3]);
  ok(r.events.some(function (e) { return e.type === 'push' && e.id === v.id && !e.ok; }), '押されなかったと出る');
});

console.log('\n■ お題: 護衛');

function escort(rows, wagon, goal) {
  var s = mission(rows, 'escort');
  R.addObject(s, 'wagon', wagon[0], wagon[1]);
  s.mission.goal = goal;
  return s;
}
test('馬車はターン終了でゴールへの一番短い道を1マス進む', function () {
  var s = escort(['.....', '.....', '.....', '.....', '.....'], [0, 2], [[4, 2]]);
  R.addAlly(s, 'fire', 0, 4, 'up');
  eq(R.wagonRoute(s).steps, 4);
  var r = R.endTurn(s);
  eq(wagonAt(r.state), [1, 2]);
});
test('馬車の道は危ない所とユニットのいるマスを通らない', function () {
  var s = escort(['.....', '.....', '.X...', '.....', '.....'], [0, 2], [[4, 2]]);
  R.addAlly(s, 'fire', 0, 1, 'up');
  var r = R.wagonRoute(s);
  eq(r.next, [0, 3], '炎の (1,2) と味方の (0,1) を避けて下へ');
  ok(!r.path.some(function (c) { return c[0] === 1 && c[1] === 2; }));
});
test('馬車は道がなければその場で待つ', function () {
  var s = escort(['.....', 'M....', '.M...', 'M....', '.....'], [0, 2], [[4, 2]]);
  R.addAlly(s, 'fire', 4, 4, 'up');
  eq(R.wagonRoute(s).next, null);
  var r = R.endTurn(s);
  eq(wagonAt(r.state), [0, 2]);
  ok(r.events.some(function (e) { return e.type === 'wagonWait'; }));
});
test('土で山を盛ると馬車の道が変わる', function () {
  var s = escort(['.....', '.....', '.....', '.....', '.....'], [0, 2], [[4, 2]]);
  var e = R.addAlly(s, 'earth', 2, 4, 'up');
  eq(R.wagonRoute(s).next, [1, 2]);
  var r = fire(s, e, 'up');
  eq(tile(r.state, 1, 2), 'mountain');
  eq(R.wagonRoute(r.state).next, [0, 3], '山をよけて回り道');
});
test('馬車がゴールに入ったら勝ち', function () {
  var s = escort(['.....', '.....', '.....', '.....', '.....'], [3, 2], [[4, 2]]);
  R.addAlly(s, 'fire', 0, 4, 'up');
  var r = R.endTurn(s);
  eq(r.state.result, 'win');
});
test('馬車が壊れたら負け（味方の魔法でも）', function () {
  var s = escort(['.....', '.....', '.....', '.....', '.....'], [2, 2], [[4, 0]]);
  var a = R.addAlly(s, 'fire', 2, 3, 'up');
  R.addAlly(s, 'wind', 0, 4, 'up');
  R.objectsOf(s, 'wagon')[0].hp = 1;
  var r = fire(s, a, 'up');
  eq(r.state.result, 'lose');
  ok(/馬車/.test(r.state.resultText));
});
test('馬車は風で押される（直撃1も入る）。押されてゴールに入っても勝ち', function () {
  var s = escort(['.....', '.....', '.....', '.....', '.....'], [2, 2], [[2, 0]]);
  var w = R.addAlly(s, 'wind', 2, 4, 'up');
  var r = fire(s, w, 'up');
  eq(wagonAt(r.state), [2, 1]);
  eq(R.objectsOf(r.state, 'wagon')[0].hp, B.mission.wagon.hp - 1);
  var s2 = escort(['.....', '.....', '.....', '.....', '.....'], [2, 2], [[2, 1]]);
  var w2 = R.addAlly(s2, 'wind', 2, 4, 'up');
  eq(fire(s2, w2, 'up').state.result, 'win');
});

console.log('\n■ お題: 奪取');

function retrieve(treasure, exit) {
  var s = mission(['.....', '.....', '.....', '.....', '.....'], 'retrieve');
  s.mission.treasure = treasure;
  s.mission.exit = exit;
  return s;
}
test('宝のマスで移動を終えると宝を持つ', function () {
  var s = retrieve([2, 2], [[0, 4]]);
  var a = R.addAlly(s, 'grass', 2, 4, 'up');
  var r = R.act(s, a.id, { to: [2, 2], shoot: false });
  ok(r.ok, r.error);
  eq(r.state.mission.carrier, a.id);
  eq(r.state.mission.treasure, null);
});
test('宝を持っている間（宝のマスへ動くその手番も）は撃てない', function () {
  var s = retrieve([2, 2], [[0, 4]]);
  var a = R.addAlly(s, 'grass', 2, 4, 'up');
  ok(!R.act(s, a.id, { to: [2, 2], dir: 'up' }).ok, '拾う手番も撃てない');
  var s2 = R.act(s, a.id, { to: [2, 2], shoot: false }).state;
  s2 = R.endTurn(s2).state;
  ok(!R.act(s2, a.id, { dir: 'up' }).ok, '持ったあとも撃てない');
  ok(R.act(s2, a.id, { to: [2, 3], shoot: false }).ok, '移動と待機はできる');
});
test('宝を持つ味方が倒れたら宝はそのマスに落ちて、ほかの味方が拾える', function () {
  var s = retrieve([2, 2], [[0, 4]]);
  var c = R.addAlly(s, 'grass', 2, 2, 'up');
  var f = R.addAlly(s, 'fire', 2, 3, 'up');
  var g = R.addAlly(s, 'wind', 3, 3, 'up');
  s.mission.treasure = null; s.mission.carrier = c.id;
  R.findUnit(s, c.id).hp = 1;
  var r = fire(s, f, 'up');
  ok(!R.findUnit(r.state, c.id), '運び手が倒れる');
  eq(r.state.mission.treasure, [2, 2]);
  eq(r.state.mission.carrier, null);
  var r2 = R.act(r.state, g.id, { to: [2, 2], shoot: false });
  eq(r2.state.mission.carrier, g.id, '拾える');
});
test('宝を持ったまま帰り口で移動を終えたら勝ち', function () {
  var s = retrieve([2, 2], [[2, 4]]);
  var a = R.addAlly(s, 'grass', 2, 2, 'up');
  R.addAlly(s, 'fire', 0, 0, 'up');
  s = R.act(s, a.id, { shoot: false }).state;   // その場で終える → 持つ
  eq(s.mission.carrier, a.id);
  s = R.endTurn(s).state;
  var r = R.act(s, a.id, { to: [2, 4], shoot: false });
  eq(r.state.result, 'win');
});

console.log('\n■ お題: 敵の「的」');

test('的の敵は、味方より的（馬車）に当たる手を選ぶ。人数の敵は馬車を狙わない', function () {
  var s = escort(['.....', '.....', '.....', '.....', '.....'], [2, 2], [[0, 4]]);
  var a = R.addAlly(s, 'grass', 4, 1, 'up');
  var e = R.addEnemy(s, 'fire', 3, 0, 'down');
  var cellOf = function (p) { var d = R.DIRS[p.dir]; return [p.to[0] + d.dx, p.to[1] + d.dy]; };
  R.findUnit(s, e.id).aim = 'target';
  eq(cellOf(R.planEnemy(s, R.findUnit(s, e.id))), [2, 2], '的は馬車');
  R.findUnit(s, e.id).aim = 'count';
  eq(cellOf(R.planEnemy(s, R.findUnit(s, e.id))), [a.x, a.y], '人数は味方');
});
test('当たる手がないとき、的の敵は一番近い的へ向かう', function () {
  var s = escort(['.......', '.......', '.......', '.......', '.......', '.......', '.......'], [0, 6], [[6, 0]]);
  R.addAlly(s, 'grass', 6, 6, 'up');
  var e = R.addEnemy(s, 'fire', 3, 0, 'down');
  R.findUnit(s, e.id).aim = 'target';
  var p = R.planEnemy(s, R.findUnit(s, e.id));
  var w = R.objectsOf(s, 'wagon')[0];
  eq(p.target, w.id);
  ok(Math.abs(p.to[0] - 0) + Math.abs(p.to[1] - 6) < 3 + 6, '馬車に近づく');
});
test('宝がまだ拾われていない奪取では、的はなく「近い人」と同じ', function () {
  var s = retrieve([2, 0], [[0, 4]]);
  R.addAlly(s, 'grass', 2, 4, 'up');
  eq(R.missionTargets(s).length, 0);
});

console.log('\n■ お題: エディット・保存');

test('お題の置きもの・印・宝は JSON の保存と読み込みで残る', function () {
  ['mDefense', 'mEscort', 'mRetrieve'].forEach(function (id) {
    var s = R.loadPreset(id);
    var r = R.importLayout(R.exportLayout(s));
    ok(r.ok, r.error);
    eq(r.state.mission.type, s.mission.type, id);
    eq(r.state.mission.goal, s.mission.goal, id);
    eq(r.state.mission.exit, s.mission.exit, id);
    eq(r.state.mission.treasure, s.mission.treasure, id);
    eq(R.objectsOf(r.state).map(function (o) { return [o.kind, o.x, o.y]; }), R.objectsOf(s).map(function (o) { return [o.kind, o.x, o.y]; }), id);
  });
  ok(!R.importLayout({ size: 5, tiles: new Array(25).fill('empty'), mission: { type: 'party' } }).ok, '知らないお題');
});
test('エディットで置きもの・印・宝を置ける（馬車は1台まで、印はもう一度で外れる）', function () {
  var s = R.createState({ size: 5, blank: true });
  s = R.editSetMission(s, 'escort').state;
  s = R.editPlaceObject(s, 'wagon', 0, 0).state;
  ok(!R.editPlaceObject(s, 'wagon', 1, 0).ok, '馬車は1台');
  s = R.editPlaceObject(s, 'village', 1, 1).state;
  s = R.editToggleCell(s, 'goal', 4, 4).state;
  eq(s.mission.goal, [[4, 4]]);
  eq(R.editToggleCell(s, 'goal', 4, 4).state.mission.goal, []);
  s = R.editPlaceTreasure(s, 2, 2).state;
  eq(s.mission.treasure, [2, 2]);
  ok(!R.editSetMagic(s, R.objectsOf(s, 'village')[0].id, 'fire').ok, '置きものは魔法を持たない');
});

// ---------------------------------------------------------------
console.log('\n■ 育つ（IMPROVE_grow）: 土 — 丘と山');
// grow.enabled を入れて試す（終わったら元に戻す）
function withGrow(fn, set) {
  var was = JSON.parse(JSON.stringify(B.grow));
  B.grow.enabled = true;
  Object.keys(set || {}).forEach(function (k) { B.grow[k] = set[k]; });
  try { fn(); } finally { Object.keys(was).forEach(function (k) { B.grow[k] = was[k]; }); }
}
CH.h = 'hill';

test('育つ: 切っているときは今までどおり、空きに土で山', function () {
  var s = empty(6);
  var a = R.addAlly(s, 'earth', 2, 5);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 1, 3), tile(r.state, 2, 3), tile(r.state, 1, 2)], ['mountain', 'mountain', 'mountain']);
});
test('育つ: 空きに土で丘、丘にもう一度土で山に育つ', function () { withGrow(function () {
  var s = empty(6);
  var a = R.addAlly(s, 'earth', 2, 5);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 1, 3), tile(r.state, 2, 3), tile(r.state, 1, 2)], ['hill', 'hill', 'hill']);
  var s2 = r.state; R.findUnit(s2, a.id).acted = false;
  var r2 = fire(s2, a, 'up');
  eq([tile(r2.state, 1, 3), tile(r2.state, 2, 3), tile(r2.state, 1, 2)], ['mountain', 'mountain', 'mountain']);
  ok(r2.events.some(function (e) { return /丘が山に育った/.test(e.text || ''); }), 'ログに「育った」');
}); });
test('育つ: ユニットのいる丘は育たない（直撃だけ）', function () { withGrow(function () {
  var s = board(['......', '......', '......', '..h...', '......', '......']);
  var a = R.addAlly(s, 'earth', 2, 5);
  var e = tough(s, R.addEnemy(s, 'fire', 2, 3));
  var r = fire(s, a, 'up');
  eq(tile(r.state, 2, 3), 'hill');
  eq(dealt(r, e.id), 1);
}); });
test('育つ: 炎・小さな炎に土をかぶせると丘になる', function () { withGrow(function () {
  var s = board(['......', '......', '.s....', '.X....', '......', '......']);
  var a = R.addAlly(s, 'earth', 2, 5);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 1, 3), tile(r.state, 1, 2)], ['hill', 'hill']);
}); });
test('丘: 入ると止まる（その先へは進めない）', function () {
  var s = board(['.h....', '......', '......', '......', '......', '......']);
  var a = R.addAlly(s, 'fire', 0, 0);
  var reach = R.reachableCells(s, a.id);
  ok(reach['1,0'] !== undefined, '丘には入れる');
  ok(reach['2,0'] === undefined, '丘の先へは進めない');
  ok(reach['1,1'] !== undefined, 'ほかの道はそのまま');
});
test('丘: 丘の上から動き出すのは自由', function () {
  var s = board(['......', '......', '......', '......', '..h...', '......']);
  var a = R.addAlly(s, 'fire', 2, 4);
  var reach = R.reachableCells(s, a.id);
  ok(reach['2,2'] !== undefined && reach['4,4'] !== undefined, '2マス動ける');
});
test('丘: 丘の上から撃つと形が正面へ1マス先にずれる（高台）', function () {
  var s = board(['......', '......', '......', '......', '..h...', '......']);
  var a = R.addAlly(s, 'fire', 2, 4);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 3), tile(r.state, 2, 2)], ['empty', 'smallfire']);
});
test('丘: 高台は流れる・吹き抜ける魔法も1マス先から', function () {
  var s = board(['......', '......', '......', '......', '..h...', '......']);
  var w = R.addAlly(s, 'water', 2, 4);
  var r = fire(s, w, 'up');
  eq([tile(r.state, 2, 3), tile(r.state, 2, 2), tile(r.state, 2, 1)], ['empty', 'puddle', 'puddle']);
  var s2 = board(['......', '......', '......', '......', '..h...', '......']);
  var b = R.addAlly(s2, 'wind', 2, 4);
  var e = tough(s2, R.addEnemy(s2, 'fire', 2, 1));
  var r2 = fire(s2, b, 'up');
  eq(pos(r2.state, e.id), [2, 0], '2マス先の敵まで風が届く');
});
test('丘: 水が当たると丘から川が流れる（源流）。丘は丘のまま', function () {
  var s = board(['......', '......', '......', '..h...', '......', '......']);
  var a = R.addAlly(s, 'water', 2, 5);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 4), tile(r.state, 2, 3), tile(r.state, 2, 2), tile(r.state, 2, 0)], ['puddle', 'hill', 'river', 'river'], '丘の手前は水たまり、丘の先は川');
});
test('丘: 低いので風をさえぎらない（丘の先の敵も運ぶ）', function () {
  var s = board(['......', '......', '......', '......', '..h...', '......']);
  var a = R.addAlly(s, 'wind', 2, 5);
  var e = tough(s, R.addEnemy(s, 'fire', 2, 3));
  var r = fire(s, a, 'up');
  eq(pos(r.state, e.id), [2, 2]);
  eq(tile(r.state, 2, 4), 'hill');
});
test('丘: 燃え広がりは丘を通り抜ける（丘は丘のまま、その先の森が燃える）', function () {
  var s = board(['......', '..F...', '..h...', '..X...', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 4);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 2), tile(r.state, 2, 1)], ['hill', 'fire']);
});
test('丘: 雷は高い所に落ちる（丘に落ちる）', function () {
  var s = board(['......', '......', '......', '..h...', '......', '......']);
  var a = R.addAlly(s, 'thunder', 2, 4);
  var r = fire(s, a, 'up');
  ok(r.events.some(function (e) { return /雷が丘に落ちた/.test(e.text || ''); }), r.events.map(function (e) { return e.text; }).join(' / '));
});
test('丘: 火を点けても何も起きない（火山になるのは山だけ）', function () {
  var s = board(['......', '......', '......', '..h...', '......', '......']);
  var a = R.addAlly(s, 'fire', 2, 4);
  var r = fire(s, a, 'up');
  eq(tile(r.state, 2, 3), 'hill');
});
test('育つ: 敵の土も同じく、丘を山に育てる', function () { withGrow(function () {
  var s = board(['......', '......', '..h...', '......', '......', '......'], true);
  var e = R.addEnemy(s, 'earth', 2, 0);
  R.addAlly(s, 'fire', 0, 5);
  intend(s, e, 'down');
  var r = R.endTurn(s);
  // 丘 (2,2) を元に十字が山。同じ1発でできた丘 (3,2) も十字に入るので山。(3,3) は丘のまま
  eq([tile(r.state, 2, 2), tile(r.state, 2, 1), tile(r.state, 3, 2), tile(r.state, 3, 3)], ['mountain', 'mountain', 'mountain', 'hill']);
}); });

// 7×7 の (3,3) に丘。味方の土が (3,5) から上へ撃つと、形は (3,3) と (2,3)(2,2)。空きの2マスは先に丘になってから、(3,3) が育つ
function growBoard(extra) {
  var rows = ['.......', '.......', '.......', '...h...', '.......', '.......', '.......'];
  (extra || []).forEach(function (e) { rows[e[1]] = rows[e[1]].slice(0, e[0]) + e[2] + rows[e[1]].slice(e[0] + 1); });
  var s = board(rows);
  var a = R.addAlly(s, 'earth', 3, 5);
  return { s: s, a: a };
}
function mountains(s) {
  var out = [];
  for (var y = 0; y < s.size; y++) for (var x = 0; x < s.size; x++) if (tile(s, x, y) === 'mountain') out.push(x + ',' + y);
  return out.sort();
}
test('育つ: 山の大きさ 1 は、その丘だけ', function () { withGrow(function () {
  var g = growBoard(), r = fire(g.s, g.a, 'up');
  eq(mountains(r.state), ['3,3']);
  eq([tile(r.state, 2, 3), tile(r.state, 2, 2)], ['hill', 'hill']);
}, { mountainSize: 1 }); });
test('育つ: 山の大きさ 4 は 2×2（丘を角に、術者から見て奥・右へ）', function () { withGrow(function () {
  var g = growBoard(), r = fire(g.s, g.a, 'up');
  eq(mountains(r.state), ['3,2', '3,3', '4,2', '4,3']);
  // 右を向いて撃つときは、術者の右 = 下 になる: 土は (5,4)(5,5)(6,4)。(5,4) に丘を置いて確かめる
  var s3 = board(['.......', '.......', '.......', '.......', '.....h.', '.......', '.......']);
  var a3 = R.addAlly(s3, 'earth', 3, 5);
  var r3 = fire(s3, a3, 'right');
  ok(mountains(r3.state).indexOf('5,4') >= 0 && mountains(r3.state).indexOf('6,4') >= 0 && mountains(r3.state).indexOf('5,5') >= 0, '奥（右）と術者の右（下）へ: ' + mountains(r3.state));
}, { mountainSize: 4 }); });
test('育つ: 山の大きさ 5 は十字（同じ1発でできた丘も十字に入れば山）', function () { withGrow(function () {
  var g = growBoard(), r = fire(g.s, g.a, 'up');
  eq(mountains(r.state), ['2,3', '3,2', '3,3', '3,4', '4,3']);
  eq(tile(r.state, 2, 2), 'hill');
}, { mountainSize: 5 }); });
test('育つ: 山の大きさ 9 は 3×3', function () { withGrow(function () {
  var g = growBoard(), r = fire(g.s, g.a, 'up');
  eq(mountains(r.state).length, 9);
  eq([tile(r.state, 2, 2), tile(r.state, 4, 4)], ['mountain', 'mountain']);
}, { mountainSize: 9 }); });
test('育つ: ユニットのいるマス・ほかの自然のマスは山にならない（育てなかったマスとして残る）', function () { withGrow(function () {
  var g = growBoard([[4, 3, 'F']]);
  var e = tough(g.s, R.addEnemy(g.s, 'fire', 3, 4));
  var r = fire(g.s, g.a, 'up');
  eq(tile(r.state, 4, 3), 'forest');
  eq(tile(r.state, 3, 4), 'empty');
  eq(pos(r.state, e.id), [3, 4], '押し出しを切っているので、その場に残る');
  var cast = r.events.filter(function (ev) { return ev.type === 'cast'; })[0];
  eq(sorted(cast.grows[0].blocked), ['3,4', '4,3']);
  var pv = R.previewAct(g.s, g.a.id, [3, 5], 'up');
  eq(sorted(pv.grows[0].cells), ['2,3', '3,2', '3,3'], '予測にも育つマスが出る');
}, { mountainSize: 5, pushOut: false }); });
test('育つ: 波の順（元が0、となりが1、ななめが2）', function () { withGrow(function () {
  var g = growBoard(), r = fire(g.s, g.a, 'up');
  var gr = r.events.filter(function (ev) { return ev.type === 'cast'; })[0].grows[0];
  eq(gr.origin, [3, 3]);
  eq(gr.wave[0], 0);
  ok(gr.wave.indexOf(2) > gr.wave.lastIndexOf(1), '近い順');
}, { mountainSize: 9 }); });

test('押し出し: 山になるマスにいた者は、丘から見て外向きに1マス押し出される（直撃も受ける）', function () { withGrow(function () {
  var g = growBoard();
  var e = tough(g.s, R.addEnemy(g.s, 'fire', 4, 3));   // 丘 (3,3) の右
  var r = fire(g.s, g.a, 'up');
  eq(pos(r.state, e.id), [5, 3]);
  eq(tile(r.state, 4, 3), 'mountain', '空いたマスは山になる');
  eq(dealt(r, e.id), 1);
  ok(r.events.some(function (ev) { return /盛り上がる山に押し出された（右へ1マス）/.test(ev.text || ''); }), 'ログ');
}, { mountainSize: 5 }); });
test('押し出し: 押せないとき（盤の端・通れない・ユニットがいる）は残り、そのマスは山にならない', function () { withGrow(function () {
  var g = growBoard([[5, 3, 'M']]);
  var e = tough(g.s, R.addEnemy(g.s, 'fire', 4, 3));   // 右の先は山で通れない
  var b = tough(g.s, R.addEnemy(g.s, 'fire', 3, 2));   // 上
  tough(g.s, R.addEnemy(g.s, 'fire', 3, 1));           // 上の先にユニット
  var r = fire(g.s, g.a, 'up');
  eq([pos(r.state, e.id), pos(r.state, b.id)], [[4, 3], [3, 2]]);
  eq([tile(r.state, 4, 3), tile(r.state, 3, 2)], ['empty', 'empty']);
  eq(dealt(r, e.id), 1, '押せなくても直撃は受ける');
}, { mountainSize: 5 }); });
test('押し出し: ななめのマス（3×3）は、術者の向きの軸で外へ', function () { withGrow(function () {
  var g = growBoard();
  var e = tough(g.s, R.addEnemy(g.s, 'fire', 4, 2));   // 丘 (3,3) の右上（術者は上向き）→ 上へ
  var f = tough(g.s, R.addEnemy(g.s, 'fire', 4, 4));   // 右下 → 下へ
  var r = fire(g.s, g.a, 'up');
  eq([pos(r.state, e.id), pos(r.state, f.id)], [[4, 1], [4, 5]]);
}, { mountainSize: 9 }); });
test('押し出し: 押された先が泥沼ならはまる', function () { withGrow(function () {
  var g = growBoard([[5, 3, 'D']]);
  var e = tough(g.s, R.addEnemy(g.s, 'fire', 4, 3));
  var r = fire(g.s, g.a, 'up');
  eq(pos(r.state, e.id), [5, 3]);
  ok(R.findUnit(r.state, e.id).stuck, 'はまった');
}, { mountainSize: 5 }); });
test('押し出し: 味方も同じく押し出される', function () { withGrow(function () {
  var g = growBoard();
  var b = R.addAlly(g.s, 'fire', 2, 3);   // 丘 (3,3) の左。土の形のマスでもある（直撃）
  var r = fire(g.s, g.a, 'up');
  eq(pos(r.state, b.id), [1, 3]);
  eq(tile(r.state, 2, 3), 'mountain');
}, { mountainSize: 5 }); });
test('押し出し: 敵の土でも同じく押し出される', function () { withGrow(function () {
  var s = board(['......', '......', '..h...', '......', '......', '......'], true);
  var e = R.addEnemy(s, 'earth', 2, 0);
  var a = tough(s, R.addAlly(s, 'fire', 1, 2));   // 丘 (2,2) の左（敵の直撃3で倒れないように）
  R.addAlly(s, 'fire', 5, 5);
  intend(s, e, 'down');
  var r = R.endTurn(s);
  eq(pos(r.state, a.id), [0, 2]);
  eq(tile(r.state, 1, 2), 'mountain');
}, { mountainSize: 5 }); });
test('グラデーション: 入なら、山になるのは元の丘だけで、まわりは丘', function () { withGrow(function () {
  var g = growBoard();
  var r = fire(g.s, g.a, 'up');
  eq(mountains(r.state), ['3,3']);
  eq([tile(r.state, 3, 2), tile(r.state, 4, 3), tile(r.state, 3, 4), tile(r.state, 2, 3)], ['hill', 'hill', 'hill', 'hill']);
}, { mountainSize: 5, mountainSlope: true }); });
test('グラデーション: まわりが丘なら通れるので、押し出さない', function () { withGrow(function () {
  var g = growBoard();
  var e = tough(g.s, R.addEnemy(g.s, 'fire', 4, 3));
  var r = fire(g.s, g.a, 'up');
  eq(pos(r.state, e.id), [4, 3]);
  eq(tile(r.state, 4, 3), 'hill', 'ユニットのいるマスも丘になる（丘は立てる。natureUnderUnits）');
}, { mountainSize: 5, mountainSlope: true }); });

// ---------------------------------------------------------------
console.log('\n■ 育つ（IMPROVE_grow）: 草 — 草むらと森');
CH.g = 'thicket';
function forests(s) {
  var out = [];
  for (var y = 0; y < s.size; y++) for (var x = 0; x < s.size; x++) if (tile(s, x, y) === 'forest') out.push(x + ',' + y);
  return out.sort();
}
// 7×7。草の味方が (3,6) から上へ撃つと、形は (3,4) と (2,3)(3,3)(4,3)
function grassBoard(rows) {
  var s = board(rows || ['.......', '.......', '.......', '.......', '.......', '.......', '.......']);
  return { s: s, a: R.addAlly(s, 'grass', 3, 6) };
}
test('草: 切っているときは今までどおり、空きに草で森', function () {
  var g = grassBoard(), r = fire(g.s, g.a, 'up');
  eq(forests(r.state), ['2,3', '3,3', '3,4', '4,3']);
});
test('草: 空きに草で草むら、草むらにもう一度草で森に育つ（十字に茂る）', function () { withGrow(function () {
  var g = grassBoard(), r = fire(g.s, g.a, 'up');
  eq([tile(r.state, 3, 4), tile(r.state, 2, 3), tile(r.state, 3, 3), tile(r.state, 4, 3)], ['thicket', 'thicket', 'thicket', 'thicket']);
  var s2 = r.state; R.findUnit(s2, g.a.id).acted = false;
  var r2 = fire(s2, g.a, 'up');
  eq(forests(r2.state), ['1,3', '2,2', '2,3', '2,4', '3,2', '3,3', '3,4', '3,5', '4,2', '4,3', '4,4', '5,3']);
  ok(r2.events.some(function (e) { return /草むらが森に育った/.test(e.text || ''); }), 'ログ');
}, { forestSize: 5 }); });
test('草: 森の大きさ 1 は、その草むらだけ', function () { withGrow(function () {
  var g = grassBoard(['.......', '.......', '.......', '...g...', '.......', '.......', '.......']);
  var r = fire(g.s, g.a, 'up');
  eq(forests(r.state), ['3,3']);
  eq([tile(r.state, 3, 4), tile(r.state, 2, 3)], ['thicket', 'thicket']);
}, { forestSize: 1 }); });
test('草: 森は通れるので押し出さない。ユニットのいるマスにも森が育つ（natureUnderUnits）', function () { withGrow(function () {
  var g = grassBoard(['.......', '.......', '.......', '...g...', '.......', '.......', '.......']);
  var e = tough(g.s, R.addEnemy(g.s, 'fire', 3, 2));
  var r = fire(g.s, g.a, 'up');
  eq(pos(r.state, e.id), [3, 2]);
  eq(tile(r.state, 3, 2), 'forest');
  eq(dealt(r, e.id), 0, '形の外なので直撃もない');
}, { forestSize: 5, pushOut: true }); });
test('草むら: 火で燃える（今は弱い炎の扱い）', function () {
  var s = board(['......', '......', '......', '..g...', '......', '......']);
  var a = R.addAlly(s, 'fire', 2, 4);
  var r = fire(s, a, 'up');
  eq(tile(r.state, 2, 3), 'fire');
});
test('草むら: 燃え広がりで、つながった森と草むらがまとめて燃える（plantStrong を切ると、強い炎は森の上だけ）', function () {
  var was = B.fire.plantStrong; B.fire.plantStrong = false;
  try {
  var s = board(['..gF..', '..g...', '..g...', '..X...', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 4);
  var e1 = R.addEnemy(s, 'fire', 2, 1);   // 草むらの上
  var e2 = R.addEnemy(s, 'fire', 3, 0);   // 森の上
  R.findUnit(s, e1.id).hp = 99; R.findUnit(s, e2.id).hp = 99;
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 0), tile(r.state, 2, 2), tile(r.state, 3, 0)], ['fire', 'fire', 'fire']);
  eq([dealt(r, e1.id), dealt(r, e2.id)], [B.fire.weakDamage, B.fire.strongDamage]);
  ok(r.events.some(function (e) { return /草むら3マスも燃えた/.test(e.text || ''); }), 'ログ');
  } finally { B.fire.plantStrong = was; }
});
test('草むら: ターン終了で、炎の隣の草むらへ燃え移る', function () {
  var s = board(['......', '......', '..Xg..', '......', '......', '......']);
  R.addAlly(s, 'fire', 0, 5);
  var r = R.endTurn(s);
  eq(tile(r.state, 3, 2), 'fire');
});
test('草むら: 闇を撃っても死の森にならない（森だけ）', function () {
  var s = board(['......', '......', '......', '..g...', '......', '......']);
  var a = R.addAlly(s, 'dark', 2, 4);
  var r = fire(s, a, 'up');
  eq(tile(r.state, 2, 3), 'thicket');
});
test('草むら: 低いので雷は落ちない（その先の森に落ちる）', function () {
  var s = board(['......', '..F...', '...g..', '..g...', '......', '......']);
  var a = R.addAlly(s, 'thunder', 2, 4);
  var r = fire(s, a, 'up');
  ok(r.events.some(function (e) { return /雷が森に落ちて燃えた/.test(e.text || ''); }), r.events.map(function (e) { return e.text; }).join(' / '));
  eq([tile(r.state, 2, 3), tile(r.state, 3, 2), tile(r.state, 2, 1)], ['thicket', 'thicket', 'fire']);
});
test('草むら: 水が流れると沈んで川になる', function () {
  var s = board(['......', '......', '......', '..g...', '......', '......']);
  var a = R.addAlly(s, 'water', 2, 5);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 4), tile(r.state, 2, 3)], ['puddle', 'river'], '空きは水たまり、草むらは沈んで川');
});
test('草: 水辺の草むらは、水に沿って草むらのまま広がる', function () { withGrow(function () {
  var s = board(['.......', '.......', '.......', '.....R.', '.....R.', '.......', '.......']);
  var a = R.addAlly(s, 'grass', 3, 6);
  var r = fire(s, a, 'up');
  eq(tile(r.state, 4, 4), 'thicket', '川に接する草むら (4,3) の隣で、川に接する (4,4) へ');
  ok(r.events.some(function (e) { return /水辺で草むらが広がった/.test(e.text || ''); }), r.events.map(function (e) { return e.text; }).join(' / '));
}); });
test('草: 敵の草も同じく、こちらの草むらを森に育てる', function () { withGrow(function () {
  var s = board(['......', '......', '..g...', '......', '......', '......'], true);
  var e = R.addEnemy(s, 'grass', 2, 0);   // 下向き: 形は (2,2) と (1,3)(2,3)(3,3)
  R.addAlly(s, 'fire', 5, 5);
  intend(s, e, 'down');
  var r = R.endTurn(s);
  eq([tile(r.state, 2, 2), tile(r.state, 2, 1), tile(r.state, 1, 2), tile(r.state, 3, 2)], ['forest', 'forest', 'forest', 'forest']);
}, { forestSize: 5 }); });

// ---------------------------------------------------------------
console.log('\n■ 育つ（IMPROVE_grow）: 火 — 小さな炎と炎');
test('火: 切っているときは、小さな炎に火を点けても何も起きない', function () {
  var s = board(['......', '......', '......', '..s...', '......', '......']);
  var a = R.addAlly(s, 'fire', 2, 4);
  eq(tile(fire(s, a, 'up').state, 2, 3), 'smallfire');
});
test('火: 小さな炎にもう一度火で、炎に育つ（その場で燃え続ける）', function () { withGrow(function () {
  var s = board(['......', '......', '......', '..s...', '......', '......']);
  var a = R.addAlly(s, 'fire', 2, 4);
  var r = fire(s, a, 'up');
  eq(tile(r.state, 2, 3), 'fire');
  ok(r.events.some(function (e) { return /小さな炎が炎に育った/.test(e.text || ''); }), 'ログ');
  eq(r.events.filter(function (e) { return e.type === 'cast'; })[0].grows[0].cells, [[2, 3]]);
}); });
test('火: 同じターンに2人で火を点けると、空きが炎になる（小さな炎 → 炎）', function () { withGrow(function () {
  var s = board(['......', '......', '......', '......', '......', '......']);
  var a = R.addAlly(s, 'fire', 2, 4), b = R.addAlly(s, 'fire', 1, 3);
  var r = fire(s, a, 'up');
  var r2 = fire(r.state, b, 'right');
  eq(tile(r2.state, 2, 3), 'fire');
}); });
test('炎: 草むらが燃えたマスも強い炎（plantStrong）', function () { withGrow(function () {
  var s = board(['..g...', '..g...', '..g...', '..X...', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 4);
  var e = R.addEnemy(s, 'fire', 2, 1); R.findUnit(s, e.id).hp = 99;
  var r = fire(s, a, 'up');
  eq(dealt(r, e.id), B.fire.strongDamage);
  eq(names(r.events, 'finisher'), ['燃え広がり']);
}); });
test('炎: 草むらの炎は1回目のターン終了で燃え尽き、森の炎は3回目で燃え尽きる（ほかの炎は2回目）', function () { withGrow(function () {
  var s = board(['......', '......', '......', '..g.F.', '......', '......']);
  var a = R.addAlly(s, 'fire', 2, 4), b = R.addAlly(s, 'fire', 4, 4), c = R.addAlly(s, 'fire', 0, 1);
  var st = fire(s, a, 'up').state;
  st = fire(st, b, 'up').state;
  st = fire(st, c, 'up').state;   // (0,0) に小さな炎
  var R1 = R.endTurn(st).state;
  eq([tile(R1, 2, 3), tile(R1, 4, 3)], ['empty', 'fire'], '1回目: 草むらの炎は燃え尽きる');
  var R2 = R.endTurn(R1).state;
  eq(tile(R2, 4, 3), 'fire', '2回目: 森の炎はまだ燃える');
  var R3 = R.endTurn(R2).state;
  eq(tile(R3, 4, 3), 'empty', '3回目: 森の炎も燃え尽きる');
}); });
test('炎: 小さな炎から育った炎は、今までどおり2回目のターン終了で燃え尽きる', function () { withGrow(function () {
  var s = board(['......', '......', '......', '..s...', '......', '......']);
  var a = R.addAlly(s, 'fire', 2, 4);
  var st = fire(s, a, 'up').state;
  var R1 = R.endTurn(st).state;
  eq(tile(R1, 2, 3), 'fire');
  eq(tile(R.endTurn(R1).state, 2, 3), 'empty');
}); });
test('火: 敵の火も同じく、小さな炎を炎に育てる', function () { withGrow(function () {
  var s = board(['......', '......', '..s...', '......', '......', '......'], true);
  var e = R.addEnemy(s, 'fire', 2, 1);
  R.addAlly(s, 'fire', 5, 5);
  intend(s, e, 'down');
  var r = R.endTurn(s);
  ok(r.events.some(function (ev) { return /小さな炎が炎に育った/.test(ev.text || ''); }), r.events.map(function (ev) { return ev.text; }).join(' / '));
}); });

// ---------------------------------------------------------------
console.log('\n■ 育つ（IMPROVE_grow）: 水 — 水たまりと川');
function col(s, x) { var out = []; for (var y = 0; y < s.size; y++) out.push(tile(s, x, y)); return out; }
test('水: 空きに水で水たまり（池の形のまま、川ではない）', function () { withGrow(function () {
  var s = empty(6);
  var a = R.addAlly(s, 'water', 2, 5);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 4), tile(r.state, 2, 3), tile(r.state, 2, 2)], ['puddle', 'puddle', 'empty']);
  ok(r.events.some(function (e) { return /水たまりができた（2マス）/.test(e.text || ''); }), 'ログ');
}); });
test('水: 通り道に水たまりがあると、そこから向きの奥へ川に育つ（4マス先まで）', function () { withGrow(function () {
  var s = board(['........', '........', '........', '........', '........', '...P....', '........', '........']);
  var a = R.addAlly(s, 'water', 3, 7);
  var r = fire(s, a, 'up');
  eq(col(r.state, 3), ['empty', 'river', 'river', 'river', 'river', 'river', 'puddle', 'empty']);
  ok(r.events.some(function (e) { return /水たまりに水が流れこんで川に育った/.test(e.text || ''); }), 'ログ');
}, { riverLength: 4 }); });
test('水: 川の長さ 0 は盤の端まで', function () { withGrow(function () {
  var s = board(['........', '........', '........', '........', '........', '...P....', '........', '........']);
  var a = R.addAlly(s, 'water', 3, 7);
  eq(col(fire(s, a, 'up').state, 3)[0], 'river');
}, { riverLength: 0 }); });
test('水: 育つ川は森・丘・ユニットで止まり、炎は消して止まる', function () { withGrow(function () {
  var s = board(['......', '..F...', '......', '..P...', '......', '......']);
  var a = R.addAlly(s, 'water', 2, 4);
  eq(col(fire(s, a, 'up').state, 2), ['empty', 'forest', 'river', 'river', 'empty', 'empty']);
  var s2 = board(['......', '..h...', '......', '..P...', '......', '......']);
  var b = R.addAlly(s2, 'water', 2, 4);
  eq(col(fire(s2, b, 'up').state, 2).slice(0, 4), ['empty', 'hill', 'river', 'river'], '丘で止まる（育つ川は源流にならない）');
  var s3 = board(['......', '..X...', '......', '..P...', '......', '......']);
  var c = R.addAlly(s3, 'water', 2, 4);
  eq(col(fire(s3, c, 'up').state, 2).slice(0, 4), ['empty', 'empty', 'river', 'river']);
}); });
test('水: 水たまりの先（2マス以内）に丘か山があれば源流（盤の端まで川）', function () { withGrow(function () {
  var s = board(['......', '......', '......', '..h...', '......', '......']);
  var a = R.addAlly(s, 'water', 2, 5);
  eq(col(fire(s, a, 'up').state, 2), ['river', 'river', 'river', 'hill', 'puddle', 'empty']);
}); });
test('水たまり: 火で蜃気楼、川に火は何も起きない（今どおり）', function () { withGrow(function () {
  var s = board(['......', '......', '......', '..P.R.', '......', '......']);
  var a = R.addAlly(s, 'fire', 2, 4), b = R.addAlly(s, 'fire', 4, 4);
  var st = fire(s, a, 'up').state;
  st = fire(st, b, 'up').state;
  eq([tile(st, 2, 3), tile(st, 4, 3)], ['mirage', 'river']);
}); });
test('水: 敵の水も同じく、こちらの水たまりを川に育てる', function () { withGrow(function () {
  var s = board(['......', '......', '..P...', '......', '......', '......'], true);
  var e = R.addEnemy(s, 'water', 2, 0);
  R.addAlly(s, 'fire', 5, 5);
  intend(s, e, 'down');
  var r = R.endTurn(s);
  eq(col(r.state, 2).slice(1), ['puddle', 'river', 'river', 'river', 'river'], '手前に水たまり、こちらの水たまりから端まで川');
}, { riverLength: 4 }); });

// ---------------------------------------------------------------
console.log('\n■ 育つ（IMPROVE_grow）: 風 — 風と強風');
CH.B = 'breeze'; CH.b = 'gale';
test('風: 切っているときは、風の残るマスに風を当てても今までどおり', function () {
  var s = board(['......', '......', '......', '......', '..B...', '......']);
  var a = R.addAlly(s, 'wind', 2, 5);
  var r = fire(s, a, 'up');
  eq(col(r.state, 2), ['empty', 'empty', 'empty', 'breeze', 'breeze', 'empty']);
});
test('風: 通り道に風が残っていれば、そこから奥へ強風に育つ（4マス）', function () { withGrow(function () {
  var s = board(['.......', '.......', '.......', '.......', '.......', '...B...', '.......']);
  var a = R.addAlly(s, 'wind', 3, 6);
  var r = fire(s, a, 'up');
  eq(col(r.state, 3), ['empty', 'empty', 'gale', 'gale', 'gale', 'gale', 'empty']);
  ok(r.events.some(function (e) { return /風に風が重なって強風に育った/.test(e.text || ''); }), 'ログ');
}, { galeLength: 4 }); });
test('強風: 通り道の者は2マス運ばれる（強風の手前の者は1マス）', function () { withGrow(function () {
  var s = board(['.......', '.......', '.......', '.......', '...B...', '.......', '.......']);
  var a = R.addAlly(s, 'wind', 3, 6);
  var e1 = tough(s, R.addEnemy(s, 'fire', 3, 5));   // 風の手前（強風になる前）
  var e2 = tough(s, R.addEnemy(s, 'fire', 3, 3));   // 強風の中
  var r = fire(s, a, 'up');
  eq([pos(r.state, e1.id), pos(r.state, e2.id)], [[3, 4], [3, 1]]);
}, { galeLength: 4 }); });
test('強風: 2マス目に押せなければ1マスで止まる', function () { withGrow(function () {
  var s = board(['.......', '...M...', '.......', '.......', '...B...', '.......', '.......']);
  var a = R.addAlly(s, 'wind', 3, 5);
  var e = tough(s, R.addEnemy(s, 'fire', 3, 3));
  var r = fire(s, a, 'up');
  eq(pos(r.state, e.id), [3, 2]);
}, { galeLength: 4 }); });
test('強風: 山で止まる（丘は通り抜ける）', function () { withGrow(function () {
  var s = board(['.......', '...M...', '...h...', '.......', '...B...', '.......', '.......']);
  var a = R.addAlly(s, 'wind', 3, 5);
  var r = fire(s, a, 'up');
  eq(col(r.state, 3).slice(0, 5), ['empty', 'mountain', 'hill', 'gale', 'gale']);
}, { galeLength: 4 }); });
test('強風: 強風で起こした燃え広がりは遠くまで走る（＋2マス）', function () { withGrow(function () {
  var rows = []; for (var y = 0; y < 10; y++) rows.push('..........');
  rows[8] = '...B......'; rows[7] = '...X......';
  var s = board(rows);
  var a = R.addAlly(s, 'wind', 3, 9);
  var r = fire(s, a, 'up');
  // 炎 (3,7) から上へ、ふつうは4マス（(3,6)〜(3,3)）、強風なら6マス（〜(3,1)）
  eq([tile(r.state, 3, 1), tile(r.state, 3, 0)], ['smallfire', 'empty']);
}, { galeLength: 4, galeSpreadBonus: 2 }); });
test('強風: 火を入れると火の渦（風と同じ）。ターン終了でやむ', function () { withGrow(function () {
  var s = board(['......', '......', '......', '..b...', '......', '......']);
  var a = R.addAlly(s, 'fire', 2, 4);
  var r = fire(s, a, 'up');
  eq(names(r.events, 'finisher'), ['火の渦']);
  var s2 = board(['......', '......', '......', '..b...', '......', '......']);
  R.addAlly(s2, 'fire', 0, 5);
  eq(tile(R.endTurn(s2).state, 2, 3), 'empty');
}); });
test('風: 敵の風も同じく、こちらの風を強風に育てる', function () { withGrow(function () {
  var s = board(['......', '......', '..B...', '......', '......', '......'], true);
  var e = R.addEnemy(s, 'wind', 2, 0);
  R.addAlly(s, 'fire', 5, 5);
  intend(s, e, 'down');
  var r = R.endTurn(s);
  ok(r.events.some(function (ev) { return /強風に育った/.test(ev.text || ''); }), r.events.map(function (ev) { return ev.text; }).join(' / '));
}); });

// ---------------------------------------------------------------
console.log('\n■ 育つ（IMPROVE_grow）: 桜吹雪の奥行き');
CH.k = 'hillsakura';
function countTile(s, t) { return s.tiles.filter(function (x) { return x === t; }).length; }
test('【試し】桜: 丘に草で丘の桜が咲く（丘の性質のまま、通れる。起こし方が「山に草で桜」のときだけ）', function () { withGrow(function () {
  var s = board(['......', '......', '..h...', '......', '......', '......']);
  var a = R.addAlly(s, 'grass', 2, 4);   // 形の (0,2) が (2,2)
  B.sakura.from = 'grass';
  var r;
  try { r = fire(s, a, 'up'); } finally { B.sakura.from = 'fire'; }
  eq(tile(r.state, 2, 2), 'hillsakura');
  ok(R.isPassable('hillsakura'), '通れる');
}); });
test('桜吹雪: 丘の桜は扇2列（4マス）、散ると丘に戻る', function () { withGrow(function () {
  var s = board(['.......', '.......', '.......', '...k...', '.......', '.......', '.......']);
  var a = R.addAlly(s, 'wind', 3, 5);
  var r = fire(s, a, 'up');
  eq(names(r.events, 'finisher'), ['桜吹雪']);
  eq(countTile(r.state, 'petals'), 4);
  eq(tile(r.state, 3, 3), 'hill');
}, { sakuraDepthHill: 2 }); });
test('桜吹雪: 山の桜は扇3列（9マス）、散ると山に戻る', function () { withGrow(function () {
  var s = board(['.......', '.......', '.......', '...K...', '.......', '.......', '.......']);
  var a = R.addAlly(s, 'wind', 3, 5);
  var r = fire(s, a, 'up');
  eq(countTile(r.state, 'petals'), 9);
  eq(tile(r.state, 3, 3), 'mountain');
}, { sakuraDepthMountain: 3 }); });

// ---------------------------------------------------------------
console.log('\n■ 縮尺（IMPROVE_grow）: 形を正面1マス・広場・見本');
var T = require('../tune.js');
function withSet(set, fn) {
  var saved = {};
  Object.keys(set).forEach(function (k) { saved[k] = T.getPath(B, k); var ps = k.split('.'), last = ps.pop(); ps.reduce(function (o, p) { return o[p]; }, B)[last] = set[k]; });
  try { fn(); } finally { Object.keys(saved).forEach(function (k) { var ps = k.split('.'), last = ps.pop(); ps.reduce(function (o, p) { return o[p]; }, B)[last] = saved[k]; }); }
}
test('形を正面1マス: 草・土・火は正面1マス、水・風も1マス（雷は今のまま）', function () { withSet({ 'shape.frontOne': true }, function () {
  var s = empty(6);
  ['grass', 'earth', 'fire'].forEach(function (m) { eq(R.shapeCells(s, m, 2, 5, 'up'), [[2, 4]], m); });
  eq(R.shapeCells(s, 'thunder', 2, 5, 'up').length, 4, '雷は今のまま');
  var w = R.addAlly(s, 'water', 2, 5);
  var r = fire(s, w, 'up');
  eq([tile(r.state, 2, 4), tile(r.state, 2, 3)], ['puddle', 'empty']);
  var s2 = empty(6);
  var b = R.addAlly(s2, 'wind', 2, 5);
  var r2 = fire(s2, b, 'up');
  eq([tile(r2.state, 2, 4), tile(r2.state, 2, 3)], ['breeze', 'empty']);
}); });
test('広場: どの大きさでも、味方は下の段に3人・敵は上の段に2体（狙いは近い人と自然）', function () {
  [5, 6, 8, 10, 12].forEach(function (n) { withSet({ boardSize: n }, function () {
    var s = R.loadPreset('plaza');
    eq(s.size, n);
    eq(R.alliesOf(s).map(function (a) { return a.y; }), [n - 1, n - 1, n - 1], n + ': 味方');
    eq(R.enemiesOf(s).map(function (e) { return [e.y, e.aim]; }), [[0, 'near'], [0, 'nature']], n + ': 敵');
  }); });
});
test('広場: 育つを切っているときは丘の代わりに山（魔法で作れるものだけ）', function () {
  withSet({ boardSize: 6, 'grow.enabled': false }, function () { ok(R.loadPreset('plaza').tiles.indexOf('hill') < 0 && R.loadPreset('plaza').tiles.indexOf('mountain') >= 0, '山'); });
  withSet({ boardSize: 6, 'grow.enabled': true }, function () { ok(R.loadPreset('plaza').tiles.indexOf('hill') >= 0, '丘'); });
});
test('見本: 5つとも、その設定で広場を始めて1ターン遊べる', function () {
  T.WORLDS.forEach(function (w) { withSet(w.set, function () {
    var st = R.startBattle(R.loadPreset('plaza')).state;
    eq(st.size, w.set.boardSize, w.name);
    R.alliesOf(st).forEach(function (a) { var r = R.act(st, a.id, { dir: 'up' }); ok(r.ok, w.name + ': ' + r.error); st = r.state; });
    ok(st.turn === 2 || st.result || R.allAlliesActed(st), w.name + ': 1ターン進む');
  }); });
});

// ---------------------------------------------------------------
console.log('\n■ チュートリアル①「重ねる」（IMPROVE_tutorial1）');
// 座標は (x, y)。仕様書の（行, 列）は (列-1, 行-1)。風使い (0,1)・自分 (0,2)・森 (3,0)(4,0)(3,1)(4,1)・敵 (4,1)
function tut1() { return R.startBattle(R.loadPreset('tut1')).state; }
function tutPlayer(s) { return R.controllableOf(s)[0]; }
function tutNpc(s) { return R.alliesOf(s).filter(function (a) { return a.npc; })[0]; }
test('盤面: 5×5、構える味方（風・右向き）と自分（火）、2×2の森、森の中の進む敵（山を盛る魔法・左向き）、お題は全滅', function () {
  var s = tut1();
  eq(s.size, 5);
  eq(sorted(s.tiles.map(function (t, i) { return t === 'forest' ? [i % 5, Math.floor(i / 5)] : null; }).filter(Boolean)), sorted([[3, 0], [4, 0], [3, 1], [4, 1]]));
  var n = tutNpc(s), p = tutPlayer(s), e = R.enemiesOf(s)[0];
  eq([n.magic, n.x, n.y, n.facing], ['wind', 0, 1, 'right'], '構える味方');
  eq([p.magic, p.x, p.y], ['fire', 0, 2], '自分');
  eq([e.magic, e.x, e.y, e.facing, e.stand], ['mount', 4, 1, 'left', 'march'], '敵');
  ok(R.allyMagics(s).indexOf('mount') < 0, '山を盛る魔法は敵だけ');
  eq(s.mission.type, 'annihilate');
  ok(R.TUTORIALS.some(function (t) { return t.id === 'tut1'; }), 'チュートリアルの一覧に入っている');
});
test('overrides: そのシナリオの中だけで効き、ほかのシナリオと BALANCE に漏れない', function () {
  var before = JSON.stringify(B);
  var s = tut1();
  eq(tutPlayer(s).move, 2, '移動2');
  var t = R.endTurn(R.act(s, tutPlayer(s).id, { to: [1, 2], dir: 'up' }).state);
  var fin = t.events.filter(function (e) { return e.type === 'finisher'; })[0];
  ok(fin && fin.name === '燃え広がり' && /右へ3マス/.test(fin.text), '燃え広がりは3マス: ' + (fin && fin.text));
  eq(JSON.stringify(B), before, 'BALANCE は元のまま');
  eq([B.windMode, B.spread.maxLength], ['breeze', 4], '標準は風2マス・燃え広がり4マス');
  // ほかのシナリオ: 風は標準の2マス
  var o = empty(6);
  var w = R.addAlly(o, 'wind', 2, 5);
  var r2 = fire(o, w, 'up');
  eq([tile(r2.state, 2, 4), tile(r2.state, 2, 3)], ['breeze', 'breeze'], 'ほかのシナリオの風は2マス');
  // 途中で例外が出ても元に戻る
  try { R.withOverrides(s, function () { throw new Error('x'); }); } catch (e) { /* 戻ることを下で確かめる */ }
  eq(JSON.stringify(B), before, '例外のあとも元のまま');
});
test('overrides: JSON の書き出し・読み込みに入る。知らない項目・型の違う値は読み込まない', function () {
  var s = R.loadPreset('tut1');
  var r = R.importLayout(R.exportLayout(s));
  ok(r.ok, r.error);
  eq(r.state.overrides, s.overrides);
  eq(R.alliesOf(r.state).map(function (a) { return !!a.npc; }), [true, false], '構える味方も保存される');
  eq(R.enemiesOf(r.state)[0].stand, 'march', '進む敵も保存される');
  var d = JSON.parse(R.exportLayout(s));
  d.overrides = { 'spread.nope': 3 };
  ok(!R.importLayout(d).ok, '知らない項目');
  d.overrides = { 'spread.maxLength': 'long' };
  ok(!R.importLayout(d).ok, '型が違う');
  ok(JSON.parse(R.exportLayout(R.loadPreset('spread'))).overrides === undefined, 'ほかのシナリオには overrides がない');
});
test('構える味方: 毎ターン同じ所に構え直し、発動フェーズ（自分のあと・ターン終了処理の前）で撃つ', function () {
  var s = tut1();
  var n = tutNpc(s);
  ok(n.intent, '最初のターンから構えている');
  eq(R.forecast(s).allies.map(function (a) { return [a.id, a.dir, a.cells]; }), [[n.id, 'right', [[1, 1]]]], '狙うマスは (1,1)');
  var st = s;
  for (var turn = 1; turn <= 1; turn++) {   // ターン2の終わりは敵が撃って失敗するので、ターン1だけ
    var t = R.endTurn(R.act(st, tutPlayer(st).id, { dir: 'down' }).state);   // 下に撃つ（外す）
    eq(t.events.filter(function (e) { return e.type === 'cast'; }).map(function (e) { return e.id; }), [n.id], 'ターン' + turn + ': 構える味方が撃つ');
    var texts = t.events.map(function (e) { return e.text; }), types = t.events.map(function (e) { return e.type; });
    ok(texts.indexOf('── 構える味方の発動 ──') >= 0 && texts.indexOf('── 構える味方の発動 ──') < types.indexOf('turnEnd'), 'ターン終了処理より前');
    st = t.state;
    var n2 = tutNpc(st);
    eq([n2.x, n2.y, n2.facing, n2.intent], [0, 1, 'right', true], 'ターン' + (turn + 1) + ': 同じ所で構え直す');
  }
});
test('構える味方: プレイヤーは選べない・動かせない・撃たせられない。全員行動したかにも数えない', function () {
  var s = tut1();
  var r = R.act(s, tutNpc(s).id, { to: [1, 1], dir: 'right' });
  ok(!r.ok && /構える味方/.test(r.error), r.error);
  eq(R.controllableOf(s).map(function (a) { return a.id; }), [tutPlayer(s).id]);
  ok(!R.allAlliesActed(s), '自分が行動する前');
  ok(R.allAlliesActed(R.act(s, tutPlayer(s).id, { dir: 'down' }).state), '自分が行動したら全員');
});
test('構える味方も味方なので、ダメージを受ける（同じ法則）', function () {
  var s = tut1();
  var r = R.act(s, tutPlayer(s).id, { dir: 'up' });   // (0,2) から上: 構える味方 (0,1) に直撃
  eq(hp(r.state, tutNpc(s).id), 2);
});
test('正解の手順: (1,2) へ動いて上に火 → 風で燃え広がり、森ごと敵が倒れて1ターンで勝つ', function () {
  var s = tut1();
  // 火を構えた予測の盤面で、構える味方の結果が計算し直される（燃え広がり・敵 -20）
  var fc = R.forecast(R.previewAct(s, tutPlayer(s).id, [1, 2], 'up').state);
  eq(fc.allies[0].finishers.map(function (f) { return f.name; }), ['燃え広がり'], '予告が燃え広がりになる');
  eq(fc.enemyDamage.map(function (d) { return [d.side, d.amount]; }), [['enemy', 20]], '敵 -20');
  var t = R.endTurn(R.act(s, tutPlayer(s).id, { to: [1, 2], dir: 'up' }).state);
  eq(t.state.result, 'win');
  eq(t.state.turn, 1, '1ターン目で勝つ');
  eq([tile(t.state, 2, 1), tile(t.state, 3, 0), tile(t.state, 4, 1)], ['smallfire', 'fire', 'fire'], '通り道は小さな炎、森は炎');
});
test('(2,1) に火を置いても勝てない（弱い火は燃え移らない・風も当たらない）', function () {
  var s = tut1();
  var r = R.act(s, tutPlayer(s).id, { to: [2, 2], dir: 'up' });
  eq(tile(r.state, 2, 1), 'smallfire');
  var t = R.endTurn(r.state);
  ok(!t.state.result, '勝負はつかない');
  ok(!t.events.some(function (e) { return e.type === 'finisher' || e.type === 'fireSpread'; }), '燃え広がりも燃え移りもない');
  eq([tile(t.state, 3, 1), tile(t.state, 2, 1)], ['forest', 'empty'], '森は残り、小さな炎は消える');
  eq(R.enemiesOf(t.state)[0].hp, B.enemy.hp);
  eq(pos(t.state, R.enemiesOf(t.state)[0].id), [3, 1], '敵は森の中を1マス進んだだけ');
});
test('外したあとのターンで、構える味方の狙うマス (1,1) が光る（外す前は光らない）', function () {
  var s = tut1();
  eq(R.npcHintCells(s), [], '最初は光らない');
  var r = R.act(s, tutPlayer(s).id, { dir: 'down' });
  eq(R.npcHintCells(r.state), [], '撃っただけでは光らない');
  var t = R.endTurn(r.state);
  eq(R.npcHintCells(t.state), [[1, 1]], '外したあとは光る');
  eq(R.npcHintCells(R.startBattle(R.loadPreset('spread')).state), [], 'ほかのシナリオでは光らない');
  var r2 = R.act(t.state, tutPlayer(t.state).id, { to: [1, 2], dir: 'up' });
  eq(R.endTurn(r2.state).state.result, 'win', '2ターン目でも勝てる');
});
test('進む敵（移動と魔法のセット）: ターン1は (3,1) へ進むだけ。ターン2の終わりに (2,1) へ進んでそのまま撃ち、2ターンで失敗', function () {
  var s = tut1();
  var e = R.enemiesOf(s)[0];
  ok(!R.findUnit(s, e.id).intent, 'ターンの始めには予告を構えない（行動は敵の番にまとめて）');
  // ターン1: 進む先 (3,1) から真ん中 (1,1) は空き → 撃たない
  var fc1 = R.forecast(s);
  eq(fc1.marches.map(function (m) { return m.to; }), [[3, 1]], 'ターン1: 次に進むマス');
  eq(fc1.enemies, [], 'ターン1: 撃たない');
  var t1 = R.endTurn(R.act(s, tutPlayer(s).id, { dir: 'down' }).state);
  ok(!t1.events.some(function (ev) { return ev.type === 'cast' && ev.id === e.id; }), 'ターン1は撃っていない');
  var st = t1.state;
  eq(pos(st, e.id), [3, 1], 'ターン2: まだ森の中');
  // ターン2: 進む先 (2,1) から真ん中 (0,1) に構える味方 → 進んでそのまま撃つ、が予告に出る
  var fc = R.forecast(st);
  eq(fc.marches.map(function (m) { return m.to; }), [[2, 1]], 'ターン2: 森から出る');
  eq(fc.enemies.map(function (p) { return p.from; }), [[2, 1]], '進んだ先から撃つ');
  // 山は2マス先を真ん中に十字: (0,1) の構える味方と、(0,2) に立ったままの自分にも当たる（同じ法則）
  eq(fc.enemies[0].damages.map(function (d) { return [d.id, d.amount, d.dies]; }), [[tutNpc(st).id, 3, true], [tutPlayer(st).id, 3, true]], '予告: 構える味方に3（倒れる）');
  var t = R.endTurn(R.act(st, tutPlayer(st).id, { dir: 'down' }).state);
  eq([t.state.result, t.state.turn], ['lose', 2], 'ターン2で失敗');
  ok(/構える味方が倒れた/.test(t.state.resultText), t.state.resultText);
  // 倒れた構える味方 (0,1) と自分 (0,2) のマスにも山。(1,1)(0,0) も山
  eq([tile(t.state, 0, 1), tile(t.state, 0, 2), tile(t.state, 1, 1), tile(t.state, 0, 0)], ['mountain', 'mountain', 'mountain', 'mountain']);
  // ターン2に正解すれば、敵は動く前に森ごと燃えて勝つ
  eq(R.endTurn(R.act(st, tutPlayer(st).id, { to: [1, 2], dir: 'up' }).state).state.result, 'win', 'ターン2の正解で勝つ');
});
test('山を盛る魔法: 2マス先を真ん中に十字5マスへ一度で山。倒れた者のマスにも山、倒れなければ盛らない', function () {
  var s = empty(7);
  var e = R.addEnemy(s, 'mount', 3, 6, 'up');
  eq(sorted(R.shapeCells(s, 'mount', 3, 6, 'up')), sorted([[3, 5], [2, 4], [3, 4], [4, 4], [3, 3]]), '形');
  var weak = R.addAlly(s, 'fire', 2, 4); R.findUnit(s, weak.id).hp = 3;    // 3で倒れる
  var tough1 = R.addAlly(s, 'fire', 4, 4); R.findUnit(s, tough1.id).hp = 9; // 倒れない
  var r = R.act(s, R.addAlly(s, 'water', 0, 0).id, { dir: 'down', shoot: false });
  var st = r.state; R.findUnit(st, e.id).intent = true; st.enemyActs = true;
  var t = R.endTurn(st);
  var c = t.events.filter(function (ev) { return ev.type === 'cast' && ev.id === e.id; })[0];
  ok(c, '敵が撃った');
  eq([tile(t.state, 3, 5), tile(t.state, 3, 4), tile(t.state, 3, 3)], ['mountain', 'mountain', 'mountain'], '空きは山（丘ではない）');
  ok(!R.findUnit(t.state, weak.id), '3で倒れた');
  eq(tile(t.state, 2, 4), 'mountain', '倒れた者のマスにも山');
  eq([hp(t.state, tough1.id), tile(t.state, 4, 4)], [6, 'empty'], '倒れなければ山は盛らない');
});
test('構える味方が倒れたら失敗（ほかの味方が残っていても）', function () {
  var s = tut1();
  var r = R.act(s, tutPlayer(s).id, { dir: 'up' });   // 構える味方に直撃1（HP3 → 2）
  eq(r.state.result, null);
  var s2 = tut1();
  R.findUnit(s2, tutNpc(s2).id).hp = 1;
  var r2 = R.act(s2, tutPlayer(s2).id, { dir: 'up' });
  eq(r2.state.result, 'lose');
  ok(/構える味方が倒れた/.test(r2.state.resultText));
});
test('動かない敵: 移動しない・撃たない・予告を出さない', function () {
  var s0 = R.loadPreset('tut1');
  s0 = R.editSetPersona(s0, R.enemiesOf(s0)[0].id, 'stand', 'still').state;
  var s = R.startBattle(s0).state;
  var e = R.enemiesOf(s)[0];
  ok(!e.intent, '予告を出さない');
  eq(R.forecast(s).enemies, [], '予告がない');
  var st = s;
  for (var i = 1; i <= 3; i++) {
    var t = R.endTurn(R.act(st, tutPlayer(st).id, { dir: 'down' }).state);
    ok(!t.events.some(function (ev) { return ev.id === e.id && (ev.type === 'move' || ev.type === 'cast' || ev.type === 'intent'); }), 'ターン' + i);
    st = t.state;
  }
  eq(pos(st, e.id), [4, 1]);
  eq(R.planEnemy(st, R.findUnit(st, e.id)).kind, 'still');
});
test('このステージの風は、正面1マスのユニットを1マス押し出す（押した先が通れなければ動かない）', function () {
  var s = tut1();
  var p = tutPlayer(s);
  var t = R.endTurn(R.act(s, p.id, { to: [1, 1], dir: 'down', shoot: false }).state);   // 風の通り道で待つ
  eq(pos(t.state, p.id), [2, 1], '右へ1マス');
  eq(hp(t.state, p.id), 2, '直撃1');
  var s2 = tut1();
  R.setTile(s2, 2, 1, 'mountain');
  var t2 = R.endTurn(R.act(s2, tutPlayer(s2).id, { to: [1, 1], dir: 'down', shoot: false }).state);
  eq(pos(t2.state, tutPlayer(s2).id), [1, 1], '山があると動かない');
});

// ---------------------------------------------------------------
console.log('\n■ ステージ②「2人で守る」（IMPROVE_tutorial2）');
// 座標は (x, y)。6×6（10/17 に横5・縦11 から変えた）。山使い (0,5)・水使い (1,5)・村 (2,5)〜(5,5)・敵は (3,0)(4,0) から。突進は1ターンに1マス
// 勝てる一例: 山使いがその場で上 → 頂上 (0,3)、腕 (0,2) 上・(1,3) 右・(0,4) 下。水使いが (1,4) で上 → 右の腕 (1,3) に水 → (2,3)〜(5,3) に川
function tut2() { return R.startBattle(R.loadPreset('tut2')).state; }
// このステージの数値に足して始める
function tut2With(more) {
  var s = R.loadPreset('tut2');
  s.overrides = Object.assign({}, s.overrides, more);
  return R.startBattle(s).state;
}
function t2Mount(s) { return R.controllableOf(s).filter(function (a) { return a.magic === 'mount'; })[0]; }
function t2Water(s) { return R.controllableOf(s).filter(function (a) { return a.magic === 'water'; })[0]; }
function slopeAt(s, x, y) { return (s.slopes || {})[y * s.size + x]; }
// このステージの数値（山の頂上と腕・水は正面1マス）で動く、空の盤面
function slopeBoard(n) {
  var s = empty(n);
  s.overrides = { 'tutorial.slope': true, waterLength: 1 };
  return s;
}
// 十字の山（頂上 (3,4)、腕 (3,3) 上・(4,4) 右・(3,5) 下・(2,4) 左）を盛った 7×7。撃った山使いは盤から外す（下へ流れる川の邪魔をしないように）
function crossBoard() {
  var s = slopeBoard(7);
  var st = fire(s, R.addAlly(s, 'mount', 3, 6, 'up'), 'up').state;
  st.units = st.units.filter(function (u) { return u.magic !== 'mount'; });
  return st;
}
// 勝てる手順の一例（山 → 水）を打った盤面
function t2Solved(s) {
  var a = R.act(s, t2Mount(s).id, { dir: 'up' });
  return R.act(a.state, t2Water(a.state).id, { to: [1, 4], dir: 'up' }).state;
}
// 山と川を置くマス（先頭の敵がここにいると、ふさげない）
var T2_WALL = [[0, 2], [0, 3], [0, 4], [1, 3], [1, 4], [2, 3], [3, 3], [4, 3], [5, 3]];
// ターン終了を、勝負がつくか n 回まで
function t2Run(s, n) { for (var i = 0; i < n && !s.result; i++) s = R.endTurn(s).state; return s; }
test('盤面: 6×6。山使い・水使い（上向き）、村4つ（HP1）、突進の敵2体、お題は防衛（5ターン）', function () {
  var s0 = R.loadPreset('tut2');
  eq([s0.size, R.rowsOf(s0), s0.tiles.length, s0.h], [6, 6, 36, undefined]);
  ok(s0.tiles.every(function (t) { return t === 'empty'; }), '最初は山も川もない');
  eq([t2Mount(s0).x, t2Mount(s0).y, t2Mount(s0).facing, t2Water(s0).x, t2Water(s0).y, t2Water(s0).facing], [0, 5, 'up', 1, 5, 'up']);
  eq(R.objectsOf(s0, 'village').map(function (v) { return [v.x, v.y, v.hp]; }), [[2, 5, 1], [3, 5, 1], [4, 5, 1], [5, 5, 1]]);
  eq(R.enemiesOf(s0).map(function (e) { return [e.x, e.y, e.stand]; }), [[3, 0, 'rush'], [4, 0, 'rush']]);
  eq(s0.mission.type, 'defense');
  eq(R.missionInfo(s0).win, 'ターン5の終わりまで村を守る（村への道をふさいだら、その場でクリアにできる。敵の全滅でも勝ち）');
  eq(R.magicName('mount'), '山', '土の魔法は「山」と表示');
  ok(R.TUTORIALS.some(function (t) { return t.id === 'tut2' && t.tutorial === 2 && /2人で守る/.test(t.name); }), 'チュートリアルの一覧に入っている');
  ok(!R.inBounds(s0, 6, 0) && R.inBounds(s0, 5, 5) && !R.inBounds(s0, 0, 6), '盤の外');
  eq(R.withOverrides(s0, function () { return B.enemy.rushMove; }), 1, '突進は1ターンに1マス（このステージだけ）');
});
test('JSON の書き出し・読み込みで増援と突進の敵が残る。横長の盤面（③）は縦の大きさが残り、大きさを変えると正方形に戻る', function () {
  var s = R.loadPreset('tut2');
  var r = R.importLayout(R.exportLayout(s));
  ok(r.ok, r.error);
  eq([r.state.size, R.rowsOf(r.state), r.state.tiles.length], [6, 6, 36]);
  eq(r.state.spawn, s.spawn, '増援の出てくる所');
  eq(R.enemiesOf(r.state).map(function (e) { return e.stand; }), ['rush', 'rush'], '突進の敵');
  var d = JSON.parse(R.exportLayout(s)); d.tiles.pop();
  ok(!R.importLayout(d).ok, '地形の数が合わない');
  eq(JSON.parse(R.exportLayout(R.loadPreset('spread'))).h, undefined, '正方形の盤面には h がない');
  var w = R.loadPreset('ex3');
  var rw = R.importLayout(R.exportLayout(w));
  ok(rw.ok, rw.error);
  eq([rw.state.size, R.rowsOf(rw.state), rw.state.tiles.length], [12, 7, 84], '横長の盤面');
  var rs = R.editResize(w, 6).state;
  eq([rs.size, R.rowsOf(rs), rs.h], [6, 6, undefined]);
});
test('山の魔法: 正面2マス先が頂上、上下左右が腕の十字。腕に下り坂の向き、頂上に「peak」の印', function () {
  var st = crossBoard();
  ok([[3, 5], [2, 4], [3, 4], [4, 4], [3, 3]].every(function (c) { return tile(st, c[0], c[1]) === 'mountain'; }), '十字の山');
  eq([slopeAt(st, 3, 4), slopeAt(st, 3, 3), slopeAt(st, 4, 4), slopeAt(st, 3, 5), slopeAt(st, 2, 4)], ['peak', 'up', 'right', 'down', 'left'], '頂上と腕');
});
test('山の魔法: 腕が盤の外に出るなら、その腕だけなくなる（ステージでは T 字）。山は通れない', function () {
  var s = tut2();
  var r = fire(s, t2Mount(s), 'up');
  eq([slopeAt(r.state, 0, 3), slopeAt(r.state, 0, 2), slopeAt(r.state, 1, 3), slopeAt(r.state, 0, 4)], ['peak', 'up', 'right', 'down'], '頂上 (0,3)、腕 (0,2)(1,3)(0,4)');
  eq(r.state.tiles.filter(function (t) { return t === 'mountain'; }).length, 4, 'T 字の4マス');
  ok(!R.isPassable('mountain'));
});
test('山の魔法: 置くマスの水たまり・川は泥沼になり、頂上・腕の印もつかない。山でなくなったマスから印は消える', function () {
  var s = slopeBoard(7);
  R.setTile(s, 4, 4, 'puddle');
  R.setTile(s, 2, 4, 'river');
  var st = fire(s, R.addAlly(s, 'mount', 3, 6, 'up'), 'up').state;
  eq([tile(st, 4, 4), slopeAt(st, 4, 4), tile(st, 2, 4), slopeAt(st, 2, 4)], ['mud', undefined, 'mud', undefined]);
  R.setTile(st, 3, 3, 'empty');
  eq(slopeAt(st, 3, 3), undefined, '山でなくなったら印も消える');
});
test('水: 空きに撃つと、このステージでは水たまり1マス（標準は水たまり2マス）', function () {
  var s = tut2();
  var r = fire(s, t2Water(s), 'up');
  eq([tile(r.state, 1, 4), tile(r.state, 1, 3)], ['puddle', 'empty']);
  var o = empty(6);
  var r2 = fire(o, R.addAlly(o, 'water', 2, 5), 'up');
  eq([tile(r2.state, 2, 4), tile(r2.state, 2, 3)], ['puddle', 'puddle'], 'ほかのシナリオは標準の水たまり2マス');
});
test('水: 山の腕に当てると、その腕の次のマスから頂上と反対の向きへ盤の端まで川（水の向きではなく、山の高さで決まる）', function () {
  // 上の腕 (3,3) に右向きで当てる → 川は上へ (3,2)〜(3,0)
  var st = crossBoard();
  var r = R.act(st, R.addAlly(st, 'water', 2, 3, 'right').id, { dir: 'right' });
  ok(/山の腕に当たって、頂上と反対の上へ川が流れ出した/.test(r.events[0].text), r.events[0].text);
  eq([tile(r.state, 3, 2), tile(r.state, 3, 1), tile(r.state, 3, 0), tile(r.state, 4, 3)], ['river', 'river', 'river', 'empty'], '上へ盤の端まで。水の向き（右）には流れない');
  eq(tile(r.state, 3, 3), 'mountain', '腕は山のまま');
  // 右の腕 (4,4) に下向きで当てる → 川は右へ (5,4)(6,4)
  var st2 = crossBoard();
  var r2 = R.act(st2, R.addAlly(st2, 'water', 4, 3, 'down').id, { dir: 'down' });
  eq([tile(r2.state, 5, 4), tile(r2.state, 6, 4), tile(r2.state, 4, 5)], ['river', 'river', 'empty'], '右へ');
  // 下の腕 (3,5) に左向きで当てる → 川は下へ (3,6)
  var st3 = crossBoard();
  var r3 = R.act(st3, R.addAlly(st3, 'water', 4, 5, 'left').id, { dir: 'left' });
  eq([tile(r3.state, 3, 6), tile(r3.state, 2, 5)], ['river', 'empty'], '下へ1マス流れて盤の端');
});
test('水: ステージの右の腕 (1,3) に当てると、右へ (2,3)〜(5,3) に川が流れて4行目が端から端までふさがる', function () {
  var st = t2Solved(tut2());
  eq([0, 1, 2, 3, 4, 5].map(function (x) { return tile(st, x, 3); }), ['mountain', 'mountain', 'river', 'river', 'river', 'river']);
  ok(!R.isPassable('river'), '川は通れない');
});
test('水: 山の頂上に当たると、すべての腕から川が流れる（十字なら4本。法則として）', function () {
  var st = crossBoard();
  // 丘の上から撃つと1マス先から流れる（高台）。(1,4) の丘から右へ → 左の腕 (2,4) の次、頂上 (3,4) に当たる
  R.setTile(st, 1, 4, 'hill');
  var r = R.act(st, R.addAlly(st, 'water', 1, 4, 'right').id, { dir: 'right' });
  ok(/山の頂上に当たって、4つの腕から川が流れ出した/.test(r.events[0].text), r.events[0].text);
  eq([tile(r.state, 3, 2), tile(r.state, 3, 0)], ['river', 'river'], '上の腕から上へ盤の端まで');
  eq([tile(r.state, 5, 4), tile(r.state, 6, 4)], ['river', 'river'], '右の腕から右へ');
  eq(tile(r.state, 3, 6), 'river', '下の腕から下へ');
  eq(tile(r.state, 1, 4), 'hill', '左の腕からの川は、丘の上の自分の手前で止まる');
});
test('川はユニット・村の手前で止まる（ダメージはない）', function () {
  // 上の腕 (3,3) から上へ: (3,1) に敵 → (3,2) まで
  var st = crossBoard();
  var e = R.addEnemy(st, 'earth', 3, 1, 'down');
  var r = R.act(st, R.addAlly(st, 'water', 2, 3, 'right').id, { dir: 'right' });
  eq([tile(r.state, 3, 2), tile(r.state, 3, 1)], ['river', 'empty']);
  ok(/敵Aの手前で止まった/.test(r.events[0].text), r.events[0].text);
  eq(hp(r.state, e.id), B.enemy.hp, 'ダメージはない');
  // 右の腕 (4,4) から右へ: (6,4) に村 → (5,4) まで
  var st2 = crossBoard();
  R.addObject(st2, 'village', 6, 4);
  var r2 = R.act(st2, R.addAlly(st2, 'water', 4, 3, 'down').id, { dir: 'down' });
  eq([tile(r2.state, 5, 4), tile(r2.state, 6, 4)], ['river', 'empty']);
  ok(/村の手前で止まった/.test(r2.events[0].text), r2.events[0].text);
  eq(R.objectsOf(r2.state, 'village')[0].hp, 1, '村は壊れない');
});
test('突進の敵: 人は無視して一番近い村へ、このステージでは1ターンに1マス。魔法は撃たず、予告も出さない', function () {
  var s = tut2();
  var es = R.enemiesOf(s);
  eq(es.map(function (e) { return [e.x, e.y]; }), [[3, 1], [4, 1]], '最初の移動のあと（どちらもまっすぐ1マス）');
  ok(es.every(function (e) { return !e.intent; }), '予告を出さない');
  eq(R.forecast(s).enemies, [], '魔法の予告はない');
  eq(R.planEnemy(s, es[0]).kind, 'rush');
  var t = R.endTurn(s);
  ok(!t.events.some(function (e) { return e.type === 'cast'; }), '撃たない');
  eq(t.events.filter(function (e) { return e.type === 'move'; })[0].text, '敵Aが村へ向かって1マス走った');
});
test('突進の敵: 山・川・水たまり・泥沼・ユニットのいるマスは通らず、回り道する', function () {
  ['mountain', 'river', 'puddle', 'mud', 'unit'].forEach(function (wall) {
    var s = R.loadPreset('tut2');
    s.units = s.units.filter(function (u) { return u.side !== 'enemy'; });
    var e = R.addEnemy(s, 'earth', 3, 1, 'down'); e.stand = 'rush';
    if (wall === 'unit') R.addEnemy(s, 'earth', 3, 2, 'down');
    else R.setTile(s, 3, 2, wall);
    var r = R.rushRoute(s, R.findUnit(s, e.id));
    ok(r.reach && !r.path.some(function (c) { return c[0] === 3 && c[1] === 2; }), wall + ' を通らない: ' + JSON.stringify(r.path));
    eq(r.path.length, 4, wall + ': 回り道で4マス（まっすぐなら3マス）');
  });
});
test('突進の敵: 道がなければ、届くマスのうち村に一番近いマスまで走って待つ（そこにいればその場で待つ）', function () {
  var st = t2Solved(tut2());
  var fc = R.forecast(st);
  var b = fc.rushes.filter(function (r) { return r.id === R.enemiesOf(st)[1].id; })[0];
  eq([b.reach, b.path, b.stop], [false, [[4, 2]], 1], 'B は川の手前 (4,2) まで');
  var st2 = R.endTurn(st).state;
  eq(pos(st2, b.id), [4, 2]);
  var t = R.endTurn(st2);
  ok(t.events.some(function (e) { return e.text === '敵Bは村への道がないので、その場で待った'; }), '川の手前に着いたら、その場で待つ');
  eq(pos(t.state, b.id), [4, 2]);
});
test('突進の敵: enemy.rushNoPath を wait にすると、道がなければ今いる所で待つ（仕様の文どおりの動き）', function () {
  var st = t2Solved(tut2With({ 'enemy.rushNoPath': 'wait' }));
  ok(R.forecast(st).rushes.every(function (r) { return !r.reach && r.path.length === 0; }), 'どの敵も走らない');
  var t = R.endTurn(st);
  eq(R.enemiesOf(t.state).map(function (e) { return [e.x, e.y]; }), [[3, 1], [4, 1], [3, 0]], '増援も出てきた所で待つ');
  eq(B.enemy.rushNoPath, 'approach', '標準は approach のまま');
});
test('突進の敵: 走り終えて村の隣にいたら、体当たりで村を壊す（予告なし）→ 防衛は負け', function () {
  var st = t2Run(tut2(), 3);   // 何もしない
  eq([st.result, st.turn], ['lose', 4], '4ターン目の敵の移動で負け');
  ok(/村が壊された/.test(st.resultText));
  var t = R.endTurn(R.endTurn(R.endTurn(tut2()).state).state);
  var ram = t.events.filter(function (e) { return e.type === 'ram'; })[0];
  ok(ram && ram.text === '敵Aが村2に体当たりした', ram && ram.text);
});
test('進む道: 村へ届く道なら村に印。撃ったあとの盤面で計算し直す（道をふさぐと届かなくなる）', function () {
  var s = tut2();
  var vs = R.objectsOf(s, 'village');
  var fc = R.forecast(s);
  eq(fc.rushes.filter(function (r) { return R.findUnit(s, r.id); }).map(function (r) { return [r.reach, r.village]; }), [[true, vs[1].id], [true, vs[2].id]], '最初は2体とも村へ届く');
  eq(fc.rushes[1].path, [[4, 2], [4, 3], [4, 4]], 'B の道');
  var a = R.act(s, t2Mount(s).id, { dir: 'up' });
  ok(R.forecast(a.state).rushes.some(function (r) { return r.reach; }), '山だけではまだ届く');
  var pv = R.previewAct(a.state, t2Water(a.state).id, [1, 4], 'up');
  ok(R.forecast(pv.state).rushes.every(function (r) { return !r.reach; }), '水を構えた予測の盤面では、どの敵も届かない');
  var pvBad = R.previewAct(a.state, t2Water(a.state).id, [1, 4], 'left');   // 下の腕 (0,4) に撃つ
  ok(R.forecast(pvBad.state).rushes.some(function (r) { return r.reach; }), '違う腕では届いたまま');
});
test('山 → 水 でふさいだあと「クリア」しなくても、敵は村に届かず、5ターンしのいで勝つ', function () {
  var st = t2Solved(tut2());
  for (var turn = 1; turn <= 5; turn++) {
    var t = R.endTurn(st);
    ok(!t.events.some(function (e) { return e.type === 'ram'; }), 'ターン' + turn + ': 体当たりはない');
    st = t.state;
    if (turn < 5) eq(st.result, null, 'ターン' + turn + ' はまだ続く');
  }
  eq([st.result, st.turn], ['win', 5]);
  eq(R.objectsOf(st, 'village').length, 4, '村は全部残っている');
  ok(R.enemiesOf(st).every(function (e) { return e.y <= 2; }), '敵は全員4行目より上');
  eq(R.enemiesOf(st).length, 6, '増援で6体に増えている（ターン1〜4の終わりに1体ずつ）');
});
test('1ターン目に何もしなくても、2ターン目に同じ手順を打てば間に合って勝つ', function () {
  var st = R.endTurn(tut2()).state;
  eq([st.result, st.turn], [null, 2]);
  ok(R.enemiesOf(st).every(function (e) { return e.y < 3 && !R.inCells(T2_WALL, e.x, e.y); }), '2ターン目の始めも、敵は山・川を置くマスをふさいでいない');
  eq(t2Run(t2Solved(st), 5).result, 'win');
  var st3 = R.endTurn(st).state;
  eq(t2Run(t2Solved(st3), 5).result, 'lose', '3ターン目では遅い（先頭の敵が川を置くマスにいる）');
});
test('1ターン目の敵の移動のあと、先頭の敵は山・川を置くマスをふさいでいない', function () {
  var s = tut2();
  ok(R.enemiesOf(s).every(function (e) { return e.y < 3 && !R.inCells(T2_WALL, e.x, e.y); }));
});
test('水 → 山の順: 腕のマスが水たまり → 泥沼（腕にならない）。2ターン目に立て直せる', function () {
  var s = tut2();
  var w = R.act(s, t2Water(s).id, { to: [1, 4], dir: 'up' });
  eq(tile(w.state, 1, 3), 'puddle');
  var m = R.act(w.state, t2Mount(w.state).id, { dir: 'up' });
  eq([tile(m.state, 1, 3), slopeAt(m.state, 1, 3)], ['mud', undefined], '泥沼');
  var st = R.endTurn(m.state).state;
  eq(st.result, null, '1ターン目では負けない');
  // 立て直しの一例: 山使いが (1,5) へ動いて上に山（真ん中 (1,3) は泥沼のまま、右の腕 (2,3) ができる）→ 水使いが (2,4) から上の右の腕に水 → 右へ川
  var a = R.act(st, t2Mount(st).id, { to: [1, 5], dir: 'up' });
  eq(slopeAt(a.state, 2, 3), 'right', '右の腕');
  var b = R.act(a.state, t2Water(a.state).id, { to: [2, 4], dir: 'up' });
  eq([tile(b.state, 3, 3), tile(b.state, 4, 3), tile(b.state, 5, 3)], ['river', 'river', 'river']);
  ok(b.ok, b.error);
  eq(t2Run(b.state, 5).result, 'win', '2ターン目に立て直して勝つ');
});
test('増援: 毎ターンの終わりに上の端 (3,0) から1体。ふさがっていたら出られない。overrides で切れる', function () {
  var t = R.endTurn(t2Solved(tut2()));
  var sp = t.events.filter(function (e) { return e.type === 'spawn'; });
  eq(sp.length, 1);
  eq(sp[0].cells, [[3, 0]]);
  ok(R.enemiesOf(t.state).some(function (e) { return e.id === sp[0].id && e.stand === 'rush' && e.y > 0; }), '現れた敵は次のターンの始めに走る');
  var t2 = R.endTurn(t2Solved(tut2With({ 'tutorial.spawn': false })));
  ok(!t2.events.some(function (e) { return e.type === 'spawn'; }), '切ると増えない');
  var s3 = t2Solved(tut2());
  R.addEnemy(s3, 'earth', 3, 0, 'down');   // 出てくる所に誰かいる
  ok(R.endTurn(s3).events.some(function (e) { return /増援は出られなかった/.test(e.text); }));
});
test('ふさぎきったら、キーで（claimSeal）最後のターンを待たずにクリアにできる。勝手には勝たない', function () {
  var s = tut2();
  var a = R.act(s, t2Mount(s).id, { dir: 'up' });
  ok(!R.sealReady(a.state), '山だけでは、まだ右から回れる');
  ok(!R.claimSeal(a.state).ok, 'ふさいでいないとクリアにできない');
  var b = R.act(a.state, t2Water(a.state).id, { to: [1, 4], dir: 'up' });
  eq([b.state.result, R.sealReady(b.state)], [null, true], 'ふさいだ。まだ勝ちにはしない');
  var c = R.claimSeal(b.state);
  ok(c.ok, c.error);
  eq([c.state.result, c.state.turn, c.state.resultText], ['win', 1, '村への道をふさいだ！（勝利）']);
  ok(c.events.some(function (e) { return e.type === 'result' && e.result === 'win'; }), '勝ちの出来事');
  eq(b.state.result, null, '元の状態は変えない');
  var later = R.endTurn(b.state).state;
  ok(!later.result && R.sealReady(later), 'クリアせずにターンを続けても、ふさいだまま（あとからでもクリアにできる）');
});
test('ふさいだかは地形だけで見る: 味方が道に立っているだけでは、ふさいだことにならない', function () {
  var s = tut2();
  [2, 3, 4].forEach(function (x) { R.setTile(s, x, 3, 'river'); });
  var w = t2Water(s); w.x = 5; w.y = 3;   // 残った (5,3) に水使いが立つ
  ok(!R.sealReady(R.act(s, t2Mount(s).id, { dir: 'up' }).state), '人が立っているだけ');
  var s2 = tut2();
  [2, 3, 4, 5].forEach(function (x) { R.setTile(s2, x, 3, 'river'); });
  ok(R.sealReady(R.act(s2, t2Mount(s2).id, { dir: 'up' }).state), '川で埋まっていれば、ふさいだ');
});
test('ふさいだかは増援の出てくる所も数える。泥沼もふさぐ', function () {
  var s = tut2();
  [2, 3, 4, 5].forEach(function (x) { R.setTile(s, x, 3, 'river'); });
  s.spawn.y = 4;   // 壁の内側から湧くなら、ふさいだことにならない
  ok(!R.sealReady(R.act(s, t2Mount(s).id, { dir: 'up' }).state), '増援の出てくる所から村へ行ける');
  var s2 = tut2();
  [2, 3, 4].forEach(function (x) { R.setTile(s2, x, 3, 'river'); });
  R.setTile(s2, 5, 3, 'mud');
  ok(R.sealReady(R.act(s2, t2Mount(s2).id, { dir: 'up' }).state), '突進の敵は泥沼を通らない');
});
test('ふさいでクリアはステージ②だけ（標準の防衛は切）', function () {
  var s = R.startBattle(R.loadPreset('mDefense')).state;
  eq(R.withOverrides(s, function () { return B.mission.defense.sealWin; }), false);
  ok(!/ふさい/.test(R.missionInfo(s).win), R.missionInfo(s).win);
  ok(!R.sealReady(s), 'ふさいだことにならない');
});
test('やり直し: 負けたあと最初からやり直すと、盤面が最初に戻り、ヒントが1文出る（最初の挑戦では出ない）', function () {
  var s = tut2();
  eq(R.stageHint(s), null, '最初は出ない');
  var lost = t2Run(s, 3);
  eq(lost.result, 'lose');
  var r = R.retryStage(lost);
  ok(r && r.ok);
  eq([r.state.turn, r.state.result, r.state.tries], [1, null, 1]);
  eq(r.state.tiles, tut2().tiles, '盤面が最初に戻る');
  eq(r.state.units.map(function (u) { return [u.x, u.y, u.hp]; }), tut2().units.map(function (u) { return [u.x, u.y, u.hp]; }), 'ユニットも最初に戻る（敵の最初の移動まで）');
  eq(R.stageHint(r.state), require('../texts.js').stages.tut2.hint.single);   // 文は texts.js（IMPROVE_simul）。今は「山に向かって水を撃つと…？」
  eq(R.retryStage(t2Run(r.state, 3)).state.tries, 2, '何度でも');
  eq(R.retryStage(R.startBattle(R.loadPreset('spread')).state), null, 'チュートリアルでなければ、やり直しはない');
});
test('overrides: このシナリオの中だけで効き、ほかのシナリオと BALANCE に漏れない', function () {
  var before = JSON.stringify(B);
  var st = t2Solved(tut2());
  R.endTurn(st); R.forecast(st);
  eq(JSON.stringify(B), before, 'BALANCE は元のまま');
  eq([B.tutorial.slope, B.waterLength, B.ally.move, B.enemy.rushMove, B.mission.defense.sealWin], [false, 2, 2, 3, false]);
  // ほかのシナリオ: 山の魔法に頂上・腕の印はつかず、山に水は今どおり（向きの奥へ源流）
  var o = empty(7);
  var st2 = fire(o, R.addAlly(o, 'mount', 3, 6, 'up'), 'up').state;
  eq(st2.slopes, undefined, '頂上・腕の印はない');
  var r = R.act(st2, R.addAlly(st2, 'water', 2, 3, 'right').id, { dir: 'right' });
  eq([tile(r.state, 3, 3), tile(r.state, 4, 3), tile(r.state, 6, 3), tile(r.state, 3, 2)], ['mountain', 'river', 'river', 'empty'], '今どおり、山を越えて向きの奥へ川');
});

// ---------------------------------------------------------------
console.log('\n' + passed + ' 件成功 / ' + failed.length + ' 件失敗');
if (failed.length) {
  console.log('失敗: ' + failed.join(' / '));
  process.exitCode = 1;
}
