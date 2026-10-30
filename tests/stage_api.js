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
    eq([r.status, r.data.stages, r.data.lineup, r.cors], [200, {}, null, '*']);
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
  await test('置き場所（KV）がつながっていないときは 503', async function () {
    eq((await call('GET', 'all', undefined, null)).status, 503);
  });

  console.log('\n' + passed + ' 件成功 / ' + failed.length + ' 件失敗');
  if (failed.length) process.exitCode = 1;
});
