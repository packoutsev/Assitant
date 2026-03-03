// =====================================================
// POWER FEATURES - Advanced GTD Functionality
// =====================================================

console.log('Loading power features...');

// =====================================================
// AI HELPER - Wrapper for Claude API
// =====================================================

GTDApp.prototype.callAI = async function(prompt) {
  if (!window.aiService) {
    throw new Error('AI service not available');
  }

  const apiKey = await window.aiService.getApiKey();
  if (!apiKey) {
    this.showToast('Add your AI API key in Settings', 'error');
    throw new Error('No API key');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || 'AI request failed');
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
};

// =====================================================
// 1. BRAIN DUMP MODE
// =====================================================

GTDApp.prototype.showBrainDump = function() {
  const modal = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  modal.classList.add('active');

  content.innerHTML = `
    <div class="modal-header">
      <h3>🧠 Brain Dump</h3>
      <p class="modal-subtitle">Dump everything on your mind. AI will sort it out.</p>
    </div>
    <div class="modal-body brain-dump-body">
      <textarea id="brainDumpInput" class="brain-dump-textarea"
        placeholder="Just start typing everything on your mind...

- Call mom about Sunday dinner
- Need to finish Q4 report
- Buy milk and eggs
- That idea for the new feature
- Follow up with John about proposal
- Book dentist appointment
- Research vacation spots
- Team meeting notes somewhere...

Don't worry about formatting. Just dump it all."></textarea>
      <div id="brainDumpResults" class="brain-dump-results" style="display: none;"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="app.processBrainDump()" id="brainDumpBtn">
        <span class="btn-text">🪄 Process with AI</span>
        <span class="btn-loading" style="display:none;">Processing...</span>
      </button>
    </div>
  `;

  document.getElementById('brainDumpInput').focus();
};

GTDApp.prototype.processBrainDump = async function() {
  const input = document.getElementById('brainDumpInput');
  const resultsDiv = document.getElementById('brainDumpResults');
  const btn = document.getElementById('brainDumpBtn');
  const text = input.value.trim();

  if (!text) {
    this.showToast('Write something first!', 'error');
    return;
  }

  // Show loading
  btn.querySelector('.btn-text').style.display = 'none';
  btn.querySelector('.btn-loading').style.display = 'inline';
  btn.disabled = true;

  try {
    const prompt = `You are a GTD (Getting Things Done) expert. Analyze this brain dump and categorize each item.

BRAIN DUMP:
${text}

Return a JSON array of items. Each item should have:
- "text": the cleaned up text
- "type": one of "action", "project", "waiting_for", "reference", "someday"
- "context": suggested context like "@phone", "@computer", "@errands", "@home", "@office" (only for actions)
- "priority": "high", "medium", or "low"
- "project_group": if multiple items seem related, give them the same group name
- "next_action": if it's a project, what's the first concrete next action?

Be smart about parsing. "Call mom" is an action. "Plan vacation" is a project. "John owes me $50" is waiting_for.

Return ONLY valid JSON array, no other text.`;

    const response = await this.callAI(prompt);
    let items = [];

    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        items = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse AI response:', e);
      this.showToast('AI parsing failed, try again', 'error');
      return;
    }

    if (items.length === 0) {
      this.showToast('No items found', 'warning');
      return;
    }

    // Store for later processing
    this._brainDumpItems = items;

    // Group by type
    const grouped = {
      action: items.filter(i => i.type === 'action'),
      project: items.filter(i => i.type === 'project'),
      waiting_for: items.filter(i => i.type === 'waiting_for'),
      reference: items.filter(i => i.type === 'reference'),
      someday: items.filter(i => i.type === 'someday')
    };

    // Render results
    input.style.display = 'none';
    resultsDiv.style.display = 'block';

    resultsDiv.innerHTML = `
      <div class="brain-dump-summary">
        <h4>Found ${items.length} items</h4>
        <div class="brain-dump-stats">
          ${grouped.action.length ? `<span class="stat action">${grouped.action.length} Actions</span>` : ''}
          ${grouped.project.length ? `<span class="stat project">${grouped.project.length} Projects</span>` : ''}
          ${grouped.waiting_for.length ? `<span class="stat waiting">${grouped.waiting_for.length} Waiting For</span>` : ''}
          ${grouped.reference.length ? `<span class="stat reference">${grouped.reference.length} Reference</span>` : ''}
          ${grouped.someday.length ? `<span class="stat someday">${grouped.someday.length} Someday</span>` : ''}
        </div>
      </div>
      <div class="brain-dump-items">
        ${items.map((item, i) => `
          <div class="brain-dump-item ${item.type}" data-index="${i}">
            <input type="checkbox" checked id="bd_${i}">
            <label for="bd_${i}">
              <span class="item-type-badge ${item.type}">${item.type.replace('_', ' ')}</span>
              <span class="item-text">${this.escapeHtml(item.text)}</span>
              ${item.context ? `<span class="item-context">${item.context}</span>` : ''}
              ${item.project_group ? `<span class="item-group">📁 ${item.project_group}</span>` : ''}
            </label>
          </div>
        `).join('')}
      </div>
      <div class="brain-dump-actions">
        <button class="btn btn-secondary" onclick="app.resetBrainDump()">← Edit</button>
        <button class="btn btn-primary" onclick="app.saveBrainDumpItems()">Add Selected to GTD</button>
      </div>
    `;

  } catch (e) {
    console.error('Brain dump error:', e);
    this.showToast('Failed to process', 'error');
  } finally {
    btn.querySelector('.btn-text').style.display = 'inline';
    btn.querySelector('.btn-loading').style.display = 'none';
    btn.disabled = false;
  }
};

GTDApp.prototype.resetBrainDump = function() {
  document.getElementById('brainDumpInput').style.display = 'block';
  document.getElementById('brainDumpResults').style.display = 'none';
};

GTDApp.prototype.saveBrainDumpItems = async function() {
  const items = this._brainDumpItems || [];
  const checkboxes = document.querySelectorAll('.brain-dump-item input[type="checkbox"]');

  let added = { action: 0, project: 0, waiting_for: 0, reference: 0, someday: 0 };

  for (let i = 0; i < items.length; i++) {
    if (!checkboxes[i]?.checked) continue;

    const item = items[i];

    try {
      switch (item.type) {
        case 'action':
          await db.addNextAction({
            action: item.text,
            contexts: item.context ? [item.context] : ['@anywhere'],
            priority: item.priority || 'medium',
            originalContent: item.text
          });
          added.action++;
          break;

        case 'project':
          await db.addProject({
            name: item.text,
            description: item.next_action ? `Next: ${item.next_action}` : '',
            status: 'active'
          });
          added.project++;
          break;

        case 'waiting_for':
          // delegateAction(actionText, targetPerson, method, originalContent, projectId)
          await db.delegateAction(item.text, 'Someone', 'verbal', item.text, null);
          added.waiting_for++;
          break;

        case 'reference':
          await db.addToReference(item.text, item.text, null, [], null);
          added.reference++;
          break;

        case 'someday':
          await db.addToSomedayMaybe({
            content: item.text,
            category: 'idea'
          });
          added.someday++;
          break;
      }
    } catch (e) {
      console.error('Failed to add item:', item, e);
    }
  }

  const total = Object.values(added).reduce((a, b) => a + b, 0);
  this.showToast(`Added ${total} items to your GTD system!`, 'success');
  this.closeModal();
  await this.renderCurrentView();
  await this.updateCounts();
};

