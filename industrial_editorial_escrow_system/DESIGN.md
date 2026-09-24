---
name: Industrial Editorial Escrow System
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c7c8af'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#91927b'
  outline-variant: '#464835'
  surface-tint: '#bcd12b'
  primary: '#ffffff'
  on-primary: '#2d3400'
  primary-container: '#d8ee48'
  on-primary-container: '#5e6b00'
  inverse-primary: '#586400'
  secondary: '#c6c6c7'
  on-secondary: '#2f3131'
  secondary-container: '#454747'
  on-secondary-container: '#b4b5b5'
  tertiary: '#ffffff'
  on-tertiary: '#2f3034'
  tertiary-container: '#e3e2e7'
  on-tertiary-container: '#636469'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8ee48'
  primary-fixed-dim: '#bcd12b'
  on-primary-fixed: '#191e00'
  on-primary-fixed-variant: '#424b00'
  secondary-fixed: '#e2e2e2'
  secondary-fixed-dim: '#c6c6c7'
  on-secondary-fixed: '#1a1c1c'
  on-secondary-fixed-variant: '#454747'
  tertiary-fixed: '#e3e2e7'
  tertiary-fixed-dim: '#c6c6cb'
  on-tertiary-fixed: '#1a1b1f'
  on-tertiary-fixed-variant: '#46464b'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  display-xl:
    fontFamily: Newsreader
    fontSize: 72px
    fontWeight: '400'
    lineHeight: 76px
    letterSpacing: -0.03em
  display-xl-mobile:
    fontFamily: Newsreader
    fontSize: 40px
    fontWeight: '400'
    lineHeight: 44px
    letterSpacing: -0.02em
  display-lg:
    fontFamily: Newsreader
    fontSize: 56px
    fontWeight: '400'
    lineHeight: 60px
    letterSpacing: -0.025em
  display-lg-mobile:
    fontFamily: Newsreader
    fontSize: 32px
    fontWeight: '400'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Newsreader
    fontSize: 40px
    fontWeight: '400'
    lineHeight: 46px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Newsreader
    fontSize: 26px
    fontWeight: '400'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Newsreader
    fontSize: 28px
    fontWeight: '400'
    lineHeight: 34px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Space Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Space Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  mono-metric-lg:
    fontFamily: JetBrains Mono
    fontSize: 36px
    fontWeight: '500'
    lineHeight: 40px
    letterSpacing: -0.02em
  mono-metric-md:
    fontFamily: JetBrains Mono
    fontSize: 22px
    fontWeight: '500'
    lineHeight: 26px
    letterSpacing: -0.01em
  mono-data-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.02em
  mono-label-xs:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.08em
spacing:
  gutter: 1.5rem
  gutter-sm: 1rem
  margin: 2.5rem
  margin-sm: 1.25rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system embodies an uncompromising synthesis of high-contrast industrial automation and refined editorial publishing. Built for autonomous smart-contract verification, telemetry-driven logistics, and programmatic escrow settlement, the aesthetic balances the precision of an engineering CAD terminal with the timeless dignity of an architectural journal.

The emotional signature is razor-sharp authority, deterministic clarity, and hyper-visibility. The interface rejects gratuitous decoration, instead relying on strict isometric line-art, visible coordinate frameworks, bounded functional tiles, and stark luminescent highlights. It communicates absolute mechanical certainty: code running without human error, contracts settling with sub-second precision, and logistics flowing through physical space without friction.

Key aesthetic pillars:
- **High-Visibility Industrial Accents**: Piercing acid yellow commands immediate tactical attention against pitch-black carbon depths.
- **Architectural Editorial Serif**: Large-format editorial serif typography delivers authoritative prestige, contrasting directly against utilitarian monospace telemetry.
- **Blueprint Grid Rigor**: Visible structural hairline rules, reticle crosshairs, coordinate badges, and bounded metric chambers frame every piece of operational data.

## Colors

The palette is anchored in an uncompromising deep carbon environment, punctuated by an electric industrial yellow designed for high-consequence operational visibility. Every color tier fulfills a strict functional duty across contract execution, telemetry logging, and terminal states.

