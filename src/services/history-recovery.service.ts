import { App } from '@slack/bolt';
import { ConversationMessage } from './claude.service';
import { config } from '../config';

export interface RecoveredConversation {
  history: ConversationMessage[];
  originalRequest: string;
  messageCount: number;
}

/**
 * Attempts to recover conversation history from Slack thread
 * Returns null if recovery is disabled or fails
 */
export async function recoverConversationFromSlack(
  app: App,
  channelId: string,
  threadTs: string,
  botUserId: string
): Promise<RecoveredConversation | null> {
  if (!config.conversation.enableHistoryRecovery) {
    return null;
  }

  try {
    // Fetch all messages in the thread
    const result = await app.client.conversations.replies({
      channel: channelId,
      ts: threadTs,
      limit: 100, // Maximum messages to recover
    });

    if (!result.messages || result.messages.length === 0) {
      return null;
    }

    const messages = result.messages;
    const history: ConversationMessage[] = [];
    let originalRequest = '';

    // Process messages in chronological order
    for (const msg of messages) {
      const text = msg.text || '';

      // Skip empty messages
      if (!text.trim()) continue;

      // First message is the original request (strip bot mention)
      if (msg.ts === threadTs) {
        originalRequest = text.replace(/<@[A-Z0-9]+>/g, '').trim();
        continue;
      }

      // Determine if message is from bot or user
      const isBot = msg.user === botUserId || msg.bot_id != null;

      if (isBot) {
        // Bot message
        history.push({
          role: 'assistant',
          content: text,
        });
      } else {
        // User message
        history.push({
          role: 'user',
          content: text,
        });
      }
    }

    return {
      history,
      originalRequest,
      messageCount: messages.length,
    };
  } catch (err: any) {
    console.error(`⚠️  Failed to recover conversation history for thread ${threadTs}:`, err.message);
    return null;
  }
}

/**
 * Checks if a thread has enough recent activity to warrant recovery
 */
export function shouldAttemptRecovery(threadTs: string): boolean {
  if (!config.conversation.enableHistoryRecovery) {
    return false;
  }

  // Calculate thread age from timestamp
  const threadTime = parseFloat(threadTs) * 1000;
  const now = Date.now();
  const threadAge = now - threadTime;
  const maxAge = config.conversation.retentionHours * 60 * 60 * 1000;

  // Only attempt recovery if thread is within retention period
  return threadAge < maxAge;
}
