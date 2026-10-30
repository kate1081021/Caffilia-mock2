/*
 * 画面確認用の小さな静的サーバー（node だけで動く）。  node tests/serve.js
 * index.html はダブルクリック（file://）でも動くので、普段は使わなくてよい。
 * /api/ は、公開先（Cloudflare）と同じプログラム（tools/stage_worker.mjs）で答える（IMPROVE_v3 段4）。
 *   置いたものはこのサーバーの中だけ（止めると消える）。http://localhost:… と http://127.0.0.1:… は別のブラウザのように
 *   localStorage が分かれるので、「別のパソコンから見る」の確かめに使える。
 */
var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url');
var root = path.join(__dirname, '..');
var port = Number(process.argv[2]) || Number(process.env.PORT) || 8765;   // node tests/serve.js 8766 で別の番号
var types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.md': 'text/plain; charset=utf-8' };

// Workers KV の代わり（このサーバーの中だけ）
var mem = {};
var kv = {
  get: function (k, type) { return Promise.resolve(k in mem ? (type === 'json' ? JSON.parse(mem[k]) : mem[k]) : null); },
  put: function (k, v) { mem[k] = String(v); return Promise.resolve(); }
};
var worker = import(url.pathToFileURL(path.join(root, 'tools', 'stage_worker.mjs')).href);

function api(req, res) {
  var chunks = [];
  req.on('data', function (c) { chunks.push(c); });
  req.on('end', function () {
    var body = Buffer.concat(chunks).toString('utf8');
    var r = new Request('http://localhost' + req.url, { method: req.method, headers: { 'content-type': req.headers['content-type'] || 'application/json' }, body: /^(GET|HEAD|OPTIONS)$/.test(req.method) ? undefined : body });
    worker.then(function (w) { return w.handleApi(r, kv); }).then(function (out) {
      var h = {};
      out.headers.forEach(function (v, k) { h[k] = v; });
      return out.text().then(function (t) { res.writeHead(out.status, h); res.end(t); });
    }).catch(function (e) { res.writeHead(500); res.end(String(e)); });
  });
}

http.createServer(function (req, res) {
  if (req.url.indexOf('/api/') === 0) { api(req, res); return; }
  var p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  var file = path.normalize(path.join(root, p));
  if (file.indexOf(root) !== 0) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, function (err, data) {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, '127.0.0.1', function () { console.log('http://localhost:' + port + '/'); });