### Core Swatches
- **Primary (`#E2F952`)**: Acid Chartreuse / Electric Volt. Used for primary interactive triggers, active verification states, focus reticles, and critical alerts.
- **Secondary (`#FFFFFF`)**: Pure White. Used for authoritative serif headlines, key telemetry numerals, and high-priority labels.
- **Tertiary (`#8E8E93`)**: Mechanical Slate. Used for secondary body text, inactive structural annotations, grid coordinates, and peripheral metadata.
- **Neutral (`#0A0A0A`)**: Obsidian Carbon. The canvas background, absorbing extraneous ambient visual noise to prioritize data density.

### Surface Hierarchy
- **Canvas Base**: `#080808`
- **Surface Level 1 (Tile / Card)**: `#111111`
- **Surface Level 2 (Elevated Terminal / Drawer)**: `#181818`
- **Surface Accent (Full Volt Container)**: `#E2F952` (with high-contrast `#0A0A0A` typography)

### State Tokens (Escrow & Verification)
- **OPEN / VERIFIED**: `#E2F952` on `rgba(226, 249, 82, 0.08)` border `rgba(226, 249, 82, 0.4)`
- **RELEASED**: `#30D158` on `rgba(48, 209, 88, 0.08)` border `rgba(48, 209, 88, 0.3)`
- **REFUND_NOHIT / INSUFFICIENT**: `#FF453A` on `rgba(255, 69, 58, 0.08)` border `rgba(255, 69, 58, 0.3)`
- **CANCELED / EXPIRED**: `#8E8E93` on `rgba(142, 142, 147, 0.08)` border `rgba(142, 142, 147, 0.24)`

## Typography

The typographic hierarchy intentionally clashes two worlds: humanistic editorial literature and cold machine telemetry.

1. **Editorial Headlines (`Newsreader`)**: Expressive, high-character serif forms applied to hero statements, architectural section titles, and macro value propositions. It conveys timeless permanence, credibility, and thoughtful stewardship over physical assets.
2. **Technical UI Prose (`Space Grotesk`)**: Geometric sans-serif with subtle technological inflections. Used for narrative explanations, body copy, form fields, and navigation elements.
3. **Machine Telemetry (`JetBrains Mono`)**: Strict, tabular, fixed-width glyphs. Every numerical value, transaction hash, escrow state flag, timestamp, and CAD grid annotation is rendered in monospace to guarantee horizontal alignment across data streams.

## Layout & Spacing

The layout is built on a technical CAD-grid architecture. Every section functions as a visible chamber separated by 1px rules, mimicking schematic line drawings and physical warehouse zones.

### Grid Configuration
- **Desktop (1280px+)**: 12-column fluid grid, 24px (`1.5rem`) gutters, 40px (`2.5rem`) outer margin.
- **Tablet (768px - 1279px)**: 8-column grid, 20px gutters, 24px outer margin.
- **Mobile (Below 768px)**: 4-column grid, 16px (`1rem`) gutters, 20px (`1.25rem`) outer margin.

### Cadence & Structural Rules
- **Modular Division**: Sections are bounded by crisp, continuous 1px borders rather than soft negative space.
- **Asymmetrical Lead Panels**: A prominent visual tactic is the asymmetric anchor block: a bright `#E2F952` tile spanning 3-4 columns juxtaposed against an expansive 8-9 column obsidian CAD container.
- **Coordinate Stamps**: Key modular junctions feature monospace coordinate tags (e.g., `[LOC: 0x4B // GEN_61997]`) aligned to section margins.

## Elevation & Depth

This design system completely rejects soft, blurred, skeuomorphic drop shadows. Elevation is achieved through structural demarcation, border luminance, and tonal stepping:

1. **Planar Tiers**:
   - **Base Level (`0dp`)**: `#0A0A0A` background with `1px solid rgba(255, 255, 255, 0.08)` CAD grid lines.
   - **Chamber Level (`1dp`)**: `#121212` enclosed panels with `1px solid rgba(255, 255, 255, 0.14)` perimeter strokes.
   - **Active Interactive (`2dp`)**: Accent-tinted borders (`1px solid #E2F952`) with high-contrast interior backgrounds.
2. **Technical Wireframe Depth**:
   - Isometric line art rendered in pure single-pixel outlines (`rgba(255, 255, 255, 0.65)` for foreground, `rgba(255, 255, 255, 0.2)` for background structures).
