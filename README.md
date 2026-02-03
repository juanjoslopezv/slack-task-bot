# Slack Rovr TaskBot

A Node.js Slack bot that analyzes your Strapi codebase to intelligently spec out tasks. The bot asks clarifying questions, generates detailed task specifications, and optionally creates Jira tickets—all within Slack threads.

## Features

### 🤖 Intelligent Task Specification
- **Codebase-aware**: Automatically indexes your Strapi content types, schemas, and custom routes
- **Smart questioning**: Asks targeted follow-up questions based on actual codebase structure
- **Context-rich specs**: Generates detailed specifications including affected files, schema changes, API endpoints, and business logic

### 🔄 Flexible Conversation Modes
- **Question Mode**: Answer general questions about your codebase
- **Task Mode**: Create detailed task specifications with follow-up questions
- **Seamless Switching**: Convert a question thread into a task specification anytime

### 🎫 Jira Integration (Optional)
- **One-click ticket creation**: Automatically create Jira tickets from generated specs
- **Smart mapping**: Feature → Story, Fix → Bug, Change → Task
- **Full spec in description**: Entire specification transferred to Jira with parsed title

### 🚀 Production Ready
- **Railway deployment**: Built-in configuration for zero-config cloud deployment
- **Auto-updating**: Webhook support to refresh codebase context on Strapi changes
- **Error handling**: Graceful failures with helpful error messages
- **Auto-cleanup**: Conversation state automatically cleaned up after 24 hours

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Deployment](#deployment)
- [Architecture](#architecture)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- Node.js 18+ and npm
- A Slack workspace with admin access
- Anthropic API key (Claude)
- Access to your Strapi codebase
- (Optional) Jira Cloud instance and API credentials

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourorg/slack-rovr-taskbot.git
cd slack-rovr-taskbot
npm install
```

### 2. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app
2. **OAuth & Permissions** → Add these Bot Token Scopes:
   - `app_mentions:read`
   - `chat:write`
   - `channels:history`
   - `groups:history`
   - `commands` (if using slash commands)

3. **Socket Mode** → Enable and generate an app-level token (starts with `xapp-`)

4. **Event Subscriptions** → Subscribe to:
   - `app_mention`
   - `message.channels`
   - `message.groups`

5. (Optional) **Slash Commands** → Add `/task` command

6. **Install App** to your workspace

### 3. Get API Credentials

**Anthropic API:**
- Sign up at [console.anthropic.com](https://console.anthropic.com)
- Generate an API key

**Jira (Optional):**
- Go to [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
- Create an API token
- Note your Jira site URL and email

### 4. Configure Environment

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-level-token

# Anthropic API
ANTHROPIC_API_KEY=sk-ant-your-api-key

# Strapi Project Path (local development)
STRAPI_PROJECT_PATH=/path/to/your/strapi/project

# Optional: Claude Model
CLAUDE_MODEL=claude-sonnet-4-20250514

# Optional: Jira Integration
JIRA_URL=https://yourcompany.atlassian.net
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your-jira-api-token
JIRA_PROJECT_KEY=ROVR
JIRA_DEFAULT_ASSIGNEE_ID=557058:82f65dc4-b2d1-44d4-941b-6265205d1f68
```

## Configuration

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SLACK_BOT_TOKEN` | Bot User OAuth Token from Slack | `xoxb-...` |
| `SLACK_SIGNING_SECRET` | Signing secret from app Basic Information | `abc123...` |
| `SLACK_APP_TOKEN` | App-level token for Socket Mode | `xapp-...` |
| `ANTHROPIC_API_KEY` | Claude API key | `sk-ant-...` |
| `STRAPI_PROJECT_PATH` | Path to Strapi codebase (local) | `/Users/you/strapi` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CLAUDE_MODEL` | Claude model to use | `claude-sonnet-4-20250514` |
| `JIRA_URL` | Jira instance URL | - |
| `JIRA_EMAIL` | Jira account email | - |
| `JIRA_API_TOKEN` | Jira API token | - |
| `JIRA_PROJECT_KEY` | Jira project key | - |
| `JIRA_DEFAULT_ASSIGNEE_ID` | Default assignee ID | - |

### Railway Deployment Variables

For Railway deployment (see [DEPLOYMENT.md](DEPLOYMENT.md)):

| Variable | Description | Default |
|----------|-------------|---------|
| `STRAPI_REPO_URL` | Git URL of Strapi repository | - |
| `STRAPI_REPO_BRANCH` | Branch to clone | `dev` |
| `STRAPI_CLONE_PATH` | Clone destination path | `/app/strapi-repo` |

## Usage

### Start the Bot

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm run build
npm start
```

### Using the Bot in Slack

#### 1. Ask Questions About the Codebase

```
@TaskBot How does authentication work in this app?
```

The bot will analyze your Strapi codebase and answer questions based on actual schemas and routes.

#### 2. Create Task Specifications

```
@TaskBot I need to add a password reset feature
```

The bot will:
1. Classify the request (feature/fix/change)
2. Identify relevant content types and routes
3. Ask targeted clarifying questions
4. Generate a detailed specification

#### 3. Switch from Questions to Tasks

Start with questions:
```
You: @TaskBot What fields does the User content type have?
Bot: [Lists fields...]

You: How is email validation handled?
Bot: [Explains validation...]
     💡 Tip: If you'd like to turn this into a task specification,
     just say "create a spec" or "generate spec".

You: Actually, create a spec for improving email validation
Bot: :gear: Switching to task mode...
     [Asks task-focused questions...]
```

#### 4. Generate Specification

After answering questions, trigger spec generation:
```
You: generate spec
```

Or any of these phrases:
- "ready"
- "looks good"
- "that's all"
- "done"
- "go ahead"

#### 5. Create Jira Ticket (Optional)

If Jira is configured, the bot will offer:
```
Bot: :ticket: Would you like me to create a Jira ticket for this task?
     Reply 'yes' or 'create ticket' to proceed, or 'no' / 'skip' if not needed.

You: yes
Bot: :white_check_mark: Jira ticket created: ROVR-123
     [Link to ticket]
```

### Conversation Flow Examples

**Task Specification Flow:**
```
1. User: "@TaskBot Add ability to export user data to CSV"
2. Bot: "Feature: Export user data
        - Which fields should be included in the export?
        - Should admins be able to export all users or just their own data?
        - ..."
3. User: [Answers questions]
4. Bot: [More questions or "I have enough info, say 'generate spec'"]
5. User: "generate spec"
6. Bot: [Posts detailed specification]
7. Bot: "Would you like me to create a Jira ticket?"
8. User: "yes"
9. Bot: "✅ Jira ticket created: ROVR-456"
```

**Question to Task Flow:**
```
1. User: "@TaskBot How do we handle file uploads?"
2. Bot: [Explains file upload implementation]
3. User: "What's the max file size?"
4. Bot: [Answers] 💡 Tip: Turn this into a task specification with "create a spec"
5. User: "create a spec for increasing file size limits"
6. Bot: :gear: Switching to task mode...
        [Asks task questions...]
```

### Slash Command (Optional)

If you've configured the `/task` command:

```
/task Add real-time notifications for new messages
```

## Deployment

### Railway (Recommended)

The bot includes built-in Railway deployment configuration that automatically clones your Strapi repository during build.

**Quick Deploy:**

1. Push to GitHub
2. Create new Railway project from GitHub repo
3. Add environment variables (see [DEPLOYMENT.md](DEPLOYMENT.md))
4. Deploy automatically handles:
   - Cloning Strapi repository
   - Indexing content types
   - Building and starting the bot

**Full guide:** See [DEPLOYMENT.md](DEPLOYMENT.md) for complete Railway deployment instructions.

### Other Platforms

The bot can run on any Node.js hosting platform:

1. Set environment variables
2. Ensure Strapi codebase is accessible at `STRAPI_PROJECT_PATH`
3. Run `npm install && npm run build && npm start`

## Architecture

### Project Structure

```
slack-rovr-taskbot/
├── src/
│   ├── app.ts                      # Bolt app setup, event listeners
│   ├── config.ts                   # Environment variable validation
│   ├── handlers/
│   │   ├── message.handler.ts      # @mention → classify → ask questions
│   │   └── thread.handler.ts       # Thread replies → questions/spec/Jira
│   ├── services/
│   │   ├── claude.service.ts       # Anthropic API interactions
│   │   ├── codebase.service.ts     # Strapi schema/route indexing
│   │   ├── conversation.service.ts # Thread state management
│   │   └── jira.service.ts         # Jira API integration
│   └── utils/
│       ├── strapi-schema.ts        # Schema parsing utilities
│       └── prompts.ts              # Claude system prompts
├── scripts/
│   └── setup-strapi.sh             # Railway: Clone Strapi repo
├── railway.json                     # Railway deployment config
├── DEPLOYMENT.md                    # Deployment guide
└── package.json
```

### How It Works

#### 1. Startup: Codebase Indexing
```typescript
// On bot startup
getCodebaseIndex() // Indexes all Strapi content types and routes
```

Discovers:
- Content type schemas (`src/api/*/content-types/*/schema.json`)
- Custom routes (`src/api/*/routes/*.ts`)
- Field definitions, relationships, validations

#### 2. Request Classification
```typescript
User: "@TaskBot Add user profile images"
       ↓
classifyRequest() // Claude analyzes intent
       ↓
{
  intent: 'task',
  type: 'feature',
  affectedAreas: ['user'],
  summary: 'Add user profile images'
}
```

#### 3. Question Generation
```typescript
generateQuestions(request, codebaseContext, history)
       ↓
Claude asks targeted questions based on:
- Actual User content type schema
- Existing media/upload patterns
- Related routes and controllers
```

#### 4. Spec Generation
```typescript
User: "generate spec"
       ↓
generateSpec(request, context, Q&A history)
       ↓
Returns structured specification:
- Task title, type, summary
- User story
- Acceptance criteria
- Technical implementation
- Affected files and schemas
- Verification steps
```

#### 5. Jira Ticket Creation (Optional)
```typescript
createJiraTicket(spec, taskType)
       ↓
{
  summary: "Add user profile images",
  description: [Full spec text],
  issueType: "Story", // feature → Story
  assignee: [Default assignee]
}
```

### Conversation State Management

Each thread maintains isolated state:
```typescript
{
  mode: 'question' | 'task',
  stage: 'questioning' | 'awaiting_jira_choice' | 'complete',
  history: [{ role: 'user', content: '...' }, ...],
  codebaseContext: "...",
  questionRounds: 3,
  generatedSpec?: "...",
  jiraTicketKey?: "ROVR-123"
}
```

State is:
- Stored in-memory (Map by thread_ts)
- Automatically cleaned up after 24 hours
- Thread-isolated (multiple concurrent conversations)

## Development

### Build and Run

```bash
# Development with hot reload
npm run dev

# Build TypeScript
npm run build

# Run production build
npm start
```

### Testing Locally

1. Set `STRAPI_PROJECT_PATH` to your local Strapi project
2. Start the bot: `npm run dev`
3. Message the bot in Slack
4. Check console logs for debugging

### Modifying Prompts

System prompts are in `src/utils/prompts.ts`:

- `CLASSIFICATION_PROMPT` - Determines intent and task type
- `QUESTION_GENERATION_PROMPT` - Generates follow-up questions
- `SPEC_GENERATION_PROMPT` - Formats final specifications
- `QUESTION_ANSWERING_PROMPT` - Answers codebase questions

### Adding New Features

The modular architecture makes it easy to extend:

1. **New service**: Add to `src/services/`
2. **New handler logic**: Modify `src/handlers/thread.handler.ts`
3. **New conversation state**: Update `src/services/conversation.service.ts`
4. **New config**: Add to `src/config.ts` and `.env.example`

## Troubleshooting

### Bot doesn't respond to @mentions

- Verify Socket Mode is enabled in Slack app settings
- Check `SLACK_APP_TOKEN` is set correctly
- Ensure bot is invited to the channel
- Review console logs for connection errors

### "Failed to index codebase"

- Verify `STRAPI_PROJECT_PATH` points to correct directory
- Ensure directory has `src/api/` structure
- Check file permissions (bot needs read access)
- Look for errors in console output

### Jira ticket creation fails

- Verify all Jira environment variables are set
- Check Jira credentials (email + API token)
- Ensure `JIRA_PROJECT_KEY` exists in your Jira instance
- Review Jira project permissions (can you create issues?)
- Check bot console logs for specific Jira API errors

### Conversations not completing

- Check if conversation hit 5 question rounds (auto-completes)
- Verify trigger phrases are working ("generate spec", "ready", etc.)
- Review conversation state in logs
- Restart bot to clear stuck conversations

### Railway deployment issues

See [DEPLOYMENT.md](DEPLOYMENT.md) troubleshooting section.

## Advanced Usage

### Custom Question Rounds Limit

Default: 5 rounds. Modify in `src/services/conversation.service.ts`:
```typescript
const MAX_QUESTION_ROUNDS = 10; // Increase to 10
```

### Different Claude Models

Set in environment:
```bash
CLAUDE_MODEL=claude-opus-4-20250514  # More powerful, slower
CLAUDE_MODEL=claude-haiku-3-20250307 # Faster, less detailed
```

### Multiple Jira Projects

Currently supports one project. To support multiple:
1. Extend `JIRA_PROJECT_KEY` to accept project-specific keys
2. Modify `jira.service.ts` to accept project parameter
3. Update classification to determine appropriate project

### Webhook Auto-Updates (Railway)

Keep bot's codebase context fresh:

1. Railway: **Settings → Webhooks** → Copy URL
2. Strapi Repo: **Settings → Webhooks** → Add webhook
3. Trigger on: Push to `dev` branch
4. Bot automatically redeploys and re-indexes codebase

## Tech Stack

- **Runtime**: Node.js 18+, TypeScript
- **Slack SDK**: `@slack/bolt` (Socket Mode)
- **AI**: `@anthropic-ai/sdk` (Claude)
- **Jira**: `jira.js` (Cloud API v3)
- **Deployment**: Railway, Docker, or any Node.js host

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- **Bug reports**: Open a GitHub issue
- **Feature requests**: Open a GitHub discussion
- **Deployment help**: See [DEPLOYMENT.md](DEPLOYMENT.md)

## Acknowledgments

Built with:
- [Slack Bolt](https://slack.dev/bolt-js/)
- [Anthropic Claude API](https://www.anthropic.com/api)
- [Jira.js](https://github.com/MrRefactoring/jira.js)
- [Railway](https://railway.app)

---

**Made with ❤️ for better task specification workflows**
