import { updateLatestVisualSignature } from './storage.js';

const TOTO_RE = /<toto\b[^>]*data-rabbit-hole=["']true["'][^>]*>[\s\S]*?<\/toto>/i;
let lastScannedHash = '';

function hashText(text) {
    let hash = 0;
    const input = String(text || '');
    for (let i = 0; i < input.length; i += 1) {
        hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
    }
    return String(hash);
}

function stripTags(html) {
    return String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function count(re, text) {
    return (String(text || '').match(re) || []).length;
}

function extractStyleFingerprints(html) {
    const styles = [...String(html || '').matchAll(/<([a-z0-9-]+)\b[^>]*\sstyle=["']([^"']+)["'][^>]*>/gi)];
    const normalized = styles.map(match => {
        const tag = match[1].toLowerCase();
        const props = match[2]
            .toLowerCase()
            .split(';')
            .map(part => part.trim().split(':')[0])
            .filter(Boolean)
            .sort()
            .join('|');
        return `${tag}:${props}`;
    }).filter(Boolean);
    const buckets = new Map();
    for (const item of normalized) buckets.set(item, (buckets.get(item) || 0) + 1);
    const repeated = [...buckets.values()].filter(v => v >= 3).length;
    const maxRepeat = Math.max(0, ...buckets.values());
    return { repeated, maxRepeat };
}

function parseToto(html) {
    try {
        if (typeof DOMParser === 'undefined') return null;
        const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
        return doc.querySelector('toto[data-rabbit-hole="true"]') || doc.querySelector('toto');
    } catch {
        return null;
    }
}

function elementDepth(el) {
    if (!el || !el.children || !el.children.length) return 0;
    return 1 + Math.max(...[...el.children].map(child => elementDepth(child)));
}

function stylePropSet(el) {
    const style = (el?.getAttribute?.('style') || '').toLowerCase();
    return new Set(style.split(';').map(part => part.trim().split(':')[0]).filter(Boolean));
}

function setOverlapRatio(a, b) {
    if (!a.size && !b.size) return 1;
    let hit = 0;
    for (const item of a) if (b.has(item)) hit += 1;
    return hit / Math.max(1, Math.min(a.size, b.size));
}

function areSimilarBlocks(a, b) {
    if (!a || !b || a.nodeType !== 1 || b.nodeType !== 1) return false;
    const tagClose = a.tagName === b.tagName;
    const childClose = Math.abs(a.children.length - b.children.length) <= 1;
    const depthClose = Math.abs(elementDepth(a) - elementDepth(b)) <= 1;
    const styleClose = setOverlapRatio(stylePropSet(a), stylePropSet(b)) >= 0.45;
    const textA = (a.textContent || '').trim().length;
    const textB = (b.textContent || '').trim().length;
    const textClose = Math.abs(textA - textB) <= Math.max(60, Math.max(textA, textB) * 0.45);
    return tagClose && childClose && depthClose && (styleClose || textClose);
}

function analyzeDomStructure(html) {
    const toto = parseToto(html);
    if (!toto) return { maxSimilarRun: 0, summaryLength: 0, summaryFlags: [] };
    const summary = toto.querySelector('summary');
    const summaryLength = (summary?.textContent || '').replace(/\s+/g, '').length;
    const summaryFlags = [];
    if (summaryLength > 80) summaryFlags.push('summary疑似伪装正文承载区');
    else if (summaryLength > 60) summaryFlags.push('summary标题栏冗长');
    else if (summaryLength > 40) summaryFlags.push('summary标题偏长');

    let maxSimilarRun = 0;
    const containers = [toto, ...[...toto.querySelectorAll('details, div, section, article, main')].slice(0, 80)];
    for (const container of containers) {
        const children = [...container.children].filter(el => !['SUMMARY', 'STYLE', 'SCRIPT'].includes(el.tagName));
        let run = 1;
        for (let i = 1; i < children.length; i += 1) {
            if (areSimilarBlocks(children[i - 1], children[i])) {
                run += 1;
                maxSimilarRun = Math.max(maxSimilarRun, run);
            } else {
                run = 1;
            }
        }
    }
    return { maxSimilarRun, summaryLength, summaryFlags };
}



function expandHexColor(hex) {
    const raw = String(hex || '').replace('#', '').trim();
    if (/^[0-9a-f]{3}$/i.test(raw)) {
        return raw.split('').map(x => x + x).join('');
    }
    if (/^[0-9a-f]{6}$/i.test(raw)) return raw;
    return '';
}

function luminanceFromRgb(r, g, b) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function colorValueLuminance(value) {
    const v = String(value || '').toLowerCase();
    if (/\bblack\b/.test(v)) return 0;
    if (/\bwhite\b/.test(v)) return 255;
    const rgba = v.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9.]+))?\s*\)/);
    if (rgba) {
        const alpha = rgba[4] === undefined ? 1 : Number(rgba[4]);
        if (!Number.isNaN(alpha) && alpha < 0.25) return null;
        return luminanceFromRgb(Number(rgba[1]), Number(rgba[2]), Number(rgba[3]));
    }
    const hexes = [...v.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6})\b/gi)]
        .map(m => expandHexColor(m[1]))
        .filter(Boolean);
    if (hexes.length) {
        const values = hexes.map(hex => {
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            return luminanceFromRgb(r, g, b);
        });
        // For gradients, average the first two stops; for flat color, use the first.
        const sample = values.slice(0, Math.min(2, values.length));
        return sample.reduce((a, b) => a + b, 0) / sample.length;
    }
    return null;
}

