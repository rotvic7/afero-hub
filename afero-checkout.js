/* ══════════════════════════════════════════════════════════════════
   AFERO · CHECKOUT
   Ponto único de configuração da URL de pagamento.

   A LP atual usa assets/afero-vendas-config.js, com a URL HTTPS da Eduzz.
   CHECKOUT_URL abaixo permanece disponível para as páginas anteriores.

   Enquanto a URL estiver vazia, os botões avisam que a venda ainda não
   abriu e levam ao Instagram, em vez de dar um clique morto que perde
   o visitante sem deixar rastro.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CHECKOUT_URL = '';
  var salesConfig = window.AFERO_SALES_CONFIG;
  var salesUrl = '';
  if (salesConfig && typeof salesConfig.checkoutUrl === 'string') {
    try {
      var parsed = new URL(salesConfig.checkoutUrl);
      if (parsed.protocol === 'https:' && !parsed.username && !parsed.password &&
          !parsed.port && /(^|\.)eduzz\.com$/i.test(parsed.hostname)) salesUrl = parsed.href;
    } catch (_) {}
  }
  var FALLBACK_URL = 'https://instagram.com/victorneiva.ia';
  var AVISO = 'A venda ainda não abriu. Vou te levar ao Instagram para avisar quando abrir.';

  function aplicar() {
    var botoes = document.querySelectorAll('[data-checkout]');
    for (var i = 0; i < botoes.length; i++) {
      ligar(botoes[i]);
    }
  }

  function ligar(botao) {
    if (salesConfig) {
      if (salesUrl) {
        if (botao.tagName === 'A') botao.href = salesUrl;
        botao.removeAttribute('aria-disabled');
      } else {
        botao.setAttribute('aria-disabled', 'true');
        if (botao.tagName === 'A') botao.href = '#acesso';
      }
      botao.addEventListener('click', function (event) {
        if (!salesUrl) {
          event.preventDefault();
          var status = document.querySelector('[data-checkout-status]');
          if (status) status.hidden = false;
          return;
        }
        document.dispatchEvent(new CustomEvent('afero:checkout'));
        if (botao.tagName !== 'A') {
          event.preventDefault();
          window.location.href = salesUrl;
        }
      });
      return;
    }
    var destino = CHECKOUT_URL || FALLBACK_URL;

    /* Um [data-checkout] pode ser <button type="submit">: ele não tem href e
       quem o trata é o handler de formulário da própria página. Aí basta
       navegar no clique, sem inventar atributo que o elemento não usa. */
    if (botao.tagName !== 'A') {
      botao.addEventListener('click', function () {
        if (!CHECKOUT_URL) { try { window.alert(AVISO); } catch (_) {} }
        window.location.href = destino;
      });
      return;
    }

    botao.href = destino;
    if (CHECKOUT_URL) {
      botao.removeAttribute('aria-disabled');
      return;
    }
    botao.setAttribute('rel', 'noopener');
    botao.setAttribute('target', '_blank');
    botao.setAttribute('title', AVISO);
    botao.addEventListener('click', function () {
      try { window.alert(AVISO); } catch (_) {}
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', aplicar);
  else aplicar();
}());
