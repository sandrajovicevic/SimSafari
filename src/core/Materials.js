// Shared material factory: consistent PBR defaults, wind sway injection, shared time uniform.
import * as THREE from 'three';

export class Materials {
  constructor() {
    this.uniforms = {
      uTime: { value: 0 },
      uWindDir: { value: new THREE.Vector2(1, 0.2).normalize() },
      uWindSpeed: { value: 1.2 },
      uWindStrength: { value: 1 },
    };
    this.envMapIntensity = 1;
    this._tracked = new Set();
  }

  /** MeshStandardMaterial with project defaults. */
  standard(opts = {}) {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...opts });
    m.envMapIntensity = opts.envMapIntensity ?? this.envMapIntensity;
    this._tracked.add(m);
    return m;
  }

  /** MeshPhysicalMaterial with project defaults (use sparingly: water, glass, vehicle paint). */
  physical(opts = {}) {
    const m = new THREE.MeshPhysicalMaterial({ roughness: 0.6, metalness: 0, ...opts });
    m.envMapIntensity = opts.envMapIntensity ?? this.envMapIntensity;
    this._tracked.add(m);
    return m;
  }

  /** Apply a PBR set from Textures.pbr() to a material with a repeat in metres. */
  applyPbr(material, set, { repeatMetres = 4, tileUv = 1 } = {}) {
    material.map = set.map; material.normalMap = set.normalMap;
    material.roughnessMap = set.roughnessMap; material.aoMap = set.aoMap; material.metalnessMap = set.metalnessMap;
    material.userData.repeatMetres = repeatMetres;
    material.userData.tileUv = tileUv;
    material.needsUpdate = true;
    return material;
  }

  /**
   * Inject wind sway. Vertices above `pivotY` (object space) sway proportional to (y - pivotY)^2.
   * Works with instancing. strength in metres at 1 m height under uWindStrength 1 (typical grass 0.35, tree 0.02).
   */
  withWind(material, { strength = 0.3, pivotY = 0, frequency = 1 } = {}) {
    const uni = this.uniforms;
    const own = { uSway: { value: strength }, uPivot: { value: pivotY }, uFreq: { value: frequency } };
    material.userData.wind = own;
    const prev = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      prev?.(shader, renderer);
      Object.assign(shader.uniforms, uni, own);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
uniform float uTime; uniform vec2 uWindDir; uniform float uWindSpeed; uniform float uWindStrength;
uniform float uSway; uniform float uPivot; uniform float uFreq;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  #endif
  float hh = max(0.0, transformed.y - uPivot);
  float ph = dot(wp.xz, uWindDir) * 0.15 * uFreq + uTime * uWindSpeed * 1.7;
  float gust = sin(ph) * 0.6 + sin(ph * 2.31 + 1.3) * 0.3 + sin(ph * 5.7 + wp.x * 0.37) * 0.1;
  float sway = gust * uSway * uWindStrength * hh * hh;
  transformed.xz += uWindDir * sway;
}`);
    };
    material.customProgramCacheKey = () => 'wind' + (material.userData.cacheKeyExtra || '');
    return material;
  }

  /** Call once per frame from core. */
  update(dt, world) {
    this.uniforms.uTime.value += dt;
    if (world?.weather?.wind) {
      const w = world.weather.wind;
      this.uniforms.uWindDir.value.set(w.x, w.z).normalize();
      this.uniforms.uWindStrength.value = Math.min(3, (w.speed ?? 3) / 3);
    }
  }

  /** Set environment map on every tracked material (environment module calls this). */
  setEnvMap(envMap, intensity = 1) {
    this.envMap = envMap; this.envMapIntensity = intensity;
    for (const m of this._tracked) { m.envMap = envMap; m.envMapIntensity = intensity; m.needsUpdate = true; }
  }

  untrack(m) { this._tracked.delete(m); }
}
