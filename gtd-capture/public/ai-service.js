// ============================================================================
// AI-SERVICE.JS
// GTD Capture - AI Integration with Anthropic Claude API
// ============================================================================

// ============================================================================
// CONFIGURATION
// ============================================================================

const AI_CONFIG = {
  // Use proxy for local development to bypass CORS
  apiEndpoint: window.location.hostname === 'localhost'
    ? 'http://localhost:3001/v1/messages'
    : 'https://api.anthropic.com/v1/messages',
  models: {
    fast: 'claude-3-haiku-20240307',      // Quick suggestions, cheap
    balanced: 'claude-sonnet-4-20250514',  // Chat, complex processing
    powerful: 'claude-opus-4-20250514'     // Deep analysis (use sparingly)
  },
  maxTokens: {
    suggestion: 500,
    chat: 1000,
    analysis: 2000
  }
};

// ============================================================================
// API KEY MANAGEMENT
// ============================================================================

async function getApiKey() {
  // Try to get from user settings (Firestore or local)
  try {
    // Check localStorage first (faster and works offline)
    const localSettings = localStorage.getItem('gtd-ai-settings');
    console.log('getApiKey - localStorage value:', localSettings);
    if (localSettings) {
      const parsed = JSON.parse(localSettings);
      if (parsed.anthropicApiKey) {
        console.log('getApiKey - Found key in localStorage');
        return parsed.anthropicApiKey;
      }
    }

    // Fall back to Firestore if available and initialized
    const dbReady = typeof db !== 'undefined' && db.getSetting && (db.db || db.userId);
    if (dbReady) {
      const settings = await db.getSetting('aiSettings');
      if (settings?.anthropicApiKey) {
        console.log('getApiKey - Found key in Firestore');
        return settings.anthropicApiKey;
      }
    }
  } catch (error) {
    console.error('Error getting API key:', error);
  }

  console.log('getApiKey - No API key found');
  return null;
}

async function saveApiKey(apiKey) {
  try {
    const settings = { anthropicApiKey: apiKey };
    console.log('Saving API key to localStorage...');

    // Save to localStorage first (most reliable for local testing)
    localStorage.setItem('gtd-ai-settings', JSON.stringify(settings));
    console.log('Saved to localStorage:', localStorage.getItem('gtd-ai-settings'));

    // Also try to save to Firestore if available
    if (typeof db !== 'undefined' && db.setSetting) {
      try {
        await db.setSetting('aiSettings', settings);
        console.log('Saved to Firestore');
      } catch (dbError) {
        console.log('Firestore save skipped (not logged in):', dbError.message);
      }
    }

    return true;
  } catch (error) {
    console.error('Error saving API key:', error);
    return false;
  }
}

