// Mock data for development (before Apps Script is deployed)
// Mirrors the actual Google Sheet structure

import type { DailyTask, ToolAccess, KPIRow, TrainingModule, QuickRefEntry } from '../types';

export const mockDailyPlan: DailyTask[] = [
  { Day: 'Mon 3/9', Phase: 'Week 1', Task: 'Begin Modern Knowledge Worker Organization (Sessions 1-2) + Apply for Sales Mastery Course (Jotform)', Category: 'Sagan Async', Owner: 'Vanessa', Status: 'Not Started', Notes: 'MKW: External Brain Framework. Sales Mastery Jotform: form.jotform.com/241615152586053', _row: 4 },
  { Day: 'Mon 3/9', Phase: 'Week 1', Task: 'Read SDR Playbook cover to cover (sdr-playbook.md)', Category: 'Playbook', Owner: 'Vanessa', Status: 'Not Started', Notes: 'Highlight questions for Matt. This is your bible.', _row: 5 },
  { Day: 'Mon 3/9', Phase: 'Week 1', Task: 'Intro call with Matt — company overview, role, expectations, Q&A', Category: 'Onboarding', Owner: 'Both', Status: 'Not Started', Notes: 'Industry crash course starts here.', _row: 6 },
  { Day: 'Mon 3/9', Phase: 'Week 1', Task: 'Tool setup: Google Workspace (Gmail, Chat, Calendar, Sheets) — confirm fire leads Chat space access', Category: 'Setup', Owner: 'Both', Status: 'Not Started', Notes: 'Matt handles invites. Vanessa confirms access.', _row: 7 },
  { Day: 'Mon 3/9', Phase: 'Week 1', Task: 'Open Onboarding Tracker + bookmark it. Review all tabs.', Category: 'Onboarding', Owner: 'Vanessa', Status: 'Not Started', Notes: 'This tracker is your daily home base.', _row: 8 },
  { Day: 'Tue 3/10', Phase: 'Week 1', Task: 'Sales Skill Sprint Session 1 (LIVE, 7:30 AM AZ) — Defining Your Sales Identity & Philosophy', Category: 'Sagan Live', Owner: 'Vanessa', Status: 'Not Started', Notes: 'Do NOT miss. First live session.', _row: 9 },
  { Day: 'Tue 3/10', Phase: 'Week 1', Task: 'Industry deep-dive with Matt: packout lifecycle, insurance claims, key terms (RCV, ACV, Xactimate, mitigation)', Category: 'Industry Education', Owner: 'Both', Status: 'Not Started', Notes: 'Must understand this to talk to any lead type.', _row: 10 },
  { Day: 'Tue 3/10', Phase: 'Week 1', Task: 'Encircle walkthrough: browse real jobs to understand field documentation', Category: 'Industry Education', Owner: 'Both', Status: 'Not Started', Notes: 'Read-only. See what techs document on real jobs.', _row: 11 },
  { Day: 'Tue 3/10', Phase: 'Week 1', Task: 'Tool setup: HubSpot login + orientation (contacts, notes, logging workflow)', Category: 'Setup', Owner: 'Both', Status: 'Not Started', Notes: 'Matt walks through. Vanessa practices logging.', _row: 12 },
  { Day: 'Wed 3/11', Phase: 'Week 1', Task: 'MKW Organization Sessions 3-4 + Event Library: Objection Handling', Category: 'Sagan Async', Owner: 'Vanessa', Status: 'Not Started', Notes: 'MKW: Workflow Design, Time Mastery', _row: 13 },
  { Day: 'Wed 3/11', Phase: 'Week 1', Task: 'Fire Leads deep-dive: how fireleads.com works, alert flow, SLA, azfirehelp.com walkthrough', Category: 'Industry Education', Owner: 'Both', Status: 'Not Started', Notes: 'Understand the alert → call → text → log workflow.', _row: 14 },
  { Day: 'Wed 3/11', Phase: 'Week 1', Task: 'Begin live dials (10-15) — cold outreach with Matt shadowing', Category: 'Live Calls', Owner: 'Vanessa', Status: 'Not Started', Notes: 'She\'s experienced. Start phones Day 3.', _row: 15 },
  { Day: 'Thu 3/12', Phase: 'Week 1', Task: 'Continue live dials (10-15) — Matt reviews calls and HubSpot notes', Category: 'Live Calls', Owner: 'Vanessa', Status: 'Not Started', Notes: 'Daily debrief on call quality and note quality.', _row: 16 },
  { Day: 'Thu 3/12', Phase: 'Week 1', Task: 'Tool setup: LinkedIn Sales Navigator + OpenPhone/Quo', Category: 'Setup', Owner: 'Both', Status: 'Not Started', Notes: 'Build first prospecting list from Sales Nav.', _row: 17 },
  { Day: 'Thu 3/12', Phase: 'Week 1', Task: 'Listen to real call recordings — learn what good calls sound like', Category: 'Training', Owner: 'Vanessa', Status: 'Not Started', Notes: 'Matt provides recordings.', _row: 18 },
  { Day: 'Fri 3/13', Phase: 'Week 1', Task: 'MKW Sessions 5-6 + Event Library: Getting Organized', Category: 'Sagan Async', Owner: 'Vanessa', Status: 'Not Started', Notes: 'MKW: Communication Excellence, Stress Management', _row: 19 },
  { Day: 'Fri 3/13', Phase: 'Week 1', Task: 'Meet Ashlynn (Corporate Packouts marketing) + Cedric (business coaching)', Category: 'Onboarding', Owner: 'Both', Status: 'Not Started', Notes: 'Matt coordinates. Get enrolled in Wylander w/ Justin.', _row: 20 },
  { Day: 'Fri 3/13', Phase: 'Week 1', Task: 'Competitive landscape review: Better Box, Cardinal, others in the Valley', Category: 'Industry Education', Owner: 'Both', Status: 'Not Started', Notes: 'Know who else does this and how we differentiate.', _row: 21 },
  { Day: 'Fri 3/13', Phase: 'Week 1', Task: 'Week 1 check-in with Matt — review progress, answer questions, plan Week 2', Category: 'Onboarding', Owner: 'Both', Status: 'Not Started', Notes: 'End-of-week sync.', _row: 22 },

  // Week 2
  { Day: 'Mon 3/16', Phase: 'Week 2', Task: 'MKW Sessions 7-8 + Event Library: Building Scalable Cold Calling Systems', Category: 'Sagan Async', Owner: 'Vanessa', Status: 'Not Started', Notes: '', _row: 25 },
  { Day: 'Mon 3/16', Phase: 'Week 2', Task: 'Role-play Scripts 1 & 2 with Matt (Fire Lead + GC/Restoration)', Category: 'Role-Play', Owner: 'Both', Status: 'Not Started', Notes: 'Get certified on each.', _row: 26 },
  { Day: 'Mon 3/16', Phase: 'Week 2', Task: 'Live dials: 20-30 dials target', Category: 'Live Calls', Owner: 'Vanessa', Status: 'Not Started', Notes: 'Increasing volume. Matt reviews notes daily.', _row: 27 },
  { Day: 'Tue 3/17', Phase: 'Week 2', Task: 'Sales Skill Sprint Session 2 (LIVE, 7:30 AM AZ) — Mapping Your Current Sales Process', Category: 'Sagan Live', Owner: 'Vanessa', Status: 'Not Started', Notes: '', _row: 28 },
  { Day: 'Tue 3/17', Phase: 'Week 2', Task: 'Role-play Scripts 3 & 4 with Matt (Adjuster + Property Manager)', Category: 'Role-Play', Owner: 'Both', Status: 'Not Started', Notes: '', _row: 29 },
  { Day: 'Wed 3/18', Phase: 'Week 2', Task: 'MKW Sessions 9-10 + Event Library: Cold Calling Data & KPIs', Category: 'Sagan Async', Owner: 'Vanessa', Status: 'Not Started', Notes: '', _row: 30 },
  { Day: 'Wed 3/18', Phase: 'Week 2', Task: 'Fire lead practice: shadow Matt on 1-2 real alerts', Category: 'Fire Leads', Owner: 'Both', Status: 'Not Started', Notes: 'Watch how Matt handles the call and log.', _row: 31 },
  { Day: 'Thu 3/19', Phase: 'Week 2', Task: 'Role-play Script 5 (Follow-Up) + full certification review', Category: 'Role-Play', Owner: 'Both', Status: 'Not Started', Notes: 'All 5 scripts certified by end of this week.', _row: 32 },
  { Day: 'Thu 3/19', Phase: 'Week 2', Task: 'LinkedIn Sales Nav: build Week 3 call lists', Category: 'Prospecting', Owner: 'Vanessa', Status: 'Not Started', Notes: 'Export to HubSpot.', _row: 33 },
  { Day: 'Fri 3/20', Phase: 'Week 2', Task: 'MKW Sessions 11-12 (final) + Event Library: Cross-Cultural Communication', Category: 'Sagan Async', Owner: 'Vanessa', Status: 'Not Started', Notes: 'MKW complete!', _row: 34 },
  { Day: 'Fri 3/20', Phase: 'Week 2', Task: 'Fire lead practice: try 1-2 supervised fire lead calls', Category: 'Fire Leads', Owner: 'Vanessa', Status: 'Not Started', Notes: 'Matt reviews after.', _row: 35 },
  { Day: 'Fri 3/20', Phase: 'Week 2', Task: 'Start sending daily summaries via Google Chat', Category: 'Reporting', Owner: 'Vanessa', Status: 'Not Started', Notes: 'Use daily summary template from Quick Reference.', _row: 36 },
  { Day: 'Fri 3/20', Phase: 'Week 2', Task: 'Week 2 check-in with Matt', Category: 'Onboarding', Owner: 'Both', Status: 'Not Started', Notes: '', _row: 37 },

  // Week 3
  { Day: 'Mon 3/23', Phase: 'Week 3', Task: 'Sales Mastery Course — continue on Podia', Category: 'Sagan Async', Owner: 'Vanessa', Status: 'Not Started', Notes: '', _row: 40 },
  { Day: 'Mon 3/23', Phase: 'Week 3', Task: '40-50 dials/day — ramp volume', Category: 'Live Calls', Owner: 'Vanessa', Status: 'Not Started', Notes: 'Focus on 10-12 meaningful conversations.', _row: 41 },
  { Day: 'Tue 3/24', Phase: 'Week 3', Task: 'Sales Skill Sprint Session 3 (LIVE, 7:30 AM AZ) — Designing a High-Converting Sales Process', Category: 'Sagan Live', Owner: 'Vanessa', Status: 'Not Started', Notes: '', _row: 42 },
  { Day: 'Tue 3/24', Phase: 'Week 3', Task: 'Event Library: Leveraging AI for Sales Growth', Category: 'Sagan Async', Owner: 'Vanessa', Status: 'Not Started', Notes: '', _row: 43 },
  { Day: 'Wed 3/25', Phase: 'Week 3', Task: 'Independent fire lead response — Matt reviews after, not during', Category: 'Fire Leads', Owner: 'Vanessa', Status: 'Not Started', Notes: '', _row: 44 },
  { Day: 'Wed 3/25', Phase: 'Week 3', Task: 'Event Library: How to Generate Leads with Cold Emails', Category: 'Sagan Async', Owner: 'Vanessa', Status: 'Not Started', Notes: '', _row: 45 },
  { Day: 'Thu 3/26', Phase: 'Week 3', Task: 'Matt spot-checks 3-5 HubSpot notes for quality', Category: 'QA', Owner: 'Matt', Status: 'Not Started', Notes: '', _row: 46 },
  { Day: 'Thu 3/26', Phase: 'Week 3', Task: 'Build Week 4 call lists from LinkedIn Sales Nav', Category: 'Prospecting', Owner: 'Vanessa', Status: 'Not Started', Notes: '', _row: 47 },
  { Day: 'Fri 3/27', Phase: 'Week 3', Task: 'Event Library: 3 Ways to Stop Losing Leads', Category: 'Sagan Async', Owner: 'Vanessa', Status: 'Not Started', Notes: '', _row: 48 },
  { Day: 'Fri 3/27', Phase: 'Week 3', Task: 'Week 3 check-in + Wylander Program check-in w/ Justin', Category: 'Onboarding', Owner: 'Both', Status: 'Not Started', Notes: '', _row: 49 },

  // Week 4
  { Day: 'Mon 3/30', Phase: 'Week 4', Task: '60-80 dials/day — full production', Category: 'Live Calls', Owner: 'Vanessa', Status: 'Not Started', Notes: 'Target: 13 meaningful conversations/day.', _row: 52 },
  { Day: 'Mon 3/30', Phase: 'Week 4', Task: 'Sales Mastery Course — finish remaining modules', Category: 'Sagan Async', Owner: 'Vanessa', Status: 'Not Started', Notes: '', _row: 53 },
  { Day: 'Tue 3/31', Phase: 'Week 4', Task: 'Sales Skill Sprint Session 4 (LIVE, 7:30 AM AZ) — Follow-Up & Closing Systems (FINAL)', Category: 'Sagan Live', Owner: 'Vanessa', Status: 'Not Started', Notes: 'Last live session!', _row: 54 },
  { Day: 'Tue 3/31', Phase: 'Week 4', Task: 'Fire leads: independent handling, next-AM-by-noon SLA', Category: 'Fire Leads', Owner: 'Vanessa', Status: 'Not Started', Notes: 'Escalate per playbook rules.', _row: 55 },
  { Day: 'Wed 4/1', Phase: 'Week 4', Task: 'Full production — 60-80 dials, daily summary by 4 PM AZ', Category: 'Live Calls', Owner: 'Vanessa', Status: 'Not Started', Notes: '', _row: 56 },
  { Day: 'Thu 4/2', Phase: 'Week 4', Task: 'Full production — continue', Category: 'Live Calls', Owner: 'Vanessa', Status: 'Not Started', Notes: '', _row: 57 },
  { Day: 'Fri 4/3', Phase: 'Week 4', Task: 'End-of-onboarding performance review with Matt', Category: 'Onboarding', Owner: 'Both', Status: 'Not Started', Notes: 'KPIs, pipeline, fire lead performance, note quality. Graduation!', _row: 58 },
];

