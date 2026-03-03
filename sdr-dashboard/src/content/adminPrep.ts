// Pre-launch checklist for Matt/Aminta — everything that must be done before March 9
// Also includes scheduled meetings with Google Meet links

export interface PrepTask {
  id: string;
  task: string;
  owner: 'Matt' | 'Aminta' | 'Both';
  deadline: string;
  category: 'Tool Setup' | 'Content' | 'Scheduling' | 'Config';
  details: string;
  status: 'not_started' | 'in_progress' | 'done';
  blocksDay?: string; // which onboarding day this blocks
}

export const prepChecklist: PrepTask[] = [
  // Tool Setup
  {
    id: 'prep-gworkspace',
    task: 'Create Google Workspace account for Vanessa',
    owner: 'Aminta',
    deadline: 'March 7',
    category: 'Tool Setup',
    details: 'Create vanessa@[domain] email. Add to fire leads Google Chat space. Share Onboarding Tracker sheet. Share any relevant Drive folders. Set up Calendar.',
    status: 'not_started',
    blocksDay: 'Day 1',
  },
  {
    id: 'prep-hubspot',
    task: 'Create HubSpot user account for Vanessa',
    owner: 'Aminta',
    deadline: 'March 7',
    category: 'Tool Setup',
    details: 'Settings > Users & Teams > Add user. Permissions: contacts, companies, notes. NO deal creation. Create her own owner ID (do NOT use Nano\'s). Test that she can log in and create a note.',
    status: 'not_started',
    blocksDay: 'Day 2',
  },
  {
    id: 'prep-sagan',
    task: 'Verify Sagan platform access',
    owner: 'Aminta',
    deadline: 'March 7',
    category: 'Tool Setup',
    details: 'Confirm Vanessa can log into community.saganpassport.com. Verify she has access to: Modern Knowledge Worker Organization course, Event Library recordings, Sales Skill Sprint live sessions (starts March 10). If access is missing, contact Sagan support immediately — this gates 12+ tasks.',
    status: 'not_started',
    blocksDay: 'Day 1',
  },
  {
    id: 'prep-openphone',
    task: 'Add Vanessa to OpenPhone/Quo',
    owner: 'Aminta',
    deadline: 'March 7',
    category: 'Tool Setup',
    details: 'Add Vanessa as a user on the Quo/OpenPhone account. Assign her to the (623) 300-2119 sales line (shared access). Test that she can make an outbound call and send a text. MUST be ready by Day 3 (live dials start).',
    status: 'not_started',
    blocksDay: 'Day 3',
  },
  {
    id: 'prep-salesnav',
    task: 'Purchase LinkedIn Sales Navigator license',
    owner: 'Matt',
    deadline: 'March 7',
    category: 'Tool Setup',
    details: 'Purchase a Sales Nav license (~$100/mo). Create login for Vanessa. Document the basic workflow for finding GCs/adjusters/PMs in the Phoenix metro area.',
    status: 'not_started',
    blocksDay: 'Day 4',
  },
  {
    id: 'prep-encircle',
    task: 'Create Encircle read-only account',
    owner: 'Aminta',
    deadline: 'March 9',
    category: 'Tool Setup',
    details: 'Create a read-only user in Encircle for Vanessa. Or plan to screen-share during the Day 2 walkthrough. She needs to see real job documentation to understand what techs capture in the field.',
    status: 'not_started',
    blocksDay: 'Day 2',
  },
  {
    id: 'prep-wylander',
    task: 'Enroll Vanessa in Wylander Program',
    owner: 'Matt',
    deadline: 'March 9',
    category: 'Tool Setup',
    details: 'Contact Justin Sifford (justin@wylander.com, 817-697-4312) to enroll Vanessa. Get the actual platform URL and login credentials. Currently listed as "TBD."',
    status: 'not_started',
    blocksDay: 'Week 1',
  },

  // Content
  {
    id: 'prep-recordings',
    task: 'Curate 3-5 example call recordings',
    owner: 'Matt',
    deadline: 'March 11',
    category: 'Content',
    details: 'Pull recordings from OpenPhone/Quo call history. Pick 3-5 calls that demonstrate good technique: one fire lead, one GC cold call, one follow-up. Upload to a shared Google Drive folder or embed in dashboard.',
    status: 'not_started',
    blocksDay: 'Day 4',
  },
  {
    id: 'prep-ga',
    task: 'Set up Google Analytics on azfirehelp.com',
    owner: 'Aminta',
    deadline: 'March 7',
    category: 'Config',
    details: 'Add GA4 tracking to azfirehelp.com. Consider UTM parameters for Vanessa-sent links (azfirehelp.com?ref=vanessa). Submit site to Google Search Console for indexing.',
    status: 'not_started',
    blocksDay: 'Week 3',
  },

  // Scheduling
  {
    id: 'prep-ashlynn',
    task: 'Schedule meeting with Ashlynn (Corporate Packouts marketing)',
    owner: 'Aminta',
    deadline: 'March 7',
    category: 'Scheduling',
    details: 'Book a 30-min meeting for Week 1 (ideally Fri March 13). Ashlynn does marketing overview, brand materials, corporate positioning. Send Google Meet link.',
    status: 'not_started',
    blocksDay: 'Day 5',
  },
  {
    id: 'prep-cedric',
    task: 'Schedule meeting with Cedric (business coaching)',
    owner: 'Aminta',
    deadline: 'March 7',
    category: 'Scheduling',
    details: 'Book a 30-min meeting for Week 1 (ideally Fri March 13). Cedric covers sales approach and expectations from corporate side. Send Google Meet link.',
    status: 'not_started',
    blocksDay: 'Day 5',
  },
  {
    id: 'prep-justin',
    task: 'Schedule Wylander Program intro with Justin',
    owner: 'Matt',
    deadline: 'March 7',
    category: 'Scheduling',
    details: 'Book a 30-min meeting for Week 1 or early Week 2. Justin Sifford (817-697-4312, justin@wylander.com) does the Wylander enrollment and first session. Need the Wylander platform URL.',
    status: 'not_started',
    blocksDay: 'Week 1',
  },
  {
    id: 'prep-jotform',
    task: 'Pre-submit Sales Mastery Course Jotform application',
    owner: 'Aminta',
    deadline: 'March 7',
    category: 'Config',
    details: 'Submit the Jotform application (form.jotform.com/241615152586053) for Vanessa BEFORE Day 1, so Podia access is (hopefully) approved by Week 2. Unknown turnaround time — the earlier the better.',
    status: 'not_started',
    blocksDay: 'Week 3',
  },
];

