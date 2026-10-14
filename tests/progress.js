/*
 * 進行モック（クエスト制とステージ制）のテスト。  node tests/progress.js
 *   戦闘の中身は自動プレイ（tests/autoplay.js）で、勝てる形かだけ確かめる（重いので一部）。
 */
var R = require('../rules.js');
var B = require('../balance.js');
var P = require('../progress.js');
var D = require('../progress_data.js');
var A = require('./autoplay.js');

var passed = 0, failed = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed.push(name); console.log('  NG  ' + name); console.log('        ' + (e && e.message)); }
  finally { B.turnMode = 'single'; }
}
function eq(a, b, msg) { var x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error((msg ? msg + ': ' : '') + 'expected ' + y + ' but got ' + x); }
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function ids(run, magics) { return magics.map(function (m) { return run.party.filter(function (p) { return p.magic === m; })[0].id; }); }
function go(run, ref, magics) { var r = P.startBattle(run, ref, ids(run, magics)); if (!r.ok) throw new Error(ref + ': ' + r.error); return r.run; }
function fin(run, result) { var r = P.finishBattle(run, result, { turns: 2 }); if (!r.ok) throw new Error(r.error); return r.run; }
function claim(run, i) { var r = P.claimReward(run, i); if (!r.ok) throw new Error(r.error); return r.run; }

console.log('\n■ 1周の始まり');
test('最初の仲間は3人（草・火・風）、1人1魔法。強化はどれも0', function () {
  var run = P.newRun('quest', 1);
  eq(run.party.map(function (p) { return p.magic; }), ['grass', 'fire', 'wind']);
  eq(run.upgrades.grass, { vine: 0, forest: 0 });
  eq([run.over, run.current, run.offer], [null, null, null]);
});
test('新しい魔法は、最初の3人が持っていない魔法（土・水）。1周で2回', function () {
  var q = [], s = [];
  D.quest.chapters.forEach(function (c) { c.sides.forEach(function (x) { if (x.magic) q.push(x.magic); }); });
  D.stages.forEach(function (x) { if (x.magic) s.push(x.magic); });
  eq([q, s], [['earth', 'water'], ['earth', 'water']]);
  q.forEach(function (m) { ok(D.startParty.indexOf(m) < 0 && R.MAGICS.indexOf(m) >= 0, m); });
});
test('草の強化の方向は 蔓 と 森。どの魔法も方向は2つ', function () {
  eq(D.directions.grass.map(function (d) { return d.name; }), ['蔓', '森']);
  Object.keys(D.directions).forEach(function (m) { eq(D.directions[m].length, 2, m); });
});
test('数: 章2・寄り道2回・ボードの寄り道3（おいしい1・簡単2）・ステージ6・候補 3/4/2・段3・おすすめ1〜2', function () {
  eq([D.quest.chapters.length, D.sideLimit, D.stages.length, D.maxLevel], [2, 2, 6, 3]);
  D.quest.chapters.forEach(function (c) {
    eq(c.sides.map(function (s) { return s.type; }).sort(), ['easy', 'easy', 'rich']);
  });
  eq(D.candidates, { key: 3, rich: 4, easy: 2, stage: 3 });
  Object.keys(D.battles).forEach(function (k) { var n = D.battles[k].recommend.length; ok(n >= 1 && n <= 2, k); });
  eq(D.stages.length, D.quest.chapters.length * (1 + D.sideLimit), 'ステージの数 ＝ 寄り道を上限までやったときの戦闘の数');
});