export const mockToolAccess: ToolAccess[] = [
  { Tool: 'HubSpot', Purpose: 'CRM — logging calls, contacts, pipeline tracking', 'Access Level': 'Full — contacts, companies, notes (no deal creation)', 'Setup Owner': 'Matt', Status: 'Not Started', 'Login/URL': 'app.hubspot.com', Notes: 'Primary work tool.', _row: 2 },
  { Tool: 'LinkedIn Sales Navigator', Purpose: 'Prospecting — find GCs, adjusters, PMs', 'Access Level': 'Full — search, save leads, InMail', 'Setup Owner': 'Matt', Status: 'Not Started', 'Login/URL': 'linkedin.com/sales', Notes: 'Build call lists.', _row: 3 },
  { Tool: 'Google Workspace', Purpose: 'Gmail, Chat, Calendar, Sheets', 'Access Level': 'Full', 'Setup Owner': 'Matt', Status: 'Not Started', 'Login/URL': 'workspace.google.com', Notes: 'Fire leads come via Chat.', _row: 4 },
  { Tool: 'OpenPhone / Quo', Purpose: 'Outbound calls + texts from (623) 300-2119', 'Access Level': 'Full — outbound calls, texts', 'Setup Owner': 'Matt', Status: 'Not Started', 'Login/URL': 'openphone.com', Notes: 'Sales phone line.', _row: 5 },
  { Tool: 'Sagan Platform', Purpose: 'Async courses + live training', 'Access Level': 'Full', 'Setup Owner': 'Matt', Status: 'Not Started', 'Login/URL': 'community.saganpassport.com/c/async-courses/', Notes: '', _row: 6 },
  { Tool: 'azfirehelp.com', Purpose: 'Homeowner resource site — text after every fire lead call', 'Access Level': 'N/A — reference link', 'Setup Owner': 'N/A', Status: 'Ready', 'Login/URL': 'azfirehelp.com', Notes: '', _row: 7 },
  { Tool: 'Encircle', Purpose: 'Read-only — browse real jobs, understand field documentation', 'Access Level': 'Read-only', 'Setup Owner': 'Matt', Status: 'Not Started', 'Login/URL': 'encircleapp.com', Notes: '', _row: 8 },
  { Tool: 'Wylander Program', Purpose: 'Sales coaching with Justin', 'Access Level': 'Full', 'Setup Owner': 'Matt', Status: 'Not Started', 'Login/URL': 'TBD', Notes: 'Enroll Week 1.', _row: 9 },
];

