# Implementation Plan

Each task builds on the previous ones and ends with working, tested code. Requirement references point to `requirements.md`.

## Phase 1: Foundation and Backend

- [x] 1. Set up monorepo and project scaffolding
  - Create pnpm workspace with `apps/api` (NestJS), `apps/web` (Next.js), `apps/mobile` (Expo), `packages/shared`
  - Configure TypeScript, ESLint, Prettier, shared tsconfig and Husky pre-commit hooks
  - Add `packages/shared` with `Mode` enum, reserved custom names list, and DTO types
  - _Requirements: 9, 10_

- [x] 2. Configure API core infrastructure
  - [x] 2.1 Add config module with validated environment variables (Mongo URI, JWT secrets, Google client ID, revalidation secret, storage keys)
  - [x] 2.2 Add global `ValidationPipe`, exception filter, `helmet`, CORS and `@nestjs/throttler`
  - [x] 2.3 Connect Mongoose and add `/health` endpoint
  - _Requirements: 10.2, 10.3, 10.5_

- [x] 3. Implement database schemas
  - [x] 3.1 Create `User` schema: immutable unique `publicId`, optional `customName`, optional `fullName`, optional credentials (email, emailVerified, passwordHash, googleId, recoveryCodeHash), indexes (publicId unique; email and googleId unique sparse)
  - [x] 3.2 Create `CustomNameClaim` schema (unique `name`, `userId`, status `current` | `retired`)
  - [x] 3.3 Create `ProfileLink` schema with `{ userId, mode, priorityOrder }` index
  - [x] 3.4 Create `NfcCard` schema with unique `uid`
  - [x] 3.5 Create `AnalyticsEvent` schema with query indexes and TTL
  - [x] 3.6 Create `NetworkContact` schema (unique `{ ownerUserId, publicId }`, `lastTappedAt` index)
  - [x] 3.7 Write schema/unit tests for defaults and constraints
  - _Requirements: 1.1, 2.1, 2.2, 2.8, 2.10, 3.1, 4.1, 7.8, 8.1, 12.2_

- [x] 4. Implement anonymous-first authentication
  - [x] 4.1 `POST /auth/anonymous`: create a credential-less User with a generated `publicId` (nanoid, collision retry) and a blank profile, issue tokens; throttle per IP and per device
  - [x] 4.2 JWT access token strategy and `JwtAuthGuard`
  - [x] 4.3 Rotating refresh tokens (hashed storage, reuse detection, sliding 365-day expiry) with `/auth/refresh` and `/auth/logout`
  - [x] 4.4 Link Google (verify ID token server-side) and link email (Argon2id hash, email verification), rejecting credentials already linked to another account
  - [x] 4.5 Recovery code: generate and regenerate, show once, store an Argon2id hash
  - [x] 4.6 `POST /auth/restore` with Google, email and password, or recovery code; delete the caller's anonymous account if untouched (no links, cards or name); throttle attempts
  - [x] 4.7 Optional hardening hook for Play Integrity / App Attest on `/auth/anonymous`
  - [x] 4.8 Integration tests: first open, silent re-login, link and restore for each method, conflicts, refresh reuse, throttling
  - _Requirements: 1.1–1.13, 2.1–2.3, 10.1_

- [x] 5. Implement profile management
  - [x] 5.1 `GET/PATCH /user/me` with field validation and hidden-field support
  - [x] 5.2 Custom name availability endpoint and reserved-word check
  - [x] 5.3 Claim, change and remove custom name via `CustomNameClaim` (transactional retire-and-insert, retired names stay reserved, 3 changes per 30 days, re-claim own retired names)
  - [x] 5.4 Avatar upload (type/size validation, resize, storage, CDN URL)
  - [x] 5.5 Account deletion (soft delete, then purge job)
  - [x] 5.6 Tests including ownership and validation cases
  - _Requirements: 2.4–2.14, 10.6_

- [x] 6. Implement link management
  - [x] 6.1 Link CRUD endpoints with URL scheme allow-list and per-mode limit
  - [x] 6.2 Atomic reorder endpoint (bulk write)
  - [x] 6.3 Enable/disable and move/copy between modes
  - [x] 6.4 Category and icon registry in `packages/shared`
  - [x] 6.5 Tests for ownership checks, limits and ordering
  - _Requirements: 3.1–3.9, 10.4_

