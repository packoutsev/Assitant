// =====================================================
// EVERNOTE-STYLE FEATURES
// =====================================================

// =====================================================
// MARKDOWN PARSER & RENDERER
// =====================================================

const MarkdownParser = {
  // Parse markdown to HTML
  parse: function(text) {
    if (!text) return '';

    let html = text;

    // Escape HTML first
    html = html.replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;');

    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(match, lang, code) {
      return '<pre class="code-block" data-lang="' + lang + '"><code>' + code.trim() + '</code></pre>';
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');

    // Strikethrough
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // Checkboxes
    html = html.replace(/^\s*\[x\]\s*(.+)$/gm, '<div class="md-checkbox checked"><input type="checkbox" checked onclick="app.toggleMdCheckbox(this)"> <span>$1</span></div>');
    html = html.replace(/^\s*\[\s?\]\s*(.+)$/gm, '<div class="md-checkbox"><input type="checkbox" onclick="app.toggleMdCheckbox(this)"> <span>$1</span></div>');

    // Unordered lists
    html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');

    // Blockquotes
    html = html.replace(/^>\s*(.+)$/gm, '<blockquote>$1</blockquote>');

    // Horizontal rule
    html = html.replace(/^---$/gm, '<hr>');

    // Links [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Internal links [[Note Name]]
    html = html.replace(/\[\[([^\]]+)\]\]/g, '<a href="#" class="internal-link" data-note="$1">$1</a>');

    // Wrap lists
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    html = html.replace(/<\/ul>\s*<ul>/g, '');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
  }
};

window.MarkdownParser = MarkdownParser;

// =====================================================
// RICH TEXT EDITOR COMPONENT
// =====================================================

