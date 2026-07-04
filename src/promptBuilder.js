import { RAW_EXECUTION_RULES } from '../data/raw/rawExecutionRules.js';
import { RUNTIME_LANGUAGE_RULES } from '../data/raw/runtimeLanguageRules.js';
import { TAROT_IMAGE_RULES } from '../data/raw/tarotImageRules.js';
import { VISUAL_SCENERY_RULES } from '../data/raw/visualSceneryRules.js';
import { FORMAT_PRIORITY_RULES } from '../data/raw/formatPriorityRules.js';
import { STATE_BAR_ISOLATION_RULES } from '../data/raw/stateBarIsolationRules.js';
import { VISUAL_FAMILY_COOLDOWN_RULES } from '../data/raw/visualFamilyCooldownRules.js';
import { ITEM_INTERPRETATION_RULES } from '../data/raw/itemInterpretationRules.js';
import { resolveThemeRaw, resolvePresentationRaw } from '../data/raw/rawSegmentLookup.js';
import { pickCombination } from './picker.js';

const HARD_STARTUP_PROTOCOL = String.raw`
【强制启动增强协议】
1. 小剧场不是可选附加内容，而是本轮回复格式的固定组成部分。
2. 主回复正文完成后必须继续生成小剧场，不能在正文结束处直接停止。
3. 生成优先级为：先保证小剧场出现，再追求正文展开长度。
`;

const UI_AUDIT_PROTOCOL = String.raw`
UI自查与去模板化:
  enforcement_level: "mandatory"
  core_concept: "UI审查重点只用于检查完成度，不得决定 UI 长相，不得变成可见标题、标签、栏目名、固定组件或固定版式"
  rule:
    - "生成前必须回看并执行《格式与美感规范》《展现形式优先原则》《状态栏隔离》与《视觉家族冷却原则》"
    - "具体 UI 形态必须从本轮展现形式自然生成，而不是从审查重点或通用模板生成"
    - "本轮小剧场必须像一个独立完成的微型 HTML 作品，而不是正文附录、普通说明卡、状态栏、报告页或通用系统面板"
    - "审查重点应检查展现形式载体感、媒介语法准确度、高级质感、空间层级、文字密度、阅读节奏、装饰契合度与近期观感去重"
    - "UI审查时必须检查视觉家族是否与最近数轮近似；若只是更换组件、颜色、标题或字段名，但整体观感仍然近似，则视为不合格，必须重写"
    - "若通过审查重点后仍像普通信息卡、状态栏、报告页、通用系统面板或最近10轮近似 UI，则视为不合格，必须重写"
`;

const UNIVERSAL_EXECUTION_CORE = String.raw`
【通用执行规则核心版】
1. 必须使用插件指定的本轮组合，不得自行替换成上一轮组合或固定模板。
2. 若本轮为“仅展现形式”模式，不得自行补造主题元素；内容可由展现形式、正文氛围、角色关系与自由联想自然生成。
3. 若本轮为“主题元素 + 展现形式（经典模式）”，必须自然融合本轮主题元素与展现形式，而不是随机词拼贴。
4. 兔子洞是主回复最底部的高完成度 HTML 小剧场，必须根据本轮展现形式重新设计版式与视觉层级。
5. 输出前必须自查 HTML 标签闭合、inline style、自适配容器、文本不溢出、段落间距、max-width 与 box-sizing。
6. 如启用 <thinking>，只输出简短可见执行摘要，不输出隐藏思维链或详细推理过程。
`;

const FINAL_GUARD_PROTOCOL = String.raw`
【结尾保底规则】
1. 本轮回复的最后一个可见模块必须是完整的 <!-- TOTO_START --> 与 <!-- TOTO_END --> 包裹的 <details> 小剧场。
2. 正文完成后，必须在消息最底部追加该模块；模块必须以 <!-- TOTO_START --> 开始，并以 <!-- TOTO_END --> 结束。
`;

const SUB_API_MAIN_SUPPRESS_PROMPT = String.raw`
【兔子洞副 API 模式】
本轮不要生成兔子洞、小剧场、TOTO_START/TOTO_END 或 <details> 模块。
只生成正常主回复正文；兔子洞将由插件稍后使用副 API 独立追加。
`;

