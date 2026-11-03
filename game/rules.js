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
  var NODE = typeof module !== 'undefined' && module.exports;
  var IS_NODE = NODE;
  var B = NODE ? require('./balance.js') : root.BALANCE;
  // 画面に出す文（texts.js）。ブラウザでは画面が書き換えることがあるので、使うたびに読む
  var NODE_TEXTS = null;
  if (NODE) { try { NODE_TEXTS = require('./texts.js'); } catch (e) { NODE_TEXTS = null; } }
  function texts() { return NODE ? NODE_TEXTS : root.TEXTS; }

  // 試作ラボ（lab_*.js）は IMPROVE_v3 段1（オーナー 10/30）でアーカイブした（archive/開発モード_20261030/）。ルールの中のラボの呼び口も外した

  // ---------------------------------------------------------------
  // 定義
  // ---------------------------------------------------------------
  var TILE_INFO = {
    empty:     { name: '空き',     label: '',   passable: true  },
    forest:    { name: '森',       label: '森', passable: true  },
    thicket:   { name: '草むら',   label: '草', passable: true  },   // 【育つ】草の一段目。低い草。燃える。草をもう一度当てると森に育つ
    mountain:  { name: '山',       label: '山', passable: false },
    hill:      { name: '丘',       label: '丘', passable: true  },   // 【育つ】土の一段目。入ると止まる。上から撃つと形が1マス先へ（高台）
    river:     { name: '川',       label: '川', passable: false },
    fire:      { name: '炎',       label: '炎', passable: true  },
    smallfire: { name: '小さな炎', label: '火', passable: true  },
    volcano:   { name: '火山',     label: '噴', passable: false },   // 【新案】マグマの代わり
    sakura:    { name: '桜',       label: '桜', passable: false },   // 【新案・試し】山に草で桜が咲いた山。風で桜吹雪
    hillsakura: { name: '丘の桜',  label: '桜', passable: true  },   // 【育つ】丘に草で咲く桜。丘の性質のまま（通れる・低い）。風で桜吹雪（2列）、散ると丘に戻る
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
    gale:      { name: '強風',     label: '嵐', passable: true  },   // 【育つ】風の残るマスにもう一度風で、そこから奥へ吹く強い風。ターン終了でやむ
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
    dark:    { name: '闇', verb: '吸う' },         // 【新案・試し】正面1マス。撃つとまわりの者を引き寄せる
    mount:   { name: '山', verb: '盛る' },         // チュートリアル①の敵: 2マス先を真ん中に十字5マスへ、一度で山を盛る
    // 展示ステージ③の敵の攻撃（自然は作らない。形のマスにいる者に直撃するだけ。味方は持てない）
    smash:   { name: '一撃', verb: '打つ' },       // ボス: 体の前の数列に打ち下ろす
    bite:    { name: '体当たり', verb: '打つ' }    // 取り巻き: 正面1マス
  };
  var MAGICS = Object.keys(MAGIC_INFO);
  var ENEMY_ATTACK = { smash: true, bite: true };   // 敵だけの攻撃（味方の魔法の選択肢に出さない）

  var DIRS = {
    up:    { dx: 0,  dy: -1, name: '上' },
    right: { dx: 1,  dy: 0,  name: '右' },
    down:  { dx: 0,  dy: 1,  name: '下' },
    left:  { dx: -1, dy: 0,  name: '左' }
  };
  var DIR_ORDER = ['up', 'right', 'down', 'left'];   // 同じ条件の候補が複数あるときの優先順

  // 【育つ】燃える植物（森・草むら）と、燃えて強い炎になる植物（今は森だけ）
  function isPlant(t) { return t === 'forest' || t === 'thicket'; }
  // 村は燃える（木でできていて、森と同じく火が点くと燃える。オーナー 11/03）。燃えた村は壊れ、そのマスは炎になる
  function isVillage(o) { return !!o && o.side === 'object' && o.kind === 'village'; }
  function burnVillage(s, o, ctx) { addHit(ctx, o, o.hp, 'burn', [o.x, o.y]); setTile(s, o.x, o.y, 'fire'); }
  // 【育つ】吹いている風（風・強風）
  function isWind(t) { return t === 'breeze' || t === 'gale'; }
  // 空気の中のもの・すぐ消える跡（吹いている風・強風・花びら）。地面に置かれた自然ではないので、
  //   置く魔法（草・土・山・旋風）・流れる水・川は、空きと同じく扱う（風と花びらは、置いた自然や水に入れ替わる）。
  //   前はマスがふさがっていて何も起きず（水は「風で止まった」）、同じターンに風より先に撃つか後に撃つかで結果が変わっていた（11/03）。
  //   火を入れると火の渦になる・花びらは燃えない、は今までどおり
  function isAiry(t) { return t === 'breeze' || t === 'gale' || t === 'petals'; }
  var PLACE_OVER_AIR = { grass: true, earth: true, mount: true, senpu: true };
  function burnsStrong(t) { return t === 'forest' || (t === 'thicket' && B.fire.plantStrong); }   // 【育つ】plantStrong で草むらも強い炎

  // 燃え広がりを止めるマス
  var SPREAD_BLOCKERS = { mountain: true, river: true, volcano: true, lava: true, tornado: true, sakura: true, haunted: true };

  var ENEMY_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // お題（IMPROVE_mission）
  //   annihilate: 敵の全滅（元の戦闘）／defense: 防衛（村を守る）／escort: 護衛（トロッコをゴールへ）／retrieve: 奪取（宝を帰り口へ）
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
    wagon:   { name: 'トロッコ', fixed: false }
  };


  // ---------------------------------------------------------------
  // 小さな道具
  // ---------------------------------------------------------------
  function clone(s) { return JSON.parse(JSON.stringify(s)); }

  // ステージごとの数値の上書き（チュートリアル①〜）
  //   s.overrides = { 'spread.maxLength': 3, ... }（balance.js の項目の道筋 → 値）。
  //   外から呼ばれる関数の間だけ BALANCE に重ね、終わったら必ず元に戻す（ほかのシナリオには漏れない）
  //   展示ステージ③〜: 魔法の形（'shapes.mount' などの配列）も、配列で上書きできる
  var ovDepth = 0;
  function ovSlot(path) {
    var parts = String(path).split('.'), last = parts.pop(), obj = B;
    for (var i = 0; i < parts.length; i++) {
      obj = obj[parts[i]];
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    }
    if (!Object.prototype.hasOwnProperty.call(obj, last) || (obj[last] && typeof obj[last] === 'object' && !Array.isArray(obj[last]))) return null;
    return { obj: obj, key: last };
  }
  // 上書きできる形か（知っている項目だけ・値の型が同じ。配列は配列でだけ）
  function validOverrides(ov) {
    if (!ov || typeof ov !== 'object' || Array.isArray(ov)) return false;
    return Object.keys(ov).every(function (p) {
      var sl = ovSlot(p);
      return !!sl && typeof ov[p] === typeof sl.obj[sl.key] && Array.isArray(ov[p]) === Array.isArray(sl.obj[sl.key]);
    });
  }
  function withOverrides(ov, fn) {
    var saved = [];
    if (!ovDepth && ov) {
      Object.keys(ov).forEach(function (p) {
        var sl = ovSlot(p);
        if (sl) { saved.push({ sl: sl, v: sl.obj[sl.key] }); sl.obj[sl.key] = ov[p]; }
      });
    }
    ovDepth++;
    try { return fn(); } finally {
      ovDepth--;
      for (var i = saved.length - 1; i >= 0; i--) saved[i].sl.obj[saved[i].sl.key] = saved[i].v;
    }
  }
  // 状態を受け取る関数を、その状態の上書きの中で動かす
  function withStage(fn) {
    return function (s) {
      var args = arguments;
      return withOverrides(s && s.overrides, function () { return fn.apply(null, args); });
    };
  }

  // 盤面の縦のマス数（チュートリアル②〜: 横長・縦長の盤面。s.h がなければ正方形で、横も縦も s.size）
  function rowsOf(s) { return s.h || s.size; }
  function inBounds(s, x, y) { return x >= 0 && y >= 0 && x < s.size && y < rowsOf(s); }
  function idx(s, x, y) { return y * s.size + x; }
  function getTile(s, x, y) { return s.tiles[idx(s, x, y)]; }
  function setTile(s, x, y, t) {
    var i = idx(s, x, y), old = s.tiles[i];
    if (old !== t && s.fireAge && s.fireAge[i] !== undefined) delete s.fireAge[i];
    if (old !== t && s.fireLife && s.fireLife[i] !== undefined) delete s.fireLife[i];
    // 【育つ】植物が燃えた炎は、燃え尽きるまでの長さが植物で決まる（森は長く、草むらはすぐ）
    if (t === 'fire' && B.grow.enabled && (old === 'forest' || old === 'thicket')) {
      s.fireLife = s.fireLife || {};
      s.fireLife[i] = old === 'forest' ? B.grow.forestBurnOut : B.grow.grassBurnOut;
    }
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
      if (u.size > 1 && x >= u.x && y >= u.y && x < u.x + u.size && y < u.y + u.size) return u;   // 大きい敵（③のボスなど）は size×size を占める
    }
    return null;
  }
  function findUnit(s, id) {
    for (var i = 0; i < s.units.length; i++) if (s.units[i].id === id) return s.units[i];
    return null;
  }
  function alliesOf(s) { return s.units.filter(function (u) { return u.side === 'ally'; }); }
  // 構える味方（チュートリアル）: プレイヤーが選べない・動かせない・撃たせられない味方。毎ターン同じ魔法を構え、発動フェーズで撃つ
  function isNpc(u) { return !!u && u.side === 'ally' && !!u.npc; }
  // プレイヤーが指示できる味方
  function controllableOf(s) { return alliesOf(s).filter(function (u) { return !u.npc; }); }

  // 【一斉】ターンの形（IMPROVE_simul）。'simul' のとき、味方の手番は「移動 → 向き → 構える」。
  //   構え（u.stance = { n }）はまだ起きず、味方の予告として盤面に出る。ターンの終わり（敵の発動の前）に、構えた順に発動する。
  //   構える味方（チュートリアル）の構えは、いつも最後。そのターンのうちなら構え直せる（移動は戻らない）。構えた順は並べ替えられる
  function simulOn() { return B.turnMode === 'simul'; }
  // 発動する順の味方: 構えた味方（n の小さい順）→ 構える味方（いつも最後）
  function stanceList(s) {
    var mine = alliesOf(s).filter(function (a) { return !a.npc && a.stance; }).sort(function (a, b) { return a.stance.n - b.stance.n; });
    return mine.concat(alliesOf(s).filter(function (a) { return a.npc && a.intent; }));
  }
  // 発動の順番（1から）。構えていなければ 0
  function stanceOrder(s, id) {
    var list = stanceList(s);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return i + 1;
    return 0;
  }
  function nextStanceN(s) {
    var n = 0;
    alliesOf(s).forEach(function (a) { if (a.stance && a.stance.n > n) n = a.stance.n; });
    return n + 1;
  }
  function enemiesOf(s) { return s.units.filter(function (u) { return u.side === 'enemy'; }); }
  // お題の置きもの（村・トロッコ）。自然ではなく、ユニットと同じ法則に従う（直撃・決め手・炎の上・風）
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
    var same = alliesOf(s).filter(function (a) { return a.magic === u.magic && !!a.npc === !!u.npc; });
    var base = (u.npc ? '構える味方「' : '味方「') + magicName(u.magic) + '」';
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
    if (u.magic === 'smash') return smashCells(s, u, facing);   // 展示ステージ③: ボスの一撃（体の前の数列）
    var o = castOrigin(s, u, facing);
    return shapeCells(s, u.magic, o.x, o.y, facing);
  }

  var FRONT_ONE = { grass: true, earth: true, fire: true };
  // 魔法の形のマス（盤の外は除く）。術者に近い順
  function shapeCells(s, magic, x, y, facing) {
    var out = [];
    // 【縮尺】shape.frontOne: 草・土・火の形を正面1マスにする（水・風は流れる・吹く長さを1マスに）
    var shp = B.shape.frontOne && FRONT_ONE[magic] ? [[0, 1]] : B.shapes[magic];
    if (shp) {
      var list = shp.map(function (p, i) { return { rx: p[0], ry: p[1], i: i }; });
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
  function unitConf(u) {
    var c = u.side === 'ally' ? B.ally : u.side === 'enemy' ? B.enemy : { hp: B.mission[u.kind].hp, power: 0, move: 0 };
    if (u.hpBase) c = { hp: u.hpBase, power: c.power, move: c.move };   // 展示ステージ③: シナリオで決めたHP（ボスは大きく、取り巻きは1）
    return c;
  }
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
      u.stand = B.enemy.stand;
      u.intent = false;     // 予告中か（予告は今の位置と向きに固定）
    }
    return u;
  }

  // 敵の個性
  var PERSONA = {
    aim:   { count: '人数', near: '近い人', nature: '自然', target: '的' },
    avoid: { wall: '通れない所だけ', danger: '危ない所も' },
    cross: { none: 'なし', river: '川を渡る' },
    // 動き（チュートリアル）: 動かない ＝ 移動しない・撃たない・予告を出さない
    //   進む ＝ 向いている方へ毎ターン1マスずつ進む（敵の発動のあと）。今の位置から向きの方へ撃って構える味方に当たるときだけ予告して撃つ
    //          （構える味方がいないシナリオでは、味方の誰かに当たるとき）
    //   突進 ＝ 人は無視して一番近い村へ走る（1ターンに enemy.rushMove マス）。魔法は撃たない。走り終えて村の隣なら体当たりで村を壊す（チュートリアル②）
    //   ボス ＝ 大きい体。1ターンに1マス、向いている方（味方の側）へ進み、体の前の数列に一撃を予告する。ふさがれていたら進まない（展示ステージ③）
    //   浮く ＝ 地形に関係なく、風の人へまっすぐ進む（1ターンに stage3.minionMove マス。ユニットのいるマスには入らない）。風の人の隣に来たら体当たりを予告する（展示ステージ③）
    stand: { move: '動いて撃つ', still: '動かない', march: '1マスずつ進む', rush: '突進（村へ走る）', boss: 'ボス（前へ進み、一撃）', float: '浮く（風の人へまっすぐ）' }
  };
  var PERSONA_FIELDS = Object.keys(PERSONA);
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
  function allyMagics(s) { var only = enemyOnlyMagics(s); return MAGICS.filter(function (m) { return only.indexOf(m) < 0 && !ENEMY_ATTACK[m]; }); }
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

  // お題の状態。goal: トロッコのゴール、exit: 帰り口、treasure: 落ちている宝の位置（持たれていたら null）、carrier: 宝を持つ味方の id、lost: 壊れた村の数
  function newMission(type) {
    return { type: MISSION_INFO[type] ? type : 'annihilate', goal: [], exit: [], treasure: null, carrier: null, lost: 0 };
  }
  function missionType(s) { return (s.mission && s.mission.type) || 'annihilate'; }
  function inCells(list, x, y) { return (list || []).some(function (c) { return c[0] === x && c[1] === y; }); }

  // h: 縦のマス数（省略で正方形）。横と違うときだけ s.h に持つ
  function blankState(size, enemyActs, h) {
    size = clampSize(size);
    h = h ? clampSize(h) : size;
    var s = { version: 2, size: size, tiles: [], units: [], enemyActs: enemyActs !== false, turn: 1, result: null, seq: 0, fireAge: {}, mission: newMission('annihilate') };
    if (h !== size) s.h = h;
    for (var i = 0; i < size * h; i++) s.tiles.push('empty');
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
  // after: ダメージを入れたあとに動かす処理（倒れた者のマスに山を盛る など）
  function newShot() { return { hits: {}, order: [], phrases: [], finishers: [], cells: [], grows: [], after: [], notes: [] }; }

  // cell: 決め手がどのマスで当たったか
  function addHit(ctx, u, amount, src, cell) {
    var h = ctx.hits[u.id];
    if (!h) {
      ctx.hits[u.id] = { amount: amount, src: src };
      ctx.order.push(u.id);
    } else if (amount > h.amount) {
      h.amount = amount; h.src = src;
    }
  }

  var SRC_NOTE = { finisher: '', weakfire: '（弱い炎）', ram: '（体当たり）', edge: '（決め手の外側）', weak: '（弱い）', flood: '（川に押し流された）' };
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
      ev.push({ type: 'death', side: u.side, kind: u.kind, id: u.id, npc: !!u.npc, text: unitLabel(s, u) + verb, cells: [[u.x, u.y]] });
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
    // 展示ステージ③: 味方が1人でも倒れたら負け（ステージの頭からやり直し）。ボスを倒したら勝ち（取り巻きは倒しきれないので数えない）
    if (s.ex) {
      if (allyDied) { setResult(s, ev, 'lose', '味方が倒れた…（ステージの頭からやり直し）'); return; }
      if (enemyDied && !enemiesOf(s).some(function (e) { return e.stand === 'boss'; })) { setResult(s, ev, 'win', 'ボスを倒した！（勝利）'); return; }
    }
    // 構える味方（チュートリアルの相方）が倒れたら失敗（同じ1発で自分も倒れたときも、こちらを出す）
    if (ev.some(function (e) { return e.type === 'death' && e.npc; })) { setResult(s, ev, 'lose', '構える味方が倒れた…（失敗）'); return; }
    // 動かせる味方が全員倒れたら負け（構える味方しか残っていなくても負け）
    if (allyDied && controllableOf(s).length === 0) { setResult(s, ev, 'lose', '味方が全員倒れた…（敗北）'); return; }
    if (type === 'defense' && (m.lost || 0) >= B.mission.defense.loseAt) { setResult(s, ev, 'lose', '村が壊された…（敗北）'); return; }
    if (type === 'escort' && ev.some(function (e) { return e.type === 'death' && e.kind === 'wagon'; }) && !objectsOf(s, 'wagon').length) {
      setResult(s, ev, 'lose', 'トロッコが壊された…（敗北）'); return;
    }
    if (type === 'escort') {
      var w = objectsOf(s, 'wagon')[0];
      if (w && inCells(m.goal, w.x, w.y)) { setResult(s, ev, 'win', 'トロッコがゴールに着いた！（勝利）'); return; }
    }
    if ((type === 'annihilate' || type === 'defense') && enemyDied && enemiesOf(s).length === 0) {
      setResult(s, ev, 'win', '敵を全員倒した！（勝利）');
    }
  }

  // 水か氷が当たると、火傷が治る
  function cureBurn(s, u, ctx) {
    if (u && u.burn > 0) { u.burn = 0; ctx.phrases.push(unitLabel(s, u) + 'の火傷が治った'); }
  }

  // 足止めを1回使う（数で持っているときは1つ減らす）
  function unstick(u) { if (typeof u.stuck === 'number' && u.stuck > 1) u.stuck--; else u.stuck = false; }

  // 泥沼に入った: 次の移動が1回できない
  function enterMud(s, u, ev) {
    u.stuck = true;
    ev.push({ type: 'mud', id: u.id, cells: [[u.x, u.y]], text: unitLabel(s, u) + 'は泥沼にはまった（次の移動は1回休み）' });
  }

  // ---------------------------------------------------------------
  // 決め手
  // ---------------------------------------------------------------

  // 燃え広がり: 風が炎か小さな炎に当たる
  // bonus: 【育つ】強風で起こしたときに長くなるマス数
  function doSpread(s, ox, oy, dir, ctx, ev, bonus) {
    var F = DIRS[dir];
    var path = [];
    var burned = {}, burnedList = [];

    function burnComponent(sx, sy) {
      var stack = [[sx, sy]];
      while (stack.length) {
        var c = stack.pop();
        var k = key(c[0], c[1]);
        var bt = getTile(s, c[0], c[1]);
        if (burned[k] || !(isPlant(bt))) continue;
        burned[k] = bt;
        burnedList.push(c);
        neighbors(s, c[0], c[1]).forEach(function (n) { stack.push([n.x, n.y]); });
      }
    }

    var maxLen = B.spread.maxLength + (bonus || 0);
    var before = [];
    var mountainAt = null;   // 風が運んだ炎が届いた山（火が山に点くのと同じく、山脈ごと火山になる。オーナー 10/31）
    for (var i = 1; i <= maxLen; i++) {
      var x = ox + F.dx * i, y = oy + F.dy * i;
      if (!inBounds(s, x, y)) break;
      var t = getTile(s, x, y);
      if (t === 'mountain') { mountainAt = [x, y]; break; }
      if (SPREAD_BLOCKERS[t]) break;
      path.push([x, y]);
      before.push(t);
      if (isPlant(t)) burnComponent(x, y);
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
    // 強い炎になるのは、燃えた森のマス（【育つ】草むらは燃えるが、今は弱い炎）
    var strongList = burnedList.filter(function (c) { var bt = burned[key(c[0], c[1])]; return burnsStrong(bt); });
    var grassN = burnedList.length - strongList.length;
    var villagesBurned = 0;
    cells.forEach(function (c) {
      var u = unitAt(s, c[0], c[1]);
      if (!u) return;
      if (isVillage(u)) { burnVillage(s, u, ctx); villagesBurned++; return; }   // 通り道の村は燃える（マスは炎。燃え広がりはそのまま先へ走る。オーナー 11/03）
      if (burnsStrong(burned[key(c[0], c[1])])) addHit(ctx, u, B.fire.strongDamage, 'finisher', c);
      else addHit(ctx, u, B.fire.weakDamage, 'weakfire', c);
    });
    var amount = strongList.length ? B.fire.strongDamage : B.fire.weakDamage;
    var fin = { name: '燃え広がり', cells: cells, strong: strongList.slice(), damage: amount, forests: strongList.length, dir: dir, origin: [ox, oy] };
    ctx.finishers.push(fin);
    ev.push({
      type: 'finisher', name: '燃え広がり', cells: cells, strong: strongList.slice(), damage: amount, forests: strongList.length, dir: dir, origin: [ox, oy],
      text: '燃え広がり！ ' + DIRS[dir].name + 'へ' + path.length + 'マス走り、' +
        (strongList.length ? '森' + strongList.length + 'つが燃えた（燃えた森の上は威力' + B.fire.strongDamage + '、ほかは' + B.fire.weakDamage + '＋火傷）'
          : '燃えた森はなし（弱い炎: 威力' + B.fire.weakDamage + '＋火傷）') +
        (grassN ? '。【育つ】草むら' + grassN + 'マスも燃えた' : '') +
        (villagesBurned ? '。村' + villagesBurned + 'つも燃えた' : '')
    });
    if (mountainAt) { ctx.phrases.push('燃え広がりが山に届いて火が点いた'); doFunka(s, mountainAt[0], mountainAt[1], ctx, ev, {}); }
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
        if (u && !touched[u.id]) { touched[u.id] = true; addHit(ctx, u, amount, 'finisher', p); }
      });
    });
    var fin = { name: '感電', cells: net, damage: amount, water: net.length };
    ctx.finishers.push(fin);
    ev.push({ type: 'finisher', name: '感電', isNew: true, origin: [sx, sy], cells: net, damage: amount, text: '【新案】感電！ つながった水' + net.length + 'マスに雷が走った（威力' + amount + '）' });
    return fin;
  }

  // 【新案】桜吹雪: 風が火山に当たる（破壊3段目）
  //   花びら（sakura.petals が false なら火の粉）が風下へ扇形に舞い散る。つながった火山が多いほど強い。噴き終えた火山は冷えて山に戻る
  function doEruption(s, vx, vy, dir, ctx, ev) {
    if (B.eruption.toEdge && getTile(s, vx, vy) === 'volcano') return doSakuraStorm(s, vx, vy, dir, ctx, ev);   // 扇は火山の幅から盤の奥まで（前は展示ステージ③だけ。10/29 から切り替え。初期は切）
    var kind = getTile(s, vx, vy), pink = kind === 'sakura' || kind === 'hillsakura' || B.sakura.petals;   // 花びらか、元の火の粉（火山で sakura.petals が false のときだけ）
    // 【育つ】桜吹雪の奥行きは、桜が咲いた自然の大きさで決まる（丘は2列、山は3列）
    var depth = kind === 'hillsakura' ? B.grow.sakuraDepthHill : (B.grow.enabled && kind === 'sakura') ? B.grow.sakuraDepthMountain : B.eruption.depth;
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
    // 広げた自然が大きいほど大きく（eruption.scale、オーナー 10/17）: 扇は今までどおり、風が当たった火山から風下へ1段ずつ。
    //   ただし幅は、つながった火山の幅（風の向きと直角）から始まり、1段ごとに左右へ1マスずつ広がる。
    //   奥行きは、つながった火山の一番先から先にも depth 段届くように、火山の中を通る段の分だけ伸びる。
    //   火山1つなら今までと同じ（1・3・5マス）。元の形より小さくはならない。
    var scaled = B.eruption.scale;
    var hitAlong = vx * F.dx + vy * F.dy, front = hitAlong, lo = 0, hi = 0;
    if (scaled) {
      var side = comp.map(function (c) { return c[0] * Rx + c[1] * Ry; });
      front = Math.max.apply(null, comp.map(function (c) { return c[0] * F.dx + c[1] * F.dy; }));
      lo = Math.min.apply(null, side); hi = Math.max.apply(null, side);
      depth += front - hitAlong;
    }
    var cells = [];
    for (var d = 1; d <= depth; d++) {
      if (scaled) {
        // 向きの軸 hitAlong+d・横の軸 w のマス（F と R は直交する単位ベクトルなので、x = 軸×F ＋ 横×R）
        for (var w2 = lo - (d - 1); w2 <= hi + (d - 1); w2++) {
          var x2 = F.dx * (hitAlong + d) + Rx * w2, y2 = F.dy * (hitAlong + d) + Ry * w2;
          if (inBounds(s, x2, y2)) cells.push([x2, y2]);
        }
        continue;
      }
      for (var w = -(d - 1); w <= d - 1; w++) {
        var x = vx + F.dx * d + Rx * w, y = vy + F.dy * d + Ry * w;
        if (inBounds(s, x, y)) cells.push([x, y]);
      }
    }
    var inComp = function (c) { return comp.some(function (v) { return v[0] === c[0] && v[1] === c[1]; }); };
    var wideNote = scaled && comp.length > 1 ? '。火山の大きさの分、扇が広がった（' + cells.filter(function (c) { return !inComp(c); }).length + 'マス）' : '';
    var amount = B.eruption.base + comp.length * B.eruption.perVolcano;
    var burned = 0;
    cells.forEach(function (c) {
      var u = unitAt(s, c[0], c[1]);
      if (u) addHit(ctx, u, amount, 'finisher', c);
      var t = getTile(s, c[0], c[1]);
      if (pink) { if (t === 'empty') setTile(s, c[0], c[1], 'petals'); return; }   // 【新案・試し】桜なら花びらが積もる（燃えない）
      if (t === 'empty') setTile(s, c[0], c[1], 'smallfire');
      else if (t === 'forest') { setTile(s, c[0], c[1], 'fire'); burned++; }
      else if (t === 'thicket') setTile(s, c[0], c[1], 'fire');
    });
    comp.forEach(function (c) { setTile(s, c[0], c[1], kind === 'hillsakura' ? 'hill' : 'mountain'); });   // 散ると元の丘・山に戻る
    var fin = { name: '桜吹雪', cells: cells, damage: amount, volcanoes: comp.length, pink: pink, dir: dir, origin: [vx, vy] };
    ctx.finishers.push(fin);
    ev.push({
      type: 'finisher', name: '桜吹雪', isNew: true, origin: [vx, vy], cells: cells, damage: fin.damage, pink: pink, dir: dir,
      text: '【新案】桜吹雪！ ' + (kind === 'volcano' ? '火山' : '桜') + comp.length + 'つの' + (pink ? '花びら' : '火の粉') + 'が' + DIRS[dir].name + 'へ舞い散った（威力' + fin.damage + '）' +
        wideNote + (burned ? '。森' + burned + 'つに火がついた' : '')
    });
    return fin;
  }

  // 桜吹雪（eruption.toEdge が入のとき。前は展示ステージ③だけ）。風が火山に当たると、つながった火山がまるごと吹き上がり、風の向きへ扇形に盤の奥まで舞う。
  //   扇は火山の幅（風の向きと直角の幅）から始まり、stage3.fanSpread マス進むごとに左右へ1マスずつ広がる（山が大きいほど扇も広い）。
  //   届くのは stage3.fanReach マス（0 は盤の端まで）。扇と火山の上にいる者（浮いている者も）に決め手のダメージ。
  //   空きには花びらが積もる。吹き終えた火山は山に戻る
  function doSakuraStorm(s, vx, vy, dir, ctx, ev) {
    var F = DIRS[dir], Rv = [-F.dy, F.dx];
    var comp = connected(s, vx, vy, 'volcano');
    var along = function (c) { return c[0] * F.dx + c[1] * F.dy; }, side = function (c) { return c[0] * Rv[0] + c[1] * Rv[1]; };
    var front = Math.max.apply(null, comp.map(along));
    var lo = Math.min.apply(null, comp.map(side)), hi = Math.max.apply(null, comp.map(side));
    var cells = [], wave = [];
    for (var d = 1; ; d++) {
      if (B.stage3.fanReach > 0 && d > B.stage3.fanReach) break;
      var grow = B.stage3.fanSpread > 0 ? Math.floor(d / B.stage3.fanSpread) : 0, any = false;
      for (var w = lo - grow; w <= hi + grow; w++) {
        var x = F.dx * (front + d) + Rv[0] * w, y = F.dy * (front + d) + Rv[1] * w;   // 向きの軸 front+d・横の軸 w のマス
        if (!inBounds(s, x, y)) continue;
        any = true;
        cells.push([x, y]); wave.push(d);
      }
      if (!any) break;
    }
    var amount = B.eruption.base + comp.length * B.eruption.perVolcano;
    comp.concat(cells).forEach(function (c) { var u = unitAt(s, c[0], c[1]); if (u) addHit(ctx, u, amount, 'finisher', c); });
    var petals = 0;
    cells.forEach(function (c) { if (getTile(s, c[0], c[1]) === 'empty') { setTile(s, c[0], c[1], 'petals'); petals++; } });
    comp.forEach(function (c) { setTile(s, c[0], c[1], 'mountain'); });
    var fin = { name: '桜吹雪', cells: cells, damage: amount, volcanoes: comp.length, pink: true, dir: dir, origin: [vx, vy], source: comp };
    ctx.finishers.push(fin);
    ev.push({
      type: 'finisher', name: '桜吹雪', origin: [vx, vy], cells: cells, wave: wave, damage: amount, pink: true, dir: dir, source: comp,
      text: '桜吹雪！ 火山' + comp.length + 'つがまるごと吹き上がり、' + DIRS[dir].name + 'へ花びらが盤の奥まで舞った（扇' + cells.length + 'マス・威力' + amount + '）'
    });
    return fin;
  }

  // ---------------------------------------------------------------
  // 魔法を撃つ（術者の今の位置と向きから）
  // ---------------------------------------------------------------

  // 【育つ】育つ範囲（(x,y) が元）。size: 1 そのマスだけ／4 2×2（元を角に、術者から見て奥・右へ）／5 十字／9 3×3
  //   ほかの数は、それ以下で一番近いもの。元に近い順（波の順）に並べ、d は元からの歩数
  function growArea(s, x, y, facing, size) {
    var offs;
    if (size >= 9) offs = [[0, 0], [0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    else if (size >= 5) offs = [[0, 0], [0, 1], [1, 0], [0, -1], [-1, 0]];
    else if (size >= 4) offs = [[0, 0], [0, 1], [1, 0], [1, 1]];
    else offs = [[0, 0]];
    var out = [];
    offs.forEach(function (o) {
      var d = rotate(facing, o[0], o[1]);   // o は術者から見て [右, 奥]
      var cx = x + d[0], cy = y + d[1];
      if (inBounds(s, cx, cy)) out.push({ x: cx, y: cy, d: Math.abs(o[0]) + Math.abs(o[1]) });
    });
    return out;
  }
  // 【育つ】元 (x,y) から見た (dx,dy) の外向き（縦横で差の大きい方。同じなら術者の向きの軸で外へ）
  function outwardDir(dx, dy, facing) {
    var ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax === ay) { if (DIRS[facing].dx !== 0) ay = -1; else ax = -1; }
    if (ax > ay) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'down' : 'up';
  }

  // 【育つ】(x,y) を元に、範囲の from のマスを to に育てる。術者 u の魔法として働く
  //   opts.slope: 元以外のマスは slope にする（山のまわりは丘、のグラデーション）
  //   opts.push:  to が通れないとき、範囲にいる者を元から見て外向きに1マス押し出す（風で押されたときと同じく、直撃＋押す）。
  //               押せなければその者は残り、そのマスは育たない
  //   ユニットのいるマス（押し出さないとき）・ほかの自然のマスは育たない（blocked）
  //   見せ方のため ctx.grows に { origin, tile, cells, tiles, wave, blocked, pushed } を残す（cast の出来事に付く）
  function growNature(s, x, y, u, facing, size, from, to, ctx, ev, phrase, opts) {
    opts = opts || {};
    var g = { origin: [x, y], tile: to, cells: [], tiles: [], wave: [], blocked: [], pushed: [] }, raised = [];
    var area = growArea(s, x, y, facing, size);
    function target(c) { return c.d > 0 && opts.slope ? opts.slope : to; }
    if (opts.push) {
      // 遠いマスから押す（並んでいても外側から空ける）
      area.map(function (c, i) { return { c: c, i: i }; })
        .sort(function (p, q) { return q.c.d - p.c.d || p.i - q.i; })
        .forEach(function (e) {
          var c = e.c, o = unitAt(s, c.x, c.y), t = getTile(s, c.x, c.y), tt = target(c);
          if (!o || t === tt || t === to || !from[t] || isPassable(tt)) return;
          addHit(ctx, o, u.power, 'direct');
          var dir = outwardDir(c.x - x, c.y - y, facing);
          if (pushOne(s, o, dir, ev, '【育つ】' + unitLabel(s, o) + 'は盛り上がる' + tileName(tt) + 'に押し出された（' + DIRS[dir].name + 'へ1マス）')) g.pushed.push(o.id);
        });
    }
    area.forEach(function (c) {
      var t = getTile(s, c.x, c.y), tt = target(c);
      if (t === tt || t === to) return;   // もう同じか、より高い（山のまわりの丘にしようとしたら山だった）
      var under = B.ideas.natureUnderUnits;   // 人の足元にも育つ（オーナー 10/30: 山も。足元に山ができた人は、あとで押し出す）
      var stand = unitAt(s, c.x, c.y);
      if (!from[t] || (stand && !under)) { g.blocked.push([c.x, c.y]); return; }
      setTile(s, c.x, c.y, tt);
      if (stand && !isPassable(tt) && raised.indexOf(stand) < 0) raised.push(stand);
      g.cells.push([c.x, c.y]);
      g.tiles.push(tt);
      g.wave.push(c.d);
      if (!inCells(ctx.cells, c.x, c.y)) ctx.cells.push([c.x, c.y]);
    });
    raised.forEach(function (o) { pushOffMountain(s, o, [x, y], ev); });
    ctx.grows.push(g);
    if (g.cells.length) ctx.phrases.push(phrase + '（' + g.cells.length + 'マス）');
    return g;
  }

  // 魔法の中心（足元に山ができた人を押し出す向きの元）: 形に真ん中（shapeCenter）があればそこ。
  //   なければ、形のマスの真ん中（位置の平均）にいちばん近いマス（山の頂上と同じ決め方。同じ近さなら 形の中の隣が多い → 上 → 左）。
  //   一直線の形（1マスだけの形も）は中心がない（null）
  function castCenter(s, u, facing) {
    var o = castOrigin(s, u, facing), ctr = B.shapeCenter && B.shapeCenter[u.magic];
    if (ctr) { var d0 = rotate(facing, ctr[0], ctr[1]); return [o.x + d0[0], o.y + d0[1]]; }
    var shp = B.shape.frontOne && FRONT_ONE[u.magic] ? [[0, 1]] : B.shapes[u.magic];
    if (!shp || !shp.length) return null;
    var cells = shp.map(function (p) { var d = rotate(facing, p[0], p[1]); return [o.x + d[0], o.y + d[1]]; });
    var line = cells.every(function (c) { return c[0] === cells[0][0]; }) || cells.every(function (c) { return c[1] === cells[0][1]; });
    if (line) return null;
    var n = cells.length, sx = 0, sy = 0;
    cells.forEach(function (c) { sx += c[0]; sy += c[1]; });
    var far = function (c) { return Math.abs(n * c[0] - sx) + Math.abs(n * c[1] - sy); };
    var around = function (c) { return cells.filter(function (q) { return Math.abs(q[0] - c[0]) + Math.abs(q[1] - c[1]) === 1; }).length; };
    return cells.slice().sort(function (a, b) { return (far(a) - far(b)) || (around(b) - around(a)) || (a[1] - b[1]) || (a[0] - b[0]); })[0];
  }
  // 足元に山（通れない自然）ができた人を、山の外へ押し出す（オーナー 10/30。ランダムにはしない）
  //   向き: 魔法の中心 center から見て外側（縦と横でずれの大きい方。同じなら下）。中心がない（一直線の魔法）なら下。
  //   その向きに進んで、最初の空きマス（通れる自然で、人も置きもの（村など）もいない）へ。人や村のいるマスは空きではないので、さらに先へ。
  //   その向きで盤の端まで空きがなければ、下・左・右・上の順に同じように探す。どの向きにもなければ、その場（山の上）に残る。
  //   大きい体は、体の全部が空きマスに入る所へ。押し出された先が泥沼なら、はまる
  var PUSH_OFF_ORDER = ['down', 'left', 'right', 'up'];
  function pushOffMountain(s, o, center, ev) {
    if (!o || o.hp <= 0 || isFixed(o)) return false;
    var n = o.size || 1, mx = o.x + (n - 1) / 2, my = o.y + (n - 1) / 2, first = 'down';
    if (center) {
      var dx = mx - center[0], dy = my - center[1];
      if (Math.abs(dx) > Math.abs(dy)) first = dx > 0 ? 'right' : 'left';
      else if (Math.abs(dy) > Math.abs(dx)) first = dy > 0 ? 'down' : 'up';
    }
    var order = [first].concat(PUSH_OFF_ORDER.filter(function (d) { return d !== first; }));
    var fits = function (x, y) {
      return bodyCells(o, x, y).every(function (c) {
        if (!isPassable(getTile(s, c[0], c[1]))) return false;
        var b = unitAt(s, c[0], c[1]);
        return !b || b === o;
      });
    };
    var inside = function (x, y) { return bodyCells(o, x, y).every(function (c) { return inBounds(s, c[0], c[1]); }); };
    for (var i = 0; i < order.length; i++) {
      var F = DIRS[order[i]];
      for (var k = 1; inside(o.x + F.dx * k, o.y + F.dy * k); k++) {
        var nx = o.x + F.dx * k, ny = o.y + F.dy * k;
        if (!fits(nx, ny)) continue;
        var from = [o.x, o.y];
        o.x = nx; o.y = ny;
        ev.push({ type: 'push', id: o.id, ok: true, from: from, to: [nx, ny], text: unitLabel(s, o) + 'は足元に盛り上がった山から' + F.name + 'へ押し出された（' + k + 'マス）' });
        if (getTile(s, nx, ny) === 'mud') enterMud(s, o, ev);
        return true;
      }
    }
    ev.push({ type: 'push', id: o.id, ok: false, text: unitLabel(s, o) + 'は山の上に残った（押し出す先がない）' });
    return false;
  }

  // 置く（草・土）・点ける（火）・【新案】走る（雷）
  // 山を盛る1マス（土と同じ。ただし育つの入切にかかわらず一度で山）
  function mountCell(s, x, y, ctx) {
    var t = getTile(s, x, y);
    if (t === 'empty') { setTile(s, x, y, 'mountain'); ctx.phrases.push('山ができた'); return true; }
    if (t === 'river' || t === 'puddle') { setTile(s, x, y, 'mud'); ctx.phrases.push(tileName(t) + 'が泥沼になった'); return true; }
    if (B.ideas.earthSmother && (t === 'fire' || t === 'smallfire')) { setTile(s, x, y, 'mountain'); ctx.phrases.push('【新案】土をかぶせて' + tileName(t) + 'を消した（山になった）'); return true; }
    return false;
  }


  function placeOrIgnite(s, u, facing, ctx, ev) {
    var shocked = {}, erupted = {}, planted = [], growFrom = [], raised = [];   // raised: 足元に山ができた人（形のマスを全部済ませてから押し出す）
    var raise = function (o, x, y) { if (o && !isPassable(getTile(s, x, y)) && raised.indexOf(o) < 0) raised.push(o); };
    castCells(s, u, facing).forEach(function (c) {
      var x = c[0], y = c[1];
      ctx.cells.push([x, y]);
      var o = unitAt(s, x, y);
      if (o) addHit(ctx, o, u.power, 'direct');
      if (ENEMY_ATTACK[u.magic]) { if (o) ctx.phrases.push(unitLabel(s, o) + 'に当たった'); return; }   // 展示ステージ③の敵の攻撃: 自然は作らない
      var t = getTile(s, x, y);
      if (isAiry(t) && PLACE_OVER_AIR[u.magic]) { setTile(s, x, y, 'empty'); t = 'empty'; }   // 風・花びらの上にも置ける（isAiry）
      // 人の足元にも自然ができる（ideas.natureUnderUnits）: 人がいても置く。
      //   オーナー 10/30: 山（通れない）も足元に盛る。足元に山ができた人は、形のマスを全部済ませてから山の外へ押し出す（pushOffMountain）
      var free = function () { return !o || (B.ideas.natureUnderUnits); };
      if (u.magic === 'grass') {
        // 【育つ】入のときは、空きに草で草むら、草むらに草で森に育つ
        var lowG = B.grow.enabled ? 'thicket' : 'forest';
        if (free(lowG) && t === 'empty') { setTile(s, x, y, lowG); ctx.phrases.push(tileName(lowG) + 'ができた' + (o ? '（' + unitLabel(s, o) + 'の足元）' : '')); planted.push([x, y, lowG]); }
        else if (free('forest') && t === 'thicket' && B.grow.enabled) growFrom.push([x, y]);
        else if (free('sakura') && t === 'mountain' && B.sakura.from === 'grass') { setTile(s, x, y, 'sakura'); ctx.phrases.push('【新案】山に桜が咲いた'); raise(o, x, y); }
        else if (free('hillsakura') && t === 'hill' && B.grow.enabled && B.sakura.from === 'grass') { setTile(s, x, y, 'hillsakura'); ctx.phrases.push('【育つ】丘に桜が咲いた'); }
      } else if (u.magic === 'earth') {
        // 【育つ】入のときは、空きに土で丘、丘に土で山に育つ。火を埋めても丘
        var low = B.grow.enabled ? 'hill' : 'mountain';
        if (free(low) && t === 'empty') { setTile(s, x, y, low); ctx.phrases.push(tileName(low) + 'ができた' + (o ? '（' + unitLabel(s, o) + 'の足元）' : '')); raise(o, x, y); }
        else if (free('mountain') && t === 'hill' && B.grow.enabled) growFrom.push([x, y]);   // 育つのは、形のほかのマスを済ませたあと（順番で結果が変わらないように）
        else if (free('mud') && (t === 'river' || t === 'puddle')) { setTile(s, x, y, 'mud'); ctx.phrases.push(tileName(t) + 'が泥沼になった'); if (o) enterMud(s, o, ev); }
        else if (free(low) && B.ideas.earthSmother && (t === 'fire' || t === 'smallfire')) { setTile(s, x, y, low); ctx.phrases.push('【新案】土をかぶせて' + tileName(t) + 'を消した（' + tileName(low) + 'になった）'); raise(o, x, y); }
      } else if (u.magic === 'mount') {
        // 盛る（山）: 一度で山。ユニットのいるマスは直撃し、足元にも山を盛る（オーナー 10/30。前は倒れたときだけ）。足元の山からは押し出す
        if (free('mountain') && mountCell(s, x, y, ctx)) { raise(o, x, y); if (o && getTile(s, x, y) === 'mud') enterMud(s, o, ev); }
      } else if (u.magic === 'senpu') {
        if (!o && t === 'empty') { setTile(s, x, y, 'whirlwind'); ctx.phrases.push('【新案】つむじ風が巻き起こった'); }
      } else if (u.magic === 'fire') {
        if (isVillage(o)) { burnVillage(s, o, ctx); ctx.phrases.push(unitLabel(s, o) + 'に火が点いて燃えた'); }   // 村は燃える（オーナー 11/03）
        else if (t === 'empty') { setTile(s, x, y, 'smallfire'); ctx.phrases.push('小さな炎がついた'); }
        else if (t === 'smallfire' && B.grow.enabled) { setTile(s, x, y, 'fire'); ctx.phrases.push('【育つ】小さな炎が炎に育った'); ctx.grows.push({ origin: [x, y], tile: 'fire', cells: [[x, y]], tiles: ['fire'], wave: [0], blocked: [], pushed: [] }); }
        else if (t === 'deadforest') { ctx.phrases.push('【新案】死の森に火が灯った'); doHaunt(s, x, y, ctx, ev); }
        else if (isWind(t)) { ctx.phrases.push('【新案】吹いている' + tileName(t) + 'に火が入った'); doFireWhirl(s, x, y, facing, ctx, ev); }
        else if (isPlant(t)) { setTile(s, x, y, 'fire'); ctx.phrases.push(tileName(t) + 'が燃えた'); }
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
    if (raised.length) { var ctr = castCenter(s, u, facing); raised.forEach(function (o) { pushOffMountain(s, o, ctr, ev); }); }
    // 【育つ】草むらに草: 草むらを元に、まわりの空きと草むらが森に茂る（森は通れるので押し出さない）
    if (u.magic === 'grass') growFrom.forEach(function (c) {
      var g = growNature(s, c[0], c[1], u, facing, B.grow.forestSize, { empty: true, thicket: true }, 'forest', ctx, ev, '【育つ】草むらが森に育った');
      g.cells.forEach(function (gc) { planted.push([gc[0], gc[1], 'forest']); });
    });
    // 【育つ】丘に土: 丘を元に、まわりの空きと丘が山に盛り上がる
    if (u.magic === 'earth') growFrom.forEach(function (c) {
      growNature(s, c[0], c[1], u, facing, B.grow.mountainSize, { empty: true, hill: true }, 'mountain', ctx, ev, '【育つ】丘が山に育った',
        { push: B.grow.pushOut, slope: B.grow.mountainSlope ? 'hill' : null });
    });
    // 【新案】水辺の森はよく育つ: 水に接して植えた森は、水に接しているとなりの空きにも広がる
    if (B.ideas.wetlandForest && planted.length) {
      var isWet = function (x, y) { return neighbors(s, x, y).some(function (n) { var tt = getTile(s, n.x, n.y); return tt === 'river' || tt === 'puddle'; }); };
      var grown = 0;
      planted.forEach(function (c) {
        if (!isWet(c[0], c[1])) return;
        neighbors(s, c[0], c[1]).forEach(function (n) {
          if (getTile(s, n.x, n.y) === 'empty' && !unitAt(s, n.x, n.y) && isWet(n.x, n.y)) { setTile(s, n.x, n.y, c[2] || 'forest'); grown++; ctx.cells.push([n.x, n.y]); }
        });
      });
      if (grown) ctx.phrases.push('【新案】水辺で' + (planted.every(function (c) { return c[2] === 'thicket'; }) ? '草むら' : '森') + 'が広がった（＋' + grown + 'マス）');
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
      var tall = o || t === 'forest' || t === 'mountain' || t === 'hill' || t === 'volcano' || t === 'sakura' || t === 'hillsakura' || t === 'deadforest' || t === 'haunted';
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
      ev.push({ type: 'kindle', isNew: true, made: 'volcano', origin: [sx, sy], cells: range, text: '【新案】山脈' + range.length + 'つが一気に火山になった（風を当てると桜吹雪）' });
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
          else if (t === 'thicket') { hitCell(); setTile(s, n.x, n.y, 'fire'); }
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
  var WHIRL_OK = { empty: true, smallfire: true, fire: true, breeze: true, gale: true, whirlwind: true, forest: true };
  function doFireWhirl(s, x, y, facing, ctx, ev) {
    var F = DIRS[facing], Rx = -F.dy, Ry = F.dx;
    var best = null;
    [[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]].forEach(function (tl) {
      var sq = [[tl[0], tl[1]], [tl[0] + 1, tl[1]], [tl[0], tl[1] + 1], [tl[0] + 1, tl[1] + 1]];
      if (!sq.every(function (c) { return inBounds(s, c[0], c[1]) && WHIRL_OK[getTile(s, c[0], c[1])]; })) return;
      var wind = sq.filter(function (c) { return isWind(getTile(s, c[0], c[1])); }).length;
      var ahead = (tl[0] + 0.5 - x) * F.dx + (tl[1] + 0.5 - y) * F.dy;   // 火を入れた者から見て奥ほど大きい
      var right = (tl[0] + 0.5 - x) * Rx + (tl[1] + 0.5 - y) * Ry;       // 右ほど大きい
      if (!best || wind > best.wind || (wind === best.wind && (ahead > best.ahead || (ahead === best.ahead && right > best.right)))) best = { sq: sq, wind: wind, ahead: ahead, right: right };
    });
    if (!best) { ctx.phrases.push('火の渦になる場所がなく、風に火が乗っただけ'); setTile(s, x, y, 'fire'); return null; }
    var cells = best.sq, cx = 0, cy = 0, strong = [];
    cells.forEach(function (c) {
      cx += c[0]; cy += c[1];
      var wasForest = burnsStrong(getTile(s, c[0], c[1]));
      if (wasForest) strong.push(c);
      var o = unitAt(s, c[0], c[1]);
      if (o) addHit(ctx, o, wasForest ? B.fire.strongDamage : B.fire.weakDamage, wasForest ? 'finisher' : 'weakfire', c);
      setTile(s, c[0], c[1], 'firewhirl');
    });
    var amount = strong.length ? B.fire.strongDamage : B.fire.weakDamage;
    var fin = { name: '火の渦', cells: cells, strong: strong, damage: amount, origin: [x, y] };
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
      if (t === 'tornado' || isPlant(t)) { setTile(s, c[0], c[1], 'fire'); if (t === 'forest') burned++; }
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
  // dir: 水で起こしたときの水の向き
  function doSentakuki(s, x, y, ctx, ev, dir) {
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

  // 山の斜面（tutorial.slope。オーナー 10/29 から、どの山にも）
  //   どの山も（山の魔法で盛った山・土で盛った山・盤面にもとからある山・育って山になった丘・冷えた溶岩…）、上下左右でつながったかたまりごとに、
  //   かたまりの真ん中（マスの位置の平均）にいちばん近いマスを頂上にする（画面が山の頂を描くのと同じ決め方）。
  //   オーナー 10/30: 山の魔法の頂上と腕の印はやめた。くっついた山は、ひとつのかたまりとして頂上を1つ決め直す。
  //   同じ近さなら、隣にかたまりの山が多いマス → 上の段 → 左のマス。
  //   頂上から山伝いに1マスずつたどったときの最後の1歩の向きが、そのマスの下り坂の向き（頂上の隣なら、頂上から見た向き。
  //   同じ歩数で来られるなら 上・右・下・左 の順に先に見つけた道）。かたまりは、山の形が変わるたびに今の盤面から決め直す。
  //   { peak: [x, y], dir: { "x,y": 'peak' | 向き }, dist: { "x,y": 頂上からの歩数 } }。(x, y) が山でなければ null
  function mountainSlopes(s, x, y) {
    var isM = function (cx, cy) { return inBounds(s, cx, cy) && getTile(s, cx, cy) === 'mountain'; };
    if (!isM(x, y)) return null;
    var comp = [], seen = {}, stack = [[x, y]];
    while (stack.length) {
      var c = stack.pop(), k = key(c[0], c[1]);
      if (seen[k] || !isM(c[0], c[1])) continue;
      seen[k] = true;
      comp.push(c);
      neighbors(s, c[0], c[1]).forEach(function (nb) { stack.push([nb.x, nb.y]); });
    }
    var n = comp.length, sx = 0, sy = 0;
    comp.forEach(function (q) { sx += q[0]; sy += q[1]; });
    // 真ん中からの近さ（n 倍して整数で比べる）
    var far = function (q) { return Math.abs(n * q[0] - sx) + Math.abs(n * q[1] - sy); };
    var around = function (q) { return neighbors(s, q[0], q[1]).filter(function (nb) { return seen[key(nb.x, nb.y)]; }).length; };
    var peak = comp.slice().sort(function (a, b) { return (far(a) - far(b)) || (around(b) - around(a)) || (a[1] - b[1]) || (a[0] - b[0]); })[0];
    var dir = {}, dist = {}, queue = [peak];
    dir[key(peak[0], peak[1])] = 'peak';
    dist[key(peak[0], peak[1])] = 0;
    while (queue.length) {
      var p = queue.shift(), pd = dist[key(p[0], p[1])];
      DIR_ORDER.forEach(function (d) {
        var nx = p[0] + DIRS[d].dx, ny = p[1] + DIRS[d].dy, nk = key(nx, ny);
        if (!seen[nk] || dist[nk] !== undefined) return;
        dist[nk] = pd + 1;
        dir[nk] = d;
        queue.push([nx, ny]);
      });
    }
    return { peak: peak, dir: dir, dist: dist };
  }
  // 盤面のすべての山の斜面（画面に頂上と斜面を描く用）: { マスの番号: 'peak' | 向き }。tutorial.slope が切なら空
  function slopeMap(s) {
    var out = {};
    if (!B.tutorial.slope) return out;
    for (var y = 0; y < rowsOf(s); y++) {
      for (var x = 0; x < s.size; x++) {
        if (out[idx(s, x, y)] !== undefined) continue;
        var m = mountainSlopes(s, x, y);
        if (!m) continue;
        Object.keys(m.dir).forEach(function (k) { var c = k.split(',').map(Number); out[idx(s, c[0], c[1])] = m.dir[k]; });
      }
    }
    return out;
  }

  // 1本の川: (sx, sy) の次のマスから d の向きへ。空き・水たまり・蜃気楼・草むらを川にして進む（川・氷はそのまま越える）。
  //   人（味方・敵）のマスでは止まらずに流れ続け、その人の足元も川になる（オーナー 10/30。人へのダメージはない）。
  //   村には流れこんで村を押し流し（壊れる）、そのまま流れ続ける（オーナー 10/31）。
  //   ほかの置きもの（トロッコ）の手前、ほかの自然で止まり、炎は消して止まる。overHill(cx, cy, 前のマス) が true の山のマスは、山のまま越える（山肌を下る）
  function runRiver(s, sx, sy, d, ctx, overHill) {
    var F = DIRS[d], g = { origin: [sx, sy], tile: 'river', cells: [], tiles: [], wave: [], blocked: [], pushed: [] }, stop = null, prev = [sx, sy], over = 0, flooded = [];
    for (var i = 1; ; i++) {
      var cx = sx + F.dx * i, cy = sy + F.dy * i;
      if (!inBounds(s, cx, cy)) { stop = '盤の端まで流れた'; break; }
      if (overHill && overHill(cx, cy, prev)) { prev = [cx, cy]; over++; continue; }
      prev = [cx, cy];
      var o = unitAt(s, cx, cy), t = getTile(s, cx, cy);
      if (isAiry(t)) t = 'empty';   // 風・花びらのマスも流れる（isAiry）
      if (o && o.kind === 'village') { addHit(ctx, o, o.hp, 'flood', [cx, cy]); flooded.push(unitLabel(s, o) + 'に川が流れこんだ'); }
      else if (o && o.side === 'object') { stop = unitLabel(s, o) + 'の手前で止まった'; g.blocked.push([cx, cy]); break; }
      if (t === 'empty' || t === 'puddle' || t === 'mirage' || t === 'thicket') {
        setTile(s, cx, cy, 'river');
        ctx.cells.push([cx, cy]);
        g.cells.push([cx, cy]); g.tiles.push('river'); g.wave.push(i - 1 - over);
        continue;
      }
      if (t === 'river' || t === 'ice') continue;
      if (t === 'fire' || t === 'smallfire') { setTile(s, cx, cy, 'empty'); stop = tileName(t) + 'を消して止まった'; break; }
      stop = tileName(t) + 'で止まった';
      break;
    }
    if (g.cells.length) { ctx.grows.push(g); ctx.phrases.push(F.name + 'へ川が' + g.cells.length + 'マス流れた'); }
    Array.prototype.push.apply(ctx.phrases, flooded);
    if (stop) ctx.phrases.push(stop);
    return g.cells.length;
  }

  // 山に水が当たった（tutorial.slope）。高い所から低い所へ流れる（mountainSlopes）
  //   斜面なら、そのマスから下り坂の向きへ。頂上なら、上・右・下・左の4方向へ。
  //   同じかたまりの山で頂上から遠くなる（下っている）マスは山のまま越え、ふもとから先が川になる
  function slopeRivers(s, x, y, ctx) {
    var m = mountainSlopes(s, x, y), sl = m.dir[key(x, y)];
    var down = function (cx, cy, prev) { var dc = m.dist[key(cx, cy)], dp = m.dist[key(prev[0], prev[1])]; return dc !== undefined && dp !== undefined && dc > dp; };
    var at = ctx.phrases.length;
    ctx.phrases.push('');
    var ways = 0;
    (sl === 'peak' ? DIR_ORDER : [sl]).forEach(function (d) { if (runRiver(s, x, y, d, ctx, down)) ways++; });
    ctx.phrases[at] = sl === 'peak' ? '山の頂上に当たって、' + ways + '方向へ川が流れ出した' : '山の斜面に当たって、下りの' + DIRS[sl].name + 'へ川が流れ出した';
  }

  // 流れる（水）
  //   水だけなら正面に水たまり（waterLength マス。waterPuddle を切ると元の池＝川）。山に当たると山を下って、盤の端まで川になる（源流）
  //   【育つ】通り道に水たまりがあると、そこから向きの奥へ川に育つ（grow.riverLength マス先まで）
  function flow(s, u, facing, ctx, ev) {
    var F = DIRS[facing], from = castOrigin(s, u, facing);   // 【育つ】丘の上からは1マス先から流れる
    var made = 0, pond = 0, stop = null, sourced = false, tornadoHit = null, whirlHit = null;
    // 水だけなら水たまり（waterPuddle、オーナー 10/17）。育つ・チュートリアル②は前から水たまり
    var growOn = B.grow.enabled, puddleOn = growOn || B.tutorial.slope || B.waterPuddle, pondName = puddleOn ? '水たまり' : '池';
    var plainPuddle = B.waterPuddle && !growOn && !B.tutorial.slope;   // 水だけなら水たまり、が育つ・②の決まりでなく標準の決まりとして効いている
    var growing = false, left = 0, river = null;   // 【育つ】水たまりから川に育っている途中か、あと何マス進めるか、育った川のマス
    var pondLen = B.shape.frontOne ? 1 : B.waterLength;
    for (var i = 1; ; i++) {
      if (!sourced && !growing && i > pondLen) break;   // 【縮尺】正面1マスなら池（水たまり）も1マス
      if (growing && B.grow.riverLength > 0 && left <= 0) break;
      var x = from.x + F.dx * i, y = from.y + F.dy * i;
      if (!inBounds(s, x, y)) { if (sourced || growing) stop = '盤の端まで流れた'; break; }
      ctx.cells.push([x, y]);
      var o = unitAt(s, x, y);
      var t = getTile(s, x, y);
      if (isAiry(t)) t = 'empty';   // 風・花びらのマスも流れる（isAiry）
      if (o) {
        addHit(ctx, o, u.power, 'direct'); cureBurn(s, o, ctx); stop = unitLabel(s, o) + 'に当たって止まった';
        // 人の足元にも自然ができる（オーナー 10/30: 人のいないマスと同じ作用）: 空き・水たまり・蜃気楼・草むらは水たまり（元の池なら川）、炎は消える
        if (B.ideas.natureUnderUnits && !sourced && !growing) {
          if (t === 'empty' || t === 'puddle' || t === 'mirage' || t === 'thicket') { setTile(s, x, y, puddleOn ? 'puddle' : 'river'); made++; }
          else if (t === 'fire' || t === 'smallfire') { setTile(s, x, y, 'empty'); ctx.phrases.push('足元の' + tileName(t) + 'を消した'); }
        }
        break;
      }
      if (growing) {
        // 【育つ】育つ川は、空き・水たまり・草むらを川にして進む。ユニット・森・山・丘・火山・泥沼で止まり、炎は消して止まる
        left--;
        if (t === 'empty' || t === 'puddle' || t === 'mirage' || t === 'thicket') { setTile(s, x, y, 'river'); made++; river.cells.push([x, y]); river.tiles.push('river'); river.wave.push(river.cells.length - 1); continue; }
        if (t === 'river' || t === 'ice') continue;
        if (t === 'fire' || t === 'smallfire') { setTile(s, x, y, 'empty'); stop = tileName(t) + 'を消して止まった'; break; }
        stop = tileName(t) + 'で止まった';
        break;
      }
      if (growOn && !sourced && (t === 'puddle' || t === 'mirage')) {
        // 【育つ】水たまりに水が流れこむと、そこから川に育つ
        growing = true;
        left = B.grow.riverLength;
        if (made) ctx.phrases.push(pondName + 'ができた（' + made + 'マス）');
        ctx.phrases.push('【育つ】' + tileName(t) + 'に水が流れこんで川に育った');
        pond = made; made = 1;
        setTile(s, x, y, 'river');
        river = { origin: [x, y], tile: 'river', cells: [[x, y]], tiles: ['river'], wave: [0], blocked: [], pushed: [] };
        ctx.grows.push(river);
        continue;
      }
      // 山の斜面（tutorial.slope。10/29 からどの山にも）: 山に当たると、高い所から低い所へ流れる（slopeRivers）
      if (t === 'mountain' && !sourced && B.tutorial.slope) {
        if (made) ctx.phrases.push(pondName + 'ができた（' + made + 'マス）');
        pond = made; made = 0; sourced = true;
        slopeRivers(s, x, y, ctx);
        break;
      }
      if (t === 'mountain' || t === 'hill') {   // 【育つ】丘からも川は流れる（丘は丘のまま）
        if (!sourced) {
          sourced = true;
          if (made) ctx.phrases.push(pondName + 'ができた（' + made + 'マス）');
          ctx.phrases.push('【新案】' + tileName(t) + 'に当たって川になった');
          pond = made; made = 0;
        }
        continue;
      }
      if (t === 'empty' || t === 'puddle' || t === 'mirage' || t === 'thicket') {
        // 【育つ】低い草むらは水に沈む。入なら源流までは水たまり。
        //   水だけなら水たまり（waterPuddle）で変わるのは空きだけ: 水たまり・蜃気楼に水が流れると、今までどおり川に戻る
        var keepRule = plainPuddle && t !== 'empty';
        setTile(s, x, y, puddleOn && !sourced && !keepRule ? 'puddle' : 'river'); made++; continue;
      }
      if (t === 'river' || t === 'ice') continue;
      if (t === 'lava') { setTile(s, x, y, 'mountain'); stop = '【新案】溶岩が冷えて山になった'; break; }
      if (t === 'firewhirl') {
        stop = '【新案】火の渦に水が入った'; tornadoHit = [x, y]; break;
      }
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
    if (made) ctx.phrases.push(sourced || growing ? '川が' + made + 'マス流れた' : pondName + 'ができた（' + made + 'マス）');
    if (stop) ctx.phrases.push(stop);
    if (!made && !pond && !stop && !sourced) ctx.phrases.push('水の上を流れた');
    if (tornadoHit) doSentakuki(s, tornadoHit[0], tornadoHit[1], ctx, ev, facing);
    if (whirlHit && B.tornadoRecipe === 'senpu') whirlToTornado(s, whirlHit[0], whirlHit[1], ctx, ev);
    else if (whirlHit) growTornado(s, whirlHit[0], whirlHit[1], facing, ctx, ev, '【新案】つむじ風が水を巻き上げて竜巻になった');
  }

  // o を dir へ1マス押す（風で運ぶ・【育つ】盛り上がる山の押し出し）。押せたら true
  //   動かない置きもの・盤の端・通れないマス・ユニットがいるときは押せない。氷の上は滑り、泥沼に入ればはまる
  function pushOne(s, o, dir, ev, okText) {
    var F = DIRS[dir];
    var cx = o.x, cy = o.y, nx = cx + F.dx, ny = cy + F.dy;
    var why = null;
    if (isFixed(o)) why = '動かない';
    else if (!inBounds(s, nx, ny)) why = '盤の端';
    else if (!isPassable(getTile(s, nx, ny))) why = tileName(getTile(s, nx, ny)) + 'があって通れない';
    else if (unitAt(s, nx, ny)) why = unitLabel(s, unitAt(s, nx, ny)) + 'がいる';
    if (why) {
      ev.push({ type: 'push', id: o.id, ok: false, text: unitLabel(s, o) + 'は押されなかった（' + why + '）' });
      return false;
    }
    ev.push({ type: 'push', id: o.id, ok: true, from: [cx, cy], to: [nx, ny], text: okText });
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
    return true;
  }

  // 吹き抜ける（風）＝ 運ぶ
  function blow(s, u, facing, ctx, ev) {
    var F = DIRS[facing], from = castOrigin(s, u, facing);   // 【育つ】丘の上からは1マス先から吹く
    var path = [];
    var origin = null, volcano = null, whirl = null, blocked = false;
    var breezeMode = B.windMode === 'breeze';
    var limit = B.shape.frontOne ? 1 : breezeMode ? B.breezeLength : B.lineLength;   // 【縮尺】正面1マスなら風も1マス
    var galeAt = -1;   // 【育つ】強風になった通り道の位置（path の番号）。-1 は強風なし
    for (var i = 1; i <= limit; i++) {
      var x = from.x + F.dx * i, y = from.y + F.dy * i;
      if (!inBounds(s, x, y)) break;
      var t = getTile(s, x, y);
      // 【育つ】通り道に風が残っていれば、そこから奥が強風に育つ（術者の向きへ grow.galeLength マス）
      if (B.grow.enabled && breezeMode && galeAt < 0 && isWind(t)) {
        galeAt = path.length;
        limit = i + B.grow.galeLength - 1;
        ctx.phrases.push('【育つ】' + tileName(t) + 'に風が重なって強風に育った');
      }
      if (t === 'mountain') { ctx.phrases.push('山の陰で風が止まった'); blocked = true; break; }   // 溶岩は低いので、風はその上を吹き抜ける
      if (t === 'tornado') { ctx.phrases.push('【新案】風が竜巻に吸いこまれた'); blocked = true; break; }
      if (t === 'whirlwind' && B.tornadoRecipe === 'windWind') { whirl = [x, y]; ctx.cells.push([x, y]); break; }
      if (t === 'sakura' || t === 'hillsakura' || (t === 'volcano' && B.sakura.from === 'fire')) { volcano = [x, y]; ctx.cells.push([x, y]); break; }
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
        if (tt === 'river' || tt === 'empty' || isAiry(tt)) { setTile(s, path[j][0], path[j][1], 'puddle'); wet++; }
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
      var moved = pushOne(s, o, facing, ev, unitLabel(s, o) + 'を' + F.name + 'へ1マス運んだ');
      // 【育つ】強風の通り道の者は、もう1マス運ぶ（押せなくなったら、泥沼にはまったらそこで止まる）
      if (moved && galeAt >= 0 && k >= galeAt && getTile(s, o.x, o.y) !== 'mud') pushOne(s, o, facing, ev, '【育つ】強風で' + unitLabel(s, o) + 'をさらに' + F.name + 'へ1マス運んだ');
    }
    if (whirl) {
      growTornado(s, whirl[0], whirl[1], facing, ctx, ev);
    } else if (breezeMode) {
      // 【新案・試し】風の形のマスに、風が残る（空きだけ。ユニットがいてもよい）。ターン終了で消える
      if (!origin && !volcano) {
        var left = 0, galeLeft = 0, gale = null;
        path.forEach(function (c, j) {
          var tt = getTile(s, c[0], c[1]);
          if (galeAt >= 0 && j >= galeAt) {
            // 【育つ】強風の通り道は、空きと風のマスに強風が残る
            if (!gale) { gale = { origin: c.slice(), tile: 'gale', cells: [], tiles: [], wave: [], blocked: [], pushed: [] }; ctx.grows.push(gale); }
            if ((tt === 'empty' || tt === 'breeze' || tt === 'petals')) { setTile(s, c[0], c[1], 'gale'); galeLeft++; gale.cells.push(c.slice()); gale.tiles.push('gale'); gale.wave.push(j - galeAt); }
          } else if (tt === 'empty' || tt === 'petals') { setTile(s, c[0], c[1], 'breeze'); left++; }   // 花びらは風が吹き払う（isAiry）
        });
        if (left) ctx.phrases.push('【新案】' + tileName('breeze') + 'が' + left + 'マス吹いている（ターン終了まで）');
        if (galeLeft) ctx.phrases.push('【育つ】強風が' + galeLeft + 'マス吹いている（ターン終了まで）');
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
      doSpread(s, origin[0], origin[1], facing, ctx, ev, galeAt >= 0 ? B.grow.galeSpreadBonus : 0);   // 【育つ】強風で起こした燃え広がりは遠くまで走る
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
    if (ctx.grows.length) castEv.grows = ctx.grows;   // 【育つ】育ったマスと、育てなかったマス（見せ方用）
    var any = ctx.phrases.length || ctx.order.length;
    castEv.text = label + 'が' + DIRS[facing].name + 'へ' + magicName(u.magic) + 'の魔法（' + MAGIC_INFO[u.magic].verb + '）→ ' +
      (ctx.phrases.length ? summarize(ctx.phrases) : (any ? '' : '何も起きなかった'));
    castEv.text = castEv.text.replace(/ → $/, '');
    applyHits(s, ctx, ev);
    ctx.after.forEach(function (fn) { fn(); });
    if (s.ex) exMissions(s, ev);   // 展示ステージ③: ミッション（火山を作る）
    return ctx;
  }

  // 【一斉】合体の見分け。links = { by: { マスの番号: [味方の id] }, order: [発動した順の味方の id] }
  //   このターンの構えの発動で、どの味方の魔法がどのマスの自然を作り変えたかを覚えておく。
  //   決め手が起きたら、起点のマスと、決め手で変わったマスを作った味方を集める。違う味方が2人以上なら「合体」（出来事に combo: [id…] を付ける）
  function newLinks() { return { by: {}, order: [], magic: {} }; }
  function linkedShot(s, a, links, ev) {
    if (links.order.indexOf(a.id) < 0) links.order.push(a.id);
    links.magic[a.id] = a.magic;
    var before = s.tiles.slice(), mark = ev.length;
    var ctx = shoot(s, a, a.facing, ev);
    var changed = {};
    for (var i = 0; i < before.length; i++) if (before[i] !== s.tiles[i]) changed[i] = true;
    var extra = {};   // 決め手で変わったマスには、その決め手に関わった味方も残す（次の決め手へつながるように）
    for (var j = mark; j < ev.length; j++) {
      var e = ev[j];
      if (e.type !== 'finisher') continue;
      var ids = {};
      ids[a.id] = true;
      var take = function (c) {
        if (!c || !inBounds(s, c[0], c[1])) return;
        (links.by[idx(s, c[0], c[1])] || []).forEach(function (id) { ids[id] = true; });
      };
      take(e.origin || (e.cells && e.cells[0]));
      (e.cells || []).forEach(function (c) { if (inBounds(s, c[0], c[1]) && changed[idx(s, c[0], c[1])]) take(c); });
      var list = links.order.filter(function (id) { return ids[id]; });
      (e.cells || []).forEach(function (c) { if (inBounds(s, c[0], c[1])) extra[idx(s, c[0], c[1])] = list; });
      if (list.length >= 2) { e.combo = list; e.comboMagics = list.map(function (id) { return links.magic[id]; }); }
    }
    Object.keys(changed).forEach(function (k) {
      var set = (links.by[k] || []).concat(extra[k] || []).concat([a.id]);
      links.by[k] = links.order.filter(function (id) { return set.indexOf(id) >= 0; });
    });
    return ctx;
  }
  // 【一斉】構えの発動: 構えた順に1人ずつ、発動の瞬間の位置と向きから撃つ（倒れた味方の構えは消える）。終わったら構えを消す
  function fireStances(s, ev, step) {
    var ids = stanceList(s).map(function (a) { return a.id; });
    var links = newLinks();
    ids.forEach(function (id, i) {
      if (s.result) return;
      var a = findUnit(s, id);
      if (!a) return;
      a.intent = false;
      var mark = ev.length;
      linkedShot(s, a, links, ev);
      if (ev[mark] && ev[mark].type === 'cast') ev[mark].order = i + 1;
      step();
    });
    alliesOf(s).forEach(function (a) { delete a.stance; if (a.npc) a.intent = false; });
  }

  // ---------------------------------------------------------------
  // 移動
  // ---------------------------------------------------------------

  // 通り抜け（オーナー 10/30）: 味方・敵・村のいるマスは、味方も敵も通り抜けられる。ただし、そこに止まることはできない
  //   （移動先の候補には出さず、通り道としてだけ使う）。トロッコは今どおり通れない
  function passThrough(o) { return !!o && (o.side === 'ally' || o.side === 'enemy' || (o.side === 'object' && o.kind === 'village')); }

  // 動けるマス: dist { "x,y": 距離 }（今の位置 0 を含む）と、見つけた順 order
  // 通れるマス・ユニットがいないマスだけ（敵は個性で変わる）。味方・敵・村のマスは通り抜けられる（dist には入れない）。
  // 泥沼に入ったらそこで止まる（人のいる泥沼は止まれないので、その先へも行けない）。泥沼にはまっていたら今の位置だけ
  //   from: 数え始めるマス（省略で今の位置）。自分のいるマスは空きとして通る
  function reachInfo(s, u, from) {
    var sx = from ? from[0] : u.x, sy = from ? from[1] : u.y;
    var dist = {}, order = [], seen = {};
    dist[key(sx, sy)] = 0;
    seen[key(sx, sy)] = 0;
    order.push([sx, sy]);
    if (u.stuck) return { dist: dist, order: order };
    var queue = [[sx, sy]];
    while (queue.length) {
      var c = queue.shift();
      var cd = seen[key(c[0], c[1])];
      if (cd >= u.move) continue;
      var ct = getTile(s, c[0], c[1]);
      if (cd > 0 && (ct === 'mud' || ct === 'hill')) continue;   // 泥沼・【育つ】丘に入ったらそこで止まる
      neighbors(s, c[0], c[1]).forEach(function (n) {
        var k = key(n.x, n.y);
        if (seen[k] !== undefined) return;
        if (!canEnter(u, getTile(s, n.x, n.y))) return;
        var o = unitAt(s, n.x, n.y);
        if (o && o !== u && !passThrough(o)) return;
        seen[k] = cd + 1;
        queue.push([n.x, n.y]);
        if (o && o !== u) return;   // 通り抜けるだけ（止まれない）
        dist[k] = cd + 1;
        order.push([n.x, n.y]);
      });
    }
    return { dist: dist, order: order };
  }

  // 味方の動けるマス（オーナー 10/30）: 移動先を選んだ時点で本当に動く（move）。u.moved = { from: 元の位置, to: 動いた先 }
  //   動いたあとも、元の位置から数えて届くマスへ動き直せる（元の位置へ戻るのは取り消し）。
  //   泥沼にはまった・動いたあとに魔法で動かされたら、もう動けない（今の位置だけ）
  function moveInfo(s, u) {
    var mv = u.moved;
    if (!mv) return reachInfo(s, u);
    var here = { dist: {}, order: [[u.x, u.y]] };
    here.dist[key(u.x, u.y)] = 0;
    if (u.x !== mv.to[0] || u.y !== mv.to[1]) return here;
    // 動いた味方の泥沼は、このターンの移動ではまったもの（はまっている味方は動けないので）。元の位置から数え直すときは、はまる前として数える（オーナー 11/03「移動させた後ももう一度触ったら変えられる」）
    var wasStuck = u.stuck;
    u.stuck = false;
    var r = reachInfo(s, u, mv.from), dist = {}, order = [];
    u.stuck = wasStuck;
    r.order.forEach(function (c) {
      var o = unitAt(s, c[0], c[1]);
      if (o && o !== u) return;   // 元の位置に、もうほかの駒がいる
      dist[key(c[0], c[1])] = r.dist[key(c[0], c[1])];
      order.push(c);
    });
    return { dist: dist, order: order };
  }

  function reachableCells(s, unitId) {
    var u = findUnit(s, unitId);
    if (!u) return {};
    return u.side === 'ally' ? moveInfo(s, u).dist : reachInfo(s, u).dist;
  }
  // 【一斉】このターンもう構えた（か待機した）味方が、構え直すところか（構え・待機・移動は発動まで何度でも直せる。オーナー 11/03）
  function restancing(u) { return simulOn() && !!u && u.side === 'ally' && !u.npc && u.acted; }

  function moveUnit(s, u, x, y, dist, ev) {
    var from = [u.x, u.y];
    u.x = x; u.y = y;
    ev.push({ type: 'move', id: u.id, side: u.side, from: from, to: [x, y], text: unitLabel(s, u) + 'が' + dist + 'マス移動した' });
    if (getTile(s, x, y) === 'mud') enterMud(s, u, ev);
  }
  // 味方を to へ動かす（dist: 元の位置からの歩数。0 は元の位置へ戻る＝移動の取り消し）
  function allyStep(s, u, to, dist, ev) {
    if (u.moved) delete u.stuck;   // 動き直し: このターンの移動ではまった泥沼は、はまる前に戻す（行き先が泥沼なら、またはまる）
    if (dist === 0) {
      var back = [u.x, u.y];
      u.x = to[0]; u.y = to[1];
      delete u.moved;
      ev.push({ type: 'move', id: u.id, side: u.side, from: back, to: [to[0], to[1]], text: unitLabel(s, u) + 'は元の位置に戻った' });
      return;
    }
    var origin = u.moved ? u.moved.from : [u.x, u.y];
    moveUnit(s, u, to[0], to[1], dist, ev);
    u.moved = { from: origin, to: [to[0], to[1]] };
  }
  // 奪取: 宝のマスで止まると宝を持つ。持ったまま帰り口で止まったら勝ち（勝ったら true）
  function arrive(s, u, ev) {
    var m = s.mission;
    if (!m || missionType(s) !== 'retrieve') return false;
    if (!m.carrier && m.treasure && m.treasure[0] === u.x && m.treasure[1] === u.y) {
      m.carrier = u.id; m.treasure = null;
      ev.push({ type: 'treasure', id: u.id, cells: [[u.x, u.y]], text: unitLabel(s, u) + 'が宝を持った（持っている間は撃てない）' });
    }
    if (m.carrier === u.id && inCells(m.exit, u.x, u.y)) {
      ev.push({ type: 'treasure', id: u.id, cells: [[u.x, u.y]], text: unitLabel(s, u) + 'が宝を持って帰り口に着いた' });
      setResult(s, ev, 'win', '宝を持ち帰った！（勝利）');
      return true;
    }
    return false;
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
    if (u0.npc) return fail(s0, '構える味方には指示できない');
    var again = restancing(u0);   // 【一斉】押す前なら構え直せる（移動は戻らない）
    if (u0.acted && !again) return fail(s0, 'この味方はもう行動した');
    var to = opts.to || [u0.x, u0.y];
    var dir = opts.dir || u0.facing;
    if (!DIRS[dir]) return fail(s0, '向きが正しくない');
    var same = to[0] === u0.x && to[1] === u0.y;
    var dist = same ? 0 : moveInfo(s0, u0).dist[key(to[0], to[1])];   // 【一斉】構え直しでも動ける（元の位置から数える。オーナー 11/03）
    if (dist === undefined) return fail(s0, u0.stuck && !u0.moved ? '泥沼にはまっていて動けない' : 'そこへは移動できない');
    if (opts.shoot !== false && !canShoot(s0, u0, to)) return fail(s0, '宝を持っている間は撃てない（待機だけ）');

    var s = clone(s0);
    var u = findUnit(s, unitId);
    var ev = [], steps = [], mark = 0;
    function step() {
      if (ev.length > mark) { steps.push({ state: clone(s), events: ev.slice(mark) }); mark = ev.length; }
    }
    if (u.stuck && !again && !u.moved && !simulOn()) {   // このターンに動いて泥沼にはまったのなら、休むのは次のターン。【一斉】休みはターンの終わりに数える
      unstick(u);
      ev.push({ type: 'mudSkip', id: u.id, text: unitLabel(s, u) + 'は泥沼にはまっていて動けない（1回休み）' });
    }
    u.acted = true;
    if (!same) { allyStep(s, u, to, dist, ev); step(); }
    u.facing = dir;
    if (arrive(s, u, ev)) {
      step();
      return { ok: true, state: s, events: ev, steps: steps };
    }
    if (opts.shoot === false) {
      if (u.stance) delete u.stance;         // 【一斉】待機にすると構えは消える
      ev.push({ type: 'wait', id: u.id, text: unitLabel(s, u) + 'は' + DIRS[dir].name + 'を向いて待機した' });
    } else if (simulOn()) {
      // 【一斉】構える（まだ起きない。ターンの終わりに、構えた順に発動）。構え直しは順番をそのままにする
      var first = !u.stance;
      if (first) u.stance = { n: nextStanceN(s) };
      var no = stanceOrder(s, u.id);
      ev.push({ type: 'stance', id: u.id, side: 'ally', magic: u.magic, dir: dir, from: [u.x, u.y], cells: castCells(s, u, dir), order: no,
        text: unitLabel(s, u) + 'は' + DIRS[dir].name + 'を向いて' + magicName(u.magic) + 'の魔法を' + (first ? '構えた' : '構え直した') + '（発動 ' + no + '番目）' });
    } else {
      shoot(s, u, dir, ev);
    }
    step();
    return { ok: true, state: s, events: ev, steps: steps };
  }

  // 移動だけ（オーナー 10/30）: 移動先を選んだ時点で本当に動く。まだ行動していない（撃っても待機してもいない）ことは変わらない。
  //   着いた所で起きること（泥沼にはまる・宝を持つ・帰り口で勝つ）は、ここで起きる。to が元の位置なら移動の取り消し
  function move(s0, unitId, to) {
    if (s0.result) return fail(s0, '勝負はもうついている');
    var u0 = findUnit(s0, unitId);
    if (!u0 || u0.side !== 'ally') return fail(s0, '味方を選んでいない');
    if (u0.npc) return fail(s0, '構える味方には指示できない');
    if (u0.acted && !restancing(u0)) return fail(s0, 'この味方はもう行動した');   // 【一斉】構え・待機のあとも、発動までは動き直せる（オーナー 11/03）
    if (!to || (to[0] === u0.x && to[1] === u0.y)) return fail(s0, 'もうそこにいる');
    var dist = moveInfo(s0, u0).dist[key(to[0], to[1])];
    if (dist === undefined) return fail(s0, u0.stuck ? '泥沼にはまっていて動けない' : 'そこへは移動できない');
    var s = clone(s0);
    var u = findUnit(s, unitId);
    var ev = [];
    allyStep(s, u, to, dist, ev);
    arrive(s, u, ev);
    return { ok: true, state: s, events: ev, steps: [{ state: clone(s), events: ev.slice() }] };
  }

  // 【一斉】構えた順を並べ替える（delta: -1 で1つ前へ、+1 で1つ後ろへ）。構える味方（いつも最後）は動かせない
  function reorderStance(s0, unitId, delta) {
    var list = alliesOf(s0).filter(function (a) { return !a.npc && a.stance; }).sort(function (a, b) { return a.stance.n - b.stance.n; });
    var i = -1;
    list.forEach(function (a, k) { if (a.id === unitId) i = k; });
    var j = i + delta;
    if (s0.result || i < 0 || j < 0 || j >= list.length) return fail(s0, 'その順番には動かせない');
    var s = clone(s0);
    var a = findUnit(s, list[i].id), b = findUnit(s, list[j].id);
    var t = a.stance.n; a.stance.n = b.stance.n; b.stance.n = t;
    return { ok: true, state: s, events: [{ type: 'reorder', id: a.id, text: unitLabel(s, a) + 'の発動を' + (j + 1) + '番目にした' }], steps: [] };
  }

  // 【一斉】ターンの始めに、操作できる味方を全員「構え」にする（オーナー 11/03「デフォルトで魔法を構えていて、そのままターン終了しても撃つ」）。
  //   向きは今の向き。順番は前のターンの順（s.lastOrder。待機した味方はそのうしろ）、1ターン目は味方の並び順。宝を持っている味方は待機
  //   構え・待機・移動は発動を押すまで何度でも直せる（act・move）。1人ずつ（single）のときは何もしない
  function armAllies(s) {
    if (!simulOn()) return;
    var order = (s.lastOrder || []).slice();
    controllableOf(s).forEach(function (a) { if (order.indexOf(a.id) < 0) order.push(a.id); });
    var n = 0;
    order.forEach(function (id) {
      var a = findUnit(s, id);
      if (!a || a.side !== 'ally' || a.npc) return;
      a.acted = true;
      if (canShoot(s, a, [a.x, a.y])) a.stance = { n: ++n }; else delete a.stance;
    });
  }
  function allAlliesActed(s) {
    var al = controllableOf(s);   // 構える味方は数えない
    return al.length > 0 && al.every(function (a) { return a.acted; });
  }

  // ---------------------------------------------------------------
  // 敵の行動
  //   ターンの流れ: 敵の移動と予告 → 味方の手番 → 敵の魔法の発動 → ターン終了処理 → （次のターン）敵の移動と予告 …
  //   予告は敵の今の位置と向きに固定。発動はその瞬間の位置と向きから撃つ（押されたら形も一緒に動く）
  // ---------------------------------------------------------------

  // target のマスからの道のり（mover が自分の足で入れるマス・ユニットのいないマス。mover 自身のマスは通れる）
  //   味方・敵・村のいるマスは通り抜けられる（オーナー 10/30）
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
        if (occ && occ !== mover && !passThrough(occ)) return;
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
  //   viewer: 見ている者。forTarget: お題の的として見るとき
  function hidden(s, u, viewer, forTarget) {
    if (!u) return false;
    return getTile(s, u.x, u.y) === 'mirage';
  }

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
      // 構える味方の魔法は、敵より先に発動する
      alliesOf(sim).forEach(function (o) {
        if (!o.npc || !o.intent || sim.result || !findUnit(sim, o.id)) return;
        var oc = shoot(sim, o, o.facing, []);
        oc.order.forEach(function (id) { var t = findUnit(s, id); if (t && t.side === 'enemy' && oc.hits[id].amount > 0) harm = true; });
      });
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
      if (hidden(s, t, su)) return;
      if (isTarget[id]) targetIds.push(id);
      if (t.side !== 'ally') return;     // 置きもの（村・トロッコ）は「人数」「近い人」には数えない
      allyIds.push(id);
      allyDmg += h.amount;
    });
    var changed = 0;
    for (var i = 0; i < before.length; i++) if (before[i] !== 'empty' && sim.tiles[i] !== before[i]) changed++;
    return { allyHits: allyIds.length, allyIds: allyIds, allyDmg: allyDmg, targetHits: targetIds.length, targetIds: targetIds,
      harm: harm, changed: changed, cells: ctx.cells, ctx: ctx, before: before, after: sim.tiles };
  }

  // お題の的: 村・トロッコ・宝を持っている味方（蜃気楼の中は見えない）。宝がまだ拾われていない奪取では、的はない
  function missionTargets(s) {
    var type = missionType(s), out = [];
    if (type === 'defense') out = objectsOf(s, 'village');
    else if (type === 'escort') out = objectsOf(s, 'wagon');
    else if (type === 'retrieve') { var c = carrierOf(s); if (c) out = [c]; }
    return out.filter(function (t) { return !hidden(s, t, null, true); });
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
  //   noMove: 動かずに、今の位置で予告だけ決める（1ターン目。敵は置いた所から始まる。オーナー 11/03。IMPROVE_ターンの流れ 段1）
  function planEnemy(s, e, noMove) {
    if (e.stand === 'still') return { to: [e.x, e.y], dir: e.facing, dist: 0, kind: 'still' };   // 動かない: 移動も予告もしない
    // 進む: ターンの始めには何もしない（移動と魔法はセットで、敵の発動のときに行う。marchPhase）
    if (e.stand === 'march') return { to: [e.x, e.y], dir: e.facing, dist: 0, kind: 'march' };
    // 突進: ターンの始めに村へ走る（rushMove）。予告は出さない
    if (e.stand === 'rush' && noMove) return { to: [e.x, e.y], dir: e.facing, dist: 0, kind: 'rush' };
    if (e.stand === 'rush') { var rr = rushRoute(s, e); return { to: rr && rr.stop ? rr.path[rr.stop - 1] : [e.x, e.y], dir: e.facing, dist: 0, kind: 'rush' }; }
    // 展示ステージ③: ボスは前へ1マス進んで一撃を予告（ふさがれていたら進まない）。取り巻きは風の人へまっすぐ進み、隣に来たら体当たりを予告
    if (e.stand === 'boss') {
      var bs = e.stuck || noMove ? null : bossStep(s, e);
      return { to: bs || [e.x, e.y], dir: e.facing, dist: bs ? 1 : 0, kind: 'boss', blocked: !bs && !e.stuck && !noMove };
    }
    if (e.stand === 'float') {
      var fr = floatRoute(s, e), ft = fr.target ? findUnit(s, fr.target) : null;
      if (noMove && fr.path.length) return { to: [e.x, e.y], dir: e.facing, dist: 0, kind: 'float', noIntent: true };   // 動かない: 隣でなければ予告もしない
      var fdir = fr.adjacent && ft ? faceToward(fr.to[0], fr.to[1], ft) : e.facing;
      if (!fr.adjacent && fr.path.length) { var fl = fr.path.length > 1 ? fr.path[fr.path.length - 2] : [e.x, e.y]; fdir = stepDirOf(fl, fr.to); }
      return { to: fr.to, dir: fdir, dist: fr.path.length, kind: 'float', noIntent: !fr.adjacent };
    }
    if (!alliesOf(s).length) return null;
    var allies = alliesOf(s).filter(function (a) { return !hidden(s, a, e); });
    if (!allies.length) return { to: [e.x, e.y], dir: e.facing, dist: 0, kind: 'lost' };
    var info = noMove ? { order: [[e.x, e.y]], dist: (function () { var d = {}; d[key(e.x, e.y)] = 0; return d; })() } : reachInfo(s, e);   // noMove: 今の位置だけ
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
  // 敵の移動と予告。noMove: 動かずに予告だけ（1ターン目。オーナー 11/03「味方から動くのを基本に」。2ターン目からは前のターンの終わりに動く）
  function enemyPlanPhase(s, ev, step, noMove) {
    var ids = enemiesOf(s).map(function (e) { return e.id; });
    ids.forEach(function (id) {
      if (s.result) return;
      var e = findUnit(s, id);
      if (!e) return;
      e.intent = false;
      if (e.stand === 'rush') { if (!noMove) rushMove(s, e, ev, step); return; }   // 突進: 村へ走って、隣なら体当たり（1ターン目は走らない）
      var plan = planEnemy(s, e, noMove);
      if (!plan || plan.kind === 'still' || plan.kind === 'march') { e.intent = false; return; }
      if (e.stuck && !noMove) {
        unstick(e);
        ev.push({ type: 'mudSkip', id: e.id, text: unitLabel(s, e) + 'は泥沼にはまっていて動けない（1回休み）' });
      }
      if (plan.kind === 'lost') {
        ev.push({ type: 'info', id: e.id, text: '【新案】' + unitLabel(s, e) + 'は味方を見失った（蜃気楼）' });
        step();
        return;
      }
      if (plan.kind === 'noPath') ev.push({ type: 'info', id: e.id, text: unitLabel(s, e) + 'は' + plan.aimAt + 'への道がないので、' + (plan.dist > 0 ? '近くで' : 'その場で') + '構える' });
      if (plan.kind === 'boss' && plan.blocked) ev.push({ type: 'info', id: e.id, cells: [[e.x, e.y]], text: unitLabel(s, e) + 'は前をふさがれて進めない' });
      if (plan.dist > 0) { moveUnit(s, e, plan.to[0], plan.to[1], plan.dist, ev); step(); }
      e.facing = plan.dir;
      if (plan.noIntent) { e.intent = false; step(); return; }
      e.intent = true;
      ev.push({ type: 'intent', id: e.id, side: 'enemy', magic: e.magic, dir: plan.dir, from: [e.x, e.y],
        cells: trialShot(s, e, e.x, e.y, plan.dir).cells, text: intentText(s, e) });
      step();
    });
  }

  // 構える味方が魔法を構え直す（ターンの始め。敵の移動と予告より前）。動かず、今の位置と向きのまま同じ魔法を構える
  function allyReadyPhase(s, ev, step) {
    alliesOf(s).forEach(function (a) {
      if (!a.npc || s.result) return;
      a.intent = true;
      ev.push({ type: 'intent', id: a.id, side: 'ally', magic: a.magic, dir: a.facing, from: [a.x, a.y], cells: castCells(s, a, a.facing),
        text: unitLabel(s, a) + 'は' + DIRS[a.facing].name + 'を向いて' + magicName(a.magic) + 'の魔法を構えた' });
    });
    step();
  }

  // 発動（構える味方 → 敵）。構える味方は、プレイヤーの手番のあと・敵より先に撃つ（発動の瞬間の位置と向きから）
  function allyFirePhase(s, ev, step) {
    var ids = alliesOf(s).filter(function (a) { return a.npc && a.intent; }).map(function (a) { return a.id; });
    for (var i = 0; i < ids.length && !s.result; i++) {
      var a = findUnit(s, ids[i]);
      if (!a || !a.intent) continue;
      a.intent = false;
      shoot(s, a, a.facing, ev);
      step();
    }
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

  // 「進む」敵の次の1マス（向いている方。盤の外・自分の足で入れないマス・ユニットのいるマスなら進まない＝ null）
  function marchStep(s, e) {
    var F = DIRS[e.facing], nx = e.x + F.dx, ny = e.y + F.dy;
    if (!inBounds(s, nx, ny) || !canEnter(e, getTile(s, nx, ny)) || unitAt(s, nx, ny)) return null;
    return [nx, ny];
  }
  // 「進む」敵が今の位置から撃つか: 狙う相手（構える味方。いなければ味方の誰でも）に当たり、自分や仲間を巻き込まないとき。
  //   形に真ん中（shapeCenter）がある魔法は、狙う相手が真ん中のマスにいるときだけ
  function marchAims(s, e) {
    var tr = trialShot(s, e, e.x, e.y, e.facing);
    var npcs = alliesOf(s).filter(isNpc);
    var isAim = function (t) { return !!t && (npcs.length ? isNpc(t) : t.side === 'ally'); };
    var hit = tr.allyIds.some(function (id) { return isAim(findUnit(s, id)); });
    var ctr = B.shapeCenter && B.shapeCenter[e.magic];
    if (ctr) {
      var o = castOrigin(s, e, e.facing), d = rotate(e.facing, ctr[0], ctr[1]);
      hit = hit && isAim(unitAt(s, o.x + d[0], o.y + d[1]));
    }
    return hit && !tr.harm;
  }
  // 「進む」敵の行動（移動と魔法のセット）。敵の発動のときに: 向いている方へ1マス進み（泥沼にはまっていたら1回休み）、
  //   そこから狙う相手に届けば魔法を撃つ。onMove・onShoot は予告の計算用（盤面の変化を記録する）
  function marchPhase(s, ev, step, onMove, onShoot) {
    enemiesOf(s).filter(function (e) { return e.stand === 'march'; }).map(function (e) { return e.id; }).forEach(function (id) {
      var e = findUnit(s, id);
      if (!e || s.result) return;
      if (e.stuck) { unstick(e); ev.push({ type: 'mudSkip', id: e.id, text: unitLabel(s, e) + 'は泥沼にはまっていて動けない（1回休み）' }); step(); }
      else {
        var to = marchStep(s, e);
        if (to) {
          var from = [e.x, e.y];
          e.x = to[0]; e.y = to[1];
          if (onMove) onMove(e, from, to);
          ev.push({ type: 'move', id: e.id, side: 'enemy', from: from, to: to, text: unitLabel(s, e) + 'が' + DIRS[e.facing].name + 'へ1マス進んだ' });
          if (getTile(s, e.x, e.y) === 'mud') enterMud(s, e, ev);
          step();
        }
      }
      if (s.result || !marchAims(s, e)) return;
      if (onShoot) onShoot(e); else { shoot(s, e, e.facing, ev); step(); }
    });
  }

  // ---------------------------------------------------------------
  // 突進の敵（チュートリアル②）
  //   人は無視して、一番近い村へ、通れるマスだけを通る一番短い道を走る（1ターンに enemy.rushMove マス。ターンの始めの敵の移動のとき）。
  //   山・川・水たまり・泥沼・盤の外は通らない。味方・敵・村のマスは通り抜けられるが、止まれない（オーナー 10/30）。
  //   次の移動で止まるのは、rushMove マス以内で止まれるマスのうち、行き先までの道のりが一番短いマス（同じなら 動くのが短い → 見つけた順）。
  //   魔法は撃たない。走り終えて村の隣にいたら、体当たりで村を壊す（予告なし）。
  //   村へ届く道がなければ、enemy.rushNoPath が 'approach' なら届くマスのうち村に一番近い（縦横の歩数）マスへ走って待つ（今いるマスが一番近ければ、その場で待つ）、
  //   'wait' ならその場で待つ
  // ---------------------------------------------------------------
  var RUSH_BLOCK = { puddle: true, mud: true };
  function rushOpen(s, e, x, y) {
    var t = getTile(s, x, y), o = unitAt(s, x, y);
    return isPassable(t) && !RUSH_BLOCK[t] && (!o || o === e);
  }
  function villageNextTo(s, x, y) {
    var vs = objectsOf(s, 'village');
    for (var i = 0; i < DIR_ORDER.length; i++) {
      var d = DIRS[DIR_ORDER[i]];
      for (var j = 0; j < vs.length; j++) if (vs[j].x === x + d.dx && vs[j].y === y + d.dy) return vs[j];
    }
    return null;
  }
  // 突進の道: { id, from, path（次のマスから終わりまで）, reach（村の隣まで届く）, village（届く村の id）, stop（次の移動で進むマス数。path[stop - 1] で止まる） }。村がなければ null
  function rushRoute(s, e) {
    var vs = objectsOf(s, 'village');
    if (!vs.length) return null;
    var stand = function (x, y) { var o = unitAt(s, x, y); return !o || o === e; };   // 止まれるマス
    var open = function (x, y) { var o = unitAt(s, x, y); return rushOpen(s, e, x, y) || (passThrough(o) && rushOpen(s, o, x, y)); };   // 走れるマス（通り抜けも）
    var bfs = function (sx, sy) {
      var d = {}, prev = {}, order = [[sx, sy]], queue = [[sx, sy]];
      d[key(sx, sy)] = 0;
      while (queue.length) {
        var c = queue.shift();
        neighbors(s, c[0], c[1]).forEach(function (n) {
          var k = key(n.x, n.y);
          if (d[k] !== undefined || !open(n.x, n.y)) return;
          d[k] = d[key(c[0], c[1])] + 1; prev[k] = c;
          order.push([n.x, n.y]); queue.push([n.x, n.y]);
        });
      }
      return { d: d, prev: prev, order: order };
    };
    var fromE = bfs(e.x, e.y), dist = fromE.d, order = fromE.order;
    var near = function (c) { return Math.min.apply(null, vs.map(function (v) { return Math.abs(v.x - c[0]) + Math.abs(v.y - c[1]); })); };
    var goal = order.filter(function (c) { return stand(c[0], c[1]) && !!villageNextTo(s, c[0], c[1]); })[0] || null;   // 見つけた順 ＝ 近い順
    var reach = !!goal;
    if (!goal) {
      goal = order[0];
      if (B.enemy.rushNoPath !== 'wait') order.forEach(function (c) {
        if (!stand(c[0], c[1])) return;
        var a = near(c), b = near(goal);
        if (a < b || (a === b && dist[key(c[0], c[1])] < dist[key(goal[0], goal[1])])) goal = c;
      });
    }
    // 次の移動で止まるマス（rushMove マス以内で止まれるマスのうち、行き先までの道のりが一番短いマス。同じなら 動くのが短い → 見つけた順）
    var toGoal = bfs(goal[0], goal[1]).d, stopAt = [e.x, e.y], best = toGoal[key(e.x, e.y)];
    order.forEach(function (c) {
      var g = toGoal[key(c[0], c[1])];
      if (dist[key(c[0], c[1])] > B.enemy.rushMove || !stand(c[0], c[1]) || g === undefined) return;
      if (best === undefined || g < best) { best = g; stopAt = c; }
    });
    // 道: 止まるマスまでの来た道 ＋ そこから行き先まで（道のりが1ずつ減るマスを 上・右・下・左 の順に）
    var path = [], cur = stopAt;
    while (cur[0] !== e.x || cur[1] !== e.y) { path.unshift(cur); cur = fromE.prev[key(cur[0], cur[1])]; }
    var stop = path.length;
    cur = stopAt;
    while (toGoal[key(cur[0], cur[1])] > 0) {
      var cd = toGoal[key(cur[0], cur[1])], nx = null;
      DIR_ORDER.forEach(function (d) { var c2 = [cur[0] + DIRS[d].dx, cur[1] + DIRS[d].dy]; if (!nx && toGoal[key(c2[0], c2[1])] === cd - 1) nx = c2; });
      if (!nx) break;
      path.push(nx); cur = nx;
    }
    var v = reach ? villageNextTo(s, goal[0], goal[1]) : null;
    return { id: e.id, from: [e.x, e.y], path: path, reach: reach, village: v ? v.id : null, stop: stop };
  }
  // ステージ②（mission.defense.sealWin）: 村への道をふさぎきったら、プレイヤーがキーでクリアにできる（勝手には勝たない。オーナー 10/17）
  function sealReady(s) { return !s.result && missionType(s) === 'defense' && !!B.mission.defense.sealWin && rushSealed(s); }
  function claimSeal(s0) {
    if (!sealReady(s0)) return fail(s0, 'まだ村への道をふさいでいない');
    var s = clone(s0), ev = [];
    setResult(s, ev, 'win', '村への道をふさいだ！（勝利）');
    return { ok: true, state: s, events: ev, steps: [{ state: clone(s), events: ev.slice() }] };
  }
  // ふさぎきったか: 敵が全員突進の敵で、どの敵からも増援の出てくる所からも、どの村の隣へも行けない。
  //   人は動くので数えず、地形（と村）だけで見る。味方が道に立っているだけでは、ふさいだことにならない
  function rushSealed(s) {
    var es = enemiesOf(s);
    if (!objectsOf(s, 'village').length || es.some(function (e) { return e.stand !== 'rush'; })) return false;
    var starts = es.map(function (e) { return [e.x, e.y]; });
    if (s.spawn) starts.push([s.spawn.x, s.spawn.y]);
    var seen = {}, queue = [];
    starts.forEach(function (c) { if (!seen[key(c[0], c[1])]) { seen[key(c[0], c[1])] = true; queue.push(c); } });
    if (!queue.length) return false;
    while (queue.length) {
      var c = queue.shift();
      if (villageNextTo(s, c[0], c[1])) return false;
      neighbors(s, c[0], c[1]).forEach(function (n) {
        var k = key(n.x, n.y), t = getTile(s, n.x, n.y), o = unitAt(s, n.x, n.y);
        if (seen[k] || !isPassable(t) || RUSH_BLOCK[t] || (o && o.kind === 'village')) return;
        seen[k] = true;
        queue.push([n.x, n.y]);
      });
    }
    return true;
  }
  // 突進の敵が走る（＋体当たり）。使った道を返す
  function rushMove(s, e, ev, step) {
    var r = rushRoute(s, e);
    if (e.stuck) {
      unstick(e);
      ev.push({ type: 'mudSkip', id: e.id, text: unitLabel(s, e) + 'は泥沼にはまっていて動けない（1回休み）' });
    } else if (r && r.stop > 0) {
      var from = [e.x, e.y], to = r.path[r.stop - 1], last = r.stop > 1 ? r.path[r.stop - 2] : from;
      e.x = to[0]; e.y = to[1];
      e.facing = to[0] > last[0] ? 'right' : to[0] < last[0] ? 'left' : to[1] > last[1] ? 'down' : 'up';
      ev.push({ type: 'move', id: e.id, side: 'enemy', from: from, to: to, text: unitLabel(s, e) + 'が村へ向かって' + r.stop + 'マス走った' });
      if (getTile(s, e.x, e.y) === 'mud') enterMud(s, e, ev);
    } else if (r && !r.reach) {
      ev.push({ type: 'info', id: e.id, cells: [[e.x, e.y]], text: unitLabel(s, e) + 'は村への道がないので、その場で待った' });
    }
    step();
    // 走り終えて村の隣にいたら、体当たりで村を壊す
    var v = !s.result && villageNextTo(s, e.x, e.y);
    if (v) {
      var ctx = newShot();
      addHit(ctx, v, v.hp, 'ram');
      ev.push({ type: 'ram', id: e.id, cells: [[v.x, v.y]], text: unitLabel(s, e) + 'が' + unitLabel(s, v) + 'に体当たりした' });
      applyHits(s, ctx, ev);
      step();
    }
    return r;
  }

  // ---------------------------------------------------------------
  // 展示ステージ③（3人。.claude/IMPROVE_stage3.md）
  //   s.ex（シナリオの ex を写したもの）があるときだけ動く。
  //   ボス: 大きい体（size×size）。1ターンに1マス、向いている方へ進み（体の全部が入れるときだけ）、体の前の stage3.bossReach 列に一撃を予告する。
  //   取り巻き: 浮いている。地形に関係なく、風の人へまっすぐ進む（縦横で差の大きい方から。味方・敵・村のマスは通り抜けるが、止まれない）。
  //            風の人の隣に来たら体当たりを予告する。ボスの後ろから stage3.spawnEvery ターンごとに湧き続ける（上限 stage3.spawnMax）
  //   火山の熱（timePasses）・桜吹雪の扇（doSakuraStorm）・ミッション（exMissions）・ヒントの数え（exTurnEnd）
  // ---------------------------------------------------------------
  function bodyCells(u, x, y) {
    var n = u.size || 1, out = [];
    if (x === undefined) { x = u.x; y = u.y; }
    for (var dy = 0; dy < n; dy++) for (var dx = 0; dx < n; dx++) out.push([x + dx, y + dy]);
    return out;
  }
  function stepDirOf(a, b) { return b[0] > a[0] ? 'right' : b[0] < a[0] ? 'left' : b[1] > a[1] ? 'down' : 'up'; }
  // ボスの一撃: 体の前の辺から、向いている方へ stage3.bossReach 列（近い列から）
  function smashCells(s, u, facing) {
    var F = DIRS[facing], body = bodyCells(u), out = [];
    var proj = function (c) { return c[0] * F.dx + c[1] * F.dy; };
    var mx = Math.max.apply(null, body.map(proj));
    var front = body.filter(function (c) { return proj(c) === mx; });
    for (var k = 1; k <= B.stage3.bossReach; k++) {
      front.forEach(function (c) { var x = c[0] + F.dx * k, y = c[1] + F.dy * k; if (inBounds(s, x, y)) out.push([x, y]); });
    }
    return out;
  }
  // u の体が (x,y) に入れるか（体の全部が盤の中・自分の足で入れる自然・ほかのユニットがいない）
  function canStandBody(s, u, x, y) {
    return bodyCells(u, x, y).every(function (c) {
      if (!inBounds(s, c[0], c[1]) || !canEnter(u, getTile(s, c[0], c[1]))) return false;
      var o = unitAt(s, c[0], c[1]);
      return !o || o.id === u.id;
    });
  }
  function bossStep(s, e) {
    var F = DIRS[e.facing];
    return canStandBody(s, e, e.x + F.dx, e.y + F.dy) ? [e.x + F.dx, e.y + F.dy] : null;
  }
  // 風の人（取り巻きが狙う味方）
  function windOf(s) { return alliesOf(s).filter(function (a) { return a.magic === 'wind'; })[0] || null; }
  // 取り巻きの道: { path（進むマス）, to（止まるマス）, adjacent（止まったら風の人の隣）, target（風の人の id） }
  function floatRoute(s, e) {
    var w = windOf(s), path = [], x = e.x, y = e.y;
    if (!w) return { path: path, to: [x, y], adjacent: false, target: null };
    var near = function (px, py) { return Math.abs(px - w.x) + Math.abs(py - w.y) === 1; };
    var free = function (px, py) { var o = unitAt(s, px, py); return !o || o.id === e.id; };
    for (var k = 0; k < B.stage3.minionMove && !near(x, y); k++) {
      var dx = w.x - x, dy = w.y - y, sx = dx > 0 ? 1 : dx < 0 ? -1 : 0, sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
      var opts = Math.abs(dx) >= Math.abs(dy) ? [[sx, 0], [0, sy]] : [[0, sy], [sx, 0]];
      var next = null;
      for (var i = 0; i < opts.length && !next; i++) {
        var nx = x + opts[i][0], ny = y + opts[i][1];
        if ((!opts[i][0] && !opts[i][1]) || !inBounds(s, nx, ny)) continue;
        var o = unitAt(s, nx, ny), stopHere = k === B.stage3.minionMove - 1 || near(nx, ny);
        if (free(nx, ny) || (passThrough(o) && !stopHere)) next = [nx, ny];   // 止まらないなら通り抜けられる
      }
      if (!next) break;
      x = next[0]; y = next[1];
      path.push(next);
    }
    // 通り抜けの途中で進めなくなったら、止まれるマスまで戻る
    while (path.length && !free(x, y)) { path.pop(); x = path.length ? path[path.length - 1][0] : e.x; y = path.length ? path[path.length - 1][1] : e.y; }
    return { path: path, to: [x, y], adjacent: near(x, y), target: w.id };
  }
  // ミッション（s.ex.missions: [{ id, tile }]）: その自然が盤面に初めてできたら達成
  function exMissions(s, ev) {
    (s.ex.missions || []).forEach(function (m) {
      s.exDone = s.exDone || {};
      if (s.exDone[m.id] || s.tiles.indexOf(m.tile) < 0) return;
      s.exDone[m.id] = true;
      ev.push({ type: 'mission', id: m.id, cells: [], text: 'ミッション達成: ' + (m.name || m.id) });
    });
  }
  // ターン終了処理のあと: ヒントの数え（山がないまま・火山があるのに桜吹雪なし）と、取り巻きが湧く
  function exTurnEnd(s, ev, step) {
    var hasM = s.tiles.indexOf('mountain') >= 0, hasV = s.tiles.indexOf('volcano') >= 0;
    var c = s.exCount = s.exCount || { noMountain: 0, noSakura: 0 }, said = s.exHints = s.exHints || {};
    if (!hasM && !hasV) c.noMountain++;
    if (hasV) c.noSakura++;
    if (!said.noMountain && c.noMountain >= B.stage3.hintNoMountain) {
      said.noMountain = true;
      ev.push({ type: 'exHint', key: 'noMountain', text: '（ヒント）山がないまま' + c.noMountain + 'ターンが過ぎた' });
    }
    if (!said.noSakura && c.noSakura >= B.stage3.hintNoSakura) {
      said.noSakura = true;
      ev.push({ type: 'exHint', key: 'noSakura', text: '（ヒント）火山があるのに、桜吹雪をまだ起こしていない（' + c.noSakura + 'ターン）' });
    }
    if (s.ex.spawn && B.stage3.spawnEvery > 0 && s.turn % B.stage3.spawnEvery === 0) exSpawn(s, ev);
    step();
  }
  // 取り巻きが湧く: ボスの体のすぐ後ろの列（ボスの真ん中の行に近い順）。そこが盤の外かふさがっていたら、なるべく後ろの空いているマス
  function exSpawn(s, ev) {
    var sp = s.ex.spawn;
    if (enemiesOf(s).filter(function (e) { return e.stand === 'float'; }).length >= B.stage3.spawnMax) return;
    var boss = enemiesOf(s).filter(function (e) { return e.stand === 'boss'; })[0];
    var F = DIRS[boss ? boss.facing : 'left'], H = rowsOf(s);
    var n = boss ? (boss.size || 1) : 1, half = Math.floor(n / 2) + 1;   // 真ん中から体のすぐ後ろまでの歩数
    var cx = boss ? boss.x + Math.floor(n / 2) : s.size - 1, cy = boss ? boss.y + Math.floor(n / 2) : Math.floor(H / 2);
    var cands = [];
    for (var y = 0; y < H; y++) for (var x = 0; x < s.size; x++) {
      if (unitAt(s, x, y)) continue;
      var back = -((x - cx) * F.dx + (y - cy) * F.dy);   // ボスの後ろほど大きい
      if (back < 0) continue;
      cands.push({ x: x, y: y, first: back === half ? 0 : 1, back: back, side: Math.abs((x - cx) * F.dy) + Math.abs((y - cy) * F.dx) });
    }
    cands.sort(function (a, b) { return (a.first - b.first) || (b.back - a.back) || (a.side - b.side) || (a.y - b.y) || (a.x - b.x); });
    var at = cands[0];
    if (!at) return;
    var e = addEnemy(s, sp.magic || 'bite', at.x, at.y, sp.facing || (boss ? boss.facing : 'left'));
    e.stand = 'float'; e.body = 'float'; e.name = '取り巻き' + e.letter;
    if (sp.hp) { e.hpBase = sp.hp; e.hp = e.maxHp = sp.hp; }
    ev.push({ type: 'spawn', id: e.id, side: 'enemy', cells: [[e.x, e.y]], text: unitLabel(s, e) + 'がボスの後ろから湧いた' });
  }

  // 増援（チュートリアル②）: シナリオの spawn の所に、毎ターンの終わりに1体ずつ現れる（tutorial.spawn で切れる）。ふさがっていたら出られない
  function spawnPhase(s, ev, step) {
    var sp = s.spawn;
    if (!sp || !B.tutorial.spawn || s.result) return;
    if (!inBounds(s, sp.x, sp.y)) return;
    var o = unitAt(s, sp.x, sp.y), t = getTile(s, sp.x, sp.y);
    if (o || !isPassable(t)) { ev.push({ type: 'info', cells: [[sp.x, sp.y]], text: '増援は出られなかった（' + (o ? unitLabel(s, o) + 'がいる' : tileName(t) + 'がある') + '）' }); step(); return; }
    var e = addEnemy(s, sp.magic, sp.x, sp.y, sp.facing);
    PERSONA_FIELDS.forEach(function (f) { if (sp[f]) e[f] = sp[f]; });
    ev.push({ type: 'spawn', id: e.id, side: 'enemy', cells: [[e.x, e.y]], text: '増援: ' + unitLabel(s, e) + 'が現れた' });
    step();
  }

  // ---------------------------------------------------------------
  // 護衛: トロッコの道
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

  // 敵の魔法の発動のあと、ターン終了処理の前: トロッコがゴールへ1マス進む
  function wagonPhase(s, ev, step) {
    var w = objectsOf(s, 'wagon')[0];
    if (!w || s.result || missionType(s) !== 'escort') return;
    if (w.stuck) {
      unstick(w);
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
    for (var y = 0; y < rowsOf(s); y++) {
      for (var x = 0; x < s.size; x++) {
        var ft = getTile(s, x, y);
        if (!isPlant(ft) && !isVillage(unitAt(s, x, y))) continue;   // 森と【育つ】草むら、村（オーナー 11/03）へ燃え移る
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
      var life = (s.fireLife && s.fireLife[i]) || B.fire.burnOutTurns;   // 【育つ】植物が燃えた炎は植物ごとの長さ
      if (!(life > 0)) continue;   // 0 は燃え尽きない（オーナー 11/03）。年齢も数えない
      if (a >= life) cells.push([i % s.size, Math.floor(i / s.size)]);
      else age[i] = a;
    }
    return { cells: cells, age: age };
  }

  // 時間で変わる自然（燃え移り・炎の上のダメージ・火傷・燃え尽き・小さな炎が消える・花びらが散る・風がやむ・火の渦が解ける）
  function timePasses(s, ev, step) {
    // 1. 炎が隣の森へ燃え移る（処理開始時の盤面で同時に判定）
    var caught = fireSpreadCells(s);
    var caughtV = [], what = {};
    caught.forEach(function (c) {
      var o = unitAt(s, c[0], c[1]);
      if (isVillage(o)) caughtV.push(o);
      what[isVillage(o) ? '村' : getTile(s, c[0], c[1]) === 'thicket' ? '草むら' : '森'] = true;
    });
    caught.forEach(function (c) { setTile(s, c[0], c[1], 'fire'); });
    var caughtWhat = ['森', '草むら', '村'].filter(function (w) { return what[w]; }).join('・');
    if (caught.length) ev.push({ type: 'fireSpread', cells: caught, text: '炎が隣の' + caughtWhat + 'へ燃え移った（' + caught.length + 'マス）' });
    // 燃え移った村は壊れる（removeDead は下の 2 のダメージのあと。村が壊れた数は防衛の負けに数える）
    caughtV.forEach(function (o) {
      var amount = o.hp;
      o.hp = 0;
      ev.push({ type: 'damage', id: o.id, side: o.side, amount: amount, src: 'burn', cells: [[o.x, o.y]], text: '炎が' + unitLabel(s, o) + 'に燃え移った' });
    });
    step();

    // 2. 炎の上にいる者にダメージ
    var burnEv = [];
    s.units.forEach(function (u) {
      if (u.hp <= 0) return;   // いま燃え移って壊れた村
      if (getTile(s, u.x, u.y) === 'fire' || getTile(s, u.x, u.y) === 'firewhirl') {
        u.hp -= B.fireTileDamage;
        burnEv.push({ type: 'damage', id: u.id, side: u.side, amount: B.fireTileDamage, src: 'burn', cells: [[u.x, u.y]], text: '炎の上の' + unitLabel(s, u) + 'に' + B.fireTileDamage + 'ダメージ（残りHP ' + Math.max(0, u.hp) + '）' });
      }
    });
    // 火山の隣（と上）にいる者に熱のダメージ（敵にも味方にも。溶岩は火山のマスから出ない）。前は展示ステージ③だけ、10/29 からどのシナリオでも
    if (B.stage3.heat > 0) s.units.forEach(function (u) {
      if (u.side === 'object' || u.hp <= 0) return;
      var hot = bodyCells(u).some(function (c) {
        return getTile(s, c[0], c[1]) === 'volcano' || neighbors(s, c[0], c[1]).some(function (nb) { return getTile(s, nb.x, nb.y) === 'volcano'; });
      });
      if (!hot) return;
      u.hp -= B.stage3.heat;
      burnEv.push({ type: 'damage', id: u.id, side: u.side, amount: B.stage3.heat, src: 'heat', cells: [[u.x, u.y]], text: '火山の熱で' + unitLabel(s, u) + 'に' + B.stage3.heat + 'ダメージ（残りHP ' + Math.max(0, u.hp) + '）' });
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
      for (var y = 0; y < rowsOf(s); y++) {
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
    var calmGale = sweep('gale', 'empty');
    if (calmGale.length) ev.push({ type: 'smallfireOut', cells: calmGale, text: '【育つ】強風がやんだ（' + calmGale.length + 'マス）' });
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
    //   （このターンに動いて泥沼にはまった味方は、次のターンに休む）
    //   【一斉】泥沼で休んでいた味方（動いていない）は、構えていても、ここで休みを使ったことにする
    alliesOf(s).forEach(function (a) { if ((!a.acted || simulOn()) && a.stuck && !a.moved) unstick(a); });

    // 3a. 構える味方の魔法の発動（敵より先）。【一斉】味方の構えを構えた順に発動（構える味方はその最後）
    if (simulOn()) {
      s.lastOrder = stanceList(s).filter(function (a) { return !a.npc; }).map(function (a) { return a.id; });   // 次のターンの最初の順番
      if (stanceList(s).length) {
        ev.push({ type: 'phase', text: '── 構えの発動（構えた順） ──' });
        fireStances(s, ev, step);
      }
      alliesOf(s).forEach(function (a) { delete a.stance; });
    } else if (alliesOf(s).some(function (a) { return a.npc && a.intent; })) {
      ev.push({ type: 'phase', text: '── 構える味方の発動 ──' });
      allyFirePhase(s, ev, step);
    }

    // 3. 敵の魔法の発動
    if (!s.result && s.enemyActs && enemiesOf(s).some(function (e) { return e.intent; })) {
      ev.push({ type: 'phase', text: '── 敵の魔法の発動 ──' });
      enemyFirePhase(s, ev, step);
    }

    // 3b. 「進む」敵: 1マス進んで、届けば撃つ（移動と魔法のセット）
    if (!s.result && s.enemyActs && enemiesOf(s).some(function (e) { return e.stand === 'march'; })) {
      ev.push({ type: 'phase', text: '── 敵の移動と魔法 ──' });
      marchPhase(s, ev, step);
    }

    // 3c. 護衛: トロッコがゴールへ1マス進む
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

    // 4c. 構える味方がいるシナリオ: 敵が残ったままターン終了を迎えた回数（外したときのヒントに使う）
    if (!s.result && alliesOf(s).some(isNpc) && enemiesOf(s).length) s.misses = (s.misses || 0) + 1;

    // 4d. 増援（ターン終了処理のあと）
    if (!s.result && s.enemyActs) spawnPhase(s, ev, step);
    // 4e. 展示ステージ③: ヒントの数えと、取り巻きが湧く
    if (!s.result && s.ex) exTurnEnd(s, ev, step);

    // 5. 次のターンの用意: 構える味方が構え直す → 敵の移動と予告（このターンの終わりに。オーナー 11/03「前のターンの終わり」）→ 次のターン開始
    //   敵は置いた所から1ターン目を始め（startBattle）、2ターン目からは前のターンの終わりに動いて予告する。味方から動くのが基本
    if (!s.result) {
      alliesOf(s).forEach(function (a) { a.acted = false; delete a.moved; });
      armAllies(s);   // 【一斉】全員、前のターンの順で構える
      allyReadyPhase(s, ev, step);
      if (s.enemyActs && enemiesOf(s).length) {
        ev.push({ type: 'phase', text: '── 敵の移動と予告（ターン' + s.turn + 'の終わり） ──' });
        enemyPlanPhase(s, ev, step);
      }
    }
    if (!s.result) {
      s.turn += 1;
      ev.push({ type: 'turnStart', text: '── ターン' + s.turn + ' 開始 ──' });
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
    armAllies(s);   // 【一斉】全員、味方の並び順で構える（オーナー 11/03）
    allyReadyPhase(s, ev, step);
    if (s.enemyActs) enemyPlanPhase(s, ev, step, true);   // 1ターン目: 敵は置いた所から動かずに予告（味方から動く。オーナー 11/03）
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
    if (simulOn()) return previewStance(s0, unitId, to, dir);
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
      finishers: ctx.finishers, grows: ctx.grows, from: [u0.x, u0.y], to: to || [u0.x, u0.y], dir: dir,
      notes: ctx.notes
    };
  }

  // 【一斉】u が to へ動いて dir に構えた盤面（まだ発動していない）。構え直しなら順番はそのまま、新しい構えなら構える味方の前
  function placeStance(s0, unitId, to, dir) {
    var s = clone(s0);
    var u = findUnit(s, unitId);
    if (to && (to[0] !== u.x || to[1] !== u.y)) { u.x = to[0]; u.y = to[1]; }
    u.facing = dir;
    if (!u.stance) u.stance = { n: nextStanceN(s) };
    u.acted = true;
    return s;
  }
  // 【一斉】構えを全部、構えた順に発動したら何が起きるか（state は変えない）
  //   { after: 発動のあとの盤面, events, tileChanges, damages（同じ者へは合計）, moves, finishers, grows, cells: { 味方の id: 当たるマス }, combos }
  function fireAllStances(s) {
    var sim = clone(s);
    var startUnits = clone(sim.units), startTiles = sim.tiles.slice();
    var ev = [], links = newLinks(), hit = {}, hitOrder = [], src = {}, finishers = [], grows = [], cells = {};
    stanceList(sim).forEach(function (a0) {
      if (sim.result) return;
      var a = findUnit(sim, a0.id);
      if (!a) return;
      a.intent = false;
      var ctx = linkedShot(sim, a, links, ev);
      ctx.order.forEach(function (id) {
        if (!hit[id]) { hit[id] = 0; hitOrder.push(id); }
        hit[id] += ctx.hits[id].amount;
        src[id] = ctx.hits[id].src;
      });
      finishers = finishers.concat(ctx.finishers);
      grows = grows.concat(ctx.grows);
      cells[a.id] = ctx.cells;
    });
    var tileChanges = [];
    for (var i = 0; i < sim.tiles.length; i++) {
      if (sim.tiles[i] !== startTiles[i]) tileChanges.push({ x: i % sim.size, y: Math.floor(i / sim.size), from: startTiles[i], to: sim.tiles[i] });
    }
    var damages = [], moves = [];
    startUnits.forEach(function (b) {
      var a = findUnit(sim, b.id);
      if (hit[b.id] !== undefined) damages.push({ id: b.id, side: b.side, label: unitLabel({ units: startUnits }, b), x: a ? a.x : b.x, y: a ? a.y : b.y, amount: hit[b.id], src: src[b.id], dies: !a });
      if (a && (a.x !== b.x || a.y !== b.y)) moves.push({ id: b.id, from: [b.x, b.y], to: [a.x, a.y] });
    });
    var combos = ev.filter(function (e) { return e.type === 'finisher' && e.combo; }).map(function (e) { return { name: e.name, ids: e.combo, magics: e.comboMagics }; });
    return { after: sim, events: ev, tileChanges: tileChanges, damages: damages, moves: moves, finishers: finishers, grows: grows, cells: cells, combos: combos };
  }
  // 【一斉】予測: その構えを置いて、構えた順に全部起きたあと。state は構えを置いた盤面（敵の予告はこの盤面の forecast で計算し直す）
  function previewStance(s0, unitId, to, dir) {
    var u0 = findUnit(s0, unitId);
    var s = placeStance(s0, unitId, to, dir);
    var r = fireAllStances(s);
    return {
      state: s, after: r.after, events: r.events, cells: r.cells[unitId] || [], tileChanges: r.tileChanges, damages: r.damages, moves: r.moves,
      finishers: r.finishers, grows: r.grows, combos: r.combos, from: [u0.x, u0.y], to: to || [u0.x, u0.y], dir: dir, stance: true, order: stanceOrder(s, unitId)
    };
  }

  // 立ち位置の導き: 動ける各マスについて、どれかの向きで 決め手 → 'finisher'、自然のマスが変わる → 'change'
  //   空きマスはどの魔法でも何かができるので、「空き → 何か」だけの変化は数えない
  function guideMap(s, unitId) {
    var u = findUnit(s, unitId);
    var map = {};
    if (!u || (u.acted && !restancing(u))) return map;
    // 【一斉】ほかの味方の構えだけで起きる決め手・変化は数えない（この味方の構えで増えるものだけ）
    var baseFin = {}, baseChg = {};
    if (simulOn()) {
      var b0 = clone(s), bu = findUnit(b0, unitId);
      delete bu.stance;
      var br = fireAllStances(b0);
      br.finishers.forEach(function (f) { baseFin[f.name] = (baseFin[f.name] || 0) + 1; });
      br.tileChanges.forEach(function (c) { baseChg[key(c.x, c.y)] = c.to; });
    }
    var more = function (fins) {
      var n = {};
      return fins.some(function (f) { n[f.name] = (n[f.name] || 0) + 1; return n[f.name] > (baseFin[f.name] || 0); });
    };
    var order = restancing(u) ? [[u.x, u.y]] : moveInfo(s, u).order;
    order.forEach(function (pos) {
      var best = null;
      if (!canShoot(s, u, pos)) return;
      DIR_ORDER.forEach(function (dir) {
        var p = previewAct(s, unitId, pos, dir);
        if (more(p.finishers)) best = 'finisher';
        else if (!best && p.tileChanges.some(function (c) { return c.from !== 'empty' && baseChg[key(c.x, c.y)] !== c.to; })) best = 'change';
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
      for (var y = 0; y < rowsOf(s); y++) {
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
            if (a.acted || a.npc || a.magic !== h.magic) return;
            var found = null;
            moveInfo(s, a).order.some(function (pos) {
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
  //   allies: 構える味方の予告（敵より先に発動する。形は enemies と同じ。damages は enemyDamage にも入る）
  function forecast(s, opts) {
    //   rushes: 突進の敵が次のターンの始めに走る道（ターン終了処理のあとの盤面で、敵の順に走らせて計算する）
    var out = { allies: [], enemies: [], marches: [], rushes: [], fireSpread: [], burnOut: [], burn: [], enemyDamage: [], wagon: null };
    if (s.result) return out;
    var sim = clone(s);
    var links = newLinks();   // 【一斉】合体の見分け
    function fire(list, u0, linked) {
      var e = findUnit(sim, u0.id);
      var order = linked ? list.length + 1 : 0;
      if (!e || sim.result) {
        list.push({ id: u0.id, side: u0.side, cancelled: true, from: [u0.x, u0.y], to: [u0.x, u0.y], dir: u0.facing, magic: u0.magic, cells: [], tileChanges: [], damages: [], finishers: [], order: order });
        return;
      }
      var before = sim.tiles.slice(), units = clone(sim.units), evs = [];
      var ctx = linked ? linkedShot(sim, e, links, evs) : shoot(sim, e, e.facing, evs);
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
      list.push({ id: e.id, side: e.side, from: [e.x, e.y], to: [e.x, e.y], shootFrom: [e.x, e.y], dir: e.facing, magic: e.magic,
        cells: ctx.cells, tileChanges: tileChanges, damages: damages, finishers: ctx.finishers, order: order,
        combos: evs.filter(function (x) { return x.type === 'finisher' && x.combo; }).map(function (x) { return { name: x.name, ids: x.combo, magics: x.comboMagics }; }) });
    }
    if (simulOn()) {   // 【一斉】味方の構え（構えた順。構える味方は最後）
      stanceList(s).forEach(function (a0) { fire(out.allies, a0, true); });
    } else alliesOf(s).filter(function (a) { return a.npc && a.intent; }).forEach(function (a0) { fire(out.allies, a0); });
    if (s.enemyActs) enemiesOf(s).filter(function (e) { return e.intent; }).forEach(function (e0) { fire(out.enemies, e0); });
    if (sim.result) return out;
    // 「進む」敵: 発動のあとの盤面で、次に進むマスと、そこから撃つ魔法（enemies に入る。from は進んだ先）
    if (s.enemyActs) {
      marchPhase(sim, [], function () {},
        function (e, from, to) { out.marches.push({ id: e.id, from: from, to: to, dir: e.facing }); },
        function (e) { fire(out.enemies, e); });
    }
    // 護衛: 敵の魔法の発動のあとの盤面で、トロッコの次の1マスとゴールまでの道筋
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
    var held = missionType(later) === 'defense' && later.turn >= B.mission.defense.turns && objectsOf(later, 'village').length;   // 守り切って終わる
    if (s.enemyActs && !later.result && !held) {
      spawnPhase(later, [], function () {});
      enemiesOf(later).filter(function (e) { return e.stand === 'rush'; }).map(function (e) { return e.id; }).forEach(function (id) {
        var e = findUnit(later, id);
        if (!e || later.result) return;
        var stuck = !!e.stuck, r = rushMove(later, e, [], function () {});
        if (r) { if (stuck) r.stop = 0; out.rushes.push(r); }
      });
    }
    return out;
  }

  // 外したときのヒント: 敵が残ったままターン終了を tutorial.hintAfterMisses 回迎えたら、構える味方が狙っているマス（形のマス）
  function npcHintCells(s) {
    if (s.result || (s.misses || 0) < B.tutorial.hintAfterMisses) return [];
    var out = [];
    alliesOf(s).forEach(function (a) {
      if (!a.npc || !a.intent) return;
      // 今の盤面で実際に撃ったときに届くマス（オーナー 10/29。前は魔法の形の決まりで、風は4マス光っていた）
      var sim = clone(s), sa = findUnit(sim, a.id);
      shoot(sim, sa, sa.facing, []).cells.forEach(function (c) { if (!inCells(out, c[0], c[1])) out.push(c); });
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
      var used = alliesOf(s).map(function (a) { return a.magic; });
      var mine = allyMagics(s);
      if (magic && mine.indexOf(magic) < 0) return fail(s0, magicName(magic) + 'は敵だけの魔法');
      var m = magic || B.ally.defaultMagics.filter(function (d) { return used.indexOf(d) < 0 && mine.indexOf(d) >= 0; })[0] || mine[0];
      return { ok: true, state: s, events: [], steps: [], unit: addAlly(s, m, x, y, 'up') };
    }
    return { ok: true, state: s, events: [], steps: [], unit: addEnemy(s, magic || B.enemy.defaultMagic, x, y, 'down') };
  }

  // お題の置きもの（村・トロッコ）を置く。トロッコは1台だけ
  function editPlaceObject(s0, kind, x, y) {
    if (!OBJECT_INFO[kind]) return fail(s0, '置きものがない');
    if (!inBounds(s0, x, y)) return fail(s0, '盤の外');
    if (unitAt(s0, x, y)) return fail(s0, 'もうユニットがいる');
    if (!canStand(s0, x, y)) return fail(s0, '通れないマスには置けない');
    if (kind === 'wagon' && objectsOf(s0, 'wagon').length) return fail(s0, 'トロッコは1台まで');
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

  // 味方を「構える味方」にする／戻す
  function editSetNpc(s0, unitId, on) {
    var u0 = findUnit(s0, unitId);
    if (!u0 || u0.side !== 'ally') return fail(s0, '味方がいない');
    var s = clone(s0);
    var u = findUnit(s, unitId);
    if (on) u.npc = true; else { delete u.npc; delete u.intent; }
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
      for (var x = 0; x < size; x++) tiles.push(x < s0.size && y < rowsOf(s0) ? getTile(s0, x, y) : 'empty');
    }
    s.size = size;
    delete s.h;   // 大きさを変えると正方形に戻る
    if (s.spawn && !inBounds(s, s.spawn.x, s.spawn.y)) delete s.spawn;
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
    if (s.fireLife) s.fireLife = {};
    delete s.misses;
    delete s.exDone; delete s.exCount; delete s.exHints;   // 展示ステージ③: ミッション・ヒントの数え
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
      delete u.stance; delete u.moved;
      if (u.side === 'enemy' || u.npc) u.intent = false;
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
      version: 2, size: s.size, h: s.h || undefined, tiles: s.tiles, enemyActs: s.enemyActs, enemyOnlyMagics: s.enemyOnlyMagics || undefined,
      overrides: s.overrides || undefined, spawn: s.spawn || undefined,
      mission: { type: m.type, goal: m.goal || [], exit: m.exit || [], treasure: carrier ? [carrier.x, carrier.y] : (m.treasure || null) },
      units: s.units.map(function (u) {
        if (u.side === 'object') return { side: 'object', kind: u.kind, x: u.x, y: u.y };
        var o = { side: u.side, magic: u.magic, x: u.x, y: u.y, facing: u.facing };
        if (u.npc) o.npc = true;
        if (u.side === 'enemy') PERSONA_FIELDS.forEach(function (f) { if (u[f] !== undefined) o[f] = u[f]; });
        return o;
      })
    });
  }

  function importLayout(json) {
    var d;
    try { d = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { return { ok: false, error: 'JSON として読めない' }; }
    if (!d || typeof d !== 'object') return { ok: false, error: '中身が空' };
    var size = Number(d.size);
    var h = d.h === undefined || d.h === null ? size : Number(d.h);
    if (!(size >= B.minBoardSize && size <= B.maxBoardSize) || !(h >= B.minBoardSize && h <= B.maxBoardSize)) return { ok: false, error: '盤面サイズは ' + B.minBoardSize + '〜' + B.maxBoardSize };
    if (!Array.isArray(d.tiles) || d.tiles.length !== size * h) return { ok: false, error: '地形の数が合わない' };
    if (d.tiles.some(function (t) { return !TILE_INFO[t]; })) return { ok: false, error: '知らない地形がある' };
    var s = blankState(size, d.enemyActs !== false, h);
    s.tiles = d.tiles.slice();
    if (Array.isArray(d.enemyOnlyMagics)) {
      if (d.enemyOnlyMagics.some(function (m) { return !MAGIC_INFO[m]; })) return { ok: false, error: '敵だけの魔法に知らない魔法がある' };
      s.enemyOnlyMagics = d.enemyOnlyMagics.slice();
    }
    if (d.overrides !== undefined && d.overrides !== null) {
      if (!validOverrides(d.overrides)) return { ok: false, error: 'このシナリオだけの数値（overrides）に知らない項目か、型の違う値がある' };
      s.overrides = clone(d.overrides);
    }
    if (d.spawn !== undefined && d.spawn !== null) {
      var sp = d.spawn;
      if (!sp || !inBounds(s, sp.x, sp.y) || !MAGIC_INFO[sp.magic] || (sp.facing && !DIRS[sp.facing]) ||
        PERSONA_FIELDS.some(function (f) { return sp[f] !== undefined && !PERSONA[f][sp[f]]; })) return { ok: false, error: '増援（spawn）が正しくない' };
      s.spawn = clone(sp);
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
      else if (u.side === 'ally') { var a = addAlly(s, u.magic, u.x, u.y, DIRS[u.facing] ? u.facing : 'up'); if (u.npc) a.npc = true; }
      else {
        var e = addEnemy(s, u.magic, u.x, u.y, DIRS[u.facing] ? u.facing : 'down');
        PERSONA_FIELDS.forEach(function (f) { if (u[f] !== undefined) { if (!PERSONA[f][u[f]]) bad = true; else e[f] = u[f]; } });
      }
      if (bad) return { ok: false, error: '敵の個性が正しくない' };
    }
    return { ok: true, state: s };
  }

  // ---------------------------------------------------------------
  // 初期シナリオ
  //   . 空き  F 森  M 山  R 川  X 炎  s 小さな炎  V 火山  D 泥沼  P 水たまり  H 蜃気楼  I 氷  L 溶岩  W つむじ風  T 竜巻
  // ---------------------------------------------------------------
  var CH = { '.': 'empty', F: 'forest', M: 'mountain', R: 'river', X: 'fire', s: 'smallfire', V: 'volcano', D: 'mud', P: 'puddle', H: 'mirage', I: 'ice', L: 'lava', W: 'whirlwind', T: 'tornado', B: 'breeze', Q: 'firewhirl', K: 'sakura', p: 'petals', G: 'deadforest', O: 'haunted', h: 'hill', g: 'thicket', b: 'gale', k: 'hillsakura' };
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
      desc: '【お題】護衛。味方 土・水・風、敵2体（A: 的＝トロッコを狙う／B: 人数）。トロッコはターンの終わりに、ゴール（右の端）への一番短い道を1マス進む（危ない所とユニットは避ける）。真ん中の川は切れ目からしか渡れない。山や川で道を変えられる。風で押すとトロッコも運ばれる。',
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
      enemies: [['fire', 3, 2, {}, 'down'], ['fire', 2, 3, {}, 'down']]   // 敵は前の「1ターン目の頭に動いたあと」の位置に置いた（1ターン目は動かない。オーナー 11/03）
    },
    {
      id: 'trap', name: '【敵】罠に踏み込む',
      desc: '【敵】味方 草・火・風、敵2体（土）。敵Aは「通れない所だけ避ける」ので炎の列を踏み越えて来た所（(1,3)）から始まる。敵Bは「危ない所も避ける」ので炎の向こうから出られない。踏み込んできた敵Aを、火と風の燃え広がりで迎え撃つ（足元が森でないと弱い炎で、5＋火傷）。炎の列は燃え尽きない（オーナー 11/03）ので、敵Bは炎の列がある間は出てこない。敵Bの土の予告先に立つと倒れる。',
      rows: ['......', '......', 'XXXXXX', '......', '.FFFF.', '......'],
      allies: [['grass', 0, 5], ['fire', 2, 5], ['wind', 5, 5]],
      enemies: [['earth', 1, 3, { avoid: 'wall' }, 'down'], ['earth', 4, 1, { avoid: 'danger' }, 'down']]   // 敵は前の「1ターン目の頭に動いたあと」の位置に置いた（1ターン目は動かない。オーナー 11/03）
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
      enemies: [['fire', 2, 2, {}, 'down']]   // 敵は前の「1ターン目の頭に動いたあと」の位置に置いた（1ターン目は動かない。オーナー 11/03）
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
      desc: '【新案】味方 土・火・風、敵1体（火）。山に火で火山、火山に風で花びらが扇形に舞う桜吹雪（花びらを切ると元の火の粉。森に落ちれば燃え出す）。',
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

  // ---------------------------------------------------------------
  // チュートリアル（展示用。IMPROVE_tutorial1〜）
  //   シナリオと同じ形。ほかに overrides（このシナリオの中だけの数値）・tutorial（番号）・short（ボタンに出す短い名前）を持つ。
  //   味方の4つ目に { npc: true, facing } で「構える味方」、敵の4つ目に { stand: 'still' } で「動かない」敵、{ stand: 'march' } で「1マスずつ進む」敵。
  //   desc は設計者向けのメモ（チュートリアルでは画面に出さない。盤面と表示だけで伝わるかを確かめるため）
  // ---------------------------------------------------------------
  var TUTORIALS = [
    {
      id: 'tut1', tutorial: 1, name: '【チュートリアル】① 重ねる', short: '① 重ねる',
      desc: '教えること: 味方が構えている魔法に、自分の魔法を重ねるとシナジーが起きる。敵ではなく、関係なさそうなマスに撃った一手で勝てる。' +
        '正解: 自分が (1,2) へ動き、上を向いて (1,1) に火 → 発動で構える味方の風が火に当たり、右へ3マス燃え広がって森ごと敵が燃える。' +
        '敵（山を盛る魔法: 2マス先を真ん中に十字5マス、一度で山）は毎ターンの終わりに左へ1マス進む。ターン2までは森の中。' +
        'ターン3に森から出ると、真ん中の2マス先に構える味方が来るので予告して撃ち、構える味方は倒れてそのマスも山になり、失敗。',
      rows: ['...FF', '...FF', '.....', '.....', '.....'],
      allies: [['wind', 0, 1, { npc: true, facing: 'right' }], ['fire', 0, 2, { facing: 'right' }]],
      enemies: [['mount', 4, 1, { stand: 'march' }, 'left']],
      enemyOnly: ['mount']   // 山を盛る魔法は敵だけ
      // オーナー 10/29: ルールの上書き（風は正面1マスで残らない・燃え広がり3マス・移動2）は外した。どのシナリオとも同じ値で動く
    },
    {
      id: 'tut2', tutorial: 2, name: '【チュートリアル】② 2人で守る', short: '② 2人で守る', mission: 'defense',
      desc: '2人を動かす防衛戦。教えること: 倒しきれない敵は、倒すのではなく自然で道をふさぐ。2人の魔法を、自分で順番を決めて重ねる。' +
        '勝てる一例: 山使いがその場で上に撃つ → 頂上 (0,3)、腕 (0,2)(0,4)(1,3) の T 字の山。水使いが (1,4) へ上がり、上を向いて右の腕 (1,3) に水 → ' +
        '頂上と反対の右へ (2,3)〜(5,3) に川が流れ、4行目が端から端までふさがる。ふさぎきったら「クリア」（C キー）で、最後のターンを待たずにクリアにできる。1ターン目に何もしなくても、2ターン目に同じ手で間に合う。3ターン目では遅く、何もしなければ4ターン目の敵の移動で村に届いて負け。' +
        '敵は突進（人は無視して一番近い村へ1ターンに1マス、村の隣で体当たり）。毎ターンの終わりに上の端 (3,0) から1体ずつ増える。ふさがなくても5ターン守れば勝ち。',
      // 6×6（オーナー 10/17: 敵は1ターンに1マスでいい代わりに毎ターン新しい敵が出る。縦長でなく正方形に）
      rows: ['......', '......', '......', '......', '......', '......'],
      allies: [['mount', 0, 5, { facing: 'up' }], ['water', 1, 5, { facing: 'up' }]],
      enemies: [['earth', 3, 0, { stand: 'rush' }, 'down'], ['earth', 4, 0, { stand: 'rush' }, 'down']],
      villages: [[2, 5], [3, 5], [4, 5], [5, 5]],
      spawn: { x: 3, y: 0, facing: 'down', magic: 'earth', stand: 'rush' },   // 増援の出てくる所【仮】
      // やり直したときに盤面の上に1行だけ出すヒントは texts.js（stages.tut2.hint。ターンの形ごと）
      // 突進は1ターンに1マス、5ターン目の終わりまで守れば勝ち。道をふさぎきったらキーでクリアにできる（オーナー 10/17）
      //   オーナー 10/29: ルールの上書き（水は正面1マス・山の頂上と腕・移動2）は外した。どのシナリオとも同じ値で動く。残すのはステージの中身（敵の動き・勝ち方）だけ
      overrides: { 'enemy.rushMove': 1, 'mission.defense.turns': 5 }
    },
    {
      // 展示ステージ③（.claude/IMPROVE_stage3.md）。①②で覚えた「敵のいないところに撃つ」「魔法同士をつなぐ」を、3人と3段でいちばん大きな形にする締め
      id: 'ex3', tutorial: 3, name: '【展示】③ 3人でつなぐ', short: '③ 3人でつなぐ',
      desc: '味方 山・火・風の3人（①②の人たち）。盤面は横長（10×7）。味方は左端、敵は右から来る。' +
        'ボス（3×3・HP20）は1ターンに1マス前へ進み、体の前の2列に一撃を予告する（当たった味方は倒れる）。普通の魔法はほとんど効かず、桜吹雪で倒れる。' +
        '取り巻き（浮いている・HP1）は地形に関係なく風の人へまっすぐ進み、隣に来たら体当たり。ボスの後ろから2ターンごとに湧き続ける。' +
        '3段: 山の魔法で十字の山 → 山に火で火山（隣と上にいる者はターン終了ごとに熱で2）→ 火山に風で桜吹雪（火山の幅から風下へ扇形。扇の中の敵を、浮いている敵も含めてまとめて倒す）。' +
        'ボスを倒せば勝ち。味方が1人でも倒れたらステージの頭からやり直し。' +
        '【仮組み 10/30】一斉発動（つながる）の1ターン目に、山 → 火 → 風 の順に構えると、ボスと取り巻き2体をまとめて一掃できる配置。' +
        '一掃の例: 山使いが (1,3) へ1歩出て右へ（十字の真ん中 (3,3)）→ 火使いが (2,4) から上へ（十字の左の腕に火）→ 風使いが (1,2) から右へ（十字の上の腕に風）。' +
        '山使いが (1,4) から右へ盛る形でも一掃できる。山使いがその場から盛ると、扇がボスまでしか届かず、取り巻きが残る。手は tests/ex3_search.js で数える',
      rows: ['..........', '..........', '..........', '..........', '..........', '..........', '..........'],
      allies: [['mount', 0, 3, { facing: 'right' }], ['fire', 1, 5, { facing: 'right' }], ['wind', 0, 2, { facing: 'right' }]],
      enemies: [
        ['smash', 7, 2, { stand: 'boss', hp: 20, size: 3 }, 'left'],   // オーナー 10/29: HP40 → 20（桜吹雪の威力20を1発で）。1ターン目の始めに (6,2) へ
        ['bite', 9, 0, { stand: 'float', hp: 1, body: 'float' }, 'left'],   // 1ターン目の始めに風の人へ2マス進んで (7,0)
        ['bite', 9, 6, { stand: 'float', hp: 1, body: 'float' }, 'left']    // 同じく (7,6)
      ],
      enemyOnly: ['smash', 'bite'],
      ex: {
        spawn: { magic: 'bite', hp: 1 },                                     // 湧く取り巻き（間隔と上限は stage3.spawnEvery・spawnMax）
        missions: [{ id: 'volcano', tile: 'volcano', name: '火山を作る' }],   // 最初から出すミッション（表示名は texts.js の stages.ex3.mission）
        fireModes: true      // 魔法の出し方（ターンの終わりにつながる／撃った瞬間に発動）を画面で切り替える（開発モードだけ。展示・作るモードはつながる）。「1段ずつ」はオーナー 10/30 で外した
        // 光るヒント・桜吹雪の前のため・倒したあとの大きな絵・ミッション達成の札と紙吹雪・桜吹雪の舞う花びらは、オーナー 10/17「いらない」で外した
        // 予測を形だけにする shapeOnly は、オーナー 10/29 からどのシナリオでも（balance.js の preview.shapeOnly）
      }
      // オーナー 10/29: ルールの上書き（山はダイヤ型13マス・火は正面2マス・風は正面4マスで残らない・桜吹雪の威力60・溶岩はあふれない・移動2）と、
      //   ③だけの分岐（桜吹雪の扇を盤の端まで・火山の熱）は外した。どのシナリオとも同じ値・同じ動きで動く
    }
  ];

  // 【縮尺】広場: 見本ごとの大きさ n で作る遊び場【仮】。味方は下の段に3人（草・土・風）、敵は上の段に火の敵2体（狙いは「近い人」と「自然」）。
  //   真ん中に、魔法で作れる自然を少し（森2つ・水たまり・丘。育つを切っているときは丘の代わりに山）
  function plazaLayout(n) {
    n = clampSize(n);
    var rows = [];
    for (var y = 0; y < n; y++) rows.push(new Array(n + 1).join('.'));
    function put(x, y, ch) { rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1); }
    var mid = Math.floor(n / 2), q = Math.max(1, Math.floor(n / 4));
    put(q, mid - 1, 'F'); put(q, mid, 'F');
    put(mid, mid - 1, 'P');
    put(n - 1 - q, mid, B.grow.enabled ? 'h' : 'M');
    var ax = [mid - 2, mid, mid + 2].map(function (x) { return Math.max(0, Math.min(n - 1, x)); });
    return {
      id: 'plaza', name: '広場（' + n + '×' + n + '）',
      desc: '縮尺くらべ用の広場。味方は下の段に草・土・風、敵は上の段に火の敵2体（狙いは近い人と自然）。盤面の大きさ・移動・形・育つは、上のバーの見本か調整パネルで変わる。',
      rows: rows,
      allies: [['grass', ax[0], n - 1], ['earth', ax[1], n - 1], ['wind', ax[2], n - 1]],
      enemies: [['fire', q, 0, { aim: 'near' }], ['fire', n - 1 - q, 0, { aim: 'nature' }]]
    };
  }

  // チュートリアル: 負けたあとのやり直し。ステージを最初から始め直し、やり直した回数（tries）を1つ増やす
  function retryStage(s0) {
    var p = s0 && s0.stage && findPreset(s0.stage);
    if (!p) return null;
    var s = buildPreset(p);
    s.tries = (s0.tries || 0) + 1;
    return withOverrides(s.overrides, function () { return startBattle(s); });
  }
  // やり直したとき（2回目以降の開始時）に盤面の上に出すヒント（1文）。なければ null
  //   文は texts.js の stages[ステージ].hint（ターンの形ごと: { simul, single }）。空ならなし
  function stageHint(s) {
    var p = s && s.stage && findPreset(s.stage);
    if (!p || !((s.tries || 0) > 0)) return null;
    var T = texts(), st = T && T.stages && T.stages[p.id];
    var h = st && st.hint;
    if (h && typeof h === 'object') h = h[simulOn() ? 'simul' : 'single'];
    return h || null;
  }

  // シナリオ（チュートリアルも）の定義を id で探す
  function findPreset(id) {
    return PRESETS.concat(TUTORIALS).filter(function (x) { return x.id === id; })[0] || null;
  }
  function loadPreset(id) {
    if (id === 'plaza') return buildPreset(plazaLayout(B.boardSize));
    var p = findPreset(id);
    return p ? buildPreset(p) : null;
  }
  // シナリオの形（rows・allies・enemies…）から盤面を作る。新案プレイ（checks.js）の盤面もこれで作る
  function buildPreset(p) {
    return withOverrides(p.overrides, function () { return buildPresetIn(p); });
  }
  function buildPresetIn(p) {
    var s = blankState(p.rows[0].length, p.enemyActs !== false, p.rows.length);   // 横は1行の文字数、縦は行の数（enemyActs: false で敵は何もしない）
    if (p.overrides) s.overrides = clone(p.overrides);
    p.rows.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) setTile(s, x, y, CH[row[x]]);
    });
    p.allies.forEach(function (a) {
      var o = a[3] || {};
      var u = addAlly(s, a[0], a[1], a[2], o.facing || 'up');
      if (o.npc) u.npc = true;
    });
    p.enemies.forEach(function (e) {
      var u = addEnemy(s, e[0], e[1], e[2], e[4] || 'down');
      if (e[3]) PERSONA_FIELDS.forEach(function (f) { if (e[3][f]) u[f] = e[3][f]; });
      // 展示ステージ③: HP・大きさ・体（浮く）。ボスと取り巻きの名前
      if (e[3] && e[3].hp) { u.hpBase = e[3].hp; u.hp = u.maxHp = e[3].hp; }
      if (e[3] && e[3].size) u.size = e[3].size;
      if (e[3] && e[3].body) u.body = e[3].body;
      if (u.stand === 'boss') { u.name = 'ボス'; u.exBoss = true; }
      if (u.stand === 'float') u.name = '取り巻き' + u.letter;
    });
    if (p.enemyOnly) s.enemyOnlyMagics = p.enemyOnly.slice();
    if (p.spawn) s.spawn = clone(p.spawn);
    if (p.ex) s.ex = clone(p.ex);     // 展示ステージ③（ボス・取り巻き・火山の熱・桜吹雪の扇・ミッション・ヒント・画面の見せ方）
    if (p.tutorial) s.stage = p.id;   // やり直し（retryStage）とヒント（stageHint）に使う
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
    if (s.ex) {   // 展示ステージ③: ボスを倒せば勝ち（取り巻きは湧き続ける）。味方が1人でも倒れたら頭からやり直し
      var boss = enemiesOf(s).filter(function (e) { return e.stand === 'boss'; })[0];
      info.win = 'ボスを倒す';
      info.lose = '味方が1人でも倒れる（ステージの頭からやり直し）';
      info.status.push(boss ? 'ボス HP ' + boss.hp + '/' + boss.maxHp : 'ボスを倒した');
      info.status.push('取り巻き ' + enemiesOf(s).filter(function (e) { return e.stand === 'float'; }).length + '体');
      return info;
    }
    if (type === 'annihilate') {
      info.win = '敵を全員倒す';
      info.status.push('敵 残り' + enemiesOf(s).length + '体');
    } else if (type === 'defense') {
      var T = B.mission.defense.turns;
      var canSeal = B.mission.defense.sealWin && (enemiesOf(s).some(function (e) { return e.stand === 'rush'; }) || !!(s.spawn && s.spawn.stand === 'rush'));   // ふさぐ相手（突進）がいるときだけ書く
      info.win = 'ターン' + T + 'の終わりまで村を守る（' + (canSeal ? '村への道をふさいだら、その場でクリアにできる。' : '') + '敵の全滅でも勝ち）';
      info.lose = '村が' + B.mission.defense.loseAt + 'つ壊れる／味方が全員倒れる';
      // 「ターン4/5」の形だけ（決着の前とあとで長さを変えない。村の行は出さない。村の HP は村のマスを押すと出る。IMPROVE_controls 3-1）
      info.status.push('ターン' + Math.min(s.turn, T) + '/' + T);
    } else if (type === 'escort') {
      info.win = 'トロッコがゴールに入る';
      info.lose = 'トロッコが壊れる／味方が全員倒れる';
      var w = objectsOf(s, 'wagon')[0];
      if (w) {
        var r = wagonRoute(s);
        info.status.push('トロッコ HP' + w.hp + '/' + w.maxHp);
        info.status.push(r && r.steps !== null ? 'ゴールまで ' + r.steps + '歩' : 'ゴールへの道がない（待つ）');
        if (w.stuck) info.status.push('泥沼: 次は進めない');
      } else info.status.push('トロッコがない');
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
    TILE_INFO: TILE_INFO, TILES: TILES, MAGIC_INFO: MAGIC_INFO, MAGICS: MAGICS, CH: CH,   // CH: シナリオの rows の1文字 → 地形（エディットのステージの書き出し stages_io.js が使う）
    DIRS: DIRS, DIR_ORDER: DIR_ORDER, PRESETS: PRESETS,
    hidden: hidden, PERSONA: PERSONA, canEnter: canEnter, enemyOnlyMagics: enemyOnlyMagics, allyMagics: allyMagics,
    clone: clone, inBounds: inBounds, getTile: getTile, setTile: setTile, isPassable: isPassable,
    unitAt: unitAt, findUnit: findUnit, alliesOf: alliesOf, enemiesOf: enemiesOf,
    unitLabel: unitLabel, tileName: tileName, magicName: magicName,
    // 状態を受け取る関数は、その状態の overrides（このシナリオだけの数値）の中で動く
    rotate: rotate, shapeCells: withStage(shapeCells),
    createState: createState, addAlly: addAlly, addEnemy: addEnemy,
    reachableCells: withStage(reachableCells), act: withStage(act), move: withStage(move), allAlliesActed: allAlliesActed, endTurn: withStage(endTurn), startBattle: withStage(startBattle),
    planEnemy: withStage(planEnemy), previewAct: withStage(previewAct), guideMap: withStage(guideMap), nextHints: withStage(nextHints), forecast: withStage(forecast),
    editPaint: editPaint, editPlaceUnit: editPlaceUnit, editRemoveUnit: editRemoveUnit,
    editMoveUnit: editMoveUnit, editSetMagic: editSetMagic, editSetFacing: editSetFacing, editSetPersona: editSetPersona,
    editSetEnemyActs: editSetEnemyActs, editResize: editResize, normalizeForPlay: withStage(normalizeForPlay),
    exportLayout: exportLayout, importLayout: importLayout, loadPreset: loadPreset, buildPreset: buildPreset, plazaLayout: plazaLayout,
    // お題
    MISSION_INFO: MISSION_INFO, MISSIONS: MISSIONS, OBJECT_INFO: OBJECT_INFO,
    objectsOf: objectsOf, addObject: addObject, missionTargets: missionTargets, missionInfo: withStage(missionInfo),
    wagonRoute: withStage(wagonRoute), canShoot: canShoot, carrierOf: carrierOf, inCells: inCells,
    editPlaceObject: editPlaceObject, editSetMission: editSetMission, editToggleCell: editToggleCell, editPlaceTreasure: editPlaceTreasure,
    // チュートリアル（構える味方・動かない敵・このシナリオだけの数値）
    TUTORIALS: TUTORIALS, findPreset: findPreset, isNpc: isNpc, controllableOf: controllableOf,
    npcHintCells: withStage(npcHintCells), editSetNpc: editSetNpc, validOverrides: validOverrides,
    slopeMap: withStage(slopeMap), mountainSlopes: withStage(mountainSlopes),   // 山の斜面（10/29 からどの山にも）
    // チュートリアル②（横長・縦長の盤面・突進の敵・山の頂上と腕・やり直しとヒント）
    rowsOf: rowsOf, rushRoute: withStage(rushRoute), retryStage: retryStage, stageHint: stageHint,
    sealReady: withStage(sealReady), claimSeal: withStage(claimSeal),   // ステージ②: ふさぎきったらキーでクリア
    withOverrides: function (s, fn) { return withOverrides(s && s.overrides, fn); },
    // 【一斉】ターンの形（構えて、ターンの終わりに一斉に発動）
    simulOn: simulOn, stanceList: stanceList, stanceOrder: stanceOrder, reorderStance: withStage(reorderStance),
    fireAllStances: withStage(fireAllStances), restancing: restancing, texts: texts
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Rules = api;
  }
})(this);