// =====================================================
// 2. WHAT NEXT? - SMART TASK SUGGESTION
// =====================================================

GTDApp.prototype.showWhatNext = async function() {
  const modal = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  modal.classList.add('active');

  content.innerHTML = `
    <div class="what-next-container">
      <div class="what-next-thinking">
        <div class="thinking-animation">🤔</div>
        <h3>Analyzing your tasks...</h3>
        <p>Considering deadlines, contexts, and priorities</p>
      </div>
    </div>
  `;

  try {
    // Get all actions
    const actions = await db.getNextActions();
    const waitingFor = await db.getWaitingFor();
    const projects = await db.getProjects();

    if (actions.length === 0) {
      content.innerHTML = `
        <div class="what-next-container">
          <div class="what-next-empty">
            <span class="empty-icon">✨</span>
            <h3>All clear!</h3>
            <p>You have no pending actions. Time to relax or capture new ideas.</p>
            <button class="btn btn-primary" onclick="app.closeModal()">Close</button>
          </div>
        </div>
      `;
      return;
    }

    // Get current context
    const hour = new Date().getHours();
    const isWorkHours = hour >= 9 && hour < 18;
    const isMorning = hour >= 6 && hour < 12;
    const isEvening = hour >= 18;
    const dayOfWeek = new Date().getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Score each action
    const scored = actions.map(action => {
      let score = 50; // Base score

      // Priority boost
      if (action.priority === 'high') score += 30;
      if (action.priority === 'low') score -= 10;

      // Due date urgency
      if (action.dueDate) {
        const due = new Date(action.dueDate);
        const now = new Date();
        const daysUntil = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

        if (daysUntil < 0) score += 50; // Overdue!
        else if (daysUntil === 0) score += 40; // Due today
        else if (daysUntil === 1) score += 30; // Due tomorrow
        else if (daysUntil <= 3) score += 20;
        else if (daysUntil <= 7) score += 10;
      }

      // Context appropriateness
      const contexts = action.contexts || [];
      if (isWorkHours && !isWeekend) {
        if (contexts.includes('@office') || contexts.includes('@computer')) score += 15;
        if (contexts.includes('@home')) score -= 10;
      } else {
        if (contexts.includes('@home')) score += 15;
        if (contexts.includes('@office')) score -= 10;
      }

      // Morning = high energy tasks
      if (isMorning && action.priority === 'high') score += 10;

      // Evening = low energy tasks
      if (isEvening && action.priority === 'low') score += 10;
      if (isEvening && action.priority === 'high') score -= 5;

      // Phone calls during business hours
      if (contexts.includes('@phone') && isWorkHours && !isWeekend) score += 10;
      if (contexts.includes('@phone') && (isEvening || isWeekend)) score -= 20;

      return { ...action, score };
    });

    // Sort by score
    scored.sort((a, b) => b.score - a.score);
    const top = scored[0];
    const alternatives = scored.slice(1, 4);

    // Find related project
    const project = top.projectId ? projects.find(p => p.id === top.projectId) : null;

    content.innerHTML = `
      <div class="what-next-container">
        <div class="what-next-header">
          <span class="what-next-icon">🎯</span>
          <h3>Here's what you should do next</h3>
        </div>

        <div class="what-next-recommendation">
          <div class="recommended-action">
            <div class="action-priority ${top.priority || 'medium'}">${top.priority || 'medium'}</div>
            <h2>${this.escapeHtml(top.action)}</h2>
            ${project ? `<div class="action-project">📁 ${this.escapeHtml(project.name)}</div>` : ''}
            <div class="action-meta">
              ${(top.contexts || []).map(c => `<span class="context-tag">${c}</span>`).join('')}
              ${top.dueDate ? `<span class="due-tag ${this.isDueToday(top.dueDate) ? 'today' : ''}">${this.formatDate(top.dueDate)}</span>` : ''}
            </div>
          </div>

          <div class="recommendation-reason">
            ${this.getRecommendationReason(top, hour, isWeekend)}
          </div>

          <div class="what-next-buttons">
            <button class="btn btn-primary btn-lg" onclick="app.startFocusOnTask('${top.id}')">
              ▶️ Start Now
            </button>
            <button class="btn btn-secondary" onclick="app.completeActionFromModal('${top.id}')">
              ✓ Already Done
            </button>
          </div>
        </div>

        ${alternatives.length > 0 ? `
          <div class="what-next-alternatives">
            <h4>Also good options:</h4>
            ${alternatives.map(alt => `
              <div class="alternative-action" onclick="app.showWhatNextFor('${alt.id}')">
                <span class="alt-priority ${alt.priority || 'medium'}"></span>
                <span class="alt-text">${this.escapeHtml(this.truncate(alt.action, 50))}</span>
                <span class="alt-score">${Math.round(alt.score)}%</span>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <button class="btn btn-link" onclick="app.closeModal()">Maybe later</button>
      </div>
    `;

  } catch (e) {
    console.error('What next error:', e);
    this.showToast('Failed to analyze tasks', 'error');
    this.closeModal();
  }
};

GTDApp.prototype.getRecommendationReason = function(action, hour, isWeekend) {
  const reasons = [];

  if (action.dueDate) {
    const due = new Date(action.dueDate);
    const now = new Date();
    const daysUntil = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

    if (daysUntil < 0) reasons.push("⚠️ This is overdue!");
    else if (daysUntil === 0) reasons.push("📅 This is due today");
    else if (daysUntil === 1) reasons.push("📅 This is due tomorrow");
  }

  if (action.priority === 'high') reasons.push("🔥 High priority task");

  const contexts = action.contexts || [];
  if (contexts.includes('@phone') && hour >= 9 && hour < 17 && !isWeekend) {
    reasons.push("📞 Good time for phone calls");
  }

  if (hour >= 6 && hour < 10) reasons.push("🌅 Morning is great for important work");

  if (reasons.length === 0) reasons.push("✨ This matches your current context");

  return reasons.join(' · ');
};

GTDApp.prototype.isDueToday = function(dateStr) {
  if (!dateStr) return false;
  const due = new Date(dateStr);
  const today = new Date();
  return due.toDateString() === today.toDateString();
};

GTDApp.prototype.completeActionFromModal = async function(actionId) {
  await db.completeAction(actionId);
  this.showToast('Action completed!', 'success');
  this.closeModal();
  await this.renderCurrentView();
  await this.updateCounts();
};

// =====================================================
// 3. TIME HORIZON TIMELINE
// =====================================================

GTDApp.prototype.showTimeHorizon = async function() {
  this.currentView = 'timeline';

  // Hide all views and show timeline view
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const timelineView = document.getElementById('timelineView');
  if (timelineView) {
    timelineView.classList.add('active');
    timelineView.innerHTML = `
      <div class="timeline-view">
        <div class="timeline-header">
          <h2>⏳ Time Horizon</h2>
          <p>Your tasks and projects across time</p>
        </div>
        <div class="timeline-container" id="timelineContainer">
          <div class="timeline-loading">Loading timeline...</div>
        </div>
      </div>
    `;
  }

  try {
    const actions = await db.getNextActions();
    const projects = await db.getProjects();
    const waitingFor = await db.getWaitingFor();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() + 7);

    const thisMonth = new Date(today);
    thisMonth.setMonth(thisMonth.getMonth() + 1);

    // Categorize items by time horizon
    const horizons = {
      overdue: [],
      today: [],
      tomorrow: [],
      thisWeek: [],
      thisMonth: [],
      later: [],
      someday: []
    };

    actions.forEach(action => {
      if (!action.dueDate) {
        horizons.someday.push({ ...action, itemType: 'action' });
        return;
      }

      const due = new Date(action.dueDate);
      due.setHours(0, 0, 0, 0);

      if (due < today) horizons.overdue.push({ ...action, itemType: 'action' });
      else if (due.getTime() === today.getTime()) horizons.today.push({ ...action, itemType: 'action' });
      else if (due.getTime() === tomorrow.getTime()) horizons.tomorrow.push({ ...action, itemType: 'action' });
      else if (due < thisWeek) horizons.thisWeek.push({ ...action, itemType: 'action' });
      else if (due < thisMonth) horizons.thisMonth.push({ ...action, itemType: 'action' });
      else horizons.later.push({ ...action, itemType: 'action' });
    });

    // Add projects with deadlines
    projects.filter(p => p.deadline && p.status === 'active').forEach(project => {
      const deadline = new Date(project.deadline);
      deadline.setHours(0, 0, 0, 0);

      const item = { ...project, itemType: 'project', dueDate: project.deadline };

      if (deadline < today) horizons.overdue.push(item);
      else if (deadline < thisWeek) horizons.thisWeek.push(item);
      else if (deadline < thisMonth) horizons.thisMonth.push(item);
      else horizons.later.push(item);
    });

    const container = document.getElementById('timelineContainer');
    if (!container) return;
    container.innerHTML = `
      <div class="timeline-track">
        ${this.renderTimelineSection('🔴 Overdue', horizons.overdue, 'overdue')}
        ${this.renderTimelineSection('📍 Today', horizons.today, 'today')}
        ${this.renderTimelineSection('📅 Tomorrow', horizons.tomorrow, 'tomorrow')}
        ${this.renderTimelineSection('📆 This Week', horizons.thisWeek, 'week')}
        ${this.renderTimelineSection('🗓️ This Month', horizons.thisMonth, 'month')}
        ${this.renderTimelineSection('🔮 Later', horizons.later, 'later')}
        ${this.renderTimelineSection('💭 Someday', horizons.someday, 'someday')}
      </div>
    `;

    // Setup drag and drop for rescheduling
    this.setupTimelineDragDrop();

  } catch (e) {
    console.error('Timeline error:', e);
    const timelineView = document.getElementById('timelineView');
    if (timelineView) timelineView.innerHTML = '<div class="error">Failed to load timeline</div>';
  }
};

GTDApp.prototype.renderTimelineSection = function(title, items, sectionId) {
  if (items.length === 0 && sectionId !== 'today') return '';

  return `
    <div class="timeline-section ${sectionId}" data-section="${sectionId}">
      <div class="timeline-section-header">
        <h3>${title}</h3>
        <span class="section-count">${items.length}</span>
      </div>
      <div class="timeline-section-items" data-section="${sectionId}">
        ${items.length === 0 ? '<div class="timeline-empty">Nothing here</div>' : ''}
        ${items.map(item => `
          <div class="timeline-item ${item.itemType} ${item.priority || ''}"
               draggable="true"
               data-id="${item.id}"
               data-type="${item.itemType}">
            <div class="timeline-item-content">
              <span class="item-icon">${item.itemType === 'project' ? '📁' : '✓'}</span>
              <span class="item-text">${this.escapeHtml(item.action || item.name)}</span>
            </div>
            ${item.dueDate ? `<div class="item-due">${this.formatDate(item.dueDate)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
};

GTDApp.prototype.setupTimelineDragDrop = function() {
  const items = document.querySelectorAll('.timeline-item');
  const sections = document.querySelectorAll('.timeline-section-items');

  items.forEach(item => {
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({
        id: item.dataset.id,
        type: item.dataset.type
      }));
      item.classList.add('dragging');
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      sections.forEach(s => s.classList.remove('drag-over'));
    });
  });

  sections.forEach(section => {
    section.addEventListener('dragover', (e) => {
      e.preventDefault();
      section.classList.add('drag-over');
    });

    section.addEventListener('dragleave', () => {
      section.classList.remove('drag-over');
    });

    section.addEventListener('drop', async (e) => {
      e.preventDefault();
      section.classList.remove('drag-over');

      try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        const targetSection = section.dataset.section;

        // Calculate new due date based on section
        let newDueDate = null;
        const today = new Date();

        switch (targetSection) {
          case 'today':
            newDueDate = today.toISOString().split('T')[0];
            break;
          case 'tomorrow':
            today.setDate(today.getDate() + 1);
            newDueDate = today.toISOString().split('T')[0];
            break;
          case 'week':
            today.setDate(today.getDate() + 3);
            newDueDate = today.toISOString().split('T')[0];
            break;
          case 'month':
            today.setDate(today.getDate() + 14);
            newDueDate = today.toISOString().split('T')[0];
            break;
          case 'later':
            today.setMonth(today.getMonth() + 2);
            newDueDate = today.toISOString().split('T')[0];
            break;
          case 'someday':
            newDueDate = null;
            break;
        }

        // Update the item
        if (data.type === 'action') {
          await db.updateAction(data.id, { dueDate: newDueDate });
        } else if (data.type === 'project') {
          await db.updateProject(data.id, { deadline: newDueDate });
        }

        this.showToast('Rescheduled!', 'success');
        await this.showTimeHorizon();

      } catch (e) {
        console.error('Drop error:', e);
      }
    });
  });
};

// =====================================================
// 4. RELATIONSHIP TRACKER (CRM)
// =====================================================

GTDApp.prototype.showRelationships = async function() {
  this.currentView = 'relationships';

  // Hide all views - we'll use a generic container
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

  // Use dashboardView as a generic container for power features
  const container = document.getElementById('dashboardView');
  if (container) {
    container.classList.add('active');
    container.innerHTML = `
      <div class="relationships-view">
        <div class="view-header">
          <h2>👥 Relationships</h2>
          <button class="btn btn-primary" onclick="app.addNewPerson()">+ Add Person</button>
        </div>
        <div class="relationships-container" id="relationshipsContainer">
          <div class="loading">Loading...</div>
        </div>
      </div>
    `;
  }

  try {
    // Get people from team members and waiting for items
    const teamMembers = await db.getTeamMembers() || [];
    const waitingFor = await db.getWaitingFor() || [];

    // Build relationship map
    const peopleMap = new Map();

    teamMembers.forEach(member => {
      peopleMap.set(member.id, {
        ...member,
        waitingFor: [],
        interactionCount: 0
      });
    });

    // Add waiting for items to people
    waitingFor.forEach(item => {
      const personName = item.person || item.targetPerson;
      let person = [...peopleMap.values()].find(p =>
        p.name?.toLowerCase() === personName?.toLowerCase()
      );

      if (!person && personName) {
        // Create virtual person
        const id = 'virtual_' + personName.replace(/\s+/g, '_').toLowerCase();
        person = {
          id,
          name: personName,
          waitingFor: [],
          interactionCount: 0,
          isVirtual: true
        };
        peopleMap.set(id, person);
      }

      if (person) {
        person.waitingFor.push(item);
        person.interactionCount++;
      }
    });

    const people = [...peopleMap.values()].sort((a, b) =>
      (b.waitingFor?.length || 0) - (a.waitingFor?.length || 0)
    );

    const container = document.getElementById('relationshipsContainer');
    if (!container) return;

    if (people.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">👥</span>
          <h3>No relationships yet</h3>
          <p>Add people you work with or delegate tasks to</p>
          <button class="btn btn-primary" onclick="app.addNewPerson()">Add First Person</button>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="people-grid">
        ${people.map(person => `
          <div class="person-card" onclick="app.showPersonDetail('${person.id}')">
            <div class="person-avatar">
              ${person.avatar || person.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div class="person-info">
              <h3>${this.escapeHtml(person.name || 'Unknown')}</h3>
              ${person.role ? `<p class="person-role">${this.escapeHtml(person.role)}</p>` : ''}
              ${person.email ? `<p class="person-email">${this.escapeHtml(person.email)}</p>` : ''}
            </div>
            <div class="person-stats">
              ${person.waitingFor?.length > 0 ? `
                <span class="stat waiting" title="Waiting on ${person.waitingFor.length} items">
                  ⏳ ${person.waitingFor.length}
                </span>
              ` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;

  } catch (e) {
    console.error('Relationships error:', e);
    const container = document.getElementById('dashboardView');
    if (container) container.innerHTML = '<div class="error">Failed to load relationships</div>';
  }
};

GTDApp.prototype.showPersonDetail = async function(personId) {
  const teamMembers = await db.getTeamMembers() || [];
  const waitingFor = await db.getWaitingFor() || [];

  let person = teamMembers.find(m => m.id === personId);

  if (!person && personId.startsWith('virtual_')) {
    const name = personId.replace('virtual_', '').replace(/_/g, ' ');
    person = { id: personId, name, isVirtual: true };
  }

  if (!person) {
    this.showToast('Person not found', 'error');
    return;
  }

  // Get their waiting for items
  const theirWaitingFor = waitingFor.filter(w =>
    (w.person || w.targetPerson)?.toLowerCase() === person.name?.toLowerCase()
  );

  const modal = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  modal.classList.add('active');

  content.innerHTML = `
    <div class="person-detail-modal">
      <div class="modal-header">
        <div class="person-header">
          <div class="person-avatar large">
            ${person.avatar || person.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div>
            <h2>${this.escapeHtml(person.name)}</h2>
            ${person.role ? `<p>${this.escapeHtml(person.role)}</p>` : ''}
          </div>
        </div>
        <button class="modal-close" onclick="app.closeModal()">&times;</button>
      </div>

      <div class="modal-body">
        <div class="person-contact-info">
          ${person.email ? `<div class="contact-item">📧 ${this.escapeHtml(person.email)}</div>` : ''}
          ${person.phone ? `<div class="contact-item">📱 ${this.escapeHtml(person.phone)}</div>` : ''}
        </div>

        ${theirWaitingFor.length > 0 ? `
          <div class="person-section">
            <h4>⏳ Waiting For (${theirWaitingFor.length})</h4>
            <div class="waiting-for-list">
              ${theirWaitingFor.map(w => `
                <div class="waiting-item">
                  <span class="waiting-text">${this.escapeHtml(w.action || w.actionText)}</span>
                  <span class="waiting-date">${this.formatDate(w.delegatedDate || w.createdDate)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : `
          <div class="person-section">
            <p class="no-items">No pending items with ${person.name}</p>
          </div>
        `}

        <div class="person-section">
          <h4>📝 Notes</h4>
          <textarea id="personNotes" class="form-input" rows="4"
            placeholder="Add notes about ${person.name}...">${this.escapeHtml(person.notes || '')}</textarea>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Close</button>
        <button class="btn btn-primary" onclick="app.savePersonNotes('${person.id}')">Save Notes</button>
      </div>
    </div>
  `;
};

GTDApp.prototype.savePersonNotes = async function(personId) {
  const notes = document.getElementById('personNotes').value;

  try {
    await db.updateTeamMember(personId, { notes });
    this.showToast('Notes saved!', 'success');
  } catch (e) {
    console.error('Failed to save notes:', e);
    this.showToast('Failed to save', 'error');
  }
};

GTDApp.prototype.addNewPerson = function() {
  const modal = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  modal.classList.add('active');

  content.innerHTML = `
    <div class="modal-header">
      <h3>Add New Person</h3>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Name *</label>
        <input type="text" id="newPersonName" class="form-input" placeholder="John Smith">
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="newPersonEmail" class="form-input" placeholder="john@example.com">
      </div>
      <div class="form-group">
        <label>Phone</label>
        <input type="tel" id="newPersonPhone" class="form-input" placeholder="+1 555-123-4567">
      </div>
      <div class="form-group">
        <label>Role/Company</label>
        <input type="text" id="newPersonRole" class="form-input" placeholder="Project Manager at Acme">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="app.saveNewPerson()">Add Person</button>
    </div>
  `;

  document.getElementById('newPersonName').focus();
};

GTDApp.prototype.saveNewPerson = async function() {
  const name = document.getElementById('newPersonName').value.trim();
  const email = document.getElementById('newPersonEmail').value.trim();
  const phone = document.getElementById('newPersonPhone').value.trim();
  const role = document.getElementById('newPersonRole').value.trim();

  if (!name) {
    this.showToast('Name is required', 'error');
    return;
  }

  try {
    await db.addTeamMember({ name, email, phone, role });
    this.showToast('Person added!', 'success');
    this.closeModal();
    await this.showRelationships();
  } catch (e) {
    console.error('Failed to add person:', e);
    this.showToast('Failed to add', 'error');
  }
};

// =====================================================
// 5. FOCUS SESSIONS WITH SMART BATCHING
// =====================================================

GTDApp.prototype.showFocusSessions = async function() {
  const modal = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  modal.classList.add('active');

  content.innerHTML = `
    <div class="focus-sessions-modal">
      <div class="modal-header">
        <h3>🎯 Focus Sessions</h3>
        <p class="modal-subtitle">Power through similar tasks in batches</p>
      </div>
      <div class="modal-body">
        <div class="batches-loading">Analyzing your tasks...</div>
      </div>
    </div>
  `;

  try {
    const actions = await db.getNextActions();

    if (actions.length === 0) {
      content.querySelector('.modal-body').innerHTML = `
        <div class="empty-state">
          <p>No actions to batch. Add some tasks first!</p>
          <button class="btn btn-secondary" onclick="app.closeModal()">Close</button>
        </div>
      `;
      return;
    }

    // Group by context
    const batches = {
      phone: { icon: '📞', name: 'Phone Calls', items: [] },
      email: { icon: '📧', name: 'Emails', items: [] },
      computer: { icon: '💻', name: 'Computer Work', items: [] },
      errands: { icon: '🚗', name: 'Errands', items: [] },
      home: { icon: '🏠', name: 'Home Tasks', items: [] },
      office: { icon: '🏢', name: 'Office Tasks', items: [] },
      anywhere: { icon: '📍', name: 'Anywhere', items: [] }
    };

    actions.forEach(action => {
      const contexts = action.contexts || ['@anywhere'];
      contexts.forEach(ctx => {
        const key = ctx.replace('@', '');
        if (batches[key]) {
          batches[key].items.push(action);
        } else {
          batches.anywhere.items.push(action);
        }
      });
    });

    // Filter out empty batches
    const activeBatches = Object.entries(batches).filter(([_, b]) => b.items.length > 0);

    content.querySelector('.modal-body').innerHTML = `
      <div class="batch-list">
        ${activeBatches.map(([key, batch]) => `
          <div class="batch-card" onclick="app.startBatchSession('${key}')">
            <div class="batch-icon">${batch.icon}</div>
            <div class="batch-info">
              <h4>${batch.name}</h4>
              <p>${batch.items.length} task${batch.items.length !== 1 ? 's' : ''}</p>
            </div>
            <div class="batch-arrow">→</div>
          </div>
        `).join('')}
      </div>
      <div class="focus-tip">
        <strong>💡 Tip:</strong> Batching similar tasks reduces context switching and increases productivity!
      </div>
    `;

    this._focusBatches = batches;

  } catch (e) {
    console.error('Focus sessions error:', e);
    content.querySelector('.modal-body').innerHTML = `
      <div class="error">Failed to load batches</div>
    `;
  }
};

GTDApp.prototype.startBatchSession = function(batchKey) {
  const batch = this._focusBatches?.[batchKey];
  if (!batch || batch.items.length === 0) return;

  this._currentBatch = {
    key: batchKey,
    items: [...batch.items],
    currentIndex: 0,
    completed: 0,
    startTime: Date.now()
  };

  this.showBatchTask();
};

GTDApp.prototype.showBatchTask = function() {
  const batch = this._currentBatch;
  if (!batch) return;

  const content = document.getElementById('modalContent');
  const current = batch.items[batch.currentIndex];
  const batchInfo = this._focusBatches[batch.key];

  if (!current) {
    // Session complete!
    const duration = Math.round((Date.now() - batch.startTime) / 1000 / 60);
    content.innerHTML = `
      <div class="batch-complete">
        <div class="complete-icon">🎉</div>
        <h2>Session Complete!</h2>
        <div class="complete-stats">
          <div class="stat">
            <span class="stat-value">${batch.completed}</span>
            <span class="stat-label">Tasks Done</span>
          </div>
          <div class="stat">
            <span class="stat-value">${duration}m</span>
            <span class="stat-label">Time Spent</span>
          </div>
        </div>
        <button class="btn btn-primary" onclick="app.closeModal(); app.renderCurrentView();">
          Done
        </button>
      </div>
    `;
    return;
  }

  const remaining = batch.items.length - batch.currentIndex;
  const elapsed = Math.round((Date.now() - batch.startTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  content.innerHTML = `
    <div class="batch-session">
      <div class="batch-session-header">
        <span class="batch-badge">${batchInfo.icon} ${batchInfo.name}</span>
        <span class="batch-progress">${batch.currentIndex + 1} of ${batch.items.length}</span>
      </div>

      <div class="batch-timer" id="batchTimer">
        ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}
      </div>

      <div class="batch-current-task">
        <div class="task-priority ${current.priority || 'medium'}">${current.priority || 'medium'}</div>
        <h2>${this.escapeHtml(current.action)}</h2>
        ${current.dueDate ? `<p class="task-due">Due: ${this.formatDate(current.dueDate)}</p>` : ''}
      </div>

      <div class="batch-actions">
        <button class="btn btn-success btn-lg" onclick="app.completeBatchTask()">
          ✓ Done
        </button>
        <button class="btn btn-secondary" onclick="app.skipBatchTask()">
          Skip →
        </button>
      </div>

      <div class="batch-footer">
        <span>${remaining} remaining</span>
        <button class="btn btn-link" onclick="app.endBatchSession()">End Session</button>
      </div>
    </div>
  `;

  // Update timer every second
  if (this._batchTimerInterval) clearInterval(this._batchTimerInterval);
  this._batchTimerInterval = setInterval(() => {
    const elapsed = Math.round((Date.now() - batch.startTime) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    const timer = document.getElementById('batchTimer');
    if (timer) {
      timer.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
  }, 1000);
};

GTDApp.prototype.completeBatchTask = async function() {
  const batch = this._currentBatch;
  if (!batch) return;

  const current = batch.items[batch.currentIndex];

  try {
    await db.completeAction(current.id);
    batch.completed++;
    if (window.Haptic) Haptic.success();
  } catch (e) {
    console.error('Failed to complete:', e);
  }

  batch.currentIndex++;
  this.showBatchTask();
};

GTDApp.prototype.skipBatchTask = function() {
  const batch = this._currentBatch;
  if (!batch) return;

  batch.currentIndex++;
  this.showBatchTask();
};

GTDApp.prototype.endBatchSession = function() {
  if (this._batchTimerInterval) {
    clearInterval(this._batchTimerInterval);
  }
  this._currentBatch = null;
  this.closeModal();
  this.renderCurrentView();
};

GTDApp.prototype.startFocusOnTask = function(taskId) {
  // Start a mini focus session on a single task
  this.closeModal();
  this.showToast('Focus mode started!', 'success');
  // Could expand this to show a focus timer overlay
};

// =====================================================
// 6. NATURAL LANGUAGE DATE PARSER
// =====================================================

const NaturalDateParser = {
  parse: function(text) {
    if (!text) return null;

    const lower = text.toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Today
    if (/\btoday\b/.test(lower)) {
      return this.formatDate(today);
    }

    // Tomorrow
    if (/\btomorrow\b/.test(lower)) {
      const d = new Date(today);
      d.setDate(d.getDate() + 1);
      return this.formatDate(d);
    }

    // Yesterday (for reference)
    if (/\byesterday\b/.test(lower)) {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      return this.formatDate(d);
    }

    // Next week
    if (/\bnext week\b/.test(lower)) {
      const d = new Date(today);
      d.setDate(d.getDate() + 7);
      return this.formatDate(d);
    }

    // In X days/weeks/months
    const inMatch = lower.match(/\bin (\d+) (day|days|week|weeks|month|months)\b/);
    if (inMatch) {
      const num = parseInt(inMatch[1]);
      const unit = inMatch[2];
      const d = new Date(today);

      if (unit.startsWith('day')) d.setDate(d.getDate() + num);
      else if (unit.startsWith('week')) d.setDate(d.getDate() + (num * 7));
      else if (unit.startsWith('month')) d.setMonth(d.getMonth() + num);

      return this.formatDate(d);
    }

    // Day names (next Monday, Tuesday, etc.)
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayMatch = lower.match(/\b(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
    if (dayMatch) {
      const isNext = !!dayMatch[1];
      const targetDay = days.indexOf(dayMatch[2]);
      const currentDay = today.getDay();

      let daysToAdd = targetDay - currentDay;
      if (daysToAdd <= 0 || isNext) daysToAdd += 7;
      if (isNext && daysToAdd <= 7) daysToAdd += 7;

      const d = new Date(today);
      d.setDate(d.getDate() + daysToAdd);
      return this.formatDate(d);
    }

    // End of week (Friday)
    if (/\bend of week\b|\beow\b/.test(lower)) {
      const d = new Date(today);
      const daysUntilFriday = (5 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + daysUntilFriday);
      return this.formatDate(d);
    }

    // End of month
    if (/\bend of month\b|\beom\b/.test(lower)) {
      const d = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return this.formatDate(d);
    }

    // Specific date formats: Jan 15, January 15, 1/15, 01/15
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthMatch = lower.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/);
    if (monthMatch) {
      const month = monthNames.indexOf(monthMatch[1]);
      const day = parseInt(monthMatch[2]);
      const year = today.getFullYear();
      const d = new Date(year, month, day);
      if (d < today) d.setFullYear(year + 1);
      return this.formatDate(d);
    }

    // Numeric date: 1/15 or 01/15
    const numericMatch = lower.match(/\b(\d{1,2})\/(\d{1,2})\b/);
    if (numericMatch) {
      const month = parseInt(numericMatch[1]) - 1;
      const day = parseInt(numericMatch[2]);
      const year = today.getFullYear();
      const d = new Date(year, month, day);
      if (d < today) d.setFullYear(year + 1);
      return this.formatDate(d);
    }

    return null;
  },

  formatDate: function(date) {
    return date.toISOString().split('T')[0];
  },

  // Extract date and clean text
  extractFromText: function(text) {
    const date = this.parse(text);
    if (!date) return { text, date: null };

    // Remove date phrases from text
    let cleaned = text
      .replace(/\b(by |due |on |before )?(today|tomorrow|yesterday)\b/gi, '')
      .replace(/\b(by |due |on |before )?next week\b/gi, '')
      .replace(/\b(by |due |on |before )?in \d+ (day|days|week|weeks|month|months)\b/gi, '')
      .replace(/\b(by |due |on |before )?(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
      .replace(/\b(by |due |on |before )?(end of week|eow|end of month|eom)\b/gi, '')
      .replace(/\b(by |due |on |before )?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b/gi, '')
      .replace(/\b(by |due |on |before )?\d{1,2}\/\d{1,2}\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    return { text: cleaned, date };
  }
};

window.NaturalDateParser = NaturalDateParser;

// Enhanced capture that parses natural language dates
GTDApp.prototype.smartCapture = async function(text) {
  const { text: cleanedText, date } = NaturalDateParser.extractFromText(text);

  // If date found, show confirmation
  if (date) {
    const formatted = new Date(date).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric'
    });
    this.showToast(`Due date detected: ${formatted}`, 'info');
  }

  return { text: cleanedText, dueDate: date };
};

// =====================================================
// 7. WEEKLY REVIEW WIZARD
// =====================================================

GTDApp.prototype.showWeeklyReview = async function() {
  this._reviewState = {
    step: 0,
    stats: {},
    stuckProjects: [],
    staleWaitingFor: [],
    inboxCount: 0,
    completedThisWeek: 0
  };

  const modal = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  modal.classList.add('active');

  content.innerHTML = `
    <div class="weekly-review-wizard">
      <div class="review-loading">
        <div class="loading-spinner">🔄</div>
        <p>Analyzing your GTD system...</p>
      </div>
    </div>
  `;

  // Gather data
  try {
    const [inbox, actions, projects, waitingFor, archive] = await Promise.all([
      db.getInboxItems(),
      db.getNextActions(),
      db.getProjects(),
      db.getWaitingFor(),
      db.getArchive ? db.getArchive() : []
    ]);

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    // Stats
    this._reviewState.inboxCount = inbox.length;
    this._reviewState.totalActions = actions.length;
    this._reviewState.totalProjects = projects.filter(p => p.status === 'active').length;
    this._reviewState.totalWaitingFor = waitingFor.length;

    // Completed this week
    this._reviewState.completedThisWeek = archive.filter(item => {
      const completed = new Date(item.completedDate || item.archivedDate);
      return completed >= oneWeekAgo;
    }).length;

    // Stuck projects (no actions)
    const projectsWithActions = new Set(actions.map(a => a.projectId).filter(Boolean));
    this._reviewState.stuckProjects = projects.filter(p =>
      p.status === 'active' && !projectsWithActions.has(p.id)
    );

    // Stale waiting for (older than 2 weeks)
    this._reviewState.staleWaitingFor = waitingFor.filter(w => {
      const created = new Date(w.delegatedDate || w.createdDate || w._created);
      return created < twoWeeksAgo;
    });

    // Overdue actions
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this._reviewState.overdueActions = actions.filter(a => {
      if (!a.dueDate) return false;
      return new Date(a.dueDate) < today;
    });

    // Start the wizard
    this.showReviewStep(0);

  } catch (e) {
    console.error('Weekly review error:', e);
    content.innerHTML = `<div class="error">Failed to load data</div>`;
  }
};

GTDApp.prototype.showReviewStep = function(step) {
  this._reviewState.step = step;
  const state = this._reviewState;
  const content = document.getElementById('modalContent');

  const steps = [
    // Step 0: Welcome & Stats
    () => `
      <div class="weekly-review-wizard">
        <div class="review-step">
          <div class="review-header">
            <span class="review-icon">📊</span>
            <h2>Weekly Review</h2>
            <p>Let's review your GTD system and get clarity</p>
          </div>

          <div class="review-stats-grid">
            <div class="review-stat">
              <span class="stat-number">${state.completedThisWeek}</span>
              <span class="stat-label">Completed This Week</span>
            </div>
            <div class="review-stat ${state.inboxCount > 0 ? 'warning' : 'success'}">
              <span class="stat-number">${state.inboxCount}</span>
              <span class="stat-label">Inbox Items</span>
            </div>
            <div class="review-stat">
              <span class="stat-number">${state.totalActions}</span>
              <span class="stat-label">Next Actions</span>
            </div>
            <div class="review-stat">
              <span class="stat-number">${state.totalProjects}</span>
              <span class="stat-label">Active Projects</span>
            </div>
          </div>

          ${state.completedThisWeek > 0 ? `
            <div class="review-celebration">
              🎉 Great job completing ${state.completedThisWeek} task${state.completedThisWeek !== 1 ? 's' : ''} this week!
            </div>
          ` : ''}

          <div class="review-actions">
            <button class="btn btn-secondary" onclick="app.closeModal()">Maybe Later</button>
            <button class="btn btn-primary" onclick="app.showReviewStep(1)">Start Review →</button>
          </div>
        </div>
      </div>
    `,

    // Step 1: Inbox Zero Check
    () => `
      <div class="weekly-review-wizard">
        <div class="review-step">
          <div class="review-progress">
            <div class="progress-bar" style="width: 20%"></div>
          </div>
          <div class="review-header">
            <span class="review-icon">📥</span>
            <h2>Inbox Zero</h2>
          </div>

          ${state.inboxCount === 0 ? `
            <div class="review-success">
              <span class="success-icon">✅</span>
              <h3>Inbox Zero Achieved!</h3>
              <p>Your inbox is clear. Great job staying on top of things!</p>
            </div>
          ` : `
            <div class="review-warning">
              <span class="warning-icon">⚠️</span>
              <h3>${state.inboxCount} Items Need Processing</h3>
              <p>Process or clarify these items to achieve Inbox Zero.</p>
              <button class="btn btn-secondary" onclick="app.closeModal(); app.showView('inbox');">
                Go to Inbox
              </button>
            </div>
          `}

          <div class="review-actions">
            <button class="btn btn-secondary" onclick="app.showReviewStep(0)">← Back</button>
            <button class="btn btn-primary" onclick="app.showReviewStep(2)">Continue →</button>
          </div>
        </div>
      </div>
    `,

    // Step 2: Stuck Projects
    () => `
      <div class="weekly-review-wizard">
        <div class="review-step">
          <div class="review-progress">
            <div class="progress-bar" style="width: 40%"></div>
          </div>
          <div class="review-header">
            <span class="review-icon">📁</span>
            <h2>Stuck Projects</h2>
          </div>

          ${state.stuckProjects.length === 0 ? `
            <div class="review-success">
              <span class="success-icon">✅</span>
              <h3>All Projects Have Next Actions!</h3>
              <p>Every active project has at least one next action defined.</p>
            </div>
          ` : `
            <div class="review-warning">
              <span class="warning-icon">🚧</span>
              <h3>${state.stuckProjects.length} Project${state.stuckProjects.length !== 1 ? 's' : ''} Without Next Actions</h3>
              <p>These projects need a clear next action to move forward:</p>
              <div class="stuck-projects-list">
                ${state.stuckProjects.slice(0, 5).map(p => `
                  <div class="stuck-project-item">
                    <span class="project-name">${this.escapeHtml(p.name)}</span>
                    <button class="btn btn-sm btn-secondary" onclick="app.quickAddActionToProject('${p.id}', '${this.escapeHtml(p.name)}')">
                      + Add Action
                    </button>
                  </div>
                `).join('')}
                ${state.stuckProjects.length > 5 ? `<p class="more-items">...and ${state.stuckProjects.length - 5} more</p>` : ''}
              </div>
            </div>
          `}

          <div class="review-actions">
            <button class="btn btn-secondary" onclick="app.showReviewStep(1)">← Back</button>
            <button class="btn btn-primary" onclick="app.showReviewStep(3)">Continue →</button>
          </div>
        </div>
      </div>
    `,

    // Step 3: Stale Waiting For
    () => `
      <div class="weekly-review-wizard">
        <div class="review-step">
          <div class="review-progress">
            <div class="progress-bar" style="width: 60%"></div>
          </div>
          <div class="review-header">
            <span class="review-icon">⏳</span>
            <h2>Stale Waiting For</h2>
          </div>

          ${state.staleWaitingFor.length === 0 ? `
            <div class="review-success">
              <span class="success-icon">✅</span>
              <h3>No Stale Items!</h3>
              <p>All your waiting-for items are recent. Good follow-up!</p>
            </div>
          ` : `
            <div class="review-warning">
              <span class="warning-icon">📞</span>
              <h3>${state.staleWaitingFor.length} Item${state.staleWaitingFor.length !== 1 ? 's' : ''} Need Follow-up</h3>
              <p>These have been waiting for over 2 weeks:</p>
              <div class="stale-items-list">
                ${state.staleWaitingFor.slice(0, 5).map(w => `
                  <div class="stale-item">
                    <span class="item-person">${this.escapeHtml(w.person || w.targetPerson || 'Someone')}</span>
                    <span class="item-action">${this.escapeHtml(w.action || w.actionText || '')}</span>
                    <span class="item-date">${this.formatDate(w.delegatedDate || w.createdDate)}</span>
                  </div>
                `).join('')}
              </div>
              <button class="btn btn-secondary" onclick="app.closeModal(); app.showView('waiting');">
                Review Waiting For
              </button>
            </div>
          `}

          <div class="review-actions">
            <button class="btn btn-secondary" onclick="app.showReviewStep(2)">← Back</button>
            <button class="btn btn-primary" onclick="app.showReviewStep(4)">Continue →</button>
          </div>
        </div>
      </div>
    `,

    // Step 4: Overdue Actions
    () => `
      <div class="weekly-review-wizard">
        <div class="review-step">
          <div class="review-progress">
            <div class="progress-bar" style="width: 80%"></div>
          </div>
          <div class="review-header">
            <span class="review-icon">🔴</span>
            <h2>Overdue Actions</h2>
          </div>

          ${state.overdueActions.length === 0 ? `
            <div class="review-success">
              <span class="success-icon">✅</span>
              <h3>Nothing Overdue!</h3>
              <p>All your deadlines are on track. Keep it up!</p>
            </div>
          ` : `
            <div class="review-warning">
              <span class="warning-icon">🚨</span>
              <h3>${state.overdueActions.length} Overdue Action${state.overdueActions.length !== 1 ? 's' : ''}</h3>
              <p>These tasks need attention:</p>
              <div class="overdue-items-list">
                ${state.overdueActions.slice(0, 5).map(a => `
                  <div class="overdue-item">
                    <span class="item-action">${this.escapeHtml(a.action)}</span>
                    <span class="item-date overdue">Due ${this.formatDate(a.dueDate)}</span>
                  </div>
                `).join('')}
              </div>
              <button class="btn btn-secondary" onclick="app.closeModal(); app.showTimeHorizon();">
                View Timeline
              </button>
            </div>
          `}

          <div class="review-actions">
            <button class="btn btn-secondary" onclick="app.showReviewStep(3)">← Back</button>
            <button class="btn btn-primary" onclick="app.showReviewStep(5)">Continue →</button>
          </div>
        </div>
      </div>
    `,

    // Step 5: Complete!
    () => {
      const issues =
        (state.inboxCount > 0 ? 1 : 0) +
        (state.stuckProjects.length > 0 ? 1 : 0) +
        (state.staleWaitingFor.length > 0 ? 1 : 0) +
        (state.overdueActions.length > 0 ? 1 : 0);

      return `
        <div class="weekly-review-wizard">
          <div class="review-step">
            <div class="review-progress">
              <div class="progress-bar" style="width: 100%"></div>
            </div>
            <div class="review-header">
              <span class="review-icon">🎉</span>
              <h2>Review Complete!</h2>
            </div>

            <div class="review-summary">
              ${issues === 0 ? `
                <div class="review-success large">
                  <span class="success-icon">🌟</span>
                  <h3>Your GTD System is in Great Shape!</h3>
                  <p>Inbox zero, all projects moving, nothing overdue. You're crushing it!</p>
                </div>
              ` : `
                <div class="review-summary-stats">
                  <h3>Summary</h3>
                  <ul>
                    <li class="${state.inboxCount === 0 ? 'done' : 'pending'}">
                      ${state.inboxCount === 0 ? '✅' : '⚠️'} Inbox: ${state.inboxCount} items
                    </li>
                    <li class="${state.stuckProjects.length === 0 ? 'done' : 'pending'}">
                      ${state.stuckProjects.length === 0 ? '✅' : '⚠️'} Stuck Projects: ${state.stuckProjects.length}
                    </li>
                    <li class="${state.staleWaitingFor.length === 0 ? 'done' : 'pending'}">
                      ${state.staleWaitingFor.length === 0 ? '✅' : '⚠️'} Stale Waiting For: ${state.staleWaitingFor.length}
                    </li>
                    <li class="${state.overdueActions.length === 0 ? 'done' : 'pending'}">
                      ${state.overdueActions.length === 0 ? '✅' : '⚠️'} Overdue: ${state.overdueActions.length}
                    </li>
                  </ul>
                </div>
              `}

              <div class="review-next-actions">
                <h4>Set Your Intentions</h4>
                <p>What's the most important thing you'll accomplish this week?</p>
                <input type="text" id="weeklyIntention" class="form-input" placeholder="My #1 priority this week...">
              </div>
            </div>

            <div class="review-actions">
              <button class="btn btn-secondary" onclick="app.showReviewStep(4)">← Back</button>
              <button class="btn btn-primary" onclick="app.completeWeeklyReview()">Done! 🎉</button>
            </div>
          </div>
        </div>
      `;
    }
  ];

  content.innerHTML = steps[step]();
};

GTDApp.prototype.quickAddActionToProject = function(projectId, projectName) {
  const action = prompt(`Add next action for "${projectName}":`);
  if (action && action.trim()) {
    db.addNextAction({
      action: action.trim(),
      projectId: projectId,
      contexts: ['@anywhere'],
      priority: 'medium'
    }).then(() => {
      this.showToast('Action added!', 'success');
      // Remove from stuck list
      this._reviewState.stuckProjects = this._reviewState.stuckProjects.filter(p => p.id !== projectId);
      this.showReviewStep(2);
    });
  }
};

GTDApp.prototype.completeWeeklyReview = function() {
  const intention = document.getElementById('weeklyIntention')?.value?.trim();

  if (intention) {
    // Save intention as a high priority action due today
    db.addNextAction({
      action: `🎯 Weekly Focus: ${intention}`,
      contexts: ['@anywhere'],
      priority: 'high',
      dueDate: new Date().toISOString().split('T')[0]
    });
  }

  this.closeModal();
  this.showToast('Weekly review complete! 🎉', 'success');
  this.renderCurrentView();
};

// =====================================================
// NAVIGATION INTEGRATION
// =====================================================

// Add power features to the app nav
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    // Add quick action buttons to sidebar header
    const header = document.querySelector('.sidebar-header');
    if (header && !document.getElementById('powerButtons')) {
      const powerBtns = document.createElement('div');
      powerBtns.id = 'powerButtons';
      powerBtns.className = 'power-buttons';
      powerBtns.innerHTML = `
        <button class="power-btn" onclick="app.showBrainDump()" title="Brain Dump">🧠</button>
        <button class="power-btn" onclick="app.showWhatNext()" title="What Next?">🎯</button>
        <button class="power-btn" onclick="app.showFocusSessions()" title="Focus Sessions">⚡</button>
      `;
      header.appendChild(powerBtns);
    }

    // Also add nav items for Timeline and Relationships
    const nav = document.querySelector('.sidebar-nav');
    if (nav && !document.getElementById('powerNavItems')) {
      const powerNav = document.createElement('div');
      powerNav.id = 'powerNavItems';
      powerNav.innerHTML = `
        <div class="nav-section-label">POWER TOOLS</div>
        <div class="nav-item" onclick="app.showTimeHorizon()">
          <div class="nav-item-left">
            <span class="nav-icon">⏳</span>
            <span>Timeline</span>
          </div>
        </div>
        <div class="nav-item" onclick="app.showRelationships()">
          <div class="nav-item-left">
            <span class="nav-icon">👥</span>
            <span>Relationships</span>
          </div>
        </div>
        <div class="nav-item" onclick="app.showWeeklyReview()">
          <div class="nav-item-left">
            <span class="nav-icon">📋</span>
            <span>Weekly Review</span>
          </div>
        </div>
      `;
      nav.appendChild(powerNav);
    }
  }, 1000);
});

console.log('Power features loaded!');
