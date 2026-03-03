export interface GanttTask {
  id: string;
  label: string;
  crew: string;
  startWeek: number;
  endWeek: number;
  dependsOn?: string[];
  phase: string;
}

export const ganttTasks: GanttTask[] = [
  // PHASE 1: SOURCING & ORDERING (Week 1) — You (GC)
  { id: 'source-tile', label: 'Source tile (field + wainscot)', crew: 'You (GC)', startWeek: 1, endWeek: 1, phase: 'Sourcing' },
  { id: 'order-door', label: 'Order aluminum door (3 wk lead)', crew: 'You (GC)', startWeek: 1, endWeek: 1, phase: 'Sourcing' },
  { id: 'quote-glass', label: 'Get glass door quotes (2+)', crew: 'You (GC)', startWeek: 1, endWeek: 1, phase: 'Sourcing' },
  { id: 'order-pax', label: 'Order IKEA PAX', crew: 'You (GC)', startWeek: 2, endWeek: 2, phase: 'Sourcing' },

  // PHASE 2: DEMO (Week 2)
  { id: 'demo-shower', label: 'Demo shower stall (pan, tile, framing)', crew: 'Carpenter', startWeek: 2, endWeek: 2, phase: 'Demo' },
  { id: 'demo-closet', label: 'Demo closet cabs + doors + blinds', crew: 'Carpenter', startWeek: 2, endWeek: 2, phase: 'Demo' },

  // PHASE 3: ROUGH-IN (Week 2)
  { id: 'plumb-rough', label: 'Plumbing rough-in (drain + supply)', crew: 'Carpenter', startWeek: 2, endWeek: 2, dependsOn: ['demo-shower'], phase: 'Rough-In' },
  { id: 'elec-rough', label: 'Electrical rough-in (fan + thermostat)', crew: 'Carpenter', startWeek: 2, endWeek: 2, dependsOn: ['demo-shower'], phase: 'Rough-In' },

  // PHASE 4: FRAMING & STRUCTURAL (Week 3)
  { id: 'brick-cut', label: 'Cut brick for door opening (saw rental)', crew: 'Carpenter', startWeek: 3, endWeek: 3, phase: 'Structural' },
  { id: 'door-threshold', label: 'Set door threshold', crew: 'Carpenter', startWeek: 3, endWeek: 3, dependsOn: ['brick-cut'], phase: 'Structural' },
  { id: 'frame-shower', label: 'Frame shower walls + bench', crew: 'Carpenter', startWeek: 3, endWeek: 3, dependsOn: ['plumb-rough'], phase: 'Structural' },
  { id: 'shower-pan', label: 'Mud-set shower pan', crew: 'Carpenter', startWeek: 3, endWeek: 3, dependsOn: ['frame-shower'], phase: 'Structural' },

  // PHASE 5: TILE (Week 4-5) — critical path
  { id: 'tile-prep', label: 'Cement board + waterproof membrane', crew: 'Tile Installer', startWeek: 4, endWeek: 4, dependsOn: ['shower-pan', 'frame-shower'], phase: 'Tile' },
  { id: 'tile-shower', label: 'Tile shower floor + bench + shelves', crew: 'Tile Installer', startWeek: 4, endWeek: 4, dependsOn: ['tile-prep'], phase: 'Tile' },
  { id: 'tile-wainscot', label: 'Extend wainscot onto new walls', crew: 'Tile Installer', startWeek: 4, endWeek: 5, dependsOn: ['tile-prep'], phase: 'Tile' },
  { id: 'tile-grout', label: 'Grout + seal all tile', crew: 'Tile Installer', startWeek: 5, endWeek: 5, dependsOn: ['tile-shower', 'tile-wainscot'], phase: 'Tile' },
  { id: 'glass-measure', label: 'Measure shower opening', crew: 'Glass Co.', startWeek: 4, endWeek: 4, dependsOn: ['frame-shower'], phase: 'Tile' },

  // PHASE 5b: PARALLEL — bedroom work while tile sub is in bathroom
  { id: 'install-aldoor', label: 'Install aluminum door (arrives W4)', crew: 'Carpenter', startWeek: 4, endWeek: 4, dependsOn: ['order-door', 'door-threshold'], phase: 'Parallel' },
  { id: 'install-pax', label: 'Install IKEA PAX + stock doors', crew: 'Carpenter', startWeek: 5, endWeek: 5, dependsOn: ['order-pax', 'demo-closet'], phase: 'Parallel' },
  { id: 'limewash', label: 'Limewash above wainscot + ceiling', crew: 'Carpenter', startWeek: 5, endWeek: 5, dependsOn: ['tile-grout'], phase: 'Parallel' },

  // PHASE 6: DOORS + GLASS + DRYWALL (Week 6)
  { id: 'glass-install', label: 'Install glass shower door', crew: 'Glass Co.', startWeek: 6, endWeek: 6, dependsOn: ['tile-grout', 'glass-measure'], phase: 'Finishes' },
  { id: 'drywall', label: 'Drywall patches (bedroom + hallway)', crew: 'Carpenter', startWeek: 6, endWeek: 6, phase: 'Finishes' },
  { id: 'hang-doors', label: 'Hang 3 prehung interior doors', crew: 'Carpenter', startWeek: 6, endWeek: 6, phase: 'Finishes' },
  { id: 'exhaust-fan', label: 'Install exhaust fan', crew: 'Carpenter', startWeek: 6, endWeek: 6, dependsOn: ['elec-rough', 'limewash'], phase: 'Finishes' },

  // PHASE 7: PAINT & TRIM (Week 7)
  { id: 'paint', label: 'Paint bedroom + hallway', crew: 'Carpenter', startWeek: 7, endWeek: 7, dependsOn: ['drywall'], phase: 'Paint & Trim' },
  { id: 'blinds', label: 'Install dual roller blinds (x2)', crew: 'Carpenter', startWeek: 7, endWeek: 7, dependsOn: ['paint', 'install-aldoor'], phase: 'Paint & Trim' },
  { id: 'light-fixtures', label: 'Install light fixtures (hall + bath)', crew: 'Carpenter', startWeek: 7, endWeek: 7, dependsOn: ['paint', 'limewash'], phase: 'Paint & Trim' },
  { id: 'thermostat', label: 'Install smart thermostat', crew: 'Carpenter', startWeek: 7, endWeek: 7, dependsOn: ['elec-rough'], phase: 'Paint & Trim' },
  { id: 'bath-door', label: 'Install bathroom door + hardware', crew: 'Carpenter', startWeek: 7, endWeek: 7, dependsOn: ['limewash'], phase: 'Paint & Trim' },
  { id: 'sink-trim', label: 'Replace sink trim/hardware', crew: 'Carpenter', startWeek: 7, endWeek: 7, phase: 'Paint & Trim' },
  { id: 'pin-window', label: 'Pin bedroom window fixed', crew: 'Carpenter', startWeek: 7, endWeek: 7, phase: 'Paint & Trim' },

  // PHASE 8: PUNCH (Week 8)
  { id: 'furniture', label: 'Relocate TV + furniture', crew: 'Carpenter', startWeek: 8, endWeek: 8, dependsOn: ['paint', 'blinds'], phase: 'Punch' },
  { id: 'punch', label: 'Final punch list walkthrough', crew: 'You (GC)', startWeek: 8, endWeek: 8, phase: 'Punch' },
  { id: 'clean', label: 'Clean and done', crew: 'Carpenter', startWeek: 8, endWeek: 8, dependsOn: ['punch'], phase: 'Punch' },
];
