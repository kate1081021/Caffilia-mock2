/*
 * ui.js — 描画と入力（v2）
 * ルールの処理は全部 rules.js（Rules）に任せる。ここでは状態を差し替えて描き直すだけ。
 */
(function () {
  'use strict';

  var R = window.Rules;
  var B = window.BALANCE;

  // 【一斉】画面に出す文（texts.js）。文章パネルで書き換えられるので、使うたびに読む
  function TX() { return window.TEXTS || {}; }
  function ui(k, fallback) { var u = TX().ui || {}; return u[k] !== undefined && u[k] !== '' ? u[k] : (fallback || ''); }
  function finName(n) { var f = TX().finishers || {}; return f[n] || n; }
  function stageTexts(id) { var st = TX().stages || {}; return (id && st[id]) || null; }
  function stageName(p) { var t = p && stageTexts(p.id); return (t && t.name) || (p && (p.short || p.name)) || ''; }
  // 行の「ターンの形」の指定が今の形に合うか（both / simul / single）
  function modeOk(line) { var m = (line && line.mode) || 'both'; return m === 'both' || m === (simul() ? 'simul' : 'single'); }

  // 展示モード（mode.js。URL に印がないとき）: 遊ぶのに要るものだけを出す。隠すのは style.css、キーと進み方はここ
  // 開発モード（#dev）: 展示と同じ決まり・同じ見え方に、エディット・テストプレイ・自分のステージを足す。開くとエディットから
  //   どちらのモードも、ターンの形は一斉（③も「つながる」）、数値は balance.js の値のまま。
  //   調整パネル・ターンの形・魔法の出し方の切り替えなどは IMPROVE_v3 段1（オーナー 10/30）でアーカイブした（archive/開発モード_20261030/）
  var EXHIBIT = window.CAFILIA_MODE === 'exhibit';
  var EXHIBIT_STAGES = ['tut1', 'tut2', 'ex3'];   // チュートリアル①②③（展示の並びの初めの形）
  var EXHIBIT_NEXT_MS = 2200;                     // クリアしてから次のステージを読むまでの間（会話の窓が出ていれば、閉じてから）

  // 展示ステージ③（s.ex）: 画面の見せ方（ミッション）
  function exOf(st) { st = st || app.state; return (st && st.ex) || null; }
  // 予測は魔法が届く形だけ（balance.js の preview.shapeOnly。前は展示ステージ③だけ、10/29 からどのシナリオでも）
  function shapeOnly() { return !!(B.preview && B.preview.shapeOnly) && !app.editMode; }

  // 【一斉】ターンの形は一斉（構えて、ターンの終わりに一斉に発動）。rules.js の初期値は、テストのために「1人ずつ」
  function simul() { return B.turnMode === 'simul'; }
  B.turnMode = 'simul';

  var DIR_ARROW = { up: '↑', right: '→', down: '↓', left: '←' };
  var DIR_ROT = { up: 0, right: 90, down: 180, left: 270 };
  var ORDER_MARK = ['', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];   // 【一斉】発動の順番
  var KEY_DIR = { ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down', ArrowLeft: 'left' };
  var SHORT = { empty: '空き', forest: '森', mountain: '山', river: '川', fire: '炎', smallfire: '小炎', volcano: '火山', mud: '泥沼', puddle: '水たまり', mirage: '蜃気楼', ice: '氷', lava: '溶岩', whirlwind: 'つむじ風', tornado: '竜巻', breeze: '風', firewhirl: '火の渦', sakura: '桜', petals: '花びら', deadforest: '死の森', haunted: 'オバケヤシキ', hill: '丘', thicket: '草むら', gale: '強風', hillsakura: '丘の桜' };
  Object.keys(R.TILE_INFO).forEach(function (t) { if (!SHORT[t]) SHORT[t] = R.TILE_INFO[t].name; });
  var STORE_KEY = 'cafilia-mock-v2-layouts';   // 前の保存（配置だけ。R.exportLayout の JSON）。段0で自分のステージに移した（元は消さずに残す）
  // エディットで作ったステージ（オーナー 10/30）。中身は stages_io.js（チュートリアルと同じ形の定義＋会話の窓の文）
  var SIO = window.StagesIO;
  var STAGE_KEY = 'cafilia-mock-stages-v1';       // 自分のステージ { 名前: { def, texts, exKeep, at } }。直すたびに自動で残す（IMPROVE_v3 段0）
  var DRAFT_KEY = 'cafilia-mock-stage-draft';     // 前の作りかけ { cur, prev }。段0で自分のステージに移した（元は消さずに残す）
  var MIGRATED_KEY = 'cafilia-mock-stages-migrated';   // 前の作りかけ・前の保存を移したしるし { at, moved, failed }
  // 【育つ】つながると1枚の大きな絵になる自然（名前は見た目だけ）
  var BIG = {
    forest: { cls: 'woods', name: '大森林', mark: '🌲' },
    puddle: { cls: 'lake', name: '湖', mark: '〜' },
    ice: { cls: 'icefield', name: '氷原', mark: '❄' },
    deadforest: { cls: 'deadwoods', name: '死の森', mark: '🥀' }
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
    plan: null,           // 選んでいる味方の予定 { to: [x,y], dir, from: [x,y] }（plans の中の1つ）
    plans: {},            // 味方ごとの移動の予定 { id: { to, dir, from } }。ほかの味方を選んでも捨てない（オーナー 10/30）。撃つ・構える・待機で消える
    busy: false,          // 演出を再生中
    playback: null,
    editMode: false,
    editTool: 'pick',
    editPick: null,
    stroke: null,
    // エディットとテストプレイ（オーナー 10/30）
    draft: null,          // 作っているステージ { state（遊び始める前の盤面）, name, key（自分のステージに残している名前）, texts（会話の窓の文）, exKeep（外したボスの決まり）, playId }
    editHist: [],         // エディットの「1手戻す」の履歴。テストプレイの履歴とは分けて、エディットに戻ると続きから戻せる
    layout0: null,        // 今のシナリオの遊び始める前の盤面（テストプレイ中でないときに E を押すと、ここから作り始める）
    home: false,          // 開発モードの最初の画面（ステージの一覧）を出している（IMPROVE_v3 段2）
    homeView: 'list',     // 最初の画面のどれを出しているか（開発: list・lineup／展示: title・pick・thanks・clear）
    run: null,            // 展示モードで遊んでいる並び { kind: start（はじめから）か pick（選んで）, list, i }（IMPROVE_v3 段3）
    lineupDraft: null,    // 開発モードの「展示の並び」で並べ替え中の並び（「この並びで展示する」まで展示は変えない）
    flash: {},
    hl: {},
    message: null,
    scenario: '',
    cache: {}
  };
  app.resetPoint = R.clone(app.state);

  var $ = function (id) { return document.getElementById(id); };
  var el = {};
  ['board', 'boardWrap', 'fx', 'banner', 'hint', 'turnLabel', 'modeLabel',
    'btnEndTurn', 'btnUndo', 'btnReset', 'btnEdit', 'playPanel', 'editPanel', 'roster', 'actPanel', 'actInfo',
    'dirCenter', 'btnStay', 'btnShoot', 'btnWait', 'enemyList', 'tilePalette', 'unitTools', 'unitList',
    'enemyStill', 'boardW', 'boardH', 'btnResize', 'btnClearTiles', 'saveName', 'btnDownload', 'fileInput', 'btnHome', 'home',
    'btnEditDone', 'btnTestPlay', 'winSelect', 'winTurns', 'winTurnsLabel', 'winNote', 'txStart', 'txWin', 'txLose', 'txHintSimul', 'txHintSingle',
    'missionBar', 'missionTools', 'btnRetry', 'btnSealWin', 'stageHint',
    'orderPanel', 'btnHowto', 'howto', 'howtoTitle', 'howtoList', 'howtoClose'].forEach(function (id) { el[id] = $(id); });

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
  // エディット中は、作っているステージの名前・会話の文も一緒に覚える（読み込みや文の書き換えも1つ戻せる）
  function pushHistory() {
    app.history.push({ state: app.state, logLen: app.log.length, meta: app.editMode && app.draft ? draftMeta() : null });
    if (app.history.length > 500) app.history.shift();
  }
  function addLog(text, type) { app.log.push({ text: text, type: type || 'system' }); }

  // 戦闘を始める: 遊び始めの状態にそろえ、敵の移動と予告まで済ませる（ログにも出す）
  function begin(s) {
    var r = R.startBattle(s);
    r.events.forEach(function (e) { if (e.text) addLog(e.text, logType(e)); });
    return r.state;
  }

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

  function showBanner(text, sub) {
    el.banner.innerHTML = (sub ? '<span class="banner-sub">' + esc(sub) + '</span>' : '') + '<span class="banner-main">' + esc(text) + '</span>';
    el.banner.classList.toggle('combo', !!sub);
    el.banner.classList.remove('show');
    void el.banner.offsetWidth;
    el.banner.classList.add('show');
  }
  // 【一斉】合体した味方の魔法の名前（「土・草・風」）
  function comboText(e) { return ui('combo', '合体！') + ' ' + (e.comboMagics || []).map(function (m) { return m ? R.magicName(m) : '？'; }).join('・'); }

  // 【新案】感電: つながった水の上で⚡が瞬く
  function fxSparks(cells) {
    cells.forEach(function (c, i) {
      var p = cellCenter(c[0], c[1]);
      if (!p) return;
      var d = document.createElement('div');
      d.className = 'zap';
      d.textContent = '⚡';
      d.style.left = p.x + 'px';
      d.style.top = p.y + 'px';
      d.style.animationDelay = (i * 35) + 'ms';
      el.fx.appendChild(d);
      setTimeout(function () { d.remove(); }, 1200 + i * 35);
    });
  }

  // 【新案】桜吹雪: 火山から扇形のマスへ、花びらと火の粉が舞う
  function fxPetals(origin, cells, pink) {
    var o = cellCenter(origin[0], origin[1]);
    if (!o) return;
    cells.forEach(function (c, i) {
      var p = cellCenter(c[0], c[1]);
      if (!p) return;
      for (var k = 0; k < 3; k++) {
        var d = document.createElement('div');
        d.className = 'petal' + (!pink && (i + k) % 3 === 0 ? ' ember' : '');
        d.style.left = o.x + 'px';
        d.style.top = o.y + 'px';
        var jx = ((i * 7 + k * 13) % 21) - 10, jy = ((i * 11 + k * 5) % 21) - 10;
        d.style.setProperty('--dx', (p.x - o.x + jx) + 'px');
        d.style.setProperty('--dy', (p.y - o.y + jy) + 'px');
        d.style.setProperty('--rot', ((i * 47 + k * 83) % 360) + 'deg');
        d.style.animationDelay = (i * 45 + k * 70) + 'ms';
        el.fx.appendChild(d);
        (function (node, wait) { setTimeout(function () { node.remove(); }, wait); })(d, 1600 + i * 45 + k * 70);
      }
    });
  }

  // 【新案】渦: 中心のまわりで輪が回る
  function fxVortex(center) {
    var p = cellCenter(center[0], center[1]);
    var c = cellEls[0];
    if (!p || !c) return;
    var size = c.el.getBoundingClientRect().width * 3.2;
    var d = document.createElement('div');
    d.className = 'vortex';
    d.style.left = p.x + 'px';
    d.style.top = p.y + 'px';
    d.style.width = size + 'px';
    d.style.height = size + 'px';
    el.fx.appendChild(d);
    setTimeout(function () { d.remove(); }, 1300);
  }

  // 【新案】竜巻の決め手: 竜巻のまわりで大きな輪が回る
  function fxSpin(center, fiery, cellsWide, dark) {
    var c0 = cellEls[0];
    if (!c0) return;
    var a = cellCenter(Math.floor(center[0]), Math.floor(center[1]));
    var b = cellCenter(Math.ceil(center[0]), Math.ceil(center[1]));
    if (!a || !b) return;
    var size = c0.el.getBoundingClientRect().width * (cellsWide || 4.3);
    var d = document.createElement('div');
    d.className = 'vortex' + (fiery ? ' fiery' : '') + (dark ? ' dark' : '');
    d.style.left = (a.x + b.x) / 2 + 'px';
    d.style.top = (a.y + b.y) / 2 + 'px';
    d.style.width = size + 'px';
    d.style.height = size + 'px';
    el.fx.appendChild(d);
    setTimeout(function () { d.remove(); }, 1300);
  }

  // 【新案】噴火: 火が点いた山から、山脈とまわりへ溶岩の光が波のように走る
  function fxFunka(cells, wave) {
    cells.forEach(function (c, i) {
      var p = cellCenter(c[0], c[1]);
      if (!p) return;
      var d = document.createElement('div');
      d.className = 'blast';
      d.style.left = p.x + 'px';
      d.style.top = p.y + 'px';
      d.style.animationDelay = ((wave && wave[i]) || 0) * 90 + 'ms';
      el.fx.appendChild(d);
      setTimeout(function () { d.remove(); }, 1400 + ((wave && wave[i]) || 0) * 90);
    });
  }

  // 【新案】凍結: 冷気が触れた所から、つながった水へ氷が波のように走る
  function fxFreeze(cells, wave) {
    cells.forEach(function (c, i) {
      var p = cellCenter(c[0], c[1]);
      if (!p) return;
      var d = document.createElement('div');
      d.className = 'frost';
      d.textContent = '❄';
      d.style.left = p.x + 'px';
      d.style.top = p.y + 'px';
      d.style.animationDelay = ((wave && wave[i]) || 0) * 70 + 'ms';
      el.fx.appendChild(d);
      setTimeout(function () { d.remove(); }, 1300 + ((wave && wave[i]) || 0) * 70);
    });
  }

  // 【一斉】構えの発動: 当たったマスに「①火」の札を浮かべる（構えの印と同じ形。外れても、どこに当たったかが見える）
  function fxStance(e) {
    var label = (ORDER_MARK[e.order] || e.order) + R.magicName(e.magic);
    (e.cells || []).forEach(function (c, i) {
      var p = cellCenter(c[0], c[1]);
      if (!p) return;
      var d = document.createElement('div');
      d.className = 'cast-mark';
      d.textContent = label;
      d.style.left = p.x + 'px';
      d.style.top = p.y + 'px';
      d.style.animationDelay = (i * 40) + 'ms';
      el.fx.appendChild(d);
      setTimeout(function () { d.remove(); }, 1500 + i * 40);
    });
  }

  // 【育つ】育つ瞬間: 元のマスから育つ先へ、順に盛り上がって見せる
  function fxGrow(g) {
    g.cells.forEach(function (c, i) {
      var p = cellCenter(c[0], c[1]);
      if (!p) return;
      var d = document.createElement('div');
      d.className = 'rise ' + ((g.tiles && g.tiles[i]) || g.tile);
      d.style.left = p.x + 'px';
      d.style.top = p.y + 'px';
      d.style.animationDelay = (g.wave[i] || 0) * 80 + 'ms';
      el.fx.appendChild(d);
      setTimeout(function () { d.remove(); }, 1100 + (g.wave[i] || 0) * 80);
    });
  }

  // 展示ステージ③: ミッションの名前（texts.js の stages.ex3.missions）
  function exMissionName(id) {
    var stx = stageTexts(app.state && app.state.stage), m = ((exOf() || {}).missions || []).filter(function (x) { return x.id === id; })[0];
    return (stx && stx.missions && stx.missions[id]) || (m && m.name) || id;
  }

  // 出来事をログに足し、演出を出す
  function showEvents(events, animate) {
    var hl = {}, flash = {}, finishers = [], combo = null;
    var exNow = !!exOf();
    events.forEach(function (e) {
      addLog((e.combo ? '【' + comboText(e) + '】' : '') + e.text, logType(e));
      if (app.onEvent) app.onEvent(e);   // 文章（きっかけ: 決め手・敵の予告・展示③のヒントとミッションなど）
      // 展示ステージ③: 山に火で火山（2段目のシナジー）も、決め手と同じく名前を出す
      var synergy = e.type === 'finisher' || (exNow && e.type === 'kindle' && e.made === 'volcano');
      var sName = e.type === 'finisher' ? e.name : '火山';
      if (synergy && app.chain) { app.chain.push(finName(sName)); if (e.combo) app.chainCombo = comboText(e); }
      if (e.combo) combo = comboText(e);
      if (!animate) return;
      if (exNow && e.type === 'kindle' && e.made === 'volcano') { finishers.push('火山'); (e.cells || []).forEach(function (c) { flash[key(c[0], c[1])] = true; }); }
      if (e.type === 'cast' || e.type === 'fireSpread' || e.type === 'smallfireOut' || e.type === 'burnOut' || e.type === 'vortex' || e.type === 'tornado' || e.type === 'kindle') {
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
      // 【一斉】発動の流れの中で続けて起きた決め手は、名前をつないで出す（「燃え広がり → オバケヤシキ！」）。合体なら上に「合体！ 土・草・風」
      if (app.chain) showBanner(app.chain.join(ui('chain', ' → ')) + '！', app.chainCombo || combo);
      else showBanner(finishers.map(finName).join('・') + '！');
      app.flash = flash;
      clearTimeout(showEvents.timer);
      showEvents.timer = setTimeout(function () { app.flash = {}; renderBoard(false); }, 950);
    }
    // ダメージ数字は描き直したあとの位置に出す
    setTimeout(function () {
      events.forEach(function (e) {
        if (e.type !== 'finisher') return;
        if (e.name === '感電') fxSparks(e.cells || []);
        if (e.name === '凍結') fxFreeze(e.cells || [], e.wave);
        if (e.name === '噴火') fxFunka(e.cells || [], e.wave);
        if ((e.name === 'センタクキ' || e.name === '火炎竜巻') && e.center) fxSpin(e.center, e.name === '火炎竜巻');
        if (e.name === '火の渦' && e.center) fxSpin(e.center, true, 2.4);
        if (e.name === 'オバケヤシキ' && e.center) fxSpin(e.center, false, 3.2, true);
        if (e.name === '桜吹雪' && e.origin && !exNow) fxPetals(e.origin, e.cells || [], e.pink);   // 展示ステージ③では舞わせない（オーナー 10/17。盤面に花びらが積もるだけ）
      });
      events.forEach(function (e) { if (e.type === 'vortex' && e.center) fxVortex(e.center); });
      events.forEach(function (e) { if (e.type === 'cast' && e.order) fxStance(e); });   // 【一斉】発動した構えが、どのマスに当たったか
      if (B.fx.grow) events.forEach(function (e) { (e.grows || []).forEach(fxGrow); });
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
    var st = pb.steps[pb.i];
    var ex = exOf(st.state);
    pb.i++;
    app.state = st.state;
    showEvents(st.events, true);
    render(true);
    // 【一斉】構えの発動は1人ずつ間をあけて見せる
    var stance = st.events.some(function (e) { return e.type === 'cast' && e.order; });
    var wait = stance ? ((B.simul && B.simul.fireDelayMs) || 900) : B.stepDelayMs;
    if (st.events.every(function (e) { return e.type === 'stance'; })) wait = 120;   // 構えただけ（まだ何も起きない）は、すぐ次へ
    // 展示ステージ③: シナジー（火山・決め手）が起きたら、少し間を取る
    if (ex && st.events.some(function (e) { return e.type === 'finisher' || (e.type === 'kindle' && e.made === 'volcano') || e.type === 'mission'; })) wait += B.stage3.synergyPauseMs;
    pb.timer = setTimeout(nextStep, wait);
  }
  function finishPlayback() {
    var pb = app.playback;
    if (!pb) return;
    clearTimeout(pb.timer);
    app.playback = null;
    app.busy = false;
    app.state = pb.final;
    app.hl = {};
    app.chain = null; app.chainCombo = null;
    render(true);
    if (pb.done) pb.done();
    exAfterPlayback();
    exhibitAfterPlayback();
  }
  // 展示モード: ステージをクリアしたら、少し見せてから次へ（会話の窓が出ていれば、閉じてから）（IMPROVE_v3 段3）
  //   はじめから遊ぶ: 並びの次のステージへ。最後のあとは「ありがとう！」。選んで遊ぶ: 「クリア！」
  function exhibitAfterPlayback() {
    var st = app.state, run = app.run;
    if (!EXHIBIT || app.editMode || st.result !== 'win' || !run) return;
    clearTimeout(exhibitAfterPlayback.timer);
    exhibitAfterPlayback.timer = setTimeout(function () {
      var go = function () {
        if (app.state !== st || app.busy || app.editMode || app.run !== run) return;   // 待っている間に1手戻した・ほかを読んだ
        if (run.kind === 'start' && run.i + 1 < run.list.length) exhibitPlay('start', run.list, run.i + 1);
        else exhibitScreen(run.kind === 'start' ? 'thanks' : 'clear');
      };
      if (app.afterDialog) app.afterDialog(go); else go();
    }, EXHIBIT_NEXT_MS);
  }
  // 展示ステージ③: 決着のあと。味方が倒れたら少し見せてからステージの頭からやり直す
  function exAfterPlayback() {
    var ex = exOf(), st = app.state;
    if (!ex || app.editMode || !st.result) return;
    if (st.result === 'lose') {
      clearTimeout(exAfterPlayback.timer);
      exAfterPlayback.timer = setTimeout(function () {
        if (app.state === st && !app.busy && !app.editMode) retry();
      }, B.stage3.retryDelayMs);
    }
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
    return u && (!u.acted || R.restancing(u)) ? u : null;   // 【一斉】構えた味方は、発動の前なら構え直せる
  }
  function canControl() { return !app.busy && !app.editMode && !app.state.result; }

  // 移動の予定（オーナー 10/30）: 移動先を決めただけで撃っていない味方の予定は、ほかの味方を選んでも味方ごとに残る。
  //   選び直すと予定の続きから（向き・撃つ・構える・待機）。移動先を選び直すときの届く範囲は、元の位置から数える。
  //   ほかの味方の予定の移動先には止まれない。予定が今の盤面で成り立たなくなったら（元の位置から動かされた・移動先へ届かない）、その予定は捨てる
  function planOf(u) {
    var p = u && app.plans[u.id];
    if (!p) return null;
    var ok = !u.acted && p.from[0] === u.x && p.from[1] === u.y &&
      ((p.to[0] === u.x && p.to[1] === u.y) || R.reachableCells(app.state, u.id)[key(p.to[0], p.to[1])] !== undefined);
    if (!ok) { delete app.plans[u.id]; return null; }
    return p;
  }
  // ほかの味方の予定の移動先 { "x,y": 味方 }（元の位置から動く予定だけ）
  function otherPlanTo(exceptId) {
    var out = {};
    R.controllableOf(app.state).forEach(function (a) {
      if (a.id === exceptId) return;
      var p = planOf(a);
      if (p && (p.to[0] !== a.x || p.to[1] !== a.y)) out[key(p.to[0], p.to[1])] = a;
    });
    return out;
  }
  // 選んでいる味方が止まれるマス（ほかの味方の予定の移動先は除く）
  function reachOf(u) {
    var reach = R.reachableCells(app.state, u.id), taken = otherPlanTo(u.id), out = {};
    Object.keys(reach).forEach(function (k) { if (!taken[k]) out[k] = reach[k]; });
    return out;
  }
  function clearPlans() { app.plans = {}; app.plan = null; }

  function select(id) {
    var u = R.findUnit(app.state, id);
    if (!u || u.side !== 'ally' || u.npc) return;   // 構える味方は選べない
    if (u.acted && !R.restancing(u)) { say(R.unitLabel(app.state, u) + 'はもう行動しました'); return; }   // 【一斉】構えた味方は構え直せる
    app.sel = id;
    app.plan = planOf(u) || { to: [u.x, u.y], dir: u.facing, from: [u.x, u.y] };
    if (!u.acted) app.plans[id] = app.plan;
    render();
  }
  function deselect() { app.sel = null; app.plan = null; render(); }

  function selectNext(afterId) {
    if (app.state.result) { app.sel = null; app.plan = null; render(); return; }
    var al = R.controllableOf(app.state);
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
    var taken = otherPlanTo(u.id)[key(app.plan.to[0], app.plan.to[1])];
    if (taken) { say(R.unitLabel(app.state, taken) + 'の移動先の予定です（そこには止まれません）'); return; }
    var opts = { to: app.plan.to, dir: app.plan.dir, shoot: shoot };
    var res = R.act(app.state, u.id, opts);
    if (!res.ok) { say(res.error); return; }
    pushHistory();
    var id = u.id;
    app.sel = null; app.plan = null;
    delete app.plans[id];
    if (app.onAct) app.onAct(u, shoot !== false);   // 文章（きっかけ: 構えたとき）
    play(res.steps, res.state, function () {
      if (simul()) { if (!app.state.result) selectNext(id); return; }   // 【一斉】全員構えても、発動はボタンで
      if (!app.state.result && R.allAlliesActed(app.state)) {
        if (R.sealReady(app.state)) { selectNext(id); return; }   // ステージ②: ふさぎきったら、ターン終了は回さずに「クリアする」を待つ（続けるなら T）
        addLog(R.controllableOf(app.state).length === 3 ? '3人とも行動したので、ターン終了' : '全員行動したので、ターン終了', 'system');
        runEndTurn();
      } else {
        selectNext(id);
      }
    });
  }

  // ターン終了（1人ずつ）・発動（一斉）。発動の前の文章があれば、読み終えてから
  function runEndTurn() {
    if (app.fireWaiting) return;   // 発動の前の文を読んでいる間に、もう一度押しても重ねて発動しない
    var s0 = app.state;
    app.fireWaiting = true;
    var go = function () {
      app.fireWaiting = false;
      if (app.state !== s0) return;   // 読んでいる間に盤面が変わった（1手戻す・読み直し）なら発動しない
      var t = R.endTurn(app.state);
      if (!t.ok) { say(t.error); return; }
      clearPlans();   // ターンが終わったら、撃たなかった味方の予定も消える
      if (simul()) { app.chain = []; app.chainCombo = null; }
      play(t.steps, t.state, function () {
        if (R.sealReady(app.state)) { app.sel = null; app.plan = null; render(); }   // ステージ②: ふさぎきったら味方を選ばず、「クリアする」の案内を出す
        else selectNext(null);
      });
    };
    if (app.onBeforeFire) app.onBeforeFire(go); else go();
  }

  // ステージ②: 村への道をふさぎきったら、押して（C）クリア
  function doSealWin() {
    if (!canControl() || !R.sealReady(app.state)) return;
    var r = R.claimSeal(app.state);
    if (!r.ok) { say(r.error); return; }
    pushHistory();
    app.sel = null; clearPlans();
    play(r.steps, r.state, function () { render(); });
  }

  function doEndTurn() {
    if (app.busy || app.editMode || app.fireWaiting) return;
    if (app.state.result) { say('勝負はついています。「1手戻す」か「リセット」で続けられます'); return; }
    // 【一斉】発動は、動かせる味方が全員構え終えて（か待機して）から
    if (simul() && !R.allAlliesActed(app.state) && R.controllableOf(app.state).length) { say(ui('notReady', 'まだ構えていない味方がいます（構えるか「待機」）')); return; }
    pushHistory();
    app.sel = null; app.plan = null;
    runEndTurn();
  }

  // 【一斉】発動の順番を並べ替える（▲▼）
  function reorder(id, delta) {
    if (!canControl() || !simul()) return;
    var res = R.reorderStance(app.state, id, delta);
    if (!res.ok) { say(res.error); return; }
    pushHistory();
    app.state = res.state;
    res.events.forEach(function (e) { addLog(e.text, 'event'); });
    render();
  }

  function undo() {
    if (app.busy) skipPlayback();
    var h = app.history.pop();
    if (!h) { say('これ以上戻せません'); return; }
    app.state = h.state;
    if (app.editMode) { if (h.meta) setDraftMeta(h.meta); }   // エディット: ログは消さない（あいだのテストプレイのログが残る）
    else app.log.length = h.logLen;
    app.sel = null; app.plan = null;
    if (!app.editMode) app.editPick = null;   // エディット: 選んでいた駒は、戻したあともいれば選んだまま
    render();
  }

  function setState(s, logText) {
    pushHistory();
    app.state = s;
    app.sel = null; clearPlans(); app.editPick = null;
    if (logText) addLog(logText, 'system');
    render();
  }

  function reset() {
    if (app.editMode) return;   // エディット中の盤面は「1手戻す」で戻す（リセットはテストプレイの始めに戻すもの）
    if (app.busy) skipPlayback();
    setState(R.clone(app.resetPoint), 'リセット（最初の配置に戻した）');
    if (isTutorial()) selectNext(null);
    if (app.onStage) app.onStage('start');
  }

  // チュートリアル: 負けたあと、ステージを最初から始め直す（やり直した回数が増え、ヒントが出る）
  function retry() {
    if (app.busy) skipPlayback();
    var r = R.retryStage(app.state);
    if (!r) return;
    addLog('やり直す（' + (r.state.tries + 1) + '回目）', 'system');
    r.events.forEach(function (e) { if (e.text) addLog(e.text, logType(e)); });
    setState(r.state);
    app.resetPoint = R.clone(app.state);
    selectNext(null);
    if (app.onStage) app.onStage('retry');   // 文章（きっかけ: やり直し）
  }

  // エディット ⇄ テストプレイ（オーナー 10/30。E かボタン1つで行き来する）
  //   エディットに入る: テストプレイ中なら、作っていた盤面（app.draft）にそのまま戻る。そうでなければ、今のシナリオの遊び始める前の盤面から作り始める
  //   エディットを抜ける: その盤面をステージとして読み込んで遊ぶ（チュートリアルを読むのと同じ道。ルールも同じ）
  function setEditMode(on) {
    if (app.busy) skipPlayback();
    if (on === app.editMode) return;
    app.sel = null; clearPlans(); app.editPick = null;
    if (on) {
      var back = testing();
      if (!back) startDraft(draftFromScenario());
      if (app.closeDialog) app.closeDialog();
      app.editMode = true;
      app.history = app.editHist;
      app.state = R.clone(app.draft.state);
      addLog(back ? 'エディットに戻った（「' + app.draft.name + '」）' : app.draft.key ? 'エディット開始（自分のステージ「' + app.draft.name + '」を開いた）' : 'エディット開始（「' + app.draft.name + '」を作る。自分のステージに自動で残る）', 'system');
      render();
    } else {
      app.draft.state = R.clone(app.state);
      app.editHist = app.history;
      app.history = [];   // 読み込みの setState がエディットの履歴に積まないように
      app.editMode = false;
      keepDraft();
      testPlay();
    }
  }
  function testing() { return !app.editMode && !!app.draft && !!app.draft.playId && app.scenario === app.draft.playId; }

  // 作っているステージ（app.draft）の名前・文。「1手戻す」で戻すために覚える
  function draftMeta() { var d = app.draft; return { name: d.name, texts: SIO.clone(d.texts), exKeep: SIO.clone(d.exKeep) }; }
  function setDraftMeta(m) { app.draft.name = m.name; app.draft.texts = SIO.clone(m.texts); app.draft.exKeep = SIO.clone(m.exKeep); }
  function fillTexts(t, name) {
    t = t ? SIO.clone(t) : SIO.blankTexts(name);
    t.name = name;
    t.hint = t.hint && typeof t.hint === 'object' ? t.hint : { simul: t.hint || '', single: t.hint || '' };
    t.scenes = t.scenes || {};
    ['start', 'win', 'lose'].forEach(function (k) { if (!t.scenes[k]) t.scenes[k] = []; });
    return t;
  }
  // 今のシナリオから作り始める。チュートリアル①②③などは写し（「〜のコピー」）を作る（元のチュートリアルと texts.js は書き換えない）
  //   自分のステージを遊んでいるときは、写しではなく、その自分のステージを開く
  function draftFromScenario() {
    var id = app.scenario, p = id ? R.findPreset(id) : null;
    var own = p && p.custom ? draftFromRecord(p.name, (stageStore() || {})[p.name]) : null;
    if (own) return own;
    var s = app.layout0 ? R.clone(app.layout0) : R.normalizeForPlay(app.state);
    delete s.stage; delete s.tries;
    var T = TX().stages || {};
    var name = p && p.custom ? p.name : (p ? (p.tutorial ? stageName(p) : p.name) : '標準') + 'のコピー';
    return { state: s, name: name, texts: fillTexts(p && T[p.id], name), exKeep: null };
  }

  // 自分のステージ（オーナー 10/30、IMPROVE_v3 段0）: 保存ボタンはなく、直すたびにこのブラウザに自動で残す（STAGE_KEY）。
  //   作り始めた時点で自分のステージが1つ増える。名前が重なるときは番号を付ける（「新しいステージ（2）」）。
  //   app.draft.key は、ストアに残している名前。名前を変えたら、次に残すときに付け替える
  function uniqueName(name, stages) {
    stages = stages || stageStore() || {};
    if (!stages[name]) return name;
    for (var i = 2; ; i++) if (!stages[name + '（' + i + '）']) return name + '（' + i + '）';
  }
  // ストアの1件から、作っている盤面を作る（読めなければ null）
  function draftFromRecord(name, rec) {
    var b = rec && SIO.build(R, rec.def);
    if (!b || !b.ok) return null;
    delete b.state.stage;
    return { state: b.state, name: name, key: name, texts: fillTexts(rec.texts, name), exKeep: rec.exKeep || null };
  }
  // 作るステージを d に替える。それまでのステージは自分のステージに残っている。新しく増えるものは名前が重ならないようにする
  function startDraft(d) {
    if (app.draft) keepDraft();
    if (!d.key) d.name = uniqueName(d.name);
    d.texts = fillTexts(d.texts, d.name);
    keepDraft.last = null;
    app.draft = d;
    app.editHist = [];
  }
  // エディットの中で、別の自分のステージを開く・新しく作る（「1手戻す」は、そのステージの中だけ）。label は文か、名前を受け取る関数
  function openDraft(d, label) {
    startDraft(d);
    app.history = app.editHist;
    app.state = R.clone(d.state);
    app.editPick = null;
    keepDraft();
    label = typeof label === 'function' ? label(d.name) : label;
    addLog(label, 'system');
    say(label);
    render();
  }
  function draftRecord() {
    var d = app.draft, s = app.editMode ? app.state : d.state;
    return { def: SIO.toDef(R, s, d.name), texts: d.texts, exKeep: d.exKeep || null };
  }
  function keepDraft() {
    var d = app.draft;
    if (!d) return;
    if (d.key === d.name && JSON.stringify([d.name, draftRecord()]) === keepDraft.last) return;   // 変わっていなければ書かない
    var stages = stageStore();
    if (!stages) return;   // このブラウザに残せない環境（「ファイルに書き出す」を使う）
    if (d.key !== d.name && stages[d.name]) d.name = uniqueName(d.name, stages);   // ほかの自分のステージには上書きしない
    var rec = draftRecord(), moved = d.key !== d.name;
    keepDraft.last = JSON.stringify([d.name, rec]);
    if (d.key && moved) { delete stages[d.key]; renameInLineup(d.key, d.name); }   // 展示の並びに入っていれば、そこの名前も付け替える
    rec.at = Date.now();
    stages[d.name] = rec;
    d.key = d.name;
    stageStoreSet(stages, !moved);   // 中身だけ変わったときは、一覧を作り直さない
  }
  // 段0: 保存ボタンをなくしたので、前の作りかけ（DRAFT_KEY）と前の保存（配置だけ。STORE_KEY）を、自分のステージに一度だけ移す。
  //   作りかけは「作りかけ」「1つ前の作りかけ」、前の保存はその名前で。中身が同じ自分のステージがあれば足さない。
  //   今の形に直せないものは移さない。元のデータは消さずに残す
  function draftSlot() { try { var r = window.localStorage.getItem(DRAFT_KEY); return (r && JSON.parse(r)) || {}; } catch (e) { return {}; } }
  function migrateInfo() { try { return JSON.parse(window.localStorage.getItem(MIGRATED_KEY) || 'null'); } catch (e) { return null; } }
  function migrateOldStages() {
    var stages = stageStore();
    if (!stages || migrateInfo()) return;
    var sig = function (rec) {
      var x = SIO.clone(rec.def), t = rec.texts || {};
      delete x.id; delete x.name;
      return JSON.stringify([x, t.scenes || null, t.hint || null]);
    };
    var have = Object.keys(stages).map(function (k) { return sig(stages[k]); });
    var at = Date.now(), moved = 0, failed = 0;
    var add = function (name, rec) {
      if (!rec || !rec.def || !SIO.build(R, rec.def).ok) { failed++; return; }
      var s = sig(rec);
      if (have.indexOf(s) >= 0) return;
      have.push(s);
      stages[uniqueName(name, stages)] = { def: rec.def, texts: rec.texts || null, exKeep: rec.exKeep || null, at: at };
      moved++;
    };
    var slot = draftSlot(), olds = storeGet() || {};
    if (slot.cur) add('作りかけ', slot.cur);
    if (slot.prev) add('1つ前の作りかけ', slot.prev);
    Object.keys(olds).forEach(function (nm) {
      var f = SIO.fromFile(R, olds[nm], nm);
      if (!f.ok) { failed++; return; }
      add(nm, { def: f.def, texts: f.texts });
    });
    if (moved && !stageStoreSet(stages)) return;   // 残せなかったら、次に開いたときにもう一度
    try { window.localStorage.setItem(MIGRATED_KEY, JSON.stringify({ at: at, moved: moved, failed: failed })); } catch (e) { /* 次に開いたときにもう一度 */ }
  }

  // 作ったステージを、シナリオの一覧（R.PRESETS）と文（TEXTS.stages）に足す。R.findPreset で見つかるので、
  //   やり直し（R.retryStage）・ヒント（R.stageHint）・会話の窓・ボスの決まり（ex）が、チュートリアルと同じように動く
  var customTexts = {};
  function registerStage(def, texts) {
    for (var i = R.PRESETS.length - 1; i >= 0; i--) if (R.PRESETS[i].id === def.id) R.PRESETS.splice(i, 1);
    R.PRESETS.push(def);
    customTexts[def.id] = texts;
    injectTexts();
  }
  // エディットで作ったステージの文は、その自分のステージに入る（texts.js には入れない）
  function injectTexts() {
    var T = window.TEXTS;
    if (!T) return;
    T.stages = T.stages || {};
    Object.keys(customTexts).forEach(function (id) { T.stages[id] = customTexts[id]; });
  }
  function testPlay() {
    var d = app.draft, def = SIO.toDef(R, d.state, d.name);
    d.texts.name = d.name;
    d.playId = def.id;
    registerStage(def, d.texts);
    loadScenario(def.id);
    app.history = [];   // テストプレイの「1手戻す」は、遊び始めより前（エディットの盤面）には戻らない
    addLog('テストプレイ「' + d.name + '」（E でエディットに戻ると、作っていた盤面のまま）', 'system');
    render();
  }
  // 自分のステージを読む（エディットの外でも。シナリオの一覧の「作ったステージ」から）。quiet: 中身だけ変えたとき（一覧は作り直さない）
  function stageStore() {
    try { var raw = window.localStorage.getItem(STAGE_KEY); return raw ? JSON.parse(raw) : {}; } catch (e) { return null; }
  }
  function stageStoreSet(obj, quiet) {
    try { window.localStorage.setItem(STAGE_KEY, JSON.stringify(obj)); if (!quiet) storeVersion++; return true; } catch (e) { return false; }
  }
  // シナリオ（チュートリアル・自分のステージ）を読む
  function loadScenario(id) {
    if (app.busy) skipPlayback();
    var s = id ? R.loadPreset(id) : R.createState();
    var preset = id ? R.findPreset(id) : null;
    app.scenario = id;
    addLog('シナリオ「' + (preset ? preset.name : '標準') + '」を読み込んだ', 'system');
    if (preset && !preset.tutorial) addLog(preset.desc, 'system');   // チュートリアルは説明を出さない（盤面と表示だけで伝わるかを見る）
    app.layout0 = R.clone(s);   // E を押したら、ここから作り始める
    setState(begin(s));
    app.resetPoint = R.clone(app.state);
    if (preset && preset.tutorial) selectNext(null);   // チュートリアル: 動かせる味方を最初から選んでおく
    render();
    if (app.onStage) app.onStage('start');   // 文章（きっかけ: ステージの始め）
  }
  function isTutorial() { var p = app.scenario && R.findPreset(app.scenario); return !!(p && p.tutorial); }

  // エディット: このシナリオだけの数値（overrides）の名前と値
  function setLabel(path, v) { return path + ': ' + (v === true ? '入' : v === false ? '切' : v); }

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
      var reach = reachOf(u);
      if (reach[key(x, y)] !== undefined) {
        app.plan.to = [x, y];
        render();
        return;
      }
      if (occ && occ.side === 'ally' && occ.id !== u.id) { select(occ.id); return; }
      var planned = otherPlanTo(u.id)[key(x, y)];   // ほかの味方の予定の移動先を押したら、その味方を選ぶ
      if (planned) { select(planned.id); return; }
      say(u.stuck ? '泥沼にはまっていて移動できません（その場で撃てます）' : '移動範囲の外です');
      return;
    }
    if (occ && occ.side === 'ally') { select(occ.id); return; }
    var plannedAt = otherPlanTo(null)[key(x, y)];
    if (plannedAt) { select(plannedAt.id); return; }
    say('味方をクリックして選んでください');
  }

  function applyEdit(x, y, dragging) {
    var tool = app.editTool;
    var st = app.state;
    var res;
    // 駒（味方・敵・村・馬車）は、どの道具のときでも押すと選び、そのままドラッグで動かす（オーナー 10/30）
    var drag = app.stroke && app.stroke.drag;
    var at = dragging ? null : R.unitAt(st, x, y);
    if (drag) {
      var du = R.findUnit(st, drag.id);
      if (!dragging || !du || (du.x === x - drag.dx && du.y === y - drag.dy)) return;
      res = R.editMoveUnit(st, drag.id, x - drag.dx, y - drag.dy);
      var mv = res.ok && R.findUnit(res.state, drag.id);
      if (mv && mv.size > 1 && SIO.fits(R, res.state, mv)) res = null;   // 大きい敵は体の全部が収まる所だけ
      if (!res || !res.ok) return;
    } else if (at) {
      app.editPick = at.id;
      if (app.stroke) app.stroke.drag = { id: at.id, dx: x - at.x, dy: y - at.y };   // 大きい敵は、つかんだ所を保ったまま動く
      render();
      return;
    }
    else if (tool.indexOf('tile:') === 0) res = R.editPaint(st, x, y, tool.slice(5));   // 空きマスから塗り始めれば、駒のいるマスも塗れる
    else if (dragging) return;
    else if (tool === 'pick') { if (app.editPick) { app.editPick = null; render(); } return; }   // 道具を持っていない: 空きマスで選ぶのをやめる
    else if (tool === 'enemy' || tool.indexOf('ally:') === 0) {
      res = tool === 'enemy' ? R.editPlaceUnit(st, 'enemy', x, y) : R.editPlaceUnit(st, 'ally', x, y, tool.slice(5));
      if (res.ok) app.editPick = res.unit.id;   // 置いた駒をそのまま選ぶ（カードで設定できる）
    }
    else if (tool.indexOf('obj:') === 0) {
      res = R.editPlaceObject(st, tool.slice(4), x, y);
      if (res.ok) app.editPick = res.unit.id;
    }
    else if (tool.indexOf('mark:') === 0) res = R.editToggleCell(st, tool.slice(5), x, y);
    else if (tool === 'treasure') res = R.editPlaceTreasure(st, x, y);
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
    renderMission();
    renderStatus();
    renderBoard(!!animate);
    renderSide();
    renderHint();
  }

  // お題: 名前・勝ち方・負け方・残りの数を常に出す
  var missionSig = '';
  function renderMission() {
    var info = R.missionInfo(app.state);
    // 護衛: 味方の予測を出している間は、その手のあと（敵の発動のあと）の馬車の歩数も出す
    if (info.type === 'escort' && selUnit() && app.plan) {
      var fw = forecastNow(true);
      if (fw && fw.wagon) info.status.splice(2, 0, 'この手なら ' + (fw.wagon.steps === null ? '道がない' : (fw.wagon.steps + '歩')));
    }
    var stx = stageTexts(app.state.stage);   // チュートリアルの目標（texts.js）
    // 展示ステージ③: ミッション（最初から出す。達成したら ✔）
    var exm = ((exOf() || {}).missions || []).map(function (m) {
      var done = !!(app.state.exDone && app.state.exDone[m.id]);
      return '<span class="m-ex-mission' + (done ? ' done' : '') + '">' +
        '<b>' + esc(ui('exMission', 'ミッション')) + '</b> ' + esc(exMissionName(m.id)) + ' <span class="m-check">' + (done ? '✔ ' + esc(ui('exMissionDone', 'ミッション達成！')) : '□') + '</span></span>';
    }).join('');
    var html = (stx && stx.goal ? '<span class="m-goal-text"><b>' + esc(ui('goal', '目標')) + '</b> ' + esc(stx.goal) + '</span>' : '') + exm +
      '<span class="m-name m-' + info.type + '">お題: ' + esc(info.name) + '</span>' +
      '<span class="m-rule m-win"><b>勝ち</b> ' + esc(info.win) + '</span>' +
      '<span class="m-status">' + info.status.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</span>';
    if (html === missionSig) return;
    missionSig = html;
    el.missionBar.innerHTML = html;
  }

  function renderStatus() {
    var st = app.state;
    el.turnLabel.textContent = 'ターン ' + st.turn;
    var test = testing();
    var mode = app.editMode ? 'エディット中' : app.busy ? '処理中…' : st.result === 'win' ? '勝利' : st.result === 'lose' ? '敗北' : test ? 'テストプレイ中' : 'プレイ中';
    el.modeLabel.textContent = mode;
    el.modeLabel.className = 'pill mode' + (app.editMode ? ' edit' : app.busy ? ' busy' : test ? ' test' : '');
    // 【一斉】「ターン終了」は「発動」になり、動かせる味方が全員構え終えたら押せる
    var ready = simul() && !st.result && R.controllableOf(st).length > 0 && R.allAlliesActed(st);
    el.btnEndTurn.disabled = app.editMode || app.busy || !!st.result || (simul() && !ready && R.controllableOf(st).length > 0);
    el.btnEndTurn.innerHTML = esc(simul() ? ui('fire', '発動') : ui('endTurn', 'ターン終了')) + ' <kbd>T</kbd>';
    el.btnEndTurn.classList.toggle('fire-ready', ready && !app.busy && !app.editMode);
    el.btnEndTurn.classList.toggle('primary', ready && !app.busy && !app.editMode);
    el.btnShoot.innerHTML = esc(simul() ? ui('stance', '構える') : ui('shoot', '撃つ')) + ' <kbd>Enter</kbd>';
    el.btnStay.innerHTML = esc(simul() ? ui('stayStance', 'その場で構える') : ui('stayShoot', 'その場で撃つ')) + ' <kbd>Space</kbd>';
    el.btnWait.innerHTML = esc(ui('wait', '待機')) + ' <kbd>W</kbd>';
    el.btnRetry.textContent = ui('retry', 'やり直す');
    el.btnUndo.disabled = app.history.length === 0;
    el.btnEdit.classList.toggle('active', app.editMode);
    el.btnEdit.classList.toggle('test', test);
    el.btnEdit.innerHTML = (app.editMode ? '▶ テストプレイ' : test ? '✎ エディットに戻る' : 'エディット') + ' <kbd>E</kbd>';
    el.btnReset.disabled = app.editMode;
    // チュートリアル: 負けたら「やり直す」。やり直したあと（2回目以降の開始時）は、盤面の上にヒントを1行
    el.btnRetry.hidden = !(st.result === 'lose' && st.stage && !app.editMode && !app.busy);
    // ステージ②: 村への道をふさぎきったら「クリアする」（勝手には勝たない）
    el.btnSealWin.hidden = !(canControl() && R.sealReady(st));
    el.btnSealWin.innerHTML = esc(ui('sealWin', 'クリアする')) + ' <kbd>C</kbd>';
    var sh = app.editMode ? null : R.stageHint(st);
    el.stageHint.hidden = !sh;
    if (sh && el.stageHint.textContent !== sh) el.stageHint.textContent = sh;
    el.playPanel.hidden = app.editMode;
    el.editPanel.hidden = !app.editMode;
  }

  // 敵の予告（エディット中・処理中は出さない）
  function forecastNow() {
    if (app.editMode || app.busy) return null;
    var u = selUnit();
    // 展示ステージ③（形だけの予測）: 敵の予告は今の盤面のまま（撃ったあとの盤面で計算し直すと、何が起きるかが分かってしまうため）
    if (u && app.plan && !app.state.result && !shapeOnly()) {
      var pv = previewNow(u);
      return memo('fcpv', [pv], function () { return R.forecast(pv.state); });
    }
    return memo('fc', [app.state], function () { return R.forecast(app.state); });
  }
  // 【新案・仮】あと一手のヒント（エディット中・処理中は出さない。展示ステージ③では答えになるので出さない）
  function hintsNow() {
    if (app.editMode || app.busy || shapeOnly()) return [];
    return memo('next', [app.state], function () { return R.nextHints(app.state); });
  }
  function guideNow(u) {
    return memo('guide', [app.state, u.id], function () { return R.guideMap(app.state, u.id); });
  }
  function previewNow(u) {
    var p = app.plan;
    return memo('pv', [app.state, u.id, p.to[0], p.to[1], p.dir], function () {
      if (R.canShoot(app.state, u, p.to)) return R.previewAct(app.state, u.id, p.to, p.dir);
      // 奪取: 宝を持つ味方は撃てないので、移動して待機したときの盤面を予測にする
      var r = R.act(app.state, u.id, { to: p.to, dir: p.dir, shoot: false });
      return { state: r.ok ? r.state : app.state, events: r.events, cells: [], tileChanges: [], damages: [], moves: [], finishers: [],
        from: [u.x, u.y], to: p.to, dir: p.dir, waitOnly: true };
    });
  }

  var cellEls = [];

  // 敵の個性: 駒の小さな印（狙い 人/近/自・危ない所も避ける 避・川を渡る 渡）と、一覧の説明
  var AIM_MARK = { count: '人', near: '近', nature: '自', target: '的' };
  function personaMark(u) {
    if (u.stand === 'still') return '止';
    if (u.stand === 'march') return '進';
    if (u.stand === 'rush') return '突';
    if (u.stand === 'boss') return '進';
    if (u.stand === 'float') return '浮';
    return AIM_MARK[u.aim] + (u.avoid === 'danger' ? '避' : '') + (u.cross === 'river' ? '渡' : '');
  }
  function personaText(u) {
    if (u.stand === 'still') return '動き: ' + R.PERSONA.stand.still + '（移動しない・撃たない・予告を出さない）';
    if (u.stand === 'rush') return '動き: ' + R.PERSONA.stand.rush + '（人は無視して一番近い村へ、1ターンに' + B.enemy.rushMove + 'マス。山・川・水たまり・泥沼・ユニットは通らない。魔法は撃たない。走り終えて村の隣なら体当たりで村を壊す）';
    if (u.stand === 'boss') return '動き: ボス（1ターンに1マス前へ進み、体の前の' + B.stage3.bossReach + '列に一撃を予告する。ふさがれていたら進まない。普通の魔法はほとんど効かない）';
    if (u.stand === 'float') return '動き: 浮く（地形に関係なく、風の人へまっすぐ1ターンに' + B.stage3.minionMove + 'マス。隣に来たら体当たりを予告する）';
    if (u.stand === 'march') return '動き: ' + R.PERSONA.stand.march + '（敵の番に、向いている方へ1マス進み、構える味方が魔法の真ん中に来たらそのまま撃つ。移動と魔法はセット）';
    return '狙い: ' + R.PERSONA.aim[u.aim] + '／避ける: ' + R.PERSONA.avoid[u.avoid] + '／越える: ' + R.PERSONA.cross[u.cross];
  }

  function unitHtml(u, st, view) {
    if (u.side === 'object') {
      // お題の置きもの: 村（四角・動かない）・馬車（角丸・運べる）
      var oc = ['unit', 'object', u.kind];
      if (u.stuck) oc.push('stuck');
      var oh = '<div class="' + oc.join(' ') + '" data-id="' + u.id + '"><span class="u-name">' + esc(R.OBJECT_INFO[u.kind].name) + '</span>' +
        '<span class="u-hp">HP' + u.hp + '</span>';
      if (u.burn > 0) oh += '<span class="u-burn">火傷' + u.burn + '</span>';
      if (view.warn) oh += '<span class="u-warn">予告 -' + view.warn + (view.warn >= u.hp ? ' 壊れる' : '') + '</span>';
      if (view.dmg) oh += '<span class="u-dmg">-' + view.dmg.amount + (view.dmg.dies ? ' 壊れる' : '') + '</span>';
      return oh + '</div>';
    }
    var cls = ['unit', u.side];
    if (u.npc) cls.push('npc');
    if (view.selected) cls.push('selected');
    if (u.side === 'ally' && u.acted && !u.npc && !app.editMode) cls.push('acted');
    if (u.stuck) cls.push('stuck');
    if (R.hidden(st, u)) cls.push('hidden');
    if (view.next) cls.push('next-ready');
    if (view.order) cls.push('stanced');
    var facing = view.facing || u.facing;
    var name = u.side === 'ally' ? esc(R.magicName(u.magic)) : '敵<small>' + esc(u.letter) + '</small>';
    // 大きい敵（③のボス）・体（浮く）の見た目
    if (u.size > 1) cls.push('big');
    if (u.body) cls.push('body-' + u.body);
    if (u.exBoss) cls.push('boss');
    if (u.side === 'enemy' && u.stand === 'boss') name = 'ボス';            // 展示ステージ③
    if (u.side === 'enemy' && u.stand === 'float') name = '取り巻き<small>' + esc(u.letter) + '</small>';
    var h = '<div class="' + cls.join(' ') + '" data-id="' + u.id + '" style="--rot:' + DIR_ROT[facing] + 'deg' + (u.size > 1 ? ';--sz:' + u.size : '') + '">' +
      '<span class="facing"></span><span class="u-name">' + name + '</span><span class="u-hp">HP' + u.hp + '</span>';
    if (u.side === 'enemy') {
      if (u.stand !== 'rush') h += '<span class="u-magic">' + esc(R.magicName(u.magic)) + '</span>';   // 突進の敵は魔法を撃たない
      h += '<span class="u-persona" title="' + esc(personaText(u)) + '">' + esc(personaMark(u)) + '</span>';
    }
    if (R.hidden(st, u)) h += '<span class="u-hide">隠</span>';
    if (st.mission && st.mission.carrier === u.id) h += '<span class="u-treasure" title="宝を持っている（撃てない）">宝</span>';
    if (u.burn > 0) h += '<span class="u-burn" title="火傷: ターン終了ごとに' + B.fire.burnDamage + '（水か氷で治る）">火傷' + u.burn + '</span>';
    if (view.warn) h += '<span class="u-warn">予告 -' + view.warn + '</span>';
    if (view.dmg) h += '<span class="u-dmg">-' + view.dmg.amount + (view.dmg.dies ? ' 倒れる' : '') + '</span>';
    if (view.order) h += '<span class="u-order" title="' + view.order + '番目に発動">' + (ORDER_MARK[view.order] || view.order) + '</span>';   // 【一斉】構えの順番
    return h + '</div>';
  }

  function renderBoard(animate) {
    var st = app.state;
    var n = st.size, rows = R.rowsOf(st);   // 横 n・縦 rows（チュートリアル②は 5×8）
    el.board.style.setProperty('--n', n);
    el.board.style.setProperty('--rows', rows);

    // 動きのアニメーション用: 描き直す前の位置
    var before = {};
    if (animate) {
      Array.prototype.forEach.call(el.board.querySelectorAll('.unit[data-id]'), function (t) {
        before[t.getAttribute('data-id')] = t.getBoundingClientRect();
      });
    }

    if (cellEls.length !== n * rows || el.board.getAttribute('data-n') !== String(n)) {
      el.board.innerHTML = '';
      el.board.setAttribute('data-n', n);
      cellEls = [];
      for (var i = 0; i < n * rows; i++) {
        var d = document.createElement('div');
        d.setAttribute('data-x', i % n);
        d.setAttribute('data-y', Math.floor(i / n));
        el.board.appendChild(d);
        cellEls.push({ el: d, cls: null, html: null });
      }
    }

    var u = (!app.editMode && !app.busy) ? selUnit() : null;
    var so = shapeOnly();   // 展示ステージ③: 予測は魔法が届く形まで（何になるかは見せない）
    var reach = u ? reachOf(u) : {};
    var planElse = (!app.editMode && !st.result) ? otherPlanTo(u ? u.id : null) : {};   // ほかの味方の移動の予定（薄く描く）
    var guide = (u && !st.result && !so) ? guideNow(u) : {};
    var pv = (u && app.plan && !st.result) ? previewNow(u) : null;
    var fc = forecastNow();

    // 【新案・仮】あと一手のヒント: かたまりの真ん中に1つだけ札を出す。今撃てる味方には光
    var nextAt = {}, nextReady = {};
    hintsNow().forEach(function (h) {
      var cx = 0, cy = 0;
      h.cells.forEach(function (c) { cx += c[0]; cy += c[1]; });
      cx /= h.cells.length; cy /= h.cells.length;
      var anchor = h.cells.reduce(function (a, c) { return (c[1] < a[1] || (c[1] === a[1] && c[0] < a[0])) ? c : a; });
      nextAt[key(anchor[0], anchor[1])] = { h: h, dx: cx - anchor[0], dy: cy - anchor[1] };
      h.shooters.forEach(function (sh) { nextReady[sh.id] = h; });
    });

    // 予測
    var shape = {}, range = {}, strong = {}, change = {}, dmg = {}, growPv = {}, growNo = {};
    if (pv && !so) pv.cells.forEach(function (c) { shape[key(c[0], c[1])] = true; });
    // 【一斉】予測の結果（変わるマス・決め手の範囲・ダメージ）は、構え全部の予告（下の fa）として出す
    if (pv && !simul() && !so) {
      pv.finishers.forEach(function (f) {
        f.cells.forEach(function (c) { range[key(c[0], c[1])] = true; });
        (f.strong || []).forEach(function (c) { strong[key(c[0], c[1])] = true; });
      });
      pv.tileChanges.forEach(function (c) { change[key(c.x, c.y)] = c.to; });
      pv.damages.forEach(function (d) { dmg[d.id] = d; });
    }
    if (pv && !so) {
      // 【育つ】育ったあとの形を薄く重ね、育てないマスに印
      (pv.grows || []).forEach(function (g) {
        g.cells.forEach(function (c, i) { growPv[key(c[0], c[1])] = (g.tiles && g.tiles[i]) || g.tile; });
        g.blocked.forEach(function (c) { growNo[key(c[0], c[1])] = true; });
      });
    }
    // 予告
    var fcShot = {}, fcGhost = {}, fcSpread = {}, fcOut = {}, fcChange = {}, fcRange = {}, fcStrong = {}, warn = {};
    // 構える味方の予告（青）: 「予告を表示」を切っていても常に出す。狙うマスの枠と向きの矢印、結果（変わるマス・決め手の範囲・ダメージ）
    var faShot = {}, faChange = {}, faRange = {}, faStrong = {}, npcIds = {}, stanceNo = {};
    var fcAll = (app.editMode || app.busy) ? null : forecastNow(true);
    if (fcAll) {
      fcAll.allies.forEach(function (p) {
        var a = R.findUnit(st, p.id);
        if (!a || p.cancelled) return;
        npcIds[p.id] = true;
        if (p.order) stanceNo[p.id] = p.order;
        if (so) return;   // 展示ステージ③: 構えは下の輪郭で描く（何になるか・ダメージは出さない）
        (p.cells || []).forEach(function (c) {
          var k = key(c[0], c[1]);
          // 【一斉】構えの印: マスごとに「発動の順番＋魔法」（敵の予告の文字と同じ置き方）
          if (simul()) (faShot[k] = faShot[k] || []).push({ n: p.order, magic: p.magic, dir: p.dir, npc: !!a.npc });
          else faShot[k] = p.dir;
        });
        (p.tileChanges || []).forEach(function (c) { faChange[key(c.x, c.y)] = c.to; });
        (p.finishers || []).forEach(function (f) {
          f.cells.forEach(function (c) { faRange[key(c[0], c[1])] = true; });
          (f.strong || []).forEach(function (c) { faStrong[key(c[0], c[1])] = true; });
        });
        (p.damages || []).forEach(function (d) {
          if (simul()) {   // 【一斉】構えで受けるダメージは「-20 倒れる」の形で（合計）
            var x = dmg[d.id] || (dmg[d.id] = { amount: 0, dies: false });
            x.amount += d.amount;
            if (d.dies) x.dies = true;
          } else warn[d.id] = (warn[d.id] || 0) + d.amount;
        });
      });
    }
    // 展示ステージ③: 構えと予測は、魔法の形の輪郭と向きで描く（自然のマスとは別の見た目。何になるかは出さない）
    var soCell = {};
    if (so) {
      var groups = [];
      if (fcAll) fcAll.allies.forEach(function (p) { if (!p.cancelled && !(u && p.id === u.id)) groups.push({ cells: p.cells || [], magic: p.magic, dir: p.dir, n: p.order }); });
      if (pv && u) groups.push({ cells: pv.cells || [], magic: u.magic, dir: app.plan.dir, n: pv.order || 0, planned: true });
      groups.forEach(function (g) {
        var inG = {};
        g.cells.forEach(function (c) { inG[key(c[0], c[1])] = true; });
        g.cells.forEach(function (c, i) {
          var k2 = key(c[0], c[1]);
          if (soCell[k2]) return;
          var edges = [];
          [['t', 0, -1], ['r', 1, 0], ['b', 0, 1], ['l', -1, 0]].forEach(function (d) { if (!inG[key(c[0] + d[1], c[1] + d[2])]) edges.push('e-' + d[0]); });
          soCell[k2] = { magic: g.magic, edges: edges, first: i === 0, dir: g.dir, n: g.n, planned: !!g.planned };
        });
      });
    }
    // 外したときのヒント: 構える味方が狙っているマスを光らせる（文字は出さない）
    var tutHint = {};
    if (!app.editMode && !app.busy) R.npcHintCells(st).forEach(function (c) { tutHint[key(c[0], c[1])] = true; });
    if (fc) {
      fc.enemies.forEach(function (p) {
        var e = R.findUnit(st, p.id);
        if (!e || p.cancelled) return;
        (p.cells || []).forEach(function (c) {
          var k = key(c[0], c[1]);
          (fcShot[k] = fcShot[k] || []).push(e.letter);
        });
        (p.tileChanges || []).forEach(function (c) { fcChange[key(c.x, c.y)] = c.to; });
        (p.finishers || []).forEach(function (f) {
          f.cells.forEach(function (c) { fcRange[key(c[0], c[1])] = true; });
          (f.strong || []).forEach(function (c) { fcStrong[key(c[0], c[1])] = true; });
        });
      });
      // 「進む」敵: 次のターン終了で進むマスに、点線の丸と向き
      (fc.marches || []).forEach(function (m) {
        var me = R.findUnit(st, m.id);
        if (me) fcGhost[key(m.to[0], m.to[1])] = { letter: me.letter, dir: m.dir };
      });
      fc.fireSpread.forEach(function (c) { fcSpread[key(c[0], c[1])] = true; });
      (fc.burnOut || []).forEach(function (c) { fcOut[key(c[0], c[1])] = true; });
      fc.burn.forEach(function (b) { warn[b.id] = (warn[b.id] || 0) + b.amount; });
      fc.enemyDamage.forEach(function (d) { if (!npcIds[d.by]) warn[d.id] = (warn[d.id] || 0) + d.amount; });   // 構える味方の分は上で足した
    }

    // 護衛: 馬車の道筋（薄い線）と次の1マス（矢印）。敵の予告と同じく、予測中は撃ったあとの盤面で計算し直す
    var wLine = {}, wNext = null;
    var fcw = fc || forecastNow(true);
    if (fcw && fcw.wagon && fcw.wagon.next && !app.editMode) {
      var wg = fcw.wagon;
      var seq = [wg.from].concat(wg.path);
      var stepDir = function (a, b) { return b[0] > a[0] ? 'right' : b[0] < a[0] ? 'left' : b[1] > a[1] ? 'down' : 'up'; };
      var OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
      seq.forEach(function (c, i) {
        var arms = wLine[key(c[0], c[1])] = [];
        if (i > 0) arms.push(OPP[stepDir(seq[i - 1], c)]);
        if (i < seq.length - 1) arms.push(stepDir(c, seq[i + 1]));
      });
      wNext = { k: key(wg.next[0], wg.next[1]), dir: stepDir(wg.from, wg.next), stuck: wg.stuck };
    }
    // 突進の敵（チュートリアル②）: 村へ走る道（赤い点線）と、次に走って止まるマス（点線の丸と向き）。「予告を表示」を切っていても常に出す。
    //   予測中は撃ったあとの盤面で計算し直す。村に届く道なら、その村に「予告 -1」
    var eLine = {}, eStop = {}, rushWarn = {};
    var fcr = (app.editMode || app.busy) ? null : forecastNow(true);
    (fcr && fcr.rushes || []).forEach(function (r) {
      var re = R.findUnit(st, r.id);
      if (!re) return;   // まだ現れていない増援
      var v = r.reach && r.village ? R.findUnit(st, r.village) : null;
      var seq = [r.from].concat(r.path).concat(v ? [[v.x, v.y]] : []);
      var stepDir = function (a, b) { return b[0] > a[0] ? 'right' : b[0] < a[0] ? 'left' : b[1] > a[1] ? 'down' : 'up'; };
      var OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
      if (seq.length > 1) seq.forEach(function (c, i) {
        var arms = eLine[key(c[0], c[1])] = eLine[key(c[0], c[1])] || [];
        var add = function (d) { if (arms.indexOf(d) < 0) arms.push(d); };
        if (i > 0) add(OPP[stepDir(seq[i - 1], c)]);
        if (i < seq.length - 1) add(stepDir(c, seq[i + 1]));
      });
      if (r.stop > 0) {
        var sc = r.path[r.stop - 1], sp = r.stop > 1 ? r.path[r.stop - 2] : r.from;
        eStop[key(sc[0], sc[1])] = { letter: re.letter, dir: stepDir(sp, sc) };
      }
      if (v) rushWarn[v.id] = v.hp;
    });
    Object.keys(rushWarn).forEach(function (id) { warn[id] = Math.max(warn[id] || 0, rushWarn[id]); });
    // 山の頂上と斜面（どこが高いか）。山の魔法の頂上と腕に加えて、10/29 から土の山・もとからある山も（R.slopeMap）
    var slopes = memo('slopes', [st], function () { return R.slopeMap(st); });

    var mi = st.mission || {};

    // 選んでいる味方は、移動先の候補に描く
    var drawAt = {};
    st.units.forEach(function (x) { drawAt[x.id] = [x.x, x.y]; });
    var planGhost = null;
    if (u && app.plan) {
      drawAt[u.id] = app.plan.to;
      if (app.plan.to[0] !== u.x || app.plan.to[1] !== u.y) planGhost = key(u.x, u.y);
    }
    // 【新案】見た目: つながった山（火山も）を1つの大きな山として描く。頂上は、かたまりの真ん中のマスに大きく描く
    var isMount = function (x, y) { if (!R.inBounds(st, x, y)) return false; var tt = R.getTile(st, x, y); return tt === 'mountain' || tt === 'volcano' || tt === 'sakura'; };
    var isRiver = function (x, y) { return R.inBounds(st, x, y) && R.getTile(st, x, y) === 'river'; };
    var peakAt = {}, seenM = {};
    for (var my = 0; my < rows; my++) {
      for (var mx = 0; mx < n; mx++) {
        if (!isMount(mx, my) || seenM[key(mx, my)]) continue;
        var comp = [], stack = [[mx, my]], hot = false;
        while (stack.length) {
          var q = stack.pop();
          if (seenM[key(q[0], q[1])] || !isMount(q[0], q[1])) continue;
          seenM[key(q[0], q[1])] = true;
          comp.push(q);
          if (R.getTile(st, q[0], q[1]) === 'volcano') hot = true;
          stack.push([q[0] + 1, q[1]], [q[0] - 1, q[1]], [q[0], q[1] + 1], [q[0], q[1] - 1]);
        }
        var ax = 0, ay = 0;
        comp.forEach(function (q) { ax += q[0]; ay += q[1]; });
        ax /= comp.length; ay /= comp.length;
        var best = comp[0];
        comp.forEach(function (q) { if (Math.abs(q[0] - ax) + Math.abs(q[1] - ay) < Math.abs(best[0] - ax) + Math.abs(best[1] - ay)) best = q; });
        peakAt[key(best[0], best[1])] = { size: Math.min(2.6, 0.75 + 0.4 * (comp.length - 1)), dx: ax - best[0], dy: ay - best[1], hot: hot };
      }
    }

    // 【育つ】見た目: つながった森・水たまり・氷・死の森も、1枚の大きな絵で描く（fx.bigPicture）。かたまりが大きいほど真ん中の絵も大きい
    var bigComp = {}, bigAt = {};
    if (B.fx.bigPicture) {
      for (var by = 0; by < rows; by++) {
        for (var bx = 0; bx < n; bx++) {
          var bt = R.getTile(st, bx, by);
          if (!BIG[bt] || bigComp[key(bx, by)]) continue;
          var bcomp = [], bstack = [[bx, by]], bseen = {};
          while (bstack.length) {
            var bq = bstack.pop(), bk = key(bq[0], bq[1]);
            if (bseen[bk] || !R.inBounds(st, bq[0], bq[1]) || R.getTile(st, bq[0], bq[1]) !== bt) continue;
            bseen[bk] = true;
            bcomp.push(bq);
            bstack.push([bq[0] + 1, bq[1]], [bq[0] - 1, bq[1]], [bq[0], bq[1] + 1], [bq[0], bq[1] - 1]);
          }
          if (bcomp.length < 2) { bigComp[key(bx, by)] = 'solo'; continue; }
          bcomp.forEach(function (q) { bigComp[key(q[0], q[1])] = bt; });
          var cx2 = 0, cy2 = 0;
          bcomp.forEach(function (q) { cx2 += q[0]; cy2 += q[1]; });
          cx2 /= bcomp.length; cy2 /= bcomp.length;
          var bbest = bcomp[0];
          bcomp.forEach(function (q) { if (Math.abs(q[0] - cx2) + Math.abs(q[1] - cy2) < Math.abs(bbest[0] - cx2) + Math.abs(bbest[1] - cy2)) bbest = q; });
          bigAt[key(bbest[0], bbest[1])] = { tile: bt, size: Math.min(3, 0.8 + 0.3 * (bcomp.length - 1)), dx: cx2 - bbest[0], dy: cy2 - bbest[1] };
        }
      }
    }

    var unitByCell = {};
    st.units.forEach(function (x) { unitByCell[key(drawAt[x.id][0], drawAt[x.id][1])] = x; });

    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < n; x++) {
        var k = key(x, y);
        var tile = R.getTile(st, x, y);
        var cls = ['cell', 't-' + tile];
        if (reach[k] !== undefined) cls.push('reach');
        if (u && app.plan && app.plan.to[0] === x && app.plan.to[1] === y) cls.push('plan-to');
        if (planElse[k]) cls.push('plan-other');
        if (guide[k] === 'finisher' && reach[k] !== undefined) cls.push('guide-finisher');
        if (shape[k]) cls.push('pv-shape');
        if (growPv[k]) cls.push('pv-grow');
        if (range[k]) cls.push('pv-range');
        if (strong[k]) cls.push('pv-strong');
        if (fcShot[k]) cls.push('fc-shot');
        if (fcRange[k]) cls.push('fc-range');
        if (fcStrong[k]) cls.push('fc-strong');
        if (faShot[k]) cls.push('fa-shot');
        if (faShot[k] && simul()) cls.push('st-shot');
        if (faRange[k]) cls.push('fa-range');
        if (faStrong[k]) cls.push('fa-strong');
        if (tutHint[k]) cls.push('tut-hint');
        if (soCell[k]) cls.push('so');
        if (app.hl[k]) cls.push('hl');
        if (app.flash[k]) cls.push('flash');
        if (nextAt[k]) cls.push('has-next');
        var isGoal = R.inCells(mi.goal, x, y), isExit = R.inCells(mi.exit, x, y);
        if (isGoal) cls.push('m-goal');
        if (isExit) cls.push('m-exit');
        var unit = unitByCell[k];
        if (app.editMode && app.editPick && unit && unit.id === app.editPick) cls.push('picked');

        var inner = '<span class="tile-label">' + esc(R.TILE_INFO[tile].label) + '</span>';
        if (tile === 'river') {
          var arms = '';
          [['up', x, y - 1], ['right', x + 1, y], ['down', x, y + 1], ['left', x - 1, y]].forEach(function (a) { if (isRiver(a[1], a[2])) arms += '<span class="stream ' + a[0] + '"></span>'; });
          inner += '<span class="stream c' + (arms ? '' : ' solo') + '"></span>' + arms;
        }
        var sl = tile === 'mountain' ? slopes[y * n + x] : undefined;
        if (sl === 'peak') cls.push('slope-peak');
        else if (sl) cls.push('slope-arm');
        if (tile === 'mountain' || tile === 'volcano' || tile === 'sakura') {
          var ms = [];
          if (isMount(x, y - 1)) ms.push('up'); if (isMount(x + 1, y)) ms.push('right'); if (isMount(x, y + 1)) ms.push('down'); if (isMount(x - 1, y)) ms.push('left');
          inner += '<span class="massif ' + ms.map(function (m) { return 'j-' + m; }).join(' ') + (tile === 'volcano' ? ' hot' : '') + '"></span>';
          if (tile === 'sakura') inner += '<span class="bloom"></span>';
          var pk = peakAt[k];
          if (pk && !sl) inner += '<span class="peak' + (pk.hot ? ' hot' : '') + '" style="--ps:' + pk.size.toFixed(2) + ';--pdx:' + pk.dx.toFixed(2) + ';--pdy:' + pk.dy.toFixed(2) + '"></span>';
          if (sl === 'peak') inner += '<span class="summit" title="山の頂上（一番高い）">▲</span>';
        }
        if (bigComp[k] && bigComp[k] !== 'solo') {
          var bj = [];
          [['up', x, y - 1], ['right', x + 1, y], ['down', x, y + 1], ['left', x - 1, y]].forEach(function (a) { if (R.inBounds(st, a[1], a[2]) && R.getTile(st, a[1], a[2]) === tile) bj.push('j-' + a[0]); });
          inner += '<span class="bigland ' + BIG[tile].cls + ' ' + bj.join(' ') + '"></span>';
        }
        if (bigAt[k]) {
          var ba = bigAt[k];
          inner += '<span class="bigmark ' + BIG[ba.tile].cls + '" style="--ps:' + ba.size.toFixed(2) + ';--pdx:' + ba.dx.toFixed(2) + ';--pdy:' + ba.dy.toFixed(2) + '" title="' + esc(BIG[ba.tile].name) + '">' + BIG[ba.tile].mark + '</span>';
        }
        // お題の印
        if (isGoal) inner += '<span class="m-mark goal">ゴール</span>';
        if (isExit) inner += '<span class="m-mark exit">帰り口</span>';
        if (mi.treasure && mi.treasure[0] === x && mi.treasure[1] === y) inner += '<span class="m-treasure' + (unit ? ' under' : '') + '" title="宝（このマスで移動を終えると持つ）">宝</span>';
        if (wLine[k]) inner += wLine[k].map(function (d) { return '<span class="wline ' + d + '"></span>'; }).join('') + '<span class="wline dot"></span>';
        if (eLine[k]) inner += eLine[k].map(function (d) { return '<span class="wline e ' + d + '"></span>'; }).join('') + '<span class="wline e dot"></span>';
        if (eStop[k] && !unit) inner += '<div class="ghost rush">' + esc(eStop[k].letter) + DIR_ARROW[eStop[k].dir] + '</div>';
        if (wNext && wNext.k === k) inner += '<span class="wnext' + (wNext.stuck ? ' stuck' : '') + '" title="次のターン終了で馬車が進むマス">' + DIR_ARROW[wNext.dir] + '</span>';
        if (guide[k] && reach[k] !== undefined) {
          inner += guide[k] === 'finisher' ? '<span class="b-guide finisher">◆</span>' : '<span class="b-guide change" title="変化が起きる"></span>';
        }
        if (growPv[k]) inner += '<span class="g-ghost ' + growPv[k] + '" title="育ったあとの形（' + esc(SHORT[growPv[k]]) + '）"></span>';
        if (growNo[k]) inner += '<span class="b-nogrow" title="育たない（ユニットがいる・ほかの自然がある）">×</span>';
        if (change[k]) inner += '<span class="b-change">→' + esc(SHORT[change[k]]) + '</span>';
        else if (faChange[k]) inner += '<span class="b-change ally">→' + esc(SHORT[faChange[k]]) + '</span>';
        else if (fcChange[k]) inner += '<span class="b-change enemy">→' + esc(SHORT[fcChange[k]]) + '</span>';
        var badges = '';
        if (fcSpread[k]) badges += '<span class="spread">燃</span>';
        if (fcOut[k]) badges += '<span class="burnout" title="次のターン終了で燃え尽きる">尽</span>';
        if (faShot[k] && simul()) badges += faShot[k].map(function (f) {
          return '<span class="ally stance' + (f.npc ? ' npc' : '') + '" title="' + esc(f.n + '番目に発動: ' + R.magicName(f.magic)) + '">' + (ORDER_MARK[f.n] || f.n) + esc(R.magicName(f.magic)) + '</span>';
        }).join('');
        else if (faShot[k]) badges += '<span class="ally" title="構える味方が狙っているマス">' + DIR_ARROW[faShot[k]] + '</span>';
        if (fcShot[k]) badges += '<span class="enemy">' + esc(fcShot[k].join('')) + '</span>';
        if (badges) inner += '<span class="b-fc">' + badges + '</span>';
        if (fcGhost[k] && !unit) inner += '<div class="ghost">' + esc(fcGhost[k].letter) + DIR_ARROW[fcGhost[k].dir] + '</div>';
        if (planGhost === k && !unit) inner += '<div class="ghost ally"></div>';
        if (planElse[k] && !unit) { var pa = planElse[k], pp = app.plans[pa.id]; inner += '<div class="ghost ally plan-other" title="' + esc(R.unitLabel(st, pa) + 'の移動の予定') + '">' + esc(R.magicName(pa.magic)) + DIR_ARROW[pp.dir] + '</div>'; }
        if (soCell[k]) {   // 展示ステージ③: 魔法の形の輪郭（外側の辺だけ）と、術者に一番近いマスに「①火→」
          var sc = soCell[k];
          inner += '<span class="so-line so-' + sc.magic + ' ' + sc.edges.join(' ') + (sc.planned ? ' planned' : '') + '"></span>';
          if (sc.first) inner += '<span class="so-tag so-' + sc.magic + (sc.planned ? ' planned' : '') + '">' + (sc.n ? (ORDER_MARK[sc.n] || sc.n) : '') + esc(R.magicName(sc.magic)) + DIR_ARROW[sc.dir] + '</span>';
        }
        if (nextAt[k]) {
          var nx = nextAt[k], ready = nx.h.shooters.length > 0;
          inner += '<span class="b-next' + (ready ? ' ready' : '') + '" style="--ndx:' + nx.dx.toFixed(2) + ';--ndy:' + nx.dy.toFixed(2) + '">' +
            '<b>あと一手' + (ready ? '！' : '') + '</b><span class="m">' + esc(R.magicName(nx.h.magic)) + '</span>→ ' + esc(nx.h.name) + '</span>';
        }
        if (unit) {
          inner += unitHtml(unit, st, {
            selected: (u && unit.id === u.id) || (app.editMode && unit.id === app.editPick),
            facing: (u && unit.id === u.id) ? app.plan.dir : null,
            warn: warn[unit.id],
            dmg: dmg[unit.id],
            next: !!nextReady[unit.id],
            order: stanceNo[unit.id] || 0
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
    var fcAll = forecastNow(true);
    var sig = JSON.stringify([app.editMode, app.busy, app.sel, app.plan, app.plans, app.editTool, app.editPick, st.units, st.enemyActs, st.size, st.h, st.ex, st.spawn, st.result, st.mission, st.overrides, fc ? fc.enemies : null, fcAll ? fcAll.allies : null, fcAll ? fcAll.rushes : null, hintsNow(), storeVersion, B.turnMode,
      app.editMode && app.draft ? [app.draft.name, app.draft.texts] : null]);
    if (app.editMode) keepDraft();   // 作りかけを残す（同じなら書かない）
    if (sig === sideSig) return;
    sideSig = sig;
    if (app.editMode) renderEditPanel(); else renderPlayPanel(fc);
  }

  function planText(p, st) {
    var e = R.findUnit(st, p.id);
    if (!e) return '';
    if (p.cancelled) return '予告: ' + DIR_ARROW[p.dir] + ' ' + R.magicName(e.magic) + ' → 先に倒れるので発動しない';
    var out = [];
    (p.finishers || []).forEach(function (f) { out.push(f.name + '！'); });
    var hits = (p.damages || []).map(function (d) {
      var t = R.findUnit(st, d.id);
      return (t ? R.unitLabel(st, t) : d.id) + 'に' + d.amount + (d.dies ? '（倒れる）' : '');
    });
    if (hits.length) out.push(hits.join('、'));
    var changes = (p.tileChanges || []).length;
    if (!out.length) out.push(changes ? '自然が' + changes + 'マス変わる' : '何も起きない');
    return '予告: ' + DIR_ARROW[p.dir] + ' ' + R.magicName(e.magic) + ' → ' + out.join('／');
  }

  function renderPlayPanel(fc) {
    var st = app.state;
    var warn = {}, fa = forecastNow(true), npcIds = {};
    if (fa) fa.allies.forEach(function (p) { npcIds[p.id] = true; if (!shapeOnly()) (p.damages || []).forEach(function (d) { warn[d.id] = (warn[d.id] || 0) + d.amount; }); });   // 展示ステージ③: 構えのダメージは出さない
    if (fc) {
      fc.burn.forEach(function (b) { warn[b.id] = (warn[b.id] || 0) + b.amount; });
      fc.enemyDamage.forEach(function (d) { if (!npcIds[d.by]) warn[d.id] = (warn[d.id] || 0) + d.amount; });
    }
    // 構える味方は選べない札（予告の中身を出す）
    var npcPlan = {};
    if (fa) fa.allies.forEach(function (p) { npcPlan[p.id] = p; });
    var npcHtml = R.alliesOf(st).filter(function (a) { return a.npc; }).map(function (a) {
      return '<div class="ally-card npc"><span class="dot">' + esc(R.magicName(a.magic)) + '</span>' +
        '<span class="info"><b>' + esc(R.unitLabel(st, a)) + '　HP ' + a.hp + '/' + a.maxHp + '　' + DIR_ARROW[a.facing] + '</b>' +
        '<span class="sub">' + (npcPlan[a.id] ? (npcPlan[a.id].order ? (ORDER_MARK[npcPlan[a.id].order] || '') + ' ' : '') + esc(planText(npcPlan[a.id], st)) : '<span class="x-more">構えていない</span>') +
        (warn[a.id] ? '　<span class="danger">予告: ' + warn[a.id] + 'ダメージを受ける' + (warn[a.id] >= a.hp ? '（倒れる）' : '') + '</span>' : '') +
        '</span></span></div>';
    }).join('');
    var al = R.controllableOf(st);
    el.roster.innerHTML = (al.length ? al.map(function (a, i) {
      var no = simul() ? R.stanceOrder(st, a.id) : 0;
      var status = [!simul() ? (a.acted ? '行動済み' : '行動前') : a.stance ? (ORDER_MARK[no] || no) + ' 構えている（' + R.magicName(a.magic) + ' ' + DIR_ARROW[a.facing] + '）' : st.result ? '行動済み' : a.acted ? '待機' : 'まだ構えていない'];
      if (a.stuck) status.push('泥沼: 次は移動できない');
      if (a.burn > 0) status.push('火傷: あと' + a.burn + '回（水か氷で治る）');
      if (st.mission && st.mission.carrier === a.id) status.push('宝を持っている（撃てない）');
      // いつもの状態（行動前・まだ構えていない）は出さない
      if (status[0] === '行動前' || status[0] === 'まだ構えていない') status.shift();
      var cls = 'ally-card' + (a.id === app.sel ? ' selected' : '') + (a.acted ? ' acted' : '') + (a.stance ? ' stanced' : '');
      return '<button type="button" class="' + cls + '" data-id="' + a.id + '">' +
        '<span class="dot">' + esc(R.magicName(a.magic)) + '</span>' +
        '<span class="info"><b>' + (i + 1) + '. ' + esc(R.unitLabel(st, a)) + '　HP ' + a.hp + '/' + a.maxHp + '　' + DIR_ARROW[a.facing] + '</b>' +
        '<span class="sub">' + esc(status.join('・')) +
        (warn[a.id] ? '　<span class="danger">予告: ' + warn[a.id] + 'ダメージを受ける' + (warn[a.id] >= a.hp ? '（倒れる）' : '') + '</span>' : '') +
        '</span></span></button>';
    }).join('') : '<p class="muted">味方がいません（エディットで置けます）</p>') + npcHtml;

    renderOrderPanel(fa);

    var en = R.enemiesOf(st);
    var plans = {};
    if (fc) fc.enemies.forEach(function (p) { plans[p.id] = p; });
    var marchTo = {};
    if (fc) (fc.marches || []).forEach(function (m) { marchTo[m.id] = m; });
    var rushTo = {};
    if (fa) (fa.rushes || []).forEach(function (r) { rushTo[r.id] = r; });
    var rushText = function (r) {
      if (r.reach) {
        var v = R.findUnit(st, r.village);
        var left = r.path.length - r.stop;
        return (v ? R.unitLabel(st, v) : '村') + 'へ走る' + (r.stop ? '（次に' + r.stop + 'マス）' : '') + (left ? '。あと' + left + 'マスで' : '。次の移動で') + '体当たり';
      }
      return '村への道がない' + (r.stop ? '（近くまで' + r.stop + 'マス走って待つ）' : '（その場で待つ）');
    };
    var html = en.map(function (e) {
      var note = (e.stuck ? '（泥沼: 次は移動できない）' : '') + (e.burn > 0 ? '（火傷: あと' + e.burn + '回）' : '');
      return '<div class="enemy-row"><span class="dot">' + esc(e.letter) + '</span><span>' + esc(e.name) + (e.stand === 'rush' ? ' ' : '（' + esc(R.magicName(e.magic)) + '）') + 'HP ' + e.hp + '/' + e.maxHp +
        (warn[e.id] ? ' <span class="danger">予告で -' + warn[e.id] + (warn[e.id] >= e.hp ? '（倒れる）' : '') + '</span>' : '') +
        '<span class="hpbar"><span style="width:' + Math.max(0, e.hp / e.maxHp * 100) + '%"></span></span> ' + DIR_ARROW[e.facing] + esc(note) + '</span>' +
        (rushTo[e.id] ? '<span class="plan">次のターンの始めに: ' + esc(rushText(rushTo[e.id])) + '</span>' : '') +
        (marchTo[e.id] ? '<span class="plan">ターンの終わりに ' + DIR_ARROW[marchTo[e.id].dir] + ' へ1マス進む' + (plans[e.id] ? '。そのまま撃つ' : '') + '</span>' : '') +
        (plans[e.id] ? '<span class="plan">' + esc(planText(plans[e.id], st)) + '</span>' : '') + '</div>';
    }).join('');
    html += '<p class="note' + (st.enemyActs ? ' x-more' : '') + '">' + (st.enemyActs ? '敵は行動する' : '確認用: 敵は動かない') + '設定（エディットで切り替え）</p>';   // いつもと違う（何もしない）ときだけ出したまま
    el.enemyList.innerHTML = en.length ? html : '<p class="muted">敵がいません（エディットで置けます）</p>';

    renderActPanel();
  }

  // 【一斉】発動の順番の一覧（▲▼で並べ替え。構える味方はいつも最後で動かせない）と、合体の予告
  function renderOrderPanel(fa) {
    if (!el.orderPanel) return;
    var st = app.state;
    if (!simul() || app.editMode) { el.orderPanel.hidden = true; el.orderPanel.innerHTML = ''; return; }
    // 予告（fa）の並び ＝ 盤面の番号と同じ。選んでいる味方の、まだ確定していない構えも入る
    var list = (fa ? fa.allies : []).map(function (p) { return { p: p, a: R.findUnit(st, p.id) }; }).filter(function (x) { return x.a; });
    var mine = R.stanceList(st).filter(function (a) { return !a.npc; }).map(function (a) { return a.id; });
    var can = canControl();
    var rows = list.map(function (x, i) {
      var a = x.a, p = x.p, fixed = !!a.npc, k = mine.indexOf(a.id), planned = !fixed && k < 0;
      var res = p && !p.cancelled ? planText(p, st).replace(/^予告: /, '') : '';
      if (shapeOnly() && p) res = DIR_ARROW[p.dir] + ' ' + R.magicName(a.magic);   // 展示ステージ③: 何が起きるかは出さない
      return '<li class="order-row' + (fixed ? ' fixed' : '') + (a.id === app.sel ? ' selected' : '') + '">' +
        '<span class="o-no">' + (ORDER_MARK[i + 1] || (i + 1)) + '</span>' +
        '<span class="o-name"><b>' + esc(R.unitLabel(st, a)) + (planned ? '（選んでいる構え）' : '') + '</b>' + (res ? '<small>' + esc(res) + '</small>' : '') + '</span>' +
        (planned ? '' : fixed ? '<span class="o-fixed">' + esc(ui('orderLast', '最後（動かせない）')) + '</span>'
          : '<span class="o-move"><button type="button" class="o-btn" data-order="' + a.id + '" data-delta="-1" aria-label="1つ前へ"' + (k <= 0 || !can ? ' disabled' : '') + '>▲</button>' +
            '<button type="button" class="o-btn" data-order="' + a.id + '" data-delta="1" aria-label="1つ後ろへ"' + (k >= mine.length - 1 || !can ? ' disabled' : '') + '>▼</button></span>') +
        '</li>';
    }).join('');
    var combos = [];
    if (fa && !shapeOnly()) fa.allies.forEach(function (p) { (p.combos || []).forEach(function (c) { combos.push(comboText({ comboMagics: c.magics }) + ' → ' + finName(c.name) + '！'); }); });
    var waiting = R.controllableOf(st).filter(function (a) { return !a.acted; }).length;
    el.orderPanel.hidden = false;
    el.orderPanel.classList.toggle('x-more', !rows);   // まだ誰も構えていないときは、欄ごと隠す（x-more）
    el.orderPanel.innerHTML = '<h3>' + esc(ui('order', '発動の順番')) + '</h3>' +
      (rows ? '<ol class="order-list">' + rows + '</ol>' : '<p class="muted">まだ誰も構えていません</p>') +
      (combos.length ? '<p class="order-combo">' + combos.map(esc).join('<br>') + '</p>' : '') +
      (waiting ? '<p class="muted x-more">まだ構えていない味方: ' + waiting + '人</p>' : '');
  }

  function renderActPanel() {
    var u = canControl() ? selUnit() : null;
    el.actPanel.classList.toggle('off', !u);
    Array.prototype.forEach.call(el.actPanel.querySelectorAll('.dir'), function (b) {
      b.disabled = !u;
      b.classList.toggle('active', !!u && app.plan.dir === b.getAttribute('data-dir'));
    });
    var shootOk = !!u && R.canShoot(app.state, u, app.plan.to);
    el.btnStay.disabled = !u;
    el.btnShoot.disabled = !shootOk;
    el.btnWait.disabled = !u;
    if (!u) {
      el.actInfo.innerHTML = app.busy ? '処理中…' : '<span class="x-more">' + esc(simul() ? ui('actIdleSimul', '味方を選ぶと、ここで向きを選んで構えられます') : ui('actIdleSingle', '味方を選ぶと、ここで向きを選んで撃てます')) + '</span>';
      el.dirCenter.textContent = '';
      return;
    }
    var moved = app.plan.to[0] !== u.x || app.plan.to[1] !== u.y;
    el.dirCenter.textContent = R.magicName(u.magic);
    el.actInfo.innerHTML = '<b>' + esc(R.unitLabel(app.state, u)) + '</b>　' +
      (moved ? '移動先 (' + app.plan.to[0] + ',' + app.plan.to[1] + ') <button type="button" id="btnCancelMove">移動を取り消す</button>' :
        (R.restancing(u) ? '構え直し<span class="x-more">（移動は戻らない。向きと構えだけ）</span>' : u.stuck ? '泥沼で移動できない<span class="x-more">（その場で撃つ）</span>' : 'その場<span class="x-more">（緑のマスで移動先を選べる）</span>')) +
      '　向き ' + DIR_ARROW[app.plan.dir] +
      (shootOk ? '' : '<br><span class="danger">宝を持つので撃てない（「待機」で移動を確定）</span>');
  }

  var storeVersion = 0;
  // 前の保存（配置だけ）。段0で自分のステージに移すときだけ読む
  function storeGet() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return null; }
  }

  // エディット: カードのゴミ箱（絵文字はフォントで小さく灰色になるので、線で描く）
  var TRASH_SVG = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.8 9.5h6.4L12 4M6.6 6.5v4.5M9.4 6.5v4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // エディット: 駒の一覧に出す短い名前（盤面の駒と同じ文字）
  function chipName(u) {
    if (u.side === 'object') return R.OBJECT_INFO[u.kind].name;
    if (u.side === 'ally') return R.magicName(u.magic);
    return u.stand === 'boss' ? 'ボス' : (u.stand === 'float' ? '取り巻き' : '敵') + u.letter;
  }
  // エディット: 選んだ1体の設定（魔法・向き・指示か動き方・HP）
  function unitCardHtml(st, u) {
    var id = u.id;
    var h = '<div class="u-card ' + u.side + '"><div class="u-card-head">' +
      '<span class="chip-piece ' + u.side + (u.side === 'object' ? ' ' + u.kind : '') + '">' + esc(chipName(u)) + '</span>' +
      '<b>' + esc(R.unitLabel(st, u)) + '</b><span class="muted">(' + u.x + ',' + u.y + ')</span>' +
      '<button type="button" class="u-del" data-uact="remove" data-id="' + id + '" title="消す（Delete）" aria-label="消す">' + TRASH_SVG + '</button></div>';
    if (u.side === 'object') return h + '<div class="u-card-row muted">HP ' + u.maxHp + '</div></div>';
    h += '<div class="u-card-row"><span class="lbl">魔法</span>';
    if (u.side === 'ally') {
      h += '<span class="u-magics">' + R.allyMagics(st).map(function (m) {
        return '<button type="button" class="ut-piece ally' + (u.magic === m ? ' active' : '') + '" data-uact="magic" data-v="' + m + '" data-id="' + id + '">' + esc(R.magicName(m)) + '</button>';
      }).join('') + '</span>';
    } else {
      h += '<select data-id="' + id + '" data-field="magic" aria-label="魔法">' + R.MAGICS.map(function (m) {
        return '<option value="' + m + '"' + (u.magic === m ? ' selected' : '') + '>' + R.magicName(m) + '</option>';
      }).join('') + '</select>';
    }
    h += '</div><div class="u-card-row"><span class="lbl">向き</span><span class="u-dirs">' + R.DIR_ORDER.map(function (d) {
      return '<button type="button" class="' + (u.facing === d ? 'active' : '') + '" data-uact="facing" data-v="' + d + '" data-id="' + id + '" title="' + R.DIRS[d].name + '（矢印キー）">' + DIR_ARROW[d] + '</button>';
    }).join('') + '</span></div>';
    if (u.side === 'ally') {
      h += '<div class="u-card-row"><span class="lbl">指示</span><select data-id="' + id + '" data-field="npc">' +
        '<option value=""' + (u.npc ? '' : ' selected') + '>プレイヤーが動かす</option>' +
        '<option value="1"' + (u.npc ? ' selected' : '') + '>構える味方（毎ターン今の向きで構えて撃つ）</option></select></div>';
    } else {
      h += '<div class="u-card-grid">' + Object.keys(R.PERSONA).map(function (f) {
        var label = { aim: '狙い', avoid: '避ける', cross: '越える', stand: '動き' }[f] || f;
        return '<span class="lbl">' + label + '</span><select data-id="' + id + '" data-field="' + f + '">' + Object.keys(R.PERSONA[f]).map(function (v) {
          return '<option value="' + v + '"' + (u[f] === v ? ' selected' : '') + '>' + esc(R.PERSONA[f][v]) + '</option>';
        }).join('') + '</select>';
      }).join('') +
        '<span class="lbl">HP</span><span><input type="number" class="hp-in" min="1" max="999" step="1" data-id="' + id + '" data-field="hp" value="' + (u.hpBase || u.maxHp) + '">' +
        (u.size > 1 ? ' <span class="muted">体 ' + u.size + '×' + u.size + '</span>' : '') +
        (u.body ? ' <span class="muted">' + (u.body === 'float' ? '浮いている' : esc(u.body)) + '</span>' : '') + '</span></div>';
    }
    return h + '</div>';
  }

  function renderEditPanel() {
    var st = app.state;
    el.tilePalette.innerHTML = R.TILES.map(function (t) {
      var k = 'tile:' + t;
      return '<button type="button" class="' + (app.editTool === k ? 'active' : '') + '" data-tool="' + k + '">' +
        '<span class="swatch t-' + t + '">' + esc(R.TILE_INFO[t].label) + '</span>' + esc(R.TILE_INFO[t].name) + '</button>';
    }).join('');
    // ユニットの道具（オーナー 10/30）: 味方は魔法ごとの駒、敵は1つ（魔法はカードで変える）。選ぶ・動かす・消すは盤面の駒とカードで
    var tb = function (tool, cls, label, title) {
      return '<button type="button" class="' + cls + (app.editTool === tool ? ' active' : '') + '" data-tool="' + tool + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + label + '</button>';
    };
    el.unitTools.innerHTML =
      '<div class="ut-row"><span class="ut-label">味方</span>' + R.allyMagics(st).map(function (m) {
        return tb('ally:' + m, 'ut-piece ally', esc(R.magicName(m)), '味方「' + R.magicName(m) + '」を置く');
      }).join('') + '</div>' +
      '<div class="ut-row"><span class="ut-label">敵</span>' + tb('enemy', 'ut-piece enemy', '敵', '敵を置く（魔法・動き方は置いたあとカードで）') + '</div>';
    // 勝ち方（ルールにある決まりから選ぶ）。足りない置きものがあれば書いておく
    var win = SIO.winOf(R, st);
    el.winSelect.innerHTML = SIO.WINS.map(function (w) {
      return '<option value="' + w.id + '"' + (w.id === win ? ' selected' : '') + '>' + esc(w.name) + '</option>';
    }).join('');
    el.winTurnsLabel.hidden = !(win === 'defense' || win === 'seal');
    if (document.activeElement !== el.winTurns) el.winTurns.value = SIO.turnsOf(R, st);
    var mi = st.mission || {}, lack = [];
    if (win === 'boss' && !R.enemiesOf(st).some(function (e) { return e.stand === 'boss'; })) lack.push('動きが「ボス」の敵がいない（どれか1体を倒しただけで勝ちになる）');
    if ((win === 'defense' || win === 'seal') && !R.objectsOf(st, 'village').length) lack.push('村がない');
    if (win === 'seal' && !R.enemiesOf(st).some(function (e) { return e.stand === 'rush'; }) && !(st.spawn && st.spawn.stand === 'rush')) lack.push('ふさぐ相手（動きが「突進」の敵）がいない');
    if (win === 'escort' && !R.objectsOf(st, 'wagon').length) lack.push('馬車がない');
    if (win === 'escort' && !(mi.goal || []).length) lack.push('ゴールがない');
    if (win === 'retrieve' && !mi.treasure) lack.push('宝がない');
    if (win === 'retrieve' && !(mi.exit || []).length) lack.push('帰り口がない');
    if (!R.controllableOf(st).length) lack.push('動かせる味方がいない');
    el.winNote.textContent = (win === 'boss' && st.ex && st.ex.spawn ? '取り巻きが湧く（③の決まり）。' : '') +
      (st.spawn ? '増援が (' + st.spawn.x + ',' + st.spawn.y + ') から出る（②の決まり）。' : '') +
      (lack.length ? '足りない: ' + lack.join('・') : '');
    var mtools = [['obj:village', '村を置く'], ['obj:wagon', '馬車を置く'], ['mark:goal', 'ゴール'], ['treasure', '宝を置く'], ['mark:exit', '帰り口']];
    el.missionTools.innerHTML = mtools.map(function (t) {
      return '<button type="button" class="' + (app.editTool === t[0] ? 'active' : '') + '" data-tool="' + t[0] + '">' + t[1] + '</button>';
    }).join('');
    // 置いた駒の一覧（押すと選ぶ）と、選んだ1体の設定のカード
    var pick = app.editPick && R.findUnit(st, app.editPick);
    if (!pick) app.editPick = null;
    el.unitList.innerHTML = (st.units.length ? '<div class="u-chips">' + st.units.map(function (u) {
      return '<button type="button" class="u-chip ' + u.side + (pick && u.id === pick.id ? ' on' : '') + '" data-pick="' + u.id + '" title="' + esc(R.unitLabel(st, u)) + '">' +
        '<span class="chip-piece ' + u.side + (u.side === 'object' ? ' ' + u.kind : '') + '">' + esc(chipName(u)) + '</span>' +
        (u.side === 'object' ? '' : '<span class="chip-dir">' + DIR_ARROW[u.facing] + '</span>') + '</button>';
    }).join('') + '</div>' : '<p class="muted">ユニットがいません</p>') +
      (pick ? unitCardHtml(st, pick) : st.units.length ? '<p class="u-card-empty">駒をクリックすると、ここで魔法・向き・動き方を変えられる</p>' : '');
    if (st.overrides) {
      el.unitList.innerHTML += '<p class="note">このシナリオだけの数値（JSON の overrides）: ' +
        esc(Object.keys(st.overrides).map(function (p) { return setLabel(p, st.overrides[p]); }).join('・')) + '</p>';
    }
    el.enemyStill.checked = !st.enemyActs;
    if (document.activeElement !== el.boardW) el.boardW.value = st.size;
    if (document.activeElement !== el.boardH) el.boardH.value = R.rowsOf(st);

    // ステージの名前と会話の窓の文（打っている途中の欄は書き換えない）
    var d = app.draft, tx = d.texts, hint = tx.hint || {};
    var put = function (e, v) { if (document.activeElement !== e && e.value !== v) e.value = v; };
    put(el.saveName, d.name);
    put(el.txStart, SIO.linesToText(tx.scenes.start));
    put(el.txWin, SIO.linesToText(tx.scenes.win));
    put(el.txLose, SIO.linesToText(tx.scenes.lose));
    put(el.txHintSimul, hint.simul || '');
    put(el.txHintSingle, hint.single || '');
  }

  function renderHint() {
    var st = app.state;
    var h = el.hint;
    h.className = 'hint';
    h.title = '';
    if (app.message && app.message.until > Date.now()) {
      h.textContent = app.message.text;
      h.classList.add('warn');
      return;
    }
    if (app.busy) { h.textContent = '処理中…（盤面のクリックかキーで飛ばせます）'; h.classList.add('busy'); return; }
    if (st.result && !app.editMode) {
      // チュートリアルのクリア・負けの文（texts.js）があればそれ、なければルールの文
      var stx = stageTexts(st.stage), own = stx && (st.result === 'win' ? stx.win : stx.lose);
      h.textContent = own || st.resultText || (st.result === 'win' ? '勝利！ 敵を全員倒しました' : '敗北… 味方が全員倒れました');
      if (own && st.resultText) h.title = st.resultText;
      h.classList.add('result');
      return;
    }
    if (app.editMode) {
      var tool = app.editTool;
      var off = '（道具をもう一度押すとやめる）';
      if (tool.indexOf('tile:') === 0) h.textContent = 'マスをクリック（ドラッグ）で「' + R.TILE_INFO[tool.slice(5)].name + '」を塗る。駒のマスは、となりからドラッグで塗れる';
      else if (tool === 'pick') h.textContent = app.editPick ? '駒をドラッグで動かす・矢印キーで向き・ゴミ箱か Delete で消す' : '駒をクリックで選ぶ・ドラッグで動かす。右で置くものを選ぶと、マスに置ける';
      else if (tool.indexOf('ally:') === 0) h.textContent = '味方「' + R.magicName(tool.slice(5)) + '」を置くマスをクリック' + off;
      else if (tool.indexOf('obj:') === 0) h.textContent = '「' + R.OBJECT_INFO[tool.slice(4)].name + '」を置くマスをクリック' + off;
      else if (tool.indexOf('mark:') === 0) h.textContent = '「' + (tool === 'mark:goal' ? 'ゴール' : '帰り口') + '」の印をつけるマスをクリック（もう一度で外す）';
      else if (tool === 'treasure') h.textContent = '宝を置くマスをクリック（1つだけ。置き直すと移る）';
      else h.textContent = '敵を置くマスをクリック' + off;
      return;
    }
    var u = selUnit();
    if (!u) {
      if (R.sealReady(st)) { h.textContent = ui('sealReady', '村への道をふさいだ！「クリアする」（C）でクリアできる'); h.classList.add('ready'); return; }   // ステージ②
      // 【一斉】全員構えたら発動へ
      if (simul() && R.controllableOf(st).length && R.allAlliesActed(st)) { h.textContent = ui('readyToFire', '全員構えた。「発動」（T）'); h.classList.add('ready'); return; }
      h.textContent = ui('pickAlly', '味方をクリック（または 1〜3 キー）で選ぶ'); h.classList.add('guide'); return;   // 操作の案内
    }
    h.textContent = R.restancing(u) ? ui('guideRestance') : simul() ? ui('guideSimul') : ui('guideSingle');
    h.classList.add('guide');
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
    if (c && app.editMode && app.stroke && (e.buttons & 1)) applyEdit(c.x, c.y, true);
  });
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
  el.btnRetry.addEventListener('click', retry);
  el.btnSealWin.addEventListener('click', doSealWin);
  el.btnWait.addEventListener('click', function () { doAct(false); });
  el.btnEndTurn.addEventListener('click', doEndTurn);
  el.btnUndo.addEventListener('click', undo);
  el.btnReset.addEventListener('click', reset);
  el.btnEdit.addEventListener('click', function () { setEditMode(!app.editMode); });
  el.btnEditDone.addEventListener('click', function () { setEditMode(false); });
  if (el.orderPanel) el.orderPanel.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-order]');
    if (b && !b.disabled) reorder(b.getAttribute('data-order'), Number(b.getAttribute('data-delta')));
  });

  // 遊び方（texts.js の操作の案内。ターンの形に合う行だけ）。初めて開いたときに1回だけ自動で出す（閉じたら覚える）
  var HOWTO_KEY = 'caffilia-howto-seen';
  function renderHowto() {
    el.howtoTitle.textContent = ui('howtoTitle', '遊び方');
    el.howtoClose.textContent = ui('howtoStart', 'はじめる');
    el.howtoList.innerHTML = ((TX().ui || {}).howto || []).filter(modeOk).map(function (l) { return '<li>' + esc(l.text) + '</li>'; }).join('');
  }
  function setHowto(on) {
    el.howto.hidden = !on;
    if (on) el.howtoClose.focus();
    else { try { window.localStorage.setItem(HOWTO_KEY, '1'); } catch (e) { /* 覚えられなくても遊べる */ } }
  }
  el.btnHowto.addEventListener('click', function () { setHowto(true); el.btnHowto.blur(); });
  el.howtoClose.addEventListener('click', function () { setHowto(false); });
  el.howto.addEventListener('click', function (e) { if (e.target === el.howto) setHowto(false); });
  el.howto.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); setHowto(false); }
  });
  renderHowto();
  app.simul = simul;
  app.modeOk = modeOk;

  function onToolClick(e) {
    var b = e.target.closest('[data-tool]');
    if (!b) return;
    var t = b.getAttribute('data-tool');
    app.editTool = app.editTool === t ? 'pick' : t;   // 持っている道具をもう一度押すと、道具なし（駒を選ぶ・動かすだけ）
    render();
  }
  el.tilePalette.addEventListener('click', onToolClick);
  el.unitTools.addEventListener('click', onToolClick);
  el.missionTools.addEventListener('click', onToolClick);
  // 勝ち方（ボスの決まりを外すときは中身を覚えておき、ボスに戻したら使う）
  function applyWin() {
    var st = app.state;
    if (st.ex) app.draft.exKeep = SIO.clone(st.ex);
    pushHistory();
    app.state = SIO.setWin(R, st, el.winSelect.value, el.winTurns.value, app.draft.exKeep);
    render();
  }
  el.winSelect.addEventListener('change', applyWin);
  el.winTurns.addEventListener('change', applyWin);
  el.unitList.addEventListener('change', function (e) {
    var s = e.target.closest('select, input');
    if (!s) return;
    var id = s.getAttribute('data-id');
    var field = s.getAttribute('data-field');
    if (!field) return;
    var res = field === 'magic' ? R.editSetMagic(app.state, id, s.value)
      : field === 'facing' ? R.editSetFacing(app.state, id, s.value)
      : field === 'npc' ? R.editSetNpc(app.state, id, !!s.value)
      : field === 'hp' ? SIO.setHp(R, app.state, id, s.value)
      : R.editSetPersona(app.state, id, field, s.value);
    if (res.ok) { pushHistory(); app.state = res.state; render(); } else { say(res.error); sideSig = ''; render(); }
  });
  // 駒の一覧を押すと選ぶ。カードの魔法・向き・消す
  el.unitList.addEventListener('click', function (e) {
    var b = e.target.closest('[data-pick], [data-uact]');
    if (!b) return;
    if (b.hasAttribute('data-pick')) { app.editPick = b.getAttribute('data-pick'); render(); return; }
    editUnitAct(b.getAttribute('data-uact'), b.getAttribute('data-id'), b.getAttribute('data-v'));
  });
  function editUnitAct(act, id, v) {
    var u = R.findUnit(app.state, id);
    if (!u || (act === 'magic' && u.magic === v) || (act === 'facing' && u.facing === v)) return;
    var res = act === 'magic' ? R.editSetMagic(app.state, id, v)
      : act === 'facing' ? R.editSetFacing(app.state, id, v)
      : act === 'remove' ? R.editRemoveUnit(app.state, u.x, u.y) : null;
    if (!res) return;
    if (!res.ok) { say(res.error); return; }
    pushHistory();
    app.state = res.state;
    if (act === 'remove') app.editPick = null;
    render();
  }
  // 確認用: 敵を動かさない（ふつうは動く。オーナー 10/30）
  el.enemyStill.addEventListener('change', function () {
    pushHistory();
    app.state = R.editSetEnemyActs(app.state, !el.enemyStill.checked).state;
    render();
  });
  // 盤面の横・縦。置いた物は同じ位置のまま（はみ出した物は外す）
  el.btnResize.addEventListener('click', function () {
    var r = SIO.resize(R, app.state, el.boardW.value, el.boardH.value);
    pushHistory();
    app.state = r.state;
    say('盤面を 横' + r.state.size + '×縦' + R.rowsOf(r.state) + ' にしました' + (r.dropped ? '（はみ出した ' + r.dropped + 'つを外した）' : ''));
    render();
  });
  el.btnClearTiles.addEventListener('click', function () {
    var s = R.clone(app.state);
    for (var i = 0; i < s.tiles.length; i++) s.tiles[i] = 'empty';
    pushHistory();
    app.state = s;
    render();
  });

  // ステージの名前と会話の窓の文（欄を離れたら入る。1手戻すで戻せる）。自分のステージの中で名前が重なる変え方は受け付けない
  el.saveName.addEventListener('change', function () {
    var v = el.saveName.value.trim().replace(/^my:/, '');
    if (!v || v === app.draft.name) { el.saveName.value = app.draft.name; return; }
    if ((stageStore() || {})[v]) { say('「' + v + '」は自分のステージにもうあります。ほかの名前にしてください'); el.saveName.value = app.draft.name; return; }
    pushHistory();
    app.draft.name = v;
    render();
  });
  [['txStart', 'start'], ['txWin', 'win'], ['txLose', 'lose']].forEach(function (p) {
    el[p[0]].addEventListener('change', function () {
      var lines = SIO.textToLines(el[p[0]].value);
      if (JSON.stringify(lines) === JSON.stringify(app.draft.texts.scenes[p[1]])) return;
      pushHistory();
      app.draft.texts.scenes[p[1]] = lines;
      render();
    });
  });
  [['txHintSimul', 'simul'], ['txHintSingle', 'single']].forEach(function (p) {
    el[p[0]].addEventListener('change', function () {
      var t = app.draft.texts;
      if ((t.hint[p[1]] || '') === el[p[0]].value) return;
      pushHistory();
      t.hint[p[1]] = el[p[0]].value;
      render();
    });
  });

  // 保存ボタンはない（直すたびに自分のステージに自動で残る。IMPROVE_v3 段0）。開く・消す・新しく作るは、開発の最初の画面から（段2）
  el.btnTestPlay.addEventListener('click', function () { setEditMode(false); });
  // 新しいステージ: 作り始めた時点で、自分のステージが1つ増える。味方3人（初期の魔法）と敵1体から（R.createState の初めの形）
  function newStage(size) { return { state: R.createState({ size: size }), name: '新しいステージ', texts: null }; }
  // ファイルに書き出す・読み込む: 段4（共有）ができるまでの、ブラウザの外に逃がす道（段4でなくす）
  function stageFile() {
    return SIO.toFile({ name: app.draft.name, def: SIO.toDef(R, app.state, app.draft.name), texts: app.draft.texts, savedAt: new Date().toLocaleString('ja-JP') });
  }
  function fileSafe(t) { return String(t).replace(/[\\/:*?"<>|\s]+/g, '_'); }
  el.btnDownload.addEventListener('click', function () {
    try {
      var blob = new Blob([stageFile()], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'cafilia-stage-' + fileSafe(app.draft.name) + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
      say('「' + a.download + '」に書き出しました');
    } catch (e) { say('ファイルに書き出せませんでした'); }
  });
  // ステージのファイル・前の「配置」の JSON のどちらも読める。読んだら自分のステージが1つ増える（名前が重なったら番号を付ける）
  function importStage(text, fileName, fallbackName) {
    var f = SIO.fromFile(R, text, fallbackName);
    if (!f.ok) { say('読み込めません: ' + f.error); return; }
    delete f.state.stage;
    openDraft({ state: f.state, name: f.name, texts: f.texts }, function (nm) {
      return 'ファイル「' + fileName + '」を、自分のステージ「' + nm + '」として読み込んだ（▶ テストプレイで遊べる）';
    });
  }
  el.fileInput.addEventListener('change', function () {
    var f = el.fileInput.files && el.fileInput.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      importStage(String(reader.result), f.name, f.name.replace(/\.json$/i, '').replace(/^cafilia-(stage|layout)-?/, ''));
      el.fileInput.value = '';
    };
    reader.readAsText(f);
  });

  // ---------------------------------------------------------------
  // 展示の並び（IMPROVE_v3 段3）: 展示モードで遊ぶステージと順番。開発モードの「展示の並び」で決める
  //   { start: はじめから遊ぶ の順番, pick: 選んで遊ぶ に出すもの }。中身は 'tut:tut1'（チュートリアル）か 'my:名前'（自分のステージ）。
  //   段3 では、このブラウザ（localStorage）に残し、自分のステージから足す。段4 で共有（Cloudflare）に置き、みんなのステージから足す形に替える
  // ---------------------------------------------------------------
  var LINEUP_KEY = 'cafilia-mock-exhibit-lineup';
  function lineupDefault() { return { start: EXHIBIT_STAGES.map(function (id) { return 'tut:' + id; }), pick: [] }; }
  function lineupGet() {
    var v = null;
    try { v = JSON.parse(window.localStorage.getItem(LINEUP_KEY) || 'null'); } catch (e) { v = null; }
    return v && Array.isArray(v.start) && Array.isArray(v.pick) ? v : lineupDefault();
  }
  function lineupSet(v) { try { window.localStorage.setItem(LINEUP_KEY, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function refKind(ref) { return String(ref).slice(0, String(ref).indexOf(':')); }
  function refId(ref) { return String(ref).slice(String(ref).indexOf(':') + 1); }
  // 並びの1つが、今あるステージか（自分のステージは、消すと見つからない。名前を変えたときは並びも付け替える）
  function refOk(ref) {
    if (refKind(ref) === 'tut') return EXHIBIT_STAGES.indexOf(refId(ref)) >= 0;
    var rec = refKind(ref) === 'my' ? (stageStore() || {})[refId(ref)] : null;
    return !!(rec && SIO.build(R, rec.def).ok);
  }
  function refName(ref) { return refKind(ref) === 'tut' ? stageName(R.findPreset(refId(ref))) : refId(ref); }
  function inLineup(ref) { var v = lineupGet(); return v.start.indexOf(ref) >= 0 || v.pick.indexOf(ref) >= 0; }
  function renameInLineup(from, to) {
    var v = lineupGet(), a = 'my:' + from, b = 'my:' + to;
    if (!inLineup(a)) return;
    ['start', 'pick'].forEach(function (k) { v[k] = v[k].map(function (r) { return r === a ? b : r; }); });
    lineupSet(v);
  }
  // 並びの1つを読む。自分のステージは、チュートリアルと同じ道で読む（R.PRESETS に足して loadScenario）
  function loadRef(ref) {
    if (refKind(ref) === 'tut') { loadScenario(refId(ref)); return; }
    var name = refId(ref), rec = (stageStore() || {})[name], def = SIO.clone(rec.def);
    def.id = SIO.PREFIX + name; def.name = name; def.custom = true; def.tutorial = true;
    registerStage(def, fillTexts(rec.texts, name));
    loadScenario(def.id);
  }

  // ---------------------------------------------------------------
  // 展示モードの流れ（IMPROVE_v3 段3）
  //   最初の画面 → [はじめから遊ぶ] 並び（はじめから）の順に1つずつ → ありがとう！
  //             → [ステージを選んで遊ぶ] 並び（選んで遊ぶ）の一覧から1つ → クリア！
  //   ありがとう！・クリア！では [最初の画面に戻る] [ほかのステージで遊ぶ]。文は texts.js の ui に置けば替わる（なければ【仮】の文）
  // ---------------------------------------------------------------
  // 遊べる並び（見つからないものは飛ばす）。どちらも空なら、チュートリアル①②③を「はじめから」にする【仮】
  function exhibitLists() {
    var v = lineupGet(), start = v.start.filter(refOk), pick = v.pick.filter(refOk);
    if (!start.length && !pick.length) start = lineupDefault().start;
    return { start: start, pick: pick };
  }
  function renderExhibitHome(view) {
    var L = exhibitLists();
    var btn = function (attr, label, cls) { return '<button type="button" class="' + (cls || 'home-stage') + '" ' + attr + '>' + esc(label) + '</button>'; };
    var back = btn('data-ex="title"', ui('exBackTitle', '最初の画面に戻る'));
    var other = L.pick.length ? btn('data-ex="pick"', ui('exOther', 'ほかのステージで遊ぶ'), 'primary home-stage') : '';
    if (view === 'pick') {
      el.home.innerHTML = '<h2 class="ex-head">' + esc(ui('exPick', 'ステージを選んで遊ぶ')) + '</h2>' +
        '<div class="home-list ex-menu">' + L.pick.map(function (r) { return btn('data-play="' + esc(r) + '"', refName(r)); }).join('') + '</div>' +
        '<div class="home-list ex-menu">' + back + '</div>';
    } else if (view === 'thanks' || view === 'clear') {
      el.home.innerHTML = '<h2 class="ex-head big">' + esc(view === 'thanks' ? ui('exThanks', 'ここまで遊んでくれてありがとう！') : ui('exClear', 'クリア！')) + '</h2>' +
        '<div class="home-list ex-menu">' + back + other + '</div>';
    } else {
      el.home.innerHTML = '<h2 class="ex-head big">' + esc(ui('exTitle', 'カフィーリア')) + '</h2>' +
        '<div class="home-list ex-menu">' +
        (L.start.length ? btn('data-ex="start"', ui('exStart', 'はじめから遊ぶ'), 'primary home-stage') : '') +
        (L.pick.length ? btn('data-ex="pick"', ui('exPick', 'ステージを選んで遊ぶ')) : '') + '</div>';
    }
  }
  // 並びの i 番目から遊ぶ（見つからなくなったものは飛ばす）
  function exhibitPlay(kind, list, i) {
    while (i < list.length && !refOk(list[i])) i++;
    if (i >= list.length) { exhibitScreen(kind === 'start' ? 'thanks' : 'clear'); return; }
    app.run = { kind: kind, list: list, i: i };
    showHome(false);
    loadRef(list[i]);
    app.history = [];   // 前のステージには「1手戻す」で戻らない
    render();
  }
  function exhibitScreen(view) {
    if (app.busy) skipPlayback();
    if (app.closeDialog) app.closeDialog();
    app.run = null;
    app.sel = null; clearPlans();
    app.history = [];
    showHome(true, view);
    render();
  }

  // ---------------------------------------------------------------
  // 開発モードの「展示の並び」（IMPROVE_v3 段3）: 開いたときに注意を出す。並べ替え（ドラッグ）・外す・足すは、
  //   「この並びで展示する」→ 確かめで「はい」を押すまで展示モードを変えない（app.lineupDraft の中だけ）
  // ---------------------------------------------------------------
  function lineupDirty() { return JSON.stringify(app.lineupDraft) !== JSON.stringify(lineupGet()); }
  function renderLineup() {
    var d = app.lineupDraft, dirty = lineupDirty();
    var item = function (list, r, i) {
      var ok = refOk(r);
      return '<li class="lu-item' + (ok ? '' : ' missing') + '" data-i="' + i + '">' +
        '<span class="lu-grip" data-grip="' + list + '" title="ドラッグで並び替え">≡</span>' +
        '<span class="lu-name">' + esc(refName(r)) + '<small>' + (refKind(r) === 'tut' ? 'チュートリアル' : '自分のステージ') + '</small>' +
        (ok ? '' : '<small class="danger">見つからない（展示では飛ばす）</small>') + '</span>' +
        '<button type="button" class="lu-out" data-out="' + list + '" data-i="' + i + '">外す</button></li>';
    };
    var sec = function (list, title, note) {
      return '<section class="home-sec"><h3>' + esc(title) + ' <small>' + esc(note) + '</small></h3><ol class="lu-list" data-list="' + list + '">' +
        (d[list].length ? d[list].map(function (r, i) { return item(list, r, i); }).join('') : '<li class="lu-empty muted">まだありません（展示では、この段のボタンを出さない）</li>') + '</ol></section>';
    };
    var opts = EXHIBIT_STAGES.map(function (id) { return '<option value="tut:' + id + '">' + esc(stageName(R.findPreset(id))) + '（チュートリアル）</option>'; }).join('') +
      ownList().map(function (nm) { return '<option value="my:' + esc(nm) + '">' + esc(nm) + '（自分のステージ）</option>'; }).join('');
    el.home.innerHTML = '<h2>展示の並び <small>展示モードで遊ぶステージと順番</small></h2>' +
      '<p class="lu-warn">⚠ 注意！ここを変えると、展示モードの並びが変わります（今はこのブラウザの展示モード。共有ができたら、どのパソコンでも変わります）</p>' +
      sec('start', 'はじめから遊ぶ の順番', 'ドラッグで並び替え') +
      sec('pick', '選んで遊ぶ に出すもの', '開発で選んだものだけが、展示の一覧に出る') +
      '<section class="home-sec"><h3>＋ 足す <small>チュートリアル・自分のステージから（共有ができたら、みんなのステージから）</small></h3>' +
      '<div class="row"><select id="luAdd" aria-label="足すステージ">' + opts + '</select>' +
      '<button type="button" data-add="start">はじめから に足す</button><button type="button" data-add="pick">選んで遊ぶ に足す</button></div></section>' +
      '<div class="home-list"><button type="button" class="primary" data-lu-save="1"' + (dirty ? '' : ' disabled') + '>この並びで展示する</button>' +
      '<button type="button" data-lu-back="1">' + (dirty ? 'やめて一覧に戻る（変えたところは捨てる）' : '一覧に戻る') + '</button></div>' +
      (dirty ? '<p class="note">まだ展示モードは変わっていません。「この並びで展示する」を押すと変わります。</p>' : app.lineupSaved ? '<p class="note">展示モードの並びを、この並びにしました。</p>' : '');
  }
  function lineupAction(b) {
    var d = app.lineupDraft;
    app.lineupSaved = false;
    if (b.hasAttribute('data-out')) { d[b.getAttribute('data-out')].splice(Number(b.getAttribute('data-i')), 1); renderLineup(); return true; }
    if (b.hasAttribute('data-add')) {
      var list = b.getAttribute('data-add'), ref = (el.home.querySelector('#luAdd') || {}).value;
      if (!ref) return true;
      if (d[list].indexOf(ref) >= 0) { window.alert('「' + refName(ref) + '」は、もうこの段に入っています'); return true; }
      d[list].push(ref);
      renderLineup();
      return true;
    }
    if (b.hasAttribute('data-lu-save')) {
      if (!window.confirm('本当に変えますか？\n展示モードの並びが、この並びに変わります。')) return true;
      if (!lineupSet(d)) { window.alert('残せませんでした'); return true; }
      app.lineupDraft = SIO.clone(d);
      app.lineupSaved = true;
      renderLineup();
      return true;
    }
    if (b.hasAttribute('data-lu-back')) { app.homeView = 'list'; renderHome(); return true; }
    return false;
  }
  // ドラッグで並び替え（≡ をつかむ。同じ段の中で動かす）
  (function () {
    var drag = null;
    el.home.addEventListener('pointerdown', function (e) {
      var g = e.target.closest && e.target.closest('[data-grip]');
      if (!g || e.button > 0) return;
      e.preventDefault();
      var li = g.closest('.lu-item');
      drag = { list: g.getAttribute('data-grip'), li: li, ol: li.parentNode };
      li.classList.add('dragging');
      try { g.setPointerCapture(e.pointerId); } catch (x) { /* つかめなくても、押した所までは動く */ }
    });
    el.home.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var items = Array.prototype.filter.call(drag.ol.children, function (x) { return x !== drag.li && x.classList.contains('lu-item'); });
      var before = items.filter(function (x) { var r = x.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; })[0] || null;
      if (before !== drag.li.nextSibling) drag.ol.insertBefore(drag.li, before);
    });
    var end = function () {
      if (!drag) return;
      var d = app.lineupDraft, old = d[drag.list];
      d[drag.list] = Array.prototype.map.call(drag.ol.querySelectorAll('.lu-item'), function (x) { return old[Number(x.getAttribute('data-i'))]; });
      drag = null;
      app.lineupSaved = false;
      renderLineup();
    };
    el.home.addEventListener('pointerup', end);
    el.home.addEventListener('pointercancel', end);
  })();

  // ---------------------------------------------------------------
  // 開発モードの最初の画面（IMPROVE_v3 段2）: チュートリアルと自分のステージの一覧
  //   ステージを押すと遊ぶ側で開く（E で作る側へ。チュートリアルは「〜のコピー」が自分のステージにできる）。
  //   「＋ 新しく作る」は作る側で開く。自分のステージは確かめてから消せる。⌂ で、いつでもここへ戻る（作っていた盤面は残る）
  // ---------------------------------------------------------------
  function ownList() {
    var stages = stageStore() || {};
    return Object.keys(stages).sort(function (a, b) { return (stages[b].at || 0) - (stages[a].at || 0); });   // 新しく直した順
  }
  function renderHome() {
    if (EXHIBIT) { renderExhibitHome(app.homeView); return; }
    if (app.homeView === 'lineup') { renderLineup(); return; }
    var stages = stageStore(), mine = ownList(), mig = migrateInfo();
    el.home.innerHTML = '<h2>開発 <small>ステージを押すと遊べる。E（✎ エディット）で作る側へ</small></h2>' +
      '<section class="home-sec"><h3>チュートリアル <small>作る側にすると、写しが自分のステージにできる（元は変わらない）</small></h3><div class="home-list">' +
      EXHIBIT_STAGES.map(function (id) { return '<button type="button" class="home-stage" data-open="tut:' + id + '">' + esc(stageName(R.findPreset(id))) + '</button>'; }).join('') +
      '</div></section>' +
      '<section class="home-sec"><h3>自分のステージ <small>このブラウザに自動で残る。新しく直した順</small></h3><div class="home-list">' +
      (mine.length ? mine.map(function (nm) {
        return '<span class="home-own"><button type="button" class="home-stage" data-open="my:' + esc(nm) + '">' + esc(nm) + '</button>' +
          '<button type="button" class="home-del" data-del="' + esc(nm) + '" title="「' + esc(nm) + '」を消す">消す</button></span>';
      }).join('') : '<p class="muted">まだありません</p>') + '</div>' +
      (stages === null ? '<p class="note">この環境ではブラウザに残せません。エディットの「ファイルに書き出す」を使ってください。</p>' : '') +
      (mig && mig.failed ? '<p class="note">前の作りかけ・前の保存のうち ' + mig.failed + 'つは今の形に直せず、移していません（消さずに残しています）。</p>' : '') +
      '</section>' +
      '<div class="home-list"><button type="button" class="primary home-new" data-new="1">＋ 新しく作る</button>' +
      '<button type="button" class="home-new" data-lineup="1">展示の並び</button></div>';
  }
  // 最初の画面を出す・しまう。view: 開発は 'list'（一覧）・'lineup'（展示の並び）、展示は 'title'・'pick'・'thanks'・'clear'
  function showHome(on, view) {
    app.home = on;
    if (on) app.homeView = view || (EXHIBIT ? 'title' : 'list');
    el.home.hidden = !on;
    document.body.classList.toggle('at-home', on);
    if (on) renderHome();
  }
  // 最初の画面に戻る。エディット中なら、その盤面を自分のステージに残してから
  function goHome() {
    if (app.busy) skipPlayback();
    if (app.editMode) {
      app.draft.state = R.clone(app.state);
      app.editHist = app.history;
      app.editMode = false;
    }
    keepDraft();
    if (app.closeDialog) app.closeDialog();
    app.sel = null; clearPlans(); app.editPick = null;
    app.history = [];
    showHome(true);
    render();
  }
  // 自分のステージを遊ぶ（テストプレイ。E で、そのステージを作る側へ）
  function playOwn(name) {
    var d = draftFromRecord(name, (stageStore() || {})[name]);
    if (!d) { window.alert('読めません: 「' + name + '」'); return; }
    showHome(false);
    if (!(app.draft && app.draft.key === name)) startDraft(d);   // 開いていたステージなら、作っていた盤面（1手戻すの履歴も）のまま
    testPlay();
  }
  // 新しく作る: 作る側で開く（自分のステージが1つ増える）
  function newFromHome() {
    showHome(false);
    startDraft(newStage(B.boardSize));   // エディットの外で替える（前のステージは、その盤面のまま残る）
    app.editMode = true;
    app.history = app.editHist;
    app.state = R.clone(app.draft.state);
    app.editPick = null;
    keepDraft();
    var label = '新しいステージ「' + app.draft.name + '」を作った（味方3人・敵1体）';
    addLog(label, 'system');
    say(label);
    render();
  }
  // 自分のステージを消す: 確かめてから（元に戻せない）
  function deleteOwn(name) {
    var stages = stageStore();
    if (!stages || !stages[name]) return;
    if (inLineup('my:' + name)) { window.alert('「' + name + '」は展示の並びに入っているので消せません。展示の並びから外すと消せます'); return; }
    if (!window.confirm('自分のステージ「' + name + '」を消します。元に戻せません。消しますか？')) return;
    delete stages[name];
    if (!stageStoreSet(stages)) { window.alert('消せませんでした'); return; }
    if (app.draft && app.draft.key === name) app.draft = null;   // 前に開いていたステージなら、作っていた盤面も手放す
    renderHome();
  }
  el.home.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button');
    if (!b) return;
    if (EXHIBIT) {   // 展示モードの最初の画面・ありがとう！・選んで遊ぶ
      var ex = b.getAttribute('data-ex'), play = b.getAttribute('data-play');
      if (ex === 'start') exhibitPlay('start', exhibitLists().start, 0);
      else if (ex) exhibitScreen(ex);
      else if (play) exhibitPlay('pick', [play], 0);
      return;
    }
    if (app.homeView === 'lineup') { lineupAction(b); return; }
    if (b.hasAttribute('data-lineup')) { app.lineupDraft = lineupGet(); app.lineupSaved = false; app.homeView = 'lineup'; renderLineup(); return; }
    if (b.hasAttribute('data-del')) { deleteOwn(b.getAttribute('data-del')); return; }
    if (b.hasAttribute('data-new')) { newFromHome(); return; }
    var open = b.getAttribute('data-open') || '', kind = open.slice(0, open.indexOf(':')), name = open.slice(open.indexOf(':') + 1);
    if (kind === 'tut') { showHome(false); loadScenario(name); }
    else if (kind === 'my') playOwn(name);
  });
  el.btnHome.addEventListener('click', goHome);

  document.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (app.home) return;   // 最初の画面では、盤面のキーは使わない
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undo(); }
      return;
    }
    var k = e.key;
    if (app.busy) {
      if (k !== 'Shift') { e.preventDefault(); skipPlayback(); }
      return;
    }
    // 展示モード: 出しているものの操作だけ（味方 1〜、向き、構える Enter・その場で Space・待機 W、発動 T、1手戻す Z、クリアする C、取り消し Esc）。
    //   開発モードは、これに エディット ⇄ テストプレイ の E と、エディットで駒を消す Delete を足す
    if (!(/^[1-9]$/.test(k) || KEY_DIR[k] || /^(Enter| |w|W|t|T|z|Z|c|C|Escape)$/.test(k) || (!EXHIBIT && /^([eE]|Delete|Backspace)$/.test(k)))) return;
    if (k === 'z' || k === 'Z') { undo(); return; }
    if (k === 'e' || k === 'E') { setEditMode(!app.editMode); return; }
    if (app.editMode) {
      if (k === 'Escape') { if (app.editPick) app.editPick = null; else app.editTool = 'pick'; render(); }   // 選んだ駒を外す → 道具を外す
      // 選んだ駒: 矢印キーで向き、Delete で消す
      if (app.editPick && KEY_DIR[k]) { e.preventDefault(); editUnitAct('facing', app.editPick, KEY_DIR[k]); }
      if (app.editPick && (k === 'Delete' || k === 'Backspace')) { e.preventDefault(); editUnitAct('remove', app.editPick); }
      return;
    }
    if (k === 't' || k === 'T') { doEndTurn(); return; }
    if (k === 'c' || k === 'C') { doSealWin(); return; }   // ステージ②: ふさぎきったらクリア
    if (k >= '1' && k <= '9') {
      var a = R.controllableOf(app.state)[Number(k) - 1];
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
  app.say = say;
  app.addLog = function (t) { addLog(t, 'system'); };
  app.clearCache = function () { app.cache = {}; sideSig = ''; };

  // 展示モードとの切り替え（mode.js。オーナー 10/30）: 右下の点を2秒長押ししたときだけ効く。普通のクリックでは何も起きない。
  //   押している間は .holding（細い線が伸びる）。離す・外れると取りやめ。印のない URL で開いた展示モードでは何もしない（線も出さない）。
  //   切り替える前に、エディットの作りかけを残す（開発モードは、開くと最初の画面から。作っていた盤面は自分のステージに残っている）
  var MODE_HOLD_MS = 2000;
  (function () {
    var b = $('modeSwitch'), M = window.CafiliaMode, timer = null;
    if (!b || !M) return;
    if (!EXHIBIT) b.title = '2秒長押しで展示モードへ';
    function stop() { if (timer) clearTimeout(timer); timer = null; b.classList.remove('holding'); }
    b.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      stop();
      if (e.button > 0 || !M.canToggle()) return;
      b.classList.add('holding');
      timer = setTimeout(function () {
        timer = null;
        if (app.draft) keepDraft();
        if (!M.toggle()) b.classList.remove('holding');
      }, MODE_HOLD_MS);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (n) { b.addEventListener(n, stop); });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  })();

  // 展示モードは最初の画面（はじめから遊ぶ・ステージを選んで遊ぶ）から。開発モードは最初の画面（ステージの一覧）から
  addLog('ようこそ。敵の予告（紫）を見てから、味方を選び、立ち位置と向きを決めて撃ってください', 'system');
  if (EXHIBIT) {
    app.state = begin(app.state);
    app.resetPoint = R.clone(app.state);
    showHome(true, 'title');
    render();
  } else {
    migrateOldStages();   // 段0: 前の作りかけ・前の保存を、自分のステージに一度だけ移す
    app.state = begin(app.state);
    app.resetPoint = R.clone(app.state);
    showHome(true);
    render();
  }
  if (!(function () { try { return window.localStorage.getItem(HOWTO_KEY); } catch (e) { return null; } })()) setHowto(true);
})();
