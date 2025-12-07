# Monitoring & Operations Guide

This guide outlines the key areas to monitor for the Road Hazard Alert System to ensure its reliability and performance.

## Phase 7 — Monitoring & Operations

### Monitored Items

1.  **Ingestion Success/Failure**
    *   **Where to check:** GitHub Actions logs for the `ingestion.yml` workflow.
    *   **What to look for:** Successful runs or any errors during the script execution. The logs will provide details on API fetch failures, database errors, or clustering issues.

2.  **Database Growth Metrics**
    *   **Where to check:** Your Supabase project console, under the **Reports** and **Database** sections.
    *   **What to look for:**
        *   **Table Row Counts:** Monitor the growth of `mapillary_detections` and `hazard_clusters` to ensure data is being ingested as expected.
        *   **Disk Usage:** Keep an eye on the overall database size to anticipate when you might need to upgrade your plan.

3.  **Realtime Latency**
    *   **What to measure:** The time difference between a hazard cluster being created in the database and when it's received by the frontend.
    *   **How to measure:**
        1.  The `hazard_clusters` table has a `created_at` timestamp, which is set when a new cluster is inserted.
        2.  On the frontend, when a new cluster is received via the Supabase Realtime subscription, record the current timestamp.
        3.  The latency is `(frontend_receipt_time - cluster.created_at)`.
    *   **Acceptance criteria:** Under normal conditions, this latency should be less than your ingestion cadence (e.g., 5 minutes) plus a few seconds for processing and network transit.

### Alerts

For a production system, you should set up automated alerts for critical failures.

*   **GitHub Actions Failure Notifications:**
    *   You can configure GitHub to send email notifications on workflow failures. Go to your repository's **Settings > Notifications** to set this up.
*   **External Monitoring Service (Optional):**
    *   For more advanced monitoring and alerting (e.g., database performance, API endpoint health), consider using a service like Better Uptime, Grafana, or Datadog.
    *   You can set up alerts to be sent to email or a Slack channel by providing a webhook URL (e.g., `SLACK_WEBHOOK`) to the service.