3. **Hard Tactical Cutouts**:
   - Corner tabs, angled notch trims, and inset status badges provide geometric depth without relying on lighting illusions.

## Shapes

The geometric form language is strictly sharp (`roundedness: 0`). 

- **Corners**: Radii are strictly `0px` across cards, metric boxes, buttons, inputs, and modal sheets. This reinforces the precision-machined, blueprint-drawn industrial character.
- **Pill Exceptions**: Small status indicator pills (such as escrow state indicators or step dots) may utilize small 2px corner treatments or remain pure rectangles with inset hairline padding.
- **Notches & Chamfers**: Interactive cards may employ subtle 4px to 8px 45-degree chamfered corners on top-right edges to suggest terminal punch cards and hardware chassis.

## Components

### Buttons
- **Primary Industrial Trigger**: Solid `#E2F952` background, `#0A0A0A` bold `Space Grotesk` or `JetBrains Mono` text, uppercase, `0px` border radius, padding `12px 24px`. On hover, color transitions to pure `#FFFFFF` with instantaneous mechanical response (no float/elevation shift).
- **Secondary Wireframe Button**: `#0A0A0A` background, `1px solid rgba(255, 255, 255, 0.3)` border, `#FFFFFF` text. On hover: border turns into `#E2F952` with text shifting to `#E2F952`.
- **Directional Action Trigger**: Small square or rectangular button housing a clean directional arrow (`→` or `↗`), filled with `#E2F952` and `#0A0A0A` glyph, docked to the corner of interactive tiles.

### Escrow State Chips
- Rectangular monospace tags (`JetBrains Mono`, `10px`, uppercase, tracking `0.08em`).
- Padding: `3px 8px`, `0px` radius.
- **States**:
  - `OPEN`: Text `#E2F952`, background `rgba(226, 249, 82, 0.08)`, border `1px solid #E2F952`.
  - `RELEASED`: Text `#30D158`, background `rgba(48, 209, 88, 0.08)`, border `1px solid rgba(48, 209, 88, 0.4)`.
  - `REFUND_NOHIT`: Text `#FF453A`, background `rgba(255, 69, 58, 0.08)`, border `1px solid rgba(255, 69, 58, 0.4)`.
  - `INSUFFICIENT`: Text `#FF9F0A`, background `rgba(255, 159, 10, 0.08)`, border `1px solid rgba(255, 159, 10, 0.4)`.
  - `CANCELED` / `EXPIRED`: Text `#8E8E93`, background `rgba(142, 142, 147, 0.08)`, border `1px solid rgba(142, 142, 147, 0.25)`.

### Metric Chambers (Data Tiles)
- Bounded by `1px solid rgba(255, 255, 255, 0.12)`.
- Background: `#111111`.
- Header: Tiny uppercase monospace descriptor (`mono-label-xs`) in `#8E8E93` accompanied by a hairline divider.
- Core: Large quantitative metric (`mono-metric-lg`) in `#FFFFFF` or `#E2F952`.
- Footer: Micro context text (`mono-data-sm`) in `#8E8E93`.

### Input Fields
- Enclosed dark inputs (`#0A0A0A` surface) with `1px solid rgba(255, 255, 255, 0.2)` border.
- Text: `#FFFFFF`, `14px`, `Space Grotesk` or `JetBrains Mono`.
- Active/Focus: Border shifts to `1px solid #E2F952`, zero outer glow.
- Helper & Label: Positioned above input in `JetBrains Mono`, `11px`, `#8E8E93`, uppercase.

### Verification Cards & Accordions
- Horizontal data bars bounded by continuous 1px rules.
- Index prefix in monospace numeral pill (e.g., `01`, `02`, `03`).
- Title in `Space Grotesk` medium (`16px`) or `Newsreader` (`20px`).
- Expandable chevron or plus icon enclosed in a `1px` wireframe square.

### CAD Graphics & Diagrams
- Strict isometric or orthogonal wireframes rendered in pure stroke vectors without heavy raster fills.
- Conveyor systems, telemetry scanners, lock vaults, and verification routes rendered with clean 1px lines (`rgba(255, 255, 255, 0.8)` highlights, `rgba(255, 255, 255, 0.25)` framework scaffolding).