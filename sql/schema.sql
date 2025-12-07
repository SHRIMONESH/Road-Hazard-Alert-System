-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA "public";

-- Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "public";

-- Table to store raw Mapillary detections
CREATE TABLE IF NOT EXISTS mapillary_detections (
    image_id TEXT PRIMARY KEY,
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    geom GEOMETRY(Point, 4326) NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL,
    feature_class TEXT,
    confidence DOUBLE PRECISION,
    image_url TEXT,
    raw_json JSONB
);

-- Table to store OSM road geometries
CREATE TABLE IF NOT EXISTS osm_ways (
    way_id BIGINT PRIMARY KEY,
    geom GEOMETRY(LineString, 4326) NOT NULL,
    highway TEXT,
    tags_json JSONB
);

-- Table to store aggregated hazard clusters
CREATE TABLE IF NOT EXISTS hazard_clusters (
    cluster_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    centroid GEOMETRY(Point, 4326) NOT NULL,
    osm_way_id BIGINT REFERENCES osm_ways(way_id),
    first_seen TIMESTAMPTZ NOT NULL,
    last_seen TIMESTAMPTZ NOT NULL,
    count_detections INT NOT NULL,
    avg_confidence DOUBLE PRECISION,
    score DOUBLE PRECISION,
    status TEXT DEFAULT 'ACTIVE',
    ttl_days INT DEFAULT 30,
    evidence_urls TEXT[],
    raw_json JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create a GIST index on the centroid for fast spatial queries
CREATE INDEX IF NOT EXISTS hazard_clusters_centroid_idx ON hazard_clusters USING GIST (centroid);

-- Table to track the state of the ingestion worker
CREATE TABLE IF NOT EXISTS ingestion_state (
    id INT PRIMARY KEY,
    last_run_at TIMESTAMPTZ
);

-- Insert initial ingestion state
INSERT INTO ingestion_state (id, last_run_at) VALUES (1, NOW() - INTERVAL '1 day') ON CONFLICT (id) DO NOTHING;
