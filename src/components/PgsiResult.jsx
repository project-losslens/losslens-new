import { PGSI_EXPLANATIONS, pgsiPercentage } from '../lib/pgsi'
import SupportChoices from './SupportChoices'

export default function PgsiResult({ result }) {
  return <div className="pgsi-result">
    <p><strong>{pgsiPercentage(result.raw_score)}% of maximum: {result.raw_score}/27 points</strong></p>
    <p>Completed {new Date(result.completed_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })} (Nairobi time).</p>
    <p>{PGSI_EXPLANATIONS[result.band]}</p>
    <p>Your answers cover the past 12 months before this assessment. The percentage is your share of the 27 possible points. It is not a likelihood of addiction or a measure of how recovered you are.</p>
    <p>This self-check cannot diagnose a condition. Support is an option at any score, and you decide whether to use it.</p>
    <SupportChoices />
  </div>
}