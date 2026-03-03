// features.js - New Features for GTD Capture
// Kanban Board, Pomodoro Timer, Habit Tracker, Productivity Dashboard,
// Project Timeline, Zen Mode, Achievement System, Swipe Gestures,
// Smart Weekly Review, AI Auto-categorization, Enhanced NLP

// =====================================================
// 0. HAPTIC FEEDBACK FOR MOBILE
// =====================================================

// Haptic feedback utility
const Haptic = {
  // Light tap - for selections, toggles
  light: function() {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  },

  // Medium tap - for button presses, confirmations
  medium: function() {
    if ('vibrate' in navigator) {
      navigator.vibrate(25);
    }
  },

  // Heavy tap - for important actions, long press activation
  heavy: function() {
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  },

  // Success pattern - for completed actions
  success: function() {
    if ('vibrate' in navigator) {
      navigator.vibrate([30, 50, 30]);
    }
  },

  // Error pattern - for failures
  error: function() {
    if ('vibrate' in navigator) {
      navigator.vibrate([50, 30, 50, 30, 50]);
    }
  },

  // Warning pattern
  warning: function() {
    if ('vibrate' in navigator) {
      navigator.vibrate([30, 20, 30]);
    }
  }
};

// Make it available globally
window.Haptic = Haptic;

// Hook into showToast to add haptic feedback
const originalShowToast = GTDApp.prototype.showToast;
GTDApp.prototype.showToast = function(message, type = 'info') {
  // Add haptic based on toast type
  if (type === 'success') {
    Haptic.success();
  } else if (type === 'error') {
    Haptic.error();
  } else if (type === 'warning') {
    Haptic.warning();
  }

  // Call original
  return originalShowToast.call(this, message, type);
};

// Add haptic to button clicks
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button, .btn');
  if (btn) {
    if (btn.classList.contains('btn-primary')) {
      Haptic.medium();
    } else if (btn.classList.contains('btn-danger') || btn.classList.contains('danger')) {
      Haptic.heavy();
    } else {
      Haptic.light();
    }
  }
}, true);


// =====================================================
// 1. KANBAN BOARD VIEW FOR NEXT ACTIONS
// =====================================================

GTDApp.prototype.kanbanMode = false;

GTDApp.prototype.toggleKanbanView = function() {
  this.kanbanMode = !this.kanbanMode;
  localStorage.setItem('gtd_kanban_mode', this.kanbanMode);
  this.renderCurrentView();
};

GTDApp.prototype.renderKanbanBoard = async function() {
  const container = document.getElementById('nextActionsList');
  if (!container) return;

  let actions;
  try {
    actions = await db.getAvailableActions();
  } catch (e) {
    container.innerHTML = '<div class="error-state"><p>Failed to load actions</p></div>';
    return;
  }

  actions = (actions || []).filter(a => !a.completed);

  if (actions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 11L12 14L22 4M21 12V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3H16"/>
        </svg>
        <h3>No Actions Yet</h3>
        <p>Process items from your inbox to create next actions</p>
      </div>`;
    return;
  }

  // Group by priority for kanban columns
  const columns = {
    high: { label: 'High Priority', color: '#ff3b30', items: [] },
    medium: { label: 'Medium Priority', color: '#ff9500', items: [] },
    low: { label: 'Low Priority', color: '#34c759', items: [] }
  };

  for (const action of actions) {
    const p = action.priority || 'medium';
    if (columns[p]) columns[p].items.push(action);
  }

  let html = '<div class="kanban-board">';

  for (const [key, col] of Object.entries(columns)) {
    html += `
      <div class="kanban-column" data-priority="${key}"
           ondragover="event.preventDefault(); this.classList.add('drag-over')"
           ondragleave="this.classList.remove('drag-over')"
           ondrop="app.handleKanbanDrop(event, '${key}'); this.classList.remove('drag-over')">
        <div class="kanban-column-header">
          <span class="kanban-column-dot" style="background:${col.color}"></span>
          <h3>${col.label}</h3>
          <span class="kanban-count">${col.items.length}</span>
        </div>
        <div class="kanban-cards">
          ${col.items.map(item => this.renderKanbanCard(item)).join('')}
        </div>
      </div>`;
  }

  html += '</div>';
  container.innerHTML = html;
};

GTDApp.prototype.renderKanbanCard = function(item) {
  const contexts = item.contexts || [];
  const dueDateInfo = this.getDueDateInfo(item.dueDate);

  return `
    <div class="kanban-card ${dueDateInfo.class || ''}" data-id="${item.id}" data-type="action"
         draggable="true" ondragstart="app.handleDragStart(event)" ondragend="app.handleDragEnd(event)">
      <div class="kanban-card-content">${this.escapeHtml(item.action)}</div>
      <div class="kanban-card-meta">
        ${dueDateInfo.display ? `<span class="due-date-tag ${dueDateInfo.class}">${dueDateInfo.display}</span>` : ''}
        ${contexts.map(c => `<span class="context-pill small">${this.escapeHtml(c)}</span>`).join('')}
      </div>
      <div class="kanban-card-actions">
        <button class="btn-icon small" onclick="app.completeAction('${item.id}')" title="Complete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M5 13L9 17L19 7"/>
          </svg>
        </button>
        <button class="btn-icon small" onclick="app.startPomodoro('${item.id}', '${this.escapeHtml(item.action).replace(/'/g, "\\'")}')" title="Start Pomodoro">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </button>
      </div>
    </div>`;
};

GTDApp.prototype.handleKanbanDrop = async function(event, newPriority) {
  event.preventDefault();
  try {
    const data = JSON.parse(event.dataTransfer.getData('text/plain'));
    if (data.type === 'action') {
      await db.updateAction(data.id, { priority: newPriority });
      this.showToast(`Moved to ${newPriority} priority`, 'success');
      await this.renderKanbanBoard();
    }
  } catch (e) {
    console.error('Kanban drop error:', e);
  }
};


// =====================================================
// 2. DARK/LIGHT THEME TOGGLE (FLOATING)
// =====================================================

GTDApp.prototype.initThemeToggle = function() {
  // Create floating theme toggle button
  if (document.getElementById('themeToggleFloat')) return;

  const btn = document.createElement('button');
  btn.id = 'themeToggleFloat';
  btn.className = 'theme-toggle-float';
  btn.title = 'Toggle theme';
  btn.innerHTML = `
    <svg class="theme-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
      <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
    <svg class="theme-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>`;

  btn.onclick = () => {
    const current = localStorage.getItem('gtd_theme') || 'system';
    const next = current === 'dark' ? 'light' : 'dark';
    this.applyTheme(next);
    this.updateThemeToggleIcon();
  };

  document.body.appendChild(btn);
  this.updateThemeToggleIcon();
};

GTDApp.prototype.updateThemeToggleIcon = function() {
  const btn = document.getElementById('themeToggleFloat');
  if (!btn) return;

  const theme = localStorage.getItem('gtd_theme') || 'system';
  const isDark = theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  btn.classList.toggle('is-dark', isDark);
};


// =====================================================
// 3. ANIMATED PROJECT PROGRESS RINGS
// =====================================================

GTDApp.prototype._originalRenderProjectCard = GTDApp.prototype.renderProjectCard;

GTDApp.prototype.renderProjectCard = function(project) {
  const statusClass = project.status === 'active' ? 'active' :
                      project.status === 'on-hold' ? 'on-hold' : 'completed';
  const progressPercent = project.progress || 0;
  const circumference = 2 * Math.PI * 36; // radius = 36
  const dashoffset = circumference - (progressPercent / 100) * circumference;

  const ringColor = progressPercent >= 100 ? '#34c759' :
                    progressPercent >= 60  ? '#007aff' :
                    progressPercent >= 30  ? '#ff9500' : '#ff3b30';

  return `
    <div class="project-card ${statusClass} has-ring" data-id="${project.id}">
      <div class="project-card-header">
        <div class="project-status-badge ${statusClass}">${project.status}</div>
        <div class="project-ring-container">
          <svg class="progress-ring" viewBox="0 0 80 80" width="56" height="56">
            <circle class="progress-ring-bg" cx="40" cy="40" r="36" fill="none" stroke="var(--color-border-light)" stroke-width="4"/>
            <circle class="progress-ring-fill" cx="40" cy="40" r="36" fill="none"
              stroke="${ringColor}" stroke-width="4" stroke-linecap="round"
              stroke-dasharray="${circumference}" stroke-dashoffset="${dashoffset}"
              transform="rotate(-90 40 40)"
              style="transition: stroke-dashoffset 1s ease-out;"/>
            <text x="40" y="40" text-anchor="middle" dominant-baseline="central"
              fill="var(--color-text)" font-size="14" font-weight="600">${progressPercent}%</text>
          </svg>
        </div>
        <div class="project-actions-menu">
          <button class="btn-icon" onclick="app.showProjectMenu('${project.id}')" title="More options">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle>
            </svg>
          </button>
        </div>
      </div>
      <h3 class="project-title" onclick="app.viewProject('${project.id}')">${this.escapeHtml(project.name)}</h3>
      ${project.description ? `<p class="project-description">${this.escapeHtml(this.truncate(project.description, 100))}</p>` : ''}
      ${project.category ? `<span class="project-category">${this.escapeHtml(project.category)}</span>` : ''}
      <div class="project-meta">
        <span>Created ${this.formatDate(project.created)}</span>
        ${project.dueDate ? `<span class="due-date">Due ${this.formatDate(project.dueDate)}</span>` : ''}
      </div>
    </div>`;
};


// =====================================================
// 4. MOBILE SWIPE GESTURES
// =====================================================

GTDApp.prototype.initSwipeGestures = function() {
  let startX = 0, startY = 0, currentX = 0, swiping = false, swipeTarget = null;

  document.addEventListener('touchstart', (e) => {
    const item = e.target.closest('.action-item, .inbox-item, .waiting-item');
    if (!item) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    currentX = startX;
    swiping = false;
    swipeTarget = item;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!swipeTarget) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    // Only swipe horizontally
    if (!swiping && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      swiping = true;
    }

    if (swiping) {
      currentX = e.touches[0].clientX;
      const offset = Math.max(-120, Math.min(120, dx));
      swipeTarget.style.transform = `translateX(${offset}px)`;
      swipeTarget.style.transition = 'none';

      // Show action hints
      if (offset > 50) {
        swipeTarget.classList.add('swipe-right-hint');
        swipeTarget.classList.remove('swipe-left-hint');
      } else if (offset < -50) {
        swipeTarget.classList.add('swipe-left-hint');
        swipeTarget.classList.remove('swipe-right-hint');
      } else {
        swipeTarget.classList.remove('swipe-right-hint', 'swipe-left-hint');
      }
    }
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (!swipeTarget || !swiping) {
      if (swipeTarget) {
        swipeTarget.style.transform = '';
        swipeTarget.style.transition = '';
      }
      swipeTarget = null;
      return;
    }

    const dx = currentX - startX;
    swipeTarget.style.transition = 'transform 0.3s ease';

    if (dx > 80) {
      // Swipe right = complete
      const id = swipeTarget.dataset.id;
      swipeTarget.style.transform = 'translateX(100%)';
      swipeTarget.style.opacity = '0';
      setTimeout(() => {
        if (swipeTarget.classList.contains('action-item')) {
          this.completeAction(id);
        } else if (swipeTarget.classList.contains('inbox-item')) {
          this.archiveInboxItem(id);
        }
      }, 300);
    } else if (dx < -80) {
      // Swipe left = defer/delete
      const id = swipeTarget.dataset.id;
      swipeTarget.style.transform = 'translateX(-100%)';
      swipeTarget.style.opacity = '0';
      setTimeout(() => {
        if (swipeTarget.classList.contains('action-item')) {
          this.deferAction(id);
        } else {
          this.deleteInboxItem(id);
        }
      }, 300);
    } else {
      swipeTarget.style.transform = 'translateX(0)';
    }

    swipeTarget.classList.remove('swipe-right-hint', 'swipe-left-hint');
    swipeTarget = null;
    swiping = false;
  }, { passive: true });
};

GTDApp.prototype.deferAction = async function(id) {
  // Move to someday/maybe
  try {
    const action = await db.getAction(id);
    if (action) {
      await db.addToSomedayMaybe({
        content: action.action,
        originalTimestamp: action.originalTimestamp,
        created: new Date().toISOString()
      });
      await db.deleteAction(id);
      this.showToast('Deferred to Someday/Maybe', 'info');
      await this.renderCurrentView();
      await this.updateCounts();
    }
  } catch (e) {
    console.error('Defer action error:', e);
  }
};


// =====================================================
// 5. POMODORO TIMER
// =====================================================

GTDApp.prototype.pomodoroState = {
  active: false,
  taskId: null,
  taskName: '',
  timeLeft: 25 * 60,
  totalTime: 25 * 60,
  isBreak: false,
  sessionsCompleted: 0,
  interval: null
};

GTDApp.prototype.startPomodoro = function(taskId, taskName) {
  const state = this.pomodoroState;
  state.active = true;
  state.taskId = taskId;
  state.taskName = taskName || 'Focus Session';
  state.timeLeft = 25 * 60;
  state.totalTime = 25 * 60;
  state.isBreak = false;

  this.showPomodoroOverlay();
  this.tickPomodoro();
};

GTDApp.prototype.tickPomodoro = function() {
  const state = this.pomodoroState;
  if (state.interval) clearInterval(state.interval);

  state.interval = setInterval(() => {
    state.timeLeft--;
    this.updatePomodoroDisplay();

    if (state.timeLeft <= 0) {
      clearInterval(state.interval);
      this.pomodoroComplete();
    }
  }, 1000);
};

