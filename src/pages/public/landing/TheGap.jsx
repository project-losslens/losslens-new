import { FACTS } from '../../../config/facts'

const sha = FACTS.find((f) => f.id === 'sha-statement')

export default function TheGap() {
  return (
    <section className="ll-band ll-band--surface" id="the-gap" aria-labelledby="ll-gap-title">
      <div className="ll-container">
        <h2 id="ll-gap-title" className="ll-h2">Help exists. Reaching it is the hard part.</h2>
        <p className="ll-lede" style={{ marginBottom: 'var(--space-6)' }}>
          Counselling and peer support do exist in Kenya. What is missing is something most people
          can actually reach at 2am, on a cheap Android phone, without explaining themselves to anyone.
        </p>
        <div className="ll-gap">
          <div className="ll-gap__col">
            <h3>What exists</h3>
            <ul>
              <li>Free and low-cost counselling and support lines, including Befrienders Kenya and NACADA.</li>
              <li>In April 2025, Kenya's Ministry of Health said gambling rehabilitation is included in the Social Health Authority (SHA) benefit packages.
                {' '}<a href={sha?.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>Source</a></li>
            </ul>
          </div>
          <div className="ll-gap__col ll-gap__col--missing">
            <h3>What is missing</h3>
            <ul>
              <li>A way to notice your own patterns before they become a crisis.</li>
              <li>Support that fits in a pocket, works on slow data, and asks nothing of your pride.</li>
              <li>Clear, honest information about what help costs and who provides it.</li>
            </ul>
          </div>
        </div>
        <p className="ll-sha-note">
          <strong>A note on SHA.</strong> The Ministry statement above describes benefit packages in general.
          It is not a promise that a given facility will treat you, and LossLens is not a SHA provider
          and does not deliver SHA services.
        </p>
      </div>
    </section>
  )
}
