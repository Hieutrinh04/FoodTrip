import { jsonResponse, handleOptions } from '../_shared/cors.ts'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-5'

type CityCandidate = { id: string; name: string; themes?: string }
type PlaceCandidate = { id: string; name: string; city: string; category: string }

const SYSTEM_PROMPT = `You help a Vietnamese food-and-travel app turn a free-text trip request into structured planner fields.

The user message contains the request and, when available, a GROUNDING block: candidate destinations (cityCandidates) and candidate places (placeCandidates) retrieved from the app's own database. Use it to answer with the app's own ids.

Extract, only when actually mentioned or clearly implied:
- cityId: the id of the ONE cityCandidate the request clearly refers to (by name, or by an unambiguous theme match). Null if the request names a place not in cityCandidates, or is too vague to choose.
- destinationQuery: the destination as the user described it — a specific city/place name if named (e.g. "Vũng Tàu"), or a short theme in Vietnamese if only a type of place was mentioned (e.g. "biển", "núi", "phố cổ"). Always fill this when a destination is mentioned, even if you also set cityId. Null if nothing about destination is mentioned.
- placeIds: array of ids from placeCandidates that the user EXPLICITLY named (e.g. "ăn ở Lẩu Gà Lá É Tao Ngộ"). Empty array otherwise — do not include places just because they fit the theme.
- duration: number of days, integer 1-14. Null if not mentioned.
- budgetPerPerson: an estimated VND amount ONE traveller spends across the WHOLE trip, as an integer (e.g. "dưới 2 triệu" -> 2000000, "khoảng 1tr5" -> 1500000). If the user gives a per-day figure ("1 triệu mỗi ngày"), multiply it by the number of days. If they give a figure for the whole group ("cả nhóm 10 triệu"), divide by the number of travellers. Null if not mentioned.
- people: number of travelers, integer. Null if not mentioned.
- transport: one of "bike","car","walk","taxi" if mentioned, matching Vietnamese terms like "xe máy"->bike, "ô tô"/"xe hơi"->car, "đi bộ"->walk, "taxi"/"grab"->taxi. Null otherwise.
- prefs: array of zero or more values from exactly this set: ["seafood","vegetarian","coffee","oldtown","nightlife","nature"], matching stated interests (hải sản->seafood, ăn chay->vegetarian, cà phê->coffee, phố cổ->oldtown, về đêm/bar->nightlife, thiên nhiên->nature). Empty array if none mentioned.
Never invent details the user didn't state or imply. Respond with strict JSON only, no prose, in exactly this shape:
{"cityId": string|null, "destinationQuery": string|null, "placeIds": string[], "duration": number|null, "budgetPerPerson": number|null, "people": number|null, "transport": string|null, "prefs": string[]}`

function groundingBlock(cityCandidates: CityCandidate[], placeCandidates: PlaceCandidate[]) {
  if (!cityCandidates?.length && !placeCandidates?.length) return ''
  return `\n\nGROUNDING (from the app database):\ncityCandidates: ${JSON.stringify(cityCandidates ?? [])}\nplaceCandidates: ${JSON.stringify(placeCandidates ?? [])}`
}

async function parseTripRequest(text: string, cityCandidates: CityCandidate[] = [], placeCandidates: PlaceCandidate[] = []) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return { error: 'missing-api-key' }
  if (!text?.trim()) return { error: 'missing-text' }

  const validCityIds = new Set((cityCandidates ?? []).map((c) => c.id))
  const validPlaceIds = new Set((placeCandidates ?? []).map((p) => p.id))

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 320,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [{ type: 'text', text: `Request: "${text}"${groundingBlock(cityCandidates, placeCandidates)}` }] }],
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Anthropic API ${response.status}: ${errText.slice(0, 200)}`)
  }

  const json = await response.json()
  const raw = json.content?.[0]?.text ?? '{}'
  try {
    const parsed = JSON.parse(raw)
    // The model can only echo ids we gave it — anything else is a hallucination.
    const cityId = validCityIds.has(parsed.cityId) ? parsed.cityId : null
    const placeIds = Array.isArray(parsed.placeIds) ? parsed.placeIds.filter((id: string) => validPlaceIds.has(id)) : []
    return {
      cityId,
      destinationQuery: parsed.destinationQuery ?? null,
      placeIds,
      duration: parsed.duration ?? null,
      budgetPerPerson: parsed.budgetPerPerson ?? null,
      people: parsed.people ?? null,
      transport: parsed.transport ?? null,
      prefs: Array.isArray(parsed.prefs) ? parsed.prefs : [],
    }
  } catch {
    return { error: 'unparseable-response' }
  }
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const { text, cityCandidates, placeCandidates } = await req.json()
    if (!text) return jsonResponse({ error: 'missing-text' }, { status: 400 })
    const parsed = await parseTripRequest(text, cityCandidates, placeCandidates)
    return jsonResponse(parsed)
  } catch (err) {
    console.error('parse-trip-request failed:', (err as Error).message)
    return jsonResponse({ error: 'parse-failed', message: (err as Error).message }, { status: 502 })
  }
})
