# PS Rice repository guidance

## Stack and layout

- This is a private Next.js `16.2.3` App Router application using React `19.2.4`, TypeScript, Tailwind CSS `4`, and npm (`package-lock.json` is the lockfile).
- `src/app/` contains route segments and API route handlers. The main product areas are `/employee`, `/manager`, `/backoffice`, `/pos`, `/shop`, and `/hub`.
- `src/components/` contains shared UI, workforce layout/navigation, and Commerce workspaces. `src/lib/` contains domain logic and integrations. `src/store/` contains Zustand stores.
- The `@/*` TypeScript alias resolves to `src/*`; follow it for internal imports.
- Before changing Next.js behavior or APIs, consult the installed Next.js 16 guidance under `node_modules/next/dist/docs/`.

## Source of truth and data flow

- `src/lib/types.ts` is the shared TypeScript model for workforce entities; `src/lib/constants.ts` owns shared labels, status colors, navigation, and operational defaults.
- Workforce state lives in the domain stores under `src/store/`. These stores generally query Supabase directly and maintain Supabase Realtime subscriptions. `authStore.ts` owns session/profile state; `taskStore.ts`, `attendanceStore.ts`, `hrStore.ts`, `employeeStore.ts`, `branchStore.ts`, and `notificationStore.ts` own their respective domains.
- `src/lib/supabase.ts` is the browser Supabase client and access-token helper. `src/lib/serverAuth.ts` is the server boundary for authenticated requests and the service-role client.
- Commerce client types/helpers are in `src/lib/commerce.ts`; Commerce UI is under `src/components/commerce/`. Commerce API authentication, branch scope, permissions, and service-role access are centralized in `src/lib/commerceServer.ts`.
- Shared workforce primitives are in `src/components/ui/`; workforce shells/navigation are in `src/components/layout/`; the Commerce shell and workspace navigation are in `src/components/commerce/CommerceShell.tsx`.
- Tailwind theme tokens, Thai/Latin font variables, global interaction styles, and motion utilities are defined in `src/app/globals.css` and `src/app/fonts.ts`. Reuse these tokens and primitives before adding one-off styling.

## API and security boundaries

- API handlers live under `src/app/api/**/route.ts`. Workforce/admin routes use `src/lib/serverAuth.ts`; most Commerce routes use `getCommerceRequestContext()` and permission helpers from `src/lib/commerceServer.ts`.
- Commerce client workspaces call `/api/commerce/*` with the Supabase bearer token. Keep authorization and branch-scope checks in the server route; do not move service-role operations into Client Components.
- Attendance uses `/api/attendance` for authenticated reads and mutations. Keep its bearer-token flow intact when changing attendance behavior.
- `/api/store/catalog` and `/api/store/orders` are the public-store boundary and use server-side Commerce/database logic. Treat input validation and the underlying RPCs as part of that boundary.
- `SUPABASE_SERVICE_ROLE_KEY` must remain server-only and must never be used in a Client Component or exposed through a `NEXT_PUBLIC_*` variable. Browser code may use only the public Supabase URL and anon key.
- Expected local environment variables are `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `CRON_SECRET`; keep them in ignored `.env.local`.

## Database and migrations

- `supabase/migrations/` is the canonical, replayable migration history. Create a new migration for schema, RLS, policy, storage, index, trigger, or RPC changes; do not treat `supabase/schema.sql` or other SQL directly under `supabase/` as the current migration source of truth.
- `supabase/config.toml` defines the local Supabase setup. `supabase/DB_STRUCTURE_REVIEW.md` records known database constraints and follow-up risks, especially around RLS, grants, sensitive employee data, and storage policies.
- Prefer existing database RPCs for Commerce transactions and preserve their atomicity. Review related RLS/storage policies and dependent API/client code when changing a table or function.
- Useful CLI commands are `npx supabase migration new <name>`, `npx supabase db lint --local`, `npx supabase db advisors --local`, and `npx supabase db push`. Confirm the linked project and review the migration before pushing to a remote database.

## Commands and verification

```bash
npm install
npm run dev
npm run lint
npx tsc --noEmit
npm run build
npm run start
```

- There is no automated test script in `package.json`. A normal code change is not complete until `npm run lint`, `npx tsc --noEmit`, and `npm run build` pass; add focused manual checks for the affected route or workflow.
- Storage retention verification requires Supabase credentials in `.env.local`:

  ```bash
  npm run verify:storage-retention
  CLEANUP_ENDPOINT=<url> CRON_SECRET=<secret> npm run verify:storage-cleanup
  ```

- `npm run pos:bridge` starts the local receipt-printer bridge and requires its pairing-token environment configuration. Use it only when the POS printing path is in scope.
- For migration work, run the local Supabase lint/advisor checks above in addition to the application checks. For cron/storage changes, verify authentication and the relevant endpoint/script behavior.

## Deployment and operational constraints

- `vercel.json` schedules `/api/cron/daily-tasks` at `17:00 UTC` and `/api/cron/storage-cleanup` at `17:30 UTC`; both depend on `CRON_SECRET` in the deployed environment.
- Apply required Supabase migrations before deploying code that depends on new tables, columns, functions, policies, or storage objects.
- Check-in uses browser Location and Camera APIs. Local development can use `localhost`; testing on other origins requires HTTPS and browser permissions.
- `docs/architecture/commerce-pos-ecosystem-design.md` and the documents under `docs/superpowers/` are design/implementation references. Validate them against the current routes, components, and migrations when they differ.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
