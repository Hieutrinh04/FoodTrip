# FoodTrip — completion audit, 2026-09-30

This is an implementation and verification record, not a claim that the entire
ecosystem is production-ready. Existing dirty-tree work was preserved.

## Completed in this pass

- Password recovery: login link, email request screen, Supabase recovery-event
  routing, password confirmation and invalid/expired-link screen (VI/EN).
  Query-string flags alone cannot authorize password reset. Auth session errors
  end loading and expose retry; late initial responses cannot overwrite auth events.
- Root rendering error boundary with reload/home recovery, without clearing storage.
- Hotel rooms: edit defaults, stop/reopen sales, reset overrides, preserve booking
  quotes and protect occupied inventory/capacity. Owner-only audited SQL RPCs.
- Tours: edit unpublished/unbooked core information; edit departure dates before
  booking, new-sale prices and capacity; preserve reservation prices, rich tour
  terms and history through an order snapshot.
- Booking screens: distinguish payment from hotel confirmation, no automatic
  refund promises, show query/cancellation failures, handle refunded payment state.
  Account-keyed screens prevent the previous account's loaded records persisting.
- Saved trips: load/delete/share failures are visible; delete/update calls must
  actually affect a row before success is shown. Public sharing can be revoked.
  Previously downloaded/viewed copies cannot be erased by revocation.
- Excel: includes chosen tours with Vietnam times, numeric quotes and a clear
  non-ticket disclaimer; unknown places are retained by ID instead of omitted.
- Newsletter requests recover from thrown network errors rather than remaining busy.

## Verification performed

- `npm test`: includes real PostgreSQL/WASM migration and permission tests plus
  in-memory XLSX round-trip tests (no test files uploaded or user orders created).
- `npm run lint`, `npm run build`.
- Browser: login → forgot-password, missing-token reset rejection, booking login
  gate; recovery page at 390px with no horizontal overflow. No reset email was sent
  and no real password was changed in QA.
- Live Supabase: only the two management migrations added in this pass were
  pushed; migration history and new RPC ACLs verified. No production test accounts,
  role grants, bookings, tours or payments created. See `ECOSYSTEM.md`.

## Required before calling the website complete for real customers

1. Confirm the production domain, hosting target, support contact and Supabase Auth
   Site URL / redirect allowlist. Include the exact `/reset-password` callback for
   each intended origin. Configure SMTP/email delivery and test a complete recovery
   using a dedicated test account controlled by the owner. Password recovery across
   an actual email has NOT been tested in this pass.
2. Provide authorized traveller/hotel-owner/staff/tour-owner/guide/admin test
   accounts in a named test environment. Run authenticated end-to-end scenarios,
   role switching, uploads and booking status changes without touching real guests.
3. Test last-room/last-seat contention with two independent PostgreSQL connections.
   The in-memory engine's single connection does not certify concurrent requests.
4. Tour checkout/payment/deposits/refunds/partner payouts still need implementation
   and agreed business rules. Hotel payment providers require sandbox callback,
   duplicate/late-payment and reconciliation tests before accepting real transfers.
   Pending holds currently do not expire automatically.
5. Non-managed hotel/provider estimates are not guaranteed contracted stock.
   Decide whether these remain discovery-only or connect an actual booking supplier
   before promising fulfilled bookings or accepting payment for them.
6. Supplier onboarding, cancellation/refund rules, privacy/retention rules, backups,
   support staffing and notification delivery need owner-approved operational setup.
7. Server-side pagination for large partner/catalogue datasets, complete English partner copy, restaurant/transport partners,
   commissions, and live guide tracking are not complete. These are separate product
   increments, not implied by the management migrations deployed here.

The build still reports large JavaScript chunks (notably map rendering). Passing
build/unit checks does not certify map provider latency, external APIs or live GPS.
