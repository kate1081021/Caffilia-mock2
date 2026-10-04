/*
 * ルールのテスト。  node tests/run.js
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

// ---------------------------------------------------------------
// 盤面を文字で作る
//   . 空き  F 森  M 山  R 川  X 炎  s 小さな炎  G マグマ  D 泥沼  W 渦巻き
// ---------------------------------------------------------------
var CH = { '.': 'empty', F: 'forest', M: 'mountain', R: 'river', X: 'fire', s: 'smallfire', G: 'magma', D: 'mud', W: 'whirl' };
function board(rows, enemyMoves) {
  var s = R.createState({ size: rows.length, blank: true, enemyMoves: !!enemyMoves });
  rows.forEach(function (row, y) {
    for (var x = 0; x < row.length; x++) R.setTile(s, x, y, CH[row[x]]);
  });
  return s;
}
function empty(n, enemyMoves) {
  var rows = [];
  for (var i = 0; i < (n || 7); i++) rows.push(new Array((n || 7) + 1).join('.'));
  return board(rows, enemyMoves);
}
function tile(s, x, y) { return R.getTile(s, x, y); }
// 手番チェックなしで魔法を当てる
function hit(s, magic, x, y, dir) { return R.simulateCast(s, magic, x, y, dir || null, ''); }
function hpOf(s, id) { var u = R.findUnit(s, id); return u ? u.hp : null; }
function finisherNames(events) {
  return events.filter(function (e) { return e.type === 'finisher'; }).map(function (e) { return e.name; });
}

console.log('\n■ 空きマスへの魔法');

test('草 → 森', function () { eq(tile(hit(empty(), 'grass', 3, 3).state, 3, 3), 'forest'); });
test('水 → 川（1マス）', function () {
  var p = hit(empty(), 'water', 3, 3);
  eq(tile(p.state, 3, 3), 'river');
  eq(p.tileChanges.length, 1);
});
test('土 → 山', function () { eq(tile(hit(empty(), 'earth', 3, 3).state, 3, 3), 'mountain'); });
test('火 → 小さな炎', function () { eq(tile(hit(empty(), 'fire', 3, 3).state, 3, 3), 'smallfire'); });
test('風 → 何も残らない', function () {
  var p = hit(empty(), 'wind', 3, 3, 'up');
  eq(tile(p.state, 3, 3), 'empty');
  eq(p.tileChanges.length, 0);
});

['grass', 'water', 'earth'].forEach(function (m) {
  test('ユニットのいるマスに' + R.magicName(m) + ' → 作れず直撃だけ', function () {
    var s = empty();
    var e = R.addEnemy(s, 3, 3);
    var p = hit(s, m, 3, 3);
    eq(tile(p.state, 3, 3), 'empty');
    eq(hpOf(p.state, e.id), B.enemy.hp - B.directDamage[m]);
  });
});
test('味方のいるマスに土 → 作れず味方に直撃', function () {
  var s = empty();
  var a = R.addAlly(s, 'fire', 2, 2);
  var p = hit(s, 'earth', 2, 2);
  eq(tile(p.state, 2, 2), 'empty');
  eq(hpOf(p.state, a.id), B.ally.hp - B.directDamage.earth);
});
test('ユニットのいる空きマスに火 → 小さな炎＋直撃', function () {
  var s = empty();
  var e = R.addEnemy(s, 3, 3);
  var p = hit(s, 'fire', 3, 3);
  eq(tile(p.state, 3, 3), 'smallfire');
  eq(hpOf(p.state, e.id), B.enemy.hp - B.directDamage.fire);
});
test('風でユニットを押す（直撃も入る）', function () {
  var s = empty();
  var e = R.addEnemy(s, 3, 3);
  var p = hit(s, 'wind', 3, 3, 'left');
  var u = R.findUnit(p.state, e.id);
  eq([u.x, u.y], [2, 3]);
  eq(u.hp, B.enemy.hp - B.directDamage.wind);
});

console.log('\n■ シナジー表');

function synergy(name, row, magic, dir, expectTile, expectFinisher) {
  test(name, function () {
    var s = board(['.....', '.....', row, '.....', '.....']);
    var p = hit(s, magic, 2, 2, dir);
    eq(tile(p.state, 2, 2), expectTile, 'マス');
    eq(finisherNames(p.events), expectFinisher ? [expectFinisher] : [], '決め手');
  });
}
synergy('森に火 → 炎', '..F..', 'fire', null, 'fire');
synergy('山に火 → マグマ', '..M..', 'fire', null, 'magma');
synergy('川に土 → 泥沼', '..R..', 'earth', null, 'mud');
synergy('川に風 → 渦巻き', '..R..', 'wind', 'up', 'whirl');
synergy('炎に水 → 消火（空き）', '..X..', 'water', null, 'empty');
synergy('小さな炎に水 → 消火（空き）', '..s..', 'water', null, 'empty');
synergy('炎に風 → 燃え広がり', '..X..', 'wind', 'up', 'empty', '燃え広がり');
synergy('小さな炎に風 → 燃え広がり', '..s..', 'wind', 'up', 'empty', '燃え広がり');
synergy('マグマに水 → 水蒸気爆発', '..G..', 'water', null, 'empty', '水蒸気爆発');
synergy('渦巻きに火 → センタクキ', '..W..', 'fire', null, 'empty', 'センタクキ');
test('山に水 → 川が流れる（山は残る）', function () {
  var p = hit(board(['.....', '.....', '..M..', '.....', '.....']), 'water', 2, 2, 'down');
  eq(tile(p.state, 2, 2), 'mountain');
  eq([tile(p.state, 2, 3), tile(p.state, 2, 4)], ['river', 'river']);
});
// 表の「—」はそのまま
synergy('森に水 → 変化なし', '..F..', 'water', null, 'forest');
synergy('山に土 → 変化なし', '..M..', 'earth', null, 'mountain');
synergy('炎に火 → 変化なし', '..X..', 'fire', null, 'fire');
synergy('マグマに風 → 変化なし', '..G..', 'wind', 'up', 'magma');
synergy('渦巻きに水 → 変化なし', '..W..', 'water', null, 'whirl');
synergy('山に草 → 変化なし', '..M..', 'grass', null, 'mountain');

console.log('\n■ 燃え広がり');

test('森なしで風下へ4マス走る（5マス目は範囲外）', function () {
  var s = board(['.......', '.......', 'X......', '.......', '.......', '.......', '.......']);
  var e1 = R.addEnemy(s, 4, 2);   // 4マス目
  var e2 = R.addEnemy(s, 5, 2);   // 5マス目
  var p = hit(s, 'wind', 0, 2, 'right');
  var fin = p.events.filter(function (e) { return e.type === 'finisher'; })[0];
  eq(fin.cells.length, 5, '範囲 = 起点＋4マス');
  eq(hpOf(p.state, e1.id), B.enemy.hp - B.spread.baseDamage);
  eq(hpOf(p.state, e2.id), B.enemy.hp);
  eq(tile(p.state, 0, 2), 'empty', '起点は空きに戻る');
  eq(tile(p.state, 2, 2), 'empty', '通り道の空きには何も残らない');
});
test('山の手前で止まる', function () {
  var s = board(['.......', '.......', 'X.M....', '.......', '.......', '.......', '.......']);
  var e1 = R.addEnemy(s, 1, 2);
  var e2 = R.addEnemy(s, 3, 2);
  var p = hit(s, 'wind', 0, 2, 'right');
  eq(hpOf(p.state, e1.id), B.enemy.hp - B.spread.baseDamage);
  eq(hpOf(p.state, e2.id), B.enemy.hp);
});
test('川の手前で止まる', function () {
  var s = board(['.......', '.......', 'X.R....', '.......', '.......', '.......', '.......']);
  var e2 = R.addEnemy(s, 3, 2);
  var p = hit(s, 'wind', 0, 2, 'right');
  eq(p.events.filter(function (e) { return e.type === 'finisher'; })[0].cells.length, 2);
  eq(hpOf(p.state, e2.id), B.enemy.hp);
});
test('マグマ・渦巻き・盤の端の手前でも止まる', function () {
  var p1 = hit(board(['.....', '.....', 'X.G..', '.....', '.....']), 'wind', 0, 2, 'right');
  eq(p1.finishers[0].cells.length, 2);
  var p2 = hit(board(['.....', '.....', 'XW...', '.....', '.....']), 'wind', 0, 2, 'right');
  eq(p2.finishers[0].cells.length, 1);
  var p3 = hit(board(['.....', '.....', '...X.', '.....', '.....']), 'wind', 3, 2, 'right');
  eq(p3.finishers[0].cells.length, 2);
});
test('通り道の森と、つながった森が全部燃える（離れた森は燃えない）', function () {
  var s = board([
    '.......',
    '..FF...',
    '..F....',
    'X.F....',
    '.......',
    '.....F.',
    '.......'
  ]);
  var p = hit(s, 'wind', 0, 3, 'right');
  ['2,1', '3,1', '2,2', '2,3'].forEach(function (k) {
    var c = k.split(',').map(Number);
    eq(tile(p.state, c[0], c[1]), 'fire', k + ' が炎');
  });
  eq(tile(p.state, 5, 5), 'forest', '離れた森');
  eq(p.finishers[0].forests, 4);
});
test('ダメージ = 4 ＋ 燃えた森の数×2、味方も巻き込まれる', function () {
  var s = board([
    '.......',
    '..FF...',
    '..F....',
    'X.F....',
    '.......',
    '.......',
    '.......'
  ]);
  var e = R.addEnemy(s, 3, 1);       // つながった森の上
  var a = R.addAlly(s, 'fire', 1, 3); // 通り道の上（味方）
  var p = hit(s, 'wind', 0, 3, 'right');
  var expected = B.spread.baseDamage + 4 * B.spread.perForest;
  eq(expected, 12);
  eq(hpOf(p.state, e.id), B.enemy.hp - 12);
  eq(hpOf(p.state, a.id), B.ally.hp - 12, '味方も同じダメージ');
});
test('燃え広がりは castMagic でも起き、倒れた味方は消える', function () {
  var s = board(['.......', '.......', '.......', 's......', '.......', '.......', '.......']);
  var caster = R.addAlly(s, 'wind', 0, 6);
  var victim = R.addAlly(s, 'water', 2, 3);
  var r = R.castMagic(s, caster.id, 0, 3, 'right');
  ok(r.ok, r.error);
  eq(R.findUnit(r.state, victim.id), null);
  ok(r.events.some(function (e) { return e.type === 'death'; }));
});

console.log('\n■ 山に水（川が流れる）');

test('盤の端まで流れる', function () {
  var p = hit(board(['.......', '.......', 'M......', '.......', '.......', '.......', '.......']), 'water', 0, 2, 'right');
  for (var x = 1; x < 7; x++) eq(tile(p.state, x, 2), 'river', 'x=' + x);
});
test('炎に当たって消火', function () {
  var p = hit(board(['.......', '.......', 'M...X..', '.......', '.......', '.......', '.......']), 'water', 0, 2, 'right');
  eq([1, 2, 3].map(function (x) { return tile(p.state, x, 2); }), ['river', 'river', 'river']);
  eq(tile(p.state, 4, 2), 'empty', '消火');
  eq(tile(p.state, 5, 2), 'empty', 'その先は流れない');
});
test('マグマに当たって水蒸気爆発', function () {
  var s = board(['.......', '.......', 'M...G..', '.......', '.......', '.......', '.......']);
  var e = R.addEnemy(s, 4, 1);
  var p = hit(s, 'water', 0, 2, 'right');
  eq(finisherNames(p.events), ['水蒸気爆発']);
  eq(tile(p.state, 4, 2), 'empty');
  eq(hpOf(p.state, e.id), B.enemy.hp - B.steam.damage);
});
test('ユニットに当たったら止まって何も起きない', function () {
  var s = board(['.......', '.......', 'M......', '.......', '.......', '.......', '.......']);
  var e = R.addEnemy(s, 3, 2);
  var p = hit(s, 'water', 0, 2, 'right');
  eq([tile(p.state, 1, 2), tile(p.state, 2, 2), tile(p.state, 3, 2), tile(p.state, 4, 2)], ['river', 'river', 'empty', 'empty']);
  eq(hpOf(p.state, e.id), B.enemy.hp);
});

console.log('\n■ 水蒸気爆発・センタクキ');

test('水蒸気爆発は3×3に10ダメージ、周りの地形はそのまま', function () {
  var s = board(['.......', '.......', '.......', '..FG...', '.......', '.......', '.......']);
  var inA = R.addEnemy(s, 2, 2);     // 左上（森の上ではない）
  var inB = R.addAlly(s, 'fire', 4, 4); // 右下
  var out = R.addEnemy(s, 3, 5);     // 範囲外
  var p = hit(s, 'water', 3, 3);
  eq(hpOf(p.state, inA.id), B.enemy.hp - 10);
  eq(hpOf(p.state, inB.id), B.ally.hp - 10);
  eq(hpOf(p.state, out.id), B.enemy.hp);
  eq(tile(p.state, 3, 3), 'empty');
  eq(tile(p.state, 2, 3), 'forest', '周りの森は残る');
  eq(p.finishers[0].cells.length, 9);
});
test('センタクキ: 渦の中に12、上下左右に4、斜めは0。中の者は解放', function () {
  var s = board(['.......', '.......', '.......', '...W...', '.......', '.......', '.......']);
  var inner = R.addEnemy(s, 3, 3);
  var side = R.addEnemy(s, 3, 2);
  var diag = R.addEnemy(s, 4, 4);
  var p = hit(s, 'fire', 3, 3);
  eq(hpOf(p.state, inner.id), B.enemy.hp - 12);
  eq(hpOf(p.state, side.id), B.enemy.hp - 4);
  eq(hpOf(p.state, diag.id), B.enemy.hp);
  eq(tile(p.state, 3, 3), 'empty');
  ok(!R.isInWhirl(p.state, R.findUnit(p.state, inner.id)), '解放');
});

console.log('\n■ ターン終了処理');

test('炎の燃え移りは1ターンに1マス分', function () {
  var s = board(['.......', '.XFF...', '.......', '.......', '.......', '.......', '.......']);
  var r1 = R.endTurn(s);
  eq([tile(r1.state, 2, 1), tile(r1.state, 3, 1)], ['fire', 'forest']);
  var r2 = R.endTurn(r1.state);
  eq(tile(r2.state, 3, 1), 'fire');
});
test('燃え移りは上下左右だけ（斜めは燃えない）', function () {
  var r = R.endTurn(board(['.....', '.X...', '..F..', '.....', '.....']));
  eq(tile(r.state, 2, 2), 'forest');
});
test('炎の上にいる者に2ダメージ（味方も）', function () {
  var s = board(['.....', '.X...', '.....', '.....', '.....']);
  var a = R.addAlly(s, 'fire', 1, 1);
  var r = R.endTurn(s);
  eq(hpOf(r.state, a.id), B.ally.hp - B.fireTileDamage);
});
test('燃え移ったばかりの森の上にいる者も2ダメージ', function () {
  var s = board(['.....', '.XF..', '.....', '.....', '.....']);
  var e = R.addEnemy(s, 2, 1);
  var r = R.endTurn(s);
  eq(hpOf(r.state, e.id), B.enemy.hp - B.fireTileDamage);
});
test('小さな炎はターン終了で消える（ダメージなし）', function () {
  var s = board(['.....', '.s...', '.....', '.....', '..s..']);
  var e = R.addEnemy(s, 1, 1);
  var r = R.endTurn(s);
  eq([tile(r.state, 1, 1), tile(r.state, 2, 4)], ['empty', 'empty']);
  eq(hpOf(r.state, e.id), B.enemy.hp);
});
test('渦巻きは隣の1体だけ引き込む（上・右・下・左の順）', function () {
  var s = board(['.......', '.......', '.......', '...W...', '.......', '.......', '.......']);
  var down = R.addEnemy(s, 3, 4);
  var right = R.addAlly(s, 'fire', 4, 3);
  var left = R.addEnemy(s, 2, 3);
  var r = R.endTurn(s);
  var u = R.findUnit(r.state, right.id);
  eq([u.x, u.y], [3, 3], '右が先');
  eq([R.findUnit(r.state, down.id).y, R.findUnit(r.state, left.id).x], [4, 2], '他は動かない');
  var r2 = R.endTurn(r.state);
  eq([R.findUnit(r2.state, down.id).x, R.findUnit(r2.state, down.id).y], [3, 4], '中が埋まっていれば引き込まない');
});
test('渦巻きの中の味方は移動できない', function () {
  var s = board(['.....', '.....', '..W..', '.....', '.....']);
  var a = R.addAlly(s, 'fire', 2, 2);
  eq(Object.keys(R.reachableCells(s, a.id)).length, 0);
  ok(!R.moveAlly(s, a.id, 2, 3).ok);
});
test('渦巻きの中の者は風で押されない', function () {
  var s = board(['.....', '.....', '..W..', '.....', '.....']);
  var e = R.addEnemy(s, 2, 2);
  var p = hit(s, 'wind', 2, 2, 'down');
  eq([R.findUnit(p.state, e.id).x, R.findUnit(p.state, e.id).y], [2, 2]);
});

console.log('\n■ 泥沼');

test('敵が泥沼に入ると次の行動を1回休む', function () {
  var s = board(['.......', '...D...', '.......', '.......', '.......', '.......', '.......'], true);
  var e = R.addEnemy(s, 3, 0);
  R.addAlly(s, 'fire', 3, 6);
  var r1 = R.endTurn(s);
  var u = R.findUnit(r1.state, e.id);
  eq([u.x, u.y, u.stuck], [3, 1, 1], '泥沼に入った');
  var r2 = R.endTurn(r1.state);
  u = R.findUnit(r2.state, e.id);
  eq([u.x, u.y, u.stuck], [3, 1, 0], '1回休み');
  var r3 = R.endTurn(r2.state);
  u = R.findUnit(r3.state, e.id);
  eq([u.x, u.y], [3, 2], 'また動く');
});
test('味方が移動を使い切って泥沼に入ると、次のターンは動けない', function () {
  var s = board(['.......', '.......', '.......', '.......', '...D...', '.......', '.......']);
  var a = R.addAlly(s, 'fire', 3, 6);
  var r = R.moveAlly(s, a.id, 3, 4);
  ok(r.ok, r.error);
  eq(R.findUnit(r.state, a.id).stuck, 1);
  var t1 = R.endTurn(r.state);
  eq(R.findUnit(t1.state, a.id).movesLeft, 0, '次のターンは動けない');
  var t2 = R.endTurn(t1.state);
  eq(R.findUnit(t2.state, a.id).movesLeft, B.ally.moveRange, 'その次は動ける');
});
test('味方が移動の残っている状態で泥沼に入ると、残りの移動がなくなる', function () {
  var s = board(['.......', '.......', '.......', '.......', '.......', '...D...', '.......']);
  var a = R.addAlly(s, 'fire', 3, 6);
  var r = R.moveAlly(s, a.id, 3, 5);
  var u = R.findUnit(r.state, a.id);
  eq([u.movesLeft, u.stuck], [0, 0]);
  eq(R.findUnit(R.endTurn(r.state).state, a.id).movesLeft, B.ally.moveRange);
});
test('移動は泥沼を通り抜けられない', function () {
  var s = board(['.......', '.......', '.......', '.......', '...D...', '.......', '.......']);
  var a = R.addAlly(s, 'fire', 3, 5);
  var reach = R.reachableCells(s, a.id);
  ok(reach['3,4'] === 1, '泥沼には入れる');
  ok(reach['3,3'] === undefined, '泥沼の先へは行けない');
});

console.log('\n■ 敵の行動');

test('一番近い味方（道のり）へ1マス進む', function () {
  var s = board(['.......', '.......', '.......', '.......', '.......', '.......', '.......'], true);
  var e = R.addEnemy(s, 3, 0);
  R.addAlly(s, 'fire', 0, 6);   // 道のり 9
  R.addAlly(s, 'water', 3, 6);  // 道のり 6
  var r = R.endTurn(s);
  var u = R.findUnit(r.state, e.id);
  eq([u.x, u.y], [3, 1]);
});
test('道のりは通れないマスを避けて数える', function () {
  // 敵(3,1) の真下は山の壁。左の味方は壁の向こう、右の味方は回り込まずに行ける
  var s = board([
    '.......',
    '.......',
    'MMMMM..',
    '.......',
    '.......',
    '.......',
    '.......'
  ], true);
  var e = R.addEnemy(s, 2, 1);
  var a1 = R.addAlly(s, 'fire', 2, 3);   // 直線なら近いが壁の向こう（道のり 2+... 遠回り）
  var a2 = R.addAlly(s, 'water', 6, 1);  // 同じ段（道のり 4）
  var r = R.endTurn(s);
  var u = R.findUnit(r.state, e.id);
  eq([u.x, u.y], [3, 1], '右へ進む');
  ok(a1 && a2);
});
test('同じ距離なら味方の番号順、進む向きは上・右・下・左の順', function () {
  var s = empty(7, true);
  var e = R.addEnemy(s, 3, 3);
  R.addAlly(s, 'fire', 0, 3);    // 左に3
  R.addAlly(s, 'water', 6, 3);   // 右に3
  var r = R.endTurn(s);
  var u = R.findUnit(r.state, e.id);
  eq([u.x, u.y], [2, 3], '番号の小さい味方（左）へ');
  var s2 = empty(7, true);
  var e2 = R.addEnemy(s2, 3, 3);
  R.addAlly(s2, 'fire', 5, 1);   // 右上。上と右のどちらでも近づける → 上が先
  var r2 = R.endTurn(s2);
  var u2 = R.findUnit(r2.state, e2.id);
  eq([u2.x, u2.y], [3, 2]);
});
test('川で道がふさがれたら待つ', function () {
  var s = board(['.......', '.......', '.......', 'RRRRRRR', '.......', '.......', '.......'], true);
  var e = R.addEnemy(s, 3, 0);
  R.addAlly(s, 'fire', 3, 6);
  var r = R.endTurn(s);
  var u = R.findUnit(r.state, e.id);
  eq([u.x, u.y], [3, 0]);
  ok(r.events.some(function (ev) { return ev.type === 'enemyWait'; }));
});
test('隣なら進まずに攻撃（3ダメージ）', function () {
  var s = empty(7, true);
  var e = R.addEnemy(s, 3, 2);
  var a = R.addAlly(s, 'fire', 3, 3);
  a.hp = 10; // 倒れないように
  var r = R.endTurn(s);
  var u = R.findUnit(r.state, e.id);
  eq([u.x, u.y], [3, 2], '動かない');
  eq(hpOf(r.state, a.id), 10 - B.enemy.attack);
});
test('攻撃で HP0 になった味方は倒れて消える・全員倒れたら敗北', function () {
  var s = empty(7, true);
  R.addEnemy(s, 3, 2);
  var a = R.addAlly(s, 'fire', 3, 3);
  var r = R.endTurn(s);
  eq(R.findUnit(r.state, a.id), null);
  eq(r.state.result, 'lose');
});
test('敵「止まる」設定では動かない', function () {
  var s = empty(7, false);
  var e = R.addEnemy(s, 3, 0);
  R.addAlly(s, 'fire', 3, 6);
  var r = R.endTurn(s);
  var u = R.findUnit(r.state, e.id);
  eq([u.x, u.y], [3, 0]);
});
test('敵は炎・泥沼・小さな炎も気にせず通る', function () {
  var s = board(['.......', '...X...', '.......', '.......', '.......', '.......', '.......'], true);
  var e = R.addEnemy(s, 3, 0);
  R.addAlly(s, 'fire', 3, 6);
  var r = R.endTurn(s);
  var u = R.findUnit(r.state, e.id);
  eq([u.x, u.y], [3, 1]);
});

console.log('\n■ 風で押す');

test('通れないマス（山・川・マグマ・渦巻き）には押せない', function () {
  ['M', 'R', 'G', 'W'].forEach(function (c) {
    var s = board(['.....', '.....', '...' + c + '.', '.....', '.....']);
    var e = R.addEnemy(s, 2, 2);
    var p = hit(s, 'wind', 2, 2, 'right');
    var u = R.findUnit(p.state, e.id);
    eq([u.x, u.y], [2, 2], c);
  });
});
test('盤の端・ユニットのいるマスにも押せない', function () {
  var s = empty(5);
  var e = R.addEnemy(s, 4, 2);
  var p = hit(s, 'wind', 4, 2, 'right');
  eq(R.findUnit(p.state, e.id).x, 4);
  var s2 = empty(5);
  var e2 = R.addEnemy(s2, 2, 2);
  R.addEnemy(s2, 3, 2);
  var p2 = hit(s2, 'wind', 2, 2, 'right');
  eq(R.findUnit(p2.state, e2.id).x, 2);
});
test('炎に押し込める（ターン終了で2ダメージ）', function () {
  var s = board(['.....', '.....', '...X.', '.....', '.....']);
  var e = R.addEnemy(s, 2, 2);
  var p = hit(s, 'wind', 2, 2, 'right');
  var u = R.findUnit(p.state, e.id);
  eq([u.x, u.y], [3, 2]);
  var r = R.endTurn(p.state);
  eq(hpOf(r.state, e.id), B.enemy.hp - B.directDamage.wind - B.fireTileDamage);
});
test('泥沼に押し込むと、敵は次の行動を休む', function () {
  var s = board(['.....', '.....', '...D.', '.....', '.....'], true);
  var e = R.addEnemy(s, 2, 2);
  R.addAlly(s, 'fire', 0, 4);
  var p = hit(s, 'wind', 2, 2, 'right');
  eq(R.findUnit(p.state, e.id).stuck, 1);
  var r = R.endTurn(p.state);
  var u = R.findUnit(r.state, e.id);
  eq([u.x, u.y], [3, 2]);
});
test('マスの変化を先に処理してから押す（小さな炎に風）', function () {
  var s = board(['.....', '.....', '..s..', '.....', '.....']);
  var e = R.addEnemy(s, 2, 2);
  var p = hit(s, 'wind', 2, 2, 'right');
  var u = R.findUnit(p.state, e.id);
  eq(finisherNames(p.events), ['燃え広がり']);
  eq([u.x, u.y], [3, 2], '押された');
  eq(u.hp, B.enemy.hp - B.spread.baseDamage, '燃え広がりのダメージだけ');
});

console.log('\n■ 手番・移動');

test('魔法は1ターンに1回', function () {
  var s = R.createState();
  var r = R.castMagic(s, 'P1', 0, 0);
  ok(r.ok);
  ok(!R.castMagic(r.state, 'P1', 1, 0).ok);
});
test('向きが必要な魔法は向きなしでは撃てない', function () {
  var s = R.createState();
  ok(!R.castMagic(s, 'P3', 0, 0).ok);
  ok(R.castMagic(s, 'P3', 0, 0, 'up').ok);
});
test('移動は最大2マス、通れないマスは通れない', function () {
  var s = board(['.......', '.......', '.......', '.......', '.......', '..MMM..', '.......']);
  var a = R.addAlly(s, 'fire', 3, 6);
  var reach = R.reachableCells(s, a.id);
  ok(reach['3,5'] === undefined, '山には入れない');
  ok(reach['1,6'] === 2 && reach['5,6'] === 2);
  ok(reach['0,6'] === undefined, '3マス先は無理');
  var r = R.moveAlly(s, a.id, 2, 6);
  ok(r.ok);
  var r2 = R.moveAlly(r.state, a.id, 1, 6);
  ok(r2.ok, '2マスを分けて使える');
  ok(!R.moveAlly(r2.state, a.id, 0, 6).ok, '3マス目は無理');
});
test('全員撃ったら allAlliesDone、ターン終了で元に戻る', function () {
  var s = R.createState({ enemyMoves: false });
  var r = R.castMagic(s, 'P1', 0, 0);
  r = R.castMagic(r.state, 'P2', 1, 0);
  ok(!R.allAlliesDone(r.state));
  r = R.castMagic(r.state, 'P3', 2, 1, 'up');
  ok(R.allAlliesDone(r.state));
  var t = R.endTurn(r.state);
  ok(!R.allAlliesDone(t.state));
  eq(t.state.turn, 2);
});
test('敵を全員倒したら勝利', function () {
  var s = board(['.......', '.......', '...W...', '.......', '.......', '.......', '.......']);
  var e = R.addEnemy(s, 3, 2);
  e.hp = 5;
  var a = R.addAlly(s, 'fire', 0, 6);
  var r = R.castMagic(s, a.id, 3, 2);
  eq(r.state.result, 'win');
});
test('元の state は書き換えない', function () {
  var s = R.createState();
  var before = JSON.stringify(s);
  R.castMagic(s, 'P1', 3, 3);
  R.moveAlly(s, 'P1', 1, 5);
  R.endTurn(s);
  eq(JSON.stringify(s), before);
});

console.log('\n■ プレビュー・導き・エディット');

test('光る導き: 渦巻きがあるとき火の味方では渦巻きが「決め手」', function () {
  var s = board(['.......', '...W...', '..F....', '.......', '.......', '.......', '.......']);
  var a = R.addAlly(s, 'fire', 3, 6);
  var g = R.guideMap(s, a.id);
  eq(g['3,1'], 'finisher');
  eq(g['2,2'], 'change');
});
test('光る導き: 山に水は、川がマグマまで届く向きがあれば「決め手」', function () {
  var s = board(['.......', '.......', 'M...G..', '.......', '.......', '.......', '.......']);
  var a = R.addAlly(s, 'water', 3, 6);
  var g = R.guideMap(s, a.id);
  eq(g['0,2'], 'finisher');
  eq(g['4,2'], 'finisher');
});
test('プレビュー: 燃え広がりの範囲とダメージ予測', function () {
  var s = board(['.......', '.......', 'X.F....', '.......', '.......', '.......', '.......']);
  var a = R.addAlly(s, 'wind', 3, 6);
  var e = R.addEnemy(s, 2, 2);
  var p = R.previewCast(s, a.id, 0, 2, 'right');
  eq(p.finishers[0].name, '燃え広がり');
  eq(p.damages[0].amount, 6);
  eq(p.damages[0].id, e.id);
});
test('エディット: 塗る・置く・消す・大きさ変更・抜けたときに整える', function () {
  var s = R.createState();
  var r = R.editPaint(s, 3, 3, 'forest');
  eq(R.getTile(r.state, 3, 3), 'forest');
  ok(!R.editPaint(r.state, 1, 6, 'mountain').ok, '味方の上に山は置けない');
  ok(!R.editPlaceAlly(r.state, 0, 0).ok, '味方は3人まで');
  r = R.editPlaceEnemy(r.state, 0, 0);
  eq(R.enemiesOf(r.state).map(function (e) { return e.name; }), ['敵A', '敵B']);
  r = R.editRemoveUnit(r.state, 3, 0);
  r = R.editPlaceEnemy(r.state, 6, 0);
  eq(R.enemiesOf(r.state).map(function (e) { return e.name; }).sort(), ['敵A', '敵B']);
  r = R.editResize(r.state, 5);
  eq(r.state.size, 5);
  eq(r.state.tiles.length, 25);
  eq(R.alliesOf(r.state).length, 0, '下の段の味方は盤の外になった');
  r = R.editResize(r.state, 99);
  eq(r.state.size, B.maxBoardSize);
  var n = R.normalizeForPlay(r.state);
  eq(n.turn, 1);
});

// ---------------------------------------------------------------
console.log('\n' + passed + ' 件成功 / ' + failed.length + ' 件失敗');
if (failed.length) {
  console.log('失敗: ' + failed.join(' / '));
  process.exitCode = 1;
}
