import { TAROT_IMAGE_RULES } from '../data/raw/tarotImageRules.js';
import { VISUAL_SCENERY_RULES } from '../data/raw/visualSceneryRules.js';
import { RUNTIME_LANGUAGE_RULES } from '../data/raw/runtimeLanguageRules.js';
import { RAW_EXECUTION_RULES } from '../data/raw/rawExecutionRules.js';
import { pickCombination } from './picker.js';
import { getComboHistory, getLastCombo, getRecentRiskFlags, getRecentRiskFlagCounts } from './storage.js';

function asText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function truncate(text, max = 220) {
    const raw = asText(text);
    if (!raw || raw.length <= max) return raw;
    return `${raw.slice(0, Math.max(20, max - 1)).trim()}…`;
}

function compactItemLine(item, kind) {
    const id = item?.id || '?';
    const title = item?.title || '未命名';
    const tags = Array.isArray(item?.tags) && item.tags.length ? `；tags: ${item.tags.slice(0, 4).join(',')}` : '';
    const summary = item?.summary || item?.raw || '';
    const note = kind === 'presentation'
        ? '；执行：让该展现形式决定 DOM/CSS 轮廓、空间结构、交互方式和文字寄生位置。'
        : '；执行：自然融入本轮剧情气味，不要关键词拼贴。';
    return `- 【${id} ${title}】${summary ? `：${truncate(summary, 170)}` : ''}${tags}${note}`;
}

function formatItemsCompact(items, kind) {
    if (!Array.isArray(items) || !items.length) return '- 无';
    return items.map(item => compactItemLine(item, kind)).join('\n');
}

function signatureOf(combo) {
    return JSON.stringify({
        themeIds: combo?.themeIds || [],
        formatIds: combo?.formatIds || [],
        samplingMode: combo?.samplingMode || 'classic',
        forcedVisualScenery: !!combo?.forcedVisualScenery,
    });
}

function samplingModeLabel(combo, settings) {
    const mode = combo?.samplingMode || settings?.samplingMode || 'classic';
    return mode === 'format_only' ? '仅展现形式' : '主题元素 + 展现形式';
}

function hasVisualScenery(combo) {
    return combo?.formats?.some(item => item.id === '10.2.2' || String(item.title || '').toLowerCase().includes('visual scenery'));
}

function isTarotRelated(combo) {
    const keywords = ['塔罗', '牌阵', '占卜', '神秘学', 'tarot'];
    const text = [
        ...(combo?.themes || []),
        ...(combo?.formats || []),
    ].map(item => `${item?.id || ''} ${item?.title || ''} ${item?.summary || ''} ${item?.raw || ''} ${(item?.tags || []).join(' ')}`).join('\n').toLowerCase();
    return keywords.some(keyword => text.includes(keyword.toLowerCase()));
}

function shortVisualAvoidance(combo, limit = 3) {
    const history = getComboHistory(limit + 1);
    const currentSig = signatureOf(combo);
    const trimmed = history[history.length - 1]?.signature === currentSig ? history.slice(0, -1) : history;
    const recent = trimmed
        .filter(item => item?.visualSignature || item?.visualSkeleton || (Array.isArray(item?.riskFlags) && item.riskFlags.length))
        .slice(-limit);
    if (!recent.length) return '暂无实际历史；本轮仍需避免低完成度内容流和换皮复用。';
    return recent.map((item, index) => {
        const formats = (item.formatIds || []).join(' + ') || '未记录';
        const riskCount = Array.isArray(item.riskFlags) ? item.riskFlags.length : 0;
        const signature = item.visualSignature ? truncate(item.visualSignature, 110) : '已记录视觉骨架';
        return `${index + 1}. 近期展现形式：${formats}；避让摘要：${signature}${riskCount ? `；结构风险 ${riskCount} 项` : ''}`;
    }).join('\n');
}

