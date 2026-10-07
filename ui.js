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
  var SHORT = { empty: '空き', forest: '森', mountain: '山', river: '川', fire: '炎', smallfire: '小炎', volcano: '火山', mud: '泥沼', puddle: '水たまり', mirage: '蜃気楼', ice: '氷', lava: '溶岩', whirlwind: 'つむじ風', tornado: '竜巻', breeze: '風', firewhirl: '火の渦', sakura: '桜', petals: '花びら', deadforest: '死の森', haunted: 'オバケヤシキ', hill: '丘', thicket: '草むら', gale: '強風' };
  var STORE_KEY = 'cafilia-mock-v2-layouts';

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
    'dirCenter', 'btnStay', 'btnShoot', 'btnWait', 'enemyList', 'tilePalette', 'unitTools', 'unitList',
    'enemyActs', 'boardSize', 'btnResize', 'btnClearTiles', 'saveName', 'btnSave', 'savedList', 'btnLoadSaved',
    'btnDeleteSaved', 'storeNote', 'jsonBox', 'btnExport', 'btnDownload', 'btnImport', 'fileInput',
    'btnEditDone', 'log', 'showForecast', 'btnDemo', 'demoSelect', 'recipeSelect', 'windModeSelect', 'sakuraSelect',
    'missionBar', 'missionSelect', 'missionTools', 'checkPick', 'checkSelect', 'btnCheck', 'checkCaption'].forEach(function (id) { el[id] = $(id); });

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

  function showBanner(text) {
    el.banner.textContent = text;
    el.banner.classList.remove('show');
    void el.banner.offsetWidth;
    el.banner.classList.add('show');
  }

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

  // 出来事をログに足し、演出を出す
  function showEvents(events, animate) {
    var hl = {}, flash = {}, finishers = [];
    events.forEach(function (e) {
      addLog(e.text, logType(e));
      if (!animate) return;
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
      showBanner(finishers.join('・') + '！');
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
        if (e.name === '桜吹雪' && e.origin) fxPetals(e.origin, e.cells || [], e.pink);
      });
      events.forEach(function (e) { if (e.type === 'vortex' && e.center) fxVortex(e.center); });
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
    var st = pb.steps[pb.i++];
    app.state = st.state;
    showEvents(st.events, true);
    render(true);
    pb.timer = setTimeout(nextStep, app.demo ? B.stepDelayMs * 1.6 : B.stepDelayMs);
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
    var s = check ? R.buildPreset(check.layout) : id ? R.loadPreset(id) : R.createState();
    if (opts && opts.enemyActs === false) s = R.editSetEnemyActs(s, false).state;
    var preset = !check && id ? R.PRESETS.filter(function (p) { return p.id === id; })[0] : null;
    var name = check ? check.name : preset ? preset.name : '標準';
    if (preset && preset.recipe) setRecipe(preset.recipe);
    if (preset && preset.windMode) setWindMode(preset.windMode);
    if (preset && preset.sakuraFrom) setSakuraFrom(preset.sakuraFrom);
    app.scenario = check ? 'check:' + check.id : id;
    addLog((check ? '新案プレイの盤面' : 'シナリオ') + '「' + name + '」を読み込んだ', 'system');
    if (check) addLog(check.desc, 'system');
    else if (id) addLog(preset.desc, 'system');
    if (opts && opts.enemyActs === false) addLog('（このデモでは敵は何もしない設定）', 'system');
    setState(begin(s));
    app.resetPoint = R.clone(app.state);
    render();
  }

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
    loadScenario(demo.preset, { enemyActs: demo.enemyActs });
    var queue = [];
    demo.turns.forEach(function (t) { t.forEach(function (a) { queue.push(a); }); });
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
    el.checkCaption.innerHTML = '<div class="cc-head"><b>新案プレイ</b> ' + esc(c.name) + (sets ? '<span class="cc-set">' + esc(sets) + '</span>' : '') + '</div>' +
      (text ? '<div class="cc-say">' + esc(text) + '</div>' : '') +
      (done ? '<div class="cc-done">■ 新案プレイ終了（「1手戻す」でさかのぼれます。続けて手で遊ぶこともできます。この設定はほかのシナリオを読むと元に戻ります）</div>' : '');
    el.checkCaption.hidden = false;
  }
  function playCheck(c) {
    stopDemo();
    if (app.editMode) setEditMode(false);
    setRecipe('off');
    setWindMode('breeze');
    applyCheckSet(c.set);
    loadScenario(null, { check: c, enemyActs: c.enemyActs });
    app.check = c;
    var queue = [];
    c.turns.forEach(function (t) { t.forEach(function (a) { queue.push(a); }); });
    app.demo = { queue: queue, i: 0, timer: null, name: c.name, check: c };
    addLog('▶ 新案プレイ: ' + c.name, 'system');
    showCaption('');
    render();
    app.demo.timer = setTimeout(demoNext, 1000);
  }

  function demoNext() {
    var d = app.demo;
    if (!d) return;
    if (app.busy) { d.timer = setTimeout(demoNext, 150); return; }
    if (d.i >= d.queue.length || app.state.result) {
      addLog('■ ' + (d.check ? '新案プレイ' : 'デモ') + '終了（「1手戻す」で1手ずつさかのぼれます）', 'system');
      if (d.check) showCaption(d.lastSay, true);
      app.demo = null;
      render();
      return;
    }
    var a = d.queue[d.i++];
    if (a.say && d.check) { d.lastSay = a.say; showCaption(a.say); addLog('💬 ' + a.say, 'system'); }
    if (a.endTurn) { doEndTurn(); d.timer = setTimeout(demoNext, CHECK_WAIT.say); return; }   // ターン終了の項目
    if (!a.id) { d.timer = setTimeout(demoNext, CHECK_WAIT.say); return; }   // 説明だけの項目
    if (!R.findUnit(app.state, a.id)) { demoNext(); return; }
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
          doAct(a.shoot !== false);
          d.timer = setTimeout(demoNext, DEMO_WAIT.after);
        }, aimWait);
      }, DEMO_WAIT.move);
    }, DEMO_WAIT.select);
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
    var html = '<span class="m-name m-' + info.type + '">お題: ' + esc(info.name) + '</span>' +
      '<span class="m-rule"><b>勝ち</b> ' + esc(info.win) + '</span>' +
      '<span class="m-rule"><b>負け</b> ' + esc(info.lose) + '</span>' +
      '<span class="m-status">' + info.status.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</span>';
    if (html === missionSig) return;
    missionSig = html;
    el.missionBar.innerHTML = html;
  }

  function renderStatus() {
    var st = app.state;
    el.turnLabel.textContent = 'ターン ' + st.turn;
    var mode = app.editMode ? 'エディット中' : app.demo ? 'デモ再生中' : app.busy ? '処理中…' : st.result === 'win' ? '勝利' : st.result === 'lose' ? '敗北' : 'プレイ中';
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

  // always: 「予告を表示」を切っていても計算する（馬車の道筋は常に出すため）
  function forecastNow(always) {
    if ((!app.showForecast && !always) || app.editMode || app.busy) return null;
    var u = selUnit();
    if (u && app.plan && !app.state.result) {
      var pv = previewNow(u);
      return memo('fcpv', [pv], function () { return R.forecast(pv.state); });
    }
    return memo('fc', [app.state], function () { return R.forecast(app.state); });
  }
  // 【新案・仮】あと一手のヒント（エディット中・処理中は出さない）
  function hintsNow() {
    if (app.editMode || app.busy) return [];
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
  function personaMark(u) { return AIM_MARK[u.aim] + (u.avoid === 'danger' ? '避' : '') + (u.cross === 'river' ? '渡' : ''); }
  function personaText(u) {
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
    if (view.selected) cls.push('selected');
    if (u.side === 'ally' && u.acted && !app.editMode) cls.push('acted');
    if (u.stuck) cls.push('stuck');
    if (R.hidden(st, u)) cls.push('hidden');
    if (view.next) cls.push('next-ready');
    var facing = view.facing || u.facing;
    var name = u.side === 'ally' ? esc(R.magicName(u.magic)) : '敵<small>' + esc(u.letter) + '</small>';
    var h = '<div class="' + cls.join(' ') + '" data-id="' + u.id + '" style="--rot:' + DIR_ROT[facing] + 'deg">' +
      '<span class="facing"></span><span class="u-name">' + name + '</span><span class="u-hp">HP' + u.hp + '</span>';
    if (u.side === 'enemy') {
      h += '<span class="u-magic">' + esc(R.magicName(u.magic)) + '</span>';
      h += '<span class="u-persona" title="' + esc(personaText(u)) + '">' + esc(personaMark(u)) + '</span>';
    }
    if (R.hidden(st, u)) h += '<span class="u-hide">隠</span>';
    if (st.mission && st.mission.carrier === u.id) h += '<span class="u-treasure" title="宝を持っている（撃てない）">宝</span>';
    if (u.burn > 0) h += '<span class="u-burn" title="火傷: ターン終了ごとに' + B.fire.burnDamage + '（水か氷で治る）">火傷' + u.burn + '</span>';
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
    if (pv) {
      pv.cells.forEach(function (c) { shape[key(c[0], c[1])] = true; });
      pv.finishers.forEach(function (f) {
        f.cells.forEach(function (c) { range[key(c[0], c[1])] = true; });
        (f.strong || []).forEach(function (c) { strong[key(c[0], c[1])] = true; });
      });
      pv.tileChanges.forEach(function (c) { change[key(c.x, c.y)] = c.to; });
      pv.damages.forEach(function (d) { dmg[d.id] = d; });
      // 【育つ】育ったあとの形を薄く重ね、育てないマスに印
      (pv.grows || []).forEach(function (g) {
        g.cells.forEach(function (c, i) { growPv[key(c[0], c[1])] = (g.tiles && g.tiles[i]) || g.tile; });
        g.blocked.forEach(function (c) { growNo[key(c[0], c[1])] = true; });
      });
    }
    // 予告
    var fcShot = {}, fcGhost = {}, fcSpread = {}, fcOut = {}, fcChange = {}, fcRange = {}, fcStrong = {}, warn = {};
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
      fc.fireSpread.forEach(function (c) { fcSpread[key(c[0], c[1])] = true; });
      (fc.burnOut || []).forEach(function (c) { fcOut[key(c[0], c[1])] = true; });
      fc.burn.forEach(function (b) { warn[b.id] = (warn[b.id] || 0) + b.amount; });
      fc.enemyDamage.forEach(function (d) { warn[d.id] = (warn[d.id] || 0) + d.amount; });
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
    for (var my = 0; my < n; my++) {
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
        if (growPv[k]) cls.push('pv-grow');
        if (range[k]) cls.push('pv-range');
        if (strong[k]) cls.push('pv-strong');
        if (fcShot[k]) cls.push('fc-shot');
        if (fcRange[k]) cls.push('fc-range');
        if (fcStrong[k]) cls.push('fc-strong');
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
        if (tile === 'mountain' || tile === 'volcano' || tile === 'sakura') {
          var ms = [];
          if (isMount(x, y - 1)) ms.push('up'); if (isMount(x + 1, y)) ms.push('right'); if (isMount(x, y + 1)) ms.push('down'); if (isMount(x - 1, y)) ms.push('left');
          inner += '<span class="massif ' + ms.map(function (m) { return 'j-' + m; }).join(' ') + (tile === 'volcano' ? ' hot' : '') + '"></span>';
          if (tile === 'sakura') inner += '<span class="bloom"></span>';
          var pk = peakAt[k];
          if (pk) inner += '<span class="peak' + (pk.hot ? ' hot' : '') + '" style="--ps:' + pk.size.toFixed(2) + ';--pdx:' + pk.dx.toFixed(2) + ';--pdy:' + pk.dy.toFixed(2) + '"></span>';
        }
        // お題の印
        if (isGoal) inner += '<span class="m-mark goal">ゴール</span>';
        if (isExit) inner += '<span class="m-mark exit">帰り口</span>';
        if (mi.treasure && mi.treasure[0] === x && mi.treasure[1] === y) inner += '<span class="m-treasure' + (unit ? ' under' : '') + '" title="宝（このマスで移動を終えると持つ）">宝</span>';
        if (wLine[k]) inner += wLine[k].map(function (d) { return '<span class="wline ' + d + '"></span>'; }).join('') + '<span class="wline dot"></span>';
        if (wNext && wNext.k === k) inner += '<span class="wnext' + (wNext.stuck ? ' stuck' : '') + '" title="次のターン終了で馬車が進むマス">' + DIR_ARROW[wNext.dir] + '</span>';
        if (guide[k] && reach[k] !== undefined) {
          inner += guide[k] === 'finisher' ? '<span class="b-guide finisher">◆</span>' : '<span class="b-guide change" title="変化が起きる"></span>';
        }
        if (growPv[k]) inner += '<span class="g-ghost ' + growPv[k] + '" title="育ったあとの形（' + esc(SHORT[growPv[k]]) + '）"></span>';
        if (growNo[k]) inner += '<span class="b-nogrow" title="育たない（ユニットがいる・ほかの自然がある）">×</span>';
        if (change[k]) inner += '<span class="b-change">→' + esc(SHORT[change[k]]) + '</span>';
        else if (fcChange[k]) inner += '<span class="b-change enemy">→' + esc(SHORT[fcChange[k]]) + '</span>';
        var badges = '';
        if (fcSpread[k]) badges += '<span class="spread">燃</span>';
        if (fcOut[k]) badges += '<span class="burnout" title="次のターン終了で燃え尽きる">尽</span>';
        if (fcShot[k]) badges += '<span class="enemy">' + esc(fcShot[k].join('')) + '</span>';
        if (badges) inner += '<span class="b-fc">' + badges + '</span>';
        if (fcGhost[k] && !unit) inner += '<div class="ghost">' + esc(fcGhost[k].letter) + DIR_ARROW[fcGhost[k].dir] + '</div>';
        if (planGhost === k && !unit) inner += '<div class="ghost ally"></div>';
        if (nextAt[k]) {
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
            next: !!nextReady[unit.id]
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
    var sig = JSON.stringify([app.editMode, app.busy, app.sel, app.plan, app.editTool, st.units, st.enemyActs, st.size, st.result, st.mission, fc ? fc.enemies : null, hintsNow(), storeVersion]);
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
    var warn = {};
    if (fc) {
      fc.burn.forEach(function (b) { warn[b.id] = (warn[b.id] || 0) + b.amount; });
      fc.enemyDamage.forEach(function (d) { warn[d.id] = (warn[d.id] || 0) + d.amount; });
    }
    var nextFor = {};
    hintsNow().forEach(function (h) { h.shooters.forEach(function (sh) { nextFor[sh.id] = h; }); });
    var al = R.alliesOf(st);
    el.roster.innerHTML = al.length ? al.map(function (a, i) {
      var status = [a.acted ? '行動済み' : '行動前'];
      if (a.stuck) status.push('泥沼: 次は移動できない');
      if (a.burn > 0) status.push('火傷: あと' + a.burn + '回（水か氷で治る）');
      if (st.mission && st.mission.carrier === a.id) status.push('宝を持っている（撃てない）');
      var cls = 'ally-card' + (a.id === app.sel ? ' selected' : '') + (a.acted ? ' acted' : '');
      return '<button type="button" class="' + cls + '" data-id="' + a.id + '">' +
        '<span class="dot">' + esc(R.magicName(a.magic)) + '</span>' +
        '<span class="info"><b>' + (i + 1) + '. ' + esc(R.unitLabel(st, a)) + '　HP ' + a.hp + '/' + a.maxHp + '　' + DIR_ARROW[a.facing] + '</b>' +
        '<span class="sub">' + esc(status.join('・')) +
        (nextFor[a.id] ? '<br><span class="next">あと一手: ' + esc(R.magicName(nextFor[a.id].magic)) + 'を当てれば' + esc(nextFor[a.id].name) + '</span>' : '') +
        (warn[a.id] ? '　<span class="danger">予告: ' + warn[a.id] + 'ダメージを受ける' + (warn[a.id] >= a.hp ? '（倒れる）' : '') + '</span>' : '') +
        '</span></span></button>';
    }).join('') : '<p class="muted">味方がいません（エディットで置けます）</p>';

    var en = R.enemiesOf(st);
    var plans = {};
    if (fc) fc.enemies.forEach(function (p) { plans[p.id] = p; });
    var html = en.map(function (e) {
      var note = (e.stuck ? '（泥沼: 次は移動できない）' : '') + (e.burn > 0 ? '（火傷: あと' + e.burn + '回）' : '');
      return '<div class="enemy-row"><span class="dot">' + esc(e.letter) + '</span><span>' + esc(e.name) + '（' + esc(R.magicName(e.magic)) + '）HP ' + e.hp + '/' + e.maxHp +
        (warn[e.id] ? ' <span class="danger">予告で -' + warn[e.id] + (warn[e.id] >= e.hp ? '（倒れる）' : '') + '</span>' : '') +
        '<span class="hpbar"><span style="width:' + Math.max(0, e.hp / e.maxHp * 100) + '%"></span></span> ' + DIR_ARROW[e.facing] + esc(note) + '</span>' +
        '<span class="persona">' + esc(personaText(e)) + '</span>' +
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
    var shootOk = !!u && R.canShoot(app.state, u, app.plan.to);
    el.btnStay.disabled = !u;
    el.btnShoot.disabled = !shootOk;
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
        (u.side === 'enemy' ? '<span class="persona-edit">' + ['aim', 'avoid', 'cross'].map(function (f) {
          var label = { aim: '狙い', avoid: '避ける', cross: '越える' }[f];
          return '<label>' + label + ' <select data-id="' + u.id + '" data-field="' + f + '">' + Object.keys(R.PERSONA[f]).map(function (v) {
            return '<option value="' + v + '"' + (u[f] === v ? ' selected' : '') + '>' + esc(R.PERSONA[f][v]) + '</option>';
          }).join('') + '</select></label>';
        }).join('') + '</span>' : '') + '</div>';
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
    if (app.demo) { h.textContent = '▶ デモ再生中: ' + app.demo.name + '（盤面のクリックかキーで止める）'; h.classList.add('busy'); return; }
    if (app.busy) { h.textContent = '処理中…（盤面のクリックかキーで飛ばせます）'; h.classList.add('busy'); return; }
    if (st.result && !app.editMode) {
      h.textContent = st.resultText || (st.result === 'win' ? '勝利！ 敵を全員倒しました' : '敗北… 味方が全員倒れました');
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
      var head = p.waitOnly ? '予測: (' + p.to[0] + ',' + p.to[1] + ') へ移動して待機（宝を持っているので撃てない）'
        : '予測: (' + p.to[0] + ',' + p.to[1] + ') から ' + DIR_ARROW[p.dir] + ' に' + R.magicName(u.magic) + 'の魔法（' + R.MAGIC_INFO[u.magic].verb + '）';
      box.innerHTML = '<div class="pv-head">' + head + '</div>' + lines.join('');
      return;
    }
    var t = app.hover;
    if (t && R.inBounds(app.state, t.x, t.y)) {
      var tile = R.getTile(app.state, t.x, t.y);
      var o = R.unitAt(app.state, t.x, t.y);
      var s = '<div class="pv-head">(' + t.x + ',' + t.y + ') ' + esc(R.tileName(tile)) + '</div><div>' + esc(TILE_DESC[tile]) + '</div>';
      if (o && o.side === 'object') s += '<div class="muted">' + esc(R.unitLabel(app.state, o)) + '　HP ' + o.hp + '/' + o.maxHp + '　' + esc(OBJECT_DESC[o.kind]) + '</div>';
      else if (o) s += '<div class="muted">' + esc(R.unitLabel(app.state, o)) + '　HP ' + o.hp + '/' + o.maxHp + '　魔法: ' + esc(R.magicName(o.magic)) + '　向き ' + DIR_ARROW[o.facing] + '</div>';
      var mm = app.state.mission || {};
      if (R.inCells(mm.goal, t.x, t.y)) s += '<div class="muted">ゴール: 馬車がここに入ったら勝ち。</div>';
      if (R.inCells(mm.exit, t.x, t.y)) s += '<div class="muted">帰り口: 宝を持った味方がここで移動を終えたら勝ち。</div>';
      if (mm.treasure && mm.treasure[0] === t.x && mm.treasure[1] === t.y) s += '<div class="muted">宝: このマスで移動を終えると持つ（持っている間は撃てない）。敵は拾わない。</div>';
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
  el.btnWait.addEventListener('click', function () { doAct(false); });
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

  // シナリオはお題ごとに分けて並べる（元の戦闘は「戦闘」）
  var presetOpt = function (p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; };
  var shown = R.PRESETS.filter(function (p) { return !p.hidden; });
  el.scenarioSelect.innerHTML =
    '<optgroup label="お題（防衛・護衛・奪取）">' + shown.filter(function (p) { return p.mission; }).map(presetOpt).join('') + '</optgroup>' +
    '<optgroup label="戦闘（敵の全滅）"><option value="">標準（火・水・風 / 敵1体）</option>' +
    shown.filter(function (p) { return !p.mission; }).map(presetOpt).join('') + '</optgroup>';
  el.scenarioSelect.addEventListener('change', function () { loadScenario(el.scenarioSelect.value); el.scenarioSelect.blur(); });
  el.recipeSelect.value = B.tornadoRecipe;
  el.windModeSelect.value = B.windMode;
  el.sakuraSelect.value = B.sakura.from;
  el.sakuraSelect.addEventListener('change', function () { setSakuraFrom(el.sakuraSelect.value); render(); el.sakuraSelect.blur(); });
  el.windModeSelect.addEventListener('change', function () { setWindMode(el.windModeSelect.value); render(); el.windModeSelect.blur(); });
  el.recipeSelect.addEventListener('change', function () { setRecipe(el.recipeSelect.value); render(); el.recipeSelect.blur(); });

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
    var res = field === 'magic' ? R.editSetMagic(app.state, id, s.value)
      : field === 'facing' ? R.editSetFacing(app.state, id, s.value)
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
      if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undo(); }
      return;
    }
    var k = e.key;
    if (app.demo) { stopDemo(); render(); return; }
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
  // 調整パネル（tune_ui.js）から: 数値を変えたあと、今のシナリオを最初からやり直す
  app.restart = function () {
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
  app.scenarioName = function () {
    if (app.check) return app.check.name;
    var p = R.PRESETS.filter(function (x) { return x.id === app.scenario; })[0];
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
