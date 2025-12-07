-- Enable Row Level Security (RLS) for all tables
ALTER TABLE public.mapillary_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.osm_ways ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hazard_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_state ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Allow public read access" ON public.mapillary_detections;
DROP POLICY IF EXISTS "Allow public read access" ON public.osm_ways;
DROP POLICY IF EXISTS "Allow public read access" ON public.hazard_clusters;
DROP POLICY IF EXISTS "Allow full access for service_role" ON public.mapillary_detections;
DROP POLICY IF EXISTS "Allow full access for service_role" ON public.osm_ways;
DROP POLICY IF EXISTS "Allow full access for service_role" ON public.hazard_clusters;
DROP POLICY IF EXISTS "Allow full access for service_role" ON public.ingestion_state;

-- Create policies for read-only access for anonymous users
CREATE POLICY "Allow public read access" ON public.mapillary_detections
    FOR SELECT USING (true);

CREATE POLICY "Allow public read access" ON public.osm_ways
    FOR SELECT USING (true);

CREATE POLICY "Allow public read access" ON public.hazard_clusters
    FOR SELECT USING (true);

-- Create policies to allow service_role to bypass RLS
-- This gives the backend and ingestion worker full access
CREATE POLICY "Allow full access for service_role" ON public.mapillary_detections
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow full access for service_role" ON public.osm_ways
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow full access for service_role" ON public.hazard_clusters
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow full access for service_role" ON public.ingestion_state
    FOR ALL USING (auth.role() = 'service_role');