- [x] 7. Implement mode toggle
  - [x] 7.1 `PATCH /user/mode` endpoint and DTO validation
  - [x] 7.2 Unit and integration tests for default and switching
  - _Requirements: 4.1, 4.2_

- [x] 8. Implement revalidation service
  - [x] 8.1 `RevalidationService` calling the Next.js webhook with retry/backoff
  - [x] 8.2 Trigger on profile update, link change, mode toggle, custom name change, avatar change
  - [x] 8.3 Tests with mocked HTTP
  - _Requirements: 2.6, 2.10, 3.3, 4.3, 9.3_

- [x] 9. Implement card management
  - [x] 9.1 `GET /cards/program-payload` returning `https://tapsync.app/c/{publicId}` (never the custom name URL)
  - [x] 9.2 `POST /cards/bind` with UID normalization, conflict on already-bound UID, and per-user card limit
  - [x] 9.3 List and unassign endpoints
  - [x] 9.4 Tests for bind, rebind by same user, conflict, unassign and rebind elsewhere
  - _Requirements: 7.3, 7.5, 7.8–7.11_

- [x] 10. Implement public API and vCard
  - [x] 10.1 `GET /public/profiles/c/:publicId` returning the Public Profile DTO (active mode, enabled links, hidden fields removed)
  - [x] 10.2 `GET /public/profiles/p/:name`: return the profile for the current name, `redirectTo` for retired names, 404 otherwise; 404 for suspended or deleted users
  - [x] 10.3 vCard 3.0 builder with proper escaping and photo support
  - [x] 10.4 `GET /public/profiles/c/:publicId/vcard` with `text/vcard` and download headers
  - [x] 10.5 Tests for filtering, escaping (commas, semicolons, unicode) and empty-contact case
  - _Requirements: 5.1–5.3, 5.11, 6.1–6.5, 10.7_

- [x] 11. Implement analytics
  - [x] 11.1 `POST /public/events` with validation, bot filtering, session de-duplication, no raw IP storage
  - [x] 11.2 Click-count increment on `ProfileLink`
  - [x] 11.3 Summary, per-link and recent-events endpoints with date ranges
  - [x] 11.4 Tests for counting rules and owner-only access
  - _Requirements: 8.1–8.8_

- [x] 12. Implement My Network API
  - [x] 12.1 `POST /network`: idempotent upsert by `publicId` (source, tappedAt), store a snapshot (name, designation, avatar), skip the caller's own profile, bump `tapCount` and `lastTappedAt` on repeat taps
  - [x] 12.2 `POST /network/sync`: bulk upsert of pending offline entries (max 100 per call)
  - [x] 12.3 `GET /network`: list with search and cursor pagination, ordered by `lastTappedAt`, snapshots refreshed from live profiles
  - [x] 12.4 `PATCH /network/:id` (private note) and `DELETE /network/:id`
  - [x] 12.5 Mark entries `unavailable` when a profile is deleted or suspended; never expose who saved a profile to its owner
  - [x] 12.6 Tests: duplicates, own-profile skip, bulk sync, ownership checks, owner cannot see savers
  - _Requirements: 12.1–12.6, 12.8–12.10_

## Phase 2: Public Landing Page (Next.js)

- [x] 13. Build the public profile route
  - [x] 13.1 `/c/[publicId]/page.tsx` canonical server component fetching with cache tag `profile:{publicId}` and 60 s fallback revalidate; a blank profile renders the empty state
  - [x] 13.2 `generateMetadata` for Open Graph and Twitter tags
  - [x] 13.3 `not-found.tsx` and API-down fallback behavior
  - [x] 13.4 `/api/revalidate` route protected by shared secret
  - [x] 13.5 `/p/[name]/page.tsx`: render the same page for the current custom name, 308 redirect to `/c/{publicId}` for retired names, 404 otherwise; set canonical link to `/c/{publicId}`
  - _Requirements: 2.3, 2.9, 5.1–5.3, 5.7, 5.11, 9.3, 9.4_

- [x] 14. Build mobile-first UI
  - [x] 14.1 `ProfileHeader`, `LinkCard`, empty state, footer with privacy link
  - [x] 14.2 Light/dark theme via CSS variables and `prefers-color-scheme`
  - [x] 14.3 Accessibility pass: semantic HTML, focus rings, 44px targets, contrast, alt text
  - [x] 14.4 Optimize: `next/image`, system fonts, minimal client JS
  - [x] 14.5 `SaveToNetworkButton`: opens `tapsync://c/{publicId}` on press (Android intent link with Play Store fallback), with a "Get the app" link beside it. Stores no visitor data
  - _Requirements: 5.4–5.6, 5.9, 5.10, 9.1, 9.2, 11.5_