GTDApp.prototype.pomodoroComplete = function() {
  const state = this.pomodoroState;

  if (!state.isBreak) {
    state.sessionsCompleted++;
    this.trackAchievement('pomodoro_complete');

    // Play a sound or vibrate
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

    // Start break
    state.isBreak = true;
    state.timeLeft = state.sessionsCompleted % 4 === 0 ? 15 * 60 : 5 * 60;
    state.totalTime = state.timeLeft;
    this.showToast(`Pomodoro #${state.sessionsCompleted} complete! Take a break.`, 'success');
    this.tickPomodoro();
  } else {
    state.isBreak = false;
    state.timeLeft = 25 * 60;
    state.totalTime = 25 * 60;
    this.showToast('Break over! Ready for another session?', 'info');
    clearInterval(state.interval);
    this.updatePomodoroDisplay();
  }
};

GTDApp.prototype.showPomodoroOverlay = function() {
  let overlay = document.getElementById('pomodoroOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'pomodoroOverlay';
    overlay.className = 'pomodoro-overlay';
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div class="pomodoro-container">
      <button class="pomodoro-close" onclick="app.stopPomodoro()">&times;</button>
      <div class="pomodoro-label" id="pomodoroLabel">${this.pomodoroState.isBreak ? 'Break Time' : 'Focus Mode'}</div>
      <div class="pomodoro-task" id="pomodoroTask">${this.escapeHtml(this.pomodoroState.taskName)}</div>
      <div class="pomodoro-timer-ring">
        <svg viewBox="0 0 200 200" width="200" height="200">
          <circle cx="100" cy="100" r="90" fill="none" stroke="var(--color-bg-tertiary)" stroke-width="6"/>
          <circle id="pomodoroRing" cx="100" cy="100" r="90" fill="none"
            stroke="${this.pomodoroState.isBreak ? '#34c759' : '#ff3b30'}"
            stroke-width="6" stroke-linecap="round"
            stroke-dasharray="${2 * Math.PI * 90}"
            stroke-dashoffset="0"
            transform="rotate(-90 100 100)"/>
        </svg>
        <div class="pomodoro-time" id="pomodoroTime">${this.formatPomodoroTime(this.pomodoroState.timeLeft)}</div>
      </div>
      <div class="pomodoro-sessions">
        Session ${this.pomodoroState.sessionsCompleted + (this.pomodoroState.isBreak ? 0 : 1)}
        ${[1,2,3,4].map((_, i) => `<span class="pomo-dot ${i < this.pomodoroState.sessionsCompleted % 4 ? 'filled' : ''}"></span>`).join('')}
      </div>
      <div class="pomodoro-controls">
        <button class="btn btn-secondary" onclick="app.pausePomodoro()" id="pomodoroPauseBtn">Pause</button>
        <button class="btn btn-primary" onclick="app.skipPomodoro()">Skip</button>
      </div>
    </div>`;

  overlay.classList.add('active');
  this.updatePomodoroDisplay();
};

GTDApp.prototype.updatePomodoroDisplay = function() {
  const timeEl = document.getElementById('pomodoroTime');
  const ringEl = document.getElementById('pomodoroRing');
  const labelEl = document.getElementById('pomodoroLabel');

  if (!timeEl) return;

  const state = this.pomodoroState;
  timeEl.textContent = this.formatPomodoroTime(state.timeLeft);

  if (labelEl) {
    labelEl.textContent = state.isBreak ? 'Break Time' : 'Focus Mode';
  }

  if (ringEl) {
    const circumference = 2 * Math.PI * 90;
    const progress = 1 - (state.timeLeft / state.totalTime);
    ringEl.setAttribute('stroke-dashoffset', circumference * progress);
    ringEl.setAttribute('stroke', state.isBreak ? '#34c759' : '#ff3b30');
  }
};

GTDApp.prototype.formatPomodoroTime = function(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

GTDApp.prototype.pausePomodoro = function() {
  const state = this.pomodoroState;
  const btn = document.getElementById('pomodoroPauseBtn');

  if (state.interval) {
    clearInterval(state.interval);
    state.interval = null;
    if (btn) btn.textContent = 'Resume';
  } else {
    this.tickPomodoro();
    if (btn) btn.textContent = 'Pause';
  }
};

GTDApp.prototype.skipPomodoro = function() {
  this.pomodoroState.timeLeft = 0;
};

GTDApp.prototype.stopPomodoro = function() {
  const state = this.pomodoroState;
  clearInterval(state.interval);
  state.active = false;
  state.interval = null;

  const overlay = document.getElementById('pomodoroOverlay');
  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 300);
  }
};


// =====================================================
// 6. HABIT TRACKER WITH STREAK VISUALIZATION
// =====================================================

GTDApp.prototype.renderHabitsView = async function() {
  const container = document.getElementById('habitsContent');
  if (!container) return;

  let habits = JSON.parse(localStorage.getItem('gtd_habits') || '[]');

  let html = `
    <div class="habits-header">
      <h3>Daily Habits</h3>
      <button class="btn btn-primary btn-sm" onclick="app.showAddHabitModal()">+ New Habit</button>
    </div>`;

  if (habits.length === 0) {
    html += `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
        <h3>No Habits Yet</h3>
        <p>Build powerful routines by tracking daily habits</p>
      </div>`;
  } else {
    const today = new Date().toISOString().split('T')[0];

    html += '<div class="habits-list">';
    for (const habit of habits) {
      const streak = this.calculateStreak(habit);
      const completedToday = (habit.completions || []).includes(today);
      const last7Days = this.getLast7Days();

      html += `
        <div class="habit-card ${completedToday ? 'completed-today' : ''}">
          <div class="habit-main">
            <button class="habit-check ${completedToday ? 'checked' : ''}"
              onclick="app.toggleHabit('${habit.id}')">
              ${completedToday ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="18" height="18"><path d="M5 13L9 17L19 7"/></svg>' : ''}
            </button>
            <div class="habit-info">
              <div class="habit-name">${this.escapeHtml(habit.name)}</div>
              <div class="habit-streak">
                <span class="streak-fire">${streak > 0 ? '&#x1F525;' : ''}</span>
                <span class="streak-count">${streak} day streak</span>
              </div>
            </div>
            <button class="btn-icon small" onclick="app.deleteHabit('${habit.id}')" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="habit-week">
            ${last7Days.map(day => {
              const done = (habit.completions || []).includes(day.date);
              return `<div class="habit-day ${done ? 'done' : ''} ${day.date === today ? 'today' : ''}">
                <span class="day-label">${day.label}</span>
                <span class="day-dot"></span>
              </div>`;
            }).join('')}
          </div>
          <div class="habit-heatmap">
            ${this.renderHabitHeatmap(habit)}
          </div>
        </div>`;
    }
    html += '</div>';
  }

  container.innerHTML = html;
};

GTDApp.prototype.getLast7Days = function() {
  const days = [];
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      date: d.toISOString().split('T')[0],
      label: labels[d.getDay()]
    });
  }
  return days;
};

GTDApp.prototype.calculateStreak = function(habit) {
  const completions = (habit.completions || []).sort().reverse();
  if (completions.length === 0) return 0;

  let streak = 0;
  let checkDate = new Date();
  checkDate.setHours(0, 0, 0, 0);

  // If today isn't completed, start checking from yesterday
  const todayStr = checkDate.toISOString().split('T')[0];
  if (!completions.includes(todayStr)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  while (true) {
    const dateStr = checkDate.toISOString().split('T')[0];
    if (completions.includes(dateStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
};

GTDApp.prototype.renderHabitHeatmap = function(habit) {
  const completions = new Set(habit.completions || []);
  let html = '<div class="heatmap-grid">';

  for (let i = 90; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const done = completions.has(dateStr);
    html += `<div class="heatmap-cell ${done ? 'active' : ''}" title="${dateStr}"></div>`;
  }

  html += '</div>';
  return html;
};

GTDApp.prototype.toggleHabit = function(habitId) {
  let habits = JSON.parse(localStorage.getItem('gtd_habits') || '[]');
  const habit = habits.find(h => h.id === habitId);
  if (!habit) return;

  const today = new Date().toISOString().split('T')[0];
  if (!habit.completions) habit.completions = [];

  const idx = habit.completions.indexOf(today);
  if (idx >= 0) {
    habit.completions.splice(idx, 1);
  } else {
    habit.completions.push(today);
    this.trackAchievement('habit_complete');
    const streak = this.calculateStreak(habit);
    if (streak >= 7) this.trackAchievement('habit_week_streak');
    if (streak >= 30) this.trackAchievement('habit_month_streak');
  }

  localStorage.setItem('gtd_habits', JSON.stringify(habits));
  this.renderHabitsView();
};

GTDApp.prototype.showAddHabitModal = function() {
  const modal = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  modal.classList.add('active');

  content.innerHTML = `
    <div class="modal-header"><h2>New Habit</h2></div>
    <div class="modal-body">
      <div class="form-group">
        <label>Habit Name</label>
        <input type="text" id="habitNameInput" class="form-input" placeholder="e.g., Morning meditation" autofocus>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="app.addHabit()">Add Habit</button>
    </div>`;
};

GTDApp.prototype.addHabit = function() {
  const name = document.getElementById('habitNameInput')?.value?.trim();
  if (!name) return;

  let habits = JSON.parse(localStorage.getItem('gtd_habits') || '[]');
  habits.push({
    id: 'habit_' + Date.now(),
    name: name,
    completions: [],
    created: new Date().toISOString()
  });
  localStorage.setItem('gtd_habits', JSON.stringify(habits));

  this.closeModal();
  this.renderHabitsView();
  this.showToast('Habit added!', 'success');
};

GTDApp.prototype.deleteHabit = function(habitId) {
  let habits = JSON.parse(localStorage.getItem('gtd_habits') || '[]');
  habits = habits.filter(h => h.id !== habitId);
  localStorage.setItem('gtd_habits', JSON.stringify(habits));
  this.renderHabitsView();
  this.showToast('Habit removed', 'info');
};


// =====================================================
// 7. PRODUCTIVITY DASHBOARD WITH CHARTS
// =====================================================

GTDApp.prototype.renderDashboardView = async function() {
  const container = document.getElementById('dashboardContent');
  if (!container) return;

  // Gather stats
  const inbox = await db.getInbox();
  const actions = await db.getAvailableActions();
  const allActions = (actions || []);
  const waiting = await db.getWaitingFor();
  const projects = await db.getProjects();
  const archived = await db.getArchive ? await db.getArchive() : [];

  const completedToday = (archived || []).filter(a => {
    const d = new Date(a.completed || a.archived || a.created);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  }).length;

  const completedThisWeek = (archived || []).filter(a => {
    const d = new Date(a.completed || a.archived || a.created);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return d >= weekAgo;
  }).length;

  // Context distribution
  const contextCounts = {};
  for (const a of allActions) {
    for (const c of (a.contexts || ['@uncategorized'])) {
      contextCounts[c] = (contextCounts[c] || 0) + 1;
    }
  }

  // Priority distribution
  const priorityCounts = { high: 0, medium: 0, low: 0 };
  for (const a of allActions) {
    const p = a.priority || 'medium';
    priorityCounts[p] = (priorityCounts[p] || 0) + 1;
  }

  // Weekly activity (last 7 days)
  const weekActivity = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayLabel = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
    const count = (archived || []).filter(a => {
      const ad = new Date(a.completed || a.archived || a.created);
      return ad.toISOString().split('T')[0] === dateStr;
    }).length;
    weekActivity.push({ label: dayLabel, count });
  }

  const maxActivity = Math.max(...weekActivity.map(w => w.count), 1);

  container.innerHTML = `
    <div class="dashboard-grid">
      <!-- Stat Cards -->
      <div class="dashboard-stats">
        <div class="dash-stat-card">
          <div class="dash-stat-icon inbox-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
              <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
              <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
            </svg>
          </div>
          <div class="dash-stat-info">
            <div class="dash-stat-value">${(inbox || []).length}</div>
            <div class="dash-stat-label">Inbox Items</div>
          </div>
        </div>
        <div class="dash-stat-card">
          <div class="dash-stat-icon actions-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <div class="dash-stat-info">
            <div class="dash-stat-value">${allActions.filter(a => !a.completed).length}</div>
            <div class="dash-stat-label">Active Actions</div>
          </div>
        </div>
        <div class="dash-stat-card">
          <div class="dash-stat-icon today-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div class="dash-stat-info">
            <div class="dash-stat-value">${completedToday}</div>
            <div class="dash-stat-label">Done Today</div>
          </div>
        </div>
        <div class="dash-stat-card">
          <div class="dash-stat-icon week-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
          </div>
          <div class="dash-stat-info">
            <div class="dash-stat-value">${completedThisWeek}</div>
            <div class="dash-stat-label">This Week</div>
          </div>
        </div>
      </div>

      <!-- Weekly Activity Chart -->
      <div class="dashboard-card">
        <h3>Weekly Activity</h3>
        <div class="bar-chart">
          ${weekActivity.map(w => `
            <div class="bar-col">
              <div class="bar-value">${w.count}</div>
              <div class="bar-fill" style="height: ${(w.count / maxActivity) * 100}%"></div>
              <div class="bar-label">${w.label}</div>
            </div>`).join('')}
        </div>
      </div>

      <!-- Context Distribution -->
      <div class="dashboard-card">
        <h3>By Context</h3>
        <div class="donut-chart-container">
          ${this.renderDonutChart(contextCounts)}
          <div class="chart-legend">
            ${Object.entries(contextCounts).map(([ctx, count]) => `
              <div class="legend-item">
                <span class="legend-dot" style="background: ${this.getContextColor(ctx)}"></span>
                <span class="legend-label">${ctx}</span>
                <span class="legend-value">${count}</span>
              </div>`).join('')}
          </div>
        </div>
      </div>

      <!-- Priority Distribution -->
      <div class="dashboard-card">
        <h3>By Priority</h3>
        <div class="priority-bars">
          ${Object.entries(priorityCounts).map(([p, count]) => {
            const total = allActions.length || 1;
            const pct = Math.round((count / total) * 100);
            const color = p === 'high' ? '#ff3b30' : p === 'medium' ? '#ff9500' : '#34c759';
            return `
              <div class="priority-bar-row">
                <span class="priority-label">${p.charAt(0).toUpperCase() + p.slice(1)}</span>
                <div class="priority-bar-track">
                  <div class="priority-bar-fill" style="width: ${pct}%; background: ${color}"></div>
                </div>
                <span class="priority-count">${count}</span>
              </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Projects Overview -->
      <div class="dashboard-card">
        <h3>Projects</h3>
        <div class="project-mini-list">
          ${(projects || []).filter(p => p.status === 'active').slice(0, 5).map(p => `
            <div class="project-mini-item" onclick="app.viewProject('${p.id}')">
              <div class="project-mini-ring">
                <svg viewBox="0 0 36 36" width="28" height="28">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-border-light)" stroke-width="3"/>
                  <circle cx="18" cy="18" r="15" fill="none" stroke="#007aff" stroke-width="3" stroke-linecap="round"
                    stroke-dasharray="${2*Math.PI*15}" stroke-dashoffset="${2*Math.PI*15*(1-(p.progress||0)/100)}"
                    transform="rotate(-90 18 18)"/>
                </svg>
              </div>
              <span class="project-mini-name">${this.escapeHtml(p.name)}</span>
              <span class="project-mini-pct">${p.progress || 0}%</span>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
};

GTDApp.prototype.renderDonutChart = function(data) {
  const entries = Object.entries(data);
  const total = entries.reduce((sum, [, v]) => sum + v, 0) || 1;
  let cumAngle = 0;

  const paths = entries.map(([ctx, count]) => {
    const angle = (count / total) * 360;
    const startAngle = cumAngle;
    cumAngle += angle;
    const endAngle = cumAngle;

    const startRad = (startAngle - 90) * Math.PI / 180;
    const endRad = (endAngle - 90) * Math.PI / 180;

    const r = 60;
    const cx = 80, cy = 80;

    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);

    const largeArc = angle > 180 ? 1 : 0;
    const color = this.getContextColor(ctx);

    return `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} Z" fill="${color}" opacity="0.85"/>`;
  });

  return `
    <svg class="donut-chart" viewBox="0 0 160 160" width="140" height="140">
      ${paths.join('')}
      <circle cx="80" cy="80" r="35" fill="var(--color-bg)"/>
      <text x="80" y="80" text-anchor="middle" dominant-baseline="central" fill="var(--color-text)" font-size="18" font-weight="700">${total}</text>
    </svg>`;
};

GTDApp.prototype.getContextColor = function(ctx) {
  const colors = {
    '@phone': '#10b981', '@email': '#3b82f6', '@computer': '#8b5cf6',
    '@office': '#f59e0b', '@errands': '#ef4444', '@waiting': '#6b7280',
    '@home': '#ec4899', '@anywhere': '#06b6d4', '@uncategorized': '#9ca3af'
  };
  return colors[ctx] || '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
};


// =====================================================
// 8. PROJECT TIMELINE / GANTT VIEW
// =====================================================

GTDApp.prototype.renderTimelineView = async function() {
  const container = document.getElementById('timelineContent');
  if (!container) return;

  const projects = await db.getProjects();
  const activeProjects = (projects || []).filter(p => p.status === 'active');

  if (activeProjects.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No Active Projects</h3>
        <p>Create projects with due dates to see them on the timeline</p>
      </div>`;
    return;
  }

  // Find date range
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - 7);
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + 60);
  const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

  // Generate week labels
  const weeks = [];
  const d = new Date(startDate);
  while (d <= endDate) {
    weeks.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }

  let html = `
    <div class="timeline-container">
      <div class="timeline-header">
        <div class="timeline-label-col">Project</div>
        <div class="timeline-dates">
          ${weeks.map(w => `<div class="timeline-week">${w.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>`).join('')}
        </div>
      </div>
      <div class="timeline-body">
        <!-- Today marker -->
        <div class="timeline-today" style="left: calc(${((now - startDate) / (endDate - startDate)) * 100}%)"></div>
        ${activeProjects.map(project => {
          const created = new Date(project.created);
          const due = project.dueDate ? new Date(project.dueDate) : new Date(now.getTime() + 30*24*60*60*1000);

          const barStart = Math.max(0, ((created - startDate) / (endDate - startDate)) * 100);
          const barEnd = Math.min(100, ((due - startDate) / (endDate - startDate)) * 100);
          const barWidth = Math.max(2, barEnd - barStart);

          const progress = project.progress || 0;
          const barColor = progress >= 100 ? '#34c759' : progress >= 50 ? '#007aff' : '#ff9500';

          return `
            <div class="timeline-row" onclick="app.viewProject('${project.id}')">
              <div class="timeline-label-col">
                <span class="timeline-project-name">${this.escapeHtml(this.truncate(project.name, 25))}</span>
              </div>
              <div class="timeline-bar-area">
                <div class="timeline-bar" style="left: ${barStart}%; width: ${barWidth}%; background: ${barColor}20; border: 1px solid ${barColor}">
                  <div class="timeline-bar-progress" style="width: ${progress}%; background: ${barColor}"></div>
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>`;

  container.innerHTML = html;
};


// =====================================================
// 9. ZEN MODE CAPTURE
// =====================================================

GTDApp.prototype.enterZenMode = function() {
  let overlay = document.getElementById('zenModeOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'zenModeOverlay';
    overlay.className = 'zen-overlay';
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div class="zen-container">
      <div class="zen-particles" id="zenParticles"></div>
      <div class="zen-content">
        <div class="zen-tagline">Clear your mind</div>
        <textarea class="zen-input" id="zenInput" placeholder="What's on your mind?" autofocus></textarea>
        <div class="zen-actions">
          <button class="zen-btn capture" onclick="app.zenCapture()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            Capture
          </button>
          <button class="zen-btn voice" onclick="app.zenVoiceCapture()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>
            </svg>
            Voice
          </button>
          <button class="zen-btn exit" onclick="app.exitZenMode()">Exit</button>
        </div>
        <div class="zen-captured-list" id="zenCapturedList"></div>
      </div>
    </div>`;

  overlay.classList.add('active');
  this.zenCapturedItems = [];
  this.startZenParticles();

  // Focus the input
  setTimeout(() => document.getElementById('zenInput')?.focus(), 300);
};

GTDApp.prototype.zenCapture = async function() {
  const input = document.getElementById('zenInput');
  const text = input?.value?.trim();
  if (!text) return;

  await db.addToInbox({
    content: text,
    type: 'text',
    timestamp: new Date().toISOString()
  });

  this.zenCapturedItems.push(text);
  this.trackAchievement('zen_capture');

  // Visual feedback
  input.value = '';
  input.focus();

  const list = document.getElementById('zenCapturedList');
  if (list) {
    list.innerHTML = this.zenCapturedItems.map(item =>
      `<div class="zen-captured-item">${this.escapeHtml(this.truncate(item, 50))}</div>`
    ).join('');
  }

  await this.updateCounts();
};

GTDApp.prototype.zenVoiceCapture = function() {
  if (typeof speechHandler !== 'undefined' && speechHandler.isSupported) {
    speechHandler.toggleRecording(
      (text) => {
        document.getElementById('zenInput').value = text;
        this.zenCapture();
      },
      (error) => this.showToast('Voice capture failed', 'error')
    );
  } else {
    this.showToast('Voice capture not supported', 'error');
  }
};

GTDApp.prototype.exitZenMode = function() {
  const overlay = document.getElementById('zenModeOverlay');
  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 500);
  }
};

GTDApp.prototype.startZenParticles = function() {
  const container = document.getElementById('zenParticles');
  if (!container) return;

  for (let i = 0; i < 30; i++) {
    const particle = document.createElement('div');
    particle.className = 'zen-particle';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.animationDelay = Math.random() * 8 + 's';
    particle.style.animationDuration = (8 + Math.random() * 12) + 's';
    particle.style.opacity = 0.1 + Math.random() * 0.3;
    particle.style.width = particle.style.height = (2 + Math.random() * 4) + 'px';
    container.appendChild(particle);
  }
};


// =====================================================
// 10. ACHIEVEMENT / BADGE SYSTEM
// =====================================================

const ACHIEVEMENTS = {
  first_capture: { name: 'First Thought', desc: 'Capture your first item', icon: '&#x1F4AD;', threshold: 1 },
  captures_10: { name: 'Mind Sweeper', desc: 'Capture 10 items', icon: '&#x1F9F9;', threshold: 10 },
  captures_100: { name: 'Thought Machine', desc: 'Capture 100 items', icon: '&#x1F916;', threshold: 100 },
  inbox_zero: { name: 'Inbox Zero', desc: 'Clear your entire inbox', icon: '&#x2728;', threshold: 1 },
  inbox_zero_5: { name: 'Zen Master', desc: 'Achieve Inbox Zero 5 times', icon: '&#x1F9D8;', threshold: 5 },
  actions_complete_10: { name: 'Getting Things Done', desc: 'Complete 10 actions', icon: '&#x2705;', threshold: 10 },
  actions_complete_50: { name: 'Productivity Pro', desc: 'Complete 50 actions', icon: '&#x1F4AA;', threshold: 50 },
  actions_complete_100: { name: 'Unstoppable', desc: 'Complete 100 actions', icon: '&#x1F525;', threshold: 100 },
  pomodoro_complete: { name: 'Focused', desc: 'Complete a Pomodoro session', icon: '&#x1F345;', threshold: 1 },
  pomodoro_10: { name: 'Deep Worker', desc: 'Complete 10 Pomodoro sessions', icon: '&#x1F3AF;', threshold: 10 },
  habit_complete: { name: 'Habit Builder', desc: 'Complete a habit', icon: '&#x1F4C5;', threshold: 1 },
  habit_week_streak: { name: 'Week Warrior', desc: '7-day habit streak', icon: '&#x1F4A5;', threshold: 1 },
  habit_month_streak: { name: 'Monthly Marvel', desc: '30-day habit streak', icon: '&#x1F451;', threshold: 1 },
  weekly_review: { name: 'Reviewer', desc: 'Complete a weekly review', icon: '&#x1F50D;', threshold: 1 },
  weekly_review_4: { name: 'Consistent', desc: '4 weekly reviews', icon: '&#x1F3C6;', threshold: 4 },
  project_complete: { name: 'Project Done', desc: 'Complete a project', icon: '&#x1F389;', threshold: 1 },
  zen_capture: { name: 'Mindful', desc: 'Use Zen Mode capture', icon: '&#x1F54A;', threshold: 1 },
  night_owl: { name: 'Night Owl', desc: 'Capture after midnight', icon: '&#x1F989;', threshold: 1 },
  early_bird: { name: 'Early Bird', desc: 'Capture before 6am', icon: '&#x1F426;', threshold: 1 }
};

GTDApp.prototype.trackAchievement = function(key) {
  let achievements = JSON.parse(localStorage.getItem('gtd_achievements') || '{}');
  if (!achievements[key]) achievements[key] = { count: 0, unlocked: false, unlockedAt: null };

  achievements[key].count++;

  const def = ACHIEVEMENTS[key];
  if (def && achievements[key].count >= def.threshold && !achievements[key].unlocked) {
    achievements[key].unlocked = true;
    achievements[key].unlockedAt = new Date().toISOString();
    this.showAchievementUnlock(def);
  }

  localStorage.setItem('gtd_achievements', JSON.stringify(achievements));
};

GTDApp.prototype.showAchievementUnlock = function(achievement) {
  const popup = document.createElement('div');
  popup.className = 'achievement-popup';
  popup.innerHTML = `
    <div class="achievement-popup-content">
      <div class="achievement-popup-icon">${achievement.icon}</div>
      <div class="achievement-popup-text">
        <div class="achievement-popup-title">Achievement Unlocked!</div>
        <div class="achievement-popup-name">${achievement.name}</div>
        <div class="achievement-popup-desc">${achievement.desc}</div>
      </div>
    </div>`;

  document.body.appendChild(popup);
  requestAnimationFrame(() => popup.classList.add('show'));

  setTimeout(() => {
    popup.classList.remove('show');
    setTimeout(() => popup.remove(), 500);
  }, 4000);
};

GTDApp.prototype.renderAchievementsView = function() {
  const container = document.getElementById('achievementsContent');
  if (!container) return;

  const achievements = JSON.parse(localStorage.getItem('gtd_achievements') || '{}');
  const totalUnlocked = Object.values(achievements).filter(a => a.unlocked).length;
  const totalAchievements = Object.keys(ACHIEVEMENTS).length;

  let html = `
    <div class="achievements-header">
      <div class="achievements-progress">
        <div class="achievements-count">${totalUnlocked} / ${totalAchievements}</div>
        <div class="achievements-bar">
          <div class="achievements-bar-fill" style="width: ${(totalUnlocked / totalAchievements) * 100}%"></div>
        </div>
      </div>
    </div>
    <div class="achievements-grid">`;

  for (const [key, def] of Object.entries(ACHIEVEMENTS)) {
    const state = achievements[key] || { count: 0, unlocked: false };
    const progress = Math.min(state.count / def.threshold, 1);

    html += `
      <div class="achievement-card ${state.unlocked ? 'unlocked' : 'locked'}">
        <div class="achievement-icon">${def.icon}</div>
        <div class="achievement-name">${def.name}</div>
        <div class="achievement-desc">${def.desc}</div>
        ${!state.unlocked ? `
          <div class="achievement-progress-bar">
            <div class="achievement-progress-fill" style="width: ${progress * 100}%"></div>
          </div>
          <div class="achievement-progress-text">${state.count} / ${def.threshold}</div>
        ` : `
          <div class="achievement-unlocked-date">${new Date(state.unlockedAt).toLocaleDateString()}</div>
        `}
      </div>`;
  }

  html += '</div>';
  container.innerHTML = html;
};


// =====================================================
// 11. SMART WEEKLY REVIEW WITH AI
// =====================================================

GTDApp.prototype.generateAIReviewInsights = async function() {
  const container = document.getElementById('aiReviewInsights');
  if (!container) return;

  container.innerHTML = '<div class="loading-inline">Analyzing your patterns...</div>';

  try {
    const actions = await db.getAvailableActions();
    const waiting = await db.getWaitingFor();
    const projects = await db.getProjects();
    const inbox = await db.getInbox();

    const summary = {
      inboxCount: (inbox || []).length,
      actionCount: (actions || []).filter(a => !a.completed).length,
      waitingCount: (waiting || []).length,
      activeProjects: (projects || []).filter(p => p.status === 'active').length,
      stalledProjects: (projects || []).filter(p => p.status === 'active' && (p.progress || 0) === 0).length,
      overdue: (actions || []).filter(a => a.dueDate && new Date(a.dueDate) < new Date()).length,
      highPriority: (actions || []).filter(a => a.priority === 'high').length,
      contexts: {}
    };

    for (const a of (actions || [])) {
      for (const c of (a.contexts || [])) {
        summary.contexts[c] = (summary.contexts[c] || 0) + 1;
      }
    }

    // Check if AI service is available
    if (typeof aiService !== 'undefined' && aiService.apiKey) {
      const prompt = `You are a GTD productivity coach. Based on this user's current state, provide 3-5 brief, actionable insights. Be encouraging but honest.

Current state:
- Inbox: ${summary.inboxCount} items
- Active actions: ${summary.actionCount}
- Waiting for: ${summary.waitingCount}
- Active projects: ${summary.activeProjects}
- Stalled projects (0% progress): ${summary.stalledProjects}
- Overdue items: ${summary.overdue}
- High priority items: ${summary.highPriority}
- Context distribution: ${JSON.stringify(summary.contexts)}

Give insights in this JSON format:
[{"type": "warning|tip|praise", "message": "..."}]`;

      const response = await aiService.chat(prompt);
      const insights = JSON.parse(response.match(/\[[\s\S]*\]/)?.[0] || '[]');

      container.innerHTML = insights.map(i => `
        <div class="ai-insight ${i.type}">
          <span class="insight-icon">${i.type === 'warning' ? '&#x26A0;' : i.type === 'praise' ? '&#x2B50;' : '&#x1F4A1;'}</span>
          <span class="insight-text">${this.escapeHtml(i.message)}</span>
        </div>`).join('');
    } else {
      // Fallback: generate insights without AI
      const insights = [];

      if (summary.inboxCount > 10) insights.push({ type: 'warning', message: `You have ${summary.inboxCount} items in your inbox. Try to process them down to zero.` });
      if (summary.inboxCount === 0) insights.push({ type: 'praise', message: 'Inbox Zero achieved! Your mind is clear.' });
      if (summary.overdue > 0) insights.push({ type: 'warning', message: `${summary.overdue} overdue items need attention. Review and reschedule or complete them.` });
      if (summary.stalledProjects > 0) insights.push({ type: 'tip', message: `${summary.stalledProjects} projects have 0% progress. Define the next action for each one.` });
      if (summary.highPriority > 3) insights.push({ type: 'tip', message: `${summary.highPriority} high-priority items. Consider if they're all truly urgent.` });
      if (summary.actionCount < 5) insights.push({ type: 'praise', message: 'Light action list! Great time to tackle a bigger project.' });
      if (summary.waitingCount > 5) insights.push({ type: 'tip', message: `${summary.waitingCount} items waiting. Follow up on the oldest ones.` });

      if (insights.length === 0) insights.push({ type: 'praise', message: 'Everything looks great! Keep up the momentum.' });

      container.innerHTML = insights.map(i => `
        <div class="ai-insight ${i.type}">
          <span class="insight-icon">${i.type === 'warning' ? '&#x26A0;' : i.type === 'praise' ? '&#x2B50;' : '&#x1F4A1;'}</span>
          <span class="insight-text">${i.message}</span>
        </div>`).join('');
    }
  } catch (e) {
    console.error('AI review insights error:', e);
    container.innerHTML = '<div class="ai-insight tip"><span class="insight-icon">&#x1F4A1;</span><span class="insight-text">Review your lists and identify your top 3 priorities for next week.</span></div>';
  }
};


// =====================================================
// 12. AI AUTO-CATEGORIZATION
// =====================================================

GTDApp.prototype.autoCategorizeCapturedItem = async function(text) {
  if (!text || text.length < 5) return null;

  // Fast local NLP first
  const suggestions = {
    contexts: [],
    priority: 'medium',
    isActionable: true
  };

  const lower = text.toLowerCase();

  // Context detection
  if (/\b(call|phone|dial|ring)\b/.test(lower)) suggestions.contexts.push('@phone');
  if (/\b(email|send|reply|forward|mail)\b/.test(lower)) suggestions.contexts.push('@email');
  if (/\b(code|build|develop|debug|deploy|website|app|software)\b/.test(lower)) suggestions.contexts.push('@computer');
  if (/\b(office|meeting|desk|print|file)\b/.test(lower)) suggestions.contexts.push('@office');
  if (/\b(buy|shop|pick up|store|grocery|errand)\b/.test(lower)) suggestions.contexts.push('@errands');
  if (/\b(home|house|clean|cook|laundry|garden)\b/.test(lower)) suggestions.contexts.push('@home');

  // Priority detection
  if (/\b(urgent|urgently|asap|immediately|critical|emergency)\b/.test(lower)) suggestions.priority = 'high';
  if (/\b(someday|maybe|eventually|when i get around|no rush)\b/.test(lower)) suggestions.priority = 'low';

  // Actionability detection
  if (/\b(idea|thought|remember|note|fyi|interesting)\b/.test(lower)) suggestions.isActionable = false;

  // Time-based achievements
  const hour = new Date().getHours();
  if (hour >= 0 && hour < 5) this.trackAchievement('night_owl');
  if (hour >= 4 && hour < 6) this.trackAchievement('early_bird');

  return suggestions;
};


// =====================================================
// 13. ENHANCED NLP
// =====================================================

GTDApp.prototype.enhancedNLPParse = function(text) {
  const result = {
    cleanText: text,
    dueDate: null,
    contacts: [],
    contexts: [],
    priority: null,
    project: null
  };

  // Date parsing
  const datePatterns = [
    { regex: /\b(today)\b/i, offset: 0 },
    { regex: /\b(tomorrow)\b/i, offset: 1 },
    { regex: /\b(next week)\b/i, offset: 7 },
    { regex: /\b(next month)\b/i, offset: 30 },
    { regex: /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, handler: (match) => {
      const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
      const target = days.indexOf(match[1].toLowerCase());
      const today = new Date().getDay();
      let diff = target - today;
      if (diff <= 0) diff += 7;
      return diff;
    }}
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern.regex);
    if (match) {
      const d = new Date();
      const offset = pattern.handler ? pattern.handler(match) : pattern.offset;
      d.setDate(d.getDate() + offset);
      result.dueDate = d.toISOString().split('T')[0];
      result.cleanText = result.cleanText.replace(match[0], '').trim();
      break;
    }
  }

  // Time pattern: "at 3pm", "at 14:00"
  const timeMatch = text.match(/\bat\s+(\d{1,2})(:\d{2})?\s*(am|pm)?\b/i);
  if (timeMatch && result.dueDate) {
    let hours = parseInt(timeMatch[1]);
    if (timeMatch[3]?.toLowerCase() === 'pm' && hours < 12) hours += 12;
    if (timeMatch[3]?.toLowerCase() === 'am' && hours === 12) hours = 0;
    result.dueDate += `T${hours.toString().padStart(2,'0')}:${(timeMatch[2] || ':00').slice(1)}`;
    result.cleanText = result.cleanText.replace(timeMatch[0], '').trim();
  }

  // Contact extraction: "with John", "tell Sarah", "ask Bob"
  const contactMatch = text.match(/\b(?:with|tell|ask|call|email|text|remind)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i);
  if (contactMatch) {
    result.contacts.push(contactMatch[1]);
  }

  // Priority: "!" or "!!" or "!!!"
  if (/!!!/.test(text)) result.priority = 'high';
  else if (/!!/.test(text)) result.priority = 'medium';
  else if (/!/.test(text) && !/[a-z]!/i.test(text)) result.priority = 'high';

  // Project reference: "#projectname"
  const projMatch = text.match(/#(\w+)/);
  if (projMatch) {
    result.project = projMatch[1];
    result.cleanText = result.cleanText.replace(projMatch[0], '').trim();
  }

  return result;
};


// =====================================================
// INITIALIZATION - Wire everything up
// =====================================================

// Patch init to include new features
const _originalInit = GTDApp.prototype.init;
GTDApp.prototype.init = async function() {
  await _originalInit.call(this);

  // Initialize new features
  this.initThemeToggle();
  this.initSwipeGestures();

  // Load kanban preference
  this.kanbanMode = localStorage.getItem('gtd_kanban_mode') === 'true';

  console.log('Features.js initialized');
};

// Patch navigateTo for new views
const _originalNavigateTo = GTDApp.prototype.navigateTo;
GTDApp.prototype.navigateTo = function(view) {
  // Add new view titles
  const newTitles = {
    habits: 'Habits',
    dashboard: 'Dashboard',
    timeline: 'Timeline',
    achievements: 'Achievements'
  };

  if (newTitles[view]) {
    this.currentView = view;
    this.toggleSidebar(false);
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === view);
    });
    const mobileTitle = document.getElementById('mobileTitle');
    if (mobileTitle) mobileTitle.textContent = newTitles[view];
    this.renderCurrentView();
    return;
  }

  _originalNavigateTo.call(this, view);
};

// Patch renderCurrentView for new views
const _originalRenderCurrentView = GTDApp.prototype.renderCurrentView;
GTDApp.prototype.renderCurrentView = async function() {
  // Helper for safe view activation
  const activate = (id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  };

  // Handle kanban mode for next actions
  if (this.currentView === 'nextActions' && this.kanbanMode) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    activate('nextActionsView');
    this.renderFilters([]); // Still render filters
    await this.renderKanbanBoard();
    return;
  }

  // Handle new views
  switch (this.currentView) {
    case 'habits':
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      activate('habitsView');
      await this.renderHabitsView();
      return;
    case 'dashboard':
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      activate('dashboardView');
      await this.renderDashboardView();
      return;
    case 'timeline':
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      activate('timelineView');
      await this.renderTimelineView();
      return;
    case 'achievements':
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      activate('achievementsView');
      this.renderAchievementsView();
      return;
  }

  await _originalRenderCurrentView.call(this);
};

// Track captures for achievements
const _originalAddToInbox = db.addToInbox;
if (_originalAddToInbox) {
  // Will be patched after db is ready
  document.addEventListener('DOMContentLoaded', () => {
    const origAdd = db.addToInbox?.bind(db);
    if (origAdd) {
      const patchedAdd = async function(...args) {
        const result = await origAdd(...args);
        const achievements = JSON.parse(localStorage.getItem('gtd_achievements') || '{}');
        const captureCount = (achievements.first_capture?.count || 0) + 1;
        app.trackAchievement('first_capture');
        if (captureCount >= 10) app.trackAchievement('captures_10');
        if (captureCount >= 100) app.trackAchievement('captures_100');
        return result;
      };
      // Don't override db.addToInbox directly since it gets swapped for cloud mode
    }
  });
}

// =====================================================
// 14. PREMIUM REFERENCE SYSTEM (Steve Jobs Redesign)
// =====================================================

// State for the reference picker
GTDApp.prototype.refPickerExpandedCategory = null;
GTDApp.prototype.refPickerCreatingIn = null;
GTDApp.prototype.refPickerSelectedIcon = '📁';

// Popular folder icons for the picker
GTDApp.prototype.folderIcons = ['📁', '📂', '💼', '🏠', '👥', '📊', '📈', '💰', '🎯', '⚡', '🔧', '📝', '📋', '🎨', '🚀', '💡', '🔒', '📱', '🌐', '✨'];

// Override the reference tagging step with premium design
GTDApp.prototype.showReferenceTagging = async function() {
  const container = document.getElementById('modalContent');
  const folders = await db.getReferenceFolders();
  const content = this.processingItem?.content || '';

  // Get AI folder suggestion
  let suggestedFolder = null;
  if (typeof db.suggestFolderForContent === 'function' && content) {
    const suggestions = await db.suggestFolderForContent(content);
    if (suggestions && suggestions.length > 0) {
      suggestedFolder = suggestions[0];
    }
  }

  // Build hierarchy - 3 main categories + custom
  const categories = {
    business: { id: 'business', name: 'Business', icon: '💼', folders: [] },
    personal: { id: 'personal', name: 'Personal', icon: '🏠', folders: [] },
    team: { id: 'team', name: 'Team', icon: '👥', folders: [] },
    custom: { id: 'custom', name: 'Custom', icon: '⭐', folders: [] }
  };

  // Group folders by category
  for (const f of folders) {
    if (f.parentId && categories[f.parentId]) {
      // Has a known parent category
      categories[f.parentId].folders.push(f);
    } else if (!f.parentId && categories[f.id]) {
      // It's a root category folder (business, personal, team)
      categories[f.id].rootFolder = f;
    } else if (!f.parentId && !categories[f.id]) {
      // Custom top-level folder - add to custom category
      categories.custom.folders.push(f);
    } else if (f.parentId && !categories[f.parentId]) {
      // Has an unknown parent - treat as custom
      categories.custom.folders.push(f);
    }
  }

  // Remove custom category if empty
  if (categories.custom.folders.length === 0) {
    delete categories.custom;
  }

  const selectedId = this.selectedReferenceFolder;
  const expandedCat = this.refPickerExpandedCategory;

  container.innerHTML = `
    <div class="modal-header">
      <h3>Save to Reference</h3>
    </div>
    <div class="modal-body ref-premium-body">
      <div class="ref-content-preview">
        <span class="ref-content-label">Saving:</span>
        <span class="ref-content-text">${this.escapeHtml(content.substring(0, 120))}${content.length > 120 ? '...' : ''}</span>
      </div>

      ${suggestedFolder ? `
        <div class="ref-ai-suggestion" onclick="app.pickReferenceFolder('${suggestedFolder.id}')">
          <div class="ref-ai-badge">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
            AI Suggested
          </div>
          <div class="ref-ai-folder ${selectedId === suggestedFolder.id ? 'selected' : ''}">
            <span class="ref-ai-icon">${suggestedFolder.icon || '📁'}</span>
            <span class="ref-ai-name">${this.escapeHtml(suggestedFolder.name)}</span>
            <span class="ref-ai-check">${selectedId === suggestedFolder.id ? '✓' : ''}</span>
          </div>
        </div>
      ` : ''}

      <div class="ref-category-picker">
        ${Object.values(categories).map(cat => `
          <div class="ref-category ${expandedCat === cat.id ? 'expanded' : ''}" data-category="${cat.id}">
            <div class="ref-category-header" onclick="app.toggleRefCategory('${cat.id}')">
              <span class="ref-category-icon">${cat.icon}</span>
              <span class="ref-category-name">${cat.name}</span>
              <span class="ref-category-count">${cat.folders.length} folders</span>
              <span class="ref-category-chevron">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </span>
            </div>
            <div class="ref-category-children">
              ${cat.folders.map(f => `
                <div class="ref-folder-item ${selectedId === f.id ? 'selected' : ''}"
                     onclick="event.stopPropagation(); app.pickReferenceFolder('${f.id}')">
                  <span class="ref-folder-icon">${f.icon || '📁'}</span>
                  <span class="ref-folder-name">${this.escapeHtml(f.name)}</span>
                  ${selectedId === f.id ? '<span class="ref-folder-check">✓</span>' : ''}
                </div>
              `).join('')}
              <div class="ref-folder-add" onclick="event.stopPropagation(); app.startInlineCreate('${cat.id}')">
                <span class="ref-folder-add-icon">+</span>
                <span class="ref-folder-add-text">New ${cat.name} Folder</span>
              </div>
              ${this.refPickerCreatingIn === cat.id ? this.renderInlineFolderCreate(cat.id) : ''}
            </div>
          </div>
        `).join('')}
      </div>

      <div class="ref-unfiled-option ${!selectedId ? 'selected' : ''}" onclick="app.pickReferenceFolder(null)">
        <span class="ref-unfiled-icon">📥</span>
        <span class="ref-unfiled-text">Keep Unfiled</span>
        ${!selectedId ? '<span class="ref-unfiled-check">✓</span>' : ''}
      </div>

      ${this.tagSuggestions && this.tagSuggestions.length > 0 ? `
        <div class="ref-tags-section">
          <label class="ref-tags-label">Suggested Tags</label>
          <div class="ref-tag-pills">
            ${this.tagSuggestions.map(tag => `
              <button class="ref-tag-pill ${this.referenceTags.includes(tag) ? 'selected' : ''}"
                      onclick="app.toggleReferenceTag('${tag}')">
                ${tag}
              </button>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div class="ref-tags-input-section">
        <div class="ref-tags-display">
          ${(this.referenceTags || []).map(tag => `
            <span class="ref-tag-chip">
              ${this.escapeHtml(tag)}
              <button class="ref-tag-remove" onclick="app.removeReferenceTag('${this.escapeHtml(tag)}')">&times;</button>
            </span>
          `).join('')}
          <input type="text" class="ref-tag-input" id="tagInput" placeholder="${this.referenceTags?.length ? 'Add another...' : 'Add tags...'}">
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="app.processingStep = 'reference'; app.showProcessingModal()">Back</button>
      <button class="btn btn-primary" onclick="app.saveToReference()">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        Save to Reference
      </button>
    </div>
  `;

  // Set up tag input
  const tagInput = document.getElementById('tagInput');
  if (tagInput) {
    tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        let tag = tagInput.value.trim();
        if (tag) {
          if (!tag.startsWith('#')) tag = '#' + tag;
          if (!this.referenceTags.includes(tag)) {
            this.referenceTags.push(tag);
            this.showReferenceTagging();
          }
        }
        tagInput.value = '';
      }
    });
  }
};

// Render inline folder creation form
GTDApp.prototype.renderInlineFolderCreate = function(categoryId) {
  return `
    <div class="ref-inline-create" onclick="event.stopPropagation()">
      <div class="ref-inline-icon-picker">
        ${this.folderIcons.slice(0, 10).map(icon => `
          <button class="ref-icon-btn ${this.refPickerSelectedIcon === icon ? 'selected' : ''}"
                  onclick="app.selectFolderIcon('${icon}')">${icon}</button>
        `).join('')}
      </div>
      <input type="text" class="ref-inline-name" id="inlineFolderName" placeholder="Folder name" autofocus>
      <div class="ref-inline-actions">
        <button class="ref-inline-cancel" onclick="app.cancelInlineCreate()">Cancel</button>
        <button class="ref-inline-save" onclick="app.saveNewFolder('${categoryId}')">Create</button>
      </div>
    </div>
  `;
};

// Toggle category expansion (accordion style)
GTDApp.prototype.toggleRefCategory = function(categoryId) {
  if (this.refPickerExpandedCategory === categoryId) {
    this.refPickerExpandedCategory = null;
  } else {
    this.refPickerExpandedCategory = categoryId;
  }
  this.refPickerCreatingIn = null; // Close any create form
  this.showReferenceTagging();
};

// Select folder
GTDApp.prototype.pickReferenceFolder = function(folderId) {
  this.selectedReferenceFolder = folderId;
  this.showReferenceTagging(); // Re-render to update selection
};

// Start inline folder creation
GTDApp.prototype.startInlineCreate = function(categoryId) {
  this.refPickerCreatingIn = categoryId;
  this.refPickerSelectedIcon = '📁';
  this.showReferenceTagging();
  setTimeout(() => {
    const input = document.getElementById('inlineFolderName');
    if (input) input.focus();
  }, 50);
};

// Cancel inline creation
GTDApp.prototype.cancelInlineCreate = function() {
  this.refPickerCreatingIn = null;
  this.showReferenceTagging();
};

// Select folder icon
GTDApp.prototype.selectFolderIcon = function(icon) {
  this.refPickerSelectedIcon = icon;
  document.querySelectorAll('.ref-icon-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.textContent === icon);
  });
};

