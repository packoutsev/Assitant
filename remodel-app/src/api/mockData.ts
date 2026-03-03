import type { ScopeItem, OrderItem, Decision, Measurement, SubContact, SubLogEntry, DailyLogEntry, PunchItem, BudgetLineItem } from '../types';

export const mockScope: ScopeItem[] = [
  // PRIMARY BEDROOM
  { zone: 'Primary Bedroom', lineItem: 'Paint walls and ceiling', category: 'Finish', trade: 'Painter', status: 'Not Started', notes: 'Patch TV mount and any wall damage during prep', estCost: '', _row: 4 },
  { zone: 'Primary Bedroom', lineItem: 'Remove existing blinds', category: 'Demo', trade: 'Handyman', status: 'Not Started', notes: '', estCost: '', _row: 5 },
  { zone: 'Primary Bedroom', lineItem: 'Install dual roller blinds — window', category: 'Install', trade: 'Handyman', status: 'Not Started', notes: 'Sheer + blackout, low-profile cassette', estCost: '', _row: 6 },
  { zone: 'Primary Bedroom', lineItem: 'Install dual roller blinds — door', category: 'Install', trade: 'Handyman', status: 'Not Started', notes: 'Sheer + blackout on new aluminum door', estCost: '', _row: 7 },
  { zone: 'Primary Bedroom', lineItem: 'Remove closet doors', category: 'Demo', trade: 'Handyman', status: 'Not Started', notes: 'No replacement — IKEA PAX with doors replaces closet system', estCost: '', _row: 8 },
  { zone: 'Primary Bedroom', lineItem: 'Remove lower closet cabinets', category: 'Demo', trade: 'Handyman', status: 'Not Started', notes: '', estCost: '', _row: 9 },
  { zone: 'Primary Bedroom', lineItem: 'Remove upper closet cabinets', category: 'Demo', trade: 'Handyman', status: 'Not Started', notes: '', estCost: '', _row: 10 },
  { zone: 'Primary Bedroom', lineItem: 'Install IKEA PAX carcasses + stock doors', category: 'Install', trade: 'Handyman', status: 'Not Started', notes: 'Semihandmade fronts later', estCost: '', _row: 11 },
  { zone: 'Primary Bedroom', lineItem: 'Pin window fixed (no hardware replacement)', category: 'Repair', trade: 'Handyman', status: 'Not Started', notes: 'Door is egress now — window stays fixed', estCost: '', _row: 12 },
  { zone: 'Primary Bedroom', lineItem: 'Cut brick sill for window-to-door conversion', category: 'Structural', trade: 'Mason / GC', status: 'Not Started', notes: 'Double red brick wall, existing lintel stays, drop to floor level', estCost: '', _row: 13 },
  { zone: 'Primary Bedroom', lineItem: 'Install outswing aluminum door', category: 'Install', trade: 'Door Installer', status: 'Not Started', notes: 'Single lite, contemporary, ordered to fit 39" opening', estCost: '', _row: 14 },
  { zone: 'Primary Bedroom', lineItem: 'Relocate TV to different room', category: 'Move', trade: 'Self', status: 'Not Started', notes: '', estCost: '', _row: 15 },
  { zone: 'Primary Bedroom', lineItem: 'Relocate furniture permanently', category: 'Move', trade: 'Self', status: 'Not Started', notes: 'Moving to other rooms', estCost: '', _row: 16 },

  // PRIMARY HALLWAY
  { zone: 'Primary Hallway', lineItem: 'Paint walls and ceiling', category: 'Finish', trade: 'Painter', status: 'Not Started', notes: 'Same color as bedroom', estCost: '', _row: 18 },
  { zone: 'Primary Hallway', lineItem: 'Install new light fixture', category: 'Electrical', trade: 'Electrician', status: 'Not Started', notes: 'Select fixture — TBD', estCost: '', _row: 19 },
  { zone: 'Primary Hallway', lineItem: 'Relocate thermostat to hallway near air handler', category: 'Electrical', trade: 'Electrician', status: 'Not Started', notes: 'Short wire run. Smart thermostat — brand TBD', estCost: '', _row: 20 },
  { zone: 'Primary Hallway', lineItem: 'Install prehung door — dining to hallway', category: 'Install', trade: 'Handyman', status: 'Not Started', notes: 'Standard size, matching contemporary style', estCost: '', _row: 21 },
  { zone: 'Primary Hallway', lineItem: 'Install prehung door — hallway to bedroom', category: 'Install', trade: 'Handyman', status: 'Not Started', notes: '', estCost: '', _row: 22 },
  { zone: 'Primary Hallway', lineItem: 'Install prehung door — hallway to bathroom', category: 'Install', trade: 'Handyman', status: 'Not Started', notes: '', estCost: '', _row: 23 },

  // PRIMARY BATHROOM
  { zone: 'Primary Bathroom', lineItem: 'Demo shower stall (pan, tile, framing)', category: 'Demo', trade: 'Tile Sub / GC', status: 'Not Started', notes: 'No need to preserve stall tile', estCost: '', _row: 25 },
  { zone: 'Primary Bathroom', lineItem: 'Remove existing floor tile', category: 'Demo', trade: 'Tile Sub', status: 'Not Started', notes: '', estCost: '', _row: 26 },
  { zone: 'Primary Bathroom', lineItem: 'Plumber rough-in — drain to new pan location', category: 'Plumbing', trade: 'Plumber', status: 'Not Started', notes: 'Crawlspace access, ~3-4 ft drain move', estCost: '', _row: 27 },
  { zone: 'Primary Bathroom', lineItem: 'Plumber rough-in — supply lines to right wall (wet wall)', category: 'Plumbing', trade: 'Plumber', status: 'Not Started', notes: 'Showerhead + controls on right wall facing window', estCost: '', _row: 28 },
  { zone: 'Primary Bathroom', lineItem: 'Electrician rough-in — exhaust fan wiring + ducting', category: 'Electrical', trade: 'Electrician', status: 'Not Started', notes: 'Includes penetration and duct to exterior', estCost: '', _row: 29 },
  { zone: 'Primary Bathroom', lineItem: 'Frame new shower walls (full galley width)', category: 'Structural', trade: 'Framer / GC', status: 'Not Started', notes: 'Shower spans full width at far end', estCost: '', _row: 30 },
  { zone: 'Primary Bathroom', lineItem: 'Build bench + shelf framing on left wall', category: 'Structural', trade: 'Framer / GC', status: 'Not Started', notes: 'Tiled to match floor', estCost: '', _row: 31 },
  { zone: 'Primary Bathroom', lineItem: 'Install mud-set shower pan', category: 'Plumbing / Tile', trade: 'Tile Sub', status: 'Not Started', notes: 'Custom — wall-to-wall width', estCost: '', _row: 32 },
  { zone: 'Primary Bathroom', lineItem: 'Cement board + waterproof membrane', category: 'Prep', trade: 'Tile Sub', status: 'Not Started', notes: '', estCost: '', _row: 33 },
  { zone: 'Primary Bathroom', lineItem: 'Tile shower floor + bench + shelves (large format)', category: 'Finish', trade: 'Tile Sub', status: 'Not Started', notes: 'Same large format field tile throughout', estCost: '', _row: 34 },
  { zone: 'Primary Bathroom', lineItem: 'Extend wainscot tile onto new framed walls', category: 'Finish', trade: 'Tile Sub', status: 'Not Started', notes: 'New matching tile sourced locally', estCost: '', _row: 35 },
  { zone: 'Primary Bathroom', lineItem: 'Install new floor tile', category: 'Finish', trade: 'Tile Sub', status: 'Not Started', notes: 'Large format field tile', estCost: '', _row: 36 },
  { zone: 'Primary Bathroom', lineItem: 'Grout and seal all tile', category: 'Finish', trade: 'Tile Sub', status: 'Not Started', notes: '', estCost: '', _row: 37 },
  { zone: 'Primary Bathroom', lineItem: 'Fill and seal existing grout (retained areas)', category: 'Finish', trade: 'Tile Sub', status: 'Not Started', notes: '', estCost: '', _row: 38 },
  { zone: 'Primary Bathroom', lineItem: 'Limewash — above wainscot + ceiling', category: 'Finish', trade: 'DIY / Carpenter', status: 'Not Started', notes: 'Romabio or similar. 1-2 coats over existing plaster.', estCost: '', _row: 39 },
  { zone: 'Primary Bathroom', lineItem: 'Install glass shower door (fixed + hinged)', category: 'Install', trade: 'Glass Co.', status: 'Not Started', notes: 'Fixed panel on left, swinging door on right (hinged on wet wall)', estCost: '', _row: 40 },
  { zone: 'Primary Bathroom', lineItem: 'Install exhaust fan', category: 'Electrical', trade: 'Electrician', status: 'Not Started', notes: '', estCost: '', _row: 41 },
  { zone: 'Primary Bathroom', lineItem: 'Install new light fixture', category: 'Electrical', trade: 'Electrician', status: 'Not Started', notes: 'Select fixture — TBD', estCost: '', _row: 42 },
  { zone: 'Primary Bathroom', lineItem: 'Replace sink trim/hardware', category: 'Plumbing', trade: 'Plumber', status: 'Not Started', notes: 'Retain cabinet, toilet, sink', estCost: '', _row: 43 },
  { zone: 'Primary Bathroom', lineItem: 'Drywall repairs', category: 'Repair', trade: 'Drywall Sub', status: 'Not Started', notes: '', estCost: '', _row: 44 },
  { zone: 'Primary Bathroom', lineItem: 'Waterproof window sill detail', category: 'Finish', trade: 'Tile Sub', status: 'Not Started', notes: 'Window is inside shower — proper sill and caulk', estCost: '', _row: 45 },
];

