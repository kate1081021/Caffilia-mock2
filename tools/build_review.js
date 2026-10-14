/*
 * tools/build_review.js — 「見て判定」をスマホで開く Artifact 用に、ページとファイルを1つのフォルダへ集める
 *
 *   node tools/build_review.js <出力フォルダ>
 *
 * 出力フォルダに review.html（Artifact のページ。<html>・<head>・<body> を外し、見て判定で始まる）と、
 * index.html が読み込む .js・.css をそのまま写す。中身は変えない（ルールも画面も手元と同じ）。
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var out = process.argv[2];
if (!out) { console.error('使い方: node tools/build_review.js <出力フォルダ>'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });

var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// 読み込むファイル（script src と link href）
var files = [], re = /<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g, m;
while ((m = re.exec(html))) if (!/^[a-z]+:|^\/\//i.test(m[1]) && files.indexOf(m[1]) === -1) files.push(m[1]);
files.forEach(function (f) { fs.copyFileSync(path.join(ROOT, f), path.join(out, f)); });

// Artifact はページを <html><head><body> で包むので、中身だけにする。<title> と <link> は先頭へ
var head = /<head>([\s\S]*?)<\/head>/.exec(html)[1];
var body = /<body[^>]*>([\s\S]*?)<\/body>/.exec(html)[1];
var links = (head.match(/<link[^>]*>/g) || []).join('\n');
var page = '<title>カフィーリア 見て判定</title>\n' + links + '\n' +
  '<script>window.CAFILIA_REVIEW = true;</script>\n' + body.replace(/^\s*\n/, '');
fs.writeFileSync(path.join(out, 'review.html'), page);

console.log('review.html と ' + files.length + ' ファイルを ' + out + ' に書いた');
console.log(files.join(' '));
