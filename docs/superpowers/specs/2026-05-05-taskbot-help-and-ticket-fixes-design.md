# Design: TaskBot Help Trigger Fix + Question-Mode Ticket Creation

**Date:** 2026-05-05  
**Status:** Approved

---

## Problem Statement

Two bugs observed in production:

1. **False help message** — A codebase question like `"how to use playlists/archives/public timeshift?"` triggers the help message because `HELP_TRIGGERS` includes the string `'how to use'` and `isHelpRequest` uses a naive `.includes()` check.

2. **"Create ticket" fails in question-mode threads** — When a user asks a codebase question (bot enters question mode) and then says `"create a ticket"` in the thread:
   - If the message also tags other Slack users (e.g., `"@Sandra @BackendTaskBot create a ticket for @Juan Jose Lopez"`), the user-mention filter silently drops it.
   - If the message reaches the handler, question mode has no ticket-creation path — Claude answers "I can't create tickets."

---

## Scope

Three files change:

| File | Change |
|------|--------|
| `src/utils/help.ts` | Smarter boundary check for `'how to use'` / `'how do i use'` triggers |
| `src/services/conversation.service.ts` | Add `TICKET_CREATION_TRIGGERS` + `shouldCreateTicketFromQuestion()` |
| `src/handlers/thread.handler.ts` | Fix mention filter; add question-mode ticket creation path |

---

## Section 1 — Fix `isHelpRequest` (help.ts)

### Rule

`'how to use'` and `'how do i use'` are context-sensitive triggers: they should fire only when the user is asking about the bot itself, not about a codebase feature.

### Implementation

After stripping all Slack mentions (`<@...>`) from the message, check what remains after `'how to use'` or `'how do i use'`. Use a **whitelist** approach: only treat it as a help request if the remainder (trimmed) is empty or matches one of a small set of bot-reference terms.

**Bot-reference whitelist:** `""`, `"this"`, `"you"`, `"it"`, `"the bot"`, `"this bot"`, `"taskbot"`, `"the taskbot"`

**Matches (help request):**
- `"how to use"` — remainder is empty → match
- `"how to use this"` — remainder is `"this"` → match
- `"how to use @BackendTaskBot"` — mention stripped → remainder is empty → match
- `"how do i use the bot"` — remainder is `"the bot"` → match

**Does not match (codebase question):**
- `"how to use playlists/archives/public timeshift?"` — remainder is `"playlists/archives/public timeshift?"` → not in whitelist → no match
- `"how to use the playlist endpoint"` — remainder is `"the playlist endpoint"` → not in whitelist → no match

Note: `"≤ N words"` counting was rejected because `"how to use playlists/archives/public timeshift?"` is only 2 space-separated tokens after the trigger and would still match.

### No change to other triggers

`'help'`, `'?'`, `'commands'`, `'instructions'`, `'guide'`, `'how does this work'`, `'what can you do'` are specific enough — keep their existing `.includes()` logic.

---

## Section 2 — Ticket Creation from Question Mode

### 2a — New exports in `conversation.service.ts`

Add a `TICKET_CREATION_TRIGGERS` constant:

```
'create ticket', 'create a ticket', 'make ticket', 'make a ticket',
'open a ticket', 'log a ticket', 'create jira', 'make a jira',
'open jira', 'file a ticket', 'submit a ticket'
```

Add `shouldCreateTicketFromQuestion(threadTs, userMessage)`:
- Returns `true` only when `conversation.mode === 'question'` and the normalized message contains any trigger.
- Does **not** check stage — this is purely mode + keyword based.

### 2b — Fix user-mention filter in `thread.handler.ts`

Current filter drops messages that tag other users if the non-mention text is < 120 chars with no newlines. This silently drops `"@Sandra @BackendTaskBot create a ticket for @Juan Jose Lopez"`.

Fix: before dropping, check if the stripped text contains a ticket creation trigger. If it does, extract any non-bot Slack user IDs from the raw message as a **reporter hint** (`hintedReporterSlackId`) and continue processing.

```
raw: "@Sandra @BackendTaskBot create a ticket for @Juan Jose Lopez"
stripped: "create a ticket for"
→ contains ticket trigger → continue
→ extract non-bot mentions: [@Sandra, @Juan Jose Lopez] → use last one or let user confirm
```

For the reporter hint, take the **last non-bot mention** in the message (the person being nominated, e.g., `@Juan Jose Lopez`).

### 2c — Question-mode ticket creation flow in `thread.handler.ts`

After the mention-filter fix and before the existing `shouldSwitchToTaskMode` check, add:

```
if (shouldCreateTicketFromQuestion(threadTs, userMessage)) {
  // 1. Post "Generating spec for review..."
  // 2. Call generateSpec(originalRequest, codebaseContext, history)
  // 3. Post spec to thread
  // 4. Post "Does this look right? Reply 'yes' or 'create ticket' to proceed, or suggest changes."
  // 5. setAwaitingJiraChoice(threadTs, spec)
  //    — this sets stage to 'awaiting_jira_choice'
  // 6. Store hintedReporterSlackId on conversation if present
  //    — used during resolveReporterFromSlack instead of message sender's ID
  return;
}
```

After step 5, the conversation is in `awaiting_jira_choice` stage. The existing Jira creation path in the task-mode branch already handles this stage correctly — no duplication needed.

### 2d — Reporter hint resolution

In the existing `resolveReporterFromSlack()` call during `awaiting_jira_choice` handling, prefer `hintedReporterSlackId` over `conversation.slackUserId` when it is set.

This requires:
- Adding `hintedReporterSlackId?: string` to `ConversationState` and `PersistedConversation`
- A `setHintedReporter(threadTs, slackUserId)` setter in `conversation.service.ts`

---

## Section 3 — Error Handling

| Scenario | Behavior |
|----------|----------|
| No conversation state for thread | Reply: "I lost context of this conversation. Please start a new thread or briefly summarize what needs to be ticketed." Return early. |
| `generateSpec()` throws during question-mode ticket flow | Reply with error message; stay in `questioning` stage so user can retry. |
| Hinted reporter has no email / no Jira match | Fall through to normal assignable-user list (existing behavior). |
| "create ticket" in `stage === 'complete'` thread | Already handled by existing complete-stage guard — no change needed. |

---

## Data Flow Summary

```
User: "create a ticket for @Juan"  (in question-mode thread)
  ↓
mention filter: sees ticket trigger → extract @Juan as hintedReporterSlackId → continue
  ↓
shouldCreateTicketFromQuestion() → true
  ↓
generateSpec() using existing history
  ↓
Post spec + "Does this look right?"
  ↓
setAwaitingJiraChoice() + setHintedReporter()
  ↓
User: "yes"
  ↓
resolveReporterFromSlack(hintedReporterSlackId)  ← uses @Juan's Slack ID
  ↓
createJiraTicket()
```

---

## Out of Scope

- Double-response issue (bot posting two long answers to initial question) — not reproduced clearly enough to fix without more data
- Changing classification logic or Claude prompts
- Any UI/UX changes to the spec format
