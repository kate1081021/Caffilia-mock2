// 盤面を文字で出す（調べもの用）
var R = require('../rules.js');
var L = { empty: '.', forest: 'F', mountain: 'M', river: 'R', fire: 'X', smallfire: 's', volcano: 'V', mud: 'D', puddle: 'P', mirage: 'H', ice: 'I', lava: 'L', breeze: 'b', firewhirl: 'Q', sakura: 'K', petals: 'p', deadforest: 'G', haunted: 'O', whirlwind: 'W', tornado: 'T' };
function show(s) {
  var m = s.mission || {};
  var out = [];
  for (var y = 0; y < s.size; y++) {
    var row = '';
    for (var x = 0; x < s.size; x++) {
      var u = R.unitAt(s, x, y), t = R.getTile(s, x, y);
      var c = L[t] || '?';
      if (u) c = u.side === 'enemy' ? u.letter : u.side === 'object' ? (u.kind === 'village' ? 'v' : 'w') : R.magicName(u.magic) ;
      else if (m.treasure && m.treasure[0] === x && m.treasure[1] === y) c = '$';
      else if (R.inCells(m.goal, x, y) && t === 'empty') c = 'g';
      row += (c.length === 1 ? c + ' ' : c);
    }
    out.push(row);
  }
  return out.join('\n');
}
module.exports = show;
