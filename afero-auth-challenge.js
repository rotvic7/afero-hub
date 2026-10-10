(function (global) {
  'use strict';
  const key = String((global.AFERO_CLOUD_CONFIG || {}).turnstileSiteKey || '').trim();
  let widget = null, token = '', generation = 0, loading = null;
  const container = document.getElementById('authChallenge');
  function clear() {
    generation++;
    token = '';
    if (widget !== null && global.turnstile) global.turnstile.remove(widget);
    widget = null;
    if (container) { container.replaceChildren(); container.hidden = true; }
  }
  function sdk() {
    if (global.turnstile) return Promise.resolve();
    if (!loading) loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = resolve;
      script.onerror = () => { loading = null; script.remove(); reject(new Error('challenge_unavailable')); };
      document.head.appendChild(script);
    });
    return loading;
  }
  global.AferoAuthChallenge = Object.freeze({
    async show(mode) {
      clear();
      if (!key || !container || !['signin', 'signup', 'recovery-request'].includes(mode)) return;
      const expected = generation;
      container.hidden = false;
      container.textContent = 'Carregando verificação de segurança…';
      try {
        await sdk();
        if (generation !== expected) return;
        container.replaceChildren();
        widget = global.turnstile.render(container, {
          sitekey: key, action: mode === 'recovery-request' ? 'recover' : mode, theme: 'light',
          callback: value => { if (generation === expected) token = value; },
          'expired-callback': () => { token = ''; },
          'error-callback': () => { token = ''; }
        });
      } catch (_) { if (generation === expected) container.textContent = 'A verificação não carregou. Confira sua conexão e reabra este formulário.'; }
    },
    getToken() {
      if (key && !token) throw Object.assign(new Error('Conclua a verificação de segurança.'), { code: 'captcha_required' });
      return token || undefined;
    },
    reset() { token = ''; if (widget !== null && global.turnstile) global.turnstile.reset(widget); },
    clear
  });
})(window);
