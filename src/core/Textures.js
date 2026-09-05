// Procedural PBR texture generation on the GPU (render-to-texture with a GLSL snippet),
// plus CPU canvas/data helpers. Every texture in the game comes from here or from module GLSL.
import * as THREE from 'three';

/** GLSL noise library injected into every generator and reusable by module shaders. */
export const GLSL_NOISE = /* glsl */ `
vec3 mod289v3(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec2 mod289v2(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289v4(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec3 permute3(vec3 x){return mod289v3(((x*34.0)+1.0)*x);}
vec4 permute4(vec4 x){return mod289v4(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt4(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec2 v){
  const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
  vec2 i=floor(v+dot(v,C.yy)); vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
  vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1; i=mod289v2(i);
  vec3 p=permute3(permute3(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0); m=m*m; m=m*m;
  vec3 x=2.0*fract(p*C.www)-1.0; vec3 h=abs(x)-0.5; vec3 ox=floor(x+0.5); vec3 a0=x-ox;
  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
  vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw; return 130.0*dot(m,g);
}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy; i=mod289v3(i);
  vec4 p=permute4(permute4(permute4(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt4(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec2 p,int oct){float s=0.0,a=1.0,n=0.0;for(int i=0;i<8;i++){if(i>=oct)break;s+=a*snoise(p);n+=a;a*=0.5;p=p*2.03+vec2(17.1,9.7);}return s/n;}
float fbm(vec3 p,int oct){float s=0.0,a=1.0,n=0.0;for(int i=0;i<8;i++){if(i>=oct)break;s+=a*snoise(p);n+=a;a*=0.5;p=p*2.03+vec3(17.1,9.7,3.3);}return s/n;}
float ridged(vec2 p,int oct){float s=0.0,a=1.0,n=0.0;for(int i=0;i<8;i++){if(i>=oct)break;float v=1.0-abs(snoise(p));s+=a*v*v;n+=a;a*=0.5;p=p*2.05+vec2(3.7,11.3);}return s/n;}
// tileable versions: sample 3D noise on a torus so uv in [0,1] wraps seamlessly
float tnoise(vec2 uv,float freq,float seed){
  float a=uv.x*6.28318530718, b=uv.y*6.28318530718;
  vec3 p=vec3(cos(a),sin(a),cos(b))*freq*0.5+seed; vec3 q=vec3(sin(b),cos(a+1.7),sin(a+b))*freq*0.5+seed*1.3;
  return snoise(p+q*0.5);
}
float tfbm(vec2 uv,float freq,int oct,float seed){float s=0.0,a=1.0,n=0.0;for(int i=0;i<8;i++){if(i>=oct)break;s+=a*tnoise(uv,freq,seed+float(i)*7.3);n+=a;a*=0.5;freq*=2.0;}return s/n;}
float tridged(vec2 uv,float freq,int oct,float seed){float s=0.0,a=1.0,n=0.0;for(int i=0;i<8;i++){if(i>=oct)break;float v=1.0-abs(tnoise(uv,freq,seed+float(i)*5.1));s+=a*v*v;n+=a;a*=0.5;freq*=2.0;}return s/n;}
// tileable worley (cells): uv in [0,1], n cells per side
vec2 tworley(vec2 uv,float n,float seed){
  vec2 p=uv*n; vec2 i=floor(p); vec2 f=p-i; float d1=8.0,d2=8.0;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 g=vec2(float(x),float(y)); vec2 c=mod(i+g,n);
    vec2 h=fract(sin(vec2(dot(c+seed,vec2(127.1,311.7)),dot(c+seed,vec2(269.5,183.3))))*43758.5453);
    vec2 r=g+h-f; float d=dot(r,r); if(d<d1){d2=d1;d1=d;}else if(d<d2){d2=d;}
  }
  return vec2(sqrt(d1),sqrt(d2));
}
float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*0.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
vec3 linearToSRGBv(vec3 c){return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-0.055,step(0.0031308,c));}
`;

