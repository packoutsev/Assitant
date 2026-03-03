// db.js - IndexedDB wrapper for GTD Capture System

const DB_NAME = 'GTDCaptureDB';
const DB_VERSION = 6;

const STORES = {
  INBOX: 'inbox',
  NEXT_ACTIONS: 'nextActions',
  WAITING_FOR: 'waitingFor',
  REFERENCE: 'reference',
  ARCHIVED: 'archived',
  TRASH: 'trash',
  TEAM_MEMBERS: 'teamMembers',
  CONTACTS: 'contacts',
  TAG_USAGE: 'tagUsage',
  SUGGESTION_PATTERNS: 'suggestionPatterns',
  SETTINGS: 'settings',
  PROJECTS: 'projects',
  REFERENCE_FOLDERS: 'referenceFolders',
  SOMEDAY_MAYBE: 'somedayMaybe',
  TEMPLATES: 'templates',
  AREAS: 'areas'
};

// Pre-built workflow templates
const DEFAULT_TEMPLATES = [
  {
    id: 'insurance-claim',
    name: 'New Insurance Claim',
    category: 'business',
    icon: '🏢',
    isDefault: true,
    actions: [
      { action: 'Receive and document initial loss report', contexts: ['@phone', '@computer'], daysOffset: 0 },
      { action: 'Contact homeowner to schedule inspection', contexts: ['@phone'], daysOffset: 1 },
      { action: 'Complete on-site damage assessment', contexts: ['@office'], daysOffset: 3 },
      { action: 'Take photos and document all damage', contexts: ['@office'], daysOffset: 3 },
      { action: 'Create scope of work document', contexts: ['@computer'], daysOffset: 5 },
      { action: 'Submit estimate to insurance adjuster', contexts: ['@email'], daysOffset: 7 },
      { action: 'Follow up with adjuster for approval', contexts: ['@phone'], daysOffset: 10 },
      { action: 'Schedule crew and order materials', contexts: ['@phone'], daysOffset: 14 },
      { action: 'Begin restoration work', contexts: ['@office'], daysOffset: 17 },
      { action: 'Final walkthrough with homeowner', contexts: ['@office'], daysOffset: 30 }
    ]
  },
  {
    id: 'construction-project',
    name: 'New Construction Project',
    category: 'business',
    icon: '🔨',
    isDefault: true,
    actions: [
      { action: 'Initial client consultation and requirements gathering', contexts: ['@phone', '@office'], daysOffset: 0 },
      { action: 'Create detailed project proposal', contexts: ['@computer'], daysOffset: 3 },
      { action: 'Present proposal and negotiate terms', contexts: ['@office'], daysOffset: 5 },
      { action: 'Finalize contract and collect deposit', contexts: ['@office'], daysOffset: 7 },
      { action: 'Pull necessary permits', contexts: ['@office', '@errands'], daysOffset: 10 },
      { action: 'Order materials and schedule deliveries', contexts: ['@phone'], daysOffset: 12 },
      { action: 'Coordinate subcontractors', contexts: ['@phone'], daysOffset: 14 },
      { action: 'Begin construction phase', contexts: ['@office'], daysOffset: 17 },
      { action: 'Mid-project inspection and client update', contexts: ['@office'], daysOffset: 30 },
      { action: 'Final inspection and punch list', contexts: ['@office'], daysOffset: 45 }
    ]
  },
  {
    id: 'weekly-review',
    name: 'Weekly Review',
    category: 'personal',
    icon: '📋',
    isDefault: true,
    actions: [
      { action: 'Process inbox to zero', contexts: ['@computer'], daysOffset: 0 },
      { action: 'Review and update Next Actions list', contexts: ['@computer'], daysOffset: 0 },
      { action: 'Review Waiting For items and follow up', contexts: ['@phone', '@email'], daysOffset: 0 },
      { action: 'Review all active projects', contexts: ['@computer'], daysOffset: 0 },
      { action: 'Review Someday/Maybe list', contexts: ['@computer'], daysOffset: 0 },
      { action: 'Review calendar for upcoming week', contexts: ['@computer'], daysOffset: 0 },
      { action: 'Plan key priorities for next week', contexts: ['@computer'], daysOffset: 0 }
    ]
  },
  {
    id: 'party-planning',
    name: 'Party Planning',
    category: 'personal',
    icon: '🎉',
    isDefault: true,
    actions: [
      { action: 'Set date and create guest list', contexts: ['@computer'], daysOffset: 0 },
      { action: 'Choose venue and book if needed', contexts: ['@phone'], daysOffset: 2 },
      { action: 'Plan menu and dietary accommodations', contexts: ['@computer'], daysOffset: 5 },
      { action: 'Send invitations', contexts: ['@email'], daysOffset: 7 },
      { action: 'Order or create decorations', contexts: ['@errands', '@computer'], daysOffset: 10 },
      { action: 'Arrange entertainment or activities', contexts: ['@phone'], daysOffset: 14 },
      { action: 'Confirm RSVPs and finalize headcount', contexts: ['@phone', '@email'], daysOffset: 17 },
      { action: 'Shop for food and supplies', contexts: ['@errands'], daysOffset: 19 },
      { action: 'Prepare food that can be made ahead', contexts: ['@office'], daysOffset: 20 },
      { action: 'Set up venue and decorations', contexts: ['@office'], daysOffset: 21 },
      { action: 'Final food prep and party execution', contexts: ['@office'], daysOffset: 21 }
    ]
  }
];

// Suggested team members for onboarding (user can modify)
const SUGGESTED_TEAM_MEMBERS = [
  {
    name: 'Diana',
    role: 'Project Manager & Estimator',
    email: 'diana@encantobuilders.com',
    phone: '',
    color: '#ec4899'
  },
  {
    name: 'Ivan',
    role: 'Admin',
    email: 'ivan@encantobuilders.com',
    phone: '',
    color: '#06b6d4'
  },
  {
    name: 'Anonno',
    role: 'Sales Representative',
    email: 'anonno@encantobuilders.com',
    phone: '',
    color: '#6366f1'
  },
  {
    name: 'Aminta',
    role: 'Executive Operator',
    email: 'aminta@encantobuilders.com',
    phone: '',
    color: '#8b5cf6'
  }
];

// Available roles for team members
const TEAM_ROLES = [
  'Project Manager',
  'Admin',
  'Sales Representative',
  'Estimator',
  'Executive Operator',
  'Contractor',
  'Adjuster',
  'Other'
];

// Contact categories
const CONTACT_CATEGORIES = [
  { id: 'adjuster', name: 'Adjuster', icon: '🏢' },
  { id: 'contractor', name: 'Contractor', icon: '🔧' },
  { id: 'vendor', name: 'Vendor', icon: '🏪' },
  { id: 'client', name: 'Client', icon: '👤' },
  { id: 'other', name: 'Other', icon: '📋' }
];

// Insurance carriers for adjuster contacts
const INSURANCE_CARRIERS = [
  'USAA', 'Travelers', 'State Farm', 'Allstate', 'Liberty Mutual',
  'Progressive', 'Nationwide', 'Farmers', 'American Family', 'Other'
];

// Smart suggestion patterns
const DEFAULT_SUGGESTION_PATTERNS = [
  { keywords: ['estimate', 'estimating', 'xactimate'], suggestedPerson: 'diana', actionTemplates: ['Draft estimate for', 'Complete Xactimate estimate for', 'Have Diana review estimate for'], tags: ['#estimating', '#billing'] },
  { keywords: ['invoice', 'invoicing', 'billing', 'payment'], suggestedPerson: 'ivan', actionTemplates: ['Have Ivan process invoice for', 'Submit invoice for', 'Follow up on payment for'], tags: ['#admin', '#billing'] },
  { keywords: ['call', 'phone', 'contact'], actionTemplates: ['Call about', 'Schedule phone call regarding', 'Make call to discuss'], context: '@phone', tags: [] },
  { keywords: ['email', 'send', 'write', 'reply'], actionTemplates: ['Send email regarding', 'Email update about', 'Reply to email about'], context: '@email', tags: [] },
  { keywords: ['schedule', 'scheduling', 'calendar', 'appointment'], suggestedPerson: 'ivan', actionTemplates: ['Have Ivan schedule meeting for', 'Schedule appointment regarding', 'Book time to discuss'], tags: ['#admin'] },
  { keywords: ['claim', 'claims', 'insurance'], actionTemplates: ['Update claim documentation for', 'Follow up on claim for', 'Submit insurance claim for'], tags: ['#insurance', '#claims'] },
  { keywords: ['sales', 'carrier', 'vendor', 'relationship'], suggestedPerson: 'anonno', actionTemplates: ['Have Anonno follow up on', 'Coordinate sales effort for', 'Update carrier relationship regarding'], tags: ['#business-development', '#sales'] },
  { keywords: ['project', 'site', 'field', 'job'], suggestedPerson: 'diana', actionTemplates: ['Coordinate with Diana on', 'Schedule site visit for', 'Update project status for'], tags: ['#projects'] },
  { keywords: ['follow up', 'following up', 'followup'], actionTemplates: ['Send follow-up email regarding', 'Make follow-up call about', 'Check status of'], tags: [] },
  { keywords: ['waiting', 'waiting for', 'waiting on'], actionTemplates: ['Check status of', 'Follow up regarding', 'Request update on'], tags: [] },
  { keywords: ['buy', 'purchase', 'pick up', 'store', 'shop'], actionTemplates: ['Buy items for', 'Pick up supplies for', 'Purchase materials for'], context: '@errands', tags: [] },
  { keywords: ['research', 'look up', 'find', 'search'], actionTemplates: ['Research options for', 'Look up information about', 'Find details on'], context: '@computer', tags: [] },
  { keywords: ['party', 'birthday', 'celebration', 'event'], actionTemplates: ['Plan details for', 'Prepare arrangements for', 'Organize logistics for'], tags: ['#party', '#personal'] },
  { keywords: ['review', 'check', 'verify'], actionTemplates: ['Review details of', 'Check status of', 'Verify information for'], tags: [] },
  { keywords: ['usaa', 'travelers', 'state farm', 'allstate', 'liberty mutual'], actionTemplates: ['Contact adjuster regarding', 'Follow up with insurance on', 'Submit documentation to'], tags: ['#insurance', '#claims'] },
  { keywords: ['timeline', 'deadline', 'due', 'urgent'], actionTemplates: ['Address timeline concerns for', 'Review deadline for', 'Prioritize completion of'], tags: ['#urgent'] },
  { keywords: ['water damage', 'fire damage', 'storm damage', 'damage'], actionTemplates: ['Assess damage for', 'Document damage at', 'Schedule repair for'], tags: ['#restoration'] }
];

