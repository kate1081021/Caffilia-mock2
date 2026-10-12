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
      I.darkPull(s, house, range, ev, 'はオバケヤシキに引き寄せられた');
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
    // ダメージの決まり（A4 森は盾・A12 バリア・D3 大きい敵・D7 体の違い …）
    // ---------------------------------------------------------------
    var LAB_SPREAD_BLOCK = {};
    function hitRules(ctx, u, amount, src, cell) {
      return amount;
    }
    // E9: 閉じこめられた者は予告も撃つこともできない
    function enclose(s, o, ev) {}
    // I8: 金の柱も雷を通す
    function pillarNet(s, net, seen) { return net; }
    // ラボで足した自然に「火が当たった」
    function touchFireExtra(s, x, y, t, dir, ctx, ev, tag) { return false; }

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
      catchesFire: catchesFire, spreadsFire: spreadsFire, waterTile: waterTile, unitCells: unitCells, waveFrom: waveFrom,
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
