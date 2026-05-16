---
name: Knowledge Explorer
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#45464d'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#006a61'
  on-secondary: '#ffffff'
  secondary-container: '#86f2e4'
  on-secondary-container: '#006f66'
  tertiary: '#6d5e00'
  on-tertiary: '#ffffff'
  tertiary-container: '#c5ab02'
  on-tertiary-container: '#4a3f00'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#89f5e7'
  secondary-fixed-dim: '#6bd8cb'
  on-secondary-fixed: '#00201d'
  on-secondary-fixed-variant: '#005049'
  tertiary-fixed: '#ffe24c'
  tertiary-fixed-dim: '#e2c62d'
  on-tertiary-fixed: '#211b00'
  on-tertiary-fixed-variant: '#524600'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  display-lg:
    fontFamily: Source Serif 4
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Source Serif 4
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-md:
    fontFamily: Source Serif 4
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  chat-bubble:
    fontFamily: Hanken Grotesk
    fontSize: 15px
    fontWeight: '450'
    lineHeight: 22px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  caption:
    fontFamily: Hanken Grotesk
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  baseline: 4px
  xs: 0.5rem
  sm: 1rem
  md: 1.5rem
  lg: 2.5rem
  xl: 4rem
  container-max: 1120px
  gutter: 24px
---

## Brand & Style

This design system embodies the "Modern Academic" aesthetic, bridging the gap between a prestigious university library and a cutting-edge AI laboratory. The design narrative centers on the concept of "Digital Parchment"—the interface should feel as intentional and permanent as a printed encyclopedia but as fluid and responsive as a modern chat interface.

The target audience consists of researchers, students, and curious minds who value information density without the cognitive load of cluttered interfaces. The emotional response is one of **focused intellectualism**: the UI retreats to allow the knowledge to take center stage, using whitespace and structural clarity to evoke a sense of calm authority. 

The style is a hybrid of **Minimalism** and **Tactile** design, utilizing subtle grain textures to mimic paper and precise, high-contrast typography to ensure elite readability.

## Colors

The palette is rooted in the "Paper & Ink" philosophy. The primary color is a deep **Oxford Blue**, used for text and structural headers to provide a sense of grounded authority. The secondary **Muted Teal** serves as the "Library Ink" accent for interactive elements and iconography.

A functional "Highlighter Yellow" is used sparingly for text selection, search highlights, and key AI insights, mimicking the physical act of marking a manuscript. The background is not a pure white, but a warm, off-white "Surface Paper" (`#FCFCFA`) that reduces eye strain during long-form reading sessions. 

- **Primary (Oxford Blue):** Foundation, headings, and deep-contrast elements.
- **Secondary (Library Teal):** Actionable items, links, and secondary branding.
- **Accent (Scholar Yellow):** Highlights and focus states.
- **Surface (Parchment):** The canvas for all content, providing a soft tactile feel.

## Typography

The typography system pairs the authoritative, scholarly weight of **Source Serif 4** with the contemporary precision of **Hanken Grotesk**. 

- **Headlines:** Source Serif 4 is used for all title levels to mimic the look of an editorial publication or academic journal.
- **Body & Chat:** Hanken Grotesk provides a neutral, highly legible sans-serif for the AI’s responses and user inputs, ensuring high information density remains readable.
- **Metadata:** **JetBrains Mono** is introduced for citations, timestamps, and technical metadata, providing a "cataloged" feel reminiscent of library index cards.

Line heights are intentionally generous to improve the "reading experience," treating every AI response as a short-form essay rather than a simple text snippet.

## Layout & Spacing

This design system uses a **Fixed Grid** philosophy for content-heavy views to maintain a "book-like" structure. On desktop, the main chat/reading area is centered with generous margins to prevent long line lengths that hinder readability.

- **Desktop:** 12-column grid, 1120px max-width, with wide side gutters to house "marginalia" (citations and related links).
- **Tablet:** 8-column grid with 32px margins.
- **Mobile:** 4-column grid with 16px margins; typography scales down and secondary sidebars collapse into bottom sheets.

Spacing follows a strict 4px baseline, but the "macro-spacing" between AI responses and user queries is expansive (`lg` or `xl`) to create a clear separation between "knowledge blocks."

## Elevation & Depth

Hierarchy is established through **Tonal Layers** and **Subtle Paper-like Shadows**. Instead of aggressive shadows, this design system uses "Ink-bleed" borders and layered surfaces.

1.  **Level 0 (Base):** The Surface Paper (`#FCFCFA`).
2.  **Level 1 (Cards):** Slightly elevated with a 1px border (`#E2E8F0`) and a very soft, diffused shadow (15% opacity, 10px blur) to represent an index card sitting on a desk.
3.  **Level 2 (Active Elements/Tooltips):** A sharper shadow to indicate immediate interactivity.

Avoid heavy blurs or colorful glows. Depth should feel physical—like sheets of paper overlapping on a wooden table.

## Shapes

The shape language is disciplined and "Soft-Industrial." The `roundedness: 1` setting ensures that elements have a slight curve (4px) to feel modern, but remain sharp enough to maintain an academic, organized tone.

- **Primary Cards:** 8px (`rounded-lg`) corner radius for a "stationery" feel.
- **Input Fields:** 4px radius, emphasizing a structured, form-like appearance.
- **Buttons:** Fully squared corners are avoided to prevent a "brutalist" feel, but radii never exceed 8px to maintain the professional aesthetic.

## Components

- **Chat Bubbles:** Unlike casual messengers, AI responses are styled as **Knowledge Cards**. They have no background color but are defined by a thin border and a subtle citation footer.
- **Citations:** Styled as small "Index Chips" using JetBrains Mono. On hover, they reveal a small preview of the Wikipedia source.
- **Action Buttons:** Contained buttons use Oxford Blue with white text. Ghost buttons use Library Teal for secondary actions like "Expand" or "Search Related."
- **Search Bar:** A prominent, fixed element at the bottom or top, styled with a "Typewriter" cursor and high-contrast focus states using the Highlighting Yellow.
- **Encyclopedia Cards:** Used for Wikipedia summaries. These feature a small thumbnail image with a "duotone" filter in Oxford Blue/Library Teal to maintain visual harmony.
- **Footnotes:** A dedicated "Marginalia" area on the right side of the desktop view for references, keeping the main reading path clear.