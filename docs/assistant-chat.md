# FoodTrip chat

## Conversation completion (2026-10-28)

Food search now reads the persistent place catalogue first, scopes it to the
requested destination and dish, then supplements with live search when needed.
A map-provider failure still returns matching saved venues. Asking for more
places retains the search's dish/destination and excludes previously shown IDs.

Numbered references (e.g. `đánh giá quán thứ hai`, `địa chỉ quán thứ ba`) resolve
against the last results list. `Quán đó` uses the last focused venue or asks for
clarification if ambiguous. The assessment reads the selected listing's reviews;
fact lookup uses that venue's address/coordinates to distinguish branches.
Comparisons show actual rating/count evidence and do not invent price or taste.
Suggested follow-up buttons appear after food searches and planning replies.

Planner handoff retains date phrases. A forecast fetch failure is no longer
presented as a date outside the forecast window. Account fetch failures are
explicit, and private account cards/hand-off confirmations are excluded from
session restoration. Changing accounts clears chat context and invalidates
in-flight replies. Browser fallback replies are labeled.

The linked server was inspected on 2026-10-28: neither `ANTHROPIC_API_KEY` nor
`ASSISTANT_CHAT_MODEL` was configured. The above behaviors work with application
data/rules. Generative prose remains optional and must not be described as live
until those server secrets are configured and an actual model call succeeds.

Regression suite: `node --test test/assistant*.test.js test/placeAssessment.test.js`.
Real API smoke check: `node scripts/check-assistant.mjs`. On 2026-10-28 the
updated assistant Edge Function was deployed and this check passed against the
linked project: food request → real venues from catalogue/search → numbered
reference → data assessment → switch to a refund FAQ. Local browser automation
was disabled in Work settings, so no new visual QA was completed in this round.

## Place assessment button

Map place previews (including the chat's detail drawer) and `/place/:id` have an
`AI đánh giá quán` button. The report appears inline, with loading/retry states.
It reuses the selected listing, loads Google review samples by that listing's
Google ID, and sends a bounded public evidence snapshot to the assistant's new
`{ placeAssessment, lang }` mode. Author names, contact information, seed scores
and illustrative reviews are excluded. The response is not stored in chat telemetry.

The existing `ANTHROPIC_API_KEY` and `ASSISTANT_CHAT_MODEL` secrets also enable
review-text synthesis here after the updated assistant function is deployed.
Without generation, a labeled data analysis remains available: aggregate stars,
sample counts, data limitations and a conditional recommendation. It does not
infer taste, food safety or personal suitability from star ratings.

Regression checks: `node --test test/placeAssessment.test.js`.

The chat now keeps trip details across turns, asks for one missing field at a time
(destination, duration, people), handles short answers such as `3`, and lets users
correct an earlier request without losing their trip. An explicit `chuyến đi mới`
starts a fresh trip. Weather, places, costs and personal bookings still come from
the existing application data functions. Failed sends have a retry action.

## Optional natural language generation

The backend also supports a self-hosted, self-trained generator before any separately
configured commercial provider. Set `ASSISTANT_GENERATOR_URL` (HTTPS base URL) and
`ASSISTANT_GENERATOR_TOKEN` only after hosting and reviewing the LoRA adapter.
The service accepts bounded redacted request/history and the existing grounded answer.
Incomplete output, links and changed numeric policy values fall back. These checks
do not prove semantic factuality; review generated samples before enabling it.
On 2026-10-30 this integration was deployed to the linked Supabase assistant function;
no trained model endpoint was enabled. See `ml/assistant/TRAINING-20261030.md`.

Deploy `supabase/functions/assistant` together with its shared modules. Configure
these **Supabase server secrets**, never VITE/browser variables:

- `ANTHROPIC_API_KEY`: the existing project's Anthropic key.
- `ASSISTANT_CHAT_MODEL`: a Messages API model ID available to that account.

Both must be set to enable generation. No model is silently selected. This uses
the paid Anthropic Messages API; configuring the dedicated model is the opt-in.
Reference: https://platform.claude.com/docs/en/build-with-claude/working-with-messages

The server gives the model FoodTrip's intent answers and relevant FAQ entries.
Its instructions require a direct, concise Vietnamese/English reply, at most
one clarification, exact policy conditions and no invented live facts or actions.
The model returns only text; links, cards, account access and planner actions
remain controlled by the application. Computed intents bypass generation.

At most 12 prior messages, 600 characters each, are forwarded. Email and phone
patterns are redacted; account cards, sign-in prompts and hand-off confirmations
are excluded. This is limited redaction, not comprehensive personal-data removal.
History is used transiently; only the existing redacted current-message telemetry
is stored. Do not place credentials or sensitive information in chat messages.

Provider failures, timeouts (6.5 seconds), incomplete output and generated URLs
fall back to the original FoodTrip answer. Without server configuration or network,
the browser uses the shared rules, FAQ and conversational trip handling.

## Validation

### Dining refinements (2026-10-30)

Food search now stores structured dining preferences with each search turn. Short
follow-ups such as `mình ăn chay`, `chỉ lấy từ 4,5 sao`, `ít nhất 100 lượt đánh giá`,
`đổi sang cà phê`, `ở Hà Nội thì sao?`, and `bỏ lọc sao` refine the existing search.
Changing venue type clears the old dish while keeping rating/review filters.
Additional-results requests keep the active criteria and exclude listed venues.

Catalogue and live results both enforce rating/review thresholds and venue type;
empty results never silently relax the filters. Vegetarian matching requires
name/description evidence and asks users to confirm ingredients/preparation.
Meal budget and open-now requests are recorded but explicitly unverified: no menu
price or current opening status is inferred from stars, price tiers or default hours.
A meal budget is kept separate from the planner's whole-trip budget.

The chat no longer assumes HCMC when the first request supplies no destination.
An empty filtered search cannot resolve a numbered reference against the preceding
list. Explicit weather, booking, tour, account and planning requests leave the food
refinement flow. These improvements run in the browser without a paid model call;
they do not train or enable a new language model.

Regression checks: `test/assistantFoodPreferences.test.js` plus existing assistant
conversation/place-context tests. Generative behavior still requires the server
configuration described above; this change does not configure or verify it.

`node --test test/assistant*.test.js`, `npm run lint`, `npm run build`.
Generation tests use a mocked provider: no real API charges or secrets needed.
Live model quality and latency must be checked after deploying and configuring
the server secrets. Suggested checks: ask a FAQ then `bao lâu vậy?`, ask for a
trip then supply `3` and `2`, change it to `4 ngày`, ask about weather/costs,
switch to a refund question, and send `bạn trả lời sai rồi`.

## Feature coverage (2026-11-03)

`test/assistantCoverage.test.js` holds one line per question people ask about each
site feature: the intent and FAQ entry it must reach. When a feature is added, add
its questions there and an entry in `faq.js`.

FAQ matching ignores city names. A near-exact FAQ phrasing outranks starting a plan,
and a written answer about planning does not start one. The browser also prefers its
own FAQ answer when an older server refuses or starts a plan, so most of this works
before `assistant` is redeployed; server telemetry only follows after deployment.

Payment answers add a note from the live SePay/VNPay status, so test mode and closed
payment are stated. The new FAQ entries are not in the retriever's training data until
the dataset is regenerated and the model retrained.
