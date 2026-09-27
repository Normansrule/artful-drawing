// Ink in water, for the landing page hero.
//
// A compact rewrite of the approach in Pavel Dobryakov's WebGL-Fluid-Simulation
// (https://github.com/PavelDoGreat/WebGL-Fluid-Simulation, MIT License):
// a stable-fluids solver on the graphics card (advection, curl and vorticity,
// divergence, pressure solve, gradient subtraction), with dye splats in
// artful drawing's palette. Pointer or touch movement stirs the ink.
//
// startFluid(canvas) returns { stop, splat } or null when WebGL2 isn't
// available. The page looks complete without it.

const PALETTE = [[1.0, 0.31, 0.53], [1.0, 0.81, 0.23], [0.07, 0.53, 0.49], [0.48, 0.38, 1.0], [0.36, 0.88, 0.9]];

const VERT = `#version 300 es
precision highp float;
in vec2 aPos;
out vec2 vUv, vL, vR, vT, vB;
uniform vec2 texel;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vL = vUv - vec2(texel.x, 0.0); vR = vUv + vec2(texel.x, 0.0);
  vT = vUv + vec2(0.0, texel.y); vB = vUv - vec2(0.0, texel.y);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv, vL, vR, vT, vB;
out vec4 outColor;
`;

const FRAG = {
  splat: `${HEAD}
uniform sampler2D uTarget; uniform float aspect; uniform vec3 color; uniform vec2 point; uniform float radius;
void main() {
  vec2 p = vUv - point; p.x *= aspect;
  vec3 splat = exp(-dot(p, p) / radius) * color;
  outColor = vec4(texture(uTarget, vUv).xyz + splat, 1.0);
}`,
  advect: `${HEAD}
uniform sampler2D uVelocity, uSource; uniform vec2 texel; uniform float dt, dissipation;
void main() {
  vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texel;
  outColor = texture(uSource, coord) / (1.0 + dissipation * dt);
}`,
  divergence: `${HEAD}
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vL).x, R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y, B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vL.x < 0.0) L = -C.x; if (vR.x > 1.0) R = -C.x;
  if (vT.y > 1.0) T = -C.y; if (vB.y < 0.0) B = -C.y;
  outColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`,
  curl: `${HEAD}
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vL).y, R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x, B = texture(uVelocity, vB).x;
  outColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`,
  vorticity: `${HEAD}
uniform sampler2D uVelocity, uCurl; uniform float curl, dt;
void main() {
  float L = texture(uCurl, vL).x, R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x, B = texture(uCurl, vB).x, C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C; force.y *= -1.0;
  vec2 v = texture(uVelocity, vUv).xy + force * dt;
  outColor = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0);
}`,
  pressure: `${HEAD}
uniform sampler2D uPressure, uDivergence;
void main() {
  float L = texture(uPressure, vL).x, R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x, B = texture(uPressure, vB).x;
  float d = texture(uDivergence, vUv).x;
  outColor = vec4((L + R + B + T - d) * 0.25, 0.0, 0.0, 1.0);
}`,
  gradient: `${HEAD}
uniform sampler2D uPressure, uVelocity;
void main() {
  float L = texture(uPressure, vL).x, R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x, B = texture(uPressure, vB).x;
  vec2 v = texture(uVelocity, vUv).xy - vec2(R - L, T - B);
  outColor = vec4(v, 0.0, 1.0);
}`,
  clear: `${HEAD}
uniform sampler2D uTexture; uniform float value;
void main() { outColor = value * texture(uTexture, vUv); }`,
  display: `${HEAD}
uniform sampler2D uTexture; uniform vec3 base;
void main() {
  vec3 c = texture(uTexture, vUv).rgb;
  float a = max(c.r, max(c.g, c.b));
  vec3 col = base + c * 0.7;
  outColor = vec4(col, 1.0);
}`,
};

