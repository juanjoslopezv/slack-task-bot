import 'dotenv/config';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  slack: {
    botToken: requireEnv('SLACK_BOT_TOKEN'),
    signingSecret: requireEnv('SLACK_SIGNING_SECRET'),
    appToken: requireEnv('SLACK_APP_TOKEN'),
  },
  anthropic: {
    apiKey: requireEnv('ANTHROPIC_API_KEY'),
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
  },
  strapi: {
    projectPath: process.env.STRAPI_PROJECT_PATH || process.env.STRAPI_CLONE_PATH || '/app/strapi-repo',
  },
  jira: {
    url: process.env.JIRA_URL || '',
    email: process.env.JIRA_EMAIL || '',
    apiToken: process.env.JIRA_API_TOKEN || '',
    projectKey: process.env.JIRA_PROJECT_KEY || '',
    defaultAssigneeId: process.env.JIRA_DEFAULT_ASSIGNEE_ID || '',
  },
  conversation: {
    retentionHours: parseInt(process.env.CONVERSATION_RETENTION_HOURS || '24', 10),
    recoveryMaxHours: parseInt(process.env.RECOVERY_MAX_HOURS || '168', 10),
    enableHistoryRecovery: process.env.ENABLE_HISTORY_RECOVERY !== 'false', // Default: true
  },
};
