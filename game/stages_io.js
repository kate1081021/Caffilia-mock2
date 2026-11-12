/*
 * stages_io.js — エディットで作るステージの読み書きの道具（オーナー 10/30）
 *   画面に依存しない関数だけ（node でテストできる）。画面は ui.js のエディット。
 *   ブラウザでは グローバル変数 StagesIO、node では module.exports で読める。ルール（rules.js）は R として受け取って使うだけ。
 *
 *   ステージは、チュートリアル（rules.js の TUTORIALS）と同じ形の定義（rows・allies・enemies・villages…）で持つ。
 *   遊ぶときは R.buildPreset → R.startBattle で、チュートリアルを読むのと同じ道を通る（ルールも同じ）。
 *   定義の id は PREFIX（my:）＋名前。チュートリアルの id とは重ならないので、元のチュートリアルは書き換わらない。
 *
 *   toDef(R, s, name)            … エディットの盤面（遊び始める前の状態）から、ステージの定義を作る
 *   build(R, def)                … 定義を確かめてから盤面を作る（R.buildPreset）。{ ok, state } か { ok: false, error }
 *   resize(R, s, w, h)           … 盤面の横・縦を変える。置いた物は同じ位置のまま、はみ出した物は外す。{ state, dropped }
 *   winOf(R, s) / setWin(R, s, kind, turns, exKeep) … 勝ち方（WINS のどれか）
 *   setHp(R, s, id, hp)          … 敵のHP
 *   fits(R, s, u, x, y)          … 体（大きい敵は size×size）が盤に収まり、通れるマスで、ほかと重ならないか。だめなら理由の文
 *   toFile(stage) / fromFile(R, text) … 書き出すファイル（JSON）。前の「配置」の JSON（exportLayout）も読める
 *   blankTexts(name) / linesToText(lines) / textToLines(text) … 会話の窓の文（texts.js の stages.<id> と同じ形）
 */
