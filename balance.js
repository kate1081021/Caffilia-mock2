/*
 * balance.js — 数値をまとめた設定（v2）
 * ブラウザでは グローバル変数 BALANCE、node では module.exports で読める。
 */
(function (root) {
  var BALANCE = {
    // 盤面
    boardSize: 6,
    minBoardSize: 5,
    maxBoardSize: 9,

    // 味方
    ally: {
      hp: 3,
      move: 2,                                   // 1手番に動ける最大マス数
      power: 1,                                  // 威力（直撃ダメージ）
      count: 3,                                  // 人数の上限
      defaultMagics: ['fire', 'water', 'wind']   // 初期の魔法
    },

    // 敵
    enemy: {
      hp: 20,
      move: 2,
      power: 3,
      maxCount: 3,
      defaultMagic: 'fire'
    },

    // ターン終了時、炎の上にいる者へのダメージ
    fireTileDamage: 2,

    // 魔法の形（術者の足元が (0,0)、正面が +y、術者から見て右が +x）
    shapes: {
      grass: [[0, 2], [-1, 3], [0, 3], [1, 3]],   // 置く
      earth: [[-1, 2], [0, 2], [-1, 3]],          // 置く
      fire:  [[0, 1], [0, 3]]                     // 点ける
    },
    // 流れる（水）・吹き抜ける（風）が (0,1) から正面へ進む最大マス数
    lineLength: 4,

    // 決め手
    spread: {           // 燃え広がり
      maxLength: 4,     // 起点から風下へ最大何マス
      baseDamage: 4,
      perForest: 2      // 燃えた森1つあたりの追加ダメージ
    },
    steam: {            // 水蒸気爆発
      radius: 1,        // 1 → 3×3
      damage: 10
    },

    // 画面: ターン終了処理などを1つずつ見せる間隔（ミリ秒）
    stepDelayMs: 400
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = BALANCE;
  } else {
    root.BALANCE = BALANCE;
  }
})(this);
