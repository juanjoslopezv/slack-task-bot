# Conversation Persistence

This guide explains how conversation state persistence works and how to configure it for Railway deployment.

## Overview

The bot now persists conversation state to disk, allowing it to recover active conversations after restarts. This is crucial for production use where deployments can interrupt ongoing conversations.

## How It Works

### Persistence Service

The bot automatically saves conversation state to a JSON file:
- **Location**: `/app/data/conversations.json` (configurable via `PERSISTENCE_DIR`)
- **Save Strategy**: Debounced writes (2 seconds after last update) to reduce I/O
- **Cleanup**: Conversations older than 24 hours are automatically cleaned up on load

### What Gets Persisted

For each active conversation thread, the bot saves:
- Thread ID and channel ID
- Conversation mode (question/task)
- Original user request
- Task type and affected areas
- Full conversation history (for Claude context)
- Current stage (questioning, awaiting_jira_choice, complete)
- Question rounds count
- Generated spec (if any)
- Jira ticket key (if created)
- Last activity timestamp

### Startup and Shutdown

**On Startup:**
1. Bot loads persisted state from disk
2. Conversations older than 24 hours are discarded
3. Active conversations are restored to memory
4. Bot continues responding to existing threads

**On Shutdown:**
1. Bot receives SIGTERM/SIGINT signal
2. Immediately saves all conversation state to disk
3. Gracefully stops the Slack connection
4. Exits cleanly

## Railway Configuration

### Option 1: Volume Mount (Recommended)

Railway volumes provide persistent storage that survives deployments and restarts.

#### Setup via Railway Dashboard

1. Go to your Railway project
2. Click on your **slack-rovr-taskbot** service
3. Navigate to **Settings** → **Volumes**
4. Click **+ New Volume**
5. Configure:
   ```
   Mount Path: /app/data
   ```
6. Click **Add**
7. Railway will automatically redeploy with the volume attached

#### Setup via Railway CLI

```bash
# Create a volume
railway volume create

# When prompted:
# - Name: conversation-data
# - Mount path: /app/data

# Link it to your service
railway link
railway volume attach conversation-data /app/data
```

#### Verify Volume Setup

Check Railway logs after deployment:
```
📂 Loaded X active conversations from disk
✅ Conversation service initialized with X active threads
Codebase indexed successfully
Slack TaskBot is running!
```

### Option 2: Without Volume (Temporary Storage)

If you don't set up a volume, conversations will persist only until the container is replaced:
- ✅ Survives restarts within the same container
- ❌ Lost when Railway deploys a new version
- ❌ Lost when container is moved to another machine

This is acceptable for development/testing but not recommended for production.

## Local Development

For local development, the bot saves state to a local directory:

```bash
# Default location
./data/conversations.json

# Custom location (set in .env)
PERSISTENCE_DIR=/Users/juanjo/Projects/data
```

The data directory will be created automatically if it doesn't exist.

## Environment Variable

```bash
# Optional: Override persistence directory
PERSISTENCE_DIR=/app/data
```

**Default values:**
- Railway: `/app/data` (requires volume mount)
- Local: `/app/data` (will be created in project root)

## Testing Persistence

### Test Recovery After Restart

1. Start a conversation with the bot:
   ```
   @taskbot I need to add user authentication
   ```

2. Answer a few questions:
   ```
   Using JWT tokens
   In the users API
   ```

3. Restart the bot:
   ```bash
   # Local
   Ctrl+C, then npm run dev

   # Railway
   Click "Redeploy" in dashboard
   ```

4. Continue the conversation in the same thread:
   ```
   We should support email and password login
   ```

5. The bot should respond contextually, remembering the previous conversation

### Verify Persistence File

**Local:**
```bash
cat data/conversations.json
```

**Railway (via logs):**
```bash
railway logs | grep "Loaded"
# Should show: 📂 Loaded X active conversations from disk
```

## Volume Capacity

Railway volumes start at **1GB** capacity, which is more than sufficient for conversation state:
- Average conversation: ~5KB
- 1GB supports: ~200,000 conversations
- With 24-hour cleanup: Volume will stay under 1MB for most use cases

