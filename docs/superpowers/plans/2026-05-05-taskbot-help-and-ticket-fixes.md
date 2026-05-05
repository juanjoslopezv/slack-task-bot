# TaskBot Help Trigger Fix + Question-Mode Ticket Creation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bugs — false help messages on codebase questions, and inability to create Jira tickets from question-mode threads.

**Architecture:** Three source files change: `help.ts` gets a whitelist-based intent check; `conversation.service.ts` gets new ticket-trigger detection and a hinted-reporter field; `thread.handler.ts` gets a fixed mention filter and a new question-mode ticket creation path. A test framework (vitest) is added to cover the pure functions.

**Tech Stack:** TypeScript, `@slack/bolt`, `vitest` (new), existing `conversation.service.ts` / `jira.service.ts` patterns.

---

## File Map

| File | Change type | What changes |
|------|-------------|--------------|
| `package.json` | Modify | Add vitest dev dependency + `test` script |
| `vitest.config.ts` | Create | Minimal vitest config for CommonJS/TypeScript |
| `src/utils/help.ts` | Modify | Replace `.includes()` check with whitelist for "how to use" prefixes |
| `src/services/persistence.service.ts` | Modify | Add `hintedReporterSlackId?: string` to `PersistedConversation` |
| `src/services/conversation.service.ts` | Modify | Add `TICKET_CREATION_TRIGGERS`, `shouldCreateTicketFromQuestion()`, `setHintedReporter()`, `hintedReporterSlackId` to state |
| `src/handlers/thread.handler.ts` | Modify | Fix mention filter; add question-mode ticket creation path; prefer hinted reporter |
| `src/utils/help.test.ts` | Create | Tests for `isHelpRequest` |
| `src/services/conversation.service.test.ts` | Create | Tests for `shouldCreateTicketFromQuestion` |

---

## Task 1: Add vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install vitest**

```bash
cd /Users/juanjo/slack-rovr-taskbot
npm install -D vitest
```

Expected: vitest appears in `node_modules/.bin/vitest`.

- [ ] **Step 2: Add test script to package.json**

Open `package.json` and add `"test": "vitest run"` to the `scripts` block:

```json
{
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/app.ts",
    "start": "node dist/app.js",
    "test": "vitest run",
    "railway:build": "bash scripts/setup-strapi.sh && npm run build",
    "railway:start": "node dist/app.js"
  }
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Verify vitest runs (no tests yet)**

```bash
npm test
```

Expected output: `No test files found` or similar — zero failures.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest test runner"
```

---

## Task 2: Fix `isHelpRequest` — whitelist approach

**Files:**
- Create: `src/utils/help.test.ts`
- Modify: `src/utils/help.ts`

- [ ] **Step 1: Write failing tests**

Create `src/utils/help.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isHelpRequest } from './help';

describe('isHelpRequest', () => {
  // Should match — user is asking about the bot
  it('matches bare "help"', () => {
    expect(isHelpRequest('help')).toBe(true);
  });

  it('matches "?"', () => {
    expect(isHelpRequest('?')).toBe(true);
  });

  it('matches "how to use"', () => {
    expect(isHelpRequest('how to use')).toBe(true);
  });

  it('matches "how to use this"', () => {
    expect(isHelpRequest('how to use this')).toBe(true);
  });

  it('matches "how to use you"', () => {
    expect(isHelpRequest('how to use you')).toBe(true);
  });

  it('matches "how to use the bot"', () => {
    expect(isHelpRequest('how to use the bot')).toBe(true);
  });

  it('matches "how to use taskbot"', () => {
    expect(isHelpRequest('how to use taskbot')).toBe(true);
  });

  it('matches "how do i use this"', () => {
    expect(isHelpRequest('how do i use this')).toBe(true);
  });

  it('matches "how to use @BackendTaskBot" (mention stripped → empty remainder)', () => {
    // Slack encodes mentions as <@USERID>
    expect(isHelpRequest('how to use <@U123ABC>')).toBe(true);
  });

  it('matches "commands"', () => {
    expect(isHelpRequest('what commands do you have')).toBe(true);
  });

  it('matches "how does this work"', () => {
    expect(isHelpRequest('how does this work')).toBe(true);
  });

  // Should NOT match — user is asking about a codebase feature
  it('does not match "how to use playlists/archives/public timeshift?"', () => {
    expect(isHelpRequest('how to use playlists/archives/public timeshift?')).toBe(false);
  });

  it('does not match "how to use the playlist endpoint"', () => {
    expect(isHelpRequest('how to use the playlist endpoint')).toBe(false);
  });

  it('does not match "how do i use the tracks library endpoint"', () => {
    expect(isHelpRequest('how do i use the tracks library endpoint')).toBe(false);
  });

  it('does not match codebase question with other user mentions', () => {
    // Other mentions → skip regardless
    expect(isHelpRequest('<@U999> can you help with authentication')).toBe(false);
  });

  it('does not match a normal codebase question', () => {
    expect(isHelpRequest('are the playlist endpoints protected from other curators?')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
npm test
```

