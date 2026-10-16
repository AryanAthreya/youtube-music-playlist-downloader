# UI/UX Redesign Specification & Implementation Plan
**Branch:** `feature/ui-redesign`  
**Target Style:** Soft "Neumorphism-Lite" (Cool-grey surfaces, floating rounded cards, diffuse shadows, deep-navy accents, Quicksand typography)  
**Scope:** Presentation layer only (zero backend, Docker, or data logic changes)

---

## 1. Visual Design Architecture & Tokens

### 1.1 Color Palettes & Surfaces
The design emulates the reference 3-screen mobile layout (Discover, Player, Music list), offering a calm, airy, and tactile aesthetic.

| Token | Light Theme ("Soft Light" - Default) | Dark Theme ("Soft Dark") | Purpose |
| :--- | :--- | :--- | :--- |
| `--bg-page` | `#F3F5FA` | `#0D1220` | Root canvas background |
| `--bg-card` | `#FFFFFF` | `#161C2E` | Floating content cards, sheets, panels |
| `--bg-card-subtle` | `#F8FAFC` | `#1E263D` | Secondary cards, pill inputs, list item hovers |
| `--text-primary` | `#1A1F2C` | `#EAF0FF` | Primary headlines, titles, active tabs |
| `--text-muted` | `#9AA3B5` | `#7F8AA6` | Artists, subtext, inactive tab labels, metadata |
| `--accent-navy` | `#2B4C8F` | `#6C95FF` | Primary circular buttons, active indicators, sliders |
| `--accent-soft` | `#E6ECF8` | `#202D4E` | Pill badges, progress tracks, active icon rings |
| `--card-border` | `rgba(226, 232, 240, 0.8)` | `rgba(255, 255, 255, 0.08)` | Subtle boundary stroke |
| `--shadow-soft` | `0 12px 32px rgba(35, 55, 110, 0.10)` | `0 12px 32px rgba(0, 0, 0, 0.40)` | Floating elevation for cards and sheets |
| `--shadow-subtle` | `0 4px 14px rgba(35, 55, 110, 0.06)` | `0 4px 14px rgba(0, 0, 0, 0.25)` | Small chips, buttons, list rows |
| `--shadow-inner` | `inset 0 2px 4px rgba(35, 55, 110, 0.05)` | `inset 0 2px 4px rgba(0, 0, 0, 0.25)` | Search pill input inset shadow |

### 1.2 Radii & Geometry
- **Pills / Badges / Search / Chips:** `rounded-full` (`9999px`)
- **Cards & Floating Panels:** `rounded-[26px]` / `rounded-3xl`
- **Artwork Squircles (Now Playing):** `rounded-[32px]`
- **Thumbnails (List rows):** `rounded-[18px]`
- **Buttons (Primary action circles):** `rounded-full`

### 1.3 Typography
- **Primary / Display:** `Quicksand` (Google Fonts via `next/font/google`, weights 500, 600, 700), variable `--font-quicksand`.
- **Secondary / Numerals:** `Inter` (already present, variable `--font-inter`), for timestamps, progress numbers, file sizes.
- **Fallback Stack:** `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`.

### 1.4 Dynamic Artwork Accent (Now Playing)
- Extracted client-side via a lightweight canvas sampler in `frontend/lib/ui/colorExtractor.ts`.
- Samples only same-origin images (`/api/thumb?url=...`) to avoid tainted canvas errors.
- Lightness is clamped (`0.30 <= L <= 0.70`) to guarantee contrast ratio $\ge 4.5:1$ against text.
- Cached in-memory by track ID (`Map<string, string>`).
- Fallback: Theme accent (`--accent-navy`).
- Default: Enabled for Now Playing background aura; toggleable in Settings.

---

## 2. Navigation Architecture & Screen Mapping

### 2.1 Navigation Mapping (Mobile & Desktop)
Existing tabs (`"downloader"`, `"history"`, `"playlists"`, `"player"`) are mapped onto the reference 4-item bottom navigation bar:

```
┌────────────────────────────────────────────────────────┐
│                   Top Header Bar                       │
│  [☰ Menu / Settings]    Discover / Musics    [⋮ More]  │
├────────────────────────────────────────────────────────┤
│                                                        │
│                    Active Screen                       │
│   (Discover / Library / Liked / Downloads / Player)    │
│                                                        │
├────────────────────────────────────────────────────────┤
│             Floating Mini-Player Card                  │
│       [Thumb]   Title - Artist   [♡] [⏮] [▶] [⏭]      │
├────────────────────────────────────────────────────────┤
│                   Bottom Nav Bar                       │
│   [⌂ Home]    [◎ Music]    [♡ Liked]    [📥 Downloads] │
└────────────────────────────────────────────────────────┘
```

