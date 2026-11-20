# CRM Contact Workspace

A full-stack contact workspace: browse, search, filter, sort and page through contacts, edit them
safely when several people work on the same record, manage tags (including bulk tagging), and see
each contact's change history.

**Stack:** React + TypeScript (Vite) · Node.js + TypeScript (Express) · PostgreSQL 16 · zod (shared validation)

---

## Quick start

**Prerequisites:** Node.js **22.22+** and Docker (Desktop).

```bash
npm install
cp .env.example .env
npm run setup     # starts Postgres in Docker, runs migrations, seeds 50,000 contacts (~5s)
npm run dev       # API on http://localhost:4000, web app on http://localhost:5173
```

Open **http://localhost:5173**.

| Command                              | What it does                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| `npm run dev`                        | API + web app with hot reload (Vite proxies `/api` to the API, so no CORS setup)      |
| `npm test`                           | All tests: shared schemas, API integration tests (real Postgres), web component tests |
| `npm run typecheck` / `npm run lint` | Type-check all packages / ESLint                                                      |
| `npm run build`                      | Production builds (`apps/api/dist`, `apps/web/dist`)                                  |
| `npm run db:migrate`                 | Apply pending SQL migrations                                                          |
| `npm run db:seed`                    | Reset and re-seed demo data (`SEED_COUNT=200000 npm run db:seed` for more)            |
| `docker compose down -v`             | Stop Postgres and delete its data                                                     |

