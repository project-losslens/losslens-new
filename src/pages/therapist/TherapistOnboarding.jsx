import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthProfile } from '../../context/AuthProfileContext'

const MAX_LICENSE_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_LICENSE_TYPES = ['application/pdf', 'image/jpeg', 'image/png']

export default function TherapistOnboarding() {
  const { user } = useAuthProfile()
  const userId = user?.id
  const [form, setForm] = useState({ license_number: '', specialty: '', languages: '', bio: '', license_document_path: '' })
  const [status, setStatus] = useState('pending')
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    if (!userId) return
    const { data, error: loadError } = await supabase.from('therapists').select('*').eq('id', userId).maybeSingle()
    if (loadError) {
      console.error('Therapist profile load failed:', loadError)
      setError('Could not load your verification profile.')
    } else if (data) {
      setStatus(data.status)
      setForm({
        license_number: data.license_number || '',
        specialty: data.specialty || '',
        languages: (data.languages || []).join(', '),
        bio: data.bio || '',
        license_document_path: data.license_document_path || '',
      })
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const submit = async (event) => {
    event.preventDefault()
    if (!user?.id) return
    if (file && (!ALLOWED_LICENSE_TYPES.includes(file.type) || file.size > MAX_LICENSE_FILE_SIZE)) {
      setError('Upload a PDF, JPEG, or PNG file no larger than 10 MB.')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    let documentPath = form.license_document_path
    if (file) {
      const safeName = file.name.replace(/[^\w.-]/g, '_')
      documentPath = `${user.id}/${Date.now()}-${safeName}`
      const { error: uploadError } = await supabase.storage.from('therapist-documents').upload(documentPath, file, { upsert: false })
      if (uploadError) {
        console.error('Therapist license upload failed:', uploadError)
        setError('Could not upload the license document.')
        setSaving(false)
        return
      }
    }
    const { error: saveError } = await supabase.from('therapists').update({
      license_number: form.license_number.trim(),
      specialty: form.specialty.trim(),
      languages: form.languages.split(',').map((language) => language.trim()).filter(Boolean),
      bio: form.bio.trim(),
      license_document_path: documentPath || null,
    }).eq('id', user.id)
    if (saveError) {
      console.error('Therapist verification save failed:', saveError)
      setError('Could not save your profile. Please retry.')
    } else {
      setForm((current) => ({ ...current, license_document_path: documentPath }))
      setFile(null)
      setNotice('Your details were saved and are awaiting administrator verification.')
    }
    setSaving(false)
  }

  if (loading) return <p role="status">Loading verification profile...</p>
  return (
    <section className="portal-page">
      <p className="portal-page__eyebrow">Therapist verification</p>
      <h2>Professional profile</h2>
      <p>Submit your professional details and license for review. Your account is currently <strong>{status}</strong>.</p>
      {error && <p className="portal-error" role="alert">{error}</p>}
      {notice && <p className="portal-notice" role="status">{notice}</p>}
      <form className="portal-form" onSubmit={submit}>
        <label>License number<input value={form.license_number} onChange={(event) => setForm({ ...form, license_number: event.target.value })} required maxLength={100} /></label>
        <label>Specialty<input value={form.specialty} onChange={(event) => setForm({ ...form, specialty: event.target.value })} required maxLength={120} /></label>
        <label>Languages (comma-separated)<input value={form.languages} onChange={(event) => setForm({ ...form, languages: event.target.value })} maxLength={200} /></label>
        <label>Professional bio<textarea value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} rows={5} maxLength={2000} /></label>
        <label>License document (PDF, JPEG, PNG; up to 10 MB)<input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
        {form.license_document_path && <p>License document uploaded.</p>}
        <button className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save for verification'}</button>
      </form>
    </section>
  )
}
