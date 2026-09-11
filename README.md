# Atelier Tailor & Fabric Marketplace

A production-minded marketplace app for tailors, fabric sellers, and buyers, built with React, Vite, Firebase Auth, Firestore, and Firebase Storage.

## What this project already includes
- Secure Firebase Authentication flows for login, registration, Google sign-in, and password reset
- Firebase Admin backend with authenticated API routes for profiles, posts, messages, likes, saves, ratings, and admin actions
- Firestore and Storage rules for a safer real-world deployment baseline
- Client-side image compression before upload to Firebase Storage
- Shared data loading from the backend instead of relying only on browser local storage

## Local setup

1. Install dependencies:
   `npm install`
2. Copy [.env.example](.env.example) to `.env.local` and fill in your Firebase values.
3. Put your Firebase Admin SDK JSON file in `server/firebase-service-account.json`, or set `FIREBASE_SERVICE_ACCOUNT_JSON` in your environment.
4. Start the backend:
   `npm run server`
5. Start the frontend:
   `npm run dev`
6. Run type checks:
   `npm run lint`
   `npm run server:check`

## Production deployment notes

### Firebase Storage capacity
This app uploads image files to Firebase Storage and stores only the generated download URLs in Firestore. That is the correct pattern for a real app because it keeps documents small and avoids storing large image blobs inside database records.

For a startup, Firebase Storage is a good option, but it is not unlimited free storage. Firebase generally gives a free storage allowance and then charges for additional usage. In practice, a few thousand images can fit comfortably within the free tier only if you keep each file small, but once you grow beyond the free allotment you should expect a paid plan.

If you need very high-volume media hosting from day one, a dedicated media platform like Cloudinary or a separate CDN/media bucket can be a better fit. The app architecture is already ready for that, because it stores URLs and never depends on raw binary data in Firestore.

### Security checklist
- Keep `server/firebase-service-account.json` private and never commit it.
- Add your real Firebase web config to `.env.local`.
- Deploy the rules with Firebase once your project is ready:
  `firebase deploy --only firestore:rules,storage`
- Keep the backend behind a real deployment host instead of exposing the local Node API publicly.

### Recommended first launch setup
- Use Firebase Storage for image hosting
- Keep Firestore for structured app records
- Keep local browser storage only for lightweight UI preferences like theme mode
- Use the backend API as the source of truth for marketplace data

## Useful scripts
- `npm run dev` — start the frontend
- `npm run build` — production build
- `npm run server` — start the Express + Firebase backend
- `npm run lint` — run the frontend TypeScript check
- `npm run server:check` — run the backend TypeScript check
