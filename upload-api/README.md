# Results upload inbox

The dashboard submits a ZIP of a Crucible results bundle to this Cloudflare Worker. The Worker stores
the original ZIP in a private R2 bucket under `pending/<sha256>.zip` and returns the hash as a receipt.
Uploading identical bytes uses the same object key. Maintainers can retrieve submissions from the
bucket for review. The Worker stores archives as received, so review them with the usual bundle
validation before importing any records into the dashboard.

## Deploy

1. In a Cloudflare account with R2 enabled, create the private bucket:
   `npx wrangler r2 bucket create crucible-results-inbox`.
2. Confirm that `DASHBOARD_ORIGIN` in `wrangler.jsonc` matches the live dashboard's origin.
   From this directory, deploy with `npx wrangler deploy`.
3. Set the dashboard GitHub Actions repository variable `RESULTS_UPLOAD_URL` to the deployed Worker
   HTTPS URL. Run the Deploy workflow to publish the dashboard with that endpoint.

For dashboard development, set `VITE_RESULTS_UPLOAD_URL` in the process environment when launching
Vite. Without an endpoint the page can select a file and shows that uploads are unavailable.
