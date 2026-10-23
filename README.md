# FABSATTIRE

## Android app (Trusted Web Activity)

The Android wrapper is a Trusted Web Activity (TWA). It opens the live Fabsattire site in an Android app window, keeps the existing website and sign-in flow, and uses the Fabsattire launcher name and icon. The Android application ID is `com.fabsattire.app`; keep it stable once published.

To generate and build the Android Studio project:

1. Install Android Studio and its Android SDK (API 36), plus a supported JDK.
2. Run `npm install`, then `npm run android:twa:update` to generate the Android Studio project in `android/` from `twa-manifest.json`.
3. Create an upload keystore named `fabsattire-upload-key.keystore` in the project root with the alias `fabsattire`, and securely back it up. Never commit the keystore or its passwords.
4. Get the keystore certificate's SHA-256 fingerprint, then run `npm run android:twa:fingerprint:add -- <SHA-256>`. This records the fingerprint and generates `public/.well-known/assetlinks.json`. Deploy that file to `https://fabsattire.vercel.app/.well-known/assetlinks.json`; it is required for the app to open in verified, full-screen mode. If the fingerprint changes, regenerate the file with `npm run android:twa:assetlinks`.
5. Run `npm run android:twa:build` to build the signed APK and Play Store AAB.

The source tree does not include an Android signing key. A signed installable APK/AAB and verified full-screen launch require the local Android SDK, the privately managed signing key, and the deployed Digital Asset Links file.

FABSATTIRE is a fashion and textile marketplace built to help shoppers discover real tailors, fabric sellers, and makers in their area. The app is designed around a practical problem: people often struggle to find reliable local artisans, compare services, and buy custom clothing or fabric without dealing with fragmented WhatsApp-only chains.

This project combines a premium storefront experience with a functional directory, location-aware discovery, and direct seller communication. Whether someone is searching for a tailor for a wedding outfit, a fabric merchant for a new collection, or a maker with a strong local presence, the platform is meant to make that discovery easier and more trustworthy.

## What the app does

- Lets buyers browse tailor and fabric-seller profiles with their public portfolios
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
- find artisans with clear portfolio and firsthand-feedback evidence
- communicate directly with sellers before ordering

## Local setup

1. Install dependencies:
   `npm install`
2. Copy [.env.example](.env.example) to `.env.local` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.
3. Run `supabase/schema.sql` and then `supabase/storage.sql` in the Supabase SQL editor. Keep the service-role key server-only.
   For an existing Supabase project, also run `supabase/migrations/20261013_admin_role_policy.sql` to prevent users from granting themselves administrator privileges through profile updates.
   Run `supabase/migrations/20261014_seller_data_cleanup.sql` as well to persist seller collections and cascade-delete seller data.
   After the base schema, apply any migrations not already present in this order: `supabase/migrations/20261014_production_listings.sql`, `supabase/migrations/20261015_marketplace_feed.sql`, `supabase/migrations/20261015135000_explainable_trending.sql`, `supabase/migrations/20261017120000_trustworthy_reviews.sql`, `supabase/migrations/20261017130000_remove_commerce_claim_signals.sql`, `supabase/migrations/20261017140000_marketplace_search.sql`, `supabase/migrations/20261017150000_marketplace_intelligence_models.sql`, `supabase/migrations/20261017160000_layered_abuse_prevention.sql`, `supabase/migrations/20261017170000_customer_journey_connections.sql`, then `supabase/migrations/20261017180000_atomic_reaction_toggle.sql`. The later migrations depend on the listing lifecycle migration. Run each complete migration as one script in the Supabase SQL Editor; they are transactional. The search document is maintained by database triggers rather than a generated column to support PostgreSQL immutability restrictions. This project uses Supabase SQL migrations as its database source of truth; it does not currently use Prisma or generate a Prisma client.
4. Start the backend:
   `npm run server`
5. Start the frontend in another terminal:
   `npm run dev`
6. Run checks:
   `npm run lint`
   `npm run server:check`

For the Render API deployment, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the service environment. The Vercel frontend uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; its `/api` rewrite forwards API requests to Render.

