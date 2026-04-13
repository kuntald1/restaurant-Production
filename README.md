# 🍽️ Restaurant Management — Docker Deployment Guide

## Project Structure on VPS

```
/home/youruser/restaurant/
├── docker-compose.yml
├── .env                        ← your real secrets (never commit this)
├── .env.example                ← template (safe to commit)
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/                    ← your FastAPI source code
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── vite.config.js
    └── src/                    ← your React source code
```

---

## Step 1: Install Docker on Ubuntu VPS

```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Add your user to docker group (no sudo needed)
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose plugin
sudo apt install docker-compose-plugin -y

# Verify
docker --version
docker compose version
```

---

## Step 2: Upload Your Project to VPS

From your LOCAL machine:
```bash
# Create project folder on VPS
ssh user@YOUR_VPS_IP "mkdir -p /home/user/restaurant"

# Upload files (run from your local machine)
scp -r ./docker-setup/* user@YOUR_VPS_IP:/home/user/restaurant/
```

OR use Git:
```bash
# On VPS
git clone YOUR_REPO_URL /home/user/restaurant
```

---

## Step 3: Configure Environment Variables

```bash
cd /home/user/restaurant

# Copy the template and fill in your real values
cp .env.example .env
nano .env
```

**Key values to update in .env:**
- `DB_PASSWORD` — your real Supabase password
- `BASE_URL` — your VPS IP or domain (e.g., http://123.45.67.89 or https://yourdomain.com)
- `CRYPTO_SECRET_KEY` — keep it secret

---

## Step 4: Update Frontend API URL

Since your React app (`src/services/api.js`) currently hardcodes the Railway URL,
you need to update it for VPS deployment.

**Option A — Use Nginx Proxy (Recommended, no code change needed)**

The nginx.conf already proxies `/company`, `/pos`, `/users`, etc. to the backend.
Update `src/services/api.js` so the production URL points to your own domain:

```js
// In src/services/api.js, change:
const RAILWAY_URL = 'https://restaurantbackend-production-8e87.up.railway.app';
// To:
const RAILWAY_URL = '';   // Empty = same origin, nginx will proxy it
```

This means in production, all API calls go to `yourVPS.com/pos/...` → nginx → backend container.

**Option B — Keep full URL**
```js
const RAILWAY_URL = 'http://YOUR_VPS_IP:8000';
```

---

## Step 5: Build and Run

```bash
cd /home/user/restaurant

# Build all images and start in background
docker compose up --build -d

# Watch logs
docker compose logs -f

# Check status
docker compose ps
```

---

## Step 6: Verify Everything Works

```bash
# Test backend health
curl http://localhost:8000/health

# Test frontend (should return HTML)
curl http://localhost:80

# View backend logs
docker compose logs backend

# View frontend logs
docker compose logs frontend
```

---

## Database Options

### Option A: Keep Supabase (Your Current Setup) ✅ EASIEST
- Your backend already connects to Supabase via the .env credentials
- No change needed — PostgreSQL runs in the cloud
- In `docker-compose.yml`, the `postgres` service is optional and can be removed

### Option B: Switch to Local PostgreSQL on VPS
1. In `.env`, change DB_HOST to `postgres` (the container name)
2. In `docker-compose.yml`, uncomment the `depends_on` block in the backend service
3. Migrations: run `docker compose exec backend python -c "from app.database import Base, engine; Base.metadata.create_all(bind=engine)"`

---

## Common Commands

```bash
# Restart a single service
docker compose restart backend

# Rebuild after code changes
docker compose up --build -d backend

# Stop everything
docker compose down

# Stop and delete all data (CAREFUL)
docker compose down -v

# Execute command inside container
docker compose exec backend bash
docker compose exec backend python test_db.py

# View resource usage
docker stats
```

---

## What PostgreSQL Info Do You Need to Provide?

Since your app currently uses **Supabase** (cloud PostgreSQL), you only need:

| Variable | Where to find it |
|---|---|
| `DB_USER` | Supabase → Settings → Database → Connection String |
| `DB_PASSWORD` | Supabase → Settings → Database → Database Password |
| `DB_HOST` | Supabase → Settings → Database → Host (pooler URL) |
| `DB_PORT` | Usually `5432` (or `6543` for Supabase session pooler) |
| `DB_NAME` | Usually `postgres` |

If switching to **local PostgreSQL on VPS**, you just need to:
1. Set DB_HOST=`postgres` (the Docker service name)
2. Choose your own DB_USER, DB_PASSWORD, DB_NAME
3. Docker will automatically create the database on first startup

---

## Architecture Summary

```
Internet
    ↓ port 80
┌─────────────────────────────────────────┐
│  Nginx (frontend container)             │
│  - Serves React static files            │
│  - Proxies /api/* → backend:8000        │
└─────────────────────────────────────────┘
    ↓ internal Docker network (restaurant_net)
┌─────────────────────────────────────────┐
│  FastAPI (backend container)            │
│  - Port 8000 (internal only)            │
│  - Reads .env for DB credentials        │
│  - Serves /static/* uploaded files      │
└─────────────────────────────────────────┘
    ↓ (Supabase cloud OR postgres container)
┌─────────────────────────────────────────┐
│  PostgreSQL                             │
│  - Supabase (current) OR local VPS      │
└─────────────────────────────────────────┘
```
