---
version: 1
slug: "public-admin-html"
primary_target: "public/admin.html"
related_targets: []
---

# Teacher Dashboard Design Brief

<!-- impeccable:surface-brief 1 -->

## Job and Audience
- **Primary User**: College professors and course instructors.
- **Scene & Context**: Classroom podium, laptop connected to lecture hall projector or external monitor.
- **Need**: Instant session initialization, unmistakable QR legibility from any seat in the room, live check-in monitoring without manual refreshes, and straightforward history review/export.
- **Visitor Mode**: **Operate** (clear task hierarchy, distraction-free scanability, calm visual authority).

## Outcome and Proof
- **Primary Action**: Select subject -> Start session -> Display projector-ready QR -> Watch real-time incoming attendance stream -> Close & export.
- **Success Criteria**: Entire attendance cycle takes under 2 minutes of class time with 100% verified digital delivery to PostgreSQL.
- **Product Truth**: Powered by native Server-Sent Events (`/api/stream`) and persistent PostgreSQL session records; no synthetic sync.

## Selected Direction
- **Visual Authority**: Apple Human Interface Guidelines (macOS Sequoia / iPadOS desktop web).
- **Structural Thesis**: Two-pane command center. Left: Elevated high-contrast QR stage with ambient squircle framing and clear status controls. Right: Dynamic real-time arrival stream with smooth row arrivals and student avatar tokens. Top: Frosted glass header with Cupertino segmented pill tabs (`Live Session` | `History`) and glanceable summary tiles.
- **Focal Moment**: The glowing emerald live status indicator and smooth micro-interaction when a student's check-in arrives via SSE.
- **Benchmark Comp**: `.impeccable/mocks/decision/admin_dashboard_comp.jpg`

## Scope and Boundaries
- **Named Target**: `public/admin.html` (both Authentication and Dashboard surfaces).
- **Interactivity**: Full live session lifecycle, SSE event listener, history listing, CSV download, and session deletion.
- **Untouched**: Backend REST & SSE APIs (`server.js`) and database schema.
- **Anti-Goals**: No heavy client frameworks, no dark-mode neon widgets, no multi-step modal friction.

## States and Ranges
- **Pre-Session**: Clean input card for course/subject name with prominent "Start Session" CTA.
- **Active Session**: High-contrast QR code, live pulsing green badge, elapsed time counter, and live table rows scaling smoothly from 0 to 200+ students.
- **History View**: Clean chronological list with subject tags, student headcounts, one-click CSV export, and guarded deletion.
- **Empty States**: Elegant placeholder cards for empty history or inactive QR display.

## Interaction and Layout
- **Topology**: Fluid layout with responsive breakpoints; high-contrast QR scales responsively for projector visibility.
- **Controls & Affordances**: Cupertino segmented navigation with pill slide, 0.5px hairline glass borders, soft ambient drop shadows, and responsive tactile button presses.
- **Transitions**: Native-feeling cubic-bezier ease-out entry for incoming student rows; subtle pulse animation on the active live indicator.

## Constraints and Implementation Notes
- **Runtime**: Plain HTML, CSS, JavaScript (zero external framework overhead).
- **Typography**: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif`.
- **Assets**: Retain `qrcode.js` integration for offline-capable client-side QR rendering.

## Direction contract

THESIS: An instructor command center that replaces chaotic manual roll calls and cluttered enterprise tables with a calm, projector-ready Apple interface where high-contrast QR display and real-time student check-in telemetry co-exist seamlessly.

OWN-WORLD: macOS/iPadOS frosted glassmorphism over warm-gray ambient background (#F5F5F7), 16px-20px squircle surfaces, 0.5px hairline boundaries, pure white cards with soft ambient drop shadows, SF Pro typography scale, and emerald live pulse indicators.

STORY: The professor signs in, inputs the subject, and starts the session. The room sees a high-contrast QR code projected on the wall; the instructor watches real-time arrival cards flow into the roster via SSE with zero manual refreshes, closing and exporting when complete.

FIRST VIEWPORT: Top frosted navigation bar with segmented pill switcher and instructor profile; three summary metric tiles (Present count, Active subject, Session elapsed timer with live indicator); split hero layout with elevated QR stage on left (40%) and real-time incoming attendance stream on right (60%).

FORM: Desktop web dashboard command center with responsive projector scaling, adhering to Apple Human Interface Guidelines.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

