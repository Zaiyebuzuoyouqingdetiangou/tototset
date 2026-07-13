import { getSettings } from './settings.js';

const TOTO_BLOCK_RE = /<toto\b[\s\S]*?<\/toto>/gi;
const TOTO_BLOCK_SINGLE_RE = /<toto\b[\s\S]*?<\/toto>/i;
const FENCED_BLOCK_RE = /```(?:html|HTML|xml|XML)?\s*\n?([\s\S]*?)\n?```/gi;
const WHOLE_FENCED_BLOCK_RE = /^\s*```(?:html|HTML|xml|XML)?\s*\n?([\s\S]*?)\n?```\s*$/i;
const TRAILING_HTML_START_RE = /(?:^|\n)(<(?:div|section|article|details)\b[\s\S]*)$/i;
const PRE_CODE_RE = /<pre\b[^>]*>\s*<code\b[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
const CODE_FENCE_OPEN_RE = /```(?:html|xml|javascript|js|css)?\s*/gi;
const TILDE_FENCE_OPEN_RE = /~~~(?:html|xml|javascript|js|css)?\s*/gi;
const CODE_LIKE_TAG_RE = /<\/?(?:pre|code|kbd|samp)\b[^>]*>/gi;
const CLASS_ATTR_RE = /\sclass=(["'])([^"']*)\1/gi;
const HIGHLIGHT_CLASS_TOKEN_RE = /^(?:language-(?:html|xml|js|javascript|css)|hljs|prism|prettyprint)$/i;
const MULTI_BLANK_LINE_RE = /\n\s*\n/g;

function isCodeBlockRescueModeEnabled() {
    try {
        return !!getSettings().codeBlockRescueMode;
    } catch {
        return false;
    }
}

function isInteractionRescueModeEnabled() {
    try {
        return !!getSettings().interactionRescueMode;
    } catch {
        return false;
    }
}


const MIRROR_TOTO_SELECTOR = 'toto[data-rabbit-mirror="true"], toto[data-rabbit-hole="true"]';
let interactionScopeCounter = 0;
const interactionScopeStates = new WeakMap();
const SCOPED_INTERACTION_ID_RE = /^(rm-[a-z0-9]+-[a-z0-9]+-[a-z0-9]{5}-)(.+)$/i;

const INTERACTION_RESCUE_MEMORY_KEY = 'rabbitMirrorInteractionRescueMemoryV1';
const rememberedInteractionRescueKeys = new Set();

function hashInteractionSignature(text) {
    let hash = 2166136261;
    for (const char of String(text || '')) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function getInteractionRescueKey(toto) {
    if (!toto?.querySelectorAll) return '';
    const summary = (toto.querySelector('summary')?.textContent || '').replace(/\s+/g, ' ').trim();
    const bodyText = (toto.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
    const inputs = toto.querySelectorAll('input[type="checkbox"], input[type="radio"]').length;
    const labels = toto.querySelectorAll('label').length;
    return hashInteractionSignature(`${summary}|${inputs}|${labels}|${bodyText}`);
}

function loadRememberedInteractionRescues() {
    if (rememberedInteractionRescueKeys.size) return;
    try {
        const values = JSON.parse(sessionStorage.getItem(INTERACTION_RESCUE_MEMORY_KEY) || '[]');
        if (Array.isArray(values)) values.forEach(value => value && rememberedInteractionRescueKeys.add(String(value)));
    } catch {
        // sessionStorage unavailable; in-memory memory still works.
    }
}

function rememberInteractionRescue(toto) {
    const key = getInteractionRescueKey(toto);
    if (!key) return;
    loadRememberedInteractionRescues();
    rememberedInteractionRescueKeys.add(key);
    try {
        sessionStorage.setItem(INTERACTION_RESCUE_MEMORY_KEY, JSON.stringify([...rememberedInteractionRescueKeys].slice(-300)));
    } catch {
        // Ignore storage failures.
    }
}

function wasInteractionRescued(toto) {
    const key = getInteractionRescueKey(toto);
    if (!key) return false;
    loadRememberedInteractionRescues();
    return rememberedInteractionRescueKeys.has(key);
}

function createInteractionScopePrefix() {
    interactionScopeCounter += 1;
    const timePart = Date.now().toString(36);
    const countPart = interactionScopeCounter.toString(36);
    const randomPart = Math.random().toString(36).slice(2, 7);
    return `rm-${timePart}-${countPart}-${randomPart}-`;
}

function escapeRegExp(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceIdReferenceTokens(value, idMap) {
    return String(value || '')
        .split(/\s+/)
        .map(token => idMap.get(token) || token)
        .join(' ');
}

function rewriteCssIdReferences(cssText, idMap) {
    let css = String(cssText || '');
    for (const [oldId, newId] of idMap.entries()) {
        const escaped = escapeRegExp(oldId);
        // 常规 #id 选择器与 CSS/SVG url(#id) 引用。
        css = css
            .replace(new RegExp(`#${escaped}(?![\w-])`, 'g'), `#${newId}`)
            .replace(new RegExp(`url\(\s*(["']?)#${escaped}\1\s*\)`, 'g'), `url(#${newId})`);

        // ID 隔离后，CSS 属性选择器也必须同步。
        // 典型模型输出：#d1:checked ~ label[for="d1"] div。
        // 过去只改写 #d1 与真实 label.for，遗漏了 style 文本中的 [for="d1"]，
        // 导致整条选择器永久失配。这里只处理明确承载 ID 引用的属性。
        for (const attr of ['for', 'aria-controls', 'aria-labelledby', 'aria-describedby']) {
            css = css.replace(
                new RegExp(`(\[\s*${attr}\s*=\s*["'])${escaped}(["']\s*\])`, 'gi'),
                `$1${newId}$2`,
            );
        }
        for (const attr of ['href', 'xlink\\:href']) {
            css = css.replace(
                new RegExp(`(\[\s*${attr}\s*=\s*["']#)${escaped}(["']\s*\])`, 'gi'),
                `$1${newId}$2`,
            );
        }
    }
    return css;
}

function rewriteSmilIdReferences(value, idMap) {
    let output = String(value || '');
    for (const [oldId, newId] of idMap.entries()) {
        const escaped = escapeRegExp(oldId);
        output = output.replace(new RegExp(`(^|[;\\s])${escaped}(?=\\.)`, 'g'), `$1${newId}`);
    }
    return output;
}


function addImportantToDeclarationBlock(blockText) {
    return String(blockText || '').replace(
        /(^|;)\s*([a-z-]+)\s*:\s*([^;{}]+?)(\s*!important\s*)?(?=;|$)/gi,
        (match, separator, property, value) => {
            const cleanValue = String(value || '').trim().replace(/\s*!important\s*$/i, '');
            if (!cleanValue) return match;
            return `${separator}${property}: ${cleanValue} !important`;
        },
    );
}

function strengthenCheckedCssText(cssText) {
    // 生成内容经常把初始隐藏状态写成内联 style（display:none / height:0 / opacity:0）。
    // 普通 :checked 规则无法覆盖内联样式，因此只对交互状态规则追加 !important。
    return String(cssText || '').replace(/([^{}]*:checked[^{}]*)\{([^{}]*)\}/gi, (match, selector, declarations) => {
        return `${selector}{${addImportantToDeclarationBlock(declarations)}}`;
    });
}

