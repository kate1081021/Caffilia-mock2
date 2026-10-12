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
      return t === 'river' || t === 'puddle' || (t === 'reeds' && on('B14')) || (t === 'stepstone' && on('I4'));
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
        if (!waterTile(getTile(s, c[0], c[1]))) continue;
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
      if (t === 'puddle') { setTile(s, x, y, 'mirage'); ctx.phrases.push(tag + '水たまりが蜃気楼になった'); return true; }
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
      return on('A2') || on('A5') || on('A6') || on('F2') || on('B20') || on('B21') || on('D4') || on('D7') || (u.size || 1) > 1;
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
      if (u.stuck) return { dist: dist, order: order, prev: prev, pass: pass };
      var open = [{ x: u.x, y: u.y, c: 0, seq: 0 }], seq = 1, done = {};
      while (open.length) {
        var bi = 0;
        for (var i = 1; i < open.length; i++) if (open[i].c < open[bi].c || (open[i].c === open[bi].c && open[i].seq < open[bi].seq)) bi = i;
        var cur = open.splice(bi, 1)[0], ck = key(cur.x, cur.y);
        if (done[ck] || dist[ck] !== cur.c) continue;
        done[ck] = true;
        if (cur.c >= u.move) continue;
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
          if (nc > u.move) return;
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
    function afterPush(s, o, ev) { heavyOnIce(s, o, ev); }

    // 隠れているか（A3 森・A8 高台から見える・B17 砂嵐・B20 暗がり・B21 深い森・I1 照らされた）。ラボで変わらないときは undefined
    function hidden(s, u, viewer, forTarget) {
      if (!(on('A3') || on('A8') || on('B17') || on('B20') || on('B21') || on('I1'))) return undefined;
      var t = getTile(s, u.x, u.y);
      if (on('I1') && u.labLit) return false;
      var see = !!viewer && on('A8') && HIGH[getTile(s, viewer.x, viewer.y)];
      if (t === 'mirage') return !see;
      if (forTarget) return false;   // お題の的は森の中でも的のまま
      if ((on('A3') && t === 'forest') || (on('B21') && t === 'deepforest') || (on('B17') && t === 'sandstorm') || (on('B20') && t === 'gloom')) return !see;
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
    function useLabDark() { return on('A10') || on('B13') || on('B19') || on('B20') || on('G3'); }
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
    // E9: 閉じこめられた者は予告も撃つこともできない
    function enclose(s, o, ev) {}
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
    // rules.js から呼ばれるところ（どれも、切り替えがオフなら何もしない）
    // ---------------------------------------------------------------
    // setTile のたびに: 燃えると別のものになる自然（I5 蔓の橋は燃えると川）、自然ごとの印の後始末
    function onSetTile(s, i, old, t) {
      if (old === 'vinebridge' && t === 'fire' && on('I5')) return 'river';
      if (s.labWind && old !== t && s.labWind[i] !== undefined) delete s.labWind[i];
      if (s.labAge && old !== t && s.labAge[i] !== undefined) delete s.labAge[i];
      return t;
    }
    // ダメージを入れる前に: 盾・バリア・大きい敵 など。null を返すとダメージなし
    function filterHit(ctx, u, amount, src, cell) {
      if (amount <= 0) return amount;
      return hitRules(ctx, u, amount, src, cell);
    }
    // 燃え広がりを止めるマス（ラボで足した自然）
    function spreadBlocks(t) { return LAB_SPREAD_BLOCK[t] === true; }
    function useLabShock() { return on('C2') || on('D3') || on('D7') || on('B14') || on('I4') || on('I8'); }
    // 火の渦ができたあと（E9: 中の者は閉じこめられる）
    function afterWhirl(s, cells, ev) {
      if (!on('E9')) return;
      cells.forEach(function (c) { var o = unitAt(s, c[0], c[1]); if (o) enclose(s, o, ev); });
    }
    // 燃え移りの先になる自然（C6: 死の森 → オバケヤシキ、I5: 蔓の橋 → 川）
    function catchesFire(s, t) { return (t === 'deadforest' && on('C6')) || (t === 'vinebridge' && on('I5')) || (t === 'deepforest' && on('B21')); }
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
