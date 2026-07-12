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


const MIRROR_TOTO_SELECTOR = 'toto[data-rabbit-mirror="true"], toto[data-rabbit-hole="true"]';
let interactionScopeCounter = 0;
const interactionScopeStates = new WeakMap();
const SCOPED_INTERACTION_ID_RE = /^(rm-[a-z0-9]+-[a-z0-9]+-[a-z0-9]{5}-)(.+)$/i;

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
            .replace(new RegExp(`#${escaped}(?![\\w-])`, 'g'), `#${newId}`)
            .replace(new RegExp(`url\\(\\s*(["']?)#${escaped}\\1\\s*\\)`, 'g'), `url(#${newId})`);
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
            input.checked = true;
        } else {
            input.checked = !input.checked;
        }

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
    strengthenRabbitMirrorCheckedStateCss(toto);
    toto.dataset.rabbitMirrorInteractionScoped = 'true';
    installInteractionLabelFallback(toto);
}

function scopeRabbitMirrorInteractionsInChatDom() {
    const root = getChatRoot();
    if (!root) return;
    root.querySelectorAll(MIRROR_TOTO_SELECTOR).forEach(toto => {
        if (isInsideChatMessage(toto)) scopeRabbitMirrorInteractionIds(toto);
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

export function triggerCodeBlockRescue(mod = null) {
    try {
        scopeRabbitMirrorInteractionsInChatDom();
        if (!isCodeBlockRescueModeEnabled()) return;
        sanitizeLatestRawMessages(mod || globalThis);
        sanitizeCodeBlocksInChatDom();
        sanitizeRenderedRabbitMirrorDetailsDom();
        scopeRabbitMirrorInteractionsInChatDom();
    } catch (error) {
        console.debug('[RabbitMirror] code block rescue trigger failed:', error);
    }
}

function scheduleSanitize(mod) {
    const run = () => {
        // 交互作用域修复与代码块急救解耦：无论急救是否开启，都只在当前兔子镜内部
        // 同步处理 id / for / radio name / CSS 引用，不改背景、布局或普通 class。
        scopeRabbitMirrorInteractionsInChatDom();
        if (!isCodeBlockRescueModeEnabled()) return;
        // 先修原始消息，避免保存后继续携带代码块壳。
        sanitizeLatestRawMessages(mod);
        // 再只修聊天区内已经渲染出来的代码块，不扫描设置页，避免误伤其他插件 UI。
        sanitizeCodeBlocksInChatDom();
        sanitizeRenderedRabbitMirrorDetailsDom();
        scopeRabbitMirrorInteractionsInChatDom();
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