function recentRiskCorrection() {
    const flags = getRecentRiskFlags(4);
    const counts = getRecentRiskFlagCounts(4);
    if (!flags.length) return '';
    const lines = [];

    const hasRepeatedStructure = flags.some(flag => [
        'same_block_stack',
        'same_grid_card_risk',
        'catalog_page_risk',
        'info_page_degrade',
        'flat_vertical_flow',
        'repeated_unit_shape',
    ].includes(flag));
    if (hasRepeatedStructure) {
        lines.push('近期真实输出的内容承载骨架或阅读路径过于相似。本轮必须改变主视觉结构、空间组织与内容寄生方式，不得复用相似内容区域的顺序排列。');
    }

    const hasWeakMedia = flags.some(flag => ['weak_media_body', 'weak_spatial_complexity'].includes(flag));
    if (hasWeakMedia) {
        lines.push('近期真实输出的媒介本体偏弱。本轮必须让 DOM/CSS 直接呈现可辨认的媒介轮廓、前中后景层级与视觉锚点，而不是把媒介名只写在标题里。');
    }

    const hasWeakInteraction = flags.some(flag => ['missing_interaction', 'visual_promise_unfulfilled'].includes(flag));
    if (hasWeakInteraction) {
        lines.push('近期真实输出的交互或动态实现偏弱。本轮至少加入一个内部可探索入口或状态变化结构，并让 CSS/SVG/HTML 机制真实承担效果。');
    }

    if ((counts.same_block_stack || 0) >= 2 || (counts.info_page_degrade || 0) >= 2 || (counts.flat_vertical_flow || 0) >= 2) {
        lines.push('连续重复风险偏高。本轮必须显著改变阅读路径，例如改为分层视窗、横向/环形/地图式空间、局部展开、遮罩探索或多焦点跳读。');
    }

    if (!lines.length) return '';
    return `\n真实视觉纠偏【由插件扫描实际 HTML/CSS 后触发，只给抽象方向】:\n${lines.map(x => `  - "${x}"`).join('\n')}`;
}

function coreOutputProtocol() {
    return String.raw`
强制输出:
  - 主回复正文完成后，必须在消息最底部追加一个完整兔子镜小剧场。
  - 固定外壳：<toto data-rabbit-hole="true" style="display:block;"><details><summary>【兔子镜：标题】</summary>内部 HTML</details></toto>
  - 兔子镜必须是最后一个可见模块；禁止解释规则、禁止省略、禁止 Markdown 代码块、禁止 <pre>/<code>/HTML 注释。
  - 禁止 script、iframe、object、embed、form、事件属性；所有标签必须闭合，最终必须以 </toto> 结束。`;
}

function compactCreativeRule(enabled) {
    if (enabled) {
        return String.raw`
发散孵化:
  抽取结果是灵感种子，不是封闭模板；保留核心气味/媒介痕迹/关系逻辑，同时允许扩展库外媒介、材质、空间结构、交互痕迹与外延剧情。发散必须能追溯回本轮抽取结果，禁止跑题。`;
    }
    return String.raw`
经典收敛:
  优先围绕当前抽取结果生成，不延续历史模板，不另起炉灶；允许自然补足，但禁止关键词拼贴、平均堆叠和过度魔改。`;
}

function complexInteractiveCore() {
    return String.raw`
复杂交互视觉核心:
  - 兔子镜必须像复杂精美的微型交互 HTML 媒介作品，而不是低完成度的普通内容摘要。
  - 展现形式必须决定 DOM/CSS 的整体轮廓、空间结构、阅读路径、交互方式和文字寄生位置，不能只写进标题。
  - 必须具备主视觉结构、前中后景层级、视觉锚点、材质质感、排版呼吸感与非单调阅读路径。
  - 除最外层折叠外，内部必须存在至少一处会改变可见层级、阅读路径或界面状态的真实交互机关；文字、台词或线索必须贴附、嵌入或隐藏在交互结构中，不得只是普通展开说明。
  - 交互必须使用无 JS 的原生可操作结构，例如内部 details/summary、横向滚动区、锚点跳转或 checkbox/radio + label 状态切换；禁止依赖 onclick、button 或需要脚本才能生效的伪交互。
  - 可点击元素必须具备明确可操作提示，例如 cursor:pointer、summary list-style:none、label 与 input 的唯一 id/for 绑定；absolute 背景、遮罩、光效、装饰层不得覆盖交互，必要时使用 pointer-events:none，交互层使用 position:relative 与更高 z-index。
  - 鼓励使用 Flex/Grid、absolute 定位、SVG、linear-gradient、box-shadow、filter、clip-path、mask、transform、transition 或轻量 CSS 动效构建空间与质感。
  - 每轮必须形成真实视觉指纹：layout / material / color / type / interaction / hierarchy；与上一轮相比至少四项变化，并真实体现在 DOM/CSS 的结构、材质、配色、字体层级、交互入口与内容组织中。不得只换标题、颜色或局部装饰；若整体骨架、阅读路径或内容承载方式仍近似上一轮，必须重写。`;
}