GTDApp.prototype.createRichEditor = function(containerId, initialContent, options) {
  initialContent = initialContent || '';
  options = options || {};

  const container = document.getElementById(containerId);
  if (!container) return null;

  const editorId = 'editor_' + Date.now();

  container.innerHTML =
    '<div class="rich-editor" id="' + editorId + '">' +
      '<div class="editor-toolbar">' +
        '<button type="button" class="toolbar-btn" data-action="bold" title="Bold"><strong>B</strong></button>' +
        '<button type="button" class="toolbar-btn" data-action="italic" title="Italic"><em>I</em></button>' +
        '<button type="button" class="toolbar-btn" data-action="strikethrough" title="Strikethrough"><del>S</del></button>' +
        '<span class="toolbar-divider"></span>' +
        '<button type="button" class="toolbar-btn" data-action="h1" title="Heading 1">H1</button>' +
        '<button type="button" class="toolbar-btn" data-action="h2" title="Heading 2">H2</button>' +
        '<button type="button" class="toolbar-btn" data-action="h3" title="Heading 3">H3</button>' +
        '<span class="toolbar-divider"></span>' +
        '<button type="button" class="toolbar-btn" data-action="ul" title="Bullet List">•</button>' +
        '<button type="button" class="toolbar-btn" data-action="checkbox" title="Checkbox">☑</button>' +
        '<span class="toolbar-divider"></span>' +
        '<button type="button" class="toolbar-btn" data-action="link" title="Link">🔗</button>' +
        '<button type="button" class="toolbar-btn" data-action="code" title="Code">&lt;/&gt;</button>' +
        '<button type="button" class="toolbar-btn" data-action="note-link" title="Link to Note">📄</button>' +
        '<span class="toolbar-divider"></span>' +
        '<button type="button" class="toolbar-btn" data-action="preview" title="Preview">👁</button>' +
      '</div>' +
      '<div class="editor-content">' +
        '<textarea class="editor-textarea" id="' + editorId + '_textarea" placeholder="Write something... Use **bold**, *italic*, # headers, - lists">' + this.escapeHtml(initialContent) + '</textarea>' +
        '<div class="editor-preview" id="' + editorId + '_preview" style="display: none;"></div>' +
      '</div>' +
    '</div>';

  const textarea = document.getElementById(editorId + '_textarea');
  const preview = document.getElementById(editorId + '_preview');
  const toolbar = container.querySelector('.editor-toolbar');
  let isPreview = false;
  const self = this;

  // Toolbar actions
  toolbar.addEventListener('click', function(e) {
    const btn = e.target.closest('.toolbar-btn');
    if (!btn) return;

    const action = btn.dataset.action;
    if (window.Haptic) Haptic.light();

    if (action === 'preview') {
      isPreview = !isPreview;
      if (isPreview) {
        preview.innerHTML = MarkdownParser.parse(textarea.value);
        preview.style.display = 'block';
        textarea.style.display = 'none';
        btn.classList.add('active');
      } else {
        preview.style.display = 'none';
        textarea.style.display = 'block';
        btn.classList.remove('active');
      }
      return;
    }

    // Insert formatting
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);

    let insert = '';
    let cursorOffset = 0;

    switch (action) {
      case 'bold':
        insert = '**' + (selected || 'bold text') + '**';
        cursorOffset = selected ? 0 : -2;
        break;
      case 'italic':
        insert = '*' + (selected || 'italic text') + '*';
        cursorOffset = selected ? 0 : -1;
        break;
      case 'strikethrough':
        insert = '~~' + (selected || 'strikethrough') + '~~';
        cursorOffset = selected ? 0 : -2;
        break;
      case 'h1':
        insert = '# ' + (selected || 'Heading 1');
        break;
      case 'h2':
        insert = '## ' + (selected || 'Heading 2');
        break;
      case 'h3':
        insert = '### ' + (selected || 'Heading 3');
        break;
      case 'ul':
        insert = '- ' + (selected || 'List item');
        break;
      case 'checkbox':
        insert = '[ ] ' + (selected || 'Task');
        break;
      case 'link':
        insert = '[' + (selected || 'link text') + '](url)';
        cursorOffset = selected ? -1 : -4;
        break;
      case 'code':
        if (selected && selected.includes('\n')) {
          insert = '```\n' + selected + '\n```';
        } else {
          insert = '`' + (selected || 'code') + '`';
          cursorOffset = selected ? 0 : -1;
        }
        break;
      case 'note-link':
        insert = '[[' + (selected || 'Note Name') + ']]';
        cursorOffset = selected ? 0 : -2;
        break;
    }

    textarea.value = text.substring(0, start) + insert + text.substring(end);
    textarea.focus();
    const newPos = start + insert.length + cursorOffset;
    textarea.setSelectionRange(newPos, newPos);
  });

  // Keyboard shortcuts
  textarea.addEventListener('keydown', function(e) {
    if (e.metaKey || e.ctrlKey) {
      if (e.key === 'b') {
        e.preventDefault();
        toolbar.querySelector('[data-action="bold"]').click();
      } else if (e.key === 'i') {
        e.preventDefault();
        toolbar.querySelector('[data-action="italic"]').click();
      } else if (e.key === 'k') {
        e.preventDefault();
        toolbar.querySelector('[data-action="link"]').click();
      }
    }
  });

  return {
    getValue: function() { return textarea.value; },
    setValue: function(val) { textarea.value = val; },
    getHTML: function() { return MarkdownParser.parse(textarea.value); },
    textarea: textarea
  };
};

// Toggle markdown checkbox
GTDApp.prototype.toggleMdCheckbox = function(checkbox) {
  const div = checkbox.closest('.md-checkbox');
  if (div) {
    div.classList.toggle('checked');
    if (window.Haptic) Haptic.light();
  }
};

// =====================================================
// WEB CLIPPER
// =====================================================

GTDApp.prototype.showWebClipper = async function() {
  const modal = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  modal.classList.add('active');

  content.innerHTML =
    '<div class="modal-header">' +
      '<h3>📎 Web Clipper</h3>' +
    '</div>' +
    '<div class="modal-body">' +
      '<div class="form-group">' +
        '<label>Paste a URL to clip</label>' +
        '<input type="url" id="clipperUrl" class="form-input" placeholder="https://example.com/article">' +
      '</div>' +
      '<div id="clipperPreview" style="display: none;">' +
        '<div class="clipper-card">' +
          '<img id="clipperImage" class="clipper-image" style="display: none;">' +
          '<div class="clipper-info">' +
            '<h4 id="clipperTitle">Loading...</h4>' +
            '<p id="clipperDesc"></p>' +
            '<span id="clipperDomain" class="clipper-domain"></span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="form-group" style="margin-top: 16px;">' +
        '<label>Add notes (optional)</label>' +
        '<textarea id="clipperNotes" class="form-input" rows="3" placeholder="Your notes about this page..."></textarea>' +
      '</div>' +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>' +
      '<button class="btn btn-primary" onclick="app.saveWebClip()" id="clipperSaveBtn" disabled>Save to Reference</button>' +
    '</div>';

  const urlInput = document.getElementById('clipperUrl');
  const preview = document.getElementById('clipperPreview');
  const saveBtn = document.getElementById('clipperSaveBtn');
  const self = this;

  // Debounced URL fetch
  let fetchTimeout;
  urlInput.addEventListener('input', function() {
    clearTimeout(fetchTimeout);
    const url = urlInput.value.trim();

    if (!url || !url.startsWith('http')) {
      preview.style.display = 'none';
      saveBtn.disabled = true;
      return;
    }

    fetchTimeout = setTimeout(function() {
      self.fetchUrlPreview(url);
    }, 500);
  });

  urlInput.focus();
};