async function testApiConnection() {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { success: false, error: 'No API key configured' };
  }

  try {
    const response = await callClaudeAPI({
      model: AI_CONFIG.models.fast,
      system: 'You are a test assistant. Respond with "Connection successful!"',
      messages: [{ role: 'user', content: 'Test connection' }],
      maxTokens: 20
    });

    return { success: true, message: response.content[0]?.text || 'Connected' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// BASE API CALL FUNCTION
// ============================================================================

async function callClaudeAPI(options) {
  const {
    model = AI_CONFIG.models.fast,
    system,
    messages,
    maxTokens = AI_CONFIG.maxTokens.suggestion,
    tools = null
  } = options;

  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('AI features require an API key. Add one in Settings > AI Assistant.');
  }

  const body = {
    model,
    max_tokens: maxTokens,
    system,
    messages
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const response = await fetch(AI_CONFIG.apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(error.error?.message || `API request failed: ${response.status}`);
  }

  // Track usage
  trackAIUsage(model);

  return response.json();
}

// ============================================================================
// USAGE TRACKING
// ============================================================================

function trackAIUsage(model) {
  try {
    const key = `gtd-ai-usage-${new Date().toISOString().slice(0, 7)}`; // YYYY-MM
    const current = JSON.parse(localStorage.getItem(key) || '{"calls": 0, "models": {}}');

    current.calls++;
    current.models[model] = (current.models[model] || 0) + 1;

    localStorage.setItem(key, JSON.stringify(current));
  } catch (error) {
    console.error('Error tracking AI usage:', error);
  }
}

function getAIUsageStats() {
  try {
    const key = `gtd-ai-usage-${new Date().toISOString().slice(0, 7)}`;
    const usage = JSON.parse(localStorage.getItem(key) || '{"calls": 0, "models": {}}');

    // Estimate costs (approximate)
    const costs = {
      'claude-3-haiku-20240307': 0.0003, // per call estimate
      'claude-sonnet-4-20250514': 0.003,
      'claude-opus-4-20250514': 0.015
    };

    let estimatedCost = 0;
    for (const [model, count] of Object.entries(usage.models)) {
      estimatedCost += (costs[model] || 0.001) * count;
    }

    return {
      totalCalls: usage.calls,
      byModel: usage.models,
      estimatedCost: estimatedCost.toFixed(2)
    };
  } catch (error) {
    return { totalCalls: 0, byModel: {}, estimatedCost: '0.00' };
  }
}

// ============================================================================
// AI SETTINGS STATE
// ============================================================================

const aiSettings = {
  enableProcessingSuggestions: true,
  enableChatbot: true,
  enableProactiveSuggestions: false,
  enableAutoProcess: false,
  processingModel: 'fast',
  chatModel: 'balanced'
};

async function loadAISettings() {
  try {
    // Check if db is defined and actually initialized
    const dbReady = typeof db !== 'undefined' && db.getSetting && (db.db || db.userId);

    if (dbReady) {
      const settings = await db.getSetting('aiFeatureSettings');
      if (settings) {
        Object.assign(aiSettings, settings);
        return;
      }
    }

    // Fall back to localStorage
    const local = localStorage.getItem('gtd-ai-feature-settings');
    if (local) {
      Object.assign(aiSettings, JSON.parse(local));
    }
  } catch (error) {
    console.error('Error loading AI settings:', error);
    // Fall back to localStorage on error
    try {
      const local = localStorage.getItem('gtd-ai-feature-settings');
      if (local) {
        Object.assign(aiSettings, JSON.parse(local));
      }
    } catch (e) {
      // Use defaults
    }
  }
}

async function saveAISettings() {
  try {
    if (typeof db !== 'undefined' && db.setSetting) {
      await db.setSetting('aiFeatureSettings', aiSettings);
    }
    localStorage.setItem('gtd-ai-feature-settings', JSON.stringify(aiSettings));
  } catch (error) {
    console.error('Error saving AI settings:', error);
  }
}

// ============================================================================
// PROCESSING SYSTEM PROMPT
// ============================================================================

const PROCESSING_SYSTEM_PROMPT = `You are a GTD (Getting Things Done) productivity expert helping process inbox items.

Your job is to analyze an inbox item and provide smart suggestions for processing it according to GTD methodology.

CONTEXT PROVIDED:
- User's existing projects
- User's team members
- User's custom contexts
- User's recent actions (for patterns)

ANALYSIS REQUIRED:
1. Is this actionable? (Can something be done about it?)
2. If actionable:
   - What's the specific next physical action?
   - What context? (@phone, @email, @computer, @errands, @office, @home, or custom)
   - Is there a person involved?
   - Is there a deadline or date mentioned?
   - Does it belong to an existing project?
   - Should it BE a new project (multi-step outcome)?
   - Can it be done in under 2 minutes? (Do it now)
   - Should it be delegated?
3. If not actionable:
   - Is it reference material? (Save for later)
   - Is it a someday/maybe idea? (Future possibility)
   - Is it trash? (No value)

RESPONSE FORMAT (JSON only, no other text):
{
  "actionable": boolean,
  "twoMinuteTask": boolean,
  "analysis": {
    "suggestedAction": "Specific next action phrased as verb + noun",
    "context": "@context",
    "person": "Name or null",
    "dueDate": "ISO date or null",
    "existingProject": "Project name or null",
    "shouldBeProject": boolean,
    "projectName": "Suggested project name if shouldBeProject",
    "shouldDelegate": boolean,
    "delegateTo": "Team member name or null"
  },
  "nonActionable": {
    "type": "reference | someday | trash | null",
    "folder": "Suggested reference folder or null",
    "reason": "Why this categorization"
  },
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of analysis"
}

Be specific with actions. Not "handle invoice" but "Email invoice to accounting@company.com".
Match contexts to what makes sense for the action.
If you recognize a person's name, note it.
Parse dates naturally ("next Tuesday", "end of month", "Jan 20").
Always respond with valid JSON only.`;

// ============================================================================
// AI-POWERED INBOX PROCESSING
// ============================================================================

async function getAIProcessingSuggestions(inboxItem) {
  if (!aiSettings.enableProcessingSuggestions) {
    return null;
  }

  // Gather context
  let contextData = {
    projects: [],
    teamMembers: [],
    contexts: ['@phone', '@email', '@computer', '@office', '@errands', '@home'],
    recentActionPatterns: []
  };

  try {
    if (typeof db !== 'undefined') {
      const [projects, teamMembers, recentActions] = await Promise.all([
        db.getProjects ? db.getProjects() : [],
        db.getTeamMembers ? db.getTeamMembers() : [],
        db.getAll ? db.getAll('nextActions').then(a => a.slice(0, 10)) : []
      ]);

      contextData.projects = projects.map(p => ({ name: p.name, status: p.status }));
      contextData.teamMembers = teamMembers.map(m => ({ name: m.name, role: m.role || '' }));
      contextData.recentActionPatterns = recentActions.map(a => ({
        description: a.description || a.content,
        context: a.context
      }));
    }
  } catch (error) {
    console.log('Could not load context data:', error);
  }

  const modelKey = aiSettings.processingModel || 'fast';
  const model = AI_CONFIG.models[modelKey] || AI_CONFIG.models.fast;

  // Build enhanced system prompt with learning and preferences
  let enhancedPrompt = PROCESSING_SYSTEM_PROMPT;

  try {
    // Add user preferences
    const preferencesContext = buildPreferencesContext();
    if (preferencesContext) {
      enhancedPrompt += preferencesContext;
    }

    // Add learning from past corrections
    const learningContext = await buildLearningContext();
    if (learningContext) {
      enhancedPrompt += learningContext;
    }
  } catch (e) {
    console.log('Could not build learning context:', e);
  }

  try {
    const response = await callClaudeAPI({
      model,
      system: enhancedPrompt,
      messages: [{
        role: 'user',
        content: `Analyze this inbox item:

"${inboxItem.content || inboxItem.text || ''}"

${inboxItem.type === 'email' ? `From: ${inboxItem.from || ''}\nSubject: ${inboxItem.subject || ''}` : ''}
${inboxItem.type === 'file' ? `File: ${inboxItem.fileName || ''} (${inboxItem.fileType || ''})` : ''}

User's context:
${JSON.stringify(contextData, null, 2)}

Current date: ${new Date().toISOString().split('T')[0]}`
      }],
      maxTokens: AI_CONFIG.maxTokens.suggestion
    });

    // Parse the response
    const content = response.content[0]?.text || '';

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return null;
  } catch (error) {
    console.error('Failed to get AI suggestions:', error);
    throw error;
  }
}

async function acceptAISuggestion(inboxItem, suggestion) {
  if (!suggestion) return false;

  try {
    if (suggestion.actionable) {
      const action = {
        description: suggestion.analysis.suggestedAction,
        content: suggestion.analysis.suggestedAction,
        context: suggestion.analysis.context,
        dueDate: suggestion.analysis.dueDate ? new Date(suggestion.analysis.dueDate).toISOString() : null,
        tags: [],
        priority: 'medium',
        created: new Date().toISOString()
      };

      // Find or create project
      if (suggestion.analysis.shouldBeProject && suggestion.analysis.projectName) {
        const project = await db.addProject({
          name: suggestion.analysis.projectName,
          status: 'active',
          created: new Date().toISOString()
        });
        action.projectId = project.id || project;
      } else if (suggestion.analysis.existingProject) {
        const projects = await db.getProjects();
        const match = projects.find(p =>
          p.name.toLowerCase().includes(suggestion.analysis.existingProject.toLowerCase())
        );
        if (match) {
          action.projectId = match.id;
        }
      }

      // Handle delegation
      if (suggestion.analysis.shouldDelegate && suggestion.analysis.delegateTo) {
        // Create as waiting-for item
        await db.add('waitingFor', {
          ...action,
          delegatedTo: suggestion.analysis.delegateTo,
          delegatedDate: new Date().toISOString()
        });
      } else {
        // Add as regular action
        await db.add('nextActions', action);
      }

      // Remove from inbox
      await db.delete('inbox', inboxItem.id);

      return true;
    } else {
      // Handle non-actionable
      switch (suggestion.nonActionable?.type) {
        case 'reference':
          await db.add('reference', {
            content: inboxItem.content || inboxItem.text,
            folder: suggestion.nonActionable.folder,
            created: new Date().toISOString()
          });
          break;
        case 'someday':
          await db.add('somedayMaybe', {
            content: inboxItem.content || inboxItem.text,
            created: new Date().toISOString()
          });
          break;
        case 'trash':
          await db.add('trash', {
            ...inboxItem,
            trashedDate: new Date().toISOString()
          });
          break;
      }

      await db.delete('inbox', inboxItem.id);
      return true;
    }
  } catch (error) {
    console.error('Error accepting AI suggestion:', error);
    throw error;
  }
}

// ============================================================================
// CHATBOT SYSTEM PROMPT
// ============================================================================

const ASSISTANT_SYSTEM_PROMPT = `You are a GTD (Getting Things Done) productivity assistant embedded in a task management app called GTD Capture.

YOUR PERSONALITY:
- Concise and action-oriented
- Encouraging but not sycophantic
- Knowledgeable about GTD methodology
- Proactive with suggestions
- Remembers context within the conversation

YOUR CAPABILITIES:
1. CAPTURE: Help users quickly capture items to their inbox
2. PROCESS: Guide users through processing inbox items
3. ORGANIZE: Help categorize and organize tasks
4. QUERY: Answer questions about their tasks, projects, waiting items
5. COACH: Guide through weekly reviews and GTD best practices
6. DELEGATE: Help with delegation decisions
7. FOCUS: Suggest what to work on based on context and time
8. DRAFT: Help compose emails, follow-ups, messages

CURRENT USER CONTEXT:
{{USER_CONTEXT}}

COMMUNICATION STYLE:
- Start responses with the key information
- Use bullet points sparingly
- Suggest specific next steps
- Ask clarifying questions when needed
- Keep responses under 150 words unless detail is requested

When using tools, always confirm what action you took.`;

// ============================================================================
// CHATBOT TOOLS
// ============================================================================

const ASSISTANT_TOOLS = [
  {
    name: "capture_to_inbox",
    description: "Add an item to the user's inbox for later processing",
    input_schema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The text content to capture"
        }
      },
      required: ["content"]
    }
  },
  {
    name: "create_action",
    description: "Create a next action directly (skip inbox)",
    input_schema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "The action description (verb + noun)"
        },
        context: {
          type: "string",
          description: "The context (@phone, @email, @computer, @errands, @office, @home)"
        },
        projectName: {
          type: "string",
          description: "Name of project to link to (optional)"
        },
        dueDate: {
          type: "string",
          description: "Due date in ISO format (optional)"
        }
      },
      required: ["description", "context"]
    }
  },
  {
    name: "search_gtd",
    description: "Search across all GTD data (actions, projects, waiting, reference, etc.)",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query"
        },
        type: {
          type: "string",
          enum: ["all", "actions", "projects", "waiting", "reference", "someday"],
          description: "Filter by type (optional, default: all)"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "get_focus_suggestions",
    description: "Get suggested actions to focus on based on context, time, and priorities",
    input_schema: {
      type: "object",
      properties: {
        context: {
          type: "string",
          description: "Current context (@phone, @computer, etc.) - optional"
        },
        availableTime: {
          type: "number",
          description: "Minutes available - optional"
        }
      }
    }
  },
  {
    name: "get_waiting_for",
    description: "Get items the user is waiting for, optionally filtered by person",
    input_schema: {
      type: "object",
      properties: {
        personName: {
          type: "string",
          description: "Filter by person name (optional)"
        },
        overdueOnly: {
          type: "boolean",
          description: "Only show overdue items (optional)"
        }
      }
    }
  },
  {
    name: "delegate_action",
    description: "Delegate a task to a team member",
    input_schema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "What needs to be done"
        },
        toMember: {
          type: "string",
          description: "Team member name"
        },
        dueDate: {
          type: "string",
          description: "Due date (optional)"
        }
      },
      required: ["description", "toMember"]
    }
  },
  {
    name: "draft_email",
    description: "Draft an email for the user to review and send",
    input_schema: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient email or name"
        },
        subject: {
          type: "string",
          description: "Email subject"
        },
        body: {
          type: "string",
          description: "Email body"
        }
      },
      required: ["to", "subject", "body"]
    }
  },
  {
    name: "get_project_status",
    description: "Get detailed status of a specific project",
    input_schema: {
      type: "object",
      properties: {
        projectName: {
          type: "string",
          description: "Name of the project"
        }
      },
      required: ["projectName"]
    }
  }
];