Expected: Several tests fail because the current `isHelpRequest` incorrectly returns `true` for `"how to use playlists/archives/public timeshift?"`.

- [ ] **Step 3: Implement the fix in `src/utils/help.ts`**

Replace the entire file content:

```typescript
/**
 * Help message and utilities for new users
 */

export const HELP_MESSAGE = `*Welcome to Rovr TaskBot!* :robot_face:

I help you analyze your Strapi codebase and create detailed task specifications.

*How to Use Me:*

*1. Ask Questions About Your Codebase* :mag:
Just @mention me with your question:
\`\`\`@TaskBot How does authentication work?
@TaskBot What fields does the User content type have?
@TaskBot Where is the email service configured?\`\`\`

*2. Create Task Specifications* :clipboard:
Describe what you need:
\`\`\`@TaskBot Add password reset feature
@TaskBot Fix bug in user profile upload
@TaskBot Change email validation rules\`\`\`

I'll ask clarifying questions about:
• Requirements and expected behavior
• User experience and edge cases
• Business rules and constraints
• Data and API considerations

*3. Switch from Questions to Tasks* :arrows_counterclockwise:
If you're asking questions and decide you need a task spec:
\`\`\`Just say: "create a spec" or "generate spec"\`\`\`

*4. Generate the Specification* :memo:
When you're ready for the final spec, say any of:
• \`"generate spec"\`
• \`"ready"\`
• \`"looks good"\`
• \`"that's all"\`
• \`"done"\`

*5. Create Jira Ticket (Optional)* :ticket:
After generating a spec, I'll offer to create a Jira ticket automatically.
• Say \`"yes"\` or \`"create ticket"\` to accept
• Say \`"no"\` or \`"skip"\` to decline

*Tips:*
• I analyze your *actual Strapi codebase* - schemas, routes, and fields
• Each thread is independent - start multiple conversations
• Conversations auto-cleanup after 24 hours
• Max 5 question rounds per task (then I'll suggest finalizing)

*Example Flow:*
\`\`\`1. You: "@TaskBot Add ability to export user data"
2. Me: [Asks about fields, permissions, format...]
3. You: [Answers questions]
4. Me: "I have enough info. Say 'generate spec' when ready."
5. You: "generate spec"
6. Me: [Posts detailed specification]
7. Me: "Create a Jira ticket?"
8. You: "yes"
9. Me: "✅ Jira ticket created: ROVR-123"\`\`\`

*Commands:*
• \`@TaskBot help\` - Show this message
• \`/task [description]\` - Start a new task thread

*Need Help?*
Just @mention me and ask! I'm here to make task specification easier.

_Happy speccing!_ :rocket:`;

// Words/phrases that may follow "how to use" / "how do i use" and still mean the user
// is asking about the bot, not a codebase feature.
const HOW_TO_USE_WHITELIST = [
  '',
  'this',
  'you',
  'it',
  'the bot',
  'this bot',
  'taskbot',
  'the taskbot',
];

// Simple includes-based triggers (specific enough to not produce false positives)
export const HELP_TRIGGERS = [
  'what can you do',
  'commands',
  'instructions',
  'guide',
  'how does this work',
];

export function isHelpRequest(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  const withoutMentions = normalized.replace(/<@[a-z0-9]+>/gi, '').trim();

  // Direct "help" or "?"
  if (withoutMentions === 'help' || withoutMentions === '?') {
    return true;
  }

  // If the original message contains user mentions it is likely directed
  // at those users, not a help request to the bot.
  if (/<@[a-z0-9]+>/i.test(normalized)) {
    return false;
  }

  // Whitelist-based check for "how to use" / "how do i use".
  // Only matches when nothing follows (or only bot-synonym words follow),
  // so "how to use playlists/..." correctly falls through as a codebase question.
  for (const prefix of ['how to use', 'how do i use']) {
    if (withoutMentions.startsWith(prefix)) {
      const remainder = withoutMentions.slice(prefix.length).trim();
      return HOW_TO_USE_WHITELIST.includes(remainder);
    }
  }

  return HELP_TRIGGERS.some(trigger => withoutMentions.includes(trigger));
}
```

- [ ] **Step 4: Run tests — expect all to pass**

```bash
npm test
```

Expected: All tests in `help.test.ts` pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/help.ts src/utils/help.test.ts
git commit -m "fix: narrow isHelpRequest to not match codebase questions containing 'how to use'"
```

