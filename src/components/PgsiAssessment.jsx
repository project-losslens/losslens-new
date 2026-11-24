import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PGSI_QUESTIONS, PGSI_RESPONSES, PGSI_TIMEFRAME, PGSI_VERSION } from '../config/pgsi'
import { pgsiBand, validPgsiAnswers } from '../lib/pgsi'

export default function PgsiAssessment({ onCompleted, completeOnboarding = false, goal = null }) {
  const [answers, setAnswers] = useState(() => Array(9).fill(null))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submission = useRef(null)
  const busy = useRef(false)
  const complete = validPgsiAnswers(answers)
  const submit = async event => {
    event.preventDefault()
    if (busy.current) return
    if (!complete) { setError('Please answer all nine questions. An unanswered question does not count as Never.'); return }
    const serialized = JSON.stringify(answers)
    if (!submission.current || submission.current.answers !== serialized) submission.current = { id: crypto.randomUUID(), answers: serialized }
    busy.current = true; setSaving(true); setError('')
    let result
    try {
      const { data, error: saveError } = await supabase.rpc('submit_pgsi', {
        p_submission_id: submission.current.id, p_answers: answers, p_version: PGSI_VERSION,
        p_complete_onboarding: completeOnboarding, p_goal: goal,
      })
      if (saveError || !data?.id || !Number.isFinite(Date.parse(data.completed_at)) || data.band !== pgsiBand(data.raw_score)) throw new Error('Save not confirmed')
      result = data
    } catch {
      setError('Your self-check was not confirmed as saved. Your answers are still here; please retry. The reminder will remain due until a save succeeds.')
    } finally { busy.current = false; setSaving(false) }
    if (result) onCompleted(result)
  }
  return <form onSubmit={submit} className="pgsi-assessment">
    <p>This is the nine-question Problem Gambling Severity Index (PGSI), a self-check rather than a diagnosis.</p>
    <p><strong>{PGSI_TIMEFRAME}</strong></p>
    <p className="pgsi-muted">Every self-check uses the same past-12-month period, even when repeated after seven days. The windows overlap; a change in score does not prove weekly improvement or deterioration.</p>
    {PGSI_QUESTIONS.map((question, index) => <fieldset key={question} disabled={saving}>
      <legend>{index + 1}. {question}</legend>
      <div className="pgsi-answers">{PGSI_RESPONSES.map((label, value) => <label key={label}>
        <input type="radio" name={`pgsi-${index}`} value={value} checked={answers[index] === value} onChange={() => { setAnswers(previous => previous.map((answer, position) => position === index ? value : answer)); setError('') }} />
        <span>{label}</span>
      </label>)}</div>
    </fieldset>)}
    <p aria-live="polite">{answers.filter(value => value !== null).length} of 9 answered</p>
    {error && <p role="alert" className="portal-error">{error}</p>}
    <button type="submit" className="btn-primary" disabled={saving || !complete}>{saving ? 'Saving self-check...' : 'Save my self-check'}</button>
    <p className="pgsi-muted">Your assessment is private. It is not shared with insurers, employers or supporters, does not decide cover eligibility, and does not send anyone a notification.</p>
  </form>
}