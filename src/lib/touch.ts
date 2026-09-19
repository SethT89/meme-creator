// How big a fingertip target must be — one place, so it can be tuned once.
// 44px is Apple's minimum (Material asks for 48). Applied under `pointer-coarse:`
// so a mouse-driven desktop keeps its compact controls; a phone or tablet gets
// finger-sized ones.
//
// Tailwind only generates CSS for complete class names it can find written out,
// so these are literal strings, not built up from pieces. min-h/min-w (rather than
// padding) means a control is never SMALLER than this, whatever is inside it.
export const TAP_HEIGHT = 'pointer-coarse:min-h-11'
// For icon-only controls, which must be wide as well as tall.
export const TAP_SIZE = 'pointer-coarse:min-h-11 pointer-coarse:min-w-11'
