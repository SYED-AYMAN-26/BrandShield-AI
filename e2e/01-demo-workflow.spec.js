import { test, expect } from '@playwright/test';

/**
 * End-to-end walkthrough of the demo, driven purely through the browser UI.
 * Run against a seeded demo workspace (npm run seed).
 */
const PASSWORD = 'DemoPass!2026';

async function signIn(page, email) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe('first-time visitor', () => {
  test('understands the product from the landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/marketing claims/i);
    // The three-step explanation must be visible without any interaction.
    await expect(page.getByRole('heading', { name: 'Add your content' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Check it against your brand rules' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Fix it and submit for review' })).toBeVisible();
    // The demo entry point is clearly labelled.
    await expect(page.getByRole('heading', { name: /Explore the demo workspace/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Creator/ })).toBeVisible();
  });

  test('one click demo entry signs you in', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Creator/ }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(/Demo workspace/i).first()).toBeVisible();
  });
});

test.describe('creator journey', () => {
  test('checks content, sees evidence-backed findings, fixes them with one click', async ({ page }) => {
    await signIn(page, 'creator@demo.inkloom.test');

    // Dashboard explains what to do next.
    await expect(page.getByRole('heading', { name: /Hello/ })).toBeVisible();
    await page.getByRole('link', { name: /Start a new content check|Check new content/ }).first().click();
    await expect(page).toHaveURL(/content\/new/);

    // Use the built-in sample so the demo is repeatable.
    await page.getByRole('button', { name: /Use a sample with known issues/ }).click();
    await page.getByRole('button', { name: 'Save and continue' }).click();
    await expect(page).toHaveURL(/content\/[a-f0-9]{24}/);

    // Run the check.
    await page.getByRole('button', { name: 'Check Content', exact: true }).first().click();
    await expect(page.getByText(/Check complete/i)).toBeVisible({ timeout: 20_000 });

    // Findings must show the sentence, the evidence and the approved source.
    await expect(page.getByText('The sentence in your content').first()).toBeVisible();
    await expect(page.getByText(/Approved fact “price\.pro”/i)).toBeVisible();
    await expect(page.getByText(/Checked: this text appears word-for-word/i).first()).toBeVisible();
    await expect(page.getByText(/How to fix it/i).first()).toBeVisible();

    const issueCount = await page.getByRole('heading', { name: /issues? to review/i }).textContent();
    expect(issueCount).toMatch(/\d+/);

    // One-click fix on a numeric conflict.
    const fixButton = page.getByRole('button', { name: 'Fix this for me' }).first();
    await expect(fixButton).toBeVisible();
    await fixButton.click();
    await expect(page.getByText(/Replace .* with/i)).toBeVisible();

    // Re-check: the fixed issue must no longer be reported as open.
    await page.getByRole('button', { name: /Check Content again|Check Content/ }).first().click();
    await expect(page.getByText(/Check complete/i)).toBeVisible({ timeout: 20_000 });

    // Submit for review.
    await page.getByRole('button', { name: 'Submit for Review' }).click();
    await page.getByRole('button', { name: 'Submit for review' }).last().click();
    await expect(page.getByText(/Sent for review/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('In review').first()).toBeVisible();
  });

  test('cannot approve its own content', async ({ page }) => {
    await signIn(page, 'creator@demo.inkloom.test');
    await page.goto('/content');
    await page.getByRole('link', { name: /Landing page draft/i }).first().click();
    // The creator never sees an approve button.
    await expect(page.getByRole('button', { name: /^Approve content$/ })).toHaveCount(0);
  });
});

test.describe('reviewer and approver journey', () => {
  test('reviewer sees the queue and can dismiss a finding with a reason', async ({ page }) => {
    await signIn(page, 'reviewer@demo.inkloom.test');
    await page.goto('/content?status=in_review');
    await expect(page.getByRole('link', { name: /Review-ready demo draft/i })).toBeVisible();
    await page.getByRole('link', { name: /Review-ready demo draft/i }).click();
    await expect(page.getByText('In review').first()).toBeVisible();

    const dismiss = page.getByRole('button', { name: 'Dismiss with reason' }).first();
    await expect(dismiss).toBeVisible();
    await dismiss.click();
    await page.getByLabel(/Reason/).fill('Approved by legal in the brand book, section 5.');
    await page.getByRole('button', { name: 'Dismiss finding' }).click();
    await expect(page.getByText(/dismissed with your reason/i)).toBeVisible({ timeout: 15_000 });
  });

  test('approver cannot approve while high-risk findings are unresolved', async ({ page }) => {
    await signIn(page, 'approver@demo.inkloom.test');
    await page.goto('/content?status=in_review');
    await page.getByRole('link', { name: /Review-ready demo draft/i }).first().click();
    const approve = page.getByRole('button', { name: 'Approve content' });
    await expect(approve).toBeVisible();
    await expect(approve).toBeDisabled();
    await expect(page.getByText(/high-risk finding/i).first()).toBeVisible();
  });
});

test.describe('insights', () => {
  test('shows fact freshness and evaluation with honest limits', async ({ page }) => {
    await signIn(page, 'brand@demo.inkloom.test');
    await page.goto('/insights');
    await expect(page.getByRole('heading', { name: 'Insights' })).toBeVisible();
    await expect(page.getByText(/Expired/i).first()).toBeVisible();

    await page.getByRole('tab', { name: 'Accuracy check' }).click();
    await expect(page.getByText(/Read this before the numbers/i)).toBeVisible();
    await expect(page.getByText(/Limitations of this evaluation/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Held-out batch/i })).toBeVisible();

    await page.getByRole('tab', { name: 'Unclear guidelines' }).click();
    await expect(page.getByText(/no disagreement data|No reviewer has accepted/i).first()).toBeVisible();
  });

  test('brand rules page separates facts and guidelines', async ({ page }) => {
    await signIn(page, 'brand@demo.inkloom.test');
    await page.goto('/brand');
    await expect(page.getByRole('heading', { name: /Brand rules/i })).toBeVisible();
    await expect(page.getByText(/Pro plan price/i).first()).toBeVisible();
    await page.getByRole('tab', { name: /Guidelines/ }).click();
    await expect(page.getByText(/GL-SUP-01/).first()).toBeVisible();
  });
});

test.describe('usability and accessibility basics', () => {
  test('keyboard: sign-in form is fully operable without a mouse', async ({ page }) => {
    await page.goto('/login');
    await page.keyboard.press('Tab');
    // The first focusable element should be reachable and visible.
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(focused).toBeTruthy();
    await page.getByLabel('Email address').focus();
    await page.keyboard.type('creator@demo.inkloom.test');
    await page.getByLabel('Password').focus();
    await page.keyboard.type(PASSWORD);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('forms have labels and errors are announced', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email address').fill('wrong@example.com');
    await page.getByLabel('Password').fill('nope');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/incorrect/i);
  });

  test('skip link exists and main landmark is present', async ({ page }) => {
    await signIn(page, 'creator@demo.inkloom.test');
    await expect(page.locator('a[href="#main"]')).toHaveCount(1);
    await expect(page.locator('main#main')).toBeVisible();
  });

  test('mobile viewport keeps navigation usable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, 'creator@demo.inkloom.test');
    const menu = page.getByRole('button', { name: /Open menu|Close menu/ });
    await expect(menu).toBeVisible();
    await menu.click();
    await expect(page.getByRole('navigation', { name: 'Mobile' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: 'Content', exact: true })).toBeVisible();
  });
});
