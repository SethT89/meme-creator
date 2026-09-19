// Side-effect only. Importing a fontsource stylesheet just declares its
// @font-face rules; the browser downloads a font file the first time text in
// that family is actually rendered, so unused fonts cost nothing. Only the
// latin subsets are imported — characters outside them fall back to the
// system font. Keep this list in step with FONT_OPTIONS in lib/fonts.ts (a
// test enforces it).
import '@fontsource/anton/latin-400.css'
import '@fontsource/bebas-neue/latin-400.css'
import '@fontsource/archivo-black/latin-400.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/permanent-marker/latin-400.css'
import '@fontsource/bangers/latin-400.css'
import '@fontsource/special-elite/latin-400.css'
import '@fontsource/playfair-display/latin-700.css'
