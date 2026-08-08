# Blog Page — Design

**Goal:** Give the SEO content pipeline (in the sibling `seo-content-saas` repo) a permanent, publicly indexable home for its generated articles, so SEO gains compound over time instead of expiring after a week on Google Business Profile.

**Architecture:** Two repos, one integration point. `seo-content-saas`'s `WebhookPublisher` sends a `Bearer`-token-authenticated POST with the generated article to a new endpoint in YOI-Dashboard. YOI-Dashboard stores it as `pending` in a new `blog_posts` table, surfaces it in a new "Blog" dashboard tab for owner review/approval, and — once approved — serves it at a public, crawlable `/blog/[slug]` page. A `sitemap.xml` route lists published posts so Google discovers them quickly.

**Tech Stack:** Next.js (App Router), Neon Postgres (`@neondatabase/serverless`, existing `lib/db.ts`), `react-markdown` (new dependency, approved) for rendering article bodies.

## Global Constraints

- Follow the existing `lib/events.ts` / `app/events/[slug]/page.tsx` convention for DB helpers and public slug-gated pages — this repo already has this pattern twice (events, staff-hours); the blog should look the same to a future reader.
- Auth for the webhook follows the existing `Bearer ${SECRET}` convention in `lib/cron-auth.ts`, not a new scheme.
- New articles are **never** auto-published — they land as `pending` and require explicit owner approval in the dashboard before becoming a public page. (Decided 2026-08-08, given the pipeline has previously generated off-target keywords that were caught by human review before posting to GBP.)
- No new external dependency beyond `react-markdown`, which was explicitly approved for this feature.
- Secrets (`BLOG_WEBHOOK_SECRET`) go in `.env.local` only, per this repo's existing security rules — never hardcoded, never logged.

---

## Data Model

