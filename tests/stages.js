/*
 * エディットで作るステージ（stages_io.js）の確かめ。  node tests/stages.js
 *   どのシナリオ・チュートリアルも、ステージの定義に書き出して読み直すと同じ盤面になる（遊び始めの1手目まで同じ）。
 *   盤面の大きさ・勝ち方・HP・会話の窓の文・ファイルの読み書き。オーナー 10/30
 */
var R = require('../game/rules.js');
var S = require('../game/stages_io.js');
var B = R.BALANCE;

var fails = 0, count = 0;
function ok(c, msg) { count++; if (!c) { fails++; console.log('NG ' + msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + '  得: ' + JSON.stringify(a) + ' 期待: ' + JSON.stringify(b)); }

// 盤面の中身（id と letter 以外）
function sig(s) {
  return JSON.stringify({ size: s.size, h: s.h, tiles: s.tiles, enemyActs: s.enemyActs, ex: s.ex, spawn: s.spawn, ov: s.overrides, eo: s.enemyOnlyMagics, m: s.mission,
    units: s.units.map(function (u) { return [u.side, u.kind, u.magic, u.x, u.y, u.facing, u.npc, u.hp, u.maxHp, u.hpBase, u.size, u.body, u.aim, u.avoid, u.cross, u.stand, u.name, u.intent]; }) });
}

// どのシナリオも、書き出して読み直すと同じ。遊び始め（敵の移動と予告）も同じ
R.PRESETS.concat(R.TUTORIALS).forEach(function (p) {
  var s = R.loadPreset(p.id), def = S.toDef(R, s, 'x'), b = S.build(R, def);
  ok(b.ok, p.id + ' 読み直せる ' + (b.error || ''));
  if (!b.ok) return;
  eq(sig(b.state), sig(s), p.id + ' 盤面が同じ');
  var f = S.fromFile(R, S.toFile({ name: 'x', def: def }));
  ok(f.ok && sig(f.state) === sig(s), p.id + ' ファイルからも同じ');
  var t1 = R.startBattle(s).state, t2 = R.startBattle(b.state).state;
  eq(sig(t2), sig(t1), p.id + ' 遊び始めも同じ');
});

// 定義の id は my: ＋名前。チュートリアルの印（やり直し・ヒント・会話の窓）が付く
var d1 = S.toDef(R, R.loadPreset('tut2'), '② の改造');
eq([d1.id, d1.tutorial, d1.custom], ['my:② の改造', true, true], 'id と印');
eq(R.buildPreset(d1).stage, 'my:② の改造', '盤面にステージの id');

// 盤面の大きさ: 置いた物は同じ位置。はみ出した物は外す。広げて戻すと元どおり
var s3 = R.loadPreset('ex3');
var r = S.resize(R, s3, 8, 6);
eq([r.state.size, R.rowsOf(r.state), r.dropped], [8, 6, 3], '③を 8×6 に（ボスと取り巻き2体がはみ出す）');
eq(r.state.units.map(function (u) { return [u.magic, u.x, u.y]; }), [['mount', 0, 3], ['fire', 1, 5], ['wind', 0, 2]], '味方は同じ位置');
var big = S.resize(R, s3, 12, 9);
eq(big.dropped, 0, '広げると何も外れない');
eq(sig(S.resize(R, big.state, 10, 7).state), sig(s3), '広げて戻すと元どおり');
eq(S.resize(R, s3, 99, 1).state.size, B.maxBoardSize, '大きさは決まりの中に収める');
eq(R.rowsOf(S.resize(R, s3, 99, 1).state), B.minBoardSize, '縦も');

// 勝ち方
eq([S.winOf(R, s3), S.winOf(R, R.loadPreset('tut2')), S.winOf(R, R.loadPreset('tut1'))], ['boss', 'seal', 'annihilate'], '今の勝ち方');
var w = S.setWin(R, s3, 'defense', 7);
eq([S.winOf(R, w), w.mission.type, !!w.ex, S.turnsOf(R, w)], ['defense', 'defense', false, 7], '村を守る 7ターン');
var w2 = S.setWin(R, w, 'boss', 0, s3.ex);
eq([S.winOf(R, w2), w2.ex, w2.overrides], ['boss', s3.ex, undefined], 'ボスに戻すと③の決まりが戻る（ターン数は外れる）');
eq(S.setWin(R, R.loadPreset('tut1'), 'boss').ex, {}, '新しくボスにすると、湧かないボスの決まり');
ok(R.validOverrides(S.setWin(R, s3, 'seal', 3).overrides), 'ふさぐの数値は正しい形');

// HP: ルールの決まり（hpBase）で遊び始めの HP になる
var hp = S.setHp(R, s3, s3.units[3].id, 30);
eq([hp.ok, R.startBattle(hp.state).state.units[3].maxHp], [true, 30], 'ボスの HP 30');
eq(R.findUnit(S.setHp(R, s3, s3.units[3].id, B.enemy.hp).state, s3.units[3].id).hpBase, undefined, 'ふつうの HP に戻すと印は外れる');
ok(!S.setHp(R, s3, s3.units[0].id, 3).ok, '味方の HP は変えない');
ok(!S.setHp(R, s3, s3.units[3].id, 0).ok, 'HP 0 は不可');

// 大きい敵の体
var boss = s3.units[3];
eq(S.fits(R, s3, boss), '', 'ボスは今の所に収まる');
ok(S.fits(R, s3, boss, 8, 2) !== '', 'ボスを右端へ動かすとはみ出す');
ok(S.fits(R, s3, boss, 7, 0) !== '', '取り巻きと重なる所には置けない');

// 会話の窓の文
var lines = S.textToLines('［一斉だけ］山使い「やあ」\nふつうの文\n\n［1人ずつだけ］x');
eq(lines, [{ who: '山使い', text: 'やあ', mode: 'simul' }, { who: '', text: 'ふつうの文', mode: 'both' }, { who: '', text: 'x', mode: 'single' }], '文の欄を読む');
eq(S.textToLines(S.linesToText(lines)), lines, '書いて読み直すと同じ');

// ファイル: 変なものは読まない。前の「配置」の JSON も読める
ok(!S.fromFile(R, '{').ok, '壊れた JSON');
ok(!S.fromFile(R, '{"format":"cafilia-stage","def":{"rows":["..."],"allies":[],"enemies":[]}}').ok, '小さすぎる盤面');
ok(!S.fromFile(R, JSON.stringify({ format: 'cafilia-stage', def: { rows: ['.....', '.....', '.....', '.....', '.....'], allies: [['fire', 9, 9]], enemies: [] } })).ok, '盤の外の味方');
ok(!S.fromFile(R, JSON.stringify({ format: 'cafilia-stage', def: { rows: ['.....', '.....', '.....', '.....', '.....'], allies: [['nope', 1, 1]], enemies: [] } })).ok, '知らない魔法');
ok(!S.fromFile(R, JSON.stringify({ format: 'cafilia-stage', def: { rows: ['M....', '.....', '.....', '.....', '.....'], allies: [['fire', 0, 0]], enemies: [] } })).ok, '山の上の味方');
var old = S.fromFile(R, R.exportLayout(R.loadPreset('tut2')), '前の配置');
ok(old.ok && old.name === '前の配置', '前の「配置」の JSON');
var file = S.fromFile(R, S.toFile({ name: '③の改造', def: S.toDef(R, s3, '③の改造'), texts: { scenes: { start: lines } } }));
eq([file.ok, file.name, file.texts.scenes.start.length], [true, '③の改造', 3], 'ステージのファイル（名前と文も）');

console.log((fails ? 'NG ' + fails + ' / ' : 'OK ') + count + ' 件');
process.exitCode = fails ? 1 : 0;