// ============================================================================
// TOOL EXECUTION
// ============================================================================

async function executeAssistantTool(toolName, toolInput) {
  try {
    switch (toolName) {
      case 'capture_to_inbox':
        if (typeof db !== 'undefined' && db.add) {
          const id = await db.add('inbox', {
            content: toolInput.content,
            type: 'text',
            created: new Date().toISOString()
          });
          return { success: true, message: `Added "${toolInput.content}" to inbox`, id };
        }
        return { success: false, error: 'Database not available' };

      case 'create_action':
        if (typeof db !== 'undefined' && db.add) {
          const action = {
            description: toolInput.description,
            content: toolInput.description,
            context: toolInput.context || '@computer',
            dueDate: toolInput.dueDate || null,
            priority: 'medium',
            created: new Date().toISOString()
          };

          if (toolInput.projectName) {
            const projects = await db.getProjects();
            const match = projects.find(p =>
              p.name.toLowerCase().includes(toolInput.projectName.toLowerCase())
            );
            if (match) action.projectId = match.id;
          }

          const id = await db.add('nextActions', action);
          return { success: true, message: `Created action in ${toolInput.context}`, id };
        }
        return { success: false, error: 'Database not available' };

      case 'search_gtd':
        const results = await searchGTDData(toolInput.query, toolInput.type);
        return { success: true, results };

      case 'get_focus_suggestions':
        const suggestions = await getFocusSuggestions(toolInput.context, toolInput.availableTime);
        return { success: true, suggestions };

      case 'get_waiting_for':
        const waiting = await getWaitingForItems(toolInput.personName, toolInput.overdueOnly);
        return { success: true, items: waiting };

      case 'delegate_action':
        if (typeof db !== 'undefined' && db.add) {
          const delegation = {
            description: toolInput.description,
            content: toolInput.description,
            delegatedTo: toolInput.toMember,
            delegatedDate: new Date().toISOString(),
            dueDate: toolInput.dueDate || null,
            created: new Date().toISOString()
          };
          const id = await db.add('waitingFor', delegation);
          return { success: true, message: `Delegated to ${toolInput.toMember}`, id };
        }
        return { success: false, error: 'Database not available' };

      case 'draft_email':
        return {
          success: true,
          draft: {
            to: toolInput.to,
            subject: toolInput.subject,
            body: toolInput.body
          },
          message: 'Email drafted for your review'
        };

      case 'get_project_status':
        const status = await getProjectStatus(toolInput.projectName);
        return { success: true, ...status };

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    console.error('Tool execution error:', error);
    return { success: false, error: error.message };
  }
}

// Helper functions for tools
async function searchGTDData(query, type = 'all') {
  const results = { actions: [], projects: [], waiting: [], reference: [], someday: [] };
  const lowerQuery = query.toLowerCase();

  try {
    if (typeof db !== 'undefined' && db.getAll) {
      if (type === 'all' || type === 'actions') {
        const actions = await db.getAll('nextActions');
        results.actions = actions.filter(a =>
          (a.description || a.content || '').toLowerCase().includes(lowerQuery)
        ).slice(0, 5);
      }

      if (type === 'all' || type === 'projects') {
        const projects = await db.getProjects();
        results.projects = projects.filter(p =>
          (p.name || '').toLowerCase().includes(lowerQuery)
        ).slice(0, 5);
      }

      if (type === 'all' || type === 'waiting') {
        const waiting = await db.getAll('waitingFor');
        results.waiting = waiting.filter(w =>
          (w.description || w.content || '').toLowerCase().includes(lowerQuery)
        ).slice(0, 5);
      }
    }
  } catch (error) {
    console.error('Search error:', error);
  }

  return results;
}

async function getFocusSuggestions(context, availableTime) {
  const suggestions = [];

  try {
    if (typeof db !== 'undefined' && db.getAll) {
      let actions = await db.getAll('nextActions');
      const now = new Date();

      // Filter by context if provided
      if (context) {
        actions = actions.filter(a => a.context === context);
      }

      // Sort by priority: overdue first, then by due date
      actions.sort((a, b) => {
        const aOverdue = a.dueDate && new Date(a.dueDate) < now;
        const bOverdue = b.dueDate && new Date(b.dueDate) < now;

        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;

        if (a.dueDate && b.dueDate) {
          return new Date(a.dueDate) - new Date(b.dueDate);
        }

        return 0;
      });

      // Return top suggestions
      for (const action of actions.slice(0, 5)) {
        const isOverdue = action.dueDate && new Date(action.dueDate) < now;
        suggestions.push({
          id: action.id,
          description: action.description || action.content,
          context: action.context,
          dueDate: action.dueDate,
          isOverdue,
          daysSince: isOverdue ? Math.floor((now - new Date(action.dueDate)) / (1000 * 60 * 60 * 24)) : 0
        });
      }
    }
  } catch (error) {
    console.error('Focus suggestions error:', error);
  }

  return suggestions;
}

async function getWaitingForItems(personName, overdueOnly) {
  const items = [];

  try {
    if (typeof db !== 'undefined' && db.getAll) {
      let waiting = await db.getAll('waitingFor');
      const now = new Date();

      // Filter by person if provided
      if (personName) {
        waiting = waiting.filter(w =>
          (w.delegatedTo || '').toLowerCase().includes(personName.toLowerCase())
        );
      }

      for (const item of waiting) {
        const delegatedDate = new Date(item.delegatedDate || item.created);
        const daysSince = Math.floor((now - delegatedDate) / (1000 * 60 * 60 * 24));
        const isOverdue = daysSince > 5; // Consider overdue after 5 days

        if (overdueOnly && !isOverdue) continue;

        items.push({
          id: item.id,
          description: item.description || item.content,
          delegatedTo: item.delegatedTo,
          delegatedDate: item.delegatedDate,
          daysSince,
          isOverdue
        });
      }

      // Sort by days since (oldest first)
      items.sort((a, b) => b.daysSince - a.daysSince);
    }
  } catch (error) {
    console.error('Waiting for error:', error);
  }

  return items;
}

async function getProjectStatus(projectName) {
  try {
    if (typeof db !== 'undefined' && db.getProjects) {
      const projects = await db.getProjects();
      const project = projects.find(p =>
        (p.name || '').toLowerCase().includes(projectName.toLowerCase())
      );

      if (!project) {
        return { found: false, error: 'Project not found' };
      }

      // Get actions for this project
      const allActions = await db.getAll('nextActions');
      const projectActions = allActions.filter(a => a.projectId === project.id);

      const completed = projectActions.filter(a => a.completed).length;
      const total = projectActions.length;

      return {
        found: true,
        project: {
          name: project.name,
          status: project.status,
          created: project.created
        },
        actions: projectActions.slice(0, 5).map(a => ({
          description: a.description || a.content,
          context: a.context,
          completed: a.completed || false
        })),
        progress: {
          completed,
          total,
          percentage: total > 0 ? Math.round((completed / total) * 100) : 0
        }
      };
    }
  } catch (error) {
    console.error('Project status error:', error);
  }

  return { found: false, error: 'Could not get project status' };
}

// ============================================================================
// CHAT CONVERSATION HANDLER
// ============================================================================

let chatHistory = [];

async function sendChatMessage(userMessage) {
  if (!aiSettings.enableChatbot) {
    return { message: 'AI chatbot is disabled. Enable it in Settings > AI Assistant.', toolResults: [] };
  }

  // Build context
  const userContext = await buildUserContext();

  // Add user message to history
  chatHistory.push({
    role: 'user',
    content: userMessage
  });

  // Build system prompt with current context
  const systemPrompt = ASSISTANT_SYSTEM_PROMPT.replace(
    '{{USER_CONTEXT}}',
    JSON.stringify(userContext, null, 2)
  );

  const modelKey = aiSettings.chatModel || 'balanced';
  const model = AI_CONFIG.models[modelKey] || AI_CONFIG.models.balanced;

  try {
    const response = await callClaudeAPI({
      model,
      system: systemPrompt,
      messages: chatHistory,
      maxTokens: AI_CONFIG.maxTokens.chat,
      tools: ASSISTANT_TOOLS
    });

    // Process response
    let assistantMessage = '';
    let toolResults = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        assistantMessage += block.text;
      } else if (block.type === 'tool_use') {
        // Execute the tool
        const result = await executeAssistantTool(block.name, block.input);
        toolResults.push({
          id: block.id,
          tool: block.name,
          input: block.input,
          result
        });
      }
    }

    // Add assistant response to history
    chatHistory.push({
      role: 'assistant',
      content: response.content
    });

    // If tools were used, we may need to continue the conversation
    if (toolResults.length > 0 && response.stop_reason === 'tool_use') {
      // Add tool results and get follow-up response
      chatHistory.push({
        role: 'user',
        content: toolResults.map(tr => ({
          type: 'tool_result',
          tool_use_id: tr.id,
          content: JSON.stringify(tr.result)
        }))
      });

      // Get follow-up response
      const followUp = await callClaudeAPI({
        model,
        system: systemPrompt,
        messages: chatHistory,
        maxTokens: AI_CONFIG.maxTokens.chat,
        tools: ASSISTANT_TOOLS
      });

      assistantMessage = followUp.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');

      chatHistory.push({
        role: 'assistant',
        content: followUp.content
      });
    }

    return {
      message: assistantMessage,
      toolResults
    };

  } catch (error) {
    console.error('Chat error:', error);
    return {
      message: `Sorry, I encountered an error: ${error.message}`,
      toolResults: []
    };
  }
}

