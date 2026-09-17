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

## Marketplace rules and moderation

### Posting standards
- Only registered tailors and fabric sellers may publish garment or fabric listings.
- Buyers may browse, save, like, and message sellers, but they do not create product listings.
- Listed items must be real marketplace content. Demo, placeholder, or duplicate product entries are not allowed.

### Deletion standards
- The creator of a post may delete their own listing at any time.
- Administrators may delete any single post without exception when the content is invalid, misleading, abusive, or against marketplace rules.
- Deleted posts must disappear instantly from the live marketplace feed everywhere.

### Warning and block actions
- Administrators may warn a user with a formal in-app notice when rules are broken.
- Repeated violations may result in a temporary or permanent marketplace restriction.
- A blocked user cannot publish new posts until the block is removed by an administrator.

### Messaging standards
- Messaging is business-focused and respectful.
- A message sent by one user should appear immediately in the recipient's conversation thread.
- Only approved marketplace conversations should be used for real vendor and buyer communication.

### Empty-state behavior
- Tailors see: "No cloth posts yet — publish your first collection"
- Fabric sellers see: "No fabric posts yet — list your first material stock"
- Customers see: "No cloths are available right now"

### Admin responsibility
- Admins are expected to maintain trust, remove harmful content, and keep the marketplace organized and accurate.
- The app is designed so admin delete actions are enforced in both the frontend and the backend to prevent stale or unauthorized content from remaining visible.
