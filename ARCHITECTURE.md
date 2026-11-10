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

Approved downloads use `fetch --selection FILE --db LOCAL_DRAFT`. The selection
embeds the discovery packet and its hash, exact topic choices and history scope;
the importer checks the published baseline and grouped membership before fetching.
Selected runs do not advance the full-poll cutoff. Explicit opening-plus-recent
histories record omitted forum IDs; subsequent pulls retain the chosen opening
and range, add new replies, and recheck retained posts for edits/removals. Private
previews and model inputs carry the coverage limitation. Discovery responses may
include a forum-provided opening batch; only selected post bodies enter snapshots.

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
