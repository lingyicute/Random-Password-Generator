const MIN_PASSWORD_LENGTH = 1;
const MAX_PASSWORD_LENGTH = 64;
const DEFAULT_PASSWORD_LENGTH = 15;
const DEBOUNCE_DELAY = 50; // 防抖延迟时间，单位为毫秒

const CHARSETS = [
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'abcdefghijklmnopqrstuvwxyz',
    '0123456789',
    '!@#$%^&*()_+-=[]{}|;:,.<>?'
];

// 密码强度等级对应的文本
const strengthLabels = {
    veryWeak: "极弱",
    weak: "较弱",
    mediocre: "一般",
    strong: "较强",
    veryStrong: "很强"
};

// 密码强度对应的颜色
const strengthColors = {
    0: '#FF4D4F', // 极弱 - 亮红色
    1: '#FF7A45', // 较弱 - 橙红色
    2: '#FFA940', // 一般 - 橙色
    3: '#73D13D', // 较强 - 浅绿色
    4: '#52C41A'  // 很强 - 绿色
};

// 当前密码强度 (0-4)
let currentStrength = 4;

// 防抖与动画计时器
let sliderDebounceTimer = null;
let sliderPendingGenerate = false;
let lastSliderValue = DEFAULT_PASSWORD_LENGTH;
let refreshAnimationTimer = null;

// 安全随机字节缓冲池（每次生成完毕后清零）
const randomPool = new Uint8Array(128);
let randomPoolOffset = randomPool.length;

// 界面文本
const texts = {
    appTitle: "随机密码生成器",
    appText: "精锻数字符印，永固赛博边关",
    labelLength: "密码长度",
    labelCharacters: "使用的字符",
    labelCopy: "复制",
    labelCopied: "✓",
    labelStrength1: strengthLabels.veryWeak,
    labelStrength2: strengthLabels.weak,
    labelStrength3: strengthLabels.mediocre,
    labelStrength4: strengthLabels.strong,
    labelStrength5: strengthLabels.veryStrong
};

// DOM元素
let passwordInput;
let strengthLabel;
let slider;
let sliderBorderPart;
let lengthDisplay;
let minusButton;
let plusButton;
let refreshButton;
let copyButton;
let checkboxes = {
    uppercase: null,
    lowercase: null,
    numbers: null,
    specials: null
};

// 密码配置
let config = {
    length: DEFAULT_PASSWORD_LENGTH,
    complexity: [true, true, true, false] // [大写, 小写, 数字, 特殊字符]
};

/**
 * 页面加载后初始化
 */
document.addEventListener('DOMContentLoaded', function() {
    try {
        initElements();
        initEventListeners();
        generatePassword();
        updateUI();
    } catch (e) {
        console.error("初始化过程中发生错误:", e);
    }
});

/**
 * 初始化DOM元素引用
 */
function initElements() {
    passwordInput = document.querySelector('.password');
    strengthLabel = document.querySelector('.form-floating .label');
    slider = document.querySelector('input[type="range"]');
    sliderBorderPart = document.getElementById('slider-border-part');
    lengthDisplay = document.querySelector('.length-settings .fw-bold');
    minusButton = document.querySelector('.slider-settings .button-circle:first-child');
    plusButton = document.querySelector('.slider-settings .button-circle:last-child');
    refreshButton = document.querySelector('.icon-refresh');
    copyButton = document.getElementById('pwd-copy-btn');

    checkboxes.uppercase = document.getElementById('uppercase');
    checkboxes.lowercase = document.getElementById('lowercase');
    checkboxes.numbers = document.getElementById('numbers');
    checkboxes.specials = document.getElementById('specials');

    const titleEl = document.querySelector('h1 span');
    const subtitleEl = document.querySelector('.body-2.mb-32');
    const lengthLabelEl = document.querySelector('.length-settings .first span');
    const charsLabelEl = document.querySelector('.complexity-settings .first span');

    if (titleEl) titleEl.textContent = texts.appTitle;
    if (subtitleEl) subtitleEl.textContent = texts.appText;
    if (lengthLabelEl) lengthLabelEl.textContent = texts.labelLength;
    if (charsLabelEl) charsLabelEl.textContent = texts.labelCharacters;
    if (copyButton) copyButton.textContent = texts.labelCopy;

    if (checkboxes.uppercase) checkboxes.uppercase.checked = config.complexity[0];
    if (checkboxes.lowercase) checkboxes.lowercase.checked = config.complexity[1];
    if (checkboxes.numbers) checkboxes.numbers.checked = config.complexity[2];
    if (checkboxes.specials) checkboxes.specials.checked = config.complexity[3];

    if (slider) {
        slider.value = String(config.length);
        applyFill(slider, sliderBorderPart);
    }

    if (copyButton) {
        setupCopyButton();
    }
}

