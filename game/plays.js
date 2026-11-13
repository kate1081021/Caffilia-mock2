/*
 * plays.js — プレイ集（オーナー 11/10）: 遊んでクリアした攻略の記録と、流す順番
 *   画面に依存しない関数だけ（node でテストできる）。画面（書き留め・一覧・流す）は ui.js。
 *   ルール（rules.js）は R として受け取って、遊ぶときと同じ関数を呼ぶだけ（ルールは変えない。結果は毎回ルールで計算し直す）。
 *   ブラウザでは グローバル変数 Plays、node では module.exports で読める。
 *
 *   記録 { id, name, stage: { kind, uid, name }, turns: [[手, …], …], at }
 *     stage.kind … 'tut'（チュートリアル）・'all'（みんなのステージ）・'mine'（自分のステージ）
 *     stage.uid  … ステージの背番号（uidOf）。名前を変えても変わらないので、記録はステージについていく
 *     stage.name … 記録したときのステージの名前（ステージが見つからないときに出す）
 *     手 … ['move', 味方, x, y]（移動）・['act', 味方, 向き, 1 構え／0 待機]・['order', 味方, -1／+1]（発動の順番）・
 *          ['fire']（発動）・['seal']（②の「クリアする」）
 *     turns は ['fire'] で区切る（最後のターンは、勝った手で終わる）
 *
 *   uidOf(rec, name) / newId(head)     … ステージの背番号・新しい背番号
 *   stamp(stages, trash)               … 背番号のない前からの自分のステージ・ゴミ箱の中身に、背番号を付ける
 *   apply(R, s, op) / run(R, s, ops)   … 手を1つ・並びを打つ（R.move・R.act・R.reorderStance・R.endTurn・R.claimSeal）
 *   check(R, start, rec)               … 頭から最後まで打って、クリアになるか（ならなければ、何ターン目で・なぜ）
 *   tidy(R, start, ops)                … 迷った手（動き直し・構え直し）を、ターンごとに最後の形だけにまとめる（結果が変わるターンはそのまま）
 *   split(ops) / flat(turns)           … ターンごとに分ける・つなぐ
 *   playlist(items, opts, rnd)         … 流す順番（順番どおり／ランダム、止まる／ループ）
 */