GTDApp.prototype.fetchUrlPreview = async function(url) {
  const preview = document.getElementById('clipperPreview');
  const title = document.getElementById('clipperTitle');
  const desc = document.getElementById('clipperDesc');
  const domain = document.getElementById('clipperDomain');
  const image = document.getElementById('clipperImage');
  const saveBtn = document.getElementById('clipperSaveBtn');

  preview.style.display = 'block';
  title.textContent = 'Loading...';
  desc.textContent = '';
  image.style.display = 'none';

  try {
    // Extract domain
    const urlObj = new URL(url);
    domain.textContent = urlObj.hostname;

    // Try to fetch metadata (this may be blocked by CORS)
    // For now, use basic URL info
    title.textContent = urlObj.pathname.split('/').pop() || urlObj.hostname;
    desc.textContent = url;

    // Store URL data for saving
    this._clipperData = {
      url: url,
      title: title.textContent,
      description: url,
      domain: urlObj.hostname
    };

    saveBtn.disabled = false;
  } catch (e) {
    title.textContent = 'Invalid URL';
    saveBtn.disabled = true;
  }
};

GTDApp.prototype.saveWebClip = async function() {
  if (!this._clipperData) return;

  const notes = document.getElementById('clipperNotes').value.trim();
  const data = this._clipperData;

  const content = '## ' + data.title + '\n\n' +
    '🔗 [' + data.domain + '](' + data.url + ')\n\n' +
    (notes ? notes + '\n\n' : '') +
    '---\n*Clipped from ' + data.url + '*';

  try {
    await db.addToReference(data.title, content, null, ['#web-clip'], null);
    this.closeModal();
    this.showToast('Web clip saved!', 'success');

    if (this.currentView === 'reference') {
      await this.renderReferenceView();
    }
  } catch (e) {
    console.error('Failed to save web clip:', e);
    this.showToast('Failed to save', 'error');
  }
};

// =====================================================
// NOTE TEMPLATES
// =====================================================

GTDApp.prototype.noteTemplates = [
  {
    id: 'meeting',
    name: 'Meeting Notes',
    icon: '📋',
    content: '# Meeting Notes\n\n**Date:** ' + new Date().toLocaleDateString() + '\n**Attendees:** \n\n## Agenda\n- \n\n## Discussion\n\n\n## Action Items\n[ ] \n[ ] \n\n## Next Steps\n'
  },
  {
    id: 'one-on-one',
    name: '1:1 Meeting',
    icon: '👥',
    content: '# 1:1 with [Name]\n\n**Date:** ' + new Date().toLocaleDateString() + '\n\n## Check-in\n- How are you doing?\n- Any blockers?\n\n## Updates\n\n\n## Discussion Topics\n- \n\n## Action Items\n[ ] \n[ ] \n\n## Notes for Next Time\n'
  },
  {
    id: 'project',
    name: 'Project Brief',
    icon: '🎯',
    content: '# Project: [Name]\n\n## Overview\n\n\n## Goals\n- \n\n## Timeline\n- **Start:** \n- **End:** \n\n## Team\n- \n\n## Milestones\n[ ] \n[ ] \n\n## Resources\n- \n\n## Notes\n'
  },
  {
    id: 'daily',
    name: 'Daily Journal',
    icon: '📔',
    content: '# ' + new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + '\n\n## Gratitude\n- \n\n## Top 3 Priorities\n[ ] \n[ ] \n[ ] \n\n## Notes\n\n\n## Reflection\n'
  },
  {
    id: 'decision',
    name: 'Decision Log',
    icon: '⚖️',
    content: '# Decision: [Title]\n\n**Date:** ' + new Date().toLocaleDateString() + '\n**Decision Maker:** \n\n## Context\n\n\n## Options Considered\n1. \n2. \n3. \n\n## Decision\n\n\n## Rationale\n\n\n## Next Steps\n[ ] \n'
  },
  {
    id: 'person',
    name: 'Person Notes',
    icon: '🧑',
    content: '# [Name]\n\n**Role:** \n**Company:** \n**Email:** \n**Phone:** \n\n## Background\n\n\n## Interactions\n### ' + new Date().toLocaleDateString() + '\n- \n\n## Notes\n'
  }
];

