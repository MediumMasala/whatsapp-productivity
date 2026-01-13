# WhatsApp Productivity Tool

A production-grade WhatsApp-first productivity tool that lets users manage tasks via natural language chat, with a beautiful web dashboard for visual task management.

## Features

- **WhatsApp Integration**: Create tasks, set reminders, and manage to-dos via WhatsApp chat
- **Natural Language Processing**: AI-powered intent parsing with rule-based fallbacks
- **Smart Reminders**: Automatic reminders at the right time with 24h session window handling
- **Web Dashboard**: Drag-and-drop Kanban board with Ideas / To-Do / Done columns
- **Bi-directional Sync**: Changes on web sync to WhatsApp (within session window)

## Architecture

```
├── apps/
│   ├── api/          # Fastify backend with BullMQ workers
│   └── web/          # Next.js dashboard with dnd-kit
├── packages/
│   ├── shared/       # Types, schemas, utilities
│   └── mastra/       # AI agent and intent parsing
├── docker-compose.yml
└── turbo.json
```

## Tech Stack

- **Monorepo**: Turborepo + pnpm
- **API**: Fastify, Prisma, PostgreSQL, Redis, BullMQ
- **Web**: Next.js 14, React, Tailwind CSS, dnd-kit, Zustand
- **AI**: OpenAI GPT-4o-mini (optional), chrono-node for date parsing
- **Messaging**: WhatsApp Cloud API

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose
- WhatsApp Business Account (for production)

## Quick Start

### 1. Clone and Install

```bash
cd "Whatsapp Productivity Prompt"
pnpm install
```

### 2. Set Up Environment

```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Start Infrastructure

```bash
docker compose up -d
```

### 4. Set Up Database

```bash
pnpm db:generate
pnpm db:push
pnpm db:seed  # Optional: seed with test data
```

### 5. Start Development

```bash
pnpm dev
```

This starts:
- API server at http://localhost:3001
- Web dashboard at http://localhost:3000

## WhatsApp Cloud API Setup

### 1. Create Meta App

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create a new app → Select "Business" type
3. Add "WhatsApp" product

### 2. Configure Webhook

1. In your app dashboard, go to WhatsApp → Configuration
2. Set webhook URL: `https://your-domain.com/webhooks/whatsapp`
3. Set verify token: Use the same value as `WHATSAPP_VERIFY_TOKEN` in your .env
4. Subscribe to: `messages`, `message_template_status_update`

### 3. Get Credentials

From the WhatsApp dashboard, copy:
- Phone Number ID → `WHATSAPP_PHONE_NUMBER_ID`
- Temporary Access Token → `WHATSAPP_ACCESS_TOKEN`
- App Secret (Settings > Basic) → `WHATSAPP_APP_SECRET`

### 4. Create Message Template

For reminders outside the 24h session window, create a template:

**Template Name**: `task_reminder_v1`
**Category**: Utility
**Language**: English
**Body**:
```
🔔 Reminder: {{1}}
Due: {{2}}

Reply to this message to mark done or snooze.
```

## Environment Variables

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/whatsapp_productivity"

# Redis
REDIS_URL="redis://localhost:6379"

# WhatsApp Cloud API
WHATSAPP_PHONE_NUMBER_ID="your_phone_number_id"
WHATSAPP_ACCESS_TOKEN="your_access_token"
WHATSAPP_VERIFY_TOKEN="your_custom_verify_token"
WHATSAPP_APP_SECRET="your_app_secret"

# API
API_PORT=3001
API_URL="http://localhost:3001"

# Web
NEXT_PUBLIC_API_URL="http://localhost:3001"
NEXTAUTH_SECRET="generate_with_openssl_rand_base64_32"

# AI (optional - falls back to rule-based parsing)
OPENAI_API_KEY="your_openai_api_key"
```

## WhatsApp Commands

### Creating Tasks

```
remind me tomorrow 9am to send the deck
→ Creates TODO with reminder