## Troubleshooting

### "Failed to load persisted state: ENOENT"

**Cause**: No previous state file exists (normal on first run)

**Solution**: Ignore this message - bot starts fresh

### "Failed to save conversation state: EACCES"

**Cause**: Permission denied writing to `/app/data`

**Solution**:
1. Ensure Railway volume is mounted at `/app/data`
2. Check Railway logs for volume attachment confirmation

### "WARNING: No volume mounted at /app/data"

**Cause**: Railway volume not configured

**Solution**: Follow Volume Mount setup above

### Conversations not recovering after Railway deploy

**Cause**: Volume not attached to service

**Solution**:
1. Railway Dashboard → Service → Settings → Volumes
2. Verify volume is listed and mount path is `/app/data`
3. Redeploy if volume was just added

### Old conversations not cleaning up

**Cause**: Cleanup runs every hour, but only for in-memory state

**Solution**: Restart the bot to trigger cleanup on load

## Performance Considerations

### Write Performance

- Writes are debounced by 2 seconds
- Multiple rapid updates trigger only one disk write
- No blocking I/O - saves happen asynchronously
- Typical write time: <10ms for 10 conversations

### Read Performance

- State loads once on startup
- Typical load time: <50ms for 100 conversations
- No impact on runtime performance after startup

### Memory Usage

- In-memory Map remains the source of truth
- Disk persistence is a backup mechanism
- Memory usage: ~5KB per active conversation
- 100 active conversations: ~500KB memory

## Migration Notes

### Upgrading from Previous Versions

If you're upgrading from a version without persistence:
- No migration needed
- Bot starts with empty state on first run
- Conversations created after upgrade will persist
- Previous in-memory conversations are lost (expected)

### Changing Persistence Directory

If you need to change `PERSISTENCE_DIR`:
1. Stop the bot
2. Copy `/app/data/conversations.json` to new location
3. Update `PERSISTENCE_DIR` environment variable
4. Start the bot

## Security Considerations

### What's Stored

- Full conversation history (user messages and bot responses)
- Task specifications (may contain business logic)
- Jira ticket keys
- No Slack tokens or API keys

### Access Control

- File is only accessible within the container
- Railway volumes are private to your project
- Use Railway's access controls to manage team permissions

### Data Retention

- Conversations auto-delete after 24 hours
- No permanent conversation logs are kept
- Adjust `cleanupOldConversations()` if different retention needed

## Advanced Configuration

### Custom Cleanup Interval

Modify [src/app.ts](../src/app.ts):
```typescript
// Default: cleanup every hour (60 * 60 * 1000)
setInterval(() => cleanupOldConversations(), 60 * 60 * 1000);

// Custom: cleanup every 30 minutes
setInterval(() => cleanupOldConversations(), 30 * 60 * 1000);
```

### Custom Retention Period

Modify [src/services/conversation.service.ts](../src/services/conversation.service.ts):
```typescript
// Default: 24 hours (24 * 60 * 60 * 1000)
export function cleanupOldConversations(maxAgeMs: number = 24 * 60 * 60 * 1000)

// Custom: 48 hours
cleanupOldConversations(48 * 60 * 60 * 1000);
```

### Disable Persistence

Set `PERSISTENCE_DIR` to a non-existent path with no write permissions:
```bash
PERSISTENCE_DIR=/dev/null
```

The bot will log errors but continue working with in-memory state only.

## Benefits

✅ **Seamless Deployments** - Users can continue conversations after redeploys
✅ **Improved UX** - No "I don't remember our conversation" messages
✅ **Context Preservation** - Full conversation history maintained
✅ **Automatic Cleanup** - Old conversations purged automatically
✅ **Graceful Shutdowns** - State saved before container stops
✅ **Zero Config** - Works out of the box with sensible defaults

## Related Documentation

- [Railway Deployment Guide](../DEPLOYMENT.md)
- [Railway Environment Setup](RAILWAY-ENV-TEMPLATE.md)
- [Railway Auto-Update Webhooks](RAILWAY-WEBHOOKS.md)
