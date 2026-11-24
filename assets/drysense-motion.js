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

  /** Fade + rise a group of elements when they scroll into view */
  function riseOnScroll(targets, opts) {
    targets = targets.filter(Boolean);
    if (!targets.length) return;
    opts = opts || {};
    gsap.from(targets, {
      y: opts.y || 32,
      autoAlpha: 0,
      duration: opts.duration || 0.9,
      ease: EASE,
      stagger: opts.stagger || 0.08,
      scrollTrigger: { trigger: opts.trigger || targets[0], start: opts.start || 'top 85%', once: true },
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

    // Gentle parallax on the hero image
    heroMedia.forEach(function (media) {
      var img = media.querySelector('img');
      if (!img) return;
      gsap.fromTo(
        img,
        { yPercent: -4, scale: 1.08 },
        { yPercent: 4, scale: 1.08, ease: 'none', scrollTrigger: { trigger: media, start: 'top top', end: 'bottom top', scrub: true } }
      );
    });
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

  /* ---------------- Scroll reveals (all pages) ---------------- */
  $('.ds-head').forEach(function (head) {
    riseOnScroll($('.ds-eyebrow, .ds-h1, .ds-h2, .ds-lead', head), { trigger: head, stagger: 0.1 });
  });

  // Product cards
  var grid = document.querySelector('.ds-products__grid');
  if (grid) riseOnScroll($('.ds-card', grid), { trigger: grid, y: 60, stagger: 0.15, duration: 1.1 });

  // Comparison rows (table or chart)
  var table = document.querySelector('.ds-table, .ds-vs');
  if (table) {
    riseOnScroll($('tbody tr, .ds-vs__row', table), { trigger: table, y: 14, stagger: 0.05, duration: 0.6 });
  }
  riseOnScroll($('.ds-compare__actions > *'), { stagger: 0.1 });

  // Benefits + split sections
  $('.ds-split').forEach(function (split) {
    var media = split.querySelector('.ds-media');
    if (media) {
      gsap.fromTo(
        media,
        { clipPath: 'inset(10% 10% 10% 10% round 24px)', autoAlpha: 0 },
        {
          clipPath: 'inset(0% 0% 0% 0% round 24px)',
          autoAlpha: 1,
          duration: 1.2,
          ease: EASE,
          clearProps: 'clipPath',
          scrollTrigger: { trigger: split, start: 'top 80%', once: true },
        }
      );
      var img = media.querySelector('img');
      if (img) {
        gsap.fromTo(img, { yPercent: -5, scale: 1.1 }, { yPercent: 5, scale: 1.1, ease: 'none', scrollTrigger: { trigger: media, scrub: true } });
      }
    }
    riseOnScroll($('.ds-benefit, .ds-hero__actions > *, .ds-body', split), { trigger: split, stagger: 0.1 });
  });

  // How it works
  var steps = document.querySelector('.ds-steps');
  if (steps) {
    gsap.from($('.ds-step', steps), {
      y: 40,
      autoAlpha: 0,
      duration: 0.9,
      ease: EASE,
      stagger: 0.15,
      scrollTrigger: { trigger: steps, start: 'top 80%', once: true },
    });
    gsap.from($('.ds-step__marker', steps), {
      scale: 0.4,
      duration: 0.8,
      ease: 'back.out(2)',
      stagger: 0.15,
      scrollTrigger: { trigger: steps, start: 'top 80%', once: true },
    });
  }

  // Full-width lifestyle image
  $('.ds-lifestyle').forEach(function (block) {
    var img = block.querySelector('.ds-media img');
    if (img) {
      gsap.fromTo(img, { yPercent: -8, scale: 1.15 }, { yPercent: 8, scale: 1.15, ease: 'none', scrollTrigger: { trigger: block, scrub: true } });
    }
    riseOnScroll($('.ds-h2, .ds-lead', block), { trigger: block, start: 'top 70%' });
  });

  // Reviews, guarantee, FAQ, social proof, customer videos
  riseOnScroll($('.ds-review'), { y: 40, stagger: 0.12 });
  riseOnScroll($('.ds-guarantee'), { y: 24 });
  riseOnScroll($('.ds-faq details'), { y: 16, stagger: 0.05, duration: 0.6 });
  riseOnScroll($('.ds-social__item'), { y: 40, stagger: 0.12 });
  riseOnScroll($('.ds-ugc__item'), { y: 40, stagger: 0.08 });

  // Product page details
  riseOnScroll($('.ds-pdp-delivery__steps li'), { y: 16, stagger: 0.12 });
  riseOnScroll($('.ds-pdp-assurance li'), { y: 16, stagger: 0.08 });

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

  // Layout can shift once fonts/images settle
  window.addEventListener('load', function () {
    window.ScrollTrigger.refresh();
  });
})();
