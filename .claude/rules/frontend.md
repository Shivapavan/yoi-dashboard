# Frontend Rules — YOI Dashboard

## Stack
- Next.js 15 (App Router), React 19, TypeScript (strict).
- Tailwind CSS 3.4. Charts: `recharts`. Excel export: `xlsx`.

## Brand tokens (defined in `tailwind.config.ts` + `app/globals.css`)
- Primary: `yoi-primary` = teal `#0D9488` (+ `yoi-primary-dark`, `yoi-primary-light`).
- Accent: `yoi-accent` = amber `#D97706` (+ `yoi-accent-light`).
- Semantic: `success`, `warning`, `danger` (each has `.light` / `.text` variants). Use these for status — never raw `green-`/`yellow-`/`red-` ad hoc.
- Charts: Gross Sales bars teal `#0D9488`, Net Sales bars amber `#D97706`.
- The logo (`/yum_logo.png`) is purple — that's intentional, leave it.

## Components (`app/components/`, tabs in `app/components/tabs/`)
- Reuse `SectionCard` / `CollapsibleSection` (`components/SectionCard.tsx`) for every section card — do NOT hand-roll the white-card + colored-left-border + chevron pattern.
- Use `MetricCard` for stat cards, `DatePicker` for date selection, `Skeleton`/`SkeletonCards`/`SkeletonTable` for first-load states, `Chevron` for expand/collapse glyphs.
- Functional components only. Co-locate types.

## Accessibility (already wired in `globals.css`)
- Global `:focus-visible` ring + `prefers-reduced-motion` block exist — don't remove them.
- Interactive rows/headers must be keyboard-operable (`role="button"`, `tabIndex`, Enter/Space) — see `EmpShdt`/`TopItems`.
- Keep real data text at `text-gray-500`+ (not `gray-400`); touch targets ≥ ~36px.

## Owner-facing UX conventions (owner preferences — keep)
- Header: large centered logo with the dashboard title stacked underneath.
- Disputed Transactions alert renders at the BOTTOM of the page.
- Card-processing detail is hidden on today's live view (updates every 5 min, confuses the owner).
- Money formatted as `$X,XXX.XX`; business day starts 4 AM CDT.