New accounts are directed to the sign-in form after creation. To allow immediate sign-in without an email confirmation step, turn off **Confirm email** in the Supabase project's Authentication email-provider settings. This is a Supabase project setting and cannot be changed safely by the public client application.

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
- New listings and edits are private drafts or enter the admin review queue; only approved, published listings are searchable and publicly displayed.
- Firebase credentials are needed only for the one-time legacy data migration.
- Deploy with proper hosting and backend settings before exposing the app publicly.
- Apply and review the Supabase RLS and Storage policies before exposing the app publicly.
- Marketplace trend events are server-recorded, session identifiers are hashed, and raw events expire after the configured retention window. Carts, checkout, and purchase tracking are not part of the current product; the cleanup migration removes legacy unsupported cart/purchase event claims.
- The intelligence-model migration adds normalized seller/listing/media data, versioned aggregates, private preference and exposure records, moderation/audit models, and order/order-item tables. Order tables are schema-only: there is no checkout, payment processing, or order API. Do not treat an order status or a generated model as proof of an actual customer purchase until a trusted order workflow exists.
- The abuse-prevention migration adds atomic account/session action limits, pseudonymous risk signals, admin investigation and resolution tools, seller block controls, listing eligibility checks, and durable event qualification. It does not collect IP addresses or use shared-network/IP matching to label people as fraudulent. Risk patterns are review leads and never automatically ban accounts. Failed/duplicate attempts consume rate-limit buckets but are not engagement events; only server-validated, deduplicated interactions are qualified. Views and impressions are counted once per actor/session/listing within the configured 30-minute/24-hour windows; like/save events remain in the event history for 24 hours even if the current reaction is removed. Enquiries and shares are deduplicated for 30 minutes. There is no checkout, purchase, cancellation, refund, or dispute workflow, so none is inferred or included in current marketplace metrics.
- Listing/review writes, reactions, reports, uploads, and block-list changes are server-authorized and rate-limited using account identity and a hashed browser session where available. The API uses bearer authorization headers rather than cookie authentication, so browser CSRF is not used as an authentication mechanism; production CORS only allows explicitly configured origins. Uploaded listing images are decoded, validated, re-encoded, and size-limited by the server. Review and report moderation outcomes and block changes are audited; report/review appeals remain available through the existing trust workflow. The admin “Abuse signals” queue requires human investigation and a reasoned resolution.
- The customer-journey migration connects `GET/PUT/DELETE /api/me/recommendation-preferences`, `PUT /api/me/recommendation-feedback/:listingId`, and recommendation impression recording to the private preference, interaction, and impression tables. Preferences are account-synced only after sign-in; anonymous settings and behavior remain on the device. Signed-in “not interested” feedback is stored server-side and hidden listings are excluded from that viewer’s feed and trending results. Reset removes the account preference and feedback rows; the raw qualified event ledger follows its separate configured retention policy. The client ranks a bounded server page using the selected preferences, local recent activity, and server trend aggregates; this is not a server-side per-user ranking RPC, and server-derived personalized scoring remains future work.
- For You ranking combines normalized personal relevance (25%), qualified trend strength (25%), Bayesian confidence-adjusted listing feedback (20%), freshness (15%), and Bayesian confidence-adjusted seller feedback (15%). Listings/sellers without reviews use the 3.5/5 neutral prior for rank fairness, but cards show only the raw average and actual eligible review count, or “No reviews yet”. Seller feedback is not a completed-job metric, identity verification, or skill certification. Sponsored labels remain separate from organic trend scores.
- The Express service refreshes marketplace trend snapshots at startup and every 10 minutes; homepage/trending requests read the persisted snapshot instead of rescanning the event ledger. Schedule `refresh_marketplace_listing_aggregates(window_start, window_end, formula_version)`, `refresh_marketplace_seller_metrics(window_start, window_end, formula_version)`, and `purge_marketplace_intelligence_data()` using a trusted server-side scheduler with the service-role credential. The migration deliberately does not enable `pg_cron` or create database jobs automatically. Trend/search/recommendation records have separate retention windows.
- Anonymous public GETs for feeds, trends, reviews, sellers, and promotion plans are deduplicated in-flight and cached briefly in the browser; authenticated responses are not shared or cached. Feed pages default to 16 listings. Reaction changes use a server-only atomic RPC and maintained counters instead of separate reaction and exact-count requests. Seller listing image uploads are limited to 8 MB per source image, transformed to a 1400-pixel JPEG and a 480-pixel thumbnail, and stored at content-addressed paths for long-lived browser caching. Apply the atomic reaction migration before deploying code that calls the new RPC.
- Seller evidence is kept distinct: firsthand review summaries are feedback, portfolio tags are seller-listed specializations, and featured placement is not a verification badge. The app does not currently track job completion, response-time ranges, identity verification, or skill certification; none are presented as established facts.
- Listing and seller reviews are separate, firsthand-feedback records. They are explicitly **not purchase verified** because platform checkout is not implemented. New reviews require firsthand attestation and admin approval; authors can edit for 14 days and appeal rejected/removed feedback. Rating summaries show only published reviews, use raw average/count transparently, and store a versioned Bayesian confidence score separately. Existing star-only `ratings` rows are retained privately but are not copied into reviews or counted in the new summaries, because those rows cannot establish firsthand attestation. Burst and repeated-text patterns create low/medium risk flags for review and do not automatically hide reviews or block reviewers.
- Review submissions are capped at five per reviewer per 24 hours, reports at five per reporter per 24 hours, and each target has one review per reviewer. Review/report/appeal actions are server-authorized and recorded in the audit log. Review text is currently text-only (no evidence images are accepted).
- For You personalization is opt-in and off by default. Preferences and bounded interaction history stay on the user's device (anonymous history uses session storage), expire after 180 days, and can be disabled or reset from the feed. Qualified views are weak signals; likes, saves, shares, and enquiries have stronger decayed weights, while explicit “Not interested” feedback suppresses that listing temporarily. Feed ranking runs on the server-paginated candidate pages, uses recent trend snapshots where available, applies seller/category diversity and limited recent-listing exploration, and keeps sponsored listings distinct. Rating-confidence and seller-reliability scores are not added until eligible review aggregates and verified performance data are available; the ranker does not infer them from legacy stars, paid promotion, or follower counts.
- Search uses indexed PostgreSQL full-text documents containing listing title, description, category, structured listing details, tags, seller name/business name, and seller location. In Relevance sort, the server applies typed eligibility and attribute filters before ranking with weighted text relevance, exact title/category matches, typo similarity, and a modest requested-area boost, then returns keyset-paginated results. Search aliases are maintained in `src/utils/marketplaceSearch.ts`; recent searches are stored only in the current browser session. A place in the query boosts matching seller locations but does not exclude other areas; selecting a location filter restricts results. Delivery service and rating-confidence filtering are not claimed where the underlying data is unavailable.
- Search audit events capture query impressions (including zero-result pages), listing clicks, saves, and enquiries. Raw query text is available only to the server-side audit table and is pruned after 30 days when new search events are written; anonymous sessions are represented by a server-side hash. Completed-order conversions are not recorded because checkout and orders are not implemented.

- Seller discovery separates tailor and fabric-seller views and searches public profile fields, eligible listing descriptions/tags, listing specializations, materials, locations, and declared availability. Results prioritize requested service and location before a small confidence-adjusted firsthand-review and distance contribution; newer sellers receive a small exploration contribution. Seller review averages/counts are fetched in batches from eligible published reviews and shown as raw feedback transparently. Portfolio quantity is shown only as visible listing/image evidence, not certification. Response times, identity checks, skill credentials, delivery areas, and completed-job history are not recorded and are not represented as facts.

## Marketplace model

The app is designed for a real-world marketplace workflow:

- buyers discover sellers
- sellers publish their work and stock
- admins oversee content quality and trust
- messaging supports direct business conversations
- profiles and posts build a clear digital presence for artisans
- the marketplace feed offers separate discovery views with server-side filters, stable cursor pagination, and clearly labeled sponsored listings
- Trending categories use recent, exposure-adjusted activity and persisted explainable score components; the API refreshes snapshots at most every 10 minutes. Weights and half-life are stored in `marketplace_trend_config`.

This is a useful foundation for a local or regional fashion commerce platform, especially in markets where artisans are highly distributed and buyers want a respectful, searchable way to find them.
