# Requirements Document

## Introduction

TapSync is a dynamic digital business card and networking platform. Each user owns a single rewritable **NTAG215 NFC card** that stores one permanent cloud URL (`https://tapsync.app/c/{publicId}`) generated automatically when the Owner signs up. When a visitor taps the card with any NFC-enabled smartphone (iOS or Android), a fast, mobile-first landing page opens showing the owner's profile and links.

The core differentiator is a **Casual / Work mode toggle**: the owner switches modes in the TapSync app and the links shown on the public page change immediately, with no need to rewrite the physical card.

The system consists of:
- A **Mobile App** (React Native / Expo) for authentication, link management, mode switching, NFC card programming and analytics.
- A **Backend API** (NestJS + MongoDB) for auth, profiles, links, cards, analytics.
- A **Public Landing Page** (Next.js App Router, SSR) that visitors see after tapping a card. No sign-in required.

### Glossary
- **Owner**: a TapSync user who owns a profile and cards. Every user has an account, created automatically on first open.
- **Visitor**: anyone who opens a public profile page. Unauthenticated.
- **Mode**: either `work` or `casual`. Determines which links are public.
- **Active Mode**: the mode currently selected by the Owner.
- **Card**: a physical NTAG215 tag identified by its hardware UID.
- **Public ID**: a random, permanent identifier generated at signup. It never changes.
- **Profile URL**: the permanent URL `https://tapsync.app/c/{publicId}`. This is the only URL ever written to a card.
- **Custom Name**: an optional vanity name the Owner can claim, giving `https://tapsync.app/p/{customName}`, which shows the same page as the Profile URL.
- **Retired Name**: a Custom Name the Owner previously used. It keeps redirecting to the Profile URL.
- **Anonymous Account**: an account the app creates silently on first open, with no email, password or Google link. It is identified only by a secret stored on the phone.
- **Recovery Method**: a linked and verified Google account, a linked and verified email with password, or a saved recovery code. Any one lets the Owner get the account back on a new phone.
- **My Network**: the in-app list of profiles the user has tapped, scanned or opened, saved automatically.

---

## Requirements

### Requirement 1: Account Creation, Security and Recovery

**User Story:** As an Owner, I want to start using TapSync immediately with no sign-up form, and secure or recover my account later, so that setup is effortless without risking permanent loss of my page.

#### Acceptance Criteria
1. WHEN the app is opened for the first time with no stored session THEN the app SHALL automatically create an Anonymous Account and Profile (see Requirement 2.1) and open the dashboard, without asking for a name, email, username or password.
2. The app SHALL keep the session in the phone's secure storage so later launches sign in silently, with no login screen.
3. The first-run screen SHALL include a small "Restore my account" option for people who already have an account.
4. WHEN a user links a Google account THEN the system SHALL verify the Google ID token server-side and attach it to the current account.
5. WHEN a user links an email and password THEN the system SHALL require a password of at least 8 characters, hash it, and send a verification email. The email SHALL count as a Recovery Method only after it is verified.
6. IF a Google account or email is already linked to a different account THEN the system SHALL reject the link with a conflict error and tell the user to restore that account instead.
7. WHEN a user generates a recovery code THEN the system SHALL show it once, store only a hash of it, and require the user to confirm they saved it. Generating a new code SHALL invalidate the old one.
8. WHEN a user restores on a new phone with Google, email and password, or a recovery code THEN the system SHALL sign in to the existing account. IF the new phone's Anonymous Account has no links, cards or name THEN the system SHALL delete it.
9. IF an account has no Recovery Method THEN the app SHALL show a persistent, dismissible warning that losing the phone means losing the page, and SHALL show it again right after the first card is programmed.
10. WHEN a user tries to sign out of an account with no Recovery Method THEN the app SHALL warn that access will be permanently lost and require confirmation.
11. WHEN an access token expires AND a valid refresh token is presented THEN the system SHALL issue a new access token and rotate the refresh token. Reuse of an old refresh token SHALL revoke that token family.
12. IF credentials or a recovery code are invalid THEN the system SHALL return a generic authentication error, and SHALL throttle repeated failures (more than 10 from one IP within 15 minutes).
13. The system SHALL rate limit Anonymous Account creation per IP and per device, and MAY use Play Integrity / App Attest to block automated creation.

