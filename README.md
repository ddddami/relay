# Relay

**A deployment pipeline in one page.** Paste a public GitHub repository URL, build it with Railpack, run it as a container, and route it through Caddy from a single UI.

<img width="3024" height="1646" alt="Screenshot 2026-04-27 at 03 47 37" src="https://github.com/user-attachments/assets/f334f522-6d26-4db3-bf09-c607805a435e" />

> Built for the Brimble take-home task. This is a scoped prototype, not a production-ready platform.

## Quick Start

### Option 1: Docker Compose

Requirements:

- Docker
- Docker Compose

```bash
git clone https://github.com/ddddami/relay
cd relay
docker compose up
```

Open `http://localhost`.

If you change workspace dependencies or Dockerfiles locally and want a fresh rebuild, use `docker compose up --build`.

### Option 2: Mise

If you use [mise](https://mise.jdx.dev):

```bash
mise install
mise run install
mise run dev
```

## What It Does

1. Accepts a public GitHub repository URL
2. Persists a deployment record in SQLite
3. Clones the repository inside the backend runtime
4. Builds a runnable image with Railpack
5. Starts a Docker container from that image
6. Verifies the runtime and detects a reachable port
7. Routes traffic through Caddy
8. Streams logs live to the UI over SSE while persisting them to the database

The product surface stays intentionally small: one page, one API, one deployment pipeline.

## Assignment Fit

This implementation is intentionally aligned to the take-home brief:

- Single `docker compose up` boot path
- One-page UI driving the full deployment flow
- Real live log streaming via SSE
- Real Railpack image builds
- Docker runtime orchestration
- Caddy as the single ingress point
- Compact, maintainable code over feature breadth

I kept the frontend to a single view and used TanStack Query for server state. I did not add TanStack Router because there is no multi-page surface in this prototype.

Out of scope by design:

- auth
- orgs / multi-tenancy
- billing
- k8s
- private repo support
- production-grade scheduling and isolation

## Stack

- Frontend: React, Vite, TanStack Query
- Backend: Fastify, TypeScript
- Database: SQLite via Drizzle and `@libsql/client`
- Build: Railpack
- Runtime: Docker
- Ingress: Caddy
- Live logs: SSE

## Some Notes on Architecture

### Docker Socket Mounting

The API container mounts `/var/run/docker.sock` so it can build images and run deployment containers directly.

Why:

- simplest way to demonstrate real container orchestration in the scope of this task
- avoids Docker-in-Docker complexity for a local evaluator setup

Trade-off:

- weak isolation boundary
- not something I would keep as-is in a production multi-tenant system

### SQLite w/ Drizzle

The app uses SQLite for local persistence, accessed through Drizzle and `@libsql/client`.

Why:

- one fewer moving part for reviewers
- enough for a single-node local prototype
- simple file-based persistence works well for this assignment

Trade-off:

- not appropriate for a larger multi-tenant control plane with higher write concurrency

### SSE for Live Logs

Logs are streamed with Server-Sent Events and also stored in the database.

Why:

- fits the product need well because logs are server-to-client only
- simpler than standing up a WebSocket channel for this use case
- straightforward reconnect behavior

Trade-off:

- not bidirectional
- less flexible if the UI later needs interactive terminal or streaming control messages

### Subdomain-First Local Routing

Deployments are exposed through `*.localhost` and proxied by Caddy into the API's deployment proxy.

Why:

- path-based routing leaked framework internals for apps that expect root-relative assets
- subdomain ingress is a better fit for real application hosting behavior
- still works locally without extra DNS setup because `localhost` wildcard subdomains resolve on modern systems

Trade-off:

- slightly more complex than a pure `/apps/:id` route
- there is still a compatibility `/apps/*` path route in the codebase, but it is no longer the primary model

### Runtime Verification and Port Detection

The runner does not mark a deployment `running` immediately after `docker run`.

Current behavior:

- waits for the container to stabilize
- probes common ports
- persists the detected reachable port
- fails the deployment if no reachable runtime is found

Why:

- more honest platform behavior
- avoids pretending a deploy succeeded when the process is dead or bound incorrectly

Trade-off:

- still heuristic-based
- some apps with unusual runtime contracts may fail unless they bind a reachable HTTP port

## Product Trade-Offs

A few decisions were intentionally pragmatic for the task:

- public GitHub repositories only (prevents complex auth stuff)
- no queue system
- no rollbacks
- no auth
- no dynamic Caddy API integration yet

That keeps the prototype focused on the actual deployment loop rather than platform perimeter work.

## Project Structure

```text
apps/
  api/        Fastify API, DB access, deployment runner, SSE
  web/        One-page React UI
packages/
  shared/     Shared deployment contracts
infra/
  Caddyfile   Local ingress configuration
```

## Useful Commands

From the repo root:

```bash
pnpm install
pnpm format:check
pnpm lint
pnpm test:run
pnpm typecheck
```

Tooling:

- `oxfmt` for formatting
- `oxlint` for linting
- `vitest` for focused frontend behavior tests

If you change workspace dependencies while using the local Compose setup, the mounted dependency volumes may need a refresh:

```bash
docker compose run --rm -e CI=true api pnpm install --frozen-lockfile
docker compose run --rm -e CI=true web pnpm install --frozen-lockfile
docker compose up -d
```

The same recovery step is available through mise if you want it:

```bash
mise run compose-refresh-deps
```

## What I'd Change Next

### First

- replace the in-process background runner with a proper job queue (likely redis)
- move build and runtime orchestration out of the API process boundary
- drive Caddy dynamically through its API instead of relying on static local config

### Then

- make runtime contracts more explicit for deployed apps
- replace blunt container teardown with more explicit lifecycle handling
- improve failure summaries in the UI beyond raw logs
- add image/cache reuse strategy for faster rebuilds
- add private repo support through GitHub auth

### Things I Would Not Keep As-Is

- Docker socket mounting inside the API container
- local-only dependency volume behavior in Compose
- heuristic port probing as the only runtime contract

## Hard Requirements Met

- Runs end-to-end with `docker compose up`
- Streams logs live to the UI via SSE
- Uses Railpack to produce runnable images
- Keeps the product surface to one UI and one API

## Time Spent

Roughly 2 to 3 days across planning, infra debugging, runtime behavior, UI wiring and screaming at my laptop.
