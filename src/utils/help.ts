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

export const HELP_TRIGGERS = [
  'help',
  'how do i use',
  'how to use',
  'what can you do',
  'commands',
  'instructions',
  'guide',
  'how does this work',
];

export function isHelpRequest(message: string): boolean {
  const normalized = message.toLowerCase().trim();

  // Strip Slack user mentions — if someone is tagging other users
  // (e.g., "@Shak can you help us?"), it's not a help request to the bot
  const withoutMentions = normalized.replace(/<@[a-z0-9]+>/gi, '').trim();

  // Direct "help" or "?"
  if (withoutMentions === 'help' || withoutMentions === '?') {
    return true;
  }

  // If the original message contains user mentions, it's likely directed
  // at those users, not a help request to the bot
  if (/<@[a-z0-9]+>/i.test(normalized)) {
    return false;
  }

  // Contains help triggers
  return HELP_TRIGGERS.some(trigger => withoutMentions.includes(trigger));
}
