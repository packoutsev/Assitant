/**
 * Google Integration Module
 * Handles Google Drive and Gmail integration for GTD Capture
 */

class GoogleIntegration {
  constructor() {
    // Configuration - Replace with your Google Cloud Console credentials
    this.CLIENT_ID = ''; // Set in Firebase Console or Google Cloud Console
    this.API_KEY = ''; // API Key for Google Picker

    // Scopes for different features
    this.SCOPES = {
      drive: 'https://www.googleapis.com/auth/drive.readonly',
      gmail_send: 'https://www.googleapis.com/auth/gmail.send',
      gmail_readonly: 'https://www.googleapis.com/auth/gmail.readonly',
      gmail_labels: 'https://www.googleapis.com/auth/gmail.labels',
      calendar: 'https://www.googleapis.com/auth/calendar',
      calendar_events: 'https://www.googleapis.com/auth/calendar.events'
    };

    // State
    this.tokenClient = null;
    this.accessToken = null;
    this.pickerInited = false;
    this.gisInited = false;

    // Connection status (persisted in Firestore)
    this.driveConnected = false;
    this.gmailConnected = false;
    this.calendarConnected = false;

    // Calendar settings
    this.calendarSettings = {
      showInToday: true,
      showInWeeklyReview: true,
      showAvailability: true,
      createEventsForActions: false,
      syncProjectDeadlines: false,
      twoWaySync: false,
      enableFocusTime: true,
      defaultFocusDuration: 60,
      focusCalendarId: 'primary',
      selectedCalendars: ['primary']
    };

    // Cached calendar list
    this.calendarList = [];

    // Initialize when APIs are loaded
    this.initPromise = this.waitForAPIs();
  }

  /**
   * Wait for Google APIs to load
   */
  async waitForAPIs() {
    return new Promise((resolve) => {
      const checkAPIs = () => {
        const gsiLoaded = typeof google !== 'undefined' && google.accounts;
        const gapiLoaded = typeof gapi !== 'undefined';

        if (gsiLoaded && gapiLoaded) {
          this.initGoogleAPIs();
          resolve();
        } else {
          setTimeout(checkAPIs, 100);
        }
      };

      // Start checking after a short delay
      setTimeout(checkAPIs, 500);
    });
  }

  /**
   * Initialize Google APIs
   */
  async initGoogleAPIs() {
    try {
      // Initialize GAPI client for Picker and Gmail
      await new Promise((resolve, reject) => {
        gapi.load('client:picker', {
          callback: resolve,
          onerror: reject
        });
      });

      // Only fully initialize if we have an API key
      if (this.API_KEY) {
        await gapi.client.init({
          apiKey: this.API_KEY,
          discoveryDocs: [
            'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest',
            'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
            'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'
          ]
        });
        console.log('Google APIs fully initialized');
      } else {
        console.log('Google APIs loaded, awaiting credentials');
      }

      this.pickerInited = true;
      this.gisInited = true;
    } catch (error) {
      console.error('Error initializing Google APIs:', error);
      // Don't throw - allow the app to continue without Google integration
    }
  }

  /**
   * Re-initialize APIs after credentials are set
   */
  async reinitializeAPIs() {
    if (this.API_KEY && this.gisInited) {
      try {
        await gapi.client.init({
          apiKey: this.API_KEY,
          discoveryDocs: [
            'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest',
            'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
            'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'
          ]
        });
        console.log('Google APIs reinitialized with new credentials');
      } catch (error) {
        console.error('Error reinitializing Google APIs:', error);
      }
    }
  }

  /**
   * Check if credentials are configured
   */
  isConfigured() {
    return this.CLIENT_ID && this.API_KEY;
  }

  /**
   * Set credentials (can be called from settings)
   */
  async setCredentials(clientId, apiKey) {
    this.CLIENT_ID = clientId;
    this.API_KEY = apiKey;

    // Re-initialize APIs with new credentials
    await this.reinitializeAPIs();
  }

