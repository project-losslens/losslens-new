import { Link, Navigate } from 'react-router-dom'
import ContactIcons from '../../components/ContactIcons'
import TopographicBackground from '../../components/TopographicBackground'
import { ACTUARIAL_NOTES, PROTECTION_STATUS, STRUCTURES, STRUCTURE_ORDER } from '../../config/protectionProducts'
import { SHOW_PROTECTION } from './protectionContent'
import { useDocumentTitle } from '../../hooks'
import '../../styles/landing.css'

const STATES = [
  ['S0', 'No identified harmful gambling'],
  ['S1', 'Harmful gambling, not in treatment'],
  ['S2', 'In treatment'],
  ['S3', 'Post-treatment recovery'],
]

const PRICING_LINKS = [
  'Expected claims — how often eligible treatment starts and how much each episode costs.',
  'Claims frequency and severity — driven by treatment-plan intensity and the session-value framework.',
  'Expenses — acquisition, administration and insurer charges, which differ by structure.',
  'Risk margin — the insurer\u2019s charge for uncertainty, which is larger where data are thinner.',
  'Gross premium — the sum of the above, always set by the insurer, never by LossLens.',
]

const STRUCTURE_FACTORS = [
  ['Risk-pool composition', 'Rider pools with existing medical policyholders; individual pools are standalone; group pools are organisation-based.'],
  ['Adverse selection', 'Individual applicants may self-select differently from group or rider populations.'],
  ['Acquisition cost', 'Highest for individual direct acquisition; lower where a group or insurer channel distributes.'],
  ['Administration cost', 'Group arrangements can share administration across members; riders reuse an existing policy.'],
  ['Premium collection', 'Insurer-quoted per policy (rider), per individual (standalone) or per group arrangement.'],
  ['Data availability', 'No validated Kenyan longitudinal claims data exists yet for any structure.'],
]

export default function ProtectionActuarial() {
  useDocumentTitle('LossLens Protection — actuarial approach')
  if (!SHOW_PROTECTION) return <Navigate to="/" replace />

  return (
    <div className="ll-landing">
      <TopographicBackground variant="hero" />
      <main className="ll-band" style={{ paddingTop: 'var(--space-7)' }}>
        <div className="ll-container ll-narrow">
          <p className="ll-eyebrow"><Link to="/protection" style={{ color: 'inherit' }}>LossLens Protection</Link></p>
          <h1 className="ll-h2" style={{ fontSize: 'var(--step-4)' }}>The actuarial approach</h1>
          <p className="ll-crisis__note" style={{ marginBottom: 'var(--space-6)' }}>{PROTECTION_STATUS}</p>

          <section style={{ marginBottom: 'var(--space-7)' }}>
            <h2 className="ll-h2" style={{ fontSize: 'var(--step-2)' }}>A four-state model</h2>
            <p className="ll-lede">{ACTUARIAL_NOTES.model}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
              {STATES.map(([code, label]) => (
                <div key={code} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', padding: 'var(--space-3)' }}>
                  <strong style={{ color: '#2DD4BF' }}>{code}</strong>
                  <p className="ll-lede" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>{label}</p>
                </div>
              ))}
            </div>
            <p className="ll-lede" style={{ marginTop: 'var(--space-3)' }}>
              Transition assumptions project how members move between states over time — and therefore how often treatment starts and how many benefit events to expect.
            </p>
          </section>

          <section style={{ marginBottom: 'var(--space-7)' }}>
            <h2 className="ll-h2" style={{ fontSize: 'var(--step-2)' }}>From expected claims to premium</h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {PRICING_LINKS.map((i) => <li key={i.slice(0, 30)} className="ll-lede">{i}</li>)}
            </ul>
            <p className="ll-lede" style={{ marginTop: 'var(--space-3)' }}>{ACTUARIAL_NOTES.uncertainty}</p>
          </section>

          <section style={{ marginBottom: 'var(--space-7)' }}>
            <h2 className="ll-h2" style={{ fontSize: 'var(--step-2)' }}>One package, three risk pools</h2>
            <p className="ll-lede" style={{ marginBottom: 'var(--space-3)' }}>{ACTUARIAL_NOTES.structures}</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', color: '#2DD4BF', padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>Factor</th>
                    {STRUCTURE_ORDER.map((s) => (
                      <th key={s} style={{ textAlign: 'left', color: '#2DD4BF', padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>{STRUCTURES[s].name.replace('LossLens ', '')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {STRUCTURE_FACTORS.map(([factor, note]) => (
                    <tr key={factor}>
                      <td style={{ color: '#FFFFFF', padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.08)', verticalAlign: 'top' }}><strong>{factor}</strong></td>
                      {STRUCTURE_ORDER.map((s) => (
                        <td key={s} style={{ color: 'rgba(255,255,255,0.65)', padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.08)', verticalAlign: 'top' }}>{note}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="ll-lede" style={{ marginTop: 'var(--space-3)' }}>
              No validated actuarial results exist yet for any structure — the insurer must model each arrangement with its own data.
            </p>
          </section>

          <section style={{ marginBottom: 'var(--space-7)' }}>
            <h2 className="ll-h2" style={{ fontSize: 'var(--step-2)' }}>Questions</h2>
            <p className="ll-lede" style={{ marginBottom: 'var(--space-4)' }}>
              Actuarial detail is working material, not a quotation. For product enquiries, contact the team — we will connect you with the right insurer-controlled process.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
              <ContactIcons subject="Protection actuarial enquiry" />
              <Link to="/protection" className="ll-btn ll-btn--ghost">Back to Protection</Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
