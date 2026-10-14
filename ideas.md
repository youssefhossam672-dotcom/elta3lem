# Lumina Academy UI direction

## Ground-truth reference
The attached `login.pdf` is the source of truth. The experience is a light, compact education portal with a centered login card, royal-blue primary actions, pale blue utility surfaces, and a progression from authentication to role selection and role-specific dashboards. Fidelity to the reference takes priority over generic landing-page conventions.

## Chosen approach: Quiet Academic Utility

### Design Movement
Contemporary editorial education software: Swiss-influenced structure, restrained dashboard utility, and the calm confidence of a university learning portal.

### Core Principles
1. **Clarity before decoration.** Labels, controls, and next steps stay visually explicit.
2. **Quiet confidence.** Use pale surfaces, navy text, and a single assertive blue to make the product feel trustworthy rather than flashy.
3. **Structured transitions.** Login, registration, role selection, and dashboard screens share the same visual grammar so the synchronous flow feels like one product.
4. **Tactile precision.** Borders, focus states, iconography, and button feedback should feel deliberate at small sizes.

### Color Philosophy
Royal blue is reserved for decisive actions and the Lumina identity. Pale blue-gray surfaces create the sense of a clean study desk, while warm white keeps the product welcoming. Ink navy provides stable reading contrast; muted slate handles supporting copy without disappearing.

### Layout Paradigm
Use a responsive split-card and workspace composition rather than a large, centered marketing layout. Login stays compact and centered for focus, registration expands into an editorial two-column card, and authenticated views use a persistent left rail with an offset content canvas.

### Signature Elements
- A book-and-sun geometric mark that makes the academy name recognizable without relying on wordmark typography.
- Hairline blue rules and soft-blue panels that frame information like an annotated study guide.
- Circular role and progress badges that turn system status into calm, legible signals.

### Interaction Philosophy
Every interaction gives an immediate local response. Forms validate synchronously, links switch views without network waiting, and dashboard nav items update the active workspace in-place. Focus rings remain visible and action buttons show a short press response.

### Animation
Use short 160–240ms ease-out transitions for hover, focus, and view changes. On initial view changes, stagger major regions by 40ms and animate only opacity and translateY. Avoid motion on keyboard-driven focus and respect `prefers-reduced-motion`.

### Typography System
Use **Manrope** for interface text and **DM Sans** for compact supporting copy. Headlines use Manrope 700–800 with tight tracking; labels use 11–12px uppercase or semibold text; body copy uses 13–14px with generous line-height. Never use Inter.

### Brand Essence
Lumina Academy is a focused learning operations portal for students, teachers, assistants, and administrators who need a calm, synchronized place to move from intent to action. Personality: **precise, reassuring, studious**.

### Brand Voice
Headlines are concise and quietly encouraging. CTAs describe the next action directly. Microcopy is specific, human, and never padded with generic filler.

Example lines: “Sign in to your learning portal.” and “Choose the workspace that matches your day.”

### Wordmark & Logo
The mark is a compact open-book silhouette with a rising sun/star cutout. The “Lumina Academy” wordmark is rendered as a custom-weighted lockup beside the symbol, with a smaller academic descriptor for dashboard contexts.

### Signature Brand Color
**Lumina Royal — `#155EEF`**, a clear blue that reads as trustworthy on white and remains distinct from the pale blue-gray workspace surfaces.

## Implementation notes
The current web scaffold is React 19 + Vite with Wouter routing. The user-facing experience is implemented as a synchronous client-side state machine with no API calls: login, registration, role selection, and dashboard views resolve immediately in local state. No backend or server code is changed.
