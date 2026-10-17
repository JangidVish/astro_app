# Requirements: Vedic Astrology Mobile App (MVP)

- **Status:** Approved by the client on 2026-10-17. FR-16 was revised after the provider review
- **Version:** 0.2
- **Date:** 2026-10-17

Each item is marked by source:
- **[C] Confirmed:** you chose it.
- **[A] Assumption:** my default, accepted with "go for it". You can override it.
- **[U] Unresolved:** blocks a later phase.

---

## 1. Product summary

This is a commercial, free-at-launch native mobile app for iOS and Android. Users enter birth details and receive a Vedic (Jyotish) birth chart, Dasha periods, and a daily personal prediction.

An external astrology API supplies all calculations and all prediction text. The app does not generate predictions itself, whether through AI, rules, or fabrication.

## 2. Confirmed decisions

| ID | Decision | Source |
|---|---|---|
| D1 | Astrology system: **Vedic (Jyotish)**, sidereal zodiac | [C] |
| D2 | Prediction source: **external API only**. No AI or in-house interpretation text | [C] |
| D3 | Platform: **native mobile first** (iOS + Android) | [C] |
| D4 | Mobile tech preference: **React Native / Expo**. Final choice is made in Phase 3 | [C] |
| D5 | Stage: **commercial MVP**, public app-store launch | [C] |
| D6 | Chart style: **North Indian** (diamond) | [C] |
| D7 | Language: **English only**. Code is i18n-ready | [C] |
| D8 | Monetization: **free at launch**. No payments in MVP | [C] |
| D9 | Cloud: **Google Cloud / Firebase** | [C] |
| D10 | Infra budget: **under $50/month**, excluding astrology API fees | [C] |
| D11 | Scale target: **under 1,000 users** in the first 6 months | [C] |
| D12 | Predictions: **Vedic daily personal only** (`daily_nakshatra_prediction`). No Horoscope Suite | [C] |

## 3. Functional requirements (MVP)

### 3.1 Accounts and authentication
- **FR-1** [A] Users sign in with email OTP, Google, or Sign in with Apple. Apple requires its own sign-in on iOS whenever Google sign-in is offered.
- **FR-2** [C/A] Users can delete their account from inside the app. Apple requires this. Deletion removes all personal data per the retention rules in 5.3.
- **FR-3** [A] Users can view and edit basic profile data (display name, email).

### 3.2 Birth profiles
- **FR-4** [A] Each account can hold up to **5 birth profiles**, for self, family, or partner. One profile is marked "primary".
- **FR-5** Each profile requires a name, date of birth, place of birth, and either an exact time of birth or the flag "time unknown".
- **FR-6** Place of birth comes from a search/autocomplete. It resolves to latitude, longitude, and an IANA timezone. Free-text places are not accepted. The provider's `geo_details` endpoint does the lookup. Results are cached server-side.
- **FR-7** The UTC offset (provider `tzone`) is calculated from the **historical** timezone rules for that place and date, including DST and historical offset changes. Example: India used +05:30 but also had wartime and pre-1955 variations.
- **FR-8** [A] If the time is unknown, the app still produces the output it can: planet signs and the Moon nakshatra, with a caveat. It hides time-dependent output: Lagna, houses, D9, and exact Dasha start dates. All reduced output is labelled clearly.
- **FR-9** Users can edit or delete profiles. Editing birth data invalidates that profile's cached charts and readings.

### 3.3 Charts
- **FR-10** [A] D1 Rashi chart, drawn **North Indian** style. Shows the Lagna, the 9 grahas (including Rahu/Ketu), the sign in each house, and retrograde markers.
- **FR-11** [A] D9 Navamsa chart, in the same rendering.
- **FR-12** [A] Planet details table: sign, degree, nakshatra and pada, house, retrograde status.
- **FR-13** [A] Ayanamsa: **Lahiri**, fixed. It cannot be changed by the user in the MVP.
- **FR-14** [A] The app draws the chart itself (SVG) from raw positions. This keeps the app independent of the provider's image style. It may be revised if the provider's chart images are adequate.