New table in the existing Neon database (`lib/db.ts`'s `getDb()`), created idempotently the same way `lib/events.ts` creates `event_bookings`:

```sql
CREATE TABLE IF NOT EXISTS blog_posts (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT         UNIQUE NOT NULL,
  title             TEXT         NOT NULL,
  body              TEXT         NOT NULL,       -- markdown
  meta_description  TEXT         NOT NULL DEFAULT '',
  source_keyword    TEXT         NOT NULL DEFAULT '',
  status            TEXT         NOT NULL DEFAULT 'pending', -- 'pending' | 'published'
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  published_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS blog_posts_status_idx ON blog_posts(status);
```

**Slug generation:** lowercase the title, replace non-alphanumeric runs with `-`, trim leading/trailing `-`. On collision with an existing slug, append `-2`, `-3`, etc. until unique. Example: "Best Hyderabadi Biryani in McKinney, TX" → `best-hyderabadi-biryani-in-mckinney-tx`.

---

## Components

### 1. `lib/blog.ts` — DB helper (mirrors `lib/events.ts`)

```ts
export interface BlogPost {
  id: string
  slug: string
  title: string
  body: string
  metaDescription: string
  sourceKeyword: string
  status: 'pending' | 'published'
  createdAt: string
  publishedAt: string | null
}

export async function ensureBlogPostsTable(): Promise<void>
export async function createPendingPost(params: {
  title: string; body: string; metaDescription: string; sourceKeyword: string
}): Promise<BlogPost>
export async function listPendingPosts(): Promise<BlogPost[]>
export async function listPublishedPosts(): Promise<BlogPost[]>
export async function getPublishedPostBySlug(slug: string): Promise<BlogPost | null>
export async function approvePost(id: string): Promise<void>   // sets status='published', published_at=NOW()
export async function deletePost(id: string): Promise<void>    // used for "reject"
```

`createPendingPost` owns slug generation and collision handling internally.

### 2. `app/api/webhooks/seo-content/route.ts` — receives articles

```ts
export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.BLOG_WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => null)
  if (!body?.title || !body?.body) {
    return NextResponse.json({ error: 'Missing title or body' }, { status: 400 })
  }
  const post = await createPendingPost({
    title: body.title,
    body: body.body,
    metaDescription: body.metaDescription ?? '',
    sourceKeyword: body.sourceKeyword ?? '',
  })
  // publishedUrl is what the article looks like once approved — the SEO
  // pipeline stores this on the article row even though it isn't live yet.
  return NextResponse.json({ publishedUrl: `https://yoi-dashboard.vercel.app/blog/${post.slug}` })
}
```

Matches the existing `WebhookPublisher` contract: POST body `{ title, body, metaDescription }`, response `{ publishedUrl }`.

### 3. `app/api/blog-posts/route.ts` + `app/api/blog-posts/[id]/route.ts` — dashboard-side management

- `GET /api/blog-posts` — returns `{ pending: BlogPost[], published: BlogPost[] }`
- `POST /api/blog-posts/[id]/approve` — calls `approvePost`
- `DELETE /api/blog-posts/[id]` — calls `deletePost` (reject)

None of these three routes need custom auth code: `middleware.ts` protects any path not listed in its `PUBLIC_PATHS` array by default (verifying the `yoi_session` cookie via `AUTH_SECRET`), and `/api/blog-posts` is deliberately **not** added to that list — same as every other internal dashboard API route.

### 4. `app/components/tabs/Blog.tsx` — new dashboard tab

Added to the existing `TabNav` alongside Catering, Events Space, Table Reservations. Two sections:
- **Pending review** — title, source keyword, created date, an expandable preview of the rendered markdown, Approve / Reject buttons
- **Published** — title, published date, link to the live `/blog/[slug]` page

Follows the existing card/table visual conventions already used by `Catering.tsx` and `ArticleList`-style components.

### 5. `app/blog/page.tsx` — public index

Lists all `published` posts (title, meta description, published date), each linking to `/blog/[slug]`. Plain public page, no auth, no `force-dynamic` gating like the secret-slug pages — this one is meant to be crawled.

### 6. `app/blog/[slug]/page.tsx` — public post page

```tsx
export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPublishedPostBySlug(slug)
  if (!post) notFound()
  return (
    <article>
      <h1>{post.title}</h1>
      <ReactMarkdown>{post.body}</ReactMarkdown>
    </article>
  )
}
export async function generateMetadata({ params }) {
  // sets <title> and meta description from post.title / post.metaDescription
}
```

Uses `react-markdown` directly on `post.body` — no `dangerouslySetInnerHTML`, so no sanitization step needed.

### 7. `middleware.ts` — add two entries to `PUBLIC_PATHS`

```ts
'/blog/',                     // public blog index + post pages, no session needed
'/api/webhooks/seo-content',  // authenticated via Bearer token instead, not the session cookie
```

Comment style matches the existing Events Space / Staff Hours entries already in that array.

### 8. `app/sitemap.ts` — Next.js sitemap route

Standard Next.js `MetadataRoute.Sitemap` export, listing `/blog` and every published `/blog/[slug]` URL with its `published_at` as `lastModified`.

---

## Data Flow

1. seo-content-saas's cron pipeline generates an article → `WebhookPublisher.publish()` POSTs `{ title, body, metaDescription }` with `Authorization: Bearer ${BLOG_WEBHOOK_SECRET}` to `yoi-dashboard.vercel.app/api/webhooks/seo-content`
2. YOI-Dashboard validates the token, inserts a `pending` row, responds with the future `publishedUrl`
3. Owner opens the **Blog** tab, sees the pending post, reviews the rendered preview, clicks **Approve**
4. `blog_posts.status` flips to `published`, `published_at` set
5. `/blog/[slug]` now serves the page publicly; `/blog` index and `sitemap.xml` include it

---

## Error Handling

- Webhook: invalid/missing Bearer token → `401`. Missing `title`/`body` → `400`. Both cases return a JSON `{ error }` body per this repo's existing API convention — no silent failures.
- Slug collisions are resolved automatically inside `createPendingPost`, never surfaced as an error.
- `getPublishedPostBySlug` returning `null` → Next.js `notFound()` (standard 404), matching the existing `app/staff-hours/[slug]/page.tsx` pattern.
- Reject deletes the row outright — no soft-delete/rejected state, since a rejected AI draft has no future value once dismissed.

---

## Testing

YOI-Dashboard has no test framework configured anywhere in the repo — introducing one is out of scope here (not asked for, inconsistent with every other feature in this codebase). Verification for the YOI-Dashboard side is: `npm run type-check` passes, plus manual verification (curl the webhook with a valid/invalid token, approve/reject a post through the UI, confirm `/blog/[slug]` and `sitemap.xml` render correctly).

seo-content-saas already has `vitest` configured (114+ existing tests) — its one change gets a real test:
- `webhook-publisher.test.ts` — updated to assert the `Authorization: Bearer` header is sent correctly with the configured token

---

## Cross-Repo Change (seo-content-saas)

`lib/providers/cms/webhook-publisher.ts` needs one addition: read `WEBHOOK_AUTH_TOKEN` (or similar) from the site's `cmsCredentials` (already an encrypted JSON blob per site) and send it as `Authorization: Bearer ${token}`. The actual secret value must match `BLOG_WEBHOOK_SECRET` in YOI-Dashboard's env — set once when configuring the yumofindiamckinney.com site's `cmsCredentials.webhookAuthToken`, out of scope for this plan's automated tasks (a manual one-time DB update, same as adding the DataForSEO credentials was).
