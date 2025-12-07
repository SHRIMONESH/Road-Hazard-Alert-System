-- Function to cluster recent detections and upsert them into the hazard_clusters table
CREATE OR REPLACE FUNCTION cluster_recent_detections(eps_meters double precision, min_points integer)
RETURNS void AS $$
BEGIN
    WITH recent_detections AS (
        SELECT geom, confidence, captured_at, image_url
        FROM mapillary_detections
        WHERE captured_at > (SELECT last_run_at FROM ingestion_state WHERE id = 1)
    ),
    clustered_points AS (
        SELECT
            geom, confidence, captured_at, image_url,
            ST_ClusterDBSCAN(geom, eps := eps_meters / 111320.0, minpoints := min_points) OVER () as cluster_id
        FROM recent_detections
    ),
    cluster_aggregates AS (
        SELECT
            cluster_id,
            ST_Centroid(ST_Collect(geom)) as centroid,
            COUNT(*) as count_detections,
            AVG(confidence) as avg_confidence,
            MIN(captured_at) as first_seen,
            MAX(captured_at) as last_seen,
            ARRAY_AGG(image_url) as evidence_urls
        FROM clustered_points
        WHERE cluster_id IS NOT NULL
        GROUP BY cluster_id
    ),
    clusters_with_roads AS (
        SELECT
            ca.*,
            ow.way_id as osm_way_id,
            ow.highway
        FROM cluster_aggregates ca
        CROSS JOIN LATERAL (
            SELECT way_id, highway
            FROM osm_ways
            ORDER BY ca.centroid <-> osm_ways.geom
            LIMIT 1
        ) ow
    )
    INSERT INTO hazard_clusters (centroid, osm_way_id, first_seen, last_seen, count_detections, avg_confidence, evidence_urls, score, status)
    SELECT
        cwr.centroid,
        cwr.osm_way_id,
        cwr.first_seen,
        cwr.last_seen,
        cwr.count_detections,
        cwr.avg_confidence,
        cwr.evidence_urls,
        -- Enhanced scoring logic
        LEAST(1.0, -- Clamp score to a max of 1.0
            (
                (LEAST(cwr.count_detections / 10.0, 1.0) * 0.45) + -- count_score
                (cwr.avg_confidence * 0.35) + -- confidence_score
                (EXP(-EXTRACT(EPOCH FROM (NOW() - cwr.last_seen)) / (7 * 24 * 3600)) * 0.2) -- recency_score
            ) * CASE
                WHEN cwr.highway IN ('trunk', 'primary', 'secondary') THEN 1.2
                ELSE 1.0
            END -- road_factor
        ) as score,
        'ACTIVE'
    FROM clusters_with_roads cwr
    ON CONFLICT (cluster_id) DO UPDATE SET
        last_seen = EXCLUDED.last_seen,
        count_detections = hazard_clusters.count_detections + EXCLUDED.count_detections,
        avg_confidence = (hazard_clusters.avg_confidence * hazard_clusters.count_detections + EXCLUDED.avg_confidence * EXCLUDED.count_detections) / (hazard_clusters.count_detections + EXCLUDED.count_detections),
        evidence_urls = array_cat(hazard_clusters.evidence_urls, EXCLUDED.evidence_urls),
        score = LEAST(1.0, 
            (
                (LEAST((hazard_clusters.count_detections + EXCLUDED.count_detections) / 10.0, 1.0) * 0.45) +
                (((hazard_clusters.avg_confidence * hazard_clusters.count_detections + EXCLUDED.avg_confidence * EXCLUDED.count_detections) / (hazard_clusters.count_detections + EXCLUDED.count_detections)) * 0.35) +
                (EXP(-EXTRACT(EPOCH FROM (NOW() - EXCLUDED.last_seen)) / (7 * 24 * 3600)) * 0.2)
            ) * CASE
                WHEN (SELECT highway FROM osm_ways WHERE way_id = hazard_clusters.osm_way_id) IN ('trunk', 'primary', 'secondary') THEN 1.2
                ELSE 1.0
            END
        );
END;
$$ LANGUAGE plpgsql;

-- Function to get hazards within a certain distance of a route
CREATE OR REPLACE FUNCTION get_hazards_within_route(route_geojson jsonb)
RETURNS TABLE(cluster_id uuid, centroid jsonb, score double precision, count_detections integer, evidence_urls text[]) AS $$
BEGIN
    RETURN QUERY
    SELECT
        hc.cluster_id,
        ST_AsGeoJSON(hc.centroid)::jsonb,
        hc.score,
        hc.count_detections,
        hc.evidence_urls
    FROM hazard_clusters hc
    WHERE hc.status = 'ACTIVE'
      AND ST_DWithin(
          hc.centroid::geography,
          ST_GeomFromGeoJSON(route_geojson)::geography,
          50 -- Corresponds to ROUTE_BUFFER_METERS
      );
END;
$$ LANGUAGE plpgsql;