---

### Requirement 2: Profile Creation, Management and Custom Name

**User Story:** As an Owner, I want a permanent profile page created automatically when I sign up, and the option to claim a custom name later, so that my card works immediately and never breaks.

#### Acceptance Criteria
1. WHEN an account is created (including the silent Anonymous Account created on first app open) THEN the system SHALL automatically create a Profile with a generated Public ID, without asking the user to choose a username.
2. The Public ID SHALL be unique, immutable, URL-safe, and unrelated to the user's name or email.
3. WHEN a Profile is newly created and has no links THEN the public page at `/c/{publicId}` SHALL show the Owner's name (or the placeholder "TapSync user" while no name is set) and an empty state instead of an error. The vCard SHALL use the same placeholder. The app SHALL prompt the Owner to add their name after first open.
4. WHEN an Owner updates full name, bio, designation, phone, public email or company THEN the system SHALL validate and persist the changes.
5. WHEN an Owner uploads a profile picture THEN the system SHALL accept only JPEG, PNG or WebP up to 5 MB, resize it, and store a CDN-served URL.
6. WHEN an Owner updates their profile THEN the system SHALL invalidate the cached public page for that Profile.
7. WHERE an Owner sets a contact field (phone, email) to "hidden" THEN the system SHALL exclude it from the public page and the vCard.
8. WHERE an Owner chooses to claim a Custom Name THEN the system SHALL require 3–30 characters (lowercase letters, numbers, `_` and `-`), a name not used by any other Profile (current or retired), and a name not on the reserved list (e.g. `admin`, `api`, `login`, `c`, `p`).
9. WHEN a Custom Name is claimed THEN `/p/{customName}` SHALL show the same page as `/c/{publicId}`, and `/c/{publicId}` SHALL remain valid.
10. WHEN an Owner changes their Custom Name THEN the system SHALL retire the old name, SHALL redirect it to `/c/{publicId}` permanently, and SHALL keep it reserved so no other Owner can claim it.
11. WHEN an Owner removes their Custom Name THEN the system SHALL retire it the same way as in 2.10 and `/c/{publicId}` SHALL continue to work.
12. Changing, retiring or removing a Custom Name SHALL NOT affect any programmed card, because cards only contain `/c/{publicId}`. The app SHALL tell the Owner this on the Custom Name screen.
13. IF an Owner changes their Custom Name more than 3 times within 30 days THEN the system SHALL reject the change.
14. WHERE an Owner re-claims one of their own Retired Names THEN the system SHALL allow it.

---

### Requirement 3: Link Management

**User Story:** As an Owner, I want to manage links separately for Work and Casual modes, so that each audience sees the right set of links.

#### Acceptance Criteria
1. WHEN an Owner creates a link with a title, URL and mode THEN the system SHALL store it with a category, icon and next priority order.
2. IF a link URL does not use `https`, `http`, `mailto` or `tel` schemes THEN the system SHALL reject it.
3. WHEN an Owner edits a link THEN the system SHALL persist the changes and invalidate the public page cache.
4. WHEN an Owner reorders links within a mode THEN the system SHALL persist the new `priorityOrder` values atomically.
5. WHEN an Owner disables a link THEN the system SHALL keep it stored but exclude it from the public page.
6. WHEN an Owner deletes a link THEN the system SHALL remove it and its association from the public page.
7. WHEN an Owner moves or copies a link between modes THEN the system SHALL update or duplicate it accordingly.
8. The system SHALL provide predefined categories and icons for common services (LinkedIn, GitHub, Portfolio, Email, Calendar, Company site, Instagram, Facebook, X/Twitter, Gaming, Messaging, Spotify) plus a custom option.
9. IF an Owner has more than 30 links per mode THEN the system SHALL reject creation of additional links.

---

### Requirement 4: Mode Switcher (Casual vs Work)

**User Story:** As an Owner, I want to switch between Work and Casual mode in one tap, so that whoever taps my card next sees the right links without me touching the card.