  /**
   * Request OAuth access token
   */
  async requestAccessToken(scopes, silent = false) {
    await this.initPromise;

    if (!this.isConfigured()) {
      throw new Error('Google API credentials not configured. Please set up in Settings > Integrations.');
    }

    return new Promise((resolve, reject) => {
      try {
        this.tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: this.CLIENT_ID,
          scope: scopes.join(' '),
          callback: (response) => {
            if (response.error) {
              reject(new Error(response.error));
            } else {
              this.accessToken = response.access_token;
              resolve(response.access_token);
            }
          }
        });

        // Check if we already have a valid token
        if (this.accessToken && gapi.client.getToken()) {
          resolve(this.accessToken);
        } else {
          // Use empty prompt for silent auth, 'consent' for explicit
          this.tokenClient.requestAccessToken({ prompt: silent ? '' : 'consent' });
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Ensure we have a valid access token for calendar operations
   * Attempts silent re-auth first, then prompts user if needed
   */
  async ensureCalendarToken() {
    if (this.accessToken) {
      // Make sure Calendar API is loaded
      if (!gapi.client.calendar) {
        await gapi.client.load('calendar', 'v3');
      }
      return this.accessToken;
    }

    if (!this.calendarConnected) {
      throw new Error('Calendar not connected');
    }

    // Try silent re-auth first
    try {
      const token = await this.requestAccessToken([
        this.SCOPES.calendar,
        this.SCOPES.calendar_events
      ], true);
      // Load Calendar API after getting token
      await gapi.client.load('calendar', 'v3');
      return token;
    } catch (silentError) {
      // Silent auth failed, need user interaction
      console.log('Silent auth failed, prompting user...');
      const token = await this.requestAccessToken([
        this.SCOPES.calendar,
        this.SCOPES.calendar_events
      ], false);
      // Load Calendar API after getting token
      await gapi.client.load('calendar', 'v3');
      return token;
    }
  }

  /**
   * Connect Google Drive
   */
  async connectDrive() {
    try {
      await this.requestAccessToken([this.SCOPES.drive]);
      this.driveConnected = true;

      // Save connection status
      await this.saveConnectionStatus();

      return true;
    } catch (error) {
      console.error('Error connecting Google Drive:', error);
      throw error;
    }
  }

  /**
   * Connect Gmail
   */
  async connectGmail() {
    try {
      await this.requestAccessToken([
        this.SCOPES.gmail_send,
        this.SCOPES.gmail_readonly,
        this.SCOPES.gmail_labels
      ]);
      this.gmailConnected = true;

      // Save connection status
      await this.saveConnectionStatus();

      return true;
    } catch (error) {
      console.error('Error connecting Gmail:', error);
      throw error;
    }
  }

  /**
   * Disconnect Google services
   */
  async disconnect() {
    if (this.accessToken) {
      google.accounts.oauth2.revoke(this.accessToken, () => {
        console.log('Token revoked');
      });
    }

    this.accessToken = null;
    this.driveConnected = false;
    this.gmailConnected = false;

    await this.saveConnectionStatus();
  }

  /**
   * Disconnect Google Drive only
   */
  async disconnectDrive() {
    this.driveConnected = false;
    await this.saveConnectionStatus();
  }

  /**
   * Disconnect Gmail only
   */
  async disconnectGmail() {
    this.gmailConnected = false;
    await this.saveConnectionStatus();
  }

  /**
   * Save connection status to Firestore
   */
  async saveConnectionStatus() {
    if (typeof db !== 'undefined' && db.updateUserSettings) {
      await db.updateUserSettings({
        googleDriveConnected: this.driveConnected,
        gmailConnected: this.gmailConnected,
        googleCalendarConnected: this.calendarConnected,
        calendarSettings: this.calendarSettings
      });
    }
  }

  /**
   * Load connection status and credentials from Firestore
   */
  async loadConnectionStatus() {
    if (typeof db !== 'undefined' && db.getUserSettings) {
      try {
        const settings = await db.getUserSettings();
        if (settings) {
          this.driveConnected = settings.googleDriveConnected || false;
          this.gmailConnected = settings.gmailConnected || false;
          this.calendarConnected = settings.googleCalendarConnected || false;

          // Load calendar settings
          if (settings.calendarSettings) {
            this.calendarSettings = { ...this.calendarSettings, ...settings.calendarSettings };
          }

          // Load saved credentials
          if (settings.googleClientId && settings.googleApiKey) {
            this.CLIENT_ID = settings.googleClientId;
            this.API_KEY = settings.googleApiKey;
          }

          // If calendar was connected but we have no token, try to restore silently
          if (this.calendarConnected && !this.accessToken && this.isConfigured()) {
            try {
              await this.restoreCalendarSession();
            } catch (e) {
              console.log('Could not restore calendar session silently');
              // Mark as not connected since we can't use it
              this.calendarConnected = false;
            }
          }
        }
      } catch (error) {
        console.error('Error loading Google integration settings:', error);
      }
    }
  }

  /**
   * Try to restore calendar session silently (no popup)
   */
  async restoreCalendarSession() {
    await this.initPromise;

    return new Promise((resolve, reject) => {
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: this.CLIENT_ID,
        scope: [this.SCOPES.calendar, this.SCOPES.calendar_events].join(' '),
        callback: async (response) => {
          if (response.error) {
            reject(new Error(response.error));
          } else {
            this.accessToken = response.access_token;
            // Load Calendar API
            await gapi.client.load('calendar', 'v3');
            resolve(response.access_token);
          }
        }
      });

      // Request with empty prompt for silent auth
      this.tokenClient.requestAccessToken({ prompt: '' });
    });
  }

  /**
   * Check if Drive is connected
   */
  isDriveConnected() {
    return this.driveConnected && this.accessToken;
  }

  /**
   * Check if Gmail is connected
   */
  isGmailConnected() {
    return this.gmailConnected && this.accessToken;
  }

  // ==========================================
  // Google Drive Picker
  // ==========================================

  /**
   * Show Google Drive Picker
   * @returns {Promise<Object>} Selected file data
   */
  async showDrivePicker() {
    await this.initPromise;

    if (!this.driveConnected) {
      await this.connectDrive();
    }

    return new Promise((resolve, reject) => {
      try {
        const view = new google.picker.View(google.picker.ViewId.DOCS);

        const picker = new google.picker.PickerBuilder()
          .enableFeature(google.picker.Feature.NAV_HIDDEN)
          .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
          .setAppId(this.CLIENT_ID.split('-')[0]) // Extract app ID
          .setOAuthToken(this.accessToken)
          .addView(view)
          .addView(new google.picker.DocsUploadView())
          .setDeveloperKey(this.API_KEY)
          .setCallback((data) => {
            if (data.action === google.picker.Action.PICKED) {
              const files = data.docs.map(doc => this.formatDriveFile(doc));
              resolve(files);
            } else if (data.action === google.picker.Action.CANCEL) {
              resolve(null);
            }
          })
          .build();

        picker.setVisible(true);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Format Drive file for storage
   */
  formatDriveFile(doc) {
    return {
      type: 'drive',
      fileId: doc.id,
      name: doc.name,
      mimeType: doc.mimeType,
      webViewLink: doc.url,
      iconUrl: doc.iconUrl,
      lastModified: doc.lastEditedUtc,
      sizeBytes: doc.sizeBytes
    };
  }

  /**
   * Get file metadata from Drive
   */
  async getDriveFileMetadata(fileId) {
    if (!this.accessToken) {
      throw new Error('Not connected to Google Drive');
    }

    try {
      const response = await gapi.client.drive.files.get({
        fileId: fileId,
        fields: 'id, name, mimeType, webViewLink, iconLink, modifiedTime, size'
      });

      return {
        type: 'drive',
        fileId: response.result.id,
        name: response.result.name,
        mimeType: response.result.mimeType,
        webViewLink: response.result.webViewLink,
        iconUrl: response.result.iconLink,
        lastModified: response.result.modifiedTime,
        sizeBytes: response.result.size
      };
    } catch (error) {
      console.error('Error getting Drive file metadata:', error);
      throw error;
    }
  }

  // ==========================================
  // Gmail Integration
  // ==========================================

  /**
   * Send email via Gmail API
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email
   * @param {string} options.subject - Email subject
   * @param {string} options.body - Email body (plain text or HTML)
   * @param {string} options.replyToMessageId - Optional message ID for threading
   * @param {string} options.threadId - Optional thread ID for replies
   * @returns {Promise<Object>} Sent message info
   */
  async sendEmail({ to, subject, body, replyToMessageId, threadId }) {
    if (!this.gmailConnected || !this.accessToken) {
      throw new Error('Gmail not connected');
    }

    try {
      // Build email headers
      const headers = [
        `To: ${to}`,
        `Subject: ${subject}`,
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0'
      ];

      // Add threading headers if replying
      if (replyToMessageId) {
        headers.push(`In-Reply-To: ${replyToMessageId}`);
        headers.push(`References: ${replyToMessageId}`);
      }

      // Build the raw email
      const email = headers.join('\r\n') + '\r\n\r\n' + body;

      // Encode to base64url
      const encodedEmail = btoa(unescape(encodeURIComponent(email)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      // Send via Gmail API
      const request = {
        userId: 'me',
        resource: {
          raw: encodedEmail
        }
      };

      // Add thread ID if replying
      if (threadId) {
        request.resource.threadId = threadId;
      }

      const response = await gapi.client.gmail.users.messages.send(request);

      return {
        messageId: response.result.id,
        threadId: response.result.threadId,
        labelIds: response.result.labelIds
      };
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  /**
   * Get Gmail labels
   * @returns {Promise<Array>} List of labels
   */
  async getGmailLabels() {
    if (!this.gmailConnected || !this.accessToken) {
      throw new Error('Gmail not connected');
    }

    try {
      const response = await gapi.client.gmail.users.labels.list({
        userId: 'me'
      });

      return response.result.labels.map(label => ({
        id: label.id,
        name: label.name,
        type: label.type,
        messagesTotal: label.messagesTotal,
        messagesUnread: label.messagesUnread
      }));
    } catch (error) {
      console.error('Error getting Gmail labels:', error);
      throw error;
    }
  }

  /**
   * Get emails from a label
   * @param {string} labelId - Label ID to fetch from
   * @param {number} maxResults - Maximum emails to return
   * @returns {Promise<Array>} List of emails
   */
  async getEmailsFromLabel(labelId, maxResults = 20) {
    if (!this.gmailConnected || !this.accessToken) {
      throw new Error('Gmail not connected');
    }

    try {
      // Get message IDs
      const listResponse = await gapi.client.gmail.users.messages.list({
        userId: 'me',
        labelIds: [labelId],
        maxResults: maxResults
      });

      if (!listResponse.result.messages) {
        return [];
      }

      // Fetch full message details
      const emails = await Promise.all(
        listResponse.result.messages.map(msg => this.getEmailDetails(msg.id))
      );

      return emails;
    } catch (error) {
      console.error('Error getting emails from label:', error);
      throw error;
    }
  }

  /**
   * Get email details
   * @param {string} messageId - Message ID
   * @returns {Promise<Object>} Email details
   */
  async getEmailDetails(messageId) {
    try {
      const response = await gapi.client.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date']
      });

      const headers = response.result.payload.headers;
      const getHeader = (name) => {
        const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
        return header ? header.value : '';
      };

      return {
        id: response.result.id,
        threadId: response.result.threadId,
        snippet: response.result.snippet,
        from: getHeader('From'),
        to: getHeader('To'),
        subject: getHeader('Subject'),
        date: getHeader('Date'),
        labelIds: response.result.labelIds
      };
    } catch (error) {
      console.error('Error getting email details:', error);
      throw error;
    }
  }

  /**
   * Check for replies in a thread
   * @param {string} threadId - Thread ID to check
   * @param {string} lastCheckedMessageId - Last known message ID in thread
   * @returns {Promise<Object>} Reply status
   */
  async checkForReplies(threadId, lastCheckedMessageId) {
    if (!this.gmailConnected || !this.accessToken) {
      return { hasNewReply: false };
    }

    try {
      const response = await gapi.client.gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date']
      });

      const messages = response.result.messages || [];

      // Check if there are new messages after the last checked one
      const lastCheckedIndex = messages.findIndex(m => m.id === lastCheckedMessageId);
      const newMessages = lastCheckedIndex >= 0
        ? messages.slice(lastCheckedIndex + 1)
        : messages.slice(1); // If not found, consider all but first as new

      if (newMessages.length > 0) {
        const latestReply = newMessages[newMessages.length - 1];
        const headers = latestReply.payload.headers;
        const getHeader = (name) => {
          const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
          return header ? header.value : '';
        };

        return {
          hasNewReply: true,
          latestReplyId: latestReply.id,
          replyFrom: getHeader('From'),
          replyDate: getHeader('Date'),
          replySnippet: latestReply.snippet,
          totalReplies: newMessages.length
        };
      }

      return { hasNewReply: false };
    } catch (error) {
      console.error('Error checking for replies:', error);
      return { hasNewReply: false, error: error.message };
    }
  }

  /**
   * Import email as inbox item
   * @param {Object} email - Email object from getEmailDetails
   * @returns {Object} Formatted inbox item
   */
  formatEmailAsInboxItem(email) {
    // Extract sender name from email format "Name <email@example.com>"
    const fromMatch = email.from.match(/^(.+?)\s*<.+>$/);
    const senderName = fromMatch ? fromMatch[1].trim() : email.from;

    return {
      text: email.subject || '(No Subject)',
      notes: `From: ${email.from}\nDate: ${email.date}\n\n${email.snippet}`,
      source: 'gmail',
      sourceId: email.id,
      threadId: email.threadId,
      capturedAt: new Date().toISOString(),
      metadata: {
        type: 'email',
        from: email.from,
        senderName: senderName,
        originalDate: email.date
      }
    };
  }

  // ==========================================
  // Google Calendar Integration
  // ==========================================

  /**
   * Connect Google Calendar
   */
  async connectCalendar() {
    try {
      await this.requestAccessToken([
        this.SCOPES.calendar,
        this.SCOPES.calendar_events
      ]);

      // Load the Calendar API discovery document
      await gapi.client.load('calendar', 'v3');

      this.calendarConnected = true;

      // Fetch calendar list on connect
      await this.fetchCalendarList();

      // Save connection status
      await this.saveConnectionStatus();

      return true;
    } catch (error) {
      console.error('Error connecting Google Calendar:', error);
      throw error;
    }
  }

  /**
   * Disconnect Google Calendar only
   */
  async disconnectCalendar() {
    this.calendarConnected = false;
    this.calendarList = [];
    await this.saveConnectionStatus();
  }

  /**
   * Check if Calendar is connected
   */
  isCalendarConnected() {
    return this.calendarConnected && this.accessToken;
  }

  /**
   * Update calendar settings
   */
  async updateCalendarSettings(newSettings) {
    this.calendarSettings = { ...this.calendarSettings, ...newSettings };
    await this.saveConnectionStatus();
  }

  /**
   * Fetch user's calendar list
   */
  async fetchCalendarList() {
    if (!this.calendarConnected || !this.accessToken) {
      return [];
    }

    try {
      // Ensure Calendar API is loaded
      if (!gapi.client.calendar) {
        await gapi.client.load('calendar', 'v3');
      }

      const response = await gapi.client.calendar.calendarList.list({
        minAccessRole: 'reader'
      });

      this.calendarList = (response.result.items || []).map(cal => ({
        id: cal.id,
        summary: cal.summary,
        description: cal.description,
        backgroundColor: cal.backgroundColor,
        foregroundColor: cal.foregroundColor,
        primary: cal.primary || false,
        accessRole: cal.accessRole
      }));

      return this.calendarList;
    } catch (error) {
      console.error('Error fetching calendar list:', error);
      return [];
    }
  }

  /**
   * Get calendar list (cached)
   */
  getCalendarList() {
    return this.calendarList;
  }

  /**
   * Get events for a date range
   * @param {Date} startDate - Start of range
   * @param {Date} endDate - End of range
   * @param {Array} calendarIds - Optional specific calendars (defaults to selected)
   * @returns {Promise<Array>} List of events
   */
  async getCalendarEvents(startDate, endDate, calendarIds = null) {
    if (!this.calendarConnected || !this.accessToken) {
      return [];
    }

    const selectedCalendars = calendarIds || this.calendarSettings.selectedCalendars || ['primary'];
    const timeMin = startDate.toISOString();
    const timeMax = endDate.toISOString();
    const allEvents = [];

    for (const calendarId of selectedCalendars) {
      try {
        const response = await gapi.client.calendar.events.list({
          calendarId: calendarId,
          timeMin: timeMin,
          timeMax: timeMax,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 100
        });

        for (const event of (response.result.items || [])) {
          allEvents.push({
            id: event.id,
            calendarId: calendarId,
            title: event.summary || '(No title)',
            description: event.description,
            start: event.start.dateTime || event.start.date,
            end: event.end.dateTime || event.end.date,
            location: event.location,
            isAllDay: !event.start.dateTime,
            isFocusTime: event.summary?.includes('[Focus]') || event.eventType === 'focusTime',
            colorId: event.colorId,
            htmlLink: event.htmlLink,
            attendees: event.attendees,
            status: event.status
          });
        }
      } catch (error) {
        console.error(`Error fetching calendar ${calendarId}:`, error);
      }
    }

    // Sort by start time
    return allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));
  }

  /**
   * Get today's events
   */
  async getTodayEvents() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.getCalendarEvents(today, tomorrow);
  }

  /**
   * Get events for the next N days
   */
  async getUpcomingEvents(days = 14) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + days);
    return this.getCalendarEvents(today, endDate);
  }

