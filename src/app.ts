import { App } from '@slack/bolt';
import { config } from './config';
import { handleAppMention } from './handlers/message.handler';
import { handleThreadReply } from './handlers/thread.handler';
import { getCodebaseIndex } from './services/codebase.service';
import {
  cleanupOldConversations,
  initializeConversations,
  shutdownConversations,
} from './services/conversation.service';
import { HELP_MESSAGE } from './utils/help';

const app = new App({
  token: config.slack.botToken,
  signingSecret: config.slack.signingSecret,
  appToken: config.slack.appToken,
  socketMode: true,
});

// Handle @mentions
app.event('app_mention', handleAppMention);

// Handle thread replies
app.event('message', handleThreadReply);

// Slash command (optional)
app.command('/task', async ({ command, ack, say }) => {
  await ack();

  if (!command.text.trim()) {
    await say({
      text: 'Please provide a task description. Example: `/task add a new endpoint to filter playlists by mood`',
      channel: command.channel_id,
    });
    return;
  }

  // Simulate an app_mention event by posting to the channel and letting the mention handler process it
  await say({
    text: `:wave: Task received from <@${command.user_id}>: _${command.text}_\n\n:thinking_face: Analyzing...`,
    channel: command.channel_id,
  });

  // For slash commands, we handle inline since we don't get a thread_ts easily
  const { classifyRequest, generateQuestions } = await import('./services/claude.service');
  const { buildContextForAreas, buildFullContextSummary } = await import(
    './services/codebase.service'
  );
  const { createConversation, addBotMessage } = await import('./services/conversation.service');

  const classification = await classifyRequest(command.text);

  if (!classification.isRelevant) {
    await say({
      text: "This doesn't seem related to strapi.rovr. I can help with task specs for features, fixes, and changes to the Rovr backend. To ask questions about the backend, @mention me instead!",
      channel: command.channel_id,
    });
    return;
  }

  const index = await getCodebaseIndex();
  let codebaseContext =
    classification.affectedAreas.length > 0
      ? buildContextForAreas(index, classification.affectedAreas)
      : '';

  if (codebaseContext.length < 200) {
    codebaseContext = buildFullContextSummary(index);
  }

  const questions = await generateQuestions(command.text, codebaseContext, []);

  // Post questions as a new message (users can reply in thread)
  const result = await say({
    text: `*${classification.type?.charAt(0).toUpperCase()}${classification.type?.slice(1) || 'Task'}*: ${classification.summary}\n\n${questions}\n\n_Reply in this thread to answer. Say "generate spec" when ready._`,
    channel: command.channel_id,
  });

  if (result.ts) {
    createConversation(
      result.ts,
      command.channel_id,
      'task',
      command.text,
      classification.type,
      classification.affectedAreas,
      codebaseContext
    );
    addBotMessage(result.ts, questions);
  }
});

// Help command
app.command('/help', async ({ command, ack, say }) => {
  await ack();

  await say({
    text: HELP_MESSAGE,
    channel: command.channel_id,
  });
});

// Cleanup stale conversations every hour
setInterval(() => cleanupOldConversations(), 60 * 60 * 1000);

(async () => {
  // Initialize conversation state from disk (recover from restarts)
  try {
    await initializeConversations();
  } catch (err) {
    console.error('Failed to load persisted conversations:', err);
    console.log('Starting with empty conversation state');
  }

  // Pre-index the codebase on startup
  try {
    await getCodebaseIndex();
    console.log('Codebase indexed successfully');
  } catch (err) {
    console.error('Failed to index codebase:', err);
    console.log('Bot will still start, but codebase analysis may fail');
  }

  // Set up graceful shutdown handlers
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down gracefully...`);
    try {
      await shutdownConversations();
      await app.stop();
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  await app.start();
  console.log('Slack TaskBot is running!');
})();
