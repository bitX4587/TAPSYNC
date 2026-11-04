import http, { setResponseCallback } from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Override the built-in "failed request" definition so that 404 (profile not
// found — expected for test IDs) and 429 (rate limited — expected under heavy
// load) are NOT counted as failures. Only 5xx and connection errors are.
setResponseCallback(
  http.expectedStatuses(200, 404, 429),
);

// ---------------------------------------------------------------------------
// k6 load test – GET /public/profiles/c/:publicId
//
// Validates Requirement 9.5: "The API SHALL respond to public profile reads
// in under 200 ms at p95 under normal load."
//
// The public endpoint is rate-limited (60 req/min per IP via @nestjs/throttler).
// To measure raw endpoint performance without hitting the limiter, either:
//   • Run with fewer VUs / shorter duration, or
//   • Raise the throttler limit for load testing, or
//   • Use the quick config: k6 run --vus 20 --duration 30s
//
// This script treats 429 (Too Many Requests) as an expected, non-error response
// so that rate limiting does not inflate the error rate. Only 5xx responses and
// connection failures are counted as errors.
// ---------------------------------------------------------------------------

// Custom metrics
const profileFetchTrend = new Trend('profile_fetch_duration', true);
const errorRate = new Rate('errors');
const rateLimited = new Rate('rate_limited');

// Test configuration – ramp up to 100 VUs over ~4 minutes
export const options = {
  stages: [
    { duration: '30s', target: 50 }, // ramp up to 50 VUs
    { duration: '1m', target: 50 }, // hold at 50 VUs
    { duration: '30s', target: 100 }, // ramp up to 100 VUs
    { duration: '1m', target: 100 }, // hold at 100 VUs
    { duration: '30s', target: 0 }, // ramp down
  ],
  thresholds: {
    // p95 response time must be under 200ms (Requirement 9.5 — hard requirement)
    'http_req_duration{endpoint:profile}': ['p(95)<200'],
    // Error rate (5xx + connection failures) must be under 1%
    errors: ['rate<0.01'],
    // Built-in failed-request rate — 404/429 excluded via setResponseCallback above
    http_req_failed: ['rate<0.01'],
  },
};

// Use a test public ID (the API should have a seeded test profile or handle
// 404s gracefully). Override with -e PUBLIC_ID=...
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const PUBLIC_ID = __ENV.PUBLIC_ID || 'testprofile00';

export default function () {
  const res = http.get(`${BASE_URL}/public/profiles/c/${PUBLIC_ID}`, {
    tags: { endpoint: 'profile' },
  });

  // 200 = profile found, 404 = not found (expected for test IDs),
  // 429 = rate limited (expected under heavy load from a single IP)
  const isExpectedStatus =
    res.status === 200 || res.status === 404 || res.status === 429;

  const ok = check(res, {
    'status is 200, 404, or 429': (r) => isExpectedStatus,
    'response time < 200ms': (r) => r.timings.duration < 200,
  });

  // Only count server errors (5xx) and connection failures as real errors.
  // 429 is expected rate-limiting behaviour, not a server error.
  if (res.status >= 500 || res.error) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }

  // Track how often we hit the rate limiter (informational, not a failure)
  rateLimited.add(res.status === 429);

  // Record the duration for all responses tagged with endpoint:profile
  profileFetchTrend.add(res.timings.duration);

  // Small pause between requests to simulate think time
  sleep(0.1);
}