  /**
   * Create a calendar event
   * @param {Object} eventData - Event details
   * @returns {Promise<Object>} Created event
   */
  async createCalendarEvent(eventData) {
    if (!this.calendarConnected || !this.accessToken) {
      throw new Error('Calendar not connected');
    }

    const event = {
      summary: eventData.title,
      description: eventData.description || '',
      location: eventData.location,
      colorId: eventData.colorId
    };

    // Handle all-day vs timed events
    if (eventData.isAllDay) {
      event.start = { date: eventData.startDate };
      event.end = { date: eventData.endDate || eventData.startDate };
    } else {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      event.start = { dateTime: eventData.startDateTime, timeZone };
      event.end = { dateTime: eventData.endDateTime, timeZone };
    }

    // Add reminders if specified
    if (eventData.reminders) {
      event.reminders = eventData.reminders;
    }

    const calendarId = eventData.calendarId || 'primary';

    try {
      const response = await gapi.client.calendar.events.insert({
        calendarId: calendarId,
        resource: event
      });

      return {
        id: response.result.id,
        calendarId: calendarId,
        htmlLink: response.result.htmlLink,
        ...response.result
      };
    } catch (error) {
      console.error('Error creating calendar event:', error);
      throw error;
    }
  }

  /**
   * Update a calendar event
   */
  async updateCalendarEvent(calendarId, eventId, eventData) {
    if (!this.calendarConnected || !this.accessToken) {
      throw new Error('Calendar not connected');
    }

    const event = {};
    if (eventData.title) event.summary = eventData.title;
    if (eventData.description !== undefined) event.description = eventData.description;
    if (eventData.location !== undefined) event.location = eventData.location;

    if (eventData.isAllDay) {
      event.start = { date: eventData.startDate };
      event.end = { date: eventData.endDate || eventData.startDate };
    } else if (eventData.startDateTime) {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      event.start = { dateTime: eventData.startDateTime, timeZone };
      event.end = { dateTime: eventData.endDateTime, timeZone };
    }

    try {
      const response = await gapi.client.calendar.events.patch({
        calendarId: calendarId,
        eventId: eventId,
        resource: event
      });
      return response.result;
    } catch (error) {
      console.error('Error updating calendar event:', error);
      throw error;
    }
  }

