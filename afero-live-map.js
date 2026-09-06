(function () {
  'use strict';

  var runtime = null;
  var metrics = { ready: false, agents: 0, offers: 0, theme: 'light', fallback: false, selectedAgent: '', reducedMotion: false };

  function currentTheme() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }

  function paletteFor(theme) {
    if (theme === 'dark') {
      return {
        hunter: 0x8a9c7b, hunterGlow: 0x8fd0b0, inner: 0xf7f6f1, wire: 0x8fd0b0,
        copy: 0xb7c5a9, pages: 0x55a187, route: 0x8fd0b0, routeSoft: 0xb7c5a9,
        tiers: {
          S: { color: 0xeef4e9, size: .34, halo: .74, opacity: 1, radius: 2.12 },
          A: { color: 0x8fd0b0, size: .28, halo: .58, opacity: .95, radius: 3.12 },
          B: { color: 0x8a9c7b, size: .22, halo: .45, opacity: .82, radius: 4.16 },
          C: { color: 0x708077, size: .16, halo: .33, opacity: .58, radius: 5.14 }
        }
      };
    }
    return {
      hunter: 0x2f654d, hunterGlow: 0x24696a, inner: 0x8a9c7b, wire: 0x24696a,
      copy: 0x6f825f, pages: 0x24696a, route: 0x2f654d, routeSoft: 0x8a9c7b,
      tiers: {
        S: { color: 0xf7f6f1, size: .34, halo: .74, opacity: 1, radius: 2.12 },
        A: { color: 0x8a9c7b, size: .28, halo: .58, opacity: .94, radius: 3.12 },
        B: { color: 0x56603f, size: .22, halo: .45, opacity: .82, radius: 4.16 },
        C: { color: 0x56603f, size: .16, halo: .33, opacity: .52, radius: 5.14 }
      }
    };
  }

  function safeTier(value) {
    var tier = String(value || 'C').trim().charAt(0).toUpperCase();
    return /^(S|A|B|C)$/.test(tier) ? tier : 'C';
  }

  function normalizeOffers(offers) {
    return (Array.isArray(offers) ? offers : []).map(function (offer, index) {
      return {
        id: String(index) + ':' + String(offer.u || offer.d || offer.t || 'oferta'),
        title: String(offer.t || offer.d || 'Oferta sem título'),
        domain: String(offer.d || ''),
        tier: safeTier(offer.p),
        score: Number(offer.s || 0),
        niche: String(offer.n || ''),
        source: offer
      };
    });
  }

  function stableFraction(value) {
    var hash = 2166136261;
    var text = String(value || '');
    for (var i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
  }

  function mount(options) {
    destroy();
    options = options || {};
    var canvas = options.canvas;
    var THREE = window.THREE;
    var gsap = window.gsap;
    if (!canvas) return false;

    var shell = canvas.closest('.live-map-shell');
    var viewport = canvas.parentElement;
    var count = shell && shell.querySelector('#liveMapCount');
    var status = shell && shell.querySelector('[data-map-status]');
    var labels = {
      hunter: shell && shell.querySelector('[data-map-agent-label="hunter"]'),
      copywriter: shell && shell.querySelector('[data-map-agent-label="copywriter"]'),
      pages: shell && shell.querySelector('[data-map-agent-label="pages"]')
    };
    var theme = currentTheme();
    var palette = paletteFor(theme);
    var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    metrics = { ready: false, agents: 0, offers: 0, theme: theme, fallback: false, selectedAgent: '', reducedMotion: reduced };

    if (!THREE) {
      metrics.fallback = true;
      if (shell) shell.dataset.mapState = 'fallback';
      if (status) status.textContent = 'Visualização 3D indisponível';
      return false;
    }

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    } catch (error) {
      metrics.fallback = true;
      if (shell) shell.dataset.mapState = 'fallback';
      if (status) status.textContent = 'Visualização 3D indisponível';
      return false;
    }

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(42, 1, .1, 80);
    var root = new THREE.Group();
    var routeLayer = new THREE.Group();
    var orbitLayer = new THREE.Group();
    var offerLayer = new THREE.Group();
    var packetLayer = new THREE.Group();
    var agentNodes = [];
    var agentGroups = {};
    var routeRecords = [];
    var offerNodes = [];
    var offerTweens = [];
    var routeTweens = [];
    var glowCache = {};
    var raycaster = new THREE.Raycaster();
    var pointer = new THREE.Vector2(9, 9);
    var running = true;
    var frameId = 0;
    var resizeObserver = null;
    var activeOfferId = '';
    var selectedAgent = '';
    var offers = [];
    var onOfferClick = typeof options.onOfferClick === 'function' ? options.onOfferClick : function () {};
    var onAgentSelect = typeof options.onAgentSelect === 'function' ? options.onAgentSelect : function () {};
    var positions = {
      hunter: new THREE.Vector3(0, 2.45, 0),
      copywriter: new THREE.Vector3(-2.55, .15, .1),
      pages: new THREE.Vector3(2.55, .15, .1)
    };

    camera.position.set(0, -.25, 15.8);
    scene.add(root);
    root.add(orbitLayer, routeLayer, offerLayer, packetLayer);
    scene.add(new THREE.HemisphereLight(theme === 'dark' ? 0xdce9d4 : 0xf7f6f1, theme === 'dark' ? 0x07140f : 0x496356, 1.65));
    var keyLight = new THREE.PointLight(palette.hunterGlow, 2.5, 24);
    keyLight.position.set(3.5, 5, 7);
    scene.add(keyLight);
    var softLight = new THREE.PointLight(palette.routeSoft, 1.15, 20);
    softLight.position.set(-4, -2, 5);
    scene.add(softLight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.setClearColor(0x000000, 0);

    function material(color, emissive) {
      return new THREE.MeshStandardMaterial({ color: color, emissive: emissive || color, emissiveIntensity: .22, metalness: .28, roughness: .42, transparent: true, opacity: .97 });
    }

    function animate(target, vars) {
      if (reduced || !gsap) return null;
      var tween = gsap.to(target, vars);
      routeTweens.push(tween);
      return tween;
    }

    function addAgent(id, kind, position, color) {
      var group = new THREE.Group();
      var mesh;
      if (kind === 'hunter') {
        mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(.74, 2), material(palette.hunter, palette.hunterGlow));
        var inner = new THREE.Mesh(new THREE.IcosahedronGeometry(.39, 1), material(palette.inner, palette.hunterGlow));
        var shellMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.02, 1), new THREE.MeshBasicMaterial({ color: palette.wire, wireframe: true, transparent: true, opacity: .2 }));
        var ringA = new THREE.Mesh(new THREE.TorusGeometry(1.18, .018, 6, 96), new THREE.MeshBasicMaterial({ color: palette.hunterGlow, transparent: true, opacity: .5 }));
        var ringB = new THREE.Mesh(new THREE.TorusGeometry(1.43, .012, 6, 96), new THREE.MeshBasicMaterial({ color: palette.routeSoft, transparent: true, opacity: .28 }));
        ringA.rotation.x = 1.12;
        ringB.rotation.set(.35, .25, .15);
        group.add(mesh, inner, shellMesh, ringA, ringB);
        animate(ringA.rotation, { z: Math.PI * 2, duration: 16, repeat: -1, ease: 'none' });
        animate(ringB.rotation, { x: Math.PI * 2 + .35, y: Math.PI * 2 + .25, duration: 23, repeat: -1, ease: 'none' });
        animate(inner.scale, { x: 1.13, y: 1.13, z: 1.13, duration: 2.2, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      } else {
        mesh = new THREE.Mesh(new THREE.OctahedronGeometry(.46, 1), material(color));
        var ring = new THREE.Mesh(new THREE.TorusGeometry(.68, .014, 5, 72), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: .4 }));
        ring.rotation.x = 1.05;
        group.add(mesh, ring);
        animate(ring.rotation, { z: (id === 'copywriter' ? 1 : -1) * Math.PI * 2, duration: id === 'copywriter' ? 13 : 15, repeat: -1, ease: 'none' });
      }
      group.position.copy(position);
      mesh.userData = { type: 'agent', id: id };
      root.add(group);
      agentNodes.push(mesh);
      agentGroups[id] = group;
    }

    addAgent('hunter', 'hunter', positions.hunter, palette.hunter);
    addAgent('copywriter', 'sub', positions.copywriter, palette.copy);
    addAgent('pages', 'sub', positions.pages, palette.pages);

    function curveBetween(from, to, lift, depth) {
      var middle = from.clone().lerp(to, .5);
      middle.y += lift || 0;
      middle.z += depth || 0;
      return new THREE.QuadraticBezierCurve3(from.clone(), middle, to.clone());
    }

    function drawRoute(curve, color, opacity, width, agents) {
      var geometry = new THREE.TubeGeometry(curve, 36, width || .012, 4, false);
      var routeMaterial = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity, depthWrite: false });
      var mesh = new THREE.Mesh(geometry, routeMaterial);
      routeLayer.add(mesh);
      routeRecords.push({ mesh: mesh, agents: agents || [], baseOpacity: opacity });
      return mesh;
    }

    function packetOn(curve, color, duration, delay) {
      var packet = new THREE.Mesh(new THREE.SphereGeometry(.055, 10, 8), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: .9 }));
      var progress = { value: 0 };
      packetLayer.add(packet);
      if (!reduced && gsap) routeTweens.push(gsap.to(progress, { value: 1, duration: duration, delay: delay || 0, repeat: -1, ease: 'none', onUpdate: function () { packet.position.copy(curve.getPoint(progress.value)); } }));
      else packet.position.copy(curve.getPoint(.6));
    }

    [
      { from: positions.hunter, to: positions.copywriter, lift: .28, depth: .28, color: palette.route, agents: ['hunter', 'copywriter'] },
      { from: positions.hunter, to: positions.pages, lift: .28, depth: .28, color: palette.routeSoft, agents: ['hunter', 'pages'] },
      { from: positions.copywriter, to: positions.pages, lift: -.55, depth: -.22, color: palette.copy, agents: ['copywriter', 'pages'] }
    ].forEach(function (route, index) {
      var curve = curveBetween(route.from, route.to, route.lift, route.depth);
      drawRoute(curve, route.color, index === 2 ? .16 : .28, .011, route.agents);
      if (index < 2) packetOn(curve, route.color, 3.2, index * .8);
    });

    Object.keys(palette.tiers).forEach(function (tier) {
      var spec = palette.tiers[tier];
      var orbit = new THREE.Mesh(
        new THREE.TorusGeometry(spec.radius, .006, 4, 128),
        new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: tier === 'S' ? .14 : .075, depthWrite: false })
      );
      orbit.scale.y = .55;
      orbit.position.y = .1;
      orbitLayer.add(orbit);
    });

    function glowTexture(color) {
      var key = String(color);
      if (glowCache[key]) return glowCache[key];
      var textureCanvas = document.createElement('canvas');
      textureCanvas.width = textureCanvas.height = 96;
      var context = textureCanvas.getContext('2d');
      var hex = '#' + new THREE.Color(color).getHexString();
      var gradient = context.createRadialGradient(48, 48, 2, 48, 48, 46);
      gradient.addColorStop(0, 'rgba(255,255,250,.98)');
      gradient.addColorStop(.16, hex);
      gradient.addColorStop(.48, hex + '99');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 96, 96);
      glowCache[key] = new THREE.CanvasTexture(textureCanvas);
      return glowCache[key];
    }

    function disposeObject(object) {
      object.traverse(function (child) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(function (item) { item.dispose(); });
          else child.material.dispose();
        }
      });
    }

    function clearOffers() {
      offerTweens.forEach(function (tween) { if (tween && tween.kill) tween.kill(); });
      offerTweens = [];
      while (offerLayer.children.length) {
        var child = offerLayer.children[0];
        offerLayer.remove(child);
        disposeObject(child);
      }
      offerNodes = [];
    }

    function focusOffer(target) {
      var selectedSource = target && typeof target === 'object' ? target : null;
      var selectedNode = selectedSource ? offerNodes.find(function (node) { return node.offer.source === selectedSource; }) : null;
      activeOfferId = selectedNode ? selectedNode.offer.id : (typeof target === 'string' ? target : '');
      offerNodes.forEach(function (node) {
        var active = node.offer.id === activeOfferId;
        node.dot.material.opacity = active ? 1 : node.spec.opacity;
        node.halo.material.opacity = active ? 1 : node.spec.opacity * .62;
        node.group.scale.setScalar(active ? 1.35 : 1);
      });
    }

    function buildOffers(nextOffers) {
      clearOffers();
      offers = normalizeOffers(nextOffers);
      var byTier = { S: [], A: [], B: [], C: [] };
      offers.forEach(function (offer) { byTier[offer.tier].push(offer); });
      Object.keys(byTier).forEach(function (tier) {
        byTier[tier].forEach(function (offer, index) {
          var spec = palette.tiers[tier];
          var countInTier = Math.max(1, byTier[tier].length);
          var seed = stableFraction(offer.id);
          var angle = (index / countInTier) * Math.PI * 2 + seed * .34;
          var radialOffset = (seed - .5) * .34;
          var radius = spec.radius + radialOffset;
          var x = Math.cos(angle) * radius;
          var y = Math.sin(angle) * radius * .55 + .1;
          var z = (stableFraction(offer.id + ':depth') - .5) * 1.45;
          var group = new THREE.Group();
          var dot = new THREE.Mesh(new THREE.SphereGeometry(spec.size, 12, 9), new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: spec.opacity }));
          var halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(spec.color), transparent: true, depthWrite: false, opacity: spec.opacity * .62, blending: THREE.AdditiveBlending }));
          halo.scale.setScalar(spec.halo);
          dot.userData = { type: 'offer', id: offer.id };
          group.position.set(x, y, z);
          group.add(halo, dot);
          offerLayer.add(group);
          offerNodes.push({ offer: offer, group: group, dot: dot, halo: halo, spec: spec, agent: index % 2 ? 'pages' : 'copywriter' });
          if (!reduced && gsap) {
            group.scale.setScalar(.01);
            offerTweens.push(gsap.to(group.scale, { x: 1, y: 1, z: 1, duration: .55, delay: Math.min(1.15, offerNodes.length * .012), ease: 'back.out(1.55)' }));
          }
        });
      });
      metrics.offers = offerNodes.length;
      if (shell) shell.dataset.mapState = offers.length ? 'populated' : 'empty';
      if (count) count.textContent = offers.length ? offers.length + (offers.length === 1 ? ' oferta em órbita' : ' ofertas em órbita') : 'aguardando CSV';
      if (status) status.textContent = offers.length ? 'Clique em um ponto para abrir o Raio X' : 'Importe uma caçada para visualizar as ofertas';
      focusOffer(activeOfferId);
    }

    function hitAt(event) {
      var rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(agentNodes.concat(offerNodes.map(function (node) { return node.dot; })), false)[0];
    }

    function applyRouteEmphasis(id) {
      routeRecords.forEach(function (record) {
        var linked = id && record.agents.indexOf(id) !== -1;
        record.mesh.material.opacity = id ? (linked ? .84 : .055) : record.baseOpacity;
      });
      Object.keys(agentGroups).forEach(function (agentId) {
        var active = id && agentId === id;
        var scale = active ? 1.18 : (id ? .93 : 1);
        agentGroups[agentId].scale.setScalar(scale);
      });
    }

    function selectAgent(id, notify) {
      var next = agentGroups[id] ? id : '';
      selectedAgent = next;
      metrics.selectedAgent = next;
      applyRouteEmphasis(next);
      var target = next ? positions[next] : new THREE.Vector3(0, 0, 0);
      var nextRoot = { x: next ? -target.x * .34 : 0, y: next ? -target.y * .18 : 0 };
      var nextZoom = next ? 13.2 : (camera.aspect < .85 ? 20.5 : 15.8);
      if (!reduced && gsap) {
        routeTweens.push(gsap.to(root.position, { x: nextRoot.x, y: nextRoot.y, duration: .9, ease: 'power3.out', overwrite: 'auto' }));
        routeTweens.push(gsap.to(camera.position, { z: nextZoom, duration: .9, ease: 'power3.out', overwrite: 'auto' }));
      } else {
        root.position.x = nextRoot.x;
        root.position.y = nextRoot.y;
        camera.position.z = nextZoom;
      }
      if (notify !== false) onAgentSelect(next ? { id: next, label: next === 'hunter' ? 'Caçador de Ofertas' : next === 'copywriter' ? 'Agente Copywriter' : 'Agente de Páginas' } : null);
    }

    function onPointerMove(event) {
      var hit = hitAt(event);
      canvas.style.cursor = hit ? 'pointer' : 'grab';
      if (!selectedAgent) applyRouteEmphasis(hit && hit.object.userData.type === 'agent' ? hit.object.userData.id : '');
      if (!hit && !reduced && gsap) {
        var rect = canvas.getBoundingClientRect();
        var x = (event.clientX - rect.left) / rect.width - .5;
        var y = (event.clientY - rect.top) / rect.height - .5;
        gsap.to(root.rotation, { y: x * .12, x: -y * .055, duration: 1.15, ease: 'power2.out', overwrite: 'auto' });
      }
    }

    function onClick(event) {
      var hit = hitAt(event);
      if (!hit) { selectAgent('', true); return; }
      if (hit.object.userData.type === 'agent') { selectAgent(hit.object.userData.id, true); return; }
      if (hit.object.userData.type !== 'offer') return;
      var selected = offerNodes.find(function (node) { return node.offer.id === hit.object.userData.id; });
      if (!selected) return;
      focusOffer(selected.offer.id);
      onOfferClick(selected.offer.source);
    }

    function resize() {
      if (!viewport) return;
      var width = Math.max(viewport.clientWidth, 280);
      var height = Math.max(canvas.clientHeight || viewport.clientHeight, 360);
      camera.aspect = width / height;
      camera.position.z = camera.aspect < .85 ? 20.5 : 15.8;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }

    function updateLabels() {
      Object.keys(labels).forEach(function (id) {
        var label = labels[id];
        var group = agentGroups[id];
        if (!label || !group) return;
        var point = new THREE.Vector3();
        group.getWorldPosition(point);
        point.y += id === 'hunter' ? 1.28 : .8;
        point.project(camera);
        label.style.left = ((point.x * .5 + .5) * canvas.clientWidth) + 'px';
        label.style.top = ((-point.y * .5 + .5) * canvas.clientHeight) + 'px';
      });
    }

    function frame() {
      if (!running) return;
      frameId = requestAnimationFrame(frame);
      if (!reduced && offers.length) offerLayer.rotation.z += .00022;
      updateLabels();
      renderer.render(scene, camera);
    }

    function onVisibility() {
      running = !document.hidden;
      if (running) frame();
      else cancelAnimationFrame(frameId);
    }

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('click', onClick);
    document.addEventListener('visibilitychange', onVisibility);
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(viewport);
    } else window.addEventListener('resize', resize, { passive: true });

    runtime = {
      canvas: canvas,
      shell: shell,
      renderer: renderer,
      scene: scene,
      root: root,
      offers: function () { return offers.map(function (offer) { return offer.source; }); },
      onOfferClick: onOfferClick,
      onAgentSelect: onAgentSelect,
      setOffers: buildOffers,
      focusOffer: focusOffer,
      focusAgent: function (id) { selectAgent(id, true); },
      resize: resize,
      cleanup: function () {
        running = false;
        cancelAnimationFrame(frameId);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('click', onClick);
        document.removeEventListener('visibilitychange', onVisibility);
        if (resizeObserver) resizeObserver.disconnect();
        else window.removeEventListener('resize', resize);
        offerTweens.concat(routeTweens).forEach(function (tween) { if (tween && tween.kill) tween.kill(); });
        clearOffers();
        Object.keys(glowCache).forEach(function (key) { glowCache[key].dispose(); });
        disposeObject(root);
        renderer.dispose();
      }
    };

    resize();
    buildOffers([]);
    frame();
    metrics.ready = true;
    metrics.agents = agentNodes.length;
    return true;
  }

  function setOffers(offers) {
    if (runtime) runtime.setOffers(offers);
  }

  function focusOffer(id) {
    if (runtime) runtime.focusOffer(id);
  }

  function focusAgent(id) {
    if (runtime) runtime.focusAgent(id);
  }

  function resize() {
    if (runtime) runtime.resize();
  }

  function updateTheme() {
    if (!runtime) return;
    var canvas = runtime.canvas;
    var offers = runtime.offers();
    var onOfferClick = runtime.onOfferClick;
    var onAgentSelect = runtime.onAgentSelect;
    mount({ canvas: canvas, onOfferClick: onOfferClick, onAgentSelect: onAgentSelect });
    setOffers(offers);
  }

  function destroy() {
    if (!runtime) return;
    runtime.cleanup();
    runtime = null;
    metrics.ready = false;
  }

  function getMetrics() {
    return {
      ready: metrics.ready,
      agents: metrics.agents,
      offers: metrics.offers,
      theme: metrics.theme,
      fallback: metrics.fallback,
      selectedAgent: metrics.selectedAgent,
      reducedMotion: metrics.reducedMotion
    };
  }

  window.AferoLiveMap = {
    mount: mount,
    setOffers: setOffers,
    focusOffer: focusOffer,
    focusAgent: focusAgent,
    updateTheme: updateTheme,
    resize: resize,
    destroy: destroy,
    getMetrics: getMetrics
  };
}());
