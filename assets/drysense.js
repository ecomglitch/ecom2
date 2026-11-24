/**
 * DrySense storefront behaviour.
 *
 * - Add to cart for the custom product cards / sticky bar. Uses Shopify's
 *   standard CartLinesUpdateEvent so Horizon's cart drawer, cart count bubble
 *   and Shopify's analytics (Meta / TikTok / Google channel apps) all react
 *   exactly as they do for the theme's own buy buttons.
 * - Sticky mobile add-to-cart bar, shown after the shopper scrolls past the
 *   product section, kept in sync with the selected model.
 */
import { CartLinesUpdateEvent, CartErrorEvent } from '@shopify/events';
import { formatMoney } from '@theme/money-formatting';

// Theme.routes.cart_add_url already ends in .js
const ADD_URL = () => window.Theme?.routes?.cart_add_url ?? '/cart/add.js';

function cartSectionIds() {
  return [...document.querySelectorAll('cart-items-component')]
    .map((el) => el instanceof HTMLElement && el.dataset.sectionId)
    .filter(Boolean)
    .join(',');
}

async function fetchCart() {
  const cartItems = document.querySelector('cart-items-component');
  if (cartItems && 'fetchCartData' in cartItems) {
    await customElements.whenDefined('cart-items-component');
    return cartItems.fetchCartData();
  }
  const res = await fetch(`${window.Theme?.routes?.cart_url ?? '/cart'}.json`, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  return res.json();
}

/**
 * @param {HTMLButtonElement} button
 */
async function addToCart(button) {
  const variantId = button.dataset.variantId;
  if (!variantId || button.getAttribute('aria-busy') === 'true') return;

  // Bundles pass several lines (units + gifts); everything else adds one unit
  /** @type {{id: number, quantity: number, properties?: Record<string, string>}[]} */
  const items = button.dataset.dsItems ? JSON.parse(button.dataset.dsItems) : [{ id: Number(variantId), quantity: 1 }];
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const discountCode = button.dataset.dsDiscount || '';

  const status = document.getElementById(button.dataset.statusId ?? '');
  const setStatus = (text, isError = false) => {
    if (!status) return;
    status.textContent = text;
    status.classList.toggle('ds-cart-status--error', isError);
  };

  button.setAttribute('aria-busy', 'true');
  setStatus('');

  const deferred = CartLinesUpdateEvent.createPromise();
  button.dispatchEvent(
    new CartLinesUpdateEvent({
      action: 'add',
      context: 'product',
      lines: items.map((item) => ({ merchandiseId: String(item.id), quantity: item.quantity })),
      promise: deferred.promise,
    })
  );

  try {
    const res = await fetch(ADD_URL(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        items,
        sections: cartSectionIds(),
      }),
    });
    const data = await res.json();

    // Apply the bundle's discount code (if one is configured) before reading the cart back
    if (res.ok && !data.status && discountCode) {
      await fetch('/cart/update.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ discount: discountCode }),
      }).catch(() => {});
    }

    const cart = await fetchCart();

    if (!res.ok || data.status) {
      const message = data.description || data.message || 'Could not add to cart.';
      button.dispatchEvent(new CartErrorEvent({ error: message, code: 'INVALID' }));
      deferred.resolve({
        cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart),
        detail: { didError: true, items: cart.items, itemCount, source: 'drysense' },
      });
      setStatus(message, true);
      return;
    }

    deferred.resolve({
      cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart),
      detail: {
        didError: false,
        items: cart.items,
        itemCount,
        sections: data.sections,
        source: 'drysense',
        productId: button.dataset.productId,
      },
    });
    setStatus('Added to cart');
    setTimeout(() => setStatus(''), 4000);
  } catch (error) {
    deferred.reject(error);
    setStatus('Network error. Please try again.', true);
  } finally {
    button.removeAttribute('aria-busy');
  }
}

document.addEventListener('click', (event) => {
  const target = /** @type {Element} */ (event.target);
  const button = target.closest?.('[data-ds-add]');
  if (button instanceof HTMLButtonElement) {
    event.preventDefault();
    addToCart(button);
  }
});

