/**
 * DrySense motion layer (GSAP).
 * Home, product and shop pages only. Calm, premium easing; nothing loops.
 *
 * - Above-the-fold elements are pre-hidden by the `ds-anim-pre` class (set inline in
 *   <head>). It is removed in the same frame the intro tweens start, so there is no
 *   flash; if GSAP never loads, the head script removes it after a timeout.
 * - Shoppers with "reduce motion" get no animation at all.
 */
(function () {
  var root = document.documentElement;
  var reveal = function () {
    root.classList.remove('ds-anim-pre');
  };

  if (!window.gsap || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    reveal();
    return;
  }

  var gsap = window.gsap;
  window.__dsMotion = true;

  var EASE = 'power3.out';
  var $ = function (selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  };

  /** Split an element's text into masked words for a line-by-line rise */
  function splitWords(el) {
    if (!el || el.dataset.dsSplit) return [];
    el.dataset.dsSplit = 'true';
    var words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    return words.map(function (word, i) {
      var mask = document.createElement('span');
      mask.className = 'ds-word';
      var inner = document.createElement('span');
      inner.className = 'ds-word__inner';
      inner.textContent = word;
      mask.appendChild(inner);
      el.appendChild(mask);
      if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
      return inner;
    });
  }

  /**
   * Run `play` once when `trigger` scrolls into view. Uses IntersectionObserver, so it works
   * whichever element scrolls (the theme scrolls .page-wrapper on desktop, the window on mobile).
   * Elements already above the viewport (e.g. after an anchor jump) are shown instantly.
   */
  var pendingReveals = [];
  var revealWatch = 0;

  function onReveal(trigger, play) {
    if (!trigger) return;
    var item = { trigger: trigger, done: false, io: null };
    item.run = function (instant) {
      if (item.done) return;
      item.done = true;
      if (item.io) item.io.disconnect();
      play(instant);
    };
    pendingReveals.push(item);
    if (typeof window.IntersectionObserver === 'function') {
      try {
        item.io = new IntersectionObserver(
          function (entries) {
            var entry = entries[0];
            if (!entry) return;
            var above = entry.boundingClientRect.bottom < 0;
            if (entry.isIntersecting || above) item.run(above);
          },
          { rootMargin: '0px 0px -12% 0px', threshold: 0 },
        );
        item.io.observe(trigger);
      } catch (e) {
        item.io = null; // the scroll/interval safety net below still reveals it
      }
    }
    startRevealWatch();
  }

  /* Safety net, independent of IntersectionObserver: on scroll (window or .page-wrapper) and
     once a second, play any pending reveal whose trigger is on screen or already above it. */
  function checkReveals() {
    var vh = window.innerHeight;
    pendingReveals = pendingReveals.filter(function (item) {
      if (item.done) return false;
      var rect = item.trigger.getBoundingClientRect();
      if (rect.bottom < 0) item.run(true);
      else if (rect.top < vh * 0.88 && rect.bottom > 0) item.run(false);
      return !item.done;
    });
    if (!pendingReveals.length && revealWatch) {
      clearInterval(revealWatch);
      revealWatch = 0;
    }
  }

  function startRevealWatch() {
    if (revealWatch) return;
    revealWatch = setInterval(checkReveals, 1000);
    var onScrollCheck = function () {
      requestAnimationFrame(checkReveals);
    };
    if (!startRevealWatch.bound) {
      startRevealWatch.bound = true;
      window.addEventListener('scroll', onScrollCheck, { passive: true });
      var pw = document.querySelector('.page-wrapper');
      if (pw) pw.addEventListener('scroll', onScrollCheck, { passive: true });
    }
  }

  /** Fade + rise a group of elements when they scroll into view */
  function riseOnScroll(targets, opts) {
    targets = targets.filter(Boolean);
    if (!targets.length) return;
    opts = opts || {};
    var y = opts.y === undefined ? 32 : opts.y;
    gsap.set(targets, { autoAlpha: 0, y: y });
    onReveal(opts.trigger || targets[0], function (instant) {
      gsap.to(targets, {
        autoAlpha: 1,
        y: 0,
        duration: instant ? 0 : opts.duration || 0.9,
        ease: opts.ease || EASE,
        stagger: instant ? 0 : opts.stagger || 0.08,
        clearProps: y ? 'transform' : '',
      });
    });
  }

  /* ---------------- Intro (above the fold) ---------------- */
  var intro = gsap.timeline({ defaults: { ease: EASE } });

  // Home hero
  var hero = document.querySelector('.ds-hero');
  if (hero) {
    var headingWords = [];
    $('.ds-hero__heading-desktop, .ds-hero__heading-mobile', hero).forEach(function (el) {
      headingWords = headingWords.concat(splitWords(el));
    });
    var heroMedia = $('.ds-hero__media .ds-media', hero);

    reveal();
    intro
      .fromTo(
        heroMedia,
        { clipPath: 'inset(8% 8% 8% 8% round 24px)', scale: 1.06, autoAlpha: 0 },
        {
          clipPath: 'inset(0% 0% 0% 0% round 24px)',
          scale: 1,
          autoAlpha: 1,
          duration: 1.3,
          clearProps: 'clipPath,scale',
        },
        0,
      )
      .from(headingWords, { yPercent: 110, duration: 1, stagger: 0.05 }, 0.1)
      .from($('.ds-hero__eyebrow, .ds-hero__text', hero), { y: 16, autoAlpha: 0, duration: 0.8 }, 0.45)
      .from($('.ds-hero__actions > *', hero), { y: 16, autoAlpha: 0, duration: 0.7, stagger: 0.08 }, 0.6)
      .from($('.ds-hero__trust li', hero), { y: 12, autoAlpha: 0, duration: 0.6, stagger: 0.06 }, 0.75);

    // (hero image parallax is built with the scroll animations below, on the right scroller)
  }

  // Product page buy box
  var pdp = document.querySelector('.ds-intro');
  if (pdp) {
    reveal();
    var gallery = document.querySelector('media-gallery');
    if (gallery) intro.from(gallery, { autoAlpha: 0, y: 24, duration: 1 }, 0);
    var title = pdp.querySelector('.ds-intro__title');
    var titleWords = splitWords(title);
    intro
      .from($('.ds-intro__eyebrow', pdp), { y: 10, autoAlpha: 0, duration: 0.6 }, 0.05)
      .from(titleWords, { yPercent: 110, duration: 0.9, stagger: 0.05 }, 0.1)
      .from(
        $('.ds-intro > *:not(.ds-intro__title-row):not(.ds-intro__eyebrow)', document),
        { y: 14, autoAlpha: 0, duration: 0.7, stagger: 0.06 },
        0.3,
      )
      .from($('.ds-tier'), { x: 24, autoAlpha: 0, duration: 0.7, stagger: 0.08 }, 0.45)
      .from($('.ds-buy'), { y: 12, autoAlpha: 0, duration: 0.6 }, 0.6);
  }

  reveal();

  /* ---------------- Scroll animations ----------------
     No ScrollTrigger: on desktop the theme scrolls `.page-wrapper` with smooth scrolling,
     and ScrollTrigger's refresh (run as lazy images load) briefly resets the scroll position,
     which made the page jump. Reveals use IntersectionObserver (see onReveal); parallax is
     computed from each element's on-screen position, so it never touches scrolling. */
  var parallaxItems = [];

  /** Parallax drift for an image inside a clipped media box */
  function parallax(img, trigger, amount, scale, mode) {
    if (!img || !trigger) return;
    parallaxItems.push({ img: img, trigger: trigger, amount: amount, scale: scale, mode: mode || 'through' });
  }

  function updateParallax() {
    var vh = window.innerHeight;
    for (var i = 0; i < parallaxItems.length; i++) {
      var item = parallaxItems[i];
      var rect = item.trigger.getBoundingClientRect();
      if (rect.bottom < -50 || rect.top > vh + 50) continue;
      // 'through': from entering at the bottom to leaving at the top; 'leave': from page top until it leaves
      var progress = item.mode === 'leave' ? -rect.top / rect.height : (vh - rect.top) / (vh + rect.height);
      progress = Math.min(1, Math.max(0, progress));
      gsap.set(item.img, { yPercent: -item.amount + progress * item.amount * 2, scale: item.scale, force3D: true });
    }
  }

  $('.ds-hero__media .ds-media').forEach(function (media) {
    parallax(media.querySelector('img'), media, 4, 1.08, 'leave');
  });
  $('.ds-split .ds-media').forEach(function (media) {
    parallax(media.querySelector('img'), media, 5, 1.1);
  });
  $('.ds-lifestyle').forEach(function (block) {
    parallax(block.querySelector('.ds-media img'), block, 8, 1.15);
  });

  if (parallaxItems.length) {
    var ticking = false;
    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        updateParallax();
      });
    };
    var pageWrapper = document.querySelector('.page-wrapper');
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    if (pageWrapper) pageWrapper.addEventListener('scroll', onScroll, { passive: true });
    updateParallax();
  }

  // Section headings
  $('.ds-head').forEach(function (head) {
    riseOnScroll($('.ds-eyebrow, .ds-h1, .ds-h2, .ds-lead', head), { trigger: head, stagger: 0.1 });
  });

  // Product cards
  $('.ds-products__grid').forEach(function (grid) {
    riseOnScroll($('.ds-card', grid), { trigger: grid, y: 60, stagger: 0.15, duration: 1.1 });
  });

  // Comparison: rows only fade (transforms on <tr> break table layout in some browsers)
  $('.ds-table').forEach(function (table) {
    riseOnScroll($('tbody tr', table), { trigger: table, y: 0, stagger: 0.06, duration: 0.6, ease: 'power1.out' });
  });
  riseOnScroll($('.ds-compare__actions > *'), { stagger: 0.1 });

  // Split sections (benefits, final call to action)
  $('.ds-split').forEach(function (split) {
    var media = split.querySelector('.ds-media');
    if (media) {
      gsap.set(media, { clipPath: 'inset(10% 10% 10% 10% round 24px)', autoAlpha: 0 });
      onReveal(split, function (instant) {
        gsap.to(media, {
          clipPath: 'inset(0% 0% 0% 0% round 24px)',
          autoAlpha: 1,
          duration: instant ? 0 : 1.2,
          ease: EASE,
          clearProps: 'clipPath',
        });
      });
    }
    // Direct content only, so nested items are never animated twice
    var copy = split.querySelector(':scope > div:not(.ds-media)');
    if (copy) {
      riseOnScroll(
        $(':scope > *, .ds-benefit', copy).filter(function (el) {
          return !el.classList.contains('ds-benefits__list');
        }),
        { trigger: split, stagger: 0.1 },
      );
    }
  });

  // How it works: steps rise, markers pop
  $('.ds-steps').forEach(function (steps) {
    var items = $('.ds-step', steps);
    var markers = $('.ds-step__marker', steps);
    gsap.set(items, { autoAlpha: 0, y: 40 });
    gsap.set(markers, { scale: 0.4 });
    onReveal(steps, function (instant) {
      gsap.to(items, {
        autoAlpha: 1,
        y: 0,
        duration: instant ? 0 : 0.9,
        ease: EASE,
        stagger: instant ? 0 : 0.15,
        clearProps: 'transform',
      });
      gsap.to(markers, {
        scale: 1,
        duration: instant ? 0 : 0.8,
        ease: 'back.out(2)',
        stagger: instant ? 0 : 0.15,
        clearProps: 'transform',
      });
    });
  });

  // Lifestyle text
  $('.ds-lifestyle').forEach(function (block) {
    riseOnScroll($('.ds-h2, .ds-lead', block), { trigger: block });
  });

  // Reviews, guarantee, FAQ, social proof, customer videos
  $('.ds-reviews__grid').forEach(function (grid) {
    riseOnScroll($('.ds-review', grid), { trigger: grid, y: 40, stagger: 0.12 });
  });
  $('.ds-guarantee').forEach(function (el) {
    riseOnScroll([el], { y: 24 });
  });
  $('.ds-faq').forEach(function (faq) {
    riseOnScroll($('details', faq), { trigger: faq, y: 16, stagger: 0.05, duration: 0.6 });
  });
  $('.ds-social__track').forEach(function (track) {
    riseOnScroll($('.ds-social__item', track), { trigger: track, y: 40, stagger: 0.12 });
  });
  $('.ds-ugc__track').forEach(function (track) {
    riseOnScroll($('.ds-ugc__item', track), { trigger: track, y: 40, stagger: 0.08 });
  });

  // Product page details
  $('.ds-pdp-delivery__steps').forEach(function (list) {
    riseOnScroll($('li', list), { trigger: list, y: 16, stagger: 0.12 });
  });
  $('.ds-pdp-assurance').forEach(function (list) {
    riseOnScroll($('li', list), { trigger: list, y: 16, stagger: 0.08 });
  });

  /* ---------------- Magnetic primary buttons (mouse only) ---------------- */
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    $('.ds-btn--primary, .ds-buy').forEach(function (btn) {
      var xTo = gsap.quickTo(btn, 'x', { duration: 0.4, ease: 'power3.out' });
      var yTo = gsap.quickTo(btn, 'y', { duration: 0.4, ease: 'power3.out' });
      btn.addEventListener('pointermove', function (e) {
        var r = btn.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * 0.15);
        yTo((e.clientY - (r.top + r.height / 2)) * 0.25);
      });
      btn.addEventListener('pointerleave', function () {
        xTo(0);
        yTo(0);
      });
    });
  }
})();
