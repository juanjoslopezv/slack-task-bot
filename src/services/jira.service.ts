import { Version3Client, AgileClient } from 'jira.js';
import { config } from '../config';

// Initialize Jira client only if configuration is provided
const jiraClient = config.jira.url && config.jira.email && config.jira.apiToken
  ? new Version3Client({
      host: config.jira.url,
      authentication: {
        basic: {
          email: config.jira.email,
          apiToken: config.jira.apiToken,
        },
      },
    })
  : null;

const agileClient = config.jira.url && config.jira.email && config.jira.apiToken
  ? new AgileClient({
      host: config.jira.url,
      authentication: {
        basic: {
          email: config.jira.email,
          apiToken: config.jira.apiToken,
        },
      },
    })
  : null;

export interface JiraTicketResult {
  success: boolean;
  key?: string;
  url?: string;
  error?: string;
}

export interface JiraSprint {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  active: boolean;
}

/**
 * Check if Jira is configured and ready to use
 */
export function isJiraConfigured(): boolean {
  return jiraClient !== null && !!config.jira.projectKey;
}

/**
 * Parse the spec title from the first line
 * Expected format: *Task Specification: Title Here*
 */
export function parseSpecTitle(spec: string): string {
  // Try to extract title from first line
  const titleMatch = spec.match(/\*Task Specification:\s*(.+?)\*/);
  if (titleMatch && titleMatch[1]) {
    return titleMatch[1].trim();
  }

  // Fallback: use first non-empty line
  const firstLine = spec.split('\n').find(line => line.trim());
  if (firstLine) {
    // Remove markdown formatting
    return firstLine.replace(/\*/g, '').trim();
  }

  // Final fallback
  return 'Task from Slack';
}

/**
 * Map task type to Jira issue type
 */
export function mapTaskTypeToJiraIssueType(
  taskType: 'feature' | 'fix' | 'change' | null
): string {
  switch (taskType) {
    case 'feature':
      return 'Story';
    case 'fix':
      return 'Bug';
    case 'change':
      return 'Task';
    default:
      return 'Task'; // Default to Task if unknown
  }
}

/**
 * Get the active sprint for the configured board.
 * Returns null if no active sprint or board not configured.
 */
export async function getActiveSprint(): Promise<JiraSprint | null> {
  if (!agileClient || !config.jira.boardId) return null;

  try {
    const result = await agileClient.board.getAllSprints({
      boardId: parseInt(config.jira.boardId, 10),
      state: 'active',
    });

    const sprints = result.values || [];
    if (sprints.length > 0) {
      const s = sprints[0];
      return {
        id: s.id!,
        name: s.name!,
        state: s.state || 'active',
        startDate: s.startDate,
        endDate: s.endDate,
      };
    }

    return null;
  } catch (error: any) {
    console.error('Failed to get active sprint:', error.message);
    return null;
  }
}

/**
 * Get active and future sprints for user selection.
 * Returns empty array if board not configured.
 */
export async function getRecentSprints(): Promise<JiraSprint[]> {
  if (!agileClient || !config.jira.boardId) return [];

  try {
    const result = await agileClient.board.getAllSprints({
      boardId: parseInt(config.jira.boardId, 10),
      state: 'active,future',
      maxResults: 10,
    });

    return (result.values || []).map(s => ({
      id: s.id!,
      name: s.name!,
      state: s.state || 'unknown',
      startDate: s.startDate,
      endDate: s.endDate,
    }));
  } catch (error: any) {
    console.error('Failed to get recent sprints:', error.message);
    return [];
  }
}

/**
 * Move an issue to a sprint (post-creation).
 * Uses the Agile API to avoid custom field ID issues.
 */
export async function moveIssueToSprint(
  issueKey: string,
  sprintId: number
): Promise<{ success: boolean; error?: string }> {
  if (!agileClient) {
    return { success: false, error: 'Agile client not configured' };
  }

  try {
    await agileClient.sprint.moveIssuesToSprintAndRank({
      sprintId,
      issues: [issueKey],
    });
    return { success: true };
  } catch (error: any) {
    console.error('Failed to move issue to sprint:', error.message);
    return { success: false, error: error.message || 'Unknown error' };
  }
}

/**
 * Search for a Jira user by email address.
 * Returns the first matching active user, or null.
 */
