// Starts downloading an image into the browser's cache before it's needed, so
// that when a template is actually picked its full-size image is often already
// there. The sidebar list only loads small thumbnails (to keep data use down),
// so without this the full image would only start downloading on click.
//
// crossOrigin matches how the canvas requests the image (see the template <img>
// in EditorPage): a plain and a CORS request for the same URL can be cached
// separately, and only a matching one gets reused.
const requested = new Set<string>()

export function prefetchImage(url: string | null | undefined): void {
  if (!url || requested.has(url)) return
  requested.add(url)
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.decoding = 'async'
  image.src = url
}
