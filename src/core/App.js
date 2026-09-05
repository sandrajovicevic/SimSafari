// Application core: renderer, scene, camera rig, loop, module registry, window.__SIM__ verification hooks.
import * as THREE from 'three';
import { Log } from './Log.js';
import { EventBus } from './EventBus.js';
import { World } from './World.js';
import { ModuleRegistry } from './ModuleRegistry.js';
import { CameraRig } from './CameraRig.js';
import { Perf } from './Perf.js';
import { Textures } from './Textures.js';
import { Materials } from './Materials.js';
import { parseParams } from './Showcase.js';
import { hourToSunElevation, hourToSunAzimuth, wrapHour, clamp } from './Units.js';

const SIM_TICKS_PER_HOUR = 10;

export class App {
  constructor(container) {
    this.container = container;
    this.params = parseParams();
    this.log = new Log();
    this.events = new EventBus(this.log);
    this.world = new World({ seed: this.params.seed, size: this.params.size });
    this.ready = false;
    this.time = 0;
    this._simAcc = 0;
    this._renderFn = null;
    this._afterReadyFrames = 0;
    this.input = { x: 0, y: 0, ndcX: 0, ndcY: 0, buttons: 0, toolActive: false, ground: new THREE.Vector3(), groundValid: false };

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.info.autoReset = false;
    container.appendChild(renderer.domElement);
    renderer.domElement.tabIndex = 0;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87a8c8);
    this.camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.5, 6000);
    this.rig = new CameraRig(this.camera, renderer.domElement, this.world, this.input);
    this.perf = new Perf(renderer);
    this.textures = new Textures(renderer);
    this.materials = new Materials();
    this.registry = new ModuleRegistry(this);

    // Fallback lighting / ground so a lone module is visible without environment/terrain.
    this.fallback = new THREE.Group(); this.fallback.name = 'core-fallback';
    this.scene.add(this.fallback);

    this._bindInput();
    window.addEventListener('resize', () => this._resize());
    this._resize();
    this._exposeSim();
  }

  // ---------- lifecycle ----------

  async start() {
    this._loop(); // render loop runs no matter what happens below
    const p = this.params;
    const boot = document.getElementById('boot');
    const say = (t) => { if (boot) boot.textContent = t; this.log.info('[boot] ' + t); };

    if (p.probe) {
      say('probing modules…');
      this.__SIM__.presets = await this.registry.probe();
      this.__SIM__.corePresets = Object.fromEntries([...this.rig.presets].map(([k, v]) => [k, v]));
      this._setReady();
      say(`probe done: ${Object.keys(this.__SIM__.presets).length} modules`);
      return;
    }

    let ids;
    if (p.module) ids = [p.module];
    else if (p.modules) ids = p.modules;
    else ids = this.registry.available.filter((id) => !(p.noui && id === 'ui'));
    say(`loading ${ids.join(', ')}…`);
    await this.registry.load(ids);

    if (!Number.isNaN(p.tod)) this.setTimeOfDay(p.tod, true);
    if (p.module) this.world.time.paused = !p.play;
    if (!Number.isNaN(p.speed)) this.world.time.speed = p.speed;

    say('initialising…');
    await this.registry.initAll();
    this._ensureFallbacks();

    let presetDef = null;
    if (p.module) {
      const rec = this.registry.modules.get(p.module);
      const presets = rec?.def?.showcase?.presets || {};
      presetDef = presets[p.preset] || null;
      if (!presetDef && p.preset !== 'overview') this.log.warn(`[core] preset "${p.preset}" not found in ${p.module}; using core overview`);
      if (presetDef?.tod !== undefined && Number.isNaN(p.tod)) this.setTimeOfDay(presetDef.tod, true);
      say(`staging ${p.module}/${p.preset}…`);
      await this.registry.stage(p.module, p.preset);
    }
    // camera: preset → rig preset name → core preset
    if (presetDef?.camera) {
      if (typeof presetDef.camera === 'string') this.rig.setPreset(presetDef.camera) || this.rig.setPreset('overview');
      else this.rig.apply(presetDef.camera);
    } else if (!this.rig.setPreset(p.preset)) this.rig.setPreset('overview');
    this.rig.update(0);

    this.events.emit('core:ready', {});
    this._afterReadyFrames = 3; // mark ready after a few rendered frames
    say('');
  }

  _ensureFallbacks() {
    const reg = this.registry;
    if (!reg.has('environment')) {
      const sun = new THREE.DirectionalLight(0xffffff, 3);
      sun.name = 'fallback-sun';
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = sun.shadow.camera.bottom = -300;
      sun.shadow.camera.right = sun.shadow.camera.top = 300;
      sun.shadow.camera.near = 1; sun.shadow.camera.far = 2000;
      sun.shadow.bias = -0.0005;
      const hemi = new THREE.HemisphereLight(0xbfd4ee, 0x8b7a55, 1.2);
      this.fallback.add(sun, sun.target, hemi);
      this._fallbackSun = sun; this._fallbackHemi = hemi;
      this._updateFallbackSun();
      this.events.on('time:set', () => this._updateFallbackSun(), 'core');
    }
    if (!reg.has('terrain')) {
      const geo = new THREE.PlaneGeometry(this.world.size, this.world.size, 1, 1);
      geo.rotateX(-Math.PI / 2);
      const mat = this.materials.standard({ color: 0xa8956a, roughness: 1 });
      const ground = new THREE.Mesh(geo, mat);
      ground.name = 'fallback-ground'; ground.receiveShadow = true;
      this.fallback.add(ground);
    }
  }

  _updateFallbackSun() {
    const sun = this._fallbackSun; if (!sun) return;
    const h = this.world.time.hour;
    const el = hourToSunElevation(h), az = hourToSunAzimuth(h);
    const up = Math.max(0, Math.sin(el));
    sun.position.set(Math.cos(az) * Math.cos(el) * 800, Math.sin(el) * 800, -Math.sin(az) * Math.cos(el) * 800);
    sun.target.position.set(0, 0, 0);
    sun.intensity = 3.2 * up;
    sun.color.setHSL(0.09, 0.5, 0.5 + 0.5 * Math.min(1, up * 3));
    this._fallbackHemi.intensity = 0.12 + 1.1 * up;
    this.scene.background.setHSL(0.58, 0.45, 0.06 + 0.6 * up);
  }

  // ---------- time ----------

  setTimeOfDay(hour, silent = false) {
    this.world.time.hour = wrapHour(hour);
    this.events.emit('time:set', { hour: this.world.time.hour, day: this.world.time.day, silent });
  }

  setSpeed(speed) { this.world.time.speed = speed; this.world.time.paused = speed === 0; }

  /** effects module installs a post-processing render function: fn(scene, camera, dt). */
  setRenderFn(fn) { this._renderFn = fn; }

  // ---------- loop ----------

  _loop() {
    const timer = new THREE.Timer();
    const frame = () => {
      requestAnimationFrame(frame);
      timer.update();
      const dt = clamp(timer.getDelta(), 0, 0.1);
      this.time += dt;
      this.perf.beginFrame();
      this.renderer.info.reset();

      // game time
      const T = this.world.time;
      if (!T.paused && T.speed > 0) {
        const gh = dt * T.speed; // game hours elapsed
        T.hour += gh;
        while (T.hour >= 24) { T.hour -= 24; T.day++; }
        this._simAcc += gh;
        const step = 1 / SIM_TICKS_PER_HOUR;
        let n = 0;
        while (this._simAcc >= step && n < 20) {
          this._simAcc -= step; n++;
          this.registry.tick(step);
          this.events.emit('time:tick', { hour: T.hour, day: T.day, simDt: step });
        }
      }

      this.materials.update(dt, this.world);
      this.rig.update(dt);
      this._updateInputGround();
      this.registry.update(dt, this.time);

      try {
        if (this._renderFn) this._renderFn(this.scene, this.camera, dt);
        else this.renderer.render(this.scene, this.camera);
      } catch (err) {
        // A broken post-process chain must not kill the game: fall back to direct render.
        this.log.error('[core] render function threw; disabling custom render fn', err);
        this._renderFn = null;
        this.renderer.render(this.scene, this.camera);
      }
      this.perf.endFrame();

      if (this._afterReadyFrames > 0 && --this._afterReadyFrames === 0) this._setReady();
    };
    frame();
  }

  _setReady() {
    this.ready = true;
    this.__SIM__.ready = true;
    document.getElementById('boot')?.remove();
  }

  _resize() {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.events.emit('core:resize', { width: w, height: h });
  }

  _bindInput() {
    const dom = this.renderer.domElement;
    const upd = (e) => {
      const r = dom.getBoundingClientRect();
      this.input.x = e.clientX - r.left; this.input.y = e.clientY - r.top;
      this.input.ndcX = (this.input.x / r.width) * 2 - 1;
      this.input.ndcY = -(this.input.y / r.height) * 2 + 1;
      this.input.buttons = e.buttons;
    };
    dom.addEventListener('pointermove', upd);
    dom.addEventListener('pointerdown', (e) => { upd(e); dom.focus(); this.events.emit('input:down', { button: e.button, ...this._inputPayload() }); });
    dom.addEventListener('pointerup', (e) => { upd(e); this.events.emit('input:up', { button: e.button, ...this._inputPayload() }); });
    window.addEventListener('keydown', (e) => { if (!e.target.closest?.('input,textarea')) this.events.emit('input:key', { code: e.code, key: e.key, shift: e.shiftKey, ctrl: e.ctrlKey }); });
  }

  _inputPayload() {
    const g = this.input;
    return { x: g.x, y: g.y, ndcX: g.ndcX, ndcY: g.ndcY, ground: g.groundValid ? { x: g.ground.x, y: g.ground.y, z: g.ground.z } : null };
  }

  _updateInputGround() {
    const g = this.input;
    g.groundValid = !!this.rig.groundAt(g.ndcX, g.ndcY, g.ground);
  }

  // ---------- verification hooks ----------

  _exposeSim() {
    const app = this;
    const sim = {
      ready: false,
      get errors() { return app.log.errors; },
      get warnings() { return app.log.warnings; },
      get fps() { return app.perf.fps; },
      get frameMs() { return app.perf.frameMs; },
      get drawCalls() { return app.renderer.info.render.calls; },
      get triangles() { return app.renderer.info.render.triangles; },
      get modules() { return app.registry.status(); },
      get world() { return app.world; },
      get events() { return app.events; },
      app,
      params: this.params,
      setTimeOfDay: (h) => app.setTimeOfDay(h),
      setSpeed: (s) => app.setSpeed(s),
      setCameraPreset: (n) => app.rig.setPreset(n),
      setCamera: (c) => app.rig.setCamera(c),
      lookAt: (x, z, d, p, y) => app.rig.lookAt(x, z, d, p, y),
      getCamera: () => app.rig.getState(),
      /** Render one frame synchronously and return stats + PNG data URL. */
      capture: (withImage = true) => {
        app.rig.update(0);
        app.registry.update(0, app.time);
        app.renderer.info.reset();
        if (app._renderFn) app._renderFn(app.scene, app.camera, 0); else app.renderer.render(app.scene, app.camera);
        const stats = app.stats();
        if (withImage) stats.dataUrl = app.renderer.domElement.toDataURL('image/png');
        return stats;
      },
      stats: () => app.stats(),
    };
    this.__SIM__ = sim;
    window.__SIM__ = sim;
  }

  stats() {
    const gl = this.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
    return {
      ready: this.ready,
      ...this.perf.snapshot(),
      gpu,
      errors: this.log.errors.slice(),
      warnings: this.log.warnings.slice(),
      modules: this.registry.status(),
      time: { ...this.world.time },
      camera: this.rig.getState(),
      world: this.world.snapshot(),
      texturesGenerated: this.textures.generated,
      note: /swiftshader|llvmpipe|software/i.test(gpu) ? 'software GL: fps is not representative of GPU performance' : undefined,
    };
  }
}
