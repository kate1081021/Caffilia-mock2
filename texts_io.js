/*
 * texts_io.js — 画面に出る文章（texts.js）の読み書きの道具（IMPROVE_simul）
 *   画面に依存しない関数だけ（node でテストできる）。画面は texts_ui.js。
 *   ブラウザでは グローバル変数 TextsIO、node では module.exports で読める。
 *
 *   serialize(texts)      … texts.js の中身（ファイルまるごと）を作る
 *   parse(source)         … texts.js の中身から TEXTS を取り出す（読み込み直しの確かめ用）
 *   diff(base, cur)       … 書き換えた所だけ [{ path, before, after }]。文の並び（場面）はまるごと1つ
 *   exportText(changes)   … チャットに貼れるテキスト
 *   stamp(date)           … 保存した日時の形 'YYYY-MM-DD HH:MM:SS'
 */
(function (root) {
  'use strict';

  var HEADER = [
    '/*',
    ' * texts.js — 画面に出る文章（IMPROVE_simul）',
    ' *   チュートリアルとステージの名前・目標・シナリオの文・ヒント・クリアと負けの文、決め手の表示名、',
    ' *   「合体！」などの表示、展示で遊ぶ人が読む操作の案内をここにまとめる。',
    ' *   画面の「文章」パネルで書き換えて「保存」すると、このファイルがまるごと書き直される（手で書き換えてもよい）。',
    ' *',
    ' *   stages.<ステージ>.scenes: きっかけごとの文の並び。キーは',
    ' *     start（ステージの始め）／turn:N（Nターン目の始め）／stance・stance:<魔法>（構えたとき。1人ずつでは撃ったとき）／',
    ' *     beforeFire（発動の前）／finisher・finisher:<決め手の名前>（決め手が起きたとき）／enemyIntent（敵が予告したとき）／',
    ' *     win（クリア）／lose（負け）／retry（やり直し）',
    ' *   1行は { who: 話す人（空でもよい）, text: 文, mode: "both" 両方 | "simul" 一斉だけ | "single" 1人ずつだけ }',
    ' *   決め手の内部の名前（ルールが使うキー）は変えない。finishers に持つのは表示名だけ。',
    ' *   savedAt: 保存した日時（画面に残っている書き換えより新しいかを見る）。手で書き換えたら、ここも今の日時にする',
    ' */'
  ].join('\n');

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function stamp(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function serialize(texts) {
    return HEADER + '\n(function (root) {\n  var TEXTS = ' + JSON.stringify(texts, null, 2).replace(/\n/g, '\n  ') + ';\n\n' +
      '  if (typeof module !== \'undefined\' && module.exports) module.exports = TEXTS;\n' +
      '  else root.TEXTS = TEXTS;\n' +
      '})(this);\n';
  }

  // texts.js の中身から TEXTS を取り出す（関数として動かさずに、JSON の部分だけ読む）
  function parse(source) {
    var m = /var TEXTS = (\{[\s\S]*\});\s*\n\s*if \(typeof module/.exec(String(source));
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch (e) { return null; }
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }

  // 書き換えた所だけ。savedAt は数えない。文の並び（配列）はまるごと1つの変化
  function diff(base, cur, path, out) {
    out = out || [];
    path = path || [];
    if (isObj(base) && isObj(cur)) {
      var keys = Object.keys(base);
      Object.keys(cur).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
      keys.forEach(function (k) {
        if (!path.length && k === 'savedAt') return;
        diff(base[k], cur[k], path.concat([k]), out);
      });
      return out;
    }
    if (!same(base, cur)) out.push({ path: path.join('.'), before: base === undefined ? null : clone(base), after: cur === undefined ? null : clone(cur) });
    return out;
  }

  function lineText(l) {
    var mode = l.mode && l.mode !== 'both' ? '［' + (l.mode === 'simul' ? '一斉だけ' : '1人ずつだけ') + '］' : '';
    return '  - ' + mode + (l.who ? l.who + '「' + l.text + '」' : l.text);
  }
  function valueText(v) {
    if (v === null || v === undefined) return '（なし）';
    if (Array.isArray(v)) return v.length ? '\n' + v.map(function (l) { return isObj(l) ? lineText(l) : '  - ' + JSON.stringify(l); }).join('\n') : '（空）';
    if (isObj(v)) return JSON.stringify(v);
    return String(v) === '' ? '（空）' : String(v);
  }
  function exportText(changes, note) {
    if (!changes.length) return '（書き換えた所はありません）';
    return ['【文章の書き換え】' + (note ? ' ' + note : '') + ' ' + changes.length + 'か所'].concat(changes.map(function (c) {
      return '■ ' + c.path + '\n 前: ' + valueText(c.before) + '\n 後: ' + valueText(c.after);
    })).join('\n');
  }

  var api = { serialize: serialize, parse: parse, diff: diff, exportText: exportText, stamp: stamp, clone: clone, same: same };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TextsIO = api;
})(this);
