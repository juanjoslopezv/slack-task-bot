# Railway Deployment Guide

This guide walks you through deploying the Slack Rovr TaskBot to Railway with automatic Strapi repository cloning.

## Overview

The bot automatically clones your Strapi repository during the build process on Railway, allowing it to index your content types and routes without manual file management.

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

In your Railway project settings, add the following environment variables:

#### Required Variables

```bash
# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-level-token

# Anthropic API
ANTHROPIC_API_KEY=sk-ant-your-api-key

# Strapi Repository (for Railway deployment)
STRAPI_REPO_URL=https://github.com/yourorg/strapi.rovr.git
STRAPI_REPO_BRANCH=dev
```

#### Optional Variables

```bash
# Claude Model (optional, defaults to claude-sonnet-4-20250514)
CLAUDE_MODEL=claude-sonnet-4-20250514

# Strapi Clone Path (optional, defaults to /app/strapi-repo)
STRAPI_CLONE_PATH=/app/strapi-repo

# Jira Integration (optional)
JIRA_URL=https://yourcompany.atlassian.net
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your-jira-api-token
JIRA_PROJECT_KEY=ROVR
JIRA_DEFAULT_ASSIGNEE_ID=557058:82f65dc4-b2d1-44d4-941b-6265205d1f68
```

### 3. Configure Strapi Repository Access

#### For Public Repositories
Use the HTTPS URL directly:
```bash
STRAPI_REPO_URL=https://github.com/yourorg/strapi.rovr.git
```

#### For Private Repositories
You have two options:

**Option A: Personal Access Token (Recommended)**
```bash
STRAPI_REPO_URL=https://YOUR_USERNAME:YOUR_PAT@github.com/yourorg/strapi.rovr.git
```

**Option B: Deploy Keys**
1. Generate an SSH key in Railway:
   ```bash
   ssh-keygen -t ed25519 -C "railway-deploy"
   ```
2. Add the public key to your repository's deploy keys
3. Use SSH URL:
   ```bash
   STRAPI_REPO_URL=git@github.com:yourorg/strapi.rovr.git
   ```

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

Railway doesn't automatically re-clone the repository. To update:

### Option 1: Manual Redeploy
1. Go to your Railway project
2. Click **Deployments** → **Redeploy** on the latest deployment
3. This will re-run the build script and clone the latest code from the configured branch

### Option 2: Webhook Automation
Set up a webhook to trigger Railway deployments when you push to the Strapi dev branch:

1. In Railway: **Settings** → **Webhooks** → Copy webhook URL
2. In your Strapi repo: **Settings** → **Webhooks** → Add webhook
3. Set URL to Railway webhook
4. Trigger on: `push` events to `dev` branch

Now every push to dev will automatically redeploy the bot with fresh codebase context.

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