// Save new folder
GTDApp.prototype.saveNewFolder = async function(parentCategoryId) {
  const nameInput = document.getElementById('inlineFolderName');
  const name = nameInput?.value?.trim();
  if (!name) {
    nameInput?.focus();
    return;
  }

  try {
    const folder = {
      id: 'folder_' + Date.now(),
      name: name,
      parentId: parentCategoryId,
      icon: this.refPickerSelectedIcon || '📁',
      created: new Date().toISOString(),
      itemCount: 0
    };

    if (typeof db.createReferenceFolder === 'function') {
      await db.createReferenceFolder(folder);
    } else {
      await db.add('folders', folder);
    }

    this.selectedReferenceFolder = folder.id;
    this.refPickerCreatingIn = null;
    this.showReferenceTagging();
    this.showToast('Folder created!', 'success');
  } catch (e) {
    console.error('Failed to create folder:', e);
    this.showToast('Failed to create folder', 'error');
  }
};

// Legacy method aliases for backward compatibility
GTDApp.prototype.inlineCreateFolder = function() {
  // Find first category and start creating there
  this.startInlineCreate('business');
};

GTDApp.prototype.saveInlineFolder = async function() {
  // Redirect to new save method
  if (this.refPickerCreatingIn) {
    await this.saveNewFolder(this.refPickerCreatingIn);
  }
};

