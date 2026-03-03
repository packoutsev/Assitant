import type { ScheduleWeek } from '../types';

export const DEADLINE = '2026-04-21';

export const schedule: ScheduleWeek[] = [
  {
    week: 1,
    label: 'Week 1 — Sourcing & Ordering',
    dateRange: 'Mar 3 – Mar 7',
    tasks: [
      { task: 'Order aluminum door (3-week lead)', zone: 'Primary Bedroom', status: 'Not Started' },
      { task: 'Get quotes from glass shower door companies (2+)', zone: 'Primary Bathroom', status: 'Not Started' },
      { task: 'Source limewash (Romabio or similar)', zone: 'Primary Bathroom', status: 'Not Started' },
      { task: 'Source large format field tile — confirm in stock locally', zone: 'Primary Bathroom', status: 'Not Started' },
      { task: 'Source wainscot-matching tile locally', zone: 'Primary Bathroom', status: 'Not Started' },
    ],
  },
  {
    week: 2,
    label: 'Week 2 — Demo & Rough-In',
    dateRange: 'Mar 10 – Mar 14',
    tasks: [
      { task: 'Demo shower stall (pan, tile, framing)', zone: 'Primary Bathroom', status: 'Not Started' },
      { task: 'Remove closet cabinets (upper + lower)', zone: 'Primary Bedroom', status: 'Not Started' },
      { task: 'Remove existing blinds and closet doors', zone: 'Primary Bedroom', status: 'Not Started' },
      { task: 'Plumber rough-in: new drain, supply lines to wet wall', zone: 'Primary Bathroom', status: 'Not Started' },
      { task: 'Electrician rough-in: exhaust fan, thermostat relocation', zone: 'Primary Bathroom', status: 'Not Started' },
      { task: 'Order IKEA PAX carcasses + stock doors', zone: 'Primary Bedroom', status: 'Not Started' },
    ],
  },
  {
    week: 3,
    label: 'Week 3 — Framing & Structural',
    dateRange: 'Mar 17 – Mar 21',
    tasks: [
      { task: 'Cut brick below bedroom window to floor level for door', zone: 'Primary Bedroom', status: 'Not Started' },
      { task: 'Set door threshold', zone: 'Primary Bedroom', status: 'Not Started' },
      { task: 'Frame new shower walls', zone: 'Primary Bathroom', status: 'Not Started' },
      { task: 'Plumbing inspection (if required)', zone: 'Primary Bathroom', status: 'Not Started' },
      { task: 'Install mud-set shower pan', zone: 'Primary Bathroom', status: 'Not Started' },
    ],
  },
  {
    week: 4,
    label: 'Week 4 — Tile Prep & Install',
    dateRange: 'Mar 24 – Mar 28',
    tasks: [
      { task: 'Cement board and waterproof membrane', zone: 'Primary Bathroom', status: 'Not Started' },
      { task: 'Tile shower floor, bench, shelves (large format field tile)', zone: 'Primary Bathroom', status: 'Not Started' },
      { task: 'Extend wainscot tile onto new walls', zone: 'Primary Bathroom', status: 'Not Started' },
      { task: 'Install aluminum door (arrives this week)', zone: 'Primary Bedroom', status: 'Not Started' },
      { task: 'Glass company measures finished shower opening', zone: 'Primary Bathroom', status: 'Not Started' },
    ],
  },
  {
    week: 5,
    label: 'Week 5 — Tile Finish & Limewash',
    dateRange: 'Mar 31 – Apr 4',
    tasks: [
      { task: 'Grout and seal all tile', zone: 'Primary Bathroom', status: 'Not Started' },
      { task: 'Fill and seal existing grout (retained areas)', zone: 'Primary Bathroom', status: 'Not Started' },
      { task: 'Limewash — above wainscot walls + ceiling', zone: 'Primary Bathroom', status: 'Not Started' },
      { task: 'Install IKEA closet carcasses + stock doors', zone: 'Primary Bedroom', status: 'Not Started' },
    ],
  },
  {
    week: 6,
    label: 'Week 6 — Doors, Glass & Electrical',
    dateRange: 'Apr 7 – Apr 11',
    tasks: [
      { task: 'Install glass shower door (hinged + fixed panel)', zone: 'Primary Bathroom', status: 'Not Started' },
      { task: 'Drywall patches — bedroom and hallway', zone: 'Primary Bedroom', status: 'Not Started' },
      { task: 'Hang 3 prehung interior doors', zone: 'Primary Hallway', status: 'Not Started' },
      { task: 'Install exhaust fan', zone: 'Primary Bathroom', status: 'Not Started' },
    ],
  },
  {
    week: 7,
    label: 'Week 7 — Paint & Finish',
    dateRange: 'Apr 14 – Apr 18',
    tasks: [
      { task: 'Paint bedroom walls and ceiling', zone: 'Primary Bedroom', status: 'Not Started' },
      { task: 'Paint hallway walls and ceiling', zone: 'Primary Hallway', status: 'Not Started' },
      { task: 'Install dual roller blinds (window + door)', zone: 'Primary Bedroom', status: 'Not Started' },
      { task: 'Install light fixtures (hallway + bathroom)', zone: 'Primary Hallway', status: 'Not Started' },
      { task: 'Install smart thermostat', zone: 'Primary Hallway', status: 'Not Started' },
      { task: 'Install new bathroom door + hardware', zone: 'Primary Bathroom', status: 'Not Started' },
      { task: 'Replace sink trim/hardware', zone: 'Primary Bathroom', status: 'Not Started' },
      { task: 'Pin bedroom window fixed', zone: 'Primary Bedroom', status: 'Not Started' },
    ],
  },
  {
    week: 8,
    label: 'Week 8 — Punch & Complete',
    dateRange: 'Apr 21',
    tasks: [
      { task: 'Relocate TV and furniture', zone: 'Primary Bedroom', status: 'Not Started' },
      { task: 'Final punch list walkthrough', zone: 'Primary Bathroom', status: 'Not Started' },
      { task: 'Clean and done', zone: 'Primary Bedroom', status: 'Not Started' },
    ],
  },
];
