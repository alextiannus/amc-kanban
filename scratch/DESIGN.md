---
name: Digital Employee Console
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
  on-surface-variant: '#464554'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#767586'
  outline-variant: '#c7c4d7'
  surface-tint: '#494bd6'
  primary: '#4648d4'
  on-primary: '#ffffff'
  primary-container: '#6063ee'
  on-primary-container: '#fffbff'
  inverse-primary: '#c0c1ff'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#825100'
  on-tertiary: '#ffffff'
  tertiary-container: '#a36700'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e1e0ff'
  primary-fixed-dim: '#c0c1ff'
  on-primary-fixed: '#07006c'
  on-primary-fixed-variant: '#2f2ebe'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
  danger-coral: '#ef4444'
  dark-bg: '#090d16'
  dark-card: '#111827'
  white: '#ffffff'
typography:
  display-lg:
    fontFamily: manrope
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: manrope
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: manrope
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-md:
    fontFamily: manrope
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: hankenGrotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: hankenGrotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-sm:
    fontFamily: jetbrainsMono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  action-button:
    fontFamily: hankenGrotesk
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 20px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  gutter-mobile: 16px
  gutter-desktop: 24px
  margin-page: 32px
  component-gap: 12px
---

## Brand & Style
The design system is centered around the concept of a "Digital Employee"—an invisible but omnipresent assistant for busy restaurant owners. The personality is efficient, reliable, and supportive, characterized by a **Modern Minimalism** aesthetic that blends professional SaaS reliability with a warm, human-centric interface.

The style prioritizes "Zero-Friction" decision-making. High-density information is avoided in favor of "Human-AI Collaboration" flows where the AI proposes and the human approves. Visually, the system uses a mix of **Corporate Modern** structures and **Tactile** physics-based interactions. The UI should feel lightweight and breathable, using subtle gradients and spring-based animations to create a responsive, physical sensation during interaction.

## Colors
The palette is built on a foundation of clarity and semantic urgency. 

- **Primary (Indigo):** Represents the "AI Brain" and active presence. Used for primary actions, focus states, and the AI breathing indicator.
- **Success (Emerald):** Denotes positive ROI, published content, and resolved tasks.
- **Warning (Amber):** Signals items requiring owner intervention, such as pending approvals or neutral feedback.
- **Danger (Coral):** Reserved for "Crisis Rescue" workflows—negative reviews or system errors requiring immediate attention.
- **Backgrounds:** A Slate-tinted light grey ensures the interface feels "cool" and professional, reducing eye strain during night-time management sessions. In Dark Mode, the interface shifts to a "Deep Navy" to maintain high contrast with the vibrant semantic colors.

## Typography
The typography system balances modern refinement with technical precision. 

**Manrope** is used for headlines to provide a professional, geometric structure that feels authoritative yet accessible. **Hanken Grotesk** serves as the primary body face, offering high legibility for rapid scanning of marketing copy and reports. For metadata, status tags, and AI-generated "code" snippets or identifiers, **JetBrains Mono** is utilized to reinforce the "Digital Employee" / Technical assistant narrative.

Hierarchy is strictly enforced: larger titles are used for "Approval Tasks" to ensure the user's eye is immediately drawn to the decision at hand.

## Layout & Spacing
This design system utilizes a **Fluid Grid** model with a focus on single-column stacks for mobile devices to minimize cognitive load.

- **Desktop:** 12-column grid with a max-width of 1440px for the central console. Sidebars are avoided in favor of a clean, centered workflow area.
- **Mobile/Tablet:** A prioritized "Approval Stream" layout. Margins are kept at 16px to maximize card real estate.
- **Rhythm:** An 8px linear scale is used for most components, while a tighter 4px scale is used for internal element relationships (e.g., icons next to text).

Workflows should be presented as a vertical "Feed" or "Stream" of cards, mimicking social media patterns that restaurant owners are already familiar with.

## Elevation & Depth
Depth is conveyed through **Tonal Layers** and **Ambient Shadows** to create a physical "stacked card" effect. 

- **Level 0 (Surface):** The Slate-tinted background.
- **Level 1 (Cards):** White (Light) or Dark Blue-Grey (Dark) surfaces with a soft, 12% opacity shadow (Primary-tinted) to suggest they are "floating" and interactable.
- **Level 2 (Active/Hover):** Increased shadow spread and a subtle 1px Primary border to indicate focus.
- **Glassmorphism:** The Header Bar and Bottom Navigation use a backdrop blur (20px) and 80% opacity to maintain a sense of space and context while scrolling.
- **Physics:** When a user interacts with a card (Swipe or Press), the element should scale down slightly (98%) to simulate physical compression.

## Shapes
The shape language is consistently **Rounded**, evoking a friendly and safe environment. All primary containers and buttons use a 0.5rem (8px) radius. Larger cards and modal sheets use 1rem (16px) or 1.5rem (24px) for a softer, more modern "app-like" feel. 

The AI floating bubble is a perfect circle, emphasizing its distinct role from the rest of the rectangular UI.

## Components

- **Swipeable Approval Cards:** The core of the workflow. The left border is color-coded by urgency (Coral for Danger, Indigo for Normal). Swiping right triggers a Success/Emerald glow; swiping left triggers a Danger/Coral glow.
- **AI Floating Ball:** A circular button in the bottom right. When the AI is "thinking," the ball exhibits a breathing glow animation using the Primary color. A red badge indicates unread AI suggestions.
- **Action Buttons:** Large, high-contrast buttons with significant internal padding. The primary button uses a subtle Indigo gradient.
- **3D Preview Container:** For marketing materials (posters/table cards), a dedicated card with a subtle inner shadow provides a 3D-rendered perspective of the physical asset.
- **Status Chips:** Low-saturation backgrounds with high-saturation text using the semantic palette (e.g., Emerald background at 10% opacity for "Published" tags).
- **Brand Switcher:** A minimalist dropdown in the header with no border, using a chevron icon and a subtle hover tint to indicate interactivity.
- **Bottom Navigation:** Fixed 64px bar for mobile/tablet. Icons are minimalist line-art, filling with the Primary color when active.