export const mockOrders: OrderItem[] = [
  { item: 'Outswing aluminum door (single lite, contemporary)', leadTime: '3 weeks', orderByDate: '2026-03-28', status: 'Not Ordered', vendor: '', cost: '', notes: 'Ordered to fit 39" opening. Order ASAP for cushion.', _row: 2 },
  { item: 'Glass shower door (fixed + hinged panels)', leadTime: '2-3 weeks from measurement', orderByDate: '2026-03-28', status: 'Not Ordered', vendor: '', cost: '', notes: 'Measure after framing done. Start getting quotes now.', _row: 3 },
  { item: 'IKEA PAX carcasses + stock doors', leadTime: '1 week', orderByDate: '2026-03-21', status: 'Not Ordered', vendor: 'IKEA', cost: '', notes: 'Measure closet first. Semihandmade fronts ordered separately later.', _row: 4 },
  { item: 'Large format field tile (shower floor, bench, shelves)', leadTime: 'In stock', orderByDate: '2026-03-07', status: 'Not Ordered', vendor: '', cost: '', notes: 'Source locally. Need enough for floor + shower.', _row: 5 },
  { item: 'Wainscot-matching tile', leadTime: 'In stock', orderByDate: '2026-03-07', status: 'Not Ordered', vendor: '', cost: '', notes: 'Bring sample to match', _row: 6 },
  { item: 'Dual roller blinds — sheer + blackout (x2)', leadTime: '1-2 weeks', orderByDate: '2026-04-04', status: 'Not Ordered', vendor: '', cost: '', notes: 'One for window, one for new door. Low-profile cassette.', _row: 7 },
  { item: 'Prehung interior doors (x3)', leadTime: 'In stock', orderByDate: '2026-04-04', status: 'Not Ordered', vendor: '', cost: '', notes: 'Standard sizes, matching contemporary style', _row: 8 },
  { item: 'Light fixtures — hallway + bathroom', leadTime: '1 week', orderByDate: '2026-04-04', status: 'Not Ordered', vendor: '', cost: '', notes: 'Style TBD', _row: 9 },
  { item: 'Exhaust fan', leadTime: 'In stock', orderByDate: '2026-03-07', status: 'Not Ordered', vendor: '', cost: '', notes: 'Model TBD', _row: 10 },
  { item: 'Smart thermostat', leadTime: 'In stock', orderByDate: '2026-04-11', status: 'Not Ordered', vendor: '', cost: '', notes: 'Brand TBD — proper wiring at new location', _row: 11 },
  { item: 'Paint', leadTime: 'In stock', orderByDate: '2026-04-11', status: 'Not Ordered', vendor: '', cost: '', notes: 'Color TBD — bedroom + hallway same color', _row: 12 },
  { item: 'Sink trim/hardware', leadTime: 'In stock', orderByDate: '2026-04-11', status: 'Not Ordered', vendor: '', cost: '', notes: 'Faucet style/finish TBD', _row: 13 },
  { item: 'Door hardware (x3 sets)', leadTime: 'In stock', orderByDate: '2026-04-04', status: 'Not Ordered', vendor: '', cost: '', notes: 'Matching style for all 3 prehung doors', _row: 14 },
];