GTDApp.prototype.showTemplatePickerInEditor = function(callback) {
  const templates = this.noteTemplates;

  let html = '<div class="template-picker">';
  templates.forEach(function(t) {
    html += '<div class="template-card" data-id="' + t.id + '">' +
      '<span class="template-icon">' + t.icon + '</span>' +
      '<span class="template-name">' + t.name + '</span>' +
    '</div>';
  });
  html += '</div>';

  const picker = document.createElement('div');
  picker.className = 'template-picker-modal';
  picker.innerHTML = '<div class="template-picker-content">' +
    '<h3>Choose a Template</h3>' +
    html +
    '<button class="btn btn-secondary" onclick="this.closest(\'.template-picker-modal\').remove()">Cancel</button>' +
  '</div>';

  const self = this;
  picker.addEventListener('click', function(e) {
    const card = e.target.closest('.template-card');
    if (card) {
      const template = templates.find(function(t) { return t.id === card.dataset.id; });
      if (template && callback) {
        callback(template.content);
      }
      picker.remove();
    }
  });

  document.body.appendChild(picker);
};

// =====================================================
// ENHANCED NEW REFERENCE MODAL WITH RICH EDITOR
// =====================================================

// Store original for later
const _originalShowNewReferenceModal = GTDApp.prototype.showNewReferenceModal;

GTDApp.prototype.showNewReferenceModalEnhanced = async function(preselectedFolderId) {
  const folders = await db.getReferenceFolders();
  const captureInput = document.getElementById('captureInput');
  const capturedText = captureInput ? captureInput.value.trim() : '';

  this.referenceTags = [];
  this.selectedReferenceFolder = preselectedFolderId || this.currentFolder || null;
  this._pendingAttachments = []; // Store attachments before saving

  if (capturedText && captureInput) {
    captureInput.value = '';
  }

  const modal = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  modal.classList.add('active');

  content.innerHTML =
    '<div class="modal-header">' +
      '<h3>New Reference</h3>' +
      '<div class="modal-header-actions">' +
        '<button class="btn btn-secondary btn-sm" onclick="app.showWebClipper()">📎 Web Clip</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="app.pickTemplate()">📋 Template</button>' +
      '</div>' +
    '</div>' +
    '<div class="modal-body" style="padding: 0;">' +
      '<div id="richEditorContainer"></div>' +
      '<div class="attachments-section">' +
        '<div class="attachments-header">' +
          '<span>Attachments</span>' +
          '<label class="btn btn-secondary btn-sm attachment-add-btn">' +
            '<input type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt" onchange="app.handleAttachmentUpload(event)" style="display:none;">' +
            '+ Add Files' +
          '</label>' +
        '</div>' +
        '<div id="attachmentGallery" class="attachment-gallery"></div>' +
      '</div>' +
      '<div class="folder-select-bar">' +
        '<span>Save to: </span>' +
        '<select id="quickFolderSelect" class="form-input" style="flex: 1;">' +
          '<option value="">Unfiled</option>' +
          folders.map(function(f) {
            return '<option value="' + f.id + '">' + (f.icon || '📁') + ' ' + f.name + '</option>';
          }).join('') +
        '</select>' +
      '</div>' +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>' +
      '<button class="btn btn-primary" onclick="app.saveEnhancedReference()">Save</button>' +
    '</div>';

  // Create rich editor
  this._richEditor = this.createRichEditor('richEditorContainer', capturedText);

  // Set folder if preselected
  if (preselectedFolderId) {
    document.getElementById('quickFolderSelect').value = preselectedFolderId;
  }
};

