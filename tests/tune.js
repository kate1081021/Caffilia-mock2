/*
 * 調整パネルと公開のテスト（IMPROVE_publish）。  node tests/tune.js
 */
var fs = require('fs');
var path = require('path');
var T = require('../tune.js');
var B = require('../balance.js');
var P = require('../tools/publish.js');

var passed = 0;
var failed = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed.push(name); console.log('  NG  ' + name); console.log('        ' + (e && e.message)); }
}
function eq(actual, expected, msg) {
  var a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error((msg ? msg + ': ' : '') + 'expected ' + b + ' but got ' + a);
}
function ok(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

var DEF = T.clone(B);

console.log('調整パネル');

test('数値と true/false を全部拾う（盤面サイズの上限・下限、配列・文字列は拾わない）', function () {
  var paths = T.items(DEF).map(function (it) { return it.path; });
  ok(paths.indexOf('ally.hp') !== -1, 'ally.hp');
  ok(paths.indexOf('mission.defense.turns') !== -1, '深い階層も拾う');
  ok(paths.indexOf('ideas.iceSlide') !== -1, 'true/false も拾う');
  ok(paths.indexOf('boardSize') !== -1, '【縮尺】盤面の大きさは出す');
  ok(paths.indexOf('maxBoardSize') === -1 && paths.indexOf('minBoardSize') === -1, '上限・下限は出さない');
  ok(paths.indexOf('windMode') === -1, '文字列は出さない');
  ok(!paths.some(function (p) { return /^shapes|nextHints|defaultMagics/.test(p); }), '配列は出さない');
});

test('balance.js に項目が増えたら、そのままパネルに出る', function () {
  var d = T.clone(DEF);
  d.newThing = { power: 7 };
  var it = T.items(d).filter(function (x) { return x.path === 'newThing.power'; })[0];
  ok(it, '増えた項目が出る');
  eq(it.label, 'newThing.power', 'ラベルがなければ元の名前');
});

test('よく触る項目は一番上にまとまり、ほかのまとまりと重ならない', function () {
  var g = T.groups(DEF);
  eq(g[0].id, '_fav');
  ok(g[0].items.some(function (it) { return it.path === 'fire.strongDamage'; }));
  var all = [];
  g.forEach(function (x) { x.items.forEach(function (it) { all.push(it.path); }); });
  eq(all.length, T.items(DEF).length, 'どの項目もちょうど1回出る');
});

test('初期値に変えた分を重ねる（初期値は変わらない）', function () {
  var o = T.overlay(DEF, { 'ally.hp': 5, 'ideas.iceSlide': false });
  eq(o.ally.hp, 5);
  eq(o.ideas.iceSlide, false);
  eq(o.enemy.hp, DEF.enemy.hp);
  eq(DEF.ally.hp, B.ally.hp, '初期値はそのまま');
});

test('本体に重ねると、前に変えた分は初期値に戻る（文字列は触らない）', function () {
  var target = T.clone(DEF);
  target.windMode = 'line';
  T.applyTo(target, DEF, { 'ally.hp': 9 });
  T.applyTo(target, DEF, { 'enemy.hp': 7 });
  eq(target.ally.hp, DEF.ally.hp, '前に変えた分は戻る');
  eq(target.enemy.hp, 7);
  eq(target.windMode, 'line', '文字列はそのまま');
});

test('変えた項目だけを取り出す', function () {
  var cur = T.overlay(DEF, { 'fire.weakDamage': 3, 'mission.defense.turns': 6 });
  eq(T.diff(DEF, cur), { 'mission.defense.turns': 6, 'fire.weakDamage': 3 }, 'balance.js の並び順');
  eq(T.diff(DEF, DEF), {});
});

test('ない項目・型の違う項目は無視され、無視した項目が分かる', function () {
  var s = T.sanitize(DEF, { 'ally.hp': 4, 'gone.item': 3, 'ally.move': 'x', 'ideas.iceSlide': 1, 'enemy.hp': DEF.enemy.hp });
  eq(s.overrides, { 'ally.hp': 4 }, '初期値と同じ値も落とす');
  eq(s.ignored.sort(), ['ally.move', 'gone.item', 'ideas.iceSlide']);
});

test('書き出し → 読み込みで元に戻る', function () {
  var ov = { 'ally.hp': 5, 'fire.strongDamage': 15, 'ideas.earthSmother': false };
  var text = T.exportText({ version: '1006', scenario: '燃え広がり', overrides: ov, comment: '炎が強すぎた\nので弱めた' }, DEF);
  ok(/版: 1006/.test(text) && /シナリオ: 燃え広がり/.test(text), '版とシナリオ');
  ok(/味方のHP（ally\.hp）: 3 → 5/.test(text), '項目名・初期値・変えた値');
  ok(/ひとこと: 炎が強すぎた \/ ので弱めた/.test(text), 'ひとことは1行に');
  ok(text.split('\n').pop().indexOf(T.PREFIX) === 0, '読み込み用は最後の1行');
  eq(T.parseText(text), ov);
  eq(T.parseText('前置き\n' + text + '\n'), ov, '前後に何かあっても読める');
});

test('変えた項目がなくても書き出せる', function () {
  var text = T.exportText({ version: '手元', scenario: '標準', overrides: {} }, DEF);
  ok(/変えた項目: なし/.test(text));
  eq(T.parseText(text), {});
});

test('共有リンクの変換 → 戻しで元に戻る', function () {
  var ov = { 'enemy.hp': 12, 'shock.base': 25, 'funka.lava': true };
  var url = T.linkFor('https://example.pages.dev/1006/#tune=old', ov);
  ok(/^https:\/\/example\.pages\.dev\/1006\/#tune=[A-Za-z0-9_-]+$/.test(url), 'URLに使える文字だけ: ' + url);
  eq(T.fromHash(url.slice(url.indexOf('#'))), ov);
  eq(T.parseText(url), ov, 'リンクを貼っても読める');
});

test('壊れたデータは読まない', function () {
  eq(T.parseText('なにもない'), null);
  eq(T.parseText(T.PREFIX + '@@@'), null);
  eq(T.fromHash('#tune=%%%'), null);
});

console.log('公開');

test('公開するのは index.html が読み込むファイルだけで、仕様・テスト・バックアップは入らない', function () {
  var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  var files = P.pageFiles(html);
  ok(files.indexOf('index.html') !== -1 && files.indexOf('ui.js') !== -1 && files.indexOf('tune_ui.js') !== -1);
  eq(files.filter(P.isForbidden), [], '公開してはいけないものがない');
  ok(files.every(function (f) { return fs.existsSync(path.join(__dirname, '..', f)); }), 'どれも手元にある');
});

test('公開してはいけないものを見分ける', function () {
  ['NOTES.md', '.claude/PROMPT.md', 'tests/run.js', 'v2/rules.js', 'publish/index.html', 'tools/publish.js', '../secret.js']
    .forEach(function (f) { ok(P.isForbidden(f), f); });
  ['ui.js', 'style.css', 'img/a.png'].forEach(function (f) { ok(!P.isForbidden(f), f); });
});

test('公開用の index.html には検索よけと版の名前が入る', function () {
  var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  var out = P.publishedHtml(html);
  ok(/<meta name="robots" content="noindex, nofollow">/.test(out));
  ok(out.indexOf('<script src="version.js"></script>') < out.indexOf('<script src="balance.js"></script>'), 'version.js は先に読む');
  ok(html.indexOf('version.js') === -1, '手元の index.html は version.js を読まない（「手元」と出す）');
});

test('固定版は上書きしない', function () {
  var cp = require('child_process');
  var pub = path.join(__dirname, '..', 'publish');
  if (!fs.existsSync(path.join(pub, '.git'))) { console.log('        （publish/ がないので飛ばす）'); return; }
  var name = '__guard_test';
  fs.mkdirSync(path.join(pub, name), { recursive: true });
  try {
    var r = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'publish.js'), name, '--no-push'], { encoding: 'utf8' });
    ok(r.status !== 0, '止まる');
    ok(/上書きしません/.test(r.stderr), r.stderr);
    eq(fs.readdirSync(path.join(pub, name)), [], '中身は増えない');
  } finally { fs.rmSync(path.join(pub, name), { recursive: true, force: true }); }
});

console.log('\n' + passed + ' passed, ' + failed.length + ' failed');
if (failed.length) process.exit(1);