export const mockDecisions: Decision[] = [
  { decision: 'Paint color', options: 'TBD — any preference warm vs cool?', status: 'TBD', choice: '', notes: 'Same color for bedroom walls, ceiling, hallway walls, ceiling', _row: 2 },
  { decision: 'Large format field tile selection', options: 'Source locally, in stock', status: 'TBD', choice: '', notes: 'Shower floor, bench, shelves', _row: 3 },
  { decision: 'Hallway light fixture style', options: 'Flush mount, semi-flush, recessed', status: 'TBD', choice: '', notes: '', _row: 4 },
  { decision: 'Bathroom light fixture style', options: 'Vanity bar, sconces, overhead', status: 'TBD', choice: '', notes: '', _row: 5 },
  { decision: 'Smart thermostat brand', options: 'Ecobee, Honeywell, etc. (not Nest — wiring issues before)', status: 'TBD', choice: '', notes: 'Will have proper wiring at new location', _row: 6 },
  { decision: 'Glass shower door style', options: 'Frameless vs semi-frameless', status: 'TBD', choice: '', notes: 'Fixed panel left, swinging door right', _row: 7 },
  { decision: 'Exhaust fan model', options: 'Basic vs fan+light combo, CFM rating', status: 'TBD', choice: '', notes: '', _row: 8 },
  { decision: 'Sink faucet style/finish', options: 'Brushed nickel, matte black, chrome, etc.', status: 'TBD', choice: '', notes: '', _row: 9 },
];

