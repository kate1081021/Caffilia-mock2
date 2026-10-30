/*
 * N7 区切りの道のシミュレーション: クエスト制の1周を、自動で実際に戦って進め、魔法ごとの道がどう埋まるかを見る。
 *   node tests/lab_seg_sim.js [calm|rough] [win|aim:<魔法>] [A|B] [区切り] [幅]
 *   省略すると、おだやかの道 × 勝つだけ × 道の決まり A、区切り5・幅12。
 *   10/19「ミッションの組み直しと道の切り替え」で、誰が取るかを「クリア後に選ぶ」（候補から1人）にした。選び方は打ち手ごと【仮】:
 *     win（勝つだけ）: 勝つことだけ考える（mission_search.js のビームサーチ）。候補のうち、道のマスが一番少ない魔法（同じなら仲間の並び順）
 *     aim:<魔法>（狙う）: 1周で、決めた1つの魔法を変化させたい。その魔法を必ず連れていき、勝つうえで、その魔法が「狙う方向」の形の候補に入る手に点を足す。
 *       狙う方向は、A では自分の方向（やりたいこと）、B では1つ目の方向。選び方: その魔法が候補にいて、形が狙う方向なら、その魔法。
 *       狙う方向でない形は、今の区切りでまだ変化に届くなら（狙う方向でない形が 区切り − 3 より少ない）その魔法、届かなくなるならほかの候補（勝つだけと同じ選び方）
 *   仲間は、クエストのおすすめの魔法（いなければ仲間の並びから）。クエストはボードの上から順に受ける。負けたら受け直す（3回まで）。
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
function candsOf(t) { return t.got ? (t.got.cands || (t.got.by ? [t.got.by] : [])) : []; }
// 狙う魔法が「狙う方向」の形の候補に入ったミッションの数（aim の点）
function aimBonus(s, m) {
  var v = 0;
  (s.labTargets || []).forEach(function (t) {
    if (!t.got || t.dir === 'dark') return;
    if (candsOf(t).some(function (h) { return h.magic === m; }) && N.segKind(m, t.dir) === 'awake') v += 2500;
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
          var st = r.state, sig = JSON.stringify([st.tiles, st.units.map(function (u) { return [u.id, u.x, u.y, u.hp, u.acted]; }), (st.labTargets || []).map(function (t) { return candsOf(t).map(function (h) { return h.id; }).join(','); })]);
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
function play(s, o) {
  var score = o.aim ? function (x) { return MS.score(x) + aimBonus(x, o.aim); } : MS.score;
  for (var t = 0; t < 8 && !s.result; t++) { var best = searchTurn(s, o.width || 12, score)[0]; if (!best) break; s = best.state; }
  return s;
}
function segOf(o) { return { len: o.len || 5, rule: o.rule || 'A', take: o.take || 'pick' }; }

// 1戦（負けたら tries 回まで）。paths は魔法ごとの道（読むだけ）。{ state, tries, p }
function battle(q, party, paths, o, maxTries) {
  o = o || {};
  var p = Q.preset(q, party, R.findPreset, { seg: segOf(o), dark: party.some(function (m) { return paths[m] && paths[m].dark > 0; }) });
  R.LAB_PRESETS.push(p);
  var st = null, tries = 0;
  try {
    while (tries < (maxTries || 3) && !(st && st.result === 'win')) {
      tries++;
      R.labApply(p.lab, p.labOpts);
      var s0 = R.loadPreset(p.id);
      s0.units.forEach(function (u) { if (u.side === 'ally' && N.def(u.magic)) u.labPath = LL.normPath(u.magic, paths[u.magic] || null); });
      st = play(R.startBattle(s0).state, o);
    }
  } finally { R.LAB_PRESETS.splice(R.LAB_PRESETS.indexOf(p), 1); }
  R.labApply(p.lab, p.labOpts);   // 選ぶ・道に入れるときも、この盤面の切り替えのまま
  return { state: st, tries: tries, p: p };
}
function recParty(q, roster) {
  var party = Q.recommend(q, R.findPreset).filter(function (m) { return roster.indexOf(m) >= 0; });
  roster.forEach(function (m) { if (party.length < Q.PARTY_SIZE && party.indexOf(m) < 0) party.push(m); });
  return party;
}
function keepRec(must) {   // must の魔法を必ず連れていき、残りはおすすめから
  return function (q, roster) {
    var party = must.filter(function (m) { return roster.indexOf(m) >= 0; });
    recParty(q, roster).forEach(function (m) { if (party.length < Q.PARTY_SIZE && party.indexOf(m) < 0) party.push(m); });
    return party;
  };
}
// 勝ったあとの選び方
function cellsOf(paths, m) { return paths[m] ? LL.normPath(m, paths[m]).road.length : 0; }
function fewest(list, paths) {
  return list.slice().sort(function (a, b) { return (cellsOf(paths, a) - cellsOf(paths, b)) || (Q.ROSTER_ORDER.indexOf(a) - Q.ROSTER_ORDER.indexOf(b)); })[0];
}
function aimTakes(m, w, paths) {
  if (N.segKind(m, w) === 'awake') return true;
  var p = LL.normPath(m, paths[m] || null), L = N.segLen(), inSeg = p.road.length % L, cells = p.road.slice(p.road.length - inSeg);
  var need = N.bOn() ? N.bNeed() : Math.floor(L / 2) + 1;
  return cells.filter(function (r) { return N.segKind(m, r.w) !== 'awake'; }).length + 1 <= L - need;
}
function choose(t, paths, o) {
  var cands = [];
  candsOf(t).forEach(function (h) { if (N.def(h.magic) && cands.indexOf(h.magic) < 0) cands.push(h.magic); });
  if (!cands.length) return null;
  if (cands.length === 1) return cands[0];
  if (o.aim && cands.indexOf(o.aim) >= 0) {
    if (t.dir !== 'dark' && aimTakes(o.aim, t.dir, paths)) return o.aim;
    cands = cands.filter(function (m) { return m !== o.aim; });
  }
  return fewest(cands, paths);
}
function roleList(t) { var r = {}; if (t.got && t.got.roles) candsOf(t).forEach(function (h) { r[h.magic] = (t.got.roles[h.id] || []).slice(); }); return r; }

// 1周。o: { order, rule, aim, width, len, quests（受ける順。なければボードの上から）, party(q, roster)（なければおすすめ。狙うなら狙う魔法を必ず） }
function lap(o, each) {
  o = o || {};
  var roster = Q.ROSTER_START.slice(), paths = {}, log = [];
  var pick = o.party || (o.aim ? keepRec([o.aim]) : recParty);
  (o.quests ? o.quests.map(Q.quest) : route(o.order || 'calm')).forEach(function (q) {
    var party = pick(q, roster);
    var b = battle(q, party, paths, o), st = b.state;
    var ms = (st.labTargets || []).map(function (t) {
      return { id: t.id, name: t.name, w: t.dir, cands: candsOf(t).map(function (h) { return h.magic; }), roles: roleList(t), seq: t.got ? t.got.seq || 0 : 99 };
    });
    var got = [];
    if (st.result === 'win') LL.gotOrder(st).forEach(function (t) {
      var m = choose(t, paths, o);
      if (!m) return;
      paths[m] = paths[m] || LL.newPath(m);
      var g = LL.gain(paths[m], m, t.dir);
      var rec = { id: t.id, name: t.name, w: t.dir, m: m, cands: candsOf(t).map(function (h) { return h.magic; }) };
      if (t.dir !== 'dark') {
        var d = N.def(m);
        rec.kind = N.segKind(m, t.dir); rec.slot = g.res.slot; rec.small = g.res.small ? g.res.small.name : null;
        rec.ms = g.res.ms ? (g.res.ms.kind === 'none' ? '何も起きない' : N.msText(d, g.res.ms.kind)) : null; rec.msKind = g.res.ms ? g.res.ms.kind : null;
      }
      got.push(rec);
    });
    log.push({ q: q, party: party, result: st.result || 'none', turn: st.turn, tries: b.tries, all: (st.labTargets || []).length, missions: ms, got: got });
    if (each) each(log[log.length - 1]);
    if (st.result === 'win' && q.reward && q.reward.join && roster.indexOf(q.reward.join) < 0) roster.push(q.reward.join);
  });
  return { log: log, paths: paths };
}
function pathInfo(m, p0) {
  var p = LL.normPath(m, p0);
  return { marks: LL.pathMarks(m, p), road: p.road.map(function (r) { return r.w; }), cells: p.road.length, ms: p.ms.map(function (x) { return x.kind; }), form: p.form, awake: p.awake, range: p.range || 0, dark: p.dark || 0,
    small: N.smallCells(m, p).filter(function (c) { return c.step; }).map(function (c) { return c.step.name; }) };
}

function show(o) {
  var t0 = Date.now();
  console.log('\n■ ' + (o.order === 'rough' ? '荒れている（裏クエストを受ける）' : 'おだやか') + ' × ' + (o.aim ? R.magicName(o.aim) + 'を狙う' : '勝つだけ') + ' × 道の決まり ' + (o.rule || 'A') + '（区切り' + (o.len || 5) + '・幅' + (o.width || 12) + '）');
  var r = lap(o, function (x) {
    console.log('  「' + x.q.name + '」 ' + x.party.map(R.magicName).join('・') + ' → ' + (x.result === 'win' ? '勝ち' : x.result === 'lose' ? '負け' : '決着せず') + '（' + x.turn + 'ターン' + (x.tries > 1 ? '・' + x.tries + '回目' : '') + '）');
    x.missions.forEach(function (mm) {
      var g = x.got.filter(function (y) { return y.id === mm.id; })[0];
      console.log('      ' + (mm.w === 'dark' ? '闇' : N.shape(mm.w)) + ' ' + mm.name + ' 候補: ' + (mm.cands.map(R.magicName).join('・') || '—') + (g ? ' → ' + R.magicName(g.m) + (g.slot ? ' 道の' + g.slot + 'マス目' : '') + (g.small ? '・' + g.small : '') + (g.ms ? ' ★節目: ' + g.ms : '') : ''));
    });
  });
  console.log('  ── 1周のあとの道');
  Object.keys(r.paths).forEach(function (m) { var p = pathInfo(m, r.paths[m]); console.log('    ' + R.magicName(m) + ': ' + p.marks + '  （' + p.cells + 'マス・節目' + p.ms.length + '）'); });
  console.log('  （' + Math.round((Date.now() - t0) / 1000) + '秒）');
}

module.exports = { route: route, play: play, battle: battle, lap: lap, recParty: recParty, keepRec: keepRec, choose: choose, candsOf: candsOf, roleList: roleList, pathInfo: pathInfo };
if (require.main === module) {
  var a = process.argv.slice(2), mode = a[1] || 'win';
  show({ order: a[0] || 'calm', aim: /^aim:/.test(mode) ? mode.slice(4) : null, rule: a[2] === 'B' ? 'B' : 'A', len: Number(a[3]) || 5, width: Number(a[4]) || 12 });
  R.labApply([]);
}
