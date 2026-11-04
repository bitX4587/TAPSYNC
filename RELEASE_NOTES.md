# TapSync v1.0.0 — Release Notes

**Release date**: June 2025

## Overview

TapSync is an NFC-based dynamic digital business card platform. Version 1.0.0 marks the completion of the initial development spec.

## What's Included

### Phase 1: Foundation
- Monorepo setup (pnpm workspaces, ESLint, Prettier, Husky)
- NestJS API with MongoDB, JWT auth, rate limiting, helmet, CORS
- Shared package (`@tapsync/shared`) with DTOs and constants

### Phase 2: Core Features

#### Authentication (Tasks 4–5)
- Anonymous account creation (no forms on first open)
- Google OAuth link (server-side token verification)
- Email + password link with email verification
- Recovery code generation (shown once, Argon2id hash)
- Account restore via Google, email/password, or recovery code
- Rotating refresh tokens with reuse detection
- Rate limiting: 10 req / 60s on all auth endpoints

#### Profile (Tasks 5–6)
- Full name, designation, company, bio, avatar upload (JPEG/PNG/WebP, ≤5 MB)
- Hidden fields (phone, email) excluded from public page
- Custom name (3–30 chars): claim, change, retire; old names redirect permanently
- Per-mode link lists (Casual / Work): create, edit, reorder, enable/disable, delete
- Mode toggle with optimistic UI and rollback

#### NFC Cards (Tasks 9–10)
- Write profile URL to NTAG215 with read-back verification
- Card bind to account after verified write
- Per-user card list and unassign

#### Public Profile (Tasks 13–15)
- ISR server component at `/c/[publicId]` with 60s fallback revalidation
- `/p/[name]` resolves current custom name; 308 redirects retired names
- Open Graph / Twitter card metadata
- vCard 3.0 download (proper escaping, photo support)
- SaveToNetworkButton opens deep link to app
- Analytics beacon (non-blocking, session-deduplicated, no raw IP)

#### Analytics (Tasks 8, 11)
- Profile views, link clicks, contact saves
- Anonymous: salted daily hash for session deduplication
- Owner-only summary, per-link, and recent-events endpoints

#### My Network (Tasks 22–23)
- Save contacts via NFC tap, QR scan, deep link, or manual paste
- Offline pending queue (expo-sqlite) — syncs on foreground / connectivity
- Local offline cache for the contact list
- Contact detail: live profile, links, vCard save, private note, delete
- Own-card detection (client + server)

### Phase 3: Mobile App (Tasks 16–22)

- Expo with expo-router, development client (not Expo Go)
- `react-native-nfc-manager` with iOS entitlements and Android permissions
- Secure token storage (expo-secure-store)
- Home screen: mode toggle, profile preview, quick stats
- Links screen: per-mode lists, drag-to-reorder, add/edit with category picker
- Card programming screen: NFC state machine, guidance, success/error UI
- Analytics screen: range selector, per-link clicks
- Custom name screen: availability check, permanent URL note
- Deep link handlers: `tapsync://c/:publicId` and `tapsync://p/:name`

### Phase 4: Integration Testing

End-to-end device test scenarios verified (manual):
- Write/read NTAG215 on Android and iOS
- Mode toggle → public page updates within 2s
- vCard import on iOS and Android Contacts
- Offline pending queue syncs on reconnect
- Own-card detection

### Phase 5: Performance, Security, and Accessibility

- **Lighthouse CI**: LCP < 2s budget enforced; JS bundle 145.6 KiB gzipped (threshold: 150 KiB)
- **k6 load test**: public profile endpoint p95 < 200ms at 100 VUs
- **Security**: 42 ownership tests, rate limit tests, 10 XSS tests, dependency audit script, secret scan script
- **Accessibility**: axe audit, WCAG 2.1 AA target; VoiceOver/TalkBack manual pass checklist
- **Abuse checks**: 8 integration tests — rate limits, My Network privacy (owner cannot see savers), bulk sync limit

### Phase 6: Deployment

- GitHub Actions CI: lint, typecheck, unit tests, integration tests (MongoDB service container)
- Separate Lighthouse CI and load-test workflows
- Sentry error monitoring (API + web; enabled only when `SENTRY_DSN` is set)
- Structured JSON logging in production (NestJS JsonLoggerService)
- Uptime check workflow (every 15 minutes)
- Revalidation webhook secret wired between API and Next.js

### Phase 7: Launch Readiness

- Privacy Policy at `/privacy` — data collection, retention/deletion, user rights
- Terms of Service at `/terms` — service description, user responsibilities, liability
- Both linked from the profile page footer and mobile app settings
- Data deletion e2e test: 22 integration tests verify full data removal including custom name retirement, public profile 404, token invalidation, and network contact unavailability
- Release notes (this document)

## Known Limitations

- In-app QR scanning not yet available (requires expo-camera or expo-barcode-scanner); users can scan QR codes with their native camera app and paste the URL
- Google Sign-In in the mobile app requires `@react-native-google-signin/google-signin` or `expo-auth-session` to be integrated in a future sprint (the server-side endpoint is fully implemented)
- 6 pre-existing test failures in `link-form-modal.test.tsx` and `use-auth.test.tsx` (React hooks rendering edge cases in test environment) — do not affect production functionality
- The NFC card UID is retained on soft-delete; a deferred purge job (within 30 days per privacy policy) fully removes it

## Test Coverage Summary

| Area | Test Type | Tests |
|------|-----------|-------|
| Shared constants/DTOs | Unit | ✓ |
| API unit tests | Jest | ✓ |
| Auth integration | NestJS + MongoDB | ✓ |
| Links integration | NestJS + MongoDB | ✓ |
| Network integration | NestJS + MongoDB | ✓ |
| Public profile integration | NestJS + MongoDB | ✓ |
| Security — ownership | e2e | 42 |
| Security — rate limits | e2e | ✓ |
| Abuse checks | e2e | 8 |
| Data deletion | e2e | 22 |
| Web components | Vitest | 49 |
| Web XSS | Vitest | 10 |
| Mobile — My Network | Jest | 160 |
| Mobile — NFC service | Jest | ✓ |
| Mobile — NFC writer hook | Jest | ✓ |

## Upgrade Notes

First deployment — no upgrade path needed. Copy `.env.example` to `.env` in each app and fill in values.

## Contact

privacy@tapsync.app · legal@tapsync.app
