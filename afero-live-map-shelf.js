/* Órbitra / Atlas de prateleiras. Four tier shelves; grouped folios in the
   overview and individual offers in the isolated view. Real data only. */
(function () {
  'use strict';
  var runtime = null, metrics = { ready: false };
  var TIERS = ['S', 'A', 'B', 'C', '?'];
  var COLORS = { S: '#c6d6aa', A: '#78b6a0', B: '#a1af84', C: '#829890', '?': '#91a3a6' };
  function mount(options) {
    destroy(); options = options || {};
    var canvas = options.canvas; if (!canvas) return false;
    var shell = canvas.closest('.live-map-shell'), q = function (s) { return shell.querySelector(s); };
    var THREE = window.THREE, renderer, scene, camera, stage, unit, raycaster, pointer;
    var offers = [], groups = [], hits = [], labels = [], listeners = [], selected = null, shelfState = 'empty';
    var region = '', activeTier = 'S', query = '', page = 0, mobile = canvas.clientWidth < 800, tierTouched = false;
    var defaultYaw = -.16, yaw = defaultYaw, drag = null, observer = null, disposed = false, frameId = 0;
    var list = q('[data-atlas-list]'), labelLayer = q('.live-map-labels');
    var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    metrics = { ready: false, offers: 0, agents: 3, fallback: false, selectedAgent: '', reducedMotion: reduced, theme: 'light', regions: 0, visible: 0, tier: '' };
    function listen(node, name, fn) { node.addEventListener(name, fn); listeners.push([node, name, fn]); }
    function fmt(n) { return n.toLocaleString('pt-BR'); }
    function el(tag, content, cls) { var node = document.createElement(tag); if (content !== undefined) node.textContent = content; if (cls) node.className = cls; return node; }
    function firstTier() { return TIERS.find(function (tier) { return offers.some(function (o) { return o.tier === tier; }); }) || 'S'; }
    function matchesContext(offer) {
      return (!region || offer.niche === region) && (!query || (offer.title + ' ' + offer.domain + ' ' + offer.niche).toLocaleLowerCase('pt-BR').includes(query));
    }
    function availableTiers() { return TIERS.filter(function (tier) { return offers.some(function (o) { return matchesContext(o) && o.tier === tier; }); }); }
    function normalizeActiveTier() {
      var tiers = availableTiers();
      if (tiers.length && !tiers.includes(activeTier)) activeTier = tiers[0];
    }
    try {
      if (!THREE) throw new Error('WebGL indisponível');
      renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
      scene = new THREE.Scene(); stage = new THREE.Group(); scene.add(stage);
      camera = new THREE.OrthographicCamera(-5, 5, 3, -3, .1, 50);
      camera.position.set(0, 2.5, 14); camera.lookAt(0, 0, 0);
      scene.add(new THREE.HemisphereLight(0xe4ebd9, 0x152a20, 1.25));
      var key = new THREE.DirectionalLight(0xf1efdd, 1.35); key.position.set(-4, 6, 8); scene.add(key);
      var rim = new THREE.DirectionalLight(0x7cae91, .55); rim.position.set(4, 1, -3); scene.add(rim);
      unit = new THREE.BoxGeometry(1, 1, 1); raycaster = new THREE.Raycaster(); pointer = new THREE.Vector2();
    } catch (_) { if (renderer) renderer.dispose(); renderer = null; metrics.fallback = true; }
    function clearStage() {
      if (stage) while (stage.children.length) {
        var child = stage.children[0];
        child.traverse(function (node) {
          if (node.material) {
            var materials = Array.isArray(node.material) ? node.material : [node.material];
            materials.forEach(function (material) { if (material.map) material.map.dispose(); material.dispose(); });
          }
          if (node.geometry && node.geometry !== unit) node.geometry.dispose();
        });
        stage.remove(child);
      }
      hits = []; labels = []; labelLayer.replaceChildren();
    }
    function block(x, y, z, w, h, d, color) {
      if (!renderer) return null;
      var mesh = new THREE.Mesh(unit, new THREE.MeshStandardMaterial({ color: color, roughness: .84, metalness: .08 }));
      mesh.position.set(x, y, z); mesh.scale.set(w, h, d); stage.add(mesh); return mesh;
    }
    function textTexture(item, tier, grouped) {
      var board = document.createElement('canvas'); board.width = 256; board.height = 420;
      var ctx = board.getContext('2d');
      ctx.fillStyle = '#20392e'; ctx.fillRect(0, 0, 256, 420);
      ctx.fillStyle = COLORS[tier]; ctx.fillRect(0, 0, 256, 9);
      ctx.fillStyle = '#dce8d8'; ctx.font = '900 58px Satoshi, sans-serif'; ctx.fillText(tier, 22, 76);
      ctx.fillStyle = '#a9c1aa'; ctx.font = '700 18px Satoshi, sans-serif';
      ctx.fillText(grouped ? 'NICHO' : 'OFERTA', 22, 107);
      var title = grouped ? item.niche : item.title;
      ctx.fillStyle = '#f3f4e9'; ctx.font = '900 36px Satoshi, sans-serif';
      var words = title.split(/\s+/), lines = [], line = '';
      words.forEach(function (word) {
        var candidate = line ? line + ' ' + word : word;
        if (ctx.measureText(candidate).width > 207 && line) { lines.push(line); line = word; } else line = candidate;
      });
      if (line) lines.push(line);
      lines.slice(0, 3).forEach(function (value, i) { ctx.fillText(value.length > 15 ? value.slice(0, 14) + '…' : value, 22, 176 + i * 45, 211); });
      ctx.fillStyle = '#91ab95'; ctx.fillRect(22, 344, 211, 1);
      ctx.fillStyle = COLORS[tier]; ctx.font = '900 48px Satoshi, sans-serif';
      ctx.fillText(grouped ? fmt(item.items.length) : item.score === null ? 'S/D' : fmt(item.score), 22, 397);
      var texture = new THREE.CanvasTexture(board); texture.minFilter = THREE.LinearFilter; return texture;
    }
    function folio(item, tier, x, shelfY, width, grouped) {
      if (!renderer) return;
      var height = grouped ? .72 : mobile ? 1.7 : 1.35;
      var shape = new THREE.Shape();
      shape.moveTo(-width / 2 + .035, 0); shape.lineTo(width / 2 - .035, 0);
      shape.quadraticCurveTo(width / 2, 0, width / 2, .035);
      shape.lineTo(width / 2, height - .035);
      shape.quadraticCurveTo(width / 2, height, width / 2 - .035, height);
      shape.lineTo(-width / 2 + .035, height);
      shape.quadraticCurveTo(-width / 2, height, -width / 2, height - .035);
      shape.lineTo(-width / 2, .035);
      shape.quadraticCurveTo(-width / 2, 0, -width / 2 + .035, 0);
      var body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .055, bevelEnabled: true, bevelThickness: .012, bevelSize: .012, bevelSegments: 1, steps: 1 }), new THREE.MeshStandardMaterial({ color: 0x3b5b47, roughness: .81, metalness: .09 }));
      body.position.set(x, shelfY + .12, .07);
      var face = new THREE.Mesh(new THREE.PlaneGeometry(width - .036, height - .038), new THREE.MeshBasicMaterial({ map: textTexture(item, tier, grouped), transparent: false }));
      face.position.set(0, height / 2, .08); body.add(face);
      var side = new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS[tier]) }));
      side.position.set(-width / 2 + .022, height / 2, .083); side.scale.set(.018, height - .085, .01); body.add(side);
      var data = grouped ? { group: item, tier: tier } : { offer: item };
      body.userData = data; face.userData = data; stage.add(body); hits.push(body, face);
    }
    function shelf(tier, y, width, count, isolated) {
      if (!renderer) return;
      var color = new THREE.Color(COLORS[tier]);
      block(0, y, -.11, width, .095, .88, 0x334b3b);
      block(0, y - .085, .37, width, .13, .095, 0x3c5743);
      block(0, y - .008, .431, width, .018, .018, color);
      block(-width / 2 + .19, y - .26, -.22, .12, .42, .64, 0x253e32);
      block(width / 2 - .19, y - .26, -.22, .12, .42, .64, 0x253e32);
      var label = el('div', undefined, 'shelf-tier-label');
      label.append(el('strong', tier), el('span', fmt(count) + (count === 1 ? ' oferta' : ' ofertas')));
      labelLayer.append(label);
      labels.push({ node: label, point: new THREE.Vector3(-width / 2 + .16, y + (isolated ? -.42 : .11), .55) });
    }
    function render() {
      if (!renderer || disposed || metrics.fallback || document.hidden) return;
      renderer.render(scene, camera);
      labels.forEach(function (entry) {
        var point = stage.localToWorld(entry.point.clone()).project(camera);
        entry.node.style.left = ((point.x * .5 + .5) * canvas.clientWidth) + 'px';
        entry.node.style.top = ((-point.y * .5 + .5) * canvas.clientHeight) + 'px';
      });
    }
    function updateCamera() {
      if (!renderer) return;
      stage.rotation.y = yaw;
      stage.rotation.x = 0;
      camera.position.set(0, 2.5, 14); camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld(); render();
    }
    function resize() {
      var header = document.querySelector('.top');
      if (header) shell.style.setProperty('--atlas-header-height', header.getBoundingClientRect().height + 'px');
      if (!canvas.clientWidth || !canvas.clientHeight) return;
      var nextMobile = canvas.clientWidth < 800;
      if (nextMobile !== mobile) {
        mobile = nextMobile; page = 0; rebuild(); return;
      }
      if (!renderer) return;
      var aspect = canvas.clientWidth / canvas.clientHeight;
      var extent = mobile ? Math.max(2.05, 2.25 / aspect) : Math.max(1.4, 4.05 / aspect);
      camera.left = -extent * aspect; camera.right = extent * aspect; camera.top = extent; camera.bottom = -extent;
      camera.updateProjectionMatrix(); renderer.setSize(canvas.clientWidth, canvas.clientHeight, false); updateCamera();
    }
    function filtered() { return offers.filter(function (o) { return matchesContext(o) && (!activeTier || o.tier === activeTier); }); }
    function selectTier(tier) { activeTier = tier; tierTouched = true; page = 0; selected = null; yaw = defaultYaw; rebuild(); }
    function stepTier(direction) {
      var tiers = availableTiers(), index = tiers.indexOf(activeTier);
      var next = tiers[index < 0 ? (direction > 0 ? 0 : tiers.length - 1) : index + direction];
      if (next) selectTier(next);
    }
    function showSelection(offer) {
      selected = offer || null;
      shell.dataset.offerSelected = selected ? 'true' : 'false';
      var headline = selected ? selected.title : activeTier ? 'Prateleira ' + activeTier : 'Explore a estante de ofertas';
      q('[data-atlas-title]').textContent = headline;
      q('[data-atlas-meta]').textContent = selected ? (selected.domain || 'Domínio não informado') + ' · Tier ' + selected.tier + ' · ' + (selected.score === null ? 'Score não informado' : 'Score ' + fmt(selected.score)) : offers.length ? 'Escolha uma lombada ou isole um tier para examinar as ofertas.' : 'Importe seu CSV para preencher as prateleiras com ofertas reais.';
      q('[data-atlas-open]').disabled = !selected; q('[data-atlas-agents]').hidden = !selected;
      Array.from(list.children).forEach(function (button) { button.setAttribute('aria-pressed', String(!!selected && button.dataset.offer === selected.id)); });
      hits.forEach(function (mesh) { if (mesh.userData.offer && mesh.material.emissive) { mesh.material.emissive.setHex(selected && mesh.userData.offer === selected ? 0x557a5f : 0x000000); mesh.material.emissiveIntensity = selected && mesh.userData.offer === selected ? .45 : 0; } });
      render();
    }
    function activateOffer(offer) {
      showSelection(offer);
      if (offer && options.onOfferClick) options.onOfferClick(offer.source);
    }
    function rebuild() {
      normalizeActiveTier();
      clearStage();
      var items = filtered(), size = mobile ? 3 : 8;
      var pages = Math.max(1, Math.ceil(items.length / size));
      page = Math.min(page, pages - 1); var visible = items.slice(page * size, (page + 1) * size);
      metrics.visible = visible.length; metrics.tier = activeTier; metrics.page = page + 1; metrics.region = region;
      shell.dataset.mapState = metrics.fallback ? 'fallback' : offers.length ? 'populated' : 'empty';
      shell.dataset.shelfState = shelfState;
      shell.dataset.atlasView = 'offers'; shell.dataset.shelfTier = activeTier;
      var source = q('[data-shelf-source]');
      var sourceLabels = { empty: 'Sem dados', demo: 'Demo local', authenticated: 'Workspace' };
      if (source) { source.textContent = sourceLabels[shelfState]; source.dataset.shelfSource = shelfState; }
      var emptyCopy = {
        empty: ['Estante vazia', 'Importe um CSV para organizar as ofertas.'],
        demo: ['Demo local sem ofertas', 'Importe um CSV para preencher a estante nesta sessão.'],
        authenticated: ['Workspace sem ofertas', 'Este workspace ainda não tem ofertas. Importe um CSV.']
      }[shelfState];
      var emptyTitle = q('[data-map-empty-title]'), mapStatus = q('[data-map-status]');
      if (emptyTitle) emptyTitle.textContent = emptyCopy[0];
      if (mapStatus) mapStatus.textContent = emptyCopy[1];
      q('[data-atlas-region]').value = region;
      q('[data-atlas-back]').disabled = !region && !query;
      q('[data-atlas-prev]').disabled = page === 0; q('[data-atlas-next]').disabled = page >= pages - 1;
      q('[data-atlas-page]').textContent = page + 1 + ' / ' + pages;
      q('[data-atlas-summary]').textContent = fmt(items.length) + ' ofertas';
      q('[data-atlas-results]').textContent = !items.length ? offers.length ? 'Nenhuma oferta corresponde aos filtros.' : 'Aguardando sua caçada.' : 'Ofertas ' + (page * size + 1) + '–' + (page * size + visible.length) + ' de ' + items.length;
      q('[data-atlas-scale]').textContent = mobile ? 'Arraste para girar · toque para abrir o Raio X' : 'Arraste lateralmente para girar · clique em uma oferta para abrir o Raio X';
      var tiers = availableTiers();
      shell.querySelectorAll('[data-shelf-tier]').forEach(function (button) {
        button.setAttribute('aria-pressed', String(button.dataset.shelfTier === activeTier));
        button.disabled = !tiers.includes(button.dataset.shelfTier);
      });
      q('[data-shelf-tier="?"]').hidden = !tiers.includes('?');
      var tierIndex = tiers.indexOf(activeTier);
      q('[data-shelf-current]').textContent = activeTier;
      q('[data-shelf-prev]').disabled = tierIndex <= 0;
      q('[data-shelf-next]').disabled = tierIndex < 0 || tierIndex >= tiers.length - 1;
      list.replaceChildren();
      if (renderer) {
        var width = mobile ? 4.35 : 7.8, y = mobile ? -.55 : -.45;
        var count = items.length;
        shelf(activeTier, y, width, count, true);
        visible.forEach(function (offer, i) {
          var x = (i - (visible.length - 1) / 2) * (mobile ? 1.15 : .88);
          folio(offer, activeTier, x, y, mobile ? 1.05 : .78, false);
        });
      }
      visible.forEach(function (offer) {
        var button = el('button', undefined, 'atlas-list-offer'); button.type = 'button'; button.dataset.offer = offer.id;
        button.setAttribute('aria-label', 'Abrir Raio X de ' + offer.title);
        button.append(el('span', offer.tier, 'atlas-tier'), el('span', offer.title), el('b', offer.score === null ? 's/d' : fmt(offer.score)));
        button.addEventListener('click', function () { activateOffer(offer); }); list.append(button);
      });
      if (metrics.fallback) q('[data-atlas-list-panel]').open = true;
      showSelection(selected && items.includes(selected) ? selected : null); resize();
      if (renderer && !reduced) {
        cancelAnimationFrame(frameId); var start = performance.now();
        function reveal(now) { if (disposed) return; var p = Math.min(1, (now - start) / 400); stage.scale.y = .94 + .06 * (1 - Math.pow(1 - p, 3)); render(); if (p < 1) frameId = requestAnimationFrame(reveal); }
        frameId = requestAnimationFrame(reveal);
      }
    }
    function setOffers(data, sourceState) {
      offers = (Array.isArray(data) ? data : []).map(function (source, index) {
        var score = source.s === null || source.s === undefined || String(source.s).trim() === '' ? null : Number(source.s);
        var tier = String(source.p || '').trim().charAt(0).toUpperCase();
        return { id: String(index), source: source, title: String(source.t || source.d || 'Oferta sem título'), domain: String(source.d || ''), niche: String(source.n || '').trim() || 'Sem nicho', tier: COLORS[tier] ? tier : '?', score: Number.isFinite(score) ? score : null };
      });
      shelfState = ['empty', 'demo', 'authenticated'].includes(sourceState) ? sourceState : offers.length ? 'demo' : 'empty';
      var grouped = new Map(); offers.forEach(function (o) { if (!grouped.has(o.niche)) grouped.set(o.niche, { name: o.niche, items: [] }); grouped.get(o.niche).items.push(o); });
      groups = Array.from(grouped.values()).sort(function (a, b) { return a.name.localeCompare(b.name, 'pt-BR'); });
      var select = q('[data-atlas-region]'); select.replaceChildren(el('option', 'Todos os nichos')); select.firstChild.value = '';
      groups.forEach(function (g) { var option = el('option', g.name + ' (' + g.items.length + ')'); option.value = g.name; select.append(option); });
      if (!grouped.has(region)) region = '';
      if (!tierTouched || !offers.some(function (o) { return o.tier === activeTier; })) activeTier = firstTier();
      normalizeActiveTier();
      page = 0; selected = null; metrics.offers = offers.length; metrics.regions = groups.length;
      q('#liveMapCount').textContent = fmt(offers.length) + (offers.length === 1 ? ' oferta na estante' : ' ofertas na estante'); rebuild();
    }
    function focusOffer(target) {
      var offer = offers.find(function (o) { return o.source === target || o.id === target; });
      if (!offer) { showSelection(null); return; }
      activeTier = offer.tier; region = offer.niche; tierTouched = true; query = ''; q('[data-atlas-search]').value = '';
      page = Math.floor(filtered().indexOf(offer) / (mobile ? 3 : 8)); selected = offer; rebuild();
    }
    function focusAgent(id) { metrics.selectedAgent = id || ''; if (options.onAgentSelect) options.onAgentSelect(id ? { id: id } : null); }
    listen(q('[data-atlas-region]'), 'change', function (e) { region = e.target.value; normalizeActiveTier(); page = 0; selected = null; rebuild(); });
    listen(q('[data-atlas-search]'), 'input', function (e) { query = e.target.value.trim().toLocaleLowerCase('pt-BR'); normalizeActiveTier(); page = 0; selected = null; rebuild(); q('[data-atlas-list-panel]').open = !!query || metrics.fallback; });
    listen(q('[data-atlas-back]'), 'click', function () { region = ''; query = ''; q('[data-atlas-search]').value = ''; normalizeActiveTier(); page = 0; selected = null; rebuild(); });
    shell.querySelectorAll('[data-shelf-tier]').forEach(function (button) { listen(button, 'click', function () { selectTier(button.dataset.shelfTier); }); });
    listen(q('[data-shelf-prev]'), 'click', function () { stepTier(-1); });
    listen(q('[data-shelf-next]'), 'click', function () { stepTier(1); });
    listen(q('[data-atlas-prev]'), 'click', function () { page--; rebuild(); });
    listen(q('[data-atlas-next]'), 'click', function () { page++; rebuild(); });
    listen(q('[data-atlas-reset]'), 'click', function () { yaw = defaultYaw; updateCamera(); });
    listen(q('[data-atlas-open]'), 'click', function () { if (selected && options.onOfferClick) options.onOfferClick(selected.source); });
    shell.querySelectorAll('[data-atlas-agent]').forEach(function (button) { listen(button, 'click', function () { focusAgent(button.dataset.atlasAgent); }); });
    function hit(e) { if (!renderer) return null; var rect = canvas.getBoundingClientRect(); pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, 1 - (e.clientY - rect.top) / rect.height * 2); raycaster.setFromCamera(pointer, camera); return raycaster.intersectObjects(hits, false)[0]; }
    function hoverOffer(offer) {
      var node = q('[data-shelf-hover]');
      node.replaceChildren();
      if (offer) {
        node.append(el('strong', offer.title), el('span', 'Tier ' + offer.tier + ' · ' + (offer.score === null ? 'sem score' : 'score ' + fmt(offer.score))));
      }
      node.classList.toggle('is-visible', !!offer);
    }
    listen(canvas, 'pointerdown', function (e) {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, yaw: yaw };
      if (e.pointerType === 'mouse') canvas.setPointerCapture(e.pointerId);
    });
    listen(canvas, 'pointermove', function (e) {
      if (drag) {
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) > 5 && (e.pointerType === 'mouse' || Math.abs(dx) > Math.abs(dy))) {
          drag.moved = true; yaw = Math.max(-.25, Math.min(.25, drag.yaw + dx * .002)); updateCamera(); hoverOffer(null);
        }
      } else if (e.pointerType === 'mouse') {
        var found = hit(e), offer = found && found.object.userData.offer;
        canvas.style.cursor = offer ? 'pointer' : 'grab'; hoverOffer(offer || null);
      }
    });
    listen(canvas, 'pointerup', function (e) {
      if (!drag) return;
      var moved = drag.moved || Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 8;
      drag = null; if (moved) return;
      var found = hit(e), offer = found && found.object.userData.offer;
      if (offer) activateOffer(offer);
    });
    listen(canvas, 'pointerleave', function () { hoverOffer(null); });
    listen(canvas, 'pointercancel', function () { drag = null; });
    listen(canvas, 'webglcontextlost', function (e) { e.preventDefault(); metrics.fallback = true; shell.dataset.mapState = 'fallback'; q('[data-atlas-list-panel]').open = true; });
    listen(document, 'visibilitychange', render);
    if (window.ResizeObserver) { observer = new ResizeObserver(resize); observer.observe(canvas.parentElement); }
    listen(window, 'resize', resize);
    runtime = { setOffers: setOffers, focusOffer: focusOffer, focusAgent: focusAgent, resize: resize, updateTheme: render, cleanup: function () {
      disposed = true; cancelAnimationFrame(frameId); listeners.forEach(function (binding) { binding[0].removeEventListener(binding[1], binding[2]); }); if (observer) observer.disconnect(); clearStage(); if (unit) unit.dispose(); if (renderer) renderer.dispose();
    } };
    setOffers([]); metrics.ready = true;
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (!disposed && renderer) rebuild(); });
    return true;
  }
  function destroy() { if (runtime) runtime.cleanup(); runtime = null; metrics.ready = false; }
  window.AferoLiveMap = { mount: mount, destroy: destroy, getMetrics: function () { return Object.assign({}, metrics); } };
  ['setOffers', 'focusOffer', 'focusAgent', 'resize', 'updateTheme'].forEach(function (name) { window.AferoLiveMap[name] = function () { if (runtime) runtime[name].apply(runtime, arguments); }; });
}());
