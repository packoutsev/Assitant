// app.js - Main application logic for GTD Capture System
// Version: 1.0.0

const APP_VERSION = '1.0.0';
const APP_BUILD_DATE = '2026-01-18';

class GTDApp {
  constructor() {
    this.currentView = 'inbox';
    this.processingItem = null;
    this.processingStep = 1;
    this.selectedContexts = [];
    this.selectedTags = [];
    this.selectedPriority = 'medium'; // 'high', 'medium', 'low'
    this.selectedDueDate = null; // ISO date string or null
    this.selectedLocation = null; // { name, lat?, lng?, category? } or null
    this.selectedProjectId = null; // Project ID to link action to
    this.referenceTags = [];
    this.activeFilter = 'all';
    this.waitingFilter = 'all';
    this.projectFilter = 'active';
    this.archiveFilter = 'all';
    this.searchQuery = '';
    this.archiveSearchQuery = '';
    this.globalSearchQuery = '';
    this.globalSearchResults = null;
    this.searchDebounceTimer = null;
    this.previousView = null; // To return to after clearing search
    this.currentFolder = 'all'; // 'all', 'unfiled', or folder id
    this.selectedReferenceFolder = null; // folder id for new reference items
    this.inboxSort = localStorage.getItem('inboxSort') || 'newest'; // 'newest', 'oldest', 'type'

    // Delegation state
    this.delegateTo = null; // 'me' or person object
    this.delegationMethod = null; // 'email', 'text', 'verbal'
    this.actionText = '';
    this.actionSuggestions = [];
    this.tagSuggestions = [];

    // Sample data for first run
    this.sampleItems = [
      {
        content: "Need to get estimate done for the Scottsdale water damage project - Diana mentioned timeline concerns",
        type: "text"
      },
      {
        content: "Call USAA adjuster about the Qaqish claim approval - been waiting 5 days",
        type: "voice"
      },
      {
        content: "Have Ivan schedule crew for next week's jobs and process the Travelers invoice #12345",
        type: "text"
      }
    ];

    this.contexts = ['@phone', '@email', '@computer', '@office', '@errands', '@waiting'];

    // Settings with defaults
    this.settings = {
      defaultActionMode: 'parallel',
      showOnDeck: true,
      enableStepSuggestions: true,
      maxFileSize: 50,
      showFilePreviews: true,
      enableNLP: true
    };

    // Firebase auth state
    this.currentUser = null;
    this.isCloudMode = false;
    this.originalDbMethods = null; // Store original db methods for restore
    this.cloudDbInitialized = false;
    this.realtimeUnsubscribers = []; // Track real-time listeners
  }

  // =====================
  // Authentication Methods
  // =====================

  initFirebaseAuth() {
    if (typeof firebaseAuth === 'undefined') {
      console.log('Firebase not loaded, running in local mode');
      return;
    }

    firebaseAuth.onAuthStateChanged(async (user) => {
      if (user) {
        this.currentUser = user;

        // Show loading screen while data loads
        this.showLoadingScreen();
        this.hideAuthScreen();

        console.log('User signed in:', user.email);

        try {
          // Switch to cloud database
          await this.switchToCloudDb(user.uid);

          // Load user's team
          await this.loadUserTeam();

          // Check for local data to migrate
          await this.checkForDataMigration();

          // Force refresh from server to ensure fresh data (bypasses Firestore cache)
          this.forceServerRefresh = true;

          // Re-render with cloud data
          await this.updateCounts();
          await this.renderCurrentView();

          // Reset flag after initial render
          this.forceServerRefresh = false;

          // Setup real-time listeners
          this.setupRealtimeListeners();

          // Check for pending invite token
          if (this.pendingInviteToken) {
            this.processInviteToken(this.pendingInviteToken);
          }

          // Show main app and hide loading screen
          this.showMainApp();
          this.updateUserMenu(user);
          this.hideLoadingScreen();

        } catch (error) {
          console.error('Error loading app data:', error);
          this.showMainApp();
          this.updateUserMenu(user);
          this.hideLoadingScreen();
          this.showToast('Error loading data. Please refresh.', 'error');
        }

      } else {
        this.currentUser = null;

        // Clean up real-time listeners
        this.cleanupRealtimeListeners();

        // Switch back to local database
        this.switchToLocalDb();

        this.hideMainApp();
        this.hideLoadingScreen();
        this.showAuthScreen();
        console.log('User signed out');
      }
    });
  }

  async switchToCloudDb(userId) {
    if (this.cloudDbInitialized) return;

    try {
      // Store original db methods for potential restore
      if (!this.originalDbMethods) {
        this.originalDbMethods = {};
        // Get all methods from db (including prototype methods)
        const dbProto = Object.getPrototypeOf(db);
        const dbMethods = Object.getOwnPropertyNames(dbProto);
        for (const key of dbMethods) {
          if (key !== 'constructor' && typeof db[key] === 'function') {
            this.originalDbMethods[key] = db[key].bind(db);
          }
        }
      }

      // Initialize Firestore DB
      await firestoreDb.init();
      firestoreDb.userId = userId;

      // Copy all Firestore methods to db object (including prototype methods)
      const firestoreProto = Object.getPrototypeOf(firestoreDb);
      const firestoreMethods = Object.getOwnPropertyNames(firestoreProto);
      for (const key of firestoreMethods) {
        if (key !== 'constructor' && typeof firestoreDb[key] === 'function') {
          db[key] = firestoreDb[key].bind(firestoreDb);
        }
      }

      this.isCloudMode = true;
      this.cloudDbInitialized = true;
      console.log('Switched to cloud database');

      // Initialize default reference folders if needed
      await db.initializeReferenceFolders();

    } catch (error) {
      console.error('Failed to switch to cloud database:', error);
      this.showToast('Failed to connect to cloud. Using local storage.', 'error');
    }
  }

  switchToLocalDb() {
    if (!this.originalDbMethods) return;

    // Restore original db methods
    for (const key in this.originalDbMethods) {
      db[key] = this.originalDbMethods[key];
    }

    this.isCloudMode = false;
    this.cloudDbInitialized = false;
    console.log('Switched to local database');
  }

  async checkForDataMigration() {
    try {
      // Check if there's local IndexedDB data
      const localDb = new GTDDatabase();
      await localDb.init();

      const hasLocalData = await this.hasLocalData(localDb);

      if (hasLocalData) {
        // Check if user already migrated
        const migrated = localStorage.getItem('gtd-data-migrated-' + this.currentUser.uid);
        if (!migrated) {
          this.showMigrationDialog();
        }
      }
    } catch (error) {
      console.log('No local data to migrate or migration check failed:', error);
    }
  }

  async hasLocalData(localDb) {
    try {
      const inbox = await localDb.getAll('inbox');
      const actions = await localDb.getAll('nextActions');
      const waiting = await localDb.getAll('waitingFor');
      const projects = await localDb.getAll('projects');
      return inbox.length > 0 || actions.length > 0 || waiting.length > 0 || projects.length > 0;
    } catch {
      return false;
    }
  }

  showMigrationDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'modal-overlay active';
    dialog.id = 'migrationDialog';
    dialog.innerHTML = `
      <div class="modal migration-modal">
        <div class="modal-header">
          <h2>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Migrate Local Data
          </h2>
        </div>
        <div class="modal-body">
          <p>We found data stored locally on this device. Would you like to migrate it to the cloud?</p>
          <p class="migration-note">Your local data will be preserved. You can always migrate later from Settings.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="app.dismissMigration()">Later</button>
          <button class="btn btn-primary" onclick="app.performMigration()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Migrate Now
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);
  }

  dismissMigration() {
    // Mark as dismissed so we don't ask again
    if (this.currentUser) {
      localStorage.setItem('gtd-data-migrated-' + this.currentUser.uid, 'skipped');
    }
    const dialog = document.getElementById('migrationDialog');
    if (dialog) dialog.remove();
  }

  async performMigration() {
    const dialog = document.getElementById('migrationDialog');
    const modalBody = dialog?.querySelector('.modal-body');
    const modalFooter = dialog?.querySelector('.modal-footer');

    if (modalBody) {
      modalBody.innerHTML = `
        <div class="migration-progress">
          <div class="spinner"></div>
          <p>Migrating your data to the cloud...</p>
          <p class="migration-status" id="migrationStatus">Starting...</p>
        </div>
      `;
    }
    if (modalFooter) {
      modalFooter.style.display = 'none';
    }

    try {
      // Create fresh local db connection
      const localDb = new GTDDatabase();
      await localDb.init();

      const updateStatus = (status) => {
        const el = document.getElementById('migrationStatus');
        if (el) el.textContent = status;
      };

      // Migrate inbox
      updateStatus('Migrating inbox items...');
      const inbox = await localDb.getAll('inbox');
      for (const item of inbox) {
        await firestoreDb.addToInbox(item.content, item.type, { attachment: item.attachment });
      }

      // Migrate next actions
      updateStatus('Migrating actions...');
      const actions = await localDb.getAll('nextActions');
      for (const item of actions) {
        await firestoreDb.add('nextActions', item);
      }

      // Migrate waiting for
      updateStatus('Migrating waiting for items...');
      const waiting = await localDb.getAll('waitingFor');
      for (const item of waiting) {
        await firestoreDb.add('waitingFor', item);
      }

      // Migrate projects
      updateStatus('Migrating projects...');
      const projects = await localDb.getAll('projects');
      for (const item of projects) {
        await firestoreDb.add('projects', item);
      }

      // Migrate reference
      updateStatus('Migrating reference items...');
      const reference = await localDb.getAll('reference');
      for (const item of reference) {
        await firestoreDb.add('reference', item);
      }

      // Migrate someday/maybe
      updateStatus('Migrating someday/maybe items...');
      const someday = await localDb.getAll('somedayMaybe');
      for (const item of someday) {
        await firestoreDb.add('somedayMaybe', item);
      }

      // Migrate folders
      updateStatus('Migrating folders...');
      const folders = await localDb.getAll('folders');
      for (const item of folders) {
        await firestoreDb.add('folders', item);
      }

      // Migrate team members
      updateStatus('Migrating team members...');
      const team = await localDb.getAll('teamMembers');
      for (const item of team) {
        await firestoreDb.add('teamMembers', item);
      }

      // Migrate contacts
      updateStatus('Migrating contacts...');
      const contacts = await localDb.getAll('contacts');
      for (const item of contacts) {
        await firestoreDb.add('contacts', item);
      }

      // Migrate templates
      updateStatus('Migrating templates...');
      const templates = await localDb.getAll('templates');
      for (const item of templates) {
        await firestoreDb.add('templates', item);
      }

      // Mark migration complete
      localStorage.setItem('gtd-data-migrated-' + this.currentUser.uid, 'true');

      updateStatus('Migration complete!');

      if (modalBody) {
        modalBody.innerHTML = `
          <div class="migration-success">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48" class="success-icon">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <h3>Migration Complete!</h3>
            <p>All your data has been synced to the cloud.</p>
          </div>
        `;
      }
      if (modalFooter) {
        modalFooter.style.display = 'flex';
        modalFooter.innerHTML = `
          <button class="btn btn-primary" onclick="app.dismissMigration(); app.updateCounts(); app.renderCurrentView();">Done</button>
        `;
      }

    } catch (error) {
      console.error('Migration failed:', error);
      if (modalBody) {
        modalBody.innerHTML = `
          <div class="migration-error">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48" class="error-icon">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            <h3>Migration Failed</h3>
            <p>Error: ${error.message}</p>
            <p>Your local data is still intact. You can try again from Settings.</p>
          </div>
        `;
      }
      if (modalFooter) {
        modalFooter.style.display = 'flex';
        modalFooter.innerHTML = `
          <button class="btn btn-secondary" onclick="app.dismissMigration()">Close</button>
          <button class="btn btn-primary" onclick="app.performMigration()">Retry</button>
        `;
      }
    }
  }

  setupRealtimeListeners() {
    // Set up real-time listeners for key collections
    this.realtimeUnsubscribers = [];

    // Inbox listener
    const inboxUnsub = firestoreDb.subscribeToInbox?.((items) => {
      if (this.currentView === 'inbox') {
        this.renderInboxView();
      }
      this.updateCounts();
    });
    if (inboxUnsub) this.realtimeUnsubscribers.push(inboxUnsub);

    // Actions listener
    const actionsUnsub = firestoreDb.subscribeToActions?.((items) => {
      if (this.currentView === 'next') {
        this.renderNextActionsView();
      }
      this.updateCounts();
    });
    if (actionsUnsub) this.realtimeUnsubscribers.push(actionsUnsub);

    // Waiting for listener
    const waitingUnsub = firestoreDb.subscribeToWaitingFor?.((items) => {
      if (this.currentView === 'waiting') {
        this.renderWaitingForView();
      }
      this.updateCounts();
    });
    if (waitingUnsub) this.realtimeUnsubscribers.push(waitingUnsub);

    // Projects listener
    const projectsUnsub = firestoreDb.subscribeToProjects?.((items) => {
      if (this.currentView === 'projects') {
        this.renderProjectsView();
      }
      this.updateCounts();
    });
    if (projectsUnsub) this.realtimeUnsubscribers.push(projectsUnsub);

    // Team assignments listener (if in a team)
    this.setupTeamRealtimeListeners();
  }

  async setupTeamRealtimeListeners() {
    // Clean up existing team listeners
    if (this.teamUnsubscribers) {
      for (const unsub of this.teamUnsubscribers) {
        if (typeof unsub === 'function') unsub();
      }
    }
    this.teamUnsubscribers = [];

    // Get current team
    if (!this.isCloudMode || !this.currentTeam) return;

    // Subscribe to assignments
    const assignedUnsub = firestoreDb.subscribeToAssignedToMe?.(this.currentTeam.id, (assignments) => {
      if (this.currentView === 'assignedToMe') {
        this.renderAssignedToMeView();
      }
      this.updateCounts();
    });
    if (assignedUnsub) this.teamUnsubscribers.push(assignedUnsub);

    // Subscribe to team activity
    const activityUnsub = firestoreDb.subscribeToTeamActivity?.(this.currentTeam.id, (activities) => {
      // Update activity feed if visible
      if (document.getElementById('teamActivityFeed')) {
        this.renderTeamActivityFeed(activities);
      }
    });
    if (activityUnsub) this.teamUnsubscribers.push(activityUnsub);
  }

  cleanupRealtimeListeners() {
    for (const unsub of this.realtimeUnsubscribers) {
      if (typeof unsub === 'function') {
        unsub();
      }
    }
    this.realtimeUnsubscribers = [];
  }

  updateUserMenu(user) {
    const displayName = user.displayName || user.email?.split('@')[0] || 'User';
    const email = user.email || '';
    const initials = this.getInitials(displayName);
    const photoURL = user.photoURL;

    // Ensure menu is closed
    const dropdown = document.getElementById('userMenuDropdown');
    if (dropdown) dropdown.classList.remove('active');

    // Update display name
    const nameEl = document.getElementById('userDisplayName');
    if (nameEl) nameEl.textContent = displayName;

    // Update email
    const emailEl = document.getElementById('userEmail');
    if (emailEl) emailEl.textContent = email;

    // Update avatar
    const avatarEl = document.getElementById('userAvatar');
    const initialsEl = document.getElementById('userInitials');

    if (avatarEl && photoURL) {
      avatarEl.innerHTML = `<img src="${photoURL}" alt="${displayName}" />`;
    } else if (initialsEl) {
      initialsEl.textContent = initials;
    }
  }

  getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  toggleUserMenu() {
    const dropdown = document.getElementById('userMenuDropdown');
    if (dropdown) {
      dropdown.classList.toggle('active');
    }
  }

  closeUserMenu() {
    const dropdown = document.getElementById('userMenuDropdown');
    if (dropdown) {
      dropdown.classList.remove('active');
    }
  }

  showAuthScreen() {
    const authScreen = document.getElementById('authScreen');
    const mainApp = document.getElementById('mainApp');
    if (authScreen) authScreen.style.display = 'flex';
    if (mainApp) mainApp.style.display = 'none';
  }

  hideAuthScreen() {
    const authScreen = document.getElementById('authScreen');
    if (authScreen) authScreen.style.display = 'none';
  }

  showMainApp() {
    const mainApp = document.getElementById('mainApp');
    if (mainApp) mainApp.style.display = 'flex';
  }

  hideMainApp() {
    const mainApp = document.getElementById('mainApp');
    if (mainApp) mainApp.style.display = 'none';
  }

  showLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
      loadingScreen.classList.remove('hidden');
    }
  }

  hideLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
      // Small delay for smooth transition
      setTimeout(() => {
        loadingScreen.classList.add('hidden');
      }, 500);
    }
  }

  showLogin() {
    document.getElementById('loginForm').style.display = 'flex';
    document.getElementById('signUpForm').style.display = 'none';
    document.getElementById('forgotPasswordForm').style.display = 'none';
    this.hideAuthError();
  }

  showSignUp() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('signUpForm').style.display = 'flex';
    document.getElementById('forgotPasswordForm').style.display = 'none';
    this.hideAuthError();
  }

  showForgotPassword() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('signUpForm').style.display = 'none';
    document.getElementById('forgotPasswordForm').style.display = 'flex';
    this.hideAuthError();
  }

  showAuthError(message) {
    const errorDiv = document.getElementById('authError');
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = 'block';
    }
  }

  hideAuthError() {
    const errorDiv = document.getElementById('authError');
    if (errorDiv) {
      errorDiv.style.display = 'none';
    }
  }

  async signInWithGoogle() {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await firebaseAuth.signInWithPopup(provider);
      // Auth state change will handle the rest
    } catch (error) {
      console.error('Google sign in error:', error);
      this.showAuthError(this.getAuthErrorMessage(error.code));
    }
  }

  async signInWithEmail() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
      this.showAuthError('Please enter email and password');
      return;
    }

    try {
      await firebaseAuth.signInWithEmailAndPassword(email, password);
      // Auth state change will handle the rest
    } catch (error) {
      console.error('Email sign in error:', error);
      this.showAuthError(this.getAuthErrorMessage(error.code));
    }
  }

  async signUpWithEmail() {
    const name = document.getElementById('signUpName').value.trim();
    const email = document.getElementById('signUpEmail').value.trim();
    const password = document.getElementById('signUpPassword').value;
    const confirm = document.getElementById('signUpConfirm').value;

    if (!name || !email || !password) {
      this.showAuthError('Please fill in all fields');
      return;
    }

    if (password !== confirm) {
      this.showAuthError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      this.showAuthError('Password must be at least 6 characters');
      return;
    }

    try {
      const userCredential = await firebaseAuth.createUserWithEmailAndPassword(email, password);

      // Update display name
      await userCredential.user.updateProfile({ displayName: name });

      // Create user profile in Firestore
      await firebaseDB.collection('users').doc(userCredential.user.uid).set({
        name: name,
        email: email,
        created: firebase.firestore.FieldValue.serverTimestamp(),
        settings: this.settings
      });

      // Auth state change will handle the rest
    } catch (error) {
      console.error('Sign up error:', error);
      this.showAuthError(this.getAuthErrorMessage(error.code));
    }
  }

  async resetPassword() {
    const email = document.getElementById('resetEmail').value.trim();

    if (!email) {
      this.showAuthError('Please enter your email');
      return;
    }

    try {
      await firebaseAuth.sendPasswordResetEmail(email);
      this.showToast('Password reset email sent! Check your inbox.', 'success');
      this.showLogin();
    } catch (error) {
      console.error('Password reset error:', error);
      this.showAuthError(this.getAuthErrorMessage(error.code));
    }
  }

  async signOut() {
    try {
      await firebaseAuth.signOut();
      this.showToast('Signed out successfully', 'success');
    } catch (error) {
      console.error('Sign out error:', error);
      this.showToast('Failed to sign out', 'error');
    }
  }

  getAuthErrorMessage(errorCode) {
    const messages = {
      'auth/email-already-in-use': 'This email is already registered. Try signing in instead.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/weak-password': 'Password should be at least 6 characters.',
      'auth/user-not-found': 'No account found with this email.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/invalid-credential': 'Invalid email or password.',
      'auth/too-many-requests': 'Too many attempts. Please try again later.',
      'auth/popup-closed-by-user': 'Sign-in popup was closed.',
      'auth/network-request-failed': 'Network error. Please check your connection.'
    };
    return messages[errorCode] || 'An error occurred. Please try again.';
  }

  async init() {
    try {
      // Initialize Firebase Authentication
      this.initFirebaseAuth();

      // Check IndexedDB support
      if (!db.isSupported) {
        this.showToast('Your browser does not support local storage. Data will not persist.', 'error');
      } else {
        await db.init();

        // Initialize team members
        await db.initializeTeamMembers();

        // Initialize reference folders
        await db.initializeReferenceFolders();

        // Initialize templates
        await db.initializeTemplates();

        // Initialize areas
        await db.initializeAreas();

        // Check for first run and add sample data
        if (await db.isFirstRun()) {
          await this.addSampleData();
          await db.markInitialized();
        }

        // Purge old trash items
        await db.purgeOldTrash();

        // Load user settings
        await this.loadSettings();
      }

      // Initialize speech
      this.initSpeech();

      // Initialize geolocation
      this.initGeo();

      // Initialize theme
      this.initTheme();

      // Bind events
      this.bindEvents();

      // Initialize command palette
      this.initCommandPalette();

      // Initial render
      await this.updateCounts();
      await this.renderCurrentView();

      // Check if onboarding is needed
      if (!(await db.isOnboardingComplete())) {
        this.showSetupWizard();
      }

      // Check for invite token in URL
      this.checkForInviteToken();

    } catch (error) {
      console.error('Failed to initialize app:', error);
      this.showToast('Failed to initialize application', 'error');
    }
  }

  checkForInviteToken() {
    const urlParams = new URLSearchParams(window.location.search);
    const inviteToken = urlParams.get('invite');

    if (inviteToken) {
      // Store the token for after login
      this.pendingInviteToken = inviteToken;

      // Clean up URL
      const url = new URL(window.location);
      url.searchParams.delete('invite');
      window.history.replaceState({}, '', url);

      // If already logged in, process invite immediately
      if (this.isCloudMode && firebaseAuth.currentUser) {
        this.processInviteToken(inviteToken);
      } else {
        // Show message to sign in first
        this.showToast('Please sign in to accept the team invitation', 'info');
      }
    }
  }

  async processInviteToken(token) {
    try {
      const team = await db.acceptInvite(token);
      this.currentTeam = team;
      this.currentTeamRole = 'member';
      this.pendingInviteToken = null;
      this.showToast(`Joined ${team.name}!`, 'success');

      // Navigate to settings to show team
      this.navigateTo('settings');
    } catch (error) {
      console.error('Failed to process invite:', error);
      this.showToast(error.message || 'Failed to join team', 'error');
    }
  }

  async addSampleData() {
    for (const item of this.sampleItems) {
      await db.addToInbox(item.content, item.type);
    }
  }

  initSpeech() {
    const voiceBtn = document.getElementById('voiceBtn');
    const voiceStatus = document.getElementById('voiceStatus');

    if (!speech.isSupported) {
      voiceBtn.disabled = true;
      voiceBtn.title = 'Voice capture not supported in this browser';
      return;
    }

    speech.onStart = () => {
      voiceBtn.classList.add('listening');
      voiceStatus.textContent = 'Listening...';
      voiceStatus.classList.remove('error');
      voiceStatus.style.display = 'block';
    };

    speech.onEnd = () => {
      voiceBtn.classList.remove('listening');
      voiceStatus.style.display = 'none';
    };

    speech.onResult = (transcript) => {
      const captureInput = document.getElementById('captureInput');
      captureInput.value += (captureInput.value ? ' ' : '') + transcript;
      this.autoResizeTextarea(captureInput);
    };

    speech.onInterimResult = (transcript) => {
      voiceStatus.textContent = `Listening: "${transcript}"`;
    };

    speech.onError = (error) => {
      voiceBtn.classList.remove('listening');
      voiceStatus.textContent = speech.getErrorMessage(error);
      voiceStatus.classList.add('error');
      voiceStatus.style.display = 'block';

      setTimeout(() => {
        voiceStatus.style.display = 'none';
      }, 5000);
    };

    // Auto-submit when voice capture ends naturally (WisperFlow-like behavior)
    speech.onAutoSubmit = async (transcript) => {
      const captureInput = document.getElementById('captureInput');
      if (transcript.trim()) {
        // Set the final transcript in the input
        captureInput.value = transcript.trim();
        this.autoResizeTextarea(captureInput);

        // Auto-submit to inbox
        await this.handleCapture('voice');

        // Show brief success feedback
        voiceStatus.textContent = 'Captured!';
        voiceStatus.classList.remove('error');
        voiceStatus.style.display = 'block';
        setTimeout(() => {
          voiceStatus.style.display = 'none';
        }, 1500);
      }
    };
  }

  initGeo() {
    // Check if geo service is available
    if (typeof geo === 'undefined' || !geo.isSupported) {
      console.log('Geolocation not available');
      return;
    }

    // Set up nearby errand callback
    geo.onNearbyErrand = (location, distance) => {
      this.showNearbyErrandNotification(location, distance);
    };

    // Set up location update callback
    geo.onLocationUpdate = (position) => {
      console.log('Location updated:', position);
    };

    // Start watching position (optional - can be enabled by user)
    // For now, just get position once when user interacts with location features
    console.log('Geolocation service initialized');
  }

  initTheme() {
    // Load saved theme preference
    const savedTheme = localStorage.getItem('gtd_theme') || 'system';
    this.applyTheme(savedTheme);

    // Set up theme change event binding (will be done in bindEvents)
    // Listen for system theme changes
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        const currentTheme = localStorage.getItem('gtd_theme') || 'system';
        if (currentTheme === 'system') {
          this.applyTheme('system');
        }
      });
    }
  }

  applyTheme(theme) {
    const body = document.body;

    // Remove existing theme classes
    body.classList.remove('light-mode', 'dark-mode');

    if (theme === 'light') {
      body.classList.add('light-mode');
    } else if (theme === 'dark') {
      body.classList.add('dark-mode');
    }
    // 'system' = no class, use media query

    // Save preference
    localStorage.setItem('gtd_theme', theme);

    // Update radio buttons if they exist
    const themeRadio = document.querySelector(`input[name="theme"][value="${theme}"]`);
    if (themeRadio) {
      themeRadio.checked = true;
    }
  }

  showNearbyErrandNotification(location, distance) {
    // Check if notification already exists for this location
    const existingNotification = document.querySelector(`.nearby-notification[data-location-id="${location.id}"]`);
    if (existingNotification) return;

    // Check if we've already notified about this location recently (within 30 min)
    const notifiedKey = `notified_${location.id}`;
    const lastNotified = sessionStorage.getItem(notifiedKey);
    if (lastNotified && Date.now() - parseInt(lastNotified) < 30 * 60 * 1000) {
      return;
    }

    const formattedDistance = geo.formatDistance(distance);
    const notification = document.createElement('div');
    notification.className = 'nearby-notification';
    notification.dataset.locationId = location.id;
    notification.innerHTML = `
      <div class="notification-header">
        <span>📍</span>
        <span>You're near ${this.escapeHtml(location.name)}!</span>
      </div>
      <div class="notification-body">
        You're approximately ${formattedDistance} away. You may have errands to complete here.
      </div>
      <div class="notification-actions">
        <button class="view-btn" onclick="app.viewErrandsForLocation('${location.name}')">View Errands</button>
        <button class="dismiss-btn" onclick="app.dismissNearbyNotification(this)">Dismiss</button>
      </div>
    `;

    document.body.appendChild(notification);

    // Mark as notified
    sessionStorage.setItem(notifiedKey, Date.now().toString());

    // Auto-dismiss after 30 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'slideInRight 0.3s ease-out reverse';
        setTimeout(() => notification.remove(), 300);
      }
    }, 30000);
  }

  dismissNearbyNotification(btn) {
    const notification = btn.closest('.nearby-notification');
    if (notification) {
      notification.style.animation = 'slideInRight 0.3s ease-out reverse';
      setTimeout(() => notification.remove(), 300);
    }
  }

  async viewErrandsForLocation(locationName) {
    // Dismiss the notification
    const notification = document.querySelector('.nearby-notification');
    if (notification) {
      notification.remove();
    }

    // Switch to actions view and filter by @errands context
    this.currentView = 'actions';
    this.currentContextFilter = '@errands';
    await this.renderCurrentView();

    // Show toast with location info
    this.showToast(`Showing errands near ${locationName}`, 'info');
  }

  // ============================================
  // GLOBAL SEARCH
  // ============================================

  handleGlobalSearch(query) {
    this.globalSearchQuery = query;

    // Show/hide clear button
    const clearBtn = document.getElementById('clearSearchBtn');
    clearBtn.style.display = query ? 'flex' : 'none';

    // Debounce search
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    if (!query.trim()) {
      this.clearGlobalSearch();
      return;
    }

    this.searchDebounceTimer = setTimeout(async () => {
      await this.performGlobalSearch(query);
    }, 200);
  }

  async performGlobalSearch(query) {
    // Store previous view if not already in search
    if (this.currentView !== 'searchResults') {
      this.previousView = this.currentView;
    }

    // Show search view
    this.currentView = 'searchResults';
    this.updateViewDisplay();

    // Show loading state
    document.getElementById('searchResultsCount').textContent = 'Searching...';
    document.getElementById('searchResults').innerHTML = `
      <div class="search-loading">
        <div class="loading-spinner"></div>
        <span>Searching...</span>
      </div>
    `;

    // Perform search
    const results = await db.searchAll(query);
    this.globalSearchResults = results;

    // Render results
    this.renderSearchResults(results, query);
  }

  renderSearchResults(results, query) {
    const totalCount = db.getTotalSearchResults(results);
    document.getElementById('searchResultsCount').textContent =
      `${totalCount} result${totalCount !== 1 ? 's' : ''} for "${query}"`;

    const container = document.getElementById('searchResults');

    if (totalCount === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <h3>No results found</h3>
          <p>Try a different search term or check your spelling</p>
        </div>
      `;
      return;
    }

    let html = '';

    // Inbox results
    if (results.inbox.length > 0) {
      html += this.renderSearchGroup('Inbox', '📥', results.inbox, query, 'inbox');
    }

    // Actions results
    if (results.actions.length > 0) {
      html += this.renderSearchGroup('Next Actions', '✓', results.actions, query, 'action');
    }

    // Waiting results
    if (results.waiting.length > 0) {
      html += this.renderSearchGroup('Waiting For', '⏳', results.waiting, query, 'waiting');
    }

    // Projects results
    if (results.projects.length > 0) {
      html += this.renderSearchGroup('Projects', '📋', results.projects, query, 'project');
    }

    // Reference results
    if (results.reference.length > 0) {
      html += this.renderSearchGroup('Reference', '📁', results.reference, query, 'reference');
    }

    // Archive results
    if (results.archive.length > 0) {
      html += this.renderSearchGroup('Archive', '🗄️', results.archive, query, 'archive');
    }

    container.innerHTML = html;
  }

  renderSearchGroup(title, icon, items, query, type) {
    const displayItems = items.slice(0, 5);
    const hasMore = items.length > 5;

    let html = `
      <div class="search-group">
        <div class="search-group-header">
          <span class="search-group-icon">${icon}</span>
          <span class="search-group-title">${title}</span>
          <span class="search-group-count">(${items.length})</span>
        </div>
        <div class="search-group-items">
    `;

    for (const item of displayItems) {
      html += this.renderSearchResultItem(item, query, type);
    }

    if (hasMore) {
      html += `
        <div class="search-more">
          + ${items.length - 5} more results
        </div>
      `;
    }

    html += `
        </div>
      </div>
    `;

    return html;
  }

  renderSearchResultItem(item, query, type) {
    let title = '';
    let subtitle = '';
    let badges = '';
    let viewAction = '';

    switch (type) {
      case 'inbox':
        title = item.content;
        subtitle = `Captured ${this.formatDate(item.timestamp)}`;
        viewAction = `app.navigateTo('inbox')`;
        break;
      case 'action':
        title = item.action;
        subtitle = item.contexts ? item.contexts.join(', ') : '';
        badges = item.contexts ? item.contexts.map(c =>
          `<span class="search-badge context">${c}</span>`
        ).join('') : '';
        viewAction = `app.navigateTo('nextActions')`;
        break;
      case 'waiting':
        title = item.action;
        subtitle = `Delegated to ${item.delegatedTo}`;
        badges = `<span class="search-badge waiting">@waiting-for-${item.delegatedTo.toLowerCase()}</span>`;
        viewAction = `app.navigateTo('waitingFor')`;
        break;
      case 'project':
        title = item.name;
        subtitle = item.description || '';
        badges = `<span class="search-badge project">${item.status}</span>`;
        viewAction = `app.navigateTo('projects')`;
        break;
      case 'reference':
        title = item.title;
        subtitle = item.folder ? `${item.folder}` : 'Unfiled';
        badges = item.folder ? `<span class="search-badge folder">${item.folder}</span>` : '';
        viewAction = `app.navigateTo('reference')`;
        break;
      case 'archive':
        title = item.action || item.name || 'Archived item';
        subtitle = `Archived ${this.formatDate(item.archivedAt)}`;
        badges = `<span class="search-badge archive">${item.originalType || 'item'}</span>`;
        viewAction = `app.navigateTo('archive')`;
        break;
    }

    // Highlight matching text
    const highlightedTitle = this.highlightSearchMatch(title, query);

    return `
      <div class="search-result-item" onclick="${viewAction}">
        <div class="search-result-content">
          <div class="search-result-title">${highlightedTitle}</div>
          ${subtitle ? `<div class="search-result-subtitle">${this.escapeHtml(subtitle)}</div>` : ''}
        </div>
        <div class="search-result-badges">
          ${badges}
        </div>
      </div>
    `;
  }

  highlightSearchMatch(text, query) {
    if (!text || !query) return this.escapeHtml(text || '');
    const escaped = this.escapeHtml(text);
    const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
    return escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
  }

  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  clearGlobalSearch() {
    const input = document.getElementById('sidebarSearchInput');

    input.value = '';
    this.globalSearchQuery = '';
    this.globalSearchResults = null;

    // Return to previous view
    if (this.previousView && this.currentView === 'searchResults') {
      this.currentView = this.previousView;
      this.previousView = null;
      this.updateViewDisplay();
      this.renderCurrentView();
    }
  }

  updateViewDisplay() {
    // Update view visibility
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const viewId = this.currentView === 'nextActions' ? 'nextActionsView' :
                   this.currentView === 'waitingFor' ? 'waitingForView' :
                   this.currentView === 'searchResults' ? 'searchResultsView' :
                   `${this.currentView}View`;
    const targetView = document.getElementById(viewId);
    if (targetView) {
      targetView.classList.add('active');
    }

    // Update nav highlighting (don't highlight for search)
    if (this.currentView !== 'searchResults') {
      document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === this.currentView);
      });
    }

    // Update mobile title
    const titles = {
      today: 'Today',
      inbox: 'Inbox',
      nextActions: 'Next Actions',
      waitingFor: 'Waiting For',
      projects: 'Projects',
      somedayMaybe: 'Someday/Maybe',
      reference: 'Reference',
      archive: 'Archive',
      trash: 'Trash',
      settings: 'Settings',
      searchResults: 'Search Results'
    };
    const mobileTitle = document.getElementById('mobileTitle');
    if (mobileTitle) mobileTitle.textContent = titles[this.currentView] || 'GTD';
  }

  // ============================================
  // KEYBOARD SHORTCUTS HELPERS
  // ============================================

  showKeyboardShortcutsHelp() {
    const modalContent = document.getElementById('modalContent');
    modalContent.innerHTML = `
      <div class="modal-header">
        <h2>Keyboard Shortcuts</h2>
        <button class="modal-close" onclick="app.closeModal()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="shortcuts-content">
        <div class="shortcuts-section">
          <h3>Global</h3>
          <div class="shortcut-row">
            <span class="shortcut-keys"><kbd>Cmd/Ctrl</kbd> + <kbd>K</kbd></span>
            <span class="shortcut-desc">Focus quick capture</span>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-keys"><kbd>Cmd/Ctrl</kbd> + <kbd>F</kbd> or <kbd>/</kbd></span>
            <span class="shortcut-desc">Focus search</span>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-keys"><kbd>Cmd/Ctrl</kbd> + <kbd>P</kbd></span>
            <span class="shortcut-desc">New project</span>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-keys"><kbd>Esc</kbd></span>
            <span class="shortcut-desc">Close modal / Clear search</span>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-keys"><kbd>?</kbd></span>
            <span class="shortcut-desc">Show this help</span>
          </div>
        </div>

        <div class="shortcuts-section">
          <h3>Navigation (press G, then...)</h3>
          <div class="shortcut-row">
            <span class="shortcut-keys"><kbd>G</kbd> <kbd>I</kbd></span>
            <span class="shortcut-desc">Go to Inbox</span>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-keys"><kbd>G</kbd> <kbd>N</kbd></span>
            <span class="shortcut-desc">Go to Next Actions</span>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-keys"><kbd>G</kbd> <kbd>W</kbd></span>
            <span class="shortcut-desc">Go to Waiting For</span>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-keys"><kbd>G</kbd> <kbd>P</kbd></span>
            <span class="shortcut-desc">Go to Projects</span>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-keys"><kbd>G</kbd> <kbd>R</kbd></span>
            <span class="shortcut-desc">Go to Reference</span>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-keys"><kbd>G</kbd> <kbd>A</kbd></span>
            <span class="shortcut-desc">Go to Archive</span>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-keys"><kbd>G</kbd> <kbd>T</kbd></span>
            <span class="shortcut-desc">Go to Trash</span>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-keys"><kbd>G</kbd> <kbd>S</kbd></span>
            <span class="shortcut-desc">Go to Settings</span>
          </div>
        </div>

        <div class="shortcuts-section">
          <h3>List Navigation</h3>
          <div class="shortcut-row">
            <span class="shortcut-keys"><kbd>J</kbd></span>
            <span class="shortcut-desc">Move down in list</span>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-keys"><kbd>K</kbd></span>
            <span class="shortcut-desc">Move up in list</span>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-keys"><kbd>Enter</kbd></span>
            <span class="shortcut-desc">Open/process selected item</span>
          </div>
        </div>

        <div class="shortcuts-section">
          <h3>Item Actions (with item selected)</h3>
          <div class="shortcut-row">
            <span class="shortcut-keys"><kbd>C</kbd></span>
            <span class="shortcut-desc">Mark complete</span>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-keys"><kbd>D</kbd></span>
            <span class="shortcut-desc">Delegate</span>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-keys"><kbd>E</kbd></span>
            <span class="shortcut-desc">Edit</span>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-keys"><kbd>Delete</kbd></span>
            <span class="shortcut-desc">Move to trash</span>
          </div>
        </div>
      </div>
    `;
    document.getElementById('modalOverlay').classList.add('active');
  }

  getSelectableItems() {
    // Get the current list of selectable items based on view
    let selector = '';
    switch (this.currentView) {
      case 'inbox':
        selector = '#inboxList .inbox-item';
        break;
      case 'nextActions':
        selector = '#nextActionsList .action-item';
        break;
      case 'waitingFor':
        selector = '#waitingList .waiting-item';
        break;
      case 'projects':
        selector = '#projectsList .project-card';
        break;
      default:
        return [];
    }
    return Array.from(document.querySelectorAll(selector));
  }

  moveListSelection(direction) {
    const items = this.getSelectableItems();
    if (items.length === 0) return;

    // Clear previous selection
    items.forEach(item => item.classList.remove('keyboard-selected'));

    // Update index
    if (this.selectedItemIndex === -1) {
      this.selectedItemIndex = direction > 0 ? 0 : items.length - 1;
    } else {
      this.selectedItemIndex += direction;
      if (this.selectedItemIndex < 0) this.selectedItemIndex = items.length - 1;
      if (this.selectedItemIndex >= items.length) this.selectedItemIndex = 0;
    }

    // Select new item
    const selectedItem = items[this.selectedItemIndex];
    if (selectedItem) {
      selectedItem.classList.add('keyboard-selected');
      this.selectedItemId = selectedItem.dataset.id;
      selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  clearListSelection() {
    this.selectedItemIndex = -1;
    this.selectedItemId = null;
    document.querySelectorAll('.keyboard-selected').forEach(el => {
      el.classList.remove('keyboard-selected');
    });
  }

  openSelectedItem() {
    if (!this.selectedItemId) return;

    switch (this.currentView) {
      case 'inbox':
        this.startProcessing(this.selectedItemId);
        break;
      case 'nextActions':
        // Could open edit modal
        this.editAction(this.selectedItemId);
        break;
      case 'projects':
        this.viewProject(this.selectedItemId);
        break;
    }
  }

  completeSelectedItem() {
    if (!this.selectedItemId) return;

    switch (this.currentView) {
      case 'nextActions':
        this.completeAction(this.selectedItemId);
        break;
      case 'waitingFor':
        this.completeWaiting(this.selectedItemId);
        break;
    }
    this.clearListSelection();
  }

  delegateSelectedItem() {
    if (!this.selectedItemId) return;

    switch (this.currentView) {
      case 'inbox':
        // Start processing with delegation
        this.startProcessing(this.selectedItemId);
        break;
      case 'nextActions':
        this.delegateExisting(this.selectedItemId);
        break;
    }
  }

  editSelectedItem() {
    if (!this.selectedItemId) return;

    switch (this.currentView) {
      case 'nextActions':
        this.editAction(this.selectedItemId);
        break;
      case 'projects':
        this.editProject(this.selectedItemId);
        break;
    }
  }

  async deleteSelectedItem() {
    if (!this.selectedItemId) return;

    switch (this.currentView) {
      case 'inbox':
        await this.deleteInboxItem(this.selectedItemId);
        break;
      case 'nextActions':
        await this.deleteAction(this.selectedItemId);
        break;
      case 'waitingFor':
        await this.deleteWaiting(this.selectedItemId);
        break;
      case 'projects':
        await this.deleteProject(this.selectedItemId);
        break;
    }
    this.clearListSelection();
  }

  // Placeholder methods for actions that may not exist yet
  async editAction(id) {
    this.showToast('Edit action - Coming soon', 'info');
  }

  async deleteAction(id) {
    if (confirm('Move this action to trash?')) {
      await db.moveToTrash(id, 'action');
      await this.renderCurrentView();
      await this.updateCounts();
      this.showToast('Action moved to trash', 'success');
    }
  }

  async deleteWaiting(id) {
    if (confirm('Move this waiting item to trash?')) {
      await db.moveToTrash(id, 'waiting');
      await this.renderCurrentView();
      await this.updateCounts();
      this.showToast('Item moved to trash', 'success');
    }
  }

  async deleteProject(id) {
    if (confirm('Move this project to trash?')) {
      await db.moveToTrash(id, 'project');
      await this.renderCurrentView();
      await this.updateCounts();
      this.showToast('Project moved to trash', 'success');
    }
  }

  bindEvents() {
    // Quick capture
    const captureInput = document.getElementById('captureInput');
    captureInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleCapture();
      }
    });
    captureInput.addEventListener('input', () => this.autoResizeTextarea(captureInput));

    // Voice button
    document.getElementById('voiceBtn').addEventListener('click', () => {
      speech.toggle();
    });

    // Submit button
    document.getElementById('submitBtn').addEventListener('click', () => {
      this.handleCapture();
    });

    // Upload button
    const uploadBtn = document.getElementById('uploadBtn');
    const fileInput = document.getElementById('fileUploadInput');
    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', () => {
        fileInput.click();
      });
      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          this.handleFileDrop(e.target.files);
          e.target.value = ''; // Reset so same file can be selected again
        }
      });
    }

    // Navigation
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.addEventListener('click', () => {
        this.navigateTo(item.dataset.view);
      });
    });

    // Mobile menu
    document.getElementById('hamburgerBtn').addEventListener('click', () => {
      this.toggleSidebar();
    });
    document.getElementById('sidebarOverlay').addEventListener('click', () => {
      this.toggleSidebar(false);
    });

    // Keyboard shortcuts - comprehensive system
    this.pendingGKey = false;
    this.selectedItemIndex = -1;
    this.selectedItemId = null;

    document.addEventListener('keydown', (e) => {
      const isInInput = document.activeElement.tagName === 'INPUT' ||
                        document.activeElement.tagName === 'TEXTAREA';
      const modalOpen = document.getElementById('modalOverlay').classList.contains('active');

      // Always handle Escape
      if (e.key === 'Escape') {
        // Close help panel first
        const helpOverlay = document.getElementById('helpPanelOverlay');
        if (helpOverlay?.classList.contains('visible')) {
          e.preventDefault();
          this.closeHelpPanel();
          return;
        }
        // Close onboarding
        const onboardingOverlay = document.getElementById('onboardingOverlay');
        if (onboardingOverlay?.classList.contains('visible')) {
          e.preventDefault();
          this.endOnboarding();
          return;
        }
        if (modalOpen) {
          e.preventDefault();
          this.closeModal();
        } else if (this.globalSearchQuery) {
          e.preventDefault();
          this.clearGlobalSearch();
        }
        this.pendingGKey = false;
        return;
      }

      // Don't handle shortcuts when typing (except for Cmd/Ctrl combos)
      if (isInInput && !(e.metaKey || e.ctrlKey)) {
        this.pendingGKey = false;
        return;
      }

      // Cmd/Ctrl shortcuts
      if (e.metaKey || e.ctrlKey) {
        switch (e.key.toLowerCase()) {
          case 'k':
            e.preventDefault();
            captureInput.focus();
            break;
          case 'p':
            e.preventDefault();
            if (!modalOpen) this.showNewProjectModal();
            break;
        }
        return;
      }

      // Skip if modal is open (except for Escape which is handled above)
      if (modalOpen) return;

      // G-key navigation (vim-style: press g, then another key)
      if (this.pendingGKey) {
        this.pendingGKey = false;
        switch (e.key.toLowerCase()) {
          case 'i':
            e.preventDefault();
            this.navigateTo('inbox');
            break;
          case 'n':
            e.preventDefault();
            this.navigateTo('nextActions');
            break;
          case 'w':
            e.preventDefault();
            this.navigateTo('waitingFor');
            break;
          case 'p':
            e.preventDefault();
            this.navigateTo('projects');
            break;
          case 'r':
            e.preventDefault();
            this.navigateTo('reference');
            break;
          case 'a':
            e.preventDefault();
            this.navigateTo('archive');
            break;
          case 's':
            e.preventDefault();
            this.navigateTo('settings');
            break;
          case 't':
            e.preventDefault();
            this.navigateTo('trash');
            break;
        }
        return;
      }

      // Single key shortcuts
      switch (e.key.toLowerCase()) {
        case 'g':
          // Start G-key sequence
          this.pendingGKey = true;
          // Reset after 1 second if no follow-up key
          setTimeout(() => { this.pendingGKey = false; }, 1000);
          break;

        case '?':
          e.preventDefault();
          this.openHelpPanel();
          break;

        case 'j':
          // Move down in list
          e.preventDefault();
          this.moveListSelection(1);
          break;

        case 'k':
          // Move up in list
          e.preventDefault();
          this.moveListSelection(-1);
          break;

        case 'enter':
          // Open selected item
          if (this.selectedItemId) {
            e.preventDefault();
            this.openSelectedItem();
          }
          break;

        case 'c':
          // Complete selected item
          if (this.selectedItemId && !isInInput) {
            e.preventDefault();
            this.completeSelectedItem();
          }
          break;

        case 'd':
          // Delegate selected item
          if (this.selectedItemId && !isInInput) {
            e.preventDefault();
            this.delegateSelectedItem();
          }
          break;

        case 'e':
          // Edit selected item
          if (this.selectedItemId && !isInInput) {
            e.preventDefault();
            this.editSelectedItem();
          }
          break;

        case 'backspace':
        case 'delete':
          // Delete selected item
          if (this.selectedItemId && !isInInput) {
            e.preventDefault();
            this.deleteSelectedItem();
          }
          break;
      }
    });

    // Data management
    document.getElementById('exportBtn').addEventListener('click', () => this.exportData());
    document.getElementById('importBtn').addEventListener('click', () => {
      document.getElementById('importInput').click();
    });
    document.getElementById('importInput').addEventListener('change', (e) => this.importData(e));
    document.getElementById('clearBtn').addEventListener('click', () => this.confirmClearData());

    // Modal events
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        this.closeModal();
      }
    });

    // Sidebar search
    const sidebarSearchInput = document.getElementById('sidebarSearchInput');

    sidebarSearchInput.addEventListener('input', (e) => {
      this.handleGlobalSearch(e.target.value);
    });

    sidebarSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.clearGlobalSearch();
        sidebarSearchInput.blur();
      }
    });

    // Search keyboard shortcut (Cmd/Ctrl + F or /)
    document.addEventListener('keydown', (e) => {
      // Skip if in an input field (except for slash which should work)
      const isInInput = document.activeElement.tagName === 'INPUT' ||
                        document.activeElement.tagName === 'TEXTAREA';

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        sidebarSearchInput.focus();
        sidebarSearchInput.select();
      } else if (e.key === '/' && !isInInput) {
        e.preventDefault();
        sidebarSearchInput.focus();
        sidebarSearchInput.select();
      }
    });

    // Reference Search
    document.getElementById('referenceSearch').addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.renderReferenceView();
    });

    // Settings - context management (safely bound)
    const addContextBtn = document.getElementById('addContextBtn');
    const newContextInput = document.getElementById('newContextInput');

    if (addContextBtn) addContextBtn.addEventListener('click', () => this.addContext());
    if (newContextInput) newContextInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.addContext(); }
    });

    // Settings - team member management
    const addTeamMemberBtn = document.getElementById('addTeamMemberBtn');
    if (addTeamMemberBtn) addTeamMemberBtn.addEventListener('click', () => this.showAddTeamMemberModal());

    // Settings - team collaboration (cloud)
    const createTeamBtn = document.getElementById('createTeamBtn');
    const joinTeamBtn = document.getElementById('joinTeamBtn');
    const generateInviteBtn = document.getElementById('generateInviteBtn');
    const copyInviteLinkBtn = document.getElementById('copyInviteLinkBtn');
    const leaveTeamBtn = document.getElementById('leaveTeamBtn');
    const deleteTeamBtn = document.getElementById('deleteTeamBtn');

    if (createTeamBtn) createTeamBtn.addEventListener('click', () => this.showCreateTeamModal());
    if (joinTeamBtn) joinTeamBtn.addEventListener('click', () => this.showJoinTeamModal());
    if (generateInviteBtn) generateInviteBtn.addEventListener('click', () => this.generateInviteLink());
    if (copyInviteLinkBtn) copyInviteLinkBtn.addEventListener('click', () => this.copyInviteLink());
    if (leaveTeamBtn) leaveTeamBtn.addEventListener('click', () => this.leaveTeam());
    if (deleteTeamBtn) deleteTeamBtn.addEventListener('click', () => this.deleteTeam());

    // Settings - contact management
    const addContactBtn = document.getElementById('addContactBtn');
    if (addContactBtn) addContactBtn.addEventListener('click', () => this.showAddContactModal());

    // Settings - run setup wizard again
    const runSetupWizardBtn = document.getElementById('runSetupWizardBtn');
    if (runSetupWizardBtn) runSetupWizardBtn.addEventListener('click', () => this.showSetupWizard());

    // Data management buttons (new enhanced UI)
    const exportJsonBtn = document.getElementById('exportJsonBtn');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const importJsonBtn = document.getElementById('importJsonBtn');
    const importFileInput = document.getElementById('importFileInput');
    const resetDataBtn = document.getElementById('resetDataBtn');

    if (exportJsonBtn) exportJsonBtn.addEventListener('click', () => this.exportDataAsJson());
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => this.exportDataAsCsv());
    if (importJsonBtn) importJsonBtn.addEventListener('click', () => importFileInput.click());
    if (importFileInput) importFileInput.addEventListener('change', (e) => this.showImportPreview(e));
    if (resetDataBtn) resetDataBtn.addEventListener('click', () => this.showResetConfirmation());

    // Update last backup date display
    this.updateLastBackupDate();

    // Theme selector
    document.querySelectorAll('input[name="theme"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.applyTheme(e.target.value);
      });
    });

    // Setup drag and drop on navigation items
    this.setupDropZones();

    // Setup file drag and drop
    this.setupFileDragDrop();

    // Clipboard paste for images
    document.addEventListener('paste', (e) => this.handlePaste(e));
  }

  setupFileDragDrop() {
    const dropZone = document.getElementById('dropZoneOverlay');
    let dragCounter = 0;

    // Show overlay when dragging files over the app
    document.addEventListener('dragenter', (e) => {
      e.preventDefault();
      if (e.dataTransfer.types.includes('Files')) {
        dragCounter++;
        dropZone.classList.add('active');
      }
    });

    document.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter === 0) {
        dropZone.classList.remove('active');
      }
    });

    document.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    document.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      dropZone.classList.remove('active');

      if (e.dataTransfer.files.length > 0) {
        this.handleFileDrop(e.dataTransfer.files);
      }
    });
  }

  async handleFileDrop(files) {
    // Supported file extensions (comprehensive list)
    const validExtensions = [
      // Images
      'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'heic', 'heif',
      // Documents
      'pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'txt', 'rtf', 'odt', 'ods', 'odp',
      // Data
      'csv', 'json', 'xml', 'esx',
      // Audio
      'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma',
      // Video
      'mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'm4v',
      // Archives
      'zip', 'rar', '7z', 'tar', 'gz',
      // Code/Text
      'html', 'css', 'js', 'ts', 'py', 'java', 'cpp', 'c', 'h', 'md', 'yaml', 'yml'
    ];

    const maxSizeMB = this.settings.maxFileSize || 100; // Increased for video files
    const maxSize = maxSizeMB * 1024 * 1024;

    for (const file of files) {
      // Check by extension (more reliable than MIME type)
      const ext = file.name.split('.').pop()?.toLowerCase();

      if (!validExtensions.includes(ext)) {
        this.showToast(`Unsupported file type: ${file.name}`, 'error');
        continue;
      }

      if (file.size > maxSize) {
        this.showToast(`File too large: ${file.name} (max ${maxSizeMB}MB)`, 'error');
        continue;
      }

      try {
        await this.captureFile(file);
        this.showToast(`File captured: ${file.name}`, 'success');
      } catch (error) {
        console.error('Failed to capture file:', error);
        this.showToast(`Failed to capture: ${file.name}`, 'error');
      }
    }
  }

  async handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          try {
            await this.captureFile(file, 'Screenshot');
            this.showToast('Screenshot captured!', 'success');
          } catch (error) {
            console.error('Failed to capture screenshot:', error);
            this.showToast('Failed to capture screenshot', 'error');
          }
        }
        return;
      }
    }
  }

  async captureFile(file, customName = null) {
    // Firestore has a 1MB document limit, so we can only store small files as base64
    // For larger files, Firebase Storage needs to be set up
    const MAX_INLINE_SIZE = 900 * 1024; // 900KB to leave room for other fields

    if (file.size > MAX_INLINE_SIZE) {
      // Try to upload to Firebase Storage if available
      try {
        const url = await this.uploadToStorage(file);

        // Create thumbnail for images
        let thumbnail = null;
        if (file.type.startsWith('image/')) {
          thumbnail = await this.createThumbnail(file, 100);
        }

        const item = {
          content: customName || file.name,
          type: 'file',
          attachment: {
            name: file.name,
            type: file.type,
            size: file.size,
            url: url, // Store URL instead of base64
            thumbnail: thumbnail
          }
        };

        await db.addToInbox(item.content, item.type, { attachment: item.attachment });
        await this.updateCounts();

        if (this.currentView === 'inbox') {
          await this.renderInboxView();
        }
        return;
      } catch (storageError) {
        console.error('Storage upload failed:', storageError);
        throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Firebase Storage needs to be set up for files over 900KB.`);
      }
    }

    // For small files, store as base64 directly in Firestore
    const base64 = await this.fileToBase64(file);

    // Create thumbnails for images (small for lists, large for preview)
    let thumbnail = null;
    let preview = null;
    if (file.type.startsWith('image/')) {
      thumbnail = await this.createThumbnail(file, 100);  // Small for lists
      preview = await this.createThumbnail(file, 400);    // Large for inbox preview
    }

    // Add to inbox with file attachment
    const item = {
      content: customName || file.name,
      type: 'file',
      attachment: {
        name: file.name,
        type: file.type,
        size: file.size,
        data: base64,
        thumbnail: thumbnail,
        preview: preview
      }
    };

    await db.addToInbox(item.content, item.type, { attachment: item.attachment });
    await this.updateCounts();

    if (this.currentView === 'inbox') {
      await this.renderInboxView();
    }
  }

  async uploadToStorage(file) {
    // Try to upload to Firebase Storage
    if (!firestoreDb || !firestoreDb.db) {
      throw new Error('Database not initialized');
    }

    const userId = firestoreDb.userId;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    // Get Firebase Storage reference
    const storage = firebase.storage();
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const path = `users/${userId}/inbox/${timestamp}_${safeName}`;

    const storageRef = storage.ref(path);
    await storageRef.put(file);

    return await storageRef.getDownloadURL();
  }

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async createThumbnail(file, maxSize = 100) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(file);
    });
  }

  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  renderAttachmentPreview(attachment, itemId) {
    const isImage = attachment.type.startsWith('image/');
    const isPdf = attachment.type === 'application/pdf';

    // Show compact version if previews are disabled
    if (this.settings.showFilePreviews === false) {
      return `
        <div class="inbox-attachment-preview compact">
          <div class="attachment-info-bar">
            <span class="attachment-icon">${isImage ? '🖼️' : '📄'}</span>
            <span class="attachment-filename">${this.escapeHtml(attachment.name)}</span>
            <span class="attachment-meta">${this.formatFileSize(attachment.size)}</span>
          </div>
        </div>
      `;
    }

    if (isImage) {
      // Use preview (400px) for inbox view, fallback to thumbnail or data
      const previewSrc = attachment.preview || attachment.thumbnail || attachment.data;
      return `
        <div class="inbox-attachment-preview">
          <div class="attachment-info-bar">
            <span class="attachment-icon">📎</span>
            <span class="attachment-filename">${this.escapeHtml(attachment.name)}</span>
            <span class="attachment-meta">${this.formatFileSize(attachment.size)}</span>
          </div>
          <div class="attachment-image-preview" onclick="app.viewFullAttachment('${itemId}')">
            <img src="${previewSrc}" alt="${this.escapeHtml(attachment.name)}" />
            <div class="attachment-image-overlay">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="M21 21l-4.35-4.35"></path>
                <line x1="11" y1="8" x2="11" y2="14"></line>
                <line x1="8" y1="11" x2="14" y2="11"></line>
              </svg>
              <span>Click to view full size</span>
            </div>
          </div>
        </div>
      `;
    } else if (isPdf) {
      return `
        <div class="inbox-attachment-preview">
          <div class="attachment-info-bar">
            <span class="attachment-icon">📄</span>
            <span class="attachment-filename">${this.escapeHtml(attachment.name)}</span>
            <span class="attachment-meta">PDF • ${this.formatFileSize(attachment.size)}</span>
          </div>
          <div class="attachment-pdf-preview" onclick="app.viewFullAttachment('${itemId}')">
            <div class="pdf-preview-placeholder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              <span>PDF Document</span>
              <span class="pdf-click-hint">Click to open</span>
            </div>
          </div>
        </div>
      `;
    }

    return '';
  }

  async viewFullAttachment(itemId) {
    const items = await db.getInboxItems();
    const item = items.find(i => i.id === itemId);

    if (!item || !item.attachment) {
      this.showToast('Attachment not found', 'error');
      return;
    }

    const attachment = item.attachment;

    if (attachment.type.startsWith('image/')) {
      // Open image in modal
      this.showModal(`
        <div class="modal-header">
          <h2>${this.escapeHtml(attachment.name)}</h2>
          <button class="modal-close" onclick="app.closeModal()">&times;</button>
        </div>
        <div class="attachment-full-view">
          <img src="${attachment.data}" alt="${this.escapeHtml(attachment.name)}" />
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="app.downloadAttachment('${itemId}')">Download</button>
          <button class="btn btn-primary" onclick="app.closeModal()">Close</button>
        </div>
      `);
    } else if (attachment.type === 'application/pdf') {
      // Open PDF in new tab
      const pdfWindow = window.open();
      pdfWindow.document.write(`
        <html>
          <head><title>${this.escapeHtml(attachment.name)}</title></head>
          <body style="margin:0">
            <iframe src="${attachment.data}" style="width:100%;height:100vh;border:none;"></iframe>
          </body>
        </html>
      `);
    }
  }

  async downloadAttachment(itemId) {
    const items = await db.getInboxItems();
    const item = items.find(i => i.id === itemId);

    if (!item || !item.attachment) {
      this.showToast('Attachment not found', 'error');
      return;
    }

    const attachment = item.attachment;
    const link = document.createElement('a');
    link.href = attachment.data;
    link.download = attachment.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    this.showToast('Download started', 'success');
  }

  async viewReferenceAttachment(referenceId, attachmentName) {
    const items = await db.getReference();
    const item = items.find(i => i.id === referenceId);

    if (!item || !item.attachments) {
      this.showToast('Attachment not found', 'error');
      return;
    }

    const attachment = item.attachments.find(a => a.name === attachmentName);
    if (!attachment) {
      this.showToast('Attachment not found', 'error');
      return;
    }

    const src = attachment.url || attachment.data;

    if (attachment.type && attachment.type.startsWith('image/')) {
      this.showModal(`
        <div class="modal-header">
          <h2>${this.escapeHtml(attachment.name)}</h2>
          <button class="modal-close" onclick="app.closeModal()">&times;</button>
        </div>
        <div class="attachment-full-view">
          <img src="${src}" alt="${this.escapeHtml(attachment.name)}" />
        </div>
        <div class="modal-footer">
          <a href="${src}" download="${this.escapeHtml(attachment.name)}" class="btn btn-secondary">Download</a>
          <button class="btn btn-primary" onclick="app.closeModal()">Close</button>
        </div>
      `);
    } else if (attachment.type === 'application/pdf') {
      window.open(src, '_blank');
    } else {
      // Generic file download
      const link = document.createElement('a');
      link.href = src;
      link.download = attachment.name;
      link.click();
    }
  }

  setupDropZones() {
    const navItems = document.querySelectorAll('.nav-item[data-view]');

    navItems.forEach(navItem => {
      navItem.addEventListener('dragover', (e) => this.handleDragOver(e, navItem));
      navItem.addEventListener('dragleave', (e) => this.handleDragLeave(e, navItem));
      navItem.addEventListener('drop', (e) => this.handleDrop(e, navItem));
    });
  }

  autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  }

  async handleCapture(explicitType = null) {
    const input = document.getElementById('captureInput');
    const content = input.value.trim();

    if (!content) return;

    try {
      // Use explicit type if provided, otherwise detect from speech state
      const type = explicitType || (speech.isListening ? 'voice' : 'text');
      if (speech.isListening) {
        speech.stop();
      }

      // Check for natural language dates
      let detectedDate = null;
      if (window.NaturalDateParser) {
        const dateResult = NaturalDateParser.extractFromText(content);
        if (dateResult.date) {
          detectedDate = dateResult.date;
          const formatted = new Date(dateResult.date).toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric'
          });
          this.showToast(`📅 Due date detected: ${formatted}`, 'info');
        }
      }

      // Parse with NLP
      const parsed = await nlp.parse(content);
      if (detectedDate && parsed) {
        parsed.detectedDate = detectedDate;
      }

      // If NLP detected entities, show preview modal
      if (parsed.confidence > 0) {
        this.pendingCapture = { content, type, parsed };
        this.showNLPPreviewModal(parsed);
        return;
      }

      // No entities detected, capture directly to inbox
      await db.addToInbox(content, type);
      input.value = '';
      input.style.height = 'auto';

      await this.updateCounts();

      if (this.currentView === 'inbox') {
        await this.renderInboxView();
      }

      // Only show toast for manual captures (voice auto-submit shows its own feedback)
      if (!explicitType) {
        this.showToast('Captured!', 'success');
      }
    } catch (error) {
      console.error('Failed to capture:', error);
      this.showToast('Failed to capture item', 'error');
    }
  }

  // NLP Preview Modal
  pendingCapture = null;

  showNLPPreviewModal(parsed) {
    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    const preview = nlp.formatPreview(parsed);
    const hasEntities = preview.length > 0;

    content.innerHTML = `
      <div class="nlp-preview-modal">
        <div class="nlp-preview-header">
          <h2>Smart Capture</h2>
          <p class="nlp-confidence">Detected ${preview.length} item${preview.length !== 1 ? 's' : ''}</p>
        </div>

        <div class="nlp-original-text">
          <label>Original Input</label>
          <div class="nlp-text-display">"${this.escapeHtml(parsed.originalText)}"</div>
        </div>

        ${hasEntities ? `
          <div class="nlp-detected-entities">
            <label>Detected</label>
            <div class="nlp-entity-chips">
              ${preview.map(p => `
                <div class="nlp-entity-chip">
                  <span class="nlp-entity-icon">${p.icon}</span>
                  <span class="nlp-entity-label">${p.label}:</span>
                  <span class="nlp-entity-value">${this.escapeHtml(p.value)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="nlp-destination">
          <label>Save as</label>
          <div class="nlp-destination-options">
            ${parsed.isWaitingFor && parsed.person ? `
              <label class="nlp-destination-option selected" data-dest="waiting">
                <input type="radio" name="nlpDest" value="waiting" checked>
                <span class="nlp-dest-icon">⏳</span>
                <span class="nlp-dest-label">Waiting For ${this.escapeHtml(parsed.person.name)}</span>
              </label>
            ` : parsed.contexts.length > 0 || parsed.person ? `
              <label class="nlp-destination-option selected" data-dest="action">
                <input type="radio" name="nlpDest" value="action" checked>
                <span class="nlp-dest-icon">✓</span>
                <span class="nlp-dest-label">Next Action</span>
              </label>
            ` : ''}
            <label class="nlp-destination-option ${!parsed.isWaitingFor && parsed.contexts.length === 0 && !parsed.person ? 'selected' : ''}" data-dest="inbox">
              <input type="radio" name="nlpDest" value="inbox" ${!parsed.isWaitingFor && parsed.contexts.length === 0 && !parsed.person ? 'checked' : ''}>
              <span class="nlp-dest-icon">📥</span>
              <span class="nlp-dest-label">Inbox (process later)</span>
            </label>
          </div>
        </div>

        <div class="nlp-preview-actions">
          <button class="btn btn-secondary" onclick="app.cancelNLPCapture()">Cancel</button>
          <button class="btn btn-primary" onclick="app.confirmNLPCapture()">
            ${parsed.isWaitingFor ? 'Add to Waiting' : parsed.contexts.length > 0 || parsed.person ? 'Add Action' : 'Capture'}
          </button>
        </div>
      </div>
    `;

    // Bind destination option clicks
    content.querySelectorAll('.nlp-destination-option').forEach(opt => {
      opt.addEventListener('click', () => {
        content.querySelectorAll('.nlp-destination-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        opt.querySelector('input').checked = true;
      });
    });
  }

  cancelNLPCapture() {
    this.pendingCapture = null;
    this.closeModal();
  }

  async confirmNLPCapture() {
    if (!this.pendingCapture) return;

    const { content, type, parsed } = this.pendingCapture;
    const destination = document.querySelector('input[name="nlpDest"]:checked')?.value || 'inbox';

    try {
      if (destination === 'inbox') {
        // Save to inbox with NLP metadata
        await db.addToInbox(content, type, {
          nlpParsed: true,
          suggestedContexts: parsed.contexts,
          suggestedPerson: parsed.person?.name,
          suggestedProject: parsed.project?.id,
          suggestedDueDate: parsed.dueDate,
          suggestedPriority: parsed.priority
        });
        this.showToast('Captured to Inbox!', 'success');

      } else if (destination === 'waiting') {
        // Create waiting-for item directly
        const waitingItem = {
          action: parsed.suggestedAction || content,
          delegatedTo: parsed.person?.name || 'Unknown',
          delegatedDate: new Date().toISOString(),
          expectedDate: parsed.dueDate || null,
          method: 'verbal',
          originalContent: content,
          notes: '',
          projectId: parsed.project?.id || null
        };
        await db.addToWaitingFor(waitingItem);
        this.showToast(`Added to Waiting For ${parsed.person?.name}!`, 'success');

      } else if (destination === 'action') {
        // Create next action directly
        const actionItem = {
          action: parsed.suggestedAction || content,
          contexts: parsed.contexts.length > 0 ? parsed.contexts : ['@computer'],
          originalContent: content,
          originalTimestamp: new Date().toISOString(),
          processedDate: new Date().toISOString(),
          tags: [],
          priority: parsed.priority,
          dueDate: parsed.dueDate,
          location: null,
          projectId: parsed.project?.id || null
        };
        await db.add('nextActions', actionItem);
        this.showToast('Added to Next Actions!', 'success');
      }

      // Clear input
      const input = document.getElementById('captureInput');
      input.value = '';
      input.style.height = 'auto';

      // Update UI
      await this.updateCounts();
      if (this.currentView === 'inbox' || this.currentView === 'nextActions' || this.currentView === 'waitingFor') {
        await this.renderCurrentView();
      }

      this.pendingCapture = null;
      this.closeModal();

    } catch (error) {
      console.error('Failed to save NLP capture:', error);
      this.showToast('Failed to save', 'error');
    }
  }

  navigateTo(view) {
    this.currentView = view;
    this.toggleSidebar(false);

    // Update active nav
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === view);
    });

    // Update mobile title
    const titles = {
      today: 'Today',
      inbox: 'Inbox',
      nextActions: 'Next Actions',
      waitingFor: 'Waiting For',
      projects: 'Projects',
      areas: 'Areas',
      somedayMaybe: 'Someday/Maybe',
      reference: 'Reference',
      archive: 'Archive',
      trash: 'Trash',
      settings: 'Settings',
      weeklyReview: 'Weekly Review',
      // Team views
      teamDashboard: 'Team Dashboard',
      assignedToMe: 'Assigned to Me',
      teamMembers: 'Team Members',
      sharedProjects: 'Shared Projects',
      teamActivity: 'Team Activity',
      teamSettings: 'Team Settings',
      teamMemberDetail: 'Team Member'
    };
    const mobileTitle = document.getElementById('mobileTitle');
    if (mobileTitle) mobileTitle.textContent = titles[view] || 'GTD Capture';

    this.renderCurrentView();
  }

  toggleSidebar(force) {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const isOpen = force !== undefined ? force : !sidebar.classList.contains('open');

    sidebar.classList.toggle('open', isOpen);
    overlay.classList.toggle('active', isOpen);
  }

  // Helper to safely activate a view element
  activateView(viewId) {
    const el = document.getElementById(viewId);
    if (el) el.classList.add('active');
    return el;
  }

  async renderCurrentView() {
    document.querySelectorAll('.view').forEach(view => {
      view.classList.remove('active');
    });

    switch (this.currentView) {
      case 'today':
        this.activateView('todayView');
        await this.renderTodayView();
        break;
      case 'inbox':
        this.activateView('inboxView');
        await this.renderInboxView();
        break;
      case 'nextActions':
        this.activateView('nextActionsView');
        await this.renderNextActionsView();
        break;
      case 'waitingFor':
        this.activateView('waitingForView');
        await this.renderWaitingForView();
        break;
      case 'assignedToMe':
        this.activateView('assignedToMeView');
        await this.renderAssignedToMeView();
        break;
      case 'projects':
        this.activateView('projectsView');
        await this.renderProjectsView();
        break;
      case 'areas':
        this.activateView('areasView');
        await this.renderAreasView();
        break;
      case 'somedayMaybe':
        this.activateView('somedayMaybeView');
        await this.renderSomedayMaybeView();
        break;
      case 'reference':
        this.activateView('referenceView');
        await this.renderReferenceView();
        break;
      case 'archive':
        this.activateView('archiveView');
        await this.renderArchiveView();
        break;
      case 'trash':
        this.activateView('trashView');
        await this.renderTrashView();
        break;
      case 'settings':
        this.activateView('settingsView');
        await this.renderSettingsView();
        break;
      case 'weeklyReview':
        this.activateView('weeklyReviewView');
        await this.startWeeklyReview();
        break;
      // Team views
      case 'teamDashboard':
        this.activateView('teamDashboardView');
        await this.renderTeamDashboardView();
        break;
      case 'teamMembers':
        this.activateView('teamMembersView');
        await this.renderTeamMembersView();
        break;
      case 'sharedProjects':
        this.activateView('sharedProjectsView');
        await this.renderSharedProjectsView();
        break;
      case 'sharedProjectDetail':
        this.activateView('sharedProjectDetailView');
        await this.renderSharedProjectDetailView();
        break;
      case 'teamActivity':
        this.activateView('teamActivityView');
        await this.renderTeamActivityView();
        break;
      case 'teamSettings':
        this.activateView('teamSettingsView');
        await this.renderTeamSettingsView();
        break;
      case 'teamMemberDetail':
        this.activateView('teamMemberDetailView');
        await this.renderTeamMemberDetailView();
        break;
    }
  }

  // =====================
  // Today View (Daily Briefing)
  // =====================

  async renderTodayView() {
    const container = document.getElementById('todayContent');
    if (!container) return;
    const briefing = await db.getTodayBriefing();

    // Get additional stats
    const projects = await db.getProjects();
    const activeProjects = projects.filter(p => p.status === 'active').length;

    const todayDate = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    // Get times
    const now = new Date();
    const localTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const phoenixTime = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Phoenix'
    });

    // Get weather data
    let weatherHtml = '';
    try {
      const weather = await this.getWeatherData();
      if (weather) {
        weatherHtml = `
          <div class="today-weather">
            <span class="weather-icon">${weather.icon}</span>
            <span class="weather-temp">${weather.temp}°F</span>
            <span class="weather-desc">${weather.description}</span>
          </div>
        `;
      }
    } catch (e) {
      console.log('Weather not available');
    }

    container.innerHTML = `
      <div class="today-hero">
        <div class="today-hero-content">
          <div class="today-greeting">
            <h1>${briefing.greeting}</h1>
            <p class="today-date">${todayDate}</p>
          </div>
          <div class="today-time-weather">
            <div class="time-display">
              <div class="time-local">
                <span class="time-value">${localTime}</span>
                <span class="time-label">Local</span>
              </div>
              <div class="time-divider"></div>
              <div class="time-phoenix">
                <span class="time-value">${phoenixTime}</span>
                <span class="time-label">Phoenix</span>
              </div>
            </div>
            ${weatherHtml}
          </div>
        </div>
        <div class="today-header-actions">
          <button class="btn btn-primary btn-lg" onclick="app.startMyDay()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            Start My Day
          </button>
        </div>
      </div>

      <div class="today-calendar-section" id="todayCalendarSection">
        <div class="today-calendar-header">
          <h3>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            Today's Schedule
          </h3>
        </div>
        <div id="todayCalendarContent" class="today-calendar-events">
          <div class="calendar-loading">Loading calendar...</div>
        </div>
      </div>

      <div class="today-stats">
        <div class="today-stat ${briefing.overdue.length > 0 ? 'danger' : ''}">
          <span class="stat-number">${briefing.overdue.length}</span>
          <span class="stat-label">Overdue</span>
        </div>
        <div class="today-stat ${briefing.dueToday.length > 0 ? 'warning' : ''}">
          <span class="stat-number">${briefing.dueToday.length}</span>
          <span class="stat-label">Due Today</span>
        </div>
        <div class="today-stat ${briefing.agingWaiting.length > 0 ? 'info' : ''}">
          <span class="stat-number">${briefing.agingWaiting.length}</span>
          <span class="stat-label">Needs Follow-up</span>
        </div>
        <div class="today-stat">
          <span class="stat-number">${briefing.inboxCount}</span>
          <span class="stat-label">In Inbox</span>
        </div>
      </div>

      <div class="today-stats secondary">
        <div class="today-stat">
          <span class="stat-number">${briefing.totalActions}</span>
          <span class="stat-label">Active Actions</span>
        </div>
        <div class="today-stat">
          <span class="stat-number">${briefing.totalWaiting}</span>
          <span class="stat-label">Waiting For</span>
        </div>
        <div class="today-stat">
          <span class="stat-number">${activeProjects}</span>
          <span class="stat-label">Active Projects</span>
        </div>
      </div>

      ${briefing.focusItems.length > 0 ? `
        <div class="today-section">
          <h2>Suggested Focus</h2>
          <p class="section-subtitle">Top priorities for today</p>
          <div class="focus-list">
            ${briefing.focusItems.map((item, index) => this.renderFocusItem(item, index)).join('')}
          </div>
        </div>
      ` : `
        <div class="today-section">
          <div class="empty-state small">
            <h3>All Clear!</h3>
            <p>No urgent items need your attention right now.</p>
          </div>
        </div>
      `}

      ${briefing.overdue.length > 0 ? `
        <div class="today-section collapsible">
          <h3 class="section-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <span>Overdue Items</span>
            <span class="badge danger">${briefing.overdue.length}</span>
            <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </h3>
          <div class="section-content">
            ${briefing.overdue.map(item => this.renderTodayActionItem(item)).join('')}
          </div>
        </div>
      ` : ''}

      ${briefing.agingWaiting.length > 0 ? `
        <div class="today-section collapsible">
          <h3 class="section-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <span>Waiting Items Needing Follow-up</span>
            <span class="badge info">${briefing.agingWaiting.length}</span>
            <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </h3>
          <div class="section-content">
            ${briefing.agingWaiting.map(item => this.renderTodayWaitingItem(item)).join('')}
          </div>
        </div>
      ` : ''}
    `;

    // Load calendar events asynchronously
    this.loadTodayCalendarEvents();
  }

  async loadTodayCalendarEvents() {
    const container = document.getElementById('todayCalendarContent');
    if (!container) return;

    try {
      // Check if Google Calendar is connected
      if (typeof googleIntegration === 'undefined' || !googleIntegration.calendarConnected) {
        container.innerHTML = `
          <div class="calendar-not-connected compact">
            <span>Calendar not connected</span>
            <button class="btn btn-secondary btn-sm" onclick="app.navigateTo('settings')">Connect</button>
          </div>
        `;
        return;
      }

      // Fetch today's events
      const events = await googleIntegration.getTodayEvents();

      if (!events || events.length === 0) {
        container.innerHTML = `
          <div class="calendar-empty compact">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span>No events scheduled for today</span>
          </div>
        `;
        return;
      }

      // Render events
      container.innerHTML = events.map(event => this.renderCalendarEvent(event)).join('');

    } catch (error) {
      console.error('Failed to load calendar events:', error);
      container.innerHTML = `
        <div class="calendar-error">
          <p>Unable to load calendar events</p>
          <button class="btn btn-secondary btn-sm" onclick="app.loadTodayCalendarEvents()">
            Retry
          </button>
        </div>
      `;
    }
  }

  renderCalendarEvent(event) {
    const startTime = event.isAllDay ? 'All day' : googleIntegration.formatTime(event.start);
    const endTime = event.isAllDay ? '' : googleIntegration.formatTime(event.end);
    const duration = event.isAllDay ? '' : this.formatDuration(new Date(event.start), new Date(event.end));

    return `
      <div class="calendar-event ${event.isFocusTime ? 'focus-time' : ''} ${event.isAllDay ? 'all-day' : ''}"
           onclick="window.open('${event.htmlLink}', '_blank')">
        <div class="calendar-event-time">${startTime}</div>
        <div class="calendar-event-content">
          <div class="calendar-event-title">${this.escapeHtml(event.title)}</div>
          <div class="calendar-event-meta">
            ${duration ? `<span class="duration">${duration}</span>` : ''}
            ${event.location ? `
              <span class="location">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
                ${this.escapeHtml(event.location.split(',')[0])}
              </span>
            ` : ''}
          </div>
        </div>
        ${event.isFocusTime ? '<span class="calendar-event-badge focus">Focus</span>' : ''}
      </div>
    `;
  }

  formatDuration(start, end) {
    const diffMs = end - start;
    const diffMins = Math.round(diffMs / 60000);
    if (diffMins < 60) return `${diffMins} min`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
  }

  async getWeatherData() {
    // Check if we have cached weather data (cache for 30 minutes)
    const cached = localStorage.getItem('gtd-weather-cache');
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < 30 * 60 * 1000) {
        return data;
      }
    }

    try {
      // Try to get user's location
      let lat, lon;

      if (navigator.geolocation) {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        lat = position.coords.latitude;
        lon = position.coords.longitude;
      } else {
        // Default to Phoenix
        lat = 33.4484;
        lon = -112.0740;
      }

      // Use Open-Meteo free API (no key required)
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=auto`
      );

      if (!response.ok) return null;

      const data = await response.json();
      const temp = Math.round(data.current.temperature_2m);
      const code = data.current.weather_code;

      // Map weather codes to icons and descriptions
      const weatherMap = {
        0: { icon: '☀️', desc: 'Clear' },
        1: { icon: '🌤️', desc: 'Mostly Clear' },
        2: { icon: '⛅', desc: 'Partly Cloudy' },
        3: { icon: '☁️', desc: 'Cloudy' },
        45: { icon: '🌫️', desc: 'Foggy' },
        48: { icon: '🌫️', desc: 'Foggy' },
        51: { icon: '🌧️', desc: 'Light Drizzle' },
        53: { icon: '🌧️', desc: 'Drizzle' },
        55: { icon: '🌧️', desc: 'Heavy Drizzle' },
        61: { icon: '🌧️', desc: 'Light Rain' },
        63: { icon: '🌧️', desc: 'Rain' },
        65: { icon: '🌧️', desc: 'Heavy Rain' },
        71: { icon: '🌨️', desc: 'Light Snow' },
        73: { icon: '🌨️', desc: 'Snow' },
        75: { icon: '🌨️', desc: 'Heavy Snow' },
        77: { icon: '🌨️', desc: 'Snow Grains' },
        80: { icon: '🌧️', desc: 'Showers' },
        81: { icon: '🌧️', desc: 'Showers' },
        82: { icon: '🌧️', desc: 'Heavy Showers' },
        85: { icon: '🌨️', desc: 'Snow Showers' },
        86: { icon: '🌨️', desc: 'Heavy Snow Showers' },
        95: { icon: '⛈️', desc: 'Thunderstorm' },
        96: { icon: '⛈️', desc: 'Thunderstorm' },
        99: { icon: '⛈️', desc: 'Severe Thunderstorm' }
      };

      const weather = weatherMap[code] || { icon: '🌡️', desc: 'Weather' };

      const result = {
        temp,
        icon: weather.icon,
        description: weather.desc
      };

      // Cache the result
      localStorage.setItem('gtd-weather-cache', JSON.stringify({
        data: result,
        timestamp: Date.now()
      }));

      return result;
    } catch (error) {
      console.log('Weather fetch failed:', error);
      return null;
    }
  }

  renderFocusItem(item, index) {
    const reasonLabels = {
      'overdue': 'Overdue',
      'due-today': 'Due Today',
      'high-priority': 'High Priority',
      'needs-followup': 'Needs Follow-up'
    };

    const reasonClass = item.reason.replace('-', '');

    if (item.type === 'waiting') {
      return `
        <div class="focus-item ${reasonClass}">
          <span class="focus-number">${index + 1}</span>
          <div class="focus-content">
            <div class="focus-action">Follow up with ${this.escapeHtml(item.delegatedTo || 'Unknown')}</div>
            <div class="focus-meta">
              <span class="focus-reason">${reasonLabels[item.reason]}</span>
              <span class="focus-detail">${item.action ? this.escapeHtml(item.action) : ''}</span>
              <span class="focus-age">${item.daysSince} days waiting</span>
            </div>
          </div>
          <div class="focus-actions">
            <button class="btn btn-sm" onclick="app.quickFollowUp('${item.id}')">Follow Up</button>
          </div>
        </div>
      `;
    }

    return `
      <div class="focus-item ${reasonClass}">
        <span class="focus-number">${index + 1}</span>
        <div class="focus-content">
          <div class="focus-action">${this.escapeHtml(item.action)}</div>
          <div class="focus-meta">
            <span class="focus-reason">${reasonLabels[item.reason]}</span>
            ${item.dueDate ? `<span class="focus-due">${this.formatDate(item.dueDate)}</span>` : ''}
            ${item.contexts ? item.contexts.slice(0, 2).map(c => `<span class="context-badge small">${c}</span>`).join('') : ''}
          </div>
        </div>
        <div class="focus-actions">
          <button class="btn btn-sm btn-primary" onclick="app.completeFromToday('${item.id}')">Done</button>
        </div>
      </div>
    `;
  }

  renderTodayActionItem(item) {
    const daysOverdue = item.dueDate ? Math.floor((new Date() - new Date(item.dueDate)) / (1000 * 60 * 60 * 24)) : 0;
    return `
      <div class="today-list-item">
        <div class="item-content">
          <div class="item-action">${this.escapeHtml(item.action)}</div>
          <div class="item-meta">
            ${daysOverdue > 0 ? `<span class="overdue-badge">${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue</span>` : ''}
            ${item.contexts ? item.contexts.map(c => `<span class="context-badge small">${c}</span>`).join('') : ''}
          </div>
        </div>
        <button class="btn btn-sm" onclick="app.completeFromToday('${item.id}')">Done</button>
      </div>
    `;
  }

  renderTodayWaitingItem(item) {
    return `
      <div class="today-list-item">
        <div class="item-content">
          <div class="item-action">${this.escapeHtml(item.delegatedTo || 'Unknown')}: ${this.escapeHtml(item.action || '')}</div>
          <div class="item-meta">
            <span class="waiting-badge">${item.daysSince} days waiting</span>
          </div>
        </div>
        <button class="btn btn-sm" onclick="app.quickFollowUp('${item.id}')">Follow Up</button>
      </div>
    `;
  }

  async startMyDay() {
    // Navigate to next actions with high priority filter
    this.navigateTo('nextActions');
    this.showToast('Let\'s get things done!', 'success');
  }

  async completeFromToday(actionId) {
    try {
      await db.completeAction(actionId);
      await this.updateCounts();
      await this.renderTodayView();
      this.showToast('Action completed!', 'success');
    } catch (error) {
      console.error('Failed to complete action:', error);
      this.showToast('Failed to complete action', 'error');
    }
  }

  async quickFollowUp(waitingId) {
    try {
      const item = await db.get('waitingFor', waitingId);
      if (!item) {
        this.showToast('Item not found', 'error');
        return;
      }

      // Show follow-up options modal
      const modal = document.getElementById('modalOverlay');
      const content = document.getElementById('modalContent');
      modal.classList.add('active');

      const personName = item.delegatedTo || item.person || item.personName || 'them';
      const personEmail = item.personEmail || item.email || '';

      content.innerHTML = `
        <div class="modal-header">
          <h3>Follow Up</h3>
        </div>
        <div class="modal-body">
          <p class="follow-up-context">Following up with <strong>${this.escapeHtml(personName)}</strong> about:</p>
          <p class="follow-up-item">${this.escapeHtml(item.action || item.item || '')}</p>
          <div class="follow-up-options">
            ${personEmail ? `
              <button class="btn btn-primary follow-up-option" onclick="app.executeFollowUp('${waitingId}', 'email')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                Send Email
              </button>
            ` : ''}
            <button class="btn btn-secondary follow-up-option" onclick="app.executeFollowUp('${waitingId}', 'call')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              Log Call
            </button>
            <button class="btn btn-secondary follow-up-option" onclick="app.executeFollowUp('${waitingId}', 'manual')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <polyline points="9 11 12 14 22 4"></polyline>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
              </svg>
              Mark as Followed Up
            </button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        </div>
      `;
    } catch (error) {
      console.error('Failed to load follow-up:', error);
      this.showToast('Failed to load item', 'error');
    }
  }

  async executeFollowUp(waitingId, method) {
    try {
      const item = await db.get('waitingFor', waitingId);
      if (!item) {
        this.showToast('Item not found', 'error');
        this.closeModal();
        return;
      }

      if (method === 'email') {
        const personName = item.delegatedTo || item.person || item.personName || 'them';
        const personEmail = item.personEmail || item.email || '';
        const subject = `Re: ${item.action || item.item || 'Following up'}`;
        const body = `Hi ${personName},\n\nJust following up on my earlier request regarding:\n\n${item.action || item.item || ''}\n\nAny update on timing?\n\nThanks`;

        const mailtoUrl = `mailto:${personEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(mailtoUrl, '_blank');
      }

      // Record the follow-up
      await db.addFollowUp(waitingId, method);
      await this.updateCounts();

      this.closeModal();

      // Re-render current view
      if (this.currentView === 'today') {
        await this.renderTodayView();
      } else if (this.currentView === 'waitingFor') {
        await this.renderWaitingForView();
      }

      const methodLabels = { email: 'Email sent', call: 'Call logged', manual: 'Follow-up recorded' };
      this.showToast(methodLabels[method] || 'Follow-up recorded', 'success');
    } catch (error) {
      console.error('Failed to record follow-up:', error);
      this.showToast('Failed to record follow-up', 'error');
    }
  }

  // =====================
  // Someday/Maybe View
  // =====================

  somedayFilter = 'all';

  async renderSomedayMaybeView() {
    const container = document.getElementById('somedayList');
    const filterBar = document.getElementById('somedayFilterBar');
    if (!container) return;

    let items = await db.getSomedayMaybeItems();

    // Render filter bar
    if (filterBar) {
      filterBar.innerHTML = `
        <button class="filter-btn ${this.somedayFilter === 'all' ? 'active' : ''}" onclick="app.setSomedayFilter('all')">All</button>
        <button class="filter-btn ${this.somedayFilter === 'business' ? 'active' : ''}" onclick="app.setSomedayFilter('business')">Business</button>
        <button class="filter-btn ${this.somedayFilter === 'personal' ? 'active' : ''}" onclick="app.setSomedayFilter('personal')">Personal</button>
        <button class="filter-btn ${this.somedayFilter === 'team' ? 'active' : ''}" onclick="app.setSomedayFilter('team')">Team</button>
      `;
    }

    // Apply filter
    if (this.somedayFilter !== 'all') {
      items = items.filter(item => item.category === this.somedayFilter);
    }

    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <h3>No Ideas Yet</h3>
          <p>${this.somedayFilter !== 'all' ? 'No items in this category.' : 'Add ideas and possibilities you might want to explore later.'}</p>
          <button class="btn btn-primary" onclick="app.showAddSomedayModal()">Add Your First Idea</button>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(item => this.renderSomedayItem(item)).join('');
  }

  renderSomedayItem(item) {
    const categoryIcons = {
      business: '💼',
      personal: '🏠',
      team: '👥'
    };
    const icon = categoryIcons[item.category] || '💡';

    const createdDate = new Date(item.created).toLocaleDateString();
    const needsReview = !item.lastReviewed || (new Date() - new Date(item.lastReviewed)) > 7 * 24 * 60 * 60 * 1000;

    return `
      <div class="someday-item ${needsReview ? 'needs-review' : ''}" data-id="${item.id}">
        <div class="someday-icon">${icon}</div>
        <div class="someday-content">
          <div class="someday-text">${this.escapeHtml(item.content)}</div>
          ${item.notes ? `<div class="someday-notes">${this.escapeHtml(item.notes)}</div>` : ''}
          <div class="someday-meta">
            <span class="someday-category">${item.category}</span>
            <span class="someday-date">Added ${createdDate}</span>
            ${needsReview ? '<span class="review-badge">Needs Review</span>' : ''}
          </div>
        </div>
        <div class="someday-actions">
          <button class="btn btn-sm btn-primary" onclick="app.promoteToProject('${item.id}')" title="Promote to Project">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>
          <button class="btn btn-sm" onclick="app.markSomedayReviewed('${item.id}')" title="Mark Reviewed">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </button>
          <button class="btn btn-sm btn-icon" onclick="app.editSomedayItem('${item.id}')" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="btn btn-sm btn-icon delete" onclick="app.deleteSomedayItem('${item.id}')" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  setSomedayFilter(filter) {
    this.somedayFilter = filter;
    this.renderSomedayMaybeView();
  }

  showAddSomedayModal() {
    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    content.innerHTML = `
      <div class="modal-header">
        <h3>Add Someday/Maybe Idea</h3>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>What's your idea?</label>
          <textarea id="somedayContent" class="form-control" rows="3" placeholder="Describe your idea or possibility..."></textarea>
        </div>
        <div class="form-group">
          <label>Category</label>
          <select id="somedayCategory" class="form-control">
            <option value="personal">Personal</option>
            <option value="business">Business</option>
            <option value="team">Team</option>
          </select>
        </div>
        <div class="form-group">
          <label>Notes (optional)</label>
          <textarea id="somedayNotes" class="form-control" rows="2" placeholder="Any additional thoughts..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.saveSomedayItem()">Add Idea</button>
      </div>
    `;

    document.getElementById('somedayContent').focus();
  }

  async saveSomedayItem() {
    const content = document.getElementById('somedayContent').value.trim();
    const category = document.getElementById('somedayCategory').value;
    const notes = document.getElementById('somedayNotes').value.trim();

    if (!content) {
      this.showToast('Please enter an idea', 'error');
      return;
    }

    try {
      await db.addToSomedayMaybe({ content, category, notes });
      this.closeModal();
      await this.updateCounts();
      await this.renderSomedayMaybeView();
      this.showToast('Idea added to Someday/Maybe!', 'success');
    } catch (error) {
      console.error('Failed to save someday item:', error);
      this.showToast('Failed to save idea', 'error');
    }
  }

  async editSomedayItem(id) {
    const item = await db.get('somedayMaybe', id);
    if (!item) return;

    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    content.innerHTML = `
      <div class="modal-header">
        <h3>Edit Idea</h3>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>What's your idea?</label>
          <textarea id="somedayContent" class="form-control" rows="3">${this.escapeHtml(item.content)}</textarea>
        </div>
        <div class="form-group">
          <label>Category</label>
          <select id="somedayCategory" class="form-control">
            <option value="personal" ${item.category === 'personal' ? 'selected' : ''}>Personal</option>
            <option value="business" ${item.category === 'business' ? 'selected' : ''}>Business</option>
            <option value="team" ${item.category === 'team' ? 'selected' : ''}>Team</option>
          </select>
        </div>
        <div class="form-group">
          <label>Notes (optional)</label>
          <textarea id="somedayNotes" class="form-control" rows="2">${this.escapeHtml(item.notes || '')}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.updateSomedayItem('${id}')">Save Changes</button>
      </div>
    `;
  }

  async updateSomedayItem(id) {
    const content = document.getElementById('somedayContent').value.trim();
    const category = document.getElementById('somedayCategory').value;
    const notes = document.getElementById('somedayNotes').value.trim();

    if (!content) {
      this.showToast('Please enter an idea', 'error');
      return;
    }

    try {
      const item = await db.get('somedayMaybe', id);
      await db.updateSomedayMaybe({ ...item, content, category, notes });
      this.closeModal();
      await this.renderSomedayMaybeView();
      this.showToast('Idea updated!', 'success');
    } catch (error) {
      console.error('Failed to update someday item:', error);
      this.showToast('Failed to update idea', 'error');
    }
  }

  async deleteSomedayItem(id) {
    if (!confirm('Are you sure you want to delete this idea?')) return;

    try {
      await db.deleteSomedayMaybe(id);
      await this.updateCounts();
      await this.renderSomedayMaybeView();
      this.showToast('Idea deleted', 'success');
    } catch (error) {
      console.error('Failed to delete someday item:', error);
      this.showToast('Failed to delete idea', 'error');
    }
  }

  async markSomedayReviewed(id) {
    try {
      await db.markSomedayMaybeReviewed(id);
      await this.renderSomedayMaybeView();
      this.showToast('Marked as reviewed', 'success');
    } catch (error) {
      console.error('Failed to mark reviewed:', error);
      this.showToast('Failed to mark reviewed', 'error');
    }
  }

  async promoteToProject(id) {
    try {
      const result = await db.promoteToProject(id);
      await this.updateCounts();
      this.showToast(`Created project: ${result.project.name}`, 'success');
      this.navigateTo('projects');
    } catch (error) {
      console.error('Failed to promote to project:', error);
      this.showToast('Failed to promote to project', 'error');
    }
  }

  // =====================
  // Weekly Review
  // =====================

  reviewStep = 1;
  reviewStats = {
    inboxCleared: 0,
    actionsReviewed: 0,
    actionsCompleted: 0,
    actionsAdded: 0,
    stalledProjectsFixed: 0,
    waitingFollowedUp: 0,
    somedayPromoted: 0,
    mindSweepCaptures: 0
  };
  reviewStartTime = null;

  async startWeeklyReview() {
    this.reviewStep = 1;
    this.reviewStats = {
      inboxCleared: 0,
      actionsReviewed: 0,
      actionsCompleted: 0,
      actionsAdded: 0,
      stalledProjectsFixed: 0,
      waitingFollowedUp: 0,
      somedayPromoted: 0,
      mindSweepCaptures: 0
    };
    this.reviewStartTime = Date.now();

    // Bind review navigation buttons
    this.bindReviewButtons();

    // Render first step
    await this.renderReviewStep();
  }

  bindReviewButtons() {
    const backBtn = document.getElementById('reviewBackBtn');
    const skipBtn = document.getElementById('reviewSkipBtn');
    const nextBtn = document.getElementById('reviewNextBtn');

    if (backBtn) {
      backBtn.onclick = () => this.previousReviewStep();
    }
    if (skipBtn) {
      skipBtn.onclick = () => this.nextReviewStep();
    }
    if (nextBtn) {
      nextBtn.onclick = () => this.nextReviewStep();
    }
  }

  updateReviewProgress() {
    const totalSteps = 7;
    const progress = (this.reviewStep / totalSteps) * 100;

    const currentStepEl = document.getElementById('reviewCurrentStep');
    const totalStepsEl = document.getElementById('reviewTotalSteps');
    const progressFillEl = document.getElementById('reviewProgressFill');

    if (currentStepEl) currentStepEl.textContent = this.reviewStep;
    if (totalStepsEl) totalStepsEl.textContent = totalSteps;
    if (progressFillEl) progressFillEl.style.width = `${progress}%`;

    // Update buttons
    const backBtn = document.getElementById('reviewBackBtn');
    const skipBtn = document.getElementById('reviewSkipBtn');
    const nextBtn = document.getElementById('reviewNextBtn');

    if (backBtn) backBtn.style.display = this.reviewStep > 1 ? 'inline-flex' : 'none';
    if (nextBtn) nextBtn.textContent = this.reviewStep === 7 ? 'Finish' : 'Continue';
  }

  async nextReviewStep() {
    if (this.reviewStep < 7) {
      this.reviewStep++;
      await this.renderReviewStep();
    } else {
      await this.completeReview();
    }
  }

  async previousReviewStep() {
    if (this.reviewStep > 1) {
      this.reviewStep--;
      await this.renderReviewStep();
    }
  }

  async renderReviewStep() {
    this.updateReviewProgress();
    const container = document.getElementById('reviewContent');

    switch (this.reviewStep) {
      case 1:
        await this.renderReviewInbox(container);
        break;
      case 2:
        await this.renderReviewActions(container);
        break;
      case 3:
        await this.renderReviewProjects(container);
        break;
      case 4:
        await this.renderReviewWaiting(container);
        break;
      case 5:
        await this.renderReviewSomeday(container);
        break;
      case 6:
        await this.renderReviewCalendar(container);
        break;
      case 7:
        await this.renderReviewMindSweep(container);
        break;
    }

    // Update stats display
    this.updateReviewStats();
  }

  updateReviewStats() {
    const statsEl = document.getElementById('reviewStats');
    if (!statsEl) return;

    const stats = [];
    if (this.reviewStats.inboxCleared > 0) stats.push(`Inbox: ${this.reviewStats.inboxCleared} cleared`);
    if (this.reviewStats.actionsCompleted > 0) stats.push(`Actions: ${this.reviewStats.actionsCompleted} completed`);
    if (this.reviewStats.mindSweepCaptures > 0) stats.push(`Captured: ${this.reviewStats.mindSweepCaptures}`);

    statsEl.textContent = stats.join(' • ');
  }

  async renderReviewInbox(container) {
    const items = await db.getInboxItems();

    if (items.length === 0) {
      container.innerHTML = `
        <div class="review-step">
          <div class="review-step-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
              <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
            </svg>
            Clear Your Inbox
          </div>
          <div class="review-empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <h3>Inbox Zero!</h3>
            <p>Your inbox is empty. Great job staying on top of things!</p>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="review-step">
        <div class="review-step-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
            <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
          </svg>
          Clear Your Inbox
        </div>
        <p class="review-step-description">You have ${items.length} item${items.length !== 1 ? 's' : ''} in your inbox. Process each one before continuing.</p>

        <div class="review-items-list" id="reviewInboxList">
          ${items.slice(0, 5).map(item => `
            <div class="review-item" data-id="${item.id}">
              <div class="review-item-content">${this.escapeHtml(this.truncate(item.content, 100))}</div>
              <div class="review-item-meta">${this.formatDate(item.timestamp)}</div>
              <div class="review-item-actions">
                <button class="btn btn-primary btn-sm" onclick="app.reviewProcessInbox('${item.id}')">Process</button>
                <button class="btn btn-danger btn-sm" onclick="app.reviewDeleteInbox('${item.id}')">Delete</button>
              </div>
            </div>
          `).join('')}
          ${items.length > 5 ? `<p class="review-more-items">+ ${items.length - 5} more items...</p>` : ''}
        </div>
      </div>
    `;
  }

  async reviewProcessInbox(id) {
    await this.startProcessing(id);
  }

  async reviewDeleteInbox(id) {
    await db.moveToTrash(id, 'inbox');
    this.reviewStats.inboxCleared++;
    await this.renderReviewStep();
  }

  async renderReviewActions(container) {
    const actions = await db.getNextActions();

    container.innerHTML = `
      <div class="review-step">
        <div class="review-step-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          Review Next Actions
        </div>
        <p class="review-step-description">Review your ${actions.length} active action${actions.length !== 1 ? 's' : ''}. Are they still relevant?</p>

        <div class="review-items-list" id="reviewActionsList">
          ${actions.slice(0, 8).map(action => `
            <div class="review-item" data-id="${action.id}">
              <div class="review-item-content">${this.escapeHtml(action.action)}</div>
              <div class="review-item-meta">
                ${action.contexts?.map(c => `<span class="context-tag">${c}</span>`).join(' ') || ''}
                ${action.projectName ? `• ${action.projectName}` : ''}
              </div>
              <div class="review-item-actions">
                <button class="btn btn-secondary btn-sm" onclick="app.reviewKeepAction('${action.id}')">Keep</button>
                <button class="btn btn-success btn-sm" onclick="app.reviewCompleteAction('${action.id}')">Complete</button>
                <button class="btn btn-warning btn-sm" onclick="app.reviewSomedayAction('${action.id}')">Someday</button>
                <button class="btn btn-danger btn-sm" onclick="app.reviewDeleteAction('${action.id}')">Delete</button>
              </div>
            </div>
          `).join('')}
          ${actions.length > 8 ? `<p class="review-more-items">+ ${actions.length - 8} more actions...</p>` : ''}
        </div>

        <div class="review-quick-capture">
          <input type="text" id="reviewNewAction" placeholder="Add a new action...">
          <button class="btn btn-primary" onclick="app.reviewAddAction()">Add</button>
        </div>
      </div>
    `;

    // Handle enter key for quick add
    const input = document.getElementById('reviewNewAction');
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.reviewAddAction();
      });
    }
  }

  async reviewKeepAction(id) {
    this.reviewStats.actionsReviewed++;
    // Just mark as reviewed, move to next
    const item = document.querySelector(`.review-item[data-id="${id}"]`);
    if (item) {
      item.style.opacity = '0.5';
      item.querySelector('.review-item-actions').innerHTML = '<span style="color: var(--color-success);">✓ Kept</span>';
    }
  }

  async reviewCompleteAction(id) {
    await db.completeAction(id);
    this.reviewStats.actionsCompleted++;
    this.reviewStats.actionsReviewed++;
    await this.renderReviewStep();
  }

  async reviewSomedayAction(id) {
    const action = await db.get('nextActions', id);
    if (action) {
      await db.addToSomedayMaybe(action.action, action.contexts?.join(', ') || '');
      await db.delete('nextActions', id);
      this.reviewStats.actionsReviewed++;
      await this.renderReviewStep();
    }
  }

  async reviewDeleteAction(id) {
    await db.moveToTrash(id, 'nextActions');
    this.reviewStats.actionsReviewed++;
    await this.renderReviewStep();
  }

  async reviewAddAction() {
    const input = document.getElementById('reviewNewAction');
    if (!input || !input.value.trim()) return;

    await db.addNextAction({ action: input.value.trim(), contexts: [] });
    this.reviewStats.actionsAdded++;
    input.value = '';
    await this.renderReviewStep();
  }

  async renderReviewProjects(container) {
    const projects = await db.getProjects();
    const activeProjects = projects.filter(p => p.status === 'active');

    // Find stalled projects (no next action)
    const stalledProjects = [];
    const healthyProjects = [];

    for (const project of activeProjects) {
      const actions = await db.getProjectActions(project.id);
      const activeActions = actions.filter(a => !a.completed);
      if (activeActions.length === 0) {
        stalledProjects.push(project);
      } else {
        healthyProjects.push({ ...project, actionCount: activeActions.length });
      }
    }

    container.innerHTML = `
      <div class="review-step">
        <div class="review-step-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          Review Projects
        </div>
        <p class="review-step-description">Review your active projects. Stalled projects need a next action.</p>

        ${stalledProjects.length > 0 ? `
          <div class="review-section-header warning">⚠️ Stalled Projects (no next action)</div>
          <div class="review-items-list">
            ${stalledProjects.map(project => `
              <div class="review-item stalled" data-id="${project.id}">
                <span class="stalled-badge">No Next Action</span>
                <div class="review-item-content">${this.escapeHtml(project.name)}</div>
                <div class="review-item-meta">${project.description || 'No description'}</div>
                <div class="review-item-actions">
                  <button class="btn btn-primary btn-sm" onclick="app.reviewAddProjectAction('${project.id}')">Add Next Action</button>
                  <button class="btn btn-warning btn-sm" onclick="app.reviewHoldProject('${project.id}')">Put On Hold</button>
                  <button class="btn btn-success btn-sm" onclick="app.reviewCompleteProject('${project.id}')">Complete</button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${healthyProjects.length > 0 ? `
          <div class="review-section-header">Active Projects (${healthyProjects.length})</div>
          <div class="review-items-list">
            ${healthyProjects.slice(0, 5).map(project => `
              <div class="review-item" data-id="${project.id}">
                <div class="review-item-content">✅ ${this.escapeHtml(project.name)}</div>
                <div class="review-item-meta">${project.actionCount} next action${project.actionCount !== 1 ? 's' : ''}</div>
                <div class="review-item-actions">
                  <button class="btn btn-secondary btn-sm" onclick="app.showProjectDetail('${project.id}')">Review</button>
                  <button class="btn btn-primary btn-sm" onclick="app.reviewAddProjectAction('${project.id}')">Add Action</button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${activeProjects.length === 0 ? `
          <div class="review-empty-state">
            <p>No active projects to review.</p>
          </div>
        ` : ''}
      </div>
    `;
  }

  async reviewAddProjectAction(projectId) {
    const action = prompt('Enter next action for this project:');
    if (action && action.trim()) {
      await db.addNextAction({
        action: action.trim(),
        contexts: [],
        projectId: projectId
      });
      this.reviewStats.stalledProjectsFixed++;
      this.reviewStats.actionsAdded++;
      await this.renderReviewStep();
      this.showToast('Action added', 'success');
    }
  }

  async reviewHoldProject(id) {
    await db.update('projects', id, { status: 'on-hold' });
    this.reviewStats.stalledProjectsFixed++;
    await this.renderReviewStep();
    this.showToast('Project put on hold', 'success');
  }

  async reviewCompleteProject(id) {
    await db.completeProject(id);
    this.reviewStats.stalledProjectsFixed++;
    await this.renderReviewStep();
    this.showToast('Project completed', 'success');
  }

  async renderReviewWaiting(container) {
    const waitingItems = await db.getWaitingFor();

    container.innerHTML = `
      <div class="review-step">
        <div class="review-step-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          Review Waiting For
        </div>
        <p class="review-step-description">Review items you're waiting on from others. Follow up on overdue items.</p>

        ${waitingItems.length === 0 ? `
          <div class="review-empty-state">
            <p>No waiting for items to review.</p>
          </div>
        ` : `
          <div class="review-items-list">
            ${waitingItems.map(item => {
              const age = Math.floor((Date.now() - new Date(item.delegatedDate || item.createdDate).getTime()) / (1000 * 60 * 60 * 24));
              const isOverdue = age > 7;
              return `
                <div class="review-item ${isOverdue ? 'stalled' : ''}" data-id="${item.id}">
                  ${isOverdue ? '<span class="stalled-badge">Overdue</span>' : ''}
                  <div class="review-item-content">${this.escapeHtml(item.item || item.action)}</div>
                  <div class="review-item-meta">
                    Waiting on: ${item.delegatedTo || item.person || 'Unknown'} • ${age} days
                  </div>
                  <div class="review-item-actions">
                    <button class="btn btn-primary btn-sm" onclick="app.reviewFollowUp('${item.id}')">Follow Up</button>
                    <button class="btn btn-secondary btn-sm" onclick="app.reviewStillWaiting('${item.id}')">Still Waiting</button>
                    <button class="btn btn-success btn-sm" onclick="app.reviewCompleteWaiting('${item.id}')">Complete</button>
                    <button class="btn btn-danger btn-sm" onclick="app.reviewDeleteWaiting('${item.id}')">Delete</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}

        <div class="review-quick-capture">
          <input type="text" id="reviewNewWaiting" placeholder="Anyone else you're waiting on?">
          <button class="btn btn-primary" onclick="app.reviewAddWaiting()">Add</button>
        </div>
      </div>
    `;
  }

  async reviewFollowUp(id) {
    const item = await db.get('waitingFor', id);
    if (item) {
      await db.addNextAction({
        action: `Follow up with ${item.delegatedTo || item.person || 'them'} about: ${item.item || item.action}`,
        contexts: ['@email', '@phone']
      });
      this.reviewStats.waitingFollowedUp++;
      this.reviewStats.actionsAdded++;
      this.showToast('Follow-up action created', 'success');
    }
  }

  async reviewStillWaiting(id) {
    // Just mark as reviewed
    const item = document.querySelector(`.review-item[data-id="${id}"]`);
    if (item) {
      item.style.opacity = '0.5';
      item.querySelector('.review-item-actions').innerHTML = '<span style="color: var(--color-text-muted);">✓ Still waiting</span>';
    }
  }

  async reviewCompleteWaiting(id) {
    await db.completeWaitingFor(id);
    this.reviewStats.waitingFollowedUp++;
    await this.renderReviewStep();
  }

  async reviewDeleteWaiting(id) {
    await db.moveToTrash(id, 'waitingFor');
    await this.renderReviewStep();
  }

  async reviewAddWaiting() {
    const input = document.getElementById('reviewNewWaiting');
    if (!input || !input.value.trim()) return;

    const person = prompt('Who are you waiting on?');
    if (person) {
      await db.addWaitingFor(input.value.trim(), person);
      input.value = '';
      await this.renderReviewStep();
    }
  }

  async renderReviewSomeday(container) {
    const items = await db.getSomedayMaybeItems();

    container.innerHTML = `
      <div class="review-step">
        <div class="review-step-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          Review Someday/Maybe
        </div>
        <p class="review-step-description">Any of these ideas ready to become projects or actions?</p>

        ${items.length === 0 ? `
          <div class="review-empty-state">
            <p>No someday/maybe items to review.</p>
          </div>
        ` : `
          <div class="review-items-list">
            ${items.slice(0, 10).map(item => `
              <div class="review-item" data-id="${item.id}">
                <div class="review-item-content">${this.escapeHtml(item.item)}</div>
                <div class="review-item-meta">${item.notes || ''}</div>
                <div class="review-item-actions">
                  <button class="btn btn-primary btn-sm" onclick="app.reviewPromoteToProject('${item.id}')">Make Project</button>
                  <button class="btn btn-secondary btn-sm" onclick="app.reviewPromoteToAction('${item.id}')">Make Action</button>
                  <button class="btn btn-secondary btn-sm" onclick="app.reviewKeepSomeday('${item.id}')">Keep</button>
                  <button class="btn btn-danger btn-sm" onclick="app.reviewDeleteSomeday('${item.id}')">Delete</button>
                </div>
              </div>
            `).join('')}
          </div>
        `}

        <div class="review-quick-capture">
          <input type="text" id="reviewNewSomeday" placeholder="Any new ideas to capture?">
          <button class="btn btn-primary" onclick="app.reviewAddSomeday()">Add</button>
        </div>
      </div>
    `;
  }

  async reviewPromoteToProject(id) {
    const item = await db.get('somedayMaybe', id);
    if (item) {
      await db.addProject(item.item, '', 'personal');
      await db.delete('somedayMaybe', id);
      this.reviewStats.somedayPromoted++;
      await this.renderReviewStep();
      this.showToast('Promoted to project', 'success');
    }
  }

  async reviewPromoteToAction(id) {
    const item = await db.get('somedayMaybe', id);
    if (item) {
      await db.addNextAction({ action: item.item, contexts: [] });
      await db.delete('somedayMaybe', id);
      this.reviewStats.somedayPromoted++;
      this.reviewStats.actionsAdded++;
      await this.renderReviewStep();
      this.showToast('Promoted to action', 'success');
    }
  }

  async reviewKeepSomeday(id) {
    const item = document.querySelector(`.review-item[data-id="${id}"]`);
    if (item) {
      item.style.opacity = '0.5';
      item.querySelector('.review-item-actions').innerHTML = '<span style="color: var(--color-text-muted);">✓ Keeping</span>';
    }
  }

  async reviewDeleteSomeday(id) {
    await db.delete('somedayMaybe', id);
    await this.renderReviewStep();
  }

  async reviewAddSomeday() {
    const input = document.getElementById('reviewNewSomeday');
    if (!input || !input.value.trim()) return;

    await db.addToSomedayMaybe(input.value.trim(), '');
    input.value = '';
    await this.renderReviewStep();
  }

  async renderReviewCalendar(container) {
    // Get actions with due dates in next 2 weeks
    const actions = await db.getNextActions();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const twoWeeksFromNow = new Date(today);
    twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);

    const upcomingActions = actions.filter(a => {
      if (!a.dueDate) return false;
      const due = new Date(a.dueDate);
      return due <= twoWeeksFromNow;
    }).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    // Get Google Calendar events if connected
    let calendarEvents = [];
    const showCalendar = typeof googleIntegration !== 'undefined' &&
      googleIntegration.calendarConnected &&
      googleIntegration.calendarSettings.showInWeeklyReview;

    if (showCalendar) {
      try {
        calendarEvents = await googleIntegration.getUpcomingEvents(14);
      } catch (error) {
        console.error('Error fetching calendar events for review:', error);
      }
    }

    // Group events by week
    const thisWeekEnd = new Date(today);
    thisWeekEnd.setDate(thisWeekEnd.getDate() + (7 - today.getDay()));
    const nextWeekEnd = new Date(thisWeekEnd);
    nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);

    const thisWeekEvents = calendarEvents.filter(e => new Date(e.start) < thisWeekEnd);
    const nextWeekEvents = calendarEvents.filter(e => new Date(e.start) >= thisWeekEnd && new Date(e.start) < nextWeekEnd);

    // Group by day for display
    const groupByDay = (events) => {
      const grouped = {};
      events.forEach(e => {
        const date = new Date(e.start);
        const dayKey = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        if (!grouped[dayKey]) grouped[dayKey] = [];
        grouped[dayKey].push(e);
      });
      return grouped;
    };

    const thisWeekByDay = groupByDay(thisWeekEvents);
    const nextWeekByDay = groupByDay(nextWeekEvents);

    container.innerHTML = `
      <div class="review-step">
        <div class="review-step-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          Review Calendar (Next 2 Weeks)
        </div>
        <p class="review-step-description">Review upcoming events, due dates, and deadlines.</p>

        ${showCalendar && calendarEvents.length > 0 ? `
          <div class="review-calendar-week">
            <div class="week-header">This Week</div>
            ${Object.keys(thisWeekByDay).length > 0 ? Object.entries(thisWeekByDay).map(([day, events]) => `
              <div class="review-calendar-day">
                <div class="day-label">${day}</div>
                <div class="day-events">
                  ${events.map(e => `
                    <span class="event-item ${e.isFocusTime ? 'focus' : ''}">
                      ${e.isAllDay ? '' : googleIntegration.formatTime(e.start) + ' '}
                      ${this.escapeHtml(e.title)}
                    </span>
                  `).join('')}
                </div>
              </div>
            `).join('') : '<div class="review-calendar-day"><div class="day-events">No events this week</div></div>'}
          </div>

          <div class="review-calendar-week">
            <div class="week-header">Next Week</div>
            ${Object.keys(nextWeekByDay).length > 0 ? Object.entries(nextWeekByDay).map(([day, events]) => `
              <div class="review-calendar-day">
                <div class="day-label">${day}</div>
                <div class="day-events">
                  ${events.map(e => `
                    <span class="event-item ${e.isFocusTime ? 'focus' : ''}">
                      ${e.isAllDay ? '' : googleIntegration.formatTime(e.start) + ' '}
                      ${this.escapeHtml(e.title)}
                    </span>
                  `).join('')}
                </div>
              </div>
            `).join('') : '<div class="review-calendar-day"><div class="day-events">No events next week</div></div>'}
          </div>
        ` : `
          <div class="review-empty-state small" style="margin-bottom: 16px;">
            <p>${showCalendar ? 'No calendar events in the next 2 weeks.' : 'Connect Google Calendar in Settings to see your schedule here.'}</p>
          </div>
        `}

        <h4 style="margin: 20px 0 12px; font-size: 0.9375rem;">GTD Deadlines</h4>
        ${upcomingActions.length === 0 ? `
          <div class="review-empty-state small">
            <p>No upcoming deadlines in the next 2 weeks.</p>
          </div>
        ` : `
          <div class="review-items-list">
            ${upcomingActions.map(action => {
              const dueDate = new Date(action.dueDate);
              const isOverdue = dueDate < new Date();
              return `
                <div class="review-item ${isOverdue ? 'stalled' : ''}" data-id="${action.id}">
                  ${isOverdue ? '<span class="stalled-badge">Overdue</span>' : ''}
                  <div class="review-item-content">${this.escapeHtml(action.action)}</div>
                  <div class="review-item-meta">
                    Due: ${dueDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </div>
                  <div class="review-item-actions">
                    ${showCalendar && googleIntegration.calendarSettings.enableFocusTime ? `
                      <button class="btn btn-secondary btn-sm" onclick="app.showBlockFocusTimeForAction('${action.id}')">Block Time</button>
                    ` : ''}
                    <button class="btn btn-secondary btn-sm" onclick="app.reviewReschedule('${action.id}')">Reschedule</button>
                    <button class="btn btn-success btn-sm" onclick="app.reviewCompleteAction('${action.id}')">Complete</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}

        <div class="review-quick-capture" style="margin-top: 16px;">
          <input type="text" id="reviewCalendarCapture" placeholder="Any prep needed for upcoming events?">
          <button class="btn btn-primary" onclick="app.reviewCalendarCapture()">Capture</button>
        </div>
      </div>
    `;

    // Handle enter key
    const input = document.getElementById('reviewCalendarCapture');
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.reviewCalendarCapture();
      });
    }
  }

  async reviewCalendarCapture() {
    const input = document.getElementById('reviewCalendarCapture');
    if (input && input.value.trim()) {
      await db.addToInbox(input.value.trim(), 'text');
      this.reviewStats.mindSweepCaptures++;
      input.value = '';
      this.showToast('Captured to inbox', 'success');
    }
  }

  async reviewReschedule(id) {
    const newDate = prompt('Enter new due date (YYYY-MM-DD):');
    if (newDate) {
      await db.update('nextActions', id, { dueDate: newDate });
      await this.renderReviewStep();
      this.showToast('Rescheduled', 'success');
    }
  }

  async renderReviewMindSweep(container) {
    container.innerHTML = `
      <div class="review-step">
        <div class="review-step-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 16v-4"></path>
            <path d="M12 8h.01"></path>
          </svg>
          Mind Sweep
        </div>
        <p class="review-step-description">Take a few minutes to capture anything else on your mind.</p>

        <div class="mind-sweep-prompts">
          <h4>Prompts to jog your memory:</h4>
          <ul>
            <li>Any calls you need to make?</li>
            <li>Emails you need to send?</li>
            <li>Things you promised someone?</li>
            <li>Errands to run?</li>
            <li>Projects at work?</li>
            <li>Home projects?</li>
            <li>Financial items?</li>
            <li>Health appointments?</li>
            <li>Family commitments?</li>
          </ul>
        </div>

        <div class="mind-sweep-capture">
          <textarea id="mindSweepInput" placeholder="Capture anything on your mind..."></textarea>
          <button class="btn btn-primary" onclick="app.captureMindSweep()" style="margin-top: 12px;">Capture to Inbox</button>
        </div>

        <p class="captures-count">Captures this session: <strong id="mindSweepCount">${this.reviewStats.mindSweepCaptures}</strong></p>
      </div>
    `;

    // Focus textarea
    setTimeout(() => {
      const textarea = document.getElementById('mindSweepInput');
      if (textarea) textarea.focus();
    }, 100);
  }

  async captureMindSweep() {
    const textarea = document.getElementById('mindSweepInput');
    if (!textarea || !textarea.value.trim()) return;

    await db.addToInbox(textarea.value.trim(), 'text');
    this.reviewStats.mindSweepCaptures++;
    textarea.value = '';

    document.getElementById('mindSweepCount').textContent = this.reviewStats.mindSweepCaptures;
    this.showToast('Captured to inbox', 'success');
  }

  async completeReview() {
    const duration = Math.round((Date.now() - this.reviewStartTime) / 60000);
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + 7);

    // Store review history
    const reviewRecord = {
      id: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      duration: duration,
      stats: { ...this.reviewStats }
    };

    // Save to db if method exists
    if (db.saveReviewHistory) {
      await db.saveReviewHistory(reviewRecord);
    }

    const container = document.getElementById('reviewContent');
    container.innerHTML = `
      <div class="review-complete">
        <div class="review-complete-icon">🎉</div>
        <h2>Weekly Review Complete!</h2>

        <div class="review-summary">
          <h4>Summary</h4>
          <div class="review-summary-item">
            <span class="review-summary-label">Inbox cleared</span>
            <span class="review-summary-value">${this.reviewStats.inboxCleared}</span>
          </div>
          <div class="review-summary-item">
            <span class="review-summary-label">Actions reviewed</span>
            <span class="review-summary-value">${this.reviewStats.actionsReviewed}</span>
          </div>
          <div class="review-summary-item">
            <span class="review-summary-label">Actions completed</span>
            <span class="review-summary-value">${this.reviewStats.actionsCompleted}</span>
          </div>
          <div class="review-summary-item">
            <span class="review-summary-label">Actions added</span>
            <span class="review-summary-value">${this.reviewStats.actionsAdded}</span>
          </div>
          <div class="review-summary-item">
            <span class="review-summary-label">Stalled projects fixed</span>
            <span class="review-summary-value">${this.reviewStats.stalledProjectsFixed}</span>
          </div>
          <div class="review-summary-item">
            <span class="review-summary-label">Waiting followed up</span>
            <span class="review-summary-value">${this.reviewStats.waitingFollowedUp}</span>
          </div>
          <div class="review-summary-item">
            <span class="review-summary-label">Someday promoted</span>
            <span class="review-summary-value">${this.reviewStats.somedayPromoted}</span>
          </div>
          <div class="review-summary-item">
            <span class="review-summary-label">Mind sweep captures</span>
            <span class="review-summary-value">${this.reviewStats.mindSweepCaptures}</span>
          </div>
        </div>

        <p class="review-time">Time spent: ${duration} minutes</p>
        <p class="review-next-date">Next review: ${nextReview.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>

        <button class="btn btn-primary" onclick="app.navigateTo('inbox')" style="margin-top: 24px;">Done</button>
      </div>
    `;

    // Hide footer buttons
    document.getElementById('reviewBackBtn').style.display = 'none';
    document.getElementById('reviewSkipBtn').style.display = 'none';
    document.getElementById('reviewNextBtn').style.display = 'none';
    document.getElementById('reviewStats').textContent = '';

    // Update progress to 100%
    document.getElementById('reviewProgressFill').style.width = '100%';
    document.getElementById('reviewCurrentStep').textContent = '✓';
  }

  async renderInboxView() {
    const container = document.getElementById('inboxList');
    if (!container) return;

    // Show loading state while fetching to prevent stale cache flash
    if (this.forceServerRefresh) {
      container.innerHTML = '<div class="loading-state"><p>Loading...</p></div>';
    }

    // Force server fetch on initial load to bypass Firestore cache
    let items = await db.getInboxItems(this.forceServerRefresh);

    // Cache inbox items for quick reference (avoids Firestore permission issues)
    this._inboxItemsCache = {};
    for (const item of items) {
      this._inboxItemsCache[item.id] = item;
    }

    // Apply sorting based on user preference
    const sortOrder = this.inboxSort || 'newest';
    items = this.sortInboxItems(items, sortOrder);

    // Update dropdown to match current sort
    const sortSelect = document.getElementById('inboxSortSelect');
    if (sortSelect) sortSelect.value = sortOrder;

    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M20 12V22H4V12M22 7H2L12 2L22 7ZM12 11V17M12 17L9 14M12 17L15 14"/>
          </svg>
          <h3>Inbox Zero!</h3>
          <p>Use the capture box above to add new items</p>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(item => `
      <div class="swipe-container" data-id="${item.id}">
        <div class="swipe-action swipe-action-left" onclick="app.deleteInboxItemWithUndo('${item.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          <span>Delete</span>
        </div>
        <div class="swipe-action swipe-action-right" onclick="app.startProcessing('${item.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <span>Process</span>
        </div>
        <div class="inbox-item swipe-content draggable"
             data-id="${item.id}"
             data-type="inbox"
             draggable="true"
             ondragstart="app.handleDragStart(event)"
             ondragend="app.handleDragEnd(event)">
          <div class="drag-handle">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <circle cx="9" cy="6" r="1.5"></circle>
              <circle cx="15" cy="6" r="1.5"></circle>
              <circle cx="9" cy="12" r="1.5"></circle>
              <circle cx="15" cy="12" r="1.5"></circle>
              <circle cx="9" cy="18" r="1.5"></circle>
              <circle cx="15" cy="18" r="1.5"></circle>
            </svg>
          </div>
          <div class="inbox-item-header">
            <div class="inbox-item-meta">
              <span class="type-badge ${item.type}">${item.type}</span>
              <span>${this.formatDate(item.timestamp)}</span>
            </div>
          </div>
          <div class="inbox-item-content">${this.escapeHtml(this.truncate(item.content, 200))}</div>
          ${item.attachment ? this.renderAttachmentPreview(item.attachment, item.id) : ''}
          <div class="inbox-item-actions">
            <button class="btn btn-primary" onclick="app.startProcessing('${item.id}')">Process</button>
            <button class="btn btn-secondary" onclick="app.quickSaveToReference('${item.id}')" title="Save directly to reference">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
              Reference
            </button>
            <button class="btn btn-secondary" onclick="app.quickDelegateFromInbox('${item.id}')" title="Add to Waiting For">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              Waiting For
            </button>
            <button class="btn btn-secondary btn-danger-subtle" onclick="app.deleteInboxItemWithUndo('${item.id}')" title="Move to Trash">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
              Trash
            </button>
            ${item.attachment ? `
              <button class="btn btn-secondary" onclick="app.viewFullAttachment('${item.id}')">View Full Size</button>
              <button class="btn btn-secondary" onclick="app.downloadAttachment('${item.id}')">Download</button>
            ` : ''}
          </div>
        </div>
      </div>
    `).join('');

    // Initialize swipe handlers on mobile
    if ('ontouchstart' in window) {
      this.initSwipeHandlers();
    }
  }

  sortInboxItems(items, sortOrder) {
    const sorted = [...items];
    switch (sortOrder) {
      case 'oldest':
        sorted.sort((a, b) => {
          const dateA = a._created || a.timestamp || 0;
          const dateB = b._created || b.timestamp || 0;
          return dateA - dateB;
        });
        break;
      case 'type':
        sorted.sort((a, b) => {
          const typeOrder = { voice: 0, photo: 1, text: 2 };
          const orderA = typeOrder[a.type] ?? 3;
          const orderB = typeOrder[b.type] ?? 3;
          if (orderA !== orderB) return orderA - orderB;
          // Secondary sort by date (newest first) within same type
          const dateA = a._created || a.timestamp || 0;
          const dateB = b._created || b.timestamp || 0;
          return dateB - dateA;
        });
        break;
      case 'newest':
      default:
        sorted.sort((a, b) => {
          const dateA = a._created || a.timestamp || 0;
          const dateB = b._created || b.timestamp || 0;
          return dateB - dateA;
        });
        break;
    }
    return sorted;
  }

  changeInboxSort(sortOrder) {
    this.inboxSort = sortOrder;
    // Save preference
    localStorage.setItem('inboxSort', sortOrder);
    // Re-render inbox
    this.renderInboxView();
  }

  // =====================
  // Swipe Gesture Handling
  // =====================

  initSwipeHandlers() {
    const containers = document.querySelectorAll('.swipe-container');
    containers.forEach(container => {
      const content = container.querySelector('.swipe-content');
      if (!content) return;

      // Skip if already initialized
      if (content.dataset.swipeInit) return;
      content.dataset.swipeInit = 'true';

      let startX = 0;
      let startY = 0;
      let currentX = 0;
      let isDragging = false;
      let isHorizontalSwipe = null;

      const handleTouchStart = (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        currentX = startX;
        isDragging = true;
        isHorizontalSwipe = null;
        content.style.transition = 'none';
      };

      const handleTouchMove = (e) => {
        if (!isDragging) return;

        currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const diffX = currentX - startX;
        const diffY = currentY - startY;

        // Determine if horizontal or vertical swipe on first significant movement
        if (isHorizontalSwipe === null && (Math.abs(diffX) > 10 || Math.abs(diffY) > 10)) {
          isHorizontalSwipe = Math.abs(diffX) > Math.abs(diffY);
        }

        // Only handle horizontal swipes
        if (!isHorizontalSwipe) return;

        // Prevent vertical scroll when swiping horizontally
        e.preventDefault();

        // Limit swipe distance
        const maxSwipe = 100;
        const limitedDiff = Math.max(-maxSwipe, Math.min(maxSwipe, diffX));

        content.style.transform = `translateX(${limitedDiff}px)`;

        // Show appropriate action
        if (diffX < -30) {
          container.classList.add('swiping-left');
          container.classList.remove('swiping-right');
        } else if (diffX > 30) {
          container.classList.add('swiping-right');
          container.classList.remove('swiping-left');
        } else {
          container.classList.remove('swiping-left', 'swiping-right');
        }
      };

      const handleTouchEnd = () => {
        if (!isDragging) return;
        isDragging = false;

        const diff = currentX - startX;
        content.style.transition = 'transform 0.3s ease';

        // Only trigger action if it was a horizontal swipe
        if (isHorizontalSwipe && diff < -80) {
          // Swipe left - delete
          const itemId = container.dataset.id;
          content.style.transform = 'translateX(-100%)';
          setTimeout(() => {
            this.deleteInboxItemWithUndo(itemId);
          }, 200);
        } else if (isHorizontalSwipe && diff > 80) {
          // Swipe right - process
          const itemId = container.dataset.id;
          content.style.transform = 'translateX(100%)';
          setTimeout(() => {
            this.startProcessing(itemId);
          }, 200);
        } else {
          // Reset position
          content.style.transform = 'translateX(0)';
        }

        container.classList.remove('swiping-left', 'swiping-right');
        startX = 0;
        startY = 0;
        currentX = 0;
        isHorizontalSwipe = null;
      };

      content.addEventListener('touchstart', handleTouchStart, { passive: true });
      content.addEventListener('touchmove', handleTouchMove, { passive: false });
      content.addEventListener('touchend', handleTouchEnd, { passive: true });
    });
  }

  async deleteInboxItemWithUndo(id) {
    try {
      // Get item data before deleting (for undo)
      const item = await db.get('inbox', id);

      // Move to trash
      await db.moveToTrash(id, 'inbox');
      await this.updateCounts();
      await this.renderInboxView();

      // Show undo toast
      this.showUndoToast('Item deleted', async () => {
        // Undo: restore from trash
        await db.restoreFromTrash(id);
        await this.updateCounts();
        await this.renderInboxView();
        this.showToast('Item restored', 'success');
      });

      // Haptic feedback if supported
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    } catch (error) {
      console.error('Failed to delete inbox item:', error);
      this.showToast('Failed to delete item', 'error');
    }
  }

  async quickSaveToReference(inboxId) {
    try {
      const item = await db.get('inbox', inboxId);
      if (!item) {
        this.showToast('Item not found', 'error');
        return;
      }

      // Show folder selection modal
      const folders = await db.getReferenceFolders();
      const folderOptions = folders.map(f =>
        `<option value="${f.id}">${f.icon || '📁'} ${this.escapeHtml(f.name)}</option>`
      ).join('');

      const modal = document.getElementById('modalOverlay');
      const content = document.getElementById('modalContent');
      modal.classList.add('active');

      content.innerHTML = `
        <div class="modal-header">
          <h3>Save to Reference</h3>
        </div>
        <div class="modal-body">
          <div class="processing-content">${this.escapeHtml(item.content)}</div>
          <div class="composer-field">
            <label>Select Folder</label>
            <select class="composer-input" id="quickRefFolder">
              <option value="">Unfiled</option>
              ${folderOptions}
            </select>
          </div>
          <div class="composer-field">
            <label>Tags (optional)</label>
            <input type="text" class="composer-input" id="quickRefTags" placeholder="tag1, tag2, tag3">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="app.confirmQuickSaveToReference('${inboxId}')">Save to Reference</button>
        </div>
      `;
    } catch (error) {
      console.error('Failed to load inbox item:', error);
      this.showToast('Failed to load item', 'error');
    }
  }

  async confirmQuickSaveToReference(inboxId) {
    try {
      const item = await db.get('inbox', inboxId);
      if (!item) {
        this.showToast('Item not found', 'error');
        return;
      }

      const folderId = document.getElementById('quickRefFolder').value || null;
      const tagsInput = document.getElementById('quickRefTags').value;
      const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];

      // Create title from content (truncate if too long)
      const title = (item.content || 'Untitled').substring(0, 100);
      const content = item.content || '';

      // addToReference expects: (title, content, folderId, tags, attachment)
      await db.addToReference(title, content, folderId, tags, item.attachment || null);

      // Delete from inbox
      await db.delete('inbox', inboxId);

      this.closeModal();
      await this.updateCounts();
      await this.renderInboxView();
      this.showToast('Saved to reference', 'success');
    } catch (error) {
      console.error('Failed to save to reference:', error);
      this.showToast('Failed to save to reference', 'error');
    }
  }

  showUndoToast(message, undoCallback) {
    // Remove any existing undo toast
    const existingToast = document.querySelector('.undo-toast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'undo-toast';
    toast.innerHTML = `
      <span>${message}</span>
      <button class="undo-btn">Undo</button>
    `;

    document.body.appendChild(toast);

    // Show toast
    setTimeout(() => toast.classList.add('show'), 10);

    // Handle undo click
    const undoBtn = toast.querySelector('.undo-btn');
    let undone = false;

    undoBtn.addEventListener('click', async () => {
      if (undone) return;
      undone = true;
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
      await undoCallback();
    });

    // Auto-hide after 5 seconds
    setTimeout(() => {
      if (!undone) {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }
    }, 5000);
  }

  async renderNextActionsView() {
    const container = document.getElementById('nextActionsList');
    if (!container) {
      console.error('nextActionsList container not found');
      return;
    }

    let availableActions, blockedActions;
    try {
      availableActions = await db.getAvailableActions();
      blockedActions = await db.getBlockedActions();
    } catch (error) {
      console.error('Failed to fetch actions:', error);
      container.innerHTML = `<div class="error-state"><p>Failed to load actions</p></div>`;
      return;
    }

    // Filter out completed actions from available
    const actions = (availableActions || []).filter(a => !a.completed);

    // Render filters using all available actions
    this.renderFilters(actions);

    const blocked = blockedActions || [];

    // Debug logging
    console.log('renderNextActionsView - actions:', actions.length, 'blocked:', blocked.length);
    if (actions.length > 0) {
      console.log('First action:', JSON.stringify(actions[0], null, 2));
    }

    if (actions.length === 0 && blocked.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9 11L12 14L22 4M21 12V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3H16"/>
          </svg>
          <h3>No Actions Yet</h3>
          <p>Process items from your inbox to create next actions</p>
        </div>
      `;
      return;
    }

    // Group available actions by context
    const grouped = {};
    for (const action of actions) {
      // Handle actions without contexts
      const contexts = action.contexts && Array.isArray(action.contexts) && action.contexts.length > 0
        ? action.contexts
        : ['@uncategorized'];

      for (const context of contexts) {
        if (this.activeFilter !== 'all' && context !== this.activeFilter) continue;

        if (!grouped[context]) {
          grouped[context] = [];
        }
        grouped[context].push(action);
      }
    }

    // Debug: log grouped results
    console.log('Grouped contexts:', Object.keys(grouped), 'activeFilter:', this.activeFilter);

    // Build available actions HTML
    let html = '';

    // Available Now section
    if (Object.keys(grouped).length > 0) {
      html += `
        <div class="actions-section available-now">
          <div class="section-header">
            <h3>Available Now</h3>
            <span class="section-count">${actions.length} action${actions.length !== 1 ? 's' : ''}</span>
          </div>
          ${Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([context, items]) => `
              <div class="context-section">
                <div class="context-header">
                  <span class="context-name">${context}</span>
                  <span class="context-count">${items.length} item${items.length !== 1 ? 's' : ''}</span>
                </div>
                <div class="action-list">
                  ${items.map(item => this.renderActionItem(item)).join('')}
                </div>
              </div>
            `).join('')}
        </div>
      `;
    } else if (this.activeFilter !== 'all') {
      html += `
        <div class="empty-state">
          <h3>No actions in ${this.activeFilter}</h3>
          <p>Try selecting a different context filter</p>
        </div>
      `;
    }

    // On Deck section (blocked actions) - only show if setting enabled
    if (blocked.length > 0 && this.settings.showOnDeck !== false) {
      const expanded = this._onDeckExpanded !== false; // Track UI expansion state
      html += `
        <div class="actions-section on-deck ${expanded ? '' : 'collapsed'}">
          <div class="section-header clickable" onclick="app.toggleOnDeck()">
            <div class="section-header-left">
              <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
              <h3>On Deck</h3>
              <span class="section-count">${blocked.length} waiting</span>
            </div>
            <span class="section-hint">Coming up next</span>
          </div>
          <div class="on-deck-content">
            ${blocked.map(action => this.renderBlockedActionItem(action)).join('')}
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  }

  toggleOnDeck() {
    this._onDeckExpanded = !this._onDeckExpanded;
    const onDeckSection = document.querySelector('.on-deck');
    if (onDeckSection) {
      onDeckSection.classList.toggle('collapsed', !this._onDeckExpanded);
    }
  }

  renderBlockedActionItem(item) {
    return `
      <div class="blocked-action-item" data-id="${item.id}">
        <div class="blocked-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <div class="blocked-content">
          <div class="blocked-action-text">${this.escapeHtml(item.action)}</div>
          <div class="blocked-waiting-on">
            <span class="waiting-label">Waiting on:</span>
            <span class="waiting-action">${this.escapeHtml(this.truncate(item.blockedByAction, 50))}</span>
          </div>
        </div>
      </div>
    `;
  }

  renderActionItem(item) {
    const priority = item.priority || 'medium';
    const priorityIcon = { high: '!', medium: '=', low: '-' };
    const dueDateInfo = this.getDueDateInfo(item.dueDate);
    const contexts = item.contexts || [];
    const driveAttachments = (item.attachments || []).filter(a => a.type === 'drive');

    // Determine context-aware action buttons
    const hasPhone = contexts.some(c => c.includes('@phone'));
    const hasEmail = contexts.some(c => c.includes('@email'));
    const hasText = contexts.some(c => c.includes('@text') || c.includes('@sms'));

    return `
      <div class="action-item draggable priority-${priority} ${dueDateInfo.class}"
           data-id="${item.id}"
           data-type="action"
           draggable="true"
           ondragstart="app.handleDragStart(event)"
           ondragend="app.handleDragEnd(event)">
        <div class="drag-handle">
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
            <circle cx="9" cy="6" r="1.5"></circle>
            <circle cx="15" cy="6" r="1.5"></circle>
            <circle cx="9" cy="12" r="1.5"></circle>
            <circle cx="15" cy="12" r="1.5"></circle>
            <circle cx="9" cy="18" r="1.5"></circle>
            <circle cx="15" cy="18" r="1.5"></circle>
          </svg>
        </div>
        <div class="priority-indicator ${priority}" title="${priority.charAt(0).toUpperCase() + priority.slice(1)} priority">
          ${priorityIcon[priority]}
        </div>
        <button class="complete-btn" onclick="app.completeAction('${item.id}')" title="Mark complete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 13L9 17L19 7"/>
          </svg>
        </button>
        <div class="action-content">
          <div class="action-text">${this.escapeHtml(item.action)}</div>
          <div class="action-meta">
            ${dueDateInfo.display ? `<span class="due-date-tag ${dueDateInfo.class}">${dueDateInfo.display}</span> · ` : ''}
            ${item.location ? `<span class="location-tag">📍 ${this.escapeHtml(item.location.name)}</span> · ` : ''}
            ${driveAttachments.length > 0 ? `<span class="attachment-count" title="${driveAttachments.length} Drive file(s)">📎${driveAttachments.length}</span> · ` : ''}
            Captured ${this.formatDate(item.originalTimestamp)}
          </div>
          ${driveAttachments.length > 0 ? `
            <div class="action-attachments">
              ${driveAttachments.map(att => `
                <a href="${att.webViewLink}" target="_blank" rel="noopener" class="attachment-link" title="${this.escapeHtml(att.name)}">
                  ${this.escapeHtml(att.name.length > 20 ? att.name.substring(0, 20) + '...' : att.name)}
                </a>
              `).join('')}
            </div>
          ` : ''}
          ${item.tags && item.tags.length > 0 ? `
            <div class="action-tags">
              ${item.tags.map(tag => `<span class="action-tag">${this.escapeHtml(tag)}</span>`).join('')}
            </div>
          ` : ''}
          ${contexts.length > 0 ? `
            <div class="action-contexts">
              ${contexts.map(ctx => `<span class="context-pill">${this.escapeHtml(ctx)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
        <div class="action-buttons context-aware">
          ${hasPhone ? `
            <button class="btn-icon call primary-action" onclick="app.initiateCall('${item.id}')" title="Call">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
              </svg>
            </button>
          ` : ''}
          ${hasEmail || !hasPhone ? `
            <button class="btn-icon email ${hasEmail ? 'primary-action' : ''}" onclick="app.composeEmail('${item.id}', 'action')" title="Email">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </button>
          ` : ''}
          ${hasText ? `
            <button class="btn-icon text primary-action" onclick="app.composeText('${item.id}')" title="Text">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>
          ` : ''}
          <button class="btn-icon" onclick="app.startPomodoro('${item.id}', '${(item.action || '').replace(/'/g, "\\'").replace(/"/g, '&quot;')}')" title="Start Pomodoro">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </button>
          <button class="btn-icon delegate" onclick="app.delegateExisting('${item.id}')" title="Delegate">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </button>
          <button class="btn-icon drive" onclick="app.linkDriveToAction('${item.id}')" title="Attach from Drive">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="#4285F4" d="M12 11L6 2H18L12 11Z"/>
              <path fill="#FBBC05" d="M6 2L0 12L6 22L12 11L6 2Z"/>
              <path fill="#34A853" d="M18 2L12 11L18 22L24 12L18 2Z"/>
              <path fill="#EA4335" d="M6 22H18L24 12H0L6 22Z"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  // Link Drive files to an action
  async linkDriveToAction(actionId) {
    try {
      const files = await this.showDrivePickerForReference();
      if (!files || files.length === 0) return;

      const action = await db.getNextAction(actionId);
      if (action) {
        // Initialize attachments array if needed
        if (!action.attachments) {
          action.attachments = [];
        }

        // Add new files to attachments
        for (const file of files) {
          // Check if already attached
          if (!action.attachments.some(a => a.fileId === file.fileId)) {
            action.attachments.push(file);
          }
        }

        await db.update('nextActions', actionId, action);
        await this.renderNextActionsView();
        this.showToast(`${files.length} file(s) attached from Drive`, 'success');
      }
    } catch (error) {
      console.error('Failed to attach Drive files:', error);
      this.showToast('Failed to attach files', 'error');
    }
  }

  // Initiate a phone call for an action
  async initiateCall(actionId) {
    const action = await db.getNextAction(actionId);
    if (!action) return;

    // Try to extract phone number from action text or show compose dialog
    this.showCallComposer(action);
  }

  showCallComposer(action) {
    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    content.innerHTML = `
      <div class="modal-header">
        <h3>Make Call</h3>
      </div>
      <div class="modal-body">
        <div class="composer-field">
          <label>Action</label>
          <div class="composer-preview">${this.escapeHtml(action.action)}</div>
        </div>
        <div class="composer-field">
          <label>Phone Number</label>
          <input type="tel" class="composer-input" id="callPhoneNumber" placeholder="Enter phone number...">
        </div>
        <div class="composer-field">
          <label>Notes (optional)</label>
          <textarea class="composer-textarea" id="callNotes" placeholder="What to discuss..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary call" onclick="app.makeCall()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
          </svg>
          Call
        </button>
      </div>
    `;

    document.getElementById('callPhoneNumber').focus();
  }

  makeCall() {
    const phone = document.getElementById('callPhoneNumber').value.trim();
    if (!phone) {
      this.showToast('Please enter a phone number', 'error');
      return;
    }

    // Open tel: link
    const cleanPhone = phone.replace(/[^\d+]/g, '');
    window.location.href = `tel:${cleanPhone}`;
    this.closeModal();
  }

  // Compose text message for an action
  async composeText(actionId) {
    const action = await db.getNextAction(actionId);
    if (!action) return;

    this.showTextComposer(action);
  }

  showTextComposer(action) {
    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    content.innerHTML = `
      <div class="modal-header">
        <h3>Send Text Message</h3>
      </div>
      <div class="modal-body">
        <div class="composer-field">
          <label>Action</label>
          <div class="composer-preview">${this.escapeHtml(action.action)}</div>
        </div>
        <div class="composer-field">
          <label>Phone Number</label>
          <input type="tel" class="composer-input" id="textPhoneNumber" placeholder="Enter phone number...">
        </div>
        <div class="composer-field">
          <label>Message</label>
          <textarea class="composer-textarea" id="textMessage" placeholder="Your message...">${this.escapeHtml(action.action)}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.sendText()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          Send Text
        </button>
      </div>
    `;

    document.getElementById('textPhoneNumber').focus();
  }

  sendText() {
    const phone = document.getElementById('textPhoneNumber').value.trim();
    const message = document.getElementById('textMessage').value.trim();

    if (!phone) {
      this.showToast('Please enter a phone number', 'error');
      return;
    }

    // Open sms: link
    const cleanPhone = phone.replace(/[^\d+]/g, '');
    const smsUrl = message ? `sms:${cleanPhone}?body=${encodeURIComponent(message)}` : `sms:${cleanPhone}`;
    window.location.href = smsUrl;
    this.closeModal();
  }

  getDueDateInfo(dueDate) {
    if (!dueDate) {
      return { display: null, class: '' };
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const due = new Date(dueDate + 'T00:00:00');
    const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      const daysOverdue = Math.abs(diffDays);
      return {
        display: `Overdue by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'}`,
        class: 'overdue'
      };
    } else if (diffDays === 0) {
      return { display: 'Due today', class: 'due-today' };
    } else if (diffDays === 1) {
      return { display: 'Due tomorrow', class: 'due-soon' };
    } else if (diffDays <= 7) {
      return { display: `Due in ${diffDays} days`, class: 'due-soon' };
    } else {
      return {
        display: `Due ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        class: ''
      };
    }
  }

  renderFilters(actions) {
    const container = document.getElementById('contextFilters');

    // Get unique contexts
    const contextSet = new Set();
    for (const action of actions) {
      const contexts = action.contexts && Array.isArray(action.contexts) ? action.contexts : [];
      for (const context of contexts) {
        contextSet.add(context);
      }
    }

    const contexts = Array.from(contextSet).sort();

    container.innerHTML = `
      <button class="filter-btn ${this.activeFilter === 'all' ? 'active' : ''}" onclick="app.setFilter('all')">
        All (${actions.length})
      </button>
      ${contexts.map(ctx => `
        <button class="filter-btn ${this.activeFilter === ctx ? 'active' : ''}" onclick="app.setFilter('${ctx}')">
          ${ctx}
        </button>
      `).join('')}
    `;
  }

  setFilter(filter) {
    this.activeFilter = filter;
    this.renderNextActionsView();
  }

  // =====================
  // Waiting For View
  // =====================
  async renderWaitingForView() {
    const container = document.getElementById('waitingList');
    if (!container) return;
    const grouped = await db.getWaitingForGroupedByPerson();
    const teamMembers = await db.getTeamMembers();

    // Create a map of team member colors
    const memberColors = {};
    for (const member of teamMembers) {
      memberColors[member.id] = member.color;
    }

    if (Object.keys(grouped).length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <h3>Nothing Pending</h3>
          <p>Delegate tasks during processing to track them here</p>
        </div>
      `;
      return;
    }

    // Calculate stats
    let totalItems = 0;
    let overdueCount = 0;
    for (const group of Object.values(grouped)) {
      totalItems += group.items.length;
      overdueCount += group.items.filter(i => i.isOverdue).length;
    }

    // Render header stats
    const statsHtml = `
      <div class="stats-bar">
        <div class="stat-item">
          <span>Total:</span>
          <span class="stat-value">${totalItems}</span>
        </div>
        ${overdueCount > 0 ? `
          <div class="stat-item">
            <span>Overdue:</span>
            <span class="stat-value overdue">${overdueCount}</span>
          </div>
        ` : ''}
      </div>
    `;

    // Render sections by person
    const sectionsHtml = Object.entries(grouped)
      .sort(([, a], [, b]) => {
        // Sort by overdue count descending
        const aOverdue = a.items.filter(i => i.isOverdue).length;
        const bOverdue = b.items.filter(i => i.isOverdue).length;
        return bOverdue - aOverdue;
      })
      .map(([personId, group]) => {
        const color = memberColors[personId] || '#6b7280';
        const overdueInGroup = group.items.filter(i => i.isOverdue).length;

        return `
          <div class="waiting-section">
            <div class="waiting-header">
              <div class="waiting-person">
                <div class="waiting-person-avatar" style="background-color: ${color}">
                  ${group.personName.charAt(0).toUpperCase()}
                </div>
                <span class="waiting-person-name-large">${this.escapeHtml(group.personName)}</span>
              </div>
              <div class="waiting-stats">
                <span class="waiting-stat">${group.items.length} item${group.items.length !== 1 ? 's' : ''}</span>
                ${overdueInGroup > 0 ? `<span class="waiting-stat overdue">${overdueInGroup} overdue</span>` : ''}
              </div>
            </div>
            <div class="waiting-list">
              ${group.items.map(item => this.renderWaitingItem(item)).join('')}
            </div>
          </div>
        `;
      }).join('');

    container.innerHTML = statsHtml + sectionsHtml;
  }

  renderWaitingItem(item) {
    const statusClass = item.status === 'red' ? 'overdue' : item.status === 'yellow' ? 'warning' : 'ok';
    const followUpCount = item.followUpCount || 0;
    const hasReply = item.hasReply || false;
    const hasEmailTracking = item.emailThreadId ? true : false;

    return `
      <div class="waiting-item ${statusClass} draggable"
           data-id="${item.id}"
           data-type="waiting"
           draggable="true"
           ondragstart="app.handleDragStart(event)"
           ondragend="app.handleDragEnd(event)">
        <div class="drag-handle">
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
            <circle cx="9" cy="6" r="1.5"></circle>
            <circle cx="15" cy="6" r="1.5"></circle>
            <circle cx="9" cy="12" r="1.5"></circle>
            <circle cx="15" cy="12" r="1.5"></circle>
            <circle cx="9" cy="18" r="1.5"></circle>
            <circle cx="15" cy="18" r="1.5"></circle>
          </svg>
        </div>
        <div class="waiting-status-indicator ${item.status}"></div>
        <div class="waiting-content">
          <div class="waiting-action-text">
            ${this.escapeHtml(item.action)}
            ${hasReply ? `
              <span class="reply-indicator" title="Reply received from ${this.escapeHtml(item.replyFrom || '')}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9 17 4 12 9 7"></polyline>
                  <path d="M20 18v-2a4 4 0 0 0-4-4H4"></path>
                </svg>
                Reply received
              </span>
            ` : ''}
            ${hasEmailTracking && !hasReply ? `
              <span class="email-tracking-indicator" title="Email tracking enabled">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              </span>
            ` : ''}
          </div>
          <div class="waiting-meta">
            <span class="waiting-meta-item">Delegated ${this.formatDate(item.delegatedDate)} (${item.daysSinceDelegated}d ago)</span>
            <span class="waiting-meta-item">via ${item.delegationMethod || 'unknown'}</span>
          </div>
          ${hasReply && item.replySnippet ? `
            <div class="waiting-reply-preview">
              <strong>Reply:</strong> ${this.escapeHtml(item.replySnippet.substring(0, 100))}${item.replySnippet.length > 100 ? '...' : ''}
            </div>
          ` : ''}
          ${followUpCount > 0 ? `
            <div class="waiting-followups">
              Followed up ${followUpCount}x ${item.lastFollowUp ? `(last: ${this.formatDate(item.lastFollowUp)})` : ''}
            </div>
          ` : ''}
        </div>
        <div class="waiting-buttons">
          <button class="btn-icon email" onclick="app.followUp('${item.id}', 'email')" title="Follow up via email">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </button>
          <button class="btn-icon call" onclick="app.followUp('${item.id}', 'call')" title="Call">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </button>
          <button class="btn btn-success" style="padding: 6px 12px; font-size: 0.75rem;" onclick="app.completeWaitingFor('${item.id}')">
            Done
          </button>
        </div>
      </div>
    `;
  }

  async renderReferenceView() {
    const container = document.getElementById('referenceList');
    if (!container) return;
    const allItems = await db.getReferenceItems();
    const folders = await db.getReferenceFolders();

    // Render folder sidebar
    await this.renderFolderTree(folders, allItems);

    // Filter items by current folder
    let items = allItems;
    if (this.currentFolder === 'unfiled') {
      items = allItems.filter(item => !item.folderId);
    } else if (this.currentFolder !== 'all') {
      items = allItems.filter(item => item.folderId === this.currentFolder);
    }

    // Apply search filter
    if (this.searchQuery) {
      items = items.filter(item =>
        item.content.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        item.tags.some(tag => tag.toLowerCase().includes(this.searchQuery.toLowerCase()))
      );
    }

    // Update current folder header
    this.updateFolderHeader(folders);

    // Update counts
    const allRefCount = document.getElementById('allRefCount');
    const unfiledCount = document.getElementById('unfiledCount');
    if (allRefCount) allRefCount.textContent = allItems.length;
    if (unfiledCount) unfiledCount.textContent = allItems.filter(i => !i.folderId).length;

    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M19 11H5M19 11C20.1046 11 21 11.8954 21 13V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V13C3 11.8954 3.89543 11 5 11M19 11V9C19 7.89543 18.1046 7 17 7M5 11V9C5 7.89543 5.89543 7 7 7M7 7V5C7 3.89543 7.89543 3 9 3H15C16.1046 3 17 3.89543 17 5V7M7 7H17"/>
          </svg>
          <h3>${this.searchQuery ? 'No Results Found' : 'No References Yet'}</h3>
          <p>${this.searchQuery ? 'Try a different search term' : 'Save reference material when processing inbox items'}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map((item, index) => {
      const folder = item.folderId ? folders.find(f => f.id === item.folderId) : null;
      const driveAttachments = (item.attachments || []).filter(a => a.type === 'drive');
      const localAttachments = (item.attachments || []).filter(a => a.type !== 'drive');
      return `
        <div class="reference-item" data-id="${item.id}" data-index="${index}"
             draggable="true"
             ondragstart="app.handleRefDragStart(event, '${item.id}')"
             ondragend="app.handleRefDragEnd(event)"
             ondragover="app.handleRefDragOver(event)"
             ondrop="app.handleRefDrop(event, '${item.id}')"
             ondragleave="app.handleRefDragLeave(event)">
          <div class="drag-handle" title="Drag to reorder or move to folder">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <circle cx="9" cy="6" r="1.5"></circle>
              <circle cx="15" cy="6" r="1.5"></circle>
              <circle cx="9" cy="12" r="1.5"></circle>
              <circle cx="15" cy="12" r="1.5"></circle>
              <circle cx="9" cy="18" r="1.5"></circle>
              <circle cx="15" cy="18" r="1.5"></circle>
            </svg>
          </div>
          <div class="reference-item-header">
            <div class="reference-item-meta">
              ${this.formatDate(item.addedDate || item.originalTimestamp)}
              ${folder ? `<span class="folder-badge">${folder.icon || '📁'} ${this.escapeHtml(folder.name)}</span>` : ''}
              ${localAttachments.length > 0 ? `<span class="attachment-count-badge">📎 ${localAttachments.length}</span>` : ''}
            </div>
          </div>
          <div class="reference-item-content">${this.escapeHtml(item.content)}</div>
          ${localAttachments.length > 0 ? `
            <div class="reference-attachments">
              ${localAttachments.map(att => {
                const isImage = att.type && att.type.startsWith('image/');
                const src = att.url || att.data;
                return isImage
                  ? `<div class="reference-attachment" onclick="app.viewReferenceAttachment('${item.id}', '${att.name}')">
                       <img src="${src}" alt="${this.escapeHtml(att.name)}">
                     </div>`
                  : `<div class="reference-attachment file-type" onclick="app.viewReferenceAttachment('${item.id}', '${att.name}')" title="${this.escapeHtml(att.name)}">
                       ${att.type === 'application/pdf' ? '📄' : '📎'}
                     </div>`;
              }).join('')}
            </div>
          ` : ''}
          ${driveAttachments.length > 0 ? `
            <div class="reference-item-attachments">
              ${driveAttachments.map(att => `
                <div class="drive-attachment">
                  <div class="drive-attachment-icon">
                    ${att.iconUrl ? `<img src="${att.iconUrl}" alt="">` : `
                      <svg viewBox="0 0 24 24" width="20" height="20">
                        <path fill="#4285F4" d="M12 11L6 2H18L12 11Z"/>
                        <path fill="#FBBC05" d="M6 2L0 12L6 22L12 11L6 2Z"/>
                        <path fill="#34A853" d="M18 2L12 11L18 22L24 12L18 2Z"/>
                        <path fill="#EA4335" d="M6 22H18L24 12H0L6 22Z"/>
                      </svg>
                    `}
                  </div>
                  <div class="drive-attachment-name">
                    <a href="${att.webViewLink}" target="_blank" rel="noopener">${this.escapeHtml(att.name)}</a>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : ''}
          ${item.tags.length > 0 ? `
            <div class="reference-item-tags">
              ${item.tags.map(tag => `<span class="reference-tag">${this.escapeHtml(tag)}</span>`).join('')}
            </div>
          ` : ''}
          <div class="reference-item-actions">
            <button class="btn-small" onclick="app.editReference('${item.id}')" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              Edit
            </button>
            <button class="btn-small" onclick="app.linkDriveToReference('${item.id}')" title="Link from Drive">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
              </svg>
              Drive
            </button>
            <button class="btn-small" onclick="app.moveReferenceToFolder('${item.id}')">Move</button>
            <button class="btn-small delete-btn" onclick="app.deleteReference('${item.id}')">Delete</button>
          </div>
        </div>
      `;
    }).join('');
  }

  async renderFolderTree(folders, items) {
    const treeContainer = document.getElementById('folderTree');
    if (!treeContainer) return;

    // Group folders by category (parent folders)
    const rootFolders = folders.filter(f => !f.parentId);

    // Count items per folder
    const folderCounts = {};
    for (const item of items) {
      if (item.folderId) {
        folderCounts[item.folderId] = (folderCounts[item.folderId] || 0) + 1;
      }
    }

    // Recursive function to render folder and its children
    const renderFolderWithChildren = (folder, depth = 0) => {
      const children = folders.filter(f => f.parentId === folder.id);
      const count = folderCounts[folder.id] || 0;
      const hasChildren = children.length > 0;
      const indent = depth > 0 ? `style="padding-left: ${depth * 16}px"` : '';

      let html = `
        <div class="folder-item ${this.currentFolder === folder.id ? 'active' : ''}" data-folder="${folder.id}"
             draggable="true"
             onclick="app.selectFolder('${folder.id}')"
             ondragstart="app.handleFolderDragStart(event, '${folder.id}')"
             ondragend="app.handleFolderDragEnd(event)"
             ondragover="app.handleFolderDragOver(event, '${folder.id}')"
             ondragleave="app.handleFolderDragLeave(event)"
             ondrop="app.handleFolderDropOnFolder(event, '${folder.id}')"
             ${indent}>
          <span class="folder-drag-handle">
            <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
              <circle cx="9" cy="6" r="1.5"></circle>
              <circle cx="15" cy="6" r="1.5"></circle>
              <circle cx="9" cy="12" r="1.5"></circle>
              <circle cx="15" cy="12" r="1.5"></circle>
              <circle cx="9" cy="18" r="1.5"></circle>
              <circle cx="15" cy="18" r="1.5"></circle>
            </svg>
          </span>
          <span class="folder-icon">${folder.icon || '📁'}</span>
          <span class="folder-name">${this.escapeHtml(folder.name)}</span>
          <span class="folder-count">${count}</span>
          <div class="folder-actions" onclick="event.stopPropagation()">
            <button class="folder-action-btn" onclick="app.editFolder('${folder.id}')" title="Edit folder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="folder-action-btn delete" onclick="app.deleteFolder('${folder.id}')" title="Delete folder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </div>
      `;

      // Recursively render children
      for (const child of children) {
        html += renderFolderWithChildren(child, depth + 1);
      }

      return html;
    };

    let html = '';

    for (const root of rootFolders) {
      const children = folders.filter(f => f.parentId === root.id);
      const rootCount = folderCounts[root.id] || 0;
      const hasChildren = children.length > 0;

      html += `
        <div class="folder-group" data-group="${root.id}">
          <div class="folder-group-header" onclick="app.toggleFolderGroup('${root.id}')">
            <svg class="folder-group-toggle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
            <span>${root.icon || '📁'} ${this.escapeHtml(root.name)}</span>
          </div>
          <div class="folder-children">
      `;

      // Root folder itself (clickable)
      html += `
        <div class="folder-item ${this.currentFolder === root.id ? 'active' : ''}" data-folder="${root.id}"
             onclick="app.selectFolder('${root.id}')"
             ondragover="app.handleNavDragOver(event)"
             ondragleave="app.handleNavDragLeave(event)"
             ondrop="app.handleFolderDrop(event, '${root.id}')">
          <span class="folder-icon">${root.icon || '📁'}</span>
          <span class="folder-name">All ${this.escapeHtml(root.name)}</span>
          <span class="folder-count">${rootCount}</span>
        </div>
      `;

      // Child folders (recursive)
      for (const child of children) {
        html += renderFolderWithChildren(child, 1);
      }

      html += `
          </div>
        </div>
      `;
    }

    treeContainer.innerHTML = html;

    // Update static folder items (All, Unfiled)
    document.querySelectorAll('.folder-sidebar > .folder-item').forEach(item => {
      item.classList.toggle('active', item.dataset.folder === this.currentFolder);
      item.onclick = () => this.selectFolder(item.dataset.folder);
    });

    // Setup add folder button
    const addFolderBtn = document.getElementById('addFolderBtn');
    if (addFolderBtn) {
      addFolderBtn.onclick = () => this.showAddFolderModal();
    }
  }

  updateFolderHeader(folders) {
    const headerEl = document.getElementById('currentFolderName');
    if (!headerEl) return;

    if (this.currentFolder === 'all') {
      headerEl.textContent = 'All Items';
    } else if (this.currentFolder === 'unfiled') {
      headerEl.textContent = 'Unfiled';
    } else {
      const folder = folders.find(f => f.id === this.currentFolder);
      headerEl.innerHTML = folder ? `${folder.icon || '📁'} ${this.escapeHtml(folder.name)}` : 'All Items';
    }
  }

  async editFolder(folderId) {
    const folders = await db.getReferenceFolders();
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;

    const parentOptions = folders
      .filter(f => f.id !== folderId && f.parentId !== folderId)
      .map(f => `<option value="${f.id}" ${folder.parentId === f.id ? 'selected' : ''}>${f.icon || '📁'} ${this.escapeHtml(f.name)}</option>`)
      .join('');

    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    content.innerHTML = `
      <div class="modal-header">
        <h3>Edit Folder</h3>
      </div>
      <div class="modal-body">
        <div class="composer-field">
          <label>Folder Name</label>
          <input type="text" class="composer-input" id="editFolderName" value="${this.escapeHtml(folder.name)}" required>
        </div>
        <div class="composer-field">
          <label>Icon (emoji)</label>
          <input type="text" class="composer-input" id="editFolderIcon" value="${folder.icon || '📁'}" maxlength="2">
        </div>
        <div class="composer-field">
          <label>Parent Folder (optional)</label>
          <select class="composer-input" id="editFolderParent">
            <option value="">No parent (top level)</option>
            ${parentOptions}
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.saveFolderEdit('${folderId}')">Save Changes</button>
      </div>
    `;

    document.getElementById('editFolderName').focus();
  }

  async saveFolderEdit(folderId) {
    const name = document.getElementById('editFolderName').value.trim();
    const icon = document.getElementById('editFolderIcon').value.trim() || '📁';
    const parentId = document.getElementById('editFolderParent').value || null;

    if (!name) {
      this.showToast('Folder name is required', 'error');
      return;
    }

    try {
      await db.update('folders', folderId, { name, icon, parentId });
      this.closeModal();
      await this.renderReferenceView();
      this.showToast('Folder updated', 'success');
    } catch (error) {
      console.error('Failed to update folder:', error);
      this.showToast('Failed to update folder', 'error');
    }
  }

  async deleteFolder(folderId) {
    const folders = await db.getReferenceFolders();
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;

    const items = await db.getReferenceItems();
    const itemsInFolder = items.filter(i => i.folderId === folderId);
    const childFolders = folders.filter(f => f.parentId === folderId);

    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    let warningText = '';
    if (itemsInFolder.length > 0 || childFolders.length > 0) {
      warningText = `<p class="warning-text">This folder contains ${itemsInFolder.length} item(s)${childFolders.length > 0 ? ` and ${childFolders.length} subfolder(s)` : ''}. Items will be moved to Unfiled.</p>`;
    }

    content.innerHTML = `
      <div class="modal-header">
        <h3>Delete Folder</h3>
      </div>
      <div class="modal-body">
        <p>Are you sure you want to delete <strong>${folder.icon || '📁'} ${this.escapeHtml(folder.name)}</strong>?</p>
        ${warningText}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-danger" onclick="app.confirmDeleteFolder('${folderId}')">Delete Folder</button>
      </div>
    `;
  }

  async confirmDeleteFolder(folderId) {
    try {
      // Move items in this folder to unfiled
      const items = await db.getReferenceItems();
      const itemsInFolder = items.filter(i => i.folderId === folderId);
      for (const item of itemsInFolder) {
        await db.update('reference', item.id, { folderId: null });
      }

      // Move child folders to top level
      const folders = await db.getReferenceFolders();
      const childFolders = folders.filter(f => f.parentId === folderId);
      for (const child of childFolders) {
        await db.update('folders', child.id, { parentId: null });
      }

      // Delete the folder
      await db.delete('folders', folderId);

      // Reset to all if viewing deleted folder
      if (this.currentFolder === folderId) {
        this.currentFolder = 'all';
      }

      this.closeModal();
      await this.renderReferenceView();
      this.showToast('Folder deleted', 'success');
    } catch (error) {
      console.error('Failed to delete folder:', error);
      this.showToast('Failed to delete folder', 'error');
    }
  }

  selectFolder(folderId) {
    this.currentFolder = folderId;
    this.renderReferenceView();
  }

  // =====================
  // Reference Drag & Drop
  // =====================

  handleRefDragStart(event, itemId) {
    event.dataTransfer.setData('text/plain', itemId);
    event.dataTransfer.setData('application/x-reference-item', itemId);
    event.dataTransfer.effectAllowed = 'move';
    event.target.classList.add('dragging');
    this.draggedRefId = itemId;

    // Show drop zones
    document.querySelectorAll('.folder-item').forEach(el => {
      el.classList.add('drop-target');
    });
    document.querySelector('[data-view="trash"]')?.classList.add('drop-target', 'drop-danger');
    document.querySelector('[data-view="archive"]')?.classList.add('drop-target');
  }

  handleRefDragEnd(event) {
    event.target.classList.remove('dragging');
    this.draggedRefId = null;

    // Hide drop zones
    document.querySelectorAll('.drop-target').forEach(el => {
      el.classList.remove('drop-target', 'drop-danger', 'drag-over');
    });
    document.querySelectorAll('.reference-item').forEach(el => {
      el.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
    });
  }

  handleRefDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    const item = event.target.closest('.reference-item');
    if (item && item.dataset.id !== this.draggedRefId) {
      // Remove previous indicators
      document.querySelectorAll('.reference-item').forEach(el => {
        el.classList.remove('drag-over-top', 'drag-over-bottom');
      });

      // Determine if dropping above or below
      const rect = item.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (event.clientY < midY) {
        item.classList.add('drag-over-top');
      } else {
        item.classList.add('drag-over-bottom');
      }
    }
  }

  handleRefDragLeave(event) {
    const item = event.target.closest('.reference-item');
    if (item) {
      item.classList.remove('drag-over-top', 'drag-over-bottom');
    }
  }

  async handleRefDrop(event, targetId) {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData('application/x-reference-item');

    if (!sourceId || sourceId === targetId) return;

    try {
      // Get current items and their order
      const items = await db.getReferenceItems();
      const sourceItem = items.find(i => i.id === sourceId);
      const targetItem = items.find(i => i.id === targetId);

      if (!sourceItem || !targetItem) return;

      // Determine position (above or below target)
      const targetEl = event.target.closest('.reference-item');
      const rect = targetEl.getBoundingClientRect();
      const insertBefore = event.clientY < rect.top + rect.height / 2;

      // Get items in current folder for reordering
      let folderItems = items.filter(i => i.folderId === this.currentFolder || (this.currentFolder === 'all') || (this.currentFolder === 'unfiled' && !i.folderId));

      // Assign order values
      let order = 0;
      for (const item of folderItems) {
        if (item.id === sourceId) continue; // Skip source, will insert at target position

        if (item.id === targetId) {
          if (insertBefore) {
            // Insert source before target
            await db.updateReference(sourceId, { sortOrder: order++ });
            await db.updateReference(targetId, { sortOrder: order++ });
          } else {
            // Insert source after target
            await db.updateReference(targetId, { sortOrder: order++ });
            await db.updateReference(sourceId, { sortOrder: order++ });
          }
        } else {
          await db.updateReference(item.id, { sortOrder: order++ });
        }
      }

      this.renderReferenceView();
    } catch (error) {
      console.error('Failed to reorder reference items:', error);
    }
  }

  async handleFolderDrop(event, folderId) {
    event.preventDefault();
    event.stopPropagation();

    const itemId = event.dataTransfer.getData('application/x-reference-item');
    if (!itemId) return;

    try {
      await db.updateReference(itemId, { folderId: folderId || null });
      this.showToast('Item moved to folder', 'success');
      this.renderReferenceView();
    } catch (error) {
      console.error('Failed to move to folder:', error);
      this.showToast('Failed to move item', 'error');
    }
  }

  async handleTrashDrop(event) {
    event.preventDefault();
    event.stopPropagation();

    const itemId = event.dataTransfer.getData('application/x-reference-item');
    if (!itemId) return;

    try {
      await db.moveToTrash(itemId, 'reference');
      this.showToast('Moved to trash', 'success');
      this.renderReferenceView();
      this.updateSidebarCounts();
    } catch (error) {
      console.error('Failed to move to trash:', error);
      this.showToast('Failed to move to trash', 'error');
    }
  }

  async handleArchiveDrop(event) {
    event.preventDefault();
    event.stopPropagation();

    const itemId = event.dataTransfer.getData('application/x-reference-item');
    if (!itemId) return;

    try {
      const item = await db.getReferenceItem(itemId);
      if (item) {
        await db.addToArchive(item, 'reference');
        await db.deleteReference(itemId);
        this.showToast('Moved to archive', 'success');
        this.renderReferenceView();
        this.updateSidebarCounts();
      }
    } catch (error) {
      console.error('Failed to archive:', error);
      this.showToast('Failed to archive item', 'error');
    }
  }

  handleNavDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    event.currentTarget.classList.add('drag-over');
  }

  handleNavDragLeave(event) {
    event.currentTarget.classList.remove('drag-over');
  }

  // =====================
  // Folder Drag & Drop
  // =====================

  handleFolderDragStart(event, folderId) {
    event.stopPropagation();
    event.dataTransfer.setData('text/plain', folderId);
    event.dataTransfer.setData('application/x-folder-item', folderId);
    event.dataTransfer.effectAllowed = 'move';
    event.target.classList.add('dragging');
    this.draggedFolderId = folderId;

    // Show drop zones on other folders and trash
    setTimeout(() => {
      document.querySelectorAll('.folder-item').forEach(el => {
        if (el.dataset.folder !== folderId) {
          el.classList.add('folder-drop-target');
        }
      });
      document.querySelector('[data-view="trash"]')?.classList.add('drop-target', 'drop-danger');
    }, 0);
  }

  handleFolderDragEnd(event) {
    event.target.classList.remove('dragging');
    this.draggedFolderId = null;

    // Hide drop zones
    document.querySelectorAll('.folder-drop-target, .drop-target').forEach(el => {
      el.classList.remove('folder-drop-target', 'drop-target', 'drop-danger', 'drag-over', 'drag-over-top', 'drag-over-bottom');
    });
  }

  handleFolderDragOver(event, targetFolderId) {
    event.preventDefault();
    event.stopPropagation();

    // Check if dragging a folder or a reference item
    const isFolder = event.dataTransfer.types.includes('application/x-folder-item');
    const isRefItem = event.dataTransfer.types.includes('application/x-reference-item');

    if (isFolder && targetFolderId !== this.draggedFolderId) {
      event.dataTransfer.dropEffect = 'move';
      const item = event.target.closest('.folder-item');
      if (item) {
        // Remove previous indicators
        document.querySelectorAll('.folder-item').forEach(el => {
          el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over');
        });

        // Determine if dropping above, below, or inside
        const rect = item.getBoundingClientRect();
        const y = event.clientY - rect.top;
        const height = rect.height;

        if (y < height * 0.25) {
          item.classList.add('drag-over-top');
        } else if (y > height * 0.75) {
          item.classList.add('drag-over-bottom');
        } else {
          item.classList.add('drag-over'); // Drop inside (make child)
        }
      }
    } else if (isRefItem) {
      event.dataTransfer.dropEffect = 'move';
      event.currentTarget.classList.add('drag-over');
    }
  }

  handleFolderDragLeave(event) {
    const item = event.target.closest('.folder-item');
    if (item) {
      item.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
    }
  }

  async handleFolderDropOnFolder(event, targetFolderId) {
    event.preventDefault();
    event.stopPropagation();

    // Check if dropping a folder or a reference item
    const sourceFolderId = event.dataTransfer.getData('application/x-folder-item');
    const sourceRefId = event.dataTransfer.getData('application/x-reference-item');

    if (sourceRefId) {
      // Dropping a reference item onto a folder
      await this.handleFolderDrop(event, targetFolderId);
      return;
    }

    if (!sourceFolderId || sourceFolderId === targetFolderId) return;

    try {
      const folders = await db.getReferenceFolders();
      const sourceFolder = folders.find(f => f.id === sourceFolderId);
      const targetFolder = folders.find(f => f.id === targetFolderId);

      if (!sourceFolder || !targetFolder) return;

      // Prevent dropping a parent into its own child
      const isDescendant = (parentId, childId) => {
        const child = folders.find(f => f.id === childId);
        if (!child || !child.parentId) return false;
        if (child.parentId === parentId) return true;
        return isDescendant(parentId, child.parentId);
      };

      if (isDescendant(sourceFolderId, targetFolderId)) {
        this.showToast('Cannot move folder into its own subfolder', 'error');
        return;
      }

      // Determine drop position
      const targetEl = event.target.closest('.folder-item');
      const rect = targetEl.getBoundingClientRect();
      const y = event.clientY - rect.top;
      const height = rect.height;

      if (y < height * 0.25) {
        // Drop above - same parent, reorder before target
        await db.updateFolder(sourceFolderId, {
          parentId: targetFolder.parentId,
          order: (targetFolder.order || 0) - 0.5
        });
        this.showToast('Folder moved', 'success');
      } else if (y > height * 0.75) {
        // Drop below - same parent, reorder after target
        await db.updateFolder(sourceFolderId, {
          parentId: targetFolder.parentId,
          order: (targetFolder.order || 0) + 0.5
        });
        this.showToast('Folder moved', 'success');
      } else {
        // Drop inside - make it a child
        await db.updateFolder(sourceFolderId, {
          parentId: targetFolderId,
          order: Date.now()
        });
        this.showToast('Folder nested', 'success');
      }

      // Normalize order values
      await this.normalizeFolderOrder();
      await this.renderReferenceView();
    } catch (error) {
      console.error('Failed to move folder:', error);
      this.showToast('Failed to move folder', 'error');
    }
  }

  async normalizeFolderOrder() {
    try {
      const folders = await db.getReferenceFolders();

      // Group by parent
      const byParent = {};
      for (const folder of folders) {
        const key = folder.parentId || 'root';
        if (!byParent[key]) byParent[key] = [];
        byParent[key].push(folder);
      }

      // Sort each group and assign integer order values
      for (const key in byParent) {
        const group = byParent[key].sort((a, b) => (a.order || 0) - (b.order || 0));
        for (let i = 0; i < group.length; i++) {
          if (group[i].order !== i) {
            await db.updateFolder(group[i].id, { order: i });
          }
        }
      }
    } catch (error) {
      console.error('Failed to normalize folder order:', error);
    }
  }

  async handleFolderTrashDrop(event) {
    event.preventDefault();
    event.stopPropagation();

    const folderId = event.dataTransfer.getData('application/x-folder-item');
    if (!folderId) return;

    // Use existing delete folder flow (which handles items and subfolders)
    await this.deleteFolder(folderId);
  }

  toggleFolderGroup(groupId) {
    const group = document.querySelector(`.folder-group[data-group="${groupId}"]`);
    if (group) {
      group.classList.toggle('collapsed');
    }
  }

  async showAddFolderModal() {
    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    const icons = ['📁', '📂', '🏢', '💼', '🏠', '💪', '🎉', '✈️', '📊', '📋', '📝', '🎓', '⚖️', '🛒', '📈'];

    // Get existing folders to use as parent options
    const folders = await db.getReferenceFolders();
    const parentOptions = folders.map(f =>
      `<option value="${f.id}">${f.icon || '📁'} ${this.escapeHtml(f.name)}</option>`
    ).join('');

    content.innerHTML = `
      <div class="modal-header">
        <h3>Create New Folder</h3>
      </div>
      <div class="modal-body">
        <div class="folder-form">
          <div class="composer-field">
            <label>Folder Name *</label>
            <input type="text" class="composer-input" id="newFolderName" placeholder="e.g., Insurance Carriers">
          </div>
          <div class="composer-field">
            <label>Icon</label>
            <div class="folder-icon-picker" id="folderIconPicker">
              ${icons.map((icon, i) => `
                <div class="folder-icon-option ${i === 0 ? 'selected' : ''}" data-icon="${icon}">${icon}</div>
              `).join('')}
            </div>
          </div>
          <div class="composer-field">
            <label>Parent Folder (optional)</label>
            <select class="composer-input" id="parentFolderSelect">
              <option value="">No parent (root folder)</option>
              ${parentOptions}
            </select>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.createFolder()">Create Folder</button>
      </div>
    `;

    // Icon picker functionality
    document.querySelectorAll('.folder-icon-option').forEach(option => {
      option.onclick = () => {
        document.querySelectorAll('.folder-icon-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
      };
    });

    document.getElementById('newFolderName').focus();
  }

  async createFolder() {
    const name = document.getElementById('newFolderName').value.trim();
    if (!name) {
      this.showToast('Folder name is required', 'error');
      return;
    }

    const selectedIcon = document.querySelector('.folder-icon-option.selected');
    const icon = selectedIcon ? selectedIcon.dataset.icon : '📁';
    const parentId = document.getElementById('parentFolderSelect').value || null;

    try {
      await db.createReferenceFolder({
        name,
        icon,
        parentId,
        category: parentId || 'personal'
      });

      this.closeModal();
      await this.renderReferenceView();
      this.showToast('Folder created!', 'success');
    } catch (error) {
      console.error('Failed to create folder:', error);
      this.showToast('Failed to create folder', 'error');
    }
  }

  async moveReferenceToFolder(referenceId) {
    const folders = await db.getReferenceFolders();
    const reference = await db.get('reference', referenceId);

    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    content.innerHTML = `
      <div class="modal-header">
        <h3>Move to Folder</h3>
      </div>
      <div class="modal-body">
        <div class="folder-select-list">
          <div class="folder-item ${!reference?.folderId ? 'active' : ''}" onclick="app.moveToFolder('${referenceId}', null)">
            <span class="folder-icon">📥</span>
            <span class="folder-name">Unfiled</span>
          </div>
          ${folders.filter(f => f.parentId).map(folder => `
            <div class="folder-item ${reference?.folderId === folder.id ? 'active' : ''}" onclick="app.moveToFolder('${referenceId}', '${folder.id}')">
              <span class="folder-icon">${folder.icon || '📁'}</span>
              <span class="folder-name">${this.escapeHtml(folder.name)}</span>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
      </div>
    `;
  }

  async moveToFolder(referenceId, folderId) {
    try {
      const reference = await db.get('reference', referenceId);
      if (reference) {
        reference.folderId = folderId;
        await db.update('reference', reference);
        this.closeModal();
        await this.renderReferenceView();
        this.showToast('Reference moved!', 'success');
      }
    } catch (error) {
      console.error('Failed to move reference:', error);
      this.showToast('Failed to move reference', 'error');
    }
  }

  async linkDriveToReference(referenceId) {
    try {
      const files = await this.showDrivePickerForReference();
      if (!files || files.length === 0) return;

      const reference = await db.get('reference', referenceId);
      if (reference) {
        // Initialize attachments array if needed
        if (!reference.attachments) {
          reference.attachments = [];
        }

        // Add new files to attachments
        for (const file of files) {
          // Check if already attached
          if (!reference.attachments.some(a => a.fileId === file.fileId)) {
            reference.attachments.push(file);
          }
        }

        await db.update('reference', referenceId, reference);
        await this.renderReferenceView();
        this.showToast(`${files.length} file(s) linked from Drive`, 'success');
      }
    } catch (error) {
      console.error('Failed to link Drive files:', error);
      this.showToast('Failed to link files', 'error');
    }
  }

  async renderSettingsView() {
    // Set version number
    const versionEl = document.getElementById('appVersion');
    if (versionEl) {
      versionEl.textContent = `v${APP_VERSION}`;
    }

    // Render cloud team collaboration (if authenticated)
    await this.renderTeamCollaboration();

    // Render Google integrations
    await this.renderGoogleIntegrations();

    // Render team members
    await this.renderTeamMemberList();

    // Render contacts
    await this.renderContactList();

    // Render context list
    const contextList = document.getElementById('contextList');
    if (contextList) {
      contextList.innerHTML = this.contexts.map(ctx => `
        <div class="context-item">
          <span class="context-name">${this.escapeHtml(ctx)}</span>
          <button class="btn-icon delete" onclick="app.removeContext('${this.escapeHtml(ctx)}')" title="Remove context">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `).join('');
    }

    // Apply settings values to UI
    this.applySettingsToUI();

    // Render AI settings
    this.renderAISettings();
  }

  // =====================
  // AI Settings
  // =====================

  async renderAISettings() {
    if (!window.aiService) return;

    // Load current API key (masked)
    const apiKey = await window.aiService.getApiKey();
    const input = document.getElementById('aiApiKeyInput');
    if (input && apiKey) {
      input.value = '••••••••••••' + apiKey.slice(-8);
    }

    // Load feature settings
    const settings = window.aiService.aiSettings;
    const processingSuggestions = document.getElementById('aiProcessingSuggestions');
    const chatbot = document.getElementById('aiChatbot');
    const processingModel = document.getElementById('aiProcessingModel');
    const chatModel = document.getElementById('aiChatModel');

    if (processingSuggestions) processingSuggestions.checked = settings.enableProcessingSuggestions;
    if (chatbot) chatbot.checked = settings.enableChatbot;
    if (processingModel) processingModel.value = settings.processingModel || 'fast';
    if (chatModel) chatModel.value = settings.chatModel || 'balanced';

    // Load usage stats
    const stats = window.aiService.getAIUsageStats();
    const callsEl = document.getElementById('aiUsageCalls');
    const costEl = document.getElementById('aiUsageCost');
    if (callsEl) callsEl.textContent = stats.totalCalls;
    if (costEl) costEl.textContent = '$' + stats.estimatedCost;

    // Render AI preferences
    await this.renderAIPreferences();
  }

  async saveAIApiKey() {
    const input = document.getElementById('aiApiKeyInput');
    if (!input) return;

    const apiKey = input.value.trim();

    // Don't save if it's the masked value
    if (apiKey.startsWith('••••')) {
      this.showToast('Enter a new API key to save', 'info');
      return;
    }

    if (!apiKey) {
      this.showToast('Please enter an API key', 'error');
      return;
    }

    if (!apiKey.startsWith('sk-ant-')) {
      this.showToast('Invalid API key format. Should start with sk-ant-', 'error');
      return;
    }

    try {
      await window.aiService.saveApiKey(apiKey);
      input.value = '••••••••••••' + apiKey.slice(-8);
      this.showToast('API key saved!', 'success');
    } catch (error) {
      this.showToast('Failed to save API key: ' + error.message, 'error');
    }
  }

  async testAIConnection() {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = 'Testing...';
    btn.disabled = true;

    try {
      const result = await window.aiService.testApiConnection();
      if (result.success) {
        this.showToast('Connection successful!', 'success');
      } else {
        this.showToast('Connection failed: ' + result.error, 'error');
      }
    } catch (error) {
      this.showToast('Test failed: ' + error.message, 'error');
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }

  async updateAISetting(key, value) {
    if (!window.aiService) return;

    window.aiService.aiSettings[key] = value;
    await window.aiService.saveAISettings();
    this.showToast('Setting updated', 'success');
  }

  // =====================
  // AI Preferences UI
  // =====================

  async renderAIPreferences() {
    if (!window.aiService) return;

    const prefs = await window.aiService.getAIPreferences();

    // Render project mappings
    const projectList = document.getElementById('projectMappingsList');
    if (projectList) {
      const mappings = prefs.projectMappings || {};
      const entries = Object.entries(mappings);
      projectList.innerHTML = entries.length === 0 ? '' : entries.map(([keyword, project]) => `
        <div class="ai-pref-item">
          <div class="ai-pref-item-content">
            <span class="ai-pref-keyword">"${this.escapeHtml(keyword)}"</span>
            <span class="ai-pref-arrow">→</span>
            <span class="ai-pref-value">${this.escapeHtml(project)}</span>
          </div>
          <button class="ai-pref-delete" onclick="app.deleteProjectMapping('${this.escapeHtml(keyword)}')" title="Remove">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `).join('');
    }

    // Render context mappings
    const contextList = document.getElementById('contextMappingsList');
    if (contextList) {
      const mappings = prefs.contextMappings || {};
      const entries = Object.entries(mappings);
      contextList.innerHTML = entries.length === 0 ? '' : entries.map(([keyword, context]) => `
        <div class="ai-pref-item">
          <div class="ai-pref-item-content">
            <span class="ai-pref-keyword">"${this.escapeHtml(keyword)}"</span>
            <span class="ai-pref-arrow">→</span>
            <span class="ai-pref-value">@${this.escapeHtml(context)}</span>
          </div>
          <button class="ai-pref-delete" onclick="app.deleteContextMapping('${this.escapeHtml(keyword)}')" title="Remove">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `).join('');
    }

    // Render person aliases
    const aliasesList = document.getElementById('personAliasesList');
    if (aliasesList) {
      const aliases = prefs.personAliases || {};
      const entries = Object.entries(aliases);
      aliasesList.innerHTML = entries.length === 0 ? '' : entries.map(([nickname, fullName]) => `
        <div class="ai-pref-item">
          <div class="ai-pref-item-content">
            <span class="ai-pref-keyword">"${this.escapeHtml(nickname)}"</span>
            <span class="ai-pref-arrow">→</span>
            <span class="ai-pref-value">${this.escapeHtml(fullName)}</span>
          </div>
          <button class="ai-pref-delete" onclick="app.deletePersonAlias('${this.escapeHtml(nickname)}')" title="Remove">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `).join('');
    }

    // Render feedback stats
    await this.renderAIFeedbackStats();
  }

  async renderAIFeedbackStats() {
    if (!window.aiService) return;

    try {
      const stats = await window.aiService.getAIFeedbackStats();

      const acceptedEl = document.getElementById('aiFeedbackAccepted');
      const modifiedEl = document.getElementById('aiFeedbackModified');
      const rejectedEl = document.getElementById('aiFeedbackRejected');
      const accuracyEl = document.getElementById('aiFeedbackAccuracy');

      if (acceptedEl) acceptedEl.textContent = stats.accepted || 0;
      if (modifiedEl) modifiedEl.textContent = stats.modified || 0;
      if (rejectedEl) rejectedEl.textContent = stats.rejected || 0;
      if (accuracyEl) {
        const total = (stats.accepted || 0) + (stats.modified || 0) + (stats.rejected || 0);
        if (total > 0) {
          const accuracy = Math.round((stats.accepted / total) * 100);
          accuracyEl.textContent = accuracy + '%';
        } else {
          accuracyEl.textContent = '-';
        }
      }
    } catch (error) {
      console.error('Failed to load feedback stats:', error);
    }
  }

  showAddProjectMappingModal() {
    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    const projectOptions = this.projects.map(p =>
      `<option value="${this.escapeHtml(p.name)}">${this.escapeHtml(p.name)}</option>`
    ).join('');

    content.innerHTML = `
      <div class="modal-header">
        <h3>Add Project Keyword</h3>
      </div>
      <div class="modal-body">
        <div class="ai-pref-modal-field">
          <label>Keyword or phrase</label>
          <input type="text" id="projectKeyword" placeholder="e.g., water damage, Smith job">
          <p class="ai-pref-modal-hint">When you mention this, AI will suggest this project</p>
        </div>
        <div class="ai-pref-modal-field">
          <label>Maps to Project</label>
          <select id="projectValue">
            <option value="">Select a project...</option>
            ${projectOptions}
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.saveProjectMapping()">Add Mapping</button>
      </div>
    `;

    document.getElementById('projectKeyword').focus();
  }

  async saveProjectMapping() {
    const keyword = document.getElementById('projectKeyword').value.trim().toLowerCase();
    const project = document.getElementById('projectValue').value;

    if (!keyword || !project) {
      this.showToast('Please enter both keyword and project', 'error');
      return;
    }

    try {
      await window.aiService.addProjectMapping(keyword, project);
      this.closeModal();
      await this.renderAIPreferences();
      this.showToast('Project mapping added', 'success');
    } catch (error) {
      this.showToast('Failed to save mapping', 'error');
    }
  }

  async deleteProjectMapping(keyword) {
    const prefs = await window.aiService.getAIPreferences();
    delete prefs.projectMappings[keyword];
    await window.aiService.saveAIPreferences(prefs);
    await this.renderAIPreferences();
    this.showToast('Mapping removed', 'success');
  }

  showAddContextMappingModal() {
    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    const contextOptions = this.contexts.map(c =>
      `<option value="${this.escapeHtml(c)}">${this.escapeHtml(c)}</option>`
    ).join('');

    content.innerHTML = `
      <div class="modal-header">
        <h3>Add Context Keyword</h3>
      </div>
      <div class="modal-body">
        <div class="ai-pref-modal-field">
          <label>Keyword or phrase</label>
          <input type="text" id="contextKeyword" placeholder="e.g., call, email, buy">
          <p class="ai-pref-modal-hint">When you mention this, AI will suggest this context</p>
        </div>
        <div class="ai-pref-modal-field">
          <label>Maps to Context</label>
          <select id="contextValue">
            <option value="">Select a context...</option>
            ${contextOptions}
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.saveContextMapping()">Add Mapping</button>
      </div>
    `;

    document.getElementById('contextKeyword').focus();
  }

  async saveContextMapping() {
    const keyword = document.getElementById('contextKeyword').value.trim().toLowerCase();
    const context = document.getElementById('contextValue').value;

    if (!keyword || !context) {
      this.showToast('Please enter both keyword and context', 'error');
      return;
    }

    try {
      await window.aiService.addContextMapping(keyword, context);
      this.closeModal();
      await this.renderAIPreferences();
      this.showToast('Context mapping added', 'success');
    } catch (error) {
      this.showToast('Failed to save mapping', 'error');
    }
  }

  async deleteContextMapping(keyword) {
    const prefs = await window.aiService.getAIPreferences();
    delete prefs.contextMappings[keyword];
    await window.aiService.saveAIPreferences(prefs);
    await this.renderAIPreferences();
    this.showToast('Mapping removed', 'success');
  }

  showAddPersonAliasModal() {
    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    content.innerHTML = `
      <div class="modal-header">
        <h3>Add Person Nickname</h3>
      </div>
      <div class="modal-body">
        <div class="ai-pref-modal-field">
          <label>Nickname or short name</label>
          <input type="text" id="personNickname" placeholder="e.g., Bob, adjuster">
          <p class="ai-pref-modal-hint">How you refer to this person informally</p>
        </div>
        <div class="ai-pref-modal-field">
          <label>Full name</label>
          <input type="text" id="personFullName" placeholder="e.g., Robert Johnson">
          <p class="ai-pref-modal-hint">The name AI should use for @person tags</p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.savePersonAlias()">Add Nickname</button>
      </div>
    `;

    document.getElementById('personNickname').focus();
  }

  async savePersonAlias() {
    const nickname = document.getElementById('personNickname').value.trim().toLowerCase();
    const fullName = document.getElementById('personFullName').value.trim();

    if (!nickname || !fullName) {
      this.showToast('Please enter both nickname and full name', 'error');
      return;
    }

    try {
      await window.aiService.addPersonAlias(nickname, fullName);
      this.closeModal();
      await this.renderAIPreferences();
      this.showToast('Person nickname added', 'success');
    } catch (error) {
      this.showToast('Failed to save nickname', 'error');
    }
  }

  async deletePersonAlias(nickname) {
    const prefs = await window.aiService.getAIPreferences();
    delete prefs.personAliases[nickname];
    await window.aiService.saveAIPreferences(prefs);
    await this.renderAIPreferences();
    this.showToast('Nickname removed', 'success');
  }

  async showAIAnalyticsModal() {
    if (!window.aiService) return;

    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    // Show loading state
    content.innerHTML = `
      <div class="modal-header">
        <h3>AI Learning Analytics</h3>
      </div>
      <div class="modal-body">
        <div class="ai-analytics-loading">
          <div class="ai-loading-spinner"></div>
          <span>Loading analytics...</span>
        </div>
      </div>
    `;

    try {
      // Get feedback stats and recent corrections
      const stats = await window.aiService.getAIFeedbackStats();
      const corrections = await window.aiService.getRecentCorrections(20);
      const patterns = window.aiService.derivePatterns ? window.aiService.derivePatterns(corrections) : [];

      const total = (stats.accepted || 0) + (stats.modified || 0) + (stats.rejected || 0);
      const accuracy = total > 0 ? Math.round((stats.accepted / total) * 100) : 0;

      // Build analytics content
      let analyticsHtml = `
        <div class="modal-header">
          <h3>AI Learning Analytics</h3>
        </div>
        <div class="modal-body ai-analytics-body">
          <!-- Summary Stats -->
          <div class="ai-analytics-section">
            <h4>Overall Performance</h4>
            <div class="ai-analytics-grid">
              <div class="ai-analytics-card">
                <div class="ai-analytics-card-value">${total}</div>
                <div class="ai-analytics-card-label">Total Interactions</div>
              </div>
              <div class="ai-analytics-card accent">
                <div class="ai-analytics-card-value">${accuracy}%</div>
                <div class="ai-analytics-card-label">Accuracy Rate</div>
              </div>
              <div class="ai-analytics-card success">
                <div class="ai-analytics-card-value">${stats.accepted || 0}</div>
                <div class="ai-analytics-card-label">Accepted</div>
              </div>
              <div class="ai-analytics-card warning">
                <div class="ai-analytics-card-value">${stats.modified || 0}</div>
                <div class="ai-analytics-card-label">Modified</div>
              </div>
            </div>
          </div>
      `;

      // Learning patterns section
      if (patterns.length > 0) {
        analyticsHtml += `
          <div class="ai-analytics-section">
            <h4>Learned Patterns</h4>
            <div class="ai-analytics-patterns">
        `;
        for (const pattern of patterns.slice(0, 5)) {
          analyticsHtml += `
            <div class="ai-analytics-pattern">
              <span class="pattern-type">${this.escapeHtml(pattern.type || 'Pattern')}</span>
              <span class="pattern-desc">${this.escapeHtml(pattern.description || pattern.pattern || 'Learning from corrections')}</span>
            </div>
          `;
        }
        analyticsHtml += `</div></div>`;
      }

      // Recent corrections section
      if (corrections.length > 0) {
        analyticsHtml += `
          <div class="ai-analytics-section">
            <h4>Recent Corrections</h4>
            <div class="ai-analytics-corrections">
        `;
        for (const correction of corrections.slice(0, 5)) {
          const date = new Date(correction.timestamp).toLocaleDateString();
          analyticsHtml += `
            <div class="ai-analytics-correction">
              <div class="correction-header">
                <span class="correction-type">${this.escapeHtml(correction.feedbackType || correction.action || 'Correction')}</span>
                <span class="correction-date">${date}</span>
              </div>
              ${correction.correction ? `<div class="correction-text">"${this.escapeHtml(correction.correction.substring(0, 100))}${correction.correction.length > 100 ? '...' : ''}"</div>` : ''}
            </div>
          `;
        }
        analyticsHtml += `</div></div>`;
      } else {
        analyticsHtml += `
          <div class="ai-analytics-section">
            <div class="ai-analytics-empty">
              <p>No corrections recorded yet. As you use AI suggestions and provide feedback, the AI will learn your preferences.</p>
            </div>
          </div>
        `;
      }

      // Tips section
      analyticsHtml += `
          <div class="ai-analytics-section">
            <h4>Tips for Better Suggestions</h4>
            <ul class="ai-analytics-tips">
              <li>Use the feedback buttons to help the AI learn what works for you</li>
              <li>Add project keywords in Settings to help with project detection</li>
              <li>Add person nicknames so AI recognizes who you're talking about</li>
              <li>When modifying suggestions, your changes help train future suggestions</li>
            </ul>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="app.closeModal()">Close</button>
          ${corrections.length > 0 ? `<button class="btn btn-danger" onclick="app.clearAILearningData()">Clear Learning Data</button>` : ''}
        </div>
      `;

      content.innerHTML = analyticsHtml;
    } catch (error) {
      console.error('Failed to load AI analytics:', error);
      content.innerHTML = `
        <div class="modal-header">
          <h3>AI Learning Analytics</h3>
        </div>
        <div class="modal-body">
          <div class="ai-analytics-error">
            <p>Failed to load analytics data. Please try again.</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="app.closeModal()">Close</button>
        </div>
      `;
    }
  }

  async clearAILearningData() {
    if (!confirm('Are you sure you want to clear all AI learning data? This will reset the AI to its default state.')) {
      return;
    }

    try {
      // Clear feedback data from localStorage
      localStorage.removeItem('aiFeedback');

      // Clear from Firestore if authenticated
      if (db && typeof db.clear === 'function' && window.auth?.currentUser) {
        await db.clear('aiFeedback');
      }

      this.closeModal();
      await this.renderAIPreferences();
      this.showToast('AI learning data cleared', 'success');
    } catch (error) {
      console.error('Failed to clear AI learning data:', error);
      this.showToast('Failed to clear learning data', 'error');
    }
  }

  // =====================
  // Team Member Management
  // =====================

  async renderTeamMemberList() {
    const container = document.getElementById('teamMemberList');
    if (!container) return;

    const members = await db.getTeamMembers();

    if (members.length === 0) {
      container.innerHTML = `
        <div class="empty-state small">
          <p>No team members yet. Add people you delegate work to.</p>
        </div>
      `;
      return;
    }

    // Show clear all button if there are many duplicates
    const clearAllBtn = members.length > 5 ? `
      <div class="team-member-actions-bar">
        <span class="member-count">${members.length} team members</span>
        <button class="btn btn-sm btn-danger" onclick="app.clearAllTeamMembers()">Clear All</button>
      </div>
    ` : '';

    container.innerHTML = clearAllBtn + members.map(member => this.renderTeamMemberCard(member)).join('');
  }

  async clearAllTeamMembers() {
    if (!confirm('Are you sure you want to remove ALL team members? This cannot be undone.')) {
      return;
    }

    try {
      await db.clear('teamMembers');
      await this.renderTeamMemberList();
      this.showToast('All team members removed', 'success');
    } catch (error) {
      console.error('Failed to clear team members:', error);
      this.showToast('Failed to clear team members', 'error');
    }
  }

  renderTeamMemberCard(member) {
    const initials = member.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    return `
      <div class="team-member-card" data-id="${member.id}">
        <div class="team-member-avatar" style="background-color: ${member.color || '#6366f1'}">
          ${initials}
        </div>
        <div class="team-member-info">
          <div class="team-member-name">${this.escapeHtml(member.name)}</div>
          ${member.role ? `<div class="team-member-role">${this.escapeHtml(member.role)}</div>` : ''}
          <div class="team-member-contact">
            ${member.email ? `<span>${this.escapeHtml(member.email)}</span>` : ''}
            ${member.email && member.phone ? ' • ' : ''}
            ${member.phone ? `<span>${this.escapeHtml(member.phone)}</span>` : ''}
          </div>
          <div class="team-member-contexts">
            <span class="context-badge small">${member.contextId}</span>
            <span class="context-badge small waiting">${member.waitingContextId}</span>
          </div>
        </div>
        <div class="team-member-actions">
          <button class="btn-icon" onclick="app.showEditTeamMemberModal('${member.id}')" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="btn-icon delete" onclick="app.showDeleteTeamMemberModal('${member.id}')" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  showAddTeamMemberModal() {
    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    const roles = db.getTeamRoles ? db.getTeamRoles() : ['Project Manager', 'Technician', 'Office Staff', 'Estimator', 'Sales', 'Other'];

    content.innerHTML = `
      <div class="modal-header">
        <h3>Add Team Member</h3>
      </div>
      <div class="modal-body">
        <div class="composer-field">
          <label>Name *</label>
          <input type="text" class="composer-input" id="teamMemberName" placeholder="e.g., Diana Rodriguez">
        </div>
        <div class="composer-field">
          <label>Role</label>
          <select class="composer-input" id="teamMemberRole">
            <option value="">Select role...</option>
            ${roles.map(r => `<option value="${r}">${r}</option>`).join('')}
          </select>
        </div>
        <div class="composer-row">
          <div class="composer-field">
            <label>Email</label>
            <input type="email" class="composer-input" id="teamMemberEmail" placeholder="diana@company.com">
          </div>
          <div class="composer-field">
            <label>Phone</label>
            <input type="tel" class="composer-input" id="teamMemberPhone" placeholder="(555) 123-4567">
          </div>
        </div>
        <div class="composer-field">
          <label>Notes</label>
          <textarea class="composer-textarea" id="teamMemberNotes" placeholder="Any notes about this team member..."></textarea>
        </div>
        <div class="composer-field checkbox-field">
          <label class="checkbox-label">
            <input type="checkbox" id="sendWelcomeEmail" checked>
            <span>Send welcome email (requires email address)</span>
          </label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.saveTeamMember()">Add Team Member</button>
      </div>
    `;

    document.getElementById('teamMemberName').focus();
  }

  async showEditTeamMemberModal(id) {
    const member = await db.getTeamMember(id);
    if (!member) return;

    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    const roles = db.getTeamRoles ? db.getTeamRoles() : ['Project Manager', 'Technician', 'Office Staff', 'Estimator', 'Sales', 'Other'];

    content.innerHTML = `
      <div class="modal-header">
        <h3>Edit Team Member</h3>
      </div>
      <div class="modal-body">
        <div class="composer-field">
          <label>Name *</label>
          <input type="text" class="composer-input" id="teamMemberName" value="${this.escapeHtml(member.name)}">
        </div>
        <div class="composer-field">
          <label>Role</label>
          <select class="composer-input" id="teamMemberRole">
            <option value="">Select role...</option>
            ${roles.map(r => `<option value="${r}" ${member.role === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
        </div>
        <div class="composer-row">
          <div class="composer-field">
            <label>Email</label>
            <input type="email" class="composer-input" id="teamMemberEmail" value="${this.escapeHtml(member.email || '')}">
          </div>
          <div class="composer-field">
            <label>Phone</label>
            <input type="tel" class="composer-input" id="teamMemberPhone" value="${this.escapeHtml(member.phone || '')}">
          </div>
        </div>
        <div class="composer-field">
          <label>Notes</label>
          <textarea class="composer-textarea" id="teamMemberNotes">${this.escapeHtml(member.notes || '')}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.updateTeamMember('${id}')">Save Changes</button>
      </div>
    `;

    document.getElementById('teamMemberName').focus();
  }

  async saveTeamMember() {
    const name = document.getElementById('teamMemberName').value.trim();
    const role = document.getElementById('teamMemberRole').value;
    const email = document.getElementById('teamMemberEmail').value.trim();
    const phone = document.getElementById('teamMemberPhone').value.trim();
    const notes = document.getElementById('teamMemberNotes').value.trim();
    const sendWelcomeEmail = document.getElementById('sendWelcomeEmail')?.checked ?? true;

    if (!name) {
      this.showToast('Name is required', 'error');
      return;
    }

    try {
      await db.addTeamMember({ name, role, email, phone, notes });
      this.closeModal();
      await this.renderTeamMemberList();
      this.showToast('Team member added', 'success');

      // Send welcome email if requested and email exists
      if (sendWelcomeEmail && email) {
        this.sendTeamWelcomeEmail(name, email, role);
      }
    } catch (error) {
      console.error('Failed to add team member:', error);
      this.showToast('Failed to add team member', 'error');
    }
  }

  sendTeamWelcomeEmail(name, email, role) {
    const teamName = this.currentTeam?.name || '1-800 Packouts';
    const subject = `Welcome to ${teamName}!`;
    const body = `Hi ${name},

You've been added to the ${teamName} team${role ? ` as ${role}` : ''}.

You can access the GTD Capture app at: ${window.location.origin}

What is GTD Capture?
- A task and project management system based on Getting Things Done methodology
- You'll receive task assignments and can track your responsibilities
- Collaborate with the team on shared projects

If you have any questions, just reply to this email.

Welcome aboard!`;

    const mailtoUrl = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl, '_blank');
  }

  async updateTeamMember(id) {
    const name = document.getElementById('teamMemberName').value.trim();
    const role = document.getElementById('teamMemberRole').value;
    const email = document.getElementById('teamMemberEmail').value.trim();
    const phone = document.getElementById('teamMemberPhone').value.trim();
    const notes = document.getElementById('teamMemberNotes').value.trim();

    if (!name) {
      this.showToast('Name is required', 'error');
      return;
    }

    try {
      const member = await db.getTeamMember(id);
      await db.updateTeamMember({
        ...member,
        name,
        role,
        email,
        phone,
        notes
      });
      this.closeModal();
      await this.renderTeamMemberList();
      this.showToast('Team member updated', 'success');
    } catch (error) {
      console.error('Failed to update team member:', error);
      this.showToast('Failed to update team member', 'error');
    }
  }

  async showDeleteTeamMemberModal(id) {
    const member = await db.getTeamMember(id);
    if (!member) {
      this.showToast('Team member not found', 'error');
      return;
    }

    // Get counts of affected items (with error handling)
    let waitingItems = [];
    let actionsWithContext = [];

    try {
      waitingItems = await db.getWaitingForByPerson(member.name) || [];
    } catch (e) {
      console.log('Could not get waiting items:', e);
    }

    try {
      if (member.contextId) {
        actionsWithContext = await db.getActionsByContext(member.contextId) || [];
      }
    } catch (e) {
      console.log('Could not get actions by context:', e);
    }

    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    content.innerHTML = `
      <div class="modal-header">
        <h3>Delete Team Member</h3>
      </div>
      <div class="modal-body">
        <div class="delete-warning">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <h4>Are you sure you want to delete ${this.escapeHtml(member.name)}?</h4>
          ${waitingItems.length > 0 || actionsWithContext.length > 0 ? `
            <p class="warning-details">This will affect:</p>
            <ul class="warning-list">
              ${waitingItems.length > 0 ? `<li>${waitingItems.length} waiting for item(s) will be moved to @waiting</li>` : ''}
              ${actionsWithContext.length > 0 ? `<li>${actionsWithContext.length} action(s) will have their context removed</li>` : ''}
            </ul>
          ` : '<p>This action cannot be undone.</p>'}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-danger" onclick="app.deleteTeamMember('${id}')">Delete</button>
      </div>
    `;
  }

  async deleteTeamMember(id) {
    try {
      const result = await db.deleteTeamMember(id);
      this.closeModal();
      await this.renderTeamMemberList();
      this.showToast('Team member deleted', 'success');
    } catch (error) {
      console.error('Failed to delete team member:', error);
      this.showToast('Failed to delete team member', 'error');
    }
  }

  // =====================
  // Team Collaboration (Cloud)
  // =====================

  currentTeam = null;
  currentTeamRole = null;

  async renderTeamCollaboration() {
    const section = document.getElementById('teamCollabSection');
    if (!section) return;

    // Only show if user is authenticated with cloud
    if (!this.isCloudMode || !firebaseAuth.currentUser) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';

    try {
      const teams = await db.getMyTeams();

      // Update nav visibility
      this.updateTeamNavVisibility();

      if (teams.length === 0) {
        // Show no team state
        document.getElementById('noTeamState').style.display = 'block';
        document.getElementById('teamExistsState').style.display = 'none';
        this.currentTeam = null;
        this.currentTeamRole = null;
      } else {
        // Use first team (for now, single team support)
        const team = teams[0];
        this.currentTeam = team;
        this.currentTeamRole = team.role;

        document.getElementById('noTeamState').style.display = 'none';
        document.getElementById('teamExistsState').style.display = 'block';

        // Update team info
        document.getElementById('teamNameDisplay').textContent = team.name;
        document.getElementById('teamMemberCount').textContent = team.memberCount || 1;

        const roleBadge = document.getElementById('teamRoleBadge');
        roleBadge.textContent = team.role;
        roleBadge.className = 'team-role-badge' + (team.role === 'member' ? ' member' : '');

        // Render members
        await this.renderTeamMembersCloud(team.id);

        // Set up real-time listeners for team
        await this.setupTeamRealtimeListeners();

        // Load activity feed
        await this.loadTeamActivity();

        // Show/hide owner actions
        const ownerActions = document.getElementById('ownerActions');
        const deleteBtn = document.getElementById('deleteTeamBtn');
        const leaveBtn = document.getElementById('leaveTeamBtn');

        if (team.role === 'owner') {
          ownerActions.style.display = 'block';
          deleteBtn.style.display = 'inline-flex';
          leaveBtn.style.display = 'none';
          await this.renderPendingInvites(team.id);
        } else {
          ownerActions.style.display = 'none';
          deleteBtn.style.display = 'none';
          leaveBtn.style.display = 'inline-flex';
        }
      }
    } catch (error) {
      console.error('Failed to load team collaboration:', error);
    }
  }

  async renderTeamMembersCloud(teamId) {
    const container = document.getElementById('teamMembersCloudList');
    if (!container) return;

    try {
      const members = await db.getCloudTeamMembers(teamId);

      container.innerHTML = members.map(member => {
        const initials = (member.displayName || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        return `
          <div class="team-member-cloud-item">
            <div class="team-member-avatar">${initials}</div>
            <div class="team-member-info">
              <div class="team-member-name">${this.escapeHtml(member.displayName || 'Unknown')}</div>
              <div class="team-member-email">${this.escapeHtml(member.email || '')}</div>
            </div>
            <span class="team-role-badge ${member.role === 'member' ? 'member' : ''}">${member.role}</span>
          </div>
        `;
      }).join('');
    } catch (error) {
      console.error('Failed to load team members:', error);
      container.innerHTML = '<p class="empty-hint">Failed to load members</p>';
    }
  }

  async renderPendingInvites(teamId) {
    const container = document.getElementById('pendingInvitesList');
    if (!container) return;

    try {
      const invites = await db.getPendingInvites(teamId);

      if (invites.length === 0) {
        container.innerHTML = '<p class="empty-hint">No pending invites</p>';
        return;
      }

      container.innerHTML = invites.map(invite => {
        const expiresDate = new Date(invite.expiresAt);
        const now = new Date();
        const daysLeft = Math.ceil((expiresDate - now) / (1000 * 60 * 60 * 24));

        return `
          <div class="pending-invite-item">
            <span>Expires in ${daysLeft} day(s)</span>
            <code>${invite.token.slice(0, 8)}...</code>
          </div>
        `;
      }).join('');
    } catch (error) {
      console.error('Failed to load pending invites:', error);
    }
  }

  showCreateTeamModal() {
    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    content.innerHTML = `
      <div class="modal-header">
        <h3>Create Team</h3>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Team Name</label>
          <input type="text" class="form-control" id="teamNameInput" placeholder="Enter team name...">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.createTeam()">Create Team</button>
      </div>
    `;

    // Focus and handle enter key
    setTimeout(() => {
      const input = document.getElementById('teamNameInput');
      if (input) {
        input.focus();
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') this.createTeam();
        });
      }
    }, 100);
  }

  async createTeam() {
    const input = document.getElementById('teamNameInput');
    const name = input.value.trim();

    if (!name) {
      this.showToast('Please enter a team name', 'error');
      return;
    }

    try {
      const team = await db.createTeam(name);
      this.currentTeam = team;
      this.currentTeamRole = 'owner';
      this.closeModal();
      await this.renderTeamCollaboration();
      this.showToast('Team created!', 'success');
    } catch (error) {
      console.error('Failed to create team:', error);
      this.showToast('Failed to create team', 'error');
    }
  }

  showJoinTeamModal() {
    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    content.innerHTML = `
      <div class="modal-header">
        <h3>Join Team</h3>
      </div>
      <div class="modal-body">
        <p style="color: var(--color-text-secondary); margin-bottom: 16px;">Paste the invite link you received:</p>
        <div class="form-group">
          <label>Invite Link or Token</label>
          <input type="text" class="form-control" id="inviteTokenInput" placeholder="Paste invite link or token...">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.joinTeam()">Join Team</button>
      </div>
    `;

    setTimeout(() => {
      const input = document.getElementById('inviteTokenInput');
      if (input) {
        input.focus();
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') this.joinTeam();
        });
      }
    }, 100);
  }

  async joinTeam() {
    const input = document.getElementById('inviteTokenInput');
    let token = input.value.trim();

    // Extract token from URL if pasted full URL
    if (token.includes('invite=')) {
      const url = new URL(token);
      token = url.searchParams.get('invite');
    }

    if (!token) {
      this.showToast('Please enter an invite token', 'error');
      return;
    }

    try {
      const team = await db.acceptInvite(token);
      this.currentTeam = team;
      this.currentTeamRole = 'member';
      this.closeModal();
      await this.renderTeamCollaboration();
      this.showToast(`Joined ${team.name}!`, 'success');
    } catch (error) {
      console.error('Failed to join team:', error);
      this.showToast(error.message || 'Failed to join team', 'error');
    }
  }

  async generateInviteLink() {
    if (!this.currentTeam) return;

    try {
      const token = await db.generateInviteLink(this.currentTeam.id);
      const inviteUrl = `${window.location.origin}${window.location.pathname}?invite=${token}`;

      document.getElementById('inviteLinkInput').value = inviteUrl;
      document.getElementById('inviteLinkDisplay').style.display = 'block';

      await this.renderPendingInvites(this.currentTeam.id);
      this.showToast('Invite link generated!', 'success');
    } catch (error) {
      console.error('Failed to generate invite:', error);
      this.showToast('Failed to generate invite link', 'error');
    }
  }

  async copyInviteLink() {
    const input = document.getElementById('inviteLinkInput');
    try {
      await navigator.clipboard.writeText(input.value);
      this.showToast('Link copied to clipboard!', 'success');
    } catch (error) {
      // Fallback for older browsers
      input.select();
      document.execCommand('copy');
      this.showToast('Link copied!', 'success');
    }
  }

  async leaveTeam() {
    if (!this.currentTeam) return;

    if (!confirm('Are you sure you want to leave this team?')) return;

    try {
      await db.leaveTeam(this.currentTeam.id);
      this.currentTeam = null;
      this.currentTeamRole = null;
      await this.renderTeamCollaboration();
      this.showToast('Left team', 'success');
    } catch (error) {
      console.error('Failed to leave team:', error);
      this.showToast(error.message || 'Failed to leave team', 'error');
    }
  }

  async deleteTeam() {
    if (!this.currentTeam) return;

    if (!confirm('Are you sure you want to delete this team? This cannot be undone and will remove all members.')) return;

    try {
      await db.deleteTeam(this.currentTeam.id);
      this.currentTeam = null;
      this.currentTeamRole = null;
      await this.renderTeamCollaboration();
      this.showToast('Team deleted', 'success');
    } catch (error) {
      console.error('Failed to delete team:', error);
      this.showToast(error.message || 'Failed to delete team', 'error');
    }
  }

  // =====================
  // Google Integrations
  // =====================

  async renderGoogleIntegrations() {
    // Update integration status display
    const configNotice = document.getElementById('integrationConfig');
    const driveStatus = document.getElementById('driveStatus');
    const gmailStatus = document.getElementById('gmailStatus');
    const calendarStatus = document.getElementById('calendarStatus');
    const connectDriveBtn = document.getElementById('connectDriveBtn');
    const disconnectDriveBtn = document.getElementById('disconnectDriveBtn');
    const connectGmailBtn = document.getElementById('connectGmailBtn');
    const disconnectGmailBtn = document.getElementById('disconnectGmailBtn');
    const connectCalendarBtn = document.getElementById('connectCalendarBtn');
    const disconnectCalendarBtn = document.getElementById('disconnectCalendarBtn');
    const gmailImportSettings = document.getElementById('gmailImportSettings');
    const calendarSettings = document.getElementById('calendarSettings');

    if (!driveStatus) return;

    // Load connection status
    if (typeof googleIntegration !== 'undefined') {
      await googleIntegration.loadConnectionStatus();

      // Update config notice visibility
      const isConfigured = googleIntegration.isConfigured();
      if (configNotice) {
        configNotice.style.display = isConfigured ? 'none' : 'block';
      }

      // Update Drive status
      if (googleIntegration.driveConnected) {
        driveStatus.innerHTML = '<span class="status-indicator connected"></span><span class="status-text">Connected</span>';
        connectDriveBtn.style.display = 'none';
        disconnectDriveBtn.style.display = 'inline-flex';
      } else {
        driveStatus.innerHTML = '<span class="status-indicator disconnected"></span><span class="status-text">Not connected</span>';
        connectDriveBtn.style.display = 'inline-flex';
        disconnectDriveBtn.style.display = 'none';
      }

      // Update Gmail status
      if (googleIntegration.gmailConnected) {
        gmailStatus.innerHTML = '<span class="status-indicator connected"></span><span class="status-text">Connected</span>';
        connectGmailBtn.style.display = 'none';
        disconnectGmailBtn.style.display = 'inline-flex';
        if (gmailImportSettings) gmailImportSettings.style.display = 'block';
      } else {
        gmailStatus.innerHTML = '<span class="status-indicator disconnected"></span><span class="status-text">Not connected</span>';
        connectGmailBtn.style.display = 'inline-flex';
        disconnectGmailBtn.style.display = 'none';
        if (gmailImportSettings) gmailImportSettings.style.display = 'none';
      }

      // Update Calendar status
      if (calendarStatus) {
        if (googleIntegration.calendarConnected) {
          calendarStatus.innerHTML = '<span class="status-indicator connected"></span><span class="status-text">Connected</span>';
          if (connectCalendarBtn) connectCalendarBtn.style.display = 'none';
          if (disconnectCalendarBtn) disconnectCalendarBtn.style.display = 'inline-flex';
          if (calendarSettings) {
            calendarSettings.style.display = 'block';
            this.renderCalendarSettingsUI();
          }
        } else {
          calendarStatus.innerHTML = '<span class="status-indicator disconnected"></span><span class="status-text">Not connected</span>';
          if (connectCalendarBtn) connectCalendarBtn.style.display = 'inline-flex';
          if (disconnectCalendarBtn) disconnectCalendarBtn.style.display = 'none';
          if (calendarSettings) calendarSettings.style.display = 'none';
        }
      }
    }
  }

  renderCalendarSettingsUI() {
    if (typeof googleIntegration === 'undefined') return;

    const settings = googleIntegration.calendarSettings;

    // Update checkboxes
    const showInToday = document.getElementById('calShowInToday');
    const showInWeeklyReview = document.getElementById('calShowInWeeklyReview');
    const showAvailability = document.getElementById('calShowAvailability');
    const createEventsForActions = document.getElementById('calCreateEventsForActions');
    const syncProjectDeadlines = document.getElementById('calSyncProjectDeadlines');
    const enableFocusTime = document.getElementById('calEnableFocusTime');
    const defaultFocusDuration = document.getElementById('calDefaultFocusDuration');

    if (showInToday) showInToday.checked = settings.showInToday;
    if (showInWeeklyReview) showInWeeklyReview.checked = settings.showInWeeklyReview;
    if (showAvailability) showAvailability.checked = settings.showAvailability;
    if (createEventsForActions) createEventsForActions.checked = settings.createEventsForActions;
    if (syncProjectDeadlines) syncProjectDeadlines.checked = settings.syncProjectDeadlines;
    if (enableFocusTime) enableFocusTime.checked = settings.enableFocusTime;
    if (defaultFocusDuration) defaultFocusDuration.value = settings.defaultFocusDuration;

    // Render calendar list
    this.renderCalendarList();
  }

  async renderCalendarList() {
    const container = document.getElementById('calendarListContainer');
    if (!container || typeof googleIntegration === 'undefined') return;

    const calendars = googleIntegration.getCalendarList();
    const selectedCalendars = googleIntegration.calendarSettings.selectedCalendars || ['primary'];

    if (calendars.length === 0) {
      container.innerHTML = '<p class="empty-hint">No calendars available. Try refreshing.</p>';
      return;
    }

    container.innerHTML = calendars.map(cal => `
      <div class="calendar-list-item">
        <input type="checkbox"
          ${selectedCalendars.includes(cal.id) ? 'checked' : ''}
          onchange="app.toggleCalendarSelection('${this.escapeHtml(cal.id)}', this.checked)">
        <span class="calendar-color" style="background-color: ${cal.backgroundColor || '#4285F4'}"></span>
        <span class="calendar-name ${cal.primary ? 'primary' : ''}">${this.escapeHtml(cal.summary)}</span>
        ${cal.primary ? '<span class="calendar-badge">Primary</span>' : ''}
      </div>
    `).join('');
  }

  async toggleCalendarSelection(calendarId, selected) {
    if (typeof googleIntegration === 'undefined') return;

    let selectedCalendars = [...(googleIntegration.calendarSettings.selectedCalendars || ['primary'])];

    if (selected && !selectedCalendars.includes(calendarId)) {
      selectedCalendars.push(calendarId);
    } else if (!selected) {
      selectedCalendars = selectedCalendars.filter(id => id !== calendarId);
    }

    await googleIntegration.updateCalendarSettings({ selectedCalendars });
  }

  showGoogleConfigModal() {
    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    // Get current values if any
    const currentClientId = typeof googleIntegration !== 'undefined' ? googleIntegration.CLIENT_ID : '';
    const currentApiKey = typeof googleIntegration !== 'undefined' ? googleIntegration.API_KEY : '';

    content.innerHTML = `
      <div class="modal-header">
        <h3>Configure Google API Credentials</h3>
      </div>
      <div class="modal-body">
        <div class="config-instructions">
          <p>To use Google Drive and Gmail integration, you need to:</p>
          <ol>
            <li>Create a project in <a href="https://console.cloud.google.com/" target="_blank">Google Cloud Console</a></li>
            <li>Enable the Google Drive API and Gmail API</li>
            <li>Create OAuth 2.0 credentials (Web application)</li>
            <li>Create an API key for Google Picker</li>
            <li>Add your app domain to authorized JavaScript origins</li>
          </ol>
        </div>
        <div class="composer-field">
          <label>OAuth Client ID</label>
          <input type="text" class="composer-input" id="googleClientId" placeholder="xxxx.apps.googleusercontent.com" value="${this.escapeHtml(currentClientId)}">
        </div>
        <div class="composer-field">
          <label>API Key (for Picker)</label>
          <input type="text" class="composer-input" id="googleApiKey" placeholder="AIzaSy..." value="${this.escapeHtml(currentApiKey)}">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.saveGoogleConfig()">Save</button>
      </div>
    `;
  }

  async saveGoogleConfig() {
    const clientId = document.getElementById('googleClientId').value.trim();
    const apiKey = document.getElementById('googleApiKey').value.trim();

    if (!clientId || !apiKey) {
      this.showToast('Both Client ID and API Key are required', 'error');
      return;
    }

    try {
      // Save to user settings
      await db.updateUserSettings({
        googleClientId: clientId,
        googleApiKey: apiKey
      });

      // Update the integration instance
      if (typeof googleIntegration !== 'undefined') {
        await googleIntegration.setCredentials(clientId, apiKey);
      }

      this.closeModal();
      await this.renderGoogleIntegrations();
      this.showToast('Google API credentials saved', 'success');
    } catch (error) {
      console.error('Error saving Google config:', error);
      this.showToast('Failed to save credentials', 'error');
    }
  }

  async connectGoogleDrive() {
    if (typeof googleIntegration === 'undefined') {
      this.showToast('Google integration not loaded', 'error');
      return;
    }

    if (!googleIntegration.isConfigured()) {
      this.showGoogleConfigModal();
      return;
    }

    try {
      await googleIntegration.connectDrive();
      await this.renderGoogleIntegrations();
      this.showToast('Google Drive connected', 'success');
    } catch (error) {
      console.error('Error connecting Google Drive:', error);
      this.showToast(error.message || 'Failed to connect Google Drive', 'error');
    }
  }

  async disconnectGoogleDrive() {
    if (typeof googleIntegration === 'undefined') return;

    try {
      await googleIntegration.disconnectDrive();
      await this.renderGoogleIntegrations();
      this.showToast('Google Drive disconnected', 'success');
    } catch (error) {
      console.error('Error disconnecting Google Drive:', error);
      this.showToast('Failed to disconnect', 'error');
    }
  }

  async connectGmail() {
    if (typeof googleIntegration === 'undefined') {
      this.showToast('Google integration not loaded', 'error');
      return;
    }

    if (!googleIntegration.isConfigured()) {
      this.showGoogleConfigModal();
      return;
    }

    try {
      await googleIntegration.connectGmail();
      await this.renderGoogleIntegrations();
      this.showToast('Gmail connected', 'success');
    } catch (error) {
      console.error('Error connecting Gmail:', error);
      this.showToast(error.message || 'Failed to connect Gmail', 'error');
    }
  }

  async disconnectGmail() {
    if (typeof googleIntegration === 'undefined') return;

    try {
      await googleIntegration.disconnectGmail();
      await this.renderGoogleIntegrations();
      this.showToast('Gmail disconnected', 'success');
    } catch (error) {
      console.error('Error disconnecting Gmail:', error);
      this.showToast('Failed to disconnect', 'error');
    }
  }

  async connectGoogleCalendar() {
    if (typeof googleIntegration === 'undefined') {
      this.showToast('Google integration not loaded', 'error');
      return;
    }

    if (!googleIntegration.isConfigured()) {
      this.showGoogleConfigModal();
      return;
    }

    try {
      await googleIntegration.connectCalendar();
      await this.renderGoogleIntegrations();
      this.showToast('Google Calendar connected', 'success');
    } catch (error) {
      console.error('Error connecting Google Calendar:', error);
      this.showToast(error.message || 'Failed to connect Google Calendar', 'error');
    }
  }

  async disconnectGoogleCalendar() {
    if (typeof googleIntegration === 'undefined') return;

    try {
      await googleIntegration.disconnectCalendar();
      await this.renderGoogleIntegrations();
      this.showToast('Google Calendar disconnected', 'success');
    } catch (error) {
      console.error('Error disconnecting Google Calendar:', error);
      this.showToast('Failed to disconnect', 'error');
    }
  }

  async updateCalendarSetting(key, value) {
    if (typeof googleIntegration === 'undefined') return;

    try {
      await googleIntegration.updateCalendarSettings({ [key]: value });
    } catch (error) {
      console.error('Error updating calendar setting:', error);
      this.showToast('Failed to update setting', 'error');
    }
  }

  async refreshCalendarList() {
    if (typeof googleIntegration === 'undefined' || !googleIntegration.calendarConnected) {
      this.showToast('Calendar not connected', 'error');
      return;
    }

    try {
      const container = document.getElementById('calendarListContainer');
      if (container) container.innerHTML = '<p class="empty-hint">Loading calendars...</p>';

      // Ensure we have a valid token (will prompt for re-auth if needed)
      await googleIntegration.ensureCalendarToken();
      await googleIntegration.fetchCalendarList();
      this.renderCalendarList();
      this.showToast('Calendars refreshed', 'success');
    } catch (error) {
      console.error('Error refreshing calendar list:', error);
      if (error.message?.includes('not configured')) {
        this.showToast('Please configure Google API credentials in Settings', 'error');
      } else {
        this.showToast('Failed to refresh calendars. Try reconnecting.', 'error');
      }
    }
  }

  async showGmailImportModal() {
    if (typeof googleIntegration === 'undefined' || !googleIntegration.isGmailConnected()) {
      this.showToast('Gmail not connected', 'error');
      return;
    }

    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    content.innerHTML = `
      <div class="modal-header">
        <h3>Import from Gmail</h3>
      </div>
      <div class="modal-body">
        <div class="loading-spinner">Loading labels...</div>
      </div>
    `;

    try {
      const labels = await googleIntegration.getGmailLabels();

      // Filter to show user labels and important system labels
      const userLabels = labels.filter(l => l.type === 'user' || ['INBOX', 'STARRED', 'IMPORTANT'].includes(l.id));

      content.innerHTML = `
        <div class="modal-header">
          <h3>Import from Gmail</h3>
        </div>
        <div class="modal-body">
          <p class="modal-description">Select a label to import emails from:</p>
          <div class="gmail-label-list">
            ${userLabels.map(label => `
              <div class="gmail-label-item" onclick="app.selectGmailLabel('${label.id}', '${this.escapeHtml(label.name)}')">
                <span class="label-name">${this.escapeHtml(label.name)}</span>
                ${label.messagesUnread ? `<span class="label-count">${label.messagesUnread} unread</span>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        </div>
      `;
    } catch (error) {
      console.error('Error loading Gmail labels:', error);
      content.innerHTML = `
        <div class="modal-header">
          <h3>Import from Gmail</h3>
        </div>
        <div class="modal-body">
          <p class="error-text">Failed to load Gmail labels. Please try again.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="app.closeModal()">Close</button>
        </div>
      `;
    }
  }

  async selectGmailLabel(labelId, labelName) {
    const content = document.getElementById('modalContent');

    content.innerHTML = `
      <div class="modal-header">
        <h3>Emails in ${this.escapeHtml(labelName)}</h3>
      </div>
      <div class="modal-body">
        <div class="loading-spinner">Loading emails...</div>
      </div>
    `;

    try {
      const emails = await googleIntegration.getEmailsFromLabel(labelId, 20);

      if (emails.length === 0) {
        content.innerHTML = `
          <div class="modal-header">
            <h3>Emails in ${this.escapeHtml(labelName)}</h3>
          </div>
          <div class="modal-body">
            <p class="empty-hint">No emails in this label</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="app.showGmailImportModal()">Back</button>
          </div>
        `;
        return;
      }

      content.innerHTML = `
        <div class="modal-header">
          <h3>Select Emails to Import</h3>
        </div>
        <div class="modal-body">
          <div class="gmail-email-list">
            ${emails.map(email => `
              <label class="gmail-email-item">
                <input type="checkbox" value="${email.id}" data-thread-id="${email.threadId}">
                <div class="email-info">
                  <div class="email-from">${this.escapeHtml(email.from)}</div>
                  <div class="email-subject">${this.escapeHtml(email.subject || '(No Subject)')}</div>
                  <div class="email-snippet">${this.escapeHtml(email.snippet)}</div>
                </div>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="app.showGmailImportModal()">Back</button>
          <button class="btn btn-primary" onclick="app.importSelectedEmails()">Import Selected</button>
        </div>
      `;
    } catch (error) {
      console.error('Error loading emails:', error);
      content.innerHTML = `
        <div class="modal-header">
          <h3>Import Error</h3>
        </div>
        <div class="modal-body">
          <p class="error-text">Failed to load emails. Please try again.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="app.closeModal()">Close</button>
        </div>
      `;
    }
  }

  async importSelectedEmails() {
    const checkboxes = document.querySelectorAll('.gmail-email-list input[type="checkbox"]:checked');

    if (checkboxes.length === 0) {
      this.showToast('Please select at least one email', 'error');
      return;
    }

    const content = document.getElementById('modalContent');
    content.innerHTML = `
      <div class="modal-header">
        <h3>Importing...</h3>
      </div>
      <div class="modal-body">
        <div class="loading-spinner">Importing ${checkboxes.length} email(s)...</div>
      </div>
    `;

    let imported = 0;
    let failed = 0;

    for (const checkbox of checkboxes) {
      try {
        const emailDetails = await googleIntegration.getEmailDetails(checkbox.value);
        const inboxItem = googleIntegration.formatEmailAsInboxItem(emailDetails);
        await db.addToInbox(inboxItem.text, inboxItem.notes, null, inboxItem.metadata);
        imported++;
      } catch (error) {
        console.error('Failed to import email:', error);
        failed++;
      }
    }

    this.closeModal();
    await this.updateCounts();
    await this.renderInbox();

    if (failed > 0) {
      this.showToast(`Imported ${imported} emails, ${failed} failed`, 'warning');
    } else {
      this.showToast(`Imported ${imported} email(s) to inbox`, 'success');
    }
  }

  // =====================
  // Focus Time Blocking
  // =====================

  async showBlockFocusTimeModal(actionId = null, actionTitle = null) {
    if (typeof googleIntegration === 'undefined' || !googleIntegration.calendarConnected) {
      this.showToast('Please connect Google Calendar in Settings first', 'error');
      return;
    }

    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    const defaultDuration = googleIntegration.calendarSettings.defaultFocusDuration || 60;

    // Get today's date formatted
    const today = new Date().toISOString().split('T')[0];

    content.innerHTML = `
      <div class="modal-header">
        <h3>Block Focus Time</h3>
      </div>
      <div class="modal-body focus-time-modal">
        <div class="composer-field">
          <label>What will you focus on?</label>
          ${actionId ? `
            <input type="text" class="composer-input" id="focusTitle" value="${this.escapeHtml(actionTitle || '')}" readonly>
            <input type="hidden" id="focusActionId" value="${actionId}">
          ` : `
            <input type="text" class="composer-input" id="focusTitle" placeholder="e.g., Deep work - complete estimates">
          `}
        </div>

        <div class="composer-field">
          <label>When?</label>
          <div class="focus-time-options">
            <button class="btn btn-sm ${!actionId ? 'btn-primary' : ''}" id="focusNowBtn" onclick="app.selectFocusTimeOption('now')">
              Next available slot
            </button>
            <button class="btn btn-sm" id="focusChooseBtn" onclick="app.selectFocusTimeOption('choose')">
              Choose time
            </button>
          </div>
        </div>

        <div id="focusChooseTimeSection" style="display: none;">
          <div class="composer-field-row">
            <div class="composer-field">
              <label>Date</label>
              <input type="date" class="composer-input" id="focusDate" value="${today}" onchange="app.loadFocusAvailability()">
            </div>
            <div class="composer-field">
              <label>Start Time</label>
              <input type="time" class="composer-input" id="focusTime" value="09:00">
            </div>
          </div>
        </div>

        <div class="composer-field">
          <label>Duration</label>
          <div class="duration-options">
            <button class="btn btn-sm ${defaultDuration === 30 ? 'btn-primary' : ''}" onclick="app.setFocusDuration(30)">30 min</button>
            <button class="btn btn-sm ${defaultDuration === 60 ? 'btn-primary' : ''}" onclick="app.setFocusDuration(60)">1 hr</button>
            <button class="btn btn-sm ${defaultDuration === 90 ? 'btn-primary' : ''}" onclick="app.setFocusDuration(90)">90 min</button>
            <button class="btn btn-sm ${defaultDuration === 120 ? 'btn-primary' : ''}" onclick="app.setFocusDuration(120)">2 hrs</button>
          </div>
          <input type="hidden" id="focusDuration" value="${defaultDuration}">
        </div>

        <div class="availability-list" id="focusAvailabilityList">
          <p class="empty-hint">Loading availability...</p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.createFocusTimeBlock()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 6v6l4 2"></path>
          </svg>
          Block Time
        </button>
      </div>
    `;

    // Store initial option state
    this.focusTimeOption = 'now';

    // Load availability
    this.loadFocusAvailability();
  }

  selectFocusTimeOption(option) {
    this.focusTimeOption = option;

    const nowBtn = document.getElementById('focusNowBtn');
    const chooseBtn = document.getElementById('focusChooseBtn');
    const chooseSection = document.getElementById('focusChooseTimeSection');

    if (option === 'now') {
      nowBtn.classList.add('btn-primary');
      chooseBtn.classList.remove('btn-primary');
      chooseSection.style.display = 'none';
    } else {
      nowBtn.classList.remove('btn-primary');
      chooseBtn.classList.add('btn-primary');
      chooseSection.style.display = 'block';
    }

    this.loadFocusAvailability();
  }

  setFocusDuration(duration) {
    document.getElementById('focusDuration').value = duration;

    // Update button styling
    const buttons = document.querySelectorAll('.duration-options .btn');
    buttons.forEach(btn => {
      btn.classList.remove('btn-primary');
      if (btn.textContent.includes(duration === 30 ? '30 min' : duration === 60 ? '1 hr' : duration === 90 ? '90 min' : '2 hrs')) {
        btn.classList.add('btn-primary');
      }
    });

    this.loadFocusAvailability();
  }

  async loadFocusAvailability() {
    const container = document.getElementById('focusAvailabilityList');
    if (!container || typeof googleIntegration === 'undefined') return;

    container.innerHTML = '<p class="empty-hint">Loading availability...</p>';

    try {
      const dateInput = document.getElementById('focusDate');
      const date = dateInput ? new Date(dateInput.value) : new Date();

      const slots = await googleIntegration.getAvailabilityForDay(date);
      const events = await googleIntegration.getCalendarEvents(
        new Date(date.setHours(0, 0, 0, 0)),
        new Date(date.setHours(23, 59, 59, 999))
      );

      if (slots.length === 0) {
        container.innerHTML = '<p class="empty-hint">No availability data</p>';
        return;
      }

      container.innerHTML = `
        <h4>Availability on ${new Date(dateInput?.value || Date.now()).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</h4>
        ${slots.map(slot => {
          const startTime = googleIntegration.formatTime(slot.start);
          const endTime = googleIntegration.formatTime(slot.end);
          const durationHrs = Math.floor(slot.durationMinutes / 60);
          const durationMins = slot.durationMinutes % 60;
          const durationText = durationHrs > 0
            ? `${durationHrs} hr${durationHrs > 1 ? 's' : ''}${durationMins > 0 ? ` ${durationMins} min` : ''}`
            : `${durationMins} min`;

          if (slot.type === 'free') {
            return `
              <div class="availability-slot free" onclick="app.selectFocusSlot('${slot.start.toISOString()}')">
                <span class="slot-time">${startTime} - ${endTime}</span>
                <span class="slot-label">${durationText} free</span>
                <button class="btn btn-sm">Select</button>
              </div>
            `;
          } else {
            // Find event title for this busy period
            const event = events.find(e => {
              const eventStart = new Date(e.start);
              return eventStart >= slot.start && eventStart < slot.end;
            });
            return `
              <div class="availability-slot busy">
                <span class="slot-time">${startTime} - ${endTime}</span>
                <span class="slot-label">${event ? this.escapeHtml(event.title) : 'Busy'}</span>
              </div>
            `;
          }
        }).join('')}
      `;
    } catch (error) {
      console.error('Error loading availability:', error);
      container.innerHTML = '<p class="empty-hint">Failed to load availability</p>';
    }
  }

  selectFocusSlot(startTimeISO) {
    const startTime = new Date(startTimeISO);

    // Update the date/time inputs
    const dateInput = document.getElementById('focusDate');
    const timeInput = document.getElementById('focusTime');

    if (dateInput) {
      dateInput.value = startTime.toISOString().split('T')[0];
    }
    if (timeInput) {
      timeInput.value = startTime.toTimeString().slice(0, 5);
    }

    // Switch to choose mode
    this.selectFocusTimeOption('choose');

    // Highlight selected slot
    document.querySelectorAll('.availability-slot.free').forEach(slot => {
      slot.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');
  }

  async createFocusTimeBlock() {
    const title = document.getElementById('focusTitle')?.value?.trim();
    const actionId = document.getElementById('focusActionId')?.value;
    const duration = parseInt(document.getElementById('focusDuration')?.value) || 60;

    if (!title) {
      this.showToast('Please enter what you will focus on', 'error');
      return;
    }

    let startDateTime;

    if (this.focusTimeOption === 'now') {
      // Find next available slot
      startDateTime = await googleIntegration.findNextAvailableSlot(duration);
    } else {
      const dateVal = document.getElementById('focusDate')?.value;
      const timeVal = document.getElementById('focusTime')?.value;

      if (!dateVal || !timeVal) {
        this.showToast('Please select a date and time', 'error');
        return;
      }

      startDateTime = new Date(`${dateVal}T${timeVal}`);
    }

    try {
      const event = await googleIntegration.blockFocusTime({
        title,
        actionId,
        startDateTime,
        duration,
        calendarId: googleIntegration.calendarSettings.focusCalendarId || 'primary'
      });

      // If linked to an action, update the action
      if (actionId) {
        await db.update('nextActions', actionId, {
          focusTimeEventId: event.id,
          focusTimeCalendarId: event.calendarId,
          scheduledFocusTime: startDateTime.toISOString()
        });
      }

      this.closeModal();

      const endTime = new Date(startDateTime.getTime() + duration * 60000);
      this.showToast(`Focus time blocked: ${googleIntegration.formatTime(startDateTime)} - ${googleIntegration.formatTime(endTime)}`, 'success');

      // Refresh today view if we're on it
      if (this.currentView === 'today') {
        await this.renderTodayView();
      }
    } catch (error) {
      console.error('Error creating focus time block:', error);
      this.showToast('Failed to create focus time block', 'error');
    }
  }

  async showBlockFocusTimeForAction(actionId) {
    const action = await db.get('nextActions', actionId);
    if (action) {
      this.showBlockFocusTimeModal(actionId, action.action);
    }
  }

  async syncAllProjectDeadlines() {
    if (typeof googleIntegration === 'undefined' || !googleIntegration.calendarConnected) {
      this.showToast('Please connect Google Calendar in Settings first', 'error');
      return;
    }

    try {
      const projects = await db.getProjects();
      const projectsWithDeadlines = projects.filter(p => p.deadline && p.status === 'active');

      if (projectsWithDeadlines.length === 0) {
        this.showToast('No projects with deadlines to sync', 'info');
        return;
      }

      let synced = 0;
      for (const project of projectsWithDeadlines) {
        try {
          const event = await googleIntegration.createProjectDeadlineEvent(project);
          if (event) {
            await db.update('projects', project.id, {
              calendarEventId: event.id,
              calendarId: 'primary'
            });
            synced++;
          }
        } catch (error) {
          console.error(`Failed to sync deadline for project ${project.name}:`, error);
        }
      }

      this.showToast(`Synced ${synced} project deadline(s) to calendar`, 'success');
    } catch (error) {
      console.error('Error syncing project deadlines:', error);
      this.showToast('Failed to sync project deadlines', 'error');
    }
  }

  async showDrivePickerForReference() {
    if (typeof googleIntegration === 'undefined' || !googleIntegration.isDriveConnected()) {
      // Try to connect first
      if (typeof googleIntegration !== 'undefined') {
        try {
          await googleIntegration.connectDrive();
        } catch (error) {
          this.showToast('Please connect Google Drive in Settings first', 'error');
          return null;
        }
      } else {
        this.showToast('Google integration not available', 'error');
        return null;
      }
    }

    try {
      const files = await googleIntegration.showDrivePicker();
      return files;
    } catch (error) {
      console.error('Drive picker error:', error);
      this.showToast('Failed to open Drive picker', 'error');
      return null;
    }
  }

  async sendEmailViaGmail(to, subject, body, waitingForId = null) {
    if (typeof googleIntegration === 'undefined' || !googleIntegration.isGmailConnected()) {
      // Fall back to mailto
      window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      return null;
    }

    try {
      const result = await googleIntegration.sendEmail({ to, subject, body });

      // If this is for a waiting for item, store the thread ID for tracking
      if (waitingForId && result.threadId) {
        await db.update('waitingFor', waitingForId, {
          emailThreadId: result.threadId,
          emailMessageId: result.messageId,
          lastEmailCheck: new Date().toISOString()
        });
      }

      this.showToast('Email sent via Gmail', 'success');
      return result;
    } catch (error) {
      console.error('Failed to send email via Gmail:', error);
      // Fall back to mailto
      this.showToast('Falling back to email client', 'warning');
      window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      return null;
    }
  }

  async checkWaitingForReplies() {
    if (typeof googleIntegration === 'undefined' || !googleIntegration.isGmailConnected()) {
      return;
    }

    try {
      const waitingItems = await db.getWaitingFor();
      const itemsWithThreads = waitingItems.filter(item => item.emailThreadId);

      for (const item of itemsWithThreads) {
        const replyStatus = await googleIntegration.checkForReplies(
          item.emailThreadId,
          item.emailMessageId
        );

        if (replyStatus.hasNewReply) {
          await db.update('waitingFor', item.id, {
            hasReply: true,
            replyFrom: replyStatus.replyFrom,
            replyDate: replyStatus.replyDate,
            replySnippet: replyStatus.replySnippet,
            lastEmailCheck: new Date().toISOString()
          });
        }
      }

      // Re-render if on waiting for view
      if (this.currentView === 'waitingFor') {
        await this.renderWaitingFor();
      }
    } catch (error) {
      console.error('Error checking for email replies:', error);
    }
  }

  // =====================
  // Contact Management
  // =====================

  contactFilter = 'all';

  async renderContactList() {
    const container = document.getElementById('contactList');
    const filterBar = document.getElementById('contactFilterBar');
    if (!container) return;

    const categories = db.getContactCategories ? db.getContactCategories() : [];
    let contacts = await db.getContacts();

    // Render filter buttons
    if (filterBar) {
      filterBar.innerHTML = `
        <button class="filter-btn ${this.contactFilter === 'all' ? 'active' : ''}" data-filter="all" onclick="app.setContactFilter('all')">All</button>
        ${categories.map(cat => `
          <button class="filter-btn ${this.contactFilter === cat.id ? 'active' : ''}" data-filter="${cat.id}" onclick="app.setContactFilter('${cat.id}')">${cat.name}</button>
        `).join('')}
      `;
    }

    // Apply filter
    if (this.contactFilter !== 'all') {
      contacts = contacts.filter(c => c.category === this.contactFilter);
    }

    if (contacts.length === 0) {
      container.innerHTML = `
        <div class="empty-state small">
          <p>${this.contactFilter !== 'all' ? 'No contacts in this category.' : 'No external contacts yet. Add adjusters, vendors, or clients.'}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = contacts.map(contact => this.renderContactCard(contact)).join('');
  }

  setContactFilter(filter) {
    this.contactFilter = filter;
    this.renderContactList();
  }

  renderContactCard(contact) {
    const categories = db.getContactCategories ? db.getContactCategories() : [];
    const category = categories.find(c => c.id === contact.category);
    const categoryIcon = category ? category.icon : '👤';
    const categoryName = category ? category.name : contact.category;

    return `
      <div class="contact-card" data-id="${contact.id}">
        <div class="contact-icon">${categoryIcon}</div>
        <div class="contact-info">
          <div class="contact-name">${this.escapeHtml(contact.name)}</div>
          ${contact.company ? `<div class="contact-company">${this.escapeHtml(contact.company)}</div>` : ''}
          <div class="contact-details">
            <span class="contact-category-badge">${categoryName}</span>
            ${contact.email ? `<span>${this.escapeHtml(contact.email)}</span>` : ''}
            ${contact.phone ? `<span>${this.escapeHtml(contact.phone)}</span>` : ''}
          </div>
        </div>
        <div class="contact-actions">
          <button class="btn-icon" onclick="app.showEditContactModal('${contact.id}')" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="btn-icon delete" onclick="app.deleteContact('${contact.id}')" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  showAddContactModal() {
    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    const categories = db.getContactCategories ? db.getContactCategories() : [];
    const carriers = db.getInsuranceCarriers ? db.getInsuranceCarriers() : [];

    content.innerHTML = `
      <div class="modal-header">
        <h3>Add External Contact</h3>
      </div>
      <div class="modal-body">
        <div class="composer-field">
          <label>Name *</label>
          <input type="text" class="composer-input" id="contactName" placeholder="e.g., John Smith">
        </div>
        <div class="composer-field">
          <label>Category</label>
          <select class="composer-input" id="contactCategory" onchange="app.toggleCarrierField()">
            <option value="">Select category...</option>
            ${categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="composer-field" id="carrierField" style="display: none;">
          <label>Insurance Carrier</label>
          <select class="composer-input" id="contactCarrier">
            <option value="">Select carrier...</option>
            ${carriers.map(c => `<option value="${c}">${c}</option>`).join('')}
            <option value="other">Other</option>
          </select>
        </div>
        <div class="composer-field" id="companyField">
          <label>Company</label>
          <input type="text" class="composer-input" id="contactCompany" placeholder="e.g., ABC Restoration">
        </div>
        <div class="composer-row">
          <div class="composer-field">
            <label>Email</label>
            <input type="email" class="composer-input" id="contactEmail" placeholder="john@company.com">
          </div>
          <div class="composer-field">
            <label>Phone</label>
            <input type="tel" class="composer-input" id="contactPhone" placeholder="(555) 123-4567">
          </div>
        </div>
        <div class="composer-field">
          <label>Notes</label>
          <textarea class="composer-textarea" id="contactNotes" placeholder="Any notes about this contact..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.saveContact()">Add Contact</button>
      </div>
    `;

    document.getElementById('contactName').focus();
  }

  toggleCarrierField() {
    const categorySelect = document.getElementById('contactCategory');
    const carrierField = document.getElementById('carrierField');
    const companyField = document.getElementById('companyField');
    const companyInput = document.getElementById('contactCompany');

    if (categorySelect.value === 'adjuster') {
      carrierField.style.display = 'block';
      companyField.querySelector('label').textContent = 'Company (auto-filled)';
    } else {
      carrierField.style.display = 'none';
      companyField.querySelector('label').textContent = 'Company';
    }
  }

  async showEditContactModal(id) {
    const contact = await db.getContact(id);
    if (!contact) return;

    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    const categories = db.getContactCategories ? db.getContactCategories() : [];
    const carriers = db.getInsuranceCarriers ? db.getInsuranceCarriers() : [];

    content.innerHTML = `
      <div class="modal-header">
        <h3>Edit Contact</h3>
      </div>
      <div class="modal-body">
        <div class="composer-field">
          <label>Name *</label>
          <input type="text" class="composer-input" id="contactName" value="${this.escapeHtml(contact.name)}">
        </div>
        <div class="composer-field">
          <label>Category</label>
          <select class="composer-input" id="contactCategory" onchange="app.toggleCarrierField()">
            <option value="">Select category...</option>
            ${categories.map(c => `<option value="${c.id}" ${contact.category === c.id ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="composer-field" id="carrierField" style="display: ${contact.category === 'adjuster' ? 'block' : 'none'};">
          <label>Insurance Carrier</label>
          <select class="composer-input" id="contactCarrier">
            <option value="">Select carrier...</option>
            ${carriers.map(c => `<option value="${c}" ${contact.company === c ? 'selected' : ''}>${c}</option>`).join('')}
            <option value="other">Other</option>
          </select>
        </div>
        <div class="composer-field" id="companyField">
          <label>${contact.category === 'adjuster' ? 'Company (auto-filled)' : 'Company'}</label>
          <input type="text" class="composer-input" id="contactCompany" value="${this.escapeHtml(contact.company || '')}">
        </div>
        <div class="composer-row">
          <div class="composer-field">
            <label>Email</label>
            <input type="email" class="composer-input" id="contactEmail" value="${this.escapeHtml(contact.email || '')}">
          </div>
          <div class="composer-field">
            <label>Phone</label>
            <input type="tel" class="composer-input" id="contactPhone" value="${this.escapeHtml(contact.phone || '')}">
          </div>
        </div>
        <div class="composer-field">
          <label>Notes</label>
          <textarea class="composer-textarea" id="contactNotes">${this.escapeHtml(contact.notes || '')}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.updateContact('${id}')">Save Changes</button>
      </div>
    `;

    document.getElementById('contactName').focus();
  }

  async saveContact() {
    const name = document.getElementById('contactName').value.trim();
    const category = document.getElementById('contactCategory').value;
    const carrierSelect = document.getElementById('contactCarrier');
    const carrier = carrierSelect ? carrierSelect.value : '';
    let company = document.getElementById('contactCompany').value.trim();
    const email = document.getElementById('contactEmail').value.trim();
    const phone = document.getElementById('contactPhone').value.trim();
    const notes = document.getElementById('contactNotes').value.trim();

    if (!name) {
      this.showToast('Name is required', 'error');
      return;
    }

    // If adjuster category and carrier selected, use carrier as company
    if (category === 'adjuster' && carrier && carrier !== 'other') {
      company = carrier;
    }

    try {
      await db.addContact({ name, category, company, email, phone, notes });
      this.closeModal();
      await this.renderContactList();
      this.showToast('Contact added', 'success');
    } catch (error) {
      console.error('Failed to add contact:', error);
      this.showToast('Failed to add contact', 'error');
    }
  }

  async updateContact(id) {
    const name = document.getElementById('contactName').value.trim();
    const category = document.getElementById('contactCategory').value;
    const carrierSelect = document.getElementById('contactCarrier');
    const carrier = carrierSelect ? carrierSelect.value : '';
    let company = document.getElementById('contactCompany').value.trim();
    const email = document.getElementById('contactEmail').value.trim();
    const phone = document.getElementById('contactPhone').value.trim();
    const notes = document.getElementById('contactNotes').value.trim();

    if (!name) {
      this.showToast('Name is required', 'error');
      return;
    }

    // If adjuster category and carrier selected, use carrier as company
    if (category === 'adjuster' && carrier && carrier !== 'other') {
      company = carrier;
    }

    try {
      const contact = await db.getContact(id);
      await db.updateContact({
        ...contact,
        name,
        category,
        company,
        email,
        phone,
        notes
      });
      this.closeModal();
      await this.renderContactList();
      this.showToast('Contact updated', 'success');
    } catch (error) {
      console.error('Failed to update contact:', error);
      this.showToast('Failed to update contact', 'error');
    }
  }

  async deleteContact(id) {
    if (!confirm('Are you sure you want to delete this contact?')) {
      return;
    }

    try {
      await db.deleteContact(id);
      await this.renderContactList();
      this.showToast('Contact deleted', 'success');
    } catch (error) {
      console.error('Failed to delete contact:', error);
      this.showToast('Failed to delete contact', 'error');
    }
  }

  // =====================
  // Setup Wizard
  // =====================

  wizardStep = 1;
  wizardSelectedTeam = [];
  wizardContexts = ['@phone', '@email', '@computer', '@office', '@errands', '@waiting'];

  showSetupWizard() {
    this.wizardStep = 1;
    this.wizardSelectedTeam = [];
    this.renderWizardStep();
  }

  renderWizardStep() {
    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    switch (this.wizardStep) {
      case 1:
        this.renderWizardWelcome(content);
        break;
      case 2:
        this.renderWizardTeam(content);
        break;
      case 3:
        this.renderWizardContexts(content);
        break;
      case 4:
        this.renderWizardComplete(content);
        break;
    }
  }

  renderWizardWelcome(container) {
    container.innerHTML = `
      <div class="wizard-content">
        <div class="wizard-icon">📥</div>
        <h2 class="wizard-title">Welcome to GTD Capture</h2>
        <p class="wizard-subtitle">Let's set up your personal productivity system.</p>

        <div class="wizard-features">
          <div class="wizard-feature">
            <span class="feature-icon">✨</span>
            <span class="feature-text">Capture thoughts quickly</span>
          </div>
          <div class="wizard-feature">
            <span class="feature-icon">📋</span>
            <span class="feature-text">Process items using GTD methodology</span>
          </div>
          <div class="wizard-feature">
            <span class="feature-icon">👥</span>
            <span class="feature-text">Delegate to your team</span>
          </div>
          <div class="wizard-feature">
            <span class="feature-icon">📊</span>
            <span class="feature-text">Track everything in one place</span>
          </div>
        </div>
      </div>
      <div class="modal-footer wizard-footer">
        <button class="btn btn-secondary" onclick="app.skipWizard()">Skip for Now</button>
        <button class="btn btn-primary" onclick="app.wizardNext()">Get Started</button>
      </div>
    `;
  }

  async renderWizardTeam(container) {
    const suggestedMembers = db.getSuggestedTeamMembers ? db.getSuggestedTeamMembers() : [];
    const roles = db.getTeamRoles ? db.getTeamRoles() : [];

    container.innerHTML = `
      <div class="wizard-content">
        <h2 class="wizard-title">Add Your Team</h2>
        <p class="wizard-subtitle">Who do you delegate tasks to? Select from suggestions or add your own.</p>

        <div class="wizard-team-grid" id="wizardTeamGrid">
          ${suggestedMembers.map(member => `
            <label class="wizard-team-option ${this.wizardSelectedTeam.some(m => m.name === member.name) ? 'selected' : ''}">
              <input type="checkbox"
                     value="${member.name}"
                     ${this.wizardSelectedTeam.some(m => m.name === member.name) ? 'checked' : ''}
                     onchange="app.toggleWizardTeam('${member.name}', '${member.role}')">
              <div class="team-option-avatar" style="background-color: ${member.color}">${member.name.charAt(0)}</div>
              <div class="team-option-info">
                <span class="team-option-name">${this.escapeHtml(member.name)}</span>
                <span class="team-option-role">${this.escapeHtml(member.role)}</span>
              </div>
            </label>
          `).join('')}
        </div>

        <div class="wizard-add-custom">
          <h4>Add Custom Team Member</h4>
          <div class="wizard-add-row">
            <input type="text" class="composer-input" id="wizardCustomName" placeholder="Name">
            <select class="composer-input" id="wizardCustomRole">
              <option value="">Role</option>
              ${roles.map(r => `<option value="${r}">${r}</option>`).join('')}
            </select>
            <button class="btn btn-secondary" onclick="app.addWizardCustomTeam()">Add</button>
          </div>
        </div>

        <div class="wizard-selected-list" id="wizardSelectedList">
          ${this.wizardSelectedTeam.length > 0 ? `
            <h4>Selected Team Members (${this.wizardSelectedTeam.length})</h4>
            <div class="selected-team-tags">
              ${this.wizardSelectedTeam.map(m => `
                <span class="selected-team-tag">
                  ${this.escapeHtml(m.name)}
                  <button onclick="app.removeWizardTeam('${m.name}')">&times;</button>
                </span>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>
      <div class="modal-footer wizard-footer">
        <button class="btn btn-secondary" onclick="app.wizardBack()">Back</button>
        <button class="btn btn-primary" onclick="app.wizardNext()">Next: Contexts</button>
      </div>
    `;
  }

  toggleWizardTeam(name, role) {
    const existingIndex = this.wizardSelectedTeam.findIndex(m => m.name === name);
    if (existingIndex >= 0) {
      this.wizardSelectedTeam.splice(existingIndex, 1);
    } else {
      this.wizardSelectedTeam.push({ name, role });
    }
    this.renderWizardStep();
  }

  removeWizardTeam(name) {
    this.wizardSelectedTeam = this.wizardSelectedTeam.filter(m => m.name !== name);
    this.renderWizardStep();
  }

  addWizardCustomTeam() {
    const name = document.getElementById('wizardCustomName').value.trim();
    const role = document.getElementById('wizardCustomRole').value;

    if (!name) {
      this.showToast('Please enter a name', 'error');
      return;
    }

    if (!this.wizardSelectedTeam.some(m => m.name === name)) {
      this.wizardSelectedTeam.push({ name, role: role || 'Team Member' });
      this.renderWizardStep();
    }
  }

  renderWizardContexts(container) {
    const defaultContexts = ['@phone', '@email', '@computer', '@office', '@errands', '@home', '@waiting', '@anywhere'];

    container.innerHTML = `
      <div class="wizard-content">
        <h2 class="wizard-title">Choose Your Contexts</h2>
        <p class="wizard-subtitle">Contexts help you organize actions by where or how you'll do them.</p>

        <div class="wizard-context-grid" id="wizardContextGrid">
          ${defaultContexts.map(ctx => `
            <label class="wizard-context-option ${this.wizardContexts.includes(ctx) ? 'selected' : ''}">
              <input type="checkbox"
                     value="${ctx}"
                     ${this.wizardContexts.includes(ctx) ? 'checked' : ''}
                     onchange="app.toggleWizardContext('${ctx}')">
              <span class="context-option-icon">${this.getContextIcon(ctx)}</span>
              <span class="context-option-name">${ctx}</span>
            </label>
          `).join('')}
        </div>

        <div class="wizard-add-custom">
          <h4>Add Custom Context</h4>
          <div class="wizard-add-row">
            <input type="text" class="composer-input" id="wizardCustomContext" placeholder="@context-name">
            <button class="btn btn-secondary" onclick="app.addWizardCustomContext()">Add</button>
          </div>
        </div>
      </div>
      <div class="modal-footer wizard-footer">
        <button class="btn btn-secondary" onclick="app.wizardBack()">Back</button>
        <button class="btn btn-primary" onclick="app.wizardNext()">Finish Setup</button>
      </div>
    `;
  }

  getContextIcon(context) {
    const icons = {
      '@phone': '📞',
      '@email': '📧',
      '@computer': '💻',
      '@office': '🏢',
      '@errands': '🚗',
      '@home': '🏠',
      '@waiting': '⏳',
      '@anywhere': '🌍'
    };
    return icons[context] || '📌';
  }

  toggleWizardContext(context) {
    const index = this.wizardContexts.indexOf(context);
    if (index >= 0) {
      this.wizardContexts.splice(index, 1);
    } else {
      this.wizardContexts.push(context);
    }
    this.renderWizardStep();
  }

  addWizardCustomContext() {
    let context = document.getElementById('wizardCustomContext').value.trim();

    if (!context) {
      this.showToast('Please enter a context name', 'error');
      return;
    }

    // Ensure it starts with @
    if (!context.startsWith('@')) {
      context = '@' + context;
    }

    if (!this.wizardContexts.includes(context)) {
      this.wizardContexts.push(context);
      this.renderWizardStep();
    }
  }

  renderWizardComplete(container) {
    container.innerHTML = `
      <div class="wizard-content">
        <div class="wizard-icon success">✓</div>
        <h2 class="wizard-title">You're All Set!</h2>
        <p class="wizard-subtitle">Your GTD system is ready to go.</p>

        <div class="wizard-summary">
          ${this.wizardSelectedTeam.length > 0 ? `
            <div class="summary-item">
              <span class="summary-label">Team Members:</span>
              <span class="summary-value">${this.wizardSelectedTeam.length} added</span>
            </div>
          ` : ''}
          <div class="summary-item">
            <span class="summary-label">Contexts:</span>
            <span class="summary-value">${this.wizardContexts.length} enabled</span>
          </div>
        </div>

        <div class="wizard-tips">
          <h4>Quick Tips</h4>
          <ul>
            <li>Press <kbd>Cmd/Ctrl + K</kbd> to quickly capture thoughts</li>
            <li>Click any inbox item to process it through GTD workflow</li>
            <li>Use <kbd>?</kbd> to view all keyboard shortcuts</li>
          </ul>
        </div>
      </div>
      <div class="modal-footer wizard-footer">
        <button class="btn btn-primary" onclick="app.completeWizard()">Start Using GTD Capture</button>
      </div>
    `;
  }

  wizardNext() {
    this.wizardStep++;
    this.renderWizardStep();
  }

  wizardBack() {
    this.wizardStep--;
    this.renderWizardStep();
  }

  skipWizard() {
    this.closeModal();
    db.markOnboardingComplete();
  }

  async completeWizard() {
    try {
      // Save team members (clears existing first)
      await db.saveOnboardingTeamMembers(this.wizardSelectedTeam);

      // Save contexts
      await db.saveOnboardingContexts(this.wizardContexts);
      this.contexts = this.wizardContexts;

      // Mark onboarding complete
      await db.markOnboardingComplete();

      this.closeModal();
      await this.renderCurrentView();
      this.showToast('Welcome to GTD Capture!', 'success');
    } catch (error) {
      console.error('Failed to complete wizard:', error);
      this.showToast('Failed to save settings', 'error');
    }
  }

  // =====================
  // Templates
  // =====================

  async showTemplatesModal() {
    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    let templates = await db.getTemplates();

    // If no templates, initialize defaults
    if (templates.length === 0) {
      await db.initializeTemplates();
      templates = await db.getTemplates();
    }

    if (templates.length === 0) {
      content.innerHTML = `
        <div class="modal-header">
          <h3>Create Project from Template</h3>
        </div>
        <div class="modal-body">
          <div class="empty-state">
            <p>No templates available yet.</p>
            <button class="btn btn-primary" onclick="app.createDefaultTemplates()">Create Default Templates</button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        </div>
      `;
      return;
    }

    content.innerHTML = `
      <div class="modal-header">
        <h3>Create Project from Template</h3>
      </div>
      <div class="modal-body">
        <div class="template-grid">
          ${templates.map(t => `
            <div class="template-card" onclick="app.selectTemplate('${t.id}')">
              <div class="template-icon">${t.icon || '📋'}</div>
              <div class="template-info">
                <div class="template-name">${this.escapeHtml(t.name)}</div>
                <div class="template-meta">${(t.actions || []).length} actions • ${t.category || 'General'}</div>
              </div>
              ${t.isDefault ? '<span class="template-badge">Built-in</span>' : ''}
            </div>
          `).join('')}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
      </div>
    `;
  }

  async createDefaultTemplates() {
    try {
      await db.initializeTemplates();
      this.showToast('Default templates created!', 'success');
      await this.showTemplatesModal(); // Refresh the modal
    } catch (error) {
      console.error('Failed to create templates:', error);
      this.showToast('Failed to create templates', 'error');
    }
  }

  async selectTemplate(templateId) {
    const template = await db.getTemplate(templateId);
    if (!template) return;

    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');

    content.innerHTML = `
      <div class="modal-header">
        <h3>${template.icon || '📋'} ${this.escapeHtml(template.name)}</h3>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Project Name</label>
          <input type="text" id="templateProjectName" class="form-control" placeholder="Enter project name" value="">
        </div>
        <div class="form-group">
          <label>Start Date</label>
          <input type="date" id="templateStartDate" class="form-control" value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="template-preview">
          <label>Actions to be created (${(template.actions || []).length})</label>
          <div class="template-actions-preview">
            ${(template.actions || []).map((a, i) => `
              <div class="preview-action">
                <span class="preview-num">${i + 1}</span>
                <span class="preview-text">${this.escapeHtml(a.action)}</span>
                <span class="preview-offset">${a.daysOffset === 0 ? 'Start' : `+${a.daysOffset}d`}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.showTemplatesModal()">Back</button>
        <button class="btn btn-primary" onclick="app.createFromTemplate('${templateId}')">Create Project</button>
      </div>
    `;

    document.getElementById('templateProjectName').focus();
  }

  async createFromTemplate(templateId) {
    const projectName = document.getElementById('templateProjectName').value.trim();
    const startDate = document.getElementById('templateStartDate').value;

    if (!projectName) {
      this.showToast('Please enter a project name', 'error');
      return;
    }

    try {
      const project = await db.createProjectFromTemplate(templateId, projectName, startDate);
      this.closeModal();
      await this.updateCounts();
      this.showToast(`Project "${projectName}" created with all actions!`, 'success');
      this.navigateTo('projects');
    } catch (error) {
      console.error('Failed to create project from template:', error);
      this.showToast('Failed to create project', 'error');
    }
  }

  // =====================
  // Assigned to Me View (Team)
  // =====================

  async renderAssignedToMeView() {
    const container = document.getElementById('assignedList');
    if (!container) return;

    if (!this.currentTeam) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="8.5" cy="7" r="4"></circle>
            <polyline points="17 11 19 13 23 9"></polyline>
          </svg>
          <h3>No Team</h3>
          <p>Join or create a team in Settings to see assigned tasks</p>
        </div>
      `;
      return;
    }

    try {
      const assignments = await db.getAssignedToMe(this.currentTeam.id);

      if (assignments.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="8.5" cy="7" r="4"></circle>
              <polyline points="17 11 19 13 23 9"></polyline>
            </svg>
            <h3>All Clear!</h3>
            <p>No tasks assigned to you right now</p>
          </div>
        `;
        return;
      }

      // Get team members for display names
      const members = await db.getCloudTeamMembers(this.currentTeam.id);
      const memberMap = {};
      members.forEach(m => memberMap[m.id] = m.displayName || m.email || 'Unknown');

      container.innerHTML = assignments.map(item => {
        const delegatorName = memberMap[item.delegatorId] || 'Team member';
        const delegatedDate = this.formatDate(item.delegatedAt);

        return `
          <div class="assigned-item" data-id="${item.id}">
            <div class="assigned-content">
              <div class="assigned-action">${this.escapeHtml(item.actionContent)}</div>
              <div class="assigned-meta">
                <span class="delegator-name">From: ${this.escapeHtml(delegatorName)}</span>
                <span class="delegated-date">${delegatedDate}</span>
              </div>
              ${item.contexts && item.contexts.length > 0 ? `
                <div class="context-tags">
                  ${item.contexts.map(ctx => `<span class="context-tag">${this.escapeHtml(ctx)}</span>`).join('')}
                </div>
              ` : ''}
            </div>
            <div class="assigned-actions">
              <button class="btn btn-primary btn-sm" onclick="app.completeAssignment('${item.id}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Complete
              </button>
            </div>
          </div>
        `;
      }).join('');

    } catch (error) {
      console.error('Failed to render assigned items:', error);
      container.innerHTML = '<p class="error-text">Failed to load assigned tasks</p>';
    }
  }

  async completeAssignment(delegationId) {
    if (!this.currentTeam) return;

    try {
      await db.completeDelegation(delegationId, this.currentTeam.id);
      await this.updateCounts();
      await this.renderAssignedToMeView();
      this.showToast('Task completed!', 'success');
    } catch (error) {
      console.error('Failed to complete assignment:', error);
      this.showToast('Failed to complete task', 'error');
    }
  }

  updateTeamNavVisibility() {
    const assignedNav = document.getElementById('assignedToMeNav');
    if (assignedNav) {
      assignedNav.style.display = this.currentTeam ? 'flex' : 'none';
    }
  }

  renderTeamActivityFeed(activities) {
    const container = document.getElementById('teamActivityFeed');
    if (!container) return;

    if (!activities || activities.length === 0) {
      container.innerHTML = '<p class="empty-hint">No recent activity</p>';
      return;
    }

    container.innerHTML = activities.slice(0, 10).map(activity => {
      const timeAgo = this.getTimeAgo(activity.timestamp);
      let icon = '';
      let message = '';

      switch (activity.type) {
        case 'delegation':
          icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>';
          message = `<strong>${this.escapeHtml(activity.userName)}</strong> delegated "${this.escapeHtml(this.truncate(activity.data?.actionContent || '', 40))}"`;
          break;
        case 'completion':
          icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>';
          message = `<strong>${this.escapeHtml(activity.userName)}</strong> completed "${this.escapeHtml(this.truncate(activity.data?.actionContent || '', 40))}"`;
          break;
        case 'join':
          icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/></svg>';
          message = `<strong>${this.escapeHtml(activity.userName)}</strong> joined the team`;
          break;
        default:
          icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/></svg>';
          message = `<strong>${this.escapeHtml(activity.userName)}</strong> performed an action`;
      }

      return `
        <div class="activity-item">
          <span class="activity-icon">${icon}</span>
          <div class="activity-content">
            <span class="activity-message">${message}</span>
            <span class="activity-time">${timeAgo}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  }

  async loadTeamActivity() {
    if (!this.currentTeam) return;

    try {
      const activities = await db.getTeamActivity(this.currentTeam.id);
      this.renderTeamActivityFeed(activities);
    } catch (error) {
      console.error('Failed to load team activity:', error);
    }
  }

  // =====================
  // Projects View
  // =====================
  async renderProjectsView() {
    const container = document.getElementById('projectsList');
    if (!container) return;
    let projects = await db.getProjects();

    // Update dashboard stats
    const allProjects = projects;
    const activeCount = allProjects.filter(p => p.status === 'active').length;
    const onHoldCount = allProjects.filter(p => p.status === 'on-hold').length;
    const completedCount = allProjects.filter(p => p.status === 'completed').length;

    document.getElementById('activeProjectsCount').textContent = activeCount;
    document.getElementById('onHoldProjectsCount').textContent = onHoldCount;
    document.getElementById('completedProjectsCount').textContent = completedCount;

    // Apply filter
    if (this.projectFilter !== 'all') {
      projects = projects.filter(p => p.status === this.projectFilter);
    }

    // Setup filter buttons
    this.setupProjectFilters();

    if (projects.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          <h3>${this.projectFilter !== 'all' ? `No ${this.projectFilter} Projects` : 'No Projects Yet'}</h3>
          <p>${this.projectFilter !== 'all' ? 'Try selecting a different filter' : 'Create your first project to organize multi-step outcomes'}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = projects.map(project => this.renderProjectCard(project)).join('');
  }

  renderProjectCard(project) {
    const statusClass = project.status === 'active' ? 'active' :
                        project.status === 'on-hold' ? 'on-hold' : 'completed';
    const progressPercent = project.progress || 0;

    return `
      <div class="project-card ${statusClass}" data-id="${project.id}">
        <div class="project-card-header">
          <div class="project-status-badge ${statusClass}">${project.status}</div>
          <div class="project-actions-menu">
            <button class="btn-icon" onclick="app.showProjectMenu('${project.id}')" title="More options">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="1"></circle>
                <circle cx="12" cy="5" r="1"></circle>
                <circle cx="12" cy="19" r="1"></circle>
              </svg>
            </button>
          </div>
        </div>
        <h3 class="project-title" onclick="app.viewProject('${project.id}')">${this.escapeHtml(project.name)}</h3>
        ${project.description ? `<p class="project-description">${this.escapeHtml(this.truncate(project.description, 100))}</p>` : ''}
        ${project.category ? `<span class="project-category">${this.escapeHtml(project.category)}</span>` : ''}
        <div class="project-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progressPercent}%"></div>
          </div>
          <span class="progress-text">${progressPercent}% complete</span>
        </div>
        <div class="project-meta">
          <span>Created ${this.formatDate(project.created)}</span>
          ${project.dueDate ? `<span class="due-date">Due ${this.formatDate(project.dueDate)}</span>` : ''}
        </div>
      </div>
    `;
  }

  setupProjectFilters() {
    const filterBtns = document.querySelectorAll('#projectFilters .filter-btn');
    filterBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === this.projectFilter);
      btn.onclick = () => this.setProjectFilter(btn.dataset.filter);
    });

    // Setup add project button
    const addBtn = document.getElementById('addProjectBtn');
    if (addBtn) {
      addBtn.onclick = () => this.showAddProjectModal();
    }
  }

  setProjectFilter(filter) {
    this.projectFilter = filter;
    this.renderProjectsView();
  }

  showAddProjectModal() {
    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    // Clear any previous suggested steps
    this.suggestedSteps = [];

    content.innerHTML = `
      <div class="modal-header">
        <h3>Create New Project</h3>
      </div>
      <div class="modal-body">
        <div class="composer-field">
          <label>Project Name *</label>
          <div class="input-with-action">
            <input type="text" class="composer-input" id="projectName" placeholder="e.g., New Insurance Claim" oninput="app.onProjectNameChange()">
            ${this.settings.enableStepSuggestions !== false ? `
            <button class="btn btn-secondary suggest-btn" id="suggestStepsBtn" onclick="app.suggestProjectSteps()" title="Get suggested steps">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
              Suggest Steps
            </button>
            ` : ''}
          </div>
        </div>
        <div class="composer-field">
          <label>Description</label>
          <textarea class="composer-textarea" id="projectDescription" placeholder="What is the desired outcome?"></textarea>
        </div>
        <div class="composer-row">
          <div class="composer-field flex-1">
            <label>Category</label>
            <select class="composer-input" id="projectCategory">
              <option value="">Select category...</option>
              <option value="Work">Work</option>
              <option value="Personal">Personal</option>
              <option value="Home">Home</option>
              <option value="Health">Health</option>
              <option value="Financial">Financial</option>
              <option value="Learning">Learning</option>
            </select>
          </div>
          <div class="composer-field flex-1">
            <label>Action Mode</label>
            <select class="composer-input" id="projectActionMode">
              <option value="sequential" ${this.settings.defaultActionMode === 'sequential' ? 'selected' : ''}>Sequential (unlock as you go)</option>
              <option value="parallel" ${this.settings.defaultActionMode !== 'sequential' ? 'selected' : ''}>Parallel (all visible)</option>
            </select>
          </div>
        </div>
        <div class="composer-field">
          <label>Due Date (optional)</label>
          <input type="date" class="composer-input" id="projectDueDate">
        </div>

        <!-- Suggested Steps Section -->
        <div class="suggested-steps-section" id="suggestedStepsSection" style="display: none;">
          <div class="suggested-steps-header">
            <label>Suggested Steps</label>
            <div class="suggested-steps-actions">
              <button class="btn-link" onclick="app.selectAllSteps()">Select All</button>
              <button class="btn-link" onclick="app.clearAllSteps()">Clear All</button>
            </div>
          </div>
          <div class="suggested-steps-list" id="suggestedStepsList">
            <!-- Dynamic content -->
          </div>
          <button class="btn btn-secondary btn-sm add-step-btn" onclick="app.addCustomStep()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Add Custom Step
          </button>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.createProject()">Create Project</button>
      </div>
    `;

    document.getElementById('projectName').focus();
  }

  onProjectNameChange() {
    // Show/hide suggest button based on name content
    const name = document.getElementById('projectName').value.trim();
    const btn = document.getElementById('suggestStepsBtn');
    if (btn) {
      btn.style.opacity = name.length >= 3 ? '1' : '0.5';
    }
  }

  getSuggestedStepsForProject(projectName) {
    const name = projectName.toLowerCase();

    // Project type detection and suggestions
    const projectTemplates = {
      insurance: {
        keywords: ['insurance', 'claim', 'adjuster'],
        steps: [
          { action: 'Initial client contact', context: '@phone', daysOffset: 0 },
          { action: 'Schedule site assessment', context: '@phone', daysOffset: 1 },
          { action: 'Document damage with photos', context: '@errands', daysOffset: 2 },
          { action: 'Create estimate', context: '@computer', daysOffset: 3 },
          { action: 'Submit estimate to adjuster', context: '@email', daysOffset: 4 },
          { action: 'Wait for adjuster approval', context: '@waiting', daysOffset: 7 },
          { action: 'Schedule work', context: '@phone', daysOffset: 8 },
          { action: 'Execute project', context: '@errands', daysOffset: 10 },
          { action: 'Submit final invoice', context: '@computer', daysOffset: 14 },
          { action: 'Wait for payment', context: '@waiting', daysOffset: 21 }
        ]
      },
      construction: {
        keywords: ['construction', 'build', 'renovation', 'remodel', 'repair'],
        steps: [
          { action: 'Initial site visit', context: '@errands', daysOffset: 0 },
          { action: 'Create project estimate', context: '@computer', daysOffset: 2 },
          { action: 'Present estimate to client', context: '@phone', daysOffset: 3 },
          { action: 'Get signed contract', context: '@waiting', daysOffset: 5 },
          { action: 'Order materials', context: '@computer', daysOffset: 6 },
          { action: 'Schedule crew', context: '@phone', daysOffset: 7 },
          { action: 'Begin work', context: '@errands', daysOffset: 10 },
          { action: 'Mid-project inspection', context: '@errands', daysOffset: 15 },
          { action: 'Complete final work', context: '@errands', daysOffset: 20 },
          { action: 'Final walkthrough with client', context: '@errands', daysOffset: 21 },
          { action: 'Submit invoice', context: '@computer', daysOffset: 22 }
        ]
      },
      event: {
        keywords: ['party', 'event', 'wedding', 'birthday', 'celebration', 'meeting'],
        steps: [
          { action: 'Set date and budget', context: '@computer', daysOffset: 0 },
          { action: 'Create guest list', context: '@computer', daysOffset: 1 },
          { action: 'Book venue', context: '@phone', daysOffset: 3 },
          { action: 'Send invitations', context: '@email', daysOffset: 5 },
          { action: 'Arrange catering', context: '@phone', daysOffset: 7 },
          { action: 'Plan decorations', context: '@computer', daysOffset: 10 },
          { action: 'Confirm RSVPs', context: '@phone', daysOffset: 14 },
          { action: 'Finalize details', context: '@computer', daysOffset: -3 },
          { action: 'Setup event', context: '@errands', daysOffset: -1 },
          { action: 'Host event', context: '@errands', daysOffset: 0 }
        ]
      },
      hiring: {
        keywords: ['hire', 'recruit', 'hiring', 'interview', 'candidate'],
        steps: [
          { action: 'Define job requirements', context: '@computer', daysOffset: 0 },
          { action: 'Write job posting', context: '@computer', daysOffset: 1 },
          { action: 'Post to job boards', context: '@computer', daysOffset: 2 },
          { action: 'Review applications', context: '@computer', daysOffset: 7 },
          { action: 'Phone screen candidates', context: '@phone', daysOffset: 10 },
          { action: 'Schedule interviews', context: '@email', daysOffset: 12 },
          { action: 'Conduct interviews', context: '@office', daysOffset: 14 },
          { action: 'Check references', context: '@phone', daysOffset: 17 },
          { action: 'Make offer', context: '@phone', daysOffset: 19 },
          { action: 'Complete onboarding', context: '@office', daysOffset: 25 }
        ]
      },
      vendor: {
        keywords: ['vendor', 'evaluation', 'compare', 'select', 'purchase'],
        steps: [
          { action: 'Define requirements', context: '@computer', daysOffset: 0 },
          { action: 'Research vendors', context: '@computer', daysOffset: 2 },
          { action: 'Request quotes', context: '@email', daysOffset: 4 },
          { action: 'Compare proposals', context: '@computer', daysOffset: 7 },
          { action: 'Schedule demos', context: '@email', daysOffset: 9 },
          { action: 'Review demos', context: '@computer', daysOffset: 12 },
          { action: 'Negotiate terms', context: '@phone', daysOffset: 14 },
          { action: 'Get approval', context: '@waiting', daysOffset: 16 },
          { action: 'Sign contract', context: '@office', daysOffset: 18 }
        ]
      },
      website: {
        keywords: ['website', 'web', 'app', 'software', 'development'],
        steps: [
          { action: 'Define requirements', context: '@computer', daysOffset: 0 },
          { action: 'Create wireframes', context: '@computer', daysOffset: 3 },
          { action: 'Review with stakeholders', context: '@phone', daysOffset: 5 },
          { action: 'Design mockups', context: '@computer', daysOffset: 8 },
          { action: 'Get design approval', context: '@waiting', daysOffset: 10 },
          { action: 'Development phase', context: '@computer', daysOffset: 12 },
          { action: 'Testing', context: '@computer', daysOffset: 20 },
          { action: 'Client review', context: '@phone', daysOffset: 22 },
          { action: 'Launch', context: '@computer', daysOffset: 25 }
        ]
      }
    };

    // Find matching template
    for (const [type, template] of Object.entries(projectTemplates)) {
      for (const keyword of template.keywords) {
        if (name.includes(keyword)) {
          return {
            type: type,
            steps: template.steps.map((step, index) => ({
              ...step,
              id: `suggested-${index}`,
              selected: true
            }))
          };
        }
      }
    }

    // Default generic steps
    return {
      type: 'generic',
      steps: [
        { id: 'suggested-0', action: 'Define project scope', context: '@computer', daysOffset: 0, selected: true },
        { id: 'suggested-1', action: 'Gather requirements', context: '@phone', daysOffset: 2, selected: true },
        { id: 'suggested-2', action: 'Create plan', context: '@computer', daysOffset: 4, selected: true },
        { id: 'suggested-3', action: 'Execute main work', context: '@anywhere', daysOffset: 7, selected: true },
        { id: 'suggested-4', action: 'Review and finalize', context: '@computer', daysOffset: 14, selected: true }
      ]
    };
  }

  suggestProjectSteps() {
    if (this.settings.enableStepSuggestions === false) {
      return;
    }

    const name = document.getElementById('projectName').value.trim();
    if (name.length < 3) {
      this.showToast('Enter a project name first', 'warning');
      return;
    }

    const suggestions = this.getSuggestedStepsForProject(name);
    this.suggestedSteps = suggestions.steps;

    // Show the suggestions section
    const section = document.getElementById('suggestedStepsSection');
    section.style.display = 'block';

    this.renderSuggestedSteps();
    this.showToast(`Found ${suggestions.steps.length} suggested steps`, 'success');
  }

  renderSuggestedSteps() {
    const list = document.getElementById('suggestedStepsList');
    if (!list) return;

    list.innerHTML = this.suggestedSteps.map((step, index) => `
      <div class="suggested-step-item ${step.selected ? 'selected' : ''}" data-index="${index}">
        <label class="step-checkbox">
          <input type="checkbox" ${step.selected ? 'checked' : ''} onchange="app.toggleSuggestedStep(${index})">
          <span class="step-number">${index + 1}</span>
        </label>
        <input type="text" class="step-action-input" value="${this.escapeHtml(step.action)}"
               onchange="app.updateSuggestedStep(${index}, 'action', this.value)" placeholder="Action description">
        <select class="step-context-select" onchange="app.updateSuggestedStep(${index}, 'context', this.value)">
          <option value="@phone" ${step.context === '@phone' ? 'selected' : ''}>@phone</option>
          <option value="@email" ${step.context === '@email' ? 'selected' : ''}>@email</option>
          <option value="@computer" ${step.context === '@computer' ? 'selected' : ''}>@computer</option>
          <option value="@errands" ${step.context === '@errands' ? 'selected' : ''}>@errands</option>
          <option value="@office" ${step.context === '@office' ? 'selected' : ''}>@office</option>
          <option value="@waiting" ${step.context === '@waiting' ? 'selected' : ''}>@waiting</option>
          <option value="@anywhere" ${step.context === '@anywhere' ? 'selected' : ''}>@anywhere</option>
        </select>
        <button class="btn-icon remove-step-btn" onclick="app.removeSuggestedStep(${index})" title="Remove step">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `).join('');
  }

  toggleSuggestedStep(index) {
    if (this.suggestedSteps[index]) {
      this.suggestedSteps[index].selected = !this.suggestedSteps[index].selected;
      this.renderSuggestedSteps();
    }
  }

  updateSuggestedStep(index, field, value) {
    if (this.suggestedSteps[index]) {
      this.suggestedSteps[index][field] = value;
    }
  }

  removeSuggestedStep(index) {
    this.suggestedSteps.splice(index, 1);
    this.renderSuggestedSteps();
  }

  addCustomStep() {
    const newIndex = this.suggestedSteps.length;
    this.suggestedSteps.push({
      id: `custom-${newIndex}`,
      action: '',
      context: '@anywhere',
      daysOffset: 0,
      selected: true
    });
    this.renderSuggestedSteps();

    // Focus the new input
    setTimeout(() => {
      const inputs = document.querySelectorAll('.step-action-input');
      if (inputs.length > 0) {
        inputs[inputs.length - 1].focus();
      }
    }, 50);
  }

  selectAllSteps() {
    this.suggestedSteps.forEach(step => step.selected = true);
    this.renderSuggestedSteps();
  }

  clearAllSteps() {
    this.suggestedSteps.forEach(step => step.selected = false);
    this.renderSuggestedSteps();
  }

  async createProject() {
    const name = document.getElementById('projectName').value.trim();
    if (!name) {
      this.showToast('Project name is required', 'error');
      return;
    }

    const actionMode = document.getElementById('projectActionMode')?.value || 'parallel';

    const projectData = {
      name: name,
      description: document.getElementById('projectDescription').value.trim(),
      category: document.getElementById('projectCategory').value,
      dueDate: document.getElementById('projectDueDate').value || null,
      actionMode: actionMode
    };

    try {
      const project = await db.addProject(projectData);

      // Create actions from selected suggested steps
      if (this.suggestedSteps && this.suggestedSteps.length > 0) {
        const selectedSteps = this.suggestedSteps.filter(s => s.selected && s.action.trim());
        const isSequential = actionMode === 'sequential';
        let previousActionId = null;

        for (let i = 0; i < selectedSteps.length; i++) {
          const step = selectedSteps[i];
          const startDate = new Date();
          startDate.setDate(startDate.getDate() + (step.daysOffset || 0));

          const action = await db.createAction({
            action: step.action,
            contexts: [step.context],
            projectId: project.id,
            dueDate: startDate.toISOString().split('T')[0],
            sequenceOrder: isSequential ? i + 1 : null,
            dependsOn: previousActionId,
            isSequential: isSequential
          });

          previousActionId = action.id;
        }

        // Update project action count
        project.actionCount = selectedSteps.length;
        await db.updateProject(project);
      }

      this.closeModal();
      await this.updateCounts();
      await this.renderProjectsView();
      this.showToast('Project created!', 'success');
    } catch (error) {
      console.error('Failed to create project:', error);
      this.showToast('Failed to create project', 'error');
    }
  }

  async viewProject(id) {
    const project = await db.getProjectWithActions(id);
    if (!project) return;

    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    const statusClass = project.status === 'active' ? 'active' :
                        project.status === 'on-hold' ? 'on-hold' : 'completed';

    content.innerHTML = `
      <div class="modal-header">
        <h3>${this.escapeHtml(project.name)}</h3>
        <span class="project-status-badge ${statusClass}">${project.status}</span>
      </div>
      <div class="modal-body">
        ${project.description ? `<p class="project-description-full">${this.escapeHtml(project.description)}</p>` : ''}

        <div class="project-details">
          ${project.category ? `<div class="detail-row"><span>Category:</span> ${this.escapeHtml(project.category)}</div>` : ''}
          <div class="detail-row"><span>Created:</span> ${this.formatDate(project.created)}</div>
          ${project.dueDate ? `<div class="detail-row"><span>Due:</span> ${this.formatDate(project.dueDate)}</div>` : ''}
          <div class="detail-row"><span>Progress:</span> ${project.progress || 0}%</div>
        </div>

        <div class="project-actions-section">
          <h4>Linked Actions (${project.actions ? project.actions.length : 0})</h4>
          ${project.actions && project.actions.length > 0 ? `
            <div class="linked-actions-list">
              ${project.actions.map(action => `
                <div class="linked-action-item">
                  <span class="action-text">${this.escapeHtml(action.action)}</span>
                  <span class="action-contexts">${action.contexts.join(', ')}</span>
                </div>
              `).join('')}
            </div>
          ` : '<p class="empty-text">No actions linked to this project yet</p>'}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Close</button>
        <button class="btn btn-secondary" onclick="app.editProject('${id}')">Edit</button>
        ${project.status !== 'completed' ? `
          <button class="btn btn-success" onclick="app.markProjectComplete('${id}')">Mark Complete</button>
        ` : ''}
      </div>
    `;
  }

  async editProject(id) {
    const project = await db.getProject(id);
    if (!project) return;

    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    content.innerHTML = `
      <div class="modal-header">
        <h3>Edit Project</h3>
      </div>
      <div class="modal-body">
        <div class="composer-field">
          <label>Project Name *</label>
          <input type="text" class="composer-input" id="projectName" value="${this.escapeHtml(project.name)}">
        </div>
        <div class="composer-field">
          <label>Description</label>
          <textarea class="composer-textarea" id="projectDescription">${this.escapeHtml(project.description || '')}</textarea>
        </div>
        <div class="composer-field">
          <label>Status</label>
          <select class="composer-input" id="projectStatus">
            <option value="active" ${project.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="on-hold" ${project.status === 'on-hold' ? 'selected' : ''}>On Hold</option>
            <option value="completed" ${project.status === 'completed' ? 'selected' : ''}>Completed</option>
          </select>
        </div>
        <div class="composer-field">
          <label>Category</label>
          <select class="composer-input" id="projectCategory">
            <option value="">Select category...</option>
            <option value="Work" ${project.category === 'Work' ? 'selected' : ''}>Work</option>
            <option value="Personal" ${project.category === 'Personal' ? 'selected' : ''}>Personal</option>
            <option value="Home" ${project.category === 'Home' ? 'selected' : ''}>Home</option>
            <option value="Health" ${project.category === 'Health' ? 'selected' : ''}>Health</option>
            <option value="Financial" ${project.category === 'Financial' ? 'selected' : ''}>Financial</option>
            <option value="Learning" ${project.category === 'Learning' ? 'selected' : ''}>Learning</option>
          </select>
        </div>
        <div class="composer-field">
          <label>Due Date</label>
          <input type="date" class="composer-input" id="projectDueDate" value="${project.dueDate || ''}">
        </div>
        <div class="composer-field">
          <label>Progress (%)</label>
          <input type="number" class="composer-input" id="projectProgress" min="0" max="100" value="${project.progress || 0}">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-danger" onclick="app.deleteProject('${id}')">Delete</button>
        <button class="btn btn-secondary" onclick="app.viewProject('${id}')">Cancel</button>
        <button class="btn btn-primary" onclick="app.saveProject('${id}')">Save Changes</button>
      </div>
    `;
  }

  async saveProject(id) {
    const name = document.getElementById('projectName').value.trim();
    if (!name) {
      this.showToast('Project name is required', 'error');
      return;
    }

    const updates = {
      name: name,
      description: document.getElementById('projectDescription').value.trim(),
      status: document.getElementById('projectStatus').value,
      category: document.getElementById('projectCategory').value,
      dueDate: document.getElementById('projectDueDate').value || null,
      progress: parseInt(document.getElementById('projectProgress').value) || 0
    };

    try {
      await db.updateProject(id, updates);
      this.closeModal();
      await this.updateCounts();
      await this.renderProjectsView();
      this.showToast('Project updated!', 'success');
    } catch (error) {
      console.error('Failed to update project:', error);
      this.showToast('Failed to update project', 'error');
    }
  }

  async markProjectComplete(id) {
    try {
      await db.completeProject(id);
      this.closeModal();
      await this.updateCounts();
      await this.renderProjectsView();
      this.showToast('Project completed!', 'success');
    } catch (error) {
      console.error('Failed to complete project:', error);
      this.showToast('Failed to complete project', 'error');
    }
  }

  async deleteProject(id) {
    if (!confirm('Are you sure you want to delete this project?')) return;

    try {
      await db.deleteProject(id);
      this.closeModal();
      await this.updateCounts();
      await this.renderProjectsView();
      this.showToast('Project deleted', 'success');
    } catch (error) {
      console.error('Failed to delete project:', error);
      this.showToast('Failed to delete project', 'error');
    }
  }

  showProjectMenu(id) {
    // Simple implementation - could be enhanced with a dropdown menu
    this.viewProject(id);
  }

  // =====================
  // Archive View
  // =====================
  async renderArchiveView() {
    const container = document.getElementById('archiveList');
    if (!container) return;
    let items = await db.getArchivedItems();

    // Apply filter
    if (this.archiveFilter !== 'all') {
      items = items.filter(item => item.type === this.archiveFilter);
    }

    // Apply search
    if (this.archiveSearchQuery) {
      const query = this.archiveSearchQuery.toLowerCase();
      items = items.filter(item =>
        (item.action && item.action.toLowerCase().includes(query)) ||
        (item.content && item.content.toLowerCase().includes(query)) ||
        (item.name && item.name.toLowerCase().includes(query))
      );
    }

    // Setup filter buttons
    this.setupArchiveFilters();

    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <polyline points="21 8 21 21 3 21 3 8"></polyline>
            <rect x="1" y="3" width="22" height="5"></rect>
          </svg>
          <h3>Archive Empty</h3>
          <p>Completed items will appear here</p>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(item => this.renderArchiveItem(item)).join('');
  }

  renderArchiveItem(item) {
    const title = item.action || item.content || item.name || 'Untitled';
    const typeLabel = item.type === 'actions' ? 'Action' :
                      item.type === 'projects' ? 'Project' :
                      item.type === 'waiting' ? 'Waiting For' : 'Item';

    return `
      <div class="archive-item" data-id="${item.id}">
        <div class="archive-item-header">
          <span class="archive-type-badge">${typeLabel}</span>
          <span class="archive-date">Archived ${this.formatDate(item.archivedDate || item.completedDate)}</span>
        </div>
        <div class="archive-item-content">${this.escapeHtml(this.truncate(title, 150))}</div>
        <div class="archive-item-actions">
          <button class="btn-small" onclick="app.restoreFromArchive('${item.id}', '${item.type}')">Restore</button>
          <button class="btn-small danger" onclick="app.deleteFromArchive('${item.id}')">Delete</button>
        </div>
      </div>
    `;
  }

  setupArchiveFilters() {
    const filterBtns = document.querySelectorAll('#archiveFilters .filter-btn');
    filterBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === this.archiveFilter);
      btn.onclick = () => this.setArchiveFilter(btn.dataset.filter);
    });

    // Setup search
    const searchInput = document.getElementById('archiveSearch');
    if (searchInput) {
      searchInput.value = this.archiveSearchQuery;
      searchInput.oninput = (e) => {
        this.archiveSearchQuery = e.target.value;
        this.renderArchiveView();
      };
    }
  }

  setArchiveFilter(filter) {
    this.archiveFilter = filter;
    this.renderArchiveView();
  }

  async restoreFromArchive(id, type) {
    try {
      await db.restoreFromArchive(id, type);
      await this.updateCounts();
      await this.renderArchiveView();
      this.showToast('Item restored!', 'success');
    } catch (error) {
      console.error('Failed to restore:', error);
      this.showToast('Failed to restore item', 'error');
    }
  }

  async deleteFromArchive(id) {
    if (!confirm('Permanently delete this item?')) return;

    try {
      await db.deleteFromArchive(id);
      await this.renderArchiveView();
      this.showToast('Item deleted', 'success');
    } catch (error) {
      console.error('Failed to delete:', error);
      this.showToast('Failed to delete', 'error');
    }
  }

  // =====================
  // Trash View
  // =====================
  async renderTrashView() {
    const container = document.getElementById('trashList');
    if (!container) return;
    const items = await db.getTrashItems();

    // Setup empty trash button
    const emptyBtn = document.getElementById('emptyTrashBtn');
    if (emptyBtn) {
      emptyBtn.onclick = () => this.emptyTrash();
      emptyBtn.disabled = items.length === 0;
    }

    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          <h3>Trash is Empty</h3>
          <p>Deleted items will appear here for 30 days</p>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(item => this.renderTrashItem(item)).join('');
  }

  renderTrashItem(item) {
    const title = item.action || item.content || item.name || 'Untitled';
    const deletedDate = new Date(item.deletedDate);
    const expiresDate = new Date(deletedDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    const daysLeft = Math.ceil((expiresDate - new Date()) / (24 * 60 * 60 * 1000));

    return `
      <div class="trash-item" data-id="${item.id}">
        <div class="trash-item-header">
          <span class="trash-source">${item.originalStore || 'Unknown'}</span>
          <span class="trash-expires">${daysLeft} days left</span>
        </div>
        <div class="trash-item-content">${this.escapeHtml(this.truncate(title, 150))}</div>
        <div class="trash-item-actions">
          <button class="btn-small" onclick="app.restoreFromTrash('${item.id}')">Restore</button>
          <button class="btn-small danger" onclick="app.permanentlyDelete('${item.id}')">Delete Forever</button>
        </div>
      </div>
    `;
  }

  async restoreFromTrash(id) {
    try {
      await db.restoreFromTrash(id);
      await this.updateCounts();
      await this.renderTrashView();
      this.showToast('Item restored!', 'success');
    } catch (error) {
      console.error('Failed to restore:', error);
      this.showToast('Failed to restore item', 'error');
    }
  }

  async permanentlyDelete(id) {
    if (!confirm('Permanently delete this item? This cannot be undone.')) return;

    try {
      await db.permanentlyDeleteFromTrash(id);
      await this.updateCounts();
      await this.renderTrashView();
      this.showToast('Item permanently deleted', 'success');
    } catch (error) {
      console.error('Failed to delete:', error);
      this.showToast('Failed to delete', 'error');
    }
  }

  async emptyTrash() {
    if (!confirm('Permanently delete all items in trash? This cannot be undone.')) return;

    try {
      await db.emptyTrash();
      await this.updateCounts();
      await this.renderTrashView();
      this.showToast('Trash emptied', 'success');
    } catch (error) {
      console.error('Failed to empty trash:', error);
      this.showToast('Failed to empty trash', 'error');
    }
  }

  async updateCounts() {
    try {
      // Use forceServer on initial load or when explicitly requested
      const counts = await db.getCounts(this.forceServerRefresh || false);

      // Update today count (overdue + due today)
      const todayCountEl = document.getElementById('todayCount');
      if (todayCountEl) {
        const overdue = await db.getOverdueActions();
        const dueToday = await db.getActionsDueToday();
        const todayTotal = overdue.length + dueToday.length;
        todayCountEl.textContent = todayTotal;
        if (overdue.length > 0) {
          todayCountEl.classList.add('overdue');
        } else {
          todayCountEl.classList.remove('overdue');
        }
      }

      document.getElementById('inboxCount').textContent = counts.inbox;
      document.getElementById('actionsCount').textContent = counts.nextActions;
      document.getElementById('waitingCount').textContent = counts.waitingFor;
      document.getElementById('referenceCount').textContent = counts.reference;

      // Update projects count
      const projectsCountEl = document.getElementById('projectsCount');
      if (projectsCountEl) {
        projectsCountEl.textContent = counts.projects || 0;
      }

      // Update someday/maybe count
      const somedayCountEl = document.getElementById('somedayCount');
      if (somedayCountEl) {
        const somedayItems = await db.getSomedayMaybeItems();
        somedayCountEl.textContent = somedayItems.length;
      }

      // Update archive count
      const archiveCountEl = document.getElementById('archiveCount');
      if (archiveCountEl) {
        archiveCountEl.textContent = counts.archived || 0;
      }

      // Update trash count
      const trashCountEl = document.getElementById('trashCount');
      if (trashCountEl) {
        trashCountEl.textContent = counts.trash || 0;
      }

      // Update overdue badge
      const waitingCountEl = document.getElementById('waitingCount');
      if (counts.waitingOverdue && counts.waitingOverdue > 0) {
        waitingCountEl.classList.add('overdue');
        waitingCountEl.title = `${counts.waitingOverdue} overdue`;
      } else {
        waitingCountEl.classList.remove('overdue');
        waitingCountEl.title = '';
      }

      // Update context breakdown
      const breakdown = document.getElementById('contextBreakdown');
      if (counts.contextCounts && Object.keys(counts.contextCounts).length > 0) {
        const contextEntries = Object.entries(counts.contextCounts);
        const totalContextEntries = contextEntries.reduce((sum, [_, count]) => sum + count, 0);
        const hasMultiContext = totalContextEntries > counts.nextActions;

        breakdown.innerHTML = contextEntries
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([ctx, count]) => `
            <div class="context-count-item">
              <span>${ctx}</span>
              <span>${count}</span>
            </div>
          `).join('') + (hasMultiContext ? `
            <div class="context-note">* some actions have multiple contexts</div>
          ` : '');
        breakdown.style.display = 'block';
      } else {
        breakdown.style.display = 'none';
      }

      // Update waiting breakdown (if element exists)
      const waitingBreakdown = document.getElementById('waitingBreakdown');
      if (waitingBreakdown) {
        if (counts.waitingCounts && Object.keys(counts.waitingCounts).length > 0) {
          const teamMembers = await db.getTeamMembers();
          const memberColors = {};
          for (const member of teamMembers) {
            memberColors[member.id] = member.color;
          }

          waitingBreakdown.innerHTML = Object.entries(counts.waitingCounts)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([ctx, count]) => {
              const personName = ctx.replace('@waiting-for-', '');
              const personId = personName.toLowerCase();
              const dotClass = ['diana', 'ivan', 'anonno'].includes(personId) ? personId : 'other';

              return `
                <div class="waiting-sub-item" onclick="app.navigateTo('waitingFor')">
                  <span class="waiting-person-name">
                    <span class="person-dot ${dotClass}"></span>
                    ${personName}
                  </span>
                  <span>${count}</span>
                </div>
              `;
            }).join('');
          waitingBreakdown.style.display = 'block';
        } else {
          waitingBreakdown.style.display = 'none';
        }
      }

      // Update assigned to me count (team)
      const assignedCountEl = document.getElementById('assignedCount');
      if (assignedCountEl && this.currentTeam) {
        try {
          const assignments = await db.getAssignedToMe(this.currentTeam.id);
          assignedCountEl.textContent = assignments.length;
          if (assignments.length > 0) {
            assignedCountEl.classList.add('highlight');
          } else {
            assignedCountEl.classList.remove('highlight');
          }
        } catch (e) {
          assignedCountEl.textContent = '0';
        }
      }

      // Update team nav visibility
      this.updateTeamNavVisibility();
    } catch (error) {
      console.error('Failed to update counts:', error);
    }
  }

  // =====================
  // Processing Flow
  // =====================
  async startProcessing(id) {
    try {
      this.processingItem = await db.get('inbox', id);
      this.processingStep = 1;
      this.selectedContexts = [];
      this.selectedTags = [];
      this.selectedPriority = 'medium';
      this.selectedDueDate = null;
      this.selectedLocation = null;
      this.selectedProjectId = null;
      this.referenceTags = [];
      this.delegateTo = 'me';  // Default to "Myself"
      this.delegationMethod = null;
      this.actionText = '';
      this.aiSuggestion = null;
      this.aiSuggestionLoading = false;
      this.aiSuggestionError = null;

      // Generate suggestions
      this.actionSuggestions = db.generateActionSuggestions(this.processingItem.content);
      this.tagSuggestions = db.generateTagSuggestions(this.processingItem.content);

      // Check for errand-related content and auto-suggest @errands
      if (typeof geo !== 'undefined') {
        const locationInfo = geo.detectLocationInText(this.processingItem.content);
        if (locationInfo.isErrand && locationInfo.suggestedContext) {
          this.selectedContexts.push(locationInfo.suggestedContext);
        }
        if (locationInfo.locations.length > 0) {
          this.selectedLocation = locationInfo.locations[0];
        }
      }

      this.showProcessingModal();

      // Fetch AI suggestions in background (if enabled)
      this.fetchAISuggestions();
    } catch (error) {
      console.error('Failed to start processing:', error);
      this.showToast('Failed to load item', 'error');
    }
  }

  async fetchAISuggestions() {
    if (typeof window.aiService === 'undefined' || !window.aiService.aiSettings?.enableProcessingSuggestions) {
      return;
    }

    try {
      this.aiSuggestionLoading = true;
      this.updateAISuggestionUI();

      const suggestion = await window.aiService.getAIProcessingSuggestions(this.processingItem);
      this.aiSuggestion = suggestion;
      this.aiSuggestionLoading = false;
      this.updateAISuggestionUI();
    } catch (error) {
      console.error('Failed to get AI suggestions:', error);
      this.aiSuggestionLoading = false;
      this.aiSuggestionError = error.message;
      this.updateAISuggestionUI();
    }
  }

  updateAISuggestionUI() {
    const container = document.getElementById('aiSuggestionBox');
    if (!container) return;

    if (this.aiSuggestionLoading) {
      container.innerHTML = `
        <div class="ai-suggestion-loading">
          <div class="ai-loading-spinner"></div>
          <span>AI analyzing item...</span>
        </div>
      `;
      container.style.display = 'block';
      return;
    }

    if (this.aiSuggestionError) {
      container.innerHTML = `
        <div class="ai-suggestion-error">
          <span>AI suggestion unavailable</span>
        </div>
      `;
      container.style.display = 'block';
      return;
    }

    if (!this.aiSuggestion) {
      container.style.display = 'none';
      return;
    }

    const s = this.aiSuggestion;
    const analysis = s.analysis || {};
    const nonActionable = s.nonActionable || {};

    let suggestionHtml = '';

    if (s.actionable) {
      // Show original inbox text for reference when reviewing AI suggestion
      const originalText = this.processingItem?.content || '';
      const truncatedOriginal = originalText.length > 150 ? originalText.substring(0, 150) + '...' : originalText;

      suggestionHtml = `
        <div class="ai-suggestion-content">
          <div class="ai-suggestion-header">
            <span class="ai-badge">AI Suggestion</span>
            ${s.confidence ? `<span class="ai-confidence">${Math.round(s.confidence * 100)}% confident</span>` : ''}
          </div>
          <div class="ai-original-text">
            <span class="ai-original-label">Original:</span>
            <span class="ai-original-content">${this.escapeHtml(truncatedOriginal)}</span>
          </div>
          <div class="ai-suggestion-action">${this.escapeHtml(analysis.suggestedAction || '')}</div>
          <div class="ai-suggestion-meta">
            ${analysis.context ? `<span class="ai-context">${analysis.context}</span>` : ''}
            ${analysis.person ? `<span class="ai-person">${analysis.person}</span>` : ''}
            ${analysis.dueDate ? `<span class="ai-due">Due: ${new Date(analysis.dueDate).toLocaleDateString()}</span>` : ''}
            ${analysis.existingProject ? `<span class="ai-project">${analysis.existingProject}</span>` : ''}
            ${s.twoMinuteTask ? `<span class="ai-quick">2-min task</span>` : ''}
          </div>
          ${s.reasoning ? `<div class="ai-reasoning">${this.escapeHtml(s.reasoning)}</div>` : ''}
          <div class="ai-suggestion-actions">
            <button class="btn btn-primary" onclick="app.acceptAISuggestion()">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
              Accept
            </button>
            <button class="btn btn-secondary" onclick="app.modifyAISuggestion()">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              Modify
            </button>
            <button class="btn btn-secondary btn-danger-text" onclick="app.rejectAISuggestion()">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              Wrong
            </button>
          </div>
          <div class="ai-feedback-row">
            <span class="ai-feedback-label">Was this helpful?</span>
            <button class="btn-feedback" onclick="app.quickAIFeedback(true)" title="Helpful">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
            </button>
            <button class="btn-feedback" onclick="app.quickAIFeedback(false)" title="Not helpful">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path></svg>
            </button>
          </div>
        </div>
      `;
    } else {
      suggestionHtml = `
        <div class="ai-suggestion-content">
          <div class="ai-suggestion-header">
            <span class="ai-badge">AI Suggestion</span>
            <span class="ai-non-actionable">Not Actionable</span>
          </div>
          <div class="ai-suggestion-type">
            ${nonActionable.type === 'reference' ? 'Save as Reference' : ''}
            ${nonActionable.type === 'someday' ? 'Add to Someday/Maybe' : ''}
            ${nonActionable.type === 'trash' ? 'Trash It' : ''}
          </div>
          ${nonActionable.folder ? `<div class="ai-folder">Folder: ${nonActionable.folder}</div>` : ''}
          ${nonActionable.reason ? `<div class="ai-reasoning">${this.escapeHtml(nonActionable.reason)}</div>` : ''}
          <div class="ai-suggestion-actions">
            <button class="btn btn-primary" onclick="app.acceptAISuggestion()">Accept</button>
            <button class="btn btn-secondary btn-danger-text" onclick="app.rejectAISuggestion()">Wrong</button>
            <button class="btn btn-secondary" onclick="app.dismissAISuggestion()">Process Manually</button>
          </div>
          <div class="ai-feedback-row">
            <span class="ai-feedback-label">Was this helpful?</span>
            <button class="btn-feedback" onclick="app.quickAIFeedback(true)" title="Helpful">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
            </button>
            <button class="btn-feedback" onclick="app.quickAIFeedback(false)" title="Not helpful">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path></svg>
            </button>
          </div>
        </div>
      `;
    }

    container.innerHTML = suggestionHtml;
    container.style.display = 'block';
  }

  async acceptAISuggestion() {
    if (!this.aiSuggestion || !this.processingItem) return;

    try {
      // Record feedback as accepted
      await window.aiService.recordAIFeedback(
        this.processingItem.content,
        this.aiSuggestion,
        null, // No user correction for accept
        'accepted'
      );

      await window.aiService.acceptAISuggestion(this.processingItem, this.aiSuggestion);
      this.closeModal();
      await this.updateCounts();
      await this.renderCurrentView();
      this.showToast('Processed with AI suggestion', 'success');
    } catch (error) {
      console.error('Failed to accept AI suggestion:', error);
      this.showToast('Failed to process item', 'error');
    }
  }

  modifyAISuggestion() {
    // Store the original AI suggestion for later comparison
    this.originalAISuggestion = this.aiSuggestion;

    // Pre-fill the processing form with AI suggestions
    if (this.aiSuggestion && this.aiSuggestion.analysis) {
      const analysis = this.aiSuggestion.analysis;
      this.actionText = analysis.suggestedAction || '';
      if (analysis.context) {
        this.selectedContexts = [analysis.context];
      }
      if (analysis.dueDate) {
        this.selectedDueDate = analysis.dueDate;
      }
    }

    // Hide AI suggestion box but keep the data
    const container = document.getElementById('aiSuggestionBox');
    if (container) {
      container.style.display = 'none';
    }

    // Move to action definition step
    if (this.aiSuggestion?.actionable) {
      this.processingStep = 2;
      this.showProcessingModal();
    }
  }

  rejectAISuggestion() {
    // Show feedback modal for rejection
    this.showAIFeedbackModal();
  }

  showAIFeedbackModal() {
    const modal = document.createElement('div');
    modal.className = 'feedback-modal-overlay';
    modal.id = 'aiFeedbackModal';
    modal.innerHTML = `
      <div class="feedback-modal">
        <div class="feedback-modal-header">
          <h3>What was wrong with this suggestion?</h3>
          <button class="btn-close" onclick="app.closeAIFeedbackModal()">&times;</button>
        </div>
        <div class="feedback-modal-body">
          <div class="feedback-options">
            <label class="feedback-option">
              <input type="checkbox" name="feedback" value="wrong-context">
              <span>Wrong context</span>
            </label>
            <label class="feedback-option">
              <input type="checkbox" name="feedback" value="wrong-person">
              <span>Wrong person</span>
            </label>
            <label class="feedback-option">
              <input type="checkbox" name="feedback" value="wrong-project">
              <span>Wrong project</span>
            </label>
            <label class="feedback-option">
              <input type="checkbox" name="feedback" value="wrong-date">
              <span>Wrong date</span>
            </label>
            <label class="feedback-option">
              <input type="checkbox" name="feedback" value="not-actionable">
              <span>Not actionable (should be reference/someday/trash)</span>
            </label>
            <label class="feedback-option">
              <input type="checkbox" name="feedback" value="bad-phrasing">
              <span>Action phrasing was off</span>
            </label>
            <label class="feedback-option">
              <input type="checkbox" name="feedback" value="other">
              <span>Other</span>
            </label>
          </div>
          <textarea id="feedbackNote" class="feedback-note" placeholder="Optional: Add more details..."></textarea>
        </div>
        <div class="feedback-modal-footer">
          <button class="btn btn-secondary" onclick="app.closeAIFeedbackModal(); app.dismissAISuggestion();">Skip</button>
          <button class="btn btn-primary" onclick="app.submitAIFeedback()">Submit Feedback</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  closeAIFeedbackModal() {
    const modal = document.getElementById('aiFeedbackModal');
    if (modal) {
      modal.remove();
    }
  }

  async submitAIFeedback() {
    const checkboxes = document.querySelectorAll('#aiFeedbackModal input[name="feedback"]:checked');
    const feedbackTypes = Array.from(checkboxes).map(cb => cb.value);
    const feedbackNote = document.getElementById('feedbackNote')?.value || '';

    // Record the feedback
    await window.aiService.recordAIFeedback(
      this.processingItem?.content,
      this.aiSuggestion,
      null,
      'rejected',
      { types: feedbackTypes, note: feedbackNote }
    );

    this.closeAIFeedbackModal();
    this.dismissAISuggestion();
    this.showToast('Feedback recorded - thanks for helping improve AI suggestions!', 'success');
  }

  async quickAIFeedback(helpful) {
    // Record quick thumbs up/down feedback
    await window.aiService.recordAIFeedback(
      this.processingItem?.content,
      this.aiSuggestion,
      null,
      helpful ? 'accepted' : 'rejected',
      { types: [helpful ? 'helpful' : 'not-helpful'], note: '' }
    );

    // Show brief confirmation
    const feedbackRow = document.querySelector('.ai-feedback-row');
    if (feedbackRow) {
      feedbackRow.innerHTML = `<span class="ai-feedback-thanks">Thanks for the feedback!</span>`;
    }
  }

  dismissAISuggestion() {
    this.aiSuggestion = null;
    this.originalAISuggestion = null;
    const container = document.getElementById('aiSuggestionBox');
    if (container) {
      container.style.display = 'none';
    }
  }

  // Record feedback when user finishes modifying and creates the action
  async recordModificationFeedback(userAction) {
    if (!this.originalAISuggestion || !this.processingItem) return;

    await window.aiService.recordAIFeedback(
      this.processingItem.content,
      this.originalAISuggestion,
      userAction,
      'modified'
    );

    this.originalAISuggestion = null;
  }

  showProcessingModal() {
    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');

    modal.classList.add('active');

    switch (this.processingStep) {
      case 1:
        this.renderStep1(content);
        break;
      case 2:
        this.renderStep2(content);
        break;
      case 3:
        this.renderStep3(content);
        break;
      case 4:
        this.renderStep4(content);
        break;
      case 'reference':
        this.renderReferenceStep(content);
        break;
      case 'delegation':
        this.renderDelegationStep(content);
        break;
      case 'delegationMethod':
        this.renderDelegationMethodStep(content);
        break;
      case 'compose':
        this.renderComposeStep(content);
        break;
      case 'priority':
        this.renderPriorityStep(content);
        break;
      case 'dueDate':
        this.renderDueDateStep(content);
        break;
      case 'project':
        this.renderProjectLinkStep(content);
        break;
      case 'confirm':
        this.renderConfirmStep(content);
        break;
    }
  }

  renderStep1(container) {
    container.innerHTML = `
      <div class="modal-header">
        <h3>Process Item</h3>
      </div>
      <div class="modal-body">
        <div class="processing-content">${this.escapeHtml(this.processingItem.content)}</div>

        <!-- AI Suggestion Box -->
        <div id="aiSuggestionBox" class="ai-suggestion-box" style="display: none;"></div>

        <p class="processing-question">Is this actionable?</p>
        <div class="processing-options">
          <button class="option-btn" onclick="app.setActionable(true)">
            Yes - there's something I need to do
          </button>
          <button class="option-btn" onclick="app.setActionable(false)">
            No - it's just information
          </button>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
      </div>
    `;

    // Update AI suggestion UI after rendering
    if (this.aiSuggestionLoading || this.aiSuggestion || this.aiSuggestionError) {
      this.updateAISuggestionUI();
    }
  }

  setActionable(isActionable) {
    if (isActionable) {
      this.processingStep = 2;
    } else {
      this.processingStep = 'reference';
    }
    this.showProcessingModal();
  }

  renderReferenceStep(container) {
    container.innerHTML = `
      <div class="modal-header">
        <h3>Not Actionable</h3>
      </div>
      <div class="modal-body">
        <div class="processing-content">${this.escapeHtml(this.processingItem.content)}</div>
        <p class="processing-question">What would you like to do with this?</p>
        <div class="processing-options">
          <button class="option-btn" onclick="app.showReferenceTagging()">
            Keep as Reference
          </button>
          <button class="option-btn" onclick="app.trashItem()">
            Trash It
          </button>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.processingStep = 1; app.showProcessingModal()">Back</button>
      </div>
    `;
  }

  async showReferenceTagging() {
    const container = document.getElementById('modalContent');
    const folders = await db.getReferenceFolders();
    const childFolders = folders.filter(f => f.parentId);

    container.innerHTML = `
      <div class="modal-header">
        <h3>Add to Reference</h3>
      </div>
      <div class="modal-body">
        <div class="processing-content">${this.escapeHtml(this.processingItem.content)}</div>

        <div class="composer-field">
          <label>Save to Folder</label>
          <select class="composer-input" id="referenceFolderSelect">
            <option value="">Unfiled</option>
            ${childFolders.map(f => `
              <option value="${f.id}" ${this.selectedReferenceFolder === f.id ? 'selected' : ''}>
                ${f.icon || '📁'} ${this.escapeHtml(f.name)}
              </option>
            `).join('')}
          </select>
        </div>

        ${this.tagSuggestions.length > 0 ? `
          <div class="suggestions-section">
            <p class="suggestions-label">Suggested tags:</p>
            <div class="tag-suggestions">
              ${this.tagSuggestions.map(tag => `
                <button class="tag-suggestion ${this.referenceTags.includes(tag) ? 'selected' : ''}"
                        onclick="app.toggleReferenceTag('${tag}')">
                  ${tag}
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="tags-input-wrapper">
          <label>Tags</label>
          <div class="tags-container" id="tagsContainer">
            ${this.referenceTags.map(tag => `
              <span class="tag">
                ${this.escapeHtml(tag)}
                <button class="tag-remove" onclick="app.removeReferenceTag('${this.escapeHtml(tag)}')">&times;</button>
              </span>
            `).join('')}
          </div>
          <input type="text" class="tags-input" id="tagInput" placeholder="Type a tag and press Enter">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.processingStep = 'reference'; app.showProcessingModal()">Back</button>
        <button class="btn btn-primary" onclick="app.saveToReference()">Save to Reference</button>
      </div>
    `;

    // Folder selection change handler
    const folderSelect = document.getElementById('referenceFolderSelect');
    folderSelect.addEventListener('change', (e) => {
      this.selectedReferenceFolder = e.target.value || null;
    });

    const tagInput = document.getElementById('tagInput');
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

  toggleReferenceTag(tag) {
    const idx = this.referenceTags.indexOf(tag);
    if (idx > -1) {
      this.referenceTags.splice(idx, 1);
    } else {
      this.referenceTags.push(tag);
    }
    this.showReferenceTagging();
  }

  removeReferenceTag(tag) {
    this.referenceTags = this.referenceTags.filter(t => t !== tag);
    this.showReferenceTagging();
  }

  async saveToReference() {
    try {
      const item = this.processingItem;
      const title = (item.content || 'Untitled').substring(0, 100);
      const content = item.content || '';
      const attachment = item.attachment || null;

      // addToReference expects: (title, content, folderId, tags, attachment)
      await db.addToReference(title, content, this.selectedReferenceFolder, this.referenceTags, attachment);
      this.selectedReferenceFolder = null; // Reset for next time
      this.closeModal();
      await this.updateCounts();
      await this.renderCurrentView();
      this.showToast('Saved to reference', 'success');
    } catch (error) {
      console.error('Failed to save reference:', error);
      this.showToast('Failed to save', 'error');
    }
  }

  async trashItem() {
    try {
      await db.deleteFromInbox(this.processingItem.id);
      this.closeModal();
      await this.updateCounts();
      await this.renderInboxView();
      this.showToast('Item deleted', 'success');
    } catch (error) {
      console.error('Failed to delete:', error);
      this.showToast('Failed to delete', 'error');
    }
  }

  renderStep2(container) {
    container.innerHTML = `
      <div class="modal-header">
        <h3>Define Next Action</h3>
      </div>
      <div class="modal-body">
        <div class="processing-content">${this.escapeHtml(this.processingItem.content)}</div>

        ${this.actionSuggestions.length > 0 ? `
          <div class="suggestions-section">
            <p class="suggestions-label">Suggested actions:</p>
            <div class="suggestions-list">
              ${this.actionSuggestions.slice(0, 4).map((s, idx) => `
                <div class="suggestion-pill ${this.actionText === s.action ? 'selected' : ''}"
                     onclick="app.selectSuggestion(${idx})">
                  <span class="suggestion-text">${this.escapeHtml(s.action)}</span>
                  <span class="suggestion-meta">
                    ${s.suggestedPerson ? `<span class="suggestion-person ${s.suggestedPerson}">${s.suggestedPerson}</span>` : ''}
                    ${s.suggestedContext ? `<span class="suggestion-context">${s.suggestedContext}</span>` : ''}
                  </span>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="divider-text">or type your own</div>
        ` : ''}

        <p class="processing-question">What's the very next physical action?</p>
        <input type="text" class="action-input" id="actionInput"
               placeholder="e.g., Call John to discuss project timeline"
               value="${this.escapeHtml(this.actionText)}">
        <div class="context-suggestion" id="contextSuggestion" style="display: none;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.processingStep = 1; app.showProcessingModal()">Back</button>
        <button class="btn btn-primary" onclick="app.saveActionStep2()">Next: Who will do this?</button>
      </div>
    `;

    const actionInput = document.getElementById('actionInput');
    const suggestion = document.getElementById('contextSuggestion');

    actionInput.addEventListener('input', () => {
      const text = actionInput.value.toLowerCase();
      this.actionText = actionInput.value;
      let suggestedContext = null;

      if (text.includes('call') || text.includes('phone')) {
        suggestedContext = '@phone';
      } else if (text.includes('email') || text.includes('write') || text.includes('send')) {
        suggestedContext = '@email';
      } else if (text.includes('computer') || text.includes('research') || text.includes('online')) {
        suggestedContext = '@computer';
      } else if (text.includes('office') || text.includes('work') || text.includes('meeting')) {
        suggestedContext = '@office';
      } else if (text.includes('buy') || text.includes('pick up') || text.includes('store')) {
        suggestedContext = '@errands';
      }

      if (suggestedContext) {
        suggestion.innerHTML = `Suggested context: <strong>${suggestedContext}</strong>`;
        suggestion.style.display = 'block';
        if (!this.selectedContexts.includes(suggestedContext)) {
          this.selectedContexts = [suggestedContext];
        }
      } else {
        suggestion.style.display = 'none';
      }
    });

    actionInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.saveActionStep2();
      }
    });

    // Focus and trigger suggestion check
    actionInput.focus();
    if (this.actionText) {
      actionInput.dispatchEvent(new Event('input'));
    }
  }

  selectSuggestion(index) {
    const suggestion = this.actionSuggestions[index];
    this.actionText = suggestion.action;

    if (suggestion.suggestedContext) {
      this.selectedContexts = [suggestion.suggestedContext];
    }

    if (suggestion.suggestedTags && suggestion.suggestedTags.length > 0) {
      this.selectedTags = [...suggestion.suggestedTags];
    }

    // If has suggested person, pre-select for delegation
    if (suggestion.suggestedPerson) {
      this.delegateTo = { id: suggestion.suggestedPerson, name: suggestion.suggestedPerson.charAt(0).toUpperCase() + suggestion.suggestedPerson.slice(1) };
    }

    this.showProcessingModal();
  }

  saveActionStep2() {
    const actionInput = document.getElementById('actionInput');
    const action = actionInput ? actionInput.value.trim() : this.actionText;

    if (!action) {
      this.showToast('Please enter an action', 'error');
      return;
    }

    this.actionText = action;
    this.processingStep = 3;
    this.showProcessingModal();
  }

  // Alias for delegation step (called when processingStep === 'delegation')
  renderDelegationStep(container) {
    this.renderStep3(container);
  }

  renderStep3(container) {
    container.innerHTML = `
      <div class="modal-header">
        <h3>Who will do this?</h3>
      </div>
      <div class="modal-body">
        <div class="processing-content">${this.escapeHtml(this.actionText)}</div>

        <div class="delegation-section">
          <p class="delegation-label">Assign to:</p>
          <div class="delegation-grid" id="delegationGrid"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.processingStep = 2; app.showProcessingModal()">Back</button>
        <button class="btn btn-primary" onclick="app.saveDelegationChoice()">Next</button>
      </div>
    `;

    this.renderDelegationOptions();
  }

  async renderDelegationOptions() {
    const grid = document.getElementById('delegationGrid');
    const targets = await db.getAllDelegationTargets();

    const meSelected = this.delegateTo === 'me';

    let html = `
      <div class="delegation-option me ${meSelected ? 'selected' : ''}"
           onclick="app.selectDelegation('me')">
        <div class="delegation-avatar me">Me</div>
        <div class="delegation-name">Myself</div>
        <div class="delegation-role">I'll do this</div>
      </div>
    `;

    // Team members section
    if (targets.team.length > 0) {
      html += `<div class="delegation-section-label">Team</div>`;
      for (const member of targets.team) {
        const isSelected = this.delegateTo && this.delegateTo.id === member.id && this.delegateTo.type === 'team';
        html += `
          <div class="delegation-option ${isSelected ? 'selected' : ''}"
               onclick="app.selectDelegation('${member.id}', 'team')">
            <div class="delegation-avatar" style="background-color: ${member.color || '#6366f1'}">
              ${member.name.charAt(0).toUpperCase()}
            </div>
            <div class="delegation-name">${this.escapeHtml(member.name)}</div>
            <div class="delegation-role">${this.escapeHtml((member.role || '').split(' ')[0])}</div>
          </div>
        `;
      }
    }

    // External contacts section (collapsed by default)
    if (targets.contacts.length > 0) {
      html += `
        <div class="delegation-section-divider">
          <button class="delegation-expand-btn" onclick="app.toggleContactsExpand(event)">
            <span class="expand-icon">▶</span>
            External Contacts (${targets.contacts.length})
          </button>
        </div>
        <div class="delegation-contacts-section" id="delegationContacts" style="display: none;">
      `;
      for (const contact of targets.contacts) {
        const isSelected = this.delegateTo && this.delegateTo.id === contact.id && this.delegateTo.type === 'contact';
        html += `
          <div class="delegation-option contact ${isSelected ? 'selected' : ''}"
               onclick="app.selectDelegation('${contact.id}', 'contact')">
            <div class="delegation-avatar contact">
              ${contact.name.charAt(0).toUpperCase()}
            </div>
            <div class="delegation-name">${this.escapeHtml(contact.name)}</div>
            <div class="delegation-role">${this.escapeHtml(contact.company || contact.role || '')}</div>
          </div>
        `;
      }
      html += `</div>`;
    }

    // Show empty state if no team members
    if (targets.team.length === 0) {
      html += `
        <div class="delegation-empty">
          <p>No team members yet.</p>
          <button class="btn btn-secondary small" onclick="app.closeModal(); app.navigateTo('settings');">
            Add Team Members
          </button>
        </div>
      `;
    }

    grid.innerHTML = html;
  }

  toggleContactsExpand(event) {
    event.stopPropagation();
    const section = document.getElementById('delegationContacts');
    const icon = event.currentTarget.querySelector('.expand-icon');
    if (section.style.display === 'none') {
      section.style.display = 'block';
      icon.textContent = '▼';
    } else {
      section.style.display = 'none';
      icon.textContent = '▶';
    }
  }

  async selectDelegation(choice, type = 'team') {
    if (choice === 'me') {
      this.delegateTo = 'me';
    } else if (type === 'team') {
      const member = await db.getTeamMember(choice);
      this.delegateTo = { ...member, type: 'team' };
    } else if (type === 'contact') {
      const contact = await db.getContact(choice);
      this.delegateTo = { ...contact, type: 'contact' };
    }
    this.renderDelegationOptions();
  }

  saveDelegationChoice() {
    if (!this.delegateTo) {
      this.showToast('Please select who will do this', 'error');
      return;
    }

    if (this.delegateTo === 'me') {
      this.processingStep = 4; // Go to context selection
    } else {
      this.processingStep = 'delegationMethod'; // Go to delegation method
    }
    this.showProcessingModal();
  }

  renderStep4(container) {
    const showLocationPicker = this.selectedContexts.includes('@errands');
    const locations = typeof geo !== 'undefined' ? geo.getAllLocations() : [];

    container.innerHTML = `
      <div class="modal-header">
        <h3>Select Context(s)</h3>
      </div>
      <div class="modal-body">
        <p class="processing-question">Where or how will you do this action?</p>
        <div class="context-grid">
          ${this.contexts.map(ctx => `
            <button class="context-btn ${this.selectedContexts.includes(ctx) ? 'selected' : ''}"
                    onclick="app.toggleContext('${ctx}')">
              ${ctx}
            </button>
          `).join('')}
        </div>
        <div class="custom-context-wrapper">
          <input type="text" class="custom-context-input" id="customContext" placeholder="Add custom context">
          <button class="btn btn-secondary" onclick="app.addCustomContext()">Add</button>
        </div>

        ${showLocationPicker ? `
          <div class="location-picker-section">
            <p class="suggestions-label">
              <span class="location-icon">📍</span> Where is this errand?
            </p>
            <div class="location-grid">
              ${locations.slice(0, 8).map(loc => `
                <button class="location-btn ${this.selectedLocation && this.selectedLocation.name === loc.name ? 'selected' : ''}"
                        onclick="app.selectLocation('${loc.name.replace(/'/g, "\\'")}', '${loc.category || 'other'}')">
                  <span class="location-btn-icon">${loc.icon || '📍'}</span>
                  <span class="location-btn-name">${loc.name}</span>
                </button>
              `).join('')}
            </div>
            <div class="custom-location-wrapper">
              <input type="text" class="custom-location-input" id="customLocation"
                     placeholder="Or type a custom location..."
                     value="${this.selectedLocation && !locations.find(l => l.name === this.selectedLocation.name) ? this.selectedLocation.name : ''}">
              <button class="btn btn-secondary" onclick="app.addCustomLocation()">Add</button>
            </div>
            ${this.selectedLocation ? `
              <div class="selected-location-preview">
                Selected: <strong>${this.selectedLocation.name}</strong>
                <button class="clear-location-btn" onclick="app.clearLocation()">Clear</button>
              </div>
            ` : ''}
          </div>
        ` : ''}

        ${this.tagSuggestions.length > 0 ? `
          <div class="suggestions-section" style="margin-top: 20px;">
            <p class="suggestions-label">Suggested tags:</p>
            <div class="tag-suggestions">
              ${this.tagSuggestions.map(tag => `
                <button class="tag-suggestion ${this.selectedTags.includes(tag) ? 'selected' : ''}"
                        onclick="app.toggleActionTag('${tag}')">
                  ${tag}
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.processingStep = 3; app.showProcessingModal()">Back</button>
        <button class="btn btn-primary" onclick="app.confirmContexts()">Next: Priority</button>
      </div>
    `;

    document.getElementById('customContext').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.addCustomContext();
      }
    });

    const customLocationInput = document.getElementById('customLocation');
    if (customLocationInput) {
      customLocationInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.addCustomLocation();
        }
      });
    }
  }

  selectLocation(name, category) {
    this.selectedLocation = { name, category };
    this.renderStep4(document.getElementById('modalContent'));
  }

  addCustomLocation() {
    const input = document.getElementById('customLocation');
    const name = input.value.trim();
    if (name) {
      this.selectedLocation = { name, category: 'custom' };
      this.renderStep4(document.getElementById('modalContent'));
    }
  }

  clearLocation() {
    this.selectedLocation = null;
    this.renderStep4(document.getElementById('modalContent'));
  }

  toggleContext(context) {
    const index = this.selectedContexts.indexOf(context);
    if (index > -1) {
      this.selectedContexts.splice(index, 1);
    } else {
      this.selectedContexts.push(context);
    }
    this.renderStep4(document.getElementById('modalContent'));
  }

  toggleActionTag(tag) {
    const index = this.selectedTags.indexOf(tag);
    if (index > -1) {
      this.selectedTags.splice(index, 1);
    } else {
      this.selectedTags.push(tag);
    }
    this.renderStep4(document.getElementById('modalContent'));
  }

  addCustomContext() {
    const input = document.getElementById('customContext');
    let context = input.value.trim();

    if (!context) return;

    if (!context.startsWith('@')) {
      context = '@' + context;
    }

    if (!this.selectedContexts.includes(context)) {
      this.selectedContexts.push(context);
    }

    input.value = '';
    this.renderStep4(document.getElementById('modalContent'));
  }

  confirmContexts() {
    if (this.selectedContexts.length === 0) {
      this.showToast('Please select at least one context', 'error');
      return;
    }

    this.processingStep = 'priority';
    this.showProcessingModal();
  }

  renderPriorityStep(container) {
    container.innerHTML = `
      <div class="modal-header">
        <h3>Set Priority</h3>
      </div>
      <div class="modal-body">
        <p class="processing-question">How important is this action?</p>
        <div class="priority-grid">
          <button class="priority-btn high ${this.selectedPriority === 'high' ? 'selected' : ''}"
                  onclick="app.selectPriority('high')">
            <span class="priority-icon">!</span>
            <span class="priority-label">High</span>
            <span class="priority-desc">Do this first</span>
          </button>
          <button class="priority-btn medium ${this.selectedPriority === 'medium' ? 'selected' : ''}"
                  onclick="app.selectPriority('medium')">
            <span class="priority-icon">=</span>
            <span class="priority-label">Medium</span>
            <span class="priority-desc">Normal priority</span>
          </button>
          <button class="priority-btn low ${this.selectedPriority === 'low' ? 'selected' : ''}"
                  onclick="app.selectPriority('low')">
            <span class="priority-icon">-</span>
            <span class="priority-label">Low</span>
            <span class="priority-desc">When you have time</span>
          </button>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.processingStep = 4; app.showProcessingModal()">Back</button>
        <button class="btn btn-primary" onclick="app.confirmPriority()">Next: Review</button>
      </div>
    `;
  }

  selectPriority(priority) {
    this.selectedPriority = priority;
    this.renderPriorityStep(document.getElementById('modalContent'));
  }

  confirmPriority() {
    this.processingStep = 'dueDate';
    this.showProcessingModal();
  }

  renderDueDateStep(container) {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    container.innerHTML = `
      <div class="modal-header">
        <h3>Set Due Date</h3>
      </div>
      <div class="modal-body">
        <p class="processing-question">When does this need to be done?</p>

        <div class="due-date-quick-picks">
          <button class="due-date-btn ${this.selectedDueDate === null ? 'selected' : ''}"
                  onclick="app.selectDueDate(null)">
            <span class="due-date-icon">∞</span>
            <span class="due-date-label">No Date</span>
            <span class="due-date-desc">Do whenever</span>
          </button>
          <button class="due-date-btn ${this.selectedDueDate === today ? 'selected' : ''}"
                  onclick="app.selectDueDate('${today}')">
            <span class="due-date-icon">!</span>
            <span class="due-date-label">Today</span>
            <span class="due-date-desc">${this.formatDateShort(today)}</span>
          </button>
          <button class="due-date-btn ${this.selectedDueDate === tomorrow ? 'selected' : ''}"
                  onclick="app.selectDueDate('${tomorrow}')">
            <span class="due-date-icon">→</span>
            <span class="due-date-label">Tomorrow</span>
            <span class="due-date-desc">${this.formatDateShort(tomorrow)}</span>
          </button>
          <button class="due-date-btn ${this.selectedDueDate === nextWeek ? 'selected' : ''}"
                  onclick="app.selectDueDate('${nextWeek}')">
            <span class="due-date-icon">7</span>
            <span class="due-date-label">Next Week</span>
            <span class="due-date-desc">${this.formatDateShort(nextWeek)}</span>
          </button>
        </div>

        <div class="due-date-custom">
          <label for="customDueDate">Or pick a specific date:</label>
          <input type="date" id="customDueDate" class="date-input"
                 value="${this.selectedDueDate || ''}"
                 min="${today}"
                 onchange="app.selectDueDate(this.value)">
        </div>

        ${this.selectedDueDate ? `
          <div class="due-date-preview">
            Due: <strong>${this.formatDateFull(this.selectedDueDate)}</strong>
          </div>
        ` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.processingStep = 'priority'; app.showProcessingModal()">Back</button>
        <button class="btn btn-primary" onclick="app.confirmDueDate()">Next: Review</button>
      </div>
    `;
  }

  selectDueDate(date) {
    this.selectedDueDate = date;
    this.renderDueDateStep(document.getElementById('modalContent'));
  }

  confirmDueDate() {
    this.processingStep = 'project';
    this.showProcessingModal();
  }

  async renderProjectLinkStep(container) {
    const projects = await db.getProjects();
    const activeProjects = projects.filter(p => p.status === 'active');

    container.innerHTML = `
      <div class="modal-header">
        <h3>Link to Project (Optional)</h3>
      </div>
      <div class="modal-body">
        <p class="processing-question">Is this action part of a larger project?</p>

        <div class="project-selection">
          <button class="project-select-btn ${this.selectedProjectId === null ? 'selected' : ''}"
                  onclick="app.selectProject(null)">
            <span class="project-select-icon">∅</span>
            <span class="project-select-label">No Project</span>
            <span class="project-select-desc">Standalone action</span>
          </button>

          ${activeProjects.map(project => `
            <button class="project-select-btn ${this.selectedProjectId === project.id ? 'selected' : ''}"
                    onclick="app.selectProject('${project.id}')">
              <span class="project-select-icon">📁</span>
              <span class="project-select-label">${this.escapeHtml(project.name)}</span>
              <span class="project-select-desc">${project.category || 'No category'}</span>
            </button>
          `).join('')}

          <button class="project-select-btn create-new"
                  onclick="app.showInlineProjectCreation()">
            <span class="project-select-icon">+</span>
            <span class="project-select-label">Create New Project</span>
            <span class="project-select-desc">Start a new multi-step outcome</span>
          </button>
        </div>

        <div id="inlineProjectForm" style="display: none;">
          <div class="inline-project-form">
            <div class="composer-field">
              <label>Project Name *</label>
              <input type="text" class="composer-input" id="inlineProjectName" placeholder="e.g., Website Redesign">
            </div>
            <div class="composer-field">
              <label>Category</label>
              <select class="composer-input" id="inlineProjectCategory">
                <option value="">Select category...</option>
                <option value="Work">Work</option>
                <option value="Personal">Personal</option>
                <option value="Home">Home</option>
                <option value="Health">Health</option>
                <option value="Financial">Financial</option>
              </select>
            </div>
            <div class="inline-project-actions">
              <button class="btn btn-secondary" onclick="app.cancelInlineProject()">Cancel</button>
              <button class="btn btn-primary" onclick="app.createInlineProject()">Create & Link</button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.processingStep = 'dueDate'; app.showProcessingModal()">Back</button>
        <button class="btn btn-primary" onclick="app.confirmProjectLink()">Next: Review</button>
      </div>
    `;
  }

  selectProject(projectId) {
    this.selectedProjectId = projectId;
    this.renderProjectLinkStep(document.getElementById('modalContent'));
  }

  showInlineProjectCreation() {
    const form = document.getElementById('inlineProjectForm');
    form.style.display = 'block';
    document.getElementById('inlineProjectName').focus();
  }

  cancelInlineProject() {
    const form = document.getElementById('inlineProjectForm');
    form.style.display = 'none';
    document.getElementById('inlineProjectName').value = '';
    document.getElementById('inlineProjectCategory').value = '';
  }

  async createInlineProject() {
    const name = document.getElementById('inlineProjectName').value.trim();
    const category = document.getElementById('inlineProjectCategory').value;

    if (!name) {
      this.showToast('Please enter a project name', 'error');
      return;
    }

    try {
      const project = await db.addProject({
        name,
        description: '',
        category,
        status: 'active',
        progress: 0,
        dueDate: null
      });

      this.selectedProjectId = project.id;
      this.showToast('Project created!', 'success');
      await this.renderProjectLinkStep(document.getElementById('modalContent'));
    } catch (error) {
      console.error('Failed to create project:', error);
      this.showToast('Failed to create project', 'error');
    }
  }

  confirmProjectLink() {
    this.processingStep = 'confirm';
    this.showProcessingModal();
  }

  formatDateShort(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  formatDateFull(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  renderDelegationMethodStep(container) {
    container.innerHTML = `
      <div class="modal-header">
        <h3>How to delegate?</h3>
      </div>
      <div class="modal-body">
        <div class="processing-content">
          <strong>Delegating to ${this.delegateTo.name}:</strong><br>
          ${this.escapeHtml(this.actionText)}
        </div>

        <div class="delegation-method-section">
          <p class="delegation-label">Delegation method:</p>
          <div class="method-buttons">
            <button class="method-btn ${this.delegationMethod === 'email' ? 'selected' : ''}"
                    onclick="app.selectDelegationMethod('email')">
              <div class="method-icon">📧</div>
              <div class="method-label">Email</div>
            </button>
            <button class="method-btn ${this.delegationMethod === 'text' ? 'selected' : ''}"
                    onclick="app.selectDelegationMethod('text')">
              <div class="method-icon">💬</div>
              <div class="method-label">Text</div>
            </button>
            <button class="method-btn ${this.delegationMethod === 'verbal' ? 'selected' : ''}"
                    onclick="app.selectDelegationMethod('verbal')">
              <div class="method-icon">📋</div>
              <div class="method-label">Just Track</div>
            </button>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.processingStep = 3; app.showProcessingModal()">Back</button>
        <button class="btn btn-primary" onclick="app.proceedWithDelegation()">
          ${this.delegationMethod === 'email' || this.delegationMethod === 'text' ? 'Compose Message' : 'Save & Track'}
        </button>
      </div>
    `;
  }

  selectDelegationMethod(method) {
    this.delegationMethod = method;
    this.renderDelegationMethodStep(document.getElementById('modalContent'));
  }

  proceedWithDelegation() {
    if (!this.delegationMethod) {
      this.showToast('Please select how you want to delegate', 'error');
      return;
    }

    if (this.delegationMethod === 'email' || this.delegationMethod === 'text') {
      this.processingStep = 'compose';
    } else {
      this.saveDelegation();
    }
    this.showProcessingModal();
  }

  renderComposeStep(container) {
    const isEmail = this.delegationMethod === 'email';
    const recipientName = this.delegateTo.name.split(' ')[0]; // First name
    const recipientContact = isEmail ? this.delegateTo.email : this.delegateTo.phone;
    const recipientType = this.delegateTo.type === 'contact' ? 'External' : 'Team';
    const recipientRole = this.delegateTo.role || this.delegateTo.company || '';

    // Generate smart subject
    const smartSubject = this.generateSmartSubject(this.actionText);

    // Generate smart body based on context
    const body = this.generateSmartBody(isEmail, recipientName);

    container.innerHTML = `
      <div class="modal-header">
        <h3>Compose ${isEmail ? 'Email' : 'Text'}</h3>
      </div>
      <div class="modal-body">
        <div class="recipient-card">
          <div class="recipient-avatar" style="background-color: ${this.delegateTo.color || '#6366f1'}">
            ${this.delegateTo.name.charAt(0).toUpperCase()}
          </div>
          <div class="recipient-info">
            <div class="recipient-name">${this.escapeHtml(this.delegateTo.name)}</div>
            <div class="recipient-details">
              <span class="recipient-type">${recipientType}</span>
              ${recipientRole ? `<span class="recipient-role">• ${this.escapeHtml(recipientRole)}</span>` : ''}
            </div>
          </div>
        </div>

        <div class="composer-field">
          <label>${isEmail ? 'Email' : 'Phone'}:</label>
          <input type="${isEmail ? 'email' : 'tel'}" class="composer-input" id="composerTo"
                 value="${this.escapeHtml(recipientContact || '')}"
                 placeholder="${isEmail ? 'Enter email address...' : 'Enter phone number...'}">
          ${!recipientContact ? `<div class="field-hint">No ${isEmail ? 'email' : 'phone'} on file - please enter manually</div>` : ''}
        </div>

        ${isEmail ? `
          <div class="composer-field">
            <label>Subject:</label>
            <input type="text" class="composer-input" id="composerSubject" value="${this.escapeHtml(smartSubject)}">
          </div>
        ` : ''}

        <div class="composer-field">
          <label>${isEmail ? 'Body' : 'Message'}:</label>
          <textarea class="composer-textarea tall" id="composerBody">${this.escapeHtml(body)}</textarea>
        </div>

        <div class="draft-templates">
          <span class="templates-label">Quick templates:</span>
          <button class="template-btn" onclick="app.useTemplate('request')">Request</button>
          <button class="template-btn" onclick="app.useTemplate('followup')">Follow-up</button>
          <button class="template-btn" onclick="app.useTemplate('urgent')">Urgent</button>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.processingStep = 'delegationMethod'; app.showProcessingModal()">Back</button>
        <div class="composer-actions">
          <button class="btn btn-secondary" onclick="app.copyToClipboard()">Copy</button>
          <button class="btn btn-primary" onclick="app.sendAndTrack()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              ${isEmail ?
                '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>' :
                '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'
              }
            </svg>
            ${isEmail ? 'Open Mail' : 'Open Messages'}
          </button>
        </div>
      </div>
    `;
  }

  generateSmartSubject(actionText) {
    // Try to make action text into a good subject line
    const text = actionText.toLowerCase();

    // Check for common patterns
    if (text.includes('review')) return `Please Review: ${actionText}`;
    if (text.includes('approve')) return `Approval Needed: ${actionText}`;
    if (text.includes('schedule')) return `Scheduling Request: ${actionText}`;
    if (text.includes('invoice') || text.includes('payment')) return `Action Required: ${actionText}`;
    if (text.includes('estimate')) return `Estimate Request: ${actionText}`;
    if (text.includes('call') || text.includes('contact')) return `Follow-up: ${actionText}`;

    // Default to action text as subject
    return actionText;
  }

  generateSmartBody(isEmail, recipientName) {
    const greeting = `Hi ${recipientName}`;
    const originalContext = this.processingItem ? `\n\nOriginal note: "${this.processingItem.content}"` : '';

    if (isEmail) {
      return `${greeting},

Could you please handle the following?

${this.actionText}${originalContext}

Please let me know if you have any questions.

Thanks!`;
    } else {
      // Shorter for text
      return `${greeting}, can you handle this? ${this.actionText}`;
    }
  }

  useTemplate(templateType) {
    const isEmail = this.delegationMethod === 'email';
    const recipientName = this.delegateTo.name.split(' ')[0];
    const bodyField = document.getElementById('composerBody');
    const subjectField = document.getElementById('composerSubject');

    const templates = {
      request: {
        subject: `Request: ${this.actionText}`,
        email: `Hi ${recipientName},

I have a request that needs your attention:

${this.actionText}

Please let me know once this is complete or if you need any additional information.

Thanks!`,
        text: `Hi ${recipientName}, I need your help with: ${this.actionText}. Let me know when done!`
      },
      followup: {
        subject: `Follow-up: ${this.actionText}`,
        email: `Hi ${recipientName},

Just following up on:

${this.actionText}

Can you give me a quick status update?

Thanks!`,
        text: `Hi ${recipientName}, following up on: ${this.actionText}. Any update?`
      },
      urgent: {
        subject: `URGENT: ${this.actionText}`,
        email: `Hi ${recipientName},

This is urgent and needs immediate attention:

${this.actionText}

Please prioritize this and let me know as soon as possible.

Thanks!`,
        text: `URGENT: ${recipientName}, please handle ASAP: ${this.actionText}`
      }
    };

    const template = templates[templateType];
    if (template) {
      bodyField.value = isEmail ? template.email : template.text;
      if (subjectField && template.subject) {
        subjectField.value = template.subject;
      }
    }
  }

  copyToClipboard() {
    const body = document.getElementById('composerBody').value;
    const subject = document.getElementById('composerSubject')?.value || '';

    const text = subject ? `Subject: ${subject}\n\n${body}` : body;

    navigator.clipboard.writeText(text).then(() => {
      this.showToast('Copied to clipboard!', 'success');
    }).catch(() => {
      this.showToast('Failed to copy', 'error');
    });
  }

  async sendAndTrack() {
    const isEmail = this.delegationMethod === 'email';
    const body = document.getElementById('composerBody').value;
    const subject = document.getElementById('composerSubject')?.value || this.actionText;

    if (isEmail) {
      const mailtoUrl = `mailto:${this.delegateTo.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(mailtoUrl, '_blank');
    } else {
      // SMS - opens native messaging
      const smsUrl = `sms:${this.delegateTo.phone || ''}?body=${encodeURIComponent(body)}`;
      window.open(smsUrl, '_blank');
    }

    await this.saveDelegation();
  }

  async saveDelegation() {
    try {
      await db.delegateAction(
        this.actionText,                           // actionText
        this.delegateTo,                           // targetPerson object
        this.delegationMethod,                     // method (email/text/verbal)
        this.processingItem.content,               // originalContent
        this.processingItem.projectId || null      // projectId
      );

      // Delete the original inbox item after successful delegation
      if (this.processingItem.id) {
        await db.delete('inbox', this.processingItem.id);
      }

      this.closeModal();
      await this.updateCounts();
      await this.renderCurrentView();
      this.showToast(`Delegated to ${this.delegateTo.name}!`, 'success');
    } catch (error) {
      console.error('Failed to delegate:', error);
      this.showToast('Failed to delegate', 'error');
    }
  }

  renderConfirmStep(container) {
    const priorityLabels = { high: 'High', medium: 'Medium', low: 'Low' };
    container.innerHTML = `
      <div class="modal-header">
        <h3>Review & Save</h3>
      </div>
      <div class="modal-body">
        <div class="processing-summary">
          <div class="summary-row">
            <span class="summary-label">Original:</span>
            <span class="summary-value">${this.escapeHtml(this.truncate(this.processingItem.content, 100))}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Action:</span>
            <span class="summary-value">${this.escapeHtml(this.actionText)}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Priority:</span>
            <span class="summary-value">
              <span class="priority-badge ${this.selectedPriority}">${priorityLabels[this.selectedPriority]}</span>
            </span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Due Date:</span>
            <span class="summary-value">
              ${this.selectedDueDate ? `<span class="due-date-badge">${this.formatDateShort(this.selectedDueDate)}</span>` : '<span class="no-date">No due date</span>'}
            </span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Context:</span>
            <span class="summary-value summary-contexts">
              ${this.selectedContexts.map(ctx => `<span class="context-tag">${ctx}</span>`).join('')}
            </span>
          </div>
          ${this.selectedLocation ? `
            <div class="summary-row">
              <span class="summary-label">Location:</span>
              <span class="summary-value">
                <span class="location-badge">📍 ${this.escapeHtml(this.selectedLocation.name)}</span>
              </span>
            </div>
          ` : ''}
          ${this.selectedTags.length > 0 ? `
            <div class="summary-row">
              <span class="summary-label">Tags:</span>
              <span class="summary-value">${this.selectedTags.join(', ')}</span>
            </div>
          ` : ''}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.processingStep = 'project'; app.showProcessingModal()">Back</button>
        <button class="btn btn-success" onclick="app.saveNextAction()">Save to Next Actions</button>
      </div>
    `;
  }

  async saveNextAction() {
    try {
      // Parameters: action, contexts, originalContent, originalTimestamp, tags, options
      await db.addToNextActions(
        this.actionText,
        this.selectedContexts,
        this.processingItem.content,
        this.processingItem.timestamp,
        this.selectedTags,
        {
          priority: this.selectedPriority,
          dueDate: this.selectedDueDate,
          location: this.selectedLocation,
          projectId: this.selectedProjectId
        }
      );

      // Delete the original inbox item
      if (this.processingItem.id) {
        await db.delete('inbox', this.processingItem.id);
      }

      this.closeModal();
      await this.updateCounts();
      await this.renderCurrentView();
      this.showToast('Added to Next Actions!', 'success');
    } catch (error) {
      console.error('Failed to save action:', error);
      this.showToast('Failed to save', 'error');
    }
  }

  // =====================
  // Action Operations
  // =====================
  async completeAction(id) {
    try {
      await db.completeAction(id);
      await this.updateCounts();
      await this.renderNextActionsView();
      this.showToast('Action completed!', 'success');
    } catch (error) {
      console.error('Failed to complete action:', error);
      this.showToast('Failed to complete', 'error');
    }
  }

  async completeWaitingFor(id) {
    try {
      await db.completeWaitingFor(id);
      await this.updateCounts();
      await this.renderWaitingForView();
      this.showToast('Item completed!', 'success');
    } catch (error) {
      console.error('Failed to complete:', error);
      this.showToast('Failed to complete', 'error');
    }
  }

  async followUp(id, method) {
    try {
      const item = await db.get('waitingFor', id);
      if (!item) return;

      if (method === 'email') {
        const subject = `Re: ${item.action}`;
        const body = `Hi ${item.personName},\n\nJust following up on my earlier request regarding:\n\n${item.action}\n\nAny update on timing?\n\nThanks,\nMatthew`;

        const mailtoUrl = `mailto:${item.personEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(mailtoUrl, '_blank');

        await db.addFollowUp(id, 'email');
        this.showToast('Follow-up recorded', 'success');
        await this.renderWaitingForView();
      } else if (method === 'call') {
        if (item.personPhone) {
          window.open(`tel:${item.personPhone}`, '_blank');
        } else {
          this.showToast('No phone number on file', 'warning');
        }

        await db.addFollowUp(id, 'call');
        await this.renderWaitingForView();
      }
    } catch (error) {
      console.error('Failed to follow up:', error);
      this.showToast('Failed to follow up', 'error');
    }
  }

  async delegateExisting(id) {
    try {
      const action = await db.get('nextActions', id);
      if (!action) return;

      // Set up delegation flow
      this.processingItem = {
        id: action.id,
        content: action.originalContent || action.action,
        timestamp: action.originalTimestamp || action.processedDate
      };
      this.actionText = action.action;
      this.delegateTo = null;
      this.delegationMethod = null;
      this.processingStep = 3; // Start at delegation step

      this.showProcessingModal();
    } catch (error) {
      console.error('Failed to start delegation:', error);
      this.showToast('Failed to delegate', 'error');
    }
  }

  async composeEmail(id, type) {
    try {
      let item;
      if (type === 'action') {
        item = await db.get('nextActions', id);
      } else {
        item = await db.get('waitingFor', id);
      }

      if (!item) return;

      const subject = item.action || '';
      const body = `Regarding: ${item.action || ''}`;

      // Check if Gmail is connected
      const gmailConnected = typeof googleIntegration !== 'undefined' && googleIntegration.isGmailConnected();

      if (gmailConnected) {
        // Show Gmail compose modal
        this.showGmailComposeModal(id, type, '', subject, body);
      } else {
        // Fall back to mailto
        const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(mailtoUrl, '_blank');
      }
    } catch (error) {
      console.error('Failed to compose email:', error);
    }
  }

  showGmailComposeModal(itemId, itemType, to, subject, body) {
    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    content.innerHTML = `
      <div class="modal-header">
        <h3>Compose Email</h3>
        <span class="gmail-badge">via Gmail</span>
      </div>
      <div class="modal-body">
        <div class="composer-field">
          <label>To</label>
          <input type="email" class="composer-input" id="emailTo" placeholder="recipient@example.com" value="${this.escapeHtml(to)}">
        </div>
        <div class="composer-field">
          <label>Subject</label>
          <input type="text" class="composer-input" id="emailSubject" value="${this.escapeHtml(subject)}">
        </div>
        <div class="composer-field">
          <label>Message</label>
          <textarea class="composer-textarea" id="emailBody" rows="6">${this.escapeHtml(body)}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-secondary" onclick="app.openMailto()">Use Email Client</button>
        <button class="btn btn-primary" onclick="app.sendGmailFromModal('${itemId}', '${itemType}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
          Send via Gmail
        </button>
      </div>
    `;

    document.getElementById('emailTo').focus();
  }

  openMailto() {
    const to = document.getElementById('emailTo').value;
    const subject = document.getElementById('emailSubject').value;
    const body = document.getElementById('emailBody').value;

    const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl, '_blank');
    this.closeModal();
  }

  async sendGmailFromModal(itemId, itemType) {
    const to = document.getElementById('emailTo').value.trim();
    const subject = document.getElementById('emailSubject').value.trim();
    const body = document.getElementById('emailBody').value.trim();

    if (!to) {
      this.showToast('Please enter a recipient email', 'error');
      return;
    }

    if (!subject) {
      this.showToast('Please enter a subject', 'error');
      return;
    }

    try {
      // Show loading state
      const sendBtn = document.querySelector('.modal-footer .btn-primary');
      const originalText = sendBtn.innerHTML;
      sendBtn.innerHTML = 'Sending...';
      sendBtn.disabled = true;

      // Send via Gmail
      const waitingForId = itemType === 'waitingFor' ? itemId : null;
      const result = await this.sendEmailViaGmail(to, subject, body, waitingForId);

      if (result) {
        this.closeModal();
        // If this was for a waiting for item, refresh the view
        if (itemType === 'waitingFor') {
          await this.renderWaitingFor();
        }
      } else {
        // sendEmailViaGmail already handled fallback
        this.closeModal();
      }
    } catch (error) {
      console.error('Failed to send email:', error);
      this.showToast('Failed to send email', 'error');
    }
  }

  uploadPhotoToReference() {
    // Create a hidden file input and trigger it
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment'; // Use back camera on mobile
    input.multiple = true;

    input.onchange = async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      // Show folder selection for the photos
      const folders = await db.getReferenceFolders();
      const folderOptions = folders.map(f =>
        `<option value="${f.id}" ${this.currentFolder === f.id && this.currentFolder !== 'all' && this.currentFolder !== 'unfiled' ? 'selected' : ''}>${f.icon || '📁'} ${this.escapeHtml(f.name)}</option>`
      ).join('');

      const modal = document.getElementById('modalOverlay');
      const content = document.getElementById('modalContent');
      modal.classList.add('active');

      content.innerHTML = `
        <div class="modal-header">
          <h3>Upload ${files.length} Photo${files.length > 1 ? 's' : ''}</h3>
        </div>
        <div class="modal-body">
          <div class="photo-preview-grid">
            ${files.map((file, i) => `
              <div class="photo-preview-item">
                <img src="${URL.createObjectURL(file)}" alt="Preview ${i + 1}">
              </div>
            `).join('')}
          </div>
          <div class="composer-field">
            <label>Description (optional)</label>
            <input type="text" class="composer-input" id="photoRefDescription" placeholder="What are these photos?">
          </div>
          <div class="composer-field">
            <label>Folder</label>
            <select class="composer-input" id="photoRefFolder">
              <option value="">Unfiled</option>
              ${folderOptions}
            </select>
          </div>
          <div class="composer-field">
            <label>Tags (optional)</label>
            <input type="text" class="composer-input" id="photoRefTags" placeholder="tag1, tag2, tag3">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
          <button class="btn btn-primary" id="uploadPhotosBtn" onclick="app.processPhotoUploads()">Upload Photos</button>
        </div>
      `;

      // Store files for later processing
      this.pendingPhotoUploads = files;
    };

    input.click();
  }

  async processPhotoUploads() {
    if (!this.pendingPhotoUploads || this.pendingPhotoUploads.length === 0) {
      this.showToast('No photos selected', 'error');
      return;
    }

    const files = this.pendingPhotoUploads;
    const description = document.getElementById('photoRefDescription').value.trim();
    const folderId = document.getElementById('photoRefFolder').value || null;
    const tagsInput = document.getElementById('photoRefTags').value;
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];

    const btn = document.getElementById('uploadPhotosBtn');
    btn.disabled = true;
    btn.textContent = 'Uploading...';

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        btn.textContent = `Uploading ${i + 1}/${files.length}...`;

        // Upload to storage
        const path = `reference/${Date.now()}_${file.name}`;
        const ref = db.storage.ref(path);
        await ref.put(file);
        const url = await ref.getDownloadURL();

        // Create reference item
        const photoTitle = (description || `Photo: ${file.name}`).substring(0, 100);
        const photoContent = description || `Photo: ${file.name}`;
        const photoAttachment = {
          type: 'image',
          url,
          path,
          name: file.name
        };

        // addToReference expects: (title, content, folderId, tags, attachment)
        await db.addToReference(photoTitle, photoContent, folderId, tags, photoAttachment);
      }

      this.pendingPhotoUploads = null;
      this.closeModal();
      await this.renderReferenceView();
      this.showToast(`${files.length} photo${files.length > 1 ? 's' : ''} uploaded`, 'success');
    } catch (error) {
      console.error('Failed to upload photos:', error);
      this.showToast('Failed to upload photos', 'error');
      btn.disabled = false;
      btn.textContent = 'Upload Photos';
    }
  }

  // Receipt Scanner Feature
  scanReceipt() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Show processing modal
      const modal = document.getElementById('modalOverlay');
      const content = document.getElementById('modalContent');
      modal.classList.add('active');

      content.innerHTML = `
        <div class="modal-header">
          <h3>Scanning Receipt</h3>
        </div>
        <div class="modal-body" style="text-align: center;">
          <div class="photo-preview-item" style="margin: 0 auto 20px; max-width: 200px;">
            <img src="${URL.createObjectURL(file)}" alt="Receipt" style="width: 100%; border-radius: 8px;">
          </div>
          <div class="loading-spinner"></div>
          <p>Analyzing receipt with AI...</p>
        </div>
      `;

      try {
        // Convert file to base64
        const base64 = await this.fileToBase64(file);
        const mediaType = file.type || 'image/jpeg';

        // Analyze with AI
        const receiptData = await window.aiService.analyzeReceipt(base64, mediaType);

        // Store the image and receipt data for sending
        this.currentReceipt = {
          file,
          base64,
          data: receiptData,
          imageUrl: URL.createObjectURL(file)
        };

        // Show results
        this.showReceiptResults(receiptData);
      } catch (error) {
        console.error('Failed to analyze receipt:', error);
        content.innerHTML = `
          <div class="modal-header">
            <h3>Receipt Scan Failed</h3>
          </div>
          <div class="modal-body">
            <p class="error-message">${this.escapeHtml(error.message)}</p>
            <p>Make sure you have an API key set up in Settings > AI Assistant.</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="app.closeModal()">Close</button>
            <button class="btn btn-primary" onclick="app.scanReceipt()">Try Again</button>
          </div>
        `;
      }
    };

    input.click();
  }

  showReceiptResults(receiptData) {
    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');

    const itemsList = receiptData.items && receiptData.items.length > 0
      ? receiptData.items.map(item =>
          `<div class="receipt-item"><span>${this.escapeHtml(item.description)}</span><span>${receiptData.currency || '$'}${item.amount}</span></div>`
        ).join('')
      : '<div class="receipt-item"><span>Items not itemized</span></div>';

    content.innerHTML = `
      <div class="modal-header">
        <h3>Receipt Details</h3>
      </div>
      <div class="modal-body">
        <div class="receipt-preview">
          <img src="${this.currentReceipt.imageUrl}" alt="Receipt" style="max-height: 150px; border-radius: 8px; margin-bottom: 16px;">
        </div>
        <div class="receipt-details">
          <div class="receipt-row">
            <strong>Vendor:</strong> ${this.escapeHtml(receiptData.vendor || 'Unknown')}
          </div>
          <div class="receipt-row">
            <strong>Date:</strong> ${receiptData.date || 'Not specified'}
          </div>
          <div class="receipt-row">
            <strong>Total:</strong> ${receiptData.currency || '$'}${receiptData.total || '0.00'}
          </div>
          <div class="receipt-row">
            <strong>Category:</strong> ${receiptData.category || 'Other'}
          </div>
          ${receiptData.summary ? `<div class="receipt-row"><strong>Summary:</strong> ${this.escapeHtml(receiptData.summary)}</div>` : ''}
        </div>
        <details class="receipt-items-details">
          <summary>View Items (${receiptData.items?.length || 0})</summary>
          <div class="receipt-items">${itemsList}</div>
        </details>
      </div>
      <div class="modal-footer" style="flex-wrap: wrap; gap: 8px;">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.sendReceiptToFinance()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="margin-right: 4px;">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          Email to Finance
        </button>
        <button class="btn btn-success" onclick="app.saveReceiptToReference()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="margin-right: 4px;">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
          </svg>
          Save to Reference
        </button>
      </div>
    `;
  }

  async sendReceiptToFinance() {
    if (!this.currentReceipt) return;

    const { data } = this.currentReceipt;
    const emailBody = window.aiService.formatReceiptForEmail(data);

    const subject = `Receipt: ${data.vendor || 'Unknown'} - ${data.currency || '$'}${data.total || '0.00'} (${data.date || 'undated'})`;
    const mailtoUrl = `mailto:finance@encantobuilders.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;

    window.open(mailtoUrl, '_blank');
    this.showToast('Email opened - attach the receipt image manually', 'info');

    // Also save to reference automatically
    await this.saveReceiptToReference(true);
  }

  async saveReceiptToReference(silent = false) {
    if (!this.currentReceipt) return;

    try {
      const { file, data } = this.currentReceipt;

      // Upload image to storage
      const path = `users/${firestoreDb.userId}/receipts/${Date.now()}_${file.name}`;
      const ref = db.storage.ref(path);
      await ref.put(file);
      const url = await ref.getDownloadURL();

      // Create reference entry
      const title = `Receipt: ${data.vendor || 'Unknown'} - ${data.currency || '$'}${data.total}`;
      const content = window.aiService.formatReceiptForEmail(data);
      const tags = ['receipt', data.category?.toLowerCase() || 'expense'].filter(Boolean);

      await db.addToReference(title, content, null, tags, {
        type: 'image',
        url,
        path,
        name: file.name
      });

      this.currentReceipt = null;

      if (!silent) {
        this.closeModal();
        this.showToast('Receipt saved to Reference', 'success');
      }
    } catch (error) {
      console.error('Failed to save receipt:', error);
      if (!silent) {
        this.showToast('Failed to save receipt', 'error');
      }
    }
  }

  async showNewReferenceModal() {
    const folders = await db.getReferenceFolders();
    const folderOptions = folders.map(f =>
      `<option value="${f.id}" ${this.currentFolder === f.id ? 'selected' : ''}>${f.icon || '📁'} ${this.escapeHtml(f.name)}</option>`
    ).join('');

    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    content.innerHTML = `
      <div class="modal-header">
        <h3>New Reference</h3>
      </div>
      <div class="modal-body">
        <div class="composer-field">
          <label>Content *</label>
          <textarea class="composer-textarea" id="newRefContent" rows="4" placeholder="Enter reference information..."></textarea>
        </div>
        <div class="composer-field">
          <label>Folder</label>
          <select class="composer-input" id="newRefFolder">
            <option value="">No folder (Unfiled)</option>
            ${folderOptions}
          </select>
        </div>
        <div class="composer-field">
          <label>Tags (comma separated)</label>
          <input type="text" class="composer-input" id="newRefTags" placeholder="tag1, tag2, tag3">
        </div>
        <div class="composer-field">
          <label>Attach Photo (optional)</label>
          <input type="file" id="newRefPhoto" accept="image/*" class="composer-input">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.createNewReference()">Create Reference</button>
      </div>
    `;

    document.getElementById('newRefContent').focus();
  }

  async createNewReference() {
    const content = document.getElementById('newRefContent').value.trim();
    const folderId = document.getElementById('newRefFolder').value || null;
    const tagsInput = document.getElementById('newRefTags').value;
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
    const photoInput = document.getElementById('newRefPhoto');

    if (!content) {
      this.showToast('Content is required', 'error');
      return;
    }

    try {
      let attachment = null;

      // Handle photo upload if provided
      if (photoInput.files && photoInput.files[0]) {
        const file = photoInput.files[0];
        this.showToast('Uploading photo...', 'info');

        // Upload to storage
        const path = `reference/${Date.now()}_${file.name}`;
        const ref = db.storage.ref(path);
        await ref.put(file);
        const url = await ref.getDownloadURL();

        attachment = {
          type: 'image',
          url,
          path,
          name: file.name
        };
      }

      // Create title from content (truncate if long)
      const title = content.substring(0, 100);

      // addToReference expects: (title, content, folderId, tags, attachment)
      await db.addToReference(title, content, folderId, tags, attachment);
      this.closeModal();
      await this.renderReferenceView();
      this.showToast('Reference created', 'success');
    } catch (error) {
      console.error('Failed to create reference:', error);
      this.showToast('Failed to create reference', 'error');
    }
  }

  async editReference(id) {
    const items = await db.getReferenceItems();
    const item = items.find(i => i.id === id);
    if (!item) return;

    const folders = await db.getReferenceFolders();
    const folderOptions = folders.map(f =>
      `<option value="${f.id}" ${item.folderId === f.id ? 'selected' : ''}>${f.icon || '📁'} ${this.escapeHtml(f.name)}</option>`
    ).join('');

    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    content.innerHTML = `
      <div class="modal-header">
        <h3>Edit Reference</h3>
      </div>
      <div class="modal-body">
        <div class="composer-field">
          <label>Content</label>
          <textarea class="composer-textarea" id="editRefContent" rows="4">${this.escapeHtml(item.content)}</textarea>
        </div>
        <div class="composer-field">
          <label>Folder</label>
          <select class="composer-input" id="editRefFolder">
            <option value="">No folder (Unfiled)</option>
            ${folderOptions}
          </select>
        </div>
        <div class="composer-field">
          <label>Tags (comma separated)</label>
          <input type="text" class="composer-input" id="editRefTags" value="${(item.tags || []).join(', ')}" placeholder="tag1, tag2, tag3">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.saveReferenceEdit('${id}')">Save Changes</button>
      </div>
    `;
  }

  async saveReferenceEdit(id) {
    const content = document.getElementById('editRefContent').value.trim();
    const folderId = document.getElementById('editRefFolder').value || null;
    const tagsInput = document.getElementById('editRefTags').value;
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];

    if (!content) {
      this.showToast('Content cannot be empty', 'error');
      return;
    }

    try {
      await db.updateReference(id, { content, folderId, tags });
      this.closeModal();
      await this.renderReferenceView();
      this.showToast('Reference updated', 'success');
    } catch (error) {
      console.error('Failed to update reference:', error);
      this.showToast('Failed to update', 'error');
    }
  }

  async deleteReference(id) {
    if (!confirm('Are you sure you want to delete this reference?')) return;

    try {
      await db.deleteFromReference(id);
      await this.updateCounts();
      await this.renderReferenceView();
      this.showToast('Reference deleted', 'success');
    } catch (error) {
      console.error('Failed to delete reference:', error);
      this.showToast('Failed to delete', 'error');
    }
  }

  closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
    this.processingItem = null;
    this.processingStep = 1;
    this.selectedContexts = [];
    this.selectedTags = [];
    this.selectedPriority = 'medium';
    this.selectedDueDate = null;
    this.selectedLocation = null;
    this.referenceTags = [];
    this.delegateTo = null;
    this.delegationMethod = null;
    this.actionText = '';
    this.actionSuggestions = [];
    this.tagSuggestions = [];
  }

  // =====================
  // Settings Operations
  // =====================
  addContext() {
    const input = document.getElementById('newContextInput');
    let context = input.value.trim();

    if (!context) return;

    // Ensure context starts with @
    if (!context.startsWith('@')) {
      context = '@' + context;
    }

    // Check if context already exists
    if (this.contexts.includes(context)) {
      this.showToast('Context already exists', 'error');
      return;
    }

    this.contexts.push(context);
    input.value = '';
    this.renderSettingsView();
    this.showToast(`Added context: ${context}`, 'success');
  }

  removeContext(context) {
    const index = this.contexts.indexOf(context);
    if (index > -1) {
      this.contexts.splice(index, 1);
      this.renderSettingsView();
      this.showToast(`Removed context: ${context}`, 'success');
    }
  }

  async editTeamMember(id) {
    const member = await db.getTeamMember(id);
    if (!member) return;

    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    content.innerHTML = `
      <div class="modal-header">
        <h3>Edit Team Member</h3>
      </div>
      <div class="modal-body">
        <div class="composer-field">
          <label>Name:</label>
          <input type="text" class="composer-input" id="memberName" value="${this.escapeHtml(member.name)}">
        </div>
        <div class="composer-field">
          <label>Role:</label>
          <input type="text" class="composer-input" id="memberRole" value="${this.escapeHtml(member.role)}">
        </div>
        <div class="composer-field">
          <label>Email:</label>
          <input type="email" class="composer-input" id="memberEmail" value="${this.escapeHtml(member.email)}">
        </div>
        <div class="composer-field">
          <label>Phone:</label>
          <input type="tel" class="composer-input" id="memberPhone" value="${this.escapeHtml(member.phone || '')}">
        </div>
        <div class="composer-field">
          <label>Typical Response (days):</label>
          <input type="number" class="composer-input" id="memberResponse" value="${member.typicalResponseDays || 2}">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal(); app.renderSettingsView()">Cancel</button>
        <button class="btn btn-primary" onclick="app.updateTeamMemberById('${id}')">Save</button>
      </div>
    `;
  }

  async updateTeamMemberById(id) {
    const member = await db.getTeamMember(id);
    if (!member) return;

    member.name = document.getElementById('memberName').value.trim();
    member.role = document.getElementById('memberRole').value.trim();
    member.email = document.getElementById('memberEmail').value.trim();
    member.phone = document.getElementById('memberPhone').value.trim();
    member.typicalResponseDays = parseInt(document.getElementById('memberResponse').value) || 2;

    await db.updateTeamMember(member);
    this.closeModal();
    await this.renderSettingsView();
    this.showToast('Team member updated', 'success');
  }

  async addTeamMember() {
    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    modal.classList.add('active');

    content.innerHTML = `
      <div class="modal-header">
        <h3>Add Team Member</h3>
      </div>
      <div class="modal-body">
        <div class="composer-field">
          <label>Name:</label>
          <input type="text" class="composer-input" id="memberName" placeholder="e.g., John">
        </div>
        <div class="composer-field">
          <label>Role:</label>
          <input type="text" class="composer-input" id="memberRole" placeholder="e.g., Project Manager">
        </div>
        <div class="composer-field">
          <label>Email:</label>
          <input type="email" class="composer-input" id="memberEmail" placeholder="e.g., john@example.com">
        </div>
        <div class="composer-field">
          <label>Phone:</label>
          <input type="tel" class="composer-input" id="memberPhone" placeholder="e.g., 555-1234">
        </div>
        <div class="composer-field">
          <label>Typical Response (days):</label>
          <input type="number" class="composer-input" id="memberResponse" value="2">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal(); app.renderSettingsView()">Cancel</button>
        <button class="btn btn-primary" onclick="app.createTeamMember()">Add Member</button>
      </div>
    `;
  }

  async createTeamMember() {
    const name = document.getElementById('memberName').value.trim();
    if (!name) {
      this.showToast('Name is required', 'error');
      return;
    }

    const colors = ['#ec4899', '#06b6d4', '#6366f1', '#f59e0b', '#10b981', '#ef4444'];
    const existingMembers = await db.getTeamMembers();
    const color = colors[existingMembers.length % colors.length];

    const member = {
      name: name,
      role: document.getElementById('memberRole').value.trim() || 'Team Member',
      email: document.getElementById('memberEmail').value.trim(),
      phone: document.getElementById('memberPhone').value.trim(),
      typicalResponseDays: parseInt(document.getElementById('memberResponse').value) || 2,
      color: color
    };

    await db.addTeamMember(member);
    this.closeModal();
    await this.renderSettingsView();
    this.showToast('Team member added', 'success');
  }

  // =====================
  // Data Management
  // =====================
  // ============================================
  // DATA EXPORT/IMPORT
  // ============================================

  async exportDataAsJson() {
    try {
      const data = await db.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const dateStr = new Date().toISOString().split('T')[0];
      const a = document.createElement('a');
      a.href = url;
      a.download = `gtd-backup-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Save last backup date
      localStorage.setItem('gtd_last_backup', new Date().toISOString());
      this.updateLastBackupDate();

      this.showToast('Data exported successfully', 'success');
    } catch (error) {
      console.error('Failed to export:', error);
      this.showToast('Failed to export data', 'error');
    }
  }

  async exportDataAsCsv() {
    try {
      // Get actions for CSV export
      const actions = await db.getNextActions();
      const waiting = await db.getWaitingFor();
      const projects = await db.getProjects();

      // Build CSV content
      const rows = [
        ['Type', 'Description', 'Context/Status', 'Project', 'Due Date', 'Priority', 'Created']
      ];

      // Add actions
      for (const action of actions) {
        rows.push([
          'Next Action',
          this.escapeCsvField(action.action),
          action.contexts ? action.contexts.join('; ') : '',
          action.projectId || '',
          action.dueDate || '',
          action.priority || 'medium',
          action.processedAt || ''
        ]);
      }

      // Add waiting for
      for (const item of waiting) {
        rows.push([
          'Waiting For',
          this.escapeCsvField(item.action),
          `@waiting-for-${item.delegatedTo}`,
          item.projectId || '',
          item.dueDate || '',
          '',
          item.delegatedAt || ''
        ]);
      }

      // Add projects
      for (const project of projects) {
        rows.push([
          'Project',
          this.escapeCsvField(project.name),
          project.status,
          '',
          '',
          '',
          project.created || ''
        ]);
      }

      const csvContent = rows.map(row => row.join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);

      const dateStr = new Date().toISOString().split('T')[0];
      const a = document.createElement('a');
      a.href = url;
      a.download = `gtd-actions-${dateStr}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.showToast('CSV exported successfully', 'success');
    } catch (error) {
      console.error('Failed to export CSV:', error);
      this.showToast('Failed to export CSV', 'error');
    }
  }

  escapeCsvField(field) {
    if (!field) return '';
    const str = String(field);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  async showImportPreview(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Count items in import
      const counts = {
        inbox: data.inbox?.length || 0,
        actions: data.nextActions?.length || 0,
        waiting: data.waitingFor?.length || 0,
        projects: data.projects?.length || 0,
        reference: data.reference?.length || 0,
        archived: data.archived?.length || 0
      };
      const total = Object.values(counts).reduce((a, b) => a + b, 0);

      // Show import preview modal
      const modalContent = document.getElementById('modalContent');
      modalContent.innerHTML = `
        <div class="modal-header">
          <h2>Import Data</h2>
          <button class="modal-close" onclick="app.closeModal()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="import-preview">
          <div class="import-file-info">
            <span class="file-icon">📁</span>
            <span class="file-name">${this.escapeHtml(file.name)}</span>
          </div>

          <h4>Items to Import:</h4>
          <div class="import-counts">
            ${counts.inbox > 0 ? `<div class="import-count-row"><span>Inbox items:</span><span>${counts.inbox}</span></div>` : ''}
            ${counts.actions > 0 ? `<div class="import-count-row"><span>Next Actions:</span><span>${counts.actions}</span></div>` : ''}
            ${counts.waiting > 0 ? `<div class="import-count-row"><span>Waiting For:</span><span>${counts.waiting}</span></div>` : ''}
            ${counts.projects > 0 ? `<div class="import-count-row"><span>Projects:</span><span>${counts.projects}</span></div>` : ''}
            ${counts.reference > 0 ? `<div class="import-count-row"><span>Reference:</span><span>${counts.reference}</span></div>` : ''}
            ${counts.archived > 0 ? `<div class="import-count-row"><span>Archived:</span><span>${counts.archived}</span></div>` : ''}
            <div class="import-count-row total"><span>Total:</span><span>${total} items</span></div>
          </div>

          <div class="import-options">
            <h4>Import Mode:</h4>
            <label class="import-option">
              <input type="radio" name="importMode" value="replace" checked>
              <span class="option-label">Replace all data</span>
              <span class="option-desc">Remove existing data and import new</span>
            </label>
            <label class="import-option">
              <input type="radio" name="importMode" value="merge">
              <span class="option-label">Merge with existing</span>
              <span class="option-desc">Add imported items, skip duplicates</span>
            </label>
          </div>

          <div class="import-warning">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <span>This action cannot be undone. Consider exporting your current data first.</span>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="app.executeImport()">Import Data</button>
        </div>
      `;

      // Store data for import execution
      this.pendingImportData = data;
      document.getElementById('modalOverlay').classList.add('active');

    } catch (error) {
      console.error('Failed to parse import file:', error);
      this.showToast('Invalid JSON file format', 'error');
    }

    event.target.value = '';
  }

  async executeImport() {
    if (!this.pendingImportData) return;

    const mode = document.querySelector('input[name="importMode"]:checked')?.value || 'replace';

    try {
      if (mode === 'replace') {
        await db.importData(this.pendingImportData);
      } else {
        await db.mergeImportData(this.pendingImportData);
      }

      await this.updateCounts();
      await this.renderCurrentView();
      this.closeModal();
      this.showToast('Data imported successfully', 'success');
    } catch (error) {
      console.error('Failed to import:', error);
      this.showToast('Failed to import data', 'error');
    }

    this.pendingImportData = null;
  }

  showResetConfirmation() {
    const modalContent = document.getElementById('modalContent');
    modalContent.innerHTML = `
      <div class="modal-header">
        <h2>Reset All Data</h2>
        <button class="modal-close" onclick="app.closeModal()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="reset-warning">
        <div class="warning-icon">⚠️</div>
        <h3>This action cannot be undone!</h3>
        <p>This will permanently delete:</p>
        <ul>
          <li>All inbox items</li>
          <li>All next actions</li>
          <li>All waiting for items</li>
          <li>All projects</li>
          <li>All reference materials</li>
          <li>All archived items</li>
          <li>All trash items</li>
        </ul>
        <p class="reset-confirm-text">Type <strong>DELETE</strong> below to confirm:</p>
        <input type="text" id="resetConfirmInput" class="reset-confirm-input" placeholder="Type DELETE">
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-danger" id="confirmResetBtn" onclick="app.executeReset()" disabled>Reset All Data</button>
      </div>
    `;

    // Enable button only when DELETE is typed
    const input = document.getElementById('resetConfirmInput');
    const btn = document.getElementById('confirmResetBtn');
    input.addEventListener('input', () => {
      btn.disabled = input.value !== 'DELETE';
    });

    document.getElementById('modalOverlay').classList.add('active');
    input.focus();
  }

  async executeReset() {
    const input = document.getElementById('resetConfirmInput');
    if (input.value !== 'DELETE') return;

    try {
      await db.clearAllData();
      await this.updateCounts();
      this.currentView = 'inbox';
      await this.renderCurrentView();
      this.closeModal();
      this.showToast('All data has been reset', 'success');
    } catch (error) {
      console.error('Failed to reset:', error);
      this.showToast('Failed to reset data', 'error');
    }
  }

  updateLastBackupDate() {
    const lastBackup = localStorage.getItem('gtd_last_backup');
    const dateEl = document.getElementById('lastBackupDate');
    if (dateEl) {
      if (lastBackup) {
        const date = new Date(lastBackup);
        dateEl.textContent = date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });
      } else {
        dateEl.textContent = 'Never';
      }
    }
  }

  // Legacy functions for sidebar buttons
  async exportData() {
    return this.exportDataAsJson();
  }

  async importData(event) {
    return this.showImportPreview(event);
  }

  confirmClearData() {
    return this.showResetConfirmation();
  }

  // Legacy clear data function (kept for compatibility)
  legacyConfirmClearData() {
    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');

    modal.classList.add('active');

    content.innerHTML = `
      <div class="modal-header">
        <h3>Clear All Data</h3>
      </div>
      <div class="modal-body confirm-dialog">
        <p>Are you sure you want to delete all data? This action cannot be undone.</p>
        <p><strong>This will delete all inbox items, next actions, waiting items, and references.</strong></p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-danger" onclick="app.clearAllData()">Delete Everything</button>
      </div>
    `;
  }

  async clearAllData() {
    try {
      await db.clearAllData();
      this.closeModal();
      await this.updateCounts();
      await this.renderCurrentView();
      this.showToast('All data cleared', 'success');
    } catch (error) {
      console.error('Failed to clear data:', error);
      this.showToast('Failed to clear data', 'error');
    }
  }

  // =====================
  // Utility functions
  // =====================
  formatDate(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) {
      return 'Just now';
    }

    if (diff < 3600000) {
      const mins = Math.floor(diff / 60000);
      return `${mins}m ago`;
    }

    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h ago`;
    }

    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000);
      return `${days}d ago`;
    }

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }

  truncate(text, maxLength) {
    if (!text || typeof text !== 'string') return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  escapeHtml(text) {
    if (!text || typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  // =====================
  // Drag and Drop Handlers
  // =====================
  handleDragStart(event) {
    const item = event.target.closest('.draggable');
    if (!item) return;

    const itemId = item.dataset.id;
    const itemType = item.dataset.type;

    event.dataTransfer.setData('text/plain', JSON.stringify({ id: itemId, type: itemType }));
    event.dataTransfer.effectAllowed = 'move';

    // Add dragging class for visual feedback
    item.classList.add('dragging');
    document.body.classList.add('is-dragging');

    // Store for reference
    this.draggedItem = { id: itemId, type: itemType, element: item };
  }

  handleDragEnd(event) {
    const item = event.target.closest('.draggable');
    if (item) {
      item.classList.remove('dragging');
    }
    document.body.classList.remove('is-dragging');

    // Remove all drop-target classes
    document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));

    this.draggedItem = null;
  }

  handleDragOver(event, navItem) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    const targetView = navItem.dataset.view;

    // Only allow drops on valid targets
    if (this.isValidDropTarget(targetView)) {
      navItem.classList.add('drop-target');
    }
  }

  handleDragLeave(event, navItem) {
    navItem.classList.remove('drop-target');
  }

  async handleDrop(event, navItem) {
    event.preventDefault();
    navItem.classList.remove('drop-target');

    const targetView = navItem.dataset.view;

    if (!this.isValidDropTarget(targetView)) {
      this.showToast('Cannot drop here', 'warning');
      return;
    }

    try {
      const data = JSON.parse(event.dataTransfer.getData('text/plain'));
      await this.moveItemTo(data.id, data.type, targetView);
    } catch (error) {
      console.error('Drop failed:', error);
      this.showToast('Failed to move item', 'error');
    }
  }

  isValidDropTarget(targetView) {
    if (!this.draggedItem) return false;

    const sourceType = this.draggedItem.type;

    // Define valid moves
    const validMoves = {
      inbox: ['archive', 'trash'],
      action: ['archive', 'trash', 'waitingFor'],
      waiting: ['archive', 'trash', 'nextActions']
    };

    return validMoves[sourceType]?.includes(targetView) || false;
  }

  async moveItemTo(itemId, sourceType, targetView) {
    try {
      let item;

      // Get the item from source store
      if (sourceType === 'inbox') {
        item = await db.get('inbox', itemId);
      } else if (sourceType === 'action') {
        item = await db.get('nextActions', itemId);
      } else if (sourceType === 'waiting') {
        item = await db.get('waitingFor', itemId);
      }

      if (!item) {
        this.showToast('Item not found', 'error');
        return;
      }

      // Move to target
      if (targetView === 'archive') {
        // Archive the item
        const archivedItem = {
          ...item,
          id: db.generateId(),
          archivedDate: new Date().toISOString(),
          originalStore: sourceType
        };
        await db.add('archived', archivedItem);

        // Delete from source
        if (sourceType === 'inbox') await db.delete('inbox', itemId);
        if (sourceType === 'action') await db.delete('nextActions', itemId);
        if (sourceType === 'waiting') await db.delete('waitingFor', itemId);

        this.showToast('Moved to Archive', 'success');

      } else if (targetView === 'trash') {
        // Move to trash
        await db.moveToTrash(itemId, sourceType === 'inbox' ? 'inbox' :
                                      sourceType === 'action' ? 'nextActions' : 'waitingFor');
        this.showToast('Moved to Trash', 'success');

      } else if (targetView === 'nextActions' && sourceType === 'waiting') {
        // Convert waiting item back to action
        const actionItem = {
          id: db.generateId(),
          action: item.action,
          contexts: ['@computer'],
          originalContent: item.originalContent || item.action,
          originalTimestamp: item.delegatedDate,
          processedDate: new Date().toISOString(),
          tags: []
        };
        await db.add('nextActions', actionItem);
        await db.delete('waitingFor', itemId);
        this.showToast('Moved to Next Actions', 'success');

      } else if (targetView === 'waitingFor' && sourceType === 'action') {
        // Show delegation modal for this action
        this.processingItem = {
          id: item.id,
          content: item.originalContent || item.action,
          timestamp: item.originalTimestamp
        };
        this.actionText = item.action;
        this.processingStep = 3;
        this.showProcessingModal();
        return; // Don't refresh yet, modal will handle it
      }

      // Refresh counts and current view
      await this.updateCounts();
      await this.renderCurrentView();

    } catch (error) {
      console.error('Failed to move item:', error);
      this.showToast('Failed to move item', 'error');
    }
  }

  // =====================
  // Settings Management
  // =====================

  async loadSettings() {
    try {
      const settingsKeys = [
        'defaultActionMode',
        'showOnDeck',
        'enableStepSuggestions',
        'maxFileSize',
        'showFilePreviews',
        'enableNLP'
      ];

      for (const key of settingsKeys) {
        const value = await db.getSetting(key);
        if (value !== null) {
          this.settings[key] = value;
        }
      }

      // Update UI elements with loaded settings
      this.applySettingsToUI();

    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  applySettingsToUI() {
    // Apply settings to UI elements if they exist
    const actionModeSelect = document.getElementById('defaultActionMode');
    if (actionModeSelect) actionModeSelect.value = this.settings.defaultActionMode;

    const showOnDeckToggle = document.getElementById('showOnDeck');
    if (showOnDeckToggle) showOnDeckToggle.checked = this.settings.showOnDeck;

    const stepSuggestionsToggle = document.getElementById('enableStepSuggestions');
    if (stepSuggestionsToggle) stepSuggestionsToggle.checked = this.settings.enableStepSuggestions;

    const maxFileSizeSelect = document.getElementById('maxFileSize');
    if (maxFileSizeSelect) maxFileSizeSelect.value = this.settings.maxFileSize;

    const filePreviewsToggle = document.getElementById('showFilePreviews');
    if (filePreviewsToggle) filePreviewsToggle.checked = this.settings.showFilePreviews;

    const nlpToggle = document.getElementById('enableNLP');
    if (nlpToggle) nlpToggle.checked = this.settings.enableNLP;
  }

  async saveSetting(key, value) {
    try {
      // Convert numeric values
      if (key === 'maxFileSize') {
        value = parseInt(value, 10);
      }

      // Update local settings object
      this.settings[key] = value;

      // Persist to database
      await db.setSetting(key, value);

      this.showToast('Setting saved', 'success');

    } catch (error) {
      console.error('Failed to save setting:', error);
      this.showToast('Failed to save setting', 'error');
    }
  }

  // =====================
  // Areas of Responsibility
  // =====================

  async renderAreasView() {
    const grid = document.getElementById('areasGrid');
    if (!grid) return;

    const areaStats = await db.getAreaStats();

    if (areaStats.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <circle cx="12" cy="12" r="6"></circle>
            <circle cx="12" cy="12" r="2"></circle>
          </svg>
          <h3>No Areas Yet</h3>
          <p>Areas help you organize your work by life domains like Health, Career, or Family.</p>
          <button class="btn btn-primary" onclick="app.showAddAreaModal()">Create Your First Area</button>
        </div>
      `;
      return;
    }

    grid.innerHTML = areaStats.map(area => this.renderAreaCard(area)).join('');
  }

  renderAreaCard(area) {
    const iconSvg = this.getAreaIconSvg(area.icon);

    return `
      <div class="area-card" data-area-id="${area.id}">
        <div class="area-card-header">
          <div class="area-icon" style="background: ${area.color}">
            ${iconSvg}
          </div>
          <div class="area-info">
            <h3 class="area-name">${this.escapeHtml(area.name)}</h3>
          </div>
          <div class="area-actions">
            <button class="area-action-btn" onclick="app.showEditAreaModal('${area.id}')" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="area-action-btn" onclick="app.confirmDeleteArea('${area.id}')" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>

        <div class="area-stats">
          <div class="area-stat">
            <span class="area-stat-value" style="color: ${area.color}">${area.activeActionCount}</span>
            <span class="area-stat-label">Active Actions</span>
          </div>
          <div class="area-stat">
            <span class="area-stat-value" style="color: ${area.color}">${area.activeProjectCount}</span>
            <span class="area-stat-label">Active Projects</span>
          </div>
        </div>

        ${this.renderAreaPreview(area)}
      </div>
    `;
  }

  async renderAreaPreview(area) {
    const items = await db.getItemsByArea(area.id);
    const recentActions = items.actions.filter(a => !a.completed).slice(0, 3);
    const recentProjects = items.projects.filter(p => p.status === 'active').slice(0, 2);

    if (recentActions.length === 0 && recentProjects.length === 0) {
      return `<div class="area-empty">No active items in this area</div>`;
    }

    let html = '<div class="area-items-preview">';

    if (recentActions.length > 0) {
      html += '<h4>Recent Actions</h4><ul class="area-preview-list">';
      recentActions.forEach(action => {
        html += `
          <li>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            ${this.escapeHtml(action.content.substring(0, 50))}${action.content.length > 50 ? '...' : ''}
          </li>
        `;
      });
      html += '</ul>';
    }

    if (recentProjects.length > 0) {
      html += '<h4>Projects</h4><ul class="area-preview-list">';
      recentProjects.forEach(project => {
        html += `
          <li>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            ${this.escapeHtml(project.name.substring(0, 50))}${project.name.length > 50 ? '...' : ''}
          </li>
        `;
      });
      html += '</ul>';
    }

    html += '</div>';
    return html;
  }

  showAddAreaModal() {
    this.editingAreaId = null;
    this.selectedAreaColor = '#6366f1';
    this.selectedAreaIcon = 'briefcase';

    this.showModal(`
      <h2>Create New Area</h2>
      <div class="area-form">
        <div class="form-group">
          <label for="areaName">Area Name</label>
          <input type="text" id="areaName" class="form-control" placeholder="e.g., Health, Career, Family" autofocus>
        </div>

        <div class="form-group">
          <label>Color</label>
          <div class="color-picker-row">
            ${this.renderAreaColorPicker()}
          </div>
        </div>

        <div class="form-group">
          <label>Icon</label>
          <div class="icon-picker-row">
            ${this.renderAreaIconPicker()}
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="app.saveArea()">Create Area</button>
        </div>
      </div>
    `);
  }

  async showEditAreaModal(areaId) {
    const area = await db.getArea(areaId);
    if (!area) return;

    this.editingAreaId = areaId;
    this.selectedAreaColor = area.color;
    this.selectedAreaIcon = area.icon;

    this.showModal(`
      <h2>Edit Area</h2>
      <div class="area-form">
        <div class="form-group">
          <label for="areaName">Area Name</label>
          <input type="text" id="areaName" class="form-control" value="${this.escapeHtml(area.name)}" autofocus>
        </div>

        <div class="form-group">
          <label>Color</label>
          <div class="color-picker-row">
            ${this.renderAreaColorPicker()}
          </div>
        </div>

        <div class="form-group">
          <label>Icon</label>
          <div class="icon-picker-row">
            ${this.renderAreaIconPicker()}
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="app.saveArea()">Save Changes</button>
        </div>
      </div>
    `);
  }

  renderAreaColorPicker() {
    const colors = [
      '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
      '#ec4899', '#f43f5e', '#ef4444', '#f97316',
      '#f59e0b', '#eab308', '#84cc16', '#22c55e',
      '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9'
    ];

    return colors.map(color => `
      <div class="color-option ${color === this.selectedAreaColor ? 'selected' : ''}"
           style="background: ${color}"
           onclick="app.selectAreaColor('${color}')">
      </div>
    `).join('');
  }

  renderAreaIconPicker() {
    const icons = ['briefcase', 'heart', 'users', 'dollar-sign', 'user', 'home', 'book', 'star', 'target', 'zap', 'coffee', 'music'];

    return icons.map(icon => `
      <div class="icon-option ${icon === this.selectedAreaIcon ? 'selected' : ''}"
           onclick="app.selectAreaIcon('${icon}')">
        ${this.getAreaIconSvg(icon)}
      </div>
    `).join('');
  }

  selectAreaColor(color) {
    this.selectedAreaColor = color;
    document.querySelectorAll('.color-option').forEach(el => {
      el.classList.toggle('selected', el.style.background === color);
    });
  }

  selectAreaIcon(icon) {
    this.selectedAreaIcon = icon;
    document.querySelectorAll('.icon-option').forEach(el => {
      el.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');
  }

  async saveArea() {
    const nameInput = document.getElementById('areaName');
    const name = nameInput?.value?.trim();

    if (!name) {
      this.showToast('Please enter an area name', 'error');
      return;
    }

    try {
      if (this.editingAreaId) {
        await db.updateArea(this.editingAreaId, {
          name,
          color: this.selectedAreaColor,
          icon: this.selectedAreaIcon
        });
        this.showToast('Area updated', 'success');
      } else {
        await db.createArea(name, this.selectedAreaColor, this.selectedAreaIcon);
        this.showToast('Area created', 'success');
      }

      this.closeModal();
      await this.renderAreasView();
    } catch (error) {
      console.error('Error saving area:', error);
      this.showToast('Failed to save area', 'error');
    }
  }

  async confirmDeleteArea(areaId) {
    const area = await db.getArea(areaId);
    if (!area) return;

    const items = await db.getItemsByArea(areaId);
    const totalItems = items.actions.length + items.projects.length;

    this.showModal(`
      <h2>Delete Area</h2>
      <p>Are you sure you want to delete <strong>${this.escapeHtml(area.name)}</strong>?</p>
      ${totalItems > 0 ? `<p class="warning-text">This area has ${totalItems} items associated with it. They will be unlinked but not deleted.</p>` : ''}
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-danger" onclick="app.deleteArea('${areaId}')">Delete Area</button>
      </div>
    `);
  }

  async deleteArea(areaId) {
    try {
      await db.deleteArea(areaId);
      this.showToast('Area deleted', 'success');
      this.closeModal();
      await this.renderAreasView();
    } catch (error) {
      console.error('Error deleting area:', error);
      this.showToast('Failed to delete area', 'error');
    }
  }

  getAreaIconSvg(iconName) {
    const icons = {
      'briefcase': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>',
      'heart': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>',
      'users': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
      'dollar-sign': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>',
      'user': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
      'home': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>',
      'book': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>',
      'star': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>',
      'target': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>',
      'zap': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>',
      'coffee': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>',
      'music': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>',
      'folder': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>'
    };
    return icons[iconName] || icons['folder'];
  }

  async renderAreaSelector(selectedAreaId = null) {
    const areas = await db.getAreas();
    if (areas.length === 0) return '';

    return `
      <div class="form-group">
        <label>Area of Responsibility</label>
        <div class="area-selector">
          <div class="area-chip ${!selectedAreaId ? 'selected' : ''}"
               style="background: var(--color-surface-elevated); color: var(--color-text-secondary)"
               onclick="app.selectArea(null)">
            None
          </div>
          ${areas.map(area => `
            <div class="area-chip ${area.id === selectedAreaId ? 'selected' : ''}"
                 style="background: ${area.color}20; color: ${area.color}"
                 onclick="app.selectArea('${area.id}')">
              <span class="area-chip-dot" style="background: ${area.color}"></span>
              ${this.escapeHtml(area.name)}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  selectArea(areaId) {
    this.selectedAreaId = areaId;
    document.querySelectorAll('.area-chip').forEach(chip => {
      chip.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');
  }

  // =====================
  // Command Palette
  // =====================

  initCommandPalette() {
    this.commandPaletteOpen = false;
    this.commandPaletteSelectedIndex = 0;
    this.commandPaletteResults = [];

    // Define available commands
    this.commands = [
      // Navigation
      { id: 'nav-inbox', title: 'Go to Inbox', category: 'Navigation', icon: 'inbox', action: () => this.navigateTo('inbox'), shortcut: 'G I' },
      { id: 'nav-today', title: 'Go to Today', category: 'Navigation', icon: 'calendar', action: () => this.navigateTo('today'), shortcut: 'G T' },
      { id: 'nav-actions', title: 'Go to Next Actions', category: 'Navigation', icon: 'check-circle', action: () => this.navigateTo('nextActions'), shortcut: 'G A' },
      { id: 'nav-waiting', title: 'Go to Waiting For', category: 'Navigation', icon: 'clock', action: () => this.navigateTo('waitingFor'), shortcut: 'G W' },
      { id: 'nav-projects', title: 'Go to Projects', category: 'Navigation', icon: 'folder', action: () => this.navigateTo('projects'), shortcut: 'G P' },
      { id: 'nav-areas', title: 'Go to Areas', category: 'Navigation', icon: 'target', action: () => this.navigateTo('areas'), shortcut: 'G E' },
      { id: 'nav-someday', title: 'Go to Someday/Maybe', category: 'Navigation', icon: 'cloud', action: () => this.navigateTo('somedayMaybe'), shortcut: 'G S' },
      { id: 'nav-reference', title: 'Go to Reference', category: 'Navigation', icon: 'book', action: () => this.navigateTo('reference'), shortcut: 'G R' },
      { id: 'nav-review', title: 'Start Weekly Review', category: 'Navigation', icon: 'clipboard', action: () => this.navigateTo('weeklyReview'), shortcut: 'G V' },
      { id: 'nav-settings', title: 'Go to Settings', category: 'Navigation', icon: 'settings', action: () => this.navigateTo('settings'), shortcut: 'G ,' },

      // Actions
      { id: 'capture', title: 'Quick Capture', category: 'Actions', icon: 'plus', action: () => this.focusCapture(), shortcut: 'C' },
      { id: 'new-project', title: 'Create New Project', category: 'Actions', icon: 'folder-plus', action: () => this.showNewProjectModal() },
      { id: 'new-folder', title: 'Create New Folder', category: 'Actions', icon: 'folder', action: () => this.showNewFolderModal() },
      { id: 'clear-completed', title: 'Clear Completed Actions', category: 'Actions', icon: 'trash', action: () => this.clearCompletedActions() },

      // Calendar
      { id: 'focus-time', title: 'Block Focus Time', category: 'Calendar', icon: 'clock', action: () => this.showBlockFocusTimeModal() },
      { id: 'calendar-today', title: 'Show Today\'s Calendar', category: 'Calendar', icon: 'calendar', action: () => this.navigateTo('today') },
      { id: 'calendar-availability', title: 'Check Availability', category: 'Calendar', icon: 'calendar', action: () => this.showBlockFocusTimeModal() },
      { id: 'sync-deadlines', title: 'Sync Project Deadlines to Calendar', category: 'Calendar', icon: 'upload', action: () => this.syncAllProjectDeadlines() },

      // Views
      { id: 'filter-all', title: 'Show All Actions', category: 'Filters', icon: 'list', action: () => { this.activeFilter = 'all'; this.renderCurrentView(); } },
      { id: 'filter-today', title: 'Show Due Today', category: 'Filters', icon: 'calendar', action: () => { this.activeFilter = 'today'; this.renderCurrentView(); } },
      { id: 'filter-overdue', title: 'Show Overdue', category: 'Filters', icon: 'alert-circle', action: () => { this.activeFilter = 'overdue'; this.renderCurrentView(); } },
      { id: 'filter-high', title: 'Show High Priority', category: 'Filters', icon: 'flag', action: () => { this.activeFilter = 'high'; this.renderCurrentView(); } },

      // Help
      { id: 'help', title: 'Open Help & Documentation', category: 'Help', icon: 'help-circle', action: () => this.openHelpPanel(), shortcut: '?' },
      { id: 'help-gtd', title: 'What is GTD?', category: 'Help', icon: 'book', action: () => this.openHelpArticle('what-is-gtd') },
      { id: 'help-quick-start', title: 'Quick Start Guide', category: 'Help', icon: 'rocket', action: () => this.openHelpArticle('quick-start') },
      { id: 'help-shortcuts', title: 'Keyboard Shortcuts', category: 'Help', icon: 'keyboard', action: () => this.openHelpArticle('keyboard-shortcuts') },
      { id: 'help-tour', title: 'Start Onboarding Tour', category: 'Help', icon: 'play', action: () => this.startOnboarding() },
    ];

    // Setup keyboard listener for Cmd+P / Ctrl+P
    document.addEventListener('keydown', (e) => {
      // Open command palette with Cmd+P or Ctrl+P
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        this.toggleCommandPalette();
        return;
      }

      // Handle escape to close
      if (e.key === 'Escape' && this.commandPaletteOpen) {
        e.preventDefault();
        this.closeCommandPalette();
        return;
      }

      // Handle arrow keys and enter when open
      if (this.commandPaletteOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.navigateCommandPalette(1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.navigateCommandPalette(-1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          this.executeSelectedCommand();
        }
      }
    });

    // Close on overlay click
    const overlay = document.getElementById('commandPaletteOverlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.closeCommandPalette();
        }
      });
    }

    // Setup input listener
    const input = document.getElementById('commandPaletteInput');
    if (input) {
      input.addEventListener('input', () => this.filterCommandPalette(input.value));
    }
  }

  toggleCommandPalette() {
    if (this.commandPaletteOpen) {
      this.closeCommandPalette();
    } else {
      this.openCommandPalette();
    }
  }

  openCommandPalette() {
    this.commandPaletteOpen = true;
    this.commandPaletteSelectedIndex = 0;

    const overlay = document.getElementById('commandPaletteOverlay');
    const input = document.getElementById('commandPaletteInput');

    if (overlay) overlay.classList.add('active');
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 50);
    }

    // Show default commands
    this.filterCommandPalette('');
  }

  closeCommandPalette() {
    this.commandPaletteOpen = false;
    const overlay = document.getElementById('commandPaletteOverlay');
    if (overlay) overlay.classList.remove('active');
  }

  async filterCommandPalette(query) {
    const results = document.getElementById('commandPaletteResults');
    if (!results) return;

    const trimmedQuery = query.trim().toLowerCase();

    // Filter commands
    let filteredCommands = this.commands;
    if (trimmedQuery) {
      filteredCommands = this.commands.filter(cmd =>
        cmd.title.toLowerCase().includes(trimmedQuery) ||
        cmd.category.toLowerCase().includes(trimmedQuery)
      );
    }

    // Search for items if query looks like a search
    let searchResults = [];
    if (trimmedQuery.length > 1) {
      searchResults = await this.searchAllItems(trimmedQuery);
    }

    // Store results for navigation
    this.commandPaletteResults = [
      ...filteredCommands.map(cmd => ({ type: 'command', data: cmd })),
      ...searchResults.map(item => ({ type: 'item', data: item }))
    ];
    this.commandPaletteSelectedIndex = 0;

    // Render results
    let html = '';

    // Commands section
    if (filteredCommands.length > 0) {
      const grouped = this.groupCommandsByCategory(filteredCommands);

      for (const [category, cmds] of Object.entries(grouped)) {
        html += `<div class="command-palette-group">
          <div class="command-palette-group-label">${category}</div>`;

        cmds.forEach((cmd, idx) => {
          const globalIdx = this.commandPaletteResults.findIndex(r => r.type === 'command' && r.data.id === cmd.id);
          html += this.renderCommandItem(cmd, globalIdx);
        });

        html += `</div>`;
      }
    }

    // Search results section
    if (searchResults.length > 0) {
      html += `<div class="command-palette-group">
        <div class="command-palette-group-label">Search Results</div>`;

      searchResults.forEach((item, idx) => {
        const globalIdx = filteredCommands.length + idx;
        html += this.renderSearchResultItem(item, globalIdx);
      });

      html += `</div>`;
    }

    // Empty state
    if (filteredCommands.length === 0 && searchResults.length === 0) {
      html = `<div class="command-palette-empty">
        <svg class="command-palette-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <p>No commands or items found</p>
      </div>`;
    }

    // Quick create option if query has text
    if (trimmedQuery && !trimmedQuery.startsWith('/')) {
      html += `<div class="command-palette-create" onclick="app.quickCaptureFromPalette('${this.escapeHtml(query)}')">
        <svg class="command-palette-create-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        <span class="command-palette-create-text">Create: "${this.escapeHtml(query)}"</span>
        <span class="command-palette-create-hint">Enter</span>
      </div>`;
    }

    results.innerHTML = html;
  }

  groupCommandsByCategory(commands) {
    const grouped = {};
    commands.forEach(cmd => {
      if (!grouped[cmd.category]) {
        grouped[cmd.category] = [];
      }
      grouped[cmd.category].push(cmd);
    });
    return grouped;
  }

  renderCommandItem(cmd, index) {
    const isSelected = index === this.commandPaletteSelectedIndex;
    const icon = this.getCommandIcon(cmd.icon);
    const shortcutHtml = cmd.shortcut ? `<span class="command-kbd">${cmd.shortcut}</span>` : '';

    return `<div class="command-palette-item ${isSelected ? 'selected' : ''}"
                 data-index="${index}"
                 onclick="app.executeCommandByIndex(${index})"
                 onmouseenter="app.selectCommandIndex(${index})">
      <svg class="command-palette-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        ${icon}
      </svg>
      <div class="command-palette-item-content">
        <div class="command-palette-item-title">${cmd.title}</div>
      </div>
      ${shortcutHtml}
    </div>`;
  }

  renderSearchResultItem(item, index) {
    const isSelected = index === this.commandPaletteSelectedIndex;
    const typeIcon = this.getItemTypeIcon(item.type || item.itemType);
    const description = item.project ? `in ${item.project}` : (item.contexts?.join(', ') || '');

    return `<div class="command-palette-item ${isSelected ? 'selected' : ''}"
                 data-index="${index}"
                 onclick="app.openItemFromPalette('${item.id}', '${item.type || item.itemType}')"
                 onmouseenter="app.selectCommandIndex(${index})">
      <svg class="command-palette-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        ${typeIcon}
      </svg>
      <div class="command-palette-item-content">
        <div class="command-palette-item-title">${this.escapeHtml(item.content || item.title || item.name)}</div>
        ${description ? `<div class="command-palette-item-description">${this.escapeHtml(description)}</div>` : ''}
      </div>
    </div>`;
  }

  getCommandIcon(iconName) {
    const icons = {
      'inbox': '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>',
      'calendar': '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>',
      'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>',
      'clock': '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>',
      'folder': '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>',
      'folder-plus': '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line>',
      'cloud': '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>',
      'book': '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>',
      'clipboard': '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>',
      'settings': '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>',
      'plus': '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
      'trash': '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>',
      'list': '<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>',
      'alert-circle': '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>',
      'flag': '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line>'
    };
    return icons[iconName] || icons['check-circle'];
  }

  getItemTypeIcon(type) {
    const icons = {
      'action': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>',
      'project': '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>',
      'waiting': '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>',
      'reference': '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>',
      'someday': '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>',
      'inbox': '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>'
    };
    return icons[type] || icons['action'];
  }

  navigateCommandPalette(direction) {
    const maxIndex = this.commandPaletteResults.length - 1;
    if (maxIndex < 0) return;

    this.commandPaletteSelectedIndex = Math.max(0, Math.min(maxIndex, this.commandPaletteSelectedIndex + direction));
    this.updateCommandPaletteSelection();
  }

  selectCommandIndex(index) {
    this.commandPaletteSelectedIndex = index;
    this.updateCommandPaletteSelection();
  }

  updateCommandPaletteSelection() {
    const items = document.querySelectorAll('.command-palette-item');
    items.forEach((item, idx) => {
      item.classList.toggle('selected', idx === this.commandPaletteSelectedIndex);
    });

    // Scroll selected item into view
    const selected = items[this.commandPaletteSelectedIndex];
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  executeSelectedCommand() {
    const input = document.getElementById('commandPaletteInput');
    const query = input?.value?.trim() || '';

    // If no results but has query, quick capture
    if (this.commandPaletteResults.length === 0 && query) {
      this.quickCaptureFromPalette(query);
      return;
    }

    this.executeCommandByIndex(this.commandPaletteSelectedIndex);
  }

  executeCommandByIndex(index) {
    const result = this.commandPaletteResults[index];
    if (!result) return;

    this.closeCommandPalette();

    if (result.type === 'command') {
      result.data.action();
    } else if (result.type === 'item') {
      this.openItemFromPalette(result.data.id, result.data.type || result.data.itemType);
    }
  }

  async searchAllItems(query) {
    const results = [];
    const lowerQuery = query.toLowerCase();

    try {
      // Search actions
      const actions = await db.getNextActions();
      actions.forEach(action => {
        if (action.content?.toLowerCase().includes(lowerQuery)) {
          results.push({ ...action, type: 'action' });
        }
      });

      // Search projects
      const projects = await db.getProjects();
      projects.forEach(project => {
        if (project.name?.toLowerCase().includes(lowerQuery) ||
            project.outcome?.toLowerCase().includes(lowerQuery)) {
          results.push({ ...project, type: 'project', content: project.name });
        }
      });

      // Search waiting items
      const waiting = await db.getWaitingItems();
      waiting.forEach(item => {
        if (item.content?.toLowerCase().includes(lowerQuery)) {
          results.push({ ...item, type: 'waiting' });
        }
      });

      // Limit results
      return results.slice(0, 10);
    } catch (error) {
      console.error('Search error:', error);
      return [];
    }
  }

  async quickCaptureFromPalette(text) {
    this.closeCommandPalette();

    // Parse natural language for context and date
    const parsed = this.parseNaturalLanguage(text);

    try {
      await db.addInboxItem({
        content: parsed.content,
        createdAt: new Date().toISOString(),
        type: 'text'
      });

      this.showToast('Added to Inbox', 'success');
      await this.updateCounts();

      if (this.currentView === 'inbox') {
        await this.renderInboxView();
      }
    } catch (error) {
      console.error('Quick capture error:', error);
      this.showToast('Failed to capture', 'error');
    }
  }

  parseNaturalLanguage(text) {
    // Extract contexts like @phone, @email
    const contextRegex = /@(\w+)/g;
    const contexts = [];
    let match;
    while ((match = contextRegex.exec(text)) !== null) {
      contexts.push('@' + match[1]);
    }

    // Remove contexts from content
    let content = text.replace(/@\w+/g, '').trim();

    // Extract dates like "tomorrow", "next week"
    let dueDate = null;
    const today = new Date();

    if (/\btomorrow\b/i.test(content)) {
      dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + 1);
      content = content.replace(/\btomorrow\b/i, '').trim();
    } else if (/\bnext week\b/i.test(content)) {
      dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + 7);
      content = content.replace(/\bnext week\b/i, '').trim();
    } else if (/\btoday\b/i.test(content)) {
      dueDate = new Date(today);
      content = content.replace(/\btoday\b/i, '').trim();
    }

    return {
      content,
      contexts,
      dueDate: dueDate ? dueDate.toISOString().split('T')[0] : null
    };
  }

  openItemFromPalette(id, type) {
    this.closeCommandPalette();

    // Navigate to appropriate view
    switch (type) {
      case 'action':
        this.navigateTo('nextActions');
        break;
      case 'project':
        this.navigateTo('projects');
        // Could expand project details
        break;
      case 'waiting':
        this.navigateTo('waitingFor');
        break;
      case 'reference':
        this.navigateTo('reference');
        break;
      default:
        this.navigateTo('inbox');
    }
  }

  focusCapture() {
    this.closeCommandPalette();
    const captureInput = document.getElementById('quickCapture');
    if (captureInput) {
      captureInput.focus();
    }
  }

  showNewProjectModal() {
    this.navigateTo('projects');
    // Trigger new project creation
    setTimeout(() => {
      const addBtn = document.querySelector('[onclick*="showNewProjectForm"]');
      if (addBtn) addBtn.click();
    }, 100);
  }

  showNewFolderModal() {
    this.navigateTo('reference');
    // Trigger new folder creation
    setTimeout(() => {
      const addBtn = document.querySelector('[onclick*="createFolder"]');
      if (addBtn) addBtn.click();
    }, 100);
  }

  async clearCompletedActions() {
    try {
      const actions = await db.getNextActions();
      const completed = actions.filter(a => a.completed);

      for (const action of completed) {
        await db.archiveAction(action.id);
      }

      this.showToast(`Archived ${completed.length} completed actions`, 'success');
      await this.updateCounts();
      await this.renderCurrentView();
    } catch (error) {
      console.error('Error clearing completed:', error);
      this.showToast('Failed to clear completed actions', 'error');
    }
  }

  // =================================================================
  // TEAM DASHBOARD & WORKSPACE
  // =================================================================

  async renderTeamDashboardView() {
    // Load team members if not already loaded
    if (!this.teamMembers || this.teamMembers.length === 0) {
      try {
        this.teamMembers = await firestoreDb.getTeamMembers();
      } catch (e) {
        console.log('Could not load team members:', e);
        this.teamMembers = [];
      }
    }

    const teamName = document.getElementById('dashboardTeamName');
    if (this.team) {
      teamName.textContent = this.team.name;
    } else {
      teamName.textContent = 'My Team';
    }

    // Render dashboard stats
    await this.renderDashboardStats();
    await this.renderTeamWorkload();
    await this.renderDashboardSharedProjects();
    await this.renderDashboardActivityFeed();
    await this.renderDashboardAttention();
  }

  async renderDashboardStats() {
    // Get stats from Firestore
    const teamId = this.team?.id;
    const delegations = await firestoreDb?.getDelegations?.(teamId) || [];
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const active = delegations.filter(d => d.status !== 'completed');
    const completedThisWeek = delegations.filter(d =>
      d.status === 'completed' && d.completedDate && new Date(d.completedDate) >= weekAgo
    );
    const delegatedThisWeek = delegations.filter(d =>
      d.delegatedDate && new Date(d.delegatedDate) >= weekAgo
    );
    const overdue = active.filter(d =>
      d.dueDate && new Date(d.dueDate) < now
    );

    document.getElementById('dashboardActiveTasks').textContent = active.length;
    document.getElementById('dashboardDelegated').textContent = delegatedThisWeek.length;
    document.getElementById('dashboardCompleted').textContent = completedThisWeek.length;
    document.getElementById('dashboardOverdue').textContent = overdue.length;

    // Update change indicators
    if (completedThisWeek.length > 0) {
      document.getElementById('dashboardCompletedChange').textContent = `+${completedThisWeek.length}`;
    }
  }

  async renderTeamWorkload() {
    const container = document.getElementById('teamWorkloadList');
    if (!container) return;

    const teamId = this.team?.id;
    const members = this.teamMembers || [];
    const delegations = await firestoreDb?.getDelegations?.(teamId) || [];
    const currentUserId = firestoreDb?.getCurrentUserId?.();

    // Show empty state if no members
    if (members.length === 0) {
      container.innerHTML = `
        <div class="workload-empty">
          <p>No team members yet</p>
          <button class="btn btn-sm btn-primary" onclick="app.showAddTeamMemberManualModal()">Add Member</button>
        </div>
      `;
      return;
    }

    // Calculate workload per member
    const workloadData = members.map(member => {
      const memberDelegations = delegations.filter(d =>
        d.toUserId === member.id && d.status !== 'completed'
      );
      const overdue = memberDelegations.filter(d =>
        d.dueDate && new Date(d.dueDate) < new Date()
      ).length;
      const dueToday = memberDelegations.filter(d => {
        if (!d.dueDate) return false;
        const due = new Date(d.dueDate);
        const today = new Date();
        return due.toDateString() === today.toDateString();
      }).length;

      return {
        ...member,
        taskCount: memberDelegations.length,
        overdue,
        dueToday,
        upcoming: memberDelegations.length - overdue - dueToday,
        isCurrentUser: member.id === currentUserId
      };
    });

    // Sort by name if no tasks, otherwise by task count descending
    workloadData.sort((a, b) => {
      if (a.taskCount === 0 && b.taskCount === 0) {
        return a.name.localeCompare(b.name);
      }
      return b.taskCount - a.taskCount;
    });

    // Calculate max for bar width (minimum 1 to avoid division issues)
    const maxTasks = Math.max(...workloadData.map(m => m.taskCount), 1);

    let html = '';
    workloadData.forEach(member => {
      const barWidth = member.taskCount > 0 ? (member.taskCount / maxTasks) * 100 : 5; // Minimum bar width for visibility
      const barClass = member.overdue > 0 ? 'overloaded' : member.taskCount > 15 ? 'high' : '';
      const avatarColor = member.color || '#6366f1';

      html += `
        <div class="workload-item" onclick="app.showTeamMemberDetail('${member.id}')">
          <div class="workload-avatar" style="background: ${avatarColor}">${member.name?.charAt(0).toUpperCase() || 'U'}</div>
          <div class="workload-info">
            <div class="workload-header">
              <span class="workload-name">
                ${member.name}${member.isCurrentUser ? '<span class="you-badge">(You)</span>' : ''}
              </span>
              <span class="workload-count">${member.taskCount} task${member.taskCount !== 1 ? 's' : ''}</span>
            </div>
            <div class="workload-bar-container">
              <div class="workload-bar ${barClass}" style="width: ${barWidth}%"></div>
            </div>
            <div class="workload-details">
              ${member.overdue > 0 ? `<span class="overdue">${member.overdue} overdue</span> • ` : ''}
              ${member.dueToday > 0 ? `<span class="due-today">${member.dueToday} due today</span> • ` : ''}
              ${member.taskCount > 0 ? `${member.upcoming} upcoming` : member.title || 'No tasks assigned'}
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  async renderDashboardSharedProjects() {
    const container = document.getElementById('dashboardSharedProjects');
    if (!container) return;

    const teamId = this.team?.id;
    const sharedProjects = await firestoreDb?.getSharedProjects?.(teamId) || [];
    const activeProjects = sharedProjects.filter(p => p.status !== 'completed').slice(0, 4);

    let html = '';
    for (const project of activeProjects) {
      const progress = await this.calculateProjectProgress(project.id);
      const members = project.memberIds?.map(id => {
        const member = this.teamMembers?.find(m => m.id === id);
        return member?.name?.split(' ')[0] || 'Unknown';
      }).join(', ') || '';

      html += `
        <div class="shared-project-card" onclick="app.openSharedProject('${project.id}')">
          <div class="shared-project-name">${project.name}</div>
          <div class="project-progress-bar">
            <div class="project-progress-fill" style="width: ${progress}%"></div>
          </div>
          <div class="project-progress-text">${progress}% complete</div>
          <div class="project-team">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
            </svg>
            ${members}
          </div>
          ${project.deadline ? `<div class="project-due">Due: ${new Date(project.deadline).toLocaleDateString()}</div>` : ''}
        </div>
      `;
    }

    container.innerHTML = html || '<p class="empty-text">No shared projects yet</p>';
  }

  async renderDashboardActivityFeed() {
    const container = document.getElementById('dashboardActivityFeed');
    if (!container) return;

    const teamId = this.team?.id;
    const activities = await firestoreDb?.getTeamActivity?.(teamId, 10) || [];

    let html = '';
    activities.forEach(activity => {
      const iconClass = activity.action;
      const icon = this.getActivityIcon(activity.action);
      const timeAgo = this.formatTimeAgo(activity.timestamp);

      html += `
        <div class="activity-item">
          <div class="activity-icon ${iconClass}">${icon}</div>
          <div class="activity-content">
            <div class="activity-text">${this.formatActivityText(activity)}</div>
            <div class="activity-meta">${activity.targetType ? activity.targetType + ' • ' : ''}${timeAgo}</div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html || '<p class="empty-text">No recent activity</p>';
  }

  async renderDashboardAttention() {
    const container = document.getElementById('dashboardAttentionItems');
    if (!container) return;

    const teamId = this.team?.id;
    const attentionItems = [];

    // Get overdue delegations
    const delegations = await firestoreDb?.getDelegations?.(teamId) || [];
    const overdue = delegations.filter(d =>
      d.status !== 'completed' && d.dueDate && new Date(d.dueDate) < new Date()
    );

    if (overdue.length > 0) {
      attentionItems.push({
        type: 'red',
        title: `${overdue.length} Overdue delegation${overdue.length !== 1 ? 's' : ''}`,
        details: overdue.slice(0, 3).map(d => {
          const member = this.teamMembers?.find(m => m.id === d.toUserId);
          const daysOverdue = Math.ceil((new Date() - new Date(d.dueDate)) / (1000 * 60 * 60 * 24));
          return `"${d.description}" to ${member?.name || 'Unknown'} (${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue)`;
        })
      });
    }

    // Get stalled projects
    const sharedProjects = await firestoreDb?.getSharedProjects?.(teamId) || [];
    const stalledProjects = [];
    for (const project of sharedProjects.filter(p => p.status !== 'completed')) {
      const actions = await db.getProjectActions(project.id);
      const hasActiveAction = actions.some(a => !a.completed);
      if (!hasActiveAction) {
        stalledProjects.push(project);
      }
    }

    if (stalledProjects.length > 0) {
      attentionItems.push({
        type: 'yellow',
        title: `${stalledProjects.length} Stalled shared project${stalledProjects.length !== 1 ? 's' : ''}`,
        details: stalledProjects.slice(0, 3).map(p => `"${p.name}" - no next action`)
      });
    }

    let html = '';
    attentionItems.forEach(item => {
      html += `
        <div class="attention-item">
          <div class="attention-badge ${item.type}"></div>
          <div class="attention-content">
            <div class="attention-title">${item.title}</div>
            ${item.details.map(d => `<div class="attention-detail">${d}</div>`).join('')}
          </div>
        </div>
      `;
    });

    container.innerHTML = html || '<p class="empty-text">Nothing needs attention</p>';
  }

  async calculateProjectProgress(projectId) {
    try {
      const actions = await db.getProjectActions(projectId);
      if (!actions || actions.length === 0) return 0;
      const completed = actions.filter(a => a.completed).length;
      return Math.round((completed / actions.length) * 100);
    } catch (e) {
      return 0;
    }
  }

  getActivityIcon(action) {
    const icons = {
      completed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>',
      delegated: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><polyline points="17 11 19 13 23 9"></polyline></svg>',
      created: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
      commented: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
      joined: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>'
    };
    return icons[action] || icons.created;
  }

  formatActivityText(activity) {
    const member = this.teamMembers?.find(m => m.id === activity.userId);
    const name = member?.name || 'Someone';

    switch (activity.action) {
      case 'completed':
        return `<strong>${name}</strong> completed "${activity.description}"`;
      case 'delegated':
        const toMember = this.teamMembers?.find(m => m.id === activity.toUserId);
        return `<strong>${name}</strong> delegated to ${toMember?.name || 'someone'}`;
      case 'created':
        return `<strong>${name}</strong> created ${activity.targetType} "${activity.description}"`;
      case 'commented':
        return `<strong>${name}</strong> commented on "${activity.description}"`;
      case 'joined':
        return `<strong>${name}</strong> joined the team`;
      default:
        return `<strong>${name}</strong> ${activity.action}`;
    }
  }

  formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours} hr ago`;
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  }

  async renderTeamMembersView() {
    const container = document.getElementById('teamMembersContent');
    if (!container) return;

    // Load team members from Firestore if not already loaded
    if (!this.teamMembers || this.teamMembers.length === 0) {
      try {
        this.teamMembers = await firestoreDb.getTeamMembers();
      } catch (e) {
        console.log('Could not load team members:', e);
        this.teamMembers = [];
      }
    }

    const members = this.teamMembers || [];
    const currentUserId = firestoreDb?.getCurrentUserId?.();

    if (members.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          <h3>No Team Members Yet</h3>
          <p>Add team members to delegate tasks, track workloads, and collaborate on projects.</p>
          <button class="btn btn-primary" onclick="app.showAddTeamMemberManualModal()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Add First Member
          </button>
        </div>
      `;
      return;
    }

    let html = '<div class="team-members-grid">';
    members.forEach(member => {
      const initial = member.name?.charAt(0).toUpperCase() || 'U';
      const isYou = member.id === currentUserId;
      const avatarColor = member.color || '#6366f1';

      html += `
        <div class="team-member-card" onclick="app.showTeamMemberDetail('${member.id}')">
          <div class="member-avatar" style="background: ${avatarColor}">${initial}</div>
          <div class="member-info">
            <div class="member-name">${member.name}${isYou ? ' <span class="you-tag">(You)</span>' : ''}</div>
            <div class="member-role">${member.title || member.role || 'Member'}</div>
            <div class="member-email">${member.email || ''}</div>
          </div>
          <div class="member-stats-mini">
            <span>${member.taskCount || 0} tasks</span>
          </div>
        </div>
      `;
    });
    html += '</div>';

    container.innerHTML = html;
  }

  async renderSharedProjectsView() {
    const container = document.getElementById('sharedProjectsList');
    if (!container) return;

    const teamId = this.team?.id;
    const sharedProjects = await firestoreDb?.getSharedProjects?.(teamId) || [];

    // Apply filters
    const areaFilter = document.getElementById('sharedProjectsAreaFilter')?.value || 'all';
    const memberFilter = document.getElementById('sharedProjectsMemberFilter')?.value || 'all';
    const statusFilter = document.getElementById('sharedProjectsStatusFilter')?.value || 'active';

    let filteredProjects = sharedProjects;

    if (statusFilter === 'active') {
      filteredProjects = filteredProjects.filter(p => p.status !== 'completed');
    } else if (statusFilter === 'completed') {
      filteredProjects = filteredProjects.filter(p => p.status === 'completed');
    }

    if (areaFilter !== 'all') {
      filteredProjects = filteredProjects.filter(p => p.areaId === areaFilter);
    }

    if (memberFilter !== 'all') {
      filteredProjects = filteredProjects.filter(p => p.memberIds?.includes(memberFilter));
    }

    let html = '';
    for (const project of filteredProjects) {
      const progress = await this.calculateProjectProgress(project.id);
      const members = project.memberIds?.map(id => {
        const member = this.teamMembers?.find(m => m.id === id);
        return member?.name || 'Unknown';
      }).join(', ') || '';

      const actions = await db.getProjectActions(project.id);
      const nextAction = actions.find(a => !a.completed);

      html += `
        <div class="shared-project-card full-width" onclick="app.openSharedProject('${project.id}')">
          <div class="shared-project-header">
            <div class="shared-project-name">${project.name}</div>
            <div class="project-progress-text">${progress}%</div>
          </div>
          <div class="project-progress-bar">
            <div class="project-progress-fill" style="width: ${progress}%"></div>
          </div>
          <div class="project-details">
            <div class="project-owner">Owner: ${this.teamMembers?.find(m => m.id === project.ownerId)?.name || 'Unknown'}</div>
            <div class="project-team">Team: ${members}</div>
            ${project.deadline ? `<div class="project-due">Deadline: ${new Date(project.deadline).toLocaleDateString()}</div>` : ''}
          </div>
          ${nextAction ? `
            <div class="project-next-action">
              <strong>Next:</strong> ${nextAction.content}
            </div>
          ` : ''}
          <div class="project-actions">
            <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); app.openSharedProject('${project.id}')">View Project</button>
            <button class="btn btn-sm btn-text" onclick="event.stopPropagation(); app.addActionToSharedProject('${project.id}')">Add Action</button>
          </div>
        </div>
      `;
    }

    container.innerHTML = html || '<p class="empty-text">No shared projects found</p>';
  }

  async renderTeamActivityView() {
    const container = document.getElementById('fullActivityFeed');
    if (!container) return;

    const teamId = this.team?.id;
    const activities = await firestoreDb?.getTeamActivity?.(teamId, 50) || [];

    // Group by date
    const grouped = {};
    activities.forEach(activity => {
      const date = activity.timestamp?.toDate?.() || new Date(activity.timestamp);
      const dateKey = date.toDateString();
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(activity);
    });

    let html = '';
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    Object.keys(grouped).forEach(dateKey => {
      let dateLabel = dateKey;
      if (dateKey === today) dateLabel = 'TODAY';
      else if (dateKey === yesterday) dateLabel = 'YESTERDAY';

      html += `<div class="activity-date-group">`;
      html += `<div class="activity-date-label">${dateLabel}</div>`;
      html += `<div class="activity-feed">`;

      grouped[dateKey].forEach(activity => {
        const iconClass = activity.action;
        const icon = this.getActivityIcon(activity.action);
        const timeAgo = this.formatTimeAgo(activity.timestamp);

        html += `
          <div class="activity-item">
            <div class="activity-icon ${iconClass}">${icon}</div>
            <div class="activity-content">
              <div class="activity-text">${this.formatActivityText(activity)}</div>
              <div class="activity-meta">${activity.targetType || ''}</div>
            </div>
            <div class="activity-time">${timeAgo}</div>
          </div>
        `;
      });

      html += `</div></div>`;
    });

    container.innerHTML = html || '<p class="empty-text">No team activity yet</p>';
  }

  async renderTeamSettingsView() {
    // Load team members if not already loaded
    if (!this.teamMembers || this.teamMembers.length === 0) {
      try {
        this.teamMembers = await firestoreDb.getTeamMembers();
      } catch (e) {
        console.log('Could not load team members:', e);
        this.teamMembers = [];
      }
    }

    // Set team info
    const teamNameInput = document.getElementById('teamSettingsName');
    const createdEl = document.getElementById('teamSettingsCreated');
    const ownerEl = document.getElementById('teamSettingsOwner');

    if (this.team) {
      teamNameInput.value = this.team.name || '';
      const createdDate = this.team.createdAt || this.team.created;
      createdEl.textContent = createdDate ? new Date(createdDate).toLocaleDateString() : '-';
      ownerEl.textContent = this.teamMembers?.find(m => m.id === this.team.ownerId)?.name || 'You';
    } else {
      // No formal team, but still show team members
      teamNameInput.value = 'My Team';
      createdEl.textContent = '-';
      ownerEl.textContent = 'You';
    }

    // Render members list
    const membersContainer = document.getElementById('teamSettingsMembersList');
    if (membersContainer) {
      if (!this.teamMembers || this.teamMembers.length === 0) {
        membersContainer.innerHTML = `
          <div class="empty-members-state">
            <p>No team members yet. Add members to delegate tasks and collaborate.</p>
            <button class="btn btn-primary" onclick="app.showAddTeamMemberManualModal()">Add First Member</button>
          </div>
        `;
      } else {
        let html = '';
        const currentUserId = firestoreDb?.getCurrentUserId?.();
        // Check if current user can manage members (owner or admin)
        // Also check if current user is the team owner directly from team data
        const isTeamOwner = this.team && this.team.ownerId === currentUserId;
        const canManageMembers = isTeamOwner || this.currentTeamRole === 'owner' || this.currentTeamRole === 'admin';

        this.teamMembers.forEach(member => {
          const isOwner = this.team && member.id === this.team.ownerId;
          const isCurrentUser = member.id === currentUserId;
          const avatarColor = member.color || '#6366f1';

          html += `
            <div class="team-member-settings-card">
              <div class="member-avatar" style="background: ${avatarColor}">${member.name?.charAt(0).toUpperCase() || 'U'}</div>
              <div class="team-member-settings-info">
                <div class="team-member-settings-name">${member.name}${isCurrentUser ? ' (you)' : ''}</div>
                <div class="team-member-settings-email">${member.email || ''}</div>
                <div class="team-member-settings-meta">${member.title || member.role || 'Member'}</div>
              </div>
              <div class="team-member-settings-actions">
                ${isOwner ? '<span class="owner-badge">Owner</span>' :
                  canManageMembers ? `
                    <select class="role-select" onchange="app.updateMemberRole('${member.id}', this.value)">
                      <option value="member" ${member.role === 'member' || !member.role ? 'selected' : ''}>Member</option>
                      <option value="admin" ${member.role === 'admin' ? 'selected' : ''}>Admin</option>
                    </select>
                    ${!isCurrentUser ? `
                      <button class="btn btn-icon btn-danger-icon" onclick="app.removeMember('${member.id}')" title="Remove member">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    ` : ''}
                  ` : `<span class="role-badge">${member.role || 'Member'}</span>`
                }
              </div>
            </div>
          `;
        });
        membersContainer.innerHTML = html;
      }
    }

    // Load preferences
    if (this.team && this.team.settings) {
      document.getElementById('teamPrefEmailNotifications').checked = this.team.settings.emailNotifications !== false;
      document.getElementById('teamPrefShowActivity').checked = this.team.settings.showActivityFeed !== false;
      document.getElementById('teamPrefMembersInvite').checked = this.team.settings.membersCanInvite === true;
      document.getElementById('teamPrefMembersCreateProjects').checked = this.team.settings.membersCanCreateProjects !== false;
    }
  }

  async loadUserTeam() {
    try {
      const teams = await firestoreDb.getMyTeams();
      if (teams && teams.length > 0) {
        // Use the first team (user's primary team)
        // getMyTeams() already returns full team data including role
        this.team = teams[0];
        this.currentTeamRole = teams[0].role;
        console.log('Team loaded:', this.team.name, 'Role:', this.currentTeamRole);
      } else {
        this.team = null;
        this.currentTeamRole = null;
      }
      // Also load team members
      this.teamMembers = await firestoreDb.getTeamMembers();
    } catch (error) {
      console.log('Could not load team:', error);
      this.team = null;
      this.currentTeamRole = null;
      this.teamMembers = [];
    }
  }

  async saveTeamName() {
    const teamName = document.getElementById('teamSettingsName')?.value?.trim();

    if (!teamName) {
      this.showToast('Please enter a team name', 'error');
      return;
    }

    try {
      if (this.team && this.team.id) {
        // Update existing team
        await firestoreDb.db.collection('teams').doc(this.team.id).update({
          name: teamName
        });
        this.team.name = teamName;
        this.showToast('Team name updated', 'success');
      } else {
        // Create new team
        this.team = await firestoreDb.createTeam(teamName);
        this.showToast('Team created!', 'success');

        // Reload team members (owner is added automatically)
        this.teamMembers = await firestoreDb.getTeamMembers();

        // Update the created/owner display
        document.getElementById('teamSettingsCreated').textContent = new Date().toLocaleDateString();
        document.getElementById('teamSettingsOwner').textContent = 'You';

        // Re-render the team settings view to show updated members
        await this.renderTeamSettingsView();
      }

      // Update sidebar team name
      this.updateTeamSectionVisibility();
    } catch (error) {
      console.error('Error saving team:', error);
      this.showToast('Failed to save team', 'error');
    }
  }

  async renderTeamMemberDetailView() {
    if (!this.selectedTeamMember) return;

    const member = this.selectedTeamMember;
    const teamId = this.team?.id;

    // Update header
    document.getElementById('memberDetailAvatar').textContent = member.name?.charAt(0).toUpperCase() || 'U';
    document.getElementById('memberDetailName').textContent = member.name || 'Unknown';
    document.getElementById('memberDetailTitle').textContent = member.title || member.role || 'Member';
    document.getElementById('memberDetailEmail').textContent = member.email || '';
    document.getElementById('memberDetailPhone').textContent = member.phone || '';
    document.getElementById('memberDetailJoined').textContent = member.joinedDate ?
      `Member since ${new Date(member.joinedDate).toLocaleDateString()}` : '';
    document.getElementById('memberDetailRole').textContent = member.role || 'Member';

    // Get member stats
    const delegations = await firestoreDb?.getDelegations?.(teamId) || [];
    const memberDelegations = delegations.filter(d => d.toUserId === member.id);
    const active = memberDelegations.filter(d => d.status !== 'completed');
    const completed = memberDelegations.filter(d => d.status === 'completed');

    document.getElementById('memberStatAssigned').textContent = active.length;
    document.getElementById('memberStatCompleted').textContent = completed.length;

    // Calculate average completion time
    if (completed.length > 0) {
      const totalTime = completed.reduce((sum, d) => {
        if (d.completedDate && d.delegatedDate) {
          return sum + (new Date(d.completedDate) - new Date(d.delegatedDate));
        }
        return sum;
      }, 0);
      const avgDays = Math.round(totalTime / completed.length / 86400000 * 10) / 10;
      document.getElementById('memberStatAvgTime').textContent = `${avgDays}d`;
    }

    // On-time percentage
    const onTime = completed.filter(d =>
      !d.dueDate || new Date(d.completedDate) <= new Date(d.dueDate)
    ).length;
    const onTimePercent = completed.length > 0 ? Math.round(onTime / completed.length * 100) : 100;
    document.getElementById('memberStatOnTime').textContent = `${onTimePercent}%`;

    // Render assignments
    const assignmentsContainer = document.getElementById('memberAssignmentsList');
    let assignmentsHtml = '';
    active.forEach(d => {
      assignmentsHtml += `
        <div class="assigned-item">
          <div class="assigned-item-title">${d.description}</div>
          <div class="assigned-item-meta">Assigned ${this.formatTimeAgo(d.delegatedDate)}</div>
          ${d.dueDate ? `<div class="assigned-item-meta">Due: ${new Date(d.dueDate).toLocaleDateString()}</div>` : ''}
        </div>
      `;
    });
    assignmentsContainer.innerHTML = assignmentsHtml || '<p class="empty-text">No current assignments</p>';
  }

  showTeamMemberDetail(memberId) {
    this.selectedTeamMember = this.teamMembers?.find(m => m.id === memberId);
    this.navigateTo('teamMemberDetail');
  }

  // Show/hide team section based on team membership
  updateTeamSectionVisibility() {
    // Show team section if user has team members (regardless of formal team)
    const hasTeamMembers = this.teamMembers && this.teamMembers.length > 0;

    const elements = [
      'teamSectionLabel',
      'teamDashboardNav',
      'assignedToMeNav',
      'teamMembersNav',
      'sharedProjectsNav',
      'teamActivityNav'
      // Note: teamSettingsNav is now at bottom of sidebar, always visible
    ];

    elements.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.style.display = hasTeamMembers ? '' : 'none';
      }
    });

    // Update team name label
    const teamNameLabel = document.getElementById('teamNameLabel');
    if (teamNameLabel) {
      if (this.team && this.team.name) {
        teamNameLabel.textContent = this.team.name;
      } else {
        teamNameLabel.textContent = 'My Team';
      }
    }
  }

  async showQuickDelegateModal() {
    console.log('showQuickDelegateModal called', { team: this.team, teamMembers: this.teamMembers });
    try {
      if (!this.team || !this.teamMembers || this.teamMembers.length === 0) {
        this.showToast('Please join or create a team first', 'info');
        return;
      }

      // Get undelegated actions
      const actions = await db.getNextActions() || [];
    const undelegatedActions = actions.filter(a => !a.completed && !a.delegatedTo);

    const currentUserId = firestoreDb?.getCurrentUserId?.();
    const otherMembers = this.teamMembers.filter(m => m.id !== currentUserId);

    const html = `
      <div class="modal-header">
        <h2>Quick Delegate</h2>
        <button class="modal-close" onclick="app.closeModal()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Select Action to Delegate</label>
          <select id="delegateActionSelect" class="form-select" onchange="app.updateDelegatePreview()">
            <option value="">Choose an action...</option>
            ${undelegatedActions.map(a => `
              <option value="${a.id}">${a.action || a.content}</option>
            `).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Delegate To</label>
          <select id="delegateMemberSelect" class="form-select">
            <option value="">Choose team member...</option>
            ${otherMembers.map(m => `
              <option value="${m.id}">${m.name}${m.title ? ' - ' + m.title : ''}</option>
            `).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Due Date (optional)</label>
          <input type="date" id="delegateDueDate" class="form-input">
        </div>
        <div class="form-group">
          <label>Notes (optional)</label>
          <textarea id="delegateNotes" class="form-textarea" rows="2" placeholder="Add context or instructions..."></textarea>
        </div>
        <div id="delegatePreview" class="delegate-preview" style="display: none;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.submitQuickDelegate()">Delegate</button>
      </div>
    `;

      document.getElementById('modalContent').innerHTML = html;
      document.getElementById('modalOverlay').classList.add('active');
    } catch (error) {
      console.error('Error showing quick delegate modal:', error);
      this.showToast('Error opening delegate modal: ' + error.message, 'error');
    }
  }

  updateDelegatePreview() {
    const actionId = document.getElementById('delegateActionSelect')?.value;
    const previewEl = document.getElementById('delegatePreview');
    if (!previewEl) return;

    if (!actionId) {
      previewEl.style.display = 'none';
      return;
    }

    // Show preview of selected action
    db.getAction(actionId).then(action => {
      if (action) {
        previewEl.style.display = 'block';
        previewEl.innerHTML = `
          <div class="preview-label">Selected Action:</div>
          <div class="preview-content">${action.action || action.content}</div>
          ${action.contexts?.length ? `<div class="preview-contexts">Contexts: ${action.contexts.join(', ')}</div>` : ''}
        `;
      }
    });
  }

  async submitQuickDelegate() {
    const actionId = document.getElementById('delegateActionSelect')?.value;
    const memberId = document.getElementById('delegateMemberSelect')?.value;
    const dueDate = document.getElementById('delegateDueDate')?.value;
    const notes = document.getElementById('delegateNotes')?.value;

    if (!actionId || !memberId) {
      this.showToast('Please select an action and team member', 'error');
      return;
    }

    try {
      const teamId = this.team?.id;
      const action = await db.getAction(actionId);
      const member = this.teamMembers.find(m => m.id === memberId);

      // Create delegation in Firestore
      await firestoreDb.delegateToTeamMember(actionId, memberId, teamId);

      // Update action with delegation info
      await db.updateAction(actionId, {
        delegatedTo: memberId,
        delegatedToName: member?.name,
        delegatedDate: new Date().toISOString(),
        delegationNotes: notes,
        dueDate: dueDate || action.dueDate
      });

      this.closeModal();
      this.showToast(`Delegated to ${member?.name}`, 'success');

      // Refresh dashboard
      if (this.currentView === 'teamDashboard') {
        await this.renderTeamDashboardView();
      }
    } catch (error) {
      console.error('Error delegating:', error);
      this.showToast('Failed to delegate action', 'error');
    }
  }

  openSharedProject(projectId) {
    // Navigate to shared project detail view
    this.selectedSharedProjectId = projectId;
    this.navigateTo('sharedProjectDetail');
  }

  addActionToSharedProject(projectId) {
    this.selectedSharedProjectId = projectId;
    this.showAddActionToSharedProjectModal();
  }

  async renderSharedProjectDetailView() {
    const projectId = this.selectedSharedProjectId;
    if (!projectId) {
      this.navigateTo('sharedProjects');
      return;
    }

    try {
      const teamId = this.team?.id;
      const projects = await firestoreDb?.getSharedProjects?.(teamId) || [];
      const project = projects.find(p => p.id === projectId);

      if (!project) {
        this.showToast('Project not found', 'error');
        this.navigateTo('sharedProjects');
        return;
      }

      // Update header info
      document.getElementById('sharedProjectDetailName').textContent = project.name;
      document.getElementById('sharedProjectDetailDesc').textContent = project.description || '';

      const owner = this.teamMembers?.find(m => m.id === project.ownerId);
      document.getElementById('sharedProjectOwner').textContent = owner?.name || 'Unknown';

      const teamNames = project.memberIds?.map(id => {
        const member = this.teamMembers?.find(m => m.id === id);
        return member?.name || 'Unknown';
      }).join(', ') || '-';
      document.getElementById('sharedProjectTeam').textContent = teamNames;

      document.getElementById('sharedProjectDeadline').textContent =
        project.deadline ? new Date(project.deadline).toLocaleDateString() : 'No deadline';

      // Calculate progress
      const progress = await this.calculateProjectProgress(projectId);
      document.getElementById('sharedProjectProgress').textContent = progress + '%';
      document.getElementById('sharedProjectProgressBar').style.width = progress + '%';

      // Render actions
      await this.renderSharedProjectActions(projectId);

    } catch (error) {
      console.error('Error rendering shared project detail:', error);
      this.showToast('Error loading project', 'error');
    }
  }

  async renderSharedProjectActions(projectId) {
    const container = document.getElementById('sharedProjectActionsList');
    if (!container) return;

    const actions = await db.getProjectActions(projectId) || [];

    if (actions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No actions yet</p>
          <button class="btn btn-primary" onclick="app.showAddActionToSharedProjectModal()">Add First Action</button>
        </div>
      `;
      return;
    }

    let html = '';
    for (const action of actions) {
      const assignee = action.assignedTo ? this.teamMembers?.find(m => m.id === action.assignedTo) : null;

      html += `
        <div class="action-item ${action.completed ? 'completed' : ''}" data-id="${action.id}">
          <div class="action-checkbox" onclick="app.toggleSharedProjectAction('${action.id}')">
            ${action.completed ? `
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            ` : ''}
          </div>
          <div class="action-content">
            <div class="action-text">${action.content}</div>
            <div class="action-meta">
              ${assignee ? `<span class="assignee">Assigned to: ${assignee.name}</span>` : ''}
              ${action.dueDate ? `<span class="due-date">Due: ${new Date(action.dueDate).toLocaleDateString()}</span>` : ''}
            </div>
          </div>
          <div class="action-actions">
            <button class="btn btn-icon btn-sm" onclick="app.editSharedProjectAction('${action.id}')" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="btn btn-icon btn-sm" onclick="app.deleteSharedProjectAction('${action.id}')" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  }

  async toggleSharedProjectAction(actionId) {
    try {
      const action = await db.getAction(actionId);
      if (action) {
        await db.updateAction(actionId, { completed: !action.completed });
        await this.renderSharedProjectDetailView();
      }
    } catch (error) {
      console.error('Error toggling action:', error);
      this.showToast('Error updating action', 'error');
    }
  }

  async showAddActionToSharedProjectModal() {
    const projectId = this.selectedSharedProjectId;
    if (!projectId) return;

    try {
      const teamMembers = this.teamMembers || [];
      const currentUserId = firestoreDb?.getCurrentUserId?.();

      const html = `
        <div class="modal-header">
          <h2>Add Action to Project</h2>
          <button class="modal-close" onclick="app.closeModal()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Action</label>
            <input type="text" id="sharedActionContent" class="form-input" placeholder="What needs to be done?">
          </div>
          <div class="form-group">
            <label>Assign To (optional)</label>
            <select id="sharedActionAssignee" class="form-select">
              <option value="">Unassigned</option>
              ${teamMembers.map(m => `
                <option value="${m.id}" ${m.id === currentUserId ? 'selected' : ''}>${m.name}</option>
              `).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Due Date (optional)</label>
            <input type="date" id="sharedActionDueDate" class="form-input">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="app.createSharedProjectAction()">Add Action</button>
        </div>
      `;

      document.getElementById('modalContent').innerHTML = html;
      document.getElementById('modalOverlay').classList.add('active');
      document.getElementById('sharedActionContent').focus();
    } catch (error) {
      console.error('Error showing add action modal:', error);
      this.showToast('Error opening modal', 'error');
    }
  }

  async createSharedProjectAction() {
    const projectId = this.selectedSharedProjectId;
    const content = document.getElementById('sharedActionContent')?.value?.trim();
    const assignedTo = document.getElementById('sharedActionAssignee')?.value || null;
    const dueDate = document.getElementById('sharedActionDueDate')?.value || null;

    if (!content) {
      this.showToast('Please enter an action', 'error');
      return;
    }

    try {
      await db.addAction({
        content,
        projectId,
        assignedTo,
        dueDate,
        context: '@team',
        completed: false,
        isShared: true
      });

      this.closeModal();
      this.showToast('Action added', 'success');
      await this.renderSharedProjectDetailView();
    } catch (error) {
      console.error('Error creating action:', error);
      this.showToast('Error adding action', 'error');
    }
  }

  async editSharedProject() {
    const projectId = this.selectedSharedProjectId;
    if (!projectId) return;

    try {
      const teamId = this.team?.id;
      const projects = await firestoreDb?.getSharedProjects?.(teamId) || [];
      const project = projects.find(p => p.id === projectId);

      if (!project) {
        this.showToast('Project not found', 'error');
        return;
      }

      const areas = await db.getAreas() || [];
      const teamMembers = this.teamMembers || [];

      const html = `
        <div class="modal-header">
          <h2>Edit Shared Project</h2>
          <button class="modal-close" onclick="app.closeModal()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Project Name</label>
            <input type="text" id="editSharedProjectName" class="form-input" value="${project.name || ''}">
          </div>
          <div class="form-group">
            <label>Description (optional)</label>
            <textarea id="editSharedProjectDesc" class="form-textarea" rows="2">${project.description || ''}</textarea>
          </div>
          <div class="form-group">
            <label>Deadline (optional)</label>
            <input type="date" id="editSharedProjectDeadline" class="form-input" value="${project.deadline || ''}">
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="editSharedProjectStatus" class="form-select">
              <option value="active" ${project.status !== 'completed' ? 'selected' : ''}>Active</option>
              <option value="completed" ${project.status === 'completed' ? 'selected' : ''}>Completed</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-danger" onclick="app.deleteSharedProject()">Delete Project</button>
          <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="app.updateSharedProject()">Save Changes</button>
        </div>
      `;

      document.getElementById('modalContent').innerHTML = html;
      document.getElementById('modalOverlay').classList.add('active');
    } catch (error) {
      console.error('Error showing edit modal:', error);
      this.showToast('Error opening edit modal', 'error');
    }
  }

  async updateSharedProject() {
    const projectId = this.selectedSharedProjectId;
    const name = document.getElementById('editSharedProjectName')?.value?.trim();
    const description = document.getElementById('editSharedProjectDesc')?.value?.trim();
    const deadline = document.getElementById('editSharedProjectDeadline')?.value;
    const status = document.getElementById('editSharedProjectStatus')?.value;

    if (!name) {
      this.showToast('Please enter a project name', 'error');
      return;
    }

    try {
      const teamId = this.team?.id;
      await firestoreDb.db.collection('teams').doc(teamId).collection('sharedProjects').doc(projectId).update({
        name,
        description,
        deadline: deadline || null,
        status,
        updatedAt: new Date().toISOString()
      });

      this.closeModal();
      this.showToast('Project updated', 'success');
      await this.renderSharedProjectDetailView();
    } catch (error) {
      console.error('Error updating project:', error);
      this.showToast('Error updating project', 'error');
    }
  }

  async deleteSharedProject() {
    if (!confirm('Are you sure you want to delete this project? This cannot be undone.')) {
      return;
    }

    const projectId = this.selectedSharedProjectId;
    try {
      const teamId = this.team?.id;
      await firestoreDb.db.collection('teams').doc(teamId).collection('sharedProjects').doc(projectId).delete();

      this.closeModal();
      this.showToast('Project deleted', 'success');
      this.navigateTo('sharedProjects');
    } catch (error) {
      console.error('Error deleting project:', error);
      this.showToast('Error deleting project', 'error');
    }
  }

  async showNewSharedProjectModal() {
    console.log('showNewSharedProjectModal called', { team: this.team, teamMembers: this.teamMembers });
    try {
      if (!this.team) {
        this.showToast('Please join or create a team first', 'info');
        return;
      }

      const areas = await db.getAreas() || [];
      const teamMembers = this.teamMembers || [];

      const html = `
      <div class="modal-header">
        <h2>New Shared Project</h2>
        <button class="modal-close" onclick="app.closeModal()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Project Name</label>
          <input type="text" id="sharedProjectName" class="form-input" placeholder="Enter project name...">
        </div>
        <div class="form-group">
          <label>Description (optional)</label>
          <textarea id="sharedProjectDescription" class="form-textarea" rows="2" placeholder="What is this project about?"></textarea>
        </div>
        <div class="form-group">
          <label>Area (optional)</label>
          <select id="sharedProjectArea" class="form-select">
            <option value="">No area</option>
            ${areas.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Deadline (optional)</label>
          <input type="date" id="sharedProjectDeadline" class="form-input">
        </div>
        <div class="form-group">
          <label>Team Members</label>
          <div class="member-checkboxes">
            ${teamMembers.map(m => `
              <label class="checkbox-label">
                <input type="checkbox" name="projectMembers" value="${m.id}" ${m.id === firestoreDb?.getCurrentUserId?.() ? 'checked disabled' : ''}>
                ${m.name}
              </label>
            `).join('')}
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.createSharedProject()">Create Project</button>
      </div>
    `;

      document.getElementById('modalContent').innerHTML = html;
      document.getElementById('modalOverlay').classList.add('active');
    } catch (error) {
      console.error('Error showing new shared project modal:', error);
      this.showToast('Error opening modal: ' + error.message, 'error');
    }
  }

  async createSharedProject() {
    const name = document.getElementById('sharedProjectName')?.value?.trim();
    const description = document.getElementById('sharedProjectDescription')?.value?.trim();
    const areaId = document.getElementById('sharedProjectArea')?.value;
    const deadline = document.getElementById('sharedProjectDeadline')?.value;

    const memberCheckboxes = document.querySelectorAll('input[name="projectMembers"]:checked');
    const memberIds = Array.from(memberCheckboxes).map(cb => cb.value);

    // Always include current user
    const currentUserId = firestoreDb?.getCurrentUserId?.();
    if (currentUserId && !memberIds.includes(currentUserId)) {
      memberIds.push(currentUserId);
    }

    if (!name) {
      this.showToast('Please enter a project name', 'error');
      return;
    }

    try {
      const teamId = this.team?.id;
      await firestoreDb.createSharedProject(teamId, {
        name,
        description,
        areaId,
        deadline,
        memberIds
      });

      this.closeModal();
      this.showToast('Shared project created', 'success');

      // Refresh view
      if (this.currentView === 'sharedProjects' || this.currentView === 'teamDashboard') {
        await this.renderCurrentView();
      }
    } catch (error) {
      console.error('Error creating shared project:', error);
      this.showToast('Failed to create shared project', 'error');
    }
  }

  async showInviteMemberModal() {
    if (!this.team || !this.team.id) {
      this.showToast('Please save a team name first to generate invite links', 'info');
      return;
    }

    try {
      const teamId = this.team?.id;
      const inviteLink = await firestoreDb.generateInviteLink(teamId);

      const html = `
        <div class="modal-header">
          <h2>Invite Team Member</h2>
          <button class="modal-close" onclick="app.closeModal()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <p>Share this link with people you want to invite to <strong>${this.team.name}</strong>:</p>
          <div class="invite-link-container">
            <input type="text" id="inviteLinkInput" class="form-input" value="${window.location.origin}?invite=${inviteLink}" readonly>
            <button class="btn btn-secondary" onclick="app.copyInviteLink()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Copy
            </button>
          </div>
          <p class="text-muted small">This link expires in 7 days.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" onclick="app.closeModal()">Done</button>
        </div>
      `;

      document.getElementById('modalContent').innerHTML = html;
      document.getElementById('modalOverlay').classList.add('active');
    } catch (error) {
      console.error('Error generating invite:', error);
      this.showToast(error.message || 'Failed to generate invite link', 'error');
    }
  }

  copyInviteLink() {
    const input = document.getElementById('inviteLinkInput');
    if (input) {
      input.select();
      document.execCommand('copy');
      this.showToast('Invite link copied!', 'success');
    }
  }

  showAddTeamMemberManualModal() {
    const html = `
      <div class="modal-header">
        <h2>Add Team Member</h2>
        <button class="modal-close" onclick="app.closeModal()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Name <span class="required">*</span></label>
          <input type="text" id="newMemberName" class="form-input" placeholder="Enter name...">
        </div>
        <div class="form-group">
          <label>Email (optional)</label>
          <input type="email" id="newMemberEmail" class="form-input" placeholder="email@example.com">
        </div>
        <div class="form-group">
          <label>Title/Role (optional)</label>
          <input type="text" id="newMemberTitle" class="form-input" placeholder="e.g., Developer, Designer, Manager">
        </div>
        <div class="form-group">
          <label>Phone (optional)</label>
          <input type="tel" id="newMemberPhone" class="form-input" placeholder="+1 (555) 000-0000">
        </div>
        <div class="form-group">
          <label>Avatar Color</label>
          <div class="color-options" id="memberColorOptions">
            <button type="button" class="color-option selected" data-color="#6366f1" style="background: #6366f1"></button>
            <button type="button" class="color-option" data-color="#10b981" style="background: #10b981"></button>
            <button type="button" class="color-option" data-color="#f59e0b" style="background: #f59e0b"></button>
            <button type="button" class="color-option" data-color="#ef4444" style="background: #ef4444"></button>
            <button type="button" class="color-option" data-color="#8b5cf6" style="background: #8b5cf6"></button>
            <button type="button" class="color-option" data-color="#ec4899" style="background: #ec4899"></button>
            <button type="button" class="color-option" data-color="#14b8a6" style="background: #14b8a6"></button>
            <button type="button" class="color-option" data-color="#64748b" style="background: #64748b"></button>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.addTeamMemberManual()">Add Member</button>
      </div>
    `;

    document.getElementById('modalContent').innerHTML = html;
    document.getElementById('modalOverlay').classList.add('active');

    // Setup color option click handlers
    setTimeout(() => {
      document.querySelectorAll('#memberColorOptions .color-option').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#memberColorOptions .color-option').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
        });
      });
    }, 100);
  }

  async addTeamMemberManual() {
    const name = document.getElementById('newMemberName')?.value?.trim();
    const email = document.getElementById('newMemberEmail')?.value?.trim();
    const title = document.getElementById('newMemberTitle')?.value?.trim();
    const phone = document.getElementById('newMemberPhone')?.value?.trim();
    const selectedColor = document.querySelector('#memberColorOptions .color-option.selected');
    const color = selectedColor?.dataset?.color || '#6366f1';

    if (!name) {
      this.showToast('Please enter a name', 'error');
      return;
    }

    try {
      // Add to local team members (stored in user's Firestore)
      const memberData = {
        name,
        email: email || null,
        title: title || null,
        phone: phone || null,
        color,
        role: 'member',
        isManual: true, // Flag to indicate this is a manually added member (not a real user)
        addedDate: new Date().toISOString()
      };

      // Add to Firestore using the existing teamMembers collection
      const memberId = await firestoreDb.addTeamMember(memberData);

      // Update local state
      if (!this.teamMembers) {
        this.teamMembers = [];
      }
      this.teamMembers.push({ id: memberId, ...memberData });

      this.closeModal();
      this.showToast(`${name} added to team`, 'success');

      // Refresh the view
      if (this.currentView === 'teamMembers') {
        await this.renderTeamMembersView();
      } else if (this.currentView === 'teamDashboard') {
        await this.renderTeamDashboardView();
      }
    } catch (error) {
      console.error('Error adding team member:', error);
      this.showToast('Failed to add team member', 'error');
    }
  }

  async showDelegateToMemberModal(memberId = null) {
    console.log('showDelegateToMemberModal called', { memberId, team: this.team, teamMembers: this.teamMembers });
    try {
      if (!this.team || !this.teamMembers || this.teamMembers.length === 0) {
        this.showToast('Please join or create a team first', 'info');
        return;
      }

      // Get undelegated actions
      const actions = await db.getNextActions() || [];
      const undelegatedActions = actions.filter(a => !a.completed && !a.delegatedTo);

      const currentUserId = firestoreDb?.getCurrentUserId?.();
      const otherMembers = this.teamMembers.filter(m => m.id !== currentUserId);

      const html = `
      <div class="modal-header">
        <h2>Delegate Task</h2>
        <button class="modal-close" onclick="app.closeModal()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Delegate To</label>
          <select id="delegateMemberSelect" class="form-select">
            <option value="">Choose team member...</option>
            ${otherMembers.map(m => `
              <option value="${m.id}" ${m.id === memberId ? 'selected' : ''}>${m.name}${m.title ? ' - ' + m.title : ''}</option>
            `).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Task Description</label>
          <input type="text" id="newDelegationTask" class="form-input" placeholder="What needs to be done?">
        </div>
        <div class="form-group">
          <label>Due Date (optional)</label>
          <input type="date" id="delegateDueDate" class="form-input">
        </div>
        <div class="form-group">
          <label>Notes (optional)</label>
          <textarea id="delegateNotes" class="form-textarea" rows="2" placeholder="Add context or instructions..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.submitNewDelegation()">Delegate</button>
      </div>
    `;

      document.getElementById('modalContent').innerHTML = html;
      document.getElementById('modalOverlay').classList.add('active');
    } catch (error) {
      console.error('Error showing delegate to member modal:', error);
      this.showToast('Error opening delegate modal: ' + error.message, 'error');
    }
  }

  async submitNewDelegation() {
    const memberId = document.getElementById('delegateMemberSelect')?.value;
    const taskDesc = document.getElementById('newDelegationTask')?.value?.trim();
    const dueDate = document.getElementById('delegateDueDate')?.value;
    const notes = document.getElementById('delegateNotes')?.value;

    if (!memberId || !taskDesc) {
      this.showToast('Please select a member and enter a task description', 'error');
      return;
    }

    try {
      const teamId = this.team?.id;
      const member = this.teamMembers.find(m => m.id === memberId);

      // Create the action first
      const actionId = await db.addToNextActions(
        taskDesc,
        ['@anywhere'],
        taskDesc,
        new Date().toISOString(),
        [],
        { dueDate }
      );

      // Then delegate it
      await firestoreDb.delegateToTeamMember(actionId, memberId, teamId);

      // Update action with delegation info
      await db.updateAction(actionId, {
        delegatedTo: memberId,
        delegatedToName: member?.name,
        delegatedDate: new Date().toISOString(),
        delegationNotes: notes
      });

      this.closeModal();
      this.showToast(`Delegated to ${member?.name}`, 'success');

      // Refresh view
      await this.renderCurrentView();
    } catch (error) {
      console.error('Error creating delegation:', error);
      this.showToast('Failed to create delegation', 'error');
    }
  }

  async confirmDeleteTeam() {
    if (!confirm('Are you sure you want to delete this team? This action cannot be undone and will remove all team data.')) {
      return;
    }

    try {
      const teamId = this.team?.id;
      await firestoreDb.deleteTeam(teamId);

      this.team = null;
      this.teamMembers = [];
      this.updateTeamSectionVisibility();

      this.showToast('Team deleted', 'success');
      this.navigateTo('inbox');
    } catch (error) {
      console.error('Error deleting team:', error);
      this.showToast(error.message || 'Failed to delete team', 'error');
    }
  }

  async updateMemberRole(memberId, newRole) {
    try {
      const teamId = this.team?.id;
      await firestoreDb.db.collection('teams').doc(teamId).collection('members').doc(memberId).update({
        role: newRole
      });

      // Update local state
      const member = this.teamMembers.find(m => m.id === memberId);
      if (member) {
        member.role = newRole;
      }

      this.showToast(`Role updated to ${newRole}`, 'success');
    } catch (error) {
      console.error('Error updating role:', error);
      this.showToast('Failed to update role', 'error');
    }
  }

  async removeMember(memberId) {
    const member = this.teamMembers.find(m => m.id === memberId);
    if (!confirm(`Are you sure you want to remove ${member?.name || 'this member'} from the team?`)) {
      return;
    }

    try {
      const teamId = this.team?.id;
      if (!teamId) {
        throw new Error('No team ID found');
      }

      // Remove member from team members collection
      await firestoreDb.db.collection('teams').doc(teamId).collection('members').doc(memberId).delete();

      // Update local state
      this.teamMembers = this.teamMembers.filter(m => m.id !== memberId);

      this.showToast('Member removed', 'success');

      // Re-render just the members list to avoid reloading from cache
      this.renderTeamMembersList();
    } catch (error) {
      console.error('Error removing member:', error);
      this.showToast('Failed to remove member', 'error');
    }
  }

  // Helper to re-render just the team members list in Team Settings
  renderTeamMembersList() {
    const membersContainer = document.getElementById('teamSettingsMembersList');
    if (!membersContainer) return;

    if (!this.teamMembers || this.teamMembers.length === 0) {
      membersContainer.innerHTML = `
        <div class="empty-members-state">
          <p>No team members yet. Add members to delegate tasks and collaborate.</p>
          <button class="btn btn-primary" onclick="app.showAddTeamMemberManualModal()">Add First Member</button>
        </div>
      `;
      return;
    }

    let html = '';
    const currentUserId = firestoreDb?.getCurrentUserId?.();
    const isTeamOwner = this.team && this.team.ownerId === currentUserId;
    const canManageMembers = isTeamOwner || this.currentTeamRole === 'owner' || this.currentTeamRole === 'admin';

    this.teamMembers.forEach(member => {
      const isOwner = this.team && member.id === this.team.ownerId;
      const isCurrentUser = member.id === currentUserId;
      const avatarColor = member.color || '#6366f1';

      html += `
        <div class="team-member-settings-card">
          <div class="member-avatar" style="background: ${avatarColor}">${member.name?.charAt(0).toUpperCase() || 'U'}</div>
          <div class="team-member-settings-info">
            <div class="team-member-settings-name">${member.name || member.displayName || 'Unknown'}${isCurrentUser ? ' (you)' : ''}</div>
            <div class="team-member-settings-email">${member.email || ''}</div>
            <div class="team-member-settings-meta">${member.title || member.role || 'Member'}</div>
          </div>
          <div class="team-member-settings-actions">
            ${isOwner ? '<span class="owner-badge">Owner</span>' :
              canManageMembers ? `
                <select class="role-select" onchange="app.updateMemberRole('${member.id}', this.value)">
                  <option value="member" ${member.role === 'member' || !member.role ? 'selected' : ''}>Member</option>
                  <option value="admin" ${member.role === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
                ${!isCurrentUser ? `
                  <button class="btn btn-icon btn-danger-icon" onclick="app.removeMember('${member.id}')" title="Remove member">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                ` : ''}
              ` : `<span class="role-badge">${member.role || 'Member'}</span>`
            }
          </div>
        </div>
      `;
    });
    membersContainer.innerHTML = html;
  }

  toggleAssignedCompleted() {
    const list = document.getElementById('assignedCompletedList');
    const icon = document.getElementById('assignedCompletedIcon');
    if (list && icon) {
      const isHidden = list.style.display === 'none';
      list.style.display = isHidden ? 'block' : 'none';
      icon.style.transform = isHidden ? 'rotate(180deg)' : '';
    }
  }

  // Assigned to Me View rendering
  async renderAssignedToMeView() {
    const teamId = this.team?.id;
    if (!teamId) return;

    const currentUserId = firestoreDb?.getCurrentUserId?.();
    const delegations = await firestoreDb?.getDelegations?.(teamId) || [];
    const myAssignments = delegations.filter(d => d.delegateeId === currentUserId);

    const now = new Date();
    const today = now.toDateString();

    // Categorize assignments
    const overdue = myAssignments.filter(d =>
      d.status !== 'completed' && d.dueDate && new Date(d.dueDate) < now && new Date(d.dueDate).toDateString() !== today
    );
    const dueToday = myAssignments.filter(d =>
      d.status !== 'completed' && d.dueDate && new Date(d.dueDate).toDateString() === today
    );
    const upcoming = myAssignments.filter(d =>
      d.status !== 'completed' && d.dueDate && new Date(d.dueDate) > now && new Date(d.dueDate).toDateString() !== today
    );
    const noDueDate = myAssignments.filter(d =>
      d.status !== 'completed' && !d.dueDate
    );
    const completed = myAssignments.filter(d => d.status === 'completed');

    // Render Overdue section
    const overdueContainer = document.getElementById('assignedOverdueList');
    if (overdueContainer) {
      overdueContainer.innerHTML = this.renderAssignmentList(overdue, 'overdue');
    }

    // Render Due Today section
    const todayContainer = document.getElementById('assignedTodayList');
    if (todayContainer) {
      todayContainer.innerHTML = this.renderAssignmentList(dueToday, 'today');
    }

    // Render Upcoming section
    const upcomingContainer = document.getElementById('assignedUpcomingList');
    if (upcomingContainer) {
      upcomingContainer.innerHTML = this.renderAssignmentList(upcoming, 'upcoming');
    }

    // Render No Due Date section
    const noDueDateContainer = document.getElementById('assignedNoDueDateList');
    if (noDueDateContainer) {
      noDueDateContainer.innerHTML = this.renderAssignmentList(noDueDate, 'no-date');
    }

    // Update counts
    document.getElementById('assignedOverdueCount')?.textContent && (document.getElementById('assignedOverdueCount').textContent = overdue.length);
    document.getElementById('assignedTodayCount')?.textContent && (document.getElementById('assignedTodayCount').textContent = dueToday.length);
    document.getElementById('assignedUpcomingCount')?.textContent && (document.getElementById('assignedUpcomingCount').textContent = upcoming.length);
    document.getElementById('assignedCompletedCount')?.textContent && (document.getElementById('assignedCompletedCount').textContent = completed.length);

    // Render completed section (collapsed by default)
    const completedContainer = document.getElementById('assignedCompletedList');
    if (completedContainer) {
      completedContainer.innerHTML = this.renderAssignmentList(completed, 'completed');
      completedContainer.style.display = 'none';
    }
  }

  renderAssignmentList(assignments, type) {
    if (!assignments || assignments.length === 0) {
      return '<p class="empty-text">No items</p>';
    }

    return assignments.map(d => {
      const delegator = this.teamMembers?.find(m => m.id === d.delegatorId);
      const daysOverdue = d.dueDate ? Math.ceil((new Date() - new Date(d.dueDate)) / 86400000) : 0;

      return `
        <div class="assigned-item ${type}" data-id="${d.id}">
          <div class="assigned-item-checkbox">
            <input type="checkbox" ${d.status === 'completed' ? 'checked' : ''} onchange="app.toggleAssignmentComplete('${d.id}', this.checked)">
          </div>
          <div class="assigned-item-content">
            <div class="assigned-item-title">${d.actionContent || d.description || 'Untitled'}</div>
            <div class="assigned-item-meta">
              From: ${delegator?.name || 'Unknown'}
              ${d.dueDate ? ` | Due: ${new Date(d.dueDate).toLocaleDateString()}` : ''}
              ${type === 'overdue' && daysOverdue > 0 ? ` | <span class="overdue-badge">${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue</span>` : ''}
            </div>
            ${d.notes ? `<div class="assigned-item-notes">${d.notes}</div>` : ''}
          </div>
          <div class="assigned-item-actions">
            <button class="btn btn-icon" onclick="app.showAssignmentComments('${d.id}')" title="Comments">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  async toggleAssignmentComplete(delegationId, isComplete) {
    try {
      const teamId = this.team?.id;
      if (isComplete) {
        await firestoreDb.completeDelegation(delegationId, teamId);
        this.showToast('Assignment completed!', 'success');
      } else {
        await firestoreDb.updateDelegation(teamId, delegationId, { status: 'pending', completedAt: null });
        this.showToast('Assignment reopened', 'info');
      }
      await this.renderAssignedToMeView();
    } catch (error) {
      console.error('Error updating assignment:', error);
      this.showToast('Failed to update assignment', 'error');
    }
  }

  async showAssignmentComments(delegationId) {
    const teamId = this.team?.id;
    if (!teamId) return;

    try {
      const comments = await firestoreDb.getComments(teamId, 'delegation', delegationId);

      const html = `
        <div class="modal-header">
          <h2>Comments</h2>
          <button class="modal-close" onclick="app.closeModal()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="comments-list" id="commentsListContainer">
            ${comments.length === 0 ? '<p class="empty-text">No comments yet</p>' : comments.map(c => {
              const author = this.teamMembers?.find(m => m.id === c.userId);
              const time = c.createdAt?.toDate ? c.createdAt.toDate() : new Date(c.createdAt);
              return `
                <div class="comment-item">
                  <div class="comment-avatar">${author?.name?.charAt(0) || 'U'}</div>
                  <div class="comment-content">
                    <div class="comment-header">
                      <span class="comment-author">${author?.name || 'Unknown'}</span>
                      <span class="comment-time">${this.formatTimeAgo(time)}</span>
                    </div>
                    <div class="comment-text">${c.content}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          <div class="comment-input-container">
            <textarea id="newCommentInput" class="form-textarea" rows="2" placeholder="Write a comment..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="app.closeModal()">Close</button>
          <button class="btn btn-primary" onclick="app.submitComment('delegation', '${delegationId}')">Add Comment</button>
        </div>
      `;

      document.getElementById('modalContent').innerHTML = html;
      document.getElementById('modalOverlay').classList.add('active');
    } catch (error) {
      console.error('Error loading comments:', error);
      this.showToast('Failed to load comments', 'error');
    }
  }

  async submitComment(itemType, itemId) {
    const content = document.getElementById('newCommentInput')?.value?.trim();
    if (!content) {
      this.showToast('Please enter a comment', 'error');
      return;
    }

    try {
      const teamId = this.team?.id;
      await firestoreDb.addComment(teamId, itemType, itemId, content);

      // Refresh comments
      await this.showAssignmentComments(itemId);
      this.showToast('Comment added', 'success');
    } catch (error) {
      console.error('Error adding comment:', error);
      this.showToast('Failed to add comment', 'error');
    }
  }

  // =================================================================
  // HELP SYSTEM
  // =================================================================

  openHelpPanel() {
    const overlay = document.getElementById('helpPanelOverlay');
    if (overlay) {
      overlay.classList.add('visible');
      this.helpPanelState = { view: 'categories', category: null, article: null };
      this.renderHelpPanelContent();

      // Focus search input
      setTimeout(() => {
        const searchInput = document.getElementById('helpSearchInput');
        if (searchInput) searchInput.focus();
      }, 100);
    }
  }

  closeHelpPanel() {
    const overlay = document.getElementById('helpPanelOverlay');
    if (overlay) {
      overlay.classList.remove('visible');
    }
  }

  searchHelp(query) {
    const contentEl = document.getElementById('helpPanelContent');
    if (!contentEl) return;

    if (!query || query.length < 2) {
      // Show categories view
      this.helpPanelState = { view: 'categories', category: null, article: null };
      this.renderHelpPanelContent();
      return;
    }

    const results = searchHelpArticles(query);
    this.renderHelpSearchResults(results, query);
  }

  renderHelpPanelContent() {
    const contentEl = document.getElementById('helpPanelContent');
    if (!contentEl || !window.wikiContent) return;

    const state = this.helpPanelState || { view: 'categories' };

    if (state.view === 'categories') {
      this.renderHelpCategories(contentEl);
    } else if (state.view === 'category') {
      this.renderHelpCategoryArticles(contentEl, state.category);
    } else if (state.view === 'article') {
      this.renderHelpArticle(contentEl, state.article);
    }
  }

  renderHelpCategories(contentEl) {
    const categories = wikiContent.categories;

    let html = '<div class="help-categories">';

    categories.forEach(cat => {
      const articleCount = wikiContent.articles.filter(a => a.category === cat.id).length;
      html += `
        <button class="help-category" onclick="app.showHelpCategory('${cat.id}')">
          <div class="help-category-icon">${this.getHelpIcon(cat.icon)}</div>
          <span class="help-category-name">${cat.name}</span>
          <span class="help-category-count">${articleCount}</span>
        </button>
      `;
    });

    html += '</div>';

    // Quick links
    html += `
      <div class="help-quick-links">
        <div class="help-quick-links-title">Quick Links</div>
        <button class="help-quick-link" onclick="app.openHelpArticle('quick-start')">
          ${this.getHelpIcon('rocket')} Quick Start Guide
        </button>
        <button class="help-quick-link" onclick="app.openHelpArticle('keyboard-shortcuts')">
          ${this.getHelpIcon('keyboard')} Keyboard Shortcuts
        </button>
        <button class="help-quick-link" onclick="app.startOnboarding(); app.closeHelpPanel();">
          ${this.getHelpIcon('play')} Start Tour
        </button>
      </div>
    `;

    contentEl.innerHTML = html;
  }

  renderHelpCategoryArticles(contentEl, categoryId) {
    const category = wikiContent.categories.find(c => c.id === categoryId);
    const articles = getArticlesByCategory(categoryId);

    let html = `
      <div class="help-breadcrumb">
        <button class="help-breadcrumb-link" onclick="app.showHelpCategories()">Help</button>
        <span class="help-breadcrumb-separator">/</span>
        <span class="help-breadcrumb-current">${category?.name || 'Category'}</span>
      </div>
      <div class="help-article-list">
    `;

    articles.forEach(article => {
      html += `
        <button class="help-article-item" onclick="app.openHelpArticle('${article.id}')">
          <span class="help-article-title">${article.title}</span>
          <span class="help-article-arrow">${this.getHelpIcon('chevron-right')}</span>
        </button>
      `;
    });

    html += '</div>';
    contentEl.innerHTML = html;
  }

  renderHelpArticle(contentEl, articleId) {
    const article = getArticleById(articleId);
    if (!article) {
      contentEl.innerHTML = '<p>Article not found</p>';
      return;
    }

    const category = wikiContent.categories.find(c => c.id === article.category);

    let html = `
      <div class="help-breadcrumb">
        <button class="help-breadcrumb-link" onclick="app.showHelpCategories()">Help</button>
        <span class="help-breadcrumb-separator">/</span>
        <button class="help-breadcrumb-link" onclick="app.showHelpCategory('${article.category}')">${category?.name || 'Category'}</button>
        <span class="help-breadcrumb-separator">/</span>
        <span class="help-breadcrumb-current">${article.title}</span>
      </div>
      <div class="help-article">
        ${article.content}
      </div>
    `;

    contentEl.innerHTML = html;
  }

  renderHelpSearchResults(results, query) {
    const contentEl = document.getElementById('helpPanelContent');
    if (!contentEl) return;

    if (results.length === 0) {
      contentEl.innerHTML = `
        <div class="help-no-results">
          ${this.getHelpIcon('search')}
          <p>No results found for "${query}"</p>
        </div>
      `;
      return;
    }

    let html = `
      <div class="help-search-results">
        <div class="help-search-results-title">${results.length} result${results.length !== 1 ? 's' : ''} for "${query}"</div>
        <div class="help-article-list">
    `;

    results.forEach(article => {
      const category = wikiContent.categories.find(c => c.id === article.category);
      html += `
        <button class="help-article-item" onclick="app.openHelpArticle('${article.id}')">
          <span class="help-article-title">${article.title}</span>
          <span class="help-article-arrow">${this.getHelpIcon('chevron-right')}</span>
        </button>
      `;
    });

    html += '</div></div>';
    contentEl.innerHTML = html;
  }

  showHelpCategories() {
    this.helpPanelState = { view: 'categories', category: null, article: null };
    this.renderHelpPanelContent();

    // Clear search
    const searchInput = document.getElementById('helpSearchInput');
    if (searchInput) searchInput.value = '';
  }

  showHelpCategory(categoryId) {
    this.helpPanelState = { view: 'category', category: categoryId, article: null };
    this.renderHelpPanelContent();
  }

  openHelpArticle(articleId) {
    // If help panel is not open, open it first
    const overlay = document.getElementById('helpPanelOverlay');
    if (!overlay?.classList.contains('visible')) {
      overlay?.classList.add('active');
    }

    this.helpPanelState = { view: 'article', category: null, article: articleId };
    this.renderHelpPanelContent();
  }

  getHelpIcon(name) {
    const icons = {
      'rocket': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"></path><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"></path></svg>',
      'inbox': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>',
      'filter': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>',
      'check-circle': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
      'folder': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
      'layout': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>',
      'calendar': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
      'link': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>',
      'keyboard': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect><path d="M6 8h.001"></path><path d="M10 8h.001"></path><path d="M14 8h.001"></path><path d="M18 8h.001"></path><path d="M8 12h.001"></path><path d="M12 12h.001"></path><path d="M16 12h.001"></path><path d="M7 16h10"></path></svg>',
      'lightbulb': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"></path><path d="M9 18h6"></path><path d="M10 22h4"></path></svg>',
      'chevron-right': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>',
      'search': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
      'play': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>',
      'book': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>',
      'help-circle': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>'
    };
    return icons[name] || icons['help-circle'];
  }

  // =================================================================
  // ONBOARDING TOUR
  // =================================================================

  startOnboarding() {
    if (!window.wikiContent) return;

    this.onboardingStep = 0;
    this.onboardingSteps = wikiContent.onboardingSteps;

    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) {
      overlay.classList.add('active');
      this.showOnboardingStep(0);
    }

    // Store that user has seen onboarding
    localStorage.setItem('gtd-onboarding-complete', 'true');
  }

  showOnboardingStep(stepIndex) {
    if (!this.onboardingSteps || stepIndex >= this.onboardingSteps.length) {
      this.endOnboarding();
      return;
    }

    const step = this.onboardingSteps[stepIndex];
    const targetEl = document.querySelector(step.target);

    if (!targetEl) {
      // Skip to next step if target not found
      this.showOnboardingStep(stepIndex + 1);
      return;
    }

    // Position spotlight
    const spotlight = document.getElementById('onboardingSpotlight');
    const tooltip = document.getElementById('onboardingTooltip');

    if (spotlight && tooltip) {
      const rect = targetEl.getBoundingClientRect();
      const padding = 8;

      spotlight.style.top = (rect.top - padding) + 'px';
      spotlight.style.left = (rect.left - padding) + 'px';
      spotlight.style.width = (rect.width + padding * 2) + 'px';
      spotlight.style.height = (rect.height + padding * 2) + 'px';

      // Position tooltip based on step.position
      this.positionOnboardingTooltip(tooltip, rect, step.position);

      // Update content
      const contentEl = document.getElementById('onboardingContent');
      if (contentEl) {
        contentEl.innerHTML = `
          <h3>${step.title}</h3>
          <p>${step.content}</p>
        `;
      }

      // Update progress dots
      this.renderOnboardingProgress(stepIndex);

      // Update button text
      const nextBtn = document.getElementById('onboardingNext');
      if (nextBtn) {
        nextBtn.textContent = stepIndex === this.onboardingSteps.length - 1 ? 'Done' : 'Next';
      }
    }

    this.onboardingStep = stepIndex;
  }

  positionOnboardingTooltip(tooltip, targetRect, position) {
    const tooltipWidth = 340;
    const tooltipHeight = tooltip.offsetHeight || 180;
    const margin = 16;

    // Remove existing arrow classes
    tooltip.classList.remove('arrow-top', 'arrow-bottom', 'arrow-left', 'arrow-right');

    let top, left;

    switch (position) {
      case 'bottom':
        top = targetRect.bottom + margin;
        left = targetRect.left + (targetRect.width / 2) - (tooltipWidth / 2);
        tooltip.classList.add('arrow-top');
        break;
      case 'bottom-end':
        top = targetRect.bottom + margin;
        left = targetRect.right - tooltipWidth;
        tooltip.classList.add('arrow-top');
        break;
      case 'top':
        top = targetRect.top - tooltipHeight - margin;
        left = targetRect.left + (targetRect.width / 2) - (tooltipWidth / 2);
        tooltip.classList.add('arrow-bottom');
        break;
      case 'right':
        top = targetRect.top + (targetRect.height / 2) - (tooltipHeight / 2);
        left = targetRect.right + margin;
        tooltip.classList.add('arrow-left');
        break;
      case 'left':
        top = targetRect.top + (targetRect.height / 2) - (tooltipHeight / 2);
        left = targetRect.left - tooltipWidth - margin;
        tooltip.classList.add('arrow-right');
        break;
      default:
        top = targetRect.bottom + margin;
        left = targetRect.left;
        tooltip.classList.add('arrow-top');
    }

    // Keep tooltip within viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (left < margin) left = margin;
    if (left + tooltipWidth > viewportWidth - margin) left = viewportWidth - tooltipWidth - margin;
    if (top < margin) top = margin;
    if (top + tooltipHeight > viewportHeight - margin) top = viewportHeight - tooltipHeight - margin;

    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
  }

  renderOnboardingProgress(currentStep) {
    const progressEl = document.getElementById('onboardingProgress');
    if (!progressEl || !this.onboardingSteps) return;

    let html = '';
    this.onboardingSteps.forEach((_, index) => {
      let className = 'onboarding-dot';
      if (index < currentStep) className += ' completed';
      if (index === currentStep) className += ' active';
      html += `<div class="${className}"></div>`;
    });

    progressEl.innerHTML = html;
  }

  nextOnboardingStep() {
    this.showOnboardingStep(this.onboardingStep + 1);
  }

  skipOnboarding() {
    this.endOnboarding();
  }

  endOnboarding() {
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) {
      overlay.classList.remove('active');
    }
    this.onboardingStep = 0;
  }

  // Check if user is new and should see onboarding
  async checkFirstTimeUser() {
    const hasSeenOnboarding = localStorage.getItem('gtd-onboarding-complete');
    if (!hasSeenOnboarding) {
      // Wait a bit for the UI to settle
      setTimeout(() => {
        this.startOnboarding();
      }, 1000);
    }
  }

  // =================================================================
  // CONTEXTUAL HELP TOOLTIPS
  // =================================================================

  showContextualHelp(elementId, triggerEl) {
    const helpText = getContextualHelp(elementId);
    if (!helpText) return;

    // Remove any existing tooltip
    this.hideContextualHelp();

    // Create tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'contextual-tooltip';
    tooltip.id = 'activeContextualTooltip';
    tooltip.textContent = helpText;

    // Position near trigger
    const rect = triggerEl.getBoundingClientRect();
    tooltip.style.top = (rect.bottom + 8) + 'px';
    tooltip.style.left = rect.left + 'px';

    document.body.appendChild(tooltip);

    // Hide on click outside
    setTimeout(() => {
      document.addEventListener('click', this.hideContextualHelp.bind(this), { once: true });
    }, 100);
  }

  hideContextualHelp() {
    const tooltip = document.getElementById('activeContextualTooltip');
    if (tooltip) {
      tooltip.remove();
    }
  }
}

// Initialize app when DOM is ready
const app = new GTDApp();
console.log('GTDApp instance created');
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOMContentLoaded fired, starting init...');
  try {
    await app.init();
    console.log('App init completed successfully');
  } catch (err) {
    console.error('INIT ERROR:', err);
    alert('App failed to initialize: ' + err.message);
  }
});
