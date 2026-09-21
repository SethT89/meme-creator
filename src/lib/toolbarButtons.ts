// The Templates and Export buttons in the toolbar row above the canvas are the same width on
// a phone (so the row reads as a tidy pair of equal buttons), and go back to hugging their label
// from `sm` up. One constant, so the two can't drift apart.
//
// Heights need no constant: both are `<Button size="sm">` (h-8, h-11 on a touch screen), and
// the three-dots menu button is deliberately h-8 w-8 / h-11 w-11 to match — a test pins that.
export const TOOLBAR_TEXT_BUTTON = 'w-24 sm:w-auto'
