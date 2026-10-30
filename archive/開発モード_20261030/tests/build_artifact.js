/*
 * claude.ai の Artifact（スマホでも開けるページ）として公開するためのファイルを dist/ に作る。
 *   node tests/build_artifact.js
 * ゲーム本体（index.html など）は変えない。公開用に次の3つだけ整える。
 *   - <html><head><body> の外枠を外す（公開時に自動で付くため）
 *   - ページの名前を「カフィーリア シナジーモック」にする
 *   - 公開ページではファイルのダウンロードが動かないので「ファイルに保存」ボタンを隠す
 */
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var out = path.join(root, 'dist');
fs.mkdirSync(out, { recursive: true });

var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
var body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
head = head
  .replace(/\s*<meta[^>]*>/g, '')
  .replace(/<title>[^<]*<\/title>/, '<title>カフィーリア シナジーモック</title>');
body = body.replace('<button id="btnDownload" type="button">', '<button id="btnDownload" type="button" hidden>');
fs.writeFileSync(path.join(out, 'index.html'), head.trim() + '\n' + body.trim() + '\n');

['style.css', 'balance.js', 'rules.js', 'demos.js', 'ui.js'].forEach(function (f) {
  fs.copyFileSync(path.join(root, f), path.join(out, f));
});
console.log('dist/ にできた: index.html, style.css, balance.js, rules.js, demos.js, ui.js');
