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

## Findings from the documented samples (T3.3)

These were saved as fixtures in `services/api/test/fixtures/provider/astrologyapi/*.sample.json`.

- **`daily_nakshatra_prediction` returns `prediction_date`.**
  - Format: `"7 July 2017"`, mapped to `forDate` (yyyy-mm-dd).
  - Predictions are cached under the date the provider says it used, which resolves the "which today?" question.
  - Still to confirm live: whether the provider's "today" follows IST or UTC.
- **`isRetro` types are mixed.** It is the string `"true"`/`"false"` for grahas, but a real boolean for the Ascendant.
- **`horo_chart` format.**
  - Planet names are UPPERCASE (`"KETU"`).
  - Houses are listed in order, with house 1 first (the Lagna sign) and signs advancing by one.
  - `planet_degree` was empty in the sample.
- **`sub_vdasha/:md` uses a lowercase planet name** (`sub_vdasha/venus`).
- **Nakshatra spellings are the provider's own** (`"Uttra Shadha"`, `"Uttra Phalguni"`). We keep them as returned.
- **The documented dasha sample does not cover its own sample birth date.** Ketu starts in 1994 for a 1990 birth input, so the samples come from different inputs. The mapper therefore does not check that the birth falls in the first period. Re-check with live data in T3.4.
- **Dasha date timezone.** The `d-m-yyyy H:m` dates are assumed to be birth-local (the request's `tzone`), and the mapper converts them to UTC. **Verify in T3.4.**
- **Sanity check on ayanamsa.** The mapper rejects ayanamsa values outside 20–26°. A tropical (0) or wrong-system response becomes `malformed`.

## Live verification (T3.4, 2026-10-17)

The test used 24 live calls with a synthetic profile. Raw responses are saved in `services/api/test/fixtures/provider/astrologyapi/live/`. The script is `services/api/scripts/provider-spike.ts`, which you run manually and which spends credits.

| Question                                         | Live answer                                                                                                                                                                                                                                                            |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Do our schemas and mappers accept real data?     | **Yes**, for geo, birth details, planets, D1, D9, sub dasha, the 3 prediction endpoints, and timezone. **Except** for one difference: real dasha dates use **two spaces** (`"23-8-1988  18:54"`), while the docs show one. This has been fixed.                        |
| Ayanamsa                                         | 23.7224° for 1990-05-10. The Lahiri estimate is 23.7183°, so this is **Lahiri**.                                                                                                                                                                                       |
| Dasha date timezone                              | **The request's `tzone` (birth-local).** The same instant sent at tzone 0 shifts the strings by exactly 5:30, and both map to identical UTC periods.                                                                                                                   |
| Planets for the same instant at different tzones | Identical. The provider uses the absolute instant.                                                                                                                                                                                                                     |
| Does the birth fall inside the first Mahadasha?  | Yes. Saturn runs from 1988 to 2007 for a 1990 birth.                                                                                                                                                                                                                   |
| Which "today" do predictions use?                | **The request's `tzone`, meaning the birth place.** An IST profile got 2026-10-17, and a UTC+14 profile got 2026-10-18. T7.1 must pick `previous`, `today`, or `next` so that `forDate` equals the user's requested date.                                              |
| Error body                                       | HTTP **401** with `{"status":false,"msg":"Your API key is either expired or invalid..."}`                                                                                                                                                                              |
| Credit or quota headers                          | **None.** The response headers have no credit information, so the credit cost per call must be read from the dashboard.                                                                                                                                                |
| Timezone cross-check                             | **9 of 10 match** our tz database: IST war time, Nepal before and after 1986, New York, London 1970 and 1941, São Paulo, and Dhaka.                                                                                                                                    |
| Mismatch                                         | **Kolkata, 1900-01-01:** we give +05:21 (Madras time, from tzdb), the provider gives +05:53 (Calcutta time). Calcutta kept its own local time until 1948, while tzdb models Madras railway time. This is a genuine historical ambiguity, and **a decision is needed**. |

## Calls per new birth profile (estimated)

`birth_details`, `planets`, `horo_chart/D1`, `horo_chart/D9`, `major_vdasha`, `current_vdasha` makes **6 calls, made once and cached permanently**. `sub_vdasha` is called lazily, only when the user expands a Mahadasha. A daily prediction adds 1 call per profile per day viewed.

## To verify in Phase 7

1. Credits consumed per endpoint, giving the real cost per user.
2. The default ayanamsha is Lahiri, and whether it is fixed.
3. Real error bodies for 401, 402 (out of credit?), 429, and 5xx.
4. Whether `daily_nakshatra_prediction` text is identical for the same (Moon sign, nakshatra, date). If so, it can be shared across users.
5. Written confirmation from the provider that cross-user caching is allowed in a commercial app.