// Handle file uploads for attachments
GTDApp.prototype.handleAttachmentUpload = async function(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  for (const file of files) {
    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      this.showToast(file.name + ' is too large (max 10MB)', 'error');
      continue;
    }

    // Read file as data URL
    const reader = new FileReader();
    reader.onload = (e) => {
      const attachment = {
        name: file.name,
        type: file.type,
        size: file.size,
        data: e.target.result,
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 9)
      };

      this._pendingAttachments.push(attachment);
      this.renderAttachmentGallery();
      if (window.Haptic) Haptic.light();
    };
    reader.readAsDataURL(file);
  }

  // Clear the input for re-upload
  event.target.value = '';
};

// Render the attachment gallery
GTDApp.prototype.renderAttachmentGallery = function() {
  const gallery = document.getElementById('attachmentGallery');
  if (!gallery) return;

  if (!this._pendingAttachments || this._pendingAttachments.length === 0) {
    gallery.innerHTML = '<div class="attachment-empty">No attachments yet</div>';
    return;
  }

  const self = this;
  gallery.innerHTML = this._pendingAttachments.map(function(att) {
    const isImage = att.type.startsWith('image/');
    const icon = isImage ? '' : (att.type === 'application/pdf' ? '📄' : '📎');

    return '<div class="attachment-item" data-id="' + att.id + '">' +
      (isImage
        ? '<div class="attachment-thumb"><img src="' + att.data + '" alt="' + self.escapeHtml(att.name) + '"></div>'
        : '<div class="attachment-thumb file-icon">' + icon + '</div>') +
      '<div class="attachment-details">' +
        '<span class="attachment-name">' + self.escapeHtml(att.name) + '</span>' +
        '<span class="attachment-size">' + self.formatFileSize(att.size) + '</span>' +
      '</div>' +
      '<button class="attachment-remove" onclick="app.removeAttachment(\'' + att.id + '\')" title="Remove">&times;</button>' +
    '</div>';
  }).join('');
};

// Remove an attachment
GTDApp.prototype.removeAttachment = function(attachmentId) {
  if (!this._pendingAttachments) return;

  this._pendingAttachments = this._pendingAttachments.filter(function(a) {
    return a.id !== attachmentId;
  });

  this.renderAttachmentGallery();
  if (window.Haptic) Haptic.light();
};

GTDApp.prototype.pickTemplate = function() {
  const self = this;
  this.showTemplatePickerInEditor(function(content) {
    if (self._richEditor) {
      self._richEditor.setValue(content);
    }
  });
};

GTDApp.prototype.saveEnhancedReference = async function() {
  if (!this._richEditor) return;

  const content = this._richEditor.getValue().trim();
  if (!content) {
    this.showToast('Please enter content', 'error');
    return;
  }

  const folderId = document.getElementById('quickFolderSelect').value || null;
  const title = content.split('\n')[0].replace(/^#+\s*/, '').substring(0, 100);
  const attachments = this._pendingAttachments || [];

  try {
    // addToReference(title, content, folderId, tags, attachment, attachments)
    await db.addToReference(title, content, folderId, this.referenceTags || [], null, attachments);
    this.closeModal();
    this.showToast('Saved!', 'success');
    this._pendingAttachments = [];

    if (this.currentView === 'reference') {
      await this.renderReferenceView();
    }
    await this.updateCounts();
  } catch (e) {
    console.error('Failed to save:', e);
    this.showToast('Failed to save', 'error');
  }
};

// Override the new reference modal
GTDApp.prototype.showNewReferenceModal = GTDApp.prototype.showNewReferenceModalEnhanced;

// =====================================================
// INTERNAL LINK NAVIGATION
// =====================================================

document.addEventListener('click', async function(e) {
  const link = e.target.closest('.internal-link');
  if (link && window.app) {
    e.preventDefault();
    const noteName = link.dataset.note;

    const items = await db.getReferenceItems();
    const note = items.find(function(i) {
      return (i.title && i.title.toLowerCase() === noteName.toLowerCase()) ||
        i.content.toLowerCase().includes(noteName.toLowerCase());
    });

    if (note) {
      app.showView('reference');
      app.currentFolder = note.folderId || 'all';
      await app.renderReferenceView();

      setTimeout(function() {
        const itemEl = document.querySelector('.reference-item[data-id="' + note.id + '"]');
        if (itemEl) {
          itemEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          itemEl.classList.add('highlighted');
          setTimeout(function() { itemEl.classList.remove('highlighted'); }, 2000);
        }
      }, 100);
    } else {
      app.showToast('Note "' + noteName + '" not found', 'warning');
    }
  }
});

console.log('Evernote features loaded');
