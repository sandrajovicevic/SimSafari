// Vehicle materials. Paint/tyre PBR sets are generated ONCE and shared by every kind/colour — only
// material.color differs per paint variant, so texture memory stays flat regardless of fleet size.
// All albedo below is TRUE LINEAR (core's `srgb:true` path does the single sRGB encode) per
// CLAUDE.md "Colour authoring" — no darkening compensation.
import * as THREE from 'three';

/** Subtle clearcoat scratch/fleck detail shared by every paint colour. */
function paintSet(textures) {
  return textures.pbr({
    key: 'traffic:paint',
    size: 512,
    normalStrength: 0.02,
    height: 'float height(vec2 uv){ return tfbm(uv, 10.0, 3, uSeed) * 0.5 + 0.5; }',
    roughness: 'float rough(vec2 uv, float h){ return clamp(0.32 + h * 0.22, 0.2, 0.6); }',
    ao: 'float ao(vec2 uv, float h){ return mix(0.92, 1.0, h); }',
  });
}

/** Tyre tread: circumferential grooves + diagonal block pattern on the cylinder's wrapped UV. */
function tyreSet(textures) {
  return textures.pbr({
    key: 'traffic:tyre',
    size: 512,
    normalStrength: 0.35,
    height: `float height(vec2 uv){
      float grooves = 0.5 + 0.5 * sin(uv.x * 64.0);
      float blocks = step(0.5, fract(uv.y * 5.0 + floor(uv.x * 16.0) * 0.5));
      float n = tfbm(uv, 6.0, 3, uSeed) * 0.15;
      return clamp(mix(0.25, 1.0, grooves) * mix(0.6, 1.0, blocks) + n, 0.0, 1.0);
    }`,
    roughness: 'float rough(vec2 uv, float h){ return 0.92; }',
    ao: 'float ao(vec2 uv, float h){ return mix(0.55, 1.0, h); }',
  });
}

export function buildMaterialLibrary(ctx) {
  const T = ctx.textures, M = ctx.materials;
  const paint = paintSet(T);
  const tyre = tyreSet(T);

  const paintCache = new Map();
  function paintMaterial(hex) {
    if (paintCache.has(hex)) return paintCache.get(hex);
    const m = M.physical({
      color: hex, roughness: 0.5, metalness: 0.08, clearcoat: 0.35, clearcoatRoughness: 0.22,
      vertexColors: true,
    });
    M.applyPbr(m, paint);
    m.name = `traffic-paint-${hex.toString(16)}`;
    paintCache.set(hex, m);
    return m;
  }

  const chrome = M.standard({ color: 0xd7d9dc, metalness: 1, roughness: 0.28, vertexColors: true });
  chrome.name = 'traffic-chrome';
  const glass = M.physical({
    color: 0x141d24, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.55,
    vertexColors: true, side: THREE.DoubleSide, depthWrite: false,
  });
  glass.name = 'traffic-glass';

  const tyreMat = M.standard({ color: 0x0c0c0c, roughness: 0.95, metalness: 0, vertexColors: true });
  tyreMat.name = 'traffic-tyre';
  M.applyPbr(tyreMat, tyre);
  const rimMat = M.standard({ color: 0xb9bcbf, metalness: 0.85, roughness: 0.35, vertexColors: true });
  rimMat.name = 'traffic-rim';

  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfff3d6, emissive: 0xfff0c8, emissiveIntensity: 0, roughness: 0.3, metalness: 0,
  });
  headlightMat.name = 'traffic-headlight';
  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0x3a0808, emissive: 0xb31212, emissiveIntensity: 0.15, roughness: 0.35, metalness: 0,
  });
  taillightMat.name = 'traffic-taillight';

  const skinMat = M.standard({ color: 0xffffff, roughness: 0.75, metalness: 0 });
  skinMat.name = 'traffic-skin';
  const clothingMat = M.standard({ color: 0xffffff, roughness: 0.75, metalness: 0 });
  clothingMat.name = 'traffic-clothing';

  return { paintMaterial, paintCache, chrome, glass, tyreMat, rimMat, headlightMat, taillightMat, skinMat, clothingMat };
}

export function disposeMaterialLibrary(ctx, lib) {
  const M = ctx.materials;
  for (const m of lib.paintCache.values()) { M.untrack?.(m); m.dispose(); }
  ctx.textures.dispose('traffic:paint:height'); ctx.textures.dispose('traffic:paint:albedo');
  ctx.textures.dispose('traffic:paint:orm'); ctx.textures.dispose('traffic:paint:normal');
  ctx.textures.dispose('traffic:tyre:height'); ctx.textures.dispose('traffic:tyre:albedo');
  ctx.textures.dispose('traffic:tyre:orm'); ctx.textures.dispose('traffic:tyre:normal');
  for (const name of ['chrome', 'glass', 'tyreMat', 'rimMat', 'headlightMat', 'taillightMat', 'skinMat', 'clothingMat']) {
    M.untrack?.(lib[name]); lib[name]?.dispose?.();
  }
}
