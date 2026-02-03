#!/bin/bash
# setup-strapi.sh - Clone Strapi repository during Railway deployment

set -e  # Exit on error

echo "🔧 Setting up Strapi repository for indexing..."

# Check if required env vars are set
if [ -z "$STRAPI_REPO_URL" ]; then
  echo "❌ ERROR: STRAPI_REPO_URL environment variable is not set"
  echo "   Please set it to your Strapi repository URL (e.g., https://github.com/yourorg/strapi.rovr.git)"
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
git clone --depth 1 --branch "$BRANCH" "$STRAPI_REPO_URL" "$CLONE_DIR"

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
