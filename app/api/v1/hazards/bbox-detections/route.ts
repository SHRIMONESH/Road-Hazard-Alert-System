import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

// Fixed Chennai (T. Nagar) bbox, kept in sync with frontend
const BBOX = {
  lat_min: 13.035,
  lon_min: 80.225,
  lat_max: 13.065,
  lon_max: 80.255,
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('mapillary_detections')
      .select('id,image_id,lat,lon,feature_class,image_url,captured_at')
      .gte('lat', BBOX.lat_min)
      .lte('lat', BBOX.lat_max)
      .gte('lon', BBOX.lon_min)
      .lte('lon', BBOX.lon_max)
      .order('captured_at', { ascending: false })
      .limit(1000)

    if (error) {
      console.error('Error fetching bbox detections:', error)
      return new NextResponse(error.message, { status: 500 })
    }

    const detections = (data || []).map((d) => ({
      ...d,
      problem_title: formatFeatureClass(d.feature_class),
    }))

    return NextResponse.json({
      bbox: BBOX,
      detections,
    })
  } catch (err: any) {
    console.error('Unexpected error fetching bbox detections:', err)
    return new NextResponse('Internal server error', { status: 500 })
  }
}

function formatFeatureClass(featureClass: string | null): string {
  if (!featureClass) return 'Unknown';
  // Turn strings like "construction--flat--road" into a nicer label
  const cleaned = featureClass.replace(/--/g, ' > ').replace(/_/g, ' ')
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}