/**
 * 设置复制按钮的DOM结构
 */
function setupCopyButton() {
    const originalText = copyButton.textContent.trim() || texts.labelCopy;
    copyButton.innerHTML = '';

    const textSpan = document.createElement('span');
    textSpan.className = 'copy-btn-text';
    textSpan.textContent = originalText;
    copyButton.appendChild(textSpan);

    const successSpan = document.createElement('span');
    successSpan.className = 'copy-success-icon';
    successSpan.setAttribute('aria-hidden', 'true');
    successSpan.textContent = texts.labelCopied;
    copyButton.appendChild(successSpan);

    copyButton.textSpan = textSpan;
    copyButton.successDiv = successSpan;

    // Visible, screen-reader-announced feedback for clipboard failures.
    let feedback = document.querySelector('.copy-feedback');
    if (!feedback) {
        feedback = document.createElement('p');
        feedback.className = 'copy-feedback';
        feedback.setAttribute('role', 'status');
        feedback.setAttribute('aria-live', 'polite');
        const inputContainer = copyButton.closest('.input-container');
        if (inputContainer && inputContainer.parentElement) {
            inputContainer.insertAdjacentElement('afterend', feedback);
        } else if (copyButton.parentElement) {
            copyButton.parentElement.appendChild(feedback);
        }
    }
    copyButton.feedback = feedback;
}

/**
 * 重置复制按钮和错误提示状态
 */
function resetCopyState() {
    if (!copyButton) return;
    if (copyButton.resetTimer) {
        clearTimeout(copyButton.resetTimer);
        copyButton.resetTimer = null;
    }
    copyButton.classList.remove('copied');
    copyButton.removeAttribute('aria-label');
    if (copyButton.feedback) {
        copyButton.feedback.textContent = '';
    }
}

/**
 * 根据是否存在可复制的密码，同步复制按钮的可用状态
 *
 * 生成失败时复制按钮会被禁用；但只要用户手动输入了内容，就必须重新可用，
 * 否则“安全随机数不可用”会连带剥夺手动输入密码的复制能力。
 */
function setCopyAvailability(available) {
    if (!copyButton) return;

    copyButton.classList.toggle('disabled', !available);
    copyButton.disabled = !available;
    if (available) {
        copyButton.removeAttribute('aria-disabled');
    } else {
        copyButton.setAttribute('aria-disabled', 'true');
    }
}

/**
 * 规范化密码长度范围
 */
function clampLength(value) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return config.length;
    return Math.min(MAX_PASSWORD_LENGTH, Math.max(MIN_PASSWORD_LENGTH, parsed));
}

/**
 * 初始化事件监听器
 */
