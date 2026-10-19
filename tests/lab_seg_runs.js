/*
 * N7 区切りの道のシミュレーションを、条件を変えて回す（結果は JSON。まとめの元）。10/19「ミッションの組み直しと道の切り替え」で組み直した
 *   node tests/lab_seg_runs.js quest <クエストid> <出力.json> [番号]   … そのクエストを、5つの魔法から3人の組み合わせ全部（10通り）で1回ずつ戦う（道は0から・勝つだけ）。番号（0〜9）があればその組だけ（手分けして回す）
 *   node tests/lab_seg_runs.js lap <やり方> <A|B> <出力.json>          … 1周（道を持ち越す）。やり方は下の LAPS か aim:<魔法>（その魔法を狙う）
 *   戦い方・選び方は lab_seg_sim.js（自動の打ち手。幅12・区切り5。誰が取るかは「クリア後に選ぶ」）。
 *   quest の結果は、だれが候補になったか（ミッションごと・役ごと）。道は0からなので、道の決まり（A/B）では変わらない。
 */
var fs = require('fs');
var R = require('../rules.js');
var Q = require('../lab_quest.js');
var S = require('./lab_seg_sim.js');
var LL = R.LX.L, N = LL.N;
var MAGICS = ['grass', 'earth', 'fire', 'water', 'wind'];
var WIDTH = 12, LEN = 5;

function combos() {
  var out = [];
  for (var i = 0; i < 5; i++) for (var j = i + 1; j < 5; j++) for (var k = j + 1; k < 5; k++) out.push([MAGICS[i], MAGICS[j], MAGICS[k]]);
  return out;
}
function missionsOf(st) {
  return (st.labTargets || []).map(function (t) {
    return { id: t.id, name: t.name, w: t.dir, cands: S.candsOf(t).map(function (h) { return h.magic; }), roles: S.roleList(t), turn: t.got ? t.got.turn : null };
  });
}

// 1周のやり方（勝つだけ）。aim:<魔法> は lab_seg_sim.js の狙う打ち手
var LAPS = {
  board:  { label: 'ボードの上から順・おすすめの仲間', order: 'calm' },
  side:   { label: '寄り道を先に（谷 → 畑 → 森 → 村 → 第2章）', order: 'calm', quests: ['c1lure', 'c1field', 'c1burn', 'c1guard', 'c2grass', 'c2cargo', 'c2hill'] },
  key:    { label: 'キークエストだけ（寄り道しない）', order: 'calm', quests: ['c1burn', 'c1guard', 'c2cargo', 'c2hill'] },
  rough:  { label: '裏クエストを受ける（荒れている）', order: 'rough' },
  grow:   { label: '草と火を必ず連れていく（育てたい魔法を入れる）', order: 'calm', party: S.keepRec(['grass', 'fire']) },
  narrow: { label: 'ボードの上から順・打ち手の幅8（別の手を選ぶ）', order: 'calm', width: 8 }
};

var a = process.argv.slice(2), out = {};
if (a[0] === 'quest') {
  var q = Q.quest(a[1]);
  var list = combos().map(function (p, i) { return { p: p, i: i }; }).filter(function (x) { return a[3] === undefined || x.i === Number(a[3]); });
  out = { quest: q.id, runs: list.map(function (x) {
    var party = x.p;
    var t0 = Date.now(), b = S.battle(q, party, {}, { width: WIDTH, len: LEN, rule: 'A' }, 1);
    return { party: party, result: b.state.result || 'none', turn: b.state.turn, ms: Date.now() - t0, missions: missionsOf(b.state) };
  }) };
  fs.writeFileSync(a[2], JSON.stringify(out, null, 1));
} else if (a[0] === 'lap') {
  var aim = /^aim:/.test(a[1]) ? a[1].slice(4) : null, L = aim ? { label: R.magicName(aim) + 'を狙う（ボードの上から順・' + R.magicName(aim) + 'を必ず連れていく）', order: 'calm' } : LAPS[a[1]], rule = a[2] === 'B' ? 'B' : 'A';
  var t1 = Date.now();
  var r = S.lap({ order: L.order, rule: rule, aim: aim, len: LEN, width: L.width || WIDTH, quests: L.quests, party: L.party });
  out = { lap: a[1], rule: rule, aim: aim, label: L.label, ms: Date.now() - t1, quests: r.log.map(function (x) {
    return { id: x.q.id, name: x.q.name, party: x.party, result: x.result, turn: x.turn, tries: x.tries, all: x.all, missions: x.missions, got: x.got };
  }), paths: Object.keys(r.paths).reduce(function (o, m) { o[m] = S.pathInfo(m, r.paths[m]); return o; }, {}) };
  fs.writeFileSync(a[3], JSON.stringify(out, null, 1));
} else { console.log('使い方: quest <id> <out> ／ lap <' + Object.keys(LAPS).join('|') + '|aim:<魔法>> <A|B> <out>'); process.exit(1); }
console.log('wrote ' + (a[0] === 'quest' ? a[2] : a[3]));
R.labApply([]);
