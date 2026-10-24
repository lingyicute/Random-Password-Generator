const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('creates a password of the selected length from the selected classes', async ({ page }) => {
  const password = page.locator('.password');
  await expect(password).toHaveValue(/^[A-Za-z0-9]{15}$/);

  await page.locator('#specials').check();
  await page.locator('#numbers').uncheck();
  await page.locator('input[type="range"]').fill('32');
  await page.locator('input[type="range"]').dispatchEvent('change');

  await expect(password).toHaveValue(/^[A-Za-z!@#$%^&*()_+\-=\[\]{}|;:,.<>?]{32}$/);
  await expect(page.locator('.length-settings .fw-bold')).toHaveText('32');
});

test('does not allow an empty character set', async ({ page }) => {
  // Add a replacement character class before removing defaults; the final
  // active checkbox should remain checked and disabled.
  const specials = page.locator('#specials');
  await specials.check();
  await page.locator('#uppercase').uncheck();
  await page.locator('#lowercase').uncheck();
  await page.locator('#numbers').uncheck();

  await expect(specials).toBeChecked();
  await expect(specials).toBeDisabled();
  await expect(page.locator('.password')).toHaveValue(/^[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]{15}$/);
});

test('reports clipboard failures accessibly and allows manual selection', async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('clipboard unavailable')) },
    });
  });
  await page.locator('#pwd-copy-btn').click();
  await expect(page.locator('.copy-feedback')).toHaveText('复制失败，请手动选择并复制密码。');
  await expect(page.locator('.copy-feedback')).toHaveAttribute('aria-live', 'polite');

  const password = page.locator('.password');
  await password.click();
  await expect(password).toBeFocused();
  await expect(password).toHaveCSS('pointer-events', 'auto');
});

test('shows success only after the clipboard write succeeds', async ({ page }) => {
  let copiedText = '';
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: text => { window.__copiedText = text; return Promise.resolve(); } },
    });
  });

  await page.locator('#pwd-copy-btn').click();
  copiedText = await page.evaluate(() => window.__copiedText);
  await expect(page.locator('#pwd-copy-btn')).toHaveClass(/copied/);
  expect(copiedText).toBe(await page.locator('.password').inputValue());
  await expect(page.locator('.copy-feedback')).toBeEmpty();
});

test('keeps length controls within their supported bounds', async ({ page }) => {
  const slider = page.locator('input[type="range"]');
  await slider.fill('1');
  await slider.dispatchEvent('change');
  await page.locator('.slider-settings .button-circle:first-child').click();
  await expect(page.locator('.length-settings .fw-bold')).toHaveText('1');

  await slider.fill('50');
  await slider.dispatchEvent('change');
  await page.locator('.slider-settings .button-circle:last-child').click();
  await expect(page.locator('.length-settings .fw-bold')).toHaveText('50');
  await expect(page.locator('.password')).toHaveValue(/^.{50}$/);
});

test('keeps the main controls within representative viewport widths', async ({ page }) => {
  for (const width of [320, 375, 768, 991, 992, 1024, 1279, 1280, 1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = await page.evaluate(() => {
      const selectors = [
        '.password-generator .generator-container',
        '.password-generator .generator',
        '.password-generator .image-container',
        '.password-generator .input-container',
        '.password-generator .slider-settings',
      ];
      return selectors.map(selector => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return { selector, left: rect.left, right: rect.right, width: rect.width };
      });
    });

    for (const rect of bounds) {
      expect(rect.width, `${width}px: ${rect.selector} should have a usable width`).toBeGreaterThan(0);
      expect(rect.left, `${width}px: ${rect.selector} should not overflow on the left`).toBeGreaterThanOrEqual(-1);
      expect(rect.right, `${width}px: ${rect.selector} should not overflow on the right`).toBeLessThanOrEqual(width + 1);
    }
  }
});