function initEventListeners() {
    if (refreshButton) {
        refreshButton.addEventListener('click', generatePassword);
        refreshButton.addEventListener('keydown', function(event) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                generatePassword();
            }
        });
    }

    if (copyButton) {
        copyButton.addEventListener('click', copyPassword);
    }

    if (passwordInput) {
        passwordInput.addEventListener('input', function() {
            resetCopyState();
            // 手动输入可能是生成器不可用时唯一的来源，因此复制按钮要跟随输入框，
            // 而不是跟随“上一次生成是否成功”。
            setCopyAvailability(true);
            updatePasswordStrength(this.value);
        });
    }

    if (minusButton) {
        minusButton.addEventListener('click', decreaseLength);
    }

    if (plusButton) {
        plusButton.addEventListener('click', increaseLength);
    }

    if (slider) {
        slider.addEventListener('input', function() {
            const newValue = clampLength(this.value);
            config.length = newValue;
            if (lengthDisplay) {
                lengthDisplay.textContent = String(config.length);
            }
            updateLengthButtons();
            applyFill(slider, sliderBorderPart);

            if (newValue !== lastSliderValue) {
                lastSliderValue = newValue;
                sliderPendingGenerate = true;
                clearTimeout(sliderDebounceTimer);
                sliderDebounceTimer = setTimeout(() => {
                    sliderPendingGenerate = false;
                    generatePassword();
                }, DEBOUNCE_DELAY);
            }
        });

        slider.addEventListener('change', function() {
            const newValue = clampLength(this.value);
            const valueOutOfSync = newValue !== config.length;
            if (valueOutOfSync) {
                config.length = newValue;
                lastSliderValue = newValue;
                updateUI();
            }
            if (sliderPendingGenerate || valueOutOfSync) {
                clearTimeout(sliderDebounceTimer);
                sliderPendingGenerate = false;
                generatePassword();
            }
        });
    }

    const setupCheckbox = (checkbox, index) => {
        if (checkbox) {
            checkbox.addEventListener('change', function() {
                config.complexity[index] = this.checked;
                if (!preventUncheckAll(this, index)) return;
                generatePassword();
            });
        }
    };

    setupCheckbox(checkboxes.uppercase, 0);
    setupCheckbox(checkboxes.lowercase, 1);
    setupCheckbox(checkboxes.numbers, 2);
    setupCheckbox(checkboxes.specials, 3);
}

/**
 * 更新加减按钮的禁用状态与无障碍属性
 */
function updateLengthButtons() {
    const atMin = config.length <= MIN_PASSWORD_LENGTH;
    const atMax = config.length >= MAX_PASSWORD_LENGTH;

    if (minusButton) {
        minusButton.classList.toggle('disabled', atMin);
        minusButton.disabled = atMin;
    }
    if (plusButton) {
        plusButton.classList.toggle('disabled', atMax);
        plusButton.disabled = atMax;
    }
}

/**
 * 更新UI元素
 */
function updateUI() {
    if (lengthDisplay) lengthDisplay.textContent = String(config.length);

    if (slider) {
        slider.value = String(config.length);
        applyFill(slider, sliderBorderPart);
    }

    updateLengthButtons();
    updateCheckboxesDisabled();
}

/**
 * 应用滑块填充样式
 */
function applyFill(sliderEl, borderPart) {
    if (!sliderEl) return;

    const min = Number(sliderEl.min || MIN_PASSWORD_LENGTH);
    const max = Number(sliderEl.max || MAX_PASSWORD_LENGTH);
    const val = clampLength(sliderEl.value);
    const ratio = max > min ? (val - min) / (max - min) : 0;
    const percent = ratio * 100;
    const color = strengthColors[currentStrength] || '#0070f6';
    const stop = `calc(9px + (100% - 18px) * ${ratio})`;

    sliderEl.style.backgroundImage = `linear-gradient(90deg, ${color} 0%, ${color} ${stop}, #eef2f6 ${stop}, #eef2f6 100%)`;

    if (borderPart) {
        borderPart.style.width = `${percent}%`;
        borderPart.style.backgroundColor = color;
    }
}

/**
 * 增加密码长度
 */
