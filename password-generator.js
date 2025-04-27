const MIN_PASSWORD_LENGTH = 1;
const MAX_PASSWORD_LENGTH = 50;
const DEFAULT_PASSWORD_LENGTH = 15;
const DEBOUNCE_DELAY = 50; // 防抖延迟时间，单位为毫秒

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
let currentStrength = 2;

// 防抖计时器
let sliderDebounceTimer = null;
let lastSliderValue = DEFAULT_PASSWORD_LENGTH;

// 复制按钮计时器
let copyButtonTimers = {
    textReset: null,
    widthReset: null
};

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
    complexity: [true, true, true, false], // [大写, 小写, 数字, 特殊字符]
    disableChecked: false
};

/**
 * 页面加载后初始化
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM已加载，开始初始化...");
    try {
        // 添加对勾按钮的样式
        addCopyButtonStyle();
        
        initElements();
        console.log("元素初始化完成");
        initEventListeners();
        console.log("事件监听器初始化完成");
        generatePassword();
        console.log("密码已生成");
        updateUI();
        console.log("UI已更新");
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
    
    // 修改滑块相关元素的获取方式
    slider = document.querySelector('input[type="range"]');
    sliderBorderPart = document.getElementById('slider-border-part');
    
    lengthDisplay = document.querySelector('.length-settings .fw-bold');
    minusButton = document.querySelector('.slider-settings .button-circle:first-child');
    plusButton = document.querySelector('.slider-settings .button-circle:last-child');
    refreshButton = document.querySelector('.icon-refresh');
    copyButton = document.getElementById('pwd-copy-btn');
    
    // 设置复选框
    checkboxes.uppercase = document.getElementById('uppercase');
    checkboxes.lowercase = document.getElementById('lowercase');
    checkboxes.numbers = document.getElementById('numbers');
    checkboxes.specials = document.getElementById('specials');
    
    console.log("复选框状态:", 
        checkboxes.uppercase ? "大写存在" : "大写不存在", 
        checkboxes.lowercase ? "小写存在" : "小写不存在",
        checkboxes.numbers ? "数字存在" : "数字不存在",
        checkboxes.specials ? "特殊字符存在" : "特殊字符不存在"
    );
    
    // 设置初始文本
    document.querySelector('h1 span').textContent = texts.appTitle;
    document.querySelector('.body-2.mb-32').textContent = texts.appText;
    document.querySelector('.length-settings .first span').textContent = texts.labelLength;
    document.querySelector('.complexity-settings .first span').textContent = texts.labelCharacters;
    copyButton.textContent = texts.labelCopy;
    
    // 设置初始复选框状态
    if(checkboxes.uppercase) checkboxes.uppercase.checked = config.complexity[0];
    if(checkboxes.lowercase) checkboxes.lowercase.checked = config.complexity[1];
    if(checkboxes.numbers) checkboxes.numbers.checked = config.complexity[2];
    if(checkboxes.specials) checkboxes.specials.checked = config.complexity[3];
    
    // 设置滑块初始值并应用样式
    if(slider) {
        console.log("滑块元素已找到");
        slider.value = config.length;
        applyFill(slider, sliderBorderPart);
    } else {
        console.error("未找到滑块元素");
    }
    
    // 设置复制按钮结构
    if (copyButton) {
        setupCopyButton();
    }
}

/**
 * 设置复制按钮的DOM结构
 */
function setupCopyButton() {
    // 保存原始内容
    const originalText = copyButton.textContent.trim();
    
    // 清空按钮内容
    copyButton.innerHTML = '';
    
    // 创建文本容器
    const textSpan = document.createElement('span');
    textSpan.className = 'copy-btn-text';
    textSpan.textContent = originalText;
    copyButton.appendChild(textSpan);
    
    // 创建成功图标容器
    const successDiv = document.createElement('div');
    successDiv.className = 'copy-success-icon';
    successDiv.textContent = texts.labelCopied;
    copyButton.appendChild(successDiv);
    
    // 存储引用
    copyButton.textSpan = textSpan;
    copyButton.successDiv = successDiv;
}

/**
 * 初始化事件监听器
 */