// Override quickSaveToReference with the premium picker (uses _inboxItemsCache from app.js)
GTDApp.prototype.quickSaveToReference = async function(inboxId) {
  try {
    // Use cached item first, fall back to fetching
    let item = this._inboxItemsCache?.[inboxId];
    if (!item) {
      try {
        item = await db.get('inbox', inboxId);
      } catch (e) {
        console.warn('Could not fetch inbox item, using placeholder:', e);
      }
    }

    if (!item) {
      // If still no item, show the new reference modal instead
      this.showToast('Opening reference modal...', 'info');
      this.showNewReferenceModal();
      return;
    }

    // Store item for the picker to use
    this.processingItem = item;
    this.referenceTags = [];
    this.selectedReferenceFolder = null;
    this.refPickerExpandedCategory = null;
    this.refPickerCreatingIn = null;
    this._quickSaveInboxId = inboxId;

    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    // Reuse the premium folder picker
    await this.showReferenceTagging();

    // Swap the footer buttons to handle quick-save flow
    const footer = content.querySelector('.modal-footer');
    if (footer) {
      footer.innerHTML = `
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.confirmQuickSaveToReference('${inboxId}')">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          Save to Reference
        </button>
      `;
    }
  } catch (error) {
    console.error('Failed to load inbox item:', error);
    // Fallback to new reference modal
    this.showNewReferenceModal();
  }
};

