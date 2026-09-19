export interface Swatch {
  name: string
  hex: string
}

// Modeled on the FigJam swatch grid: a row of saturated colors (black and
// white at the ends) over a row of matching tints. A custom-color wheel sits
// after the last tint in the UI. Names double as the swatch buttons' accessible
// labels. Black/white are exactly the default outline/fill so an unstyled
// layer shows them as selected.
export const SWATCH_ROWS: Swatch[][] = [
  [
    { name: 'Black', hex: '#000000' },
    { name: 'Gray', hex: '#757575' },
    { name: 'Red', hex: '#e2553a' },
    { name: 'Orange', hex: '#f4a259' },
    { name: 'Yellow', hex: '#fbcd5b' },
    { name: 'Green', hex: '#86d380' },
    { name: 'Teal', hex: '#7fd6cb' },
    { name: 'Blue', hex: '#5fa8fa' },
    { name: 'Purple', hex: '#8452f6' },
    { name: 'Pink', hex: '#e65bbd' },
    { name: 'White', hex: '#ffffff' },
  ],
  [
    { name: 'Silver', hex: '#b3b3b3' },
    { name: 'Light gray', hex: '#d9d9d9' },
    { name: 'Light red', hex: '#f7c9c4' },
    { name: 'Light orange', hex: '#fbe0c6' },
    { name: 'Light yellow', hex: '#fdefc4' },
    { name: 'Light green', hex: '#d7f3d9' },
    { name: 'Light teal', hex: '#d1f7f3' },
    { name: 'Light blue', hex: '#c9e2fd' },
    { name: 'Light purple', hex: '#dccdfb' },
    { name: 'Light pink', hex: '#f5c8e9' },
  ],
]