- [x] 15. Implement Save Contact and tracking
  - [x] 15.1 `SaveContactButton` hitting vCard route with download headers
  - [x] 15.2 View beacon (non-blocking) on page load
  - [x] 15.3 `/r/[linkId]` redirect route (or `sendBeacon`) logging link clicks, `rel="noopener noreferrer"`
  - [x] 15.4 Playwright tests: render per mode, 404, vCard download, mode change appears after revalidation
  - _Requirements: 5.8, 6.1, 8.1–8.3, 8.8_

## Phase 3: Mobile App and NFC

- [x] 16. Set up Expo app
  - [x] 16.1 Initialize Expo with expo-router and a development client (not Expo Go)
  - [x] 16.2 Install and configure `react-native-nfc-manager` with iOS entitlements/Info.plist and Android NFC permission
  - [x] 16.3 API client with token refresh interceptor and `expo-secure-store`
  - _Requirements: 7.12_

- [x] 17. Implement account creation and account security screens
  - [x] 17.1 First-open flow: no session means call `POST /auth/anonymous`, store tokens in `expo-secure-store`, and go straight to the dashboard (no forms). Silent sign-in on later launches
  - [x] 17.2 First-run screen with a small "Restore my account" link (Google, email, recovery code). Restoring discards the untouched new account
  - [x] 17.3 "Secure your account" screen: link Google, link email (with verification), generate recovery code (shown once, "I saved it" confirmation)
  - [x] 17.4 Persistent dismissible warning banner until a Recovery Method is linked. Show the prompt again right after the first card is programmed
  - [x] 17.5 Sign-out guard: for accounts with no Recovery Method, warn about permanent loss before logout
  - [x] 17.6 "Add your name" prompt after first open. Public page shows the placeholder until set
  - [x] 17.7 Auth state, protected routes, silent token refresh
  - _Requirements: 1.1–1.13, 2.1, 2.3_

- [x] 18. Implement dashboard and mode toggle
  - [x] 18.1 Home screen with Casual/Work toggle, optimistic update with rollback on failure
  - [x] 18.2 Profile preview and quick stats
  - [x] 18.3 Profile edit screen with avatar picker and hidden-field switches
  - [x] 18.4 Custom Name screen: availability check, claim/change/remove, preview of `/p/{name}` and `/c/{publicId}`, and a note that cards use the permanent URL and never need reprogramming
  - _Requirements: 2.4–2.14, 4.2–4.7_

- [x] 19. Implement link management UI
  - [x] 19.1 Per-mode link lists with enable/disable switch
  - [x] 19.2 Add/edit form with category/icon picker and URL validation
  - [x] 19.3 Drag-to-reorder with persisted order
  - [x] 19.4 Move/copy link between modes, delete with confirmation
  - _Requirements: 3.1–3.9_

- [x] 20. Implement NFC writing module
  - [x] 20.1 `NfcService`: support/enabled detection, `writeProfileUrl` with timeout, read-back verification, cancel
  - [x] 20.2 `useNfcWriter` hook implementing the state machine (idle, waiting, writing, verifying, success, error)
  - [x] 20.3 Program Card screen: guidance, animated waiting state, success and error/retry UI, link to enable NFC in settings
  - [x] 20.4 Bind card to account after verified write; handle `ALREADY_BOUND`
  - [x] 20.5 Card management screen: list, label, unassign
  - [x] 20.6 Unit tests with mocked NFC manager covering timeout, tag lost, not writable, verify failed
  - [x] 20.7 "How tapping works" help screen: page needs internet, OS decides prompt vs redirect, iPhone/Android NFC notes
  - _Requirements: 7.1–7.12, 11.1–11.4_

- [x] 21. Implement analytics screen
  - [x] 21.1 Range selector, totals, per-link click list, recent taps
  - [x] 21.2 Empty and loading states
  - _Requirements: 8.4, 8.5_

