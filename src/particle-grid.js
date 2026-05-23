(function () {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // ── Colours ───────────────────────────────────────────────────────────────
  var C_DARK_BASE  = 0x00b5ba;
  var C_LIGHT_BASE = 0x00d5da;
  var C_DARK_NEW   = 0x00fef0;
  var C_LIGHT_NEW  = 0x00b5ba;

  // ── Grid ──────────────────────────────────────────────────────────────────
  var GRID_HOST    = 'headerPlane';
  var GRID_COLS    = 30;
  var GRID_ROWS    = 30;
  var GRID_SPACING = 30;

  // ── Camera ────────────────────────────────────────────────────────────────
  var CAM_UP_Y   = -1;
  var FADE_NEAR  = 300;
  var FADE_FAR   = 450;

  // ── Wave ──────────────────────────────────────────────────────────────────
  var WAVE_AMPS   = [18, 14, 8];
  var TIME_FACTOR = 0.0003;

  // ── Animation constants ───────────────────────────────────────────────────
  var E_COUNT             = 15;
  var E_SPEED_MIN         = 0.01;
  var E_SPEED_MAX         = 0.2;
  var E_HUE_RANGE         = 90;
  var E_MIN_HOPS          = 3;
  var E_MAX_HOPS          = 10;
  var EDGE_GLOW_SIZE      = 0.7;
  var T_NEW               = 600;
  var T_STABLE            = 3600;
  var T_LEGACY            = 600;
  var STABLE_CLUSTERS     = 100;
  var STABLE_CLUSTER_SIZE = 10;
  var EL_SIZE             = 10;

  function createPlane(THREE, cfg) {
    cfg = cfg || {};
    var host = document.getElementById(cfg.hostId != null ? cfg.hostId : GRID_HOST);
    if (!host) return;

    var darkBase   = cfg.darkBase   != null ? cfg.darkBase   : C_DARK_BASE;
    var lightBase = cfg.lightBase != null ? cfg.lightBase : C_LIGHT_BASE;
    var darkNew   = cfg.darkNew   != null ? cfg.darkNew   : C_DARK_NEW;
    var lightNew  = cfg.lightNew  != null ? cfg.lightNew  : C_LIGHT_NEW;
    var eCount    = cfg.eCount    != null ? cfg.eCount    : E_COUNT;
    var eSpeedMin = cfg.eSpeedMin != null ? cfg.eSpeedMin : E_SPEED_MIN;
    var eSpeedMax = cfg.eSpeedMax != null ? cfg.eSpeedMax : E_SPEED_MAX;
    var eHueRange = cfg.eHueRange != null ? cfg.eHueRange : E_HUE_RANGE;
    var eMinHops  = cfg.eMinHops  != null ? cfg.eMinHops  : E_MIN_HOPS;
    var eMaxHops  = cfg.eMaxHops  != null ? cfg.eMaxHops  : E_MAX_HOPS;
    var dotSize   = cfg.dotSize   != null ? cfg.dotSize   : EDGE_GLOW_SIZE;
    var tNew      = cfg.tNew      != null ? cfg.tNew      : T_NEW;
    var tStable   = cfg.tStable   != null ? cfg.tStable   : T_STABLE;
    var tLegacy   = cfg.tLegacy   != null ? cfg.tLegacy   : T_LEGACY;
    var clusters  = cfg.clusters  != null ? cfg.clusters  : STABLE_CLUSTERS;
    var clSize    = cfg.clSize    != null ? cfg.clSize    : STABLE_CLUSTER_SIZE;
    var elSize    = cfg.elSize    != null ? cfg.elSize    : EL_SIZE;
    var fadeNear   = cfg.fadeNear   != null ? cfg.fadeNear   : FADE_NEAR;
    var fadeFar    = cfg.fadeFar    != null ? cfg.fadeFar    : FADE_FAR;
    var cols       = cfg.cols       != null ? cfg.cols       : GRID_COLS;
    var rows       = cfg.rows       != null ? cfg.rows       : GRID_ROWS;
    var spacing    = cfg.spacing    != null ? cfg.spacing    : GRID_SPACING;
    var cameraUpY  = cfg.cameraUpY  != null ? cfg.cameraUpY  : CAM_UP_Y;
    var waveAmps   = cfg.waveAmps   != null ? cfg.waveAmps   : WAVE_AMPS;
    var timeFactor = cfg.timeFactor != null ? cfg.timeFactor : TIME_FACTOR;

    var w = host.clientWidth, h = host.clientHeight;
    var COLS = cols, ROWS = rows, SPACING = spacing;
    var COUNT = COLS * ROWS;

    var scene = new THREE.Scene();
    var _group = new THREE.Group();
    if (cfg.rotationX) _group.rotation.x = cfg.rotationX;
    if (cfg.rotationY) _group.rotation.y = cfg.rotationY;
    if (cfg.rotationZ) _group.rotation.z = cfg.rotationZ;
    scene.add(_group);

    var camera = new THREE.PerspectiveCamera(cfg.fov || 55, w / h, 0.1, 3000);
    camera.up.set(0, cameraUpY, 0);
    var _cp = cfg.cameraPos || [0, 80, 460];
    camera.position.set(_cp[0], _cp[1], _cp[2]);
    camera.lookAt(0, 0, 0);

    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    // XZ grid — Y animated per frame as a wave
    var maxVisibleX = 550 * Math.tan(27.5 * Math.PI / 180) * (w / h);
    var basePositions = new Float32Array(COUNT * 3);
    var positions     = new Float32Array(COUNT * 3);
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var k = r * COLS + c;
        basePositions[k*3] = positions[k*3] = (c - (COLS - 1) / 2) * SPACING;
        basePositions[k*3+2] = positions[k*3+2] = (r - (ROWS - 1) / 2) * SPACING;
      }
    }

    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var lm     = isDark ? 0.0 : 1.0;

    // Shared vertex shader body: modelview, depth-fade, side-fade
    var GLSL_MV = [
      'vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      'float dist = -mv.z;',
      'vFade = 1.0 - smoothstep(uFadeNear, uFadeFar, dist);',
      'vec4 clip = projectionMatrix * mv;',
      'vSideFade = 1.0 - smoothstep(0.55, 1.00, abs(clip.x / clip.w));'
    ].join('\n');

    // ── Edges (dots) ──────────────────────────────────────────────────────
    var edgeState = new Uint8Array(COUNT);
    var edgeAge   = new Uint16Array(COUNT);
    var edgeGlow  = new Float32Array(COUNT);
    var edgeAlpha = new Float32Array(COUNT);
    var edgeColor = new Float32Array(COUNT * 3);
    var edgeGeom  = new THREE.BufferGeometry();
    edgeGeom.setAttribute('position', new THREE.BufferAttribute(positions,  3).setUsage(THREE.DynamicDrawUsage));
    edgeGeom.setAttribute('aGlow',    new THREE.BufferAttribute(edgeGlow,   1).setUsage(THREE.DynamicDrawUsage));
    edgeGeom.setAttribute('aAlpha',   new THREE.BufferAttribute(edgeAlpha,  1).setUsage(THREE.DynamicDrawUsage));
    edgeGeom.setAttribute('aColor',   new THREE.BufferAttribute(edgeColor,  3).setUsage(THREE.DynamicDrawUsage));
    var edgeMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        uBase:      { value: new THREE.Color(isDark ? darkBase : lightBase) },
        uSize:      { value: 4.5 },
        uDotSize:   { value: dotSize },
        uFadeNear:  { value: fadeNear },
        uFadeFar:   { value: fadeFar },
        uLightMode: { value: lm }
      },
      vertexShader: [
        'attribute float aGlow;',
        'attribute float aAlpha;',
        'attribute vec3 aColor;',
        'uniform float uSize, uDotSize, uFadeNear, uFadeFar;',
        'varying float vFade, vSideFade, vGlow, vAlpha;',
        'varying vec3 vColor;',
        'void main() {',
        GLSL_MV,
        '  vGlow = aGlow; vAlpha = aAlpha; vColor = aColor;',
        '  gl_Position = clip;',
        '  gl_PointSize = uSize * (1.0 + vGlow * uDotSize) * (300.0 / dist);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uBase;',
        'uniform float uLightMode;',
        'varying float vFade, vSideFade, vGlow, vAlpha;',
        'varying vec3 vColor;',
        'void main() {',
        '  float shape = smoothstep(0.5, 0.42, length(gl_PointCoord - 0.5));',
        '  if (shape <= 0.0 || vAlpha <= 0.0) discard;',
        '  vec3 col = mix(uBase, vColor, vGlow * 0.7) * (1.0 + vGlow * (1.0 - uLightMode));',
        '  gl_FragColor = vec4(col, shape * vAlpha * vFade * vSideFade);',
        '}'
      ].join('\n')
    });
    _group.add(new THREE.Points(edgeGeom, edgeMat));

    // ── Vertices (lines) + adjacency graph ────────────────────────────────
    var VERT_COUNT = ROWS*(COLS-1) + (ROWS-1)*COLS + 2*(ROWS-1)*(COLS-1);
    var vertPairs = new Int32Array(VERT_COUNT * 2);
    var adj = [];
    for (var k = 0; k < COUNT; k++) adj.push([]);
    var vpLen = 0;
    for (var rr = 0; rr < ROWS; rr++) {
      for (var cc = 0; cc < COLS; cc++) {
        var idx = rr * COLS + cc, vi;
        if (cc < COLS - 1) {
          vi = vpLen; vertPairs[vi*2] = idx; vertPairs[vi*2+1] = idx+1; vpLen++;
          adj[idx].push({ vi: vi, other: idx + 1 });
          adj[idx + 1].push({ vi: vi, other: idx });
        }
        if (rr < ROWS - 1) {
          vi = vpLen; vertPairs[vi*2] = idx; vertPairs[vi*2+1] = idx+COLS; vpLen++;
          adj[idx].push({ vi: vi, other: idx + COLS });
          adj[idx + COLS].push({ vi: vi, other: idx });
        }
        if (rr < ROWS - 1 && cc < COLS - 1) {
          vi = vpLen; vertPairs[vi*2] = idx; vertPairs[vi*2+1] = idx+COLS+1; vpLen++;
          adj[idx].push({ vi: vi, other: idx + COLS + 1 });
          adj[idx + COLS + 1].push({ vi: vi, other: idx });
        }
        if (rr < ROWS - 1 && cc > 0) {
          vi = vpLen; vertPairs[vi*2] = idx; vertPairs[vi*2+1] = idx+COLS-1; vpLen++;
          adj[idx].push({ vi: vi, other: idx + COLS - 1 });
          adj[idx + COLS - 1].push({ vi: vi, other: idx });
        }
      }
    }
    var vertState     = new Uint8Array(VERT_COUNT);
    var vertAge       = new Uint16Array(VERT_COUNT);
    var vertGlow      = new Float32Array(VERT_COUNT * 2);
    var vertAlpha     = new Float32Array(VERT_COUNT * 2);
    var vertColor     = new Float32Array(VERT_COUNT * 6);
    var vertPositions = new Float32Array(VERT_COUNT * 6);
    for (var s = 0; s < VERT_COUNT; s++) {
      var pa = vertPairs[s*2], pb = vertPairs[s*2+1];
      vertPositions[s*6]   = positions[pa*3]; vertPositions[s*6+2] = positions[pa*3+2];
      vertPositions[s*6+3] = positions[pb*3]; vertPositions[s*6+5] = positions[pb*3+2];
    }
    var vertGeom = new THREE.BufferGeometry();
    vertGeom.setAttribute('position', new THREE.BufferAttribute(vertPositions, 3).setUsage(THREE.DynamicDrawUsage));
    vertGeom.setAttribute('aGlow',    new THREE.BufferAttribute(vertGlow,      1).setUsage(THREE.DynamicDrawUsage));
    vertGeom.setAttribute('aAlpha',   new THREE.BufferAttribute(vertAlpha,     1).setUsage(THREE.DynamicDrawUsage));
    vertGeom.setAttribute('aColor',   new THREE.BufferAttribute(vertColor,     3).setUsage(THREE.DynamicDrawUsage));
    var vertMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        uBase:      { value: new THREE.Color(isDark ? darkBase : lightBase) },
        uFadeNear:  { value: fadeNear },
        uFadeFar:   { value: fadeFar },
        uLightMode: { value: lm }
      },
      vertexShader: [
        'attribute float aGlow;',
        'attribute float aAlpha;',
        'attribute vec3 aColor;',
        'uniform float uFadeNear, uFadeFar;',
        'varying float vFade, vSideFade, vGlow, vAlpha;',
        'varying vec3 vColor;',
        'void main() {',
        GLSL_MV,
        '  vGlow = aGlow; vAlpha = aAlpha; vColor = aColor;',
        '  gl_Position = clip;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uBase;',
        'uniform float uLightMode;',
        'varying float vFade, vSideFade, vGlow, vAlpha;',
        'varying vec3 vColor;',
        'void main() {',
        '  if (vAlpha <= 0.0) discard;',
        '  vec3 col = mix(uBase, vColor, vGlow * 0.75) * (1.0 + vGlow * (1.0 - uLightMode));',
        '  gl_FragColor = vec4(col, vAlpha * vFade * vSideFade);',
        '}'
      ].join('\n')
    });
    _group.add(new THREE.LineSegments(vertGeom, vertMat));

    // ── Initial stable clusters ───────────────────────────────────────────
    var baseGlowHSL = {};
    var _c = new THREE.Color(isDark ? darkNew : lightNew);
    _c.getHSL(baseGlowHSL);
    var stableNodes = [];
    for (var ci = 0; ci < clusters; ci++) {
      var clNode = Math.floor(Math.random() * COUNT);
      var clVisited = new Set([clNode]);
      for (var step = 0; step < clSize; step++) {
        var links = adj[clNode], cands = [];
        for (var j = 0; j < links.length; j++) { if (!clVisited.has(links[j].other)) cands.push(links[j]); }
        if (!cands.length) break;
        clNode = cands[Math.floor(Math.random() * cands.length)].other;
        clVisited.add(clNode);
      }
      clVisited.forEach(function(n) {
        edgeState[n] = 2; edgeAlpha[n] = 1.0;
        edgeColor[n*3] = _c.r; edgeColor[n*3+1] = _c.g; edgeColor[n*3+2] = _c.b;
        stableNodes.push(n);
        var nlinks = adj[n];
        for (var j = 0; j < nlinks.length; j++) {
          if (clVisited.has(nlinks[j].other)) {
            var vi = nlinks[j].vi;
            vertState[vi] = 2;
            vertAlpha[vi*2] = vertAlpha[vi*2+1] = 1.0;
            vertColor[vi*6]   = vertColor[vi*6+3] = _c.r;
            vertColor[vi*6+1] = vertColor[vi*6+4] = _c.g;
            vertColor[vi*6+2] = vertColor[vi*6+5] = _c.b;
          }
        }
      });
    }

    function _onResize() {
      var nw = host.clientWidth, nh = host.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
      maxVisibleX = 550 * Math.tan(27.5 * Math.PI / 180) * (nw / nh);
    }
    window.addEventListener('resize', _onResize);

    var observer = new MutationObserver(function () {
      isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      lm = isDark ? 0.0 : 1.0;
      var base = isDark ? darkBase : lightBase;
      edgeMat.uniforms.uBase.value.set(base);
      edgeMat.uniforms.uLightMode.value = lm;
      vertMat.uniforms.uBase.value.set(base);
      vertMat.uniforms.uLightMode.value = lm;
      new THREE.Color(isDark ? darkNew : lightNew).getHSL(baseGlowHSL);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // ── Electrons ─────────────────────────────────────────────────────────
    var electrons = [];

    function spawnElectron(nodeIdx) {
      var links = adj[nodeIdx];
      if (!links.length) return;
      var link = links[Math.floor(Math.random() * links.length)];
      var visited = new Set([nodeIdx]);
      var hueOff = (Math.random() * 2 - 1) * (eHueRange / 2 / 360);
      var ec = new THREE.Color().setHSL((baseGlowHSL.h + hueOff + 1) % 1, baseGlowHSL.s, baseGlowHSL.l);
      var speed = eSpeedMin + Math.random() * (eSpeedMax - eSpeedMin);
      electrons.push({ node: nodeIdx, next: link.other, vi: link.vi, prog: 0, hops: 0, visited: visited, cr: ec.r, cg: ec.g, cb: ec.b, speed: speed });
    }

    function pickSpawnNode(pool) {
      var weighted = [], i, ni, j, links, free, w;
      if (pool && pool.length) {
        for (i = 0; i < pool.length; i++) {
          ni = pool[i];
          if (Math.abs(basePositions[ni*3]) > maxVisibleX) continue;
          links = adj[ni]; free = 0;
          for (j = 0; j < links.length; j++) { if (vertState[links[j].vi] === 0) free++; }
          for (w = 0; w < free; w++) weighted.push(ni);
        }
      }
      if (!weighted.length) {
        for (ni = 0; ni < COUNT; ni++) {
          if (Math.abs(basePositions[ni*3]) > maxVisibleX) continue;
          links = adj[ni]; free = 0;
          for (j = 0; j < links.length; j++) { if (vertState[links[j].vi] === 0) free++; }
          for (w = 0; w < free; w++) weighted.push(ni);
        }
      }
      return weighted.length ? weighted[Math.floor(Math.random() * weighted.length)] : Math.floor(Math.random() * COUNT);
    }

    for (var ii = 0; ii < eCount; ii++) spawnElectron(pickSpawnNode(stableNodes));

    var electronPositions = new Float32Array(eCount * 3);
    var electronColors    = new Float32Array(eCount * 3);
    var electronGeom = new THREE.BufferGeometry();
    electronGeom.setAttribute('position', new THREE.BufferAttribute(electronPositions, 3).setUsage(THREE.DynamicDrawUsage));
    electronGeom.setAttribute('aColor',   new THREE.BufferAttribute(electronColors,    3).setUsage(THREE.DynamicDrawUsage));
    electronGeom.setDrawRange(0, 0);
    var electronMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        uSize:     { value: elSize },
        uFadeNear: { value: fadeNear },
        uFadeFar:  { value: fadeFar }
      },
      vertexShader: [
        'attribute vec3 aColor;',
        'uniform float uSize, uFadeNear, uFadeFar;',
        'varying float vFade, vSideFade;',
        'varying vec3 vColor;',
        'void main() {',
        GLSL_MV,
        '  vColor = aColor;',
        '  gl_Position = clip;',
        '  gl_PointSize = uSize * (300.0 / dist);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying float vFade, vSideFade;',
        'varying vec3 vColor;',
        'void main() {',
        '  float r = length(gl_PointCoord - 0.5);',
        '  float alpha = smoothstep(0.22, 0.12, r) + smoothstep(0.5, 0.18, r);',
        '  if (alpha <= 0.0) discard;',
        '  gl_FragColor = vec4(vColor, alpha * vFade * vSideFade);',
        '}'
      ].join('\n')
    });
    _group.add(new THREE.Points(electronGeom, electronMat));

    // ── Tick ──────────────────────────────────────────────────────────────
    var t0 = performance.now();
    var _raf, _alive = true;
    function tick() {
      if (!_alive) return;
      var t = (performance.now() - t0) * timeFactor;
      var wa = waveAmps;

      for (var k = 0; k < COUNT; k++) {
        var bx = basePositions[k*3], bz = basePositions[k*3+2];
        if (Math.abs(bx) > maxVisibleX) continue;
        positions[k*3+1] =
          Math.sin(bx * 0.012 + t * 1.4) * wa[0] +
          Math.cos(bz * 0.014 + t * 1.1) * wa[1] +
          Math.sin((bx + bz) * 0.008 + t * 0.7) * wa[2];
      }
      edgeGeom.attributes.position.needsUpdate = true;

      for (var s = 0; s < VERT_COUNT; s++) {
        var pa = vertPairs[s*2], pb = vertPairs[s*2+1];
        if (Math.abs(basePositions[pa*3]) > maxVisibleX && Math.abs(basePositions[pb*3]) > maxVisibleX) continue;
        vertPositions[s*6]   = positions[pa*3];   vertPositions[s*6+1] = positions[pa*3+1]; vertPositions[s*6+2] = positions[pa*3+2];
        vertPositions[s*6+3] = positions[pb*3];   vertPositions[s*6+4] = positions[pb*3+1]; vertPositions[s*6+5] = positions[pb*3+2];
      }
      vertGeom.attributes.position.needsUpdate = true;

      for (var k = 0; k < COUNT; k++) {
        if (Math.abs(basePositions[k*3]) > maxVisibleX) continue;
        var es = edgeState[k];
        if (es === 0) continue;
        if (es === 1) {
          edgeGlow[k] = 1.0 - edgeAge[k] / tNew;
          if (++edgeAge[k] >= tNew) { edgeState[k] = 2; edgeAge[k] = 0; edgeGlow[k] = 0.0; }
        } else if (es === 2) {
          if (tStable > 0 && ++edgeAge[k] >= tStable) { edgeState[k] = 3; edgeAge[k] = 0; }
        } else {
          edgeAlpha[k] = 1.0 - edgeAge[k] / tLegacy;
          if (++edgeAge[k] >= tLegacy) { edgeState[k] = 0; edgeAge[k] = 0; edgeAlpha[k] = 0.0; }
        }
      }

      for (var s = 0; s < VERT_COUNT; s++) {
        var pa = vertPairs[s*2], pb = vertPairs[s*2+1];
        if (Math.abs(basePositions[pa*3]) > maxVisibleX && Math.abs(basePositions[pb*3]) > maxVisibleX) continue;
        var vs = vertState[s];
        if (vs === 0) continue;
        if (vs === 1) {
          var g = 1.0 - vertAge[s] / tNew;
          vertGlow[s*2] = vertGlow[s*2+1] = g;
          if (++vertAge[s] >= tNew) { vertState[s] = 2; vertAge[s] = 0; vertGlow[s*2] = vertGlow[s*2+1] = 0.0; }
        } else if (vs === 2) {
          if (tStable > 0 && ++vertAge[s] >= tStable) { vertState[s] = 3; vertAge[s] = 0; }
        } else {
          var a = 1.0 - vertAge[s] / tLegacy;
          vertAlpha[s*2] = vertAlpha[s*2+1] = a;
          if (++vertAge[s] >= tLegacy) { vertState[s] = 0; vertAge[s] = 0; vertAlpha[s*2] = vertAlpha[s*2+1] = 0.0; }
        }
      }

      if (electrons.length < eCount) spawnElectron(pickSpawnNode(null));

      for (var i = electrons.length - 1; i >= 0; i--) {
        var e = electrons[i];
        e.prog += e.speed;
        if (e.prog >= 1.0) {
          e.prog -= 1.0;
          e.hops++;
          var prevVi = e.vi;
          e.node = e.next;
          vertState[prevVi] = 1; vertAge[prevVi] = 0;
          vertGlow[prevVi*2] = vertGlow[prevVi*2+1] = 1.0;
          vertAlpha[prevVi*2] = vertAlpha[prevVi*2+1] = 1.0;
          vertColor[prevVi*6]   = vertColor[prevVi*6+3] = e.cr;
          vertColor[prevVi*6+1] = vertColor[prevVi*6+4] = e.cg;
          vertColor[prevVi*6+2] = vertColor[prevVi*6+5] = e.cb;
          edgeState[e.node] = 1; edgeAge[e.node] = 0;
          edgeGlow[e.node] = 1.0; edgeAlpha[e.node] = 1.0;
          edgeColor[e.node*3] = e.cr; edgeColor[e.node*3+1] = e.cg; edgeColor[e.node*3+2] = e.cb;
          e.visited.add(e.node);
          var opts = adj[e.node], n = opts.length, chosen = null;
          var off = Math.floor(Math.random() * n);
          for (var j = 0; j < n; j++) {
            var cand = opts[(j + off) % n];
            if (!e.visited.has(cand.other)) { chosen = cand; break; }
          }
          if (!chosen || e.hops >= eMaxHops || (e.hops >= eMinHops && Math.random() < 0.12)) {
            electrons.splice(i, 1); continue;
          }
          e.next = chosen.other;
          e.vi   = chosen.vi;
        }
      }

      for (var i = 0; i < electrons.length; i++) {
        var e = electrons[i];
        var p = Math.min(e.prog, 1.0);
        electronPositions[i*3]   = positions[e.node*3]   + (positions[e.next*3]   - positions[e.node*3])   * p;
        electronPositions[i*3+1] = positions[e.node*3+1] + (positions[e.next*3+1] - positions[e.node*3+1]) * p;
        electronPositions[i*3+2] = positions[e.node*3+2] + (positions[e.next*3+2] - positions[e.node*3+2]) * p;
        electronColors[i*3] = e.cr; electronColors[i*3+1] = e.cg; electronColors[i*3+2] = e.cb;
      }
      electronGeom.setDrawRange(0, electrons.length);
      electronGeom.attributes.position.needsUpdate = true;
      electronGeom.attributes.aColor.needsUpdate   = true;

      edgeGeom.attributes.aGlow.needsUpdate  = true;
      edgeGeom.attributes.aAlpha.needsUpdate = true;
      edgeGeom.attributes.aColor.needsUpdate = true;
      vertGeom.attributes.aGlow.needsUpdate  = true;
      vertGeom.attributes.aAlpha.needsUpdate = true;
      vertGeom.attributes.aColor.needsUpdate = true;

      renderer.render(scene, camera);
      _raf = requestAnimationFrame(tick);
    }
    tick();

    function _destroy() {
      _alive = false;
      cancelAnimationFrame(_raf);
      observer.disconnect();
      window.removeEventListener('resize', _onResize);
      edgeGeom.dispose(); edgeMat.dispose();
      vertGeom.dispose(); vertMat.dispose();
      electronGeom.dispose(); electronMat.dispose();
      renderer.dispose();
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
    }
    return { camera: camera, destroy: _destroy };
  }

  // ── Header plane ──────────────────────────────────────────────────────────
  var script = document.createElement('script');
  script.src = 'three.min.js';
  script.onload = function () {
    var _hPlane = createPlane(window.THREE);
    window.addEventListener('scroll', function () {
      if (_hPlane && _hPlane.camera) {
        var sy = window.scrollY;
        _hPlane.camera.position.y = 80 + sy * 0.25
        _hPlane.camera.position.z = 460 + sy * 0.05;
        _hPlane.camera.lookAt(0, 0 - sy * 0.25, 0);
      }
    }, { passive: true });
  };
  document.head.appendChild(script);
})();