async function buildUserContext() {
  const now = new Date();
  const context = {
    currentTime: now.toISOString(),
    dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
    summary: {
      inboxCount: 0,
      totalActions: 0,
      overdueCount: 0,
      dueTodayCount: 0,
      waitingForCount: 0,
      overdueWaitingCount: 0,
      activeProjects: 0
    },
    overdueActions: [],
    dueTodayActions: [],
    overdueWaiting: [],
    teamMembers: [],
    projects: []
  };

  try {
    if (typeof db !== 'undefined' && db.getAll) {
      const [inbox, actions, projects, waiting, teamMembers] = await Promise.all([
        db.getAll('inbox').catch(() => []),
        db.getAll('nextActions').catch(() => []),
        db.getProjects ? db.getProjects().catch(() => []) : [],
        db.getAll('waitingFor').catch(() => []),
        db.getTeamMembers ? db.getTeamMembers().catch(() => []) : []
      ]);

      context.summary.inboxCount = inbox.length;
      context.summary.totalActions = actions.length;
      context.summary.waitingForCount = waiting.length;
      context.summary.activeProjects = projects.filter(p => p.status === 'active').length;

      // Find overdue and due today
      const overdueActions = actions.filter(a =>
        a.dueDate && new Date(a.dueDate) < now && !a.completed
      );
      context.summary.overdueCount = overdueActions.length;
      context.overdueActions = overdueActions.slice(0, 5).map(a => ({
        id: a.id,
        description: a.description || a.content,
        context: a.context,
        dueDate: a.dueDate
      }));

      const dueTodayActions = actions.filter(a =>
        a.dueDate &&
        new Date(a.dueDate).toDateString() === now.toDateString() &&
        !a.completed
      );
      context.summary.dueTodayCount = dueTodayActions.length;
      context.dueTodayActions = dueTodayActions.map(a => ({
        id: a.id,
        description: a.description || a.content,
        context: a.context
      }));

      // Overdue waiting items (>5 days)
      const overdueWaiting = waiting.filter(w => {
        const age = (now - new Date(w.delegatedDate || w.created)) / (1000 * 60 * 60 * 24);
        return age > 5;
      });
      context.summary.overdueWaitingCount = overdueWaiting.length;
      context.overdueWaiting = overdueWaiting.map(w => ({
        description: w.description || w.content,
        personName: w.delegatedTo,
        daysSince: Math.floor((now - new Date(w.delegatedDate || w.created)) / (1000 * 60 * 60 * 24))
      }));

      context.teamMembers = teamMembers.map(m => ({ name: m.name, role: m.role || '' }));
      context.projects = projects.filter(p => p.status === 'active').map(p => ({
        name: p.name,
        status: p.status
      }));
    }
  } catch (error) {
    console.error('Error building context:', error);
  }

  return context;
}

