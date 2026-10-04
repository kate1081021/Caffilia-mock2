/*
 * ui.js — 描画と入力（v2）
 * ルールの処理は全部 rules.js（Rules）に任せる。ここでは状態を差し替えて描き直すだけ。
 */
(function () {
  'use strict';

  var R = window.Rules;
  var B = window.BALANCE;

  var DIR_ARROW = { up: '↑', right: '→', down: '↓', left: '←' };
  var DIR_ROT = { up: 0, right: 90, down: 180, left: 270 };
  var KEY_DIR = { ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down', ArrowLeft: 'left' };
  var SHORT = { empty: '空き', forest: '森', mountain: '山', river: '川', fire: '炎', smallfire: '小炎', magma: 'マグマ', mud: '泥沼' };
  var STORE_KEY = 'cafilia-mock-v2-layouts';

  var TILE_DESC = {
    empty: '何もないマス。通れる。',
    forest: '通れる。火で炎になる。燃え広がりに巻き込まれると、つながった森ごと燃える。',
    mountain: '通れない。風をさえぎる（山の陰）。火でマグマになる。',
    river: '通れない。燃え広がりを止める（防火帯）。土で泥沼、風で1マス運べる。水はその上を流れていく。',
    fire: '通れる。ターン終了時、上にいる者に' + B.fireTileDamage + 'ダメージ、隣の森へ燃え移る。水で消える。風が当たると燃え広がり。',
    smallfire: '通れる。ターン終了で消える。ダメージも燃え移りもしない。風が当たると燃え広がり。',
    magma: '通れない。流れる水が当たると水蒸気爆発（3×3に' + B.steam.damage + '）。',
    mud: '通れる。入った者は次の移動が1回できない（撃つことはできる）。'
  };

  // ---------------------------------------------------------------
  // アプリの状態
  // ---------------------------------------------------------------
  var app = {
    state: R.createState(),
    resetPoint: null,
    history: [],          // [{ state, logLen }]
    log: [],              // [{ text, type }]
    sel: null,            // 選んでいる味方の id
    plan: null,           // { to: [x,y], dir }
    hover: null,
    busy: false,          // 演出を再生中
    playback: null,
    editMode: false,
    editTool: 'tile:forest',
    editPick: null,
    stroke: null,
    showForecast: true,
    flash: {},
    hl: {},
    message: null,
    scenario: '',
    cache: {}
  };
  app.resetPoint = R.clone(app.state);

  var $ = function (id) { return document.getElementById(id); };
  var el = {};
  ['board', 'boardWrap', 'fx', 'banner', 'hint', 'preview', 'turnLabel', 'modeLabel', 'scenarioSelect',
    'btnEndTurn', 'btnUndo', 'btnReset', 'btnEdit', 'playPanel', 'editPanel', 'roster', 'actPanel', 'actInfo',
    'dirCenter', 'btnStay', 'btnShoot', 'btnWait', 'enemyList', 'tilePalette', 'unitTools', 'unitList',
    'enemyActs', 'boardSize', 'btnResize', 'btnClearTiles', 'saveName', 'btnSave', 'savedList', 'btnLoadSaved',
    'btnDeleteSaved', 'storeNote', 'jsonBox', 'btnExport', 'btnDownload', 'btnImport', 'fileInput',
    'btnEditDone', 'log', 'showForecast'].forEach(function (id) { el[id] = $(id); });

  function esc(t) {
    return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function key(x, y) { return x + ',' + y; }

  // 同じ材料なら前の計算結果を使う
  function memo(name, parts, fn) {
    var c = app.cache[name];
    if (c && c.parts.length === parts.length && c.parts.every(function (p, i) { return p === parts[i]; })) return c.value;
    var v = fn();
    app.cache[name] = { parts: parts, value: v };
    return v;
  }

  // ---------------------------------------------------------------
  // 履歴・ログ・メッセージ
  // ---------------------------------------------------------------
  function pushHistory() {
    app.history.push({ state: app.state, logLen: app.log.length });
    if (app.history.length > 500) app.history.shift();
  }
  function addLog(text, type) { app.log.push({ text: text, type: type || 'system' }); }

  function logType(e) {
    if (e.type === 'turnEnd' || e.type === 'turnStart') return 'turn';
    if (e.type === 'finisher' || e.type === 'death' || e.type === 'result' || e.type === 'damage') return e.type;
    var u = e.id ? R.findUnit(app.state, e.id) : null;
    if (u && u.side === 'enemy') return 'enemy';
    return 'event';
  }

  function say(text) {
    app.message = { text: text, until: Date.now() + 2500 };
    clearTimeout(say.timer);
    say.timer = setTimeout(renderHint, 2600);
    renderHint();
  }

  // ---------------------------------------------------------------
  // 演出
  // ---------------------------------------------------------------
  function cellCenter(x, y) {
    var c = cellEls[y * app.state.size + x];
    if (!c) return null;
    var w = el.boardWrap.getBoundingClientRect();
    var r = c.el.getBoundingClientRect();
    return { x: r.left - w.left + r.width / 2, y: r.top - w.top + r.height / 2 };
  }

  function popup(x, y, text, cls) {
    var p = cellCenter(x, y);
    if (!p) return;
    var d = document.createElement('div');
    d.className = 'popup ' + (cls || '');
    d.textContent = text;
    d.style.left = p.x + 'px';
    d.style.top = p.y + 'px';
    el.fx.appendChild(d);
    setTimeout(function () { d.remove(); }, 1200);
  }

  function showBanner(text) {
    el.banner.textContent = text;
    el.banner.classList.remove('show');
    void el.banner.offsetWidth;
    el.banner.classList.add('show');
  }

  // 出来事をログに足し、演出を出す
  function showEvents(events, animate) {
    var hl = {}, flash = {}, finishers = [];
    events.forEach(function (e) {
      addLog(e.text, logType(e));
      if (!animate) return;
      if (e.type === 'cast' || e.type === 'fireSpread' || e.type === 'smallfireOut') {
        (e.cells || []).forEach(function (c) { hl[key(c[0], c[1])] = true; });
      }
      if (e.type === 'move' || e.type === 'push') {
        if (e.to) hl[key(e.to[0], e.to[1])] = true;
      }
      if (e.type === 'finisher') {
        finishers.push(e.name);
        (e.cells || []).forEach(function (c) { flash[key(c[0], c[1])] = true; });
      }
    });
    if (!animate) return;
    app.hl = hl;
    if (finishers.length) {
      showBanner(finishers.join('・') + '！');
      app.flash = flash;
      clearTimeout(showEvents.timer);
      showEvents.timer = setTimeout(function () { app.flash = {}; renderBoard(false); }, 950);
    }
    // ダメージ数字は描き直したあとの位置に出す
    setTimeout(function () {
      events.forEach(function (e) {
        if (e.type === 'damage' && e.cells) {
          var c = e.cells[0];
          popup(c[0], c[1], '-' + e.amount, (e.side === 'ally' ? 'ally ' : '') + (e.amount >= 4 ? 'big' : ''));
        }
      });
    }, 0);
  }

  // 途中の状態を1つずつ見せる
  function play(steps, finalState, done) {
    app.busy = true;
    app.playback = { steps: steps, i: 0, final: finalState, done: done, timer: null };
    nextStep();
  }
  function nextStep() {
    var pb = app.playback;
    if (!pb) return;
    if (pb.i >= pb.steps.length) { finishPlayback(); return; }
    var st = pb.steps[pb.i++];
    app.state = st.state;
    showEvents(st.events, true);
    render(true);
    pb.timer = setTimeout(nextStep, B.stepDelayMs);
  }
  function finishPlayback() {
    var pb = app.playback;
    if (!pb) return;
    clearTimeout(pb.timer);
    app.playback = null;
    app.busy = false;
    app.state = pb.final;
    app.hl = {};
    render(true);
    if (pb.done) pb.done();
  }
  function skipPlayback() {
    var pb = app.playback;
    if (!pb) return;
    clearTimeout(pb.timer);
    while (pb.i < pb.steps.length) showEvents(pb.steps[pb.i++].events, false);
    finishPlayback();
  }

  // ---------------------------------------------------------------
  // 選択と行動
  // ---------------------------------------------------------------
  function selUnit() {
    if (!app.sel) return null;
    var u = R.findUnit(app.state, app.sel);
    return u && !u.acted ? u : null;
  }
  function canControl() { return !app.busy && !app.editMode && !app.state.result; }

  function select(id) {
    var u = R.findUnit(app.state, id);
    if (!u || u.side !== 'ally') return;
    if (u.acted) { say(R.unitLabel(app.state, u) + 'はもう行動しました'); return; }
    app.sel = id;
    app.plan = { to: [u.x, u.y], dir: u.facing };
    render();
  }
  function deselect() { app.sel = null; app.plan = null; render(); }

  function selectNext(afterId) {
    if (app.state.result) { app.sel = null; app.plan = null; render(); return; }
    var al = R.alliesOf(app.state);
    var start = 0;
    al.forEach(function (a, i) { if (a.id === afterId) start = i + 1; });
    for (var k = 0; k < al.length; k++) {
      var a = al[(start + k) % al.length];
      if (!a.acted) { select(a.id); return; }
    }
    app.sel = null; app.plan = null;
    render();
  }

  function setDir(d) {
    if (!selUnit() || !canControl()) return;
    app.plan.dir = d;
    render();
  }
  function stay() {
    var u = selUnit();
    if (!u || !canControl()) return;
    app.plan.to = [u.x, u.y];
    render();
  }

  function doAct(shoot) {
    var u = selUnit();
    if (!u || !canControl()) return;
    var res = R.act(app.state, u.id, { to: app.plan.to, dir: app.plan.dir, shoot: shoot });
    if (!res.ok) { say(res.error); return; }
    pushHistory();
    var id = u.id;
    app.sel = null; app.plan = null;
    play(res.steps, res.state, function () {
      if (!app.state.result && R.allAlliesActed(app.state)) {
        addLog('3人とも行動したので、ターン終了', 'system');
        var t = R.endTurn(app.state);
        play(t.steps, t.state, function () { selectNext(null); });
      } else {
        selectNext(id);
      }
    });
  }

  function doEndTurn() {
    if (app.busy || app.editMode) return;
    if (app.state.result) { say('勝負はついています。「1手戻す」か「リセット」で続けられます'); return; }
    var res = R.endTurn(app.state);
    if (!res.ok) { say(res.error); return; }
    pushHistory();
    app.sel = null; app.plan = null;
    play(res.steps, res.state, function () { selectNext(null); });
  }

  function undo() {
    if (app.busy) skipPlayback();
    var h = app.history.pop();
    if (!h) { say('これ以上戻せません'); return; }
    app.state = h.state;
    app.log.length = h.logLen;
    app.sel = null; app.plan = null; app.editPick = null;
    render();
  }

  function setState(s, logText) {
    pushHistory();
    app.state = s;
    app.sel = null; app.plan = null; app.editPick = null;
    if (logText) addLog(logText, 'system');
    render();
  }

  function reset() {
    if (app.busy) skipPlayback();
    setState(R.clone(app.resetPoint), 'リセット（最初の配置に戻した）');
  }

  function setEditMode(on) {
    if (app.busy) skipPlayback();
    if (on === app.editMode) return;
    app.sel = null; app.plan = null; app.editPick = null;
    if (on) {
      app.editMode = true;
      addLog('エディットモード開始', 'system');
      render();
    } else {
      app.editMode = false;
      setState(R.normalizeForPlay(app.state), 'エディット終了。この配置が「リセット」の戻り先になった');
      app.resetPoint = R.clone(app.state);
    }
  }

  function loadScenario(id) {
    if (app.busy) skipPlayback();
    var s = id ? R.loadPreset(id) : R.createState();
    var name = id ? R.PRESETS.filter(function (p) { return p.id === id; })[0].name : '標準';
    app.scenario = id;
    setState(R.normalizeForPlay(s), 'シナリオ「' + name + '」を読み込んだ');
    app.resetPoint = R.clone(app.state);
    if (id) addLog(R.PRESETS.filter(function (p) { return p.id === id; })[0].desc, 'system');
    render();
  }

  // ---------------------------------------------------------------
  // 盤面のクリック
  // ---------------------------------------------------------------
  function onPlayClick(x, y) {
    if (app.busy) { skipPlayback(); return; }
    if (app.editMode) return;
    var st = app.state;
    if (st.result) { say('勝負はついています。「1手戻す」か「リセット」で続けられます'); return; }
    var u = selUnit();
    var occ = R.unitAt(st, x, y);
    if (u) {
      var reach = R.reachableCells(st, u.id);
      if (reach[key(x, y)] !== undefined) {
        app.plan.to = [x, y];
        render();
        return;
      }
      if (occ && occ.side === 'ally' && occ.id !== u.id) { select(occ.id); return; }
      say(u.stuck ? '泥沼にはまっていて移動できません（その場で撃てます）' : '移動範囲の外です');
      return;
    }
    if (occ && occ.side === 'ally') { select(occ.id); return; }
    say('味方をクリックして選んでください');
  }

  function applyEdit(x, y, dragging) {
    var tool = app.editTool;
    var st = app.state;
    var res;
    if (tool.indexOf('tile:') === 0) res = R.editPaint(st, x, y, tool.slice(5));
    else if (dragging) return;
    else if (tool === 'ally') res = R.editPlaceUnit(st, 'ally', x, y);
    else if (tool === 'enemy') res = R.editPlaceUnit(st, 'enemy', x, y);
    else if (tool === 'remove') res = R.editRemoveUnit(st, x, y);
    else if (tool === 'rotate') {
      var o = R.unitAt(st, x, y);
      if (!o) { say('向きを変えるユニットをクリック'); return; }
      var order = R.DIR_ORDER;
      res = R.editSetFacing(st, o.id, order[(order.indexOf(o.facing) + 1) % 4]);
    } else if (tool === 'move') {
      if (!app.editPick) {
        var occ = R.unitAt(st, x, y);
        if (occ) { app.editPick = occ.id; render(); } else say('動かすユニットをクリック');
        return;
      }
      res = R.editMoveUnit(st, app.editPick, x, y);
      app.editPick = null;
    }
    if (!res) return;
    if (!res.ok) {
      if (res.error !== '同じ地形' && !dragging) say(res.error);
      render();
      return;
    }
    if (!app.stroke || !app.stroke.pushed) {
      pushHistory();
      if (app.stroke) app.stroke.pushed = true;
    }
    app.state = res.state;
    render();
  }

  // ---------------------------------------------------------------
  // 描画
  // ---------------------------------------------------------------
  function render(animate) {
    renderStatus();
    renderBoard(!!animate);
    renderSide();
    renderPreview();
    renderHint();
    renderLog();
  }

  function renderStatus() {
    var st = app.state;
    el.turnLabel.textContent = 'ターン ' + st.turn;
    var mode = app.editMode ? 'エディット中' : app.busy ? '処理中…' : st.result === 'win' ? '勝利' : st.result === 'lose' ? '敗北' : 'プレイ中';
    el.modeLabel.textContent = mode;
    el.modeLabel.className = 'pill mode' + (app.editMode ? ' edit' : app.busy ? ' busy' : '');
    el.btnEndTurn.disabled = app.editMode || app.busy || !!st.result;
    el.btnUndo.disabled = app.history.length === 0;
    el.btnEdit.classList.toggle('active', app.editMode);
    el.btnEdit.innerHTML = (app.editMode ? 'エディット終了' : 'エディット') + ' <kbd>E</kbd>';
    el.playPanel.hidden = app.editMode;
    el.editPanel.hidden = !app.editMode;
    if (el.scenarioSelect.value !== app.scenario) el.scenarioSelect.value = app.scenario;
  }

  function forecastNow() {
    if (!app.showForecast || app.editMode || app.busy) return null;
    return memo('fc', [app.state], function () { return R.forecast(app.state); });
  }
  function guideNow(u) {
    return memo('guide', [app.state, u.id], function () { return R.guideMap(app.state, u.id); });
  }
  function previewNow(u) {
    var p = app.plan;
    return memo('pv', [app.state, u.id, p.to[0], p.to[1], p.dir], function () {
      return R.previewAct(app.state, u.id, p.to, p.dir);
    });
  }

  var cellEls = [];

  function unitHtml(u, st, view) {
    var cls = ['unit', u.side];
    if (view.selected) cls.push('selected');
    if (u.side === 'ally' && u.acted && !app.editMode) cls.push('acted');
    if (u.stuck) cls.push('stuck');
    var facing = view.facing || u.facing;
    var name = u.side === 'ally' ? esc(R.magicName(u.magic)) : '敵<small>' + esc(u.letter) + '</small>';
    var h = '<div class="' + cls.join(' ') + '" data-id="' + u.id + '" style="--rot:' + DIR_ROT[facing] + 'deg">' +
      '<span class="facing"></span><span class="u-name">' + name + '</span><span class="u-hp">HP' + u.hp + '</span>';
    if (u.side === 'enemy') h += '<span class="u-magic">' + esc(R.magicName(u.magic)) + '</span>';
    if (view.warn) h += '<span class="u-warn">予告 -' + view.warn + '</span>';
    if (view.dmg) h += '<span class="u-dmg">-' + view.dmg.amount + (view.dmg.dies ? ' 倒れる' : '') + '</span>';
    return h + '</div>';
  }

  function renderBoard(animate) {
    var st = app.state;
    var n = st.size;
    el.board.style.setProperty('--n', n);

    // 動きのアニメーション用: 描き直す前の位置
    var before = {};
    if (animate) {
      Array.prototype.forEach.call(el.board.querySelectorAll('.unit[data-id]'), function (t) {
        before[t.getAttribute('data-id')] = t.getBoundingClientRect();
      });
    }

    if (cellEls.length !== n * n) {
      el.board.innerHTML = '';
      cellEls = [];
      for (var i = 0; i < n * n; i++) {
        var d = document.createElement('div');
        d.setAttribute('data-x', i % n);
        d.setAttribute('data-y', Math.floor(i / n));
        el.board.appendChild(d);
        cellEls.push({ el: d, cls: null, html: null });
      }
    }

    var u = (!app.editMode && !app.busy) ? selUnit() : null;
    var reach = u ? R.reachableCells(st, u.id) : {};
    var guide = (u && !st.result) ? guideNow(u) : {};
    var pv = (u && app.plan && !st.result) ? previewNow(u) : null;
    var fc = forecastNow();

    // 予測
    var shape = {}, range = {}, change = {}, dmg = {};
    if (pv) {
      pv.cells.forEach(function (c) { shape[key(c[0], c[1])] = true; });
      pv.finishers.forEach(function (f) { f.cells.forEach(function (c) { range[key(c[0], c[1])] = true; }); });
      pv.tileChanges.forEach(function (c) { change[key(c.x, c.y)] = c.to; });
      pv.damages.forEach(function (d) { dmg[d.id] = d; });
    }
    // 予告
    var fcShot = {}, fcGhost = {}, fcSpread = {}, warn = {};
    if (fc) {
      fc.enemies.forEach(function (p) {
        var e = R.findUnit(st, p.id);
        if (!e) return;
        (p.cells || []).forEach(function (c) {
          var k = key(c[0], c[1]);
          (fcShot[k] = fcShot[k] || []).push(e.letter);
        });
        if (p.to && (p.to[0] !== e.x || p.to[1] !== e.y)) fcGhost[key(p.to[0], p.to[1])] = { letter: e.letter, dir: p.dir };
      });
      fc.fireSpread.forEach(function (c) { fcSpread[key(c[0], c[1])] = true; });
      fc.burn.forEach(function (b) { warn[b.id] = (warn[b.id] || 0) + B.fireTileDamage; });
      fc.enemyDamage.forEach(function (d) { if (d.side === 'ally') warn[d.id] = (warn[d.id] || 0) + d.amount; });
    }

    // 選んでいる味方は、移動先の候補に描く
    var drawAt = {};
    st.units.forEach(function (x) { drawAt[x.id] = [x.x, x.y]; });
    var planGhost = null;
    if (u && app.plan) {
      drawAt[u.id] = app.plan.to;
      if (app.plan.to[0] !== u.x || app.plan.to[1] !== u.y) planGhost = key(u.x, u.y);
    }
    var unitByCell = {};
    st.units.forEach(function (x) { unitByCell[key(drawAt[x.id][0], drawAt[x.id][1])] = x; });

    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var k = key(x, y);
        var tile = R.getTile(st, x, y);
        var cls = ['cell', 't-' + tile];
        if (reach[k] !== undefined) cls.push('reach');
        if (u && app.plan && app.plan.to[0] === x && app.plan.to[1] === y) cls.push('plan-to');
        if (guide[k] === 'finisher' && reach[k] !== undefined) cls.push('guide-finisher');
        if (shape[k]) cls.push('pv-shape');
        if (range[k]) cls.push('pv-range');
        if (fcShot[k]) cls.push('fc-shot');
        if (app.hl[k]) cls.push('hl');
        if (app.flash[k]) cls.push('flash');
        var unit = unitByCell[k];
        if (app.editMode && app.editPick && unit && unit.id === app.editPick) cls.push('picked');

        var inner = '<span class="tile-label">' + esc(R.TILE_INFO[tile].label) + '</span>';
        if (guide[k] && reach[k] !== undefined) {
          inner += guide[k] === 'finisher' ? '<span class="b-guide finisher">◆</span>' : '<span class="b-guide change" title="変化が起きる"></span>';
        }
        if (change[k]) inner += '<span class="b-change">→' + esc(SHORT[change[k]]) + '</span>';
        var badges = '';
        if (fcSpread[k]) badges += '<span class="spread">燃</span>';
        if (fcShot[k]) badges += '<span class="enemy">' + esc(fcShot[k].join('')) + '</span>';
        if (badges) inner += '<span class="b-fc">' + badges + '</span>';
        if (fcGhost[k] && !unit) inner += '<div class="ghost">' + esc(fcGhost[k].letter) + DIR_ARROW[fcGhost[k].dir] + '</div>';
        if (planGhost === k && !unit) inner += '<div class="ghost ally"></div>';
        if (unit) {
          inner += unitHtml(unit, st, {
            selected: u && unit.id === u.id,
            facing: (u && unit.id === u.id) ? app.plan.dir : null,
            warn: warn[unit.id],
            dmg: dmg[unit.id]
          });
        }

        var c = cellEls[y * n + x];
        var clsText = cls.join(' ');
        if (c.cls !== clsText) { c.el.className = clsText; c.cls = clsText; }
        if (c.html !== inner) { c.el.innerHTML = inner; c.html = inner; }
      }
    }

    // 動いたユニットを、前の位置からすべらせる
    if (animate) {
      Array.prototype.forEach.call(el.board.querySelectorAll('.unit[data-id]'), function (t) {
        var b = before[t.getAttribute('data-id')];
        if (!b) return;
        var a = t.getBoundingClientRect();
        var dx = b.left - a.left, dy = b.top - a.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        t.style.transition = 'none';
        t.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        void t.offsetWidth;
        t.style.transition = 'transform .3s ease';
        t.style.transform = '';
      });
    }
  }

  // サイドパネル: 中身が変わったときだけ作り直す
  var sideSig = '';
  function renderSide() {
    var st = app.state;
    var fc = forecastNow();
    var sig = JSON.stringify([app.editMode, app.busy, app.sel, app.plan, app.editTool, st.units, st.enemyActs, st.size, st.result, fc ? fc.enemies : null, storeVersion]);
    if (sig === sideSig) return;
    sideSig = sig;
    if (app.editMode) renderEditPanel(); else renderPlayPanel(fc);
  }

  function planText(p, st) {
    var e = R.findUnit(st, p.id);
    if (!e) return '';
    var moved = p.to && (p.to[0] !== e.x || p.to[1] !== e.y);
    return '予告: ' + (moved ? '(' + p.to[0] + ',' + p.to[1] + ') へ動いて' : 'その場で') + ' ' + DIR_ARROW[p.dir] + ' に' + R.magicName(e.magic) + 'の魔法';
  }

  function renderPlayPanel(fc) {
    var st = app.state;
    var warn = {};
    if (fc) {
      fc.burn.forEach(function (b) { warn[b.id] = (warn[b.id] || 0) + B.fireTileDamage; });
      fc.enemyDamage.forEach(function (d) { if (d.side === 'ally') warn[d.id] = (warn[d.id] || 0) + d.amount; });
    }
    var al = R.alliesOf(st);
    el.roster.innerHTML = al.length ? al.map(function (a, i) {
      var status = [a.acted ? '行動済み' : '行動前'];
      if (a.stuck) status.push('泥沼: 次は移動できない');
      var cls = 'ally-card' + (a.id === app.sel ? ' selected' : '') + (a.acted ? ' acted' : '');
      return '<button type="button" class="' + cls + '" data-id="' + a.id + '">' +
        '<span class="dot">' + esc(R.magicName(a.magic)) + '</span>' +
        '<span class="info"><b>' + (i + 1) + '. ' + esc(R.unitLabel(st, a)) + '　HP ' + a.hp + '/' + a.maxHp + '　' + DIR_ARROW[a.facing] + '</b>' +
        '<span class="sub">' + esc(status.join('・')) +
        (warn[a.id] ? '　<span class="danger">予告: ' + warn[a.id] + 'ダメージを受ける' + (warn[a.id] >= a.hp ? '（倒れる）' : '') + '</span>' : '') +
        '</span></span></button>';
    }).join('') : '<p class="muted">味方がいません（エディットで置けます）</p>';

    var en = R.enemiesOf(st);
    var plans = {};
    if (fc) fc.enemies.forEach(function (p) { plans[p.id] = p; });
    var html = en.map(function (e) {
      var note = e.stuck ? '（泥沼: 次は移動できない）' : '';
      return '<div class="enemy-row"><span class="dot">' + esc(e.letter) + '</span><span>' + esc(e.name) + '（' + esc(R.magicName(e.magic)) + '）HP ' + e.hp + '/' + e.maxHp +
        '<span class="hpbar"><span style="width:' + Math.max(0, e.hp / e.maxHp * 100) + '%"></span></span> ' + DIR_ARROW[e.facing] + esc(note) + '</span>' +
        (plans[e.id] ? '<span class="plan">' + esc(planText(plans[e.id], st)) + '</span>' : '') + '</div>';
    }).join('');
    html += '<p class="note">敵は' + (st.enemyActs ? '行動する' : '何もしない') + '設定（エディットで切り替え）</p>';
    el.enemyList.innerHTML = en.length ? html : '<p class="muted">敵がいません（エディットで置けます）</p>';

    renderActPanel();
  }

  function renderActPanel() {
    var u = canControl() ? selUnit() : null;
    el.actPanel.classList.toggle('off', !u);
    Array.prototype.forEach.call(el.actPanel.querySelectorAll('.dir'), function (b) {
      b.disabled = !u;
      b.classList.toggle('active', !!u && app.plan.dir === b.getAttribute('data-dir'));
    });
    el.btnStay.disabled = !u;
    el.btnShoot.disabled = !u;
    el.btnWait.disabled = !u;
    if (!u) {
      el.actInfo.textContent = app.busy ? '処理中…' : '味方を選ぶと、ここで向きを選んで撃てます';
      el.dirCenter.textContent = '';
      return;
    }
    var moved = app.plan.to[0] !== u.x || app.plan.to[1] !== u.y;
    el.dirCenter.textContent = R.magicName(u.magic);
    el.actInfo.innerHTML = '<b>' + esc(R.unitLabel(app.state, u)) + '</b>　' +
      (moved ? '移動先 (' + app.plan.to[0] + ',' + app.plan.to[1] + ') <button type="button" id="btnCancelMove">移動を取り消す</button>' :
        (u.stuck ? '泥沼で移動できない（その場で撃つ）' : 'その場（緑のマスで移動先を選べる）')) +
      '　向き ' + DIR_ARROW[app.plan.dir];
  }

  var storeVersion = 0;
  function storeGet() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return null; }
  }
  function storeSet(obj) {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(obj)); storeVersion++; return true; } catch (e) { return false; }
  }

  function renderEditPanel() {
    var st = app.state;
    el.tilePalette.innerHTML = R.TILES.map(function (t) {
      var k = 'tile:' + t;
      return '<button type="button" class="' + (app.editTool === k ? 'active' : '') + '" data-tool="' + k + '">' +
        '<span class="swatch t-' + t + '">' + esc(R.TILE_INFO[t].label) + '</span>' + esc(R.TILE_INFO[t].name) + '</button>';
    }).join('');
    var tools = [['ally', '味方を置く'], ['enemy', '敵を置く'], ['move', '動かす'], ['rotate', '向きを回す'], ['remove', '消す']];
    el.unitTools.innerHTML = tools.map(function (t) {
      return '<button type="button" class="' + (app.editTool === t[0] ? 'active' : '') + '" data-tool="' + t[0] + '">' + t[1] + '</button>';
    }).join('');
    el.unitList.innerHTML = st.units.length ? st.units.map(function (u) {
      return '<div class="u-row"><b>' + esc(R.unitLabel(st, u)) + '</b>' +
        '<select data-id="' + u.id + '" data-field="magic" aria-label="魔法">' + R.MAGICS.map(function (m) {
          return '<option value="' + m + '"' + (u.magic === m ? ' selected' : '') + '>' + R.magicName(m) + '</option>';
        }).join('') + '</select>' +
        '<select data-id="' + u.id + '" data-field="facing" aria-label="向き">' + R.DIR_ORDER.map(function (d) {
          return '<option value="' + d + '"' + (u.facing === d ? ' selected' : '') + '>' + DIR_ARROW[d] + ' ' + R.DIRS[d].name + '</option>';
        }).join('') + '</select>' +
        '<span class="muted">(' + u.x + ',' + u.y + ')</span></div>';
    }).join('') : '<p class="muted">ユニットがいません</p>';
    el.enemyActs.checked = st.enemyActs;
    el.boardSize.value = st.size;

    var saved = storeGet();
    if (saved === null) {
      el.storeNote.textContent = 'この環境では保存（localStorage）が使えません。JSON の書き出しを使ってください。';
      el.savedList.innerHTML = '';
    } else {
      var names = Object.keys(saved);
      el.storeNote.textContent = names.length ? '' : 'まだ保存した配置はありません。';
      el.savedList.innerHTML = names.map(function (nm) { return '<option value="' + esc(nm) + '">' + esc(nm) + '</option>'; }).join('');
    }
  }

  function renderHint() {
    var st = app.state;
    var h = el.hint;
    h.className = 'hint';
    if (app.message && app.message.until > Date.now()) {
      h.textContent = app.message.text;
      h.classList.add('warn');
      return;
    }
    if (app.busy) { h.textContent = '処理中…（盤面のクリックかキーで飛ばせます）'; h.classList.add('busy'); return; }
    if (st.result && !app.editMode) {
      h.textContent = st.result === 'win' ? '勝利！ 敵を全員倒しました' : '敗北… 味方が全員倒れました';
      h.classList.add('result');
      return;
    }
    if (app.editMode) {
      var tool = app.editTool;
      if (tool.indexOf('tile:') === 0) h.textContent = 'マスをクリック（ドラッグ）で「' + R.TILE_INFO[tool.slice(5)].name + '」を塗る';
      else if (tool === 'move') h.textContent = app.editPick ? '置き先のマスをクリック' : '動かすユニットをクリック';
      else if (tool === 'remove') h.textContent = '消すユニットをクリック';
      else if (tool === 'rotate') h.textContent = 'クリックしたユニットの向きを時計回りに回す';
      else h.textContent = (tool === 'ally' ? '味方' : '敵') + 'を置くマスをクリック';
      return;
    }
    var u = selUnit();
    if (!u) { h.textContent = '味方をクリック（または 1〜3 キー）で選ぶ'; return; }
    h.textContent = '緑のマスで移動先 → 矢印で向き → 「撃つ」（Enter）。◆ ＝ そこから決め手が起きる';
  }

  function renderPreview() {
    var box = el.preview;
    var u = (!app.editMode && !app.busy) ? selUnit() : null;
    if (u && app.plan && !app.state.result) {
      var p = previewNow(u);
      var lines = p.events.map(function (e) {
        var cls = e.type === 'finisher' ? 'finisher' : e.type === 'damage' ? 'damage' : e.type === 'death' ? 'death' : '';
        var text = e.type === 'cast' ? e.text.replace(/^.*?→ /, '') : e.text;
        return '<div class="pv-line ' + cls + '">' + esc(text) + '</div>';
      });
      box.innerHTML = '<div class="pv-head">予測: (' + p.to[0] + ',' + p.to[1] + ') から ' + DIR_ARROW[p.dir] + ' に' + R.magicName(u.magic) + 'の魔法（' + R.MAGIC_INFO[u.magic].verb + '）</div>' + lines.join('');
      return;
    }
    var t = app.hover;
    if (t && R.inBounds(app.state, t.x, t.y)) {
      var tile = R.getTile(app.state, t.x, t.y);
      var o = R.unitAt(app.state, t.x, t.y);
      var s = '<div class="pv-head">(' + t.x + ',' + t.y + ') ' + esc(R.tileName(tile)) + '</div><div>' + esc(TILE_DESC[tile]) + '</div>';
      if (o) s += '<div class="muted">' + esc(R.unitLabel(app.state, o)) + '　HP ' + o.hp + '/' + o.maxHp + '　魔法: ' + esc(R.magicName(o.magic)) + '　向き ' + DIR_ARROW[o.facing] + '</div>';
      box.innerHTML = s;
      return;
    }
    box.innerHTML = '<span class="muted">マスにカーソルを乗せると説明が出ます。味方を選ぶと、撃ったときの予測が出ます。紫の印は敵の予告、橙の「燃」は次のターン終了で燃え移る森です。</span>';
  }

  var logSig = '';
  function renderLog() {
    var last = app.log[app.log.length - 1];
    var sig = app.log.length + ':' + (last ? last.text : '');
    if (sig === logSig) return;
    logSig = sig;
    el.log.innerHTML = app.log.map(function (l) { return '<li class="' + esc(l.type) + '">' + esc(l.text) + '</li>'; }).join('');
    el.log.scrollTop = el.log.scrollHeight;
  }

  // ---------------------------------------------------------------
  // 入力
  // ---------------------------------------------------------------
  function cellFrom(e) {
    var c = e.target.closest ? e.target.closest('[data-x]') : null;
    if (!c || !el.board.contains(c)) return null;
    return { x: Number(c.getAttribute('data-x')), y: Number(c.getAttribute('data-y')) };
  }

  el.board.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    var c = cellFrom(e);
    if (!c) return;
    e.preventDefault();
    if (app.editMode) {
      app.stroke = { pushed: false };
      applyEdit(c.x, c.y, false);
    } else {
      onPlayClick(c.x, c.y);
    }
  });
  el.board.addEventListener('pointerover', function (e) {
    var c = cellFrom(e);
    if (!c) return;
    if (app.editMode && app.stroke && (e.buttons & 1)) applyEdit(c.x, c.y, true);
    if (!app.hover || app.hover.x !== c.x || app.hover.y !== c.y) {
      app.hover = c;
      if (!selUnit()) renderPreview();
    }
  });
  el.board.addEventListener('pointerleave', function () { app.hover = null; if (!selUnit()) renderPreview(); });
  window.addEventListener('pointerup', function () { app.stroke = null; });

  // ボタンを押したらフォーカスを外す（Enter で押し直されないように）
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button');
    if (b) setTimeout(function () { b.blur(); }, 0);
  });

  el.roster.addEventListener('click', function (e) {
    var b = e.target.closest('[data-id]');
    if (b && canControl()) select(b.getAttribute('data-id'));
  });
  el.actPanel.addEventListener('click', function (e) {
    var d = e.target.closest('.dir');
    if (d) { setDir(d.getAttribute('data-dir')); return; }
    if (e.target.id === 'btnCancelMove') stay();
  });
  el.btnStay.addEventListener('click', stay);
  el.btnShoot.addEventListener('click', function () { doAct(true); });
  el.btnWait.addEventListener('click', function () { doAct(false); });
  el.btnEndTurn.addEventListener('click', doEndTurn);
  el.btnUndo.addEventListener('click', undo);
  el.btnReset.addEventListener('click', reset);
  el.btnEdit.addEventListener('click', function () { setEditMode(!app.editMode); });
  el.btnEditDone.addEventListener('click', function () { setEditMode(false); });
  el.showForecast.addEventListener('change', function () { app.showForecast = el.showForecast.checked; render(); });

  el.scenarioSelect.innerHTML = '<option value="">標準（火・水・風 / 敵1体）</option>' +
    R.PRESETS.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('');
  el.scenarioSelect.addEventListener('change', function () { loadScenario(el.scenarioSelect.value); el.scenarioSelect.blur(); });

  function onToolClick(e) {
    var b = e.target.closest('[data-tool]');
    if (!b) return;
    app.editTool = b.getAttribute('data-tool');
    app.editPick = null;
    render();
  }
  el.tilePalette.addEventListener('click', onToolClick);
  el.unitTools.addEventListener('click', onToolClick);
  el.unitList.addEventListener('change', function (e) {
    var s = e.target.closest('select');
    if (!s) return;
    var id = s.getAttribute('data-id');
    var res = s.getAttribute('data-field') === 'magic' ? R.editSetMagic(app.state, id, s.value) : R.editSetFacing(app.state, id, s.value);
    if (res.ok) { pushHistory(); app.state = res.state; render(); }
  });
  el.enemyActs.addEventListener('change', function () {
    pushHistory();
    app.state = R.editSetEnemyActs(app.state, el.enemyActs.checked).state;
    render();
  });
  el.btnResize.addEventListener('click', function () {
    var res = R.editResize(app.state, el.boardSize.value);
    pushHistory();
    app.state = res.state;
    say('盤面を ' + res.state.size + '×' + res.state.size + ' にしました（味方は下の段、敵は上の段へ）');
    render();
  });
  el.btnClearTiles.addEventListener('click', function () {
    var s = R.clone(app.state);
    for (var i = 0; i < s.tiles.length; i++) s.tiles[i] = 'empty';
    pushHistory();
    app.state = s;
    render();
  });

  // 保存と読み込み
  el.btnSave.addEventListener('click', function () {
    var saved = storeGet();
    if (saved === null) { say('この環境では保存できません。JSON の書き出しを使ってください'); return; }
    var name = el.saveName.value.trim() || ('配置 ' + new Date().toLocaleString('ja-JP'));
    saved[name] = R.exportLayout(app.state);
    if (storeSet(saved)) { say('「' + name + '」を保存しました'); addLog('配置「' + name + '」を保存した', 'system'); }
    else say('保存できませんでした');
    render();
    el.savedList.value = name;
  });
  function loadLayout(json, label) {
    var r = R.importLayout(json);
    if (!r.ok) { say('読み込めません: ' + r.error); return false; }
    setState(r.state, label);
    return true;
  }
  el.btnLoadSaved.addEventListener('click', function () {
    var saved = storeGet();
    var name = el.savedList.value;
    if (!saved || !saved[name]) { say('読み込む配置を選んでください'); return; }
    loadLayout(saved[name], '配置「' + name + '」を読み込んだ');
  });
  el.btnDeleteSaved.addEventListener('click', function () {
    var saved = storeGet();
    var name = el.savedList.value;
    if (!saved || !saved[name]) return;
    delete saved[name];
    storeSet(saved);
    say('「' + name + '」を削除しました');
    render();
  });
  el.btnExport.addEventListener('click', function () {
    el.jsonBox.value = R.exportLayout(app.state);
    el.jsonBox.select();
  });
  el.btnDownload.addEventListener('click', function () {
    try {
      var blob = new Blob([R.exportLayout(app.state)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'cafilia-layout.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    } catch (e) { say('ファイルに保存できませんでした。「JSON を書き出す」を使ってください'); }
  });
  el.btnImport.addEventListener('click', function () { loadLayout(el.jsonBox.value, 'JSON から配置を読み込んだ'); });
  el.fileInput.addEventListener('change', function () {
    var f = el.fileInput.files && el.fileInput.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      el.jsonBox.value = String(reader.result);
      loadLayout(el.jsonBox.value, 'ファイル「' + f.name + '」から配置を読み込んだ');
      el.fileInput.value = '';
    };
    reader.readAsText(f);
  });

  document.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undo(); }
      return;
    }
    var k = e.key;
    if (app.busy) {
      if (k !== 'Shift') { e.preventDefault(); skipPlayback(); }
      return;
    }
    if (k === 'z' || k === 'Z') { undo(); return; }
    if (k === 'e' || k === 'E') { setEditMode(!app.editMode); return; }
    if (app.editMode) {
      if (k === 'Escape') { app.editPick = null; render(); }
      return;
    }
    if (k === 't' || k === 'T') { doEndTurn(); return; }
    if (k >= '1' && k <= '9') {
      var a = R.alliesOf(app.state)[Number(k) - 1];
      if (a && canControl()) select(a.id);
      return;
    }
    if (KEY_DIR[k]) { e.preventDefault(); setDir(KEY_DIR[k]); return; }
    if (k === 'Enter') { e.preventDefault(); doAct(true); return; }
    if (k === ' ') { e.preventDefault(); stay(); return; }
    if (k === 'w' || k === 'W') { doAct(false); return; }
    if (k === 'Escape') {
      var u = selUnit();
      if (u && app.plan && (app.plan.to[0] !== u.x || app.plan.to[1] !== u.y)) stay();
      else deselect();
    }
  });

  // 確認用（コンソールから状態を見られる）
  window.CafiliaApp = app;
  app.render = render;

  addLog('ようこそ。味方を選び、立ち位置と向きを決めて撃ってください', 'system');
  render();
})();
