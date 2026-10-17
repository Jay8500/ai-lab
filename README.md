# SpreadApps AI-Lab

Multi-tenant diagnostic lab management & report delivery PWA — Angular 21 (standalone + signals), Tailwind v4, Supabase.

| | |
|---|---|
| Live | https://spreadapps-ai-lab.netlify.app (Netlify site `spreadapps-ai-lab`, team jay8500) |
| Supabase | project `ai-lab` · ref `njxnlszjfghbbjpmzwhh` · ap-south-1 |
| Demo lab | https://srisai-diagnostics.spreadapps.in |

## Roles
- **super_admin** (SpreadApps) — `/admin`: labs, branding, domains, page copy & toggles, test catalogue, per-lab API keys, plans/revenue models, trials, billing ledger, lab logins, Circles support inbox.
- **lab_owner / lab_staff** — `/lab` on the lab's host: tokens, sample status, PDF upload, WhatsApp share, report search, team (owner).
- **patients** — `/track/:token` on the lab's host, no login.

## How a lab is resolved (`TenantService`)
1. `srisai.spreadapps.in` → slug `srisai` (reserved: www, app, admin, lab, ailab, circles, api…)
2. any other host → `tenants.custom_domain`
3. `*.netlify.app` / localhost → `?lab=srisai-diagnostics` (kept in sessionStorage; `?lab=none` resets)

## Backend
- `supabase/migrations/` — schema, RLS, RPCs (`resolve_tenant`, `track_visit`, `admin_tenant_stats`), storage buckets (`reports` public-by-unguessable-path, `branding` public, `support` private).
- `supabase/functions/admin-users` — create/list/reset/remove lab logins (service role stays server-side).
- `tenant_secrets` is readable by super admins only; trial/subscription is enforced in RLS via `tenant_is_usable()`.

```bash
npm start                                   # http://localhost:4200/?lab=srisai-diagnostics
supabase db push                            # apply migrations (project is linked)
supabase functions deploy admin-users --use-api
```

## Deploys
Every push to `main` on GitHub (Jay8500/ai-lab) is built and published by Netlify automatically (`netlify.toml`).
Manual fallback: `npm run build && netlify deploy --prod --dir dist/spreadapps-lab/browser --no-build`

## Going live on spreadapps.in
Add `ailab.spreadapps.in` and `*.spreadapps.in` as domains on the Netlify site (wildcard needs Netlify DNS for the zone),
then every lab created in Admin is reachable at `<slug>.spreadapps.in`.
