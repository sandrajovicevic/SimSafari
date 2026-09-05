// Seeded RNG (sfc32). The only sanctioned source of randomness in the codebase.

export function hashString(str, seed = 0) {
  // cyrb53
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0) * 4294967296 + (h1 >>> 0);
}

export class Rng {
  constructor(seed = 1) {
    if (typeof seed === 'string') seed = hashString(seed);
    seed = Math.floor(seed);
    this.seed = seed;
    let a = (seed ^ 0x9e3779b9) >>> 0;
    let b = (Math.imul(seed, 0x85ebca6b) ^ 0x243f6a88) >>> 0;
    let c = (Math.imul(seed ^ 0xb7e15162, 0xc2b2ae35)) >>> 0;
    let d = (seed | 1) >>> 0;
    this._a = a; this._b = b; this._c = c; this._d = d;
    for (let i = 0; i < 16; i++) this.next();
  }

  /** uint32 */
  next() {
    let a = this._a, b = this._b, c = this._c, d = this._d;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this._a = a; this._b = b; this._c = c; this._d = d;
    return t >>> 0;
  }

  /** [0, 1) */
  float() { return this.next() / 4294967296; }
  /** [a, b) */
  range(a, b) { return a + (b - a) * this.float(); }
  /** integer in [a, b] inclusive */
  int(a, b) { return a + Math.floor(this.float() * (b - a + 1)); }
  bool(p = 0.5) { return this.float() < p; }
  sign() { return this.float() < 0.5 ? -1 : 1; }
  pick(arr) { return arr.length ? arr[Math.floor(this.float() * arr.length)] : undefined; }
  /** weighted pick: items [{w, v}] or parallel arrays */
  weighted(items, weights) {
    let total = 0;
    for (let i = 0; i < items.length; i++) total += weights ? weights[i] : items[i].w;
    let r = this.float() * total;
    for (let i = 0; i < items.length; i++) {
      const w = weights ? weights[i] : items[i].w;
      if (r < w) return weights ? items[i] : items[i].v;
      r -= w;
    }
    return weights ? items[items.length - 1] : items[items.length - 1].v;
  }
  gaussian(mean = 0, sd = 1) {
    let u = 0, v = 0;
    while (u === 0) u = this.float();
    while (v === 0) v = this.float();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.float() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  /** Deterministic child generator. Same seed + same name → same stream. */
  fork(name) { return new Rng(hashString(String(name), this.seed)); }
}
