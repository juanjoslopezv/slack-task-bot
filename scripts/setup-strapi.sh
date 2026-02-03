#!/bin/bash
# setup-strapi.sh - Clone Strapi repository during Railway deployment

set -e  # Exit on error

echo "🔧 Setting up Strapi repository for indexing..."

# Check if required env vars are set
if [ -z "$STRAPI_REPO_URL" ]; then
  echo "❌ ERROR: STRAPI_REPO_URL environment variable is not set"
  echo ""
  echo "   For PUBLIC repositories:"
  echo "   STRAPI_REPO_URL=https://github.com/yourorg/strapi.rovr.git"
  echo ""
  echo "   For PRIVATE repositories, include authentication:"
  echo "   STRAPI_REPO_URL=https://USERNAME:GITHUB_TOKEN@github.com/yourorg/strapi.rovr.git"
  echo ""
  echo "   To create a GitHub Personal Access Token:"
  echo "   1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)"
  echo "   2. Generate new token with 'repo' scope"
  echo "   3. Copy the token and use it in the URL above"
  exit 1
fi

# Use dev branch by default, but allow override
BRANCH=${STRAPI_REPO_BRANCH:-dev}
CLONE_DIR=${STRAPI_CLONE_PATH:-/app/strapi-repo}

echo "📦 Repository: $STRAPI_REPO_URL"
echo "🌿 Branch: $BRANCH"
echo "📁 Clone directory: $CLONE_DIR"

# Remove existing directory if it exists
if [ -d "$CLONE_DIR" ]; then
  echo "🗑️  Removing existing directory..."
  rm -rf "$CLONE_DIR"
fi

# Clone the repository
echo "⬇️  Cloning repository..."

# Mask sensitive URL in logs (hide tokens)
MASKED_URL=$(echo "$STRAPI_REPO_URL" | sed -E 's|(https?://)[^:]+:[^@]+@|\1***:***@|')
echo "   From: $MASKED_URL"

if ! git clone --depth 1 --branch "$BRANCH" "$STRAPI_REPO_URL" "$CLONE_DIR" 2>&1 | grep -v "warning: --depth"; then
  echo ""
  echo "❌ ERROR: Failed to clone repository"
  echo ""
  echo "   Common issues:"
  echo "   1. Repository is private and needs authentication in the URL"
  echo "   2. Branch '$BRANCH' doesn't exist"
  echo "   3. GitHub token has expired or lacks 'repo' scope"
  echo "   4. Network connectivity issues"
  echo ""
  echo "   For private repos, set STRAPI_REPO_URL with authentication:"
  echo "   https://USERNAME:GITHUB_TOKEN@github.com/yourorg/strapi.rovr.git"
  exit 1
fi

# Verify the clone was successful
if [ ! -d "$CLONE_DIR/src/api" ]; then
  echo "⚠️  WARNING: Expected Strapi structure not found at $CLONE_DIR/src/api"
  echo "   The bot may not be able to index content types correctly."
else
  echo "✅ Strapi repository cloned successfully!"

  # Count content types for verification
  CONTENT_TYPE_COUNT=$(find "$CLONE_DIR/src/api" -name "schema.json" 2>/dev/null | wc -l)
  echo "📊 Found $CONTENT_TYPE_COUNT content type schemas"
fi

echo "✨ Setup complete!"
