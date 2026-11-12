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
eq([S.winOf(R, s3), S.winOf(R, R.loadPreset('tut2')), S.winOf(R, R.loadPreset('tut1'))], ['boss', 'defense', 'annihilate'], '今の勝ち方（②は村を守る。道をふさぐは村を守るに1つにした 11/03）');
var w = S.setWin(R, s3, 'defense', 7);
eq([S.winOf(R, w), w.mission.type, !!w.ex, S.turnsOf(R, w)], ['defense', 'defense', false, 7], '村を守る 7ターン');
var w2 = S.setWin(R, w, 'boss', 0, s3.ex);
eq([S.winOf(R, w2), w2.ex, w2.overrides], ['boss', s3.ex, undefined], 'ボスに戻すと③の決まりが戻る（ターン数は外れる）');
eq(S.setWin(R, R.loadPreset('tut1'), 'boss').ex, {}, '新しくボスにすると、湧かないボスの決まり');
var ws = S.setWin(R, s3, 'seal', 3);
ok(R.validOverrides(ws.overrides), 'ふさぐの数値は正しい形');
eq([S.winOf(R, ws), S.turnsOf(R, ws), ws.overrides['mission.defense.sealWin']], ['defense', 3, undefined], '前の「道をふさぐ」（seal）を選ぶと村を守る（sealWin は書かない）');
var WINS_IDS = S.WINS.map(function (x) { return x.id; });
ok(WINS_IDS.indexOf('seal') < 0 && WINS_IDS.indexOf('defense') >= 0, '勝ち方の一覧に「道をふさぐ」はない（村を守るだけ）');
var oldDef = S.toDef(R, w, '前の防衛');
oldDef.overrides = { 'mission.defense.turns': 4, 'mission.defense.sealWin': false };
var ob = S.build(R, oldDef);
ok(ob.ok, ob.error);
eq(ob.ok && [S.winOf(R, ob.state), ob.state.overrides], ['defense', { 'mission.defense.turns': 4 }], '前の JSON の sealWin の上書きは捨てて読む（村を守る・4ターン）');

// 難易度と一覧の1行（オーナー 11/03。IMPROVE_ステージ一覧 段1・段2）
eq(S.DIFFICULTIES.map(function (d) { return d.name; }), ['チュートリアル', 'やさしい', 'ふつう', 'むずかしい'], '難易度は4段');
var dd = S.toDef(R, R.loadPreset('tut1'), '難易度つき');
dd.difficulty = 'hard';
var db = S.build(R, dd);
ok(db.ok, db.error);
eq([S.diffOf(dd), S.diffOf({}), S.diffOf(null)], ['hard', '', ''], '定義の difficulty（ないものは「なし」）');
eq(S.fromFile(R, S.toFile({ name: '難易度つき', def: dd })).def.difficulty, 'hard', 'ファイルに書き出して読んでも残る');
eq(S.checkDef(R, Object.assign({}, dd, { difficulty: 'super' })), '知らない難易度がある', '知らない難易度は読まない');
eq([S.magicsOf(R, R.findPreset('tut1')), S.magicsOf(R, R.findPreset('tut2')), S.magicsOf(R, R.findPreset('ex3'))], ['風（仲間）・火', '山・水', '山・火・風'], '使う魔法（構える味方は「仲間」）');
eq([S.winLabel(R, R.findPreset('tut1')), S.winLabel(R, R.findPreset('tut2')), S.winLabel(R, R.findPreset('ex3')), S.winLabel(R, S.toDef(R, S.setWin(R, s3, 'defense', 7), 'x'))],
  ['戦闘', '防衛', 'ボス', '防衛'], 'クリア方法は区分の短い名前（オーナー 11/03）');
eq(S.WIN_KINDS.map(function (w) { return w.name; }), ['戦闘', 'ボス', '防衛', '護衛', '奪取'], 'クリア方法の区分');
eq([S.winKind({ rows: [], mission: 'escort' }), S.winKind({ rows: [], mission: 'retrieve' }), S.winKind({ rows: [] })], ['escort', 'retrieve', 'battle']);
eq([S.plainTitle('【チュートリアル】① 重ねる'), S.plainTitle('森の道')], ['① 重ねる', '森の道'], '名前の区分の印は一覧では外す');

