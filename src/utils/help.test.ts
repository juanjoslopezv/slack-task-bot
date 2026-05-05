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

  it('matches "how to use <@U123ABC>" (mention stripped → empty remainder)', () => {
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
