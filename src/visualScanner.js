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


function textLengthBucket(len) {
    if (len < 60) return 'short';
    if (len < 180) return 'medium';
    return 'long';
}

function blockFeature(el) {
    const style = (el?.getAttribute?.('style') || '').toLowerCase();
    const text = (el?.textContent || '').replace(/\s+/g, '').trim();
    return {
        tag: el?.tagName || '',
        hasBg: /background(?:-color)?\s*:/.test(style),
        hasBorder: /border\s*:/.test(style) || /border-left\s*:/.test(style),
        hasRadius: /border-radius\s*:/.test(style),
        hasShadow: /box-shadow\s*:/.test(style),
        hasPadding: /padding\s*:/.test(style),
        hasHeading: !!el?.querySelector?.('h1,h2,h3,h4,strong,b'),
        childBucket: Math.min(4, el?.children?.length || 0),
        textBucket: textLengthBucket(text.length),
    };
}

function featureSimilarity(a, b) {
    const keys = ['tag', 'hasBg', 'hasBorder', 'hasRadius', 'hasShadow', 'hasPadding', 'hasHeading', 'childBucket', 'textBucket'];
    let same = 0;
    for (const key of keys) {
        if (a?.[key] === b?.[key]) same += 1;
    }
    return same / keys.length;
}

function getBlockCandidates(root) {
    if (!root?.querySelectorAll) return [];
    return [...root.querySelectorAll('div, section, article, li')]
        .filter(el => {
            const text = (el.textContent || '').replace(/\s+/g, '').trim();
            if (text.length < 24) return false;
            const style = (el.getAttribute('style') || '').toLowerCase();
            const hasBoxSignal = /border\s*:|border-left\s*:|border-radius\s*:|background(?:-color)?\s*:|box-shadow\s*:|padding\s*:/.test(style);
            return hasBoxSignal;
        })
        .slice(0, 80);
}

function detectSameBlockStack(root, html = '') {
    const candidates = getBlockCandidates(root);
    if (candidates.length < 3) return false;
    const features = candidates.map(blockFeature);
    let similarPairs = 0;
    let totalPairs = 0;
    for (let i = 0; i < features.length; i += 1) {
        for (let j = i + 1; j < features.length; j += 1) {
            totalPairs += 1;
            if (featureSimilarity(features[i], features[j]) >= 0.72) similarPairs += 1;
        }
    }
    const similarRatio = totalPairs ? similarPairs / totalPairs : 0;
    const htmlText = String(html || '').toLowerCase();
    const verticalStackSignal = /flex-direction\s*:\s*column|gap\s*:|margin-bottom\s*:|<h[1-4]\b/i.test(htmlText);
    const repeatedBoxSignal = count(/border-radius\s*:/gi, htmlText) >= 3 || count(/border\s*:/gi, htmlText) >= 3 || count(/background(?:-color)?\s*:/gi, htmlText) >= 4;
    return candidates.length >= 4 && repeatedBoxSignal && (verticalStackSignal || similarRatio >= 0.55) && similarRatio >= 0.38;
}

function candidateSimilarityRatio(candidates = []) {
    if (!Array.isArray(candidates) || candidates.length < 2) return 0;
    const features = candidates.map(blockFeature);
    let similarPairs = 0;
    let totalPairs = 0;
    for (let i = 0; i < features.length; i += 1) {
        for (let j = i + 1; j < features.length; j += 1) {
            totalPairs += 1;
            if (featureSimilarity(features[i], features[j]) >= 0.68) similarPairs += 1;
        }
    }
    return totalPairs ? similarPairs / totalPairs : 0;
}