// 自分のステージのゴミ箱（オーナー 11/03。IMPROVE_ステージ一覧 段3）
var st0 = { '森': { def: dd, at: 1 }, '山': { def: dd, at: 2 } };
var t1 = S.trashPut(st0, {}, '森', 100);
eq([Object.keys(t1.stages), t1.key, t1.trash['森'].name, t1.trash['森'].deletedAt, t1.trash['森'].rec.at], [['山'], '森', '森', 100, 1], 'ゴミ箱へ移す（中身はそのまま）');
eq(Object.keys(st0), ['森', '山'], 'もとの入れ物は変えない');
var t2 = S.trashPut(Object.assign({ '森': { def: dd, at: 3 } }, t1.stages), t1.trash, '森', 200);
eq(Object.keys(t2.trash).sort(), ['森', '森（2）'], '同じ名前を2回消すと、ゴミ箱で「名前（2）」');
var r1 = S.trashRestore(Object.assign({ '森': { def: dd, at: 9 } }, t2.stages), t2.trash, '森');
eq([r1.name, Object.keys(r1.trash)], ['森（2）', ['森（2）']], '同じ名前があれば「名前（2）」で戻す');
eq(r1.stages['森（2）'].at, 1, '戻ったのは消した中身');
eq(S.trashRestore({}, {}, 'ない').name, null, 'ゴミ箱にないものは戻せない');

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

// ファイルから読む（オーナー 11/10）: まとめたファイルからいくつでも。読めないものは飛ばして理由を残す。同じ名前は上書きしない
var one = JSON.parse(S.toFile({ name: 'あ', def: S.toDef(R, R.loadPreset('tut1'), 'あ') }));
var two = JSON.parse(S.toFile({ name: 'い', def: S.toDef(R, R.loadPreset('tut2'), 'い'), texts: { goal: '守る', hint: { simul: 'ヒント', single: 'ヒント' } } }));
var bad = { format: 'cafilia-stage', name: 'う', def: { rows: ['...'], allies: [], enemies: [] } };
var many = S.fromFiles(R, JSON.stringify({ format: S.FORMAT_MANY, stages: [one, bad, two] }));
eq([many.items.map(function (it) { return it.name; }), many.errors.map(function (e) { return e.name; })], [['あ', 'い'], ['う']], 'まとめたファイル: 読めるものだけ読み、読めないものは理由つきで残す');
eq(S.fromFiles(R, JSON.stringify([one, two])).items.length, 2, '並び（配列）でも読める');
eq(S.fromFiles(R, JSON.stringify(one)).items.length, 1, 'ステージのファイル1つでも読める');
eq(S.fromFiles(R, '{').errors.length, 1, '壊れた JSON は読まない');
var added = S.addOwn({ 'あ': { def: {}, at: 1 } }, many.items, 1000);
eq(added.names, ['あ（2）', 'い'], '同じ名前があれば番号を付ける（上書きしない）');
eq([added.stages['あ'].at, added.stages['あ（2）'].def.id, added.stages['あ（2）'].def.custom, added.stages['あ（2）'].texts.name], [1, 'my:あ（2）', true, 'あ（2）'], '元の自分のステージは変わらず、足したものは自分のステージの形');
ok(added.stages['あ（2）'].at > added.stages['い'].at, 'ファイルの順に、一覧の上から並ぶ（新しく直した順）');
eq(added.stages['い'].texts.goal, '守る', '目標とヒントの文も入る');
ok(S.build(R, added.stages['い'].def).ok, '足したものはそのまま遊べる');

