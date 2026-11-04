# TapSync Security Checklist

This document tracks every security requirement for TapSync, how each one is
verified, and the current status. It corresponds to **Requirement 10 (Security
and Privacy)** and related acceptance criteria across the spec.

---

## 1. Ownership Checks

Requirement 10.4: *Owner-only endpoints SHALL verify that the authenticated user
owns the resource being modified.*

- [x] All authenticated endpoints verify resource ownership (links, cards,
      network contacts are filtered by `userId`; cross-user access returns 404
      or 403)
- [x] `JwtAuthGuard` applied to every protected controller (`/user`, `/links`,
      `/cards`, `/network`, `/analytics` owner queries, `/auth/link/*`,
      `/auth/restore`)
- [x] Anonymous (no token) requests to protected endpoints return 401
- [x] Profile endpoints (`/user/me`, `/user/mode`) are self-scoped — no way to
      target another user's profile

**Tests:** `apps/api/test/security-ownership.spec.ts`
**Coverage:** 42 test cases across links, cards, network, profile, and auth
guard enforcement.

---

## 2. Rate Limits

Requirement 1.12: *Throttle repeated auth failures (>10 from one IP in 15 min).*
Requirement 1.13: *Rate limit anonymous account creation per IP and per device.*
Requirement 10.5: *Public endpoints and auth endpoints SHALL be rate limited.*

- [x] Anonymous account creation (`POST /auth/anonymous`) throttled per IP —
      strict throttler (10 req / 60 s)
- [x] Restore endpoint (`POST /auth/restore`) throttled per IP — strict
      throttler (10 req / 60 s)
- [x] Public profile endpoint (`GET /public/profiles/c/:publicId`) throttled —
      60 req / 60 s
- [x] Throttler configured globally via `CommonModule` (`APP_GUARD` →
      `ThrottlerGuard`)
- [x] Two named throttlers: `default` (60/60s) and `strict` (10/60s)

**Tests:** `apps/api/test/security-ratelimits.spec.ts`
**Config:** `apps/api/src/common/common.module.ts`

---

## 3. XSS Escaping

Requirement 10.3: *All inputs SHALL be validated and sanitized server-side;
public text SHALL be escaped on render to prevent XSS.*

- [x] Profile `fullName`, `designation`, `company`, `bio` are rendered as text
      by React (auto-escaping — no `dangerouslySetInnerHTML` used)
- [x] Link URLs are scheme-validated server-side (only `https`, `http`,
      `mailto`, `tel` accepted — Requirement 3.2)
- [x] Link URLs are sanitized client-side in `LinkCard` (`sanitizeUrl` rejects
      `javascript:` and `data:` schemes as defence-in-depth)
- [x] Bio text with HTML tags renders as escaped text, not as HTML elements
- [x] Custom name with special characters does not inject HTML into the page

**Tests:** `apps/web/test/security-xss.test.tsx`
**Coverage:** 10 test cases verifying React auto-escaping, URL sanitization,
and no HTML injection via user-controlled inputs.

---

## 4. Secret Handling

Requirement 10.2: *All traffic SHALL use HTTPS and the API SHALL set secure
headers and a restrictive CORS policy.*

- [x] Secrets loaded from environment variables via `AppConfigService` with
      fail-fast validation (`env.validation.ts`) — never hardcoded
- [x] `.env` files excluded from git via `.gitignore` (`.env`, `.env.*`,
      `!.env.example`)
- [x] `.env.example` files use placeholder values (`change-me-...`, empty for
      client IDs)
- [x] JWT access and refresh secrets are separate environment variables
- [x] Password hashing uses Argon2id (Requirement 10.1)
- [x] Recovery codes stored only as Argon2id hashes (never plaintext)

**Script:** `scripts/secret-scan.mjs`
**Status:** ✓ Runs cleanly (exits 0) — test fixture files skipped to avoid
false positives on intentional fake tokens in spec files.

---

## 5. Dependency Audit

- [x] `pnpm audit` runs in the security audit script
- [x] High and critical vulnerabilities in production dependencies cause the
      script to exit with code 1
- [x] A JSON report is written to `reports/security-audit.json`

**Script:** `scripts/security-audit.mjs`
**Status:** ✓ Script runs without errors (ENOBUFS fixed via `maxBuffer: 50 MB`).
  Currently reports 54 high/critical advisories in transitive dev/tooling
  dependencies (tar, multer, vitest, tinypool, etc.) — none are direct
  production runtime dependencies. Review and upgrade as patches become
  available.
**CI integration:** Add `node scripts/security-audit.mjs` to the GitHub Actions
workflow (Task 26.1) to fail PRs that introduce vulnerable dependencies.

---

## 6. HTTP Security Headers

Requirement 10.2: *All traffic SHALL use HTTPS and the API SHALL set secure
headers and a restrictive CORS policy.*