export const mockMeasurements: Measurement[] = [
  { zone: 'Primary Bathroom', location: 'Shower', dimension: 'Width (galley)', value: '', notes: 'Full galley width — wall to wall', _row: 2 },
  { zone: 'Primary Bathroom', location: 'Shower', dimension: 'Depth', value: '', notes: 'From entry wall to far wall (window wall)', _row: 3 },
  { zone: 'Primary Bathroom', location: 'Shower', dimension: 'Window dimensions', value: '', notes: '74-year-old window, stays in place', _row: 4 },
  { zone: 'Primary Bathroom', location: 'Shower', dimension: 'Wainscot height', value: '', notes: 'Existing wainscot — tile carries into shower', _row: 5 },
  { zone: 'Primary Bathroom', location: 'Room', dimension: 'Ceiling height', value: '', notes: '', _row: 6 },
  { zone: 'Primary Bathroom', location: 'Room', dimension: 'Room length', value: '', notes: 'Galley length', _row: 7 },
  { zone: 'Primary Bathroom', location: 'Room', dimension: 'Room width', value: '', notes: 'Should match shower width', _row: 8 },
  { zone: 'Primary Bedroom', location: 'Window (remaining)', dimension: 'Rough opening W × H', value: '', notes: 'For blinds', _row: 9 },
  { zone: 'Primary Bedroom', location: 'Door conversion window', dimension: 'Rough opening width', value: '~39"', notes: 'Existing hope steel window opening', _row: 10 },
  { zone: 'Primary Bedroom', location: 'Door conversion window', dimension: 'AFH (sill height)', value: '~42"', notes: 'Brick to cut below this to floor', _row: 11 },
  { zone: 'Primary Bedroom', location: 'Closet', dimension: 'Interior W × D × H', value: '', notes: 'For IKEA PAX planning', _row: 12 },
  { zone: 'Primary Hallway', location: 'Door opening — dining', dimension: 'W × H', value: '', notes: 'Standard assumed', _row: 13 },
  { zone: 'Primary Hallway', location: 'Door opening — bedroom', dimension: 'W × H', value: '', notes: 'Standard assumed', _row: 14 },
  { zone: 'Primary Hallway', location: 'Door opening — bathroom', dimension: 'W × H', value: '', notes: 'Standard assumed', _row: 15 },
];

export const mockSubs: SubContact[] = [
  { trade: 'General Contractor', name: '', company: '', phone: '', email: '', notes: '', _row: 2 },
  { trade: 'Plumber', name: '', company: '', phone: '', email: '', notes: '', _row: 3 },
  { trade: 'Electrician', name: '', company: '', phone: '', email: '', notes: '', _row: 4 },
  { trade: 'Tile Installer', name: '', company: '', phone: '', email: '', notes: '', _row: 5 },
  { trade: 'Painter', name: '', company: '', phone: '', email: '', notes: '', _row: 6 },
  { trade: 'Glass / Shower Door', name: '', company: '', phone: '', email: '', notes: '', _row: 7 },
  { trade: 'Limewash (DIY)', name: 'Matt', company: '', phone: '', email: '', notes: 'Romabio or similar — no sub needed', _row: 8 },
  { trade: 'Mason (brick cut)', name: '', company: '', phone: '', email: '', notes: 'For window-to-door conversion', _row: 9 },
  { trade: 'Drywall', name: '', company: '', phone: '', email: '', notes: '', _row: 10 },
  { trade: 'Handyman', name: '', company: '', phone: '', email: '', notes: '', _row: 11 },
];

export const mockSubLog: SubLogEntry[] = [];
export const mockDailyLog: DailyLogEntry[] = [];
export const mockPunchList: PunchItem[] = [];

