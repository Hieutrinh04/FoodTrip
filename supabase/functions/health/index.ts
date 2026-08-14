import { jsonResponse, handleOptions } from '../_shared/cors.ts'

Deno.serve((req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  return jsonResponse({
    ok: true,
    hasAnthropicKey: Boolean(Deno.env.get('ANTHROPIC_API_KEY')),
    hasPlacesKey: Boolean(Deno.env.get('GOOGLE_PLACES_SERVER_KEY')),
    hasYoutubeKey: Boolean(Deno.env.get('YOUTUBE_API_KEY')),
    hasCustomSearchKey: Boolean(Deno.env.get('GOOGLE_CUSTOM_SEARCH_KEY') && Deno.env.get('GOOGLE_CUSTOM_SEARCH_CX')),
  })
})
