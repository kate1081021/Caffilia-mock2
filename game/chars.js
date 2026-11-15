/*
 * chars.js — キャラの登録（オーナー 11/13。.claude/IMPROVE_キャラ.md）
 *   キャラの一覧と「魔法 → キャラ」は、開発モードの「キャラ」の画面でオーナーが登録し、共有の置き場所（KV の chars）に置く。
 *   ここにあるのは、その形と、置き場所にまだないときの最初の中身（DEFAULT）、控え、絵の読み込み。
 *
 *   形: { list: { id: キャラ }, cast: { ally: { 魔法: id }, enemy: { 魔法: id }, enemyDefault: id }, objects: { village: 絵, wagon: 絵 }, at }
 *     objects: 置きもの（村・トロッコ）の盤面の絵（オーナー 11/13）。空なら前の決まった名前の絵か、今の形
 *     キャラ: { name: 名札の名前, color: 名札と仮の絵の色,
 *               faces: { 表情: 絵 }（会話の絵。'normal' がふだんの絵で、いつもある）, battle: 絵（戦闘の立ち絵。空なら faces.normal） }
 *     絵: 'up:<id>'（開発モードから上げた絵。置き場所の img:<id>）か 'game/img/…'（リポジトリの絵）。空（''）は絵なし（色の仮の絵）
 *   会話の行の who は、キャラの id を指す（エディットの欄では名前で書く）。
 *   window.CHARS は、今のキャラの一覧（id → キャラ）。中身を入れ替えても同じ入れ物なので、先に掴んだところ（talk.js など）にも届く。
 */
