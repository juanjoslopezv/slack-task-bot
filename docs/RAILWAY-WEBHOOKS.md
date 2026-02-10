# Railway Auto-Update Setup for External Strapi Repo Changes

This guide explains how to automatically redeploy the TaskBot when the **external strapi.rovr repository** is updated, so the bot re-indexes the latest content types and routes.

## The Problem

The TaskBot already auto-deploys on Railway when its own code changes (via GitHub integration). However, it also clones and indexes the **strapi.rovr** codebase on startup. When developers push changes to the Strapi repo's `dev` branch, the bot needs to be redeployed so it picks up the new schemas, routes, and fields.

Railway's GitHub auto-deploy only watches the TaskBot's own repo — it has no awareness of external repos. To solve this, we use a **GitHub Actions workflow in the Strapi repo** that calls Railway's GraphQL API to trigger a redeploy of the TaskBot service.

## How It Works

```
Developer pushes to strapi.rovr dev branch
         |
GitHub Actions workflow triggers in strapi.rovr repo
         |
Workflow calls Railway GraphQL API (serviceInstanceRedeploy)
         |
Railway redeploys the slack-task-bot service
         |
Build starts: setup-strapi.sh runs
         |
Clones latest Strapi code from dev branch
         |
Indexes fresh content types & routes
         |
Bot restarts with updated context
         |
Users get answers based on latest Strapi code
```

## Setup Steps

### 1. Generate a Railway API Token

1. Go to your Railway dashboard
2. Click your profile avatar > **Account Settings** > **Tokens**
3. Create a new API token
4. Save it securely — you'll need it as a GitHub secret in the Strapi repo

### 2. Find Your Service and Environment IDs

1. Open the **slack-task-bot** service in the Railway dashboard
2. Look at the URL — it contains your IDs:
   ```
   https://railway.com/project/<PROJECT_ID>/service/<SERVICE_ID>?environmentId=<ENV_ID>
   ```
3. Copy the `SERVICE_ID` and `ENV_ID` values

### 3. Add Secrets to the Strapi Repository

In the **strapi.rovr** GitHub repo, go to **Settings** > **Secrets and variables** > **Actions** and add:

- `RAILWAY_API_TOKEN` — your Railway API token
- `RAILWAY_SERVICE_ID` — the slack-task-bot service ID
- `RAILWAY_ENVIRONMENT_ID` — the slack-task-bot environment ID

### 4. Create the GitHub Actions Workflow

Create `.github/workflows/notify-taskbot.yml` in the **strapi.rovr** repo:

```yaml
name: Redeploy TaskBot on Strapi Changes

on:
  push:
    branches:
      - dev

jobs:
  redeploy-taskbot:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger TaskBot Redeploy
        run: |
          curl -sf https://backboard.railway.com/graphql/v2 \
            -X POST \
            -H "Authorization: Bearer ${{ secrets.RAILWAY_API_TOKEN }}" \
            -H "Content-Type: application/json" \
            --data '{
              "query": "mutation { serviceInstanceRedeploy(serviceId: \"${{ secrets.RAILWAY_SERVICE_ID }}\", environmentId: \"${{ secrets.RAILWAY_ENVIRONMENT_ID }}\") }"
            }'
```

### 5. Test It

1. Make a small change in the strapi.rovr `dev` branch
2. Commit and push:
   ```bash
   git add .
   git commit -m "Test TaskBot redeploy trigger"
   git push origin dev
   ```
3. Check GitHub Actions in the strapi.rovr repo — the workflow should run successfully
4. Check Railway dashboard — a new deployment of slack-task-bot should appear
5. Once deployed, ask the bot in Slack about the new changes to confirm it has fresh context

## Reducing Unnecessary Deploys

Not every Strapi push needs a bot redeploy. Here are ways to filter triggers:

### Only trigger on API/schema changes

```yaml
on:
  push:
    branches:
      - dev
    paths:
      - 'src/api/**'
      - 'src/components/**'
```

