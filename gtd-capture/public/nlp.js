// nlp.js - Natural Language Parser for GTD Capture System

class NaturalLanguageParser {
  constructor() {
    // Context keyword mappings
    this.contextKeywords = {
      '@phone': ['call', 'phone', 'ring', 'dial', 'voicemail'],
      '@email': ['email', 'mail', 'send', 'reply', 'forward', 'cc'],
      '@errands': ['buy', 'pick up', 'pickup', 'get', 'grab', 'shop', 'store', 'return', 'drop off', 'dropoff'],
      '@computer': ['research', 'look up', 'lookup', 'search', 'google', 'download', 'upload', 'file', 'document'],
      '@office': ['print', 'fax', 'scan', 'copy', 'file', 'organize'],
      '@waiting': ['waiting', 'waiting on', 'waiting for', 'expect', 'pending']
    };

    // Action type indicators
    this.waitingIndicators = ['waiting on', 'waiting for', 'waiting', 'expect from', 'need from', 'pending from'];

    // Date patterns
    this.datePatterns = {
      'today': 0,
      'tonight': 0,
      'tomorrow': 1,
      'day after tomorrow': 2,
      'next week': 7,
      'next month': 30,
      'this weekend': null, // Calculated
      'monday': null,
      'tuesday': null,
      'wednesday': null,
      'thursday': null,
      'friday': null,
      'saturday': null,
      'sunday': null
    };

    // Priority indicators
    this.priorityKeywords = {
      high: ['urgent', 'asap', 'immediately', 'critical', 'important', 'priority', 'rush'],
      low: ['someday', 'eventually', 'when possible', 'low priority', 'whenever']
    };

    // Team members and contacts will be loaded dynamically
    this.teamMembers = [];
    this.contacts = [];
    this.projects = [];
  }

  // Load people and projects from database
  async loadEntities() {
    try {
      this.teamMembers = await db.getTeamMembers();
      this.contacts = await db.getContacts();
      this.projects = await db.getProjects('active');
    } catch (e) {
      console.error('Failed to load entities for NLP:', e);
    }
  }

  // Main parse function
  async parse(text) {
    await this.loadEntities();

    const lowerText = text.toLowerCase();

    const result = {
      originalText: text,
      cleanedText: text,
      contexts: [],
      person: null,
      personType: null, // 'team' or 'contact'
      project: null,
      dueDate: null,
      dueDateText: null,
      priority: 'medium',
      isWaitingFor: false,
      suggestedAction: null,
      confidence: 0
    };

    // Detect waiting-for pattern
    result.isWaitingFor = this.detectWaitingFor(lowerText);

    // Detect contexts
    result.contexts = this.detectContexts(lowerText);

    // Detect person (team member or contact)
    const personResult = this.detectPerson(lowerText);
    if (personResult) {
      result.person = personResult.person;
      result.personType = personResult.type;
    }

    // Detect project
    result.project = this.detectProject(lowerText);

    // Detect date
    const dateResult = this.detectDate(lowerText);
    if (dateResult) {
      result.dueDate = dateResult.date;
      result.dueDateText = dateResult.text;
    }

    // Detect priority
    result.priority = this.detectPriority(lowerText);

    // Generate suggested action text
    result.suggestedAction = this.generateActionText(result);

    // Clean up the text (remove detected entities for cleaner action)
    result.cleanedText = this.cleanText(text, result);

    // Calculate confidence score
    result.confidence = this.calculateConfidence(result);

    return result;
  }

  detectWaitingFor(text) {
    for (const indicator of this.waitingIndicators) {
      if (text.includes(indicator)) {
        return true;
      }
    }
    return false;
  }

  detectContexts(text) {
    const contexts = new Set();

    for (const [context, keywords] of Object.entries(this.contextKeywords)) {
      for (const keyword of keywords) {
        // Match whole words or at word boundaries
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(text)) {
          // Don't add @waiting as context, it's handled separately
          if (context !== '@waiting') {
            contexts.add(context);
          }
          break;
        }
      }
    }