export async function findJiraUserByEmail(
  email: string
): Promise<JiraUser | null> {
  if (!jiraClient) return null;

  try {
    const users = await jiraClient.userSearch.findUsers({
      query: email,
      maxResults: 5,
    });

    const match = users.find(
      u => u.active && u.emailAddress?.toLowerCase() === email.toLowerCase()
    );

    if (match) {
      return {
        accountId: match.accountId!,
        displayName: match.displayName || 'Unknown',
        emailAddress: match.emailAddress,
        active: match.active!,
      };
    }

    return null;
  } catch (error: any) {
    console.error('Failed to find Jira user by email:', error.message);
    return null;
  }
}

/**
 * Get users assignable to the configured project.
 * Used as fallback when email-based lookup fails.
 */
export async function getAssignableProjectUsers(): Promise<JiraUser[]> {
  if (!jiraClient || !config.jira.projectKey) return [];

  try {
    const users = await jiraClient.userSearch.findAssignableUsers({
      project: config.jira.projectKey,
      maxResults: 20,
    });

    return users
      .filter(u => u.active)
      .map(u => ({
        accountId: u.accountId!,
        displayName: u.displayName || 'Unknown',
        emailAddress: u.emailAddress,
        active: u.active!,
      }));
  } catch (error: any) {
    console.error('Failed to get assignable users:', error.message);
    return [];
  }
}

/**
 * Convert plain text to Atlassian Document Format (ADF).
 * Splits on blank lines into paragraphs, and uses hardBreak for single newlines.
 */
function textToAdf(text: string): object {
  const paragraphs = text.split(/\n{2,}/);

  const content = paragraphs
    .filter(p => p.trim())
    .map(paragraph => {
      const lines = paragraph.split('\n');
      const inlineContent: any[] = [];

      lines.forEach((line, i) => {
        if (i > 0) {
          inlineContent.push({ type: 'hardBreak' });
        }
        if (line) {
          inlineContent.push({ type: 'text', text: line });
        }
      });

      return {
        type: 'paragraph',
        content: inlineContent,
      };
    });

  return {
    type: 'doc',
    version: 1,
    content,
  };
}

/**
 * Create a Jira ticket with the spec content
 */
export async function createJiraTicket(
  spec: string,
  taskType: 'feature' | 'fix' | 'change' | null,
  reporterAccountId?: string
): Promise<JiraTicketResult> {
  // Check if Jira is configured
  if (!isJiraConfigured() || !jiraClient) {
    return {
      success: false,
      error: 'Jira is not configured. Please set JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN, and JIRA_PROJECT_KEY.',
    };
  }

  try {
    // Parse the spec
    const summary = parseSpecTitle(spec);
    const issueType = mapTaskTypeToJiraIssueType(taskType);

    // Convert spec text to Atlassian Document Format (ADF)
    // ADF text nodes cannot contain newlines — split into paragraphs
    const adfDescription = textToAdf(spec);

    // Prepare the issue fields
    const fields: any = {
      project: {
        key: config.jira.projectKey,
      },
      summary,
      description: adfDescription,
      issuetype: {
        name: issueType,
      },
    };

    // Add assignee if configured
    if (config.jira.defaultAssigneeId) {
      fields.assignee = {
        id: config.jira.defaultAssigneeId,
      };
    }

    // Add reporter if provided
    if (reporterAccountId) {
      fields.reporter = {
        id: reporterAccountId,
      };
    }

    // Create the issue
    const response = await jiraClient.issues.createIssue({
      fields,
    });

    // Construct the ticket URL
    const ticketUrl = `${config.jira.url}/browse/${response.key}`;

    return {
      success: true,
      key: response.key,
      url: ticketUrl,
    };
  } catch (error: any) {
    console.error('Failed to create Jira ticket:', error);

    // Extract meaningful error message
    let errorMessage = 'Unknown error occurred';
    const errorMessages = error.response?.data?.errorMessages;
    const fieldErrors = error.response?.data?.errors;

    if (errorMessages?.length) {
      errorMessage = errorMessages.join(', ');
    } else if (fieldErrors && Object.keys(fieldErrors).length) {
      errorMessage = Object.keys(fieldErrors)
        .map(key => `${key}: ${JSON.stringify(fieldErrors[key])}`)
        .join(', ');
    } else if (error.message) {
      errorMessage = error.message;
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}
