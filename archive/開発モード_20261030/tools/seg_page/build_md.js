// まとめ（クエストと強化の流れ）を Markdown で書き出す。プロジェクトのコンテキスト用（静的な文章と表だけ）。
//   node tools/seg_page/build_md.js <runsフォルダ> <出力.md>
//   runs フォルダは tests/lab_seg_runs.js の結果（premise.json・q_*.json・l_*.json）と、facts.html・lead.html（気づいたこと）
var fs = require('fs'), path = require('path');
var D = process.argv[2], OUT = process.argv[3];
var P = JSON.parse(fs.readFileSync(path.join(D, 'premise.json'), 'utf8'));
var MN = { grass: '草', earth: '土', fire: '火', water: '水', wind: '風' };
var MAG = ['grass', 'earth', 'fire', 'water', 'wind'];
var SH = { defeat: '◆', spread: '●', move: '▲', stop: '■', free: '★', dark: '闇' };
var WN = { defeat: '倒す', spread: '広げる', move: '動かす', stop: '止める', free: 'どれでも', dark: '闇' };
var KIND = { key: 'キー', side: '寄り道', dark: '裏' };
var MIS = { defense: '防衛', escort: '護衛' };
var FORM = { grass: { change: '森', fuse: '桜', awake: '大樹' }, earth: { change: '岩', fuse: '泥', awake: '岩山' }, fire: { change: '炎', fuse: '火の渦', awake: '業火' }, water: { change: '湖', fuse: '源流', awake: '氷' }, wind: { change: '旋風', fuse: '砂嵐', awake: '竜巻' } };
var MSN = { change: '変化', fuse: '融合', awake: '覚醒', range: '範囲の大きな強化', tbd: '未定' };
function read(f) { try { return JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')); } catch (e) { return null; } }
function cell(t) { return String(t == null ? '' : t).replace(/\|/g, '／').replace(/\n/g, ' '); }
function strip(h) { return h.replace(/<li><b>([^<]*)<\/b>/g, '- **$1** ').replace(/<\/li>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\n\s*\n/g, '\n').trim(); }

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

var md = [];
md.push('# クエストと強化の流れ（2026-10-19）');
md.push('');
md.push('カフィーリア シナジーモック、ラボ N の「区切りの道」（N7）で、今のクエスト9件とミッション、自動で戦わせたときにどの魔法がミッションを取って強化されたかをまとめたもの。名前・数はすべて仮。');
md.push('');
md.push('- 元のデータ: `tests/lab_seg_runs.js`（自動で戦う打ち手は `tests/lab_seg_sim.js`）。区切り5・★は自分の方向・打ち手の幅12。');
md.push('- 自動の打ち手は、勝つための手を1ターンずつ探すだけで、人の遊び方とは違う。同じ条件なら毎回同じ結果（乱数なし）なので、仲間・順番・打ち手の幅を変えて回した。');
md.push('- 形: ◆倒す ●広げる ▲動かす ■止める ★どれでも ／ 魔法のやりたいこと: 火 倒す・草 広げる・水 止める・風 動かす・土 倒す');
md.push('');
md.push('## 要点');
md.push('');
var lead = fs.readFileSync(path.join(D, 'lead.html'), 'utf8');
md.push(strip(lead.replace(/<p class="lead">[\s\S]*?<\/p>/, '')));
md.push('');

md.push('## 前提（A1〜A11）');
md.push('');
md.push('| 番号 | 前提 | 今の決まり | どこで決めたか |');
md.push('|---|---|---|---|');
PRE.forEach(function (r) { md.push('| ' + r.map(cell).join(' | ') + ' |'); });
md.push('');

md.push('## クエストとミッション');
md.push('');
md.push('各クエストを、5つの魔法から3人の組み合わせ10通りで1回ずつ自動で戦った（道は0から）。「取った魔法」は、勝った戦いで、そのミッションをどの魔法が何回取ったか。「取れず」は、勝ったのに起きなかった・敵の手で起きた。');
md.push('');
[1, 2].forEach(function (ch) {
  md.push('### 第' + ch + '章「' + (ch === 1 ? '森の村' : '街道') + '」');
  md.push('');
  P.quests.filter(function (q) { return q.ch === ch; }).forEach(function (q) {
    var r = read('q_' + q.id + '.json'), runs = r ? r.runs : [], wins = runs.filter(function (x) { return x.result === 'win'; });
    var cond = [];
    if (q.when && q.when.order) cond.push(q.when.order === 'calm' ? '治安「おだやか」のときだけ' : '治安「荒れている」のときだけ（裏クエストのあと）');
    if (q.reward && q.reward.join) cond.push('報酬: ' + MN[q.reward.join] + 'が仲間に');
    if (q.accept && q.accept.order) cond.push('受けると治安が「荒れている」に');
    md.push('#### ' + q.name + '（' + KIND[q.kind] + '・' + q.client + 'の依頼）');
    md.push('');
    md.push('- 依頼: ' + q.story);
    md.push('- 盤面: ' + (q.boardName || '').replace(/^ラボ: /, '') + '（' + q.board + '）・' + (MIS[q.mission] || '全滅') + '・' + q.size.replace('x', '×') + '・敵' + q.enemies.length + '（' + q.enemies.map(function (e) { return MN[e] || e; }).join('・') + '）' + (q.villages ? '・村' + q.villages : ''));
    md.push('- おすすめ: ' + q.rec.map(function (m) { return MN[m]; }).join('・'));
    if (cond.length) md.push('- 条件・報酬: ' + cond.join('／'));
    md.push('- 10通りの結果: 勝ち ' + wins.length + '／10' + (runs.length ? '（勝てなかった組: ' + (runs.filter(function (x) { return x.result !== 'win'; }).map(function (x) { return x.party.map(function (m) { return MN[m]; }).join(''); }).join('・') || 'なし') + '）' : ''));
    md.push('');
    md.push('| 形 | ミッション | 内容 | 取る魔法 | 取った魔法（勝った' + wins.length + '戦） |');
    md.push('|---|---|---|---|---|');
    q.missions.forEach(function (id) {
      var m = P.missions[id], c = {};
      wins.forEach(function (x) { var y = x.missions.filter(function (z) { return z.id === id; })[0]; var k = y && y.by ? y.by : '-'; c[k] = (c[k] || 0) + 1; });
      var t = MAG.filter(function (k) { return c[k]; }).sort(function (a, b) { return c[b] - c[a]; }).map(function (k) { return MN[k] + ' ' + c[k]; });
      if (c['-']) t.push('取れず ' + c['-']);
      md.push('| ' + [SH[m.w] + ' ' + WN[m.w], m.name, m.text + (m.end ? '（勝ったときに決まる）' : ''), m.taker, t.join('・') || '—'].map(cell).join(' | ') + ' |');
    });
    md.push('');
    if (runs.length) {
      md.push('組み合わせごと（勝ち・ターン ／ ミッション → 取った魔法）:');
      md.push('');
      runs.forEach(function (x) {
        md.push('- ' + x.party.map(function (m) { return MN[m]; }).join('') + ': ' + (x.result === 'win' ? '勝ち ' + x.turn + 'ターン' : x.result === 'lose' ? '負け' : '8ターンで決着せず') + ' ／ ' +
          x.missions.map(function (y) { return y.name + ' → ' + (y.by ? MN[y.by] : '—'); }).join('、'));
      });
      md.push('');
    }
  });
});

md.push('## 1周の流れ（7通り）');
md.push('');
md.push('道を持ち越して1周。負けたクエストは3回まで受け直し、それでも勝てなければ、ミッションなしで次へ進んだ。');
md.push('');
var LAPS = ['board', 'side', 'key', 'grow', 'narrow', 'aim', 'rough'].map(function (k) { return read('l_' + k + '.json'); }).filter(Boolean);
md.push('### まとめ（1周のあとに道に入ったマスの数と、届いた節目）');
md.push('');
md.push('| 回し方 | ' + MAG.map(function (m) { return MN[m]; }).join(' | ') + ' |');
md.push('|---|' + MAG.map(function () { return '---'; }).join('|') + '|');
LAPS.forEach(function (L) {
  md.push('| ' + cell(L.label) + ' | ' + MAG.map(function (m) {
    var p = L.paths[m];
    if (!p || !p.cells) return '0';
    var ms = p.ms.map(function (k) { return k === 'range' ? '範囲' : FORM[m][k] || MSN[k]; });
    return p.cells + (ms.length ? '（' + ms.join('→') + '）' : '') + (p.dark ? ' 闇' + p.dark : '');
  }).join(' | ') + ' |');
});
md.push('');
LAPS.forEach(function (L) {
  md.push('### ' + L.label);
  md.push('');
  L.quests.forEach(function (x, i) {
    var res = x.result === 'win' ? '勝ち（' + x.turn + 'ターン' + (x.tries > 1 ? '・' + x.tries + '回目' : '') + '）' : x.result === 'lose' ? '負け（3回）' : '8ターンで決着せず（3回）';
    md.push((i + 1) + '. **' + x.name + '**　' + x.party.map(function (m) { return MN[m]; }).join('・') + ' → ' + res + '・ミッション ' + x.got.length + '／' + x.all);
    x.got.forEach(function (g) {
      if (g.w === 'dark') { md.push('    - 闇 ' + g.name + ' → ' + MN[g.m] + '（闇の力）'); return; }
      md.push('    - ' + SH[g.w] + ' ' + g.name + ' → ' + MN[g.m] + '（' + (g.own ? '自分の方向' : 'ほか') + '）道の' + g.slot + 'マス目・' + (g.small ? '小さな強化「' + g.small + '」' : '小さな強化は未定') + (g.ms ? '・**節目: ' + g.ms + '**' : ''));
    });
  });
  md.push('');
  md.push('1周のあとの道（｜は区切り、◇のあとは届いた節目。小は入った小さな強化の印）:');
  md.push('');
  MAG.forEach(function (m) { var p = L.paths[m]; md.push('- ' + MN[m] + ': ' + (p && p.cells ? '`' + p.marks + '`' + (p.small.length ? '（小さな強化: ' + p.small.join('・') + '）' : '') : '0マス')); });
  md.push('');
});

md.push('## 気づいたこと');
md.push('');
var facts = fs.readFileSync(path.join(D, 'facts.html'), 'utf8');
var note = (facts.match(/<p class="note">([\s\S]*?)<\/p>/) || [])[1];
md.push(strip(facts.replace(/<p class="note">[\s\S]*?<\/p>/, '')));
if (note) { md.push(''); md.push(note.replace(/<[^>]+>/g, '')); }
md.push('');
fs.writeFileSync(OUT, md.join('\n'));
console.log('wrote ' + OUT + ' (' + md.length + ' lines)');
