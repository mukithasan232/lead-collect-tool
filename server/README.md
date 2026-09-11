# LeadPulse AI — Backend Production Guide

LeadPulse AI backend is an Express + TypeScript microservice powered by Prisma (PostgreSQL), BullMQ (Upstash Redis), and `deep-email-validator`.

---

## 🚀 Quick Deployment Commands

```bash
# 1. Install dependencies
npm install

# 2. Generate Prisma Client
npx prisma generate

# 3. Build TypeScript to JavaScript
npm run build

# 4. Start production server
npm start
```

---

## 🔐 Required Production Environment Variables

Set these environment variables in your deployment dashboard (e.g., Render, Railway, Heroku, AWS ECS, or Docker):

| Variable | Required | Description | Example |
| :--- | :---: | :--- | :--- |
| `DATABASE_URL` | **Yes** | PostgreSQL connection string (Transaction mode pooler for Supabase/Neon/RDS) | `postgresql://user:password@host:6543/postgres?pgbouncer=true` |
| `DIRECT_URL` | **Optional** | Session-mode direct connection string for Prisma migrations | `postgresql://user:password@host:5432/postgres` |
| `REDIS_URL` | **Yes** | Redis connection URI with TLS for BullMQ background workers | `rediss://default:token@cluster.upstash.io:6379` |
| `PDL_API_KEY` | **Optional** | People Data Labs API Key for B2B profile enrichment | `pdl_live_...` |
| `NUBELA_API_KEY` / `PROXYCURL_API_KEY` | **Optional** | NinjaPear (formerly Proxycurl) workspace API key for email lookup | `9cc6cab7...` |
| `PORT` | **No** | Port to listen on (automatically set by Railway/Render/Heroku) | `5001` or `8080` |
| `NODE_ENV` | **Yes** | Set to `production` for production deployments | `production` |
| `CORS_ORIGIN` | **No** | Comma-separated list of allowed frontend origins (whitelists `https://lead-collect-tool-mu.vercel.app`, `https://app.codernest.cloud`, and `*.vercel.app`) | `https://lead-collect-tool-mu.vercel.app,https://app.codernest.cloud` |
| `API_PREFIX` | **No** | Route prefix for API endpoints (defaults to `/api/v1`) | `/api/v1` |

---

## 🌐 Production Healthcheck & API Endpoints

- **Healthcheck:** `GET /api/v1/health`
- **Trigger Targeted Scan:** `POST /api/v1/leads/scan`
- **Retrieve Leads:** `GET /api/v1/leads?userId={userId}&limit={limit}`
- **Single Lead CRUD:** `GET /api/v1/leads/:id`, `PATCH /api/v1/leads/:id`, `DELETE /api/v1/leads/:id`