  /**
   * Delete a calendar event
   */
  async deleteCalendarEvent(calendarId, eventId) {
    if (!this.calendarConnected || !this.accessToken) {
      throw new Error('Calendar not connected');
    }

    try {
      await gapi.client.calendar.events.delete({
        calendarId: calendarId,
        eventId: eventId
      });
      return true;
    } catch (error) {
      console.error('Error deleting calendar event:', error);
      throw error;
    }
  }

  /**
   * Get free/busy information
   * @param {Date} startDate - Start of range
   * @param {Date} endDate - End of range
   * @param {Array} calendarIds - Calendars to check
   * @returns {Promise<Object>} Free/busy data
   */
  async getFreeBusy(startDate, endDate, calendarIds = ['primary']) {
    if (!this.calendarConnected || !this.accessToken) {
      return { calendars: {} };
    }

    try {
      const response = await gapi.client.calendar.freebusy.query({
        resource: {
          timeMin: startDate.toISOString(),
          timeMax: endDate.toISOString(),
          items: calendarIds.map(id => ({ id }))
        }
      });

      return response.result;
    } catch (error) {
      console.error('Error getting free/busy:', error);
      return { calendars: {} };
    }
  }

  /**
   * Get availability slots for a day
   * @param {Date} date - The date to check
   * @returns {Promise<Array>} List of free and busy slots
   */
  async getAvailabilityForDay(date) {
    const dayStart = new Date(date);
    dayStart.setHours(8, 0, 0, 0); // Start at 8 AM
    const dayEnd = new Date(date);
    dayEnd.setHours(18, 0, 0, 0); // End at 6 PM

    const freeBusy = await this.getFreeBusy(dayStart, dayEnd);
    const busyPeriods = freeBusy.calendars?.primary?.busy || [];

    const slots = [];
    let currentTime = new Date(dayStart);

    for (const busy of busyPeriods) {
      const busyStart = new Date(busy.start);
      const busyEnd = new Date(busy.end);

      // Free slot before this busy period
      if (currentTime < busyStart) {
        slots.push({
          type: 'free',
          start: new Date(currentTime),
          end: busyStart,
          durationMinutes: (busyStart - currentTime) / 60000
        });
      }

      // Busy slot
      slots.push({
        type: 'busy',
        start: busyStart,
        end: busyEnd,
        durationMinutes: (busyEnd - busyStart) / 60000
      });

      currentTime = busyEnd;
    }

    // Free slot after last busy period
    if (currentTime < dayEnd) {
      slots.push({
        type: 'free',
        start: new Date(currentTime),
        end: dayEnd,
        durationMinutes: (dayEnd - currentTime) / 60000
      });
    }

    return slots;
  }

