/*
 * rules.js — ルールの処理（v2）。画面に依存しない純粋な関数だけ。
 *
 * 主な関数は「状態を受け取って、新しい状態と出来事のリストを返す」形。
 *   act(state, unitId, { to:[x,y], dir, shoot })  味方1人の手番（移動 → 向き → 撃つ／待機）
 *   endTurn(state)                                ターン終了処理（敵の行動を含む）
 * どちらも { ok, state, events, steps, error } を返す。
 *   steps = [{ state, events }] は「1つずつ見せる」ための途中の状態。
 * 受け取った state は書き換えない（中で複製してから処理する）。
 *
 * ブラウザでは グローバル変数 Rules、node では module.exports で読める。
 */
(function (root) {
  var B = (typeof module !== 'undefined' && module.exports)
    ? require('./balance.js')
    : root.BALANCE;

  // ---------------------------------------------------------------
  // 定義
  // ---------------------------------------------------------------
  var TILE_INFO = {
    empty:     { name: '空き',     label: '',   passable: true  },
    forest:    { name: '森',       label: '森', passable: true  },
    mountain:  { name: '山',       label: '山', passable: false },
    river:     { name: '川',       label: '川', passable: false },
    fire:      { name: '炎',       label: '炎', passable: true  },
    smallfire: { name: '小さな炎', label: '火', passable: true  },
    magma:     { name: 'マグマ',   label: 'マ', passable: false },
    mud:       { name: '泥沼',     label: '泥', passable: true  }
  };
  var TILES = Object.keys(TILE_INFO);

  var MAGIC_INFO = {
    grass: { name: '草', verb: '置く' },
    water: { name: '水', verb: '流れる' },
    earth: { name: '土', verb: '置く' },
    fire:  { name: '火', verb: '点ける' },
    wind:  { name: '風', verb: '吹き抜ける' }
  };
  var MAGICS = Object.keys(MAGIC_INFO);

  var DIRS = {
    up:    { dx: 0,  dy: -1, name: '上' },
    right: { dx: 1,  dy: 0,  name: '右' },
    down:  { dx: 0,  dy: 1,  name: '下' },
    left:  { dx: -1, dy: 0,  name: '左' }
  };
  var DIR_ORDER = ['up', 'right', 'down', 'left'];   // 同じ条件の候補が複数あるときの優先順

  // 燃え広がりを止めるマス
  var SPREAD_BLOCKERS = { mountain: true, river: true, magma: true };

  var ENEMY_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // ---------------------------------------------------------------
  // 小さな道具
  // ---------------------------------------------------------------
  function clone(s) { return JSON.parse(JSON.stringify(s)); }
  function inBounds(s, x, y) { return x >= 0 && y >= 0 && x < s.size && y < s.size; }
  function idx(s, x, y) { return y * s.size + x; }
  function getTile(s, x, y) { return s.tiles[idx(s, x, y)]; }
  function setTile(s, x, y, t) { s.tiles[idx(s, x, y)] = t; }
  function isPassable(tile) { return TILE_INFO[tile].passable; }
  function tileName(tile) { return TILE_INFO[tile].name; }
  function magicName(m) { return MAGIC_INFO[m].name; }
  function key(x, y) { return x + ',' + y; }
  function clampSize(n) {
    n = Math.round(Number(n) || B.boardSize);
    return Math.max(B.minBoardSize, Math.min(B.maxBoardSize, n));
  }

  function unitAt(s, x, y) {
    for (var i = 0; i < s.units.length; i++) {
      var u = s.units[i];
      if (u.x === x && u.y === y) return u;
    }
    return null;
  }
  function findUnit(s, id) {
    for (var i = 0; i < s.units.length; i++) if (s.units[i].id === id) return s.units[i];
    return null;
  }
  function alliesOf(s) { return s.units.filter(function (u) { return u.side === 'ally'; }); }
  function enemiesOf(s) { return s.units.filter(function (u) { return u.side === 'enemy'; }); }
  function neighbors(s, x, y) {
    var out = [];
    DIR_ORDER.forEach(function (d) {
      var nx = x + DIRS[d].dx, ny = y + DIRS[d].dy;
      if (inBounds(s, nx, ny)) out.push({ x: nx, y: ny, dir: d });
    });
    return out;
  }

  // ログに出す名前。味方は持っている魔法の文字（同じ魔法が2人いれば番号も付ける）
  function unitLabel(s, u) {
    if (u.side === 'enemy') return u.name;
    var same = alliesOf(s).filter(function (a) { return a.magic === u.magic; });
    var base = '味方「' + magicName(u.magic) + '」';
    if (same.length > 1) base += (same.indexOf(u) + 1);
    return base;
  }

  // ---------------------------------------------------------------
  // 形の回転
  //   相対座標 (rx, ry): 正面が +ry、術者から見て右が +rx
  // ---------------------------------------------------------------
  function rotate(facing, rx, ry) {
    var F = DIRS[facing];
    var Rx = -F.dy, Ry = F.dx;    // 術者から見て右
    return [rx * Rx + ry * F.dx, rx * Ry + ry * F.dy];
  }

  // 魔法の形のマス（盤の外は除く）。術者に近い順
  function shapeCells(s, magic, x, y, facing) {
    var out = [];
    if (B.shapes[magic]) {
      var list = B.shapes[magic].map(function (p, i) { return { rx: p[0], ry: p[1], i: i }; });
      list.sort(function (a, b) {
        var da = Math.abs(a.rx) + Math.abs(a.ry), db = Math.abs(b.rx) + Math.abs(b.ry);
        return da - db || a.i - b.i;
      });
      list.forEach(function (p) {
        var d = rotate(facing, p.rx, p.ry);
        var cx = x + d[0], cy = y + d[1];
        if (inBounds(s, cx, cy)) out.push([cx, cy]);
      });
    } else {
      var F = DIRS[facing];
      for (var i = 1; i <= B.lineLength; i++) {
        var lx = x + F.dx * i, ly = y + F.dy * i;
        if (!inBounds(s, lx, ly)) break;
        out.push([lx, ly]);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------
  // 状態を作る
  // ---------------------------------------------------------------
  function makeUnit(s, side, magic, x, y, facing) {
    s.seq = (s.seq || 0) + 1;
    var conf = side === 'ally' ? B.ally : B.enemy;
    var u = {
      id: (side === 'ally' ? 'P' : 'E') + s.seq, side: side, magic: magic,
      hp: conf.hp, maxHp: conf.hp, power: conf.power, move: conf.move,
      x: x, y: y, facing: facing || (side === 'ally' ? 'up' : 'down'),
      stuck: false, acted: false
    };
    if (side === 'enemy') {
      var used = enemiesOf(s).map(function (e) { return e.letter; });
      var letter = 'A';
      for (var i = 0; i < ENEMY_LETTERS.length; i++) {
        if (used.indexOf(ENEMY_LETTERS[i]) < 0) { letter = ENEMY_LETTERS[i]; break; }
      }
      u.letter = letter;
      u.name = '敵' + letter;
    }
    return u;
  }
  function addAlly(s, magic, x, y, facing) { var u = makeUnit(s, 'ally', magic, x, y, facing); s.units.push(u); return u; }
  function addEnemy(s, magic, x, y, facing) { var u = makeUnit(s, 'enemy', magic || B.enemy.defaultMagic, x, y, facing); s.units.push(u); return u; }

  function blankState(size, enemyActs) {
    size = clampSize(size);
    var s = { version: 2, size: size, tiles: [], units: [], enemyActs: enemyActs !== false, turn: 1, result: null, seq: 0 };
    for (var i = 0; i < size * size; i++) s.tiles.push('empty');
    return s;
  }

  // 味方を下の段、敵を上の段に並べる位置
  function rowSlots(size, count) {
    var cx = Math.floor(size / 2);
    var sets = { 1: [cx], 2: [cx - 1, cx + 1], 3: [cx - 2, cx, cx + 2] };
    var xs = sets[count] || [];
    if (!xs.length) for (var i = 0; i < count; i++) xs.push(i);
    return xs.map(function (x) { return Math.max(0, Math.min(size - 1, x)); });
  }

  function createState(opts) {
    opts = opts || {};
    var s = blankState(opts.size || B.boardSize, opts.enemyActs);
    if (!opts.blank) {
      var xs = rowSlots(s.size, B.ally.defaultMagics.length);
      B.ally.defaultMagics.forEach(function (m, i) { addAlly(s, m, xs[i], s.size - 1, 'up'); });
      addEnemy(s, B.enemy.defaultMagic, rowSlots(s.size, 1)[0], 0, 'down');
    }
    return s;
  }

  // ---------------------------------------------------------------
  // ダメージ（1発の中では1ユニットに1回だけ。一番大きいもの）
  // ---------------------------------------------------------------
  function newShot() { return { hits: {}, order: [], phrases: [], finishers: [], cells: [] }; }

  function addHit(ctx, u, amount, src) {
    var h = ctx.hits[u.id];
    if (!h) {
      ctx.hits[u.id] = { amount: amount, src: src };
      ctx.order.push(u.id);
    } else if (amount > h.amount) {
      h.amount = amount; h.src = src;
    }
  }

  function applyHits(s, ctx, ev) {
    ctx.order.forEach(function (id) {
      var u = findUnit(s, id);
      if (!u) return;
      var h = ctx.hits[id];
      u.hp -= h.amount;
      ev.push({
        type: 'damage', id: u.id, side: u.side, amount: h.amount, src: h.src, cells: [[u.x, u.y]],
        text: unitLabel(s, u) + 'に' + h.amount + 'ダメージ' + (h.src === 'finisher' ? '' : '（直撃）') + '（残りHP ' + Math.max(0, u.hp) + '）'
      });
    });
    removeDead(s, ev);
    checkResult(s, ev);
  }

  function removeDead(s, ev) {
    var dead = s.units.filter(function (u) { return u.hp <= 0; });
    dead.forEach(function (u) {
      ev.push({ type: 'death', side: u.side, id: u.id, text: unitLabel(s, u) + 'は倒れた', cells: [[u.x, u.y]] });
    });
    s.units = s.units.filter(function (u) { return u.hp > 0; });
    return dead;
  }

  function checkResult(s, ev) {
    if (s.result) return;
    var enemyDied = ev.some(function (e) { return e.type === 'death' && e.side === 'enemy'; });
    var allyDied = ev.some(function (e) { return e.type === 'death' && e.side === 'ally'; });
    if (allyDied && alliesOf(s).length === 0) {
      s.result = 'lose';
      ev.push({ type: 'result', result: 'lose', text: '味方が全員倒れた…（敗北）' });
    } else if (enemyDied && enemiesOf(s).length === 0) {
      s.result = 'win';
      ev.push({ type: 'result', result: 'win', text: '敵を全員倒した！（勝利）' });
    }
  }

  // 泥沼に入った: 次の移動が1回できない
  function enterMud(s, u, ev) {
    u.stuck = true;
    ev.push({ type: 'mud', id: u.id, cells: [[u.x, u.y]], text: unitLabel(s, u) + 'は泥沼にはまった（次の移動は1回休み）' });
  }

  // ---------------------------------------------------------------
  // 決め手
  // ---------------------------------------------------------------

  // 燃え広がり: 風が炎か小さな炎に当たる
  function doSpread(s, ox, oy, dir, ctx, ev) {
    var F = DIRS[dir];
    var path = [];
    var burned = {}, burnedList = [];

    function burnComponent(sx, sy) {
      var stack = [[sx, sy]];
      while (stack.length) {
        var c = stack.pop();
        var k = key(c[0], c[1]);
        if (burned[k] || getTile(s, c[0], c[1]) !== 'forest') continue;
        burned[k] = true;
        burnedList.push(c);
        neighbors(s, c[0], c[1]).forEach(function (n) { stack.push([n.x, n.y]); });
      }
    }

    for (var i = 1; i <= B.spread.maxLength; i++) {
      var x = ox + F.dx * i, y = oy + F.dy * i;
      if (!inBounds(s, x, y)) break;
      var t = getTile(s, x, y);
      if (SPREAD_BLOCKERS[t]) break;
      path.push([x, y]);
      if (t === 'forest') burnComponent(x, y);
    }

    // 地形: 通り道の空きは小さな炎、燃えた森は炎。起点の炎はそのまま
    var trail = 0;
    path.forEach(function (c) {
      if (getTile(s, c[0], c[1]) === 'empty') { setTile(s, c[0], c[1], 'smallfire'); trail++; }
    });
    burnedList.forEach(function (c) { setTile(s, c[0], c[1], 'fire'); });

    var cells = [[ox, oy]].concat(path);
    burnedList.forEach(function (c) {
      if (!cells.some(function (p) { return p[0] === c[0] && p[1] === c[1]; })) cells.push(c);
    });
    var amount = B.spread.baseDamage + burnedList.length * B.spread.perForest;
    cells.forEach(function (c) {
      var u = unitAt(s, c[0], c[1]);
      if (u) addHit(ctx, u, amount, 'finisher');
    });
    var fin = { name: '燃え広がり', cells: cells, damage: amount, forests: burnedList.length };
    ctx.finishers.push(fin);
    ev.push({
      type: 'finisher', name: '燃え広がり', cells: cells, damage: amount, forests: burnedList.length,
      text: '燃え広がり！ ' + DIRS[dir].name + 'へ' + path.length + 'マス走り、' +
        (burnedList.length ? '森' + burnedList.length + 'つが燃えた' : '燃えた森はなし') + '（威力' + amount + '）'
    });
    return fin;
  }

  // 水蒸気爆発: 流れる水がマグマに当たる
  function doSteam(s, cx, cy, ctx, ev) {
    var r = B.steam.radius;
    var cells = [];
    for (var y = cy - r; y <= cy + r; y++) {
      for (var x = cx - r; x <= cx + r; x++) {
        if (inBounds(s, x, y)) cells.push([x, y]);
      }
    }
    setTile(s, cx, cy, 'empty');
    cells.forEach(function (c) {
      var u = unitAt(s, c[0], c[1]);
      if (u) addHit(ctx, u, B.steam.damage, 'finisher');
    });
    var fin = { name: '水蒸気爆発', cells: cells, damage: B.steam.damage };
    ctx.finishers.push(fin);
    ev.push({ type: 'finisher', name: '水蒸気爆発', cells: cells, damage: B.steam.damage, text: '水蒸気爆発！（3×3・威力' + B.steam.damage + '）' });
    return fin;
  }

  // ---------------------------------------------------------------
  // 魔法を撃つ（術者の今の位置と向きから）
  // ---------------------------------------------------------------

  // 置く（草・土）・点ける（火）
  function placeOrIgnite(s, u, facing, ctx) {
    shapeCells(s, u.magic, u.x, u.y, facing).forEach(function (c) {
      var x = c[0], y = c[1];
      ctx.cells.push([x, y]);
      var o = unitAt(s, x, y);
      if (o) addHit(ctx, o, u.power, 'direct');
      var t = getTile(s, x, y);
      if (u.magic === 'grass') {
        if (!o && t === 'empty') { setTile(s, x, y, 'forest'); ctx.phrases.push('森ができた'); }
      } else if (u.magic === 'earth') {
        if (!o && t === 'empty') { setTile(s, x, y, 'mountain'); ctx.phrases.push('山ができた'); }
        else if (!o && t === 'river') { setTile(s, x, y, 'mud'); ctx.phrases.push('川が泥沼になった'); }
      } else if (u.magic === 'fire') {
        if (t === 'empty') { setTile(s, x, y, 'smallfire'); ctx.phrases.push('小さな炎がついた'); }
        else if (t === 'forest') { setTile(s, x, y, 'fire'); ctx.phrases.push('森が燃えた'); }
        else if (t === 'mountain') { setTile(s, x, y, 'magma'); ctx.phrases.push('山がマグマになった'); }
      }
    });
  }

  // 流れる（水）
  function flow(s, u, facing, ctx, ev) {
    var F = DIRS[facing];
    var made = 0;
    var stop = null;
    var magma = null;
    for (var i = 1; i <= B.lineLength; i++) {
      var x = u.x + F.dx * i, y = u.y + F.dy * i;
      if (!inBounds(s, x, y)) { stop = '盤の端まで流れた'; break; }
      ctx.cells.push([x, y]);
      var o = unitAt(s, x, y);
      var t = getTile(s, x, y);
      if (o) { addHit(ctx, o, u.power, 'direct'); stop = unitLabel(s, o) + 'に当たって止まった'; break; }
      if (t === 'empty') { setTile(s, x, y, 'river'); made++; continue; }
      if (t === 'river') continue;
      if (t === 'fire' || t === 'smallfire') { setTile(s, x, y, 'empty'); stop = tileName(t) + 'を消して止まった'; break; }
      if (t === 'magma') { magma = [x, y]; stop = 'マグマに当たった'; break; }
      stop = tileName(t) + 'で止まった';
      break;
    }
    if (made) ctx.phrases.push('川が' + made + 'マスできた');
    if (stop) ctx.phrases.push(stop);
    if (!made && !stop && !magma) ctx.phrases.push('川の上を流れた');
    if (magma) doSteam(s, magma[0], magma[1], ctx, ev);
  }

  // 吹き抜ける（風）＝ 運ぶ
  function blow(s, u, facing, ctx, ev) {
    var F = DIRS[facing];
    var path = [];
    var origin = null;
    for (var i = 1; i <= B.lineLength; i++) {
      var x = u.x + F.dx * i, y = u.y + F.dy * i;
      if (!inBounds(s, x, y)) break;
      var t = getTile(s, x, y);
      if (t === 'mountain' || t === 'magma') { ctx.phrases.push(tileName(t) + 'の陰で風が止まった'); break; }
      if (t === 'fire' || t === 'smallfire') { origin = [x, y]; ctx.cells.push([x, y]); break; }
      path.push([x, y]);
      ctx.cells.push([x, y]);
    }
    // 遠いマスから順に運ぶ
    for (var j = path.length - 1; j >= 0; j--) {
      var cx = path[j][0], cy = path[j][1];
      var nx = cx + F.dx, ny = cy + F.dy;
      var o = unitAt(s, cx, cy);
      if (o) {
        addHit(ctx, o, u.power, 'direct');
        var why = null;
        if (!inBounds(s, nx, ny)) why = '盤の端';
        else if (!isPassable(getTile(s, nx, ny))) why = tileName(getTile(s, nx, ny)) + 'があって通れない';
        else if (unitAt(s, nx, ny)) why = unitLabel(s, unitAt(s, nx, ny)) + 'がいる';
        if (why) {
          ev.push({ type: 'push', id: o.id, ok: false, text: unitLabel(s, o) + 'は押されなかった（' + why + '）' });
        } else {
          ev.push({ type: 'push', id: o.id, ok: true, from: [cx, cy], to: [nx, ny], text: unitLabel(s, o) + 'を' + F.name + 'へ1マス運んだ' });
          o.x = nx; o.y = ny;
          if (getTile(s, nx, ny) === 'mud') enterMud(s, o, ev);
        }
      } else if (getTile(s, cx, cy) === 'river') {
        if (inBounds(s, nx, ny) && getTile(s, nx, ny) === 'empty' && !unitAt(s, nx, ny)) {
          setTile(s, cx, cy, 'empty');
          setTile(s, nx, ny, 'river');
          ctx.phrases.push('川を' + F.name + 'へ1マス運んだ');
        }
      }
    }
    if (origin) {
      ctx.phrases.push(tileName(getTile(s, origin[0], origin[1])) + 'に風が当たった');
      doSpread(s, origin[0], origin[1], facing, ctx, ev);
    } else if (!path.length && !ctx.phrases.length) {
      ctx.phrases.push('風が通る場所がなかった');
    }
  }

  // 同じ言葉が続いたら「×2」にまとめる
  function summarize(phrases) {
    var out = [], counts = {};
    phrases.forEach(function (p) {
      if (counts[p]) counts[p]++;
      else { counts[p] = 1; out.push(p); }
    });
    return out.map(function (p) { return counts[p] > 1 ? p + '×' + counts[p] : p; }).join('、');
  }

  // u が今の位置から facing 向きに撃つ（state を書き換える）
  function shoot(s, u, facing, ev) {
    var ctx = newShot();
    var label = unitLabel(s, u);
    var castEv = { type: 'cast', id: u.id, side: u.side, magic: u.magic, dir: facing, from: [u.x, u.y], cells: [], text: '' };
    ev.push(castEv);
    if (u.magic === 'water') flow(s, u, facing, ctx, ev);
    else if (u.magic === 'wind') blow(s, u, facing, ctx, ev);
    else placeOrIgnite(s, u, facing, ctx);
    castEv.cells = ctx.cells;
    var any = ctx.phrases.length || ctx.order.length;
    castEv.text = label + 'が' + DIRS[facing].name + 'へ' + magicName(u.magic) + 'の魔法（' + MAGIC_INFO[u.magic].verb + '）→ ' +
      (ctx.phrases.length ? summarize(ctx.phrases) : (any ? '' : '何も起きなかった'));
    castEv.text = castEv.text.replace(/ → $/, '');
    applyHits(s, ctx, ev);
    return ctx;
  }

  // ---------------------------------------------------------------
  // 移動
  // ---------------------------------------------------------------

  // 動けるマス: dist { "x,y": 距離 }（今の位置 0 を含む）と、見つけた順 order
  // 通れるマス・ユニットがいないマスだけ。泥沼に入ったらそこで止まる。泥沼にはまっていたら今の位置だけ
  function reachInfo(s, u) {
    var dist = {}, order = [];
    dist[key(u.x, u.y)] = 0;
    order.push([u.x, u.y]);
    if (u.stuck) return { dist: dist, order: order };
    var queue = [[u.x, u.y]];
    while (queue.length) {
      var c = queue.shift();
      var cd = dist[key(c[0], c[1])];
      if (cd >= u.move) continue;
      if (cd > 0 && getTile(s, c[0], c[1]) === 'mud') continue;
      neighbors(s, c[0], c[1]).forEach(function (n) {
        var k = key(n.x, n.y);
        if (dist[k] !== undefined) return;
        if (!isPassable(getTile(s, n.x, n.y))) return;
        if (unitAt(s, n.x, n.y)) return;
        dist[k] = cd + 1;
        order.push([n.x, n.y]);
        queue.push([n.x, n.y]);
      });
    }
    return { dist: dist, order: order };
  }

  function reachableCells(s, unitId) {
    var u = findUnit(s, unitId);
    if (!u) return {};
    return reachInfo(s, u).dist;
  }

  function moveUnit(s, u, x, y, dist, ev) {
    var from = [u.x, u.y];
    u.x = x; u.y = y;
    ev.push({ type: 'move', id: u.id, side: u.side, from: from, to: [x, y], text: unitLabel(s, u) + 'が' + dist + 'マス移動した' });
    if (getTile(s, x, y) === 'mud') enterMud(s, u, ev);
  }

  // ---------------------------------------------------------------
  // 味方の手番
  // ---------------------------------------------------------------
  function fail(s, msg) { return { ok: false, state: s, events: [], steps: [], error: msg }; }

  // opts: { to: [x,y]（省略で今の位置）, dir: 向き（省略で今の向き）, shoot: false なら待機 }
  function act(s0, unitId, opts) {
    opts = opts || {};
    if (s0.result) return fail(s0, '勝負はもうついている');
    var u0 = findUnit(s0, unitId);
    if (!u0 || u0.side !== 'ally') return fail(s0, '味方を選んでいない');
    if (u0.acted) return fail(s0, 'この味方はもう行動した');
    var to = opts.to || [u0.x, u0.y];
    var dir = opts.dir || u0.facing;
    if (!DIRS[dir]) return fail(s0, '向きが正しくない');
    var dist = reachInfo(s0, u0).dist[key(to[0], to[1])];
    if (dist === undefined) return fail(s0, u0.stuck ? '泥沼にはまっていて動けない' : 'そこへは移動できない');

    var s = clone(s0);
    var u = findUnit(s, unitId);
    var ev = [], steps = [], mark = 0;
    function step() {
      if (ev.length > mark) { steps.push({ state: clone(s), events: ev.slice(mark) }); mark = ev.length; }
    }
    if (u.stuck) {
      u.stuck = false;
      ev.push({ type: 'mudSkip', id: u.id, text: unitLabel(s, u) + 'は泥沼にはまっていて動けない（1回休み）' });
    }
    u.acted = true;
    if (dist > 0) { moveUnit(s, u, to[0], to[1], dist, ev); step(); }
    u.facing = dir;
    if (opts.shoot === false) {
      ev.push({ type: 'wait', id: u.id, text: unitLabel(s, u) + 'は' + DIRS[dir].name + 'を向いて待機した' });
    } else {
      shoot(s, u, dir, ev);
    }
    step();
    return { ok: true, state: s, events: ev, steps: steps };
  }

  function allAlliesActed(s) {
    var al = alliesOf(s);
    return al.length > 0 && al.every(function (a) { return a.acted; });
  }

  // ---------------------------------------------------------------
  // 敵の行動
  // ---------------------------------------------------------------

  // target のマスからの道のり（通れるマス・ユニットのいないマス。mover 自身のマスは通れる）
  function distanceField(s, target, mover) {
    var field = {};
    field[key(target.x, target.y)] = 0;
    var queue = [[target.x, target.y]];
    while (queue.length) {
      var c = queue.shift();
      var cd = field[key(c[0], c[1])];
      neighbors(s, c[0], c[1]).forEach(function (n) {
        var k = key(n.x, n.y);
        if (field[k] !== undefined) return;
        if (!isPassable(getTile(s, n.x, n.y))) return;
        var occ = unitAt(s, n.x, n.y);
        if (occ && occ !== mover) return;
        field[k] = cd + 1;
        queue.push([n.x, n.y]);
      });
    }
    return field;
  }

  // from から a の方を向く（縦横で差の大きい方。同じなら縦）
  function faceToward(fx, fy, a) {
    var dx = a.x - fx, dy = a.y - fy;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'down' : 'up';
  }

  // u を (x,y) に置いて dir に撃ったら、どの味方に何ダメージ入るか（state は変えない）
  function trialShot(s, u, x, y, dir) {
    var sim = clone(s);
    var su = findUnit(sim, u.id);
    su.x = x; su.y = y; su.facing = dir;
    var ctx = newShot();
    var ev = [];
    if (su.magic === 'water') flow(sim, su, dir, ctx, ev);
    else if (su.magic === 'wind') blow(sim, su, dir, ctx, ev);
    else placeOrIgnite(sim, su, dir, ctx);
    var allyHits = 0;
    ctx.order.forEach(function (id) {
      var t = findUnit(sim, id);
      if (t && t.side === 'ally' && ctx.hits[id].amount > 0) allyHits++;
    });
    return { allyHits: allyHits, ctx: ctx };
  }

  // 敵がどう動いてどの向きに撃つか
  function planEnemy(s, e) {
    var allies = alliesOf(s);
    if (!allies.length) return null;
    var info = reachInfo(s, e);

    // 1-2. 味方にダメージが入る組み合わせ（多い → 移動が短い → 見つけた順・上右下左）
    var best = null;
    info.order.forEach(function (pos) {
      var d = info.dist[key(pos[0], pos[1])];
      DIR_ORDER.forEach(function (dir) {
        var r = trialShot(s, e, pos[0], pos[1], dir);
        if (r.allyHits <= 0) return;
        if (!best || r.allyHits > best.hits || (r.allyHits === best.hits && d < best.dist)) {
          best = { to: pos, dir: dir, hits: r.allyHits, dist: d, kind: 'attack' };
        }
      });
    });
    if (best) return best;

    // 3. 一番近い味方（道のり）へ最大2マス進んで、その方を向いて撃つ
    var target = null;
    allies.forEach(function (a) {
      var field = distanceField(s, a, e);
      var d = field[key(e.x, e.y)];
      if (d === undefined) return;
      if (!target || d < target.d) target = { a: a, field: field, d: d };
    });
    if (target) {
      var cx = e.x, cy = e.y, moved = 0;
      if (!e.stuck) {
        for (var stepNo = 0; stepNo < e.move; stepNo++) {
          var cd = target.field[key(cx, cy)];
          if (cd <= 1) break;
          var next = null;
          for (var k = 0; k < DIR_ORDER.length && !next; k++) {
            var D = DIRS[DIR_ORDER[k]];
            var nx = cx + D.dx, ny = cy + D.dy;
            if (!inBounds(s, nx, ny)) continue;
            if (target.field[key(nx, ny)] !== cd - 1) continue;
            if (!isPassable(getTile(s, nx, ny)) || unitAt(s, nx, ny)) continue;
            next = [nx, ny];
          }
          if (!next) break;
          cx = next[0]; cy = next[1]; moved++;
          if (getTile(s, cx, cy) === 'mud') break;
        }
      }
      return { to: [cx, cy], dir: faceToward(cx, cy, target.a), dist: moved, kind: 'approach', target: target.a.id };
    }

    // 4. どの味方にも道がない → その場で一番近い味方の方を向いて撃つ
    var near = null;
    allies.forEach(function (a) {
      var d = Math.abs(a.x - e.x) + Math.abs(a.y - e.y);
      if (!near || d < near.d) near = { a: a, d: d };
    });
    return { to: [e.x, e.y], dir: faceToward(e.x, e.y, near.a), dist: 0, kind: 'noPath', target: near.a.id };
  }

  function enemyAct(s, e, ev, step) {
    var plan = planEnemy(s, e);
    if (!plan) return;
    if (e.stuck) {
      e.stuck = false;
      ev.push({ type: 'mudSkip', id: e.id, text: unitLabel(s, e) + 'は泥沼にはまっていて動けない（1回休み）' });
    }
    if (plan.kind === 'noPath') ev.push({ type: 'info', id: e.id, text: unitLabel(s, e) + 'は味方への道がないので、その場から撃つ' });
    if (plan.dist > 0) { moveUnit(s, e, plan.to[0], plan.to[1], plan.dist, ev); step(); }
    e.facing = plan.dir;
    shoot(s, e, plan.dir, ev);
    step();
  }

  // ---------------------------------------------------------------
  // ターン終了処理
  // ---------------------------------------------------------------
  function fireSpreadCells(s) {
    var out = [];
    for (var y = 0; y < s.size; y++) {
      for (var x = 0; x < s.size; x++) {
        if (getTile(s, x, y) !== 'forest') continue;
        if (neighbors(s, x, y).some(function (n) { return getTile(s, n.x, n.y) === 'fire'; })) out.push([x, y]);
      }
    }
    return out;
  }

  function endTurn(s0) {
    if (s0.result) return fail(s0, '勝負はもうついている');
    var s = clone(s0);
    var ev = [], steps = [], mark = 0;
    function step() {
      if (ev.length > mark) { steps.push({ state: clone(s), events: ev.slice(mark) }); mark = ev.length; }
    }
    ev.push({ type: 'turnEnd', text: '── ターン' + s.turn + ' 終了 ──' });
    // このターン行動しなかった味方は、泥沼の1回休みを使ったことにする
    alliesOf(s).forEach(function (a) { if (!a.acted && a.stuck) a.stuck = false; });
    step();

    // 1. 炎が隣の森へ燃え移る（処理開始時の盤面で同時に判定）
    var caught = fireSpreadCells(s);
    caught.forEach(function (c) { setTile(s, c[0], c[1], 'fire'); });
    if (caught.length) ev.push({ type: 'fireSpread', cells: caught, text: '炎が隣の森へ燃え移った（' + caught.length + 'マス）' });
    step();

    // 2. 炎の上にいる者にダメージ
    var burnEv = [];
    s.units.forEach(function (u) {
      if (getTile(s, u.x, u.y) === 'fire') {
        u.hp -= B.fireTileDamage;
        burnEv.push({ type: 'damage', id: u.id, side: u.side, amount: B.fireTileDamage, src: 'burn', cells: [[u.x, u.y]], text: '炎の上の' + unitLabel(s, u) + 'に' + B.fireTileDamage + 'ダメージ（残りHP ' + Math.max(0, u.hp) + '）' });
      }
    });
    burnEv.forEach(function (e) { ev.push(e); });
    removeDead(s, ev);
    checkResult(s, ev);
    step();

    // 3. 小さな炎が消える
    var gone = [];
    for (var y = 0; y < s.size; y++) {
      for (var x = 0; x < s.size; x++) {
        if (getTile(s, x, y) === 'smallfire') { setTile(s, x, y, 'empty'); gone.push([x, y]); }
      }
    }
    if (gone.length) ev.push({ type: 'smallfireOut', cells: gone, text: '小さな炎が消えた（' + gone.length + 'マス）' });
    step();

    // 4. 敵の行動
    if (s.enemyActs && !s.result) {
      var ids = enemiesOf(s).map(function (e) { return e.id; });
      for (var i = 0; i < ids.length && !s.result; i++) {
        var e = findUnit(s, ids[i]);
        if (e) enemyAct(s, e, ev, step);
      }
    }

    // 5. ターンを進める
    if (!s.result) {
      s.turn += 1;
      alliesOf(s).forEach(function (a) { a.acted = false; });
      ev.push({ type: 'turnStart', text: '── ターン' + s.turn + ' 開始 ──' });
    }
    step();
    return { ok: true, state: s, events: ev, steps: steps };
  }

  // ---------------------------------------------------------------
  // 予測・導き・予告
  // ---------------------------------------------------------------

  // 味方が to へ動いて dir に撃ったら何が起きるか
  function previewAct(s0, unitId, to, dir) {
    var u0 = findUnit(s0, unitId);
    if (!u0 || !DIRS[dir]) return null;
    var s = clone(s0);
    var u = findUnit(s, unitId);
    var ev = [];
    if (to && (to[0] !== u.x || to[1] !== u.y)) { u.x = to[0]; u.y = to[1]; }
    u.facing = dir;
    var startUnits = clone(s.units);
    var startTiles = s.tiles.slice();
    var ctx = shoot(s, u, dir, ev);
    var tileChanges = [];
    for (var i = 0; i < s.tiles.length; i++) {
      if (s.tiles[i] !== startTiles[i]) tileChanges.push({ x: i % s.size, y: Math.floor(i / s.size), from: startTiles[i], to: s.tiles[i] });
    }
    var damages = [], moves = [];
    startUnits.forEach(function (b) {
      var a = findUnit(s, b.id);
      var h = ctx.hits[b.id];
      if (h) damages.push({ id: b.id, side: b.side, label: unitLabel({ units: startUnits }, b), x: a ? a.x : b.x, y: a ? a.y : b.y, amount: h.amount, src: h.src, dies: !a });
      if (a && (a.x !== b.x || a.y !== b.y)) moves.push({ id: b.id, from: [b.x, b.y], to: [a.x, a.y] });
    });
    return {
      state: s, events: ev, cells: ctx.cells, tileChanges: tileChanges, damages: damages, moves: moves,
      finishers: ctx.finishers, from: [u0.x, u0.y], to: to || [u0.x, u0.y], dir: dir
    };
  }

  // 立ち位置の導き: 動ける各マスについて、どれかの向きで 決め手 → 'finisher'、自然のマスが変わる → 'change'
  //   空きマスはどの魔法でも何かができるので、「空き → 何か」だけの変化は数えない
  function guideMap(s, unitId) {
    var u = findUnit(s, unitId);
    var map = {};
    if (!u || u.acted) return map;
    var info = reachInfo(s, u);
    info.order.forEach(function (pos) {
      var best = null;
      DIR_ORDER.forEach(function (dir) {
        var p = previewAct(s, unitId, pos, dir);
        if (p.finishers.length) best = 'finisher';
        else if (!best && p.tileChanges.some(function (c) { return c.from !== 'empty'; })) best = 'change';
      });
      if (best) map[key(pos[0], pos[1])] = best;
    });
    return map;
  }

  // 敵の予告とターン終了の予告（今の盤面で、いまターン終了したら何が起きるか）
  function forecast(s) {
    var out = { enemies: [], fireSpread: [], burn: [], enemyDamage: [] };
    if (s.result) return out;
    out.fireSpread = fireSpreadCells(s);
    s.units.forEach(function (u) {
      if (getTile(s, u.x, u.y) === 'fire') out.burn.push({ id: u.id, x: u.x, y: u.y });
    });
    // 1〜3 で炎の燃え移りが森を炎にするので、炎の上のダメージもそれを含めて数える
    out.fireSpread.forEach(function (c) {
      var u = unitAt(s, c[0], c[1]);
      if (u) out.burn.push({ id: u.id, x: u.x, y: u.y });
    });
    if (!s.enemyActs) return out;
    var r = endTurn(s);
    var plans = {};
    r.events.forEach(function (e) {
      if (e.type !== 'move' && e.type !== 'cast') return;
      if (!e.id || !findUnit(s, e.id) || findUnit(s, e.id).side !== 'enemy') return;
      var p = plans[e.id] || (plans[e.id] = { id: e.id, from: null, to: null, dir: null, cells: [] });
      var cur = findUnit(s, e.id);
      if (e.type === 'move') { p.from = e.from; p.to = e.to; }
      if (e.type === 'cast') {
        p.dir = e.dir; p.cells = e.cells; p.shootFrom = e.from;
        if (!p.from) { p.from = [cur.x, cur.y]; p.to = [cur.x, cur.y]; }
      }
    });
    Object.keys(plans).forEach(function (id) { out.enemies.push(plans[id]); });
    // 敵の行動でダメージを受ける味方
    var inEnemyPhase = false;
    r.events.forEach(function (e) {
      if (e.type === 'cast' && e.side === 'enemy') inEnemyPhase = true;
      if (inEnemyPhase && e.type === 'damage') out.enemyDamage.push({ id: e.id, amount: e.amount, side: e.side });
    });
    return out;
  }

  // ---------------------------------------------------------------
  // エディット（どれも新しい状態を返す）
  // ---------------------------------------------------------------
  function ok(s) { return { ok: true, state: s, events: [], steps: [] }; }
  function canStand(s, x, y) { return isPassable(getTile(s, x, y)); }

  function editPaint(s0, x, y, tile) {
    if (!inBounds(s0, x, y) || !TILE_INFO[tile]) return fail(s0, '塗れない');
    if (unitAt(s0, x, y) && !isPassable(tile)) return fail(s0, 'ユニットがいるマスを' + tileName(tile) + 'にはできない');
    if (getTile(s0, x, y) === tile) return fail(s0, '同じ地形');
    var s = clone(s0);
    setTile(s, x, y, tile);
    return ok(s);
  }

  function editPlaceUnit(s0, side, x, y, magic) {
    if (!inBounds(s0, x, y)) return fail(s0, '盤の外');
    if (unitAt(s0, x, y)) return fail(s0, 'もうユニットがいる');
    if (!canStand(s0, x, y)) return fail(s0, '通れないマスには置けない');
    var s = clone(s0);
    if (side === 'ally') {
      if (alliesOf(s).length >= B.ally.count) return fail(s0, '味方は' + B.ally.count + '人まで');
      var used = alliesOf(s).map(function (a) { return a.magic; });
      var m = magic || B.ally.defaultMagics.filter(function (d) { return used.indexOf(d) < 0; })[0] || 'fire';
      return { ok: true, state: s, events: [], steps: [], unit: addAlly(s, m, x, y, 'up') };
    }
    if (enemiesOf(s).length >= B.enemy.maxCount) return fail(s0, '敵は' + B.enemy.maxCount + '体まで');
    return { ok: true, state: s, events: [], steps: [], unit: addEnemy(s, magic || B.enemy.defaultMagic, x, y, 'down') };
  }

  function editRemoveUnit(s0, x, y) {
    if (!inBounds(s0, x, y) || !unitAt(s0, x, y)) return fail(s0, 'ユニットがいない');
    var s = clone(s0);
    s.units = s.units.filter(function (u) { return !(u.x === x && u.y === y); });
    return ok(s);
  }

  function editMoveUnit(s0, unitId, x, y) {
    if (!findUnit(s0, unitId)) return fail(s0, 'ユニットがいない');
    if (!inBounds(s0, x, y)) return fail(s0, '盤の外');
    var occ = unitAt(s0, x, y);
    if (occ && occ.id !== unitId) return fail(s0, 'もうユニットがいる');
    if (!canStand(s0, x, y)) return fail(s0, '通れないマスには置けない');
    var s = clone(s0);
    var u = findUnit(s, unitId);
    u.x = x; u.y = y;
    return ok(s);
  }

  function editSetMagic(s0, unitId, magic) {
    if (!MAGIC_INFO[magic]) return fail(s0, '魔法がない');
    if (!findUnit(s0, unitId)) return fail(s0, 'ユニットがいない');
    var s = clone(s0);
    findUnit(s, unitId).magic = magic;
    return ok(s);
  }

  function editSetFacing(s0, unitId, dir) {
    if (!DIRS[dir]) return fail(s0, '向きがない');
    if (!findUnit(s0, unitId)) return fail(s0, 'ユニットがいない');
    var s = clone(s0);
    findUnit(s, unitId).facing = dir;
    return ok(s);
  }

  function editSetEnemyActs(s0, acts) {
    var s = clone(s0);
    s.enemyActs = !!acts;
    return ok(s);
  }

  // 盤面サイズを変える。重なる部分の地形は残し、味方を下の段・敵を上の段に並べ直す
  function editResize(s0, size) {
    size = clampSize(size);
    var s = clone(s0);
    var tiles = [];
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) tiles.push(x < s0.size && y < s0.size ? getTile(s0, x, y) : 'empty');
    }
    s.size = size;
    s.tiles = tiles;
    var al = alliesOf(s), en = enemiesOf(s);
    var ax = rowSlots(size, al.length), ex = rowSlots(size, en.length);
    al.forEach(function (a, i) { a.x = ax[i]; a.y = size - 1; a.facing = 'up'; });
    en.forEach(function (e, i) { e.x = ex[i]; e.y = 0; e.facing = 'down'; });
    s.units.forEach(function (u) { if (!isPassable(getTile(s, u.x, u.y))) setTile(s, u.x, u.y, 'empty'); });
    return ok(s);
  }

  // 遊び始めの状態にそろえる（ターン1・HP満タン・行動前）
  function normalizeForPlay(s0) {
    var s = clone(s0);
    s.turn = 1;
    s.result = null;
    s.units.forEach(function (u) {
      var conf = u.side === 'ally' ? B.ally : B.enemy;
      u.maxHp = conf.hp; u.hp = conf.hp; u.power = conf.power; u.move = conf.move;
      u.stuck = false; u.acted = false;
    });
    return s;
  }

  // ---------------------------------------------------------------
  // 保存（JSON）
  // ---------------------------------------------------------------
  function exportLayout(s) {
    return JSON.stringify({
      version: 2, size: s.size, tiles: s.tiles, enemyActs: s.enemyActs,
      units: s.units.map(function (u) { return { side: u.side, magic: u.magic, x: u.x, y: u.y, facing: u.facing }; })
    });
  }

  function importLayout(json) {
    var d;
    try { d = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { return { ok: false, error: 'JSON として読めない' }; }
    if (!d || typeof d !== 'object') return { ok: false, error: '中身が空' };
    var size = Number(d.size);
    if (!(size >= B.minBoardSize && size <= B.maxBoardSize)) return { ok: false, error: '盤面サイズは ' + B.minBoardSize + '〜' + B.maxBoardSize };
    if (!Array.isArray(d.tiles) || d.tiles.length !== size * size) return { ok: false, error: '地形の数が合わない' };
    if (d.tiles.some(function (t) { return !TILE_INFO[t]; })) return { ok: false, error: '知らない地形がある' };
    var s = blankState(size, d.enemyActs !== false);
    s.tiles = d.tiles.slice();
    var units = Array.isArray(d.units) ? d.units : [];
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (!u || (u.side !== 'ally' && u.side !== 'enemy')) return { ok: false, error: 'ユニットの陣営が正しくない' };
      if (!MAGIC_INFO[u.magic]) return { ok: false, error: '知らない魔法がある' };
      if (!inBounds(s, u.x, u.y) || unitAt(s, u.x, u.y) || !isPassable(getTile(s, u.x, u.y))) return { ok: false, error: 'ユニットの位置が正しくない' };
      if (u.side === 'ally') addAlly(s, u.magic, u.x, u.y, DIRS[u.facing] ? u.facing : 'up');
      else addEnemy(s, u.magic, u.x, u.y, DIRS[u.facing] ? u.facing : 'down');
    }
    return { ok: true, state: s };
  }

  // ---------------------------------------------------------------
  // 初期シナリオ
  //   . 空き  F 森  M 山  R 川  X 炎  s 小さな炎  G マグマ  D 泥沼
  // ---------------------------------------------------------------
  var CH = { '.': 'empty', F: 'forest', M: 'mountain', R: 'river', X: 'fire', s: 'smallfire', G: 'magma', D: 'mud' };
  var PRESETS = [
    {
      id: 'spread', name: '燃え広がり',
      desc: '味方 草・火・風、敵1体（火）。森を並べて敵ごと燃やす練習。',
      rows: ['......', '.....M', '......', '......', '......', '......'],
      allies: [['grass', 1, 5], ['fire', 3, 5], ['wind', 4, 5]],
      enemies: [['fire', 2, 0]]
    },
    {
      id: 'steam', name: '水蒸気爆発',
      desc: '味方 土・火・水、敵1体（水）。山をマグマにして、水を流して当てる。',
      rows: ['......', '......', '......', '..M.M.', '......', '......'],
      allies: [['earth', 1, 5], ['fire', 2, 5], ['water', 4, 5]],
      enemies: [['water', 3, 0]]
    },
    {
      id: 'fireEnemy', name: '火の敵',
      desc: '味方 火・水・風、敵2体（火）。盤面に森が少しある。敵の火を利用するか消すか。',
      rows: ['......', '......', '.F..F.', '.FF.F.', '......', '......'],
      allies: [['fire', 0, 5], ['water', 2, 5], ['wind', 3, 5]],
      enemies: [['fire', 1, 0], ['fire', 4, 0]]
    }
  ];

  function loadPreset(id) {
    var p = PRESETS.filter(function (x) { return x.id === id; })[0];
    if (!p) return null;
    var s = blankState(p.rows.length, true);
    p.rows.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) setTile(s, x, y, CH[row[x]]);
    });
    p.allies.forEach(function (a) { addAlly(s, a[0], a[1], a[2], 'up'); });
    p.enemies.forEach(function (e) { addEnemy(s, e[0], e[1], e[2], 'down'); });
    return s;
  }

  // ---------------------------------------------------------------
  var api = {
    BALANCE: B,
    TILE_INFO: TILE_INFO, TILES: TILES, MAGIC_INFO: MAGIC_INFO, MAGICS: MAGICS,
    DIRS: DIRS, DIR_ORDER: DIR_ORDER, PRESETS: PRESETS,
    clone: clone, inBounds: inBounds, getTile: getTile, setTile: setTile, isPassable: isPassable,
    unitAt: unitAt, findUnit: findUnit, alliesOf: alliesOf, enemiesOf: enemiesOf,
    unitLabel: unitLabel, tileName: tileName, magicName: magicName,
    rotate: rotate, shapeCells: shapeCells,
    createState: createState, addAlly: addAlly, addEnemy: addEnemy,
    reachableCells: reachableCells, act: act, allAlliesActed: allAlliesActed, endTurn: endTurn,
    planEnemy: planEnemy, previewAct: previewAct, guideMap: guideMap, forecast: forecast,
    editPaint: editPaint, editPlaceUnit: editPlaceUnit, editRemoveUnit: editRemoveUnit,
    editMoveUnit: editMoveUnit, editSetMagic: editSetMagic, editSetFacing: editSetFacing,
    editSetEnemyActs: editSetEnemyActs, editResize: editResize, normalizeForPlay: normalizeForPlay,
    exportLayout: exportLayout, importLayout: importLayout, loadPreset: loadPreset
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Rules = api;
  }
})(this);
