// Global ShaderChunk patches installed at import time (same mechanism as three/examples/jsm/csm/CSM.js).
//
// 1. lights_fragment_begin: cascaded shadow selection. All shadow-casting DirectionalLights in the scene are
//    treated as cascades of ONE sun (light 0 carries the colour; lights 1..n-1 have intensity 0). For every
//    fragment the nearest cascade whose shadow map contains it is used, and RE_Direct runs once. This needs
//    no per-material uniforms, so every MeshStandard/Physical/Lambert/Phong material in the game gets CSM
//    without calling setupMaterial(), and it does not fight with Materials.withWind's onBeforeCompile.
// 2. fog_*: exponential height fog with a sun-ward in-scatter glow, driven by the standard scene.fog
//    (FogExp2) uniforms. World position is reconstructed from mvPosition + viewMatrix (no extra uniforms).
//    The fog is applied at the head of tonemapping_fragment, i.e. in linear HDR BEFORE exposure, tone
//    mapping and sRGB encoding. three's stock order (fog_fragment after colorspace_fragment) mixes a linear
//    fog colour into a display-encoded pixel when rendering straight to the canvas, but in linear light when
//    rendering to a HalfFloat target (effects' chain) — the same scene then differed by +39 % frame mean at
//    golden hour between the two paths (critic effects round 4). Measured after this change: identical.
import * as THREE from 'three';

const SC = THREE.ShaderChunk;

// ---------- 1. cascaded shadows ----------
const original = SC.lights_fragment_begin;
const dirStart = original.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )');
const dirEnd = original.indexOf('#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )');

const csmDirectional = /* glsl */ `
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )

	DirectionalLight directionalLight;

	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 1
		// SimSafari CSM: shadow-casting directional lights are cascades (near → far) of a single sun.
		DirectionalLightShadow csmLightShadow;
		float csmShadow = 1.0;
		bool csmFound = false;
		vec3 csmCoord;

		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {

			if ( ! csmFound ) {
				csmCoord = vDirectionalShadowCoord[ i ].xyz / vDirectionalShadowCoord[ i ].w;
				if ( csmCoord.x > 0.015 && csmCoord.x < 0.985 && csmCoord.y > 0.015 && csmCoord.y < 0.985 && csmCoord.z > 0.0 && csmCoord.z <= 1.0 ) {
					csmLightShadow = directionalLightShadows[ i ];
					csmShadow = getShadow( directionalShadowMap[ i ], csmLightShadow.shadowMapSize, csmLightShadow.shadowIntensity, csmLightShadow.shadowBias, csmLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] );
					csmFound = true;
				}
			}

		}
		#pragma unroll_loop_end

		directionalLight = directionalLights[ 0 ];
		getDirectionalLightInfo( directionalLight, directLight );
		directLight.color *= ( directLight.visible && receiveShadow ) ? csmShadow : 1.0;
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );

		#if ( NUM_DIR_LIGHTS > NUM_DIR_LIGHT_SHADOWS )
		#pragma unroll_loop_start
		for ( int i = NUM_DIR_LIGHT_SHADOWS; i < NUM_DIR_LIGHTS; i ++ ) {

			directionalLight = directionalLights[ i ];
			getDirectionalLightInfo( directionalLight, directLight );
			RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );

		}
		#pragma unroll_loop_end
		#endif

	#else

		#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
		DirectionalLightShadow directionalLightShadow;
		#endif

		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {

			directionalLight = directionalLights[ i ];

			getDirectionalLightInfo( directionalLight, directLight );

			#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
			directionalLightShadow = directionalLightShadows[ i ];
			directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
			#endif

			RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );

		}
		#pragma unroll_loop_end

	#endif

#endif

`;

