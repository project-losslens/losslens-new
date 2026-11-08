import ContactIcons from '../../../components/ContactIcons'

export default function Contact() {
  return (
    <section className="ll-band" id="contact" aria-labelledby="ll-contact-title">
      <div className="ll-container ll-narrow ll-contact">
        <h2 id="ll-contact-title" className="ll-h2">Talk to us</h2>
        <p className="ll-lede ll-center" style={{ marginInline: 'auto' }}>
          Questions, feedback, partnerships or a pilot idea — we read everything.
        </p>
        <div className="ll-contact__icons">
          <ContactIcons subject="Hello from the LossLens website" size={22} />
        </div>
      </div>
    </section>
  )
}