console.log('\n■ クエスト制');
test('ボード: キー1・寄り道3。キーは敵とお題が見える（戦闘の定義）。寄り道の報酬は受ける前から見える', function () {
  var b = P.board(P.newRun('quest', 1));
  eq([b.key.type, b.sides.length, b.sidesLeft], ['key', 3, 2]);
  eq(b.sides.map(function (s) { return [s.type, s.magic, s.candidates]; }), [['rich', null, 4], ['easy', 'earth', 2], ['easy', null, 2]]);
  ok(D.battles[b.key.battle].enemies.length && D.battles[b.key.battle].mission);
});
test('仲間が3人より多いときは3人を選ぶ。3人ちょうどでないと始められない', function () {
  var run = P.newRun('quest', 1);
  run = claim(fin(go(run, 'c0/side1', ['grass', 'fire', 'wind']), 'win'), 0);
  eq(run.party.length, 4, '土が加わった');
  ok(!P.startBattle(run, 'c0/key', ids(run, ['grass', 'fire'])).ok, '2人では始められない');
  ok(!P.startBattle(run, 'c0/key', ids(run, ['grass', 'fire', 'wind', 'earth'])).ok, '4人では始められない');
  ok(P.startBattle(run, 'c0/key', ids(run, ['earth', 'fire', 'wind'])).ok);
});
test('寄り道は章ごとに2回まで。使い切ると残りは受けられない（キーは受けられる）', function () {
  var run = P.newRun('quest', 1);
  run = claim(fin(go(run, 'c0/side0', ['grass', 'fire', 'wind']), 'win'), 0);
  run = fin(go(run, 'c0/side2', ['grass', 'fire', 'wind']), 'lose');
  var b = P.board(run);
  eq([b.sidesLeft, b.sides.map(function (s) { return s.state; })], [0, ['win', 'locked', 'lose']]);
  eq(P.available(run).map(function (e) { return e.ref; }), ['c0/key']);
  ok(!P.startBattle(run, 'c0/side1', ids(run, ['grass', 'fire', 'wind'])).ok);
});
test('寄り道で負けたら報酬なしで拠点に戻り、回数だけ使う', function () {
  var run = fin(go(P.newRun('quest', 1), 'c0/side1', ['grass', 'fire', 'wind']), 'lose');
  eq([run.offer, run.over, run.sidesUsed, run.party.length], [null, null, 1, 3], '土はもらえない');
});
test('キークエストで負けたら1周が終わる', function () {
  var run = fin(go(P.newRun('quest', 1), 'c0/key', ['grass', 'fire', 'wind']), 'lose');
  eq(run.over, 'fail');
  eq(P.available(run), []);
});
test('キークエストをクリアすると次の章（ボードが替わり、寄り道の回数も戻る）。最後の章のキー（ボス）でクリア', function () {
  var run = P.newRun('quest', 1);
  run = claim(fin(go(run, 'c0/side0', ['grass', 'fire', 'wind']), 'win'), 0);
  run = claim(fin(go(run, 'c0/key', ['grass', 'fire', 'wind']), 'win'), 0);
  var b = P.board(run);
  eq([run.chapter, b.name, b.sidesLeft, b.key.boss, b.key.last], [1, '2章 山の砦', 2, true, true]);
  run = claim(fin(go(run, 'c1/key', ['grass', 'fire', 'wind']), 'win'), 0);
  eq(run.over, 'clear');
  eq(P.summary(run).battles, 3);
});
test('強化の候補: 連れていった仲間の魔法からだけ。1人につき1つ。キー3・おいしい4・簡単2', function () {
  var run = P.newRun('quest', 7);
  run = claim(fin(go(run, 'c0/side1', ['grass', 'fire', 'wind']), 'win'), 0);   // 土が加わる
  var r1 = fin(go(run, 'c0/key', ['earth', 'fire', 'wind']), 'win');
  eq(r1.offer.candidates.length, 3);
  eq(r1.offer.candidates.map(function (c) { return c.magic; }), ['earth', 'fire', 'wind'], '1人につき1つ、連れていった順');
  var r2 = fin(go(run, 'c0/side0', ['earth', 'fire', 'wind']), 'win');
  eq(r2.offer.candidates.length, 4);
  ok(r2.offer.candidates.every(function (c) { return ['earth', 'fire', 'wind'].indexOf(c.magic) >= 0; }), '草は連れていないので出ない');
  var keys = r2.offer.candidates.map(function (c) { return c.magic + '.' + c.dir; });
  eq(keys.filter(function (k, i) { return keys.indexOf(k) === i; }).length, 4, '同じ方向は2度出ない');
  var r3 = fin(go(run, 'c0/side2', ['earth', 'fire', 'wind']), 'win');
  eq(r3.offer.candidates.length, 2);
});
test('方向は乱数（種で決まる）。同じ種なら同じ候補、種が違えば違う候補も出る', function () {
  function first(seed) { return fin(go(P.newRun('quest', seed), 'c0/key', ['grass', 'fire', 'wind']), 'win').offer.candidates.map(function (c) { return c.dir; }).join(); }
  eq(first(3), first(3));
  var seen = {};
  for (var s = 1; s <= 30; s++) seen[first(s)] = true;
  ok(Object.keys(seen).length > 1, '30の種で1通りしか出ない');
});
test('同じ方向をもう一度選ぶと段が進む。3段で止まり、3段の方向は候補に出ない', function () {
  var run = P.newRun('quest', 1);
  run.upgrades.grass.vine = 3; run.upgrades.fire.blaze = 3; run.upgrades.wind.gust = 3;
  var r = fin(go(run, 'c0/key', ['grass', 'fire', 'wind']), 'win');
  eq(r.offer.candidates.map(function (c) { return c.dir; }), ['forest', 'ember', 'tail'], '残りの方向だけ');
  var c = claim(r, 0);
  eq(c.upgrades.grass.forest, 1);
  c.upgrades.grass.forest = 2;
  var r2 = fin(go(claim(fin(go(c, 'c1/side1', ['grass', 'fire', 'wind']), 'win'), 0), 'c1/side2', ['grass', 'wind', 'fire']), 'win');
  ok(r2.offer.candidates.every(function (x) { return x.level <= 3; }));
});
test('新しい魔法は報酬を受け取ると仲間が加わる（受ける前から見えている）', function () {
  var run = go(P.newRun('quest', 1), 'c0/side1', ['grass', 'fire', 'wind']);
  var w = fin(run, 'win');
  eq(w.offer.magic, 'earth');
  eq(w.party.length, 3, '受け取る前');
  var c = claim(w, 0);
  eq(c.party.map(function (p) { return p.magic; }), ['grass', 'fire', 'wind', 'earth']);
  eq(c.upgrades.earth, { rock: 0, range: 0 });
});

