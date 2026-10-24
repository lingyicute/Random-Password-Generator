const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('exposes descriptive accessible names for abbreviated character-class controls', async ({ page }) => {
  await expect(page.getByRole('checkbox', { name: '大写字母 A 到 Z' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '小写字母 a 到 z' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '数字 0 到 9' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '特殊字符' })).not.toBeChecked();
});

test('recommends a current minimum length for single-factor passwords', async ({ page }) => {
  await expect(page.locator('.feature-item-text').first()).toContainText('至少使用15个字符');
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

test('guarantees every selected character class is represented when length permits', async ({ page }) => {
  await page.locator('#specials').check();
  const slider = page.locator('input[type="range"]');
  await slider.fill('4');
  await slider.dispatchEvent('change');

  const passwordInput = page.locator('.password');
  const refresh = page.locator('.icon-refresh');

  for (let i = 0; i < 8; i++) {
    const val = await passwordInput.inputValue();
    expect(val).toHaveLength(4);
    expect(val).toMatch(/[A-Z]/);
    expect(val).toMatch(/[a-z]/);
    expect(val).toMatch(/[0-9]/);
    expect(val).toMatch(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/);
    await refresh.click();
  }
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

test('reports clipboard failures accessibly, keeps button geometry stable, and allows manual selection', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  const copyBtn = page.locator('#pwd-copy-btn');
  const password = page.locator('.password');
  const beforeRect = await copyBtn.boundingBox();
  const inputRect = await password.boundingBox();
  expect(Math.abs((beforeRect.y + beforeRect.height / 2) - (inputRect.y + inputRect.height / 2))).toBeLessThanOrEqual(1);

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('clipboard unavailable')) },
    });
  });
  await copyBtn.click();
  await expect(page.locator('.copy-feedback')).toHaveText('复制失败，请手动选择并复制密码。');
  await expect(page.locator('.copy-feedback')).toHaveAttribute('aria-live', 'polite');

  const afterRect = await copyBtn.boundingBox();
  expect(Math.abs(afterRect.width - beforeRect.width)).toBeLessThanOrEqual(1);

  await password.click();
  await expect(password).toBeFocused();
  await expect(password).toHaveCSS('pointer-events', 'auto');
});

test('shows success only after the clipboard write succeeds and resets state on regenerate', async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: text => { window.__copiedText = text; return Promise.resolve(); } },
    });
  });

  const copyBtn = page.locator('#pwd-copy-btn');
  await copyBtn.click();
  const copiedText = await page.evaluate(() => window.__copiedText);
  await expect(copyBtn).toHaveClass(/copied/);
  expect(copiedText).toBe(await page.locator('.password').inputValue());
  await expect(page.locator('.copy-feedback')).toHaveText('已复制');
  await expect(page.locator('.copy-feedback')).toBeEmpty();

  // Keyboard regeneration clears stale copied indicator immediately.
  const refresh = page.locator('.icon-refresh');
  await refresh.focus();
  await page.keyboard.press('Enter');
  await expect(copyBtn).not.toHaveClass(/copied/);
});

test('does not show stale clipboard success after the password changes during the write', async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => new Promise(resolve => { window.__resolveClipboardWrite = resolve; }) },
    });
  });

  await page.locator('#pwd-copy-btn').click();
  await page.locator('.password').fill('new-password-value');
  await page.evaluate(() => window.__resolveClipboardWrite());
  await expect(page.locator('#pwd-copy-btn')).not.toHaveClass(/copied/);
  await expect(page.locator('.copy-feedback')).toBeEmpty();
});

test('fails closed if Web Crypto exists but refuses to provide random bytes', async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(window.crypto, 'getRandomValues', {
      configurable: true,
      value: () => { throw new Error('entropy unavailable'); },
    });
  });

  await page.locator('.icon-refresh').click();
  await expect(page.locator('.password')).toHaveValue('');
  await expect(page.locator('#pwd-copy-btn')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#pwd-copy-btn')).toBeDisabled();
  await expect(page.locator('.copy-feedback')).toHaveText('安全随机数生成失败，请更换浏览器或环境后重试。');
});

test('updates strength live on manual edits and penalizes repeated characters', async ({ page }) => {
  const password = page.locator('.password');
  const badge = page.locator('#password-strength');

  await password.fill('111111111111111');
  await expect(badge).toHaveText('极弱');

  await password.fill('Abc123!@#Xyz789$');
  await expect(badge).toHaveText('很强');

  await password.fill('');
  await page.locator('#pwd-copy-btn').click();
  await expect(page.locator('#pwd-copy-btn')).not.toHaveClass(/copied/);
  await expect(page.locator('.copy-feedback')).toHaveText('没有可复制的密码，请先生成密码。');
});