    return Array.from(contexts);
  }

  detectPerson(text) {
    // Check team members first (higher priority)
    for (const member of this.teamMembers) {
      const nameRegex = new RegExp(`\\b${member.name.toLowerCase()}\\b`, 'i');
      if (nameRegex.test(text)) {
        return { person: member, type: 'team' };
      }
    }

    // Check contacts
    for (const contact of this.contacts) {
      const nameRegex = new RegExp(`\\b${contact.name.toLowerCase()}\\b`, 'i');
      if (nameRegex.test(text)) {
        return { person: contact, type: 'contact' };
      }
    }

    return null;
  }

  detectProject(text) {
    const lowerText = text.toLowerCase();

    for (const project of this.projects) {
      const projectName = project.name.toLowerCase();
      // Check for project name (at least 3 chars to avoid false matches)
      if (projectName.length >= 3 && lowerText.includes(projectName)) {
        return project;
      }

      // Also check for key words from project name
      const projectWords = projectName.split(/\s+/).filter(w => w.length >= 4);
      for (const word of projectWords) {
        if (lowerText.includes(word)) {
          return project;
        }
      }
    }

    return null;
  }

  detectDate(text) {
    const lowerText = text.toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check for specific date patterns
    for (const [pattern, daysOffset] of Object.entries(this.datePatterns)) {
      if (lowerText.includes(pattern)) {
        if (daysOffset !== null) {
          const date = new Date(today);
          date.setDate(date.getDate() + daysOffset);
          return { date: date.toISOString().split('T')[0], text: pattern };
        } else {
          // Handle day names
          const dayDate = this.getNextDayOfWeek(pattern);
          if (dayDate) {
            return { date: dayDate.toISOString().split('T')[0], text: pattern };
          }
        }
      }
    }

    // Check for "this weekend"
    if (lowerText.includes('this weekend')) {
      const saturday = this.getNextDayOfWeek('saturday');
      return { date: saturday.toISOString().split('T')[0], text: 'this weekend' };
    }

    // Check for "next [day]" pattern
    const nextDayMatch = lowerText.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
    if (nextDayMatch) {
      const dayDate = this.getNextDayOfWeek(nextDayMatch[1], true);
      return { date: dayDate.toISOString().split('T')[0], text: `next ${nextDayMatch[1]}` };
    }

    // Check for "in X days/weeks" pattern
    const inDaysMatch = lowerText.match(/in\s+(\d+)\s+(day|days|week|weeks)/i);
    if (inDaysMatch) {
      const num = parseInt(inDaysMatch[1]);
      const unit = inDaysMatch[2].toLowerCase();
      const multiplier = unit.startsWith('week') ? 7 : 1;
      const date = new Date(today);
      date.setDate(date.getDate() + (num * multiplier));
      return { date: date.toISOString().split('T')[0], text: `in ${num} ${unit}` };
    }

    // Check for MM/DD or MM-DD format
    const dateMatch = lowerText.match(/(\d{1,2})[\/\-](\d{1,2})/);
    if (dateMatch) {
      const month = parseInt(dateMatch[1]) - 1;
      const day = parseInt(dateMatch[2]);
      const date = new Date(today.getFullYear(), month, day);
      // If date is in the past, assume next year
      if (date < today) {
        date.setFullYear(date.getFullYear() + 1);
      }
      return { date: date.toISOString().split('T')[0], text: dateMatch[0] };
    }

    return null;
  }

  getNextDayOfWeek(dayName, nextWeek = false) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDay = days.indexOf(dayName.toLowerCase());
    if (targetDay === -1) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentDay = today.getDay();

    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0 || nextWeek) {
      daysUntil += 7;
    }

    const result = new Date(today);
    result.setDate(today.getDate() + daysUntil);
    return result;
  }

  detectPriority(text) {
    for (const keyword of this.priorityKeywords.high) {
      if (text.includes(keyword)) {
        return 'high';
      }
    }

    for (const keyword of this.priorityKeywords.low) {
      if (text.includes(keyword)) {
        return 'low';
      }
    }

    return 'medium';
  }

  generateActionText(result) {
    let action = result.originalText;

    // If it's a waiting-for item, format appropriately
    if (result.isWaitingFor && result.person) {
      // Remove waiting indicators and person name to get the core task
      let core = action;
      for (const indicator of this.waitingIndicators) {
        core = core.replace(new RegExp(indicator, 'gi'), '').trim();
      }
      if (result.person) {
        core = core.replace(new RegExp(`\\b${result.person.name}\\b`, 'gi'), '').trim();
      }
      // Clean up extra spaces and prepositions
      core = core.replace(/\s+(for|on|from)\s*$/i, '').trim();
      core = core.replace(/^\s*(for|on|from)\s+/i, '').trim();

      return core || action;
    }

    return action;
  }

  cleanText(text, result) {
    let cleaned = text;

    // Remove date references for cleaner action text
    if (result.dueDateText) {
      cleaned = cleaned.replace(new RegExp(`\\b${result.dueDateText}\\b`, 'gi'), '').trim();
    }

    // Clean up extra spaces
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
  }

  calculateConfidence(result) {
    let score = 0;
    let factors = 0;

    if (result.contexts.length > 0) {
      score += 25;
      factors++;
    }

    if (result.person) {
      score += 30;
      factors++;
    }

    if (result.project) {
      score += 25;
      factors++;
    }

    if (result.dueDate) {
      score += 20;
      factors++;
    }

    if (result.isWaitingFor) {
      score += 20;
      factors++;
    }

    // Normalize to 0-100
    return factors > 0 ? Math.min(100, score) : 0;
  }

  // Format parsed result for display
  formatPreview(result) {
    const parts = [];

    if (result.isWaitingFor) {
      parts.push({ label: 'Type', value: 'Waiting For', icon: '⏳' });
    }

    if (result.person) {
      const personLabel = result.personType === 'team' ? 'Team Member' : 'Contact';
      parts.push({ label: personLabel, value: result.person.name, icon: '👤' });
    }

    if (result.contexts.length > 0) {
      parts.push({ label: 'Context', value: result.contexts.join(', '), icon: '📍' });
    }

    if (result.project) {
      parts.push({ label: 'Project', value: result.project.name, icon: '📁' });
    }

    if (result.dueDate) {
      parts.push({ label: 'Due', value: this.formatDate(result.dueDate), icon: '📅' });
    }

    if (result.priority !== 'medium') {
      const priorityIcon = result.priority === 'high' ? '🔴' : '🔵';
      parts.push({ label: 'Priority', value: result.priority.charAt(0).toUpperCase() + result.priority.slice(1), icon: priorityIcon });
    }

    return parts;
  }

  formatDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.getTime() === today.getTime()) {
      return 'Today';
    } else if (date.getTime() === tomorrow.getTime()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
  }
}

// Export singleton instance
const nlp = new NaturalLanguageParser();
