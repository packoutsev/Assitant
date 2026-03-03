// wiki-content.js - GTD Capture Help Documentation

const wikiContent = {
  // Categories for organizing articles
  categories: [
    { id: 'getting-started', name: 'Getting Started', icon: 'rocket' },
    { id: 'inbox', name: 'Inbox & Capture', icon: 'inbox' },
    { id: 'processing', name: 'Processing & Organizing', icon: 'filter' },
    { id: 'actions', name: 'Actions & Contexts', icon: 'check-circle' },
    { id: 'projects', name: 'Projects', icon: 'folder' },
    { id: 'views', name: 'Views & Navigation', icon: 'layout' },
    { id: 'review', name: 'Weekly Review', icon: 'calendar' },
    { id: 'integrations', name: 'Integrations', icon: 'link' },
    { id: 'keyboard', name: 'Keyboard Shortcuts', icon: 'keyboard' },
    { id: 'tips', name: 'Tips & Best Practices', icon: 'lightbulb' }
  ],

  // Help articles
  articles: [
    // Getting Started
    {
      id: 'what-is-gtd',
      title: 'What is GTD?',
      category: 'getting-started',
      tags: ['gtd', 'methodology', 'basics', 'overview'],
      content: `
        <h3>Getting Things Done (GTD)</h3>
        <p>GTD is a productivity methodology created by David Allen. It helps you capture, clarify, organize, and engage with your tasks effectively.</p>

        <h4>The 5 Stages of GTD</h4>
        <ol>
          <li><strong>Capture</strong> - Collect everything that has your attention into a trusted system</li>
          <li><strong>Clarify</strong> - Process what each item means and decide what to do about it</li>
          <li><strong>Organize</strong> - Put items in the right place based on what they are</li>
          <li><strong>Reflect</strong> - Review your system regularly to stay current</li>
          <li><strong>Engage</strong> - Do your work with confidence</li>
        </ol>

        <h4>Key Principles</h4>
        <ul>
          <li>Your mind is for having ideas, not holding them</li>
          <li>Every open loop needs to be captured</li>
          <li>Decide the next action for every item</li>
          <li>Regular reviews keep the system trusted</li>
        </ul>
      `
    },
    {
      id: 'quick-start',
      title: 'Quick Start Guide',
      category: 'getting-started',
      tags: ['start', 'beginner', 'tutorial', 'first steps'],
      content: `
        <h3>Get Started in 5 Minutes</h3>

        <h4>Step 1: Capture Everything</h4>
        <p>Click the <strong>+ Quick Capture</strong> button or press <kbd>N</kbd> to add items to your inbox. Don't worry about organizing yet - just get everything out of your head.</p>

        <h4>Step 2: Process Your Inbox</h4>
        <p>Go to the <strong>Inbox</strong> view and process each item:</p>
        <ul>
          <li>Is it actionable? If no, trash it, file it as reference, or add to Someday/Maybe</li>
          <li>If yes, what's the next action? Create an action with context</li>
          <li>Will it take more than one step? Create a project</li>
        </ul>

        <h4>Step 3: Work by Context</h4>
        <p>When you're ready to work, check your <strong>Next Actions</strong> filtered by your current context (@Phone, @Computer, @Office, etc.)</p>

        <h4>Step 4: Weekly Review</h4>
        <p>Every week, do a <strong>Weekly Review</strong> to keep your system current and trusted.</p>
      `
    },
    {
      id: 'navigation',
      title: 'Navigating the App',
      category: 'getting-started',
      tags: ['navigation', 'sidebar', 'menu', 'interface'],
      content: `
        <h3>App Navigation</h3>

        <h4>Sidebar</h4>
        <p>The sidebar contains all your main views:</p>
        <ul>
          <li><strong>Inbox</strong> - Unclarified items waiting to be processed</li>
          <li><strong>Today</strong> - Your focus for today</li>
          <li><strong>Next Actions</strong> - All actionable items by context</li>
          <li><strong>Waiting For</strong> - Items delegated to others</li>
          <li><strong>Projects</strong> - Multi-step outcomes</li>
          <li><strong>Someday/Maybe</strong> - Future possibilities</li>
          <li><strong>Reference</strong> - Non-actionable information</li>
          <li><strong>Weekly Review</strong> - Your review checklist</li>
        </ul>

        <h4>Quick Actions</h4>
        <ul>
          <li><strong>Quick Capture</strong> - Add items quickly</li>
          <li><strong>Command Palette</strong> - Press <kbd>Cmd/Ctrl + K</kbd> for quick commands</li>
          <li><strong>Search</strong> - Press <kbd>/</kbd> to search everything</li>
        </ul>
      `
    },

    // Inbox & Capture
    {
      id: 'capturing-items',
      title: 'Capturing Items',
      category: 'inbox',
      tags: ['capture', 'inbox', 'add', 'create', 'quick capture'],
      content: `
        <h3>Capturing Items</h3>
        <p>The capture step is about getting things out of your head and into a trusted system. Don't worry about organizing during capture - just get it down.</p>

        <h4>Ways to Capture</h4>
        <ul>
          <li><strong>Quick Capture Button</strong> - Click "+ Quick Capture" in the header</li>
          <li><strong>Keyboard Shortcut</strong> - Press <kbd>N</kbd> anywhere in the app</li>
          <li><strong>Voice Input</strong> - Click the microphone icon to speak your thought</li>
          <li><strong>Email Import</strong> - Import emails from Gmail (if connected)</li>
        </ul>

        <h4>What to Capture</h4>
        <ul>
          <li>Tasks and to-dos</li>
          <li>Ideas and thoughts</li>
          <li>Meeting notes</li>
          <li>Things you're waiting for</li>
          <li>Project ideas</li>
          <li>Reference information</li>
        </ul>

        <h4>Tips for Effective Capture</h4>
        <ul>
          <li>Capture immediately - don't let thoughts slip away</li>
          <li>Use natural language - AI will help parse it</li>
          <li>One item per capture for easier processing</li>
        </ul>
      `
    },
    {
      id: 'voice-capture',
      title: 'Voice Capture',
      category: 'inbox',
      tags: ['voice', 'speech', 'microphone', 'dictation'],
      content: `
        <h3>Voice Capture</h3>
        <p>Speak your thoughts directly into the app using voice recognition.</p>

        <h4>How to Use Voice Capture</h4>
        <ol>
          <li>Click the microphone icon in Quick Capture or any input field</li>
          <li>Grant microphone permission when prompted</li>
          <li>Speak clearly - your words will appear as text</li>
          <li>Click the microphone again or pause to stop recording</li>
        </ol>

        <h4>Voice Commands</h4>
        <p>You can use natural language patterns:</p>
        <ul>
          <li>"Call John about the project tomorrow" - Creates action with context and date</li>
          <li>"Buy groceries at the store" - Creates action with @Errands context</li>
          <li>"Email Sarah about meeting" - Creates action with @Email context</li>
        </ul>

        <h4>Tips</h4>
        <ul>
          <li>Speak in a quiet environment for best results</li>
          <li>Use punctuation words like "period" or "comma" if needed</li>
          <li>Review the transcription before submitting</li>
        </ul>
      `
    },

    // Processing & Organizing
    {
      id: 'processing-inbox',
      title: 'Processing Your Inbox',
      category: 'processing',
      tags: ['process', 'clarify', 'organize', 'workflow'],
      content: `
        <h3>Processing Your Inbox</h3>
        <p>Processing is about deciding what each item means and what to do about it.</p>

        <h4>The Processing Workflow</h4>
        <p>For each inbox item, ask yourself:</p>

        <h5>1. What is it?</h5>
        <p>Understand what the item actually is and what it requires.</p>

        <h5>2. Is it actionable?</h5>
        <p><strong>If NO:</strong></p>
        <ul>
          <li><strong>Trash</strong> - Delete if not needed</li>
          <li><strong>Reference</strong> - File for future reference</li>
          <li><strong>Someday/Maybe</strong> - Save for later consideration</li>
        </ul>

        <p><strong>If YES:</strong></p>
        <ul>
          <li><strong>Do it</strong> - If it takes less than 2 minutes, do it now</li>
          <li><strong>Delegate it</strong> - Send to Waiting For with person assigned</li>
          <li><strong>Defer it</strong> - Add to Next Actions with appropriate context</li>
        </ul>

        <h5>3. Is it a project?</h5>
        <p>If it requires more than one action, create a project and identify the next action.</p>

        <h4>Processing Tips</h4>
        <ul>
          <li>Process from top to bottom - don't skip items</li>
          <li>Make a decision for each item - no "maybe later"</li>
          <li>One item at a time until inbox is empty</li>
        </ul>
      `
    },
    {
      id: 'two-minute-rule',
      title: 'The Two-Minute Rule',
      category: 'processing',
      tags: ['two minute', 'quick', 'immediate', 'efficiency'],
      content: `
        <h3>The Two-Minute Rule</h3>
        <p>If an action will take less than two minutes to complete, do it immediately rather than tracking it.</p>

        <h4>Why Two Minutes?</h4>
        <p>It takes about two minutes to properly capture, organize, and later retrieve a task. If the task itself takes less than two minutes, it's more efficient to just do it now.</p>

        <h4>Examples of Two-Minute Tasks</h4>
        <ul>
          <li>Replying to a simple email</li>
          <li>Filing a document</li>
          <li>Making a quick phone call</li>
          <li>Adding an item to a shopping list</li>
          <li>Scheduling a meeting</li>
        </ul>

        <h4>When to Skip the Rule</h4>
        <ul>
          <li>During a time-blocked work session</li>
          <li>When you need to stay focused on a larger task</li>
          <li>If the "quick task" keeps expanding</li>
        </ul>
      `
    },

    // Actions & Contexts
    {
      id: 'contexts-explained',
      title: 'Understanding Contexts',
      category: 'actions',
      tags: ['context', 'tags', 'location', 'tools', 'filter'],
      content: `
        <h3>Understanding Contexts</h3>
        <p>Contexts help you see only the actions you can do right now based on your current situation.</p>

        <h4>Available Contexts</h4>
        <ul>
          <li><strong>@Phone</strong> - Calls to make</li>
          <li><strong>@Email</strong> - Emails to send or respond to</li>
          <li><strong>@Computer</strong> - Tasks requiring your computer</li>
          <li><strong>@Office</strong> - Tasks to do at work</li>
          <li><strong>@Home</strong> - Tasks to do at home</li>
          <li><strong>@Errands</strong> - Tasks to do while out</li>
          <li><strong>@Anywhere</strong> - Tasks you can do anywhere</li>
          <li><strong>@Waiting</strong> - Items delegated to others</li>
        </ul>

        <h4>Using Contexts Effectively</h4>
        <ul>
          <li>Filter by context when you're in a specific mode</li>
          <li>Group similar actions together for efficiency</li>
          <li>Check @Phone when you have time between meetings</li>
          <li>Check @Errands before leaving the house</li>
        </ul>

        <h4>Custom Contexts</h4>
        <p>You can create custom contexts in Settings to match your workflow.</p>
      `
    },
    {
      id: 'energy-levels',
      title: 'Energy Levels',
      category: 'actions',
      tags: ['energy', 'focus', 'mental', 'priority'],
      content: `
        <h3>Energy Levels</h3>
        <p>Tag actions by the mental energy required so you can match tasks to your current state.</p>

        <h4>Energy Categories</h4>
        <ul>
          <li><strong>High Energy</strong> - Complex tasks requiring deep focus (writing, coding, strategic planning)</li>
          <li><strong>Medium Energy</strong> - Standard tasks requiring some attention (emails, meetings, organizing)</li>
          <li><strong>Low Energy</strong> - Simple tasks you can do when tired (filing, reading, routine tasks)</li>
        </ul>

        <h4>When to Use Each</h4>
        <ul>
          <li><strong>Morning (typically high energy)</strong> - Tackle your most challenging tasks</li>
          <li><strong>After lunch (medium energy)</strong> - Handle communication and meetings</li>
          <li><strong>End of day (low energy)</strong> - Process email, organize, plan tomorrow</li>
        </ul>

        <h4>Tips</h4>
        <ul>
          <li>Know your peak energy times</li>
          <li>Don't waste high energy on low-energy tasks</li>
          <li>Keep a list of low-energy tasks for tired moments</li>
        </ul>
      `
    },
    {
      id: 'time-estimates',
      title: 'Time Estimates',
      category: 'actions',
      tags: ['time', 'duration', 'estimate', 'planning'],
      content: `
        <h3>Time Estimates</h3>
        <p>Adding time estimates helps you pick tasks that fit your available time.</p>

        <h4>Quick Time Tags</h4>
        <ul>
          <li><strong>5 min</strong> - Quick tasks</li>
          <li><strong>15 min</strong> - Short tasks</li>
          <li><strong>30 min</strong> - Medium tasks</li>
          <li><strong>1 hour</strong> - Longer focused work</li>
          <li><strong>2+ hours</strong> - Deep work sessions</li>
        </ul>

        <h4>Using Time Estimates</h4>
        <ul>
          <li>Have 10 minutes? Filter for 5-15 min tasks</li>
          <li>Before a meeting? Quick tasks only</li>
          <li>Clear afternoon? Tackle bigger items</li>
        </ul>

        <h4>Tips</h4>
        <ul>
          <li>Add buffer time - tasks often take longer than expected</li>
          <li>Break down tasks over 2 hours into smaller pieces</li>
          <li>Review estimates after completing to improve accuracy</li>
        </ul>
      `
    },

    // Projects
    {
      id: 'what-is-project',
      title: 'What is a Project?',
      category: 'projects',
      tags: ['project', 'multi-step', 'outcome', 'goal'],
      content: `
        <h3>What is a Project?</h3>
        <p>In GTD, a project is any outcome that requires more than one action step to complete.</p>

        <h4>Examples of Projects</h4>
        <ul>
          <li>"Plan vacation to Hawaii" - Multiple bookings, research, packing</li>
          <li>"Launch new website" - Design, development, testing, deployment</li>
          <li>"Hire new team member" - Job posting, interviews, onboarding</li>
          <li>"Get car serviced" - Schedule, drop off, pick up, pay</li>
        </ul>

        <h4>Project vs. Action</h4>
        <ul>
          <li><strong>Action:</strong> "Call garage to schedule oil change"</li>
          <li><strong>Project:</strong> "Car maintained and running smoothly"</li>
        </ul>

        <h4>Why Track Projects?</h4>
        <ul>
          <li>See all your commitments in one place</li>
          <li>Ensure every project has a next action</li>
          <li>Track progress toward outcomes</li>
          <li>Identify stuck projects during reviews</li>
        </ul>
      `
    },
    {
      id: 'project-support',
      title: 'Project Support Materials',
      category: 'projects',
      tags: ['support', 'notes', 'attachments', 'reference'],
      content: `
        <h3>Project Support Materials</h3>
        <p>Keep relevant information linked to your projects for easy access.</p>

        <h4>What to Attach</h4>
        <ul>
          <li>Planning documents</li>
          <li>Reference materials</li>
          <li>Meeting notes</li>
          <li>Links to resources</li>
          <li>Google Drive files (if connected)</li>
        </ul>

        <h4>Adding Support Materials</h4>
        <ol>
          <li>Open the project detail view</li>
          <li>Click "Add Notes" to add text notes</li>
          <li>Click "Attach File" to link a file</li>
          <li>Use "Link from Drive" for Google Drive files</li>
        </ol>

        <h4>Best Practices</h4>
        <ul>
          <li>Keep support materials focused and relevant</li>
          <li>Update as the project progresses</li>
          <li>Remove outdated materials</li>
          <li>Use clear naming conventions</li>
        </ul>
      `
    },

    // Views & Navigation
    {
      id: 'today-view',
      title: 'Today View',
      category: 'views',
      tags: ['today', 'focus', 'daily', 'priority', 'dashboard'],
      content: `
        <h3>Today View</h3>
        <p>Your daily focus dashboard showing what matters most right now.</p>

        <h4>Daily Briefing</h4>
        <p>The Today view displays key information to start your day:</p>
        <ul>
          <li><strong>Current Time & Weather</strong> - Local time with weather conditions</li>
          <li><strong>Inbox Count</strong> - Items waiting to be processed</li>
          <li><strong>Due Today</strong> - Actions with today's due date</li>
          <li><strong>Overdue</strong> - Past-due items needing attention</li>
        </ul>

        <h4>At-a-Glance Stats</h4>
        <p>Quick overview of your GTD system:</p>
        <ul>
          <li><strong>Active Actions</strong> - Total next actions in your system</li>
          <li><strong>Waiting For</strong> - Items delegated to others</li>
          <li><strong>Active Projects</strong> - Projects currently in progress</li>
        </ul>

        <h4>Focus Sections</h4>
        <ul>
          <li><strong>Due Today</strong> - Actions that must be done today</li>
          <li><strong>Flagged Items</strong> - Items you've marked as priority</li>
          <li><strong>Waiting For Check-ins</strong> - Delegated items to follow up on</li>
        </ul>

        <h4>Using Today View</h4>
        <ul>
          <li>Start your day here to see what's on your plate</li>
          <li>Flag important items to surface them in Today</li>
          <li>Complete or reschedule overdue items</li>
          <li>Check your inbox count and process items to zero</li>
        </ul>
      `
    },
    {
      id: 'waiting-for-view',
      title: 'Waiting For View',
      category: 'views',
      tags: ['waiting', 'delegate', 'follow up', 'tracking'],
      content: `
        <h3>Waiting For View</h3>
        <p>Track everything you've delegated or are waiting on from others.</p>

        <h4>Creating Waiting For Items</h4>
        <ul>
          <li>When processing inbox, choose "Delegate" to create a waiting for</li>
          <li>Assign the person responsible</li>
          <li>Set a follow-up date</li>
          <li>Add any relevant notes</li>
        </ul>

        <h4>Email Tracking</h4>
        <p>If Gmail is connected:</p>
        <ul>
          <li>Send emails directly from waiting for items</li>
          <li>Track if replies have been received</li>
          <li>See email thread history</li>
        </ul>

        <h4>Following Up</h4>
        <ul>
          <li>Review waiting items during Weekly Review</li>
          <li>Follow up on overdue items</li>
          <li>Mark complete when received</li>
          <li>Filter by person to see all items from someone</li>
        </ul>
      `
    },
    {
      id: 'someday-maybe',
      title: 'Someday/Maybe List',
      category: 'views',
      tags: ['someday', 'maybe', 'future', 'incubate', 'ideas'],
      content: `
        <h3>Someday/Maybe List</h3>
        <p>A holding place for ideas and possibilities you're not committed to yet.</p>

        <h4>What Goes Here</h4>
        <ul>
          <li>Ideas you want to explore later</li>
          <li>Projects you might do someday</li>
          <li>Things you want but aren't ready for</li>
          <li>Skills you want to learn</li>
          <li>Places you want to visit</li>
        </ul>

        <h4>Managing Someday/Maybe</h4>
        <ul>
          <li>Add items freely without commitment</li>
          <li>Review during Weekly Review</li>
          <li>Move to active projects when ready</li>
          <li>Delete items that no longer interest you</li>
        </ul>

        <h4>Categories</h4>
        <p>Organize by area: Personal, Professional, Learning, Travel, Creative, etc.</p>
      `
    },

    // Weekly Review
    {
      id: 'weekly-review-guide',
      title: 'Weekly Review Guide',
      category: 'review',
      tags: ['weekly review', 'review', 'reflect', 'maintenance'],
      content: `
        <h3>Weekly Review Guide</h3>
        <p>The Weekly Review is the critical success factor for GTD. It keeps your system current and your mind clear.</p>

        <h4>When to Review</h4>
        <ul>
          <li>Same time each week (Friday afternoon or Sunday evening work well)</li>
          <li>Block 1-2 hours</li>
          <li>Find a quiet space</li>
        </ul>

        <h4>The Review Steps</h4>
        <ol>
          <li><strong>Get Clear</strong> - Process all inboxes to zero</li>
          <li><strong>Get Current</strong> - Review all lists and update</li>
          <li><strong>Get Creative</strong> - Think about new ideas and possibilities</li>
        </ol>

        <h4>Benefits of Weekly Review</h4>
        <ul>
          <li>Nothing falls through the cracks</li>
          <li>Clear mind for the week ahead</li>
          <li>Catch stuck projects early</li>
          <li>Stay aligned with your goals</li>
        </ul>
      `
    },
    {
      id: 'review-checklist',
      title: 'Review Checklist Steps',
      category: 'review',
      tags: ['checklist', 'steps', 'process', 'guide'],
      content: `
        <h3>Review Checklist Steps</h3>

        <h4>Step 1: Collect Loose Papers</h4>
        <p>Gather any physical notes, receipts, or papers and process them into your inbox.</p>

        <h4>Step 2: Process Inbox</h4>
        <p>Get your GTD inbox to zero. Process every item - no skipping.</p>

        <h4>Step 3: Review Next Actions</h4>
        <p>Go through each action. Is it still relevant? Still the right next step? Mark complete or delete as needed.</p>

        <h4>Step 4: Review Waiting For</h4>
        <p>Check items you're waiting on. Follow up on anything overdue.</p>

        <h4>Step 5: Review Projects</h4>
        <p>Ensure every project has a next action. Check for stuck projects.</p>

        <h4>Step 6: Review Calendar</h4>
        <p>Look at the past week and coming weeks. Capture any triggered items.</p>

        <h4>Step 7: Review Someday/Maybe</h4>
        <p>Anything ready to become active? Anything to delete?</p>

        <h4>Step 8: Set Intentions</h4>
        <p>What are your priorities for the coming week?</p>
      `
    },

    // Integrations
    {
      id: 'google-drive-integration',
      title: 'Google Drive Integration',
      category: 'integrations',
      tags: ['google', 'drive', 'files', 'attachments', 'cloud'],
      content: `
        <h3>Google Drive Integration</h3>
        <p>Connect Google Drive to attach files to your actions and reference items.</p>

        <h4>Connecting Google Drive</h4>
        <ol>
          <li>Go to Settings > Integrations</li>
          <li>Click "Connect" next to Google Drive</li>
          <li>Sign in with your Google account</li>
          <li>Grant permission to access Drive files</li>
        </ol>

        <h4>Using Drive Files</h4>
        <ul>
          <li><strong>Reference Items</strong> - Click "Link from Drive" to attach files</li>
          <li><strong>Actions</strong> - Attach relevant documents to any action</li>
          <li><strong>Projects</strong> - Link project plans and supporting materials</li>
        </ul>

        <h4>File Picker</h4>
        <p>The Google Picker lets you browse and search your Drive files. Select files to create quick links that open in Drive.</p>
      `
    },
    {
      id: 'gmail-integration',
      title: 'Gmail Integration',
      category: 'integrations',
      tags: ['gmail', 'email', 'send', 'import', 'tracking'],
      content: `
        <h3>Gmail Integration</h3>
        <p>Connect Gmail to send emails, track replies, and import emails as tasks.</p>

        <h4>Features</h4>
        <ul>
          <li><strong>Send Emails</strong> - Compose and send without leaving the app</li>
          <li><strong>Reply Tracking</strong> - Know when someone responds to your email</li>
          <li><strong>Import Emails</strong> - Turn emails into inbox items</li>
        </ul>

        <h4>Sending Emails</h4>
        <p>From any action or waiting for item, click the email icon to compose a message. It sends via your Gmail account.</p>

        <h4>Reply Tracking</h4>
        <p>When you send an email from a Waiting For item, the app tracks the thread. You'll see a notification when a reply arrives.</p>

        <h4>Importing Emails</h4>
        <ol>
          <li>Go to Inbox view</li>
          <li>Click "Import from Gmail"</li>
          <li>Select a label to import from</li>
          <li>Choose which emails to convert to tasks</li>
        </ol>
      `
    },
    {
      id: 'google-calendar-integration',
      title: 'Google Calendar Integration',
      category: 'integrations',
      tags: ['calendar', 'events', 'schedule', 'deadlines'],
      content: `
        <h3>Google Calendar Integration</h3>
        <p>Connect Google Calendar to manage your calendar connections and sync deadlines.</p>

        <h4>Connecting Your Calendar</h4>
        <ol>
          <li>Go to Settings > Integrations</li>
          <li>Click "Connect" next to Google Calendar</li>
          <li>Sign in with your Google account</li>
          <li>Grant permission to access your calendars</li>
        </ol>

        <h4>Features</h4>
        <ul>
          <li><strong>Calendar Management</strong> - Select which calendars to use</li>
          <li><strong>Project Deadlines</strong> - Sync project deadlines to calendar</li>
          <li><strong>Weekly Review Calendar</strong> - Review upcoming events during weekly review</li>
        </ul>

        <h4>Managing Calendars</h4>
        <p>Once connected, you can:</p>
        <ul>
          <li>View your connected calendars in Settings</li>
          <li>Refresh calendar list to see new calendars</li>
          <li>Disconnect at any time from Settings</li>
        </ul>

        <h4>Note</h4>
        <p>Calendar events are not displayed in the Today view. The Today view focuses on your GTD workflow with inbox count, due items, and action stats. Use your native calendar app for scheduling.</p>
      `
    },

    // Keyboard Shortcuts
    {
      id: 'keyboard-shortcuts',
      title: 'Keyboard Shortcuts',
      category: 'keyboard',
      tags: ['keyboard', 'shortcuts', 'hotkeys', 'quick'],
      content: `
        <h3>Keyboard Shortcuts</h3>

        <h4>Global</h4>
        <table class="help-table">
          <tr><td><kbd>N</kbd></td><td>New capture</td></tr>
          <tr><td><kbd>Cmd/Ctrl + K</kbd></td><td>Command palette</td></tr>
          <tr><td><kbd>/</kbd></td><td>Search</td></tr>
          <tr><td><kbd>?</kbd></td><td>Show help</td></tr>
          <tr><td><kbd>Escape</kbd></td><td>Close modal/panel</td></tr>
        </table>

        <h4>Navigation</h4>
        <table class="help-table">
          <tr><td><kbd>G</kbd> then <kbd>I</kbd></td><td>Go to Inbox</td></tr>
          <tr><td><kbd>G</kbd> then <kbd>T</kbd></td><td>Go to Today</td></tr>
          <tr><td><kbd>G</kbd> then <kbd>N</kbd></td><td>Go to Next Actions</td></tr>
          <tr><td><kbd>G</kbd> then <kbd>P</kbd></td><td>Go to Projects</td></tr>
          <tr><td><kbd>G</kbd> then <kbd>W</kbd></td><td>Go to Waiting For</td></tr>
          <tr><td><kbd>G</kbd> then <kbd>R</kbd></td><td>Go to Weekly Review</td></tr>
        </table>

        <h4>Actions</h4>
        <table class="help-table">
          <tr><td><kbd>Enter</kbd></td><td>Open selected item</td></tr>
          <tr><td><kbd>E</kbd></td><td>Edit selected item</td></tr>
          <tr><td><kbd>D</kbd></td><td>Mark complete/done</td></tr>
          <tr><td><kbd>Delete</kbd></td><td>Delete selected item</td></tr>
        </table>
      `
    },

    // Tips & Best Practices
    {
      id: 'gtd-tips',
      title: 'GTD Tips & Best Practices',
      category: 'tips',
      tags: ['tips', 'best practices', 'advice', 'productivity'],
      content: `
        <h3>GTD Tips & Best Practices</h3>

        <h4>Capture Tips</h4>
        <ul>
          <li>Capture immediately - don't trust your memory</li>
          <li>Write enough detail to remember later</li>
          <li>One item per capture</li>
        </ul>

        <h4>Processing Tips</h4>
        <ul>
          <li>Process daily, not just weekly</li>
          <li>Start with the first item, not the most interesting</li>
          <li>Touch each item only once</li>
        </ul>

        <h4>Action Tips</h4>
        <ul>
          <li>Start with a verb: Call, Email, Draft, Review</li>
          <li>Be specific: "Call John about budget" not "John"</li>
          <li>Include all info needed to act</li>
        </ul>

        <h4>Review Tips</h4>
        <ul>
          <li>Never skip the Weekly Review</li>
          <li>Keep it at the same time each week</li>
          <li>Review in a distraction-free environment</li>
        </ul>

        <h4>System Tips</h4>
        <ul>
          <li>Trust your system completely</li>
          <li>Keep it simple - don't over-engineer</li>
          <li>Adapt GTD to your needs, not vice versa</li>
        </ul>
      `
    },
    {
      id: 'common-mistakes',
      title: 'Common GTD Mistakes',
      category: 'tips',
      tags: ['mistakes', 'problems', 'troubleshooting', 'avoid'],
      content: `
        <h3>Common GTD Mistakes to Avoid</h3>

        <h4>1. Not Capturing Everything</h4>
        <p><strong>Problem:</strong> Trying to remember things instead of capturing them.</p>
        <p><strong>Solution:</strong> Capture immediately, even small things.</p>

        <h4>2. Vague Next Actions</h4>
        <p><strong>Problem:</strong> Actions like "Website" or "Mom" that don't tell you what to do.</p>
        <p><strong>Solution:</strong> Start with a verb and be specific.</p>

        <h4>3. Projects Without Next Actions</h4>
        <p><strong>Problem:</strong> Projects that sit idle because there's no clear next step.</p>
        <p><strong>Solution:</strong> Every project needs at least one next action at all times.</p>

        <h4>4. Skipping the Weekly Review</h4>
        <p><strong>Problem:</strong> System becomes outdated and untrustworthy.</p>
        <p><strong>Solution:</strong> Schedule it, protect it, do it every week.</p>

        <h4>5. Using Due Dates Wrong</h4>
        <p><strong>Problem:</strong> Adding due dates to everything, creating false urgency.</p>
        <p><strong>Solution:</strong> Only use due dates for real deadlines.</p>

        <h4>6. Over-Organizing</h4>
        <p><strong>Problem:</strong> Spending more time organizing than doing.</p>
        <p><strong>Solution:</strong> Keep it simple. Context is often enough.</p>
      `
    }
  ],

  // Onboarding tour steps
  onboardingSteps: [
    {
      target: '.quick-capture-btn',
      title: 'Welcome to GTD Capture!',
      content: 'This is your Quick Capture button. Click it or press <kbd>N</kbd> to capture thoughts, tasks, and ideas instantly. Get everything out of your head!',
      position: 'bottom'
    },
    {
      target: '[data-view="inbox"]',
      title: 'Your Inbox',
      content: 'Everything you capture lands here first. Process your inbox regularly to decide what each item means and what to do about it.',
      position: 'right'
    },
    {
      target: '[data-view="today"]',
      title: 'Today View',
      content: 'Your daily focus dashboard. See your inbox count, due items, flagged priorities, and system stats at a glance. Start your day here!',
      position: 'right'
    },
    {
      target: '[data-view="next-actions"]',
      title: 'Next Actions',
      content: 'All your actionable items organized by context. Filter by @Phone, @Computer, @Email, and more to see what you can do right now.',
      position: 'right'
    },
    {
      target: '[data-view="projects"]',
      title: 'Projects',
      content: 'Multi-step outcomes live here. Every project should have at least one next action to keep moving forward.',
      position: 'right'
    },
    {
      target: '[data-view="weekly-review"]',
      title: 'Weekly Review',
      content: 'The secret to GTD success! Do this every week to keep your system current and your mind clear.',
      position: 'right'
    },
    {
      target: '.user-menu-trigger',
      title: 'Settings & More',
      content: 'Access your settings, connect integrations like Google Calendar, and customize your GTD experience.',
      position: 'bottom-end'
    },
    {
      target: '.help-btn',
      title: 'Need Help?',
      content: 'Click the help button anytime to access documentation, search for answers, or revisit this tour. You\'re all set to get things done!',
      position: 'bottom-end'
    }
  ],

  // Contextual help tooltips for different parts of the UI
  contextualHelp: {
    'inbox': 'Your inbox is the collection point for all inputs. Process items here to decide what they mean and what to do about them.',
    'inbox-item': 'Ask yourself: Is this actionable? If yes, what\'s the next action? If no, trash it, file it, or add to Someday/Maybe.',
    'next-actions': 'Actions are single, physical steps you can take. Filter by context to see what you can do right now.',
    'context-filter': 'Contexts help you batch similar actions together. Check @Phone when you have call time, @Errands before leaving.',
    'project': 'A project is any outcome requiring more than one action. Ensure every project has a next action.',
    'waiting-for': 'Track everything you\'ve delegated. Review regularly and follow up on overdue items.',
    'someday-maybe': 'Ideas and possibilities for the future. Review weekly to see if anything is ready to become active.',
    'weekly-review': 'The most important habit in GTD. Dedicate 1-2 hours weekly to get clear, current, and creative.',
    'quick-capture': 'Capture anything on your mind. Don\'t worry about organizing - just get it out of your head.',
    'today-stats': 'Quick overview of your GTD system: inbox count, due items, active actions, waiting for items, and active projects.',
    'energy-level': 'Match tasks to your current energy. Save high-energy work for your peak hours.',
    'due-date': 'Only add due dates for real deadlines. False urgency dilutes the meaning of actual due dates.'
  }
};

