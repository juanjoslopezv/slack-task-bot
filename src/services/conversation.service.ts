import { ConversationMessage } from './claude.service';
import {
  loadPersistedState,
  savePersistedState,
  savePersistedStateNow,
  PersistedConversation,
} from './persistence.service';
import { config } from '../config';

type ConversationMode = 'question' | 'task';
type ConversationStage = 'classifying' | 'questioning' | 'awaiting_jira_choice' | 'complete';

interface ConversationState {
  threadTs: string;
  channelId: string;
  mode: ConversationMode;
  originalRequest: string;
  taskType: 'feature' | 'fix' | 'change' | null;
  affectedAreas: string[];
  codebaseContext: string;
  history: ConversationMessage[];
  stage: ConversationStage;
  questionRounds: number;
  createdAt: Date;
  generatedSpec?: string;  // Store spec for Jira creation
  jiraTicketKey?: string;  // Store created ticket key
}

const MAX_QUESTION_ROUNDS = 5;
const COMPLETION_TRIGGERS = [
  "that's all",
  'thats all',
  'looks good',
  'ready',
  'generate spec',
  'done',
  'no more questions',
  'nothing else',
  "that's it",
  'thats it',
  'go ahead',
  'ship it',
];

const JIRA_AFFIRMATIVE_TRIGGERS = [
  'yes',
  'yep',
  'yeah',
  'sure',
  'create ticket',
  'create jira',
  'make ticket',
  'make jira',
  'go ahead',
  'do it',
  'please',
];

const MODE_SWITCH_TRIGGERS = [
  'create a spec',
  'generate a spec',
  'make a spec',
  'create spec',
  'generate spec',
  'make spec',
  'turn this into a task',
  'convert to task',
  'switch to task mode',
  'start a task',
  'create a task',
  "let's create a spec",
  "let's make a spec",
  'need a spec',
  'spec this',
];

const conversations = new Map<string, ConversationState>();
let isInitialized = false;

/**
 * Initializes conversation service by loading persisted state
 * Should be called once on bot startup
 */
export async function initializeConversations(): Promise<void> {
  if (isInitialized) return;

  const persisted = await loadPersistedState();

  // Convert PersistedConversation back to ConversationState
  for (const [threadTs, conv] of persisted.entries()) {
    conversations.set(threadTs, {
      ...conv,
      createdAt: new Date(conv.lastActivity),
    });
  }

  isInitialized = true;
  console.log(`✅ Conversation service initialized with ${conversations.size} active threads`);
}

/**
 * Converts ConversationState to PersistedConversation for saving
 */
function toPersistedConversation(conv: ConversationState): PersistedConversation {
  return {
    threadTs: conv.threadTs,
    channelId: conv.channelId,
    mode: conv.mode,
    originalRequest: conv.originalRequest,
    taskType: conv.taskType,
    affectedAreas: conv.affectedAreas,
    codebaseContext: conv.codebaseContext,
    history: conv.history,
    stage: conv.stage,
    questionRounds: conv.questionRounds,
    lastActivity: Date.now(),
    generatedSpec: conv.generatedSpec,
    jiraTicketKey: conv.jiraTicketKey,
  };
}

/**
 * Saves current conversation state to disk (debounced)
 */
function persistConversations(): void {
  const persisted = new Map<string, PersistedConversation>();
  for (const [key, conv] of conversations.entries()) {
    persisted.set(key, toPersistedConversation(conv));
  }
  savePersistedState(persisted);
}

/**
 * Gracefully shuts down conversation service, saving state immediately
 */
export async function shutdownConversations(): Promise<void> {
  const persisted = new Map<string, PersistedConversation>();
  for (const [key, conv] of conversations.entries()) {
    persisted.set(key, toPersistedConversation(conv));
  }
  await savePersistedStateNow(persisted);
}

