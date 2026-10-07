/*
 * tune_ui.js — 調整パネル・版の表示・遊び方（IMPROVE_publish）
 * 変換やまとめの処理は tune.js（Tune）。ここは画面だけ。ui.js のあとに読み込む。
 */
(function () {
  'use strict';

  var T = window.Tune;
  var B = window.BALANCE;
  var app = window.CafiliaApp;
  var DEF = T.defaults;
  var HOWTO_KEY = 'caffilia-howto-seen';

  var $ = function (id) { return document.getElementById(id); };
  var el = {};
  ['btnTune', 'btnHowto', 'tuneBar', 'tunePanel', 'tuneClose', 'tuneApply', 'tuneResetAll', 'tuneNote', 'tuneList',
    'tuneComment', 'tuneExport', 'tuneLink', 'tuneOut', 'tuneIn', 'tuneImport', 'tuneSave',
    'howto', 'howtoClose', 'versionTag', 'worldSelect'].forEach(function (id) { el[id] = $(id); });

  function esc(t) {
    return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function store(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  // ---- 版の表示 ----
  var V = window.CAFFILIA_VERSION;
  var versionName = V ? V.name : '手元';
  el.versionTag.textContent = '版 ' + versionName;
  if (V) el.versionTag.title = '公開: ' + V.publishedAt;

  // ---- パネルの中身 ----
  var GROUPS = T.groups(DEF);
  var applied = T.diff(DEF, B);        // 今の BALANCE に入っている変えた分
  var draft = T.clone(applied);        // パネルで編集中の分（反映するまで BALANCE は変えない）

  function draftValue(it) { return Object.prototype.hasOwnProperty.call(draft, it.path) ? draft[it.path] : it.def; }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function sortedKeys(o) { var r = {}; Object.keys(o).sort().forEach(function (k) { r[k] = o[k]; }); return r; }

  function buildList() {
    el.tuneList.innerHTML = GROUPS.map(function (g, gi) {
      return '<details class="tune-group"' + (gi === 0 ? ' open' : '') + '><summary>' + esc(g.title) + ' <small>' + g.items.length + '</small></summary>' +
        g.items.map(function (it) {
          var input = it.type === 'boolean'
            ? '<input type="checkbox" data-path="' + it.path + '">'
            : '<input type="number" step="1" data-path="' + it.path + '">';
          return '<div class="tune-item" data-row="' + it.path + '">' +
            '<label><span class="tune-label" title="' + esc(it.path) + '">' + esc(it.label) + '</span>' + input + '</label>' +
            '<span class="tune-def"></span>' +
            '<button type="button" class="tune-undo" data-undo="' + it.path + '" title="初期値に戻す" aria-label="初期値に戻す">↺</button>' +
            '</div>';
        }).join('') + '</details>';
    }).join('');
  }

  function refresh() {
    GROUPS.forEach(function (g) {
      g.items.forEach(function (it) {
        var row = el.tuneList.querySelector('[data-row="' + it.path + '"]');
        var input = row.querySelector('input');
        var v = draftValue(it);
        if (it.type === 'boolean') input.checked = v;
        else if (document.activeElement !== input) input.value = v;
        var changed = v !== it.def;
        row.classList.toggle('changed', changed);
        row.querySelector('.tune-def').textContent = changed ? '初期値 ' + T.fmt(it.def) : '';
        row.querySelector('.tune-undo').hidden = !changed;
      });
    });
    var pending = !same(sortedKeys(draft), sortedKeys(applied));
    el.tuneApply.classList.toggle('pending', pending);
    el.tuneApply.textContent = pending ? '反映してやり直す（未反映あり）' : '反映してやり直す';
    el.tuneSave.hidden = T.source !== 'link';
    renderBar();
  }

  function note(text) { el.tuneNote.textContent = text || ''; }

  function renderBar() {
    var n = Object.keys(applied).length;
    var parts = [];
    if (T.source === 'link') parts.push('リンクの設定で遊んでいます（' + n + '項目）');
    else if (n) parts.push('調整した設定で遊んでいます（' + n + '項目）');
    if (T.ignored.length) parts.push('この版にない項目は無視しました: ' + T.ignored.join(', '));
    el.tuneBar.hidden = !parts.length;
    el.tuneBar.innerHTML = parts.map(function (p) { return '<span>' + esc(p) + '</span>'; }).join('') +
      (parts.length ? ' <button type="button" id="tuneBarOpen">調整を開く</button>' : '');
  }

  el.tuneList.addEventListener('input', function (e) {
    var p = e.target.getAttribute('data-path');
    if (!p) return;
    var it = T.items(DEF).filter(function (x) { return x.path === p; })[0];
    var v;
    if (it.type === 'boolean') v = e.target.checked;
    else {
      if (e.target.value === '' || !isFinite(Number(e.target.value))) return;
      v = Number(e.target.value);
    }
    if (v === it.def) delete draft[p]; else draft[p] = v;
    refresh();
  });
  el.tuneList.addEventListener('change', function (e) {
    // 数の欄を空にして離れたら、元の値に戻して見せる
    if (e.target.type === 'number' && e.target.value === '') { e.target.value = ''; refresh(); }
  });
  el.tuneList.addEventListener('click', function (e) {
    var p = e.target.getAttribute && e.target.getAttribute('data-undo');
    if (!p) return;
    delete draft[p];
    var input = el.tuneList.querySelector('input[data-path="' + p + '"]');
    if (input) input.blur();
    refresh();
  });

  function apply() {
    var s = T.applyTo(B, DEF, draft);
    applied = T.clone(s.overrides);
    draft = T.clone(applied);
    if (T.source !== 'link') {
      store(T.STORE, Object.keys(applied).length ? JSON.stringify(applied) : null);
      T.source = Object.keys(applied).length ? 'local' : 'none';
    }
    app.restart();
    if (el.worldSelect) el.worldSelect.value = currentWorld();
    note('反映して、シナリオ「' + app.scenarioName() + '」を最初からやり直しました。' + (T.source === 'link' ? '（リンクの設定なので、この端末には保存していません）' : ''));
    refresh();
  }
  el.tuneApply.addEventListener('click', apply);

  // 【縮尺】見本: 選ぶと調整パネルの値を見本の値にして反映し、その大きさの広場を最初から始める（ほかの変えた分はそのまま）
  function currentWorld() {
    var w = T.WORLDS.filter(function (w) { return Object.keys(w.set).every(function (k) { return same(T.getPath(B, k), w.set[k]); }); })[0];
    return w ? w.id : '';
  }
  el.worldSelect.innerHTML = '<option value="">（見本を選ぶ）</option>' + T.WORLDS.map(function (w) { return '<option value="' + w.id + '">' + esc(w.name) + '</option>'; }).join('');
  el.worldSelect.value = currentWorld();
  el.worldSelect.addEventListener('change', function () {
    var w = T.WORLDS.filter(function (x) { return x.id === el.worldSelect.value; })[0];
    el.worldSelect.blur();
    if (!w) return;
    draft = T.clone(applied);
    Object.keys(w.set).forEach(function (k) { draft[k] = w.set[k]; });
    app.setScenario('plaza');
    apply();
    note('見本「' + w.name + '」にして、広場を最初から始めました。調整パネルでさらに変えられます。');
  });
  el.tuneResetAll.addEventListener('click', function () {
    draft = {};
    note('全部を初期値にしました。「反映してやり直す」で遊びに反映します。');
    refresh();
  });
  el.tuneSave.addEventListener('click', function () {
    if (!store(T.STORE, Object.keys(applied).length ? JSON.stringify(applied) : null)) { note('この環境では保存できません。'); return; }
    T.source = Object.keys(applied).length ? 'local' : 'none';
    try { history.replaceState(null, '', location.href.split('#')[0]); } catch (e) { /* file:// などでは使えないことがある */ }
    note('この設定を保存しました。次に開いたときも、この設定で始まります。');
    refresh();
  });

  // ---- 送る ----
  function showOut(text, label) {
    el.tuneOut.hidden = false;
    el.tuneOut.value = text;
    el.tuneOut.focus();
    el.tuneOut.select();
    var done = function () { note(label + 'をコピーしました。チャットなどにそのまま貼ってください。'); };
    var manual = function () { note('自動でコピーできませんでした。下の欄が選択されているので、Ctrl+C でコピーしてください。'); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, manual);
    else {
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      if (ok) done(); else manual();
    }
  }
  function unappliedWarn() {
    return same(sortedKeys(draft), sortedKeys(applied)) ? '' : '（まだ反映していない変更は入っていません）';
  }
  el.tuneExport.addEventListener('click', function () {
    var text = T.exportText({ version: versionName, scenario: app.scenarioName(), overrides: applied, comment: el.tuneComment.value }, DEF);
    showOut(text, '設定のテキスト');
    var w = unappliedWarn();
    if (w) note(el.tuneNote.textContent + w);
  });
  el.tuneLink.addEventListener('click', function () {
    if (location.protocol === 'file:') {
      showOut(T.linkFor(location.href, applied), 'リンク');
      note('手元のファイルなので、このリンクは自分のPCでしか開けません。人に送るときは「設定を書き出す」を使ってください。');
      return;
    }
    showOut(T.linkFor(location.href, applied), 'リンク');
    var w = unappliedWarn();
    if (w) note(el.tuneNote.textContent + w);
  });

  // ---- 受け取る ----
  el.tuneImport.addEventListener('click', function () {
    var o = T.parseText(el.tuneIn.value);
    if (!o) { note('読み込めませんでした。書き出したテキストを、最後の行（' + T.PREFIX + '…）までまるごと貼ってください。'); return; }
    var s = T.sanitize(DEF, o);
    draft = s.overrides;
    T.ignored = s.ignored;
    note(Object.keys(draft).length + '項目を読み込みました。「反映してやり直す」で遊びに反映します。' +
      (s.ignored.length ? ' この版にない項目は無視しました: ' + s.ignored.join(', ') : ''));
    refresh();
  });

  // ---- 開閉 ----
  function setOpen(on) {
    el.tunePanel.hidden = !on;
    el.btnTune.classList.toggle('active', on);
    el.btnTune.setAttribute('aria-expanded', on ? 'true' : 'false');
    document.body.classList.toggle('tune-open', on);
  }
  el.btnTune.addEventListener('click', function () { setOpen(el.tunePanel.hidden); el.btnTune.blur(); });
  el.tuneClose.addEventListener('click', function () { setOpen(false); });
  el.tuneBar.addEventListener('click', function (e) { if (e.target.id === 'tuneBarOpen') setOpen(true); });
  // パネルの中のキー入力は、ゲームの操作（矢印・Enter など）に回さない
  el.tunePanel.addEventListener('keydown', function (e) { e.stopPropagation(); });

  // ---- 遊び方 ----
  function setHowto(on) {
    el.howto.hidden = !on;
    if (on) el.howtoClose.focus();
    else store(HOWTO_KEY, '1');
  }
  el.btnHowto.addEventListener('click', function () { setHowto(true); el.btnHowto.blur(); });
  el.howtoClose.addEventListener('click', function () { setHowto(false); });
  el.howto.addEventListener('click', function (e) { if (e.target === el.howto) setHowto(false); });
  el.howto.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); setHowto(false); }
  });

  buildList();
  refresh();
  if (T.source === 'link') note('リンクで送られた設定が入っています。この端末に残すときは「この設定を保存」を押してください。');
  if (!load(HOWTO_KEY)) setHowto(true);
})();