function strengthenRabbitMirrorCheckedStateCss(toto) {
    if (!toto?.querySelectorAll) return;

    toto.querySelectorAll('style').forEach(styleEl => {
        const currentText = String(styleEl.textContent || '');
        if (!/:checked\b/i.test(currentText)) return;

        // 文本级处理可覆盖流式晚到的 style，也不依赖 CSSStyleSheet 是否已挂载。
        const strengthened = strengthenCheckedCssText(currentText);
        if (strengthened !== currentText) styleEl.textContent = strengthened;

        // CSSOM 再兜底一次，支持 @media/@supports 内的状态规则。
        try {
            const visitRules = (rules) => {
                for (const rule of [...(rules || [])]) {
                    if (rule?.cssRules) visitRules(rule.cssRules);
                    if (!rule?.selectorText || !/:checked\b/i.test(rule.selectorText) || !rule.style) continue;
                    for (const property of [...rule.style]) {
                        const value = rule.style.getPropertyValue(property);
                        if (value) rule.style.setProperty(property, value, 'important');
                    }
                }
            };
            visitRules(styleEl.sheet?.cssRules);
        } catch {
            // 某些宿主会暂时禁止读取 CSSOM；文本级修复仍然有效。
        }
    });
}



const interactionInlineOverrideStates = new WeakMap();


function parseCheckedRulesFromText(toto, input) {
    if (!toto?.querySelectorAll || !input?.id) return [];
    const escapedId = escapeRegExp(input.id);
    const selectorNeedle = new RegExp(`#${escapedId}:checked\\s*([+~])\\s*([^,{]+)`, 'i');
    const results = [];

    for (const styleEl of toto.querySelectorAll('style')) {
        const css = String(styleEl.textContent || '');
        const blockRe = /([^{}]+)\{([^{}]*)\}/g;
        let match;
        while ((match = blockRe.exec(css))) {
            const selectors = String(match[1] || '').split(',').map(v => v.trim()).filter(Boolean);
            const declarations = String(match[2] || '');
            for (const selector of selectors) {
                const selectorMatch = selector.match(selectorNeedle);
                if (!selectorMatch) continue;
                const relation = selectorMatch[1];
                const targetSelector = selectorMatch[2].trim();
                const styleMap = [];
                declarations.replace(/(^|;)\s*([a-z-]+)\s*:\s*([^;{}]+?)(\s*!important\s*)?(?=;|$)/gi,
                    (_m, _sep, property, value) => {
                        const cleanValue = String(value || '').trim().replace(/\s*!important\s*$/i, '');
                        if (property && cleanValue) styleMap.push([property, cleanValue]);
                        return _m;
                    });
                if (styleMap.length) results.push({ relation, targetSelector, styleMap });
            }
        }
    }
    return results;
}

function getSiblingTargetsForCheckedRule(input, relation, targetSelector) {
    const targets = [];
    if (!input?.parentElement || !targetSelector) return targets;
    let node = input.nextElementSibling;
    if (relation === '+') {
        if (node?.matches?.(targetSelector)) targets.push(node);
        return targets;
    }
    while (node) {
        if (node.matches?.(targetSelector)) targets.push(node);
        node = node.nextElementSibling;
    }
    return targets;
}

function getCrossContainerTargetsForCheckedRule(root, targetSelector) {
    if (!root?.querySelectorAll || !targetSelector) return [];
    try {
        const targets = [...root.querySelectorAll(targetSelector)];
        // 跨容器急救只接受当前兔子镜内明确且数量可控的目标，避免宽泛选择器误伤整页。
        if (!targets.length || targets.length > 12) return [];
        return targets;
    } catch {
        return [];
    }
}

function applyCheckedRuleTextFallback(toto, input) {
    if (!toto || !input) return 0;
    restoreInteractionInlineOverrides(input);
    if (!input.checked) return 0;

    const records = [];
    for (const rule of parseCheckedRulesFromText(toto, input)) {
        let targets = getSiblingTargetsForCheckedRule(input, rule.relation, rule.targetSelector);
        // 模型常把 input 放在按钮容器、反馈放在相邻内容容器，导致 +/~ 永远跨不出父级。
        // 原结构无匹配时，降级为当前兔子镜根内的受控目标查找，直接实现规则最终状态。
        if (!targets.length) targets = getCrossContainerTargetsForCheckedRule(toto, rule.targetSelector);
        for (const target of targets) {
            for (const [property, value] of rule.styleMap) {
                records.push({
                    element: target,
                    property,
                    value: target.style.getPropertyValue(property),
                    priority: target.style.getPropertyPriority(property),
                });
                target.style.setProperty(property, value, 'important');
            }
        }
    }
    if (records.length) interactionInlineOverrideStates.set(input, records);
    return records.length;
}

function restoreInteractionInlineOverrides(input) {
    const records = interactionInlineOverrideStates.get(input);
    if (!records) return;
    for (const record of records) {
        const { element, property, value, priority } = record;
        if (!element?.style) continue;
        if (value) element.style.setProperty(property, value, priority || '');
        else element.style.removeProperty(property);
    }
    interactionInlineOverrideStates.delete(input);
}

function applyCheckedRuleInlineFallback(toto, input) {
    if (!toto?.querySelectorAll || !input?.id) return;

    restoreInteractionInlineOverrides(input);
    if (!input.checked) return;

    const escapedId = typeof CSS !== 'undefined' && CSS.escape
        ? CSS.escape(input.id)
        : String(input.id).replace(/([^a-zA-Z0-9_-])/g, '\\$1');
    const idNeedle = `#${escapedId}:checked`;
    const records = [];

    const applyRule = (selectorText, style) => {
        if (!selectorText || !style || !selectorText.includes(idNeedle)) return;
        let targets = [];
        try {
            targets = [...toto.querySelectorAll(selectorText)];
        } catch {
            return;
        }
        for (const target of targets) {
            for (const property of [...style]) {
                const value = style.getPropertyValue(property);
                if (!value) continue;
                records.push({
                    element: target,
                    property,
                    value: target.style.getPropertyValue(property),
                    priority: target.style.getPropertyPriority(property),
                });
                target.style.setProperty(property, value, 'important');
            }
        }
    };

    for (const styleEl of toto.querySelectorAll('style')) {
        try {
            const visitRules = (rules) => {
                for (const rule of [...(rules || [])]) {
                    if (rule?.cssRules) visitRules(rule.cssRules);
                    if (rule?.selectorText && rule?.style) applyRule(rule.selectorText, rule.style);
                }
            };
            visitRules(styleEl.sheet?.cssRules);
        } catch {
            // CSSOM 不可读时，文本级 !important 修复仍然保留。
        }
    }

    if (records.length) interactionInlineOverrideStates.set(input, records);
}




const TARGET_ACTIVE_ATTR = 'data-rm-target-active';
const TARGET_RESCUE_STYLE_ATTR = 'data-rabbit-mirror-target-rescue';
const interactionCapabilityStates = new WeakMap();

