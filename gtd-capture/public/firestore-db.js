// firestore-db.js - Firestore Database Operations (mirrors db.js API)
// ===================================================================
// This file provides the same API as db.js but uses Firestore instead of IndexedDB
// It can be swapped in place of db.js when user is authenticated

class FirestoreDB {
  constructor() {
    this.isSupported = typeof firebase !== 'undefined';
    this.db = null;
    this.storage = null;
    this.userId = null;
    this.unsubscribers = [];
    this.listeners = {};
  }

  // =====================
  // Initialization
  // =====================

  async init() {
    if (!this.isSupported) {
      console.error('Firebase not loaded');
      return;
    }

    this.db = firebaseDB;
    this.storage = firebaseStorage;

    // Enable offline persistence
    try {
      await this.db.enablePersistence({ synchronizeTabs: true });
      console.log('Firestore offline persistence enabled');
    } catch (err) {
      if (err.code === 'failed-precondition') {
        console.log('Offline persistence unavailable (multiple tabs open)');
      } else if (err.code === 'unimplemented') {
        console.log('Offline persistence not supported by browser');
      }
    }

    // Wait for auth
    return new Promise((resolve) => {
      const unsubscribe = firebaseAuth.onAuthStateChanged((user) => {
        if (user) {
          this.userId = user.uid;
          console.log('FirestoreDB initialized for user:', this.userId);
          resolve();
        }
        unsubscribe();
      });
    });
  }

  // Helper to get user collection reference
  userCollection(collectionName) {
    if (!this.userId) throw new Error('User not authenticated');
    return this.db.collection('users').doc(this.userId).collection(collectionName);
  }

  // Helper to generate ID
  generateId() {
    return this.db.collection('_').doc().id;
  }

  // =====================
  // Generic CRUD Operations
  // =====================

  async add(collectionName, data) {
    const docRef = await this.userCollection(collectionName).add({
      ...data,
      _created: firebase.firestore.FieldValue.serverTimestamp()
    });
    return docRef.id;
  }

  async get(collectionName, id) {
    const doc = await this.userCollection(collectionName).doc(id).get();
    if (doc.exists) {
      return { ...doc.data(), id: doc.id };  // Firestore doc ID comes after spread
    }
    return null;
  }

