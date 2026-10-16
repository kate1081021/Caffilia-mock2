/*
 * lab_rules.js — 試作ラボの案のルール（LAB_A〜LAB_K）
 *
 * rules.js が読み込まれるときに bind(I) が呼ばれ、rules.js の中の道具（I）を受け取って、案ごとの処理を返す。
 * rules.js の側は「BALANCE.lab.XX.on を見て、ここの関数を呼ぶ」だけにしてある。
 * 案を本実装に移す・捨てるときは、ここの関数と、rules.js の lab('XX') の行を探せば1か所で済む。
 *
 * どの案も、切り替えが全部オフなら一度も呼ばれない（tests/snapshot.js で今と同じことを確かめる）。
 * ブラウザでは グローバル変数 LabRules、node では module.exports で読める。
 */
(function (root) {
  'use strict';

  function bind(I) {
    var B = I.B;
    var DIRS = I.DIRS, DIR_ORDER = I.DIR_ORDER;
    var getTile = I.getTile, setTile = I.setTile, unitAt = I.unitAt, inBounds = I.inBounds, key = I.key, idx = I.idx;
    var addHit = I.addHit, tileName = I.tileName, unitLabel = I.unitLabel, neighbors = I.neighbors, connected = I.connected;
    var SRC_ADD = I.SRC_NOTE;

    function on(id) { var l = B.lab && B.lab[id]; return !!(l && l.on); }
    function opt(id, k) { return B.lab && B.lab[id] ? B.lab[id][k] : undefined; }
    function sq(c) { return [c[0], c[1]]; }
    function has(list, x, y) { return list.some(function (c) { return c[0] === x && c[1] === y; }); }

    // C2: 決め手の「中」の外にいる者（edge: weak は弱い5、move はダメージなし）
    function edge(ctx, u, fire) {
      if (opt('C2', 'edge') === 'move') return;
      addHit(ctx, u, B.fire.weakDamage, fire ? 'weakfire' : 'edge');
    }

    // ---------------------------------------------------------------
    // 共通の道具
    // ---------------------------------------------------------------
    // 水としてつながるマス（B14 葦原・I4 飛び石も水のまま）
    function waterTile(t) {
      return t === 'river' || t === 'puddle' || (t === 'reeds' && (on('B14') || on('L0'))) || (t === 'stepstone' && (on('I4') || non()));   // N: 岩（土の変化）   // L0: 草の起点1 の葦原
    }
    // ユニットが占めるマス（D3 大きい敵は size×size）
    function unitCells(u) {
      var n = u.size || 1, out = [];
      for (var dy = 0; dy < n; dy++) for (var dx = 0; dx < n; dx++) out.push([u.x + dx, u.y + dy]);
      return out;
    }
    // origin から cells を伝ってたどる歩数（波の順。J3 の見せ方）
    function waveFrom(cells, origin) {
      var inSet = {}, dist = {}, queue = [];
      cells.forEach(function (c) { inSet[key(c[0], c[1])] = true; });
      var start = origin && inSet[key(origin[0], origin[1])] ? [origin] : [];
      if (!start.length && origin) {
        // 起点が cells の外なら、起点に一番近いマスから
        var best = null;
        cells.forEach(function (c) { var d = Math.abs(c[0] - origin[0]) + Math.abs(c[1] - origin[1]); if (!best || d < best.d) best = { c: c, d: d }; });
        if (best) start = [best.c];
      }
      start.forEach(function (c) { dist[key(c[0], c[1])] = 0; queue.push(c); });
      while (queue.length) {
        var c = queue.shift(), d = dist[key(c[0], c[1])];
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) {
          var k = key(c[0] + o[0], c[1] + o[1]);
          if (!inSet[k] || dist[k] !== undefined) return;
          dist[k] = d + 1; queue.push([c[0] + o[0], c[1] + o[1]]);
        });
      }
      return cells.map(function (c) { var d = dist[key(c[0], c[1])]; return d === undefined ? 0 : d; });
    }

    // ---------------------------------------------------------------
    // C 決め手
    // ---------------------------------------------------------------

    // C2: 感電。水の上の者だけ20、隣の者は外側
    function shock(s, sx, sy, ctx, ev, done) {
      var net = [], seen = {}, stack = [[sx, sy]];
      while (stack.length) {
        var c = stack.pop(), k = key(c[0], c[1]);
        if (seen[k] || !inBounds(s, c[0], c[1])) continue;
        if (!waterTile(getTile(s, c[0], c[1])) && !(on('I8') && getTile(s, c[0], c[1]) === 'pillar')) continue;   // I8: 金の柱も雷を通す
        seen[k] = true; if (done) done[k] = true;
        net.push(c);
        neighbors(s, c[0], c[1]).forEach(function (n) { stack.push([n.x, n.y]); });
      }
      // I8: 金の柱も雷を通す
      if (on('I8')) net = pillarNet(s, net, seen);
      var amount = B.shock.base + net.length * B.shock.perWater;
      var inNet = {};
      net.forEach(function (c) { inNet[key(c[0], c[1])] = true; });
      var touched = {};
      net.forEach(function (c) {
        [[c[0], c[1]]].concat(neighbors(s, c[0], c[1]).map(function (n) { return [n.x, n.y]; })).forEach(function (p) {
          var u = unitAt(s, p[0], p[1]);
          if (!u || touched[u.id]) return;
          if (on('D7') && u.body === 'rock') return;   // D7: 岩の体は電気を通さない
          if (on('C2') && !inNet[key(p[0], p[1])]) {
            // 「中」は水の上。隣にいるだけなら、ほかのマスで水の上にいないか先に見る
            var onWater = unitCells(u).some(function (q) { return inNet[key(q[0], q[1])]; });
            if (!onWater) { touched[u.id] = true; edge(ctx, u); return; }
          }
          touched[u.id] = true;
          addHit(ctx, u, amount, 'finisher', p);
        });
      });
      var fin = { name: '感電', cells: net, damage: amount, water: net.length };
      ctx.finishers.push(fin);
      ev.push({ type: 'finisher', name: '感電', isNew: true, origin: [sx, sy], cells: net, damage: amount, wave: waveFrom(net, [sx, sy]),
        text: '【新案】感電！ つながった水' + net.length + 'マスに雷が走った（威力' + amount + '）' + (on('C2') ? '【ラボ: 水の上だけ20】' : '') });
      return fin;
    }

    // C4: オバケヤシキの引き寄せの範囲（つながった死の森の数で）
    function hauntRange(s, x, y) {
      var n = connected(s, x, y, 'deadforest').length || 1;
      var r = n <= 2 ? 1 : n <= 5 ? 2 : 3;
      if (opt('C4', 'sharp')) r = Math.min(r, 2);
      return r;
    }

    // C2・C4（・E9）: オバケヤシキ
    function haunt(s, x, y, ctx, ev) {
      var range = on('C4') ? hauntRange(s, x, y) : B.haunt.pullRange;
      var house = [[x, y]];
      house.forEach(function (c) {
        setTile(s, c[0], c[1], 'haunted');
        var o = unitAt(s, c[0], c[1]);
        if (o && !o.stuck) { o.stuck = true; ev.push({ type: 'mud', id: o.id, cells: [c], text: '【新案】' + unitLabel(s, o) + 'はオバケヤシキに閉じこめられた（次の移動は1回休み）' }); }
        if (o && on('E9')) enclose(s, o, ev);
      });
      pullToward(s, [x, y], range, [], ev, 'はオバケヤシキに引き寄せられた');
      var ring = [], ringSeen = {};
      house.forEach(function (c) {
        neighbors(s, c[0], c[1]).forEach(function (n) {
          var k = key(n.x, n.y);
          if (has(house, n.x, n.y) || ringSeen[k]) return;
          ringSeen[k] = true; ring.push([n.x, n.y]);
        });
      });
      house.forEach(function (c) { var o = unitAt(s, c[0], c[1]); if (o) addHit(ctx, o, B.haunt.damage, 'finisher', c); });
      ring.forEach(function (c) {
        var o = unitAt(s, c[0], c[1]);
        if (!o) return;
        if (on('C2')) edge(ctx, o); else addHit(ctx, o, B.haunt.damage, 'finisher', c);
      });
      var cells = house.concat(ring);
      var fin = { name: 'オバケヤシキ', cells: cells, damage: B.haunt.damage, inward: true };
      ctx.finishers.push(fin);
      ev.push({ type: 'finisher', name: 'オバケヤシキ', isNew: true, origin: [x, y], center: [x, y], cells: cells, damage: B.haunt.damage, inward: true,
        text: '【新案】オバケヤシキ！ 死の森に火が灯り、まわり' + range + 'マスの者を引き寄せておどかした（威力' + B.haunt.damage + '）' +
          (on('C2') ? '【ラボ: 中だけ20】' : '') + (on('C4') ? '【ラボ: 死の森の大きさで範囲' + range + '】' : '') });
      return fin;
    }

    // 竜巻・火の渦のまわり d 周目の輪（時計回り。左上から）
    function ringAt(s, area, d) {
      var xs = area.body.map(function (c) { return c[0]; }), ys = area.body.map(function (c) { return c[1]; });
      var minX = Math.min.apply(null, xs) - d, maxX = Math.max.apply(null, xs) + d;
      var minY = Math.min.apply(null, ys) - d, maxY = Math.max.apply(null, ys) + d;
      var ring = [];
      for (var rx = minX; rx <= maxX; rx++) ring.push([rx, minY]);
      for (var ry = minY + 1; ry <= maxY; ry++) ring.push([maxX, ry]);
      for (var lx = maxX - 1; lx >= minX; lx--) ring.push([lx, maxY]);
      for (var ly = maxY - 1; ly > minY; ly--) ring.push([minX, ly]);
      return ring.filter(function (c) { return inBounds(s, c[0], c[1]); });
    }

    // C2・C3・C4: センタクキ。dir は水の向き（水で起こしたとき）
    function sentakuki(s, x, y, ctx, ev, dir) {
      var kindName = tileName(getTile(s, x, y));
      var area = I.tornadoArea(s, x, y);
      var rings = [area.ring];
      if (on('C4') && area.body.length >= 8 && !opt('C4', 'sharp')) rings.push(ringAt(s, area, 2));
      var half = on('C3') && dir ? DIRS[dir] : null;
      var far = function (c) { return !half || ((c[0] - area.center[0]) * half.dx + (c[1] - area.center[1]) * half.dy) > 0; };
      var hitCells = area.body.slice();
      area.body.forEach(function (c) { var o = unitAt(s, c[0], c[1]); if (o) addHit(ctx, o, B.sentakuki.damage, 'finisher', c); });
      var allMoves = [];
      rings.forEach(function (ring) {
        var arc = ring.filter(far);
        arc.forEach(function (c) {
          hitCells.push(c);
          var o = unitAt(s, c[0], c[1]);
          if (!o) return;
          if (on('C2')) edge(ctx, o); else addHit(ctx, o, B.sentakuki.damage, 'finisher', c);
        });
        var slots = arc.filter(function (c) { var o = unitAt(s, c[0], c[1]); return I.SPIN_OK[getTile(s, c[0], c[1])] && !(o && I.isFixed(o)) && !(o && o.size > 1); });
        var shift = Math.max(1, Math.round(ring.length / 4));
        if (slots.length >= 2) {
          var contents = slots.map(function (c) { return { tile: getTile(s, c[0], c[1]), unit: unitAt(s, c[0], c[1]) }; });
          contents.forEach(function (cn, k) {
            var to = slots[(k + shift) % slots.length];
            setTile(s, to[0], to[1], cn.tile);
            if (cn.unit) allMoves.push({ id: cn.unit.id, from: [cn.unit.x, cn.unit.y], to: to });
          });
        }
      });
      allMoves.forEach(function (m) { var w = I.findUnit(s, m.id); w.x = m.to[0]; w.y = m.to[1]; });
      allMoves.forEach(function (m) { ev.push({ type: 'push', id: m.id, ok: true, from: m.from, to: m.to, text: unitLabel(s, I.findUnit(s, m.id)) + 'はセンタクキで回された' }); });
      area.body.forEach(function (c) { setTile(s, c[0], c[1], 'empty'); });
      var fin = { name: 'センタクキ', cells: hitCells, damage: B.sentakuki.damage, dir: half ? dir : undefined, origin: [x, y] };
      ctx.finishers.push(fin);
      ev.push({ type: 'finisher', name: 'センタクキ', isNew: true, origin: [x, y], center: area.center, cells: hitCells, damage: B.sentakuki.damage, dir: fin.dir,
        text: '【新案】センタクキ！ ' + kindName + 'のまわりが' + (half ? '水に押されて' + DIRS[dir].name + '側の半分だけ' : '') + 'ぐるっと回り' +
          (rings.length > 1 ? '（2周）' : '') + '、' + kindName + 'は跡形もなく消えた' });
      return fin;
    }

    // C4・C5: 桜吹雪の奥行きと強さ
    function eruptionDepth(s, kind, comp, base) {
      var depth = base;
      if (on('C4')) depth = Math.max(1, Math.min(3, comp.length));
      if (on('C5') && kind === 'hillsakura') depth = 1;
      return depth;
    }
    function eruptionWeak(kind) { return on('C5') && kind === 'hillsakura'; }

    // C4 sharp: 燃え広がりの走る長さ ＝ 4マス＋燃えた森の数の半分
    function sharpLength(s, ox, oy, dir, bonus) {
      var F = DIRS[dir];
      var base = B.spread.maxLength + (bonus || 0);
      var L = base;
      for (var iter = 0; iter < 8; iter++) {
        var burned = {}, n = 0;
        for (var i = 1; i <= L; i++) {
          var x = ox + F.dx * i, y = oy + F.dy * i;
          if (!inBounds(s, x, y)) break;
          var t = getTile(s, x, y);
          if (I.SPREAD_BLOCKERS[t]) break;
          if (I.isPlant(t)) {
            connectedPlants(s, x, y).forEach(function (c) {
              var k = key(c[0], c[1]);
              if (!burned[k]) { burned[k] = true; if (I.burnsStrong(getTile(s, c[0], c[1]))) n++; }
            });
          }
        }
        var next = base + Math.floor(n / 2);
        if (next <= L) break;
        L = next;
      }
      return L;
    }
    function connectedPlants(s, x, y) {
      var out = [], seen = {}, stack = [[x, y]];
      while (stack.length) {
        var c = stack.pop(), k = key(c[0], c[1]);
        if (seen[k] || !inBounds(s, c[0], c[1]) || !I.isPlant(getTile(s, c[0], c[1]))) continue;
        seen[k] = true; out.push(c);
        neighbors(s, c[0], c[1]).forEach(function (n) { stack.push([n.x, n.y]); });
      }
      return out;
    }

    // C5: 大きな火の渦（強風に火）の印
    function markBigWhirl(s, cells) {
      s.labBig = s.labBig || {};
      cells.forEach(function (c) { s.labBig[idx(s, c[0], c[1])] = true; });
    }
    function isBigWhirl(s, x, y) { return !!(s.labBig && s.labBig[idx(s, x, y)]); }
    // C5: ふつうの火の渦に水 → 炎に水と同じく消える（つながった火の渦がまとめて空きに）
    function quenchWhirl(s, x, y, ctx) {
      var cells = connected(s, x, y, 'firewhirl');
      cells.forEach(function (c) { setTile(s, c[0], c[1], 'empty'); });
      ctx.phrases.push('【ラボ】火の渦に水がかかって消えた（' + cells.length + 'マス）');
      ctx.notes.push('育っていれば: センタクキ（強風に火の「大きな火の渦」なら）');
      cells.forEach(function (c) { ctx.cells.push(c); });
    }

    // C6: 燃え広がりの通り道に「火が当たった」（もとから空き・植物だったマスは燃え広がりそのものなので数えない）
    function spreadTouch(s, path, before, dir, ctx, ev) {
      path.forEach(function (c, i) {
        var was = before[i];
        if (was === 'empty' || I.isPlant(was)) return;
        touchFire(s, c[0], c[1], dir, ctx, ev, '燃え広がりの通り道');
      });
    }

    // 1マスに「火が当たった」（C6 の連鎖・G4 の融合などで使う。ユニットへの直撃は含まない）
    function touchFire(s, x, y, dir, ctx, ev, why) {
      var k = key(x, y);
      ctx.labDone = ctx.labDone || {};
      if (ctx.labDone['fire:' + k]) return false;
      ctx.labDone['fire:' + k] = true;
      var t = getTile(s, x, y), tag = why ? '【ラボ】' + why + 'で、' : '【ラボ】';
      if (t === 'deadforest') { ctx.phrases.push(tag + '死の森に火が届いた'); I.doHaunt(s, x, y, ctx, ev); return true; }
      if (I.isWind(t)) { ctx.phrases.push(tag + tileName(t) + 'に火が入った'); I.doFireWhirl(s, x, y, dir, ctx, ev); return true; }
      if (t === 'puddle') { setTile(s, x, y, 'mirage'); ctx.phrases.push(tag + '水たまりが蜃気楼になった'); if (on('E2')) (ctx.labMirage = ctx.labMirage || []).push([x, y]); return true; }
      if (t === 'ice') { setTile(s, x, y, 'puddle'); ctx.phrases.push(tag + '氷が溶けて水たまりになった'); return true; }
      if (I.isPlant(t)) { setTile(s, x, y, 'fire'); ctx.phrases.push(tag + tileName(t) + 'が燃えた'); return true; }
      if (t === 'mountain') { ctx.phrases.push(tag + '山に火が点いた'); I.doFunka(s, x, y, ctx, ev, {}); return true; }
      if (t === 'empty') { setTile(s, x, y, 'smallfire'); return true; }
      if (t === 'smallfire' && B.grow.enabled) { setTile(s, x, y, 'fire'); return true; }
      return touchFireExtra(s, x, y, t, dir, ctx, ev, tag);
      return false;
    }

    // C6: 燃え移りの先に死の森があれば、火が当たったことにする（オバケヤシキ）
    function timeHaunt(s, cells, ev) {
      var ctx = I.newShot();
      cells.forEach(function (c) {
        if (getTile(s, c[0], c[1]) !== 'deadforest') return;
        ev.push({ type: 'kindle', cells: [c], text: '【ラボ】燃え移りの炎が死の森に届いた' });
        I.doHaunt(s, c[0], c[1], ctx, ev);
      });
      I.applyHits(s, ctx, ev);
    }

    // C5: 予測の「育っていれば」（一段の舞台に最後の一手を構えたとき）
    function noteOneStage(ctx, t, magic) {
      if (!on('C5')) return;
      if (t === 'hillsakura' && magic === 'wind') ctx.notes.push('育っていれば（山の桜）: 桜吹雪が扇3列・威力20');
      if (t === 'thicket' && magic === 'dark') ctx.notes.push('育っていれば（森）: 死の森になる');
    }

    // ---------------------------------------------------------------
    // A 地形（足場・壁・隠れ場所）
    // ---------------------------------------------------------------
    var HIGH = { hill: true, mountain: true, volcano: true, sakura: true, hillsakura: true, snowmt: true, pillar: true };
    function opposite(d) { return { up: 'down', down: 'up', left: 'right', right: 'left' }[d]; }
    function heavy(u) { return !!u && ((u.size || 1) > 1 || (on('D7') && u.body === 'rock')); }

    // 移動の探し方をラボのものにするか（今の BFS と同じ結果になる場面でも、案がオンなら使う）
    function useLabReach(s, u) {
      return on('A2') || on('A5') || on('A6') || on('F2') || on('B20') || on('B21') || on('D4') || on('D7') || (u.size || 1) > 1 || thornActive(s) || (on('M0') && !!u.labAfter);   // L: 茨の牢・M: 撃ったあとに動く
    }
    // 入ると止まる自然（泥沼・丘。A5: 森、B21: 深い森）
    function moveStops(t) { return t === 'mud' || t === 'hill' || (on('A5') && t === 'forest') || (on('B21') && t === 'deepforest'); }
    // 歩いて入ると滑る自然（A2: 氷、B20: 霜）
    function slides(t) { return (on('A2') && t === 'ice') || (on('B20') && t === 'frost'); }
    // u が (x,y) に立てるか（大きい敵は体の全部のマス。D4: 大きい敵は崩せる自然も通れる）
    function canStandAt(s, u, x, y) {
      var n = u.size || 1;
      for (var dy = 0; dy < n; dy++) for (var dx = 0; dx < n; dx++) {
        var cx = x + dx, cy = y + dy;
        if (!inBounds(s, cx, cy)) return false;
        var t = getTile(s, cx, cy);
        if (!I.canEnter(u, t) && !(n > 1 && on('D4') && CRUSH[t])) return false;
        var o = unitAt(s, cx, cy);
        if (o && o.id !== u.id) return false;
      }
      return true;
    }
    function cellsAt(u, x, y) { var n = u.size || 1, out = []; for (var dy = 0; dy < n; dy++) for (var dx = 0; dx < n; dx++) out.push([x + dx, y + dy]); return out; }
    function anyTile(s, u, x, y, f) { return cellsAt(u, x, y).some(function (c) { return f(getTile(s, c[0], c[1])); }); }
    // F2: 風のマスの向き（風を置いたときに覚える）
    function windDir(s, x, y) { return s.labWind ? s.labWind[idx(s, x, y)] : undefined; }

    // 動けるマス（ラボ版）。dist { "x,y": 歩数 }、order（見つけた順）、prev（ひとつ前）、pass（滑って通り過ぎたマス）
    //   コストの小さい順・同じなら見つけた順に広げる（全部1歩なら今の BFS と同じ順になる）
    function reach(s, u) {
      var dist = {}, order = [], prev = {}, pass = {}, seqOf = {};
      var k0 = key(u.x, u.y);
      dist[k0] = 0; order.push([u.x, u.y]); seqOf[k0] = 0;
      if (u.stuck || thornCaged(s, u)) return { dist: dist, order: order, prev: prev, pass: pass };   // L: 茨の牢では動けない
      var mv = on('M0') && u.labAfter ? u.labAfter.move : u.move;   // M: 撃ったあとに動ける歩数（2回撃てるなら0）
      var open = [{ x: u.x, y: u.y, c: 0, seq: 0 }], seq = 1, done = {};
      while (open.length) {
        var bi = 0;
        for (var i = 1; i < open.length; i++) if (open[i].c < open[bi].c || (open[i].c === open[bi].c && open[i].seq < open[bi].seq)) bi = i;
        var cur = open.splice(bi, 1)[0], ck = key(cur.x, cur.y);
        if (done[ck] || dist[ck] !== cur.c) continue;
        done[ck] = true;
        if (cur.c >= mv) continue;
        if (cur.c > 0 && anyTile(s, u, cur.x, cur.y, moveStops)) continue;
        DIR_ORDER.forEach(function (d) {
          var D = DIRS[d], nx = cur.x + D.dx, ny = cur.y + D.dy;
          if (!canStandAt(s, u, nx, ny)) return;
          var cost = 1, passed = [];
          if (on('A6') && anyTile(s, u, nx, ny, function (t) { return t === 'puddle'; })) cost = 2;   // A6: 浅瀬は2歩
          var w = on('F2') ? windDir(s, nx, ny) : undefined;
          if (w && d === opposite(w)) cost = 2;                                                          // F2: 向かい風は2歩で1マス
          var lx = nx, ly = ny;
          if (w && d === w && canStandAt(s, u, nx + D.dx, ny + D.dy)) { passed.push([lx, ly]); lx += D.dx; ly += D.dy; }   // F2: 追い風は1歩で2マス
          var guard = 0;
          while (slides(getTile(s, lx, ly)) && canStandAt(s, u, lx + D.dx, ly + D.dy) && guard++ < 30) { passed.push([lx, ly]); lx += D.dx; ly += D.dy; }   // A2: 滑る
          var nc = cur.c + cost, nk = key(lx, ly);
          if (nc > mv) return;
          if (dist[nk] === undefined || nc < dist[nk]) {
            if (dist[nk] === undefined) { order.push([lx, ly]); seqOf[nk] = seq; }
            dist[nk] = nc; prev[nk] = ck; pass[nk] = passed;
            open.push({ x: lx, y: ly, c: nc, seq: seq++ });
          }
        });
      }
      // 見つけた順は「歩数 → 見つけた順」（今の BFS の順と同じ並び）
      order.sort(function (a, b) { var ka = key(a[0], a[1]), kb = key(b[0], b[1]); return dist[ka] - dist[kb] || seqOf[ka] - seqOf[kb]; });
      return { dist: dist, order: order, prev: prev, pass: pass };
    }
    // reach の結果から、from → to の通ったマス（滑って通ったマスも）
    function pathOf(r, from, to) {
      var out = [], k = key(to[0], to[1]), guard = 0;
      while (k && k !== key(from[0], from[1]) && guard++ < 100) {
        var c = k.split(',').map(Number);
        out.unshift(c);
        (r.pass[k] || []).slice().reverse().forEach(function (p) { out.unshift(p); });
        k = r.prev[k];
      }
      return out;
    }

    // 泥沼に入ったとき（A11: 重い者は2回休む。D7: 浮いている体ははまらない）。true なら今の処理をしない
    function mudGrip(s, u, ev) {
      if (on('D7') && u.body === 'float') { ev.push({ type: 'info', id: u.id, cells: [[u.x, u.y]], text: '【ラボ】' + unitLabel(s, u) + 'は浮いているので泥沼にはまらない' }); return true; }
      if (on('A11') && heavy(u)) { u.stuck = 2; ev.push({ type: 'mud', id: u.id, cells: [[u.x, u.y]], text: '【ラボ】' + unitLabel(s, u) + 'は重いので泥沼に深くはまった（次の移動は2回休み）' }); return true; }
      return false;
    }
    // A11: 重い者が氷に乗ると、氷が割れて水たまりに戻り、足を取られる
    function heavyOnIce(s, u, ev) {
      if (!on('A11') || !heavy(u)) return;
      var cells = unitCells(u).filter(function (c) { return inBounds(s, c[0], c[1]) && getTile(s, c[0], c[1]) === 'ice'; });
      if (!cells.length) return;
      cells.forEach(function (c) { setTile(s, c[0], c[1], 'puddle'); });
      u.stuck = true;
      ev.push({ type: 'mud', id: u.id, cells: cells, text: '【ラボ】' + unitLabel(s, u) + 'の重みで氷が割れた（水たまり' + cells.length + 'マス。次の移動は1回休み）' });
    }
    var afterMoveMore = [];   // D でうしろに足す（足跡・崩す・動いた者）
    function afterMove(s, u, from, to, ev) {
      heavyOnIce(s, u, ev);
      afterMoveMore.forEach(function (f) { f(s, u, from, to, ev); });
    }
    function afterPush(s, o, ev) { heavyOnIce(s, o, ev); if (on('M0')) mTrapCheck(s, o, ev); }   // M5: 置いた魔法に押しこまれた

    // 隠れているか（A3 森・A8 高台から見える・B17 砂嵐・B20 暗がり・B21 深い森・I1 照らされた）。ラボで変わらないときは undefined
    function hidden(s, u, viewer, forTarget) {
      if (!(on('A3') || on('A8') || on('B17') || on('B20') || on('B21') || on('I1'))) return undefined;
      var t = getTile(s, u.x, u.y);
      if (on('I1') && u.labLit) return false;
      var see = !!viewer && on('A8') && HIGH[getTile(s, viewer.x, viewer.y)];
      if (t === 'mirage') return !see;
      if (forTarget) return false;   // お題の的は森の中でも的のまま
      if ((on('A3') && t === 'forest') || (on('B21') && t === 'deepforest') || ((on('B17') || non()) && t === 'sandstorm') || (on('B20') && t === 'gloom')) return !see;
      return false;
    }

    // A7: 雷の形の中に高い所があれば、その最初のマスへ先に落ちる
    function highFirst(s, cells) {
      var i = -1;
      cells.some(function (c, j) { if (HIGH[getTile(s, c[0], c[1])]) { i = j; return true; } return false; });
      if (i <= 0) return cells;
      return [cells[i]].concat(cells.slice(0, i)).concat(cells.slice(i + 1));
    }

    // A12: 自分の魔法の自然
    var OWN = { grass: ['thicket', 'forest'], earth: ['hill', 'mountain'], water: ['puddle'], fire: ['fire'], wind: ['breeze', 'gale'], ice: ['ice'],
      forestm: ['thicket', 'forest'], rock: [], vine: ['vinebridge'], rain: ['puddle'], metal: [] };
    function onOwnNature(s, u) {
      var list = OWN[u.magic] || [];
      return list.indexOf(getTile(s, u.x, u.y)) >= 0;
    }
    // 盤面の印（バリア中の駒の輪）
    function barrier(s, u) { return on('A12') && u.side !== 'object' && onOwnNature(s, u); }

    // 闇（吸う）のラボ版（A10 死の森は網・B13 底なし沼・B19 かまいたち・B20 暗がり・G3 闇の姿）
    function useLabDark() { return on('A10') || on('B13') || on('B19') || on('B20') || on('G2') || on('G3'); }
    var darkTargets = null;   // G3 でうしろに足す
    var darkExtra = [];       // B でうしろに足す
    function darken(s, u, facing, ctx, ev) {
      var cells = I.castCells(s, u, facing);
      var list = darkTargets ? darkTargets(s, u, facing, cells) : cells.slice(0, 1);
      list.forEach(function (c) { darkOne(s, u, c, facing, ctx, ev); });
    }
    function darkOne(s, u, c, facing, ctx, ev) {
      var x = c[0], y = c[1];
      ctx.cells.push([x, y]);
      var o = unitAt(s, x, y);
      if (o) addHit(ctx, o, u.power, 'direct');
      var t = getTile(s, x, y);
      for (var i = 0; i < darkExtra.length; i++) if (darkExtra[i](s, u, x, y, t, o, facing, ctx, ev)) return;   // B13・B19・B20
      noteOneStage(ctx, t, 'dark');
      if (on('A10') && t === 'forest') { toDeadForest(s, x, y, ctx, ev); t = 'deadforest'; }
      var net = on('A10') && t === 'deadforest' ? connected(s, x, y, 'deadforest') : [];
      var moved = pullToward(s, [x, y], B.dark.pullRange, net, ev, 'は闇に引き寄せられた');
      if (moved.length) ctx.phrases.push('【新案】まわりの' + moved.length + '人を引き寄せた' + (net.length > 1 ? '【ラボ: 死の森の網】' : ''));
      if (!on('A10') && t === 'forest') toDeadForest(s, x, y, ctx, ev);
    }
    function toDeadForest(s, x, y, ctx, ev) {
      var dead = connected(s, x, y, 'forest');
      dead.forEach(function (d) { setTile(s, d[0], d[1], 'deadforest'); });
      ctx.phrases.push('【新案】森の命を吸って、つながった森' + dead.length + 'マスが死の森になった');
      ev.push({ type: 'kindle', isNew: true, cells: dead, text: '【新案】死の森' + dead.length + 'マス（火を点けるとオバケヤシキ）' });
    }
    // 引き寄せ（今の darkPull と同じ動き）。net: そのマスの上にいる者は、距離に関係なく引き寄せる（A10）
    function pullToward(s, center, range, net, ev, why) {
      var inNet = {};
      (net || []).forEach(function (c) { inNet[key(c[0], c[1])] = true; });
      var dist = function (x, y) { return Math.abs(x - center[0]) + Math.abs(y - center[1]); };
      var near = s.units.filter(function (u) {
        if (I.isFixed(u)) return false;
        var d = dist(u.x, u.y);
        return d >= 2 && (d <= range || inNet[key(u.x, u.y)]);
      });
      near.sort(function (a, b) { return dist(a.x, a.y) - dist(b.x, b.y); });
      var moved = [];
      near.forEach(function (u) {
        var d0 = dist(u.x, u.y);
        var steps = DIR_ORDER.map(function (d) { return DIRS[d]; }).filter(function (D) {
          var nx = u.x + D.dx, ny = u.y + D.dy;
          if (nx === center[0] && ny === center[1]) return false;
          if ((u.size || 1) > 1) return dist(nx, ny) < d0 && canStandAt(s, u, nx, ny);   // D3: 大きい敵は体の全部が動けるときだけ
          return inBounds(s, nx, ny) && dist(nx, ny) < d0 && I.isPassable(getTile(s, nx, ny)) && !unitAt(s, nx, ny);
        });
        if (!steps.length) return;
        var from = [u.x, u.y];
        u.x += steps[0].dx; u.y += steps[0].dy;
        moved.push(u);
        ev.push({ type: 'push', id: u.id, ok: true, from: from, to: [u.x, u.y], text: '【新案】' + unitLabel(s, u) + why + (d0 > range ? '（死の森の網）' : '') });
        if (getTile(s, u.x, u.y) === 'mud') I.enterMud(s, u, ev);
      });
      return moved;
    }

    // 置く・点ける魔法の1マスの作用（ラボ）。true なら今の作用はしない
    var placeMore = [];   // B・I でうしろに足す
    function placeCell(s, u, x, y, t, o, facing, ctx, ev) {
      if (on('A11') && u.magic === 'earth' && t === 'ice' && !o) { setTile(s, x, y, 'puddle'); ctx.phrases.push('【ラボ】土の重みで氷が割れて水たまりになった'); return true; }
      for (var i = 0; i < placeMore.length; i++) if (placeMore[i](s, u, x, y, t, o, facing, ctx, ev)) return true;
      return false;
    }

    // ---------------------------------------------------------------
    // ダメージの決まり（A4 森は盾・A12 バリア・D3 大きい敵・D7 体の違い …）
    // ---------------------------------------------------------------
    var LAB_SPREAD_BLOCK = {};
    var CRUSH = {};    // D4 で埋める
    var hitMore = [];  // D でうしろに足す
    function hitRules(ctx, u, amount, src, cell) {
      var s = ctx.s;
      if (s && src === 'direct') {
        if (on('A4') && getTile(s, u.x, u.y) === 'forest') { ctx.phrases.push('【ラボ】' + unitLabel(s, u) + 'は森の枝葉に守られた（直撃なし）'); return null; }
        if (on('A12') && onOwnNature(s, u)) { ctx.phrases.push('【ラボ】' + unitLabel(s, u) + 'は自分の自然の上でバリア（直撃なし）'); return null; }
      }
      for (var i = 0; i < hitMore.length; i++) { amount = hitMore[i](ctx, u, amount, src, cell); if (amount === null) return null; }
      return amount;
    }
    // E9: 閉じこめられた者は予告も撃つこともできない。閉じこめた瞬間に出ていた予告は消える
    function enclose(s, o, ev) {
      if (!on('E9') || !o || o.side === 'object') return;
      if (o.intent) {
        o.intent = false;
        ev.push({ type: 'info', id: o.id, cells: [[o.x, o.y]], text: '【ラボ】' + unitLabel(s, o) + 'は閉じこめられて外が見えない。予告が消えた' });
      } else ev.push({ type: 'info', id: o.id, cells: [[o.x, o.y]], text: '【ラボ】' + unitLabel(s, o) + 'は閉じこめられた（中にいる間は撃てない）' });
    }
    // I8: 金の柱も雷を通す
    function pillarNet(s, net, seen) { return net; }
    // ラボで足した自然に「火が当たった」
    function touchFireExtra(s, x, y, t, dir, ctx, ev, tag) { return false; }

    // ---------------------------------------------------------------
    // D 敵のつくり（欲・体・大きさ・強さ・敵だけの魔法）
    // ---------------------------------------------------------------
    // D1 欲: 敵の個性「狙い」に足す（今の 人数・近い人・自然・的 も欲として選べる）
    I.PERSONA.aim.forest = '森（欲）';
    I.PERSONA.aim.own = '自分の自然（欲）';
    I.PERSONA.aim.flee = '逃げる（欲）';
    I.PERSONA.aim.moved = '動いた者（欲）';
    var DESIRE = { forest: true, own: true, flee: true, moved: true };
    // D1 欲「自分の自然」: 魔法ごとの、その上・隣から撃ちたい自然
    var OWN_D1 = { water: ['river', 'puddle'], earth: ['mountain', 'hill'], fire: ['fire', 'smallfire'], grass: ['forest', 'thicket'],
      wind: ['breeze', 'gale'], ice: ['ice'], dark: ['deadforest'], thunder: ['river', 'puddle'], mount: ['mountain'] };
    // D4 力ずくで崩す: 大きい敵が通ると、こう壊れる
    function crushTo(t) {
      if (t === 'forest') return B.grow.enabled ? 'thicket' : 'empty';
      if (t === 'mountain') return B.grow.enabled ? 'hill' : 'empty';
      if (t === 'hill') return 'empty';
      if (t === 'ice') return 'puddle';
      if (t === 'sakura') return 'mountain';
      if (t === 'hillsakura') return 'hill';
      if (t === 'deepforest') return 'forest';
      return null;
    }
    ['forest', 'mountain', 'hill', 'ice', 'sakura', 'hillsakura', 'deepforest'].forEach(function (t) { CRUSH[t] = true; });
    // D8: 敵だけの魔法「戻す」
    I.MAGIC_INFO.revert = { name: '戻す', verb: '戻す' };
    I.MAGICS.push('revert');
    var REVERT = { fire: 'forest', volcano: 'mountain', ice: 'river', deadforest: 'forest', forest: 'thicket', mountain: 'hill', gale: 'breeze', sakura: 'mountain',
      hillsakura: 'hill', firewhirl: 'breeze', haunted: 'deadforest', mirage: 'puddle', river: 'puddle', mud: 'puddle', snowmt: 'mountain', deepforest: 'forest', icewall: 'ice' };
    SRC_ADD.part = '（体の一部だけ）';

    function sees(s, e) { return I.alliesOf(s).filter(function (a) { return !I.hidden(s, a, e); }); }
    function mdist(a, b) { return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]); }
    function cmpArr(a, b) { for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }
    // 道のり（e が自分の足で行ける。goals のどれかまで）
    function fieldTo(s, e, goals) {
      var f = {}, q = [];
      goals.forEach(function (g) { var k = key(g[0], g[1]); if (f[k] === undefined) { f[k] = 0; q.push(g); } });
      while (q.length) {
        var c = q.shift(), d = f[key(c[0], c[1])];
        neighbors(s, c[0], c[1]).forEach(function (n) {
          var k = key(n.x, n.y);
          if (f[k] !== undefined || !I.canEnter(e, getTile(s, n.x, n.y))) return;
          var o = unitAt(s, n.x, n.y);
          if (o && o.id !== e.id) return;
          f[k] = d + 1; q.push([n.x, n.y]);
        });
      }
      return f;
    }
    function allCells(s, pred) {
      var out = [];
      for (var y = 0; y < I.rowsOf(s); y++) for (var x = 0; x < s.size; x++) if (pred(getTile(s, x, y), x, y)) out.push([x, y]);
      return out;
    }
    // 候補（動けるマス × 向き）と、その1発の結果
    function candidates(s, e) {
      var info = I.reachInfo(s, e), out = [];
      info.order.forEach(function (pos) {
        var d = info.dist[key(pos[0], pos[1])];
        DIR_ORDER.forEach(function (dir) { out.push({ to: pos, dir: dir, dist: d, r: I.trialShot(s, e, pos[0], pos[1], dir) }); });
      });
      return { info: info, list: out, safe: out.filter(function (c) { return !c.r.harm; }) };
    }
    function pickBest(list, score) {
      var best = null;
      list.forEach(function (c) {
        var sc = score(c);
        if (!sc) return;
        var d = best ? cmpArr(sc, best.sc) : 1;
        if (!best || d > 0 || (d === 0 && c.dist < best.c.dist)) best = { c: c, sc: sc };
      });
      return best ? best.c : null;
    }
    // ゴールに一番近づけるマスへ行き、ゴールの方を向く（巻き込まない向き）
    function approach(s, e, cs, goals, reason, extra) {
      var f = fieldTo(s, e, goals);
      var spots = cs.info.order.map(function (pos) {
        var fd = f[key(pos[0], pos[1])];
        if (fd === undefined) fd = 100 + Math.min.apply(null, goals.map(function (g) { return mdist(g, pos); }));
        return { pos: pos, fd: fd, dist: cs.info.dist[key(pos[0], pos[1])] };
      }).sort(function (a, b) { return a.fd - b.fd || a.dist - b.dist; });
      var pick = spots[0];
      var g = goals.slice().sort(function (a, b) { return mdist(a, pick.pos) - mdist(b, pick.pos); })[0];
      var dir = I.faceToward(pick.pos[0], pick.pos[1], { x: g[0], y: g[1] });
      var safeAt = function (d) { return cs.safe.some(function (c) { return c.to[0] === pick.pos[0] && c.to[1] === pick.pos[1] && c.dir === d; }); };
      if (!safeAt(dir)) dir = DIR_ORDER.filter(safeAt)[0] || dir;
      var p = { to: pick.pos, dir: dir, dist: pick.dist, kind: 'approach', reason: reason };
      Object.keys(extra || {}).forEach(function (k) { p[k] = extra[k]; });
      return p;
    }

    // D1・D9: 欲を持つ敵・大技を組む敵の手の選び方。ほかの敵は null（今の選び方）
    function planEnemy(s, e) {
      for (var pi = 0; pi < (planMore || []).length; pi++) { var pm = planMore[pi](s, e); if (pm) return pm; }   // H9 拠点を取り返す など
      if (on('D9') && e.labStage) { var p9 = planCombo(s, e); if (p9) return p9; }
      if (!on('D1') || !DESIRE[e.aim]) return null;
      var allies = sees(s, e);
      if (!allies.length && e.aim !== 'flee') return { to: [e.x, e.y], dir: e.facing, dist: 0, kind: 'lost' };
      var cs = candidates(s, e);
      if (e.aim === 'forest') {
        var plants = allCells(s, function (t) { return I.isPlant(t); });
        var burn = function (c) { var n = 0; for (var i = 0; i < c.r.before.length; i++) if (I.isPlant(c.r.before[i]) && !I.isPlant(c.r.after[i])) n++; return n; };
        var best = pickBest(cs.safe, function (c) { var b = burn(c); return b > 0 ? [b, c.r.allyHits, c.r.allyDmg] : null; });
        if (best) return { to: best.to, dir: best.dir, dist: best.dist, kind: 'nature', reason: '森を燃やしに行く' };
        if (!plants.length) return null;
        return approach(s, e, cs, plants, '森へ向かう');
      }
      if (e.aim === 'own') {
        var own = OWN_D1[e.magic] || [];
        var ownCells = allCells(s, function (t) { return own.indexOf(t) >= 0; });
        if (!ownCells.length) return null;
        var nearOwn = function (p) { return ownCells.some(function (c) { return mdist(c, p) <= 1; }); };
        var spotCs = cs.safe.filter(function (c) { return nearOwn(c.to); });
        var name = I.tileName(own[0]);
        var b2 = pickBest(spotCs, function (c) { return c.r.allyHits > 0 ? [c.r.allyHits, c.r.allyDmg] : null; });
        if (b2) return { to: b2.to, dir: b2.dir, dist: b2.dist, kind: 'attack', reason: name + 'のそばから撃つ' };
        if (spotCs.length) {
          var sc = spotCs.slice().sort(function (a, b) { return a.dist - b.dist; })[0];
          var near = allies.slice().sort(function (a, b) { return mdist([a.x, a.y], sc.to) - mdist([b.x, b.y], sc.to); })[0];
          var dir = near ? I.faceToward(sc.to[0], sc.to[1], near) : sc.dir;
          if (!spotCs.some(function (c) { return c.to === sc.to && c.dir === dir; })) dir = sc.dir;
          return { to: sc.to, dir: dir, dist: sc.dist, kind: 'approach', reason: name + 'のそばで構える' };
        }
        return approach(s, e, cs, ownCells, name + 'へ向かう');
      }
      if (e.aim === 'flee') {
        var chase = s.labChase && s.labChase.runner === e.id ? s.labChase : null;
        var threats = allies.map(function (a) { return [a.x, a.y]; }).concat(decoySpots(s));
        var spot;
        if (chase) {
          var fe = fieldTo(s, e, chase.exits);
          spot = cs.info.order.slice().sort(function (a, b) {
            var da = fe[key(a[0], a[1])], db = fe[key(b[0], b[1])];
            if (da === undefined) da = 999; if (db === undefined) db = 999;
            return da - db || cs.info.dist[key(a[0], a[1])] - cs.info.dist[key(b[0], b[1])];
          })[0];
        } else {
          var away = function (p) { return threats.length ? Math.min.apply(null, threats.map(function (t) { return mdist(t, p); })) : 0; };
          spot = cs.info.order.slice().sort(function (a, b) { return away(b) - away(a) || cs.info.dist[key(a[0], a[1])] - cs.info.dist[key(b[0], b[1])]; })[0];
        }
        var adj = allies.filter(function (a) { return mdist([a.x, a.y], spot) === 1; });
        var hit = cs.safe.filter(function (c) { return c.to === spot && adj.some(function (a) { return c.r.allyIds.indexOf(a.id) >= 0; }); })[0];
        var reason = chase ? '逃げ口へ向かう' : '逃げる';
        if (hit) return { to: spot, dir: hit.dir, dist: cs.info.dist[key(spot[0], spot[1])], kind: 'attack', reason: reason + '（隣の者を撃つ）' };
        var fdir = threats.length ? I.faceToward(spot[0], spot[1], { x: 2 * spot[0] - threats[0][0], y: 2 * spot[1] - threats[0][1] }) : e.facing;
        return { to: spot, dir: fdir, dist: cs.info.dist[key(spot[0], spot[1])], kind: 'flee', noIntent: true, reason: reason };
      }
      if (e.aim === 'moved') {
        var movedAllies = allies.filter(function (a) { return a.labMoved === s.turn - 1; });
        if (!movedAllies.length) return null;
        var tgt = movedAllies.slice().sort(function (a, b) { return mdist([a.x, a.y], [e.x, e.y]) - mdist([b.x, b.y], [e.x, e.y]); })[0];
        var b3 = pickBest(cs.safe, function (c) { return c.r.allyIds.indexOf(tgt.id) >= 0 ? [1, c.r.allyDmg] : null; });
        var label = unitLabel(s, tgt);
        if (b3) return { to: b3.to, dir: b3.dir, dist: b3.dist, kind: 'attack', target: tgt.id, reason: '動いた' + label + 'を狙う' };
        return approach(s, e, cs, [[tgt.x, tgt.y]], '動いた' + label + 'へ向かう', { target: tgt.id });
      }
      return null;
    }
    // E2 の偽の姿（逃げる敵は偽の姿からも逃げる）。E でうしろに足す
    function decoySpots(s) { return decoyList ? decoyList(s).map(function (d) { return d.at; }) : []; }
    var decoyList = null;

    // D9: 舞台（風）→ 決め手（火）の組み合わせで、火の渦が味方に当たる手を探す
    function planCombo(s, e) {
      var info = I.reachInfo(s, e), best = null;
      info.order.forEach(function (pos) {
        DIR_ORDER.forEach(function (dir) {
          var sim = I.clone(s), su = I.findUnit(sim, e.id);
          su.x = pos[0]; su.y = pos[1]; su.facing = dir;
          var main = su.magic;
          su.magic = e.labStage;
          var c1 = I.shoot(sim, su, dir, []);
          su = I.findUnit(sim, e.id);
          if (!su) return;
          su.magic = main;
          var harm = c1.order.some(function (id) { var t = I.findUnit(s, id); return t && t.side === 'enemy' && c1.hits[id].amount > 0; });
          var stageHits = c1.order.filter(function (id) { var t = I.findUnit(s, id); return t && t.side === 'ally' && c1.hits[id].amount > 0; }).length;
          var r = I.trialShot(sim, su, pos[0], pos[1], dir);
          // 舞台の1手目は、予告なしで撃つので、人には当てない（予告の前に味方を倒さない。撃つ前に読めるように）
          if (harm || r.harm || stageHits) return;
          var fin = r.ctx.finishers.length;
          var sc = [fin ? 1 : 0, r.allyHits, r.allyDmg, -info.dist[key(pos[0], pos[1])]];
          if (!fin || !r.allyHits) return;
          if (!best || cmpArr(sc, best.sc) > 0) best = { sc: sc, to: pos, dir: dir, dist: info.dist[key(pos[0], pos[1])], fin: r.ctx.finishers[0].name };
        });
      });
      if (!best) return null;
      return { to: best.to, dir: best.dir, dist: best.dist, kind: 'attack', labStage: true,
        reason: I.magicName(e.labStage) + 'で舞台を作り、' + best.fin + 'を組む' };
    }
    // D9: 舞台の魔法を、移動のすぐあとに撃つ
    function fireStage(s, e, ev, step) {
      var main = e.magic;
      e.magic = e.labStage;
      ev.push({ type: 'phase', text: '【ラボ】' + unitLabel(s, e) + 'が舞台を作る（大技の1手目）' });
      I.shoot(s, e, e.facing, ev);
      var e2 = I.findUnit(s, e.id);
      if (e2) e2.magic = main;
      step();
    }
    // D1: 予告に理由を一言（ログと、盤面の吹き出し）
    function intentReason(s, e, plan, ev) {
      if (!plan || !plan.reason || !(on('D1') || on('D9'))) { if (e.labReason) delete e.labReason; return ''; }
      e.labReason = plan.reason;
      if (plan.noIntent) ev.push({ type: 'info', id: e.id, cells: [[e.x, e.y]], text: '【ラボ】' + unitLabel(s, e) + 'は' + plan.reason + '（撃たない）' });
      return '（' + plan.reason + '）';
    }
    var cannotMore = [];   // E9 でうしろに足す
    function cannotIntent(s, e, ev) { return cannotMore.some(function (f) { return f(s, e, ev); }); }

    // D3: 大きい敵の、魔法の起点（前の辺のまん中あたり。2×2 なら術者から見て左寄り）
    var originMore = [];   // F3・G6 でうしろに足す
    function castOrigin(s, u, facing) {
      if ((u.size || 1) > 1) {
        var F = DIRS[facing], R = [-F.dy, F.dx], n = u.size;
        var cells = unitCells(u).filter(function (c) {
          var f = (c[0] - u.x) * F.dx + (c[1] - u.y) * F.dy;   // 前ほど大きい
          var mx = Math.max.apply(null, unitCells(u).map(function (q) { return (q[0] - u.x) * F.dx + (q[1] - u.y) * F.dy; }));
          return f === mx;
        }).sort(function (a, b) { return (a[0] * R[0] + a[1] * R[1]) - (b[0] * R[0] + b[1] * R[1]); });
        var o = cells[Math.floor((n - 1) / 2)];
        return { x: o[0], y: o[1] };
      }
      for (var i = 0; i < originMore.length; i++) { var r = originMore[i](s, u, facing); if (r) return r; }
      return null;
    }
    // D5: めちゃ強い敵の広い形。D8: 戻すの形（正面2マス）。G2・G3 でうしろに足す
    var BOSS = { fire: [[0, 1], [-1, 2], [0, 2], [1, 2], [-2, 3], [-1, 3], [0, 3], [1, 3], [2, 3]], earth: [[-2, 2], [-1, 2], [0, 2], [1, 2], [2, 2]] };
    var cellsMore = [];
    function shapeAt(s, shp, o, facing) {
      var out = [];
      shp.map(function (p, i) { return { rx: p[0], ry: p[1], i: i }; })
        .sort(function (a, b) { return (Math.abs(a.rx) + Math.abs(a.ry)) - (Math.abs(b.rx) + Math.abs(b.ry)) || a.i - b.i; })
        .forEach(function (p) { var d = I.rotate(facing, p.rx, p.ry); var x = o.x + d[0], y = o.y + d[1]; if (inBounds(s, x, y)) out.push([x, y]); });
      return out;
    }
    function castCells(s, u, o, facing) {
      if (u.labBoss && on('D5') && BOSS[u.magic]) return shapeAt(s, BOSS[u.magic], o, facing);
      if (u.magic === 'revert') return shapeAt(s, [[0, 1], [0, 2]], o, facing);
      for (var i = 0; i < cellsMore.length; i++) { var r = cellsMore[i](s, u, o, facing); if (r) return r; }
      return null;
    }
    // D5: めちゃ強い敵のHP。F1 でうしろに足す
    var confMore = [];
    function unitConf(u, c) {
      var out = c;
      if (u.labBoss && on('D5')) out = { hp: B.lab.D5.hp, power: c.power, move: c.move };
      for (var i = 0; i < confMore.length; i++) out = confMore[i](u, out) || out;
      return out;
    }
    // D3: 大きい敵を押す（体の全部が動けるときだけ）
    function pushBig(s, o, dir, ev, okText) {
      var D = DIRS[dir];
      if (!canStandAt(s, o, o.x + D.dx, o.y + D.dy)) { ev.push({ type: 'push', id: o.id, ok: false, text: unitLabel(s, o) + 'は押されなかった（大きい体が通れない）' }); return false; }
      var from = [o.x, o.y];
      o.x += D.dx; o.y += D.dy;
      ev.push({ type: 'push', id: o.id, ok: true, from: from, to: [o.x, o.y], text: okText });
      if (unitCells(o).some(function (c) { return getTile(s, c[0], c[1]) === 'mud'; })) I.enterMud(s, o, ev);
      afterPush(s, o, ev);
      return true;
    }
    // ラボ用シナリオのユニットの項目。size: 'D3' は、D3 がオンなら調整の大きさ（2 か 3）、オフなら1マス
    function labValue(f, v) {
      if (f === 'size' && v === 'D3') return on('D3') ? Math.max(1, Math.min(3, B.lab.D3.size || 2)) : 1;
      return JSON.parse(JSON.stringify(v));
    }
    function onFire(s, u) { return unitCells(u).some(function (c) { var t = getTile(s, c[0], c[1]); return t === 'fire' || t === 'firewhirl'; }); }
    // D3: 決め手の20の範囲が、大きい体の全部を覆ったか（覆っていなければ弱い5）
    hitMore.push(function (ctx, u, amount, src, cell) {
      if ((u.size || 1) > 1 && src === 'finisher' && cell && amount >= B.fire.strongDamage) {
        ctx.labCover = ctx.labCover || {};
        var c = ctx.labCover[u.id] = ctx.labCover[u.id] || {};
        c[key(cell[0], cell[1])] = true;
      }
      // D7: 水の体は燃え広がりでは倒れない
      if (on('D7') && u.body === 'water' && src === 'finisher' && ctx.curFin === '燃え広がり') return Math.min(amount, B.fire.weakDamage);
      return amount;
    });
    function beforeApply(s, ctx, ev) {
      if (on('M0')) mGuard(s, ctx, ev);   // M: 当たった者は相手の次の攻撃を防ぐ（城壁）
      if (on('L0')) finRing(s, ctx, ev);   // L 決めるの道: 決め手の範囲が広い（D3 の覆い方の前に足す）
      ctx.order.forEach(function (id) {
        var u = I.findUnit(s, id), h = ctx.hits[id];
        if (!u || (u.size || 1) <= 1 || h.src !== 'finisher' || h.amount < B.fire.strongDamage) return;
        var cover = Object.keys((ctx.labCover || {})[id] || {}).length;
        if (cover < u.size * u.size) { h.amount = B.fire.weakDamage; h.src = 'part'; }
      });
    }

    // 移動のあと（D1 動いた者・D4 力ずくで崩す・D6 足跡・D7 水の体は火を消す）
    afterMoveMore.push(function (s, u, from, to, ev) {
      if (on('D1') && u.side === 'ally') u.labMoved = s.turn;
      var bigCrush = on('D4') && (u.size || 1) > 1;
      var trail = on('D6') && (u.body === 'fire' || u.body === 'water');
      var douse = on('D7') && u.body === 'water';
      if (!bigCrush && !trail && !douse) return;
      var ghost = I.clone(u); ghost.x = from[0]; ghost.y = from[1]; ghost.stuck = false;
      var r = reach(s, ghost);
      var path = [from].concat(pathOf(r, from, to));
      var covered = [], seen = {};
      path.forEach(function (p) { cellsAt(u, p[0], p[1]).forEach(function (c) { var k = key(c[0], c[1]); if (!seen[k]) { seen[k] = true; covered.push(c); } }); });
      var finalK = {};
      unitCells(u).forEach(function (c) { finalK[key(c[0], c[1])] = true; });
      if (bigCrush) {
        var broke = [];
        covered.forEach(function (c) { var t = getTile(s, c[0], c[1]), to2 = crushTo(t); if (to2) { setTile(s, c[0], c[1], to2); broke.push(c); } });
        if (broke.length) ev.push({ type: 'kindle', id: u.id, cells: broke, text: '【ラボ】' + unitLabel(s, u) + 'が力ずくで自然を崩して進んだ（' + broke.length + 'マス）' });
      }
      if (douse) {
        var put = covered.filter(function (c) { var t = getTile(s, c[0], c[1]); return t === 'fire' || t === 'smallfire'; });
        put.forEach(function (c) { setTile(s, c[0], c[1], 'empty'); });
        if (put.length) ev.push({ type: 'kindle', id: u.id, cells: put, text: '【ラボ】水の体の' + unitLabel(s, u) + 'が通って、火が消えた（' + put.length + 'マス）' });
      }
      if (trail) {
        var mark = u.body === 'fire' ? 'smallfire' : 'puddle', left = [];
        covered.forEach(function (c) { if (!finalK[key(c[0], c[1])] && getTile(s, c[0], c[1]) === 'empty' && !unitAt(s, c[0], c[1])) { setTile(s, c[0], c[1], mark); left.push(c); } });
        if (left.length) ev.push({ type: 'kindle', id: u.id, cells: left, text: '【ラボ】' + unitLabel(s, u) + 'の歩いた跡に' + I.tileName(mark) + '（' + left.length + 'マス）' });
      }
    });

    // D2・D4: 敵が次のターンに向かう先（ターン終了処理のあとの盤面で、敵の順に考えて動かす）
    function nextPaths(later) {
      if (!(on('D2') || on('D4'))) return undefined;
      var sim = I.clone(later), out = [];
      I.enemiesOf(sim).map(function (e) { return e.id; }).forEach(function (id) {
        var e = I.findUnit(sim, id);
        if (!e || e.stand && e.stand !== 'move') return;
        var plan = I.planEnemy(sim, e);
        if (!plan || !plan.to) return;
        var from = [e.x, e.y];
        var path = (plan.to[0] === e.x && plan.to[1] === e.y) ? [] : pathOf(reach(sim, e), from, plan.to);
        var crush = [];
        if (on('D4') && (e.size || 1) > 1) {
          var seen = {};
          [from].concat(path).forEach(function (p) { cellsAt(e, p[0], p[1]).forEach(function (c) { var k = key(c[0], c[1]); if (!seen[k] && crushTo(getTile(sim, c[0], c[1]))) { seen[k] = true; crush.push(c); } }); });
        }
        out.push({ id: id, from: from, to: plan.to, path: path, crush: crush, dir: plan.dir, reason: plan.reason });
        e.x = plan.to[0]; e.y = plan.to[1];   // 次の敵は、前の敵が動いたあとの盤面で考える
      });
      return out;
    }

    // ---------------------------------------------------------------
    // 新しい魔法・魔法の撃ち方（D8 戻す・G 強化と融合・I 新しい魔法 …）
    // ---------------------------------------------------------------
    var castMore = [];   // G・I でうしろに足す
    function castMagic(s, u, facing, ctx, ev) {
      if (on('L0')) shotStart(s, u, ctx, ev);   // L: 撃つ前の盤面を覚える（ターゲットの判定・作り手）
      for (var i = 0; i < castMore.length; i++) if (castMore[i](s, u, facing, ctx, ev)) return true;
      if (u.magic === 'revert') { revert(s, u, facing, ctx, ev); return true; }
      return false;
    }
    // D8 戻す: 当たった自然を一つ前の姿に戻す。一段の自然・空きには何も起きない。ユニットには直撃1
    function revert(s, u, facing, ctx, ev) {
      I.castCells(s, u, facing).forEach(function (c) {
        ctx.cells.push(c);
        var o = unitAt(s, c[0], c[1]);
        if (o) addHit(ctx, o, 1, 'direct');
        var t = getTile(s, c[0], c[1]), to = REVERT[t];
        if (t === 'forest' && !B.grow.enabled) to = 'empty';
        if (t === 'mountain' && !B.grow.enabled) to = 'empty';
        if (!to) return;
        setTile(s, c[0], c[1], to);
        ctx.phrases.push('【ラボ】' + I.tileName(t) + 'が' + I.tileName(to) + 'に戻った');
      });
      if (!ctx.phrases.length && !ctx.order.length) ctx.phrases.push('戻すものがなかった');
    }
    var afterShotMore = [];   // G7・I1 でうしろに足す
    function afterShot(s, u, facing, ctx, ev) { afterShotMore.forEach(function (f) { f(s, u, facing, ctx, ev); }); }

    // ---------------------------------------------------------------
    // E 敵との駆け引き（E2 偽の姿・E9 閉じこめ・E10 予告に一言）
    // ---------------------------------------------------------------
    // E2: 火で水たまりが蜃気楼になったマスを覚える（今の作用と同じことをして、覚えるだけ足す）
    placeMore.push(function (s, u, x, y, t, o, facing, ctx, ev) {
      if (!on('E2') || u.magic !== 'fire' || t !== 'puddle') return false;
      setTile(s, x, y, 'mirage');
      ctx.phrases.push('【新案】水たまりが蜃気楼になった');
      (ctx.labMirage = ctx.labMirage || []).push([x, y]);
      return true;
    });
    function mirageComp(s, cells) {
      var out = [], seen = {};
      cells.forEach(function (c) {
        if (getTile(s, c[0], c[1]) !== 'mirage') return;
        connected(s, c[0], c[1], 'mirage').forEach(function (m) { var k = key(m[0], m[1]); if (!seen[k]) { seen[k] = true; out.push(m); } });
      });
      return out;
    }
    // E2: 映る場所。火を撃った者から見て、蜃気楼のかたまりの一番奥のマス（同じなら術者の筋に近いマス）から reach マス先。
    //   通れない・蜃気楼・盤の外なら、手前へ1マスずつ戻して最初に立てるマス
    function mirrorSpot(s, u, facing, comp) {
      var F = DIRS[facing];
      var proj = function (c) { return (c[0] - u.x) * F.dx + (c[1] - u.y) * F.dy; };
      var side = function (c) { return Math.abs((c[0] - u.x) * -F.dy + (c[1] - u.y) * F.dx); };
      var edgeC = comp.slice().sort(function (a, b) { return proj(b) - proj(a) || side(a) - side(b); })[0];
      for (var k = Math.max(1, opt('E2', 'reach') || 2); k >= 1; k--) {
        var x = edgeC[0] + F.dx * k, y = edgeC[1] + F.dy * k;
        if (inBounds(s, x, y) && I.isPassable(getTile(s, x, y)) && getTile(s, x, y) !== 'mirage') return [x, y];
      }
      return null;
    }
    afterShotMore.push(function (s, u, facing, ctx, ev) {
      if (!on('E2') || !ctx.labMirage) return;
      var done = {};
      ctx.labMirage.forEach(function (c) {
        if (done[key(c[0], c[1])]) return;
        var comp = mirageComp(s, [c]);
        if (!comp.length) return;
        comp.forEach(function (m) { done[key(m[0], m[1])] = true; });
        var at = mirrorSpot(s, u, facing, comp);
        var inComp = {};
        comp.forEach(function (m) { inComp[key(m[0], m[1])] = true; });
        s.labMirror = (s.labMirror || []).filter(function (mr) { return !mr.from.some(function (f) { return inComp[key(f[0], f[1])]; }); });
        if (!at) { ev.push({ type: 'info', cells: comp, text: '【ラボ】蜃気楼の奥に立てる所がなく、姿は映らない' }); return; }
        s.labMirror.push({ at: at, from: comp });
        ev.push({ type: 'info', cells: [at], text: '【ラボ】蜃気楼が姿を映す場所ができた（映）。中に味方がいるあいだ、そこに偽の姿が立つ' });
      });
    });
    // E2: 今立っている偽の姿 [{ at, ids, id, x, y }]。蜃気楼が消えた映る場所は数えない。映る場所に誰かが立っていると、偽の姿は立たない
    function decoysOf(s) {
      if (!on('E2') || !s.labMirror) return [];
      var out = [];
      s.labMirror.forEach(function (mr, i) {
        var comp = mirageComp(s, mr.from);
        if (!comp.length) return;
        var inComp = {};
        comp.forEach(function (m) { inComp[key(m[0], m[1])] = true; });
        var inside = I.alliesOf(s).filter(function (a) { return unitCells(a).some(function (c) { return inComp[key(c[0], c[1])]; }); });
        if (!inside.length || unitAt(s, mr.at[0], mr.at[1])) return;
        out.push({ at: mr.at, ids: inside.map(function (a) { return a.id; }), id: 'decoy' + i, x: mr.at[0], y: mr.at[1], side: 'ally', decoy: true, magic: inside[0].magic, hp: 1 });
      });
      return out;
    }
    decoyList = decoysOf;
    // E2: 映る場所の印（蜃気楼が残っているもの）
    function mirrors(s) {
      if (!on('E2') || !s.labMirror) return [];
      return s.labMirror.filter(function (mr) { return mirageComp(s, mr.from).length > 0; }).map(function (mr) { return mr.at; });
    }
    // E2: 敵の魔法が偽の姿に当たった（何も起きない）
    afterShotMore.push(function (s, u, facing, ctx, ev) {
      if (!on('E2') || u.side !== 'enemy') return;
      decoysOf(s).forEach(function (d) {
        if (has(ctx.cells, d.x, d.y)) ev.push({ type: 'info', id: u.id, cells: [d.at], text: '【ラボ】' + unitLabel(s, u) + 'の魔法は偽の姿をすり抜けた（何も起きない）' });
      });
    });

    // E9: 閉じこめる自然（オバケヤシキ・火の渦・B13 底なし沼）
    function enclosing(t) { return t === 'haunted' || t === 'firewhirl' || (t === 'bog' && on('B13')); }
    function enclosedAt(s, u, at) {
      if (!on('E9') || !u) return false;
      var p = at || [u.x, u.y];
      return cellsAt(u, p[0], p[1]).concat(unitCells(u)).some(function (c) { return inBounds(s, c[0], c[1]) && enclosing(getTile(s, c[0], c[1])); });
    }
    cannotMore.push(function (s, e, ev) {
      if (!enclosedAt(s, e)) return false;
      ev.push({ type: 'info', id: e.id, cells: [[e.x, e.y]], text: '【ラボ】' + unitLabel(s, e) + 'は閉じこめられていて、外が見えない（予告できない）' });
      return true;
    });

    // E10: 敵の魔法ごとに「何があると何が起きるか」（mat は置く材料の名前、word は起きること）
    var E10_MAT = {
      fire: [{ t: ['forest', 'thicket'], mat: '森', word: '燃える' }, { t: ['breeze', 'gale'], mat: '風', word: '火の渦' }, { t: ['deadforest'], mat: '死の森', word: 'オバケヤシキ' }, { t: ['puddle'], mat: '水たまり', word: '蜃気楼' }],
      thunder: [{ t: ['river', 'puddle'], mat: '水', word: '感電' }, { t: ['forest'], mat: '森', word: '燃える' }],
      water: [{ t: ['firewhirl'], mat: '火の渦', word: 'センタクキ' }, { t: ['fire', 'smallfire'], mat: '炎', word: '消える' }],
      wind: [{ t: ['fire', 'smallfire'], mat: '炎', word: '燃え広がり' }, { t: ['sakura', 'hillsakura'], mat: '桜', word: '桜吹雪' }],
      earth: [{ t: ['river', 'puddle'], mat: '水', word: '泥沼' }],
      ice: [{ t: ['river', 'puddle'], mat: '水', word: '凍る' }],
      dark: [{ t: ['forest'], mat: '森', word: '死の森' }]
    };
    // E10: 予告の形のマスごとの一言 [{ cell, text, title, level }]。level: 'faint'（空き: 置けば起きること）／'ready'（材料がもうある）／'glow'（構えた魔法で材料を置く）
    //   now: いまの盤面（味方の予測中は撃ったあとの盤面）、base: 予測の前の盤面、fc: now の予告（forecast）
    function intentHints(now, base, fc) {
      if (!on('E10') || !fc) return [];
      var out = [], seen = {};
      fc.enemies.forEach(function (p) {
        if (p.cancelled) return;
        var mats = E10_MAT[p.magic] || [];
        if (!mats.length) return;
        (p.cells || []).forEach(function (c) {
          var k = key(c[0], c[1]);
          if (seen[k] || unitAt(now, c[0], c[1])) return;
          var t = getTile(now, c[0], c[1]);
          var m = mats.filter(function (q) { return q.t.indexOf(t) >= 0; })[0];
          if (m) {
            seen[k] = true;
            var fresh = base && getTile(base, c[0], c[1]) !== t;
            out.push({ cell: c, text: m.word + '！', title: tileName(t) + 'に敵の' + I.magicName(p.magic) + ' → ' + m.word, level: fresh ? 'glow' : 'ready' });
          } else if (t === 'empty') {
            seen[k] = true;
            out.push({ cell: c, text: mats.slice(0, 2).map(function (q) { return q.mat + '→' + q.word; }).join(' '),
              title: mats.map(function (q) { return q.mat + 'があれば' + q.word; }).join('／') + '（敵の' + I.magicName(p.magic) + 'の予告）', level: 'faint' });
          }
        });
      });
      return out;
    }


    // ---------------------------------------------------------------
    // G 強化と融合（強化はユニットの boosts: [{ k: 'G1' }, { k: 'G2', v: 2 }, { k: 'G3', v: 'A' }, { k: 'G4', v: ['grass', 'fire'] } …]）
    //   同じ種類は1つだけ。形を変える強化（G2・G3）がぶつかるときは、後から付けたほうを使う
    // ---------------------------------------------------------------
    var BOOST_INFO = {
      G1: { name: '一気に二段', mark: '二' }, G2: { name: '形が伸びる', mark: '伸' }, G3: { name: '姿', mark: '姿' },
      G4: { name: '融合', mark: '融' }, G5: { name: '最終融合', mark: '極' }, G6: { name: '武器', mark: '武' }, G9: { name: '2つ目の魔法', mark: '二魔' }
    };
    function boostOf(u, k) {
      if (!u || !u.boosts) return undefined;
      var v;
      u.boosts.forEach(function (b) { if (b.k === k) v = b.v === undefined ? true : b.v; });
      return v;
    }
    function hasBoost(u, k) { var v = boostOf(u, k); return on(k) && v !== undefined && v !== false && v !== 0; }
    // 強化を付ける（v が null・false なら外す）。お題・周回（H）からもこれで渡す
    function giveBoost(u, k, v) {
      var list = (u.boosts || []).filter(function (b) { return b.k !== k; });
      if (v !== null && v !== undefined && v !== false && v !== '') list.push(v === true ? { k: k } : { k: k, v: v });
      if (list.length) u.boosts = list; else delete u.boosts;
      return u;
    }
    function boostText(u) {
      if (!u || !u.boosts) return '';
      return u.boosts.filter(function (b) { return on(b.k) || !B.lab[b.k]; }).map(function (b) {
        if (b.k === 'G2') return '伸びる×' + b.v;
        if (b.k === 'G3') { var f = FORMS[u.magic] && FORMS[u.magic][b.v]; return '姿: ' + (f ? f.name : b.v); }
        if (b.k === 'G4' || b.k === 'G5') return (b.k === 'G4' ? '融合: ' : '最終融合: ') + b.v.map(I.magicName).join('→');
        if (b.k === 'G6') return '武器: ' + (WEAPONS[b.v] ? WEAPONS[b.v].name : b.v);
        if (b.k === 'G9') return '2つ目: ' + I.magicName(b.v);
        return BOOST_INFO[b.k] ? BOOST_INFO[b.k].name : b.k;
      }).join('・');
    }

    // G1: 一気に二段（育つが入のときだけ。敵にも同じ）
    function twoStep(u) { return !!u && B.grow.enabled && (hasBoost(u, 'G1') || makeFormOn(u)); }   // L: 作るの覚醒（森・山・川）も一気に二段
    placeMore.push(function (s, u, x, y, t, o, facing, ctx, ev) {
      if (!twoStep(u) || t !== 'empty') return false;
      var to = { grass: 'forest', earth: 'mountain', fire: 'fire' }[u.magic];
      if (!to) return false;
      if (o && (!I.isPassable(to) || !B.ideas.natureUnderUnits || on('C1'))) return false;
      setTile(s, x, y, to);
      ctx.phrases.push(makeFormOn(u) && !hasBoost(u, 'G1') ? '【道】' + formName(u) + ': 一発で' + tileName(to) + 'になった' : '【ラボ】一気に' + tileName(to) + 'になった（一気に二段）');
      return true;
    });

    // G2: 形が伸びる（オンなら味方の魔法は正面1マスから。強化1回ごとに1マス）。G3: 姿が変わる
    var GROW_LIST = {
      forward: [[0, 1], [0, 2], [0, 3], [0, 4]], zig: [[0, 1], [1, 2], [0, 3], [1, 4]],
      side: [[0, 1], [1, 1], [-1, 1], [2, 1]], diag: [[0, 1], [1, 2], [-1, 2], [0, 3]]
    };
    var GROW_DIR = { water: 'forward', wind: 'forward', ice: 'forward', thunder: 'zig', grass: 'side', earth: 'side', fire: 'diag', dark: 'diag' };
    // 魔法ごとの姿 A・B（動詞は変えない。lanes は流れる・吹く魔法を、術者の横の筋からも撃つ。len は届く長さ）
    var FORMS = {
      grass: { A: { name: '大樹の根', cells: [[0, 1], [0, 2], [0, 3], [0, 4]], note: 'まっすぐ4マスの森の筋（導火線）が1発で引ける' },
               B: { name: '森の門', cells: [[-1, 1], [-1, 2], [1, 1], [1, 2]], note: '左右に2マスずつ。真ん中の筋は空いたまま（通り道を残して囲う）' } },
      earth: { A: { name: '城壁', cells: [[-1, 2], [0, 2], [1, 2]], note: '2マス先に横3マスの壁（道をふさぐ）' },
               B: { name: '双つの柱', cells: [[-1, 1], [1, 1]], note: '自分の両隣の前に山。間を通る1本道ができる' } },
      fire: { A: { name: '火の鳥', cells: [[0, 1], [-1, 2], [1, 2]], note: '正面と、その先の左右に火（3か所に同時に点ける）' },
              B: { name: '狐火', cells: [[0, 2], [-1, 3]], note: '目の前を飛ばして2マス先と左の3マス先に点ける（決め手から離れて起こせる）' } },
      thunder: { A: { name: '雷の槍', cells: [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5]], note: 'まっすぐ5マス（ジグザグしない）' },
                 B: { name: '天雷', cells: [[0, 3]], note: '3マス先の1点に落ちる（手前の森や人を越える）' } },
      ice: { A: { name: '氷の槍', cells: [[0, 1], [0, 2], [0, 3], [0, 4]], note: '冷気が4マス先まで届く' },
             B: { name: '霜の手', cells: [[1, 1], [1, 2], [1, 3]], note: '右の筋を進む（正面を空けたまま横を凍らせる）' } },
      dark: { A: { name: '闇の手', cells: [[0, 2]], note: '2マス先を吸う（隣に立たずに死の森を作れる）' },
              B: { name: '双つの影', cells: [[-1, 1], [1, 1]], note: '左右の前の2マスを同時に吸う' } },
      water: { A: { name: '二筋の川', lanes: [-1, 1], note: '左右の筋から2本流れる' },
               B: { name: '滝', len: 2, note: '2マス長く流れる（遠くの山・炎まで届く）' } },
      wind: { A: { name: '風の鎌', lanes: [-1, 1], note: '左右の筋から2本吹く' },
              B: { name: '追い風の槍', len: 2, note: '2マス長く吹き抜ける' } }
    };
    function shapeBoost(u) {
      var list = (u && u.boosts || []).filter(function (b) { return (b.k === 'G2' || b.k === 'G3') && on(b.k); });
      if (on('G2') && u && u.side === 'ally' && !list.some(function (b) { return b.k === 'G2'; })) list.unshift({ k: 'G2', v: 0 });   // G2 オン: 強化0回の味方も正面1マス
      return list.length ? list[list.length - 1] : null;
    }
    function boostShape(u) {
      var b = shapeBoost(u);
      if (!b) return null;
      if (b.k === 'G2') { var g = GROW_LIST[GROW_DIR[u.magic]]; return g ? g.slice(0, 1 + Math.max(0, Math.min(3, b.v || 0))) : null; }
      var f = FORMS[u.magic] && FORMS[u.magic][b.v];
      return f && f.cells ? f.cells : null;
    }
    // G6: 武器。立っているマスが武器の自然なら、形が少し変わる
    var WEAPONS = {
      staff: { name: '杖', where: '森の中', ok: function (s, u) { var t = getTile(s, u.x, u.y); return t === 'forest' || t === 'thicket' || t === 'deepforest'; } },
      bow: { name: '弓', where: '丘・山の上', ok: function (s, u) { var t = getTile(s, u.x, u.y); return t === 'hill' || t === 'mountain' || t === 'hillsakura'; } },
      scepter: { name: '錫杖', where: '水辺', ok: function (s, u) {
        return [[u.x, u.y]].concat(neighbors(s, u.x, u.y).map(function (n) { return [n.x, n.y]; })).some(function (c) { return waterTile(getTile(s, c[0], c[1])); });
      } }
    };
    function weaponOn(s, u) { var w = hasBoost(u, 'G6') ? boostOf(u, 'G6') : null; return w && WEAPONS[w] && WEAPONS[w].ok(s, u) ? w : null; }
    originMore.push(function (s, u, facing) {
      if (weaponOn(s, u) !== 'bow') return null;
      var F = DIRS[facing], k = getTile(s, u.x, u.y) === 'hill' ? 2 : 1;   // 丘はもともと1マス先（高台）。弓でさらに1マス
      return { x: u.x + F.dx * k, y: u.y + F.dy * k };
    });
    var FLOWING = { water: true, wind: true };
    cellsMore.push(function (s, u, o, facing) {
      if (!(on('G2') || on('G3') || on('G6') || on('G4') || on('G5'))) return null;
      var shp = boostShape(u);
      var w = weaponOn(s, u);
      if (!shp && !w) return null;
      var cells = shp ? shapeAt(s, shp, o, facing) : I.shapeCells(s, u.magic, o.x, o.y, facing);
      if (w === 'staff' && !FLOWING[u.magic] && cells.length) {
        var F = DIRS[facing], last = cells[cells.length - 1], nx = last[0] + F.dx, ny = last[1] + F.dy;
        if (inBounds(s, nx, ny) && !has(cells, nx, ny)) cells = cells.concat([[nx, ny]]);
      }
      if (w === 'scepter' && !FLOWING[u.magic] && cells.length) {
        var R = I.rotate(facing, 1, 0), f0 = cells[0], sx = f0[0] + R[0], sy = f0[1] + R[1];
        if (inBounds(s, sx, sy) && !has(cells, sx, sy)) cells = cells.concat([[sx, sy]]);
      }
      return cells;
    });
    // 流れる・吹く魔法の届く長さ（G2 伸びる・G3 滝／追い風の槍・G6 杖と錫杖）
    function lengthFor(s, u, magic, base) {
      if (!(on('G2') || on('G3') || on('G6') || on('F3') || on('L0'))) return base;
      var len = base, b = shapeBoost(u);
      if (b && b.k === 'G2') len = 1 + Math.max(0, Math.min(3, b.v || 0));
      if (b && b.k === 'G3') { var f = FORMS[magic] && FORMS[magic][b.v]; if (f && f.len) len = base + f.len; }
      var w = weaponOn(s, u);
      if (w === 'staff' || w === 'scepter') len += 1;
      if (u.magic === magic) len += shapeSteps(u);   // L 仮の道: 水・風は届く長さが1マスずつ伸びる
      if (mon() && u.magic === magic) len = mLength(s, u, len);   // M: 大きくする・足場・当たるまで・小さく・2回撃てる
      return footLength(s, u, magic, len);   // F3: 水辺で水は1マス長い
    }
    // G3: 闇の姿は、形のマスを全部吸う（G2 で伸びた闇も）
    darkTargets = function (s, u, facing, cells) { return boostShape(u) ? cells : cells.slice(0, 1); };
    // G3: 流れる・吹く魔法の「筋」の姿（術者の横の筋からも撃つ）
    castMore.push(function (s, u, facing, ctx, ev) {
      if (!FLOWING[u.magic] || !on('G3')) return false;
      var b = shapeBoost(u);
      var f = b && b.k === 'G3' && FORMS[u.magic] && FORMS[u.magic][b.v];
      if (!f || !f.lanes) return false;
      f.lanes.forEach(function (side) {
        var d = I.rotate(facing, side, 0), ghost = I.clone(u);
        ghost.x = u.x + d[0]; ghost.y = u.y + d[1]; ghost.boosts = [];
        if (!inBounds(s, ghost.x, ghost.y)) return;
        if (u.magic === 'water') I.flow(s, ghost, facing, ctx, ev); else I.blow(s, ghost, facing, ctx, ev);
      });
      ctx.phrases.push('【ラボ】' + f.name + '（' + I.magicName(u.magic) + 'の姿）');
      return true;
    });

    // G4・G5・G7: 形の各マスに、魔法を順に当てる（融合・まとう）
    function fuseList(u) {
      if (hasBoost(u, 'G5')) return { list: boostOf(u, 'G5'), kind: 'G5' };
      if (hasBoost(u, 'G4')) return { list: boostOf(u, 'G4'), kind: 'G4' };
      if (on('G7') && u.labWear) return { list: [u.labWear, u.magic], kind: 'G7' };
      return null;
    }
    function fuseCells(s, u, facing, fz) {
      var o = I.castOrigin(s, u, facing);
      if (fz.kind === 'G5') return shapeAt(s, [[0, 3]], o, facing);   // 3マス先の1マス（近いと、起こした本人が決め手の輪や引き寄せに入る）
      if (fz.kind === 'G7') return I.castCells(s, u, facing);
      var cells = I.shapeCells(s, fz.list[0], o.x, o.y, facing);
      return opt('G4', 'weak') === 'small' ? cells.slice(0, 2) : cells;
    }
    castMore.push(function (s, u, facing, ctx, ev) {
      var fz = fuseList(u);
      if (!fz || !fz.list || fz.list.length < 2) return false;
      var cells = fuseCells(s, u, facing, fz);
      ctx.labFuse = fz.kind;
      cells.forEach(function (c) {
        ctx.cells.push(c);
        var o = unitAt(s, c[0], c[1]);
        if (o && o.id !== u.id) addHit(ctx, o, u.power, 'direct');
        fz.list.forEach(function (m) { touchMagic(s, u, m, c[0], c[1], facing, ctx, ev); });
      });
      var names = fz.list.map(I.magicName).join('→');
      ctx.phrases.unshift('【ラボ】' + (fz.kind === 'G7' ? 'まとった' + I.magicName(fz.list[0]) + 'と一緒に撃った（' + names + '）' : (fz.kind === 'G5' ? '最終融合' : '融合') + '（' + names + '）'));
      if (fz.kind === 'G7') delete u.labWear;
      return true;
    });
    // 1マスに、その魔法の動詞が当たった（融合・まとう用。ユニットへの直撃は含まない）
    function touchMagic(s, u, m, x, y, dir, ctx, ev) {
      var t = getTile(s, x, y), o = unitAt(s, x, y), grow = B.grow.enabled;
      var under = function (to) { return !o || (B.ideas.natureUnderUnits && !on('C1') && I.isPassable(to)); };
      var once = function (k) { ctx.labDone = ctx.labDone || {}; if (ctx.labDone[k]) return false; ctx.labDone[k] = true; return true; };
      if (m === 'grass') {
        var lowG = grow ? 'thicket' : 'forest';
        if (t === 'empty' && under(lowG)) { setTile(s, x, y, lowG); ctx.phrases.push(tileName(lowG) + 'ができた'); }
        else if (t === 'thicket' && grow && under('forest')) { setTile(s, x, y, 'forest'); ctx.phrases.push('草むらが森に育った'); }
        else if (t === 'mountain' && !o && B.sakura.from === 'grass') { setTile(s, x, y, 'sakura'); ctx.phrases.push('山に桜が咲いた'); }
      } else if (m === 'earth') {
        var low = grow ? 'hill' : 'mountain';
        if (t === 'empty' && under(low)) { setTile(s, x, y, low); ctx.phrases.push(tileName(low) + 'ができた'); }
        else if (t === 'hill' && grow && !o) { setTile(s, x, y, 'mountain'); ctx.phrases.push('丘が山に育った'); }
        else if ((t === 'river' || t === 'puddle') && under('mud')) { setTile(s, x, y, 'mud'); ctx.phrases.push(tileName(t) + 'が泥沼になった'); if (o) I.enterMud(s, o, ev); }
        else if ((t === 'fire' || t === 'smallfire') && B.ideas.earthSmother && under(low)) { setTile(s, x, y, low); ctx.phrases.push('土をかぶせて' + tileName(t) + 'を消した'); }
      } else if (m === 'fire') {
        if (t === 'empty' && o && on('C1')) return;
        if (t === 'empty' && twoStep(u)) { setTile(s, x, y, 'fire'); return; }
        touchFire(s, x, y, dir, ctx, ev, '');
      } else if (m === 'water') {
        if (o) I.cureBurn(s, o, ctx);
        if (t === 'empty' && under(grow ? 'puddle' : 'river')) { setTile(s, x, y, grow ? 'puddle' : 'river'); ctx.phrases.push(grow ? '水たまりができた' : '池ができた'); }
        else if (t === 'puddle' && grow && !o) { setTile(s, x, y, 'river'); ctx.phrases.push('水たまりが川に育った'); }
        else if (t === 'fire' || t === 'smallfire') { setTile(s, x, y, 'empty'); ctx.phrases.push(tileName(t) + 'が消えた'); }
        else if (t === 'firewhirl' && once('sentakuki')) { ctx.phrases.push('火の渦に水が入った'); I.doSentakuki(s, x, y, ctx, ev, dir); }
      } else if (m === 'wind') {
        if (t === 'empty') { setTile(s, x, y, twoStep(u) ? 'gale' : 'breeze'); }
        else if (t === 'breeze' && grow) setTile(s, x, y, 'gale');
        else if ((t === 'fire' || t === 'smallfire') && once('spread')) { ctx.phrases.push(tileName(t) + 'に風が当たった'); I.doSpread(s, x, y, dir, ctx, ev, 0); }
        else if ((t === 'sakura' || t === 'hillsakura') && once('eruption')) { ctx.phrases.push(tileName(t) + 'に風が当たった'); I.doEruption(s, x, y, dir, ctx, ev); }
        else if (t === 'mirage' && B.ideas.windClearsMirage) { setTile(s, x, y, 'empty'); ctx.phrases.push('風で蜃気楼が晴れた'); }
      } else if (m === 'thunder') {
        if (waterTile(t) && once('shock')) { ctx.phrases.push('雷が' + tileName(t) + 'に落ちた'); I.doShock(s, x, y, ctx, ev, {}); }
        else if (t === 'forest') { setTile(s, x, y, 'fire'); ctx.phrases.push('雷が森に落ちて燃えた'); }
      } else if (m === 'ice') {
        if ((t === 'river' || t === 'puddle') && once('freeze')) I.doFreeze(s, x, y, ctx, ev);
        else if (t === 'fire' || t === 'smallfire') { setTile(s, x, y, 'empty'); ctx.phrases.push(tileName(t) + 'が消えた'); }
        if (o && !o.stuck) { o.stuck = true; ev.push({ type: 'mud', id: o.id, cells: [[x, y]], text: unitLabel(s, o) + 'の足が凍りついた（次の移動は1回休み）' }); }
      } else if (m === 'dark') {
        if (t === 'forest') toDeadForest(s, x, y, ctx, ev);
      }
    }
    // G4 damage: 融合の決め手は半分
    hitMore.push(function (ctx, u, amount, src) {
      if (ctx.labFuse === 'G4' && opt('G4', 'weak') === 'damage' && src === 'finisher') return Math.floor(amount / 2);
      return amount;
    });

    // G7: 魔法の直撃を受けた者は、その魔法をまとう（ターンの終わりまで。次の1発で使う）
    afterShotMore.push(function (s, u, facing, ctx, ev) {
      if (!on('G7')) return;
      ctx.order.forEach(function (id) {
        var h = ctx.hits[id], o = I.findUnit(s, id);
        if (!o || id === u.id || o.side === 'object' || !h || h.src !== 'direct') return;
        o.labWear = ctx.magic;
        ev.push({ type: 'info', id: o.id, cells: [[o.x, o.y]], text: '【ラボ】' + unitLabel(s, o) + 'は' + I.magicName(ctx.magic) + 'をまとった（次の1発に乗る。ターンの終わりまで）' });
      });
    });
    function turnEnd(s, ev) {
      if (!on('G7')) return;
      var gone = s.units.filter(function (x) { return x.labWear; });
      gone.forEach(function (x) { delete x.labWear; });
      if (gone.length) ev.push({ type: 'info', text: '【ラボ】まとっていた魔法が消えた（' + gone.length + '人）' });
    }

    // G8: 強化を持つ敵を倒すと、同じ魔法の味方がその強化を覚える
    function onDeath(s, dead, ev) {
      if (!on('G8')) return;
      dead.forEach(function (d) {
        if (d.side !== 'enemy' || !d.boosts) return;
        d.boosts.forEach(function (b) {
          var got = I.alliesOf(s).filter(function (a) { return a.magic === d.magic && boostOf(a, b.k) === undefined; });
          got.forEach(function (a) { giveBoost(a, b.k, b.v === undefined ? true : b.v); });
          s.labLearned = (s.labLearned || []).concat([{ magic: d.magic, k: b.k, v: b.v }]);
          ev.push({ type: 'info', text: '【ラボ】' + unitLabel(s, d) + 'の技「' + (BOOST_INFO[b.k] ? BOOST_INFO[b.k].name : b.k) + '」を覚えた' +
            (got.length ? '（' + got.map(function (a) { return unitLabel(s, a); }).join('・') + 'が使えるようになった）' : '（' + I.magicName(d.magic) + 'の味方がいないので、次に持ち越す）') });
        });
      });
    }

    // G9: 2つ目の魔法と持ち替える（手番の前だけ。撃てるのは1発のまま）
    function swapMagic(s0, unitId) {
      var u0 = I.findUnit(s0, unitId);
      if (!on('G9') || !u0 || u0.side !== 'ally') return { ok: false, state: s0, events: [], steps: [], error: '2つ目の魔法がない' };
      var m2 = boostOf(u0, 'G9');
      if (!m2) return { ok: false, state: s0, events: [], steps: [], error: '2つ目の魔法がない' };
      if (u0.acted) return { ok: false, state: s0, events: [], steps: [], error: 'この味方はもう行動した' };
      var s = I.clone(s0), u = I.findUnit(s, unitId), m1 = u.magic;
      u.magic = m2; giveBoost(u, 'G9', m1);
      return { ok: true, state: s, events: [{ type: 'info', id: u.id, text: '【ラボ】' + I.magicName(m2) + 'に持ち替えた（2つ目: ' + I.magicName(m1) + '）' }], steps: [] };
    }
    // エディット: 強化を付け外し
    function editSetBoost(s0, unitId, k, v) {
      var u0 = I.findUnit(s0, unitId);
      if (!u0 || u0.side === 'object') return { ok: false, state: s0, events: [], steps: [], error: 'ユニットがいない' };
      var s = I.clone(s0);
      giveBoost(I.findUnit(s, unitId), k, v);
      return { ok: true, state: s, events: [], steps: [] };
    }


    // ---------------------------------------------------------------
    // H お題と周回
    // ---------------------------------------------------------------
    // 撃てない理由（E9 閉じこめ・H13 ごほうびの移動）。撃てるなら false
    function cannotShoot(s, u, to) {
      if (enclosedAt(s, u, to)) return '閉じこめられていて撃てない（待機だけ）';
      if (thornCaged(s, u)) return '茨の牢に囚われていて撃てない（待機だけ）';   // L: 草の足止めの覚醒
      if (on('M0') && u.labAfter && !u.labAfter.shoot) return '撃ったあとなので、動くだけ（動いて「待機」）';   // M: 疾風
      if (on('H13') && u.labMoveOnly) return 'ごほうびの移動は撃てない（待機だけ）';
      return false;
    }
    // お題の勝ち負けの足し（checkResult の最初に呼ばれる）。{ result, text } か null
    function resultMore(s, ev) {
      var enemyDied = ev.some(function (e) { return e.type === 'death' && e.side === 'enemy'; });
      if (on('H6') && s.labChase && enemyDied && !I.findUnit(s, s.labChase.runner)) return { result: 'win', text: '宝を持って逃げる敵を倒した！（勝利）' };
      if (on('H10') && opt('H10', 'mode') === 'score' && I.missionType(s) === 'defense' && !I.objectsOf(s, 'village').length) return { result: 'lose', text: '村がひとつも残らなかった…（星0・敗北）' };
      return null;
    }
    function keepGoing(s) { return on('H10') && opt('H10', 'mode') === 'score'; }
    function noAnnihilateWin(s) { return on('H5') && !!s.labExtinguish; }
    function starText(s) {
      if (!(on('H10') && opt('H10', 'mode') === 'score')) return '';
      return '　星 ' + stars(s) + ' / 3';
    }
    function stars(s) {
      var type = I.missionType(s);
      if (type === 'defense') {
        var all = s.labVillages || I.objectsOf(s, 'village').length || 1, left = I.objectsOf(s, 'village').length;
        return Math.round(3 * left / all);
      }
      if (type === 'escort') { var w = I.objectsOf(s, 'wagon')[0]; return w ? Math.min(3, w.hp) : 0; }
      return 3;
    }
    // H11: 動かせる人数（残りは構える仲間）。H10: 星のために村の数を覚える
    function onStart(s) {
      if (on('H11')) {
        var n = Math.max(1, Math.min(3, Number(opt('H11', 'count')) || 1));
        I.alliesOf(s).filter(function (a) { return !a.npc; }).forEach(function (a, i) { if (i >= n) { a.npc = true; a.labNpc = true; } });
      }
      if (on('H10') && opt('H10', 'mode') === 'score') s.labVillages = I.objectsOf(s, 'village').length;
      s.units.forEach(function (u) { if (u.labHpStart) { u.hp = Math.min(u.maxHp, u.labHpStart); delete u.labHpStart; } });   // H1 carryHp: 持ち越した HP
      setupTargets(s);   // L: この戦闘のターゲット
    }
    // H10 faint: 倒れた味方は2ターン後に、味方の段の端に戻る
    var deathMore = [];
    function onDeathAll(s, dead, ev) {
      onDeath(s, dead, ev);
      if (on('M0')) mOnDeath(s, dead, ev);   // M: 味方が倒れた・撃たせずに倒した敵
      if (on('H10') && opt('H10', 'mode') === 'faint') dead.forEach(function (d) {
        if (d.side !== 'ally' || d.npc) return;
        s.labFaint = (s.labFaint || []).concat([{ unit: I.clone(d), back: s.turn + 2 }]);
        ev.push({ type: 'info', text: '【ラボ】' + unitLabel(s, d) + 'は気絶した（ターン' + (s.turn + 2) + 'に味方の段の端に戻る）' });
      });
    }
    function turnEndAll(s, ev) {
      targetTurnEnd(s, ev);   // L: ターン終了で倒れた敵・撃たれずに終わった予告の決め手
      if (on('M0')) mTurnEnd(s, ev);   // M: 撃ったあとのもう1回は、ターンの終わりで消える
      turnEnd(s, ev);
      if (!timeFrozen()) sweepLab(s, ev);   // B: 砂嵐・霜・暗がり・底なし沼（K1 時間なしなら消えない）
      flourishTurn(s, ev);   // K2: 灰がよみがえる・水辺の草むらが育つ・氷が溶ける
      if (on('H10') && s.labFaint && s.labFaint.length) {
        var keep = [];
        s.labFaint.forEach(function (f) {
          if (f.back > s.turn + 1) { keep.push(f); return; }
          var row = I.rowsOf(s) - 1, spot = null;
          for (var i = 0; i < s.size && !spot; i++) {
            [i, s.size - 1 - i].forEach(function (x) { if (!spot && I.isPassable(getTile(s, x, row)) && !unitAt(s, x, row)) spot = [x, row]; });
          }
          if (!spot) { keep.push(f); return; }
          var u = f.unit; u.x = spot[0]; u.y = spot[1]; u.hp = u.maxHp; u.acted = false; u.stuck = false; u.burn = 0; u.facing = 'up';
          delete u.labWear;
          s.units.push(u);
          ev.push({ type: 'info', id: u.id, cells: [spot], text: '【ラボ】' + unitLabel(s, u) + 'が戻ってきた' });
        });
        s.labFaint = keep;
      }
      if (on('H9') && s.labFlags) {
        var all = s.labFlags.every(function (f) { return flagTaken(s, f); });
        s.labHeld = all ? (s.labHeld || 0) + 1 : 0;
        if (all) ev.push({ type: 'info', text: '【ラボ】拠点を2つとも持っている（' + s.labHeld + 'ターン目の終わり）' });
        if (s.labHeld >= 2 && !s.result) I.setResult(s, ev, 'win', '拠点を2つとも守りきった！（勝利）');
      }
      if (on('H13')) s.units.forEach(function (x) { delete x.labMoveOnly; });
      if (on('I1')) s.units.forEach(function (x) { delete x.labLit; });   // I1: 照らされたのはターンの終わりまで
    }

    // H6: 宝を持って逃げる敵が逃げ口に着いたら負け
    afterMoveMore.push(function (s, u, from, to, ev) {
      if (!on('H6') || !s.labChase || u.id !== s.labChase.runner || s.result) return;
      if (has(s.labChase.exits, u.x, u.y)) I.setResult(s, ev, 'lose', unitLabel(s, u) + 'が宝を持って逃げ口に着いた…（敗北）');
    });

    // H8: 持たれていない宝は、風で押され、源流に乗って流れる
    afterShotMore.push(function (s, u, facing, ctx, ev) {
      var m = s.mission;
      if (!on('H8') || !m || !m.treasure || m.carrier) return;
      var t = m.treasure, F = DIRS[facing];
      if (!has(ctx.cells, t[0], t[1])) return;
      if (u.magic === 'wind') {
        var nx = t[0] + F.dx, ny = t[1] + F.dy;
        if (inBounds(s, nx, ny) && I.isPassable(getTile(s, nx, ny)) && !unitAt(s, nx, ny)) {
          m.treasure = [nx, ny];
          ev.push({ type: 'treasure', cells: [[nx, ny]], text: '【ラボ】宝が風で' + F.name + 'へ1マス運ばれた' });
        }
      } else if (u.magic === 'water' && getTile(s, t[0], t[1]) === 'river') {
        // 川の流れの先（この1発の通り道のうち、宝より先で一番遠い川）まで流れる。着いたマスに人がいれば、その手前
        var idx0 = -1;
        ctx.cells.forEach(function (c, i) { if (c[0] === t[0] && c[1] === t[1]) idx0 = i; });
        var to = null;
        for (var i = ctx.cells.length - 1; i > idx0; i--) {
          var c = ctx.cells[i];
          if (getTile(s, c[0], c[1]) === 'river' && !unitAt(s, c[0], c[1])) { to = c; break; }
        }
        if (to) {
          // 川の上には立てないので、流れ着いた先の隣の岸に打ち上げる（向きの先 → 左右）
          var land = [[to[0] + F.dx, to[1] + F.dy], [to[0] - F.dy, to[1] + F.dx], [to[0] + F.dy, to[1] - F.dx]].filter(function (c) {
            return inBounds(s, c[0], c[1]) && I.isPassable(getTile(s, c[0], c[1])) && !unitAt(s, c[0], c[1]);
          })[0] || to;
          m.treasure = land.slice();
          ev.push({ type: 'treasure', cells: [land], text: '【ラボ】宝が川に乗って流れた（' + land[0] + ',' + land[1] + '）' });
        }
      }
    });

    // H9: 拠点（敵の旗の自然のかたまり。全部のマスが別の自然になったら取れる）
    function flagTaken(s, f) { return f.cells.every(function (c) { return getTile(s, c[0], c[1]) !== f.tile; }); }
    function flagAt(s, x, y) { return (s.labFlags || []).filter(function (f) { return has(f.cells, x, y); })[0] || null; }
    originMore.push(function (s, u, facing) {
      if (!on('H9') || u.side !== 'ally' || !s.labFlags) return null;
      var f = flagAt(s, u.x, u.y);
      if (!f || !flagTaken(s, f)) return null;
      var F = DIRS[facing], k = getTile(s, u.x, u.y) === 'hill' ? 2 : 1;
      return { x: u.x + F.dx * k, y: u.y + F.dy * k };
    });
    var planMore = [];
    planMore.push(function (s, e) {
      if (!on('H9') || !s.labFlags) return null;
      var taken = s.labFlags.filter(function (f) { return flagTaken(s, f); });
      if (!taken.length) return null;
      var cs = candidates(s, e);
      var back = function (c) {
        var n = 0;
        taken.forEach(function (f) { f.cells.forEach(function (q) { var i = idx(s, q[0], q[1]); if (c.r.after[i] === f.tile && c.r.before[i] !== f.tile) n++; }); });
        return n;
      };
      var best = pickBest(cs.safe, function (c) { var b = back(c); return b > 0 ? [b, c.r.allyHits] : null; });
      if (best) return { to: best.to, dir: best.dir, dist: best.dist, kind: 'nature', reason: '拠点を取り返す' };
      var goals = [];
      taken.forEach(function (f) { f.cells.forEach(function (q) { goals.push(q); }); });
      return approach(s, e, cs, goals, '拠点へ向かう');
    });

    // H13: 小さな目標（印のマスを、決まった自然にする）。達成すると、撃った味方がもう1回移動できる（撃てない）
    afterShotMore.push(function (s, u, facing, ctx, ev) {
      if (!on('H13') || !s.labGoals || u.side !== 'ally') return;
      s.labGoals.forEach(function (g) {
        if (g.done || !g.cells.every(function (c) { return getTile(s, c[0], c[1]) === g.tile; })) return;
        g.done = true;
        u.acted = false; u.labMoveOnly = true;
        ev.push({ type: 'info', id: u.id, cells: g.cells, text: '【ラボ】目標「' + g.name + '」達成！ ' + unitLabel(s, u) + 'はもう1回移動できる（撃てない）。' + (g.hint || '') });
      });
    });

    // H1: 周回（戦闘の外。乱数は戦闘の外だけ）。盤面のひな型はお題ごと。敵の魔法は道ごとに変える
    var RUN_BOARDS = {
      annihilate: [
        { rows: ['.......', '.......', '..F.F..', '.......', '.......', '.......', '.......'], allies: [[1, 6], [3, 6], [5, 6]], enemies: [[1, 0, 'near'], [5, 0, 'count']] },
        { rows: ['.......', '...M...', '.......', '.R...R.', '.R...R.', '.......', '.......'], allies: [[1, 6], [3, 6], [5, 6]], enemies: [[3, 0, 'count'], [6, 1, 'near']] },
        { rows: ['.......', '.......', '.FF.FF.', '.......', '...P...', '.......', '.......'], allies: [[2, 6], [3, 6], [4, 6]], enemies: [[0, 0, 'near'], [6, 0, 'count']] }
      ],
      defense: [
        { rows: ['.......', '.......', '..F.F..', '.......', '.......', '.......', '.......'], allies: [[2, 6], [3, 6], [4, 6]], enemies: [[1, 0, 'target'], [5, 0, 'count']], villages: [[1, 6], [5, 6]] },
        { rows: ['.......', '.......', '.......', '...M...', '.......', '.......', '.......'], allies: [[2, 5], [3, 6], [4, 5]], enemies: [[2, 0, 'target'], [5, 0, 'target']], villages: [[0, 6], [6, 6]] },
        { rows: ['.......', '.......', '.R...R.', '.R...R.', '.......', '.......', '.......'], allies: [[1, 6], [3, 5], [5, 6]], enemies: [[3, 0, 'target'], [0, 0, 'count']], villages: [[3, 6]] }
      ],
      escort: [
        { rows: ['...R...', '...R...', '...R...', '...R...', '.......', '...R...', '...R...'], allies: [[0, 6], [2, 6], [1, 4]], enemies: [[5, 0, 'target'], [6, 6, 'count']], wagon: [1, 5], goal: 'right' },
        { rows: ['.......', '..MMM..', '.......', '.......', '.......', '..RRR..', '.......'], allies: [[0, 4], [0, 2], [1, 3]], enemies: [[6, 0, 'target'], [6, 6, 'near']], wagon: [0, 3], goal: 'right' }
      ],
      retrieve: [
        { rows: ['.M...M.', '..F.F..', '.......', '.......', '.......', '.......', '.......'], allies: [[1, 6], [3, 6], [5, 6]], enemies: [[2, 0, 'target'], [4, 0, 'count']], treasure: [3, 0], exit: 'bottom' },
        { rows: ['...M...', '.......', '.R...R.', '.......', '.......', '.......', '.......'], allies: [[1, 6], [3, 6], [5, 6]], enemies: [[1, 0, 'target'], [5, 1, 'count']], treasure: [3, 1], exit: 'bottom' }
      ],
      boss: [
        { rows: ['........', '........', '........', '........', '........', '........', '........', '........'], allies: [[1, 7], [4, 7], [6, 7]], enemies: [[3, 0, 'count', true]] }
      ]
    };
    var RUN_MISSIONS = ['annihilate', 'defense', 'escort', 'retrieve'];
    var MISSION_NAME = { annihilate: '全滅', defense: '防衛', escort: '護衛', retrieve: '奪取', boss: '大物' };
    var RUN_ENEMY_MAGICS = ['fire', 'water', 'earth', 'wind', 'thunder', 'grass'];
    var RUN_STEPS = 5;   // 戦闘4回＋最後の大物
    var REWARD_DIR = { retrieve: 'shape', defense: 'ground', annihilate: 'power', escort: 'carry' };
    var REWARD_NAME = { shape: '形（姿が変わる）', ground: '足場（武器）', power: '威力（一気に二段・融合）', carry: '運ぶ（移動+1）' };
    function newRun(party) {
      return { party: party.slice(0, 3), step: 0, boosts: {}, fin: [], picked: [], hp: null, prevTiles: null, opts: { H2: on('H2'), H12: on('H12'), carryHp: !!opt('H1', 'carryHp'), speedBonus: !!opt('H1', 'speedBonus'), speedTurns: Number(opt('H1', 'speedTurns')) || 3 } };
    }
    function runPaths(run, rnd) {
      if (run.step >= RUN_STEPS - 1) return [{ mission: 'boss', enemy: 'fire', board: 0 }];
      var ms = RUN_MISSIONS.slice(), out = [];
      for (var i = 0; i < 2; i++) {
        var m = ms.splice(Math.floor(rnd() * ms.length), 1)[0];
        out.push({ mission: m, enemy: RUN_ENEMY_MAGICS[Math.floor(rnd() * RUN_ENEMY_MAGICS.length)], board: Math.floor(rnd() * RUN_BOARDS[m].length), reward: run.opts.H2 ? REWARD_DIR[m] : null });
      }
      return out;
    }
    function pathText(p) { return MISSION_NAME[p.mission] + '・' + I.magicName(p.enemy) + 'の敵' + (p.reward ? '（報酬: ' + REWARD_NAME[p.reward] + '）' : ''); }
    var TILE_CH = null;
    function tileCh(t) {
      if (!TILE_CH) { TILE_CH = {}; Object.keys(I.CH).forEach(function (k) { if (!TILE_CH[I.CH[k]]) TILE_CH[I.CH[k]] = k; }); }
      return TILE_CH[t] || '.';
    }
    // 道 p の戦闘をラボ用シナリオの形で作る
    function runPreset(run, p) {
      var bd = RUN_BOARDS[p.mission][p.board || 0];
      var rows = bd.rows.slice(), n = rows[0].length;
      if (run.opts.H12 && run.prevTiles && run.prevTiles.size === n && run.prevTiles.rows === rows.length) {
        for (var y = 0; y < Math.floor(rows.length / 2); y++) {
          var line = '';
          for (var x = 0; x < n; x++) line += tileCh(run.prevTiles.tiles[y * n + x]);
          rows[y] = line;
        }
      }
      var allies = bd.allies.map(function (c, i) {
        var m = run.party[i], extra = {};
        if (run.boosts[m] && run.boosts[m].length) extra.boosts = I.clone(run.boosts[m]);
        if (run.opts.carryHp && run.hp && run.hp[m] !== undefined) extra.labHpStart = Math.max(1, run.hp[m]);   // 戦闘の始めの HP（onStart で入れる）
        return [m, c[0], c[1], { lab: extra }];
      });
      var enemies = bd.enemies.map(function (c) {
        var e = [p.mission === 'boss' ? 'fire' : p.enemy, c[0], c[1], { aim: c[2] }];
        if (c[3]) e[3].lab = { size: 'D3', labBoss: true };
        return e;
      });
      var lab = ['H1', 'G1', 'G3', 'G4', 'G6', 'G9'].concat(run.opts.H2 ? ['H2'] : []).concat(run.opts.H12 ? ['H12'] : []).concat(p.mission === 'boss' ? ['D3', 'D5'] : []);
      var pr = { id: 'labRunBattle', labCat: 'H', lab: lab, labOpts: { H1: { carryHp: run.opts.carryHp, speedBonus: run.opts.speedBonus, speedTurns: run.opts.speedTurns } },
        name: '周回 ' + (run.step + 1) + '/' + RUN_STEPS + ': ' + pathText(p), desc: '【周回】' + pathText(p), rows: rows, allies: allies, enemies: enemies,
        overrides: { 'grow.enabled': true }, mission: p.mission === 'boss' ? 'annihilate' : p.mission, labRun: true };
      if (bd.villages) pr.villages = bd.villages;
      if (bd.wagon) { pr.wagon = bd.wagon; pr.goal = []; for (var gy = 0; gy < rows.length; gy++) pr.goal.push([n - 1, gy]); }
      if (bd.treasure) { pr.treasure = bd.treasure; pr.exit = []; for (var ex = 0; ex < n; ex++) pr.exit.push([ex, rows.length - 1]); }
      return pr;
    }
    // 勝ったあとの強化の候補（作った強化だけ。H2 がオンなら、お題の方向から2つ）
    function runOffers(run, p, rnd, state) {
      var pool = [];
      run.party.forEach(function (m) {
        var have = function (k) { return (run.boosts[m] || []).some(function (b) { return b.k === k; }); };
        if (!have('G1') && ['grass', 'earth', 'water', 'wind', 'fire'].indexOf(m) >= 0) pool.push({ m: m, k: 'G1', v: true, dir: 'power', label: I.magicName(m) + ': 一気に二段' });
        if (!have('G3') && FORMS[m]) ['A', 'B'].forEach(function (f) { pool.push({ m: m, k: 'G3', v: f, dir: 'shape', label: I.magicName(m) + ': 姿「' + FORMS[m][f].name + '」（' + FORMS[m][f].note + '）' }); });
        if (!have('G4')) run.party.forEach(function (o) { if (o !== m) pool.push({ m: m, k: 'G4', v: [o, m], dir: 'power', label: I.magicName(m) + ': 融合 ' + I.magicName(o) + '→' + I.magicName(m) }); });
        if (!have('G6')) Object.keys(WEAPONS).forEach(function (w) { pool.push({ m: m, k: 'G6', v: w, dir: 'ground', label: I.magicName(m) + ': 武器「' + WEAPONS[w].name + '」（' + WEAPONS[w].where + 'で形が少し変わる）' }); });
        if (!have('M1')) pool.push({ m: m, k: 'M1', v: true, dir: 'carry', label: I.magicName(m) + ': 移動+1' });
      });
      var n = 3 + (run.opts.speedBonus && state && state.turn <= run.opts.speedTurns ? 1 : 0);
      var out = [], take = function (list) { var i = Math.floor(rnd() * list.length); out.push(list[i]); pool.splice(pool.indexOf(list[i]), 1); };
      var dir = run.opts.H2 && p ? REWARD_DIR[p.mission] : null;
      while (out.length < n && pool.length) {
        var fav = dir ? pool.filter(function (o) { return o.dir === dir; }) : [];
        take(fav.length && out.length < 2 ? fav : pool);
      }
      return out;
    }
    function runPick(run, offer) {
      var list = (run.boosts[offer.m] || []).filter(function (b) { return b.k !== offer.k; });
      list.push(offer.v === true ? { k: offer.k } : { k: offer.k, v: offer.v });
      run.boosts[offer.m] = list;
      run.picked.push(offer.label);
    }
    // 戦闘の終わりの盤面を周回に残す（決め手の一覧・HP・自然）
    function runAfterBattle(run, s) {
      run.fin = run.fin.concat((s.labRunFin || []).map(function (f) { return { step: run.step + 1, name: f }; }));
      run.hp = {};
      run.party.forEach(function (m) { var a = I.alliesOf(s).filter(function (x) { return x.magic === m || boostOf(x, 'G9') === m; })[0]; run.hp[m] = a ? a.hp : 0; });
      run.prevTiles = { size: s.size, rows: I.rowsOf(s), tiles: s.tiles.slice() };
      (s.labLearned || []).forEach(function (l) { run.party.forEach(function (m) { if (m === l.magic) runPick(run, { m: m, k: l.k, v: l.v === undefined ? true : l.v, label: I.magicName(m) + ': ' + (BOOST_INFO[l.k] ? BOOST_INFO[l.k].name : l.k) + '（敵から覚えた）' }); }); });
      run.step++;
    }
    afterShotMore.push(function (s, u, facing, ctx, ev) {
      if (!on('H1') || !ctx.finishers.length) return;
      s.labRunFin = (s.labRunFin || []).concat(ctx.finishers.map(function (f) { return f.name; }));
    });
    // 周回の移動+1（M1）
    BOOST_INFO.M1 = { name: '移動+1', mark: '足' };
    confMore.push(function (u, c) { return boostOf(u, 'M1') ? { hp: c.hp, power: c.power, move: c.move + 1 } : null; });


    // ---------------------------------------------------------------
    // F 移動と手番
    // ---------------------------------------------------------------
    // F1: 味方の移動を1（enemyToo なら敵も）
    confMore.push(function (u, c) {
      if (!on('F1') || !(u.side === 'ally' || (u.side === 'enemy' && opt('F1', 'enemyToo')))) return null;
      return { hp: c.hp, power: c.power, move: Math.max(0, Number(opt('F1', 'move'))) };
    });
    // F2・F3: 風のマスの向きを覚える（風を置いたとき）
    afterShotMore.push(function (s, u, facing, ctx, ev) {
      if (!(on('F2') || on('F3') || on('L0')) || u.magic !== 'wind') return;   // L0: 草の起点2（種が風下へ飛ぶ）にも風の向きが要る
      ctx.cells.forEach(function (c) {
        if (!inBounds(s, c[0], c[1]) || !I.isWind(getTile(s, c[0], c[1]))) return;
        s.labWind = s.labWind || {};
        s.labWind[idx(s, c[0], c[1])] = facing;
      });
    });
    function windAt(s, x, y) { return s.labWind ? s.labWind[idx(s, x, y)] : undefined; }
    // F3: 足場（G6 がオンなら武器の自然だけなので、F3 は効かない）
    function footing() { return on('F3') && !on('G6'); }
    originMore.push(function (s, u, facing) {
      if (!footing() || !I.isWind(getTile(s, u.x, u.y))) return null;
      var w = windAt(s, u.x, u.y);
      if (!w) return null;
      var F = DIRS[facing], W = DIRS[w], k = 0;   // 風の中から撃つと、起点が風下へ1マス（丘ならそのうえ1マス先）
      return { x: u.x + W.dx + F.dx * k, y: u.y + W.dy + F.dy * k };
    });
    cellsMore.push(function (s, u, o, facing) {
      if (!footing() || u.magic !== 'grass') return null;
      var t = getTile(s, u.x, u.y);
      if (t !== 'forest' && t !== 'thicket' && t !== 'deepforest') return null;
      var cells = boostShape(u) ? shapeAt(s, boostShape(u), o, facing) : I.shapeCells(s, u.magic, o.x, o.y, facing);
      var F = DIRS[facing], last = cells[cells.length - 1];
      if (last && inBounds(s, last[0] + F.dx, last[1] + F.dy)) cells = cells.concat([[last[0] + F.dx, last[1] + F.dy]]);
      return cells;
    });
    function footLength(s, u, magic, len) {
      if (!footing() || magic !== 'water' || u.magic !== 'water') return len;
      var wet = [[u.x, u.y]].concat(neighbors(s, u.x, u.y).map(function (n) { return [n.x, n.y]; })).some(function (c) { return waterTile(getTile(s, c[0], c[1])); });
      return wet ? len + 1 : len;
    }

    // F4: 敵の予告は、味方が1人動くごとに1つずつ発動する（予告を出した順）
    function interleave(s, ev, step) {
      if (!on('F4') || s.result || !s.enemyActs) return;
      var e = I.enemiesOf(s).filter(function (x) { return x.intent; })[0];
      if (!e) return;
      e.intent = false;
      ev.push({ type: 'phase', text: '── 【ラボ】' + unitLabel(s, e) + 'の発動（味方が1人動いたので） ──' });
      I.shoot(s, e, e.facing, ev);
      step();
    }
    // 予告の発動の順番（①②③）
    function intentOrder(s, id) {
      if (!on('F4')) return 0;
      var list = I.enemiesOf(s).filter(function (x) { return x.intent; });
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return i + 1;
      return 0;
    }

    // F5: 構えて、ターンの終わりに一斉に発動。構えは u.labStance = { n }（向きは u.facing）
    function stancesOf(s) {
      return I.alliesOf(s).filter(function (a) { return a.labStance; }).sort(function (a, b) { return a.labStance.n - b.labStance.n; });
    }
    function setStance(s, u) {
      s.labStanceSeq = (s.labStanceSeq || 0) + 1;
      u.labStance = { n: s.labStanceSeq };
    }
    // 構えた順に撃つ（ev があれば出来事を残す）。違う味方の魔法が続けて当たったマスから決め手が起きたら「合体！」
    function fireStances(s, ev, step, exceptId) {
      if (!on('F5')) return;
      var touched = {}, rank = {};
      stancesOf(s).forEach(function (a0, i) { rank[a0.id] = i; });
      stancesOf(s).forEach(function (a0) {
        if (a0.id === exceptId || s.result) return;
        var a = I.findUnit(s, a0.id);
        if (!a) return;
        var mark = ev.length;
        var ctx = I.shoot(s, a, a.facing, ev);
        ctx.finishers.forEach(function (f) {
          var by = {};
          (f.cells || []).concat(f.origin ? [f.origin] : []).forEach(function (c) { var t = touched[key(c[0], c[1])]; if (t && t !== a.id) by[t] = true; });
          var others = Object.keys(by).sort(function (x, y) { return (rank[x] || 0) - (rank[y] || 0); });   // 構えた順
          if (!others.length) return;
          var names = others.map(function (id) { var o = I.findUnit(s, id); return o ? unitLabel(s, o) : id; }).concat([unitLabel(s, a)]);
          for (var i = mark; i < ev.length; i++) if (ev[i].type === 'finisher' && ev[i].name === f.name) { ev[i].text = '【合体！ ' + names.join('・') + '】' + ev[i].text; ev[i].combo = names; }
        });
        ctx.cells.forEach(function (c) { touched[key(c[0], c[1])] = a.id; });
        if (step) step();
      });
      I.alliesOf(s).forEach(function (a) { delete a.labStance; });
    }

    // F6: 壊す（正面1マスの自然を一段戻す）
    var BREAK_TO = { forest: 'thicket', mountain: 'hill', river: 'puddle', gale: 'breeze', fire: 'smallfire', thicket: 'empty', hill: 'empty', puddle: 'empty', breeze: 'empty', smallfire: 'empty',
      volcano: 'mountain', deadforest: 'empty', ice: 'puddle', sakura: 'mountain', hillsakura: 'hill', mirage: 'puddle', mud: 'puddle', firewhirl: 'fire', haunted: 'deadforest' };
    function breakFront(s, u, facing, ev) {
      var o = I.castOrigin(s, u, facing), F = DIRS[facing], x = o.x + F.dx, y = o.y + F.dy;
      var ctx = I.newShot();
      ctx.s = s;
      ev.push({ type: 'cast', id: u.id, side: u.side, magic: u.magic, dir: facing, from: [u.x, u.y], cells: [[x, y]], text: '' });
      var castEv = ev[ev.length - 1];
      if (!inBounds(s, x, y)) { castEv.text = unitLabel(s, u) + 'は壊そうとしたが、何もなかった'; return; }
      var t = getTile(s, x, y), to = BREAK_TO[t];
      if ((t === 'forest' || t === 'mountain' || t === 'river' || t === 'gale') && !B.grow.enabled) to = t === 'river' ? 'puddle' : 'empty';
      var hit = unitAt(s, x, y);
      if (hit) addHit(ctx, hit, 1, 'direct');
      if (to) { setTile(s, x, y, to); ctx.phrases.push(tileName(t) + 'を壊して' + (to === 'empty' ? '空きにした' : tileName(to) + 'にした')); }
      castEv.text = unitLabel(s, u) + 'が' + DIRS[facing].name + 'を壊した（魔法は撃たない）→ ' + (ctx.phrases.length ? ctx.phrases.join('、') : (hit ? '' : '壊すものがなかった'));
      I.applyHits(s, ctx, ev);
    }

    // F7: 作業台（正面3×3の枠。枠に当たった魔法は材料になり、ターンの終わりに積んだ順に枠の全マスへ当たる）
    function benchCells(s, u, facing) {
      var o = I.castOrigin(s, u, facing), out = [];
      [[-1, 1], [0, 1], [1, 1], [-1, 2], [0, 2], [1, 2], [-1, 3], [0, 3], [1, 3]].forEach(function (p) {
        var d = I.rotate(facing, p[0], p[1]), x = o.x + d[0], y = o.y + d[1];
        if (inBounds(s, x, y)) out.push([x, y]);
      });
      return out;
    }
    function placeBench(s, u, facing, ev) {
      s.labBench = { cells: benchCells(s, u, facing), owner: u.id, dir: facing, mats: [] };
      ev.push({ type: 'info', id: u.id, cells: s.labBench.cells, text: '【ラボ】' + unitLabel(s, u) + 'が作業台を置いた（正面3×3。枠に当たった魔法は材料になり、ターンの終わりにまとめて変わる）' });
    }
    castMore.push(function (s, u, facing, ctx, ev) {
      if (!on('F7') || !s.labBench) return false;
      var o = I.castOrigin(s, u, facing);
      var cells = I.castCells(s, u, facing);
      if (u.magic === 'water' || u.magic === 'wind') { cells = []; var F = DIRS[facing]; for (var i = 1; i <= 4; i++) cells.push([o.x + F.dx * i, o.y + F.dy * i]); }
      if (!cells.some(function (c) { return has(s.labBench.cells, c[0], c[1]); })) return false;
      s.labBench.mats.push({ magic: u.magic, by: u.id, dir: facing });
      ctx.phrases.push('【ラボ】' + I.magicName(u.magic) + 'を作業台に積んだ（' + s.labBench.mats.length + 'つ目）');
      cells.forEach(function (c) { if (has(s.labBench.cells, c[0], c[1])) ctx.cells.push(c); });
      return true;
    });
    function craft(s, ev, step) {
      if (!on('F7') || !s.labBench) return;
      var b = s.labBench;
      delete s.labBench;
      if (!b.mats.length) { ev.push({ type: 'info', cells: b.cells, text: '【ラボ】作業台に何も積まれなかった' }); return; }
      var owner = I.findUnit(s, b.owner) || { id: b.owner, magic: 'grass', power: 1, x: b.cells[0][0], y: b.cells[0][1] };
      var ctx = I.newShot();
      ctx.s = s;
      b.cells.forEach(function (c) { b.mats.forEach(function (m) { touchMagic(s, owner, m.magic, c[0], c[1], m.dir, ctx, ev); }); });
      ev.push({ type: 'cast', id: b.owner, side: 'ally', magic: b.mats[0].magic, dir: b.dir, from: b.cells[4] || b.cells[0], cells: b.cells,
        text: '【ラボ】作業台: ' + b.mats.map(function (m) { return I.magicName(m.magic); }).join('→') + ' が枠の全マスに当たった' + (ctx.phrases.length ? ' → ' + I.summarize(ctx.phrases) : '') });
      I.applyHits(s, ctx, ev);
      if (step) step();
    }
    // ターンの終わりの始め（敵の発動の前）: F5 の構えの発動・F7 の作業台
    function beforeEnemyFire(s, ev, step) {
      if (on('F5') && stancesOf(s).length) { ev.push({ type: 'phase', text: '── 【ラボ】味方の構えの発動（構えた順） ──' }); fireStances(s, ev, step); }
      if (on('F7') && s.labBench) { ev.push({ type: 'phase', text: '── 【ラボ】作業台 ──' }); craft(s, ev, step); }
    }


    // ---------------------------------------------------------------
    // B 新しい組み合わせ（新しい自然は TILE_INFO と CH に足す。TILES（エディットの並び）には入れない）
    //   5つの性質（通れるか／風をさえぎるか／燃えるか／雷が落ちるか／水が当たると）は DECISIONS.md
    // ---------------------------------------------------------------
    var LAB_TILES = {
      reeds:      { name: '葦原',       label: '葦', passable: true,  ch: 'e' },   // B14 川に草
      bog:        { name: '底なし沼',   label: '淵', passable: false, ch: 'n' },   // B13 泥沼に闇
      sandstorm:  { name: '砂嵐',       label: '砂', passable: true,  ch: 'S' },   // B17 風に土
      frost:      { name: '霜',         label: '霜', passable: true,  ch: 'f' },   // B20 空きに氷
      gloom:      { name: '暗がり',     label: '暗', passable: true,  ch: 'y' },   // B20 空きに闇
      deepforest: { name: '深い森',     label: '深', passable: true,  ch: 'Z' },   // B21 森に草
      icewall:    { name: '氷の壁',     label: '壁', passable: false, ch: 'J' },   // B21 氷に氷
      snowmt:     { name: '雪山',       label: '雪', passable: false, ch: 'N' }    // B8 山に氷
    };
    Object.keys(LAB_TILES).forEach(function (t) {
      var d = LAB_TILES[t];
      if (!I.TILE_INFO[t]) I.TILE_INFO[t] = { name: d.name, label: d.label, passable: d.passable };
      if (!I.CH[d.ch]) I.CH[d.ch] = t;
    });
    LAB_SPREAD_BLOCK.snowmt = true; LAB_SPREAD_BLOCK.icewall = true; LAB_SPREAD_BLOCK.bog = true;
    function finish(ctx, ev, name, cells, damage, origin, text, extra) {
      var f = { name: name, cells: cells, damage: damage, origin: origin };
      Object.keys(extra || {}).forEach(function (k) { f[k] = extra[k]; });
      ctx.finishers.push(f);
      var e = { type: 'finisher', name: name, isNew: true, origin: origin, cells: cells, damage: damage, text: text, wave: waveFrom(cells, origin) };
      Object.keys(extra || {}).forEach(function (k) { e[k] = extra[k]; });
      ev.push(e);
      return f;
    }
    function onceIn(ctx, k) { ctx.labDone = ctx.labDone || {}; if (ctx.labDone[k]) return false; ctx.labDone[k] = true; return true; }
    // 一直線に盤の端まで（stop の自然の手前で止まる）
    function lineFrom(s, x, y, dir, stop) {
      var F = DIRS[dir], out = [];
      for (var i = 1; i < 20; i++) {
        var cx = x + F.dx * i, cy = y + F.dy * i;
        if (!inBounds(s, cx, cy) || stop[getTile(s, cx, cy)]) break;
        out.push([cx, cy]);
      }
      return out;
    }
    function around8(s, cells) {
      var out = [], seen = {};
      cells.forEach(function (c) { for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var x = c[0] + dx, y = c[1] + dy, k = key(x, y);
        if (inBounds(s, x, y) && !seen[k]) { seen[k] = true; out.push([x, y]); }
      } });
      return out;
    }
    function hitAll(s, ctx, cells, amount, src) {
      var done = {};
      cells.forEach(function (c) { var o = unitAt(s, c[0], c[1]); if (o && !done[o.id]) { done[o.id] = true; addHit(ctx, o, amount, src || 'finisher', c); } });
    }
    var HARD = { mountain: true, volcano: true, sakura: true, hillsakura: true, snowmt: true, icewall: true, haunted: true, tornado: true, lava: true };

    // 置く・点ける魔法（草・土・火）
    placeMore.push(function (s, u, x, y, t, o, facing, ctx, ev) {
      var m = u.magic, low = B.grow.enabled ? 'hill' : 'mountain';
      if (m === 'grass') {
        if (on('B2') && t === 'thicket' && B.grow.enabled && !opt('B2', 'alsoGrass')) { ctx.phrases.push('【ラボ】草むらに草は当たっても育たない（森は水で）'); return true; }
        if (on('B3') && t === 'deadforest') { var dead = connected(s, x, y, 'deadforest'); dead.forEach(function (c) { setTile(s, c[0], c[1], 'forest'); }); ctx.phrases.push('【ラボ】死の森に草が芽吹いて、森によみがえった（' + dead.length + 'マス）'); return true; }
        if (on('B14') && t === 'river') { setTile(s, x, y, 'reeds'); ctx.phrases.push('【ラボ】川に葦が茂って葦原になった（歩いて渡れる。水のまま）'); return true; }
        if (on('B21') && t === 'forest' && !o) { setTile(s, x, y, 'deepforest'); ctx.phrases.push('【ラボ】森がさらに茂って深い森になった'); return true; }
        if (on('B21') && (t === 'sakura' || t === 'hillsakura')) {
          var bloom = [];
          neighbors(s, x, y).forEach(function (n) { var nt = getTile(s, n.x, n.y); if (nt === 'mountain') { setTile(s, n.x, n.y, 'sakura'); bloom.push([n.x, n.y]); } else if (nt === 'hill' && !unitAt(s, n.x, n.y)) { setTile(s, n.x, n.y, 'hillsakura'); bloom.push([n.x, n.y]); } });
          ctx.phrases.push('【ラボ】桜が満開になり、隣の山・丘にも咲いた（' + bloom.length + 'マス）');
          return true;
        }
      } else if (m === 'earth') {
        if (on('B5') && t === 'firewhirl' && onceIn(ctx, 'B5')) { bigMountain(s, u, x, y, facing, ctx, ev); return true; }
        if (on('B5') && t === 'firewhirl') return true;
        if (on('B9') && t === 'volcano') { coolVolcano(s, x, y, ctx, '土でふさがれて'); return true; }
        if ((on('B17') || non()) && I.isWind(t)) { var sand = I.connected(s, x, y, t).concat(t === 'breeze' ? connected(s, x, y, 'gale') : connected(s, x, y, 'breeze')); var n = 0;
          sand.forEach(function (c) { if (I.isWind(getTile(s, c[0], c[1]))) { setTile(s, c[0], c[1], 'sandstorm'); n++; } });
          ctx.phrases.push('【ラボ】風が土を巻き上げて砂嵐になった（' + n + 'マス。中の者は見えない。ターン終了でおさまる）'); return true; }
      } else if (m === 'fire') {
        if (on('B10') && t === 'mud') { setTile(s, x, y, low); ctx.phrases.push('【ラボ】泥沼が焼き固まって' + tileName(low) + 'になった'); return true; }
        if (on('B15') && t === 'mirage' && onceIn(ctx, 'B15')) { steamBlast(s, x, y, ctx, ev); return true; }
        if ((on('B17') || non()) && t === 'sandstorm' && onceIn(ctx, 'B17')) { ctx.phrases.push('砂嵐に火が入った'); dustBlast(s, x, y, ctx, ev); return true; }
      }
      return false;
    });
    // ラボで足した自然に「火が当たった」（C6・G4 の連鎖でも同じ）
    touchFireExtra = function (s, x, y, t, dir, ctx, ev, tag) {
      if (t === 'sandstorm' && (on('B17') || non()) && onceIn(ctx, 'B17')) { dustBlast(s, x, y, ctx, ev); return true; }
      if (t === 'mirage' && on('B15') && onceIn(ctx, 'B15')) { steamBlast(s, x, y, ctx, ev); return true; }
      if (t === 'mud' && on('B10')) { setTile(s, x, y, B.grow.enabled ? 'hill' : 'mountain'); return true; }
      if (t === 'deepforest') { setTile(s, x, y, 'fire'); return true; }
      if (t === 'frost' || t === 'gloom') { setTile(s, x, y, 'empty'); return true; }
      if (t === 'icewall') { setTile(s, x, y, 'puddle'); ctx.phrases.push(tag + '氷の壁が溶けて水たまりになった'); return true; }
      if (t === 'snowmt') { setTile(s, x, y, 'mountain'); ctx.phrases.push(tag + '雪が溶けて山に戻った'); return true; }
      return false;
    };
    placeMore.push(function (s, u, x, y, t, o, facing, ctx, ev) {
      if (u.magic !== 'fire') return false;
      if (t === 'deepforest') { setTile(s, x, y, 'fire'); ctx.phrases.push('【ラボ】深い森が燃えた'); return true; }
      if (t === 'frost' || t === 'gloom') { setTile(s, x, y, 'empty'); ctx.phrases.push('【ラボ】' + tileName(t) + 'が火で消えた'); return true; }
      if (t === 'icewall') { setTile(s, x, y, 'puddle'); ctx.phrases.push('【ラボ】氷の壁が溶けて水たまりになった'); return true; }
      if (t === 'snowmt') { setTile(s, x, y, 'mountain'); ctx.phrases.push('【ラボ】雪が溶けて山に戻った'); return true; }
      return false;
    });
    // B5: 火の渦に土で、2×2の大きな山（中の者は外へ押し出す。押せなければそのマスは山にならない）
    function bigMountain(s, u, x, y, facing, ctx, ev) {
      var cells = connected(s, x, y, 'firewhirl'), cx = 0, cy = 0;
      cells.forEach(function (c) { cx += c[0]; cy += c[1]; }); cx /= cells.length; cy /= cells.length;
      var made = [];
      cells.forEach(function (c) {
        var o = unitAt(s, c[0], c[1]);
        if (o) {
          var dx = c[0] - cx, dy = c[1] - cy, dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
          addHit(ctx, o, u.power, 'direct');
          if (!I.pushOne(s, o, dir, ev, '【ラボ】' + unitLabel(s, o) + 'は盛り上がる山に押し出された')) return;
        }
        setTile(s, c[0], c[1], 'mountain'); made.push(c);
      });
      ctx.phrases.push('【ラボ】火の渦に土をかぶせて火を埋め、大きな山（' + made.length + 'マス）になった');
    }
    function coolVolcano(s, x, y, ctx, why) {
      var cells = connected(s, x, y, 'volcano');
      cells.forEach(function (c) { setTile(s, c[0], c[1], 'mountain'); });
      ctx.phrases.push('【ラボ】火山が' + why + '冷え、山に戻った（' + cells.length + 'マス）');
    }
    // B15: 水蒸気爆発（蜃気楼にもう一度火）。蜃気楼とまわり1マスの者に20
    function steamBlast(s, x, y, ctx, ev) {
      var core = connected(s, x, y, 'mirage');
      var cells = around8(s, core);
      core.forEach(function (c) { setTile(s, c[0], c[1], 'empty'); });
      hitAll(s, ctx, cells, B.fire.strongDamage);
      finish(ctx, ev, '水蒸気爆発', cells, B.fire.strongDamage, [x, y], '【ラボ】水蒸気爆発！ 熱しすぎた蜃気楼が爆ぜた（まわり1マスに威力' + B.fire.strongDamage + '）');
    }
    // B17: 粉塵爆発（砂嵐に火）。砂嵐のマスとまわり1マスの者に20
    function dustBlast(s, x, y, ctx, ev) {
      var core = connected(s, x, y, 'sandstorm');
      var cells = around8(s, core);
      core.forEach(function (c) { setTile(s, c[0], c[1], 'empty'); });
      hitAll(s, ctx, cells, B.fire.strongDamage);
      finish(ctx, ev, '粉塵爆発', cells, B.fire.strongDamage, [x, y], '【ラボ】粉塵爆発！ 砂嵐に火が入って爆ぜた（砂嵐' + core.length + 'マスとまわり1マスに威力' + B.fire.strongDamage + '）');
    }

    // 流れる（水）の1マス。止まるなら止まった理由を返す
    function flowCell(s, u, x, y, t, facing, ctx, ev, o) {
      if (on('B12') && t === 'mud' && onceIn(ctx, 'B12')) { debrisFlow(s, x, y, facing, ctx, ev); return '泥沼に水が流れこんだ'; }
      if (o) return null;   // 人がいるマスは今どおり（直撃して止まる）
      var nf = nFlowCell(s, u, x, y, t, facing, ctx, ev); if (nf) return nf;   // N: 大樹・業火・竜巻に水（覚醒先の新しい組み合わせ）
      if ((on('I4') || non()) && t === 'rock') { rollRock(s, x, y, facing, ctx, ev); return '岩に水が当たった'; }   // I4: 水で岩が転がる（N: 土の変化「岩」も）
      if (on('B2') && t === 'thicket' && B.grow.enabled) { setTile(s, x, y, 'forest'); ctx.cells.push([x, y]); return '【ラボ】草むらが水を吸って森に育った'; }
      if (on('B9') && t === 'volcano') { coolVolcano(s, x, y, ctx, '水で'); return '火山に水がかかった'; }
      if (on('B7') && (t === 'sakura' || t === 'hillsakura') && onceIn(ctx, 'B7')) { hanaikada(s, x, y, x, y, facing, ctx, ev); return '桜に水が当たった'; }
      var F7 = DIRS[facing];
      var side = neighbors(s, x, y).filter(function (n) { var nt = getTile(s, n.x, n.y); return (nt === 'sakura' || nt === 'hillsakura') && !(n.x === x + F7.dx && n.y === y + F7.dy); });   // 正面の桜は、次のマスで「当たる」
      if (on('B7') && (t === 'empty' || t === 'puddle') && side.length && onceIn(ctx, 'B7')) {
        var sk = side[0];
        hanaikada(s, sk.x, sk.y, x - DIRS[facing].dx, y - DIRS[facing].dy, facing, ctx, ev);
        return '桜のそばを水が流れた';
      }
      if (on('B11') && I.isWind(t)) { rain(s, x, y, ctx); return '【ラボ】風が水を運んで雨になった'; }
      return null;
    }
    // B7: 花筏（桜の花びらが流れに乗って、水の向きへ盤の端まで一直線）
    function hanaikada(s, sx, sy, fx, fy, dir, ctx, ev) {
      var path = lineFrom(s, fx, fy, dir, HARD);
      var t = getTile(s, sx, sy);
      setTile(s, sx, sy, t === 'hillsakura' ? 'hill' : 'mountain');
      path.forEach(function (c) { if (getTile(s, c[0], c[1]) === 'empty') setTile(s, c[0], c[1], 'petals'); });
      hitAll(s, ctx, path, B.fire.strongDamage);
      finish(ctx, ev, '花筏', path, B.fire.strongDamage, [fx, fy], '【ラボ】花筏！ 散った桜の花びらが流れに乗って、' + DIRS[dir].name + 'へ一直線に流れた（威力' + B.fire.strongDamage + '）', { dir: dir });
    }
    // B11: 雨（風の通り道に水たまり。炎は消える）
    function rain(s, x, y, ctx) {
      var w = connected(s, x, y, getTile(s, x, y)).concat(getTile(s, x, y) === 'breeze' ? connected(s, x, y, 'gale') : connected(s, x, y, 'breeze'));
      var n = 0, seen = {};
      w.forEach(function (c) {
        if (seen[key(c[0], c[1])]) return; seen[key(c[0], c[1])] = true;
        setTile(s, c[0], c[1], 'puddle'); ctx.cells.push(c); n++;
        neighbors(s, c[0], c[1]).forEach(function (q) { var qt = getTile(s, q.x, q.y); if (qt === 'fire' || qt === 'smallfire') setTile(s, q.x, q.y, 'empty'); });
      });
      ctx.phrases.push('【ラボ】風の通り道に雨が降った（水たまり' + n + 'マス）');
    }
    // B12: 土石流（泥沼から水の向きへ盤の端まで一直線。通り道は泥沼）
    function debrisFlow(s, x, y, dir, ctx, ev) {
      var path = [[x, y]].concat(lineFrom(s, x, y, dir, HARD));
      path.forEach(function (c) { var t = getTile(s, c[0], c[1]); if (t === 'empty' || t === 'puddle' || t === 'smallfire' || t === 'fire' || I.isPlant(t)) setTile(s, c[0], c[1], 'mud'); });
      hitAll(s, ctx, path, B.fire.strongDamage);
      finish(ctx, ev, '土石流', path, B.fire.strongDamage, [x, y], '【ラボ】土石流！ 泥沼が押し流され、' + DIRS[dir].name + 'へ一直線に流れ下った（威力' + B.fire.strongDamage + '）', { dir: dir });
    }

    // 吹き抜ける（風）の1マス。止まるなら true
    function blowCell(s, u, x, y, t, facing, ctx, ev) {
      if (nBlowCell(s, u, x, y, t, facing, ctx, ev)) return true;   // N: 岩山・氷に風（覚醒先の新しい組み合わせ）
      if (t === 'rock' && (on('I4') || non())) { ctx.cells.push([x, y]); rollRock(s, x, y, facing, ctx, ev); return true; }   // I4: 風で岩が転がる（N: 土の変化「岩」も）
      if (t === 'snowmt' && on('B8')) { ctx.cells.push([x, y]); if (onceIn(ctx, 'B8')) avalanche(s, x, y, facing, ctx, ev); return true; }
      if (t === 'icewall' || t === 'snowmt' || t === 'bog') { ctx.phrases.push(tileName(t) + 'で風が止まった'); return true; }
      if (on('B6') && t === 'volcano' && B.sakura.from !== 'fire' && onceIn(ctx, 'B6')) { ctx.cells.push([x, y]); sparks(s, x, y, facing, ctx, ev); return true; }
      if (on('B16') && (t === 'river' || t === 'puddle') && onceIn(ctx, 'B16')) {
        var body = I.connected(s, x, y, t).concat(connected(s, x, y, t === 'river' ? 'puddle' : 'river'));
        var water = [], seen = {};
        body.forEach(function (c) { var k = key(c[0], c[1]); if (!seen[k]) { seen[k] = true; water.push(c); } });
        if (water.length >= 8) { ctx.cells.push([x, y]); typhoon(s, water, facing, ctx, ev); return true; }
      }
      return false;
    }
    // B4: 風が森を吹き抜けると、風下の最初の空き1マスに草むら（育つが切なら森）
    afterShotMore.push(function (s, u, facing, ctx, ev) {
      if (!on('B4') || u.magic !== 'wind') return;
      var F = DIRS[facing], seenForest = false, spot = null;
      var cells = ctx.cells.slice();
      if (cells.length) { var last = cells[cells.length - 1]; cells.push([last[0] + F.dx, last[1] + F.dy]); }
      cells.forEach(function (c) {
        if (spot || !inBounds(s, c[0], c[1])) return;
        var t = getTile(s, c[0], c[1]);
        if (t === 'forest' || t === 'deepforest') { seenForest = true; return; }
        if (seenForest && (t === 'empty' || I.isWind(t)) && !unitAt(s, c[0], c[1])) spot = c;
      });
      if (!spot) return;
      var seed = B.grow.enabled ? 'thicket' : 'forest';
      setTile(s, spot[0], spot[1], seed);
      ev.push({ type: 'kindle', cells: [spot], text: '【ラボ】風が森の種を運び、風下に' + tileName(seed) + 'が芽吹いた' });
    });
    // B6: 火の粉（火山に風。風下の扇 1・3 へ。山・川を越える。2段目）
    function sparks(s, x, y, dir, ctx, ev) {
      var F = DIRS[dir], R = [-F.dy, F.dx], cells = [];
      [[0, 1], [-1, 2], [0, 2], [1, 2]].forEach(function (p) { var cx = x + F.dx * p[1] + R[0] * p[0], cy = y + F.dy * p[1] + R[1] * p[0]; if (inBounds(s, cx, cy)) cells.push([cx, cy]); });
      var burned = 0;
      cells.forEach(function (c) {
        var t = getTile(s, c[0], c[1]);
        if (I.isPlant(t) || t === 'deepforest') { setTile(s, c[0], c[1], 'fire'); burned++; }
        else if (t === 'empty') setTile(s, c[0], c[1], 'smallfire');
      });
      hitAll(s, ctx, cells, B.fire.weakDamage, 'weakfire');
      connected(s, x, y, 'volcano').forEach(function (c) { setTile(s, c[0], c[1], 'mountain'); });
      finish(ctx, ev, '火の粉', cells, B.fire.weakDamage, [x, y], '【ラボ】火の粉！ 火山から風下へ火の粉が飛んだ（森' + burned + 'マスが燃えた。者には弱い炎' + B.fire.weakDamage + '＋火傷。火山は冷えて山に）', { stage: 2 });
    }
    // B16: 台風（広い水に風。目の2×2は無事、ほかの水の上と隣の者は風下へ2マス押し流され、弱い5）
    function typhoon(s, water, dir, ctx, ev) {
      var xs = water.map(function (c) { return c[0]; }), ys = water.map(function (c) { return c[1]; });
      var ex = Math.floor((Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2), ey = Math.floor((Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2);
      var eye = [[ex, ey], [ex + 1, ey], [ex, ey + 1], [ex + 1, ey + 1]];
      var zone = around8(s, water).filter(function (c) { return !has(eye, c[0], c[1]); });
      var victims = [];
      zone.forEach(function (c) { var o = unitAt(s, c[0], c[1]); if (o && victims.indexOf(o) < 0 && !I.isFixed(o)) victims.push(o); });
      victims.forEach(function (o) { addHit(ctx, o, B.fire.weakDamage, 'weakfire', [o.x, o.y]); });
      water.forEach(function (c) { setTile(s, c[0], c[1], 'puddle'); });
      victims.forEach(function (o) {
        var w = I.findUnit(s, o.id);
        if (!w) return;
        if (I.pushOne(s, w, dir, ev, '【ラボ】' + unitLabel(s, w) + 'は台風に押し流された')) I.pushOne(s, I.findUnit(s, o.id) || w, dir, ev, '【ラボ】' + unitLabel(s, w) + 'はさらに押し流された');
      });
      finish(ctx, ev, '台風', zone, B.fire.weakDamage, [ex, ey], '【ラボ】台風！ 広い水に風が渦巻いた（目の2×2は無事。まわりの者は' + DIRS[dir].name + 'へ押し流され、弱い' + B.fire.weakDamage + '）', { eye: eye });
    }
    // B8: 雪崩（雪山に風か雷。当たった向きの奥へ、雪山の端から盤の端まで一直線。通り道の空き・水は氷）
    function avalanche(s, x, y, dir, ctx, ev) {
      var F = DIRS[dir], cx = x, cy = y;
      while (inBounds(s, cx + F.dx, cy + F.dy) && getTile(s, cx + F.dx, cy + F.dy) === 'snowmt') { cx += F.dx; cy += F.dy; }
      var path = lineFrom(s, cx, cy, dir, { mountain: true, sakura: true, volcano: true, hillsakura: true, icewall: true, haunted: true, tornado: true });
      path.forEach(function (c) { var t = getTile(s, c[0], c[1]); if (t === 'empty' || t === 'river' || t === 'puddle' || t === 'smallfire' || t === 'fire') setTile(s, c[0], c[1], 'ice'); });
      hitAll(s, ctx, path, B.fire.strongDamage);
      connected(s, x, y, 'snowmt').forEach(function (c) { setTile(s, c[0], c[1], 'mountain'); });
      finish(ctx, ev, '雪崩', path, B.fire.strongDamage, [cx, cy], '【ラボ】雪崩！ 雪山から' + DIRS[dir].name + 'へ一直線に雪が崩れ落ちた（威力' + B.fire.strongDamage + '。通り道は氷）', { dir: dir });
    }

    // 走る（雷）: 高いものとして落ちる自然と、その作用
    function tallTile(t) { return (t === 'deepforest' && on('B21')) || (t === 'snowmt') || (t === 'icewall') || (t === 'pillar' && on('I8')) || (t === 'bigtree' && on('L0')); }
    function strikeTall(s, u, x, y, t, facing, ctx, ev) {
      if (on('L0') && t === 'bigtree') { setTile(s, x, y, 'fire'); ctx.phrases.push('【道】雷が大樹に落ちて燃えた'); return true; }
      if (on('I8') && t === 'pillar') { ctx.phrases.push('【ラボ】雷が金の柱に落ちた'); I.doShock(s, x, y, ctx, ev, {}); return true; }
      if (on('B3') && t === 'deadforest') { ctx.phrases.push('【ラボ】雷が死の森に落ちて木が燃えた'); I.doHaunt(s, x, y, ctx, ev); return true; }
      if (on('B8') && t === 'snowmt') { ctx.phrases.push('【ラボ】雷が雪山に落ちた'); avalanche(s, x, y, facing, ctx, ev); return true; }
      if (t === 'deepforest') { setTile(s, x, y, 'fire'); ctx.phrases.push('【ラボ】雷が深い森に落ちて燃えた'); return true; }
      return false;
    }
    // 凍らせる（氷）の1マス。'stop' で止まる、'pass' で通り過ぎる、null は今の作用
    function chillCell(s, u, x, y, t, o, facing, ctx, ev) {
      if (on('B8') && t === 'mountain') { var mt = connected(s, x, y, 'mountain'); mt.forEach(function (c) { setTile(s, c[0], c[1], 'snowmt'); }); ctx.phrases.push('【ラボ】冷気で山に雪が積もり、雪山になった（' + mt.length + 'マス）'); return 'stop'; }
      if (on('B9') && t === 'volcano') { coolVolcano(s, x, y, ctx, '冷気で'); return 'stop'; }
      if (on('B18') && I.isWind(t) && onceIn(ctx, 'B18')) {
        var w = connected(s, x, y, t).concat(connected(s, x, y, t === 'breeze' ? 'gale' : 'breeze')), n = 0;
        w.forEach(function (c) {
          var q = unitAt(s, c[0], c[1]);
          if (q && !q.stuck) { q.stuck = true; n++; ev.push({ type: 'mud', id: q.id, cells: [c], text: '【ラボ】' + unitLabel(s, q) + 'は吹雪で足が凍りついた（次の移動は1回休み）' }); }
          neighbors(s, c[0], c[1]).forEach(function (nb) { var nt = getTile(s, nb.x, nb.y); if (nt === 'river' || nt === 'puddle') setTile(s, nb.x, nb.y, 'ice'); });
        });
        ctx.phrases.push('【ラボ】風に冷気が乗って吹雪になった（' + n + '人の足が凍った）');
        return 'stop';
      }
      if (on('B21') && t === 'ice' && !o) { setTile(s, x, y, 'icewall'); ctx.phrases.push('【ラボ】氷が積み重なって氷の壁になった'); return 'stop'; }
      if (on('B20') && t === 'empty' && !o) { setTile(s, x, y, 'frost'); ctx.phrases.push('【ラボ】霜が降りた'); return 'pass'; }
      return null;
    }
    // 吸う（闇）の1マス（B13 底なし沼・B19 かまいたち・B20 暗がり）
    darkExtra.push(function (s, u, x, y, t, o, facing, ctx, ev) {
      if (on('B13') && t === 'mud') {
        var bog = connected(s, x, y, 'mud');
        bog.forEach(function (c) { setTile(s, c[0], c[1], 'bog'); });
        pullToward(s, [x, y], B.dark.pullRange, [], ev, 'は底なし沼に引き寄せられた');
        var inside = bog.filter(function (c) { return unitAt(s, c[0], c[1]); });
        hitAll(s, ctx, inside, B.fire.strongDamage);
        inside.forEach(function (c) { var q = unitAt(s, c[0], c[1]); if (q) { q.stuck = true; if (on('E9')) enclose(s, q, ev); } });
        finish(ctx, ev, '底なし沼', bog, B.fire.strongDamage, [x, y], '【ラボ】底なし沼！ 泥沼が闇に吸われて底が抜けた（' + bog.length + 'マス。中の者は沈む: 威力' + B.fire.strongDamage + '）', { inward: true });
        return true;
      }
      if (on('B19') && t === 'gale') {
        var line = connected(s, x, y, 'gale');
        line.forEach(function (c) { setTile(s, c[0], c[1], 'empty'); });
        hitAll(s, ctx, line, B.fire.strongDamage);
        finish(ctx, ev, 'かまいたち', line, B.fire.strongDamage, [x, y], '【ラボ】かまいたち！ 闇が強風を吸って真空ができ、強風の通り道を切り裂いた（威力' + B.fire.strongDamage + '）');
        return true;
      }
      if (on('B20') && t === 'empty' && !o) { setTile(s, x, y, 'gloom'); ctx.phrases.push('【ラボ】暗がりができた'); return false; }
      return false;
    });
    // ターンの終わり: 砂嵐・霜・暗がりは消え、底なし沼は泥沼に戻る
    function sweepLab(s, ev) {
      var gone = 0, back = 0, hills = [];
      for (var i = 0; i < s.tiles.length; i++) {
        var t = s.tiles[i];
        if (t === 'sandstorm' && keepTile(s, i % s.size, Math.floor(i / s.size), t)) continue;   // N 広げる2: もう1ターン残る
        if (t === 'sandstorm' && non()) { I.setTile(s, i % s.size, Math.floor(i / s.size), 'hill'); hills.push([i % s.size, Math.floor(i / s.size)]); continue; }   // N: 砂嵐はおさまると丘が残る（風に土でも、融合の砂嵐でも）
        if (t === 'sandstorm' || t === 'frost' || t === 'gloom') { I.setTile(s, i % s.size, Math.floor(i / s.size), 'empty'); gone++; }
        else if (t === 'bog') { I.setTile(s, i % s.size, Math.floor(i / s.size), 'mud'); back++; }
      }
      if (gone) ev.push({ type: 'smallfireOut', text: '【ラボ】砂嵐・霜・暗がりが消えた（' + gone + 'マス）' });
      if (back) ev.push({ type: 'info', text: '【ラボ】底なし沼が泥沼に戻った（' + back + 'マス）' });
      if (hills.length) ev.push({ type: 'kindle', cells: hills, text: '【ラボ N】砂嵐がおさまって、丘が残った（' + hills.length + 'マス）' });
    }


    // ---------------------------------------------------------------
    // I 新しい魔法（光・森・岩・蔓・雨・音・金）。その案がオンのときだけ選べる（rules.js の LAB_MAGIC）
    // ---------------------------------------------------------------
    var NEW_MAGIC = {
      light: { name: '光', verb: '照らす' }, forestm: { name: '森', verb: '茂らせる' }, rock: { name: '岩', verb: '転がす' },
      vine: { name: '蔓', verb: 'からめる' }, rain: { name: '雨', verb: '降らす' }, sound: { name: '音', verb: '響く' }, metal: { name: '金', verb: '導く' }
    };
    Object.keys(NEW_MAGIC).forEach(function (m) { if (!I.MAGIC_INFO[m]) { I.MAGIC_INFO[m] = NEW_MAGIC[m]; I.MAGICS.push(m); } });
    var I_TILES = {
      rock:       { name: '岩',     label: '岩', passable: false, ch: 'r' },   // I4
      stepstone:  { name: '飛び石', label: '石', passable: true,  ch: 't' },   // I4 川に落ちた岩
      vinebridge: { name: '蔓の橋', label: '蔓', passable: true,  ch: 'v' },   // I5
      pillar:     { name: '金の柱', label: '柱', passable: false, ch: 'l' }    // I8
    };
    Object.keys(I_TILES).forEach(function (t) {
      var d = I_TILES[t];
      if (!I.TILE_INFO[t]) I.TILE_INFO[t] = { name: d.name, label: d.label, passable: d.passable };
      if (!I.CH[d.ch]) I.CH[d.ch] = t;
      LAB_TILES[t] = d;
    });
    LAB_SPREAD_BLOCK.rock = true; LAB_SPREAD_BLOCK.pillar = true;
    var NEW_SHAPES = { forestm: B.shapes.grass, rock: [[0, 1]], vine: [[0, 1], [0, 2]], rain: [[0, 1], [1, 1], [0, 2], [1, 2]], sound: [[0, 1], [0, 2], [0, 3]], metal: [[0, 1]] };
    cellsMore.push(function (s, u, o, facing) {
      if (u.magic === 'light') return lightPath(s, u, o, facing).cells;
      var shp = NEW_SHAPES[u.magic];
      return shp ? shapeAt(s, shp, o, facing) : null;
    });
    castMore.push(function (s, u, facing, ctx, ev) {
      var m = u.magic;
      if (!NEW_MAGIC[m]) return false;
      if (m === 'light') light(s, u, facing, ctx, ev);
      else if (m === 'forestm') forestMagic(s, u, facing, ctx, ev);
      else if (m === 'rock') rockMagic(s, u, facing, ctx, ev);
      else if (m === 'vine') vine(s, u, facing, ctx, ev);
      else if (m === 'rain') rainMagic(s, u, facing, ctx, ev);
      else if (m === 'sound') sound(s, u, facing, ctx, ev);
      else if (m === 'metal') metal(s, u, facing, ctx, ev);
      return true;
    });

    // I1: 光の通り道（右斜め前へ3マス。水に当たると右へ90°曲がって、そこから3マス。I2: 氷は通り抜けて、その先に火）
    var LIGHT_STOP = { forest: true, deepforest: true, mountain: true, hill: true, volcano: true, sakura: true, hillsakura: true, snowmt: true, icewall: true, pillar: true, rock: true, tornado: true, firewhirl: true, haunted: true };
    function lightPath(s, u, o, facing) {
      var F = DIRS[facing], R = [-F.dy, F.dx];
      var v = [F.dx + R[0], F.dy + R[1]], x = o.x, y = o.y, left = 3, cells = [], hit = null, bends = 0, focus = null;
      for (var guard = 0; guard < 20 && left > 0; guard++) {
        x += v[0]; y += v[1]; left--;
        if (!inBounds(s, x, y)) break;
        cells.push([x, y]);
        var t = getTile(s, x, y), q = unitAt(s, x, y);
        if (q) { hit = { kind: 'unit', at: [x, y] }; break; }
        if (waterTile(t) && t !== 'stepstone') { if (bends < 4) { v = [-v[1], v[0]]; left = 3; bends++; } continue; }
        if (t === 'ice' && on('I2')) { var fx = x + v[0], fy = y + v[1]; if (inBounds(s, fx, fy)) { cells.push([fx, fy]); focus = [fx, fy]; } hit = { kind: 'focus', at: focus }; break; }
        if (t === 'thicket' || t === 'deadforest' || t === 'haunted' || t === 'gloom') { hit = { kind: 'tile', at: [x, y], t: t }; break; }
        if (LIGHT_STOP[t] || t === 'ice') { hit = { kind: 'stop', at: [x, y], t: t }; break; }
      }
      return { cells: cells, hit: hit, bends: bends };
    }
    function light(s, u, facing, ctx, ev) {
      var o = I.castOrigin(s, u, facing), p = lightPath(s, u, o, facing);
      p.cells.forEach(function (c) { ctx.cells.push(c); });
      if (p.bends) ctx.phrases.push('【ラボ】光が水に反射して曲がった（' + p.bends + '回）');
      var h = p.hit;
      if (!h) { ctx.phrases.push('光は何にも当たらなかった'); return; }
      if (h.kind === 'unit') {
        var q = unitAt(s, h.at[0], h.at[1]);
        addHit(ctx, q, u.power, 'direct');
        q.labLit = true;
        ctx.phrases.push('【ラボ】光が' + unitLabel(s, q) + 'を照らした（ターンの終わりまで、隠れていても見える）');
      } else if (h.kind === 'focus') {
        if (!h.at) { ctx.phrases.push('【ラボ】氷を通った光が盤の外へ抜けた'); return; }
        var t = getTile(s, h.at[0], h.at[1]);
        if (I.isPlant(t) || t === 'deepforest') { setTile(s, h.at[0], h.at[1], 'fire'); ctx.phrases.push('【ラボ】氷で集まった光が' + tileName(t) + 'に火を点けた（虫眼鏡）'); }
        else if (t === 'empty') { setTile(s, h.at[0], h.at[1], 'smallfire'); ctx.phrases.push('【ラボ】氷で集まった光で小さな炎がついた（虫眼鏡）'); }
        else touchFire(s, h.at[0], h.at[1], facing, ctx, ev, '虫眼鏡');
        var fq = unitAt(s, h.at[0], h.at[1]);
        if (fq) addHit(ctx, fq, u.power, 'direct');
      } else if (h.kind === 'tile') {
        if (h.t === 'thicket') { setTile(s, h.at[0], h.at[1], 'forest'); ctx.phrases.push('【ラボ】光で草むらが森に育った'); }
        else if (h.t === 'deadforest') { var d = connected(s, h.at[0], h.at[1], 'deadforest'); d.forEach(function (c) { setTile(s, c[0], c[1], 'forest'); }); ctx.phrases.push('【ラボ】光で死の森が森に戻った（' + d.length + 'マス）'); }
        else if (h.t === 'haunted') { setTile(s, h.at[0], h.at[1], 'empty'); ctx.phrases.push('【ラボ】光でオバケヤシキが消えた'); }
        else if (h.t === 'gloom') { setTile(s, h.at[0], h.at[1], 'empty'); ctx.phrases.push('【ラボ】光で暗がりが消えた'); }
      } else ctx.phrases.push('光は' + tileName(h.t) + 'で止まった');
    }
    // I3: 茂らせる（空きは一発で森。草むら・森に当たると、そのかたまりの外側へ形のマス数まで森が広がる）
    function forestMagic(s, u, facing, ctx, ev) {
      var cells = I.castCells(s, u, facing), made = 0, grow = [];
      cells.forEach(function (c) {
        ctx.cells.push(c);
        var q = unitAt(s, c[0], c[1]), t = getTile(s, c[0], c[1]);
        if (q) addHit(ctx, q, u.power, 'direct');
        if (t === 'empty' && (!q || B.ideas.natureUnderUnits)) { setTile(s, c[0], c[1], 'forest'); made++; }
        else if (t === 'thicket' || t === 'forest') { if (t === 'thicket') setTile(s, c[0], c[1], 'forest'); grow.push(c); }
      });
      var spread = 0;
      grow.forEach(function (c) {
        var comp = connectedPlants(s, c[0], c[1]), ring = [];
        comp.forEach(function (p) { neighbors(s, p[0], p[1]).forEach(function (n) { if (getTile(s, n.x, n.y) === 'empty' && !unitAt(s, n.x, n.y) && !has(ring, n.x, n.y)) ring.push([n.x, n.y]); }); });
        ring.slice(0, cells.length).forEach(function (r) { setTile(s, r[0], r[1], 'forest'); ctx.cells.push(r); spread++; });
      });
      ctx.phrases.push('【ラボ】森が茂った（' + made + 'マス' + (spread ? '、まわりへ＋' + spread : '') + '）');
    }
    // I4: 転がす（空きに岩。岩に岩・風・土・水が当たると、当たった向きの奥へ転がる）
    function rockMagic(s, u, facing, ctx, ev) {
      var c = I.castCells(s, u, facing)[0];
      if (!c) { ctx.phrases.push('岩を置く場所がない'); return; }
      ctx.cells.push(c);
      var t = getTile(s, c[0], c[1]), q = unitAt(s, c[0], c[1]);
      if (t === 'rock') { rollRock(s, c[0], c[1], facing, ctx, ev); return; }
      if (q) { addHit(ctx, q, u.power, 'direct'); return; }
      if (t === 'empty') { setTile(s, c[0], c[1], 'rock'); ctx.phrases.push('【ラボ】岩を置いた'); }
      else ctx.phrases.push('岩を置けなかった（' + tileName(t) + '）');
    }
    function rollRock(s, x, y, dir, ctx, ev) {
      if (!onceIn(ctx, 'rock:' + key(x, y))) return;
      var F = DIRS[dir], cx = x, cy = y, path = [], end = null;
      setTile(s, x, y, 'empty');
      for (var i = 0; i < 20; i++) {
        var nx = cx + F.dx, ny = cy + F.dy;
        if (!inBounds(s, nx, ny)) break;
        var t = getTile(s, nx, ny);
        if (t === 'river' || t === 'puddle' || t === 'reeds') { path.push([nx, ny]); end = 'water'; cx = nx; cy = ny; break; }
        if (!I.isPassable(t) && t !== 'empty') break;
        path.push([nx, ny]); cx = nx; cy = ny;
      }
      hitAll(s, ctx, path, B.fire.strongDamage);
      if (end === 'water') setTile(s, cx, cy, 'stepstone');
      else if (cx !== x || cy !== y) { if (!unitAt(s, cx, cy)) setTile(s, cx, cy, 'rock'); else { var back = path.length > 1 ? path[path.length - 2] : [x, y]; setTile(s, back[0], back[1], 'rock'); } }
      else setTile(s, x, y, 'rock');
      finish(ctx, ev, '岩落とし', path, B.fire.strongDamage, [x, y], '【ラボ】岩落とし！ 岩が' + DIRS[dir].name + 'へ転がった（' + path.length + 'マス。通り道の者に威力' + B.fire.strongDamage + '）' + (end === 'water' ? '。川に落ちて飛び石になった' : ''), { dir: dir });
    }
    placeMore.push(function (s, u, x, y, t, o, facing, ctx, ev) { if ((on('I4') || non()) && u.magic === 'earth' && t === 'rock') { rollRock(s, x, y, facing, ctx, ev); return true; } return false; });
    // I5: からめる（森の隣の者は足を取られる。川には、森からつながる蔓の橋）
    function vine(s, u, facing, ctx, ev) {
      var cells = I.castCells(s, u, facing), bridge = 0;
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i]; ctx.cells.push(c);
        var q = unitAt(s, c[0], c[1]), t = getTile(s, c[0], c[1]);
        var nearForest = function (p) { return neighbors(s, p[0], p[1]).some(function (n) { var nt = getTile(s, n.x, n.y); return nt === 'forest' || nt === 'thicket' || nt === 'deepforest' || nt === 'vinebridge'; }); };
        if (q) {
          addHit(ctx, q, u.power, 'direct');
          if (nearForest(c) || I.isPlant(t)) { q.stuck = true; ev.push({ type: 'mud', id: q.id, cells: [c], text: '【ラボ】' + unitLabel(s, q) + 'の足に蔓がからんだ（次の移動は1回休み）' }); }
          else ctx.phrases.push('森のそばでないので、蔓はからまなかった');
          break;
        }
        if (t === 'river' && nearForest(c)) { setTile(s, c[0], c[1], 'vinebridge'); bridge++; continue; }
        if (t === 'river') { ctx.phrases.push('森につながっていない川には、蔓が届かない'); break; }
      }
      if (bridge) ctx.phrases.push('【ラボ】川に蔓の橋がかかった（' + bridge + 'マス。燃えると川に戻る）');
    }
    // I6: 降らす（正面の2×2。炎は消え、空きは水たまり、山に降れば源流。人には直撃なし、火傷は治る）
    function rainMagic(s, u, facing, ctx, ev) {
      var cells = I.castCells(s, u, facing), pud = 0, src = null;
      cells.forEach(function (c) {
        ctx.cells.push(c);
        var q = unitAt(s, c[0], c[1]), t = getTile(s, c[0], c[1]);
        if (q) I.cureBurn(s, q, ctx);
        if (t === 'fire' || t === 'smallfire') { setTile(s, c[0], c[1], 'empty'); ctx.phrases.push('【ラボ】雨で' + tileName(t) + 'が消えた'); }
        else if (t === 'empty' && !q) { setTile(s, c[0], c[1], 'puddle'); pud++; }
        else if (t === 'mountain' && !src) src = c;
      });
      if (pud) ctx.phrases.push('【ラボ】雨が降って水たまりができた（' + pud + 'マス）');
      if (src) {
        var line = lineFrom(s, src[0], src[1], facing, HARD), n = 0;
        for (var i = 0; i < line.length; i++) { var l = line[i]; if (unitAt(s, l[0], l[1])) break; var lt = getTile(s, l[0], l[1]); if (lt === 'empty' || lt === 'puddle' || lt === 'thicket') { setTile(s, l[0], l[1], 'river'); n++; ctx.cells.push(l); } else break; }
        ctx.phrases.push('【ラボ】山に降った雨が源流になって流れ出した（川' + n + 'マス）');
      }
    }
    // I7: 響く（正面3マスの者は、術者の方を振り向く。氷はひびが入って割れる）
    function sound(s, u, facing, ctx, ev) {
      var turned = 0;
      I.castCells(s, u, facing).forEach(function (c) {
        ctx.cells.push(c);
        var q = unitAt(s, c[0], c[1]), t = getTile(s, c[0], c[1]);
        if (q && q.id !== u.id) { var d = I.faceToward(q.x, q.y, u); if (q.facing !== d) { q.facing = d; turned++; ev.push({ type: 'info', id: q.id, cells: [c], text: '【ラボ】' + unitLabel(s, q) + 'は音のした方（' + DIRS[d].name + '）を振り向いた' }); } }
        if (t === 'ice') { setTile(s, c[0], c[1], 'puddle'); ctx.phrases.push('【ラボ】音で氷にひびが入って割れた'); }
      });
      if (!turned) ctx.phrases.push('音が響いた');
    }
    // I8: 導く（目の前に金の柱。雷は柱に落ち、つながった柱と水へ流れる）
    function metal(s, u, facing, ctx, ev) {
      var c = I.castCells(s, u, facing)[0];
      if (!c) return;
      ctx.cells.push(c);
      var q = unitAt(s, c[0], c[1]), t = getTile(s, c[0], c[1]);
      if (q) { addHit(ctx, q, u.power, 'direct'); return; }
      if (t === 'empty') { setTile(s, c[0], c[1], 'pillar'); ctx.phrases.push('【ラボ】金の柱を立てた（雷を導く）'); }
      else ctx.phrases.push('柱を立てられなかった（' + tileName(t) + '）');
    }


    // ---------------------------------------------------------------
    // K 時間と繁栄
    // ---------------------------------------------------------------
    if (!I.TILE_INFO.ash) I.TILE_INFO.ash = { name: '灰', label: '灰', passable: true };   // K2: 燃え尽きた跡。燃えない・風で運ばれない
    if (!I.CH.a) I.CH.a = 'ash';
    LAB_TILES.ash = { name: '灰', label: '灰', passable: true, ch: 'a' };
    function timeMode() { return on('K1') ? (opt('K1', 'mode') || 'now') : 'now'; }
    function timeFrozen() { return timeMode() === 'none'; }
    function flourish() { return on('K2') || timeMode() === 'grow'; }
    function burnedTo(s) { return flourish() ? 'ash' : 'empty'; }
    function wetAt(s, x, y) { return neighbors(s, x, y).some(function (n) { return waterTile(getTile(s, n.x, n.y)); }); }
    // 次のターン終了で育つマス（grow）・よみがえるマス（revive）。fresh は、いま燃え尽きる炎（灰になる）
    function growMarks(s, burnOut) {
      if (!flourish()) return null;
      var grow = [], revive = [];
      for (var i = 0; i < s.tiles.length; i++) {
        var x = i % s.size, y = Math.floor(i / s.size), t = s.tiles[i];
        if (t === 'ash' && ((s.labAge && s.labAge[i]) || 0) + 1 >= 2) revive.push([x, y]);
        else if (t === 'thicket' && wetAt(s, x, y)) grow.push([x, y]);
        else if (t === 'ice' && neighbors(s, x, y).some(function (n) { return getTile(s, n.x, n.y) === 'volcano'; })) grow.push([x, y]);
      }
      return { grow: grow, revive: revive };
    }
    // ターン終了処理のあと: 灰がよみがえる・水辺の草むらが森に・火山のそばの氷が溶ける
    function flourishTurn(s, ev) {
      if (!flourish() || timeFrozen()) return;
      var regrow = [], grown = [], melt = [], seed = B.grow.enabled ? 'thicket' : 'forest';
      var marks = growMarks(s, []);
      var fresh = {};
      for (var i = 0; i < s.tiles.length; i++) {
        if (s.tiles[i] !== 'ash') continue;
        s.labAge = s.labAge || {};
        var a = (s.labAge[i] || 0) + 1;
        if (a >= 2) { regrow.push([i % s.size, Math.floor(i / s.size)]); }
        else { s.labAge[i] = a; fresh[i] = true; }
      }
      marks.grow.forEach(function (c) { var t = getTile(s, c[0], c[1]); if (t === 'thicket') grown.push(c); else if (t === 'ice') melt.push(c); });
      regrow.forEach(function (c) { setTile(s, c[0], c[1], seed); });
      grown.forEach(function (c) { setTile(s, c[0], c[1], 'forest'); });
      melt.forEach(function (c) { setTile(s, c[0], c[1], 'puddle'); });
      if (regrow.length) ev.push({ type: 'kindle', cells: regrow, text: '【ラボ】灰から' + tileName(seed) + 'がよみがえった（' + regrow.length + 'マス）' });
      if (grown.length) ev.push({ type: 'kindle', cells: grown, text: '【ラボ】水辺の草むらが森に育った（' + grown.length + 'マス）' });
      if (melt.length) ev.push({ type: 'kindle', cells: melt, text: '【ラボ】火山のそばの氷が溶けた（' + melt.length + 'マス）' });
    }


    // ---------------------------------------------------------------
    // J 見せ方（ルールは変えない。あと一手のヒントの表と、図鑑の表だけ）
    // ---------------------------------------------------------------
    // J5: あと一手のヒントを全部の決め手に（ラボで足した決め手は、その案がオンのときだけ）
    var MORE_HINTS = [
      { tile: 'fire', magic: 'wind', name: '燃え広がり' }, { tile: 'smallfire', magic: 'wind', name: '燃え広がり' },
      { tile: 'river', magic: 'thunder', name: '感電' }, { tile: 'puddle', magic: 'thunder', name: '感電' },
      { tile: 'river', magic: 'ice', name: '凍結' }, { tile: 'puddle', magic: 'ice', name: '凍結' },
      { tile: 'gale', magic: 'fire', name: '火の渦' }, { tile: 'sakura', magic: 'wind', name: '桜吹雪' },
      { tile: 'deadforest', magic: 'thunder', name: 'オバケヤシキ', lab: 'B3' }, { tile: 'sakura', magic: 'water', name: '花筏', lab: 'B7' },
      { tile: 'snowmt', magic: 'wind', name: '雪崩', lab: 'B8' }, { tile: 'mud', magic: 'water', name: '土石流', lab: 'B12' },
      { tile: 'mud', magic: 'dark', name: '底なし沼', lab: 'B13' }, { tile: 'mirage', magic: 'fire', name: '水蒸気爆発', lab: 'B15' },
      { tile: 'sandstorm', magic: 'fire', name: '粉塵爆発', lab: 'B17' }, { tile: 'gale', magic: 'dark', name: 'かまいたち', lab: 'B19' },
      { tile: 'rock', magic: 'wind', name: '岩落とし', lab: 'I4' }
    ];
    function moreHints() {
      if (!on('J5')) return [];
      var have = {};
      (B.nextHints || []).forEach(function (h) { have[h.tile + ':' + h.magic + ':' + h.name] = true; });
      return MORE_HINTS.filter(function (h) { return (!h.lab || on(h.lab)) && !have[h.tile + ':' + h.magic + ':' + h.name]; });
    }
    // J8: 図鑑（決め手）。stage は舞台（先にある自然）、magic は後から来た魔法
    var ZUKAN = [
      { name: '燃え広がり', stage: '炎', magic: '風', line: '炎があるところに、風が来たから、燃え広がった' },
      { name: '火の渦', stage: '風', magic: '火', line: '風が吹いているところに、火が来たから、火の渦になった' },
      { name: '感電', stage: '水', magic: '雷', line: '水があるところに、雷が来たから、つながった水に雷が走った' },
      { name: '凍結', stage: '水', magic: '氷', line: '水があるところに、冷気が来たから、つながった水が凍った' },
      { name: 'センタクキ', stage: '火の渦', magic: '水', line: '火の渦があるところに、水が来たから、まわりがぐるっと回った' },
      { name: 'オバケヤシキ', stage: '死の森', magic: '火', line: '死の森があるところに、火が来たから、オバケヤシキになった' },
      { name: '桜吹雪', stage: '桜', magic: '風', line: '桜があるところに、風が来たから、桜吹雪になった' },
      { name: '花筏', stage: '桜', magic: '水', line: '桜があるところに、水が来たから、花びらが流れに乗った', lab: 'B7' },
      { name: '雪崩', stage: '雪山', magic: '風・雷', line: '雪山があるところに、風か雷が来たから、雪崩が起きた', lab: 'B8' },
      { name: '土石流', stage: '泥沼', magic: '水', line: '泥沼があるところに、水が来たから、泥ごと押し流した', lab: 'B12' },
      { name: '底なし沼', stage: '泥沼', magic: '闇', line: '泥沼があるところに、闇が来たから、底が抜けた', lab: 'B13' },
      { name: '水蒸気爆発', stage: '蜃気楼', magic: '火', line: '蜃気楼があるところに、もう一度火が来たから、爆ぜた', lab: 'B15' },
      { name: '台風', stage: '広い水', magic: '風', line: '広い水があるところに、風が来たから、台風になった', lab: 'B16' },
      { name: '粉塵爆発', stage: '砂嵐', magic: '火', line: '砂嵐があるところに、火が来たから、爆ぜた', lab: 'B17' },
      { name: 'かまいたち', stage: '強風', magic: '闇', line: '強風があるところに、闇が来たから、真空が走った', lab: 'B19' },
      { name: '火の粉', stage: '火山', magic: '風', line: '火山があるところに、風が来たから、火の粉が飛んだ', lab: 'B6' },
      { name: '岩落とし', stage: '岩', magic: '岩・風・土・水', line: '岩があるところに、魔法が来たから、岩が転がった', lab: 'I4' }
    ];
    function zukanList() { return ZUKAN.filter(function (z) { return !z.lab || on(z.lab); }); }


    // ---------------------------------------------------------------
    // L ターゲットで育つ（サブターゲットと魔法の道）。ターゲットは lab_targets.js、魔法の道は lab_paths.js、画面は lab_target_ui.js
    //   LAB_L2 で方向を「作る・決める・止める・動かす」に組み直した（作るは全魔法に共通。得意な方向は属性ごとに1〜2つ）
    //   L0 がオンのときだけ、盤面とユニットに次を足す
    //     s.labTargets  この戦闘のターゲット [{ id, dir, name, text, check, taker, got }]
    //                   got = { by: 手 } か { cands: [手] }（L1 choose: 戦闘の終わりに選ぶ）。
    //                   how: 'hand' 一手 ／'preparer' 材料（L2）／'maker' 作った ／'stopper' 止めた ／'mover' 動かした
    //                   手 = { id, side, magic }（取った味方がそのあと倒れても、取ったものは残る）
    //     s.labMaker    マスごとの「その自然を作った手」{ マスの番号: { by, side, magic, n } }（撃った1発の中で変わったマス。n は作った順）
    //     s.labShot     撃っている最中の手（1発のあいだだけ）
    //     s.labPlanFin  敵の予告で起きるはずの決め手 { 敵の id: [名前] }、s.labFoil その予告を潰した手 { 敵の id: 手 }
    //     u.labPath     魔法の道（lab_paths.js の形）、u.labHeldBy 敵の足を止めた手、u.labHeldRun 続けて止まった敵の番の数、
    //     u.labMovedBy  敵を動かした味方の手（その敵が撃つまで）、u.labBind 止めるの覚醒（次の敵の番に予告できない）
    //   道が進むのは戦闘の終わり（育ちの画面）。戦闘の中では道は変わらない
    // ---------------------------------------------------------------
    var IS_NODE_L = typeof module !== 'undefined' && module.exports;
    var LT = (IS_NODE_L ? require('./lab_targets.js') : root.LAB_TARGETS) || { DIRS: {}, DIR_ORDER: [], TARGETS: [], TAKERS: {} };
    var LP = (IS_NODE_L ? require('./lab_paths.js') : root.LAB_PATHS) || { PATHS: {}, EXTRA_CELLS: {}, FLAVOR: {} };
    var L_TILES = { bigtree: { name: '大樹', label: '樹', passable: false, ch: 'Y' } };   // LAB_L の草の育てるの覚醒「大樹」（LAB_L2 では道にない。処理は残してある）
    Object.keys(L_TILES).forEach(function (t) {
      var d = L_TILES[t];
      if (!I.TILE_INFO[t]) I.TILE_INFO[t] = { name: d.name, label: d.label, passable: d.passable };
      if (!I.CH[d.ch]) I.CH[d.ch] = t;
      LAB_TILES[t] = d;
    });
    function lon() { return on('L0'); }
    function lclone(o) { return JSON.parse(JSON.stringify(o)); }
    // L1〜L5 はオフなら初期の値（オンにして切り替えを変えると、その値）
    function lopt(id, k, d) { if (!on(id)) return d; var v = opt(id, k); return v === undefined ? d : v; }
    function whoMode() { return lopt('L1', 'who', 'last'); }
    function enemyMode() { return lopt('L2', 'enemy', 'none'); }
    function targetCount() { var n = Math.round(Number(lopt('L3', 'count', 3))); return Math.max(2, Math.min(4, n || 3)); }
    function loseMode() { return lopt('L4', 'lose', 'lose'); }
    // L5 得意でない方向・閉じた方向で達成したときの行き先。make 作るが1マス進む ／nothing 何も起きない ／remain 達成にならず残る
    function destMode() { var v = lopt('L5', 'dest', 'make'); return v === 'nothing' || v === 'remain' ? v : 'make'; }
    var FOREST_LIKE = { forest: true, deepforest: true, bigtree: true };
    var GROWN = { thicket: 'forest', hill: 'mountain', puddle: 'river', breeze: 'gale', smallfire: 'fire' };   // 一段 → 二段
    var INTO = { mud: true, bog: true, forest: true, deepforest: true, river: true, puddle: true, reeds: true };   // 動かす「泥沼・森・川へ」（川は立てる水も）
    function dirName(d) { if (non()) return nWantName(d); var T = mon() ? LPW.DIRS : LT.DIRS; return T[d] ? T[d].name : d; }

    // ---- 魔法の道 ----
    function pathDef(m) { if (non()) return nDef(m); if (mon()) return mDef(m); return LP.PATHS[m] || null; }   // M: 3つの方向の道。N: やりたいことと2つの方面
    // その魔法の道の方向（作る ＋ 得意な方向）
    function dirsOf(m) { var d = pathDef(m); if (non()) return d ? [d.want] : []; if (mon()) return d ? d.dirs.slice() : []; return d ? ['make'].concat(d.dirs) : []; }
    function isGood(m, dir) { var d = pathDef(m); if (non()) return !!d && (dir === d.want || dir === 'free'); return !!d && (dir === 'make' ? !!d.makeGood && !mon() : d.dirs.indexOf(dir) >= 0); }
    // 作るが得意（草・土・水。作るの3マス目で覚醒する）
    function makeGood(m) { if (mon()) return false; var d = pathDef(m); return !!(d && d.makeGood && d.awaken.make); }
    // 覚醒できる方向（作るが得意なら作るも）
    function awakeDirs(m) { var d = pathDef(m); if (non()) return []; if (mon()) return d ? d.dirs.slice() : []; return d ? (makeGood(m) ? ['make'] : []).concat(d.dirs) : []; }
    function newPath(m) { var d = pathDef(m); if (!d) return null; if (non()) return nNew(); if (mon()) return mNew(); var p = { make: 0 }; d.dirs.forEach(function (k) { p[k] = 0; }); p.awake = null; return p; }
    function clamp3(v) { return Math.max(0, Math.min(3, Math.round(Number(v) || 0))); }
    // 道の形をそろえる（各方向 0〜3。覚醒は1つだけ。得意な方向は3に届いた1つが覚醒で、ほかは2まで。
    //   作るは3まで進める。作るが得意なら、ほかに覚醒がないとき3で覚醒。ほかに先に覚醒していれば、3でも覚醒しない）
    function normPath(m, p0) { return withDark(normPathBase(m, p0), p0); }
    function normPathBase(m, p0) {
      if (non()) return nNorm(m, p0);
      if (mon()) return mNorm(m, p0);
      var d = pathDef(m);
      if (!d) return null;
      var p = newPath(m), src = p0 || {};
      p.make = clamp3(src.make);
      var aw = src.awake && awakeDirs(m).indexOf(src.awake) >= 0 && clamp3(src[src.awake]) >= 3 ? src.awake : null;
      d.dirs.forEach(function (k) {
        var v = clamp3(src[k]);
        if (v >= 3 && !aw) aw = k;
        if (v >= 3 && aw !== k) v = 2;
        p[k] = v;
      });
      if (!aw && makeGood(m) && p.make >= 3) aw = 'make';
      p.awake = aw;
      return p;
    }
    function lpathOf(u) { return lon() && u && u.labPath && pathDef(u.magic) ? u.labPath : null; }
    function stepOf(u, dir) { var p = lpathOf(u); return p ? (p[dir] || 0) : 0; }
    function awakeOf(u) { var p = lpathOf(u); if (mon()) return p && p.form ? p.form : null; return p && p.awake ? p.awake : null; }
    function formOf(u) { if (non()) return nFormOf(u); if (mon()) return mFormOf(u); var a = awakeOf(u), d = a ? pathDef(u.magic) : null; return d && d.awaken[a] ? d.awaken[a] : null; }
    function formName(u) { var f = formOf(u); return f ? f.name : null; }
    // 作るの覚醒（森・山・川）。育つ（X1）が入のときだけ一発で育った姿を作る（切なら名前と駒が変わるだけ）
    function makeForm(u) { return !!u && !mon() && awakeOf(u) === 'make' && makeGood(u.magic); }
    function makeFormOn(u) { return makeForm(u) && B.grow.enabled; }
    // 道で手に入れた効果。進んだマスの効果は、覚醒でほかの方向が閉じても残る
    function fxCount(u, fx) {
      var p = lpathOf(u), d = p ? pathDef(u.magic) : null, n = 0;
      if (!d || mon()) return 0;   // M: 道の効果（fx）はない。性質は mProps
      Object.keys(d.steps).forEach(function (k) {
        var st = d.steps[k] || [];
        for (var i = 0; i < Math.min(3, p[k] || 0); i++) if (st[i] && st[i].fx === fx) n++;
      });
      return n;
    }
    function fxOn(u, fx) { return fxCount(u, fx) > 0; }
    // 作る: 形が1マス増えるマスの数（上限3）。作るが得意でも、先にほかの方向に覚醒していれば、3マス目は形が1マス
    function shapeSteps(u) {
      if (non()) return nCount(u, 'shape');   // N: 間の強化の「形が1マス」の数
      if (mon()) { var mp = lpathOf(u); return mp ? Math.min(mShapeMax(), mTotal(mp)) : 0; }   // M: 強化1回で形が1マス（上限まで）
      var n = fxCount(u, 'shape'), p = lpathOf(u);
      if (p && makeGood(u.magic) && (p.make || 0) >= 3 && p.awake !== 'make') n++;
      return Math.min(3, n);
    }
    // i マス目（0〜2）の中身の一言（作るが得意でも、ほかに覚醒したあとの3マス目は形が1マス）
    function stepText(m, p, k, i) {
      if (non()) return '';
      if (mon()) return mStepText(m, k);
      var d = pathDef(m), st = d && d.steps[k] && d.steps[k][i];
      if (!st) return '';
      if (k === 'make' && i === 2 && makeGood(m) && p && p.awake && p.awake !== 'make') {
        return '形が1マス増える（' + (LP.EXTEND_NAME || {})[d.extend] + '）。' + d.awaken[p.awake].name + 'に覚醒したので、作るは覚醒しない（ここが上限）';
      }
      return st.text;
    }
    // 道を1マス進める（p を書き換える）。{ ok, step, awake } ／{ none }（その方向を持たない）／{ closed }（覚醒で閉じた）／{ full }（もう覚醒した方向）／{ makeFull }（作るは3マスで上限）
    function advance(p, m, dir) {
      if (dir === 'dark') return darkAdvance(p, m);   // L7: 闇の力（方向ではない）
      if (non()) return nAdvance(p, m, dir);
      if (mon()) return mAdvance(p, m, dir);
      var d = pathDef(m);
      if (!d || !p) return { none: true };
      if (dir === 'make') {
        if ((p.make || 0) >= 3) return { makeFull: true };
        p.make = (p.make || 0) + 1;
        var mo = { ok: true, step: p.make };
        if (p.make >= 3 && makeGood(m) && !p.awake) { p.awake = 'make'; mo.awake = d.awaken.make; }   // 作るが得意なら3マス目で覚醒
        return mo;
      }
      if (d.dirs.indexOf(dir) < 0) return { none: true };
      if (p.awake && p.awake !== dir) return { closed: true };
      if ((p[dir] || 0) >= 3) return { full: true };
      p[dir] = (p[dir] || 0) + 1;
      var out = { ok: true, step: p[dir] };
      if (p[dir] >= 3) { p.awake = dir; out.awake = d.awaken[dir]; }
      return out;
    }
    // 達成したときの行き先（L5）。p を書き換える。{ dir: 進んだ方向, res, via: 得意でなかったときの元の結果, dest: L5 の値, after: 進めたあとの道 }
    function gain(p, m, dir) {
      if (dir === 'dark') { var dg = { dir: 'dark', res: darkAdvance(p, m) }; if (p) dg.after = lclone(p); return dg; }   // L7
      if (non()) return nGain(p, m, dir);
      if (mon()) return mGain(p, m, dir);
      var g, r = advance(p, m, dir);
      if (r.ok || dir === 'make' || !pathDef(m) || !p) g = { dir: dir, res: r };
      else if (destMode() !== 'make') g = { dir: dir, res: r, dest: destMode() };
      else g = { dir: 'make', res: advance(p, m, 'make'), via: r };
      if (p) g.after = lclone(p);
      return g;
    }
    // 取ったら、その方向の道がそのまま進むか（L5 remain: 進まない手では達成にならない）
    function advances(p, m, dir) { return !!(p && pathDef(m) && advance(lclone(p), m, dir).ok); }
    // 進み具合の印（作●○○ 止●●○ …。閉じた方向は × を足す）
    function pathMarks(m, p) { var dk = p && p.dark > 0 && pathDef(m) ? ' 闇' + darkDots(p.dark) : ''; return pathMarksBase(m, p) + dk; }   // L7: 闇の力
    function pathMarksBase(m, p) {
      if (non()) return nMarks(m, p);
      if (mon()) return mMarks(m, p);
      var d = pathDef(m);
      if (!d) return '';
      p = p || newPath(m);
      return dirsOf(m).map(function (k) {
        var n = p[k] || 0, s = '';
        for (var i = 0; i < 3; i++) s += i < n ? '●' : '○';
        return (LT.DIRS[k] ? LT.DIRS[k].mark : k) + s + (k !== 'make' && p.awake && p.awake !== k ? '×' : '');
      }).join(' ');
    }
    // k に覚醒すると閉じるもの（「止める・動かすは閉じる」「作るは森に覚醒しなくなる」）
    function closeText(m, k) {
      var d = pathDef(m), parts = [];
      if (!d) return '';
      var others = d.dirs.filter(function (x) { return x !== k; }).map(dirName);
      if (others.length) parts.push(others.join('・') + 'は閉じる');
      if (k !== 'make' && makeGood(m)) parts.push('作るは' + d.awaken.make.name + 'に覚醒しなくなる');
      return parts.join('。');
    }
    // 進んだあとの覚醒の見通し（「覚醒「森」！ 止めるは閉じる」「あと1つで森に覚醒。止めるは閉じる」）
    function awakeHint(m, k, r, after) {
      var d = pathDef(m), ct = closeText(m, k);
      if (r.awake) return '（覚醒「' + r.awake.name + '」！' + (ct ? ' ' + ct : '') + '）';
      if (!after || after.awake || awakeDirs(m).indexOf(k) < 0) return '';
      var left = 3 - (after[k] || 0);
      return left > 0 ? '（あと' + left + 'つで' + d.awaken[k].name + 'に覚醒' + (ct ? '。' + ct : '') + '）' : '';
    }
    // 得意でない・閉じた・覚醒ずみ、の理由（before は進める前の道）
    function notWhy(m, dir, r, before) {
      var nm = I.magicName(m), d = pathDef(m);
      if (r.none) return nm + 'は' + dirName(dir) + 'を持たない';
      if (r.closed) return nm + 'は' + ((before && before.awake && d.awaken[before.awake]) ? d.awaken[before.awake].name : '覚醒') + 'に覚醒して、' + dirName(dir) + 'は閉じている';
      if (r.full) return nm + 'の' + dirName(dir) + 'はもう覚醒している';
      if (r.makeFull) return nm + 'の作るはもう伸びない（3マス）';
      return '';
    }
    // gain の結果の一言（dir は達成したターゲットの方向）
    function gainText(m, dir, g, before) {
      if (dir === 'dark') return darkText(m, g);   // L7
      if (non()) return nGainText(m, dir, g, before);
      if (mon()) return mGainText(m, dir, g, before);
      var nm = I.magicName(m), r = g.res;
      if (!pathDef(m)) return nm + 'には道がない（育たない）';
      if (g.via) return notWhy(m, dir, g.via, before) + 'ので、' + (r.ok ? '作るが1マス進む' + awakeHint(m, 'make', r, g.after) : '作るに入るが、作るはもう伸びない');
      if (r.ok) return nm + 'の' + dirName(g.dir) + 'が1マス進む' + awakeHint(m, g.dir, r, g.after);
      if (r.makeFull) return '作るはもう伸びない（' + nm + 'は3マス）';
      if (g.dest === 'remain') return notWhy(m, dir, r, before) + 'ので、達成にならない（L5: 残る）';
      return notWhy(m, dir, r, before) + 'ので、何も起きない';
    }
    // 取ったら道がどうなるか（一言）。p はその魔法の今の道（なければ 0 から）
    function outlook(m, p, dir) {
      if (dir === 'dark') return pathDef(m) ? darkText(m, gain(lclone(p || newPath(m)), m, 'dark')) : '達成するが、' + I.magicName(m) + 'には道がない（闇の力も持てない）';   // L7
      if (non()) return nOutlook(m, p, dir);
      if (mon()) return mOutlook(m, p, dir);
      if (!pathDef(m)) return '達成するが、' + I.magicName(m) + 'には道がない（育たない）';
      p = p || newPath(m);
      return gainText(m, dir, gain(lclone(p), m, dir), p);
    }

    // ---- L7 闇クエスト: 闇の力（方向ではない。道は進まない。取るたびに直撃の威力が大きく上がる） ----
    //   道 labPath.dark ＝ 闇の力の数（0〜max）。1つで直撃 +power（balance.js の L7）。L も M も同じ。L7 がオフなら威力は上がらない
    function darkMax() { return clampN(lopt('L7', 'max', 3), 1, 9, 3); }
    function darkPower() { return clampN(lopt('L7', 'power', 7), 0, 99, 7); }
    function darkDots(n) { var t = ''; for (var i = 0; i < darkMax(); i++) t += i < n ? '●' : '○'; return t; }
    function withDark(p, src) {
      if (p && src && Number(src.dark) > 0) p.dark = clampN(src.dark, 0, darkMax(), 0);
      return p;
    }
    function darkAdvance(p, m) {
      if (!p || !pathDef(m)) return { none: true };
      if ((p.dark || 0) >= darkMax()) return { darkFull: true };
      p.dark = (p.dark || 0) + 1;
      return { ok: true, kind: 'dark', step: p.dark };
    }
    function darkText(m, g) {
      var nm = I.magicName(m), r = g.res, n = g.after ? (g.after.dark || 0) : 0;
      if (r.none) return nm + 'には道がない（闇の力も持てない）';
      if (r.darkFull) return nm + 'の闇の力はもう上限（直撃 +' + (darkMax() * darkPower()) + '）';
      return nm + 'の闇の力が1つ増える（直撃 +' + (n * darkPower()) + '。闇の力 ' + darkDots(n) + '）';
    }
    // 人の闇の力の数（L7 がオンのときだけ効く）
    function darkOf(u) { var p = on('L7') ? lpathOf(u) : null; return p ? clampN(p.dark, 0, darkMax(), 0) : 0; }
    // 直撃の威力: 闇の力1つで +power（術者の魔法が直接当たったとき。決め手のダメージは変えない）。敵が闇の力を持っても同じ
    hitMore.push(function (ctx, u, amount, src, cell) {
      if (src !== 'direct' || !ctx.caster || !ctx.s || !on('L7')) return amount;
      var c = I.findUnit(ctx.s, ctx.caster), n = darkOf(c);
      return n ? amount + n * darkPower() : amount;
    });
    // 魔法使い（人）: 闇クエストの盤面の敵。HP は人と同じ（味方の HP）
    confMore.push(function (u, c) { return on('L7') && u.labWizard ? { hp: B.ally.hp, power: c.power, move: c.move } : null; });
    // ターン終了で、村・馬車・魔法使いが倒れた（炎・火傷）。手は「ターン終了」（L2 に従う）
    function darkTurnEnd(s, e, c, ev) {
      if (!on('L7')) return;
      var wiz = e.side === 'enemy' && (s.labWizardIds || []).indexOf(e.id) >= 0;
      (s.labTargets || []).forEach(function (t) {
        if (t.got || !t.check) return;
        var k = t.check.kind;
        if ((k === 'breakObj' && e.side === 'object' && e.kind === t.check.obj) || (k === 'killWizard' && wiz)) {
          achieve(s, t, { id: null, side: 'time' }, c ? preparersAt(s, s.labMaker || {}, [c]) : [], ev, c ? [c] : []);
        }
      });
    }

    // ---- ターゲット ----
    function targetDef(x) {
      var t = typeof x === 'string' ? (non() && nMission(x)) || (mon() && mMission(x)) || LT.TARGETS.filter(function (d) { return d.id === x; })[0] || (LT.DARK || []).filter(function (d) { return d.id === x; })[0] : x;
      if (!t || !t.check) return null;
      t = JSON.parse(JSON.stringify(t));
      if (non() && !t.stage && t.dir !== 'dark') t.dir = nMissionWant(t);   // N: やりたいことの仕分け（画面で変えられる）
      else if (mon() && !t.stage && t.dir !== 'dark') t.dir = missionDir(t);   // M: 画面の「ミッションの仕分け」で変えた方向（闇は仕分けない）
      return t;
    }
    // 戦闘の始まり: シナリオの labState.labTargetList から、この戦闘のターゲットを決める（数は L3。育つが切なら「二段」は出さない）
    function setupTargets(s) {
      if (!lon()) return;
      if (!s.labTargets && s.labTargetList) {
        var list = s.labTargetList.map(targetDef).filter(function (t) { return t && (!t.needsGrow || B.grow.enabled) && mOffer(s, t) && (t.dir !== 'dark' || on('L7')); });   // L7: 闇のミッションは L7 のときだけ
        s.labTargets = list.slice(0, s.labTargetCount ? clampN(s.labTargetCount, 1, 6, 3) : targetCount());   // クエスト制: クエストが決めたミッションの数（labState.labTargetCount）
      }
      (s.labTargets || []).forEach(function (t) { t.got = null; delete t.missed; delete t.remainSeen; });
      delete s.labPlanFin; delete s.labFoil; delete s.labShot;
      if (mon()) mSetup(s);   // M: 戦闘ごとの記録
      s.units.forEach(function (u) { delete u.labHeldBy; delete u.labHeldRun; delete u.labMovedBy; delete u.labBind; });
      if (on('L7')) { var wz = s.units.filter(function (u) { return u.labWizard; }).map(function (u) { return u.id; }); if (wz.length) s.labWizardIds = wz; else delete s.labWizardIds; }   // L7
    }
    function openT(s, kind) { return (s.labTargets || []).filter(function (t) { return !t.got && t.check && t.check.kind === kind; }); }
    function uniqHands(list) { var out = []; list.forEach(function (h) { out = out.filter(function (x) { return x.id !== h.id; }); out.push(h); }); return out; }
    function handName(s, h) {
      if (!h) return '？';
      if (h.side === 'time') return 'ターン終了';
      var u = h.id ? I.findUnit(s, h.id) : null;
      if (h.side !== 'ally') return u ? unitLabel(s, u) : '敵';
      return (u && formName(u)) || I.magicName(h.magic);
    }
    // この戦闘で、もう取ったターゲットの分を進めた道（道が進むのは戦闘の終わり。行き先の予想と L5 remain に使う）
    function projected(s, h) {
      if (!h || !pathDef(h.magic)) return null;
      var u = h.id ? I.findUnit(s, h.id) : null;
      if (!u || !u.labPath) u = s.units.filter(function (x) { return x.side === 'ally' && x.magic === h.magic && x.labPath; })[0] || null;
      var p = u && u.labPath ? normPath(h.magic, u.labPath) : newPath(h.magic);
      gotOrder(s).forEach(function (t) { if (t.got.by && t.got.by.magic === h.magic) gain(p, h.magic, t.dir); });
      return p;
    }
    // 取ったターゲットを、取った順に（道は戦闘の終わりに、この順で進む）
    function gotOrder(s) {
      return (s.labTargets || []).filter(function (t) { return t.got; }).sort(function (a, b) { return (a.got.seq || 0) - (b.got.seq || 0); });
    }
    // 材料のマスを作った味方（作った順。同じ味方は最後の1回だけ）
    function preparersAt(s, maker, cells) {
      var list = [];
      (cells || []).forEach(function (c) {
        if (!inBounds(s, c[0], c[1])) return;
        var m = maker[idx(s, c[0], c[1])];
        if (m && m.side === 'ally') list.push(m);
      });
      list.sort(function (a, b) { return a.n - b.n; });
      return uniqHands(list.map(function (m) { return { id: m.by, side: 'ally', magic: m.magic }; }));
    }
    // L5 remain: 取っても道が進まない魔法の手では達成にならない（一言は魔法ごとに1回）
    function remainNote(s, t, h, ev, cells) {
      t.remainSeen = t.remainSeen || {};
      if (h && !t.remainSeen[h.magic]) {
        t.remainSeen[h.magic] = true;
        var p = projected(s, h);
        ev.push({ type: 'info', cells: cells || [], text: '【ターゲット】' + dirName(t.dir) + '「' + t.name + '」: ' + handName(s, h) + 'では取れない（' + outlook(h.magic, p, t.dir) + '）。まだ取れる' });
      }
      return false;
    }
    // 達成: 誰が取るかを決めて記録する（取る魔法・L1・L2・L5）。取れなければ false
    //   hand は取る魔法の手（taker が hand なら達成の一手、ほかはミッションが決めた手）
    function achieve(s, t, hand, preps, ev, cells) {
      var who = whoMode(), taker = t.taker || 'hand', got;
      preps = uniqHands(preps || []);
      var canTake = function (h) {
        if (t.dir === 'dark') return true;   // L7: 闇の力は上限を越えても達成にはなる（道は変わらない）
        return mon() ? mCanTake(projected(s, h), h.magic, t.dir) : destMode() !== 'remain' || advances(projected(s, h), h.magic, t.dir);
      };
      if (hand.side === 'ally') {
        if (taker === 'hand' && who === 'choose') {
          var all = uniqHands(preps.concat([hand])), cands = all.filter(canTake);
          if (!cands.length) return remainNote(s, t, hand, ev, cells);
          got = cands.length > 1 ? { cands: cands } : { by: cands[0] };
        } else {
          if (!canTake(hand)) return remainNote(s, t, hand, ev, cells);
          got = { by: hand };
        }
        got.how = taker;
      } else {
        if (enemyMode() !== 'preparer' || !preps.length) {
          if (!t.missed) {
            t.missed = true;
            ev.push({ type: 'info', cells: cells || [], text: '【ターゲット】' + dirName(t.dir) + '「' + t.name + '」は' + (hand.side === 'time' ? 'ターン終了' : '敵の手') + 'で起きたので、取れない（まだ取れる）' });
          }
          return false;
        }
        var okp = preps.filter(canTake);
        if (!okp.length) return remainNote(s, t, preps[preps.length - 1], ev, cells);
        got = who === 'choose' && okp.length > 1 ? { cands: okp } : { by: okp[okp.length - 1] };
        got.how = 'preparer';
      }
      got.turn = s.turn;
      s.labGotSeq = (s.labGotSeq || 0) + 1;
      got.seq = s.labGotSeq;   // 取った順（道はこの順に進む。作るの覚醒と得意な方向の覚醒の、どちらが先かが決まる）
      var HOW = { preparer: '材料を作った', maker: '自然を作った', stopper: '止めた', mover: '動かした', helper: '手を貸した', last: '決着の一手の', still: '歩かなかった', carrier: '運んだ', blocker: '道をふさいだ' };
      var whoText = got.by ? (HOW[got.how] || '') + handName(s, got.by) + 'が取った → ' + outlook(got.by.magic, projected(s, got.by), t.dir)
        : (HOW[got.how] ? HOW[got.how] + ' ' : '') + got.cands.map(function (h) { return handName(s, h); }).join('・') + ' から、戦闘の終わりに1人選ぶ';
      t.got = got;
      ev.push({ type: 'labTarget', target: t.id, dir: t.dir, cells: cells || [], text: '【ターゲット】' + dirName(t.dir) + '「' + t.name + '」達成！ ' + whoText });
      return true;
    }

    // ---- 撃つ前と後（1発の中で変わったマスを、撃った手のものとして覚える） ----
    function stopOpen(s) { return openT(s, 'held').length + openT(s, 'heldFin').length > 0; }
    function shotStart(s, u, ctx, ev) {
      if (!lon()) return;
      var track = s.labTargets && stopOpen(s);
      ctx.labPre = { tiles: s.tiles.slice(), maker: lclone(s.labMaker || {}),
        units: s.units.map(function (x) {
          return { id: x.id, side: x.side, magic: x.magic, x: x.x, y: x.y, size: x.size || 1, kind: x.kind, wiz: !!x.labWizard,
            held: track && x.side === 'enemy' ? heldNow(s, x) : false, heldBy: x.labHeldBy || null,
            intent: !!x.intent, facing: x.facing, tile: getTile(s, x.x, x.y), shots: x.labShots || 0 };   // M: 予告の前に倒す・向きを変える・高い所から下ろす・撃たせずに倒す
        }) };
      ctx.labPrevShot = s.labShot;
      s.labShot = { by: u.id, side: u.side, magic: u.magic };
      if (mon()) mShotStart(s, u, ctx, ev);
    }
    function makerSet(s, i, t) {
      if (t === 'empty') { if (s.labMaker) delete s.labMaker[i]; return; }
      if (!s.labShot) return;   // 撃った1発の外（燃え移り・燃え尽き・エディット）は、元の作り手のまま
      s.labMaker = s.labMaker || {};
      s.labSeq = (s.labSeq || 0) + 1;
      s.labMaker[i] = { by: s.labShot.by, side: s.labShot.side, magic: s.labShot.magic, n: s.labSeq };
    }
    afterShotMore.push(function (s, u, facing, ctx, ev) {
      if (!lon() || !ctx.labPre) return;
      grassAfter(s, u, facing, ctx, ev);   // 草の道（蔓。LAB_L の起点・育てるの処理も fx で残してある）。作った自然は、この1発のもの
      pathAfter(s, u, facing, ctx, ev);    // 止める・動かすの道（共通の処理）
      mAfterShot(s, u, facing, ctx, ev);   // M: 変化先の性質・強化の候補（判定より先に起こす）
      nAfterShot(s, u, facing, ctx, ev);   // N: 間の強化（止める・効き目・押す）と、変化した魔法の名前
      if (ctx.labPrevShot) s.labShot = ctx.labPrevShot; else delete s.labShot;
      thornIntent(s, ev);
      if (!s.labTargets) return;
      heldTrack(s, u, ctx, ev);
      judgeShot(s, u, ctx, ev);
    });
    function judgeShot(s, u, ctx, ev) {
      var pre = ctx.labPre, hand = { id: u.id, side: u.side, magic: u.magic };
      var changed = [];
      for (var i = 0; i < s.tiles.length && i < pre.tiles.length; i++) {
        if (s.tiles[i] !== pre.tiles[i]) changed.push({ x: i % s.size, y: Math.floor(i / s.size), from: pre.tiles[i], to: s.tiles[i] });
      }
      var deadEnemies = pre.units.filter(function (p) { return p.side === 'enemy' && !I.findUnit(s, p.id); });
      var finCells = [];
      ctx.finishers.forEach(function (f) { (f.cells || []).concat(f.labRing || []).forEach(function (c) { finCells.push(c); }); if (f.origin) finCells.push(f.origin); });
      var byFin = function (id) { var h = ctx.hits[id]; return !!h && h.src !== 'direct' && ctx.finishers.length > 0; };
      var at = function (list) { return list.map(function (c) { return [c.x, c.y]; }); };
      // この1発で動いた敵（動く前と後の縦横の歩数）
      var moved = [];
      pre.units.forEach(function (p) {
        if (p.side !== 'enemy') return;
        var e = I.findUnit(s, p.id);
        if (e && (e.x !== p.x || e.y !== p.y)) moved.push({ id: p.id, from: [p.x, p.y], to: [e.x, e.y], d: Math.abs(e.x - p.x) + Math.abs(e.y - p.y) });
      });
      var E = { pre: pre, changed: changed, deadEnemies: deadEnemies, finCells: finCells, moved: moved, byFin: byFin, at: at };   // M の判定に渡す
      (s.labTargets || []).forEach(function (t) {
        if (t.got) return;
        var k = t.check.kind, r = null, taker = null;
        if (k === 'farNature') {
          // 距離は、撃つ前にいた敵から（その1発で倒した敵のそばも「離れた所」ではない）
          var dist = t.check.dist || 3, foes = pre.units.filter(function (p) { return p.side === 'enemy'; });
          var far = changed.filter(function (c) {
            return c.from === 'empty' && c.to !== 'empty' && foes.every(function (e) { return unitCells(e).every(function (q) { return Math.abs(q[0] - c.x) + Math.abs(q[1] - c.y) >= dist; }); });
          });
          if (far.length) r = { cells: at(far), mat: [] };
        } else if (k === 'chain') {
          for (var j = 0; j < changed.length && !r; j++) {
            if (changed[j].to === 'empty') continue;
            var comp = connected(s, changed[j].x, changed[j].y, changed[j].to);
            if (comp.length >= (t.check.n || 5)) r = { cells: comp, mat: comp };
          }
        } else if (k === 'enemyChange') {
          // 敵の魔法で、味方が作った自然が別の自然に変わった。取るのは、変えられた自然を作った魔法（何人もいれば最後に作った味方）
          if (u.side === 'enemy') {
            var mk = null, mc = [];
            changed.forEach(function (c) {
              var m0 = pre.maker[idx(s, c.x, c.y)];
              if (!m0 || m0.side !== 'ally' || c.from === 'empty' || c.to === 'empty') return;
              mc.push([c.x, c.y]);
              if (!mk || m0.n > mk.n) mk = m0;
            });
            if (mk) { taker = { id: mk.by, side: 'ally', magic: mk.magic }; r = { cells: mc, mat: [] }; }
          }
        } else if (k === 'twoStage') {
          var gr = B.grow.enabled ? changed.filter(function (c) { return GROWN[c.from] === c.to; }) : [];
          if (gr.length) r = { cells: at(gr), mat: at(gr) };
        } else if (k === 'finKill') {
          if (deadEnemies.some(function (d) { return byFin(d.id); })) r = { cells: finCells, mat: finCells };
        } else if (k === 'finHits') {
          var n = pre.units.filter(function (p) { return p.side === 'enemy' && byFin(p.id); }).length;
          if (n >= (t.check.n || 2)) r = { cells: finCells, mat: finCells };
        } else if (k === 'finChain') {
          if (ctx.finishers.length >= (t.check.n || 2)) r = { cells: finCells, mat: finCells };
        } else if (k === 'kill') {
          if (deadEnemies.length) r = { cells: deadEnemies.map(function (d) { return [d.x, d.y]; }), mat: finCells };
        } else if (k === 'heldFin') {
          // 足が止まっていた敵（撃つ前に）が決め手に巻き込まれた。取るのは止めた魔法（自分ではまったなら敵の手 → L2）
          var hf = pre.units.filter(function (p) { return p.side === 'enemy' && p.held && byFin(p.id); })[0];
          if (hf) {
            taker = hf.heldBy || { id: hf.id, side: 'enemy', magic: hf.magic };
            r = { cells: [[hf.x, hf.y]], mat: [[hf.x, hf.y]] };
          }
        } else if (k === 'push') {
          var pm = moved.filter(function (m) { return m.d >= (t.check.n || 2); });
          if (pm.length) r = { cells: pm.map(function (m) { return m.to; }), mat: [] };
        } else if (k === 'pushInto') {
          var pi = moved.filter(function (m) { return INTO[getTile(s, m.to[0], m.to[1])]; });
          if (pi.length) r = { cells: pi.map(function (m) { return m.to; }), mat: [] };
        } else if (k === 'redirect') {
          // 動かされた敵が撃って、別の敵に当たった。取るのは動かした魔法
          if (u.side === 'enemy' && u.labMovedBy) {
            var hitE = ctx.order.filter(function (id) {
              var p = pre.units.filter(function (q) { return q.id === id; })[0];
              return id !== u.id && p && p.side === 'enemy' && ctx.hits[id].amount > 0;
            });
            if (hitE.length) {
              taker = u.labMovedBy;
              r = { cells: hitE.map(function (id) { var p = pre.units.filter(function (q) { return q.id === id; })[0]; return [p.x, p.y]; }), mat: [] };
            }
          }
        } else if (k === 'hitTile') {
          var cc = t.check.cells || [];
          var hit = (!t.check.magic || t.check.magic === u.magic) && cc.some(function (q) {
            return has(ctx.cells, q[0], q[1]) && (!t.check.tile || pre.tiles[idx(s, q[0], q[1])] === t.check.tile);
          });
          if (hit) r = { cells: cc, mat: [] };
        } else if (k === 'breakObj' || k === 'killWizard') {
          // L7 闇: この1発で、守るはずの置きもの（村・馬車）が壊れた／魔法使い（人）が倒れた
          var gone = pre.units.filter(function (p) { return (k === 'killWizard' ? p.wiz : p.side === 'object' && p.kind === t.check.obj) && !I.findUnit(s, p.id); });
          if (gone.length) r = { cells: gone.map(function (p) { return [p.x, p.y]; }), mat: finCells };
        } else if (mon()) {
          var mr = mJudge(s, u, ctx, ev, t, E);   // M: 41のミッションのうち、L にない判定
          if (mr) { r = mr.r; taker = mr.taker || null; }
        }
        if (r) achieve(s, t, taker || hand, preparersAt(s, pre.maker, r.mat), ev, r.cells);
      });
      // 動かす「予告を別の敵に」: 味方が動かした敵を覚える（その敵が撃つまで）。敵の手で動いたら忘れる
      if (openT(s, 'redirect').length || (mon() && openT(s, 'enemyFinKill').length)) moved.forEach(function (m) {   // M: 敵の決め手で倒す（動かした味方が手を貸した）
        var e = I.findUnit(s, m.id);
        if (!e || e.id === u.id) return;
        if (u.side === 'ally') e.labMovedBy = hand; else delete e.labMovedBy;
      });
      // M: 向きを変えた（早瀬・狐火）敵も、動かした敵と同じに覚える（「予告を別の敵に」）
      if (mon() && u.side === 'ally' && (openT(s, 'redirect').length || openT(s, 'enemyFinKill').length)) pre.units.forEach(function (p) {
        var e = I.findUnit(s, p.id);
        if (e && p.side === 'enemy' && e.id !== u.id && e.facing !== p.facing) e.labMovedBy = hand;
      });
      if (u.side === 'enemy') delete u.labMovedBy;
      // 止める「予告の決め手を潰す」: 予告で決め手が起きるはずだった敵が撃って、決め手が起きなかった
      if (u.side === 'enemy' && s.labPlanFin && s.labPlanFin[u.id]) {
        var names = s.labPlanFin[u.id];
        delete s.labPlanFin[u.id];
        if (!ctx.finishers.length) foiled(s, u.id, names, ev);
        if (s.labFoil) delete s.labFoil[u.id];
      }
    }

    // ---- 止める「敵が動けなかった」: 泥沼・凍結・蔓（stuck）、茨の牢、閉じこめ（E9）、道の縛り、まわりを囲まれて1歩も動けない ----
    function caged(s, e) {
      if (!e || e.side !== 'enemy' || !(e.move > 0) || e.stand === 'still' || e.stand === 'march' || e.stand === 'rush') return false;
      return I.reachInfo(s, e).order.length <= 1;
    }
    function heldNow(s, e) { return !!(e.stuck || e.labBind || thornCaged(s, e) || enclosedAt(s, e) || caged(s, e)); }
    // この1発で足が止まった敵に、止めた手を覚える（自分ではまったときは afterMove で、敵自身の手）
    function heldTrack(s, u, ctx, ev) {
      if (!stopOpen(s)) return;
      var open = openT(s, 'held');
      I.enemiesOf(s).forEach(function (e) {
        var was = ctx.labPre.units.filter(function (p) { return p.id === e.id; })[0];
        if (!heldNow(s, e)) { delete e.labHeldBy; return; }
        if (was && was.held) return;
        e.labHeldBy = { id: u.id, side: u.side, magic: u.magic };
        if (u.side === 'ally' && open.length) ev.push({ type: 'labTargetSoon', dir: 'stop', id: e.id, cells: [[e.x, e.y]],
          text: '【ターゲット】' + unitLabel(s, e) + 'の足が止まった → 敵の番に動けなければ、止める「' + open[0].name + '」（' + handName(s, e.labHeldBy) + 'の手 → ' + soonOutlook(s, e.labHeldBy, open[0]) + '）' });
      });
    }
    // 取れそうなときの一言の、行き先（作るに入る・覚醒の見通しも）
    function soonOutlook(s, h, t) { return h && h.side === 'ally' ? outlook(h.magic, projected(s, h), t.dir) : '敵の手なので L2 しだい'; }
    afterMoveMore.push(function (s, u, from, to, ev) {
      if (lon() && u.side === 'enemy' && u.stuck && !u.labHeldBy) u.labHeldBy = { id: u.id, side: 'enemy', magic: u.magic };   // 自分ではまった
    });
    // 敵の番の始め（移動と予告の前）。rules.js の enemyPlanPhase から
    function planStart(s, e, plan, ev) {
      if (mon()) mPlanStart(s, e, plan, ev);   // M: 予告が遅れる・予定の道をふさぐ
      if (!lon() || !s.labTargets) return;
      delete e.labMovedBy;   // 自分の番が来たら、動かされた手は忘れる
      var open = openT(s, 'held');
      if (!open.length) return;
      if (!heldNow(s, e)) { delete e.labHeldBy; delete e.labHeldRun; return; }
      e.labHeldRun = (e.labHeldRun || 0) + 1;
      var hand = e.labHeldBy || { id: e.id, side: 'enemy', magic: e.magic };
      var mat = e.stuck ? [[e.x, e.y]] : [[e.x, e.y]].concat(neighbors(s, e.x, e.y).map(function (n) { return [n.x, n.y]; }));
      open.forEach(function (t) { if (e.labHeldRun >= (t.check.turns || 1)) achieve(s, t, hand, preparersAt(s, s.labMaker || {}, mat), ev, [[e.x, e.y]]); });
    }

    // ---- 止める「予告の決め手を潰す」 ----
    // 敵の予告が出そろったあと: 予告どおりなら決め手が起きる敵を覚える
    function afterPlan(s, ev) {
      if (!lon()) return;
      if (mon()) mAfterPlan(s, ev);   // M: 敵の予定の行き先（予定の道をふさぐ）
      delete s.labPlanFin; delete s.labFoil;
      if (s.result || !s.labTargets || !openT(s, 'foiled').length) return;
      var fin = {}, any = false;
      I.forecast(s).enemies.forEach(function (p) {
        if (p.cancelled || !p.finishers || !p.finishers.length) return;
        fin[p.id] = p.finishers.map(function (f) { return f.name; }); any = true;
      });
      if (any) s.labPlanFin = fin;
    }
    // 味方が1人動いたあと: その手で、予告の決め手が起きなくなった敵を覚える（また起きるようになったら消す）
    function afterAct(s, u, ev) {
      if (mon()) mAfterAct(s, u, ev);   // M: 撃ったあと動ける・2回撃てる・予定の道をふさぐ
      if (!lon() || s.result || !s.labPlanFin || !openT(s, 'foiled').length) return;
      var still = {};
      I.forecast(s).enemies.forEach(function (p) { if (!p.cancelled && p.finishers && p.finishers.length) still[p.id] = true; });
      s.labFoil = s.labFoil || {};
      Object.keys(s.labPlanFin).forEach(function (id) {
        if (still[id]) { delete s.labFoil[id]; return; }
        if (s.labFoil[id]) return;
        s.labFoil[id] = { id: u.id, side: u.side, magic: u.magic };
        var e = I.findUnit(s, id);
        ev.push({ type: 'labTargetSoon', dir: 'stop', id: id, cells: e ? [[e.x, e.y]] : [],
          text: '【ターゲット】' + (e ? unitLabel(s, e) : '敵') + 'の予告の決め手（' + s.labPlanFin[id].join('・') + '）が起きなくなった → 敵の番に起きなければ、止める「' + openT(s, 'foiled')[0].name + '」（' + handName(s, s.labFoil[id]) + 'の手 → ' + soonOutlook(s, s.labFoil[id], openT(s, 'foiled')[0]) + '）' });
      });
    }
    function foiled(s, eid, names, ev) {
      var open = openT(s, 'foiled');
      if (!open.length) return;
      var e = I.findUnit(s, eid);
      var hand = (s.labFoil && s.labFoil[eid]) || { id: eid, side: 'enemy', magic: e ? e.magic : '' };
      open.forEach(function (t) { achieve(s, t, hand, [], ev, e ? [[e.x, e.y]] : []); });
    }
    // 予測の一言（画面から）: 選んでいる手のあとの予告 fc で、予告の決め手が起きなくなる敵
    function foilPreview(s0, fc) {
      if (!lon() || !s0.labPlanFin || !fc || !openT(s0, 'foiled').length) return [];
      var still = {}, out = [];
      fc.enemies.forEach(function (p) { if (!p.cancelled && p.finishers && p.finishers.length) still[p.id] = true; });
      Object.keys(s0.labPlanFin).forEach(function (id) {
        if (still[id] || (s0.labFoil && s0.labFoil[id])) return;
        var e = I.findUnit(s0, id);
        out.push({ dir: 'stop', text: '【ターゲット】この手で ' + (e ? unitLabel(s0, e) : '敵') + 'の予告の決め手（' + s0.labPlanFin[id].join('・') + '）が起きなくなる → 敵の番に起きなければ、止める「' + openT(s0, 'foiled')[0].name + '」' });
      });
      return out;
    }
    // 予測の一言（画面から）: 選んでいる手で動いた敵の予告が、別の敵に当たるようになる（ps は手のあとの盤面、fc はその予告）
    function redirectPreview(s0, ps, fc) {
      if (!lon() || !fc || !ps || !openT(s0, 'redirect').length) return [];
      var out = [];
      fc.enemies.forEach(function (p) {
        if (p.cancelled) return;
        var a = I.findUnit(s0, p.id), b = I.findUnit(ps, p.id);
        if (!a || !b || !b.labMovedBy || (a.x === b.x && a.y === b.y)) return;
        var hit = (p.damages || []).filter(function (d) { return d.side === 'enemy' && d.id !== p.id && d.amount > 0; });
        if (!hit.length) return;
        var names = hit.map(function (d) { var q = I.findUnit(ps, d.id); return q ? unitLabel(ps, q) : '敵'; }).join('・');
        out.push({ dir: 'move', text: '【ターゲット】この手で ' + unitLabel(s0, a) + 'が動き、予告が ' + names + ' に当たる → 敵の番に当たれば、動かす「' + openT(s0, 'redirect')[0].name + '」（' + handName(ps, b.labMovedBy) + 'の手）' });
      });
      return out;
    }
    // ターン終了処理のあと: 炎・火傷で倒れた敵（手はターン終了）と、撃たれずに終わった予告の決め手
    function targetTurnEnd(s, ev) {
      if (!lon() || !s.labTargets) return;
      var mark = -1;
      for (var i = ev.length - 1; i >= 0; i--) if (ev[i].type === 'turnEnd') { mark = i; break; }
      if (mark >= 0) ev.slice(mark).forEach(function (e) {
        if (e.type !== 'death') return;
        var c = (e.cells || [])[0];
        darkTurnEnd(s, e, c, ev);   // L7: 村・馬車・魔法使いがターン終了で倒れた
        if (e.side !== 'enemy') return;
        openT(s, 'kill').forEach(function (t) { achieve(s, t, { id: null, side: 'time' }, c ? preparersAt(s, s.labMaker || {}, [c]) : [], ev, c ? [c] : []); });
        if (mon() && mNeverShot(s, e.id)) openT(s, 'neverShot').forEach(function (t) { achieve(s, t, { id: null, side: 'time' }, c ? preparersAt(s, s.labMaker || {}, [c]) : [], ev, c ? [c] : []); });
      });
      if (s.labPlanFin) Object.keys(s.labPlanFin).forEach(function (id) { foiled(s, id, s.labPlanFin[id], ev); });
      delete s.labPlanFin; delete s.labFoil;
    }

    // ---- 決める・止める・動かすの道（共通の処理。見え方だけ属性の動詞に合わせる） ----
    var STOP_TEXT = { earth: 'の足が土に埋まった', fire: 'は炎に巻かれて足が止まった', ice: 'の足が凍りついた' };
    function flavorOf(dir, m) { return ((LP.FLAVOR || {})[dir] || {})[m] || ''; }
    // 決める1・覚醒: 決め手の範囲が広い（撃った1発の決め手のまわり w マスの者にも、その決め手のダメージ）。applyHits の前（beforeApply）から
    function finWide(u) { return (fxOn(u, 'finWide') ? 1 : 0) + (fxOn(u, 'finAwake') ? 1 : 0); }
    function finRing(s, ctx, ev) {
      if (!lon() || !ctx.caster || !ctx.finishers.length) return;
      var u = I.findUnit(s, ctx.caster), w = u ? finWide(u) : 0;
      if (!w) return;
      ctx.finishers.slice().forEach(function (f) {
        if (!(f.damage > 0) || f.labRing) return;
        var inF = {}, seen = {}, ring = [];
        (f.cells || []).forEach(function (c) { inF[key(c[0], c[1])] = true; });
        (f.cells || []).forEach(function (c) {
          for (var dy = -w; dy <= w; dy++) for (var dx = -w; dx <= w; dx++) {
            if (Math.abs(dx) + Math.abs(dy) > w) continue;
            var x = c[0] + dx, y = c[1] + dy, k = key(x, y);
            if (!inBounds(s, x, y) || inF[k] || seen[k]) continue;
            seen[k] = true; ring.push([x, y]);
          }
        });
        f.labRing = ring;
        if (!ring.length) return;
        ring.forEach(function (c) { var o = unitAt(s, c[0], c[1]); if (o) addHit(ctx, o, f.damage, 'finisher', c); });
        ev.push({ type: 'kindle', cells: ring, text: '【道】' + (formName(u) || I.magicName(u.magic)) + ': ' + f.name + 'の範囲が' + w + 'マス広い（' + flavorOf('decide', u.magic) + '）' });
      });
    }
    // 決める2: 形が術者から1マス離れて届く（前1マスを飛ばす）
    originMore.push(function (s, u, facing) {
      if (!lon() || !fxOn(u, 'finFar')) return null;
      var F = DIRS[facing], k = getTile(s, u.x, u.y) === 'hill' ? 2 : 1;
      return { x: u.x + F.dx * k, y: u.y + F.dy * k };
    });
    // 止める: 当たった者（魔法の形が直接当たった者）の足を止める。草は本物の道（蔓）なので除く
    function pathHold(s, u, ctx, ev) {
      var d = pathDef(u.magic);
      if (!d || (d.real && d.real.stop)) return;
      var n = fxOn(u, 'hold2') ? 2 : fxOn(u, 'hold') ? 1 : 0, bind = fxOn(u, 'bind');
      if (!n) return;
      ctx.order.forEach(function (id) {
        var h = ctx.hits[id], q = I.findUnit(s, id);
        if (!h || h.src !== 'direct' || id === u.id || !q || q.side === 'object') return;
        var cur = q.stuck === true ? 1 : (Number(q.stuck) || 0);
        if (n > cur) q.stuck = n === 1 ? true : n;
        var b = bind && q.side === 'enemy';   // 縛り（予告できない）は敵だけ。味方には予告がないので、足止めだけ
        if (b) q.labBind = true;
        ev.push({ type: 'mud', id: q.id, cells: [[q.x, q.y]], text: '【道】' + unitLabel(s, q) + (STOP_TEXT[u.magic] || 'の足が止まった') +
          '（' + (b ? '次のターン、移動も予告もできない' : '次の移動は' + Math.max(n, cur) + '回休み') + '）' });
      });
    }
    // 止めるの覚醒: 縛られた敵は、次の自分の番に予告できない（足は stuck で止まっている）
    cannotMore.push(function (s, e, ev) {
      if (!lon() || !e.labBind) return false;
      delete e.labBind;
      ev.push({ type: 'info', id: e.id, cells: [[e.x, e.y]], text: '【道】' + unitLabel(s, e) + 'は縛られていて、動けず予告もできない' });
      return true;
    });
    // 動かす: 当たった者を1マス動かす（風・闇はもとから動かすので1マス多く）。物（馬車・落ちている宝）は2マス目から。覚醒は何かに当たるまで
    function canShove(u, q) { return !!q && q.id !== u.id && (q.side !== 'object' || fxOn(u, 'pushThings')); }
    // q を dir へ（n マス、slide なら押せなくなるまで）。泥沼にはまったらそこで止まる。動いたマス数
    function shove(s, q, dir, n, slide, ev, text) {
      var k = 0;
      while ((slide || k < n) && k < 20) {
        if (k > 0 && q.stuck && getTile(s, q.x, q.y) === 'mud') break;
        if (!I.pushOne(s, q, dir, ev, text)) break;
        k++;
      }
      return k;
    }
    function moveText(s, u, q, dir) {
      var F = DIRS[dir], nm = formName(u) || I.magicName(u.magic), who = unitLabel(s, q);
      if (u.magic === 'wind') return '【道】' + nm + ': ' + who + 'を' + F.name + 'へもう1マス運んだ';
      if (u.magic === 'water') return '【道】' + nm + ': ' + who + 'は水に押し流された（' + F.name + 'へ）';
      if (u.magic === 'earth') return '【道】' + nm + ': ' + who + 'は盛り上がる山に押し出された（' + F.name + 'へ）';
      return '【道】' + nm + ': ' + who + 'を動かした（' + F.name + 'へ）';
    }
    function pathMove(s, u, facing, ctx, ev) {
      var n = fxOn(u, 'push') ? 1 : 0, slide = fxOn(u, 'slide');
      if (!n) return;
      var F = DIRS[facing];
      if (u.magic === 'wind' || u.magic === 'water') {
        // 風の通り道・水の当たった者（遠い者から）
        var list = ctx.order.filter(function (id) { return ctx.hits[id].src === 'direct'; }).map(function (id) { return I.findUnit(s, id); })
          .filter(function (q) { return canShove(u, q); });
        list.sort(function (a, b) { return (b.x * F.dx + b.y * F.dy) - (a.x * F.dx + a.y * F.dy); });
        list.forEach(function (q) { shove(s, q, facing, n, slide, ev, moveText(s, u, q, facing)); });
      } else if (u.magic === 'dark') {
        // 闇: もう一度引き寄せる（1マス遠くからも）。覚醒なら、近づけなくなるまで
        var c = (ctx.cells || [])[0];
        if (c) for (var i = 0; i < (slide ? 10 : 1); i++) if (!pullAgain(s, u, c, B.dark.pullRange + 1, ev).length) break;
      }
      // 物: 落ちている宝も、当たったマスにあれば動く（風・水・土は向きへ）
      var m = s.mission;
      if (fxOn(u, 'pushThings') && m && m.treasure && !m.carrier && u.magic !== 'dark' && has(ctx.cells, m.treasure[0], m.treasure[1])) {
        var k = 0;
        while ((slide || k < n) && k < 20) {
          var nx = m.treasure[0] + F.dx, ny = m.treasure[1] + F.dy;
          if (!inBounds(s, nx, ny) || !I.isPassable(getTile(s, nx, ny)) || unitAt(s, nx, ny)) break;
          m.treasure = [nx, ny]; k++;
        }
        if (k) ev.push({ type: 'treasure', cells: [m.treasure.slice()], text: '【道】宝が' + F.name + 'へ' + k + 'マス動いた' });
      }
    }
    // 闇の引き寄せをもう1回（darkPull と同じ決まり。動かすのは canShove の者だけ）
    function pullAgain(s, u, c, range, ev) {
      var dist = function (x, y) { return Math.abs(x - c[0]) + Math.abs(y - c[1]); };
      var near = s.units.filter(function (q) { var d = dist(q.x, q.y); return canShove(u, q) && !I.isFixed(q) && d >= 2 && d <= range; });
      near.sort(function (a, b) { return dist(a.x, a.y) - dist(b.x, b.y); });
      var out = [];
      near.forEach(function (q) {
        var d0 = dist(q.x, q.y);
        var step = DIR_ORDER.filter(function (d) {
          var nx = q.x + DIRS[d].dx, ny = q.y + DIRS[d].dy;
          return inBounds(s, nx, ny) && !(nx === c[0] && ny === c[1]) && dist(nx, ny) < d0 && I.isPassable(getTile(s, nx, ny)) && !unitAt(s, nx, ny);
        })[0];
        if (!step) return;
        var from = [q.x, q.y];
        q.x += DIRS[step].dx; q.y += DIRS[step].dy;
        out.push(q);
        ev.push({ type: 'push', id: q.id, ok: true, from: from, to: [q.x, q.y], text: '【道】' + (formName(u) || I.magicName(u.magic)) + ': ' + unitLabel(s, q) + 'は闇にさらに引き寄せられた' });
        if (getTile(s, q.x, q.y) === 'mud') I.enterMud(s, q, ev);
      });
      return out;
    }
    // 土の動かす: 形のマスにいる者を、盛り上がる山が向こうへ押し出す（押し出したマスには、いつもどおり土が盛られる）
    placeMore.push(function (s, u, x, y, t, o, facing, ctx, ev) {
      if (!lon() || u.magic !== 'earth' || !o || !fxOn(u, 'push') || !canShove(u, o)) return false;
      ctx.labShoved = ctx.labShoved || {};
      if (ctx.labShoved[o.id]) return false;   // 押し出した先も形のマスなら、もう押さない
      ctx.labShoved[o.id] = true;
      if (!shove(s, o, facing, 1, fxOn(u, 'slide'), ev, moveText(s, u, o, facing))) return false;
      var low = B.grow.enabled && !twoStep(u) ? 'hill' : 'mountain';
      if (t === 'empty') { setTile(s, x, y, low); ctx.phrases.push(tileName(low) + 'ができた'); }
      else if (t === 'river' || t === 'puddle') { setTile(s, x, y, 'mud'); ctx.phrases.push(tileName(t) + 'が泥沼になった'); }
      else return false;   // ほかの自然は、いつもどおりの作用に任せる
      return true;
    });
    function pathAfter(s, u, facing, ctx, ev) {
      if (!lpathOf(u)) return;
      pathHold(s, u, ctx, ev);
      pathMove(s, u, facing, ctx, ev);
    }

    // ---- 草の道（本物は止める。LAB_L の起点・育てるの処理も、fx で残してある） ----
    // 起点1 葦原・起点2 種が風に乗る・育てる2 茂らせる（集めるだけ。広げるのは撃ったあと）
    placeMore.push(function (s, u, x, y, t, o, facing, ctx, ev) {
      if (!lon() || u.magic !== 'grass' || !lpathOf(u)) return false;
      if (fxOn(u, 'reeds') && (t === 'river' || t === 'puddle')) {
        setTile(s, x, y, 'reeds');
        ctx.phrases.push('【道】' + tileName(t) + 'に葦が茂って葦原になった（渡れる。水のまま）');
        return true;
      }
      if (fxOn(u, 'windSeed') && I.isWind(t)) {
        var F = DIRS[windAt(s, x, y) || facing], cx = x + F.dx, cy = y + F.dy, guard = 0;
        while (inBounds(s, cx, cy) && I.isWind(getTile(s, cx, cy)) && guard++ < 20) { cx += F.dx; cy += F.dy; }
        if (inBounds(s, cx, cy) && getTile(s, cx, cy) === 'empty' && !unitAt(s, cx, cy)) {
          var seed = B.grow.enabled ? 'thicket' : 'forest';
          setTile(s, cx, cy, seed);
          if (!has(ctx.cells, cx, cy)) ctx.cells.push([cx, cy]);
          ctx.phrases.push('【道】種が風に乗って、風下に' + tileName(seed) + 'が芽吹いた');
        }
        return false;
      }
      if ((fxOn(u, 'thicken') || makeFormOn(u)) && FOREST_LIKE[t]) { (ctx.labThicken = ctx.labThicken || []).push([x, y]); return false; }
      return false;
    });
    // 森（大樹も）と草むらのかたまり
    function forestComp(s, x, y) {
      var out = [], seen = {}, stack = [[x, y]];
      while (stack.length) {
        var c = stack.pop(), k = key(c[0], c[1]);
        if (seen[k] || !inBounds(s, c[0], c[1])) continue;
        var t = getTile(s, c[0], c[1]);
        if (!FOREST_LIKE[t] && t !== 'thicket') continue;
        seen[k] = true; out.push(c);
        stack.push([c[0] + 1, c[1]], [c[0] - 1, c[1]], [c[0], c[1] + 1], [c[0], c[1] - 1]);
      }
      return out;
    }
    // 撃つ前の盤面で、(x,y) から縦横の歩数 r 以内に森があるか
    function forestWithin(s, tiles, x, y, r) {
      for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > r) continue;
        var cx = x + dx, cy = y + dy;
        if (inBounds(s, cx, cy) && FOREST_LIKE[tiles[idx(s, cx, cy)]]) return true;
      }
      return false;
    }
    // 撃ったあと: 止める1〜2 蔓（LAB_L の 茂らせる・種まき・大樹 も fx があれば）
    function grassAfter(s, u, facing, ctx, ev) {
      if (u.magic !== 'grass' || !lpathOf(u)) return;
      var seed = B.grow.enabled ? 'thicket' : 'forest';
      if (ctx.labThicken && ctx.labThicken.length) {
        var n = I.castCells(s, u, facing).length, made = [], done = {};
        ctx.labThicken.forEach(function (c) {
          if (done[key(c[0], c[1])]) return;
          var comp = forestComp(s, c[0], c[1]), ring = [];
          comp.forEach(function (p) {
            done[key(p[0], p[1])] = true;
            neighbors(s, p[0], p[1]).forEach(function (nb) { if (getTile(s, nb.x, nb.y) === 'empty' && !unitAt(s, nb.x, nb.y) && !has(ring, nb.x, nb.y)) ring.push([nb.x, nb.y]); });
          });
          ring.slice(0, n).forEach(function (r) { setTile(s, r[0], r[1], 'forest'); made.push(r); });
        });
        if (made.length) ev.push({ type: 'kindle', cells: made, text: '【道】森が茂って、かたまりの外側へ広がった（' + made.length + 'マス）' });
      }
      var o = I.castOrigin(s, u, facing), F = DIRS[facing];
      if (fxOn(u, 'sow')) {
        var depth = 0, spot = null;
        I.castCells(s, u, facing).forEach(function (c) { var dd = (c[0] - o.x) * F.dx + (c[1] - o.y) * F.dy; if (dd > depth) depth = dd; });
        for (var k = depth + 1; k < 20; k++) {
          var x = o.x + F.dx * k, y = o.y + F.dy * k;
          if (!inBounds(s, x, y) || getTile(s, x, y) !== 'empty' || unitAt(s, x, y)) break;
          spot = [x, y];
        }
        if (spot) { setTile(s, spot[0], spot[1], seed); ev.push({ type: 'kindle', cells: [spot], text: '【道】種まき: 正面の奥（' + spot[0] + ',' + spot[1] + '）に' + tileName(seed) + 'が芽吹いた' }); }
      }
      if (fxOn(u, 'bigtree')) {
        var d = I.rotate(facing, 0, 3), mx = o.x + d[0], my = o.y + d[1], mt = inBounds(s, mx, my) ? getTile(s, mx, my) : null;
        if (mt && !unitAt(s, mx, my) && mt !== 'bigtree' && (FOREST_LIKE[mt] || mt === 'thicket' || mt === 'empty')) {
          setTile(s, mx, my, 'bigtree');
          ev.push({ type: 'kindle', cells: [[mx, my]], text: '【道】形の真ん中に大樹がそびえた（通れない・高い。つながった森が燃えると、燃え広がりが2マス長く走る）' });
        }
      }
      var vine = fxOn(u, 'vineFar') ? 2 : fxOn(u, 'vine') ? 1 : 0;
      if (vine >= 1) {
        ctx.order.forEach(function (id) {
          var h = ctx.hits[id], q = I.findUnit(s, id);
          if (!h || h.src !== 'direct' || id === u.id || !q || q.side === 'object' || q.stuck) return;
          if (!unitCells(q).some(function (c) { return forestWithin(s, ctx.labPre.tiles, c[0], c[1], vine); })) return;
          q.stuck = true;
          ev.push({ type: 'mud', id: q.id, cells: [[q.x, q.y]], text: '【道】' + unitLabel(s, q) + 'の足に蔓が絡んだ（森から' + vine + 'マス以内。次の移動は1回休み）' });
        });
      }
    }
    // 止める3 茨の牢（茨の牢に覚醒した草がいる盤面では、森に3方向以上を囲まれたマスの者は、移動も予告も撃つこともできない）
    function thornActive(s) { return lon() && s.units.some(function (x) { return x.magic === 'grass' && fxOn(x, 'thorn'); }); }
    function thornCaged(s, u) {
      if (!u || u.side === 'object' || !thornActive(s)) return false;
      return unitCells(u).some(function (c) {
        var n = 0;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var x = c[0] + d[0], y = c[1] + d[1]; if (inBounds(s, x, y) && FOREST_LIKE[getTile(s, x, y)]) n++; });
        return n >= 3;
      });
    }
    function thornIntent(s, ev) {
      if (!thornActive(s)) return;
      I.enemiesOf(s).forEach(function (e) {
        if (!e.intent || !thornCaged(s, e)) return;
        e.intent = false;
        ev.push({ type: 'info', id: e.id, cells: [[e.x, e.y]], text: '【道】' + unitLabel(s, e) + 'は茨の牢に囚われた。予告が消えた' });
      });
    }
    cannotMore.push(function (s, e, ev) {
      if (!thornCaged(s, e)) return false;
      ev.push({ type: 'info', id: e.id, cells: [[e.x, e.y]], text: '【道】' + unitLabel(s, e) + 'は茨の牢に囚われていて、動けず予告もできない' });
      return true;
    });
    // 大樹（LAB_L の草の育てるの覚醒）: 火で燃える・雷が落ちる・燃え移る。つながった森が燃えると燃え広がりが2マス長い
    placeMore.push(function (s, u, x, y, t, o, facing, ctx, ev) {
      if (!lon() || u.magic !== 'fire' || t !== 'bigtree') return false;
      setTile(s, x, y, 'fire'); ctx.phrases.push('【道】大樹が燃えた');
      return true;
    });
    function plantLike(t) { return t === 'bigtree' && lon(); }
    function spreadBonus(s, ox, oy, ctx) {
      if (!lon()) return 0;
      var ok = { fire: true, smallfire: true, forest: true, thicket: true, deepforest: true, bigtree: true }, seen = {}, stack = [[ox, oy]], found = false;
      while (stack.length && !found) {
        var c = stack.pop(), k = key(c[0], c[1]);
        if (seen[k] || !inBounds(s, c[0], c[1])) continue;
        var t = getTile(s, c[0], c[1]);
        if (!ok[t]) continue;
        seen[k] = true;
        if (t === 'bigtree') found = true;
        stack.push([c[0] + 1, c[1]], [c[0] - 1, c[1]], [c[0], c[1] + 1], [c[0], c[1] - 1]);
      }
      if (found && ctx) ctx.phrases.push('【道】大樹とつながった森が燃えて、燃え広がりが2マス長く走る');
      return found ? 2 : 0;
    }

    // ---- 作る（全魔法に共通）: 形が1マス増える（水・風は届く長さが伸びる。lengthFor） ----
    cellsMore.push(function (s, u, o, facing) {
      if (!lon() || mon() || !lpathOf(u)) return null;   // M は mCells
      var n = shapeSteps(u), extra = LP.EXTRA_CELLS[u.magic];
      if (!n || !extra || !B.shapes[u.magic]) return null;
      return shapeAt(s, B.shapes[u.magic].concat(extra.slice(0, n)), o, facing);
    });

    // ---- L6 クエストで方向を選ぶ（お題ごとに、どの方向のミッションが出るか） ----
    //   同じ盤面で、方向ごとのクエスト（開拓・討伐・足止め・誘導）を作る。ミッションは QUEST_POOL の上から2つ＋盤面のもとのミッションから別の方向を1つ（＋4つ目は3番目）。
    //   シナリオの labQuests: { 方向: [ミッション] } があれば、そちらを使う。お題に合う方向（QUEST_LEAN）を先頭に、fit を付けて返す
    function questsOf(p) {
      var base = (p && p.labState && p.labState.labTargetList) || [];
      if (!base.length) return [];
      var lean = (LT.QUEST_LEAN || {})[p.mission || 'annihilate'] || 'decide';
      var MQ = mon(), ORDER = MQ ? LPW.QUEST_ORDER : LT.DIR_ORDER, POOL = (MQ ? LPW.QUEST_POOL : LT.QUEST_POOL) || {}, QNAME = (MQ ? LPW.QUEST_NAME : LT.QUEST_NAME) || {};
      if (non()) { ORDER = LCH.QUEST_ORDER; POOL = LCH.QUEST_POOL; QNAME = LCH.QUEST_NAME; lean = LCH.QUEST_LEAN[p.mission || 'annihilate'] || 'defeat'; }   // N: 討伐・開拓・誘導・守り   // M: 討伐・守り・誘導・開拓
      var order = [lean].concat(ORDER.filter(function (d) { return d !== lean; }));
      return order.map(function (dir) {
        var pool = POOL[dir] || [];
        var other = base.map(targetDef).filter(function (q) { return q && q.dir !== dir; })[0];
        var list = (p.labQuests && p.labQuests[dir]) || pool.slice(0, 2).concat(other ? [other.id] : []).concat(pool.slice(2, 3));
        var seen = {};
        list = list.filter(function (id) { var k = typeof id === 'string' ? id : id.id; if (seen[k]) return false; seen[k] = true; return true; });
        return { dir: dir, name: QNAME[dir] || dir, list: list, fit: dir === lean };
      });
    }
    function questOf(p, dir) { var qs = questsOf(p); return qs.filter(function (q) { return q.dir === dir; })[0] || qs[0] || null; }

    // ---- エディット: 味方の道を直接いじる（p が null なら外す） ----
    function editSetPath(s0, unitId, p) {
      var u0 = I.findUnit(s0, unitId);
      if (!u0 || u0.side === 'object' || !pathDef(u0.magic)) return { ok: false, state: s0, events: [], steps: [], error: 'この魔法には道がない' };
      var s = I.clone(s0), u = I.findUnit(s, unitId);
      if (p) u.labPath = normPath(u.magic, p); else delete u.labPath;
      return { ok: true, state: s, events: [], steps: [] };
    }
    // ---------------------------------------------------------------
    // M 強化の方向（3つ）とミッション（.claude/lab/LAB_M_power.md）。データは lab_power.js、画面は lab_target_ui.js（M のときの描き分け）
    //   L0 の土台（ミッション・取った記録・育ちの画面・持ち越し・L6 クエスト）をそのまま使い、道の形と方向だけを M のものに替える。
    //   M0 がオフなら何もしない（L は 作る・決める・止める・動かす のまま）。作るの方向はない（作る系のミッションは単純強化か目印。M4）
    //   道 u.labPath = { decide, stop, move, simple, form, awake }。強化1回で形が1マス（上限 shapeMax）。
    //     最初に change に届いた方向へ変化（1段目。ほかの方向は閉じる）。変化のあと、強化の合計が awake に届くと覚醒（2段目）
    //   M0 がオンのときだけ、当たった者・盤面に次を足す
    //     u.labGuard 相手の攻撃を防ぐ回数、u.labBoost 次の1発で増えるマス、u.labShrink 次の1発は1マス、u.labDelay { n } 予告が遅れる、
    //     u.labSilence 予告を出せない回数、u.labAfter { move, shoot } 撃ったあとのもう1回、u.labCand M5 の候補 { id: true }（シナリオかエディットで）
    //     u.labWalked 歩いた（味方）、u.labShots 撃った回数（敵）、u.labShotSeq 最後に撃った順（味方）
    //     s.labFinTurn このターンの決め手の数、s.labLastHand 最後に撃った味方の手、s.labAllyLost 味方が倒れた、s.labDeadShots 倒れた敵の撃った回数、
    //     s.labPlanTo / s.labBlocker 敵の予定の行き先とふさいだ手、s.labTraps 置いた魔法、s.labLinger もう1ターン残すマス、s.labEndDone 勝ったときの判定を済ませた
    // ---------------------------------------------------------------
    var LPW = (IS_NODE_L ? require('./lab_power.js') : root.LAB_POWER) || { DIRS: {}, DIR_ORDER: [], LIST_ORDER: [], MISSIONS: [], FORMS: {}, PROPS: {}, TWO: {}, CANDS: [],
      STAGE3: [], TAKERS: {}, QUEST_POOL: {}, QUEST_NAME: {}, QUEST_ORDER: [], FLAVOR: {}, STAND_ON: {} };
    function mon() { return lon() && on('M0'); }
    function clampN(v, lo, hi, d) { var n = Math.round(Number(v)); if (!isFinite(n)) n = d; return Math.max(lo, Math.min(hi, n)); }
    function mDirsMode() { return lopt('M1', 'dirs', 'three') === 'two' ? 'two' : 'three'; }
    function mDest() { var v = lopt('M2', 'dest', 'simple'); return v === 'nothing' || v === 'remain' ? v : 'simple'; }
    function mChangeAt() { return clampN(lopt('M3', 'change', 2), 1, 6, 2); }
    function mAwakeAt() { return Math.max(mChangeAt() + 1, clampN(lopt('M3', 'awake', 5), 2, 12, 5)); }
    function mShapeMax() { return clampN(lopt('M3', 'shapeMax', 3), 0, 7, 3); }
    function mMakeMode() { return lopt('M4', 'make', 'simple') === 'marker' ? 'marker' : 'simple'; }
    function mName(d) { return LPW.DIRS[d] ? LPW.DIRS[d].name : d; }
    function mCand(u, id) {
      if (non()) return !!u && N_CANDS[id] === true && nHas(u, id);   // N: 間の強化（もう1ターン残る・足場で形が増える・撃った先へ移る）
      return mon() && on('M5') && !!u && !!u.labCand && !!u.labCand[id];
    }
    var HIGH = { hill: true, hillsakura: true };   // 立てる高い所（山は立てない）

    // ---- ミッションの仕分け（画面から。id → decide／stop／move／make／off 使わない） ----
    var mSort = {};
    function setSort(map) { mSort = {}; Object.keys(map || {}).forEach(function (k) { if (LPW.DIRS[map[k]] || map[k] === 'off') mSort[k] = map[k]; }); }
    function missionDir(t) { return (t && mSort[t.id]) || (t && t.dir); }
    function mMission(id) { return LPW.MISSIONS.filter(function (d) { return d.id === id; })[0] || null; }
    // この盤面で出せるか（使わない・村がない・運ぶものがない・D2 の行き先がない）
    function mOffer(s, t) {
      if (!mon()) return true;
      if (t.dir === 'off') return false;
      if (t.needsVillage && !I.objectsOf(s, 'village').length) return false;
      if (t.needsCarry && ['retrieve', 'escort'].indexOf(I.missionType(s)) < 0) return false;
      if (t.check.kind === 'blocked' && !on('D2')) return false;
      return true;
    }
    function mSetup(s) {
      ['labFinTurn', 'labLastHand', 'labAllyLost', 'labDeadShots', 'labPlanTo', 'labBlocker', 'labEndDone', 'labTraps', 'labLinger'].forEach(function (k) { delete s[k]; });
    }

    // ---- 道（3つの方向・変化・覚醒） ----
    function mDef(m) {
      var forms = LPW.FORMS[m];
      if (!forms) return null;
      return { dirs: mDirsMode() === 'two' && LPW.TWO[m] ? LPW.TWO[m].slice() : LPW.DIR_ORDER.slice(), forms: forms, m: true, steps: {} };
    }
    function mNew() { return { decide: 0, stop: 0, move: 0, simple: 0, form: null, awake: false }; }
    function mTotal(p) { return p ? (p.decide || 0) + (p.stop || 0) + (p.move || 0) + (p.simple || 0) : 0; }
    // 道の形をそろえる（持たない方向の数は単純強化へ。変化は change に届いた方向で1つだけ。ほかの方向は change-1 まで）
    function mNorm(m, p0) {
      var d = mDef(m);
      if (!d) return null;
      var src = p0 || {}, p = mNew(), C = mChangeAt();
      LPW.DIR_ORDER.forEach(function (k) {
        var v = clampN(src[k], 0, 12, 0);
        if (d.dirs.indexOf(k) < 0) p.simple += v; else p[k] = v;
      });
      p.simple += clampN(src.simple, 0, 12, 0);
      var f = src.form && d.dirs.indexOf(src.form) >= 0 && p[src.form] >= C ? src.form : null;
      if (!f) d.dirs.forEach(function (k) { if (p[k] >= C && (!f || p[k] > p[f])) f = k; });
      if (f) d.dirs.forEach(function (k) { if (k !== f && p[k] >= C) { p.simple += p[k] - (C - 1); p[k] = C - 1; } });
      p.form = f;
      p.awake = !!f && mTotal(p) >= mAwakeAt();
      return p;
    }
    function mAwakeCheck(p, m, out) {
      var d = mDef(m);
      if (d && p.form && !p.awake && mTotal(p) >= mAwakeAt()) { p.awake = true; out.awake = d.forms[p.form].lv2; }
      return out;
    }
    function mSimple(p, m) { p.simple = (p.simple || 0) + 1; return mAwakeCheck(p, m, { ok: true, kind: 'simple', step: p.simple }); }
    // 強化を1回入れる（p を書き換える）。dir は方向か make（作る系）。
    //   { ok, kind: 方向か simple, change?: 変化先, awake?: 覚醒先 } ／{ none }（持たない方向）／{ closed }（変化で閉じた）／{ marker }（目印だけ）
    function mAdvance(p, m, dir) {
      var d = mDef(m);
      if (!d || !p) return { none: true };
      if (dir === 'make' || !LPW.DIRS[dir]) return mMakeMode() === 'marker' ? { marker: true } : mSimple(p, m);
      if (d.dirs.indexOf(dir) < 0) return { none: true };
      if (p.form && p.form !== dir) return { closed: true };
      p[dir] = (p[dir] || 0) + 1;
      var out = { ok: true, kind: dir, step: p[dir] };
      if (!p.form && p[dir] >= mChangeAt()) { p.form = dir; out.change = d.forms[dir]; }
      return mAwakeCheck(p, m, out);
    }
    // 達成したときの行き先（M2）。持たない・閉じた方向は simple 単純強化 ／nothing ／remain
    function mGain(p, m, dir) {
      var r = mAdvance(p, m, dir), g;
      if (r.ok || r.marker || !p || !mDef(m)) g = { dir: r.kind || dir, res: r };
      else if (mDest() === 'simple') g = { dir: 'simple', res: mSimple(p, m), via: r };
      else g = { dir: dir, res: r, dest: mDest() };
      if (p) g.after = lclone(p);
      return g;
    }
    function mCanTake(p, m, dir) {
      if (non()) return true;   // N: 印にならないミッション（N2 partner）も、達成にはなる
      if (mDest() !== 'remain' || !mDef(m)) return true;
      var r = mAdvance(lclone(p || mNew()), m, dir);
      return !!(r.ok || r.marker);
    }
    // 変化・覚醒した姿 { name, mark, stage: 1|2, dir, prop }
    function mFormOf(u) {
      var raw = lpathOf(u), d = raw ? mDef(u.magic) : null, p = d ? mNorm(u.magic, raw) : null;   // シナリオの道（{ stop: 2 } など）もそろえて読む
      if (!d || !p.form || !d.forms[p.form]) return null;
      var f = d.forms[p.form];
      return p.awake ? { name: f.lv2.name, mark: f.lv2.mark, stage: 2, dir: p.form, prop: f.prop, base: f.name } : { name: f.name, mark: f.mark, stage: 1, dir: p.form, prop: f.prop };
    }

    // ---- 予測・育ちの言葉 ----
    function mShapeNote(before) { return before < mShapeMax() ? '形が1マス増える' : '形はもう上限まで増えた'; }
    function mOthers(m, k) { var d = mDef(m); return d ? d.dirs.filter(function (x) { return x !== k; }).map(mName).join('・') : ''; }
    function mHint(m, r, after) {
      var d = mDef(m);
      if (!d || !after) return '';
      if (r.change) { var o = mOthers(m, r.kind); return '変化「' + r.change.name + '」！' + (o ? ' ' + o + 'は閉じる' : '') + (r.awake ? '。覚醒「' + r.awake.name + '」！' : ''); }
      if (r.awake) return '覚醒「' + r.awake.name + '」！';
      if (after.form) { if (after.awake) return ''; var left = mAwakeAt() - mTotal(after); return left > 0 ? 'あと' + left + 'つで覚醒「' + d.forms[after.form].lv2.name + '」' : ''; }
      if (r.kind && d.forms[r.kind]) { var l2 = mChangeAt() - (after[r.kind] || 0); return l2 > 0 ? 'あと' + l2 + 'つで変化「' + d.forms[r.kind].name + '」' : ''; }
      return '';
    }
    function mParen(parts) { parts = parts.filter(Boolean); return parts.length ? '（' + parts.join('。') + '）' : ''; }
    function mNotWhy(m, dir, r, before) {
      var nm = I.magicName(m), d = mDef(m);
      if (r.none) return nm + 'は' + mName(dir) + 'を持たない';
      if (r.closed) return nm + 'は' + (before && before.form && d.forms[before.form] ? d.forms[before.form].name : '別の姿') + 'に変化して、' + mName(dir) + 'は閉じている';
      return '';
    }
    function mGainText(m, dir, g, before) {
      var nm = I.magicName(m), r = g.res;
      if (!mDef(m)) return nm + 'には道がない（育たない）';
      if (r.marker) return '目印のミッション（強化にはならない。M4）';
      var bt = g.after ? mTotal(g.after) - (r.ok ? 1 : 0) : 0;
      var tail = mParen([mShapeNote(bt), mHint(m, r, g.after)]);
      if (g.via) return mNotWhy(m, dir, g.via, before) + 'ので、単純強化' + tail;
      if (r.ok && r.kind === 'simple') return '作る系なので、' + nm + 'は単純強化' + tail;
      if (r.ok) return nm + 'の' + mName(r.kind) + 'が1つ進む' + tail;
      if (g.dest === 'remain') return mNotWhy(m, dir, r, before) + 'ので、達成にならない（M2: 残る）';
      return mNotWhy(m, dir, r, before) + 'ので、何も起きない';
    }
    function mOutlook(m, p, dir) {
      if (!mDef(m)) return '達成するが、' + I.magicName(m) + 'には道がない（育たない）';
      var before = mNorm(m, p || mNew());
      return mGainText(m, dir, mGain(lclone(before), m, dir), before);
    }
    function mDots(n, max) { var t = ''; for (var i = 0; i < max; i++) t += i < n ? '●' : '○'; return t; }
    // 進み具合の印（決●○ 止○○× 動○○× 強●●○○○）。閉じた方向は ×
    function mMarks(m, p0) {
      var d = mDef(m);
      if (!d) return '';
      var p = mNorm(m, p0), C = mChangeAt(), A = mAwakeAt();
      return d.dirs.map(function (k) { return LPW.DIRS[k].mark + mDots(Math.min(C, p[k] || 0), C) + (p.form && p.form !== k ? '×' : ''); }).join(' ') + ' 強' + mDots(Math.min(A, mTotal(p)), A);
    }
    function mPropText(prop, lv) { var P = LPW.PROPS[prop]; return P ? (lv >= 2 ? P.t1 + '。' + P.t2 : P.t1) : prop; }
    // 方向 k の中身（変化先と覚醒先）
    function mStepText(m, k) {
      var d = mDef(m), f = d && d.forms[k];
      if (!f) return '';
      var P = LPW.PROPS[f.prop] || {};
      return '変化「' + f.name + '」: ' + (P.t1 || f.prop) + ' → 覚醒「' + f.lv2.name + '」: ' + (P.t2 || '');
    }

    // ---- 性質（変化先が持つもの＋M5 の候補） ----
    var CAND_PROPS = ['silence', 'guard', 'pierce', 'hold', 'cancel', 'delay', 'moveAfter'];
    // 人が持つ性質 { 性質: レベル }。効き目が1段強く（M5 effect）で1つ上がる（変化前なら、風の運ぶ・闇の引き寄せ・火の火傷）
    function mProps(u) {
      var out = {};
      if (!mon() || !u) return out;
      if (non()) { if (nHas(u, 'moveAfter')) out.moveAfter = 1; return out; }   // N: 間の強化「撃ったあと動ける」（ほかの間の強化は nAfterShot）
      var f = mFormOf(u);
      if (f) out[f.prop] = f.stage;
      if (on('M5') && u.labCand) {
        CAND_PROPS.forEach(function (k) { if (u.labCand[k] && !out[k]) out[k] = 1; });
        if (u.labCand.effect) {
          Object.keys(out).forEach(function (k) { out[k] = Math.min(3, out[k] + 1); });
          var base = { wind: 'push', dark: 'pull', fire: 'wound' }[u.magic];
          if (!f && base && !out[base]) out[base] = 1;
        }
      }
      return out;
    }
    function mLabel(s, u) { return '【強化】' + (formName(u) || I.magicName(u.magic)); }
    function mFlavor(prop, m, d) { return ((LPW.FLAVOR || {})[prop] || {})[m] || d; }
    // 撃ったあと: 当たった者（直撃。術者は除く）に性質を起こす
    function mHitProps(s, u, q, P, facing, ev) {
      var who = mLabel(s, u) + ': ' + unitLabel(s, q);
      var stick = function (n) { var cur = q.stuck === true ? 1 : (Number(q.stuck) || 0); if (n > cur) q.stuck = n === 1 ? true : n; return Math.max(n, cur); };
      if (P.hold) { var n1 = stick(P.hold); ev.push({ type: 'mud', id: q.id, cells: [[q.x, q.y]], text: who + 'は' + mFlavor('hold', u.magic, '足が止まった') + '（次の移動は' + n1 + '回休み）' }); }
      if (P.guard) { q.labGuard = Math.max(q.labGuard || 0, P.guard); ev.push({ type: 'info', id: q.id, cells: [[q.x, q.y]], text: who + 'は守られた（相手の次の攻撃を' + q.labGuard + '回防ぐ）' }); }
      if (P.boost) { q.labBoost = 2 * P.boost; ev.push({ type: 'info', id: q.id, cells: [[q.x, q.y]], text: who + 'に追い風（次の魔法の形が' + q.labBoost + 'マス大きい）' }); }
      if (P.wound) { q.burn = Math.max(q.burn || 0, B.fire.burnTurns + P.wound - 1); ev.push({ type: 'burnStatus', id: q.id, cells: [[q.x, q.y]], text: who + 'は' + mFlavor('wound', u.magic, '傷を負った') + '（傷: ターン終了ごとに' + B.fire.burnDamage + '、あと' + q.burn + '回。火傷と同じく水・氷で治る）' }); }
      if (q.side === 'enemy' && P.delay && q.intent) {
        q.intent = false; q.labDelay = { n: P.delay };
        ev.push({ type: 'info', id: q.id, cells: [[q.x, q.y]], text: who + 'の予告が' + P.delay + 'ターン遅れた（その場で構えたまま、' + P.delay + 'ターン後に撃つ）' });
      }
      if (q.side === 'enemy' && P.cancel && q.intent) {
        q.intent = false;
        ev.push({ type: 'info', id: q.id, cells: [[q.x, q.y]], text: who + 'の予告が消えた' });
        if (P.cancel >= 2) { var n2 = stick(P.cancel - 1); ev.push({ type: 'mud', id: q.id, cells: [[q.x, q.y]], text: who + 'は足も止まった（次の移動は' + n2 + '回休み）' }); }
      }
      if (q.side === 'enemy' && P.silence) { q.labSilence = Math.max(q.labSilence || 0, P.silence); ev.push({ type: 'info', id: q.id, cells: [[q.x, q.y]], text: who + 'は次の' + q.labSilence + 'ターン、魔法を撃てない' }); }
      if (P.turn && q.facing !== facing) {
        q.facing = facing;
        ev.push({ type: 'info', id: q.id, cells: [[q.x, q.y]], text: who + 'は' + DIRS[facing].name + 'を向かされた' + (q.intent ? '（予告の向きも変わった）' : '') });
        if (P.turn >= 2) { var n3 = stick(P.turn - 1); ev.push({ type: 'mud', id: q.id, cells: [[q.x, q.y]], text: who + 'は足も止まった（次の移動は' + n3 + '回休み）' }); }
      }
      if (P.lure) {
        var toward = I.faceToward(q.x, q.y, u);
        if (toward && q.facing !== toward) { q.facing = toward; ev.push({ type: 'info', id: q.id, cells: [[q.x, q.y]], text: who + 'は術者のほうを向かされた' + (q.intent ? '（予告も術者のほうへ）' : '') }); }
        if (P.lure >= 2) { var n4 = stick(P.lure - 1); ev.push({ type: 'mud', id: q.id, cells: [[q.x, q.y]], text: who + 'は足も止まった（次の移動は' + n4 + '回休み）' }); }
      }
      if (P.push && !I.isFixed(q)) shove(s, q, facing, 1, P.push >= 2, ev, who + 'を' + DIRS[facing].name + 'へ押した' + (mFlavor('push', u.magic, '') ? '（' + mFlavor('push', u.magic, '') + '）' : ''));
      if (P.pull && !I.isFixed(q)) {
        for (var i = 0; i < Math.min(9, P.pull) && I.findUnit(s, q.id); i++) {
          var d = I.faceToward(q.x, q.y, u);
          if (!d || Math.abs(q.x - u.x) + Math.abs(q.y - u.y) <= 1) break;
          if (!I.pushOne(s, q, d, ev, who + 'は術者のほうへ引き寄せられた' + (mFlavor('pull', u.magic, '') ? '（' + mFlavor('pull', u.magic, '') + '）' : ''))) break;
        }
      }
    }
    // 撃つ前（castMagic の最初）: 最後に撃った味方の手・予告の範囲にいた味方（「予告から味方を出す」）
    var mBusy = false;   // 予測の中の予測をしない
    function mForecast(s) { if (mBusy) return null; mBusy = true; try { return I.forecast(s); } finally { mBusy = false; } }
    function mDangerIds(s) {
      var fc = mForecast(s), out = [];
      (fc ? fc.enemyDamage : []).forEach(function (d) {
        var by = I.findUnit(s, d.by);
        if (d.side === 'ally' && d.amount > 0 && by && by.side === 'enemy' && out.indexOf(d.id) < 0) out.push(d.id);
      });
      return out;
    }
    function mShotStart(s, u, ctx, ev) {
      ctx.labEv0 = ev ? ev.length : 0;
      ctx.labFacing = u.facing;
      if (u.side === 'ally' && s.labTargets) {
        s.labLastHand = { id: u.id, side: 'ally', magic: u.magic };
        s.labShotN = (s.labShotN || 0) + 1; u.labShotSeq = s.labShotN;
        if (!mBusy && openT(s, 'rescue').length) ctx.labDanger = mDangerIds(s);
      }
    }
    // 撃ったあと（L の判定より先。L の afterShotMore から呼ぶ）: 当たった者に性質・置く・移る
    function mAfterShot(s, u, facing, ctx, ev) {
      if (!mon()) return;
      if (u.side === 'enemy') u.labShots = (u.labShots || 0) + 1;
      if (u.labBoost) delete u.labBoost;     // 大きくなるのは次の1発だけ
      if (u.labShrink) delete u.labShrink;   // 小さくなるのも次の1発だけ
      var P = mProps(u);
      var hits = ctx.order.filter(function (id) { var h = ctx.hits[id]; return h && h.src === 'direct' && id !== u.id; })
        .map(function (id) { return I.findUnit(s, id); }).filter(function (q) { return q && q.side !== 'object'; });
      if (Object.keys(P).length) hits.forEach(function (q) { if (I.findUnit(s, q.id)) mHitProps(s, u, q, P, facing, ev); });
      if (mCand(u, 'shrink')) hits.forEach(function (q) { if (I.findUnit(s, q.id)) { q.labShrink = true; ev.push({ type: 'info', id: q.id, cells: [[q.x, q.y]], text: mLabel(s, u) + ': ' + unitLabel(s, q) + 'の次の魔法は1マスだけ' }); } });
      if (mCand(u, 'linger') && ctx.labPre) mLinger(s, u, ctx);
      if (mCand(u, 'leap')) mLeap(s, u, ctx, ev);
    }
    // M5 もう1ターン残る: この1発で生まれた、1ターンで消える自然
    var LINGER = { breeze: true, gale: true, smallfire: true, petals: true, sandstorm: true };   // N: 砂嵐も
    function mLinger(s, u, ctx) {
      for (var i = 0; i < s.tiles.length; i++) {
        if (s.tiles[i] !== ctx.labPre.tiles[i] && LINGER[s.tiles[i]]) { s.labLinger = s.labLinger || {}; s.labLinger[i] = 1; }
      }
    }
    function keepTile(s, x, y, from) {
      if (!s.labLinger || !LINGER[from]) return false;
      var i = idx(s, x, y);
      if (!s.labLinger[i]) return false;
      delete s.labLinger[i];
      if (!Object.keys(s.labLinger).length) delete s.labLinger;
      return true;
    }
    // M5 撃った先へ移る: 形の一番奥の、立てて空いているマスへ
    function mLeap(s, u, ctx, ev) {
      var best = null;
      (ctx.cells || []).forEach(function (c) {
        if (!canStandAt(s, u, c[0], c[1])) return;
        var d = Math.abs(c[0] - u.x) + Math.abs(c[1] - u.y);
        if (d > 0 && (!best || d > best.d)) best = { c: c, d: d };
      });
      if (!best) return;
      var from = [u.x, u.y];
      u.x = best.c[0]; u.y = best.c[1];
      ev.push({ type: 'push', id: u.id, ok: true, from: from, to: best.c.slice(), text: mLabel(s, u) + ': 撃った先（' + best.c[0] + ',' + best.c[1] + '）へ移った' });
      if (getTile(s, u.x, u.y) === 'mud') I.enterMud(s, u, ev);
    }
    // M5 置いておく: 撃つ代わりに形のマスへ置く。人が入ると、置いたときの場所と向きから発動する
    castMore.push(function (s, u, facing, ctx, ev) {
      if (!mCand(u, 'trap') || s.labTrapFiring) return false;
      var cells = I.castCells(s, u, facing);
      s.labTraps = (s.labTraps || []).filter(function (t) { return t.by !== u.id; }).concat([{ by: u.id, x: u.x, y: u.y, facing: facing, cells: cells, magic: u.magic }]);
      ctx.cells = cells.slice();
      ctx.phrases.push('【強化】' + I.magicName(u.magic) + 'の魔法を形のマスに置いた（人が入ると発動。敵でも味方でも）');
      return true;
    });
    function mTrapCheck(s, q, ev) {
      if (!s.labTraps || !s.labTraps.length || !q || q.side === 'object' || s.labTrapFiring) return;
      var cells = unitCells(q);
      var t = s.labTraps.filter(function (tr) { return tr.by !== q.id && tr.cells.some(function (c) { return has(cells, c[0], c[1]); }); })[0];
      if (!t) return;
      s.labTraps = s.labTraps.filter(function (x) { return x !== t; });
      if (!s.labTraps.length) delete s.labTraps;
      var c = I.findUnit(s, t.by);
      if (!c) return;
      var keep = { x: c.x, y: c.y, facing: c.facing };
      ev.push({ type: 'info', id: q.id, cells: [[q.x, q.y]], text: '【強化】' + unitLabel(s, q) + 'が置いておいた' + I.magicName(t.magic) + 'の魔法に入った → 発動' });
      s.labTrapFiring = true;
      c.x = t.x; c.y = t.y; c.facing = t.facing;
      try { I.shoot(s, c, t.facing, ev); } finally {
        delete s.labTrapFiring;
        var still = I.findUnit(s, c.id);
        if (still) { still.x = keep.x; still.y = keep.y; still.facing = keep.facing; }
      }
    }
    afterMoveMore.push(function (s, u, from, to, ev) {
      if (!mon()) return;
      if (u.side === 'ally' && s.labTargets) u.labWalked = true;   // 「歩かずに勝つ」
      mTrapCheck(s, u, ev);
    });
    // 形（置く・点ける・走る魔法）: 強化の数＋大きくする＋足場。小さく・2回撃てる・貫く
    var M_MORE = { grass: [[-1, 2], [0, 4], [1, 4], [-1, 4]] };   // 草は EXTRA_CELLS が3つなので、大きくするときの続き
    function mBonus(s, u) {
      var n = shapeSteps(u) + (u.labBoost || 0);
      var st = ((non() ? LCH.STAND_ON : LPW.STAND_ON) || {})[u.magic];
      if (mCand(u, 'standOn') && st && st.indexOf(getTile(s, u.x, u.y)) >= 0) n += 2;
      return n;
    }
    function mPierce(s, cells, facing, lv) {
      var F = DIRS[facing], out = cells.slice();
      cells.forEach(function (c) {
        if (!unitAt(s, c[0], c[1])) return;
        for (var i = 1; i <= lv; i++) { var x = c[0] + F.dx * i, y = c[1] + F.dy * i; if (inBounds(s, x, y) && !has(out, x, y)) out.push([x, y]); }
      });
      return out;
    }
    cellsMore.unshift(function (s, u, o, facing) {
      if (!mon() || u.magic === 'water' || u.magic === 'wind' || !B.shapes[u.magic]) return null;
      var n = mBonus(s, u), P = mProps(u), twice = mCand(u, 'twice');
      if (!n && !u.labShrink && !twice && !P.pierce) return null;   // 今の形のまま
      var extra = (LP.EXTRA_CELLS[u.magic] || []).concat(M_MORE[u.magic] || []);
      var cells = shapeAt(s, B.shapes[u.magic].concat(extra.slice(0, n)), o, facing);
      if (u.labShrink) cells = cells.slice(0, 1);
      else if (twice) cells = cells.slice(0, Math.max(1, Math.ceil(cells.length / 2)));
      if (P.pierce) cells = mPierce(s, cells, facing, P.pierce);
      return cells;
    });
    // 流れる・吹く魔法の長さ（lengthFor から。強化の数はもう足してある）
    function mLength(s, u, len) {
      var P = mProps(u);
      len += (u.labBoost || 0);
      var st = ((non() ? LCH.STAND_ON : LPW.STAND_ON) || {})[u.magic];
      if (mCand(u, 'standOn') && st && st.indexOf(getTile(s, u.x, u.y)) >= 0) len += 2;
      if (u.magic === 'water' && P.untilHit) len = 99;   // 何かに当たるまで流れる
      if (u.labShrink) len = 1;
      else if (mCand(u, 'twice')) len = Math.max(1, Math.ceil(len / 2));
      return len;
    }
    // 水が人を貫いて流れ続けるか（rules.js の flow から）。貫く・当たるまでの2段目
    function passUnit(s, u, o, ctx) {
      if (!mon()) return false;
      var P = mProps(u), n = (P.pierce || 0) + (P.untilHit >= 2 ? 9 : 0);
      ctx.labPassed = ctx.labPassed || 0;
      if (ctx.labPassed >= n) return false;
      ctx.labPassed++;
      ctx.phrases.push(mLabel(ctx.s || {}, u) + ': ' + unitLabel(ctx.s, o) + 'を貫いて流れた');
      return true;
    }
    // M5 手前を飛ばす: 形が1マス先から
    originMore.push(function (s, u, facing) {
      if (!mCand(u, 'skip')) return null;
      var F = DIRS[facing], k = getTile(s, u.x, u.y) === 'hill' ? 2 : 1;
      return { x: u.x + F.dx * k, y: u.y + F.dy * k };
    });
    // M5 直撃の威力
    hitMore.push(function (ctx, u, amount, src) {
      if (src !== 'direct' || !ctx.caster || !ctx.s || !on('M5')) return amount;
      var c = I.findUnit(ctx.s, ctx.caster);
      return c && mCand(c, 'power') ? amount + 2 : amount;
    });
    // 守る（城壁）: 相手の側からの攻撃を、回数だけ防ぐ（その1発のダメージを全部なくす）
    function mGuard(s, ctx, ev) {
      if (!mon() || !ctx.caster) return;
      var c = I.findUnit(s, ctx.caster), side = c ? c.side : null;
      if (!side) return;
      ctx.order.slice().forEach(function (id) {
        var q = I.findUnit(s, id), h = ctx.hits[id];
        if (!q || !h || !(q.labGuard > 0) || !(h.amount > 0) || q.side === side || q.side === 'object') return;
        q.labGuard--;
        if (!q.labGuard) delete q.labGuard;
        delete ctx.hits[id];
        ctx.order = ctx.order.filter(function (x) { return x !== id; });
        ev.push({ type: 'info', id: q.id, cells: [[q.x, q.y]], text: '【強化】' + unitLabel(s, q) + 'は守られていて、攻撃を防いだ' + (q.labGuard ? '（あと' + q.labGuard + '回）' : '') });
      });
    }
    // 予告が遅れている敵は、その場で同じ向きのまま（遅れの残りが1なら予告を出し直す）
    planMore.push(function (s, e) {
      if (!mon() || !e.labDelay) return null;
      return { to: [e.x, e.y], dir: e.facing, dist: 0, kind: 'attack', noIntent: e.labDelay.n > 1, reason: '予告が遅れている' };
    });
    // 撃たせない（雷縛り・M5）: 予告を出せない
    cannotMore.push(function (s, e, ev) {
      if (!mon() || !(e.labSilence > 0)) return false;
      e.labSilence--;
      if (!e.labSilence) delete e.labSilence;
      ev.push({ type: 'info', id: e.id, cells: [[e.x, e.y]], text: '【強化】' + unitLabel(s, e) + 'は縛られていて、魔法を撃てない（予告なし）' });
      return true;
    });
    // 敵が今の場所から、その行き先へ歩いて行けるか（泥沼にはまっていれば今の場所だけ）
    function mReachable(s, e, a) { return I.reachInfo(s, e).dist[key(a[0], a[1])] !== undefined; }
    function mPlanStart(s, e, plan, ev) {
      if (e.labDelay) { e.labDelay.n -= 1; if (e.labDelay.n <= 0) delete e.labDelay; }
      // 予定の道をふさぐ: ターンの始めに覚えた行き先（D2 の矢印）へ、歩いて行けなくなっていた
      if (s.labTargets && s.labPlanTo && s.labPlanTo[e.id]) {
        var a = s.labPlanTo[e.id];
        delete s.labPlanTo[e.id];
        if (!(e.x === a[0] && e.y === a[1]) && !mReachable(s, e, a)) {
          var hand = (s.labBlocker && s.labBlocker[e.id]) || { id: e.id, side: 'enemy', magic: e.magic };
          openT(s, 'blocked').forEach(function (t) { achieve(s, t, hand, [], ev, [[e.x, e.y], a.slice()]); });
        }
      }
    }
    function mAfterPlan(s, ev) {
      delete s.labPlanTo; delete s.labBlocker;
      if (s.result || !s.labTargets || !openT(s, 'blocked').length || !on('D2')) return;
      var fc = mForecast(s), plan = {};
      ((fc && fc.labPaths) || []).forEach(function (p) { plan[p.id] = p.to.slice(); });
      s.labPlanTo = plan; s.labBlocker = {};
    }
    function mAfterAct(s, u, ev) {
      if (u.side === 'ally' && !s.result && I.findUnit(s, u.id)) {   // 倒れた味方には、もう1回はない
        var shot = ev.some(function (e) { return e.type === 'cast' && e.id === u.id; });
        if (u.labAfter) delete u.labAfter;   // 撃ったあとのもう1回を使った
        else if (shot) {
          var P = mProps(u);
          if (mCand(u, 'twice')) { u.acted = false; u.labAfter = { move: 0, shoot: true }; ev.push({ type: 'info', id: u.id, cells: [[u.x, u.y]], text: mLabel(s, u) + ': もう1回撃てる（動けない。形は半分）' }); }
          else if (P.moveAfter) { u.acted = false; u.labAfter = { move: P.moveAfter, shoot: false }; ev.push({ type: 'info', id: u.id, cells: [[u.x, u.y]], text: mLabel(s, u) + ': 撃ったあと' + P.moveAfter + 'マス動ける（動いて「待機」。動かないなら、その場で「待機」）' }); }
        }
      }
      // 予定の道をふさぐ: この手で、敵が行き先（D2 の矢印）へ歩いて行けなくなったら、その手を覚える（また行けるようになったら消す）
      if (!s.labPlanTo || s.result || !openT(s, 'blocked').length) return;
      Object.keys(s.labPlanTo).forEach(function (id) {
        var a = s.labPlanTo[id], e = I.findUnit(s, id);
        if (!e || (e.x === a[0] && e.y === a[1])) return;
        if (mReachable(s, e, a)) { delete s.labBlocker[id]; return; }
        if (s.labBlocker[id]) return;
        s.labBlocker[id] = { id: u.id, side: u.side, magic: u.magic };
        var t0 = openT(s, 'blocked')[0];
        ev.push({ type: 'labTargetSoon', dir: t0.dir, id: id, cells: [[e.x, e.y], a.slice()],
          text: '【ターゲット】' + unitLabel(s, e) + 'の行き先（' + a[0] + ',' + a[1] + '）への道がふさがった → 敵の番にも通れなければ「' + t0.name + '」（' + handName(s, s.labBlocker[id]) + 'の手 → ' + soonOutlook(s, s.labBlocker[id], t0) + '）' });
      });
    }
    function mTurnEnd(s, ev) {
      if (!mon()) return;
      s.units.forEach(function (x) { if (x.labAfter) delete x.labAfter; });
    }
    function mOnDeath(s, dead, ev) {
      if (!mon()) return;
      dead.forEach(function (d) {
        if (d.side === 'ally' && s.labTargets) s.labAllyLost = true;
        if (d.side === 'enemy') { s.labDeadShots = s.labDeadShots || {}; s.labDeadShots[d.id] = d.labShots || 0; }
      });
    }
    function mNeverShot(s, id) { return !!s.labDeadShots && s.labDeadShots[id] === 0; }
    // 勝ったときに決まるミッション（rules.js の setResult から）
    function onResult(s, ev) {
      if (!mon() || !s.labTargets || s.result !== 'win' || s.labEndDone) return;
      s.labEndDone = true;
      var last = s.labLastHand || null;
      (s.labTargets || []).forEach(function (t) {
        if (t.got || !t.check.end) return;
        var k = t.check.kind, hand = null, cells = [];
        if (k === 'turnWin' && s.turn <= (t.check.turns || 3)) hand = last;
        if (k === 'noLoss' && !s.labAllyLost) hand = last;
        if (k === 'villagesSafe' && I.objectsOf(s, 'village').length && !((s.mission || {}).lost > 0)) hand = last;
        if (k === 'carry') {
          var m = s.mission || {}, type = I.missionType(s);
          if (type === 'retrieve' && m.carrier) { var cu = I.findUnit(s, m.carrier); if (cu) { hand = { id: cu.id, side: 'ally', magic: cu.magic }; cells = [[cu.x, cu.y]]; } }
          if (type === 'escort') { hand = last; var w = I.objectsOf(s, 'wagon')[0]; if (w) cells = [[w.x, w.y]]; }
        }
        if (k === 'noWalk') {
          var still = I.alliesOf(s).filter(function (a) { return !a.npc && !a.labWalked; }).sort(function (a, b) { return (b.labShotSeq || 0) - (a.labShotSeq || 0); })[0];
          if (still) { hand = { id: still.id, side: 'ally', magic: still.magic }; cells = [[still.x, still.y]]; }
        }
        if (hand) achieve(s, t, hand, [], ev, cells);
      });
    }

    // ---- ミッションの判定（judgeShot から。L にない kind） ----
    function mJudge(s, u, ctx, ev, t, E) {
      var k = t.check.kind, pre = E.pre, ally = u.side === 'ally';
      var preU = function (id) { return pre.units.filter(function (q) { return q.id === id; })[0]; };
      var here = function (list) { return list.map(function (q) { return [q.x, q.y]; }); };
      var res = function (cells, mat, taker) { return { r: { cells: cells || [], mat: mat || [] }, taker: taker }; };
      var fins = ctx.finishers;
      if (k === 'finHitsOne') {
        var f1 = fins.filter(function (f) {
          var area = (f.cells || []).concat(f.labRing || []);
          return pre.units.filter(function (p) { return p.side === 'enemy' && E.byFin(p.id) && cellsAt(p, p.x, p.y).some(function (c) { return has(area, c[0], c[1]); }); }).length >= (t.check.n || 2);
        })[0];
        return f1 ? res(f1.cells, f1.cells) : null;
      }
      if (k === 'finTurn') {
        if (!ally || !fins.length) return null;
        if (!s.labFinTurn || s.labFinTurn.turn !== s.turn) s.labFinTurn = { turn: s.turn, n: 0 };
        s.labFinTurn.n += fins.length;
        return s.labFinTurn.n >= (t.check.n || 2) ? res(E.finCells, E.finCells) : null;
      }
      if (k === 'fin3') { var f3 = fins.filter(function (f) { return LPW.STAGE3.indexOf(f.name) >= 0; })[0]; return f3 ? res(f3.cells, f3.cells) : null; }
      if (k === 'shot') return ally ? res((ctx.cells || []).slice(0, 1), []) : null;   // N 42: 魔法を1発撃つ
      if (k === 'finName') { var fnm = fins.filter(function (f) { return (t.check.names || []).indexOf(f.name) >= 0; })[0]; return fnm ? res(fnm.cells, fnm.cells) : null; }   // N 44: 決められたシナジー
      if (k === 'lastFin') return E.deadEnemies.some(function (d) { return E.byFin(d.id); }) && !I.enemiesOf(s).length ? res(E.finCells, E.finCells) : null;
      if (k === 'farFin') {
        if (!fins.length) return null;
        var src = ctx.cells && ctx.cells.length ? ctx.cells : [[u.x, u.y]], far = -1, fc = null;
        E.finCells.forEach(function (c) {
          var dmin = Math.min.apply(null, src.map(function (q) { return Math.abs(q[0] - c[0]) + Math.abs(q[1] - c[1]); }));
          if (dmin > far) { far = dmin; fc = c; }
        });
        return far >= (t.check.dist || 4) ? res([fc], E.finCells) : null;
      }
      if (k === 'bigFin') {
        var fb = fins.filter(function (f) { return (f.cells || []).filter(function (c) { return inBounds(s, c[0], c[1]) && pre.tiles[idx(s, c[0], c[1])] !== 'empty'; }).length >= (t.check.n || 5); })[0];
        return fb ? res(fb.cells, fb.cells) : null;
      }
      if (k === 'enemyNatFin') {
        if (!ally || !fins.length) return null;
        var en = E.finCells.filter(function (c) { var m0 = inBounds(s, c[0], c[1]) && pre.maker[idx(s, c[0], c[1])]; return m0 && m0.side === 'enemy'; });
        return en.length ? res(en, E.finCells) : null;
      }
      if (k === 'enemyFinKill') {
        if (u.side !== 'enemy' || !fins.length) return null;
        var victims = E.deadEnemies.filter(function (d) { return d.id !== u.id && E.byFin(d.id); });
        if (!victims.length) return null;
        var preps = preparersAt(s, pre.maker, E.finCells);
        return res(here(victims), E.finCells, preps.length ? preps[preps.length - 1] : (u.labMovedBy || null));
      }
      if (k === 'allThree') {
        if (!fins.length) return null;
        var ids = {};
        preparersAt(s, pre.maker, E.finCells).forEach(function (h) { ids[h.id] = true; });
        if (ally) ids[u.id] = true;
        return Object.keys(ids).length >= 3 ? res(E.finCells, E.finCells) : null;
      }
      if (k === 'killBefore') {
        if (!ally) return null;
        var kb = E.deadEnemies.filter(function (d) { return d.intent; });
        return kb.length ? res(here(kb), E.finCells) : null;
      }
      if (k === 'rescue') {
        if (!ally || !ctx.labDanger || !ctx.labDanger.length || mBusy) return null;
        var danger = mDangerIds(s);
        var out = ctx.labDanger.filter(function (id) { var p = preU(id), q = I.findUnit(s, id); return p && q && (p.x !== q.x || p.y !== q.y) && danger.indexOf(id) < 0; });
        return out.length ? res(out.map(function (id) { var q = I.findUnit(s, id); return [q.x, q.y]; }), []) : null;
      }
      if (k === 'neverShot') {
        var ns = E.deadEnemies.filter(function (d) { return !d.shots; });
        return ns.length ? res(here(ns), E.finCells) : null;
      }
      if (k === 'bump') {
        if (!ally) return null;
        var bumped = [], F = DIRS[ctx.labFacing];
        ev.slice(ctx.labEv0 || 0).forEach(function (e) {
          if (e.type !== 'push' || e.ok !== false || !F) return;
          var q = I.findUnit(s, e.id);
          if (!q || q.side !== 'enemy') return;
          var o = unitAt(s, q.x + F.dx, q.y + F.dy);
          if (o && o.side === 'enemy' && o.id !== q.id && !has(bumped, q.x, q.y)) bumped.push([q.x, q.y], [o.x, o.y]);
        });
        return bumped.length ? res(bumped, []) : null;
      }
      if (k === 'gather') {
        if (!ally || !E.moved.length) return null;
        var es = I.enemiesOf(s), pair = null;
        var adj = function (a, b) { return cellsAt(a, a.x, a.y).some(function (c) { return cellsAt(b, b.x, b.y).some(function (d) { return Math.abs(c[0] - d[0]) + Math.abs(c[1] - d[1]) === 1; }); }); };
        for (var i = 0; i < es.length && !pair; i++) for (var j = i + 1; j < es.length && !pair; j++) {
          var a = es[i], b = es[j], pa = preU(a.id), pb = preU(b.id);
          if (!pa || !pb || !adj(a, b) || adj(pa, pb)) continue;
          if (E.moved.some(function (m) { return m.id === a.id || m.id === b.id; })) pair = [[a.x, a.y], [b.x, b.y]];
        }
        return pair ? res(pair, []) : null;
      }
      if (k === 'lower') {
        if (!ally) return null;
        var low = pre.units.filter(function (p) { if (p.side !== 'enemy' || !HIGH[p.tile]) return false; var q = I.findUnit(s, p.id); return q && !HIGH[getTile(s, q.x, q.y)]; });
        return low.length ? res(low.map(function (p) { var q = I.findUnit(s, p.id); return [q.x, q.y]; }), []) : null;
      }
      if (k === 'edge') {
        if (!ally) return null;
        var R = I.rowsOf(s), onEdge = function (x, y) { return x === 0 || y === 0 || x === s.size - 1 || y === R - 1; };
        var ed = E.moved.filter(function (m) { return onEdge(m.to[0], m.to[1]) && !onEdge(m.from[0], m.from[1]); });
        return ed.length ? res(ed.map(function (m) { return m.to; }), []) : null;
      }
      if (k === 'turnIntent') {
        if (!ally) return null;
        var ti = pre.units.filter(function (p) { if (p.side !== 'enemy' || !p.intent) return false; var q = I.findUnit(s, p.id); return q && q.intent && q.facing !== p.facing; });
        return ti.length ? res(ti.map(function (p) { var q = I.findUnit(s, p.id); return [q.x, q.y]; }), []) : null;
      }
      if (k === 'overwrite') {
        if (!ally) return null;
        var ow = E.changed.filter(function (c) { var m0 = pre.maker[idx(s, c.x, c.y)]; return m0 && m0.side === 'enemy' && c.to !== 'empty'; });
        return ow.length ? res(E.at(ow), []) : null;
      }
      if (k === 'kinds') {
        if (!ally || !E.changed.length) return null;
        var kinds = {};
        Object.keys(s.labMaker || {}).forEach(function (i2) { var m0 = s.labMaker[i2], tt = s.tiles[i2]; if (m0 && m0.side === 'ally' && tt && tt !== 'empty') kinds[tt] = true; });
        return Object.keys(kinds).length >= (t.check.n || 3) ? res(E.at(E.changed.filter(function (c) { return c.to !== 'empty'; })), []) : null;
      }
      if (k === 'waterDown') {
        if (!ally || u.magic !== 'water') return null;
        var foot = getTile(s, u.x, u.y);
        var sourced = ctx.phrases.some(function (p) { return /に当たって川になった/.test(p); });
        return HIGH[foot] || sourced ? res(E.at(E.changed), []) : null;
      }
      if (k === 'half') {
        if (!ally || !E.changed.length) return null;
        var filled = s.tiles.filter(function (tt) { return tt !== 'empty'; }).length;
        return filled * 2 >= s.tiles.length ? res(E.at(E.changed), []) : null;
      }
      if (k === 'nextTo') {
        if (!ally) return null;
        var foes = pre.units.filter(function (p) { return p.side === 'enemy'; });
        var nt = E.changed.filter(function (c) {
          return c.from === 'empty' && c.to !== 'empty' && foes.some(function (e) { return cellsAt(e, e.x, e.y).some(function (q) { return Math.abs(q[0] - c.x) + Math.abs(q[1] - c.y) === 1; }); });
        });
        return nt.length ? res(E.at(nt), []) : null;
      }
      return null;
    }
    // エディット: M5 の候補を人に付ける（cand: { id: true }。null で外す）
    function editSetCand(s0, unitId, cand) {
      var u0 = I.findUnit(s0, unitId);
      if (!u0 || u0.side === 'object') return { ok: false, state: s0, events: [], steps: [], error: '人を選んでいない' };
      var s = I.clone(s0), u = I.findUnit(s, unitId), c = {};
      Object.keys(cand || {}).forEach(function (k) { if (cand[k] && LPW.CANDS.some(function (x) { return x.id === k; })) c[k] = true; });
      if (Object.keys(c).length) u.labCand = c; else delete u.labCand;
      return { ok: true, state: s, events: [], steps: [] };
    }
    var MAPI = {
      on: mon, PW: LPW, DIRS: LPW.DIRS, DIR_ORDER: LPW.DIR_ORDER, LIST_ORDER: LPW.LIST_ORDER, MISSIONS: LPW.MISSIONS, PROPS: LPW.PROPS, CANDS: LPW.CANDS, TAKERS: LPW.TAKERS,
      def: mDef, total: mTotal, norm: mNorm, formOf: mFormOf, props: mProps, propText: mPropText, stepText: mStepText,
      changeAt: mChangeAt, awakeAt: mAwakeAt, shapeMax: mShapeMax, dest: mDest, makeMode: mMakeMode, dirsMode: mDirsMode,
      setSort: setSort, sortOf: function () { return lclone(mSort); }, missionDir: missionDir, mission: mMission
    };

    // ---------------------------------------------------------------
    // N 強化と変化（10/16 オーナーの「強化と変化のまとめ」）。データは lab_change.js、画面は lab_target_ui.js（N のときの描き分け）
    //   M の土台（ミッションと判定・取った記録・育ちの画面・持ち越し・L6 クエスト）の上で、道を N の形に替える。N0 は L0・M0 が要る
    //   道 u.labPath = { aw, fu, steps, form, awake }
    //     aw 覚醒方面の印・fu 融合方面の印・steps 間の強化の数・form 変化した方面（'awake'／'fuse'）・awake 覚醒した
    //     印の種類は、ミッションのやりたいこと（仕分け）と、取った魔法の属性のやりたいことで決まる（nKind）
    //   変化した魔法は、u.magic はそのまま（属性）。撃つと変化先の魔法になる（castMore の先頭）。名前と駒は formOf
    //   覚醒先の自然（大樹・岩山・業火・湖・氷・竜巻）は、元の自然のマスに印を付けたもの s.labAwk = { マスの番号: 種類 }。
    //     元の自然として振る舞い（法則のまま）、覚醒先の新しい組み合わせだけ N の差し込み口で起きる。マスの自然が変わると印は消える（onSetTile）
    //   N0 がオンのときだけ、盤面に s.labAwk、人に u.labDelay・u.labShrink（M と同じ項目）を足す
    // ---------------------------------------------------------------
    var LCH = (IS_NODE_L ? require('./lab_change.js') : root.LAB_CHANGE) || { WANTS: {}, WANT_ORDER: [], SORT_ORDER: [], ATTR: {}, ATTR_ORDER: [], STEPS: {}, MORE: {}, MORE_MAX: 3,
      STAND_ON: {}, FORMS: {}, MISSIONS_ADD: [], SORT: {}, QUEST_POOL: {}, QUEST_NAME: {}, QUEST_ORDER: [], QUEST_LEAN: {} };
    function non() { return mon() && on('N0'); }
    function nChangeAt() { return clampN(lopt('N1', 'change', 2), 1, 6, 2); }
    function nAwakeAt() { return clampN(lopt('N1', 'awake', 3), 1, 9, 3); }
    // N2 合わないミッションの数え方: all 全部融合方面 ／partner 融合の相手のやりたいことと合うものだけ ／step 方面に数えない（間の強化だけ）
    function nOdd() { var v = lopt('N2', 'odd', 'all'); return v === 'partner' || v === 'step' ? v : 'all'; }
    function nEarth() { return lopt('N3', 'earth', 'defeat') === 'stop' ? 'stop' : 'defeat'; }   // N3 土のやりたいこと
    function nWeak() { return lopt('N4', 'fuse', 'weak') !== 'same'; }                            // N4 融合を控えめに
    function nKeep() { return lopt('N5', 'steps', 'keep') !== 'reset'; }                           // N5 間の強化を変化した魔法に引き継ぐ
    // N6 1本の道（.claude/IMPROVE_road.md）。印でマスを埋め、len マスそろったら多い方の方面へ変化（閉じない）
    //   道 u.labPath.road = [{ w: ミッションのやりたいこと, k: 'awake'／'fuse' }]（変化までのマス。変化したあとの印は入れない）
    function nRoadOn() { return non() && on('N6'); }
    function nRoadLen() { return clampN(lopt('N6', 'len', 3), 1, 9, 3); }
    function nRoadAw(p) { return (p.road || []).filter(function (r) { return r.k === 'awake'; }).length; }
    // そろった道の方面: 多い方。同点は最後に埋めた形
    function nRoadForm(road) { var a = nRoadAw({ road: road }), f = road.length - a; return a > f ? 'awake' : f > a ? 'fuse' : road[road.length - 1].k; }
    var N_CANDS = { linger: true, standOn: true, leap: true };   // M の仕組み（mCand）で起こす間の強化

    // ---- やりたいことと道 ----
    function nWantOf(m) { if (!LCH.ATTR[m]) return null; return m === 'earth' ? nEarth() : LCH.ATTR[m]; }
    function nWantName(w) { return LCH.WANTS[w] ? LCH.WANTS[w].name : w === 'dark' ? '闇' : w; }
    function nDef(m) {
      var F = LCH.FORMS[m], w = nWantOf(m);
      if (!F || !w) return null;
      return { m: m, want: w, awake: F.awake, fuse: F.fuse, partner: F.fuse.with, steps: LCH.STEPS[w] || [], n: true, dirs: [w] };
    }
    function nNew() { return { aw: 0, fu: 0, steps: 0, form: null, awake: false }; }
    // 道の形をそろえる（steps を省いたら、印の数だけ。変化は先に届いた方面。両方届いていたら多いほう、同じなら覚醒方面）
    function nNorm(m, p0) {
      var d = nDef(m);
      if (!d) return null;
      var src = p0 || {}, p = nNew(), C = nChangeAt(), A = nAwakeAt();
      p.aw = clampN(src.aw, 0, 20, 0); p.fu = clampN(src.fu, 0, 20, 0);
      p.steps = clampN(src.steps === undefined ? p.aw + p.fu : src.steps, 0, d.steps.length + LCH.MORE_MAX, 0);
      if (nRoadOn()) return nNormRoad(d, src, p);
      var f = src.form === 'awake' && p.aw >= C ? 'awake' : src.form === 'fuse' && p.fu >= C ? 'fuse' : null;
      if (!f && (p.aw >= C || p.fu >= C)) f = p.aw >= p.fu ? 'awake' : 'fuse';
      p.form = f;
      p.awake = f === 'awake' && p.aw >= C + A;
      return p;
    }
    // N6: 道（road）を数に合わせてそろえる。数に合わない道（エディット・シナリオの数だけの道）は、数から作り直す
    //   作り直すときは、変化した方面（なければ数の多い方）の形を先に置く
    function nNormRoad(d, src, p) {
      var L = nRoadLen(), A = nAwakeAt(), n = Math.min(L, p.aw + p.fu);
      var road = (Array.isArray(src.road) ? src.road : []).filter(function (r) { return r && (r.k === 'awake' || r.k === 'fuse'); })
        .slice(0, L).map(function (r) { return { w: r.w || (r.k === 'awake' ? d.want : 'odd'), k: r.k }; });
      var ra = nRoadAw({ road: road });
      if (road.length !== n || ra > p.aw || road.length - ra > p.fu) {
        var lead = src.form === 'fuse' || src.form === 'awake' ? src.form : p.aw >= p.fu ? 'awake' : 'fuse';
        var cnt = { awake: p.aw, fuse: p.fu }, other = lead === 'awake' ? 'fuse' : 'awake';
        road = [];
        [lead, other].forEach(function (k) { for (var i = 0; i < cnt[k] && road.length < n; i++) road.push({ w: k === 'awake' ? d.want : 'odd', k: k }); });
      }
      p.road = road;
      p.form = road.length >= L ? nRoadForm(road) : null;
      p.awake = p.form === 'awake' && p.aw - nRoadAw(p) >= A;
      return p;
    }
    // 印の種類: 'awake' 覚醒方面 ／'fuse' 融合方面 ／'step' 間の強化だけ（N2 step）／null 印にならない（N2 partner）
    function nKind(m, w) {
      var mine = nWantOf(m);
      if (!mine) return null;
      if (w === 'free' || w === mine) return 'awake';
      var odd = nOdd();
      if (odd === 'step') return 'step';
      if (odd === 'partner') { var d = nDef(m); return d && nWantOf(d.partner) === w ? 'fuse' : null; }
      return 'fuse';
    }
    function nStepAt(d, i) { return i < d.steps.length ? d.steps[i] : (i < d.steps.length + LCH.MORE_MAX ? LCH.MORE : null); }
    function nStepsOf(d, p) { var out = []; for (var i = 0; i < (p.steps || 0); i++) { var st = nStepAt(d, i); if (st) out.push(st); } return out; }
    // 強化を1回入れる（p を書き換える）。w はミッションのやりたいこと
    //   { ok, kind, step?, change?, awake?, closed?, reset? } ／{ none }（道がない）／{ none, partner }（印にならない）
    function nAdvance(p, m, w) {
      var d = nDef(m);
      if (!d || !p) return { none: true };
      var kind = nKind(m, w);
      if (!kind) return { none: true, partner: true };
      var C = nChangeAt(), A = nAwakeAt(), out = { ok: true, kind: kind };
      if (kind === 'awake') p.aw = (p.aw || 0) + 1;
      if (kind === 'fuse') p.fu = (p.fu || 0) + 1;
      if (nRoadOn()) nRoadStep(p, d, kind, w, out);
      else {
        if (p.form && kind !== 'step' && kind !== p.form) out.closed = true;   // 閉じた方面の印（間の強化だけ付く）
        if (!p.form && kind === 'awake' && p.aw >= C) { p.form = 'awake'; out.change = d.awake; }
        if (!p.form && kind === 'fuse' && p.fu >= C) { p.form = 'fuse'; out.change = d.fuse; }
      }
      if (out.change && !nKeep()) { p.steps = 0; out.reset = true; }   // N5 reset: 変化した魔法は、間の強化を0から
      else { var st = nStepAt(d, p.steps || 0); if (st) { p.steps = (p.steps || 0) + 1; out.step = st; } }
      if (p.form === 'awake' && !p.awake && (nRoadOn() ? p.aw - nRoadAw(p) >= A : p.aw >= C + A)) { p.awake = true; out.awake = d.awake.lv2; }
      return out;
    }
    // N6: 変化する前なら道のマスを1つ埋め、そろったら多い方へ変化。変化したあとは、覚醒側の自分の形だけが覚醒へ進む
    //   out.slot 埋めたマス（1から）・out.tally { aw, fu }（そろったときの数）・out.past 道を進めない印（間の強化だけ）
    function nRoadStep(p, d, kind, w, out) {
      if (kind !== 'awake' && kind !== 'fuse') return;
      if (p.form) { if (p.form === 'fuse' || kind === 'fuse') out.past = true; return; }
      p.road = p.road || [];
      p.road.push({ w: w, k: kind });
      out.slot = p.road.length;
      if (p.road.length < nRoadLen()) return;
      p.form = nRoadForm(p.road);
      out.change = p.form === 'awake' ? d.awake : d.fuse;
      out.tally = { aw: nRoadAw(p), fu: p.road.length - nRoadAw(p) };
    }
    // N6: 次の一手で道がどうなるか（魔法カード・予測の一言）。own 自分の形・other ほかの形（N2 で数えない形は null）
    //   { left 変化までのマス, decided 決まった方面, own/other { change, awake, left }, awakeLeft 覚醒まで }
    function nNext(m, p0) {
      var d = nDef(m);
      if (!d || !nRoadOn()) return null;
      var p = nNorm(m, p0), L = nRoadLen(), A = nAwakeAt(), out = { form: p.form, awake: p.awake, step: nStepAt(d, p.steps || 0) };
      var sim = function (kind) {
        if (kind === 'fuse' && nOdd() === 'step') return null;
        var q = lclone(p), r = { ok: true, kind: kind };
        if (kind === 'awake') q.aw++; else q.fu++;
        nRoadStep(q, d, kind, kind === 'awake' ? d.want : 'odd', r);
        if (q.form === 'awake' && !q.awake && q.aw - nRoadAw(q) >= A) r.awake = d.awake.lv2;
        return r;
      };
      out.own = sim('awake'); out.other = sim('fuse');
      if (!p.form) {
        var a = nRoadAw(p);
        out.left = L - p.road.length;
        out.decided = a * 2 > L ? 'awake' : (p.road.length - a) * 2 > L ? 'fuse' : null;   // もう半分を超えた方面
      } else if (p.form === 'awake' && !p.awake) out.awakeLeft = A - (p.aw - nRoadAw(p));
      return out;
    }
    function nGain(p, m, w) {
      var r = nAdvance(p, m, w), g = { dir: w, res: r };
      if (p) g.after = lclone(p);
      return g;
    }
    // ---- 言葉 ----
    // 魔法カードの形の図: 術者から見た形のマス（上向き。dx 右・dy 前）。盤の下の真ん中に立たせて数える（盤の外は欠ける）
    function nCardCells(s, u0) {
      var sc = lclone(s), u = I.findUnit(sc, u0.id);
      if (!u) return [];
      u.x = Math.floor(sc.size / 2); u.y = I.rowsOf(sc) - 1; u.facing = 'up';
      return I.castCells(sc, u, 'up').map(function (c) { return [c[0] - u.x, u.y - c[1]]; });
    }
    // N6: 形（◆●▲■★。数から作った道の、ほかの形は ○）
    function nShape(w) { return LCH.WANTS[w] && LCH.WANTS[w].shape ? LCH.WANTS[w].shape : '○'; }
    // N6: 「ほかの形」の言い方（N2 partner なら融合の相手の形だけ）
    function nOtherName(d) { return nOdd() === 'partner' ? nShape(nWantOf(d.partner)) + '（' + I.magicName(d.partner) + 'の形）' : 'ほかの形'; }
    // N6: 次の一手で何に変化するか（「次の◆で炎に変化／ほかの形で火の渦に変化」）
    function nNextText(m, p) {
      var d = nDef(m), nx = nNext(m, p), own = nShape(d.want);
      if (!nx) return '';
      if (nx.form === 'fuse') return '融合「' + d.fuse.name + '」に変化ずみ（道はここまで。印は間の強化だけ）';
      if (nx.awake) return '覚醒「' + d.awake.lv2.name + '」ずみ';
      if (nx.form === 'awake') return nx.awakeLeft === 1 ? '次の' + own + 'で覚醒「' + d.awake.lv2.name + '」' : 'あと' + own + nx.awakeLeft + 'つで覚醒「' + d.awake.lv2.name + '」';
      if (!nx.other) return (nx.left === 1 ? '次の' + own + 'で' : 'あと' + own + nx.left + 'つで') + '「' + d.awake.name + '」に変化（N2: ' + own + 'だけが道を進める）';
      if (nx.decided) { var dn = nx.decided === 'awake' ? d.awake.name : d.fuse.name; return nx.left === 1 ? '次の1マスで「' + dn + '」に変化（もう決まり）' : 'あと' + nx.left + 'マスで「' + dn + '」に変化（もう決まり）'; }
      if (nx.left > 1) return 'あと' + nx.left + 'マスで変化（' + own + 'が多いと「' + d.awake.name + '」、' + nOtherName(d) + 'が多いと「' + d.fuse.name + '」）';
      var to = function (r) { return r && r.change ? (r.change === d.awake ? d.awake.name : d.fuse.name) : null; };
      return '次の' + own + 'で「' + to(nx.own) + '」に変化' + (nx.other ? '／' + nOtherName(d) + 'で「' + to(nx.other) + '」に変化' : '');
    }
    function nHint(m, p, r) {
      var d = nDef(m), C = nChangeAt(), A = nAwakeAt();
      if (!d || !p || r.change || r.awake) return '';
      if (nRoadOn()) return nNextText(m, p);
      if (!p.form) {
        var out = ['あと' + (C - p.aw) + 'つで変化「' + d.awake.name + '」'];
        if (nOdd() !== 'step') out.push('あと' + (C - p.fu) + 'つで融合「' + d.fuse.name + '」');
        return out.join('・');
      }
      if (p.form === 'awake' && !p.awake) return 'あと' + (C + A - p.aw) + 'つで覚醒「' + d.awake.lv2.name + '」';
      return '';
    }
    function nGainText(m, w, g, before) {
      var nm = I.magicName(m), d = nDef(m), r = g.res;
      if (!d) return nm + 'には道がない（今回の育ちの対象ではない）';
      var mine = nWantName(d.want), wn = w === 'free' ? 'どれでも' : nWantName(w);
      if (r.none && r.partner) return nm + 'のやりたいこと「' + mine + '」と合わない（' + wn + '）。融合の相手（' + I.magicName(d.partner) + '「' + nWantName(nWantOf(d.partner)) + '」）とも合わないので、印にならない（N2）';
      if (r.none) return nm + 'には道がない';
      if (nRoadOn()) return nGainTextRoad(m, w, g, before, d);
      var head = r.kind === 'awake' ? (w === 'free' ? 'どの属性にも合うミッション' : nm + 'のやりたいこと「' + mine + '」と合う') + ' → 覚醒方面の印'
        : r.kind === 'fuse' ? nm + 'のやりたいこと「' + mine + '」と合わない（' + wn + '）→ 融合方面の印'
        : nm + 'のやりたいこと「' + mine + '」と合わない（' + wn + '）→ 方面には数えない（N2）';
      var parts = [];
      if (r.closed) parts.push((r.kind === 'awake' ? '覚醒方面' : '融合方面') + 'は閉じている');
      else if (before && before.form === 'fuse' && r.kind === 'fuse') parts.push('融合「' + d.fuse.name + '」に変化ずみ');
      else if (before && before.awake && r.kind === 'awake') parts.push('覚醒「' + d.awake.lv2.name + '」ずみ');
      if (r.change) parts.push('変化「' + r.change.name + '」！ ' + (r.change === d.awake ? '融合方面（' + d.fuse.name + '）' : '覚醒方面（' + d.awake.name + '）') + 'は閉じる');
      if (r.awake) parts.push('覚醒「' + r.awake.name + '」！');
      if (r.reset) parts.push('間の強化は0から（N5）');
      else parts.push(r.step ? '間の強化「' + r.step.name + '」' : '間の強化はもう上限');
      var hint = nHint(m, g.after, r);
      if (hint) parts.push(hint);
      return head + '（' + parts.join('。') + '）';
    }
    // N6: 1本の道の言い方（「◆ 火の形（倒す）→ 道の2マス目。次の◆で「炎」に変化／ほかの形で「火の渦」に変化」）
    function nGainTextRoad(m, w, g, before, d) {
      var nm = I.magicName(m), r = g.res, sh = nShape(w), wn = w === 'free' ? 'どれでも' : nWantName(w), L = nRoadLen();
      var head = r.kind === 'awake' ? sh + ' ' + nm + 'の形（' + (w === 'free' ? 'どれでも＝自分の形' : wn) + '）'
        : r.kind === 'fuse' ? sh + ' ' + nm + 'のほかの形（' + wn + '）'
        : sh + ' ' + nm + 'のやりたいことと合わない（' + wn + '）→ 道には数えない（N2）';
      var parts = [];
      if (r.slot) parts.push('道の' + r.slot + '/' + L + 'マス目');
      if (r.change) parts.push(L + 'マスそろった（' + nShape(d.want) + r.tally.aw + '・ほか' + r.tally.fu + '）→ ' + (r.change === d.awake ? '変化' : '融合') + '「' + r.change.name + '」！');
      else if (r.past && before && before.form === 'fuse') parts.push('融合「' + d.fuse.name + '」に変化ずみ（道はここまで）');
      else if (r.past) parts.push('「' + d.awake.name + '」に変化ずみ。ほかの形は覚醒へ進まない');
      else if (r.kind === 'awake' && before && before.form === 'awake' && !before.awake && !r.awake) parts.push('覚醒「' + d.awake.lv2.name + '」へ1つ');
      if (r.awake) parts.push('覚醒「' + r.awake.name + '」！');
      if (r.reset) parts.push('間の強化は0から（N5）');
      else parts.push(r.step ? '間の強化「' + r.step.name + '」' : '間の強化はもう上限');
      var a = g.after;
      if (a && (!a.form || (a.form === 'awake' && !a.awake))) { var hint = nHint(m, a, r); if (hint) parts.push(hint); }   // 変化ずみ・覚醒ずみは、上の一言で足りる
      return head + (r.kind === 'step' ? '。' : ' → ') + parts.reduce(function (t, x) { return t ? t + (/！$/.test(t) ? ' ' : '。') + x : x; }, '');
    }
    function nOutlook(m, p, w) {
      if (!nDef(m)) return '達成するが、' + I.magicName(m) + 'は今回の育ちの対象ではない（道がない）';
      var before = nNorm(m, p || nNew());
      return nGainText(m, w, nGain(lclone(before), m, w), before);
    }
    function nDots(n, max) { var t = ''; for (var i = 0; i < max; i++) t += i < n ? '●' : '○'; return t; }
    // 進み具合の印（覚●○ 融○○ 強威形 ／ 覚●○○ 融× ／ 覚醒 融× ／ 融合 覚×）
    function nMarks(m, p0) {
      var d = nDef(m);
      if (!d) return '';
      var p = nNorm(m, p0), C = nChangeAt(), A = nAwakeAt();
      var st = nStepsOf(d, p).map(function (x) { return x.mark; }).join('');
      if (nRoadOn()) {   // N6: 道◆●・ ／炎 覚醒まで◆・・ ／業火（覚醒） ／火の渦（融合）
        var slots = '', L = nRoadLen(), up = Math.max(0, p.aw - nRoadAw(p));
        for (var i = 0; i < L; i++) slots += p.road[i] ? nShape(p.road[i].w) : '・';
        var aw = '';
        for (var j = 0; j < A; j++) aw += j < up ? nShape(d.want) : '・';
        var hr = !p.form ? '道' + slots : p.form === 'fuse' ? d.fuse.name + '（融合）' : p.awake ? d.awake.lv2.name + '（覚醒）' : d.awake.name + ' 覚醒まで' + aw;
        return hr + (st ? ' 強' + st : '');
      }
      var h = !p.form ? '覚' + nDots(p.aw, C) + ' 融' + nDots(p.fu, C)
        : p.form === 'awake' ? (p.awake ? '覚醒' : '覚' + nDots(Math.max(0, p.aw - C), A)) + ' 融×'
        : '融合 覚×';
      return h + (st ? ' 強' + st : '');
    }
    // ---- 人の道・間の強化・変化先 ----
    function nPathOf(u) { return non() && u && u.labPath && u.side !== 'object' && nDef(u.magic) ? nNorm(u.magic, u.labPath) : null; }
    function nCount(u, id) { var p = nPathOf(u); return p ? nStepsOf(nDef(u.magic), p).filter(function (x) { return x.id === id; }).length : 0; }
    function nHas(u, id) { return nCount(u, id) > 0; }
    // 変化先 { id, name, mark, verb, stage, kind, def（その段の定義）, base（覚醒方面の1段目か融合）}
    function nForm(u) {
      var p = nPathOf(u);
      if (!p || !p.form) return null;
      var d = nDef(u.magic), base = p.form === 'awake' ? d.awake : d.fuse, f = p.form === 'awake' && p.awake ? d.awake.lv2 : base;
      return { id: f.id, name: f.name, mark: f.mark, verb: f.verb, stage: p.awake ? 2 : 1, kind: p.form, def: f, base: base };
    }
    function nFormOf(u) { var f = nForm(u); return f ? { name: f.name, mark: f.mark, stage: f.stage, dir: f.kind, id: f.id } : null; }
    function nLabel(u) { return '【強化】' + (formName(u) || I.magicName(u.magic)); }
    // ミッションの仕分け（画面から。id → defeat／spread／move／stop／free／off）
    var nSort = {};
    function nSetSort(map) { nSort = {}; Object.keys(map || {}).forEach(function (k) { if (LCH.WANTS[map[k]] || map[k] === 'off') nSort[k] = map[k]; }); }
    function nMissionWant(t) { return (t && nSort[t.id]) || (t && t.want) || (t && LCH.SORT[t.id]) || 'free'; }
    function nMissionList() { return LPW.MISSIONS.concat(LCH.MISSIONS_ADD); }
    function nMission(id) { return nMissionList().filter(function (d) { return d.id === id; })[0] || null; }

    // ---- 覚醒先の自然の印 ----
    var N_AWK = { tree: { label: '樹', name: '大樹' }, rockmt: { label: '岳', name: '岩山' }, inferno: { label: '業', name: '業火' },
      lake: { label: '湖', name: '湖' }, icelake: { label: '氷', name: '氷（凍った湖）' }, twister: { label: '竜', name: '竜巻の風' } };
    function nMark(s, x, y, k) { s.labAwk = s.labAwk || {}; s.labAwk[idx(s, x, y)] = k; }
    function nUnmark(s, x, y) { if (!s.labAwk) return; delete s.labAwk[idx(s, x, y)]; if (!Object.keys(s.labAwk).length) delete s.labAwk; }
    function nAwkAt(s, x, y) { return s.labAwk && inBounds(s, x, y) ? s.labAwk[idx(s, x, y)] : undefined; }
    // 画面用: そのマスの覚醒先の自然 { kind, label, name } か null
    function nAwkTile(s, x, y) { var k = non() ? nAwkAt(s, x, y) : null; return k && N_AWK[k] ? { kind: k, label: N_AWK[k].label, name: N_AWK[k].name } : null; }
    function nBody(s, x, y, tile, kind) { return connected(s, x, y, tile).filter(function (c) { return nAwkAt(s, c[0], c[1]) === kind; }); }
    // 風下の斜面（body のうち、風下の隣が body でないマス）
    function nLee(body, dir) { var F = DIRS[dir]; return body.filter(function (c) { return !has(body, c[0] + F.dx, c[1] + F.dy); }); }

    // ---- 変化した魔法の形 ----
    function nShapeOf(f, u) {
      var sh = f.def.shape !== undefined ? f.def.shape : f.base.shape;
      if (sh && !Array.isArray(sh)) sh = nWeak() ? sh.weak : sh.same;
      return sh || B.shapes[u.magic] || null;
    }
    function nExtraOf(f, u, base) {
      var ex = f.def.extra !== undefined ? f.def.extra : f.base.extra;
      ex = (ex || LP.EXTRA_CELLS[u.magic] || []).concat(u.magic === 'grass' ? M_MORE.grass : []);
      return ex.filter(function (c) { return !base.some(function (b) { return b[0] === c[0] && b[1] === c[1]; }); });
    }
    function nStand(s, u) { var st = LCH.STAND_ON[u.magic]; return nHas(u, 'standOn') && !!st && st.indexOf(getTile(s, u.x, u.y)) >= 0; }
    cellsMore.unshift(function (s, u, o, facing) {
      if (!non()) return null;
      var f = nForm(u), base = f ? nShapeOf(f, u) : null;
      if (!base) return null;   // 変化していなければ M の形（間の強化の「形が1マス」の数）
      var n = shapeSteps(u) + (u.labBoost || 0) + (nStand(s, u) ? 2 : 0);
      var cells = shapeAt(s, base.concat(nExtraOf(f, u, base).slice(0, n)), o, facing);
      return u.labShrink ? cells.slice(0, 1) : cells;
    });

    // ---- 変化した魔法を撃つ（castMore の先頭） ----
    castMore.unshift(function (s, u, facing, ctx, ev) {
      if (!non()) return false;
      ctx.labNPre = {};   // 撃つ前の人（効き目・押す の比べる元）
      s.units.forEach(function (q) { ctx.labNPre[q.id] = { x: q.x, y: q.y, stuck: q.stuck, burn: q.burn || 0, facing: q.facing }; });
      var f = nForm(u);
      if (!f || s.labTrapFiring || !N_CAST[f.id]) return false;
      ctx.labN = f;
      N_CAST[f.id](s, u, facing, ctx, ev, f);
      return true;
    });
    function nPlace(s, u, facing, ctx, ev, f) {
      var cells = I.castCells(s, u, facing);
      I.placeOrIgnite(s, u, facing, ctx, ev);
      if (f.id === 'ntree' && cells[0] && getTile(s, cells[0][0], cells[0][1]) === 'forest') {
        nMark(s, cells[0][0], cells[0][1], 'tree');
        ctx.phrases.push('【覚醒】大樹が根を張った');
      }
      if (f.id === 'ninferno') {
        var n = 0;
        cells.forEach(function (c) { if (getTile(s, c[0], c[1]) === 'fire') { nMark(s, c[0], c[1], 'inferno'); n++; } });
        if (n) ctx.phrases.push('【覚醒】業火が燃え上がった（' + n + 'マス）');
      }
    }
    var N_CAST = {
      nforest: nPlace, ntree: nPlace, nsakura: nPlace, nmud: nPlace, nblaze: nPlace, ninferno: nPlace, nrockmt: nPlace,
      nrock: nRockCast, nwhirl: nWhirlCast, nlake: nLakeCast, nice: nLakeCast, nsource: nSourceCast, ngust: nGustCast, ntwister: nGustCast, nsand: nSandCast
    };
    // 置く・点ける変化先の1マス（ほかの作用より先。ここで扱わないマスは、元の魔法の作用のまま）
    placeMore.unshift(function (s, u, x, y, t, o, facing, ctx, ev) {
      if (!non()) return false;
      // 氷（凍った湖）に火が来れば、湖に戻る（覚醒先の氷。元の魔法の火でも、炎・業火でも）
      if (u.magic === 'fire' && t === 'ice' && nAwkAt(s, x, y) === 'icelake') { setTile(s, x, y, 'puddle'); nMark(s, x, y, 'lake'); ctx.phrases.push('氷が溶けて湖に戻った'); return true; }
      var f = ctx && ctx.labN;
      if (!f) return false;
      var under = function (to) { return !o || (B.ideas.natureUnderUnits && !on('C1') && I.isPassable(to)); };
      var foot = o ? '（' + unitLabel(s, o) + 'の足元）' : '';
      if (f.id === 'nforest' || f.id === 'ntree') {
        if (t === 'empty' && under('forest')) { setTile(s, x, y, 'forest'); ctx.phrases.push('【変化】森ができた' + foot); return true; }
        return false;   // 草むら（森が茂る）・山・丘（桜）は草と同じ
      }
      if (f.id === 'nsakura') {
        var sk = nWeak() ? 'hillsakura' : 'sakura';
        if (t === 'empty') { if (under(sk)) { setTile(s, x, y, sk); ctx.phrases.push('【融合】' + tileName(sk) + 'が咲いた' + foot); } return true; }   // 山の桜は人の足元には咲かない
        return false;
      }
      if (f.id === 'nblaze' || f.id === 'ninferno') {
        if ((t === 'empty' || t === 'smallfire') && !(o && on('C1'))) { setTile(s, x, y, 'fire'); ctx.phrases.push('【変化】炎が燃え上がった' + foot); return true; }
        return false;
      }
      if (f.id === 'nmud') {
        if (t === 'empty' && under('mud')) { setTile(s, x, y, 'mud'); ctx.phrases.push('【融合】泥沼ができた' + foot); if (o) I.enterMud(s, o, ev); return true; }
        return false;
      }
      if (f.id === 'nrockmt') {
        if (t === 'rock') { rollRock(s, x, y, facing, ctx, ev); return true; }   // 岩の動詞（転がす）は残る
        if ((t === 'empty' || t === 'hill' || t === 'mountain') && !o) { setTile(s, x, y, 'mountain'); nMark(s, x, y, 'rockmt'); ctx.phrases.push('【覚醒】岩山を盛った'); return true; }
        if (t === 'empty' && o) return true;   // 人のいるマスには盛れない（直撃だけ）
        return false;
      }
      return false;
    });
    // 岩: 空きに岩を置く。岩に撃つと転がる（ラボ I4 の岩。形が増えると、置く岩も増える）
    function nRockCast(s, u, facing, ctx, ev) {
      var placed = 0;
      I.castCells(s, u, facing).forEach(function (c) {
        ctx.cells.push(c);
        var t = getTile(s, c[0], c[1]), q = unitAt(s, c[0], c[1]);
        if (t === 'rock') { rollRock(s, c[0], c[1], facing, ctx, ev); return; }
        if (q) { addHit(ctx, q, u.power, 'direct'); return; }
        if (t === 'empty') { setTile(s, c[0], c[1], 'rock'); placed++; }
      });
      if (placed) ctx.phrases.push('【変化】岩を置いた（' + placed + 'つ）');
    }
    // 火の渦（融合）: 空き・炎・風・森に、いきなり火の渦。森の上は20、ほかは弱い5＋火傷（仲間と組んだ火の渦と同じ）
    function nWhirlCast(s, u, facing, ctx, ev) {
      var made = [], strong = [];
      I.castCells(s, u, facing).forEach(function (c) {
        ctx.cells.push(c);
        var t = getTile(s, c[0], c[1]), q = unitAt(s, c[0], c[1]);
        if (!I.WHIRL_OK[t]) return;
        var big = I.burnsStrong(t);
        if (q) addHit(ctx, q, big ? B.fire.strongDamage : B.fire.weakDamage, big ? 'finisher' : 'weakfire', c);
        if (big) strong.push(c);
        setTile(s, c[0], c[1], 'firewhirl');
        made.push(c);
      });
      if (!made.length) { ctx.phrases.push('火の渦になる場所がなかった'); return; }
      ctx.phrases.push('【融合】火の渦が立ち上がった（' + made.length + 'マス）');
      afterWhirl(s, made, ev);
      var amount = strong.length ? B.fire.strongDamage : B.fire.weakDamage;
      finish(ctx, ev, '火の渦', made, amount, made[0], '【融合】火の渦！ 火を巻いて' + made.length + 'マスの渦が立ち上がった' +
        (strong.length ? '（森' + strong.length + 'マスを巻きこんだ。森の上は威力' + B.fire.strongDamage + '、ほかは' + B.fire.weakDamage + '＋火傷）' : '（森がないので弱い炎: 威力' + B.fire.weakDamage + '＋火傷）') +
        (nWeak() ? '【控えめ: 1人で出す火の渦は正面1マス】' : ''));
    }
    // 湖・氷: 正面の面に、留まる水（湖）か凍った湖（氷）
    function nLakeCast(s, u, facing, ctx, ev, f) {
      var frozen = f.id === 'nice', made = 0, spin = false, stuck = 0;
      I.castCells(s, u, facing).forEach(function (c) {
        var x = c[0], y = c[1], t = getTile(s, x, y), o = unitAt(s, x, y);
        ctx.cells.push(c);
        if (!frozen) { var lf = flowCell(s, u, x, y, t, facing, ctx, ev, o); if (lf) { ctx.phrases.push(lf); return; } }   // 水の法則（大樹・業火・竜巻・岩 …）
        if (o) { addHit(ctx, o, u.power, 'direct'); I.cureBurn(s, o, ctx); }
        var under = !o || (B.ideas.natureUnderUnits && !on('C1'));
        if (t === 'fire' || t === 'smallfire') { setTile(s, x, y, 'empty'); ctx.phrases.push(tileName(t) + 'が消えた'); }
        else if (t === 'lava') { setTile(s, x, y, 'mountain'); ctx.phrases.push('溶岩が冷えて山になった'); }
        else if (!frozen && (t === 'firewhirl' || t === 'tornado') && !spin) { spin = true; ctx.phrases.push(tileName(t) + 'に水が入った'); I.doSentakuki(s, x, y, ctx, ev, facing); }
        else if (frozen && ((t === 'empty' && under) || t === 'puddle' || t === 'river' || t === 'mirage' || t === 'thicket' || t === 'ice')) { setTile(s, x, y, 'ice'); nMark(s, x, y, 'icelake'); made++; }
        else if (!frozen && ((t === 'empty' && under) || t === 'puddle' || t === 'mirage' || t === 'thicket')) { setTile(s, x, y, 'puddle'); nMark(s, x, y, 'lake'); made++; }
        var q = unitAt(s, x, y);
        if (frozen && q && getTile(s, x, y) === 'ice' && q.side !== 'object') {
          var cur = q.stuck === true ? 1 : (Number(q.stuck) || 0);
          if (!cur) { q.stuck = true; stuck++; ev.push({ type: 'mud', id: q.id, cells: [c], text: '【覚醒】' + unitLabel(s, q) + 'の足が氷に閉じこめられた（次の移動は1回休み）' }); }
        }
      });
      if (made) ctx.phrases.push(frozen ? '【覚醒】湖が凍った（氷' + made + 'マス）' : '【変化】湖ができた（' + made + 'マス。水たまりとして振る舞う）');
    }
    // 源流（融合）: 撃った所から正面へ川が走る。人・山・森の手前で止まり、炎は消して止まる（N4: 控えめなら3マスまで）
    function nSourceLen(s, u, f) { return (nWeak() ? f.def.len.weak : f.def.len.same) + shapeSteps(u) + (nStand(s, u) ? 2 : 0); }
    function nSourceCast(s, u, facing, ctx, ev, f) {
      var F = DIRS[facing], o0 = I.castOrigin(s, u, facing), lim = u.labShrink ? 1 : nSourceLen(s, u, f), made = 0, stop = null;
      var g = { origin: null, tile: 'river', cells: [], tiles: [], wave: [], blocked: [], pushed: [] };
      for (var i = 1; i < 40; i++) {
        if (made >= lim) { stop = nWeak() ? '川はここまで（1人で出す源流は' + lim + 'マス）' : null; break; }
        var x = o0.x + F.dx * i, y = o0.y + F.dy * i;
        if (!inBounds(s, x, y)) { stop = '盤の端まで流れた'; break; }
        ctx.cells.push([x, y]);
        var o = unitAt(s, x, y), t = getTile(s, x, y);
        var lf = flowCell(s, u, x, y, t, facing, ctx, ev, o);
        if (lf) { stop = lf; break; }
        if (o) { addHit(ctx, o, u.power, 'direct'); I.cureBurn(s, o, ctx); stop = unitLabel(s, o) + 'に当たって止まった'; g.blocked.push([x, y]); break; }
        if (t === 'empty' || t === 'puddle' || t === 'mirage' || t === 'thicket') {
          setTile(s, x, y, 'river'); made++;
          if (!g.origin) g.origin = [x, y];
          g.cells.push([x, y]); g.tiles.push('river'); g.wave.push(g.cells.length - 1);
          continue;
        }
        if (t === 'river' || t === 'ice') continue;
        if (t === 'fire' || t === 'smallfire') { setTile(s, x, y, 'empty'); stop = tileName(t) + 'を消して止まった'; break; }
        if (t === 'firewhirl' || t === 'tornado') { ctx.phrases.push(tileName(t) + 'に水が入った'); I.doSentakuki(s, x, y, ctx, ev, facing); stop = null; break; }
        stop = tileName(t) + 'で止まった';
        break;
      }
      if (g.cells.length) ctx.grows.push(g);
      ctx.phrases.push(made ? '【融合】源流から川が走った（' + made + 'マス）' : '川が走る場所がなかった');
      if (stop) ctx.phrases.push(stop);
    }
    // 旋風・竜巻: 正面の面に円く巻く。当たった者は向きが右回りに変わる（竜巻はとらわれる）。空きには風（竜巻の風）
    var N_CW = { up: 'right', right: 'down', down: 'left', left: 'up' }, N_BACK = { up: 'down', right: 'left', down: 'up', left: 'right' };
    function nGustCast(s, u, facing, ctx, ev, f) {
      var tw = f.id === 'ntwister', more = nHas(u, 'pushMore'), done = {}, left = 0;
      I.castCells(s, u, facing).forEach(function (c) {
        var x = c[0], y = c[1];
        if (!inBounds(s, x, y)) return;
        var t = getTile(s, x, y), o = unitAt(s, x, y);
        ctx.cells.push(c);
        if (o && o.id !== u.id) {
          addHit(ctx, o, u.power, 'direct');
          if (o.side !== 'object') {
            var to = more ? N_BACK[o.facing] : N_CW[o.facing];
            if (to && o.facing !== to) {
              o.facing = to;
              ev.push({ type: 'info', id: o.id, cells: [c], text: '【変化】' + unitLabel(s, o) + 'は' + f.name + 'に巻かれて' + DIRS[to].name + 'を向いた' + (more ? '（後ろを向かされた）' : '') + (o.intent ? '（予告の向きも変わった）' : '') });
            }
            if (tw && !o.stuck) { o.stuck = true; ev.push({ type: 'mud', id: o.id, cells: [c], text: '【覚醒】' + unitLabel(s, o) + 'は竜巻にとらわれた（次の移動は1回休み）' }); }
          }
        }
        if (blowCell(s, u, x, y, t, facing, ctx, ev)) return;   // 風の法則（岩・岩山・氷・雪山 …）
        if ((t === 'fire' || t === 'smallfire' || t === 'firewhirl') && !done.spread) { done.spread = true; ctx.phrases.push(tileName(t) + 'に風が当たった'); I.doSpread(s, x, y, facing, ctx, ev, 0); return; }
        if ((t === 'sakura' || t === 'hillsakura') && !done.erupt) { done.erupt = true; ctx.phrases.push(tileName(t) + 'に風が当たった'); I.doEruption(s, x, y, facing, ctx, ev); return; }
        if (t === 'mirage' && B.ideas.windClearsMirage) { setTile(s, x, y, 'empty'); ctx.phrases.push('風で蜃気楼が晴れた'); }
        var nt = getTile(s, x, y);
        if (nt === 'empty' && !(unitAt(s, x, y) && on('C1'))) { setTile(s, x, y, 'breeze'); left++; if (tw) nMark(s, x, y, 'twister'); }
        else if (tw && I.isWind(nt)) nMark(s, x, y, 'twister');
      });
      if (left) ctx.phrases.push(tw ? '【覚醒】竜巻の風が' + left + 'マス巻いている（ターン終了まで）' : '【変化】風が' + left + 'マス巻いている（ターン終了まで）');
    }
    // 砂嵐（融合）: 円く巻いて砂嵐（中の者は見えない）。ターン終了でおさまると丘
    function nSandCast(s, u, facing, ctx, ev) {
      var n = 0;
      I.castCells(s, u, facing).forEach(function (c) {
        var x = c[0], y = c[1], t = getTile(s, x, y), o = unitAt(s, x, y);
        ctx.cells.push(c);
        if (o && o.id !== u.id) addHit(ctx, o, u.power, 'direct');
        if (t === 'empty' || I.isWind(t)) { setTile(s, x, y, 'sandstorm'); n++; }
      });
      if (n) ctx.phrases.push('【融合】砂嵐が巻き起こった（' + n + 'マス。中の者は見えない。ターン終了でおさまると丘が残る）');
    }

    // ---- 覚醒先の新しい組み合わせ（1つずつ） ----
    // 水が来た（流れる・湖・源流の1マス）: 大樹 → 森が一気に広がる ／業火 → 水蒸気爆発 ／竜巻 → まわりに雨
    function nFlowCell(s, u, x, y, t, facing, ctx, ev) {
      if (!non()) return null;
      var k = nAwkAt(s, x, y);
      if (k === 'tree' && t === 'forest') { nTreeBloom(s, x, y, ctx, ev); return '大樹が水を吸い上げた'; }
      if (k === 'inferno' && t === 'fire') { if (onceIn(ctx, 'nSteam')) nSteam(s, x, y, ctx, ev); return '業火に水がかかった'; }
      if (k === 'twister' && I.isWind(t)) { if (onceIn(ctx, 'nRain')) nRain(s, x, y, ctx, ev); return '竜巻が水を巻き上げた'; }
      return null;
    }
    // 風が来た（吹く・旋風・竜巻の1マス）: 岩山 → 岩なだれ ／氷 → 吹雪。true なら風はそこで止まる
    function nBlowCell(s, u, x, y, t, facing, ctx, ev) {
      if (!non()) return false;
      var k = nAwkAt(s, x, y);
      if (k === 'rockmt' && t === 'mountain') { if (!has(ctx.cells, x, y)) ctx.cells.push([x, y]); if (onceIn(ctx, 'nRockfall')) { ctx.phrases.push('岩山に風が当たった'); nRockfall(s, x, y, facing, ctx, ev); } return true; }
      if (k === 'icelake' && t === 'ice') { if (!has(ctx.cells, x, y)) ctx.cells.push([x, y]); if (onceIn(ctx, 'nBlizzard')) { ctx.phrases.push('氷に風が当たった'); nBlizzard(s, x, y, facing, ctx, ev); } return true; }
      return false;
    }
    // 大樹に水: 大樹のまわり2マス（縦横の歩数）の空き・草むらが、一気に森になる（人の足元にも）
    function nTreeBloom(s, x, y, ctx, ev) {
      var trees = nBody(s, x, y, 'forest', 'tree'), out = [], seen = {};
      trees.forEach(function (tc) {
        for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
          var cx = tc[0] + dx, cy = tc[1] + dy, k = key(cx, cy);
          if (Math.abs(dx) + Math.abs(dy) > 2 || seen[k] || !inBounds(s, cx, cy)) continue;
          seen[k] = true;
          var t = getTile(s, cx, cy), o = unitAt(s, cx, cy);
          if ((t === 'empty' || t === 'thicket') && (!o || (B.ideas.natureUnderUnits && !on('C1')))) { setTile(s, cx, cy, 'forest'); out.push([cx, cy]); }
        }
      });
      out.forEach(function (c) { if (!has(ctx.cells, c[0], c[1])) ctx.cells.push(c); });
      ev.push({ type: 'kindle', isNew: true, cells: out, text: '【覚醒】大樹が水を吸い上げ、まわりに森が一気に広がった（' + out.length + 'マス）' });
    }
    // 業火に水: 消えずに爆ぜる（水蒸気爆発。業火とまわり1マスの者に20）。業火はただの炎として残る
    function nSteam(s, x, y, ctx, ev) {
      var core = nBody(s, x, y, 'fire', 'inferno');
      var cells = around8(s, core);
      hitAll(s, ctx, cells, B.fire.strongDamage);
      core.forEach(function (c) { nUnmark(s, c[0], c[1]); });
      finish(ctx, ev, '水蒸気爆発', cells, B.fire.strongDamage, [x, y], '【覚醒】水蒸気爆発！ 業火は水で消えずに爆ぜた（業火' + core.length + 'マスとまわり1マスに威力' + B.fire.strongDamage + '）', { awk: true });
    }
    // 竜巻に水: 水を巻き上げて、竜巻とまわり1マスに雨（空きは水たまり、炎は消える。業火なら爆ぜる）
    function nRain(s, x, y, ctx, ev) {
      var body = connected(s, x, y, getTile(s, x, y)).filter(function (c) { return nAwkAt(s, c[0], c[1]) === 'twister'; });
      var area = around8(s, body), pud = [], out = 0;
      area.forEach(function (c) {
        var t = getTile(s, c[0], c[1]), o = unitAt(s, c[0], c[1]);
        if (o) I.cureBurn(s, o, ctx);
        if (t === 'fire' && nAwkAt(s, c[0], c[1]) === 'inferno') { if (onceIn(ctx, 'nSteam')) nSteam(s, c[0], c[1], ctx, ev); return; }
        if (t === 'fire' || t === 'smallfire') { setTile(s, c[0], c[1], 'empty'); out++; return; }
        if (t === 'empty' && (!o || (B.ideas.natureUnderUnits && !on('C1')))) { setTile(s, c[0], c[1], 'puddle'); pud.push(c); }
      });
      pud.forEach(function (c) { if (!has(ctx.cells, c[0], c[1])) ctx.cells.push(c); });
      ev.push({ type: 'kindle', isNew: true, cells: area, text: '【覚醒】竜巻が水を巻き上げ、まわりに雨を降らせた（水たまり' + pud.length + 'マス' + (out ? '・炎が' + out + 'マス消えた' : '') + '）' });
    }
    // 岩山に風: 岩が風下の斜面を転がり落ちる（岩なだれ。通り道の者に20。水に落ちれば飛び石、止まった所に岩）。岩山はただの山に戻る
    function nRollPath(s, x, y, dir) {
      var F = DIRS[dir], cx = x, cy = y, cells = [], water = false;
      for (var i = 0; i < 20; i++) {
        var nx = cx + F.dx, ny = cy + F.dy;
        if (!inBounds(s, nx, ny)) break;
        var t = getTile(s, nx, ny);
        if (t === 'river' || t === 'puddle' || t === 'reeds') { cells.push([nx, ny]); water = true; break; }
        if (!I.isPassable(t)) break;
        cells.push([nx, ny]); cx = nx; cy = ny;
      }
      return { cells: cells, water: water };
    }
    function nRockfall(s, x, y, dir, ctx, ev) {
      var body = nBody(s, x, y, 'mountain', 'rockmt'), lanes = nLee(body, dir), path = [], ends = [];
      lanes.forEach(function (c) {
        var r = nRollPath(s, c[0], c[1], dir);
        r.cells.forEach(function (p) { if (!has(path, p[0], p[1])) path.push(p); });
        if (r.cells.length) ends.push({ at: r.cells[r.cells.length - 1], water: r.water });
      });
      body.forEach(function (c) { nUnmark(s, c[0], c[1]); });
      if (!path.length) { ctx.phrases.push('岩山の風下に、岩の転がる斜面がなかった'); return; }
      hitAll(s, ctx, path, B.fire.strongDamage);
      ends.forEach(function (e) {
        var t = getTile(s, e.at[0], e.at[1]);
        if (e.water) setTile(s, e.at[0], e.at[1], 'stepstone');
        else if (t === 'empty' && !unitAt(s, e.at[0], e.at[1])) setTile(s, e.at[0], e.at[1], 'rock');
      });
      finish(ctx, ev, '岩なだれ', path, B.fire.strongDamage, [x, y], '【覚醒】岩なだれ！ 岩山の岩が' + DIRS[dir].name + 'の斜面を転がり落ちた（' + lanes.length + '筋・通り道の者に威力' + B.fire.strongDamage + '。岩山はただの山に）', { dir: dir, awk: true });
    }
    // 氷に風: 吹雪。氷の風下の一直線が凍る（空き・水・炎は氷に、そこにいる者は足が凍る）。氷はそのまま
    var N_FREEZE = { empty: true, puddle: true, river: true, mirage: true, smallfire: true, fire: true, reeds: true, breeze: true, gale: true };
    function nBlizzard(s, x, y, dir, ctx, ev) {
      var body = nBody(s, x, y, 'ice', 'icelake'), cells = [], frozen = 0;
      nLee(body, dir).forEach(function (c) { lineFrom(s, c[0], c[1], dir, HARD).forEach(function (p) { if (!has(cells, p[0], p[1])) cells.push(p); }); });
      cells.forEach(function (c) {
        var t = getTile(s, c[0], c[1]), q = unitAt(s, c[0], c[1]);
        if (N_FREEZE[t]) setTile(s, c[0], c[1], 'ice');
        if (q && q.side !== 'object') {
          I.cureBurn(s, q, ctx);
          if (!q.stuck) { q.stuck = true; frozen++; ev.push({ type: 'mud', id: q.id, cells: [c], text: '【覚醒】' + unitLabel(s, q) + 'は吹雪で足が凍りついた（次の移動は1回休み）' }); }
        }
      });
      finish(ctx, ev, '吹雪', cells, 0, [x, y], '【覚醒】吹雪！ 氷の上を風が吹き抜け、' + DIRS[dir].name + 'の一直線が凍った（' + cells.length + 'マス・足が凍った者' + frozen + '人）', { dir: dir, awk: true });
    }

    // ---- 間の強化（撃ったあと。判定より先） ----
    function nAfterShot(s, u, facing, ctx, ev) {
      if (!non()) return;
      if (ctx.labN) {   // 撃った言葉を、変化先の名前と動詞に
        var from = I.magicName(u.magic) + 'の魔法（' + I.MAGIC_INFO[u.magic].verb + '）', to = ctx.labN.name + 'の魔法（' + ctx.labN.verb + '）';
        for (var i = ev.length - 1; i >= 0; i--) if (ev[i].type === 'cast' && ev[i].id === u.id) { ev[i].text = ev[i].text.replace(from, to); ev[i].labForm = ctx.labN.id; break; }
      }
      if (!nPathOf(u)) return;
      var hits = ctx.order.filter(function (id) { var h = ctx.hits[id]; return h && h.src === 'direct' && id !== u.id; })
        .map(function (id) { return I.findUnit(s, id); }).filter(function (q) { return q && q.side !== 'object' && q.hp > 0; });
      // 止める: 当たった敵（術者の相手）の予告が遅れる・次の移動を止める・次の魔法の形が小さくなる
      var foes = hits.filter(function (q) { return q.side !== u.side; });
      if (nHas(u, 'delay')) foes.forEach(function (q) {
        if (!q.intent) return;
        q.intent = false; q.labDelay = { n: 1 };
        ev.push({ type: 'info', id: q.id, cells: [[q.x, q.y]], text: nLabel(u) + ': ' + unitLabel(s, q) + 'の予告が1ターン遅れた（その場で構えたまま、次のターンに撃つ）' });
      });
      if (nHas(u, 'hold')) foes.forEach(function (q) {
        var cur = q.stuck === true ? 1 : (Number(q.stuck) || 0);
        if (cur >= 1) return;
        q.stuck = true;
        ev.push({ type: 'mud', id: q.id, cells: [[q.x, q.y]], text: nLabel(u) + ': ' + unitLabel(s, q) + 'は足が止まった（次の移動は1回休み）' });
      });
      if (nHas(u, 'shrink')) foes.forEach(function (q) {
        q.labShrink = true;
        ev.push({ type: 'info', id: q.id, cells: [[q.x, q.y]], text: nLabel(u) + ': ' + unitLabel(s, q) + 'の次の魔法は1マスだけ' });
      });
      if (nHas(u, 'effect')) nEffect(s, u, ctx, ev);
      if (nHas(u, 'pushMore')) nPushMore(s, u, ctx, ev);
    }
    // 倒す3: 当たった者への効き目が1段強く・長く（この1発で付いた足止め・火傷が1回長い。火の直撃は火傷を負わせる）
    function nEffect(s, u, ctx, ev) {
      var pre = ctx.labNPre || {};
      s.units.forEach(function (q) {
        var b = pre[q.id];
        if (!b || q.id === u.id || q.side === 'object' || q.hp <= 0) return;
        var direct = ctx.hits[q.id] && ctx.hits[q.id].src === 'direct', parts = [];
        var st0 = b.stuck === true ? 1 : (Number(b.stuck) || 0), st1 = q.stuck === true ? 1 : (Number(q.stuck) || 0);
        if (st1 > st0) { q.stuck = st1 + 1; parts.push('足止めが' + (st1 + 1) + '回に'); }
        if (u.magic === 'fire' && direct && (q.burn || 0) < B.fire.burnTurns) { q.burn = B.fire.burnTurns; parts.push('直撃で火傷'); }
        if ((q.burn || 0) > b.burn) { q.burn += 1; parts.push('火傷が' + q.burn + '回に'); }
        if (parts.length) ev.push({ type: 'burnStatus', id: q.id, cells: [[q.x, q.y]], text: nLabel(u) + ': ' + unitLabel(s, q) + 'への効き目が1段強い（' + parts.join('・') + '）' });
      });
    }
    // 動かす1: この1発で動いた者を、動いた向きへもう1マス（押す・運ぶ・引き寄せる。向きを変えるは旋風の中で後ろを向かせる）
    function nPushMore(s, u, ctx, ev) {
      var pre = ctx.labNPre || {};
      s.units.forEach(function (q) {
        var b = pre[q.id];
        if (!b || q.id === u.id || q.hp <= 0 || I.isFixed(q)) return;
        var dx = q.x - b.x, dy = q.y - b.y;
        if (!dx && !dy) return;
        if (q.stuck && getTile(s, q.x, q.y) === 'mud') return;   // 泥沼にはまったら、そこで止まる
        var dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        I.pushOne(s, q, dir, ev, nLabel(u) + ': ' + unitLabel(s, q) + 'をさらに' + DIRS[dir].name + 'へ1マス');
      });
    }
    // 倒す1: 直撃の威力 +2
    hitMore.push(function (ctx, u, amount, src) {
      if (src !== 'direct' || !ctx.caster || !ctx.s || !non()) return amount;
      var c = I.findUnit(ctx.s, ctx.caster);
      return c && nHas(c, 'power') ? amount + 2 : amount;
    });
    // エディット: N の道をいじる（labSetPath と同じ。form は数から決まる）
    var NAPI = {
      on: non, CH: LCH, WANTS: LCH.WANTS, WANT_ORDER: LCH.WANT_ORDER, SORT_ORDER: LCH.SORT_ORDER, FORMS: LCH.FORMS, STEPS: LCH.STEPS, MORE: LCH.MORE,
      MISSIONS: function () { return nMissionList(); }, def: nDef, norm: nNorm, wantOf: nWantOf, wantName: nWantName, kind: nKind, stepsOf: function (m, p) { var d = nDef(m); return d ? nStepsOf(d, nNorm(m, p)) : []; },
      stepAt: nStepAt, formOf: nFormOf, changeAt: nChangeAt, awakeAt: nAwakeAt, odd: nOdd, earth: nEarth, weak: nWeak, keep: nKeep,
      setSort: nSetSort, sortOf: function () { return lclone(nSort); }, missionWant: nMissionWant, mission: nMission, awkTile: nAwkTile, AWK: N_AWK,
      road: nRoadOn, roadLen: nRoadLen, roadAw: nRoadAw, shape: nShape, otherName: nOtherName, next: nNext, nextText: nNextText, TRAITS: LCH.TRAITS || {}, cardCells: nCardCells   // N6 1本の道
    };

    var LAPI = {
      DIRS: LT.DIRS, DIR_ORDER: LT.DIR_ORDER, TARGETS: LT.TARGETS, TAKERS: LT.TAKERS || {}, PATHS: LP.PATHS, EXTRA_CELLS: LP.EXTRA_CELLS, LEGACY: LP.LEGACY,
      pathDef: pathDef, dirsOf: dirsOf, isGood: isGood, makeGood: makeGood, awakeDirs: awakeDirs, makeForm: makeForm, stepText: stepText, closeText: closeText, gotOrder: gotOrder, newPath: newPath, normPath: normPath, advance: advance, gain: gain, gainText: gainText,
      pathMarks: pathMarks, outlook: outlook, projected: projected, fxOn: fxOn,
      stepOf: stepOf, awakeOf: awakeOf, formOf: formOf, formName: formName, shapeSteps: shapeSteps, dirName: dirName,
      questsOf: questsOf, questOf: questOf, DARK: LT.DARK || [], darkOf: darkOf, darkMax: darkMax, darkPower: darkPower, darkDots: darkDots,
      targetDef: targetDef, openT: openT, handName: handName, foilPreview: foilPreview, redirectPreview: redirectPreview, thornCaged: thornCaged,
      whoMode: whoMode, enemyMode: enemyMode, targetCount: targetCount, loseMode: loseMode, destMode: destMode,
      M: MAPI, N: NAPI, dirTable: function () { return non() ? LCH.WANTS : mon() ? LPW.DIRS : LT.DIRS; }, takerTable: function () { return mon() ? LPW.TAKERS : (LT.TAKERS || {}); }   // M のときは3つの方向（＋作る系）
    };

    // ---------------------------------------------------------------
    // rules.js から呼ばれるところ（どれも、切り替えがオフなら何もしない）
    // ---------------------------------------------------------------
    // setTile のたびに: 燃えると別のものになる自然（I5 蔓の橋は燃えると川）、自然ごとの印の後始末
    function onSetTile(s, i, old, t) {
      if (old === 'vinebridge' && t === 'fire' && on('I5')) return 'river';
      if (s.labWind && old !== t && s.labWind[i] !== undefined) delete s.labWind[i];
      if (s.labAge && old !== t && s.labAge[i] !== undefined) delete s.labAge[i];
      if (s.labLinger && old !== t && s.labLinger[i] !== undefined) delete s.labLinger[i];   // M5: もう1ターン残すマス
      if (s.labAwk && old !== t && s.labAwk[i] !== undefined) { delete s.labAwk[i]; if (!Object.keys(s.labAwk).length) delete s.labAwk; }   // N: 覚醒先の自然の印（自然が変わると消える）
      if (lon()) makerSet(s, i, t);   // L: その自然を作った手
      return t;
    }
    // ダメージを入れる前に: 盾・バリア・大きい敵 など。null を返すとダメージなし
    function filterHit(ctx, u, amount, src, cell) {
      if (amount <= 0) return amount;
      return hitRules(ctx, u, amount, src, cell);
    }
    // 燃え広がりを止めるマス（ラボで足した自然）
    function spreadBlocks(t) { return LAB_SPREAD_BLOCK[t] === true; }
    function useLabShock() { return on('C2') || on('D3') || on('D7') || on('B14') || on('I4') || on('I8') || on('L0'); }
    // 火の渦ができたあと（E9: 中の者は閉じこめられる）
    function afterWhirl(s, cells, ev) {
      if (!on('E9')) return;
      cells.forEach(function (c) { var o = unitAt(s, c[0], c[1]); if (o) enclose(s, o, ev); });
    }
    // 燃え移りの先になる自然（C6: 死の森 → オバケヤシキ、I5: 蔓の橋 → 川）
    function catchesFire(s, t) { return (t === 'deadforest' && on('C6')) || (t === 'vinebridge' && on('I5')) || (t === 'deepforest' && on('B21')) || plantLike(t); }
    // 燃え移りの元になる自然（A9: 火山はずっと熱い）
    function spreadsFire(s, t) { return t === 'volcano' && on('A9'); }

    return {
      onSetTile: onSetTile, filterHit: filterHit, spreadBlocks: spreadBlocks, useLabShock: useLabShock, afterWhirl: afterWhirl,
      useLabReach: useLabReach, reach: reach, pathOf: pathOf, mudGrip: mudGrip, afterMove: afterMove, afterPush: afterPush, hidden: hidden,
      highFirst: highFirst, barrier: barrier, useLabDark: useLabDark, darken: darken, placeCell: placeCell, heavy: heavy, canStandAt: canStandAt,
      catchesFire: catchesFire, spreadsFire: spreadsFire, waterTile: waterTile, unitCells: unitCells, waveFrom: waveFrom,
      castOrigin: castOrigin, castCells: castCells, unitConf: unitConf, pushBig: pushBig, onFire: onFire, beforeApply: beforeApply,
      planEnemy: planEnemy, fireStage: fireStage, intentReason: intentReason, cannotIntent: cannotIntent, castMagic: castMagic, afterShot: afterShot,
      nextPaths: nextPaths, crushTo: crushTo, DESIRE: DESIRE, labValue: labValue,
      decoys: decoysOf, mirrors: mirrors, enclosedAt: enclosedAt, intentHints: intentHints,
      twoStep: twoStep, lengthFor: lengthFor, onDeath: onDeathAll, turnEnd: turnEndAll, boostOf: boostOf, hasBoost: hasBoost, giveBoost: giveBoost,
      moreHints: moreHints, zukanList: zukanList,
      timeFrozen: timeFrozen, burnedTo: burnedTo, growMarks: growMarks,
      flowCell: flowCell, blowCell: blowCell, tallTile: tallTile, strikeTall: strikeTall, chillCell: chillCell, LAB_TILES: LAB_TILES,
      interleave: interleave, intentOrder: intentOrder, stancesOf: stancesOf, setStance: setStance, fireStances: fireStances, breakFront: breakFront,
      placeBench: placeBench, beforeEnemyFire: beforeEnemyFire, windAt: windAt,
      cannotShoot: cannotShoot, resultMore: resultMore, keepGoing: keepGoing, noAnnihilateWin: noAnnihilateWin, starText: starText, stars: stars, onStart: onStart,
      newRun: newRun, runPaths: runPaths, pathText: pathText, runPreset: runPreset, runOffers: runOffers, runPick: runPick, runAfterBattle: runAfterBattle,
      RUN_STEPS: RUN_STEPS, REWARD_NAME: REWARD_NAME, flagTaken: flagTaken,
      boostText: boostText, boostShape: boostShape, FORMS: FORMS, WEAPONS: WEAPONS, BOOST_INFO: BOOST_INFO, GROW_LIST: GROW_LIST, GROW_DIR: GROW_DIR,
      api: { editSetBoost: editSetBoost, labSwapMagic: swapMagic, labSetPath: editSetPath, labSetCand: editSetCand },
      keepTile: keepTile, onResult: onResult, passUnit: passUnit,   // M
      awkTile: nAwkTile,   // N: 覚醒先の自然の印（画面）
      formName: formName, planStart: planStart, afterPlan: afterPlan, afterAct: afterAct, spreadBonus: spreadBonus, plantLike: plantLike, L: LAPI,
      crushable: function (u, t) { return !!u && on('D4') && (u.size || 1) > 1 && !!CRUSH[t]; },
      on: on, opt: opt, edge: edge, CH: I.CH,
      shock: shock, haunt: haunt, sentakuki: sentakuki, ringAt: ringAt,
      eruptionDepth: eruptionDepth, eruptionWeak: eruptionWeak, sharpLength: sharpLength,
      markBigWhirl: markBigWhirl, isBigWhirl: isBigWhirl, quenchWhirl: quenchWhirl,
      spreadTouch: spreadTouch, touchFire: touchFire, timeHaunt: timeHaunt, noteOneStage: noteOneStage,
      sq: sq, has: has
    };
  }

  var LabRules = { bind: bind };
  if (typeof module !== 'undefined' && module.exports) module.exports = LabRules;
  else root.LabRules = LabRules;
})(this);
