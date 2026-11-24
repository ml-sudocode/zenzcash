# How Zenzcash works

Zenzcash has three parts: a Rust web server, a browser interface, and a separate
pipeline that prepares forum content for publication.

## Serving the site

The Rust server uses Axum and Tokio to serve the interface and APIs. SQLite stores
published forum content, accounts, bookmarks, reading preferences and feedback.
Passkey authentication uses WebAuthn. The browser interface is plain HTML, CSS and
JavaScript ES modules.

## Preparing the content

Node.js tools fetch public threads from the Zcash community forum and retain the
original posts. AI analysis runs separately from the web server:

Each pull begins with `scripts/zforum import discover --db LOCAL_SNAPSHOT`, also
the default import stage. It reads listing metadata and retained local excerpts,
records request counts/timing, and stops for thread selection before full downloads.
It uses a read-only local database copy and leaves the published cutoff unchanged.
After approved sources are fetched, a second review approves analysis scope and
spending. Neither review authorizes publication.

Analysis also checks a run-specific spending review before each model call. A token
spike holds further work on that topic while other topics continue. The hold and
total attempt count survive restarts; releasing a hold requires a recorded user
decision. Usage is available after a call finishes, so already-running calls may
complete before a hold takes effect.

Approved downloads use `fetch --selection FILE --db LOCAL_DRAFT`. The selection
embeds the discovery packet and its hash, exact topic choices and history scope;
the importer checks the published baseline and grouped membership before fetching.
Selected runs do not advance the full-poll cutoff. Explicit opening-plus-recent
histories record omitted forum IDs; subsequent pulls retain the chosen opening
and range, add new replies, and recheck retained posts for edits/removals. Private
previews and model inputs carry the coverage limitation. Discovery responses may
include a forum-provided opening batch; only selected post bodies enter snapshots.

The topics page shows the newest published topic snapshot as its latest content
refresh date. This includes selected pulls and is independent of the internal
full-poll checkpoint and the reader's search or interest filters.

1. **Summarize the discussion.** Models produce topic summaries with questions,
   competing views and citations. Long histories are summarized in sections,
   then combined into a topic summary.
2. **Analyze individual posts.** Models generate short summaries, optional calmer
   rewrites, and separate assessments such as tone and argument support. These
   use the original text and discussion context. Older posts can remain available
   without an individual assessment. Newly imported topics use a six-calendar-month
   cutoff for individual assessments; older originals still inform the summary.
   The cutoff is frozen with the import and retained on subsequent pulls. Existing
   accepted assessments remain available.
3. **Validate and publish.** The tools check output structure, source references
   and quoted evidence. Accepted results retain their model and prompt provenance
   and can be reused. Publication is a separate, explicit step.

Readers receive stored results; browsing, listening and saving posts do not
trigger model calls. Listening uses browser speech synthesis. AI exports package
selected originals for readers to take to a service of their choice.

Validation checks structure and source references, not whether an interpretation
is correct. Originals remain separate from generated text and available to readers.

Maintainer rules, including approval before new analysis spending, are in
[CLAUDE.md](CLAUDE.md).

## Sandlab staging

The `sandlab-content-first` branch runs at https://sandlab.zenzcash.com on the development
host. Its Compose project is `zenzcash-sandlab`; it does not deploy to Fly.io.
Use the dedicated staging checkout for changes. The application uses the same
Dockerfile and Rust server as production, with its own origin, WebAuthn RP ID,
database and accounts. Production passkeys and recovery codes do not sign in here.

Caddy publishes ports 80 and 443, obtains a Let's Encrypt certificate and renews
it automatically. Keep both ports reachable and the DNS record pointing at this
host. The `caddy_data` volume retains certificates and ACME account keys. Only
Caddy can reach the app through the internal Compose network; the app has no
published port or outbound network. Caddy overwrites `Fly-Client-IP` with the
connection peer so the existing server proxy mode can apply per-client limits.
Do not expose the app port or forward untrusted client headers through unchanged.
Search engines receive `noindex` headers and a disallowing robots.txt. All HTTPS
paths require HTTP Basic Auth with username `sandlab`, including public health
and data endpoints. The app's internal container health check remains available.
The root-owned mode-0600 file `/etc/zenzcash-sandlab/basic-auth` contains the
username and bcrypt password hash and is mounted read-only into Caddy. Neither
the password nor its hash belongs in Git, environment files, images or docs.
Caddy strips the Basic Authorization header before proxying to the app. HTTP
redirects and Caddy-managed ACME challenges remain available for renewal.

