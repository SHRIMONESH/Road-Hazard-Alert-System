import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getRouteLine } from '@/app/lib/routing'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  const startLat = parseFloat(searchParams.get('start_lat') || '')
  const startLng = parseFloat(searchParams.get('start_lng') || '')
  const endLat = parseFloat(searchParams.get('end_lat') || '')
  const endLng = parseFloat(searchParams.get('end_lng') || '')

  if (
    Number.isNaN(startLat) ||
    Number.isNaN(startLng) ||
    Number.isNaN(endLat) ||
    Number.isNaN(endLng)
  ) {
    return new NextResponse('Missing or invalid start/end coordinates', { status: 400 })
  }

  const routeGeoJSON = getRouteLine(
    { lat: startLat, lon: startLng },
    { lat: endLat, lon: endLng },
  )

  const { data, error } = await supabase.rpc('get_hazards_within_route', {
    route_geojson: routeGeoJSON,
  })

  if (error) {
    console.error('Error fetching hazards:', error)
    return new NextResponse(error.message, { status: 500 })
  }

  return NextResponse.json({
    route: routeGeoJSON,
    hazards: data ?? [],
  })
}

export async function POST(request: Request) {
  const { routeGeoJSON } = await request.json()

  if (!routeGeoJSON) {
    return new NextResponse('Missing routeGeoJSON', { status: 400 })
  }

  const { data, error } = await supabase.rpc('get_hazards_within_route', {
    route_geojson: routeGeoJSON,
  })

  if (error) {
    console.error('Error fetching hazards:', error)
    return new NextResponse(error.message, { status: 500 })
  }

  return NextResponse.json(data)
}