/* ---------- Sticky mobile add-to-cart ---------- */
function initSticky(bar) {
  const section = document.getElementById(bar.dataset.watch ?? '');
  const options = bar.querySelectorAll('[data-ds-option]');
  const addButton = bar.querySelector('[data-ds-add]');
  const name = bar.querySelector('[data-ds-name]');
  const price = bar.querySelector('[data-ds-price]');
  const thumbs = bar.querySelectorAll('[data-ds-thumb]');

  const select = (key) => {
    options.forEach((option) => {
      const active = option.dataset.dsOption === key;
      option.setAttribute('aria-pressed', String(active));
      if (!active) return;
      if (name) name.textContent = option.dataset.name ?? '';
      if (price) price.textContent = option.dataset.price ?? '';
      if (addButton) {
        addButton.dataset.variantId = option.dataset.variantId ?? '';
        addButton.dataset.productId = option.dataset.productId ?? '';
        addButton.toggleAttribute('disabled', !option.dataset.variantId);
      }
    });
    thumbs.forEach((thumb) => (thumb.hidden = thumb.dataset.dsThumb !== key));
  };

  options.forEach((option) => option.addEventListener('click', () => select(option.dataset.dsOption)));

  // Pro stays preselected; only an explicit "Choose …" on a card switches the bar
  document.addEventListener('click', (event) => {
    const cta = /** @type {Element} */ (event.target).closest?.('[data-ds-card] [data-ds-add]');
    const card = cta?.closest('[data-ds-card]');
    if (card instanceof HTMLElement && card.dataset.dsCard) select(card.dataset.dsCard);
  });

  if (!section) return;
  const observer = new IntersectionObserver(
    ([entry]) => {
      const passed = !entry.isIntersecting && entry.boundingClientRect.top < 0;
      bar.classList.toggle('is-visible', passed);
      bar.toggleAttribute('inert', !passed);
    },
    { threshold: 0 }
  );
  observer.observe(section);
}

document.querySelectorAll('[data-ds-sticky]').forEach(initSticky);

/* ---------- Product page: delivery timeline ---------- */
// Dates are calculated in the browser so cached pages never show stale dates.
document.querySelectorAll('[data-ds-delivery]').forEach((el) => {
  const fmt = new Intl.DateTimeFormat(document.documentElement.lang || undefined, { month: 'short', day: 'numeric' });
  const addDays = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + Number(n));
    return fmt.format(d);
  };
  const { readyMin, readyMax, shipMin, shipMax } = el.dataset;
  const set = (key, text) => {
    const target = el.querySelector(`[data-ds-date="${key}"]`);
    if (target) target.textContent = text;
  };
  set('ordered', addDays(0));
  set('ready', readyMin === readyMax ? addDays(readyMin) : `${addDays(readyMin)} – ${addDays(readyMax)}`);
  set('delivered', shipMin === shipMax ? addDays(shipMin) : `${addDays(shipMin)} – ${addDays(shipMax)}`);
});

/* ---------- Customer video carousel ---------- */
document.querySelectorAll('[data-ds-ugc-track]').forEach((track) => {
  const wrap = track.closest('.ds-ugc__wrap');
  const step = () => (track.querySelector('.ds-ugc__item')?.getBoundingClientRect().width ?? 300) + 16;
  wrap?.querySelector('[data-ds-ugc-prev]')?.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
  wrap?.querySelector('[data-ds-ugc-next]')?.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));

  // Play muted clips only while visible; respect reduced motion
  const videos = track.querySelectorAll('video');
  if (!videos.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting } of entries) {
        const video = /** @type {HTMLVideoElement} */ (target);
        if (isIntersecting) video.play().catch(() => {});
        else video.pause();
      }
    },
    { threshold: 0.6 }
  );
  videos.forEach((v) => io.observe(v));
});

