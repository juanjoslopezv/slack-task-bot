import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
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
  shouldDeclineJiraTicket,
  storeJiraTicket,
  shouldSwitchToTaskMode,
  switchToTaskMode,
  createConversation,
  setAwaitingReporterSelection,
  setAwaitingSprintSelection,
  setResolvedReporter,
  setResolvedSprint,
  parseNumericSelection,
} from '../services/conversation.service';
import {
  isJiraConfigured,
  createJiraTicket,
  getActiveSprint,
  getRecentSprints,
  moveIssueToSprint,
  findJiraUserByEmail,
  getAssignableProjectUsers,
} from '../services/jira.service';
import { buildContextForAreas, buildFullContextSummary, getCodebaseIndex } from '../services/codebase.service';
import { isHelpRequest, HELP_MESSAGE } from '../utils/help';
import { recoverConversationFromSlack, shouldAttemptRecovery } from '../services/history-recovery.service';
import { config } from '../config';

type MessageArgs = SlackEventMiddlewareArgs<'message'> & AllMiddlewareArgs;

/**
 * Resolve a Jira user from a Slack user ID by looking up their email.
 */
async function resolveReporterFromSlack(
  slackUserId: string | undefined,
  client: WebClient
): Promise<{ accountId: string; displayName: string } | null> {
  if (!slackUserId) return null;

  try {
    const slackUser = await client.users.info({ user: slackUserId });
    const email = slackUser.user?.profile?.email;
    if (!email) {
      console.log(`No email found for Slack user ${slackUserId}`);
      return null;
    }

    const jiraUser = await findJiraUserByEmail(email);
    if (!jiraUser) {
      console.log(`No Jira user found for email ${email}`);
      return null;
    }

    return {
      accountId: jiraUser.accountId,
      displayName: jiraUser.displayName,
    };
  } catch (error: any) {
    console.error('Failed to resolve reporter from Slack:', error.message);
    return null;
  }
}

/**
 * Creates the Jira ticket with the resolved reporter and moves it to the resolved sprint.
 */
async function createTicketAndAssignSprint(
  threadTs: string,
  conversation: any,
  say: Function,
): Promise<void> {
  await say({
    text: ':hourglass: Creating Jira ticket...',
    thread_ts: threadTs,
  });

  const result = await createJiraTicket(
    conversation.generatedSpec!,
    conversation.taskType,
    conversation.resolvedReporterAccountId
  );

  if (result.success) {
    let message = `:white_check_mark: Jira ticket created: <${result.url}|${result.key}>`;

    if (result.reporterDropped) {
      message += `\n:warning: Reporter field is not available on the Jira create screen — ticket created with default reporter.`;
    } else if (conversation.resolvedReporterName) {
      message += `\n:bust_in_silhouette: Reporter: ${conversation.resolvedReporterName}`;
    }

    if (conversation.resolvedSprintId) {
      const sprintResult = await moveIssueToSprint(
        result.key!,
        conversation.resolvedSprintId
      );

      if (sprintResult.success) {
        message += `\n:runner: Sprint: ${conversation.resolvedSprintName}`;
      } else {
        message += `\n:warning: Failed to assign sprint: ${sprintResult.error}`;
      }
    }

    await say({ text: message, thread_ts: threadTs });
    storeJiraTicket(threadTs, result.key!);
    markComplete(threadTs);
  } else {
    await say({
      text: `:warning: Failed to create Jira ticket: ${result.error}\n\nReply *'retry'* or *'create ticket'* to try again, or *'skip'* if not needed.`,
      thread_ts: threadTs,
    });
    // Reset to awaiting_jira_choice so user can retry
    setAwaitingJiraChoice(threadTs, conversation.generatedSpec!);
  }
}

/**
 * After reporter is resolved, check sprint resolution.
 * If sprint already resolved or board not configured, create ticket.
 * If not resolved, show sprint selection list.
 */
