# Supabase Setup for ORBITAL (optional cloud sync)

ORBITAL runs 100% backendless by default (IndexedDB, PWA offline). Cloud sync is **optional** and only enabled if you explicitly opt-in.

## 1. Create Supabase project
- Go to https://supabase.com, create project, note URL and anon key.

## 2. Environment
Set in `.env.local` (Vite):
```
VITE_SUPABASE_URL=https://xyz.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```
Or enter via UI in Audit → Supabase Sync Adapter (stored in localStorage).

## 3. Tables (SQL)

```sql
-- Profiles (face templates only if biometric opt-in)
create table orbital_profiles (
  id text primary key,
  user_id uuid references auth.users(id),
  name text,
  created_at bigint,
  language text,
  prefs jsonb,
  descriptor jsonb, -- Float32Array as JSON, only if biometric opt-in + encrypted
  updated_at timestamp default now()
);

-- Dossiers
create table orbital_dossiers (
  id text primary key,
  user_id uuid references auth.users(id),
  target text,
  jurisdiction text,
  created_at bigint,
  facts jsonb,
  timeline jsonb,
  checklist jsonb,
  updated_at timestamp default now()
);

-- Preferences (saved views, camera pins)
create table orbital_prefs (
  user_id uuid primary key references auth.users(id),
  prefs jsonb,
  updated_at timestamp default now()
);

-- Enable RLS
alter table orbital_profiles enable row level security;
alter table orbital_dossiers enable row level security;
alter table orbital_prefs enable row level security;

create policy "Users can manage own profiles" on orbital_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can manage own dossiers" on orbital_dossiers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can manage own prefs" on orbital_prefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

## 4. UI
- Audit tab → Supabase Sync Adapter: Save Config, Enable Cloud Sync (opt-in), Sync Up Now
- Face tab: biometric cloud opt-in separate, requires explicit consent (BIPA)
- All sync functions check `localStorage.orbital_cloud_sync_optin === '1'` and biometric `orbital_biometric_cloud_optin`

## 5. Offline-first
- If Supabase not configured, app never tries network
- If enabled but offline, falls back to IndexedDB, syncs later
- One-click wipe deletes local; cloud data remains per Supabase RLS (user can delete via dashboard)

## 6. Security / Guardrails
- Face descriptors never leave device unless `biometric_optin` + encryption (placeholder for real encryption)
- Dossiers contain OSINT facts only (public sources), tagged with confidence + verification
- Audit log stays local (IndexedDB) for immutability, cloud sync only for prefs/dossiers if opted in
