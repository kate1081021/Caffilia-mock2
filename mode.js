/*
 * mode.js — 展示モード・作るモード・開発モード（オーナー 10/29、作るモードは 10/30）
 *   開くと展示モード。URL の印でほかのモードに入る。
 *     #make（?make）… 作るモード。チームの人がステージを作って試す。チームにはこの URL だけを渡す
 *     #dev（?dev）  … 開発モード（今までのモックそのまま。調整パネル・ラボなども全部）
 *   印は別々。#make があれば、ほかの印が一緒に付いていても作るモードにする（チームの人が開発モードに入らないように）。
 *   展示モード: 遊ぶのに要るものだけを出す（盤面・味方の欄・向きと構える・待機・発動の順番・敵の予告・会話の窓・発動・1手戻す・遊び方・負けたときのやり直す）。
 *     ほかは消さずに隠すだけ（style.css の html.mode-exhibit）。キーも ui.js で止める。チュートリアル①から始まり、クリアで②、③へ進む。
 *     ターンの形は一斉発動、③の魔法の出し方は「つながる」に決める。保存した調整（調整パネル）は使わず、balance.js の値で動く。
 *   作るモード: 展示モードと同じ見え方・同じ決まり（一斉・つながる・保存した調整は使わない）で、エディットとテストプレイ、
 *     ステージの保存・読み込み・書き出しだけを足す（style.css の html.mode-make）。開くとエディットから始まる。
 *   開発用の入口（#review・?review・#run・#q・#n・#trial・#today・#tune=… と、見て判定の Artifact の CAFILIA_REVIEW）は、今までどおり開くように開発モードにする。
 *   ほかのファイルより先に読む（<body> の頭）。window.CAFILIA_MODE（'exhibit' / 'make' / 'dev'）と、<html> の class（mode-exhibit / mode-make / mode-dev）を決める。
 */
(function (root) {
  'use strict';
  var loc = root.location || {};
  function modeNow() {
    var hash = String(loc.hash || ''), search = String(loc.search || '');
    if (/(^|[#?&])make\b/i.test(hash + search)) return 'make';
    var dev = /(^|[#?&])dev\b/i.test(hash + search) ||
      /^#(review|run|q|quest|n|n-guide|trial|today|tune=)\b/i.test(hash) || /(^|[?&])review\b/i.test(search) ||
      !!root.CAFILIA_REVIEW || !!root.CAFILIA_DEV;
    return dev ? 'dev' : 'exhibit';
  }
  var mode = modeNow();
  root.CAFILIA_MODE = mode;
  if (root.document && root.document.documentElement) root.document.documentElement.classList.add('mode-' + mode);
  // 開いたまま URL の印を付け外ししたら、読み込み直してモードを切り替える
  if (root.addEventListener) root.addEventListener('hashchange', function () { if (modeNow() !== mode) loc.reload(); });
})(this);