#### Acceptance Criteria
1. The system SHALL store exactly one Active Mode per Owner, defaulting to `work`.
2. WHEN an Owner calls the mode toggle with `work` or `casual` THEN the system SHALL update the Active Mode and return the new value.
3. WHEN the Active Mode changes THEN the next public page request for that Owner SHALL show only enabled links of the new mode, within 2 seconds of the change.
4. WHEN the mobile app is reopened THEN it SHALL display the Active Mode as stored on the server.
5. IF the toggle request fails due to network error THEN the mobile app SHALL revert the optimistic UI state and show an error message.
6. IF a mode has no enabled links THEN the public page SHALL show the profile header and contact actions with a friendly empty state.
7. THE mobile app SHALL expose the mode toggle on the dashboard home screen.

---

### Requirement 5: Public Landing Page

**User Story:** As a Visitor, I want to tap a card and instantly see the owner's profile and links, so that I can connect without installing anything or signing in.

#### Acceptance Criteria
1. WHEN a Visitor opens `/c/{publicId}` or the current `/p/{customName}` THEN the system SHALL server-render the profile avatar, name, designation, bio and enabled links for the Owner's Active Mode.
2. IF the Public ID or Custom Name does not exist THEN the system SHALL return a 404 page with a friendly message.
3. IF the account is suspended or deleted THEN the system SHALL return a 404 page.
4. The page SHALL be mobile-first and responsive, and SHALL support light and dark themes following the Visitor's system preference.
5. The page SHALL NOT require sign-in, cookies consent walls or app installation.
6. WHEN a Visitor taps a link THEN the system SHALL open it in a new tab with `rel="noopener noreferrer"`.
7. The page SHALL include correct Open Graph and meta tags so shared links preview the Owner's name, designation and avatar.
8. The page SHALL include a "Save Contact" button (see Requirement 6).
9. The page SHALL meet WCAG 2.1 AA for contrast, focus states, touch target size (≥ 44px) and semantic markup.
10. The page SHALL show a "Save to My Network" button that opens the TapSync app through the custom link `tapsync://c/{publicId}`, and a "Get the app" link to the app's store listing next to it. The button SHALL only act when the Visitor presses it. Because a web page cannot detect whether the app is installed, the store link SHALL always be visible. The page SHALL NOT require the app and SHALL NOT store any Visitor data.
11. WHEN a Visitor opens a Retired Name at `/p/{retiredName}` THEN the system SHALL respond with a permanent redirect to `/c/{publicId}`.

---

### Requirement 6: vCard Download

**User Story:** As a Visitor, I want to save the Owner's contact details to my phone's address book with one tap.

#### Acceptance Criteria
1. WHEN a Visitor taps "Save Contact" THEN the system SHALL return a valid vCard 3.0 file (`text/vcard`) named after the Owner.
2. The vCard SHALL include full name, organization, title, phone, email, profile URL and photo (when available), excluding any fields the Owner marked hidden.
3. WHEN the vCard is opened on iOS or Android THEN it SHALL import into the native Contacts app without errors.
4. IF the Owner has no public contact fields THEN the vCard SHALL still contain name and profile URL.
5. The system SHALL properly escape special characters (commas, semicolons, newlines, non-ASCII) in vCard fields.

---

### Requirement 7: NFC Card Programming and Binding

**User Story:** As an Owner, I want to write my permanent profile URL onto an NTAG215 card from my phone and bind that card to my account.