function clearChatHistory() {
  chatHistory = [];
}

// ============================================================================
// AI FEEDBACK & LEARNING SYSTEM
// ============================================================================

// Record feedback when user accepts, modifies, or rejects AI suggestion
async function recordAIFeedback(originalInput, aiSuggestion, userAction, feedbackType, feedbackDetails = null) {
  try {
    const feedback = {
      timestamp: new Date().toISOString(),
      type: 'processing',
      originalInput,
      aiSuggestion: {
        action: aiSuggestion?.analysis?.suggestedAction || '',
        context: aiSuggestion?.analysis?.context || '',
        person: aiSuggestion?.analysis?.person || null,
        project: aiSuggestion?.analysis?.existingProject || null,
        dueDate: aiSuggestion?.analysis?.dueDate || null,
        actionable: aiSuggestion?.actionable || false
      },
      userCorrection: userAction ? {
        action: userAction.action || userAction.description || '',
        context: userAction.context || userAction.contexts?.[0] || '',
        person: userAction.person || userAction.delegatedTo || null,
        project: userAction.projectId || null,
        dueDate: userAction.dueDate || null
      } : null,
      accepted: feedbackType === 'accepted',
      modified: feedbackType === 'modified',
      rejected: feedbackType === 'rejected',
      feedbackType: feedbackDetails?.types || [],
      feedbackNote: feedbackDetails?.note || '',
      diff: userAction ? {
        contextChanged: (aiSuggestion?.analysis?.context || '') !== (userAction.context || userAction.contexts?.[0] || ''),
        personChanged: (aiSuggestion?.analysis?.person || '') !== (userAction.person || userAction.delegatedTo || ''),
        projectChanged: (aiSuggestion?.analysis?.existingProject || '') !== (userAction.projectId || ''),
        dueDateChanged: (aiSuggestion?.analysis?.dueDate || '') !== (userAction.dueDate || ''),
        actionPhraseChanged: (aiSuggestion?.analysis?.suggestedAction || '') !== (userAction.action || userAction.description || '')
      } : null
    };

    // Save to Firestore if available
    if (typeof db !== 'undefined' && db.add) {
      await db.add('aiFeedback', feedback);
    }

    // Also save to localStorage for offline access
    const storedFeedback = JSON.parse(localStorage.getItem('gtd-ai-feedback') || '[]');
    storedFeedback.unshift(feedback);
    // Keep only last 100 feedback entries locally
    localStorage.setItem('gtd-ai-feedback', JSON.stringify(storedFeedback.slice(0, 100)));

    console.log('AI feedback recorded:', feedbackType);
    return true;
  } catch (error) {
    console.error('Error recording AI feedback:', error);
    return false;
  }
}