function formatItems(items, kind) {
    return items.map(item => {
        const fullRaw = kind === 'theme' ? resolveThemeRaw(item) : resolvePresentationRaw(item);
        return `- 【${item.id} ${item.title}】\n${fullRaw}`;
    }).join('\n\n');
}

function formatLast(last) {
    if (!last || (!last.themeIds && !last.formatIds)) return '无记录或首次运行';
    return `上轮主题：${(last.themeIds || []).join(' + ') || '无'}；上轮展现形式：${(last.formatIds || []).join(' + ') || '无'}`;
}

function formatUiReviewFocus(combo) {
    const focus = combo?.uiReviewFocus || [];
    if (!focus.length) return '展现形式载体感；媒介语法准确度；高级质感；近期10轮观感去重';
    return focus.join('；');
}

function hasVisualScenery(combo) {
    return combo?.formats?.some(item => item.id === '10.2.2' || String(item.title || '').toLowerCase().includes('visual scenery'));
}

function isTarotRelated(combo) {
    const keywords = ['塔罗', '牌阵', '占卜', '神秘学', 'tarot', 'Tarot'];
    const themeText = (combo?.themes || []).map(item => `${item.id || ''} ${item.title || ''} ${(item.tags || []).join(' ')} ${resolveThemeRaw(item) || ''}`).join('\n');
    const formatText = (combo?.formats || []).map(item => `${item.id || ''} ${item.title || ''} ${(item.tags || []).join(' ')} ${resolvePresentationRaw(item) || ''}`).join('\n');
    const text = `${themeText}\n${formatText}`;
    return keywords.some(keyword => text.includes(keyword));
}

function samplingModeLabel(combo, settings) {
    const mode = combo?.samplingMode || settings?.samplingMode || 'classic';
    return mode === 'format_only' ? '仅展现形式' : '主题元素 + 展现形式（经典模式）';
}

function themeAuditText(combo, settings) {
    const mode = combo?.samplingMode || settings?.samplingMode || 'classic';
    if (mode === 'format_only') return '未抽取';
    return combo.themes.map(x => `【${x.id} ${x.title}】`).join(' + ') || '无';
}

function modeInstruction(combo, settings) {
    const mode = combo?.samplingMode || settings?.samplingMode || 'classic';
    if (mode === 'format_only') {
        return String.raw`
【本轮抽取模式】
仅展现形式：本轮不抽取主题元素，主题元素栏固定为“未抽取”。不得为了补全审核而自行生成主题元素。
请根据本轮展现形式、正文氛围、角色关系与自由联想生成小剧场。
审核对象为：展现形式、UI审查重点。
`;
    }
    return String.raw`
【本轮抽取模式】
主题元素 + 展现形式（经典模式）：本轮同时抽取主题元素与展现形式，并进行自然融合。
审核对象为：主题元素、展现形式、UI审查重点。
`;
}

function themeSection(combo, settings, selectedThemes) {
    const mode = combo?.samplingMode || settings?.samplingMode || 'classic';
    if (mode === 'format_only') {
        return String.raw`
【本轮主题元素】
未抽取。本轮为“仅展现形式”模式，不得自行补造主题元素。
`;
    }
    return String.raw`
【本轮随机主题元素：必须融合；以下为按 ID 从母本检索的对应完整描述】
${selectedThemes || '无'}
`;
}

function thinkingBlock(combo, last, settings, directive = null) {
    if (!settings.showCot) return '';
    const mode = samplingModeLabel(combo, settings);
    const themeText = themeAuditText(combo, settings);
    const formatText = combo.formats.map(x => `【${x.id} ${x.title}】`).join(' + ');
    const cooldownTarget = (combo?.samplingMode || settings?.samplingMode) === 'format_only'
        ? '展现形式/视觉观感'
        : '主题元素/展现形式/视觉观感';
    const directiveLine = directive
        ? `H. 正文指令优先：已识别用户指定并优先采用；未指定的部分由插件随机补足。`
        : `H. 正文指令优先：本轮未识别到有效指定，使用插件随机组合。`;
    return String.raw`
<thinking>
A. 上轮组合：${formatLast(last)}
B. 抽取模式：${mode}
C. 本轮主题元素：${themeText}
D. 本轮展现形式：${formatText}
E. 冷却校验：插件已按最近 10 轮执行${cooldownTarget}冷却；若候选池不足，则允许回退。[pass]
F. 语言：简体中文。[pass]
G. UI审查重点：${formatUiReviewFocus(combo)}
${directiveLine}
</thinking>
`;
}