console.log('\n■ ステージ制');
test('決まった順に6つ。新しい魔法が手に入るステージは道に出ている。負けたら1周が終わる', function () {
  var run = P.newRun('stage', 1);
  var path = P.stagePath(run);
  eq(path.map(function (e) { return e.state; }), ['current', 'next', 'next', 'next', 'next', 'next']);
  eq(path.map(function (e) { return e.magic; }), ['earth', null, null, null, 'water', null]);
  eq(P.available(run).map(function (e) { return e.ref; }), ['stage/0']);
  eq(fin(go(run, 'stage/0', ['grass', 'fire', 'wind']), 'lose').over, 'fail');
});
test('6つ勝つとクリア。候補はどのステージも3。報酬・強化の扱いはクエスト制と同じ', function () {
  var run = P.newRun('stage', 5);
  for (var i = 0; i < 6; i++) {
    var pick = i >= 5 ? ['water', 'earth', 'wind'] : i >= 1 ? ['earth', 'fire', 'wind'] : ['grass', 'fire', 'wind'];
    run = fin(go(run, 'stage/' + i, pick), 'win');
    eq(run.offer.candidates.length, 3);
    run = claim(run, 0);
  }
  eq(run.over, 'clear');
  eq(run.party.map(function (p) { return p.magic; }), ['grass', 'fire', 'wind', 'earth', 'water']);
});

