import { FACTS } from '../../../config/facts'

export default function Numbers() {
  const shown = FACTS.filter((f) => f.id !== 'sha-statement')
  return (
    <section className="ll-band" aria-labelledby="ll-numbers-title">
      <div className="ll-container">
        <h2 id="ll-numbers-title" className="ll-h2 ll-center">Betting in Kenya, in numbers</h2>
        <div className="ll-numbers">
          {shown.map((f) => (
            <div className="ll-stat" key={f.id}>
              <span className="ll-stat__value">{f.value}</span>
              <span className="ll-stat__label">{f.label}</span>
              <span className="ll-stat__src">
                Source:{' '}
                <a href={f.url} target="_blank" rel="noopener noreferrer">{f.source}</a>
                {' '}· verified {f.verifiedOn}
              </span>
            </div>
          ))}
        </div>
        <p className="ll-caption ll-center">
          These figures describe betting in Kenya. They are not measurements of LossLens or its results.
        </p>
      </div>
    </section>
  )
}
