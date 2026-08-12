# Promptly

A SaaS platform that generates complete booking websites from a conversation.
The user describes their business, an LLM picks and configures the page blocks,
and the result is previewable and deployable in minutes — one isolated container
per client.

**Live:** https://promptly-cyan.vercel.app

**Stack:** React · Vite · TypeScript · shadcn/ui · Tailwind · Supabase · OpenAI · Docker

---

> ### Security notice — read before deploying
>
> This project reads the OpenAI key through `VITE_OPENAI_API_KEY`. **Vite inlines
> every `VITE_`-prefixed variable into the client bundle at build time**, so that
> key is served to every visitor and can be extracted from the JavaScript.
>
> Do not deploy this as-is with a real key. The OpenAI call belongs in
> `server/`, behind an endpoint the browser calls — never in the client. This is
> a known flaw in the current architecture, kept visible here rather than
> quietly papered over.

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
cp .env.example .env     # fill in Supabase + OpenAI values
npm install
npm run dev              # front-end on :5173
npm run orchestrator     # deployment orchestrator (optional)
npm run dev:all          # both at once
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
