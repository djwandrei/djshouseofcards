# Supabase troubleshooting checklist for DJ's House of Cards

## What was fixed in the code
- Added safer backend config handling for local development and file-based previews.
- Added better Supabase error messages for:
  - invalid API keys
  - missing `products` table
  - RLS / permission issues
  - missing storage bucket
  - invalid login credentials
  - unconfirmed admin email
- Added a **Run Connection Test** button in the admin page.
- Added an automatic connection test during admin startup.
- Added a project-specific Supabase auth storage key to avoid session collisions.

## What to verify in Supabase

### 1) API key
Use the full **publishable key** (or legacy `anon` key) in `backend-config.js`.

### 2) Database schema
Run `supabase-schema.sql` in the Supabase SQL Editor.
This creates:
- `public.products`
- the `updated_at` trigger
- RLS policies for public reads and admin writes
- the `product-images` storage bucket policies

### 3) Auth user
Create the admin user in **Authentication > Users**.
The SQL policy currently allows admin writes only for:
- `djwandrei@gmail.com`

If you sign in with a different email, reads may work but writes/uploads/deletes will fail because of RLS.

### 4) Email/password auth
Make sure email/password sign-in is enabled for the project.
If sign-in says the email is not confirmed, either confirm the user in Supabase or temporarily relax confirmation while testing.

### 5) Storage bucket
Make sure the `product-images` bucket exists and is **public**.
Uploads depend on the storage policies from `supabase-schema.sql`.

## Common failure patterns
- **Invalid API key / unauthorized**
  - Usually means the publishable key was copied incorrectly.
- **Relation does not exist**
  - The SQL schema was not run yet.
- **RLS / permission denied**
  - You are signed in with the wrong email, or the policies were not created.
- **Bucket not found**
  - Create `product-images` in Storage.
- **Invalid login credentials**
  - The admin user does not exist yet, or the password is wrong.

## Recommended order
1. Update `backend-config.js`
2. Run `supabase-schema.sql`
3. Create/confirm the admin auth user
4. Open `admin.html`
5. Click **Run Connection Test**
6. Sign in
7. Click **Import Current products.json**

## Alternative import path
If you want to seed Supabase without turning on backend mode in the site first, use:

- `scripts/import-products-to-supabase.ps1`
- `SUPABASE-IMPORT.md`
