#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# LegalMind — AWS EC2 bootstrap script
# Run once on a fresh Ubuntu 22.04 instance as the 'ubuntu' user:
#   bash deploy.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

APP_DIR="/home/ubuntu/legalmind"
REPO_URL="https://github.com/YOUR_USERNAME/YOUR_REPO.git"   # ← update this
PYTHON="python3.11"

echo "════════════════════════════════════════"
echo "  LegalMind — deployment starting"
echo "════════════════════════════════════════"

# ── 1. System updates ─────────────────────────────────────────────────────────
echo "[1/9] Updating system packages…"
sudo apt-get update -y && sudo apt-get upgrade -y
sudo apt-get install -y \
    python3.11 python3.11-venv python3-pip \
    nginx git curl unzip

# ── 2. Node.js 20 ─────────────────────────────────────────────────────────────
echo "[2/9] Installing Node.js 20…"
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo "  Node $(node --version) · npm $(npm --version)"

# ── 3. Ollama ─────────────────────────────────────────────────────────────────
echo "[3/9] Installing Ollama…"
if ! command -v ollama &>/dev/null; then
    curl -fsSL https://ollama.com/install.sh | sh
fi
sudo systemctl enable ollama
sudo systemctl start ollama
sleep 3   # give Ollama a moment to start

echo "  Pulling nomic-embed-text (required for embeddings)…"
ollama pull nomic-embed-text

# Note: gemma4:31b-cloud is a cloud-routed model.
# Make sure you are signed in to Ollama: run 'ollama login' manually after this
# script finishes, then test with: ollama run gemma4:31b-cloud "hello"

# ── 4. Clone repo ─────────────────────────────────────────────────────────────
echo "[4/9] Cloning repository…"
if [ -d "$APP_DIR" ]; then
    echo "  Directory exists — pulling latest…"
    cd "$APP_DIR" && git pull origin main
else
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# ── 5. Environment file ───────────────────────────────────────────────────────
echo "[5/9] Setting up .env…"
cd "$APP_DIR"
if [ ! -f .env ]; then
    cp .env.example .env
    echo "  Created .env from .env.example"
    echo "  ⚠  Edit /home/ubuntu/legalmind/.env and set ALLOWED_ORIGINS to your domain."
fi

# ── 6. Python virtual environment + backend deps ──────────────────────────────
echo "[6/9] Installing Python dependencies…"
$PYTHON -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r backend/requirements.txt
deactivate

# ── 7. Build React frontend ───────────────────────────────────────────────────
echo "[7/9] Building frontend…"
cd "$APP_DIR/frontend"
npm install
npm run build
cd "$APP_DIR"

# ── 8. Systemd service ────────────────────────────────────────────────────────
echo "[8/9] Installing systemd service…"
sudo cp deploy/legalmind.service /etc/systemd/system/legalmind.service
sudo systemctl daemon-reload
sudo systemctl enable legalmind
sudo systemctl restart legalmind
sleep 2
sudo systemctl status legalmind --no-pager

# ── 9. Nginx ──────────────────────────────────────────────────────────────────
echo "[9/9] Configuring Nginx…"
sudo cp deploy/nginx.conf /etc/nginx/sites-available/legalmind
sudo ln -sf /etc/nginx/sites-available/legalmind /etc/nginx/sites-enabled/legalmind
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx

echo ""
echo "════════════════════════════════════════"
echo "  Deployment complete!"
echo "════════════════════════════════════════"
echo ""
echo "  App is running at:  http://$(curl -s ifconfig.me)"
echo ""
echo "  Next steps:"
echo "  1. Log in to Ollama:  ollama login"
echo "  2. Edit .env if you have a domain: nano /home/ubuntu/legalmind/.env"
echo "  3. For HTTPS with a domain, run:"
echo "       sudo apt install certbot python3-certbot-nginx -y"
echo "       sudo certbot --nginx -d yourdomain.com"
echo ""