1. **Tab 1: Home / Discover (`"downloader"`):**
   - Top greeting ("Welcome!" / "Good morning!").
   - Pill search & YouTube URL input with soft inner shadow.
   - "Jump back in" horizontal carousel of tall squircle cards with frosted glass play pills.
   - Switcher tabs ("Recently / Most played / Liked").
   - Quick-action vertical track rows with kebab context menus.
2. **Tab 2: Music / Library (`"history"`):**
   - Screen title: "Music list".
   - Underline-style tabs: **Songs** | **Artists** | **Albums** | **Playlists**.
   - Search & sort within library, "Saved offline" chip filter.
   - Track rows with rounded thumbnails and kebab action triggers.
3. **Tab 3: Liked (`"liked"` / Jump to Liked smart playlist):**
   - Directly displays the built-in Liked Songs collection.
   - Quick Play All, Shuffle, Save all offline.
4. **Tab 4: Downloads (`"downloads"`):**
   - Active download progress, job queue, completed files manager, storage usage estimate.
   - Badge indicator with number of active/completed jobs.
5. **Now Playing / Full Player:**
   - Full-screen slide-up bottom sheet over any active tab.
   - Can be triggered from floating mini-player or the Player tab.
   - Dismissible via top drag handle or swipe-down gesture.
6. **Desktop Layout ($\ge$ md / lg):**
   - Preserves the 2-column docked layout: Left navigation rail + main content, right sticky Player column.
   - Reskinned with the identical soft-light / soft-dark tokens, cards, and Quicksand typography.

---

## 3. Component Transformation Map (Old $\to$ New)

All existing component props, hooks, exports, and callbacks are preserved 100%.

| Existing Component | New Presentation Role | Key Visual Upgrades |
| :--- | :--- | :--- |
| `UrlInputForm.tsx` | Discover Pill Search Input | Pill shape (`rounded-full`), soft inset shadow, search icon at right, animated loading spinner inside pill. |
| `RecentAndActiveSection.tsx` | "Jump back in" Carousel & Switcher | Horizontal scrollable carousel of tall squircle cards with full-bleed artwork + frosted glass pill overlay; 3-way switcher ("Recently / Most played / Liked"). |
| `SearchResults.tsx` | Discover Search Results List | Soft floating cards, rounded squircle artwork, kebab context menu, inline stream play pill button, skeleton shimmer loading. |
| `NowPlayingSection.tsx` | Slide-Up Sheet Player | Slide-up bottom sheet with drag handle, squircle artwork (32px radius) with subtle playing pulse, heart button, custom thin progress scrubber with glowing knob, navy circular play/pause button, gesture listeners (swipe skip, double-tap like). |
| `MiniPlayerBar.tsx` | Floating Mini-Player Card | Floating rounded card above bottom nav, squircle thumbnail, circular progress ring around round navy play/pause button, marquee title, swipe-up to expand. |
| `FileList.tsx` | Music List (Songs, Artists, Albums) | Underline-style tab header (**Songs / Artists / Albums / Playlists**), rounded thumbnail rows with kebab menu, filter chips, delete confirmation modal. |
| `PlaylistsSection.tsx` | Playlists Grid & Detail View | Visual playlist grid with collage covers, pinned Liked Songs card, clean detail view with track list and action bar. |
| `BottomNavBar.tsx` | Soft Neumorphic Tab Bar | 4 tabs (Home, Music, Liked, Downloads), active ring highlight + label with smooth CSS transitions, active jobs counter badge. |
| `VideoInfoCard.tsx` | Single Track Download Sheet | Floating card with squircle preview, audio bitrate pills, navy download button. |
| `PlaylistVideoList.tsx` | Playlist Batch Download Sheet | Selection list with checkbox pills, select-all toggle, batch download trigger. |
| `ProgressBar.tsx` | Download Progress Card | Smooth navy progress bar, speed badge, ETA label, soft card container. |
| `QueueDrawer.tsx` | Bottom Queue Sheet | Slide-up sheet matching the reference player aesthetic, drag-to-reorder rows, remove swipe/button. |
| `LikeButton.tsx` | Heart Micro-Interaction | Heart pop animation with scale bounce (`scale(1.25) -> scale(1)`), filled navy/accent state. |
| `ThemeSelectorModal.tsx` | Appearance & Theme Sheet | Adds **"Soft Light"** and **"Soft Dark"** cards, follow-system toggle, dynamic artwork accent toggle. |
| `ErrorBanner.tsx` / `OfflineBanner.tsx` | Soft Notice Banners | Clean inline SVG icons, soft pastel backgrounds, rounded-2xl pills. |

---

## 4. Interaction, Gestures & Motion System

