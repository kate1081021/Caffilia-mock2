/*
 * ステージの前後の会話（まえげき・あとげき）と、キャラの登録のテスト。  node tests/talk.js
 *   データの形・エディットの欄の書き方・ステージの定義に乗ること・出すかどうかの決め方（stages_io.js の talkDue）。
 *   画面（talk.js: 重ねて出す・タップで進む・とばす）は node では動かないので、内蔵ブラウザで確かめる。オーナー 11/13
 */
var R = require('../game/rules.js');
var S = require('../game/stages_io.js');
var B = require('../game/balance.js');
var CC = require('../game/chars.js');
var CHARS = CC.CHARS;

var passed = 0, failed = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed.push(name); console.log('  NG  ' + name); console.log('        ' + (e && e.message)); }
}
function eq(a, b, msg) { var x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error((msg ? msg + ': ' : '') + 'expected ' + y + ' but got ' + x); }
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }

console.log('\n■ キャラの登録（game/chars.js。最初の中身と、形の整え方）');
test('最初の中身: 仮の2人とデフォルト敵。名前・色・会話の絵（normal はいつもある）・戦闘の絵を持つ', function () {
  var ids = Object.keys(CHARS);
  eq(ids, ['charA', 'charB', 'enemy']);
  ids.forEach(function (id) {
    var c = CHARS[id];
    ok(typeof c.name === 'string' && c.name, id + ' の名前');
    ok(/^#[0-9a-f]{6}$/i.test(c.color), id + ' の色');
    ok(c.faces && typeof c.faces.normal === 'string', id + ' のふだんの絵（表情は faces に足せる）');
    ok(typeof c.battle === 'string', id + ' の戦闘の絵');
  });
  eq(CC.now().cast, { ally: {}, enemy: {}, enemyDefault: 'enemy' });
  eq(CC.now().objects, { village: '', wagon: '' }, '村・トロッコの絵（空なら前の決まった名前の絵か、今の形）');
});
test('形を整える: 知らない項目・正しくない絵・いないキャラへの割り当ては捨てる。normal はいつもある', function () {
  var d = CC.clean({ list: { a: { name: ' A ', color: 'red', faces: { 笑う: 'up:x1', 'a b': '', bad: 'https://x/y.png' }, battle: 'javascript:1', hp: 3 }, 'b-c': { name: 'x' } },
    cast: { ally: { fire: 'a', water: 'nobody' }, enemy: { Fire: 'a' }, enemyDefault: 'nobody' }, junk: 1 });
  eq(d, { list: { a: { name: 'A', color: '#57534e', faces: { normal: '', 笑う: 'up:x1' }, battle: '' } }, cast: { ally: { fire: 'a' }, enemy: {}, enemyDefault: '' }, objects: { village: '', wagon: '' } });
  var o = CC.clean({ objects: { village: 'up:v1', wagon: 'nope', castle: 'up:c1' } });
  eq([o.objects, CC.objectRef('village', o), CC.imgIds(o)], [{ village: 'up:v1', wagon: '' }, 'up:v1', ['v1']]);
  eq(CC.clean(null).list, {});
});
test('駒 → キャラ: 味方は魔法、敵は魔法 → なければデフォルト敵（ボス・取り巻きも）。置きものはなし', function () {
  var d = CC.clean({ list: { h: { name: 'H', color: '#000000', faces: { normal: 'up:n1' }, battle: '' }, e: { name: 'E', color: '#000000', faces: { normal: '' }, battle: 'game/img/e.png' },
    w: { name: 'W', color: '#000000', faces: { normal: '' }, battle: '' } }, cast: { ally: { fire: 'h' }, enemy: { wind: 'w' }, enemyDefault: 'e' } });
  eq([CC.castOf({ side: 'ally', magic: 'fire' }, d), CC.castOf({ side: 'ally', magic: 'water' }, d), CC.castOf({ side: 'enemy', magic: 'wind' }, d),
    CC.castOf({ side: 'enemy', magic: 'fire', stand: 'boss' }, d), CC.castOf({ side: 'object', kind: 'village' }, d)], ['h', null, 'w', 'e', null]);
  eq([CC.battleRef('h', d), CC.battleRef('e', d), CC.battleRef('w', d), CC.faceRef('h', '笑う', d)], ['up:n1', 'game/img/e.png', '', 'up:n1'], '戦闘の絵が空ならふだんの絵。ない表情はふだんの絵');
  eq(CC.imgIds(d), ['n1']);
});
test('キャラを入れ替えても window.CHARS は同じ入れ物（会話の画面が先に掴んでいても届く）', function () {
  var box = CC.CHARS;
  CC.apply({ list: { z: { name: 'Z', color: '#000000', faces: { normal: '' } } }, cast: {} });
  ok(CC.CHARS === box && Object.keys(box).join() === 'z');
  CC.apply(CC.DEFAULT);
  eq(Object.keys(box), ['charA', 'charB', 'enemy']);
});

console.log('\n■ ステージのデータ');
test('チュートリアル①②③に、仮のまえげき（3行）とあとげき（2行）が入っている。喋るのは登録したキャラで、左右に分かれる', function () {
  ['tut1', 'tut2', 'ex3'].forEach(function (id) {
    var t = R.findPreset(id).talk;
    ok(t, id + ' に会話がある');
    eq(S.checkTalk(t), '', id + ' の形');
    eq([t.before.length, t.after.length], [3, 2], id);
    t.before.concat(t.after).forEach(function (l) {
      ok(CHARS[l.who], id + ': ' + l.who + ' は登録したキャラ');
      ok(l.side === 'left' || l.side === 'right', id + ': 側');
      ok(/【仮】$/.test(l.text), id + ': 仮の文のしるし');
    });
    var sides = {};
    t.before.forEach(function (l) { sides[l.side] = l.who; });
    ok(sides.left && sides.right && sides.left !== sides.right, id + ': 向かい合う2人');
  });
});
test('会話はステージの定義に乗る: 書き出して読み直しても同じ。遊んでいる盤面には持たせない（ルールは使わない）', function () {
  ['tut1', 'tut2', 'ex3'].forEach(function (id) {
    var p = R.findPreset(id), s = R.loadPreset(id), def = S.toDef(R, s, 'x');
    eq(def.talk, p.talk, id + ' 定義に入る');
    var b = S.build(R, def);
    ok(b.ok, b.error);
    eq(S.toDef(R, b.state, 'x').talk, p.talk, id + ' 読み直し');
    var f = S.fromFile(R, S.toFile({ name: 'x', def: def }));
    ok(f.ok && JSON.stringify(f.def.talk) === JSON.stringify(p.talk), id + ' ファイルからも同じ');
    var play = R.startBattle(s).state;
    eq(play.talk, undefined, id + ' 遊んでいる盤面');
    eq(S.resize(R, s, s.size, R.rowsOf(s)).state.talk, p.talk, id + ' 盤面の大きさを変えても残る');
  });
});
test('会話のないステージの定義には talk を書かない（今までと同じ形）。会話があってもなくても、遊び始めは同じ', function () {
  R.PRESETS.forEach(function (p) { ok(!('talk' in S.toDef(R, R.loadPreset(p.id), 'x')), p.id); });
  var p = R.clone(R.findPreset('tut2')), q = R.clone(p);
  delete q.talk;
  eq(R.startBattle(R.buildPreset(p)).state, R.startBattle(R.buildPreset(q)).state);
});
test('形の正しくない会話のステージは読まない', function () {
  var def = S.toDef(R, R.loadPreset('tut1'), 'x');
  var bad = function (talk) { var d = R.clone(def); d.talk = talk; return S.build(R, d); };
  ok(!bad([]).ok && !bad({ before: 'こんにちは' }).ok, '並びでない');
  ok(!bad({ before: [{ who: 'charA', side: 'up', text: 'あ' }] }).ok, '知らない側');
  ok(!bad({ before: [{ who: 'charA', side: 'left' }] }).ok, '文がない');
  ok(!bad({ before: [{ who: 'charA', side: 'left', text: new Array(300).join('あ') }] }).ok, '長すぎる文');
  ok(bad({ before: [{ who: 'だれか', side: 'right', text: 'あ', face: 'smile' }], after: [], mid: [{ text: '語り' }] }).ok, '登録のない名前・表情・語り・ほかの名前の場面は書ける');
});

console.log('\n■ エディットの欄の書き方');
test('「左 キャラA「文」」「右 キャラB「文」」の行が、会話の行になる。戻しても同じ', function () {
  var text = '左 キャラA「敵が来る」\n右 キャラB「道をふさごう」\n左 キャラA「わかった」';
  var lines = S.textToTalk(text, CHARS);
  eq(lines, [{ who: 'charA', side: 'left', text: '敵が来る' }, { who: 'charB', side: 'right', text: '道をふさごう' }, { who: 'charA', side: 'left', text: 'わかった' }]);
  eq(S.talkToText(lines, CHARS), text);
  ['tut1', 'tut2', 'ex3'].forEach(function (id) {
    var t = R.findPreset(id).talk;
    eq(S.textToTalk(S.talkToText(t.before, CHARS), CHARS), t.before, id + ' まえげき');
    eq(S.textToTalk(S.talkToText(t.after, CHARS), CHARS), t.after, id + ' あとげき');
  });
});
test('左・右を書かなければ、初めてのキャラは空いている側、2度目からは前にいた側。表情・語り・登録のない名前も書ける', function () {
  var lines = S.textToTalk('キャラA「1」\nキャラB「2」\nキャラA「3」\n  \nキャラB:笑う「4」\nそのとき、山が動いた\n村長「5」\ncharA「6」', CHARS);
  eq(lines.map(function (l) { return [l.who, l.side, l.text, l.face]; }), [
    ['charA', 'left', '1', undefined], ['charB', 'right', '2', undefined], ['charA', 'left', '3', undefined],
    ['charB', 'right', '4', '笑う'], ['', 'left', 'そのとき、山が動いた', undefined], ['村長', 'right', '5', undefined], ['charA', 'left', '6', undefined]]);
  eq(S.checkTalk({ before: lines }), '');
  eq(S.talkToText(lines, CHARS).split('\n')[3], '右 キャラB:笑う「4」');
  eq(S.textToTalk('', CHARS), []);
});
test('エディットの盤面の会話を書きかえる（元の盤面は変えない）', function () {
  var s = R.loadPreset('spread');
  var a = S.setTalk(R, s, 'before', [{ who: 'charA', side: 'left', text: 'やあ' }]);
  eq([s.talk, a.talk], [undefined, { before: [{ who: 'charA', side: 'left', text: 'やあ' }], after: [] }]);
  eq(S.toDef(R, a, 'x').talk, a.talk);
  eq(S.setTalk(R, a, 'before', []).talk, { before: [], after: [] }, '空にもできる（空の会話は出ない）');
});

console.log('\n■ いつ出すか');
var LINES = [{ who: 'charA', side: 'left', text: 'あ' }];
function due(more) {
  var o = { kind: 'before', lines: LINES, context: 'tutorial', show: B.talk.show, seen: false, editMode: false, replay: false };
  Object.keys(more || {}).forEach(function (k) { o[k] = more[k]; });
  return S.talkDue(o);
}
test('初めてのときだけ出す。もう出したステージ・エディット中・プレイ集を流している間・文のないステージでは出さない', function () {
  ok(due(), '初めて');
  ok(!due({ seen: true }), 'もう出した（やり直し・リセット・2度目の勝ち）');
  ok(due({ seen: true, context: 'own' }), '自分のステージ（テストプレイも）は、もう出していても毎回出す（オーナー 11/14）');
  ok(!due({ seen: true, context: 'shared' }) && !due({ seen: true, context: 'exhibit' }));
  ok(!due({ editMode: true }) && !due({ replay: true }));
  ok(!due({ lines: [] }) && !due({ lines: undefined }), '会話を付けていないステージ');
});
test('並びごとに入切できる（balance.js の talk.show）。今はどれも入（展示モードも。オーナー 11/14）', function () {
  eq(B.talk.show, { tutorial: true, shared: true, own: true, exhibit: true });
  eq(['tutorial', 'shared', 'own', 'exhibit'].map(function (c) { return due({ context: c }); }), [true, true, true, true]);
  eq(['tutorial', 'exhibit'].map(function (c) { return due({ context: c, show: { tutorial: false, exhibit: true } }); }), [false, true]);
});

console.log('\n' + passed + ' 件成功 / ' + failed.length + ' 件失敗');
if (failed.length) { console.log('失敗: ' + failed.join(' ／ ')); process.exit(1); }
