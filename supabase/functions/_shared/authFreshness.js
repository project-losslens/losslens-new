export function recentlyAuthenticated(payload, nowSeconds = Date.now() / 1000) {
  const methods = new Set(['password', 'oauth', 'otp', 'totp', 'sso/saml', 'sso', 'recovery'])
  return Array.isArray(payload?.amr) && payload.amr.some(entry => {
    const timestamp = Number(entry.timestamp)
    return methods.has(entry.method) && Number.isFinite(timestamp)
      && timestamp >= nowSeconds - 900 && timestamp <= nowSeconds + 30
  })
}
