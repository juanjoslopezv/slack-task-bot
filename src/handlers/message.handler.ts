import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import { classifyRequest, answerQuestion } from '../services/claude.service';
import {
  buildContextForAreas,
  buildFullContextSummary,
  getCodebaseIndex,
} from '../services/codebase.service';
import { generateQuestions } from '../services/claude.service';
import { createConversation, addBotMessage } from '../services/conversation.service';
import { isHelpRequest, HELP_MESSAGE } from '../utils/help';

type AppMentionArgs = SlackEventMiddlewareArgs<'app_mention'> & AllMiddlewareArgs;

export async function handleAppMention({ event, say }: AppMentionArgs): Promise<void> {
  // If this mention is inside an existing thread, let the message handler deal with it.
  // Slack fires both app_mention and message events for in-thread mentions;
  // the message handler (handleThreadReply) has the recovery logic we need.
  if (event.thread_ts) {
    return;
  }

  // Strip the bot mention from the message to get the actual request
  const rawText = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();

  if (!rawText) {
    await say({
      text: HELP_MESSAGE,
      thread_ts: event.ts,
    });
    return;
  }

  // Check if this is a help request
  if (isHelpRequest(rawText)) {
    await say({
      text: HELP_MESSAGE,
      thread_ts: event.ts,
    });
    return;
  }

  // React to show we're working on it
  try {
    const client = (await import('@slack/bolt')).default;
    // We can't easily access the web client here, so we'll just post a message
  } catch {
    // ignore
  }

  await say({
    text: ':thinking_face: Analyzing your request...',
    thread_ts: event.ts,
  });

  // Classify the request
  const classification = await classifyRequest(rawText);

  if (!classification.isRelevant) {
    await say({
      text: "This doesn't seem to be related to the strapi.rovr project. I can help answer questions about the Rovr backend or spec out features, fixes, and changes. Could you rephrase your request?",
      thread_ts: event.ts,
    });
    return;
  }

  // Build codebase context
  const index = await getCodebaseIndex();
  let codebaseContext: string;

  if (classification.affectedAreas.length > 0) {
    codebaseContext = buildContextForAreas(index, classification.affectedAreas);
    // If area-specific context is too thin, fall back to full summary
    if (codebaseContext.length < 200) {
      codebaseContext = buildFullContextSummary(index);
    }
  } else {
    codebaseContext = buildFullContextSummary(index);
  }

  const threadTs = event.ts;

  // Route based on intent: question vs task
  if (classification.intent === 'question') {
    // Question mode: answer directly
    await say({
      text: ':mag: Looking through the codebase...',
      thread_ts: threadTs,
    });

    // Create conversation state for follow-ups
    createConversation(
      threadTs,
      event.channel,
      'question',
      rawText,
      null,
      classification.affectedAreas,
      codebaseContext,
      event.user
    );

    const answer = await answerQuestion(rawText, codebaseContext, []);

    await say({
      text: `*Question:* ${classification.summary}\n\n${answer}\n\n_Feel free to ask follow-up questions in this thread!_`,
      thread_ts: threadTs,
    });

    addBotMessage(threadTs, answer);
  } else {
    // Task mode: spec generation flow
    const questions = await generateQuestions(rawText, codebaseContext, []);

    createConversation(
      threadTs,
      event.channel,
      'task',
      rawText,
      classification.type,
      classification.affectedAreas,
      codebaseContext,
      event.user
    );

    const typeLabel = classification.type
      ? `*${classification.type.charAt(0).toUpperCase() + classification.type.slice(1)}*`
      : 'Task';

    const header = `${typeLabel}: ${classification.summary}\n\nI've analyzed the strapi.rovr codebase. Here are some questions to help me spec this out:\n\n`;

    const fullResponse = header + questions;

    await say({
      text: fullResponse,
      thread_ts: threadTs,
    });

    addBotMessage(threadTs, questions);
  }
}
