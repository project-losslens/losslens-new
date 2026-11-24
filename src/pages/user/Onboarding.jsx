import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuthProfile } from '../../context/AuthProfileContext'
import { usePgsi } from '../../context/PgsiContext'
import PgsiAssessment from '../../components/PgsiAssessment'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import TopographicBackground from '../../components/TopographicBackground'

export default function Onboarding() {
  const navigate = useNavigate()
  const { user, refreshProfile } = useAuthProfile()
  const pgsi = usePgsi()
  const [goal, setGoal] = useState('Abstinence')
  const [skipping, setSkipping] = useState(false)
  const [error, setError] = useState('')
  const finish = result => {
    sessionStorage.removeItem('losslens_new_signup')
    sessionStorage.removeItem('onboarding_step')
    sessionStorage.removeItem('onboarding_answers')
    void refreshProfile()
    pgsi.acceptAssessment(result, () => navigate('/dashboard', { replace: true }))
  }
  const skip = async () => {
    if (!user || skipping) return
    setSkipping(true); setError('')
    try {
      const { data, error: saveError } = await supabase.from('profiles').update({ onboarding_completed: true, onboarding_skipped: true }).eq('id', user.id).select('id').single()
      if (saveError || data?.id !== user.id) throw new Error('Not saved')
      pgsi.dismissReminder()
      sessionStorage.removeItem('losslens_new_signup')
      await refreshProfile()
      navigate('/dashboard', { replace: true })
    } catch { setError('Your choice could not be saved. Please retry.'); setSkipping(false) }
  }
  return <main className="pgsi-onboarding">
    <TopographicBackground variant="app" />
    <div className="card">
      <div className="pgsi-dialog__header"><h1>Your gambling self-check</h1><LanguageSwitcher /></div>
      <p>Start with a private reflection on your gambling. Your answers help you understand your own experience; you choose what happens next.</p>
      <label className="form-group">What would you like to work towards?
        <select value={goal} onChange={event => setGoal(event.target.value)}>{['Abstinence','Cut down','Stay on track','Just exploring'].map(option => <option key={option}>{option}</option>)}</select>
      </label>
      <PgsiAssessment completeOnboarding goal={goal} onCompleted={finish} />
      {error && <p role="alert" className="portal-error">{error}</p>}
      <button type="button" className="btn-ghost" disabled={skipping} onClick={skip}>{skipping ? 'Saving...' : 'Skip for now'}</button>
      <p className="pgsi-muted">Skipping does not create a score. You can take your first self-check from the dashboard. Urgent help is always available from the help button.</p>
    </div>
  </main>
}