export const mockKpiRamp: KPIRow[] = [
  { _section: 'PRIMARY KPIs', Metric: 'Meaningful Conversations / Day', 'Week 1 Target': '3-5 (start Day 3)', 'Week 1 Actual': '', 'Week 2 Target': '7-10', 'Week 2 Actual': '', 'Week 3 Target': '10-12', 'Week 3 Actual': '', 'Week 4 Target': '13', 'Week 4 Actual': '', Notes: 'THE number. Non-negotiable at full ramp.', _row: 3 },
  { _section: 'PRIMARY KPIs', Metric: 'Meetings Set for Matt / Week', 'Week 1 Target': '0', 'Week 1 Actual': '', 'Week 2 Target': '1', 'Week 2 Actual': '', 'Week 3 Target': '2', 'Week 3 Actual': '', 'Week 4 Target': '3+', 'Week 4 Actual': '', Notes: 'Intros, pricing convos, adjuster meetings.', _row: 4 },

  { _section: 'FIRE LEAD KPIs', Metric: 'Time to First Outreach', 'Week 1 Target': 'N/A', 'Week 1 Actual': '', 'Week 2 Target': 'Next AM by noon (supervised)', 'Week 2 Actual': '', 'Week 3 Target': 'Next AM by noon', 'Week 3 Actual': '', 'Week 4 Target': 'Next AM by noon', 'Week 4 Actual': '', Notes: 'Even a 2am fire = first call next morning by noon.', _row: 8 },
  { _section: 'FIRE LEAD KPIs', Metric: 'Homeowner Reached (Live)', 'Week 1 Target': 'N/A', 'Week 1 Actual': '', 'Week 2 Target': 'Track', 'Week 2 Actual': '', 'Week 3 Target': 'Track', 'Week 3 Actual': '', 'Week 4 Target': 'Track', 'Week 4 Actual': '', Notes: 'Did she get the homeowner on the phone?', _row: 9 },
  { _section: 'FIRE LEAD KPIs', Metric: 'Text + azfirehelp.com Sent', 'Week 1 Target': 'N/A', 'Week 1 Actual': '', 'Week 2 Target': '100%', 'Week 2 Actual': '', 'Week 3 Target': '100%', 'Week 3 Actual': '', 'Week 4 Target': '100%', 'Week 4 Actual': '', Notes: 'Text with link sent after every first call/VM.', _row: 11 },
  { _section: 'FIRE LEAD KPIs', Metric: 'Follow-Up Cadence', 'Week 1 Target': 'N/A', 'Week 1 Actual': '', 'Week 2 Target': '100%', 'Week 2 Actual': '', 'Week 3 Target': '100%', 'Week 3 Actual': '', 'Week 4 Target': '100%', 'Week 4 Actual': '', Notes: '3 attempts over 7 days. No lead unworked.', _row: 12 },

  { _section: 'ACTIVITY KPIs', Metric: 'Dials / Day', 'Week 1 Target': '10-15 (Day 3+)', 'Week 1 Actual': '', 'Week 2 Target': 'As needed for 7-10 convos', 'Week 2 Actual': '', 'Week 3 Target': 'As needed for 10-12', 'Week 3 Actual': '', 'Week 4 Target': 'As needed for 13', 'Week 4 Actual': '', Notes: 'Expect 40-50 dials to hit 13 convos.', _row: 18 },
  { _section: 'ACTIVITY KPIs', Metric: 'HubSpot Notes Logged', 'Week 1 Target': 'Practice entries', 'Week 1 Actual': '', 'Week 2 Target': 'Every call', 'Week 2 Actual': '', 'Week 3 Target': 'Every call', 'Week 3 Actual': '', 'Week 4 Target': 'Every call', 'Week 4 Actual': '', Notes: 'Full note template, no exceptions.', _row: 19 },
  { _section: 'ACTIVITY KPIs', Metric: 'New Contacts Added / Week', 'Week 1 Target': '0', 'Week 1 Actual': '', 'Week 2 Target': '20', 'Week 2 Actual': '', 'Week 3 Target': '20', 'Week 3 Actual': '', 'Week 4 Target': '20+', 'Week 4 Actual': '', Notes: 'LinkedIn Sales Nav → HubSpot.', _row: 20 },
  { _section: 'ACTIVITY KPIs', Metric: 'Daily Summary Sent', 'Week 1 Target': 'No', 'Week 1 Actual': '', 'Week 2 Target': 'Start Fri', 'Week 2 Actual': '', 'Week 3 Target': 'Every day', 'Week 3 Actual': '', 'Week 4 Target': 'Every day', 'Week 4 Actual': '', Notes: 'Via GChat to Matt, end of day.', _row: 22 },
];