console.log('\n■ 戦闘（既存の戦闘をそのまま使う）');
test('どの戦闘も、どの3人でも盤面が作れる（置き場所3つ・敵の予告まで済む）', function () {
  var run = P.newRun('quest', 1);
  ['earth', 'water'].forEach(function (m) { run.party.push({ id: 'X' + m, magic: m }); run.upgrades[m] = { a: 0 }; });
  var all = ['grass', 'fire', 'wind', 'earth', 'water'];
  Object.keys(D.battles).forEach(function (id) {
    eq(D.battles[id].slots.length, 3, id);
    for (var i = 0; i < 5; i++) for (var j = i + 1; j < 5; j++) for (var k = j + 1; k < 5; k++) {
      var s = P.buildBattle(run, id, ids(run, [all[i], all[j], all[k]]));
      eq(R.alliesOf(s).map(function (u) { return u.magic; }), [all[i], all[j], all[k]], id);
      ok(!s.result && s.turn === 1, id);
    }
  });
});
test('強化（仮）: 直撃の威力はその味方だけ。数値の強化は連れていったときだけ、その戦闘に入る', function () {
  var run = P.newRun('quest', 1);
  run.upgrades.fire.blaze = 2; run.upgrades.wind.tail = 1;
  var s = P.buildBattle(run, 'c1rich', ids(run, ['grass', 'fire', 'wind']));
  eq(R.alliesOf(s).map(function (u) { return u.power; }), [1, 3, 1], '火だけ +2');
  eq(s.overrides, { breezeLength: 3 }, '追い風1 → 風の長さ 2+1');
  var s3 = P.buildBattle(run, 'c1rich', ids(run, ['grass', 'fire']).concat([]));
  eq(s3.overrides, undefined, '風を連れていかなければ、風の強化は入らない');
});
test('強化の直撃の威力は、戦闘のダメージに見える（火力2 → 直撃3）', function () {
  var run = P.newRun('quest', 1);
  run.upgrades.wind.gust = 2;
  var s = P.buildBattle(run, 'c1easyA', ids(run, ['grass', 'fire', 'wind']));
  var w = R.alliesOf(s).filter(function (u) { return u.magic === 'wind'; })[0];
  var e = R.enemiesOf(s)[0];
  e.x = w.x; e.y = w.y - 1;   // 風の通り道に敵を置く（確かめ用）
  var r = R.act(s, w.id, { dir: 'up' });
  ok(r.ok, r.error);
  ok(r.events.some(function (ev) { return ev.type === 'damage' && ev.id === e.id && ev.amount === 3; }), '直撃3');
});
test('ボスは HP40（決め手1発では倒れない）', function () {
  var s = P.buildBattle(P.newRun('quest', 1), 'c2key', ['M1', 'M2', 'M3']);
  var boss = R.enemiesOf(s)[0];
  eq([boss.hp, boss.maxHp, R.enemiesOf(s)[1].hp], [40, 40, 20]);
});
test('最初の3人（草・火・風）で、どの戦闘も自動プレイで勝てる（強化なし・1人ずつ。置き場所の順はどれか1つで）', function () {
  var perms = [['M1', 'M2', 'M3'], ['M1', 'M3', 'M2'], ['M2', 'M1', 'M3'], ['M2', 'M3', 'M1'], ['M3', 'M1', 'M2'], ['M3', 'M2', 'M1']];
  Object.keys(D.battles).forEach(function (id) {
    var won = perms.some(function (pm) { return A.play(P.buildBattle(P.newRun('quest', 1), id, pm), { turns: 8, beam: 10 }).result === 'win'; });
    ok(won, id + ' は勝てなかった');
  });
});

console.log('\n' + passed + ' 件成功 / ' + failed.length + ' 件失敗');
if (failed.length) { console.log('失敗: ' + failed.join(' / ')); process.exitCode = 1; }
