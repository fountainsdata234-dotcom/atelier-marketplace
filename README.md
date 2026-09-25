# Fabrilux Atelier

Fabrilux Atelier is a fashion and textile marketplace built to help shoppers discover real tailors, fabric sellers, and makers in their area. The app is designed around a practical problem: people often struggle to find reliable local artisans, compare services, and buy custom clothing or fabric without dealing with fragmented WhatsApp-only chains.

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
- Firebase Auth and Firestore for user and marketplace data
- Firebase Storage for media handling
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
2. Copy [.env.example](.env.example) to `.env.local` and add your Firebase settings.
3. If needed, place your Firebase Admin service account JSON in `server/firebase-service-account.json`.
4. Start the backend:
   `npm run server`
5. Start the frontend:
   `npm run dev`
6. Run checks:
   `npm run lint`
   `npm run server:check`

For the Render API deployment, add `FIREBASE_SERVICE_ACCOUNT_JSON` as a secret environment variable containing the complete Firebase Admin service-account JSON. The local `server/firebase-service-account.json` file is intentionally ignored and is not included in deployments. Without this variable, `/api/users` and `/api/posts` return `503` because the API cannot connect to Firestore.

## Scripts

- `npm run dev` — start the frontend
- `npm run build` — create a production build
- `npm run server` — run the backend API server
- `npm run lint` — type-check the app
- `npm run server:check` — type-check the server code

## Security and deployment notes

- Keep Firebase service account files private and never commit them.
- Use real Firebase web config values in your environment.
- Deploy with proper hosting and backend settings before exposing the app publicly.
- Treat storage and Firestore with the right privacy and moderation rules for production usage.

## Marketplace model

The app is designed for a real-world marketplace workflow:

- buyers discover sellers
- sellers publish their work and stock
- admins oversee content quality and trust
- messaging supports direct business conversations
- profiles and posts build a clear digital presence for artisans

This is a useful foundation for a local or regional fashion commerce platform, especially in markets where artisans are highly distributed and buyers want a respectful, searchable way to find them.
