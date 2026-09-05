// Heat haze: screen-space refraction of distant ground/skyline when it is hot and the sun is high.
// The GLSL half runs inside the pipeline's Resolve pass (it needs the scene depth); the JS half
// turns weather + sun into a 0..1 strength every frame.
import { clamp, smoothstep } from '../../core/Units.js';

/**
 * GLSL for the resolve shader. Declares its own uniforms; expects `snoise(vec3)` (GLSL_NOISE)
 * to be present. `hazeUv(uv)` returns the distorted lookup uv.
 *
 * How it works: linear view distance from depth selects a distance band [uHazeNear, uHazeFar];
 * the band is weighted by "height above the ground at that distance" so shimmer sits on the
 * ground/skyline, not up in the sky. Two animated 3D simplex fields give a rising, wavering
 * offset of ≤ uHazeAmp pixels. The offset is rejected when it would pull a near object's pixels
 * into the far band (depth compare at the displaced uv), so foreground silhouettes stay crisp.
 */
export const HAZE_GLSL = /* glsl */ `
uniform float uHaze;        // 0..1 strength
uniform float uHazeNear;    // metres: band start
uniform float uHazeFar;     // metres: full strength
uniform float uHazeAmp;     // pixels of displacement at full strength
uniform float uHazeHeight;  // metres above ground where the shimmer has faded out
uniform float uGroundY;     // approximate ground height (camera target)
uniform float uTime;
uniform vec2 uResolution;
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
uniform sampler2D tDepth;

vec3 hazeViewPos(vec2 uv, float d) {
  vec4 c = vec4(vec3(uv, d) * 2.0 - 1.0, 1.0);
  vec4 v = uProjInv * c;
  return v.xyz / v.w;
}

vec2 hazeUv(vec2 uv) {
  if (uHaze <= 0.0) return uv;
  float d = texture2D(tDepth, uv).x;
  vec3 vp = hazeViewPos(uv, d);
  float dist = length(vp);
  vec3 camPos = uCamWorld[3].xyz;
  vec3 wp = (uCamWorld * vec4(vp, 1.0)).xyz;
  vec3 dir = (wp - camPos) / max(dist, 1e-3);
  // height of the ray at (clamped) distance: sky rays near the horizon still count as "low"
  float dd = min(dist, uHazeFar * 1.5);
  float wy = camPos.y + dir.y * dd;
  float band = smoothstep(uHazeNear, uHazeFar, dist) * (1.0 - smoothstep(0.0, uHazeHeight, wy - uGroundY));
  float w = band * uHaze;
  if (w < 0.002) return uv;
  vec2 p = uv * vec2(uResolution.x / uResolution.y, 1.0);
  float n1 = snoise(vec3(p * 30.0, uTime * 1.9));
  float n2 = snoise(vec3(p * 44.0 + 13.0, uTime * 2.6 + 5.0));
  vec2 off = vec2(n1 * 0.6, n2 * 0.8 + 0.4) * uHazeAmp * w / uResolution;
  vec2 uv2 = clamp(uv + off, vec2(0.001), vec2(0.999));
  float d2 = texture2D(tDepth, uv2).x;
  float dist2 = length(hazeViewPos(uv2, d2));
  return dist2 > uHazeNear * 0.7 ? uv2 : uv;
}
`;

export class HeatHaze {
  constructor() {
    this.override = -1;        // ≥ 0 forces the strength (showcase / api.setHaze)
    this.tempThreshold = 30;   // °C where shimmer starts
    this.tempRange = 8;        // °C over which it reaches full strength
    this.near = 120;           // m
    this.far = 650;            // m
    this.amplitude = 3.0;      // px
    this.height = 18;          // m
    this.strength = 0;
  }

  /** @param {{temperature:number, sunUp:number}} p sunUp = max(0, sin(elevation)) */
  update({ temperature = 28, sunUp = 0 }) {
    if (this.override >= 0) { this.strength = clamp(this.override, 0, 1); return this.strength; }
    const tf = clamp((temperature - this.tempThreshold) / this.tempRange, 0, 1);
    const sf = smoothstep(0.3, 0.75, sunUp);
    this.strength = tf * sf;
    return this.strength;
  }
}