(function (root) {
  'use strict';
  var DEFAULT = {
    list: {
      charA: { name: 'キャラA', color: '#c2410c', faces: { normal: '' }, battle: '' },
      charB: { name: 'キャラB', color: '#1d4ed8', faces: { normal: '' }, battle: '' },
      enemy: { name: '敵', color: '#b91c1c', faces: { normal: '' }, battle: '' }
    },
    cast: { ally: {}, enemy: {}, enemyDefault: 'enemy' },
    objects: { village: '', wagon: '' }
  };
  var OBJECTS = ['village', 'wagon'];   // 絵を替えられる置きもの（rules.js の OBJECT_INFO の鍵）
  var CACHE_KEY = 'cafilia-mock-chars';
  var IMG_PREFIX = 'cafilia-mock-img-';
  var MAX_CHARS = 50, MAX_FACES = 12, MAX_NAME = 12, MAX_FACE = 12;
  var MAX_IMG = 1500000;   // 1枚の大きさ（data URL の字数）。tools/stage_worker.mjs と同じ

  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function okId(id) { return typeof id === 'string' && /^[A-Za-z0-9_]{1,20}$/.test(id); }
  // 表情の名前: 空白と「」: を含まない 12字まで（エディットの欄の「名前:表情「文」」で読めるように）
  function okFace(f) { return typeof f === 'string' && f.length >= 1 && f.length <= MAX_FACE && !/[\s「」:：]/.test(f); }
  function okImgId(id) { return typeof id === 'string' && /^[a-z0-9]{1,24}$/.test(id); }
  function okRef(r) { return r === '' || (typeof r === 'string' && (/^up:[a-z0-9]{1,24}$/.test(r) || /^game\/img\/[^\s"'<>]{1,80}\.(png|jpe?g|webp|gif)$/i.test(r))); }
  function isHex(v) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v); }
  function okImgData(d) { return typeof d === 'string' && d.length <= MAX_IMG && /^data:image\/(png|webp|jpeg|gif);base64,[A-Za-z0-9+/]+=*$/.test(d); }

  // 形を整える（知らない項目・正しくない値は捨てる）。いつも list と cast を持つ形で返す
  function clean(d) {
    d = isObj(d) ? d : {};
    var out = { list: {}, cast: { ally: {}, enemy: {}, enemyDefault: '' }, objects: {} };
    var ob = isObj(d.objects) ? d.objects : {};
    OBJECTS.forEach(function (k) { out.objects[k] = okRef(ob[k]) ? ob[k] : ''; });
    var src = isObj(d.list) ? d.list : {};
    Object.keys(src).slice(0, MAX_CHARS).forEach(function (id) {
      var c = src[id];
      if (!okId(id) || !isObj(c)) return;
      var faces = { normal: '' };
      if (isObj(c.faces)) Object.keys(c.faces).forEach(function (f) {
        if (!okFace(f) || !okRef(c.faces[f])) return;
        if (faces[f] === undefined && Object.keys(faces).length >= MAX_FACES) return;
        faces[f] = c.faces[f];
      });
      out.list[id] = {
        name: typeof c.name === 'string' && c.name.trim() ? c.name.trim().slice(0, MAX_NAME) : id,
        color: isHex(c.color) ? c.color.toLowerCase() : '#57534e',
        faces: faces,
        battle: okRef(c.battle) ? c.battle : ''
      };
    });
    var cast = isObj(d.cast) ? d.cast : {};
    ['ally', 'enemy'].forEach(function (side) {
      if (isObj(cast[side])) Object.keys(cast[side]).forEach(function (m) {
        var id = cast[side][m];
        if (/^[a-z]{1,20}$/.test(m) && out.list[id]) out.cast[side][m] = id;
      });
    });
    if (out.list[cast.enemyDefault]) out.cast.enemyDefault = cast.enemyDefault;
    if (typeof d.at === 'number') out.at = d.at;
    return out;
  }

  // 今のキャラ（apply で入れ替える）
  var CHARS = {};
  var now = clean(DEFAULT);
  function apply(d) {
    now = clean(d || DEFAULT);
    Object.keys(CHARS).forEach(function (k) { delete CHARS[k]; });
    Object.keys(now.list).forEach(function (k) { CHARS[k] = now.list[k]; });
    return now;
  }
  apply(DEFAULT);

  // 駒 → キャラの id（なければ null）。味方は魔法、敵は魔法 → なければデフォルト敵（ボス・取り巻きも同じ）。置きもの（村・トロッコ）は null
  function castOf(u, d) {
    d = d || now;
    if (!u || u.side === 'object') return null;
    if (u.side === 'ally') return d.cast.ally[u.magic] || null;
    return d.cast.enemy[u.magic] || d.cast.enemyDefault || null;
  }
  // キャラの絵（会話: 表情。なければふだん／戦闘: battle。なければふだん）
  function faceRef(id, face, d) { var c = (d || now).list[id]; return c ? (c.faces[face || 'normal'] || c.faces.normal || '') : ''; }
  function battleRef(id, d) { var c = (d || now).list[id]; return c ? (c.battle || c.faces.normal || '') : ''; }
  function objectRef(kind, d) { return (d || now).objects[kind] || ''; }
  // そのデータが指している上げた絵の id
  function imgIds(d) {
    d = clean(d || now);
    var ids = {};
    Object.keys(d.list).forEach(function (k) {
      var c = d.list[k];
      Object.keys(c.faces).map(function (f) { return c.faces[f]; }).concat([c.battle]).forEach(function (r) { if (/^up:/.test(r)) ids[r.slice(3)] = 1; });
    });
    OBJECTS.forEach(function (k) { var r = d.objects[k]; if (/^up:/.test(r)) ids[r.slice(3)] = 1; });
    return Object.keys(ids);
  }
  // 新しいキャラの id（変わらない。会話の行の who が指す）
  function newId(d) {
    var id;
    do { id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); } while ((d || now).list[id]);
    return id;
  }

  // ---------------------------------------------------------------
  // 控え（このブラウザ）
  // ---------------------------------------------------------------
  function ls() { try { return root.localStorage || null; } catch (e) { return null; } }
  function cacheGet() { var s = ls(); try { var raw = s && s.getItem(CACHE_KEY); return raw ? clean(JSON.parse(raw)) : null; } catch (e) { return null; } }
  function cacheSet(d) { var s = ls(); try { if (s) s.setItem(CACHE_KEY, JSON.stringify(clean(d))); } catch (e) { /* 控えられなくても、このページの間は当たっている */ } }

  // ---------------------------------------------------------------
  // 絵の読み込み（上げた絵）: 置き場所から読んで、このページの間は覚え、このブラウザにも控える。
  //   fetcher(id) → Promise<data URL | null> は画面（ui.js）が渡す（置き場所の場所を知っているのは画面）
  // ---------------------------------------------------------------
  var mem = {}, blobs = {}, waiting = {}, fetcher = null, listeners = [];
  // data URL → このページの中だけの短い URL（blob:）。盤面を描くたびに長い字を HTML に入れないように。作れない所（node）では data URL のまま
  function short(id) {
    if (blobs[id]) return blobs[id];
    var d = mem[id];
    try {
      var m = /^data:([^;]+);base64,(.*)$/.exec(d), bin = root.atob(m[2]), buf = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      blobs[id] = root.URL.createObjectURL(new root.Blob([buf], { type: m[1] }));
    } catch (e) { blobs[id] = d; }
    return blobs[id];
  }
  function setFetcher(fn) { fetcher = fn; }
  function onImg(fn) { listeners.push(fn); }
  function remember(id, data) {
    if (!okImgData(data)) return;
    mem[id] = data;
    var s = ls();
    try { if (s) s.setItem(IMG_PREFIX + id, data); } catch (e) { /* 入りきらなければ控えない */ }
  }
  function load(id) {
    if (mem[id] || waiting[id]) return;
    var s = ls(), cached = null;
    try { cached = s && s.getItem(IMG_PREFIX + id); } catch (e) { cached = null; }
    if (okImgData(cached)) { mem[id] = cached; return; }
    if (!fetcher) return;
    waiting[id] = true;
    fetcher(id).then(function (data) {
      delete waiting[id];
      if (data) { remember(id, data); listeners.forEach(function (fn) { fn(id); }); }
    }, function () { delete waiting[id]; });
  }
  // 絵 → 画面で使える URL。上げた絵でまだ読めていなければ null（読み終えたら onImg の fn が呼ばれる）
  function url(ref) {
    if (!ref) return null;
    if (/^up:/.test(ref)) { var id = ref.slice(3); if (!mem[id]) load(id); return mem[id] ? short(id) : null; }
    return ref;
  }
  function preload(d) { imgIds(d).forEach(load); }
  // 指していない絵の控えを消す（このブラウザの入れ物を空ける）
  function pruneCache(d) {
    var s = ls();
    if (!s) return;
    var keep = {};
    imgIds(d).forEach(function (id) { keep[id] = 1; });
    try {
      var del = [];
      for (var i = 0; i < s.length; i++) { var k = s.key(i); if (k && k.indexOf(IMG_PREFIX) === 0 && !keep[k.slice(IMG_PREFIX.length)]) del.push(k); }
      del.forEach(function (k) { s.removeItem(k); });
    } catch (e) { /* 何もしない */ }
  }

  var api = {
    DEFAULT: DEFAULT, CHARS: CHARS, OBJECTS: OBJECTS, objectRef: objectRef, CACHE_KEY: CACHE_KEY, IMG_PREFIX: IMG_PREFIX,
    MAX_CHARS: MAX_CHARS, MAX_FACES: MAX_FACES, MAX_NAME: MAX_NAME, MAX_FACE: MAX_FACE, MAX_IMG: MAX_IMG,
    clean: clean, clone: clone, apply: apply, now: function () { return now; },
    okId: okId, okFace: okFace, okRef: okRef, okImgId: okImgId, okImgData: okImgData,
    castOf: castOf, faceRef: faceRef, battleRef: battleRef, imgIds: imgIds, newId: newId,
    cacheGet: cacheGet, cacheSet: cacheSet,
    setFetcher: setFetcher, onImg: onImg, remember: remember, url: url, preload: preload, pruneCache: pruneCache
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.CafiliaChars = api;
    root.CHARS = CHARS;
    // 開いたらすぐ、控えのキャラを当てる（置き場所から読んだら ui.js が当て直す）
    var c = cacheGet();
    if (c) apply(c);
  }
})(typeof window !== 'undefined' ? window : globalThis);