// Override confirmQuickSaveToReference to work with the visual folder picker
GTDApp.prototype.confirmQuickSaveToReference = async function(inboxId) {
  try {
    // Use the cached/stored processing item instead of re-fetching
    const item = this.processingItem || this._inboxItemsCache?.[inboxId];
    if (!item || !item.content) {
      this.showToast('Item not found', 'error');
      return;
    }

    // Use the visual picker's state instead of form elements
    const folderId = this.selectedReferenceFolder || null;
    const tags = this.referenceTags || [];

    // Create title from content (truncate if too long)
    const title = (item.content || 'Untitled').substring(0, 100);
    const content = item.content || '';

    // addToReference expects: (title, content, folderId, tags, attachment)
    await db.addToReference(title, content, folderId, tags, item.attachment || null);

    // Delete from inbox
    try {
      await db.delete('inbox', inboxId);
      // Remove from cache
      if (this._inboxItemsCache) delete this._inboxItemsCache[inboxId];
    } catch (e) {
      console.warn('Could not delete inbox item:', e);
    }

    this.closeModal();
    await this.updateCounts();
    await this.renderInboxView();
    this.showToast('Saved to reference', 'success');
  } catch (error) {
    console.error('Failed to save to reference:', error);
    this.showToast('Failed to save to reference', 'error');
  }
};


// =====================================================
// 15. PREMIUM NEW REFERENCE MODAL
// =====================================================

// Override showNewReferenceModal with premium design
GTDApp.prototype.showNewReferenceModal = async function(preselectedFolderId = null) {
  const folders = await db.getReferenceFolders();

  // Pull in text from Quick Capture box if any
  const captureInput = document.getElementById('captureInput');
  const capturedText = captureInput?.value?.trim() || '';

  // Set up state for the picker
  this.processingItem = { content: capturedText }; // Use captured text
  this.referenceTags = [];
  this.selectedReferenceFolder = preselectedFolderId || this.currentFolder || null;
  this.refPickerExpandedCategory = null;
  this.refPickerCreatingIn = null;
  this.newRefContent = capturedText; // Pre-fill with captured text

  // Clear the capture input since we're using it
  if (capturedText && captureInput) {
    captureInput.value = '';
  }

  // Find which category to expand based on preselected folder
  if (preselectedFolderId) {
    const folder = folders.find(f => f.id === preselectedFolderId);
    if (folder && folder.parentId) {
      this.refPickerExpandedCategory = folder.parentId;
    }
  }

  const modal = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  modal.classList.add('active');

  await this.renderNewReferenceModal();
};

