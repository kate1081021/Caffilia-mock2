/*
 * N7 区切りの道（10/19）のシミュレーション: クエスト制の1周を、自動で実際に戦って進め、魔法ごとの道がどう埋まるかを見る。
 *   node tests/lab_seg_sim.js [calm|rough] [win|aim] [区切り] [幅]
 *   省略すると、おだやか・荒れているの2つの道 × 2つの遊び方を、区切り5で全部。
 *   遊び方（どちらも、勝つための手は mission_search.js のビームサーチ）
 *     win: 勝つことだけ考える（ミッションは気にしない。「何も考えずに取ったとき」）
 *     aim: 勝つうえで、ミッションを「自分の方向の形」になる魔法に取らせたい（区切りの中で自分の方向を狙う）
 *   仲間は、クエストのおすすめの魔法（いなければ仲間の並びから）。クエストはボードの上から順に受ける。負けたらもう一度（2回まで）。
 *   lab_seg_lap.js の見積もり（取り方を決め打ち）と違い、だれが取るかは戦闘の中で決まる。
 */
var R = require('../rules.js');
var Q = require('../lab_quest.js');
var MS = require('./mission_search.js');
var LL = R.LX.L, N = LL.N;

function route(order) {
  var c = Q.newCampaign(), out = [];
  if (order === 'rough') c = Q.accept(c, 'c1dark').c;
  for (var guard = 0; guard < 20; guard++) {
    var b = Q.board(c).filter(function (q) { return q.kind !== 'dark' || order === 'rough'; });
    if (!b.length) break;
    out.push(b[0]);
    c = Q.finish(c, b[0].id, true).c;
  }
  return out;
}

// 自分の方向の形になるミッションを、取った数（aim の点）
function aimBonus(s) {
  var v = 0;
  (s.labTargets || []).forEach(function (t) {
    if (!t.got || t.dir === 'dark') return;
    var h = t.got.by || (t.got.cands || [])[0];
    if (h && N.def(h.magic)) v += N.segKind(h.magic, t.dir) === 'awake' ? 2500 : 0;
  });
  return v;
}
// mission_search.js の searchTurn と同じ形で、点だけ差しかえる
function options(s, a) {
  var out = [];
  Object.keys(R.reachableCells(s, a.id)).forEach(function (k) {
    var to = k.split(',').map(Number);
    if (R.canShoot(s, a, to)) R.DIR_ORDER.forEach(function (d) { out.push({ id: a.id, to: to, dir: d, shoot: true }); });
    out.push({ id: a.id, to: to, dir: a.facing, shoot: false });
  });
  return out;
}
function searchTurn(s0, width, score) {
  var beam = [{ state: s0, acts: [] }];
  var n = R.alliesOf(s0).filter(function (a) { return !a.acted; }).length;
  for (var step = 0; step < n; step++) {
    var next = [], seen = {};
    beam.forEach(function (b) {
      if (b.state.result) { next.push(b); return; }
      R.alliesOf(b.state).filter(function (a) { return !a.acted; }).forEach(function (a) {
        options(b.state, a).forEach(function (o) {
          var r = R.act(b.state, o.id, o);
          if (!r.ok) return;
          var st = r.state, sig = JSON.stringify([st.tiles, st.units.map(function (u) { return [u.id, u.x, u.y, u.hp, u.acted]; }), (st.labTargets || []).map(function (t) { return t.got ? 1 : 0; })]);
          if (seen[sig]) return;
          seen[sig] = true;
          next.push({ state: st, acts: b.acts.concat([o]) });
        });
      });
    });
    next.forEach(function (b) { b.sc = score(b.state); });   // 途中は今の盤面と予告で比べる（ターン終了は重いので、最後の候補だけ）
    next.sort(function (a, b) { return b.sc - a.sc; });
    beam = next.slice(0, width);
  }
  return beam.map(function (b) { var st = b.state.result ? b.state : R.endTurn(b.state).state; return { state: st, acts: b.acts, sc: score(st) }; })
    .sort(function (a, b) { return b.sc - a.sc; });
}
function play(s, mode, width) {
  var score = mode === 'aim' ? function (x) { return MS.score(x) + aimBonus(x); } : MS.score;
  for (var t = 0; t < 8 && !s.result; t++) { var best = searchTurn(s, width, score)[0]; if (!best) break; s = best.state; }
  return s;
}

