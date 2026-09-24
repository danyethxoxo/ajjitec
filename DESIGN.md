---
name: AJJITEC Light Operations
description: White, precise and blue-led identity for AJJITEC's public site and operations portal.
colors:
  primary: "#1d63d7"
  primary-dark: "#12479f"
  navy-text: "#12233e"
  cool-paper: "#f6f9fd"
  surface: "#ffffff"
  surface-tint: "#edf4fc"
  border: "#d7e3f1"
  muted-text: "#5b718d"
typography:
  display:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "clamp(3rem, 6.3vw, 5.375rem)"
    fontWeight: 500
    lineHeight: 0.98
    letterSpacing: "-0.07em"
  body:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "DM Mono, monospace"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.08em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "999px"
    padding: "14px 22px"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary-dark}"
    rounded: "999px"
    padding: "14px 22px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.navy-text}"
    rounded: "{rounded.md}"
    padding: "24px"
---

# Design System: AJJITEC Light Operations

## Overview

**Creative North Star: "Blue Technical Clarity"**

AJJITEC now uses a white, low-fatigue canvas that lets the existing blue logo become the system's single visual signal. The public site keeps its technical imagery and editorial scale, while the operations portal uses the same surfaces, borders and action color with a denser information rhythm.

The previous dark world is intentionally replaced. Surfaces are flat at rest, content is separated with cool blue-gray rules, and blue is reserved for links, active navigation, labels, focus and primary actions. The result should feel precise and approachable before it feels decorative.

**Key Characteristics:**

- Cool white canvas with white content surfaces.
- AJJITEC blue as a restrained action and wayfinding color.
- Navy text hierarchy instead of pure black.
- Thin blue-gray borders and soft neutral elevation.
- Shared visual grammar across marketing pages and authenticated operations.

## Colors

The palette is deliberately neutral-heavy: white and cool paper carry most of the screen, navy establishes readable hierarchy, and one blue accent marks action and state.

### Primary

- **AJJITEC Blue** (#1d63d7): Primary buttons, active navigation, links, labels and focus states.
- **AJJITEC Blue Deep** (#12479f): Hover states, high-emphasis links and text on pale blue surfaces.

### Neutral

- **Navy Text** (#12233e): Headings, primary data and important controls.
- **Cool Paper** (#f6f9fd): Page canvas and low-emphasis background.
- **Surface White** (#ffffff): Header, cards, forms, sidebar and dashboard panels.
- **Surface Tint** (#edf4fc): Active navigation, selected filters and avatar surfaces.
- **Blue Gray Border** (#d7e3f1): Dividers, card outlines and table rules.
- **Muted Slate** (#5b718d): Supporting copy, metadata and empty-state explanation.

### Named Rules

**The One Blue Rule.** Blue marks something the user can follow, activate or trust; it does not flood every surface.

## Typography

**Display Font:** Manrope (with Arial, sans-serif fallback)

**Body Font:** Manrope (with Arial, sans-serif fallback)

**Label/Mono Font:** DM Mono (for short labels, IDs, statuses and measured data)

**Character:** Manrope gives the public site a confident technical voice without the fatigue of a display face, while DM Mono makes operational metadata easy to scan without becoming the main reading voice.

### Hierarchy

- **Display** (500, `clamp(3rem, 6.3vw, 5.375rem)`, 0.98): Public hero and major catalog statements.
- **Headline** (500, `clamp(2.1rem, 4vw, 3.5rem)`, 1.02): Section headings and portal module titles.
- **Title** (500, 20–30px, 1.05): Cards, profile name and dashboard subsections.
- **Body** (400, 13–17px, 1.45–1.65): Descriptions, product copy and supporting context, with a readable measure.
- **Label** (400, 9–11px, 1.4, `0.08em`, uppercase where used): Section labels, statuses and operational metadata.

### Named Rules

**The Measure Rule.** Labels can be compact; explanatory copy must retain enough line length and contrast to be read without zooming or squinting.

## Layout

Public pages use a centered editorial shell with generous section spacing and image-led product moments. The operations portal uses a full-viewport frame: a compact persistent sidebar flush to the left, top and bottom edges, a flexible content column and five-up dashboard metrics that collapse to three, two and one columns at smaller widths. Each operational module has its own static route so navigation and browser history remain explicit.

The shared rhythm is based on 8px increments, with 16px control gaps, 24px card padding and larger separation before major headings. At mobile widths, the portal sidebar becomes a normal top section and all dense grids become a single readable column.

## Elevation & Depth

The light identity is flat by default. Borders carry most of the separation; shadows are soft, neutral and limited to cards, the portal sidebar and interactive hover states. No colored glow is used as a substitute for hierarchy.

### Shadow Vocabulary

- **Card lift** (`0 12px 30px rgba(31, 83, 145, 0.06)`): Quiet separation for white cards on the cool-paper canvas.
- **Primary action lift** (`0 8px 18px rgba(29, 99, 215, 0.16)`): Reserved for primary buttons to reinforce action without changing the surface palette.

### Named Rules

**The Flat-by-Default Rule.** A surface should read clearly without a shadow; elevation is a small response to importance or interaction.

## Shapes

Cards and forms use gently rounded corners (10px), portal shells use 14px, and buttons or filter controls use pill shapes. Borders are one pixel and cool blue-gray. Clipping is reserved for product media and carousel frames.

## Components

### Buttons

- **Shape:** Pill controls for actions (`999px`).
- **Primary:** AJJITEC Blue with white text and compact horizontal padding (`14px 22px`).
- **Hover / Focus:** Deep blue hover; visible blue focus ring with a light offset.
- **Secondary / Ghost:** White surface, blue-navy text and a blue-gray border; pale blue hover state.

### Chips

- **Style:** White or pale-blue surface, blue-gray border, DM Mono label.
- **State:** Selected filters use the primary blue outline and pale-blue fill; unselected filters remain quiet.

### Cards / Containers

- **Corner Style:** 10px for cards, 14px for the portal shell.
- **Background:** Surface White on Cool Paper.
- **Shadow Strategy:** Card lift only where a surface needs separation; borders remain present.
- **Border:** One-pixel Blue Gray Border, strengthened on hover.
- **Internal Padding:** 16px for compact KPI cards and 24px for content cards.

### Inputs / Fields

- **Style:** White field, Blue Gray Border, 6px radius, navy text.
- **Focus:** AJJITEC Blue border and a restrained pale-blue ring.
- **Error / Disabled:** Red error text for recovery messages; disabled controls reduce opacity without losing their structure.

### Navigation

- **Style:** White header or sidebar with muted blue-gray links.
- **Active:** Pale-blue fill, deep-blue text and a slim primary-blue leading rule in the portal.
- **Mobile:** Public navigation collapses to the existing menu control; portal navigation stacks above the content.

## Do's and Don'ts

### Do:

- **Do** keep the logo and its blue as the source of the accent.
- **Do** use white surfaces and cool paper to separate content without heavy decoration.
- **Do** use blue for actions, links, active states and short technical labels.
- **Do** preserve visible focus states and responsive collapse behavior.
- **Do** keep dashboard metrics and forms easy to scan at a glance.

### Don't:

- **Don't** reintroduce large dark panels or dark page backgrounds.
- **Don't** use multiple competing accent colors where blue already communicates state.
- **Don't** use low-contrast pale gray text on white surfaces.
- **Don't** turn every card into a decorative gradient or glowing container.
- **Don't** change the product's operational permissions, data or routes as part of a visual update.