// Get recent corrections for learning
async function getRecentCorrections(limit = 20) {
  try {
    let corrections = [];

    // Try Firestore first
    if (typeof db !== 'undefined' && db.getAll) {
      const allFeedback = await db.getAll('aiFeedback', 'timestamp', 'desc');
      corrections = allFeedback.filter(f => f.modified || f.rejected).slice(0, limit);
    }

    // Fall back to localStorage
    if (corrections.length === 0) {
      const storedFeedback = JSON.parse(localStorage.getItem('gtd-ai-feedback') || '[]');
      corrections = storedFeedback.filter(f => f.modified || f.rejected).slice(0, limit);
    }

    return corrections;
  } catch (error) {
    console.error('Error getting corrections:', error);
    return [];
  }
}

// Derive learning patterns from corrections
function derivePatterns(corrections) {
  const patterns = [];

  if (!corrections || corrections.length === 0) return '';

  // Context patterns
  const contextCorrections = corrections.filter(c => c.diff?.contextChanged);
  if (contextCorrections.length > 0) {
    const contextMap = {};
    contextCorrections.forEach(c => {
      const from = c.aiSuggestion?.context || 'none';
      const to = c.userCorrection?.context || 'none';
      const key = `${from} → ${to}`;
      contextMap[key] = (contextMap[key] || 0) + 1;
    });

    Object.entries(contextMap).forEach(([change, count]) => {
      if (count >= 2) {
        patterns.push(`User often changes ${change} (${count} times)`);
      }
    });
  }

  // Project patterns
  const projectCorrections = corrections.filter(c => c.diff?.projectChanged && c.userCorrection?.project);
  projectCorrections.slice(0, 5).forEach(c => {
    const words = (c.originalInput || '').toLowerCase().split(' ').slice(0, 3);
    if (words.length > 0) {
      patterns.push(`When input contains "${words.join(' ')}", user assigned project: "${c.userCorrection.project}"`);
    }
  });

  // Person patterns
  const personCorrections = corrections.filter(c => c.diff?.personChanged && c.userCorrection?.person);
  personCorrections.slice(0, 5).forEach(c => {
    const inputPreview = (c.originalInput || '').substring(0, 30);
    patterns.push(`"${inputPreview}..." → Person: ${c.userCorrection.person}`);
  });

  return patterns.slice(0, 10).join('\n');
}

// Build learning context for AI prompt
async function buildLearningContext() {
  const corrections = await getRecentCorrections(15);

  if (corrections.length === 0) {
    return '';
  }

  let learningContext = `\n\nLEARNING FROM PAST CORRECTIONS:
The user has corrected your suggestions before. Learn from these patterns:\n`;

  corrections.slice(0, 8).forEach(c => {
    learningContext += `
- Input: "${(c.originalInput || '').substring(0, 50)}..."
  You suggested: ${c.aiSuggestion?.context || 'no context'}, ${c.aiSuggestion?.project || 'no project'}
  User corrected to: ${c.userCorrection?.context || 'no context'}, ${c.userCorrection?.project || 'no project'}`;
  });

  const patterns = derivePatterns(corrections);
  if (patterns) {
    learningContext += `\n\nPATTERNS TO REMEMBER:\n${patterns}`;
  }

  learningContext += '\n\nApply these learnings to improve your suggestions.';

  return learningContext;
}

// ============================================================================
// AI USER PREFERENCES
// ============================================================================

