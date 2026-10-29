/*
 * mode.js — 展示モードと開発モード（オーナー 10/29）
 *   開くと展示モード。URL に #dev を付けたときだけ開発モード（今までのモックそのまま）。
 *   展示モード: 遊ぶのに要るものだけを出す（盤面・味方の欄・向きと構える・待機・発動の順番・敵の予告・会話の窓・発動・1手戻す・遊び方・負けたときのやり直す）。
 *     ほかは消さずに隠すだけ（style.css の html.mode-exhibit）。キーも ui.js で止める。チュートリアル①から始まり、クリアで②、③へ進む。
 *     ターンの形は一斉発動、③の魔法の出し方は「つながる」に決める。保存した調整（調整パネル）は使わず、balance.js の値で動く。
 *   開発用の入口（#review・?review・#run・#q・#n・#trial・#today・#tune=… と、見て判定の Artifact の CAFILIA_REVIEW）は、今までどおり開くように開発モードにする。
 *   ほかのファイルより先に読む（<body> の頭）。window.CAFILIA_MODE（'exhibit' / 'dev'）と、<html> の class（mode-exhibit / mode-dev）を決める。
 */
(function (root) {
  'use strict';
  var loc = root.location || {};
  function isDev() {
    var hash = String(loc.hash || ''), search = String(loc.search || '');
    return /(^|[#?&])dev\b/i.test(hash + search) ||
      /^#(review|run|q|quest|n|n-guide|trial|today|tune=)\b/i.test(hash) || /(^|[?&])review\b/i.test(search) ||
      !!root.CAFILIA_REVIEW || !!root.CAFILIA_DEV;
  }
  var dev = isDev();
  root.CAFILIA_MODE = dev ? 'dev' : 'exhibit';
  if (root.document && root.document.documentElement) root.document.documentElement.classList.add(dev ? 'mode-dev' : 'mode-exhibit');
  // 開いたまま URL の #dev を付け外ししたら、読み込み直してモードを切り替える
  if (root.addEventListener) root.addEventListener('hashchange', function () { if (isDev() !== dev) loc.reload(); });
})(this);