export const mockBudget: BudgetLineItem[] = [
  // LABOR — Carpenter does everything except tile + glass. You GC (coordinate, source, schedule).
  { category: 'Labor', trade: 'Carpenter', description: 'Demo, framing, plumbing (drain + supply + trim), electrical (fan + thermostat + fixtures), brick cut, shower pan, drywall, all door hanging (aluminum + 3 prehung + bathroom), PAX install, limewash, painting, blinds, hardware, window pin. ~120-150 hrs × $50/hr.', estimateLow: 6000, estimateHigh: 7500, actual: 0, notes: 'Does everything hands-on. You coordinate, source materials, schedule subs.', _row: 2 },
  { category: 'Labor', trade: 'Tile Installer', description: 'Cement board + membrane, shower tile (floor/bench/shelves), wainscot extension, grout + seal, window sill detail.', estimateLow: 2000, estimateHigh: 3000, actual: 0, notes: 'Sub this — biggest time saver. Carpenter preps pan, tile sub finishes. 1-2 weeks.', _row: 3 },
  { category: 'Labor', trade: 'Glass / Shower Door', description: 'Measure finished opening, fabricate, install fixed panel (left) + hinged door (right).', estimateLow: 1200, estimateHigh: 1800, actual: 0, notes: 'Includes glass supply. Get 2+ quotes.', _row: 4 },

  // MATERIALS
  { category: 'Materials', trade: 'Door', description: 'Outswing aluminum door — single lite, contemporary, 39" opening', estimateLow: 1800, estimateHigh: 2500, actual: 0, notes: '3-week lead time. Order Week 1.', _row: 6 },
  { category: 'Materials', trade: 'Closet', description: 'IKEA PAX carcasses + stock doors', estimateLow: 800, estimateHigh: 1200, actual: 0, notes: 'Measure closet first. Semihandmade fronts later (separate budget).', _row: 7 },
  { category: 'Materials', trade: 'Tile', description: 'Large format field tile + wainscot-matching tile', estimateLow: 400, estimateHigh: 700, actual: 0, notes: 'Source locally, in stock. Bring wainscot sample to match.', _row: 8 },
  { category: 'Materials', trade: 'Tile', description: 'Thin-set, grout, sealant, cement board, membrane, pan materials (liner, deck mud, drain)', estimateLow: 350, estimateHigh: 600, actual: 0, notes: 'Mud-set custom pan — wall-to-wall width', _row: 9 },
  { category: 'Materials', trade: 'Doors', description: '3 prehung interior doors + 4 sets hardware', estimateLow: 600, estimateHigh: 1000, actual: 0, notes: 'Standard size, contemporary. Carpenter hangs.', _row: 10 },
  { category: 'Materials', trade: 'Blinds', description: 'Dual roller blinds × 2 (sheer + blackout, low-profile cassette)', estimateLow: 300, estimateHigh: 500, actual: 0, notes: 'Window + new door', _row: 11 },
  { category: 'Materials', trade: 'Electrical', description: 'Exhaust fan + smart thermostat + 2 light fixtures + wire/boxes/duct', estimateLow: 500, estimateHigh: 800, actual: 0, notes: 'Thermostat: not Nest. Fan model + fixture style TBD.', _row: 12 },
  { category: 'Materials', trade: 'Plumbing', description: 'Sink faucet/trim + shower valve/trim + drain pipe + fittings', estimateLow: 350, estimateHigh: 600, actual: 0, notes: 'Faucet style/finish TBD', _row: 13 },
  { category: 'Materials', trade: 'Paint', description: 'Paint + primer + supplies (bedroom + hallway)', estimateLow: 200, estimateHigh: 300, actual: 0, notes: 'Carpenter paints. Color TBD.', _row: 14 },
  { category: 'Materials', trade: 'Drywall', description: 'Drywall sheets, mud, tape (patches only)', estimateLow: 50, estimateHigh: 100, actual: 0, notes: '', _row: 15 },
  { category: 'Materials', trade: 'Limewash', description: 'Limewash paint + primer + supplies (bathroom walls above wainscot + ceiling)', estimateLow: 75, estimateHigh: 150, actual: 0, notes: 'Romabio or similar. 1-2 coats over existing plaster.', _row: 16 },
  { category: 'Materials', trade: 'Misc', description: 'Concrete saw rental, dumpster, fasteners, caulk, misc', estimateLow: 150, estimateHigh: 300, actual: 0, notes: '', _row: 17 },

  // CONTINGENCY
  { category: 'Contingency', trade: '', description: '10% contingency — 74-year-old house', estimateLow: 1500, estimateHigh: 2200, actual: 0, notes: 'Expect surprises behind walls. Plumbing/structural unknowns in crawlspace.', _row: 18 },
];
