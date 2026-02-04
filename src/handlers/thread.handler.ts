import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import { generateQuestions, generateSpec, answerQuestion, classifyRequest } from '../services/claude.service';
import {
  getConversation,
  addUserMessage,
  addBotMessage,
  shouldGenerateSpec,
  isReadyForSpec,
  markComplete,
  setAwaitingJiraChoice,
  shouldCreateJiraTicket,
  storeJiraTicket,
  shouldSwitchToTaskMode,
  switchToTaskMode,
  createConversation,
} from '../services/conversation.service';
import { isJiraConfigured, createJiraTicket } from '../services/jira.service';
import { buildContextForAreas, buildFullContextSummary, getCodebaseIndex } from '../services/codebase.service';
import { isHelpRequest, HELP_MESSAGE } from '../utils/help';
import { recoverConversationFromSlack, shouldAttemptRecovery } from '../services/history-recovery.service';
import { config } from '../config';

type MessageArgs = SlackEventMiddlewareArgs<'message'> & AllMiddlewareArgs;

export async function handleThreadReply({ event, say, context, client }: MessageArgs): Promise<void> {
  // Only handle threaded messages
  if (!('thread_ts' in event) || !event.thread_ts) return;

  // Ignore bot's own messages
  if ('bot_id' in event && event.bot_id) return;
  if ('subtype' in event && event.subtype) return;

  const threadTs = event.thread_ts;
  const channelId = event.channel;
  let conversation = getConversation(threadTs);

  // Attempt to recover conversation if missing
  if (!conversation && shouldAttemptRecovery(threadTs)) {
    const botUserId = context.botUserId || '';
    const recovered = await recoverConversationFromSlack(
      { client } as any, // Pass client as simplified app interface
      channelId,
      threadTs,
      botUserId
    );

    if (recovered && recovered.history.length > 0) {
      // Successfully recovered - notify user and recreate conversation
      await say({
        text: `:arrows_counterclockwise: I had to recover our conversation history after a restart. I've restored ${recovered.messageCount} messages. Let's continue!`,
        thread_ts: threadTs,
      });

      // Get codebase context and recreate conversation
      const codebaseIndex = await getCodebaseIndex();
      const codebaseContext = buildFullContextSummary(codebaseIndex);

      // Try to classify the original request to determine task type
      let taskType: 'feature' | 'fix' | 'change' | null = null;
      let affectedAreas: string[] = [];
      try {
        const classification = await classifyRequest(recovered.originalRequest);
        taskType = classification.type;
        affectedAreas = classification.affectedAreas;
      } catch {
        // If classification fails, use defaults
      }

      // Recreate conversation with recovered history
      conversation = createConversation(
        threadTs,
        channelId,
        'task', // Default to task mode for recovered conversations
        recovered.originalRequest,
        taskType,
        affectedAreas,
        codebaseContext
      );

      // Restore the conversation history
      conversation.history = recovered.history;
      conversation.questionRounds = Math.floor(recovered.history.length / 2);
    } else {
      // Recovery failed or no history - notify user
      await say({
        text: `:warning: I lost the context of our conversation (retention: ${config.conversation.retentionHours} hours). Please start a new thread or briefly remind me what we were discussing.`,
        thread_ts: threadTs,
      });
      return;
    }
  }

  // If still no conversation, it's not a thread we're tracking
  if (!conversation) return;

  // Don't process messages in completed conversations
  if (conversation.stage === 'complete') return;

  const userMessage = 'text' in event ? event.text || '' : '';
  if (!userMessage.trim()) return;

  // Check if user is asking for help
  if (isHelpRequest(userMessage)) {
    await say({
      text: HELP_MESSAGE,
      thread_ts: threadTs,
    });
    return;
  }

  // Add user's answer to conversation history
  addUserMessage(threadTs, userMessage);

  // Route based on conversation mode
  if (conversation.mode === 'question') {
    // Check if user wants to switch to task/spec mode
    if (shouldSwitchToTaskMode(threadTs, userMessage)) {
      await say({
        text: ':gear: Switching to task mode...',
        thread_ts: threadTs,
      });

      // Classify the conversation context to determine task type
      const historyContext = conversation.history
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n\n');
      const fullContext = `${conversation.originalRequest}\n\n${historyContext}\n\nUser now says: ${userMessage}`;

      const classification = await classifyRequest(fullContext);

      // Switch mode and update conversation state
      switchToTaskMode(threadTs, classification.type, classification.affectedAreas);

      // Update codebase context if affected areas were identified
      const index = await getCodebaseIndex();
      const codebaseContext = classification.affectedAreas.length > 0
        ? buildContextForAreas(index, classification.affectedAreas)
        : buildFullContextSummary(index);

      const updatedConv = getConversation(threadTs);
      if (updatedConv) {
        updatedConv.codebaseContext = codebaseContext;
      }

      // Generate initial task questions
      const questions = await generateQuestions(
        fullContext,
        codebaseContext,
        conversation.history
      );

      await say({
        text: `:clipboard: *${classification.type || 'Task'}*: ${classification.summary || 'Creating task specification'}\n\n${questions}`,
        thread_ts: threadTs,
      });

      addBotMessage(threadTs, questions);
      return;
    }

    // Question mode: answer follow-up questions
    await say({
      text: ':mag: Looking that up...',
      thread_ts: threadTs,
    });

    const answer = await answerQuestion(
      userMessage,
      conversation.codebaseContext,
      conversation.history
    );

    // Add helpful hint about switching to task mode
    const hint = conversation.questionRounds >= 2 && conversation.questionRounds % 3 === 0
      ? '\n\n_💡 Tip: If you\'d like to turn this into a task specification, just say *"create a spec"* or *"generate spec"*._'
      : '';

    await say({
      text: answer + hint,
      thread_ts: threadTs,
    });

    addBotMessage(threadTs, answer);
  } else {
    // Task mode: spec generation flow

    // IMPORTANT: Check Jira choice FIRST before checking for spec generation
    // This prevents "yes" from triggering spec regeneration
    if (conversation.stage === 'awaiting_jira_choice') {
      const userWantsJira = shouldCreateJiraTicket(threadTs, userMessage);

      if (userWantsJira) {
        await say({
          text: ':hourglass: Creating Jira ticket...',
          thread_ts: threadTs,
        });

        const result = await createJiraTicket(
          conversation.generatedSpec!,
          conversation.taskType
        );

        if (result.success) {
          await say({
            text: `:white_check_mark: Jira ticket created: <${result.url}|${result.key}>`,
            thread_ts: threadTs,
          });
          storeJiraTicket(threadTs, result.key!);
        } else {
          await say({
            text: `:warning: Failed to create Jira ticket: ${result.error}\n\nYou can create it manually using the spec above.`,
            thread_ts: threadTs,
          });
        }
      } else {
        await say({
          text: ':ok_hand: No problem! The spec is ready above.',
          thread_ts: threadTs,
        });
      }

      markComplete(threadTs);
      return;
    }

    // Check if user wants to generate spec
    const userWantsSpec = shouldGenerateSpec(threadTs, userMessage);

    if (userWantsSpec) {
      await say({
        text: ':memo: Generating your task specification...',
        thread_ts: threadTs,
      });

      const spec = await generateSpec(
        conversation.originalRequest,
        conversation.codebaseContext,
        conversation.history
      );

      // Post spec to Slack
      await say({
        text: spec,
        thread_ts: threadTs,
      });

      // Offer Jira creation if configured
      if (isJiraConfigured()) {
        await say({
          text: ":ticket: Would you like me to create a Jira ticket for this task?\n\nReply *'yes'* or *'create ticket'* to proceed, or *'no'* / *'skip'* if not needed.",
          thread_ts: threadTs,
        });
        setAwaitingJiraChoice(threadTs, spec);
      } else {
        markComplete(threadTs);
      }
      return;
    }

    // Generate more questions based on updated history
    await say({
      text: ':thinking_face: Processing your answers...',
      thread_ts: threadTs,
    });

    const response = await generateQuestions(
      conversation.originalRequest,
      conversation.codebaseContext,
      conversation.history
    );

    // Check if Claude thinks we have enough info
    if (isReadyForSpec(response)) {
      const cleanResponse = response.replace('READY_FOR_SPEC', '').trim();

      await say({
        text: `${cleanResponse}\n\nI think I have enough information. Reply with *"generate spec"* when you're ready, or add more details if needed.`,
        thread_ts: threadTs,
      });

      addBotMessage(threadTs, cleanResponse);
      return;
    }

    await say({
      text: response,
      thread_ts: threadTs,
    });

    addBotMessage(threadTs, response);
  }
}