const defaultAIPreferences = {
  defaultContext: '@computer',
  contextMappings: {
    'call': '@phone',
    'phone': '@phone',
    'email': '@email',
    'send': '@email',
    'text': '@phone',
    'buy': '@errands',
    'pick up': '@errands',
    'research': '@computer',
    'review': '@computer'
  },
  projectKeywords: {},
  personAliases: {},
  actionVerbPreferences: 'active',
  includePersonInAction: true,
  askBeforeCreatingProjects: true,
  suggestDelegation: true,
  proactiveSuggestions: true,
  autoAcceptHighConfidence: false
};

let aiPreferences = { ...defaultAIPreferences };

async function loadAIPreferences() {
  try {
    // Check if db is defined and has a working getSetting method
    // Also verify the db is actually initialized (has internal db property)
    const dbReady = typeof db !== 'undefined' && db.getSetting && (db.db || db.userId);

    if (dbReady) {
      const prefs = await db.getSetting('aiPreferences');
      if (prefs) {
        aiPreferences = { ...defaultAIPreferences, ...prefs };
        return;
      }
    }

    // Fall back to localStorage
    const local = localStorage.getItem('gtd-ai-preferences');
    if (local) {
      aiPreferences = { ...defaultAIPreferences, ...JSON.parse(local) };
    }
  } catch (error) {
    console.error('Error loading AI preferences:', error);
    // Fall back to localStorage on error
    try {
      const local = localStorage.getItem('gtd-ai-preferences');
      if (local) {
        aiPreferences = { ...defaultAIPreferences, ...JSON.parse(local) };
      }
    } catch (e) {
      // Use defaults
    }
  }
}

async function saveAIPreferences(prefs) {
  try {
    aiPreferences = { ...aiPreferences, ...prefs };

    if (typeof db !== 'undefined' && db.setSetting) {
      await db.setSetting('aiPreferences', aiPreferences);
    }

    localStorage.setItem('gtd-ai-preferences', JSON.stringify(aiPreferences));
    return true;
  } catch (error) {
    console.error('Error saving AI preferences:', error);
    return false;
  }
}

function getAIPreferences() {
  return aiPreferences;
}

// Add a keyword-project mapping
async function addProjectMapping(keywords, projectName) {
  const keywordList = keywords.toLowerCase().split(',').map(k => k.trim());
  keywordList.forEach(k => {
    aiPreferences.projectKeywords[k] = projectName;
  });
  await saveAIPreferences(aiPreferences);
}

// Add a keyword-context mapping
async function addContextMapping(keywords, context) {
  const keywordList = keywords.toLowerCase().split(',').map(k => k.trim());
  keywordList.forEach(k => {
    aiPreferences.contextMappings[k] = context;
  });
  await saveAIPreferences(aiPreferences);
}

// Add a person alias
async function addPersonAlias(aliases, personName) {
  const aliasList = aliases.toLowerCase().split(',').map(a => a.trim());
  aliasList.forEach(a => {
    aiPreferences.personAliases[a] = personName;
  });
  await saveAIPreferences(aiPreferences);
}

// Build preferences context for AI prompt
function buildPreferencesContext() {
  let context = '\n\nUSER PREFERENCES:\n';

  if (aiPreferences.defaultContext) {
    context += `- Default context when unclear: ${aiPreferences.defaultContext}\n`;
  }

  if (Object.keys(aiPreferences.contextMappings).length > 0) {
    context += '- Context keyword mappings:\n';
    Object.entries(aiPreferences.contextMappings).forEach(([keyword, ctx]) => {
      context += `  "${keyword}" → ${ctx}\n`;
    });
  }

  if (Object.keys(aiPreferences.projectKeywords).length > 0) {
    context += '- Project keyword mappings:\n';
    Object.entries(aiPreferences.projectKeywords).forEach(([keyword, project]) => {
      context += `  "${keyword}" → ${project}\n`;
    });
  }

  if (Object.keys(aiPreferences.personAliases).length > 0) {
    context += '- Person aliases:\n';
    Object.entries(aiPreferences.personAliases).forEach(([alias, person]) => {
      context += `  "${alias}" → ${person}\n`;
    });
  }

  return context;
}

// ============================================================================
// AI FEEDBACK ANALYTICS
// ============================================================================

async function getAIFeedbackStats() {
  try {
    let allFeedback = [];

    if (typeof db !== 'undefined' && db.getAll) {
      allFeedback = await db.getAll('aiFeedback', 'timestamp', 'desc');
    }

    if (allFeedback.length === 0) {
      allFeedback = JSON.parse(localStorage.getItem('gtd-ai-feedback') || '[]');
    }

    const total = allFeedback.length;
    const accepted = allFeedback.filter(f => f.accepted).length;
    const modified = allFeedback.filter(f => f.modified).length;
    const rejected = allFeedback.filter(f => f.rejected).length;

    // Calculate accuracy by field
    const corrections = allFeedback.filter(f => f.diff);
    const contextCorrections = corrections.filter(c => c.diff.contextChanged).length;
    const projectCorrections = corrections.filter(c => c.diff.projectChanged).length;
    const personCorrections = corrections.filter(c => c.diff.personChanged).length;
    const dateCorrections = corrections.filter(c => c.diff.dueDateChanged).length;

    // Find most common corrections
    const commonCorrections = [];
    const contextChanges = {};
    corrections.filter(c => c.diff.contextChanged).forEach(c => {
      const key = `${c.aiSuggestion?.context} → ${c.userCorrection?.context}`;
      contextChanges[key] = (contextChanges[key] || 0) + 1;
    });
    Object.entries(contextChanges)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .forEach(([change, count]) => {
        commonCorrections.push({ type: 'Context', change, count });
      });

    return {
      total,
      accepted,
      modified,
      rejected,
      acceptRate: total > 0 ? Math.round((accepted / total) * 100) : 0,
      modifyRate: total > 0 ? Math.round((modified / total) * 100) : 0,
      rejectRate: total > 0 ? Math.round((rejected / total) * 100) : 0,
      accuracy: {
        context: corrections.length > 0 ? Math.round(((corrections.length - contextCorrections) / corrections.length) * 100) : 100,
        project: corrections.length > 0 ? Math.round(((corrections.length - projectCorrections) / corrections.length) * 100) : 100,
        person: corrections.length > 0 ? Math.round(((corrections.length - personCorrections) / corrections.length) * 100) : 100,
        dueDate: corrections.length > 0 ? Math.round(((corrections.length - dateCorrections) / corrections.length) * 100) : 100
      },
      commonCorrections,
      recentCorrections: allFeedback.filter(f => f.modified || f.rejected).slice(0, 5)
    };
  } catch (error) {
    console.error('Error getting feedback stats:', error);
    return {
      total: 0, accepted: 0, modified: 0, rejected: 0,
      acceptRate: 0, modifyRate: 0, rejectRate: 0,
      accuracy: { context: 100, project: 100, person: 100, dueDate: 100 },
      commonCorrections: [],
      recentCorrections: []
    };
  }
}

