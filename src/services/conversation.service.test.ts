import { describe, it, expect, beforeEach } from 'vitest';
import {
  createConversation,
  shouldCreateTicketFromQuestion,
  TICKET_CREATION_TRIGGERS,
  setHintedReporter,
  getConversation,
  parseNumericSelection,
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

describe('parseNumericSelection', () => {
  it('parses a bare number', () => {
    expect(parseNumericSelection('5', 16)).toBe(4);
  });

  it('parses "option N" and "#N" forms', () => {
    expect(parseNumericSelection('option 3', 16)).toBe(2);
    expect(parseNumericSelection('#3', 16)).toBe(2);
  });

  it('parses a number when the bot is @-mentioned in the reply', () => {
    // Slack sends the literal mention markup, e.g. "@BackendTaskBot 5" => "<@U07BOT123> 5"
    expect(parseNumericSelection('<@U07BOT123> 5', 16)).toBe(4);
  });

  it('parses a number followed by the option label', () => {
    expect(parseNumericSelection('5. Pablo Zarate', 16)).toBe(4);
    expect(parseNumericSelection('<@U07BOT123> 5. Pablo Zarate', 16)).toBe(4);
  });

  it('returns -1 when out of range', () => {
    expect(parseNumericSelection('17', 16)).toBe(-1);
    expect(parseNumericSelection('0', 16)).toBe(-1);
  });

  it('returns -1 for non-numeric input', () => {
    expect(parseNumericSelection('skip', 16)).toBe(-1);
    expect(parseNumericSelection('<@U07BOT123> hello there', 16)).toBe(-1);
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
