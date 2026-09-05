// Vehicle kind catalogue. Dimensions in metres. speedMul scales the road-kind base speed
// (dirt 25 / gravel 40 / paved 60 km/h per spec) per vehicle type. Paint colours are TRUE LINEAR
// albedo (see CLAUDE.md "Colour authoring") — do not darken to compensate for anything.
export const KINDS = {
  safari: {
    id: 'safari', label: 'Safari Truck',
    length: 6.4, width: 2.15, wheelbase: 3.7, track: 1.82, wheelR: 0.44, wheelW: 0.28,
    clearance: 0.42, cabLength: 1.7, deckHeight: 0.95,
    seats: 8, rows: 3, hasCanopy: true, hasRoofRack: true, hasSpare: true, openSided: true,
    speedMul: 0.9, accel: 2.6, decel: 4.5,
    paints: [0x8a7a4c, 0x54572f], // khaki, olive — linear
  },
  ranger: {
    id: 'ranger', label: 'Ranger Pickup',
    length: 5.1, width: 1.9, wheelbase: 3.15, track: 1.6, wheelR: 0.38, wheelW: 0.24,
    clearance: 0.36, cabLength: 2.0, deckHeight: 0.85,
    seats: 2, rows: 1, hasCanopy: false, hasRoofRack: false, hasSpare: true, openSided: false, bullbar: true,
    speedMul: 1.08, accel: 3.2, decel: 5.2,
    paints: [0xd8d3c2, 0x54572f], // white-ish, olive
  },
  minibus: {
    id: 'minibus', label: 'Minibus',
    length: 5.6, width: 2.0, wheelbase: 3.35, track: 1.68, wheelR: 0.35, wheelW: 0.22,
    clearance: 0.3, cabLength: 1.1, deckHeight: 0.78,
    seats: 7, rows: 1, hasCanopy: false, hasRoofRack: true, hasSpare: false, openSided: false, windows: true,
    speedMul: 0.95, accel: 2.4, decel: 4.2,
    paints: [0xd8d3c2],
  },
  service: {
    id: 'service', label: 'Service Truck',
    length: 5.9, width: 2.1, wheelbase: 3.5, track: 1.78, wheelR: 0.41, wheelW: 0.26,
    clearance: 0.4, cabLength: 1.75, deckHeight: 1.0,
    seats: 2, rows: 1, hasCanopy: false, hasRoofRack: false, hasSpare: true, openSided: false, flatbed: true,
    speedMul: 0.85, accel: 2.2, decel: 4.0,
    paints: [0xd8d3c2],
  },
};

export const KIND_IDS = Object.keys(KINDS);

// dust/laterite tint the paint gradient toward, near the wheel arches and rockers — TRUE linear.
export const DUST_TINT = 0x6b5a3a;

export const CLOTHING_COLORS = [
  0xb23a2e, 0x2e5f8a, 0xd6a428, 0x3a6b3a, 0xd8d3c2, 0x8a7a4c, 0x6b3a5a, 0xc9773d, 0x555f66,
];
export const SKIN_TONES = [0x8a5a34, 0x6b4023, 0xc79a6b, 0x4a2e18, 0xa06840];

export function roadSpeedKmh(kind) {
  return kind === 'paved' ? 60 : kind === 'gravel' ? 40 : 25; // dirt / unknown
}