### 4.1 Motion Design Principles
- **Tokens:**
  - Fast: `150ms cubic-bezier(0.4, 0, 0.2, 1)` (button taps, heart toggle, hover states)
  - Medium: `250ms cubic-bezier(0.16, 1, 0.3, 1)` (tab indicator transitions, card expansions)
  - Sheet/Slide: `350ms cubic-bezier(0.32, 0.72, 0, 1)` (full player slide-up/down)
- **Scale Feedback:** `active:scale-[0.96]` on buttons and clickable cards.
- **Hardware Acceleration:** Animations strictly utilize `transform` and `opacity` to avoid layout reflow and run at 60fps on low-end mobile devices.
- **`prefers-reduced-motion`:** Automatically disables artwork breathing and smooth slide transitions when enabled.

### 4.2 Native Pointer Gestures (No external gesture libraries)
- **Player Sheet:**
  - Drag down on handle or artwork: slides sheet down and snaps back to mini-player if threshold $> 80$px is reached.
  - Swipe left on artwork: Next track (`onPlayNext`).
  - Swipe right on artwork: Previous track (`onPlayPrev`).
  - Double-tap on artwork: Toggles like state with heart burst animation.
- **Mini-Player:**
  - Swipe up: Opens full player sheet.
  - Swipe left: Next track.
  - Swipe right: Previous track.
- **List Rows:**
  - Tap row: Plays track.
  - Tap kebab (`...`): Opens action context menu (Add to playlist, Download, Save offline, Queue next).

---

## 5. Theme Presets & Persistence Architecture

1. **Existing Presets Kept Intact:**
   - `lime`, `cream`, `purple`, `red`, `cyan`, `emerald`, `amber` continue to work without breaking changes.
2. **New Presets Added to `ThemeContext.tsx`:**
   - `soft-light`: Light cool-grey `#F3F5FA`, surface `#FFFFFF`, navy `#2B4C8F`, Quicksand font.
   - `soft-dark`: Deep dark `#0D1220`, surface `#161C2E`, soft blue `#6C95FF`, Quicksand font.
   - `system`: Follows `prefers-color-scheme` automatically.
3. **Default for Fresh Users:**
   - If `localStorage.getItem("ytdl_theme_preset")` is null, defaults to `"soft-light"`.
   - Existing users' saved themes are strictly honored.

---

## 6. Guardrail Invariants & Verification Checklist

### 6.1 Untouchable Files Guardrail Check
Before any merge, verify the following command produces empty output:
```bash
git diff --stat main...HEAD -- backend docker-compose* Caddyfile scripts .github frontend/lib/api.ts frontend/lib/websocket.ts frontend/lib/db.ts frontend/lib/offlineManager.ts frontend/lib/player frontend/public/sw.js frontend/app/manifest.ts
```
Only allowed addition under `frontend/lib/`: `frontend/lib/ui/colorExtractor.ts` (purely client-side canvas color sampler).

### 6.2 Test & Build Invariants
- Backend tests: `PYTHONPATH=backend pytest backend/tests -v` (all 103+ tests pass).
- Frontend tests: `npm --prefix frontend test` (all 28+ unit tests pass).
- Next.js build: `npm --prefix frontend run build` (zero errors, valid App Router bundle).

---

## 7. Phased Implementation Steps & Commit Plan

Each step will be committed separately upon completion:

- [ ] **Step 1: Design Tokens, Quicksand Font & Theme System Setup**
  - Commit: `feat(ui): add quicksand font, soft-light/soft-dark tokens, and theme presets`
- [ ] **Step 2: Bottom Navigation Bar & Top Header Reskin**
  - Commit: `feat(ui): reskin bottom nav bar with active ring and soft top header`
- [ ] **Step 3: Home / Discover Screen Reskin**
  - Commit: `feat(ui): reskin discover view with greeting, pill search, and trending carousel`
- [ ] **Step 4: Floating Mini-Player Bar Reskin**
  - Commit: `feat(ui): reskin floating mini-player card with circular progress ring`
- [ ] **Step 5: Player / Now Playing Bottom Sheet Reskin**
  - Commit: `feat(ui): reskin now playing screen with squircle artwork, custom scrubber, and gestures`
- [ ] **Step 6: Music List (Library & Playlists) Underline Tabs Reskin**
  - Commit: `feat(ui): reskin music list with underline tabs, artist/album filters, and playlist grid`
- [ ] **Step 7: Downloader, Queue, Modals & Notification Sheets Reskin**
  - Commit: `feat(ui): reskin queue drawer, download cards, progress bar, and modals`
- [ ] **Step 8: Verification, Guardrail Audit & Cross-Device Walkthrough**
  - Run full test suite, build bundle, verify responsive viewports, and audit guardrails.
