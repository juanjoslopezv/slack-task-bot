import { Version3Client } from 'jira.js';
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

export interface JiraTicketResult {
  success: boolean;
  key?: string;
  url?: string;
  error?: string;
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
 * Create a Jira ticket with the spec content
 */
export async function createJiraTicket(
  spec: string,
  taskType: 'feature' | 'fix' | 'change' | null
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

    // Prepare the issue fields
    const fields: any = {
      project: {
        key: config.jira.projectKey,
      },
      summary,
      description: spec,
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
    if (error.response?.data?.errorMessages) {
      errorMessage = error.response.data.errorMessages.join(', ');
    } else if (error.response?.data?.errors) {
      const errors = error.response.data.errors;
      errorMessage = Object.keys(errors).map(key => `${key}: ${errors[key]}`).join(', ');
    } else if (error.message) {
      errorMessage = error.message;
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}
