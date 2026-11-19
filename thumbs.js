/* Live project artwork: a small wireframe 3D scene per project, drawn on a 2D canvas.
   Each <canvas data-art="name"> picks a scene below. Scenes push lines and dots in a unit
   cube around the origin; this file rotates, projects and draws them in the ember palette.
   To use a real screenshot instead, replace the canvas with an <img> in index.html. */
(function () {
  'use strict';
  var canvases = Array.prototype.slice.call(document.querySelectorAll('canvas[data-art]'));
  if (!canvases.length) return;
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var COL = ['242,100,48', '255,160,96', '243,238,232'];
  var TAU = Math.PI * 2;

  function rot(p, ax, ay) {
    var cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
    var x = p[0] * cy + p[2] * sy, z = -p[0] * sy + p[2] * cy;
    var y = p[1] * cx - z * sx;
    return [x, y, p[1] * sx + z * cx];
  }
  function box(L, cx, cy, cz, w, h, d, a, c, ax, ay) {
    var v = [], i;
    for (i = 0; i < 8; i++) {
      var p = [(i & 1 ? 1 : -1) * w / 2, (i & 2 ? 1 : -1) * h / 2, (i & 4 ? 1 : -1) * d / 2];
      if (ax || ay) p = rot(p, ax || 0, ay || 0);
      v.push([p[0] + cx, p[1] + cy, p[2] + cz]);
    }
    [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(function (e) {
      L.push([v[e[0]], v[e[1]], a, c]);
    });
    return v;
  }
  function hash(n) { var x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }

  /* Fibonacci sphere with nearest-neighbour links, built once */
  var sphere = (function () {
    var pts = [], links = [], n = 44, i, j;
    for (i = 0; i < n; i++) {
      var y = 1 - (i + 0.5) / n * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
      pts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    }
    for (i = 0; i < n; i++) {
      var near = [];
      for (j = 0; j < n; j++) {
        if (i === j) continue;
        var dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1], dz = pts[i][2] - pts[j][2];
        near.push([dx * dx + dy * dy + dz * dz, j]);
      }
      near.sort(function (p, q) { return p[0] - q[0]; });
      for (j = 0; j < 3; j++) if (near[j][1] > i) links.push([i, near[j][1]]);
    }
    return { pts: pts, links: links };
  })();

  var scenes = {
    /* Nyaru: a sharded network, nodes pulsing as traffic moves */
    shards: {
      spin: 0.22, pitch: 0.35,
      draw: function (t, L, D) {
        sphere.links.forEach(function (e) { L.push([sphere.pts[e[0]], sphere.pts[e[1]], 0.26, 0]); });
        sphere.pts.forEach(function (p, i) {
          var b = 0.5 + 0.5 * Math.sin(t * 1.6 + i * 1.7);
          D.push([p, 1.4 + b * 2.2, 0.35 + b * 0.65, b > 0.8 ? 2 : 1]);
        });
        for (var k = 0; k < 6; k++) {
          var e = sphere.links[(k * 13) % sphere.links.length], f = (t * 0.6 + k * 0.31) % 1;
          var a = sphere.pts[e[0]], b2 = sphere.pts[e[1]];
          D.push([[a[0] + (b2[0] - a[0]) * f, a[1] + (b2[1] - a[1]) * f, a[2] + (b2[2] - a[2]) * f], 3, 1, 2]);
        }
      }
    },
    /* Open-source framework: nested modules turning inside each other */
    cubes: {
      spin: 0.18, pitch: 0.42,
      draw: function (t, L, D) {
        box(L, 0, 0, 0, 1.5, 1.5, 1.5, 0.3, 0, 0, 0).forEach(function (p) { D.push([p, 2, 0.6, 0]); });
        box(L, 0, 0, 0, 0.95, 0.95, 0.95, 0.6, 1, t * 0.5, t * 0.35).forEach(function (p) { D.push([p, 2.2, 0.8, 1]); });
        box(L, 0, 0, 0, 0.48, 0.48, 0.48, 0.95, 2, -t * 0.8, t * 0.6);
        D.push([[0, 0, 0], 4, 1, 1]);
      }
    },
    /* Restaurant API: client, service and database layers with requests travelling between them */
    api: {
      spin: 0.14, pitch: 0.5,
      draw: function (t, L, D) {
        [-0.75, 0, 0.75].forEach(function (y, li) {
          for (var i = 0; i <= 4; i++) {
            var u = -0.9 + i * 0.45;
            L.push([[u, y, -0.9], [u, y, 0.9], li === 1 ? 0.42 : 0.22, li === 1 ? 1 : 0]);
            L.push([[-0.9, y, u], [0.9, y, u], li === 1 ? 0.42 : 0.22, li === 1 ? 1 : 0]);
          }
        });
        for (var k = 0; k < 9; k++) {
          var x = -0.675 + (k % 3) * 0.675, z = -0.675 + Math.floor(k / 3) * 0.675;
          var f = (t * (0.35 + hash(k) * 0.3) + hash(k + 9)) % 1, up = k % 2 === 0;
          var y = (up ? -0.75 : 0.75) + (up ? 1 : -1) * f * 1.5;
          L.push([[x, -0.75, z], [x, 0.75, z], 0.1, 0]);
          D.push([[x, y, z], 3, 1, 2]);
          D.push([[x, 0, z], 2, 0.7, 1]);
        }
      }
    },
    /* Learning dashboard: bars rising and falling */
    bars: {
      sway: 0.34, base: -0.62, pitch: 0.48,
      draw: function (t, L, D) {
        for (var i = 0; i < 6; i++) {
          for (var j = 0; j < 4; j++) {
            var h = 0.14 + 1.05 * Math.pow(0.5 + 0.5 * Math.sin(t * 0.9 + i * 0.8 + j * 1.4), 1.6);
            var x = -0.875 + i * 0.35, z = -0.525 + j * 0.35;
            var v = box(L, x, -0.6 + h / 2, z, 0.2, h, 0.2, 0.28, 0);
            [[2, 3], [6, 7], [2, 6], [3, 7]].forEach(function (e) { L.push([v[e[0]], v[e[1]], 0.95, h > 0.9 ? 2 : 1]); });
          }
        }
        L.push([[-1.15, -0.6, -0.8], [1.15, -0.6, -0.8], 0.25, 0]);
        L.push([[-1.15, -0.6, 0.8], [1.15, -0.6, 0.8], 0.25, 0]);
        L.push([[-1.15, -0.6, -0.8], [-1.15, -0.6, 0.8], 0.25, 0]);
        L.push([[1.15, -0.6, -0.8], [1.15, -0.6, 0.8], 0.25, 0]);
      }
    },
    /* OpenClaw: a grid of evaluated cases, failures flagged and corrected as the scan passes */
    eval: {
      sway: 0.3, base: 0, pitch: 0.16,
      draw: function (t, L, D) {
        var scan = ((t * 0.28) % 1.3) * 2.6 - 1.5;
        for (var i = 0; i < 8; i++) {
          for (var j = 0; j < 5; j++) {
            var x = -1.225 + i * 0.35, y = -0.7 + j * 0.35, s = 0.13;
            var fail = hash(i * 7.3 + j * 3.1 + Math.floor(t * 0.28 / 1.3) * 5.7) < 0.24, done = x < scan;
            var z = done ? 0 : -0.12;
            L.push([[x - s, y - s, z], [x + s, y - s, z], 0.3, 0]); L.push([[x + s, y - s, z], [x + s, y + s, z], 0.3, 0]);
            L.push([[x + s, y + s, z], [x - s, y + s, z], 0.3, 0]); L.push([[x - s, y + s, z], [x - s, y - s, z], 0.3, 0]);
            if (!done) continue;
            if (fail) {
              L.push([[x - s * 0.6, y - s * 0.6, 0.1], [x + s * 0.6, y + s * 0.6, 0.1], 0.95, 2]);
              L.push([[x - s * 0.6, y + s * 0.6, 0.1], [x + s * 0.6, y - s * 0.6, 0.1], 0.95, 2]);
            } else {
              D.push([[x, y, 0.06], 2.6, 0.9, 1]);
            }
          }
        }
        L.push([[scan, -0.95, 0.15], [scan, 0.95, 0.15], 0.9, 1]);
      }
    },
    /* HackTheFest: the podium, second step lit */
    podium: {
      sway: 0.4, base: -0.25, pitch: 0.3,
      draw: function (t, L, D) {
        box(L, 0, -0.15, 0, 0.6, 1.1, 0.6, 0.3, 0);
        box(L, 0.62, -0.42, 0, 0.6, 0.56, 0.6, 0.3, 0);
        var v = box(L, -0.62, -0.28, 0, 0.6, 0.84, 0.6, 0.95, 1);
        v.forEach(function (p) { D.push([p, 2.4, 0.9, 2]); });
        var d = [[-0.14, 0.2], [0.14, 0.2], [0.14, 0], [-0.14, 0], [-0.14, -0.2], [0.14, -0.2]];
        for (var i = 0; i < 5; i++) L.push([[-0.62 + d[i][0], -0.28 + d[i][1], 0.31], [-0.62 + d[i + 1][0], -0.28 + d[i + 1][1], 0.31], 1, 2]);
        for (var k = 0; k < 14; k++) {
          var f = (t * 0.22 + hash(k)) % 1, a = k * 0.9 + t * 0.7, r = 0.12 + f * 0.3;
          D.push([[-0.62 + Math.cos(a) * r, 0.16 + f * 0.9, Math.sin(a) * r], 1.6 + (1 - f) * 1.6, 1 - f, k % 3 === 0 ? 2 : 1]);
        }
      }
    }
  };

  var items = canvases.map(function (cv) {
    var host = cv.closest('.project__tilt') || cv.parentNode;
    var it = { cv: cv, ctx: cv.getContext('2d'), scene: scenes[cv.getAttribute('data-art')] || scenes.cubes, seen: false, mx: 0, mxT: 0, w: 0, h: 0, slot: cv.closest('.gallery__item') };
    host.addEventListener('pointermove', function (e) {
      var r = host.getBoundingClientRect();
      it.mxT = ((e.clientX - r.left) / r.width - 0.5) * 2;
    });
    host.addEventListener('pointerleave', function () { it.mxT = 0; });
    return it;
  });

  function size(it) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.round(it.cv.clientWidth * dpr), h = Math.round(it.cv.clientHeight * dpr);
    if (!w || !h) return false;
    if (w !== it.w || h !== it.h) { it.cv.width = it.w = w; it.cv.height = it.h = h; }
    it.dpr = dpr;
    return true;
  }

  function draw(it, t) {
    if (!size(it)) return;
    var ctx = it.ctx, sc = it.scene, L = [], D = [];
    sc.draw(t, L, D);
    it.mx += (it.mxT - it.mx) * 0.12;
    var ay = (sc.spin ? t * sc.spin : (sc.base || 0) + Math.sin(t * 0.45) * (sc.sway || 0.3)) + it.mx * 0.7;
    var ax = sc.pitch || 0.3;
    var cx = it.w / 2, cy = it.h / 2, unit = it.h * 0.36, cam = 4.2;
    function proj(p) {
      var q = rot(p, ax, ay), k = cam / (cam - q[2]);
      return [cx + q[0] * unit * k, cy - q[1] * unit * k, q[2]];
    }
    ctx.clearRect(0, 0, it.w, it.h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    var i, a, b, f;
    for (i = 0; i < L.length; i++) {
      a = proj(L[i][0]); b = proj(L[i][1]);
      f = 0.45 + 0.55 * Math.min(1, Math.max(0, ((a[2] + b[2]) / 2 + 1.3) / 2.6));
      ctx.strokeStyle = 'rgba(' + COL[L[i][3]] + ',' + (L[i][2] * f).toFixed(3) + ')';
      ctx.lineWidth = (L[i][2] > 0.8 ? 1.5 : 1) * it.dpr;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    for (i = 0; i < D.length; i++) {
      a = proj(D[i][0]);
      f = 0.4 + 0.6 * Math.min(1, Math.max(0, (a[2] + 1.3) / 2.6));
      var r = D[i][1] * it.dpr * (0.7 + 0.5 * f), al = D[i][2] * f;
      ctx.fillStyle = 'rgba(' + COL[D[i][3]] + ',' + (al * 0.16).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(a[0], a[1], r * 3.2, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(' + COL[D[i][3]] + ',' + al.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(a[0], a[1], r, 0, TAU); ctx.fill();
    }
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        items.forEach(function (it) { if (it.cv === en.target) it.seen = en.isIntersecting; });
      });
    }, { rootMargin: '80px' });
    items.forEach(function (it) { io.observe(it.cv); });
  } else {
    items.forEach(function (it) { it.seen = true; });
  }

  function visible(it) {
    if (!it.seen) return false;
    /* in the 3D ring, cards turned away from the viewer are skipped */
    return !(it.slot && it.slot.style.opacity && parseFloat(it.slot.style.opacity) < 0.15);
  }

  if (reduce) {
    var once = function () { items.forEach(function (it) { draw(it, 2.4); }); };
    once();
    window.addEventListener('resize', once);
    window.addEventListener('load', once);
    return;
  }
  var flip = false;
  (function loop(now) {
    requestAnimationFrame(loop);
    flip = !flip;
    if (flip || document.hidden) return;
    var t = now / 1000;
    for (var i = 0; i < items.length; i++) if (visible(items[i])) draw(items[i], t);
  })(0);
})();