- [x] 22. Implement link handling for My Network (custom scheme)
  - [x] 22.1 Set `scheme: "tapsync"` in `app.config`
  - [x] 22.2 Expo Router handlers `app/c/[publicId].tsx` and `app/p/[name].tsx`: validate the Public ID format, run the My Network save flow (`source: 'link'`), then replace the route with `(tabs)/network` and highlight the new contact
  - [x] 22.3 Own-card detection (skip saving, show "This is your own card") and 404 handling
  - [x] 22.4 Real-device checks of the page button: iPhone and Android, with and without the app installed, including the Android intent fallback to the Play Store
  - _Requirements: 12.1, 12.4, 13.1–13.3_

- [x] 23. Build My Network screens
  - [x] 23.1 Local store (`expo-sqlite`) for pending entries and an offline cache of saved contacts
  - [x] 23.2 `useNetwork` hooks (React Query) for list, search and upsert. Sync pending entries on app foreground and connectivity change
  - [x] 23.3 My Network tab: list with avatar, name, designation and last tapped, search, pending and unavailable states, highlight for a new contact
  - [x] 23.4 Contact detail: live profile, links for the active mode, Save to phone contacts (vCard), open in browser, private note, delete
  - [x] 23.5 Manual capture: Scan card (in-app NFC read), Scan QR (camera), Paste link
  - [x] 23.6 Unit tests for the pending queue, duplicate handling and own-card skip
  - _Requirements: 12.1–12.11_

## Phase 4: Integration, Testing and Deployment

- [x] 24. End-to-end and device testing
  - [x] 24.1 Write and read back NTAG215 cards on at least one Android and one iPhone (iOS 13+)
  - [x] 24.2 Tap a programmed card with Android and iOS visitors and confirm the page opens
  - [x] 24.3 Toggle mode in the app and verify the public page updates within 2 s without touching the card
  - [x] 24.4 Import vCard on iOS and Android Contacts
  - [x] 24.5 Failure paths: tag removed mid-write, read-only tag, NFC disabled, offline toggle
  - [x] 24.6 Custom name: claim a name, change it, then confirm the old name redirects and a card programmed before the change still opens the page
  - [x] 24.7 Brand-new account: confirm the card opens a blank page with the placeholder name and empty state, then fills in as links and a name are added
  - [x] 24.8 First open on a clean install creates the account with no forms. Link Google and email, generate a recovery code, then restore on a second phone with each method
  - [x] 24.9 Tap a card, press Save to My Network, and confirm the app opens on My Network with the contact saved. A repeat does not duplicate. Try with the app installed and not installed
  - [x] 24.10 Use Scan card in airplane mode: contact saved as pending, then syncs when back online
  - [x] 24.11 Tap your own card: nothing is saved and the own-card message shows
  - _Requirements: 1.1–1.8, 2.3, 2.9–2.12, 4.3, 6.3, 7.4–7.7, 9.3, 12.1–12.5, 13.1–13.3_

- [x] 25. Performance, security and accessibility verification
  - [x] 25.1 Lighthouse CI on public page (LCP < 2 s, small JS bundle)
  - [x] 25.2 k6 load test on public profile endpoint (p95 < 200 ms)
  - [x] 25.3 Security checklist: ownership checks, rate limits, XSS escaping, secret handling, dependency audit
  - [x] 25.4 axe scan plus VoiceOver/TalkBack manual pass
  - [x] 25.5 Abuse checks: anonymous account creation rate limits, recovery-code and restore throttling, My Network privacy (owner cannot see savers)
  - _Requirements: 1.12, 1.13, 9.1–9.5, 10.1–10.8, 5.9, 12.9_

- [x] 26. Deployment
  - [x] 26.1 GitHub Actions CI: lint, typecheck, test on PR
  - [x] 26.2 Deploy API to Render/DigitalOcean/AWS with MongoDB Atlas; configure env and secrets for staging and prod
  - [x] 26.3 Deploy Next.js to Vercel; configure `tapsync.app` and `api.tapsync.app`
  - [x] 26.4 Wire revalidation webhook secret between API and web
  - [x] 26.5 Add Sentry, structured logging and uptime check
  - [x] 26.6 Build `.apk` / `.aab` and `.ipa` via EAS and distribute to testers
  - _Requirements: 9, 10.2_

- [x] 27. Launch readiness
  - [x] 27.1 Privacy policy and terms pages linked from the public page and app
  - [x] 27.2 Data deletion flow verified end to end
  - [x] 27.3 Final regression pass and release notes
  - _Requirements: 10.6, 10.8_