function increaseLength() {
    if (config.length < MAX_PASSWORD_LENGTH) {
        clearTimeout(sliderDebounceTimer);
        sliderPendingGenerate = false;
        config.length++;
        lastSliderValue = config.length;
        updateUI();
        generatePassword();
    }
}

/**
 * 减少密码长度
 */
function decreaseLength() {
    if (config.length > MIN_PASSWORD_LENGTH) {
        clearTimeout(sliderDebounceTimer);
        sliderPendingGenerate = false;
        config.length--;
        lastSliderValue = config.length;
        updateUI();
        generatePassword();
    }
}

/**
 * 防止所有复选框都被取消选中
 */
function preventUncheckAll(changedCheckbox, changedIndex) {
    const checkedCount = config.complexity.filter(Boolean).length;

    // Keep the model and the controls in sync: an empty character set is not
    // a valid user selection (and silently falling back to all chars is confusing).
    if (checkedCount === 0) {
        if (changedCheckbox) {
            changedCheckbox.checked = true;
            config.complexity[changedIndex] = true;
        }
        updateCheckboxesDisabled();
        return false;
    }

    updateCheckboxesDisabled();
    return true;
}

/**
 * 更新复选框的禁用状态
 */
function updateCheckboxesDisabled() {
    if (!checkboxes.uppercase || !checkboxes.lowercase ||
        !checkboxes.numbers || !checkboxes.specials) {
        return;
    }

    const disableSingleChecked = config.complexity.filter(Boolean).length <= 1;
    checkboxes.uppercase.disabled = disableSingleChecked && config.complexity[0];
    checkboxes.lowercase.disabled = disableSingleChecked && config.complexity[1];
    checkboxes.numbers.disabled = disableSingleChecked && config.complexity[2];
    checkboxes.specials.disabled = disableSingleChecked && config.complexity[3];
}

/**
 * 从安全缓冲池读取一个随机字节
 */
function getRandomByte() {
    if (randomPoolOffset >= randomPool.length) {
        window.crypto.getRandomValues(randomPool);
        randomPoolOffset = 0;
    }
    return randomPool[randomPoolOffset++];
}

/**
 * 使用拒绝采样生成 [0, max) 范围内的无偏安全随机整数
 */
function getSecureRandomInt(max) {
    if (max <= 1) return 0;
    const limit = Math.floor(256 / max) * max;
    let byte;
    do {
        byte = getRandomByte();
    } while (byte >= limit);
    return byte % max;
}

/**
 * 根据配置生成密码
 */
function generatePassword() {
    // 任何显式生成都作废仍在排队的滑块防抖；否则勾选字符类或点按加减号后，
    // 约 50ms 后还会再随机一次，把刚生成（或刚复制）的密码冲掉。
    clearTimeout(sliderDebounceTimer);
    sliderDebounceTimer = null;
    sliderPendingGenerate = false;

    const activeCharsets = CHARSETS.filter((_, index) => config.complexity[index]);
    if (activeCharsets.length === 0) return;

    resetCopyState();

    // Web Crypto is required for security-sensitive randomness. Rejection
    // sampling avoids modulo bias when the charset length does not divide 256.
    if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') {
        if (passwordInput) passwordInput.value = '';
        if (strengthLabel) {
            updateStrengthLabel(0);
            strengthLabel.textContent = '不可用';
        }
        setCopyAvailability(false);
        if (copyButton && copyButton.feedback) {
            copyButton.feedback.textContent = '当前环境不支持安全随机数生成。';
        }
        return;
    }

    const combinedCharset = activeCharsets.join('');
    const passwordChars = [];

    try {
        // Guarantee at least one character from each selected class when length permits.
        if (config.length >= activeCharsets.length) {
            for (const set of activeCharsets) {
                passwordChars.push(set[getSecureRandomInt(set.length)]);
            }
        }

        while (passwordChars.length < config.length) {
            passwordChars.push(combinedCharset[getSecureRandomInt(combinedCharset.length)]);
        }

        // Fisher-Yates shuffle with unbiased CSPRNG so guaranteed chars land uniformly.
        for (let i = passwordChars.length - 1; i > 0; i--) {
            const j = getSecureRandomInt(i + 1);
            const temp = passwordChars[i];
            passwordChars[i] = passwordChars[j];
            passwordChars[j] = temp;
        }
    } catch (error) {
        // A present-but-failing Web Crypto implementation is no safer than a
        // missing one. Never fall back to Math.random() or expose partial output.
        console.error('安全随机数生成失败:', error);
        if (passwordInput) passwordInput.value = '';
        if (strengthLabel) {
            updateStrengthLabel(0);
            strengthLabel.textContent = '不可用';
        }
        setCopyAvailability(false);
        if (copyButton && copyButton.feedback) {
            copyButton.feedback.textContent = '安全随机数生成失败，请更换浏览器或环境后重试。';
        }
        return;
    } finally {
        randomPool.fill(0);
        randomPoolOffset = randomPool.length;
    }

    const password = passwordChars.join('');

    if (passwordInput) {
        passwordInput.value = password;
        updatePasswordStrength(password);
    }

    setCopyAvailability(true);
    addRotateAnimation();
}