function detectSameGridCardRisk(root, html = '') {
    const text = String(html || '').toLowerCase();
    const gridSignal = /display\s*:\s*grid|grid-template|grid-template-columns|repeat\s*\(/i.test(text);
    if (!gridSignal) return false;
    const candidates = getBlockCandidates(root);
    if (candidates.length < 4) return false;
    const ratio = candidateSimilarityRatio(candidates);
    const boxSignals = count(/border\s*:/gi, text) + count(/border-radius\s*:/gi, text) + count(/background(?:-color)?\s*:/gi, text);
    return ratio >= 0.30 && boxSignals >= 8;
}

function detectCatalogPageRisk(root, html = '', plain = '') {
    const text = `${html || ''}\n${plain || ''}`;
    const catalogSignal = /图鉴|目录|标本|物件|编号|条目|清单|列表|收藏|catalog|index|specimen|item|collection/i.test(text);
    if (!catalogSignal) return false;
    const candidates = getBlockCandidates(root);
    const gridSignal = /display\s*:\s*grid|grid-template|grid-template-columns|repeat\s*\(/i.test(String(html || ''));
    return candidates.length >= 4 && (gridSignal || candidateSimilarityRatio(candidates) >= 0.30);
}

function detectVisualPromiseWithoutMechanism(html = '', plain = '') {
    const text = `${html || ''}\n${plain || ''}`;
    const promisesMotion = /运动|变化|推进|实时|动态|连续|滚动|轮播|闪烁|流动|播放|抽取中|倒计时|漂浮|旋转|震动|呼吸|脉冲|弹幕/i.test(text);
    if (!promisesMotion) return false;
    const hasMechanism = /animation\s*:|@keyframes|transition\s*:|transform\s*:|<svg\b|<animate\b|<marquee\b|stroke-dasharray|offset-path/i.test(String(html || ''));
    return !hasMechanism;
}


function detectInteractionMissing(html = '', plain = '') {
    const text = String(html || '');
    const innerDetails = count(/<details\b/gi, text) >= 2; // outer details + at least one internal details
    const checkboxControl = /<input\b[^>]*type=["']?checkbox|<label\b[^>]*for=/i.test(text);
    const cssFeedback = /:hover|:active|:checked|transition\s*:|cursor\s*:\s*pointer/i.test(text);
    const stateWords = /展开|切换|隐藏|点击|选择|滑动|开关|tab|toggle|解锁|探索|查看/i.test(`${html || ''}\n${plain || ''}`);
    const longEnoughToNeedInteraction = String(plain || '').length > 420;
    return longEnoughToNeedInteraction && !(innerDetails || checkboxControl || cssFeedback || stateWords);
}

function detectWeakSpatialComplexity(html = '', plain = '') {
    const text = String(html || '');
    const spatialSignals = count(/position\s*:\s*absolute|display\s*:\s*grid|grid-template|grid-area|transform\s*:|clip-path\s*:|mask\s*:|z-index\s*:|<svg\b|<path\b|radial-gradient|conic-gradient|repeating-gradient|aspect-ratio/gi, text);
    const visualSignals = count(/box-shadow\s*:|linear-gradient|radial-gradient|filter\s*:|backdrop-filter|clip-path|mask\s*:|transform\s*:|<svg\b/gi, text);
    const textHeavy = String(plain || '').length > 520;
    return textHeavy && spatialSignals < 2 && visualSignals < 3;
}

function detectFlatVerticalFlow(html = '', root = null) {
    const text = String(html || '');
    const columnSignals = count(/flex-direction\s*:\s*column|margin-bottom\s*:|<br\s*\/?>(?![^<]*<svg)|<li\b/gi, text);
    const divs = count(/<div\b/gi, text);
    const absolute = /position\s*:\s*absolute|display\s*:\s*grid|grid-template|clip-path\s*:|mask\s*:|<svg\b/i.test(text);
    const candidates = root ? getBlockCandidates(root) : [];
    const ratio = candidateSimilarityRatio(candidates);
    return divs >= 8 && columnSignals >= 2 && !absolute && (candidates.length >= 3 || ratio >= 0.25);
}

function detectRepeatedUnitShape(root, html = '') {
    const candidates = root ? getBlockCandidates(root) : [];
    if (candidates.length < 3) return false;
    const ratio = candidateSimilarityRatio(candidates);
    const text = String(html || '');
    const repeatedVisualProps = count(/border-radius\s*:|padding\s*:|background(?:-color)?\s*:|border\s*:/gi, text);
    return ratio >= 0.42 && repeatedVisualProps >= 8;
}


function detectRiskFlags({ root, html, plain, dom, repeated, spatialSignalCount }) {
    const flags = [];
    const sameBlockStack = detectSameBlockStack(root, html);
    const sameGridCard = detectSameGridCardRisk(root, html);
    const catalogPage = detectCatalogPageRisk(root, html, plain);

    const flatVerticalFlow = detectFlatVerticalFlow(html, root);
    const repeatedUnitShape = detectRepeatedUnitShape(root, html);
    const weakSpatialComplexity = detectWeakSpatialComplexity(html, plain);
    const interactionMissing = detectInteractionMissing(html, plain);

    if (sameBlockStack) flags.push('same_block_stack');
    if (sameGridCard) flags.push('same_grid_card_risk');
    if (catalogPage) flags.push('catalog_page_risk');
    if (flatVerticalFlow) flags.push('flat_vertical_flow');
    if (repeatedUnitShape) flags.push('repeated_unit_shape');

    if (sameBlockStack || sameGridCard || catalogPage || flatVerticalFlow || repeatedUnitShape || (dom?.maxSimilarRun || 0) >= 3 || (repeated?.maxRepeat || 0) >= 4) flags.push('info_page_degrade');
    if (spatialSignalCount < 2 && String(plain || '').length > 520 && (sameBlockStack || sameGridCard || catalogPage || repeatedUnitShape || (repeated?.maxRepeat || 0) >= 3)) flags.push('weak_media_body');
    if (weakSpatialComplexity) flags.push('weak_spatial_complexity');
    if (interactionMissing) flags.push('missing_interaction');
    if (detectVisualPromiseWithoutMechanism(html, plain)) flags.push('visual_promise_unfulfilled');
    return [...new Set(flags)];
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

function detectContrastFamily(html) {
    const values = extractBackgroundValues(html);
    const luminances = values.map(colorValueLuminance).filter(v => typeof v === 'number' && !Number.isNaN(v));
    if (!luminances.length) return 'contrast: mixed_or_unspecified';
    const first = luminances[0];
    if (first < 90) return 'contrast: dark_weighted';
    if (first > 190) return 'contrast: light_weighted';
    return 'contrast: mid_tone_or_mixed';
}

function detectSurfaceFamily(html, plain = '') {
    const text = `${html || ''}\n${plain || ''}`.toLowerCase();
    const base = detectBaseColor(html);
    if (/纸|信笺|便签|票据|菜单|说明书|羊皮纸|报纸|签文|paper|newspaper|ticket|menu|manual|letter/i.test(text)) return 'surface: paper_or_document_surface';
    if (/玻璃|磨砂|透明|backdrop-filter|blur\(|rgba\([^)]*0\.[0-9]/i.test(text)) return 'surface: glass_or_translucent_surface';
    if (/金属|铁|铜|钢|铝|metal|chrome|silver|bronze/i.test(text)) return 'surface: metallic_or_hard_surface';
    if (/木|布|织物|陶瓷|皮革|石|wood|fabric|ceramic|leather|stone/i.test(text)) return 'surface: physical_material_surface';
    if (/radial-gradient|conic-gradient|linear-gradient|repeating-gradient/i.test(text)) return 'surface: gradient_or_light_surface';
    if (/暗色|黑|夜|neon|霓虹|glow|发光|console|screen|屏幕|控制台|监控/i.test(text) || base.includes('暗色')) return 'surface: digital_dark_surface';
    if (base.includes('浅色')) return 'surface: light_plain_surface';
    return 'surface: mixed_or_unspecified_surface';
}

function detectContourFamily(html, dom) {
    const text = String(html || '');
    if (/clip-path\s*:|polygon\(|path\(|<svg\b|mask\s*:/i.test(text)) return 'contour: cutout_or_irregular_shape';
    if (/border-radius\s*:\s*50%|border-radius\s*:\s*999/i.test(text)) return 'contour: circular_or_pill_shape';
    if (count(/border-radius\s*:/gi, text) >= 4 && count(/<div\b/gi, text) >= 8) return 'contour: rounded_panel_cluster';
    if ((dom?.maxSimilarRun || 0) >= 2) return 'contour: repeated_rectangular_blocks';
    if (/position\s*:\s*absolute|transform\s*:/i.test(text)) return 'contour: layered_freeform_overlay';
    return 'contour: simple_or_mixed_outline';
}

function detectSpaceFamily(html, spatialSignalCount) {
    const text = String(html || '');
    if (spatialSignalCount >= 4) return 'space: layered_depth_or_spatial_scene';
    if (/display\s*:\s*grid|grid-template/i.test(text)) return 'space: grid_plane';
    if (/display\s*:\s*flex/i.test(text)) return 'space: flex_plane';
    if (spatialSignalCount >= 2) return 'space: shallow_layered_surface';
    return 'space: flat_content_surface';
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
        `surface_family: ${detectSurfaceFamily(html, plain)}`,
        `contrast_family: ${detectContrastFamily(html)}`,
        `contour_family: ${detectContourFamily(html, metrics.dom)}`,
        `reading_family: ${detectReadingPath(html, metrics.spatialSignalCount)}`,
        `unit_family: ${detectInfoUnit(html, metrics.dom, metrics.repeated)}`,
        `space_family: ${detectSpaceFamily(html, metrics.spatialSignalCount)}`,
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
    const root = parseToto(html);
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
    const riskFlags = detectRiskFlags({ root, html, plain, dom, repeated, spatialSignalCount });
    if (riskFlags.includes('same_block_stack')) structural.push('同构信息块堆叠风险');
    if (riskFlags.includes('same_grid_card_risk')) structural.push('同构网格信息块风险');
    if (riskFlags.includes('catalog_page_risk')) structural.push('图鉴/目录式承载风险');
    if (riskFlags.includes('flat_vertical_flow')) structural.push('单向纵向阅读路径风险');
    if (riskFlags.includes('repeated_unit_shape')) structural.push('重复内容单元形状风险');
    if (riskFlags.includes('info_page_degrade')) structural.push('信息页降级风险');
    if (riskFlags.includes('weak_media_body')) structural.push('媒介本体偏弱风险');
    if (riskFlags.includes('weak_spatial_complexity')) structural.push('空间复杂度偏弱风险');
    if (riskFlags.includes('missing_interaction')) structural.push('内部交互入口偏弱风险');
    if (riskFlags.includes('visual_promise_unfulfilled')) structural.push('视觉承诺未兑现风险');
    structural.push(...dom.summaryFlags);

    const mediaStrength = (/clip-path|mask|<svg\b|<path\b|position\s*:\s*absolute|transform\s*:|border-radius\s*:\s*50%|aspect-ratio|radial-gradient|conic-gradient/i.test(html) && tagCount >= 35)
        ? '媒介轮廓中强'
        : (tagCount >= 40 ? '媒介轮廓中等' : '媒介轮廓弱');
    const summary = [mediaStrength, ...structural.slice(0, 6), textDensity, ...effects]
        .filter(Boolean)
        .join('；');
    const skeleton = buildVisualSkeleton(html, plain, { dom, repeated, spatialSignalCount });
    return { signature: summary.slice(0, 280), skeleton: skeleton.slice(0, 360), riskFlags };
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
    const riskFlags = Array.isArray(result?.riskFlags) ? result.riskFlags : [];
    if (signature || skeleton || riskFlags.length) {
        updateLatestVisualSignature(signature, skeleton, riskFlags);
        console.debug('[RabbitHole] visual signature:', signature, skeleton, riskFlags);
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
