import { test, expect } from '@playwright/test'

// Signed-in flows (onboarding, diary check-in, help sheet) require a real
// Supabase session and are covered by unit tests + manual QA. These smoke
// tests cover everything reachable without credentials: the sign-in page,
// route guards, and the full demo mode (which includes a working check-in,
// Urge Toolkit delay, community and insurer samples).

// The guided tour auto-opens on a first visit and would block clicks.
async function dismissTour(page) {
  await page.addInitScript(() => {
    try { localStorage.setItem('ll-demo-tour-done', 'done') } catch { /* ignore */ }
  })
}

test('sign-in page renders', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible()
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await expect(page.locator('input[type="password"]')).toBeVisible()
  await expect(page.getByRole('link', { name: /demo/i })).toBeVisible()
})

test('protected routes redirect to sign-in without a session', async ({ page }) => {
  for (const path of ['/dashboard', '/diary', '/urge-toolkit', '/insurer', '/admin']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/login/)
  }
})

test('demo mode renders labelled sample data', async ({ page }) => {
  await page.goto('/demo')
  await expect(page.getByRole('heading', { name: /walkthrough/i })).toBeVisible()
  await expect(page.getByText(/sample data/i).first()).toBeVisible()
  await expect(page.getByText('Day streak')).toBeVisible()
  await expect(page.getByText('Money saved (sample)')).toBeVisible()
  await expect(page.getByRole('heading', { name: /insurer dashboard/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: /admin analytics/i })).toBeVisible()
})

test('demo check-in saves on device only', async ({ page }) => {
  await dismissTour(page)
  await page.goto('/demo')
  await page.getByLabel(/urge level/i).fill('7')
  await page.getByRole('button', { name: /save check-in/i }).click()
  await expect(page.getByText(/demo check-in/i)).toBeVisible()
})

test('demo urge toolkit delay countdown starts', async ({ page }) => {
  await dismissTour(page)
  await page.goto('/demo')
  await page.getByRole('button', { name: /start 10-minute delay/i }).click()
  await expect(page.getByText(/remaining/i)).toBeVisible()
})

test('guided tour runs five steps', async ({ page }) => {
  await page.goto('/demo')
  // Tour auto-opens on first visit; reopen it only if the overlay never appears.
  const overlay = page.locator('.tour-overlay')
  const appeared = await overlay.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)
  if (!appeared) {
    await page.getByRole('button', { name: /take the tour/i }).click()
  }
  const tourCard = page.getByText(/step 1 of 5/i)
  await expect(tourCard).toBeVisible()
  for (let i = 2; i <= 5; i += 1) {
    await page.getByRole('button', { name: /^next$/i }).click()
    await expect(page.getByText(new RegExp(`step ${i} of 5`, 'i'))).toBeVisible()
  }
  await page.getByRole('button', { name: /^done$/i }).click()
  await expect(tourCard).not.toBeVisible()
})

test('demo reset clears local state', async ({ page }) => {
  await dismissTour(page)
  await page.goto('/demo')
  await page.getByRole('button', { name: /save check-in/i }).click()
  await expect(page.getByText(/demo check-in/i)).toBeVisible()
  await page.getByRole('button', { name: /reset demo/i }).click()
  await expect(page.getByText(/demo check-in/i)).not.toBeVisible()
})
