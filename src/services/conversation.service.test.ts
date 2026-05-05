import { describe, it, expect, beforeEach } from 'vitest';
import {
  createConversation,
  shouldCreateTicketFromQuestion,
  TICKET_CREATION_TRIGGERS,
  setHintedReporter,
  getConversation,
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

describe('setHintedReporter', () => {
  it('stores hintedReporterSlackId on the conversation', () => {
    const ts = 'test-hint-reporter-' + Date.now();
    createConversation(ts, 'C123', 'question', 'Some question', null, [], 'ctx');
    setHintedReporter(ts, 'U999ABC');
    const conv = getConversation(ts);
    expect(conv?.hintedReporterSlackId).toBe('U999ABC');
  });
});