(function (root) {
  'use strict';

  var KINDS = ['tut', 'all', 'mine'];
  var OPS = { move: 4, act: 4, order: 3, fire: 1, seal: 1 };

  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }

  // ---------------------------------------------------------------
  // ステージの背番号（オーナー 11/10「名前を変えたら記録が迷子になる、をなくしたい」）
  //   ステージの定義（def）の uid に持つ。名前を変えても・ゴミ箱から戻しても変わらない。写す（〜のコピー）と新しい背番号。
  //   背番号のない前からのステージには、最初に読んだときに付ける（stamp。名前から決まる 'n:名前'。前に取った記録もそのまま指せる）
  // ---------------------------------------------------------------
  function newId(head) { return (head || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function uidOf(rec, name) { return (rec && rec.def && typeof rec.def.uid === 'string' && rec.def.uid) || ('n:' + name); }

  // 自分のステージ（{ 名前: { def, … } }）とゴミ箱（{ 鍵: { name, rec, … } }）の、背番号のないものに付ける。
  //   { stages, trash, changed }（どちらも新しい入れ物。changed なら置き直す）。ゴミ箱の中身は、消す前の名前から決める
  function stamp(stages, trash) {
    stages = clone(stages || {}); trash = clone(trash || {});
    var changed = false;
    var put = function (rec, name) {
      if (rec && rec.def && typeof rec.def === 'object' && !(typeof rec.def.uid === 'string' && rec.def.uid)) { rec.def.uid = 'n:' + name; changed = true; }
    };
    Object.keys(stages).forEach(function (n) { put(stages[n], n); });
    Object.keys(trash).forEach(function (k) { put(trash[k] && trash[k].rec, (trash[k] && trash[k].name) || k); });
    return { stages: stages, trash: trash, changed: changed };
  }

  // ---------------------------------------------------------------
  // 手を打つ（遊ぶ画面が呼ぶのと同じルールの関数）
  // ---------------------------------------------------------------
  function okOp(op) {
    if (!Array.isArray(op) || OPS[op[0]] !== op.length) return false;
    if (op[0] === 'move') return typeof op[1] === 'string' && op[2] % 1 === 0 && op[3] % 1 === 0;
    if (op[0] === 'act') return typeof op[1] === 'string' && typeof op[2] === 'string' && (op[3] === 0 || op[3] === 1);
    if (op[0] === 'order') return typeof op[1] === 'string' && (op[2] === -1 || op[2] === 1);
    return true;
  }
  function apply(R, s, op) {
    if (!okOp(op)) return { ok: false, error: '知らない手' };
    switch (op[0]) {
      case 'move': return R.move(s, op[1], [op[2], op[3]]);
      case 'act': return R.act(s, op[1], { dir: op[2], shoot: op[3] === 1 });
      case 'order': return R.reorderStance(s, op[1], op[2]);
      case 'fire': return R.endTurn(s);
      default: return R.claimSeal(s);
    }
  }
  // 手の並びを打つ。{ ok, state, at（止まった手の番号）, turn（何ターン目。1から）, error }
  function run(R, s, ops) {
    var turn = 1;
    for (var i = 0; i < ops.length; i++) {
      if (s.result) return { ok: false, state: s, at: i, turn: turn, error: '勝負がついたあとに手が残っている' };
      var r = apply(R, s, ops[i]);
      if (!r || !r.ok) return { ok: false, state: s, at: i, turn: turn, error: (r && r.error) || '打てない手' };
      s = r.state;
      if (ops[i][0] === 'fire') turn++;
    }
    return { ok: true, state: s, turn: turn };
  }

  function split(ops) {
    var turns = [], cur = [];
    ops.forEach(function (op) { cur.push(op); if (op[0] === 'fire') { turns.push(cur); cur = []; } });
    if (cur.length) turns.push(cur);
    return turns;
  }
  function flat(turns) { return [].concat.apply([], turns || []); }

  // 頭から最後まで打って、クリアになるか（オーナー 11/10「ルールやステージを変えると、古い記録が途中で違う結果になることがある」）
  //   { ok, turns } か { ok: false, turn, why }
  function check(R, start, rec) {
    if (!start) return { ok: false, turn: 0, why: 'ステージが見つからない' };
    var turns = rec && Array.isArray(rec.turns) ? rec.turns : null;
    if (!turns || !turns.length || !turns.every(Array.isArray)) return { ok: false, turn: 0, why: '記録の形が正しくない' };
    var ops = flat(turns), r = run(R, start, ops);
    if (!r.ok) return { ok: false, turn: r.turn, why: r.turn + 'ターン目で打てない手がある（' + r.error + '）' };
    if (r.state.result === 'win') return { ok: true, turns: turns.length };
    if (r.state.result === 'lose') return { ok: false, turn: r.turn, why: '負けてしまう' };
    return { ok: false, turn: r.turn, why: '最後まで流してもクリアにならない' };
  }

  // ---------------------------------------------------------------
  // 迷った手をまとめる（流したときに、動き直し・構え直しを見せないため）
  //   1ターンの手を「移動（最後に動いた順）→ 構え・待機（向きか構えが変わった味方だけ）→ 発動の順番」に組み直す。
  //   組み直したターンが、元の手と同じ盤面にならなければ、そのターンは元の手のまま（結果はいつも元の記録と同じ）
  // ---------------------------------------------------------------
  // くらべるための盤面: 構えの番号は並びの順位に直す（順位が同じなら同じ）。
  //   false・null の項目は、ないのと同じに扱う（動き直すと「泥沼にはまっていない」が false で残る など。ルールはどちらも同じに読む）
  //   項目の並び（書いた順）はくらべない
  function sameState(R, a, b) {
    var str = function (o) {
      if (Array.isArray(o)) return '[' + o.map(str).join(',') + ']';
      if (o && typeof o === 'object') {
        return '{' + Object.keys(o).filter(function (k) { return o[k] !== false && o[k] !== null && o[k] !== undefined; }).sort()
          .map(function (k) { return JSON.stringify(k) + ':' + str(o[k]); }).join(',') + '}';
      }
      return JSON.stringify(o);
    };
    var norm = function (s) {
      var x = clone(s);
      (x.units || []).forEach(function (u) { if (u.stance) u.stance.n = R.stanceOrder(s, u.id); });   // ルールが読む順番（構える味方はいつも最後）
      return str(x);
    };
    return norm(a) === norm(b);
  }
  //   味方ごとに「移動 → 構え」をまとめる（誰がどこに動いて、どこに構えたかが1人ずつ見える）。
  //   味方の順は、最後に動いた順（動かなかった味方は、最後に触った順で、そのあと）
  function tidyTurn(R, s0, body, sEnd) {
    var ids = [], lastMove = {}, lastOp = {};
    body.forEach(function (op, i) {
      if (op[0] === 'fire' || op[0] === 'seal') return;
      if (ids.indexOf(op[1]) < 0) ids.push(op[1]);
      if (op[0] === 'move') lastMove[op[1]] = i;
      lastOp[op[1]] = i;
    });
    var rank = function (id) { return lastMove[id] !== undefined ? lastMove[id] : 1e6 + lastOp[id]; };
    var out = [];
    ids.sort(function (p, q) { return rank(p) - rank(q); }).forEach(function (id) {
      var u0 = R.findUnit(s0, id), u1 = R.findUnit(sEnd, id);
      if (!u0 || !u1) return;
      if (u0.x !== u1.x || u0.y !== u1.y) out.push(['move', id, u1.x, u1.y]);
      if (u1.acted && (!u0.acted || u0.facing !== u1.facing || !!u0.stance !== !!u1.stance)) out.push(['act', id, u1.facing, u1.stance ? 1 : 0]);
    });
    // 発動の順番: 組み直した手のあとの並びを、元の手のあとの並びにそろえる（となりと入れ替える ▲▼ だけで）
    var mid = run(R, s0, out);
    if (!mid.ok) return null;
    var order = function (s) {
      return s.units.filter(function (u) { return u.side === 'ally' && !u.npc && u.stance; })
        .sort(function (p, q) { return p.stance.n - q.stance.n; }).map(function (u) { return u.id; });
    };
    var want = order(sEnd), now = order(mid.state);
    if (want.join() !== now.slice().sort(function (p, q) { return want.indexOf(p) - want.indexOf(q); }).join()) return null;
    for (var i = 0; i < want.length; i++) {
      for (var j = now.indexOf(want[i]); j > i; j--) {
        out.push(['order', want[i], -1]);
        var t = now[j - 1]; now[j - 1] = now[j]; now[j] = t;
      }
    }
    return out;
  }
  function tidy(R, start, ops) {
    var turns = split(ops), out = [], s = start;
    for (var t = 0; t < turns.length; t++) {
      var turn = turns[t], last = turn[turn.length - 1];
      var end = last && (last[0] === 'fire' || last[0] === 'seal') ? last : null;
      var body = end ? turn.slice(0, -1) : turn;
      var raw = run(R, s, body);
      if (!raw.ok) return ops;   // 打てない手がある記録は、まとめずにそのまま
      var use = body;
      if (!raw.state.result) {   // 途中で勝った（宝を持って帰り口に着いた など）ターンは、そのまま
        var cand = tidyTurn(R, s, body, raw.state), c = cand && run(R, s, cand);
        if (c && c.ok && sameState(R, c.state, raw.state)) use = cand;
      }
      var full = end ? use.concat([end]) : use;
      var next = run(R, s, full);
      if (!next.ok) return ops;
      out = out.concat(full);
      s = next.state;
    }
    return out;
  }

  // ---------------------------------------------------------------
  // 記録の形（ほかのパソコン・前の版から来たものも読むので、先に確かめる）
  // ---------------------------------------------------------------
  function valid(rec) {
    if (!rec || typeof rec !== 'object' || typeof rec.id !== 'string' || typeof rec.name !== 'string') return false;
    var st = rec.stage;
    if (!st || KINDS.indexOf(st.kind) < 0 || typeof st.uid !== 'string' || !st.uid) return false;
    return Array.isArray(rec.turns) && rec.turns.length > 0 && rec.turns.every(function (t) { return Array.isArray(t) && t.every(okOp); });
  }

  // ---------------------------------------------------------------
  // 流す順番（オーナー 11/10）
  //   items: [{ key: ステージの鍵, rec, … }]（流せるものだけ、一覧の順）。opts: { order: 'seq'|'random', end: 'stop'|'loop' }。
  //   順番どおり: 一覧の順に1つずつ。ランダム: ステージを混ぜて1周（どのステージも1回ずつ）→ また混ぜる。
  //     周のつなぎ目でも同じステージが続かない。同じステージの記録は、その中でも混ぜて順に回す。
  //   止まる: 1周したら null（順番どおりは全部、ランダムはどのステージも1回ずつ）。ループ: 頭に戻る。
  //   rnd: 0〜1 を返す関数（省略で Math.random。ゲームのルールではなく、流す順番だけに使う）
  // ---------------------------------------------------------------
  function playlist(items, opts, rnd) {
    opts = opts || {};
    rnd = rnd || Math.random;
    var keys = [], by = {};
    items.forEach(function (it) { if (!by[it.key]) { by[it.key] = []; keys.push(it.key); } by[it.key].push(it); });
    var i = 0, bag = [], rounds = 0, lastKey = null, recBags = {}, lastRec = {};
    function shuffle(a) {
      for (var k = a.length - 1; k > 0; k--) { var j = Math.floor(rnd() * (k + 1)), t = a[k]; a[k] = a[j]; a[j] = t; }
      return a;
    }
    // 頭が前と同じなら、ほかのどれかと入れ替える
    function notFirst(a, same) {
      if (a.length > 1 && a[0] === same) { var j = 1 + Math.floor(rnd() * (a.length - 1)), t = a[0]; a[0] = a[j]; a[j] = t; }
      return a;
    }
    function next() {
      if (!items.length) return null;
      if (opts.order !== 'random') {
        if (i >= items.length) { if (opts.end !== 'loop') return null; i = 0; }
        return items[i++];
      }
      if (!bag.length) {
        if (rounds > 0 && opts.end !== 'loop') return null;
        bag = notFirst(shuffle(keys.slice()), lastKey);
        rounds++;
      }
      var key = bag.shift();
      lastKey = key;
      if (!recBags[key] || !recBags[key].length) recBags[key] = notFirst(shuffle(by[key].slice()), lastRec[key]);
      var it = recBags[key].shift();
      lastRec[key] = it;
      return it;
    }
    return { next: next, size: function () { return opts.order === 'random' ? keys.length : items.length; } };
  }

  var api = {
    KINDS: KINDS, newId: newId, uidOf: uidOf, stamp: stamp, okOp: okOp, apply: apply, run: run, check: check,
    split: split, flat: flat, tidy: tidy, sameState: sameState, valid: valid, playlist: playlist
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Plays = api;
})(this);
