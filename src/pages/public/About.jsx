import { FACTS, SITE } from '../../config/site'
import { useDocumentTitle } from '../../hooks'
import { PublicLayout } from './landing/Sections'
import '../../styles/landing.css'

export default function About() {
  useDocumentTitle('About LossLens')
  const statistics = FACTS.filter((fact) => fact.id !== 'sha-statement')
  const sha = FACTS.find((fact) => fact.id === 'sha-statement')

  return (
    <PublicLayout>
      <main className="ll-section">
        <div className="ll-container ll-narrow">
          <p className="ll-eyebrow">About LossLens</p>
          <h1 className="ll-page-title">A practical place to reflect and find support</h1>
          <p className="ll-lede">LossLens is a private recovery companion for people affected by betting in Kenya.</p>

          <section className="ll-page-section">
            <h2 className="ll-h2">Betting in Kenya, in numbers</h2>
            <div className="ll-facts">
              {statistics.map((fact) => (
                <article className="ll-fact" key={fact.id}>
                  <strong>{fact.value}</strong>
                  <p>{fact.label}</p>
                  <small>Source: <a href={fact.url} target="_blank" rel="noopener noreferrer">{fact.source}</a> · verified {fact.verifiedOn}</small>
                </article>
              ))}
            </div>
            <p className="ll-caption">These figures describe betting in Kenya; they are not measurements of LossLens or its results.</p>
          </section>

          <section className="ll-page-section">
            <h2 className="ll-h2">Help exists. Reaching it can be hard.</h2>
            <p className="ll-lede">Counselling and peer support exist in Kenya. LossLens aims to offer a pocket-sized way to notice patterns and reach support when it is useful.</p>
            {sha && (
              <aside className="ll-note">
                <strong>A note on SHA.</strong> In {sha.value}, Kenya’s Ministry of Health said gambling rehabilitation was included in Social Health Authority benefit packages. <a href={sha.url} target="_blank" rel="noopener noreferrer">Read the source</a>. This is not a promise that a particular facility will provide treatment; LossLens is not a SHA provider.
              </aside>
            )}
          </section>

          <section className="ll-page-section">
            <h2 className="ll-h2">How the app works</h2>
            <div className="ll-model">
              <p className="ll-lede">Diary entries contribute to a simple daily risk picture using recent gambling days, missed check-ins, stress, payday windows and time of day. The app shows low, medium or high bands with the reasons listed plainly.</p>
              <p className="ll-lede">This early model needs calibration with real data in a pilot. It is a prompt to check in, not a diagnosis or a prediction.</p>
            </div>
            <p className="ll-lede">{SITE.founderNote || 'LossLens is being built to make practical recovery tools easier to reach, privately and at a person’s own pace.'}</p>
            {SITE.credibility?.length > 0 && <p className="ll-caption">{SITE.credibility.join(' · ')}</p>}
          </section>
        </div>
      </main>
    </PublicLayout>
  )
}
