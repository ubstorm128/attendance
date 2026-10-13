---
name: Attendance App Design System
description: Cupertino-inspired academic command center with frosted glass surfaces, high-contrast telemetry, and multi-portal role architecture
colors:
  primary: "#0066CC"
  primary-hover: "#0055B3"
  primary-press: "#004494"
  surface: "#F5F5F7"
  canvas: "#FAFAFC"
  card: "#FFFFFF"
  ink: "#1D1D1F"
  ink-secondary: "#48484A"
  ink-tertiary: "#59595E"
  success: "#248A3D"
  success-text: "#135B25"
  warning: "#B25E00"
  danger: "#D70015"
  coordinator-purple: "#7C3AED"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: "600"
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: "600"
    letterSpacing: "-0.015em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: "600"
    letterSpacing: "-0.01em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: "400"
    lineHeight: "1.45"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: "600"
    letterSpacing: "0.02em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace"
rounded:
  sm: "8px"
  md: "12px"
  lg: "18px"
  xl: "22px"
  card: "20px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "24px"
  xl: "32px"
---

# Design System: Cupertino Academic Command Center

## 1. System Vision & Philosophy

**Creative North Star: "The Ambient Lecture Sanctuary"**

The Attendance App design language is built on Apple Human Interface Guidelines principles: quiet confidence, optical transparency, tactile feedback, and extreme glanceability. The system replaces chaotic manual attendance sheets and cluttered enterprise portals with an unified, glassmorphic command center tailored for lecture auditoriums, student mobile devices, and institutional administration.

### Core Architecture Across Portals
1. **Teacher Admin (`/dashboard.html` / `teacher-admin-page`)**: High-performance podium cockpit featuring live QR session projection, real-time SSE student check-in feeds, subject catalog management, and attendance history logs.
2. **Student Portal (`/profile.html` & `/dashboard.html`)**: Personal telemetry hub featuring camera QR scanning with sensory haptics, attendance streak metrics, course breakdown gauges, class leaderboard, and Class Coordinator management workspace.
3. **Attendance Admin (`/attendance-admin/dashboard.html`)**: System administration command deck featuring Cupertino pill-based section toggles (`Teachers`, `Students`, `Security`), account management, and floating-label credential security.
4. **Auth Experience (`/main`, `/login.html`, `/register-*.html`, `/reset-password.html`)**: Minimalist glassmorphic auth cards with tabbed student/staff switching, enrollment validation, and Supabase Google OAuth integration.

---

## 2. Color System & Contrast Standards

### Backgrounds & Surfaces
- **Canvas (`--bg-0` / `#F5F5F7`)**: Warm, low-strain neutral canvas optimized for long lecture hall visibility and low ambient glare.
- **Card Surface (`--bg-card` / `#FFFFFF`)**: Pure white squircle card material with soft diffuse elevation.
- **Elevated Glass (`--bg-card-elevated`)**: `rgba(255, 255, 255, 0.92)` to `0.96` with `backdrop-filter: blur(20px) saturate(160%)`.
- **Input Neutral (`--bg-input` / `#F6F7F9`)**: Subtle inset fill for form fields, switching to pure white on `:focus`.

### Ink Hierarchy
- **Ink Primary (`--ink` / `#1D1D1F`)**: Deepest near-black for primary numerals, card titles, and active tabs. Contrast >= 12:1 against canvas.
- **Ink Secondary (`--ink-2` / `#48484A`)**: Slate neutral for timestamps, table metadata, and inactive navigation labels. Contrast >= 7:1.
- **Ink Tertiary (`--ink-3` / `#59595E`)**: Supporting caption text, input placeholders, and inactive icons. Contrast >= 4.5:1 (WCAG AA compliant).

### Semantic & Accent Colors
- **Primary Brand (`--primary` / `#0066CC`)**: Apple Royal Blue. Reserved for affirmative focal actions (Launch Session, Save, Active Pill, Active Nav Icons).
  - Hover: `#0055B3` | Press: `#004494` | Tint: `rgba(0, 102, 204, 0.10)`
