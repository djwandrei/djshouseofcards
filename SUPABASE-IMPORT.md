# Supabase import guide

This project can seed the local catalog into Supabase without switching the storefront to backend-only mode.

## What gets imported

- Every row from `products.json`
- Featured flags and featured ordering from `products-featured.json`
- Core storefront fields such as category, price, images, gallery, and source page
- Extra local metadata such as `itemPhotoUrls`, `htmlImageUrls`, `htmlFullLink`, `displayPrice`, `copyCount`, and `metadata`

## One-time Supabase setup

1. Run `supabase-schema.sql` in the Supabase SQL editor.
2. Confirm the admin email inside the RLS policies matches the email you will sign in with.
3. Make sure email/password auth is enabled if you plan to use the admin login flow.

## Import from PowerShell

The standalone importer does not change storefront behavior. It only upserts rows into the remote `products` table.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\import-products-to-supabase.ps1 `
  -SupabaseUrl 'https://YOUR_PROJECT.supabase.co' `
  -SupabaseKey 'YOUR_SUPABASE_PUBLISHABLE_OR_SERVICE_KEY' `
  -AdminEmail 'you@example.com' `
  -AdminPassword 'YOUR_PASSWORD'
```

Notes:

- If `backend-config.js` already has the correct project URL and key, you can omit `-SupabaseUrl` and `-SupabaseKey`.
- If you use a service-role key instead of email/password auth, omit `-AdminEmail` and `-AdminPassword`.
- The importer upserts by `id`, so rerunning it updates existing rows instead of creating duplicates.

## Import from the admin page

`admin.html` also has an import button. It now loads both `products.json` and `products-featured.json` before seeding Supabase, so featured rows stay marked correctly.