// ステージごとに変えてよい数値は、守るターン数と敵の歩数だけ（オーナー 11/12「魔法が場面によって別のはたらきをするのはおかしい」）
var lockBase = S.toDef(R, R.loadPreset('tut1'), '上書きの確かめ');
var lockOk = Object.assign({}, lockBase, { overrides: { 'mission.defense.turns': 4, 'enemy.rushMove': 2 } });
ok(S.build(R, lockOk).ok, '守るターン数と敵の歩数は、ステージごとに変えられる');
[{ 'spread.maxLength': 5 }, { 'ideas.grassWater': false }, { 'waterLength': 2 }, { 'shapes.mount': [[0, 1]] }, { 'mission.defense.turns': 4, 'lineLength': 6 }].forEach(function (ov) {
  ok(R.validOverrides(ov), 'ルールが知っている項目: ' + JSON.stringify(ov));
  var lb = S.build(R, Object.assign({}, lockBase, { overrides: ov }));
  ok(!lb.ok && /守るターン数と敵の歩数だけ/.test(lb.error), '魔法の効き方を変える上書きのあるステージは読まない: ' + JSON.stringify(ov) + ' → ' + JSON.stringify(lb.error || lb.ok));
});
ok(!S.fromFile(R, JSON.stringify({ format: 'cafilia-stage', name: 'だめ', def: Object.assign({}, lockBase, { overrides: { 'spread.maxLength': 5 } }) })).ok, 'ファイルから読むときも断る');
R.TUTORIALS.concat(R.PRESETS.filter(function (p) { return p.tutorial || p.ex; })).forEach(function (p) {
  ok(Object.keys(p.overrides || {}).every(function (k) { return S.STAGE_OVERRIDES.indexOf(k) >= 0; }), '内蔵のステージ「' + p.id + '」も、変えているのはこの2つだけ');
});
// 読んだステージの背番号（プレイ集の記録が指す番号）: 写しなので新しい背番号。作る関数がなければ付けない（最初に読んだときに付く）
var uidItems = [{ name: 'う', def: Object.assign({ uid: 'sOLD' }, dd), texts: null }];
var nUid = 0;
eq(S.addOwn({}, uidItems, 5, function () { return 'sNEW' + (++nUid); }).stages['う'].def.uid, 'sNEW1', 'ファイルから読んだものは新しい背番号');
eq(S.addOwn({}, uidItems, 5).stages['う'].def.uid, undefined, '作る関数がなければ、ファイルの背番号は持ちこまない');

// チュートリアルをどこから出すか（オーナー 11/12）: 置き場所 → このブラウザの控え → コード
var tCloud = { tut1: { def: {} } }, tCache = { tutorials: { tut1: { def: {} }, tut2: { def: {} } }, at: 123 };
eq(S.tutorialSource({ ok: true, tutorials: tCloud }, tCache).from, 'cloud', 'つながっていて置いてあれば、置き場所');
ok(S.tutorialSource({ ok: true, tutorials: tCloud }, tCache).tutorials === tCloud, '置き場所の中身を出す');
eq([S.tutorialSource({ ok: false, tutorials: null }, tCache).from, S.tutorialSource({ ok: false, tutorials: null }, tCache).at], ['cache', 123], 'つながらないときは、控え（控えた時刻つき）');
ok(S.tutorialSource({ ok: false }, tCache).tutorials === tCache.tutorials, '控えの中身を出す');
eq([S.tutorialSource({ ok: false }, null).from, S.tutorialSource({ ok: false }, {}).from, S.tutorialSource({ ok: false }, { tutorials: {} }).from, S.tutorialSource(null, null).from], ['code', 'code', 'code', 'code'], '控えがない（一度もつながったことがない）ときだけ、コード');
eq(S.tutorialSource({ ok: false }, null).tutorials, null, 'コードのときは中身なし（画面がコードの①②③を出す）');
eq([S.tutorialSource({ ok: true, tutorials: null }, tCache).from, S.tutorialSource({ ok: true, tutorials: {} }, tCache).from], ['code', 'code'], 'つながっているのにまだ置いていないときは、控えではなくコード（最初の中身を置く前）');

// チュートリアルの id の並び（足す・消す。オーナー 11/12）: 初めからある①②③が先、足したものは足した順。消したものは出ない
var FIRST = ['tut1', 'tut2', 'ex3'];
eq(S.tutorialIds({ ex3: { at: 1 }, tut1: { at: 1 }, tut2: { at: 1 } }, FIRST), FIRST, '①②③の順');
eq(S.tutorialIds({ tb: { at: 30 }, ex3: { at: 1 }, ta: { at: 20 }, tut1: { at: 99 } }, FIRST), ['tut1', 'ex3', 'ta', 'tb'], '消した②は出ない。足したものは足した順に末尾');
eq([S.tutorialIds(null, FIRST), S.tutorialIds({}, FIRST)], [[], []], '何もなければ空');
eq(S.applyOrder(S.tutorialIds({ tut1: {}, ta: { at: 5 }, tb: { at: 9 } }, FIRST), ['ta', 'tut2', 'tut1']), ['ta', 'tut1', 'tb'], '手で決めた順番に乗る（新しく足した tb は末尾・消した tut2 は飛ばす）');

