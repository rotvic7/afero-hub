(() => {
  'use strict';
  const config = window.AFERO_SALES_CONFIG || {};
  const pixelId = typeof config.metaPixelId === 'string' && /^\d{8,22}$/.test(config.metaPixelId)
    ? config.metaPixelId : '';
  const googleId = typeof config.googleMeasurementId === 'string' && /^G-[A-Z0-9]{6,15}$/.test(config.googleMeasurementId)
    ? config.googleMeasurementId : '';
  if (!pixelId && !googleId) return;

  const storageKey = 'afero.marketing-consent.v1';
  const maxAge = 180 * 24 * 60 * 60 * 1000;
  const banner = document.querySelector('[data-marketing-consent]');
  const settings = document.querySelector('[data-marketing-settings]');
  if (!banner || !settings) return;
  const salesPage = document.body.hasAttribute('data-afero-sales-page');
  const hubPage = document.body.hasAttribute('data-afero-hub-page');
  // Auth links sometimes fall back to the root. Never expose those credentials
  // or explicit personal query parameters to an advertising script.
  let decodedLocation = location.search + location.hash;
  try { decodedLocation = decodeURIComponent(decodedLocation); } catch (_) {}
  const privateParameters = /(?:^|[?&#])(?:access_token|refresh_token|token_hash|id_token|token|code|authorization|session|session_id|jwt|api_key|email|password|cpf|document|phone|telefone|nome)=/i;
  const sensitiveLocation = privateParameters
    .test(decodedLocation);
  let referrer = String(document.referrer || '');
  try { referrer = decodeURIComponent(referrer); } catch (_) {}
  const productionHost = /^(?:www\.)?aferohub\.com\.br$|^afero-hub\.vercel\.app$/i.test(location.hostname);
  const safeLocation = productionHost && !sensitiveLocation && !privateParameters.test(referrer);
  const canTrack = salesPage && safeLocation;
  // The Hub is eligible only after Auth resolves to a public entry. Callback,
  // shared-offer and workspace URLs never reach the advertising SDK.
  const canTrackMeta = () => canTrack || (hubPage && safeLocation &&
    !location.search && !location.hash && document.body.dataset.marketingSurface === 'public');
  let consent = null;
  let initialized = false;
  let viewed = false;
  let returnFocus = false;
  let analyticsConsent = null;
  let googleInitialized = false;
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    const age = Date.now() - stored?.updatedAt;
    if (stored?.version === 1 && ['granted', 'denied'].includes(stored.advertising) &&
        Number.isFinite(age) && age >= 0 && age <= maxAge) {
      consent = stored.advertising;
      if (['granted', 'denied'].includes(stored.analytics)) analyticsConsent = stored.analytics;
    }
  } catch (_) {}

  const product = { content_name: 'Afero Hub', content_type: 'product' };
  if (typeof config.eduzzProductId === 'string' && config.eduzzProductId.trim() &&
      config.eduzzProductId.length <= 120) product.content_ids = [config.eduzzProductId.trim()];

  function grant() {
    if (!pixelId || !canTrackMeta() || consent !== 'granted') return;
    if (!window.fbq) {
      const fbq = function () {
        if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments);
        else fbq.queue.push(arguments);
      };
      fbq.push = fbq;
      fbq.loaded = true;
      fbq.version = '2.0';
      fbq.queue = [];
      window.fbq = fbq;
      if (!window._fbq) window._fbq = fbq;
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js';
      document.head.appendChild(script);
    }
    window.fbq('consent', 'grant');
    if (!initialized) {
      window.fbq('set', 'autoConfig', false, pixelId);
      window.fbq('init', pixelId);
      initialized = true;
    }
    if (!viewed) {
      window.fbq('trackSingle', pixelId, 'PageView');
      if (salesPage) window.fbq('trackSingle', pixelId, 'ViewContent', product);
      else window.fbq('trackSingleCustom', pixelId, 'HubVisit', { content_name: 'Afero Hub' });
      viewed = true;
    }
  }

  function revoke() {
    if (window.fbq && (canTrack || hubPage)) window.fbq('consent', 'revoke');
    try {
      for (const name of ['_fbp', '_fbc']) {
        const expired = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
        document.cookie = expired;
        document.cookie = `${expired}; Domain=${location.hostname}`;
        document.cookie = `${expired}; Domain=.${location.hostname}`;
      }
    } catch (_) {}
  }

  function googleConsent(value) {
    if (!googleId || !canTrack) return;
    window['ga-disable-' + googleId] = value !== 'granted';
    if (value === 'granted') {
      if (!window.gtag) {
        window.dataLayer = window.dataLayer || [];
        window.gtag = function () { window.dataLayer.push(arguments); };
      }
      window.gtag('consent', googleInitialized ? 'update' : 'default', {
        analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'
      });
      if (!googleInitialized) {
        window.gtag('js', new Date());
        window.gtag('config', googleId, {
          page_location: location.href.split(/[?#]/)[0],
          page_referrer: String(document.referrer || '').split(/[?#]/)[0],
          allow_google_signals: false, allow_ad_personalization_signals: false
        });
        const script = document.createElement('script');
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=' + googleId;
        document.head.appendChild(script);
        googleInitialized = true;
      }
    } else if (googleInitialized) {
      window.gtag('consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
      try {
        for (const cookie of String(document.cookie || '').split(';')) {
          const name = cookie.trim().split('=')[0];
          if (!/^_ga(?:_[A-Z0-9]+)?$/.test(name)) continue;
          const expired = name + '=; Max-Age=0; Path=/; SameSite=Lax';
          document.cookie = expired;
          document.cookie = expired + '; Domain=' + location.hostname;
          document.cookie = expired + '; Domain=.' + location.hostname;
        }
      } catch (_) {}
    }
  }

  function apply(value, persist) {
    consent = value;
    if (persist) analyticsConsent = value;
    if (persist) {
      try {
        localStorage.setItem(storageKey, JSON.stringify({
          version: 1, advertising: value, analytics: analyticsConsent, updatedAt: Date.now()
        }));
      } catch (_) {}
    }
    banner.hidden = value !== null && (!googleId || analyticsConsent !== null);
    if (value === 'granted') grant();
    else revoke();
    googleConsent(analyticsConsent);
    if (returnFocus && value !== null) {
      returnFocus = false;
      settings.focus();
    }
  }

  settings.hidden = false;
  settings.addEventListener('click', () => {
    returnFocus = true;
    banner.hidden = false;
    banner.querySelector('[data-marketing-reject]').focus();
  });
  banner.querySelector('[data-marketing-accept]').addEventListener('click', () => apply('granted', true));
  banner.querySelector('[data-marketing-reject]').addEventListener('click', () => apply('denied', true));
  document.addEventListener('afero:checkout', () => {
    if (canTrack && consent === 'granted' && initialized) {
      // The Eduzz checkout owns InitiateCheckout and confirmed Purchase events.
      window.fbq('trackSingleCustom', pixelId, 'CheckoutClick', product);
    }
    if (canTrack && analyticsConsent === 'granted' && googleInitialized) window.gtag('event', 'checkout_click', { content_name: 'Afero Hub' });
  });
  document.addEventListener('afero:marketing-surface', () => {
    if (!hubPage) return;
    if (consent === 'granted' && canTrackMeta()) grant();
    else if (window.fbq) window.fbq('consent', 'revoke');
  });
  window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    try {
      const stored = JSON.parse(event.newValue);
      const age = Date.now() - stored?.updatedAt;
      const valid = stored?.version === 1 && Number.isFinite(age) && age >= 0 && age <= maxAge;
      analyticsConsent = valid && ['granted', 'denied'].includes(stored.analytics) ? stored.analytics : null;
      apply(valid && ['granted', 'denied'].includes(stored.advertising) ? stored.advertising : null, false);
    } catch (_) { analyticsConsent = null; apply(null, false); }
  });
  apply(consent, false);
})();
