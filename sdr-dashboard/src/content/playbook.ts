// All 5 call scripts + rules embedded directly in the dashboard
// Source: sdr-playbook.md — reformatted for in-app display

export interface Script {
  id: string;
  title: string;
  context: string;
  mindset: string;
  sections: ScriptSection[];
}

export interface ScriptSection {
  label: string;
  type: 'dialogue' | 'instruction' | 'list';
  content: string;
}

export const scripts: Script[] = [
  {
    id: 'script-1',
    title: 'Script 1: Fire Lead — Homeowner Call',
    context: 'Homeowner just had a structure fire (or water loss). They\'re stressed, confused, possibly displaced. fireleads.com alert came in with address, owner name, phone, incident details.',
    mindset: 'You are NOT selling. You are a concerned professional offering help. Empathy first.',
    sections: [
      { label: 'Opening', type: 'dialogue', content: '"Hi, is this [OWNER NAME]? My name is [YOUR NAME], I\'m calling from 1-800-Packouts. We work with insurance companies and fire departments here in the Valley. I heard about the fire at your home on [STREET NAME] and I just wanted to reach out and see how you\'re doing."' },
      { label: 'If they ask "how did you get my number"', type: 'dialogue', content: '"We work closely with local fire departments and monitor fire incidents in the area so we can offer help to families who need it. We\'re an insurance-approved vendor — we don\'t charge you anything directly."' },
      { label: 'Coaching note', type: 'instruction', content: 'Practice the tone on this one. "Monitor fire incidents" can sound surveillance-y to a stressed homeowner. Deliver it warmly — the words matter less than how you say them. This will be covered in role-play certification.' },
      { label: 'Discovery Questions', type: 'list', content: '1. "Are you and your family safe? Is everyone okay?" (Always ask first)\n2. "Have you been able to get back into the home at all, or are you displaced right now?"\n3. "Has your insurance company been in touch yet?"\n4. "Do you know who your insurance carrier is?" → Log: carrier name\n5. "Have they assigned you an adjuster yet? Do you have their name?" → Log: adjuster name + phone\n6. "Has anyone else reached out to you about protecting your belongings — like a restoration company or a packout company?" → Log: competitor name\n7. "Do you have a general contractor or restoration company handling the rebuild?" → Log: GC name' },
      { label: 'Close', type: 'dialogue', content: '"I really appreciate you talking to me. What we do is we come in and carefully pack up all your belongings — clothes, furniture, electronics, family photos, everything salvageable — and we store it safely while your home is being repaired. Your insurance covers it, so there\'s no out-of-pocket cost to you. I\'m going to have our operations team reach out to you — is this the best number? And is there a good time for them to call?"' },
      { label: 'If they already have a packout company', type: 'dialogue', content: '"No problem at all. Who are you working with? ... Great. Well if anything changes or you need a second opinion, we\'re always available. I\'ll send you a quick text with our info just in case."\n\n→ Log: competitor name, then move on. Don\'t push.' },
      { label: 'Voicemail', type: 'dialogue', content: '"Hi [OWNER NAME], this is [YOUR NAME] from 1-800-Packouts. We work with insurance companies and fire departments in the area, and I\'m calling about the fire at your home on [STREET]. We help protect and store your belongings while your home is being repaired, and it\'s covered by your insurance. If you\'d like to learn more, please call or text us back at 623-300-2119. I hope you and your family are doing well."\n\n→ Log: "Left VM" + date/time. Follow up in 2 days. Max 3 attempts.' },
      { label: 'After Every Call', type: 'instruction', content: 'Send the text message template with azfirehelp.com link. Log in HubSpot using the full note template. If HOT → escalate to Matt immediately.' },
    ]
  },
  {
    id: 'script-2',
    title: 'Script 2: Cold Outreach — GC / Restoration Company',
    context: 'Calling a general contractor or restoration company to explore whether they need a packout vendor. These companies get the job first and then subcontract the contents packout.',
    mindset: 'Business-to-business conversation. Find out who makes the packout decision, who they currently use, and whether there\'s an opening.',
    sections: [
      { label: 'Gatekeeper', type: 'dialogue', content: '"Hi, I\'m calling from 1-800-Packouts. We handle contents packout and storage for insurance restoration jobs. Could I speak with whoever manages your packout referrals or subcontractor relationships?"\n\nIf asked to leave a message: Get the decision-maker\'s name and direct line. Log it.' },
      { label: 'Decision Maker — Opening', type: 'dialogue', content: '"Hi [NAME], this is [YOUR NAME] with 1-800-Packouts. We\'re a contents packout, cleaning, and storage company here in the Valley. I\'m just reaching out to see how you guys currently handle packouts on your restoration jobs."' },
      { label: 'Discovery Questions', type: 'list', content: '1. "Do you handle packouts in-house or do you sub that out?" → Log: in-house vs sub\n2. "Who are you currently using for packouts?" → Log: competitor name\n3. "How long have you been with them?" → Log: relationship length\n4. "Are you on a contract with them, or is it job-by-job?" → Log: contract status\n5. "About how many packout jobs do you guys do per month?" → Log: volume\n6. "Do you ever need overflow or backup coverage?" → Log: yes/no\n7. "Who would I talk to if there was ever an opportunity to work together?" → Log: decision maker info' },
      { label: 'If happy with current vendor', type: 'dialogue', content: '"Totally understand. A lot of companies keep a backup vendor on file for overflow or when their primary is stretched thin. Would it make sense for our owner Matt to reach out and just introduce himself, no pressure? That way you have us in your back pocket."\n\n→ Log outcome. Don\'t push further.' },
      { label: 'If they mention pricing/referral fees', type: 'instruction', content: '"I appreciate that. Pricing is definitely something our owner Matt would discuss directly — he handles all partnership conversations. Can I have him give you a call?"\n\n⚠️ NEVER discuss pricing. NEVER discuss referral fees. NEVER offer gifts/perks. Escalate to Matt.' },
      { label: 'Close', type: 'dialogue', content: '"I appreciate your time, [NAME]. I\'ll have Matt follow up with you. What\'s the best way to reach you directly?"\n\n→ Log: decision maker name, title, direct phone, email, current vendor, volume, contract status' },
    ]
  },
  {
    id: 'script-3',
    title: 'Script 3: Cold Outreach — Insurance Adjuster',
    context: 'Insurance adjusters assign vendors on claims. If you\'re on their approved list or they know you, they\'ll refer packout jobs to you. Relationship-heavy, long sales cycle.',
    mindset: 'Professional, respectful of their time. You\'re introducing 1-800-Packouts, not selling.',
    sections: [
      { label: 'Opening', type: 'dialogue', content: '"Hi [NAME], this is [YOUR NAME] with 1-800-Packouts. We\'re a licensed and insured contents packout, cleaning, and storage company in the Phoenix metro area. I\'m reaching out because we work with a lot of adjusters in the Valley and wanted to introduce ourselves."' },
      { label: 'Discovery Questions', type: 'list', content: '1. "What carrier are you with?" → Log: carrier\n2. "Do you handle property claims — fire, water, that kind of thing?" → Log: claim types\n3. "When you have a claim that needs a packout, how does that referral process work for you?" → Log: how they choose vendors\n4. "Do you have a preferred vendor list, or is it up to the adjuster?" → Log: vendor selection process\n5. "Who would we need to talk to about getting on your approved vendor list?" → Log: contact name, process\n6. "How many claims a month do you personally handle that involve contents?" → Log: volume' },
      { label: 'Close', type: 'dialogue', content: '"I really appreciate your time. Our owner Matt Roumain would love to connect with you directly — he handles all our adjuster relationships. Would it be okay if he reached out? What\'s the best number for you?"\n\n→ Log: adjuster name, carrier, claim type, volume, vendor process, contact info' },
    ]
  },
  {
    id: 'script-4',
    title: 'Script 4: Cold Outreach — Property Manager',
    context: 'Property management companies manage multi-family, commercial, or HOA properties. When a tenant has a fire or water loss, they need someone to pack out the unit.',
    mindset: 'Solution-oriented, preparedness-focused. Most PMs haven\'t thought about this until they need it.',
    sections: [
      { label: 'Opening', type: 'dialogue', content: '"Hi [NAME], this is [YOUR NAME] with 1-800-Packouts. We handle emergency contents packout and storage for property managers when there\'s a fire or water loss at one of your units. I\'m just calling to see if you have a vendor in place for that kind of situation."' },
      { label: 'Discovery Questions', type: 'list', content: '1. "How many units/properties do you manage?" → Log: portfolio size\n2. "Have you had any fire or water losses in the past year?" → Log: recent incidents\n3. "Do you have a packout company on call for those situations?" → Log: current vendor or gap\n4. "When that happens, who makes the decision on which vendor to use — you or the insurance company?" → Log: decision process\n5. "Would it be helpful to have a company like us on file for emergencies?" → Log: interest level' },
      { label: 'Close', type: 'dialogue', content: '"Great, I\'ll have our owner Matt reach out to formally introduce us. What\'s the best email and number for you?"' },
    ]
  },
  {
    id: 'script-5',
    title: 'Script 5: Follow-Up Call (Any Lead Type)',
    context: 'Re-engaging a contact from a previous conversation. Always reference the prior call.',
    mindset: 'You have context from the HubSpot note. Use it. Show them you remember.',
    sections: [
      { label: 'Opening', type: 'dialogue', content: '"Hi [NAME], this is [YOUR NAME] from 1-800-Packouts. We spoke [last week / on DATE] about [TOPIC]. I\'m just following up to see if anything has changed on your end."' },
      { label: 'Fire Lead Follow-Up', type: 'dialogue', content: '"Last time we spoke, you mentioned [your adjuster was coming out / you hadn\'t heard from insurance yet / you were considering your options]. Any updates?"' },
      { label: 'GC/Restoration Follow-Up', type: 'dialogue', content: '"Last time we connected, you mentioned you were [using Better Box / had your hands full / might need overflow help]. Just checking in to see if there\'s anything we can help with."' },
      { label: 'Close', type: 'instruction', content: 'Same pattern — escalate to Matt if there\'s real interest. Log everything. Update the HubSpot note with new intel.' },
    ]
  }
];

