/*
 * balance.js — 数値をまとめた設定
 * ブラウザでは グローバル変数 BALANCE、node では module.exports で読める。
 */
(function (root) {
  var BALANCE = {
    // 盤面
    boardSize: 7,
    minBoardSize: 5,
    maxBoardSize: 11,

    // 味方
    ally: {
      hp: 3,
      moveRange: 2,                              // 1ターンに動ける最大マス数
      count: 3,                                  // 味方の人数（上限）
      defaultMagics: ['fire', 'water', 'wind']   // 初期の魔法
    },

    // 敵
    enemy: {
      hp: 20,
      attack: 3,        // 隣にいる味方への攻撃ダメージ
      maxCount: 3,
      defaultCount: 1
    },

    // 魔法の直撃ダメージ（撃ったマスにいるユニットへ。敵・味方とも）
    directDamage: {
      grass: 1,
      water: 1,
      earth: 2,
      fire: 2,
      wind: 1
    },

    // ターン終了時、炎の上にいる者へのダメージ
    fireTileDamage: 2,

    // 決め手
    spread: {           // 燃え広がり
      maxLength: 4,     // 風下へ最大何マス走るか
      baseDamage: 4,
      perForest: 2      // 燃えた森1つあたりの追加ダメージ
    },
    steam: {            // 水蒸気爆発
      radius: 1,        // 1 → 3×3
      damage: 10
    },
    sentakuki: {        // センタクキ
      inner: 12,        // 渦の中にいる者
      adjacent: 4       // 渦の上下左右にいる者
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = BALANCE;
  } else {
    root.BALANCE = BALANCE;
  }
})(this);
