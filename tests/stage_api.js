/*
 * 共有の置き場所（tools/stage_worker.mjs）のテスト（IMPROVE_v3 段4）。  node tests/stage_api.js
 *   Cloudflare の KV の代わりに、ここの中だけの入れ物で動かす
 */
var path = require('path');
var url = require('url');

var passed = 0, failed = [];
function ok(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { var x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error((msg ? msg + ': ' : '') + 'expected ' + y + ' but got ' + x); }

var mem = {};
var kv = {
  get: function (k, type) { return Promise.resolve(k in mem ? (type === 'json' ? JSON.parse(mem[k]) : mem[k]) : null); },
  put: function (k, v) { mem[k] = String(v); return Promise.resolve(); }
};
var DEF = { rows: ['......', '......'], allies: [], enemies: [] };

import(url.pathToFileURL(path.join(__dirname, '..', 'tools', 'stage_worker.mjs')).href).then(async function (W) {
  function call(method, p, body, store) {
    var r = new Request('http://x/api/' + p, { method: method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return W.handleApi(r, store === undefined ? kv : store).then(function (res) { return res.text().then(function (t) { return { status: res.status, data: t ? JSON.parse(t) : null, cors: res.headers.get('access-control-allow-origin') }; }); });
  }
  async function test(name, fn) {
    try { await fn(); passed++; console.log('  ok  ' + name); }
    catch (e) { failed.push(name); console.log('  NG  ' + name + '\n        ' + (e && e.message)); }
  }

  await test('はじめは空。CORS は *（ファイルから開いたページからも使える）', async function () {
    var r = await call('GET', 'all');
    eq([r.status, r.data.stages, r.data.lineup, r.data.trash, r.data.settings, r.cors], [200, {}, null, {}, null, '*'], '設定はまだない（null）');
  });
  await test('共有すると、みんなのステージに入る。同じ名前は上書き', async function () {
    var a = await call('PUT', 'stages/' + encodeURIComponent('森の道'), { def: DEF, texts: { scenes: { start: [] } } });
    ok(a.status === 200 && a.data.ok, JSON.stringify(a.data));
    var b = await call('PUT', 'stages/' + encodeURIComponent('森の道'), { def: { rows: ['F.....'], allies: [], enemies: [] }, texts: null });
    ok(b.data.ok);
    var r = await call('GET', 'all');
    eq(Object.keys(r.data.stages), ['森の道']);
    eq(r.data.stages['森の道'].def.rows, ['F.....'], '上書きされた');
  });
  await test('中身が正しくないもの・長すぎる名前は受け取らない', async function () {
    eq((await call('PUT', 'stages/x', { def: {} })).status, 400);
    eq((await call('PUT', 'stages/' + encodeURIComponent(new Array(42).join('あ')), { def: DEF })).status, 400);
  });
  await test('展示の並び: tut: と all: だけ。入っているみんなのステージは消せない', async function () {
    eq((await call('PUT', 'lineup', { start: ['tut:tut1', 'my:森'], pick: [] })).status, 400, 'my: は受け取らない');
    ok((await call('PUT', 'lineup', { start: ['tut:tut1'], pick: ['all:森の道'] })).data.ok);
    var r = await call('GET', 'all');
    eq([r.data.lineup.start, r.data.lineup.pick], [['tut:tut1'], ['all:森の道']]);
    var d = await call('DELETE', 'stages/' + encodeURIComponent('森の道'));
    eq(d.status, 409, '並びに入っているので消せない');
    ok((await call('PUT', 'lineup', { start: ['tut:tut1'], pick: [] })).data.ok);
    ok((await call('DELETE', 'stages/' + encodeURIComponent('森の道'))).data.ok, '外したら消せる');
    eq(Object.keys((await call('GET', 'all')).data.stages), []);
  });
  // ゴミ箱（オーナー 11/03。IMPROVE_ステージ一覧 段3）
  await test('消すとゴミ箱へ移る（完全には消えない）。中身・消した時刻・もとの名前が残る', async function () {
    var r = await call('GET', 'all');
    eq(Object.keys(r.data.trash), ['森の道'], '上の「消す」はゴミ箱へ');
    var t = r.data.trash['森の道'];
    eq([t.name, t.def.rows, typeof t.deletedAt], ['森の道', ['F.....'], 'number']);
  });
  await test('ゴミ箱から戻す。同じ名前のステージがあれば「名前（2）」で戻す', async function () {
    ok((await call('PUT', 'stages/' + encodeURIComponent('森の道'), { def: DEF, texts: null })).data.ok, '同じ名前を新しく共有');
    var b = await call('POST', 'trash/' + encodeURIComponent('森の道') + '/restore');
    eq([b.status, b.data.name], [200, '森の道（2）']);
    var r = await call('GET', 'all');
    eq([Object.keys(r.data.stages).sort(), r.data.trash], [['森の道', '森の道（2）'], {}]);
    eq(r.data.stages['森の道（2）'].def.rows, ['F.....'], '戻ったのは消した中身');
    eq((await call('POST', 'trash/' + encodeURIComponent('ない') + '/restore')).status, 404, 'ゴミ箱にないものは戻せない');
  });
  await test('同じ名前を2回消すと、ゴミ箱では「名前（2）」で両方残る。完全に消すとゴミ箱からなくなる', async function () {
    ok((await call('DELETE', 'stages/' + encodeURIComponent('森の道'))).data.ok);
    ok((await call('PUT', 'stages/' + encodeURIComponent('森の道'), { def: DEF, texts: null })).data.ok);
    var d2 = await call('DELETE', 'stages/' + encodeURIComponent('森の道'));
    eq(d2.data.trashed, '森の道（2）');
    eq(Object.keys((await call('GET', 'all')).data.trash).sort(), ['森の道', '森の道（2）']);
    ok((await call('DELETE', 'trash/' + encodeURIComponent('森の道（2）'))).data.ok);
    ok((await call('DELETE', 'trash/' + encodeURIComponent('森の道'))).data.ok);
    eq((await call('GET', 'all')).data.trash, {}, '完全に消えた');
  });
  await test('ゴミ箱がいっぱいなら、消すのを断る（勝手に古いものを消さない）', async function () {
    var full = {};
    for (var i = 0; i < 500; i++) full['x' + i] = { name: 'x' + i, def: DEF, deletedAt: 1 };
    mem.trash = JSON.stringify(full);
    ok((await call('PUT', 'stages/a', { def: DEF })).data.ok);
    var d = await call('DELETE', 'stages/a');
    eq(d.status, 409);
    ok('a' in (await call('GET', 'all')).data.stages, '消えずに残る');
    mem.trash = JSON.stringify({});
    ok((await call('DELETE', 'stages/a')).data.ok);
    ok((await call('DELETE', 'trash/a')).data.ok);
  });
  // 設定（画面の主な色と名前。オーナー 11/03）
  await test('設定を保存すると /api/all に出る（保存した時刻つき）', async function () {
    var body = { colors: { '--bg': '#112233' }, tiles: { forest: { name: '林', label: '林' } }, magics: { grass: '芽' }, synergies: { '燃え広がり': '大火事' } };
    var r = await call('PUT', 'settings', body);
    ok(r.status === 200 && r.data.ok && typeof r.data.at === 'number', JSON.stringify(r.data));
    var g = (await call('GET', 'all')).data.settings;
    eq([g.colors, g.tiles, g.magics, g.synergies, g.at], [body.colors, body.tiles, body.magics, body.synergies, r.data.at]);
    ok((await call('PUT', 'settings', {})).data.ok, '空（元の色と名前）も保存できる');
    eq((await call('GET', 'all')).data.settings.colors, {});
  });
  await test('設定の形が正しくないものは受け取らない', async function () {
    var bad = [
      { colors: { '--bg': 'red' } },
      { colors: { 'bg': '#112233' } },
      { tiles: { forest: { name: 'あいうえおかきくけこさしす' } } },
      { tiles: { forest: { label: '森林地帯' } } },
      { tiles: { forest: { color: '#000000' } } },
      { magics: { grass: 3 } },
      { other: {} },
      []
    ];
    for (var i = 0; i < bad.length; i++) eq((await call('PUT', 'settings', bad[i])).status, 400, JSON.stringify(bad[i]));
  });
  // プレイ集の記録（オーナー 11/10）
  var PLAY = { id: 'p1abc', name: '森ごと燃やす', stage: { kind: 'tut', uid: 'tut:tut1', name: '① 重ねる' }, turns: [[['move', 'P2', 1, 2], ['act', 'P2', 'up', 1], ['fire']]], at: 123 };
  await test('プレイ集: はじめは空。置くと /api/all に出る（保存した時刻はそのまま）。同じ id は上書き（名前を変える）', async function () {
    eq((await call('GET', 'all')).data.plays, {});
    var a = await call('PUT', 'plays/p1abc', PLAY);
    eq([a.status, a.data.at], [200, 123]);
    eq((await call('GET', 'all')).data.plays.p1abc, PLAY);
    var renamed = Object.assign({}, PLAY, { name: '別の名前' });
    ok((await call('PUT', 'plays/p1abc', renamed)).data.ok);
    var all = (await call('GET', 'all')).data.plays;
    eq([Object.keys(all), all.p1abc.name], [['p1abc'], '別の名前']);
  });
  await test('プレイ集: 消すと消える（ないものを消しても ok）', async function () {
    ok((await call('DELETE', 'plays/p1abc')).data.ok);
    eq((await call('GET', 'all')).data.plays, {});
    ok((await call('DELETE', 'plays/p1abc')).data.ok);
  });
  await test('プレイ集: 形が正しくない記録は受け取らない（自分のステージの記録は置かない）', async function () {
    var bad = [
      Object.assign({}, PLAY, { id: 'other' }),
      Object.assign({}, PLAY, { name: '' }),
      Object.assign({}, PLAY, { stage: { kind: 'mine', uid: 's1' } }),
      Object.assign({}, PLAY, { stage: { kind: 'tut', uid: '' } }),
      Object.assign({}, PLAY, { turns: [] }),
      Object.assign({}, PLAY, { turns: [[['jump']]] }),
      Object.assign({}, PLAY, { turns: [[['act', 'P2', 'north', 1]]] }),
      Object.assign({}, PLAY, { turns: [[['move', 'P2', 1.5, 2]]] })
    ];
    for (var i = 0; i < bad.length; i++) eq((await call('PUT', 'plays/p1abc', bad[i])).status, 400, JSON.stringify(bad[i]));
    eq((await call('PUT', 'plays/' + encodeURIComponent('../x'), PLAY)).status, 400, 'id の形');
    eq((await call('GET', 'all')).data.plays, {});
  });
  // ステージの背番号（オーナー 11/10・11/12）: 記録は背番号でステージを指す。名前では指さない
  await test('背番号: 共有すると付く。同じ名前で上書きしても、背番号はそのまま', async function () {
    var n = encodeURIComponent('背番号の森');
    var a = await call('PUT', 'stages/' + n, { def: Object.assign({ uid: 'sAAA' }, DEF), texts: null });
    eq([a.status, a.data.uid], [200, 'sAAA'], '送った背番号で置く');
    var b = await call('PUT', 'stages/' + n, { def: Object.assign({ uid: 'sBBB' }, DEF, { rows: ['F.....'] }), texts: null });
    eq(b.data.uid, 'sAAA', '上書きは前の背番号のまま');
    var c = await call('PUT', 'stages/' + n, { def: { rows: ['M.....'], allies: [], enemies: [] }, texts: null });
    eq(c.data.uid, 'sAAA', '背番号を送らない古い画面から上書きしても、前の背番号のまま');
    eq((await call('GET', 'all')).data.stages['背番号の森'].def.uid, 'sAAA');
  });
  await test('背番号: ほかのステージがもう使っている背番号・背番号なしで新しく置くと、新しい背番号', async function () {
    var a = await call('PUT', 'stages/' + encodeURIComponent('背番号の山'), { def: Object.assign({ uid: 'sAAA' }, DEF), texts: null });
    ok(a.data.uid && a.data.uid !== 'sAAA', '重なったら新しい背番号: ' + a.data.uid);
    var b = await call('PUT', 'stages/' + encodeURIComponent('背番号の川'), { def: DEF, texts: null });
    ok(b.data.uid && b.data.uid !== a.data.uid && b.data.uid !== 'sAAA', '背番号なしなら新しい背番号: ' + b.data.uid);
  });
  await test('背番号: ゴミ箱へ移して戻しても（名前（2）になっても）、背番号はそのまま', async function () {
    var n = encodeURIComponent('背番号の森');
    ok((await call('DELETE', 'stages/' + n)).data.ok);
    ok((await call('PUT', 'stages/' + n, { def: Object.assign({ uid: 'sCCC' }, DEF), texts: null })).data.ok, '同じ名前で別のステージを置く');
    var back = await call('POST', 'trash/' + n + '/restore');
    eq(back.data.name, '背番号の森（2）');
    var all = (await call('GET', 'all')).data.stages;
    eq([all['背番号の森（2）'].def.uid, all['背番号の森'].def.uid], ['sAAA', 'sCCC'], '戻したものは前の背番号、置いたものは別の背番号');
  });
  await test('背番号: 背番号のない前からのステージ・ゴミ箱の中身には、最初に読んだときに付けて置き直す', async function () {
    var st = JSON.parse(mem.stages), tr = JSON.parse(mem.trash || '{}');
    st['前からの森'] = { def: DEF, texts: null, at: 1 };
    tr['前からの山（2）'] = { name: '前からの山', def: DEF, texts: null, at: 1, deletedAt: 2 };
    mem.stages = JSON.stringify(st); mem.trash = JSON.stringify(tr);
    var r = (await call('GET', 'all')).data;
    eq([r.stages['前からの森'].def.uid, r.trash['前からの山（2）'].def.uid], ['n:前からの森', 'n:前からの山'], '名前から決まる背番号（ゴミ箱は消す前の名前）');
    eq([JSON.parse(mem.stages)['前からの森'].def.uid, JSON.parse(mem.trash)['前からの山（2）'].def.uid], ['n:前からの森', 'n:前からの山'], '置き場所にも書いてある');
    eq(r.stages['背番号の森'].def.uid, 'sCCC', '背番号のあるものは変えない');
    var back = await call('POST', 'trash/' + encodeURIComponent('前からの山（2）') + '/restore');
    eq((await call('GET', 'all')).data.stages[back.data.name].def.uid, 'n:前からの山', '戻しても同じ背番号');
  });
  // チュートリアル（オーナー 11/12）: みんなのステージと同じ形で置く。最初の中身は一度だけ
  await test('チュートリアル: はじめは null。最初の中身は一度だけ置ける（2回目は何も変えない）', async function () {
    eq((await call('GET', 'all')).data.tutorials, null, 'まだ置いていない');
    eq((await call('PUT', 'tutorials/tut1', { def: DEF })).status, 404, '置く前は直せない');
    var a = await call('PUT', 'tutorials', { tutorials: { tut1: { def: DEF, texts: { name: '①', scenes: { start: [] } } }, tut2: { def: DEF } } });
    eq([a.status, a.data.seeded, Object.keys(a.data.tutorials)], [200, true, ['tut1', 'tut2']]);
    var b = await call('PUT', 'tutorials', { tutorials: { tut1: { def: { rows: ['F.....'], allies: [], enemies: [] } } } });
    eq([b.data.seeded, b.data.tutorials.tut1.def.rows, Object.keys(b.data.tutorials)], [false, DEF.rows, ['tut1', 'tut2']], '前の中身のまま');
    var r = (await call('GET', 'all')).data;
    eq([r.tutorials.tut1.texts.name, r.tutorials.tut2.texts], ['①', null], '文も一緒に持つ');
  });
  await test('チュートリアル: 1つを直すと上書き。ない id・正しくない中身は受け取らない', async function () {
    var a = await call('PUT', 'tutorials/tut1', { def: { rows: ['F.....'], allies: [], enemies: [] }, texts: { name: '① 直した', scenes: { start: [], story1: [{ who: '', text: 'シナリオ', mode: 'both' }] } } });
    ok(a.status === 200 && a.data.ok && a.data.at > 0, JSON.stringify(a.data));
    var r = (await call('GET', 'all')).data.tutorials;
    eq([r.tut1.def.rows, r.tut1.texts.name, r.tut1.texts.scenes.story1.length, r.tut2.def.rows], [['F.....'], '① 直した', 1, DEF.rows], 'tut1 だけ変わる。場面を足した文もそのまま持つ');
    eq((await call('PUT', 'tutorials/tut9', { def: DEF })).status, 404, '置いていない id');
    eq((await call('PUT', 'tutorials/tut1', { def: {} })).status, 400, '盤面がない');
    eq((await call('PUT', 'tutorials/' + encodeURIComponent('だめ'), { def: DEF })).status, 400, 'id の形');
  });
  await test('チュートリアル: 最初の中身が正しくなければ置かない', async function () {
    var store = { get: function () { return Promise.resolve(null); }, put: function () { throw new Error('書いてはいけない'); } };
    eq((await call('PUT', 'tutorials', { tutorials: {} }, store)).status, 400);
    eq((await call('PUT', 'tutorials', { tutorials: { tut1: { def: {} } } }, store)).status, 400);
    eq((await call('PUT', 'tutorials', { tutorials: { 'だめ': { def: DEF } } }, store)).status, 400);
  });
  await test('チュートリアルを置いても、みんなのステージ・展示の並びは前のまま読める', async function () {
    var r = (await call('GET', 'all')).data;
    ok(Object.keys(r.stages).length > 0 && r.lineup && Array.isArray(r.lineup.start), JSON.stringify([Object.keys(r.stages), r.lineup]));
  });
  await test('置き場所（KV）がつながっていないときは 503', async function () {
    eq((await call('GET', 'all', undefined, null)).status, 503);
  });

  console.log('\n' + passed + ' 件成功 / ' + failed.length + ' 件失敗');
  if (failed.length) process.exitCode = 1;
});
