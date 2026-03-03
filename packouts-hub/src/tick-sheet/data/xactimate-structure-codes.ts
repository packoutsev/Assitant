// Xactimate structure cleaning codes organized by section
// Soilage maps to modifiers: light = "-", medium = (none), heavy = "+"

export interface XactCode {
  code: string;
  cat: string;
  description: string;
  unit: string;
  hasSoilage: boolean;
  /** Which SF auto-calc to use: wall, ceilfloor, perimeter, or none */
  autoCalc?: 'wall' | 'ceilfloor' | 'perimeter';
}

export interface CodeSection {
  id: string;
  label: string;
  codes: XactCode[];
}

export const SURFACE_SECTIONS: CodeSection[] = [
  {
    id: 'walls_ceiling',
    label: 'Walls & Ceiling',
    codes: [
      { code: 'CLN WALL', cat: 'CLN', description: 'Clean walls', unit: 'SF', hasSoilage: true, autoCalc: 'wall' },
      { code: 'CLN CEIL', cat: 'CLN', description: 'Clean ceiling', unit: 'SF', hasSoilage: true, autoCalc: 'ceilfloor' },
      { code: 'CLN CSWALL', cat: 'CLN', description: 'Chem sponge walls', unit: 'SF', hasSoilage: true, autoCalc: 'wall' },
      { code: 'CLN CSCEIL', cat: 'CLN', description: 'Chem sponge ceiling', unit: 'SF', hasSoilage: true, autoCalc: 'ceilfloor' },
      { code: 'CLN WWALL', cat: 'CLN', description: 'Wet wash walls', unit: 'SF', hasSoilage: true, autoCalc: 'wall' },
      { code: 'CLN WCEIL', cat: 'CLN', description: 'Wet wash ceiling', unit: 'SF', hasSoilage: true, autoCalc: 'ceilfloor' },
    ],
  },
  {
    id: 'floors',
    label: 'Floors',
    codes: [
      { code: 'CLN FLR', cat: 'CLN', description: 'Clean hard surface floor', unit: 'SF', hasSoilage: true, autoCalc: 'ceilfloor' },
      { code: 'CLN CRPT', cat: 'CLN', description: 'Clean carpet', unit: 'SF', hasSoilage: true, autoCalc: 'ceilfloor' },
      { code: 'CLN TG', cat: 'CLN', description: 'Clean tile & grout', unit: 'SF', hasSoilage: true, autoCalc: 'ceilfloor' },
      { code: 'CLN VCRPT', cat: 'CLN', description: 'Vacuum carpet', unit: 'SF', hasSoilage: false, autoCalc: 'ceilfloor' },
    ],
  },
  {
    id: 'cabinets_counters',
    label: 'Cabinets & Counters',
    codes: [
      { code: 'CLN CABE', cat: 'CLN', description: 'Clean cabinets - exterior', unit: 'LF', hasSoilage: true, autoCalc: undefined },
      { code: 'CLN CABI', cat: 'CLN', description: 'Clean cabinets - interior', unit: 'LF', hasSoilage: true, autoCalc: undefined },
      { code: 'CLN CTF', cat: 'CLN', description: 'Clean countertop', unit: 'SF', hasSoilage: true, autoCalc: undefined },
    ],
  },
  {
    id: 'windows_doors',
    label: 'Windows & Doors',
    codes: [
      { code: 'CLN WINI', cat: 'CLN', description: 'Clean window - interior', unit: 'EA', hasSoilage: true, autoCalc: undefined },
      { code: 'CLN WINE', cat: 'CLN', description: 'Clean window - exterior', unit: 'EA', hasSoilage: true, autoCalc: undefined },
      { code: 'CLN WNTRK', cat: 'CLN', description: 'Clean window tracks', unit: 'EA', hasSoilage: false, autoCalc: undefined },
      { code: 'CLN BLD', cat: 'CLN', description: 'Clean blinds', unit: 'EA', hasSoilage: true, autoCalc: undefined },
      { code: 'CLN DOOR', cat: 'CLN', description: 'Clean door', unit: 'EA', hasSoilage: true, autoCalc: undefined },
    ],
  },
  {
    id: 'fixtures_trim',
    label: 'Fixtures & Trim',
    codes: [
      { code: 'CLN LITE', cat: 'CLN', description: 'Clean light fixture', unit: 'EA', hasSoilage: true, autoCalc: undefined },
      { code: 'CLN FAN', cat: 'CLN', description: 'Clean ceiling fan', unit: 'EA', hasSoilage: true, autoCalc: undefined },
      { code: 'CLN MIR', cat: 'CLN', description: 'Clean mirror', unit: 'EA', hasSoilage: false, autoCalc: undefined },
      { code: 'CLN BASE', cat: 'CLN', description: 'Clean baseboard', unit: 'LF', hasSoilage: true, autoCalc: 'perimeter' },
      { code: 'CLN CRWN', cat: 'CLN', description: 'Clean crown molding', unit: 'LF', hasSoilage: true, autoCalc: 'perimeter' },
      { code: 'CLN VENT', cat: 'CLN', description: 'Clean vent/register', unit: 'EA', hasSoilage: false, autoCalc: undefined },
      { code: 'CLN SHLF', cat: 'CLN', description: 'Clean shelving', unit: 'LF', hasSoilage: true, autoCalc: undefined },
    ],
  },
];

