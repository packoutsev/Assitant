// ============================================================================
// AI-CHAT.JS
// GTD Capture - AI Chat Panel UI
// ============================================================================

// ============================================================================
// CHAT PANEL STATE
// ============================================================================

let chatPanelOpen = false;
let chatInitialized = false;

// ============================================================================
// RENDER CHAT PANEL
// ============================================================================

function renderChatPanel() {
  return `
    <div class="chat-panel" id="chatPanel">
      <div class="chat-header">
        <div class="chat-header-left">
          <span class="chat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10a10 10 0 0 1-4.83-1.24L2 22l1.24-5.17A10 10 0 0 1 12 2z"/>
              <circle cx="12" cy="12" r="1"/>
              <circle cx="8" cy="12" r="1"/>
              <circle cx="16" cy="12" r="1"/>
            </svg>
          </span>
          <span class="chat-title">GTD Assistant</span>
        </div>
        <div class="chat-header-right">
          <button class="chat-header-btn" onclick="clearChatUI()" title="New conversation">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
          <button class="chat-header-btn" onclick="toggleChat()" title="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="chat-messages" id="chatMessages">
        <!-- Messages rendered here -->
      </div>

      <div class="chat-input-container">
        <div class="chat-input-wrapper">
          <input
            type="text"
            class="chat-input"
            id="chatInput"
            placeholder="Ask me anything..."
            onkeydown="handleChatKeydown(event)"
          />
          <button onclick="sendChat()" class="btn btn-primary chat-send-btn" id="chatSendBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
          </button>
        </div>
        <div class="quick-actions">
          <button class="quick-action-btn" onclick="sendQuickChat('What should I focus on?')">
            Focus?
          </button>
          <button class="quick-action-btn" onclick="sendQuickChat('What am I waiting on?')">
            Waiting?
          </button>
          <button class="quick-action-btn" onclick="sendQuickChat('Process my inbox')">
            Process
          </button>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// CHAT PANEL CONTROL
// ============================================================================

function initChatPanel() {
  // Add chat panel to body if not exists
  if (!document.getElementById('chatPanel')) {
    const panelContainer = document.createElement('div');
    panelContainer.innerHTML = renderChatPanel();
    document.body.appendChild(panelContainer.firstElementChild);
  }
}

function toggleChat() {
  const panel = document.getElementById('chatPanel');
  if (!panel) {
    initChatPanel();
  }

  chatPanelOpen = !chatPanelOpen;
  document.getElementById('chatPanel').classList.toggle('open', chatPanelOpen);

  if (chatPanelOpen) {
    // Focus input
    setTimeout(() => {
      document.getElementById('chatInput')?.focus();
    }, 300);

    // Send initial greeting if first time
    if (!chatInitialized) {
      chatInitialized = true;
      sendInitialGreeting();
    }
  }
}

function closeChat() {
  chatPanelOpen = false;
  document.getElementById('chatPanel')?.classList.remove('open');
}

function openChat() {
  if (!chatPanelOpen) {
    toggleChat();
  }
}

// ============================================================================
// CHAT MESSAGING
// ============================================================================

async function sendChat() {
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');
  const message = input.value.trim();

  if (!message) return;

  input.value = '';
  input.disabled = true;
  sendBtn.disabled = true;

  // Check for inline correction before adding message
  if (detectInlineCorrection(message)) {
    recordInlineCorrection(message);
  }

  addMessageToUI('user', message);
  addTypingIndicator();

  try {
    const response = await window.aiService.sendChatMessage(message);
    removeTypingIndicator();
    addMessageToUI('assistant', response.message, response.toolResults);
  } catch (error) {
    removeTypingIndicator();
    addMessageToUI('assistant', `Sorry, I encountered an error: ${error.message}`);
  } finally {
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

function sendQuickChat(message) {
  const input = document.getElementById('chatInput');
  if (input) {
    input.value = message;
    sendChat();
  }
}

function handleChatKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendChat();
  }
}

async function sendInitialGreeting() {
  addTypingIndicator();

  try {
    const context = await window.aiService.buildUserContext();

    let greeting = `Hi${typeof app !== 'undefined' && app.currentUser?.displayName ? ' ' + app.currentUser.displayName.split(' ')[0] : ''}! `;

    if (context.summary.inboxCount > 0 || context.summary.overdueCount > 0) {
      const parts = [];
      if (context.summary.inboxCount > 0) {
        parts.push(`${context.summary.inboxCount} item${context.summary.inboxCount > 1 ? 's' : ''} in your inbox`);
      }
      if (context.summary.overdueCount > 0) {
        parts.push(`${context.summary.overdueCount} overdue action${context.summary.overdueCount > 1 ? 's' : ''}`);
      }
      greeting += `You have ${parts.join(' and ')}. `;
    }

    greeting += 'How can I help?';

    removeTypingIndicator();
    addMessageToUI('assistant', greeting);
  } catch (error) {
    removeTypingIndicator();
    addMessageToUI('assistant', 'Hi! I\'m your GTD Assistant. How can I help you today?');
  }
}

// ============================================================================
// UI HELPERS
// ============================================================================

// Track message IDs for feedback
let messageIdCounter = 0;
let lastAssistantMessageId = null;
let lastAssistantContent = null;

function addMessageToUI(role, content, toolResults = []) {
  const messagesContainer = document.getElementById('chatMessages');
  if (!messagesContainer) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${role}`;

  // Generate message ID for assistant messages (for feedback tracking)
  const messageId = role === 'assistant' ? `chat-msg-${++messageIdCounter}` : null;
  if (messageId) {
    messageDiv.setAttribute('data-message-id', messageId);
    lastAssistantMessageId = messageId;
    lastAssistantContent = content;
  }

  let html = `<div class="message-content">${formatMessageContent(content)}</div>`;

  // Add action buttons if there are actionable results
  if (toolResults.some(tr => tr.result?.draft)) {
    const draft = toolResults.find(tr => tr.result?.draft).result.draft;
    html += `
      <div class="message-actions">
        <button class="btn btn-secondary btn-small" onclick="openEmailDraft('${encodeURIComponent(JSON.stringify(draft))}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          Review Email Draft
        </button>
      </div>
    `;
  }

  // Add tool result indicators
  if (toolResults.length > 0) {
    const successResults = toolResults.filter(tr => tr.result?.success);
    if (successResults.length > 0) {
      html += `<div class="tool-indicators">`;
      for (const tr of successResults) {
        const icon = getToolIcon(tr.tool);
        html += `<span class="tool-indicator" title="${tr.result.message || tr.tool}">${icon}</span>`;
      }
      html += `</div>`;
    }
  }

  // Add feedback buttons for assistant messages
  if (role === 'assistant' && content && !content.includes('encountered an error')) {
    html += `
      <div class="chat-feedback-row" data-msg-id="${messageId}">
        <button class="btn-chat-feedback" onclick="recordChatFeedback('${messageId}', true)" title="Helpful">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
          </svg>
        </button>
        <button class="btn-chat-feedback" onclick="recordChatFeedback('${messageId}', false)" title="Not helpful">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
          </svg>
        </button>
      </div>
    `;
  }

  messageDiv.innerHTML = html;
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function getToolIcon(toolName) {
  const icons = {
    'capture_to_inbox': '📥',
    'create_action': '✅',
    'search_gtd': '🔍',
    'get_focus_suggestions': '🎯',
    'get_waiting_for': '⏳',
    'delegate_action': '👥',
    'draft_email': '📧',
    'get_project_status': '📊'
  };
  return icons[toolName] || '✨';
}

function formatMessageContent(content) {
  if (!content) return '';

  // Escape HTML first
  let formatted = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Convert markdown-like formatting to HTML
  formatted = formatted
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
    .replace(/^(\d+)\.\s/gm, '<span class="list-number">$1.</span> ')
    .replace(/^-\s/gm, '<span class="list-bullet">•</span> ');

  return formatted;
}

function addTypingIndicator() {
  const messagesContainer = document.getElementById('chatMessages');
  if (!messagesContainer) return;

  // Remove existing indicator
  removeTypingIndicator();

  const indicator = document.createElement('div');
  indicator.className = 'chat-message assistant typing-indicator';
  indicator.id = 'typingIndicator';
  indicator.innerHTML = `
    <div class="typing-dots">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;
  messagesContainer.appendChild(indicator);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function removeTypingIndicator() {
  const indicator = document.getElementById('typingIndicator');
  if (indicator) {
    indicator.remove();
  }
}

function clearChatUI() {
  const messagesContainer = document.getElementById('chatMessages');
  if (messagesContainer) {
    messagesContainer.innerHTML = '';
  }

  // Clear history in service
  if (window.aiService) {
    window.aiService.clearChatHistory();
  }

  chatInitialized = false;
  sendInitialGreeting();
}

function openEmailDraft(encodedDraft) {
  try {
    const draft = JSON.parse(decodeURIComponent(encodedDraft));
    showEmailDraftModal(draft);
  } catch (error) {
    console.error('Error opening email draft:', error);
  }
}

function showEmailDraftModal(draft) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay active';
  modal.id = 'emailDraftModal';
  modal.innerHTML = `
    <div class="modal email-draft-modal">
      <div class="modal-header">
        <h2>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          Email Draft
        </h2>
        <button class="modal-close" onclick="closeEmailDraftModal()">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>To:</label>
          <input type="text" id="draftTo" value="${escapeHtml(draft.to)}" class="form-input">
        </div>
        <div class="form-group">
          <label>Subject:</label>
          <input type="text" id="draftSubject" value="${escapeHtml(draft.subject)}" class="form-input">
        </div>
        <div class="form-group">
          <label>Message:</label>
          <textarea id="draftBody" class="form-textarea" rows="8">${escapeHtml(draft.body)}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeEmailDraftModal()">Cancel</button>
        <button class="btn btn-secondary" onclick="copyEmailDraft()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copy to Clipboard
        </button>
        <button class="btn btn-primary" onclick="openInEmailClient()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
          </svg>
          Open in Email
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function closeEmailDraftModal() {
  const modal = document.getElementById('emailDraftModal');
  if (modal) modal.remove();
}

function copyEmailDraft() {
  const to = document.getElementById('draftTo').value;
  const subject = document.getElementById('draftSubject').value;
  const body = document.getElementById('draftBody').value;

  const text = `To: ${to}\nSubject: ${subject}\n\n${body}`;

  navigator.clipboard.writeText(text).then(() => {
    if (typeof showToast === 'function') {
      showToast('Email copied to clipboard!', 'success');
    }
  }).catch(err => {
    console.error('Failed to copy:', err);
  });
}

function openInEmailClient() {
  const to = document.getElementById('draftTo').value;
  const subject = document.getElementById('draftSubject').value;
  const body = document.getElementById('draftBody').value;

  const mailtoLink = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.open(mailtoLink, '_blank');
  closeEmailDraftModal();
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// KEYBOARD SHORTCUT
// ============================================================================

function initChatKeyboardShortcut() {
  document.addEventListener('keydown', (e) => {
    // Cmd/Ctrl + J to toggle chat
    if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
      e.preventDefault();
      toggleChat();
    }

    // Escape to close chat
    if (e.key === 'Escape' && chatPanelOpen) {
      closeChat();
    }
  });
}

// ============================================================================
// HEADER BUTTON
// ============================================================================

function addChatButtonToHeader() {
  // Find the header actions area
  const userMenu = document.querySelector('.user-menu') || document.querySelector('.header-actions');
  if (!userMenu) return;

  // Check if button already exists
  if (document.getElementById('aiChatBtn')) return;

  const chatBtn = document.createElement('button');
  chatBtn.id = 'aiChatBtn';
  chatBtn.className = 'btn-icon header-btn ai-chat-btn';
  chatBtn.title = 'AI Assistant (Cmd+J)';
  chatBtn.onclick = toggleChat;
  chatBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
      <path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10a10 10 0 0 1-4.83-1.24L2 22l1.24-5.17A10 10 0 0 1 12 2z"/>
      <circle cx="12" cy="12" r="1"/>
      <circle cx="8" cy="12" r="1"/>
      <circle cx="16" cy="12" r="1"/>
    </svg>
  `;

  userMenu.insertBefore(chatBtn, userMenu.firstChild);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function initAIChat() {
  initChatPanel();
  initChatKeyboardShortcut();

  // Add button after a short delay to ensure header is rendered
  setTimeout(addChatButtonToHeader, 500);

  console.log('AI Chat initialized');
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAIChat);
} else {
  initAIChat();
}

// ============================================================================
// EXPORTS
// ============================================================================

// ============================================================================
// CHAT FEEDBACK
// ============================================================================

async function recordChatFeedback(messageId, helpful) {
  try {
    // Find the feedback row and mark as submitted
    const feedbackRow = document.querySelector(`.chat-feedback-row[data-msg-id="${messageId}"]`);
    if (feedbackRow) {
      feedbackRow.innerHTML = `<span class="chat-feedback-thanks">${helpful ? 'Thanks!' : 'Noted'}</span>`;
      feedbackRow.classList.add('submitted');
    }

    // Record feedback to service
    if (window.aiService && window.aiService.recordChatFeedback) {
      await window.aiService.recordChatFeedback({
        messageId,
        helpful,
        timestamp: Date.now(),
        context: 'chat'
      });
    }
  } catch (error) {
    console.error('Failed to record chat feedback:', error);
  }
}

// Detect inline corrections in user messages
function detectInlineCorrection(userMessage) {
  // Patterns that suggest a correction
  const correctionPatterns = [
    /^no,?\s+(.+)/i,           // "No, I meant..."
    /^actually,?\s+(.+)/i,     // "Actually, it should be..."
    /^not\s+(.+)/i,            // "Not X, but Y"
    /^i\s+meant\s+(.+)/i,      // "I meant..."
    /^that's\s+wrong/i,        // "That's wrong"
    /^incorrect/i,             // "Incorrect"
    /should\s+be\s+(.+)/i,     // "should be X"
    /^instead,?\s+(.+)/i,      // "Instead, ..."
    /^wrong[.,]?\s*(.+)?/i     // "Wrong, ..."
  ];

  for (const pattern of correctionPatterns) {
    if (pattern.test(userMessage)) {
      return true;
    }
  }
  return false;
}

// Record inline correction for learning
async function recordInlineCorrection(userMessage) {
  if (!lastAssistantContent || !window.aiService) return;

  try {
    await window.aiService.recordChatFeedback({
      messageId: lastAssistantMessageId,
      helpful: false,
      correction: userMessage,
      originalResponse: lastAssistantContent,
      timestamp: Date.now(),
      context: 'inline_correction'
    });
  } catch (error) {
    console.error('Failed to record inline correction:', error);
  }
}

window.toggleChat = toggleChat;
window.closeChat = closeChat;
window.openChat = openChat;
window.sendChat = sendChat;
window.sendQuickChat = sendQuickChat;
window.handleChatKeydown = handleChatKeydown;
window.clearChatUI = clearChatUI;
window.openEmailDraft = openEmailDraft;
window.closeEmailDraftModal = closeEmailDraftModal;
window.copyEmailDraft = copyEmailDraft;
window.openInEmailClient = openInEmailClient;
window.recordChatFeedback = recordChatFeedback;