  /**
   * Find next available slot for focus time
   * @param {number} duration - Duration in minutes
   * @param {Date} startFrom - Start searching from
   * @returns {Promise<Date>} Start time of next available slot
   */
  async findNextAvailableSlot(duration, startFrom = new Date()) {
    const searchEnd = new Date(startFrom);
    searchEnd.setDate(searchEnd.getDate() + 7); // Search next 7 days

    const freeBusy = await this.getFreeBusy(startFrom, searchEnd);
    const busyPeriods = freeBusy.calendars?.primary?.busy || [];

    // Round up to next 30 min
    let slotStart = new Date(startFrom);
    slotStart.setMinutes(Math.ceil(slotStart.getMinutes() / 30) * 30);
    slotStart.setSeconds(0);
    slotStart.setMilliseconds(0);

    for (const busy of busyPeriods) {
      const busyStart = new Date(busy.start);
      const busyEnd = new Date(busy.end);

      // Check if there's enough time before this busy period
      const gapMinutes = (busyStart - slotStart) / 60000;
      if (gapMinutes >= duration) {
        return slotStart; // Found a slot
      }

      // Move to after this busy period
      slotStart = new Date(busyEnd);
      slotStart.setMinutes(Math.ceil(slotStart.getMinutes() / 30) * 30);
    }

    return slotStart; // Return first available after all busy periods
  }

