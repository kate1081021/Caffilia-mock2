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

  // 展示ステージ③（s.ex）: 画面の見せ方（形だけの予測・光るヒント・ミッション・ため・大きな絵・魔法の出し方）
  function exOf(st) { st = st || app.state; return (st && st.ex) || null; }
  function shapeOnly() { var x = exOf(); return !!(x && x.shapeOnly) && !app.editMode; }
  // 魔法の出し方: step ターンの終わりに1段ずつ（初期）／chain ターンの終わりにつながる／instant 撃った瞬間に発動。選んだ形は覚える
  var EX_FIRE_KEY = 'caffilia-ex3-fire-mode';
  var EX_FIRE = [['step', 'exFireStep', 'ターンの終わりに1段ずつ'], ['chain', 'exFireChain', 'ターンの終わりにつながる'], ['instant', 'exFireInstant', '撃った瞬間に発動']];
  function exFireMode() {
    var v = null;
    try { v = window.localStorage.getItem(EX_FIRE_KEY); } catch (e) { v = null; }
    return EX_FIRE.some(function (x) { return x[0] === v; }) ? v : 'step';
  }
  // ステージ③を読むときだけ、ターンの形をその出し方にする（ステージ③を出たら元に戻す）
  function applyExFire(m) {
    if (!app.exTurnRestore) app.exTurnRestore = { turnMode: B.turnMode };
    B.turnMode = m === 'instant' ? 'single' : 'simul';
    B.simul.stepwise = m === 'step';
    app.exFire = m;
    app.cache = {};
  }
  function restoreExFire() {
    if (app.exTurnRestore) { B.turnMode = app.exTurnRestore.turnMode; app.exTurnRestore = null; app.cache = {}; }
    B.simul.stepwise = false;
    app.exFire = null;
  }

  // 【一斉】ターンの形。選んだ形は覚える（読み書きは try/catch。使えなければ毎回、一斉から）
  var TURN_KEY = 'caffilia-turn-mode';
  function simul() { return B.turnMode === 'simul'; }
  (function () {
    var saved = null;
    try { saved = window.localStorage.getItem(TURN_KEY); } catch (e) { saved = null; }
    B.turnMode = saved === 'single' || saved === 'simul' ? saved : 'simul';
  })();

  var DIR_ARROW = { up: '↑', right: '→', down: '↓', left: '←' };
  var DIR_ROT = { up: 0, right: 90, down: 180, left: 270 };
  var ORDER_MARK = ['', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];   // 【一斉】発動の順番
  var KEY_DIR = { ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down', ArrowLeft: 'left' };
  var SHORT = { empty: '空き', forest: '森', mountain: '山', river: '川', fire: '炎', smallfire: '小炎', volcano: '火山', mud: '泥沼', puddle: '水たまり', mirage: '蜃気楼', ice: '氷', lava: '溶岩', whirlwind: 'つむじ風', tornado: '竜巻', breeze: '風', firewhirl: '火の渦', sakura: '桜', petals: '花びら', deadforest: '死の森', haunted: 'オバケヤシキ', hill: '丘', thicket: '草むら', gale: '強風', hillsakura: '丘の桜' };
  Object.keys(R.TILE_INFO).forEach(function (t) { if (!SHORT[t]) SHORT[t] = R.TILE_INFO[t].name; });   // ラボで足した自然（葦原・雪山 など）
  var STORE_KEY = 'cafilia-mock-v2-layouts';
  // 【育つ】つながると1枚の大きな絵になる自然（名前は見た目だけ）
  var BIG = {
    forest: { cls: 'woods', name: '大森林', mark: '🌲' },
    puddle: { cls: 'lake', name: '湖', mark: '〜' },
    ice: { cls: 'icefield', name: '氷原', mark: '❄' },
    deadforest: { cls: 'deadwoods', name: '死の森', mark: '🥀' }
  };
  var J1_BIG = { river: { cls: 'lake', name: '大河', mark: '〜' }, sakura: { cls: 'blossom', name: '桜の山', mark: '🌸' }, fire: { cls: 'blaze', name: '大火', mark: '🔥' } };   // ラボ J1

  var TILE_DESC = {
    empty: '何もないマス。通れる。',
    thicket: '【育つ】通れる。低い草。火で燃え、燃え広がり・燃え移りにも巻き込まれる（今は弱い炎）。草をもう一度当てると森に育つ。低いので雷は落ちず、闇でも死の森にならない。水が流れると沈んで川になる。',
    forest: '通れる。火で炎になる。燃え広がりに巻き込まれると、つながった森ごと燃える。',
    mountain: '通れない。風をさえぎる（山の陰）。火が点くと、つながった山ごと火山になる【新案】。水が当たると山を下って、盤の端まで川になる【新案: 源流】。',
    hill: '【育つ】通れるが、入るとそこで止まる。上から撃つと、形が正面へ1マス先にずれる（高台）。低いので風も燃え広がりも通す。雷は落ちる。土をもう一度当てると山に育つ。水が当たると川が流れる（源流）。火は何も起きない。',
    river: '通れない。燃え広がりを止める（防火帯）。土で泥沼。風が吹くと水が運ばれて水たまりになる【新案】。雷が触れると、つながった水全体に走る【新案: 感電】。',
    // 数値は調整パネルで変わるので、見るたびに作る
    get fire() { return '通れる。ターン終了時、上にいる者に' + B.fireTileDamage + 'ダメージ、隣の森へ燃え移る。できてからターン終了を' + B.fire.burnOutTurns + '回迎えると燃え尽きて空きに戻る（「尽」が予告）。水で消える。風が当たると燃え広がり（燃えた森の上は強い炎' + B.fire.strongDamage + '、ほかは弱い炎' + B.fire.weakDamage + '＋火傷）。'; },
    smallfire: '通れる。ターン終了で消える。ダメージも燃え移りもしない。風が当たると燃え広がり。',
    volcano: '【新案】通れない。山に火で火山になる。風が当たると火の粉が風下へ扇形に舞う（桜吹雪）。噴き終えると山に戻る。',
    mud: '通れる。入った者は次の移動が1回できない（撃つことはできる）。',
    puddle: '【新案】通れる。風が運んだ川の水（【育つ】空きに水を1回でもできる。水たまりに水を流すと、そこから奥へ川に育つ）。雷が落ちると、つながった水全体に走り、上と隣にいる全員が感電する。土で泥沼、水で川に戻る、火で蜃気楼になる。',
    mirage: '【新案】通れる。水たまりに火を点けると立ちのぼる。中にいる者は敵から見つからない（狙われない）。水が流れると川に戻る。',
    ice: '【新案】通れる（凍った川は歩いて渡れる）。氷の魔法が水に触れると、つながった水がまとめて凍る。火で溶けて水たまりに戻る。',
    lava: '【新案】通れない。火が山に点くと、山脈ごと噴火してあふれ出る（山脈が大きいほど遠くまで）。水が流れてきたり冷気が当たったりすると、冷えて山になる。燃え広がりを止める。',
    gale: '【育つ】通れる。風が残るマスにもう一度風を当てると、そこから奥へ4マス吹き抜ける強い風。通り道の者を2マス運ぶ。強風で起こした燃え広がりは遠くまで走る。ターン終了でやむ。',
    breeze: '【新案・試し】通れる。風（2マス）が吹いたあとに残り、ターン終了で消える。火を入れると火の渦（火が風を強くして2×2の渦に）。',
    sakura: '【新案・試し】通れない（山と同じ）。山に草を植えると咲く。風が当たると桜吹雪（花びらが扇形に舞い、桜は散って山に戻る）。',
    hillsakura: '【育つ】通れる（丘と同じ）。丘に草を植えると咲く。風が当たると桜吹雪（扇2列。山の桜は3列）。散ると丘に戻る。',
    petals: '【新案・試し】通れる。桜吹雪の跡。ターン終了で散る。',
    deadforest: '【新案・試し】通れる。森に闇を撃つと、つながった森がまとめて死の森になる。火を点けるとオバケヤシキ。',
    haunted: '【新案・試し】通れない。死の森に火で、その1マスがなる。できたとき、まわり2マス以内の者を引き寄せ、中と隣の全員に5（中身は仮）。',
    firewhirl: '【新案・試し】通れない。風に火で2×2。水を入れるとセンタクキ（まわりがぐるっと回り、渦は跡形もなく消える）。風が当たると燃え広がり。ターン終了で解けて炎になる。',
    whirlwind: '【新案】通れる。風が吹き抜けた先に残る。もう一度風が当たると、2×2の竜巻に育つ。',
    tornado: '【新案】通れない（中にいた者はとらわれる）。火を入れるとセンタクキ（まわりがぐるっと回り、竜巻は消える）。元の作り方では、火で火炎竜巻、水でセンタクキ。'
  };

  var OBJECT_DESC = {
    village: '村: 動かない（風で押されない・引き寄せられない）。通れない。直撃・決め手・炎の上で壊れる（味方の魔法でも）。',
    wagon: '馬車: ターンの終わりにゴールへ1マス進む。危ない所とユニットは避ける。風で押される・引き寄せられる。直撃・決め手・炎の上でダメージ（味方の魔法でも）。'
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
    'dirCenter', 'btnStay', 'btnShoot', 'btnWait', 'btnSwap', 'enemyList', 'tilePalette', 'unitTools', 'unitList',
    'enemyActs', 'boardSize', 'btnResize', 'btnClearTiles', 'saveName', 'btnSave', 'savedList', 'btnLoadSaved',
    'btnDeleteSaved', 'storeNote', 'jsonBox', 'btnExport', 'btnDownload', 'btnImport', 'fileInput',
    'btnEditDone', 'log', 'showForecast', 'btnDemo', 'demoSelect', 'recipeSelect', 'windModeSelect', 'sakuraSelect',
    'missionBar', 'missionSelect', 'missionTools', 'checkPick', 'checkSelect', 'btnCheck', 'checkCaption',
    'btnTutorial', 'tutorialMenu', 'btnRetry', 'btnSealWin', 'stageHint', 'exBar',
    'turnModeSelect', 'turnModeLabel', 'orderPanel', 'howtoTitle', 'howtoList', 'howtoClose'].forEach(function (id) { el[id] = $(id); });

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
    if (finishers.length) labRecord(finishers);   // ラボ J8: 図鑑に記録
    if (finishers.length) {
      // 【一斉】発動の流れの中で続けて起きた決め手は、名前をつないで出す（「燃え広がり → オバケヤシキ！」）。合体なら上に「合体！ 土・草・風」
      //   ラボ J4: 1つの行動の中の連鎖も、名前をつないで数える
      if (app.chain) showBanner(app.chain.join(ui('chain', ' → ')) + '！' + (R.lab('J4') && app.chain.length > 1 ? '（' + app.chain.length + '連鎖）' : ''), app.chainCombo || combo);
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
        if (R.lab('J3') && R.LX && e.cells && e.cells.length) fxWave(e.cells, e.wave || R.LX.waveFrom(e.cells, e.origin || e.cells[0]));   // ラボ J3: 波
      });
      if (R.lab('J6')) {   // ラボ J6: 起きたことを盤面の吹き出しで1つずつ
        var nb = 0;
        events.forEach(function (e) {
          if (!e.text || !e.cells || !e.cells.length || e.type === 'damage') return;
          var c0 = e.cells[0], t = e.text.replace(/【[^】]*】/g, '').replace(/^.*?→ /, '');
          if (t.length > 18) t = t.slice(0, 17) + '…';
          (function (c, txt, delay) { setTimeout(function () { popup(c[0], c[1], txt, 'bubble'); }, delay); })(c0, t, nb++ * 350);
        });
      }
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

  // ラボ J3: 決め手の範囲を、起点から順に光らせる（波）
  function fxWave(cells, wave) {
    cells.forEach(function (c, i) {
      var p = cellCenter(c[0], c[1]);
      if (!p) return;
      var d = document.createElement('div');
      d.className = 'wavecell';
      d.style.left = p.x + 'px';
      d.style.top = p.y + 'px';
      d.style.animationDelay = ((wave && wave[i]) || 0) * 80 + 'ms';
      el.fx.appendChild(d);
      setTimeout(function () { d.remove(); }, 900 + ((wave && wave[i]) || 0) * 80);
    });
  }
  // ラボ J8: 起こした決め手を図鑑に記録（localStorage。使えなければ何もしない）
  function labRecord(names) {
    if (!R.lab('J8')) return;
    try {
      var z = JSON.parse(localStorage.getItem('cafilia-lab-zukan') || '{}');
      names.forEach(function (n) { z[n] = (z[n] || 0) + 1; });
      localStorage.setItem('cafilia-lab-zukan', JSON.stringify(z));
    } catch (err) { /* 保存できない環境 */ }
  }

  // 途中の状態を1つずつ見せる
  function play(steps, finalState, done) {
    if (R.lab('J4') && !app.chain) app.chain = [];   // ラボ J4: 1つの行動の中の連鎖を数える（【一斉】の発動は runEndTurn が先に始める）
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
    pb.timer = setTimeout(nextStep, app.demo ? wait * 1.6 : wait);
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
    if (app.afterPlayback) app.afterPlayback();   // 進行モック: 戦闘の決着を見る
    exAfterPlayback();
  }
  // 展示ステージ③: 決着のあと。味方が倒れたら少し見せてからステージの頭からやり直す
  function exAfterPlayback() {
    var ex = exOf(), st = app.state;
    if (!ex || app.demo || app.editMode || !st.result) return;
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
    return u && (!u.acted || R.restancing(u) || (R.lab('F5') && u.labStance)) ? u : null;   // 【一斉】構えた味方は、発動の前なら構え直せる（ラボ F5 も）
  }
  function canControl() { return !app.busy && !app.editMode && !app.state.result; }

  function select(id) {
    var u = R.findUnit(app.state, id);
    if (!u || u.side !== 'ally' || u.npc) return;   // 構える味方は選べない
    if (u.acted && !R.restancing(u) && !(R.lab('F5') && u.labStance)) { say(R.unitLabel(app.state, u) + 'はもう行動しました'); return; }   // 【一斉】・ラボ F5: 構えた味方は構え直せる
    app.sel = id;
    app.plan = { to: [u.x, u.y], dir: u.facing };
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

  function doAct(shoot, extra) {
    var u = selUnit();
    if (!u || !canControl()) return;
    var opts = { to: app.plan.to, dir: app.plan.dir, shoot: shoot };
    Object.keys(extra || {}).forEach(function (k) { opts[k] = extra[k]; });   // ラボ F6 壊す・F7 作業台
    var res = R.act(app.state, u.id, opts);
    if (!res.ok) { say(res.error); return; }
    pushHistory();
    var id = u.id;
    app.sel = null; app.plan = null;
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
      if (simul()) { app.chain = []; app.chainCombo = null; }
      play(t.steps, t.state, function () {
        if (R.sealReady(app.state)) { app.sel = null; app.plan = null; render(); }   // ステージ②: ふさぎきったら味方を選ばず、「クリアする」の案内を出す
        else selectNext(null);
        if (app.onTurnDone) app.onTurnDone();
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
    app.sel = null; app.plan = null;
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
    stopDemo();
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
    stopDemo();
    if (app.busy) skipPlayback();
    setState(R.clone(app.resetPoint), 'リセット（最初の配置に戻した）');
    if (isTutorial()) selectNext(null);
    if (app.onStage) app.onStage('start');
  }

  // チュートリアル: 負けたあと、ステージを最初から始め直す（やり直した回数が増え、ヒントが出る）
  function retry() {
    stopDemo();
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
      addLog('エディット終了。この配置が「リセット」の戻り先になった', 'system');
      setState(begin(app.state));
      app.resetPoint = R.clone(app.state);
    }
  }

  // opts.check: 新案プレイ（checks.js）の盤面を読む。それ以外を読むときは、新案プレイの切り替えを元に戻す
  function loadScenario(id, opts) {
    if (app.busy) skipPlayback();
    var check = opts && opts.check;
    if (!check) endCheck();
    // 試作ラボ: ラボ用シナリオは、盤面を作る前に案の切り替えを決める（大きい敵の大きさ などが切り替えで変わるため）
    var labPre = !check && id ? R.findPreset(id) : null;
    if (labPre && labPre.lab) {
      R.labApply(labPre.lab, labPre.labOpts);
      if (opts && opts.labOff && B.lab[opts.labOff]) B.lab[opts.labOff].on = false;
    }
    // 展示ステージ③: 読むときだけ、ターンの形を「魔法の出し方」にする（ステージ③の外では元の形に戻す）
    if (labPre && labPre.ex && labPre.ex.fireModes) applyExFire(exFireMode());
    else if (!check) restoreExFire();
    // 試作ラボのシナリオ・デモは「1人ずつ」で作ってある。読むときだけ1人ずつにして（覚えた形は変えない）、ラボ以外を読んだら元の形に戻す。
    //   ラボのシナリオの中で上のバーから形を選んだら、そちらを使う（app.labTurnKeep）
    if (labPre && labPre.lab) {
      if (!app.labTurnKeep && B.turnMode !== 'single') { app.labTurnRestore = B.turnMode; B.turnMode = 'single'; app.cache = {}; }
    } else if (!check) {
      app.labTurnKeep = false;
      if (app.labTurnRestore) { B.turnMode = app.labTurnRestore; app.labTurnRestore = null; app.cache = {}; }
    }
    var s = check ? R.buildPreset(check.layout) : id ? R.loadPreset(id) : R.createState();
    if (opts && opts.enemyActs === false) s = R.editSetEnemyActs(s, false).state;
    if (app.labPrepare && !check) s = app.labPrepare(s, labPre, opts || {});   // ラボ L: 味方に魔法の道を入れる（lab_target_ui.js）
    var preset = !check && id ? (id === 'plaza' ? R.plazaLayout(B.boardSize) : R.findPreset(id)) : null;   // 【縮尺】広場は今の盤面の大きさで作る
    var name = check ? check.name : preset ? preset.name : '標準';
    // 試作ラボ: ラボ用シナリオは、その案と needs だけをオンにする（ほかのラボの案はオフに戻る）。
    //   opts.labOff: その案だけオフにして同じ盤面をやり直す（オフでくらべる）
    if (preset && preset.lab) {
      app.cache = {};
      sideSig = '';
      var labOn = R.labOnList().map(function (k) { var c = R.labCard(k); return c ? c.name : k; });
      if (app.onLabChange) app.onLabChange();
    }
    app.labCompare = preset && preset.lab && opts && opts.labOff ? opts.labOff : null;
    if (preset && preset.recipe) setRecipe(preset.recipe);
    if (preset && preset.windMode) setWindMode(preset.windMode);
    if (preset && preset.sakuraFrom) setSakuraFrom(preset.sakuraFrom);
    app.scenario = check ? 'check:' + check.id : id;
    addLog((check ? '新案プレイの盤面' : 'シナリオ') + '「' + name + '」を読み込んだ', 'system');
    if (labOn) addLog('ラボの案: ' + (labOn.length ? labOn.join('・') + ' をオン' : 'すべてオフ') + (app.labCompare ? '（「' + (R.labCard(app.labCompare) || {}).name + '」だけオフでくらべる）' : ''), 'system');
    if (check) addLog(check.desc, 'system');
    else if (id && !preset.tutorial) addLog(preset.desc, 'system');   // チュートリアルは説明を出さない（盤面と表示だけで伝わるかを見る）
    if (opts && opts.enemyActs === false) addLog('（このデモでは敵は何もしない設定）', 'system');
    setState(begin(s));
    app.resetPoint = R.clone(app.state);
    if (preset && preset.tutorial) selectNext(null);   // チュートリアル: 動かせる味方を最初から選んでおく
    render();
    if (app.onStage) app.onStage('start');   // 文章（きっかけ: ステージの始め）
  }
  function isTutorial() { var p = app.scenario && R.findPreset(app.scenario); return !!(p && p.tutorial); }

  // ---------------------------------------------------------------
  // デモ（スーパープレイの再生）
  //   選ぶ → 移動先 → 向き（予測が出る）→ 撃つ を、見やすい間をあけて順に見せる
  // ---------------------------------------------------------------
  var DEMO_WAIT = { select: 800, move: 900, aim: 1600, after: 400 };

  // 【新案】竜巻の作り方を切り替える（くらべるため。盤面はそのまま）
  function setRecipe(r) {
    if (B.tornadoRecipe === r) return;
    B.tornadoRecipe = r;
    el.recipeSelect.value = r;
    app.cache = {};
    sideSig = '';
    addLog('竜巻の作り方: ' + el.recipeSelect.options[el.recipeSelect.selectedIndex].text, 'system');
  }

  // 【新案・試し】桜吹雪の起こし方を切り替える
  function setSakuraFrom(m) {
    if (B.sakura.from === m) return;
    B.sakura.from = m;
    el.sakuraSelect.value = m;
    app.cache = {};
    sideSig = '';
    addLog('桜吹雪の起こし方: ' + el.sakuraSelect.options[el.sakuraSelect.selectedIndex].text, 'system');
  }

  // 【新案・試し】風の形を切り替える
  function setWindMode(m) {
    if (B.windMode === m) return;
    B.windMode = m;
    el.windModeSelect.value = m;
    app.cache = {};
    sideSig = '';
    addLog('風の形: ' + el.windModeSelect.options[el.windModeSelect.selectedIndex].text, 'system');
  }

  function playDemo(demo) {
    stopDemo();
    if (app.editMode) setEditMode(false);
    setRecipe(demo.recipe || 'off');
    setWindMode(demo.windMode || 'breeze');
    app.demoLoading = true;   // デモでは文章（会話の窓）を出さない
    try { loadScenario(demo.preset, { enemyActs: demo.enemyActs }); } finally { app.demoLoading = false; }
    var queue = [];
    demo.turns.forEach(function (t) { t.forEach(function (a) { queue.push(a); }); if (simul()) queue.push({ fire: true }); });   // 【一斉】ターンごとに発動
    app.demo = { queue: queue, i: 0, timer: null, name: demo.name };
    addLog('▶ デモ再生: ' + demo.name, 'system');
    addLog(demo.desc, 'system');
    render();
    app.demo.timer = setTimeout(demoNext, 1000);
  }

  // ---------------------------------------------------------------
  // 新案プレイ（checks.js）: 試し中の新案を見て確かめる再生。スーパープレイと同じ進み方で、
  //   再生中だけ新案の切り替え（set）を BALANCE に重ね、1手ごとに「見るところ」を盤面の上に出す
  // ---------------------------------------------------------------
  var CHECK_WAIT = { say: 3200, aim: 3400 };

  function setLabel(path, v) {
    var T = window.Tune;
    var label = (T && T.LABELS[path]) || path;
    return label.replace(/（.*）$/, '') + ': ' + (v === true ? '入' : v === false ? '切' : v);
  }
  function applyCheckSet(set) {
    endCheck();
    app.checkSaved = {};
    Object.keys(set || {}).forEach(function (p) {
      var parts = p.split('.'), last = parts.pop();
      var obj = parts.reduce(function (o, k) { return o[k]; }, B);
      app.checkSaved[p] = { obj: obj, key: last, v: obj[last] };
      obj[last] = set[p];
    });
    app.cache = {};
    sideSig = '';
  }
  // 新案プレイの切り替えを元に戻し、説明を消す
  function endCheck() {
    if (app.checkSaved) {
      Object.keys(app.checkSaved).forEach(function (p) { var c = app.checkSaved[p]; c.obj[c.key] = c.v; });
      app.checkSaved = null;
      app.cache = {};
      sideSig = '';
    }
    app.check = null;
    el.checkCaption.hidden = true;
  }
  function showCaption(text, done) {
    var c = app.check;
    if (!c) return;
    var sets = Object.keys(c.set || {}).map(function (p) { return setLabel(p, c.set[p]); }).join('・');
    var kind = c.labDemo ? 'ラボのデモ' : '新案プレイ';
    el.checkCaption.innerHTML = '<div class="cc-head"><b>' + kind + '</b> ' + esc(c.name) + (sets ? '<span class="cc-set">' + esc(sets) + '</span>' : '') + '</div>' +
      (text ? '<div class="cc-say">' + esc(text) + '</div>' : '') +
      (done ? '<div class="cc-done">■ ' + kind + '終了（「1手戻す」でさかのぼれます。続けて手で遊ぶこともできます。' + (c.labDemo ? '' : 'この設定はほかのシナリオを読むと元に戻ります') + '）</div>' : '');
    el.checkCaption.hidden = false;
  }
  function playCheck(c) {
    stopDemo();
    if (app.editMode) setEditMode(false);
    setRecipe('off');
    setWindMode('breeze');
    applyCheckSet(c.set);
    app.demoLoading = true;
    try { loadScenario(null, { check: c, enemyActs: c.enemyActs }); } finally { app.demoLoading = false; }
    app.check = c;
    var queue = [];
    c.turns.forEach(function (t) { t.forEach(function (a) { queue.push(a); }); if (simul()) queue.push({ fire: true }); });   // 【一斉】ターンごとに発動
    app.demo = { queue: queue, i: 0, timer: null, name: c.name, check: c };
    addLog('▶ 新案プレイ: ' + c.name, 'system');
    showCaption('');
    render();
    app.demo.timer = setTimeout(demoNext, 1000);
  }

  // 試作ラボ: ラボ用シナリオのデモ（スーパープレイ）。シナリオを読み（案をオンにして）、say を盤面の上に出しながら再生する
  function playLabDemo(p, labOff) {
    stopDemo();
    if (app.editMode) setEditMode(false);
    loadScenario(p.id, { labOff: labOff, demo: true });   // demo: ラボ L の道は、持ち越した道ではなくシナリオのものを使う
    var c = { id: 'lab:' + p.id, name: p.name, set: {}, labDemo: true };
    app.check = c;
    var queue = [];
    p.demo.turns.forEach(function (t) { t.forEach(function (a) { queue.push(a); }); });
    app.demo = { queue: queue, i: 0, timer: null, name: p.name, check: c };
    addLog('▶ ラボのデモ: ' + p.name, 'system');
    if (p.demo.desc) addLog(p.demo.desc, 'system');
    showCaption(p.demo.desc || '');
    render();
    app.demo.timer = setTimeout(demoNext, 1000);
  }

  function demoNext() {
    var d = app.demo;
    if (!d) return;
    if (app.busy) { d.timer = setTimeout(demoNext, 150); return; }
    if (d.i >= d.queue.length || app.state.result) {
      addLog('■ ' + (d.check ? (d.check.labDemo ? 'ラボのデモ' : '新案プレイ') : 'デモ') + '終了（「1手戻す」で1手ずつさかのぼれます）', 'system');
      if (d.check) showCaption(d.lastSay, true);
      app.demo = null;
      render();
      return;
    }
    var a = d.queue[d.i++];
    if (a.say && d.check) { d.lastSay = a.say; showCaption(a.say); addLog('💬 ' + a.say, 'system'); }
    if (a.fire) {
      // 【一斉】ターンの終わりの発動。構えていない味方（デモに手がない・ターン終了の項目で終えるターン）は待機にしてから
      if (app.state.result || !R.controllableOf(app.state).some(function (x) { return x.acted; })) { demoNext(); return; }   // このターンはもう終えた
      var st = app.state;
      R.controllableOf(st).forEach(function (x) { if (!x.acted) { var w = R.act(st, x.id, { shoot: false }); if (w.ok) st = w.state; } });
      app.state = st;
      doEndTurn();
      d.timer = setTimeout(demoNext, DEMO_WAIT.after);
      return;
    }
    if (a.endTurn) {   // ターン終了の項目（【一斉】構えていない味方は待機にしてから発動）
      if (simul()) { var s2 = app.state; R.controllableOf(s2).forEach(function (x) { if (!x.acted) { var w2 = R.act(s2, x.id, { shoot: false }); if (w2.ok) s2 = w2.state; } }); app.state = s2; }
      doEndTurn(); d.timer = setTimeout(demoNext, CHECK_WAIT.say); return;
    }
    if (!a.id) { d.timer = setTimeout(demoNext, CHECK_WAIT.say); return; }   // 説明だけの項目
    if (!R.findUnit(app.state, a.id)) { demoNext(); return; }
    if (a.swap && R.labSwapMagic) { var sw = R.labSwapMagic(app.state, a.id); if (sw.ok) { app.state = sw.state; app.clearCache(); } }   // ラボ G9: 撃つ前に持ち替える
    var aimWait = d.check ? CHECK_WAIT.aim : DEMO_WAIT.aim;
    select(a.id);
    d.timer = setTimeout(function () {
      if (app.demo !== d) return;
      app.plan.to = a.to;
      render();
      d.timer = setTimeout(function () {
        if (app.demo !== d) return;
        app.plan.dir = a.dir;
        render();
        d.timer = setTimeout(function () {
          if (app.demo !== d) return;
          doAct(a.shoot !== false, { labBreak: a.labBreak, labBench: a.labBench });   // ラボ F6・F7 の項目
          d.timer = setTimeout(demoNext, DEMO_WAIT.after);
        }, aimWait);
      }, DEMO_WAIT.move);
    }, DEMO_WAIT.select);
  }

  // ラボ G9: 選んでいる味方の魔法を、2つ目の魔法と持ち替える
  function swapMagic() {
    var u = canControl() ? selUnit() : null;
    if (!u || !R.labSwapMagic || !R.lab('G9')) return;
    var r = R.labSwapMagic(app.state, u.id);
    if (!r.ok) { say(r.error); return; }
    pushHistory();
    app.state = r.state;
    addLog(r.events[0].text, 'system');
    app.clearCache();
    render();
  }

  // ラボ G: エディットの強化の付け外し（オンになっている案だけ出す）
  var G4_PAIRS = ['grass,fire', 'wind,fire', 'fire,wind', 'water,earth', 'grass,water', 'earth,fire', 'water,ice', 'wind,water'];
  var G5_TRIPLES = ['grass,dark,fire', 'wind,fire,water', 'grass,fire,wind', 'water,ice,earth'];
  function boostEditHtml(u) {
    if (!R.LX || u.side === 'object') return '';
    var B2 = R.LX.boostOf, out = [];
    var sel = function (k, label, opts) {
      var cur = B2(u, k);
      var curS = cur === undefined ? '' : Array.isArray(cur) ? cur.join(',') : String(cur === true ? '1' : cur);
      out.push('<label>' + label + ' <select data-id="' + u.id + '" data-field="boost:' + k + '">' + opts.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (curS === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('') + '</select></label>');
    };
    var mn = function (list) { return list.split(',').map(R.magicName).join('→'); };
    if (R.lab('G1')) sel('G1', '一気に二段', [['', 'なし'], ['1', 'あり']]);
    if (R.lab('G2')) sel('G2', '伸びる', [['', '0回'], ['1', '1回'], ['2', '2回'], ['3', '3回']]);
    if (R.lab('G3')) { var f = R.LX.FORMS[u.magic] || {}; sel('G3', '姿', [['', 'なし']].concat(['A', 'B'].filter(function (k) { return f[k]; }).map(function (k) { return [k, k + ' ' + f[k].name]; }))); }
    if (R.lab('G4')) sel('G4', '融合', [['', 'なし']].concat(G4_PAIRS.map(function (p) { return [p, mn(p)]; })));
    if (R.lab('G5')) sel('G5', '最終融合', [['', 'なし']].concat(G5_TRIPLES.map(function (p) { return [p, mn(p)]; })));
    if (R.lab('G6')) sel('G6', '武器', [['', 'なし']].concat(Object.keys(R.LX.WEAPONS).map(function (k) { var w = R.LX.WEAPONS[k]; return [k, w.name + '（' + w.where + 'で強い）']; })));
    if (R.lab('G9') && u.side === 'ally') sel('G9', '2つ目の魔法', [['', 'なし']].concat(R.allyMagics(app.state).filter(function (m) { return m !== u.magic; }).map(function (m) { return [m, R.magicName(m)]; })));
    var lp = app.labPathEditHtml ? app.labPathEditHtml(u) : '';   // ラボ L: 魔法の道（lab_target_ui.js）
    return (out.length ? '<span class="persona-edit lab-boost">' + out.join('') + '</span>' : '') + lp;
  }
  function boostValue(k, v) {
    if (v === '') return null;
    if (k === 'G1') return true;
    if (k === 'G2') return Number(v);
    if (k === 'G4' || k === 'G5') return v.split(',');
    return v;
  }

  function stopDemo() {
    if (!app.demo) return;
    clearTimeout(app.demo.timer);
    app.demo = null;
    addLog('■ デモを止めた', 'system');
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
    else if (tool.indexOf('obj:') === 0) {
      var here = R.unitAt(st, x, y);
      res = here && here.side === 'object' && here.kind === tool.slice(4) ? R.editRemoveUnit(st, x, y) : R.editPlaceObject(st, tool.slice(4), x, y);
    }
    else if (tool.indexOf('mark:') === 0) res = R.editToggleCell(st, tool.slice(5), x, y);
    else if (tool === 'treasure') res = R.editPlaceTreasure(st, x, y);
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
    renderMission();
    renderStatus();
    renderBoard(!!animate);
    renderSide();
    renderPreview();
    renderHint();
    renderLog();
    if (app.onRender) app.onRender();   // 試作ラボの上のバー（lab_ui.js）
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
    renderExBar();
    // 展示ステージ③: ミッション（最初から出す。達成したら ✔）
    var exm = ((exOf() || {}).missions || []).map(function (m) {
      var done = !!(app.state.exDone && app.state.exDone[m.id]);
      return '<span class="m-ex-mission' + (done ? ' done' : '') + '">' +
        '<b>' + esc(ui('exMission', 'ミッション')) + '</b> ' + esc(exMissionName(m.id)) + ' <span class="m-check">' + (done ? '✔ ' + esc(ui('exMissionDone', 'ミッション達成！')) : '□') + '</span></span>';
    }).join('');
    var html = (stx && stx.goal ? '<span class="m-goal-text"><b>' + esc(ui('goal', '目標')) + '</b> ' + esc(stx.goal) + '</span>' : '') + exm +
      '<span class="m-name m-' + info.type + '">お題: ' + esc(info.name) + '</span>' +
      '<span class="m-rule x-more"><b>勝ち</b> ' + esc(info.win) + '</span>' +   // 勝ち方・負け方は「くわしく」で
      '<span class="m-rule x-more"><b>負け</b> ' + esc(info.lose) + '</span>' +
      '<span class="m-status">' + info.status.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</span>';
    if (html === missionSig) return;
    missionSig = html;
    el.missionBar.innerHTML = html;
  }

  // 展示ステージ③: 魔法の出し方の切り替え（押すとステージの頭からやり直す）
  var exBarSig = '';
  function renderExBar() {
    var ex = exOf(), on = !!(ex && ex.fireModes) && !app.editMode;
    var sig = on ? [app.exFire, app.busy, app.textsVer].join('|') : '';
    if (sig === exBarSig) return;
    exBarSig = sig;
    el.exBar.hidden = !on;
    if (!on) { el.exBar.innerHTML = ''; return; }
    el.exBar.innerHTML = '<span class="ex-bar-label">' + esc(ui('exFire', '魔法の出し方')) + '</span>' + EX_FIRE.map(function (m) {
      return '<button type="button" data-exfire="' + m[0] + '" class="' + (app.exFire === m[0] ? 'active' : '') + '" aria-pressed="' + (app.exFire === m[0]) + '">' + esc(ui(m[1], m[2])) + '</button>';
    }).join('') + '<span class="ex-bar-note x-more">' + esc(ui('exFireNote', '切り替えると頭からやり直す')) + '</span>';
  }
  function setExFire(m) {
    if (!EX_FIRE.some(function (x) { return x[0] === m; }) || m === app.exFire) return;
    try { window.localStorage.setItem(EX_FIRE_KEY, m); } catch (e) { /* 覚えられなくても遊べる */ }
    var label = EX_FIRE.filter(function (x) { return x[0] === m; })[0];
    addLog('魔法の出し方: ' + ui(label[1], label[2]) + '（ステージの頭からやり直した）', 'system');
    app.restart();
  }

  function renderStatus() {
    var st = app.state;
    el.turnLabel.textContent = 'ターン ' + st.turn;
    var mode = app.editMode ? 'エディット中' : app.demo ? 'デモ再生中' : app.busy ? '処理中…' : st.result === 'win' ? '勝利' : st.result === 'lose' ? '敗北' : 'プレイ中';
    el.modeLabel.textContent = mode;
    el.modeLabel.className = 'pill mode' + (app.editMode ? ' edit' : app.busy ? ' busy' : '');
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
    if (el.turnModeSelect && el.turnModeSelect.value !== B.turnMode) el.turnModeSelect.value = B.turnMode;
    // 展示ステージ③の中では、ターンの形はステージの「魔法の出し方」で切り替える
    var exFireOn = !!(exOf() && exOf().fireModes);
    if (el.turnModeSelect) { el.turnModeSelect.disabled = exFireOn; el.turnModeSelect.title = exFireOn ? 'このステージでは、盤面の上の「魔法の出し方」で切り替える' : ''; }
    el.btnUndo.disabled = app.history.length === 0;
    el.btnEdit.classList.toggle('active', app.editMode);
    el.btnEdit.innerHTML = (app.editMode ? 'エディット終了' : 'エディット') + ' <kbd>E</kbd>';
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
    if (el.scenarioSelect.value !== app.scenario) el.scenarioSelect.value = app.scenario;
  }

  // always: 「予告を表示」を切っていても計算する（馬車の道筋は常に出すため）
  function forecastNow(always) {
    if ((!app.showForecast && !always) || app.editMode || app.busy) return null;
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
  var AIM_MARK = { count: '人', near: '近', nature: '自', target: '的', forest: '森', own: '己', flee: '逃', moved: '動' };   // 森・己・逃・動 はラボ D1 の欲
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
    if (R.LX && R.LX.barrier(st, u)) cls.push('barrier');   // ラボ A12: 自分の自然の上でバリア
    var facing = view.facing || u.facing;
    var form = R.LX && R.LX.formName(u);   // ラボ L: 覚醒した魔法は名前と駒の印が変わる
    if (form) cls.push('awake');
    var fo = form && R.LX.L ? R.LX.L.formOf(u) : null;   // 覚醒先の印（1文字）を駒に大きく、名前を小さく
    if (fo && fo.stage === 2) cls.push('awake2');   // ラボ M: 2段目の覚醒はもっと光る
    var name = u.side === 'ally' ? (fo ? '<b class="u-mark">' + esc(fo.mark) + '</b>' + (fo.mark !== form ? '<small class="u-form">' + esc(form) + '</small>' : '') : esc(R.magicName(u.magic)))
      : (u.labWizard ? '人<small>' + esc(u.letter) + '</small><small class="u-form">魔法使い</small>' : '敵<small>' + esc(u.letter) + '</small>') + (form ? '<small class="u-form">' + esc((fo ? fo.mark + ' ' : '') + form) + '</small>' : '');   // ラボ L7: 魔法使い（人）
    if (u.labWizard) cls.push('wizard');
    if (R.LX && R.LX.L && R.LX.L.darkOf && R.LX.L.darkOf(u) > 0) cls.push('darkpow');   // ラボ L7: 闇の力を持っている
    // ラボ: 大きい敵（D3）・体（D6・D7）・欲（D1）・めちゃ強い敵（D5）の見た目
    if (u.size > 1) cls.push('big');
    if (u.body) cls.push('body-' + u.body);
    if (u.side === 'enemy' && AIM_MARK[u.aim] && R.LX && R.LX.DESIRE[u.aim] && R.lab('D1')) cls.push('desire-' + u.aim);
    if (u.labBoss || u.exBoss) cls.push('boss');
    if (u.side === 'enemy' && u.stand === 'boss') name = 'ボス';            // 展示ステージ③
    if (u.side === 'enemy' && u.stand === 'float') name = '取り巻き<small>' + esc(u.letter) + '</small>';
    var h = '<div class="' + cls.join(' ') + '" data-id="' + u.id + '" style="--rot:' + DIR_ROT[facing] + 'deg' + (u.size > 1 ? ';--sz:' + u.size : '') + '">' +
      '<span class="facing"></span><span class="u-name">' + name + '</span><span class="u-hp">HP' + u.hp + '</span>';
    if (u.side === 'enemy') {
      if (u.stand !== 'rush') h += '<span class="u-magic">' + esc(R.magicName(u.magic)) + '</span>';   // 突進の敵は魔法を撃たない
      h += '<span class="u-persona" title="' + esc(personaText(u)) + '">' + esc(personaMark(u)) + '</span>';
    }
    if (R.hidden(st, u)) h += '<span class="u-hide">隠</span>';
    if (u.side === 'enemy' && u.labReason && u.intent !== undefined && (R.lab('D1') || R.lab('D9'))) h += '<span class="u-why">' + esc(u.labReason) + '</span>';   // ラボ D1: 予告に理由を一言
    if (u.labBoss) h += '<span class="u-boss">強</span>';
    var bt = R.LX && R.LX.boostText(u);   // ラボ G: 強化の印（★と種類の1文字）
    if (bt) h += '<span class="u-boost" title="強化: ' + esc(bt) + '">★' + esc(u.boosts.filter(function (b) { return R.lab(b.k) || !B.lab[b.k]; }).map(function (b) { var bi = R.LX.BOOST_INFO[b.k]; return bi ? bi.mark : ''; }).join('')) + '</span>';
    var ord = u.side === 'enemy' && u.intent && R.LX ? R.LX.intentOrder(st, u.id) : 0;   // ラボ F4: 発動の順番
    if (ord) h += '<span class="u-order" title="味方が1人動くごとに、この順で発動する">' + '①②③④⑤'.charAt(ord - 1) + '</span>';
    if (u.labStance && R.lab('F5')) h += '<span class="u-order ally" title="構えている（ターンの終わりに、この順で発動）">構' + u.labStance.n + '</span>';
    if (u.labWear && R.lab('G7')) h += '<span class="u-wear" title="まとっている（次の1発に乗る。ターンの終わりまで）">纏' + esc(R.magicName(u.labWear)) + '</span>';
    if (u.labStage) h += '<span class="u-boss stage" title="大技を組む敵: ' + esc(R.magicName(u.labStage)) + 'で舞台 → ' + esc(R.magicName(u.magic)) + '">技</span>';
    if (st.mission && st.mission.carrier === u.id) h += '<span class="u-treasure" title="宝を持っている（撃てない）">宝</span>';
    if (st.labChase && st.labChase.runner === u.id && R.lab('H6')) h += '<span class="u-treasure" title="宝を持って逃げる敵（逃げ口に着かれたら負け）">宝</span>';   // ラボ H6
    if (u.side === 'ally' && app.labUnitExtra) h += app.labUnitExtra(u, st);   // ラボ N6: 駒の下に道のマス（lab_target_ui.js）
    if (u.burn > 0) h += '<span class="u-burn" title="火傷: ターン終了ごとに' + B.fire.burnDamage + '（水か氷で治る）">火傷' + u.burn + '</span>';
    if (view.warn) h += '<span class="u-warn">予告 -' + view.warn + '</span>';
    if (view.dmg) h += '<span class="u-dmg">-' + view.dmg.amount + (view.dmg.dies ? ' 倒れる' : '') + '</span>';
    if (view.order) h += '<span class="u-order" title="' + view.order + '番目に発動">' + (ORDER_MARK[view.order] || view.order) + '</span>';   // 【一斉】構えの順番
    return h + '</div>';
  }

  function renderBoard(animate) {
    var st = app.state;
    document.body.classList.toggle('lab-tidy', R.lab('J7') && !app.tidyOff);   // ラボ J7: すっきり表示
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
    var reach = u ? R.reachableCells(st, u.id) : {};
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
    var shape = {}, range = {}, strong = {}, change = {}, dmg = {}, growPv = {}, growNo = {}, finArrow = {};
    var arrowsOn = R.lab('C3');   // ラボ C3: 決め手が広がる向きの矢印
    var charge = {}, j5glow = {};
    if (pv && R.lab('J2') && R.LX) pv.finishers.forEach(function (f) {   // ラボ J2: 決め手の「ため」
      var w = R.LX.waveFrom(f.cells, f.origin || f.cells[0]);
      f.cells.forEach(function (c, i) { var k2 = key(c[0], c[1]); if (charge[k2] === undefined || w[i] < charge[k2]) charge[k2] = w[i]; });
    });
    if (u && R.lab('J5')) hintsNow().forEach(function (h) { if (h.magic === u.magic) h.cells.forEach(function (c) { j5glow[key(c[0], c[1])] = true; }); });   // ラボ J5
    if (pv && !so) pv.cells.forEach(function (c) { shape[key(c[0], c[1])] = true; });
    // 【一斉】予測の結果（変わるマス・決め手の範囲・ダメージ）は、構え全部の予告（下の fa）として出す
    if (pv && !simul() && !so) {
      pv.finishers.forEach(function (f) {
        f.cells.forEach(function (c) { range[key(c[0], c[1])] = true; });
        (f.strong || []).forEach(function (c) { strong[key(c[0], c[1])] = true; });
        if (arrowsOn && f.dir && f.origin) finArrow[key(f.origin[0], f.origin[1])] = f.dir;
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
    var fcGrowK = {};
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
          if (arrowsOn && f.dir && f.origin && !finArrow[key(f.origin[0], f.origin[1])]) finArrow[key(f.origin[0], f.origin[1])] = f.dir;
        });
      });
      // 「進む」敵: 次のターン終了で進むマスに、点線の丸と向き
      (fc.marches || []).forEach(function (m) {
        var me = R.findUnit(st, m.id);
        if (me) fcGhost[key(m.to[0], m.to[1])] = { letter: me.letter, dir: m.dir };
      });
      fc.fireSpread.forEach(function (c) { fcSpread[key(c[0], c[1])] = true; });
      if (fc.labGrow) { fc.labGrow.grow.forEach(function (c) { fcGrowK[key(c[0], c[1])] = 'grow'; }); fc.labGrow.revive.forEach(function (c) { fcGrowK[key(c[0], c[1])] = 'revive'; }); }   // ラボ K2
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
    // ラボ D2: 敵が次のターンに向かう先（敵ごとに色の違う点線と、着く先の丸）。D4: 崩すマスに「崩」
    var dLine = {}, dStop = {}, dCrush = {};
    var fcl = (app.editMode || app.busy) ? null : forecastNow(true);
    if (fcl && fcl.labPaths && R.lab('D2')) fcl.labPaths.forEach(function (lp, li) {
      var le = R.findUnit(st, lp.id);
      if (!le) return;
      var seq = [lp.from].concat(lp.path);
      var stepDir = function (a, b) { return b[0] > a[0] ? 'right' : b[0] < a[0] ? 'left' : b[1] > a[1] ? 'down' : 'up'; };
      var OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
      if (seq.length > 1) seq.forEach(function (c, i) {
        var arms = dLine[key(c[0], c[1])] = dLine[key(c[0], c[1])] || { color: li % 4, arms: [] };
        if (i > 0) arms.arms.push(OPP[stepDir(seq[i - 1], c)]);
        if (i < seq.length - 1) arms.arms.push(stepDir(c, seq[i + 1]));
      });
      if (seq.length > 1) dStop[key(lp.to[0], lp.to[1])] = { letter: le.letter, color: li % 4, why: lp.reason };
    });
    if (fcl && fcl.labPaths && R.lab('D4')) fcl.labPaths.forEach(function (lp) { (lp.crush || []).forEach(function (c) { dCrush[key(c[0], c[1])] = true; }); });
    // ラボ E2: 映る場所の印と偽の姿（予測中は撃ったあとの盤面）。E10: 予告の形の中に「何があると何が起きるか」の一言
    var eMirror = {}, eDecoy = {}, eHint = {};
    if (!app.editMode && R.LX) {
      var stE = pv ? pv.state : st;
      if (R.lab('E2')) {
        R.LX.mirrors(stE).forEach(function (c) { eMirror[key(c[0], c[1])] = true; });
        R.LX.decoys(stE).forEach(function (d) { eDecoy[key(d.x, d.y)] = d; });
      }
      if (R.lab('E10') && fc) R.LX.intentHints(stE, pv ? st : null, fc).forEach(function (h) { eHint[key(h.cell[0], h.cell[1])] = h; });
    }
    // ラボ H13: 小さな目標の印。H9: 拠点の旗。H6: 逃げ口
    var hGoal = {}, hFlag = {}, hExit = {}, fWind = {}, fBench = {}, lTarget = {}, mTrap = {};
    if (!app.editMode && R.LX && (R.lab('F2') || R.lab('F3')) && st.labWind) Object.keys(st.labWind).forEach(function (i) { var t = R.getTile(st, i % n, Math.floor(i / n)); if (t === 'breeze' || t === 'gale') fWind[key(i % n, Math.floor(i / n))] = st.labWind[i]; });
    if (!app.editMode && R.lab('F7') && st.labBench) st.labBench.cells.forEach(function (c) { fBench[key(c[0], c[1])] = st.labBench; });
    if (!app.editMode && R.LX) {
      if (R.lab('H13') && st.labGoals) st.labGoals.forEach(function (g) { g.cells.forEach(function (c) { hGoal[key(c[0], c[1])] = g; }); });
      if (R.lab('L0') && st.labTargets) st.labTargets.forEach(function (t) { ((t.check && t.check.cells) || []).forEach(function (c) { lTarget[key(c[0], c[1])] = t; }); });   // ラボ L: ステージだけの目標のマス
      if (R.lab('H9') && st.labFlags) st.labFlags.forEach(function (f) { var tk = R.LX.flagTaken(st, f); f.cells.forEach(function (c) { hFlag[key(c[0], c[1])] = { f: f, taken: tk }; }); });
      if (R.lab('H6') && st.labChase) st.labChase.exits.forEach(function (c) { hExit[key(c[0], c[1])] = true; });
      if (R.lab('M5') && st.labTraps) st.labTraps.forEach(function (tr) { tr.cells.forEach(function (c) { mTrap[key(c[0], c[1])] = tr; }); });   // ラボ M5: 置いておいた魔法
    }
    // チュートリアル②: 山の頂上と腕（どこが高いか）
    var slopes = st.slopes || {};

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
    var BIGU = BIG;
    if (R.lab('J1')) { BIGU = {}; Object.keys(BIG).forEach(function (t) { BIGU[t] = BIG[t]; }); Object.keys(J1_BIG).forEach(function (t) { BIGU[t] = J1_BIG[t]; }); }   // ラボ J1
    if (B.fx.bigPicture || R.lab('J1')) {
      for (var by = 0; by < rows; by++) {
        for (var bx = 0; bx < n; bx++) {
          var bt = R.getTile(st, bx, by);
          if (!BIGU[bt] || bigComp[key(bx, by)]) continue;
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
        if (j5glow[k]) cls.push('j5-glow');
        var isGoal = R.inCells(mi.goal, x, y), isExit = R.inCells(mi.exit, x, y);
        if (isGoal) cls.push('m-goal');
        if (isExit) cls.push('m-exit');
        var unit = unitByCell[k];
        if (app.editMode && app.editPick && unit && unit.id === app.editPick) cls.push('picked');

        var awk = R.LX && R.LX.awkTile ? R.LX.awkTile(st, x, y) : null;   // ラボ N: 覚醒先の自然（大樹・岩山・業火・湖・氷・竜巻）は、元の自然のマスに金の縁と印
        if (awk) cls.push('nawk', 'nawk-' + awk.kind);
        var inner = '<span class="tile-label">' + esc(awk ? awk.label : R.TILE_INFO[tile].label) + '</span>' +
          (awk ? '<span class="b-nawk" title="' + esc(awk.name + '（' + R.TILE_INFO[tile].name + 'として振る舞う。覚醒先の新しい組み合わせを持つ）') + '">' + esc(awk.label) + '</span>' : '');
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
          inner += '<span class="bigland ' + BIGU[tile].cls + ' ' + bj.join(' ') + '"></span>';
        }
        if (bigAt[k]) {
          var ba = bigAt[k];
          inner += '<span class="bigmark ' + BIGU[ba.tile].cls + '" style="--ps:' + ba.size.toFixed(2) + ';--pdx:' + ba.dx.toFixed(2) + ';--pdy:' + ba.dy.toFixed(2) + '" title="' + esc(BIGU[ba.tile].name) + '">' + BIGU[ba.tile].mark + '</span>';
        }
        // お題の印
        if (isGoal) inner += '<span class="m-mark goal">ゴール</span>';
        if (isExit) inner += '<span class="m-mark exit">帰り口</span>';
        if (mi.treasure && mi.treasure[0] === x && mi.treasure[1] === y) inner += '<span class="m-treasure' + (unit ? ' under' : '') + '" title="宝（このマスで移動を終えると持つ）">宝</span>';
        if (wLine[k]) inner += wLine[k].map(function (d) { return '<span class="wline ' + d + '"></span>'; }).join('') + '<span class="wline dot"></span>';
        if (eLine[k]) inner += eLine[k].map(function (d) { return '<span class="wline e ' + d + '"></span>'; }).join('') + '<span class="wline e dot"></span>';
        if (eStop[k] && !unit) inner += '<div class="ghost rush">' + esc(eStop[k].letter) + DIR_ARROW[eStop[k].dir] + '</div>';
        if (dLine[k]) inner += dLine[k].arms.map(function (d) { return '<span class="wline d d' + dLine[k].color + ' ' + d + '"></span>'; }).join('') + '<span class="wline d d' + dLine[k].color + ' dot"></span>';
        if (dStop[k] && !unit) inner += '<div class="ghost dest d' + dStop[k].color + '" title="' + esc(dStop[k].why || '次のターンに向かう先') + '">' + esc(dStop[k].letter) + '</div>';
        if (dCrush[k]) inner += '<span class="b-crush" title="大きい敵が次に崩すマス（ラボ D4）">崩</span>';
        if (eMirror[k]) inner += '<span class="b-mirror" title="映る場所（ラボ E2）: 蜃気楼の中に味方がいると、ここに偽の姿が立つ">映</span>';
        if (eDecoy[k] && !unit) inner += '<div class="ghost decoy" title="偽の姿（ラボ E2）: 敵には本物に見える。当たっても何も起きない">' + esc(R.magicName(eDecoy[k].magic)) + '</div>';
        if (fWind[k]) inner += '<span class="b-wind" title="風の向き（追い風・向かい風）">' + DIR_ARROW[fWind[k]] + '</span>';
        if (fBench[k]) inner += '<span class="b-bench" title="作業台（積まれた材料: ' + esc(fBench[k].mats.map(function (m) { return R.magicName(m.magic); }).join('→') || 'なし') + '）"></span>';
        if (lTarget[k]) inner += '<span class="b-ltarget d-' + lTarget[k].dir + (lTarget[k].got ? ' got' : '') + '" title="ターゲット: ' + esc(lTarget[k].name) + (lTarget[k].got ? '（取った）' : '') + '">' + esc((R.LX.L.dirTable()[lTarget[k].dir] || {}).mark || '的') + '</span>';   // ラボ L（M のときは3つの方向の印）
        if (mTrap[k]) inner += '<span class="b-mtrap" title="置いておいた' + esc(R.magicName(mTrap[k].magic)) + 'の魔法（人が入ると発動）">置</span>';   // ラボ M5
        if (hGoal[k]) inner += '<span class="b-goal' + (hGoal[k].done ? ' done' : '') + '" title="目標: ' + esc(hGoal[k].name) + (hGoal[k].done ? '（達成）' : '') + '">目</span>';
        if (hFlag[k]) inner += '<span class="b-flag' + (hFlag[k].taken ? ' taken' : '') + '" title="' + esc(hFlag[k].f.name) + (hFlag[k].taken ? '（取った拠点: 上に立つと形が1マス先から）' : '（全部のマスを別の自然にすると取れる）') + '">' + (hFlag[k].taken ? '拠' : '旗') + '</span>';
        if (hExit[k]) inner += '<span class="b-exit" title="逃げ口（宝を持った敵が着いたら負け）">逃</span>';
        if (eHint[k]) inner += '<span class="b-hint ' + eHint[k].level + '" title="' + esc(eHint[k].title) + '">' + esc(eHint[k].text) + '</span>';
        if (wNext && wNext.k === k) inner += '<span class="wnext' + (wNext.stuck ? ' stuck' : '') + '" title="次のターン終了で馬車が進むマス">' + DIR_ARROW[wNext.dir] + '</span>';
        if (guide[k] && reach[k] !== undefined) {
          inner += guide[k] === 'finisher' ? '<span class="b-guide finisher">◆</span>' : '<span class="b-guide change" title="変化が起きる"></span>';
        }
        if (finArrow[k]) inner += '<span class="fin-arrow" title="決め手が広がる向き（ラボ C3）">' + DIR_ARROW[finArrow[k]] + '</span>';
        if (charge[k] !== undefined) inner += '<span class="b-charge" style="--cd:' + (charge[k] * 110) + 'ms"></span>';
        if (growPv[k]) inner += '<span class="g-ghost ' + growPv[k] + '" title="育ったあとの形（' + esc(SHORT[growPv[k]]) + '）"></span>';
        if (growNo[k]) inner += '<span class="b-nogrow" title="育たない（ユニットがいる・ほかの自然がある）">×</span>';
        if (change[k]) inner += '<span class="b-change">→' + esc(SHORT[change[k]]) + '</span>';
        else if (faChange[k]) inner += '<span class="b-change ally">→' + esc(SHORT[faChange[k]]) + '</span>';
        else if (fcChange[k]) inner += '<span class="b-change enemy">→' + esc(SHORT[fcChange[k]]) + '</span>';
        var badges = '';
        if (fcSpread[k]) badges += '<span class="spread">燃</span>';
        if (fcOut[k]) badges += '<span class="burnout" title="次のターン終了で燃え尽きる">尽</span>';
        if (fcGrowK[k]) badges += fcGrowK[k] === 'grow' ? '<span class="growk" title="次のターン終了で育つ（ラボ K2）">育</span>' : '<span class="growk" title="次のターン終了で灰からよみがえる（ラボ K2）">よ</span>';
        if (faShot[k] && simul()) badges += faShot[k].map(function (f) {
          return '<span class="ally stance' + (f.npc ? ' npc' : '') + '" title="' + esc(f.n + '番目に発動: ' + R.magicName(f.magic)) + '">' + (ORDER_MARK[f.n] || f.n) + esc(R.magicName(f.magic)) + '</span>';
        }).join('');
        else if (faShot[k]) badges += '<span class="ally" title="構える味方が狙っているマス">' + DIR_ARROW[faShot[k]] + '</span>';
        if (fcShot[k]) badges += '<span class="enemy">' + esc(fcShot[k].join('')) + '</span>';
        if (badges) inner += '<span class="b-fc">' + badges + '</span>';
        if (fcGhost[k] && !unit) inner += '<div class="ghost">' + esc(fcGhost[k].letter) + DIR_ARROW[fcGhost[k].dir] + '</div>';
        if (planGhost === k && !unit) inner += '<div class="ghost ally"></div>';
        if (soCell[k]) {   // 展示ステージ③: 魔法の形の輪郭（外側の辺だけ）と、術者に一番近いマスに「①火→」
          var sc = soCell[k];
          inner += '<span class="so-line so-' + sc.magic + ' ' + sc.edges.join(' ') + (sc.planned ? ' planned' : '') + '"></span>';
          if (sc.first) inner += '<span class="so-tag so-' + sc.magic + (sc.planned ? ' planned' : '') + '">' + (sc.n ? (ORDER_MARK[sc.n] || sc.n) : '') + esc(R.magicName(sc.magic)) + DIR_ARROW[sc.dir] + '</span>';
        }
        if (nextAt[k] && !(R.lab('J5') && B.lab.J5.quiet)) {   // ラボ J5 quiet: 札を出さない
          var nx = nextAt[k], ready = nx.h.shooters.length > 0;
          inner += '<span class="b-next' + (ready ? ' ready' : '') + '" style="--ndx:' + nx.dx.toFixed(2) + ';--ndy:' + nx.dy.toFixed(2) + '">' +
            '<b>あと一手' + (ready ? '！' : '') + '</b><span class="m">' + esc(R.magicName(nx.h.magic)) + '</span>→ ' + esc(nx.h.name) + '</span>';
        }
        if (unit) {
          inner += unitHtml(unit, st, {
            selected: u && unit.id === u.id,
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
    var sig = JSON.stringify([app.editMode, app.busy, app.sel, app.plan, app.editTool, st.units, st.enemyActs, st.size, st.result, st.mission, st.overrides, fc ? fc.enemies : null, fcAll ? fcAll.allies : null, fcAll ? fcAll.rushes : null, hintsNow(), storeVersion, B.turnMode, app.textsVer]);
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
    var nextFor = {};
    hintsNow().forEach(function (h) { h.shooters.forEach(function (sh) { nextFor[sh.id] = h; }); });
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
      if (a.labAfter) status[0] = a.labAfter.shoot ? 'もう1回撃てる（動けない）' : '撃ったあと: ' + a.labAfter.move + 'マス動ける（動いて「待機」）';   // ラボ M: 2回撃てる・疾風
      if (a.labGuard) status.push('守られている: 相手の攻撃を' + a.labGuard + '回防ぐ');   // ラボ M: 城壁
      if (a.labBoost) status.push('追い風: 次の魔法が' + a.labBoost + 'マス大きい');      // ラボ M: 追い風
      if (a.stuck) status.push('泥沼: 次は移動できない');
      if (a.burn > 0) status.push('火傷: あと' + a.burn + '回（水か氷で治る）');
      if (st.mission && st.mission.carrier === a.id) status.push('宝を持っている（撃てない）');
      if (R.LX && R.LX.boostText(a)) status.push('強化: ' + R.LX.boostText(a));   // ラボ G
      if (a.labWear && R.lab('G7')) status.push('まとっている: ' + R.magicName(a.labWear));
      // いつもの状態（行動前・まだ構えていない）と道の印は「くわしく」で（道は盤面の駒の下・ターゲットにも出ている）
      var quiet = status[0] === '行動前' || status[0] === 'まだ構えていない' ? [status.shift()] : [];
      if (a.labPath && R.lab('L0') && R.LX.L.pathDef(a.magic)) quiet.push('道 ' + R.LX.L.pathMarks(a.magic, a.labPath));   // ラボ L
      var cls = 'ally-card' + (a.id === app.sel ? ' selected' : '') + (a.acted ? ' acted' : '') + (a.stance ? ' stanced' : '');
      return '<button type="button" class="' + cls + '" data-id="' + a.id + '">' +
        '<span class="dot">' + esc((R.LX && R.LX.formName(a)) || R.magicName(a.magic)) + '</span>' +
        '<span class="info"><b>' + (i + 1) + '. ' + esc(R.unitLabel(st, a)) + '　HP ' + a.hp + '/' + a.maxHp + '　' + DIR_ARROW[a.facing] + '</b>' +
        (a.runTag ? '<span class="run-tag">' + esc(a.runTag) + '</span>' : '') +   // 進行モック: 強化
        '<span class="sub">' + esc(status.join('・')) + (quiet.length ? '<span class="x-more">' + (status.length ? '・' : '') + esc(quiet.join('・')) + '</span>' : '') +
        (nextFor[a.id] ? '<br class="x-more"><span class="next x-more">あと一手: ' + esc(R.magicName(nextFor[a.id].magic)) + 'を当てれば' + esc(nextFor[a.id].name) + '</span>' : '') +
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
      var note = (e.stuck ? '（泥沼: 次は移動できない）' : '') + (e.burn > 0 ? '（火傷: あと' + e.burn + '回）' : '') +
        (R.LX && R.LX.boostText(e) ? '（強化: ' + R.LX.boostText(e) + '）' : '') + (e.labWear && R.lab('G7') ? '（まとっている: ' + R.magicName(e.labWear) + '）' : '');   // ラボ G
      return '<div class="enemy-row"><span class="dot">' + esc(e.letter) + '</span><span>' + esc(e.name) + (e.stand === 'rush' ? ' ' : '（' + esc(R.magicName(e.magic)) + '）') + 'HP ' + e.hp + '/' + e.maxHp +
        (warn[e.id] ? ' <span class="danger">予告で -' + warn[e.id] + (warn[e.id] >= e.hp ? '（倒れる）' : '') + '</span>' : '') +
        '<span class="hpbar"><span style="width:' + Math.max(0, e.hp / e.maxHp * 100) + '%"></span></span> ' + DIR_ARROW[e.facing] + esc(note) + '</span>' +
        '<span class="persona x-more">' + esc(personaText(e)) + '</span>' +   // 敵の性格は「くわしく」で
        (rushTo[e.id] ? '<span class="plan">次のターンの始めに: ' + esc(rushText(rushTo[e.id])) + '</span>' : '') +
        (marchTo[e.id] ? '<span class="plan">ターンの終わりに ' + DIR_ARROW[marchTo[e.id].dir] + ' へ1マス進む' + (plans[e.id] ? '。そのまま撃つ' : '') + '</span>' : '') +
        (plans[e.id] ? '<span class="plan">' + esc(planText(plans[e.id], st)) + '</span>' : '') + '</div>';
    }).join('');
    html += '<p class="note' + (st.enemyActs ? ' x-more' : '') + '">敵は' + (st.enemyActs ? '行動する' : '何もしない') + '設定（エディットで切り替え）</p>';   // いつもと違う（何もしない）ときだけ出したまま
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
    el.orderPanel.classList.toggle('x-more', !rows);   // まだ誰も構えていないときは、欄ごと「くわしく」で
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
    var m2 = u && R.lab('G9') && R.LX ? R.LX.boostOf(u, 'G9') : null;   // ラボ G9: 持ち替えのボタン
    el.btnSwap.hidden = !m2;
    if (m2) el.btnSwap.innerHTML = '持ち替え: ' + esc(R.magicName(u.magic)) + ' ⇄ ' + esc(R.magicName(m2)) + ' <kbd>Q</kbd>';
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
    var mtype = (st.mission && st.mission.type) || 'annihilate';
    el.missionSelect.innerHTML = R.MISSIONS.map(function (m) {
      return '<option value="' + m + '"' + (m === mtype ? ' selected' : '') + '>' + esc(R.MISSION_INFO[m].name) + '</option>';
    }).join('');
    var mtools = [['obj:village', '村を置く'], ['obj:wagon', '馬車を置く'], ['mark:goal', 'ゴール'], ['treasure', '宝を置く'], ['mark:exit', '帰り口']];
    el.missionTools.innerHTML = mtools.map(function (t) {
      return '<button type="button" class="' + (app.editTool === t[0] ? 'active' : '') + '" data-tool="' + t[0] + '">' + t[1] + '</button>';
    }).join('');
    el.unitList.innerHTML = st.units.length ? st.units.map(function (u) {
      if (u.side === 'object') return '<div class="u-row"><b>' + esc(R.unitLabel(st, u)) + '</b><span class="muted">(' + u.x + ',' + u.y + ') HP' + u.maxHp + '</span></div>';
      return '<div class="u-row"><b>' + esc(R.unitLabel(st, u)) + '</b>' +
        '<select data-id="' + u.id + '" data-field="magic" aria-label="魔法">' + (u.side === 'ally' ? R.allyMagics(st) : R.MAGICS).map(function (m) {
          return '<option value="' + m + '"' + (u.magic === m ? ' selected' : '') + '>' + R.magicName(m) + '</option>';
        }).join('') + '</select>' +
        '<select data-id="' + u.id + '" data-field="facing" aria-label="向き">' + R.DIR_ORDER.map(function (d) {
          return '<option value="' + d + '"' + (u.facing === d ? ' selected' : '') + '>' + DIR_ARROW[d] + ' ' + R.DIRS[d].name + '</option>';
        }).join('') + '</select>' +
        '<span class="muted">(' + u.x + ',' + u.y + ')</span>' +
        boostEditHtml(u) +
        (u.side === 'ally' ? '<span class="persona-edit"><label>指示 <select data-id="' + u.id + '" data-field="npc">' +
          '<option value=""' + (u.npc ? '' : ' selected') + '>プレイヤーが動かす</option>' +
          '<option value="1"' + (u.npc ? ' selected' : '') + '>構える味方（毎ターン今の向きで構えて撃つ）</option></select></label></span>' : '') +
        (u.side === 'enemy' ? '<span class="persona-edit">' + Object.keys(R.PERSONA).map(function (f) {
          var label = { aim: '狙い', avoid: '避ける', cross: '越える', stand: '動き' }[f] || f;
          return '<label>' + label + ' <select data-id="' + u.id + '" data-field="' + f + '">' + Object.keys(R.PERSONA[f]).map(function (v) {
            return '<option value="' + v + '"' + (u[f] === v ? ' selected' : '') + '>' + esc(R.PERSONA[f][v]) + '</option>';
          }).join('') + '</select></label>';
        }).join('') + '</span>' : '') + '</div>';
    }).join('') : '<p class="muted">ユニットがいません</p>';
    if (st.overrides) {
      el.unitList.innerHTML += '<p class="note">このシナリオだけの数値（JSON の overrides）: ' +
        esc(Object.keys(st.overrides).map(function (p) { return setLabel(p, st.overrides[p]); }).join('・')) + '</p>';
    }
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
    h.title = '';
    if (app.message && app.message.until > Date.now()) {
      h.textContent = app.message.text;
      h.classList.add('warn');
      return;
    }
    if (app.demo) { h.textContent = '▶ デモ再生中: ' + app.demo.name + '（盤面のクリックかキーで止める）'; h.classList.add('busy'); return; }
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
      if (tool.indexOf('tile:') === 0) h.textContent = 'マスをクリック（ドラッグ）で「' + R.TILE_INFO[tool.slice(5)].name + '」を塗る';
      else if (tool === 'move') h.textContent = app.editPick ? '置き先のマスをクリック' : '動かすユニットをクリック';
      else if (tool === 'remove') h.textContent = '消すユニットをクリック';
      else if (tool === 'rotate') h.textContent = 'クリックしたユニットの向きを時計回りに回す';
      else if (tool.indexOf('obj:') === 0) h.textContent = '「' + R.OBJECT_INFO[tool.slice(4)].name + '」を置くマスをクリック（置いてある所をクリックで外す）';
      else if (tool.indexOf('mark:') === 0) h.textContent = '「' + (tool === 'mark:goal' ? 'ゴール' : '帰り口') + '」の印をつけるマスをクリック（もう一度で外す）';
      else if (tool === 'treasure') h.textContent = '宝を置くマスをクリック（1つだけ。置き直すと移る）';
      else h.textContent = (tool === 'ally' ? '味方' : '敵') + 'を置くマスをクリック';
      return;
    }
    var u = selUnit();
    if (!u) {
      if (R.sealReady(st)) { h.textContent = ui('sealReady', '村への道をふさいだ！「クリアする」（C）でクリアできる'); h.classList.add('ready'); return; }   // ステージ②
      // 【一斉】全員構えたら発動へ
      if (simul() && R.controllableOf(st).length && R.allAlliesActed(st)) { h.textContent = ui('readyToFire', '全員構えた。「発動」（T）'); h.classList.add('ready'); return; }
      h.textContent = ui('pickAlly', '味方をクリック（または 1〜3 キー）で選ぶ'); h.classList.add('guide'); return;   // 操作の案内は「くわしく」で
    }
    h.textContent = R.restancing(u) ? ui('guideRestance') : simul() ? ui('guideSimul') : ui('guideSingle');
    h.classList.add('guide');
  }

  function renderPreview() {
    var box = el.preview;
    var u = (!app.editMode && !app.busy) ? selUnit() : null;
    box.classList.remove('idle');   // idle: 出すものが「くわしく」の中だけ（そのときは箱ごと隠す）
    if (u && app.plan && !app.state.result && shapeOnly()) {   // 展示ステージ③: 届く形だけ（何が起きるかは出さない）
      var sp = previewNow(u);
      box.innerHTML = '<div class="pv-head">' + esc(R.unitLabel(app.state, u)) + ': (' + sp.to[0] + ',' + sp.to[1] + ') から ' + DIR_ARROW[sp.dir] + ' に' + esc(R.magicName(u.magic)) + 'を' + (simul() ? '構える' + (sp.order ? '（' + sp.order + '番目に発動）' : '') : '撃つ') + '</div>' +
        '<div class="pv-line note x-more">' + esc(ui('exPreviewNote', '盤面の点線が、魔法の届く形。何が起きるかは、撃ってのお楽しみ')) + '</div>';
      return;
    }
    if (u && app.plan && !app.state.result) {
      var p = previewNow(u);
      var lines = p.events.map(function (e) {
        var cls = e.type === 'finisher' ? 'finisher' : e.type === 'damage' ? 'damage' : e.type === 'death' ? 'death' : (e.type === 'labTarget' || e.type === 'labTargetSoon') ? 'ltarget d-' + e.dir : '';   // ラボ L: ターゲットの行
        var text = e.type === 'cast' && !p.stance ? e.text.replace(/^.*?→ /, '') : (e.combo ? '【' + comboText(e) + '】' : '') + e.text;
        return '<div class="pv-line ' + cls + '">' + esc(text) + '</div>';
      });
      var head = p.waitOnly ? '予測: (' + p.to[0] + ',' + p.to[1] + ') へ移動して待機（宝を持っているので撃てない）'
        : p.stance ? '予測: (' + p.to[0] + ',' + p.to[1] + ') から ' + DIR_ARROW[p.dir] + ' に' + R.magicName(u.magic) + 'を構える（' + p.order + '番目に発動）<span class="x-more">→ 構えた順に全部起きたあと</span>'
        : '予測: (' + p.to[0] + ',' + p.to[1] + ') から ' + DIR_ARROW[p.dir] + ' に' + R.magicName(u.magic) + 'の魔法（' + R.MAGIC_INFO[u.magic].verb + '）';
      // ラボ C5: 「育っていれば: 〇〇」
      var notes = (p.notes || []).map(function (n) { return '<div class="pv-line note">' + esc(n) + '</div>'; });
      if (app.labPreviewNotes) notes = notes.concat(app.labPreviewNotes(u, p));   // ラボ L: 予告の決め手を潰す、の一言
      box.innerHTML = '<div class="pv-head">' + head + '</div>' + lines.join('') + notes.join('');
      return;
    }
    var t = app.hover;
    if (t && R.inBounds(app.state, t.x, t.y)) {
      var tile = R.getTile(app.state, t.x, t.y);
      var o = R.unitAt(app.state, t.x, t.y);
      // カーソルの下: いつも出すのはユニットの名前・HP・魔法・向きだけ。マスの名前と説明は「くわしく」で
      var s = '<div class="pv-head x-more">(' + t.x + ',' + t.y + ') ' + esc(R.tileName(tile)) + '</div><div class="x-more">' + esc(TILE_DESC[tile]) + '</div>';
      if (o && o.side === 'object') s += '<div class="muted">' + esc(R.unitLabel(app.state, o)) + '　HP ' + o.hp + '/' + o.maxHp + '<span class="x-more">　' + esc(OBJECT_DESC[o.kind]) + '</span></div>';
      else if (o) s += '<div class="muted">' + esc(R.unitLabel(app.state, o)) + '　HP ' + o.hp + '/' + o.maxHp + '　魔法: ' + esc(R.magicName(o.magic)) + '　向き ' + DIR_ARROW[o.facing] + '</div>';
      var mm = app.state.mission || {};
      if (R.inCells(mm.goal, t.x, t.y)) s += '<div class="muted x-more">ゴール: 馬車がここに入ったら勝ち。</div>';
      if (R.inCells(mm.exit, t.x, t.y)) s += '<div class="muted x-more">帰り口: 宝を持った味方がここで移動を終えたら勝ち。</div>';
      if (mm.treasure && mm.treasure[0] === t.x && mm.treasure[1] === t.y) s += '<div class="muted x-more">宝: このマスで移動を終えると持つ（持っている間は撃てない）。敵は拾わない。</div>';
      box.innerHTML = s;
      box.classList.toggle('idle', !o);
      return;
    }
    box.innerHTML = '<span class="muted x-more">マスにカーソルを乗せると説明が出ます。味方を選ぶと、撃ったときの予測が出ます。紫の印は敵の予告、橙の「燃」は次のターン終了で燃え移る森です。</span>';
    box.classList.add('idle');
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
    if (app.demo) { stopDemo(); render(); return; }
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

  // デモ中に画面の操作（デモボタン以外）をしたら、デモを止める
  document.addEventListener('click', function (e) {
    if (!app.demo) return;
    var b = e.target.closest && e.target.closest('button, select, input');
    if (b && b.id !== 'btnDemo') { stopDemo(); render(); }
  }, true);

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
  el.btnSwap.addEventListener('click', function () { swapMagic(); });
  el.btnEndTurn.addEventListener('click', doEndTurn);
  el.btnDemo.addEventListener('click', function () {
    var demos = window.DEMOS || [];
    var d = demos.filter(function (x) { return x.id === el.demoSelect.value; })[0] || demos[0];
    if (d) playDemo(d);
  });
  // 【新案】竜巻を外している間は、竜巻のデモ・シナリオは一覧に出さない（コードとテストには残す）
  el.demoSelect.innerHTML = (window.DEMOS || []).filter(function (d) { return !d.recipe; }).map(function (d) { return '<option value="' + d.id + '">' + esc(d.name) + '</option>'; }).join('');
  // 新案プレイ: 試し中の新案があるときだけ出す
  var CHECKS = window.CHECKS || [];
  el.checkPick.hidden = !CHECKS.length;
  el.checkSelect.innerHTML = CHECKS.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('');
  el.btnCheck.addEventListener('click', function () {
    var c = CHECKS.filter(function (x) { return x.id === el.checkSelect.value; })[0] || CHECKS[0];
    if (c) playCheck(c);
  });
  el.btnUndo.addEventListener('click', undo);
  el.btnReset.addEventListener('click', reset);
  el.btnEdit.addEventListener('click', function () { setEditMode(!app.editMode); });
  el.btnEditDone.addEventListener('click', function () { setEditMode(false); });
  el.showForecast.addEventListener('change', function () { app.showForecast = el.showForecast.checked; render(); });

  // くわしく: 説明・補足・ログ（.x-more）を出す／隠す。初期は隠す。選んだ形は覚える（使えなければ毎回、隠すから）
  var MORE_KEY = 'caffilia-show-more';
  var btnMore = $('btnMore');
  function setMore(on) {
    document.body.classList.toggle('show-more', on);
    if (btnMore) { btnMore.classList.toggle('active', on); btnMore.setAttribute('aria-pressed', String(on)); }
    try { window.localStorage.setItem(MORE_KEY, on ? '1' : '0'); } catch (e) { /* 覚えられなくても遊べる */ }
  }
  (function () {
    var saved = null;
    try { saved = window.localStorage.getItem(MORE_KEY); } catch (e) { saved = null; }
    setMore(saved === '1');
  })();
  if (btnMore) btnMore.addEventListener('click', function () { setMore(!document.body.classList.contains('show-more')); btnMore.blur(); });

  // チュートリアル: ボタンを押すと一覧が開く。まだない番号は「準備中」で並べておく（R.TUTORIALS に足せば出る）
  var TUTORIAL_SLOTS = 3;
  var CIRCLED = ['', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];
  function renderTutorialMenu() {
    var html = '';
    for (var n = 1; n <= Math.max(TUTORIAL_SLOTS, R.TUTORIALS.length); n++) {
      var t = R.TUTORIALS.filter(function (x) { return x.tutorial === n; })[0];
      html += t
        ? '<button type="button" role="menuitem" data-id="' + t.id + '"' + (app.scenario === t.id ? ' class="current"' : '') + '>' + esc(stageName(t)) + '</button>'
        : '<button type="button" role="menuitem" disabled>' + CIRCLED[n] + ' 準備中</button>';
    }
    el.tutorialMenu.innerHTML = html;
  }
  function openTutorialMenu(open) {
    if (open) renderTutorialMenu();
    el.tutorialMenu.hidden = !open;
    el.btnTutorial.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  el.btnTutorial.addEventListener('click', function (e) { e.stopPropagation(); openTutorialMenu(el.tutorialMenu.hidden); });
  el.tutorialMenu.addEventListener('click', function (e) {
    var b = e.target.closest('[data-id]');
    if (!b) return;
    openTutorialMenu(false);
    stopDemo();
    if (app.editMode) setEditMode(false);
    loadScenario(b.getAttribute('data-id'));
  });
  document.addEventListener('click', function (e) {
    if (!el.tutorialMenu.hidden && !e.target.closest('.tut-pick')) openTutorialMenu(false);
  });

  // シナリオはお題ごとに分けて並べる（元の戦闘は「戦闘」）
  var presetOpt = function (p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; };
  var tutOpt = function (p) { return '<option value="' + p.id + '">【チュートリアル】' + esc(stageName(p)) + '</option>'; };
  var shown = R.PRESETS.filter(function (p) { return !p.hidden; });
  function buildScenarioSelect() {
  el.scenarioSelect.innerHTML =
    '<optgroup label="チュートリアル">' + R.TUTORIALS.map(tutOpt).join('') + '</optgroup>' +
    '<optgroup label="お題（防衛・護衛・奪取）">' + shown.filter(function (p) { return p.mission; }).map(presetOpt).join('') + '</optgroup>' +
    '<optgroup label="戦闘（敵の全滅）"><option value="">標準（火・水・風 / 敵1体）</option>' +
    shown.filter(function (p) { return !p.mission; }).map(presetOpt).join('') + '</optgroup>' +
    '<optgroup label="縮尺くらべ"><option value="plaza">広場（見本・調整パネルの盤面の大きさ）</option></optgroup>' +
    // 試作ラボ: カテゴリごとに分けて並べる
    (R.LAB.CATS || []).map(function (cat) {
      var list = R.LAB_PRESETS.filter(function (p) { return p.labCat === cat.id && !p.hidden; });
      return list.length ? '<optgroup label="ラボ ' + esc(cat.name) + '">' + list.map(presetOpt).join('') + '</optgroup>' : '';
    }).join('');
  el.scenarioSelect.value = app.scenario;
  }
  buildScenarioSelect();
  el.scenarioSelect.addEventListener('change', function () { loadScenario(el.scenarioSelect.value); el.scenarioSelect.blur(); });
  el.recipeSelect.value = B.tornadoRecipe;
  el.windModeSelect.value = B.windMode;
  el.sakuraSelect.value = B.sakura.from;
  el.sakuraSelect.addEventListener('change', function () { setSakuraFrom(el.sakuraSelect.value); render(); el.sakuraSelect.blur(); });
  el.windModeSelect.addEventListener('change', function () { setWindMode(el.windModeSelect.value); render(); el.windModeSelect.blur(); });
  el.recipeSelect.addEventListener('change', function () { setRecipe(el.recipeSelect.value); render(); el.recipeSelect.blur(); });

  // 【一斉】ターンの形の切り替え（今のシナリオを最初からやり直す）
  function fillTurnMode() {
    if (!el.turnModeSelect) return;
    el.turnModeSelect.innerHTML = '<option value="simul">' + esc(ui('turnModeSimul', '一斉に発動')) + '</option>' +
      '<option value="single">' + esc(ui('turnModeSingle', '1人ずつ')) + '</option>';
    el.turnModeSelect.value = B.turnMode;
    if (el.turnModeLabel) el.turnModeLabel.textContent = ui('turnMode', 'ターンの形');
  }
  function setTurnMode(m) {
    if ((m !== 'simul' && m !== 'single') || m === B.turnMode) return;
    stopDemo();
    if (app.busy) skipPlayback();
    B.turnMode = m;
    try { window.localStorage.setItem(TURN_KEY, m); } catch (e) { /* 覚えられなくても遊べる */ }
    var lp = app.scenario && R.findPreset(app.scenario);
    app.labTurnRestore = null;
    app.labTurnKeep = !!(lp && lp.lab);   // ラボのシナリオの中で選んだ形は、そのまま使う
    app.cache = {};
    sideSig = '';
    addLog('ターンの形: ' + (m === 'simul' ? ui('turnModeSimul', '一斉に発動') : ui('turnModeSingle', '1人ずつ')) + '（最初からやり直した）', 'system');
    renderHowto();
    app.restart();
  }
  fillTurnMode();
  if (el.turnModeSelect) el.turnModeSelect.addEventListener('change', function () { setTurnMode(el.turnModeSelect.value); el.turnModeSelect.blur(); });
  el.exBar.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-exfire]');
    if (b) setExFire(b.getAttribute('data-exfire'));
  });
  if (el.orderPanel) el.orderPanel.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-order]');
    if (b && !b.disabled) reorder(b.getAttribute('data-order'), Number(b.getAttribute('data-delta')));
  });

  // 遊び方（texts.js の操作の案内。ターンの形に合う行だけ）
  function renderHowto() {
    if (el.howtoTitle) el.howtoTitle.textContent = ui('howtoTitle', '遊び方');
    if (el.howtoClose) el.howtoClose.textContent = ui('howtoStart', 'はじめる');
    if (el.howtoList) el.howtoList.innerHTML = ((TX().ui || {}).howto || []).filter(modeOk).map(function (l) { return '<li>' + esc(l.text) + '</li>'; }).join('');
  }
  renderHowto();

  // 文章パネル（texts_ui.js）から: 文を書き換えたら、画面に出ている文をすぐ入れ替える
  app.textsVer = 0;
  app.refreshTexts = function () {
    app.textsVer++;
    sideSig = '';
    missionSig = '';
    fillTurnMode();
    renderHowto();
    buildScenarioSelect();
    if (!el.tutorialMenu.hidden) renderTutorialMenu();
    render();
  };
  app.simul = simul;
  app.modeOk = modeOk;

  function onToolClick(e) {
    var b = e.target.closest('[data-tool]');
    if (!b) return;
    app.editTool = b.getAttribute('data-tool');
    app.editPick = null;
    render();
  }
  el.tilePalette.addEventListener('click', onToolClick);
  el.unitTools.addEventListener('click', onToolClick);
  el.missionTools.addEventListener('click', onToolClick);
  el.missionSelect.addEventListener('change', function () {
    var res = R.editSetMission(app.state, el.missionSelect.value);
    if (res.ok) { pushHistory(); app.state = res.state; render(); } else say(res.error);
  });
  el.unitList.addEventListener('change', function (e) {
    var s = e.target.closest('select');
    if (!s) return;
    var id = s.getAttribute('data-id');
    var field = s.getAttribute('data-field');
    if (field.indexOf('lpath:') === 0) return;   // ラボ L: 道は lab_target_ui.js が受け取る
    var res = field.indexOf('boost:') === 0 ? R.editSetBoost(app.state, id, field.slice(6), boostValue(field.slice(6), s.value))   // ラボ G
      : field === 'magic' ? R.editSetMagic(app.state, id, s.value)
      : field === 'facing' ? R.editSetFacing(app.state, id, s.value)
      : field === 'npc' ? R.editSetNpc(app.state, id, !!s.value)
      : R.editSetPersona(app.state, id, field, s.value);
    if (res.ok) { pushHistory(); app.state = res.state; render(); } else say(res.error);
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
    if (app.editMode) setState(r.state, label);
    else { addLog(label, 'system'); setState(begin(r.state)); app.resetPoint = R.clone(app.state); }
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
      if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !app.runLock) { e.preventDefault(); undo(); }
      return;
    }
    var k = e.key;
    if (app.demo) { stopDemo(); render(); return; }
    if (app.busy) {
      if (k !== 'Shift') { e.preventDefault(); skipPlayback(); }
      return;
    }
    if (app.runLock && /^[zZeE]$/.test(k)) return;   // 進行モックの戦闘中は、1手戻す・エディットを使わない
    if (k === 'z' || k === 'Z') { undo(); return; }
    if (k === 'e' || k === 'E') { setEditMode(!app.editMode); return; }
    if (app.editMode) {
      if (k === 'Escape') { app.editPick = null; render(); }
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
    if (k === 'q' || k === 'Q') { swapMagic(); return; }   // ラボ G9: 2つ目の魔法と持ち替える
    if ((k === 'b' || k === 'B') && R.lab('F6')) { doAct(true, { labBreak: true }); return; }   // ラボ F6: 壊す
    if ((k === 'k' || k === 'K') && R.lab('F7')) { doAct(true, { labBench: true }); return; }   // ラボ F7: 作業台を置く
    if (k === 'Escape') {
      var u = selUnit();
      if (u && app.plan && (app.plan.to[0] !== u.x || app.plan.to[1] !== u.y)) stay();
      else deselect();
    }
  });

  // 確認用（コンソールから状態を見られる）
  window.CafiliaApp = app;
  app.render = render;
  // 試作ラボ（lab_ui.js）から使う
  app.loadScenario = function (id, opts) { stopDemo(); if (app.editMode) setEditMode(false); endCheck(); loadScenario(id, opts); };
  app.playLabDemo = playLabDemo;
  app.playCheckById = function (id) { var c = CHECKS.filter(function (x) { return x.id === id; })[0]; if (c) playCheck(c); };
  app.say = say;
  app.addLog = function (t) { addLog(t, 'system'); renderLog(); };
  app.clearCache = function () { app.cache = {}; sideSig = ''; };
  // 調整パネル（tune_ui.js）から: 数値を変えたあと、今のシナリオを最初からやり直す
  app.restart = function () {
    if (app.onRestart) { app.onRestart(); return; }   // 進行モック: 今の戦闘を最初からやり直す
    stopDemo();
    if (app.editMode) setEditMode(false);
    app.cache = {};
    sideSig = '';
    // 反映で値は全部入れ直されているので、新案プレイの前の値には戻さない。新案プレイの盤面なら、切り替えを重ね直して読み直す
    var c = app.check;
    app.checkSaved = null;
    if (c) {
      applyCheckSet(c.set);
      loadScenario(null, { check: c, enemyActs: c.enemyActs });
      app.check = c;
      showCaption('');
    } else loadScenario(app.scenario);
  };
  // 進行モック（progress_ui.js）から: 作った盤面で戦闘を始める（1手戻すの履歴は消す）
  app.startCustom = function (s, label) {
    stopDemo();
    endCheck();
    restoreExFire();
    if (app.busy) skipPlayback();
    if (app.editMode) { app.editMode = false; }
    app.scenario = '';
    if (label) addLog(label, 'system');
    app.state = s;
    app.history = [];
    app.sel = null; app.plan = null; app.editPick = null;
    app.cache = {};
    sideSig = '';
    app.resetPoint = R.clone(app.state);
    selectNext(null);
    render();
  };

  // 調整パネル（見本）から: 次にやり直すシナリオを決める（新案プレイの切り替えは外す）
  app.setScenario = function (id) { stopDemo(); endCheck(); app.scenario = id; };
  app.scenarioName = function () {
    if (app.check) return app.check.name;
    if (app.scenario === 'plaza') return R.plazaLayout(B.boardSize).name;
    var p = R.findPreset(app.scenario);
    return p ? p.name : '標準';
  };

  // 最初は遊び方が分かりやすいシナリオで始める【仮】
  var FIRST_SCENARIO = 'spread';
  addLog('ようこそ。敵の予告（紫）を見てから、味方を選び、立ち位置と向きを決めて撃ってください', 'system');
  if (R.PRESETS.some(function (p) { return p.id === FIRST_SCENARIO; })) loadScenario(FIRST_SCENARIO);
  else {
    app.state = begin(app.state);
    app.resetPoint = R.clone(app.state);
    render();
  }
})();
