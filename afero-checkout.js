/* ══════════════════════════════════════════════════════════════════
   AFERO · CHECKOUT
   Ponto único de configuração da URL de pagamento.

   COMO USAR: crie o produto na Hotmart/Kiwify/Cakto, copie a URL do
   checkout e cole em CHECKOUT_URL abaixo. Todos os botões [data-checkout]
   de todas as landing pages passam a apontar para ela.

   Enquanto a URL estiver vazia, os botões avisam que a venda ainda não
   abriu e levam ao Instagram, em vez de dar um clique morto que perde
   o visitante sem deixar rastro.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CHECKOUT_URL = '';
  var FALLBACK_URL = 'https://instagram.com/victorneiva.ia';
  var AVISO = 'A venda ainda não abriu. Vou te levar ao Instagram para avisar quando abrir.';

  function aplicar() {
    var botoes = document.querySelectorAll('[data-checkout]');
    for (var i = 0; i < botoes.length; i++) {
      ligar(botoes[i]);
    }
  }

  function ligar(botao) {
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
