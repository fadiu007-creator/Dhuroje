# Dhuroje

**Mos e hidh. Dhuroje.**

Dhuroje is a free local sharing app for unused food and items.

## Current MVP

- Mobile-first giveaway feed
- Search and category filters
- Giveaway posting modal
- Claim interaction
- Food-aware listing model
- Supabase-ready schema for listings, claims, messaging, reviews and reports

## Run locally

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and add the Supabase project URL and publishable key when persistence is connected.

## Supabase

The initial schema is in `supabase/schema.sql`. It is intentionally not applied to a Supabase project yet because the repository currently has no confirmed Dhuroje Supabase project linked to it.
