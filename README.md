# Promptly

A SaaS platform that generates complete booking websites from a conversation.
The user describes their business, an LLM picks and configures the page blocks,
and the result is previewable and deployable in minutes — one isolated container
per client.

**Live:** https://promptly-cyan.vercel.app

**Stack:** React · Vite · TypeScript · shadcn/ui · Tailwind · Supabase · OpenAI · Docker

---

> ### Where the OpenAI key lives, and why
>
> The key is read from `OPENAI_API_KEY` by `server/index.js` and **never reaches
> the browser**. The client posts its messages to `POST {VITE_SITEGEN_URL}/ai/chat`
> and the server relays them to OpenAI.
>
> The `VITE_` prefix is deliberately absent: Vite inlines every `VITE_`-prefixed
> variable into the client bundle at build time, so a key named
> `VITE_OPENAI_API_KEY` would be served to every visitor and extractable from the
> JavaScript in seconds. An earlier version of this project did exactly that.
>
> Practical consequence: **the server must be running** for generation to work,
> in development too — `npm run dev:all` starts the front end and the server
> together.

---

## How it works

```
9-question onboarding
        │
        ▼
  4-layer system prompt  ──▶  1 OpenAI call  ──▶  4 block configs (JSON)
        │
        ▼
  PageRenderer  ──▶  live preview  ──▶  Supabase (source of truth)
                                              │
                                              ▼
                                    deploy trigger ──▶ Docker container
                                                       per client + Nginx
```

The generated site is **data, not code**: the LLM emits a JSON configuration
that selects and parameterises pre-built React blocks. That keeps generation
deterministic to render, cheap to store, and editable after the fact — a chat
message mutates the config, not a codebase.

## What's in it

| | |
|---|---|
| React blocks | 37 (26 homepage · 3 auth · 8 booking) |
| Block types | 12, each with 2–3 variants |
| Onboarding | 9 questions |
| System prompt | 4 layers, ~150 lines |
| Supabase migrations | 20 |
| OpenAI calls per site | 1 |

Multi-tenancy is enforced in Postgres with Row Level Security, not in
application code — every client's configs and uploads are isolated at the
database layer.

## Running it

Requires Node 18+ and a Supabase project.

```bash
cp .env.example .env     # Supabase (VITE_*) + OPENAI_API_KEY (server-side)
npm install
npm run dev:all          # front-end :5173 + server :4000 + orchestrator
```

Or piece by piece:

```bash
npm run dev              # front-end on :5173
npm run server           # :4000 — carries the OpenAI relay, required to generate
npm run orchestrator     # :4001 — deployment orchestrator (optional)
```

With Docker:

```bash
docker compose up
```

## Documentation

Detailed technical docs live in [`docs/`](./docs):

| # | Document |
|---|---|
| 01 | [Architecture](./docs/01-architecture.md) — stack, routing, creation flow, persistence |
| 02 | [Template engine](./docs/02-template-engine.md) — blocks, JSON libraries, PageRenderer |
| 03 | [AI pipeline](./docs/03-ai-pipeline.md) — questionnaire, system prompt, response types |
| 04 | [Creator interface](./docs/04-creator-interface.md) — SiteCreator, ChatPanel, ConfigPanel |
| 05 | [Multi-tenant database](./docs/05-multitenant-db.md) — Supabase, RLS, storage |
| 06 | [Deployment](./docs/06-deployment.md) — Vercel for the platform, Docker/Nginx per client |
| 07 | [SaaS v2 specification](./docs/07-saas-v2-spec.md) |
| 08 | [Multi-project support](./docs/08-multi-projects.md) |

Setup guides: [Supabase](./docs/supabase-setup.md) · [environment](./docs/env-config.md) ·
[Ollama (local models)](./docs/ollama-setup.md) · [deployment notes](./docs/deploy-notes.md)

## Known limitations

- The OpenAI key is exposed client-side — see the security notice above.
- No automated test suite; [`docs/test-scenarios.md`](./docs/test-scenarios.md)
  lists manual scenarios only.

## License

MIT — see [LICENSE](LICENSE).
