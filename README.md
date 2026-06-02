# DeckPilot AI

AI PPT generation site with a React frontend, an Express API, OpenAI structured deck generation, and PowerPoint export.

## Local Setup

Create `.env.local` or `.env` in the project root:

```env
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-5.2
MOCK_OPENAI=0
PORT=8787
FREE_CREDITS=75
CREDIT_COST_PER_SLIDE=5
DATA_STORE=sqlite
```

Optional:

```env
OPENAI_MODEL_CANDIDATES=gpt-5.2,gpt-5.1,gpt-5-mini
OPENAI_BASE_URL=https://api.openai.com
OPENAI_HTTPS_PROXY=http://127.0.0.1:10808
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

## Verification

Check whether the OpenAI key can actually call the API:

```bash
npm run doctor:openai
```

Run end-to-end API verification against a running local server:

```bash
npm run verify:api
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
