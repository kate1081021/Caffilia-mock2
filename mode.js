/*
 * mode.js — 展示モードと開発モード（オーナー 10/29。IMPROVE_v3 段1 で2つにした 10/30）
 *   開くと展示モード。URL の印 #dev（?dev）で開発モード。
 *   展示モード: 遊ぶのに要るものだけを出す（盤面・味方の欄・向きと構える・待機・発動の順番・敵の予告・会話の窓・発動・1手戻す・遊び方・負けたときのやり直す）。
 *     チュートリアル①から始まり、クリアで②、③へ進む。隠すものは style.css の html.mode-exhibit、キーは ui.js で止める。
 *   開発モード: 展示モードと同じ決まり（一斉発動・③はつながる・balance.js の値）で、エディットとテストプレイ、自分のステージを足す。
 *     開くとエディットから始まる。
 *   作るモード（#make）・調整パネル・ラボ・開発用の入口（#review・#run・#q・#n・#trial・#today・#tune=…）はアーカイブした
 *     （archive/開発モード_20261030/）。今はどれも、印のない URL と同じく展示モードで開く。
 *   展示モードへの切り替え（オーナー 10/30）: URL の印は書き換えずに、開発モードから展示モードへ、展示モードから開発モードへ。
 *     切り替えたことは sessionStorage に覚える（このタブだけ。読み込み直しても続く。新しいタブ・開き直しは URL の印どおり）。
 *     印のない URL で開いた展示モードでは、切り替えは何もしない。ボタン（右下の点・2秒長押し）は ui.js。
 *   ほかのファイルより先に読む（<body> の頭）。window.CAFILIA_MODE（'exhibit' / 'dev'）と、<html> の class（mode-exhibit / mode-dev）を決める。
 */
(function (root) {
  'use strict';
  var loc = root.location || {};
  var SWITCH_KEY = 'cafilia-mock-mode-switch';   // 展示モードに切り替えた元のモード（'dev'）
  // URL の印から決まるモード（window.CAFILIA_DEV は、アーカイブの写しなどで開発モードから開くため）
  function urlMode() {
    var hash = String(loc.hash || ''), search = String(loc.search || '');
    return /(^|[#?&])dev\b/i.test(hash + search) || !!root.CAFILIA_DEV ? 'dev' : 'exhibit';
  }
  function switchedFrom() { try { return root.sessionStorage.getItem(SWITCH_KEY) || ''; } catch (e) { return ''; } }
  // 今のモード: URL の印どおり。ただし、開発モードから展示モードに切り替えてあれば展示モード
  function modeNow() {
    var u = urlMode();
    return u !== 'exhibit' && switchedFrom() === u ? 'exhibit' : u;
  }
  var mode = modeNow();
  root.CAFILIA_MODE = mode;
  if (root.document && root.document.documentElement) root.document.documentElement.classList.add('mode-' + mode);
  // 開いたまま URL の印を付け外ししたら、読み込み直してモードを切り替える
  if (root.addEventListener) root.addEventListener('hashchange', function () { if (modeNow() !== mode) loc.reload(); });

  root.CafiliaMode = {
    // 切り替えられるか（印のない URL で開いた展示モードでは切り替えない）
    canToggle: function () { return urlMode() !== 'exhibit'; },
    // 開発モード → 展示モード、（切り替えた）展示モード → 開発モード。読み込み直して、そのモードの始まりから表示する
    toggle: function () {
      var u = urlMode();
      if (u === 'exhibit') return false;
      try {
        if (mode === 'exhibit') root.sessionStorage.removeItem(SWITCH_KEY);
        else root.sessionStorage.setItem(SWITCH_KEY, u);
      } catch (e) { return false; }   // 覚えられない環境では切り替えない（読み込み直すと元に戻ってしまうため）
      loc.reload();
      return true;
    }
  };
})(this);
