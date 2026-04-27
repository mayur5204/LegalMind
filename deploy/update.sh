#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# LegalMind — update deployed app after pushing new code
# Run on the EC2 instance:  bash /home/ubuntu/legalmind/deploy/update.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

APP_DIR="/home/ubuntu/legalmind"
cd "$APP_DIR"

echo "Pulling latest code…"
git pull origin main

echo "Rebuilding frontend…"
cd frontend
npm install --silent
npm run build
cd "$APP_DIR"

echo "Updating Python dependencies…"
source venv/bin/activate
pip install -q -r backend/requirements.txt
deactivate

echo "Restarting backend…"
sudo systemctl restart legalmind
sleep 2
sudo systemctl status legalmind --no-pager

echo "Done — app updated."
