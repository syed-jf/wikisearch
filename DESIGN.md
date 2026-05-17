---
name: Ethereal Tech
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f4'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#3b494c'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f0f1f1'
  outline: '#6b7a7d'
  outline-variant: '#bac9cc'
  surface-tint: '#006875'
  primary: '#006875'
  on-primary: '#ffffff'
  primary-container: '#00e5ff'
  on-primary-container: '#00626e'
  inverse-primary: '#00daf3'
  secondary: '#516072'
  on-secondary: '#ffffff'
  secondary-container: '#d2e1f7'
  on-secondary-container: '#556477'
  tertiary: '#5a5f62'
  on-tertiary: '#ffffff'
  tertiary-container: '#cdd1d5'
  on-tertiary-container: '#555a5d'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#9cf0ff'
  primary-fixed-dim: '#00daf3'
  on-primary-fixed: '#001f24'
  on-primary-fixed-variant: '#004f58'
  secondary-fixed: '#d4e4fa'
  secondary-fixed-dim: '#b9c8de'
  on-secondary-fixed: '#0d1c2d'
  on-secondary-fixed-variant: '#39485a'
  tertiary-fixed: '#dfe3e7'
  tertiary-fixed-dim: '#c3c7cb'
  on-tertiary-fixed: '#171c1f'
  on-tertiary-fixed-variant: '#43474b'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 64px
    fontWeight: '200'
    lineHeight: '1.1'
    letterSpacing: -0.04em
  display-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 40px
    fontWeight: '300'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '300'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.0'
    letterSpacing: 0.08em
  academic-quote:
    fontFamily: Newsreader
    fontSize: 20px
    fontWeight: '400'
    lineHeight: '1.5'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-padding-desktop: 80px
  container-padding-mobile: 24px
  gutter: 32px
  section-gap: 120px
---

## Brand & Style
This design system embodies a state of elevated clarity, blending high-science academic precision with a futuristic, breathable aesthetic. The brand personality is intellectual, serene, and cutting-edge. It prioritizes "negative space" as a functional element rather than a void, creating a sense of infinite digital canvas.

The visual style is a hybrid of **Minimalism** and **Soft Neomorphism**. It avoids heavy borders and harsh dividers, instead using light, shadow, and subtle color meshes to define structure. The emotional goal is to make the user feel focused, calm, and empowered by a sophisticated tool that feels "light as air" yet technologically robust.

## Colors
The palette is dominated by **Pure White** and **Platinum**, creating a high-key environment that feels laboratory-clean. 

- **Primary (Vibrant Cyan):** Used sparingly for critical calls to action and active states to provide a high-energy focal point against the neutral backdrop.
- **Secondary (Liquid Silver):** A sophisticated metallic grey used for iconography and subtle borders.
- **Neutral/Background:** Pure White (#FFFFFF) for primary surfaces, with Soft Platinum (#F8F9FA) used for secondary containers to create depth without contrast.
- **Gradients:** A signature "Warm Mesh" is applied to large background areas or hero sections to prevent the UI from feeling cold, while a sharp Cyan-to-Violet gradient is reserved for high-impact buttons.

## Typography
The typography strategy mimics high-end editorial journals. **Hanken Grotesk** is used for headlines at very light weights (200-300) to maintain an "etched" look. For technical data and UI controls, **Geist** provides a mono-spaced influence that suggests precision and developer-centric engineering.

**Newsreader** is introduced as a tertiary serif font specifically for long-form reading, quotes, or "academic insights," providing a classical counterpoint to the tech-heavy sans-serifs. Scale is used aggressively; large display type should have negative letter-spacing to feel tight and designed, while small labels should have increased tracking for legibility.

## Layout & Spacing
The layout follows a **Fluid Grid** with exaggerated white space to emphasize the "Ethereal" quality. 

- **Desktop:** 12-column grid with wide 32px gutters. Content should rarely fill the full width of the screen, instead floating in centered containers to maintain focus.
- **Vertical Rhythm:** A generous 120px gap between major sections ensures the design remains "clutter-free."
- **Safe Margins:** Use a minimum of 80px horizontal padding on desktop to push content away from the edges, reinforcing the "breathable" narrative.

## Elevation & Depth
Depth is achieved through **Soft Neomorphism** and **Tonal Layers**. Instead of traditional black shadows, use "Ambient Shadows"—diffused blurs that take on a hint of the primary color or a soft blue-grey.

- **Surface Level 0:** Pure White background.
- **Surface Level 1:** Soft Platinum containers with a subtle inset shadow to appear "pressed" into the page.
- **Surface Level 2 (Floating):** Elements like cards use a double shadow: a light highlight on the top-left and a soft, 15% opacity shadow on the bottom-right.
- **Backdrop:** Use heavy background blurs (30px+) behind navigation bars and modals to create a frosted-glass effect that maintains the sense of light.

## Shapes
Shapes are deliberately refined. A **Rounded (0.5rem)** base radius is applied to standard UI elements like inputs and buttons to feel approachable. Larger containers and cards use **Rounded-LG (1rem)** to soften the overall architecture of the page. 

Avoid full pill-shapes for primary buttons to maintain a more "professional/academic" structure; instead, use the consistent 0.5rem radius. Circular shapes are reserved strictly for avatars and status indicators.

## Components
- **Buttons:** Primary buttons use the Cyan-to-Violet gradient with white text. Secondary buttons are "Glass" style: transparent backgrounds with a 1px Liquid Silver border and a subtle backdrop blur.
- **Inputs:** Fields should have no bottom border, but rather a soft platinum background with an inset shadow. On focus, the background turns pure white with a 1px Cyan glow.
- **Cards:** Cards should not have visible borders. They are defined by their soft elevation or a slight change in background tone (White to Platinum).
- **Chips/Badges:** Use Geist at a small size with high letter spacing. Backgrounds should be 10% opacity Cyan to keep them light and airy.
- **Lists:** Use wide spacing between list items (at least 16px). Use "Liquid Silver" dots or thin 0.5px horizontal rules that fade out at the edges.
- **Navigation:** Top-level navigation should be persistent but semi-transparent, using a `backdrop-filter: blur(20px)` to allow the "Warm Mesh" gradients to peek through.