/**
 * 根据密码计算强度并更新显示
 */
function updatePasswordStrength(password) {
    if (!strengthLabel) return;

    const score = calculatePasswordScore(password);
    let strength;
    if (score < 20) {
        strength = 0; // 极弱
    } else if (score < 40) {
        strength = 1; // 较弱
    } else if (score < 60) {
        strength = 2; // 一般
    } else if (score < 80) {
        strength = 3; // 较强
    } else {
        strength = 4; // 很强
    }

    updateStrengthLabel(strength);
}

/**
 * 计算密码强度得分 (0-100)
 */
function calculatePasswordScore(password) {
    if (!password) return 0;

    const length = password.length;
    const uniqueCount = new Set(password).size;

    if (length > 1 && uniqueCount === 1) {
        return Math.min(10, length * 2);
    }

    let lengthScore = 0;
    if (length <= 4) {
        lengthScore = length * 3;
    } else if (length <= 8) {
        lengthScore = 12 + (length - 4) * 4;
    } else if (length <= 12) {
        lengthScore = 28 + (length - 8) * 5;
    } else {
        lengthScore = Math.min(60, 48 + (length - 12) * 3);
    }

    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    const charTypeCount = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;

    let score = lengthScore + charTypeCount * 7.5;

    if (length >= 10 && charTypeCount >= 3) {
        score += 5;
    }
    if (length >= 14 && charTypeCount >= 4) {
        score += 5;
    }

    // Penalize heavy repetition relative to expected distinct count for the active pool size.
    const poolSize = (hasUpper ? 26 : 0) + (hasLower ? 26 : 0) + (hasDigit ? 10 : 0) + (hasSpecial ? 26 : 0) || 26;
    const expectedUnique = poolSize * (1 - Math.pow((poolSize - 1) / poolSize, length));
    if (length >= 6 && expectedUnique > 0) {
        const diversityRatio = uniqueCount / expectedUnique;
        if (uniqueCount <= 2) {
            score = Math.min(score, 25);
        } else if (diversityRatio < 0.55) {
            score *= diversityRatio / 0.55;
        }
    }

    // Cap single-class passwords to reflect their smaller keyspace.
    if (charTypeCount === 1) {
        if (hasDigit) {
            score = Math.min(score, length >= 20 ? 65 : 55);
        } else {
            score = Math.min(score, length >= 20 ? 80 : 75);
        }
    }

    return Math.max(0, Math.min(100, score));
}

/**
 * 更新密码强度标签
 */