### Only trigger on explicit deploy commits

```yaml
jobs:
  redeploy-taskbot:
    runs-on: ubuntu-latest
    if: contains(github.event.head_commit.message, '[deploy-bot]')
    steps:
      - name: Trigger TaskBot Redeploy
        run: |
          curl -sf https://backboard.railway.com/graphql/v2 \
            -X POST \
            -H "Authorization: Bearer ${{ secrets.RAILWAY_API_TOKEN }}" \
            -H "Content-Type: application/json" \
            --data '{
              "query": "mutation { serviceInstanceRedeploy(serviceId: \"${{ secrets.RAILWAY_SERVICE_ID }}\", environmentId: \"${{ secrets.RAILWAY_ENVIRONMENT_ID }}\") }"
            }'
```

Then only commits with `[deploy-bot]` in the message will trigger a redeploy.

## Troubleshooting

### GitHub Actions workflow fails

1. **Check workflow logs**: GitHub > strapi.rovr repo > Actions > click the failed run
2. **401 Unauthorized**: The `RAILWAY_API_TOKEN` is invalid or expired — regenerate it in Railway
3. **Invalid service/environment ID**: Double-check `RAILWAY_SERVICE_ID` and `RAILWAY_ENVIRONMENT_ID` from the dashboard URL

### Test the API call manually

```bash
curl -sf https://backboard.railway.com/graphql/v2 \
  -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"query": "mutation { serviceInstanceRedeploy(serviceId: \"YOUR_SERVICE_ID\", environmentId: \"YOUR_ENV_ID\") }"}'
```

### Deploy triggers but build fails

Check Railway build logs for:
- **Authentication errors**: Update `STRAPI_REPO_URL` with a valid GitHub token
- **Branch not found**: Verify `STRAPI_REPO_BRANCH=dev` is correct
- **Out of memory**: Railway may need more resources (upgrade plan)

## Multiple Environment Setup

For staging and production bots watching different Strapi branches:

```yaml
on:
  push:
    branches:
      - dev
      - main

jobs:
  redeploy:
    runs-on: ubuntu-latest
    steps:
      - name: Redeploy Staging Bot
        if: github.ref == 'refs/heads/dev'
        run: |
          curl -sf https://backboard.railway.com/graphql/v2 \
            -X POST \
            -H "Authorization: Bearer ${{ secrets.RAILWAY_API_TOKEN }}" \
            -H "Content-Type: application/json" \
            --data '{
              "query": "mutation { serviceInstanceRedeploy(serviceId: \"${{ secrets.RAILWAY_STAGING_SERVICE_ID }}\", environmentId: \"${{ secrets.RAILWAY_STAGING_ENV_ID }}\") }"
            }'

      - name: Redeploy Production Bot
        if: github.ref == 'refs/heads/main'
        run: |
          curl -sf https://backboard.railway.com/graphql/v2 \
            -X POST \
            -H "Authorization: Bearer ${{ secrets.RAILWAY_API_TOKEN }}" \
            -H "Content-Type: application/json" \
            --data '{
              "query": "mutation { serviceInstanceRedeploy(serviceId: \"${{ secrets.RAILWAY_PROD_SERVICE_ID }}\", environmentId: \"${{ secrets.RAILWAY_PROD_ENV_ID }}\") }"
            }'
```

## Important Notes

- Railway webhooks are **outbound notifications only** — they notify you when deploys happen, they cannot trigger deploys
- There is no simple REST webhook URL in Railway to trigger a redeploy; the GraphQL API is the supported method
- The TaskBot's own code changes still auto-deploy via Railway's GitHub integration as usual

## References

- [Manage Services with the Public API](https://docs.railway.com/guides/manage-services)
- [Manage Deployments with the Public API](https://docs.railway.com/guides/manage-deployments)
- [Controlling GitHub Auto-Deploys](https://docs.railway.com/guides/github-autodeploys)
- [Railway Webhooks (outbound notifications only)](https://docs.railway.com/guides/webhooks)