/* ---------- Product page: bundle picker ---------- */
/** @param {HTMLElement} root */
function initBundles(root) {
  const variants = JSON.parse(root.querySelector('[data-ds-variants]')?.textContent || '[]');
  const byId = new Map(variants.map((v) => [String(v.id), v]));
  const money = (cents) =>
    formatMoney(Math.round(cents), root.dataset.moneyFormat || '{{amount}}', root.dataset.currency || '');
  const tiers = /** @type {HTMLElement[]} */ ([...root.querySelectorAll('[data-ds-tier]')]);
  const button = /** @type {HTMLButtonElement | null} */ (root.querySelector('[data-ds-bundle-button]'));
  const express = root.querySelector('.ds-bundles__express');

  /** Variant id of every item in a tier (each item has a select or hidden input) */
  const unitIds = (tier) =>
    [...tier.querySelectorAll('[data-ds-unit]')].map((el) => /** @type {HTMLInputElement} */ (el).value).filter(Boolean);

  const priceTier = (tier) => {
    const ids = unitIds(tier);
    const discount = Number(tier.dataset.discount) || 0;
    let total = 0;
    let was = 0;
    for (const id of ids) {
      const v = byId.get(String(id));
      if (!v) return null; // unknown variant: keep the server-rendered prices
      total += v.price;
      was += Math.max(v.compare || 0, v.price);
    }
    const now = (total * (100 - discount)) / 100;
    return { ids, now, was, save: was - now };
  };

  const setText = (scope, selector, text, show = true) => {
    const el = scope?.querySelector(selector);
    if (!el) return;
    if (text !== null) el.textContent = text;
    el.hidden = !show;
  };

  /** A tier is in stock when every item's variant is available (unknown variants count as available) */
  const tierInStock = (tier) => {
    const ids = unitIds(tier);
    return ids.length > 0 && ids.every((id) => byId.get(String(id))?.available !== false);
  };

  const render = () => {
    const selected = tiers.find((t) => t.querySelector('input[type="radio"]')?.checked) || tiers[0];
    for (const tier of tiers) {
      tier.classList.toggle('is-selected', tier === selected);
      const inStock = tierInStock(tier);
      tier.classList.toggle('is-soldout', !inStock);
      setText(tier, '[data-ds-tier-soldout]', null, !inStock);
      const p = priceTier(tier);
      if (!p) continue;
      setText(tier, '[data-ds-tier-now]', money(p.now));
      setText(tier, '[data-ds-tier-was]', money(p.was), p.save > 0);
      setText(tier, '[data-ds-tier-save]', null, p.save > 0);
      setText(tier, '[data-ds-tier-save-amount]', money(p.save));
    }
    if (!button || !selected) return;

    const p = priceTier(selected);
    const ids = p ? p.ids : unitIds(selected);
    const counts = new Map();
    ids.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
    const items = [...counts].map(([id, quantity]) => ({ id: Number(id), quantity }));
    (selected.dataset.gifts || '')
      .split(',')
      .filter(Boolean)
      .forEach((id) => items.push({ id: Number(id), quantity: 1, properties: { _bundle_gift: 'Free gift' } }));

    if (ids.length) button.dataset.variantId = ids[0];
    button.dataset.dsItems = JSON.stringify(items);
    button.dataset.dsDiscount = selected.dataset.code || '';
    const soldOut = !tierInStock(selected);
    button.disabled = soldOut;
    setText(button, '.ds-buy__label', soldOut ? 'Sold out' : button.dataset.label || 'Add to cart');
    if (p) setText(button, '[data-ds-buy-price]', money(p.now));

    // Express checkout (Shop Pay etc.) buys the first item at the bundle's item count
    const expressId = /** @type {HTMLInputElement | null | undefined} */ (express?.querySelector('input[name="id"]'));
    const expressQty = /** @type {HTMLInputElement | null | undefined} */ (express?.querySelector('input[name="quantity"]'));
    const first = byId.get(String(ids[0]));
    if (expressId && first?.main) expressId.value = String(ids[0]);
    if (expressQty) expressQty.value = String(ids.filter((id) => byId.get(String(id))?.main).length || 1);

    // Keep the intro price in sync with the first item when it is this product
    const intro = document.querySelector('.ds-intro');
    if (first?.main && intro) {
      const onSale = first.compare > first.price;
      setText(intro, '[data-ds-price]', money(first.price));
      setText(intro, '[data-ds-compare]', onSale ? money(first.compare) : '', onSale);
      setText(intro, '[data-ds-off]', onSale ? `${Math.floor(((first.compare - first.price) * 100) / first.compare)}% OFF` : '', onSale);
      setText(intro, '[data-ds-saving]', onSale ? money(first.compare - first.price) : '');
      setText(intro, '[data-ds-deal]', null, onSale);
    }
  };

  root.addEventListener('change', (event) => {
    // Picking an item's variant selects that bundle
    const tier = /** @type {Element} */ (event.target).closest?.('[data-ds-tier]');
    const radio = /** @type {HTMLInputElement | null | undefined} */ (tier?.querySelector('input[type="radio"]'));
    if (radio && !radio.checked) radio.checked = true;
    render();
  });

  // If the preselected bundle is out of stock, start on the first one that is in stock
  const preselected = tiers.find((t) => t.querySelector('input[type="radio"]')?.checked) || tiers[0];
  if (preselected && !tierInStock(preselected)) {
    const fallback = tiers.find(tierInStock);
    const radio = /** @type {HTMLInputElement | null | undefined} */ (fallback?.querySelector('input[type="radio"]'));
    if (radio) radio.checked = true;
  }
  render();
}

document.querySelectorAll('[data-ds-bundles]').forEach((root) => initBundles(/** @type {HTMLElement} */ (root)));