The server-local auth file must exist before starting the proxy; a missing file
fails startup. To change credentials, use `caddy hash-password` with password input
on stdin, update the root-owned file on the host, then recreate the proxy with
`docker compose -f compose.sandlab.yaml up -d --force-recreate --no-deps proxy`.
Recreation also refreshes the bind mount if the file was replaced atomically.

Initialize from a verified local backup using Node 22.13+ (or Node 24). The seed
tool accepts schemas 11 and 12, checks the supplied SHA-256, removes accounts and
personal/history records, compacts deleted data, and refuses existing targets:

```sh
node tools/seed-staging.mjs SOURCE.sqlite work/sandlab.sqlite SOURCE_SHA256
docker compose -f compose.sandlab.yaml build app
docker volume create zenzcash-sandlab_app_data
docker run --rm --network none --user 0:0 --entrypoint /bin/sh \
  --mount type=volume,src=zenzcash-sandlab_app_data,dst=/data \
  --mount "type=bind,src=$PWD/work/sandlab.sqlite,dst=/seed.sqlite,readonly" \
  zenzcash-sandlab:dev -ec \
  'test ! -e /data/zforum.sqlite && test ! -e /data/zforum.sqlite-wal && test ! -e /data/zforum.sqlite-shm && cp /seed.sqlite /data/zforum.sqlite && chown 10001:10001 /data /data/zforum.sqlite && chmod 700 /data && chmod 600 /data/zforum.sqlite'
docker compose -f compose.sandlab.yaml up -d --wait
```

The real server runs directly, bypassing the production backup supervisor.
No production secrets, backup uploads, imports or model jobs run in staging.
The initial seed uses the November 21 published catalog. Content does not sync
automatically with production. Staging account changes stay in `app_data`.

After changing code, run the repository checks, then rebuild and recreate only
the application. Browser assets are built into the image, not live-mounted:

```sh
scripts/check.sh
scripts/build-auth.sh
docker compose -f compose.sandlab.yaml up -d --build --wait app
curl --fail --user sandlab https://sandlab.zenzcash.com/healthz
```

Use `docker compose -f compose.sandlab.yaml ps` for status and
`docker compose -f compose.sandlab.yaml logs --tail=100 app proxy` for logs.
`docker compose -f compose.sandlab.yaml restart app` restarts the app without
rebuilding. `docker compose -f compose.sandlab.yaml down` stops staging and retains
its volumes. Both services restart after host reboots. Do not use `down -v`: it
deletes certificate storage. The separately initialized `app_data` volume is
external to Compose and survives that command. Staging has persistent local
storage but no off-host backup; it is for disposable testing accounts.

The content-first redesign is isolated on `sandlab-content-first`; `sandlab`
retains the pre-redesign revision `611fd8a`. Posts open with their chosen text
version, and sticky Previous/Next buttons move through matching public posts in
the selected order, loading the next batch when necessary. Topic summaries precede new points and
posts. Search, sorting and filters remain visible in a distinct controls area;
post feedback and AI notes are optional disclosures below the text. Citation
links preview originals in a native dialog and support normal new-tab navigation.
Each post is a separate bordered surface with its actions and analysis inside an
attached footer. Newness is a per-post time-window label, not a connecting rail.
The header retains the circular author avatar, visible forum-tenure badge and
both absolute and relative post dates. Anonymous mode masks the avatar/name and
tenure together until the reader reveals that author. Topic-list metadata lives
below the description, including counts, dates, account statistics and tags.
Version selection uses labeled tabs and a subtle blue rewrite background without
vertical rails; originals use the normal post background. Mixed-thread views name
each post's source thread. Main questions and arguments start visible in paired
rows: question/context left and short attributed positions right at 1100px and
wider; each question stacks immediately above its arguments on narrower screens.
The whole overview can collapse, and each question's context and supporting
evidence expand separately and start folded on fresh visits. Compact 14px gray
explanations and tighter spacing keep the overview scannable; forum post type
sizes are independent. Disclosure state survives control changes and Back.
Explore the arguments opens/scrolls to the concise overview without expanding
every detailed analysis. All published question fields, points and citations
remain available. A legend explains
that source-tag colors represent AI-rated original-post tone, not truth or argument
quality. It uses the filter names Good (restrained), Moderate (pointed) and Bad
(adversarial or attacking). Both source colors and tone filtering use the same
effective score, including a material harsh passage lowering the rating.
What's new filters stored points by the first listed citation's post date;
later replies can increase post counts without making an existing point new.
Hidden-age profiles are included in fresh settings; explicit saved exclusions
remain honored. Filter labels and help icons share compact rows. Tone, argument
support and post-type checkboxes start clear; an empty group means no restriction.
Settings v8 records this meaning explicitly; older all-selected groups migrate to
empty, narrower choices remain selected, and old empty groups become unrestricted.
Account preferences and history snapshots migrate through the same settings parser.
Hide author names is the sole identity/display toggle in the sidebar; existing
assumption/newness/feedback display preferences and post features remain intact.
Clicking a help icon again explicitly dismisses both its pinned and hover/focus
preview, including while the pointer or focus remains on the icon. A fresh hover,
focus or click can reopen it; Escape dismisses it too.
Bulk-selection
buttons distinguish empty, partial and full selection. Each browser history entry
retains its page position, filters, loaded post batches, text versions, open
details and sidebar scroll. Tab-scoped session storage preserves these through
reloads and leaving the site; snapshots contain UI state, not credentials or
account responses. Topic restoration requires the same published release and
visibility state. Standalone reframing notes and their toggle are removed; the raw
assessment and stored preference field remain part of the existing data contract.
Reading controls keep a minimum
240px sidebar above phone widths, with an open pinned panel at 700px and below.
On mobile, both navigation buttons and post scroll offsets account for the measured header
height and the controls panel, including signed-in layouts.
Stored citations remain attached to their supported claim units; no historical
analysis was regenerated for this layout change.

