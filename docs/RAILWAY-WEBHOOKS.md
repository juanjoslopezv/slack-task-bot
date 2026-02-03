# Railway Auto-Update Setup with GitHub Webhooks

This guide explains how to configure automatic redeployment of your TaskBot when the Strapi `dev` branch is updated.

## Overview

When you push changes to your Strapi repository's `dev` branch, GitHub will automatically trigger a Railway redeploy, which:
1. Re-clones the latest Strapi code
2. Re-indexes content types and routes
3. Restarts the bot with fresh context

## Setup Steps

### 1. Get Railway Webhook URL

1. Go to your Railway project dashboard
2. Click on your **slack-rovr-taskbot** service
3. Navigate to **Settings** tab
4. Scroll to **Webhooks** section
5. Click **Generate a Webhook**
6. Copy the webhook URL (looks like: `https://railway.app/api/v1/webhooks/...`)

### 2. Configure GitHub Webhook

#### Option A: Repository-wide Webhook (Recommended)

1. Go to your Strapi repository on GitHub
2. Click **Settings** → **Webhooks** → **Add webhook**
3. Configure:
   ```
   Payload URL: [Paste Railway webhook URL]
   Content type: application/json
   Secret: [Leave empty or use Railway's secret if provided]
   ```
4. **Which events would you like to trigger this webhook?**
   - Select "Let me select individual events"
   - Check **only** "Pushes"
   - Uncheck everything else
5. Click **Add webhook**

#### Option B: Branch-specific (GitHub Actions)

For more control, use GitHub Actions to only trigger on `dev` branch:

Create `.github/workflows/notify-railway.yml` in your Strapi repo:

```yaml
name: Notify Railway on Dev Push

on:
  push:
    branches:
      - dev

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Railway Redeploy
        run: |
          curl -X POST "${{ secrets.RAILWAY_WEBHOOK_URL }}"
```

Then add `RAILWAY_WEBHOOK_URL` as a repository secret.

### 3. Test the Webhook

1. Make a small change to your Strapi repo `dev` branch
2. Commit and push:
   ```bash
   git add .
   git commit -m "Test Railway webhook"
   git push origin dev
   ```
3. Check Railway dashboard:
   - You should see a new deployment triggered
   - Watch the build logs for "Cloning repository..." message
   - Verify new content types are indexed

### 4. Verify Auto-Update Works

After the redeploy completes:
1. Go to Slack
2. Ask the bot about something new from your Strapi changes
3. Confirm it has the latest codebase context

## Webhook Event Flow

```
Developer pushes to dev branch
         ↓
GitHub webhook fires
         ↓
Railway receives webhook
         ↓
Railway triggers new deployment
         ↓
Build starts: setup-strapi.sh runs
         ↓
Clones latest Strapi code from dev branch
         ↓
Indexes fresh content types & routes
         ↓
Bot restarts with updated context
         ↓
Users get answers based on latest code
```

## Troubleshooting

### Webhook not triggering Railway deploys

1. **Check GitHub webhook delivery**:
   - GitHub → Repo → Settings → Webhooks
   - Click on your webhook
   - View "Recent Deliveries"
   - Should show successful 200 responses

2. **Verify Railway webhook is active**:
   - Railway → Service → Settings → Webhooks
   - Ensure webhook is listed and enabled

3. **Test manually**:
   ```bash
   curl -X POST https://railway.app/api/v1/webhooks/YOUR-WEBHOOK-ID
   ```

### Webhook fires but deploy fails

Check Railway build logs for:
- **Authentication errors**: Update `STRAPI_REPO_URL` with valid GitHub token
- **Branch not found**: Verify `STRAPI_REPO_BRANCH=dev` is correct
- **Out of memory**: Railway may need more resources (upgrade plan)

### Too many deploys triggering

If you're pushing frequently and don't want every push to redeploy:

**Option 1**: Use branch-specific webhook (Option B above)

**Option 2**: Add a path filter in GitHub Actions:
```yaml
on:
  push:
    branches:
      - dev
    paths:
      - 'src/api/**'  # Only trigger on API changes
```

## Advanced Configuration

### Selective Triggering by Commit Message

Use GitHub Actions to only deploy on specific commit messages:

```yaml
name: Conditional Railway Deploy

on:
  push:
    branches:
      - dev

jobs:
  notify:
    runs-on: ubuntu-latest
    if: contains(github.event.head_commit.message, '[deploy]')
    steps:
      - name: Trigger Railway
        run: curl -X POST "${{ secrets.RAILWAY_WEBHOOK_URL }}"
```

Now only commits with `[deploy]` in the message trigger redeployment.

### Multiple Environment Webhooks

For staging and production bots:

1. Create separate Railway services:
   - `taskbot-staging` (uses `dev` branch)
   - `taskbot-production` (uses `main` branch)

2. Configure separate webhooks for each

3. Use GitHub Actions to trigger appropriate webhook:
   ```yaml
   on:
     push:
       branches:
         - dev
         - main

   jobs:
     deploy:
       runs-on: ubuntu-latest
       steps:
         - name: Deploy Staging
           if: github.ref == 'refs/heads/dev'
           run: curl -X POST "${{ secrets.RAILWAY_WEBHOOK_STAGING }}"

         - name: Deploy Production
           if: github.ref == 'refs/heads/main'
           run: curl -X POST "${{ secrets.RAILWAY_WEBHOOK_PROD }}"
   ```

## Benefits

✅ **Always Up-to-Date** - Bot context stays in sync with codebase
✅ **Zero Maintenance** - Automatic updates, no manual redeploys
✅ **Fast Feedback** - Push to dev, bot updates within minutes
✅ **Team Friendly** - Everyone's changes automatically reflected

## Cost Considerations

- Each webhook trigger counts as a deployment
- Railway free tier includes limited build minutes
- Consider using commit message filters to reduce unnecessary deploys
- Production bots may want scheduled updates instead

## Alternative: Scheduled Updates

Instead of webhooks, use Railway's cron jobs to update daily:

1. Create a script to trigger redeploy via Railway API
2. Run it on a schedule (e.g., nightly)
3. Reduces build costs while keeping reasonably fresh

Railway doesn't natively support cron-triggered deploys, so webhooks are the recommended approach.