Postgres runs on host port **5433** (so it doesn't clash with a local Postgres on 5432). API
tests use a separate `contacts_test` database, so running tests never touches your demo data.

**Demo data:** 50,005 contacts. Some have no email or phone, contacts share 300 companies, each
has 0–3 of 7 tags, and created dates span 3 years. A few are easy to find: **Ravi Kumar** (VIP,
Customer, company "HighLevel"), **Priya Sharma**, **John Smith** (Acme Corp), **Grace Hopper**.

**To try the concurrent-update handling:** open the same contact in two tabs, change a field in
both, and save one after the other.

---

## Repository layout

```
apps/
  api/          Express API
    migrations/   SQL migrations (schema, indexes, constraints)
    scripts/      migrate + seed
    src/
      routes/       HTTP layer: validate input, call a service, send the result
      services/     business rules (versioning, activity, tagging)
      repositories/ SQL only
      db/           pool, transactions, migration runner
    test/         integration tests against a real Postgres
  web/          React app
    src/
      api/          typed fetch client + endpoints + query keys
      pages/        ContactsPage, ContactDetailPage
      components/   list (table, filters, pagination, bulk bar) and contact (form, conflict, tags, activity)
      hooks/        URL state, data fetching
packages/
  shared/       zod schemas + TypeScript types used by BOTH the API and the web app
```

npm workspaces keep frontend, backend and shared code in one repo with one install. The
`shared` package means the edit form and the API validate with **the same rules**, so they
cannot drift apart.

---

## API

| Method | Path                                                         | Notes                                                                                                               |
| ------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/contacts?q=&tag=&company=&sort=&order=&limit=&cursor=` | `sort`: `name` \| `createdAt`; `order`: `asc` \| `desc`; `tag` is repeatable (contact must have all); `limit` 1–100 |
| GET    | `/api/contacts/:id`                                          | Contact with tags and `version`                                                                                     |
| PATCH  | `/api/contacts/:id`                                          | Body: changed fields + `version`. `409 VERSION_CONFLICT` (stale) or `409 EMAIL_TAKEN`                               |
| GET    | `/api/contacts/:id/activity?limit=&cursor=`                  | Newest first, cursor-paged (`nextCursor`)                                                                           |
| POST   | `/api/contacts/:id/tags`                                     | `{ name }`, creates the tag on first use, idempotent                                                                |
| DELETE | `/api/contacts/:id/tags/:tagId`                              | Idempotent                                                                                                          |
| POST   | `/api/contacts/bulk-tags`                                    | `{ contactIds (≤1000), tagName }` → `{ tagged, alreadyTagged, notFound }`                                           |
| GET    | `/api/tags`                                                  | All tags A–Z                                                                                                        |
| GET    | `/api/health`                                                | API + database status                                                                                               |

List response: `{ data, pageInfo: { nextCursor, prevCursor }, total: { count, capped } }`.

Every error has the same shape, so clients branch on `code`, never on message text:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "...",
    "details": { "fields": { "email": ["..."] } }
  }
}
```

Codes: `VALIDATION_ERROR` / `BAD_REQUEST` (400), `NOT_FOUND` (404), `VERSION_CONFLICT` /
`EMAIL_TAKEN` (409), `INTERNAL_ERROR` (500, details are logged but never sent to the client).

---

## Data model

```
contacts                                    tags
  id            bigint identity PK            id          bigint identity PK
  first_name    text  NOT NULL (1–100)        name        text (1–50), UNIQUE (lower(name))
  last_name     text  NOT NULL DEFAULT ''     created_at  timestamptz
  email         text  NULL, stored lower-case
  phone         text  NULL                  contact_tags                 (many-to-many)
  company       text  NULL                    contact_id  → contacts ON DELETE CASCADE
  version       int   NOT NULL DEFAULT 1      tag_id      → tags     ON DELETE CASCADE
  created_at    timestamptz                   PRIMARY KEY (contact_id, tag_id)
  updated_at    timestamptz
  full_name     generated: "first last"     contact_activity
  sort_name     generated: lower(full_name)   id          bigint identity PK
  phone_digits  generated: digits only        contact_id  → contacts ON DELETE CASCADE
                                              type        CONTACT_UPDATED | TAG_ADDED | TAG_REMOVED
                                              payload     jsonb   (field diffs / tag info)
                                              created_at  timestamptz
```

| Index                                                     | Serves                                          |
| --------------------------------------------------------- | ----------------------------------------------- |
| `UNIQUE (email) WHERE email IS NOT NULL`                  | "email is unique when present" (and race-safe)  |
| `(sort_name, id)`, `(created_at, id)`                     | sorting + keyset pagination, in both directions |
| GIN trigram on `full_name`, `email`, `phone_digits`       | substring search (`%ravi%`)                     |
| `lower(company)`                                          | company filter                                  |
| `contact_tags (tag_id, contact_id)`                       | tag filter                                      |
| `contact_activity (contact_id, created_at DESC, id DESC)` | recent activity for a contact                   |

Rules are enforced **in the database** (CHECK constraints, unique indexes, foreign keys) as well
as in the API, so even a bug or a race between two requests cannot store invalid data.

---

## Important technical decisions

**1. Keyset (cursor) pagination instead of OFFSET.**
`OFFSET 200000` reads and throws away 200,000 rows. Instead, each page continues from the last
row seen: `WHERE (sort_name, id) > ($name, $id) ORDER BY sort_name, id LIMIT 26`. With the
matching index, page 1 and page 10,000 cost the same (measured: ~7 ms for page 201 of a
name-sorted list on 50k rows). `id` breaks ties, so rows with equal names or timestamps are
never skipped or repeated (there's a test with 20 identical timestamps). The cursor is opaque
(base64 JSON of sort value + id + direction) and is validated on every request.
_Trade-off:_ you get First / Previous / Next, not "jump to page 37".

**2. Capped total count.** An exact `count(*)` over millions of matching rows is slow, so the
API counts at most 10,001 rows and reports `10,000+` (`capped: true`).

**3. Search.** Case-insensitive substring match on full name and email, using `pg_trgm` GIN
indexes. Phone search ignores formatting (`98765-43210` matches `+91 98765 43210`) by matching
a generated digits-only column, and is only added when the query looks like a phone number.
(Matching letters against the phone column caused a full table scan in testing.) LIKE
wildcards in user input are escaped.

**4. Raw SQL with `pg` instead of an ORM.** The important parts are Postgres features: partial
unique indexes, trigram indexes, generated columns, row-value keyset comparisons,
`INSERT … ON CONFLICT … RETURNING`. Writing the SQL explicitly keeps every query and index easy
to review and explain. All values are parameterised (`$1`); sort columns come from a fixed
whitelist, never from user input.

**5. Shared zod schemas** (`packages/shared`). One definition validates API requests and the
web forms, and also normalises data (trim, lower-case email, `""` → `null`).

**6. Transactions for every multi-step write.** A change and its activity entry commit or roll
back together, so the history can never claim something happened that didn't (and rejected
changes are never logged; tested).

**7. Tag changes do not bump the contact `version`.** Tags are a set: adding "VIP" can't
overwrite someone's phone-number edit, so tagging shouldn't make another user's open edit form
conflict. Tag changes are still recorded in the activity log. Add/remove are idempotent, so
double clicks and retries are harmless.

**8. Bulk tagging** is one transaction and one statement:
`INSERT INTO contact_tags SELECT … FROM contacts WHERE id = ANY($1) ORDER BY id ON CONFLICT DO NOTHING RETURNING contact_id`.
Unknown ids are skipped and reported. `RETURNING` tells us exactly which contacts were newly
tagged, so activity is only logged for real changes. `ORDER BY id` makes concurrent overlapping
bulk requests lock rows in the same order, which avoids deadlocks (tested). Capped at 1,000
contacts per request to keep transactions short.

**9. Frontend state.** List filters live in the URL, so refresh, back/forward and shared links
all work, and "Back to contacts" returns to the same filters and page. TanStack Query handles
caching, request cancellation (typing a new search cancels the old request), retries (only
network errors / 5xx, never 4xx, and never for writes) and cache invalidation after changes.

- **Pages do layout; logic lives in hooks.** `useContactListParams` (URL state), `useContactList`
  (fetching + on-intent next-page prefetch), `useSelection` (bulk selection), `useContactEditor` (draft,
  validation, save, conflicts), `useUnsavedChangesGuard`, `useTheme`, `useOnlineStatus`. Pure
  logic such as the three-way merge sits in plain functions (`formModel.ts`) with unit tests.
- **Derived state instead of synchronising copies.** The edit form keeps a _draft_ only while the
  user is editing; otherwise it renders the latest server data directly, so background updates
  appear without an effect copying props into state. The company filter resets with a React
  `key`. The one remaining sync effect (the search box) is documented in the code: it changes the
  URL while you type, so remounting it would steal focus.
- **Unsaved edits are protected.** Leaving the contact page with unsaved changes opens an
  accessible confirm dialog (focus moves in, Tab is trapped, Escape cancels, focus is restored),
  using React Router's `useBlocker`, which is why the app uses a data router. Closing or reloading
  the tab triggers the browser's own prompt (`beforeunload`).
- **Duplicate submissions are prevented**: save, bulk-tag and tag buttons are disabled while a
  request is in flight, and saves are never retried automatically.
- **Accessibility details:** when a save is rejected as stale, focus moves to the conflict panel;
  status messages use `role="status"` / `role="alert"`; an offline banner (browser
  `online`/`offline` events via `useSyncExternalStore`) explains why nothing loads or saves.
- **Tag picker** (`TagCombobox`): replaces the browser's `<datalist>` popup, which can't be
  styled and ignored the theme. It follows the WAI-ARIA combobox pattern (focus stays in the input;
  the highlighted option is exposed via `aria-activedescendant`), filters as you type with
  "starts with" matches first and the match highlighted, and offers "Create “…”" only when no tag
  with that name exists. ↓/↑/Enter/Escape work as expected. On a contact, picking adds the tag
  immediately. In the bulk bar, picking only fills the box (tagging many contacts waits for "Add
  tag"), so it offers no "Create" option (it would only put back the typed text), and the list
  opens upward above the docked bar.
- **Activity feed:** an infinite query over the cursor-paged activity endpoint. It shows the 5
  newest entries; "Show older activity" fetches the next 10 from the server, "Show less" drops
  back to the first page. After any change it is invalidated, so new entries appear at the top
  immediately. The cursor is the last entry's id; the server looks up its `(created_at, id)` and
  continues from there, so entries that share a timestamp are neither skipped nor repeated.
- **Many tags:** nothing grows without limit. A contact page shows 12 tags with "+N more" / "Show
  fewer" (a tag the user just added is always shown). A list row shows 3 tags and a "+N" button that
  opens a popover with all of them (a tooltip wouldn't work on touch screens or from the keyboard).
  It closes on Escape (focus returns to the chip), an outside click, scroll or resize, and is
  `position: fixed` so the table's scroll container can't clip it. The tag filter shows 12 tags with
  "+N more", and selected tags always stay visible. With thousands of tags, the filter would become
  a search box (the same combobox) backed by a server-side tag search.
- **Performance:** the contact page is code-split (`React.lazy`) and only downloaded when a
  contact is opened. The next list page is prefetched **on intent**, when the pointer reaches or
  keyboard focus lands on "Next", so the click is usually served from cache. An earlier version
  prefetched page 2 after every result, which doubled requests while typing a search; prefetching
  on intent keeps "Next" fast with no wasted requests. In development, React StrictMode
  intentionally mounts twice, so you may see a duplicate first request; production builds make one.

**10. Optimistic tag updates.** Adding or removing a tag changes the chip immediately, before
the server answers (a new tag shows faded until confirmed). On failure, only that one change is
rolled back and the reason is shown (the typed text comes back for a failed add). With several
quick changes in flight, each is undone independently instead of restoring one snapshot, which
would wipe out the others. Once the last pending change settles, the contact, lists, activity
and tag list re-sync with the server. Contact **field** edits are deliberately _not_
optimistic: a save can be rejected by a version conflict or a duplicate email, and showing it as
saved first would be misleading.

**11. UI and responsive design without a UI library.** One stylesheet built on design tokens
(color, spacing, radius, shadow, and a type scale) for light and dark mode, which follows the
OS setting. No component library or CSS framework: the app is small, and plain CSS keeps the
bundle light and every style easy to explain. Reusable pieces: `Avatar` (initials, color derived
from the id), `Banner`, `Loading` (skeleton rows shaped like the content, so nothing jumps),
`EmptyState`/`ErrorState`, and inline SVG `Icons`.

- **Phones (≤720px):** the contacts table turns into a list of cards with CSS alone (each cell
  shows its field name from a `data-label` attribute), so there's one component and no duplicate
  markup. Empty fields are hidden, and the bulk-tag bar docks to the bottom of the screen.
- **Tablets:** the contact page drops from two columns to one below 860px.
- **Theme switch (System / Light / Dark)** in the header. The choice is saved in `localStorage`
  and applied by a tiny inline script in `index.html` before the first paint, so a reload never
  flashes the wrong theme. "System" follows the OS live. If storage is blocked, the app still
  works; it just doesn't remember the choice.
- **Accessibility:** labelled controls, visible focus rings, `aria-invalid`/`aria-describedby`
  on form errors, status messages announced to screen readers, decorative icons and avatars
  hidden from them, and reduced motion respected for the skeleton shimmer. A "Skip to content"
  link is the first Tab stop (WCAG 2.4.1). Each page sets its own tab title through React 19's
  `<title>` hoisting ("Ravi Kumar · Contacts Workspace"), so tabs and history say where you are.
  The result count is announced in a polite live region when a search or filter settles.
- **Table:** Name and Created headers are sort buttons (first click: A–Z / newest; again: flip),
  with `aria-sort` on the sorted column; the dropdown stays for phones, where headers are hidden.
  On screens wide enough for the table (>= 1080px) the header row sticks under the app header.
  Narrower, the table keeps its horizontal scroll container, which a sticky header can't escape.
- **Contact header:** email and phone are `mailto:` / `tel:` links (tel uses digits only) with
  copy buttons that confirm "Copied" in a live region, or say when the clipboard is refused.

---

## Concurrent update approach

**Optimistic locking with a `version` column.**

1. `GET /contacts/:id` returns `version` (e.g. 3). The edit form remembers it.
2. Save sends only the changed fields **plus that version**: `PATCH { company: "X", version: 3 }`.
3. In one transaction the API locks the row (`SELECT … FOR UPDATE`) and compares versions:
   - **Match:** write the changed fields, set `version = version + 1` and `updated_at = now()`,
     log `CONTACT_UPDATED` with a from/to diff.
   - **Mismatch** (someone saved in between): **`409 VERSION_CONFLICT`**, and the response
     includes the latest contact. Nothing is written.
4. The UI shows a conflict panel built from **three versions**: what the user started from, what
   they typed, and what is saved now. It lists only the fields **this user** changed
   ("Your value / Saved value now"), and reports fields only the other person changed as
   "kept either way". The user either discards their edits or keeps them.
5. "Keep my changes" is a **three-way merge**: the form keeps only the fields this user edited and
   takes every other field from the latest version, then re-bases onto the latest `version`. So
   the next save is a deliberate overwrite of just the fields shown in the panel, and it can never
   silently revert the other person's changes to fields this user didn't touch.

Additionally, the contact page re-checks the server when the tab regains focus. If someone else
saved while you have unsaved edits, it warns you **before** you click Save.

Why optimistic rather than pessimistic locking: users keep forms open for minutes, and holding a
database lock (or an "edit lock") that long would block everyone else and needs expiry/cleanup.
Here the row lock lasts only for the milliseconds of the save itself, and no distributed lock is
needed. Verified with a test where 5 clients save the same version simultaneously: exactly one
succeeds, four get 409, one activity row is written.

_Alternative considered:_ `ETag` + `If-Match` headers (the standard HTTP form of the same idea).
The version-in-body approach was chosen because it's simpler for a form-based client; switching
would only change how the version travels, not the server logic.

Email uniqueness under concurrency relies on the unique index, not a "check then insert"
(which two requests could both pass). The resulting unique-violation is mapped to
`409 EMAIL_TAKEN` and shown on the email field.

---

## Testing

`npm test` runs **184 tests** (Postgres must be running: `npm run db:up`):

- **API integration tests (91)**, run through HTTP (supertest) against a real Postgres test
  database that is rebuilt from the migrations on every run:
  - paging through every sort order with no gaps or duplicates, including ties; walking backwards
  - search (name, email, formatted phone, wildcard escaping), tag/company filters, invalid input
  - stale-version conflicts, the A/B scenario from the brief, 5 simultaneous writers
  - duplicate email (any case) and rollback, no-op updates
  - tag idempotency, case-insensitive tag reuse, concurrent tag creation, overlapping bulk requests
  - activity contents and order, and that rejected changes leave no activity
  - database constraints themselves (unique email, checks, cascades)
  - the API surviving Postgres killing its pooled connections (as in a DB restart or failover)
- **Shared schema tests (11):** normalisation and validation rules.
- **Web tests (82):** Testing Library against a fake API. They cover loading/empty/error states,
  debounced search, URL state, paging and on-intent next-page prefetch (none while typing; hover
  or focus on Next fetches page 2 once and the click needs no request), bulk tagging and selection,
  client-side validation, server field errors, the full conflict flow (panel, keep mine → re-save
  with the new version, use theirs, and "keep mine" never reverting fields only the other person
  changed), background refresh without local edits, optimistic tag changes (shown before the
  server answers, rolled back on failure, two overlapping changes where only the failed one is
  undone), the unsaved-changes guard (dialog, "keep editing", "discard and leave", the
  `beforeunload` prompt), accessibility behaviour (dialog focus and Tab trapping, Escape, focus
  moving to the conflict panel), the offline banner, the tag picker (filtering, keyboard, "Create" only for new names, ARIA
  state), auto-dismissing messages, and the theme
  switch.

The risky areas (concurrency, pagination correctness, data integrity) are tested hardest.

**Manual end-to-end check in a browser** against the 50k seed covered every requirement in the
brief: search by name, email and formatted phone; tag (AND) and company filters; all four sort
orders verified row by row; First/Previous/Next with no repeated rows; edit and reload; data
surviving a restart of both the app and Postgres; single and bulk tags (including a repeat bulk
run); client-side and duplicate-email validation; a real two-user conflict; no-results,
not-found and tampered-URL states; and stopping Postgres mid-session (the API stays up,
`/api/health` reports 503, the UI shows the errors and keeps unsaved input, and everything
recovers by itself when the database returns).

---

## Known issues / not implemented

- **No authentication or multi-tenancy.** It assumes a single account; see the scaling notes
  for how `account_id` would be added.
- **No create/delete contact** (not in scope). The schema already cascades deletes.
- **Pagination has no page numbers** (a deliberate keyset trade-off), and totals over 10,000 show as `10,000+`.
- **Searches shorter than 3 characters** can't use the trigram index and fall back to a scan.
  Fine at 50k rows, too slow at millions (see scaling).
- **Bulk tagging works on explicitly selected contacts (≤1,000).** There is no "tag all N
  contacts matching this filter" and no bulk remove.
- **Conflicts are resolved per edit, not per field.** "Keep mine" keeps all of this user's
  edited fields, and other fields are merged from the latest version. There's no
  "keep mine for email but theirs for phone" choice inside the panel.
- **Tag changes don't update `updated_at`** (same reasoning as not bumping `version`). The
  activity log is the record of tag changes.
- **Unused tags are never cleaned up.**
- **No end-to-end browser test suite** (e.g. Playwright). Flows were verified manually, and
  component tests cover the UI logic.

---

## Scale considerations

**Millions of contacts per large account**

- Add `account_id` to every table and make it the **leading column of every index**
  (`(account_id, sort_name, id)` etc.), so each query only touches one account's slice.
  Postgres row-level security as a safety net against cross-account leaks.
- Hash-**partition** the big tables by `account_id` to keep indexes and vacuum manageable.
- Keyset pagination already scales. Replace counts with estimates or cached counters.
- Store tag ids on the contact as a `bigint[]` with a GIN index (kept in sync with
  `contact_tags`), so multi-tag filtering plus sorting is one index-friendly query.

**Millions of contact updates per day** (≈12/s average, with peaks far higher)

- The writes themselves are cheap single-row updates. The pressure is on `contact_activity`,
  which grows fastest: **partition it by month**, set retention/archival, and keep it off the
  hot path. Writing activity via a transactional outbox → queue → consumer keeps the guarantee
  that every committed change is recorded.
- Connection pooling (PgBouncer). Keep transactions short (they already are).
- Bulk operations ("tag 2M contacts") become **background jobs** that work in batches, with progress reporting.

**Frequent searches and filters**

- Move search/filter to a **dedicated search engine** (OpenSearch/Elasticsearch/Typesense),
  fed from Postgres via the outbox/CDC. It handles prefix and fuzzy search, short queries,
  facets and counts far better than `LIKE`. Postgres stays the source of truth and handles
  writes and single-contact reads.
- **Read replicas** for list queries. Cache small, hot data (tag lists) in Redis or the client.

**Many simultaneous users**

- The API is stateless, so scale horizontally behind a load balancer. Add rate limiting per user/account.
- Optimistic locking already scales well (no long-held locks). Push changes to open
  editors over **WebSockets/SSE** instead of re-checking on focus, so conflicts surface even sooner.
- Add `ETag`/`If-Match` and HTTP caching for single-contact reads.
- Observability: request IDs are already logged on every request. Add metrics, tracing, and
  slow-query monitoring (`pg_stat_statements`).

---

## AI usage

- **Tool:** Claude Code (Anthropic), used as a pair programmer throughout.
- **Used for:** discussing the architecture and trade-offs up front; scaffolding the monorepo;
  drafting the SQL schema, API layers, React components and tests; checking query plans with
  `EXPLAIN ANALYZE`; testing the running app in a browser (including the two-tab conflict);
  and drafting this README. I reviewed each change before accepting it.
- **Suggestions I changed or rejected:**
  - The initial plan used **Drizzle ORM**. I switched to hand-written SQL with `pg`, because the
    key parts (partial unique index, trigram indexes, generated columns, keyset row comparisons)
    are clearer and easier to defend as explicit SQL than through an ORM abstraction.
  - The generated config read the API port from the generic **`PORT`** variable. Running the app
    in a real browser showed it clashing with the frontend (tools and hosts often set `PORT`), so
    it became `API_PORT`.
  - A generated form put validation errors **inside** the `<label>`, which changes the field's
    accessible name. The component tests caught it, and errors now sit beside the input
    (`aria-describedby`).
  - The first generated "keep my changes" kept the **whole form**, including stale values for
    fields the user never touched, so it could silently undo another user's change (found in the
    end-to-end browser test). It's now a three-way merge that keeps only the user's own edits.
  - The generated database pool had **no `'error'` listener**. Stopping Postgres during testing
    crashed the whole API process. It now logs, the pool reconnects on its own, and a test
    reproduces the dropped connection.
