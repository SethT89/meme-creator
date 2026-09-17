export function sanitizeFilename(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'meme'
}

export function canShareFile(file: File): boolean {
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
}

// Is this a phone/tablet OS (iOS/iPadOS/Android), not a desktop/laptop OS?
// Needed because canShareFile alone isn't enough to decide desktop vs
// mobile delivery — modern desktop Safari also supports the Web Share API
// for files (confirmed live: it pops the native macOS share sheet,
// AirDrop/Mail/Messages/etc.), which isn't what "download to Desktop"
// means on a desktop browser.
//
// Deliberately NOT a (pointer: coarse) media query: that answers "what
// input device is attached right now," not "what OS is this" — a
// touchscreen Windows laptop reports pointer:coarse but is still a
// desktop machine (no Files-app confusion the way iOS has), and an iPad
// with a trackpad/Magic Keyboard reports pointer:fine (iPadOS
// deliberately makes its trackpad mimic mouse hover/click behavior) even
// though it's exactly the device that needs the share sheet.
//
// iPadOS's own user-agent string is the hard case: it reports itself as
// desktop "Macintosh" by default (Apple's choice since iPadOS 13, for
// desktop-site compatibility), indistinguishable from a real Mac by UA
// string alone. The one reliable tell: no Mac has ever shipped with a
// touchscreen, so a "Macintosh" UA that also reports touch points is
// actually an iPad.
export function isMobileOrTabletDevice(): boolean {
  const ua = navigator.userAgent
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return true
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true
  return false
}

export async function shareFile(file: File, title: string): Promise<void> {
  await navigator.share({ files: [file], title })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoke on the next tick, not synchronously — revoking immediately can
  // cancel a same-tick download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
