/*
 * 進行モックの戦闘が、どの3人なら勝てるかを自動プレイで見る（設計者向け）。  node tests/progress_search.js
 *   戦闘ごとに、5つの魔法（草・火・風・土・水）から3人の組み合わせ10通りを、強化なしで回す（1人ずつ）。並べる順は6通り試す。
 *   ONLY=戦闘の id、BEAM=幅、TURNS=最大ターン数、MODE=simul で一斉
 */
var R = require('../rules.js');
var B = require('../balance.js');
var P = require('../progress.js');
var A = require('./autoplay.js');

if (process.env.MODE === 'simul') B.turnMode = 'simul';
var magics = ['grass', 'fire', 'wind', 'earth', 'water'];
var combos = [];
for (var i = 0; i < 5; i++) for (var j = i + 1; j < 5; j++) for (var k = j + 1; k < 5; k++) combos.push([magics[i], magics[j], magics[k]]);
var ids = Object.keys(P.DATA.battles);
if (process.env.ONLY) ids = [process.env.ONLY];

ids.forEach(function (id) {
  var def = P.DATA.battles[id];
  var line = [];
  combos.forEach(function (c) {
    var run = P.newRun('quest', 1);
    ['earth', 'water'].forEach(function (m) { run.party.push({ id: 'X' + m, magic: m }); run.upgrades[m] = {}; });
    // 並べる順（どの魔法をどの置き場所に）を全部試し、勝てた最初の順で数える
    var perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]], r = null;
    perms.some(function (pm) {
      var ids3 = pm.map(function (x) { var m = c[x]; return run.party.filter(function (p) { return p.magic === m; })[0].id; });
      r = A.play(P.buildBattle(run, id, ids3), { turns: Number(process.env.TURNS) || 8, beam: Number(process.env.BEAM) || 10 });
      return r.result === 'win';
    });
    line.push(c.map(function (m) { return R.magicName(m); }).join('') + ':' + (r.result === 'win' ? '勝' + r.turns : r.result === 'lose' ? '負' + r.turns : '－'));
  });
  var wins = line.filter(function (x) { return /勝/.test(x); }).length;
  console.log(id + '（' + def.name + '、おすすめ ' + def.recommend.map(R.magicName).join('・') + '）勝てる組み合わせ ' + wins + '/10');
  console.log('   ' + line.join('  '));
});
