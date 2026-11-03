/*
 * rules.js — ルールの処理（画面に依存しない純粋な関数だけ）
 *
 * 公開する主な関数は「状態を受け取って、新しい状態と出来事のリストを返す」形。
 *   castMagic(state, unitId, x, y, dir) -> { ok, state, events, error }
 *   moveAlly(state, unitId, x, y)       -> { ok, state, events, error }
 *   endTurn(state)                      -> { ok, state, events, error }
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
    mud:       { name: '泥沼',     label: '泥', passable: true  },
    whirl:     { name: '渦巻き',   label: '渦', passable: false }
  };
  var TILES = Object.keys(TILE_INFO);

  var MAGIC_INFO = {
    grass: { name: '草' },
    water: { name: '水' },
    earth: { name: '土' },
    fire:  { name: '火' },
    wind:  { name: '風' }
  };
  var MAGICS = Object.keys(MAGIC_INFO);

  var DIRS = {
    up:    { dx: 0,  dy: -1, name: '上' },
    right: { dx: 1,  dy: 0,  name: '右' },
    down:  { dx: 0,  dy: 1,  name: '下' },
    left:  { dx: -1, dy: 0,  name: '左' }
  };
  // 同じ条件の候補が複数あるときの優先順（上・右・下・左）
  var DIR_ORDER = ['up', 'right', 'down', 'left'];

  // 燃え広がりを止めるマス
  var SPREAD_BLOCKERS = { mountain: true, river: true, magma: true, whirl: true };

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
  function isInWhirl(s, u) { return getTile(s, u.x, u.y) === 'whirl'; }
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
  // 状態を作る
  // ---------------------------------------------------------------
  function makeAlly(s, magic, x, y) {
    s.seq = (s.seq || 0) + 1;
    return {
      id: 'P' + s.seq, side: 'ally', magic: magic,
      hp: B.ally.hp, maxHp: B.ally.hp, x: x, y: y,
      stuck: 0, movesLeft: B.ally.moveRange, cast: false
    };
  }
  function makeEnemy(s, x, y) {
    s.seq = (s.seq || 0) + 1;
    var used = enemiesOf(s).map(function (e) { return e.letter; });
    var letter = 'A';
    for (var i = 0; i < ENEMY_LETTERS.length; i++) {
      if (used.indexOf(ENEMY_LETTERS[i]) < 0) { letter = ENEMY_LETTERS[i]; break; }
    }
    return {
      id: 'E' + s.seq, side: 'enemy', name: '敵' + letter, letter: letter,
      hp: B.enemy.hp, maxHp: B.enemy.hp, x: x, y: y, stuck: 0
    };
  }

  // 新しい状態。opts.blank なら地形だけ（ユニットなし）
  function createState(opts) {
    opts = opts || {};
    var size = clampSize(opts.size || B.boardSize);
    var s = {
      size: size, tiles: [], units: [],
      enemyMoves: opts.enemyMoves !== false,
      turn: 1, result: null, seq: 0
    };
    for (var i = 0; i < size * size; i++) s.tiles.push('empty');
    if (!opts.blank) {
      // 初期配置: 味方3人は下の段、敵1体は上の段
      var cx = Math.floor(size / 2);
      var xs = [cx - 2, cx, cx + 2];
      B.ally.defaultMagics.forEach(function (m, i) {
        s.units.push(makeAlly(s, m, xs[i], size - 1));
      });
      s.units.push(makeEnemy(s, cx, 0));
    }
    return s;
  }

  // テストやエディットで使う: 状態に直接ユニットを足す（state を書き換える）
  function addAlly(s, magic, x, y) { var u = makeAlly(s, magic, x, y); s.units.push(u); return u; }
  function addEnemy(s, x, y) { var u = makeEnemy(s, x, y); s.units.push(u); return u; }

  // ---------------------------------------------------------------
  // ダメージ・倒れる・勝敗
  // ---------------------------------------------------------------
  function damage(u, amount) {
    if (amount <= 0) return 0;
    u.hp -= amount;
    return amount;
  }

  // [{u, amount}] → 「敵Aに12ダメージ、味方「火」に12ダメージ」
  function hitsText(s, hits) {
    if (!hits.length) return '巻き込まれた者はいない';
    return hits.map(function (h) { return unitLabel(s, h.u) + 'に' + h.amount + 'ダメージ'; }).join('、');
  }

  // セル一覧にいるユニット全員に1回ずつダメージ
  function damageCells(s, cells, amount) {
    var hits = [];
    var seen = {};
    cells.forEach(function (c) {
      var u = unitAt(s, c[0], c[1]);
      if (u && u.hp > 0 && !seen[u.id]) {
        seen[u.id] = true;
        hits.push({ u: u, amount: damage(u, amount) });
      }
    });
    return hits;
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

  // ---------------------------------------------------------------
  // 泥沼に入ったとき
  //   「次の自分の移動が1回できない」
  //   - 味方が自分のターン中に入り、まだ移動が残っている → 残りの移動がなくなる（これで1回休み）
  //   - それ以外 → stuck=1。次の自分の移動の機会（味方は次のターン、敵は次の敵の行動）を1回休む
  // ---------------------------------------------------------------
  function enterMud(s, u, ev) {
    if (u.side === 'ally' && u.movesLeft > 0) {
      u.movesLeft = 0;
      ev.push({ type: 'mud', id: u.id, text: unitLabel(s, u) + 'は泥沼にはまった（このターンはもう動けない）', cells: [[u.x, u.y]] });
    } else {
      u.stuck = 1;
      ev.push({ type: 'mud', id: u.id, text: unitLabel(s, u) + 'は泥沼にはまった（次の移動は1回休み）', cells: [[u.x, u.y]] });
    }
  }

  function placeUnit(s, u, x, y, ev) {
    u.x = x; u.y = y;
    if (getTile(s, x, y) === 'mud') enterMud(s, u, ev);
  }

  // ---------------------------------------------------------------
  // 決め手
  // ---------------------------------------------------------------

  // 燃え広がり: 炎か小さな炎に風
  function doSpread(s, ox, oy, dir, ev) {
    var d = DIRS[dir];
    var path = [[ox, oy]];
    var burned = {};      // "x,y" -> true
    var burnedList = [];

    function burnComponent(sx, sy) {
      var stack = [[sx, sy]];
      while (stack.length) {
        var c = stack.pop();
        var key = c[0] + ',' + c[1];
        if (burned[key]) continue;
        if (getTile(s, c[0], c[1]) !== 'forest') continue;
        burned[key] = true;
        burnedList.push(c);
        neighbors(s, c[0], c[1]).forEach(function (n) { stack.push([n.x, n.y]); });
      }
    }

    for (var i = 1; i <= B.spread.maxLength; i++) {
      var x = ox + d.dx * i, y = oy + d.dy * i;
      if (!inBounds(s, x, y)) break;
      var t = getTile(s, x, y);
      if (SPREAD_BLOCKERS[t]) break;
      path.push([x, y]);
      if (t === 'forest') burnComponent(x, y);
    }

    // 地形を変える: 起点は空きに戻る、燃えた森は炎になる
    setTile(s, ox, oy, 'empty');
    burnedList.forEach(function (c) { setTile(s, c[0], c[1], 'fire'); });

    // 範囲 = 起点 + 風下の通り道 + 燃えた森
    var cells = path.slice();
    burnedList.forEach(function (c) {
      var dup = cells.some(function (p) { return p[0] === c[0] && p[1] === c[1]; });
      if (!dup) cells.push(c);
    });

    var amount = B.spread.baseDamage + burnedList.length * B.spread.perForest;
    var hits = damageCells(s, cells, amount);
    var forestText = burnedList.length ? '森' + burnedList.length + 'つが燃えた。' : '燃えた森はなし。';
    var fin = { name: '燃え広がり', cells: cells, damage: amount, forests: burnedList.length, hits: hits.length };
    ev.push({
      type: 'finisher', name: '燃え広がり', cells: cells, damage: amount, forests: burnedList.length,
      text: '燃え広がり！ ' + forestText + hitsText(s, hits)
    });
    return fin;
  }

  // 水蒸気爆発: マグマに水
  function doSteam(s, cx, cy, ev) {
    var r = B.steam.radius;
    var cells = [];
    for (var y = cy - r; y <= cy + r; y++) {
      for (var x = cx - r; x <= cx + r; x++) {
        if (inBounds(s, x, y)) cells.push([x, y]);
      }
    }
    setTile(s, cx, cy, 'empty');
    var hits = damageCells(s, cells, B.steam.damage);
    ev.push({
      type: 'finisher', name: '水蒸気爆発', cells: cells, damage: B.steam.damage,
      text: '水蒸気爆発！ ' + hitsText(s, hits)
    });
    return { name: '水蒸気爆発', cells: cells, damage: B.steam.damage };
  }

  // センタクキ: 渦巻きに火
  function doSentakuki(s, cx, cy, ev) {
    var cells = [[cx, cy]];
    var hits = [];
    var inner = unitAt(s, cx, cy);
    if (inner && inner.hp > 0) hits.push({ u: inner, amount: damage(inner, B.sentakuki.inner) });
    neighbors(s, cx, cy).forEach(function (n) {
      cells.push([n.x, n.y]);
      var u = unitAt(s, n.x, n.y);
      if (u && u.hp > 0) hits.push({ u: u, amount: damage(u, B.sentakuki.adjacent) });
    });
    setTile(s, cx, cy, 'empty');
    var text = 'センタクキ！ ' + hitsText(s, hits);
    if (inner) text += '。' + unitLabel(s, inner) + 'は渦から解放された';
    ev.push({ type: 'finisher', name: 'センタクキ', cells: cells, damage: B.sentakuki.inner, text: text });
    return { name: 'センタクキ', cells: cells, damage: B.sentakuki.inner };
  }

  // ---------------------------------------------------------------
  // 山に水 → 川が流れる
  //   返り値 { text, finisher, cells }
  // ---------------------------------------------------------------
  function flowRiver(s, mx, my, dir, ev, depth) {
    var d = DIRS[dir];
    var x = mx + d.dx, y = my + d.dy;
    var cells = [];
    while (inBounds(s, x, y) && getTile(s, x, y) === 'empty' && !unitAt(s, x, y)) {
      setTile(s, x, y, 'river');
      cells.push([x, y]);
      x += d.dx; y += d.dy;
    }
    var text = '山から' + d.name + 'へ川が流れた（' + cells.length + 'マス）';
    var finisher = null;
    if (!inBounds(s, x, y)) {
      text += '、盤の端まで届いた';
    } else {
      var u = unitAt(s, x, y);
      var t = getTile(s, x, y);
      if (u) {
        text += '、' + unitLabel(s, u) + 'に当たって止まった';
      } else {
        text += '、' + tileName(t) + 'に当たって止まった';
        var r = waterOnNature(s, x, y, dir, ev, depth + 1);
        if (r.text) text += '→ ' + r.text;
        finisher = r.finisher;
        cells = cells.concat(r.cells || []);
      }
    }
    return { text: text, finisher: finisher, cells: cells };
  }

  // 「そのマスに水を撃った」のと同じ効果（自然のマスに対して。ユニットは見ない）
  function waterOnNature(s, x, y, dir, ev, depth) {
    var t = getTile(s, x, y);
    if (t === 'fire' || t === 'smallfire') {
      setTile(s, x, y, 'empty');
      return { text: tileName(t) + 'を消した（消火）', cells: [[x, y]] };
    }
    if (t === 'magma') {
      return { text: 'マグマに水がかかった', finisher: doSteam(s, x, y, ev), cells: [[x, y]] };
    }
    if (t === 'mountain' && depth < 30) {
      var r = flowRiver(s, x, y, dir, ev, depth);
      return { text: 'さらに' + r.text, finisher: r.finisher, cells: r.cells };
    }
    return { text: '', cells: [] };
  }

  // ---------------------------------------------------------------
  // 魔法をマスに当てる（中心の処理。手番のチェックはしない）
  //   ev に出来事を足し、{ finisher, changed } を返す
  // ---------------------------------------------------------------
  function needsDirection(s, magic, x, y) {
    if (magic === 'wind') return true;
    if (magic === 'water' && inBounds(s, x, y) && getTile(s, x, y) === 'mountain') return true;
    return false;
  }

  function applyMagic(s, magic, x, y, dir, ev, casterLabel) {
    var tile = getTile(s, x, y);
    var target = unitAt(s, x, y);
    var castEv = { type: 'cast', magic: magic, cells: [[x, y]], text: '' };
    ev.push(castEv);
    var change = null;     // マスの変化の説明
    var finisher = null;

    switch (magic) {
      case 'grass':
        if (tile === 'empty' && !target) { setTile(s, x, y, 'forest'); change = '森ができた'; }
        break;

      case 'water':
        if (tile === 'mountain') {
          var r = flowRiver(s, x, y, dir, ev, 0);
          change = r.text; finisher = r.finisher;
        } else if (tile === 'fire' || tile === 'smallfire') {
          setTile(s, x, y, 'empty'); change = tileName(tile) + 'を消した（消火）';
        } else if (tile === 'magma') {
          change = 'マグマに水がかかった';
          finisher = doSteam(s, x, y, ev);
        } else if (tile === 'empty' && !target) {
          setTile(s, x, y, 'river'); change = '川ができた';
        }
        break;

      case 'earth':
        if (tile === 'river') { setTile(s, x, y, 'mud'); change = '川が泥沼になった'; }
        else if (tile === 'empty' && !target) { setTile(s, x, y, 'mountain'); change = '山ができた'; }
        break;

      case 'fire':
        if (tile === 'forest') { setTile(s, x, y, 'fire'); change = '森が燃えた'; }
        else if (tile === 'mountain') { setTile(s, x, y, 'magma'); change = '山がマグマになった'; }
        else if (tile === 'whirl') { change = '渦巻きに火が入った'; finisher = doSentakuki(s, x, y, ev); }
        else if (tile === 'empty') { setTile(s, x, y, 'smallfire'); change = '小さな炎がついた'; }
        break;

      case 'wind':
        if (tile === 'river') { setTile(s, x, y, 'whirl'); change = '川が渦巻きになった'; }
        else if (tile === 'fire' || tile === 'smallfire') {
          change = tileName(tile) + 'が' + DIRS[dir].name + 'へあおられた';
          finisher = doSpread(s, x, y, dir, ev);
        }
        break;
    }

    castEv.text = (casterLabel ? casterLabel + 'の' : '') + magicName(magic) + 'の魔法 → ' +
      (change || (target ? '' : '何も起きなかった'));
    if (!change && target) castEv.text += unitLabel(s, target) + 'に直撃';

    // 直撃ダメージ（決め手が起きたときは決め手のダメージだけ）
    if (target && !finisher && target.hp > 0) {
      var dmg = damage(target, B.directDamage[magic]);
      ev.push({ type: 'damage', id: target.id, cells: [[x, y]], text: unitLabel(s, target) + 'に直撃 ' + dmg + 'ダメージ' });
    }

    // 風: マスの変化のあとでユニットを押す
    if (magic === 'wind' && target && target.hp > 0) pushUnit(s, target, dir, ev);

    return { finisher: finisher, changed: !!change };
  }

  function pushUnit(s, u, dir, ev) {
    var d = DIRS[dir];
    var label = unitLabel(s, u);
    if (isInWhirl(s, u)) {
      ev.push({ type: 'push', id: u.id, ok: false, text: label + 'は渦巻きの中なので押されない' });
      return false;
    }
    var nx = u.x + d.dx, ny = u.y + d.dy;
    var why = null;
    if (!inBounds(s, nx, ny)) why = '盤の端';
    else if (!isPassable(getTile(s, nx, ny))) why = tileName(getTile(s, nx, ny)) + 'があって通れない';
    else if (unitAt(s, nx, ny)) why = unitLabel(s, unitAt(s, nx, ny)) + 'がいる';
    if (why) {
      ev.push({ type: 'push', id: u.id, ok: false, text: label + 'を' + d.name + 'へ押せなかった（' + why + '）' });
      return false;
    }
    var from = [u.x, u.y];
    ev.push({ type: 'push', id: u.id, ok: true, from: from, to: [nx, ny], text: label + 'を' + d.name + 'へ1マス押した' });
    placeUnit(s, u, nx, ny, ev);
    return true;
  }

  // ---------------------------------------------------------------
  // 味方の行動
  // ---------------------------------------------------------------
  function canMove(s, u) {
    return u && u.side === 'ally' && u.hp > 0 && u.movesLeft > 0 && !isInWhirl(s, u);
  }

  // 移動できるマス: { "x,y": 距離 }。通れるマス・ユニットのいないマスだけ。泥沼に入ったらそこで止まる
  function reachableCells(s, unitId) {
    var u = findUnit(s, unitId);
    var out = {};
    if (!canMove(s, u) || s.result) return out;
    var dist = {};
    dist[u.x + ',' + u.y] = 0;
    var queue = [[u.x, u.y]];
    while (queue.length) {
      var c = queue.shift();
      var cd = dist[c[0] + ',' + c[1]];
      if (cd >= u.movesLeft) continue;
      if (cd > 0 && getTile(s, c[0], c[1]) === 'mud') continue;
      neighbors(s, c[0], c[1]).forEach(function (n) {
        var key = n.x + ',' + n.y;
        if (dist[key] !== undefined) return;
        if (!isPassable(getTile(s, n.x, n.y))) return;
        if (unitAt(s, n.x, n.y)) return;
        dist[key] = cd + 1;
        out[key] = cd + 1;
        queue.push([n.x, n.y]);
      });
    }
    return out;
  }

  function fail(s, msg) { return { ok: false, state: s, events: [], error: msg }; }

  function moveAlly(s0, unitId, x, y) {
    if (s0.result) return fail(s0, '勝負はもうついている');
    var u0 = findUnit(s0, unitId);
    if (!u0 || u0.side !== 'ally') return fail(s0, '味方を選んでいない');
    if (isInWhirl(s0, u0)) return fail(s0, '渦巻きの中では動けない');
    if (u0.movesLeft <= 0) return fail(s0, 'このターンはもう動けない');
    var reach = reachableCells(s0, unitId);
    var dist = reach[x + ',' + y];
    if (!dist) return fail(s0, 'そこへは移動できない');

    var s = clone(s0);
    var u = findUnit(s, unitId);
    var ev = [];
    var from = [u.x, u.y];
    u.movesLeft -= dist;
    ev.push({ type: 'move', id: u.id, from: from, to: [x, y], text: unitLabel(s, u) + 'が' + dist + 'マス移動した' });
    placeUnit(s, u, x, y, ev);
    return { ok: true, state: s, events: ev };
  }

  function castMagic(s0, unitId, x, y, dir) {
    if (s0.result) return fail(s0, '勝負はもうついている');
    var u0 = findUnit(s0, unitId);
    if (!u0 || u0.side !== 'ally') return fail(s0, '味方を選んでいない');
    if (u0.cast) return fail(s0, 'このターンはもう魔法を撃った');
    if (!inBounds(s0, x, y)) return fail(s0, '盤の外には撃てない');
    if (needsDirection(s0, u0.magic, x, y) && !DIRS[dir]) return fail(s0, '向きを選んでいない');

    var s = clone(s0);
    var u = findUnit(s, unitId);
    var ev = [];
    u.cast = true;
    applyMagic(s, u.magic, x, y, dir, ev, unitLabel(s, u));
    removeDead(s, ev);
    checkResult(s, ev);
    return { ok: true, state: s, events: ev };
  }

  // 3人とも魔法を撃ったか（生きている味方全員）
  function allAlliesDone(s) {
    var al = alliesOf(s);
    return al.length > 0 && al.every(function (a) { return a.cast; });
  }

  // ---------------------------------------------------------------
  // 敵の行動
  // ---------------------------------------------------------------

  // target のマスから、通れるマスだけを通った道のり。mover 自身のマスは通れるものとして扱う
  function distanceField(s, target, mover) {
    var field = {};
    field[target.x + ',' + target.y] = 0;
    var queue = [[target.x, target.y]];
    while (queue.length) {
      var c = queue.shift();
      var cd = field[c[0] + ',' + c[1]];
      neighbors(s, c[0], c[1]).forEach(function (n) {
        var key = n.x + ',' + n.y;
        if (field[key] !== undefined) return;
        if (!isPassable(getTile(s, n.x, n.y))) return;
        var occ = unitAt(s, n.x, n.y);
        if (occ && occ !== mover) return;
        field[key] = cd + 1;
        queue.push([n.x, n.y]);
      });
    }
    return field;
  }

  function enemyAct(s, e, ev) {
    var label = unitLabel(s, e);
    if (isInWhirl(s, e)) {
      ev.push({ type: 'enemyWait', id: e.id, text: label + 'は渦巻きの中で動けない' });
      return;
    }
    if (e.stuck > 0) {
      e.stuck = 0;
      ev.push({ type: 'enemyWait', id: e.id, text: label + 'は泥沼にはまっていて動けない（1回休み）' });
      return;
    }
    var allies = alliesOf(s).filter(function (a) { return a.hp > 0; });

    // 隣に味方がいれば攻撃
    for (var i = 0; i < allies.length; i++) {
      var a = allies[i];
      if (Math.abs(a.x - e.x) + Math.abs(a.y - e.y) === 1) {
        var dmg = damage(a, B.enemy.attack);
        ev.push({ type: 'enemyAttack', id: e.id, target: a.id, cells: [[a.x, a.y]], text: label + 'が' + unitLabel(s, a) + 'を攻撃！ ' + dmg + 'ダメージ' });
        return;
      }
    }

    // 一番近い味方（道のり。同じなら味方の番号順）
    var best = null;
    allies.forEach(function (a) {
      var field = distanceField(s, a, e);
      var d = field[e.x + ',' + e.y];
      if (d === undefined) return;
      if (!best || d < best.d) best = { a: a, field: field, d: d };
    });
    if (!best) {
      ev.push({ type: 'enemyWait', id: e.id, text: label + 'は味方への道がないので待っている' });
      return;
    }
    for (var k = 0; k < DIR_ORDER.length; k++) {
      var dname = DIR_ORDER[k];
      var nx = e.x + DIRS[dname].dx, ny = e.y + DIRS[dname].dy;
      if (!inBounds(s, nx, ny)) continue;
      if (best.field[nx + ',' + ny] !== best.d - 1) continue;
      if (!isPassable(getTile(s, nx, ny)) || unitAt(s, nx, ny)) continue;
      var from = [e.x, e.y];
      ev.push({ type: 'enemyMove', id: e.id, from: from, to: [nx, ny], text: label + 'が' + DIRS[dname].name + 'へ1マス進んだ' });
      placeUnit(s, e, nx, ny, ev);
      return;
    }
    ev.push({ type: 'enemyWait', id: e.id, text: label + 'は進めないので待っている' });
  }

  // ---------------------------------------------------------------
  // ターン終了処理
  // ---------------------------------------------------------------
  function endTurn(s0) {
    if (s0.result) return fail(s0, '勝負はもうついている');
    var s = clone(s0);
    var ev = [{ type: 'turnEnd', text: '── ターン' + s.turn + ' 終了 ──' }];

    // 1. 炎が隣の森へ燃え移る（処理開始時の盤面で同時に判定）
    var snap = s.tiles.slice();
    var caught = [];
    for (var y = 0; y < s.size; y++) {
      for (var x = 0; x < s.size; x++) {
        if (snap[idx(s, x, y)] !== 'forest') continue;
        var touch = neighbors(s, x, y).some(function (n) { return snap[idx(s, n.x, n.y)] === 'fire'; });
        if (touch) caught.push([x, y]);
      }
    }
    caught.forEach(function (c) { setTile(s, c[0], c[1], 'fire'); });
    if (caught.length) ev.push({ type: 'fireSpread', cells: caught, text: '炎が隣の森へ燃え移った（' + caught.length + 'マス）' });

    // 2. 炎の上にいる者にダメージ
    s.units.forEach(function (u) {
      if (u.hp > 0 && getTile(s, u.x, u.y) === 'fire') {
        var dmg = damage(u, B.fireTileDamage);
        ev.push({ type: 'burn', id: u.id, cells: [[u.x, u.y]], text: '炎の上の' + unitLabel(s, u) + 'に' + dmg + 'ダメージ' });
      }
    });

    // 3. 小さな炎が消える
    var gone = 0;
    for (var i = 0; i < s.tiles.length; i++) {
      if (s.tiles[i] === 'smallfire') { s.tiles[i] = 'empty'; gone++; }
    }
    if (gone) ev.push({ type: 'smallfireOut', text: '小さな炎が消えた（' + gone + 'マス）' });

    // 4. 渦巻きの引き込み（盤の左上から順に。各渦1体まで）
    for (var wy = 0; wy < s.size; wy++) {
      for (var wx = 0; wx < s.size; wx++) {
        if (getTile(s, wx, wy) !== 'whirl' || unitAt(s, wx, wy)) continue;
        var ns = neighbors(s, wx, wy);
        for (var j = 0; j < ns.length; j++) {
          var cand = unitAt(s, ns[j].x, ns[j].y);
          if (cand && cand.hp > 0 && !isInWhirl(s, cand)) {
            var from = [cand.x, cand.y];
            cand.x = wx; cand.y = wy;
            ev.push({ type: 'pull', id: cand.id, from: from, to: [wx, wy], cells: [[wx, wy]], text: unitLabel(s, cand) + 'は渦巻きに引き込まれた' });
            break;
          }
        }
      }
    }

    // 5. 敵の行動
    if (s.enemyMoves) {
      enemiesOf(s).forEach(function (e) { if (e.hp > 0) enemyAct(s, e, ev); });
    }

    // 6. 倒れた者を消す・ターンを進める
    removeDead(s, ev);
    s.turn += 1;
    alliesOf(s).forEach(function (a) {
      a.cast = false;
      if (a.stuck > 0) {
        a.stuck = 0;
        a.movesLeft = 0;
        ev.push({ type: 'mudSkip', id: a.id, text: unitLabel(s, a) + 'は泥沼にはまっていて、このターンは動けない' });
      } else {
        a.movesLeft = B.ally.moveRange;
      }
    });
    checkResult(s, ev);
    if (!s.result) ev.push({ type: 'turnStart', text: '── ターン' + s.turn + ' 開始 ──' });
    return { ok: true, state: s, events: ev };
  }

  // ---------------------------------------------------------------
  // プレビューと光る導き
  // ---------------------------------------------------------------

  // 撃ったら何が起きるかをシミュレーションする（倒れた者はまだ消さない）
  function simulateCast(s0, magic, x, y, dir, casterLabel) {
    var s = clone(s0);
    var ev = [];
    applyMagic(s, magic, x, y, dir, ev, casterLabel);
    var tileChanges = [];
    for (var i = 0; i < s.tiles.length; i++) {
      if (s.tiles[i] !== s0.tiles[i]) {
        tileChanges.push({ x: i % s.size, y: Math.floor(i / s.size), from: s0.tiles[i], to: s.tiles[i] });
      }
    }
    var damages = [], moves = [];
    s0.units.forEach(function (u0) {
      var u = findUnit(s, u0.id);
      if (u.hp !== u0.hp) {
        damages.push({ id: u.id, label: unitLabel(s0, u0), x: u0.x, y: u0.y, amount: u0.hp - u.hp, hpAfter: u.hp, dies: u.hp <= 0 });
      }
      if (u.x !== u0.x || u.y !== u0.y) moves.push({ id: u.id, from: [u0.x, u0.y], to: [u.x, u.y] });
    });
    var finishers = ev.filter(function (e) { return e.type === 'finisher'; });
    return { state: s, events: ev, tileChanges: tileChanges, damages: damages, moves: moves, finishers: finishers };
  }

  function previewCast(s, unitId, x, y, dir) {
    var u = findUnit(s, unitId);
    if (!u || !inBounds(s, x, y)) return null;
    var d = needsDirection(s, u.magic, x, y) ? (DIRS[dir] ? dir : 'up') : null;
    var p = simulateCast(s, u.magic, x, y, d, unitLabel(s, u));
    p.dir = d;
    p.needsDirection = !!d;
    return p;
  }

  // そのマスに撃つと 'finisher'（決め手）/ 'change'（変化）/ null（何も変わらない）
  function classifyCell(s, magic, x, y) {
    var dirs = needsDirection(s, magic, x, y) ? DIR_ORDER : [null];
    var result = null;
    for (var i = 0; i < dirs.length; i++) {
      var p = simulateCast(s, magic, x, y, dirs[i], '');
      if (p.finishers.length) return 'finisher';
      if (p.tileChanges.length) result = 'change';
    }
    return result;
  }

  function guideMap(s, unitId) {
    var u = findUnit(s, unitId);
    var map = {};
    if (!u) return map;
    for (var y = 0; y < s.size; y++) {
      for (var x = 0; x < s.size; x++) {
        var c = classifyCell(s, u.magic, x, y);
        if (c) map[x + ',' + y] = c;
      }
    }
    return map;
  }

  // ---------------------------------------------------------------
  // エディットモード用（どれも新しい状態を返す）
  // ---------------------------------------------------------------
  function editPaint(s0, x, y, tile) {
    if (!inBounds(s0, x, y) || !TILE_INFO[tile]) return fail(s0, '塗れない');
    var u = unitAt(s0, x, y);
    if (u && !isPassable(tile) && tile !== 'whirl') return fail(s0, 'ユニットがいるマスを' + tileName(tile) + 'にはできない');
    if (getTile(s0, x, y) === tile) return fail(s0, '同じ地形');
    var s = clone(s0);
    setTile(s, x, y, tile);
    return { ok: true, state: s, events: [] };
  }

  function canStand(s, x, y) {
    var t = getTile(s, x, y);
    return isPassable(t) || t === 'whirl';
  }

  function editPlaceAlly(s0, x, y, magic) {
    if (!inBounds(s0, x, y)) return fail(s0, '盤の外');
    if (unitAt(s0, x, y)) return fail(s0, 'もうユニットがいる');
    if (!canStand(s0, x, y)) return fail(s0, '通れないマスには置けない');
    if (alliesOf(s0).length >= B.ally.count) return fail(s0, '味方は' + B.ally.count + '人まで');
    var s = clone(s0);
    var used = alliesOf(s).map(function (a) { return a.magic; });
    var m = magic || B.ally.defaultMagics.filter(function (d) { return used.indexOf(d) < 0; })[0] || 'fire';
    var u = addAlly(s, m, x, y);
    return { ok: true, state: s, events: [], unit: u };
  }

  function editPlaceEnemy(s0, x, y) {
    if (!inBounds(s0, x, y)) return fail(s0, '盤の外');
    if (unitAt(s0, x, y)) return fail(s0, 'もうユニットがいる');
    if (!canStand(s0, x, y)) return fail(s0, '通れないマスには置けない');
    if (enemiesOf(s0).length >= B.enemy.maxCount) return fail(s0, '敵は' + B.enemy.maxCount + '体まで');
    var s = clone(s0);
    var u = addEnemy(s, x, y);
    return { ok: true, state: s, events: [], unit: u };
  }

  function editRemoveUnit(s0, x, y) {
    if (!inBounds(s0, x, y) || !unitAt(s0, x, y)) return fail(s0, 'ユニットがいない');
    var s = clone(s0);
    s.units = s.units.filter(function (u) { return !(u.x === x && u.y === y); });
    return { ok: true, state: s, events: [] };
  }

  function editMoveUnit(s0, unitId, x, y) {
    var u0 = findUnit(s0, unitId);
    if (!u0) return fail(s0, 'ユニットがいない');
    if (!inBounds(s0, x, y)) return fail(s0, '盤の外');
    var occ = unitAt(s0, x, y);
    if (occ && occ.id !== unitId) return fail(s0, 'もうユニットがいる');
    if (!canStand(s0, x, y)) return fail(s0, '通れないマスには置けない');
    var s = clone(s0);
    var u = findUnit(s, unitId);
    u.x = x; u.y = y;
    return { ok: true, state: s, events: [] };
  }

  function editSetMagic(s0, unitId, magic) {
    if (!MAGIC_INFO[magic]) return fail(s0, '魔法がない');
    var s = clone(s0);
    var u = findUnit(s, unitId);
    if (!u || u.side !== 'ally') return fail(s0, '味方ではない');
    u.magic = magic;
    return { ok: true, state: s, events: [] };
  }

  function editSetEnemyMoves(s0, moves) {
    var s = clone(s0);
    s.enemyMoves = !!moves;
    return { ok: true, state: s, events: [] };
  }

  // 盤面サイズを変える。重なる部分の地形とユニットは残す
  function editResize(s0, size) {
    size = clampSize(size);
    var s = clone(s0);
    var tiles = [];
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        tiles.push(x < s0.size && y < s0.size ? getTile(s0, x, y) : 'empty');
      }
    }
    s.size = size;
    s.tiles = tiles;
    s.units = s.units.filter(function (u) { return u.x < size && u.y < size; });
    return { ok: true, state: s, events: [] };
  }

  // エディットを抜けるとき: 遊び始めの状態にそろえる（ターン1、HP満タン）
  function normalizeForPlay(s0) {
    var s = clone(s0);
    s.turn = 1;
    s.result = null;
    s.units.forEach(function (u) {
      u.hp = u.maxHp;
      u.stuck = 0;
      if (u.side === 'ally') { u.movesLeft = B.ally.moveRange; u.cast = false; }
    });
    return s;
  }

  // ---------------------------------------------------------------
  var api = {
    BALANCE: B,
    TILE_INFO: TILE_INFO, TILES: TILES,
    MAGIC_INFO: MAGIC_INFO, MAGICS: MAGICS,
    DIRS: DIRS, DIR_ORDER: DIR_ORDER,
    clone: clone, inBounds: inBounds, getTile: getTile, setTile: setTile,
    isPassable: isPassable, unitAt: unitAt, findUnit: findUnit,
    alliesOf: alliesOf, enemiesOf: enemiesOf, isInWhirl: isInWhirl, unitLabel: unitLabel,
    tileName: tileName, magicName: magicName,
    createState: createState, addAlly: addAlly, addEnemy: addEnemy,
    needsDirection: needsDirection,
    reachableCells: reachableCells, moveAlly: moveAlly, castMagic: castMagic,
    allAlliesDone: allAlliesDone, endTurn: endTurn,
    simulateCast: simulateCast, previewCast: previewCast,
    classifyCell: classifyCell, guideMap: guideMap,
    editPaint: editPaint, editPlaceAlly: editPlaceAlly, editPlaceEnemy: editPlaceEnemy,
    editRemoveUnit: editRemoveUnit, editMoveUnit: editMoveUnit, editSetMagic: editSetMagic,
    editSetEnemyMoves: editSetEnemyMoves, editResize: editResize, normalizeForPlay: normalizeForPlay
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Rules = api;
  }
})(this);
