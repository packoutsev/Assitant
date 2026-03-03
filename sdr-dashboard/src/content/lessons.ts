// Self-contained industry education modules
// Each lesson is everything Vanessa needs — no external docs required

export interface LessonMedia {
  type: 'audio' | 'video' | 'slides';
  label: string;
  url: string;
}

export interface Lesson {
  id: string;
  title: string;
  category: string;
  estimatedMinutes: number;
  media?: LessonMedia[];
  sections: LessonSection[];
}

export interface LessonSection {
  heading: string;
  content: string; // supports markdown-like formatting with **bold** and line breaks
}

export const lessons: Lesson[] = [
  {
    id: 'what-is-packout',
    title: 'What Is Contents Packout?',
    category: 'Industry Education',
    estimatedMinutes: 8,
    media: [
      { type: 'slides', label: 'Open Slides', url: 'https://docs.google.com/presentation/d/1zAXCP9DKLWQW2lDQccfhvE0a2-zSRxwh/edit' },
      { type: 'audio', label: 'Listen to Podcast', url: '/audio/01-what-is-packout.mp3' },
    ],
    sections: [
      {
        heading: 'The Big Picture',
        content: `When a home has a fire, flood, or water damage, two things need to happen:

**1. The structure** (walls, floors, roof) needs to be repaired or rebuilt. This is "restoration" or "mitigation" — handled by general contractors and restoration companies.

**2. The contents** (furniture, clothes, electronics, family photos, kitchenware — everything inside) need to be protected. This is where **1-800-Packouts** comes in.

We don't fix houses. We protect everything inside them.`
      },
      {
        heading: 'The 4-Phase Process',
        content: `Every job follows the same cycle:

**Phase 1 — Packout**
Our crew goes to the home and carefully packs up all salvageable belongings. This is not "throwing stuff in boxes." We inventory every item, photograph it, and use specialized packing materials. Think: moving company meets insurance documentation.

**Phase 2 — Cleaning**
Smoke-damaged clothes, soot-covered electronics, water-soaked furniture — we clean what can be cleaned using specialized processes. Ultrasonic cleaning, ozone treatment, dry cleaning, hand cleaning. Not everything is salvageable, but a lot more is than homeowners expect.

**Phase 3 — Storage**
While the home is being rebuilt (which can take 3-12 months), all contents are stored in our climate-controlled facility. We store by job — the homeowner's belongings stay together, labeled, and accessible.

**Phase 4 — Pack-Back**
Once the home is repaired, we bring everything back and put it where it belongs. Furniture placed, boxes unpacked, pictures hung. The homeowner walks into a home that looks like it did before the loss (or better).`
      },
      {
        heading: 'Why This Matters to Homeowners',
        content: `People who just had a fire are in crisis. They're displaced, stressed, dealing with insurance, and terrified about losing their stuff — family photos, heirlooms, kids' things. Many don't even know that contents packout is a thing, or that insurance covers it.

When you call a fire lead, you're not selling — you're offering help that most people desperately need but don't know exists. That's why empathy is first in every call.`
      },
      {
        heading: 'Why This Matters Financially',
        content: `Every packout job is paid for by the homeowner's insurance company. The homeowner has zero out-of-pocket cost. That's one of the most powerful things you can say on a call.

The main components of every job are:

• **Packing labor** — Our crews carefully pack and inventory every item
• **Storage** — Monthly fees while the home is being rebuilt
• **Cleaning** — Specialized processes for smoke, soot, and water damage
• **Pack-back** — Returning everything to the home after repairs

You will never discuss pricing with anyone — that's Matt's role. But knowing that insurance covers everything lets you confidently tell homeowners: "There's no cost to you."`
      },
      {
        heading: 'Key Vocabulary',
        content: `You'll hear these terms constantly:

• **Contents** — Everything inside the home (as opposed to "structure" which is the building itself)
• **Packout** — The process of packing and removing contents
• **Pack-back** — Returning contents to the home after repairs
• **Salvageable** — Can be cleaned and restored to pre-loss condition
• **Non-salvageable** — Too damaged to save; will be on the insurance claim as a loss
• **Inventory** — The documented list of every item packed (photos, descriptions, condition)
• **Job / Claim** — Used interchangeably. Each customer situation is a "job" for us and a "claim" for insurance.`
      }
    ]
  },
  {
    id: 'insurance-lifecycle',
    title: 'The Insurance Claim Lifecycle',
    category: 'Industry Education',
    estimatedMinutes: 10,
    media: [
      { type: 'slides', label: 'Open Slides', url: 'https://docs.google.com/presentation/d/16B3k0sfIGpXUzBWxNAhf0gZvDEUGIqmq/edit' },
      { type: 'audio', label: 'Listen to Podcast', url: '/audio/02-insurance-lifecycle.mp3' },
    ],
    sections: [
      {
        heading: 'Why You Need to Know This',
        content: `Every conversation you have — with homeowners, adjusters, GCs, or property managers — revolves around the insurance claim process. If you don't understand the flow, you can't ask the right discovery questions and you won't know where in the process a lead is.

Here's how it works, step by step:`
      },
      {
        heading: 'Step 1: The Loss',
        content: `Something bad happens to a home:
• **Structure fire** — our primary lead source (fireleads.com)
• **Water damage** — burst pipe, supply line failure, water heater failure, sometimes a flooded basement
• **Smoke damage** — can happen even without visible fire
• **Storm damage** — less common in Arizona, but it happens

This is the event that starts everything. For fire leads, we often know about it within hours.`
      },
      {
        heading: 'Step 2: Claim Filed',
        content: `The homeowner calls their insurance company to report the loss. This creates a **claim number**. The homeowner might not have done this yet when you call — that's okay. One of your discovery questions is "Has your insurance company been in touch yet?"

Common insurance carriers you'll hear:
• State Farm, Allstate, USAA, Travelers, Liberty Mutual, Farmers, American Family
• In Arizona specifically: Arizona auto clubs, regional carriers

Knowing the carrier matters because some are easier to work with than others, and some have preferred vendor lists.`
      },
      {
        heading: 'Step 3: Adjuster Assigned',
        content: `The insurance company assigns an **adjuster** to the claim. This is the person who:
• Inspects the damage
• Determines what's covered
• Approves vendors (like us)
• Writes the **scope of work** (what needs to be done)

Adjusters are **gatekeepers**. If the adjuster knows and trusts 1-800-Packouts, they'll recommend us to the homeowner. That's why Script 3 (Adjuster Outreach) exists — building these relationships is a long game but extremely valuable.

The adjuster might be:
• A **staff adjuster** (employee of the carrier)
• An **independent adjuster** (contractor, handles claims for multiple carriers)
• A **public adjuster** (hired by the homeowner, not the carrier — less common)`
      },
      {
        heading: 'Step 4: Scope Written',
        content: `The adjuster writes a scope of work using **Xactimate** — the industry-standard estimating software. This document lists every line item that insurance will pay for: packing labor hours, number of boxes, storage months, cleaning processes, transportation, etc.

Each line item has a **CPS code** (like a product code) and a **unit price** set by Xactimate's pricing database, which is updated monthly based on local market rates.

Key terms you'll encounter:
• **RCV (Replacement Cost Value)** — What it would cost to replace an item brand new. This is the big number.
• **ACV (Actual Cash Value)** — RCV minus depreciation. This is what insurance initially pays.
• **Depreciation** — The reduction in value because an item is old/used. Insurance holds this back initially, then releases it when the work is done.
• **Supplement** — An additional scope request when the original estimate didn't cover everything (very common — almost every job gets supplemented)

You will never write a scope. You will never discuss pricing. But understanding this process lets you speak intelligently with adjusters and GCs.`
      },
      {
        heading: 'Step 5: Vendor Selected',
        content: `The homeowner (or their contractor/adjuster) chooses a packout vendor. This is where we come in. How we get chosen:

• **Direct from homeowner** — They got our call from a fire lead, liked us, and told their adjuster they want 1-800-Packouts
• **Referral from GC/restoration company** — A general contractor we have a relationship with subs the packout to us
• **Referral from adjuster** — The adjuster recommends us because we're on their preferred vendor list
• **Referral from property manager** — PM has a water loss at a rental unit and calls their go-to packout company

Your job is to open ALL of these channels. That's why you have 4 different call scripts for 4 different lead types.`
      },
      {
        heading: 'Step 6: Work Authorization',
        content: `Before we can start, we need a **work authorization** — a signed agreement that gives us permission to enter the home, pack contents, and store them. Insurance has approved the scope. Matt handles all work authorizations.

**Your role stops at getting the lead to this point.** You discover, qualify, and escalate. Matt closes.`
      },
      {
        heading: 'The Timeline',
        content: `From loss to pack-back, a typical job takes:
• **Loss to first call from us**: Hours (fire leads) to days (cold outreach)
• **Claim filed to adjuster assigned**: 1-5 days
• **Adjuster visit to scope written**: 1-2 weeks
• **Scope to work authorization**: Days to weeks (depends on homeowner decisions)
• **Packout**: 1-3 days for a typical home
• **Storage**: 3-12 months (sometimes longer)
• **Pack-back**: 1-2 days

The whole cycle can take 6-18 months. That's why follow-up cadence matters — a lead you talk to today might not need us for weeks, but you need to stay top of mind.`
      }
    ]
  },
  {
    id: 'key-terms',
    title: 'Industry Glossary',
    category: 'Industry Education',
    estimatedMinutes: 5,
    media: [
      { type: 'slides', label: 'Open Slides', url: 'https://docs.google.com/presentation/d/1mAFi1pJXoXIKJkpKbDyAg2cNIFSIOGAP/edit' },
      { type: 'audio', label: 'Listen to Podcast', url: '/audio/03-industry-glossary.mp3' },
    ],
    sections: [
      {
        heading: 'Terms You\'ll Use Every Day',
        content: `**Contents** — Everything inside a home (furniture, clothes, electronics, personal items). Opposite of "structure."

**Structure** — The building itself (walls, floors, roof, framing). We don't do structure work.

**Packout** — Packing and removing contents from a damaged home.

**Pack-back** — Returning contents to the home after repairs are complete.

**Mitigation** — Emergency response to stop damage from getting worse (water extraction, board-up, tarping). Done by restoration companies, not us.

**Restoration** — Repairing the structure back to pre-loss condition. Done by GCs/restoration companies.

**Loss** — The event that caused damage (fire, water, storm). "The loss occurred on January 15th."

**Claim** — The insurance case. Each loss = one claim with a unique claim number.

**Scope (of work)** — The detailed list of what needs to be done and what insurance will pay for.`
      },
      {
        heading: 'Insurance & Estimating Terms',
        content: `**Xactimate** — Industry-standard estimating software. Every estimate in our world is written in Xactimate.

**RCV (Replacement Cost Value)** — Full cost to replace an item new. The "retail price."

**ACV (Actual Cash Value)** — RCV minus depreciation. What insurance pays upfront.

**Depreciation** — Reduction in value for age/wear. Insurance withholds this initially, releases it when work is completed.

**Supplement** — Additional scope submitted after the original estimate, when more work is needed. Very common.

**Line item** — One row in a Xactimate estimate (e.g., "Pack medium box — qty 45").

**CPS code** — The Xactimate category/product/subcategory code for a line item.

**O&P (Overhead & Profit)** — 10% overhead + 10% profit that contractors add on top of Xactimate pricing. Standard in the industry.`
      },
      {
        heading: 'People & Roles',
        content: `**Adjuster** — Insurance company employee or contractor who inspects damage and approves the scope. Gatekeeper for vendor selection.

**Staff adjuster** — Full-time employee of one carrier.

**Independent adjuster (IA)** — Contractor who handles claims for multiple carriers.

**Public adjuster (PA)** — Hired by the homeowner (not the carrier) to negotiate a better settlement. Less common.

**GC (General Contractor)** — Oversees the rebuild. Often subcontracts packout to companies like us.

**Restoration company** — Specializes in fire/water damage repair. Sometimes does their own packout, sometimes subs to us.

**Property manager (PM)** — Manages rental or commercial properties. Calls us when a unit has a loss.

**TPA (Third-Party Administrator)** — Companies that manage claims on behalf of carriers. They may have their own vendor lists.`
      },
      {
        heading: 'Our Specific Terms',
        content: `**Fire lead** — A homeowner who just had a structure fire. Our highest priority lead type. Source: fireleads.com.

**azfirehelp.com** — Our homeowner-facing resource website. You text this link to every fire lead after the first call.

**Sales line** — (623) 300-2119. This is the number you call from and the number on all our marketing.

**Daily summary** — The end-of-day report you send Matt via Google Chat. Template is in the Playbook section of this app.

**Escalation** — When a lead is hot enough for Matt to take over. You escalate via Chat or call, immediately.`
      }
    ]
  },
  {
    id: 'customer-types',
    title: 'Who You\'re Calling & Why',
    category: 'Industry Education',
    estimatedMinutes: 7,
    media: [
      { type: 'slides', label: 'Open Slides', url: 'https://docs.google.com/presentation/d/1ZJ1gMWa_JW1VUI8le8C649KNQy2VaTyf/edit' },
      { type: 'audio', label: 'Listen to Podcast', url: '/audio/04-customer-types.mp3' },
    ],
    sections: [
      {
        heading: 'The 4 Customer Types',
        content: `You have 4 call scripts because you're calling 4 very different types of people. Each needs a different approach, tone, and set of discovery questions. Understanding WHO you're talking to is as important as what you say.`
      },
      {
        heading: '1. Homeowners (Fire/Water Leads) — Priority 1',
        content: `**Who they are:** Regular people who just had a disaster. Their house caught fire, a pipe burst, or a water heater failed. They're stressed, scared, probably displaced, and overwhelmed with insurance paperwork.

**Why they matter:** This is our direct-to-consumer channel. When a homeowner chooses us, the adjuster almost always approves it. Homeowner choice is powerful.

**Your tone:** Empathetic, calm, helpful. You are NOT selling. You are a concerned professional offering a lifeline. "I heard about the fire at your home and wanted to see how you're doing."

**What you need from them:**
• Are they safe?
• Insurance carrier name
• Adjuster name (if assigned)
• Has anyone else contacted them about packout?
• Best callback number and time

**Key insight:** Many homeowners don't know packout exists. They think their stuff is just... gone. When you explain that we pack, clean, store, and return their belongings — and insurance covers it — it's genuinely life-changing news for them.

**Script:** Script 1 (Fire Lead — Homeowner Call)`
      },
      {
        heading: '2. GCs & Restoration Companies — Priority 3',
        content: `**Who they are:** Businesses that do fire/water restoration work. They get the job first (mitigation + rebuild) and need someone to handle the contents. Some do packout in-house; many subcontract it.

**Why they matter:** One good GC relationship = a steady stream of jobs. They do multiple restoration projects per month. If they sub all their packout to us, that's recurring revenue without needing to find individual homeowners.

**Your tone:** Business-to-business, professional, peer-level. You're one vendor talking to another. No hard sell — just exploring if there's a fit.

**What you need from them:**
• Do they handle packout in-house or sub it out?
• Who's their current packout vendor?
• How long have they been with them? Contract or job-by-job?
• Volume — how many packout jobs per month?
• Who's the decision maker for packout referrals?
• Any overflow or backup needs?

**Key insight:** Even if they're happy with their current vendor, most GCs want a backup. "Would it make sense to have us in your back pocket?" is a powerful low-pressure close.

**Script:** Script 2 (Cold Outreach — GC/Restoration)`
      },
      {
        heading: '3. Insurance Adjusters — Priority 4',
        content: `**Who they are:** The people at insurance companies who inspect damage, write scopes, and approve vendors. They handle dozens of claims per month.

**Why they matter:** An adjuster who trusts us will recommend us to every homeowner on every claim they handle. One adjuster relationship can generate 5-10 jobs per year.

**Your tone:** Professional, respectful of their time, knowledgeable. They deal with vendors all day. You need to sound like you know the industry (which is why you're learning all of this).

**What you need from them:**
• What carrier are they with?
• Do they handle property claims (fire, water)?
• How does their vendor referral process work?
• Do they have a preferred vendor list?
• Who manages the vendor list?
• How many contents claims per month?

**Key insight:** This is the LONGEST sales cycle. Adjusters don't switch vendors quickly. But getting on a preferred vendor list is a goldmine. Matt handles all adjuster relationship closings — your job is to get the intro.

**Script:** Script 3 (Cold Outreach — Adjuster)`
      },
      {
        heading: '4. Property Managers — Priority 5',
        content: `**Who they are:** Companies that manage apartment complexes, HOAs, commercial properties, or rental homes. When a unit has a fire or water loss, they need emergency packout.

**Why they matter:** They manage hundreds or thousands of units. Even if losses are infrequent, when they happen, the PM needs someone reliable RIGHT NOW. Being their go-to is a low-frequency, high-reliability play.

**Your tone:** Solution-oriented, preparedness-focused. "Do you have a vendor in place for when this happens?" Most don't.

**What you need from them:**
• Portfolio size (how many units?)
• Recent fire/water losses?
• Current packout vendor (if any)
• Who makes the vendor decision — them or insurance?
• Interest in having us on file for emergencies

**Key insight:** Many PMs have never thought about packout until they need it. You're not competing with another vendor — you're filling a gap they didn't know existed.

**Script:** Script 4 (Cold Outreach — Property Manager)`
      }
    ]
  },
  {
    id: 'competitive-landscape',
    title: 'The Competitive Landscape',
    category: 'Industry Education',
    estimatedMinutes: 5,
    media: [
      { type: 'slides', label: 'Open Slides', url: 'https://docs.google.com/presentation/d/1W_2QUQI--Sa58dEI7IQH4HlZgWQxP6v9/edit' },
      { type: 'audio', label: 'Listen to Podcast', url: '/audio/05-competitive-landscape.mp3' },
    ],
    sections: [
      {
        heading: 'Who Else Does This in the Valley',
        content: `The Phoenix metro area has a handful of companies that do contents packout. You'll hear their names on calls. Here's what to know:`
      },
      {
        heading: 'Better Box',
        content: `Contents packout company operating in the Valley. You'll hear their name from GCs and adjusters. They are our most direct competitor for the same type of work.

**When you hear their name on a call:**
• Log it: "Current vendor: Better Box"
• Don't trash-talk them: "They're a good company. We just like to make sure you have options."
• Ask: "How long have you been with them? Contract or job-by-job?"
• Plant the seed: "A lot of companies keep a backup vendor. Would it make sense for Matt to introduce himself?"`
      },
      {
        heading: 'Cardinal',
        content: `Contents and restoration competitor in the Valley. Sometimes handles both structure and contents, which can be an advantage (one vendor for everything) or a disadvantage (less specialized).

**When you hear their name:**
• Same approach — log it, don't trash-talk, explore overflow/backup opportunities.`
      },
      {
        heading: 'How 1-800-Packouts Differentiates',
        content: `When someone asks "why should I use you guys?" — don't answer that directly (escalate pricing/partnership questions to Matt). But here's what makes us different, so you understand the value:

• **Contents-only focus** — We don't do structure work. Contents is ALL we do. That means more specialized crews, better processes, and more attention to belongings.
• **Insurance-approved** — We work directly with insurance companies. No out-of-pocket cost for homeowners.
• **Documentation** — We use Encircle for detailed photo documentation of every item. This helps with the insurance claim.
• **Local, owner-operated** — Matt Roumain owns and operates the business. When Matt says he'll handle something, he means it personally. GCs and adjusters work with Matt directly, not a call center.
• **Capacity** — We're actively building capacity to handle overflow work, which matters to GCs who sometimes can't get their primary vendor fast enough.`
      },
      {
        heading: 'What NOT to Do',
        content: `• **Never trash-talk a competitor.** Ever. The restoration world is small and people talk.
• **Never compare pricing.** You don't know our pricing and you don't know theirs. Escalate to Matt.
• **Never promise we're "better."** Just position us as an option, a backup, or an alternative.
• **If they're happy with their vendor:** Log it, move on. "No problem at all. If anything changes, we're here."`
      }
    ]
  },
  {
    id: 'fire-leads',
    title: 'The Fire Leads Program',
    category: 'Industry Education',
    estimatedMinutes: 8,
    media: [
      { type: 'slides', label: 'Open Slides', url: 'https://docs.google.com/presentation/d/1UzVTXc6q13RzeZWtY15ubrJqWe695Qx0/edit' },
      { type: 'audio', label: 'Listen to Podcast', url: '/audio/06-fire-leads-program.mp3' },
    ],
    sections: [
      {
        heading: 'What Is fireleads.com?',
        content: `fireleads.com is a service that monitors fire department dispatch data in Maricopa and Pima counties (the Phoenix and Tucson metro areas). When a structure fire is reported, the service sends us a real-time alert with:

• **Address** of the fire
• **Owner name** and phone number (from public records)
• **Incident details** (date, time, type of fire)
• **Property information** (home value, square footage when available)

These alerts arrive via **Gmail** (Fire Leads label) and **Google Chat** (fire leads space). You'll check both every morning.`
      },
      {
        heading: 'Why Fire Leads Are Priority 1',
        content: `Fire leads are the highest-value, most time-sensitive leads we have because:

**1. Speed wins.** The first packout company to reach a homeowner after a fire usually gets the job. Most homeowners don't know what packout is — the first person to explain it and offer help wins their trust.

**2. Direct-to-homeowner.** No gatekeeper. No vendor list. No RFP. The homeowner chooses who packs their stuff, and insurance almost always approves.

**3. High emotional state.** These people are in crisis. A calm, empathetic call from someone who can actually help stands out against the chaos.

**4. No competition (if we're fast).** Better Box and Cardinal don't have the same fire lead monitoring. If we call first, we're often the only packout company the homeowner has heard from.`
      },
      {
        heading: 'The Fire Lead Workflow',
        content: `Here is the exact flow, step by step:

**1. Alert arrives** (Gmail + Google Chat)
↓
**2. You call the next morning by noon**
Even if the fire was at 2 AM, you call the next morning. You start work at 8 AM your time — fire leads are first thing you check.
↓
**3. If they answer:** Follow Script 1 (Fire Lead — Homeowner Call)
• Lead with empathy: "Are you and your family safe?"
• Explain what we do: pack, clean, store, return — covered by insurance
• Get: insurance carrier, adjuster name, competitor check, best callback
↓
**4. If voicemail:** Leave the VM script (under 30 seconds)
↓
**5. After the call (live or VM):** Send the text message template
This ALWAYS includes the azfirehelp.com link. Every time, no exceptions.
↓
**6. Log in HubSpot:** Create a note using the full template
Call Type: Fire Lead | Outcome | Contact | Intel | Next Steps
↓
**7. If HOT (ready to schedule, has insurance, no competitor):**
**Escalate to Matt IMMEDIATELY** via Chat or call
↓
**8. Follow up:** 2 days later if no response. Max 3 attempts over 7 days.`
      },
      {
        heading: 'azfirehelp.com',
        content: `azfirehelp.com is our homeowner-facing resource website. It's designed for people who just had a fire and need help understanding what to do next.

**The site includes:**
• Fire damage insurance claim guide
• Fire recovery checklist and timeline
• "Who does what after a fire" explainer
• Free recovery tools

**When to send it:**
After EVERY first call or voicemail to a fire lead, send this text:

"Hi [NAME], this is [YOUR NAME] from 1-800-Packouts. I just tried calling about the fire at your home. We help families protect and store their belongings during repairs — fully covered by insurance. Feel free to call or text us anytime. Here's some info: azfirehelp.com"

This gives the homeowner something tangible to look at, builds credibility, and keeps us top of mind.`
      },
      {
        heading: 'Common Fire Lead Scenarios',
        content: `**"How did you get my number?"**
"We work closely with local fire departments and monitor fire incidents in the area so we can offer help to families who need it. We're an insurance-approved vendor — we don't charge you anything directly."

**They already have a packout company:**
"No problem at all. Who are you working with? Great. If anything changes or you need a second opinion, we're always available." Log the competitor name. Don't push.

**They haven't filed a claim yet:**
"That's totally okay. The first step is usually calling your insurance company to file a claim. Once you have an adjuster assigned, that's when the packout conversation usually happens. I'll follow up in a few days to see where things stand."

**They're emotional/upset:**
Let them talk. Don't rush. "I'm so sorry you're going through this." Your job is to be the calm, helpful voice in their chaos. The sale takes care of itself when they trust you.`
      }
    ]
  },
  {
    id: 'hubspot-logging',
    title: 'HubSpot Logging: The Complete Guide',
    category: 'Playbook',
    estimatedMinutes: 5,
    media: [
      { type: 'slides', label: 'Open Slides', url: 'https://docs.google.com/presentation/d/16M7luIoQkt0BcGi-Y9HJfJEk5DcG9MP5/edit' },
      { type: 'audio', label: 'Listen to Podcast', url: '/audio/07-hubspot-logging.mp3' },
    ],
    sections: [
      {
        heading: 'Why Every Call Gets a Note',
        content: `HubSpot is our memory. Matt uses your notes to:
• Decide which leads to follow up on personally
• Prepare for partnership conversations
• Track pipeline and activity
• Spot-check quality

If a call doesn't have a note, it didn't happen. No exceptions.`
      },
      {
        heading: 'The Note Template',
        content: `Copy this template for every call:

---
**Call Type**: [Fire Lead / Cold - GC / Cold - Adjuster / Cold - PM / Follow-Up]
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
- [Specific action + date, e.g., "Follow up Wednesday 3/19" or "Escalate to Matt — warm lead"]
---

Fill in what you learned. If a field doesn't apply (e.g., "Insurance carrier" on a GC call), skip it. But the structure stays the same.`
      },
      {
        heading: 'Contact Property Updates',
        content: `After logging the note, also update the contact record:

• **Lead Status**: Update after every interaction
  - New → Attempted to Contact → Connected → Qualified → etc.
• **Phone**: If they gave you a better number, update it
• **Company**: Associate the contact with a company record if applicable
• **Notes field on the contact**: Keep this for quick summary info, not call logs`
      },
      {
        heading: 'Common Mistakes',
        content: `• **Logging hours later** — Log immediately after the call while it's fresh. Even quick notes > no notes.
• **Vague next steps** — "Follow up later" is useless. "Follow up Thursday 3/20, ask about adjuster assignment" is useful.
• **Missing intel fields** — Even "unknown" is valuable information. It tells Matt what to dig into.
• **Not logging voicemails** — VMs get logged too. "Left VM, follow up in 2 days."
• **Editing someone else's notes** — Never. Only add your own.`
      }
    ]
  }
];