export function startFluid(canvas, { base = [0.05, 0.043, 0.14], sim = 128, dyeRes = 768, auto = true } = {}) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: false });
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) return null;
  gl.getExtension('OES_texture_float_linear');
  const linear = !!gl.getExtension('OES_texture_float_linear') || true; // half floats filter linearly in WebGL2

  const compile = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const programs = {};
  for (const [name, src] of Object.entries(FRAG)) {
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, src));
    gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    programs[name] = { p, u };
  }

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  const ibuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  const fbo = (w, h, internal, format) => {
    gl.activeTexture(gl.TEXTURE0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const filter = linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.HALF_FLOAT, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fb, w, h, attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, tex); return id; } };
  };
  const double = (w, h, i, f) => {
    let a = fbo(w, h, i, f), b = fbo(w, h, i, f);
    return { get read() { return a; }, get write() { return b; }, swap() { [a, b] = [b, a]; }, w, h };
  };

  let dye, velocity, divergence, curl, pressure;
  const res = (r) => {
    const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
    const min = Math.round(r), max = Math.round(r * (aspect < 1 ? 1 / aspect : aspect));
    return aspect > 1 ? [max, min] : [min, max];
  };
  const init = () => {
    const [sw, sh] = res(sim), [dw, dh] = res(dyeRes);
    dye = double(dw, dh, gl.RGBA16F, gl.RGBA);
    velocity = double(sw, sh, gl.RG16F, gl.RG);
    divergence = fbo(sw, sh, gl.R16F, gl.RED);
    curl = fbo(sw, sh, gl.R16F, gl.RED);
    pressure = double(sw, sh, gl.R16F, gl.RED);
  };

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr)), h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; init(); }
  };

  const blit = (target) => {
    if (target) { gl.viewport(0, 0, target.w, target.h); gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb); }
    else { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  };
  const use = (name, texel) => {
    const pr = programs[name]; gl.useProgram(pr.p);
    if (pr.u.texel && texel) gl.uniform2f(pr.u.texel, 1 / texel.w, 1 / texel.h);
    return pr.u;
  };

  const splat = (x, y, dx, dy, color, radius = 0.25) => {
    const aspect = canvas.width / canvas.height;
    let u = use('splat', velocity);
    gl.uniform1i(u.uTarget, velocity.read.attach(0));
    gl.uniform1f(u.aspect, aspect);
    gl.uniform2f(u.point, x, y);
    gl.uniform3f(u.color, dx, dy, 0);
    gl.uniform1f(u.radius, (radius / 100) * (aspect > 1 ? aspect : 1));
    blit(velocity.write); velocity.swap();
    u = use('splat', dye);
    gl.uniform1i(u.uTarget, dye.read.attach(0));
    gl.uniform3f(u.color, color[0], color[1], color[2]);
    blit(dye.write); dye.swap();
  };

  const step = (dt) => {
    let u = use('curl', velocity); gl.uniform1i(u.uVelocity, velocity.read.attach(0)); blit(curl);
    u = use('vorticity', velocity);
    gl.uniform1i(u.uVelocity, velocity.read.attach(0)); gl.uniform1i(u.uCurl, curl.attach(1));
    gl.uniform1f(u.curl, 14); gl.uniform1f(u.dt, dt); blit(velocity.write); velocity.swap();
    u = use('divergence', velocity); gl.uniform1i(u.uVelocity, velocity.read.attach(0)); blit(divergence);
    u = use('clear', pressure); gl.uniform1i(u.uTexture, pressure.read.attach(0)); gl.uniform1f(u.value, 0.8); blit(pressure.write); pressure.swap();
    u = use('pressure', pressure); gl.uniform1i(u.uDivergence, divergence.attach(0));
    for (let i = 0; i < 20; i++) { gl.uniform1i(u.uPressure, pressure.read.attach(1)); blit(pressure.write); pressure.swap(); }
    u = use('gradient', velocity);
    gl.uniform1i(u.uPressure, pressure.read.attach(0)); gl.uniform1i(u.uVelocity, velocity.read.attach(1)); blit(velocity.write); velocity.swap();
    u = use('advect', velocity);
    gl.uniform1i(u.uVelocity, velocity.read.attach(0)); gl.uniform1i(u.uSource, velocity.read.attach(0));
    gl.uniform1f(u.dt, dt); gl.uniform1f(u.dissipation, 0.35); blit(velocity.write); velocity.swap();
    gl.uniform1i(u.uVelocity, velocity.read.attach(0)); gl.uniform1i(u.uSource, dye.read.attach(1));
    gl.uniform1f(u.dissipation, 1.1); blit(dye.write); dye.swap();
  };

  const render = () => {
    const u = use('display');
    gl.uniform1i(u.uTexture, dye.read.attach(0));
    gl.uniform3f(u.base, base[0], base[1], base[2]);
    blit(null);
  };

  resize();
  init();

  let colorIdx = 0;
  const nextColor = (k = 0.18) => { const c = PALETTE[colorIdx++ % PALETTE.length]; return c.map((v) => v * k); };

  // Pointer stirring
  let last = null;
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = 1 - (e.clientY - r.top) / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) { last = null; return; }
    if (last) {
      const dx = (x - last.x) * 5000, dy = (y - last.y) * 5000;
      if (Math.abs(dx) + Math.abs(dy) > 1) splat(x, y, dx, dy, last.color, 0.2);
    }
    last = { x, y, color: last?.color || nextColor() };
  };
  const onLeave = () => { last = null; };
  const onDown = () => { if (last) last.color = nextColor(); };
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });
  canvas.addEventListener('pointerleave', onLeave);

  // A few opening blooms, then an occasional drifting splat so the hero never sits still.
  const burst = () => {
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      splat(0.2 + Math.random() * 0.6, 0.2 + Math.random() * 0.6, Math.cos(a) * 900, Math.sin(a) * 900, nextColor(0.28), 0.35);
    }
  };
  burst();

  let raf = 0, prev = performance.now(), visible = true, nextAuto = prev + 2500;
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; }) : null;
  io?.observe(canvas);
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    if (!visible || document.hidden) { prev = now; return; }
    const dt = Math.min((now - prev) / 1000, 1 / 30);
    prev = now;
    resize();
    if (auto && now > nextAuto) {
      const a = Math.random() * Math.PI * 2;
      splat(0.15 + Math.random() * 0.7, 0.15 + Math.random() * 0.7, Math.cos(a) * 600, Math.sin(a) * 600, nextColor(0.22), 0.3);
      nextAuto = now + 1800 + Math.random() * 1800;
    }
    step(dt);
    render();
  };
  raf = requestAnimationFrame(loop);

  return {
    splat: (x, y, dx = 0, dy = 600) => splat(x, y, dx, dy, nextColor(0.3), 0.35),
    stop() {
      cancelAnimationFrame(raf); io?.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
    },
  };
}