function extractBackgroundValues(html) {
    const values = [];
    const input = String(html || '');
    const re = /background(?:-color)?\s*:\s*([^;"']+)/gi;
    let match;
    while ((match = re.exec(input))) {
        const value = String(match[1] || '').trim();
        if (value) values.push(value);
    }
    return values;
}

function detectBaseColor(html) {
    const values = extractBackgroundValues(html);
    const luminances = values.map(colorValueLuminance).filter(v => typeof v === 'number' && !Number.isNaN(v));

    // The first explicit background usually belongs to the main container. Give it priority
    // so a dark outer shell cannot be mislabelled as white because of light inner cards.
    if (luminances.length) {
        const first = luminances[0];
        if (first < 90) return '暗色高对比底盘';
        if (first > 190) return '浅色纸面/白底底盘';
        const darkCount = luminances.filter(v => v < 90).length;
        const lightCount = luminances.filter(v => v > 190).length;
        if (darkCount > lightCount) return '暗色高对比底盘';
        if (lightCount > darkCount) return '浅色纸面/白底底盘';
    }

    if (/radial-gradient|conic-gradient|linear-gradient/i.test(html)) return '渐变/混合色底盘';
    return '中性或混合底盘';
}

function detectLayout(html, dom, spatialSignalCount) {
    const text = String(html || '');
    const grid = /display\s*:\s*grid|grid-template|grid-area/i.test(text);
    const flexColumn = /display\s*:\s*flex;[^"']*flex-direction\s*:\s*column/i.test(text);
    const flexRow = /display\s*:\s*flex/i.test(text) && !flexColumn;
    const absolute = /position\s*:\s*absolute/i.test(text);
    const summary = /<summary\b/i.test(text);
    if (absolute && spatialSignalCount >= 4) return '空间锚点/浮层式布局';
    if (grid) return '网格分区布局';
    if (summary && (dom?.maxSimilarRun || 0) >= 2) return '顶部折叠标题栏 + 多区块堆叠布局';
    if (flexColumn || count(/<div\b/gi, text) >= 10) return '纵向分组堆叠布局';
    if (flexRow) return '横向并列/分栏布局';
    return '自由排版布局';
}

function detectReadingPath(html, spatialSignalCount) {
    const text = String(html || '');
    if (/timeline|left\s*:\s*\d+%|top\s*:\s*\d+%|position\s*:\s*absolute/i.test(text) && spatialSignalCount >= 3) return '按视觉锚点跳读';
    if (/display\s*:\s*grid|grid-template/i.test(text)) return '按网格分区扫描';
    if (/flex-direction\s*:\s*column|<ul\b|<li\b/i.test(text)) return '自上而下分段扫描';
    return '中心内容向外扩散阅读';
}

function detectInfoUnit(html, dom, repeated) {
    const text = String(html || '');
    if (/<table\b|display\s*:\s*table/i.test(text)) return '表格/清单单元';
    if (/position\s*:\s*absolute/i.test(text) && count(/<span\b/gi, text) >= 5) return '浮动碎片/弹幕单元';
    if ((dom?.maxSimilarRun || 0) >= 2 || (repeated?.maxRepeat || 0) >= 3) return '矩形信息块/卡片化条目';
    if (/<li\b/i.test(text)) return '列表条目单元';
    return '段落与装饰节点混合单元';
}

function detectMood(html, plain) {
    const text = `${html || ''}\n${plain || ''}`.toLowerCase();
    const hasArchive = /档案|记录|备忘|日志|检索|搜索|警告|通报|报告|情报|archive|log|memo|record|warning/i.test(text);
    const hasControl = /监控|后台|控制台|直播|弹幕|播放|录像|screen|console|control|live|video/i.test(text);
    const hasPaper = /报纸|新闻|信笺|便签|票据|菜单|说明书|纸|paper|newspaper|menu|ticket|manual/i.test(text);
    const hasNeon = /neon|霓虹|glow|发光|box-shadow|filter\s*:\s*drop-shadow|高饱和/i.test(text);
    if (hasArchive && hasControl) return '档案/后台/监控混合气质';
    if (hasArchive) return '档案/记录/警告气质';
    if (hasControl) return '监控/直播/控制台气质';
    if (hasPaper) return '纸面/印刷物气质';
    if (hasNeon) return '霓虹/发光/电子气质';
    if (/wood|木|铜|金属|玻璃|磨砂|羊皮纸|陶瓷|织物|布/i.test(text)) return '明确材质化媒介气质';
    return '综合情绪化 UI 气质';
}

function buildVisualSkeleton(html, plain, metrics) {
    return [
        `base_color: ${detectBaseColor(html)}`,
        `layout: ${detectLayout(html, metrics.dom, metrics.spatialSignalCount)}`,
        `reading_path: ${detectReadingPath(html, metrics.spatialSignalCount)}`,
        `info_unit: ${detectInfoUnit(html, metrics.dom, metrics.repeated)}`,
        `mood: ${detectMood(html, plain)}`,
    ].join('；');
}

function detectGlobalCssRisk(html) {
    const styles = [...String(html || '').matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n');
    if (!styles) return false;
    return /(^|[}\s,])(html|body|:root|\*|\.mes|\.message|\.chat|\.content|\.ts-message-container|#chat|#send_form)\s*[{,]/i.test(styles);
}

export function scanRabbitHoleHtml(messageHtml) {
    const match = String(messageHtml || '').match(TOTO_RE);
    if (!match) return { signature: '', skeleton: '' };
    const html = match[0];
    const plain = stripTags(html);
    const tagCount = count(/<\w+\b/g, html);
    const divCount = count(/<div\b/gi, html);
    const repeated = extractStyleFingerprints(html);
    const dom = analyzeDomStructure(html);
    const textDensity = plain.length > 900 && tagCount < 65 ? '文本密度过高' : plain.length > 520 ? '文本密度中高' : '文本密度适中';

    const spatialSignalCount = count(/position\s*:\s*absolute|grid-area\s*:|grid-template|display\s*:\s*grid|transform\s*:|clip-path\s*:|mask\s*:|z-index\s*:|<svg\b|<path\b|radial-gradient|conic-gradient|repeating-gradient|aspect-ratio/gi, html);
    const effects = [];
    if (/animation\s*:|@keyframes|<marquee\b|<animate\b/i.test(html)) effects.push('动态效果有');
    else effects.push('动态效果无');
    if (/linear-gradient|radial-gradient|conic-gradient|box-shadow|filter\s*:|backdrop-filter|mix-blend-mode|mask|clip-path/i.test(html)) effects.push('高级CSS有');
    else effects.push('高级CSS弱');
    if (spatialSignalCount >= 4) effects.push('空间构造信号强');
    else if (spatialSignalCount >= 2) effects.push('空间构造信号中');
    else effects.push('空间构造信号弱');

    const structural = [];
    if (dom.maxSimilarRun >= 3) structural.push('连续同构兄弟区块明显/卡片化倾向高');
    else if (dom.maxSimilarRun >= 2) structural.push('存在连续同构兄弟区块');
    if (repeated.maxRepeat >= 4 || repeated.repeated >= 2) structural.push('存在重复同构内容块/卡片化倾向高');
    else if (repeated.maxRepeat >= 3) structural.push('存在重复同构内容块');
    if (/display\s*:\s*flex;[^"']*flex-direction\s*:\s*column/i.test(html) && divCount >= 10) structural.push('纵向分组结构明显');
    if (spatialSignalCount < 2 && plain.length > 520 && (dom.maxSimilarRun >= 2 || repeated.maxRepeat >= 3 || divCount >= 10)) structural.push('主要依赖纵向文本流/媒介轮廓偏弱');
    if (count(/border-radius\s*:/gi, html) >= 4 && count(/padding\s*:/gi, html) >= 6) structural.push('圆角容器密集');
    if (count(/<!--/g, html) > 0) structural.push('HTML注释残留');
    if (/<pre\b|<code\b|```/i.test(html)) structural.push('代码块风险');
    if (detectGlobalCssRisk(html)) structural.push('全局CSS污染风险');
    structural.push(...dom.summaryFlags);

    const mediaStrength = (/clip-path|mask|<svg\b|<path\b|position\s*:\s*absolute|transform\s*:|border-radius\s*:\s*50%|aspect-ratio|radial-gradient|conic-gradient/i.test(html) && tagCount >= 35)
        ? '媒介轮廓中强'
        : (tagCount >= 40 ? '媒介轮廓中等' : '媒介轮廓弱');
    const summary = [mediaStrength, ...structural.slice(0, 6), textDensity, ...effects]
        .filter(Boolean)
        .join('；');
    const skeleton = buildVisualSkeleton(html, plain, { dom, repeated, spatialSignalCount });
    return { signature: summary.slice(0, 280), skeleton: skeleton.slice(0, 360) };
}

async function scanLatestAssistantMessage(mod) {
    const chat = mod?.chat || globalThis.chat;
    if (!Array.isArray(chat) || !chat.length) return;
    const recent = chat.slice(-4).reverse();
    const message = recent.find(item => !item?.is_user && typeof item?.mes === 'string' && TOTO_RE.test(item.mes));
    if (!message) return;
    const sigHash = hashText(message.mes);
    if (sigHash === lastScannedHash) return;
    lastScannedHash = sigHash;
    const result = scanRabbitHoleHtml(message.mes);
    const signature = result?.signature || '';
    const skeleton = result?.skeleton || '';
    if (signature || skeleton) {
        updateLatestVisualSignature(signature, skeleton);
        console.debug('[RabbitHole] visual signature:', signature, skeleton);
    }
}

export async function initVisualScanner() {
    try {
        const mod = await import('../../../../../script.js');
        const eventSource = mod?.eventSource;
        const eventTypes = mod?.event_types || {};
        if (!eventSource?.on) return;
        const scheduleScan = () => {
            setTimeout(() => scanLatestAssistantMessage(mod), 600);
            setTimeout(() => scanLatestAssistantMessage(mod), 1800);
        };
        const events = [eventTypes.MESSAGE_RECEIVED, eventTypes.GENERATION_ENDED, eventTypes.CHAT_CHANGED].filter(Boolean);
        for (const eventName of events) eventSource.on(eventName, scheduleScan);
        console.debug('[RabbitHole] visual scanner initialized');
    } catch (error) {
        console.debug('[RabbitHole] visual scanner disabled:', error);
    }
}
