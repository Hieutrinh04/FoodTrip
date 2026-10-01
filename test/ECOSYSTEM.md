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