// Google Meet links for all live sessions
// Matt should create these meetings in Google Calendar and paste the Meet URLs here
export interface ScheduledMeeting {
  id: string;
  title: string;
  date: string;
  time: string; // AZ time
  duration: string;
  participants: string[];
  meetLink: string; // Google Meet URL — filled in by Matt/Aminta
  notes: string;
  taskDay: string; // which day in the plan this corresponds to
}

export const scheduledMeetings: ScheduledMeeting[] = [
  {
    id: 'meet-intro',
    title: 'Day 1 Intro Call with Matt',
    date: 'Mon March 9',
    time: '9:00 AM',
    duration: '60 min',
    participants: ['Matt', 'Vanessa'],
    meetLink: '', // TODO: Matt creates this
    notes: 'Company overview, role expectations, Q&A. The first time you talk live.',
    taskDay: 'Mon 3/9',
  },
  {
    id: 'meet-industry',
    title: 'Industry Deep-Dive with Matt',
    date: 'Tue March 10',
    time: '10:00 AM',
    duration: '60 min',
    participants: ['Matt', 'Vanessa'],
    meetLink: '',
    notes: 'Review the Industry Education lessons together. Matt adds real-world context, answers questions. Bring questions from your reading.',
    taskDay: 'Tue 3/10',
  },
  {
    id: 'meet-encircle',
    title: 'Encircle Walkthrough',
    date: 'Tue March 10',
    time: '2:00 PM',
    duration: '30 min',
    participants: ['Matt', 'Vanessa'],
    meetLink: '',
    notes: 'Matt screen-shares Encircle and walks through real job documentation.',
    taskDay: 'Tue 3/10',
  },
  {
    id: 'meet-hubspot',
    title: 'HubSpot Orientation',
    date: 'Tue March 10',
    time: '3:00 PM',
    duration: '30 min',
    participants: ['Matt', 'Vanessa'],
    meetLink: '',
    notes: 'Walk through contacts, notes, logging workflow. Practice creating a note together.',
    taskDay: 'Tue 3/10',
  },
  {
    id: 'meet-fireleads',
    title: 'Fire Leads Deep-Dive',
    date: 'Wed March 11',
    time: '9:00 AM',
    duration: '30 min',
    participants: ['Matt', 'Vanessa'],
    meetLink: '',
    notes: 'Review fire lead alerts in Gmail/GChat. Walk through azfirehelp.com. Practice the workflow.',
    taskDay: 'Wed 3/11',
  },
  {
    id: 'meet-shadow1',
    title: 'Call Shadowing — Day 3',
    date: 'Wed March 11',
    time: '10:00 AM',
    duration: '90 min',
    participants: ['Matt', 'Vanessa'],
    meetLink: '',
    notes: 'Vanessa makes her first 10-15 live dials. Matt listens in and provides feedback after each call.',
    taskDay: 'Wed 3/11',
  },
  {
    id: 'meet-shadow2',
    title: 'Call Shadowing — Day 4',
    date: 'Thu March 12',
    time: '9:00 AM',
    duration: '90 min',
    participants: ['Matt', 'Vanessa'],
    meetLink: '',
    notes: 'Continue live dials. Matt reviews calls and HubSpot notes. Daily debrief.',
    taskDay: 'Thu 3/12',
  },
  {
    id: 'meet-ashlynn',
    title: 'Meet Ashlynn — Corporate Packouts Marketing',
    date: 'Fri March 13',
    time: '10:00 AM',
    duration: '30 min',
    participants: ['Ashlynn', 'Vanessa'],
    meetLink: '',
    notes: 'Marketing overview, brand materials, corporate positioning.',
    taskDay: 'Fri 3/13',
  },
  {
    id: 'meet-cedric',
    title: 'Meet Cedric — Business Coaching',
    date: 'Fri March 13',
    time: '11:00 AM',
    duration: '30 min',
    participants: ['Cedric', 'Vanessa'],
    meetLink: '',
    notes: 'Sales approach, expectations from corporate.',
    taskDay: 'Fri 3/13',
  },
  {
    id: 'meet-w1-checkin',
    title: 'Week 1 Check-In',
    date: 'Fri March 13',
    time: '3:00 PM',
    duration: '30 min',
    participants: ['Matt', 'Vanessa'],
    meetLink: '',
    notes: 'Review Week 1 progress, answer questions, plan Week 2.',
    taskDay: 'Fri 3/13',
  },
  // Week 2
  {
    id: 'meet-roleplay-12',
    title: 'Role-Play: Scripts 1 & 2',
    date: 'Mon March 16',
    time: '9:00 AM',
    duration: '45 min',
    participants: ['Matt', 'Vanessa'],
    meetLink: '',
    notes: 'Practice Fire Lead + GC/Restoration scripts. Matt certifies each one.',
    taskDay: 'Mon 3/16',
  },
  {
    id: 'meet-roleplay-34',
    title: 'Role-Play: Scripts 3 & 4',
    date: 'Tue March 17',
    time: '10:00 AM',
    duration: '45 min',
    participants: ['Matt', 'Vanessa'],
    meetLink: '',
    notes: 'Practice Adjuster + Property Manager scripts. Matt certifies.',
    taskDay: 'Tue 3/17',
  },
  {
    id: 'meet-firelead-shadow',
    title: 'Fire Lead Shadow — Watch Matt',
    date: 'Wed March 18',
    time: 'When alert arrives',
    duration: '30 min',
    participants: ['Matt', 'Vanessa'],
    meetLink: '',
    notes: 'Vanessa watches Matt handle 1-2 real fire lead alerts. Depends on alerts arriving.',
    taskDay: 'Wed 3/18',
  },
  {
    id: 'meet-roleplay-5',
    title: 'Role-Play: Script 5 + Full Certification',
    date: 'Thu March 19',
    time: '9:00 AM',
    duration: '45 min',
    participants: ['Matt', 'Vanessa'],
    meetLink: '',
    notes: 'Practice Follow-Up script. Full certification review of all 5.',
    taskDay: 'Thu 3/19',
  },
  {
    id: 'meet-w2-checkin',
    title: 'Week 2 Check-In',
    date: 'Fri March 20',
    time: '3:00 PM',
    duration: '30 min',
    participants: ['Matt', 'Vanessa'],
    meetLink: '',
    notes: 'Review Week 2, role-play certifications, plan Week 3.',
    taskDay: 'Fri 3/20',
  },
  // Week 3
  {
    id: 'meet-w3-checkin',
    title: 'Week 3 Check-In + Wylander Check-In',
    date: 'Fri March 27',
    time: '3:00 PM',
    duration: '30 min',
    participants: ['Matt', 'Vanessa', 'Justin (if available)'],
    meetLink: '',
    notes: 'Review Week 3, KPIs, fire lead performance. Wylander progress check.',
    taskDay: 'Fri 3/27',
  },
  // Week 4
  {
    id: 'meet-final-review',
    title: 'End-of-Onboarding Performance Review',
    date: 'Fri April 3',
    time: '2:00 PM',
    duration: '60 min',
    participants: ['Matt', 'Vanessa'],
    meetLink: '',
    notes: 'KPIs, pipeline, fire lead performance, note quality. Graduation review.',
    taskDay: 'Fri 4/3',
  },
];