export function createConversation(
  threadTs: string,
  channelId: string,
  mode: ConversationMode,
  originalRequest: string,
  taskType: 'feature' | 'fix' | 'change' | null,
  affectedAreas: string[],
  codebaseContext: string
): ConversationState {
  const state: ConversationState = {
    threadTs,
    channelId,
    mode,
    originalRequest,
    taskType,
    affectedAreas,
    codebaseContext,
    history: [],
    stage: 'questioning',
    questionRounds: 0,
    createdAt: new Date(),
  };

  conversations.set(threadTs, state);
  persistConversations();
  return state;
}

export function getConversation(threadTs: string): ConversationState | undefined {
  return conversations.get(threadTs);
}

export function addBotMessage(threadTs: string, content: string): void {
  const conv = conversations.get(threadTs);
  if (!conv) return;
  conv.history.push({ role: 'assistant', content });
  conv.questionRounds++;
  persistConversations();
}

export function addUserMessage(threadTs: string, content: string): void {
  const conv = conversations.get(threadTs);
  if (!conv) return;
  conv.history.push({ role: 'user', content });
  persistConversations();
}

export function shouldGenerateSpec(threadTs: string, latestUserMessage: string): boolean {
  const conv = conversations.get(threadTs);
  if (!conv) return false;

  const normalized = latestUserMessage.toLowerCase().trim();
  if (COMPLETION_TRIGGERS.some(trigger => normalized.includes(trigger))) {
    return true;
  }

  if (conv.questionRounds >= MAX_QUESTION_ROUNDS) {
    return true;
  }

  return false;
}

export function isReadyForSpec(botResponse: string): boolean {
  return botResponse.includes('READY_FOR_SPEC');
}

export function markComplete(threadTs: string): void {
  const conv = conversations.get(threadTs);
  if (conv) {
    conv.stage = 'complete';
    persistConversations();
  }
}

export function cleanupOldConversations(): void {
  const maxAgeMs = config.conversation.retentionHours * 60 * 60 * 1000;
  const now = Date.now();
  let deletedCount = 0;
  for (const [key, conv] of conversations) {
    if (now - conv.createdAt.getTime() > maxAgeMs) {
      conversations.delete(key);
      deletedCount++;
    }
  }
  if (deletedCount > 0) {
    persistConversations();
    console.log(`🧹 Cleaned up ${deletedCount} old conversations (retention: ${config.conversation.retentionHours}h)`);
  }
}

export function shouldCreateJiraTicket(threadTs: string, userMessage: string): boolean {
  const conv = conversations.get(threadTs);
  if (!conv || conv.stage !== 'awaiting_jira_choice') return false;

  const normalized = userMessage.toLowerCase().trim();
  return JIRA_AFFIRMATIVE_TRIGGERS.some(trigger => normalized.includes(trigger));
}

export function setAwaitingJiraChoice(threadTs: string, spec: string): void {
  const conv = conversations.get(threadTs);
  if (conv) {
    conv.stage = 'awaiting_jira_choice';
    conv.generatedSpec = spec;
    persistConversations();
  }
}

export function storeJiraTicket(threadTs: string, ticketKey: string): void {
  const conv = conversations.get(threadTs);
  if (conv) {
    conv.jiraTicketKey = ticketKey;
    persistConversations();
  }
}

export function shouldSwitchToTaskMode(threadTs: string, userMessage: string): boolean {
  const conv = conversations.get(threadTs);
  if (!conv || conv.mode !== 'question') return false;

  const normalized = userMessage.toLowerCase().trim();
  return MODE_SWITCH_TRIGGERS.some(trigger => normalized.includes(trigger));
}

export function switchToTaskMode(
  threadTs: string,
  taskType: 'feature' | 'fix' | 'change' | null,
  affectedAreas: string[]
): void {
  const conv = conversations.get(threadTs);
  if (conv && conv.mode === 'question') {
    conv.mode = 'task';
    conv.taskType = taskType;
    conv.affectedAreas = affectedAreas;
    conv.stage = 'questioning';
    persistConversations();
    // Keep the existing history and context for continuity
  }
}
