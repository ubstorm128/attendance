---
version: 1
slug: "public-student-html"
primary_target: "public/student.html"
related_targets: []
---

# Student Mobile Experience Design Brief

<!-- impeccable:surface-brief 1 -->

## Job and Audience
- **Primary User**: University students scanning from lecture hall seats or auditorium aisles.
- **Scene & Context**: Handheld smartphones (iOS Safari, Android Chrome, in-app webviews) under varied lecture hall lighting, often rushing during the first 2 minutes of class.
- **Need**: Instant zero-friction check-in via camera or projected QR link, persistent profile caching in `localStorage`, clear permission/error recovery, and transparent personal attendance breakdown.
- **Visitor Mode**: **Complete** (focused single-purpose task: scan -> verified checkmark -> check status).

## Outcome and Proof
- **Primary Action**: Open page -> Camera scan or URL token -> Receive verified "Present" shield with haptic feedback.
- **Success Criteria**: Scan-to-confirmation cycle completes in < 3 seconds with zero duplicate penalty (HTTP 409 handled gracefully).
- **Product Truth**: Native client-side decoding with `Html5Qrcode`, zero app store install friction, local storage caching.

## Selected Direction
- **Visual Authority**: Apple iOS Human Interface Guidelines (iOS 17/18 mobile web).
- **Structural Thesis**: Warm-gray canvas (`#F5F5F7`) with pure white squircle grouped cards, 0.5px hairline boundaries, and responsive Cupertino segmented pill controls. Edge-to-edge camera viewport with rounded squircle viewfinder reticle.
- **Focal Moment**: The celebratory arrival of the Cupertino Emerald checkmark badge with haptic vibration upon attendance confirmation.

## Scope and Boundaries
- **Named Target**: `public/student.html` (Registration, Scanner View, Subject Stats, Recent Activity).
- **Interactivity**: Profile setup/switching, camera stream control, QR token parsing, `/api/mark` calls, attendance analytics.
- **Untouched**: Backend endpoints (`/api/register`, `/api/mark`, `/api/my-attendance`) and `server.js`.
- **Anti-Goals**: No heavy JS frameworks, no floating neon blobs, no cramped unstyled tables on mobile screens.

## States and Ranges
- **Registration**: iOS Inset Grouped form with clean hairline separators, inline validation, and high-contrast tactile CTA.
- **Scanner Standby**: Clean instruction card with prominent "Open Camera" CTA, or automatic detection if opened via scanned QR URL (`?token=...`).
- **Scanning View**: Squircle camera viewfinder with corner reticle guides, status pill, and camera cancel button.
- **Success Receipt**: Apple Pay/Wallet-style checkmark badge with subject name, timestamp, and status.
- **My Attendance Tab**: Glanceable summary metric tiles (Overall %, Classes Present, Low Subjects warning), followed by responsive subject cards and chronological history list.
- **Empty & Error States**: Graceful camera permission dialogs, no-subjects placeholder, and below-75% warning badges.
