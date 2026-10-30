/*
 * tools/publish.js — 遊べる形で公開する（IMPROVE_publish）
 *
 *   node tools/publish.js latest   … 最新版 publish/latest/ を上書き
 *   node tools/publish.js 1006     … 固定版 publish/1006/（同じ名前があれば止まる）
 *   node tools/publish.js          … 今日の日付 MMDD を固定版の名前にする
 *   --top=強化版                   … トップの大きいボタンでこの版を開く（ボタンは「強化版で遊ぶ」）
 *   --no-push                      … commit・push をしない（確かめる用）
 *
 * publish/ はこのモックとは別の git リポジトリ（private、Cloudflare（Workers の静的サイト）が main を公開する）。
 * 公開するのは index.html が読み込むファイルだけ。仕様・メモ・テスト・バックアップは出さない。
 */
'use strict';

var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var PUB = path.join(ROOT, 'publish');
var SITE_URL = 'https://caffilia-jkwzvlbc7.kate108superstar.workers.dev';
var NOINDEX = '<meta name="robots" content="noindex, nofollow">';

// 公開してはいけないもの（index.html が読み込んでいても止める）
function isForbidden(rel) {
  var p = rel.replace(/\\/g, '/');
  return /\.md$/i.test(p) || /^(\.claude|tests|tools|publish|dist|archive|v\d+)\//.test(p) || p.indexOf('..') !== -1;
}

