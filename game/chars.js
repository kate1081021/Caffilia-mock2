/*
 * chars.js — 会話に出すキャラの登録（オーナー 11/13）
 *   ここに登録したキャラは、どのステージの会話（まえげき・あとげき）にも出せる。会話の行の who に、ここの id を書く。
 *
 *   id: {
 *     name:  会話の窓に出す名前
 *     color: 仮の絵と名札の色
 *     faces: { 表情の名前: 絵のファイル（game/img/ の中の画像。例 'game/img/char_a_normal.png'） }
 *            'normal' がふだんの絵。表情を足すときは、ここに行を足して、会話の行の face にその名前を書く。
 *            絵が空（''）のあいだは、色と名前の頭文字で作った仮の絵を出す
 *   }
 *   今いるのは仮の2人。キャラを入れるときに、名前・色・絵を差し替える（id は会話のデータが指しているので、変えるならステージの会話も直す）
 */
(function (root) {
  var CHARS = {
    charA: { name: 'キャラA', color: '#c2410c', faces: { normal: '' } },
    charB: { name: 'キャラB', color: '#1d4ed8', faces: { normal: '' } }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CHARS;
  } else {
    root.CHARS = CHARS;
  }
})(this);