  async getAll(collectionName, orderByField = '_created', orderDir = 'desc', forceServer = false) {
    const query = this.userCollection(collectionName).orderBy(orderByField, orderDir);

    // Force fetch from server to bypass cache if requested
    const snapshot = forceServer
      ? await query.get({ source: 'server' })
      : await query.get();

    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,  // Firestore doc ID must come AFTER spread to avoid being overwritten
        _created: data._created?.toDate?.() || new Date()
      };
    });
  }

  /**
   * Force refresh inbox from server (bypasses cache)
   */
  async refreshInboxFromServer() {
    return this.getAll('inbox', 'timestamp', 'desc', true);
  }

  async update(collectionName, id, data) {
    await this.userCollection(collectionName).doc(id).update({
      ...data,
      _updated: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  async delete(collectionName, id) {
    await this.userCollection(collectionName).doc(id).delete();
  }

  // =====================
  // INBOX Operations
  // =====================

  async addToInbox(content, type = 'text', metadata = {}) {
    const item = {
      content: content,
      type: type,
      timestamp: new Date().toISOString(),
      processed: false
    };

    const attachment = metadata.attachment;
    if (attachment) {
      // Upload file to Firebase Storage
      if (attachment.data && attachment.data.startsWith('data:')) {
        const filePath = `users/${this.userId}/inbox/${Date.now()}_${attachment.name}`;
        const ref = this.storage.ref(filePath);
        await ref.putString(attachment.data, 'data_url');
        const url = await ref.getDownloadURL();

        item.attachment = {
          name: attachment.name,
          type: attachment.type,
          size: attachment.size,
          url: url,
          path: filePath
        };

        // Keep thumbnail/preview as data URLs (small)
        if (attachment.thumbnail) item.attachment.thumbnail = attachment.thumbnail;
        if (attachment.preview) item.attachment.preview = attachment.preview;
      } else {
        item.attachment = attachment;
      }
    }

    return await this.add('inbox', item);
  }

  async getInbox(forceServer = false) {
    // Use _created for ordering (all docs have this) to ensure all items are returned
    const items = await this.getAll('inbox', '_created', 'desc', forceServer);
    return items.map(item => ({
      ...item,
      timestamp: item.timestamp || item._created
    }));
  }

  async getInboxItem(id) {
    return await this.get('inbox', id);
  }

  async deleteInboxItem(id) {
    const item = await this.get('inbox', id);
    // Delete associated file from storage
    if (item?.attachment?.path) {
      try {
        await this.storage.ref(item.attachment.path).delete();
      } catch (e) {
        console.log('Could not delete file:', e);
      }
    }
    await this.delete('inbox', id);
  }

  async getInboxCount(forceServer = false) {
    const query = this.userCollection('inbox');
    const snapshot = forceServer
      ? await query.get({ source: 'server' })
      : await query.get();
    return snapshot.size;
  }

  // =====================
  // NEXT ACTIONS Operations
  // =====================

  async addToNextActions(action, contexts, originalContent, originalTimestamp, tags = [], options = {}) {
    const item = {
      action: action.trim(),
      contexts: contexts || ['@anywhere'],
      originalContent: originalContent,
      originalTimestamp: originalTimestamp,
      processedDate: new Date().toISOString(),
      tags: tags,
      completed: false,
      completedDate: null,
      priority: options.priority || 'medium',
      dueDate: options.dueDate || null,
      location: options.location || null,
      projectId: options.projectId || null,
      sequenceOrder: options.sequenceOrder || null,
      dependsOn: options.dependsOn || null,
      isSequential: options.isSequential || false
    };

    return await this.add('nextActions', item);
  }

  async createAction(actionData) {
    const item = {
      action: actionData.action.trim(),
      contexts: actionData.contexts || ['@anywhere'],
      projectId: actionData.projectId || null,
      sequenceOrder: actionData.sequenceOrder || null,
      dependsOn: actionData.dependsOn || null,
      isSequential: actionData.isSequential || false,
      priority: actionData.priority || 'medium',
      dueDate: actionData.dueDate || null,
      tags: actionData.tags || [],
      completed: false,
      completedDate: null,
      processedDate: new Date().toISOString()
    };

    const id = await this.add('nextActions', item);
    return { id, ...item };
  }

  async getNextActions() {
    // Use _created for consistent ordering (all docs have this field)
    return await this.getAll('nextActions', '_created', 'desc');
  }

  async getNextAction(id) {
    return await this.get('nextActions', id);
  }

  async updateNextAction(id, updates) {
    await this.update('nextActions', id, updates);
  }

  async completeAction(id) {
    // Get the action first
    const action = await this.get('nextActions', id);

    if (!action) {
      throw new Error(`Action not found with id: ${id}`);
    }

    // Mark as completed
    action.completed = true;
    action.completedDate = new Date().toISOString();

    // Add to archive
    await this.addToArchive(action, 'nextActions');

    // Delete from nextActions
    await this.delete('nextActions', id);
  }

  async uncompleteAction(id) {
    await this.update('nextActions', id, {
      completed: false,
      completedDate: null
    });
  }

  async deleteNextAction(id) {
    await this.delete('nextActions', id);
  }

  async getNextActionsCount(forceServer = false) {
    // Use getNextActions() to ensure count matches displayed items
    // (Firestore where queries don't match documents missing the field)
    const actions = forceServer
      ? await this.getAll('nextActions', '_created', 'desc', true)
      : await this.getNextActions();
    return actions.filter(a => !a.completed).length;
  }

  async getAvailableActions() {
    const allActions = await this.getNextActions();
    const completedIds = new Set(allActions.filter(a => a.completed).map(a => a.id));

    return allActions.filter(action => {
      if (action.completed) return false;
      if (!action.isSequential) return true;
      if (!action.dependsOn) return true;
      return completedIds.has(action.dependsOn);
    });
  }

  async getBlockedActions() {
    const allActions = await this.getNextActions();
    const activeActions = allActions.filter(a => !a.completed);
    const completedIds = new Set(allActions.filter(a => a.completed).map(a => a.id));

    const blocked = activeActions.filter(action => {
      if (!action.isSequential) return false;
      if (!action.dependsOn) return false;
      return !completedIds.has(action.dependsOn);
    });

    return blocked.map(action => {
      const blockedBy = allActions.find(a => a.id === action.dependsOn);
      return {
        ...action,
        blockedByAction: blockedBy ? blockedBy.action : 'Unknown action'
      };
    });
  }

  async getProjectActions(projectId) {
    const snapshot = await this.userCollection('nextActions')
      .where('projectId', '==', projectId)
      .get();

    const actions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return actions.sort((a, b) => (a.sequenceOrder || 0) - (b.sequenceOrder || 0));
  }

  // =====================
  // WAITING FOR Operations
  // =====================

  async addToWaitingFor(action, person, method, originalContent, originalTimestamp, projectId = null) {
    const item = {
      action: action.trim(),
      delegatedTo: person, // Standardized field name (was 'person')
      delegatedVia: method,
      originalContent: originalContent,
      originalTimestamp: originalTimestamp,
      delegatedDate: new Date().toISOString(),
      followUpCount: 0,
      lastFollowUp: null,
      completed: false,
      projectId: projectId
    };

    return await this.add('waitingFor', item);
  }

  async getWaitingFor() {
    // Fetch without orderBy to include all documents (some may lack _created field)
    const snapshot = await this.userCollection('waitingFor').get();
    const items = snapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id
    }));
    // Filter out completed items for display
    return items.filter(item => !item.completed);
  }

  async getWaitingForItem(id) {
    return await this.get('waitingFor', id);
  }

  async updateWaitingFor(id, updates) {
    await this.update('waitingFor', id, updates);
  }

  async incrementFollowUp(id) {
    const item = await this.get('waitingFor', id);
    if (item) {
      await this.update('waitingFor', id, {
        followUpCount: (item.followUpCount || 0) + 1,
        lastFollowUp: new Date().toISOString()
      });
    }
  }

  async completeWaitingFor(id) {
    // Get the waiting item first
    const item = await this.get('waitingFor', id);
    if (!item) {
      throw new Error('Waiting item not found');
    }

    // Mark as completed
    item.completed = true;
    item.completedDate = new Date().toISOString();

    // Add to archive
    await this.addToArchive(item, 'waitingFor');

    // Delete from waitingFor
    await this.delete('waitingFor', id);
  }

  async deleteWaitingFor(id) {
    await this.delete('waitingFor', id);
  }

  async getWaitingForCount() {
    // Use getWaitingFor() to ensure count matches displayed items
    // (Firestore where queries don't match documents missing the field)
    const items = await this.getWaitingFor();
    return items.length;
  }

  // =====================
  // PROJECTS Operations
  // =====================

  async createProject(name, description = '', category = 'General', options = {}) {
    const project = {
      name: name.trim(),
      description: description,
      category: category,
      status: 'active',
      actionMode: options.actionMode || 'parallel',
      color: options.color || null,
      dueDate: options.dueDate || null,
      createdDate: new Date().toISOString(),
      completedDate: null
    };

    return await this.add('projects', project);
  }

  async getProjects() {
    // Use _created instead of createdDate to ensure all projects are returned
    // (Firestore requires the orderBy field to exist on all documents)
    return await this.getAll('projects', '_created', 'desc');
  }

  async getActiveProjects() {
    const snapshot = await this.userCollection('projects')
      .where('status', '==', 'active')
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async getProject(id) {
    return await this.get('projects', id);
  }

  async updateProject(id, updates) {
    await this.update('projects', id, updates);
  }

  async completeProject(id) {
    await this.update('projects', id, {
      status: 'completed',
      completedDate: new Date().toISOString()
    });
  }

  async deleteProject(id) {
    await this.delete('projects', id);
  }

  async getProjectsCount() {
    const snapshot = await this.userCollection('projects')
      .where('status', '==', 'active')
      .get();
    return snapshot.size;
  }

  // =====================
  // REFERENCE Operations
  // =====================

  async addToReference(title, content, folderId = null, tags = [], attachment = null, attachments = null) {
    const item = {
      title: title.trim(),
      content: content,
      folderId: folderId,
      tags: tags,
      createdDate: new Date().toISOString()
    };

    // Handle single attachment (backward compatible)
    if (attachment) {
      if (attachment.data && attachment.data.startsWith('data:')) {
        const filePath = `users/${this.userId}/reference/${Date.now()}_${attachment.name}`;
        const ref = this.storage.ref(filePath);
        await ref.putString(attachment.data, 'data_url');
        const url = await ref.getDownloadURL();

        item.attachment = {
          name: attachment.name,
          type: attachment.type,
          size: attachment.size,
          url: url,
          path: filePath
        };
      } else {
        item.attachment = attachment;
      }
    }

    // Handle multiple attachments
    if (attachments && attachments.length > 0) {
      item.attachments = [];
      for (const att of attachments) {
        if (att.data && att.data.startsWith('data:')) {
          const filePath = `users/${this.userId}/reference/${Date.now()}_${att.name}`;
          const ref = this.storage.ref(filePath);
          await ref.putString(att.data, 'data_url');
          const url = await ref.getDownloadURL();

          item.attachments.push({
            name: att.name,
            type: att.type,
            size: att.size,
            url: url,
            path: filePath
          });
        } else {
          item.attachments.push(att);
        }
      }
    }

    return await this.add('reference', item);
  }

  async getReference() {
    return await this.getAll('reference', 'createdDate', 'desc');
  }

  async getReferenceItem(id) {
    return await this.get('reference', id);
  }

  async updateReference(id, updates) {
    await this.update('reference', id, updates);
  }

  async deleteReference(id) {
    const item = await this.get('reference', id);
    if (item?.attachment?.path) {
      try {
        await this.storage.ref(item.attachment.path).delete();
      } catch (e) {
        console.log('Could not delete file:', e);
      }
    }
    await this.delete('reference', id);
  }

  async getReferenceByFolder(folderId) {
    const snapshot = await this.userCollection('reference')
      .where('folderId', '==', folderId)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  // =====================
  // FOLDERS Operations
  // =====================

  async createFolder(name, category = 'general', icon = null) {
    const folder = {
      name: name.trim(),
      category: category,
      icon: icon,
      createdDate: new Date().toISOString()
    };

    return await this.add('folders', folder);
  }

  async getReferenceFolders() {
    const folders = await this.getAll('folders');
    // Sort by order, then by name for items without order
    return folders.sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) {
        return a.order - b.order;
      }
      return (a.name || '').localeCompare(b.name || '');
    });
  }

  /**
   * Reset reference folders to defaults (for existing users)
   */
  async resetReferenceFolders() {
    // Delete all existing folders
    const existing = await this.getReferenceFolders();
    for (const folder of existing) {
      await this.delete('folders', folder.id);
    }
    // Re-initialize with defaults
    await this.initializeReferenceFolders();
  }

  async getFolderById(id) {
    return await this.get('folders', id);
  }

  async updateFolder(id, updates) {
    await this.update('folders', id, updates);
  }

  async deleteFolder(id) {
    await this.delete('folders', id);
  }

  async initializeReferenceFolders() {
    const folders = await this.getReferenceFolders();
    if (folders.length === 0) {
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
        // Use the predetermined ID for consistent hierarchy
        const docRef = this.userCollection('folders').doc(folder.id);
        await docRef.set({
          name: folder.name,
          parentId: folder.parentId,
          category: folder.category,
          icon: folder.icon,
          order: folder.order,
          created: new Date().toISOString(),
          itemCount: 0,
          _created: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    }
  }

  // =====================
  // SOMEDAY/MAYBE Operations
  // =====================

  async addToSomedayMaybe(contentOrData, category = 'personal', notes = '') {
    // Support both object and separate parameters
    let content, cat, n;
    if (typeof contentOrData === 'object' && contentOrData !== null) {
      content = contentOrData.content;
      cat = contentOrData.category || 'personal';
      n = contentOrData.notes || '';
    } else {
      content = contentOrData;
      cat = category;
      n = notes;
    }

    const item = {
      content: content.trim(),
      category: cat,
      notes: n,
      created: new Date().toISOString(),
      createdDate: new Date().toISOString(),
      lastReviewed: null
    };

    return await this.add('somedayMaybe', item);
  }

  async getSomedayMaybe() {
    // Use _created for consistent ordering (all docs created via add() have this)
    return await this.getAll('somedayMaybe', '_created', 'desc');
  }

  async getSomedayMaybeItem(id) {
    return await this.get('somedayMaybe', id);
  }

  async updateSomedayMaybe(id, updates) {
    await this.update('somedayMaybe', id, updates);
  }

  async deleteSomedayMaybe(id) {
    await this.delete('somedayMaybe', id);
  }

  async markSomedayReviewed(id) {
    await this.update('somedayMaybe', id, {
      lastReviewed: new Date().toISOString()
    });
  }

  async getSomedayMaybeCount() {
    const snapshot = await this.userCollection('somedayMaybe').get();
    return snapshot.size;
  }

  // =====================
  // ARCHIVE Operations
  // =====================

  async addToArchive(item, originalStore) {
    const archivedItem = {
      ...item,
      originalStore: originalStore,
      archivedDate: new Date().toISOString()
    };

    delete archivedItem.id;
    delete archivedItem._created;

    return await this.add('archive', archivedItem);
  }

  async getArchived() {
    return await this.getAll('archive', 'archivedDate', 'desc');
  }

  async deleteArchived(id) {
    await this.delete('archive', id);
  }

  async getArchivedCount() {
    const snapshot = await this.userCollection('archive').get();
    return snapshot.size;
  }

  // =====================
  // TRASH Operations
  // =====================

  async moveToTrash(itemId, sourceStore) {
    const stores = {
      'inbox': 'inbox',
      'nextActions': 'nextActions',
      'waitingFor': 'waitingFor',
      'projects': 'projects',
      'reference': 'reference',
      'somedayMaybe': 'somedayMaybe'
    };

    const store = stores[sourceStore];
    if (!store) return;

    const item = await this.get(store, itemId);
    if (!item) return;

    // Add to trash
    await this.add('trash', {
      ...item,
      originalStore: sourceStore,
      deletedDate: new Date().toISOString()
    });

    // Delete from source
    await this.delete(store, itemId);
  }

  async getTrash() {
    return await this.getAll('trash', 'deletedDate', 'desc');
  }

  async restoreFromTrash(trashId) {
    const item = await this.get('trash', trashId);
    if (!item) return;

    const { originalStore, deletedDate, _created, ...restoreData } = item;
    delete restoreData.id;

    // Add back to original store
    await this.add(originalStore, restoreData);

    // Remove from trash
    await this.delete('trash', trashId);
  }

  async permanentlyDelete(trashId) {
    const item = await this.get('trash', trashId);
    if (item?.attachment?.path) {
      try {
        await this.storage.ref(item.attachment.path).delete();
      } catch (e) {
        console.log('Could not delete file:', e);
      }
    }
    await this.delete('trash', trashId);
  }

  async emptyTrash() {
    const trash = await this.getTrash();
    for (const item of trash) {
      await this.permanentlyDelete(item.id);
    }
  }

  async purgeOldTrash() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const trash = await this.getTrash();
    let purged = 0;

    for (const item of trash) {
      const deletedDate = new Date(item.deletedDate);
      if (deletedDate < thirtyDaysAgo) {
        await this.permanentlyDelete(item.id);
        purged++;
      }
    }

    return purged;
  }

  async getTrashCount() {
    const snapshot = await this.userCollection('trash').get();
    return snapshot.size;
  }

  // =====================
  // TEAM MEMBERS Operations
  // =====================

  async addTeamMember(nameOrData, role = '', color = null) {
    // Support both object and separate parameters
    let member;
    if (typeof nameOrData === 'object' && nameOrData !== null) {
      member = {
        name: (nameOrData.name || '').trim(),
        role: nameOrData.role || '',
        title: nameOrData.title || '',
        color: nameOrData.color || null,
        email: nameOrData.email || '',
        phone: nameOrData.phone || '',
        notes: nameOrData.notes || '',
        isManual: nameOrData.isManual || false,
        addedDate: nameOrData.addedDate || new Date().toISOString(),
        createdDate: new Date().toISOString()
      };
    } else {
      member = {
        name: nameOrData.trim(),
        role: role,
        title: '',
        color: color,
        email: '',
        phone: '',
        createdDate: new Date().toISOString()
      };
    }

    return await this.add('teamMembers', member);
  }

  async getTeamMembers() {
    return await this.getAll('teamMembers', 'name', 'asc');
  }

  async getTeamMember(id) {
    return await this.get('teamMembers', id);
  }

  async updateTeamMember(memberOrId, updates = null) {
    // Support both signatures:
    // updateTeamMember(member) - where member has an id property
    // updateTeamMember(id, updates) - legacy signature
    if (typeof memberOrId === 'object' && memberOrId !== null && memberOrId.id) {
      const { id, ...memberUpdates } = memberOrId;
      await this.update('teamMembers', id, memberUpdates);
    } else if (typeof memberOrId === 'string' && updates) {
      await this.update('teamMembers', memberOrId, updates);
    } else {
      throw new Error('updateTeamMember requires either a member object with id, or (id, updates) parameters');
    }
  }

  async deleteTeamMember(id) {
    const member = await this.getTeamMember(id);
    if (!member) return false;

    // Get affected items
    const waitingItems = await this.getWaitingForByPerson(member.name);
    const actionsWithContext = member.contextId
      ? await this.getActionsByContext(member.contextId)
      : [];

    // Move waiting items to generic @waiting context if they have the member's waiting context
    if (member.waitingContextId) {
      for (const item of waitingItems) {
        if (item.contexts && Array.isArray(item.contexts)) {
          const newContexts = item.contexts.map(c =>
            c === member.waitingContextId ? '@waiting' : c
          );
          await this.update('waitingFor', item.id, { contexts: newContexts });
        }
      }
    }

    // Remove team member context from actions
    if (member.contextId) {
      for (const action of actionsWithContext) {
        const newContexts = action.contexts.filter(c => c !== member.contextId);
        await this.update('nextActions', action.id, { contexts: newContexts });
      }
    }

    // Delete the team member
    await this.delete('teamMembers', id);

    return {
      deleted: true,
      waitingItemsMoved: waitingItems.length,
      actionsUpdated: actionsWithContext.length
    };
  }

  async initializeTeamMembers() {
    const members = await this.getTeamMembers();
    if (members.length === 0) {
      const defaultMembers = [
        { name: 'Diana', role: 'Office Manager', color: '#ec4899' },
        { name: 'Ivan', role: 'Project Manager', color: '#06b6d4' },
        { name: 'Anonno', role: 'Field Technician', color: '#6366f1' }
      ];

      for (const member of defaultMembers) {
        await this.addTeamMember(member.name, member.role, member.color);
      }
    }
  }

  // =====================
  // CONTACTS Operations
  // =====================

  async addContact(contactData) {
    const contact = {
      name: contactData.name.trim(),
      category: contactData.category || 'other',
      company: contactData.company || '',
      email: contactData.email || '',
      phone: contactData.phone || '',
      notes: contactData.notes || '',
      createdDate: new Date().toISOString()
    };

    return await this.add('contacts', contact);
  }

  async getContacts() {
    return await this.getAll('contacts', 'name', 'asc');
  }

  async getContact(id) {
    return await this.get('contacts', id);
  }

  async updateContact(id, updates) {
    await this.update('contacts', id, updates);
  }

  async deleteContact(id) {
    await this.delete('contacts', id);
  }

  getContactCategories() {
    return [
      { id: 'adjuster', name: 'Insurance Adjuster', icon: '🏢' },
      { id: 'contractor', name: 'Contractor', icon: '🔨' },
      { id: 'vendor', name: 'Vendor/Supplier', icon: '📦' },
      { id: 'client', name: 'Client', icon: '👤' },
      { id: 'other', name: 'Other', icon: '📋' }
    ];
  }

  getInsuranceCarriers() {
    return [
      'State Farm', 'Allstate', 'USAA', 'Farmers', 'Liberty Mutual',
      'Progressive', 'Travelers', 'Nationwide', 'American Family',
      'GEICO', 'Chubb', 'Hartford', 'Erie', 'Auto-Owners'
    ];
  }

  // =====================
  // TEMPLATES Operations
  // =====================

  async createTemplate(name, description, category, actions, icon = '📋') {
    const template = {
      name: name.trim(),
      description: description,
      category: category,
      actions: actions,
      icon: icon,
      timesUsed: 0,
      createdDate: new Date().toISOString()
    };

    return await this.add('templates', template);
  }

  async getTemplates() {
    // Get all templates without ordering to ensure all are returned
    // (ordering requires the field to exist on all documents)
    try {
      const snapshot = await this.userCollection('templates').get();
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error fetching templates:', error);
      return [];
    }
  }

  async getTemplate(id) {
    return await this.get('templates', id);
  }

  async updateTemplate(id, updates) {
    await this.update('templates', id, updates);
  }

  async deleteTemplate(id) {
    await this.delete('templates', id);
  }

  async incrementTemplateUsage(id) {
    const template = await this.get('templates', id);
    if (template) {
      await this.update('templates', id, {
        timesUsed: (template.timesUsed || 0) + 1,
        lastUsed: new Date().toISOString()
      });
    }
  }

  async initializeTemplates() {
    const templates = await this.getTemplates();
    if (templates.length === 0) {
      const defaultTemplates = [
        {
          name: 'Insurance Claim',
          description: 'Standard insurance claim workflow',
          category: 'Business',
          icon: '🏥',
          actions: [
            { action: 'Initial client contact', context: '@phone' },
            { action: 'Schedule site assessment', context: '@phone' },
            { action: 'Document damage with photos', context: '@errands' },
            { action: 'Submit claim to carrier', context: '@computer' },
            { action: 'Follow up on claim status', context: '@phone' }
          ]
        },
        {
          name: 'New Vendor Setup',
          description: 'Onboarding a new vendor or supplier',
          category: 'Business',
          icon: '🤝',
          actions: [
            { action: 'Collect W-9 and insurance certificates', context: '@email' },
            { action: 'Verify insurance coverage', context: '@computer' },
            { action: 'Set up in accounting system', context: '@computer' },
            { action: 'Send welcome packet', context: '@email' }
          ]
        }
      ];

      for (const template of defaultTemplates) {
        await this.createTemplate(
          template.name,
          template.description,
          template.category,
          template.actions,
          template.icon
        );
      }
    }
  }

  // =====================
  // SETTINGS Operations
  // =====================

  async getSetting(key) {
    const doc = await this.db.collection('users').doc(this.userId).get();
    if (doc.exists) {
      const settings = doc.data().settings || {};
      return settings[key] ?? null;
    }
    return null;
  }

  async setSetting(key, value) {
    await this.db.collection('users').doc(this.userId).set({
      settings: { [key]: value }
    }, { merge: true });
  }

  async getAllSettings() {
    const doc = await this.db.collection('users').doc(this.userId).get();
    if (doc.exists) {
      return doc.data().settings || {};
    }
    return {};
  }

  async getUserSettings() {
    return await this.getAllSettings();
  }

  async updateUserSettings(settings) {
    // Merge multiple settings at once
    await this.db.collection('users').doc(this.userId).set({
      settings: settings
    }, { merge: true });
  }

  // =====================
  // STATS Operations
  // =====================

  async recordCapture() {
    const today = new Date().toISOString().split('T')[0];
    const statRef = this.userCollection('stats').doc(today);

    await statRef.set({
      captured: firebase.firestore.FieldValue.increment(1),
      date: today
    }, { merge: true });
  }

  async recordCompletion() {
    const today = new Date().toISOString().split('T')[0];
    const statRef = this.userCollection('stats').doc(today);

    await statRef.set({
      completed: firebase.firestore.FieldValue.increment(1),
      date: today
    }, { merge: true });
  }

  async getDailyStats(date = null) {
    const dateStr = date || new Date().toISOString().split('T')[0];
    const doc = await this.userCollection('stats').doc(dateStr).get();
    if (doc.exists) {
      return doc.data();
    }
    return { captured: 0, completed: 0, delegated: 0 };
  }

  // =====================
  // Onboarding / First Run
  // =====================

  async isFirstRun() {
    const setting = await this.getSetting('initialized');
    return !setting;
  }

  async markInitialized() {
    await this.setSetting('initialized', true);
  }

  async isOnboardingComplete() {
    const setting = await this.getSetting('onboardingComplete');
    return setting === true;
  }

  async markOnboardingComplete() {
    await this.setSetting('onboardingComplete', true);
  }

  // =====================
  // Real-time Listeners
  // =====================

  subscribeToCollection(collectionName, callback) {
    const unsubscribe = this.userCollection(collectionName)
      .orderBy('_created', 'desc')
      .onSnapshot((snapshot) => {
        // Skip updates from cache to prevent stale data flash
        if (snapshot.metadata.fromCache) {
          return;
        }

        const items = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          _created: doc.data()._created?.toDate?.() || new Date()
        }));
        callback(items);
      });

    this.unsubscribers.push(unsubscribe);
    return unsubscribe;
  }

  subscribeToInbox(callback) {
    return this.subscribeToCollection('inbox', callback);
  }

  subscribeToActions(callback) {
    return this.subscribeToCollection('nextActions', callback);
  }

  subscribeToProjects(callback) {
    return this.subscribeToCollection('projects', callback);
  }

  subscribeToWaitingFor(callback) {
    return this.subscribeToCollection('waitingFor', callback);
  }

  unsubscribeAll() {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
  }

  // =====================
  // Data Export/Import
  // =====================

  async exportAllData() {
    const data = {
      inbox: await this.getInbox(),
      nextActions: await this.getNextActions(),
      waitingFor: await this.getWaitingFor(),
      projects: await this.getProjects(),
      reference: await this.getReference(),
      folders: await this.getReferenceFolders(),
      somedayMaybe: await this.getSomedayMaybe(),
      archive: await this.getArchived(),
      teamMembers: await this.getTeamMembers(),
      contacts: await this.getContacts(),
      templates: await this.getTemplates(),
      settings: await this.getAllSettings(),
      exportDate: new Date().toISOString()
    };

    return data;
  }

  async clearAll() {
    const collections = [
      'inbox', 'nextActions', 'waitingFor', 'projects', 'reference',
      'folders', 'somedayMaybe', 'archive', 'trash', 'teamMembers',
      'contacts', 'templates', 'stats'
    ];

    for (const collectionName of collections) {
      const snapshot = await this.userCollection(collectionName).get();
      const batch = this.db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
  }

  // =====================
  // Search Operations
  // =====================

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
    const inbox = await this.getInbox();
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
  // Alias Methods (match db.js naming)
  // =====================

  async getInboxItems(forceServer = false) {
    return this.getInbox(forceServer);
  }

  async deleteFromInbox(id) {
    return this.deleteInboxItem(id);
  }

  async getReferenceItems() {
    return this.getReference();
  }

  async deleteFromReference(id) {
    return this.deleteReference(id);
  }

  async getSomedayMaybeItems() {
    return this.getSomedayMaybe();
  }

  async deleteSomedayMaybe(id) {
    return this.delete('somedayMaybe', id);
  }

  async updateSomedayMaybe(item) {
    return this.update('somedayMaybe', item.id, item);
  }

  async markSomedayMaybeReviewed(id) {
    return this.update('somedayMaybe', id, { lastReviewed: new Date() });
  }

  async promoteToProject(somedayId) {
    const item = await this.get('somedayMaybe', somedayId);
    if (!item) return null;

    const project = await this.createProject(
      item.content,
      item.notes || '',
      item.category || 'General'
    );

    await this.delete('somedayMaybe', somedayId);

    return { projectId: project.id };
  }

  async getArchivedItems() {
    return this.getArchived();
  }

  async restoreFromArchive(id) {
    const item = await this.get('archive', id);
    if (!item) return;

    // Add back to original collection using originalStore field
    const targetCollection = item.originalStore;
    if (targetCollection) {
      const { archivedDate, originalStore, ...restoredItem } = item;
      await this.add(targetCollection, restoredItem);
    }

    await this.delete('archive', id);
  }

  async deleteFromArchive(id) {
    return this.delete('archive', id);
  }

  async getTrashItems() {
    const snapshot = await this.userCollection('trash')
      .orderBy('deletedDate', 'desc')
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async getCounts(forceServer = false) {
    const [inbox, nextActions, waitingFor, projects, someday, trash, reference, archived] = await Promise.all([
      this.getInboxCount(forceServer),
      this.getNextActionsCount(forceServer),
      this.getWaitingForCount(),
      this.getProjectsCount(),
      this.getSomedayMaybeCount(),
      this.getTrashCount(),
      this.getReferenceCount(),
      this.getArchivedCount()
    ]);

    // Get context counts from actions (exclude completed)
    const actions = await this.getNextActions();
    const contextCounts = {};
    for (const action of actions) {
      if (action.completed) continue; // Skip completed actions
      if (action.contexts && Array.isArray(action.contexts)) {
        for (const ctx of action.contexts) {
          contextCounts[ctx] = (contextCounts[ctx] || 0) + 1;
        }
      }
    }

    // Get waiting counts by person
    const waitingItems = await this.getWaitingFor();
    const waitingCounts = {};
    let waitingOverdue = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const item of waitingItems) {
      const personKey = `@waiting-for-${(item.delegatedTo || 'unknown').toLowerCase()}`;
      waitingCounts[personKey] = (waitingCounts[personKey] || 0) + 1;

      // Check if overdue (more than 7 days old without follow-up)
      if (item.delegatedDate) {
        const delegatedDate = new Date(item.delegatedDate);
        const daysSince = Math.floor((today - delegatedDate) / (1000 * 60 * 60 * 24));
        if (daysSince > 7) waitingOverdue++;
      }
    }

    return {
      inbox,
      nextActions,
      waitingFor,
      projects,
      someday,
      trash,
      reference,
      archived,
      contextCounts,
      waitingCounts,
      waitingOverdue
    };
  }

  async getReferenceCount() {
    const snapshot = await this.userCollection('reference').get();
    return snapshot.size;
  }

  async getArchivedCount() {
    const snapshot = await this.userCollection('archive').get();
    return snapshot.size;
  }

  async getSomedayMaybeCount() {
    const snapshot = await this.userCollection('somedayMaybe').get();
    return snapshot.size;
  }

  async getTrashCount() {
    const snapshot = await this.userCollection('trash').get();
    return snapshot.size;
  }

  async getOverdueActions() {
    const actions = await this.getNextActions();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return actions.filter(a => {
      if (!a.dueDate || a.completed) return false;
      const due = new Date(a.dueDate);
      due.setHours(0, 0, 0, 0);
      return due < today;
    });
  }

  async getActionsDueToday() {
    const actions = await this.getNextActions();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return actions.filter(a => {
      if (!a.dueDate || a.completed) return false;
      const due = new Date(a.dueDate);
      due.setHours(0, 0, 0, 0);
      return due.getTime() === today.getTime();
    });
  }

  async getTodayBriefing() {
    const [overdue, dueToday, actions, waiting, inbox] = await Promise.all([
      this.getOverdueActions(),
      this.getActionsDueToday(),
      this.getNextActions(),
      this.getWaitingFor(),
      this.getInbox()
    ]);

    const activeActions = actions.filter(a => !a.completed);
    const activeWaiting = waiting.filter(w => !w.completed);

    // Calculate aging waiting items (more than 3 days old)
    const today = new Date();
    const agingWaiting = activeWaiting.filter(w => {
      if (!w.delegatedDate) return false;
      const delegatedDate = new Date(w.delegatedDate);
      const daysSince = Math.floor((today - delegatedDate) / (1000 * 60 * 60 * 24));
      w.daysSince = daysSince;
      return daysSince >= 3;
    });

    // Build focus items (priority items for today)
    const focusItems = [];

    // Add overdue actions
    for (const item of overdue.slice(0, 3)) {
      focusItems.push({ ...item, type: 'action', reason: 'overdue' });
    }

    // Add due today
    for (const item of dueToday.slice(0, 2)) {
      if (focusItems.length < 5) {
        focusItems.push({ ...item, type: 'action', reason: 'due-today' });
      }
    }

    // Add high priority actions
    const highPriority = activeActions.filter(a => a.priority === 'high' && !overdue.includes(a) && !dueToday.includes(a));
    for (const item of highPriority.slice(0, 2)) {
      if (focusItems.length < 5) {
        focusItems.push({ ...item, type: 'action', reason: 'high-priority' });
      }
    }

    // Add aging waiting items
    for (const item of agingWaiting.slice(0, 2)) {
      if (focusItems.length < 5) {
        focusItems.push({ ...item, type: 'waiting', reason: 'needs-followup' });
      }
    }

    // Generate greeting based on time of day
    const hour = new Date().getHours();
    let greeting = 'Good morning';
    if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
    else if (hour >= 17) greeting = 'Good evening';

    return {
      greeting,
      overdue,
      dueToday,
      agingWaiting,
      focusItems,
      inboxCount: inbox.length,
      totalActions: activeActions.length,
      totalWaiting: activeWaiting.length,
      followUpsNeeded: activeWaiting.filter(w => (w.followUpCount || 0) >= 2).length
    };
  }

  async getWaitingForGroupedByPerson() {
    const items = await this.getWaitingFor();
    const grouped = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const item of items) {
      const person = item.delegatedTo || 'Unknown';
      if (!grouped[person]) {
        grouped[person] = { items: [], overdue: 0, personName: person };
      }

      // Calculate if overdue (more than 7 days old)
      let isOverdue = false;
      if (item.delegatedDate) {
        const delegatedDate = new Date(item.delegatedDate);
        const daysSince = Math.floor((today - delegatedDate) / (1000 * 60 * 60 * 24));
        isOverdue = daysSince > 7;
        item.daysSince = daysSince;
        item.isOverdue = isOverdue;
      }

      grouped[person].items.push(item);
      if (isOverdue) grouped[person].overdue++;
    }

    return grouped;
  }

  async getWaitingForByPerson(personName) {
    const items = await this.getWaitingFor();
    return items.filter(item => item.delegatedTo === personName);
  }

  async getActionsByContext(contextId) {
    const actions = await this.getNextActions();
    return actions.filter(a =>
      a.contexts && a.contexts.includes(contextId)
    );
  }

  async addFollowUp(waitingId, method) {
    const item = await this.get('waitingFor', waitingId);
    if (item) {
      await this.update('waitingFor', waitingId, {
        followUpCount: (item.followUpCount || 0) + 1,
        lastFollowUp: new Date(),
        lastFollowUpMethod: method
      });
    }
  }

  async delegateAction(actionText, targetPerson, method, originalContent, projectId = null) {
    const waitingItem = {
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

    return this.add('waitingFor', waitingItem);
  }

  async clearAllData() {
    return this.clearAll();
  }

  async exportData() {
    return this.exportAllData();
  }

  async importData(data) {
    // Import all data
    if (data.inbox) {
      for (const item of data.inbox) {
        await this.add('inbox', item);
      }
    }
    if (data.nextActions) {
      for (const item of data.nextActions) {
        await this.add('nextActions', item);
      }
    }
    if (data.waitingFor) {
      for (const item of data.waitingFor) {
        await this.add('waitingFor', item);
      }
    }
    if (data.projects) {
      for (const item of data.projects) {
        await this.add('projects', item);
      }
    }
    if (data.reference) {
      for (const item of data.reference) {
        await this.add('reference', item);
      }
    }
    if (data.somedayMaybe) {
      for (const item of data.somedayMaybe) {
        await this.add('somedayMaybe', item);
      }
    }
    if (data.teamMembers) {
      for (const item of data.teamMembers) {
        await this.add('teamMembers', item);
      }
    }
    if (data.contacts) {
      for (const item of data.contacts) {
        await this.add('contacts', item);
      }
    }
  }

  async mergeImportData(data) {
    // Same as importData for now - could add deduplication later
    return this.importData(data);
  }

  async createReferenceFolder(folderData) {
    return this.createFolder(folderData.name, folderData.category, folderData.icon);
  }

  async addProject(projectData) {
    return this.createProject(
      projectData.name,
      projectData.description,
      projectData.category,
      projectData
    );
  }

  async getProjectWithActions(projectId) {
    const project = await this.getProject(projectId);
    if (!project) return null;

    const actions = await this.getProjectActions(projectId);
    return { ...project, actions };
  }

  async saveOnboardingTeamMembers(members) {
    for (const member of members) {
      await this.addTeamMember(member);
    }
  }

  async saveOnboardingContexts(contexts) {
    await this.setSetting('enabledContexts', contexts);
  }

  async resetOnboarding() {
    await this.setSetting('onboardingComplete', false);
  }

  async getEnabledContexts() {
    return await this.getSetting('enabledContexts') || ['@phone', '@email', '@computer', '@office', '@errands', '@waiting'];
  }

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

  async createProjectFromTemplate(templateId, projectName, startDate = null) {
    const template = await this.getTemplate(templateId);
    if (!template) throw new Error('Template not found');

    const project = await this.createProject(
      projectName,
      template.description,
      template.category,
      { template: templateId, actionMode: template.actionMode || 'parallel' }
    );

    // Create actions from template (support both 'actions' and 'steps' field names)
    const templateActions = template.actions || template.steps || [];
    const isSequential = template.actionMode === 'sequential' || template.isSequential;
    let lastActionId = null;

    for (let i = 0; i < templateActions.length; i++) {
      const actionTemplate = templateActions[i];
      const action = await this.createAction({
        action: actionTemplate.action,
        contexts: actionTemplate.contexts || [actionTemplate.context || '@anywhere'],
        projectId: project.id,
        sequenceOrder: i + 1,
        isSequential: isSequential,
        dependsOn: isSequential ? lastActionId : null
      });
      lastActionId = action;
    }

    // Increment template usage count
    await this.incrementTemplateUsage(templateId);

    return project;
  }

  // =====================
  // TEAM Operations
  // =====================

  async createTeam(name) {
    if (!this.userId) throw new Error('User not authenticated');

    const teamRef = this.db.collection('teams').doc();
    const teamId = teamRef.id;
    const now = new Date().toISOString();

    const teamData = {
      name: name.trim(),
      ownerId: this.userId,
      createdAt: now,
      memberCount: 1
    };

    // Create team document
    await teamRef.set(teamData);

    // Add owner as member
    await teamRef.collection('members').doc(this.userId).set({
      role: 'owner',
      joinedAt: now,
      displayName: firebaseAuth.currentUser?.displayName || 'Unknown',
      email: firebaseAuth.currentUser?.email || ''
    });

    // Add team reference to user
    await this.db.collection('users').doc(this.userId).collection('teams').doc(teamId).set({
      role: 'owner',
      joinedAt: now,
      teamName: name.trim()
    });

    return { id: teamId, ...teamData };
  }

  async getMyTeams() {
    if (!this.userId) throw new Error('User not authenticated');

    const snapshot = await this.db.collection('users').doc(this.userId).collection('teams').get();
    const teams = [];

    for (const doc of snapshot.docs) {
      const teamRef = await this.db.collection('teams').doc(doc.id).get();
      if (teamRef.exists) {
        teams.push({ id: doc.id, ...teamRef.data(), role: doc.data().role });
      }
    }

    return teams;
  }

  async getTeam(teamId) {
    const doc = await this.db.collection('teams').doc(teamId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  }

  async getCloudTeamMembers(teamId) {
    const snapshot = await this.db.collection('teams').doc(teamId).collection('members').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async generateInviteLink(teamId) {
    if (!this.userId) throw new Error('User not authenticated');

    // Verify user is owner or can invite
    const memberDoc = await this.db.collection('teams').doc(teamId).collection('members').doc(this.userId).get();
    if (!memberDoc.exists || memberDoc.data().role !== 'owner') {
      throw new Error('Only team owners can generate invite links');
    }

    // Generate invite token
    const token = this.generateId() + this.generateId();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

    // Store invite with team reference
    await this.db.collection('teams').doc(teamId).collection('invites').doc(token).set({
      createdBy: this.userId,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      used: false,
      teamId: teamId // Store teamId for reference
    });

    // Return combined token with teamId for URL construction
    // Format: teamId:token (will be encoded in URL)
    return `${teamId}:${token}`;
  }

  async getPendingInvites(teamId) {
    const snapshot = await this.db.collection('teams').doc(teamId).collection('invites')
      .where('used', '==', false)
      .get();
    return snapshot.docs.map(doc => ({ token: `${teamId}:${doc.id}`, ...doc.data() }));
  }

  async acceptInvite(inviteCode) {
    if (!this.userId) throw new Error('User not authenticated');

    // Parse the invite code (format: teamId:token)
    let teamId, token;
    if (inviteCode.includes(':')) {
      [teamId, token] = inviteCode.split(':');
    } else {
      // Legacy format - try to find the invite across teams (less secure, for backwards compatibility)
      throw new Error('Invalid invite link format. Please request a new invite link.');
    }

    if (!teamId || !token) {
      throw new Error('Invalid invite link');
    }

    // Get the specific invite directly (no iteration needed)
    const inviteRef = this.db.collection('teams').doc(teamId).collection('invites').doc(token);
    const inviteDoc = await inviteRef.get();

    if (!inviteDoc.exists) {
      throw new Error('Invalid or expired invite');
    }

    const invite = inviteDoc.data();

    if (invite.used) {
      throw new Error('This invite has already been used');
    }

    // Check if expired
    if (new Date(invite.expiresAt) < new Date()) {
      throw new Error('Invite has expired');
    }

    // Check if user is already a member
    const existingMember = await this.db.collection('teams').doc(teamId).collection('members').doc(this.userId).get();
    if (existingMember.exists) {
      throw new Error('You are already a member of this team');
    }

    const now = new Date().toISOString();

    // Add user as member (security rules allow self-creation with role='member')
    await this.db.collection('teams').doc(teamId).collection('members').doc(this.userId).set({
      role: 'member',
      joinedAt: now,
      displayName: firebaseAuth.currentUser?.displayName || 'Unknown',
      email: firebaseAuth.currentUser?.email || ''
    });

    // Get team info for return value and user's team reference
    const teamDoc = await this.db.collection('teams').doc(teamId).get();
    const team = teamDoc.exists ? teamDoc.data() : { name: 'Unknown Team' };

    // Add team reference to user's collection
    await this.db.collection('users').doc(this.userId).collection('teams').doc(teamId).set({
      role: 'member',
      joinedAt: now,
      teamName: team.name
    });

    // Note: Invite marking as 'used' and member count update require owner permissions
    // These will be handled by the team owner or left for cleanup
    // For now, we successfully joined the team

    return { id: teamId, ...team };
  }

  async leaveTeam(teamId) {
    if (!this.userId) throw new Error('User not authenticated');

    const memberDoc = await this.db.collection('teams').doc(teamId).collection('members').doc(this.userId).get();
    if (!memberDoc.exists) {
      throw new Error('Not a member of this team');
    }

    if (memberDoc.data().role === 'owner') {
      throw new Error('Team owners cannot leave. Transfer ownership or delete the team.');
    }

    // Remove from team members
    await this.db.collection('teams').doc(teamId).collection('members').doc(this.userId).delete();

    // Remove team reference from user
    await this.db.collection('users').doc(this.userId).collection('teams').doc(teamId).delete();

    // Update member count
    await this.db.collection('teams').doc(teamId).update({
      memberCount: firebase.firestore.FieldValue.increment(-1)
    });
  }

  async deleteTeam(teamId) {
    if (!this.userId) throw new Error('User not authenticated');

    const teamDoc = await this.db.collection('teams').doc(teamId).get();
    if (!teamDoc.exists) {
      throw new Error('Team not found');
    }

    if (teamDoc.data().ownerId !== this.userId) {
      throw new Error('Only team owners can delete the team');
    }

    // Get all members to remove team references
    const members = await this.db.collection('teams').doc(teamId).collection('members').get();

    // Remove team reference from all members
    const batch = this.db.batch();
    for (const member of members.docs) {
      batch.delete(this.db.collection('users').doc(member.id).collection('teams').doc(teamId));
      batch.delete(member.ref);
    }

    // Delete invites
    const invites = await this.db.collection('teams').doc(teamId).collection('invites').get();
    for (const invite of invites.docs) {
      batch.delete(invite.ref);
    }

    // Delete team
    batch.delete(teamDoc.ref);

    await batch.commit();
  }

  // =====================
  // TEAM DELEGATION Operations
  // =====================

  async delegateToTeamMember(actionId, delegateeId, teamId) {
    if (!this.userId) throw new Error('User not authenticated');

    const now = new Date().toISOString();

    // Get the action from nextActions collection (not 'actions')
    const action = await this.get('nextActions', actionId);
    if (!action) throw new Error('Action not found');

    // Create delegation record in team
    await this.db.collection('teams').doc(teamId).collection('delegations').add({
      actionId,
      delegatorId: this.userId,
      delegateeId,
      actionContent: action.action,
      contexts: action.contexts || [],
      projectId: action.projectId || null,
      delegatedAt: now,
      status: 'pending'
    });

    // Update action with delegation info in nextActions collection
    await this.update('nextActions', actionId, {
      delegatedTo: delegateeId,
      delegatedToTeam: teamId,
      delegatedAt: now
    });

    // Log activity
    await this.logTeamActivity(teamId, 'delegation', {
      actionId,
      delegatorId: this.userId,
      delegateeId,
      actionContent: action.action
    });
  }

  async getAssignedToMe(teamId) {
    if (!this.userId) throw new Error('User not authenticated');

    const snapshot = await this.db.collection('teams').doc(teamId).collection('delegations')
      .where('delegateeId', '==', this.userId)
      .where('status', '==', 'pending')
      .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async getMyDelegations(teamId) {
    if (!this.userId) throw new Error('User not authenticated');

    const snapshot = await this.db.collection('teams').doc(teamId).collection('delegations')
      .where('delegatorId', '==', this.userId)
      .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async completeDelegation(delegationId, teamId) {
    if (!this.userId) throw new Error('User not authenticated');

    const delegationRef = this.db.collection('teams').doc(teamId).collection('delegations').doc(delegationId);
    const delegation = await delegationRef.get();

    if (!delegation.exists) throw new Error('Delegation not found');
    if (delegation.data().delegateeId !== this.userId) {
      throw new Error('Only the assignee can complete this delegation');
    }

    await delegationRef.update({
      status: 'completed',
      completedAt: new Date().toISOString()
    });

    // Log activity
    await this.logTeamActivity(teamId, 'completion', {
      delegationId,
      actionContent: delegation.data().actionContent,
      completedBy: this.userId
    });
  }

  // =====================
  // TEAM ACTIVITY Operations
  // =====================

  async logTeamActivity(teamId, type, data) {
    await this.db.collection('teams').doc(teamId).collection('activity').add({
      type,
      data,
      userId: this.userId,
      userName: firebaseAuth.currentUser?.displayName || 'Unknown',
      timestamp: new Date().toISOString()
    });
  }

  async getTeamActivity(teamId, limit = 50) {
    const snapshot = await this.db.collection('teams').doc(teamId).collection('activity')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  subscribeToTeamActivity(teamId, callback) {
    const unsubscribe = this.db.collection('teams').doc(teamId).collection('activity')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .onSnapshot(snapshot => {
        const activities = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(activities);
      });

    this.unsubscribers.push(unsubscribe);
    return unsubscribe;
  }

  subscribeToAssignedToMe(teamId, callback) {
    const unsubscribe = this.db.collection('teams').doc(teamId).collection('delegations')
      .where('delegateeId', '==', this.userId)
      .where('status', '==', 'pending')
      .onSnapshot(snapshot => {
        const delegations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(delegations);
      });

    this.unsubscribers.push(unsubscribe);
    return unsubscribe;
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
      name: name.trim(),
      color,
      icon,
      createdAt: new Date().toISOString(),
      sortOrder: Date.now()
    };

    return await this.add('areas', area);
  }

  async getAreas() {
    return await this.getAll('areas', 'sortOrder', 'asc');
  }

  async getArea(id) {
    return await this.get('areas', id);
  }

  async updateArea(id, updates) {
    await this.update('areas', id, updates);
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

    await this.delete('areas', id);
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

  // =====================
  // Team Dashboard Helper Methods
  // =====================

  getCurrentUserId() {
    return this.userId;
  }

  async getDelegations(teamId) {
    if (!teamId) {
      // If no teamId, try to get from first team
      const teams = await this.getMyTeams();
      if (teams.length === 0) return [];
      teamId = teams[0].id;
    }

    const snapshot = await this.db.collection('teams').doc(teamId).collection('delegations').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async getSharedProjects(teamId) {
    if (!teamId) {
      const teams = await this.getMyTeams();
      if (teams.length === 0) return [];
      teamId = teams[0].id;
    }

    const snapshot = await this.db.collection('teams').doc(teamId).collection('sharedProjects')
      .orderBy('createdAt', 'desc')
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async createSharedProject(teamId, projectData) {
    const data = {
      ...projectData,
      ownerId: this.userId,
      teamId: teamId,
      status: 'active',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      memberIds: projectData.memberIds || [this.userId]
    };

    const docRef = await this.db.collection('teams').doc(teamId).collection('sharedProjects').add(data);

    await this.logTeamActivity(teamId, 'created', {
      targetType: 'project',
      description: projectData.name,
      projectId: docRef.id
    });

    return docRef.id;
  }

  async updateSharedProject(teamId, projectId, updates) {
    await this.db.collection('teams').doc(teamId).collection('sharedProjects').doc(projectId).update({
      ...updates,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  async getSharedProject(teamId, projectId) {
    const doc = await this.db.collection('teams').doc(teamId).collection('sharedProjects').doc(projectId).get();
    if (doc.exists) {
      return { id: doc.id, ...doc.data() };
    }
    return null;
  }

  // Comments on team items
  async addComment(teamId, itemType, itemId, content) {
    const comment = {
      userId: this.userId,
      content: content.trim(),
      itemType, // 'delegation', 'project', 'action'
      itemId,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await this.db.collection('teams').doc(teamId).collection('comments').add(comment);

    await this.logTeamActivity(teamId, 'commented', {
      targetType: itemType,
      description: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
      itemId
    });

    return docRef.id;
  }

  async getComments(teamId, itemType, itemId) {
    const snapshot = await this.db.collection('teams').doc(teamId).collection('comments')
      .where('itemType', '==', itemType)
      .where('itemId', '==', itemId)
      .orderBy('createdAt', 'asc')
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async deleteComment(teamId, commentId) {
    await this.db.collection('teams').doc(teamId).collection('comments').doc(commentId).delete();
  }

  // Update delegation status
  async updateDelegation(teamId, delegationId, updates) {
    await this.db.collection('teams').doc(teamId).collection('delegations').doc(delegationId).update({
      ...updates,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  // Subscribe to delegations (real-time updates)
  subscribeToDelegations(teamId, callback) {
    const unsubscribe = this.db.collection('teams').doc(teamId).collection('delegations')
      .onSnapshot(snapshot => {
        const delegations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(delegations);
      });

    this.unsubscribers.push(unsubscribe);
    return unsubscribe;
  }

  // Subscribe to shared projects (real-time updates)
  subscribeToSharedProjects(teamId, callback) {
    const unsubscribe = this.db.collection('teams').doc(teamId).collection('sharedProjects')
      .orderBy('createdAt', 'desc')
      .onSnapshot(snapshot => {
        const projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(projects);
      });

    this.unsubscribers.push(unsubscribe);
    return unsubscribe;
  }

  // =====================
  // Admin Operations
  // =====================

  async checkIsAdmin() {
    if (!this.userId) return false;
    const email = firebaseAuth.currentUser?.email;
    if (!email) return false;
    try {
      const doc = await this.db.collection('admins').doc(email).get();
      return doc.exists;
    } catch (e) {
      console.log('Admin check failed:', e);
      return false;
    }
  }

  async ensureUserProfile() {
    if (!this.userId) return;
    const user = firebaseAuth.currentUser;
    if (!user) return;
    try {
      const doc = await this.db.collection('userProfiles').doc(this.userId).get();
      if (!doc.exists) {
        await this.db.collection('userProfiles').doc(this.userId).set({
          displayName: user.displayName || 'Unknown',
          email: user.email || '',
          photoURL: user.photoURL || '',
          lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      } else {
        await this.db.collection('userProfiles').doc(this.userId).set({
          displayName: user.displayName || 'Unknown',
          email: user.email || '',
          photoURL: user.photoURL || '',
          lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
    } catch (e) {
      console.log('User profile update failed:', e);
    }
  }

  async getAllUserProfiles() {
    const snapshot = await this.db.collection('userProfiles').get();
    const profiles = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
    // Sort by lastLoginAt if available, profiles without it go to the end
    profiles.sort((a, b) => {
      if (!a.lastLoginAt) return 1;
      if (!b.lastLoginAt) return -1;
      return b.lastLoginAt.localeCompare(a.lastLoginAt);
    });
    return profiles;
  }

  async getOtherUserCollection(userId, collectionName, orderBy = '_created', orderDir = 'desc') {
    const snapshot = await this.db.collection('users').doc(userId)
      .collection(collectionName)
      .orderBy(orderBy, orderDir)
      .limit(100)
      .get();
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        _created: data._created?.toDate?.() || new Date()
      };
    });
  }

  async getOtherUserStats(userId, days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    try {
      const snapshot = await this.db.collection('users').doc(userId)
        .collection('stats')
        .where('date', '>=', cutoffStr)
        .orderBy('date', 'desc')
        .get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
      console.log('Stats fetch failed:', e);
      return [];
    }
  }
}

// Create global instance
const firestoreDb = new FirestoreDB();
