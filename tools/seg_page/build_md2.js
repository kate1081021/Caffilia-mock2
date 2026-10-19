// まとめ（クエストと強化の流れ・10/19 組み直し）を Markdown で書き出す。
//   node tools/seg_page/build_md2.js <runsフォルダ> <出力.md>
//   runs フォルダは tests/lab_seg_runs.js の結果（q_<クエスト>_<番号>.json か q_<クエスト>.json、l_<やり方>_<A|B>.json）と、
//   あれば lead.md（要点）・facts.md（気づいたこと）。クエスト・ミッション・盤面は lab_quest.js と rules.js から読む
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var R = require(path.join(ROOT, 'rules.js')), Q = require(path.join(ROOT, 'lab_quest.js'));
var LL = R.LX.L;
var D = process.argv[2], OUT = process.argv[3];
var MN = { grass: '草', earth: '土', fire: '火', water: '水', wind: '風' };
var MAG = ['grass', 'earth', 'fire', 'water', 'wind'];
var SH = { defeat: '◆', spread: '●', move: '▲', stop: '■', free: '★', dark: '闇' };
var WN = { defeat: '倒す', spread: '広げる', move: '動かす', stop: '止める', free: 'どれでも', dark: '闇' };
var KIND = { key: 'キー', side: '寄り道', dark: '裏' };
var FORM = { grass: { change: '森', fuse: '桜', awake: '大樹' }, earth: { change: '岩', fuse: '泥', awake: '岩山' }, fire: { change: '炎', fuse: '火の渦', awake: '業火' }, water: { change: '湖', fuse: '源流', awake: '氷' }, wind: { change: '旋風', fuse: '砂嵐', awake: '竜巻' } };
var MSN = { change: '変化', fuse: '融合', awake: '覚醒', range: '範囲', tbd: '未定', none: 'なし', fuAwake: '覚醒（未定）' };
var ROLE = { mat: '材料', stage: '舞台', trigger: '決め手', hand: '一手', mover: '動かした', stopper: '止めた', blocker: 'ふさいだ', maker: '作った' };
function cell(t) { return String(t == null ? '' : t).replace(/\|/g, '／').replace(/\n/g, ' '); }
function read(f) { try { return JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')); } catch (e) { return null; } }
function names(list) { return list.map(function (m) { return MN[m]; }).join(''); }
function msName(m, k) { return k === 'range' ? '範囲' : (FORM[m][k] || MSN[k] || k); }
R.labApply(['N0']);
function mdef(id) { var t = LL.targetDef(id); return t ? { id: id, name: t.name, text: t.text, w: t.dir, taker: t.taker || 'hand' } : { id: id, name: id, text: '', w: 'free' }; }
// クエストごとの10通り（手分けした q_<id>_<n>.json をまとめる）
function questRuns(id) {
  var all = read('q_' + id + '.json');
  var runs = all ? all.runs.slice() : [];
  fs.readdirSync(D).filter(function (f) { return new RegExp('^q_' + id + '_\\d+\\.json$').test(f); }).forEach(function (f) { runs = runs.concat(read(f).runs); });
  var order = []; for (var i = 0; i < 5; i++) for (var j = i + 1; j < 5; j++) for (var k = j + 1; k < 5; k++) order.push([MAG[i], MAG[j], MAG[k]].join(','));
  return runs.sort(function (a, b) { return order.indexOf(a.party.join(',')) - order.indexOf(b.party.join(',')); });
}
var LAPKEYS = ['board', 'side', 'key', 'grow', 'narrow', 'rough'], AIMS = ['grass', 'fire', 'water', 'wind'];
function lap(k, r) { return read('l_' + k + '_' + r + '.json'); }

var md = [];
md.push('# クエストと強化の流れ（2026-10-19・ミッションの組み直しと道の切り替え）');
md.push('');
md.push('カフィーリア シナジーモック、ラボ N の「区切りの道」（N7）で、オーナーの「ミッションの組み直しと道の切り替え」（10/19）を入れたあとの、クエスト9件とミッション、自動で戦わせたときにどの魔法がミッションの候補になり、だれを選んで、どう強化されたかをまとめたもの。名前・数はすべて仮。前の版（組み直す前）は git の履歴にある。');
md.push('');
md.push('- 元のデータ: `tests/lab_seg_runs.js`（自動で戦う打ち手と選び方は `tests/lab_seg_sim.js`）。区切り5・打ち手の幅12。書き出しは `tools/seg_page/build_md2.js`。');
md.push('- 自動の打ち手は、勝つための手を1ターンずつ探すだけで、人の遊び方とは違う。同じ条件なら毎回同じ結果（乱数なし）。');
md.push('- 形: ◆倒す ●広げる ▲動かす ■止める ★どれでも ／ 道の決まり A の自分の方向: 火 倒す・草 広げる・水 止める・風 動かす・土 倒す ／ 道の決まり B の2つの方向: 草 ●◆・土 ◆■・火 ◆▲・水 ■◆・風 ▲◆');
md.push('');
md.push('## 要点');
md.push('');
var lead = null; try { lead = fs.readFileSync(path.join(D, 'lead.md'), 'utf8').trim(); } catch (e) { lead = '（要点は lead.md）'; }
md.push(lead);
md.push('');
md.push('## 前提（A1〜A12）');
md.push('');
md.push('| 番号 | 前提 | 今の決まり | どこで決めたか |');
md.push('|---|---|---|---|');
[
  ['A1', '進み方', 'クエスト制。拠点のボードから1件ずつ選ぶ。第1章はキー2・寄り道2・裏1、第2章はキー2・寄り道1。キーを全部クリアすると次の章が開く', 'lab_quest.js（10/16）'],
  ['A2', '最初の仲間', '草・火・水・風の4人。土は寄り道「谷の魔物を誘い出せ」の報酬で加わる', 'lab_quest.js'],
  ['A3', '連れていく仲間', '1戦に3人。おすすめは盤面の味方の並び。いない仲間は仲間の並びから埋める', 'lab_quest.js'],
  ['A4', 'ミッション', 'クエストごとに2〜3つ（1周で21・裏の道は18＋闇3）。強化につながるものだけ（3人の結果は置かない）。誰でも取れるもの中心。目的に沿った形だけ（討伐 ◆＋準備の● ／防衛 ■＋準備の● ／護衛 ▲＋■）。勝ち方の順に並べる（準備 → 縛る・変える → 決め手や目的）', 'lab_quest.js（10/19 組み直し）'],
  ['A5', 'だれが候補になるか', 'ミッションを満たした1発を撃った魔法。同じミッションを別の魔法がまた満たせば、その魔法も候補。決め手のミッションは役ごと（材料の自然を作った・舞台を作った・決め手を起こした）。止めた・動かした・ふさいだ などはその手。敵の手で満たしたものは候補にしない', 'lab_rules.js の pickAchieve（10/19）'],
  ['A6', 'いつ道に入るか', '勝ったら、育ちの画面でミッションごとに候補から1人選んで入れる（1人なら自動）。負けたら全部なくなる', 'N7 の take: pick（10/19）・L4 lose'],
  ['A7', '勝ったあとの選び方（自動）', '勝つだけ: 候補のうち、道のマスが一番少ない魔法（同じなら 草土火水風 の順）。狙う: 狙う魔法が候補にいて形が狙う方向ならその魔法。狙う方向でない形は、今の区切りでまだ変化に届くうちはその魔法、届かなくなるならほかの候補', 'tests/lab_seg_sim.js【仮】'],
  ['A8', '道の決まり A', '5マスで1区切り。自分の方向の形とそれ以外の多い方で節目（1つ目 変化／融合、2つ目から 覚醒／範囲の大きな強化）。★は自分の方向', 'N7（10/19 午前）'],
  ['A9', '道の決まり B', '5マスで1区切り。同じ形が3つ以上あり、それがその魔法の2つの方向のどちらかなら、その方向に変化（1つ目 → 覚醒方面の変化・2つ目 → 融合先）。そろわなければ何も起きない。変化のあと、同じ方向が3つ以上の区切りで覚醒（2つ目の方向の覚醒は未定）。★は1つ目の方向', 'N7 の rule: B（10/19）'],
  ['A10', '小さな強化', '自分の方向（B は1つ目の方向）の欄だけ中身がある。ほかの形は未定', 'lab_change.js の SMALL'],
  ['A11', '敵の強さ', '敵の HP 5（直撃1を5回、弱い炎なら1発）。決め手は20', 'balance.js（10/17）'],
  ['A12', 'シミュレーションの打ち手', '勝つための手だけを1ターンずつ探す（ビームサーチ、幅12）。狙う回は、狙う魔法を必ず連れていき、狙う魔法が狙う方向の形の候補に入る手に点を足す', 'tests/lab_seg_sim.js']
].forEach(function (r) { md.push('| ' + r.map(cell).join(' | ') + ' |'); });
md.push('');

md.push('## クエストとミッション');
md.push('');
md.push('各クエストを、5つの魔法から3人の組み合わせ10通りで1回ずつ自動で戦った（道は0から・勝つだけ）。「候補になった」は、その魔法がいた6戦のうち何回、そのミッションの候補になったか（負けた戦いも数える）。道は0からなので、道の決まり（A/B）では変わらない。');
md.push('');
var never = [];
[1, 2].forEach(function (ch) {
  md.push('### 第' + ch + '章「' + Q.chapter(ch).name + '」');
  md.push('');
  Q.QUESTS.filter(function (q) { return q.ch === ch; }).forEach(function (q) {
    var p = R.findPreset(q.board), runs = questRuns(q.id), wins = runs.filter(function (x) { return x.result === 'win'; });
    var cond = [];
    if (q.when && q.when.order) cond.push(q.when.order === 'calm' ? '治安「おだやか」のときだけ' : '治安「荒れている」のときだけ（裏クエストのあと）');
    if (q.reward && q.reward.join) cond.push('報酬: ' + MN[q.reward.join] + 'が仲間に');
    if (q.accept && q.accept.order) cond.push('受けると治安が「荒れている」に');
    var size = p.rows ? p.rows[0].length + '×' + p.rows.length : '';
    md.push('#### ' + q.name + '（' + KIND[q.kind] + '・' + q.client + 'の依頼）');
    md.push('');
    md.push('- 依頼: ' + q.story);
    md.push('- 目的: ' + (Q.PURPOSE[q.purpose] || q.purpose) + '　盤面: ' + p.name.replace(/^ラボ: /, '') + '（' + q.board + '）・' + size + '・敵' + p.enemies.length + '（' + p.enemies.map(function (e) { return MN[e[0]] || e[0]; }).join('・') + '）' + ((p.villages || []).length ? '・村' + p.villages.length : '') + (p.wagon ? '・馬車' : ''));
    md.push('- おすすめ: ' + Q.recommend(q, R.findPreset).map(function (m) { return MN[m]; }).join('・'));
    md.push('- レール: ' + q.missions.map(function (id, i) { var t = mdef(id); return (q.rail ? q.rail[i] : '') + ' ' + SH[t.w] + t.name; }).join(' → '));
    if (q.railNote) md.push('- メモ: ' + q.railNote);
    if (cond.length) md.push('- 条件・報酬: ' + cond.join('／'));
    if (runs.length) md.push('- 10通りの結果: 勝ち ' + wins.length + '／' + runs.length + '（勝てなかった組: ' + (runs.filter(function (x) { return x.result !== 'win'; }).map(function (x) { return names(x.party); }).join('・') || 'なし') + '）');
    md.push('');
    md.push('| 順 | レール | 形 | ミッション | 内容 | 候補になりうる魔法 | 候補になった（その魔法がいた戦いのうち）| 最初に起きたターン |');
    md.push('|---|---|---|---|---|---|---|---|');
    q.missions.forEach(function (id, i) {
      var t = mdef(id), got = {}, present = {}, roles = {}, turns = [], happened = 0;
      runs.forEach(function (x) {
        var y = x.missions.filter(function (z) { return z.id === id; })[0];
        x.party.forEach(function (m) { present[m] = (present[m] || 0) + 1; });
        if (!y) return;
        if (y.cands.length) happened++;
        if (y.turn) turns.push(y.turn);
        y.cands.forEach(function (m) { got[m] = (got[m] || 0) + 1; (y.roles[m] || []).forEach(function (r) { roles[r] = roles[r] || {}; roles[r][m] = (roles[r][m] || 0) + 1; }); });
      });
      var can = MAG.filter(function (m) { return got[m]; });
      if (!happened) never.push(q.name + '「' + t.name + '」');
      var line = MAG.filter(function (m) { return present[m]; }).map(function (m) { return MN[m] + ' ' + (got[m] || 0) + '/' + present[m]; }).join('・');
      var rl = Object.keys(roles).filter(function (r) { return r === 'mat' || r === 'stage' || r === 'trigger'; });
      if (rl.length) line += '（役: ' + rl.map(function (r) { return ROLE[r] + ' ' + MAG.filter(function (m) { return roles[r][m]; }).map(function (m) { return MN[m] + roles[r][m]; }).join(''); }).join('・') + '）';
      md.push('| ' + [i + 1, q.rail ? q.rail[i] : '', SH[t.w] + ' ' + WN[t.w], t.name, t.text, can.length ? names(can) + '（' + can.length + '種）' : '—', line + '・起きた ' + happened + '/' + runs.length, turns.length ? Math.min.apply(null, turns) + 'ターン目' : '—'].map(cell).join(' | ') + ' |');
    });
    md.push('');
    if (runs.length) {
      md.push('組み合わせごと（勝ち・ターン ／ ミッション → 候補）:');
      md.push('');
      runs.forEach(function (x) {
        md.push('- ' + names(x.party) + ': ' + (x.result === 'win' ? '勝ち ' + x.turn + 'ターン' : x.result === 'lose' ? '負け' : '8ターンで決着せず') + ' ／ ' +
          x.missions.map(function (y) { return y.name + ' → ' + (y.cands.length ? names(y.cands) : '—'); }).join('、'));
      });
      md.push('');
    }
  });
});

md.push('## 1周の流れ（勝つだけ 6通り × 道の決まり A／B）');
md.push('');
md.push('道を持ち越して1周。負けたクエストは3回まで受け直し、それでも勝てなければ、ミッションなしで次へ進んだ。戦いの手は A と B で同じ（道が節目に届いて姿が変わるまで）。違うのは節目の中身。');
md.push('');
md.push('### まとめ（1周のあとに道に入ったマスの数と、届いた節目）');
md.push('');
md.push('| 回し方 | 決まり | ' + MAG.map(function (m) { return MN[m]; }).join(' | ') + ' | 落としたクエスト |');
md.push('|---|---|' + MAG.map(function () { return '---'; }).join('|') + '|---|');
function pathCell(m, p) { if (!p || !p.cells) return '0'; var ms = p.ms.map(function (k) { return msName(m, k); }); return p.cells + (ms.length ? '（' + ms.join('→') + '）' : '') + (p.dark ? ' 闇' + p.dark : ''); }
LAPKEYS.forEach(function (k) {
  ['A', 'B'].forEach(function (r) {
    var L = lap(k, r);
    if (!L) return;
    md.push('| ' + cell(L.label) + ' | ' + r + ' | ' + MAG.map(function (m) { return pathCell(m, L.paths[m]); }).join(' | ') + ' | ' + cell(L.quests.filter(function (x) { return x.result !== 'win'; }).map(function (x) { return x.name; }).join('・') || 'なし') + ' |');
  });
});
md.push('');
md.push('## 狙う回（草・火・水・風を1回ずつ × 道の決まり A／B）');
md.push('');
md.push('狙う魔法を必ず連れていき（残りはおすすめ）、勝つうえで、狙う魔法が狙う方向（A は自分の方向、B は1つ目の方向）の形の候補に入る手に点を足した。');
md.push('');
md.push('| 狙う魔法 | 決まり | 変化に届いたか | 狙った魔法の道 | 落としたクエスト | ほかの魔法 |');
md.push('|---|---|---|---|---|---|');
AIMS.forEach(function (m) {
  ['A', 'B'].forEach(function (r) {
    var L = lap('aim_' + m, r);
    if (!L) { md.push('| ' + MN[m] + ' | ' + r + ' | （回していない） | | | |'); return; }
    var p = L.paths[m] || { cells: 0, ms: [], marks: '0マス' }, first = p.ms[0], reached = first === 'change';
    md.push('| ' + MN[m] + ' | ' + r + ' | ' + (reached ? '届いた（' + FORM[m].change + '）' : first ? '届かない（節目1: ' + msName(m, first) + '）' : '届かない（' + p.cells + 'マス）') + ' | `' + (p.marks || '') + '` | ' +
      (L.quests.filter(function (x) { return x.result !== 'win'; }).map(function (x) { return x.name; }).join('・') || 'なし') + ' | ' + MAG.filter(function (x) { return x !== m; }).map(function (x) { return MN[x] + ' ' + pathCell(x, L.paths[x]); }).join('・') + ' |');
  });
});
md.push('');
function lapDetail(L, title) {
  md.push('### ' + title);
  md.push('');
  L.quests.forEach(function (x, i) {
    var res = x.result === 'win' ? '勝ち（' + x.turn + 'ターン' + (x.tries > 1 ? '・' + x.tries + '回目' : '') + '）' : x.result === 'lose' ? '負け（3回）' : '8ターンで決着せず（3回）';
    md.push((i + 1) + '. **' + x.name + '**　' + x.party.map(function (m) { return MN[m]; }).join('・') + ' → ' + res);
    x.missions.forEach(function (y) {
      var g = x.got.filter(function (z) { return z.id === y.id; })[0];
      if (y.w === 'dark') { md.push('    - 闇 ' + y.name + '　候補: ' + (y.cands.length ? names(y.cands) : '—') + (g ? ' → ' + MN[g.m] + '（闇の力）' : '')); return; }
      md.push('    - ' + SH[y.w] + ' ' + y.name + '　候補: ' + (y.cands.length ? names(y.cands) : '—') + (g ? ' → **' + MN[g.m] + '**（' + (g.kind === 'awake' ? (L.rule === 'B' ? '1つ目の方向' : '自分の方向') : g.kind === 'fuse' ? (L.rule === 'B' ? '2つ目の方向' : 'ほか') : L.rule === 'B' ? '方向ではない' : 'ほか') + '）道の' + g.slot + 'マス目・' + (g.small ? '小さな強化「' + g.small + '」' : '小さな強化は未定') + (g.ms ? '・**節目: ' + g.ms + '**' : '') : ''));
    });
  });
  md.push('');
  md.push('1周のあとの道（｜は区切り、◇のあとは届いた節目。小は入った小さな強化の印）:');
  md.push('');
  MAG.forEach(function (m) { var p = L.paths[m]; md.push('- ' + MN[m] + ': ' + (p && p.cells ? '`' + p.marks + '`' + (p.small.length ? '（小さな強化: ' + p.small.join('・') + '）' : '') : '0マス')); });
  md.push('');
}
md.push('## 1周ずつ（道の決まり A。B は節目の中身だけ違う）');
md.push('');
LAPKEYS.forEach(function (k) { var L = lap(k, 'A'), LB = lap(k, 'B'); if (!L) return; lapDetail(L, L.label);
  if (LB) { var diff = MAG.filter(function (m) { return JSON.stringify((L.paths[m] || {}).marks) !== JSON.stringify((LB.paths[m] || {}).marks); }); if (diff.length) { md.push('B では: ' + diff.map(function (m) { return MN[m] + ' `' + LB.paths[m].marks + '`'; }).join('・')); md.push(''); } }
});
AIMS.forEach(function (m) { var L = lap('aim_' + m, 'A'), LB = lap('aim_' + m, 'B'); if (!L) return; lapDetail(L, L.label + '（A）');
  if (LB) { var diff = MAG.filter(function (x) { return JSON.stringify((L.paths[x] || {}).marks) !== JSON.stringify((LB.paths[x] || {}).marks); }); if (diff.length) { md.push('B では: ' + diff.map(function (x) { return MN[x] + ' `' + LB.paths[x].marks + '`'; }).join('・')); md.push(''); } else { md.push('B でも同じ道・同じ節目。'); md.push(''); } }
});

md.push('## 起きなかったミッション（10通りで一度も候補が出なかった）');
md.push('');
md.push(never.length ? never.map(function (x) { return '- ' + x; }).join('\n') : '- なし');
md.push('');
md.push('## 気づいたこと');
md.push('');
var facts = null; try { facts = fs.readFileSync(path.join(D, 'facts.md'), 'utf8').trim(); } catch (e) { facts = '（気づいたことは facts.md）'; }
md.push(facts);
md.push('');
fs.writeFileSync(OUT, md.join('\n'));
console.log('wrote ' + OUT + ' (' + md.length + ' lines)');
R.labApply([]);