- [x] `helmet` middleware enabled in `main.ts` (sets `X-Content-Type-Options`,
      `X-Frame-Options`, `Strict-Transport-Security`, `Content-Security-Policy`
      defaults, etc.)
- [x] CORS configured for allowed origins only (`CORS_ORIGIN` env var, no
      wildcard in production)
- [x] CORS allows specific methods and headers (`Content-Type`, `Authorization`)
- [x] Credentials enabled in CORS
- [x] HTTPS enforced in production via hosting platform (Render/DigitalOcean
      terminates TLS; Vercel enforces HTTPS)

**Config:** `apps/api/src/main.ts`, `apps/api/src/config/`

---

## 7. Authentication Security

Requirement 1.11: *Access token expires (15 min); refresh token rotates; reuse
detection revokes the token family.*

- [x] JWT access tokens are short-lived (15 min)
- [x] Refresh tokens are rotated on each use (single-use)
- [x] Refresh token reuse detection revokes the entire token family
- [x] Refresh tokens stored as Argon2id hashes (not plaintext)
- [x] Logout invalidates the refresh token
- [x] Generic auth error messages (no credential leakage)

**Tests:** `apps/api/src/auth/auth.integration.spec.ts` (sections 2–3)

---

## 8. Data Privacy

Requirement 10.7: *The system SHALL only expose on the public page what the
Owner has marked as public.*
Requirement 12.9: *My Network SHALL be private. The system SHALL NOT reveal to
a profile Owner who saved them.*

- [x] Hidden fields (`phone`, `publicEmail`) excluded from public profile DTO
- [x] Only enabled links for the active mode are returned by the public
      endpoint
- [x] My Network contacts are private to the owner — no endpoint reveals who
      saved a profile
- [x] Analytics events are anonymous (no raw IP storage; salted daily hash for
      session de-duplication — Requirement 8.9)
- [x] Analytics owner queries are authenticated and scoped to the requesting
      user

**Tests:** `apps/api/src/network/network.integration.spec.ts` (privacy section),
`apps/api/src/public/` integration specs

---

## 9. Input Validation

Requirement 10.3: *All inputs SHALL be validated and sanitized server-side.*

- [x] Global `ValidationPipe` with `whitelist: true` and
      `forbidNonWhitelisted: true` (strips and rejects unknown fields)
- [x] DTOs use `class-validator` decorators for all endpoints
- [x] URL scheme allow-list enforced on link creation (Requirement 3.2)
- [x] Custom name format validated (3–30 chars, lowercase, no reserved words)
- [x] File upload validation (JPEG/PNG/WebP, max 5 MB — Requirement 2.5)
- [x] vCard 3.0 special character escaping (commas, semicolons, newlines,
      non-ASCII — Requirement 6.5)

**Config:** `apps/api/src/main.ts` (ValidationPipe), DTO files across modules

---

## 10. Revalidation Endpoint Security

- [x] Next.js revalidation webhook (`/api/revalidate`) protected by a shared
      secret header
- [x] Secret compared in constant time to prevent timing attacks
- [x] API sends the secret in the revalidation webhook call

**Config:** `apps/web/src/app/api/revalidate/route.ts`,
`apps/api/src/revalidation/revalidation.service.ts`

---

## Verification Commands

```bash
# API security tests (ownership + rate limits)
cd apps/api && npx jest --config test/jest-e2e.json --testPathPattern="security"

# Web XSS tests
cd apps/web && npx vitest run --testNamePattern="XSS"

# Dependency audit
node scripts/security-audit.mjs

# Secret handling audit
node scripts/secret-scan.mjs
```

---

## Verified Tests Summary

The table below consolidates all security-related test results as of v1.0.0.

| Test Suite | File | Tests | Status |
|------------|------|-------|--------|
| Ownership checks | `apps/api/test/security-ownership.spec.ts` | 42 | ✅ Passing |
| Rate limits | `apps/api/test/security-ratelimits.spec.ts` | ✓ | ✅ Passing |
| Abuse checks (privacy, bulk sync) | `apps/api/test/security-abuse.spec.ts` | 8 | ✅ Passing |
| Data deletion (full removal) | `apps/api/test/data-deletion.spec.ts` | 22 | ✅ Passing |
| XSS escaping (web) | `apps/web/test/security-xss.test.tsx` | 10 | ✅ Passing |
| Secret scan | `scripts/secret-scan.mjs` | — | ✅ Exits 0 |
| Dependency audit | `scripts/security-audit.mjs` | — | ⚠️ 54 advisory (dev/transitive only) |

**Total automated security tests: 82+**

> The dependency audit advisories are all in transitive dev/tooling dependencies
> (tar, multer, vitest, tinypool). No direct production runtime dependencies are
> affected. Monitor for upstream patches.
