# Task 22 — Device Testing Checklist: "Save to My Network" Link Flow

This checklist covers the real-device verification of the `tapsync://` custom
URL scheme and the web page's "Save to My Network" button.

**Spec references:** Requirements 12.1, 12.4, 13.1–13.3

---

## Known issue: Android package name mismatch

The web `SaveToNetworkButton` uses the Android package `com.tapsync.app` in its
intent link, but `app.config.ts` registers the app under `app.tapsync.mobile`.

| Component | Package name | File |
|---|---|---|
| Web intent link | `com.tapsync.app` | `apps/web/src/components/SaveToNetworkButton.tsx` |
| App (actual) | `app.tapsync.mobile` | `apps/mobile/app.config.ts` |

**Impact:** On Android without the app installed, the intent link's Play Store
fallback will search for `com.tapsync.app`, which does not match the published
app. The fallback will not find the app in the Play Store.

**Resolution required before launch:** Update the web button's intent link to
use `app.tapsync.mobile` (or update `app.config.ts` to `com.tapsync.app` —
but changing the app package is riskier since it affects the installed app
identity). This must be resolved in the web codebase, not the mobile app.

**For testing:** Until the mismatch is fixed, Android intent links will only
work when the app is already installed (the OS matches by scheme, not
package, when the app exists). The Play Store fallback will fail.

---

## Pre-test setup

- [ ] Backend API running and reachable from the device
- [ ] At least two TapSync accounts created (one to tap, one to be tapped)
- [ ] The "tapped" account has a name, avatar, and at least one link
- [ ] Web profile page accessible at `https://tapsync.app/c/{publicId}`
- [ ] App installed on test device(s) from a development build (not Expo Go)

---

## 1. iPhone with app installed

| # | Scenario | Expected result | Pass/Fail |
|---|---|---|---|
| 1.1 | Open `tapsync.app/c/{publicId}` in Safari. Press "Save to My Network" | iOS prompts "Open in TapSync?". Confirm → app opens | | |
| 1.2 | App opens from the link | Shows brief "Saving to My Network…" loading state | | |
| 1.3 | Save completes | App navigates to My Network tab. New contact appears at top and is highlighted | | |
| 1.4 | Press the button again for the same profile | App opens, contact is NOT duplicated. `tapCount` increases, contact moves to top | | |
| 1.5 | Press the button for your own profile | App opens, shows "This is your own card". No contact is saved | | |
| 1.6 | Use a malformed link `tapsync://c/invalid` | App opens, shows "Invalid link" with the validation error message | | |
| 1.7 | Use a link for a deleted/suspended profile | App opens, shows "Profile not found" | | |

## 2. iPhone without app installed

| # | Scenario | Expected result | Pass/Fail |
|---|---|---|---|
| 2.1 | Open `tapsync.app/c/{publicId}` in Safari. Press "Save to My Network" | Button does nothing or shows an error (iOS cannot fall back to App Store automatically) | | |
| 2.2 | "Get the app" link is visible next to the button | Tapping it opens the App Store listing | | |
| 2.3 | Page remains fully usable (links, Save Contact) without the app | Yes — the app is optional | | |

## 3. Android with app installed

| # | Scenario | Expected result | Pass/Fail |
|---|---|---|---|
| 3.1 | Open `tapsync.app/c/{publicId}` in Chrome. Press "Save to My Network" | App opens directly (intent link matched by scheme) | | |
| 3.2 | App opens from the link | Shows brief "Saving to My Network…" loading state | | |
| 3.3 | Save completes | App navigates to My Network tab. New contact appears at top and is highlighted | | |
| 3.4 | Press the button again for the same profile | Contact NOT duplicated. `tapCount` increases, moves to top | | |
| 3.5 | Press the button for your own profile | App shows "This is your own card". No contact saved | | |
| 3.6 | Use a malformed link `tapsync://c/zzz` | App shows "Invalid link" | | |
| 3.7 | Use a link for a deleted/suspended profile | App shows "Profile not found" | | |

## 4. Android without app installed

| # | Scenario | Expected result | Pass/Fail |
|---|---|---|---|
| 4.1 | Open `tapsync.app/c/{publicId}` in Chrome. Press "Save to My Network" | Intent link falls back to Play Store listing (⚠️ blocked by package name mismatch — see note above) | | |
| 4.2 | "Get the app" link is visible | Tapping it opens the Play Store / download page | | |
| 4.3 | After installing the app, repeat scenario 3.1 | App opens and saves correctly | | |

---

## 5. Custom name links (`tapsync://p/{name}`)

| # | Scenario | Expected result | Pass/Fail |
|---|---|---|---|
| 5.1 | Open a profile via custom name URL, press "Save to My Network" | App resolves the name to a Public ID, then saves | | |
| 5.2 | Use a retired custom name link | App follows the redirect, resolves to the correct Public ID, saves | | |
| 5.3 | Use a non-existent custom name link | App shows "Profile not found" | | |
| 5.4 | Use an invalid custom name (too short, bad chars) | App shows "Invalid link" | | |

---

## 6. Offline behaviour

| # | Scenario | Expected result | Pass/Fail |
|---|---|---|---|
| 6.1 | Airplane mode ON, press "Save to My Network" | The page itself needs internet, so the button is unreachable. Offline saving is via in-app "Scan card" (Task 23) | | |
| 6.2 | App opens from link while briefly offline | Save fails with error message. (Pending queue arrives in Task 23) | | |

---

## 7. Edge cases

| # | Scenario | Expected result | Pass/Fail |
|---|---|---|---|
| 7.1 | Link with extra path segments `tapsync://c/{publicId}/extra` | Expo Router may not match; if it opens, validation catches it | | |
| 7.2 | Empty publicId `tapsync://c/` | App shows "Invalid link" (no Public ID provided) | | |
| 7.3 | Public ID with wrong characters (0, O, 1, l, I) | App shows "Invalid link" (not in allowed alphabet) | | |
| 7.4 | Very long publicId (11+ chars) | App shows "Invalid link" | | |

---

## Sign-off

| Tester | Date | Device | Result |
|---|---|---|---|
| | | | |
| | | | |