function initEventListeners() {
    // 刷新按钮
    if(refreshButton) {
        refreshButton.addEventListener('click', generatePassword);
    }
    
    // 复制按钮
    if(copyButton) {
        copyButton.addEventListener('click', copyPassword);
    }
    
    // 长度减少按钮
    if(minusButton) {
        minusButton.addEventListener('click', decreaseLength);
    }
    
    // 长度增加按钮
    if(plusButton) {
        plusButton.addEventListener('click', increaseLength);
    }
    
    // 密码长度滑块
    if(slider) {
        // 输入时实时更新UI和生成密码（带防抖）
        slider.addEventListener('input', function() {
            const newValue = parseInt(this.value);
            
            // 更新密码长度显示
            config.length = newValue;
            if(lengthDisplay) {
                lengthDisplay.textContent = config.length;
            }
            
            // 更新滑块填充样式
            applyFill(slider, sliderBorderPart);
            
            // 如果值与上次不同，重置防抖计时器
            if(newValue !== lastSliderValue) {
                lastSliderValue = newValue;
                
                // 清除之前的计时器
                clearTimeout(sliderDebounceTimer);
                
                // 设置新的计时器，延迟生成密码
                sliderDebounceTimer = setTimeout(() => {
                    generatePassword();
                }, DEBOUNCE_DELAY);
            }
        });
        
        // 滑块释放时，确保生成密码（以防万一防抖被取消）
        slider.addEventListener('change', function() {
            // 清除可能存在的防抖计时器
            clearTimeout(sliderDebounceTimer);
            // 立即生成密码
            generatePassword();
        });
    }
    
    // 复选框
    const setupCheckbox = (checkbox, index) => {
        if(checkbox) {
            checkbox.addEventListener('change', function() {
                config.complexity[index] = this.checked;
                preventUncheckAll();
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
 * 更新UI元素
 */
function updateUI() {
    // 更新长度显示
    if(lengthDisplay) lengthDisplay.textContent = config.length;
    
    // 设置滑块值
    if(slider) {
        slider.value = config.length;
        // 更新滑块样式
        applyFill(slider, sliderBorderPart);
    }
    
    // 禁用/启用加减按钮
    if(minusButton) minusButton.classList.toggle('disabled', config.length <= MIN_PASSWORD_LENGTH);
    if(plusButton) plusButton.classList.toggle('disabled', config.length >= MAX_PASSWORD_LENGTH);
    
    // 设置复选框禁用状态
    updateCheckboxesDisabled();
}

/**
 * 应用滑块填充样式
 */
function applyFill(slider, borderPart) {
    if(!slider) return;
    
    const min = parseInt(slider.min) || 1;
    const max = parseInt(slider.max) || 50;
    const val = parseInt(slider.value);
    const percent = 100 * (val - min) / (max - min);
    
    // 获取当前强度对应的颜色
    const color = strengthColors[currentStrength] || '#0070f6';
    
    // 设置滑块背景渐变，颜色随强度变化
    slider.style.backgroundImage = `linear-gradient(90deg, ${color} ${percent}%, transparent ${percent}%)`;
    
    // 更新边界部分的宽度和颜色
    if(borderPart) {
        requestAnimationFrame(() => {
            borderPart.style.width = `${percent}%`;
            borderPart.style.backgroundColor = color;
        });
    }
}

/**
 * 增加密码长度
 */
function increaseLength() {
    if (config.length < MAX_PASSWORD_LENGTH) {
        config.length++;
        // 同步更新滑块值
        if(slider) {
            slider.value = config.length;
            // 立即应用填充效果
            applyFill(slider, sliderBorderPart);
        }
        updateUI();
        generatePassword();
    }
}

/**
 * 减少密码长度
 */
function decreaseLength() {
    if (config.length > MIN_PASSWORD_LENGTH) {
        config.length--;
        // 同步更新滑块值
        if(slider) {
            slider.value = config.length;
            // 立即应用填充效果
            applyFill(slider, sliderBorderPart);
        }
        updateUI();
        generatePassword();
    }
}

/**
 * 防止所有复选框都被取消选中
 */
function preventUncheckAll() {
    const checkedCount = config.complexity.filter(value => value).length;
    
    console.log("选中的复选框数量:", checkedCount);
    
    if (checkedCount === 1) {
        config.disableChecked = true;
    } else {
        config.disableChecked = false;
    }
    
    updateCheckboxesDisabled();
}

/**
 * 更新复选框的禁用状态
 */
function updateCheckboxesDisabled() {
    console.log("更新复选框状态:", config.complexity, config.disableChecked);
    
    // 确保复选框元素存在
    if (!checkboxes.uppercase || !checkboxes.lowercase || 
        !checkboxes.numbers || !checkboxes.specials) {
        console.warn("部分复选框元素未初始化");
        return;
    }
    
    checkboxes.uppercase.disabled = config.disableChecked && config.complexity[0];
    checkboxes.lowercase.disabled = config.disableChecked && config.complexity[1];
    checkboxes.numbers.disabled = config.disableChecked && config.complexity[2];
    checkboxes.specials.disabled = config.disableChecked && config.complexity[3];
}

/**
 * 根据配置生成密码
 */
function generatePassword() {
    // 确定使用的字符集
    let charset = '';
    if (config.complexity[0]) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (config.complexity[1]) charset += 'abcdefghijklmnopqrstuvwxyz';
    if (config.complexity[2]) charset += '0123456789';
    if (config.complexity[3]) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    // 如果没有选择任何字符集，默认使用所有字符
    if (charset === '') {
        charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    }
    
    // 生成密码
    let password = '';
    for (let i = 0; i < config.length; i++) {
        const randomIndex = Math.floor(Math.random() * charset.length);
        password += charset[randomIndex];
    }
    
    // 更新输入框
    if(passwordInput) {
        passwordInput.value = password;
        
        // 计算并显示密码强度
        updatePasswordStrength(password);
    }
    
    // 添加动画效果
    addRotateAnimation();
}

/**
 * 根据密码计算强度并更新显示
 */
function updatePasswordStrength(password) {
    if(!strengthLabel) return;
    
    // 计算密码强度得分 (0-100)
    let score = calculatePasswordScore(password);
    
    // 将得分映射到强度等级 (0-4)
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
    
    // 更新强度标签
    updateStrengthLabel(strength);
}

/**
 * 计算密码强度得分 (0-100)
 */
function calculatePasswordScore(password) {
    if (!password) return 0;
    
    let score = 0;
    
    // 1. 长度评分 (最多60分) - 增加长度权重
    // 长度得分曲线更陡峭，短密码分数低，长密码分数高
    if (password.length <= 4) {
        score += password.length * 3; // 每字符3分
    } else if (password.length <= 8) {
        score += 12 + (password.length - 4) * 4; // 4字符后每字符4分
    } else if (password.length <= 12) {
        score += 28 + (password.length - 8) * 5; // 8字符后每字符5分
    } else {
        score += Math.min(60, 48 + (password.length - 12) * 3); // 12字符后每字符3分，最多60分
    }
    
    // 2. 字符类型评分 (最多30分) - 减少字符种类权重
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    
    // 每种字符类型分值
    if (hasUpper) score += 7.5;
    if (hasLower) score += 7.5;
    if (hasDigit) score += 7.5;
    if (hasSpecial) score += 7.5;
    
    // 3. 完整性评分 (最多10分)
    // 如果密码较长且包含多种字符类型，额外加分
    const charTypeCount = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;
    
    if (password.length >= 10 && charTypeCount >= 3) {
        score += 5;
    }
    
    if (password.length >= 14 && charTypeCount >= 4) {
        score += 5;
    }
    
    return score;
}

/**
 * 更新密码强度标签
 */
function updateStrengthLabel(strength) {
    // 更新当前强度值
    currentStrength = strength;
    
    // 移除所有可能的类名
    strengthLabel.classList.remove(
        'bg-orange-bright', 'bg-orange-light', 'bg-orange-pale', 
        'bg-green-pale', 'bg-green-bright'
    );
    
    // 添加对应强度的类名和文本
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
    
    // 更新滑块颜色
    if (slider && sliderBorderPart) {
        applyFill(slider, sliderBorderPart);
    }
}

/**
 * 为刷新按钮添加旋转动画
 */
function addRotateAnimation() {
    if(!refreshButton) return;
    
    refreshButton.classList.add('rotate');
    setTimeout(() => {
        refreshButton.classList.remove('rotate');
    }, 550);
}

/**
 * 添加复制按钮样式
 */
function addCopyButtonStyle() {
    // 删除可能存在的旧样式
    const oldStyle = document.getElementById('copy-button-style');
    if (oldStyle) {
        oldStyle.parentNode.removeChild(oldStyle);
    }
    
    // 创建新样式
    const style = document.createElement('style');
    style.id = 'copy-button-style';
    style.textContent = `
        .copy-btn {
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            position: relative !important;
            overflow: hidden !important;
        }
        
        .copy-btn-text {
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            width: 100% !important;
            transition: none !important;
        }
        
        .copy-success-icon {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            background-color: #52C41A !important;
            color: white !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            transform: translateY(100%) !important;
            transition: transform 0.2s ease !important;
        }
        
        .copy-btn.copied .copy-success-icon {
            transform: translateY(0) !important;
        }
    `;
    document.head.appendChild(style);
}

/**
 * 复制密码到剪贴板
 */
function copyPassword() {
    if (!passwordInput || !copyButton) return;
    
    // 选择并复制密码
    passwordInput.select();
    passwordInput.setSelectionRange(0, 99999); // 为移动设备
    
    try {
        document.execCommand('copy');
        
        // 显示复制成功状态
        copyButton.classList.add('copied');
        
        // 设置重置计时器
        if (copyButton.resetTimer) {
            clearTimeout(copyButton.resetTimer);
        }
        
        copyButton.resetTimer = setTimeout(() => {
            copyButton.classList.remove('copied');
        }, 1000);
        
    } catch (err) {
        console.error('复制失败:', err);
    }
} 