---

## Task 3: Add `hintedReporterSlackId` to persistence types

**Files:**
- Modify: `src/services/persistence.service.ts`

- [ ] **Step 1: Add field to `PersistedConversation`**

In `src/services/persistence.service.ts`, add `hintedReporterSlackId?: string;` after `slackUserId`:

```typescript
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
  hintedReporterSlackId?: string;
  resolvedReporterAccountId?: string;
  resolvedReporterName?: string;
  resolvedSprintId?: number;
  resolvedSprintName?: string;
  pendingReporterOptions?: Array<{ accountId: string; displayName: string }>;
  pendingSprintOptions?: Array<{ id: number; name: string; state: string }>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build
```

Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/persistence.service.ts
git commit -m "feat: add hintedReporterSlackId to persisted conversation state"
```

---

## Task 4: Add ticket-creation logic to `conversation.service.ts`

**Files:**
- Modify: `src/services/conversation.service.ts`
- Create: `src/services/conversation.service.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/services/conversation.service.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createConversation,
  shouldCreateTicketFromQuestion,
  TICKET_CREATION_TRIGGERS,
} from './conversation.service';

// conversation.service uses a module-level Map; reset between tests
// by creating fresh conversations with unique threadTs values.

describe('TICKET_CREATION_TRIGGERS', () => {
  it('contains expected trigger strings', () => {
    expect(TICKET_CREATION_TRIGGERS).toContain('create ticket');
    expect(TICKET_CREATION_TRIGGERS).toContain('create a ticket');
    expect(TICKET_CREATION_TRIGGERS).toContain('make ticket');
    expect(TICKET_CREATION_TRIGGERS).toContain('open a ticket');
  });
});

