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

console.log('\n■ 流れる（水）【新案: 池と源流】');

test('水だけなら正面に小さな池（2マス）', function () {
  var s = empty(6);
  var a = R.addAlly(s, 'water', 2, 5);
  var r = fire(s, a, 'up');
  eq([4, 3, 2].map(function (y) { return tile(r.state, 2, y); }), ['river', 'river', 'empty']);
});
test('山に当たると、山を下って盤の端まで川になる（源流）', function () {
  var s = board(['......', '......', '......', '......', '..M...', '......']);
  var a = R.addAlly(s, 'water', 2, 5);
  var r = fire(s, a, 'up');
  eq(tile(r.state, 2, 4), 'mountain', '山は残る');
  eq([3, 2, 1, 0].map(function (y) { return tile(r.state, 2, y); }), ['river', 'river', 'river', 'river']);
});
test('池の先（2マス以内）に山があれば源流になる。3マス目の山には届かない', function () {
  var s = board(['......', '......', '......', '..M...', '......', '......']);
  var a = R.addAlly(s, 'water', 2, 5);
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 4), tile(r.state, 2, 2), tile(r.state, 2, 0)], ['river', 'river', 'river']);
  var s2 = board(['......', '......', '..M...', '......', '......', '......']);
  var a2 = R.addAlly(s2, 'water', 2, 5);
  var r2 = fire(s2, a2, 'up');
  eq([tile(r2.state, 2, 4), tile(r2.state, 2, 3), tile(r2.state, 2, 1)], ['river', 'river', 'empty']);
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
  eq([hp(r.state, near.id), hp(r.state, farE.id)], [19, 19]);
});
test('押せないとき（盤の端・ユニット・通れないマス）はダメージだけ', function () {
  var s = empty(6);
  var a = R.addAlly(s, 'wind', 2, 2);
  var e = R.addEnemy(s, 'fire', 2, 0);
  var r = fire(s, a, 'up');
  eq(pos(r.state, e.id), [2, 0]);
  eq(hp(r.state, e.id), 19);
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
test('起点にいる者は押されずにダメージを受ける', function () {
  var s = board(['......', '......', '..s...', '......', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 4);
  var e = tough(s, R.addEnemy(s, 'fire', 2, 2));
  var r = fire(s, a, 'up');
  eq(pos(r.state, e.id), [2, 2]);
  eq(dealt(r, e.id), B.spread.baseDamage);
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

// 【新案・試し】桜吹雪の起こし方が「桜」（標準）
test('【試し】山に草を植えると桜が咲く（森にはならない）。空きには森', function () {
  eq(B.sakura.from, 'grass');
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

// ここから元の起こし方（火山に風）
B.sakura.from = 'fire';
test('風が火山に当たると、風下へ扇形（1・3・5マス）に火の粉が舞う', function () {
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
test('つながった火山がまとめて冷え、森に落ちれば森が燃える', function () {
  var s = board(['.......', '.......', '...F...', '.......', '..VV...', '.......', '.......']);
  var a = R.addAlly(s, 'wind', 3, 6);
  var e = R.addEnemy(s, 'fire', 3, 1);
  var r = fire(s, a, 'up');
  eq(dealt(r, e.id), B.eruption.base + 2 * B.eruption.perVolcano);
  eq(tile(r.state, 3, 2), 'fire');
  eq([tile(r.state, 2, 4), tile(r.state, 3, 4)], ['mountain', 'mountain']);
});
test('山は風をさえぎる（決め手は起きない）が、火山は桜吹雪になる', function () {
  var s = board(['......', '......', '..M...', '......', '......', '......']);
  var a = R.addAlly(s, 'wind', 2, 5);
  eq(names(fire(s, a, 'up').events, 'finisher'), []);
});
B.sakura.from = 'grass';


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
  eq([tile(r2.state, 2, 4), tile(r2.state, 2, 3)], ['ice', 'river']);
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
  var a = R.addAlly(s, 'water', 2, 4);             // (2,3) 池、(2,2) 竜巻
  var e = tough(s, R.addEnemy(s, 'fire', 1, 0));   // 輪の左上
  var r = fire(s, a, 'up');
  eq(names(r.events, 'finisher'), ['センタクキ']);
  eq(pos(r.state, e.id), [4, 0], '輪を4分の1回って右上へ');
  eq(dealt(r, e.id), B.sentakuki.damage);
  eq([tile(r.state, 2, 1), tile(r.state, 3, 2)], ['empty', 'empty'], '竜巻は跡形もなく消えた');
  eq(r.state.tiles.filter(function (t) { return t === 'puddle'; }).length, 0, '雨は降らない');
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
  var a = R.addAlly(s, 'water', 2, 4);             // (2,3) 池、(2,2) つむじ風
  var r = fire(s, a, 'up');
  eq([tile(r.state, 2, 2), tile(r.state, 3, 2), tile(r.state, 2, 1), tile(r.state, 3, 1)], ['tornado', 'tornado', 'tornado', 'tornado']);
  eq(tile(r.state, 2, 3), 'river', '手前は池');
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
  eq(dealt(r, e.id), B.fireWhirl.damage);
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
  eq(dealt(r, e.id), B.spread.baseDamage, '直撃1＋燃え広がり ではなく 燃え広がりだけ');
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
  var a = R.addAlly(s, 'water', 2, 3);
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
  eq(tile(r.state, 2, 1), 'smallfire');
});
test('道がなければ、その場で一番近い味方の方を向いて撃つ', function () {
  var s = board(['......', '......', '......', 'MMMMMM', '......', '......'], true);
  var e = R.addEnemy(s, 'wind', 2, 0);
  R.addAlly(s, 'fire', 2, 5);
  var r = R.endTurn(s);
  eq(pos(r.state, e.id), [2, 0]);
  eq(R.findUnit(r.state, e.id).facing, 'down');
  ok(r.events.some(function (ev) { return /道がない/.test(ev.text); }));
  ok(r.events.some(function (ev) { return ev.type === 'cast' && ev.id === e.id; }), '撃った');
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
  eq(p.damages.filter(function (d) { return d.id === e.id; })[0].amount, B.spread.baseDamage);
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
test('初期シナリオ（新案を含む12）が読み込める', function () {
  eq(R.PRESETS.length, 12);
  R.PRESETS.forEach(function (p) {
    var s = R.loadPreset(p.id);
    ok(s && s.size >= 6, p.id);
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
