---
name: Crimson Insight
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
  on-surface-variant: '#e6bdb8'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#ac8884'
  outline-variant: '#5c403c'
  surface-tint: '#ffb4ab'
  primary: '#ffb4ab'
  on-primary: '#690005'
  primary-container: '#dc2626'
  on-primary-container: '#fff6f5'
  inverse-primary: '#bf0715'
  secondary: '#c8c6c5'
  on-secondary: '#313030'
  secondary-container: '#474746'
  on-secondary-container: '#b7b5b4'
  tertiary: '#90cdff'
  on-tertiary: '#003450'
  tertiary-container: '#0078b2'
  on-tertiary-container: '#f3f8ff'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdad6'
  primary-fixed-dim: '#ffb4ab'
  on-primary-fixed: '#410002'
  on-primary-fixed-variant: '#93000b'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1c1b1b'
  on-secondary-fixed-variant: '#474746'
  tertiary-fixed: '#cbe6ff'
  tertiary-fixed-dim: '#90cdff'
  on-tertiary-fixed: '#001e30'
  on-tertiary-fixed-variant: '#004b71'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  display:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.4'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  container-max: 1120px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style
The design system is anchored in "Intelligent Minimalism." It is designed for a professional AI search environment where clarity, speed, and deep focus are paramount. The aesthetic balances a sophisticated dark-mode workspace with high-energy crimson accents that guide the user's eye toward critical insights.

The style is primarily **Minimalist** with a specialized **Glassmorphism** treatment reserved for input layers to create a sense of depth and focus. By avoiding "techy" neon glows and instead utilizing crisp edges, modular panels, and generous whitespace, the system ensures that the AI's content remains the hero of the experience. The emotional response is one of authority, precision, and undistracted cognition.

## Colors
The palette is built on a "Void & Pulse" philosophy. The foundation is **Deep Charcoal Black (#0a0a0a)**, which serves as the primary canvas to minimize eye strain during long reading sessions. 

- **Primary (Crimson Red):** Used strictly for interactive states, primary actions, and branding marks. It represents the "insight" found within the data.
- **Secondary (Elevated Charcoal):** A slightly lighter #1a1a1a used for modular panels and container backgrounds to differentiate content from the base canvas.
- **Neutral/Text (Off-White):** High-contrast #f9fafb ensures maximum readability for AI-generated responses and search results.
- **Surface Overlays:** Semi-transparent variants of the neutral color are used for glassmorphic blurring on the search bar.

## Typography
The system utilizes **Inter** for all roles to maintain a cohesive, systematic, and highly readable interface. The hierarchy is driven by significant weight differences and intentional leading (line height) to support dense information consumption.

Headings use a bold weight and slightly tighter letter-spacing to feel authoritative and structured. Body text is optimized for long-form reading with a generous 1.6 line-height, ensuring that AI-generated paragraphs remain digestible. Labels and metadata use a medium weight to provide clear categorization without competing with primary content.

## Layout & Spacing
This design system uses a **Fixed Grid** approach for its primary reading experience to ensure line lengths remain optimal for comprehension (approx. 70-80 characters). The content is centered within a 1120px max-width container on desktop.

A 12-column grid is used for modular content panels, allowing for flexible arrangements of search results, source citations, and media. Spacing follows a 4px baseline shift, but primarily relies on larger "stacks" (16px, 32px) to create the "intentional whitespace" required for a minimalist aesthetic. On mobile, the grid collapses to a single column with 16px margins, maintaining the focus on vertical flow.

## Elevation & Depth
Depth is achieved through **Tonal Layers** rather than traditional drop shadows. By layering lighter shades of charcoal (#1a1a1a or #262626) over the base (#0a0a0a), the system creates hierarchy through luminance.

The search bar is the only element that utilizes **Glassmorphism**. It features a 20px backdrop blur with a 10% opacity white border, giving it a "floating" effect above the content stream. Other modular panels use "Low-contrast outlines" (1px solid #262626) to define their boundaries, maintaining the crisp, professional edges requested. Interactive elements may use a subtle crimson outer glow (2px blur, 10% opacity) only during active/focus states to signal intent.

## Shapes
The shape language is "Professional Sharp." UI elements use a **Soft (4px)** corner radius to prevent the interface from feeling aggressive while maintaining the precision of a high-end tool.

- **Standard Elements (Buttons, Inputs, Panels):** 4px (0.25rem) corner radius.
- **Large Containers (Cards, Search Bar):** 8px (0.5rem) corner radius.
- **Tags/Status Pills:** 4px (0.25rem) to maintain consistency with the modular grid; avoid fully rounded "pill" shapes to keep the professional aesthetic.

## Components

### Search Bar
The central component of the system. It uses a glassmorphic background with a 1px #ffffff20 border. The text input uses `body-lg` for prominence. The "Search" action is represented by a ghost button or a simple crimson arrow icon.

### Modular Panels (Cards)
Used for AI responses and search results. Background is #1a1a1a with no shadow. Borders are 1px solid #262626. These panels should have consistent 24px internal padding to provide breathability for the text.

### Buttons
- **Primary:** Solid crimson (#dc2626) background with off-white text. No gradients.
- **Secondary:** Outline style with 1px #dc2626 border and crimson text.
- **Ghost:** No background, off-white or grey text, becoming crimson on hover.

### Inputs & Selection
Checkboxes and radio buttons use the crimson accent for their "on" state. Text fields use a solid #141414 background with a 1px border that turns crimson when focused.

### Source Chips
Small, modular chips used to cite sources. These use #262626 backgrounds with `label-sm` text. They appear tucked within or below AI response panels, maintaining a clean, systematic look for academic-style citations.