  /**
   * Block focus time on calendar
   * @param {Object} options - Focus time options
   * @returns {Promise<Object>} Created event
   */
  async blockFocusTime(options) {
    const {
      title,
      actionId,
      startDateTime,
      duration, // in minutes
      calendarId = 'primary'
    } = options;

    const endDateTime = new Date(new Date(startDateTime).getTime() + duration * 60000);

    const event = await this.createCalendarEvent({
      title: `[Focus] ${title}`,
      description: actionId
        ? `GTD Focus Time\nAction: ${title}\nAction ID: ${actionId}`
        : `GTD Focus Time\n${title}`,
      startDateTime: startDateTime instanceof Date ? startDateTime.toISOString() : startDateTime,
      endDateTime: endDateTime.toISOString(),
      calendarId: calendarId,
      colorId: '5', // Yellow for focus time
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 10 }
        ]
      }
    });

    return event;
  }

  /**
   * Create calendar event for project deadline
   */
  async createProjectDeadlineEvent(project) {
    if (!this.calendarSettings.syncProjectDeadlines || !project.deadline) {
      return null;
    }

    return this.createCalendarEvent({
      title: `Deadline: ${project.name}`,
      description: `GTD Project Deadline\nProject: ${project.name}\n${project.description || ''}`,
      isAllDay: true,
      startDate: project.deadline,
      calendarId: 'primary',
      colorId: '11' // Red for deadlines
    });
  }

  /**
   * Create calendar event for action with due date
   */
  async createActionEvent(action) {
    if (!this.calendarSettings.createEventsForActions || !action.dueDate) {
      return null;
    }

    // If due date has time, create timed event; otherwise all-day
    const hasTime = action.dueDate.includes('T');

    if (hasTime) {
      const dueDateTime = new Date(action.dueDate);
      const endDateTime = new Date(dueDateTime.getTime() + 30 * 60000); // 30 min default

      return this.createCalendarEvent({
        title: action.action,
        description: `GTD Action\n${action.notes || ''}`,
        startDateTime: dueDateTime.toISOString(),
        endDateTime: endDateTime.toISOString(),
        calendarId: 'primary',
        colorId: '9' // Blue for actions
      });
    } else {
      return this.createCalendarEvent({
        title: action.action,
        description: `GTD Action\n${action.notes || ''}`,
        isAllDay: true,
        startDate: action.dueDate,
        calendarId: 'primary',
        colorId: '9'
      });
    }
  }

  /**
   * Format time for display
   */
  formatTime(date) {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  /**
   * Format date for calendar API
   */
  formatDateForCalendar(date) {
    if (typeof date === 'string') {
      return date.split('T')[0];
    }
    return date.toISOString().split('T')[0];
  }
}

// Create global instance
const googleIntegration = new GoogleIntegration();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GoogleIntegration;
}