// Render the new reference modal
GTDApp.prototype.renderNewReferenceModal = async function() {
  const content = document.getElementById('modalContent');
  const folders = await db.getReferenceFolders();

  // Build hierarchy - 3 main categories + custom
  const categories = {
    business: { id: 'business', name: 'Business', icon: '💼', folders: [] },
    personal: { id: 'personal', name: 'Personal', icon: '🏠', folders: [] },
    team: { id: 'team', name: 'Team', icon: '👥', folders: [] },
    custom: { id: 'custom', name: 'Custom', icon: '⭐', folders: [] }
  };

  for (const f of folders) {
    if (f.parentId && categories[f.parentId]) {
      categories[f.parentId].folders.push(f);
    } else if (!f.parentId && !categories[f.id]) {
      // Custom top-level folder
      categories.custom.folders.push(f);
    } else if (f.parentId && !categories[f.parentId]) {
      // Has unknown parent - treat as custom
      categories.custom.folders.push(f);
    }
  }

  // Remove custom category if empty
  if (categories.custom.folders.length === 0) {
    delete categories.custom;
  }

  const selectedId = this.selectedReferenceFolder;
  const expandedCat = this.refPickerExpandedCategory;

  content.innerHTML = `
    <div class="modal-header">
      <h3>New Reference</h3>
    </div>
    <div class="modal-body ref-premium-body" style="padding: 0 !important;">
      <div class="ref-new-content-section">
        <textarea class="ref-content-textarea" id="newRefContent"
          placeholder="What do you want to save?"
          rows="3">${this.escapeHtml(this.newRefContent || '')}</textarea>
      </div>

      <div class="ref-folder-section">
        <div class="ref-section-label">Save to folder</div>

        <div class="ref-category-picker ref-compact">
          ${Object.values(categories).map(cat => `
            <div class="ref-category ${expandedCat === cat.id ? 'expanded' : ''}" data-category="${cat.id}">
              <div class="ref-category-header" onclick="app.toggleRefCategoryNewRef('${cat.id}')">
                <span class="ref-category-icon">${cat.icon}</span>
                <span class="ref-category-name">${cat.name}</span>
                <span class="ref-category-count">${cat.folders.length}</span>
                <span class="ref-category-chevron">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </span>
              </div>
              <div class="ref-category-children">
                ${cat.folders.map(f => `
                  <div class="ref-folder-item ${selectedId === f.id ? 'selected' : ''}"
                       onclick="event.stopPropagation(); app.pickRefFolderNewRef('${f.id}')">
                    <span class="ref-folder-icon">${f.icon || '📁'}</span>
                    <span class="ref-folder-name">${this.escapeHtml(f.name)}</span>
                    ${selectedId === f.id ? '<span class="ref-folder-check">✓</span>' : ''}
                  </div>
                `).join('')}
                <div class="ref-folder-add" onclick="event.stopPropagation(); app.startInlineCreateNewRef('${cat.id}')">
                  <span class="ref-folder-add-icon">+</span>
                  <span class="ref-folder-add-text">New Folder</span>
                </div>
                ${this.refPickerCreatingIn === cat.id ? this.renderInlineFolderCreate(cat.id) : ''}
              </div>
            </div>
          `).join('')}
        </div>

        <div class="ref-unfiled-option compact ${!selectedId ? 'selected' : ''}" onclick="app.pickRefFolderNewRef(null)">
          <span class="ref-unfiled-icon">📥</span>
          <span class="ref-unfiled-text">Unfiled</span>
          ${!selectedId ? '<span class="ref-unfiled-check">✓</span>' : ''}
        </div>
      </div>

      <div class="ref-tags-input-section">
        <div class="ref-section-label">Tags</div>
        <div class="ref-tags-display">
          ${(this.referenceTags || []).map(tag => `
            <span class="ref-tag-chip">
              ${this.escapeHtml(tag)}
              <button class="ref-tag-remove" onclick="app.removeRefTagNewRef('${this.escapeHtml(tag)}')">&times;</button>
            </span>
          `).join('')}
          <input type="text" class="ref-tag-input" id="newRefTagInput" placeholder="Add tags...">
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="app.createNewReferencePremium()">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        Save Reference
      </button>
    </div>
  `;

  // Set up tag input
  const tagInput = document.getElementById('newRefTagInput');
  if (tagInput) {
    tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        let tag = tagInput.value.trim();
        if (tag) {
          if (!tag.startsWith('#')) tag = '#' + tag;
          if (!this.referenceTags.includes(tag)) {
            this.referenceTags.push(tag);
            // Save content before re-render
            this.newRefContent = document.getElementById('newRefContent')?.value || '';
            this.renderNewReferenceModal();
          }
        }
        tagInput.value = '';
      }
    });
  }

  // Focus content textarea
  setTimeout(() => {
    const textarea = document.getElementById('newRefContent');
    if (textarea) textarea.focus();
  }, 50);
};

// Methods for the new reference modal
GTDApp.prototype.toggleRefCategoryNewRef = function(categoryId) {
  this.newRefContent = document.getElementById('newRefContent')?.value || '';
  if (this.refPickerExpandedCategory === categoryId) {
    this.refPickerExpandedCategory = null;
  } else {
    this.refPickerExpandedCategory = categoryId;
  }
  this.refPickerCreatingIn = null;
  this.renderNewReferenceModal();
};

GTDApp.prototype.pickRefFolderNewRef = function(folderId) {
  this.newRefContent = document.getElementById('newRefContent')?.value || '';
  this.selectedReferenceFolder = folderId;
  this.renderNewReferenceModal();
};

GTDApp.prototype.startInlineCreateNewRef = function(categoryId) {
  this.newRefContent = document.getElementById('newRefContent')?.value || '';
  this.refPickerCreatingIn = categoryId;
  this.refPickerSelectedIcon = '📁';
  this.renderNewReferenceModal();
  setTimeout(() => {
    const input = document.getElementById('inlineFolderName');
    if (input) input.focus();
  }, 50);
};

GTDApp.prototype.removeRefTagNewRef = function(tag) {
  this.newRefContent = document.getElementById('newRefContent')?.value || '';
  this.referenceTags = this.referenceTags.filter(t => t !== tag);
  this.renderNewReferenceModal();
};

GTDApp.prototype.createNewReferencePremium = async function() {
  const contentEl = document.getElementById('newRefContent');
  const content = contentEl?.value?.trim();

  if (!content) {
    this.showToast('Please enter content', 'error');
    contentEl?.focus();
    return;
  }

  try {
    const folderId = this.selectedReferenceFolder || null;
    const tags = this.referenceTags || [];
    const title = content.substring(0, 100);

    await db.addToReference(title, content, folderId, tags, null);

    this.closeModal();
    this.showToast('Reference saved!', 'success');

    // Refresh the reference view if we're on it
    if (this.currentView === 'reference') {
      await this.renderReferenceView();
    }
    await this.updateCounts();
  } catch (error) {
    console.error('Failed to create reference:', error);
    this.showToast('Failed to save reference', 'error');
  }
};

// Double-click on folder to add reference directly
GTDApp.prototype.addReferenceToFolder = function(folderId) {
  this.showNewReferenceModal(folderId);
};

// Override renderFolderTree to add double-click and better drag/drop
const originalRenderFolderTree = GTDApp.prototype.renderFolderTree;
GTDApp.prototype.renderFolderTree = async function(folders, items) {
  await originalRenderFolderTree.call(this, folders, items);

  // Add double-click handlers to folder items
  document.querySelectorAll('.folder-item[data-folder]').forEach(el => {
    el.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const folderId = el.getAttribute('data-folder');
      this.addReferenceToFolder(folderId);
    });
  });

  // Enhanced drag/drop for folders
  this.setupNotionDragDrop();
};

// Notion-style drag and drop
GTDApp.prototype.setupNotionDragDrop = function() {
  const folderItems = document.querySelectorAll('.folder-item[data-folder], .folder-group-header');
  const referenceItems = document.querySelectorAll('.reference-item[data-id]');

  // Make reference items draggable with better feedback
  referenceItems.forEach(item => {
    item.setAttribute('draggable', 'true');

    item.addEventListener('dragstart', (e) => {
      item.classList.add('dragging');
      e.dataTransfer.setData('text/plain', item.dataset.id);
      e.dataTransfer.setData('type', 'reference');
      e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });
  });

  // Make folders drop targets
  folderItems.forEach(folder => {
    folder.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      folder.classList.add('drag-over');
    });

    folder.addEventListener('dragleave', (e) => {
      // Only remove if actually leaving the element
      if (!folder.contains(e.relatedTarget)) {
        folder.classList.remove('drag-over');
      }
    });

    folder.addEventListener('drop', async (e) => {
      e.preventDefault();
      folder.classList.remove('drag-over');

      const itemId = e.dataTransfer.getData('text/plain');
      const type = e.dataTransfer.getData('type');
      const folderId = folder.dataset.folder || folder.closest('[data-group]')?.dataset.group;

      if (type === 'reference' && itemId && folderId) {
        try {
          await db.updateReference(itemId, { folderId: folderId });
          this.showToast('Moved to folder!', 'success');
          await this.renderReferenceView();
        } catch (err) {
          console.error('Failed to move item:', err);
          this.showToast('Failed to move', 'error');
        }
      }
    });
  });

  // Also make folder group headers drop targets
  document.querySelectorAll('.folder-group-header').forEach(header => {
    const groupId = header.closest('.folder-group')?.dataset.group;

    header.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      header.classList.add('drag-over');
    });

    header.addEventListener('dragleave', () => {
      header.classList.remove('drag-over');
    });

    header.addEventListener('drop', async (e) => {
      e.preventDefault();
      header.classList.remove('drag-over');

      const itemId = e.dataTransfer.getData('text/plain');
      const type = e.dataTransfer.getData('type');

      if (type === 'reference' && itemId && groupId) {
        try {
          await db.updateReference(itemId, { folderId: groupId });
          this.showToast('Moved to folder!', 'success');
          await this.renderReferenceView();
        } catch (err) {
          console.error('Failed to move item:', err);
          this.showToast('Failed to move', 'error');
        }
      }
    });
  });

  // Set up context menus
  this.setupContextMenus();
};

// =====================================================
// NOTION-STYLE CONTEXT MENU
// =====================================================

GTDApp.prototype.setupContextMenus = function() {
  // Close any existing context menu when clicking elsewhere
  document.addEventListener('click', () => this.closeContextMenu());
  document.addEventListener('scroll', () => this.closeContextMenu(), true);

  // Folder context menu (right-click)
  document.querySelectorAll('.folder-item[data-folder]').forEach(el => {
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const folderId = el.dataset.folder;
      this.showFolderContextMenu(e.clientX, e.clientY, folderId);
    });

    // Long press for mobile
    let pressTimer;
    el.addEventListener('touchstart', (e) => {
      pressTimer = setTimeout(() => {
        e.preventDefault();
        el.classList.add('long-press-active');
        Haptic.heavy(); // Haptic feedback on long-press
        const touch = e.touches[0];
        const folderId = el.dataset.folder;
        this.showFolderContextMenu(touch.clientX, touch.clientY, folderId);
      }, 500);
    });

    el.addEventListener('touchend', () => {
      clearTimeout(pressTimer);
      el.classList.remove('long-press-active');
    });

    el.addEventListener('touchmove', () => {
      clearTimeout(pressTimer);
      el.classList.remove('long-press-active');
    });
  });

  // Reference item context menu
  document.querySelectorAll('.reference-item[data-id]').forEach(el => {
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const itemId = el.dataset.id;
      this.showReferenceContextMenu(e.clientX, e.clientY, itemId);
    });

    // Long press for mobile
    let pressTimer;
    el.addEventListener('touchstart', (e) => {
      pressTimer = setTimeout(() => {
        e.preventDefault();
        el.classList.add('long-press-active');
        Haptic.heavy(); // Haptic feedback on long-press
        const touch = e.touches[0];
        const itemId = el.dataset.id;
        this.showReferenceContextMenu(touch.clientX, touch.clientY, itemId);
      }, 500);
    });

    el.addEventListener('touchend', () => {
      clearTimeout(pressTimer);
      el.classList.remove('long-press-active');
    });

    el.addEventListener('touchmove', () => {
      clearTimeout(pressTimer);
      el.classList.remove('long-press-active');
    });
  });
};

GTDApp.prototype.showFolderContextMenu = function(x, y, folderId) {
  this.closeContextMenu();

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.id = 'contextMenu';

  menu.innerHTML = `
    <button class="context-menu-item" onclick="app.editFolder('${folderId}'); app.closeContextMenu();">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
      Edit Folder
    </button>
    <button class="context-menu-item" onclick="app.addReferenceToFolder('${folderId}'); app.closeContextMenu();">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      Add Reference Here
    </button>
    <div class="context-menu-divider"></div>
    <button class="context-menu-item danger" onclick="app.deleteFolder('${folderId}'); app.closeContextMenu();">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
      Delete Folder
    </button>
  `;

  // Position menu
  menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - 150) + 'px';

  document.body.appendChild(menu);
};

GTDApp.prototype.showReferenceContextMenu = function(x, y, itemId) {
  this.closeContextMenu();

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.id = 'contextMenu';

  menu.innerHTML = `
    <button class="context-menu-item" onclick="app.editReference('${itemId}'); app.closeContextMenu();">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
      Edit
    </button>
    <button class="context-menu-item" onclick="app.moveReferenceToFolder('${itemId}'); app.closeContextMenu();">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      Move to Folder
    </button>
    <div class="context-menu-divider"></div>
    <button class="context-menu-item danger" onclick="app.deleteReference('${itemId}'); app.closeContextMenu();">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
      Delete
    </button>
  `;

  // Position menu
  menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - 180) + 'px';

  document.body.appendChild(menu);
};

GTDApp.prototype.closeContextMenu = function() {
  const existing = document.getElementById('contextMenu');
  if (existing) existing.remove();
};


// =====================================================
// 17. QUICK-ADD WAITING FOR
// =====================================================