#### Acceptance Criteria
1. WHEN the Owner opens "Program Card" THEN the app SHALL detect whether the device supports NFC and whether NFC is enabled, and SHALL guide the Owner to enable it if off.
2. IF the device does not support NFC THEN the app SHALL show a clear message and disable the write flow.
3. WHEN the Owner starts programming THEN the app SHALL fetch the Owner's permanent Profile URL (`/c/{publicId}`) from the API and SHALL NOT use the Custom Name URL, even if one exists.
4. WHEN the Owner holds an NTAG215 card to the phone THEN the app SHALL read the tag UID, verify the tag is NTAG215-compatible and writable, and write a single NDEF URI record containing the profile URL.
5. WHEN the write succeeds THEN the app SHALL read the tag back to verify the payload, then call the API to bind the card UID to the Owner's account with status `active`.
6. IF the tag is not NDEF-writable, is read-only, or has insufficient capacity THEN the app SHALL show an error and SHALL NOT bind the card.
7. IF the write times out or the tag is removed mid-write THEN the app SHALL show a retry prompt and SHALL NOT bind the card.
8. IF the card UID is already bound to another account THEN the API SHALL reject the bind with a conflict error.
9. WHEN an Owner re-programs the same card THEN the system SHALL allow it and keep the binding.
10. WHEN an Owner deactivates or replaces a card THEN the system SHALL mark the old card `unassigned` and allow it to be bound again.
11. The system SHALL allow an Owner to bind more than one card (e.g. a backup card), all pointing to the same Profile URL. *(Assumption: configurable limit, default 3.)*
12. WHERE the platform is iOS THEN the app SHALL use CoreNFC-compatible flows (iPhone 7 or newer, iOS 13+) and display system NFC session prompts.

---

### Requirement 8: Tap Analytics and Networking History

**User Story:** As an Owner, I want to see how often my card is tapped and which links get clicked.

#### Acceptance Criteria
1. WHEN a Visitor loads a profile page THEN the system SHALL record a "view" event with timestamp, active mode, and coarse metadata (country, device type, referrer), without storing raw IP addresses.
2. WHEN a Visitor taps a link THEN the system SHALL record a "link click" event referencing the link and mode.
3. WHEN a Visitor taps "Save Contact" THEN the system SHALL record a "contact saved" event.
4. WHEN an Owner opens the Analytics screen THEN the app SHALL show total views, link clicks and contact saves for selectable ranges (7 days, 30 days, all time).
5. The Analytics screen SHALL show per-link click counts and a list of recent tap events with time and mode.
6. IF a request appears to be from a known bot or crawler THEN the system SHALL NOT count it.
7. IF the same visitor session reloads within 30 seconds THEN the system SHALL NOT count duplicate views.
8. Analytics recording SHALL NOT delay the rendering or navigation of the public page.
9. Tap history entries SHALL be anonymous: the Owner sees time, mode and coarse metadata, never the identity of the Visitor or whether the Visitor saved them to My Network.

---

### Requirement 9: Performance and Reliability

**User Story:** As a Visitor, I want the page to load almost instantly after the tap.

#### Acceptance Criteria
1. The public page SHALL achieve Largest Contentful Paint under 2.0 s on a mid-range phone over 4G.
2. The public page SHALL ship minimal client JavaScript (target < 100 KB gzipped).
3. The public page SHALL be served from edge/CDN cache where possible and SHALL reflect owner changes within 2 seconds via on-demand revalidation.
4. IF the backend API is temporarily unavailable THEN the public page SHALL serve the last cached version when available.
5. The API SHALL respond to public profile reads in under 200 ms at p95 under normal load.

---

### Requirement 10: Security and Privacy

**User Story:** As an Owner, I want my data protected and under my control.

#### Acceptance Criteria
1. The system SHALL hash passwords with Argon2id or bcrypt (cost ≥ 12) and SHALL never log or return password hashes.
2. All traffic SHALL use HTTPS and the API SHALL set secure headers and a restrictive CORS policy.
3. All inputs SHALL be validated and sanitized server-side; public text SHALL be escaped on render to prevent XSS.
4. Owner-only endpoints SHALL verify that the authenticated user owns the resource being modified.
5. Public endpoints and auth endpoints SHALL be rate limited.
6. WHEN an Owner requests account deletion THEN the system SHALL delete the profile, links, card bindings and analytics within 30 days and the public page SHALL immediately return 404.
7. The system SHALL only expose on the public page what the Owner has marked as public.
8. The system SHALL comply with applicable privacy law (including the Philippine Data Privacy Act) and SHALL provide a privacy policy link on the public page.
9. WHERE an Owner opts in THEN the system MAY enable NTAG215 write-protection (password / lock bits) after programming, with a clear warning that this is irreversible or password-dependent.