function detectInteractionCapabilities(root) {
    if (!root?.querySelectorAll) return { checked: false, hover: false, details: false, target: false };
    const cssText = [...root.querySelectorAll('style')].map(style => style.textContent || '').join('\n');
    const outerDetails = root.matches?.('details') ? root : root.querySelector(':scope > details');
    const nestedDetails = [...root.querySelectorAll('details')].filter(item => item !== outerDetails);
    const capabilities = {
        checked: !!root.querySelector('input[type="checkbox"], input[type="radio"]') || /:checked\b/i.test(cssText),
        hover: /:hover\b/i.test(cssText),
        details: nestedDetails.length > 0,
        target: /:target\b/i.test(cssText) || !!root.querySelector('a[href^="#"]'),
    };
    interactionCapabilityStates.set(root, capabilities);
    root.dataset.rabbitMirrorInteractionRoutes = Object.entries(capabilities)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name)
        .join(',') || 'none';
    return capabilities;
}

function collectTargetRulesFromCss(cssText) {
    const rules = [];
    const blockRe = /([^{}]+)\{([^{}]*)\}/g;
    let match;
    while ((match = blockRe.exec(String(cssText || '')))) {
        const selectorText = String(match[1] || '').trim();
        if (!selectorText || selectorText.startsWith('@') || !/:target\b/i.test(selectorText)) continue;
        const declarations = addImportantToDeclarationBlock(String(match[2] || ''));
        if (!declarations.trim()) continue;
        const selectors = selectorText.split(',')
            .map(value => value.trim())
            .filter(Boolean)
            .map(selector => selector.replace(/:target\b/gi, `[${TARGET_ACTIVE_ATTR}="true"]`));
        if (selectors.length) rules.push(`${selectors.join(', ')} {${declarations}}`);
    }
    return rules.join('\n');
}

function refreshTargetRescue(root) {
    if (!root?.querySelectorAll) return;
    let combinedCss = '';
    root.querySelectorAll(`style:not([${TARGET_RESCUE_STYLE_ATTR}])`).forEach(styleEl => {
        const parsed = collectTargetRulesFromCss(styleEl.textContent || '');
        if (parsed) combinedCss += `${parsed}\n`;
    });
    let rescueStyle = root.querySelector(`style[${TARGET_RESCUE_STYLE_ATTR}]`);
    if (combinedCss.trim()) {
        if (!rescueStyle) {
            rescueStyle = document.createElement('style');
            rescueStyle.setAttribute(TARGET_RESCUE_STYLE_ATTR, 'true');
            root.appendChild(rescueStyle);
        }
        const nextCss = combinedCss.trim();
        if (rescueStyle.textContent !== nextCss) rescueStyle.textContent = nextCss;
    } else if (rescueStyle) {
        rescueStyle.remove();
    }

    if (root.dataset.rabbitMirrorTargetFallback === 'true') return;
    root.addEventListener('click', event => {
        const anchor = event.target?.closest?.('a[href^="#"]');
        if (!anchor || !root.contains(anchor)) return;
        const rawId = String(anchor.getAttribute('href') || '').slice(1);
        if (!rawId) return;
        let target = null;
        try {
            target = [...root.querySelectorAll('[id]')].find(el => el.id === decodeURIComponent(rawId));
        } catch {
            target = [...root.querySelectorAll('[id]')].find(el => el.id === rawId);
        }
        if (!target) return;
        event.preventDefault();
        root.querySelectorAll(`[${TARGET_ACTIVE_ATTR}="true"]`).forEach(el => {
            if (el !== target) el.removeAttribute(TARGET_ACTIVE_ATTR);
        });
        const active = target.getAttribute(TARGET_ACTIVE_ATTR) === 'true';
        if (active) target.removeAttribute(TARGET_ACTIVE_ATTR);
        else target.setAttribute(TARGET_ACTIVE_ATTR, 'true');
    }, true);
    root.dataset.rabbitMirrorTargetFallback = 'true';
}

function installNestedDetailsFallback(root) {
    if (!root?.querySelectorAll || root.dataset.rabbitMirrorDetailsFallback === 'true') return;
    const outerDetails = root.matches?.('details') ? root : root.querySelector(':scope > details');
    root.addEventListener('click', event => {
        const summary = event.target?.closest?.('summary');
        const details = summary?.parentElement;
        if (!summary || !details || details.tagName !== 'DETAILS' || details === outerDetails || !root.contains(details)) return;
        // 仅当宿主没有在本次点击中改变 open 状态时才兜底，避免双重切换。
        const before = details.open;
        setTimeout(() => {
            if (details.isConnected && details.open === before) details.open = !before;
        }, 0);
    }, true);
    root.dataset.rabbitMirrorDetailsFallback = 'true';
}

function installIntelligentInteractionRescue(root) {
    const capabilities = detectInteractionCapabilities(root);
    if (capabilities.checked) {
        strengthenRabbitMirrorCheckedStateCss(root);
        installInteractionLabelFallback(root);
    }
    if (capabilities.hover) refreshTouchHoverRescue(root);
    if (capabilities.target) refreshTargetRescue(root);
    if (capabilities.details) installNestedDetailsFallback(root);
}

const touchHoverRescueStates = new WeakMap();
const TOUCH_HOVER_ATTR = 'data-rm-touch-hover';
const TOUCH_HOVER_STYLE_ATTR = 'data-rabbit-mirror-touch-hover-rescue';