function updateStrengthLabel(strength) {
    currentStrength = strength;

    strengthLabel.classList.remove(
        'bg-orange-bright', 'bg-orange-light', 'bg-orange-pale',
        'bg-green-pale', 'bg-green-bright'
    );

    if (strength === 0) {
        strengthLabel.classList.add('bg-orange-bright');
        strengthLabel.textContent = texts.labelStrength1;
    } else if (strength === 1) {
        strengthLabel.classList.add('bg-orange-light');
        strengthLabel.textContent = texts.labelStrength2;
    } else if (strength === 2) {
        strengthLabel.classList.add('bg-orange-pale');
        strengthLabel.textContent = texts.labelStrength3;
    } else if (strength === 3) {
        strengthLabel.classList.add('bg-green-pale');
        strengthLabel.textContent = texts.labelStrength4;
    } else {
        strengthLabel.classList.add('bg-green-bright');
        strengthLabel.textContent = texts.labelStrength5;
    }

    if (slider) {
        applyFill(slider, sliderBorderPart);
    }
}

/**
 * 为刷新按钮添加旋转动画
 */
function addRotateAnimation() {
    if (!refreshButton) return;

    if (refreshAnimationTimer) {
        clearTimeout(refreshAnimationTimer);
    }
    refreshButton.classList.remove('rotate');
    void refreshButton.offsetWidth;
    refreshButton.classList.add('rotate');
    refreshAnimationTimer = setTimeout(() => {
        refreshButton.classList.remove('rotate');
        refreshAnimationTimer = null;
    }, 550);
}

/**
 * 把文本写入剪贴板
 *
 * 优先使用异步 Clipboard API；它在非安全上下文（例如通过 http:// 打开本地文件）
 * 下不存在，也可能因为权限策略、iframe 沙箱或用户拒绝而失败——这两种情况都要
 * 回退到上一代的 execCommand('copy')，否则“剪贴板可用”就名存实亡。
 */
async function writeClipboard(text) {
    const clipboard = navigator.clipboard;

    if (window.isSecureContext && clipboard && typeof clipboard.writeText === 'function') {
        try {
            await clipboard.writeText(text);
            return;
        } catch (err) {
            console.warn('Clipboard API 写入失败，回退到 execCommand:', err);
        }
    }

    passwordInput.focus();
    passwordInput.select();
    passwordInput.setSelectionRange(0, text.length);
    if (!document.execCommand('copy')) {
        throw new Error('浏览器拒绝复制');
    }
}

/**
 * 复制密码到剪贴板
 */
async function copyPassword() {
    if (!passwordInput || !copyButton) return;

    const value = passwordInput.value;
    if (copyButton.disabled || copyButton.getAttribute('aria-disabled') === 'true') return;
    if (!value) {
        copyButton.classList.remove('copied');
        if (copyButton.feedback) {
            copyButton.feedback.textContent = '没有可复制的密码，请先生成密码。';
        }
        return;
    }

    try {
        await writeClipboard(value);

        // Clipboard writes are asynchronous. Do not show success for a password
        // that the user has since edited or replaced.
        if (passwordInput.value !== value) return;
        copyButton.classList.add('copied');
        copyButton.setAttribute('aria-label', '已复制');
        // 与失败提示共用同一个 live region：给聚焦按钮临时改 aria-label
        // 并不能被读屏可靠播报。
        if (copyButton.feedback) copyButton.feedback.textContent = '已复制';
        if (copyButton.resetTimer) clearTimeout(copyButton.resetTimer);
        copyButton.resetTimer = setTimeout(() => {
            copyButton.classList.remove('copied');
            copyButton.removeAttribute('aria-label');
            if (copyButton.feedback) copyButton.feedback.textContent = '';
            copyButton.resetTimer = null;
        }, 1000);
    } catch (err) {
        if (passwordInput.value !== value) return;
        console.error('复制失败:', err);
        copyButton.classList.remove('copied');
        copyButton.removeAttribute('aria-label');
        if (copyButton.feedback) {
            copyButton.feedback.textContent = '复制失败，请手动选择并复制密码。';
        }
    }
}
