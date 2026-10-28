# FoodTrip chat

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

`node --test test/assistant*.test.js`, `npm run lint`, `npm run build`.
Generation tests use a mocked provider: no real API charges or secrets needed.
Live model quality and latency must be checked after deploying and configuring
the server secrets. Suggested checks: ask a FAQ then `bao lâu vậy?`, ask for a
trip then supply `3` and `2`, change it to `4 ngày`, ask about weather/costs,
switch to a refund question, and send `bạn trả lời sai rồi`.
