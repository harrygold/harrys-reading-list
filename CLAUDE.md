# CLAUDE.md — Project Instructions for AI-Assisted Development

## Project Overview

Personal reading list app for Harry Gold. Zero-dependency static site (vanilla HTML/CSS/JS, localStorage only). See `project_brain.md` for full architecture, data model, and feature documentation.

## File Structure

- `index.html` — Single page, all modals inline
- `app.js` — All application logic (~1,100 lines, single IIFE, `'use strict'`)
- `styles.css` — All styles (~1,300 lines, CSS custom properties)
- `seed-data.js` — Seed data as JS constant (`SEED_DATA`), loaded by app
- `seed-data.json` — Same data in pure JSON (manual mirror, not loaded by app)
- `project_brain.md` — Canonical architecture and feature documentation

## Key Conventions

### Code
- No frameworks, no build tools, no npm — vanilla JS only
- All JS lives in a single IIFE in `app.js`
- DOM elements referenced by ID via `document.getElementById`
- Use `escapeHtml()` and `escapeAttr()` for all user-supplied content in HTML
- camelCase for variables/functions, BEM-ish for CSS classes

### CSS
- All colors, radii, shadows, and transitions use CSS custom properties (`:root`)
- Accent color is amber/gold (`--color-accent: #d97706`)
- Mobile breakpoints at 768px and 480px

### Data
- localStorage key: `harrys-reading-list`
- Cover cache key: `reading-list-covers`
- Book IDs: `'b' + Date.now().toString(36) + random`

## Things to Keep in Sync

When modifying these, update **both** locations:
- **Genre list**: `<select id="formGenre">` in `index.html` AND `ALL_GENRES` array in `app.js`
- **Seed data**: `seed-data.js` AND `seed-data.json` (keep identical)
- **Status values**: `STATUS_LABELS` in `app.js`, `<select>` in `index.html`, and section rendering logic

## Design Rules

- "Top Picks" section = `favorite: true` AND `status: 'finished'`; these are excluded from "Finished" section
- Star ratings only display on grid cards when `status === 'finished'`
- Grid and list views have independent sort states
- No external dependencies — don't add npm packages or CDN libraries without explicit approval

## When Updating project_brain.md

After completing a feature or making an architectural change, update the relevant sections in `project_brain.md` to keep it current. It is the source of truth for this project.
