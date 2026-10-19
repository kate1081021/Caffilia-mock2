// まとめのページを作る（runs/ の JSON から静的な HTML）。node build.js <runsフォルダ> <出力.html>
var fs = require('fs'), path = require('path');
var D = process.argv[2], OUT = process.argv[3];
var P = JSON.parse(fs.readFileSync(path.join(D, 'premise.json'), 'utf8'));
var MN = { grass: '草', earth: '土', fire: '火', water: '水', wind: '風' };
var MAG = ['grass', 'earth', 'fire', 'water', 'wind'];
var W = { defeat: { s: '◆', n: '倒す' }, spread: { s: '●', n: '広げる' }, move: { s: '▲', n: '動かす' }, stop: { s: '■', n: '止める' }, free: { s: '★', n: 'どれでも' }, dark: { s: '闇', n: '闇' }, odd: { s: '○', n: 'ほか' } };
var KIND = { key: 'キー', side: '寄り道', dark: '裏' };
var MIS = { defense: '防衛（村を守る）', escort: '護衛（馬車を運ぶ）' };
var MSN = { change: '変化', fuse: '融合', awake: '覚醒', range: '範囲', tbd: '未定' };
var FORM = { grass: { change: '森', fuse: '桜', awake: '大樹' }, earth: { change: '岩', fuse: '泥', awake: '岩山' }, fire: { change: '炎', fuse: '火の渦', awake: '業火' }, water: { change: '湖', fuse: '源流', awake: '氷' }, wind: { change: '旋風', fuse: '砂嵐', awake: '竜巻' } };
function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function sh(w) { var x = W[w] || W.odd; return '<span class="sh w-' + esc(W[w] ? w : 'odd') + '" title="' + esc(x.n) + '">' + esc(x.s) + '</span>'; }
function mag(m) { return '<span class="mg m-' + m + '">' + esc(MN[m] || m) + '</span>'; }
function read(f) { try { return JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')); } catch (e) { return null; } }

// ---- クエストごとの10通り ----
var QR = {};
P.quests.forEach(function (q) { QR[q.id] = read('q_' + q.id + '.json'); });
function tally(qid, mid) {
  var r = QR[qid]; if (!r) return null;
  var c = {}, wins = 0;
  r.runs.forEach(function (x) { if (x.result !== 'win') return; wins++; var m = x.missions.filter(function (y) { return y.id === mid; })[0]; var k = m && m.by ? m.by : '-'; c[k] = (c[k] || 0) + 1; });
  return { c: c, wins: wins };
}
function tallyHtml(t) {
  if (!t) return '<span class="muted">（まだ）</span>';
  var keys = MAG.filter(function (m) { return t.c[m]; }).sort(function (a, b) { return t.c[b] - t.c[a]; });
  var h = keys.map(function (m) { return '<span class="tl">' + mag(m) + '<b>' + t.c[m] + '</b></span>'; }).join('');
  if (t.c['-']) h += '<span class="tl none">取れず<b>' + t.c['-'] + '</b></span>';
  return h;
}
function questCard(q) {
  var r = QR[q.id], wins = r ? r.runs.filter(function (x) { return x.result === 'win'; }).length : 0;
  var cond = [];
  if (q.when && q.when.order) cond.push(q.when.order === 'calm' ? '治安「おだやか」のときだけ' : '治安「荒れている」のときだけ（裏クエストのあと）');
  if (q.reward && q.reward.join) cond.push('報酬: ' + MN[q.reward.join] + 'が仲間に');
  if (q.accept && q.accept.order) cond.push('受けると治安が「荒れている」に');
  var h = '<article class="qc k-' + q.kind + '" id="' + q.id + '"><header><span class="kind">' + KIND[q.kind] + '</span><span class="ch">第' + q.ch + '章</span><h3>' + esc(q.name) + '</h3><span class="client">' + esc(q.client) + 'の依頼</span></header>' +
    '<p class="story">' + esc(q.story) + '</p>' +
    '<dl class="qmeta"><div><dt>盤面</dt><dd>' + esc((q.boardName || '').replace(/^ラボ: /, '')) + '・' + esc(MIS[q.mission] || '全滅') + '・' + esc(q.size.replace('x', '×')) + '・敵' + q.enemies.length + '（' + q.enemies.map(function (e) { return MN[e] || e; }).join('・') + '）' + (q.villages ? '・村' + q.villages : '') + '</dd></div>' +
    '<div><dt>おすすめ</dt><dd>' + q.rec.map(mag).join('') + '</dd></div>' + (cond.length ? '<div><dt>条件・報酬</dt><dd>' + esc(cond.join('／')) + '</dd></div>' : '') + '</dl>' +
    '<div class="tw"><table class="mt"><thead><tr><th>ミッション</th><th>取る魔法</th><th>10通りで取った魔法 <small>（勝った' + wins + '戦）</small></th></tr></thead><tbody>' +
    q.missions.map(function (id) {
      var m = P.missions[id];
      return '<tr><td><div class="mn">' + sh(m.w) + '<b>' + esc(m.name) + '</b></div><small>' + esc(m.text) + (m.end ? '（勝ったときに決まる）' : '') + '</small></td><td class="tk">' + esc(m.taker) + '</td><td class="tls">' + tallyHtml(tally(q.id, id)) + '</td></tr>';
    }).join('') + '</tbody></table></div></article>';
  return h;
}

// ---- 1周（7通り） ----
var LAPS = ['board', 'side', 'key', 'grow', 'narrow', 'aim', 'rough'].map(function (k) { return read('l_' + k + '.json'); }).filter(Boolean);
function roadHtml(m, p) {
  if (!p) return '<span class="muted">0マス</span>';
  var h = '', L = 5;
  for (var g = 0; g * L < p.road.length || g === 0; g++) {
    var seg = p.road.slice(g * L, g * L + L);
    h += '<span class="seg">' + seg.map(function (w) { return '<i class="cell">' + sh(w) + '</i>'; }).join('') + new Array(L - seg.length + 1).join('<i class="cell empty"></i>') + '</span>';
    var k = p.ms[g];
    h += k ? '<span class="dia k-' + k + '"><b>' + MSN[k] + '</b><small>' + esc(k === 'range' ? '' : k === 'tbd' ? '' : FORM[m][k]) + '</small></span>' : '<span class="dia next"><b>節目</b></span>';
    if (!k) break;
  }
  return '<span class="road">' + h + '</span>';
}
function lapSummary() {
  return '<div class="tw"><table class="ls"><thead><tr><th>回し方</th>' + MAG.map(function (m) { return '<th>' + mag(m) + '</th>'; }).join('') + '</tr></thead><tbody>' +
    LAPS.map(function (L) {
      return '<tr><th><a href="#lap-' + L.lap + '">' + esc(L.label) + '</a></th>' + MAG.map(function (m) {
        var p = L.paths[m];
        if (!p || !p.cells) return '<td class="z">0</td>';
        var ms = p.ms.map(function (k) { return k === 'range' ? '範囲' : FORM[m][k] || MSN[k]; });
        return '<td><b>' + p.cells + '</b>' + (ms.length ? '<span class="msb">' + esc(ms.join('→')) + '</span>' : '') + (p.dark ? '<span class="dk">闇' + p.dark + '</span>' : '') + '</td>';
      }).join('') + '</tr>';
    }).join('') + '</tbody></table></div>';
}
function lapDetail(L, open) {
  var h = '<details class="lap" id="lap-' + L.lap + '"' + (open ? ' open' : '') + '><summary><b>' + esc(L.label) + '</b><span class="muted">（' + L.quests.length + '戦・勝ち ' + L.quests.filter(function (x) { return x.result === 'win'; }).length + '）</span></summary><ol class="lq">';
  L.quests.forEach(function (x) {
    var res = x.result === 'win' ? '勝ち（' + x.turn + 'ターン' + (x.tries > 1 ? '・' + x.tries + '回目' : '') + '）' : x.result === 'lose' ? '負け（3回）' : '8ターンで決着せず（3回）';
    h += '<li><div class="lqh"><b>' + esc(x.name) + '</b><span class="pt">' + x.party.map(mag).join('') + '</span><span class="rs' + (x.result === 'win' ? '' : ' bad') + '">' + res + '</span><span class="muted">ミッション ' + x.got.length + '/' + x.all + '</span></div>';
    if (x.got.length) h += '<ul class="got">' + x.got.map(function (g) {
      if (g.w === 'dark') return '<li>' + sh('dark') + esc(g.name) + ' → ' + mag(g.m) + '<span class="muted">闇の力</span></li>';
      return '<li>' + sh(g.w) + esc(g.name) + ' → ' + mag(g.m) + '<span class="' + (g.own ? 'own' : 'oth') + '">' + (g.own ? '自分の方向' : 'ほか') + '</span><span class="muted">' + g.slot + 'マス目' + (g.small ? '・' + esc(g.small) : '・小さな強化は未定') + '</span>' + (g.ms ? '<span class="msg">節目: ' + esc(g.ms) + '</span>' : '') + '</li>';
    }).join('') + '</ul>';
    h += '</li>';
  });
  h += '</ol><div class="roads">' + MAG.map(function (m) { var p = L.paths[m]; return '<div class="rr">' + mag(m) + roadHtml(m, p) + (p && p.small.length ? '<small class="muted">小さな強化: ' + esc(p.small.join('・')) + '</small>' : '') + '</div>'; }).join('') + '</div></details>';
  return h;
}

// ---- 前提 ----
var PRE = [
  ['A1', '進み方', 'クエスト制。拠点のボードから1件ずつ選ぶ。第1章はキー2・寄り道2・裏1、第2章はキー2・寄り道1。キーを全部クリアすると次の章が開く。クリアしたクエストはボードから消える', 'lab_quest.js（10/16 クエスト制）'],
  ['A2', '最初の仲間', '草・火・水・風の4人。土は寄り道「谷の魔物を誘い出せ」の報酬で加わる', 'lab_quest.js'],
  ['A3', '連れていく仲間', '1戦に3人。クエストの「おすすめ」は盤面の味方の並び。いない仲間は、仲間の並びから埋める', 'lab_quest.js'],
  ['A4', 'ミッションの数と形', 'クエストごとに2〜3つ（1周で20。裏クエストの道は18＋闇3）。形はミッションの仕分け（◆倒す・●広げる・▲動かす・■止める）', 'lab_quest.js・lab_change.js の SORT'],
  ['A5', 'だれが取るか', 'ミッションごとに決まっている（下の表の「取る魔法」）。多くは「達成の一手」を撃った魔法。シナジーで倒したら最後に削った魔法。「村を守り切る」「誰も倒されずに勝つ」は決着の一手を撃った魔法', 'lab_power.js の taker・L1 last'],
  ['A6', 'いつ道に入るか', '勝ったら、取ったミッションが全部、取った魔法の道に入る（選ばない）。負けたら全部なくなる', 'クエスト制・L4 lose'],
  ['A7', '属性のやりたいこと', '火 倒す・草 広げる・水 止める・風 動かす・土 倒す', 'lab_change.js（10/16 まとめ）'],
  ['A8', '道と節目', '5マスで1区切り。区切りの中で多い方の形で節目（1つ目 変化／融合、2つ目から 覚醒／範囲の大きな強化）。★は自分の方向', 'N7（10/19）'],
  ['A9', '小さな強化', '自分の方向の欄だけ中身がある（草1つ・火と土2つ・水と風3つ）。ほかの形は未定', 'lab_change.js の SMALL（10/19）'],
  ['A10', '敵の強さ', '敵の HP 5（直撃1を5回、弱い炎なら1発）。決め手は20', 'balance.js（10/17）'],
  ['A11', 'シミュレーションの打ち手', '勝つための手だけを1ターンずつ探す（ビームサーチ、幅12）。ミッションは狙わない（「狙う」の回だけ、自分の方向になる魔法に取らせる点を足す）。人の遊び方ではない', 'tests/lab_seg_sim.js']
];
function preHtml() {
  return '<div class="tw"><table class="pre"><thead><tr><th></th><th>前提</th><th>今の決まり</th><th>どこで決めたか</th></tr></thead><tbody>' +
    PRE.map(function (r) { return '<tr><td class="no">' + r[0] + '</td><th>' + esc(r[1]) + '</th><td>' + esc(r[2]) + '</td><td class="src">' + esc(r[3]) + '</td></tr>'; }).join('') + '</tbody></table></div>';
}

var FACTS = fs.existsSync(path.join(D, 'facts.html')) ? fs.readFileSync(path.join(D, 'facts.html'), 'utf8') : '<p class="muted">（まだ）</p>';
var LEAD = fs.existsSync(path.join(D, 'lead.html')) ? fs.readFileSync(path.join(D, 'lead.html'), 'utf8') : '';

var css = fs.readFileSync(path.join(D, 'page.css'), 'utf8');
var html = '<title>クエストと強化の流れ</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n' +
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Zen+Maru+Gothic:wght@500;700&display=swap">\n<style>' + css + '</style>\n' +
  '<main class="wrap">' +
  '<header class="top"><p class="eyebrow">カフィーリア ラボ N・区切りの道（10/19）</p><h1>クエストと強化の流れ</h1>' + LEAD + '</header>' +
  '<nav class="toc"><a href="#pre">前提</a><a href="#quests">クエストとミッション</a><a href="#laps">1周の流れ</a><a href="#facts">気づいたこと</a></nav>' +
  '<section id="pre"><h2>前提 <small>違っていたら番号で教えてください</small></h2>' + preHtml() + '</section>' +
  '<section id="quests"><h2>クエストとミッション <small>それぞれ、5つの魔法から3人の組み合わせ10通りで1回ずつ自動で戦った</small></h2>' +
  '<p class="note">「10通りで取った魔法」は、勝った戦いで、そのミッションをどの魔法が取ったか（道は0から）。「取れず」は、勝ったのに起きなかった・敵の手で起きた。</p>' +
  [1, 2].map(function (ch) { return '<h3 class="chh">第' + ch + '章「' + (ch === 1 ? '森の村' : '街道') + '」</h3><div class="qs">' + P.quests.filter(function (q) { return q.ch === ch; }).map(questCard).join('') + '</div>'; }).join('') + '</section>' +
  '<section id="laps"><h2>1周の流れ <small>道を持ち越して、7通りの回し方で1周</small></h2>' +
  '<p class="note">数字は1周のあとに道に入ったマスの数。→ は届いた節目（区切り5）。負けたクエストは3回まで受け直し、それでも勝てなければ、ミッションなしで次へ進んだ。</p>' + lapSummary() +
  LAPS.map(function (L, i) { return lapDetail(L, i === 0); }).join('') + '</section>' +
  '<section id="facts"><h2>気づいたこと</h2>' + FACTS + '</section>' +
  '<footer class="foot">tests/lab_seg_runs.js（自動で戦う: tests/lab_seg_sim.js）。区切り5・★は自分の方向・打ち手の幅12。名前・数はすべて仮。</footer></main>';
fs.writeFileSync(OUT, html);
console.log('wrote ' + OUT + ' (' + html.length + ' bytes)');