async function proceedToSprintResolutionOrCreate(
  threadTs: string,
  conversation: any,
  say: Function,
): Promise<void> {
  if (conversation.resolvedSprintId || !config.jira.boardId) {
    await createTicketAndAssignSprint(threadTs, conversation, say);
    return;
  }

  const sprints = await getRecentSprints();

  if (sprints.length === 0) {
    await say({
      text: ':information_source: No sprints found for this board. Creating ticket without sprint assignment.',
      thread_ts: threadTs,
    });
    await createTicketAndAssignSprint(threadTs, conversation, say);
    return;
  }

  const sprintList = sprints
    .map((s, i) => `*${i + 1}.* ${s.name} (${s.state})`)
    .join('\n');

  await say({
    text: `:runner: I couldn't find an active sprint. Please select a sprint:\n\n${sprintList}\n\nReply with the number, or *"skip"* to create without a sprint.`,
    thread_ts: threadTs,
  });

  setAwaitingSprintSelection(
    threadTs,
    sprints.map(s => ({ id: s.id, name: s.name, state: s.state }))
  );
}

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
  if (conversation.stage === 'complete') {
    await say({
      text: ':white_check_mark: This conversation is complete. Please start a new thread or @mention me to begin a new request.',
      thread_ts: threadTs,
    });
    return;
  }

  const userMessage = 'text' in event ? event.text || '' : '';
  if (!userMessage.trim()) return;

  // Check if this message is just tagging other users to help
  // (e.g., "@Shak can you help us respond these questions?")
  // If so, silently skip — the bot should wait for actual answers
  const botUserId = context.botUserId || '';
  const otherUserMentions = (userMessage.match(/<@[A-Z0-9]+>/g) || [])
    .filter(mention => mention !== `<@${botUserId}>`);
  if (otherUserMentions.length > 0) {
    const textWithoutMentions = userMessage.replace(/<@[A-Z0-9]+>/g, '').trim();
    // If the non-mention text is short and doesn't contain substantive answers, skip
    if (textWithoutMentions.length < 120 && !textWithoutMentions.includes('\n')) {
      return;
    }
  }

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

    // IMPORTANT: Check Jira-related stages FIRST before checking for spec generation
    // This prevents "yes" or numeric selections from triggering spec regeneration
    if (conversation.stage === 'awaiting_jira_choice') {
      const userWantsJira = shouldCreateJiraTicket(threadTs, userMessage);

      if (userWantsJira) {
        await say({
          text: ':mag: Resolving reporter and sprint...',
          thread_ts: threadTs,
        });

        // Parallel auto-resolution: reporter (via Slack email) AND active sprint
        const [resolvedReporter, activeSprint] = await Promise.all([
          resolveReporterFromSlack(conversation.slackUserId, client),
          getActiveSprint(),
        ]);

        // Store sprint if found
        if (activeSprint) {
          setResolvedSprint(threadTs, activeSprint.id, activeSprint.name);
          conversation = getConversation(threadTs)!;
        }

        // Store reporter if found
        if (resolvedReporter) {
          setResolvedReporter(threadTs, resolvedReporter.accountId, resolvedReporter.displayName);
          conversation = getConversation(threadTs)!;

          await say({
            text: `:bust_in_silhouette: Setting *${resolvedReporter.displayName}* as reporter.`,
            thread_ts: threadTs,
          });

          await proceedToSprintResolutionOrCreate(threadTs, conversation, say);
        } else {
          // Reporter NOT found -- show assignable users list
          const users = await getAssignableProjectUsers();

          if (users.length === 0) {
            await say({
              text: ':information_source: Could not resolve reporter. Creating ticket with default reporter.',
              thread_ts: threadTs,
            });
            await proceedToSprintResolutionOrCreate(threadTs, conversation, say);
          } else {
            const userList = users
              .map((u, i) => `*${i + 1}.* ${u.displayName}${u.emailAddress ? ` (${u.emailAddress})` : ''}`)
              .join('\n');

            await say({
              text: `:bust_in_silhouette: I couldn't match your Slack account to a Jira user. Please select a reporter:\n\n${userList}\n\nReply with the number, or *"skip"* to use the default reporter.`,
              thread_ts: threadTs,
            });

            setAwaitingReporterSelection(
              threadTs,
              users.map(u => ({ accountId: u.accountId, displayName: u.displayName }))
            );
          }
        }
      } else if (shouldDeclineJiraTicket(threadTs, userMessage)) {
        await say({
          text: ':ok_hand: No problem! The spec is ready above.',
          thread_ts: threadTs,
        });
        markComplete(threadTs);
      } else {
        await say({
          text: ":thinking_face: I didn't quite catch that. Reply *'yes'* or *'create ticket'* to create a Jira ticket, or *'no'* / *'skip'* if not needed.",
          thread_ts: threadTs,
        });
      }
      return;
    }

    if (conversation.stage === 'awaiting_reporter_selection') {
      const normalized = userMessage.toLowerCase().trim();

      if (normalized === 'skip' || normalized === 'none' || normalized === 'default') {
        await say({
          text: ':ok_hand: Using default reporter.',
          thread_ts: threadTs,
        });
        await proceedToSprintResolutionOrCreate(threadTs, conversation, say);
        return;
      }

      const options = conversation.pendingReporterOptions || [];
      const selectedIndex = parseNumericSelection(userMessage, options.length);

      if (selectedIndex === -1) {
        await say({
          text: `:warning: Please reply with a number (1-${options.length}) or *"skip"* to use the default reporter.`,
          thread_ts: threadTs,
        });
        return;
      }

      const selected = options[selectedIndex];
      setResolvedReporter(threadTs, selected.accountId, selected.displayName);
      conversation = getConversation(threadTs)!;

      await say({
        text: `:bust_in_silhouette: Setting *${selected.displayName}* as reporter.`,
        thread_ts: threadTs,
      });

      await proceedToSprintResolutionOrCreate(threadTs, conversation, say);
      return;
    }

    if (conversation.stage === 'awaiting_sprint_selection') {
      const normalized = userMessage.toLowerCase().trim();

      if (normalized === 'skip' || normalized === 'none') {
        await say({
          text: ':ok_hand: Creating ticket without sprint assignment.',
          thread_ts: threadTs,
        });
        await createTicketAndAssignSprint(threadTs, conversation, say);
        return;
      }

      const options = conversation.pendingSprintOptions || [];
      const selectedIndex = parseNumericSelection(userMessage, options.length);

      if (selectedIndex === -1) {
        await say({
          text: `:warning: Please reply with a number (1-${options.length}) or *"skip"* to create without a sprint.`,
          thread_ts: threadTs,
        });
        return;
      }

      const selected = options[selectedIndex];
      setResolvedSprint(threadTs, selected.id, selected.name);
      conversation = getConversation(threadTs)!;

      await say({
        text: `:runner: Assigning to sprint *${selected.name}*.`,
        thread_ts: threadTs,
      });

      await createTicketAndAssignSprint(threadTs, conversation, say);
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