export const TREATMENT_SECTIONS: CodeSection[] = [
  {
    id: 'treatments',
    label: 'Treatments',
    codes: [
      { code: 'PNT SEAL', cat: 'PNT', description: 'Seal/prime - Kilz', unit: 'SF', hasSoilage: false, autoCalc: 'wall' },
      { code: 'PNT SEALBN', cat: 'PNT', description: 'Seal/prime - shellac/BIN', unit: 'SF', hasSoilage: false, autoCalc: 'wall' },
      { code: 'HMR HEPA', cat: 'HMR', description: 'HEPA vacuum surfaces', unit: 'SF', hasSoilage: false, autoCalc: 'ceilfloor' },
      { code: 'HMR ASCRB', cat: 'HMR', description: 'Air scrubber', unit: 'DA', hasSoilage: false, autoCalc: undefined },
      { code: 'HMR THFOG', cat: 'HMR', description: 'Thermal fogging', unit: 'CF', hasSoilage: false, autoCalc: undefined },
      { code: 'HMR OZONE', cat: 'HMR', description: 'Ozone treatment', unit: 'CF', hasSoilage: false, autoCalc: undefined },
      { code: 'HMR HYDRO', cat: 'HMR', description: 'Hydroxyl generator', unit: 'DA', hasSoilage: false, autoCalc: undefined },
      { code: 'HMR ANTIM', cat: 'HMR', description: 'Antimicrobial treatment', unit: 'SF', hasSoilage: false, autoCalc: 'ceilfloor' },
      { code: 'HMR DISINF', cat: 'HMR', description: 'Disinfection', unit: 'SF', hasSoilage: false, autoCalc: 'ceilfloor' },
    ],
  },
];

export const POST_CONSTRUCTION_SECTIONS: CodeSection[] = [
  {
    id: 'post_construction',
    label: 'Post-Construction',
    codes: [
      { code: 'CLN ROUGH', cat: 'CLN', description: 'Rough clean', unit: 'SF', hasSoilage: false, autoCalc: 'ceilfloor' },
      { code: 'CLN DETAIL', cat: 'CLN', description: 'Detail clean', unit: 'SF', hasSoilage: false, autoCalc: 'ceilfloor' },
      { code: 'CLN FINAL', cat: 'CLN', description: 'Final clean', unit: 'SF', hasSoilage: false, autoCalc: 'ceilfloor' },
      { code: 'DMO FLRPRT', cat: 'DMO', description: 'Floor protection', unit: 'SF', hasSoilage: false, autoCalc: 'ceilfloor' },
      { code: 'DMO DSTBAR', cat: 'DMO', description: 'Dust barrier', unit: 'SF', hasSoilage: false, autoCalc: undefined },
      { code: 'DMO DEBRIS', cat: 'DMO', description: 'Debris hauling', unit: 'EA', hasSoilage: false, autoCalc: undefined },
      { code: 'DMO DMPSTR', cat: 'DMO', description: 'Dumpster', unit: 'EA', hasSoilage: false, autoCalc: undefined },
    ],
  },
];

export const HVAC_SECTIONS: CodeSection[] = [
  {
    id: 'hvac',
    label: 'HVAC',
    codes: [
      { code: 'CLN DUCT', cat: 'CLN', description: 'Duct cleaning', unit: 'EA', hasSoilage: false, autoCalc: undefined },
      { code: 'CLN DVENT', cat: 'CLN', description: 'Dryer vent cleaning', unit: 'EA', hasSoilage: false, autoCalc: undefined },
    ],
  },
];

export const ALL_SECTIONS = [
  ...SURFACE_SECTIONS,
  ...TREATMENT_SECTIONS,
  ...POST_CONSTRUCTION_SECTIONS,
  ...HVAC_SECTIONS,
];
