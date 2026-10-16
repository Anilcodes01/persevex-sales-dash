# Employee avatars

Photos are stored in the private R2 Standard bucket `persevex-avatars`, bound as `AVATARS` in wrangler.jsonc. The Durable Object stores only the object key in `account_avatars`. No public bucket URL or R2 API tokens are needed.

## Cloudflare setup (run yourself)

1. Enable R2 Object Storage in your Cloudflare account, accepting any billing setup requested by Cloudflare.
2. From the project folder run:

   ```sh
   npx wrangler r2 bucket create persevex-avatars
   ```

3. Keep public access disabled: do not enable r2.dev or connect a public custom domain.
4. Restart your local dev command yourself. Wrangler uses local R2 storage by default; local photos are separate from production.
5. When ready, deploy yourself with `npm run cf:deploy`. The binding is already in wrangler.jsonc; create the bucket before deploying.

## Using photos

Employees use My account → Profile photo. Administrators use People → Edit. Click the circular avatar to choose a file, drag and resize the circular crop using react-image-crop, then Save photo. Photo changes save separately from account details. Remove photo restores initials. Both directory layouts and navbar avatars display it, with initials on missing/unavailable images.

The browser center-crops JPG, PNG or WebP files under 5 MB to a 256 × 256 PNG without original metadata. The backend caps uploads at 256 KB, checks PNG structure, checksums, dimensions, permitted chunks and bounded decompressed pixel size. SVGs and animated files are not accepted as stored avatars. PNG is used instead of WebP to permit backend validation without a paid image transformation service.

`GET /api/employee/avatar?accountId=...` requires an active signed-in account. Reads use private browser caching with ETag revalidation. `POST` requires the same-origin checks used by other mutations; only the owner or an administrator can change a photo. Uploads are rate-limited and audited. `remove=true` removes an avatar. Failed database writes clean up the new R2 object; successful replacements/removals attempt to delete the previous object. If R2 cleanup fails, an unreferenced object may remain and need manual cleanup. No raw image data is logged or stored in SQLite.
