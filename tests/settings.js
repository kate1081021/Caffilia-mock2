/*
 * 設定（画面の主な色と名前。game/settings.js。オーナー 11/03）のテスト。  node tests/settings.js
 */
var R = require('../game/rules.js');
var S = require('../game/settings.js');
var TEXTS = require('../game/texts.js');

var passed = 0, failed = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed.push(name); console.log('  NG  ' + name + '\n        ' + (e && e.message)); }
}
function eq(a, b, msg) { var x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error((msg ? msg + ': ' : '') + 'expected ' + y + ' but got ' + x); }
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }

console.log('\n■ 色');
test('変えられる色は12（メインのところ）。元の色は style.css の :root と同じ', function () {
  var css = require('fs').readFileSync(require('path').join(__dirname, '..', 'game', 'style.css'), 'utf8');
  eq(S.COLORS.length, 12);
  S.COLORS.forEach(function (c) {
    var m = new RegExp('\\n\\s*' + c.key + ':\\s*(#[0-9a-fA-F]{6})').exec(css);
    ok(m, c.key + ' が :root にある');
    eq(m[1].toLowerCase(), c.def, c.key);
  });
});
test('RGB ⇄ 色: 0〜255 に収める', function () {
  eq(S.rgbOf('#c2410c'), [194, 65, 12]);
  eq(S.hexOf([194, 65, 12]), '#c2410c');
  eq(S.hexOf([300, -5, '16']), '#ff0010', '外れた数は収める');
});
test('形を整える: 知らない色・正しくない値・元と同じ色は捨てる', function () {
  var c = S.clean({ colors: { '--bg': '#112233', '--panel': '#FFFDF8', '--nope': '#000000', '--ink': 'red' } });
  eq(c.colors, { '--bg': '#112233' });
  eq(S.clean(null), { colors: {}, tiles: {}, magics: {}, synergies: {} }, '空でも4つの入れ物');
  ok(S.isEmpty({ colors: { '--bg': '#f4f1ea' } }), '元と同じだけなら空');
});
test('色を当てる: 設定にない色は元に戻す', function () {
  var props = {};
  var doc = { documentElement: { style: { setProperty: function (k, v) { props[k] = v; }, removeProperty: function (k) { delete props[k]; } } } };
  S.applyColors(doc, { colors: { '--bg': '#000000', '--accent': '#123456' } });
  eq(props, { '--bg': '#000000', '--accent': '#123456' });
  S.applyColors(doc, { colors: { '--bg': '#000000' } });
  eq(props, { '--bg': '#000000' }, '外した色は元へ');
});

console.log('\n■ 名前');
test('名前を当てる: 自然の表示名・マップの字・魔法・シナジー。空なら元の名前。ルールの文も新しい名前で出る', function () {
  var T = JSON.parse(JSON.stringify(TEXTS));
  S.applyNames(R, T, { tiles: { forest: { name: '林', label: '林' }, mountain: { name: '岳' } }, magics: { grass: '芽' }, synergies: { '燃え広がり': '大火事' } });
  try {
    eq([R.TILE_INFO.forest.name, R.TILE_INFO.forest.label, R.TILE_INFO.mountain.name, R.TILE_INFO.mountain.label], ['林', '林', '岳', '山']);
    eq([R.magicName('grass'), R.tileName('forest'), T.finishers['燃え広がり']], ['芽', '林', '大火事']);
    var s = R.createState({ size: 6, blank: true, enemyActs: false });
    R.setTile(s, 2, 3, 'forest');
    var a = R.addAlly(s, 'fire', 2, 4, 'up');
    var r = R.act(s, a.id, { dir: 'up' });
    ok(r.events.some(function (e) { return /林が燃えた/.test(e.text || ''); }), 'ログの文も新しい名前: ' + r.events.map(function (e) { return e.text; }).join(' / '));
  } finally {
    S.applyNames(R, T, {});
  }
  eq([R.TILE_INFO.forest.name, R.TILE_INFO.forest.label, R.TILE_INFO.mountain.name, R.magicName('grass'), T.finishers['燃え広がり']], ['森', '森', '山', '草', '炎×風'], '設定を外すと元の名前（シナジーの元の名前は「当たっていた自然×当てた魔法」。オーナー 11/04）');
});
test('名前の形: 長すぎる名前は詰め、空の名前・知らない形は捨てる', function () {
  var c = S.clean({ tiles: { forest: { name: '  ', label: '森林地帯' }, Bad: { name: 'x' } }, magics: { grass: 'あいうえおかきくけこさしすせそ' }, synergies: { '桜吹雪': '' } });
  eq(c.tiles, { forest: { label: '森林地' } }, 'マップの字は3文字まで');
  eq(c.magics.grass.length, S.MAX_NAME, '名前は12文字まで');
  eq(c.synergies, {});
});

test('シナジーの元の名前は「自然×魔法」の形（順番あり）。途中でできた自然（火山・火の渦など）は元の組み合わせまでほどく（オーナー 11/04）', function () {
  eq([TEXTS.finishers['燃え広がり'], TEXTS.finishers['桜吹雪'], TEXTS.finishers['火の渦'], TEXTS.finishers['火山'], TEXTS.finishers['センタクキ']], ['炎×風', '山×火×風', '風×火', '山×火', '風×火×水']);
  ok(!Object.keys(TEXTS.finishers).some(function (k) { return /火山×|火の渦×|死の森×|竜巻×/.test(TEXTS.finishers[k]); }), '火山・火の渦・死の森・竜巻は名前の中に出さない');
  ok(Object.keys(TEXTS.finishers).every(function (k) { return /×/.test(TEXTS.finishers[k]); }), 'どれも「×」の形');
});
console.log('\n' + passed + ' 件成功 / ' + failed.length + ' 件失敗');
if (failed.length) process.exitCode = 1;
