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
tool only accepts schema 11, checks the supplied SHA-256, removes accounts and
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
version, and the sticky Next post button advances through matching public posts,
loading the next batch when necessary. Topic summaries precede new points and
posts. Search, sorting and filters remain visible in a distinct controls area;
post feedback and AI notes are optional disclosures below the text. Citation
links preview originals in a native dialog and support normal new-tab navigation.
Stored citations remain attached to their supported claim units; no historical
analysis was regenerated for this layout change.

To restore the pre-redesign staging UI without changing accounts, certificates or
Basic Auth, use the preserved local image (do not add `--build`):

```sh
docker tag zenzcash-sandlab:before-content-first-20261123 zenzcash-sandlab:dev
docker compose -f compose.sandlab.yaml up -d --no-build --force-recreate --wait app
```

The next build from `sandlab-content-first` restores the redesign. For a source
rollback, switch the clean staging checkout to `sandlab` and rebuild the app.
Keep the rollback image until the redesign has been reviewed.
