# Scope: Fix Teacher QR Code Display & Automated Code Review

## Architecture & Background
The application handles attendance taking via QR codes.
The teacher interface files are located under:
- `public/pages/teacher` (HTML/view templates)
- `public/scripts/teacher` (Client-side JavaScript)

The reported issue was that in the teacher interface, the QR code did not appear / failed to render.
The root causes identified were:
1. `public/scripts/teacher/dashboard.js` explicitly executed `boxCanvas.remove()` and `projCanvas.remove()`, destroying the rendered `<canvas>` elements immediately after instantiation.
2. `public/styles/shared/domain.css` had `#qrBox canvas, #projectorQrBox canvas { display: none !important; }`, hiding any canvas element.
3. Lack of defensive error handling if the `qrcodejs` library failed to load or threw exceptions.

## Feature Inventory
| # | Feature | Description | Milestone | Source | Status |
|---|---------|-------------|-----------|--------|--------|
| 1 | Teacher QR Code Rendering | Fix root cause preventing QR code from rendering in teacher interface | M1 | ORIGINAL_REQUEST §R1 | DONE |
| 2 | Error Handling & Reliability | Ensure QR code generation handles errors gracefully and renders reliably | M1 | ORIGINAL_REQUEST §R1 | DONE |
| 3 | CodeRabbit Code Review | Run automated review using CodeRabbit CLI and address actionable findings | M1 | ORIGINAL_REQUEST §R2 | DONE |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | QR Code Fix & CodeRabbit Review | Fix teacher QR code display and run CodeRabbit review | none | DONE |

## Interface Contracts
- Teacher page QR code containers (`#qrBox` and `#projectorQrBox`) cleanly host responsive `<canvas>` and `<img>` elements without deletion or CSS visibility suppression.
- Defensive fallback displays clear error message and sets `#qrStatusPill` to 'Error' if QRCode library is absent or fails.
- All backend contracts (`POST /api/start-session`, `GET /api/stream`) remain 100% compatible.
