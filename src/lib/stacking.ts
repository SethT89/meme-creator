// The app's stacking order, lowest to highest, in one place — so a new floating thing can't
// end up under (or over) the wrong neighbour by guessing a number.
//
//   z-10  the canvas + button (CanvasFab); small dropdowns inside a card
//   z-20  the phone's bottom toolbar dock; the canvas "more" menu
//   z-30  the mobile template drawer (a slide-out panel, deliberately below dialogs)
//   z-50  the desktop floating text toolbar
//   z-60  MODAL_Z — dialogs and their scrim: above everything on the page
//   z-70  TOAST_Z — toasts: above dialogs, so an error shown while a dialog is still open is seen
//
// Tailwind only generates CSS for complete class names written out in the source, so these
// are literal strings, not built from pieces.
export const MODAL_Z = 'z-60'
export const TOAST_Z = 'z-70'
