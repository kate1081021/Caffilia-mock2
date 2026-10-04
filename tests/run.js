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
//   . 空き  F 森  M 山  R 川  X 炎  s 小さな炎  G マグマ  D 泥沼
// ---------------------------------------------------------------
var CH = { '.': 'empty', F: 'forest', M: 'mountain', R: 'river', X: 'fire', s: 'smallfire', G: 'magma', D: 'mud' };
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
test('火の形が4方向で正しく回転する', function () {
  var s = empty(9);
  eq(R.shapeCells(s, 'fire', 4, 4, 'up'), [[4, 3], [4, 1]], '上');
  eq(R.shapeCells(s, 'fire', 4, 4, 'right'), [[5, 4], [7, 4]], '右');
  eq(R.shapeCells(s, 'fire', 4, 4, 'down'), [[4, 5], [4, 7]], '下');
  eq(R.shapeCells(s, 'fire', 4, 4, 'left'), [[3, 4], [1, 4]], '左');
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

test('置く: ユニットがいるマスは直撃だけで自然は変わらない', function () {
  var s = empty(6);
  var a = R.addAlly(s, 'grass', 2, 5);
  var e = R.addEnemy(s, 'fire', 2, 3);       // (0,2) のマス
  var r = fire(s, a, 'up');
  eq(tile(r.state, 2, 3), 'empty', '敵のマス');
  eq(hp(r.state, e.id), B.enemy.hp - B.ally.power);
  eq([tile(r.state, 1, 2), tile(r.state, 2, 2), tile(r.state, 3, 2)], ['forest', 'forest', 'forest']);
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
test('点ける: 空き→小さな炎、森→炎、山→マグマ', function () {
  var s = board(['......', '..M...', '......', '..F...', '......', '......']);
  var a = R.addAlly(s, 'fire', 2, 4);    // (2,3) と (2,1)
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 3), tile(r.state, 2, 1)], ['fire', 'magma']);
  var s2 = empty(6);
  var a2 = R.addAlly(s2, 'fire', 2, 5);
  var r2 = fire(s2, a2, 'up');
  eq([tile(r2.state, 2, 4), tile(r2.state, 2, 2)], ['smallfire', 'smallfire']);
});
test('点ける: 森の上の敵には直撃＋森が燃える', function () {
  var s = board(['......', '......', '......', '..F...', '......', '......']);
  var a = R.addAlly(s, 'fire', 2, 4);
  var e = R.addEnemy(s, 'fire', 2, 3);
  var r = fire(s, a, 'up');
  eq(tile(r.state, 2, 3), 'fire');
  eq(hp(r.state, e.id), B.enemy.hp - B.ally.power);
});

console.log('\n■ 流れる（水）');

test('空きを川にして4マス進む', function () {
  var s = empty(6);
  var a = R.addAlly(s, 'water', 2, 5);
  var r = fire(s, a, 'up');
  eq([4, 3, 2, 1].map(function (y) { return tile(r.state, 2, y); }), ['river', 'river', 'river', 'river']);
  eq(tile(r.state, 2, 0), 'empty', '5マス目は届かない');
});
test('川を越えて進む（川もマス数に数える）', function () {
  var s = board(['......', '......', '......', '..R...', '......', '......']);
  var a = R.addAlly(s, 'water', 2, 5);
  var r = fire(s, a, 'up');
  eq([4, 3, 2, 1, 0].map(function (y) { return tile(r.state, 2, y); }), ['river', 'river', 'river', 'river', 'empty']);
});
test('ユニットで止まって直撃', function () {
  var s = empty(6);
  var a = R.addAlly(s, 'water', 2, 5);
  var e = R.addEnemy(s, 'fire', 2, 3);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 4), tile(r.state, 2, 3), tile(r.state, 2, 2)], ['river', 'empty', 'empty']);
  eq(hp(r.state, e.id), B.enemy.hp - B.ally.power);
});
test('炎を消して止まる', function () {
  var s = board(['......', '......', '......', '..X...', '......', '......']);
  var a = R.addAlly(s, 'water', 2, 5);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 4), tile(r.state, 2, 3), tile(r.state, 2, 2)], ['river', 'empty', 'empty']);
});
test('マグマで水蒸気爆発（3×3に10、マグマは空きに）', function () {
  var s = board(['......', '......', '..G...', '......', '......', '......']);
  var a = R.addAlly(s, 'water', 2, 5);
  var e = R.addEnemy(s, 'fire', 3, 1);
  var far = R.addEnemy(s, 'fire', 5, 1);
  var r = fire(s, a, 'up');
  eq(names(r.events, 'finisher'), ['水蒸気爆発']);
  eq(tile(r.state, 2, 2), 'empty');
  eq(hp(r.state, e.id), B.enemy.hp - B.steam.damage);
  eq(hp(r.state, far.id), B.enemy.hp, '範囲外');
  eq([tile(r.state, 2, 4), tile(r.state, 2, 3)], ['river', 'river']);
});
test('森・山で止まって何も起きない', function () {
  var s = board(['......', '......', '..F...', '......', '......', '......']);
  var a = R.addAlly(s, 'water', 2, 5);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 2), tile(r.state, 2, 1)], ['forest', 'empty']);
  var s2 = board(['......', '......', '..M...', '......', '......', '......']);
  var a2 = R.addAlly(s2, 'water', 2, 5);
  eq(tile(fire(s2, a2, 'up').state, 2, 1), 'empty');
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
  eq([hp(r.state, near.id), hp(r.state, farE.id)], [19, 19]);
});
test('押せないとき（盤の端・ユニット・通れないマス）はダメージだけ', function () {
  var s = empty(6);
  var a = R.addAlly(s, 'wind', 2, 4);
  var e = R.addEnemy(s, 'fire', 2, 0);
  var r = fire(s, a, 'up');
  eq(pos(r.state, e.id), [2, 0]);
  eq(hp(r.state, e.id), 19);
  // 盤の端の川は運べないので、その手前の敵も押せない
  var s2 = board(['..R...', '......', '......', '......', '......', '......']);
  var a2 = R.addAlly(s2, 'wind', 2, 5);
  var e2 = R.addEnemy(s2, 'fire', 2, 1);
  eq(pos(fire(s2, a2, 'up').state, e2.id), [2, 1], '川の手前');
});
test('奥の川が先に運ばれると、空いたマスへ敵を押せる（遠い方から処理）', function () {
  var s = board(['......', '..R...', '......', '......', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 5);
  var e = R.addEnemy(s, 'fire', 2, 2);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 0), pos(r.state, e.id)], ['river', [2, 1]]);
});
test('押した先が泥沼ならはまる', function () {
  var s = board(['......', '......', '..D...', '......', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 5);
  var e = R.addEnemy(s, 'fire', 2, 3);
  var r = fire(s, a, 'up');
  eq(pos(r.state, e.id), [2, 2]);
  eq(R.findUnit(r.state, e.id).stuck, true);
});
test('川を1マス運ぶ（運んだ先が空きのときだけ）', function () {
  var s = board(['......', '......', '......', '..R...', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 5);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 3), tile(r.state, 2, 2)], ['empty', 'river']);
  var s2 = board(['......', '......', '..F...', '..R...', '......', '......']);
  var a2 = R.addAlly(s2, 'wind', 2, 5);
  var r2 = fire(s2, a2, 'up');
  eq([tile(r2.state, 2, 3), tile(r2.state, 2, 2)], ['river', 'forest'], '先が森なら動かない');
});
test('炎に当たって燃え広がり（その先へは風が届かない）', function () {
  var s = board(['......', '......', '..X...', '......', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 5);
  var r = fire(s, a, 'up');
  eq(names(r.events, 'finisher'), ['燃え広がり']);
  eq(tile(r.state, 2, 2), 'fire', '起点の炎はそのまま');
  eq([tile(r.state, 2, 1), tile(r.state, 2, 0)], ['smallfire', 'smallfire'], '通り道の空きは小さな炎');
});

console.log('\n■ 燃え広がり');

test('小さな炎からでも起きる', function () {
  var s = board(['......', '......', '..s...', '......', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 5);
  eq(names(fire(s, a, 'up').events, 'finisher'), ['燃え広がり']);
});
test('起点にいる者は押されずにダメージを受ける', function () {
  var s = board(['......', '......', '..s...', '......', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 5);
  var e = R.addEnemy(s, 'fire', 2, 2);
  var r = fire(s, a, 'up');
  eq(pos(r.state, e.id), [2, 2]);
  eq(hp(r.state, e.id), B.enemy.hp - B.spread.baseDamage);
});
test('通り道の空きが小さな炎になり、最大4マス', function () {
  var s = board(['.........', '.........', '.........', '.........', '.........', '..X......', '.........', '.........', '.........']);
  var a = R.addAlly(s, 'wind', 2, 8);
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
test('つながった森が全部燃え、ダメージ＝4＋森の数×2、味方も巻き込む', function () {
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
  var dmg = B.spread.baseDamage + 4 * B.spread.perForest;
  eq(dmg, 12);
  eq(hp(r.state, e.id), B.enemy.hp - 12);
  eq(R.findUnit(r.state, friend.id), null, '味方も巻き込まれて倒れる');
});

console.log('\n■ 1発の中のダメージは1回');

test('風で炎の起点へ押し込まれても、ダメージは大きい方の1回だけ', function () {
  var s = board(['......', '......', '..X...', '......', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 5);
  var e = R.addEnemy(s, 'fire', 2, 3);
  var r = fire(s, a, 'up');
  eq(pos(r.state, e.id), [2, 2], '起点に押し込まれた');
  eq(hp(r.state, e.id), B.enemy.hp - B.spread.baseDamage, '直撃1＋燃え広がり4 ではなく 4 だけ');
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

console.log('\n■ 敵の行動');

test('味方に当たる位置があれば、そこへ動いて撃つ', function () {
  var s = empty(6, true);
  var e = R.addEnemy(s, 'fire', 2, 0);
  var a = R.addAlly(s, 'water', 2, 5);
  var r = R.endTurn(s);
  ok(r.events.some(function (ev) { return ev.type === 'death' && ev.id === a.id; }), '味方に3ダメージで倒れる');
  eq(pos(r.state, e.id), [2, 2]);
  eq(R.findUnit(r.state, e.id).facing, 'down');
});
test('当たる数が多い位置を選ぶ', function () {
  var s = empty(7, true);
  var e = R.addEnemy(s, 'water', 3, 0);
  var a1 = R.addAlly(s, 'fire', 0, 2);
  var a2 = R.addAlly(s, 'fire', 6, 2);
  R.addAlly(s, 'fire', 3, 4);
  var plan = R.planEnemy(s, R.findUnit(s, e.id));
  eq(plan.kind, 'attack');
  eq(plan.hits, 1);
  ok(a1 && a2);
});
test('当たる位置がなければ、一番近い味方へ近づいてその方を向いて撃つ', function () {
  var s = empty(6, true);
  var e = R.addEnemy(s, 'fire', 0, 0);
  R.addAlly(s, 'water', 5, 5);
  var r = R.endTurn(s);
  eq(pos(r.state, e.id), [2, 0]);
  eq(R.findUnit(r.state, e.id).facing, 'down', '縦の差が大きい');
  eq([tile(r.state, 2, 1), tile(r.state, 2, 3)], ['smallfire', 'smallfire']);
});
test('道がなければ、その場で一番近い味方の方を向いて撃つ', function () {
  var s = board(['......', '......', '......', 'MMMMMM', '......', '......'], true);
  var e = R.addEnemy(s, 'water', 2, 0);
  R.addAlly(s, 'fire', 2, 5);
  var r = R.endTurn(s);
  eq(pos(r.state, e.id), [2, 0]);
  eq(R.findUnit(r.state, e.id).facing, 'down');
  ok(r.events.some(function (ev) { return /道がない/.test(ev.text); }));
  eq(tile(r.state, 2, 1), 'river', '撃った');
});
test('敵の火が森を燃やす', function () {
  var s = board(['......', '......', '......', '..F...', '......', '......'], true);
  var e = R.addEnemy(s, 'fire', 2, 0);
  R.addAlly(s, 'water', 2, 5);
  var r = R.endTurn(s);
  eq(pos(r.state, e.id), [2, 2]);
  eq(tile(r.state, 2, 3), 'fire');
});
test('泥沼にはまった敵は移動できないが撃つ', function () {
  var s = board(['......', '......', '......', '......', '......', '......'], true);
  var e = R.addEnemy(s, 'fire', 0, 0);
  R.findUnit(s, e.id).stuck = true;
  R.addAlly(s, 'water', 5, 5);
  var r = R.endTurn(s);
  eq(pos(r.state, e.id), [0, 0]);
  ok(r.events.some(function (ev) { return ev.type === 'cast' && ev.id === e.id; }));
  ok(!R.findUnit(r.state, e.id).stuck);
});
test('「何もしない」設定では行動しない', function () {
  var s = empty(6, false);
  var e = R.addEnemy(s, 'fire', 2, 0);
  R.addAlly(s, 'water', 2, 5);
  eq(pos(R.endTurn(s).state, e.id), [2, 0]);
});

console.log('\n■ 予測・導き・予告');

test('予測: 移動先と向きから、変化とダメージが分かる', function () {
  var s = board(['......', '......', '..s...', '......', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 5);
  var e = R.addEnemy(s, 'fire', 2, 1);
  var p = R.previewAct(s, a.id, [2, 4], 'up');
  eq(p.finishers[0].name, '燃え広がり');
  eq(p.damages.filter(function (d) { return d.id === e.id; })[0].amount, 4);
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
test('予告: 敵の動きと撃つマス、燃え移る森、炎の上のダメージ', function () {
  var s = board(['......', '......', '......', '..XF..', '......', '......'], true);
  var e = R.addEnemy(s, 'fire', 2, 0);
  R.addAlly(s, 'water', 2, 5);
  var f = R.forecast(s);
  eq(f.enemies[0].id, e.id);
  eq(f.enemies[0].to, [2, 2]);
  eq(f.enemies[0].dir, 'down');
  eq(f.fireSpread, [[3, 3]]);
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
test('JSON の書き出しと読み込みで同じ配置に戻る', function () {
  var s = R.loadPreset('fireEnemy');
  var json = R.exportLayout(s);
  var r = R.importLayout(json);
  ok(r.ok, r.error);
  eq(r.state.tiles, s.tiles);
  eq(r.state.units.map(function (u) { return [u.side, u.magic, u.x, u.y, u.facing]; }), s.units.map(function (u) { return [u.side, u.magic, u.x, u.y, u.facing]; }));
  ok(!R.importLayout('{').ok);
  ok(!R.importLayout({ size: 6, tiles: [] }).ok);
});
test('初期シナリオ3つが読み込める', function () {
  eq(R.PRESETS.length, 3);
  R.PRESETS.forEach(function (p) {
    var s = R.loadPreset(p.id);
    ok(s && s.size === 6, p.id);
    eq(R.alliesOf(s).length, 3, p.id);
  });
  eq(R.alliesOf(R.loadPreset('spread')).map(function (a) { return a.magic; }), ['grass', 'fire', 'wind']);
  eq(R.enemiesOf(R.loadPreset('fireEnemy')).length, 2);
});

// ---------------------------------------------------------------
console.log('\n' + passed + ' 件成功 / ' + failed.length + ' 件失敗');
if (failed.length) {
  console.log('失敗: ' + failed.join(' / '));
  process.exitCode = 1;
}
