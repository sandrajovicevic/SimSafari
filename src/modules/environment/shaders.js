// GLSL sources for the environment module. All linear HDR; tone mapping happens in the dome shaders
// through three's tonemapping_fragment so renderer.toneMappingExposure applies uniformly.
import { GLSL_NOISE } from '../../core/Textures.js';
import { ATMOS } from './atmosphere.js';

const A = ATMOS;

export const ATMOS_GLSL = /* glsl */ `
const float Re = ${A.Re.toFixed(1)};
const float Ra = ${A.Ra.toFixed(1)};
const float Rg = ${(A.Re + A.ground).toFixed(1)};
const float Hr = ${A.Hr.toFixed(1)};
const float Hm = ${A.Hm.toFixed(1)};
const vec3 betaR = vec3(${A.betaR.join(', ')});
const float betaM0 = ${A.betaM};
const vec3 betaO = vec3(${A.betaO.join(', ')});
const float PI = 3.14159265359;

vec2 raySphere(vec3 o, vec3 d, float R) {
  float b = dot(o, d); float c = dot(o, o) - R * R; float disc = b * b - c;
  if (disc < 0.0) return vec2(-1.0);
  float s = sqrt(disc); return vec2(-b - s, -b + s);
}
vec3 densities(float h) { return vec3(exp(-h / Hr), exp(-h / Hm), max(0.0, 1.0 - abs(h - 25000.0) / 15000.0)); }
vec3 extinction(vec3 od, float turb) { return exp(-(betaR * od.x + betaM0 * turb * 1.1 * od.y + betaO * od.z)); }
// optical depth from p toward s; returns w<0 if occluded by the earth
vec4 lightDepth(vec3 p, vec3 s) {
  vec2 g = raySphere(p, s, Re);
  if (g.x > 0.0) return vec4(0.0, 0.0, 0.0, -1.0);
  float t = raySphere(p, s, Ra).y;
  const int N = 6; float step = t / float(N); vec3 acc = vec3(0.0);
  for (int i = 0; i < N; i++) { vec3 q = p + s * ((float(i) + 0.5) * step); acc += densities(length(q) - Re) * step; }
  return vec4(acc, 1.0);
}
float phaseHG(float mu, float g) { float g2 = g * g; return 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * g * mu, 1.5)); }
// in-scatter along d from origin o (absolute), light s with irradiance E. outT = transmittance to ray end.
vec3 inscatter(vec3 o, vec3 d, vec3 s, float E, float turb, float g, out vec3 outT) {
  float tmax = raySphere(o, d, Ra).y;
  vec2 gh = raySphere(o, d, Rg);
  if (gh.x > 0.0) tmax = gh.x;
  const int N = 24;
  vec3 sumR = vec3(0.0), sumM = vec3(0.0), od = vec3(0.0);
  float tPrev = 0.0;
  for (int i = 0; i < N; i++) {
    float f = (float(i) + 1.0) / float(N); float t = tmax * f * f; float step = t - tPrev; float tm = 0.5 * (t + tPrev); tPrev = t;
    vec3 p = o + d * tm; vec3 dens = densities(length(p) - Re); od += dens * step;
    vec4 ld = lightDepth(p, s); if (ld.w < 0.0) continue;
    vec3 T = extinction(od + ld.xyz, turb);
    sumR += dens.x * T * step; sumM += dens.y * T * step;
  }
  outT = extinction(od, turb);
  float mu = dot(d, s);
  float phR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float phM = phaseHG(mu, g);
  return E * (betaR * phR * sumR + betaM0 * turb * phM * sumM);
}
// equirect mapping with more resolution near the horizon
vec2 dirToLut(vec3 d) { float u = atan(d.z, d.x) / (2.0 * PI) + 0.5; float v = 0.5 + 0.5 * sign(d.y) * sqrt(abs(d.y)); return vec2(u, v); }
vec3 lutToDir(vec2 uv) { float a = (uv.x - 0.5) * 2.0 * PI; float sy = (uv.y - 0.5) * 2.0; float y = sign(sy) * sy * sy; float c = sqrt(max(0.0, 1.0 - y * y)); return vec3(cos(a) * c, y, sin(a) * c); }
`;