// ---------- 2. height fog ----------
const fogParsVertex = /* glsl */ `
#ifdef USE_FOG
	varying float vFogDepth;
	varying vec3 vFogWorldPos;
#endif
`;
const fogVertex = /* glsl */ `
#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogWorldPos = cameraPosition + ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz;
#endif
`;
const fogParsFragment = /* glsl */ `
#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying vec3 vFogWorldPos;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif
`;
// fogDensity is interpreted as extinction per metre at ground level (y = 0); density halves every 90 m of height.
const fogFragment = /* glsl */ `
#if defined( USE_FOG ) && ! defined( SIM_FOG_DONE )
	#define SIM_FOG_DONE
	{
		vec3 fogRay = vFogWorldPos - cameraPosition;
		float fogDist = length( fogRay );
		float fogFactor;
		#ifdef FOG_EXP2
			const float fogH = 1.0 / 130.0;
			float fy0 = cameraPosition.y * fogH, fy1 = vFogWorldPos.y * fogH;
			float dy = fy1 - fy0;
			// integral of exp(-y*fogH) along the segment, normalised
			float heightTerm = abs( dy ) > 1e-3 ? ( exp( - fy0 ) - exp( - fy1 ) ) / dy : exp( - fy0 );
			heightTerm = min( heightTerm, 1.0 );
			fogFactor = 1.0 - exp( - fogDensity * fogDist * heightTerm );
		#else
			fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
		#endif
		// three uploads fogColor in the OUTPUT colour space (getUnlitUniformColorSpace: sRGB on the canvas,
		// linear into a render target) because its stock fog runs after encoding. This fog runs in linear
		// light, so decode it when the output is sRGB. The probe is a compile-time constant per program.
		vec3 fogCol = linearToOutputTexel( vec4( 0.5 ) ).r > 0.6 ? sRGBTransferEOTF( vec4( fogColor, 1.0 ) ).rgb : fogColor;
		vec3 fogColLin = fogCol;
		#if defined( RE_Direct ) && NUM_DIR_LIGHTS > 0
			vec3 fogSunDir = ( vec4( directionalLights[ 0 ].direction, 0.0 ) * viewMatrix ).xyz;
			float fogMu = max( 0.0, dot( fogRay / max( fogDist, 1e-3 ), normalize( fogSunDir ) ) );
			float fogSunLum = dot( directionalLights[ 0 ].color, vec3( 0.2126, 0.7152, 0.0722 ) );
			fogCol += fogColLin * ( 0.25 * pow( fogMu, 6.0 ) + 0.9 * pow( fogMu, 48.0 ) ) * min( 1.0, fogSunLum * 0.6 );
		#endif
		// three applies fog AFTER tonemapping_fragment and colorspace_fragment. Rendering straight to the
		// canvas, gl_FragColor is already tone-mapped display colour here while fogCol is linear HDR, so
		// fog read far darker than the sky it should match; rendering into the effects pipeline's linear
		// buffer (no in-material tone mapping) it was correct. Bring fogCol into the same space as
		// gl_FragColor so both paths agree (effects critic r4: "+39% at golden hour" was this).
		#ifdef TONE_MAPPING
			fogCol = toneMapping( fogCol );
		#endif
		fogCol = linearToOutputTexel( vec4( fogCol, 1.0 ) ).rgb;
		gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, clamp( fogFactor, 0.0, 1.0 ) );
	}
#endif
`;

// Fog in linear light, ahead of tone mapping; fog_fragment itself becomes a no-op once this ran (SIM_FOG_DONE).
const tonemappingFragment = fogFragment + SC.tonemapping_fragment;

let installed = false;
export function installChunks() {
  if (installed) return;
  installed = true;
  if (dirStart >= 0 && dirEnd > dirStart) {
    SC.lights_fragment_begin = original.slice(0, dirStart) + csmDirectional + original.slice(dirEnd);
  }
  SC.fog_pars_vertex = fogParsVertex;
  SC.fog_vertex = fogVertex;
  SC.fog_pars_fragment = fogParsFragment;
  SC.fog_fragment = fogFragment;
  SC.tonemapping_fragment = tonemappingFragment;
}

installChunks();
