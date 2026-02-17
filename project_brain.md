# Project Brain — Harry's Reading List

> Single source of truth for the architecture, features, and conventions of this project.
> Last updated: 2026-02-17

---

## 1. What This Is

A personal reading list web app for Harry Gold. It tracks books across their lifecycle
(wishlist → owned → reading → finished) with ratings, notes, cover art, and rich metadata.
It's designed to be a polished, self-contained static site with no backend.

---

## 2. Stack & Architecture

| Layer | Choice | Notes |
|-------|--------|-------|
| **Frontend** | Vanilla HTML/CSS/JS | No framework, no build step |
| **Styling** | Custom CSS with CSS variables | Inspired by Linear/Apple/Notion aesthetic |
| **Font** | Inter (Google Fonts) | Loaded via `@import` in CSS |
| **Persistence** | `localStorage` | Key: `harrys-reading-list` |
| **Cover images** | Open Library API + Google Books API (fallback) | Cached in localStorage under `reading-list-covers` |
| **Book search** | Open Library Search API | Used in add/edit form to auto-fill metadata |
| **Build tools** | None | Open `index.html` directly or serve with any static server |
| **Tests** | None yet | — |
| **Deployment** | Not configured | Static files, deployable anywhere |

### File Structure

```
reading-list/
├── index.html        # Single-page HTML (all modals inline)
├── app.js            # All application logic (~1,100 lines, IIFE)
├── styles.css        # All styles (~1,300 lines)
├── seed-data.js      # Seed data as a JS constant (SEED_DATA)
├── seed-data.json    # Same data in pure JSON (manual mirror)
└── project_brain.md  # This file
```

### Data Flow

1. On load, `app.js` reads from `localStorage`.
2. If empty, it falls back to `SEED_DATA` from `seed-data.js`.
3. All mutations (add/edit/delete/status change) write back to `localStorage` immediately.
4. Cover images are lazy-loaded via `IntersectionObserver` and cached in a separate localStorage key.

---

## 3. Book Data Model

Each book is a plain JSON object with this schema:

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Generated: `'b' + Date.now().toString(36) + random` |
| `title` | string | **Required** |
| `author` | string | **Required** |
| `genre` | string | From a fixed list of 42 genres |
| `yearPublished` | number \| null | — |
| `pageCount` | number \| null | — |
| `coverImage` | string | URL; empty string if none |
| `format` | string | `"Physical (New)"`, `"Physical (Used)"`, `"Digital/Kindle"`, `"Audiobook"`, or `""` |
| `status` | string | `"wishlist"`, `"up-next"`, `"reading"`, `"on-hold"`, `"finished"` |
| `datePurchased` | string | ISO date or `""` |
| `dateStarted` | string | ISO date or `""` |
| `dateCompleted` | string | ISO date or `""` |
| `currentPage` | number \| null | For tracking reading progress |
| `rating` | number \| null | 1–5, only meaningful for finished books |
| `favorite` | boolean | Marks as "Top Pick" |
| `tags` | string[] | Free-form tags (e.g., `"gifted to me"`, `"donated"`) |
| `recommendedBy` | string | Free text |
| `notes` | string | Personal notes |
| `description` | string | What the book is about |
| `dateAdded` | string | ISO date, set automatically on creation |

---

## 4. Feature Set (Current)

### Display & Navigation
- **Six content sections**: Top Picks, Currently Reading, Finished, On Hold, Up Next, Wishlist
- **Grid view**: Book cards with cover art (3:4 aspect ratio), title, author, genre tag, star rating, progress bar
- **List view**: Sortable table with columns for Title, Author, Genre, Rating, Status, Format
- **View preference** persisted in localStorage
- **Section counts** shown in headers (e.g., "Finished (62)")
- **Empty sections** hidden when filters are active

### Filtering & Search
- **Search bar**: Filters by title or author (debounced, 200ms)
- **Filter pills**: Genre, Status, Format, Rating — each opens a dropdown
- **Sort pill**: Date Added (default), Title, Author, Rating, Year Published
- **Clear filters button**: Appears when any filter/sort is active
- **List view has independent column sorting** (click headers to sort/toggle direction)

### Book Management
- **Add Book**: Opens form modal; default status is "Up Next"
- **Edit Book**: Pre-fills form from existing data
- **Delete Book**: Confirmation dialog before removal
- **Quick status change**: Dropdown in detail modal moves book between sections
- **Open Library search**: Auto-fills title, author, year, page count, and cover URL from search results

### Cover Art
- **Explicit URL**: User can paste a cover image URL in the form
- **Auto-fetch**: For books without a cover, the app tries:
  1. Open Library (title + author)
  2. Open Library (title only)
  3. Google Books API