function htmlSafetyCore() {
    return String.raw`
HTML 直接渲染:
  只输出可直接渲染的 HTML/CSS/SVG/details/summary；优先 inline style；主容器与关键子容器使用 box-sizing:border-box；长文本需自适配屏幕宽度并避免溢出。`;
}

function visualColorTruthRule() {
    return String.raw`
视觉真实:
  明暗、纸面、屏幕、材质等描述必须与实际 CSS background/background-color 一致；不得用文字声明替代真实 CSS。`;
}

function buildPrompt({ combo, settings, selectedThemes, selectedFormats, visualSceneryMode, tarotRulesText, directive }) {
    const chunks = [];
    const mode = combo?.samplingMode || settings?.samplingMode || 'classic';
    chunks.push('<RabbitHoleTheaterAutoInjection>');
    chunks.push(RAW_EXECUTION_RULES);
    chunks.push(String.raw`
本轮抽取模式: ${samplingModeLabel(combo, settings)}
本轮主题元素:
${mode === 'format_only' ? '- 未抽取；不得自行补造主题元素。' : selectedThemes}

本轮展现形式:
${selectedFormats}`);
    chunks.push(RUNTIME_LANGUAGE_RULES);
    chunks.push(compactCreativeRule(!!settings.creativeExpansionMode));
    chunks.push(complexInteractiveCore());
    chunks.push(visualColorTruthRule());

    if (settings.userDirectivePriority && directive) {
        chunks.push(String.raw`
用户点播优先:
  最后一条用户输入已匹配到兔子镜点播条目；点播优先，未指定部分由插件随机补足。兔子镜不得抢占、稀释或改写主回复正文。`);
    }

    if (settings.uiAudit) {
        chunks.push(String.raw`
UI 自查短版:
  输出前检查：媒介本体是否靠 DOM/CSS 成立、是否有空间层级/视觉锚点/质感、是否有内部交互入口、是否退化为普通纵向内容流。失败则重写。`);
    }

    if (settings.avoidRepeat) {
        chunks.push(String.raw`
近期视觉避让:
${shortVisualAvoidance(combo, 3)}${recentRiskCorrection()}`);
    }

    if (visualSceneryMode) {
        chunks.push(String.raw`
动态渐变模式:
  允许使用纯 CSS/SVG 构建风景化、光影化、流动渐变或环境动态效果；必须服务本轮展现形式，不得为了动而动。`);
        chunks.push(VISUAL_SCENERY_RULES);
    }

    if (tarotRulesText) chunks.push(tarotRulesText);
    chunks.push(htmlSafetyCore());
    chunks.push(String.raw`
最终保底:
  先完整生成主回复正文；正文结束后必须继续生成兔子镜。先保证 <toto> 出现，再追求复杂度。不要解释规则，直接输出最终内容。`);
    chunks.push('</RabbitHoleTheaterAutoInjection>');
    return chunks.filter(Boolean).join('\n\n').trim();
}

export function buildRabbitHolePrompt(settings, generationType = 'normal') {
    if (!settings?.enabled || !settings?.autoRabbitHoleInjection || settings?.mode === 'off') return '';
    const { combo, directive, disabled } = pickCombination(settings);
    if (disabled) {
        if (settings.debug) console.debug('[RabbitHole] skipped by user directive');
        return '';
    }

    const selectedThemes = formatItemsCompact(combo.themes, 'theme');
    const selectedFormats = formatItemsCompact(combo.formats, 'presentation');
    const visualSceneryMode = !!(settings.forceVisualScenery || hasVisualScenery(combo));
    const tarotRulesText = isTarotRelated(combo) ? TAROT_IMAGE_RULES : '';
    const prompt = buildPrompt({ combo, settings, selectedThemes, selectedFormats, visualSceneryMode, tarotRulesText, directive });

    if (settings.debug) {
        console.debug('[RabbitHole] generationType:', generationType, 'combo:', combo, 'prompt chars:', prompt.length);
    }
    return prompt;
}
