import * as fs from 'fs/promises';
import * as path from 'path';
import { ConversationMessage } from './claude.service';
import { config } from '../config';

const DATA_DIR = process.env.PERSISTENCE_DIR || '/app/data';
const STATE_FILE = path.join(DATA_DIR, 'conversations.json');

export interface PersistedConversation {
  threadTs: string;
  channelId: string;
  mode: 'question' | 'task';
  originalRequest: string;
  taskType: 'feature' | 'fix' | 'change' | null;
  affectedAreas: string[];
  codebaseContext: string;
  history: ConversationMessage[];
  stage: 'classifying' | 'questioning' | 'awaiting_jira_choice'
       | 'awaiting_reporter_selection' | 'awaiting_sprint_selection' | 'complete';
  questionRounds: number;
  lastActivity: number;
  generatedSpec?: string;
  jiraTicketKey?: string;
  slackUserId?: string;
  resolvedReporterAccountId?: string;
  resolvedReporterName?: string;
  resolvedSprintId?: number;
  resolvedSprintName?: string;
  pendingReporterOptions?: Array<{ accountId: string; displayName: string }>;
  pendingSprintOptions?: Array<{ id: number; name: string; state: string }>;
}

interface PersistedState {
  conversations: Record<string, PersistedConversation>;
  lastSaved: number;
}

let saveTimeout: NodeJS.Timeout | null = null;
const SAVE_DEBOUNCE_MS = 2000; // Save 2 seconds after last update

/**
 * Ensures the data directory exists
 */
async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (err) {
    // Directory might already exist, or we might not have permissions
    // We'll try to save anyway and let it fail if there's a real issue
  }
}

/**
 * Loads persisted conversation state from disk
 * Returns empty state if file doesn't exist or is invalid
 */
export async function loadPersistedState(): Promise<Map<string, PersistedConversation>> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(STATE_FILE, 'utf-8');
    const parsed: PersistedState = JSON.parse(data);

    const conversations = new Map<string, PersistedConversation>();

    // Clean up conversations older than configured retention period on load
    const now = Date.now();
    const maxAge = config.conversation.retentionHours * 60 * 60 * 1000;

    for (const [threadTs, conv] of Object.entries(parsed.conversations)) {
      if (now - conv.lastActivity < maxAge) {
        conversations.set(threadTs, conv);
      }
    }

    console.log(`📂 Loaded ${conversations.size} active conversations from disk (retention: ${config.conversation.retentionHours}h)`);
    return conversations;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      // File doesn't exist yet, that's fine
      console.log('📂 No persisted state found, starting fresh');
    } else {
      console.error('⚠️  Failed to load persisted state:', err.message);
    }
    return new Map();
  }
}

/**
 * Saves conversation state to disk (debounced)
 * Writes are delayed by SAVE_DEBOUNCE_MS to avoid excessive I/O
 */
export function savePersistedState(
  conversations: Map<string, PersistedConversation>
): void {
  // Clear existing timeout
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  // Schedule save
  saveTimeout = setTimeout(async () => {
    try {
      await ensureDataDir();

      const state: PersistedState = {
        conversations: Object.fromEntries(conversations.entries()),
        lastSaved: Date.now(),
      };

      await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
      // Don't log on every save to avoid noise
    } catch (err: any) {
      console.error('⚠️  Failed to save conversation state:', err.message);
    }
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Forces an immediate save (used during graceful shutdown)
 */
export async function savePersistedStateNow(
  conversations: Map<string, PersistedConversation>
): Promise<void> {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }

  try {
    await ensureDataDir();

    const state: PersistedState = {
      conversations: Object.fromEntries(conversations.entries()),
      lastSaved: Date.now(),
    };

    await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    console.log('💾 Conversation state saved to disk');
  } catch (err: any) {
    console.error('⚠️  Failed to save conversation state:', err.message);
  }
}