describe('shouldCreateTicketFromQuestion', () => {
  const threadTs = 'test-thread-ticket-' + Date.now();

  beforeEach(() => {
    createConversation(
      threadTs,
      'C123',
      'question',
      'Are the playlist endpoints protected?',
      null,
      [],
      'some codebase context'
    );
  });

  it('returns true for "create a ticket" in question mode', () => {
    expect(shouldCreateTicketFromQuestion(threadTs, 'create a ticket')).toBe(true);
  });

  it('returns true for "make a ticket" in question mode', () => {
    expect(shouldCreateTicketFromQuestion(threadTs, 'make a ticket')).toBe(true);
  });

  it('returns true with surrounding text', () => {
    expect(shouldCreateTicketFromQuestion(threadTs, 'please create a ticket for this')).toBe(true);
  });

  it('returns true even when mentions are present (stripped before check)', () => {
    expect(
      shouldCreateTicketFromQuestion(threadTs, '<@U123> create a ticket for <@U456>')
    ).toBe(true);
  });

  it('returns false for regular question answer', () => {
    expect(shouldCreateTicketFromQuestion(threadTs, 'yes the endpoint uses JWT auth')).toBe(false);
  });

  it('returns false for unknown threadTs', () => {
    expect(shouldCreateTicketFromQuestion('unknown-thread', 'create a ticket')).toBe(false);
  });

  it('returns false when conversation mode is task', () => {
    const taskThread = 'test-thread-task-' + Date.now();
    createConversation(taskThread, 'C123', 'task', 'Add feature', 'feature', [], 'ctx');
    expect(shouldCreateTicketFromQuestion(taskThread, 'create a ticket')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
npm test
```

Expected: `shouldCreateTicketFromQuestion is not a function` (not yet exported).

- [ ] **Step 3: Add `hintedReporterSlackId` to `ConversationState`**

In `src/services/conversation.service.ts`, add the field after `slackUserId` in the `ConversationState` interface (around line 35):

```typescript
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
  generatedSpec?: string;
  jiraTicketKey?: string;
  slackUserId?: string;
  hintedReporterSlackId?: string;
  resolvedReporterAccountId?: string;
  resolvedReporterName?: string;
  resolvedSprintId?: number;
  resolvedSprintName?: string;
  pendingReporterOptions?: Array<{ accountId: string; displayName: string }>;
  pendingSprintOptions?: Array<{ id: number; name: string; state: string }>;
}
```

- [ ] **Step 4: Add `TICKET_CREATION_TRIGGERS` constant**

Add this after the `MODE_SWITCH_TRIGGERS` constant (around line 102):

```typescript
export const TICKET_CREATION_TRIGGERS = [
  'create ticket',
  'create a ticket',
  'make ticket',
  'make a ticket',
  'open a ticket',
  'log a ticket',
  'create jira',
  'make a jira',
  'open jira',
  'file a ticket',
  'submit a ticket',
];
```

- [ ] **Step 5: Add `shouldCreateTicketFromQuestion` function**

Add this function after `shouldSwitchToTaskMode` (around line 310):

```typescript
export function shouldCreateTicketFromQuestion(threadTs: string, userMessage: string): boolean {
  const conv = conversations.get(threadTs);
  if (!conv || conv.mode !== 'question') return false;

  const withoutMentions = userMessage.toLowerCase().replace(/<@[a-z0-9]+>/gi, '').trim();
  return TICKET_CREATION_TRIGGERS.some(trigger => withoutMentions.includes(trigger));
}
```

- [ ] **Step 6: Add `setHintedReporter` function**

Add this function after `setResolvedSprint` (around line 376):

```typescript
export function setHintedReporter(threadTs: string, slackUserId: string): void {
  const conv = conversations.get(threadTs);
  if (conv) {
    conv.hintedReporterSlackId = slackUserId;
    persistConversations();
  }
}
```

- [ ] **Step 7: Add `hintedReporterSlackId` to `toPersistedConversation`**

In the `toPersistedConversation` function (around line 131), add the field after `slackUserId`:

```typescript
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
    slackUserId: conv.slackUserId,
    hintedReporterSlackId: conv.hintedReporterSlackId,
    resolvedReporterAccountId: conv.resolvedReporterAccountId,
    resolvedReporterName: conv.resolvedReporterName,
    resolvedSprintId: conv.resolvedSprintId,
    resolvedSprintName: conv.resolvedSprintName,
    pendingReporterOptions: conv.pendingReporterOptions,
    pendingSprintOptions: conv.pendingSprintOptions,
  };
}
```

- [ ] **Step 8: Run tests — expect all to pass**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 9: Verify TypeScript compiles**

```bash
npm run build
```

Expected: No errors.

- [ ] **Step 10: Commit**

```bash
git add src/services/conversation.service.ts src/services/conversation.service.test.ts
git commit -m "feat: add ticket-creation triggers and hinted reporter to conversation service"
```

---

## Task 5: Fix `thread.handler.ts` — mention filter + question-mode ticket path

**Files:**
- Modify: `src/handlers/thread.handler.ts`

- [ ] **Step 1: Update imports**

At the top of `src/handlers/thread.handler.ts`, add `shouldCreateTicketFromQuestion`, `setHintedReporter`, and `TICKET_CREATION_TRIGGERS` to the import from `conversation.service`:

```typescript
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
  shouldCreateTicketFromQuestion,
  setHintedReporter,
  TICKET_CREATION_TRIGGERS,
} from '../services/conversation.service';
```

- [ ] **Step 2: Fix the user-mention filter**

Find the block starting at around line 255 (the `otherUserMentions` block) and replace it:

**Old code:**
```typescript
  const otherUserMentions = (userMessage.match(/<@[A-Z0-9]+>/g) || [])
    .filter(mention => mention !== `<@${botUserId}>`);
  if (otherUserMentions.length > 0) {
    const textWithoutMentions = userMessage.replace(/<@[A-Z0-9]+>/g, '').trim();
    // If the non-mention text is short and doesn't contain substantive answers, skip
    if (textWithoutMentions.length < 120 && !textWithoutMentions.includes('\n')) {
      return;
    }
  }
```

**New code:**
```typescript
  const otherUserMentions = (userMessage.match(/<@[A-Z0-9]+>/g) || [])
    .filter(mention => mention !== `<@${botUserId}>`);
  if (otherUserMentions.length > 0) {
    const textWithoutMentions = userMessage.replace(/<@[A-Z0-9]+>/g, '').trim();
    const hasTicketTrigger = TICKET_CREATION_TRIGGERS.some(t =>
      textWithoutMentions.toLowerCase().includes(t)
    );
    // Drop mention-only messages unless they contain an actionable ticket creation command
    if (!hasTicketTrigger && textWithoutMentions.length < 120 && !textWithoutMentions.includes('\n')) {
      return;
    }
  }
```

- [ ] **Step 3: Add question-mode ticket creation path**

In the `if (conversation.mode === 'question')` block (around line 278), add the ticket creation check BEFORE the `shouldSwitchToTaskMode` check:

**Old code (start of question mode block):**
```typescript
  if (conversation.mode === 'question') {
    // Check if user wants to switch to task/spec mode
    if (shouldSwitchToTaskMode(threadTs, userMessage)) {
```

**New code:**
```typescript
  if (conversation.mode === 'question') {
    // Check if user wants to create a Jira ticket from this Q&A thread
    if (shouldCreateTicketFromQuestion(threadTs, userMessage)) {
      // Extract the last non-bot mention as reporter hint (e.g., "create ticket for @Juan")
      const mentionMatches = (userMessage.match(/<@[A-Z0-9]+>/g) || [])
        .filter(m => m !== `<@${botUserId}>`);
      if (mentionMatches.length > 0) {
        const lastMention = mentionMatches[mentionMatches.length - 1];
        const hintedSlackId = lastMention.replace(/<@([A-Z0-9]+)>/, '$1');
        setHintedReporter(threadTs, hintedSlackId);
      }

      await say({
        text: ':memo: Generating a spec from our conversation for your review...',
        thread_ts: threadTs,
      });

      try {
        const spec = await generateSpec(
          conversation.originalRequest,
          conversation.codebaseContext,
          conversation.history
        );

        await say({ text: spec, thread_ts: threadTs });
        await say({
          text: ":ticket: Does this look right? Reply *'yes'* or *'create ticket'* to create a Jira ticket, or suggest any changes.",
          thread_ts: threadTs,
        });

        setAwaitingJiraChoice(threadTs, spec);
      } catch (error: any) {
        await say({
          text: `:warning: Failed to generate spec: ${error.message}\n\nPlease try again or start a new thread.`,
          thread_ts: threadTs,
        });
      }
      return;
    }

    // Check if user wants to switch to task/spec mode
    if (shouldSwitchToTaskMode(threadTs, userMessage)) {
```

- [ ] **Step 4: Prefer hinted reporter during Jira creation**

Find the `resolveReporterFromSlack` call inside the `awaiting_jira_choice` block (around line 362):

**Old code:**
```typescript
        const [resolvedReporter, activeSprint] = await Promise.all([
          resolveReporterFromSlack(conversation.slackUserId, client),
          getActiveSprint(),
        ]);
```

**New code:**
```typescript
        const reporterSlackId = conversation.hintedReporterSlackId ?? conversation.slackUserId;
        const [resolvedReporter, activeSprint] = await Promise.all([
          resolveReporterFromSlack(reporterSlackId, client),
          getActiveSprint(),
        ]);
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npm run build
```

Expected: No errors. If there are type errors on `conversation.hintedReporterSlackId`, it means the field wasn't added to `ConversationState` in Task 4 — go back and verify Step 3 of Task 4.

- [ ] **Step 6: Run all tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/handlers/thread.handler.ts
git commit -m "fix: handle create-ticket commands in question-mode threads and fix mention filter"
```

---

## Task 6: Manual smoke test

No automated test covers the full Slack event flow. Do a quick manual verification before calling this done.

- [ ] **Step 1: Start the bot in dev mode**

```bash
npm run dev
```

Expected: Bot starts, logs "Slack TaskBot is running!"

- [ ] **Step 2: Test Bug 1 fix — codebase question not showing help**

In Slack, send: `@BackendTaskBot how to use playlists/archives/public timeshift?`

Expected: Bot posts ":thinking_face: Analyzing..." and then answers the codebase question. It should NOT post the help message.

- [ ] **Step 3: Test Bug 1 — real help request still works**

In Slack, send: `@BackendTaskBot how to use this`

Expected: Bot posts the full help message.

- [ ] **Step 4: Test Bug 2 fix — create ticket from question thread**

In Slack, send a codebase question: `@BackendTaskBot are the playlist endpoints protected?`

Wait for the bot's answer. Then in the same thread, send: `create a ticket`

Expected: Bot posts ":memo: Generating a spec..." then posts the spec, then asks "Does this look right? Reply 'yes' or 'create ticket'..."

- [ ] **Step 5: Test Bug 2b — create ticket with reporter hint**

In a new question thread, after the bot answers, send: `@BackendTaskBot create a ticket for @Juan Jose Lopez`

Expected: Bot generates spec and (after you confirm) sets Juan as reporter during Jira creation.

- [ ] **Step 6: Test mention-filter fix**

In a question thread, send: `@Sandra @BackendTaskBot create a ticket for @Juan Jose Lopez`

Expected: Bot does NOT silently drop the message — it generates the spec and proceeds.
