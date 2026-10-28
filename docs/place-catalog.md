# Persistent place catalogue

## Planner integration

The itinerary engine loads the saved catalogue before expanding a curated city's
candidate pool. It filters by destination, merges sample/live/DB venues, and
scores them using the existing preference, rating, popularity, budget and route
logic. Google rating/count fields are retained for the generator and replacement
picker. Unknown prices/hours remain unknown. The candidate list is passed back
to the planner so swapping a stop offers DB venues too.

Custom-destination searches also merge matching DB venues before the traveller
selects places; generation respects exclusions from that selection. DB failures
fall back to available candidates and are reported in the itinerary result.

Generated and saved stops include a public place snapshot for non-seed venues.
Saved/shared itineraries and live-trip rooms restore those snapshots after a
reload, without depending on a transient in-memory registry or another paid
provider lookup.

Checks: `node --test test/plannerCatalog.test.js` and
`node scripts/check-planner-catalog.mjs` (reads the linked DB and exercises the
actual scoring engine with route/enrichment networking disabled).

Explore previously read `PLACES` from `src/data/destinations.js`. Link/name
searches already wrote Google venues to `known_places`, but Explore did not read
that table. The catalogue now merges the sample entries with persisted venues.

- `detect-place` and `verify-place` await storing their search results and return
  `catalogueSaved`. A repeated Google ID updates one row. Duplicate candidates in
  the same request are deduplicated before upsert. Lookup errors are not reported
  as successful saves. Old cached link results are also persisted when reopened.
- A newly located known seed is saved with its Google listing facts before it
  is returned. No fire-and-forget write can disappear with the Edge invocation.
- `place_catalog` is a read-only, security-definer RPC with bounded keyset pages.
  It exposes public venue facts only; tables, aliases and browser write access
  stay restricted. Entries without coordinates or with synthetic `map:` IDs do
  not enter the map catalogue.
- Explore loads the RPC on mount, refresh and window focus. It combines stored
  places with live search results, keeps local text/city filters on saved places,
  and avoids duplicate Google IDs or an exact venue/address overlapping a sample.
  Real Google scores are kept separate from illustrative sample scores.
- Discovering a venue stores it without publishing a social post. The user still
  chooses which venue a video actually depicts before publishing. Free-text
  guesses with no map identity are not promoted to the public catalogue.

Deploy migration `20261028110000_public_place_catalog.sql` and the updated
`detect-place` / `verify-place` functions, then use the updated frontend.

Checks: `node --test test/placeCatalog.test.js`, `npm run lint`, `npm run build`.
`node scripts/check-place-catalog.mjs <public YouTube URL>` verifies real link
lookup, database visibility, and one row per Google ID after repeating the lookup.
This lookup writes genuine discovered venues to the project's catalogue.

On 2026-10-28, the migration and both functions were deployed to the linked
Supabase project. A real public Bánh Mì Phượng YouTube link increased the public
catalogue from 33 to 34 located venues; reopening it preserved exactly one row
for the identified Google ID.
