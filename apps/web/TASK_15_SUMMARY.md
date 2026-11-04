# Task 15: Save Contact and Tracking - Implementation Summary

## Overview
Successfully implemented all subtasks for Task 15 "Implement Save Contact and tracking" as specified in the TapSync spec Phase 2.

## Implemented Components

### 15.1 SaveContactButton Component
- **File**: `src/components/SaveContactButton.tsx`
- **Features**:
  - Downloads vCard via Next.js route (`/c/[publicId]/vcard`)
  - Tracks `contact_save` events using sendBeacon API
  - Non-blocking analytics that doesn't impact download
  - Includes mode and referrer in tracking payload
  - Graceful error handling (silent failures)
- **Tests**: `src/components/SaveContactButton.test.tsx` (6 test cases)

### 15.2 ViewBeacon Component
- **File**: `src/components/ViewBeacon.tsx`
- **Features**:
  - Non-blocking view tracking on page load
  - Uses `navigator.sendBeacon()` for fire-and-forget tracking
  - Falls back to `fetch` with `keepalive` if sendBeacon unavailable
  - Extracts referrer origin (no full URL stored)
  - Fires on component mount, respects dependency changes
  - Silent error handling (Requirements 8.8)
- **Tests**: `src/components/ViewBeacon.test.tsx` (10 test cases)

### 15.3 Link Click Tracking
- **File**: `src/components/LinkCard.tsx` (updated)
- **Features**:
  - Tracks link clicks using sendBeacon API
  - Includes publicId, mode, linkId, and referrer
  - Non-blocking tracking (Requirements 8.2, 8.8)
  - Maintains `rel="noopener noreferrer"` for security
  - Opens links in new tab as before
  - Silent error handling

### vCard Route Handler
- **File**: `src/app/c/[publicId]/vcard/route.ts`
- **Features**:
  - Proxies vCard from backend API
  - Sets proper `Content-Type: text/vcard` header
  - Sets `Content-Disposition` for download
  - Handles 404 and error cases
  - Includes cache control headers (60s)

## Analytics Implementation

All components send events to `POST /analytics/events` with the following payload structure:

```typescript
{
  type: 'view' | 'link_click' | 'contact_save',
  publicId: string,
  mode: 'work' | 'casual',
  linkId?: string,  // Only for link_click events
  referrer?: string  // Origin only, no path/query
}
```

### Key Features:
- **Non-blocking**: Uses `navigator.sendBeacon()` for fire-and-forget tracking
- **Fallback**: Uses `fetch` with `keepalive: true` if sendBeacon unavailable
- **Error handling**: All tracking wrapped in try-catch, silent failures
- **Privacy**: Only stores referrer origin, not full URL

## Testing

### Unit Tests
- **SaveContactButton**: 6 tests covering rendering, vCard link, tracking, fallback, and error handling
- **ViewBeacon**: 10 tests covering non-rendering, event sending, referrer handling, fallback, re-firing, and errors
- All existing component tests continue to pass (39 tests total)

### E2E Tests (Playwright)
- **File**: `e2e/profile-page.spec.ts`
- **Test Coverage**:
  - Profile rendering in work and casual modes
  - 404 handling for non-existent profiles
  - vCard download functionality
  - View beacon firing on page load
  - Link click tracking
  - Contact save event tracking
  - Empty state rendering
  - Placeholder name handling
  - Security attributes (noopener noreferrer)
  - Mobile responsiveness
  - Mode change revalidation simulation

### Test Configuration
- **Playwright config**: `playwright.config.ts`
- **Vitest config**: Updated to exclude E2E tests
- **Test scripts**:
  - `pnpm test` - Run unit tests
  - `pnpm test:e2e` - Run Playwright E2E tests
  - `pnpm test:e2e:ui` - Run E2E tests with UI
  - `pnpm test:e2e:debug` - Debug E2E tests

## Integration with ProfilePage

Updated `src/components/ProfilePage.tsx` to include:
1. `<ViewBeacon>` component for view tracking
2. `<SaveContactButton>` for vCard download
3. Existing `<SaveToNetworkButton>` (from previous task)
4. Pass `mode` prop to all tracking components
5. Pass `publicId` and `mode` to LinkCard for click tracking

## Requirements Coverage

### Requirement 5.8 (vCard Download)
✅ "Save Contact" button downloads vCard with one tap

### Requirement 6.1-6.5 (vCard Functionality)
✅ Button hits vCard route with proper headers
✅ Route proxies backend API vCard endpoint
✅ Content-Type and Content-Disposition headers set correctly

### Requirement 8.1 (View Events)
✅ ViewBeacon records view event on page load
✅ Includes mode and referrer origin (not full URL)

### Requirement 8.2 (Link Click Events)  
✅ LinkCard tracks clicks with linkId, mode, and referrer
✅ Non-blocking tracking using sendBeacon

### Requirement 8.3 (Contact Save Events)
✅ SaveContactButton tracks contact_save event when clicked

### Requirement 8.8 (Non-blocking Analytics)
✅ All tracking uses sendBeacon (fire-and-forget)
✅ No blocking of page rendering or navigation
✅ Fallback to fetch with keepalive if needed
✅ Silent error handling

## Files Created/Modified

### Created:
- `src/components/SaveContactButton.tsx`
- `src/components/SaveContactButton.test.tsx`
- `src/components/ViewBeacon.tsx`
- `src/components/ViewBeacon.test.tsx`
- `src/app/c/[publicId]/vcard/route.ts`
- `e2e/profile-page.spec.ts`
- `playwright.config.ts`
- `TASK_15_SUMMARY.md` (this file)

### Modified:
- `src/components/ProfilePage.tsx` - Added SaveContactButton and ViewBeacon
- `src/components/LinkCard.tsx` - Added click tracking
- `apps/web/package.json` - Added E2E test scripts and Playwright dependency
- `vitest.config.ts` - Excluded E2E tests from unit test runs

## Technical Decisions

1. **sendBeacon API**: Chosen for non-blocking, fire-and-forget analytics that works even when user navigates away immediately

2. **Referrer Privacy**: Only store origin (e.g., `https://google.com`), not full URL to protect visitor privacy

3. **Error Handling**: All tracking wrapped in try-catch with silent failures to never impact user experience

4. **vCard Route**: Proxy through Next.js instead of direct API call to ensure proper headers and caching

5. **Test Strategy**: Unit tests for component behavior, E2E tests for integration and user flows

## Next Steps

The implementation is complete and ready for the next task. All subtasks of Task 15 have been successfully implemented:

✅ 15.1 SaveContactButton hitting vCard route with download headers
✅ 15.2 View beacon (non-blocking) on page load  
✅ 15.3 Link redirect/tracking with sendBeacon, rel="noopener noreferrer"
✅ 15.4 Playwright tests: render per mode, 404, vCard download, mode change

To run the E2E tests (requires backend API running):
```bash
pnpm test:e2e --filter @tapsync/web
```

## Notes

- The E2E tests use mocked API responses for consistency
- Real E2E testing against a running backend should be done as part of Task 24 (End-to-end and device testing)
- The analytics endpoint expects the payload structure documented above
- All tracking is optional and fails silently if the API is unavailable
