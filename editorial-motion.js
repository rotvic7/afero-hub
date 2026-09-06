(function () {
  'use strict';

  var context = null;
  var cleanups = [];

  function reduced() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* Divide um título em palavras pra cair uma a uma, mesma técnica do guia
     do funil (guia-funil-afero-hub.html). Palavra, não caractere: em
     português a palavra acentuada quebra mal letra a letra, e o título
     precisa continuar legível por leitor de tela, então o texto original
     vira aria-label e os pedaços ficam escondidos da acessibilidade.
     Idempotente: se o título já foi dividido (troca de aba pra uma vista já
     vista antes), devolve os spans existentes em vez de dividir de novo. */
  function dividirEmPalavras(el) {
    var existentes = el.querySelectorAll('.word');
    if (existentes.length) return Array.prototype.slice.call(existentes);
    var original = el.textContent.trim();
    el.setAttribute('aria-label', original);
    var pedacos = [];
    Array.prototype.slice.call(el.childNodes).forEach(function (no) {
      if (no.nodeType === 3) {
        var frag = document.createDocumentFragment();
        no.textContent.split(/(\s+)/).forEach(function (parte) {
          if (!parte) return;
          if (/^\s+$/.test(parte)) { frag.appendChild(document.createTextNode(parte)); return; }
          var span = document.createElement('span');
          span.className = 'word';
          span.textContent = parte;
          frag.appendChild(span);
          pedacos.push(span);
        });
        el.replaceChild(frag, no);
      } else if (no.nodeType === 1) {
        no.classList.add('word');
        pedacos.push(no);
      }
    });
    el.setAttribute('aria-hidden', 'false');
    Array.prototype.forEach.call(el.querySelectorAll('.word'), function (w) { w.setAttribute('aria-hidden', 'true'); });
    return pedacos;
  }

  function canParallax() {
    return window.matchMedia('(min-width: 768px) and (pointer: fine)').matches && !reduced();
  }

  function destroy() {
    while (cleanups.length) cleanups.pop()();
    if (context) context.revert();
    context = null;
  }

  function bindVisibility() {
    function handleVisibility() {
      if (!window.gsap) return;
      if (document.hidden) window.gsap.globalTimeline.pause();
      else window.gsap.globalTimeline.resume();
    }
    document.addEventListener('visibilitychange', handleVisibility);
    cleanups.push(function () { document.removeEventListener('visibilitychange', handleVisibility); });
  }

  function bindParallax() {
    var surface = document.querySelector('.panel-onboarding');
    var map = document.querySelector('.live-map-shell');
    if (!surface || !map || !canParallax()) return;
    var moveX = window.gsap.quickTo(map, 'x', { duration: .8, ease: 'power3.out' });
    var moveY = window.gsap.quickTo(map, 'y', { duration: .8, ease: 'power3.out' });
    function move(event) {
      var box = surface.getBoundingClientRect();
      moveX(((event.clientX - box.left) / box.width - .5) * 12);
      moveY(((event.clientY - box.top) / box.height - .5) * 8);
    }
    function reset() { moveX(0); moveY(0); }
    surface.addEventListener('pointermove', move);
    surface.addEventListener('pointerleave', reset);
    cleanups.push(function () {
      surface.removeEventListener('pointermove', move);
      surface.removeEventListener('pointerleave', reset);
    });
  }

  function init() {
    destroy();
    if (!window.gsap || reduced()) return;
    if (window.ScrollTrigger) window.gsap.registerPlugin(window.ScrollTrigger);

    context = window.gsap.context(function () {
      window.gsap.from('.onboarding-kicker', { y: 16, opacity: 0, duration: .65, ease: 'power3.out' });
      window.gsap.from('.onboarding-title', { y: 36, opacity: 0, duration: .95, delay: .08, ease: 'power3.out' });
      window.gsap.from('.onboarding-desc, .onboarding-actions, .onboarding-note', {
        y: 22,
        opacity: 0,
        duration: .72,
        stagger: .08,
        delay: .18,
        ease: 'power3.out'
      });
      window.gsap.from('.live-map-shell', {
        y: 24,
        opacity: 0,
        duration: .9,
        delay: .16,
        ease: 'power3.out'
      });
      window.gsap.from('.hunt-stage-card', {
        opacity: 0,
        duration: .82,
        stagger: .07,
        delay: .2,
        ease: 'power3.out'
      });

      if (window.ScrollTrigger) {
        /* .sec-head do Painel/Catálogo não passa pela troca de aba (fica dentro
           de #view-painel, que revealView() ignora de propósito), então é o
           único cabeçalho de seção que precisa de entrada por rolagem. As
           demais vistas (Comece Aqui, Arsenal) já ganham a cascata completa
           via revealView() quando a aba abre. */
        document.querySelectorAll('#view-painel .sec-head').forEach(revealSectionHead);

        /* .drop é o bloco de importar CSV: tem instrução de uso ("Importe o
           arquivo _INFOPRODUTOS_BR.csv") que o usuário pode precisar ler no
           instante em que rola até ali. Um fade de opacidade pego a meio
           caminho deixa o texto cinza-claro ilegível — foi relatado como
           bug pelo Victor. Fora da lista: some daqui, não anima mais. */
        document.querySelectorAll('.filters, .local-projects, .gphase').forEach(function (element) {
          window.gsap.from(element, {
            y: 28,
            opacity: 0,
            duration: .78,
            ease: 'power3.out',
            scrollTrigger: { trigger: element, start: 'top 90%', once: true }
          });
        });

        /* Cards entram em lote: a linha inteira sobe junta, sem cascata longa.
           .stat fica de fora: é dado (contagem real da base), não elemento
           decorativo, e um número pego a meio fade lê como "quebrado" —
           mesmo motivo do .drop acima. */
        window.ScrollTrigger.batch('.agent, .startcard, .gstep, .offer', {
          start: 'top 94%',
          once: true,
          onEnter: function (batch) {
            window.gsap.from(batch, {
              y: 20,
              opacity: 0,
              duration: .62,
              stagger: .055,
              ease: 'power3.out',
              overwrite: true
            });
          }
        });

        /* Trilho "Como a decisão avança": cada bolinha acende quando aquele
           passo entra na tela, mesmo padrão do trilho de 5 etapas do guia
           do funil (lá é vertical e contínuo; aqui são 4 marcos soltos, mas
           a lógica de acender por rolagem é a mesma). */
        document.querySelectorAll('.flowstep').forEach(function (passo) {
          window.ScrollTrigger.create({
            trigger: passo,
            start: 'top 85%',
            onEnter: function () { passo.classList.add('lit'); },
            onLeaveBack: function () { passo.classList.remove('lit'); }
          });
        });
      }
    });

    bindVisibility();
    bindParallax();
  }

  /* Cabeçalho de seção fora do fluxo de troca de aba: rótulo desliza, título
     cai palavra a palavra, texto de apoio sobe. Mesma sequência de
     revealView(), só que disparada pela rolagem em vez de pelo clique na
     aba — é o padrão de section reveal do guia do funil. */
  function revealSectionHead(head) {
    if (!head || !window.gsap || reduced()) return;
    var eyebrow = head.querySelector('.eyebrow');
    var titulo = head.querySelector('.sec-title');
    var desc = head.querySelector('.sec-desc');
    var palavras = titulo ? dividirEmPalavras(titulo) : [];
    var linha = window.gsap.timeline({
      defaults: { ease: 'power3.out' },
      scrollTrigger: { trigger: head, start: 'top 85%', once: true }
    });
    if (eyebrow) linha.fromTo(eyebrow, { x: -14, opacity: 0 }, { x: 0, opacity: 1, duration: .45 });
    if (palavras.length) {
      linha.fromTo(palavras, { y: -30, opacity: 0, rotateX: -55 }, {
        y: 0, opacity: 1, rotateX: 0, duration: .68, stagger: .045, clearProps: 'transform'
      }, .1);
    }
    if (desc) linha.fromTo(desc, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: .52 }, .3);
  }

  /* Grade de ofertas: repintada a cada filtro, entra pela ordem de leitura. */
  function revealCards(cards) {
    if (!cards || !cards.length || !window.gsap || reduced()) return;
    window.gsap.fromTo(cards, { y: 14, opacity: 0 }, {
      y: 0,
      opacity: 1,
      duration: .46,
      stagger: { each: .028, from: 'start' },
      ease: 'power2.out',
      overwrite: true,
      clearProps: 'transform,opacity'
    });
  }

  function activateCard(card) {
    if (!card || !window.gsap || reduced()) return;
    window.gsap.fromTo(card, { scale: .985 }, {
      scale: 1.025,
      duration: .52,
      ease: 'back.out(1.5)',
      overwrite: 'auto',
      clearProps: 'scale'
    });
  }

  /* Raio-X: os blocos entram em cascata quando o drawer abre, sem repuxar o slide do painel. */
  function revealXray(container) {
    if (!container || !window.gsap || reduced()) return;
    var blocks = container.querySelectorAll('.xr-hero, .xr-block');
    if (!blocks.length) return;
    window.gsap.fromTo(blocks, { y: 16, opacity: 0 }, {
      y: 0,
      opacity: 1,
      duration: .48,
      stagger: .06,
      delay: .1,
      ease: 'power3.out',
      overwrite: true,
      clearProps: 'transform,opacity'
    });
  }

  /* Troca de aba: a coluna de texto sobe linha a linha e os cards caem em
     cascata curta. Cada aba tem sua própria entrada, então voltar pra aba
     já vista não repete a animação inteira do carregamento. */
  function revealView(view) {
    if (!view || !window.gsap || reduced()) return;
    var titulo = view.querySelector('.sec-head .sec-title');
    var linhas = view.querySelectorAll('.sec-head .eyebrow, .sec-head .intro-lead, .sec-head .sec-desc, .sec-head p');
    var cards = view.querySelectorAll('.intro-facts > li, .triade > .agent');
    var tl = window.gsap.timeline({ defaults: { ease: 'power3.out', overwrite: true } });
    var eyebrow = view.querySelector('.sec-head .eyebrow');
    if (eyebrow) tl.fromTo(eyebrow, { x: -14, opacity: 0 }, { x: 0, opacity: 1, duration: .45, clearProps: 'transform,opacity' }, 0);
    /* Título cai palavra a palavra, mesmo efeito do guia do funil: mais
       presença que um fade simples pra abertura de cada aba. */
    if (titulo) {
      var palavras = dividirEmPalavras(titulo);
      if (palavras.length) {
        tl.fromTo(palavras, { y: -30, opacity: 0, rotateX: -55 }, {
          y: 0, opacity: 1, rotateX: 0, duration: .64, stagger: .045, clearProps: 'transform'
        }, .06);
      }
    }
    var resto = Array.prototype.filter.call(linhas, function (el) { return el !== eyebrow; });
    if (resto.length) {
      tl.fromTo(resto, { y: 18, opacity: 0 }, {
        y: 0,
        opacity: 1,
        duration: .52,
        stagger: .055,
        clearProps: 'transform,opacity'
      }, .3);
    }
    if (cards.length) {
      tl.fromTo(cards, { y: 26, opacity: 0 }, {
        y: 0,
        opacity: 1,
        duration: .58,
        stagger: .07,
        clearProps: 'transform,opacity'
      }, .4);
    }
    return tl;
  }

  /* Quando o usuário pede pra ir a uma seção, ele chega lá pela própria
     vontade e não pode aterrissar em cima de um texto a meio fade. Isto
     encerra na hora qualquer entrada pendente daquele trecho e devolve o
     estado final, incluindo a do ScrollTrigger que ainda não disparou. */
  function settle(container) {
    if (!container || !window.gsap) return;
    /* revealSectionHead() (a queda palavra a palavra do título) não anima
       o .sec-head inteiro de uma vez: anima o eyebrow, cada .word do
       título e o .sec-desc separadamente. Sem incluir esses alvos aqui, a
       versão anterior deste fix só limpava o container e as palavras
       ficavam presas no meio do fade, exatamente o bug de "letras em
       branco" que este settle() existe pra evitar. */
    var alvos = container.querySelectorAll('.sec-head, .sec-head .eyebrow, .sec-title .word, .sec-head .sec-desc, .sec-head .intro-lead, .stat, .drop, .filters, .local-projects, .offer');
    if (!alvos.length) return;
    window.gsap.killTweensOf(alvos);
    window.gsap.set(alvos, { clearProps: 'transform,opacity' });
    if (window.ScrollTrigger) {
      window.ScrollTrigger.getAll().forEach(function (st) {
        if (st.trigger && container.contains(st.trigger)) st.kill(false);
      });
    }
  }

  window.AferoMotion = {
    init: init,
    revealView: revealView,
    settle: settle,
    refresh: init,
    destroy: destroy,
    revealCards: revealCards,
    activateCard: activateCard,
    revealXray: revealXray
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
