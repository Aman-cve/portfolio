(function () {
  var root = document.documentElement;
  root.classList.add('js');
  function mq(q) { return !!(window.matchMedia && window.matchMedia(q).matches); }
  var reduce = mq('(prefers-reduced-motion: reduce)');
  var finePointer = mq('(hover: hover) and (pointer: fine)');
  var hero = document.querySelector('.hero');

  // Footer year
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  // Sample-content note (remembered per browser)
  var note = document.getElementById('sampleNote');
  var noteClose = document.getElementById('sampleClose');
  try { if (localStorage.getItem('sampleNoteHidden') === '1' && note) note.hidden = true; } catch (e) {}
  if (noteClose) noteClose.addEventListener('click', function () {
    if (note) note.hidden = true;
    try { localStorage.setItem('sampleNoteHidden', '1'); } catch (e) {}
  });

  // Mobile menu
  var burger = document.getElementById('burger');
  var menu = document.getElementById('mobileMenu');
  function setMenu(open) {
    if (!burger || !menu) return;
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.hidden = !open;
    document.body.style.overflow = open ? 'hidden' : '';
  }
  if (burger && menu) {
    burger.addEventListener('click', function () { setMenu(menu.hidden); });
    menu.addEventListener('click', function (e) { if (e.target.tagName === 'A') setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
  }

  // Entrance animations hand over to the base styles when they finish
  document.querySelectorAll('.hero__intro, .hero__photo, .hero__stats, .hero__word, .hero__foot').forEach(function (el) {
    el.addEventListener('animationend', function (e) { if (e.target === el) el.classList.add('is-done'); });
  });

  // Name reveals letter by letter
  var nameSpan = document.querySelector('.hero__name > span');
  if (nameSpan && !reduce) {
    var text = nameSpan.textContent;
    nameSpan.setAttribute('aria-label', text);
    nameSpan.textContent = '';
    text.split('').forEach(function (ch, i) {
      var s = document.createElement('span');
      s.className = 'ltr';
      s.setAttribute('aria-hidden', 'true');
      s.style.setProperty('--i', String(i));
      s.textContent = ch === ' ' ? ' ' : ch;
      nameSpan.appendChild(s);
    });
  }

  // Section headings split into masked lines that slide up when revealed
  document.querySelectorAll('.section-head h2, .about__text h2, .contact__big').forEach(function (h) {
    var parts = h.innerHTML.split(/<br\s*\/?>/i);
    h.innerHTML = parts.map(function (p, i) {
      return '<span class="line"><span class="line__in" style="--l:' + i + '">' + p + '</span></span>';
    }).join('');
  });

  // Count-up stats (start once the loader has lifted)
  function fmt(n, d) { return d ? n.toFixed(d) : Math.round(n).toLocaleString('en-IN'); }
  var counters = document.querySelectorAll('.count');
  function runCounter(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var dec = parseInt(el.getAttribute('data-decimals'), 10) || 0;
    if (isNaN(target)) return;
    if (reduce) { el.textContent = fmt(target, dec); return; }
    var start = null, dur = 1600;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      var eased = 1 - Math.pow(1 - p, 4);
      el.textContent = fmt(target * eased, dec);
      if (p < 1) requestAnimationFrame(step);
    }
    el.textContent = '0';
    requestAnimationFrame(step);
    setTimeout(function () { el.textContent = fmt(target, dec); }, dur + 200);
  }
  function startCounters() {
    if (!counters.length || !('IntersectionObserver' in window)) return;
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { runCounter(en.target); cio.unobserve(en.target); }
      });
    }, { threshold: 0.4 });
    counters.forEach(function (c) { cio.observe(c); });
  }

  // Loader: counts up while the 3D scene boots, then lifts and starts the hero entrance
  var loader = document.getElementById('loader');
  var loaderPct = document.getElementById('loaderPct');
  var loaderBar = document.getElementById('loaderBar');
  var isLoaded = false;
  function finish() {
    if (isLoaded) return;
    isLoaded = true;
    root.classList.add('is-loaded');
    if (loader) {
      loader.classList.add('is-out');
      setTimeout(function () { loader.hidden = true; }, 1000);
    }
    setTimeout(startCounters, 500);
  }
  if (!loader || reduce) {
    finish();
  } else {
    var sceneOk = !!window.__sceneReady, t0 = performance.now(), prog = 0;
    window.addEventListener('scene-ready', function () { sceneOk = true; });
    (function tickLoader(now) {
      if (isLoaded) return;
      var el = now - t0;
      if (el > 4500) sceneOk = true;
      var target = sceneOk && el > 700 ? 100 : Math.min(88, el / 11);
      prog += (target - prog) * 0.14;
      if (target === 100 && prog > 99.2) prog = 100;
      if (loaderPct) loaderPct.textContent = String(Math.round(prog));
      if (loaderBar) loaderBar.style.transform = 'scaleX(' + (prog / 100).toFixed(3) + ')';
      if (prog >= 100) { setTimeout(finish, 120); return; }
      requestAnimationFrame(tickLoader);
    })(t0);
    setTimeout(finish, 6000);
  }

  // Reveal on scroll; if nothing has revealed long after load, show everything
  var reveals = document.querySelectorAll('.reveal');
  function showAll() { reveals.forEach(function (r) { r.classList.add('is-in'); }); }
  if (reduce || !('IntersectionObserver' in window)) {
    showAll();
  } else {
    var seen = 0;
    var rio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { seen++; en.target.classList.add('is-in'); rio.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (r) { rio.observe(r); });
    window.addEventListener('scroll', function once() {
      window.removeEventListener('scroll', once);
      setTimeout(function () { if (!seen) showAll(); }, 4000);
    }, { passive: true });
  }

  // Highlight the section in view
  var links = document.querySelectorAll('.nav__links a');
  var sections = [];
  links.forEach(function (a) {
    var s = document.querySelector(a.getAttribute('href'));
    if (s) sections.push({ link: a, el: s });
  });
  if (sections.length && 'IntersectionObserver' in window) {
    var sio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var match = sections.filter(function (s) { return s.el === en.target; })[0];
        if (!match) return;
        if (en.isIntersecting) {
          links.forEach(function (a) { a.removeAttribute('aria-current'); });
          match.link.setAttribute('aria-current', 'true');
        }
      });
    }, { rootMargin: '-40% 0px -50% 0px' });
    sections.forEach(function (s) { sio.observe(s.el); });
  }

  // Copy email
  var copyBtn = document.getElementById('copyEmail');
  var emailText = document.getElementById('emailText');
  if (copyBtn && emailText) {
    copyBtn.addEventListener('click', function () {
      var value = emailText.textContent.trim();
      function done(ok) {
        copyBtn.textContent = ok ? 'Copied' : 'Select it';
        setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1600);
      }
      function fallback() {
        try {
          var range = document.createRange();
          range.selectNodeContents(emailText);
          var sel = window.getSelection();
          sel.removeAllRanges(); sel.addRange(range);
        } catch (e) {}
        done(false);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(function () { done(true); }, fallback);
      } else { fallback(); }
    });
  }

  // Wandering pointers: each one glides to a new spot, pauses, sometimes "clicks", then moves again
  var pointers = Array.prototype.slice.call(document.querySelectorAll('.pointer'));
  pointers.forEach(function (p, i) { p.style.setProperty('--i', String(i)); });
  if (hero && pointers.length && !reduce) {
    var parked = [];
    function spot() {
      var narrow = window.innerWidth <= 760;
      var x = narrow ? 0.08 + Math.random() * 0.82 : 0.36 + Math.random() * 0.58;
      var y = narrow ? 0.05 + Math.random() * 0.85 : 0.06 + Math.random() * 0.84;
      return { x: (x * 100).toFixed(1) + '%', y: (y * 100).toFixed(1) + '%' };
    }
    function wander(p) {
      var to = spot();
      var dur = 1.1 + Math.random() * 1.5;
      p.style.setProperty('--pd', dur.toFixed(2) + 's');
      p.style.setProperty('--x', to.x);
      p.style.setProperty('--y', to.y);
      setTimeout(function () {
        if (Math.random() < 0.4) {
          p.classList.add('is-click');
          setTimeout(function () { p.classList.remove('is-click'); }, 160);
        }
        setTimeout(function () { if (!document.hidden) wander(p); else parked.push(p); }, 500 + Math.random() * 1400);
      }, dur * 1000);
    }
    pointers.forEach(function (p, i) { setTimeout(function () { wander(p); }, 2200 + i * 450); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && parked.length) { var list = parked; parked = []; list.forEach(wander); }
    });
  }

  // Hero parallax for the pointers (and the fallback wordmark when WebGL is off)
  var heroMx = 0, heroMy = 0;
  if (hero && !reduce && finePointer) {
    hero.addEventListener('mousemove', function (e) {
      var r = hero.getBoundingClientRect();
      heroMx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      heroMy = ((e.clientY - r.top) / r.height - 0.5) * 2;
      hero.style.setProperty('--mx', heroMx.toFixed(3));
      hero.style.setProperty('--my', heroMy.toFixed(3));
    });
    hero.addEventListener('mouseleave', function () {
      heroMx = 0; heroMy = 0;
      hero.style.setProperty('--mx', '0');
      hero.style.setProperty('--my', '0');
    });
  }

  // One frame loop: progress bar, marquee lean from scroll speed, the 3D intro panel,
  // and the depth tilt of each project card as it travels up the viewport
  var progress = document.getElementById('progress');
  var marquee = document.getElementById('marquee');
  var intro3d = document.getElementById('intro3d');
  var depthCards = Array.prototype.slice.call(document.querySelectorAll('.project__tilt'));
  // Work gallery: on desktop the cards sit on a 3D ring that turns with scroll
  var gallery = document.getElementById('gallery');
  var galleryRing = document.getElementById('galleryRing');
  var galleryNow = document.getElementById('galleryNow');
  var galleryItems = Array.prototype.slice.call(document.querySelectorAll('.gallery__item'));
  var galleryMQ = window.matchMedia ? window.matchMedia('(min-width: 761px) and (min-height: 520px) and (prefers-reduced-motion: no-preference)') : { matches: false };
  var ringPos = 0, ringShown = -1;
  if (!reduce) {
    var lastY = window.scrollY || 0, lean = 0, lastP = -1, lastLean = 0;
    var panelRx = 0, panelRy = 0, depthY = -1, wide = window.innerWidth > 760;
    window.addEventListener('resize', function () { wide = window.innerWidth > 760; depthY = -1; });
    (function scrollLoop(now) {
      var y = window.scrollY || 0;
      var vh = window.innerHeight;
      if (intro3d && wide && y < vh * 1.2) {
        var t = (now || 0) / 1000;
        var away = Math.min(1, y / vh);
        var ryT = 8 + heroMx * 8 + Math.sin(t * 0.6) * 1.4;
        var rxT = -heroMy * 6 + Math.cos(t * 0.5) * 1 + away * 26;
        panelRx += (rxT - panelRx) * 0.08;
        panelRy += (ryT - panelRy) * 0.08;
        intro3d.style.setProperty('--trx', panelRx.toFixed(2) + 'deg');
        intro3d.style.setProperty('--try', panelRy.toFixed(2) + 'deg');
        intro3d.style.setProperty('--ex', (-Math.sin(panelRy * Math.PI / 180) * 7).toFixed(3));
        intro3d.style.setProperty('--ey', (Math.sin(panelRx * Math.PI / 180) * 7).toFixed(3));
      }
      var ringOn = !!(gallery && galleryRing && galleryMQ.matches);
      if (ringOn) {
        var pin = gallery.firstElementChild, gr = gallery.getBoundingClientRect();
        var span = gallery.offsetHeight - pin.offsetHeight;
        var gp = span > 0 ? Math.max(0, Math.min(1, (68 - gr.top) / span)) : 0;
        var gpos = gp * (galleryItems.length - 1), gi = Math.floor(gpos), gf = gpos - gi;
        // ease inside each step so every card rests in front for a moment
        var want = gi + gf * gf * gf * (gf * (gf * 6 - 15) + 10);
        ringPos += (want - ringPos) * 0.14;
        if (Math.abs(ringPos - ringShown) > 0.0004) {
          ringShown = ringPos;
          galleryRing.style.setProperty('--ring', (-ringPos * 60).toFixed(2) + 'deg');
          galleryItems.forEach(function (el, idx) {
            var d = Math.abs(idx - ringPos);
            el.style.opacity = Math.max(0, Math.min(1, 1.12 - d * 0.62)).toFixed(3);
            el.classList.toggle('is-active', d < 0.5);
          });
          if (galleryNow) galleryNow.textContent = ('0' + (Math.round(ringPos) + 1)).slice(-2);
        }
      } else if (ringShown !== -1) {
        ringShown = -1;
        galleryItems.forEach(function (el) { el.style.opacity = ''; el.classList.remove('is-active'); });
      }
      if (!ringOn && depthCards.length && Math.abs(y - depthY) > 1) {
        depthY = y;
        depthCards.forEach(function (el) {
          var r = el.getBoundingClientRect();
          if (r.bottom < -200 || r.top > vh + 200) return;
          var n = Math.max(-1.2, Math.min(1.2, (r.top + r.height / 2 - vh / 2) / (vh / 2)));
          el.style.setProperty('--srx', (n * 9).toFixed(2) + 'deg');
          el.style.setProperty('--sz', (-Math.abs(n) * 50).toFixed(1) + 'px');
        });
      }
      lean += ((y - lastY) * 0.35 - lean) * 0.12;
      lastY = y;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var p = max > 0 ? Math.min(1, y / max) : 0;
      if (progress && Math.abs(p - lastP) > 0.0005) { progress.style.transform = 'scaleX(' + p.toFixed(4) + ')'; lastP = p; }
      var l = Math.max(-9, Math.min(9, lean));
      if (marquee && Math.abs(l - lastLean) > 0.02) { marquee.style.setProperty('--v', l.toFixed(2)); lastLean = l; }
      if (hero && y < 1200) hero.style.setProperty('--sy', String(Math.round(y)));
      requestAnimationFrame(scrollLoop);
    })();
  }

  if (finePointer && !reduce) {
    // 3D tilt with a glare that tracks the cursor
    document.querySelectorAll('.tilt').forEach(function (el) {
      var max = el.classList.contains('about__photo') ? 6 : 8;
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        el.style.setProperty('--ry', ((px - 0.5) * 2 * max).toFixed(2) + 'deg');
        el.style.setProperty('--rx', ((0.5 - py) * 2 * max).toFixed(2) + 'deg');
        el.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
        el.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
        el.classList.add('is-tilting');
      });
      el.addEventListener('pointerleave', function () {
        el.classList.remove('is-tilting');
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
      });
    });

    // Spotlight across the services grid: every card lights relative to the cursor
    var grid = document.getElementById('servicesGrid');
    if (grid) {
      var cards = grid.querySelectorAll('.service');
      grid.addEventListener('pointermove', function (e) {
        cards.forEach(function (c) {
          var r = c.getBoundingClientRect();
          c.style.setProperty('--sx', (e.clientX - r.left).toFixed(0) + 'px');
          c.style.setProperty('--sy', (e.clientY - r.top).toFixed(0) + 'px');
        });
      });
    }

    // Magnetic buttons
    document.querySelectorAll('.btn, .nav__logo, .contact__email button').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = 'translate3d(' + (dx * 0.22).toFixed(1) + 'px,' + (dy * 0.3).toFixed(1) + 'px,0)';
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    });

    // Custom cursor: a red dot that snaps to the mouse and a ring that eases after it
    var dot = document.createElement('div');
    dot.className = 'cursor-dot';
    var ring = document.createElement('div');
    ring.className = 'cursor-ring';
    var label = document.createElement('span');
    ring.appendChild(label);
    document.body.appendChild(dot);
    document.body.appendChild(ring);
    var mx = -100, my = -100, rx = -100, ry = -100, shown = false;
    document.addEventListener('mousemove', function (e) {
      mx = e.clientX; my = e.clientY;
      if (!shown) { shown = true; rx = mx; ry = my; root.classList.add('has-cursor'); }
      root.classList.remove('cursor-out');
      dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
    });
    document.addEventListener('mouseleave', function () { root.classList.add('cursor-out'); });
    document.addEventListener('mouseenter', function () { root.classList.remove('cursor-out'); });
    (function loop() {
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      ring.style.transform = 'translate3d(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px,0)';
      requestAnimationFrame(loop);
    })();
    document.addEventListener('mouseover', function (e) {
      var t = e.target.closest ? e.target.closest('[data-cursor]') : null;
      var l = e.target.closest ? e.target.closest('a, button') : null;
      ring.classList.toggle('is-active', !!t);
      ring.classList.toggle('is-link', !t && !!l);
      if (t) label.textContent = t.getAttribute('data-cursor');
    });
    document.addEventListener('mouseout', function (e) {
      if (!e.relatedTarget) { ring.classList.remove('is-active', 'is-link'); }
    });
  }
})();