export const voicemailRules = [
  { type: 'Fire leads', rule: 'Leave VM on first attempt. Follow up in 2 days. Max 3 VM attempts over 7 days.' },
  { type: 'Cold outreach', rule: 'Leave VM on first attempt ONLY if you reach a named decision maker\'s direct line. If general line, hang up and try back. Max 2 VM attempts.' },
  { type: 'Follow-ups', rule: 'Always leave VM. Reference previous conversation.' },
  { type: 'All VMs', rule: 'Keep under 30 seconds. State name, company, reason, callback number (623-300-2119).' },
];

export const textRules = [
  { type: 'Fire leads', rule: 'After first call (VM or live), ALWAYS send the text template with azfirehelp.com link.' },
  { type: 'Cold outreach', rule: 'Do NOT text unless the contact specifically asked you to text them.' },
  { type: 'Universal', rule: 'Never send the same text twice to the same number.' },
];

export const escalationRules = {
  escalate: [
    'Contact expresses active interest in using 1-800-Packouts ("yeah, we could use someone")',
    'Contact asks about pricing, rates, or referral arrangements',
    'Contact is a named adjuster willing to talk vendor approval',
    'Fire lead homeowner is ready to schedule a packout',
    'Contact mentions a competitor problem ("we\'ve been having issues")',
    'Anything that smells like a real deal — not "maybe someday" but "we have a job next week"',
  ],
  doNotEscalate: [
    '"We\'re happy with our current vendor" — log and move on',
    '"Send me some info" — send text/email template, follow up in 5 days',
    '"Call back in 6 months" — log follow-up date, put in calendar',
    'General gatekeeping — try again a different day/time',
  ],
};

