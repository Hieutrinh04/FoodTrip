# FoodTrip partner ecosystem — first release

## Scope implemented

- `/partner`: owner-managed room types, dated price/quantity overrides and explicit inventory activation. Staff can read, not edit inventory.
- Owners can edit room defaults, stop/reopen new sales, and reset dated overrides. Booked prices stay unchanged; lowering room counts or capacity is checked against held rooms and booked guest counts.
- `/booking/:placeId`: managed room availability per stay, server-side authoritative pricing and atomic capacity checks. A room reservation is idempotent on its request key.
- `/plan` → step "Tour & trải nghiệm": departures in the trip destination during the trip dates (city aliases, Vietnam time). A chosen tour is placed on its day, the itinerary leaves its hours free, and seats are requested from the result page (`tour_reserve`). Saved/shared trips keep a display copy in `itineraries.tours` (migration `20260930090000_itinerary_tours.sql`). The old `/tours` address redirects to `/plan`.
- `/bookings#tours`: own tour requests beside room bookings — dates, quoted price, status, the exact rich tour terms accepted at reservation time and pre-departure cancellation. `/my-tours` redirects here.
- `/partner/tours`: operator application; owner/manager tour drafts, publication and departures; guide assignment; request confirmation/cancellation/completion; owner membership grant/revoke.
- `/admin` → Đối tác tour: review applications. Operators remain powerless until approved.
- Guide manifests contain only assigned departure information and confirmed guest names/headcounts, not phones, prices or the rest of the operator's customers.
- Tour requests do not initiate hotel payments, collect money, or imply a paid booking.

## Deployment record — 2026-09-29

Applied directly to the existing linked Supabase project `bnxqxraqmyemxfdunhar`
after the user's explicit deployment request. The frontend URL in `.env.local`
matches this project. Only the following migrations were applied:

- `20260929090000_room_inventory.sql`
- `20260929100000_tour_marketplace.sql`
- `20260929110000_ecosystem_function_permissions.sql`

The third migration removes Supabase's explicit default EXECUTE grants from
anonymous callers; revoking PUBLIC alone was insufficient on the hosted project.
The local SQL fixture now reproduces these default privileges as a regression test.

Verified on the hosted project: all seven new tables have RLS enabled, anonymous
table reads are denied, API roles cannot directly insert/update/delete these tables,
and only `tour_catalog` and `hotel_room_quote` are anonymous RPCs in this feature.
Real REST calls returned HTTP 200 for both public RPCs; all seven anonymous table
reads and the private reservation RPC were rejected. The tour catalogue is empty
until approved partners publish departures.

No users, partner memberships, properties or bookings were seeded/changed for QA.
Existing properties/bookings/manager counts were all zero before and after rollout.
No inventory was automatically activated. No full database backup was produced by
this task (the local Docker service needed by CLI dump was unavailable).
Authenticated UI and independent-connection reservation races still require the
acceptance checks below; this deployment does not claim those checks have passed.

## Installation / rollout for another environment

1. Back up and inspect the intended staging database and migration history. Prerequisites include existing bookings/payment guards, admin actions/audit and `20260926090000_hotel_partners.sql`.
2. Apply the migrations in chronological order using the normal reviewed migration process. The 2026-09-30 additions include itinerary tours, tour details/photos, `20260930120000_room_inventory_management.sql` and `20260930130000_tour_management_edits.sql`. Do not blindly push unrelated pending migrations in this dirty repository.
3. Refresh PostgREST schema cache if needed. Verify the new RPCs before enabling any property.
4. Sign in as an existing property owner, create room types and dated overrides. Defaults apply on dates without overrides. Quantity overrides are total allotment, not free rooms after bookings.
5. Explicitly enable inventory. Activation is refused if future active legacy orders have unmapped room keys. Reconcile them operationally; do not silently cancel customers or ignore occupied rooms. There is no UI to disable inventory and fall back to generated rooms.
6. Use separate staging traveller/owner/staff/guide/admin accounts for the acceptance checks below. Do not grant real user roles or seed production bookings merely to test.

Before migration, the new tour screens explain that activation is pending. An absent `hotel_room_quote` RPC (PGRST202 only) keeps the existing hotel flow; network/permission/validation failures never trigger that fallback. An enabled property's server trigger rejects legacy/generated room keys even if a stale frontend tries them.

## Automated verification

`npm test` includes `test/ecosystem.test.js`, which runs the inventory, tour, permission, tour-detail and partner-edit SQL migrations verbatim in an ephemeral in-memory PostgreSQL engine (PGlite). It provides a minimal Supabase auth/property/audit fixture plus the existing initial booking table/payment guard migration. It does **not** certify every previously deployed migration or remote schema drift, or storage bucket permissions.

