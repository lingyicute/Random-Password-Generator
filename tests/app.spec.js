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

  // The locked checkbox is explained, not just disabled.
  const group = page.locator('.complexity-checkbox');
  await expect(group).toHaveAttribute('aria-describedby', 'charset-hint');
  await expect(page.locator('#charset-hint')).toHaveText('至少需要保留一种字符');
  await expect(page.locator('#charset-hint')).toHaveAttribute('role', 'status');

  // Even if the disabled guard is bypassed, the model refuses the empty selection.
  await page.evaluate(() => {
    const specials = document.querySelector('#specials');
    specials.disabled = false;
    specials.click();
  });
  await expect(specials).toBeChecked();
  await expect(page.locator('#charset-hint')).toHaveText('至少需要保留一种字符');

  // Restoring a second class clears the explanation again.
  await page.locator('#numbers').check();
  await expect(page.locator('#charset-hint')).toHaveText('');
  await expect(specials).toBeEnabled();
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
    // The failure path now falls back to execCommand; make it refuse as well.
    document.execCommand = () => false;
  });
  await copyBtn.click();
  await expect(page.locator('.copy-feedback')).toHaveText('复制失败，请手动选择并复制密码。');
  await expect(page.locator('.copy-feedback')).toHaveAttribute('aria-live', 'polite');
  // Failure keeps the error color; success must not inherit it.
  await expect(page.locator('.copy-feedback')).toHaveCSS('color', 'rgb(180, 35, 24)');

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
  await expect(page.locator('.copy-feedback')).toHaveCSS('color', 'rgb(35, 120, 4)');
  await expect(page.locator('.copy-feedback')).toBeEmpty();

  // Keyboard regeneration clears stale copied indicator immediately.
  const refresh = page.locator('.icon-refresh');
  await refresh.focus();
  await page.keyboard.press('Enter');
  await expect(copyBtn).not.toHaveClass(/copied/);
});

test('falls back to execCommand when the Clipboard API rejects', async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('permissions policy')) },
    });
    document.execCommand = command => {
      window.__execCommandCalls = (window.__execCommandCalls || []).concat(command);
      window.__selection = document.querySelector('.password').value.substring(
        document.querySelector('.password').selectionStart,
        document.querySelector('.password').selectionEnd
      );
      return true;
    };
  });

  await page.locator('#pwd-copy-btn').click();
  await expect(page.locator('.copy-feedback')).toHaveText('已复制');
  expect(await page.evaluate(() => window.__execCommandCalls)).toEqual(['copy']);
  expect(await page.evaluate(() => window.__selection)).toBe(await page.locator('.password').inputValue());
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

test('scores strength from estimated entropy rather than raw length', async ({ page }) => {
  const scores = await page.evaluate(() => ({
    repeatedSequence: calculatePasswordScore('1234567890'.repeat(6) + '1234'),
    longDigits: calculatePasswordScore('49276381509473826105948372615093847562'),
    longLowercase: calculatePasswordScore('xqmvzbnlwrptksjdfgh'),
    shortMixed: calculatePasswordScore('aB3x'),
    singleCharacter: calculatePasswordScore('111111111111111'),
  }));

  // A repeated "1234567890" block is long but trivially guessable.
  expect(scores.repeatedSequence).toBeLessThan(40);
  // Length in a large keyspace is no longer capped by a hand-picked limit.
  expect(scores.longDigits).toBeGreaterThanOrEqual(80);
  expect(scores.longLowercase).toBeGreaterThanOrEqual(80);
  // Short passwords still cannot score well by mixing character classes.
  expect(scores.shortMixed).toBeLessThan(40);
  expect(scores.singleCharacter).toBeLessThan(20);
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

test('cancels a pending slider debounce when an explicit generate happens', async ({ page }) => {
  // A drag fires 'input' (debounced) and is followed by a direct interaction
  // (a checkbox here) that generates immediately. The previous version of this
  // test waited for actionability before reading the value back, which takes
  // longer than the 50ms debounce - it passed with and without the fix, so it
  // could never catch a regression. Count the actual writes instead.
  const writes = await page.evaluate(async () => {
    const input = document.querySelector('.password');
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value');
    let count = 0;
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() { return descriptor.get.call(this); },
      set(value) { count++; descriptor.set.call(this, value); },
    });

    const slider = document.querySelector('input[type="range"]');
    slider.value = '30';
    slider.dispatchEvent(new Event('input', { bubbles: true }));

    const specials = document.querySelector('#specials');
    specials.checked = true;
    specials.dispatchEvent(new Event('change', { bubbles: true }));

    await new Promise(resolve => setTimeout(resolve, 200));
    return count;
  });

  expect(writes).toBe(1);
});

test('renders responsive 404 page with working home link', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/404.html');

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(320);

  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText(/页面未找到/);

  await page.locator('.back-home').click();
  await expect(page.locator('h1')).toContainText('随机密码生成器');
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('tells the visitor that JavaScript is required', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.no-js-notice')).toHaveText('本工具需要启用 JavaScript 才能生成密码。');
    // The overlay can never be dismissed without scripts, so it must stay hidden.
    await expect(page.locator('#loadingOverlay')).toBeHidden();
  });
});