todo: review the proposal
→ Creates TODO without reminder

idea: build a hiring tracker
→ Creates IDEA (no reminder)
```

### Managing Tasks

```
list            → Show active tasks
ideas           → Show saved ideas
done            → Mark last reminder done
snooze 1h       → Snooze last reminder
help            → Show commands
settings        → Link to web dashboard
```

### Reminder Interaction

When a reminder fires, you'll see:
```
🔔 reminder: send the deck
(today 9:00 am)

done?
[✅ Done] [⏰ Snooze] [✏️ Edit]
```

## API Endpoints

### Authentication

```
POST /auth/request-otp     # Request OTP via email
POST /auth/verify-otp      # Verify OTP and get token
POST /auth/link-whatsapp   # Link WhatsApp number
GET  /me                   # Get current user
```

### Tasks

```
GET    /tasks              # List tasks (with filters)
POST   /tasks              # Create task
GET    /tasks/:id          # Get task
PATCH  /tasks/:id          # Update task
DELETE /tasks/:id          # Delete task
POST   /tasks/:id/complete # Mark complete
POST   /tasks/:id/snooze   # Snooze reminder
```

### WhatsApp Webhook

```
GET  /webhooks/whatsapp    # Verification
POST /webhooks/whatsapp    # Receive messages
```

### Development

```
POST /dev/simulate-message # Simulate inbound message
POST /dev/simulate-reply   # Simulate button reply
GET  /health               # Health check
GET  /metrics              # Queue stats
```

## Testing

```bash
# Run all tests
pnpm test

# Run API tests
pnpm --filter api test

# Run mastra tests
pnpm --filter @whatsapp-productivity/mastra test
```

## Development Tips

### Simulate WhatsApp Messages

Without actual WhatsApp setup, use the dev endpoints:

```bash
# Create a task
curl -X POST http://localhost:3001/dev/simulate-message \
  -H "Content-Type: application/json" \
  -d '{"from": "+919999999999", "text": "remind me tomorrow 10am to call John"}'

# Mark done
curl -X POST http://localhost:3001/dev/simulate-message \
  -H "Content-Type: application/json" \
  -d '{"from": "+919999999999", "text": "done"}'
```

### View Database

```bash
pnpm db:studio
```

### Watch Logs

The API uses pino with pretty printing in development.

## Deployment

### API (Docker)

```dockerfile
# apps/api/Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install -g pnpm && pnpm install --frozen-lockfile
RUN pnpm --filter api build
EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
```

### Web (Vercel)

1. Connect your repo to Vercel
2. Set root directory to `apps/web`
3. Add environment variables
4. Deploy

### Infrastructure

- **Database**: Supabase, Neon, or any PostgreSQL
- **Redis**: Upstash, Railway, or any Redis
- **API Hosting**: Render, Fly.io, Railway, or any Node.js host

## Project Structure

```
apps/api/
├── prisma/
│   ├── schema.prisma    # Database schema
│   └── seed.ts          # Seed data
├── src/
│   ├── lib/             # Core utilities
│   │   ├── config.ts    # Environment config
│   │   ├── prisma.ts    # Database client
│   │   ├── redis.ts     # Redis client
│   │   ├── queue.ts     # BullMQ setup
│   │   └── logger.ts    # Pino logger
│   ├── middleware/      # Fastify middleware
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── workers/         # Background workers
│   └── index.ts         # Entry point

apps/web/
├── src/
│   ├── app/             # Next.js app router
│   ├── components/      # React components
│   ├── hooks/           # Custom hooks
│   └── lib/             # Utilities & API client

packages/shared/
├── src/
│   ├── types/           # TypeScript types
│   ├── schemas/         # Zod schemas
│   ├── constants/       # Shared constants
│   └── utils/           # Helper functions

packages/mastra/
├── src/
│   └── agent/           # AI parsing logic
```

## License

MIT
