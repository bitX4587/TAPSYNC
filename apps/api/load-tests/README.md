# Load Tests

k6 load tests for the TapSync API public profile endpoint.

## Prerequisites

- [k6](https://k6.io) installed (`brew install k6`, `choco install k6`, or see the [install guide](https://grafana.com/docs/k6/latest/get-started/install/))
- API running locally or remotely
- MongoDB connected (the API requires `MONGODB_URI`)

## Running

```bash
# Full load test (ramp up to 100 VUs, ~4 minutes)
k6 run public-profile.k6.js

# Quick test (50 VUs for 1 minute)
k6 run --vus 50 --duration 1m public-profile.k6.js

# Against a remote API
k6 run -e BASE_URL=https://api.tapsync.app public-profile.k6.js

# With a specific public ID (a seeded profile)
k6 run -e PUBLIC_ID=abcdefghjk public-profile.k6.js

# Combine options
k6 run -e BASE_URL=https://api.tapsync.app -e PUBLIC_ID=abcdefghjk public-profile.k6.js
```

## What it tests

`GET /public/profiles/c/:publicId` — the unauthenticated public profile read
used by the Next.js landing page when a visitor taps an NFC card.

The test ramps from 0 to 50 VUs, holds, ramps to 100 VUs, holds, and ramps
back down over ~4 minutes.

## Thresholds

| Metric | Threshold | Requirement |
|--------|-----------|-------------|
| p95 response time | < 200 ms | 9.5 |
| Error rate (5xx + failures) | < 1% | — |

## Rate limiting

The public endpoint is rate-limited to 60 requests per minute per IP via
`@nestjs/throttler`. Under heavy load from a single IP the API returns
`429 Too Many Requests`.

The k6 script treats 429 as an expected, non-error response so it does not
inflate the error rate. Only 5xx responses and connection failures count as
errors.

If you want to measure raw endpoint performance without rate limiting, either:

1. Run with fewer VUs (`k6 run --vus 20 --duration 30s`)
2. Temporarily raise the throttler limit in `public.module.ts` / `common.module.ts`
3. Run k6 from multiple IPs (distributed execution)