class GTDDatabase {
  constructor() {
    this.db = null;
    this.isSupported = 'indexedDB' in window;
  }

  async init() {
    if (!this.isSupported) {
      throw new Error('IndexedDB is not supported in this browser');
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error('Failed to open database'));
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Inbox store
        if (!db.objectStoreNames.contains(STORES.INBOX)) {
          const inboxStore = db.createObjectStore(STORES.INBOX, { keyPath: 'id' });
          inboxStore.createIndex('timestamp', 'timestamp', { unique: false });
          inboxStore.createIndex('type', 'type', { unique: false });
        }

        // Next Actions store
        if (!db.objectStoreNames.contains(STORES.NEXT_ACTIONS)) {
          const actionsStore = db.createObjectStore(STORES.NEXT_ACTIONS, { keyPath: 'id' });
          actionsStore.createIndex('contexts', 'contexts', { unique: false, multiEntry: true });
          actionsStore.createIndex('processedDate', 'processedDate', { unique: false });
        }

        // Waiting For store (NEW)
        if (!db.objectStoreNames.contains(STORES.WAITING_FOR)) {
          const waitingStore = db.createObjectStore(STORES.WAITING_FOR, { keyPath: 'id' });
          waitingStore.createIndex('personId', 'personId', { unique: false });
          waitingStore.createIndex('delegatedDate', 'delegatedDate', { unique: false });
          waitingStore.createIndex('isOverdue', 'isOverdue', { unique: false });
        }

        // Reference store
        if (!db.objectStoreNames.contains(STORES.REFERENCE)) {
          const refStore = db.createObjectStore(STORES.REFERENCE, { keyPath: 'id' });
          refStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
          refStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Archived store
        if (!db.objectStoreNames.contains(STORES.ARCHIVED)) {
          const archivedStore = db.createObjectStore(STORES.ARCHIVED, { keyPath: 'id' });
          archivedStore.createIndex('completedDate', 'completedDate', { unique: false });
        }

        // Trash store (NEW)
        if (!db.objectStoreNames.contains(STORES.TRASH)) {
          const trashStore = db.createObjectStore(STORES.TRASH, { keyPath: 'id' });
          trashStore.createIndex('deletedDate', 'deletedDate', { unique: false });
          trashStore.createIndex('originalStore', 'originalStore', { unique: false });
        }

        // Team Members store (NEW)
        if (!db.objectStoreNames.contains(STORES.TEAM_MEMBERS)) {
          db.createObjectStore(STORES.TEAM_MEMBERS, { keyPath: 'id' });
        }

        // Contacts store (NEW)
        if (!db.objectStoreNames.contains(STORES.CONTACTS)) {
          const contactsStore = db.createObjectStore(STORES.CONTACTS, { keyPath: 'id' });
          contactsStore.createIndex('category', 'category', { unique: false });
          contactsStore.createIndex('company', 'company', { unique: false });
        }

        // Tag Usage store (NEW) - for learning tag patterns
        if (!db.objectStoreNames.contains(STORES.TAG_USAGE)) {
          const tagStore = db.createObjectStore(STORES.TAG_USAGE, { keyPath: 'tag' });
          tagStore.createIndex('count', 'count', { unique: false });
        }

        // Suggestion Patterns store (NEW)
        if (!db.objectStoreNames.contains(STORES.SUGGESTION_PATTERNS)) {
          db.createObjectStore(STORES.SUGGESTION_PATTERNS, { keyPath: 'id' });
        }

        // Settings store
        if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
          db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
        }

        // Projects store
        if (!db.objectStoreNames.contains(STORES.PROJECTS)) {
          const projectsStore = db.createObjectStore(STORES.PROJECTS, { keyPath: 'id' });
          projectsStore.createIndex('status', 'status', { unique: false });
          projectsStore.createIndex('category', 'category', { unique: false });
          projectsStore.createIndex('created', 'created', { unique: false });
        }

        // Reference Folders store
        if (!db.objectStoreNames.contains(STORES.REFERENCE_FOLDERS)) {
          const foldersStore = db.createObjectStore(STORES.REFERENCE_FOLDERS, { keyPath: 'id' });
          foldersStore.createIndex('parentId', 'parentId', { unique: false });
          foldersStore.createIndex('category', 'category', { unique: false });
        }

        // Someday/Maybe store
        if (!db.objectStoreNames.contains(STORES.SOMEDAY_MAYBE)) {
          const somedayStore = db.createObjectStore(STORES.SOMEDAY_MAYBE, { keyPath: 'id' });
          somedayStore.createIndex('category', 'category', { unique: false });
          somedayStore.createIndex('created', 'created', { unique: false });
          somedayStore.createIndex('lastReviewed', 'lastReviewed', { unique: false });
        }

        // Templates store
        if (!db.objectStoreNames.contains(STORES.TEMPLATES)) {
          const templatesStore = db.createObjectStore(STORES.TEMPLATES, { keyPath: 'id' });
          templatesStore.createIndex('category', 'category', { unique: false });
          templatesStore.createIndex('isDefault', 'isDefault', { unique: false });
        }

        // Areas store
        if (!db.objectStoreNames.contains(STORES.AREAS)) {
          const areasStore = db.createObjectStore(STORES.AREAS, { keyPath: 'id' });
          areasStore.createIndex('name', 'name', { unique: false });
          areasStore.createIndex('sortOrder', 'sortOrder', { unique: false });
        }
      };
    });
  }

  // Generate unique ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Generic CRUD operations
  async add(storeName, item) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      if (!item.id) {
        item.id = this.generateId();
      }

      const request = store.add(item);

      request.onsuccess = () => resolve(item);
      request.onerror = () => reject(new Error('Failed to add item'));
    });
  }

  async get(storeName, id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Failed to get item'));
    });
  }

  async getAll(storeName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(new Error('Failed to get items'));
    });
  }

  async update(storeName, item) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(item);

      request.onsuccess = () => resolve(item);
      request.onerror = () => reject(new Error('Failed to update item'));
    });
  }

  async delete(storeName, id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(new Error('Failed to delete item'));
    });
  }

  async clear(storeName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(new Error('Failed to clear store'));
    });
  }

  async count(storeName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Failed to count items'));
    });
  }

  // =====================
  // Team Members Operations (Dynamic - No Hardcoding)
  // =====================

  // Get suggested team members for onboarding (not auto-saved)
  getSuggestedTeamMembers() {
    return SUGGESTED_TEAM_MEMBERS;
  }

  // Get available roles
  getTeamRoles() {
    return TEAM_ROLES;
  }

  // Initialize team members - only called during onboarding, not auto-populate
  async initializeTeamMembers() {
    // No longer auto-populates - handled by onboarding wizard
    // This method kept for compatibility but does nothing
  }

  async getTeamMembers() {
    const members = await this.getAll(STORES.TEAM_MEMBERS);
    return members.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getTeamMember(id) {
    return this.get(STORES.TEAM_MEMBERS, id);
  }

  async getTeamMemberByName(name) {
    const members = await this.getTeamMembers();
    return members.find(m => m.name.toLowerCase() === name.toLowerCase());
  }

  async addTeamMember(member) {
    const now = new Date().toISOString();
    const contextName = member.name.toLowerCase().replace(/\s+/g, '-');

    const newMember = {
      id: this.generateId(),
      name: member.name,
      role: member.role || '',
      email: member.email || '',
      phone: member.phone || '',
      notes: member.notes || '',
      color: member.color || this.generateTeamColor(),
      created: now,
      updated: now,
      // Auto-generated context references
      contextId: `@${contextName}`,
      waitingContextId: `@waiting-for-${contextName}`
    };

    await this.add(STORES.TEAM_MEMBERS, newMember);
    return newMember;
  }

  async updateTeamMember(member) {
    member.updated = new Date().toISOString();

    // If name changed, update context IDs
    const oldMember = await this.getTeamMember(member.id);
    if (oldMember && oldMember.name !== member.name) {
      const contextName = member.name.toLowerCase().replace(/\s+/g, '-');
      member.contextId = `@${contextName}`;
      member.waitingContextId = `@waiting-for-${contextName}`;

      // Update any actions with old context to new context
      await this.updateContextReferences(
        oldMember.contextId,
        member.contextId
      );
      await this.updateContextReferences(
        oldMember.waitingContextId,
        member.waitingContextId
      );
    }

    return this.update(STORES.TEAM_MEMBERS, member);
  }

  async deleteTeamMember(id) {
    const member = await this.getTeamMember(id);
    if (!member) return false;

    // Get count of affected items for confirmation
    const waitingItems = await this.getWaitingForByPerson(member.name);
    const actionsWithContext = await this.getActionsByContext(member.contextId);

    // Move waiting items to generic @waiting context
    for (const item of waitingItems) {
      item.contexts = item.contexts.map(c =>
        c === member.waitingContextId ? '@waiting' : c
      );
      await this.update(STORES.WAITING_FOR, item);
    }

    // Remove team context from actions
    for (const action of actionsWithContext) {
      action.contexts = action.contexts.filter(c => c !== member.contextId);
      await this.update(STORES.NEXT_ACTIONS, action);
    }

    // Delete the team member
    await this.delete(STORES.TEAM_MEMBERS, id);

    return {
      deleted: true,
      waitingItemsMoved: waitingItems.length,
      actionsUpdated: actionsWithContext.length
    };
  }

  async getWaitingForByPerson(personName) {
    const waiting = await this.getWaitingFor();
    return waiting.filter(w =>
      w.delegatedTo?.toLowerCase() === personName.toLowerCase()
    );
  }

  async getActionsByContext(contextId) {
    const actions = await this.getNextActions();
    return actions.filter(a =>
      a.contexts && a.contexts.includes(contextId)
    );
  }

  async updateContextReferences(oldContext, newContext) {
    // Update in next actions
    const actions = await this.getNextActions();
    for (const action of actions) {
      if (action.contexts && action.contexts.includes(oldContext)) {
        action.contexts = action.contexts.map(c =>
          c === oldContext ? newContext : c
        );
        await this.update(STORES.NEXT_ACTIONS, action);
      }
    }

    // Update in waiting for
    const waiting = await this.getWaitingFor();
    for (const item of waiting) {
      if (item.contexts && item.contexts.includes(oldContext)) {
        item.contexts = item.contexts.map(c =>
          c === oldContext ? newContext : c
        );
        await this.update(STORES.WAITING_FOR, item);
      }
    }
  }

  generateTeamColor() {
    const colors = ['#ec4899', '#06b6d4', '#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  async getTeamMemberWaitingCount(memberId) {
    const member = await this.getTeamMember(memberId);
    if (!member) return 0;
    const waiting = await this.getWaitingForByPerson(member.name);
    return waiting.length;
  }

  // =====================
  // External Contacts Operations
  // =====================

  getContactCategories() {
    return CONTACT_CATEGORIES;
  }

  getInsuranceCarriers() {
    return INSURANCE_CARRIERS;
  }

  async getContacts() {
    const contacts = await this.getAll(STORES.CONTACTS);
    return contacts.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getContact(id) {
    return this.get(STORES.CONTACTS, id);
  }

  async getContactsByCategory(category) {
    const contacts = await this.getContacts();
    if (category === 'all') return contacts;
    return contacts.filter(c => c.category === category);
  }

  async addContact(contact) {
    const now = new Date().toISOString();
    const newContact = {
      id: this.generateId(),
      name: contact.name,
      category: contact.category || 'other',
      company: contact.company || '',
      email: contact.email || '',
      phone: contact.phone || '',
      notes: contact.notes || '',
      created: now,
      updated: now
    };

    await this.add(STORES.CONTACTS, newContact);
    return newContact;
  }

  async updateContact(contact) {
    contact.updated = new Date().toISOString();
    return this.update(STORES.CONTACTS, contact);
  }

  async deleteContact(id) {
    return this.delete(STORES.CONTACTS, id);
  }

  // Get all delegation targets (team + contacts)
  async getAllDelegationTargets() {
    const team = await this.getTeamMembers();
    const contacts = await this.getContacts();

    return {
      team: team.map(m => ({
        id: m.id,
        name: m.name,
        role: m.role,
        email: m.email,
        phone: m.phone,
        type: 'team',
        contextId: m.contextId,
        waitingContextId: m.waitingContextId
      })),
      contacts: contacts.map(c => ({
        id: c.id,
        name: c.name,
        role: c.category === 'adjuster' ? `${c.company} Adjuster` : c.category,
        email: c.email,
        phone: c.phone,
        type: 'contact',
        company: c.company
      }))
    };
  }

  // =====================
  // Onboarding / Setup
  // =====================

  async isOnboardingComplete() {
    const setting = await this.getSetting('onboardingComplete');
    return setting === true;
  }

  async markOnboardingComplete() {
    await this.setSetting('onboardingComplete', true);
  }

  async resetOnboarding() {
    await this.setSetting('onboardingComplete', false);
  }

  // Save team members from onboarding wizard
  async saveOnboardingTeamMembers(members) {
    // Clear existing team members
    await this.clear(STORES.TEAM_MEMBERS);

    // Add new members from onboarding
    for (const member of members) {
      await this.addTeamMember(member);
    }
  }

  // Save contexts from onboarding wizard
  async saveOnboardingContexts(contexts) {
    await this.setSetting('enabledContexts', contexts);
  }

  async getEnabledContexts() {
    const contexts = await this.getSetting('enabledContexts');
    return contexts || ['@phone', '@email', '@computer', '@office', '@errands'];
  }

  // =====================
  // Inbox operations
  // =====================
  async addToInbox(content, type = 'text', metadata = {}) {
    const item = {
      id: this.generateId(),
      content: content.trim(),
      type: type,
      timestamp: new Date().toISOString(),
      processed: false,
      ...metadata
    };
    return this.add(STORES.INBOX, item);
  }

  async getInboxItems() {
    const items = await this.getAll(STORES.INBOX);
    return items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  async deleteFromInbox(id) {
    return this.delete(STORES.INBOX, id);
  }

  // =====================
  // Next Actions operations
  // =====================
  async addToNextActions(inboxItem, action, contexts, tags = [], priority = 'medium', dueDate = null, location = null, projectId = null, sequenceOptions = {}) {
    const item = {
      id: this.generateId(),
      originalContent: inboxItem.content,
      originalTimestamp: inboxItem.timestamp,
      originalType: inboxItem.type,
      action: action.trim(),
      contexts: contexts,
      tags: tags,
      priority: priority, // 'high', 'medium', 'low'
      dueDate: dueDate, // ISO date string or null
      location: location, // { name, lat?, lng?, category? } or null
      projectId: projectId, // Project ID this action is linked to
      processedDate: new Date().toISOString(),
      completed: false,
      // Sequential action support
      sequenceOrder: sequenceOptions.sequenceOrder || null, // Order in sequence (1, 2, 3...)
      dependsOn: sequenceOptions.dependsOn || null, // ID of action this depends on
      isSequential: sequenceOptions.isSequential || false // Whether this action is part of a sequence
    };

    await this.add(STORES.NEXT_ACTIONS, item);
    if (inboxItem.id) {
      await this.delete(STORES.INBOX, inboxItem.id);
    }

    // Track tag usage
    for (const tag of tags) {
      await this.incrementTagUsage(tag);
    }

    return item;
  }

  // Create action directly (for templates and bulk creation)
  async createAction(actionData) {
    const item = {
      id: this.generateId(),
      originalContent: actionData.action,
      originalTimestamp: new Date().toISOString(),
      originalType: 'direct',
      action: actionData.action.trim(),
      contexts: actionData.contexts || ['@anywhere'],
      tags: actionData.tags || [],
      priority: actionData.priority || 'medium',
      dueDate: actionData.dueDate || null,
      location: actionData.location || null,
      projectId: actionData.projectId || null,
      processedDate: new Date().toISOString(),
      completed: false,
      sequenceOrder: actionData.sequenceOrder || null,
      dependsOn: actionData.dependsOn || null,
      isSequential: actionData.isSequential || false
    };

    await this.add(STORES.NEXT_ACTIONS, item);
    return item;
  }

  async getNextActions() {
    const items = await this.getAll(STORES.NEXT_ACTIONS);
    const now = new Date();
    const priorityOrder = { high: 0, medium: 1, low: 2 };

    return items.sort((a, b) => {
      // Overdue items first
      const aOverdue = a.dueDate && new Date(a.dueDate) < now;
      const bOverdue = b.dueDate && new Date(b.dueDate) < now;
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;

      // Then by priority
      const priorityA = priorityOrder[a.priority] ?? 1;
      const priorityB = priorityOrder[b.priority] ?? 1;
      if (priorityA !== priorityB) return priorityA - priorityB;

      // Then by due date (soonest first)
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate) - new Date(b.dueDate);
      }
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;

      // Finally by processed date
      return new Date(b.processedDate) - new Date(a.processedDate);
    });
  }

  // Get only available (unlocked) actions - filters out blocked sequential actions
  async getAvailableActions() {
    const allActions = await this.getNextActions();
    const completedIds = new Set(allActions.filter(a => a.completed).map(a => a.id));

    return allActions.filter(action => {
      // Non-sequential actions are always available
      if (!action.isSequential) return true;

      // Sequential action with no dependency is available (first in sequence)
      if (!action.dependsOn) return true;

      // Check if the action it depends on is completed
      return completedIds.has(action.dependsOn);
    });
  }

  // Get blocked (on deck) actions - sequential actions waiting on others
  async getBlockedActions() {
    const allActions = await this.getNextActions();
    const completedIds = new Set(allActions.filter(a => a.completed).map(a => a.id));

    const blocked = allActions.filter(action => {
      // Only sequential actions can be blocked
      if (!action.isSequential) return false;

      // If no dependency, not blocked
      if (!action.dependsOn) return false;

      // Blocked if dependency is not completed
      return !completedIds.has(action.dependsOn);
    });

    // For each blocked action, find what it's waiting on
    return blocked.map(action => {
      const blockedBy = allActions.find(a => a.id === action.dependsOn);
      return {
        ...action,
        blockedByAction: blockedBy ? blockedBy.action : 'Unknown action'
      };
    });
  }

  // Get all actions for a project, sorted by sequence order
  async getProjectActions(projectId) {
    const allActions = await this.getAll(STORES.NEXT_ACTIONS);
    const projectActions = allActions.filter(a => a.projectId === projectId);

    return projectActions.sort((a, b) => {
      // Sort by sequence order if both have it
      if (a.sequenceOrder !== null && b.sequenceOrder !== null) {
        return a.sequenceOrder - b.sequenceOrder;
      }
      // Sequenced actions before non-sequenced
      if (a.sequenceOrder !== null) return -1;
      if (b.sequenceOrder !== null) return 1;
      // Fall back to created date
      return new Date(a.processedDate) - new Date(b.processedDate);
    });
  }

  // Check if an action is blocked
  async isActionBlocked(actionId) {
    const allActions = await this.getAll(STORES.NEXT_ACTIONS);
    const action = allActions.find(a => a.id === actionId);

    if (!action || !action.isSequential || !action.dependsOn) {
      return false;
    }

    const dependency = allActions.find(a => a.id === action.dependsOn);
    return dependency && !dependency.completed;
  }

  async getActionsDueToday() {
    const items = await this.getNextActions();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return items.filter(item => {
      if (!item.dueDate) return false;
      const due = new Date(item.dueDate);
      return due >= today && due < tomorrow;
    });
  }

  async getOverdueActions() {
    const items = await this.getNextActions();
    const now = new Date();
    return items.filter(item => item.dueDate && new Date(item.dueDate) < now);
  }

  async getUpcomingActions(days = 7) {
    const items = await this.getNextActions();
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + days);

    return items.filter(item => {
      if (!item.dueDate) return false;
      const due = new Date(item.dueDate);
      return due >= now && due <= future;
    });
  }

  async getNextActionsByContext(context) {
    const items = await this.getNextActions();
    return items.filter(item => item.contexts.includes(context));
  }

  async updateNextAction(item) {
    return this.update(STORES.NEXT_ACTIONS, item);
  }

  async completeAction(id) {
    const item = await this.get(STORES.NEXT_ACTIONS, id);
    if (item) {
      item.completed = true;
      item.completedDate = new Date().toISOString();
      item.originalStore = 'nextActions';
      item.archivedDate = new Date().toISOString();
      await this.add(STORES.ARCHIVED, item);
      await this.delete(STORES.NEXT_ACTIONS, id);
    }
    return item;
  }

  // =====================
  // Waiting For operations
  // =====================
  async delegateAction(actionText, targetPerson, method, originalContent, projectId = null) {
    // Updated to match firestore-db.js signature for consistency
    const waitingItem = {
      id: this.generateId(),
      action: actionText,
      delegatedTo: targetPerson.name || targetPerson,
      delegatedToId: targetPerson.id || null,
      delegatedToType: targetPerson.type || 'team',
      delegationMethod: method,
      originalContent: originalContent,
      delegatedDate: new Date().toISOString(),
      followUpCount: 0,
      projectId: projectId,
      completed: false
    };

    await this.add(STORES.WAITING_FOR, waitingItem);
    return waitingItem;
  }

  async moveToWaitingFor(actionItem, personId, personName, delegationMethod, note = '') {
    const teamMember = await this.getTeamMember(personId);

    const item = {
      id: this.generateId(),
      originalContent: actionItem.originalContent || actionItem.action,
      originalTimestamp: actionItem.originalTimestamp || actionItem.processedDate,
      originalType: actionItem.originalType || 'text',
      action: actionItem.action,
      personId: personId,
      personName: personName,
      personEmail: teamMember?.email || '',
      personPhone: teamMember?.phone || '',
      typicalResponseDays: teamMember?.typicalResponseDays || 3,
      delegatedDate: new Date().toISOString(),
      delegationMethod: delegationMethod,
      note: note,
      followUps: [],
      completed: false,
      previousContexts: actionItem.contexts || []
    };

    await this.add(STORES.WAITING_FOR, item);
    if (actionItem.id) {
      await this.delete(STORES.NEXT_ACTIONS, actionItem.id);
    }

    return item;
  }

  async getWaitingForItems() {
    const items = await this.getAll(STORES.WAITING_FOR);
    return items.sort((a, b) => new Date(a.delegatedDate) - new Date(b.delegatedDate));
  }

  async getWaitingForByPerson(personId) {
    const items = await this.getWaitingForItems();
    return items.filter(item => item.personId === personId);
  }

  async getWaitingForGroupedByPerson() {
    const items = await this.getWaitingForItems();
    const grouped = {};

    for (const item of items) {
      const key = item.personId || 'unknown';
      if (!grouped[key]) {
        grouped[key] = {
          personId: item.personId,
          personName: item.personName,
          items: []
        };
      }

      // Calculate if overdue
      const delegatedDate = new Date(item.delegatedDate);
      const now = new Date();
      const daysSinceDelegated = Math.floor((now - delegatedDate) / (1000 * 60 * 60 * 24));
      item.daysSinceDelegated = daysSinceDelegated;
      item.isOverdue = daysSinceDelegated > (item.typicalResponseDays || 3);
      item.status = daysSinceDelegated <= (item.typicalResponseDays || 3) * 0.5 ? 'green' :
                    daysSinceDelegated <= (item.typicalResponseDays || 3) ? 'yellow' : 'red';

      grouped[key].items.push(item);
    }

    return grouped;
  }

  // Get aging waiting items (more than 3 days old with no response)
  async getAgingWaitingItems(daysThreshold = 3) {
    const items = await this.getWaitingForItems();
    const now = new Date();

    return items.filter(item => {
      const delegatedDate = new Date(item.delegatedDate);
      const daysSince = Math.floor((now - delegatedDate) / (1000 * 60 * 60 * 24));
      return daysSince >= daysThreshold;
    }).map(item => {
      const delegatedDate = new Date(item.delegatedDate);
      const daysSince = Math.floor((now - delegatedDate) / (1000 * 60 * 60 * 24));
      return { ...item, daysSince };
    });
  }

  // Get comprehensive today briefing data
  async getTodayBriefing() {
    const [dueToday, overdue, agingWaiting, allActions, inboxItems] = await Promise.all([
      this.getActionsDueToday(),
      this.getOverdueActions(),
      this.getAgingWaitingItems(3),
      this.getNextActions(),
      this.getInboxItems()
    ]);

    // Get high priority items
    const highPriority = allActions.filter(a => a.priority === 'high').slice(0, 5);

    // Build suggested focus list (top 5 items based on urgency)
    const focusItems = [];

    // Add overdue first
    overdue.slice(0, 2).forEach(item => {
      focusItems.push({ ...item, reason: 'overdue', type: 'action' });
    });

    // Add due today
    dueToday.slice(0, 2).forEach(item => {
      if (!focusItems.find(f => f.id === item.id)) {
        focusItems.push({ ...item, reason: 'due-today', type: 'action' });
      }
    });

    // Add high priority
    highPriority.forEach(item => {
      if (focusItems.length < 5 && !focusItems.find(f => f.id === item.id)) {
        focusItems.push({ ...item, reason: 'high-priority', type: 'action' });
      }
    });

    // Add aging waiting items needing follow-up
    agingWaiting.slice(0, 2).forEach(item => {
      if (focusItems.length < 5) {
        focusItems.push({ ...item, reason: 'needs-followup', type: 'waiting' });
      }
    });

    return {
      dueToday,
      overdue,
      agingWaiting,
      focusItems,
      inboxCount: inboxItems.length,
      totalActions: allActions.length,
      greeting: this.getTimeGreeting()
    };
  }

  getTimeGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  async addFollowUp(waitingItemId, method) {
    const item = await this.get(STORES.WAITING_FOR, waitingItemId);
    if (item) {
      if (!item.followUps) item.followUps = [];
      item.followUps.push({
        date: new Date().toISOString(),
        method: method
      });
      item.lastFollowUpDate = new Date().toISOString();
      await this.update(STORES.WAITING_FOR, item);
    }
    return item;
  }

  async completeWaitingFor(id) {
    const item = await this.get(STORES.WAITING_FOR, id);
    if (item) {
      item.completed = true;
      item.completedDate = new Date().toISOString();
      item.originalStore = 'waitingFor';
      item.archivedDate = new Date().toISOString();
      await this.add(STORES.ARCHIVED, item);
      await this.delete(STORES.WAITING_FOR, id);
    }
    return item;
  }

  async getOverdueWaitingItems() {
    const grouped = await this.getWaitingForGroupedByPerson();
    const overdue = [];

    for (const group of Object.values(grouped)) {
      for (const item of group.items) {
        if (item.isOverdue) {
          overdue.push(item);
        }
      }
    }

    return overdue;
  }

  // =====================
  // Reference operations
  // =====================
  async addToReference(inboxItem, tags = [], folderId = null) {
    const item = {
      id: this.generateId(),
      content: inboxItem.content,
      originalTimestamp: inboxItem.timestamp,
      originalType: inboxItem.type,
      tags: tags,
      folderId: folderId,
      addedDate: new Date().toISOString()
    };

    await this.add(STORES.REFERENCE, item);
    if (inboxItem.id) {
      await this.delete(STORES.INBOX, inboxItem.id);
    }

    // Track tag usage
    for (const tag of tags) {
      await this.incrementTagUsage(tag);
    }

    return item;
  }

  async getReferenceItems() {
    const items = await this.getAll(STORES.REFERENCE);
    return items.sort((a, b) => new Date(b.addedDate) - new Date(a.addedDate));
  }

  async searchReference(query) {
    const items = await this.getReferenceItems();
    const lowerQuery = query.toLowerCase();
    return items.filter(item =>
      item.content.toLowerCase().includes(lowerQuery) ||
      item.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  async deleteFromReference(id) {
    return this.delete(STORES.REFERENCE, id);
  }

  // =====================
  // Someday/Maybe operations
  // =====================

  async addToSomedayMaybe(item) {
    const somedayItem = {
      id: this.generateId(),
      content: item.content || item,
      category: item.category || 'personal', // 'business', 'personal', 'team'
      notes: item.notes || '',
      created: new Date().toISOString(),
      lastReviewed: null,
      originalInboxId: item.originalInboxId || null
    };

    await this.add(STORES.SOMEDAY_MAYBE, somedayItem);

    // If from inbox, delete from inbox
    if (item.originalInboxId) {
      await this.delete(STORES.INBOX, item.originalInboxId);
    }

    return somedayItem;
  }

  async getSomedayMaybeItems() {
    const items = await this.getAll(STORES.SOMEDAY_MAYBE);
    return items.sort((a, b) => new Date(b.created) - new Date(a.created));
  }

  async getSomedayMaybeByCategory(category) {
    const items = await this.getSomedayMaybeItems();
    return items.filter(item => item.category === category);
  }

  async getUnreviewedSomedayMaybe(daysSinceReview = 7) {
    const items = await this.getSomedayMaybeItems();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysSinceReview);

    return items.filter(item => {
      if (!item.lastReviewed) return true;
      return new Date(item.lastReviewed) < cutoff;
    });
  }

  async updateSomedayMaybe(item) {
    return this.update(STORES.SOMEDAY_MAYBE, item);
  }

  async markSomedayMaybeReviewed(id) {
    const item = await this.get(STORES.SOMEDAY_MAYBE, id);
    if (item) {
      item.lastReviewed = new Date().toISOString();
      await this.update(STORES.SOMEDAY_MAYBE, item);
    }
    return item;
  }

  async deleteSomedayMaybe(id) {
    return this.delete(STORES.SOMEDAY_MAYBE, id);
  }

  async promoteToProject(somedayId) {
    const item = await this.get(STORES.SOMEDAY_MAYBE, somedayId);
    if (!item) return null;

    // Create project
    const project = await this.createProject({
      name: item.content,
      category: item.category,
      notes: item.notes,
      status: 'active'
    });

    // Create first action
    const firstAction = {
      id: this.generateId(),
      action: `Define first action for: ${item.content}`,
      contexts: ['@computer'],
      originalContent: item.content,
      originalTimestamp: item.created,
      processedDate: new Date().toISOString(),
      tags: [],
      priority: 'medium',
      projectId: project.id
    };
    await this.add(STORES.NEXT_ACTIONS, firstAction);

    // Delete from someday/maybe
    await this.delete(STORES.SOMEDAY_MAYBE, somedayId);

    return { project, firstAction };
  }

  // =====================
  // Template operations
  // =====================

  async initializeTemplates() {
    const existing = await this.getAll(STORES.TEMPLATES);
    if (existing.length === 0) {
      for (const template of DEFAULT_TEMPLATES) {
        await this.add(STORES.TEMPLATES, template);
      }
    }
  }

  async getTemplates() {
    const templates = await this.getAll(STORES.TEMPLATES);
    return templates.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getTemplate(id) {
    return this.get(STORES.TEMPLATES, id);
  }

  async addTemplate(template) {
    const newTemplate = {
      id: this.generateId(),
      name: template.name,
      category: template.category || 'personal',
      icon: template.icon || '📋',
      isDefault: false,
      actions: template.actions || [],
      created: new Date().toISOString()
    };
    await this.add(STORES.TEMPLATES, newTemplate);
    return newTemplate;
  }

  async updateTemplate(template) {
    return this.update(STORES.TEMPLATES, template);
  }

  async deleteTemplate(id) {
    // Don't allow deleting default templates
    const template = await this.get(STORES.TEMPLATES, id);
    if (template && template.isDefault) {
      throw new Error('Cannot delete default templates');
    }
    return this.delete(STORES.TEMPLATES, id);
  }

  async createProjectFromTemplate(templateId, projectName, startDate = new Date(), actionMode = 'sequential') {
    const template = await this.get(STORES.TEMPLATES, templateId);
    if (!template) throw new Error('Template not found');

    // Create the project with action mode
    const project = await this.createProject({
      name: projectName,
      category: template.category,
      notes: `Created from template: ${template.name}`,
      status: 'active',
      actionMode: actionMode
    });

    // Create actions from template with calculated due dates and sequence
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const isSequential = actionMode === 'sequential';
    const createdActions = [];

    for (let i = 0; i < template.actions.length; i++) {
      const actionTemplate = template.actions[i];
      const dueDate = new Date(start);
      dueDate.setDate(dueDate.getDate() + (actionTemplate.daysOffset || 0));

      // For sequential mode, only first action has no dependency
      const previousAction = isSequential && i > 0 ? createdActions[i - 1] : null;

      const action = {
        id: this.generateId(),
        action: actionTemplate.action,
        contexts: actionTemplate.contexts || ['@computer'],
        originalContent: actionTemplate.action,
        originalTimestamp: new Date().toISOString(),
        originalType: 'template',
        processedDate: new Date().toISOString(),
        tags: [],
        priority: actionTemplate.priority || 'medium',
        dueDate: dueDate.toISOString().split('T')[0],
        projectId: project.id,
        completed: false,
        // Sequential action support
        sequenceOrder: isSequential ? i + 1 : null,
        dependsOn: previousAction ? previousAction.id : null,
        isSequential: isSequential
      };

      await this.add(STORES.NEXT_ACTIONS, action);
      createdActions.push(action);
    }

    // Update project action count
    project.actionCount = createdActions.length;
    await this.updateProject(project);

    return project;
  }

  // =====================
  // Trash operations
  // =====================
  async moveToTrash(storeName, id) {
    const item = await this.get(storeName, id);
    if (item) {
      const trashItem = {
        ...item,
        id: this.generateId(),
        originalId: item.id,
        originalStore: storeName,
        deletedDate: new Date().toISOString()
      };
      await this.add(STORES.TRASH, trashItem);
      await this.delete(storeName, id);
      return trashItem;
    }
    return null;
  }

  async getTrashItems() {
    const items = await this.getAll(STORES.TRASH);
    return items.sort((a, b) => new Date(b.deletedDate) - new Date(a.deletedDate));
  }

  async restoreFromTrash(id) {
    const item = await this.get(STORES.TRASH, id);
    if (item) {
      const restored = { ...item };
      delete restored.originalId;
      delete restored.originalStore;
      delete restored.deletedDate;
      restored.id = this.generateId();

      await this.add(item.originalStore, restored);
      await this.delete(STORES.TRASH, id);
      return restored;
    }
    return null;
  }

  async emptyTrash() {
    return this.clear(STORES.TRASH);
  }

  async deleteFromTrashPermanently(id) {
    return this.delete(STORES.TRASH, id);
  }

  // Auto-purge items older than 30 days
  async purgeOldTrash() {
    const items = await this.getTrashItems();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const item of items) {
      if (new Date(item.deletedDate) < thirtyDaysAgo) {
        await this.delete(STORES.TRASH, item.id);
      }
    }
  }

  // =====================
  // Tag Usage operations
  // =====================
  async incrementTagUsage(tag) {
    const normalizedTag = tag.toLowerCase().trim();
    const existing = await this.get(STORES.TAG_USAGE, normalizedTag);

    if (existing) {
      existing.count = (existing.count || 0) + 1;
      existing.lastUsed = new Date().toISOString();
      await this.update(STORES.TAG_USAGE, existing);
    } else {
      await this.add(STORES.TAG_USAGE, {
        tag: normalizedTag,
        count: 1,
        lastUsed: new Date().toISOString()
      });
    }
  }

  async getPopularTags(limit = 10) {
    const tags = await this.getAll(STORES.TAG_USAGE);
    return tags
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map(t => t.tag);
  }

  // =====================
  // Smart Suggestions
  // =====================
  getSuggestionPatterns() {
    return DEFAULT_SUGGESTION_PATTERNS;
  }

  generateActionSuggestions(content) {
    const lowerContent = content.toLowerCase();
    const suggestions = [];
    const patterns = this.getSuggestionPatterns();

    // Extract the main topic/subject from the content
    const mainSubject = this.extractMainSubject(content);

    for (const pattern of patterns) {
      for (const keyword of pattern.keywords) {
        if (lowerContent.includes(keyword)) {
          for (const template of pattern.actionTemplates) {
            let action = template;

            // If template ends with a preposition, append the subject
            if (template.endsWith(' for') || template.endsWith(' on') ||
                template.endsWith(' to') || template.endsWith(' with') ||
                template.endsWith(' about')) {
              if (mainSubject) {
                action = `${template} ${mainSubject}`;
              } else {
                // Skip incomplete suggestions
                continue;
              }
            } else if (!template.includes(' ') || template.split(' ').length <= 3) {
              // Short templates like "Call", "Email", "Review" - add subject
              if (mainSubject) {
                action = `${template} ${mainSubject}`;
              }
            }

            suggestions.push({
              action: action,
              suggestedPerson: pattern.suggestedPerson || null,
              suggestedContext: pattern.context || null,
              suggestedTags: pattern.tags || [],
              confidence: pattern.keywords.filter(k => lowerContent.includes(k)).length
            });
          }
          break; // Only use first matching keyword per pattern
        }
      }
    }

    // Sort by confidence and remove duplicates
    const unique = [];
    const seen = new Set();

    suggestions
      .sort((a, b) => b.confidence - a.confidence)
      .forEach(s => {
        const key = s.action.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(s);
        }
      });

    return unique.slice(0, 5);
  }

  extractMainSubject(content) {
    // Try to extract a meaningful subject from the content
    let subject = content;

    // Remove common prefixes
    subject = subject.replace(/^(need to|have to|should|must|want to|going to|gotta|gonna)\s+/i, '');
    subject = subject.replace(/^(get|do|make|complete|finish|send|call|email)\s+/i, '');

    // Remove trailing commentary (after dash, parentheses, "because", etc.)
    subject = subject.split(/\s*[-–—]\s*/)[0];
    subject = subject.split(/\s*\(\s*/)[0];
    subject = subject.split(/\s*because\s*/i)[0];
    subject = subject.split(/\s*since\s*/i)[0];

    // Extract key noun phrases - look for "the X project", "X damage", etc.
    const projectMatch = subject.match(/(?:the\s+)?(\w+(?:\s+\w+){0,3})\s+(?:project|job|site|claim|estimate|work)/i);
    if (projectMatch) {
      return projectMatch[0].trim();
    }

    // Look for quoted or specific items
    const quotedMatch = subject.match(/"([^"]+)"|'([^']+)'/);
    if (quotedMatch) {
      return quotedMatch[1] || quotedMatch[2];
    }

    // Get first meaningful phrase (up to 6 words, stop at punctuation)
    const words = subject.split(/[.,;!?\n]/)[0].trim().split(/\s+/);
    if (words.length > 6) {
      return words.slice(0, 6).join(' ');
    }

    return words.join(' ');
  }

  extractSubject(content, keyword) {
    // Simple extraction - get text after the keyword
    const lowerContent = content.toLowerCase();
    const idx = lowerContent.indexOf(keyword);
    if (idx === -1) return '';

    const after = content.substring(idx + keyword.length).trim();
    // Get first few words (up to 5) or until punctuation
    const words = after.split(/[.,;!?\n]/)[0].trim().split(/\s+/).slice(0, 5);
    return words.join(' ');
  }

  generateTagSuggestions(content) {
    const lowerContent = content.toLowerCase();
    const suggestedTags = new Set();
    const patterns = this.getSuggestionPatterns();

    for (const pattern of patterns) {
      for (const keyword of pattern.keywords) {
        if (lowerContent.includes(keyword) && pattern.tags) {
          pattern.tags.forEach(tag => suggestedTags.add(tag));
        }
      }
    }

    return Array.from(suggestedTags);
  }

  detectWaitingForPattern(content) {
    const lowerContent = content.toLowerCase();
    const patterns = [
      /waiting (?:for|on) (\w+)/i,
      /need (\w+) to/i,
      /(\w+) needs to/i,
      /waiting for (\w+)'s/i,
      /need (\w+)'s/i
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const name = match[1].toLowerCase();
        // Check if it matches a team member
        const teamMembers = DEFAULT_TEAM_MEMBERS;
        const member = teamMembers.find(m => m.name.toLowerCase() === name);
        if (member) {
          return {
            detected: true,
            personId: member.id,
            personName: member.name
          };
        }
        // Return as external person
        return {
          detected: true,
          personId: null,
          personName: match[1]
        };
      }
    }

    return { detected: false };
  }

  // =====================
  // Projects Operations
  // =====================
  async createProject(project) {
    const newProject = {
      id: this.generateId(),
      name: project.name,
      description: project.description || '',
      category: project.category || 'business', // business, personal, team
      status: 'active', // active, on-hold, completed, archived
      created: new Date().toISOString(),
      completed: null,
      color: project.color || this.getProjectColor(project.category || 'business'),
      notes: project.notes || '',
      actionCount: 0,
      completedCount: 0,
      actionMode: project.actionMode || 'parallel' // 'parallel', 'sequential', 'mixed'
    };
    return this.add(STORES.PROJECTS, newProject);
  }

  getProjectColor(category) {
    const colors = {
      business: '#3b82f6',
      personal: '#10b981',
      team: '#8b5cf6'
    };
    return colors[category] || '#6b7280';
  }

  async addProject(projectData) {
    return this.createProject(projectData);
  }

  async getProjects(status = null) {
    const projects = await this.getAll(STORES.PROJECTS);
    if (status) {
      return projects.filter(p => p.status === status);
    }
    return projects.sort((a, b) => new Date(b.created) - new Date(a.created));
  }

  async getProject(id) {
    return this.get(STORES.PROJECTS, id);
  }

  async completeProject(id) {
    const project = await this.getProject(id);
    if (project) {
      project.status = 'completed';
      project.completed = new Date().toISOString();
      return this.updateProject(project);
    }
    return null;
  }

  async archiveProject(id) {
    const project = await this.getProject(id);
    if (project) {
      project.status = 'archived';
      return this.updateProject(project);
    }
    return null;
  }

  async deleteProject(id) {
    // Remove project reference from all actions
    const actions = await this.getNextActions();
    for (const action of actions) {
      if (action.projectId === id) {
        action.projectId = null;
        await this.updateNextAction(action);
      }
    }
    const waitingItems = await this.getWaitingForItems();
    for (const item of waitingItems) {
      if (item.projectId === id) {
        item.projectId = null;
        await this.update(STORES.WAITING_FOR, item);
      }
    }
    return this.delete(STORES.PROJECTS, id);
  }

  async getProjectWithActions(id) {
    const project = await this.getProject(id);
    if (!project) return null;

    const allActions = await this.getNextActions();
    const allWaiting = await this.getWaitingForItems();
    const allArchived = await this.getAll(STORES.ARCHIVED);

    project.actions = allActions.filter(a => a.projectId === id);
    project.waitingFor = allWaiting.filter(w => w.projectId === id);
    project.completed = allArchived.filter(a => a.projectId === id);

    return project;
  }

  async getProjectStats() {
    const projects = await this.getProjects();
    const actions = await this.getNextActions();
    const waiting = await this.getWaitingForItems();

    const stats = {
      total: projects.length,
      active: projects.filter(p => p.status === 'active').length,
      onHold: projects.filter(p => p.status === 'on-hold').length,
      completed: projects.filter(p => p.status === 'completed').length,
      stalled: 0
    };

    // Check for stalled projects (no active next actions)
    for (const project of projects.filter(p => p.status === 'active')) {
      const projectActions = actions.filter(a => a.projectId === project.id);
      if (projectActions.length === 0) {
        stats.stalled++;
      }
    }

    return stats;
  }

  async linkActionToProject(actionId, projectId, storeName = STORES.NEXT_ACTIONS) {
    const action = await this.get(storeName, actionId);
    if (action) {
      action.projectId = projectId;
      return this.update(storeName, action);
    }
    return null;
  }

  async suggestProjectForContent(content) {
    const lowerContent = content.toLowerCase();
    const projects = await this.getProjects('active');
    const suggestions = [];

    for (const project of projects) {
      const projectWords = project.name.toLowerCase().split(/\s+/);
      let score = 0;

      for (const word of projectWords) {
        if (word.length > 3 && lowerContent.includes(word)) {
          score++;
        }
      }

      if (score > 0) {
        suggestions.push({ project, score });
      }
    }

    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(s => s.project);
  }

  // =====================
  // Reference Folders Operations
  // =====================
  async initializeReferenceFolders() {
    const existing = await this.getAll(STORES.REFERENCE_FOLDERS);
    if (existing.length > 0) return;

    const defaultFolders = [
      { id: 'business', name: 'Business', parentId: null, category: 'business', icon: '💼', order: 0 },
      { id: 'business-carriers', name: 'Insurance Carriers', parentId: 'business', category: 'business', icon: '🏢', order: 0 },
      { id: 'business-estimating', name: 'Estimating Resources', parentId: 'business', category: 'business', icon: '📊', order: 1 },
      { id: 'business-marketing', name: 'Marketing & Sales', parentId: 'business', category: 'business', icon: '📈', order: 2 },
      { id: 'business-vendors', name: 'Vendors & Suppliers', parentId: 'business', category: 'business', icon: '🛒', order: 3 },
      { id: 'business-legal', name: 'Legal & Compliance', parentId: 'business', category: 'business', icon: '⚖️', order: 4 },
      { id: 'personal', name: 'Personal', parentId: null, category: 'personal', icon: '🏠', order: 1 },
      { id: 'personal-party', name: 'Party Planning', parentId: 'personal', category: 'personal', icon: '🎉', order: 0 },
      { id: 'personal-travel', name: 'Travel', parentId: 'personal', category: 'personal', icon: '✈️', order: 1 },
      { id: 'personal-health', name: 'Health & Wellness', parentId: 'personal', category: 'personal', icon: '💪', order: 2 },
      { id: 'personal-home', name: 'Home & Garden', parentId: 'personal', category: 'personal', icon: '🏡', order: 3 },
      { id: 'team', name: 'Team', parentId: null, category: 'team', icon: '👥', order: 2 },
      { id: 'team-sops', name: 'SOPs & Procedures', parentId: 'team', category: 'team', icon: '📋', order: 0 },
      { id: 'team-templates', name: 'Templates', parentId: 'team', category: 'team', icon: '📄', order: 1 },
      { id: 'team-training', name: 'Training Materials', parentId: 'team', category: 'team', icon: '🎓', order: 2 },
      { id: 'team-meetings', name: 'Meeting Notes', parentId: 'team', category: 'team', icon: '📝', order: 3 }
    ];

    for (const folder of defaultFolders) {
      folder.created = new Date().toISOString();
      folder.itemCount = 0;
      await this.add(STORES.REFERENCE_FOLDERS, folder);
    }
  }

  async getReferenceFolders() {
    const folders = await this.getAll(STORES.REFERENCE_FOLDERS);
    return folders.sort((a, b) => a.order - b.order);
  }

  async getReferenceFolder(id) {
    return this.get(STORES.REFERENCE_FOLDERS, id);
  }

  async createReferenceFolder(folder) {
    const newFolder = {
      id: this.generateId(),
      name: folder.name,
      parentId: folder.parentId || null,
      category: folder.category || 'personal',
      icon: folder.icon || '📁',
      created: new Date().toISOString(),
      order: folder.order || 99,
      itemCount: 0
    };
    return this.add(STORES.REFERENCE_FOLDERS, newFolder);
  }

  async updateReferenceFolder(folder) {
    return this.update(STORES.REFERENCE_FOLDERS, folder);
  }

  async deleteReferenceFolder(id) {
    // Move items to uncategorized or parent folder
    const references = await this.getReferenceItems();
    for (const ref of references) {
      if (ref.folderId === id) {
        ref.folderId = null;
        await this.update(STORES.REFERENCE, ref);
      }
    }
    return this.delete(STORES.REFERENCE_FOLDERS, id);
  }

  async suggestFolderForContent(content) {
    const lowerContent = content.toLowerCase();
    const suggestions = [];

    // Keyword to folder mapping
    const folderMappings = {
      'business-carriers': ['usaa', 'travelers', 'state farm', 'allstate', 'adjuster', 'carrier', 'insurance'],
      'business-estimating': ['estimate', 'xactimate', 'pricing', 'scope'],
      'business-marketing': ['marketing', 'sales', 'advertising', 'promotion'],
      'business-vendors': ['vendor', 'supplier', 'contractor', 'material'],
      'business-legal': ['contract', 'legal', 'compliance', 'agreement'],
      'personal-party': ['party', 'birthday', 'celebration', 'event', 'disco'],
      'personal-travel': ['travel', 'trip', 'vacation', 'flight', 'hotel'],
      'personal-health': ['health', 'doctor', 'medical', 'fitness', 'gym'],
      'team-sops': ['sop', 'procedure', 'process', 'workflow'],
      'team-templates': ['template', 'form', 'document'],
      'team-training': ['training', 'course', 'learning'],
      'team-meetings': ['meeting', 'minutes', 'agenda']
    };

    for (const [folderId, keywords] of Object.entries(folderMappings)) {
      for (const keyword of keywords) {
        if (lowerContent.includes(keyword)) {
          const folder = await this.getReferenceFolder(folderId);
          if (folder && !suggestions.find(s => s.id === folder.id)) {
            suggestions.push(folder);
          }
          break;
        }
      }
    }

    return suggestions.slice(0, 3);
  }

  // =====================
  // Settings operations
  // =====================
  async getSetting(key) {
    const result = await this.get(STORES.SETTINGS, key);
    return result ? result.value : null;
  }

  async setSetting(key, value) {
    return this.update(STORES.SETTINGS, { key, value });
  }

  // =====================
  // Data management
  // =====================
  async exportData() {
    const data = {
      version: DB_VERSION,
      exportDate: new Date().toISOString(),
      inbox: await this.getAll(STORES.INBOX),
      nextActions: await this.getAll(STORES.NEXT_ACTIONS),
      waitingFor: await this.getAll(STORES.WAITING_FOR),
      reference: await this.getAll(STORES.REFERENCE),
      archived: await this.getAll(STORES.ARCHIVED),
      trash: await this.getAll(STORES.TRASH),
      teamMembers: await this.getAll(STORES.TEAM_MEMBERS),
      contacts: await this.getAll(STORES.CONTACTS),
      tagUsage: await this.getAll(STORES.TAG_USAGE),
      projects: await this.getAll(STORES.PROJECTS),
      referenceFolders: await this.getAll(STORES.REFERENCE_FOLDERS)
    };
    return data;
  }

  async importData(data) {
    if (!data.version) {
      throw new Error('Invalid data format');
    }

    // Clear existing data
    await this.clear(STORES.INBOX);
    await this.clear(STORES.NEXT_ACTIONS);
    await this.clear(STORES.WAITING_FOR);
    await this.clear(STORES.REFERENCE);
    await this.clear(STORES.ARCHIVED);
    await this.clear(STORES.TRASH);
    await this.clear(STORES.TEAM_MEMBERS);
    await this.clear(STORES.CONTACTS);
    await this.clear(STORES.TAG_USAGE);
    await this.clear(STORES.PROJECTS);
    await this.clear(STORES.REFERENCE_FOLDERS);

    // Import new data
    for (const item of (data.inbox || [])) {
      await this.add(STORES.INBOX, item);
    }
    for (const item of (data.nextActions || [])) {
      await this.add(STORES.NEXT_ACTIONS, item);
    }
    for (const item of (data.waitingFor || [])) {
      await this.add(STORES.WAITING_FOR, item);
    }
    for (const item of (data.reference || [])) {
      await this.add(STORES.REFERENCE, item);
    }
    for (const item of (data.archived || [])) {
      await this.add(STORES.ARCHIVED, item);
    }
    for (const item of (data.trash || [])) {
      await this.add(STORES.TRASH, item);
    }
    for (const item of (data.teamMembers || [])) {
      await this.add(STORES.TEAM_MEMBERS, item);
    }
    for (const item of (data.contacts || [])) {
      await this.add(STORES.CONTACTS, item);
    }
    for (const item of (data.tagUsage || [])) {
      await this.add(STORES.TAG_USAGE, item);
    }
    for (const item of (data.projects || [])) {
      await this.add(STORES.PROJECTS, item);
    }
    for (const item of (data.referenceFolders || [])) {
      await this.add(STORES.REFERENCE_FOLDERS, item);
    }

    return true;
  }

  async mergeImportData(data) {
    // Merge import - add new items, skip existing (by id)
    const existingIds = new Set();

    // Gather existing IDs
    const existingInbox = await this.getAll(STORES.INBOX);
    const existingActions = await this.getAll(STORES.NEXT_ACTIONS);
    const existingWaiting = await this.getAll(STORES.WAITING_FOR);
    const existingRef = await this.getAll(STORES.REFERENCE);
    const existingProjects = await this.getAll(STORES.PROJECTS);
    const existingArchived = await this.getAll(STORES.ARCHIVED);

    [existingInbox, existingActions, existingWaiting, existingRef, existingProjects, existingArchived]
      .flat()
      .forEach(item => existingIds.add(item.id));

    let imported = 0;
    let skipped = 0;

    // Import new items only
    for (const item of (data.inbox || [])) {
      if (!existingIds.has(item.id)) {
        await this.add(STORES.INBOX, item);
        imported++;
      } else {
        skipped++;
      }
    }
    for (const item of (data.nextActions || [])) {
      if (!existingIds.has(item.id)) {
        await this.add(STORES.NEXT_ACTIONS, item);
        imported++;
      } else {
        skipped++;
      }
    }
    for (const item of (data.waitingFor || [])) {
      if (!existingIds.has(item.id)) {
        await this.add(STORES.WAITING_FOR, item);
        imported++;
      } else {
        skipped++;
      }
    }
    for (const item of (data.reference || [])) {
      if (!existingIds.has(item.id)) {
        await this.add(STORES.REFERENCE, item);
        imported++;
      } else {
        skipped++;
      }
    }
    for (const item of (data.projects || [])) {
      if (!existingIds.has(item.id)) {
        await this.add(STORES.PROJECTS, item);
        imported++;
      } else {
        skipped++;
      }
    }
    for (const item of (data.archived || [])) {
      if (!existingIds.has(item.id)) {
        await this.add(STORES.ARCHIVED, item);
        imported++;
      } else {
        skipped++;
      }
    }

    return { imported, skipped };
  }

  async clearAllData() {
    await this.clear(STORES.INBOX);
    await this.clear(STORES.NEXT_ACTIONS);
    await this.clear(STORES.WAITING_FOR);
    await this.clear(STORES.REFERENCE);
    await this.clear(STORES.ARCHIVED);
    await this.clear(STORES.TRASH);
    await this.clear(STORES.TAG_USAGE);
    await this.clear(STORES.PROJECTS);
    await this.clear(STORES.REFERENCE_FOLDERS);
    // Don't clear team members and contacts by default
    return true;
  }

  // Check if first run (for sample data)
  async isFirstRun() {
    const setting = await this.getSetting('initialized');
    return !setting;
  }

  async markInitialized() {
    return this.setSetting('initialized', true);
  }

  // Get counts for navigation
  async getCounts() {
    const inbox = await this.count(STORES.INBOX);
    const nextActions = await this.getNextActions();
    const waitingFor = await this.getWaitingForItems();
    const overdueItems = await this.getOverdueWaitingItems();

    const contextCounts = {};
    for (const item of nextActions) {
      for (const context of item.contexts) {
        contextCounts[context] = (contextCounts[context] || 0) + 1;
      }
    }

    // Group waiting-for by person
    const waitingCounts = {};
    for (const item of waitingFor) {
      const key = `@waiting-for-${item.personName.toLowerCase()}`;
      waitingCounts[key] = (waitingCounts[key] || 0) + 1;
    }

    const reference = await this.count(STORES.REFERENCE);
    const archived = await this.count(STORES.ARCHIVED);
    const trash = await this.count(STORES.TRASH);

    // Projects count (only active projects)
    const allProjects = await this.getProjects();
    const activeProjects = allProjects.filter(p => p.status === 'active');

    return {
      inbox,
      nextActions: nextActions.length,
      waitingFor: waitingFor.length,
      waitingOverdue: overdueItems.length,
      waitingCounts,
      contextCounts,
      reference,
      archived,
      trash,
      projects: activeProjects.length
    };
  }

  // =====================
  // Archive Operations (Extended)
  // =====================
  async getArchivedItems() {
    const items = await this.getAll(STORES.ARCHIVED);
    // Add type information based on item properties
    return items.map(item => {
      let type = 'actions';
      if (item.personId) {
        type = 'waiting';
      } else if (item.name && !item.action) {
        type = 'projects';
      }
      return { ...item, type };
    }).sort((a, b) => new Date(b.completedDate || b.archivedDate) - new Date(a.completedDate || a.archivedDate));
  }

  async restoreFromArchive(id, type) {
    const item = await this.get(STORES.ARCHIVED, id);
    if (!item) return null;

    // Remove archive-specific fields
    const restored = { ...item };
    delete restored.completedDate;
    delete restored.archivedDate;
    delete restored.originalStore;
    restored.id = this.generateId();
    restored.completed = false;

    // Use originalStore if available, otherwise fall back to heuristics
    let targetStore;
    if (item.originalStore) {
      const storeMap = {
        'nextActions': STORES.NEXT_ACTIONS,
        'waitingFor': STORES.WAITING_FOR,
        'projects': STORES.PROJECTS
      };
      targetStore = storeMap[item.originalStore] || STORES.NEXT_ACTIONS;
    } else if (type === 'waiting' || item.personId) {
      targetStore = STORES.WAITING_FOR;
    } else if (type === 'projects' || (item.name && !item.action)) {
      targetStore = STORES.PROJECTS;
      restored.status = 'active';
    } else {
      targetStore = STORES.NEXT_ACTIONS;
    }

    await this.add(targetStore, restored);
    await this.delete(STORES.ARCHIVED, id);
    return restored;
  }

  async deleteFromArchive(id) {
    return this.delete(STORES.ARCHIVED, id);
  }

  async permanentlyDeleteFromTrash(id) {
    return this.delete(STORES.TRASH, id);
  }

  // Update project in updateProject to handle id properly
  async updateProject(idOrProject, updates = null) {
    let project;
    if (typeof idOrProject === 'string') {
      project = await this.getProject(idOrProject);
      if (!project) return null;
      Object.assign(project, updates);
    } else {
      project = idOrProject;
    }
    project.updated = new Date().toISOString();
    return this.update(STORES.PROJECTS, project);
  }

  // ============================================
  // FULL-TEXT SEARCH
  // ============================================

  async searchAll(query) {
    if (!query || query.trim().length === 0) {
      return { inbox: [], actions: [], waiting: [], projects: [], reference: [], archive: [] };
    }

    const searchTerm = query.toLowerCase().trim();
    const results = {
      inbox: [],
      actions: [],
      waiting: [],
      projects: [],
      reference: [],
      archive: []
    };

    // Search inbox
    const inbox = await this.getInboxItems();
    results.inbox = inbox.filter(item =>
      this.matchesSearch(item.content, searchTerm)
    ).map(item => ({ ...item, _type: 'inbox', _matchField: 'content' }));

    // Search next actions
    const actions = await this.getNextActions();
    results.actions = actions.filter(item =>
      this.matchesSearch(item.action, searchTerm) ||
      this.matchesSearch(item.originalContent, searchTerm) ||
      (item.tags && item.tags.some(tag => this.matchesSearch(tag, searchTerm))) ||
      (item.contexts && item.contexts.some(ctx => this.matchesSearch(ctx, searchTerm)))
    ).map(item => ({ ...item, _type: 'action', _matchField: this.getMatchField(item, searchTerm) }));

    // Search waiting for
    const waiting = await this.getWaitingFor();
    results.waiting = waiting.filter(item =>
      this.matchesSearch(item.action, searchTerm) ||
      this.matchesSearch(item.delegatedTo, searchTerm) ||
      this.matchesSearch(item.originalContent, searchTerm)
    ).map(item => ({ ...item, _type: 'waiting', _matchField: this.getMatchField(item, searchTerm) }));

    // Search projects
    const projects = await this.getProjects();
    results.projects = projects.filter(item =>
      this.matchesSearch(item.name, searchTerm) ||
      this.matchesSearch(item.description, searchTerm) ||
      this.matchesSearch(item.outcome, searchTerm)
    ).map(item => ({ ...item, _type: 'project', _matchField: this.getMatchField(item, searchTerm) }));

    // Search reference
    const reference = await this.getReference();
    results.reference = reference.filter(item =>
      this.matchesSearch(item.title, searchTerm) ||
      this.matchesSearch(item.content, searchTerm) ||
      this.matchesSearch(item.folder, searchTerm) ||
      (item.tags && item.tags.some(tag => this.matchesSearch(tag, searchTerm)))
    ).map(item => ({ ...item, _type: 'reference', _matchField: this.getMatchField(item, searchTerm) }));

    // Search archive
    const archive = await this.getArchived();
    results.archive = archive.filter(item =>
      this.matchesSearch(item.action, searchTerm) ||
      this.matchesSearch(item.name, searchTerm) ||
      this.matchesSearch(item.originalContent, searchTerm)
    ).map(item => ({ ...item, _type: 'archive', _matchField: this.getMatchField(item, searchTerm) }));

    return results;
  }

  matchesSearch(text, searchTerm) {
    if (!text) return false;
    return text.toLowerCase().includes(searchTerm);
  }

  getMatchField(item, searchTerm) {
    // Determine which field matched for highlighting
    if (item.action && this.matchesSearch(item.action, searchTerm)) return 'action';
    if (item.name && this.matchesSearch(item.name, searchTerm)) return 'name';
    if (item.title && this.matchesSearch(item.title, searchTerm)) return 'title';
    if (item.content && this.matchesSearch(item.content, searchTerm)) return 'content';
    if (item.description && this.matchesSearch(item.description, searchTerm)) return 'description';
    if (item.delegatedTo && this.matchesSearch(item.delegatedTo, searchTerm)) return 'delegatedTo';
    if (item.originalContent && this.matchesSearch(item.originalContent, searchTerm)) return 'originalContent';
    return 'other';
  }

  getTotalSearchResults(results) {
    return results.inbox.length +
           results.actions.length +
           results.waiting.length +
           results.projects.length +
           results.reference.length +
           results.archive.length;
  }

  // =====================
  // Areas of Responsibility
  // =====================

  async initializeAreas() {
    const areas = await this.getAreas();
    if (areas.length === 0) {
      const defaultAreas = [
        { name: 'Work', color: '#6366f1', icon: 'briefcase' },
        { name: 'Health', color: '#10b981', icon: 'heart' },
        { name: 'Family', color: '#f59e0b', icon: 'users' },
        { name: 'Finance', color: '#ef4444', icon: 'dollar-sign' },
        { name: 'Personal', color: '#8b5cf6', icon: 'user' }
      ];

      for (const area of defaultAreas) {
        await this.createArea(area.name, area.color, area.icon);
      }
    }
  }

  async createArea(name, color = '#6366f1', icon = 'folder') {
    const area = {
      id: this.generateId(),
      name: name.trim(),
      color,
      icon,
      createdAt: new Date().toISOString(),
      sortOrder: Date.now()
    };

    await this.add(STORES.AREAS, area);
    return area.id;
  }

  async getAreas() {
    return await this.getAll(STORES.AREAS);
  }

  async getArea(id) {
    return await this.get(STORES.AREAS, id);
  }

  async updateArea(id, updates) {
    const area = await this.getArea(id);
    if (area) {
      const updated = { ...area, ...updates };
      await this.update(STORES.AREAS, updated);
    }
  }

  async deleteArea(id) {
    // Remove area from all items that reference it
    const actions = await this.getActions();
    for (const action of actions) {
      if (action.areaId === id) {
        await this.updateAction(action.id, { areaId: null });
      }
    }

    const projects = await this.getProjects();
    for (const project of projects) {
      if (project.areaId === id) {
        await this.updateProject(project.id, { areaId: null });
      }
    }

    await this.delete(STORES.AREAS, id);
  }

  async getItemsByArea(areaId) {
    const actions = await this.getActions();
    const projects = await this.getProjects();

    return {
      actions: actions.filter(a => a.areaId === areaId),
      projects: projects.filter(p => p.areaId === areaId)
    };
  }

  async getAreaStats() {
    const areas = await this.getAreas();
    const actions = await this.getActions();
    const projects = await this.getProjects();

    return areas.map(area => {
      const areaActions = actions.filter(a => a.areaId === area.id);
      const areaProjects = projects.filter(p => p.areaId === area.id);

      return {
        ...area,
        actionCount: areaActions.length,
        activeActionCount: areaActions.filter(a => !a.completed).length,
        projectCount: areaProjects.length,
        activeProjectCount: areaProjects.filter(p => p.status !== 'completed').length
      };
    });
  }
}

// Export singleton instance
const db = new GTDDatabase();