### 3.4 Dasha
- **FR-15** [A] Vimshottari Dasha timeline showing the current and upcoming Mahadasha and Antardasha, with start and end dates in the user's local timezone.

### 3.5 Daily prediction
- **FR-16** [C] Each profile gets a **daily personal Vedic prediction** for today, plus previous and next day. It comes from the provider's `daily_nakshatra_prediction` and is based on the profile's Moon sign and nakshatra. It covers health, emotions, profession, luck, personal life, and travel. Weekly, monthly, and yearly predictions are **out of MVP**.
- **FR-17** The prediction screen shows the Moon sign and nakshatra the provider used.
- **FR-18** Each prediction is cached per (profile, date). If Phase 7 shows the text depends only on (Moon sign, nakshatra, date), the cache becomes shared across users. Shared caching also needs U-6 confirmation.

### 3.6 Saved readings and history
- **FR-19** [A] Generated charts, Dasha results, and daily predictions viewed are stored per profile. Users can revisit them without a new API call.
- **FR-20** [A] Export and share are **out of MVP** (see section 6).

### 3.7 Errors and transparency
- **FR-21** When the provider fails, the user sees a clear error with a retry option. The app never substitutes fabricated or placeholder predictions.
- **FR-22** The app shows a disclaimer that content is for guidance and entertainment. This supports store review and limits liability.

## 4. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | Provider API keys exist **only on the backend**. The mobile app never holds them. |
| NFR-2 | Secrets live in GCP Secret Manager or equivalent. No secrets in git, logs, or app bundles. |
| NFR-3 | Each user can only read or write their own data. This is enforced on the server and covered by tests. |
| NFR-4 | Birth data is personal data. It is encrypted in transit (TLS) and at rest (provider default). Logs never contain birth date, time, or place in plaintext. |
| NFR-5 | Per-user rate limits keep API cost down on the free tier. Proposed: 20 chart generations per day per user. Final value set after pricing is known. |
| NFR-6 | Response times: cached chart or reading p95 < 500 ms. A fresh chart generation p95 < 4 s, depending on the provider. |
| NFR-7 | Supported platforms: iOS 16+ and Android 9+. To be confirmed in Phase 3. |
| NFR-8 | Accessibility: dynamic text size, screen-reader labels on chart elements and tables, WCAG AA contrast. |
| NFR-9 | Privacy compliance: India **DPDP Act 2023**, plus GDPR basics for diaspora users. This covers consent at signup, a privacy policy, deletion, and data export on request. |
| NFR-10 | Infrastructure must fit under $50/month at under 1,000 users. |
| NFR-11 | Automated tests run without live API access, using a mock provider. |

## 5. Data rules

### 5.1 Stored
- Account identity (auth ID, email).
- Birth profiles: name, date, time (or unknown flag), place name, latitude/longitude, IANA timezone ID, and the computed UTC instant.
- Charts, Dasha, and horoscope results.
- API request metadata: timestamp, endpoint, status, latency, and user ID hash. No birth data is stored here.

### 5.2 Not stored
- Payment data (no payments in MVP).
- Device contacts, precise device location, or analytics beyond basic crash and usage data.

### 5.3 Retention and deletion
- Account deletion hard-deletes profiles and readings within 30 days and anonymizes logs. The exact window is to be confirmed.
- Per-profile prediction cache is deleted with the profile. A shared (Moon sign, nakshatra, date) cache, if adopted, holds no personal data and is kept.

## 6. Out of scope for MVP (future)

These are excluded from the MVP: weekly, monthly, and yearly horoscopes (the provider has no Vedic equivalent), Panchang, Kundli matching (Ashtakoota), dosha reports (Manglik and others), transit and Gochar analysis, personal (chart-based) predictions, more divisional charts, South Indian chart style, Hindi and regional languages, PDF export and sharing, payments and subscriptions, push notifications for daily horoscopes, web app, astrologer consultations, and AI-generated narrative.

