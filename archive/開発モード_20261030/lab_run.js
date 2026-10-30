/*
 * lab_run.js — 試作ラボ H1 周回のミニ版（戦闘の外の画面）
 *   パーティを選ぶ → 道を2つから選ぶ → 戦闘 → 勝ったら強化を3つ（4つ）から選ぶ → … → 最後の大物 → 結果
 *   中身（盤面のひな型・道・強化の候補）は lab_rules.js（R.LX.newRun など）。ここは画面だけ。
 *   乱数（道と強化の候補）は戦闘の外だけで使う（戦闘の中は今どおり乱数なし）。
 */
(function () {
  'use strict';
  var R = window.Rules, app = window.CafiliaApp;
  if (!R || !app || !R.LX || !R.LX.newRun) return;
  var LX = R.LX;
  var esc = function (t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var run = null;   // LX.newRun の中身 ＋ phase（party / path / battle / reward / end）・paths・path・offers・lost

  var box = document.createElement('div');
  box.id = 'labRun'; box.className = 'lab-run'; box.hidden = true;
  document.body.appendChild(box);
  var bar = document.createElement('div');
  bar.id = 'labRunBar'; bar.className = 'lab-bar lab-run-bar'; bar.hidden = true;
  var labBar = document.getElementById('labBar');
  if (labBar && labBar.parentNode) labBar.parentNode.insertBefore(bar, labBar.nextSibling); else document.body.appendChild(bar);

  var PARTY_MAGICS = ['grass', 'earth', 'fire', 'water', 'wind', 'thunder', 'ice', 'dark'];
  function rnd() { return Math.random(); }

  function start(cardId) {
    if (cardId && !R.lab(cardId)) R.labApply([cardId]);
    if (!R.lab('H1')) R.labApply(['H1']);
    run = { phase: 'party' };
    render();
  }
  function stop() { run = null; box.hidden = true; bar.hidden = true; app.render(); }

  function goBattle(p) {
    run.path = p;
    var pr = LX.runPreset(run, p);
    var list = R.LAB_PRESETS;
    for (var i = list.length - 1; i >= 0; i--) if (list[i].id === pr.id) list.splice(i, 1);
    list.push(pr);
    run.phase = 'battle';
    box.hidden = true;
    app.loadScenario(pr.id);
    app.addLog('【周回】' + (run.step + 1) + '/' + LX.RUN_STEPS + ' 戦目: ' + LX.pathText(p));
    renderBar();
  }
  function afterBattle() {
    var st = app.state, won = st.result === 'win';
    LX.runAfterBattle(run, st);
    if (!won) { run.phase = 'end'; run.lost = true; render(); return; }
    if (run.step >= LX.RUN_STEPS) { run.phase = 'end'; render(); return; }
    run.offers = LX.runOffers(run, run.path, rnd, st);
    run.phase = 'reward';
    render();
  }

  function render() {
    renderBar();
    if (!run || run.phase === 'battle') { box.hidden = true; return; }
    var h = '<div class="lab-run-card"><h2>周回のミニ版 <small>試作ラボ H1</small></h2>';
    if (run.phase === 'party') {
      var def = ['grass', 'fire', 'wind'];
      h += '<p>パーティの3人の魔法を選ぶ（周の途中では変えない）。1周 ＝ 戦闘4回＋最後の大物。勝つたびに強化を選ぶ。</p>' +
        [0, 1, 2].map(function (i) {
          return '<label>' + (i + 1) + '人目 <select data-party="' + i + '">' + PARTY_MAGICS.map(function (m) {
            return '<option value="' + m + '"' + (def[i] === m ? ' selected' : '') + '>' + esc(R.magicName(m)) + '</option>';
          }).join('') + '</select></label>';
        }).join(' ') +
        '<p class="note">切り替え: HP の持ち越し ' + (R.BALANCE.lab.H1.carryHp ? 'あり' : 'なし') + '／スピードボーナス ' + (R.BALANCE.lab.H1.speedBonus ? 'あり（' + R.BALANCE.lab.H1.speedTurns + 'ターン以内で強化の候補が4つ）' : 'なし') +
        '／H2 お題で強化が偏る ' + (R.lab('H2') ? 'オン' : 'オフ') + '／H12 前の盤面を持ち越す ' + (R.lab('H12') ? 'オン' : 'オフ') + '（調整パネル・判定パネルで変える）</p>' +
        '<div class="lab-run-buttons"><button type="button" class="primary" data-run="go">出発</button><button type="button" data-run="stop">やめる</button></div>';
    } else if (run.phase === 'path') {
      h += '<p>' + (run.step + 1) + ' / ' + LX.RUN_STEPS + ' 戦目。次へ進む道を選ぶ。</p>' + partyHtml() +
        '<div class="lab-run-paths">' + run.paths.map(function (p, i) {
          return '<button type="button" class="lab-run-path" data-path="' + i + '">' + esc(LX.pathText(p)) + '</button>';
        }).join('') + '</div><div class="lab-run-buttons"><button type="button" data-run="stop">周回をやめる</button></div>';
    } else if (run.phase === 'reward') {
      h += '<p>勝った！ 強化を1つ選ぶ' + (run.offers.length > 3 ? '（スピードボーナスで候補が4つ）' : '') + '。</p>' + partyHtml() +
        '<div class="lab-run-paths">' + run.offers.map(function (o, i) {
          return '<button type="button" class="lab-run-path" data-offer="' + i + '">' + esc(o.label) + '</button>';
        }).join('') + '</div>';
    } else if (run.phase === 'end') {
      var byName = {};
      run.fin.forEach(function (f) { byName[f.name] = (byName[f.name] || 0) + 1; });
      h += '<p><b>' + (run.lost ? (run.step) + ' 戦目で負けた' : '周回を最後まで勝ち抜いた！') + '</b>（戦闘 ' + run.step + ' 回）</p>' + partyHtml() +
        '<h3>この周で起きた決め手</h3>' + (run.fin.length ? '<ul>' + Object.keys(byName).map(function (n) { return '<li>' + esc(n) + ' × ' + byName[n] + '</li>'; }).join('') + '</ul>' +
          '<p class="note">順番: ' + esc(run.fin.map(function (f) { return f.step + '戦目 ' + f.name; }).join('、')) + '</p>' : '<p class="muted">なし</p>') +
        '<h3>選んだ強化</h3>' + (run.picked.length ? '<ul>' + run.picked.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '<p class="muted">なし</p>') +
        '<div class="lab-run-buttons"><button type="button" class="primary" data-run="again">もう1周</button><button type="button" data-run="stop">閉じる</button></div>';
    }
    box.innerHTML = h + '</div>';
    box.hidden = false;
  }
  function partyHtml() {
    return '<p class="lab-run-party">パーティ: ' + run.party.map(function (m) {
      var b = (run.boosts[m] || []).map(function (x) { var u = { magic: m, boosts: [x] }; return LX.boostText(u) || (LX.BOOST_INFO[x.k] ? LX.BOOST_INFO[x.k].name : x.k); }).join('・');
      return esc(R.magicName(m)) + (b ? '（' + esc(b) + '）' : '');
    }).join('　') + '</p>';
  }
  function renderBar() {
    if (!run || run.phase !== 'battle') { bar.hidden = true; return; }
    var st = app.state, h = '<span class="lab-bar-title">周回 ' + (run.step + 1) + '/' + LX.RUN_STEPS + ':</span><span class="lab-bar-on">' + esc(LX.pathText(run.path)) + '</span>';
    if (st && st.result === 'win') h += '<button type="button" class="primary" data-run="next">勝った → 強化を選ぶ</button>';
    else if (st && st.result) h += '<button type="button" class="primary" data-run="next">負けた → 結果を見る</button>';
    h += '<button type="button" data-run="stop">周回をやめる</button>';
    if (bar.innerHTML !== h) bar.innerHTML = h;
    bar.hidden = false;
  }

  box.addEventListener('click', function (e) {
    var t = e.target.closest('button');
    if (!t) return;
    var a = t.getAttribute('data-run');
    if (a === 'stop') { stop(); return; }
    if (a === 'go') {
      var party = Array.prototype.map.call(box.querySelectorAll('select[data-party]'), function (s) { return s.value; });
      run = Object.assign(LX.newRun(party), { phase: 'path' });
      run.paths = LX.runPaths(run, rnd);
      render();
      return;
    }
    if (a === 'again') { start(); return; }
    if (t.hasAttribute('data-path')) { goBattle(run.paths[Number(t.getAttribute('data-path'))]); return; }
    if (t.hasAttribute('data-offer')) {
      LX.runPick(run, run.offers[Number(t.getAttribute('data-offer'))]);
      run.paths = LX.runPaths(run, rnd);
      run.phase = 'path';
      render();
    }
  });
  bar.addEventListener('click', function (e) {
    var a = e.target.getAttribute && e.target.getAttribute('data-run');
    if (a === 'stop') stop();
    if (a === 'next') afterBattle();
  });
  var prev = app.onRender;
  app.onRender = function () { if (prev) prev(); renderBar(); };

  window.LabRun = { start: start, stop: stop, state: function () { return run; } };
})();
