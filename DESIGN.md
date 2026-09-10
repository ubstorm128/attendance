---
name: Attendance App Design System
description: Cupertino-inspired academic command center with frosted glass surfaces and high-contrast telemetry
colors:
  primary: "#0066CC"
  primary-hover: "#0055B3"
  surface: "#F5F5F7"
  card: "#FFFFFF"
  ink: "#1D1D1F"
  ink-secondary: "#48484A"
  ink-tertiary: "#59595E"
  success: "#248A3D"
  success-text: "#135B25"
  destructive: "#D70015"
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
rounded:
  sm: "8px"
  card: "18px"
  outer: "22px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "24px"
  xl: "32px"
---

# Design System: Cupertino Academic Command

## Overview

**Creative North Star: "The Lecture Hall Sanctuary"**

The Attendance App design language is built on Apple Human Interface Guidelines principles: quiet confidence, tactile responsiveness, frosted optical materials, and extreme legibility. It replaces chaotic roll-call clipboards and cluttered enterprise grids with a calm, glanceable control center tailored for university lecture halls.

**Key Characteristics:**
- Restrained, warm-gray canvas (`#F5F5F7`) that avoids eye fatigue in darkened auditoriums.
- Frosted squircle surfaces with 0.5px hairline boundaries and soft diffuse drop shadows.
- Distinct split-stage topology: elevated projector-ready QR stage on the left, dynamic live SSE stream on the right.
- High-contrast, WCAG AA compliant typography (all text >= 4.5:1 contrast against ambient backgrounds).

## Colors

- **Primary (`#0066CC`)**: Apple Royal Blue. Reserved for intentional primary actions (Start Session, Sign In, primary tab focus).
- **Primary Hover (`#0055B3`) / Press (`#004494`)**: Deepened blue for tactile touch and pointer feedback.
- **Success (`#248A3D`) / Text (`#135B25`)**: Cupertino Emerald. Denotes verified student check-ins, active live sessions, and valid statuses.
- **Destructive (`#D70015`)**: Apple Crimson. Strictly for irreversible actions (Close Session, Remove Attendance, Delete Record).
- **Ink Primary (`#1D1D1F`)**: Deepest near-black for primary numerals, student names, and titles.
- **Ink Secondary (`#48484A`)**: High-contrast slate for supporting metadata, enrollment IDs, and timestamps.
- **Ink Tertiary (`#59595E`)**: Subtle captions and label text, balanced to maintain WCAG AA readability.

**The Calibrated Contrast Rule.** No text token may fall below 4.5:1 contrast against its background. When using tinted pill badges, the text color must derive from the dark shade of the chromatic hue.

## Typography

- **Display & Large Numerals**: SF Pro Display, 26px–30px, 600 weight, tight letter-spacing (-0.02em). Glanceable across lecture podiums.
- **Titles & Subheadings**: SF Pro Display / Text, 15px–18px, 600 weight.
- **Body & Table Data**: SF Pro Text, 13px–14px, 400 weight. Monospace stack applied for enrollment IDs.
- **Labels**: SF Pro Text, 11px–12px, 600 weight, slightly expanded tracking (+0.02em) for rapid scanning.

## Layout

- **Desktop Workspace**: Centered max-width container (1280px) with fluid padding (32px–36px).
- **Two-Column Split Stage**: 360px fixed-width left rail for QR generation and state controls; fluid right rail for real-time attendance telemetry.
- **Mobile Graceful Degradation**: Stacks into single-column layout on viewports under 960px; segmented control transitions to full-width dual pill tabs.

**The Proximity Hierarchy Rule.** The controls that change a session's state (Subject, Start, Close, Projector) sit directly alongside the projected asset (QR code), not detached across distant navigation bars.

## Elevation & Depth

- **Ambient Glass**: `rgba(255, 255, 255, 0.88)` with `backdrop-filter: blur(28px) saturate(180%)`.
- **Borders**: 0.5px to 1px hairline translucent borders (`rgba(255, 255, 255, 0.95)` on light mode, `rgba(0, 0, 0, 0.08)` for container rails).
- **Shadows**: Two-tier ambient occlusion: `0 2px 6px rgba(0,0,0,0.03), 0 20px 40px -14px rgba(0,0,0,0.07)`.

## Shapes

- **Squircles**: Continuous curvature applied to cards (18px) and outer shells (22px).
- **Pills**: Completely rounded ends (999px) for segmented controls, badges, avatar tokens, and status pills.

## Components

- **Segmented Control (`.tabs`)**: Gray track (`rgba(118, 118, 128, 0.12)`) housing a sliding pure-white pill (`#FFFFFF`) with a 0.26s cubic-bezier transition.
- **Metric Cards (`.stat`)**: 3-column glanceable summary blocks displaying live student counts, active subject, and session duration.
- **Projector QR Shell (`.qr-shell`)**: High-contrast white canvas with generous quiet zone, status pills, and full-screen projector mode.
- **Roster Stream (`table`)**: Dynamic table with student initial avatars, enrollment monospace pills, section tags, arrival times, and animated Present stamps.
- **Modals (`.modal-card`)**: Floating frosted cards with clear destructive vs. secondary button separation.

## Do's and Don'ts

### Do
- Keep the interface distraction-free and calm; let student attendance records be the focal point.
- Use native cubic-bezier transitions (`(0.22, 1, 0.36, 1)`) for card entrances and tab switches.
- Test QR legibility on both close-range laptops and distant 1080p/4K projectors.
- Maintain persistent SSE connection indicators with clear status badges.

### Don't
- Don't use decorative pulsing animations for idle or static states; reserve indicators for genuine real-time changes.
- Don't use low-contrast gray text (`#8E8E93` or lighter) on light backgrounds.
- Don't add nested multi-step dialogs or intrusive alerts during active class sessions.