// ---------- sky LUT (rendered to a 512x256 half-float RT whenever the sun/moon/turbidity change) ----------
export const LUT_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
export const LUT_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec3 uSunDir; uniform vec3 uMoonDir; uniform float uSunE; uniform float uMoonE; uniform float uTurbidity; uniform float uG;
${ATMOS_GLSL}
void main(){
  vec3 d = lutToDir(vUv);
  vec3 o = vec3(0.0, Rg + ${A.observer.toFixed(1)}, 0.0);
  vec3 T; vec3 L = inscatter(o, d, uSunDir, uSunE, uTurbidity, uG, T);
  vec3 Tm; if (uMoonE > 0.0) L += inscatter(o, d, uMoonDir, uMoonE, uTurbidity, uG, Tm);
  gl_FragColor = vec4(L, dot(T, vec3(0.333)));
}`;

// ---------- sky dome: LUT + sun disc + moon + stars/milky way + below-horizon plain ----------
export const SKY_VERT = /* glsl */ `
varying vec3 vWorldDir;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w;
}`;
export const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec3 vWorldDir;
uniform sampler2D uLut; uniform sampler2D uNight; uniform sampler2D uMoonTex;
uniform vec3 uSunDir; uniform vec3 uMoonDir; uniform vec3 uSunDisc; uniform vec3 uMoonColor;
uniform float uSunDiscOn; uniform float uNightAmount; uniform float uStarScale; uniform mat3 uCelestial;
uniform vec3 uGroundLit; uniform vec3 uHorizon; uniform float uCloudDim; uniform float uCamHeight;
${ATMOS_GLSL}
void main(){
  vec3 d = normalize(vWorldDir);
  vec4 lut = texture2D(uLut, dirToLut(d));
  vec3 col = lut.rgb;
  float mu = dot(d, uSunDir);
  if (d.y < 0.0) {
    // distant savannah plain: ground albedo lit, then aerial perspective from the LUT
    float dist = uCamHeight / max(0.02, -d.y);
    float fade = 1.0 - exp(-dist * 0.00035);
    vec3 plain = uGroundLit * lut.a;
    col = mix(plain, lut.rgb + plain, fade);
    col = mix(col, uHorizon, smoothstep(-0.02, 0.0, d.y) * 0.5);
  } else {
    // sun: limb-darkened disc + tight corona (the wide Mie glow lives in the LUT)
    float ang = acos(clamp(mu, -1.0, 1.0));
    float disc = 1.0 - smoothstep(0.0044, 0.0050, ang);
    float limb = sqrt(max(0.0, 1.0 - pow(ang / 0.0047, 2.0)));
    vec3 sun = uSunDisc * (disc * (0.6 + 0.4 * limb) + 0.06 * exp(-ang * 90.0) + 0.012 * exp(-ang * 18.0));
    col += sun * uSunDiscOn * smoothstep(-0.03, 0.02, uSunDir.y + 0.02);
    // stars & milky way in celestial frame
    if (uNightAmount > 0.001) {
      vec3 cd = uCelestial * d;
      vec2 nuv = vec2(atan(cd.z, cd.x) / (2.0 * PI) + 0.5, asin(clamp(cd.y, -1.0, 1.0)) / PI + 0.5);
      vec3 night = texture2D(uNight, nuv).rgb * uStarScale;
      float horizonFade = smoothstep(0.0, 0.12, d.y);
      col += night * uNightAmount * horizonFade * uCloudDim;
    }
    // moon: analytic sphere shading gives the phase for free
    float mang = acos(clamp(dot(d, uMoonDir), -1.0, 1.0));
    const float moonR = 0.0046;
    if (mang < moonR * 1.6 && uMoonDir.y > -0.02) {
      vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDir));
      vec3 up2 = cross(uMoonDir, right);
      float x = dot(d, right) / moonR, y = dot(d, up2) / moonR;
      float r2 = x * x + y * y;
      float inside = 1.0 - smoothstep(0.96, 1.04, sqrt(r2));
      float z = sqrt(max(0.0, 1.0 - min(r2, 1.0)));
      vec3 n = normalize(x * right + y * up2 - z * uMoonDir);
      float lit = max(0.0, dot(n, uSunDir));
      lit = lit / (lit + 0.15) * 1.15; // Lommel-Seeliger-ish, flatter than Lambert
      vec2 muv = vec2(atan(x, z) / PI * 0.5 + 0.5, asin(clamp(y, -1.0, 1.0)) / PI + 0.5);
      float albedo = texture2D(uMoonTex, muv).r;
      vec3 moon = uMoonColor * albedo * (lit + 0.012);
      col = mix(col, col + moon, inside);
      col += uMoonColor * 0.015 * exp(-mang * 120.0);
    }
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------- cloud dome: cumulus layer (1.8 km) + cirrus (8 km) from a tileable noise texture ----------
export const CLOUD_FRAG = /* glsl */ `
precision highp float;
varying vec3 vWorldDir;
uniform sampler2D uNoise;
uniform vec3 uSunDir; uniform vec3 uSunLight; uniform vec3 uSunHigh; uniform vec3 uAmbient; uniform vec3 uHorizon;
uniform float uCoverage; uniform float uCirrus; uniform float uStorm; uniform float uTime; uniform vec2 uWind; uniform float uCamHeight;
uniform float uMoonBoost;
const float PI = 3.14159265359;

