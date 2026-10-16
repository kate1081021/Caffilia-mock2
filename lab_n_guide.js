/*
 * lab_n_guide.js — 試作ラボ N「強化と変化」の確認ガイド（画面だけ。ルールは触らない）
 *   上のバーの「N 確認ガイド」（または index.html#n で開く）。上から順に「デモを見る」→ 下のバーの「次へ ▶」で、
 *   N の盤面を1つずつ見ていける。見たものには ✓（この画面の中だけ。localStorage cafilia-n-guide）。
 *   ui.js・lab_target_ui.js のあとに読み込む。
 */
(function () {
  'use strict';
  var R = window.Rules, app = window.CafiliaApp;
  if (!R || !app || !R.LX || !R.LX.L || !R.LX.L.N) return;
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // 見る順番（1つ1〜2分。全部で15分くらい）
  var STEPS = [
    { scen: 'labNv', title: '分かれ道（覚醒方面か融合方面か）', growth: true,
      look: ['撃つ前の予測と、右の「ターゲット」の一言に「覚醒方面の印」「融合方面の印」「変化「炎」！ 融合方面（火の渦）は閉じる」と出る',
        '右の「ターゲット」の下に、味方ごとの 覚●○ 融●○ と、間の強化の印（威・形 など）',
        'デモのあと、下のバーの「育ちの画面を見る」: 火は炎に、風は砂嵐に変わる。2つの方面の中身（何ができる魔法になるか）も並ぶ（「道に進める」を押すと、次の盤面に持ち越す。右の「道を0に戻す」で戻せる）'],
      q: ['2方面の違いが、選ぶ前に見えたか', 'どちらへ変化させるかで悩めそうか'] },
    { scen: 'labNa', title: '覚醒方面の変化（森・炎・旋風）',
      look: ['旋風: 敵Aを巻いて、向きを右回りに変える（下 → 左）。予告の向きも変わる', '森: 空きにいきなり森。炎: 正面と左右の3マスにいきなり炎', 'ターン終了で、敵Aの燃え広がりが、味方ではなく敵Bに落ちる'],
      q: ['変化したときに手応えがあったか', '変化した魔法が、元の動詞の延長に見えたか'] },
    { scen: 'labNb', title: '覚醒方面の変化（岩・湖）',
      look: ['岩: 正面に岩を置く', '湖: 正面の2×2に湖（水たまりとして振る舞う）。湖の水が岩に当たって、岩が転がる（岩落とし）'],
      q: ['岩・湖は、土・水が一段強くなった姿に見えたか'] },
    { scen: 'labNw1', title: '覚醒（大樹・業火）＋ 仲間の水',
      look: ['覚醒先の自然のマスに、金の縁と1文字の札（樹・業）', '大樹に水 → まわり2マスに森が一気に広がる', '2ターン目: 業火に水 → 消えずに爆ぜる（水蒸気爆発）。倒したミッションは、最後の一手の水が取る'],
      q: ['覚醒が「1属性でえげつない」のに、決め手には仲間が要るままだったか', '大技のミッションを仲間が取ることを、どう感じたか'] },
    { scen: 'labNw2', title: '覚醒（岩山・氷）＋ 仲間の風',
      look: ['岩山に風 → 岩が風下の斜面を転がり落ちる（岩なだれ）。岩山はただの山に戻る', '2ターン目: 氷に風 → 吹雪。風下の一直線が凍り、敵Cの足が凍る'],
      q: ['新しい組み合わせが「こうなりそう」と思えたか', '岩なだれが8章の「落石」に見えなかったか'] },
    { scen: 'labNw3', title: '覚醒（竜巻）＋ 仲間の水・火',
      look: ['竜巻: 敵Aを巻いて、とらえる（次の移動が1回休み）。残る風に金の縁（竜巻の風）', '竜巻の風に水 → まわりに雨（炎が消え、水たまり）', '竜巻の風に火 → 火の渦（風として振る舞う）'],
      q: ['「竜巻は風として振る舞う」の納得感は崩れなかったか'] },
    { scen: 'labNf1', title: '融合（桜・火の渦・源流）',
      look: ['1人で、シナジーで作るものを出せる', '控えめ: 火の渦は正面1マス・源流は3マス・桜は丘の桜（桜吹雪は2列）', '火の渦は1マスでも、森の上の敵なら倒せる'],
      q: ['融合が、仲間と組むシナジーより控えめに収まったか', '1属性で完結しすぎなかったか'] },
    { scen: 'labNf2', title: '融合（泥・砂嵐）',
      look: ['泥: 敵Aの足元ごと泥沼', '砂嵐: 敵Bを包む（中の者は見えない）→ 丘の上の火で粉塵爆発', 'おさまった砂嵐は丘になる'],
      q: ['砂嵐は風の融合か、土の融合か'] },
    { scen: 'labNi', title: '間の強化（倒す・止める・動かす）',
      look: ['水（止める）: 1発で、敵Aの予告が遅れ、足が止まり、次の魔法が1マスに', '風（動かす）: 敵Bを2マス運び、撃った先へ移り、撃ったあと1マス動ける', '火（倒す）: 直撃3と火傷3回'],
      q: ['間の強化が、その属性らしい育ち方に感じたか', '橋渡しとして、ちょうどよい小ささだったか'] },
    { scen: 'labNi2', title: '間の強化（広げる）',
      look: ['草が森の上に立って撃つと、形が 4＋1＋2＝7マス', '広げるの2つ目「もう1ターン残る」は、草では効く場面がない（気づき）'],
      q: ['広げるの並びは、草に合っていたか'] },
    { scen: 'labNv', title: '道を見る・ミッションの仕分け', panels: true,
      look: ['「道を見る」: 5属性の、やりたいこと・2つの方面（変化 → 覚醒／融合）・間の強化の並び', '「ミッションの仕分け」: 44のミッションを、どのやりたいことに入れるか（変えられる）'],
      q: ['ミッションの仕分けが、属性のやりたいことと素直に合っていたか（計測では、草以外はほとんど融合方面に入った。LAB_REPORT の N）'] },
    { quest: true, title: 'クエスト制で育てる（時間があるとき）',
      look: ['拠点のクエストボードから1件選び、連れていく仲間3人を決めて戦う。盤面の順番は決まっていない', 'クエストの札に、ミッションの印・育ちやすい方向・仲間ごとの行き先（覚醒方面か融合方面か）・報酬・おすすめの魔法',
        '勝つと育ちの画面で印が進み、「拠点に戻る」でボードへ。第1章のキークエストを全部クリアすると第2章が開く。裏クエストを受けると、ボードに並ぶクエストが変わる'],
      q: ['クエストを選ぶ理由が「誰をどの方向に育てたいか」になったか', '戦い方から、覚醒方面と融合方面が自然に分かれたか'] }
  ];

  var KEY = 'cafilia-n-guide', seen = {};
  try { seen = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { seen = {}; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch (e) { /* 残せないときも、この画面の間は効く */ } }
  var cur = -1;

  // ---- 入口: 上のバーの「ラボ」の隣 ----
  var labBtn = document.getElementById('btnLab');
  var openBtn = document.createElement('button');
  openBtn.type = 'button'; openBtn.className = 'lab ng-open'; openBtn.textContent = 'N 確認ガイド';
  openBtn.title = '強化と変化（ラボ N）を、上から順にデモで確かめる';
  if (labBtn) labBtn.insertAdjacentElement('afterend', openBtn);

  var box = document.createElement('div');
  box.id = 'nGuide'; box.className = 'lab-run ng-guide'; box.hidden = true;
  document.body.appendChild(box);
  var bar = document.createElement('div');
  bar.id = 'nGuideBar'; bar.className = 'ng-bar'; bar.hidden = true;
  document.body.appendChild(bar);

  function stepHtml(s, i) {
    var p = R.findPreset(s.scen), demo = !!(p && p.demo && !s.play && !s.panels);
    return '<li class="ng-step' + (seen[i] ? ' seen' : '') + (i === cur ? ' now' : '') + '">' +
      '<div class="ng-head"><span class="ng-no">' + (seen[i] ? '✓' : i + 1) + '</span><b>' + esc(s.title) + '</b></div>' +
      '<ul class="ng-look">' + s.look.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
      '<div class="ng-q">問い: ' + s.q.map(esc).join('／') + '</div>' +
      '<div class="ng-btns">' +
      (demo ? '<button type="button" class="primary" data-ng="demo" data-i="' + i + '">デモを見る ▶</button>' : '') +
      (s.quest ? '<button type="button" class="primary" data-ng="quest" data-i="' + i + '">拠点を開く</button>' :
        s.panels ? '<button type="button" class="primary" data-ng="paths" data-i="' + i + '">道を見る</button><button type="button" data-ng="sort" data-i="' + i + '">ミッションの仕分け</button>' :
        '<button type="button"' + (demo ? '' : ' class="primary"') + ' data-ng="play" data-i="' + i + '">自分で遊ぶ</button>') +
      '<label class="ng-seen"><input type="checkbox" data-ng="seen" data-i="' + i + '"' + (seen[i] ? ' checked' : '') + '> 見た</label>' +
      '</div></li>';
  }
  function open() {
    var n = STEPS.filter(function (s, i) { return seen[i]; }).length;
    box.innerHTML = '<div class="lab-run-card ng-card"><h2>N 強化と変化 — 確認ガイド <small>' + n + ' / ' + STEPS.length + ' 見た</small></h2>' +
      '<p class="note">上から順に「デモを見る ▶」。デモは盤面の上に「見るところ」を出しながら進む。終わったら、画面の下のバーの「次へ ▶」で次のデモへ。全部で15分くらい。' +
      'しくみ: ミッションを取った魔法に印が1つ（属性のやりたいこと＝火 倒す・草 広げる・水 止める・風 動かす・土 倒す と合えば覚醒方面、合わなければ融合方面）。印1つで間の強化が1つ。どちらかの方面が2つで変化、覚醒方面はさらに3つで覚醒。' +
      '判定（○△×）は、ラボの判定パネルの「N 強化と変化」のカードで。</p>' +
      '<ol class="ng-steps">' + STEPS.map(stepHtml).join('') + '</ol>' +
      '<div class="lab-run-buttons"><button type="button" data-ng="reset">✓を全部消す</button><button type="button" data-ng="close">閉じる</button></div></div>';
    box.hidden = false;
    bar.hidden = true;
    document.body.classList.remove('ng-bar-on');
  }
  function close() { box.hidden = true; if (cur >= 0) showBar(); }
  function showBar() {
    var s = STEPS[cur];
    if (!s) { bar.hidden = true; return; }
    bar.innerHTML = '<b>N 確認 ' + (cur + 1) + '/' + STEPS.length + '</b><span class="ng-title">' + esc(s.title) + '</span>' +
      (s.growth ? '<button type="button" data-ng="growth" title="確認用に、この戦闘を勝ったことにして育ちの画面を出す">育ちの画面を見る</button>' : '') +
      '<button type="button" data-ng="again">もう一度</button>' +
      '<button type="button" class="primary" data-ng="next">' + (cur + 1 < STEPS.length ? '次へ ▶' : 'おわり') + '</button>' +
      '<button type="button" data-ng="open">ガイド</button><button type="button" data-ng="hide" aria-label="バーを閉じる">×</button>';
    bar.hidden = false;
    document.body.classList.add('ng-bar-on');
  }
  function hideHowto() { var h = document.getElementById('howto'); if (h) h.hidden = true; }
  function go(i, mode) {
    var s = STEPS[i];
    if (!s) return;
    cur = i;
    seen[i] = true; save();
    box.hidden = true;
    hideHowto();
    var gb = document.getElementById('labGrowth');
    if (gb) gb.hidden = true;
    if (s.quest) { bar.hidden = true; document.body.classList.remove('ng-bar-on'); if (window.LabQuest) window.LabQuest.open(); return; }   // クエスト制は拠点の画面で
    var p = R.findPreset(s.scen);
    if (!p) { app.addLog('【N 確認ガイド】盤面がない: ' + s.scen); return; }
    if (mode !== 'play' && p.demo && !s.play && !s.panels) app.playLabDemo(p);
    else app.loadScenario(p.id);
    if (s.panels && window.LabTargetUI) setTimeout(function () { if (mode === 'sort') window.LabTargetUI.openSortN(); else window.LabTargetUI.openPaths(); }, 50);
    showBar();
  }
  // 確認用: 勝ったことにして育ちの画面を出す（デモで最後まで倒し切らない盤面のため）
  function growth() {
    var st = app.state;
    if (app.demo) { app.addLog('【N 確認ガイド】デモが終わってから「育ちの画面を見る」を押してください'); return; }
    if (!st.result) { st.result = 'win'; st.resultText = '（確認用）勝ったことにした — 育ちの画面を見るため'; app.clearCache(); app.render(); }
    if (window.LabTargetUI) window.LabTargetUI.openGrowth(true);
  }

  function onClick(e) {
    var b = e.target.closest('[data-ng]');
    if (!b) { if (e.target === box) close(); return; }
    var a = b.getAttribute('data-ng'), i = Number(b.getAttribute('data-i'));
    if (a === 'seen') { seen[i] = b.checked; if (!b.checked) delete seen[i]; save(); return; }
    if (a === 'demo') go(i, 'demo');
    else if (a === 'play') go(i, 'play');
    else if (a === 'paths' || a === 'sort' || a === 'quest') go(i, a);
    else if (a === 'close') close();
    else if (a === 'open') open();
    else if (a === 'reset') { seen = {}; save(); open(); }
    else if (a === 'next') { if (cur + 1 < STEPS.length) go(cur + 1, STEPS[cur + 1].quest ? 'quest' : 'demo'); else { bar.hidden = true; open(); } }
    else if (a === 'again') go(cur, 'demo');
    else if (a === 'growth') growth();
    else if (a === 'hide') { bar.hidden = true; document.body.classList.remove('ng-bar-on'); }
  }
  box.addEventListener('click', onClick);
  bar.addEventListener('click', onClick);
  box.addEventListener('change', onClick);
  openBtn.addEventListener('click', open);

  // index.html#n で開く
  if (/^#n(-guide)?$/i.test(location.hash)) setTimeout(function () { hideHowto(); open(); }, 300);

  window.LabNGuide = { open: open, go: go, STEPS: STEPS };
})();
