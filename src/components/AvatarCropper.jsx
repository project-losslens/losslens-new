import { useEffect, useRef, useState } from 'react'
import NumberField from './NumberField'
import { useI18n } from '../i18n'

const OUTPUT_SIZE = 256
const MAX_FILE_SIZE = 100 * 1024

function drawCrop(canvas, image, zoom, horizontal, vertical) {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable')

  const scale = Math.max(OUTPUT_SIZE / image.naturalWidth, OUTPUT_SIZE / image.naturalHeight) * zoom
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  const x = (OUTPUT_SIZE - width) * horizontal
  const y = (OUTPUT_SIZE - height) * vertical
  context.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
  context.drawImage(image, x, y, width, height)
}

function toWebp(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not encode the cropped photo'))
    }, 'image/webp', quality)
  })
}

export default function AvatarCropper({ file, saving = false, onCancel, onSave }) {
  const { t } = useI18n()
  const readFailedText = t('avatar.readFailed')
  const renderFailedText = t('avatar.renderFailed')
  const prepareFailedText = t('avatar.prepareFailed')
  const canvasRef = useRef(null)
  const [image, setImage] = useState(null)
  const [imageError, setImageError] = useState('')
  const [zoom, setZoom] = useState(1)
  const [horizontal, setHorizontal] = useState(0.5)
  const [vertical, setVertical] = useState(0.5)
  const [encoding, setEncoding] = useState(false)

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file)
    const photo = new Image()
    photo.onload = () => setImage(photo)
    photo.onerror = () => setImageError(readFailedText)
    photo.src = objectUrl
    return () => URL.revokeObjectURL(objectUrl)
  }, [file, readFailedText])

  useEffect(() => {
    if (!image || !canvasRef.current) return
    try {
      drawCrop(canvasRef.current, image, zoom, horizontal, vertical)
      setImageError('')
    } catch (error) {
      console.error('Avatar crop preview failed:', error)
      setImageError(renderFailedText)
    }
  }, [image, zoom, horizontal, vertical, renderFailedText])

  const save = async () => {
    if (!canvasRef.current || encoding || saving) return
    setEncoding(true)
    try {
      for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5]) {
        const blob = await toWebp(canvasRef.current, quality)
        if (blob.size <= MAX_FILE_SIZE) {
          await onSave(blob)
          return
        }
      }
      setImageError(t('avatar.photoTooLarge'))
    } catch (error) {
      console.error('Avatar photo could not be prepared:', error)
      setImageError(prepareFailedText)
    } finally {
      setEncoding(false)
    }
  }

  return (
    <div className="avatar-cropper__backdrop" role="presentation">
      <section className="avatar-cropper" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title">
        <h2 id="avatar-crop-title">{t('avatar.cropTitle')}</h2>
        <canvas ref={canvasRef} width={OUTPUT_SIZE} height={OUTPUT_SIZE} className="avatar-cropper__canvas" aria-label={t('avatar.cropTitle')} />
        <label>
          {t('avatar.zoom')}
          <NumberField inputMode="decimal" min={1} max={3} step={0.01} value={zoom} onChange={(next) => setZoom(next ?? 1)} />
        </label>
        <label>
          {t('avatar.horizontalPosition')}
          <NumberField inputMode="decimal" min={0} max={1} step={0.01} value={horizontal} onChange={(next) => setHorizontal(next ?? 0.5)} />
        </label>
        <label>
          {t('avatar.verticalPosition')}
          <NumberField inputMode="decimal" min={0} max={1} step={0.01} value={vertical} onChange={(next) => setVertical(next ?? 0.5)} />
        </label>
        {imageError && <p className="avatar-cropper__error" role="alert">{imageError}</p>}
        <div className="avatar-cropper__actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving || encoding}>{t('avatar.cancel')}</button>
          <button type="button" className="btn-primary" onClick={save} disabled={!image || Boolean(imageError) || saving || encoding}>
            {saving || encoding ? t('avatar.uploading') : t('avatar.save')}
          </button>
        </div>
      </section>
    </div>
  )
}
