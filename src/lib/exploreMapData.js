// What the Explore map draws: one GeoJSON point per located place, carrying
// the figure its list card shows, and how nearby points gather into clusters.
// Plain JS, so it is tested without a browser.

import { scoreForCriterion } from './foodTripScore.js'

// Zoomed out over a city, a hundred pins melt into one blot; nearby places
// gather into a counted circle instead, and split apart again by zoom 14 —
// the zoom a selected place is shown at, so the selection is never hidden
// inside a cluster.
export const CLUSTER_SOURCE = { cluster: true, clusterMaxZoom: 13, clusterRadius: 46 }

export function toFeatureCollection(plotted, criterion, lang) {
  return {
    type: 'FeatureCollection',
    features: plotted.map(({ place, location }) => {
      // The list computes one figure per place for the active criterion; the
      // marker shows that same figure so a pin never disagrees with its card.
      const communityScore = scoreForCriterion(place, criterion)
      const shown = place.displayScore !== undefined
        ? place.displayScore
        : place.suitability ?? communityScore
      const badge = shown != null ? shown.toFixed(1) : ''
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [location.lng, location.lat] },
        properties: {
          id: place.id,
          name: place.name[lang] ?? place.name.vi,
          badge,
          // A place with nothing scorable at all falls back to a plain dot.
          hasBadge: badge ? 1 : 0,
        },
      }
    }),
  }
}