/* ---------- Product page: mini testimonial slider ---------- */
document.querySelectorAll('[data-ds-mini-reviews]').forEach((root) => {
  const track = /** @type {HTMLElement | null} */ (root.querySelector('[data-ds-mini-track]'));
  const dots = root.querySelector('[data-ds-mini-dots]');
  const slides = track ? [...track.children] : [];
  if (!track || !dots || slides.length < 2) return;

  let index = 0;
  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'ds-mini-reviews__dot';
    dot.setAttribute('aria-label', `Show testimonial ${i + 1}`);
    dot.addEventListener('click', () => go(i));
    dots.appendChild(dot);
  });
  dots.removeAttribute('aria-hidden');

  const go = (i) => {
    index = (i + slides.length) % slides.length;
    track.scrollTo({ left: track.clientWidth * index, behavior: 'smooth' });
    [...dots.children].forEach((d, n) => d.setAttribute('aria-current', String(n === index)));
  };

  // Keep dots in sync when the shopper swipes
  track.addEventListener('scroll', () => {
    const i = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
    if (i !== index) {
      index = i;
      [...dots.children].forEach((d, n) => d.setAttribute('aria-current', String(n === index)));
    }
  }, { passive: true });

  go(0);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let timer = setInterval(() => go(index + 1), 5000);
  const pause = () => clearInterval(timer);
  const resume = () => {
    clearInterval(timer);
    timer = setInterval(() => go(index + 1), 5000);
  };
  root.addEventListener('pointerenter', pause);
  root.addEventListener('pointerleave', resume);
  root.addEventListener('focusin', pause);
  root.addEventListener('focusout', resume);
});

/* ---------- Product page: sticky add-to-cart bar ---------- */
document.querySelectorAll('[data-ds-satc]').forEach((bar) => {
  const main = /** @type {HTMLButtonElement | null} */ (document.querySelector('[data-ds-bundle-button]'));
  const button = /** @type {HTMLButtonElement | null} */ (bar.querySelector('[data-ds-satc-button]'));
  const price = bar.querySelector('[data-ds-satc-price]');
  if (!main || !button) return;

  // Fixed positioning can break inside transformed/sticky ancestors; live at <body> level
  document.body.appendChild(bar);

  // Mirror the main button: price and disabled/sold-out state
  const sync = () => {
    const mainPrice = main.querySelector('[data-ds-buy-price]');
    if (price && mainPrice) price.textContent = mainPrice.textContent;
    button.disabled = main.disabled;
    button.toggleAttribute('aria-busy', main.getAttribute('aria-busy') === 'true');
  };
  new MutationObserver(sync).observe(main, { attributes: true, childList: true, subtree: true, characterData: true });
  sync();

  button.addEventListener('click', () => main.click());

  // Show once the main button is above the viewport
  const observer = new IntersectionObserver(
    ([entry]) => {
      const passed = !entry.isIntersecting && entry.boundingClientRect.top < 0;
      bar.classList.toggle('is-visible', passed);
      bar.toggleAttribute('inert', !passed);
    },
    { threshold: 0 }
  );
  observer.observe(main);
});

/* ---------- Promo bar countdown ---------- */
// Counts down to a real end time; hides the bar when the sale is over.
document.querySelectorAll('[data-ds-countdown]').forEach((bar) => {
  const end = Date.parse(/** @type {HTMLElement} */ (bar).dataset.dsCountdown || '');
  if (Number.isNaN(end)) return;
  const parts = {
    d: bar.querySelector('[data-ds-cd="d"]'),
    h: bar.querySelector('[data-ds-cd="h"]'),
    m: bar.querySelector('[data-ds-cd="m"]'),
    s: bar.querySelector('[data-ds-cd="s"]'),
  };
  const pad = (n) => String(n).padStart(2, '0');
  let timer = 0;

  const tick = () => {
    const left = Math.max(0, end - Date.now());
    if (left === 0) {
      clearInterval(timer);
      // Sale over: remove the offer/timer only (top bar keeps language + Shop)
      bar.setAttribute('hidden', '');
      return;
    }
    const sec = Math.floor(left / 1000);
    if (parts.d) parts.d.textContent = pad(Math.floor(sec / 86400));
    if (parts.h) parts.h.textContent = pad(Math.floor((sec % 86400) / 3600));
    if (parts.m) parts.m.textContent = pad(Math.floor((sec % 3600) / 60));
    if (parts.s) parts.s.textContent = pad(sec % 60);
    bar.classList.add('is-counting');
  };

  tick();
  timer = window.setInterval(tick, 1000);
});