const VERT = /* glsl */ `
out vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export class Textures {
  constructor(renderer) {
    this.renderer = renderer;
    this.cache = new Map();
    this._scene = new THREE.Scene();
    this._cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this._quad.frustumCulled = false;
    this._scene.add(this._quad);
    this.maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    this.generated = 0;
  }

  /**
   * Render a GLSL snippet to a texture.
   * glsl must define `vec4 shade(vec2 uv)`. Available: GLSL_NOISE, uniforms uSeed(float), uSize(float),
   * uTime(float) plus any in `uniforms`. Uniforms passed in `uniforms` are DECLARED AUTOMATICALLY
   * (float / vec2 / vec3 / vec4 / sampler2D by value type) — do not redeclare them in the snippet.
   * opts: { key, size=1024, uniforms, srgb=false, mipmaps=true, wrap=RepeatWrapping, type=UnsignedByteType, anisotropy }
   * If srgb=true the snippet should output LINEAR colour; encoding is applied here and the texture is tagged sRGB.
   */
  gpu(glsl, opts = {}) {
    const {
      key = null, size = 1024, uniforms = {}, srgb = false, mipmaps = true,
      wrap = THREE.RepeatWrapping, type = THREE.UnsignedByteType, anisotropy = this.maxAnisotropy, seed = 0,
      width = size, height = size,
    } = opts;
    if (key && this.cache.has(key)) return this.cache.get(key);

    const uni = { uSeed: { value: seed }, uSize: { value: width }, uTime: { value: 0 } };
    let decl = '';
    for (const [k, v] of Object.entries(uniforms)) {
      const val = v && v.value !== undefined ? v.value : v;
      uni[k] = { value: val };
      if (val instanceof THREE.Texture) decl += `uniform sampler2D ${k};\n`;
      else if (typeof val === 'number') decl += `uniform float ${k};\n`;
      else if (val?.isVector2) decl += `uniform vec2 ${k};\n`;
      else if (val?.isVector3 || val?.isColor) decl += `uniform vec3 ${k};\n`;
      else if (val?.isVector4) decl += `uniform vec4 ${k};\n`;
    }
    const frag = /* glsl */ `
precision highp float; precision highp int;
in vec2 vUv; out vec4 fragColor;
uniform float uSeed; uniform float uSize; uniform float uTime;
${decl}
${GLSL_NOISE}
${glsl}
void main(){ vec4 c = shade(vUv); ${srgb ? 'c.rgb = clamp(c.rgb, 0.0, 1.0);' : ''} fragColor = c; }
`;
// NOTE: in the srgb path the snippet's LINEAR output is written as-is. Do NOT encode to sRGB here.
// The render target below is allocated with SRGBColorSpace, which gives it an sRGB internal format,
// so the GPU performs the linear->sRGB conversion on framebuffer write. Encoding in the shader as
// well double-encoded every albedo in the project: linear 0.216 was stored as byte 188 instead of
// 128, i.e. ~37% too bright, which is what made every surface read washed out toward white.
    const mat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: frag, uniforms: uni, depthTest: false, depthWrite: false });
    const rt = new THREE.WebGLRenderTarget(width, height, {
      type, depthBuffer: false, stencilBuffer: false,
      generateMipmaps: mipmaps,
      minFilter: mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: wrap, wrapT: wrap,
      anisotropy,
      colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace,
    });
    this._quad.material = mat;
    const r = this.renderer;
    const prevRT = r.getRenderTarget();
    const prevXr = r.xr.enabled; r.xr.enabled = false;
    const prevAuto = r.autoClear; r.autoClear = true;
    r.setRenderTarget(rt);
    r.render(this._scene, this._cam);
    r.setRenderTarget(prevRT);
    r.xr.enabled = prevXr; r.autoClear = prevAuto;
    mat.dispose();
    const tex = rt.texture;
    tex.name = key || 'gpu-texture';
    tex.needsUpdate = false;
    tex.userData.renderTarget = rt;
    this.generated++;
    if (key) this.cache.set(key, tex);
    return tex;
  }

  /**
   * Tangent-space normal map from a tileable height texture (R channel, 0..1).
   * strength ≈ metres of relief per texture tile; typical 0.02–0.2 for ground.
   */
  normalFromHeight(heightTex, { key = null, size = 1024, strength = 0.1 } = {}) {
    return this.gpu(/* glsl */ `
