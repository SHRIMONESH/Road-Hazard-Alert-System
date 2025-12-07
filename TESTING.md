# Testing & Acceptance Scenarios

This document provides a set of concrete tests to validate the functionality of the Road Hazard Alert System.

## Phase 8 — Testing & Acceptance

### 1. OSRM Route Test

*   **Purpose:** Verify that the OSRM public API is reachable and returns a valid route.
*   **Inputs:**
    *   Start coordinates: `latitude=13.0094`, `longitude=77.5946`
    *   End coordinates: `latitude=13.0358`, `longitude=77.5970`
*   **Action:**
    *   Open the following URL in your browser or use a tool like `curl`:
        ```
        https://router.project-osrm.org/route/v1/driving/77.5946,13.0094;77.5970,13.0358?overview=full&geometries=geojson
        ```
*   **Expected Result:**
    *   A JSON response containing a `routes` array. The `geometry` field of the first route should be a GeoJSON LineString.

### 2. Ingestion Manual Run

*   **Purpose:** Ensure the ingestion worker can run successfully and create new hazard clusters.
*   **Action:**
    1.  Go to your GitHub repository.
    2.  Navigate to the **Actions** tab.
    3.  Select the **Ingestion Workflow**.
    4.  Click on **Run workflow** and then the **Run workflow** button.
*   **Expected Result:**
    *   The workflow should complete successfully. Check the logs for any errors.
    *   In your Supabase SQL Editor, run `SELECT * FROM public.hazard_clusters ORDER BY created_at DESC LIMIT 10;` to verify that new rows have been inserted.

### 3. Realtime Smoke Test

*   **Purpose:** Confirm that the frontend is correctly subscribed to database changes and displays new hazards in real-time.
*   **Inputs:**
    *   A route drawn on the frontend map within the area of the test point.
    *   Test point coordinates: `longitude=77.5950`, `latitude=13.0200`
*   **Action:**
    1.  Run the application locally (`npm run dev`) and draw a route on the map that passes near the test point.
    2.  In your Supabase SQL Editor, run the following command to insert a test hazard:
        ```sql
        INSERT INTO hazard_clusters (cluster_id, centroid, first_seen, last_seen, count_detections, avg_confidence, score, status)
        VALUES (gen_random_uuid(), ST_SetSRID(ST_MakePoint(77.5950,13.0200),4326), now(), now(), 4, 0.9, 0.75, 'ACTIVE');
        ```
*   **Expected Result:**
    *   A new marker should appear on the map on the frontend almost instantly, without needing to refresh the page.

### 4. End-to-End Test (Real Data)

*   **Purpose:** A full system test using real data from the Mapillary API.
*   **Inputs:**
    *   A geographic area where you know there is recent Mapillary imagery.
    *   Start and end coordinates for a route within that area.
*   **Action:**
    1.  Update the `bbox` in `worker/ingestion.ts` to the desired area.
    2.  Run the ingestion workflow manually (as in test #2).
    3.  On the frontend, draw a route within the same area.
*   **Expected Result:**
    *   Real hazard clusters, generated from actual Mapillary detections, should appear on the map along the drawn route.