// 1戦（負けたら tries 回まで）。paths は魔法ごとの道（読むだけ）。{ state, tries }
function battle(q, party, paths, mode, width, len, maxTries) {
  var p = Q.preset(q, party, R.findPreset, { seg: { len: len }, dark: party.some(function (m) { return paths[m] && paths[m].dark > 0; }) });
  R.LAB_PRESETS.push(p);
  var st = null, tries = 0;
  try {
    while (tries < (maxTries || 3) && !(st && st.result === 'win')) {
      tries++;
      R.labApply(p.lab, p.labOpts);
      var s0 = R.loadPreset(p.id);
      s0.units.forEach(function (u) { if (u.side === 'ally' && N.def(u.magic)) u.labPath = LL.normPath(u.magic, paths[u.magic] || null); });
      st = play(R.startBattle(s0).state, mode, width);
    }
  } finally { R.LAB_PRESETS.splice(R.LAB_PRESETS.indexOf(p), 1); }
  return { state: st, tries: tries };
}
function recParty(q, roster) {
  var party = Q.recommend(q, R.findPreset).filter(function (m) { return roster.indexOf(m) >= 0; });
  roster.forEach(function (m) { if (party.length < Q.PARTY_SIZE && party.indexOf(m) < 0) party.push(m); });
  return party;
}
// opts.quests: 受ける順（なければボードの上から）・opts.party(q, roster): 連れていく仲間（なければおすすめ）
function lap(order, mode, len, width, each, opts) {
  opts = opts || {};
  var roster = Q.ROSTER_START.slice(), paths = {}, log = [];
  (opts.quests ? opts.quests.map(Q.quest) : route(order)).forEach(function (q) {
    var party = opts.party ? opts.party(q, roster) : recParty(q, roster);
    var b = battle(q, party, paths, mode, width, len), st = b.state, tries = b.tries;
    var got = [];
    if (st.result === 'win') LL.gotOrder(st).forEach(function (t) {
      var h = t.got.by || (t.got.cands || [])[0];
      if (!h) return;
      if (t.dir === 'dark') { paths[h.magic] = paths[h.magic] || LL.newPath(h.magic); LL.gain(paths[h.magic], h.magic, 'dark'); got.push({ name: t.name, w: 'dark', m: h.magic }); return; }
      paths[h.magic] = paths[h.magic] || LL.newPath(h.magic);
      var before = LL.normPath(h.magic, paths[h.magic]);
      var g = LL.gain(paths[h.magic], h.magic, t.dir);
      got.push({ name: t.name, w: t.dir, m: h.magic, own: N.segKind(h.magic, t.dir) === 'awake', slot: g.res.slot, small: g.res.small ? g.res.small.name : null, ms: g.res.ms ? N.msText(N.def(h.magic), g.res.ms.kind) : null, before: before });
    });
    log.push({ q: q, party: party, result: st.result || '決着せず', turn: st.turn, tries: tries, all: (st.labTargets || []).length, got: got });
    if (each) each(log[log.length - 1]);
    if (st.result === 'win' && q.reward && q.reward.join && roster.indexOf(q.reward.join) < 0) roster.push(q.reward.join);
  });
  return { log: log, paths: paths };
}

function show(order, mode, len, width) {
  var t0 = Date.now();
  console.log('\n■ ' + (order === 'calm' ? 'おだやか' : '荒れている（裏クエストを受ける）') + ' × ' + (mode === 'aim' ? '自分の方向を狙う' : '勝つだけ') + '（区切り' + len + '・幅' + width + '）');
  var r = lap(order, mode, len, width, function (x) {
    console.log('  「' + x.q.name + '」 ' + x.party.map(R.magicName).join('・') + ' → ' + (x.result === 'win' ? '勝ち' : x.result === 'lose' ? '負け' : x.result) + '（' + x.turn + 'ターン' + (x.tries > 1 ? '・' + x.tries + '回目' : '') + '）ミッション ' + x.got.length + '/' + x.all);
    x.got.forEach(function (g) {
      if (g.w === 'dark') { console.log('      闇 ' + g.name + ' → ' + R.magicName(g.m) + '（闇の力）'); return; }
      console.log('      ' + N.shape(g.w) + ' ' + g.name + ' → ' + R.magicName(g.m) + (g.own ? '（自分の方向）' : '（ほか）') + ' 道の' + g.slot + 'マス目' + (g.small ? '・' + g.small : '') + (g.ms ? ' ★節目: ' + g.ms : ''));
    });
  });
  console.log('  ── 1周のあとの道');
  Object.keys(r.paths).forEach(function (m) {
    var p = LL.normPath(m, r.paths[m]);
    console.log('    ' + R.magicName(m) + ': ' + LL.pathMarks(m, p) + '  （' + p.road.length + 'マス・節目' + p.ms.length + '）');
  });
  console.log('  （' + Math.round((Date.now() - t0) / 1000) + '秒）');
}

module.exports = { route: route, play: play, battle: battle, lap: lap, recParty: recParty };
if (require.main === module) {
  var a = process.argv.slice(2), len = Number(a[2]) || 5, width = Number(a[3]) || 25;
  var orders = a[0] ? [a[0]] : ['calm', 'rough'], modes = a[1] ? [a[1]] : ['win', 'aim'];
  orders.forEach(function (o) { modes.forEach(function (m) { show(o, m, len, width); }); });
  R.labApply([]);
}