GTDApp.prototype.showQuickWaitingFor = function() {
  const modal = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  modal.classList.add('active');

  content.innerHTML = `
    <div class="modal-header">
      <h3>Quick Add - Waiting For</h3>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>What are you waiting for?</label>
        <textarea id="waitingForText" class="form-input" rows="3"
          placeholder="e.g., Response from Bob about the proposal"></textarea>
      </div>

      <div class="form-group">
        <label>Who are you waiting on?</label>
        <input type="text" id="waitingForPerson" class="form-input"
          placeholder="Person's name" list="waitingPersonSuggestions">
        <datalist id="waitingPersonSuggestions"></datalist>
      </div>

      <div class="form-group">
        <label>How did you communicate?</label>
        <div class="waiting-method-picker">
          <button class="method-btn selected" data-method="email" onclick="app.selectWaitingMethod(this)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            Email
          </button>
          <button class="method-btn" data-method="text" onclick="app.selectWaitingMethod(this)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Text
          </button>
          <button class="method-btn" data-method="verbal" onclick="app.selectWaitingMethod(this)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            </svg>
            Verbal
          </button>
          <button class="method-btn" data-method="other" onclick="app.selectWaitingMethod(this)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            Other
          </button>
        </div>
      </div>

      <div class="form-group">
        <label>Follow-up date (optional)</label>
        <input type="date" id="waitingForFollowUp" class="form-input">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="app.saveQuickWaitingFor()">Add to Waiting For</button>
    </div>
  `;

  this._quickWaitingMethod = 'email';

  // Populate person suggestions from team members and contacts
  this.populateWaitingPersonSuggestions();
};

