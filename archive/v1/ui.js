/*
 * ui.js — 描画と入力
 * ルールの処理は全部 rules.js（Rules）に任せる。ここでは状態を差し替えて描き直すだけ。
 */
(function () {
  'use strict';

  var R = window.Rules;
  var B = window.BALANCE;

  var DIR_ARROW = { up: '↑', right: '→', down: '↓', left: '←' };
  var SHORT_NAME = { empty: '空き', forest: '森', mountain: '山', river: '川', fire: '炎', smallfire: '小炎', magma: 'マグマ', mud: '泥沼', whirl: '渦' };
  var KEY_DIR = { ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down', ArrowLeft: 'left' };

  var TILE_DESC = {
    empty: '何もないマス。通れる。草→森／水→川／土→山／火→小さな炎',
    forest: '通れる。火を撃つと炎になる。燃え広がりに巻き込まれると、つながった森ごと燃える',
    mountain: '通れない。燃え広がりをさえぎる。水→川が流れる（向きを選ぶ）／火→マグマ',
    river: '通れない。燃え広がりを止める（防火帯）。土→泥沼／風→渦巻き',
    fire: '通れる。ターン終了時、上にいる者に' + B.fireTileDamage + 'ダメージ、隣の森へ燃え移る。水→消火／風→燃え広がり',
    smallfire: '通れる。ターン終了で消える。水→消火／風→燃え広がり',
    magma: '通れない。水→水蒸気爆発（3×3に' + B.steam.damage + '）',
    mud: '通れる。入った者は次の移動を1回休む',
    whirl: '通れない。ターン終了時、隣の1体を中へ引き込む。火→センタクキ（中' + B.sentakuki.inner + '・隣' + B.sentakuki.adjacent + '）'
  };

  // ---------------------------------------------------------------
  // アプリの状態
  // ---------------------------------------------------------------
  var app = {
    state: R.createState(),
    resetPoint: null,
    history: [],          // [{ state, logLen }]
    log: [],              // [{ text, type }]
    selectedId: null,
    mode: 'move',         // 'move' | 'cast'
    hover: null,          // {x, y}
    pending: null,        // 向き待ちのマス {x, y}
    pendingDir: null,
    lastDir: 'up',
    editMode: false,
    editTool: 'tile:forest',
    editPick: null,       // 「動かす」で選んだユニット
    stroke: null,         // ドラッグで塗っている途中
    flashCells: {},
    hitCells: {},
    message: null,        // { text, until }
    guideCache: null
  };
  app.resetPoint = R.clone(app.state);

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    board: $('board'), boardWrap: $('boardWrap'), dirPicker: $('dirPicker'), banner: $('banner'),
    hint: $('hint'), preview: $('preview'), turnLabel: $('turnLabel'), modeLabel: $('modeLabel'),
    btnEndTurn: $('btnEndTurn'), btnUndo: $('btnUndo'), btnReset: $('btnReset'), btnEdit: $('btnEdit'),
    playPanel: $('playPanel'), editPanel: $('editPanel'), roster: $('roster'), enemyList: $('enemyList'),
    btnModeMove: $('btnModeMove'), btnModeCast: $('btnModeCast'),
    tilePalette: $('tilePalette'), unitTools: $('unitTools'), allyMagic: $('allyMagic'),
    enemyMoves: $('enemyMoves'), boardSize: $('boardSize'), btnResize: $('btnResize'),
    btnClearTiles: $('btnClearTiles'), btnEditDone: $('btnEditDone'), log: $('log')
  };

  function esc(t) {
    return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  // ---------------------------------------------------------------
  // 状態の差し替え・履歴・ログ
  // ---------------------------------------------------------------
  function pushHistory() {
    app.history.push({ state: app.state, logLen: app.log.length });
    if (app.history.length > 500) app.history.shift();
  }

  function addLog(text, type) { app.log.push({ text: text, type: type || 'system' }); }

  var LOG_TYPE = {
    turnEnd: 'turn', turnStart: 'turn', finisher: 'finisher', damage: 'damage', burn: 'burn',
    enemyAttack: 'enemyAttack', death: 'death', result: 'result', info: 'system'
  };

  function addEvents(events) {
    var finishers = [];
    var flash = {}, hit = {};
    events.forEach(function (e) {
      addLog(e.text, LOG_TYPE[e.type] || e.type);
      if (e.type === 'finisher') {
        finishers.push(e.name);
        (e.cells || []).forEach(function (c) { flash[c[0] + ',' + c[1]] = true; hit[c[0] + ',' + c[1]] = true; });
      }
      if (e.type === 'damage' || e.type === 'burn' || e.type === 'enemyAttack') {
        (e.cells || []).forEach(function (c) { hit[c[0] + ',' + c[1]] = true; });
      }
    });
    if (finishers.length) showBanner(finishers.join(' → ') + '！');
    if (Object.keys(flash).length || Object.keys(hit).length) {
      app.flashCells = flash;
      app.hitCells = hit;
      clearTimeout(addEvents.timer);
      addEvents.timer = setTimeout(function () { app.flashCells = {}; app.hitCells = {}; renderBoard(); }, 950);
    }
  }

  function showBanner(text) {
    el.banner.textContent = text;
    el.banner.classList.remove('show');
    void el.banner.offsetWidth; // アニメーションをやり直す
    el.banner.classList.add('show');
  }

  function say(text) {
    app.message = { text: text, until: Date.now() + 2500 };
    clearTimeout(say.timer);
    say.timer = setTimeout(function () { renderHint(); }, 2600);
    renderHint();
  }

  // ---------------------------------------------------------------
  // 選択
  // ---------------------------------------------------------------
  function sel() {
    if (!app.selectedId) return null;
    return R.findUnit(app.state, app.selectedId);
  }
  function canMoveNow(u) {
    return !!u && u.movesLeft > 0 && !R.isInWhirl(app.state, u) && !app.state.result;
  }
  function select(id) {
    var u = R.findUnit(app.state, id);
    if (!u || u.side !== 'ally') return;
    app.selectedId = id;
    app.mode = canMoveNow(u) ? 'move' : 'cast';
    if (u.cast && !canMoveNow(u)) app.mode = 'move';
    app.pending = null;
    render();
  }
  function deselect() {
    app.selectedId = null;
    app.pending = null;
    render();
  }
  // 魔法をまだ撃っていない味方を、after の次から順に探す
  function nextReadyAlly(afterId) {
    var al = R.alliesOf(app.state);
    if (!al.length) return null;
    var start = 0;
    if (afterId) {
      for (var i = 0; i < al.length; i++) if (al[i].id === afterId) start = i + 1;
    }
    for (var k = 0; k < al.length; k++) {
      var a = al[(start + k) % al.length];
      if (!a.cast) return a;
    }
    return null;
  }
  function selectReady(afterId) {
    var a = app.state.result ? null : nextReadyAlly(afterId);
    if (a) select(a.id); else { app.selectedId = null; render(); }
  }

  // ---------------------------------------------------------------
  // 行動
  // ---------------------------------------------------------------
  function doMove(x, y) {
    var u = sel();
    var res = R.moveAlly(app.state, u.id, x, y);
    if (!res.ok) { say(res.error); return; }
    pushHistory();
    app.state = res.state;
    addEvents(res.events);
    var nu = sel();
    app.mode = (nu && !nu.cast) ? 'cast' : 'move';
    render();
  }

  function startCast(x, y) {
    var u = sel();
    if (R.needsDirection(app.state, u.magic, x, y)) {
      app.pending = { x: x, y: y };
      app.pendingDir = app.lastDir;
      render();
      return;
    }
    doCast(x, y, null);
  }

  function doCast(x, y, dir) {
    var u = sel();
    if (!u) return;
    var res = R.castMagic(app.state, u.id, x, y, dir);
    if (!res.ok) { say(res.error); return; }
    pushHistory();
    if (dir) app.lastDir = dir;
    var events = res.events.slice();
    var st = res.state;
    var turnEnded = false;
    if (!st.result && R.allAlliesDone(st)) {
      var t = R.endTurn(st);
      events.push({ type: 'info', text: '全員が魔法を撃ったので、ターン終了' });
      events = events.concat(t.events);
      st = t.state;
      turnEnded = true;
    }
    app.state = st;
    app.pending = null;
    addEvents(events);
    if (turnEnded) selectReady(null);
    else selectReady(u.id);
  }

  function doEndTurn() {
    if (app.editMode) return;
    if (app.state.result) { say('勝負はついています。「1手戻す」か「リセット」で続けられます'); return; }
    var res = R.endTurn(app.state);
    if (!res.ok) { say(res.error); return; }
    pushHistory();
    app.state = res.state;
    app.pending = null;
    addEvents(res.events);
    selectReady(null);
  }

  function undo() {
    var h = app.history.pop();
    if (!h) { say('これ以上戻せません'); return; }
    app.state = h.state;
    app.log.length = h.logLen;
    app.pending = null;
    app.editPick = null;
    if (app.selectedId && !R.findUnit(app.state, app.selectedId)) app.selectedId = null;
    var u = sel();
    if (u) app.mode = canMoveNow(u) ? 'move' : 'cast';
    render();
  }

  function reset() {
    pushHistory();
    app.state = R.clone(app.resetPoint);
    app.pending = null;
    app.selectedId = null;
    app.editPick = null;
    addLog('リセット（最初の配置に戻した）', 'system');
    render();
  }

  function setEditMode(on) {
    if (on === app.editMode) return;
    app.pending = null;
    app.editPick = null;
    if (on) {
      app.editMode = true;
      app.selectedId = null;
      addLog('エディットモード開始', 'system');
    } else {
      pushHistory();
      app.editMode = false;
      app.state = R.normalizeForPlay(app.state);
      app.resetPoint = R.clone(app.state);
      addLog('エディット終了。この配置が「リセット」の戻り先になった', 'system');
    }
    render();
  }

  // ---------------------------------------------------------------
  // プレイ中のクリック
  // ---------------------------------------------------------------
  // そのマスをクリックしたら魔法を撃つことになるか
  function wouldCastAt(x, y) {
    var u = sel();
    if (!u || u.cast || app.state.result || app.editMode) return false;
    if (app.mode === 'cast') return true;
    if (R.reachableCells(app.state, u.id)[x + ',' + y]) return false;
    var occ = R.unitAt(app.state, x, y);
    if (occ && occ.side === 'ally') return false;
    return true;
  }

  function onPlayClick(x, y) {
    if (app.pending) {
      // 向き待ちのときに盤面をクリック → やめる（別のマスならそこへ撃ち直し）
      var same = app.pending.x === x && app.pending.y === y;
      app.pending = null;
      if (same) { render(); return; }
    }
    var st = app.state;
    if (st.result) { say('勝負はついています。「1手戻す」か「リセット」で続けられます'); render(); return; }
    var u = sel();
    var occ = R.unitAt(st, x, y);
    if (!u) {
      if (occ && occ.side === 'ally') select(occ.id);
      else { say('まず味方をクリックして選んでください'); render(); }
      return;
    }
    if (app.mode === 'move') {
      if (occ && occ.id === u.id) {
        if (!u.cast) { app.mode = 'cast'; render(); } else say('この味方はもう魔法を撃ちました');
        return;
      }
      if (occ && occ.side === 'ally') { select(occ.id); return; }
      if (R.reachableCells(st, u.id)[x + ',' + y]) { doMove(x, y); return; }
      if (u.cast) { say('そこへは移動できません'); return; }
      startCast(x, y);
      return;
    }
    // 魔法モード
    if (occ && occ.id === u.id && canMoveNow(u)) { app.mode = 'move'; render(); return; }
    if (u.cast) { say('この味方はもう魔法を撃ちました'); return; }
    startCast(x, y);
  }

  // ---------------------------------------------------------------
  // エディット中のクリック
  // ---------------------------------------------------------------
  function applyEdit(x, y, dragging) {
    var tool = app.editTool;
    var st = app.state;
    var res;
    if (tool.indexOf('tile:') === 0) {
      res = R.editPaint(st, x, y, tool.slice(5));
    } else if (dragging) {
      return;
    } else if (tool === 'ally') {
      res = R.editPlaceAlly(st, x, y, null);
    } else if (tool === 'enemy') {
      res = R.editPlaceEnemy(st, x, y);
    } else if (tool === 'remove') {
      res = R.editRemoveUnit(st, x, y);
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
  function render() {
    renderStatus();
    renderBoard();
    renderSide();
    renderPreview();
    renderHint();
    renderLog();
  }

  function renderStatus() {
    var st = app.state;
    el.turnLabel.textContent = 'ターン ' + st.turn;
    el.modeLabel.textContent = app.editMode ? 'エディット中' : (st.result === 'win' ? '勝利' : st.result === 'lose' ? '敗北' : 'プレイ中');
    el.modeLabel.classList.toggle('edit', app.editMode);
    el.btnEndTurn.disabled = app.editMode || !!st.result;
    el.btnUndo.disabled = app.history.length === 0;
    el.btnEdit.classList.toggle('active', app.editMode);
    el.btnEdit.textContent = app.editMode ? 'エディット終了' : 'エディット';
    el.playPanel.hidden = app.editMode;
    el.editPanel.hidden = !app.editMode;
  }

  function guideFor(u) {
    var c = app.guideCache;
    if (c && c.state === app.state && c.id === u.id && c.magic === u.magic) return c.map;
    var map = R.guideMap(app.state, u.id);
    // 空きマスはどの魔法でも何かができるので、薄い光は「自然のマスが変わる」所だけにする（決め手は残す）
    Object.keys(map).forEach(function (k) {
      var p = k.split(',');
      if (map[k] === 'change' && R.getTile(app.state, Number(p[0]), Number(p[1])) === 'empty') delete map[k];
    });
    app.guideCache = { state: app.state, id: u.id, magic: u.magic, map: map };
    return map;
  }

  function currentPreview() {
    if (app.editMode) return null;
    var u = sel();
    if (!u || u.cast || app.state.result) return null;
    var t = app.pending || app.hover;
    if (!t) return null;
    if (!app.pending && !wouldCastAt(t.x, t.y)) return null;
    var dir = app.pending ? (app.pendingDir || app.lastDir) : app.lastDir;
    var p = R.previewCast(app.state, u.id, t.x, t.y, dir);
    if (!p) return null;
    return { x: t.x, y: t.y, p: p, unit: u };
  }

  function unitHtml(u, st) {
    var cls = ['unit', u.side];
    if (u.id === app.selectedId) cls.push('selected');
    if (u.side === 'ally' && u.cast && !app.editMode) cls.push('done');
    if (R.isInWhirl(st, u)) cls.push('inwhirl');
    var name;
    if (u.side === 'ally') name = esc(R.magicName(u.magic));
    else name = '敵' + (R.enemiesOf(st).length > 1 ? '<small>' + esc(u.letter) + '</small>' : '');
    var flag = '';
    if (u.stuck > 0 || (u.side === 'ally' && !app.editMode && u.movesLeft === 0 && getTileAt(st, u) === 'mud')) flag = '<span class="u-flag">泥</span>';
    if (R.isInWhirl(st, u)) flag = '<span class="u-flag">渦</span>';
    return '<div class="' + cls.join(' ') + '"><span class="u-name">' + name + '</span>' +
      '<span class="u-hp">HP' + u.hp + '</span>' + flag + '</div>';
  }
  function getTileAt(st, u) { return R.getTile(st, u.x, u.y); }

  function renderBoard() {
    var st = app.state;
    var n = st.size;
    el.board.style.setProperty('--n', n);
    var u = app.editMode ? null : sel();
    var reach = (u && app.mode === 'move' && !app.pending) ? R.reachableCells(st, u.id) : {};
    var guide = (u && !u.cast && !st.result) ? guideFor(u) : {};
    var pv = currentPreview();

    var range = {}, change = {}, dmg = {}, pushTo = {};
    if (pv) {
      pv.p.finishers.forEach(function (f) { f.cells.forEach(function (c) { range[c[0] + ',' + c[1]] = true; }); });
      pv.p.tileChanges.forEach(function (c) { change[c.x + ',' + c.y] = c.to; });
      pv.p.damages.forEach(function (d) { dmg[d.x + ',' + d.y] = d; });
      pv.p.moves.forEach(function (m) { pushTo[m.to[0] + ',' + m.to[1]] = true; });
    }

    // マスの要素は盤面サイズが変わったときだけ作り直す（クリック中の要素が消えないように）
    if (cellEls.length !== n * n) {
      el.board.innerHTML = '';
      cellEls = [];
      for (var i = 0; i < n * n; i++) {
        var d = document.createElement('div');
        d.setAttribute('data-x', i % n);
        d.setAttribute('data-y', Math.floor(i / n));
        el.board.appendChild(d);
        cellEls.push({ el: d, cls: null, html: null, title: null });
      }
    }

    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var key = x + ',' + y;
        var tile = R.getTile(st, x, y);
        var cls = ['cell', 't-' + tile];
        if (reach[key]) cls.push('reach');
        if (guide[key] && !pv) cls.push('guide-' + guide[key]);
        else if (guide[key] === 'finisher') cls.push('guide-finisher');
        if (pv) {
          if (pv.x === x && pv.y === y) cls.push('pv-target');
          if (range[key]) cls.push('pv-range');
          if (change[key]) cls.push('pv-change');
        }
        if (app.flashCells[key]) cls.push('flash');
        if (app.hitCells[key]) cls.push('hit');
        var unit = R.unitAt(st, x, y);
        if (app.editMode && app.editPick && unit && unit.id === app.editPick) cls.push('picked');

        var inner = '<span class="tile-label">' + esc(R.TILE_INFO[tile].label) + '</span>';
        if (change[key]) {
          var to = change[key];
          inner += '<span class="pv-tile">→' + esc(SHORT_NAME[to]) + '</span>';
        }
        if (unit) inner += unitHtml(unit, st);
        if (dmg[key]) inner += '<span class="pv-dmg">-' + dmg[key].amount + (dmg[key].dies ? ' 倒れる' : '') + '</span>';
        if (pushTo[key]) inner += '<span class="pv-push">押→</span>';

        var title = R.tileName(tile) + (unit ? '／' + R.unitLabel(st, unit) + ' HP' + unit.hp : '');
        var c = cellEls[y * n + x];
        var clsText = cls.join(' ');
        if (c.cls !== clsText) { c.el.className = clsText; c.cls = clsText; }
        if (c.html !== inner) { c.el.innerHTML = inner; c.html = inner; }
        if (c.title !== title) { c.el.title = title; c.title = title; }
      }
    }
    renderDirPicker();
  }
  var cellEls = [];

  function renderDirPicker() {
    var p = app.pending;
    if (!p || app.editMode) { el.dirPicker.hidden = true; return; }
    var cell = el.board.querySelector('[data-x="' + p.x + '"][data-y="' + p.y + '"]');
    if (!cell) { el.dirPicker.hidden = true; return; }
    el.dirPicker.hidden = false;
    var wrapRect = el.boardWrap.getBoundingClientRect();
    var r = cell.getBoundingClientRect();
    var cx = r.left - wrapRect.left + r.width / 2;
    var cy = r.top - wrapRect.top + r.height / 2;
    var off = Math.max(r.width * 0.95, 40);
    var pos = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
    var active = app.pendingDir || app.lastDir;
    Array.prototype.forEach.call(el.dirPicker.querySelectorAll('button'), function (b) {
      var d = b.getAttribute('data-dir');
      b.style.left = (cx + pos[d][0] * off) + 'px';
      b.style.top = (cy + pos[d][1] * off) + 'px';
      b.classList.toggle('active', d === active);
    });
  }

  // サイドパネルは中身が変わったときだけ作り直す（選択中のセレクトボックスを壊さないため）
  var sideSig = '';
  function renderSide() {
    var st = app.state;
    var sig = JSON.stringify([app.editMode, app.selectedId, app.mode, app.editTool, st.units, st.enemyMoves, st.size, st.result]);
    if (sig === sideSig) return;
    sideSig = sig;
    if (app.editMode) renderEditPanel(); else renderPlayPanel();
  }

  function renderPlayPanel() {
    var st = app.state;
    var al = R.alliesOf(st);
    el.roster.innerHTML = al.length ? al.map(function (a, i) {
      var status = [];
      if (R.isInWhirl(st, a)) status.push('渦巻きの中（動けない）');
      else status.push(a.movesLeft > 0 ? '移動 残り' + a.movesLeft : '移動 なし');
      status.push(a.cast ? '魔法 済' : '魔法 まだ');
      if (a.stuck > 0) status.push('泥沼: 次のターン動けない');
      var cls = 'ally-card' + (a.id === app.selectedId ? ' selected' : '') + (a.cast ? ' done' : '');
      return '<button type="button" class="' + cls + '" data-id="' + a.id + '">' +
        '<span class="dot">' + esc(R.magicName(a.magic)) + '</span>' +
        '<span class="info"><b>' + (i + 1) + '. ' + esc(R.unitLabel(st, a)) + '　HP ' + a.hp + '/' + a.maxHp + '</b>' +
        '<span class="sub">' + esc(status.join('・')) + '</span></span></button>';
    }).join('') : '<p class="muted">味方がいません（エディットで置けます）</p>';

    var u = sel();
    el.btnModeMove.disabled = !u || !canMoveNow(u);
    el.btnModeCast.disabled = !u || u.cast || !!st.result;
    el.btnModeMove.classList.toggle('active', !!u && app.mode === 'move');
    el.btnModeCast.classList.toggle('active', !!u && app.mode === 'cast');

    var en = R.enemiesOf(st);
    var html = en.map(function (e) {
      var note = [];
      if (R.isInWhirl(st, e)) note.push('渦の中');
      if (e.stuck > 0) note.push('泥沼で1回休み');
      return '<div class="enemy-row"><span class="dot">' + esc(e.letter) + '</span><span>' + esc(e.name) + ' HP ' + e.hp + '/' + e.maxHp + '</span>' +
        '<span class="hpbar"><span style="width:' + Math.max(0, e.hp / e.maxHp * 100) + '%"></span></span>' +
        (note.length ? '<span class="muted">' + esc(note.join('・')) + '</span>' : '') + '</div>';
    }).join('');
    html += '<p class="note">敵は ' + (st.enemyMoves ? '動く' : '止まる') + ' 設定（エディットで切り替え）</p>';
    el.enemyList.innerHTML = en.length ? html : '<p class="muted">敵がいません（エディットで置けます）</p>';
  }

  function renderEditPanel() {
    var st = app.state;
    el.tilePalette.innerHTML = R.TILES.map(function (t) {
      var key = 'tile:' + t;
      return '<button type="button" class="' + (app.editTool === key ? 'active' : '') + '" data-tool="' + key + '">' +
        '<span class="swatch t-' + t + '">' + esc(R.TILE_INFO[t].label) + '</span>' + esc(R.TILE_INFO[t].name) + '</button>';
    }).join('');
    var tools = [['ally', '味方を置く'], ['enemy', '敵を置く'], ['move', '動かす'], ['remove', '消す']];
    el.unitTools.innerHTML = tools.map(function (t) {
      return '<button type="button" class="' + (app.editTool === t[0] ? 'active' : '') + '" data-tool="' + t[0] + '">' + t[1] + '</button>';
    }).join('');
    var al = R.alliesOf(st);
    el.allyMagic.innerHTML = al.length ? al.map(function (a, i) {
      return '<label>' + (i + 1) + '人目 <select data-id="' + a.id + '">' + R.MAGICS.map(function (m) {
        return '<option value="' + m + '"' + (a.magic === m ? ' selected' : '') + '>' + R.magicName(m) + '</option>';
      }).join('') + '</select> <span class="muted">(' + a.x + ',' + a.y + ')</span></label>';
    }).join('') : '<p class="muted">味方がいません</p>';
    el.enemyMoves.checked = st.enemyMoves;
    el.boardSize.value = st.size;
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
      else h.textContent = (tool === 'ally' ? '味方' : '敵') + 'を置くマスをクリック';
      return;
    }
    var u = sel();
    if (!u) { h.textContent = '味方をクリック（または 1〜3 キー）で選ぶ'; return; }
    var m = R.magicName(u.magic);
    if (app.pending) { h.textContent = '向きを選ぶ: 矢印ボタンか矢印キー（Esc でやめる）'; return; }
    if (app.mode === 'move') {
      if (u.cast) h.textContent = '緑のマスをクリックで移動（残り' + u.movesLeft + 'マス）。魔法は撃ち済み';
      else h.textContent = '緑のマスで移動（残り' + u.movesLeft + 'マス）／ほかのマスをクリックで' + m + 'の魔法／自分をクリックで魔法モード';
      return;
    }
    h.textContent = m + 'の魔法を撃つマスをクリック。薄く光る＝変化、強く光る＝決め手' +
      (u.magic === 'wind' || u.magic === 'water' ? '（向き: ' + DIR_ARROW[app.lastDir] + '、矢印キーで変更）' : '');
  }

  function renderPreview() {
    var box = el.preview;
    var pv = currentPreview();
    if (pv) {
      var p = pv.p;
      var head = '予測: ' + R.unitLabel(app.state, pv.unit) + 'の' + R.magicName(pv.unit.magic) + 'の魔法 → (' + pv.x + ',' + pv.y + ')' +
        (p.dir ? '　向き ' + DIR_ARROW[p.dir] : '');
      var lines = p.events.map(function (e) {
        var cls = e.type === 'finisher' ? 'finisher' : (e.type === 'damage' ? 'damage' : '');
        var text = e.type === 'cast' ? e.text.replace(/^.*?の魔法 → /, '') : e.text;
        return '<div class="pv-line ' + cls + '">' + esc(text) + '</div>';
      });
      p.damages.filter(function (d) { return d.dies; }).forEach(function (d) {
        lines.push('<div class="pv-line damage">' + esc(d.label) + 'は倒れる</div>');
      });
      box.innerHTML = '<div class="pv-head">' + esc(head) + '</div>' + lines.join('');
      return;
    }
    var t = app.hover;
    if (t && R.inBounds(app.state, t.x, t.y)) {
      var tile = R.getTile(app.state, t.x, t.y);
      var u = R.unitAt(app.state, t.x, t.y);
      var s = '<div class="pv-head">(' + t.x + ',' + t.y + ') ' + esc(R.tileName(tile)) + '</div><div>' + esc(TILE_DESC[tile]) + '</div>';
      if (u) {
        s += '<div class="muted">' + esc(R.unitLabel(app.state, u)) + '　HP ' + u.hp + '/' + u.maxHp +
          (u.side === 'ally' ? '　魔法: ' + esc(R.magicName(u.magic)) : '') + '</div>';
      }
      box.innerHTML = s;
      return;
    }
    box.innerHTML = '<span class="muted">マスにカーソルを乗せると、そのマスの説明や魔法の予測が出ます。</span>';
  }

  var logSig = '';
  function renderLog() {
    var last = app.log[app.log.length - 1];
    var sig = app.log.length + ':' + (last ? last.text : '');
    if (sig === logSig) return;
    logSig = sig;
    el.log.innerHTML = app.log.map(function (l) {
      return '<li class="' + esc(l.type) + '">' + esc(l.text) + '</li>';
    }).join('');
    el.log.scrollTop = el.log.scrollHeight;
  }

  // ---------------------------------------------------------------
  // 入力
  // ---------------------------------------------------------------
  function cellFrom(e) {
    var c = e.target.closest ? e.target.closest('.cell') : null;
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
      // タッチではカーソルを乗せられないので、1回目のタップで予測を出し、同じマスをもう一度タップで撃つ
      if (e.pointerType === 'touch' && !app.pending && wouldCastAt(c.x, c.y)) {
        var armed = app.touchArmed;
        if (!armed || armed.x !== c.x || armed.y !== c.y || armed.state !== app.state) {
          app.touchArmed = { x: c.x, y: c.y, state: app.state };
          app.hover = c;
          renderBoard();
          renderPreview();
          say('予測を表示中。同じマスをもう一度タップで撃つ');
          return;
        }
      }
      app.touchArmed = null;
      onPlayClick(c.x, c.y);
    }
  });
  el.board.addEventListener('pointerover', function (e) {
    var c = cellFrom(e);
    if (!c) return;
    if (app.editMode && app.stroke && (e.buttons & 1)) applyEdit(c.x, c.y, true);
    if (!app.hover || app.hover.x !== c.x || app.hover.y !== c.y) {
      app.hover = c;
      renderBoard();
      renderPreview();
    }
  });
  el.board.addEventListener('pointerleave', function () {
    app.hover = null;
    renderBoard();
    renderPreview();
  });
  window.addEventListener('pointerup', function () { app.stroke = null; });

  el.dirPicker.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b || !app.pending) return;
    doCast(app.pending.x, app.pending.y, b.getAttribute('data-dir'));
  });
  el.dirPicker.addEventListener('pointerover', function (e) {
    var b = e.target.closest('button');
    if (!b || !app.pending) return;
    var d = b.getAttribute('data-dir');
    if (app.pendingDir !== d) {
      app.pendingDir = d;
      renderBoard();
      renderPreview();
    }
  });

  el.roster.addEventListener('click', function (e) {
    var b = e.target.closest('[data-id]');
    if (b) select(b.getAttribute('data-id'));
  });
  el.btnModeMove.addEventListener('click', function () { var u = sel(); if (canMoveNow(u)) { app.mode = 'move'; app.pending = null; render(); } });
  el.btnModeCast.addEventListener('click', function () { var u = sel(); if (u && !u.cast) { app.mode = 'cast'; render(); } });

  el.btnEndTurn.addEventListener('click', doEndTurn);
  el.btnUndo.addEventListener('click', undo);
  el.btnReset.addEventListener('click', reset);
  el.btnEdit.addEventListener('click', function () { setEditMode(!app.editMode); });
  el.btnEditDone.addEventListener('click', function () { setEditMode(false); });

  function onToolClick(e) {
    var b = e.target.closest('[data-tool]');
    if (!b) return;
    app.editTool = b.getAttribute('data-tool');
    app.editPick = null;
    render();
  }
  el.tilePalette.addEventListener('click', onToolClick);
  el.unitTools.addEventListener('click', onToolClick);
  el.allyMagic.addEventListener('change', function (e) {
    var s = e.target.closest('select');
    if (!s) return;
    var res = R.editSetMagic(app.state, s.getAttribute('data-id'), s.value);
    if (res.ok) { pushHistory(); app.state = res.state; render(); }
  });
  el.enemyMoves.addEventListener('change', function () {
    var res = R.editSetEnemyMoves(app.state, el.enemyMoves.checked);
    pushHistory();
    app.state = res.state;
    render();
  });
  el.btnResize.addEventListener('click', function () {
    var res = R.editResize(app.state, el.boardSize.value);
    pushHistory();
    app.state = res.state;
    say('盤面を ' + res.state.size + '×' + res.state.size + ' にしました');
    render();
  });
  el.btnClearTiles.addEventListener('click', function () {
    var s = R.clone(app.state);
    for (var i = 0; i < s.tiles.length; i++) s.tiles[i] = 'empty';
    pushHistory();
    app.state = s;
    render();
  });

  document.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    var onButton = tag === 'BUTTON';
    var k = e.key;

    if ((k === 'z' || k === 'Z') && !e.altKey) { e.preventDefault(); undo(); return; }
    if (k === 'e' || k === 'E') { setEditMode(!app.editMode); return; }
    if (app.editMode) {
      if (k === 'Escape') { app.editPick = null; render(); }
      return;
    }
    if (KEY_DIR[k]) {
      e.preventDefault();
      var d = KEY_DIR[k];
      if (app.pending) { doCast(app.pending.x, app.pending.y, d); return; }
      app.lastDir = d;
      render();
      return;
    }
    if (k === 'Escape') {
      if (app.pending) { app.pending = null; render(); } else deselect();
      return;
    }
    if (k === 'Enter' && !onButton) { e.preventDefault(); doEndTurn(); return; }
    if (k >= '1' && k <= '9') {
      var al = R.alliesOf(app.state);
      var a = al[Number(k) - 1];
      if (a) select(a.id);
      return;
    }
    if (k === 'm' || k === 'M') { var u = sel(); if (canMoveNow(u)) { app.mode = 'move'; app.pending = null; render(); } return; }
    if (k === 'c' || k === 'C' || (k === ' ' && !onButton)) {
      e.preventDefault();
      var v = sel();
      if (v && !v.cast) { app.mode = 'cast'; render(); }
      return;
    }
  });

  window.addEventListener('resize', renderDirPicker);

  // デバッグ・確認用（コンソールから状態を見られる）
  window.CafiliaApp = app;
  app.render = render;

  addLog('ようこそ。味方をクリックして選び、魔法を撃ってください', 'system');
  render();
})();