export const neverDoList = [
  { rule: 'Never discuss pricing', response: '"Our owner Matt handles all pricing conversations"' },
  { rule: 'Never offer referral fees, gifts, or anything of value', response: 'Zero tolerance. Escalate to Matt.' },
  { rule: 'Never promise timelines', response: '"Our ops team will coordinate scheduling"' },
  { rule: 'Never make commitments', response: '"Let me have Matt confirm that"' },
  { rule: 'Never argue or push back', response: 'If someone says no, log it and move on.' },
  { rule: 'Never go off-script', response: 'The scripts are guardrails. Stay inside them.' },
  { rule: 'Never send unauthorized texts', response: 'Follow text rules exactly.' },
  { rule: 'Never edit someone else\'s HubSpot notes', response: 'Only add your own notes.' },
];

export const dailySchedule = [
  { time: '8:00–8:15', block: 'Prep', activity: 'Check fire leads queue (Gmail + Google Chat). Any overnight leads are Priority 1.' },
  { time: '8:15–10:00', block: 'Fire Leads', activity: 'Call any new fire leads. Next morning by noon minimum; 30-min from alert is the goal.' },
  { time: '10:00–11:30', block: 'Cold Outreach', activity: 'Work the GC/restoration/adjuster call list. Power through.' },
  { time: '11:30–12:00', block: 'Notes', activity: 'Clean up HubSpot notes from morning calls.' },
  { time: '12:00–12:30', block: 'Break', activity: '' },
  { time: '12:30–2:00', block: 'Cold Outreach', activity: 'Continue call list.' },
  { time: '2:00–3:30', block: 'Follow-ups', activity: 'Re-engage contacts from previous days.' },
  { time: '3:30–4:00', block: 'End of Day', activity: 'Final HubSpot cleanup. Daily summary to Matt via GChat.' },
];

export const dailySummaryTemplate = `**SDR Daily Report — [DATE]**

Dials: [X]
Live conversations: [X]
Voicemails: [X]
Fire leads worked: [X]

**Hot leads (escalate to Matt)**:
- [Contact] @ [Company] — [1 sentence why]

**Key intel**:
- [Company] uses [Competitor] for packouts, [volume], [contract status]
- [Adjuster Name] at [Carrier] handles [X claims/month], open to new vendors

**Follow-ups scheduled**:
- [Contact] — [date] — [reason]`;

export const hubspotNoteTemplate = `**Call Type**: [Fire Lead / Cold - GC / Cold - Adjuster / Cold - PM / Follow-Up]
**Outcome**: [Live Conversation / Voicemail / No Answer / Wrong Number / Gatekeeper]
**Contact**: [Name, Title if known]
**Company**: [Company name if applicable]

**Intel Gathered**:
- Current packout vendor: [name or "none"]
- Volume: [X jobs/month or "unknown"]
- Contract status: [locked in / job-by-job / unknown]
- Decision maker: [name + title]
- Insurance carrier: [name if applicable]
- Adjuster: [name if applicable]
- Interest level: [cold / lukewarm / warm / hot]

**Next Steps**:
- [Specific action + date]`;

export const textMessageTemplate = `Hi [NAME], this is [YOUR NAME] from 1-800-Packouts. I just tried calling about the fire at your home. We help families protect and store their belongings during repairs — fully covered by insurance. Feel free to call or text us anytime. Here's some info: azfirehelp.com`;
