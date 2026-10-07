/*
 * tune.js — 調整パネルの中身（IMPROVE_publish）
 *   balance.js の初期値 ＋ 遊ぶ人が変えた分 を重ねて使う。balance.js のファイル自体は書き換えない。
 *   ここは画面に依存しない関数だけ（node でテストできる）。画面は tune_ui.js。
 *
 *   ブラウザでは balance.js の直後に読み込む。初期値を写し取り、
 *   共有リンク（#tune=…）か localStorage の設定があれば、ui.js が始まる前に BALANCE へ重ねる。
 */
(function (root) {
  'use strict';

  // 調整パネルに出さない項目（盤面サイズはエディットで変える）
  var SKIP = ['boardSize', 'minBoardSize', 'maxBoardSize'];

  // よく触る項目（パネルの一番上にまとめる）【仮】
  var FAVORITES = [
    'grow.enabled', 'grow.mountainSize', 'grow.mountainSlope', 'grow.pushOut', 'grow.forestSize',
    'ally.hp', 'ally.move', 'ally.power',
    'enemy.hp', 'enemy.move', 'enemy.power',
    'fire.strongDamage', 'fire.weakDamage', 'fire.burnDamage', 'fire.burnTurns', 'fire.burnOutTurns', 'fireTileDamage',
    'shock.base', 'eruption.base', 'sentakuki.damage', 'fireTornado.damage', 'haunt.damage', 'funka.base',
    'mission.village.hp', 'mission.wagon.hp', 'mission.defense.turns', 'mission.defense.loseAt'
  ];

  // まとまり（上の階層）の見出し
  var GROUPS = {
    _fav: 'よく触る', _top: 'そのほか',
    ally: '味方', enemy: '敵', mission: 'お題', fire: '炎', spread: '燃え広がり', shock: '感電',
    funka: '噴火', fireTornado: '火炎竜巻', sentakuki: 'センタクキ', dark: '闇', haunt: 'オバケヤシキ',
    sakura: '桜', eruption: '桜吹雪', ideas: '小さなシナジー（入／切）', grow: '育つ（二段階）', fx: '見せ方'
  };

  // 項目の日本語ラベル。ここにない項目は元の名前をそのまま出す
  var LABELS = {
    'ally.hp': '味方のHP', 'ally.move': '味方の移動', 'ally.power': '味方の威力（直撃）', 'ally.count': '味方の人数の上限',
    'enemy.hp': '敵のHP', 'enemy.move': '敵の移動', 'enemy.power': '敵の威力（直撃）', 'enemy.maxCount': '敵の数の上限',
    'mission.village.hp': '村のHP', 'mission.wagon.hp': '馬車のHP',
    'mission.defense.turns': '防衛: 守るターン数', 'mission.defense.loseAt': '防衛: 負けになる村の壊れ数',
    'fireTileDamage': '炎の上にいる者へのダメージ（ターン終了）',
    'fire.strongDamage': '強い炎のダメージ（燃えた森の上）', 'fire.weakDamage': '弱い炎のダメージ',
    'fire.burnDamage': '火傷: ターン終了ごとのダメージ', 'fire.burnTurns': '火傷: 治るまでのターン数',
    'fire.burnOutTurns': '炎が燃え尽きるまでのターン数',
    'lineLength': '風（元の形）の長さ', 'breezeLength': '風（標準の形）の長さ', 'waterLength': '水の池の長さ',
    'stepDelayMs': '演出の間隔（ミリ秒）',
    'spread.maxLength': '燃え広がりの長さ（最大）',
    'shock.base': '感電のダメージ', 'shock.perWater': '感電: 水1マスごとの追加',
    'funka.lava': '噴火で溶岩があふれる', 'funka.base': '噴火のダメージ', 'funka.perMountain': '噴火: 山1つごとの追加', 'funka.reach': '溶岩が流れ出すマス数',
    'fireTornado.damage': '火炎竜巻のダメージ', 'sentakuki.damage': 'センタクキのダメージ',
    'dark.pullRange': '闇が引き寄せる範囲',
    'haunt.pullRange': 'オバケヤシキが引き寄せる範囲', 'haunt.damage': 'オバケヤシキのダメージ',
    'grow.enabled': '育つ（1回目は小さく、同じ魔法をもう1回で育つ）',
    'grow.mountainSize': '育つ: 山の大きさ（1・4・5・9マス）',
    'grow.mountainSlope': '育つ: 山のまわりは丘（グラデーション）',
    'grow.pushOut': '育つ: 盛り上がる山が押し出す',
    'grow.forestSize': '育つ: 森の大きさ（1・4・5・9マス）',
    'fx.grow': '育つ瞬間を波で見せる',
    'eruption.depth': '桜吹雪の奥行き（段）', 'eruption.base': '桜吹雪のダメージ', 'eruption.perVolcano': '桜吹雪: 火山1つごとの追加',
    'ideas.iceSlide': '氷の上は滑る', 'ideas.wetlandForest': '水辺の森はよく育つ', 'ideas.earthSmother': '土をかぶせて火を消す',
    'ideas.windClearsMirage': '風で蜃気楼が晴れる', 'ideas.spreadMeltsIce': '燃え広がりは氷を溶かす'
  };

  var PREFIX = 'CAFFILIA-TUNE:';

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function getPath(obj, path) {
    var parts = path.split('.');
    for (var i = 0; i < parts.length; i++) {
      if (obj == null || typeof obj !== 'object') return undefined;
      obj = obj[parts[i]];
    }
    return obj;
  }
  function setPath(obj, path, v) {
    var parts = path.split('.');
    for (var i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
    obj[parts[parts.length - 1]] = v;
  }

  // 数値と true/false の項目を全部、並べる順に拾う（配列・文字列は拾わない）
  function items(defaults) {
    var out = [];
    (function walk(o, prefix) {
      Object.keys(o).forEach(function (k) {
        var path = prefix ? prefix + '.' + k : k;
        var v = o[k];
        if (!prefix && SKIP.indexOf(k) !== -1) return;
        if (typeof v === 'number' || typeof v === 'boolean') {
          out.push({ path: path, type: typeof v, def: v, label: LABELS[path] || path, group: prefix ? path.split('.')[0] : '_top' });
        } else if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, path);
      });
    })(defaults, '');
    return out;
  }

  // まとまりごとに分ける。よく触る項目は一番上にまとめ、元のまとまりからは外す
  function groups(defaults) {
    var all = items(defaults);
    var byPath = {};
    all.forEach(function (it) { byPath[it.path] = it; });
    var fav = FAVORITES.filter(function (p) { return byPath[p]; }).map(function (p) { return byPath[p]; });
    var out = [{ id: '_fav', title: GROUPS._fav, items: fav }];
    var seen = {};
    all.forEach(function (it) {
      if (FAVORITES.indexOf(it.path) !== -1) return;
      if (!seen[it.group]) { seen[it.group] = { id: it.group, title: GROUPS[it.group] || it.group, items: [] }; out.push(seen[it.group]); }
      seen[it.group].items.push(it);
    });
    // 「そのほか」は最後に
    out.sort(function (a, b) { return (a.id === '_top') - (b.id === '_top'); });
    return out.filter(function (g) { return g.items.length; });
  }

  // 変えた分 { 'ally.hp': 5, … } のうち、今の初期値にある項目（型も同じ）だけを残す
  function sanitize(defaults, overrides) {
    var known = {};
    items(defaults).forEach(function (it) { known[it.path] = it; });
    var ok = {}, ignored = [];
    Object.keys(overrides || {}).forEach(function (p) {
      var it = known[p], v = overrides[p];
      if (!it || typeof v !== it.type || (it.type === 'number' && !isFinite(v))) { ignored.push(p); return; }
      if (v !== it.def) ok[p] = v;
    });
    return { overrides: ok, ignored: ignored };
  }

  // 初期値に変えた分を重ねた設定を返す（defaults は変えない）
  function overlay(defaults, overrides) {
    var out = clone(defaults);
    var s = sanitize(defaults, overrides);
    Object.keys(s.overrides).forEach(function (p) { setPath(out, p, s.overrides[p]); });
    return out;
  }

  // 設定の本体（BALANCE）に重ねる。調整できる項目は一度初期値に戻してから重ねる（文字列などは触らない）
  function applyTo(target, defaults, overrides) {
    var s = sanitize(defaults, overrides);
    items(defaults).forEach(function (it) {
      setPath(target, it.path, Object.prototype.hasOwnProperty.call(s.overrides, it.path) ? s.overrides[it.path] : it.def);
    });
    return s;
  }

  // 初期値から変えた項目だけを取り出す
  function diff(defaults, current) {
    var out = {};
    items(defaults).forEach(function (it) {
      var v = getPath(current, it.path);
      if (v !== undefined && v !== it.def) out[it.path] = v;
    });
    return out;
  }

  // 変えた分 ⇔ 短い文字列（共有リンクと書き出しの最後の1行に使う）
  function b64encode(str) {
    if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
    return btoa(unescape(encodeURIComponent(str)));
  }
  function b64decode(str) {
    if (typeof Buffer !== 'undefined') return Buffer.from(str, 'base64').toString('utf8');
    return decodeURIComponent(escape(atob(str)));
  }
  function encode(overrides) {
    return b64encode(JSON.stringify(overrides || {})).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(code) {
    try {
      var s = String(code).trim().replace(/-/g, '+').replace(/_/g, '/');
      while (s.length % 4) s += '=';
      var o = JSON.parse(b64decode(s));
      return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
    } catch (e) { return null; }
  }

  // 共有リンク: 今の版のURLの後ろに #tune=… を付ける
  function linkFor(baseUrl, overrides) {
    return String(baseUrl).split('#')[0] + '#tune=' + encode(overrides);
  }
  function fromHash(hash) {
    var m = /[#&]tune=([A-Za-z0-9_-]*)/.exec(hash || '');
    return m ? decode(m[1]) : null;
  }

  function fmt(v) { return typeof v === 'boolean' ? (v ? '入' : '切') : String(v); }

  // 書き出すテキスト（チャットに貼って人が読める形。最後の1行が読み込み用）
  function exportText(info, defaults) {
    var ov = sanitize(defaults, info.overrides).overrides;
    var all = {};
    items(defaults).forEach(function (it) { all[it.path] = it; });
    var keys = Object.keys(ov);
    var lines = ['【Caffilia 調整した設定】', '版: ' + (info.version || '手元'), 'シナリオ: ' + (info.scenario || '標準')];
    if (!keys.length) lines.push('変えた項目: なし（初期値のまま）');
    else {
      lines.push('変えた項目（' + keys.length + '）:');
      keys.forEach(function (p) { lines.push('・' + all[p].label + '（' + p + '）: ' + fmt(all[p].def) + ' → ' + fmt(ov[p])); });
    }
    var c = String(info.comment || '').trim();
    lines.push('ひとこと: ' + (c ? c.replace(/\s*\n\s*/g, ' / ') : '（なし）'));
    lines.push(PREFIX + encode(ov));
    return lines.join('\n');
  }

  // 貼られたテキストから変えた分を取り出す（書き出したテキスト・共有リンク・読み込み用の1行のどれでもよい）
  function parseText(text) {
    var t = String(text || '');
    var m = new RegExp(PREFIX.replace(/[-]/g, '\\-') + '\\s*([A-Za-z0-9_-]*)').exec(t);
    if (m) return decode(m[1]);
    var h = fromHash(t);
    if (h) return h;
    return null;
  }

  var Tune = {
    SKIP: SKIP, FAVORITES: FAVORITES, LABELS: LABELS, GROUPS: GROUPS, PREFIX: PREFIX,
    clone: clone, getPath: getPath, items: items, groups: groups, sanitize: sanitize, overlay: overlay,
    applyTo: applyTo, diff: diff, encode: encode, decode: decode, linkFor: linkFor, fromHash: fromHash,
    exportText: exportText, parseText: parseText, fmt: fmt
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Tune;
    return;
  }

  // ---- ブラウザ: ui.js が始まる前に、初期値を写し取って設定を重ねる ----
  var STORE = 'caffilia-tune-v1';
  Tune.STORE = STORE;
  Tune.defaults = clone(root.BALANCE);
  Tune.source = 'none';      // 'none' 初期値 / 'local' 保存した設定 / 'link' 共有リンクの設定
  Tune.ignored = [];
  var fromLink = fromHash(root.location && root.location.hash);
  var start = null;
  if (fromLink) { start = fromLink; Tune.source = 'link'; }
  else {
    try {
      var raw = root.localStorage.getItem(STORE);
      if (raw) { start = JSON.parse(raw); Tune.source = 'local'; }
    } catch (e) { start = null; }
  }
  if (start) {
    var s = applyTo(root.BALANCE, Tune.defaults, start);
    Tune.ignored = s.ignored;
    if (Tune.source === 'local' && !Object.keys(s.overrides).length) Tune.source = 'none';
  }
  root.Tune = Tune;
})(this);