export function buildRabbitHolePrompt(settings, generationType = 'normal') {
    if (settings?.generationMode === 'sub_api') {
        if (settings.debug) console.debug('[RabbitHole] sub API mode: inject suppress prompt only');
        return SUB_API_MAIN_SUPPRESS_PROMPT.trim();
    }

    const { combo, last, directive, disabled } = pickCombination(settings);
    if (disabled) {
        if (settings.debug) console.debug('[RabbitHole] skipped by user directive');
        return '';
    }

    const selectedThemes = formatItems(combo.themes, 'theme');
    const selectedFormats = formatItems(combo.formats, 'presentation');

    const uiAuditText = settings.uiAudit ? UI_AUDIT_PROTOCOL : '';
    const visualSceneryText = (settings.forceVisualScenery || hasVisualScenery(combo)) ? VISUAL_SCENERY_RULES : '';
    const visualModeLine = settings.forceVisualScenery ? '本轮已启用设置项【Visual Scenery 动态渐变模式】，展现形式已由插件强制锁定为【10.2.2 Visual Scenery】，输出必须按视觉画布优先执行。' : '未启用强制 Visual Scenery；如本轮抽到或正文指令指定 Visual Scenery，也必须执行其专用协议。';
    const tarotRulesText = isTarotRelated(combo) ? TAROT_IMAGE_RULES : '';
    const tarotRequirement = tarotRulesText ? '如本轮使用塔罗牌图片，必须遵守已注入的【塔罗牌图片规则】计算图片地址。' : '本轮未注入塔罗图片规则；不要自行扩展塔罗图片编号规则。';
    const uiReviewFocus = formatUiReviewFocus(combo);

    const prompt = String.raw`
<RabbitHoleTheaterAutoInjection>
你必须在本轮主回复完成后，额外输出一个【兔子洞】小剧场模块。此模块由 SillyTavern 第三方扩展自动注入，不需要用户在预设里放任何内容。

【固定注入：运行版执行规则】
${RAW_EXECUTION_RULES}

【固定注入：通用执行规则核心版】
${UNIVERSAL_EXECUTION_CORE}

【固定注入：抽取条目解释】
${ITEM_INTERPRETATION_RULES}

【固定注入：展现形式优先】
${FORMAT_PRIORITY_RULES}

【固定注入：状态栏隔离】
${STATE_BAR_ISOLATION_RULES}

【固定注入：中文锁定】
${settings.hardChineseLock ? RUNTIME_LANGUAGE_RULES : ''}

【固定注入：强制启动增强】
${settings.hardStartup ? HARD_STARTUP_PROTOCOL : ''}

【固定注入：最高优先级结尾保底协议】
${FINAL_GUARD_PROTOCOL}

【固定注入：UI 自查与去模板化】
${uiAuditText}

【固定注入：视觉家族冷却】
${VISUAL_FAMILY_COOLDOWN_RULES}

${modeInstruction(combo, settings)}

【本轮 UI审查重点：只用于自检，不得变成可见标题、标签、固定组件或固定版式】
${uiReviewFocus}

【Visual Scenery 专用协议】
${visualModeLine}
${visualSceneryText}

【塔罗牌图片规则：仅塔罗相关轮次注入】
${tarotRulesText}

【本轮边界】
不得以任何形式干预或改写主线叙事的内容。主线叙事与兔子洞必须保持模块边界，不得互相包裹或破坏。

${themeSection(combo, settings, selectedThemes)}

【本轮随机展现形式：必须执行；以下为按 ID 从母本检索的对应完整描述】
${selectedFormats}

${thinkingBlock(combo, last, settings, directive)}

【正文指令优先】
${directive ? '本轮已检测到用户正文中的兔子洞指定指令。必须优先使用上方本轮指定结果；不要因为随机习惯改成别的主题或格式。未被用户指定的部分已由插件随机补足。' : '本轮未检测到有效兔子洞指定指令，按插件随机抽取结果执行。'}

【最终输出硬性要求】
1. 【输出位置最高优先级】必须先完整生成主回复正文；正文全部结束后，才能追加兔子洞模块。兔子洞必须是本轮 assistant 消息的最后一个可见内容。
2. 小剧场必须完整包裹在 <!-- TOTO_START --> 与 <!-- TOTO_END --> 之间；边界内部必须且只能包含一个完整 <details> 折叠模块，并用 <summary> 显示【兔子洞：本次标题】；禁止遗漏 <summary>、</details> 或结束边界。
3. 兔子洞内所有可见文字必须使用简体中文；禁止英文承担主要界面标签。如必须使用外语或专业术语，必须采用“外语【简体中文翻译】”格式。
4. 内部 HTML 不提供固定模板；必须首先落实本轮展现形式，并通过 UI审查重点。经典模式还必须自然融合本轮主题元素；仅展现形式模式不得自行补造主题元素。
5. 所有 HTML 样式使用 inline style；必须执行自适配、文字安全、复杂度硬指标、展现形式优先、状态栏隔离、视觉家族冷却与近期视觉观感去重。
6. 严禁复用最近 10 轮内已经使用过的完全相同主题、展现形式或近似视觉观感；不得自行回到近期模板。
7. ${tarotRequirement}
8. 【Toto 边界与水印】TOTO_START/TOTO_END 注释只作为插件识别边界，不得作为可见 UI；Toto 仅作为插件设置界面的界面水印存在，不得在主回复正文或兔子洞小剧场内部生成 Toto 水印。
9. 如启用 <thinking>，其中只输出可见的执行摘要，不输出隐藏思维链或详细推理过程。
10. 不要解释你正在遵守规则，不要输出代码块，直接输出最终可渲染 HTML。
11. 【最终结尾检查】本轮回复的最后一个可见模块必须是完整的兔子洞 <!-- TOTO_START --><details>...</details><!-- TOTO_END --> 小剧场。该模块为本轮回复格式的固定组成部分，不得视为可选彩蛋。
</RabbitHoleTheaterAutoInjection>
`;

    if (settings.debug) {
        console.debug('[RabbitHole] generationType:', generationType, 'combo:', combo, 'prompt chars:', prompt.length);
    }
    return prompt.trim();
}


