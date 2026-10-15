# EasyOra administration

Sign in at `/admin` using the owner credentials in the local, Git-ignored `admin-access.txt` file. Never commit that file or environment files.

## Features

- Add/edit projects, upload up to eight images, choose the cover, add short details, client name (optional), image descriptions, category, and display order.
- Save drafts, publish, unpublish, and remove projects. Only published projects appear on the public website; up to three are featured on the homepage.
- Change public email, phone, WhatsApp, location, Instagram, Facebook, YouTube, and LinkedIn links.
- Preview and save a new logo, or restore the original. Changes apply without a new deployment.
- The footer shows clearly labelled dummy details until real contact details are saved: a reserved `.example` email, masked phone, and India location. They are not active contact destinations.

## Architecture

Static pages and admin assets are in `dist/`. API handlers are in `api/`, with authentication, validation, and storage in `lib/`. Vercel functions and the private Blob store use Mumbai (`bom1`). Production uses Blob exclusively; there is no browser-local or ephemeral filesystem CMS fallback.

`easyora/content.json` stores the project list and public settings. Reads use `useCache: false` for consistency. ETag-conditional writes guard concurrent saves. A three-way merge uses the edited revision (including archived snapshots for already-open admin tabs) to preserve independent changes. Competing edits to the same field require explicit resolution; settings edits and uploaded logo selections stay in the form. Earlier snapshots are retained privately under `easyora/backups/`.

Images are signature-checked, decoded, size-limited, resized, stripped of source metadata, and re-encoded as WebP by Sharp. SVG and animated uploads are rejected. Private media is served through authenticated admin previews or signed public URLs generated for the logo and published work. Unpublishing removes a project from the website; previously shared published image links and visitor copies cannot be retracted.

Public gallery rendering uses DOM text nodes for user-authored content. The image viewer supports native dialog keyboard behavior, previous/next controls, and focus restoration. Contact links remain hidden until real destinations are saved. No fabricated client work, testimonials, or performance metrics are added.

## Security and configuration

Required production variables: `BLOB_READ_WRITE_TOKEN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `SITE_ORIGIN`.

The single administrator uses a salted scrypt password hash. HMAC-signed sessions expire after eight hours and use a Secure, HttpOnly, SameSite=Strict host cookie. Mutations require a permitted Origin and session-bound CSRF token. Persistent hashed-IP counters limit sign-in attempts. Password-hash or signing-key rotation invalidates sessions. Missing configuration fails closed. Secrets are never part of the static bundle.

Admin pages have no-store and noindex headers, anti-framing protection, and a restrictive content security policy. `scripts/provision.mjs` is an authenticated owner-only local utility: it sends environment secrets to the Vercel CLI through stdin and writes the private access file. It has already configured production. Rerunning rotates the signing key, so do not rerun casually.

When using the setup utility from a fresh checkout, install the Vercel CLI separately, authenticate and link the existing project, and set `VERCEL_CLI_PATH` to that installation’s `dist/vc.js` file. The default path points to this workspace’s ignored tool cache. `.env.example` lists the required variable names without credentials.

## Verification

`npm test` exercises real HTTP handlers against an explicit test-only memory adapter: session integrity, login, CSRF, upload/re-encoding, draft privacy, publishing, public image access, settings validation, concurrent edits, and removal. Production deployment verification also exercises a real private upload and draft, then removes the test project without ever publishing it.

Public enquiries remain a browser-only brief builder. If email or WhatsApp is configured, visitors can choose to open their brief in that service; the website does not automatically send a message or save visitor briefs to a database.
