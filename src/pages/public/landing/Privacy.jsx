export default function Privacy() {
  return (
    <section className="ll-band" id="privacy" aria-labelledby="ll-privacy-title">
      <div className="ll-container ll-narrow ll-privacy">
        <h2 id="ll-privacy-title" className="ll-h2">Your data belongs to you</h2>
        <p className="ll-lede">
          LossLens is designed with the Data Protection Act 2019 in mind. Here is what that means
          in practice, based on how the app is built:
        </p>
        <ul>
          <li><strong>Your diary stays private.</strong> Entries are visible to you, not to partners or advertisers.</li>
          <li><strong>Oloo is an AI companion</strong> powered by a third-party AI service. Before your
          first chat, the app asks for your consent, and the server refuses to send your context to the
          AI without it.</li>
          <li><strong>AI chats are never shared with partners</strong> — not insurers, not employers.</li>
          <li><strong>Partners see aggregate figures only.</strong> Small groups are never reported.</li>
          <li><strong>Anonymous rooms use no real names.</strong> The Circle and Whispers identify you by
          a hashed alias, not your account details.</li>
        </ul>
      </div>
    </section>
  )
}
