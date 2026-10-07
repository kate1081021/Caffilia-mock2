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
    hill:      { name: '丘',       label: '丘', passable: true  },   // 【育つ】土の一段目。入ると止まる。上から撃つと形が1マス先へ（高台）
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

  // お題（IMPROVE_mission）
  //   annihilate: 敵の全滅（元の戦闘）／defense: 防衛（村を守る）／escort: 護衛（馬車をゴールへ）／retrieve: 奪取（宝を帰り口へ）
  var MISSION_INFO = {
    annihilate: { name: '戦闘' },
    defense:    { name: '防衛' },
    escort:     { name: '護衛' },
    retrieve:   { name: '奪取' }
  };
  var MISSIONS = Object.keys(MISSION_INFO);
  // 置きもの。fixed: 風で押されない・引き寄せられない
  var OBJECT_INFO = {
    village: { name: '村',   fixed: true },
    wagon:   { name: '馬車', fixed: false }
  };


  // ---------------------------------------------------------------
  // 小さな道具
  // ---------------------------------------------------------------
  function clone(s) { return JSON.parse(JSON.stringify(s)); }
  function inBounds(s, x, y) { return x >= 0 && y >= 0 && x < s.size && y < s.size; }
  function idx(s, x, y) { return y * s.size + x; }
  function getTile(s, x, y) { return s.tiles[idx(s, x, y)]; }
  function setTile(s, x, y, t) {
    var i = idx(s, x, y);
    if (s.tiles[i] !== t && s.fireAge && s.fireAge[i] !== undefined) delete s.fireAge[i];
    s.tiles[i] = t;
  }
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
  // お題の置きもの（村・馬車）。自然ではなく、ユニットと同じ法則に従う（直撃・決め手・炎の上・風）
  function objectsOf(s, kind) { return s.units.filter(function (u) { return u.side === 'object' && (!kind || u.kind === kind); }); }
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
    if (u.side === 'object') {
      var kin = objectsOf(s, u.kind);
      return OBJECT_INFO[u.kind].name + (kin.length > 1 ? (kin.indexOf(u) + 1) : '');
    }
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

  // 魔法の起点。【育つ】丘の上（高台）から撃つと、正面へ1マス先から撃ったことになる
  function castOrigin(s, u, facing) {
    if (getTile(s, u.x, u.y) !== 'hill') return { x: u.x, y: u.y };
    var F = DIRS[facing];
    return { x: u.x + F.dx, y: u.y + F.dy };
  }
  // 術者 u が facing へ撃つ魔法の形のマス
  function castCells(s, u, facing) {
    var o = castOrigin(s, u, facing);
    return shapeCells(s, u.magic, o.x, o.y, facing);
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
  function unitConf(u) { return u.side === 'ally' ? B.ally : u.side === 'enemy' ? B.enemy : { hp: B.mission[u.kind].hp, power: 0, move: 0 }; }
  function makeUnit(s, side, magic, x, y, facing) {
    s.seq = (s.seq || 0) + 1;
    var conf = side === 'ally' ? B.ally : B.enemy;
    var u = {
      id: (side === 'ally' ? 'P' : 'E') + s.seq, side: side, magic: magic,
      hp: conf.hp, maxHp: conf.hp, power: conf.power, move: conf.move,
      x: x, y: y, facing: facing || (side === 'ally' ? 'up' : 'down'),
      stuck: false, acted: false,
      burn: 0               // 火傷の残り回数（ターン終了ごとにダメージ）
    };
    if (side === 'enemy') {
      var used = enemiesOf(s).map(function (e) { return e.letter; });
      var letter = 'A';
      for (var i = 0; i < ENEMY_LETTERS.length; i++) {
        if (used.indexOf(ENEMY_LETTERS[i]) < 0) { letter = ENEMY_LETTERS[i]; break; }
      }
      u.letter = letter;
      u.name = '敵' + letter;
      u.aim = B.enemy.aim;
      u.avoid = B.enemy.avoid;
      u.cross = B.enemy.cross;
      u.intent = false;     // 予告中か（予告は今の位置と向きに固定）
    }
    return u;
  }

  // 敵の個性
  var PERSONA = {
    aim:   { count: '人数', near: '近い人', nature: '自然', target: '的' },
    avoid: { wall: '通れない所だけ', danger: '危ない所も' },
    cross: { none: 'なし', river: '川を渡る' }
  };
  // 「危ない所も避ける」敵が避けるマス
  var DANGER = { fire: true, smallfire: true, mud: true, lava: true, firewhirl: true };

  // u が自分の足で入れるマスか（個性で変わる。押されて動くときは使わない）
  function canEnter(u, tile) {
    if (u && u.side === 'enemy') {
      if (u.cross === 'river' && (tile === 'river' || tile === 'puddle')) return true;
      if (u.avoid === 'danger' && DANGER[tile]) return false;
    }
    return isPassable(tile);
  }

  // 敵だけの魔法（シナリオごとの一覧があればそれ、なければ balance.js）
  function enemyOnlyMagics(s) { return (s && s.enemyOnlyMagics) || B.enemyOnlyMagics || []; }
  function allyMagics(s) { var only = enemyOnlyMagics(s); return MAGICS.filter(function (m) { return only.indexOf(m) < 0; }); }
  function addAlly(s, magic, x, y, facing) { var u = makeUnit(s, 'ally', magic, x, y, facing); s.units.push(u); return u; }
  function addEnemy(s, magic, x, y, facing) { var u = makeUnit(s, 'enemy', magic || B.enemy.defaultMagic, x, y, facing); s.units.push(u); return u; }
  function addObject(s, kind, x, y) {
    s.seq = (s.seq || 0) + 1;
    var hpMax = B.mission[kind].hp;
    var u = { id: 'O' + s.seq, side: 'object', kind: kind, magic: null, hp: hpMax, maxHp: hpMax, power: 0, move: 0,
      x: x, y: y, facing: 'up', stuck: false, acted: false, burn: 0 };
    s.units.push(u);
    return u;
  }
  function isFixed(u) { return u.side === 'object' && OBJECT_INFO[u.kind].fixed; }

  // お題の状態。goal: 馬車のゴール、exit: 帰り口、treasure: 落ちている宝の位置（持たれていたら null）、carrier: 宝を持つ味方の id、lost: 壊れた村の数
  function newMission(type) {
    return { type: MISSION_INFO[type] ? type : 'annihilate', goal: [], exit: [], treasure: null, carrier: null, lost: 0 };
  }
  function missionType(s) { return (s.mission && s.mission.type) || 'annihilate'; }
  function inCells(list, x, y) { return (list || []).some(function (c) { return c[0] === x && c[1] === y; }); }

  function blankState(size, enemyActs) {
    size = clampSize(size);
    var s = { version: 2, size: size, tiles: [], units: [], enemyActs: enemyActs !== false, turn: 1, result: null, seq: 0, fireAge: {}, mission: newMission('annihilate') };
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

  var SRC_NOTE = { finisher: '', weakfire: '（弱い炎）' };
  function applyHits(s, ctx, ev) {
    ctx.order.forEach(function (id) {
      var u = findUnit(s, id);
      if (!u) return;
      var h = ctx.hits[id];
      u.hp -= h.amount;
      ev.push({
        type: 'damage', id: u.id, side: u.side, amount: h.amount, src: h.src, cells: [[u.x, u.y]],
        text: unitLabel(s, u) + 'に' + h.amount + 'ダメージ' + (SRC_NOTE[h.src] !== undefined ? SRC_NOTE[h.src] : '（直撃）') + '（残りHP ' + Math.max(0, u.hp) + '）'
      });
      // 弱い炎に当たった者は火傷（重ねても残りの回数が最大に戻るだけ）
      if (h.src === 'weakfire' && u.hp > 0) {
        u.burn = B.fire.burnTurns;
        ev.push({ type: 'burnStatus', id: u.id, cells: [[u.x, u.y]], text: unitLabel(s, u) + 'は火傷を負った（ターン終了ごとに' + B.fire.burnDamage + '、あと' + u.burn + '回）' });
      }
    });
    removeDead(s, ev);
    checkResult(s, ev);
  }

  function removeDead(s, ev) {
    var dead = s.units.filter(function (u) { return u.hp <= 0; });
    dead.forEach(function (u) {
      var verb = u.side === 'object' ? 'は壊れた' : 'は倒れた';
      ev.push({ type: 'death', side: u.side, kind: u.kind, id: u.id, text: unitLabel(s, u) + verb, cells: [[u.x, u.y]] });
      var m = s.mission;
      if (u.kind === 'village' && m) m.lost = (m.lost || 0) + 1;
      // 宝を持つ味方が倒れたら、宝はそのマスに落ちる（ほかの味方が拾える）
      if (m && m.carrier === u.id) {
        m.carrier = null;
        m.treasure = [u.x, u.y];
        ev.push({ type: 'treasure', cells: [[u.x, u.y]], text: '宝が (' + u.x + ',' + u.y + ') に落ちた' });
      }
    });
    s.units = s.units.filter(function (u) { return u.hp > 0; });
    return dead;
  }

  function setResult(s, ev, result, text) {
    s.result = result;
    s.resultText = text;
    ev.push({ type: 'result', result: result, text: text });
  }

  // 勝敗。どのお題でも、味方が全員倒れたら負け。負けを先に見る（同じ1発で村が壊れて敵が全滅しても負け）
  function checkResult(s, ev) {
    if (s.result) return;
    var type = missionType(s), m = s.mission || {};
    var enemyDied = ev.some(function (e) { return e.type === 'death' && e.side === 'enemy'; });
    var allyDied = ev.some(function (e) { return e.type === 'death' && e.side === 'ally'; });
    if (allyDied && alliesOf(s).length === 0) { setResult(s, ev, 'lose', '味方が全員倒れた…（敗北）'); return; }
    if (type === 'defense' && (m.lost || 0) >= B.mission.defense.loseAt) { setResult(s, ev, 'lose', '村が壊された…（敗北）'); return; }
    if (type === 'escort' && ev.some(function (e) { return e.type === 'death' && e.kind === 'wagon'; }) && !objectsOf(s, 'wagon').length) {
      setResult(s, ev, 'lose', '馬車が壊された…（敗北）'); return;
    }
    if (type === 'escort') {
      var w = objectsOf(s, 'wagon')[0];
      if (w && inCells(m.goal, w.x, w.y)) { setResult(s, ev, 'win', '馬車がゴールに着いた！（勝利）'); return; }
    }
    if ((type === 'annihilate' || type === 'defense') && enemyDied && enemiesOf(s).length === 0) {
      setResult(s, ev, 'win', '敵を全員倒した！（勝利）');
    }
  }

  // 水か氷が当たると、火傷が治る
  function cureBurn(s, u, ctx) {
    if (u && u.burn > 0) { u.burn = 0; ctx.phrases.push(unitLabel(s, u) + 'の火傷が治った'); }
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
    cells.forEach(function (c) {
      var u = unitAt(s, c[0], c[1]);
      if (!u) return;
      if (burned[key(c[0], c[1])]) addHit(ctx, u, B.fire.strongDamage, 'finisher');
      else addHit(ctx, u, B.fire.weakDamage, 'weakfire');
    });
    var amount = burnedList.length ? B.fire.strongDamage : B.fire.weakDamage;
    var fin = { name: '燃え広がり', cells: cells, strong: burnedList.slice(), damage: amount, forests: burnedList.length };
    ctx.finishers.push(fin);
    ev.push({
      type: 'finisher', name: '燃え広がり', cells: cells, strong: burnedList.slice(), damage: amount, forests: burnedList.length,
      text: '燃え広がり！ ' + DIRS[dir].name + 'へ' + path.length + 'マス走り、' +
        (burnedList.length ? '森' + burnedList.length + 'つが燃えた（燃えた森の上は威力' + B.fire.strongDamage + '、ほかは' + B.fire.weakDamage + '＋火傷）'
          : '燃えた森はなし（弱い炎: 威力' + B.fire.weakDamage + '＋火傷）')
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
    castCells(s, u, facing).forEach(function (c) {
      var x = c[0], y = c[1];
      ctx.cells.push([x, y]);
      var o = unitAt(s, x, y);
      if (o) addHit(ctx, o, u.power, 'direct');
      var t = getTile(s, x, y);
      if (u.magic === 'grass') {
        if (!o && t === 'empty') { setTile(s, x, y, 'forest'); ctx.phrases.push('森ができた'); planted.push([x, y]); }
        else if (!o && t === 'mountain' && B.sakura.from === 'grass') { setTile(s, x, y, 'sakura'); ctx.phrases.push('【新案】山に桜が咲いた'); }
      } else if (u.magic === 'earth') {
        // 【育つ】入のときは、空きに土で丘、丘に土で山に育つ。火を埋めても丘
        var low = B.grow.enabled ? 'hill' : 'mountain';
        if (!o && t === 'empty') { setTile(s, x, y, low); ctx.phrases.push(tileName(low) + 'ができた'); }
        else if (!o && t === 'hill' && B.grow.enabled) { setTile(s, x, y, 'mountain'); ctx.phrases.push('【育つ】丘が山に育った'); }
        else if (!o && (t === 'river' || t === 'puddle')) { setTile(s, x, y, 'mud'); ctx.phrases.push(tileName(t) + 'が泥沼になった'); }
        else if (!o && B.ideas.earthSmother && (t === 'fire' || t === 'smallfire')) { setTile(s, x, y, low); ctx.phrases.push('【新案】土をかぶせて' + tileName(t) + 'を消した（' + tileName(low) + 'になった）'); }
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
    var cells = castCells(s, u, facing);
    for (var i = 0; i < cells.length; i++) {
      var x = cells[i][0], y = cells[i][1];
      ctx.cells.push([x, y]);
      var o = unitAt(s, x, y);
      var t = getTile(s, x, y);
      var tall = o || t === 'forest' || t === 'mountain' || t === 'hill' || t === 'volcano' || t === 'sakura' || t === 'deadforest' || t === 'haunted';
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
    var cells = castCells(s, u, facing);
    for (var i = 0; i < cells.length; i++) {
      var x = cells[i][0], y = cells[i][1];
      ctx.cells.push([x, y]);
      var o = unitAt(s, x, y);
      var t = getTile(s, x, y);
      if (t === 'river' || t === 'puddle') {
        if (o) { addHit(ctx, o, u.power, 'direct'); cureBurn(s, o, ctx); }
        ctx.phrases.push('【新案】冷気が' + tileName(t) + 'に触れた');
        doFreeze(s, x, y, ctx, ev);
        return;
      }
      if (o) {
        addHit(ctx, o, u.power, 'direct');
        cureBurn(s, o, ctx);
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
    var cells = best.sq, cx = 0, cy = 0, strong = [];
    cells.forEach(function (c) {
      cx += c[0]; cy += c[1];
      var wasForest = getTile(s, c[0], c[1]) === 'forest';
      if (wasForest) strong.push(c);
      var o = unitAt(s, c[0], c[1]);
      if (o) addHit(ctx, o, wasForest ? B.fire.strongDamage : B.fire.weakDamage, wasForest ? 'finisher' : 'weakfire');
      setTile(s, c[0], c[1], 'firewhirl');
    });
    var amount = strong.length ? B.fire.strongDamage : B.fire.weakDamage;
    var fin = { name: '火の渦', cells: cells, strong: strong, damage: amount };
    ctx.finishers.push(fin);
    ev.push({ type: 'finisher', name: '火の渦', isNew: true, origin: [x, y], center: [cx / 4, cy / 4], cells: cells, strong: strong, damage: amount,
      text: '【新案】火の渦！ 火が風を強くして、2×2の渦になって燃え上がった' +
        (strong.length ? '（森' + strong.length + 'マスを巻きこんだ。森の上は威力' + B.fire.strongDamage + '、ほかは' + B.fire.weakDamage + '＋火傷）'
          : '（森がないので弱い炎: 威力' + B.fire.weakDamage + '＋火傷）') });
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
    var slots = area.ring.filter(function (c) { var o = unitAt(s, c[0], c[1]); return SPIN_OK[getTile(s, c[0], c[1])] && !(o && isFixed(o)); });
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
    var c = castCells(s, u, facing)[0];
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
    var near = s.units.filter(function (u) { var d = dist(u.x, u.y); return !isFixed(u) && d >= 2 && d <= range; });
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
    var F = DIRS[facing], from = castOrigin(s, u, facing);   // 【育つ】丘の上からは1マス先から流れる
    var made = 0, pond = 0, stop = null, sourced = false, tornadoHit = null, whirlHit = null;
    for (var i = 1; ; i++) {
      if (!sourced && i > B.waterLength) break;
      var x = from.x + F.dx * i, y = from.y + F.dy * i;
      if (!inBounds(s, x, y)) { if (sourced) stop = '盤の端まで流れた'; break; }
      ctx.cells.push([x, y]);
      var o = unitAt(s, x, y);
      var t = getTile(s, x, y);
      if (o) { addHit(ctx, o, u.power, 'direct'); cureBurn(s, o, ctx); stop = unitLabel(s, o) + 'に当たって止まった'; break; }
      if (t === 'mountain' || t === 'hill') {   // 【育つ】丘からも川は流れる（丘は丘のまま）
        if (!sourced) {
          sourced = true;
          if (made) ctx.phrases.push('池ができた（' + made + 'マス）');
          ctx.phrases.push('【新案】' + tileName(t) + 'に当たって川になった');
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
    var F = DIRS[facing], from = castOrigin(s, u, facing);   // 【育つ】丘の上からは1マス先から吹く
    var path = [];
    var origin = null, volcano = null, whirl = null, blocked = false;
    var breezeMode = B.windMode === 'breeze';
    for (var i = 1; i <= (breezeMode ? B.breezeLength : B.lineLength); i++) {
      var x = from.x + F.dx * i, y = from.y + F.dy * i;
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
      if (isFixed(o)) why = '動かない';
      else if (!inBounds(s, nx, ny)) why = '盤の端';
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
  // 通れるマス・ユニットがいないマスだけ（敵は個性で変わる）。泥沼に入ったらそこで止まる。泥沼にはまっていたら今の位置だけ
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
      var ct = getTile(s, c[0], c[1]);
      if (cd > 0 && (ct === 'mud' || ct === 'hill')) continue;   // 泥沼・【育つ】丘に入ったらそこで止まる
      neighbors(s, c[0], c[1]).forEach(function (n) {
        var k = key(n.x, n.y);
        if (dist[k] !== undefined) return;
        if (!canEnter(u, getTile(s, n.x, n.y))) return;
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

  // 奪取: 宝を持っている味方（この手番で宝のマスで移動を終える味方も）は撃てない
  function canShoot(s, u, to) {
    var m = s.mission;
    if (!m || missionType(s) !== 'retrieve' || !u || u.side !== 'ally') return true;
    if (m.carrier === u.id) return false;
    var at = to || [u.x, u.y];
    return !(m.treasure && !m.carrier && m.treasure[0] === at[0] && m.treasure[1] === at[1]);
  }
  function carrierOf(s) { var m = s.mission; return m && m.carrier ? findUnit(s, m.carrier) : null; }

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
    if (opts.shoot !== false && !canShoot(s0, u0, to)) return fail(s0, '宝を持っている間は撃てない（待機だけ）');

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
    // 奪取: 宝のマスで移動を終えると宝を持つ。持ったまま帰り口で移動を終えたら勝ち
    var m = s.mission;
    if (m && missionType(s) === 'retrieve') {
      if (!m.carrier && m.treasure && m.treasure[0] === u.x && m.treasure[1] === u.y) {
        m.carrier = u.id; m.treasure = null;
        ev.push({ type: 'treasure', id: u.id, cells: [[u.x, u.y]], text: unitLabel(s, u) + 'が宝を持った（持っている間は撃てない）' });
      }
      if (m.carrier === u.id && inCells(m.exit, u.x, u.y)) {
        ev.push({ type: 'treasure', id: u.id, cells: [[u.x, u.y]], text: unitLabel(s, u) + 'が宝を持って帰り口に着いた' });
        setResult(s, ev, 'win', '宝を持ち帰った！（勝利）');
        step();
        return { ok: true, state: s, events: ev, steps: steps };
      }
    }
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
  //   ターンの流れ: 敵の移動と予告 → 味方の手番 → 敵の魔法の発動 → ターン終了処理 → （次のターン）敵の移動と予告 …
  //   予告は敵の今の位置と向きに固定。発動はその瞬間の位置と向きから撃つ（押されたら形も一緒に動く）
  // ---------------------------------------------------------------

  // target のマスからの道のり（mover が自分の足で入れるマス・ユニットのいないマス。mover 自身のマスは通れる）
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
        if (!canEnter(mover, getTile(s, n.x, n.y))) return;
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

  // 【新案】蜃気楼の中にいる者は、敵から見つからない
  function hidden(s, u) { return !!u && getTile(s, u.x, u.y) === 'mirage'; }

  // u を (x,y) に置いて dir に撃ったら何が起きるか（state は変えない）
  //   allyIds: ダメージを受ける味方（敵から見えている者だけ）、changed: 別のものに変わる自然のマスの数
  //   harm: 敵（自分も含む）がダメージを受ける。撃ったあとのターン終了処理（燃え移り・炎の上）も含めて見る
  function trialShot(s, u, x, y, dir) {
    var sim = clone(s);
    var su = findUnit(sim, u.id);
    su.x = x; su.y = y; su.facing = dir;
    // 先に予告した仲間の魔法は、こちらより先に発動する（その結果の盤面で撃つ。仲間の予告の中へ自分から入る手も「巻き込む」）
    var harm = false;
    if (u.side === 'enemy') {
      enemiesOf(sim).forEach(function (o) {
        if (o.id === u.id || !o.intent || sim.result || !findUnit(sim, o.id)) return;
        var oc = shoot(sim, o, o.facing, []);
        oc.order.forEach(function (id) { var t = findUnit(s, id); if (t && t.side === 'enemy' && oc.hits[id].amount > 0) harm = true; });
      });
      su = findUnit(sim, u.id);
      if (!su) return { allyHits: 0, allyIds: [], allyDmg: 0, harm: true, changed: 0, cells: [], ctx: newShot() };
    }
    var before = sim.tiles.slice();
    var ctx = shoot(sim, su, dir, []);
    var later = clone(sim), laterEv = [];
    timePasses(later, laterEv, function () {});
    var allyIds = [], allyDmg = 0, targetIds = [];
    var isTarget = {};
    missionTargets(s).forEach(function (t) { isTarget[t.id] = true; });
    if (laterEv.some(function (e) { return e.type === 'damage' && e.side === 'enemy'; })) harm = true;
    ctx.order.forEach(function (id) {
      var t = findUnit(s, id), h = ctx.hits[id];
      if (!t || h.amount <= 0) return;
      if (t.side === 'enemy') { harm = true; return; }
      if (hidden(s, t)) return;
      if (isTarget[id]) targetIds.push(id);
      if (t.side !== 'ally') return;     // 置きもの（村・馬車）は「人数」「近い人」には数えない
      allyIds.push(id);
      allyDmg += h.amount;
    });
    var changed = 0;
    for (var i = 0; i < before.length; i++) if (before[i] !== 'empty' && sim.tiles[i] !== before[i]) changed++;
    return { allyHits: allyIds.length, allyIds: allyIds, allyDmg: allyDmg, targetHits: targetIds.length, targetIds: targetIds,
      harm: harm, changed: changed, cells: ctx.cells, ctx: ctx };
  }

  // お題の的: 村・馬車・宝を持っている味方（蜃気楼の中は見えない）。宝がまだ拾われていない奪取では、的はない
  function missionTargets(s) {
    var type = missionType(s), out = [];
    if (type === 'defense') out = objectsOf(s, 'village');
    else if (type === 'escort') out = objectsOf(s, 'wagon');
    else if (type === 'retrieve') { var c = carrierOf(s); if (c) out = [c]; }
    return out.filter(function (t) { return !hidden(s, t); });
  }

  // 一番近い味方（e が自分の足で行ける道のり）。道がなければ縦横の歩数で一番近い味方（field なし）
  function nearestAlly(s, e, allies) {
    var best = null;
    allies.forEach(function (a) {
      var field = distanceField(s, a, e);
      var d = field[key(e.x, e.y)];
      if (d === undefined) return;
      if (!best || d < best.d) best = { a: a, field: field, d: d };
    });
    if (best) return best;
    allies.forEach(function (a) {
      var d = Math.abs(a.x - e.x) + Math.abs(a.y - e.y);
      if (!best || d < best.d) best = { a: a, field: null, d: d };
    });
    return best;
  }

  // 敵がどこへ動いて、どの向きで予告するか（同じ盤面なら必ず同じ答え）
  //   1. 動けるマス（今の位置も含む）× 4つの向きを全部試す
  //   2. その時点の盤面で、自分や他の敵がダメージを受ける組み合わせは選ばない
  //   3. 残りから狙い（人数・近い人・自然）で選ぶ。同点なら 移動が短い → 見つけた順（上右下左の幅優先）→ 向き（上右下左）
  //   4. 狙いで点が付く組み合わせがなければ、一番近い味方へ最大2マス進んで、その方を向く
  function planEnemy(s, e) {
    if (!alliesOf(s).length) return null;
    var allies = alliesOf(s).filter(function (a) { return !hidden(s, a); });
    if (!allies.length) return { to: [e.x, e.y], dir: e.facing, dist: 0, kind: 'lost' };
    var info = reachInfo(s, e);
    // 「的」: 的があれば一番近い的へ向かう。的がない（宝がまだ拾われていない・戦闘）なら「近い人」と同じ
    var targets = e.aim === 'target' ? missionTargets(s) : [];
    var aim = e.aim === 'target' && !targets.length ? 'near' : e.aim;
    var near = aim === 'target' ? nearestAlly(s, e, targets) : nearestAlly(s, e, allies);
    var cands = [];
    info.order.forEach(function (pos) {
      var d = info.dist[key(pos[0], pos[1])];
      DIR_ORDER.forEach(function (dir) {
        cands.push({ to: pos, dir: dir, dist: d, r: trialShot(s, e, pos[0], pos[1], dir) });
      });
    });
    var safe = cands.filter(function (c) { return !c.r.harm; });

    // 自分も仲間も巻き込まない組み合わせが1つもない: その場で一番近い味方の方を向く
    if (!safe.length) return { to: [e.x, e.y], dir: faceToward(e.x, e.y, near.a), dist: 0, kind: 'stuckSafe', target: near.a.id };

    function score(c) {
      if (aim === 'near') return c.r.allyIds.indexOf(near.a.id) >= 0 ? [1, c.r.allyDmg] : null;
      if (aim === 'nature') return c.r.changed > 0 ? [c.r.changed] : null;
      if (aim === 'target') return (c.r.targetHits > 0 || c.r.allyHits > 0) ? [c.r.targetHits, c.r.allyHits, c.r.allyDmg] : null;
      return c.r.allyHits > 0 ? [c.r.allyHits, c.r.allyDmg] : null;
    }
    function cmp(a, b) { for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }
    var best = null;
    safe.forEach(function (c) {
      var sc = score(c);
      if (!sc) return;
      var d = best ? cmp(sc, best.sc) : 1;
      if (!best || d > 0 || (d === 0 && c.dist < best.c.dist)) best = { c: c, sc: sc };
    });
    if (best) {
      return { to: best.c.to, dir: best.c.dir, dist: best.c.dist, kind: aim === 'nature' ? 'nature' : 'attack',
        hits: best.c.r.allyHits, targetHits: best.c.r.targetHits, changed: best.c.r.changed, target: aim === 'near' ? near.a.id : undefined };
    }

    // 狙う相手がいない: 一番近い味方へ最大2マス進み、その方を向く
    //   行けるマスのうち、その味方までの道のりが一番短いマス（同じなら 移動が短い → 見つけた順）。
    //   そこで味方の方を向くと自分や仲間を巻き込むなら、巻き込まずに味方の方を向けるマスのうち一番近いマスにする
    var safeAt = function (pos, dir) { return safe.some(function (c) { return c.to[0] === pos[0] && c.to[1] === pos[1] && c.dir === dir; }); };
    var spots = info.order.map(function (pos) {
      var fd = near.field ? near.field[key(pos[0], pos[1])] : undefined;
      return { pos: pos, fd: fd === undefined ? Infinity : fd, dist: info.dist[key(pos[0], pos[1])], dir: faceToward(pos[0], pos[1], near.a) };
    });
    var byNear = function (a, b) { return (a.fd === b.fd ? 0 : a.fd - b.fd) || a.dist - b.dist; };   // 道がない（どちらも Infinity）ときは移動が短い方
    var pick = near.field ? spots.slice().sort(byNear)[0] : spots[0];
    if (!safeAt(pick.pos, pick.dir)) {
      var ok2 = spots.filter(function (p) { return safeAt(p.pos, p.dir) && (!near.field || p.fd < Infinity); }).sort(byNear)[0];
      if (ok2 && (!near.field || ok2.fd <= spots.filter(function (p) { return p.dist === 0; })[0].fd)) pick = ok2;
    }
    var dir = pick.dir;
    // それでも巻き込むなら、その場所で巻き込まない向き（上右下左の順）に変える
    if (!safeAt(pick.pos, dir)) {
      var alt = DIR_ORDER.filter(function (d) { return safeAt(pick.pos, d); })[0];
      if (alt) dir = alt;
    }
    return { to: pick.pos, dir: dir, dist: pick.dist, kind: near.field ? 'approach' : 'noPath', target: near.a.id, aimAt: aim === 'target' ? '的' : '味方' };
  }

  function intentText(s, e) {
    return unitLabel(s, e) + 'は' + DIRS[e.facing].name + 'を向いて' + magicName(e.magic) + 'の魔法を構えた（予告）';
  }

  // 1. 敵の移動と予告（敵の順に1体ずつ）
  function enemyPlanPhase(s, ev, step) {
    var ids = enemiesOf(s).map(function (e) { return e.id; });
    ids.forEach(function (id) {
      if (s.result) return;
      var e = findUnit(s, id);
      if (!e) return;
      e.intent = false;
      var plan = planEnemy(s, e);
      if (!plan) return;
      if (e.stuck) {
        e.stuck = false;
        ev.push({ type: 'mudSkip', id: e.id, text: unitLabel(s, e) + 'は泥沼にはまっていて動けない（1回休み）' });
      }
      if (plan.kind === 'lost') {
        ev.push({ type: 'info', id: e.id, text: '【新案】' + unitLabel(s, e) + 'は味方を見失った（蜃気楼）' });
        step();
        return;
      }
      if (plan.kind === 'noPath') ev.push({ type: 'info', id: e.id, text: unitLabel(s, e) + 'は' + plan.aimAt + 'への道がないので、' + (plan.dist > 0 ? '近くで' : 'その場で') + '構える' });
      if (plan.dist > 0) { moveUnit(s, e, plan.to[0], plan.to[1], plan.dist, ev); step(); }
      e.facing = plan.dir;
      e.intent = true;
      ev.push({ type: 'intent', id: e.id, side: 'enemy', magic: e.magic, dir: plan.dir, from: [e.x, e.y],
        cells: trialShot(s, e, e.x, e.y, plan.dir).cells, text: intentText(s, e) });
      step();
    });
  }

  // 3. 敵の魔法の発動（敵の順に1つずつ。発動の瞬間の位置と向きから撃つ）
  function enemyFirePhase(s, ev, step) {
    var ids = enemiesOf(s).filter(function (e) { return e.intent; }).map(function (e) { return e.id; });
    for (var i = 0; i < ids.length && !s.result; i++) {
      var e = findUnit(s, ids[i]);
      if (!e || !e.intent) continue;     // 倒れた敵の予告は消える
      e.intent = false;
      shoot(s, e, e.facing, ev);
      step();
    }
  }

  // ---------------------------------------------------------------
  // 護衛: 馬車の道
  //   ゴールまでの一番短い道（通れるマスだけ。危ない所（敵の「避」と同じ）とユニットのいるマスは通らない）
  //   同じ長さなら 上・右・下・左 の順。道がなければ null
  // ---------------------------------------------------------------
  function wagonRoute(s) {
    var w = objectsOf(s, 'wagon')[0];
    var m = s.mission;
    if (!w || !m || missionType(s) !== 'escort' || !(m.goal || []).length) return null;
    var open = function (x, y) {
      var t = getTile(s, x, y), o = unitAt(s, x, y);
      return isPassable(t) && !DANGER[t] && (!o || o === w);
    };
    var field = {}, queue = [];
    m.goal.forEach(function (c) {
      if (!inBounds(s, c[0], c[1]) || !open(c[0], c[1])) return;
      field[key(c[0], c[1])] = 0; queue.push(c);
    });
    while (queue.length) {
      var c = queue.shift(), cd = field[key(c[0], c[1])];
      neighbors(s, c[0], c[1]).forEach(function (n) {
        var k = key(n.x, n.y);
        if (field[k] !== undefined || !open(n.x, n.y)) return;
        field[k] = cd + 1; queue.push([n.x, n.y]);
      });
    }
    var d = field[key(w.x, w.y)];
    if (d === undefined) return { id: w.id, from: [w.x, w.y], next: null, path: [], steps: null };
    var path = [], x = w.x, y = w.y;
    while (field[key(x, y)] > 0) {
      var here = field[key(x, y)];
      var nx = neighbors(s, x, y).filter(function (n) { return field[key(n.x, n.y)] === here - 1; })[0];
      x = nx.x; y = nx.y;
      path.push([x, y]);
    }
    return { id: w.id, from: [w.x, w.y], next: path[0] || null, path: path, steps: d };
  }

  // 敵の魔法の発動のあと、ターン終了処理の前: 馬車がゴールへ1マス進む
  function wagonPhase(s, ev, step) {
    var w = objectsOf(s, 'wagon')[0];
    if (!w || s.result || missionType(s) !== 'escort') return;
    if (w.stuck) {
      w.stuck = false;
      ev.push({ type: 'mudSkip', id: w.id, text: unitLabel(s, w) + 'は泥沼にはまっていて動けない（1回休み）' });
      step();
      return;
    }
    var r = wagonRoute(s);
    if (!r || !r.next) {
      ev.push({ type: 'wagonWait', id: w.id, cells: [[w.x, w.y]], text: unitLabel(s, w) + 'はゴールへの道がないので、その場で待った' });
      step();
      return;
    }
    var from = [w.x, w.y];
    w.x = r.next[0]; w.y = r.next[1];
    ev.push({ type: 'move', id: w.id, side: 'object', from: from, to: [w.x, w.y],
      text: unitLabel(s, w) + 'がゴールへ1マス進んだ' + (r.steps > 1 ? '（ゴールまであと' + (r.steps - 1) + '歩）' : '') });
    checkResult(s, ev);
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

  // 次のターン終了で燃え尽きる炎と、そのあとの炎の年齢。fresh: いま燃え移ったマス（数えない）
  function burnOutCells(s, fresh) {
    var skip = {};
    (fresh || []).forEach(function (c) { skip[idx(s, c[0], c[1])] = true; });
    var age = {}, cells = [], old = s.fireAge || {};
    for (var i = 0; i < s.tiles.length; i++) {
      if (s.tiles[i] !== 'fire' || skip[i]) continue;
      var a = (old[i] || 0) + 1;
      if (a >= B.fire.burnOutTurns) cells.push([i % s.size, Math.floor(i / s.size)]);
      else age[i] = a;
    }
    return { cells: cells, age: age };
  }

  // 時間で変わる自然（燃え移り・炎の上のダメージ・火傷・燃え尽き・小さな炎が消える・花びらが散る・風がやむ・火の渦が解ける）
  function timePasses(s, ev, step) {
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
    // 2b. 火傷のダメージ（残り回数を1つ減らす）
    s.units.forEach(function (u) {
      if (!(u.burn > 0)) return;
      u.hp -= B.fire.burnDamage;
      u.burn -= 1;
      ev.push({ type: 'damage', id: u.id, side: u.side, amount: B.fire.burnDamage, src: 'burnStatus', cells: [[u.x, u.y]],
        text: '火傷で' + unitLabel(s, u) + 'に' + B.fire.burnDamage + 'ダメージ（残りHP ' + Math.max(0, u.hp) + '）' + (u.burn ? '、火傷はあと' + u.burn + '回' : '、火傷が治った') });
    });
    removeDead(s, ev);
    checkResult(s, ev);
    step();

    // 2c. 炎が燃え尽きる（できてからターン終了を burnOutTurns 回迎えたら空きに戻る。いま燃え移った炎はここから数える）
    var out2 = burnOutCells(s, caught);
    out2.cells.forEach(function (c) { setTile(s, c[0], c[1], 'empty'); });
    s.fireAge = out2.age;
    if (out2.cells.length) ev.push({ type: 'burnOut', cells: out2.cells, text: '炎が燃え尽きた（' + out2.cells.length + 'マス）' });
    step();

    // 3. 小さな炎が消える・花びらが散る・風がやむ・火の渦が解ける
    function sweep(from, to) {
      var cells = [];
      for (var y = 0; y < s.size; y++) {
        for (var x = 0; x < s.size; x++) if (getTile(s, x, y) === from) { setTile(s, x, y, to); cells.push([x, y]); }
      }
      return cells;
    }
    var gone = sweep('smallfire', 'empty');
    if (gone.length) ev.push({ type: 'smallfireOut', cells: gone, text: '小さな炎が消えた（' + gone.length + 'マス）' });
    var fallen = sweep('petals', 'empty');
    if (fallen.length) ev.push({ type: 'smallfireOut', cells: fallen, text: '【新案】花びらが散った（' + fallen.length + 'マス）' });
    var calm = sweep('breeze', 'empty');
    if (calm.length) ev.push({ type: 'smallfireOut', cells: calm, text: '【新案】吹いていた風がやんだ（' + calm.length + 'マス）' });
    var undone = sweep('firewhirl', 'fire');
    if (undone.length) ev.push({ type: 'fireSpread', cells: undone, text: '【新案】火の渦が解けて炎になった（' + undone.length + 'マス）' });
    step();
  }

  // 味方の手番のあと: 敵の魔法の発動 → ターン終了処理 → 次のターンの敵の移動と予告
  function endTurn(s0) {
    if (s0.result) return fail(s0, '勝負はもうついている');
    var s = clone(s0);
    var ev = [], steps = [], mark = 0;
    function step() {
      if (ev.length > mark) { steps.push({ state: clone(s), events: ev.slice(mark) }); mark = ev.length; }
    }
    // このターン行動しなかった味方は、泥沼の1回休みを使ったことにする
    alliesOf(s).forEach(function (a) { if (!a.acted && a.stuck) a.stuck = false; });

    // 3. 敵の魔法の発動
    if (s.enemyActs && enemiesOf(s).some(function (e) { return e.intent; })) {
      ev.push({ type: 'phase', text: '── 敵の魔法の発動 ──' });
      enemyFirePhase(s, ev, step);
    }

    // 3b. 護衛: 馬車がゴールへ1マス進む
    if (!s.result) wagonPhase(s, ev, step);

    // 4. ターン終了処理
    if (!s.result) {
      ev.push({ type: 'turnEnd', text: '── ターン' + s.turn + ' 終了 ──' });
      step();
      timePasses(s, ev, step);
    }

    // 4b. 防衛: 決まったターンのターン終了処理が終わったとき、村が残っていれば勝ち
    if (!s.result && missionType(s) === 'defense' && s.turn >= B.mission.defense.turns && objectsOf(s, 'village').length) {
      setResult(s, ev, 'win', 'ターン' + s.turn + 'を守り切った。村は無事！（勝利）');
      step();
    }

    // 5. 次のターン: 敵の移動と予告
    if (!s.result) {
      s.turn += 1;
      alliesOf(s).forEach(function (a) { a.acted = false; });
      ev.push({ type: 'turnStart', text: '── ターン' + s.turn + ' 開始 ──' });
      step();
      if (s.enemyActs) enemyPlanPhase(s, ev, step);
    }
    step();
    return { ok: true, state: s, events: ev, steps: steps };
  }

  // 戦闘の始まり: 遊び始めの状態にそろえて、敵の移動と予告まで済ませる（味方は最初の手番から予告を見られる）
  function startBattle(s0) {
    var s = normalizeForPlay(s0);
    var ev = [], steps = [], mark = 0;
    function step() {
      if (ev.length > mark) { steps.push({ state: clone(s), events: ev.slice(mark) }); mark = ev.length; }
    }
    if (s.enemyActs) enemyPlanPhase(s, ev, step);
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
      if (!canShoot(s, u, pos)) return;
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
              if (!canShoot(s, a, pos)) return false;
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

  // 敵の予告とターン終了の予告（今の盤面で、いま敵の魔法が発動してターン終了したら何が起きるか）
  //   予告は敵の順に発動したものとして続けて計算する（前の敵の結果が、次の敵の盤面になる）
  //   enemies: [{ id, from, to, shootFrom, dir, magic, cells, tileChanges, damages, finishers, cancelled }]
  //   enemyDamage: 発動でダメージを受ける者（味方も敵も）。fireSpread・burn: 発動のあとのターン終了処理
  function forecast(s) {
    var out = { enemies: [], fireSpread: [], burnOut: [], burn: [], enemyDamage: [], wagon: null };
    if (s.result) return out;
    var sim = clone(s);
    if (s.enemyActs) {
      enemiesOf(s).filter(function (e) { return e.intent; }).forEach(function (e0) {
        var e = findUnit(sim, e0.id);
        if (!e || sim.result) {
          out.enemies.push({ id: e0.id, cancelled: true, from: [e0.x, e0.y], to: [e0.x, e0.y], dir: e0.facing, magic: e0.magic, cells: [], tileChanges: [], damages: [], finishers: [] });
          return;
        }
        var before = sim.tiles.slice(), units = clone(sim.units);
        var ctx = shoot(sim, e, e.facing, []);
        e.intent = false;
        var tileChanges = [];
        for (var i = 0; i < before.length; i++) {
          if (sim.tiles[i] !== before[i]) tileChanges.push({ x: i % sim.size, y: Math.floor(i / sim.size), from: before[i], to: sim.tiles[i] });
        }
        var damages = ctx.order.map(function (id) {
          var b = units.filter(function (u) { return u.id === id; })[0];
          var h = ctx.hits[id];
          return { id: id, side: b.side, amount: h.amount, src: h.src, dies: !findUnit(sim, id) };
        });
        damages.forEach(function (d) { out.enemyDamage.push({ id: d.id, amount: d.amount, side: d.side, by: e.id }); });
        out.enemies.push({ id: e.id, from: [e.x, e.y], to: [e.x, e.y], shootFrom: [e.x, e.y], dir: e.facing, magic: e.magic,
          cells: ctx.cells, tileChanges: tileChanges, damages: damages, finishers: ctx.finishers });
      });
    }
    if (sim.result) return out;
    // 護衛: 敵の魔法の発動のあとの盤面で、馬車の次の1マスとゴールまでの道筋
    if (missionType(sim) === 'escort') {
      out.wagon = wagonRoute(sim);
      if (out.wagon) out.wagon.stuck = !!findUnit(sim, out.wagon.id).stuck;
      wagonPhase(sim, [], function () {});
      if (sim.result) return out;
    }
    out.fireSpread = fireSpreadCells(sim);
    out.burnOut = burnOutCells(sim, out.fireSpread).cells;
    // ターン終了処理で受けるダメージ（炎の上・火傷）。燃え移りも含めて、そのまま動かして数える
    var later = clone(sim), laterEv = [];
    timePasses(later, laterEv, function () {});
    var sum = {};
    laterEv.forEach(function (e) {
      if (e.type !== 'damage') return;
      if (!sum[e.id]) { sum[e.id] = { id: e.id, amount: 0, side: e.side }; out.burn.push(sum[e.id]); }
      sum[e.id].amount += e.amount;
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
      var mine = allyMagics(s);
      if (magic && mine.indexOf(magic) < 0) return fail(s0, magicName(magic) + 'は敵だけの魔法');
      var m = magic || B.ally.defaultMagics.filter(function (d) { return used.indexOf(d) < 0 && mine.indexOf(d) >= 0; })[0] || mine[0];
      return { ok: true, state: s, events: [], steps: [], unit: addAlly(s, m, x, y, 'up') };
    }
    if (enemiesOf(s).length >= B.enemy.maxCount) return fail(s0, '敵は' + B.enemy.maxCount + '体まで');
    return { ok: true, state: s, events: [], steps: [], unit: addEnemy(s, magic || B.enemy.defaultMagic, x, y, 'down') };
  }

  // お題の置きもの（村・馬車）を置く。馬車は1台だけ
  function editPlaceObject(s0, kind, x, y) {
    if (!OBJECT_INFO[kind]) return fail(s0, '置きものがない');
    if (!inBounds(s0, x, y)) return fail(s0, '盤の外');
    if (unitAt(s0, x, y)) return fail(s0, 'もうユニットがいる');
    if (!canStand(s0, x, y)) return fail(s0, '通れないマスには置けない');
    if (kind === 'wagon' && objectsOf(s0, 'wagon').length) return fail(s0, '馬車は1台まで');
    var s = clone(s0);
    return { ok: true, state: s, events: [], steps: [], unit: addObject(s, kind, x, y) };
  }

  function editSetMission(s0, type) {
    if (!MISSION_INFO[type]) return fail(s0, 'お題がない');
    var s = clone(s0);
    if (!s.mission) s.mission = newMission(type);
    s.mission.type = type;
    return ok(s);
  }

  // ゴール（goal）・帰り口（exit）の印をつける／外す
  function editToggleCell(s0, field, x, y) {
    if (field !== 'goal' && field !== 'exit') return fail(s0, '印がない');
    if (!inBounds(s0, x, y)) return fail(s0, '盤の外');
    var s = clone(s0);
    if (!s.mission) s.mission = newMission('annihilate');
    var list = s.mission[field] = s.mission[field] || [];
    var at = -1;
    list.forEach(function (c, i) { if (c[0] === x && c[1] === y) at = i; });
    if (at >= 0) list.splice(at, 1); else list.push([x, y]);
    return ok(s);
  }

  function editPlaceTreasure(s0, x, y) {
    if (!inBounds(s0, x, y)) return fail(s0, '盤の外');
    if (!canStand(s0, x, y)) return fail(s0, '通れないマスには置けない');
    var s = clone(s0);
    if (!s.mission) s.mission = newMission('annihilate');
    s.mission.treasure = [x, y];
    s.mission.carrier = null;
    return ok(s);
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
    var u0 = findUnit(s0, unitId);
    if (!u0) return fail(s0, 'ユニットがいない');
    if (u0.side === 'object') return fail(s0, '置きものは魔法を持たない');
    if (u0.side === 'ally' && allyMagics(s0).indexOf(magic) < 0) return fail(s0, magicName(magic) + 'は敵だけの魔法');
    var s = clone(s0);
    findUnit(s, unitId).magic = magic;
    return ok(s);
  }

  // 敵の個性を変える（field: aim / avoid / cross）
  function editSetPersona(s0, unitId, field, value) {
    var u0 = findUnit(s0, unitId);
    if (!u0 || u0.side !== 'enemy') return fail(s0, '敵がいない');
    if (!PERSONA[field] || !PERSONA[field][value]) return fail(s0, '個性が正しくない');
    var s = clone(s0);
    findUnit(s, unitId)[field] = value;
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
    if (!s.enemyActs) enemiesOf(s).forEach(function (e) { e.intent = false; });
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
    // 置きものは盤に残る所だけ（味方・敵と重なったら外す）
    s.units = s.units.filter(function (u) {
      if (u.side !== 'object') return true;
      return inBounds(s, u.x, u.y) && !s.units.some(function (o) { return o !== u && o.side !== 'object' && o.x === u.x && o.y === u.y; });
    });
    s.units.forEach(function (u) { if (!isPassable(getTile(s, u.x, u.y))) setTile(s, u.x, u.y, 'empty'); });
    if (s.mission) {
      var inside = function (c) { return inBounds(s, c[0], c[1]); };
      s.mission.goal = (s.mission.goal || []).filter(inside);
      s.mission.exit = (s.mission.exit || []).filter(inside);
      if (s.mission.treasure && !inside(s.mission.treasure)) s.mission.treasure = null;
    }
    return ok(s);
  }

  // 遊び始めの状態にそろえる（ターン1・HP満タン・行動前）
  function normalizeForPlay(s0) {
    var s = clone(s0);
    s.turn = 1;
    s.result = null;
    s.resultText = null;
    s.fireAge = {};
    if (!s.mission) s.mission = newMission('annihilate');
    var m = s.mission;
    m.lost = 0;
    if (m.carrier) {
      var c = findUnit(s, m.carrier);
      m.treasure = c ? [c.x, c.y] : m.treasure;
      m.carrier = null;
    }
    s.units.forEach(function (u) {
      u.burn = 0;
      var conf = unitConf(u);
      u.maxHp = conf.hp; u.hp = conf.hp; u.power = conf.power; u.move = conf.move;
      u.stuck = false; u.acted = false;
      if (u.side === 'enemy') u.intent = false;
    });
    return s;
  }

  // ---------------------------------------------------------------
  // 保存（JSON）
  // ---------------------------------------------------------------
  function exportLayout(s) {
    var m = s.mission || newMission('annihilate');
    var carrier = m.carrier ? findUnit(s, m.carrier) : null;
    return JSON.stringify({
      version: 2, size: s.size, tiles: s.tiles, enemyActs: s.enemyActs, enemyOnlyMagics: s.enemyOnlyMagics || undefined,
      mission: { type: m.type, goal: m.goal || [], exit: m.exit || [], treasure: carrier ? [carrier.x, carrier.y] : (m.treasure || null) },
      units: s.units.map(function (u) {
        if (u.side === 'object') return { side: 'object', kind: u.kind, x: u.x, y: u.y };
        var o = { side: u.side, magic: u.magic, x: u.x, y: u.y, facing: u.facing };
        if (u.side === 'enemy') { o.aim = u.aim; o.avoid = u.avoid; o.cross = u.cross; }
        return o;
      })
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
    if (Array.isArray(d.enemyOnlyMagics)) {
      if (d.enemyOnlyMagics.some(function (m) { return !MAGIC_INFO[m]; })) return { ok: false, error: '敵だけの魔法に知らない魔法がある' };
      s.enemyOnlyMagics = d.enemyOnlyMagics.slice();
    }
    if (d.mission) {
      var dm = d.mission;
      if (!MISSION_INFO[dm.type]) return { ok: false, error: '知らないお題がある' };
      var cellOk = function (c) { return Array.isArray(c) && c.length === 2 && inBounds(s, c[0], c[1]); };
      if ((dm.goal && !dm.goal.every(cellOk)) || (dm.exit && !dm.exit.every(cellOk)) || (dm.treasure && !cellOk(dm.treasure))) return { ok: false, error: 'お題の印の位置が正しくない' };
      s.mission = newMission(dm.type);
      s.mission.goal = (dm.goal || []).map(function (c) { return [c[0], c[1]]; });
      s.mission.exit = (dm.exit || []).map(function (c) { return [c[0], c[1]]; });
      s.mission.treasure = dm.treasure ? [dm.treasure[0], dm.treasure[1]] : null;
    }
    var units = Array.isArray(d.units) ? d.units : [], bad = false;
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (!u || (u.side !== 'ally' && u.side !== 'enemy' && u.side !== 'object')) return { ok: false, error: 'ユニットの陣営が正しくない' };
      if (u.side === 'object' ? !OBJECT_INFO[u.kind] : !MAGIC_INFO[u.magic]) return { ok: false, error: u.side === 'object' ? '知らない置きものがある' : '知らない魔法がある' };
      if (!inBounds(s, u.x, u.y) || unitAt(s, u.x, u.y) || !isPassable(getTile(s, u.x, u.y))) return { ok: false, error: 'ユニットの位置が正しくない' };
      if (u.side === 'object') addObject(s, u.kind, u.x, u.y);
      else if (u.side === 'ally') addAlly(s, u.magic, u.x, u.y, DIRS[u.facing] ? u.facing : 'up');
      else {
        var e = addEnemy(s, u.magic, u.x, u.y, DIRS[u.facing] ? u.facing : 'down');
        ['aim', 'avoid', 'cross'].forEach(function (f) { if (u[f] !== undefined) { if (!PERSONA[f][u[f]]) bad = true; else e[f] = u[f]; } });
      }
      if (bad) return { ok: false, error: '敵の個性が正しくない' };
    }
    return { ok: true, state: s };
  }

  // ---------------------------------------------------------------
  // 初期シナリオ
  //   . 空き  F 森  M 山  R 川  X 炎  s 小さな炎  V 火山  D 泥沼  P 水たまり  H 蜃気楼  I 氷  L 溶岩  W つむじ風  T 竜巻
  // ---------------------------------------------------------------
  var CH = { '.': 'empty', F: 'forest', M: 'mountain', R: 'river', X: 'fire', s: 'smallfire', V: 'volcano', D: 'mud', P: 'puddle', H: 'mirage', I: 'ice', L: 'lava', W: 'whirlwind', T: 'tornado', B: 'breeze', Q: 'firewhirl', K: 'sakura', p: 'petals', G: 'deadforest', O: 'haunted', h: 'hill' };
  var PRESETS = [
    {
      id: 'mDefense', name: '【お題】防衛', mission: 'defense',
      desc: '【お題】防衛。味方 草・土・火、敵2体（A: 的＝村を狙う／B: 人数）。下の段の村2つを、' + B.mission.defense.turns + 'ターン目の終わりまで守る（敵の全滅でも勝ち）。村が1つでも壊れたら負け。村はHP' + B.mission.village.hp + 'で動かない。味方の魔法でも壊れる。',
      rows: ['.......', '.......', '..F.F..', '..F.F..', '.......', '.......', '.......'],
      allies: [['grass', 2, 6], ['earth', 3, 6], ['fire', 4, 6]],
      enemies: [['fire', 1, 0, { aim: 'target' }], ['fire', 5, 0, { aim: 'count' }]],
      villages: [[1, 6], [5, 6]]
    },
    {
      id: 'mEscort', name: '【お題】護衛', mission: 'escort',
      desc: '【お題】護衛。味方 土・水・風、敵2体（A: 的＝馬車を狙う／B: 人数）。馬車はターンの終わりに、ゴール（右の端）への一番短い道を1マス進む（危ない所とユニットは避ける）。真ん中の川は切れ目からしか渡れない。山や川で道を変えられる。風で押すと馬車も運ばれる。',
      rows: ['...R...', '...R...', '...R...', '...R...', '.......', '...R...', '...R...'],
      allies: [['earth', 0, 6], ['water', 2, 6], ['wind', 1, 4]],
      enemies: [['fire', 5, 0, { aim: 'target' }], ['fire', 6, 6, { aim: 'count' }]],
      wagon: [1, 5],
      goal: [[6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [6, 6]]
    },
    {
      id: 'mRetrieve', name: '【お題】奪取', mission: 'retrieve',
      desc: '【お題】奪取。味方 草・火・風、敵2体（A: 的＝宝を持つ味方を狙う／B: 人数）。上の段の宝のマスで移動を終えると宝を持つ（持っている間は撃てない）。持ったまま下の段（帰り口）で移動を終えたら勝ち。持っている味方が倒れると宝はそこに落ちる。',
      rows: ['.M...M.', '..F.F..', '.......', '.......', '.......', '.......', '.......'],
      allies: [['grass', 1, 6], ['fire', 3, 6], ['wind', 5, 6]],
      enemies: [['fire', 2, 0, { aim: 'target' }], ['fire', 4, 0, { aim: 'count' }]],
      treasure: [3, 0],
      exit: [[0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6]]
    },
    {
      id: 'useEnemyFire', name: '【敵】敵の火を使う',
      desc: '【敵】味方 草・水・風、敵2体（火・狙い 人数）。敵は動いてから予告（紫）を出し、ターンの最後に発動する。敵Bは森の上で構える。敵Aの火の予告先に風を吹かせておくと、敵Aの火で火の渦が起き、森の上の敵Bに強い炎（20）が入る。森でないマスは弱い炎（5＋火傷）。水で消す手もある。',
      rows: ['......', '......', '..F...', '..F...', '......', '......'],
      allies: [['grass', 0, 5], ['water', 5, 5], ['wind', 3, 5]],
      enemies: [['fire', 3, 0], ['fire', 2, 1]]
    },
    {
      id: 'trap', name: '【敵】罠に踏み込む',
      desc: '【敵】味方 草・火・風、敵2体（土）。敵Aは「通れない所だけ避ける」ので炎の列を踏み越えて来る。敵Bは「危ない所も避ける」ので炎の向こうから出られない。踏み込んできた敵Aを、火と風の燃え広がりで迎え撃つ（足元が森でないと弱い炎で、5＋火傷）。炎の列は2回目のターン終了で燃え尽き、敵Bが出てくる。敵Bの土の予告先に立つと倒れる。',
      rows: ['......', '......', 'XXXXXX', '......', '.FFFF.', '......'],
      allies: [['grass', 0, 5], ['fire', 2, 5], ['wind', 5, 5]],
      enemies: [['earth', 1, 1, { avoid: 'wall' }], ['earth', 4, 1, { avoid: 'danger' }]]
    },
    {
      id: 'enemyThunder', name: '【敵】敵だけの雷', enemyOnly: ['thunder'],
      desc: '【敵】味方 土・水・風、敵2体（雷・狙い 人数）。雷は敵だけの魔法（味方は使えない）。雷は高い所か水に落ちる。敵の雷の予告先に川を流しておくと、敵の雷が川に落ちて感電し、水のそばの敵が巻き込まれる。',
      rows: ['......', '......', '......', '......', '......', '......'],
      allies: [['earth', 1, 5], ['water', 3, 5], ['wind', 5, 5]],
      enemies: [['thunder', 1, 0], ['thunder', 4, 0]]
    },
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
    return p ? buildPreset(p) : null;
  }
  // シナリオの形（rows・allies・enemies…）から盤面を作る。新案プレイ（checks.js）の盤面もこれで作る
  function buildPreset(p) {
    var s = blankState(p.rows.length, true);
    p.rows.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) setTile(s, x, y, CH[row[x]]);
    });
    p.allies.forEach(function (a) { addAlly(s, a[0], a[1], a[2], 'up'); });
    p.enemies.forEach(function (e) {
      var u = addEnemy(s, e[0], e[1], e[2], e[4] || 'down');
      if (e[3]) ['aim', 'avoid', 'cross'].forEach(function (f) { if (e[3][f]) u[f] = e[3][f]; });
    });
    if (p.enemyOnly) s.enemyOnlyMagics = p.enemyOnly.slice();
    s.mission = newMission(p.mission || 'annihilate');
    (p.villages || []).forEach(function (c) { addObject(s, 'village', c[0], c[1]); });
    if (p.wagon) addObject(s, 'wagon', p.wagon[0], p.wagon[1]);
    if (p.goal) s.mission.goal = p.goal.map(function (c) { return c.slice(); });
    if (p.exit) s.mission.exit = p.exit.map(function (c) { return c.slice(); });
    if (p.treasure) s.mission.treasure = p.treasure.slice();
    return s;
  }

  // 画面に常に出す、お題の名前・勝ち方・負け方・残りの数
  function missionInfo(s) {
    var type = missionType(s), m = s.mission || {};
    var info = { type: type, name: MISSION_INFO[type].name, win: '', lose: '味方が全員倒れる', status: [] };
    if (type === 'annihilate') {
      info.win = '敵を全員倒す';
      info.status.push('敵 残り' + enemiesOf(s).length + '体');
    } else if (type === 'defense') {
      var T = B.mission.defense.turns;
      info.win = 'ターン' + T + 'の終わりまで村を守る（敵の全滅でも勝ち）';
      info.lose = '村が' + B.mission.defense.loseAt + 'つ壊れる／味方が全員倒れる';
      info.status.push(s.result ? 'ターン' + s.turn + '/' + T : '残り' + Math.max(0, T - s.turn + 1) + 'ターン（今 ' + s.turn + '/' + T + '）');
      info.status.push('村 ' + objectsOf(s, 'village').map(function (v) { return unitLabel(s, v) + ' HP' + v.hp; }).join('・') + (m.lost ? '（壊れた ' + m.lost + '）' : ''));
    } else if (type === 'escort') {
      info.win = '馬車がゴールに入る';
      info.lose = '馬車が壊れる／味方が全員倒れる';
      var w = objectsOf(s, 'wagon')[0];
      if (w) {
        var r = wagonRoute(s);
        info.status.push('馬車 HP' + w.hp + '/' + w.maxHp);
        info.status.push(r && r.steps !== null ? 'ゴールまで ' + r.steps + '歩' : 'ゴールへの道がない（待つ）');
        if (w.stuck) info.status.push('泥沼: 次は進めない');
      } else info.status.push('馬車がない');
      info.status.push('敵 残り' + enemiesOf(s).length + '体');
    } else if (type === 'retrieve') {
      info.win = '宝を持って帰り口で移動を終える';
      var c = carrierOf(s);
      if (c) {
        var best = null;
        var field = {}, queue = [];
        (m.exit || []).forEach(function (e) { field[key(e[0], e[1])] = 0; queue.push(e); });
        while (queue.length) {
          var q = queue.shift(), d = field[key(q[0], q[1])];
          neighbors(s, q[0], q[1]).forEach(function (n) {
            var k = key(n.x, n.y);
            if (field[k] !== undefined || !isPassable(getTile(s, n.x, n.y))) return;
            field[k] = d + 1; queue.push([n.x, n.y]);
          });
        }
        best = field[key(c.x, c.y)];
        info.status.push(unitLabel(s, c) + 'が宝を持っている（撃てない）');
        info.status.push(best === undefined ? '帰り口への道がない' : '帰り口まで ' + best + 'マス');
      } else if (m.treasure) {
        info.status.push('宝は (' + m.treasure[0] + ',' + m.treasure[1] + ') にある');
      } else info.status.push('宝がない');
      info.status.push('敵 残り' + enemiesOf(s).length + '体');
    }
    return info;
  }

  // ---------------------------------------------------------------
  var api = {
    BALANCE: B,
    TILE_INFO: TILE_INFO, TILES: TILES, MAGIC_INFO: MAGIC_INFO, MAGICS: MAGICS,
    DIRS: DIRS, DIR_ORDER: DIR_ORDER, PRESETS: PRESETS,
    hidden: hidden, PERSONA: PERSONA, canEnter: canEnter, enemyOnlyMagics: enemyOnlyMagics, allyMagics: allyMagics,
    clone: clone, inBounds: inBounds, getTile: getTile, setTile: setTile, isPassable: isPassable,
    unitAt: unitAt, findUnit: findUnit, alliesOf: alliesOf, enemiesOf: enemiesOf,
    unitLabel: unitLabel, tileName: tileName, magicName: magicName,
    rotate: rotate, shapeCells: shapeCells,
    createState: createState, addAlly: addAlly, addEnemy: addEnemy,
    reachableCells: reachableCells, act: act, allAlliesActed: allAlliesActed, endTurn: endTurn, startBattle: startBattle,
    planEnemy: planEnemy, previewAct: previewAct, guideMap: guideMap, nextHints: nextHints, forecast: forecast,
    editPaint: editPaint, editPlaceUnit: editPlaceUnit, editRemoveUnit: editRemoveUnit,
    editMoveUnit: editMoveUnit, editSetMagic: editSetMagic, editSetFacing: editSetFacing, editSetPersona: editSetPersona,
    editSetEnemyActs: editSetEnemyActs, editResize: editResize, normalizeForPlay: normalizeForPlay,
    exportLayout: exportLayout, importLayout: importLayout, loadPreset: loadPreset, buildPreset: buildPreset,
    // お題
    MISSION_INFO: MISSION_INFO, MISSIONS: MISSIONS, OBJECT_INFO: OBJECT_INFO,
    objectsOf: objectsOf, addObject: addObject, missionTargets: missionTargets, missionInfo: missionInfo,
    wagonRoute: wagonRoute, canShoot: canShoot, carrierOf: carrierOf, inCells: inCells,
    editPlaceObject: editPlaceObject, editSetMission: editSetMission, editToggleCell: editToggleCell, editPlaceTreasure: editPlaceTreasure
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Rules = api;
  }
})(this);
