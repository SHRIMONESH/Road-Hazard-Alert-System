# Deployment Checklist

This checklist outlines the steps required to deploy the Road Hazard Alert System to production.

## Phase 9 — Minimal Deploy Checklist

1.  **Supabase Project Setup**
    *   [ ] Create a new project on [Supabase](https://supabase.com/).
    *   [ ] In the SQL Editor, run the contents of `sql/schema.sql`.
    *   [ ] In the SQL Editor, run the contents of `sql/functions.sql`.
    *   [ ] In the SQL Editor, run the contents of `sql/rls.sql` to secure your database.

2.  **Supabase Storage**
    *   [ ] Navigate to the **Storage** section in your Supabase project.
    *   [ ] Create a new bucket named `evidence-images`.
    *   [ ] Set the bucket to be **public** if you want to serve images directly. Otherwise, your backend will need to generate signed URLs.

3.  **GitHub Repository & Actions**
    *   [ ] Push the project code to a GitHub repository.
    *   [ ] In the repository settings, go to **Secrets and variables > Actions** and add the following secrets:
        *   `SUPABASE_URL`
        *   `SUPABASE_SERVICE_ROLE_KEY`
        *   `MAPILLARY_API_KEY`
        *   `OVERPASS_API_URL`
        *   `CLUSTER_EPS_METERS` (e.g., 15)
        *   `CLUSTER_MIN_SAMPLES` (e.g., 2)
    *   [ ] The `ingestion.yml` workflow is already configured to run on a schedule. You can verify this in the **Actions** tab.

4.  **Frontend Deployment (Vercel)**
    *   [ ] Create a new project on [Vercel](https://vercel.com/) and link it to your GitHub repository.
    *   [ ] Vercel will automatically detect that it's a Next.js project.
    *   [ ] In the Vercel project settings, add the following environment variables:
        *   `NEXT_PUBLIC_SUPABASE_URL` (this is the same as `SUPABASE_URL`)
        *   `NEXT_PUBLIC_SUPABASE_ANON_KEY`
        *   `NEXT_PUBLIC_ROUTE_BUFFER_METERS` (e.g., 50)
        *   `MAPBOX_ACCESS_TOKEN` (your public Mapbox token)
    *   [ ] Deploy the project. Vercel will build and deploy your Next.js application.

5.  **Final Verification**
    *   [ ] Access your deployed Vercel URL.
    *   [ ] Test the OSRM routing by selecting a start and end point on the map.
    *   [ ] Perform the **Realtime Smoke Test** from the `TESTING.md` guide to ensure the live connection to Supabase is working.