export const mockTrainingLog: TrainingModule[] = [
  // Industry Education
  { Module: 'What is contents packout, cleaning, storage, and pack-back', Source: 'Matt / Internal', Category: 'Industry Education', 'Due By': 'Day 2', Completed: '', 'Score / Notes': 'Core service overview', _row: 4 },
  { Module: 'Insurance claim lifecycle', Source: 'Matt / Internal', Category: 'Industry Education', 'Due By': 'Day 2', Completed: '', 'Score / Notes': 'loss → claim → adjuster → scope → vendor → work auth', _row: 5 },
  { Module: 'Key terms: RCV, ACV, depreciation, Xactimate, mitigation', Source: 'Matt / Internal', Category: 'Industry Education', 'Due By': 'Day 2', Completed: '', 'Score / Notes': '', _row: 6 },
  { Module: 'Customer types: homeowners, GCs, adjusters, PMs', Source: 'Matt / Internal', Category: 'Industry Education', 'Due By': 'Day 3', Completed: '', 'Score / Notes': '', _row: 7 },
  { Module: 'Competitive landscape (Better Box, Cardinal, etc.)', Source: 'Matt / Internal', Category: 'Industry Education', 'Due By': 'Day 5', Completed: '', 'Score / Notes': '', _row: 8 },
  { Module: 'Fire Leads: how fireleads.com works + azfirehelp.com walkthrough', Source: 'Matt / Internal', Category: 'Industry Education', 'Due By': 'Day 3', Completed: '', 'Score / Notes': '', _row: 9 },

  // Sagan Async
  { Module: 'Modern Knowledge Worker Org — Sessions 1-2', Source: 'Sagan Async', Category: 'Sagan Async', 'Due By': 'Day 1', Completed: '', 'Score / Notes': 'External Brain Framework', _row: 12 },
  { Module: 'Modern Knowledge Worker Org — Sessions 3-4', Source: 'Sagan Async', Category: 'Sagan Async', 'Due By': 'Day 3', Completed: '', 'Score / Notes': 'Workflow Design, Time Mastery', _row: 13 },
  { Module: 'Modern Knowledge Worker Org — Sessions 5-6', Source: 'Sagan Async', Category: 'Sagan Async', 'Due By': 'Day 5', Completed: '', 'Score / Notes': 'Communication, Stress Mgmt', _row: 14 },
  { Module: 'Modern Knowledge Worker Org — Sessions 7-12', Source: 'Sagan Async', Category: 'Sagan Async', 'Due By': 'Week 2', Completed: '', 'Score / Notes': '', _row: 15 },
  { Module: 'Sales Mastery Course (Podia)', Source: 'Sagan / Podia', Category: 'Sagan Async', 'Due By': 'Week 4', Completed: '', 'Score / Notes': 'Apply via Jotform first', _row: 16 },

  // Sagan Live
  { Module: 'Sales Skill Sprint 1 — Sales Identity & Philosophy', Source: 'Sagan Live', Category: 'Sagan Live', 'Due By': 'Tue 3/10', Completed: '', 'Score / Notes': '', _row: 19 },
  { Module: 'Sales Skill Sprint 2 — Mapping Sales Process', Source: 'Sagan Live', Category: 'Sagan Live', 'Due By': 'Tue 3/17', Completed: '', 'Score / Notes': '', _row: 20 },
  { Module: 'Sales Skill Sprint 3 — High-Converting Sales Process', Source: 'Sagan Live', Category: 'Sagan Live', 'Due By': 'Tue 3/24', Completed: '', 'Score / Notes': '', _row: 21 },
  { Module: 'Sales Skill Sprint 4 — Follow-Up & Closing Systems', Source: 'Sagan Live', Category: 'Sagan Live', 'Due By': 'Tue 3/31', Completed: '', 'Score / Notes': 'Final session', _row: 22 },

  // Event Library
  { Module: 'Objection Handling', Source: 'Sagan Event Library', Category: 'Event Library', 'Due By': 'Day 3', Completed: '', 'Score / Notes': '', _row: 25 },
  { Module: 'Getting Organized', Source: 'Sagan Event Library', Category: 'Event Library', 'Due By': 'Day 5', Completed: '', 'Score / Notes': '', _row: 26 },
  { Module: 'Building Scalable Cold Calling Systems', Source: 'Sagan Event Library', Category: 'Event Library', 'Due By': 'Week 2', Completed: '', 'Score / Notes': '', _row: 27 },
  { Module: 'Cold Calling Data & KPIs', Source: 'Sagan Event Library', Category: 'Event Library', 'Due By': 'Week 2', Completed: '', 'Score / Notes': '', _row: 28 },
  { Module: 'Cross-Cultural Communication', Source: 'Sagan Event Library', Category: 'Event Library', 'Due By': 'Week 2', Completed: '', 'Score / Notes': '', _row: 29 },
  { Module: 'Leveraging AI for Sales Growth', Source: 'Sagan Event Library', Category: 'Event Library', 'Due By': 'Week 3', Completed: '', 'Score / Notes': '', _row: 30 },
  { Module: 'How to Generate Leads with Cold Emails', Source: 'Sagan Event Library', Category: 'Event Library', 'Due By': 'Week 3', Completed: '', 'Score / Notes': '', _row: 31 },
  { Module: '3 Ways to Stop Losing Leads', Source: 'Sagan Event Library', Category: 'Event Library', 'Due By': 'Week 3', Completed: '', 'Score / Notes': '', _row: 32 },

  // Playbook
  { Module: 'Script 1: Fire Lead — Homeowner Call', Source: '1-800-Packouts Playbook', Category: 'Playbook', 'Due By': 'Day 1', Completed: '', 'Score / Notes': '', _row: 35 },
  { Module: 'Script 2: Cold Outreach — GC/Restoration', Source: '1-800-Packouts Playbook', Category: 'Playbook', 'Due By': 'Day 1', Completed: '', 'Score / Notes': '', _row: 36 },
  { Module: 'Script 3: Cold Outreach — Adjuster', Source: '1-800-Packouts Playbook', Category: 'Playbook', 'Due By': 'Day 1', Completed: '', 'Score / Notes': '', _row: 37 },
  { Module: 'Script 4: Cold Outreach — Property Manager', Source: '1-800-Packouts Playbook', Category: 'Playbook', 'Due By': 'Day 1', Completed: '', 'Score / Notes': '', _row: 38 },
  { Module: 'Script 5: Follow-Up Call', Source: '1-800-Packouts Playbook', Category: 'Playbook', 'Due By': 'Day 1', Completed: '', 'Score / Notes': '', _row: 39 },

  // Role-Plays
  { Module: 'Role-Play: Script 1 — Fire Lead', Source: 'Matt / Internal', Category: 'Role-Play', 'Due By': 'Week 2', Completed: '', 'Score / Notes': 'Matt certifies', _row: 42 },
  { Module: 'Role-Play: Script 2 — GC/Restoration', Source: 'Matt / Internal', Category: 'Role-Play', 'Due By': 'Week 2', Completed: '', 'Score / Notes': 'Matt certifies', _row: 43 },
  { Module: 'Role-Play: Script 3 — Adjuster', Source: 'Matt / Internal', Category: 'Role-Play', 'Due By': 'Week 2', Completed: '', 'Score / Notes': 'Matt certifies', _row: 44 },
  { Module: 'Role-Play: Script 4 — Property Manager', Source: 'Matt / Internal', Category: 'Role-Play', 'Due By': 'Week 2', Completed: '', 'Score / Notes': 'Matt certifies', _row: 45 },
  { Module: 'Role-Play: Script 5 — Follow-Up', Source: 'Matt / Internal', Category: 'Role-Play', 'Due By': 'Week 2', Completed: '', 'Score / Notes': 'Matt certifies', _row: 46 },
];