Tests cover role enforcement, public catalogue privacy, per-night price totals, forged/stale prices, capacity exhaustion, checkout exclusivity, inventory reduction refusal, cancellation release, room/tour retry idempotency, partner approval, tour transitions, guide privacy and access revocation.

Use `npx oxlint` for the touched frontend files and `npm run build` for production compilation.

## Mandatory staging checks before real orders

- Use two independent database connections/clients to reserve the last room/chair concurrently. Exactly one must succeed, including a request that waited on the inventory/departure row lock. PGlite's single-session tests are **not** a substitute for this test.
- Verify a multi-night stay fails if any night is closed/full and that a price change between quote and submit prompts refresh.
- Check duplicate network retries create only one order; a changed payload must use a new key.
- Check an anonymous user cannot list room calendars, memberships or reservations.
- Check hotel staff cannot mutate room inventory, and a different property's owner cannot read it.
- Request → confirm → complete only after departure end; pre-start cancellation returns seats. Closing sales must leave existing bookings intact.
- Remove a guide's membership and verify their next manifest read is empty. Already viewed information cannot be remotely erased.
- Test guest/partner/admin UI end-to-end on staging, mobile and desktop, including account switching and API failures.
- Test existing SePay/VNPay flows against inventory-enabled bookings in sandbox, including cancellation/late callbacks. Do not use real transfers for QA.

## Deliberate limits / next iterations

- Pending hotel orders retain inventory until cancellation; pending tour requests also retain seats until cancellation. There is no timed-expiry job yet. Operations must monitor pending holds; automatic expiry requires coordinated late-payment handling before introduction.
- Tour price is a quoted amount only; payment, deposits, refunds, commissions and partner payouts are not implemented in this release.
- Tour catalogue is capped at 200 future departures; partner table reads at 1,000 rows. Server-side pagination/search is needed before large-scale operations.
- Core tour metadata can be edited only while unpublished and without any reservation history. Departure dates are immutable after any reservation; capacity cannot go below held seats. New prices apply only to new requests. Reservation totals and rich tour terms are snapshotted at reservation time and never silently rewritten. Orders made before `20260930140000_tour_reservation_snapshot.sql` fall back to the current tour page because no historic content existed to recover.
- The first version uses Vietnamese partner/tour copy. Full English translation remains.
- A unified trip checkout, restaurant/transport partners, creator commissions, chat and live guide tracking remain later phases. Tour photos and itinerary integration are implemented separately.
- Existing non-managed hotel estimates/provider listings have not become contracted supplier inventory through this change. They must not be represented as guaranteed real availability.

## Implementation note

