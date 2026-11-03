/*
 * settings.js — 設定: 画面の主な色と、名前（自然・マップの字・魔法・シナジー）を変える（オーナー 11/03。.claude/IMPROVE_設定.md）
 *   設定は共有の置き場所（Cloudflare の KV の settings。tools/stage_worker.mjs）に置き、展示モードもその設定で出す。
 *   このブラウザにも写し（CACHE_KEY）を覚えて、開いたらすぐ（つながる前に）その色で出す。つながらないときは写しか、元の色と名前。
 *   形: { colors: { '--bg': '#rrggbb', … }, tiles: { forest: { name, label } }, magics: { grass: '草' }, synergies: { 燃え広がり: '…' }, at }
 *     どれも元と違うものだけを持つ（空なら元のまま）。ルールが見分けに使う名前は変えない。画面に出す名前だけを変える。
 *   game/mode.js のすぐあとに読む（色を早く当てて、元の色が一瞬見えないように）。名前は ui.js が rules.js を読んでから当てる。
 */
(function (root) {
  'use strict';
  // 変えられる色（メインのところ。自然一つ一つの色は入れない。オーナー「一旦いい」11/03）。def は style.css の :root と同じ
  var COLORS = [
    { key: '--bg', name: '背景', note: '画面のいちばん後ろ', def: '#f4f1ea' },
    { key: '--panel', name: 'パネル', note: '枠の中・上のバー', def: '#fffdf8' },
    { key: '--line', name: '枠線', note: 'パネルやボタンのふち', def: '#ddd5c6' },
    { key: '--ink', name: '文字', note: 'ふつうの文字', def: '#2a2620' },
    { key: '--muted', name: 'うすい文字', note: '説明・補足の文字', def: '#7a7266' },
    { key: '--accent', name: '大事なボタン', note: '発動・新しく作る など', def: '#c2410c' },
    { key: '--button-bg', name: 'ボタンの地', note: 'ふつうのボタンの中', def: '#ffffff' },
    { key: '--board-frame', name: '盤面の枠', note: 'マスのすきまと外枠', def: '#cfc5b2' },
    { key: '--ally', name: '味方', note: '味方の駒・印', def: '#1d4ed8' },
    { key: '--enemy', name: '敵', note: '敵の駒', def: '#b91c1c' },
    { key: '--enemy-fc', name: '敵の予告', note: '紫の印', def: '#7c3aed' },
    { key: '--gold', name: '光る印', note: '選んでいる・今の状態', def: '#f5c518' }
  ];
  var CACHE_KEY = 'cafilia-mock-settings';
  var MAX_NAME = 12;   // 名前の長さ
  var MAX_LABEL = 3;   // マップに出る字の長さ

  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function isHex(v) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v); }
  function str(v, max) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
  function colorDef(key) { var c = COLORS.filter(function (x) { return x.key === key; })[0]; return c ? c.def : null; }

  // 設定の形を整える（知らない項目・正しくない値・元と同じ色・空の名前は捨てる）。いつも4つの入れ物を持つ形で返す
  function clean(s) {
    s = isObj(s) ? s : {};
    var out = { colors: {}, tiles: {}, magics: {}, synergies: {} };
    if (isObj(s.colors)) Object.keys(s.colors).forEach(function (k) {
      var v = s.colors[k], d = colorDef(k);
      if (d && isHex(v) && v.toLowerCase() !== d) out.colors[k] = v.toLowerCase();
    });
    if (isObj(s.tiles)) Object.keys(s.tiles).forEach(function (k) {
      var v = s.tiles[k];
      if (!/^[a-z]{1,20}$/.test(k) || !isObj(v)) return;
      var name = str(v.name, MAX_NAME), label = str(v.label, MAX_LABEL), o = {};
      if (name) o.name = name;
      if (label) o.label = label;
      if (name || label) out.tiles[k] = o;
    });
    if (isObj(s.magics)) Object.keys(s.magics).forEach(function (k) {
      var v = str(s.magics[k], MAX_NAME);
      if (/^[a-z]{1,20}$/.test(k) && v) out.magics[k] = v;
    });
    if (isObj(s.synergies)) Object.keys(s.synergies).forEach(function (k) {
      var v = str(s.synergies[k], MAX_NAME);
      if (k && k.length <= 20 && v) out.synergies[k] = v;
    });
    if (typeof s.at === 'number') out.at = s.at;
    return out;
  }
  function isEmpty(s) {
    s = clean(s);
    return !Object.keys(s.colors).length && !Object.keys(s.tiles).length && !Object.keys(s.magics).length && !Object.keys(s.synergies).length;
  }
  // 色 ⇄ RGB（0〜255 の3つの数）
  function rgbOf(hex) { return isHex(hex) ? [1, 3, 5].map(function (i) { return parseInt(hex.slice(i, i + 2), 16); }) : [0, 0, 0]; }
  function hexOf(rgb) {
    return '#' + rgb.map(function (n) { n = Math.max(0, Math.min(255, Math.round(Number(n) || 0))); return (n < 16 ? '0' : '') + n.toString(16); }).join('');
  }

  // 色を当てる（設定にない色は、style.css の元の色に戻す）
  function applyColors(doc, s) {
    if (!doc || !doc.documentElement) return;
    s = clean(s);
    var st = doc.documentElement.style;
    COLORS.forEach(function (c) {
      if (s.colors[c.key]) st.setProperty(c.key, s.colors[c.key]);
      else st.removeProperty(c.key);
    });
  }

  // 名前を当てる。R: rules.js（TILE_INFO・MAGIC_INFO）、T: texts.js（finishers）。最初に元の名前を覚え、設定にないものは元に戻す
  var orig = null;
  function originals(R, T) {
    if (orig) return orig;
    orig = { tiles: {}, magics: {}, synergies: {} };
    Object.keys(R.TILE_INFO).forEach(function (k) { orig.tiles[k] = { name: R.TILE_INFO[k].name, label: R.TILE_INFO[k].label }; });
    Object.keys(R.MAGIC_INFO).forEach(function (k) { orig.magics[k] = R.MAGIC_INFO[k].name; });
    var f = (T && T.finishers) || {};
    Object.keys(f).forEach(function (k) { orig.synergies[k] = f[k]; });
    return orig;
  }
  function applyNames(R, T, s) {
    var o = originals(R, T);
    s = clean(s);
    Object.keys(o.tiles).forEach(function (k) {
      var v = s.tiles[k] || {};
      R.TILE_INFO[k].name = v.name || o.tiles[k].name;
      R.TILE_INFO[k].label = v.label || o.tiles[k].label;
    });
    Object.keys(o.magics).forEach(function (k) { R.MAGIC_INFO[k].name = s.magics[k] || o.magics[k]; });
    if (T) {
      T.finishers = T.finishers || {};
      Object.keys(o.synergies).forEach(function (k) { T.finishers[k] = s.synergies[k] || o.synergies[k]; });
    }
  }

  // このブラウザの写し（読めない・書けない環境では何もしない）
  function cacheGet() { try { var raw = root.localStorage.getItem(CACHE_KEY); return raw ? clean(JSON.parse(raw)) : null; } catch (e) { return null; } }
  function cacheSet(s) {
    try {
      if (!s || isEmpty(s)) root.localStorage.removeItem(CACHE_KEY);
      else root.localStorage.setItem(CACHE_KEY, JSON.stringify(clean(s)));
    } catch (e) { /* 覚えられなくても、このページの間は当たっている */ }
  }

  var api = {
    COLORS: COLORS, MAX_NAME: MAX_NAME, MAX_LABEL: MAX_LABEL, CACHE_KEY: CACHE_KEY,
    clean: clean, isEmpty: isEmpty, rgbOf: rgbOf, hexOf: hexOf, colorDef: colorDef,
    applyColors: applyColors, applyNames: applyNames, originals: function (R, T) { return originals(R, T); },
    cacheGet: cacheGet, cacheSet: cacheSet
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CafiliaSettings = api;
  // 開いたらすぐ、覚えている色を当てる（名前は ui.js が当てる）
  if (root.document) applyColors(root.document, cacheGet());
})(typeof window !== 'undefined' ? window : globalThis);