// Record chat feedback
async function recordChatFeedback(messageId, helpful, feedbackDetails = null) {
  try {
    const feedback = {
      timestamp: new Date().toISOString(),
      type: 'chat',
      messageId,
      helpful,
      feedbackType: feedbackDetails?.types || [],
      feedbackNote: feedbackDetails?.note || ''
    };

    if (typeof db !== 'undefined' && db.add) {
      await db.add('aiFeedback', feedback);
    }

    const storedFeedback = JSON.parse(localStorage.getItem('gtd-ai-feedback') || '[]');
    storedFeedback.unshift(feedback);
    localStorage.setItem('gtd-ai-feedback', JSON.stringify(storedFeedback.slice(0, 100)));

    return true;
  } catch (error) {
    console.error('Error recording chat feedback:', error);
    return false;
  }
}

// ============================================================================
// RECEIPT SCANNER
// ============================================================================

async function analyzeReceipt(imageBase64, mediaType = 'image/jpeg') {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('AI features require an API key. Add one in Settings > AI Assistant.');
  }

  const systemPrompt = `You are a receipt analysis assistant. Analyze the provided receipt image and extract the following information in JSON format:

{
  "vendor": "Store/restaurant name",
  "date": "YYYY-MM-DD format if visible",
  "total": "Total amount as a number (no currency symbol)",
  "currency": "USD, EUR, etc.",
  "items": [
    { "description": "Item name", "amount": number }
  ],
  "taxAmount": number or null,
  "tipAmount": number or null,
  "paymentMethod": "Cash, Card ending in XXXX, etc." or null,
  "category": "One of: Meals, Office Supplies, Travel, Equipment, Marketing, Services, Other",
  "summary": "Brief 1-sentence description of the purchase",
  "notes": "Any other relevant details"
}

If you cannot read certain fields, use null. Always return valid JSON.`;

  const body = {
    model: AI_CONFIG.models.balanced,
    max_tokens: AI_CONFIG.maxTokens.analysis,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: imageBase64.replace(/^data:image\/\w+;base64,/, '')
          }
        },
        {
          type: 'text',
          text: 'Please analyze this receipt and extract the details.'
        }
      ]
    }]
  };

  const response = await fetch(AI_CONFIG.apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(error.error?.message || `API request failed: ${response.status}`);
  }

  trackAIUsage(AI_CONFIG.models.balanced);

  const result = await response.json();
  const content = result.content[0]?.text || '';

  // Extract JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }

  throw new Error('Could not parse receipt data');
}

function formatReceiptForEmail(receiptData) {
  const lines = [
    `Receipt from ${receiptData.vendor || 'Unknown Vendor'}`,
    '',
    `Date: ${receiptData.date || 'Not specified'}`,
    `Total: ${receiptData.currency || '$'}${receiptData.total || '0.00'}`,
    `Category: ${receiptData.category || 'Other'}`,
    '',
    'Items:'
  ];

  if (receiptData.items && receiptData.items.length > 0) {
    receiptData.items.forEach(item => {
      lines.push(`  - ${item.description}: ${receiptData.currency || '$'}${item.amount}`);
    });
  } else {
    lines.push('  (See attached image)');
  }

  if (receiptData.taxAmount) {
    lines.push(`\nTax: ${receiptData.currency || '$'}${receiptData.taxAmount}`);
  }
  if (receiptData.tipAmount) {
    lines.push(`Tip: ${receiptData.currency || '$'}${receiptData.tipAmount}`);
  }
  if (receiptData.paymentMethod) {
    lines.push(`\nPayment: ${receiptData.paymentMethod}`);
  }
  if (receiptData.notes) {
    lines.push(`\nNotes: ${receiptData.notes}`);
  }

  lines.push(`\n---\nSummary: ${receiptData.summary || 'Receipt scan'}`);

  return lines.join('\n');
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initAIService() {
  await loadAISettings();
  await loadAIPreferences();
  console.log('AI Service initialized');
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAIService);
} else {
  initAIService();
}

// ============================================================================
// EXPORTS
// ============================================================================

window.aiService = {
  // API Key management
  getApiKey,
  saveApiKey,
  testApiConnection,

  // Processing suggestions
  getAIProcessingSuggestions,
  acceptAISuggestion,

  // Chat
  sendChatMessage,
  clearChatHistory,
  buildUserContext,

  // Settings
  getAIUsageStats,
  aiSettings,
  loadAISettings,
  saveAISettings,
  AI_CONFIG,

  // Feedback & Learning
  recordAIFeedback,
  getRecentCorrections,
  buildLearningContext,
  getAIFeedbackStats,
  recordChatFeedback,

  // Preferences
  getAIPreferences,
  saveAIPreferences,
  loadAIPreferences,
  addProjectMapping,
  addContextMapping,
  addPersonAlias,
  buildPreferencesContext,
  aiPreferences,

  // Receipt Scanner
  analyzeReceipt,
  formatReceiptForEmail
};