test('keeps length controls within their supported bounds and syncs button states', async ({ page }) => {
  const slider = page.locator('input[type="range"]');
  const minusBtn = page.locator('.slider-settings .button-circle:first-child');
  const plusBtn = page.locator('.slider-settings .button-circle:last-child');

  await slider.fill('1');
  await slider.dispatchEvent('change');
  await expect(minusBtn).toHaveClass(/disabled/);
  await expect(minusBtn).toBeDisabled();
  await expect(plusBtn).not.toHaveClass(/disabled/);
  await expect(plusBtn).toBeEnabled();
  await expect(page.locator('.length-settings .fw-bold')).toHaveText('1');

  await slider.fill('20');
  await slider.dispatchEvent('change');
  await expect(minusBtn).not.toHaveClass(/disabled/);
  await expect(plusBtn).not.toHaveClass(/disabled/);
  await expect(minusBtn).toBeEnabled();
  await expect(plusBtn).toBeEnabled();

  await expect(slider).toHaveAttribute('max', '64');
  await slider.fill('64');
  await slider.dispatchEvent('change');
  await expect(plusBtn).toHaveClass(/disabled/);
  await expect(plusBtn).toBeDisabled();
  await expect(page.locator('.length-settings .fw-bold')).toHaveText('64');
  await expect(page.locator('.password')).toHaveValue(/^.{64}$/);
});

test('keeps the main controls within representative viewport widths', async ({ page }) => {
  for (const width of [280, 320, 360, 375, 390, 414, 768, 991, 992, 1024, 1279, 1280, 1366, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = await page.evaluate(() => {
      const selectors = [
        '.password-generator .generator-container',
        '.password-generator .generator',
        '.password-generator .image-container',
        '.password-generator .input-container',
        '.password-generator .slider-settings',
        '.password-generator .complexity-checkbox',
      ];
      return {
        documentWidth: document.documentElement.scrollWidth,
        elements: selectors.map(selector => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return { selector, left: rect.left, right: rect.right, width: rect.width };
        }),
      };
    });

    expect(bounds.documentWidth, `${width}px: page should not scroll horizontally`).toBeLessThanOrEqual(width);
    for (const rect of bounds.elements) {
      expect(rect.width, `${width}px: ${rect.selector} should have a usable width`).toBeGreaterThan(0);
      expect(rect.left, `${width}px: ${rect.selector} should not overflow on the left`).toBeGreaterThanOrEqual(-1);
      expect(rect.right, `${width}px: ${rect.selector} should not overflow on the right`).toBeLessThanOrEqual(width + 1);
    }
  }
});

test('keeps copy available for a manually entered password after a generator failure', async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(window.crypto, 'getRandomValues', {
      configurable: true,
      value: () => { throw new Error('entropy unavailable'); },
    });
  });
  await page.locator('.icon-refresh').click();
  await expect(page.locator('#pwd-copy-btn')).toBeDisabled();

  // The generator is unusable, but the field is still a text input: whatever the
  // user types must stay copyable, and the stale failure notice should clear.
  await page.locator('.password').fill('my-manual-secret');
  await expect(page.locator('#pwd-copy-btn')).toBeEnabled();
  await expect(page.locator('#pwd-copy-btn')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('.copy-feedback')).toBeEmpty();

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: text => { window.__copiedText = text; return Promise.resolve(); } },
    });
  });
  await page.locator('#pwd-copy-btn').click();
  expect(await page.evaluate(() => window.__copiedText)).toBe('my-manual-secret');
  await expect(page.locator('.copy-feedback')).toHaveText('已复制');
});

test('does not generate twice when a slider debounce is still pending', async ({ page }) => {
  // Simulate a drag: only 'input' events, which schedule a debounced generation.
  await page.evaluate(() => {
    const slider = document.querySelector('input[type="range"]');
    slider.value = '30';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#specials').check();

  const generated = await page.locator('.password').inputValue();
  await page.waitForTimeout(200);
  await expect(page.locator('.password')).toHaveValue(generated);
});

test('renders responsive 404 page with working home link', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/404.html');

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(320);

  await page.locator('.back-home').click();
  await expect(page.locator('h1')).toContainText('随机密码生成器');
});
