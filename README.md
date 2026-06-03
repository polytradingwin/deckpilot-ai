# DeckPilot AI

AI PPT generation site with a React frontend, an Express API, OpenAI structured deck generation, and PowerPoint export.

## Local Setup

Create `.env.local` or `.env` in the project root:

```env
OPENAI_API_KEY=your_openai_api_key_here
AI_PROVIDER=openai
OPENAI_MODEL=gpt-5.2
MOCK_OPENAI=0
PORT=8787
WORKER_PORT=8790
FRONTEND_ORIGIN=https://your-frontend.example.com
VITE_API_BASE_URL=https://api.your-domain.com
FREE_CREDITS=200
CREDIT_COST_PER_SLIDE=5
MAX_GENERATION_SLIDES=30
DATA_STORE=sqlite
```

Optional:

```env
OPENAI_MODEL_CANDIDATES=gpt-5.2,gpt-5.1,gpt-5-mini
OPENAI_BASE_URL=https://api.openai.com
OPENAI_HTTPS_PROXY=http://127.0.0.1:10808
ANTHROPIC_API_KEY=your_anthropic_api_key_here
ANTHROPIC_MODEL=claude-sonnet-4-5
ANTHROPIC_BASE_URL=https://api.anthropic.com
GENERATION_WORKER_URL=https://your-worker.example.com/jobs
WORKER_SHARED_SECRET=replace_with_a_long_random_secret
DATABASE_PATH=output/deckpilot.sqlite
DATA_STORE=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_or_publishable_key
SUPABASE_BACKEND_SECRET=your_server_only_rpc_secret
SUPABASE_STORAGE_BUCKET=deckpilot-pptx
```

Project `.env` and `.env.local` values intentionally override inherited system environment variables. This avoids accidentally using an old global `OPENAI_API_KEY`.

For local testing without OpenAI billing:

```env
MOCK_OPENAI=1
PORT=8787
```

If `.env.local` is set to real OpenAI mode but you want one temporary mock run, start the API with `FORCE_MOCK_OPENAI=1`.

Install and run:

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

## AI Provider

The default provider is OpenAI:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.2
```

To switch to Claude/Anthropic:

```env
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-sonnet-4-5
```

The API reads provider settings at runtime, so changing models is an environment-variable change plus redeploy.

## Long Deck Worker

On Netlify, 10-30 slide decks use `netlify/functions/generate-ppt-background.mts`, a Netlify Background Function. It returns `202` immediately and can continue the generation job for up to 15 minutes. The API stores job status in Supabase, and the frontend polls until the PPTX is ready.

Default Netlify production behavior:

```env
MAX_GENERATION_SLIDES=30
NETLIFY_BACKGROUND_GENERATION=1
```

Set `NETLIFY_BACKGROUND_GENERATION=0` only when you intentionally want the short worker fallback.

For larger scale or a dedicated worker host, run the standalone worker on a long-running Node host such as Railway, Render, Fly.io, or a VPS:

```bash
npm run worker
```

The worker exposes:

- `GET /health`
- `POST /jobs`

Configure the Netlify/API deployment to use it:

```env
GENERATION_WORKER_URL=https://your-worker.example.com/jobs
WORKER_SHARED_SECRET=replace_with_a_long_random_secret
MAX_GENERATION_SLIDES=30
```

When `GENERATION_WORKER_URL` is set, it overrides Netlify Background Functions. The API still handles login, credits, upload parsing, history, and downloads. The worker only performs the long PPT generation job and writes the result back to Supabase.

## Verification

Check whether the OpenAI key can actually call the API:

```bash
npm run doctor:openai
```

Run end-to-end API verification against a running local server:

```bash
npm run verify:api
```

Run 30-slide worker verification against an API configured with `GENERATION_WORKER_URL`:

```bash
npm run verify:worker
```

If `doctor:openai` fails, check that the key is an OpenAI API key, the selected project has billing and model access, and whether your deployment environment requires `OPENAI_BASE_URL` to point at an approved gateway.

## API

- `GET /api/health`
- `GET /api/session`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/generations`
- `GET /api/generations/:id/download`
- `POST /api/generate-ppt`

`/api/generate-ppt` accepts either ordinary form fields or `multipart/form-data` with a `.pptx` file field named `file`.
The generation and history endpoints require the login cookie returned by `POST /api/auth/login`.
New local users receive `FREE_CREDITS`, and each generation costs `slides * CREDIT_COST_PER_SLIDE`.

When `DATA_STORE=supabase`, user accounts, sessions, credits, and generation metadata are stored in Supabase.
Generated `.pptx` files are stored in Supabase Storage bucket `SUPABASE_STORAGE_BUCKET`, so deployment targets with ephemeral filesystems, such as Vercel, can safely serve historical downloads.

## Vercel

This project includes:

- `api/[...path].ts` for Vercel serverless API routing
- `vercel.json` for Vite output, API duration, and SPA fallback routing

Required production environment variables on Vercel:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `DATA_STORE`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_BACKEND_SECRET`
- `SUPABASE_STORAGE_BUCKET`
- `FREE_CREDITS`
- `CREDIT_COST_PER_SLIDE`
- `MOCK_OPENAI`

Main fields:

- `source`: `ppt`, `outline`, or `topic`
- `purpose`: `fundraising`, `sales`, `training`, or `report`
- `style`: `consulting`, `product`, `brand`, or `academic`
- `slides`: `4` to `30`
- `language`
- `audience`
- `prompt`
