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
    volcano:   { name: '火山',     label: '噴', passable: false },   // 【新案】マグマの代わり
    sakura:    { name: '桜',       label: '桜', passable: false },   // 【新案・試し】山に草で桜が咲いた山。風で桜吹雪
    petals:    { name: '花びら',   label: '花', passable: true  },   // 【新案・試し】桜吹雪の跡。ターン終了で散る
    deadforest: { name: '死の森',  label: '死', passable: true  },   // 【新案・試し】森に闇。火を点けるとオバケヤシキ
    haunted:   { name: 'オバケヤシキ', label: '館', passable: false }, // 【新案・試し】死の森に火
    mud:       { name: '泥沼',     label: '泥', passable: true  },
    puddle:    { name: '水たまり', label: '溜', passable: true  },   // 【新案】風が運んだ川の水
    mirage:    { name: '蜃気楼',   label: '蜃', passable: true  },   // 【新案】水たまりに火。中にいる者は敵から見つからない
    ice:       { name: '氷',       label: '氷', passable: true  },   // 【新案】凍った水。歩いて渡れる
    lava:      { name: '溶岩',     label: '溶', passable: false },   // 【新案】噴火であふれる。水や冷気で冷えて山になる
    whirlwind: { name: 'つむじ風', label: '旋', passable: true  },   // 【新案】風が吹き抜けた先に残る
    tornado:   { name: '竜巻',     label: '竜', passable: false },   // 【新案】つむじ風に風で2×2に育つ
    breeze:    { name: '風',       label: '風', passable: true  },   // 【新案・試し】風の形（2マス）に残る風。ターン終了で消える
    firewhirl: { name: '火の渦',   label: '渦', passable: false }    // 【新案・試し】風に火で2×2。水でセンタクキ。ターン終了で解けて炎
  };
  var TILES = Object.keys(TILE_INFO);

  var MAGIC_INFO = {
    grass: { name: '草', verb: '置く' },
    water: { name: '水', verb: '流れる' },
    earth: { name: '土', verb: '置く' },
    fire:  { name: '火', verb: '点ける' },
    wind:  { name: '風', verb: '吹き抜ける' },
    thunder: { name: '雷', verb: '走る' },         // 【新案】
    ice:     { name: '氷', verb: '凍らせる' },     // 【新案】
    senpu:   { name: '旋風', verb: '巻く' },       // 【新案・試し】風の強化系。正面の2×2につむじ風を巻く
    dark:    { name: '闇', verb: '吸う' }          // 【新案・試し】正面1マス。撃つとまわりの者を引き寄せる
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
  var SPREAD_BLOCKERS = { mountain: true, river: true, volcano: true, lava: true, tornado: true, sakura: true, haunted: true };

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
      else if (B.ideas.spreadMeltsIce && getTile(s, c[0], c[1]) === 'ice') setTile(s, c[0], c[1], 'puddle');   // 【新案】燃え広がりは氷を溶かす
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

  // 【新案】感電: 走る雷が水（川・水たまり）に触れる
  //   つながった水全体に一瞬で走り、その上と隣にいる全員にダメージ
  function doShock(s, sx, sy, ctx, ev, done) {
    var net = [], seen = {};
    var stack = [[sx, sy]];
    while (stack.length) {
      var c = stack.pop();
      var k = key(c[0], c[1]);
      if (seen[k]) continue;
      var t = getTile(s, c[0], c[1]);
      if (t !== 'river' && t !== 'puddle') continue;
      seen[k] = true;
      done[k] = true;
      net.push(c);
      neighbors(s, c[0], c[1]).forEach(function (n) { stack.push([n.x, n.y]); });
    }
    var amount = B.shock.base + net.length * B.shock.perWater;
    var touched = {};
    net.forEach(function (c) {
      [[c[0], c[1]]].concat(neighbors(s, c[0], c[1]).map(function (n) { return [n.x, n.y]; })).forEach(function (p) {
        var u = unitAt(s, p[0], p[1]);
        if (u && !touched[u.id]) { touched[u.id] = true; addHit(ctx, u, amount, 'finisher'); }
      });
    });
    var fin = { name: '感電', cells: net, damage: amount, water: net.length };
    ctx.finishers.push(fin);
    ev.push({ type: 'finisher', name: '感電', isNew: true, origin: [sx, sy], cells: net, damage: amount, text: '【新案】感電！ つながった水' + net.length + 'マスに雷が走った（威力' + amount + '）' });
    return fin;
  }

  // 【新案】桜吹雪: 風が火山に当たる（破壊3段目）
  //   火の粉が風下へ扇形に舞い散る。つながった火山が多いほど強い。噴き終えた火山は冷えて山に戻る
  function doEruption(s, vx, vy, dir, ctx, ev) {
    var kind = getTile(s, vx, vy), pink = kind === 'sakura';   // 【新案・試し】桜（花びら）か火山（火の粉）か
    var F = DIRS[dir];
    var Rx = -F.dy, Ry = F.dx;
    var comp = [], seen = {};
    var stack = [[vx, vy]];
    while (stack.length) {
      var c = stack.pop();
      var k = key(c[0], c[1]);
      if (seen[k] || getTile(s, c[0], c[1]) !== kind) continue;
      seen[k] = true;
      comp.push(c);
      neighbors(s, c[0], c[1]).forEach(function (n) { stack.push([n.x, n.y]); });
    }
    var cells = [];
    for (var d = 1; d <= B.eruption.depth; d++) {
      for (var w = -(d - 1); w <= d - 1; w++) {
        var x = vx + F.dx * d + Rx * w, y = vy + F.dy * d + Ry * w;
        if (inBounds(s, x, y)) cells.push([x, y]);
      }
    }
    var amount = B.eruption.base + comp.length * B.eruption.perVolcano;
    var burned = 0;
    cells.forEach(function (c) {
      var u = unitAt(s, c[0], c[1]);
      if (u) addHit(ctx, u, amount, 'finisher');
      var t = getTile(s, c[0], c[1]);
      if (pink) { if (t === 'empty') setTile(s, c[0], c[1], 'petals'); return; }   // 【新案・試し】桜なら花びらが積もる（燃えない）
      if (t === 'empty') setTile(s, c[0], c[1], 'smallfire');
      else if (t === 'forest') { setTile(s, c[0], c[1], 'fire'); burned++; }
    });
    comp.forEach(function (c) { setTile(s, c[0], c[1], 'mountain'); });
    var fin = { name: '桜吹雪', cells: cells, damage: amount, volcanoes: comp.length, pink: pink };
    ctx.finishers.push(fin);
    ev.push({
      type: 'finisher', name: '桜吹雪', isNew: true, origin: [vx, vy], cells: cells, damage: amount, pink: pink,
      text: (pink ? '【新案】桜吹雪！ 桜' + comp.length + 'つの花びらが' : '【新案】桜吹雪！ 火山' + comp.length + 'つの火の粉が') + DIRS[dir].name + 'へ舞い散った（威力' + amount + '）' +
        (burned ? '。森' + burned + 'つに火がついた' : '')
    });
    return fin;
  }

  // ---------------------------------------------------------------
  // 魔法を撃つ（術者の今の位置と向きから）
  // ---------------------------------------------------------------

  // 置く（草・土）・点ける（火）・【新案】走る（雷）
  function placeOrIgnite(s, u, facing, ctx, ev) {
    var shocked = {}, erupted = {}, planted = [];
    shapeCells(s, u.magic, u.x, u.y, facing).forEach(function (c) {
      var x = c[0], y = c[1];
      ctx.cells.push([x, y]);
      var o = unitAt(s, x, y);
      if (o) addHit(ctx, o, u.power, 'direct');
      var t = getTile(s, x, y);
      if (u.magic === 'grass') {
        if (!o && t === 'empty') { setTile(s, x, y, 'forest'); ctx.phrases.push('森ができた'); planted.push([x, y]); }
        else if (!o && t === 'mountain' && B.sakura.from === 'grass') { setTile(s, x, y, 'sakura'); ctx.phrases.push('【新案】山に桜が咲いた'); }
      } else if (u.magic === 'earth') {
        if (!o && t === 'empty') { setTile(s, x, y, 'mountain'); ctx.phrases.push('山ができた'); }
        else if (!o && (t === 'river' || t === 'puddle')) { setTile(s, x, y, 'mud'); ctx.phrases.push(tileName(t) + 'が泥沼になった'); }
        else if (!o && B.ideas.earthSmother && (t === 'fire' || t === 'smallfire')) { setTile(s, x, y, 'mountain'); ctx.phrases.push('【新案】土をかぶせて' + tileName(t) + 'を消した（山になった）'); }
      } else if (u.magic === 'senpu') {
        if (!o && t === 'empty') { setTile(s, x, y, 'whirlwind'); ctx.phrases.push('【新案】つむじ風が巻き起こった'); }
      } else if (u.magic === 'fire') {
        if (t === 'empty') { setTile(s, x, y, 'smallfire'); ctx.phrases.push('小さな炎がついた'); }
        else if (t === 'deadforest') { ctx.phrases.push('【新案】死の森に火が灯った'); doHaunt(s, x, y, ctx, ev); }
        else if (t === 'breeze') { ctx.phrases.push('【新案】吹いている風に火が入った'); doFireWhirl(s, x, y, facing, ctx, ev); }
        else if (t === 'forest') { setTile(s, x, y, 'fire'); ctx.phrases.push('森が燃えた'); }
        else if (t === 'mountain' && !erupted[key(x, y)]) { ctx.phrases.push('【新案】山に火が点いた'); doFunka(s, x, y, ctx, ev, erupted); }
        else if (t === 'puddle') { setTile(s, x, y, 'mirage'); ctx.phrases.push('【新案】水たまりが蜃気楼になった'); }
        else if (t === 'ice') { setTile(s, x, y, 'puddle'); ctx.phrases.push('【新案】氷が溶けて水たまりになった'); }
        else if (t === 'tornado') {
          // 竜巻はどちらでも消える（火炎竜巻は炎、センタクキは跡形もなく）ので、同じ1発で2度は起きない
          ctx.phrases.push('【新案】竜巻に火が入った');
          if (B.tornadoRecipe === 'windWind') doFireTornado(s, x, y, ctx, ev);
          else doSentakuki(s, x, y, ctx, ev);
        }
      }
    });
    // 【新案】水辺の森はよく育つ: 水に接して植えた森は、水に接しているとなりの空きにも広がる
    if (B.ideas.wetlandForest && planted.length) {
      var isWet = function (x, y) { return neighbors(s, x, y).some(function (n) { var tt = getTile(s, n.x, n.y); return tt === 'river' || tt === 'puddle'; }); };
      var grown = 0;
      planted.forEach(function (c) {
        if (!isWet(c[0], c[1])) return;
        neighbors(s, c[0], c[1]).forEach(function (n) {
          if (getTile(s, n.x, n.y) === 'empty' && !unitAt(s, n.x, n.y) && isWet(n.x, n.y)) { setTile(s, n.x, n.y, 'forest'); grown++; ctx.cells.push([n.x, n.y]); }
        });
      });
      if (grown) ctx.phrases.push('【新案】水辺で森が広がった（＋' + grown + 'マス）');
    }
  }

  // 【新案】走る（雷）: ジグザグに走り、最初に当たった高いもの（森・山・火山・ユニット）か水に落ちる
  //   森 → 燃える。水（川・水たまり）→ つながった水全体に走って感電。ユニット → 直撃。山・火山 → 落ちるだけ
  function strike(s, u, facing, ctx, ev) {
    var cells = shapeCells(s, u.magic, u.x, u.y, facing);
    for (var i = 0; i < cells.length; i++) {
      var x = cells[i][0], y = cells[i][1];
      ctx.cells.push([x, y]);
      var o = unitAt(s, x, y);
      var t = getTile(s, x, y);
      var tall = o || t === 'forest' || t === 'mountain' || t === 'volcano' || t === 'sakura' || t === 'deadforest' || t === 'haunted';
      var water = t === 'river' || t === 'puddle';
      if (!tall && !water) continue;
      if (o) addHit(ctx, o, u.power, 'direct');
      if (water) {
        ctx.phrases.push('【新案】雷が' + tileName(t) + 'に落ちた');
        doShock(s, x, y, ctx, ev, {});
      } else if (t === 'forest') {
        setTile(s, x, y, 'fire');
        ctx.phrases.push('【新案】雷が森に落ちて燃えた');
      } else {
        ctx.phrases.push('【新案】雷が' + (o ? unitLabel(s, o) : tileName(t)) + 'に落ちた');
      }
      ctx.strikeAt = [x, y];
      return;
    }
    ctx.phrases.push('【新案】雷は地面に落ちた');
  }

  // 【新案】凍らせる（氷）: 冷気が正面へ進み、最初に当たったものに作用して止まる
  //   水（川・水たまり）→ つながった水がまとめて凍る（凍結）。炎 → 消える。ユニット → 直撃して足が凍りつく。森・山・火山 → 止まる
  function chill(s, u, facing, ctx, ev) {
    var cells = shapeCells(s, u.magic, u.x, u.y, facing);
    for (var i = 0; i < cells.length; i++) {
      var x = cells[i][0], y = cells[i][1];
      ctx.cells.push([x, y]);
      var o = unitAt(s, x, y);
      var t = getTile(s, x, y);
      if (t === 'river' || t === 'puddle') {
        if (o) addHit(ctx, o, u.power, 'direct');
        ctx.phrases.push('【新案】冷気が' + tileName(t) + 'に触れた');
        doFreeze(s, x, y, ctx, ev);
        return;
      }
      if (o) {
        addHit(ctx, o, u.power, 'direct');
        if (!o.stuck) { o.stuck = true; ev.push({ type: 'mud', id: o.id, cells: [[x, y]], text: '【新案】' + unitLabel(s, o) + 'の足が凍りついた（次の移動は1回休み）' }); }
        ctx.phrases.push('【新案】冷気が' + unitLabel(s, o) + 'に当たった');
        return;
      }
      if (t === 'fire' || t === 'smallfire') { setTile(s, x, y, 'empty'); ctx.phrases.push('【新案】冷気で' + tileName(t) + 'が消えた'); return; }
      if (t === 'lava') { setTile(s, x, y, 'mountain'); ctx.phrases.push('【新案】冷気で溶岩が固まって山になった'); return; }
      if (t === 'forest' || t === 'mountain' || t === 'volcano') { ctx.phrases.push('冷気が' + tileName(t) + 'に当たって止まった'); return; }
    }
    ctx.phrases.push('冷気は何にも当たらなかった');
  }

  // 【新案】噴火: 火が山に点くと、その山とつながった山（山脈）がまとめて火山になり、まわりへ溶岩があふれる
  //   あふれた先: 空き・小さな炎 → 溶岩、森 → 炎、川・水たまり・氷 → 冷えて山、ユニット → ダメージ（足元は小さな炎）
  function doFunka(s, sx, sy, ctx, ev, done) {
    var range = [], seen = {}, dist = {};
    var queue = [[sx, sy]];
    seen[key(sx, sy)] = true; dist[key(sx, sy)] = 0;
    while (queue.length) {
      var c = queue.shift();
      range.push(c);
      neighbors(s, c[0], c[1]).forEach(function (n) {
        var k = key(n.x, n.y);
        if (seen[k] || getTile(s, n.x, n.y) !== 'mountain') return;
        seen[k] = true; dist[k] = dist[key(c[0], c[1])] + 1;
        queue.push([n.x, n.y]);
      });
    }
    range.forEach(function (c) { setTile(s, c[0], c[1], 'volcano'); done[key(c[0], c[1])] = true; });
    // 【新案・試し】溶岩なし（funka.lava が false）: 山脈が火山になるだけ。決め手ではない（決め手は風で桜吹雪）
    if (!B.funka.lava) {
      ctx.phrases.push('【新案】山脈' + range.length + 'つが火山になった');
      ev.push({ type: 'kindle', isNew: true, cells: range, text: '【新案】山脈' + range.length + 'つが一気に火山になった（風を当てると桜吹雪）' });
      return null;
    }
    var amount = B.funka.base + range.length * B.funka.perMountain;
    // 溶岩は山脈のまわりへ reach マスだけ流れ出す（山脈が大きいほど、まわりも長い）
    var reach = B.funka.reach;
    var ring = [], ringSeen = {};
    var lava = 0, burned = 0, cooled = 0;
    var frontier = range.slice();
    for (var step = 1; step <= reach && frontier.length; step++) {
      var next = [];
      frontier.forEach(function (c) {
        neighbors(s, c[0], c[1]).forEach(function (n) {
          var k = key(n.x, n.y);
          if (ringSeen[k] || seen[k]) return;
          ringSeen[k] = true;
          var o = unitAt(s, n.x, n.y);
          var t = getTile(s, n.x, n.y);
          var hitCell = function () { ring.push([n.x, n.y]); dist[k] = step; };
          if (o) { hitCell(); addHit(ctx, o, amount, 'finisher'); if (t === 'empty') setTile(s, n.x, n.y, 'smallfire'); return; }
          if (t === 'empty' || t === 'smallfire' || t === 'mirage' || t === 'whirlwind') { hitCell(); setTile(s, n.x, n.y, 'lava'); lava++; next.push([n.x, n.y]); }
          else if (t === 'forest') { hitCell(); setTile(s, n.x, n.y, 'fire'); burned++; }
          else if (t === 'river' || t === 'puddle' || t === 'ice') { hitCell(); setTile(s, n.x, n.y, 'mountain'); cooled++; }
        });
      });
      frontier = next;
    }
    var cells = range.concat(ring);
    var fin = { name: '噴火', cells: cells, damage: amount, mountains: range.length };
    ctx.finishers.push(fin);
    var parts = ['溶岩' + lava + 'マス'];
    if (burned) parts.push('森' + burned + 'つが燃えた');
    if (cooled) parts.push('水' + cooled + 'マスが冷えて山になった');
    ev.push({ type: 'finisher', name: '噴火', isNew: true, origin: [sx, sy], cells: cells,
      wave: cells.map(function (c) { return dist[key(c[0], c[1])]; }), damage: amount,
      text: '【新案】噴火！ 山脈' + range.length + 'つが一気に火山になり、溶岩があふれた（' + parts.join('、') + '。威力' + amount + '）' });
    return fin;
  }

  // 【新案】竜巻: つむじ風にもう一度風が当たると、2×2の竜巻に育つ
  //   つむじ風を角にした4つの2×2のうち、風下・右側を優先して、全部が空き・小さな炎・水たまり・蜃気楼・つむじ風のものを選ぶ
  //   中にユニットがいたら、竜巻にとらわれて動けない（足が止まる）
  var TORNADO_OK = { empty: true, smallfire: true, puddle: true, mirage: true, whirlwind: true };
  function growTornado(s, wx, wy, dir, ctx, ev, phrase) {
    var F = DIRS[dir], Rx = -F.dy, Ry = F.dx;
    var choices = [[0, 0], [-1, 0], [0, -1], [-1, -1]];   // 風下(+F)・右(+R) へ広げる → 足りなければずらす
    for (var i = 0; i < choices.length; i++) {
      var sq = [];
      for (var a = 0; a <= 1; a++) for (var b = 0; b <= 1; b++) {
        var f = a + choices[i][0], r = b + choices[i][1];
        sq.push([wx + F.dx * f + Rx * r, wy + F.dy * f + Ry * r]);
      }
      var good = sq.every(function (c) { return inBounds(s, c[0], c[1]) && TORNADO_OK[getTile(s, c[0], c[1])]; });
      if (!good) continue;
      sq.forEach(function (c) {
        setTile(s, c[0], c[1], 'tornado');
        var o = unitAt(s, c[0], c[1]);
        if (o && !o.stuck) { o.stuck = true; ev.push({ type: 'mud', id: o.id, cells: [c], text: '【新案】' + unitLabel(s, o) + 'は竜巻にとらわれた（次の移動は1回休み）' }); }
      });
      ctx.phrases.push(phrase || '【新案】つむじ風が育って竜巻になった');
      ev.push({ type: 'tornado', isNew: true, cells: sq, text: '【新案】竜巻が立った（2×2）' });
      return;
    }
    ctx.phrases.push('竜巻になる場所がなく、つむじ風のまま');
  }

  // 【新案・試し】火の渦: 吹いている風に火が入ると、火が風を強くして2×2の渦になって燃え上がる
  //   （風が先、火が後。火が先で風が後なら、火が風下へ広がる燃え広がり）
  //   火が入った風のマスを含む2×2のうち、風のマスを多く含むもの → 火を入れた者から見て奥 → 右 の順に選ぶ
  //   2×2の全部が空き・小さな炎・炎・風・つむじ風・森のときだけ。中の全員に一定のダメージ。火の渦は残り、ターン終了で解けて炎になる
  var WHIRL_OK = { empty: true, smallfire: true, fire: true, breeze: true, whirlwind: true, forest: true };
  function doFireWhirl(s, x, y, facing, ctx, ev) {
    var F = DIRS[facing], Rx = -F.dy, Ry = F.dx;
    var best = null;
    [[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]].forEach(function (tl) {
      var sq = [[tl[0], tl[1]], [tl[0] + 1, tl[1]], [tl[0], tl[1] + 1], [tl[0] + 1, tl[1] + 1]];
      if (!sq.every(function (c) { return inBounds(s, c[0], c[1]) && WHIRL_OK[getTile(s, c[0], c[1])]; })) return;
      var wind = sq.filter(function (c) { return getTile(s, c[0], c[1]) === 'breeze'; }).length;
      var ahead = (tl[0] + 0.5 - x) * F.dx + (tl[1] + 0.5 - y) * F.dy;   // 火を入れた者から見て奥ほど大きい
      var right = (tl[0] + 0.5 - x) * Rx + (tl[1] + 0.5 - y) * Ry;       // 右ほど大きい
      if (!best || wind > best.wind || (wind === best.wind && (ahead > best.ahead || (ahead === best.ahead && right > best.right)))) best = { sq: sq, wind: wind, ahead: ahead, right: right };
    });
    if (!best) { ctx.phrases.push('火の渦になる場所がなく、風に火が乗っただけ'); setTile(s, x, y, 'fire'); return null; }
    var cells = best.sq, cx = 0, cy = 0;
    cells.forEach(function (c) {
      cx += c[0]; cy += c[1];
      var o = unitAt(s, c[0], c[1]);
      if (o) addHit(ctx, o, B.fireWhirl.damage, 'finisher');
      setTile(s, c[0], c[1], 'firewhirl');
    });
    var fin = { name: '火の渦', cells: cells, damage: B.fireWhirl.damage };
    ctx.finishers.push(fin);
    ev.push({ type: 'finisher', name: '火の渦', isNew: true, origin: [x, y], center: [cx / 4, cy / 4], cells: cells, damage: B.fireWhirl.damage,
      text: '【新案】火の渦！ 火が風を強くして、2×2の渦になって燃え上がった（威力' + B.fireWhirl.damage + '）' });
    return fin;
  }

  // 【新案・試し】旋風の作り方: つむじ風に水が流れこむと、つながったつむじ風がまるごと竜巻になる（大きく巻くほど大きな竜巻）
  function whirlToTornado(s, x, y, ctx, ev) {
    var cells = [], seen = {}, stack = [[x, y]];
    while (stack.length) {
      var c = stack.pop(), k = key(c[0], c[1]);
      if (seen[k] || !inBounds(s, c[0], c[1]) || getTile(s, c[0], c[1]) !== 'whirlwind') continue;
      seen[k] = true;
      cells.push(c);
      stack.push([c[0] + 1, c[1]], [c[0] - 1, c[1]], [c[0], c[1] + 1], [c[0], c[1] - 1]);
    }
    cells.forEach(function (c) {
      setTile(s, c[0], c[1], 'tornado');
      var o = unitAt(s, c[0], c[1]);
      if (o && !o.stuck) { o.stuck = true; ev.push({ type: 'mud', id: o.id, cells: [c], text: '【新案】' + unitLabel(s, o) + 'は竜巻にとらわれた（次の移動は1回休み）' }); }
    });
    ctx.phrases.push('【新案】つむじ風が水を巻き上げて竜巻になった');
    ev.push({ type: 'tornado', isNew: true, cells: cells, text: '【新案】竜巻が立った（' + cells.length + 'マス）' });
  }

  // 竜巻のマス（つながった竜巻）と、そのまわり1マス
  function tornadoArea(s, x, y) {
    var body = [], seen = {}, stack = [[x, y]], kind = getTile(s, x, y);
    while (stack.length) {
      var c = stack.pop(), k = key(c[0], c[1]);
      if (seen[k] || !inBounds(s, c[0], c[1]) || getTile(s, c[0], c[1]) !== kind) continue;
      seen[k] = true; body.push(c);
      stack.push([c[0] + 1, c[1]], [c[0] - 1, c[1]], [c[0], c[1] + 1], [c[0], c[1] - 1]);
    }
    var minX = Math.min.apply(null, body.map(function (c) { return c[0]; })) - 1;
    var maxX = Math.max.apply(null, body.map(function (c) { return c[0]; })) + 1;
    var minY = Math.min.apply(null, body.map(function (c) { return c[1]; })) - 1;
    var maxY = Math.max.apply(null, body.map(function (c) { return c[1]; })) + 1;
    // まわりの輪（時計回り。左上から）
    var ring = [];
    for (var rx = minX; rx <= maxX; rx++) ring.push([rx, minY]);
    for (var ry = minY + 1; ry <= maxY; ry++) ring.push([maxX, ry]);
    for (var lx = maxX - 1; lx >= minX; lx--) ring.push([lx, maxY]);
    for (var ly = maxY - 1; ly > minY; ly--) ring.push([minX, ly]);
    return { body: body, ring: ring.filter(function (c) { return inBounds(s, c[0], c[1]); }), center: [(minX + maxX) / 2, (minY + maxY) / 2] };
  }

  // 【新案】火炎竜巻（竜巻に火）: 竜巻とまわりが一気に燃え上がる。竜巻は炎になって消える
  function doFireTornado(s, x, y, ctx, ev) {
    var area = tornadoArea(s, x, y);
    var cells = area.body.concat(area.ring);
    var burned = 0;
    cells.forEach(function (c) {
      var o = unitAt(s, c[0], c[1]);
      if (o) addHit(ctx, o, B.fireTornado.damage, 'finisher');
      var t = getTile(s, c[0], c[1]);
      if (t === 'tornado' || t === 'forest') { setTile(s, c[0], c[1], 'fire'); if (t === 'forest') burned++; }
      else if (t === 'empty' || t === 'whirlwind' || t === 'mirage') setTile(s, c[0], c[1], 'smallfire');
    });
    var fin = { name: '火炎竜巻', cells: cells, damage: B.fireTornado.damage };
    ctx.finishers.push(fin);
    ev.push({ type: 'finisher', name: '火炎竜巻', isNew: true, origin: [x, y], center: area.center, cells: cells, damage: B.fireTornado.damage,
      text: '【新案】火炎竜巻！ 竜巻が燃え上がり、まわり' + area.ring.length + 'マスを巻き込んだ' + (burned ? '（森' + burned + 'つが燃えた）' : '') });
    return fin;
  }

  // 【新案】センタクキ（竜巻に水）: 竜巻のまわりの輪がぐるっと回り（輪の長さの4分の1）、竜巻とまわりの者はもみくちゃにされる。
  //   最後に竜巻は消えて、竜巻のマスは空きに戻る（何も残らない）。輪のうち山・火山・溶岩・森・泥沼・川は動かず、飛ばして回る
  var SPIN_OK = { empty: true, puddle: true, smallfire: true, fire: true, mirage: true, whirlwind: true, ice: true };
  function doSentakuki(s, x, y, ctx, ev) {
    var kindName = tileName(getTile(s, x, y));   // 竜巻か火の渦
    var area = tornadoArea(s, x, y);
    var slots = area.ring.filter(function (c) { return SPIN_OK[getTile(s, c[0], c[1])]; });
    var hits = [];
    area.body.concat(area.ring).forEach(function (c) { var o = unitAt(s, c[0], c[1]); if (o) { hits.push(o); addHit(ctx, o, B.sentakuki.damage, 'finisher'); } });
    var shift = Math.max(1, Math.round(area.ring.length / 4));
    if (slots.length >= 2) {
      var contents = slots.map(function (c) { return { tile: getTile(s, c[0], c[1]), unit: unitAt(s, c[0], c[1]) }; });
      var moves = [];
      contents.forEach(function (c, k) {
        var to = slots[(k + shift) % slots.length];
        setTile(s, to[0], to[1], c.tile);
        if (c.unit) moves.push({ id: c.unit.id, from: [c.unit.x, c.unit.y], to: to });
      });
      moves.forEach(function (m) { var w = findUnit(s, m.id); w.x = m.to[0]; w.y = m.to[1]; });
      moves.forEach(function (m) { ev.push({ type: 'push', id: m.id, ok: true, from: m.from, to: m.to, text: unitLabel(s, findUnit(s, m.id)) + 'はセンタクキで回された' }); });
    }
    // 回し終えると竜巻は消え、何も残らない（輪は回ったまま）
    area.body.forEach(function (c) { setTile(s, c[0], c[1], 'empty'); });
    var cells = area.body.concat(area.ring);
    var fin = { name: 'センタクキ', cells: cells, damage: B.sentakuki.damage };
    ctx.finishers.push(fin);
    ev.push({ type: 'finisher', name: 'センタクキ', isNew: true, origin: [x, y], center: area.center, cells: cells, damage: B.sentakuki.damage,
      text: '【新案】センタクキ！ ' + kindName + 'のまわりがぐるっと回り、' + kindName + 'は跡形もなく消えた' });
    return fin;
  }

  // 【新案】凍結: つながった水（川・水たまり）がまとめて氷になる。凍った水たまりの上にいた者は足が凍りつく
  function doFreeze(s, sx, sy, ctx, ev) {
    var net = [], seen = {}, stack = [[sx, sy]], dist = {};
    dist[key(sx, sy)] = 0;
    var queue = [[sx, sy]];
    seen[key(sx, sy)] = true;
    while (queue.length) {
      var c = queue.shift();
      net.push(c);
      neighbors(s, c[0], c[1]).forEach(function (n) {
        var k = key(n.x, n.y);
        var tt = getTile(s, n.x, n.y);
        if (seen[k] || (tt !== 'river' && tt !== 'puddle')) return;
        seen[k] = true;
        dist[k] = dist[key(c[0], c[1])] + 1;
        queue.push([n.x, n.y]);
      });
    }
    net.forEach(function (c) {
      setTile(s, c[0], c[1], 'ice');
      var o = unitAt(s, c[0], c[1]);
      if (o && !o.stuck) { o.stuck = true; ev.push({ type: 'mud', id: o.id, cells: [[c[0], c[1]]], text: '【新案】' + unitLabel(s, o) + 'の足が氷に閉じこめられた（次の移動は1回休み）' }); }
    });
    var fin = { name: '凍結', cells: net, damage: 0, water: net.length };
    ctx.finishers.push(fin);
    ev.push({ type: 'finisher', name: '凍結', isNew: true, origin: [sx, sy], cells: net, wave: net.map(function (c) { return dist[key(c[0], c[1])]; }), damage: 0,
      text: '【新案】凍結！ つながった水' + net.length + 'マスが一気に凍った（凍った川は歩いて渡れる）' });
    return fin;
  }

  // 【新案・試し】闇（吸う）: 正面1マス
  //   撃つと、そのマスのまわり（縦横の歩数で dark.pullRange 以内）にいる者を、そのマスの方へ1マス引き寄せる
  //   （ダメージなし。自然は動かさない。もともと隣にいる者は動かない）
  //   そのマスのユニット → 直撃。森 → 命を吸って、つながった森がまとめて死の森（水を凍らせるのは、いったん外した）
  function darken(s, u, facing, ctx, ev) {
    var c = shapeCells(s, u.magic, u.x, u.y, facing)[0];
    if (!c) return;
    var x = c[0], y = c[1];
    ctx.cells.push([x, y]);
    var o = unitAt(s, x, y);
    if (o) addHit(ctx, o, u.power, 'direct');
    var moved = darkPull(s, [[x, y]], B.dark.pullRange, ev, 'は闇に引き寄せられた');
    if (moved.length) ctx.phrases.push('【新案】まわりの' + moved.length + '人を引き寄せた');
    var t = getTile(s, x, y);
    if (t === 'forest') {
      var dead = connected(s, x, y, 'forest');
      dead.forEach(function (d) { setTile(s, d[0], d[1], 'deadforest'); });
      ctx.phrases.push('【新案】森の命を吸って、つながった森' + dead.length + 'マスが死の森になった');
      ev.push({ type: 'kindle', isNew: true, cells: dead, text: '【新案】死の森' + dead.length + 'マス（火を点けるとオバケヤシキ）' });
    }
  }

  // つながった同じ自然のマス
  function connected(s, x, y, tile) {
    var out = [], seen = {}, stack = [[x, y]];
    while (stack.length) {
      var c = stack.pop(), k = key(c[0], c[1]);
      if (seen[k] || !inBounds(s, c[0], c[1]) || getTile(s, c[0], c[1]) !== tile) continue;
      seen[k] = true;
      out.push(c);
      stack.push([c[0] + 1, c[1]], [c[0] - 1, c[1]], [c[0], c[1] + 1], [c[0], c[1] - 1]);
    }
    return out;
  }

  // 引き寄せ: centers（1マス以上）から縦横の歩数で range 以内、2以上離れた者を、近い順に1マスだけ近づける
  //   上・右・下・左の順で最初に近づける向きへ。centers には入らない。通れない・ユニットがいる所へは動かない
  function darkPull(s, centers, range, ev, why) {
    var isCenter = {};
    centers.forEach(function (c) { isCenter[key(c[0], c[1])] = true; });
    var dist = function (x, y) { return Math.min.apply(null, centers.map(function (c) { return Math.abs(x - c[0]) + Math.abs(y - c[1]); })); };
    var near = s.units.filter(function (u) { var d = dist(u.x, u.y); return d >= 2 && d <= range; });
    near.sort(function (a, b) { return dist(a.x, a.y) - dist(b.x, b.y); });
    var moved = [];
    near.forEach(function (u) {
      var d0 = dist(u.x, u.y);
      var steps = DIR_ORDER.map(function (d) { return DIRS[d]; }).filter(function (D) {
        var nx = u.x + D.dx, ny = u.y + D.dy;
        return inBounds(s, nx, ny) && !isCenter[key(nx, ny)] && dist(nx, ny) < d0 && isPassable(getTile(s, nx, ny)) && !unitAt(s, nx, ny);
      });
      if (!steps.length) return;
      var from = [u.x, u.y];
      u.x += steps[0].dx; u.y += steps[0].dy;
      moved.push(u);
      ev.push({ type: 'push', id: u.id, ok: true, from: from, to: [u.x, u.y], text: '【新案】' + unitLabel(s, u) + why });
      if (getTile(s, u.x, u.y) === 'mud') enterMud(s, u, ev);
    });
    return moved;
  }

  // 【新案・試し】オバケヤシキ（死の森に火。中身はオーナーが考え中の仮）
  //   火が当たった死の森の1マスがオバケヤシキ（通れない）になる（森全部ではない）。まわり2マス以内の者を引き寄せ、
  //   引き寄せたあとでオバケヤシキの中と隣にいる全員に一定のダメージ。中にいた者はとらわれる
  function doHaunt(s, x, y, ctx, ev) {
    var house = [[x, y]];
    house.forEach(function (c) {
      setTile(s, c[0], c[1], 'haunted');
      var o = unitAt(s, c[0], c[1]);
      if (o && !o.stuck) { o.stuck = true; ev.push({ type: 'mud', id: o.id, cells: [c], text: '【新案】' + unitLabel(s, o) + 'はオバケヤシキに閉じこめられた（次の移動は1回休み）' }); }
    });
    darkPull(s, house, B.haunt.pullRange, ev, 'はオバケヤシキに引き寄せられた');
    var inHouse = {};
    house.forEach(function (c) { inHouse[key(c[0], c[1])] = true; });
    var ring = [], ringSeen = {};
    house.forEach(function (c) {
      neighbors(s, c[0], c[1]).forEach(function (n) {
        var k = key(n.x, n.y);
        if (inHouse[k] || ringSeen[k]) return;
        ringSeen[k] = true; ring.push([n.x, n.y]);
      });
    });
    var cells = house.concat(ring), cx = 0, cy = 0;
    house.forEach(function (c) { cx += c[0]; cy += c[1]; });
    cells.forEach(function (c) { var o = unitAt(s, c[0], c[1]); if (o) addHit(ctx, o, B.haunt.damage, 'finisher'); });
    var fin = { name: 'オバケヤシキ', cells: cells, damage: B.haunt.damage };
    ctx.finishers.push(fin);
    ev.push({ type: 'finisher', name: 'オバケヤシキ', isNew: true, origin: [x, y], center: [cx / house.length, cy / house.length], cells: cells, damage: B.haunt.damage,
      text: '【新案】オバケヤシキ！ 死の森に火が灯り、まわりの者を引き寄せておどかした（威力' + B.haunt.damage + '）' });
    return fin;
  }

  // 流れる（水）
  //   【新案】水だけなら正面に小さな池（waterLength マス）。山に当たると山を下って、盤の端まで川になる（源流）
  function flow(s, u, facing, ctx, ev) {
    var F = DIRS[facing];
    var made = 0, pond = 0, stop = null, sourced = false, tornadoHit = null, whirlHit = null;
    for (var i = 1; ; i++) {
      if (!sourced && i > B.waterLength) break;
      var x = u.x + F.dx * i, y = u.y + F.dy * i;
      if (!inBounds(s, x, y)) { if (sourced) stop = '盤の端まで流れた'; break; }
      ctx.cells.push([x, y]);
      var o = unitAt(s, x, y);
      var t = getTile(s, x, y);
      if (o) { addHit(ctx, o, u.power, 'direct'); stop = unitLabel(s, o) + 'に当たって止まった'; break; }
      if (t === 'mountain') {
        if (!sourced) {
          sourced = true;
          if (made) ctx.phrases.push('池ができた（' + made + 'マス）');
          ctx.phrases.push('【新案】山に当たって川になった');
          pond = made; made = 0;
        }
        continue;
      }
      if (t === 'empty' || t === 'puddle' || t === 'mirage') { setTile(s, x, y, 'river'); made++; continue; }
      if (t === 'river' || t === 'ice') continue;
      if (t === 'lava') { setTile(s, x, y, 'mountain'); stop = '【新案】溶岩が冷えて山になった'; break; }
      if (t === 'firewhirl') { stop = '【新案】火の渦に水が入った'; tornadoHit = [x, y]; break; }
      if (t === 'tornado') {
        if (B.tornadoRecipe === 'windWind') { stop = '【新案】竜巻に水が入った'; tornadoHit = [x, y]; }
        else stop = '【新案】竜巻に水が吸いこまれた';
        break;
      }
      // 【新案】つむじ風に水が流れこむと、水を巻き上げて竜巻に育つ（tornadoRecipe が windWater・senpu のとき）
      if (t === 'whirlwind' && (B.tornadoRecipe === 'windWater' || B.tornadoRecipe === 'senpu')) { whirlHit = [x, y]; ctx.cells.push([x, y]); stop = null; break; }
      if (t === 'fire' || t === 'smallfire') { setTile(s, x, y, 'empty'); stop = tileName(t) + 'を消して止まった'; break; }
      stop = tileName(t) + 'で止まった';
      break;
    }
    if (made) ctx.phrases.push(sourced ? '川が' + made + 'マス流れた' : '池ができた（' + made + 'マス）');
    if (stop) ctx.phrases.push(stop);
    if (!made && !pond && !stop && !sourced) ctx.phrases.push('水の上を流れた');
    if (tornadoHit) doSentakuki(s, tornadoHit[0], tornadoHit[1], ctx, ev);
    if (whirlHit && B.tornadoRecipe === 'senpu') whirlToTornado(s, whirlHit[0], whirlHit[1], ctx, ev);
    else if (whirlHit) growTornado(s, whirlHit[0], whirlHit[1], facing, ctx, ev, '【新案】つむじ風が水を巻き上げて竜巻になった');
  }

  // 吹き抜ける（風）＝ 運ぶ
  function blow(s, u, facing, ctx, ev) {
    var F = DIRS[facing];
    var path = [];
    var origin = null, volcano = null, whirl = null, blocked = false;
    var breezeMode = B.windMode === 'breeze';
    for (var i = 1; i <= (breezeMode ? B.breezeLength : B.lineLength); i++) {
      var x = u.x + F.dx * i, y = u.y + F.dy * i;
      if (!inBounds(s, x, y)) break;
      var t = getTile(s, x, y);
      if (t === 'mountain') { ctx.phrases.push('山の陰で風が止まった'); blocked = true; break; }   // 溶岩は低いので、風はその上を吹き抜ける
      if (t === 'tornado') { ctx.phrases.push('【新案】風が竜巻に吸いこまれた'); blocked = true; break; }
      if (t === 'whirlwind' && B.tornadoRecipe === 'windWind') { whirl = [x, y]; ctx.cells.push([x, y]); break; }
      if (t === 'sakura' || (t === 'volcano' && B.sakura.from === 'fire')) { volcano = [x, y]; ctx.cells.push([x, y]); break; }
      if (t === 'volcano') { ctx.phrases.push('火山の陰で風が止まった'); blocked = true; break; }
      if (t === 'haunted') { ctx.phrases.push('オバケヤシキで風が止まった'); blocked = true; break; }
      if (t === 'fire' || t === 'smallfire' || t === 'firewhirl') { origin = [x, y]; ctx.cells.push([x, y]); break; }
      path.push([x, y]);
      ctx.cells.push([x, y]);
      if (B.ideas.windClearsMirage && t === 'mirage') { setTile(s, x, y, 'empty'); ctx.phrases.push('【新案】風で蜃気楼が晴れた'); }
    }
    // 【新案】水を運ぶ: 通り道の川は水たまりになり、その川より風下の通り道の空きも水たまりになる
    var firstRiver = -1;
    path.forEach(function (c, j) { if (firstRiver < 0 && getTile(s, c[0], c[1]) === 'river') firstRiver = j; });
    if (firstRiver >= 0) {
      var wet = 0;
      for (var j = firstRiver; j < path.length; j++) {
        var tt = getTile(s, path[j][0], path[j][1]);
        if (tt === 'river' || tt === 'empty') { setTile(s, path[j][0], path[j][1], 'puddle'); wet++; }
      }
      ctx.phrases.push('【新案】川の水を' + F.name + 'へ運んだ（水たまり' + wet + 'マス）');
    }
    // 遠いマスから順にユニットを運ぶ
    for (var k = path.length - 1; k >= 0; k--) {
      var cx = path[k][0], cy = path[k][1];
      var nx = cx + F.dx, ny = cy + F.dy;
      var o = unitAt(s, cx, cy);
      if (!o) continue;
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
        // 【新案】氷の上は滑る: 氷が途切れるか、次のマスに進めなくなるまで滑り続ける
        if (B.ideas.iceSlide && getTile(s, nx, ny) === 'ice') {
          var slid = 0, from0 = [nx, ny];
          while (getTile(s, o.x, o.y) === 'ice') {
            var sx = o.x + F.dx, sy = o.y + F.dy;
            if (!inBounds(s, sx, sy) || !isPassable(getTile(s, sx, sy)) || unitAt(s, sx, sy)) break;
            o.x = sx; o.y = sy; slid++;
          }
          if (slid) ev.push({ type: 'push', id: o.id, ok: true, from: from0, to: [o.x, o.y], text: '【新案】' + unitLabel(s, o) + 'は氷の上を' + slid + 'マス滑った' });
        }
        if (getTile(s, o.x, o.y) === 'mud') enterMud(s, o, ev);
      }
    }
    if (whirl) {
      growTornado(s, whirl[0], whirl[1], facing, ctx, ev);
    } else if (breezeMode) {
      // 【新案・試し】風の形のマスに、風が残る（空きだけ。ユニットがいてもよい）。ターン終了で消える
      if (!origin && !volcano) {
        var left = 0;
        path.forEach(function (c) { if (getTile(s, c[0], c[1]) === 'empty') { setTile(s, c[0], c[1], 'breeze'); left++; } });
        if (left) ctx.phrases.push('【新案】風が' + left + 'マス吹いている（ターン終了まで）');
      }
    } else if (!origin && !volcano && path.length && (B.tornadoRecipe === 'windWater' || B.tornadoRecipe === 'windWind')) {
      // 【新案】吹き抜けた先の最後のマスに、つむじ風が残る（空きで、ユニットがいないときだけ）
      var end = path[path.length - 1];
      if (getTile(s, end[0], end[1]) === 'empty' && !unitAt(s, end[0], end[1])) {
        setTile(s, end[0], end[1], 'whirlwind');
        ctx.phrases.push('【新案】吹き抜けた先につむじ風が残った');
      }
    }
    if (origin) {
      ctx.phrases.push(tileName(getTile(s, origin[0], origin[1])) + 'に風が当たった');
      doSpread(s, origin[0], origin[1], facing, ctx, ev);
    } else if (volcano) {
      ctx.phrases.push('【新案】' + tileName(getTile(s, volcano[0], volcano[1])) + 'に風が当たった');
      doEruption(s, volcano[0], volcano[1], facing, ctx, ev);
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
    else if (u.magic === 'thunder') strike(s, u, facing, ctx, ev);
    else if (u.magic === 'ice') chill(s, u, facing, ctx, ev);
    else if (u.magic === 'dark') darken(s, u, facing, ctx, ev);
    else placeOrIgnite(s, u, facing, ctx, ev);
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
    else if (su.magic === 'thunder') strike(sim, su, dir, ctx, ev);
    else if (su.magic === 'ice') chill(sim, su, dir, ctx, ev);
    else if (su.magic === 'dark') darken(sim, su, dir, ctx, ev);
    else placeOrIgnite(sim, su, dir, ctx, ev);
    var allyHits = 0;
    ctx.order.forEach(function (id) {
      var t = findUnit(sim, id);
      if (t && t.side === 'ally' && ctx.hits[id].amount > 0 && !hidden(s, s.units.filter(function (x) { return x.id === id; })[0])) allyHits++;
    });
    return { allyHits: allyHits, ctx: ctx };
  }

  // 敵がどう動いてどの向きに撃つか
  // 【新案】蜃気楼の中にいる者は、敵から見つからない
  function hidden(s, u) { return !!u && getTile(s, u.x, u.y) === 'mirage'; }

  function planEnemy(s, e) {
    if (!alliesOf(s).length) return null;
    var allies = alliesOf(s).filter(function (a) { return !hidden(s, a); });
    if (!allies.length) return { to: [e.x, e.y], dir: e.facing, dist: 0, kind: 'lost' };
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
    if (plan.kind === 'lost') {
      ev.push({ type: 'info', id: e.id, text: '【新案】' + unitLabel(s, e) + 'は味方を見失った（蜃気楼）' });
      if (e.stuck) e.stuck = false;
      step();
      return;
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
        if (neighbors(s, x, y).some(function (n) { var nt = getTile(s, n.x, n.y); return nt === 'fire' || nt === 'firewhirl'; })) out.push([x, y]);
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
      if (getTile(s, u.x, u.y) === 'fire' || getTile(s, u.x, u.y) === 'firewhirl') {
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
    // 【新案・試し】花びらが散る
    var fallen = [];
    for (var py = 0; py < s.size; py++) {
      for (var px = 0; px < s.size; px++) {
        if (getTile(s, px, py) === 'petals') { setTile(s, px, py, 'empty'); fallen.push([px, py]); }
      }
    }
    if (fallen.length) ev.push({ type: 'smallfireOut', cells: fallen, text: '【新案】花びらが散った（' + fallen.length + 'マス）' });
    // 【新案・試し】吹いていた風がやむ
    var calm = [];
    for (var by = 0; by < s.size; by++) {
      for (var bx = 0; bx < s.size; bx++) {
        if (getTile(s, bx, by) === 'breeze') { setTile(s, bx, by, 'empty'); calm.push([bx, by]); }
      }
    }
    if (calm.length) ev.push({ type: 'smallfireOut', cells: calm, text: '【新案】吹いていた風がやんだ（' + calm.length + 'マス）' });
    var undone = [];
    for (var wy = 0; wy < s.size; wy++) {
      for (var wx = 0; wx < s.size; wx++) {
        if (getTile(s, wx, wy) === 'firewhirl') { setTile(s, wx, wy, 'fire'); undone.push([wx, wy]); }
      }
    }
    if (undone.length) ev.push({ type: 'fireSpread', cells: undone, text: '【新案】火の渦が解けて炎になった（' + undone.length + 'マス）' });
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

  // 【新案・仮】あと一手のヒント（balance.js の nextHints）
  //   盤面のその自然のかたまりごとに { name, magic, tile, cells, shooters } を返す
  //   shooters: まだ撃っていない味方のうち、このターンの1発でその決め手を起こせる者と、その立ち位置・向き
  function nextHints(s) {
    var out = [];
    if (s.result) return out;
    (B.nextHints || []).forEach(function (h) {
      if (h.recipe && [].concat(h.recipe).indexOf(B.tornadoRecipe) < 0) return;
      var seen = {};
      for (var y = 0; y < s.size; y++) {
        for (var x = 0; x < s.size; x++) {
          if (seen[key(x, y)] || getTile(s, x, y) !== h.tile) continue;
          var cells = [], stack = [[x, y]], inComp = {};
          while (stack.length) {
            var c = stack.pop();
            var k = key(c[0], c[1]);
            if (seen[k] || !inBounds(s, c[0], c[1]) || getTile(s, c[0], c[1]) !== h.tile) continue;
            seen[k] = true; inComp[k] = true;
            cells.push(c);
            stack.push([c[0] + 1, c[1]], [c[0] - 1, c[1]], [c[0], c[1] + 1], [c[0], c[1] - 1]);
          }
          var shooters = [];
          alliesOf(s).forEach(function (a) {
            if (a.acted || a.magic !== h.magic) return;
            var found = null;
            reachInfo(s, a).order.some(function (pos) {
              return DIR_ORDER.some(function (dir) {
                var p = previewAct(s, a.id, pos, dir);
                var hit = p.finishers.some(function (f) {
                  return f.name === h.name && f.cells.some(function (fc) { return inComp[key(fc[0], fc[1])]; });
                });
                if (hit) found = { id: a.id, to: pos, dir: dir };
                return hit;
              });
            });
            if (found) shooters.push(found);
          });
          out.push({ name: h.name, magic: h.magic, tile: h.tile, cells: cells, shooters: shooters });
        }
      }
    });
    return out;
  }

  // 敵の予告とターン終了の予告（今の盤面で、いまターン終了したら何が起きるか）
  function forecast(s) {
    var out = { enemies: [], fireSpread: [], burn: [], enemyDamage: [] };
    if (s.result) return out;
    out.fireSpread = fireSpreadCells(s);
    s.units.forEach(function (u) {
      if (getTile(s, u.x, u.y) === 'fire' || getTile(s, u.x, u.y) === 'firewhirl') out.burn.push({ id: u.id, x: u.x, y: u.y });
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
  //   . 空き  F 森  M 山  R 川  X 炎  s 小さな炎  V 火山  D 泥沼  P 水たまり  H 蜃気楼  I 氷  L 溶岩  W つむじ風  T 竜巻
  // ---------------------------------------------------------------
  var CH = { '.': 'empty', F: 'forest', M: 'mountain', R: 'river', X: 'fire', s: 'smallfire', V: 'volcano', D: 'mud', P: 'puddle', H: 'mirage', I: 'ice', L: 'lava', W: 'whirlwind', T: 'tornado', B: 'breeze', Q: 'firewhirl', K: 'sakura', p: 'petals', G: 'deadforest', O: 'haunted' };
  var PRESETS = [
    {
      id: 'spread', name: '燃え広がり',
      desc: '味方 草・火・風、敵1体（火）。森を並べて敵ごと燃やす練習。',
      rows: ['......', '.....M', '......', '......', '......', '......'],
      allies: [['grass', 1, 5], ['fire', 3, 5], ['wind', 4, 5]],
      enemies: [['fire', 2, 0]]
    },
    {
      id: 'fireEnemy', name: '火の敵',
      desc: '味方 火・水・風、敵2体（火）。盤面に森が少しある。敵の火を利用するか消すか。',
      rows: ['......', '......', '.F..F.', '.FF.F.', '......', '......'],
      allies: [['fire', 0, 5], ['water', 2, 5], ['wind', 3, 5]],
      enemies: [['fire', 1, 0], ['fire', 4, 0]]
    },
    {
      id: 'source', name: '【新案】源流と感電', isNew: true,
      desc: '【新案】味方 土・水・雷、敵1体（火）。山に水を当てると端まで届く川になる。川に雷を走らせると、川に触れている全員が感電。',
      rows: ['......', '......', '......', '......', '......', '......'],
      allies: [['earth', 1, 5], ['water', 3, 5], ['thunder', 4, 5]],
      enemies: [['fire', 2, 0]]
    },
    {
      id: 'shock', name: '【新案】風と水と雷', isNew: true,
      desc: '【新案】味方 水・風・雷、敵1体（火）。風で川の水を運んで盤面を濡らし、雷を走らせて一気に感電させる。',
      rows: ['......', '......', '......', '......', '......', '......'],
      allies: [['water', 1, 5], ['wind', 3, 5], ['thunder', 4, 5]],
      enemies: [['fire', 2, 0]]
    },
    {
      id: 'dark', name: '【新案・試し】闇（草・闇・火）', isNew: true,
      desc: '【新案・試し】味方 草・闇・火、敵2体（火）。闇（吸う）は正面1マス。撃つと、まわり2マス以内の者をそのマスの方へ1マス引き寄せる。森に撃つと、つながった森がまとめて死の森。死の森に火を点けると、その1マスがオバケヤシキ（仮）: まわりの者を引き寄せて、中と隣の全員に5。',
      rows: ['......', '......', '......', '......', '......', '......'],
      allies: [['grass', 1, 5], ['dark', 2, 5], ['fire', 4, 5]],
      enemies: [['fire', 2, 0], ['fire', 4, 2]]
    },
    {
      id: 'sakuraGrass', name: '【新案・試し】桜（土・草・風）', isNew: true, sakuraFrom: 'grass',
      desc: '【新案・試し】味方 土・草・風、敵1体（火）。山に草を植えると桜が咲く。桜に風を当てると、花びらが扇形に舞い散る桜吹雪。読み込むと「桜吹雪の起こし方」が桜に切り替わる。',
      rows: ['......', '.F..F.', '......', '......', '......', '......'],
      allies: [['earth', 1, 5], ['grass', 3, 5], ['wind', 4, 5]],
      enemies: [['fire', 2, 0]]
    },
    {
      id: 'sakura', name: '【新案】桜吹雪（火山）', isNew: true, sakuraFrom: 'fire',
      desc: '【新案】味方 土・火・風、敵1体（火）。山に火で火山、火山に風で火の粉が扇形に舞う。森に落ちれば燃え出す。',
      rows: ['......', '.F..F.', '......', '......', '......', '......'],
      allies: [['earth', 1, 5], ['fire', 3, 5], ['wind', 4, 5]],
      enemies: [['fire', 2, 0]]
    },
    {
      id: 'ice', name: '【新案】凍結', isNew: true,
      desc: '【新案】味方 土・水・氷、敵1体（火）。山から川を何本も流して盤面を水で区切り、氷で一気に凍らせる。凍った川は歩いて渡れる道になる。',
      rows: ['......', '......', '......', '......', '......', '......'],
      allies: [['earth', 1, 5], ['water', 3, 5], ['ice', 4, 5]],
      enemies: [['fire', 2, 0]]
    },
    {
      id: 'breeze', name: '【新案・試し】風に火（火の渦）', isNew: true, windMode: 'breeze',
      desc: '【新案・試し】味方 風・火・水、敵1体（火）。風は正面2マスに吹いて、そのマスに風が残る（ターン終了で消える）。風が吹いている所に火を入れると火の渦。火が先で風が後なら、今までどおり燃え広がり。読み込むと「風の形」が2マスに切り替わる。',
      rows: ['......', '.F....', '......', '......', '......', '......'],
      allies: [['wind', 2, 5], ['fire', 4, 5], ['water', 1, 4]],
      enemies: [['fire', 2, 2]]
    },
    {
      id: 'senpu', name: '【新案・試し】旋風（旋風・火・水）', isNew: true, hidden: true, recipe: 'senpu',
      desc: '【新案・試し】味方 旋風・火・水、敵1体（火）。旋風（巻く）は正面の2×2につむじ風を巻く。つむじ風に水で竜巻、竜巻に火でセンタクキ。読み込むと「竜巻の作り方」が旋風に切り替わる。',
      rows: ['......', '.F....', '......', '......', '......', '......'],
      allies: [['senpu', 2, 5], ['fire', 4, 5], ['water', 1, 4]],
      enemies: [['fire', 3, 0]]
    },
    {
      id: 'storm', name: '【新案】竜巻', isNew: true, hidden: true, recipe: 'windWater',
      desc: '【新案】味方 風・火・水、敵1体（火）。風を撃つと吹き抜けた先につむじ風が残る。つむじ風に水で2×2の竜巻、竜巻に火でセンタクキ（上のバーで元の作り方「風→風で竜巻、火で火炎竜巻、水でセンタクキ」に切り替えられる）。',
      rows: ['......', '.F....', '......', '......', '......', '......'],
      allies: [['wind', 2, 5], ['fire', 4, 5], ['water', 1, 4]],
      enemies: [['fire', 3, 0]]
    },
    {
      id: 'funka', name: '【新案】噴火（8×8）', isNew: true, sakuraFrom: 'fire',
      desc: '【新案】味方 土・火・風、敵1体（火）。土で山脈を盛り、離れてから火を点けると、山脈ごと噴火して溶岩が外へあふれる（山脈が大きいほど遠くまで）。溶岩の上を風が吹き抜けて火山に当たると桜吹雪。',
      rows: ['........', '........', '........', '........', '........', '........', '........', '........'],
      allies: [['earth', 2, 7], ['fire', 5, 5], ['wind', 1, 0]],
      enemies: [['fire', 0, 7]]
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
    hidden: hidden,
    clone: clone, inBounds: inBounds, getTile: getTile, setTile: setTile, isPassable: isPassable,
    unitAt: unitAt, findUnit: findUnit, alliesOf: alliesOf, enemiesOf: enemiesOf,
    unitLabel: unitLabel, tileName: tileName, magicName: magicName,
    rotate: rotate, shapeCells: shapeCells,
    createState: createState, addAlly: addAlly, addEnemy: addEnemy,
    reachableCells: reachableCells, act: act, allAlliesActed: allAlliesActed, endTurn: endTurn,
    planEnemy: planEnemy, previewAct: previewAct, guideMap: guideMap, nextHints: nextHints, forecast: forecast,
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
