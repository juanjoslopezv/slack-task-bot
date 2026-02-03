# CLAUDE.md — Slack Rovr TaskBot

## Overview

A Node.js Slack bot (using Bolt) that listens for task requests (features, fixes, changes) in Slack, then uses the Anthropic Claude API to analyze the strapi.rovr codebase and ask intelligent follow-up questions in a thread to fully spec out the task before work begins.

## Project Structure

```
slack-rovr-taskbot/
├── src/
│   ├── app.ts                      # Bolt app setup, event listeners, /task command
│   ├── config.ts                   # Environment variable validation
│   ├── handlers/
│   │   ├── message.handler.ts      # Handles @mention → classify → ask questions
│   │   └── thread.handler.ts       # Handles thread replies → more questions or spec
│   ├── services/
│   │   ├── claude.service.ts       # Anthropic API: classify, generateQuestions, generateSpec
│   │   ├── codebase.service.ts     # Indexes strapi.rovr schemas and routes on startup
│   │   └── conversation.service.ts # In-memory thread state tracking (Map by thread_ts)
│   └── utils/
│       ├── strapi-schema.ts        # Parses Strapi schema.json into summaries
│       └── prompts.ts              # System prompts for each Claude interaction stage
```

## How It Works

1. On startup, indexes all strapi.rovr content-type schemas (`schema.json`) and custom routes
2. When @mentioned or via `/task`, classifies the request via Claude and builds relevant codebase context
3. Claude asks targeted follow-up questions referencing actual schemas, routes, and fields
4. User answers in the thread; Claude asks more questions or signals readiness
5. User says "generate spec" (or similar trigger phrase) → Claude produces a structured task specification
6. Conversations auto-cleanup after 24 hours; max 5 question rounds per thread

## Setup

### 1. Create a Slack App

1. Go to https://api.slack.com/apps and create a new app
2. Under **OAuth & Permissions**, add these Bot Token Scopes:
   - `app_mentions:read`
   - `chat:write`
   - `channels:history`
   - `groups:history`
3. Under **Socket Mode**, enable it and generate an app-level token (starts with `xapp-`)
4. Under **Event Subscriptions**, subscribe to:
   - `app_mention`
   - `message.channels`
   - `message.groups`
5. Optionally add a slash command `/task` under **Slash Commands**
6. Install the app to your workspace

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in:

```
SLACK_BOT_TOKEN=xoxb-...           # Bot User OAuth Token
SLACK_SIGNING_SECRET=...           # From app Basic Information page
SLACK_APP_TOKEN=xapp-...           # App-level token for Socket Mode
ANTHROPIC_API_KEY=sk-ant-...       # Anthropic API key
STRAPI_PROJECT_PATH=/Users/juanjo/Projects/Rovr/repos/strapi.rovr
CLAUDE_MODEL=claude-sonnet-4-20250514
```

### 3. Run

```bash
npm install
npm run dev     # Development with tsx (hot reload)
npm run build   # Compile TypeScript
npm start       # Run compiled output
```

## Commands

- `npm run dev` — run with tsx (no build step)
- `npm run build` — compile TypeScript to `dist/`
- `npm start` — run compiled `dist/app.js`

## Tech Stack

- **Runtime**: Node.js 18+, TypeScript
- **Slack**: `@slack/bolt` (Socket Mode)
- **AI**: `@anthropic-ai/sdk`
- **Codebase reading**: Node `fs/promises`
