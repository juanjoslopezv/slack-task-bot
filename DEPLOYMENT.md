# Railway Deployment Guide

This guide walks you through deploying the Slack Rovr TaskBot to Railway with automatic Strapi repository cloning.

## Quick Links

- **Detailed Environment Setup**: [docs/RAILWAY-ENV-TEMPLATE.md](docs/RAILWAY-ENV-TEMPLATE.md)
- **Auto-Update Configuration**: [docs/RAILWAY-WEBHOOKS.md](docs/RAILWAY-WEBHOOKS.md)

## Overview

The bot automatically clones your Strapi repository during the build process on Railway, allowing it to index your content types and routes without manual file management. It can also auto-update when you push to your Strapi repository.

## Prerequisites

1. A Railway account ([railway.app](https://railway.app))
2. Your Strapi repository accessible via Git (GitHub, GitLab, etc.)
3. Slack Bot credentials (Bot Token, App Token, Signing Secret)
4. Anthropic API key
5. (Optional) Jira credentials for ticket creation

## Deployment Steps

### 1. Create a New Railway Project

1. Go to [railway.app](https://railway.app) and sign in
2. Click **New Project**
3. Select **Deploy from GitHub repo**
4. Choose this repository (`slack-rovr-taskbot`)

### 2. Configure Environment Variables

> 📋 **Detailed Guide**: See [docs/RAILWAY-ENV-TEMPLATE.md](docs/RAILWAY-ENV-TEMPLATE.md) for complete setup instructions with examples.

In your Railway project, go to **Variables** tab and add:

#### Required Variables

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-level-token
ANTHROPIC_API_KEY=sk-ant-your-api-key
STRAPI_REPO_URL=https://github.com/yourorg/strapi.rovr.git
STRAPI_REPO_BRANCH=dev
```

#### Optional Variables

```bash
CLAUDE_MODEL=claude-sonnet-4-20250514
JIRA_URL=https://yourcompany.atlassian.net
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your-jira-api-token
JIRA_PROJECT_KEY=ROVR
JIRA_DEFAULT_ASSIGNEE_ID=557058:82f65dc4-b2d1-44d4-941b-6265205d1f68
```

### 3. Configure Strapi Repository Access

> ⚠️ **Important**: Most Strapi repos are private and require authentication!

#### For Public Repositories
```bash
STRAPI_REPO_URL=https://github.com/yourorg/strapi.rovr.git
```

#### For Private Repositories (Most Common)

**Step 1**: Create a GitHub Personal Access Token (PAT)
1. Go to GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
2. Click **Generate new token (classic)**
3. Name it: `Railway Strapi Clone`
4. Expiration: **No expiration** (or set a reminder)
5. Scopes: Check **✅ repo** (full repository access)
6. Click **Generate token**
7. **Copy the token** (starts with `ghp_...`) - you won't see it again!

**Step 2**: Add Token to Railway `STRAPI_REPO_URL`

Format: `https://USERNAME:TOKEN@github.com/org/repo.git`

Example:
```bash
STRAPI_REPO_URL=https://myusername:ghp_abc123XYZ789@github.com/myorg/strapi.rovr.git
```

**Security**: Railway masks environment variables in logs, so your token is safe.

### 4. Deploy

1. Railway will automatically detect the `railway.json` configuration
2. The build process will:
   - Clone your Strapi repository (dev branch by default)
   - Index all content types and routes
   - Build the TypeScript application
3. The bot will start automatically

### 5. Verify Deployment

Check the Railway logs for:
```
🔧 Setting up Strapi repository for indexing...
📦 Repository: https://github.com/yourorg/strapi.rovr.git
🌿 Branch: dev
⬇️  Cloning repository...
✅ Strapi repository cloned successfully!
📊 Found X content type schemas
✨ Setup complete!
Codebase indexed successfully
Slack TaskBot is running!
```

## How It Works

### Build Process

1. **Railway triggers build** → Runs `npm run railway:build`
2. **Clone Strapi repo** → `scripts/setup-strapi.sh` executes:
   - Clones `STRAPI_REPO_URL` at branch `STRAPI_REPO_BRANCH` (default: dev)
   - Saves to `STRAPI_CLONE_PATH` (default: /app/strapi-repo)
   - Verifies the Strapi structure
3. **Build TypeScript** → Compiles to `dist/`
4. **Start bot** → Runs `npm run railway:start`

### Runtime

When the bot starts:
- Reads `STRAPI_PROJECT_PATH` (or falls back to `STRAPI_CLONE_PATH`)
- Indexes all `schema.json` files in `src/api/*/content-types/*/schema.json`
- Indexes custom routes in `src/api/*/routes/*.ts`
- Starts listening for Slack events

## Environment Variable Priority

For the Strapi path, the bot uses this priority:
1. `STRAPI_PROJECT_PATH` (if set explicitly)
2. `STRAPI_CLONE_PATH` (Railway deployment path)
3. `/app/strapi-repo` (default Railway location)

This allows flexibility for different deployment scenarios.

## Updating the Strapi Codebase

The bot needs to redeploy to get fresh Strapi codebase context.

### Option 1: Manual Redeploy
1. Go to your Railway project
2. Click **Deployments** → **Redeploy** on the latest deployment
3. This will re-run the build script and clone the latest code

### Option 2: Automatic Updates via Webhook (Recommended)

> 🔄 **Detailed Guide**: See [docs/RAILWAY-WEBHOOKS.md](docs/RAILWAY-WEBHOOKS.md) for complete setup instructions.

**Quick Setup:**
1. Railway → **Settings** → **Webhooks** → Generate webhook
2. Copy the webhook URL
3. GitHub → Your Strapi repo → **Settings** → **Webhooks** → Add webhook
4. Paste Railway webhook URL
5. Select: Trigger on **push** events only
6. Save

**Result**: Every push to `dev` branch automatically redeploys the bot with fresh codebase context!

**Benefits**:
- ✅ Always up-to-date context
- ✅ Zero manual intervention
- ✅ Team members' changes reflected automatically
- ✅ Fast feedback (2-3 minute redeploy)

## Troubleshooting

### "ERROR: STRAPI_REPO_URL environment variable is not set"
- Check that you've added `STRAPI_REPO_URL` in Railway environment variables
- Redeploy after adding the variable

### "WARNING: Expected Strapi structure not found"
- Verify your `STRAPI_REPO_URL` points to the correct repository
- Check that `STRAPI_REPO_BRANCH` exists (default: dev)
- Ensure your Strapi project has the standard structure with `src/api/`

### Clone fails with authentication error
- For private repos, ensure your Personal Access Token has repo read access
- Verify the token is embedded in the URL correctly: `https://username:token@github.com/...`

### Bot can't find content types at runtime
- Check Railway logs during startup for "Codebase indexed successfully"
- Verify `STRAPI_CLONE_PATH` matches the path used during build (default: /app/strapi-repo)
- Ensure the clone succeeded during build (check for "✅ Strapi repository cloned successfully!")

### Permission denied: setup-strapi.sh
- The script should be executable (chmod +x scripts/setup-strapi.sh)
- This is set in the repository, but verify it's committed to git

## Local Development vs Railway

**Local Development:**
```bash
# .env
STRAPI_PROJECT_PATH=/Users/juanjo/Projects/Rovr/repos/strapi.rovr
```

**Railway Deployment:**
```bash
# Railway Environment Variables
STRAPI_REPO_URL=https://github.com/yourorg/strapi.rovr.git
STRAPI_REPO_BRANCH=dev
STRAPI_CLONE_PATH=/app/strapi-repo  # Optional, this is the default
```

The config automatically handles both scenarios!

## Advanced Configuration

### Custom Clone Directory
```bash
STRAPI_CLONE_PATH=/custom/path/strapi
```

### Different Branch per Environment
Create multiple Railway environments (staging, production) with different branches:

**Staging:**
```bash
STRAPI_REPO_BRANCH=dev
```

**Production:**
```bash
STRAPI_REPO_BRANCH=main
```

### Build Performance

The clone uses `--depth 1` (shallow clone) to minimize build time and disk usage. If you need full git history, modify `scripts/setup-strapi.sh`:

```bash
# Remove --depth 1
git clone --branch "$BRANCH" "$STRAPI_REPO_URL" "$CLONE_DIR"
```

## Support

For issues related to:
- Railway deployment: Check Railway logs and [Railway docs](https://docs.railway.app)
- Slack bot setup: See main [README.md](README.md)
- Strapi integration: Verify your repository structure matches Strapi standards