/* ---------- Top bar: language switcher (design only, no translation yet) ---------- */
document.querySelectorAll('[data-ds-lang]').forEach((menu) => {
  const details = /** @type {HTMLDetailsElement} */ (menu);
  const label = details.querySelector('.ds-lang__toggle span');

  details.querySelectorAll('[data-ds-lang-code]').forEach((option) => {
    option.addEventListener('click', () => {
      details.querySelectorAll('[data-ds-lang-code]').forEach((o) => o.removeAttribute('aria-current'));
      option.setAttribute('aria-current', 'true');
      if (label) label.textContent = /** @type {HTMLElement} */ (option).dataset.dsLangCode || '';
      details.open = false;
    });
  });

  document.addEventListener('click', (event) => {
    if (details.open && !details.contains(/** @type {Node} */ (event.target))) details.open = false;
  });
  details.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && details.open) {
      details.open = false;
      details.querySelector('summary')?.focus();
    }
  });
});

/* ---------- Cookie banner (Shopify Customer Privacy API) ---------- */
(() => {
  const banner = /** @type {HTMLElement | null} */ (document.querySelector('[data-ds-cookie]'));
  if (!banner) return;
  const STORE_KEY = 'ds-cookie-choice';
  const remember = (value) => {
    try {
      localStorage.setItem(STORE_KEY, value);
    } catch (e) {}
  };
  const stored = () => {
    try {
      return localStorage.getItem(STORE_KEY);
    } catch (e) {
      return null;
    }
  };

  const hide = () => {
    banner.classList.remove('is-visible');
    setTimeout(() => (banner.hidden = true), 300);
  };
  const show = () => {
    banner.hidden = false;
    requestAnimationFrame(() => banner.classList.add('is-visible'));
  };

  /** @param {boolean} granted */
  const decide = (granted) => {
    const privacy = window.Shopify?.customerPrivacy;
    const consent = { analytics: granted, marketing: granted, preferences: granted, sale_of_data: granted };
    if (privacy?.setTrackingConsent) {
      privacy.setTrackingConsent(consent, () => {});
    }
    remember(granted ? 'accepted' : 'declined');
    hide();
  };

  banner.querySelector('[data-ds-cookie-accept]')?.addEventListener('click', () => decide(true));
  banner.querySelector('[data-ds-cookie-decline]')?.addEventListener('click', () => decide(false));

  const loadFeatures = window.Shopify?.loadFeatures;
  if (typeof loadFeatures === 'function') {
    loadFeatures([{ name: 'consent-tracking-api', version: '0.1' }], (error) => {
      const privacy = window.Shopify?.customerPrivacy;
      if (error || !privacy) {
        if (!stored()) show();
        return;
      }
      // Shopify decides per visitor region whether consent is still needed
      if (privacy.shouldShowBanner()) show();
    });
  } else if (!stored()) {
    show();
  }
})();

/* ---------- DrySense header: mobile menu, scrolled state, header height ---------- */
document.querySelectorAll('[data-ds-header]').forEach((header) => {
  const el = /** @type {HTMLElement} */ (header);
  const toggle = el.querySelector('[data-ds-menu-toggle]');

  const setOpen = (open) => {
    el.classList.toggle('is-open', open);
    toggle?.setAttribute('aria-expanded', String(open));
    toggle?.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  toggle?.addEventListener('click', () => setOpen(!el.classList.contains('is-open')));
  el.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && el.classList.contains('is-open')) {
      setOpen(false);
      /** @type {HTMLElement | null} */ (toggle)?.focus();
    }
  });
  el.querySelectorAll('.ds-header__link').forEach((link) => link.addEventListener('click', () => setOpen(false)));
  window.matchMedia('(min-width: 900px)').addEventListener('change', (e) => e.matches && setOpen(false));

  // Hairline once the page has scrolled. On desktop the theme scrolls .page-wrapper,
  // on mobile the window, so listen to both.
  const wrapper = document.querySelector('.page-wrapper');
  const onScroll = () => el.classList.toggle('is-scrolled', Math.max(window.scrollY, wrapper?.scrollTop || 0) > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  wrapper?.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // The theme's original header publishes these; keep them for sticky offsets elsewhere
  const publish = () => {
    const height = Math.round(el.getBoundingClientRect().height);
    const group = document.getElementById('header-group');
    document.body.style.setProperty('--header-height', `${height}px`);
    document.body.style.setProperty('--header-group-height', `${Math.round(group?.getBoundingClientRect().height || height)}px`);
  };
  new ResizeObserver(publish).observe(el);
  publish();
});
