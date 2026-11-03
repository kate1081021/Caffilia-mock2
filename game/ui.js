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
  var EXHIBIT_NEXT_MS = 400;                      // クリアしてから右下の「次へ」を受け付けるまでの間（勢いの連打で飛ばさないように）

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
  // 向きのキー: 矢印と WASD（展示も開発も。オーナー 10/31）。W はもう「待機」ではない
  var KEY_DIR = { ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down', ArrowLeft: 'left', w: 'up', a: 'left', s: 'down', d: 'right', W: 'up', A: 'left', S: 'down', D: 'right' };
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
    plan: null,           // 選んでいる味方の向き { dir }（移動は押した時点で本当に動く。R.move）
    dirs: {},             // 味方ごとに選んだ向き { id: dir }。ほかの味方を選んでも捨てない（オーナー 10/30）。撃つ・構える・待機・ターンの終わりで消える
    info: null,           // 押したマス [x, y]。盤面の左上に、そのマスの情報を出す（オーナー 10/30）
    exNextGo: null,       // 展示: クリアしたあと、右下の「次へ」（か Enter）で次へ進む（IMPROVE_controls 5-2）
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
    sharing: false,       // 共有している途中（段4）
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
    'btnGo', 'btnUndo', 'btnReset', 'btnEdit', 'side', 'playSide', 'playPanel', 'ctrlPanel', 'editPanel', 'roster', 'actPanel',
    'dirCenter', 'btnShoot', 'btnWait', 'enemyList', 'tilePalette', 'unitTools', 'unitList',
    'enemyStill', 'boardW', 'boardH', 'btnResize', 'btnClearTiles', 'saveName', 'btnShare', 'shareNote', 'btnHome', 'btnTitle', 'home', 'choice', 'choiceTitle', 'choiceButtons',
    'btnEditDone', 'btnTestPlay', 'winSelect', 'winTurns', 'winTurnsLabel', 'winNote', 'txHintSimul', 'txHintSingle',
    'missionBar', 'missionTools', 'stageHint', 'cellInfo',
    'orderPanel', 'btnHowto', 'howto', 'howtoTitle', 'howtoList', 'howtoClose', 'btnView'].forEach(function (id) { el[id] = $(id); });

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
    else if (st.events.every(function (e) { return e.type === 'move' || e.type === 'mud' || e.type === 'treasure'; })) wait = 300;   // 歩いただけは、すべり終えたら次へ
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
  // 展示モード: ステージをクリアしたら、右下の「次へ」（か Enter）で次へ（IMPROVE_v3 段3・IMPROVE_controls 5-2）。
  //   会話の窓はなくした（オーナー 10/31）。app.afterDialog などのきっかけは、窓を戻すときのために残している
  //   はじめから遊ぶ: 並びの次のステージへ。最後のあとは「ありがとう！」。選んで遊ぶ: 「クリア！」
  function exhibitAfterPlayback() {
    var st = app.state, run = app.run;
    if (!EXHIBIT || app.editMode || st.result !== 'win' || !run) return;
    clearTimeout(exhibitAfterPlayback.timer);
    var go = function () {
      if (app.state !== st || app.busy || app.editMode || app.run !== run) return;   // 待っている間に1手戻した・ほかを読んだ
      if (run.kind === 'start' && run.i + 1 < run.list.length) exhibitPlay('start', run.list, run.i + 1);
      else exhibitScreen(run.kind === 'start' ? 'thanks' : 'clear');
    };
    var wait = function () {
      exhibitAfterPlayback.timer = setTimeout(function () {
        if (app.state !== st || app.run !== run) return;
        app.exNextGo = go;
        renderGo();
        renderHint();
      }, EXHIBIT_NEXT_MS);
    };
    if (app.afterDialog) app.afterDialog(wait); else wait();
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
    return u && !u.acted ? u : null;   // 魔法で構えた・待機した味方は選べない（構え直しは画面からなくした。IMPROVE_controls 4-1）
  }
  function canControl() { return !app.busy && !app.editMode && !app.state.result; }

  // 移動（オーナー 10/30）: 緑のマスを押した時点で本当に動く（R.move）。撃つ・構える・待機までは、元の位置から数えて動き直せる
  //   （元の位置を押すと取り消し）。ほかを押して選ぶのをやめても、動いた所に立ったまま。
  //   向きは味方ごとに覚えておく（app.dirs。ほかの味方を選んでも捨てない）。撃つ・構える・待機・ターンの終わりで消える
  function reachOf(u) { return R.reachableCells(app.state, u.id); }
  function clearPlans() { app.dirs = {}; app.plan = null; }

  // 遊ぶ側の最初は、誰も選んでいない（オーナー 10/30）。味方は押して（か 1〜3 キーで）選ぶ
  //   構える味方と、魔法で構えた・待機した味方（薄い味方）は選べない。押しても選ぶのをやめるだけ（IMPROVE_controls 2章）
  function select(id) {
    var u = R.findUnit(app.state, id);
    if (!u || u.side !== 'ally' || u.npc || u.acted) { deselect(); return; }
    app.sel = id;
    app.plan = { dir: app.dirs[id] || u.facing };
    render();
  }
  function deselect() { app.sel = null; app.plan = null; render(); }

  function setDir(d) {
    if (!selUnit() || !canControl()) return;
    app.plan.dir = d;
    app.dirs[app.sel] = d;
    render();
  }

  // 選んでいる味方を (x, y) へ動かす（本当に動く。元の位置なら移動の取り消し）
  function doMove(x, y) {
    var u = selUnit();
    if (!u || !canControl()) return;
    var res = R.move(app.state, u.id, [x, y]);
    if (!res.ok) { say(res.error); return; }
    pushHistory();
    play(res.steps, res.state, function () {
      if (app.state.result) { app.sel = null; app.plan = null; render(); }   // 奪取: 宝を持って帰り口に着いた
    });
  }
  function cancelMove() {
    var u = selUnit();
    if (u && u.moved) doMove(u.moved.from[0], u.moved.from[1]);
  }

  function doAct(shoot) {
    var u = selUnit();
    if (!u || !canControl()) return;
    var res = R.act(app.state, u.id, { dir: app.plan.dir, shoot: shoot });
    if (!res.ok) { say(res.error); return; }
    pushHistory();
    var id = u.id;
    app.sel = null; app.plan = null;
    delete app.dirs[id];
    if (app.onAct) app.onAct(u, shoot !== false);   // 文章（きっかけ: 構えたとき）
    play(res.steps, res.state, function () {
      if (simul() || app.state.result) return;   // 【一斉】全員構えても、発動は右下のボタン（か Enter）で
      if (R.allAlliesActed(app.state) && !R.sealReady(app.state)) {   // ステージ②: ふさぎきったら、ターン終了は回さずに「クリアする」を待つ
        addLog(R.controllableOf(app.state).length === 3 ? '3人とも行動したので、ターン終了' : '全員行動したので、ターン終了', 'system');
        runEndTurn();
      }
    });
  }

  // 誰も選んでいないときの Enter（おまけのキー）: 右下のボタンを押したのと同じ。味方を選んでいる間は進めない（Enter は「魔法」）
  function advance() {
    if (selUnit()) return false;
    return goPress();
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
      play(t.steps, t.state, function () {});   // ターンが変わっても、誰も選ばない（オーナー 10/30）
    };
    if (app.onBeforeFire) app.onBeforeFire(go); else go();
  }

  // ステージ②: 村への道をふさぎきったら、右下の「クリアする」（か Enter）でクリア
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
    if (simul() && !R.allAlliesActed(app.state) && R.controllableOf(app.state).length) { say(ui('notReady', 'まだ構えていない味方がいます（「魔法」か「待機」）')); return; }
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
    var keep = app.sel;   // 動かしたのを戻したときは、その味方を選んだまま
    app.sel = null; app.plan = null; app.exNextGo = null;
    if (keep && selectable(keep)) select(keep);
    if (!app.editMode) app.editPick = null;   // エディット: 選んでいた駒は、戻したあともいれば選んだまま
    render();
  }
  function selectable(id) {
    var u = R.findUnit(app.state, id);
    return !app.editMode && !!u && u.side === 'ally' && !u.npc && !u.acted;
  }

  function setState(s, logText) {
    pushHistory();
    app.state = s;
    app.sel = null; clearPlans(); app.editPick = null; app.exNextGo = null; app.info = null;
    if (logText) addLog(logText, 'system');
    render();
  }

  function reset() {
    if (app.editMode) return;   // エディット中の盤面は「1手戻す」で戻す（リセットはテストプレイの始めに戻すもの）
    if (app.busy) skipPlayback();
    setState(R.clone(app.resetPoint), 'リセット（最初の配置に戻した）');
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
      var back = testing(), p0 = !back && app.scenario && R.findPreset(app.scenario);
      if (p0 && p0.shared) { editShared(p0.name); return; }   // みんなのステージ: 自分のステージに写す（段4）
      if (!back) startDraft(draftFromScenario());
      enterEdit(back);
    } else {
      app.draft.state = R.clone(app.state);
      app.editHist = app.history;
      app.history = [];   // 読み込みの setState がエディットの履歴に積まないように
      app.editMode = false;
      keepDraft();
      testPlay();
    }
  }
  // app.draft をエディットで開く（back: テストプレイから戻ったとき）
  function enterEdit(back) {
    if (app.closeDialog) app.closeDialog();
    app.editMode = true;
    app.history = app.editHist;
    app.state = R.clone(app.draft.state);
    addLog(back ? 'エディットに戻った（「' + app.draft.name + '」）' : app.draft.key ? 'エディット開始（自分のステージ「' + app.draft.name + '」を開いた）' : 'エディット開始（「' + app.draft.name + '」を作る。自分のステージに自動で残る）', 'system');
    render();
    refreshShare();
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
    return { state: b.state, name: name, key: name, texts: fillTexts(rec.texts, name), exKeep: rec.exKeep || null, base: rec.base || null };
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
    return { def: SIO.toDef(R, s, d.name), texts: d.texts, exKeep: d.exKeep || null, base: d.base || null };   // base: 最後に共有した（写した）ときの中身のしるし（段4）
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
    if (d.key && moved) { delete stages[d.key]; d.base = rec.base = null; }   // 名前を変えたら、共有の元は別のステージ
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
    render();
    if (app.onStage) app.onStage('start');   // 文章（きっかけ: ステージの始め）
  }
  function isTutorial() { var p = app.scenario && R.findPreset(app.scenario); return !!(p && p.tutorial); }

  // エディット: このシナリオだけの数値（overrides）の名前と値
  function setLabel(path, v) { return path + ': ' + (v === true ? '入' : v === false ? '切' : v); }

  // ---------------------------------------------------------------
  // 盤面のクリック
  // ---------------------------------------------------------------
  // 盤面のクリックでできるのは、味方にさわる（選ぶ・緑のマスへ動く）と、押したマスを左上に出すことだけ（IMPROVE_controls 2章）。
  //   発動・クリア・次へ・演出を飛ばすは、右下のボタン（とおまけのキー）で
  function onPlayClick(x, y) {
    if (app.editMode) return;
    app.info = [x, y];   // 押したマスの情報を、盤面の左上に出す（オーナー 10/30）
    if (app.busy) { renderCellInfo(); return; }   // 演出の途中は、マスを出すだけ
    var u = selUnit();
    var occ = R.unitAt(app.state, x, y);
    var ally = occ && occ.side === 'ally' ? occ : null;
    if (app.state.result) { render(); return; }
    if (ally) {
      if (u && ally.id === u.id) { render(); return; }
      select(ally.id);
      return;
    }
    if (u && reachOf(u)[key(x, y)] !== undefined && (x !== u.x || y !== u.y)) { render(); doMove(x, y); return; }
    deselect();   // 味方以外（動けないマス・敵・置きもの）を押したら、選ぶのをやめる
  }

  function applyEdit(x, y, dragging) {
    var tool = app.editTool;
    var st = app.state;
    var res;
    // 駒（味方・敵・村・トロッコ）は、どの道具のときでも押すと選び、そのままドラッグで動かす（オーナー 10/30）
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
  // 見た目（HD-2D の方針 10/31）: 真上 view-flat ／ 奥行き view-depth を <html> に付ける。エディットはいつも真上。
  //   展示モードは mode.js の EXHIBIT_VIEW、開発モードは上のバーの「見た目」と V キーで切り替える（mode.js が覚える）
  function viewNow() { return app.editMode || !window.CafiliaMode ? 'flat' : window.CafiliaMode.view(); }
  function applyView() {
    var h = document.documentElement, depth = viewNow() === 'depth';
    h.classList.toggle('view-depth', depth);
    h.classList.toggle('view-flat', !depth);
    if (el.btnView && window.CafiliaMode) el.btnView.innerHTML = '見た目: ' + (window.CafiliaMode.view() === 'depth' ? '奥行き' : '真上') + ' <kbd>V</kbd>';
  }
  function toggleView() {
    var M = window.CafiliaMode;
    if (!M || !M.setView(M.view() === 'depth' ? 'flat' : 'depth')) return;
    if (el.btnView) el.btnView.blur();
    render();
  }

  function render(animate) {
    applyView();
    renderMission();
    renderStatus();
    renderBoard(!!animate);
    renderSide();
    renderHint();
    renderCellInfo();
    if (app.editMode) renderShare();   // 共有のようす（地形を塗っただけでも変わる）
    fitBoard();
    fitDepth();
  }

  // 奥行きの見た目: 傾けると盤面の縦が縮むので、盤面の場所の横幅と画面の下に収まるまで大きくする（style.css の --fit）。
  //   見た目・盤面の大きさ・画面の大きさが変わったときだけ測り直す
  function fitDepth() {
    var b = el.board, depth = viewNow() === 'depth';
    // 山肌（slopeMesh）は描いたときのマスの大きさ（px）で作るので、マスの大きさが変わったら描き直す
    var mc = depth && cellEls[0] && cellEls[0].el;
    if (mc && mc.offsetWidth && [mc.offsetWidth, mc.offsetHeight, b.clientWidth].join('x') !== app.meshKey) renderBoard(false);
    var sig = [depth, b.offsetWidth, b.offsetHeight, window.innerWidth, window.innerHeight, app.aboveH].join(',');
    if (sig === app.depthSig) return;
    app.depthSig = sig;
    if (!depth || !b.offsetParent) { b.style.removeProperty('--fit'); return; }
    b.style.setProperty('--fit', 1);
    var r = b.getBoundingClientRect(), area = el.boardWrap.parentNode.getBoundingClientRect();
    var availH = window.innerHeight - r.top - 16, s = area.width / r.width;
    if (availH > 200) s = Math.min(s, availH / r.height);   // 縦に並ぶ狭い画面では、横だけで決める
    b.style.setProperty('--fit', Math.max(0.5, s * 0.98).toFixed(3));
  }

  // 盤面の大きさ: 盤面の上の段（目標の帯・マスの情報・案内）の高さはステージの中で変わらないので、
  //   盤面の上端から画面の下までに収まる大きさにする（style.css の --above。ステージが変わったときと、画面の大きさを変えたときだけ動く）
  function fitBoard() {
    if (!el.boardWrap.offsetParent) return;
    var above = Math.round(el.boardWrap.getBoundingClientRect().top + window.scrollY + 20);
    if (above === app.aboveH) return;
    app.aboveH = above;
    document.documentElement.style.setProperty('--above', above + 'px');
  }
  window.addEventListener('resize', function () { app.aboveH = null; fitBoard(); fitDepth(); });

  // お題: 名前・勝ち方・負け方・残りの数を常に出す
  var missionSig = '';
  function renderMission() {
    var info = R.missionInfo(app.state);
    // 護衛: 味方の予測を出している間は、その手のあと（敵の発動のあと）のトロッコの歩数も出す
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
    renderGo();
    el.btnUndo.disabled = app.history.length === 0;
    el.btnEdit.classList.toggle('active', app.editMode);
    el.btnEdit.classList.toggle('test', test);
    el.btnEdit.innerHTML = (app.editMode ? '▶ テストプレイ' : test ? '✎ エディットに戻る' : 'エディット') + ' <kbd>E</kbd>';
    el.btnReset.disabled = app.editMode;
    // チュートリアル: やり直したあと（2回目以降の開始時）は、盤面の上にヒントを1行。
    //   ヒントのあるステージでは、出ていないときも場所をとっておく（やり直したときに盤面がずれないように。IMPROVE_controls 3-3）
    var sh = app.editMode ? null : R.stageHint(st);
    el.stageHint.hidden = app.editMode || !R.stageHint({ stage: st.stage, tries: 1 });
    el.stageHint.classList.toggle('blank', !sh);
    var shText = sh || '　';
    if (el.stageHint.textContent !== shText) el.stageHint.textContent = shText;
    el.playSide.hidden = app.editMode;
    el.side.classList.toggle('split', !app.editMode);   // 遊ぶ間は、右の欄を右上と右下に分ける（エディットは今までどおり上から並べる）
    el.editPanel.hidden = !app.editMode;
  }

  // 右下のボタン（IMPROVE_controls 5-2）: 同じ場所で文字が変わる。押すと（誰も選んでいないときの Enter も）その時の働き
  //   展示でクリアしたら「次へ」（少しあけてから押せる）／負けたら「やり直す」（チュートリアル）／
  //   ②で村への道をふさいだら「クリアする」（勝手には勝たない）／ほかは「発動」（動かせる味方が全員構え終えたら押せる）
  function goState() {
    var st = app.state;
    if (app.editMode) return null;
    if (st.result === 'win' && EXHIBIT && app.run) return { label: ui('next', '次へ'), on: !!app.exNextGo, act: function () { var go = app.exNextGo; app.exNextGo = null; go(); } };
    if (st.result === 'lose' && st.stage) return { label: ui('retry', 'やり直す'), on: !app.busy, act: retry };
    if (canControl() && R.sealReady(st)) return { label: ui('sealWin', 'クリアする'), on: true, act: doSealWin, ready: true };
    var ready = simul() && !st.result && R.controllableOf(st).length > 0 && R.allAlliesActed(st);
    var on = !app.busy && !app.fireWaiting && !st.result && (!simul() || ready || !R.controllableOf(st).length);
    return { label: simul() ? ui('fire', '発動') : ui('endTurn', 'ターン終了'), on: on, act: doEndTurn, ready: ready && on };
  }
  function renderGo() {
    var g = goState();
    if (!g) return;
    el.btnGo.textContent = g.label;
    el.btnGo.disabled = !g.on;
    el.btnGo.classList.toggle('fire-ready', !!g.ready);   // 押せば進むときは光る
    el.btnGo.classList.toggle('primary', g.on);
  }
  function goPress() {
    var g = goState();
    if (!g || !g.on) return false;
    g.act();
    return true;
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
  // 今いるマスから、選んでいる向きで撃ったら（移動はもう済んでいる。R.move）
  function previewNow(u) {
    var p = app.plan, at = [u.x, u.y];
    return memo('pv', [app.state, u.id, p.dir], function () {
      if (R.canShoot(app.state, u)) return R.previewAct(app.state, u.id, at, p.dir);
      // 奪取: 宝を持つ味方は撃てないので、待機したときの盤面を予測にする
      var r = R.act(app.state, u.id, { dir: p.dir, shoot: false });
      return { state: r.ok ? r.state : app.state, events: r.events, cells: [], tileChanges: [], damages: [], moves: [], finishers: [],
        from: at, to: at, dir: p.dir, waitOnly: true };
    });
  }

  var cellEls = [];

  // 奥行きの見た目で駒をすべらせるとき: 傾ける前の盤面の上の位置（駒のいるマスの、レイアウトの位置）
  function floorPos(t) {
    var c = t.parentNode;
    return { left: c.offsetLeft + t.offsetLeft, top: c.offsetTop + t.offsetTop };
  }

  // 駒の絵（HD-2D の方針 10/31）: img/ に決まった名前の画像を入れると、奥行きの見た目でその駒が絵に変わる。ないものは今の駒を立てる（仮置き）。
  //   名前（.png）: 味方 ally_<魔法>（ally_fire など）／敵 enemy_<魔法> → なければ enemy／ボス boss／取り巻き minion／村 village／トロッコ trolley。
  //   立ち絵と駒を分けたいときは、同じ名前に _koma を付けた画像を入れると、駒だけその絵になる（ally_fire_koma.png など）。
  //   あるかどうかは、奥行きの見た目で駒を描くときに1枚ずつ確かめる（真上の見た目と展示モードの真上では読みに行かない）
  var IMG_DIR = 'game/img/', imgState = {};   // 名前 → 'wait' | 'ok' | 'none'
  function imgNames(u) {
    var base = [];
    if (u.side === 'object') base = [u.kind === 'wagon' ? 'trolley' : u.kind];
    else if (u.side === 'ally') base = ['ally_' + u.magic];
    else if (u.stand === 'boss') base = ['boss'];
    else if (u.stand === 'float') base = ['minion'];
    else base = ['enemy_' + u.magic, 'enemy'];
    var names = [];
    base.forEach(function (b) { names.push(b + '_koma', b); });
    return names;
  }
  function probeImg(name) {
    if (imgState[name]) return imgState[name];
    imgState[name] = 'wait';
    var im = new Image();
    im.onload = function () { imgState[name] = 'ok'; renderBoard(false); };
    im.onerror = function () { imgState[name] = 'none'; renderBoard(false); };
    im.src = IMG_DIR + name + '.png';
    return 'wait';
  }
  function unitImg(u) {
    if (viewNow() !== 'depth') return null;
    var names = imgNames(u);
    for (var i = 0; i < names.length; i++) {
      var s = probeImg(names[i]);
      if (s === 'ok') return IMG_DIR + names[i] + '.png';
      if (s === 'wait') return null;
    }
    return null;
  }

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
      // お題の置きもの: 村（四角・動かない）・トロッコ（角丸・運べる）
      var oc = ['unit', 'object', u.kind], oimg = unitImg(u);
      if (u.stuck) oc.push('stuck');
      if (oimg) oc.push('has-img');
      var oh = '<div class="' + oc.join(' ') + '" data-id="' + u.id + '"><span class="u-shadow"></span>' + (oimg ? '<img class="u-img" src="' + oimg + '" alt="">' : '') +
        '<span class="u-name">' + esc(R.OBJECT_INFO[u.kind].name) + '</span>' +
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
    cls.push('face-' + facing);   // 奥行きの見た目: 向きの三角を、立てた駒の頭の上・足もと・左右に出す（style.css）
    var name = u.side === 'ally' ? esc(R.magicName(u.magic)) : '敵<small>' + esc(u.letter) + '</small>';
    // 大きい敵（③のボス）・体（浮く）の見た目
    if (u.size > 1) cls.push('big');
    if (u.body) cls.push('body-' + u.body);
    if (u.exBoss) cls.push('boss');
    if (u.side === 'enemy' && u.stand === 'boss') name = 'ボス';            // 展示ステージ③
    if (u.side === 'enemy' && u.stand === 'float') name = '取り巻き<small>' + esc(u.letter) + '</small>';
    var img = unitImg(u);
    if (img) cls.push('has-img');
    var h = '<div class="' + cls.join(' ') + '" data-id="' + u.id + '" style="--rot:' + DIR_ROT[facing] + 'deg' + (u.size > 1 ? ';--sz:' + u.size : '') + '">' +
      '<span class="u-shadow"></span>' + (img ? '<img class="u-img" src="' + img + '" alt="">' : '') +
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

  // 奥行き: 山（火山・桜も）は、つながった山のかたまりを1つの山として、頂上から斜めにまっすぐ下る山肌で描く
  //   （オーナー 10/31「山は山肌に。斜めに下、山だって感じに」「斜めにまっすぐで。今のは山脈っぽい。イメージは一つの山」）。
  //   頂上は、かたまりの頂上のマスの真ん中（山だけのかたまりはルールの斜面 R.mountainSlopes と同じ頂上。火山・桜が混ざるときは画面の頂上 peakAt）。
  //   かたまりのふち（隣が山でないマスの辺）の1辺ごとに、頂上とその辺を結ぶ三角を1枚張る（ふちは地面の高さ）。山の足もとは、通れないマスにぴったり合う。
  //   高さはかたまりが大きいほど少し高い（3.5 + √マス数 段。7 段まで。1段 = マスの幅 × --lvh）。
  //   三角は 100px の四角を matrix3d で3つの点へ写し、clip-path で三角に切る。光（左上の手前から）で明るさを変え、頂上に雪（火山は溶岩・桜は桃色の山）。
  //   山の三角は頂上のマスの中にまとめて置く。山のマスの面（印・予測・押した枠を出す所）は、そのマスの山肌の一番高い所に浮かせる（--lv）
  function slopeMesh(st, n, rows, peakAt, isMount) {
    var mesh = {}, c0 = cellEls[0] && cellEls[0].el;
    app.meshKey = '';
    if (!c0 || !c0.offsetWidth) return mesh;
    var cw = c0.offsetWidth, ch = c0.offsetHeight, g2 = 1.5;   // マスのすき間（3px）の半分だけ外へ広げる
    var px = n > 1 ? cellEls[1].el.offsetLeft - c0.offsetLeft : cw + 3, py = rows > 1 ? cellEls[n].el.offsetTop - c0.offsetTop : ch + 3;
    var zU = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lvh')) || 0.22) * (el.board.clientWidth - 12) / n;   // 1段の高さ（px。style.css の --lvh と同じ）
    app.meshKey = [cw, ch, el.board.clientWidth].join('x');
    var LIGHT = (function (v) { var l = Math.hypot(v[0], v[1], v[2]); return v.map(function (a) { return a / l; }); })([-0.45, 0.35, 0.82]);
    var BASE = { mountain: [150, 132, 104], volcano: [118, 72, 52], sakura: [214, 164, 182] };
    var num = function (a) { return +a.toFixed(4); };
    var seen = {};
    for (var sy = 0; sy < rows; sy++) {
      for (var sx = 0; sx < n; sx++) {
        if (!isMount(sx, sy) || seen[key(sx, sy)]) continue;
        // かたまり
        var comp = [], inC = {}, stack = [[sx, sy]];
        while (stack.length) {
          var q = stack.pop(), qk = key(q[0], q[1]);
          if (inC[qk] || !isMount(q[0], q[1])) continue;
          inC[qk] = seen[qk] = true;
          comp.push(q);
          stack.push([q[0] + 1, q[1]], [q[0] - 1, q[1]], [q[0], q[1] + 1], [q[0], q[1] - 1]);
        }
        // 頂上のマス
        var pure = comp.every(function (c) { return R.getTile(st, c[0], c[1]) === 'mountain'; });
        var ms = pure && B.tutorial.slope ? R.mountainSlopes(st, comp[0][0], comp[0][1]) : null;
        var apex = ms ? ms.peak : comp.filter(function (c) { return peakAt[key(c[0], c[1])]; })[0] || comp[0];
        var H = Math.min(7, 3.5 + Math.sqrt(comp.length)) * zU;
        // 頂上のマスの左上を原点にした px の位置
        var X = function (gx) { return (gx - apex[0]) * px; }, Y = function (gy) { return (gy - apex[1]) * py; };
        var A = [cw / 2, ch / 2];
        // ふちの辺ごとの三角（頂上 A・辺の両はし E1, E2。上から見て時計回り＝法線が上向き）
        var faces = [];
        comp.forEach(function (c) {
          var x0 = X(c[0]) - g2, x1 = X(c[0]) + cw + g2, y0 = Y(c[1]) - g2, y1 = Y(c[1]) + ch + g2, tile = R.getTile(st, c[0], c[1]);
          [[0, -1, [x0, y0], [x1, y0]], [1, 0, [x1, y0], [x1, y1]], [0, 1, [x1, y1], [x0, y1]], [-1, 0, [x0, y1], [x0, y0]]].forEach(function (d) {
            if (inC[key(c[0] + d[0], c[1] + d[1])]) return;
            var E1 = d[2], E2 = d[3];
            if ((E1[0] - A[0]) * (E2[1] - A[1]) - (E1[1] - A[1]) * (E2[0] - A[0]) < 0) { var sw = E1; E1 = E2; E2 = sw; }
            faces.push({ E1: E1, E2: E2, tile: tile });
          });
        });
        // 点 (x, y) の山肌の高さ（px。どの三角にも入らなければ 0）
        var hAt = function (x, y) {
          var best = 0;
          faces.forEach(function (f) {
            var ux = f.E1[0] - A[0], uy = f.E1[1] - A[1], vx = f.E2[0] - A[0], vy = f.E2[1] - A[1], det = ux * vy - uy * vx;
            if (!det) return;
            var a = ((x - A[0]) * vy - (y - A[1]) * vx) / det, b = (ux * (y - A[1]) - uy * (x - A[0])) / det;
            if (a >= -1e-6 && b >= -1e-6 && a + b <= 1 + 1e-6) best = Math.max(best, H * (1 - a - b));
          });
          return best;
        };
        var html = '';
        faces.forEach(function (f) {
          var e1 = [f.E1[0] - A[0], f.E1[1] - A[1], -H], e2 = [f.E2[0] - A[0], f.E2[1] - A[1], -H];
          var nv = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], nl = Math.hypot(nv[0], nv[1], nv[2]) || 1;
          nv = nv.map(function (a) { return a / nl; });
          var shade = Math.min(1.15, 0.55 + 0.55 * Math.max(0, nv[0] * LIGHT[0] + nv[1] * LIGHT[1] + nv[2] * LIGHT[2]));
          var base = BASE[f.tile] || BASE.mountain;
          var rgb = 'rgb(' + base.map(function (a) { return Math.min(255, Math.round(a * shade)); }).join(',') + ')', bg = rgb;
          if (f.tile === 'mountain') bg = 'radial-gradient(circle at 0 0, rgb(' + [245, 245, 244].map(function (a) { return Math.round(a * Math.min(1, shade + 0.1)); }).join(',') + ') 0 16%, ' + rgb + ' 24%)';
          if (f.tile === 'volcano') bg = 'radial-gradient(circle at 0 0, #ffd166 0 6%, #f97316 13%, ' + rgb + ' 26%)';
          html += '<span class="slope" style="background:' + bg + ';transform:matrix3d(' +
            [num(e1[0] / 100), num(e1[1] / 100), num(e1[2] / 100), 0, num(e2[0] / 100), num(e2[1] / 100), num(e2[2] / 100), 0, num(nv[0]), num(nv[1]), num(nv[2]), 0, num(A[0]), num(A[1]), 0, 1].join(',') + ')"></span>';
        });
        // マスごとの面の高さ（そのマスの山肌の一番高い所。真ん中・辺の真ん中・角で測る）。頂上のマスは頂上の高さで、山肌はそこから下へ
        comp.forEach(function (c) {
          var isApex = c[0] === apex[0] && c[1] === apex[1], topPx = 0;
          if (isApex) topPx = H;
          else [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [0.5, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]].forEach(function (s) { topPx = Math.max(topPx, hAt(X(c[0]) + s[0] * cw, Y(c[1]) + s[1] * ch)); });
          mesh[key(c[0], c[1])] = { top: num(topPx / zU), html: isApex ? html : '' };
        });
      }
    }
    return mesh;
  }

  function renderBoard(animate) {
    var st = app.state;
    var n = st.size, rows = R.rowsOf(st);   // 横 n・縦 rows（チュートリアル②は 5×8）
    el.board.style.setProperty('--n', n);
    el.board.style.setProperty('--rows', rows);

    // 動きのアニメーション用: 描き直す前の位置（奥行きの見た目では、傾ける前の盤面の上の位置）
    var before = {}, depth = viewNow() === 'depth';
    if (animate) {
      Array.prototype.forEach.call(el.board.querySelectorAll('.unit[data-id]'), function (t) {
        before[t.getAttribute('data-id')] = depth ? floorPos(t) : t.getBoundingClientRect();
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
    // 動いたけれど、まだ撃っていない味方の元の位置（点線で薄く描く。オーナー 10/30）
    var moveFrom = {};
    if (!app.editMode && !st.result) R.controllableOf(st).forEach(function (a) { if (a.moved && !a.acted) moveFrom[key(a.moved.from[0], a.moved.from[1])] = a; });
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

    // 護衛: トロッコの道筋（薄い線）と次の1マス（矢印）。敵の予告と同じく、予測中は撃ったあとの盤面で計算し直す
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

    // 奥行きの見た目の高さ（HD-2D の方針 10/31）: 丘は 1 段の台（崖つき）。山は山肌（slopeMesh）で描くので、ここでは 0（山の足もとは地面の高さ）。
    //   真上の見た目では使わない（.cliff と --lv は style.css が隠す）
    var heights = memo('heights', [st], function () {
      var hs = [];
      for (var hy = 0; hy < rows; hy++) {
        for (var hx = 0; hx < n; hx++) { var ht = R.getTile(st, hx, hy); hs.push(ht === 'hill' || ht === 'hillsakura' ? 1 : 0); }
      }
      return hs;
    });
    var lvAt = function (ax, ay) { return R.inBounds(st, ax, ay) ? heights[ay * n + ax] : 0; };

    var mesh = depth ? slopeMesh(st, n, rows, peakAt, isMount) : {};

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
    st.units.forEach(function (x) { unitByCell[key(x.x, x.y)] = x; });

    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < n; x++) {
        var k = key(x, y);
        var tile = R.getTile(st, x, y);
        var cls = ['cell', 't-' + tile];
        if (reach[k] !== undefined) cls.push('reach');
        if (moveFrom[k]) cls.push('move-from');
        if (app.info && app.info[0] === x && app.info[1] === y && !app.editMode) cls.push('info-at');
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
        // 奥行き: 山は山肌（マスの面は山肌の一番高い所に浮かせる）。丘は崖（手前・左・右。隣より高い分だけ）
        var lvHere = heights[y * n + x];
        if (mesh[k]) { inner += mesh[k].html; lvHere = mesh[k].top; }
        else if (lvHere) [['f', x, y + 1], ['l', x - 1, y], ['r', x + 1, y]].forEach(function (a) {
          var dh = lvHere - lvAt(a[1], a[2]);
          if (dh > 0) inner += '<span class="cliff ' + a[0] + '" style="--ch:' + dh + '"></span>';
        });
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
        if (wNext && wNext.k === k) inner += '<span class="wnext' + (wNext.stuck ? ' stuck' : '') + '" title="次のターン終了でトロッコが進むマス">' + DIR_ARROW[wNext.dir] + '</span>';
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
        if (moveFrom[k] && !unit) inner += '<div class="ghost ally move-from" title="' + esc(R.unitLabel(st, moveFrom[k]) + 'の元の位置（押すと戻る）') + '"></div>';
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
        if (c.lv !== lvHere) { if (lvHere) c.el.style.setProperty('--lv', lvHere); else c.el.style.removeProperty('--lv'); c.lv = lvHere; }
      }
    }

    // 動いたユニットを、前の位置からすべらせる
    if (animate) {
      Array.prototype.forEach.call(el.board.querySelectorAll('.unit[data-id]'), function (t) {
        var b = before[t.getAttribute('data-id')];
        if (!b) return;
        if (depth) {   // 奥行き: 立てた駒の向き（transform）は残したまま、盤面の上を translate ですべらせる
          var f = floorPos(t), fx = b.left - f.left, fy = b.top - f.top;
          if (Math.abs(fx) < 1 && Math.abs(fy) < 1) return;
          t.style.transition = 'none';
          t.style.translate = fx + 'px ' + fy + 'px';
          void t.offsetWidth;
          t.style.transition = 'translate .3s ease';
          t.style.translate = '';
          return;
        }
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
    var sig = JSON.stringify([app.editMode, app.busy, app.sel, app.plan, app.dirs, app.editTool, app.editPick, st.units, st.enemyActs, st.size, st.h, st.ex, st.spawn, st.result, st.mission, st.overrides, fc ? fc.enemies : null, fcAll ? fcAll.allies : null, fcAll ? fcAll.rushes : null, hintsNow(), storeVersion, B.turnMode,
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
    // 味方（IMPROVE_controls 4-1）: アイコンだけ。押すと、盤面のその味方のマスを押したのと同じ（選ぶ＋左上にマスの情報）。
    //   魔法で構えた・待機した味方は薄く（選べない）。移動しただけなら薄くしない。構える味方は点線の丸（選べない。構えの中身は発動の順番に出る）。
    //   名前・HP・ようすは、押すと左上に出る。予告でダメージを受ける味方だけ、アイコンに赤い印（倒れるなら「!」）【仮】
    var icon = function (a, cls) {
      var w = warn[a.id], tip = R.unitLabel(st, a) + (w ? '　予告: ' + w + 'ダメージを受ける' + (w >= a.hp ? '（倒れる）' : '') : '');
      return '<button type="button" class="ally-icon' + cls + '" data-id="' + a.id + '" title="' + esc(tip) + '" aria-label="' + esc(tip) + '">' +
        '<span class="dot">' + esc(R.magicName(a.magic)) + '</span>' +
        (w ? '<span class="ai-warn' + (w >= a.hp ? ' dies' : '') + '">' + (w >= a.hp ? '!' : '-' + w) + '</span>' : '') + '</button>';
    };
    var al = R.controllableOf(st), npcs = R.alliesOf(st).filter(function (a) { return a.npc; });
    el.roster.innerHTML = al.length || npcs.length
      ? al.map(function (a) { return icon(a, (a.id === app.sel ? ' selected' : '') + (a.acted ? ' acted' : '')); }).join('') +
        npcs.map(function (a) { return icon(a, ' npc'); }).join('')
      : '<p class="muted">味方がいません（エディットで置けます）</p>';

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
    // 展示モードでは出さない（並べ替えのボタンに気が散るため。順番は「魔法」を押した順で、盤面の構えの印の①②で分かる。オーナー 10/31）
    if (!simul() || app.editMode || EXHIBIT) { el.orderPanel.hidden = true; el.orderPanel.innerHTML = ''; return; }
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

  // 右下のコントローラー（IMPROVE_controls 5-1）: 十字の矢印（真ん中は「向き」）と「魔法」「待機」。
  //   だれを動かしているかは、右上の光っているアイコンで見る。撃てないときは、魔法ボタンに理由を書く（宝を持つ味方）
  function renderActPanel() {
    var u = canControl() ? selUnit() : null;
    el.actPanel.classList.toggle('off', !u);
    Array.prototype.forEach.call(el.actPanel.querySelectorAll('.dir'), function (b) {
      b.disabled = !u;
      b.classList.toggle('active', !!u && app.plan.dir === b.getAttribute('data-dir'));
    });
    var shootOk = !!u && R.canShoot(app.state, u);
    el.btnShoot.disabled = !shootOk;
    el.btnWait.disabled = !u;
    el.btnShoot.textContent = u && !shootOk ? ui('cantShoot', '宝を持つので撃てない') : simul() ? ui('stance', '魔法') : ui('shoot', '撃つ');
    el.btnWait.textContent = ui('wait', '待機');
    el.dirCenter.textContent = ui('dirCenter', '向き');
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
    el.winTurnsLabel.hidden = win !== 'defense';
    if (document.activeElement !== el.winTurns) el.winTurns.value = SIO.turnsOf(R, st);
    var mi = st.mission || {}, lack = [];
    if (win === 'boss' && !R.enemiesOf(st).some(function (e) { return e.stand === 'boss'; })) lack.push('動きが「ボス」の敵がいない（どれか1体を倒しただけで勝ちになる）');
    if (win === 'defense' && !R.objectsOf(st, 'village').length) lack.push('村がない');
    if (win === 'escort' && !R.objectsOf(st, 'wagon').length) lack.push('トロッコがない');
    if (win === 'escort' && !(mi.goal || []).length) lack.push('ゴールがない');
    if (win === 'retrieve' && !mi.treasure) lack.push('宝がない');
    if (win === 'retrieve' && !(mi.exit || []).length) lack.push('帰り口がない');
    if (!R.controllableOf(st).length) lack.push('動かせる味方がいない');
    el.winNote.textContent = (win === 'boss' && st.ex && st.ex.spawn ? '取り巻きが湧く（③の決まり）。' : '') +
      (st.spawn ? '増援が (' + st.spawn.x + ',' + st.spawn.y + ') から出る（②の決まり）。' : '') +
      (lack.length ? '足りない: ' + lack.join('・') : '');
    var mtools = [['obj:village', '村を置く'], ['obj:wagon', 'トロッコを置く'], ['mark:goal', 'ゴール'], ['treasure', '宝を置く'], ['mark:exit', '帰り口']];
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

    // ステージの名前とやり直しのヒント（打っている途中の欄は書き換えない）。会話の窓の文の欄はなくした（オーナー 10/31）
    var d = app.draft, tx = d.texts, hint = tx.hint || {};
    var put = function (e, v) { if (document.activeElement !== e && e.value !== v) e.value = v; };
    put(el.saveName, d.name);
    put(el.txHintSimul, hint.simul || '');
    put(el.txHintSingle, hint.single || '');
  }

  // 押したマスの情報（オーナー 10/30・IMPROVE_controls 3-2）: いつも2行。盤面が変わったら今の中身で出し直す
  //   1行目: 地形の絵・名前・印（通れない・入ると止まる・ゴール・帰り口・宝）。2行目: 駒の絵・名前・HP・ようす（いなければ空ける）。
  //   印・ようすは短い文のまま並べ、並びきらない分は切る（高さは変えない。盤面をずらさないため）。座標・魔法・向きは出さない
  function renderCellInfo() {
    var box = el.cellInfo;
    box.hidden = app.editMode;
    var st = app.state, c = app.info;
    box.className = 'cell-info';
    if (!c || !R.inBounds(st, c[0], c[1])) {
      box.classList.add('empty');
      box.innerHTML = '<div class="ci-row">' + esc(ui('cellInfoIdle', 'マスを押すと、ここにそのマスの情報')) + '</div><div class="ci-row"></div>';
      return;
    }
    var x = c[0], y = c[1], tile = R.getTile(st, x, y), mi = st.mission || {}, tags = [];
    if (!R.TILE_INFO[tile].passable) tags.push('通れない');
    if (tile === 'mud' || tile === 'hill') tags.push('入ると止まる');
    if (R.inCells(mi.goal, x, y)) tags.push('ゴール');
    if (R.inCells(mi.exit, x, y)) tags.push('帰り口');
    if (mi.treasure && mi.treasure[0] === x && mi.treasure[1] === y) tags.push('宝');
    var tagHtml = function (list) { return list.filter(Boolean).map(function (t) { return '<span class="ci-tag">' + esc(t) + '</span>'; }).join(''); };
    var u = R.unitAt(st, x, y), unit = '';
    if (u && u.side === 'object') {
      unit = '<span class="ci-piece obj">' + esc(R.OBJECT_INFO[u.kind].name.charAt(0)) + '</span><b>' + esc(R.unitLabel(st, u)) + '</b><span>HP ' + u.hp + '</span>';
    } else if (u) {
      var state = [];
      if (u.side === 'ally' && !u.npc && !st.result) state.push(u.stance ? '構えた' : u.acted ? '待機' : u.moved ? '移動した' : '');   // 決着のあとは出さない（発動した味方が「待機」に見えないように）
      if (u.stuck) state.push('泥沼で休み');
      if (mi.carrier === u.id) state.push('宝を持つ');
      if (u.burn > 0) state.push('火傷');
      var mark = u.side === 'enemy' ? u.letter : R.magicName(u.magic);
      unit = '<span class="ci-piece ' + u.side + (u.npc ? ' npc' : '') + '">' + esc(mark) + '</span><b>' + esc(R.unitLabel(st, u)) + '</b>' +
        '<span>HP ' + u.hp + '/' + u.maxHp + '</span>' + tagHtml(state);
    }
    box.innerHTML = '<div class="ci-row"><span class="ci-tile t-' + tile + '"></span><b>' + esc(R.TILE_INFO[tile].name) + '</b>' + tagHtml(tags) + '</div>' +
      '<div class="ci-row' + (u ? ' ' + u.side : '') + '">' + unit + '</div>';
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
    if (app.busy) { h.textContent = '処理中…'; h.classList.add('busy'); return; }   // 盤面のクリックでは飛ばさない（キーはおまけで飛ばせる。IMPROVE_controls 2章）
    if (st.result && !app.editMode) {
      // チュートリアルのクリア・負けの文（texts.js）があればそれ、なければルールの文
      var stx = stageTexts(st.stage), own = stx && (st.result === 'win' ? stx.win : stx.lose);
      h.textContent = own || st.resultText || (st.result === 'win' ? '勝利！ 敵を全員倒しました' : '敗北… 味方が全員倒れました');
      if (own && st.resultText) h.title = st.resultText;
      if (app.exNextGo) h.textContent += '　' + ui('exNext', '右下の「次へ」で先へ進む');   // 展示: クリアしたら右下の「次へ」
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
      if (R.sealReady(st)) { h.textContent = ui('sealReady', '村への道をふさいだ！ 右下の「クリアする」を押す'); h.classList.add('ready'); return; }   // ステージ②
      // 【一斉】全員構えたら発動へ
      if (simul() && R.controllableOf(st).length && R.allAlliesActed(st)) { h.textContent = ui('readyToFire', '全員構えた。右下の「発動」を押す'); h.classList.add('ready'); return; }
      h.textContent = ui('pickAlly', '味方をクリックして選ぶ'); h.classList.add('guide'); return;   // 操作の案内
    }
    h.textContent = simul() ? ui('guideSimul') : ui('guideSingle');
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
  // 盤面の外を押しても、選ぶのをやめる（オーナー 10/31）。右下の欄（十字・魔法・待機・右下のボタン）・味方のアイコン・ほかのボタンや欄は除く
  document.addEventListener('pointerdown', function (e) {
    var t = e.target;
    if (!app.sel || app.editMode || app.home || e.button !== 0 || !t.closest) return;
    //   もう画面にない所: 盤面で押した駒が、その場で描き直されたとき（奥行きの見た目では、立てた駒そのものを押せる）
    if (!t.isConnected || el.board.contains(t) || t.closest('#ctrlPanel, #roster, button, input, select, textarea, label, .howto-dialog')) return;
    deselect();
  });

  // ボタンを押したらフォーカスを外す（Enter で押し直されないように）
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button');
    if (b) setTimeout(function () { b.blur(); }, 0);
  });

  // 味方のアイコンは、盤面のその味方のマスを押したのと同じ（IMPROVE_controls 4-1）
  el.roster.addEventListener('click', function (e) {
    var b = e.target.closest('[data-id]');
    var u = b && R.findUnit(app.state, b.getAttribute('data-id'));
    if (u) onPlayClick(u.x, u.y);
  });
  el.actPanel.addEventListener('click', function (e) {
    var d = e.target.closest('.dir');
    if (d) setDir(d.getAttribute('data-dir'));
  });
  el.btnShoot.addEventListener('click', function () { doAct(true); });
  el.btnWait.addEventListener('click', function () { doAct(false); });
  el.btnGo.addEventListener('click', goPress);
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
    el.howtoTitle.textContent = ui('howtoTitle', 'あそびかた');
    el.howtoClose.textContent = ui('howtoStart', 'はじめる');
    // 「見出し：中身」の行は、見出しを太く（IMPROVE_controls 7-1）
    el.howtoList.innerHTML = ((TX().ui || {}).howto || []).filter(modeOk).map(function (l) {
      var m = /^([^：]{1,8})：(.*)$/.exec(l.text);
      return '<li>' + (m ? '<b>' + esc(m[1]) + '</b>：' + esc(m[2]) : esc(l.text)) + '</li>';
    }).join('');
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

  // ステージの名前とやり直しのヒント（欄を離れたら入る。1手戻すで戻せる）。自分のステージの中で名前が重なる変え方は受け付けない
  el.saveName.addEventListener('change', function () {
    var v = el.saveName.value.trim().replace(/^my:/, '');
    if (!v || v === app.draft.name) { el.saveName.value = app.draft.name; return; }
    if ((stageStore() || {})[v]) { say('「' + v + '」は自分のステージにもうあります。ほかの名前にしてください'); el.saveName.value = app.draft.name; return; }
    pushHistory();
    app.draft.name = v;
    render();
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

  // ---------------------------------------------------------------
  // 共有（IMPROVE_v3 段4）: みんなのステージと展示の並びを Cloudflare（今の公開先）に置く。置き場所のプログラムは tools/stage_worker.mjs
  //   http(s) で開いたときは同じところの /api/（公開した版・手元の tests/serve.js）、ファイルから開いたとき（file://）は公開先の /api/。
  //   ネットにつながっていないときは、共有する・展示の並びは押せない。展示モードはチュートリアル①②③だけになる
  // ---------------------------------------------------------------
  var SITE_API = 'https://caffilia-jkwzvlbc7.kate108superstar.workers.dev/api/';
  var API = window.CAFILIA_API || (/^https?:$/.test(window.location.protocol) ? '/api/' : SITE_API);
  var NET_MS = 8000;   // これより待っても答えがなければ、つながっていないことにする
  app.shared = { ok: false, loaded: false, stages: {}, lineup: null, why: '' };
  function api(method, path, body) {
    return new Promise(function (resolve) {
      var done = false, finish = function (r) { if (!done) { done = true; resolve(r); } };
      setTimeout(function () { finish({ ok: false, offline: true }); }, NET_MS);
      try {
        fetch(API + path, { method: method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
          .then(function (r) {
            return r.json().then(function (j) { return { ok: r.ok && !!j && j.ok !== false, status: r.status, data: j }; }, function () { return { ok: false, status: r.status, data: null }; });
          })
          .then(finish, function () { finish({ ok: false, offline: true }); });
      } catch (e) { finish({ ok: false, offline: true }); }
    });
  }
  function netWhy(res) {
    return res.offline ? 'ネットにつながっていません' : '共有の置き場所につながりません' + (res.data && res.data.error ? '（' + res.data.error + '）' : res.status ? '（' + res.status + '）' : '');
  }
  // みんなのステージと展示の並びを読み直す
  function fetchShared() {
    return api('GET', 'all').then(function (res) {
      app.shared = res.ok ? { ok: true, loaded: true, stages: res.data.stages || {}, lineup: res.data.lineup || null, why: '' }
        : { ok: false, loaded: true, stages: {}, lineup: null, why: netWhy(res) };
      return app.shared;
    });
  }
  function refreshShare() { fetchShared().then(renderShare); }
  // ステージの中身のしるし（名前は除く）。共有のようすで、どちらが直したかを見分けるのに使う
  function stageSig(rec) {
    var x = SIO.clone(rec.def), t = rec.texts || {};
    delete x.id; delete x.name;
    var str = JSON.stringify([x, t.scenes || null, t.hint || null]), h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
    return h.toString(36) + ':' + str.length;
  }
  // 共有のようす: none まだない・same 同じ・mine 自分が直した・theirs ほかの人が直した・both 両方が直した
  //   （一度も共有・写しをしていないのに同じ名前のものがあるときも both。共有すると、その人のものが消えるため）
  var SHARE_TEXT = { none: 'みんなのステージにはまだありません', same: 'みんなのステージと同じです', mine: '共有したあとに直した所があります', theirs: 'ほかの人が直しています', both: '共有すると、ほかの人が直した所が消えます ⚠' };
  function shareState(name, rec) {
    var cloud = app.shared.stages[name];
    if (!cloud) return 'none';
    var mine = stageSig(rec), theirs = stageSig(cloud), base = rec.base;
    if (mine === theirs) return 'same';
    if (!base) return 'both';
    if (theirs === base) return 'mine';
    if (mine === base) return 'theirs';
    return 'both';
  }
  function renderShare() {
    var d = app.draft;
    if (!d || !app.editMode) return;
    el.btnShare.disabled = !app.shared.ok || !!app.sharing;
    el.shareNote.textContent = app.sharing ? '共有しています…' : !app.shared.loaded ? '読み込み中…' : app.shared.ok ? SHARE_TEXT[shareState(d.name, draftRecord())] : app.shared.why;
    el.shareNote.classList.toggle('danger', app.shared.ok && shareState(d.name, draftRecord()) === 'both');
  }
  // 共有する: 同じ名前があれば確かめてから上書き（ほかの人が直した所が消えるときは ⚠ を足す）
  function shareDraft() {
    var d = app.draft;
    if (!d || app.sharing) return;
    keepDraft();
    app.sharing = true;
    renderShare();
    var stop = function (msg) { app.sharing = false; renderShare(); if (msg) window.alert(msg); };
    fetchShared().then(function () {
      if (!app.shared.ok) { stop(app.shared.why); return; }
      var rec = draftRecord(), name = d.name, st = shareState(name, rec);
      if (st === 'same') { stop('みんなのステージと同じです（共有しなくてよい）'); return; }
      if (st !== 'none' && !window.confirm('同じ名前のステージがあります。上書きしますか？' + (st === 'both' || st === 'theirs' ? '\n⚠ ほかの人が直した所が消えます' : ''))) { stop(); return; }
      api('PUT', 'stages/' + encodeURIComponent(name), { def: rec.def, texts: rec.texts }).then(function (res) {
        if (!res.ok) { stop('共有できませんでした: ' + netWhy(res)); return; }
        app.shared.stages[name] = { def: rec.def, texts: rec.texts, at: res.data.at };
        d.base = stageSig(rec);
        keepDraft();
        app.sharing = false;
        addLog('「' + name + '」を共有した（みんなのステージ）', 'system');
        say('「' + name + '」を共有しました');
        render();
        renderShare();
      });
    });
  }
  el.btnShare.addEventListener('click', shareDraft);
  // みんなのステージを R.PRESETS に足す（id は 'all:名前'。遊ぶ・展示の並びで読む）
  function registerShared(name) {
    var rec = app.shared.stages[name], def = SIO.clone(rec.def);
    def.id = 'all:' + name; def.name = name; def.custom = true; def.tutorial = true; def.shared = true;
    registerStage(def, fillTexts(rec.texts, name));
    return def.id;
  }
  // みんなのステージを作る側にする: 自分のステージに同じ名前の写しを作る（共有するまで、みんなのステージは変わらない）。
  //   自分のステージにもう同じ名前があるときは、選んでもらう
  function editShared(name) {
    var cloud = app.shared.stages[name], own = (stageStore() || {})[name];
    var b = cloud && SIO.build(R, cloud.def);
    if (!b || !b.ok) { window.alert('みんなのステージに「' + name + '」が見つかりません（消されたかもしれません）'); return; }
    var fromCloud = function (key) {
      var bs = SIO.build(R, cloud.def).state;
      delete bs.stage;
      return { state: bs, name: name, key: key, texts: fillTexts(cloud.texts, name), exKeep: null, base: stageSig(cloud) };
    };
    var go = function (d) { startDraft(d); enterEdit(false); };
    if (!own) { go(fromCloud()); return; }
    choose('自分のステージにも「' + name + '」があります', [
      ['自分のステージを開く', function () { go(draftFromRecord(name, own)); }],
      ['みんなのステージの形で置きかえる ⚠', function () {
        if (window.confirm('自分のステージ「' + name + '」で直していた所は消えます。置きかえますか？')) go(fromCloud(name));
      }]
    ]);
  }
  // 選ぶ窓（遊び方の窓と同じ見た目）。options: [[ボタンの文, 押したとき], …]。「やめる」も出す
  //   窓の外を押す・Esc は「やめる」。開いている間のキーは盤面に届かない（Enter で発動しない）
  function choose(title, options) {
    el.choiceTitle.textContent = title;
    el.choiceButtons.innerHTML = options.map(function (o, i) { return '<button type="button" data-c="' + i + '"' + (i === 0 ? ' class="primary"' : '') + '>' + esc(o[0]) + '</button>'; }).join('') +
      '<button type="button" data-c="-1">やめる</button>';
    el.choice.hidden = false;
    el.choiceButtons.querySelector('button').focus();
    el.choiceButtons.onclick = function (e) {
      var b = e.target.closest && e.target.closest('[data-c]');
      if (!b) return;
      el.choice.hidden = true;
      var i = Number(b.getAttribute('data-c'));
      if (i >= 0) options[i][1]();
    };
  }
  el.choice.addEventListener('click', function (e) { if (e.target === el.choice) el.choice.hidden = true; });
  el.choice.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); el.choice.hidden = true; }
  });

  // ---------------------------------------------------------------
  // 展示の並び（IMPROVE_v3 段3・段4）: 展示モードで遊ぶステージと順番。開発モードの「展示の並び」で決める
  //   { start: はじめから遊ぶ の順番, pick: 選んで遊ぶ に出すもの }。中身は 'tut:tut1'（チュートリアル）か 'all:名前'（みんなのステージ）。
  //   共有の置き場所（Cloudflare）に置く（段4。段3 のこのブラウザの並び cafilia-mock-exhibit-lineup はもう読まない）
  // ---------------------------------------------------------------
  function lineupDefault() { return { start: EXHIBIT_STAGES.map(function (id) { return 'tut:' + id; }), pick: [] }; }
  function lineupGet() {
    var v = app.shared.lineup;
    return v && Array.isArray(v.start) && Array.isArray(v.pick) ? { start: v.start.slice(), pick: v.pick.slice() } : lineupDefault();
  }
  function refKind(ref) { return String(ref).slice(0, String(ref).indexOf(':')); }
  function refId(ref) { return String(ref).slice(String(ref).indexOf(':') + 1); }
  // 並びの1つが、今あるステージか（みんなのステージが読めないときは見つからない）
  function refOk(ref) {
    if (refKind(ref) === 'tut') return EXHIBIT_STAGES.indexOf(refId(ref)) >= 0;
    var rec = refKind(ref) === 'all' ? app.shared.stages[refId(ref)] : null;
    return !!(rec && SIO.build(R, rec.def).ok);
  }
  function refName(ref) { return refKind(ref) === 'tut' ? stageName(R.findPreset(refId(ref))) : refId(ref); }
  function inLineup(ref) { var v = lineupGet(); return v.start.indexOf(ref) >= 0 || v.pick.indexOf(ref) >= 0; }
  // 並びの1つを読む。みんなのステージは、チュートリアルと同じ道で読む（R.PRESETS に足して loadScenario）
  function loadRef(ref) {
    loadScenario(refKind(ref) === 'tut' ? refId(ref) : registerShared(refId(ref)));
  }

  // ---------------------------------------------------------------
  // 展示モードの流れ（IMPROVE_v3 段3）
  //   最初の画面 → [はじめから遊ぶ] 並び（はじめから）の順に1つずつ → ありがとう！
  //             → [ステージを選んで遊ぶ] 並び（選んで遊ぶ）の一覧から1つ → クリア！
  //   ありがとう！・クリア！では [最初の画面に戻る] [ほかのステージで遊ぶ]。文は texts.js の ui に置けば替わる（なければ【仮】の文）
  // ---------------------------------------------------------------
  // 遊べる並び（見つからないものは飛ばす）。どちらも空なら、チュートリアル①②③を「はじめから」にする【仮】
  function exhibitLists() {
    if (!app.shared.ok) { var tuts = lineupDefault().start; return { start: tuts, pick: tuts.slice() }; }   // つながっていないとき: チュートリアル①②③だけ（どちらも）
    var v = lineupGet(), start = v.start.filter(refOk), pick = v.pick.filter(refOk);
    if (!start.length && !pick.length) start = lineupDefault().start;
    return { start: start, pick: pick };
  }
  function renderExhibitHome(view) {
    var L = exhibitLists();
    var btn = function (attr, label, cls) { return '<button type="button" class="' + (cls || 'home-stage') + '" ' + attr + '>' + esc(label) + '</button>'; };
    var back = btn('data-ex="title"', ui('exBackTitle', '最初の画面に戻る'));
    var other = L.pick.length ? btn('data-ex="pick"', ui('exOther', 'ほかのステージで遊ぶ'), 'primary home-stage') : '';
    var logo = '<h2 class="ex-head ex-logo">' + esc(ui('exTitle', 'カフィーリア')) + '</h2>';
    // 最初の画面だけ: 題字を上に大きく、ボタンを真ん中に大きく、その下に「タッチでプレイ！！」（オーナー 10/31）
    el.home.classList.toggle('ex-title-view', view !== 'pick' && view !== 'thanks' && view !== 'clear');
    if (view === 'pick') {
      el.home.innerHTML = '<h2 class="ex-head">' + esc(ui('exPick', 'ステージを選んで遊ぶ')) + '</h2>' +
        '<div class="home-list ex-menu">' + L.pick.map(function (r) { return btn('data-play="' + esc(r) + '"', refName(r)); }).join('') + '</div>' +
        '<div class="home-list ex-menu">' + back + '</div>';
    } else if (view === 'thanks' || view === 'clear') {
      // ありがとう！（チュートリアルを遊び終えたあと）・クリア！（選んで遊ぶ）: 試遊アンケートの QR とひとこと（オーナー 10/31）
      var survey = '<div class="ex-survey"><img src="game/survey_qr.png" alt="試遊アンケートの QR コード">' +
        '<p>' + esc(ui('exSurvey', 'よかったらアンケートお願いします！')) + '</p></div>';
      el.home.innerHTML = '<h2 class="ex-head big">' + esc(view === 'thanks' ? ui('exThanks', 'ここまで遊んでくれてありがとう！') : ui('exClear', 'クリア！')) + '</h2>' +
        survey + '<div class="home-list ex-menu">' + back + other + '</div>';
    } else if (!app.shared.loaded) {
      el.home.innerHTML = logo + '<div class="ex-mid"><p class="muted">' + esc(ui('exLoading', '読み込み中…')) + '</p></div>';
    } else {
      el.home.innerHTML = logo + '<div class="ex-mid">' +
        '<div class="home-list ex-menu ex-menu-big">' +
        (L.start.length ? btn('data-ex="start"', ui('exStart', 'はじめから遊ぶ'), 'primary home-stage') : '') +
        (L.pick.length ? btn('data-ex="pick"', ui('exPick', 'ステージを選んで遊ぶ')) : '') + '</div>' +
        '<p class="ex-touch">' + esc(ui('exTouch', 'タッチでプレイ！！')) + '</p></div>';
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
        '<span class="lu-name">' + esc(refName(r)) + '<small>' + (refKind(r) === 'tut' ? 'チュートリアル' : 'みんなのステージ') + '</small>' +
        (ok ? '' : '<small class="danger">見つからない（展示では飛ばす）</small>') + '</span>' +
        '<button type="button" class="lu-out" data-out="' + list + '" data-i="' + i + '">外す</button></li>';
    };
    var sec = function (list, title, note) {
      return '<section class="home-sec"><h3>' + esc(title) + ' <small>' + esc(note) + '</small></h3><ol class="lu-list" data-list="' + list + '">' +
        (d[list].length ? d[list].map(function (r, i) { return item(list, r, i); }).join('') : '<li class="lu-empty muted">まだありません（展示では、この段のボタンを出さない）</li>') + '</ol></section>';
    };
    var opts = EXHIBIT_STAGES.map(function (id) { return '<option value="tut:' + id + '">' + esc(stageName(R.findPreset(id))) + '（チュートリアル）</option>'; }).join('') +
      sharedList().map(function (nm) { return '<option value="all:' + esc(nm) + '">' + esc(nm) + '（みんなのステージ）</option>'; }).join('');
    el.home.innerHTML = '<h2>展示の並び <small>展示モードで遊ぶステージと順番</small></h2>' +
      '<p class="lu-warn">⚠ 注意！ここを変えると、展示モードの並びがどのパソコンでも変わります</p>' +
      sec('start', 'はじめから遊ぶ の順番', 'ドラッグで並び替え') +
      sec('pick', '選んで遊ぶ に出すもの', '開発で選んだものだけが、展示の一覧に出る') +
      '<section class="home-sec"><h3>＋ 足す <small>チュートリアル・みんなのステージから（自分のステージは、共有してから）</small></h3>' +
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
      if (!window.confirm('本当に変えますか？\n展示モードの並びが、どのパソコンでも、この並びに変わります。')) return true;
      b.disabled = true;
      api('PUT', 'lineup', { start: d.start, pick: d.pick }).then(function (res) {
        if (!res.ok) { window.alert('変えられませんでした: ' + netWhy(res)); renderLineup(); return; }
        app.shared.lineup = { start: d.start.slice(), pick: d.pick.slice(), at: res.data.at };
        app.lineupDraft = SIO.clone(d);
        app.lineupSaved = true;
        if (app.homeView === 'lineup') renderLineup();
      });
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
  function sharedList() {
    var st = app.shared.stages;
    return Object.keys(st).sort(function (a, b) { return (st[b].at || 0) - (st[a].at || 0); });   // 新しく共有した順
  }
  function renderHome() {
    if (EXHIBIT) { renderExhibitHome(app.homeView); return; }
    if (app.homeView === 'lineup') { renderLineup(); return; }
    var stages = stageStore(), mine = ownList(), mig = migrateInfo();
    el.home.innerHTML = '<h2>開発 <small>ステージを押すと遊べる。E（✎ エディット）で作る側へ</small></h2>' +
      '<section class="home-sec"><h3>チュートリアル <small>作る側にすると、写しが自分のステージにできる（元は変わらない）</small></h3><div class="home-list">' +
      EXHIBIT_STAGES.map(function (id) { return '<button type="button" class="home-stage" data-open="tut:' + id + '">' + esc(stageName(R.findPreset(id))) + '</button>'; }).join('') +
      '</div></section>' +
      '<section class="home-sec"><h3>みんなのステージ <small>共有したもの。どのパソコンからも遊べる。作る側にすると、自分のステージに写しができる</small></h3><div class="home-list">' +
      (!app.shared.loaded ? '<p class="muted">読み込み中…</p>' : !app.shared.ok ? '<p class="note">' + esc(app.shared.why) + '</p>' :
        sharedList().length ? sharedList().map(function (nm) {
          return '<span class="home-own"><button type="button" class="home-stage" data-open="all:' + esc(nm) + '">' + esc(nm) + '</button>' +
            '<button type="button" class="home-del" data-sdel="' + esc(nm) + '" title="みんなのステージ「' + esc(nm) + '」を消す">消す</button></span>';
        }).join('') : '<p class="muted">まだありません（エディットの「共有する」で増える）</p>') +
      '</div></section>' +
      '<section class="home-sec"><h3>自分のステージ <small>このブラウザに自動で残る。新しく直した順</small></h3><div class="home-list">' +
      (mine.length ? mine.map(function (nm) {
        return '<span class="home-own"><button type="button" class="home-stage" data-open="my:' + esc(nm) + '">' + esc(nm) + '</button>' +
          '<button type="button" class="home-del" data-del="' + esc(nm) + '" title="「' + esc(nm) + '」を消す">消す</button></span>';
      }).join('') : '<p class="muted">まだありません</p>') + '</div>' +
      (stages === null ? '<p class="note">この環境ではブラウザに残せません。作ったら「共有する」で、みんなのステージに置いてください。</p>' : '') +
      (mig && mig.failed ? '<p class="note">前の作りかけ・前の保存のうち ' + mig.failed + 'つは今の形に直せず、移していません（消さずに残しています）。</p>' : '') +
      '</section>' +
      '<div class="home-list"><button type="button" class="primary home-new" data-new="1">＋ 新しく作る</button>' +
      '<button type="button" class="home-new" data-lineup="1"' + (app.shared.ok ? '' : ' disabled title="' + esc(app.shared.why || '読み込み中…') + '"') + '>展示の並び</button></div>';
  }
  // 最初の画面を出す・しまう。view: 開発は 'list'（一覧）・'lineup'（展示の並び）、展示は 'title'・'pick'・'thanks'・'clear'
  function showHome(on, view) {
    app.home = on;
    if (on) app.homeView = view || (EXHIBIT ? 'title' : 'list');
    el.home.hidden = !on;
    document.body.classList.toggle('at-home', on);
    // 前のシナジーの文（banner）をしまう。残っていると、盤面がまた見えた瞬間にアニメーションが最初から流れ直す
    el.banner.classList.remove('show');
    if (on) {
      renderHome();
      if (app.homeView !== 'lineup') fetchShared().then(function () { if (app.home && app.homeView !== 'lineup') renderHome(); });   // みんなのステージ・展示の並びを読み直す
    }
  }
  // みんなのステージを遊ぶ（E で作る側へ。自分のステージに写しができる）
  function playShared(name) {
    if (!app.shared.stages[name]) { window.alert('みんなのステージに「' + name + '」が見つかりません'); return; }
    showHome(false);
    loadScenario(registerShared(name));
  }
  // みんなのステージを消す: 展示の並びに入っていたら消せない。どのパソコンからも消えるので ⚠ で確かめる
  function deleteShared(name) {
    if (inLineup('all:' + name)) { window.alert('「' + name + '」は展示の並びに入っているので消せません。展示の並びから外すと消せます'); return; }
    if (!window.confirm('みんなのステージ「' + name + '」を消します。\n⚠ どのパソコンからも消えます。元に戻せません。消しますか？')) return;
    api('DELETE', 'stages/' + encodeURIComponent(name)).then(function (res) {
      if (!res.ok) window.alert('消せませんでした: ' + netWhy(res));
      fetchShared().then(function () { if (app.home) renderHome(); });
    });
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
  // 開発モード: ブラウザ（スマホ）の「戻る」で、展示モードに戻らず1つ上の画面へ（オーナー 11/03。IMPROVE_小さい直し 1-1）
  //   テストプレイ（作っているステージ）→ エディット → 開発の最初の画面。ほかのステージのテストプレイ・エディット → 最初の画面。
  //   最初の画面ではその場に残る（開発モードから出るのは、今までどおり右下の点の長押しだけ）。開いている窓があれば、まず窓を閉じる。
  //   「1手戻す」（app.history）とは別のもの。展示モードの「戻る」は今のまま。
  function navBack() {
    if (!el.howto.hidden) { setHowto(false); return; }
    if (!el.choice.hidden) { el.choice.hidden = true; return; }
    if (app.closeDialog) { app.closeDialog(); return; }
    if (app.busy) skipPlayback();
    if (app.home) {
      if (app.homeView === 'lineup' && (!lineupDirty() || window.confirm('展示の並びで変えたところを捨てて、一覧に戻りますか？'))) { app.homeView = 'list'; renderHome(); }
      return;
    }
    if (testing()) setEditMode(true);
    else goHome();
  }
  //   履歴は2つだけ使う: 下（base）と上（top）。いつも top にいて、「戻る」で base に来たら、アプリの中で1つ上の画面へ戻し、
  //   history.forward() で top に戻る（積み直さない）。URL は変えない（#dev のまま。hashchange は起きない）。
  //   top はページを触ったとき（ユーザーの操作の中）に積む。操作なしで積んだ履歴は、Chrome の「戻る」が飛ばしてしまうため。
  if (!EXHIBIT && window.history && window.history.replaceState) (function () {
    var H = window.history;
    try { H.replaceState({ cafNav: 'base' }, ''); } catch (e) { return; }
    function arm() {
      var st = H.state;
      if (!(st && st.cafNav === 'top')) { try { H.pushState({ cafNav: 'top' }, ''); } catch (e) { /* 積めなくても遊べる（戻るは今までどおり） */ } }
    }
    ['pointerdown', 'keydown'].forEach(function (n) { window.addEventListener(n, arm, true); });
    window.addEventListener('popstate', function (e) {
      if (!(e.state && e.state.cafNav === 'base')) return;
      navBack();
      H.forward();
    });
  })();
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
    refreshShare();
  }
  // 自分のステージを消す: 確かめてから（元に戻せない）
  function deleteOwn(name) {
    var stages = stageStore();
    if (!stages || !stages[name]) return;
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
    if (b.hasAttribute('data-sdel')) { deleteShared(b.getAttribute('data-sdel')); return; }
    if (b.hasAttribute('data-new')) { newFromHome(); return; }
    var open = b.getAttribute('data-open') || '', kind = open.slice(0, open.indexOf(':')), name = open.slice(open.indexOf(':') + 1);
    if (kind === 'tut') { showHome(false); loadScenario(name); }
    else if (kind === 'my') playOwn(name);
    else if (kind === 'all') playShared(name);
  });
  el.btnHome.addEventListener('click', goHome);
  if (el.btnView) el.btnView.addEventListener('click', toggleView);
  // 展示モードの左上「⌂ タイトル」: 確かめてから最初の画面へ（遊んでいたステージは続きから戻れない。オーナー 10/31）
  el.btnTitle.addEventListener('click', function () {
    el.btnTitle.blur();
    choose(ui('exTitleAsk', 'タイトルに戻りますか？'), [[ui('exTitleGo', 'タイトルに戻る'), function () { exhibitScreen('title'); }]]);
  });

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
    // キーはおまけ（IMPROVE_controls 6章）。展示モード: 味方 1〜、向き 矢印・WASD、魔法 Enter、1手戻す Z、取り消し Esc（待機のキーはない。オーナー 10/31）。
    //   誰も選んでいないときの Enter は、右下のボタンと同じ（発動・クリアする・次へ・やり直す。advance）
    //   開発モードは、これに エディット ⇄ テストプレイ の E と、エディットで駒を消す Delete、見た目（真上 ⇄ 奥行き）の V を足す
    if (!(/^[1-9]$/.test(k) || KEY_DIR[k] || /^(Enter|z|Z|Escape)$/.test(k) || (!EXHIBIT && /^([eE]|[vV]|Delete|Backspace)$/.test(k)))) return;
    if (k === 'z' || k === 'Z') { undo(); return; }
    if (k === 'v' || k === 'V') { toggleView(); return; }
    if (k === 'e' || k === 'E') { setEditMode(!app.editMode); return; }
    if (app.editMode) {
      if (k === 'Escape') { if (app.editPick) app.editPick = null; else app.editTool = 'pick'; render(); }   // 選んだ駒を外す → 道具を外す
      // 選んだ駒: 矢印キー・WASD で向き、Delete で消す
      if (app.editPick && KEY_DIR[k]) { e.preventDefault(); editUnitAct('facing', app.editPick, KEY_DIR[k]); }
      if (app.editPick && (k === 'Delete' || k === 'Backspace')) { e.preventDefault(); editUnitAct('remove', app.editPick); }
      return;
    }
    if (k >= '1' && k <= '9') {
      var a = R.controllableOf(app.state)[Number(k) - 1];
      if (a && canControl()) select(a.id);
      return;
    }
    if (KEY_DIR[k]) { e.preventDefault(); setDir(KEY_DIR[k]); return; }
    if (k === 'Enter') { e.preventDefault(); if (!advance()) doAct(true); return; }
    if (k === 'Escape') {
      var u = selUnit();
      if (u && u.moved && canControl() && reachOf(u)[key(u.moved.from[0], u.moved.from[1])] !== undefined) cancelMove();   // 動いていれば元の位置へ、そうでなければ選ぶのをやめる
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
