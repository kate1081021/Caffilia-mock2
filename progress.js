/*
 * progress.js — 進行モック（クエスト制とステージ制）の決まり。画面に依存しない関数だけ（node でテストできる）。
 *   仕様: .claude/進行モック_指示書.md。中身（戦闘・報酬・強化の方向）は progress_data.js。画面は progress_ui.js。
 *
 *   2つの進行は、パーティ・報酬・強化の扱いを全部共通にし、違いは「次の戦闘を自分で選ぶか（クエスト制）、道が決まっているか（ステージ制）」だけ。
 *   1周: 次の戦闘を決める → 連れていく仲間を選ぶ → 戦闘（既存のもの） → 報酬（新しい魔法・強化を1つ）→ … → 最後のボスを倒すとクリア
 *
 *   run（1周の状態）はただのデータ（JSON にできる）。関数は run を書き換えずに新しい run を返す。
 *   強化の方向だけ乱数を使う（run.rng。種から決まるので、同じ種なら同じ候補が出る）。戦闘の中には乱数を入れない。
 *
 *   ブラウザでは グローバル変数 Progress、node では module.exports で読める。
 */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var R = NODE ? require('./rules.js') : root.Rules;
  var D = NODE ? require('./progress_data.js') : root.RUN_DATA;
  var B = R.BALANCE;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // 乱数（mulberry32）。run.rng を進める
  function rand(run) {
    var t = (run.rng = (run.rng + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function pick(run, list) { return list[Math.floor(rand(run) * list.length)]; }
  function shuffle(run, list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand(run) * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // ---------------------------------------------------------------
  // 1周の始まり
  //   party: 仲間 [{ id, magic }]（1人1魔法。新しい魔法を手に入れると仲間が増える）
  //   upgrades: { 魔法: { 方向: 段 } }
  //   quest: chapter（今の章）・sidesUsed（この章で使った寄り道の回数）・done（受けたクエスト → 'win' | 'lose'）
  //   stage: stage（次のステージの番号）
  //   current: 戦っている戦闘 { ref, battle, type, magic, party: [仲間の id] }
  //   offer: 報酬 { magic: 新しい魔法, candidates: [{ magic, dir, level }] }（受け取るまで残る）
  //   over: null | 'clear' | 'fail'
  // ---------------------------------------------------------------
  function newRun(mode, seed) {
    var run = { mode: mode === 'stage' ? 'stage' : 'quest', seed: seed >>> 0, rng: seed >>> 0, party: [], upgrades: {},
      chapter: 0, sidesUsed: 0, done: {}, stage: 0, current: null, offer: null, over: null, history: [] };
    D.startParty.forEach(function (m) { addMember(run, m); });
    return run;
  }
  function addMember(run, magic) {
    run.party.push({ id: 'M' + (run.party.length + 1), magic: magic });
    run.upgrades[magic] = run.upgrades[magic] || {};
    (D.directions[magic] || []).forEach(function (d) { if (run.upgrades[magic][d.id] === undefined) run.upgrades[magic][d.id] = 0; });
  }
  function owned(run, magic) { return run.party.some(function (p) { return p.magic === magic; }); }
  function member(run, id) { return run.party.filter(function (p) { return p.id === id; })[0] || null; }
  function direction(magic, id) { return (D.directions[magic] || []).filter(function (d) { return d.id === id; })[0] || null; }

  // ---------------------------------------------------------------
  // 次にやる戦闘（クエストのボード／ステージの道）
  //   entry: { ref, battle, type: 'key' | 'rich' | 'easy' | 'stage', magic（新しい魔法）, candidates（強化の候補の数）, state }
  //   state: 'open' 受けられる／'win' 'lose' 受けた／'locked' 寄り道の回数を使い切った（クエスト制）
  //          'done' 'current' 'next'（ステージ制）
  // ---------------------------------------------------------------
  function entry(ref, battle, type, magic) {
    var def = D.battles[battle];
    return { ref: ref, battle: battle, type: type, magic: magic || null, candidates: D.candidates[type], boss: !!(def && def.boss), recommend: (def && def.recommend) || [] };
  }
  function board(run) {
    if (run.mode !== 'quest') return null;
    var ch = D.quest.chapters[run.chapter];
    if (!ch) return null;
    var left = Math.max(0, D.sideLimit - run.sidesUsed);
    var key = entry('c' + run.chapter + '/key', ch.key, 'key');
    key.state = 'open';
    key.last = run.chapter === D.quest.chapters.length - 1;
    var sides = ch.sides.map(function (sd, i) {
      var e = entry('c' + run.chapter + '/side' + i, sd.battle, sd.type, sd.magic);
      e.state = run.done[e.ref] || (left > 0 ? 'open' : 'locked');
      return e;
    });
    return { chapter: run.chapter, chapters: D.quest.chapters.length, name: ch.name, key: key, sides: sides, sidesLeft: left, sideLimit: D.sideLimit };
  }
  function stagePath(run) {
    return D.stages.map(function (st, i) {
      var e = entry('stage/' + i, st.battle, 'stage', st.magic);
      e.index = i;
      e.state = i < run.stage ? 'done' : i === run.stage ? 'current' : 'next';
      e.last = i === D.stages.length - 1;
      return e;
    });
  }
  // 今受けられる戦闘
  function available(run) {
    if (run.over || run.current || run.offer) return [];
    if (run.mode === 'stage') return stagePath(run).filter(function (e) { return e.state === 'current'; });
    var b = board(run);
    if (!b) return [];
    return [b.key].concat(b.sides).filter(function (e) { return e.state === 'open'; });
  }
  function findEntry(run, ref) {
    var list = run.mode === 'stage' ? stagePath(run) : (function () { var b = board(run); return b ? [b.key].concat(b.sides) : []; })();
    return list.filter(function (e) { return e.ref === ref; })[0] || null;
  }

  // ---------------------------------------------------------------
  // 連れていく仲間を選んで、戦闘を始める（仲間が3人以下なら全員）
  // ---------------------------------------------------------------
  function teamSize(run) { return Math.min(3, run.party.length); }
  function startBattle(run0, ref, partyIds) {
    var e = available(run0).filter(function (x) { return x.ref === ref; })[0];
    if (!e) return { ok: false, error: 'その戦闘は今は受けられない' };
    var n = teamSize(run0);
    var ids = (partyIds || []).filter(function (id, i, a) { return member(run0, id) && a.indexOf(id) === i; });
    if (ids.length !== n) return { ok: false, error: n + '人を選ぶ' };
    var run = clone(run0);
    run.current = { ref: e.ref, battle: e.battle, type: e.type, magic: e.magic, party: ids };
    return { ok: true, run: run };
  }

  // その魔法の強化の効果（仮）。power: 直撃の威力に足す数、overrides: { 道筋: 足す数 }
  function effectsOf(run, magic) {
    var out = { power: 0, overrides: {} };
    (D.directions[magic] || []).forEach(function (d) {
      var lv = (run.upgrades[magic] || {})[d.id] || 0;
      if (!lv) return;
      if (d.effect.power) out.power += d.effect.power * lv;
      if (d.effect.override) out.overrides[d.effect.override] = (out.overrides[d.effect.override] || 0) + d.effect.per * lv;
    });
    return out;
  }
  function balanceValue(path) { return path.split('.').reduce(function (o, k) { return o ? o[k] : undefined; }, B); }

  // 戦闘の盤面を作る（既存の戦闘をそのまま使う。連れていった仲間の強化だけを重ねる）
  //   盤面は rules.js のシナリオと同じ形から作り、敵の移動と予告まで済ませる（R.startBattle）
  function buildBattle(run, battleId, partyIds) {
    var def = D.battles[battleId];
    var magics = partyIds.map(function (id) { return member(run, id).magic; });
    var ov = clone(def.overrides || {});
    magics.forEach(function (m) {
      var ef = effectsOf(run, m);
      Object.keys(ef.overrides).forEach(function (p) {
        var base = ov[p] !== undefined ? ov[p] : balanceValue(p);
        ov[p] = base + ef.overrides[p];
      });
    });
    var p = {
      rows: def.rows, mission: def.mission, villages: def.villages, enemyOnly: def.enemyOnly,
      allies: magics.map(function (m, i) { var sl = def.slots[i]; return [m, sl[0], sl[1], { facing: sl[2] || 'up' }]; }),
      enemies: def.enemies.map(function (e) { return clone(e); })
    };
    if (Object.keys(ov).length) p.overrides = ov;
    var s = R.startBattle(R.buildPreset(p)).state;
    // 直撃の威力（仮の強化）。遊び始めの数値（normalizeForPlay）のあとに足す
    R.alliesOf(s).forEach(function (u, i) {
      var ef = effectsOf(run, magics[i]);
      u.power += ef.power;
      u.runMember = partyIds[i];
    });
    // ボス: 敵ごとの HP
    var en = R.enemiesOf(s);
    Object.keys(def.enemyHp || {}).forEach(function (k) { var e = en[Number(k)]; if (e) { e.hp = e.maxHp = def.enemyHp[k]; } });
    return s;
  }

  // ---------------------------------------------------------------
  // 戦闘が終わった（result: 'win' | 'lose'）
  //   勝ち: 報酬（offer）を作る。新しい魔法と、強化の候補（連れていった仲間の魔法から。方向は乱数）
  //   負け: 寄り道なら報酬なしで戻る（回数は使う）。キークエスト・ステージなら1周が終わる
  // ---------------------------------------------------------------
  function finishBattle(run0, result, info) {
    if (!run0.current) return { ok: false, error: '戦っていない' };
    var run = clone(run0), cur = run.current;
    run.history.push({ ref: cur.ref, battle: cur.battle, type: cur.type, result: result, turns: info && info.turns || null,
      party: cur.party.map(function (id) { return member(run, id).magic; }) });
    run.current = null;
    if (run.mode === 'quest' && cur.type !== 'key') { run.sidesUsed += 1; run.done[cur.ref] = result; }
    if (result !== 'win') {
      if (run.mode === 'stage' || cur.type === 'key') run.over = 'fail';
      return { ok: true, run: run };
    }
    run.offer = makeOffer(run, cur);
    return { ok: true, run: run };
  }

  function makeOffer(run, cur) {
    var n = D.candidates[cur.type] || 3;
    var brought = cur.party.map(function (id) { return member(run, id).magic; });
    var open = function (m) { return (D.directions[m] || []).filter(function (d) { return (run.upgrades[m][d.id] || 0) < D.maxLevel; }); };
    var list = [];
    // 1人につき1つ。方向は乱数
    brought.forEach(function (m) {
      var ds = open(m);
      if (ds.length) list.push({ magic: m, dir: pick(run, ds).id });
    });
    // 多いとき（おいしい寄り道）: 連れていった仲間の、まだ出ていない方向を足す
    var tries = 0;
    while (list.length < n && tries++ < 20) {
      var rest = [];
      brought.forEach(function (m) { open(m).forEach(function (d) { if (!list.some(function (c) { return c.magic === m && c.dir === d.id; })) rest.push({ magic: m, dir: d.id }); }); });
      if (!rest.length) break;
      list.push(pick(run, rest));
    }
    // 少ないとき（簡単な寄り道）: 乱数で減らす（並びは連れていった順のまま）
    if (list.length > n) {
      var keep = shuffle(run, list.map(function (c, i) { return i; })).slice(0, n);
      list = list.filter(function (c, i) { return keep.indexOf(i) >= 0; });
    }
    list.forEach(function (c) { c.level = (run.upgrades[c.magic][c.dir] || 0) + 1; });
    return { battle: cur.battle, type: cur.type, ref: cur.ref, magic: cur.magic && !owned(run, cur.magic) ? cur.magic : null, candidates: list };
  }

  // 報酬を受け取る: 新しい魔法（仲間が加わる）と、強化を1つ（index。候補がなければ -1）
  //   そのあと: キークエスト → 次の章（最後ならクリア）／ステージ → 次のステージ（最後ならクリア）
  function claimReward(run0, index) {
    if (!run0.offer) return { ok: false, error: '報酬がない' };
    var run = clone(run0), of = run.offer;
    if (of.candidates.length && !(index >= 0 && index < of.candidates.length)) return { ok: false, error: '強化を1つ選ぶ' };
    if (of.magic && !owned(run, of.magic)) addMember(run, of.magic);
    var got = of.candidates[index] || null;
    if (got) run.upgrades[got.magic][got.dir] = Math.min(D.maxLevel, (run.upgrades[got.magic][got.dir] || 0) + 1);
    var h = run.history[run.history.length - 1];
    if (h) { h.newMagic = of.magic; h.upgrade = got ? { magic: got.magic, dir: got.dir, level: got.level } : null; h.offered = of.candidates.length; }
    run.offer = null;
    if (run.mode === 'stage') {
      run.stage += 1;
      if (run.stage >= D.stages.length) run.over = 'clear';
    } else if (of.type === 'key') {
      run.chapter += 1;
      run.sidesUsed = 0;
      if (run.chapter >= D.quest.chapters.length) run.over = 'clear';
    }
    return { ok: true, run: run };
  }

  // 1周のまとめ（結果の画面）
  function summary(run) {
    var wins = run.history.filter(function (h) { return h.result === 'win'; }).length;
    return { mode: run.mode, over: run.over, battles: run.history.length, wins: wins, losses: run.history.length - wins,
      party: run.party.map(function (p) { return p.magic; }), upgrades: clone(run.upgrades), history: clone(run.history),
      turns: run.history.reduce(function (n, h) { return n + (h.turns || 0); }, 0) };
  }

  var api = {
    DATA: D, newRun: newRun, board: board, stagePath: stagePath, available: available, findEntry: findEntry, teamSize: teamSize,
    startBattle: startBattle, buildBattle: buildBattle, finishBattle: finishBattle, claimReward: claimReward, summary: summary,
    effectsOf: effectsOf, direction: direction, member: member, owned: owned, makeOffer: makeOffer
  };
  if (NODE) module.exports = api;
  else root.Progress = api;
})(this);
