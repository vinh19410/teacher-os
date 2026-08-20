# teacher-os

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Router, Hono, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Router** - File-based routing with full type safety
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Hono** - Lightweight, performant server framework
- **workers** - Runtime environment
- **Drizzle** - TypeScript-first ORM
- **Cloudflare D1** - Database engine
- **Authentication** - Better-Auth
- **Biome** - Linting and formatting
- **PWA** - Progressive Web App support
- **Turborepo** - Optimized monorepo build system

## Documentation

Project context, architecture, and development conventions live in the [documentation index](docs/index.md).

## Getting Started

First, install the dependencies:

```bash
pnpm install
```

## Database Setup

This project uses Cloudflare D1 (SQLite) with Drizzle ORM.

Runtime database access uses the Cloudflare `DB` binding from `packages/infra/alchemy.run.ts`. If a local `DATABASE_URL` is present, it is only for database tooling.

Alchemy provisions the D1 database and applies migrations during `deploy`.

1. Generate migration files:

```bash
pnpm run db:generate
```

Then, run the development server:

```bash
pnpm run dev
```

Open [http://localhost:8001](http://localhost:8001) in your browser to see the web application.
The API is running at [http://localhost:8000](http://localhost:8000).

## Authentication

Sign-in uses Better-Auth with Google OAuth as the primary method (email/password is also enabled).

### Google OAuth setup

1. Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) and create an **OAuth client ID** (type: Web application).
2. Add the authorized redirect URI `<BETTER_AUTH_URL>/api/auth/callback/google`:
   - Local dev: `http://localhost:8000/api/auth/callback/google`
   - Production (`APP_DOMAIN=<domain>`): `https://api.<domain>/api/auth/callback/google`
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `apps/server/.env`, then restart `pnpm run dev` (or redeploy).

The web origin must be listed in `CORS_ORIGIN` (server `trustedOrigins`) so the OAuth callback can redirect back to the app. With `APP_DOMAIN` set, `CORS_ORIGIN` defaults to `https://app.<domain>`.

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@teacher-os/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Deployment

### Alchemy

- Target: web on Cloudflare + server on Cloudflare
- Configure provider login: `cd packages/infra && pnpm exec alchemy login --configure`
- Preferred local/CI method: Cloudflare **API Token via env** (`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`). After `alchemy login --configure`, pick **Environment Variables**.
- Dev: pnpm run dev
- Deploy: pnpm run deploy
- Destroy: pnpm run destroy

`alchemy login --configure` stores the selected Cloudflare, Neon, PlanetScale, and/or Prisma provider profiles under `~/.alchemy`; secrets for the env method stay in the process environment (or a gitignored `packages/infra/.env`), not in the profile.

Deploys are staged and default to a personal `dev_<username>` stage. Stages isolate state and physical resources — staging and production never share a D1 database:

```bash
cd packages/infra
pnpm alchemy deploy --stage staging   # isolated rehearsal environment
pnpm alchemy deploy --stage prod      # production
```

### Production topology

Set `APP_DOMAIN` (bare lowercase domain) in `packages/infra/.env` to serve the app at `app.<domain>` and the API at `api.<domain>`; CORS origin, Better Auth base URL, the Google redirect URI, and cross-subdomain session cookies all derive from it (see `packages/infra/src/topology.ts`). Without `APP_DOMAIN`, deploys keep their generated `workers.dev` URLs and require an explicit `CORS_ORIGIN`.

Release preflight, smoke tests, rollback, GO/NO-GO, and support procedure live in the [production release runbook](docs/production-release-runbook.md) — that is the entry point for every release and UAT.

## Git Hooks and Formatting

- Run checks: `pnpm run check`

## Project Structure

```
teacher-os/
├── apps/
│   ├── web/         # Frontend application (React + TanStack Router)
│   └── server/      # Backend API (Hono)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── auth/        # Authentication configuration & logic
│   └── db/          # Database schema & queries
```

## Available Scripts

- `pnpm run dev`: Start all applications in development mode
- `pnpm run build`: Build all applications
- `pnpm run dev:web`: Start only the web application
- `pnpm run dev:server`: Start only the server
- `pnpm run check-types`: Check TypeScript types across all apps
- `pnpm run db:generate`: Generate database client/types
- `pnpm run check`: Run Biome formatting and linting
- `cd apps/web && pnpm run generate-pwa-assets`: Generate PWA assets