(function (root) {
  'use strict';

  var PREFIX = 'my:';
  var FORMAT = 'cafilia-stage';

  // 勝ち方。ルールにある勝ち負けの決まりから選ぶ（新しい決まりは作らない）
  //   boss: ステージ③の決まり（s.ex。ボスを倒せば勝ち・味方が1人でも倒れたら負け）
  //   defense: お題の防衛（mission.defense.turns ターン守る。突進の敵の道をふさいだら、その場でクリアにもできる）。
  //     前の「道をふさぐ」（seal）は「村を守る」と同じなので1つにした（オーナー 11/03）。前のステージの seal・sealWin の上書きは、読むと村を守るになる
  var WINS = [
    { id: 'annihilate', name: '敵を全員倒す' },
    { id: 'boss', name: 'ボスを倒す（味方が1人でも倒れたら負け）' },
    { id: 'defense', name: '村を守る（決めたターンまで守るか、道をふさいだらクリア）' },
    { id: 'escort', name: 'トロッコをゴールへ' },
    { id: 'retrieve', name: '宝を持って帰り口へ' }
  ];
  var OV_TURNS = 'mission.defense.turns', OV_SEAL = 'mission.defense.sealWin';
  // ステージごとに変えてよい数値は、この2つだけ（オーナー 11/12「魔法が場面によって別のはたらきをするのはおかしい」）。
  //   守るターン数と、敵の歩数（突進の敵が1ターンに進むマス数）。魔法の形・シナジーの長さ・案の入切は、どのステージでも同じ。
  //   ほかの項目が書いてあるステージは、読むときに断る（checkDef）。OV_SEAL は前のステージに残っているしるしで、読むと捨てる（build）
  //   敵の歩数は、ほんとうはステージではなく敵の種類のもの。敵の種類を作ったら、そちらへ移してここから外す（オーナー 11/12）
  var OV_RUSH = 'enemy.rushMove';
  var STAGE_OVERRIDES = [OV_TURNS, OV_RUSH, OV_SEAL];
  // 難易度（オーナー 11/03。IMPROVE_ステージ一覧 段1）: 定義の difficulty に持つ。ないものは「なし」。内蔵の①②③はチュートリアル
  var DIFFICULTIES = [
    { id: 'tutorial', name: 'チュートリアル' },
    { id: 'easy', name: 'やさしい' },
    { id: 'normal', name: 'ふつう' },
    { id: 'hard', name: 'むずかしい' }
  ];
  function diffOf(def) { return def && DIFFICULTIES.some(function (d) { return d.id === def.difficulty; }) ? def.difficulty : ''; }

  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function cell(c) { return [c[0], c[1]]; }

  // ---------------------------------------------------------------
  // 盤面 → 定義
  // ---------------------------------------------------------------
  function charOf(R) {
    var inv = {};
    Object.keys(R.CH).forEach(function (c) { if (inv[R.CH[c]] === undefined) inv[R.CH[c]] = c; });
    return inv;
  }
  function toDef(R, s, name) {
    name = String(name || '').trim() || '名前なし';
    var inv = charOf(R), w = s.size, h = R.rowsOf(s), rows = [];
    for (var y = 0; y < h; y++) {
      var r = '';
      for (var x = 0; x < w; x++) r += inv[R.getTile(s, x, y)] || '.';
      rows.push(r);
    }
    // tutorial: やり直し（R.retryStage）・ヒント（R.stageHint）・会話の窓の文を、チュートリアルと同じように使う
    var def = { id: PREFIX + name, name: name, custom: true, tutorial: true, rows: rows, allies: [], enemies: [] };
    if (s.enemyActs === false) def.enemyActs = false;
    s.units.forEach(function (u) {
      if (u.side === 'ally') {
        var a = { facing: u.facing || 'up' };
        if (u.npc) a.npc = true;
        def.allies.push([u.magic, u.x, u.y, a]);
      } else if (u.side === 'enemy') {
        var o = {};
        Object.keys(R.PERSONA).forEach(function (f) { if (u[f] !== undefined) o[f] = u[f]; });
        if (u.hpBase) o.hp = u.hpBase;
        if (u.size > 1) o.size = u.size;
        if (u.body) o.body = u.body;
        def.enemies.push([u.magic, u.x, u.y, o, u.facing || 'down']);
      } else if (u.kind === 'village') (def.villages = def.villages || []).push([u.x, u.y]);
      else if (u.kind === 'wagon') def.wagon = [u.x, u.y];
    });
    var m = s.mission || {};
    if (m.type && m.type !== 'annihilate') def.mission = m.type;
    if (m.goal && m.goal.length) def.goal = m.goal.map(cell);
    if (m.exit && m.exit.length) def.exit = m.exit.map(cell);
    var carrier = m.carrier && R.findUnit(s, m.carrier);
    if (carrier) def.treasure = [carrier.x, carrier.y];
    else if (m.treasure) def.treasure = cell(m.treasure);
    if (s.spawn) def.spawn = clone(s.spawn);
    if (s.ex) def.ex = clone(s.ex);
    if (s.enemyOnlyMagics && s.enemyOnlyMagics.length) def.enemyOnly = s.enemyOnlyMagics.slice();
    if (s.overrides && Object.keys(s.overrides).length) def.overrides = clone(s.overrides);
    return def;
  }

  // ---------------------------------------------------------------
  // 定義 → 盤面（ほかの人のファイルも読むので、先に中身を確かめる）
  // ---------------------------------------------------------------
  function fits(R, s, u, x, y) {
    var n = u.size || 1;
    if (x === undefined) { x = u.x; y = u.y; }
    var over = function (o) {   // o の体と、(x, y) に置いた u の体が重なるか
      var m = o.size || 1;
      return o.x < x + n && x < o.x + m && o.y < y + n && y < o.y + m;
    };
    for (var dy = 0; dy < n; dy++) for (var dx = 0; dx < n; dx++) {
      var cx = x + dx, cy = y + dy;
      if (!R.inBounds(s, cx, cy)) return n > 1 ? '体（' + n + '×' + n + '）が盤からはみ出す' : '盤の外';
      if (!R.isPassable(R.getTile(s, cx, cy))) return '通れないマスには置けない';
    }
    if (s.units.some(function (o) { return o !== u && o.id !== u.id && over(o); })) return 'もうユニットがいる';
    return '';
  }
  function checkDef(R, d) {
    var B = R.BALANCE;
    if (!isObj(d)) return '中身が空';
    if (!Array.isArray(d.rows) || !d.rows.length || d.rows.some(function (r) { return typeof r !== 'string'; })) return '盤面（rows）がない';
    var w = d.rows[0].length, h = d.rows.length;
    if (d.rows.some(function (r) { return r.length !== w; })) return '盤面の行の長さがそろっていない';
    if (w < B.minBoardSize || w > B.maxBoardSize || h < B.minBoardSize || h > B.maxBoardSize) return '盤面の大きさは ' + B.minBoardSize + '〜' + B.maxBoardSize;
    if (d.rows.some(function (r) { return r.split('').some(function (c) { return !R.CH[c]; }); })) return '知らない地形がある';
    var inside = function (c) { return Array.isArray(c) && c.length >= 2 && c[0] >= 0 && c[1] >= 0 && c[0] < w && c[1] < h && c[0] % 1 === 0 && c[1] % 1 === 0; };
    if (!Array.isArray(d.allies) || !Array.isArray(d.enemies)) return '味方と敵（allies・enemies）がない';
    var badUnit = function (u, side) {
      if (!Array.isArray(u) || !R.MAGIC_INFO[u[0]] || !inside([u[1], u[2]])) return true;
      var o = u[3];
      if (o !== undefined && !isObj(o)) return true;
      o = o || {};
      if (o.facing !== undefined && !R.DIRS[o.facing]) return true;
      if (side === 'enemy') {
        if (u[4] !== undefined && !R.DIRS[u[4]]) return true;
        if (Object.keys(R.PERSONA).some(function (f) { return o[f] !== undefined && !R.PERSONA[f][o[f]]; })) return true;
        if (o.hp !== undefined && !(o.hp >= 1 && o.hp <= 999 && o.hp % 1 === 0)) return true;
        if (o.size !== undefined && !(o.size >= 1 && o.size <= 3 && o.size % 1 === 0)) return true;
      }
      return false;
    };
    if (d.allies.some(function (u) { return badUnit(u, 'ally'); })) return '味方の魔法・位置・向きが正しくない';
    if (d.enemies.some(function (u) { return badUnit(u, 'enemy'); })) return '敵の魔法・位置・向き・動き方・HP が正しくない';
    if (d.villages !== undefined && !(Array.isArray(d.villages) && d.villages.every(inside))) return '村の位置が正しくない';
    if (d.wagon !== undefined && !inside(d.wagon)) return 'トロッコの位置が正しくない';
    if ((d.goal && !(Array.isArray(d.goal) && d.goal.every(inside))) || (d.exit && !(Array.isArray(d.exit) && d.exit.every(inside))) || (d.treasure && !inside(d.treasure))) return 'ゴール・帰り口・宝の位置が正しくない';
    if (d.mission !== undefined && !R.MISSION_INFO[d.mission]) return '知らないお題がある';
    if (d.difficulty !== undefined && !diffOf(d)) return '知らない難易度がある';
    if (d.enemyOnly !== undefined && !(Array.isArray(d.enemyOnly) && d.enemyOnly.every(function (m) { return R.MAGIC_INFO[m]; }))) return '敵だけの魔法に知らない魔法がある';
    if (d.overrides !== undefined && !R.validOverrides(d.overrides)) return 'このステージだけの数値（overrides）に知らない項目か、型の違う値がある';
    var locked = Object.keys(d.overrides || {}).filter(function (p) { return STAGE_OVERRIDES.indexOf(p) < 0; });
    if (locked.length) return 'ステージごとに変えられるのは、守るターン数と敵の歩数だけ（魔法の効き方は、どのステージでも同じ。' + locked.join('・') + ' は変えられない）';
    if (d.spawn !== undefined) {
      var sp = d.spawn;
      if (!isObj(sp) || !inside([sp.x, sp.y]) || !R.MAGIC_INFO[sp.magic] || (sp.facing && !R.DIRS[sp.facing]) ||
        Object.keys(R.PERSONA).some(function (f) { return sp[f] !== undefined && !R.PERSONA[f][sp[f]]; })) return '増援（spawn）が正しくない';
    }
    if (d.ex !== undefined) {
      var ex = d.ex;
      if (!isObj(ex) || (ex.spawn !== undefined && !(isObj(ex.spawn) && R.MAGIC_INFO[ex.spawn.magic])) ||
        (ex.missions !== undefined && !(Array.isArray(ex.missions) && ex.missions.every(function (m) { return isObj(m) && m.id && R.TILE_INFO[m.tile]; })))) return 'ボスの決まり（ex）が正しくない';
    }
    return '';
  }
  function build(R, def) {
    var err = checkDef(R, def);
    if (err) return { ok: false, error: err };
    var s;
    try { s = R.buildPreset(def); } catch (e) { return { ok: false, error: '盤面を作れない（' + e.message + '）' }; }
    // 前のステージの「道をふさぐ」の入・切（sealWin の上書き）は捨てる。村を守るはいつも、ふさいだらクリアにできる（オーナー 11/03）
    if (s.overrides && s.overrides[OV_SEAL] !== undefined) { delete s.overrides[OV_SEAL]; if (!Object.keys(s.overrides).length) delete s.overrides; }
    for (var i = 0; i < s.units.length; i++) {
      var bad = fits(R, s, s.units[i]);
      if (bad) return { ok: false, error: R.unitLabel(s, s.units[i]) + ': ' + bad };
    }
    return { ok: true, state: s };
  }

  // ---------------------------------------------------------------
  // エディットの道具（どれも新しい状態を返す）
  // ---------------------------------------------------------------
  // 盤面の横・縦を変える。地形は左上をそろえて切る・足す（足した所は空き）。はみ出した物は外す（外した数を返す）
  function resize(R, s0, w, h) {
    var B = R.BALANCE;
    var clamp = function (n, d) { n = Math.round(Number(n) || d); return Math.max(B.minBoardSize, Math.min(B.maxBoardSize, n)); };
    w = clamp(w, s0.size); h = clamp(h, R.rowsOf(s0));
    var d = toDef(R, s0, 'resize'), dropped = 0;
    var rows = [];
    for (var y = 0; y < h; y++) rows.push(((d.rows[y] || '') + new Array(w + 1).join('.')).slice(0, w));
    d.rows = rows;
    var inside = function (x, y, n) { n = n || 1; return x >= 0 && y >= 0 && x + n <= w && y + n <= h; };
    var keep = function (list, n) { return list.filter(function (u) { var ok = inside(u[1], u[2], n ? n(u) : 1); if (!ok) dropped++; return ok; }); };
    d.allies = keep(d.allies);
    d.enemies = keep(d.enemies, function (u) { return (u[3] && u[3].size) || 1; });
    if (d.villages) { d.villages = d.villages.filter(function (c) { var ok = inside(c[0], c[1]); if (!ok) dropped++; return ok; }); if (!d.villages.length) delete d.villages; }
    if (d.wagon && !inside(d.wagon[0], d.wagon[1])) { delete d.wagon; dropped++; }
    if (d.goal) d.goal = d.goal.filter(function (c) { return inside(c[0], c[1]); });
    if (d.exit) d.exit = d.exit.filter(function (c) { return inside(c[0], c[1]); });
    if (d.treasure && !inside(d.treasure[0], d.treasure[1])) delete d.treasure;
    if (d.spawn && !inside(d.spawn.x, d.spawn.y)) delete d.spawn;
    var s = R.buildPreset(d);
    if (s0.stage) s.stage = s0.stage; else delete s.stage;
    return { state: s, dropped: dropped };
  }

  function turnsOf(R, s) {
    var ov = s.overrides || {};
    return ov[OV_TURNS] !== undefined ? ov[OV_TURNS] : R.BALANCE.mission.defense.turns;
  }
  function winOf(R, s) {
    if (s.ex) return 'boss';
    var t = (s.mission && s.mission.type) || 'annihilate';
    return t;
  }
  // exKeep: ボスの決まりを外したときに覚えておいた中身（③の取り巻きの湧き方・ミッション）。ボスに戻したら使う
  function setWin(R, s0, kind, turns, exKeep) {
    var s = R.clone(s0);
    if (!s.mission) s.mission = { type: 'annihilate', goal: [], exit: [], treasure: null, carrier: null, lost: 0 };
    var ov = s.overrides = s.overrides || {};
    delete ov[OV_TURNS]; delete ov[OV_SEAL];
    if (kind === 'boss') {
      s.ex = s0.ex ? clone(s0.ex) : exKeep ? clone(exKeep) : {};
      s.mission.type = 'annihilate';
    } else {
      delete s.ex;
      if (kind === 'seal') kind = 'defense';   // 前の「道をふさぐ」
      s.mission.type = kind;
      if (kind === 'defense') {
        var n = Math.round(Number(turns) || R.BALANCE.mission.defense.turns);
        ov[OV_TURNS] = Math.max(1, Math.min(30, n));
      }
    }
    if (!Object.keys(ov).length) delete s.overrides;
    return s;
  }

  function setHp(R, s0, id, hp) {
    var u0 = R.findUnit(s0, id);
    if (!u0 || u0.side !== 'enemy') return { ok: false, error: '敵がいない' };
    hp = Math.round(Number(hp));
    if (!(hp >= 1 && hp <= 999)) return { ok: false, error: 'HP は 1〜999' };
    var s = R.clone(s0), u = R.findUnit(s, id);
    if (hp === R.BALANCE.enemy.hp) delete u.hpBase; else u.hpBase = hp;
    u.hp = u.maxHp = hp;
    return { ok: true, state: s };
  }

  // ---------------------------------------------------------------
  // 会話の窓の文（texts.js の stages.<id> と同じ形。開始・クリア・負けは場面 start / win / lose、やり直しのヒントは hint）
  //   文の欄は1行が1つの文。「［一斉だけ］」「［1人ずつだけ］」で始めると、そのターンの形のときだけ出る。「話す人「文」」で話す人
  // ---------------------------------------------------------------
  function blankTexts(name) {
    return { name: name || '', goal: '', hint: { simul: '', single: '' }, win: '', lose: '', scenes: { start: [], win: [], lose: [] } };
  }
  var MODE_TAG = { simul: '［一斉だけ］', single: '［1人ずつだけ］' };
  function linesToText(lines) {
    return (lines || []).map(function (l) {
      return (MODE_TAG[l.mode] || '') + (l.who ? l.who + '「' + l.text + '」' : l.text);
    }).join('\n');
  }
  function textToLines(text) {
    return String(text || '').split(/\r?\n/).map(function (t) { return t.replace(/\s+$/, ''); }).filter(Boolean).map(function (t) {
      var mode = 'both';
      Object.keys(MODE_TAG).forEach(function (m) { if (t.indexOf(MODE_TAG[m]) === 0) { mode = m; t = t.slice(MODE_TAG[m].length); } });
      var m = /^([^「」\s]{1,16})「([\s\S]*)」$/.exec(t);
      return m ? { who: m[1], text: m[2], mode: mode } : { who: '', text: t, mode: mode };
    });
  }

  // ---------------------------------------------------------------
  // 一覧の1行（オーナー 11/03。IMPROVE_ステージ一覧 段2）: 定義から、使う魔法とクリア方法を出す
  // ---------------------------------------------------------------
  // 使う魔法: 味方の魔法を並びの順に（同じ魔法は1つ）。構える味方（指示できない仲間）の魔法には「（仲間）」
  function magicsOf(R, def) {
    var seen = {}, out = [];
    (def && def.allies || []).forEach(function (a) {
      var npc = !!(a[3] && a[3].npc), k = a[0] + (npc ? '*' : '');
      if (seen[k] || !R.MAGIC_INFO[a[0]]) return;
      seen[k] = true;
      out.push(R.MAGIC_INFO[a[0]].name + (npc ? '（仲間）' : ''));
    });
    return out.join('・');
  }
  // クリア方法の区分（オーナー 11/03「戦闘・ボス・防衛・護衛・奪取・破壊などで分けられる」）。一覧の列と、絞る札に使う。
  //   破壊は、その勝ち方ができたらここに足す（今のゲームにはまだない）
  var WIN_KINDS = [
    { id: 'battle', name: '戦闘' },
    { id: 'boss', name: 'ボス' },
    { id: 'defense', name: '防衛' },
    { id: 'escort', name: '護衛' },
    { id: 'retrieve', name: '奪取' }
  ];
  function winKind(def) {
    if (!def) return '';
    if (def.ex) return 'boss';
    if (def.mission === 'defense' || def.mission === 'escort' || def.mission === 'retrieve') return def.mission;
    return 'battle';
  }
  function winLabel(R, def) { var k = winKind(def), w = WIN_KINDS.filter(function (x) { return x.id === k; })[0]; return w ? w.name : ''; }
  // 名前に入っている区分の印（【チュートリアル】など）は、一覧では難易度の札に任せて外す
  function plainTitle(name) { return String(name || '').replace(/^【[^】]*】\s*/, ''); }

  // ---------------------------------------------------------------
  // 自分のステージのゴミ箱（オーナー 11/03。IMPROVE_ステージ一覧 段3）。stages・trash はこのブラウザの入れ物（{ 名前: 中身 }）
  //   消す → ゴミ箱へ（中身はそのまま。消した時刻を足す）。戻す → 同じ名前があれば「名前（2）」。どちらも新しい入れ物を返す
  // ---------------------------------------------------------------
  function freeName(name, taken) {
    if (!taken[name]) return name;
    for (var i = 2; ; i++) { var n = name + '（' + i + '）'; if (!taken[n]) return n; }
  }
  function trashPut(stages, trash, name, now) {
    stages = clone(stages || {}); trash = clone(trash || {});
    if (!stages[name]) return { stages: stages, trash: trash, key: null };
    var key = freeName(name, trash);
    trash[key] = { name: name, rec: stages[name], deletedAt: now || Date.now() };
    delete stages[name];
    return { stages: stages, trash: trash, key: key };
  }
  function trashRestore(stages, trash, key) {
    stages = clone(stages || {}); trash = clone(trash || {});
    var item = trash[key];
    if (!item) return { stages: stages, trash: trash, name: null };
    var name = freeName(item.name || key, stages);
    stages[name] = item.rec;
    delete trash[key];
    return { stages: stages, trash: trash, name: name };
  }

  // ---------------------------------------------------------------
  // ファイル
  // ---------------------------------------------------------------
  function toFile(stage) {
    return JSON.stringify({ format: FORMAT, version: 1, name: stage.name, savedAt: stage.savedAt || '', def: stage.def, texts: stage.texts || blankTexts(stage.name) }, null, 1);
  }
  // 読めたら { ok, name, def, state, texts }。ステージのファイル・定義そのもの（rows のある JSON）・前の「配置」の JSON を読める
  function fromFile(R, text, fallbackName) {
    var d;
    try { d = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { return { ok: false, error: 'JSON として読めない' }; }
    if (!isObj(d)) return { ok: false, error: '中身が空' };
    var name, def, texts = null;
    if (d.format === FORMAT || isObj(d.def)) {
      name = d.name; def = d.def; texts = isObj(d.texts) ? d.texts : null;
    } else if (Array.isArray(d.rows)) {
      name = d.name; def = d;
    } else if (Array.isArray(d.tiles)) {
      var r = R.importLayout(d);
      if (!r.ok) return r;
      name = fallbackName;
      def = toDef(R, r.state, name || '読み込んだ配置');
    } else return { ok: false, error: 'ステージのファイルではない' };
    name = String(name || fallbackName || '読み込んだステージ').trim().replace(/^my:/, '') || '読み込んだステージ';
    var b = build(R, def);
    if (!b.ok) return b;
    if (texts && !(isObj(texts.scenes) || texts.scenes === undefined)) texts = null;
    return { ok: true, name: name, def: def, state: b.state, texts: texts || blankTexts(name) };
  }

  // ファイルから読む（オーナー 11/10「自分の使うブラウザがいい」）: 1つのファイルに、ステージを1つでも、まとめていくつでも入れられる。
  //   読める形: ステージのファイル（toFile）1つ／その並び（配列）／{ format: 'cafilia-stages', stages: [ステージのファイル…] }。
  //   戻り値 { items: [{ name, def, texts }], errors: [{ name, error }] }。読めないものは飛ばして、理由を errors に残す
  var FORMAT_MANY = 'cafilia-stages';
  function fromFiles(R, text) {
    var d;
    try { d = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { return { items: [], errors: [{ name: '', error: 'JSON として読めない' }] }; }
    var list = Array.isArray(d) ? d : isObj(d) && d.format === FORMAT_MANY && Array.isArray(d.stages) ? d.stages : [d];
    var items = [], errors = [];
    list.forEach(function (one, i) {
      var f = fromFile(R, one, '読み込んだステージ');
      if (f.ok) items.push({ name: f.name, def: f.def, texts: f.texts });
      else errors.push({ name: (isObj(one) && one.name) || String(i + 1) + 'つ目', error: f.error });
    });
    return { items: items, errors: errors };
  }
  // 読んだステージを、自分のステージ（{ 名前: 記録 }）に足す。同じ名前があれば「名前（2）」にする（上書きしない）。
  //   ファイルの順に、一覧（新しく直した順）の上から並ぶように、時刻を1ずつずらす
  //   背番号（def.uid。プレイ集の記録が指す番号）: 読んだものは写しなので、新しい背番号（newUid() が作る。なければ付けずに置き、最初に読んだときに付く）
  function addOwn(stages, items, now, newUid) {
    stages = clone(stages || {});
    now = now || Date.now();
    var names = items.map(function (it, i) {
      var name = freeName(it.name, stages);
      var def = clone(it.def);
      def.id = PREFIX + name; def.name = name; def.custom = true; def.tutorial = true;   // エディットで作ったステージと同じ（やり直し・ヒントが効く）
      if (newUid) def.uid = newUid(); else delete def.uid;
      var texts = clone(it.texts) || blankTexts(name);
      texts.name = name;
      stages[name] = { def: def, texts: texts, exKeep: null, base: null, at: now - i };
      return name;
    });
    return { stages: stages, names: names };
  }

  var api = {
    PREFIX: PREFIX, STAGE_OVERRIDES: STAGE_OVERRIDES, fromFiles: fromFiles, addOwn: addOwn, FORMAT_MANY: FORMAT_MANY, WINS: WINS, DIFFICULTIES: DIFFICULTIES, diffOf: diffOf, magicsOf: magicsOf, winLabel: winLabel, winKind: winKind, WIN_KINDS: WIN_KINDS, plainTitle: plainTitle,
    trashPut: trashPut, trashRestore: trashRestore, toDef: toDef, build: build, checkDef: checkDef, fits: fits, resize: resize,
    winOf: winOf, setWin: setWin, turnsOf: turnsOf, setHp: setHp,
    blankTexts: blankTexts, linesToText: linesToText, textToLines: textToLines, toFile: toFile, fromFile: fromFile, clone: clone
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StagesIO = api;
})(this);