function buildSubApiContextBlock({ assistantText = '', contextText = '' } = {}) {
    return String.raw`
【副 API 独立生成任务】
你只负责生成兔子洞小剧场，不续写、不改写、不总结主回复正文。
请读取下方本轮正文与参考上下文，从正文氛围、角色关系、动作余韵、物件或未说出口的情绪中自然生成兔子洞。

【参考上下文】
${contextText || '无'}

【本轮正文】
${assistantText || '无'}
`;
}

export function buildStandaloneRabbitHolePrompt(settings, { assistantText = '', contextText = '' } = {}, generationType = 'sub_api') {
    const { combo, last, directive, disabled } = pickCombination(settings);
    if (disabled || !combo) return '';

    const selectedThemes = formatItems(combo.themes, 'theme');
    const selectedFormats = formatItems(combo.formats, 'presentation');

    const uiAuditText = settings.uiAudit ? UI_AUDIT_PROTOCOL : '';
    const visualSceneryText = (settings.forceVisualScenery || hasVisualScenery(combo)) ? VISUAL_SCENERY_RULES : '';
    const visualModeLine = settings.forceVisualScenery ? '本轮已启用设置项【Visual Scenery 动态渐变模式】，展现形式已由插件强制锁定为【10.2.2 Visual Scenery】，输出必须按视觉画布优先执行。' : '未启用强制 Visual Scenery；如本轮抽到或正文指令指定 Visual Scenery，也必须执行其专用协议。';
    const tarotRulesText = isTarotRelated(combo) ? TAROT_IMAGE_RULES : '';
    const tarotRequirement = tarotRulesText ? '如本轮使用塔罗牌图片，必须遵守已注入的【塔罗牌图片规则】计算图片地址。' : '本轮未注入塔罗图片规则；不要自行扩展塔罗图片编号规则。';
    const uiReviewFocus = formatUiReviewFocus(combo);

    const prompt = String.raw`
<RabbitHoleTheaterSubApiInjection>
${buildSubApiContextBlock({ assistantText, contextText })}

【固定注入：运行版执行规则】
${RAW_EXECUTION_RULES}

【固定注入：通用执行规则核心版】
${UNIVERSAL_EXECUTION_CORE}

【固定注入：抽取条目解释】
${ITEM_INTERPRETATION_RULES}

【固定注入：展现形式优先】
${FORMAT_PRIORITY_RULES}

【固定注入：状态栏隔离】
${STATE_BAR_ISOLATION_RULES}

【固定注入：中文锁定】
${settings.hardChineseLock ? RUNTIME_LANGUAGE_RULES : ''}

【固定注入：UI 自查与去模板化】
${uiAuditText}

【固定注入：视觉家族冷却】
${VISUAL_FAMILY_COOLDOWN_RULES}

${modeInstruction(combo, settings)}

【本轮 UI审查重点：只用于自检，不得变成可见标题、标签、固定组件或固定版式】
${uiReviewFocus}

【Visual Scenery 专用协议】
${visualModeLine}
${visualSceneryText}

【塔罗牌图片规则：仅塔罗相关轮次注入】
${tarotRulesText}

【本轮边界】
本轮主回复正文已经完成。不得续写、改写、干预或评价正文；只根据正文余韵生成一个独立兔子洞模块。

${themeSection(combo, settings, selectedThemes)}

【本轮随机展现形式：必须执行；以下为按 ID 从母本检索的对应完整描述】
${selectedFormats}

${thinkingBlock(combo, last, settings, directive)}

【正文指令优先】
${directive ? '本轮已检测到用户正文中的兔子洞指定指令。必须优先使用上方本轮指定结果；不要因为随机习惯改成别的主题或格式。未被用户指定的部分已由插件随机补足。' : '本轮未检测到有效兔子洞指定指令，按插件随机抽取结果执行。'}

【副 API 最终输出硬性要求】
1. 只输出兔子洞小剧场本体；禁止输出主回复正文、解释、道歉、前言、代码块或规则说明。
2. 小剧场必须完整包裹在 <!-- TOTO_START --> 与 <!-- TOTO_END --> 之间；边界内部必须且只能包含一个完整 <details> 折叠模块，并用 <summary> 显示【兔子洞：本次标题】；禁止遗漏 <summary>、</details> 或结束边界。
3. 兔子洞内所有可见文字必须使用简体中文；禁止英文承担主要界面标签。如必须使用外语或专业术语，必须采用“外语【简体中文翻译】”格式。
4. 内部 HTML 不提供固定模板；必须首先落实本轮展现形式，并通过 UI审查重点。经典模式还必须自然融合本轮主题元素；仅展现形式模式不得自行补造主题元素。
5. 所有 HTML 样式使用 inline style；必须执行自适配、文字安全、复杂度硬指标、展现形式优先、状态栏隔离、视觉家族冷却与近期视觉观感去重。
6. 严禁复用最近 10 轮内已经使用过的完全相同主题、展现形式或近似视觉观感；不得自行回到近期模板。
7. ${tarotRequirement}
8. 【Toto 边界与水印】TOTO_START/TOTO_END 注释只作为插件识别边界，不得作为可见 UI；Toto 仅作为插件设置界面的界面水印存在，不得在兔子洞小剧场内部生成 Toto 水印。
9. 如启用 <thinking>，其中只输出可见的执行摘要，不输出隐藏思维链或详细推理过程。
10. 最终答案必须以 <!-- TOTO_START --> 开始，并以 <!-- TOTO_END --> 结束。
</RabbitHoleTheaterSubApiInjection>
`;

    if (settings.debug) {
        console.debug('[RabbitHole] standalone generationType:', generationType, 'combo:', combo, 'prompt chars:', prompt.length);
    }
    return prompt.trim();
}