// index.html が読み込むファイル（script src と link href）を拾う
function pageFiles(html) {
  var files = ['index.html'];
  var re = /<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g;
  var m;
  while ((m = re.exec(html))) {
    if (/^[a-z]+:|^\/\//i.test(m[1])) continue; // 外部のものは扱わない
    if (files.indexOf(m[1]) === -1) files.push(m[1]);
  }
  return files;
}

// 公開用の index.html: 検索よけと、版の名前（version.js）を差し込む
function publishedHtml(html) {
  return html
    .replace(/(<meta charset="utf-8">)/, '$1\n  ' + NOINDEX)
    .replace(/(<script src="balance\.js"><\/script>)/, '<script src="version.js"></script>\n  $1');
}

function pad(n) { return (n < 10 ? '0' : '') + n; }
function today() { var d = new Date(); return pad(d.getMonth() + 1) + pad(d.getDate()); }
function stamp(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function readVersion(dir) {
  try {
    var t = fs.readFileSync(path.join(dir, 'version.js'), 'utf8');
    var m = /CAFFILIA_VERSION\s*=\s*(\{[\s\S]*?\});/.exec(t);
    return m ? JSON.parse(m[1]) : null;
  } catch (e) { return null; }
}

function esc(t) {
  return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
}

// トップの大きいボタンで開く版（--top で決める）。なければ最新版
function readTop() {
  try {
    var top = JSON.parse(fs.readFileSync(path.join(PUB, 'top.json'), 'utf8'));
    var v = readVersion(path.join(PUB, top.name));
    return v ? { name: v.name, label: top.label, publishedAt: v.publishedAt } : null;
  } catch (e) { return null; }
}

// トップ: 大きいボタン（--top の版か最新版）と、固定版の一覧（新しい順）
function topPage() {
  var fixed = fs.readdirSync(PUB).filter(function (n) {
    return n !== 'latest' && n[0] !== '.' && fs.statSync(path.join(PUB, n)).isDirectory() && readVersion(path.join(PUB, n));
  }).map(function (n) { return readVersion(path.join(PUB, n)); });
  fixed.sort(function (a, b) { return a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0; });
  var latest = readVersion(path.join(PUB, 'latest'));
  var top = readTop();
  var li = fixed.map(function (v) {
    var label = top && top.name === v.name ? '（' + esc(top.label) + '）' : '';
    return '    <li><a href="' + encodeURIComponent(v.name) + '/">版 ' + esc(v.name) + label + '</a> <small>' + esc(v.publishedAt) + '</small></li>';
  }).join('\n');
  return '<!doctype html>\n<html lang="ja">\n<head>\n  <meta charset="utf-8">\n  ' + NOINDEX + '\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>Caffilia シナジーモック</title>\n' +
    '  <style>\n' +
    '    :root { --bg: #f6f4ef; --fg: #24221e; --sub: #6b665c; --link: #b4531f; --line: #ddd7cb; }\n' +
    '    @media (prefers-color-scheme: dark) { :root { --bg: #1d1c1a; --fg: #ece8e0; --sub: #a39d91; --link: #f0915a; --line: #3a3834; } }\n' +
    '    body { background: var(--bg); color: var(--fg); font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 16px; line-height: 1.7; }\n' +
    '    h1 { font-size: 1.5rem; margin: 0 0 4px; } p { color: var(--sub); margin: 0 0 24px; }\n' +
    '    a { color: var(--link); } .latest { display: inline-block; font-size: 1.15rem; font-weight: 600; padding: 10px 18px; border: 2px solid var(--link); border-radius: 8px; text-decoration: none; }\n' +
    '    h2 { font-size: 1rem; margin: 36px 0 8px; border-bottom: 1px solid var(--line); padding-bottom: 4px; } ul { padding-left: 1.2em; } small { color: var(--sub); margin-left: 6px; }\n' +
    '  </style>\n</head>\n<body>\n' +
    '  <h1>Caffilia シナジーモック</h1>\n  <p>魔法を撃つと自然になり、重ねると変わり、壊すと敵ごと吹き飛ぶ。PC のブラウザで遊べます。</p>\n' +
    (top ? '  <a class="latest" href="' + encodeURIComponent(top.name) + '/">' + esc(top.label) + 'で遊ぶ</a> <small>' + esc(top.publishedAt) + '</small>\n' +
      (latest ? '  <p style="margin-top: 16px"><a href="latest/">最新版</a> <small>' + esc(latest.publishedAt) + '</small></p>\n' : '')
      : latest ? '  <a class="latest" href="latest/">最新版で遊ぶ</a> <small>' + esc(latest.publishedAt) + '</small>\n' : '') +
    '  <h2>固定版</h2>\n' + (li ? '  <ul>\n' + li + '\n  </ul>\n' : '  <p>まだありません。</p>\n') +
    '</body>\n</html>\n';
}

function git(args) {
  return cp.execFileSync('git', ['-C', PUB].concat(args), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function main() {
  var argv = process.argv.slice(2);
  var push = argv.indexOf('--no-push') === -1;
  var name = argv.filter(function (a) { return a[0] !== '-'; })[0] || today();
  var topLabel = (argv.filter(function (a) { return /^--top=/.test(a); })[0] || '').slice(6);
  if (!/^[A-Za-z0-9_-]+$/.test(name)) { console.error('版の名前は英数字・-・_ だけにしてください: ' + name); process.exit(1); }
  if (!fs.existsSync(path.join(PUB, '.git'))) { console.error('publish/ がありません（公開用リポジトリを clone してください）'); process.exit(1); }

  var dest = path.join(PUB, name);
  if (name !== 'latest' && fs.existsSync(dest)) {
    console.error('固定版「' + name + '」はもうあります。上書きしません。別の名前を付けてください。');
    process.exit(1);
  }

  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  var files = pageFiles(html);
  var bad = files.filter(isForbidden);
  if (bad.length) { console.error('公開してはいけないファイルを読み込んでいます: ' + bad.join(', ')); process.exit(1); }

  if (name === 'latest') fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  files.forEach(function (f) {
    var to = path.join(dest, f);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (f === 'index.html') fs.writeFileSync(to, publishedHtml(html));
    else fs.copyFileSync(path.join(ROOT, f), to);
  });
  var version = { name: name, publishedAt: stamp(new Date()) };
  fs.writeFileSync(path.join(dest, 'version.js'), 'window.CAFFILIA_VERSION = ' + JSON.stringify(version) + ';\n');
  if (topLabel) fs.writeFileSync(path.join(PUB, 'top.json'), JSON.stringify({ name: name, label: topLabel }) + '\n');

  fs.writeFileSync(path.join(PUB, 'index.html'), topPage());
  fs.writeFileSync(path.join(PUB, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  // Cloudflare（Workers の静的サイト）の設定。リポジトリの中身をそのまま配る。.git などは配らない
  fs.writeFileSync(path.join(PUB, 'wrangler.jsonc'), JSON.stringify({
    name: 'caffilia-jkwzvlbc7',
    compatibility_date: '2026-10-01',
    assets: { directory: './' }
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(PUB, '.assetsignore'), '.git\n.gitignore\n.assetsignore\nwrangler.jsonc\ntop.json\n');
  fs.writeFileSync(path.join(PUB, '_headers'), '/*\n  X-Robots-Tag: noindex, nofollow\n\n/latest/*\n  Cache-Control: no-cache\n');

  console.log('版「' + name + '」を publish/' + name + '/ に置きました: ' + files.concat('version.js').join(', '));

  if (push) {
    git(['add', '-A']);
    var changed = git(['status', '--porcelain']).trim();
    if (!changed) { console.log('変わったところがないので commit しません。'); }
    else {
      git(['commit', '-m', '公開: 版 ' + name]);
      git(['push', 'origin', 'HEAD:main']);
      console.log('push しました（Cloudflare が2〜3分で公開します）。');
    }
  }
  console.log('トップ:   ' + SITE_URL + '/');
  console.log('この版:   ' + SITE_URL + '/' + name + '/');
}

if (require.main === module) main();

module.exports = { pageFiles: pageFiles, isForbidden: isForbidden, publishedHtml: publishedHtml };
