(() => {
  'use strict';
  const header = document.querySelector('.header');
  const menu = document.querySelector('.menu-toggle');
  const navigation = document.querySelector('#sales-navigation');
  const closeMenu = () => {
    header.classList.remove('menu-open');
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-label', 'Abrir navegação');
  };
  menu.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    header.classList.toggle('menu-open', open);
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'Fechar navegação' : 'Abrir navegação');
  });
  navigation.addEventListener('click', event => {
    if (event.target.closest('a')) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
      closeMenu();
      menu.focus();
    }
  });
  document.addEventListener('click', event => {
    if (!header.contains(event.target)) closeMenu();
  });
  let scrollPending = false;
  const updateScroll = () => {
    header.classList.toggle('is-scrolled', scrollY > 24);
    scrollPending = false;
  };
  const scheduleScroll = () => {
    if (!scrollPending) { scrollPending = true; requestAnimationFrame(updateScroll); }
  };
  addEventListener('scroll', scheduleScroll, { passive: true });
  addEventListener('resize', scheduleScroll, { passive: true });
  addEventListener('load', scheduleScroll, { once: true });
  updateScroll();

  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('.comparison__card, .audience article').forEach(card => {
    let frame = 0;
    let x = 0;
    let y = 0;
    card.addEventListener('pointermove', event => {
      if (!finePointer.matches || reducedMotion.matches) return;
      const rect = card.getBoundingClientRect();
      x = event.clientX - rect.left;
      y = event.clientY - rect.top;
      if (!frame) frame = requestAnimationFrame(() => {
        card.style.setProperty('--pointer-x', `${x}px`);
        card.style.setProperty('--pointer-y', `${y}px`);
        frame = 0;
      });
    }, { passive: true });
  });

  const niches = {
    saude: ['Qual problema essa oferta ajuda a resolver?', 'Compare o público, a promessa e a apresentação do produto. Observe a recorrência dos anúncios e examine as evidências usadas na página.'],
    financas: ['Qual transformação a oferta promete?', 'Investigue para quem o produto foi criado, como explica o método e quais provas apresenta. Compare abordagens sem assumir que uma promessa de ganho comprova resultado.'],
    educacao: ['Qual habilidade o comprador quer conquistar?', 'Observe a especificidade do público, o formato das aulas e os materiais incluídos. Compare como as páginas apresentam o aprendizado e responda às objeções na sua própria proposta.'],
    tecnologia: ['Que tarefa fica mais simples com esse produto?', 'Analise a demonstração, a facilidade de uso e a estrutura da oferta. Compare ferramentas, templates e soluções para identificar um problema que você consiga atender.']
  };
  const choices = document.querySelectorAll('[data-niche]');
  const result = document.querySelector('.niche-result');
  let animateNiche = () => {};
  choices.forEach(button => button.addEventListener('click', () => {
    const content = niches[button.dataset.niche];
    if (!content) return;
    choices.forEach(choice => choice.setAttribute('aria-pressed', String(choice === button)));
    result.querySelector('h3').textContent = content[0];
    result.querySelector('p').textContent = content[1];
    animateNiche();
    scheduleScroll();
  }));
  document.querySelectorAll('.faq details').forEach(details => details.addEventListener('toggle', scheduleScroll));

  // All content is visible if the motion library is unavailable.
  const gsap = window.gsap;
  if (!gsap) return;
  const motion = gsap.matchMedia();
  motion.add({ desktop: '(min-width: 761px)', mobile: '(max-width: 760px)', reduce: '(prefers-reduced-motion: reduce)' }, context => {
    if (context.conditions.reduce) return;
    const mobile = context.conditions.mobile;
    const hero = document.querySelector('.hero');
    const intro = gsap.timeline({ defaults: { duration: .8, ease: 'power3.out' } });
    // Deep links and restored scroll positions must remain settled.
    if (!location.hash && scrollY < 30) {
      intro.from('.hero__opening', { opacity: .55, clearProps: 'opacity' })
        .from('.hero__promise', { opacity: .55, clearProps: 'opacity' }, .18)
        .from('.hero__lead', { y: 8, opacity: .7, clearProps: 'transform,opacity' }, .38)
        .from('.hero__points li', { y: 5, opacity: .75, stagger: .07, clearProps: 'transform,opacity' }, .55);
    }
    const sectionTimelines = new Map();
    const sectionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        sectionObserver.unobserve(entry.target);
        const base = entry.target.querySelector('.section-title__base');
        const accent = entry.target.querySelector('.section-title em');
        const lead = entry.target.querySelector('.section-lead');
        const sequence = gsap.timeline({ defaults: { ease: 'power2.out' } });
        if (base) sequence.from(base, { opacity: .48, duration: .52, clearProps: 'opacity' });
        if (accent) sequence.fromTo(accent, { opacity: .35, textShadow: '0 0 0px rgba(155,239,176,0)' }, { opacity: 1, textShadow: '0 0 18px rgba(155,239,176,.24)', duration: .58, clearProps: 'opacity' }, '>-0.12');
        if (lead) sequence.fromTo(lead, { textShadow: '0 0 0px rgba(155,239,176,0)' }, { textShadow: '0 0 16px rgba(155,239,176,.18)', duration: .7, ease: 'sine.out' }, '>-0.08');
        sectionTimelines.set(entry.target, sequence);
      });
    }, { threshold: .01, rootMargin: '0px 0px -12% 0px' });
    const sectionHeadings = [...document.querySelectorAll('section')].filter(section => section.querySelector('.section-title'));
    sectionHeadings.forEach(section => {
      if (location.hash && section.contains(document.getElementById(decodeURIComponent(location.hash.slice(1))))) return;
      if (section.getBoundingClientRect().top < innerHeight * .65) return;
      sectionObserver.observe(section);
    });
    const ambience = gsap.timeline({ repeat: -1, yoyo: true, defaults: { duration: 7, ease: 'sine.inOut' } })
      .to('.light-sheet--left', { xPercent: mobile ? 3 : 7, yPercent: 2 }, 0)
      .to('.light-sheet--right', { xPercent: mobile ? -3 : -7, yPercent: -2 }, 0)
      .to('.light-edge', { opacity: mobile ? .16 : .32, stagger: .4 }, 0)
      .to('.light-horizon', { scaleX: .9, transformOrigin: 'center' }, 0);
    let heroVisible = true;
    const syncAmbience = () => ambience.paused(document.hidden || !heroVisible);
    const heroObserver = new IntersectionObserver(entries => {
      heroVisible = entries[0].isIntersecting;
      syncAmbience();
    });
    heroObserver.observe(hero);
    document.addEventListener('visibilitychange', syncAmbience);
    syncAmbience();

    context.add('animateNiche', () => {
      gsap.fromTo(result.children, { opacity: .65, y: 5 }, { opacity: 1, y: 0, stagger: .04, duration: .35, ease: 'power2.out', overwrite: true, clearProps: 'transform,opacity' });
    });
    animateNiche = context.animateNiche;
    context.add('animateAnswer', event => {
      const answer = event.currentTarget.querySelector('p');
      if (event.currentTarget.open && answer) gsap.fromTo(answer, { opacity: .65, y: 4 }, { opacity: 1, y: 0, duration: .3, overwrite: true, clearProps: 'transform,opacity' });
    });
    const questions = document.querySelectorAll('.faq details');
    questions.forEach(item => item.addEventListener('toggle', context.animateAnswer));
    // Scroll accents change borders only: navigation targets never enter hidden.
    context.add('accent', target => gsap.fromTo(target, { borderColor: '#8cf5b16b' }, { borderColor: '#c8ffdb20', duration: 1.4, ease: 'power2.out', clearProps: 'borderColor' }));
    const accents = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { context.accent(entry.target); accents.unobserve(entry.target); }
      });
    }, { threshold: .2 });
    document.querySelectorAll('.comparison__card, .flow__panel, .offer__box').forEach(item => accents.observe(item));
    const settle = event => {
      const anchor = event.target.closest('a[href^="#"]');
      if (!anchor) return;
      intro.progress(1);
      const target = document.getElementById(decodeURIComponent(anchor.hash.slice(1)));
      const section = target?.closest('section');
      if (section) {
        sectionObserver.unobserve(section);
        sectionTimelines.get(section)?.progress(1);
      }
      window.AferoMotion?.settle?.();
    };
    document.addEventListener('click', settle, true);
    return () => {
      heroObserver.disconnect();
      sectionObserver.disconnect();
      accents.disconnect();
      document.removeEventListener('visibilitychange', syncAmbience);
      document.removeEventListener('click', settle, true);
      questions.forEach(item => item.removeEventListener('toggle', context.animateAnswer));
      animateNiche = () => {};
    };
  });
})();