- **Success (`--success` / `#248A3D` | Text: `#135B25`)**: Cupertino Emerald. Used for verified check-in badges, Good Standing status indicators, and live session pulses.
- **Warning (`--warning` / `#B25E00`)**: Amber. Used for warning attendance bands (<75%) and cautionary alerts.
- **Danger (`--danger` / `#D70015`)**: Apple Crimson. Strictly for destructive, irreversible actions (End Session, Delete Record, Cancel).
- **Coordinator Accent (`#7C3AED` / `rgba(124, 58, 237, 0.12)`)**: Royal Violet for student class coordinator badges and elective management notices.

---

## 3. Typography & Hierarchy

The system uses Apple's native system font stack: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif`.

| Text Level | Size | Weight | Tracking | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Display / Telemetry** | 24px–32px | 700 / 600 | -0.02em | Glanceable counts, attendance % metrics, projector numbers |
| **Headline (H2)** | 18px–20px | 600 | -0.015em | Panel headings, modal titles, section headers |
| **Title (H3)** | 15px–16px | 600 | -0.01em | Subject card titles, profile card headers |
| **Body Standard** | 13px–14.5px | 400 / 500 | 0.00em | Form inputs, table cells, description copy |
| **Metadata & Sub** | 12px–13px | 400 / 500 | -0.01em | Subtitles, timestamps, breadcrumbs, table captions |
| **Pill / Badge Label** | 11px–12px | 600 | +0.02em | Section pills, semester badges, live state indicators |
| **Monospace Stack** | 12px–13px | 500 / 600 | 0.00em | Institutional enrollment IDs (`ADTU/1/2023-26/BCAO/012`) |

---

## 4. Layout & Spacing Principles

- **Desktop Container**: Standard viewport max-width of `1280px` (`1120px` for Admin), centered with `24px` to `36px` fluid padding.
- **Consistent Vertical Rhythm**:
  - Panel header row margin-bottom: `24px`.
  - Form field vertical gaps: `16px`.
  - Grid card gaps: `16px`–`20px`.
  - Card internal padding: `24px`–`28px` (`16px` on compact mobile).
- **Sticky Glass Navbar (`.global-navbar`)**:
  - Height: `64px` (`58px` mobile) with `border-radius: 18px`.
  - `backdrop-filter: blur(20px) saturate(160%)` with hairline border `rgba(29, 29, 31, 0.08)`.
  - Houses the brand mark squircle, institutional title, profile badge, and tactile logout trigger.

---

## 5. Core Component Specifications

### 5.1 Cupertino Segmented Pill Control (`.tabs`, `.segmented-control`)
- **Structure**: An outer rounded pill track (`border-radius: var(--radius-pill)`, `background: rgba(118, 118, 128, 0.12)`) containing an animated white sliding pill (`.tab-pill`) and interactive links/buttons (`.nav-link`, `.seg-btn`).
- **Sliding Physics**: Hardware-accelerated sliding transition (`transition: transform 260ms cubic-bezier(0.25, 1, 0.5, 1)`).
- **Positioning**: Controlled via `data-active-tab` attribute on the container:
  - Tab 1: `transform: translateX(0%)`
  - Tab 2: `transform: translateX(100%)`
  - Tab 3: `transform: translateX(200%)`
- **Sizing Variants**:
  - **Teacher Dashboard**: Width: `160px` per item (~`486px` total), `min-height: 42px`, `padding: 8px 16px`, `17px` SVG icons.
  - **Attendance Admin**: Width: fluid `flex: 1 1 0` with `max-width: 520px`, `min-height: 44px`, `17px` SVG icons.
  - **Mobile Responsive**: Adapts fluidly to `calc(100% / 3)` width with icon-first readability.

