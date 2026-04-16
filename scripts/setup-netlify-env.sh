#!/bin/bash
# Netlify 環境変数セットアップスクリプト
# 使い方: bash scripts/setup-netlify-env.sh

set -e

export NETLIFY_AUTH_TOKEN="nfp_xMEeAaXu3zPq9mP8KGBfXE6zFeA3c4iXf60a"

echo "🔗 Netlifyサイトにリンク中..."
netlify link

echo "⚙️  .env から環境変数をインポート中..."
netlify env:import .env

echo "✅ 完了！"
netlify env:list
