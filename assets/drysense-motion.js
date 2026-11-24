/**
 * DrySense motion layer (GSAP + ScrollTrigger).
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

  if (!window.gsap || !window.ScrollTrigger || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    reveal();
    return;
  }

  var gsap = window.gsap;
  gsap.registerPlugin(window.ScrollTrigger);
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
  function onReveal(trigger, play) {
    if (!trigger) return;
    if (!('IntersectionObserver' in window)) return play(true);
    var io = new IntersectionObserver(
      function (entries) {
        var entry = entries[0];
        if (!entry) return;
        var above = entry.boundingClientRect.bottom < 0;
        if (entry.isIntersecting || above) {
          io.disconnect();
          play(above);
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0 }
    );
    io.observe(trigger);
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
        { clipPath: 'inset(0% 0% 0% 0% round 24px)', scale: 1, autoAlpha: 1, duration: 1.3, clearProps: 'clipPath,scale' },
        0
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
      .from($('.ds-intro > *:not(.ds-intro__title-row):not(.ds-intro__eyebrow)', document), { y: 14, autoAlpha: 0, duration: 0.7, stagger: 0.06 }, 0.3)
      .from($('.ds-tier'), { x: 24, autoAlpha: 0, duration: 0.7, stagger: 0.08 }, 0.45)
      .from($('.ds-buy'), { y: 12, autoAlpha: 0, duration: 0.6 }, 0.6);
  }

  reveal();

  /* ---------------- Scroll animations ----------------
     Reveals are triggered by IntersectionObserver (scroller-independent, see onReveal).
     Only the parallax scrubs use ScrollTrigger. The theme scrolls `.page-wrapper` on screens
     >= 990px and the window below that, so they are built per breakpoint with gsap.matchMedia(). */
  var ScrollTrigger = window.ScrollTrigger;
  var wrapper = document.querySelector('.page-wrapper');

  function pageScroller() {
    if (!wrapper) return window;
    var overflowY = window.getComputedStyle(wrapper).overflowY;
    return overflowY === 'auto' || overflowY === 'scroll' ? wrapper : window;
  }

  /** Parallax drift for an image inside a clipped media box */
  function parallax(img, trigger, amount, scale, start, end) {
    if (!img) return;
    gsap.fromTo(
      img,
      { yPercent: -amount, scale: scale },
      {
        yPercent: amount,
        scale: scale,
        ease: 'none',
        scrollTrigger: { trigger: trigger, start: start || 'top bottom', end: end || 'bottom top', scrub: true },
      }
    );
  }

  var mm = gsap.matchMedia();
  mm.add({ desktop: '(min-width: 990px)', mobile: '(max-width: 989px)' }, function () {
    ScrollTrigger.defaults({ scroller: pageScroller() });
    $('.ds-hero__media .ds-media').forEach(function (media) {
      parallax(media.querySelector('img'), media, 4, 1.08, 'top top', 'bottom top');
    });
    $('.ds-split .ds-media').forEach(function (media) {
      parallax(media.querySelector('img'), media, 5, 1.1);
    });
    $('.ds-lifestyle').forEach(function (block) {
      parallax(block.querySelector('.ds-media img'), block, 8, 1.15);
    });
    ScrollTrigger.refresh();
  });

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
        { trigger: split, stagger: 0.1 }
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
      gsap.to(items, { autoAlpha: 1, y: 0, duration: instant ? 0 : 0.9, ease: EASE, stagger: instant ? 0 : 0.15, clearProps: 'transform' });
      gsap.to(markers, { scale: 1, duration: instant ? 0 : 0.8, ease: 'back.out(2)', stagger: instant ? 0 : 0.15, clearProps: 'transform' });
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

  /* Keep parallax positions right as lazy images, fonts and app content change the layout */
  var refreshTimer = 0;
  function queueRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () {
      ScrollTrigger.refresh();
    }, 150);
  }
  document.addEventListener(
    'load',
    function (event) {
      if (event.target && event.target.tagName === 'IMG') queueRefresh();
    },
    true
  );
  window.addEventListener('load', queueRefresh);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueRefresh);

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
