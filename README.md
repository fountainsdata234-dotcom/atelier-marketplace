# FABSATTIRE

FABSATTIRE is a fashion and textile marketplace built to help shoppers discover real tailors, fabric sellers, and makers in their area. The app is designed around a practical problem: people often struggle to find reliable local artisans, compare services, and buy custom clothing or fabric without dealing with fragmented WhatsApp-only chains.

This project combines a premium storefront experience with a functional directory, location-aware discovery, and direct seller communication. Whether someone is searching for a tailor for a wedding outfit, a fabric merchant for a new collection, or a maker with a strong local presence, the platform is meant to make that discovery easier and more trustworthy.

## What the app does

- Lets buyers browse verified tailors and fabric sellers
- Shows seller locations on an interactive globe and directory view
- Supports search by name, handle, city, state, and country
- Displays seller profiles, portfolios, and live posts
- Allows direct messaging and buyer-to-seller contact
- Gives admins moderation tools for marketplace quality control
- Works as a modern, mobile-friendly fashion marketplace experience

## Real project stack

This project is built with:

- React + Vite for the frontend experience
- TypeScript for safer production code
- Supabase Auth, Postgres, and Storage for user and marketplace data
- Express backend routes for admin and API operations
- Three.js / React Three Fiber for the interactive globe view

## Why this exists

This is not a fake startup pitch. It is a real practical marketplace for the kind of everyday fashion work that happens around tailoring houses, fabric stalls, and custom clothing studios. The goal is simple: bring buyers and sellers into one visible, searchable network where trust, locality, and direct access matter.

It is especially useful for communities where shoppers want to:

- find nearby tailors and dressmakers
- compare fabric sellers by location and product range
- find verified artisans instead of random social media listings
- communicate directly with sellers before ordering

## Local setup

1. Install dependencies:
   `npm install`
2. Copy [.env.example](.env.example) to `.env.local` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.
3. Run `supabase/schema.sql` and then `supabase/storage.sql` in the Supabase SQL editor. Keep the service-role key server-only.
   For an existing Supabase project, also run `supabase/migrations/20261013_admin_role_policy.sql` to prevent users from granting themselves administrator privileges through profile updates.
4. Start the backend:
   `npm run server`
5. Start the frontend in another terminal:
   `npm run dev`
6. Run checks:
   `npm run lint`
   `npm run server:check`

For the Render API deployment, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the service environment. The Vercel frontend uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; its `/api` rewrite forwards API requests to Render.

To import legacy Firebase records once, place the Firebase Admin service-account JSON at the ignored path `server/firebase-service-account.json`, confirm the Supabase SQL files have been applied, and run `npm run migrate:firebase-to-supabase`. The migration is additive and safe to rerun. Firebase passwords cannot be exported as plain text, so migrated users must reset their password before signing in. Firebase is not required for normal app startup or Supabase-backed marketplace operations.

## Scripts

- `npm run dev` — start the frontend
- `npm run build` — create a production build
- `npm run server` — run the backend API server
- `npm run migrate:firebase-to-supabase` — import legacy Firebase data once
- `npm run lint` — type-check the app
- `npm run server:check` — type-check the server code

## Security and deployment notes

- Keep Supabase service-role keys server-only and never commit them.
- Firebase credentials are needed only for the one-time legacy data migration.
- Deploy with proper hosting and backend settings before exposing the app publicly.
- Apply and review the Supabase RLS and Storage policies before exposing the app publicly.

## Marketplace model

The app is designed for a real-world marketplace workflow:

- buyers discover sellers
- sellers publish their work and stock
- admins oversee content quality and trust
- messaging supports direct business conversations
- profiles and posts build a clear digital presence for artisans

This is a useful foundation for a local or regional fashion commerce platform, especially in markets where artisans are highly distributed and buyers want a respectful, searchable way to find them.