float cloudShape(vec2 p, float cov) {
  vec4 n1 = texture2D(uNoise, p);
  vec4 n2 = texture2D(uNoise, p * 3.1 + vec2(0.37, 0.11) + (n1.ga - 0.5) * 0.06);
  float shape = n1.r * 0.62 + n1.b * 0.38;
  float base = clamp((shape - (1.0 - cov)) / max(0.08, cov * 0.55), 0.0, 1.0);
  float detail = n2.g * 0.6 + n2.a * 0.4;
  float dens = clamp(base - (1.0 - base) * detail * 0.45, 0.0, 1.0);
  return dens;
}

void main(){
  vec3 d = normalize(vWorldDir);
  float dy = d.y + 0.035; // fake earth curvature: layer visible a little below the horizontal
  if (dy <= 0.002) discard;
  vec3 col = vec3(0.0); float alpha = 0.0;
  float mu = dot(d, uSunDir);
  float sunUp = smoothstep(-0.12, 0.05, uSunDir.y);

  // --- cirrus (8 km) ---
  if (uCirrus > 0.005) {
    float t2 = (8000.0 - uCamHeight) / dy;
    vec2 p2 = (d.xz * t2) * 0.000045 + uWind * uTime * 0.00004 + vec2(0.31, 0.77);
    vec4 c1 = texture2D(uNoise, p2 * vec2(1.0, 0.35));
    vec4 c2 = texture2D(uNoise, p2 * vec2(3.0, 1.2) + 0.23);
    float wisp = pow(clamp(c1.g * 0.7 + c2.g * 0.3, 0.0, 1.0), 2.5) * uCirrus;
    wisp *= smoothstep(0.0, 0.08, dy);
    vec3 cirCol = uSunHigh * (0.9 + 0.8 * pow(max(mu, 0.0), 6.0)) + uAmbient * 0.6;
    float a2 = clamp(wisp * 1.4, 0.0, 0.6);
    col = cirCol * a2; alpha = a2;
  }

  // --- cumulus / stratus (1.8 km) ---
  float t = (1800.0 - uCamHeight) / dy;
  vec2 base = d.xz * t;
  vec2 p = base * 0.00021 + uWind * uTime * 0.00018;
  float cov = uCoverage;
  float dens = cloudShape(p, cov);
  if (dens > 0.001) {
    // cheap self shadowing: density toward the sun, 2 taps
    vec2 toSun = normalize(uSunDir.xz + vec2(1e-4, 0.0)) * (0.25 + 0.75 * (1.0 - abs(uSunDir.y)));
    float dSun = cloudShape(p + toSun * 0.012, cov) * 0.6 + cloudShape(p + toSun * 0.03, cov) * 0.4;
    float thick = dens;
    float shade = exp(-dSun * 2.6 * (0.6 + thick)) ;
    float silver = pow(max(mu, 0.0), 10.0) * (1.0 - thick) * 1.6;
    vec3 lit = uSunLight * (shade * (0.55 + 0.45 * (1.0 - thick)) + silver);
    vec3 amb = uAmbient * (0.8 - 0.45 * thick);
    vec3 c = (lit + amb) * mix(1.0, 0.55, uStorm);
    float a = 1.0 - exp(-dens * 4.5);
    a *= smoothstep(0.0, 0.05, dy);
    // aerial perspective toward the horizon
    float aer = 1.0 - exp(-t * 0.000025);
    c = mix(c, uHorizon, aer);
    col = col * (1.0 - a) + c * a; alpha = alpha * (1.0 - a) + a;
  }
  col *= mix(1.0, 1.0 + uMoonBoost, 1.0 - sunUp);
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(col / max(alpha, 1e-4), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------- stars (bright ones as points; the faint field + milky way are in the sky texture) ----------
export const STAR_VERT = /* glsl */ `
attribute float aSize; attribute vec3 aColor; attribute float aTwinkle;
uniform float uTime; uniform float uPixelRatio; uniform float uAmount;
varying vec3 vColor; varying float vAlpha;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float tw = 0.75 + 0.25 * sin(uTime * (1.5 + aTwinkle * 2.0) + aTwinkle * 40.0);
  vAlpha = uAmount * tw;
  vColor = aColor;
  gl_PointSize = aSize * uPixelRatio * (0.8 + 0.2 * tw);
  gl_Position = projectionMatrix * mv;
}`;
export const STAR_FRAG = /* glsl */ `
precision highp float;
uniform float uScale;
varying vec3 vColor; varying float vAlpha;
void main(){
  vec2 c = gl_PointCoord - 0.5; float r2 = dot(c, c) * 4.0;
  float a = exp(-r2 * 3.0) * (1.0 - smoothstep(0.7, 1.0, r2));
  gl_FragColor = vec4(vColor * uScale * vAlpha * a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------- rain streaks: one quad per drop, animated in the vertex shader ----------
export const RAIN_VERT = /* glsl */ `
attribute vec3 aOffset; attribute vec2 aCorner; attribute float aSeed;
uniform float uTime; uniform vec3 uCenter; uniform vec3 uVolume; uniform vec3 uFall; uniform float uIntensity;
varying float vA; varying float vT;
void main(){
  float speed = 9.0 + aSeed * 4.0;
  vec3 p = aOffset;
  p.y = fract(p.y - uTime * speed / uVolume.y);
  // horizontal drift with the wind while falling
  p.xz = fract(p.xz + uFall.xz * ((1.0 - p.y) * uVolume.y) / uVolume.xz);
  vec3 world = uCenter + (p - 0.5) * uVolume;
  // streak axis follows the fall direction; billboard around it toward the camera
  vec3 axis = normalize(uFall);
  vec3 toCam = normalize(cameraPosition - world);
  vec3 right = normalize(cross(axis, toCam));
  float dist = length(cameraPosition - world);
  float len = 0.35 + aSeed * 0.35;
  float width = max(0.012, dist * 0.0012);
  vec3 v = world + axis * (aCorner.y * len) + right * (aCorner.x * width);
  // fade at the volume edges so the box is invisible
  float edge = min(min(1.0 - abs(p.x - 0.5) * 2.0, 1.0 - abs(p.z - 0.5) * 2.0), 1.0 - abs(p.y - 0.5) * 2.0);
  vA = uIntensity * smoothstep(0.0, 0.25, edge) * (0.55 + 0.45 * aSeed);
  vT = aCorner.y + 0.5;
  gl_Position = projectionMatrix * viewMatrix * vec4(v, 1.0);
}`;
export const RAIN_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
varying float vA; varying float vT;
void main(){
  float a = vA * (1.0 - vT) * 0.55 * (0.5 + 0.5 * smoothstep(0.0, 0.2, vT));
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------- one-off textures (ctx.textures.gpu) ----------
export const NIGHT_TEX_GLSL = /* glsl */ `
vec3 hash33(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
vec3 dirFromUv(vec2 uv){ float phi = (uv.x - 0.5) * 6.2831853; float th = (uv.y - 0.5) * 3.14159265; return vec3(cos(th) * cos(phi), sin(th), cos(th) * sin(phi)); }
vec3 starLayer(vec3 d, float cells, float seed, float sigma, float density, float bright) {
  vec3 p = d * cells; vec3 ip = floor(p); vec3 sum = vec3(0.0);
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 c = ip + vec3(float(x), float(y), float(z));
    vec3 h = hash33(c + seed);
    if (h.x > density) continue;
    vec3 h2 = hash33(c * 1.7 + seed + 11.3);
    vec3 sp = normalize(c + h2);
    float ang = acos(clamp(dot(d, sp), -1.0, 1.0));
    float mag = pow(h.y, 6.0);            // few bright, many faint
    float s = sigma * (0.7 + 1.1 * mag);
    float blob = exp(-ang * ang / (2.0 * s * s));
    float temp = h.z;
    vec3 col = mix(vec3(1.0, 0.72, 0.5), vec3(0.72, 0.82, 1.0), temp);
    sum += col * blob * (0.02 + bright * mag);
  }
  return sum;
}
vec4 shade(vec2 uv){
  vec3 d = dirFromUv(uv);
  // galactic frame
  vec3 gn = normalize(vec3(0.82, 0.5, 0.27));
  vec3 e1 = normalize(cross(gn, vec3(0.0, 0.0, 1.0)));
  vec3 e2 = cross(gn, e1);
  float b = asin(clamp(dot(d, gn), -1.0, 1.0));          // galactic latitude
  float l = atan(dot(d, e2), dot(d, e1));                  // galactic longitude (0 = centre)
  float core = exp(-l * l / 1.1);
  float width = 0.11 + 0.16 * core;
  float band = exp(-b * b / (2.0 * width * width));
  float bulge = exp(-(l * l * 2.2 + b * b * 9.0));
  float structure = 0.55 + 0.75 * (fbm(d * 5.0 + 3.1, 5) * 0.5 + 0.5);
  float dust = smoothstep(0.35, 0.8, fbm(vec3(l * 2.2, b * 9.0, 0.7) + d * 2.0, 4) * 0.5 + 0.5) * exp(-b * b / (2.0 * 0.05 * 0.05));
  float mw = band * structure * (0.35 + 0.9 * core + 1.4 * bulge) * (1.0 - 0.8 * dust);
  vec3 mwCol = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.86, 0.7), core) * mw * 0.22;
  // faint star field (two layers)
  vec3 stars = starLayer(d, 46.0, 1.0 + uSeed, 0.0035, 0.75, 1.0) + starLayer(d, 150.0, 7.0 + uSeed, 0.0026, 0.55, 0.25);
  stars *= 1.0 + 1.2 * band; // denser field inside the band
  return vec4(mwCol + stars, 1.0);
}`;

export const MOON_TEX_GLSL = /* glsl */ `
vec4 shade(vec2 uv){
  float maria = smoothstep(0.52, 0.66, tfbm(uv, 3.0, 5, 3.0 + uSeed) * 0.5 + 0.5);
  vec2 w = tworley(uv, 14.0, 5.0 + uSeed);
  float crater = smoothstep(0.08, 0.16, w.x) * 0.2 + 0.8;
  float fine = tfbm(uv, 24.0, 4, 9.0 + uSeed) * 0.5 + 0.5;
  float albedo = mix(0.85, 0.45, maria) * crater * (0.85 + 0.3 * fine);
  return vec4(vec3(clamp(albedo, 0.0, 1.0)), 1.0);
}`;

export const CLOUD_NOISE_GLSL = /* glsl */ `
vec4 shade(vec2 uv){
  float shape = tfbm(uv, 3.0, 5, 1.0 + uSeed) * 0.5 + 0.5;
  float detail = tfbm(uv, 9.0, 5, 4.0 + uSeed) * 0.5 + 0.5;
  vec2 w1 = tworley(uv, 6.0, 2.0 + uSeed); vec2 w2 = tworley(uv, 13.0, 8.0 + uSeed);
  float billow = clamp(1.0 - (w1.x * 0.65 + w2.x * 0.35) * 1.6, 0.0, 1.0);
  float hi = tfbm(uv, 22.0, 4, 6.0 + uSeed) * 0.5 + 0.5;
  return vec4(shape, detail, billow, hi);
}`;

export { GLSL_NOISE };
