# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Teachers / Instructors**: Primary operators in classrooms and lecture halls. Need to quickly start a class session, display a dynamic QR code on a projector or laptop screen, monitor student check-ins in real time, export CSV attendance records, and review/delete past sessions.
- **Students**: Mobile users inside the classroom. Need to scan the projected QR code using their smartphone camera or browser, complete a one-time profile registration (enrollment ID, name, section), and mark attendance instantaneously with zero friction.
- **Superadmin**: Institutional administrator managing teacher accounts and platform access.

## Product Purpose

Real-time, contactless classroom attendance tracking via QR codes. Replaces time-consuming paper roll calls and proxy sign-ins with an instant, persistent digital check-in workflow backed by PostgreSQL.

## Positioning

Zero-install, mobile-web QR check-in that requires no app store downloads or complicated student authentication, paired with a real-time Server-Sent Events (SSE) live projector dashboard for teachers.

## Operating Context

- **Classroom Rush**: High burst traffic at the beginning or end of lectures where 50–200 students scan within a short 3–5 minute window.
- **Mobile Browsing**: Handled on student personal devices across iOS Safari, Android Chrome, and camera in-app browsers with varied screen sizes, dark/light modes, and intermittent campus Wi-Fi.
- **Lecture Hall Projection**: Teacher interface displayed on projectors or laptops, requiring high-contrast QR visibility and clear glanceable counts from a distance.

## Capabilities and Constraints

- **Architecture**: Plain Node.js `http` server with local persistent `data.json` storage (migrating to Supabase in a future phase) with static files served from `public/`.
- **Data Model**: Structured stores for `teachers`, `students`, `sessions`, and `attendance` with uniqueness enforcement per session.
- **Real-Time Updates**: Native Server-Sent Events (SSE) streaming live check-ins directly to the teacher's browser without external websocket libraries.
- **Offline & Storage Resiliency**: Client `localStorage` caches student profile details; backend gracefully handles HTTP 409 duplicates so students are never stuck.
- **Session Lifecycle**: Active session state with start, live monitoring, close, and deletion capabilities.

## Brand Commitments

- **Visual Direction**: Apple Human Interface Guidelines aesthetic — clean layout, refined typography, subtle glassmorphism/materials, high-fidelity spacing, and understated elegance.
- **Tone**: Clean, focused, academic, modern, and trustworthy.

## Evidence on Hand

- `public/admin.html`: Incumbent teacher dashboard with session controls, live SSE roster, QR display, and history table.
- `public/student.html`: Incumbent student mobile check-in interface with camera QR reader, registration form, and confirmation state.
- `public/superadmin.html`: Incumbent superadmin panel for teacher credential management.
- `server.js`: Working Node.js backend with SQL queries, SSE broadcasting, and CSV export.
- `database-migration-notes.md`: Migration log detailing PostgreSQL setup, schema, and bug fixes.

## Product Principles

1. **Zero-Friction Check-In**: The student path from scan to confirmation must be instantaneous and error-tolerant across all mobile browsers.
2. **Glanceable at Distance**: Teacher views and QR codes must maintain supreme contrast, clarity, and readability across large lecture halls.
3. **Data Integrity**: Attendance records must be deterministic, unique per session, accurately timestamped, and immediately durable in PostgreSQL.
4. **Restraint & Polish**: Interfaces should feel calm, refined, and purposeful—prioritizing content and task completion over distracting decoration.

## Accessibility & Inclusion

- Mobile touch targets must meet or exceed 44x44px.
- High-contrast typography readable under ambient classroom lighting conditions.
- Fallback manual code/PIN entry for students unable to use device camera scanners.
- Clear, unambiguous visual and semantic feedback for success, duplicate, and error states.
