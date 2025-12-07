export type LatLng = {
  lat: number
  lon: number
}

// Simple mocked routing: returns a straight line between start and end
export function getRouteLine(start: LatLng, end: LatLng) {
  return {
    type: 'LineString',
    coordinates: [
      [start.lon, start.lat],
      [end.lon, end.lat],
    ],
  }
}
