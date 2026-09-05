// Species catalogue. Every number is in metres / kg / m/s. `body` drives the procedural mesh
// builder (builder.js), `tex` selects the procedural skin (skin.js), the rest drives behaviour.
//
// Body conventions: animal faces +Z, right side +X, up +Y. shoulderH/hipH are top-of-back heights.
// bodyLen = horizontal distance shoulder joint → hip joint. Leg profiles are radius multipliers of
// legs.r at [hip/shoulder, stifle/elbow, hock/knee, fetlock, foot].

const DEG = Math.PI / 180;

function habitat(grass, trees, waterDist, roughness, space, predatorTolerance) {
  return { grass, trees, waterDist, roughness, space, predatorTolerance };
}

export const SPECIES = {
  elephant: {
    id: 'elephant', name: 'African elephant', latin: 'Loxodonta africana', diet: 'mixed',
    mass: 5000, shoulder: 3.2, length: 6.0, herd: [5, 10], speed: { walk: 1.1, run: 5.5 },
    habitat: habitat(0.5, 0.6, 250, 0.3, 900, 1.0), appeal: 1.0, rarity: 0.3, activity: 'diurnal',
    predator: false, prey: false, alertRadius: 25, lieProb: 0.15, drinkRate: 0.5,
    body: {
      shoulderH: 3.2, hipH: 2.95, bodyLen: 2.4, chestDepth: 1.85, chestW: 1.45, bellyDepth: 1.95, bellyW: 1.6,
      hipDepth: 1.6, hipW: 1.35, rumpLen: 0.7, chestLen: 0.55, backSag: -0.06, sq: 0.85,
      neck: { len: 0.55, angle: 12, r0: 0.62, r1: 0.55, arch: 0.02 },
      head: {
        len: 1.35, pitch: 38, w: 0.95,
        profile: [[0, 0.5, 0.52, 0], [0.18, 0.55, 0.62, 0.06], [0.4, 0.52, 0.56, 0.02], [0.62, 0.42, 0.42, -0.06], [0.82, 0.3, 0.3, -0.12], [1, 0.19, 0.19, -0.16]],
        eye: { s: 0.52, r: 0.045, side: 0.98 },
      },
      ears: { len: 1.25, w: 1.05, thick: 0.03, s: 0.22, out: 55, up: -10, back: 25, type: 'flap' },
      legs: { hindY: 2.05, foreY: 2.25, r: 0.27, hindProf: [1.40, 1.10, 0.72, 0.60, 0.62], foreProf: [1.35, 1.08, 0.70, 0.58, 0.62], zig: 0.34, hindX: 0.42, foreX: 0.44, foot: 'column' },
      tail: { len: 1.3, r: 0.07, angle: 8, tuft: 0.6, tuftStart: 0.75 },
      features: { trunk: { len: 1.95, r0: 0.19, r1: 0.06 }, tusks: { len: 1.0, r: 0.065 } },
    },
    tex: 'elephant',
  },

  giraffe: {
    id: 'giraffe', name: 'Masai giraffe', latin: 'Giraffa tippelskirchi', diet: 'browser',
    mass: 1100, shoulder: 3.1, length: 4.0, herd: [4, 9], speed: { walk: 1.4, run: 12 },
    habitat: habitat(0.3, 0.8, 400, 0.3, 500, 0.7), appeal: 0.95, rarity: 0.35, activity: 'diurnal',
    predator: false, prey: true, alertRadius: 60, lieProb: 0.1, drinkRate: 0.2,
    body: {
      shoulderH: 3.1, hipH: 2.55, bodyLen: 1.65, chestDepth: 1.25, chestW: 0.72, bellyDepth: 1.2, bellyW: 0.82,
      hipDepth: 0.95, hipW: 0.66, rumpLen: 0.45, chestLen: 0.4, backSag: 0.0, hump: 0.12, sq: 0.9,
      neck: { len: 2.05, angle: 62, r0: 0.34, r1: 0.14, arch: 0.05 },
      head: {
        len: 0.72, pitch: 58, w: 0.22,
        profile: [[0, 0.11, 0.13, 0], [0.2, 0.13, 0.15, 0.01], [0.42, 0.11, 0.12, 0], [0.62, 0.085, 0.09, -0.02], [0.82, 0.07, 0.075, -0.03], [1, 0.05, 0.05, -0.04]],
        eye: { s: 0.34, r: 0.028, side: 1.0 },
      },
      ears: { len: 0.2, w: 0.1, thick: 0.015, s: 0.16, out: 70, up: 20, back: 10, type: 'leaf' },
      legs: { hindY: 1.95, foreY: 2.2, r: 0.11, hindProf: [2.40, 1.20, 0.66, 0.40, 0.44], foreProf: [2.20, 1.15, 0.64, 0.40, 0.44], zig: 0.8, hindX: 0.24, foreX: 0.26, foot: 'hoof' },
      tail: { len: 0.95, r: 0.03, angle: 8, tuft: 0.9, tuftStart: 0.6 },
      features: { ossicones: { len: 0.17, r: 0.035 }, mane: { type: 'ridge', h: 0.05 } },
    },
    tex: 'giraffe',
  },

  zebra: {
    id: 'zebra', name: 'Plains zebra', latin: 'Equus quagga', diet: 'grazer',
    mass: 300, shoulder: 1.3, length: 2.3, herd: [8, 16], speed: { walk: 1.3, run: 12 },
    habitat: habitat(0.9, 0.2, 300, 0.2, 120, 0.5), appeal: 0.85, rarity: 0.1, activity: 'diurnal',
    predator: false, prey: true, alertRadius: 55, lieProb: 0.08, drinkRate: 0.3,
    body: {
      shoulderH: 1.32, hipH: 1.3, bodyLen: 1.2, chestDepth: 0.66, chestW: 0.5, bellyDepth: 0.7, bellyW: 0.6,
      hipDepth: 0.58, hipW: 0.5, rumpLen: 0.4, chestLen: 0.28, backSag: 0.03, sq: 0.9,
      neck: { len: 0.72, angle: 42, r0: 0.25, r1: 0.13, arch: 0.05 },
      head: {
        len: 0.58, pitch: 62, w: 0.2,
        profile: [[0, 0.095, 0.11, 0], [0.18, 0.11, 0.13, 0.01], [0.4, 0.095, 0.115, 0], [0.62, 0.075, 0.09, -0.015], [0.82, 0.065, 0.075, -0.02], [1, 0.05, 0.055, -0.025]],
        eye: { s: 0.32, r: 0.024, side: 1.0 },
      },
      ears: { len: 0.19, w: 0.1, thick: 0.012, s: 0.14, out: 40, up: 30, back: 0, type: 'leaf' },
      legs: { hindY: 0.98, foreY: 1.0, r: 0.065, hindProf: [2.60, 1.25, 0.70, 0.42, 0.50], foreProf: [2.20, 1.18, 0.68, 0.42, 0.50], zig: 0.7, hindX: 0.19, foreX: 0.2, foot: 'hoof' },
      tail: { len: 0.55, r: 0.03, angle: 10, tuft: 1.0, tuftStart: 0.4 },
      features: { mane: { type: 'ridge', h: 0.11 } },
    },
    tex: 'zebra',
  },

  wildebeest: {
    id: 'wildebeest', name: 'Blue wildebeest', latin: 'Connochaetes taurinus', diet: 'grazer',
    mass: 230, shoulder: 1.35, length: 2.2, herd: [12, 30], speed: { walk: 1.3, run: 13 },
    habitat: habitat(0.9, 0.15, 300, 0.2, 100, 0.5), appeal: 0.65, rarity: 0.1, activity: 'diurnal',
    predator: false, prey: true, alertRadius: 50, lieProb: 0.1, drinkRate: 0.3,
    body: {
      shoulderH: 1.38, hipH: 1.15, bodyLen: 1.25, chestDepth: 0.72, chestW: 0.52, bellyDepth: 0.68, bellyW: 0.58,
      hipDepth: 0.5, hipW: 0.42, rumpLen: 0.35, chestLen: 0.3, backSag: 0.02, hump: 0.08, sq: 0.9,
      neck: { len: 0.55, angle: 12, r0: 0.26, r1: 0.16, arch: 0.02 },
      head: {
        len: 0.62, pitch: 45, w: 0.24,
        profile: [[0, 0.11, 0.13, 0], [0.2, 0.125, 0.14, 0.01], [0.42, 0.11, 0.12, 0], [0.64, 0.095, 0.1, -0.01], [0.84, 0.085, 0.09, -0.015], [1, 0.075, 0.07, -0.02]],
        eye: { s: 0.3, r: 0.024, side: 1.0 },
      },
      ears: { len: 0.17, w: 0.09, thick: 0.012, s: 0.12, out: 75, up: 5, back: 10, type: 'leaf' },
      legs: { hindY: 0.9, foreY: 1.02, r: 0.06, hindProf: [2.60, 1.25, 0.70, 0.42, 0.50], foreProf: [2.20, 1.18, 0.68, 0.42, 0.50], zig: 0.75, hindX: 0.17, foreX: 0.2, foot: 'hoof' },
      tail: { len: 0.75, r: 0.028, angle: 10, tuft: 1.0, tuftStart: 0.3 },
      features: { horns: { type: 'wildebeest', len: 0.45, r: 0.05 }, mane: { type: 'shaggy', h: 0.12 }, beard: { len: 0.14 } },
    },
    tex: 'wildebeest',
  },

  buffalo: {
    id: 'buffalo', name: 'Cape buffalo', latin: 'Syncerus caffer', diet: 'grazer',
    mass: 700, shoulder: 1.55, length: 2.9, herd: [10, 25], speed: { walk: 1.1, run: 9 },
    habitat: habitat(0.8, 0.3, 200, 0.2, 180, 0.9), appeal: 0.6, rarity: 0.15, activity: 'diurnal',
    predator: false, prey: true, alertRadius: 35, lieProb: 0.2, drinkRate: 0.4,
    body: {
      shoulderH: 1.58, hipH: 1.48, bodyLen: 1.6, chestDepth: 0.95, chestW: 0.78, bellyDepth: 0.98, bellyW: 0.88,
      hipDepth: 0.78, hipW: 0.7, rumpLen: 0.45, chestLen: 0.35, backSag: 0.02, hump: 0.05, sq: 0.8,
      neck: { len: 0.5, angle: 0, r0: 0.38, r1: 0.24, arch: 0.02 },
      head: {
        len: 0.68, pitch: 40, w: 0.34,
        profile: [[0, 0.17, 0.17, 0], [0.2, 0.18, 0.18, 0.01], [0.42, 0.16, 0.16, 0], [0.64, 0.14, 0.13, -0.01], [0.84, 0.12, 0.11, -0.015], [1, 0.11, 0.085, -0.02]],
        eye: { s: 0.34, r: 0.026, side: 1.0 },
      },
      ears: { len: 0.24, w: 0.14, thick: 0.015, s: 0.1, out: 85, up: -20, back: 0, type: 'leaf' },
      legs: { hindY: 1.0, foreY: 1.1, r: 0.085, hindProf: [2.40, 1.25, 0.78, 0.50, 0.58], foreProf: [2.20, 1.20, 0.76, 0.50, 0.58], zig: 0.55, hindX: 0.26, foreX: 0.3, foot: 'hoof' },
      tail: { len: 0.8, r: 0.03, angle: 8, tuft: 1.0, tuftStart: 0.55 },
      features: { horns: { type: 'buffalo', len: 0.75, r: 0.09 } },
    },
    tex: 'buffalo',
  },

  lion: {
    id: 'lion', name: 'Lion', latin: 'Panthera leo', diet: 'predator',
    mass: 190, shoulder: 1.1, length: 2.5, herd: [3, 7], speed: { walk: 1.2, run: 14 },
    habitat: habitat(0.6, 0.4, 400, 0.4, 700, 1.0), appeal: 1.0, rarity: 0.5, activity: 'crepuscular',
    predator: true, prey: false, alertRadius: 0, lieProb: 0.7, drinkRate: 0.3,
    body: {
      shoulderH: 1.1, hipH: 1.02, bodyLen: 1.25, chestDepth: 0.55, chestW: 0.46, bellyDepth: 0.5, bellyW: 0.44,
      hipDepth: 0.42, hipW: 0.4, rumpLen: 0.32, chestLen: 0.3, backSag: 0.02, sq: 0.95,
      neck: { len: 0.42, angle: 22, r0: 0.22, r1: 0.16, arch: 0.02 },
      head: {
        len: 0.42, pitch: 30, w: 0.3,
        profile: [[0, 0.14, 0.14, 0], [0.22, 0.155, 0.15, 0.01], [0.45, 0.14, 0.13, 0], [0.65, 0.1, 0.09, -0.02], [0.85, 0.085, 0.07, -0.035], [1, 0.07, 0.055, -0.045]],
        eye: { s: 0.42, r: 0.022, side: 0.75 },
      },
      ears: { len: 0.1, w: 0.09, thick: 0.012, s: 0.14, out: 55, up: 25, back: 10, type: 'round' },
      legs: { hindY: 0.8, foreY: 0.82, r: 0.07, hindProf: [2.40, 1.30, 0.82, 0.58, 0.62], foreProf: [2.00, 1.22, 0.82, 0.60, 0.64], zig: 0.6, hindX: 0.18, foreX: 0.2, foot: 'pad' },
      tail: { len: 0.95, r: 0.03, angle: 20, tuft: 0.8, tuftStart: 0.85 },
      features: { mane: { type: 'full', r: 0.36, len: 0.55 } },
    },
    tex: 'lion',
  },

  cheetah: {
    id: 'cheetah', name: 'Cheetah', latin: 'Acinonyx jubatus', diet: 'predator',
    mass: 50, shoulder: 0.8, length: 2.0, herd: [1, 3], speed: { walk: 1.3, run: 25 },
    habitat: habitat(0.8, 0.2, 500, 0.15, 900, 1.0), appeal: 0.95, rarity: 0.6, activity: 'diurnal',
    predator: true, prey: false, alertRadius: 0, lieProb: 0.5, drinkRate: 0.2,
    body: {
      shoulderH: 0.8, hipH: 0.82, bodyLen: 1.05, chestDepth: 0.4, chestW: 0.28, bellyDepth: 0.34, bellyW: 0.27,
      hipDepth: 0.32, hipW: 0.28, rumpLen: 0.26, chestLen: 0.22, backSag: 0.0, sq: 1.0,
      neck: { len: 0.36, angle: 32, r0: 0.13, r1: 0.1, arch: 0.02 },
      head: {
        len: 0.28, pitch: 30, w: 0.18,
        profile: [[0, 0.085, 0.09, 0], [0.22, 0.095, 0.095, 0.005], [0.45, 0.085, 0.085, 0], [0.65, 0.065, 0.06, -0.012], [0.85, 0.052, 0.045, -0.02], [1, 0.042, 0.035, -0.028]],
        eye: { s: 0.42, r: 0.016, side: 0.75 },
      },
      ears: { len: 0.07, w: 0.065, thick: 0.01, s: 0.16, out: 55, up: 25, back: 10, type: 'round' },
      legs: { hindY: 0.62, foreY: 0.6, r: 0.045, hindProf: [2.30, 1.25, 0.75, 0.50, 0.58], foreProf: [1.90, 1.18, 0.76, 0.52, 0.60], zig: 0.65, hindX: 0.12, foreX: 0.12, foot: 'pad' },
      tail: { len: 0.78, r: 0.028, angle: 25, tuft: 0.3, tuftStart: 0.9 },
      features: {},
    },
    tex: 'cheetah',
  },

  hippo: {
    id: 'hippo', name: 'Hippopotamus', latin: 'Hippopotamus amphibius', diet: 'grazer',
    mass: 1500, shoulder: 1.5, length: 3.5, herd: [5, 12], speed: { walk: 1.0, run: 7 },
    habitat: habitat(0.7, 0.2, 40, 0.1, 250, 1.0), appeal: 0.8, rarity: 0.3, activity: 'nocturnal',
    predator: false, prey: false, alertRadius: 20, lieProb: 0.4, drinkRate: 0.6,
    body: {
      shoulderH: 1.5, hipH: 1.42, bodyLen: 2.0, chestDepth: 1.25, chestW: 1.25, bellyDepth: 1.32, bellyW: 1.4,
      hipDepth: 1.15, hipW: 1.2, rumpLen: 0.55, chestLen: 0.45, backSag: 0.0, sq: 0.85,
      neck: { len: 0.35, angle: -8, r0: 0.5, r1: 0.42, arch: 0.0 },
      head: {
        len: 1.15, pitch: 10, w: 0.7,
        profile: [[0, 0.4, 0.36, 0], [0.2, 0.42, 0.36, 0.0], [0.4, 0.36, 0.3, -0.03], [0.6, 0.34, 0.26, -0.05], [0.8, 0.36, 0.25, -0.06], [1, 0.33, 0.2, -0.07]],
        eye: { s: 0.22, r: 0.03, side: 0.8 },
      },
      ears: { len: 0.1, w: 0.07, thick: 0.02, s: 0.06, out: 40, up: 40, back: 0, type: 'round' },
      legs: { hindY: 0.75, foreY: 0.8, r: 0.15, hindProf: [1.45, 1.14, 0.82, 0.70, 0.78], foreProf: [1.42, 1.12, 0.80, 0.68, 0.78], zig: 0.34, hindX: 0.38, foreX: 0.40, foot: 'column' },
      tail: { len: 0.4, r: 0.045, angle: 20, tuft: 0.3, tuftStart: 0.7 },
      features: {},
    },
    tex: 'hippo',
  },

  rhino: {
    id: 'rhino', name: 'White rhinoceros', latin: 'Ceratotherium simum', diet: 'grazer',
    mass: 2300, shoulder: 1.8, length: 3.8, herd: [1, 4], speed: { walk: 1.0, run: 11 },
    habitat: habitat(0.8, 0.3, 250, 0.3, 700, 1.0), appeal: 0.95, rarity: 0.6, activity: 'crepuscular',
    predator: false, prey: false, alertRadius: 20, lieProb: 0.25, drinkRate: 0.4,
    body: {
      shoulderH: 1.82, hipH: 1.7, bodyLen: 2.1, chestDepth: 1.25, chestW: 1.15, bellyDepth: 1.3, bellyW: 1.28,
      hipDepth: 1.1, hipW: 1.05, rumpLen: 0.55, chestLen: 0.45, backSag: 0.06, hump: 0.14, sq: 0.8,
      neck: { len: 0.6, angle: -12, r0: 0.5, r1: 0.36, arch: 0.02 },
      head: {
        len: 1.0, pitch: 22, w: 0.5,
        profile: [[0, 0.28, 0.3, 0], [0.2, 0.3, 0.3, 0], [0.42, 0.26, 0.25, -0.02], [0.64, 0.24, 0.22, -0.04], [0.84, 0.24, 0.2, -0.05], [1, 0.22, 0.13, -0.06]],
        eye: { s: 0.3, r: 0.022, side: 0.9 },
      },
      ears: { len: 0.22, w: 0.11, thick: 0.02, s: 0.06, out: 35, up: 45, back: 0, type: 'tube' },
      legs: { hindY: 1.05, foreY: 1.15, r: 0.17, hindProf: [1.45, 1.12, 0.78, 0.66, 0.72], foreProf: [1.42, 1.10, 0.76, 0.64, 0.72], zig: 0.36, hindX: 0.34, foreX: 0.38, foot: 'column' },
      tail: { len: 0.65, r: 0.04, angle: 15, tuft: 0.6, tuftStart: 0.6 },
      features: { horns: { type: 'rhino', len: 0.62, r: 0.11 } },
    },
    tex: 'rhino',
  },

  warthog: {
    id: 'warthog', name: 'Common warthog', latin: 'Phacochoerus africanus', diet: 'mixed',
    mass: 80, shoulder: 0.7, length: 1.4, herd: [3, 6], speed: { walk: 1.0, run: 12 },
    habitat: habitat(0.7, 0.3, 300, 0.4, 60, 0.4), appeal: 0.5, rarity: 0.1, activity: 'diurnal',
    predator: false, prey: true, alertRadius: 40, lieProb: 0.15, drinkRate: 0.3,
    body: {
      shoulderH: 0.72, hipH: 0.64, bodyLen: 0.7, chestDepth: 0.42, chestW: 0.34, bellyDepth: 0.4, bellyW: 0.36,
      hipDepth: 0.32, hipW: 0.3, rumpLen: 0.22, chestLen: 0.18, backSag: 0.0, hump: 0.03, sq: 0.9,
      neck: { len: 0.2, angle: -8, r0: 0.17, r1: 0.14, arch: 0.0 },
      head: {
        len: 0.48, pitch: 28, w: 0.26,
        profile: [[0, 0.13, 0.13, 0], [0.22, 0.14, 0.135, 0], [0.45, 0.13, 0.115, -0.015], [0.65, 0.11, 0.095, -0.03], [0.85, 0.09, 0.075, -0.04], [1, 0.075, 0.06, -0.045]],
        eye: { s: 0.3, r: 0.014, side: 0.95 },
      },
      ears: { len: 0.11, w: 0.07, thick: 0.01, s: 0.1, out: 45, up: 30, back: 10, type: 'leaf' },
      legs: { hindY: 0.45, foreY: 0.5, r: 0.04, hindProf: [2.60, 1.25, 0.70, 0.42, 0.52], foreProf: [2.20, 1.18, 0.68, 0.42, 0.52], zig: 0.55, hindX: 0.12, foreX: 0.13, foot: 'hoof' },
      tail: { len: 0.42, r: 0.014, angle: 15, tuft: 0.7, tuftStart: 0.8 },
      features: { tusks: { len: 0.16, r: 0.02, type: 'warthog' }, mane: { type: 'shaggy', h: 0.09 }, warts: true },
    },
    tex: 'warthog',
  },

  ostrich: {
    id: 'ostrich', name: 'Common ostrich', latin: 'Struthio camelus', diet: 'mixed',
    mass: 110, shoulder: 1.3, length: 1.9, herd: [4, 9], speed: { walk: 1.3, run: 18 },
    habitat: habitat(0.7, 0.1, 500, 0.2, 200, 0.6), appeal: 0.7, rarity: 0.25, activity: 'diurnal',
    predator: false, prey: true, alertRadius: 70, lieProb: 0.15, drinkRate: 0.2, biped: true,
    body: {
      shoulderH: 1.35, hipH: 1.32, bodyLen: 0.75, chestDepth: 0.62, chestW: 0.55, bellyDepth: 0.66, bellyW: 0.6,
      hipDepth: 0.55, hipW: 0.5, rumpLen: 0.4, chestLen: 0.35, backSag: 0.0, sq: 1.0,
      neck: { len: 1.15, angle: 78, r0: 0.09, r1: 0.045, arch: 0.06 },
      head: {
        len: 0.2, pitch: 70, w: 0.09,
        profile: [[0, 0.04, 0.04, 0], [0.25, 0.05, 0.05, 0.005], [0.5, 0.045, 0.04, 0], [0.7, 0.03, 0.025, -0.005], [0.85, 0.022, 0.018, -0.008], [1, 0.015, 0.012, -0.01]],
        eye: { s: 0.4, r: 0.02, side: 0.9 },
      },
      ears: null,
      legs: { hindY: 1.02, foreY: 0, r: 0.035, hindProf: [2.80, 1.30, 0.68, 0.38, 0.44], foreProf: null, zig: 0.7, hindX: 0.18, foreX: 0, foot: 'bird' },
      tail: { len: 0.35, r: 0.12, angle: 60, tuft: 1.0, tuftStart: 0.0 },
      features: { wings: { len: 0.6, w: 0.35 } },
    },
    tex: 'ostrich',
  },

  impala: {
    id: 'impala', name: 'Impala', latin: 'Aepyceros melampus', diet: 'mixed',
    mass: 55, shoulder: 0.9, length: 1.4, herd: [10, 24], speed: { walk: 1.2, run: 17 },
    habitat: habitat(0.7, 0.5, 250, 0.3, 50, 0.4), appeal: 0.6, rarity: 0.05, activity: 'diurnal',
    predator: false, prey: true, alertRadius: 60, lieProb: 0.1, drinkRate: 0.2,
    body: {
      shoulderH: 0.9, hipH: 0.92, bodyLen: 0.85, chestDepth: 0.44, chestW: 0.3, bellyDepth: 0.44, bellyW: 0.36,
      hipDepth: 0.38, hipW: 0.3, rumpLen: 0.24, chestLen: 0.2, backSag: 0.015, sq: 0.95,
      neck: { len: 0.52, angle: 55, r0: 0.15, r1: 0.085, arch: 0.03 },
      head: {
        len: 0.36, pitch: 60, w: 0.14,
        profile: [[0, 0.065, 0.075, 0], [0.2, 0.075, 0.085, 0.005], [0.42, 0.065, 0.075, 0], [0.62, 0.05, 0.058, -0.01], [0.82, 0.04, 0.045, -0.015], [1, 0.03, 0.032, -0.02]],
        eye: { s: 0.3, r: 0.018, side: 1.0 },
      },
      ears: { len: 0.18, w: 0.08, thick: 0.01, s: 0.12, out: 60, up: 25, back: 5, type: 'leaf' },
      legs: { hindY: 0.68, foreY: 0.68, r: 0.036, hindProf: [2.60, 1.25, 0.65, 0.36, 0.44], foreProf: [2.10, 1.18, 0.64, 0.36, 0.44], zig: 0.75, hindX: 0.11, foreX: 0.12, foot: 'hoof' },
      tail: { len: 0.3, r: 0.02, angle: 15, tuft: 0.6, tuftStart: 0.5 },
      features: { horns: { type: 'lyre', len: 0.55, r: 0.022 } },
    },
    tex: 'impala',
  },
};

export const SPECIES_IDS = Object.keys(SPECIES);

export function speciesInfo(id) {
  const s = SPECIES[id];
  if (!s) return null;
  const { body, tex, ...rest } = s;
  return { ...rest, tex };
}

export { DEG };
