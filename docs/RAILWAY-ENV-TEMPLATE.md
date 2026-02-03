# Railway Environment Variables Template

Copy these environment variables to your Railway project settings.

## Required Variables

### Slack Configuration
```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_SIGNING_SECRET=your-signing-secret-here
SLACK_APP_TOKEN=xapp-your-app-level-token-here
```

**How to get these:**
1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Select your app
3. **Bot Token**: OAuth & Permissions → Bot User OAuth Token
4. **Signing Secret**: Basic Information → App Credentials
5. **App Token**: Basic Information → App-Level Tokens (enable Socket Mode first)

### Anthropic API
```bash
ANTHROPIC_API_KEY=sk-ant-your-api-key-here
```

**How to get this:**
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Navigate to API Keys
3. Create a new key

### Strapi Repository Configuration

#### For PUBLIC Repositories
```bash
STRAPI_REPO_URL=https://github.com/yourorg/strapi.rovr.git
STRAPI_REPO_BRANCH=dev
```

#### For PRIVATE Repositories (Recommended Method)
```bash
# Format: https://USERNAME:TOKEN@github.com/org/repo.git
STRAPI_REPO_URL=https://your-github-username:ghp_YourPersonalAccessToken@github.com/yourorg/strapi.rovr.git
STRAPI_REPO_BRANCH=dev
```

**How to create a GitHub Personal Access Token (PAT):**

1. Go to GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)**
2. Click **Generate new token (classic)**
3. Give it a descriptive name: `Railway Strapi Clone`
4. Set expiration: **No expiration** (or set reminder to renew)
5. Select scopes:
   - ✅ **repo** (Full control of private repositories)
6. Click **Generate token**
7. **Copy the token immediately** (you won't see it again!)
8. Use format: `https://YOUR_USERNAME:ghp_TOKEN_HERE@github.com/yourorg/strapi.rovr.git`

**Security Note:** The token is only used during build time and is not exposed in logs. Railway masks sensitive environment variables.

---

## Optional Variables

### Claude Model Configuration
```bash
# Default: claude-sonnet-4-20250514
CLAUDE_MODEL=claude-sonnet-4-20250514

# For more powerful responses (slower, more expensive):
# CLAUDE_MODEL=claude-opus-4-20250514

# For faster responses (less detailed):
# CLAUDE_MODEL=claude-haiku-3-20250307
```

### Strapi Clone Path (Advanced)
```bash
# Default: /app/strapi-repo
# Only change if you need a custom path
STRAPI_CLONE_PATH=/custom/path/strapi
```

### Jira Integration (Optional)

If you want automatic Jira ticket creation:

```bash
JIRA_URL=https://yourcompany.atlassian.net
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your-jira-api-token
JIRA_PROJECT_KEY=ROVR
JIRA_DEFAULT_ASSIGNEE_ID=557058:82f65dc4-b2d1-44d4-941b-6265205d1f68
```

**How to get Jira credentials:**

1. **JIRA_URL**: Your Jira Cloud site URL
2. **JIRA_EMAIL**: Your Jira account email
3. **JIRA_API_TOKEN**:
   - Go to [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
   - Click **Create API token**
   - Give it a label: `Railway TaskBot`
   - Copy the token
4. **JIRA_PROJECT_KEY**: Your project key (visible in Jira URLs, e.g., `ROVR`)
5. **JIRA_DEFAULT_ASSIGNEE_ID**:
   - Go to your Jira board
   - Filter by assignee=yourself
   - Copy the ID from the URL (format: `557058:82f65dc4-b2d1-44d4-941b-6265205d1f68`)

---

## Example: Complete Railway Configuration

### Public Strapi Repo
```bash
# Slack
SLACK_BOT_TOKEN=xoxb-YOUR-BOT-TOKEN-HERE
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-YOUR-APP-TOKEN-HERE

# Anthropic
ANTHROPIC_API_KEY=sk-ant-api-key-here

# Strapi (Public)
STRAPI_REPO_URL=https://github.com/myorg/strapi.rovr.git
STRAPI_REPO_BRANCH=dev

# Optional: Jira
JIRA_URL=https://mycompany.atlassian.net
JIRA_EMAIL=me@mycompany.com
JIRA_API_TOKEN=ABC123DEF456
JIRA_PROJECT_KEY=ROVR
JIRA_DEFAULT_ASSIGNEE_ID=557058:82f65dc4-b2d1-44d4-941b-6265205d1f68
```

### Private Strapi Repo with GitHub Token
```bash
# Slack
SLACK_BOT_TOKEN=xoxb-YOUR-BOT-TOKEN-HERE
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-YOUR-APP-TOKEN-HERE

# Anthropic
ANTHROPIC_API_KEY=sk-ant-api-key-here

# Strapi (Private with token auth)
STRAPI_REPO_URL=https://YOUR_USERNAME:ghp_YOUR_TOKEN_HERE@github.com/yourorg/strapi.rovr.git
STRAPI_REPO_BRANCH=dev

# Optional: Jira
JIRA_URL=https://mycompany.atlassian.net
JIRA_EMAIL=me@mycompany.com
JIRA_API_TOKEN=ABC123DEF456
JIRA_PROJECT_KEY=ROVR
JIRA_DEFAULT_ASSIGNEE_ID=557058:82f65dc4-b2d1-44d4-941b-6265205d1f68
```

---

## Adding Variables to Railway

### Via Dashboard
1. Go to your Railway project
2. Click on your service (slack-rovr-taskbot)
3. Go to **Variables** tab
4. Click **+ New Variable**
5. Add name and value
6. Click **Add**
7. Railway will automatically redeploy

### Via Railway CLI
```bash
railway variables set SLACK_BOT_TOKEN=xoxb-...
railway variables set SLACK_SIGNING_SECRET=abc123...
railway variables set SLACK_APP_TOKEN=xapp-...
railway variables set ANTHROPIC_API_KEY=sk-ant-...
railway variables set STRAPI_REPO_URL=https://...
railway variables set STRAPI_REPO_BRANCH=dev
```

### Via Railway JSON

Create `railway.toml` (not recommended for sensitive values):
```toml
[env]
STRAPI_REPO_BRANCH = "dev"
CLAUDE_MODEL = "claude-sonnet-4-20250514"
```

---

## Security Best Practices

1. **Never commit tokens to git**
   - Use Railway's variable management
   - Keep `.env` in `.gitignore`

2. **Rotate tokens periodically**
   - Update GitHub PAT every 90 days
   - Update Jira API tokens yearly

3. **Use minimal scope tokens**
   - GitHub: Only `repo` scope needed
   - Jira: Only ticket creation permissions

4. **Monitor token usage**
   - Check GitHub token activity regularly
   - Review Jira audit logs

---

## Troubleshooting

### "Failed to clone repository" error

**Cause**: Authentication issue with private repo

**Solution**:
1. Verify GitHub token is included in URL
2. Check token hasn't expired
3. Ensure token has `repo` scope
4. Test token with: `git clone` locally using same URL

### "STRAPI_REPO_URL environment variable is not set"

**Cause**: Variable not added to Railway

**Solution**: Add `STRAPI_REPO_URL` in Railway Variables tab

### Bot works but has stale codebase context

**Cause**: Railway hasn't redeployed after Strapi changes

**Solution**:
1. Set up GitHub webhook (see [RAILWAY-WEBHOOKS.md](RAILWAY-WEBHOOKS.md))
2. Or manually trigger redeploy in Railway dashboard
