export function crisisReply(target = 'self') {
  return target === 'other'
    ? "I'm glad you're looking out for someone else. If they may act now, stay with them if it is safe and contact emergency help. Encourage them to speak with a counsellor. These resources can help you support them; no alert about your own safety is being sent."
    : "I'm really sorry you're facing this. Your safety matters. If you might act on these thoughts, move away from anything you could use to hurt yourself and stay with someone you trust. Please contact urgent human help now. If there is immediate danger, contact local emergency services."
}
export function publishCrisisSupport(detail) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('losslens:crisis-support', { detail }))
}