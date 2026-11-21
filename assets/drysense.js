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
      lines: [{ merchandiseId: variantId, quantity: 1 }],
      promise: deferred.promise,
    })
  );

  try {
    const res = await fetch(ADD_URL(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        items: [{ id: Number(variantId), quantity: 1 }],
        sections: cartSectionIds(),
      }),
    });
    const data = await res.json();
    const cart = await fetchCart();

    if (!res.ok || data.status) {
      const message = data.description || data.message || 'Could not add to cart.';
      button.dispatchEvent(new CartErrorEvent({ error: message, code: 'INVALID' }));
      deferred.resolve({
        cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart),
        detail: { didError: true, items: cart.items, itemCount: 1, source: 'drysense' },
      });
      setStatus(message, true);
      return;
    }

    deferred.resolve({
      cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart),
      detail: {
        didError: false,
        items: cart.items,
        itemCount: 1,
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