// 並び替えの部品（オーナー 11/12）: チュートリアル・みんなのステージ・展示の並びで同じものを使う
eq(S.applyOrder(['a', 'b', 'c'], null), ['a', 'b', 'c'], '順番がなければ、今の並びのまま');
eq(S.applyOrder(['a', 'b', 'c'], ['c', 'a']), ['c', 'a', 'b'], '手で決めた順番が先。入っていない新しいものは末尾');
eq(S.applyOrder(['a', 'b', 'c', 'd'], ['c', 'x', 'a', 'c']), ['c', 'a', 'b', 'd'], 'もうないもの・重なりは飛ばす。新しいものは今の並びの順に末尾');
eq(S.applyOrder([], ['a']), [], '何もなければ空');
var mvList = ['a', 'b', 'c', 'd'];
eq([S.moveTo(mvList, 2, 1), S.moveTo(mvList, 0, 1), S.moveTo(mvList, 3, 0), S.moveTo(mvList, 0, 3)], [['a', 'c', 'b', 'd'], ['b', 'a', 'c', 'd'], ['d', 'a', 'b', 'c'], ['b', 'c', 'd', 'a']], '上へ・下へ・離れた所へ（札で絞ったときの、見えている隣）');
eq([S.moveTo(mvList, 0, -1), S.moveTo(mvList, 3, 4), S.moveTo(mvList, 1, 1), S.moveTo(mvList, 0.5, 1)], [mvList, mvList, mvList, mvList], '端より先・同じ所・正しくない位置は、同じ並び');
eq(mvList, ['a', 'b', 'c', 'd'], '元の並びは変えない');
eq(S.applyOrder(['tut1', 'tut2', 'ex3'], S.moveTo(['tut1', 'tut2', 'ex3'], 2, 0)), ['ex3', 'tut1', 'tut2'], '動かした並びを順番として当てると、その順');
// ドラッグで落とした所へ入れる（オーナー 11/13）: すぐ下に見えている行の前。なければ、すぐ上に見えている行の後ろ。どちらもなければ末尾
eq([S.placeAt(mvList, 'd', 'b', 'a'), S.placeAt(mvList, 'a', null, 'd'), S.placeAt(mvList, 'c', 'a', null)], [['a', 'd', 'b', 'c'], ['b', 'c', 'd', 'a'], ['c', 'a', 'b', 'd']], '間へ・一番下へ・一番上へ');
eq(S.placeAt(mvList, 'b', 'c', 'a'), mvList, '同じ所に落としたら、同じ並び');
eq([S.placeAt(mvList, 'x', 'c', 'b'), S.placeAt(mvList, 'x', null, null), S.placeAt([], 'x', null, null)], [['a', 'b', 'x', 'c', 'd'], ['a', 'b', 'c', 'd', 'x'], ['x']], 'ほかの枠から来たものは足す（空の枠にも落とせる）');
eq(S.placeAt(['a', 'h1', 'b', 'h2', 'c'], 'c', 'b', 'a'), ['a', 'h1', 'c', 'b', 'h2'], '札で絞っていて見えない行（h1・h2）は、その場に残る');
eq([S.placeAt(mvList, 'a', 'zz', 'c'), S.placeAt(mvList, 'a', 'zz', 'yy')], [['b', 'c', 'a', 'd'], ['b', 'c', 'd', 'a']], '知らない行を指していたら、上の行の後ろ・末尾');
eq(mvList, ['a', 'b', 'c', 'd'], '元の並びは変えない（placeAt）');

console.log((fails ? 'NG ' + fails + ' / ' : 'OK ') + count + ' 件');
process.exitCode = fails ? 1 : 0;