---

### Requirement 11: Platform Constraints and Expectations

**User Story:** As an Owner, I want to know what TapSync can and cannot control, so I can set the right expectations for people who tap my card.

#### Acceptance Criteria
1. The public page and all links on it SHALL require an internet connection. The system SHALL NOT provide an offline mode for the public page.
2. The card only holds a URL, so WHEN a Visitor's phone is offline THEN the phone will read the URL but the page will not load. The system SHALL document this limitation in the app's help content.
3. Whether the phone shows a prompt or opens the page immediately after a tap is decided by the Visitor's operating system and settings. The system SHALL NOT claim to control it, and the app's help content SHALL explain this.
4. The app's help content SHALL list NFC compatibility: Android phones need NFC turned on, iPhone XS/XR and newer read tags automatically, and older iPhones need an NFC reader app or the Control Center tile. Writing cards requires iPhone 7 or newer on iOS 13+.
5. The system SHALL NOT require Visitors to install the app or sign in. The "Save to My Network" button and "Get the app" link in Requirement 5.10 are optional for the Visitor to use.
6. My Network requires the app, but a Visitor never fills in a form to use it, because the app creates an Anonymous Account on first open (Requirement 1.1).

---

### Requirement 12: My Network (Saved Contacts History)

**User Story:** As someone who taps a TapSync card, I want the app to save that person automatically, so I can find them again later.

#### Acceptance Criteria
1. WHEN the app is opened from a profile link (`tapsync://c/{publicId}` from the page's button) THEN the app SHALL validate the Public ID format, resolve the profile, save it to My Network without asking for confirmation, and show My Network with that contact at the top.
2. A saved contact SHALL store the Public ID, display name, designation, avatar snapshot, first saved time, last tapped time, tap count, source (`nfc`, `qr`, `link` or `scan`) and the mode shown when it was saved.
3. IF the profile is already saved THEN the app SHALL NOT create a duplicate, and SHALL update the last tapped time, increase the tap count and move it to the top.
4. IF the link points to the user's own profile THEN the app SHALL NOT save it and SHALL show a short "This is your own card" message.
5. IF the phone is offline THEN the app SHALL save the contact locally as `pending` with its Public ID and time, show "Pending sync", and resolve and sync it automatically when the connection returns.
6. IF a saved profile is deleted or suspended THEN the app SHALL mark the contact `unavailable` and keep it until the user removes it.
7. WHEN a user opens a saved contact THEN the app SHALL show the contact's current profile and enabled links for their active mode (live data when online, snapshot when offline), with "Save to phone contacts" (vCard), "Open in browser" and a private note.
8. The user SHALL be able to search My Network by name, add or edit a private note, and delete a contact.
9. My Network SHALL be private. The system SHALL NOT reveal to a profile Owner who saved them or whether anyone did. Only the anonymous analytics events in Requirement 8 are recorded.
10. The system SHALL store My Network on the server under the user's account, so it follows the account when it is restored or used on another device.
11. My Network SHALL offer manual capture that does not depend on the phone's OS opening the app: "Scan card" (in-app NFC read), "Scan QR" and "Paste link". Each SHALL use the same save flow as 12.1.

---

### Requirement 13: Tap Handling

**User Story:** As a user with TapSync installed, I want to save a tapped card to My Network with one press.

#### Acceptance Criteria
1. The app SHALL register the custom URL scheme `tapsync://` and SHALL handle `tapsync://c/{publicId}` by running the My Network save flow (Requirement 12.1).
2. WHEN a card is tapped THEN the phone SHALL open the web page in the browser (Requirement 5), which shows the "Save to My Network" button from Requirement 5.10. WHEN the Visitor presses it THEN the app SHALL open and save the contact.
3. IF TapSync is not installed THEN pressing the button may do nothing or show an error, so the page SHALL show a "Get the app" link next to it. On Android the page MAY use an intent link that falls back to the app's Play Store listing.
4. The system SHALL NOT claim that tapping a card saves it to My Network automatically. Saving needs the Visitor to press the button or use "Scan card" in the app.
