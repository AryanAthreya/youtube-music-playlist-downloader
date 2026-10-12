# Production Deployment Guide: YT Music Online Player

This guide explains how to deploy the YT Music Online Player PWA on a small Linux Virtual Machine (~2 GB RAM, 1-2 vCPUs, x86_64 or ARM64) behind Caddy with automatic HTTPS and DuckDNS.

---

## 1. System Requirements

- **Operating System**: Ubuntu 22.04 / 24.04 LTS, Debian 12, or AlmaLinux 9
- **Architecture**: `x86_64` (AMD64) or `aarch64` (ARM64 / Ampere A1)
- **RAM**: 2 GB (Free tier instances on AWS, Hetzner, Oracle Cloud, etc.)
- **Storage**: 20+ GB SSD
- **Swap**: 2 GB swapfile (**MANDATORY** on 2 GB VMs to prevent OOM during builds or high-concurrency downloads)

---

## 2. Server Setup (One-Time)

### A. Configure 2 GB Swap
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make permanent across reboots
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Verify swap is active
free -h
```

### B. Install Docker & Docker Compose
```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Allow current user to run docker
sudo usermod -aG docker $USER
newgrp docker
```

### C. Configure Firewall (UFW)
Only expose ports 80, 443, and SSH (22). Do **not** expose internal ports 8000 or 3000 to the public internet:
```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw enable
```

---

## 3. Domain & DuckDNS Configuration

1. Create a free sub-domain at [DuckDNS](https://www.duckdns.org) (e.g. `my-ytplayer.duckdns.org`).
2. Point the domain to your VM's public IPv4 address.
3. Verify DNS resolution:
   ```bash
   dig +short my-ytplayer.duckdns.org
   ```

---

## 4. Deploy Application

### A. Clone Repository
```bash
git clone https://github.com/aryanathreya/youtube-music-playlist-downloader.git
cd youtube-music-playlist-downloader
```

### B. Configure Environment
```bash
cp .env.example .env
nano .env
```
Edit the following lines:
```env
DOMAIN=my-ytplayer.duckdns.org
MAX_CONCURRENT_DOWNLOADS=2
MAX_CONCURRENT_STREAMS=3
```

*(Optional) Password Protection*:
To restrict access to your personal instance, generate an auth hash:
```bash
docker run --rm caddy:2.9-alpine caddy hash-password --plaintext "YourStrongPassword"
```
Then in `.env`:
```env
AUTH_USER=admin
AUTH_HASH=$2a$14$...
```
And uncomment the `basic_auth @protected` block in `Caddyfile`.

### C. Optional YouTube Cookies Setup
If YouTube rate-limits or flags requests from data centers:
1. Export a `cookies.txt` file from your browser (using an extension like *Get cookies.txt LOCALLY* while signed in to YouTube).
2. Create the cookies directory and copy the file:
   ```bash
   mkdir -p cookies
   cp /path/to/cookies.txt cookies/cookies.txt
   chmod 600 cookies/cookies.txt
   ```
3. Set `YTDLP_COOKIES_FILE=/app/cookies/cookies.txt` in your `.env`.

### D. Build & Start Production Stack
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### E. Verify Services
```bash
# Check container status
docker compose -f docker-compose.prod.yml ps

# Check logs
docker compose -f docker-compose.prod.yml logs -f caddy
```
Visit `https://my-ytplayer.duckdns.org` in your mobile or desktop browser! You will see automatic HTTPS provisioned by Caddy, full stream playback, and the install prompt for the PWA.

---

## 5. Maintenance & Updates

### Safe yt-dlp Auto-Updates
When YouTube makes changes, yt-dlp needs updating. Use the included safe updater:
```bash
chmod +x scripts/auto-update-ytdlp.sh
./scripts/auto-update-ytdlp.sh ytdl-backend-prod
```
The script will:
1. Upgrade `yt-dlp` and `yt-dlp-ejs`.
2. Run a smoke test on a known YouTube video.
3. Automatically roll back to the previous version if the test fails.

To run this automatically once a week, add to cron:
```bash
crontab -e
# Run every Sunday at 3 AM:
0 3 * * 0 /home/ubuntu/youtube-music-playlist-downloader/scripts/auto-update-ytdlp.sh ytdl-backend-prod >> /var/log/ytdlp-update.log 2>&1
```

### Backup & Restore
- **Downloaded Media**: All downloads reside in `./downloads`. Back up this directory to an external drive or cloud bucket:
  ```bash
  rsync -avz ./downloads /mnt/backups/
  ```
- **Custom Playlists**: Export playlist JSON from the Playlists Hub in the web UI.