Saved contains separate topic and post lists. Save topic appears beside the topic
title; both types of bookmark belong to the signed-in account and persist across
devices. Schema 12 adds `saved_topics` with account-cascade deletion, independently
of post reading state. `PUT /api/account/topics/{topic}` accepts only `{saved:
boolean}` under the existing session, CSRF and origin checks. Each account may
save up to 1000 topics; unavailable topics can still be removed from Saved.

Before the schema-12 migration, create a server-local backup with the app's
`backup --db /data/zforum.sqlite --to /data/UNIQUE_NAME.sqlite` command. Old
schema-11 images cannot open the migrated database. Older images also require
settings v7: before rolling back from v8, convert account preferences in a backed-up,
stopped staging database from v8 to v7, replacing empty tone/support/post-type lists
with their complete allowed lists and retaining every other field. Do not restore
the whole database merely to change preference representation. Browser-local v7
settings remain under their old key; v8 uses a separate key.
To roll back the Saved and
general-navigation UI while retaining accounts and saved data, use the preserved
schema-12-compatible image from backend revision `cd21511` (do not add `--build`):

```sh
docker tag zenzcash-sandlab:before-saved-navigation-20261124 zenzcash-sandlab:dev
docker compose -f compose.sandlab.yaml up -d --no-build --force-recreate --wait app
```

The next build from `sandlab-content-first` restores the current UI. For a source
rollback of these UI changes, build revision `cd21511`. Do not rebuild `sandlab`
or use the older pre-redesign image against schema 12; those require a separate
restore of the pre-migration backup and would discard subsequent account changes.
Keep the compatible rollback image until the changes have been reviewed.

The baseline immediately before Previous/Next and simplified filters is source
`5a33587`, image `zenzcash-sandlab:before-reader-simplify-20261124`. It retains
Saved topics and general history restoration. The same v8-to-v7 preference
conversion above is required before using that image; no database schema change
is involved in this UI update.

The image `zenzcash-sandlab:before-summary-pairs-20261124` retains settings v8,
Previous/Next and simplified filters; it predates the paired summary and help-icon
fix. It can replace the current image without a database/preference conversion.
For a rollback of just the paired layout while retaining the help-icon fix, use
source `c389727` or image `zenzcash-sandlab:before-paired-layout-20261124`.

Browser UI checks run with `node tests/browser.mjs` after the normal build/check
gate. The runner uses Chrome and delegates reading layout/navigation checks to
`tests/reading-flow-browser.mjs`, summary/disclosure/selection checks to
`tests/summary-usability-browser.mjs`, and mouse/touch/keyboard help dismissal to
`tests/filter-info-browser.mjs`. `node tests/browser.mjs --saved-history` checks
Saved and full browser-history restoration. The scripts assert explicit behavior
and geometry at desktop/phone viewport sizes and save `work/screenshots` for
separate visual inspection; they do not automatically judge overall design quality.
