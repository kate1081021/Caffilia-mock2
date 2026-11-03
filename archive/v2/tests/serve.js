/*
 * 画面確認用の小さな静的サーバー（node だけで動く）。  node tests/serve.js
 * index.html はダブルクリック（file://）でも動くので、普段は使わなくてよい。
 */
var http = require('http');
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var port = Number(process.env.PORT) || 8765;
var types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
http.createServer(function (req, res) {
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
