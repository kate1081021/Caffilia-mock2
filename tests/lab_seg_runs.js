/*
 * N7 区切りの道（10/19）のシミュレーションを、条件を変えて何回か回す（結果は JSON。まとめのページの元）。
 *   node tests/lab_seg_runs.js quest <クエストid> <出力.json>   … そのクエストを、5つの魔法から3人の組み合わせ全部（10通り）で1回ずつ戦う（道は0から）
 *   node tests/lab_seg_runs.js lap <やり方> <出力.json>          … 1周（道を持ち越す）。やり方は下の LAPS
 *   戦い方は lab_seg_sim.js（自動の打ち手。幅12・区切り5）。
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
    var h = t.got ? (t.got.by || (t.got.cands || [])[0]) : null;
    return { id: t.id, name: t.name, w: t.dir, by: h ? h.magic : null, how: t.got ? t.got.how : null, kind: h && t.dir !== 'dark' && N.def(h.magic) ? N.segKind(h.magic, t.dir) : null };
  });
}
function pathInfo(m, p0) {
  var p = LL.normPath(m, p0);
  return { marks: LL.pathMarks(m, p), road: p.road.map(function (r) { return r.w; }), cells: p.road.length, ms: p.ms.map(function (x) { return x.kind; }), form: p.form, awake: p.awake, range: p.range || 0, dark: p.dark || 0,
    small: N.smallCells(m, p).filter(function (c) { return c.step; }).map(function (c) { return c.step.name; }) };
}

// 1周のやり方
function keepRec(must) {   // must の魔法を必ず連れていき、残りはおすすめから
  return function (q, roster) {
    var party = must.filter(function (m) { return roster.indexOf(m) >= 0; });
    S.recParty(q, roster).forEach(function (m) { if (party.length < Q.PARTY_SIZE && party.indexOf(m) < 0) party.push(m); });
    return party;
  };
}
var LAPS = {
  board:  { label: 'ボードの上から順・おすすめの仲間', order: 'calm' },
  side:   { label: '寄り道を先に（谷 → 畑 → 森 → 村 → 第2章）', order: 'calm', quests: ['c1lure', 'c1field', 'c1burn', 'c1guard', 'c2grass', 'c2cargo', 'c2hill'] },
  key:    { label: 'キークエストだけ（寄り道しない）', order: 'calm', quests: ['c1burn', 'c1guard', 'c2cargo', 'c2hill'] },
  rough:  { label: '裏クエストを受ける（荒れている）', order: 'rough' },
  grow:   { label: '草と火を必ず連れていく（育てたい魔法を入れる）', order: 'calm', party: keepRec(['grass', 'fire']) },
  narrow: { label: 'ボードの上から順・打ち手の幅8（別の手を選ぶ）', order: 'calm', width: 8 },
  aim:    { label: 'ボードの上から順・自分の方向を狙う', order: 'calm', mode: 'aim' }
};

var a = process.argv.slice(2), out = {};
if (a[0] === 'quest') {
  var q = Q.quest(a[1]);
  out = { quest: q.id, runs: combos().map(function (party) {
    var t0 = Date.now(), b = S.battle(q, party, {}, 'win', WIDTH, LEN, 1);
    return { party: party, result: b.state.result || 'none', turn: b.state.turn, ms: Date.now() - t0, missions: missionsOf(b.state) };
  }) };
} else if (a[0] === 'lap') {
  var L = LAPS[a[1]];
  var r = S.lap(L.order, L.mode || 'win', LEN, L.width || WIDTH, null, { quests: L.quests, party: L.party });
  out = { lap: a[1], label: L.label, quests: r.log.map(function (x) {
    return { id: x.q.id, name: x.q.name, party: x.party, result: x.result, turn: x.turn, tries: x.tries, all: x.all,
      got: x.got.map(function (g) { return { name: g.name, w: g.w, m: g.m, own: !!g.own, slot: g.slot || null, small: g.small || null, ms: g.ms || null }; }) };
  }), paths: Object.keys(r.paths).reduce(function (o, m) { o[m] = pathInfo(m, r.paths[m]); return o; }, {}) };
} else { console.log('使い方: quest <id> <out> ／ lap <' + Object.keys(LAPS).join('|') + '> <out>'); process.exit(1); }
fs.writeFileSync(a[2], JSON.stringify(out, null, 1));
console.log('wrote ' + a[2]);
R.labApply([]);