- **Lazy loading**: Covers fetched only when cards scroll into view (200px rootMargin)
- **Caching**: All fetched cover URLs cached in localStorage to avoid repeated API calls
- **Fallback**: SVG book icon placeholder with gradient background

### Import / Export
- **Export**: Downloads full book array as timestamped JSON file
- **Import**: Accepts JSON file upload or pasted text
- **Merge mode**: Adds new books (by ID), skips duplicates
- **Replace mode**: Overwrites entire library

### UI Polish
- **Toast notifications** for all actions (auto-dismiss after 3s)
- **Modal animations** (scale + fade)
- **Sticky toolbar** with z-index layering
- **Responsive design**: Breakpoints at 768px and 480px
- **Keyboard support**: Escape closes modals and dropdowns
- **Click-outside** closes modals and dropdowns
- **Rating legend** toggle in toolbar
- **Format badges** on card covers (Kindle, Audio, New, Used)
- **Progress bars** for books with currentPage + pageCount

---

## 5. Design Decisions (Implicit, Now Documented)

### "Top Picks" Logic
- A book appears in the **Top Picks** section only if `favorite === true` AND `status === 'finished'`.
- Favorited books that are finished are **excluded** from the "Finished" section to avoid duplication.
- Books marked as favorite but in other statuses (e.g., "reading") do **not** appear in Top Picks.

### Genre List
- The genre list is **hardcoded** in two places: the `<select>` in `index.html` and the `ALL_GENRES` array in `app.js`.
- It is **not** dynamically derived from the book data.
- New genres must be added to both locations manually.

### Seed Data Duplication
- `seed-data.js` (loaded by the app) and `seed-data.json` (for reference/import) contain the same data.
- They must be kept in sync manually. The app only reads from `.js`.

### Persistence Scope
- **View preference** (grid/list) is persisted in localStorage.
- **Filter and sort state** is NOT persisted — resets on page reload.
- **Search text** is NOT persisted.

### Rating Display
- Star ratings are **only shown on cards** when `status === 'finished'` and `rating` is set.
- In the detail modal, ratings are shown regardless of status (if set).
- The rating guide maps: 5=Exceptional, 4=Really Good, 3=Good Read, 2=Not Great, 1=Skip It.

### ID Generation
- IDs are client-generated strings: `'b' + Date.now().toString(36) + Math.random().toString(36).slice(2,6)`.
- Seed data uses sequential IDs (`b001`–`b097`).
- No server-side ID coordination needed since this is a single-user local app.

### Sorting Behavior
- **Grid view** uses the global sort pill (defaults to Date Added, descending).
- **List view** has its own independent sort state (column + direction), defaulting to Title ascending.
- These two sort states are independent and do not affect each other.

---

## 6. Current Data Stats (Seed)

| Metric | Count |
|--------|-------|
| Total books | 97 |
| Finished | 70 |
| Currently Reading | 3 |
| On Hold | 5 |
| Up Next | 13 |
| Wishlist | 1 |
| Top Picks (5-star favorites) | 3 |
| Rated books | 23 |
| Unrated books | 74 |
| Unique genres used | ~20 of 42 available |

---

## 7. Known Gaps / Future Considerations

These are not bugs — they're areas where the app could be extended:

- **No `.gitignore`** — should add one (node_modules if any tooling is added, .DS_Store, etc.)
- **No CLAUDE.md** — project conventions for AI-assisted development not yet documented
- **No tests** — no unit or integration tests exist
- **No build step** — no minification, bundling, or linting
- **Genre sync** — genre list duplicated between HTML and JS; could be generated from one source
- **Seed data sync** — `.js` and `.json` files must be kept in sync manually
- **Filter state not persisted** — could be a URL hash or localStorage feature
- **No dark mode** — CSS variables are set up to support it, but no toggle or media query exists
- **localStorage limits** — no handling for quota exceeded; cover cache can grow unbounded
- **Accessibility** — no ARIA attributes, no skip navigation, no focus management in modals
- **No offline support** — cover fetching requires network; no service worker

---

## 8. Conventions

### Code Style
- All JS wrapped in a single IIFE (no modules, no imports)
- `'use strict'` enabled
- camelCase for variables and functions
- DOM elements referenced by ID using `document.getElementById`
- HTML escaping via DOM (`escapeHtml`) and manual regex (`escapeAttr`)
- No external dependencies whatsoever

### CSS Conventions
- CSS custom properties (variables) for all colors, radii, shadows, transitions
- BEM-ish class naming (`.book-card-cover`, `.filter-dropdown-item`)
- Mobile-first responsive adjustments via `@media (max-width: ...)`
- Accent color: amber/gold (`#d97706`)

### Commit Style
- Descriptive commit messages
- Co-authored with Claude Code