## 7. Unresolved questions

| ID | Question | Blocks |
|---|---|---|
| U-1 | ~~Provider~~. **Resolved:** AstrologyAPI.com | — |
| U-2 | ~~Coverage~~. **Resolved:** D1, D9, Dasha, and daily prediction are supported. FR-16 was revised. | — |
| U-3 | Credits per call are unpublished, and rate limits are undocumented. Measure with free credits in Phase 7. | NFR-5, cost |
| U-4 | ~~Chart images~~. **Resolved:** both are available. We keep our own renderer (FR-14). | — |
| U-5 | ~~Geocoding~~. **Resolved:** `geo_details` and `timezone_with_dst` are available. | — |
| U-6 | The provider's guide recommends caching, but the terms are silent. Get written confirmation before launch. | Launch |
| U-7 | Who owns the developer accounts (Apple Developer $99/yr, Google Play $25 one-time) and the legal entity? Who writes the privacy policy and terms? | Launch |
| U-8 | Are there brand, design, or app name assets, or is design part of this project? | Phase 6 UI |

## 8. MVP acceptance criteria

The MVP is accepted when all of the following pass. Each must be verified by a test that was actually executed, or by documented manual QA on a real iOS and Android device.

1. A new user can sign up with email OTP, Google, and Apple, then sign out and sign back in.
2. A user can create, edit, and delete up to 5 birth profiles. A 6th is rejected with a clear message.
3. Place search returns coordinates and a timezone. A birth during a known historical offset or DST period produces the correct UTC instant. A test fixture set covers this.
4. With an exact birth time, the D1 and D9 North Indian charts and the planet table render. Their values match the provider response for at least 5 reference charts.
5. With an unknown birth time, the app shows reduced output with a visible caveat. It never shows Lagna or houses.
6. The Vimshottari Dasha timeline shows the correct current period for the reference fixtures.
7. The daily Vedic prediction loads for today, previous day, and next day. A second request for the same profile and date is served from cache.
8. Previously generated readings open with no new provider call.
9. Provider failures (timeout, 401, 429, 5xx, malformed response) each show a clear error. No fabricated content appears, and the app does not crash.
10. User A cannot read or modify user B's profiles or readings. An automated test covers this.
11. Account deletion removes the user's profiles and readings. An automated test covers this.
12. No API key or secret appears in the app bundle, the repo, or logs. A scan is run and checked.
13. Infrastructure runs within budget during staging. A cost report is reviewed.
14. Both apps pass internal testing (TestFlight and Play internal track).

## 9. Provider findings that affect requirements

Details are in `docs/api-provider-notes.md`.

- **FR-16 conflict. Resolved 2026-10-17: Vedic daily only.** AstrologyAPI's sign horoscopes (daily, weekly, monthly) are a **separate Horoscope Suite plan** costing ₹3,500/mo or more. They are keyed by Western sign name, and the sample text reads as Western/tropical astrology. **No yearly horoscope endpoint exists.** The Vedic suite offers only `daily_nakshatra_prediction`, which is personal (from the user's Moon sign and nakshatra) and daily only.
- **FR-14 kept.** The provider can return a North Indian SVG, but styling is limited to 3 colours, and each image costs an extra call. Our renderer uses the `horo_chart` data instead. The provider's SVG serves as a visual reference in tests.
- **FR-8 refined.** Every Vedic endpoint requires an hour and minute. For profiles with an unknown time, we send 12:00 noon only for Moon-based output, and always show a visible accuracy disclaimer. The provider recommends this. Lagna, houses, D9, and Dasha stay hidden.
- **Privacy.** Birth data is sent to a third-party processor (AstrologyAPI / Vedic Rishi). The privacy policy must disclose this.