function collectTouchHoverRulesFromCss(cssText) {
    const rules = [];
    const subjects = new Set();
    const blockRe = /([^{}]+)\{([^{}]*)\}/g;
    let match;

    while ((match = blockRe.exec(String(cssText || '')))) {
        const selectorText = String(match[1] || '').trim();
        if (!selectorText || selectorText.startsWith('@') || !/:hover\b/i.test(selectorText)) continue;

        const declarations = addImportantToDeclarationBlock(String(match[2] || ''));
        if (!declarations.trim()) continue;

        const transformedSelectors = [];
        for (const selector of selectorText.split(',').map(value => value.trim()).filter(Boolean)) {
            if (!/:hover\b/i.test(selector)) continue;

            // 手机端以一个持久属性模拟当前元素的 :hover 状态。
            transformedSelectors.push(selector.replace(/:hover\b/gi, `[${TOUCH_HOVER_ATTR}="true"]`));

            // 只提取紧邻 :hover 的简单主体（class / id / tag / attribute compound）。
            // 这覆盖模型最常生成的 .area:hover、#panel:hover、label:hover 等结构。
            const subjectRe = /((?:[a-zA-Z][\w-]*)?(?:[#.][\w-]+|\[[^\]]+\])*)\s*:hover\b/gi;
            let subjectMatch;
            while ((subjectMatch = subjectRe.exec(selector))) {
                const subject = String(subjectMatch[1] || '').trim();
                if (subject) subjects.add(subject);
            }
        }

        if (transformedSelectors.length) {
            rules.push(`${transformedSelectors.join(', ')} {${declarations}}`);
        }
    }

    return { cssText: rules.join('\n'), subjects: [...subjects] };
}

function refreshTouchHoverRescue(toto) {
    if (!toto?.querySelectorAll) return;

    let combinedCss = '';
    const subjects = new Set();
    toto.querySelectorAll(`style:not([${TOUCH_HOVER_STYLE_ATTR}])`).forEach(styleEl => {
        const parsed = collectTouchHoverRulesFromCss(styleEl.textContent || '');
        if (parsed.cssText) combinedCss += `${parsed.cssText}\n`;
        parsed.subjects.forEach(subject => subjects.add(subject));
    });

    let rescueStyle = toto.querySelector(`style[${TOUCH_HOVER_STYLE_ATTR}]`);
    if (combinedCss.trim()) {
        if (!rescueStyle) {
            rescueStyle = document.createElement('style');
            rescueStyle.setAttribute(TOUCH_HOVER_STYLE_ATTR, 'true');
            toto.appendChild(rescueStyle);
        }
        const nextCss = combinedCss.trim();
        if (rescueStyle.textContent !== nextCss) rescueStyle.textContent = nextCss;
    } else if (rescueStyle) {
        rescueStyle.remove();
    }

    touchHoverRescueStates.set(toto, { subjects: [...subjects] });

    if (toto.dataset.rabbitMirrorTouchHoverFallback === 'true') return;
    toto.addEventListener('click', (event) => {
        const state = touchHoverRescueStates.get(toto);
        if (!state?.subjects?.length) return;

        let hoverTarget = null;
        for (const subject of state.subjects) {
            try {
                const candidate = event.target?.closest?.(subject);
                if (candidate && toto.contains(candidate)) {
                    hoverTarget = candidate;
                    break;
                }
            } catch {
                // Ignore malformed model-generated selectors.
            }
        }
        if (!hoverTarget) return;

        const isActive = hoverTarget.getAttribute(TOUCH_HOVER_ATTR) === 'true';
        if (isActive) hoverTarget.removeAttribute(TOUCH_HOVER_ATTR);
        else hoverTarget.setAttribute(TOUCH_HOVER_ATTR, 'true');
    }, false);

    toto.dataset.rabbitMirrorTouchHoverFallback = 'true';
}

function installInteractionLabelFallback(toto) {
    if (!toto || toto.dataset.rabbitMirrorInteractionFallback === 'true') return;

    // 使用捕获阶段，避免主题或其他插件在内部 stopPropagation 后导致 label 完全点不开。
    toto.addEventListener('click', (event) => {
        const label = event.target?.closest?.('label');
        if (!label || !toto.contains(label)) return;

        const targetId = label.getAttribute('for');
        const input = targetId
            ? [...toto.querySelectorAll('input[id]')].find(el => el.id === targetId)
            : label.querySelector('input[type="checkbox"], input[type="radio"]');
        if (!input || !/^(?:checkbox|radio)$/i.test(input.type || '') || input.disabled) return;

        // 浏览器/主题层有时不会可靠触发隐藏 input；只在当前兔子镜内手动完成一次。
        event.preventDefault();
        const previous = !!input.checked;
        if (input.type === 'radio') {
            // 先恢复同组上一分支由急救器写入的内联状态，再切换到当前分支。
            const radioName = String(input.name || '');
            [...toto.querySelectorAll('input[type="radio"]')]
                .filter(item => item !== input && (!radioName || item.name === radioName))
                .forEach(item => restoreInteractionInlineOverrides(item));
            input.checked = true;
        } else {
            input.checked = !input.checked;
        }

        // 在部分移动端 WebView 中，晚到的 <style> 即使被补上 !important，
        // 也可能未稳定覆盖元素原有的内联 display:none。这里直接按真实 :checked
        // 规则把状态声明落到匹配目标上，取消勾选时再恢复，作为最终兜底。
        // 先走不依赖 CSSOM 的文本解析兜底；酒馆/WebView 即使不给 style.sheet，仍能修复。
        // 文本规则命中后不要再运行 CSSOM 兜底，否则后者开头的恢复动作会撤销刚应用的状态。
        const textRuleCount = applyCheckedRuleTextFallback(toto, input);
        // 仅在文本解析没有命中时再尝试 CSSOM（例如规则位于复杂 @media 内）。
        if (!textRuleCount) applyCheckedRuleInlineFallback(toto, input);

        if (previous !== input.checked) {
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }, true);

    toto.dataset.rabbitMirrorInteractionFallback = 'true';
}

function collectExistingIdReferences(text, existingIds, output) {
    const value = String(text || '');
    // 按 DOM 中真实存在的 ID 精确匹配，避免把 :checked / :hover 等伪类误当成 ID 的一部分。
    for (const id of existingIds) {
        const escaped = escapeRegExp(id);
        if (new RegExp(`#${escaped}(?![\\w-])`).test(value)
            || new RegExp(`url\\(\\s*["']?#${escaped}(?:["']?\\s*)\\)`, 'i').test(value)) {
            output.add(id);
        }
    }
}

function collectUrlIdReferences(text, existingIds, output) {
    const pattern = /url\(\s*["']?#([^\s)"']+)/gi;
    let match;
    while ((match = pattern.exec(String(text || '')))) {
        const id = match[1];
        if (existingIds.has(id)) output.add(id);
    }
}

function buildElementsById(toto) {
    const elementsById = new Map();
    toto.querySelectorAll('[id]').forEach(el => {
        const id = String(el.id || '').trim();
        if (!id) return;
        if (!elementsById.has(id)) elementsById.set(id, []);
        elementsById.get(id).push(el);
    });
    return elementsById;
}

function collectCurrentIdsToScope(toto, elementsById, mappedValues = new Set()) {
    const existingIds = new Set(elementsById.keys());
    const idsToScope = new Set();
    const controls = [...toto.querySelectorAll('input[type="checkbox"], input[type="radio"]')];

    controls.forEach(input => {
        const id = String(input.id || '').trim();
        if (id && !mappedValues.has(id)) idsToScope.add(id);
    });

    toto.querySelectorAll('label[for], [href^="#"], [xlink\\:href^="#"], [aria-controls], [aria-labelledby], [aria-describedby]').forEach(el => {
        const forValue = el.getAttribute('for');
        if (forValue && existingIds.has(forValue) && !mappedValues.has(forValue)) idsToScope.add(forValue);
        for (const attr of ['href', 'xlink:href']) {
            const value = el.getAttribute(attr);
            const id = value?.startsWith('#') ? value.slice(1) : '';
            if (id && existingIds.has(id) && !mappedValues.has(id)) idsToScope.add(id);
        }
        for (const attr of ['aria-controls', 'aria-labelledby', 'aria-describedby']) {
            const value = el.getAttribute(attr);
            if (value) value.split(/\s+/).filter(Boolean).forEach(id => {
                if (existingIds.has(id) && !mappedValues.has(id)) idsToScope.add(id);
            });
        }
    });

    toto.querySelectorAll('style').forEach(styleEl => {
        collectExistingIdReferences(styleEl.textContent, existingIds, idsToScope);
    });
    toto.querySelectorAll('*').forEach(el => {
        for (const attr of [...(el.attributes || [])]) {
            if (!attr?.value || /^(?:id|class)$/i.test(attr.name)) continue;
            collectUrlIdReferences(attr.value, existingIds, idsToScope);
            if (/^(?:begin|end)$/i.test(attr.name) && attr.value.includes('.')) {
                for (const id of existingIds) {
                    if (!mappedValues.has(id) && new RegExp(`(^|[;\\s])${escapeRegExp(id)}(?=\\.)`).test(attr.value)) idsToScope.add(id);
                }
            }
        }
    });

    return { controls, idsToScope };
}

function synchronizeInteractionReferences(toto, idMap) {
    if (!idMap?.size) return;

    toto.querySelectorAll('label[for]').forEach(label => {
        const oldFor = label.getAttribute('for');
        if (idMap.has(oldFor)) label.setAttribute('for', idMap.get(oldFor));
    });

    toto.querySelectorAll('[href^="#"], [xlink\\:href^="#"]').forEach(el => {
        for (const attr of ['href', 'xlink:href']) {
            const value = el.getAttribute(attr);
            if (!value?.startsWith('#')) continue;
            const oldId = value.slice(1);
            if (idMap.has(oldId)) el.setAttribute(attr, `#${idMap.get(oldId)}`);
        }
    });

    for (const attr of ['aria-controls', 'aria-labelledby', 'aria-describedby']) {
        toto.querySelectorAll(`[${attr}]`).forEach(el => {
            el.setAttribute(attr, replaceIdReferenceTokens(el.getAttribute(attr), idMap));
        });
    }

    // 流式生成时 <style> 往往最后才到达。每次扫描都重新同步，避免旧 ID 留在晚到的 CSS 中。
    toto.querySelectorAll('style').forEach(styleEl => {
        const currentText = String(styleEl.textContent || '');
        const rewrittenText = rewriteCssIdReferences(currentText, idMap);
        // 仅在内容确实变化时重建样式表。无条件写回会触发 MutationObserver，
        // 让 @keyframes 动画不断从 0 秒重启，视觉上表现为完全静止。
        if (rewrittenText !== currentText) styleEl.textContent = rewrittenText;
    });

    // 同步所有属性中的 url(#id)，覆盖 SVG 的 fill/stroke/filter/clip-path/mask/marker 等。
    toto.querySelectorAll('*').forEach(el => {
        for (const attr of [...(el.attributes || [])]) {
            if (!attr?.value) continue;
            if (/url\(\s*["']?#/i.test(attr.value)) {
                el.setAttribute(attr.name, rewriteCssIdReferences(attr.value, idMap));
            } else if (/^(?:begin|end)$/i.test(attr.name) && attr.value.includes('.')) {
                el.setAttribute(attr.name, rewriteSmilIdReferences(attr.value, idMap));
            }
        }
    });
}

function recoverInteractionScopeState(toto) {
    const idMap = new Map();
    let prefix = '';
    toto.querySelectorAll('[id]').forEach(el => {
        const currentId = String(el.id || '').trim();
        const match = currentId.match(SCOPED_INTERACTION_ID_RE);
        if (!match) return;
        prefix ||= match[1];
        if (match[1] === prefix && match[2]) idMap.set(match[2], currentId);
    });
    return idMap.size ? { prefix, idMap } : null;
}

function scopeRabbitMirrorInteractionIds(toto) {
    if (!toto?.querySelector) return;

    // WeakMap 记录同一 DOM 在流式生成期间的映射；旧版本留下的 data 标记则从已加前缀的 ID 中恢复。
    let state = interactionScopeStates.get(toto);
    if (!state && toto.dataset.rabbitMirrorInteractionScoped === 'true') {
        state = recoverInteractionScopeState(toto);
        if (state) interactionScopeStates.set(toto, state);
        else delete toto.dataset.rabbitMirrorInteractionScoped;
    }

    if (!state) {
        state = { prefix: createInteractionScopePrefix(), idMap: new Map() };
        interactionScopeStates.set(toto, state);
    }

    const mappedValues = new Set(state.idMap.values());
    const elementsById = buildElementsById(toto);
    const { controls, idsToScope } = collectCurrentIdsToScope(toto, elementsById, mappedValues);

    // 新到达的交互控件或 SVG/CSS 引用只追加到原映射，不会给已有 ID 再套第二层前缀。
    for (const oldId of idsToScope) {
        if (state.idMap.has(oldId) || mappedValues.has(oldId) || !elementsById.has(oldId)) continue;
        const newId = `${state.prefix}${oldId}`;
        state.idMap.set(oldId, newId);
        mappedValues.add(newId);
        for (const el of elementsById.get(oldId) || []) el.id = newId;
    }

    controls.filter(input => input.type === 'radio' && input.hasAttribute('name')).forEach(input => {
        const name = input.getAttribute('name') || '';
        if (name && !name.startsWith(state.prefix)) input.name = `${state.prefix}${name}`;
    });

    synchronizeInteractionReferences(toto, state.idMap);
    installIntelligentInteractionRescue(toto);
    toto.dataset.rabbitMirrorInteractionScoped = 'true';
}

function getRenderedRabbitMirrorInteractionRoots(root) {
    if (!root?.querySelectorAll) return [];
    const candidates = new Set(root.querySelectorAll(MIRROR_TOTO_SELECTOR));

    // 部分酒馆渲染/净化链会移除未知的 <toto> 外壳，但保留带“兔子镜”标题的 <details>。
    // 代码块急救原本已有该兼容路径；交互急救也必须识别同一类实际渲染结果。
    root.querySelectorAll('details').forEach(details => {
        if (!isRabbitMirrorDetails(details)) return;
        if (details.closest(MIRROR_TOTO_SELECTOR)) return;
        candidates.add(details);
    });

    return [...candidates];
}

function scopeRabbitMirrorInteractionsInChatDom() {
    const root = getChatRoot();
    if (!root) return;
    const enabled = isInteractionRescueModeEnabled();
    getRenderedRabbitMirrorInteractionRoots(root).forEach(mirrorRoot => {
        if (!isInsideChatMessage(mirrorRoot)) return;
        const remembered = wasInteractionRescued(mirrorRoot);
        if (!enabled && !remembered) return;
        if (enabled && !remembered) rememberInteractionRescue(mirrorRoot);
        scopeRabbitMirrorInteractionIds(mirrorRoot);
        mirrorRoot.dataset.rabbitMirrorInteractionRescued = 'true';
    });
}

function stripHtmlComments(text) {
    return String(text || '').replace(HTML_COMMENT_RE, '');
}

function normalizeMirrorAttribute(text) {
    return String(text || '').replace(new RegExp('data-rabbit-' + 'h' + 'ole', 'gi'), 'data-rabbit-mirror');
}

function stripSyntaxHighlightClasses(text) {
    return String(text || '').replace(CLASS_ATTR_RE, (match, quote, classValue) => {
        const kept = String(classValue || '')
            .split(/\s+/)
            .filter(token => token && !HIGHLIGHT_CLASS_TOKEN_RE.test(token));
        return kept.length ? ` class=${quote}${kept.join(' ')}${quote}` : '';
    });
}

function stripCodeBlockTriggers(text) {
    return normalizeMirrorAttribute(stripHtmlComments(String(text || '')))
        .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
        .replace(CODE_FENCE_OPEN_RE, '')
        .replace(/```/g, '')
        .replace(TILDE_FENCE_OPEN_RE, '')
        .replace(/~~~/g, '')
        .replace(CODE_LIKE_TAG_RE, '')
        .replace(CLASS_ATTR_RE, (match, quote, classValue) => {
            const kept = String(classValue || '')
                .split(/\s+/)
                .filter(token => token && !HIGHLIGHT_CLASS_TOKEN_RE.test(token));
            return kept.length ? ` class=${quote}${kept.join(' ')}${quote}` : '';
        })
        .replace(MULTI_BLANK_LINE_RE, '\n')
        .trim();
}

function decodeHtmlEntities(text) {
    const input = String(text || '');
    if (!input.includes('&')) return input;
    try {
        if (typeof document === 'undefined') return input;
        const textarea = document.createElement('textarea');
        textarea.innerHTML = input;
        return textarea.value;
    } catch {
        return input;
    }
}

function stripOneCodeFence(text) {
    const input = String(text || '').trim();
    const match = input.match(WHOLE_FENCED_BLOCK_RE);
    return match ? String(match[1] || '').trim() : input;
}

function looksLikeCompleteHtmlBlock(text) {
    const html = String(text || '').trim();
    if (!html) return false;
    if (TOTO_BLOCK_SINGLE_RE.test(html)) return true;
    if (!/^<(?:div|section|article|details)\b[\s\S]*<\/(?:div|section|article|details)>\s*$/i.test(html)) return false;

    // 只接管“像兔子镜 UI 作品”的整段 HTML，避免误伤普通聊天里的 HTML 教程代码。
    const htmlSignal = /\bstyle\s*=|display\s*:\s*(?:grid|flex|block)|box-sizing\s*:|max-width\s*:|linear-gradient\(|box-shadow\s*:|filter\s*:|border-radius\s*:/i.test(html);
    const theaterSignal = /兔子镜|小剧场|互动区|海龟汤|剖面图|Layer|视觉|展现形式|summary|details/i.test(html);
    const enoughTags = (html.match(/<\/(?:div|p|span|h[1-6]|section|article)>/gi) || []).length >= 3;
    return htmlSignal && (theaterSignal || enoughTags);
}

function wrapNakedHtmlAsToto(html) {
    const body = compactTotoBlock(html);
    if (TOTO_BLOCK_SINGLE_RE.test(body)) return body;
    if (/<details\b/i.test(body) && /<summary\b/i.test(body)) {
        return `<toto data-rabbit-mirror="true" style="display:block;">${body}</toto>`;
    }
    return `<toto data-rabbit-mirror="true" style="display:block;"><details style="display:block;box-sizing:border-box;"><summary style="cursor:pointer;list-style:none;font-weight:700;margin:0 0 8px 0;">【兔子镜：小剧场】</summary>${body}</details></toto>`;
}

function cleanCodeFencePayload(payload) {
    const raw = stripHtmlComments(stripOneCodeFence(decodeHtmlEntities(payload)));
    if (!raw) return raw;
    if (TOTO_BLOCK_SINGLE_RE.test(raw)) return cleanRabbitMirrorOutput(raw);
    if (looksLikeCompleteHtmlBlock(raw)) return wrapNakedHtmlAsToto(raw);
    return null;
}

function unwrapCodeBlocksInsideToto(block) {
    let html = stripHtmlComments(String(block || ''));

    // 关键兜底：外层 <toto>/<details> 已经成立，但模型把正文 HTML 又塞进 ```html 代码块时，
    // 这里只拆掉内部代码块，保留原本的外层 summary，不再二次包 <toto>。
    html = html.replace(FENCED_BLOCK_RE, (match, payload) => {
        const raw = stripHtmlComments(stripOneCodeFence(decodeHtmlEntities(payload)));
        if (looksLikeCompleteHtmlBlock(raw)) return compactTotoBlock(raw);
        if (TOTO_BLOCK_SINGLE_RE.test(raw)) return compactTotoBlock(raw.replace(/^<toto\b[^>]*>/i, '').replace(/<\/toto>\s*$/i, ''));
        return match;
    });

    // 兼容已经被 Markdown 渲染成 <pre><code>&lt;div...&gt;</code></pre> 后又写回消息的情况。
    html = html.replace(PRE_CODE_RE, (match, payload) => {
        const raw = stripHtmlComments(stripOneCodeFence(decodeHtmlEntities(payload)));
        if (looksLikeCompleteHtmlBlock(raw)) return compactTotoBlock(raw);
        if (TOTO_BLOCK_SINGLE_RE.test(raw)) return compactTotoBlock(raw.replace(/^<toto\b[^>]*>/i, '').replace(/<\/toto>\s*$/i, ''));
        return match;
    });

    return stripCodeBlockTriggers(html);
}

function wrapTrailingNakedHtml(text) {
    const input = String(text || '').trim();
    if (TOTO_BLOCK_SINGLE_RE.test(input)) return input;
    if (looksLikeCompleteHtmlBlock(input)) return wrapNakedHtmlAsToto(input);

    const match = input.match(TRAILING_HTML_START_RE);
    if (!match) return input;
    const htmlStart = match.index + match[0].indexOf('<');
    const prefix = input.slice(0, htmlStart).trimEnd();
    const tail = input.slice(htmlStart).trim();
    if (!looksLikeCompleteHtmlBlock(tail)) return input;
    return `${prefix}${prefix ? '\n' : ''}${wrapNakedHtmlAsToto(tail)}`.trim();
}

export function compactTotoBlock(block) {
    let html = normalizeMirrorAttribute(stripCodeBlockTriggers(block));
    const styleSlots = [];

    // 1. 保护 <style>...</style>，避免 CSS 文本被误插入 <br>。
    html = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (match) => {
        const key = `%%RHT_STYLE_${styleSlots.length}%%`;
        styleSlots.push(
            match
                .replace(/\r\n?/g, '\n')
                .replace(/^[ \t]+/gm, '')
                .replace(/[ \t]+$/gm, '')
                .replace(/\n+/g, '')
                .replace(/>\s+</g, '><')
                .trim(),
        );
        return key;
    });

    // 2. 核心：清除每一行行首缩进，破坏 Markdown-it 的“行首 4 空格代码块”识别条件。
    html = html
        .replace(/\r\n?/g, '\n')
        .replace(/^[ \t]+/gm, '')
        .replace(/[ \t]+$/gm, '');

    // 3. 只删除标签之间的结构空白，尽量不碰属性文案。
    html = html
        .replace(/>\s+</g, '><')
        .replace(/\n(?=<)/g, '')
        .replace(/>\n/g, '>');

    // 4. 按标签切开：标签内换行压成空格；纯结构空白删除；真实文案里的换行转 <br>。
    html = html
        .split(/(<[^>]+>)/g)
        .map((part) => {
            if (!part) return '';
            if (part.startsWith('<')) {
                return part
                    .replace(/\s*\n\s*/g, ' ')
                    .replace(/[ \t]{2,}/g, ' ');
            }
            if (!part.trim()) return '';
            return part
                .replace(/[ \t]*\n[ \t]*/g, '<br>')
                .replace(/(?:<br>){3,}/g, '<br><br>');
        })
        .join('')
        .trim();

    // 5. 还原 <style>。
    styleSlots.forEach((style, index) => {
        html = html.replace(`%%RHT_STYLE_${index}%%`, style);
    });

    return html
        .replace(CLASS_ATTR_RE, (match, quote, classValue) => {
            const kept = String(classValue || '')
                .split(/\s+/)
                .filter(token => token && !HIGHLIGHT_CLASS_TOKEN_RE.test(token));
            return kept.length ? ` class=${quote}${kept.join(' ')}${quote}` : '';
        })
        .replace(MULTI_BLANK_LINE_RE, '\n')
        .trim();
}

export function cleanRabbitMirrorOutput(responseText = '') {
    // 代码块急救模式关闭时，严格不干预原始输出。
    // 开启后才拆代码块外壳、pre/code、语法高亮 class 等。
    if (!isCodeBlockRescueModeEnabled()) return String(responseText || '');

    let text = normalizeMirrorAttribute(stripHtmlComments(String(responseText || '')))
        .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
        .replace(/\r\n?/g, '\n')
        .trim();

    // 1. 如果整个回复被一层 ```html 包住，先扒掉最外层。
    const wholeFence = text.match(WHOLE_FENCED_BLOCK_RE);
    if (wholeFence) {
        const payload = decodeHtmlEntities(wholeFence[1]).trim();
        if (TOTO_BLOCK_SINGLE_RE.test(payload) || looksLikeCompleteHtmlBlock(payload)) text = payload;
    }

    // 2. 先处理已经有 <toto> 外壳的块：拆掉内部 ```html / <pre><code>，再压缩。
    text = text.replace(TOTO_BLOCK_RE, (block) => compactTotoBlock(unwrapCodeBlocksInsideToto(block)));

    // 3. 再处理外层裸露的代码块：如果整块是兔子镜或裸 HTML，则补边界。
    text = text.replace(FENCED_BLOCK_RE, (match, payload) => {
        const cleaned = cleanCodeFencePayload(payload);
        return cleaned || match;
    }).trim();

    // 4. 兜底：残留的首尾三反引号。
    text = text
        .replace(/^\s*```(?:html|HTML|xml|XML)?\s*\n?/i, '')
        .replace(/\n?\s*```\s*$/i, '')
        .trim();

    // 5. 如果模型漏掉 <toto>，接管消息末尾的完整裸 HTML 小剧场并补上边界。
    text = wrapTrailingNakedHtml(text);

    // 6. 补完边界后再处理/压缩一次，确保内部代码块也被拆掉。
    text = text.replace(TOTO_BLOCK_RE, (block) => compactTotoBlock(unwrapCodeBlocksInsideToto(block)));

    return text.trim();
}

function needsSanitize(text) {
    if (!isCodeBlockRescueModeEnabled()) return false;
    const decoded = decodeHtmlEntities(String(text || ''));
    if (TOTO_BLOCK_SINGLE_RE.test(decoded)) return true;
    if (/```(?:html|HTML|xml|XML)?[\s\S]*?<toto\b/i.test(decoded)) return true;
    if (FENCED_BLOCK_RE.test(decoded)) {
        FENCED_BLOCK_RE.lastIndex = 0;
        let match;
        while ((match = FENCED_BLOCK_RE.exec(decoded))) {
            const raw = stripOneCodeFence(decodeHtmlEntities(match[1]));
            if (looksLikeCompleteHtmlBlock(raw) || TOTO_BLOCK_SINGLE_RE.test(raw)) {
                FENCED_BLOCK_RE.lastIndex = 0;
                return true;
            }
        }
        FENCED_BLOCK_RE.lastIndex = 0;
    }
    return wrapTrailingNakedHtml(decoded) !== decoded.trim();
}

function findRecentAssistantMessages(mod) {
    const chat = mod?.chat || globalThis.chat;
    if (!Array.isArray(chat) || !chat.length) return [];
    return chat.slice(-8).filter(item => !item?.is_user && typeof item?.mes === 'string');
}

function sanitizeLatestRawMessages(mod) {
    if (!isCodeBlockRescueModeEnabled()) return false;
    let changed = false;
    for (const message of findRecentAssistantMessages(mod)) {
        const decoded = decodeHtmlEntities(message.mes);
        if (!needsSanitize(decoded)) continue;
        const cleaned = cleanRabbitMirrorOutput(decoded);
        if (cleaned && cleaned !== message.mes) {
            message.mes = cleaned;
            if (Array.isArray(message.swipes)) {
                const swipeIndex = Number.isInteger(message.swipe_id) ? message.swipe_id : message.swipes.length - 1;
                if (typeof message.swipes[swipeIndex] === 'string') message.swipes[swipeIndex] = cleaned;
            }
            changed = true;
        }
    }
    if (changed) {
        try {
            const saver = mod?.saveChatConditional || globalThis.saveChatConditional;
            if (typeof saver === 'function') saver();
        } catch (error) {
            console.debug('[RabbitMirror] save after sanitizer failed:', error);
        }
    }
    return changed;
}

function parseHtmlFragment(html) {
    try {
        const template = document.createElement('template');
        template.innerHTML = html;
        return template.content.childNodes.length ? template.content.cloneNode(true) : null;
    } catch {
        return null;
    }
}

function parseTotoFragment(html) {
    try {
        const template = document.createElement('template');
        template.innerHTML = html;
        const toto = template.content.querySelector('toto[data-rabbit-mirror="true"], toto');
        return toto ? toto.cloneNode(true) : null;
    } catch {
        return null;
    }
}

const CODE_SHELL_SELECTOR = 'pre, code, .hljs, .code_block, .code-block, .codeblock, [class*="codeblock"], [class*="code-block"]';

function isCodeShellNode(node) {
    return !!node?.matches?.(CODE_SHELL_SELECTOR);
}

function findCodeReplaceTarget(node) {
    // 只替换真正的代码块节点；绝不根据父层文字或样式向上吞掉普通容器。
    // 因而主容器的 background / border / padding / radius / shadow / layout 会原样保留。
    if (!node?.closest) return null;
    const pre = node.closest('pre');
    if (pre) return pre;
    return isCodeShellNode(node) ? node : null;
}

function getChatRoot() {
    if (typeof document === 'undefined') return null;
    return document.querySelector('#chat')
        || document.querySelector('#chat_block')
        || document.querySelector('.chat')
        || document.querySelector('[id*=chat]');
}

function isInsideChatMessage(node) {
    const root = getChatRoot();
    if (!root || !node || !root.contains(node)) return false;
    // 只允许修聊天区，绝不碰扩展设置页/弹窗，避免再次影响其他插件勾选。
    // 注意：不要用 .drawer-content 做全局排除，部分主题/插件会把聊天消息也包在 drawer 类容器里。
    if (node.closest('#extensions_settings, #extensions_settings2, #rm_extensions_block, #extensionsMenu, .popup, .modal, .ui-dialog')) return false;
    const messageScope = node.closest('.mes, [mesid], .mes_text, [data-message-id], [data-messageid], .swipe_right, .swipe_left');
    return !!messageScope || root === node.closest('#chat') || root === node.closest('#chat_block');
}

function getCodeCandidateText(node) {
    const clone = node.cloneNode(true);
    // 去掉代码块工具栏文字，避免“隐藏代码块/复制”等字样影响 HTML 判断。
    for (const el of [...clone.querySelectorAll('button, .copy_code, .code-copy, .codeblock-header, .code_block_header, .toolbar, .hljs-button')]) el.remove();
    return clone.textContent || '';
}


function extractLikelyHtmlFromText(text) {
    let raw = stripOneCodeFence(decodeHtmlEntities(String(text || '')))
        .replace(/\u00a0/g, ' ')
        .trim();
    if (!raw) return '';

    // 去掉“隐藏代码块/复制”等代码块工具栏文字；有些主题会把它们混进 textContent。
    raw = raw
        .replace(/^(?:隐藏代码块|显示代码块|Hide code|Show code|Copy|Copied|复制|复制代码|代码块|Code)\s*/i, '')
        .trim();

    const startMatch = raw.match(/<\s*(?:toto|div|section|article|details)\b/i);
    if (!startMatch) return '';
    raw = raw.slice(startMatch.index).trim();

    // 如果末尾混入了复制按钮/提示文字，从最后一个可信闭合标签截断。
    const closingTags = ['</toto>', '</details>', '</article>', '</section>', '</div>'];
    let end = -1;
    for (const tag of closingTags) {
        const index = raw.toLowerCase().lastIndexOf(tag);
        if (index >= 0) end = Math.max(end, index + tag.length);
    }
    if (end >= 0) raw = raw.slice(0, end).trim();

    return raw;
}

function isRabbitMirrorDetails(details) {
    if (!details?.querySelector) return false;
    const summary = details.querySelector(':scope > summary') || details.querySelector('summary');
    const title = (summary?.textContent || '').replace(/\s+/g, ' ').trim();
    return /^【兔子镜[:：]/.test(title) || /兔子镜/.test(title);
}

function sanitizeRenderedRabbitMirrorDetailsDom() {
    if (!isCodeBlockRescueModeEnabled()) return;
    const root = getChatRoot();
    if (!root) return;
    const detailsList = [...root.querySelectorAll('toto details, details')].filter(isRabbitMirrorDetails);

    for (const details of detailsList) {
        if (!isInsideChatMessage(details)) continue;

        // 以 summary 为锚点修复：标题已经被渲染成功时，说明外层兔子镜成立；
        // 这时只要把 summary 后面被当成源码显示的 HTML 正文拆回真实 DOM。
        const candidates = [...details.querySelectorAll('pre, code, .hljs, .code_block, .code-block, .codeblock, [class*="codeblock"], [class*="code-block"]')]
            .filter(node => node !== details && !node.closest('summary'))
            .sort((a, b) => (b.querySelectorAll('*').length - a.querySelectorAll('*').length));

        for (const node of candidates) {
            if (!node?.isConnected || !details.contains(node)) continue;
            if (node.querySelector?.('toto, details')) continue;

            const raw = extractLikelyHtmlFromText(getCodeCandidateText(node));
            if (!raw) continue;

            let replacement = null;
            if (TOTO_BLOCK_SINGLE_RE.test(raw)) {
                const cleaned = cleanRabbitMirrorOutput(raw);
                const inner = cleaned
                    .replace(/^\s*<toto\b[^>]*>/i, '')
                    .replace(/<\/toto>\s*$/i, '')
                    .trim();
                replacement = parseHtmlFragment(compactTotoBlock(inner));
            } else if (looksLikeCompleteHtmlBlock(raw)) {
                replacement = parseHtmlFragment(compactTotoBlock(raw));
            }

            if (!replacement) continue;
            const target = findCodeReplaceTarget(node);
            if (target?.isConnected && details.contains(target) && isInsideChatMessage(target) && isCodeShellNode(target)) {
                target.replaceWith(replacement);
                break;
            }
        }
    }
}

function sanitizeCodeBlocksInChatDom() {
    if (!isCodeBlockRescueModeEnabled()) return;
    const root = getChatRoot();
    if (!root) return;
    const candidates = [...new Set([...root.querySelectorAll(CODE_SHELL_SELECTOR)])]
        .filter(node => !node.querySelector?.('pre, code') || node.matches('pre, code, .hljs'));

    for (const node of candidates) {
        if (!node?.isConnected || !isInsideChatMessage(node)) continue;
        const raw = stripOneCodeFence(decodeHtmlEntities(getCodeCandidateText(node)));
        if (!raw) continue;

        let replacement = null;
        const ownerDetails = node.closest('details');
        const insideRabbitMirror = !!node.closest(MIRROR_TOTO_SELECTOR) || !!(ownerDetails && isRabbitMirrorDetails(ownerDetails));

        if (TOTO_BLOCK_SINGLE_RE.test(raw)) {
            const cleaned = cleanRabbitMirrorOutput(raw);
            const match = cleaned.match(TOTO_BLOCK_SINGLE_RE);
            replacement = match ? parseTotoFragment(match[0]) : null;
        } else if (looksLikeCompleteHtmlBlock(raw)) {
            // 已经在兔子镜 details 里面时，只把代码块内容变成真实 HTML，避免再套一层小剧场。
            replacement = insideRabbitMirror
                ? parseHtmlFragment(compactTotoBlock(raw))
                : parseTotoFragment(wrapNakedHtmlAsToto(raw));
        }

        if (!replacement) continue;
        const target = findCodeReplaceTarget(node);
        if (target?.isConnected && isInsideChatMessage(target) && isCodeShellNode(target)) {
            target.replaceWith(replacement);
        }
    }
}

export function triggerInteractionRescue() {
    try {
        // 已经修复过的兔子镜会被会话记忆继续维护；关闭开关只停止处理新消息。
        scopeRabbitMirrorInteractionsInChatDom();
    } catch (error) {
        console.debug('[RabbitMirror] interaction rescue trigger failed:', error);
    }
}

export function triggerCodeBlockRescue(mod = null) {
    try {
        if (isCodeBlockRescueModeEnabled()) {
            sanitizeLatestRawMessages(mod || globalThis);
            sanitizeCodeBlocksInChatDom();
            sanitizeRenderedRabbitMirrorDetailsDom();
        }
        // 两项同时开启时固定为：先恢复真实 DOM，再修交互。
        triggerInteractionRescue();
    } catch (error) {
        console.debug('[RabbitMirror] code block rescue trigger failed:', error);
    }
}

function scheduleSanitize(mod) {
    const run = () => {
        if (isCodeBlockRescueModeEnabled()) {
            // 先修原始消息，避免保存后继续携带代码块壳。
            sanitizeLatestRawMessages(mod);
            // 再只修聊天区内已经渲染出来的代码块，不扫描设置页，避免误伤其他插件 UI。
            sanitizeCodeBlocksInChatDom();
            sanitizeRenderedRabbitMirrorDetailsDom();
        }
        // 交互急救独立受控；若代码块急救也开启，此时 DOM 已恢复完成。
        triggerInteractionRescue();
    };
    setTimeout(run, 80);
    setTimeout(run, 350);
    setTimeout(run, 900);
    setTimeout(run, 1800);
    setTimeout(run, 3200);
}

export async function initOutputSanitizer() {
    try {
        const mod = await import('../../../../../script.js');
        const eventSource = mod?.eventSource;
        const eventTypes = mod?.event_types || {};
        if (eventSource?.on) {
            const events = [
                eventTypes.MESSAGE_RECEIVED,
                eventTypes.GENERATION_ENDED,
                eventTypes.CHAT_CHANGED,
                eventTypes.MESSAGE_SWIPED,
                eventTypes.MESSAGE_UPDATED,
            ].filter(Boolean);
            for (const eventName of events) eventSource.on(eventName, () => scheduleSanitize(mod));
        }

        // 只修聊天消息，但监听要更稳：如果初始化时 #chat 还没挂载，就监听 body 等它出现。
        if (typeof MutationObserver !== 'undefined') {
            const chatRoot = getChatRoot();
            if (chatRoot) {
                const observer = new MutationObserver(() => scheduleSanitize(mod));
                observer.observe(chatRoot, { childList: true, subtree: true });
            } else if (typeof document !== 'undefined' && document.body) {
                const observer = new MutationObserver((mutations) => {
                    if (getChatRoot() || mutations.some(m => [...m.addedNodes].some(n => n?.querySelector?.('#chat, #chat_block, .mes, .mes_text')))) {
                        scheduleSanitize(mod);
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });
            }
        }

        scheduleSanitize(mod);
        console.debug('[RabbitMirror] output sanitizer initialized');
    } catch (error) {
        console.debug('[RabbitMirror] output sanitizer disabled:', error);
    }
}
