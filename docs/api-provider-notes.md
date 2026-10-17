# Provider Notes: AstrologyAPI.com

- **Researched:** 2026-10-17
- **Source:** public docs at https://www.astrologyapi.com/developers/v1/

Everything here comes from the public documentation. **None of it has been verified against the live API yet.** That happens in Phase 7, using an authorized development key.

## Basics

| Item                         | Finding                                                                                                                                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base URL                     | `https://json.astrologyapi.com/v1/` (HTTPS only)                                                                                                                                                                        |
| Method / body                | `POST` with a JSON body                                                                                                                                                                                                 |
| Auth (core endpoints)        | HTTP Basic: username = User ID, password = API Key                                                                                                                                                                      |
| Auth (alternative)           | `x-astrologyapi-key: <access token>` header                                                                                                                                                                             |
| Language                     | `Accept-Language` header. Vedic endpoints support `en, hi, ma, bn, ta, te, ml, kn`. Charts, geo, and sign horoscopes support `en` only (chart image also supports `hi`).                                                |
| Errors                       | Non-200 HTTP status. The body contains `code` and `message`. No full code list is published.                                                                                                                            |
| Rate limits                  | **Not documented.** The terms say "abuse or excessively frequent requests" may lead to suspension.                                                                                                                      |
| Provider guidance on retries | Retry only on 5xx and network errors, with backoff (1s, 2s, 4s; 4 attempts max). Never retry 4xx. Use a 10s timeout.                                                                                                    |
| Provider guidance on caching | Natal chart data can be cached "indefinitely" for fixed birth inputs. Daily horoscopes can be cached by `(sign, date)`.                                                                                                 |
| Terms                        | There is no explicit caching clause. Building a "similar or competitive service" is prohibited, which does not apply to an end-user app. Liability is capped.                                                           |
| Pricing                      | The Indian Astrology Suite starts at ₹1,500/mo. The Horoscope Suite is a **separate** plan from ₹3,500/mo. Billing uses a credit wallet, and new accounts get 150 free credits. **Credits per call are not published.** |
| Sandbox                      | None documented. Development uses the free credits.                                                                                                                                                                     |

## Birth-data input (shared by most Vedic endpoints)

`day, month, year, hour, min` (int), `lat, lon` (float), `tzone` (float hours, e.g. 5.5). **All are required, including hour and min.**

## Endpoints mapped to MVP features

| Feature                          | Endpoint                                                        | Notes                                                                                                                                                             |
| -------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Place search                     | `geo_details` `{place, maxRows}`                                | Returns `place_name, latitude, longitude (sometimes a string), timezone_id (IANA), country_code`                                                                  |
| Historical UTC offset            | `timezone_with_dst` `{latitude, longitude, date: "mm-dd-yyyy"}` | Returns `timezone` (float). The provider says to use the **birth date**, not today's date.                                                                        |
| Birth summary                    | `birth_details`                                                 | Includes `ayanamsha`. The sample value of 23.75 for 1992 matches **Lahiri** (to be verified live).                                                                |
| Planet table                     | `planets`                                                       | Returns `name, fullDegree, normDegree, speed, isRetro ("true"/"false" as strings), sign, signLord, nakshatra, nakshatraLord, nakshatra_pad, house`                |
| D1 / D9 chart data               | `horo_chart/D1`, `horo_chart/D9`                                | Returns 12 entries in house order: `sign, sign_name, planet[], planet_small[], planet_degree[]`                                                                   |
| Chart image (optional)           | `horo_chart_image/:chartId` with `chartType: north`             | Returns SVG. Styling is limited to 3 colours.                                                                                                                     |
| Mahadasha                        | `major_vdasha`                                                  | Dates are formatted `"d-m-yyyy H:m"`                                                                                                                              |
| Antardasha                       | `sub_vdasha/:md`                                                | One call per Mahadasha                                                                                                                                            |
| Current dasha                    | `current_vdasha`                                                | Returns major through sub-sub-sub-minor                                                                                                                           |
| Daily Vedic prediction           | `daily_nakshatra_prediction` (+ `/next`, `/previous`)           | **Personal**, based on Moon sign and nakshatra. Requires full birth data. Covers health, emotions, profession, luck, personal_life, travel. Supports 8 languages. |
| Sign horoscope, daily            | `sun_sign_prediction/daily/:zodiacName`                         | **Horoscope Suite.** Keyed by Western sign name. The text references tropical/Western factors.                                                                    |
| Sign horoscope, weekly / monthly | `horoscope_prediction/weekly\|monthly/:zodiacName`              | **Horoscope Suite.** Same as above.                                                                                                                               |
| Yearly horoscope                 | **None**                                                        | `varshaphal_*` is an annual _chart_ (premium add-on), not yearly horoscope text.                                                                                  |

## Response quirks the adapter must handle

- Numbers sometimes arrive as strings (e.g. `longitude`), and booleans as strings (`isRetro`).
- Dasha dates use a non-ISO format, `d-m-yyyy H:m`, with unpadded fields. They are assumed to be in birth-local time. **Verify this.**
- The documented response for `horo_chart_image` is `"{svg:\"...\"}"`, a string wrapper, so it needs defensive parsing.
- The errors' `code` and `message` structure is not fully documented. Capture real samples in Phase 7.

## Calls per new birth profile (estimated)

`birth_details`, `planets`, `horo_chart/D1`, `horo_chart/D9`, `major_vdasha`, `current_vdasha` makes **6 calls, made once and cached permanently**. `sub_vdasha` is called lazily, only when the user expands a Mahadasha. A daily prediction adds 1 call per profile per day viewed.

## To verify in Phase 7

1. Credits consumed per endpoint, giving the real cost per user.
2. The default ayanamsha is Lahiri, and whether it is fixed.
3. Real error bodies for 401, 402 (out of credit?), 429, and 5xx.
4. Whether `daily_nakshatra_prediction` text is identical for the same (Moon sign, nakshatra, date). If so, it can be shared across users.
5. Written confirmation from the provider that cross-user caching is allowed in a commercial app.