vec4 shade(vec2 uv){
  float px = 1.0 / uSize;
  float l = texture(uH, uv + vec2(-px, 0.0)).r, r = texture(uH, uv + vec2(px, 0.0)).r;
  float d = texture(uH, uv + vec2(0.0, -px)).r, u = texture(uH, uv + vec2(0.0, px)).r;
  vec3 n = normalize(vec3((l - r) * uStrength * uSize * 0.5, (d - u) * uStrength * uSize * 0.5, 1.0));
  return vec4(n * 0.5 + 0.5, 1.0);
}`, { key, size, uniforms: { uH: heightTex, uStrength: strength }, srgb: false });
  }

  /**
   * Full PBR set from GLSL snippets.
   * spec: { key, size, height: 'float height(vec2 uv){...}', albedo: 'vec3 albedo(vec2 uv, float h){...}',
   *         roughness: 'float rough(vec2 uv, float h){...}' (default 0.9), ao: optional 'float ao(vec2 uv,float h)', normalStrength }
   * Returns { map, normalMap, roughnessMap (= ormMap), aoMap (= ormMap), metalnessMap (= ormMap), heightMap }.
   * ORM packing: R=ao, G=roughness, B=metalness — matches MeshStandardMaterial channel reads.
   */
  pbr(spec) {
    const { key, size = 1024, normalStrength = 0.08, seed = 0 } = spec;
    const heightFn = spec.height || 'float height(vec2 uv){ return tfbm(uv, 4.0, 6, uSeed) * 0.5 + 0.5; }';
    const albedoFn = spec.albedo || 'vec3 albedo(vec2 uv, float h){ return mix(vec3(0.35,0.3,0.2), vec3(0.6,0.5,0.35), h); }';
    const roughFn = spec.roughness || 'float rough(vec2 uv, float h){ return 0.9; }';
    const aoFn = spec.ao || 'float ao(vec2 uv, float h){ return mix(0.75, 1.0, h); }';
    const heightMap = this.gpu(`${heightFn}\nvec4 shade(vec2 uv){ return vec4(vec3(height(uv)), 1.0); }`,
      { key: key && key + ':height', size, type: THREE.HalfFloatType, mipmaps: false, seed });
    const map = this.gpu(`${albedoFn}\nvec4 shade(vec2 uv){ float h = texture(uH, uv).r; return vec4(albedo(uv, h), 1.0); }`,
      { key: key && key + ':albedo', size, uniforms: { uH: heightMap }, srgb: true, seed });
    const orm = this.gpu(`${roughFn}\n${aoFn}\nvec4 shade(vec2 uv){ float h = texture(uH, uv).r; return vec4(ao(uv,h), rough(uv,h), 0.0, 1.0); }`,
      { key: key && key + ':orm', size, uniforms: { uH: heightMap }, seed });
    const normalMap = this.normalFromHeight(heightMap, { key: key && key + ':normal', size, strength: normalStrength });
    return { map, normalMap, roughnessMap: orm, aoMap: orm, metalnessMap: orm, ormMap: orm, heightMap };
  }

  /** 2D canvas texture (icons, decals, text). draw(ctx, size). */
  canvas(size, draw, { key = null, srgb = true, repeat = false } = {}) {
    if (key && this.cache.has(key)) return this.cache.get(key);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.anisotropy = this.maxAnisotropy;
    if (key) this.cache.set(key, tex);
    return tex;
  }

  /** CPU data texture. fill(x, y, out[4]) writes 0..255 into out. */
  data(width, height, fill, { key = null, srgb = false, repeat = true } = {}) {
    if (key && this.cache.has(key)) return this.cache.get(key);
    const arr = new Uint8Array(width * height * 4);
    const px = [0, 0, 0, 255];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      px[0] = 0; px[1] = 0; px[2] = 0; px[3] = 255;
      fill(x, y, px);
      const i = (y * width + x) * 4;
      arr[i] = px[0]; arr[i + 1] = px[1]; arr[i + 2] = px[2]; arr[i + 3] = px[3];
    }
    const tex = new THREE.DataTexture(arr, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = this.maxAnisotropy;
    tex.needsUpdate = true;
    if (key) this.cache.set(key, tex);
    return tex;
  }

  dispose(key) {
    if (key) {
      const t = this.cache.get(key);
      if (t) { t.userData.renderTarget?.dispose(); t.dispose(); this.cache.delete(key); }
      return;
    }
    for (const t of this.cache.values()) { t.userData.renderTarget?.dispose(); t.dispose(); }
    this.cache.clear();
  }
}
