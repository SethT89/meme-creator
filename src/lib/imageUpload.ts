// Uploading a phone photo's full original (often 5-15MB+) both takes far
// longer than the connection needs and produces a file much larger than
// this app ever displays or exports at. Downscaling to a sane ceiling and
// re-encoding as JPEG before upload cuts the typical payload by 5-20x with
// no visible quality loss at the sizes this app actually shows things.
export const MAX_UPLOAD_DIMENSION = 2400
export const UPLOAD_JPEG_QUALITY = 0.85

// Reads a locally-picked image file, downscales it to fit within
// MAX_UPLOAD_DIMENSION on its longer edge (never upscales a smaller image),
// and re-encodes it as JPEG — this is what actually gets uploaded, not the
// original file. Also serves as the one place that reads the image's real
// pixel dimensions, combining what would otherwise be two separate full
// image decodes (one just to read dimensions, one to draw it) into one.
export function prepareImageForUpload(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight))
      const width = Math.round(img.naturalWidth * scale)
      const height = Math.round(img.naturalHeight * scale)

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('Canvas 2D context is not available'))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl)
          if (blob) resolve({ blob, width, height })
          else reject(new Error('Canvas toBlob failed'))
        },
        'image/jpeg',
        UPLOAD_JPEG_QUALITY,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not read the selected image'))
    }
    img.src = objectUrl
  })
}
