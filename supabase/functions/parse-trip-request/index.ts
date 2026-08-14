import { jsonResponse, handleOptions } from '../_shared/cors.ts'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-5'

const SYSTEM_PROMPT = `You help a Vietnamese food-and-travel app turn a free-text trip request into structured planner fields.
Extract, only when actually mentioned or clearly implied:
- destinationQuery: the destination as the user described it — a specific city/place name if named (e.g. "Đà Lạt", "Vũng Tàu"), or a short theme in Vietnamese if only a type of place was mentioned (e.g. "biển", "núi", "phố cổ"). Null if nothing about destination is mentioned.
- duration: number of days, integer 1-14. Null if not mentioned.
- budgetPerPerson: an estimated VND amount per person per day as an integer (e.g. "dưới 2 triệu" -> 2000000, "khoảng 1tr5" -> 1500000). Null if not mentioned.
- people: number of travelers, integer. Null if not mentioned.
- transport: one of "bike","car","walk","taxi" if mentioned, matching Vietnamese terms like "xe máy"->bike, "ô tô"/"xe hơi"->car, "đi bộ"->walk, "taxi"/"grab"->taxi. Null otherwise.
- prefs: array of zero or more values from exactly this set: ["seafood","vegetarian","coffee","oldtown","nightlife","nature"], matching stated interests (hải sản->seafood, ăn chay->vegetarian, cà phê->coffee, phố cổ->oldtown, về đêm/bar->nightlife, thiên nhiên->nature). Empty array if none mentioned.
Never invent details the user didn't state or imply. Respond with strict JSON only, no prose, in exactly this shape:
{"destinationQuery": string|null, "duration": number|null, "budgetPerPerson": number|null, "people": number|null, "transport": string|null, "prefs": string[]}`

async function parseTripRequest(text: string) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return { error: 'missing-api-key' }
  if (!text?.trim()) return { error: 'missing-text' }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [{ type: 'text', text }] }],
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
    return {
      destinationQuery: parsed.destinationQuery ?? null,
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
    const { text } = await req.json()
    if (!text) return jsonResponse({ error: 'missing-text' }, { status: 400 })
    const parsed = await parseTripRequest(text)
    return jsonResponse(parsed)
  } catch (err) {
    console.error('parse-trip-request failed:', (err as Error).message)
    return jsonResponse({ error: 'parse-failed', message: (err as Error).message }, { status: 502 })
  }
})