### 5.2 Floating Label Form Fields (`.floating-field`, `.password-wrap`)
- **Container**: `position: relative`, `height: 52px`–`54px`, `margin-bottom: 16px`.
- **Resting State (Unfocused & Empty)**: Label sits centered inside the input field (`top: 50%`, `transform: translateY(-50%)`, `color: var(--ink-3)`, `font-size: 13.5px`).
- **Active / Filled State (`:focus`, `:not(:placeholder-shown)`, and `:-webkit-autofill`)**: Label smoothly scales and floats to the top-left inside the input box (`top: 13px`, `font-size: 11px`, `font-weight: 600`, `color: var(--primary)`).
- **Password Visibility Eye Toggle (`.password-toggle`)**: Positioned at `right: 10px`, swapping between open and slashed eye SVGs on toggle.

### 5.3 Frosted Glass Modal Dialogs (`.modal-overlay`, `.modal-dialog`)
- **Overlay**: Fixed fullscreen backdrop (`background: rgba(0, 0, 0, 0.35)`, `backdrop-filter: blur(16px)`).
- **Activation Lifecycle**: Defaults to `display: none; opacity: 0;`. Transitions into view on `.modal-overlay.active` (`display: flex; opacity: 1;`).
- **Dismiss Interaction**: Backdrop click detection (`if (e.target === overlay) closeModal()`) with smooth exit transition.

### 5.4 Course Subject Cards (`.card` in Teacher Grid)
- **Top Row**: Department pill, section tag, semester badge, code tag, and right-aligned action buttons (`.card-action-btn`).
- **Action Buttons**: `32px × 32px` touch targets with hover tinting; **Edit Subject** opens populated detail dialog; **Remove Subject** triggers confirmation modal.
- **Card Footer**: Split primary/secondary action triggers (`View Attendance` and `Launch Session` / `Resume Session`).

### 5.5 Sensory Feedback & Haptics
- **Haptic Pulse**: Triggered upon successful QR scan on mobile (`navigator.vibrate([35, 45, 35])`).
- **Synthesized Audio Chime**: Synthesized Web Audio API chord chime upon attendance check-in verification, eliminating external sound asset dependencies.

---

## 6. Portal Feature Matrix

| Feature | Teacher Portal | Student Portal | Admin Portal |
| :--- | :---: | :---: | :---: |
| **Cupertino Pill Tabs** | `160px` 3-tab pill | 2-tab Coordinator bar | `520px` 3-tab pill |
| **Live QR Session** | Generator & Projector Mode | Camera QR Scanner | — |
| **Real-Time Telemetry** | SSE Roster Stream | Streak & Health Gauge | Record Counters |
| **Subject Catalog** | Full CRUD & Batch Assignment | Class Coordinator Roster | — |
| **Excel (.xlsx) Import/Export** | Session CSV Export | Bulk Roster Excel Upload | — |
| **Security Credentialing** | Session Auth & Supabase | Password Reset | Floating Label Security |

---

## 7. Design Do's and Don'ts

### Do
- Always use `.active` on `.modal-overlay` when mounting dynamic dialogs to ensure proper display and backdrop transitions.
- Maintain `data-active-tab` bindings on `.tabs` and `.segmented-control` to trigger CSS-driven pill translations.
- Use `type="button"` and `event.stopPropagation()` on nested card buttons to prevent unwanted bubbling.
- Maintain `24px` consistent vertical spacing between panel headers/subtitles and form fields.
- Use type-agnostic comparisons (`s.id == id || String(s.id) === String(id)`) when matching database IDs across template literals and payloads.

### Don't
- Don't use raw external `<label>` elements without structured spacing above form controls.
- Don't hardcode fixed-pixel widths on responsive segmented controls in mobile breakpoints.
- Don't use decorative continuous pulsing animations on static idle state elements; reserve animated pulses exclusively for active live sessions (`.dot-live`).
- Don't allow text contrast to fall below `4.5:1` against ambient card and canvas backgrounds.