// Search function for help articles
function searchHelpArticles(query) {
  if (!query || query.length < 2) {
    return [];
  }

  const lowerQuery = query.toLowerCase();
  const results = [];

  wikiContent.articles.forEach(article => {
    let score = 0;

    // Title match (highest weight)
    if (article.title.toLowerCase().includes(lowerQuery)) {
      score += 10;
    }

    // Tag match (high weight)
    if (article.tags.some(tag => tag.toLowerCase().includes(lowerQuery))) {
      score += 5;
    }

    // Content match (lower weight)
    if (article.content.toLowerCase().includes(lowerQuery)) {
      score += 1;
    }

    if (score > 0) {
      results.push({ article, score });
    }
  });

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results.map(r => r.article);
}

// Get articles by category
function getArticlesByCategory(categoryId) {
  return wikiContent.articles.filter(a => a.category === categoryId);
}

// Get article by ID
function getArticleById(articleId) {
  return wikiContent.articles.find(a => a.id === articleId);
}

// Get contextual help for a UI element
function getContextualHelp(elementId) {
  return wikiContent.contextualHelp[elementId] || null;
}

// Export for use in app.js
window.wikiContent = wikiContent;
window.searchHelpArticles = searchHelpArticles;
window.getArticlesByCategory = getArticlesByCategory;
window.getArticleById = getArticleById;
window.getContextualHelp = getContextualHelp;