GTDApp.prototype.selectWaitingMethod = function(btn) {
  document.querySelectorAll('.method-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  this._quickWaitingMethod = btn.dataset.method;
};

GTDApp.prototype.populateWaitingPersonSuggestions = async function() {
  const datalist = document.getElementById('waitingPersonSuggestions');
  if (!datalist) return;

  try {
    const targets = await db.getAllDelegationTargets();
    let html = '';
    for (const m of (targets.team || [])) {
      html += `<option value="${this.escapeHtml(m.name)}">`;
    }
    for (const c of (targets.contacts || [])) {
      html += `<option value="${this.escapeHtml(c.name)}">`;
    }
    datalist.innerHTML = html;
  } catch (e) {
    // If getAllDelegationTargets isn't available, that's fine
  }
};

GTDApp.prototype.saveQuickWaitingFor = async function() {
  const text = document.getElementById('waitingForText')?.value?.trim();
  const person = document.getElementById('waitingForPerson')?.value?.trim();
  const followUp = document.getElementById('waitingForFollowUp')?.value;

  if (!text) {
    this.showToast('Please describe what you\'re waiting for', 'error');
    return;
  }
  if (!person) {
    this.showToast('Please enter who you\'re waiting on', 'error');
    return;
  }

  try {
    const waitingItem = {
      action: text,
      delegatedTo: person,
      delegatedToId: null,
      delegatedToType: 'manual',
      delegationMethod: this._quickWaitingMethod || 'other',
      originalContent: text,
      delegatedDate: new Date().toISOString(),
      followUpCount: 0,
      followUpDate: followUp || null,
      completed: false
    };

    await db.add('waitingFor', waitingItem);

    this.closeModal();
    await this.updateCounts();
    this.showToast('Added to Waiting For!', 'success');

    if (this.currentView === 'waitingFor') {
      await this.renderWaitingForView();
    }
  } catch (e) {
    console.error('Failed to add waiting for:', e);
    this.showToast('Failed to save', 'error');
  }
};


// =====================================================
// 16. QUICK DELEGATE FROM INBOX
// =====================================================

GTDApp.prototype.quickDelegateFromInbox = async function(inboxId) {
  try {
    const item = await db.get('inbox', inboxId);
    if (!item) {
      this.showToast('Item not found', 'error');
      return;
    }

    // Store for later use
    this._quickDelegateItem = item;
    this._quickDelegatePersonId = null;
    this._quickDelegatePersonType = null;
    this._quickDelegateMethod = 'email';

    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    await this.renderQuickDelegateModal(item);
  } catch (error) {
    console.error('Failed to load inbox item:', error);
    this.showToast('Failed to load item', 'error');
  }
};

GTDApp.prototype.renderQuickDelegateModal = async function(item) {
  const content = document.getElementById('modalContent');
  const targets = await db.getAllDelegationTargets();

  content.innerHTML = `
    <div class="modal-header">
      <h3>Add to Waiting For</h3>
    </div>
    <div class="modal-body">
      <div class="processing-content">${this.escapeHtml(this.truncate(item.content, 150))}</div>

      <div class="form-group">
        <label>What needs to be done?</label>
        <textarea id="quickDelegateAction" class="form-input" rows="2" placeholder="Describe the action...">${this.escapeHtml(item.content)}</textarea>
      </div>

      <div class="form-group">
        <label>Who will do this?</label>
        <div class="quick-delegate-people" id="quickDelegatePeople">
          ${this.renderQuickDelegatePeoplePicker(targets)}
        </div>
      </div>

      <div id="inlinePersonForm" style="display: none;" class="inline-person-form">
        <div class="form-row">
          <input type="text" id="newPersonName" class="form-input" placeholder="Name (required)">
          <input type="email" id="newPersonEmail" class="form-input" placeholder="Email (optional)">
        </div>
        <div class="form-row">
          <button class="btn btn-secondary btn-sm" onclick="app.cancelInlinePerson()">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="app.saveInlinePerson()">Add Person</button>
        </div>
      </div>

      <div class="form-group">
        <label>How are you communicating this?</label>
        <div class="method-picker">
          <button class="method-btn ${this._quickDelegateMethod === 'email' ? 'selected' : ''}" data-method="email" onclick="app.selectQuickDelegateMethod('email')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            Email
          </button>
          <button class="method-btn ${this._quickDelegateMethod === 'text' ? 'selected' : ''}" data-method="text" onclick="app.selectQuickDelegateMethod('text')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Text
          </button>
          <button class="method-btn ${this._quickDelegateMethod === 'verbal' ? 'selected' : ''}" data-method="verbal" onclick="app.selectQuickDelegateMethod('verbal')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            </svg>
            Verbal
          </button>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="app.submitQuickDelegate()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        Add
      </button>
    </div>
  `;
};

GTDApp.prototype.renderQuickDelegatePeoplePicker = function(targets) {
  const selectedId = this._quickDelegatePersonId;
  const selectedType = this._quickDelegatePersonType;

  let html = '<div class="people-grid">';

  // Team members
  if (targets.team && targets.team.length > 0) {
    for (const person of targets.team) {
      const isSelected = selectedId === person.id && selectedType === 'team';
      html += `
        <button class="person-chip ${isSelected ? 'selected' : ''}" onclick="app.selectQuickDelegatePerson('${person.id}', 'team')">
          <span class="person-avatar">${this.getInitials(person.name)}</span>
          <span class="person-name">${this.escapeHtml(person.name)}</span>
        </button>`;
    }
  }

  // Contacts
  if (targets.contacts && targets.contacts.length > 0) {
    for (const person of targets.contacts) {
      const isSelected = selectedId === person.id && selectedType === 'contact';
      html += `
        <button class="person-chip ${isSelected ? 'selected' : ''}" onclick="app.selectQuickDelegatePerson('${person.id}', 'contact')">
          <span class="person-avatar contact">${this.getInitials(person.name)}</span>
          <span class="person-name">${this.escapeHtml(person.name)}</span>
        </button>`;
    }
  }

  // Add new person button
  html += `
    <button class="person-chip add-new" onclick="app.showInlinePersonForm()">
      <span class="person-avatar add">+</span>
      <span class="person-name">New Person</span>
    </button>`;

  html += '</div>';

  if (!targets.team?.length && !targets.contacts?.length) {
    html = `
      <div class="empty-people">
        <p>No team members or contacts yet</p>
        <button class="btn btn-secondary btn-sm" onclick="app.showInlinePersonForm()">+ Add First Person</button>
      </div>`;
  }

  return html;
};

GTDApp.prototype.getInitials = function(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

GTDApp.prototype.selectQuickDelegatePerson = function(personId, personType) {
  this._quickDelegatePersonId = personId;
  this._quickDelegatePersonType = personType;

  // Update UI
  document.querySelectorAll('.person-chip').forEach(chip => {
    chip.classList.remove('selected');
  });
  event.currentTarget.classList.add('selected');
};

GTDApp.prototype.selectQuickDelegateMethod = function(method) {
  this._quickDelegateMethod = method;

  // Update UI
  document.querySelectorAll('.method-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.method === method);
  });
};

GTDApp.prototype.showInlinePersonForm = function() {
  document.getElementById('inlinePersonForm').style.display = 'block';
  document.getElementById('newPersonName').focus();
};

GTDApp.prototype.cancelInlinePerson = function() {
  document.getElementById('inlinePersonForm').style.display = 'none';
  document.getElementById('newPersonName').value = '';
  document.getElementById('newPersonEmail').value = '';
};

GTDApp.prototype.saveInlinePerson = async function() {
  const name = document.getElementById('newPersonName').value.trim();
  const email = document.getElementById('newPersonEmail').value.trim();

  if (!name) {
    this.showToast('Please enter a name', 'error');
    return;
  }

  try {
    const newPerson = await db.addTeamMember({
      name: name,
      email: email,
      role: '',
      phone: '',
      notes: ''
    });

    // Auto-select the new person
    this._quickDelegatePersonId = newPerson.id;
    this._quickDelegatePersonType = 'team';

    // Hide form and refresh picker
    this.cancelInlinePerson();

    // Refresh the people picker
    const targets = await db.getAllDelegationTargets();
    document.getElementById('quickDelegatePeople').innerHTML = this.renderQuickDelegatePeoplePicker(targets);

    this.showToast(`Added ${name}`, 'success');
  } catch (e) {
    console.error('Failed to add person:', e);
    this.showToast('Failed to add person', 'error');
  }
};

GTDApp.prototype.submitQuickDelegate = async function() {
  const actionText = document.getElementById('quickDelegateAction').value.trim();

  if (!actionText) {
    this.showToast('Please describe what needs to be done', 'error');
    return;
  }

  if (!this._quickDelegatePersonId) {
    this.showToast('Please select who will do this', 'error');
    return;
  }

  try {
    // Get person details
    let targetPerson;
    if (this._quickDelegatePersonType === 'team') {
      targetPerson = await db.getTeamMember(this._quickDelegatePersonId);
      targetPerson.type = 'team';
    } else {
      targetPerson = await db.getContact(this._quickDelegatePersonId);
      targetPerson.type = 'contact';
    }

    // Create waiting for item
    await db.delegateAction(
      actionText,
      targetPerson,
      this._quickDelegateMethod,
      this._quickDelegateItem.content,
      null
    );

    // Delete from inbox
    await db.delete('inbox', this._quickDelegateItem.id);

    // Clean up
    this._quickDelegateItem = null;
    this._quickDelegatePersonId = null;
    this._quickDelegatePersonType = null;

    this.closeModal();
    await this.updateCounts();
    await this.renderCurrentView();
    this.showToast(`Delegated to ${targetPerson.name}!`, 'success');
  } catch (e) {
    console.error('Failed to delegate:', e);
    this.showToast('Failed to delegate', 'error');
  }
};


// =====================================================
// 17. STREAMLINED PROCESSING FLOW (2 STEPS)
// =====================================================

// Override showProcessingModal to use streamlined flow
const _originalShowProcessingModal = GTDApp.prototype.showProcessingModal;

GTDApp.prototype.showProcessingModal = async function() {
  // Use new streamlined flow for steps 1-2, fall back to original for other steps
  if (this.processingStep === 1) {
    await this.renderStreamlinedStep1();
    return;
  }
  if (this.processingStep === 2) {
    await this.renderStreamlinedStep2();
    return;
  }
  // For reference and other steps, use original
  if (typeof _originalShowProcessingModal === 'function') {
    return _originalShowProcessingModal.call(this);
  }
};

GTDApp.prototype.renderStreamlinedStep1 = async function() {
  const modal = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  modal.classList.add('active');

  const item = this.processingItem;

  // Try to extract action from content using NLP
  let suggestedAction = item.content;
  if (this.settings.enableNLP && typeof this.enhancedNLPParse === 'function') {
    const parsed = this.enhancedNLPParse(item.content);
    if (parsed.cleanText) suggestedAction = parsed.cleanText;
  }

  content.innerHTML = `
    <div class="modal-header">
      <h3>What's the action?</h3>
      <span class="step-indicator">Step 1 of 2</span>
    </div>
    <div class="modal-body">
      <div class="processing-content">${this.escapeHtml(item.content)}</div>

      <div class="form-group">
        <label>Is this actionable?</label>
        <div class="actionable-choice">
          <button class="btn ${this._isActionable !== false ? 'btn-primary' : 'btn-secondary'}" onclick="app.setActionable(true)">
            Yes, it's actionable
          </button>
          <button class="btn ${this._isActionable === false ? 'btn-primary' : 'btn-secondary'}" onclick="app.setActionable(false)">
            No, just reference
          </button>
        </div>
      </div>

      <div id="actionInputSection" style="display: ${this._isActionable === false ? 'none' : 'block'}">
        <div class="form-group">
          <label>What's the very next physical action?</label>
          <textarea id="streamlinedActionText" class="form-input" rows="2"
            placeholder="e.g., Call John about the proposal...">${this.escapeHtml(this.actionText || suggestedAction)}</textarea>
        </div>

        ${this.actionSuggestions.length > 0 ? `
          <div class="suggestions-section">
            <p class="suggestions-label">Suggestions:</p>
            <div class="action-suggestions">
              ${this.actionSuggestions.map(s => {
                const text = typeof s === 'string' ? s : (s.action || s.text || '');
                return `<button class="action-suggestion" onclick="document.getElementById('streamlinedActionText').value = '${this.escapeHtml(text).replace(/'/g, "\\'")}'">
                  ${this.escapeHtml(text)}
                </button>`;
              }).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="app.cancelProcessing()">Cancel</button>
      <button class="btn btn-primary" onclick="app.streamlinedNext1()">
        Next
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    </div>
  `;

  // Default to actionable
  if (this._isActionable === undefined) this._isActionable = true;
};

GTDApp.prototype.setActionable = function(isActionable) {
  this._isActionable = isActionable;
  document.getElementById('actionInputSection').style.display = isActionable ? 'block' : 'none';

  // Update button states
  const btns = document.querySelectorAll('.actionable-choice .btn');
  btns[0].className = `btn ${isActionable ? 'btn-primary' : 'btn-secondary'}`;
  btns[1].className = `btn ${!isActionable ? 'btn-primary' : 'btn-secondary'}`;
};

GTDApp.prototype.streamlinedNext1 = function() {
  if (this._isActionable === false) {
    // Go to reference flow
    this.processingStep = 'reference';
    this.showProcessingModal();
    return;
  }

  const actionText = document.getElementById('streamlinedActionText')?.value?.trim();
  if (!actionText) {
    this.showToast('Please enter what needs to be done', 'error');
    return;
  }

  this.actionText = actionText;
  this.processingStep = 2;
  this.showProcessingModal();
};

GTDApp.prototype.renderStreamlinedStep2 = async function() {
  const modal = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  modal.classList.add('active');

  const targets = await db.getAllDelegationTargets();
  const projects = await db.getProjects();
  const activeProjects = (projects || []).filter(p => p.status === 'active');

  // Initialize defaults
  if (!this.selectedContexts) this.selectedContexts = [];
  if (!this.selectedPriority) this.selectedPriority = 'medium';
  if (!this._streamlinedWho) this._streamlinedWho = 'me';
  if (!this._streamlinedPersonId) this._streamlinedPersonId = null;

  content.innerHTML = `
    <div class="modal-header">
      <h3>Details</h3>
      <span class="step-indicator">Step 2 of 2</span>
    </div>
    <div class="modal-body">
      <div class="processing-content">${this.escapeHtml(this.actionText)}</div>

      <div class="processing-combined-step">
        <!-- Who Section -->
        <div class="processing-section">
          <div class="processing-section-title">Who's doing this?</div>
          <div class="who-picker">
            <button class="who-option ${this._streamlinedWho === 'me' ? 'selected' : ''}" onclick="app.setStreamlinedWho('me')">
              <span class="avatar">ME</span>
              <span>I'll do it</span>
            </button>
            <div class="person-dropdown">
              <button class="person-dropdown-btn ${this._streamlinedWho === 'person' ? 'has-selection' : ''}" onclick="app.togglePersonDropdown()">
                <span>${this._streamlinedPersonId ? this._streamlinedPersonName : 'Waiting on...'}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              <div class="person-dropdown-menu" id="personDropdownMenu" style="display: none;">
                ${(targets.team || []).map(p => `
                  <button class="person-dropdown-item" onclick="app.selectStreamlinedPerson('${p.id}', 'team', '${this.escapeHtml(p.name).replace(/'/g, "\\'")}')">
                    ${this.escapeHtml(p.name)}
                  </button>
                `).join('')}
                ${(targets.contacts || []).map(p => `
                  <button class="person-dropdown-item contact" onclick="app.selectStreamlinedPerson('${p.id}', 'contact', '${this.escapeHtml(p.name).replace(/'/g, "\\'")}')">
                    ${this.escapeHtml(p.name)}
                  </button>
                `).join('')}
                <button class="person-dropdown-item add-new" onclick="app.addPersonFromProcessing()">
                  + Add New Person
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Context & Priority (only show if "Me") -->
        <div id="meDetailsSection" style="display: ${this._streamlinedWho === 'me' ? 'block' : 'none'}">
          <div class="context-priority-row">
            <div class="processing-section">
              <div class="processing-section-title">Context</div>
              <div class="context-pills">
                ${this.contexts.map(ctx => `
                  <button class="context-pill-btn ${this.selectedContexts.includes(ctx) ? 'selected' : ''}"
                    onclick="app.toggleStreamlinedContext('${ctx}')">
                    ${ctx}
                  </button>
                `).join('')}
              </div>
            </div>

            <div class="processing-section">
              <div class="processing-section-title">Priority</div>
              <div class="priority-btns">
                <button class="priority-btn high ${this.selectedPriority === 'high' ? 'selected' : ''}" onclick="app.setStreamlinedPriority('high')">High</button>
                <button class="priority-btn medium ${this.selectedPriority === 'medium' ? 'selected' : ''}" onclick="app.setStreamlinedPriority('medium')">Medium</button>
                <button class="priority-btn low ${this.selectedPriority === 'low' ? 'selected' : ''}" onclick="app.setStreamlinedPriority('low')">Low</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Delegation Method (only show if delegating) -->
        <div id="delegationMethodSection" style="display: ${this._streamlinedWho === 'person' ? 'block' : 'none'}">
          <div class="processing-section">
            <div class="processing-section-title">How are you communicating this?</div>
            <div class="method-picker">
              <button class="method-btn ${this._streamlinedMethod === 'email' ? 'selected' : ''}" data-method="email" onclick="app.setStreamlinedMethod('email')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                Email
              </button>
              <button class="method-btn ${this._streamlinedMethod === 'text' ? 'selected' : ''}" data-method="text" onclick="app.setStreamlinedMethod('text')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                Text
              </button>
              <button class="method-btn ${this._streamlinedMethod === 'verbal' ? 'selected' : ''}" data-method="verbal" onclick="app.setStreamlinedMethod('verbal')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                </svg>
                Verbal
              </button>
            </div>
          </div>
        </div>

        <!-- Due Date & Project -->
        <div class="due-project-row">
          <div class="processing-section">
            <div class="processing-section-title">Due Date</div>
            <select id="streamlinedDueDate" class="form-input form-select" onchange="app.setStreamlinedDueDate(this.value)">
              <option value="">None</option>
              <option value="today">Today</option>
              <option value="tomorrow">Tomorrow</option>
              <option value="week">Next Week</option>
              <option value="custom">Pick a date...</option>
            </select>
            <input type="date" id="streamlinedCustomDate" class="form-input" style="display: none; margin-top: 8px;"
              onchange="app.selectedDueDate = this.value">
          </div>

          <div class="processing-section">
            <div class="processing-section-title">Project</div>
            <select id="streamlinedProject" class="form-input form-select">
              <option value="">None</option>
              ${activeProjects.map(p => `
                <option value="${p.id}">${this.escapeHtml(p.name)}</option>
              `).join('')}
            </select>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="app.processingStep = 1; app.showProcessingModal()">Back</button>
      <button class="btn btn-primary" onclick="app.submitStreamlinedProcessing()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        ${this._streamlinedWho === 'me' ? 'Save Action' : 'Delegate'}
      </button>
    </div>
  `;

  // Set default method
  if (!this._streamlinedMethod) this._streamlinedMethod = 'email';
};

GTDApp.prototype.setStreamlinedWho = function(who) {
  this._streamlinedWho = who;
  if (who === 'me') {
    this._streamlinedPersonId = null;
    this._streamlinedPersonName = null;
  }

  // Update UI
  document.querySelectorAll('.who-option').forEach(btn => {
    btn.classList.toggle('selected', btn.textContent.includes("I'll do it") && who === 'me');
  });
  document.querySelector('.person-dropdown-btn').classList.toggle('has-selection', who === 'person');

  document.getElementById('meDetailsSection').style.display = who === 'me' ? 'block' : 'none';
  document.getElementById('delegationMethodSection').style.display = who === 'person' ? 'block' : 'none';

  // Update save button text
  const saveBtn = document.querySelector('.modal-footer .btn-primary');
  if (saveBtn) {
    saveBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      ${who === 'me' ? 'Save Action' : 'Delegate'}
    `;
  }
};

GTDApp.prototype.togglePersonDropdown = function() {
  const menu = document.getElementById('personDropdownMenu');
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
};

GTDApp.prototype.selectStreamlinedPerson = function(personId, personType, personName) {
  this._streamlinedWho = 'person';
  this._streamlinedPersonId = personId;
  this._streamlinedPersonType = personType;
  this._streamlinedPersonName = personName;

  // Update dropdown button text
  document.querySelector('.person-dropdown-btn span').textContent = personName;
  document.querySelector('.person-dropdown-btn').classList.add('has-selection');

  // Hide dropdown
  document.getElementById('personDropdownMenu').style.display = 'none';

  // Update who picker
  document.querySelectorAll('.who-option').forEach(btn => btn.classList.remove('selected'));
  document.getElementById('meDetailsSection').style.display = 'none';
  document.getElementById('delegationMethodSection').style.display = 'block';

  // Update save button
  const saveBtn = document.querySelector('.modal-footer .btn-primary');
  if (saveBtn) {
    saveBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      Delegate
    `;
  }
};

GTDApp.prototype.addPersonFromProcessing = async function() {
  // Hide dropdown
  document.getElementById('personDropdownMenu').style.display = 'none';

  const name = prompt('Enter person name:');
  if (!name || !name.trim()) return;

  try {
    const newPerson = await db.addTeamMember({
      name: name.trim(),
      email: '',
      role: '',
      phone: '',
      notes: ''
    });

    this.selectStreamlinedPerson(newPerson.id, 'team', newPerson.name);
    this.showToast(`Added ${newPerson.name}`, 'success');
  } catch (e) {
    console.error('Failed to add person:', e);
    this.showToast('Failed to add person', 'error');
  }
};

GTDApp.prototype.toggleStreamlinedContext = function(context) {
  const idx = this.selectedContexts.indexOf(context);
  if (idx >= 0) {
    this.selectedContexts.splice(idx, 1);
  } else {
    this.selectedContexts.push(context);
  }

  // Update UI
  document.querySelectorAll('.context-pill-btn').forEach(btn => {
    const ctx = btn.textContent.trim();
    btn.classList.toggle('selected', this.selectedContexts.includes(ctx));
  });
};

GTDApp.prototype.setStreamlinedPriority = function(priority) {
  this.selectedPriority = priority;

  document.querySelectorAll('.priority-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.classList.contains(priority));
  });
};

GTDApp.prototype.setStreamlinedMethod = function(method) {
  this._streamlinedMethod = method;

  document.querySelectorAll('.method-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.method === method);
  });
};

GTDApp.prototype.setStreamlinedDueDate = function(value) {
  const customInput = document.getElementById('streamlinedCustomDate');

  if (value === 'custom') {
    customInput.style.display = 'block';
    customInput.focus();
    return;
  }

  customInput.style.display = 'none';

  if (value === '') {
    this.selectedDueDate = null;
  } else if (value === 'today') {
    this.selectedDueDate = new Date().toISOString().split('T')[0];
  } else if (value === 'tomorrow') {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    this.selectedDueDate = d.toISOString().split('T')[0];
  } else if (value === 'week') {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    this.selectedDueDate = d.toISOString().split('T')[0];
  }
};

GTDApp.prototype.submitStreamlinedProcessing = async function() {
  const projectId = document.getElementById('streamlinedProject')?.value || null;

  try {
    if (this._streamlinedWho === 'me') {
      // Save as next action
      const action = {
        action: this.actionText,
        contexts: this.selectedContexts.length > 0 ? this.selectedContexts : ['@anywhere'],
        priority: this.selectedPriority || 'medium',
        dueDate: this.selectedDueDate || null,
        projectId: projectId,
        originalContent: this.processingItem.content,
        originalTimestamp: this.processingItem.timestamp,
        originalType: this.processingItem.type || 'text',
        processedDate: new Date().toISOString(),
        completed: false
      };

      await db.add('nextActions', action);
      await db.delete('inbox', this.processingItem.id);

      this.showToast('Action saved!', 'success');

      // Track achievement
      if (typeof this.trackAchievement === 'function') {
        const inbox = await db.getInbox();
        if (inbox.length === 0) this.trackAchievement('inbox_zero');
      }

    } else {
      // Delegate
      let targetPerson;
      if (this._streamlinedPersonType === 'team') {
        targetPerson = await db.getTeamMember(this._streamlinedPersonId);
        targetPerson.type = 'team';
      } else {
        targetPerson = await db.getContact(this._streamlinedPersonId);
        targetPerson.type = 'contact';
      }

      await db.delegateAction(
        this.actionText,
        targetPerson,
        this._streamlinedMethod || 'verbal',
        this.processingItem.content,
        projectId
      );

      await db.delete('inbox', this.processingItem.id);

      this.showToast(`Delegated to ${targetPerson.name}!`, 'success');
    }

    // Clean up state
    this.processingItem = null;
    this.processingStep = 1;
    this.actionText = '';
    this.selectedContexts = [];
    this.selectedPriority = 'medium';
    this.selectedDueDate = null;
    this._streamlinedWho = 'me';
    this._streamlinedPersonId = null;
    this._streamlinedPersonType = null;
    this._streamlinedPersonName = null;
    this._isActionable = undefined;

    this.closeModal();
    await this.updateCounts();
    await this.renderCurrentView();

  } catch (e) {
    console.error('Failed to process:', e);
    this.showToast('Failed to save', 'error');
  }
};

GTDApp.prototype.cancelProcessing = function() {
  this.processingItem = null;
  this.processingStep = 1;
  this._isActionable = undefined;
  this.closeModal();
};


console.log('features.js loaded');