Inventory mutators and reservations serialize on room/departure rows; capacity is calculated inside the database rather than trusted from the browser. `room_reserved` is VOLATILE so trigger-time checks obtain fresh snapshots and see prior inserted rows. PostgreSQL documents snapshot semantics in [Function Volatility Categories](https://www.postgresql.org/docs/17/xfunc-volatility.html).

## Deployment record — 2026-09-30 management completion

Applied `20260930120000_room_inventory_management.sql` and
`20260930130000_tour_management_edits.sql` to the same linked project after a dry run
showed only these two pending migrations. All four new RPCs deny anon execution
and allow authenticated execution with ownership checks inside each RPC. Live
properties/bookings/tours/reservation counts were zero both before and after;
no operational records were created for testing. Frontend changes are served
locally; this does not constitute deploying a public website domain.

## Deployment record — 2026-09-30 reservation terms

Applied `20260930140000_tour_reservation_snapshot.sql` to the same linked
project. It adds a JSON snapshot to each new tour reservation and makes the
traveller reservation RPC prefer that snapshot over mutable tour page fields.
The linked project's tour/departure/reservation counts were zero immediately
before and after. Anonymous execution remains denied for reservation and
traveller-order RPCs; authenticated execution remains required. The migration
was run through the linked Supabase management SQL endpoint because the normal
`db push` connection did not have a database password, then recorded in the
standard migration history.

## Which hotels take bookings (2026-10-01)

- Only an active partner property with room inventory switched on takes bookings and payment. `bookings_partner_only` (migration `20261001090000_partner_only_bookings.sql`) refuses any client-inserted booking for another hotel (`hotel-not-bookable`); verified on the hosted project in a rolled-back transaction.
- Search results (Hotelbeds, maps) are listings, not accounts. They are shown with a "Tham khảo" label and a reference booking page (Agoda/Traveloka/Maps links, partner sign-up link) — no generated rooms, no payment. `hotel_booking_status(ids)` (public) tells the planner and cards which hotels are bookable; a partner's booking link also opens without the search result.
- Tour pages: `tour_update_details` (operator content), `tour_detail` (public page), `tour-photos` bucket (operator-folder uploads). The planner offers "Tự túc / Có tour" before hotels and takes the tour price out of the room budget.
- Next: Hotelbeds booking API (CheckRate + Booking) would make non-partner Hotelbeds hotels bookable without per-hotel accounts; needs a production contract.

## Self-listed properties (2026-10-01)

- A homestay or guesthouse no search finds applies at `/partner` → "Chưa có — tự khai báo": type, city, address, a map pin (address lookup via Track-Asia, then tap/drag) and a description. Migration `20261001100000_self_listed_properties.sql`.
- Admin → Đối tác shows "Tự khai báo · type · city" with a link to the pin and approves in one click; `admin_review_application` with no hotel id makes a new `ft-…` id for a pinned application (an unpinned one still needs a hotel id).
- The owner's "Thông tin hiển thị cho du khách" panel (photo upload to `property-photos`, type, city, description, pin) shows a checklist. A property is suggested once it has a pin and its inventory is on: `partner_hotels_near(lat,lng,radius)` (public) adds it to the planner's hotel step beside search results, with its cheapest room as a real price.
- Verified on the hosted project in a rolled-back transaction: apply → approve (`ft-` id, self_listed) → listing update (http photo refused) → room + inventory → found 1.9 km from Da Lat centre, not from Hanoi; anon cannot edit listings.

## Partner onboarding like Agoda / Traveloka (2026-10-01)

- Sign-up at `/partner` is a 4-step wizard: property (claim or self-list, type, rooms, stars, city, address, pin) → contact & papers (name, role, phone, optional business licence / tax code; no ID photos) → partner terms (commission %, payout days, text; must accept) → review & send. Migration `20261001110000_partner_onboarding.sql`; `partner_terms` v1 = 10% commission, payout 3 working days after check-out (placeholder business terms — the owner of FoodTrip should set the real ones).
- After approval, the owner completes a 6-item go-live checklist (Agoda EC360 style): photos & description (≥3 photos, ≥30 chars, pin), facilities, policies (check-in/out, cancellation), rooms & rates, payout account (`property_payouts`, owner + admin only), terms. `properties_go_live` trigger refuses switching inventory on until all six pass (`listing-incomplete:<items>`).
- Travellers see the partner's gallery, facilities, check-in/out times, cancellation policy and house rules on the booking page.
- Verified on the hosted project (rolled back): apply without terms refused; early go-live refused with missing items; complete → live; stranger cannot read payout or readiness.

## Tour operator onboarding (2026-10-01)

- `/partner/tours` sign-up is the same 4-step wizard as places to stay: operator (name, type, cities, website, description) → contact & papers (contact, phone, travel licence, business licence, guide card, tax code; no ID photos) → tour terms (`partner_terms` kind `tour`, v2: 10% commission, operator collects payment, monthly settlement — placeholder for the owner to confirm) → review. RPC `tour_apply_details`; migration `20261001120000_tour_operator_onboarding.sql`.
- Admin → Đối tác tour lists applications with details and approves in one click (reject needs a reason).
- Approved operators see an operator checklist (profile description ≥30 chars, terms) and, per tour, a 7-item publish checklist: ≥3 photos, summary ≥30 chars, schedule, inclusions, cancellation policy, an open future departure, operator profile & terms. Trigger `tours_publish_guard` refuses publishing until all pass (`tour-incomplete:<items>`); hiding a tour is never blocked.
- Verified on the hosted project (rolled back): stay terms refused for tours, no-city refused, bare tour publish refused with all missing items, complete tour publishes, strangers cannot read readiness or edit profiles.

## Role portals and settlements (2026-10-03)

- Hotel (`/partner`) and tour (`/partner/tours`) portals share `PortalShell`: sections on the left (tab bar on phones), section in `?tab=`.
  - Hotel: Tổng quan (KPIs, today's arrivals/departures, 7-night occupancy), Đặt phòng (filters + search), Phòng & giá, Hồ sơ cơ sở, Doanh thu & đối soát (owner), Nhân sự (owner). Staff see only the operational sections.
  - Tour: Tổng quan, Tour, Lịch khởi hành (all departures), Đơn giữ chỗ (all requests, filters + search), Hồ sơ đơn vị, Nhân sự (owner), Đối soát hoa hồng, Đoàn của tôi. A guide-only member sees just the manifest.
- Migration `20261003090000_partner_operations.sql` + `20261003093000_partner_operations_status.sql`: `settlements` (stay payouts net of commission; tour commission owed), `bookings.settlement_id` / `tour_reservations.settlement_id`, `property_statement` / `operator_statement`, `admin_settlement_candidates` / `admin_create_settlement` / `admin_mark_settlement_paid`, owner-managed staff (`property_team`, `owner_set_property_staff`), admin moderation (`admin_set_property_active` with a reason the partner sees, `admin_hide_tour`), `admin_list_tours`, `admin_partner_overview`.
- Admin: new "Đối soát đối tác" tab, partner figures on the overview, property status/suspend/restore, all-tours list with hide.
- Verified on the hosted project (rolled back): owner statement 1.5M gross → 1.35M net at 10%; staff refused money and team changes; settle once (second refused), mark paid with reference; suspended property stops taking bookings.

## Notifications, scheduled jobs, cancellations and refunds (2026-10-04)

- `notifications` (migration `20261004100000_notifications_jobs_refunds.sql`): written by database triggers on bookings (paid, expired, confirmed, rejected, guest-cancelled, refunded), tour reservations (requested, confirmed, cancelled), partner and operator applications (new, reviewed) and settlements (created, paid). The header bell shows them (polled every minute and on tab focus).
- Email: the `send-notifications` Edge Function is called every minute by pg_cron through pg_net with `CRON_SECRET` (stored in `private.settings` and as a function secret, never in git). Without `RESEND_API_KEY` notifications stay in-app and are marked `skipped`; with it they are emailed (set `EMAIL_FROM` on a verified domain and `SITE_URL` for absolute links). Verified live: cron, function, claim, skipped.
- pg_cron jobs (`20261004100500_scheduled_jobs.sql`): unpaid bookings cancelled after 30 minutes (every 5 min), unconfirmed tour requests released after 48 h or at departure (hourly), daily 08:00 reminders (stay or tour tomorrow, hotel confirmation overdue 12 h), email queue every minute.
- Cancellation and refunds: `booking_refund_quote` / `guest_cancel_booking` (flexible 100% at least 1 day before; moderate 100% at least 5 days; strict 50% at least 7 days; non-refundable 0; demo-paid 0) with the refund account; a hotel rejection of a paid booking queues a full refund; `admin_complete_refund` records the bank reference. Guest-cancelled stays release the room, and the amount the property keeps is settled to it. Late transfers to an expired booking show as `not-pending` in Admin > Giao dịch for a manual refund.


## Full flow pass and optimisation (2026-10-05)

- Re-ran every browser scenario: explore, live navigation and auto-follow, self-guided and tour planning (tour list, detail, choose, budget deduction, itinerary placement), hotel/staff/tour/guide/admin portals, partner and tour-operator onboarding, notifications, cancellation and refunds, payment hold countdown. No runtime errors. Scenarios with fixed past dates were re-dated before judging them.
- Place pages show the real Google rating and reviews (place-details + place-reviews, as in the explore panel); the map provider has neither, so these were always empty before. Shared video reviews now match on Google's place id.
- Hotel links that leave the browser that found the hotel (owner claim, admin review) carry the name and address, so the reference page opens on any device.
- Malformed shared-trip ids are rejected before querying.
- Build splits React, Supabase and motion into their own long-cached chunks (app code 146 KB; first load ~216 KB gzip, maps still lazy).
- `.github/workflows/ci.yml`: lint, tests and a key-less build on every push to main and every pull request.

## Reviews, tour pages, English tour portal (2026-10-05)

- Reviews (`20261005090000_reviews.sql`): one review per paid booking after check-out, or per tour reservation after the tour ended, written by its own guest (`submit_review`; editable, 180-day window). Shown signed "Mai T." with the room/month or tour date. Partners reply (`review_reply`, hotel managers or operator owners/managers); admins hide with a logged reason (`admin_set_review_hidden`). The table has no API grants — only these functions. Averages flow into `hotel_booking_status`, `partner_hotels_near`, `tour_catalog`, `tour_detail`. Notifications: partner on a new review, guest on a reply; `ft-review-invites` (09:00 daily) invites guests 0–3 days after the trip. Verified live in a rolled-back transaction: invitations, write/edit, refusals (future stay/tour, someone else's booking, rating 6, direct table read, guest replying, hiding without a reason), aggregates, notifications, hide → public count 0.
- UI: review form on "My bookings" (stays and tours), "Reviews" sections in the hotel and tour portals with replies, admin "Đánh giá" tab, reviews on partner booking pages and tour pages, ratings on partner hotel and tour cards.
- `/tour/:id`: the shareable tour page (share / copy link, people count, choose a departure, request seats, or "plan a trip around this tour" — the planner opens on dates & budget with the destination, dates and tour filled in). Linked from the planner's tour detail, the traveller's reservations and the operator portal (`20261005093000_tour_page_links.sql` adds `tour_id` to `tour_my_reservations`).
- Tour operator portal, operator sign-up, profile/tour checklists and the tour content editor follow the site language (VI/EN); tour statuses and errors are bilingual. Partner terms text itself is stored in Vietnamese only.

## Sharing a food video: finding the venue without a trained model (2026-10-21)

- `detect-place` (POST `{caption, videoUrl?}`) answers in this order, cheapest first: venues already confirmed for the same video link (`video_reviews`) → the 7-day result cache for that link (`search_cache`, key `share:v1:<url>`; 1 day when nothing was found) → rules over the caption → known venues → at most 2 map searches. The response carries `source` (`shared-before`, `cache`, `known`, `caption-search`, `no-venue-signal`) and `signals` (`names`, `cities`, `hasVenue`); suggestions always need the person's confirmation.
- Rules (`_shared/captionSignals.js`, shared by Deno and Node): venue names after a type word ("Quán cà phê Bình Minh Ơi"), before an English type ("Mê Linh Coffee Garden"), a dish + proper name ("Bánh Xèo 7 Tới"), honorifics ("chú 7 Tới"), 📍 pins, "Địa chỉ:" and house numbers, and the city. Captions that name no venue ("10 món ngon Hà Nội") skip the map search; `/share` then says so and leaves the fields to the person. Keywords keep their accents ("quận" ≠ "quán", "phố" ≠ "phở").
- Known venues (`known_places`, `place_aliases`; migrations `20261021090000_share_place_memory.sql`, `20261021090500_known_places_seed.sql` with 581 seed venues): matched by distinctive name only (two words, six letters, not generic) and in the caption's city; coordinates resolved once and stored. Publishing a share calls `remember_share_place` (authenticated, security definer), which counts the confirmation and stores the words the caption used as aliases. Tables have no API grants.
- `verify-place` (typed name) puts known venues first, then the map search.
- Offline evaluation (`node scripts/eval-caption-signals.js`, `scripts/eval-known-places.js`; held-out test split): rules detect 81.6% of captions that name a venue with the right name in 78.2%, and skip 93.3% of captions that name none. Known venues recognise 73% of venue captions with no false matches (optimistic: the seed list is where those captions were crawled from). Tests: `test/shareSignals.test.js`.
- Verified live: no-venue caption → `no-venue-signal`, no search; "Bánh Xèo 7 Tới … Cần Thơ" → `known` without a search; "📍 Quán Ốc Oanh 534 Vĩnh Khánh …" → `caption-search` with Quán Ốc Oanh; the same video link again → `cache`.
- Reading a pasted link (2026-10-21): TikTok's oEmbed no longer returns the caption, so `tiktok-oembed` also reads the video page (`__UNIVERSAL_DATA_FOR_REHYDRATION__`) for the caption, author and **location tag** (`poi`: name, address, city). `detect-place` puts the tagged venue first (`source: 'video-location'`; a known venue of that name, else one search for name + address). `youtube-oembed` adds the description from the Data API (`videos.list`, 1 quota unit, `YOUTUBE_API_KEY`): YouTube answers Supabase's servers with 403 / a "sorry" page for the watch page and the player endpoint. Descriptions are read warily (no dish + name rule there: playlist headings like "MÓN NGON TỪ CƠM NGUỘI"); names from the title come first. Cache key is now `share:v2:<url>`. Facebook and Instagram links still need the venue typed in. Verified live: TikTok with a tag → "Mộc quán Seafood Đà Nẵng"; TikTok without venue → no search; YouTube "Bánh Xèo 7 Tới" with its description → known venue; YouTube recipe video → no search; youtu.be short link → same cache entry.
- Spoken names and city tags (2026-10-21): a TikTok location tag of type city/district ("Thu Dau Mot" — "Địa điểm và địa chỉ / Thành phố") is no longer taken as the venue; it becomes `area`, the place to search in. `tiktok-oembed` also returns `transcript`, TikTok's automatic subtitles (WebVTT, Vietnamese first, only from TikTok hosts), and `spokenNames()` picks the names reviewers say: "quán có tên là khét BBQ nha", "tên quán là Bếp Nhà Mây" (stop words matched with accents: "nha" ends a name, "Nhà" does not). Cache key `share:v3:`. Verified live: tam.didau's riverside video (caption names no venue, city tag only) → "KHÉT BBQ", 10.976, 106.649 on the Bạch Đằng river in Thủ Dầu Một (addresses there now read "Hồ Chí Minh" after the 2025 merger).
- Place details and FoodTrip's own venue data (2026-10-21): on `/share`, every suggested venue and every published post with a map location has "Xem chi tiết quán", which opens `PlaceDetailsDrawer` — the same `MapPlacePreview` panel as Explore and Nearby (Google rating, reviews, hours, phone, Street View, related videos) over a map of the venue (no route bar there). Migration `20261021110000_known_places_details.sql` adds Google's details to `known_places` (category, rating, rating_count, phone, website, price_level, hours, thumbnail_url, maps_url, details_at) and a `search` source. Every venue found by `detect-place`, `verify-place` or `place-details` is stored (`saveFound`, Google ids only; confirmed rows keep their source and confirmations). `place-details` answers from stored venues within 400 m with details under 30 days old (`source: 'stored'`), so a venue looked up once on any page is not searched again. Verified live: KHÉT BBQ stored with rating 4.0 / 232 reviews / 7 hour rows / phone / photo; place-details for it → `stored`; Phở Thìn Lò Đúc → `search` (3.1 s) then `stored` (0.6 s). Drawer rendered in the dev build with no console errors; Escape closes it.
- Videos with many venues, and itineraries (2026-10-21): `listedPlaces()` reads description lists ("- 00:50 Phở Khôi - 50 Hàng Vải…", "1/ Cáp treo Hòn Thơm", short lines under "Trong video có:"), every 📍 pin, up to 8 names; a listed address goes into the query and `sameHouse()` prefers the branch at that house number (a known venue answers a name only at that address). A video naming ≥3 venues gets one search each (at most 8, ~3 credits each, cached `share:v4:` for 7 days). `detect-place` returns `mentions` ([{ said, placeId, address }]) and, when the text reads as someone's route (`_shared/videoPlan.js` `readPlan`: "lịch trình / food tour / 3N2Đ", "Ngày 1 / hôm sau", "sáng / trưa / tối / 7h30"), a `plan` of days and times. `/share` shows "Video nhắc: …" on each suggestion, warns when the video gives another address, offers "Chọn N quán khớp tên", and for a plan shows `VideoPlanCard`: each day's stops (name-matching ones ticked), people, budget, transport, and "Tạo kế hoạch giống video", which fills in Google details for venues without them (`withDetails`, via place-details), stores the venues as custom places and saves a normal itinerary (`saveVideoPlan`), opened at `/trips?open=<id>`. Verified live: "Du Lịch Huế 2 Ngày" → Ngày 1 19:00 Cơm niêu Chạn → 20:00 Phố tây Huế; Ngày 2 07:30 Cơm hến Hoa Đông → 08:30 Phá Tam Giang (Tham quan); "TOP 6 quán Hoàn Kiếm" → 6 venues, not a plan (Chả cá Thăng Long's listed 6B Đường Thành has no Google listing, so the 17A branch is offered with the address warning). Card and ticket rendered in the dev build; saving needs a signed-in account and was not run. Tests: `test/videoPlan.test.js`.
- Honest prices on trips (2026-10-21): Serper's Google Maps results carry no price for Vietnamese venues (16/16 restaurants sampled around Hoàn Kiếm had none), yet every live-search stop showed the default "20.000đ – 60.000đ". `pricing.js` now has `placePrice()` (curated tier range, else Google's own `priceLevel`, else "Chưa có giá") and `knownClosingTime()` (curated hours or Google's weekly hours; the always-open placeholder is no longer shown as "Mở đến 24:00"); `isCuratedPlace()` tells curated places from live ones. Used by `ItineraryTicket` and the Excel export (which also no longer prints the Track-Asia placeholder rating 4; it uses the stop's real Google rating). Custom destinations (`citySearch.js`) get `price: null` instead of a placeholder tier, so the budget criterion is skipped rather than calling every venue "giá bình dân". Tests: `test/pricing.test.js`.
- Share page status and TikTok photo posts (2026-10-21): "Tìm quán từ video" and "Tìm địa điểm trên bản đồ" show a spinner on the button and, right under it, the steps (reading the video: title / description / speech / location tag → finding the places on the map) with the seconds elapsed (`ActionProgress`, `useElapsed`); the result or error appears under the button that asked (`ActionResult`), other notices stay at the top. TikTok photo posts (`/@user/photo/<id>`) are accepted and stored at their `/video/<id>` address, where TikTok's page carries the post data (the photo address does not); the photo post's own title is read as part of the caption, and TikTok's suggested searches (`hints`) are offered as one-tap searches when TikTok returns them (it does not from Supabase's server region, so usually only the "photo post: names are on the photos" notice shows).
- Every source a video offers (2026-10-21): besides caption, description, location tag and speech, the share flow now reads
  - **comments** (TikTok's public comment list, first 50 with reply previews). Only the creator's own and pinned comments, and replies to "xin địa chỉ / quán gì" count: other viewers name other places or advertise their own. Example: "Dạ. Lai thieu 97. Phường Lái Thiêu".
  - **names said in passing** ("quán nhà kho này nằm ở …") and **addresses said aloud** ("đường lái thiêu 97").
  - **hashtags** that spell a name (#nhakho confirms "nhà kho"; it is a last-resort query, together with an address).
  - **text on the pictures** (a photo post's photos, the video cover, the YouTube thumbnail) via Google Cloud Vision, `_shared/screenText.ts`. Vision is not enabled for the project's Google keys yet (SERVICE_DISABLED). Until it is, this step answers nothing and stops asking for an hour.
  - With one or two venues, the address found goes into the query ("nhà kho, 97 lái thiêu, Bình Dương"); the city is added only when the address does not already name it. Cache key `share:v5:`.
  - Verified live: @diiubinhduong's video (caption names no venue) → "Nhà Kho - Lẩu & Nướng, Lái Thiêu 97". KHÉT BBQ, Mộc quán and the Huế itinerary are unchanged. The photo post stays "no venue" (its places are only on the photos). Tests: `test/videoSources.test.js`.

## FoodTrip assistant: website help and trip requests (2026-10-22)

- Chat on every page (`src/components/assistant/AssistantChat.jsx`, in `Layout`) and the planner's "Điền tự động" share one reader. The Edge Function `assistant` (POST `{message, lang}` / `{feedback:{id, helpful}}`) reads a message's intent and slots. It uses the trained model on a Hugging Face Space (`ASSISTANT_MODEL_URL`, `ASSISTANT_MODEL_TOKEN`; trusted only at confidence ≥ 0.6 and within 6 s), else the rules (`_shared/assistant/rules.js`).
- **Answers are FoodTrip's own** (`_shared/assistant/intents.js`, 17 intents: plan / modify plan / find food / booking how, payment, cancel & refund, status / tour / share video / saved trips / reviews / account / partner / contact / greeting / thanks / out of scope). They state the rules the site implements: 30-minute room hold, SePay QR or VNPay, the refund tiers, the 48-hour tour confirmation, reviews within 180 days, the 4-step partner sign-up. Each answer links to the page that does it (tested against the routes).
- **Trip requests:** a trip request shows the fields read (`planFields`: the planner's patterns plus the model's slots for what they miss). "Mở trang Lịch trình" opens `/plan` with the request, which is filled in and read once (`location.state.assistantRequest`).
- **Message storage:** messages are kept in `assistant_messages` (migration `20261022090000`; no user id; phone numbers and emails redacted; service role only) with 👍/👎, as the next training round's data.
- **Training:** see `ml/assistant/README.md`.
  - Data: 3,376 / 506 / 486 template rows (test = unseen phrasings and destinations) plus 100 hand-written messages.
  - Rule baseline: 82.9% (test) and 73.0% (hand-written) intent accuracy.
  - Model: PhoBERT joint intent + BIO slots, Colab notebook `ml/notebooks/train_assistant.ipynb`, ONNX served by `ml/assistant/space`.
- **Verified:**
  - Edge Function live: intents, answers, phone redaction, feedback.
  - Browser (guest): chat opens, the suggestion "Lên lịch 2 ngày ở Đà Lạt, 2 người, 3 triệu" shows Đà Lạt / 2 ngày / 2 người / 3.000.000đ and opens the planner on "Thời gian & ngân sách" with those values; an unaccented refund question gets the refund answer; a tour question links to the planner and "Tour của tôi".
  - Test messages were deleted afterwards.
- **Computed answers and conversation (2026-10-22).** The chat remembers the trip being talked about (planner fields). Follow-ups are about it: "bạn nghĩ chi phí sẽ là bao nhiêu" after "Lên lịch 2 ngày ở Hà Nội" is about Hà Nội, and "3 người thì sao" updates it. A destination changes only when the message names it. Three new intents are answered by computing in the browser (`src/lib/assistantAnswers.js`):
  - `estimate_cost`: room cost from the middle range of real quoted rates (`searchHotelsForCity`, `hasRealPrice`) × nights × rooms, and food from the price tiers of FoodTrip's places in that city × 3 meals a day. It says what it assumed and what it does not count, and compares with the stated budget.
  - `ask_weather`: the Open-Meteo forecast within 16 days, else the regional season.
  - `place_info`: `place-details` hours, address, rating and phone, with a "Xem chi tiết quán" drawer.
  - Dates come from `src/lib/tripDates.js`, tested ("cuối tuần này", "20/11", "tháng 12"; "Mai Châu" is not tomorrow).
  - Verified in the browser: Hà Nội 2 ngày → cost from 24 real hotel rates and 3 Hà Nội places; 3 người → trip updated; "thời tiết bên đó cuối tuần này" → Hà Nội forecast from 24/10.
- **FAQ answers (direction A).** `_shared/assistant/faq.js` holds 49 specific answers with ways of asking.
  - `composeReply` answers outright when a FAQ entry matches surely: the trained retriever's threshold, or score ≥ 0.5 for word matching, which is 86% right at that score. Otherwise it gives the intent's answer and offers up to 2 "Có thể bạn muốn hỏi" questions, whose own answer shows on tap.
  - Data: `node scripts/generate-faq-dataset.js` (366 training questions, 49 validation, 85 test including 37 hand-written). Word-matching baseline: top-1 54.1%, top-3 84.7%.
  - Retriever: `ml/assistant/train_retriever.py` fine-tunes `bkai-foundation-models/vietnamese-bi-encoder` with in-batch negatives. Its answer-outright threshold is chosen on validation for 90% precision. It is exported to ONNX, served as `POST /answer` on the same Space and used by the Edge Function when present.
- **Support round (2026-10-28).** Migration `20261028090000_assistant_handoff_review.sql`.
  - **The person's own bookings.** When signed in, `booking_status`, `booking_payment`, `booking_cancel_refund` and `tour_info` also answer from their own data (`src/lib/assistantAccount.js`, read under RLS). Each booking shows where it stands: minutes left of the 30-minute hold, paid / confirmed / declined by the hotel, refund under way. Pending bookings get a "Thanh toán" link to `/pay/:id`, and paid ones show what cancelling now refunds (`booking_refund_quote`). Guests are offered sign-in instead.
  - **Asking back.** When a computed answer lacks the destination or the place, the assistant asks only for what is missing ("Bạn định đi đâu?"). The next message is read as the answer if it names a place (`answersPending`); a new question, a sure FAQ match or a thank-you is not.
  - **Finding food.** "Quán phở ngon ở Hà Nội" (`find_food` with a dish, `askedDish`) returns 3 real places, ranked by Google rating weighted by review count, each with a details drawer. It makes one page of Google Maps search around the city's centre; a city name without a point returns nothing from Serper.
  - **Hand-off to a person.** "Gặp nhân viên hỗ trợ" (always in the footer; offered after 👎, a `contact_support` question or two out-of-scope answers in a row) sends a contact message with `source = 'assistant'`, the page and the conversation (≤ 30 turns, 500 characters each). Admin → Liên hệ shows it with the transcript. A sender can attach only their own account (insert policy).
  - **Page-aware suggestions** (`src/lib/assistantSuggestions.js`). Each one is read as the intended intent by the rules alone (tested). The conversation is kept per tab (`sessionStorage`) and can be restarted.
  - **Admin → Trợ lý.** Messages that got 👎, were out of scope or below 60% confidence, or are not reviewed yet. Shows the share rated helpful, the share read by the model, and how many are reviewed. The admin sets the correct intent ("Đúng rồi" or a choice) or deletes the message. "Xuất JSONL đã duyệt" exports `{text, intent, predicted, helpful}` for the next labelling round. Only admins can read; authenticated users may update only `reviewed_intent` and `reviewed_at`.
  - **Rules:** "quán X ngon", "X ngon ở", "được duyệt" and paying for a tour (→ `tour_info`) were added; the baseline is unchanged at 76.8% / 76.4%.
  - **Verified in the browser (guest):**
    - `/bookings` suggestions; a status question gets a sign-in offer.
    - "3 ngày 2 người hết bao nhiêu tiền?" → "Đà Lạt" → estimate for 2 people, 3 days.
    - Phở in Hà Nội → Phở Gà Huyền Hương 4.7★ (5,345), with a working drawer.
    - The conversation survives navigation.
    - The hand-off form is prefilled.
  - **Verified in the database:** insert and read rights. Test messages were deleted afterwards.