export const mockQuickRef: QuickRefEntry[] = [
  { _section: 'Company Info', key: 'Company Name', value: '1-800-Packouts of the East Valley' },
  { _section: 'Company Info', key: 'Owner', value: 'Matt Roumain' },
  { _section: 'Company Info', key: 'Sales Phone', value: '(623) 300-2119' },
  { _section: 'Company Info', key: 'Fire Website', value: 'azfirehelp.com' },
  { _section: 'Company Info', key: 'What We Do', value: 'Contents packout, cleaning, storage, and pack-back for insurance restoration jobs' },

  { _section: 'Key SLAs', key: 'Fire Lead Response', value: 'Next morning by NOON — even for overnight fires. Priority 1.' },
  { _section: 'Key SLAs', key: 'Daily Summary', value: 'Send to Matt via Google Chat by 4:00 PM AZ time' },
  { _section: 'Key SLAs', key: 'HubSpot Logging', value: 'Every call gets a note — no exceptions' },

  { _section: 'Escalation Triggers', key: 'Active interest', value: 'Contact says they want to use us or are ready to talk' },
  { _section: 'Escalation Triggers', key: 'Pricing questions', value: 'ANY question about rates, pricing, or referral arrangements' },
  { _section: 'Escalation Triggers', key: 'Adjuster willing to talk', value: 'Named adjuster open to vendor approval conversation' },
  { _section: 'Escalation Triggers', key: 'Ready to schedule', value: 'Fire lead homeowner wants to schedule a packout' },
  { _section: 'Escalation Triggers', key: 'Competitor problems', value: 'Contact mentions issues with their current vendor' },
  { _section: 'Escalation Triggers', key: 'Real deal', value: "Not 'maybe someday' — 'we have a job next week'" },

  { _section: 'Never Do', key: 'Never discuss pricing', value: "'Our owner Matt handles all pricing conversations'" },
  { _section: 'Never Do', key: 'Never offer referral fees/gifts', value: 'Zero tolerance — escalate to Matt' },
  { _section: 'Never Do', key: 'Never promise timelines', value: "'Our ops team will coordinate scheduling'" },
  { _section: 'Never Do', key: 'Never make commitments', value: "'Let me have Matt confirm that'" },
  { _section: 'Never Do', key: 'Never argue or push', value: 'If they say no, log it and move on' },
  { _section: 'Never Do', key: 'Never go off-script', value: 'Scripts are guardrails. Stay inside them.' },

  { _section: 'Key Competitors', key: 'Better Box', value: 'Contents packout competitor in the Valley' },
  { _section: 'Key Competitors', key: 'Cardinal', value: 'Contents/restoration competitor' },

  { _section: 'Contacts', key: 'Ashlynn', value: 'Marketing — Corporate Packouts' },
  { _section: 'Contacts', key: 'Cedric', value: 'Business coaching — Corporate Packouts' },
  { _section: 'Contacts', key: 'Justin', value: 'Wylander Program — sales training/coaching' },
];
