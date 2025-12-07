# Quick Operational Runbook

This runbook provides solutions for common operational issues that may arise with the Road Hazard Alert System.

## Phase 10 — Quick Fixes

### 1. Ingestion Fails (API Limit / 429 Error)

*   **Symptom:** The GitHub Actions workflow for ingestion fails with an error message like `429 Too Many Requests` in the logs.
*   **Cause:** The ingestion worker is making too many requests to an external API (e.g., Mapillary, Overpass) in a short period.
*   **Action:**
    1.  **Reduce Frequency:** Open the `.github/workflows/ingestion.yml` file.
    2.  Change the `cron` schedule to run less frequently. For example, change `*/5 * * * *` (every 5 minutes) to `*/15 * * * *` (every 15 minutes).
    3.  **Contact API Provider:** If the issue persists, you may need to check the API provider's documentation for rate limit details or contact their support to request a higher limit.

### 2. OSRM Public API is Slow or Unavailable

*   **Symptom:** The frontend takes a long time to display a route, or it fails to show a route altogether. Browser developer tools may show failed network requests to `router.project-osrm.org`.
*   **Cause:** The OSRM public API is a free service and may experience high traffic or temporary outages.
*   **Action (Short-term Fix):**
    1.  **Client-side Fallback:** As a temporary measure, you can modify the frontend code to draw a straight line between the start and end points if the OSRM API call fails. This provides a degraded but still functional user experience.
        *   You can use `turf.lineString([[start_lon, start_lat], [end_lon, end_lat]])` to create this straight line.
    2.  **Inform the User:** Display a message on the UI indicating that routing is temporarily degraded.
*   **Action (Long-term Fix):**
    *   Consider using a commercial routing provider with an SLA (e.g., Mapbox Directions API) or hosting your own OSRM instance.

### 3. Frontend Misses Realtime Events After Reconnect

*   **Symptom:** A user has the application open for a long time, their network connection drops and reconnects, and they may miss hazard updates that occurred during the disconnection.
*   **Cause:** Supabase Realtime subscriptions can be interrupted by network changes.
*   **Action:**
    1.  **Reconciliation:** The application already has a mechanism to handle this.
    2.  When a route is selected, the frontend calls the `/api/v1/route/hazards` endpoint to fetch all current hazards for that route.
    3.  If a user suspects they are missing data, they can simply re-select the route or refresh the page, which will trigger this reconciliation process and ensure they have the latest data.
