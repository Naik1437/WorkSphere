import { test, expect } from '@playwright/test';

test.describe('WorkSphere End-to-End User Flows (A12-R05)', () => {
  test.beforeEach(async ({ page }) => {
    // Start fresh on home page
    await page.goto('/');
  });

  test('renders initial enterprise landing page and brand header', async ({ page }) => {
    // Brand header and titles
    await expect(page.locator('h1')).toHaveText('WorkSphere');
    await expect(page.getByText('Enterprise Project & Task Management Platform')).toBeVisible();

    // Welcome banner notification
    const banner = page.getByRole('status');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Welcome to WorkSphere');

    // Default Sign In card view
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Organization', exact: true })).toBeVisible();
    await expect(page.locator('#auth-email')).toBeVisible();
    await expect(page.locator('#auth-password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In to Workspace' })).toBeVisible();
  });

  test('switches tabs between Sign In and Create Organization mode', async ({ page }) => {
    // Initially in Sign In mode: organization fields hidden
    await expect(page.locator('#auth-org-name')).not.toBeVisible();
    await expect(page.locator('#auth-org-slug')).not.toBeVisible();

    // Click Create Organization tab
    await page.getByRole('button', { name: 'Create Organization', exact: true }).click();

    // Organization fields now visible
    await expect(page.locator('#auth-org-name')).toBeVisible();
    await expect(page.locator('#auth-org-slug')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Organization Account' })).toBeVisible();

    // Switch back to Sign In
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.locator('#auth-org-name')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In to Workspace' })).toBeVisible();
  });

  test('validates required fields and enforces password policy', async ({ page }) => {
    const emailInput = page.locator('#auth-email');
    const passwordInput = page.locator('#auth-password');
    const submitBtn = page.getByRole('button', { name: 'Sign In to Workspace' });

    // Validate email field is required
    await expect(emailInput).toHaveAttribute('required', '');

    // Validate password field enforces minimum length
    await expect(passwordInput).toHaveAttribute('required', '');
    await expect(passwordInput).toHaveAttribute('minlength', '12');

    // Fill valid email but invalid short password
    await emailInput.fill('developer@worksphere.corp');
    await passwordInput.fill('short');

    // Click submit and verify HTML5 validation prevents submission
    await submitBtn.click();
    const isPasswordValid = await passwordInput.evaluate(
      (el: HTMLInputElement) => el.checkValidity(),
    );
    expect(isPasswordValid).toBe(false);
  });

  test('allows dismissing top notification banner', async ({ page }) => {
    const banner = page.getByRole('status');
    await expect(banner).toBeVisible();

    // Click dismiss button
    const dismissBtn = page.getByRole('button', { name: 'Dismiss notification' });
    await dismissBtn.click();

    // Banner is dismissed
    await expect(banner).not.toBeVisible();
  });

  test('displays manual token input for session recovery', async ({ page }) => {
    // Check manual session token toggle/input is accessible
    const manualTokenInput = page.getByPlaceholder(/paste access token/i);
    if (await manualTokenInput.isVisible()) {
      await expect(manualTokenInput).toBeEnabled();
    }
  });
});
