import { RAW_EXECUTION_RULES } from '../data/raw/rawExecutionRules.js';
import { RUNTIME_LANGUAGE_RULES } from '../data/raw/runtimeLanguageRules.js';
import { TAROT_IMAGE_RULES } from '../data/raw/tarotImageRules.js';
import { VISUAL_SCENERY_RULES } from '../data/raw/visualSceneryRules.js';
import { FORMAT_PRIORITY_RULES } from '../data/raw/formatPriorityRules.js';
import { STATE_BAR_ISOLATION_RULES } from '../data/raw/stateBarIsolationRules.js';
import { VISUAL_FAMILY_COOLDOWN_RULES } from '../data/raw/visualFamilyCooldownRules.js';
import { ITEM_INTERPRETATION_RULES } from '../data/raw/itemInterpretationRules.js';
import { DYNAMIC_VISUAL_RULES } from '../data/raw/dynamicVisualRules.js';
import { DYNAMIC_COMMITMENT_RULES } from '../data/raw/dynamicCommitmentRules.js';
import { MEDIA_SELF_JUDGMENT_RULES } from '../data/raw/mediaSelfJudgmentRules.js';
import { MODULAR_DEGRADATION_RULES } from '../data/raw/modularDegradationRules.js';
import { CSS_SCOPE_RULES } from '../data/raw/cssScopeRules.js';
import { USER_REQUEST_OVERRIDE_RULES } from '../data/raw/userRequestOverrideRules.js';
import { CREATIVE_EXPANSION_RULES } from '../data/raw/creativeExpansionRules.js';
import { resolveThemeRaw, resolvePresentationRaw } from '../data/raw/rawSegmentLookup.js';
import { pickCombination } from './picker.js';
import { getComboHistory, getLastCombo } from './storage.js';

const HARD_STARTUP_PROTOCOL = String.raw`
强制启动增强协议:
  enforcement_level: "mandatory"
  rule:
    - "小剧场不是可选附加内容，而是本轮回复格式的固定组成部分。"
    - "主回复正文完成后必须继续生成小剧场，不能在正文结束处直接停止。"
    - "生成优先级为：先保证小剧场出现，再追求正文展开长度。"
`;

const UI_AUDIT_PROTOCOL = String.raw`
UI自查与媒介本体验收:
  enforcement_level: "mandatory"
  core_concept: "UI审查重点只用于检查完成度，不得决定 UI 长相，不得变成可见标题、标签、栏目名、固定组件或固定版式"
  rule:
    - "生成前必须回看并执行《格式与美感规范》《展现形式优先原则》《媒介本体强制成立》《状态栏隔离》与《视觉观感冷却》"
    - "具体 UI 形态必须从本轮展现形式自然生成，而不是从审查重点或通用模板生成"
    - "本轮小剧场必须像一个独立完成的微型 HTML 媒介作品，而不是正文附录、普通说明卡、状态栏、报告页或通用内容页"
    - "审查重点应检查展现形式载体感、媒介语法准确度、高级质感、空间层级、文字密度、阅读节奏、装饰契合度与近期观感去重"
    - "UI审查时必须检查视觉家族是否与最近数轮近似；若只是更换组件、颜色、标题或字段名，但整体观感仍然近似，则视为不合格，必须重写"
    - "若通过审查重点后仍无法靠 DOM/CSS 本体判断本轮展现形式，或与最近视觉签名摘要中的结构明显近似，则视为不合格，必须重写"
`;

const UNIVERSAL_EXECUTION_CORE = String.raw`
通用执行规则核心版:
  enforcement_level: "mandatory"
  rule:
    - "必须使用插件指定的本轮组合，不得自行替换成上一轮组合或固定模板。"
    - "若本轮为“仅展现形式”模式，不得自行补造主题元素；内容可由展现形式、正文氛围、角色关系与自由联想自然生成。"
    - "若本轮为“主题元素 + 展现形式（经典模式）”，必须自然融合本轮主题元素与展现形式，而不是随机词拼贴。"
    - "兔子洞是主回复最底部的高完成度 HTML 小剧场，必须根据本轮展现形式重新设计版式与视觉层级。"
    - "输出前必须自查 HTML 标签闭合、inline style、自适配容器、文本不溢出、段落间距、max-width 与 box-sizing。"
    - "如启用 <thinking>，只输出简短可见执行摘要，不输出隐藏思维链或详细推理过程。"
`;

const FINAL_GUARD_PROTOCOL = String.raw`
结尾保底规则:
  enforcement_level: "mandatory"
  rule:
    - '本轮回复的最后一个可见模块必须是完整的 <toto data-rabbit-hole="true" style="display:block;"> 包裹的 <details> 小剧场。'
    - '正文完成后，必须在消息最底部追加该模块；模块必须以 <toto 开始，并以 </toto> 结束。'
`;

const RENDER_SAFE_HTML_RULE = String.raw`
HTML渲染安全:
  enforcement_level: "mandatory"
  core_concept: "兔子洞最终输出必须是可直接渲染的 HTML UI，而不是源码文件、规则解释或调试文本"
  rule:
    - "禁止使用 <script>、iframe、object、embed、form 或任何会破坏宿主页面稳定性的结构。"
    - "禁止使用 onclick、onload、onerror 等事件处理属性；交互只能使用 details/summary、CSS hover/active 或纯 CSS/SVG 效果。"
    - "<toto>、<details>、<summary> 与所有内部标签必须完整闭合，不得遗漏 </details> 或 </toto>。"
`;

const STRUCTURE_INTEGRITY_RULES = String.raw`
结构完整性规则:
  enforcement_level: "mandatory"
  core_concept: "兔子洞必须输出完整、闭合、可直接渲染的 HTML 结构，禁止把未闭合结构交给渲染器兜底。"

  rule:
    - "生成任何 <div>、<span>、<details>、<summary> 标签时，必须遵循‘即开即闭’原则。"
    - "所有嵌套结构必须完整闭合，不得遗漏 </div>、</span>、</details>、</toto> 等闭合标签。"
    - "输出前必须内部自检 HTML 闭合情况；若发现结构嵌套不完整，必须在输出前自行修正。"
    - "内部自检不得写入最终回复，不得输出检查过程、说明文字或修正声明。"
    - "若 HTML 结构未闭合、嵌套错位或导致正文退回代码块显示，视为格式合规失败，必须在输出前重写。"
`;



const OUTPUT_FORMAT_LIMIT = String.raw`
输出格式断路器:
  rule:
    - "兔子洞部分必须以裸露的 <toto>...</toto> HTML 直接输出，严禁任何形式的 Markdown 代码块（\`\`\`）、<pre>、<code> 或 HTML 注释包裹。"
    - "禁止输出任何 HTML 注释（<!-- ... -->）；不要用注释标记分层，分层说明必须转为可见小标题或 data-* 属性。"
    - "禁止直接以 <div>、<section>、<article>、<details> 作为兔子洞最外层；无论内部结构多复杂，最外层必须先输出 <toto data-rabbit-hole=\"true\" style=\"display:block;\">。"
    - "兔子洞正文必须直接渲染，禁止源码说明、自动渲染说明、代码块标记、语法高亮标记；不得出现 language-html、hljs、prism、prettyprint、‘代码如下’、‘HTML如下’或‘示例代码’。"
    - "</summary> 后必须直接紧贴第一个主 <div style=...>，中间禁止空行、缩进、注释或说明文字。"
    - "兔子洞 HTML 必须保持紧凑，严禁行首缩进，确保直接渲染。"
`;

const CLASSIC_CONVERGENCE_RULES = String.raw`
经典收敛模式:
  enforcement_level: "mandatory"
  core_concept: "关闭发散孵化时，本轮应以当前随机抽取结果或用户点播为主要锚点，避免历史惯性和过度魔改，但不禁止必要的自然补足。"

  rule:
    - "本轮必须优先围绕当前抽取词或最后一条用户点播生成，不得延续前几轮已经出现过的主题、媒介外观、视觉结构或过度发散方向。"
    - "抽取结果应保持清晰可识别的核心气味、关系逻辑或媒介特征，禁止完全抛弃当前抽取结果另起炉灶。"
    - "允许根据正文氛围、角色关系和当前剧情补足必要细节，但不得进行大范围库外魔改、跨媒介跳跃或喧宾夺主的夸张扩写。"
    - "展现形式应保持经典、稳定、可识别；可以有质感和细节，但不得为了追求新奇而生成复杂失控的前端结构。"
`;

function formatItems(items, kind) {
    return items.map(item => {
        const fullRaw = kind === 'theme' ? resolveThemeRaw(item) : resolvePresentationRaw(item);
        return `- 【${item.id} ${item.title}】\n${fullRaw}`;
    }).join('\n\n');
}

function signatureOf(combo) {
    return JSON.stringify({
        themeIds: combo?.themeIds || [],
        formatIds: combo?.formatIds || [],
        samplingMode: combo?.samplingMode || 'classic',
        forcedVisualScenery: !!combo?.forcedVisualScenery,
    });
}

function formatLast(last) {
    if (!last || (!last.themeIds && !last.formatIds)) return '无记录或首次运行';
    return `上轮主题：${(last.themeIds || []).join(' + ') || '无'}；上轮展现形式：${(last.formatIds || []).join(' + ') || '无'}`;
}

function formatRecentHistory(combo, limit = 10) {
    const history = getComboHistory(limit + 1);
    const currentSig = signatureOf(combo);
    const trimmed = history[history.length - 1]?.signature === currentSig ? history.slice(0, -1) : history;
    const recent = trimmed.slice(-limit);
    if (!recent.length) return '无记录或首次运行';
    return recent.map((item, index) => {
        const themes = (item.themeIds || []).join(' + ') || '未抽取';
        const formats = (item.formatIds || []).join(' + ') || '无';
        const focus = Array.isArray(item.uiReviewFocus) && item.uiReviewFocus.length ? `；UI审查：${item.uiReviewFocus.join('；')}` : '';
        const visual = item.visualSignature ? `；视觉签名：${item.visualSignature}` : '';
        return `${index + 1}. 抽取模式：${item.samplingMode || 'classic'}；主题：${themes}；展现形式：${formats}${focus}${visual}`;
    }).join('\n');
}


function formatRecentVisualSignatures(combo, limit = 6) {
    const history = getComboHistory(limit + 1);
    const currentSig = signatureOf(combo);
    const trimmed = history[history.length - 1]?.signature === currentSig ? history.slice(0, -1) : history;
    const recent = trimmed
        .filter(item => item?.visualSignature || item?.visualSkeleton)
        .slice(-Math.max(1, Number(limit) || 6));
    if (!recent.length) return '无记录或首次运行';
    return recent.map((item, index) => {
        const formats = (item.formatIds || []).join(' + ') || '无';
        const skeleton = item.visualSkeleton ? `；UI骨架标签：${item.visualSkeleton}` : '';
        const visual = item.visualSignature ? `；视觉签名：${item.visualSignature}` : '';
        return `${index + 1}. 展现形式：${formats}${skeleton}${visual}`;
    }).join('\n');
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
本轮抽取模式:
  enforcement_level: "mandatory"
  mode: "仅展现形式"
  rule:
    - "本轮不抽取主题元素，主题元素栏固定为“未抽取”。不得为了补全审核而自行生成主题元素。"
    - "请根据本轮展现形式、正文氛围、角色关系与自由联想生成小剧场。"
    - "审核对象为：展现形式、UI审查重点。"
`;
    }
    return String.raw`
本轮抽取模式:
  enforcement_level: "mandatory"
  mode: "主题元素 + 展现形式（经典模式）"
  rule:
    - "本轮同时抽取主题元素与展现形式，并进行自然融合。"
    - "审核对象为：主题元素、展现形式、UI审查重点。"
`;
}

function themeSection(combo, settings, selectedThemes) {
    const mode = combo?.samplingMode || settings?.samplingMode || 'classic';
    if (mode === 'format_only') {
        return String.raw`
本轮主题元素:
  value: "未抽取"
  rule:
    - "本轮为“仅展现形式”模式，不得自行补造主题元素。"
`;
    }
    return String.raw`
本轮随机主题元素:
  enforcement_level: "mandatory"
  rule: "必须融合；以下为按 ID 从母本检索的对应完整描述。"
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
        ? `H. 用户指令优先：插件已在最后一条用户输入中匹配到抽取池内点播条目；点播优先，未指定部分由插件随机补足。`
        : `H. 用户指令优先：插件未匹配到抽取池内点播条目；若最后一条用户输入本身明确点播，仍按点播状态机执行，否则使用插件随机组合。`;
    return String.raw`
预生成 <thinking> 执行摘要:
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

function thinkingPipeline(settings) {
    if (settings.showCot) {
        return String.raw`
执行管线:
  enforcement_level: "mandatory"
  rule:
    - "必须先输出 <thinking> 块，简短说明本轮展现形式、媒介成立方式、无字盲测结果与冷却避让。"
    - "随后输出最终完整 HTML。"
    - "<thinking> 不得替代兔子洞正文。"
`;
    }
    return String.raw`
执行管线:
  enforcement_level: "mandatory"
  rule:
    - "严禁输出 <thinking> 块。"
    - "严禁输出 Markdown 代码块、自然语言解释、规则说明或调试信息。"
    - "直接输出完整闭合的 HTML。"
`;
}

function shortVisualAvoidance(combo, limit = 3) {
    const raw = formatRecentVisualSignatures(combo, limit);
    if (!raw || raw === '无记录或首次运行') {
        return '暂无实际历史，本轮自由生成；但仍禁止退化为普通信息卡、状态栏、报告页或多块同构卡片。';
    }
    return raw
        .split('\n')
        .slice(0, limit)
        .map(line => line.replace(/；视觉签名：/g, '；避让特征：').slice(0, 260))
        .join('\n');
}

function coreOutputProtocol() {
    return String.raw`
强制输出协议:
  - 主回复正文完成后，必须在消息最底部追加一个完整兔子洞小剧场。
  - 固定结构：<toto data-rabbit-hole="true" style="display:block;"><details><summary>【兔子洞：标题】</summary>内部 HTML</details></toto>
  - 兔子洞必须是本轮最后一个可见模块，禁止省略，禁止解释规则。
  - 禁止 Markdown 代码块、<pre>、<code>、HTML 注释、script、iframe、事件属性。
  - 所有标签必须完整闭合，最终必须以 </toto> 结束。
`;
}

function compactCreativeRule(enabled) {
    if (enabled) {
        return String.raw`
发散孵化:
  抽取结果是灵感种子，不是封闭题库。必须保留本轮主题/展现形式的核心气味、媒介痕迹或关系逻辑，同时允许自然扩展元素库外的同族媒介、材质、空间结构、交互痕迹、角色反应与外延剧情；发散必须能追溯回本轮抽取结果，禁止跑题。`;
    }
    return String.raw`
经典收敛:
  本轮必须优先围绕当前抽取结果生成，不得延续历史模板或另起炉灶；允许必要的自然补足，但禁止过度魔改、关键词拼贴或平均堆叠。`;
}

function compactMediaRule() {
    return String.raw`
媒介本体与 UI 要求:
  - 展现形式必须决定 DOM/CSS 骨架、视觉轮廓、阅读路径和文字寄生方式，不能只写进标题。
  - 兔子洞必须像独立完成的微型 HTML 媒介作品，不得退化成普通信息卡、报告页、档案页、状态栏、系统面板或多块同构卡片。
  - 必须有明确视觉锚点、空间层级、专属媒介质感、文本长短错落、自适配布局与中文界面。
  - 禁止仅靠换标题、颜色、图标、边框、阴影伪装新 UI。
`;
}

function compactSafetyRule() {
    return String.raw`
HTML 安全:
  只使用可直接渲染的 HTML/CSS/SVG/details/summary；优先 inline style。禁止 script、iframe、object、embed、form、onclick/onload/onerror 等事件属性。长文本必须自适配屏幕宽度，防止溢出。`;
}

function buildLitePrompt({ combo, settings, selectedThemes, selectedFormats, visualSceneryMode, tarotRulesText, directive }) {
    const chunks = [];
    chunks.push('<RabbitHoleTheaterAutoInjection>');
    chunks.push(coreOutputProtocol());
    chunks.push(String.raw`
本轮抽取模式: ${samplingModeLabel(combo, settings)}
本轮主题元素:
${(combo?.samplingMode || settings?.samplingMode) === 'format_only' ? '- 未抽取；不得自行补造主题元素。' : (selectedThemes || '- 无')}

本轮展现形式:
${selectedFormats || '- 无'}
`);
    chunks.push(compactCreativeRule(!!settings.creativeExpansionMode));
    chunks.push(compactMediaRule());
    if (settings.userDirectivePriority && directive) {
        chunks.push(String.raw`
用户点播优先:
  最后一条用户输入已匹配到兔子洞点播条目；点播优先，未指定部分由插件随机补足。兔子洞不得抢占、稀释或改写主回复正文。`);
    }
    if (settings.uiAudit) {
        chunks.push(String.raw`
UI 自查:
  输出前检查：展现形式载体感、媒介语法、高级质感、空间层级、文字密度、阅读节奏、装饰契合度、是否像普通报告/卡片/状态栏。失败则重写。`);
    }
    if (settings.avoidRepeat) {
        chunks.push(String.raw`
近期视觉避让:
${shortVisualAvoidance(combo, 3)}
`);
    }
    if (visualSceneryMode) {
        chunks.push(String.raw`
动态渐变模式:
  允许使用纯 CSS/SVG 构建风景化、光影化、流动渐变或环境动态效果；必须服务本轮展现形式，不得为了动而动。`);
        chunks.push(VISUAL_SCENERY_RULES);
    }
    if (tarotRulesText) chunks.push(tarotRulesText);
    chunks.push(compactSafetyRule());
    chunks.push(String.raw`
最终保底:
  先完整生成主回复正文；正文结束后必须继续生成兔子洞。先保证 <toto> 出现，再追求复杂度。不要解释规则，直接输出最终内容。`);
    chunks.push('</RabbitHoleTheaterAutoInjection>');
    return chunks.filter(Boolean).join('\n\n').trim();
}

function buildFullPrompt({ combo, settings, selectedThemes, selectedFormats, visualSceneryMode, tarotRulesText, tarotRequirement, uiReviewFocus, cooldownWindow, directive }) {
    const chunks = [];
    chunks.push('<RabbitHoleTheaterAutoInjection>');
    chunks.push('你必须在本轮主回复完成后，额外输出一个【兔子洞】小剧场模块。此模块由 SillyTavern 第三方扩展自动注入，不需要用户在预设里放任何内容。');
    chunks.push(RAW_EXECUTION_RULES);
    chunks.push(UNIVERSAL_EXECUTION_CORE);
    chunks.push(ITEM_INTERPRETATION_RULES);
    if (settings.creativeExpansionMode) chunks.push(CREATIVE_EXPANSION_RULES);
    else chunks.push(CLASSIC_CONVERGENCE_RULES);
    chunks.push(FORMAT_PRIORITY_RULES);
    chunks.push(MEDIA_SELF_JUDGMENT_RULES);
    chunks.push(MODULAR_DEGRADATION_RULES);
    if (settings.hardChineseLock) chunks.push(RUNTIME_LANGUAGE_RULES);
    chunks.push(STATE_BAR_ISOLATION_RULES);
    if (settings.hardStartup) chunks.push(HARD_STARTUP_PROTOCOL);
    chunks.push(FINAL_GUARD_PROTOCOL);

    if (settings.userDirectivePriority) {
        chunks.push(USER_REQUEST_OVERRIDE_RULES);
        chunks.push(String.raw`
正文/兔子洞点播指令优先:
  enforcement_level: "mandatory"
  rule:
    - "正文叙事、剧情推进与角色表现为最高优先级。"
    - "兔子洞只能作为回复末尾的附属小剧场，不得稀释、打断、污染或抢占正文表现重心。"
    - "不得为了生成复杂 UI 而压缩正文、跳过剧情、改变叙事方向或替代主回复。"
`);
    }

    chunks.push(modeInstruction(combo, settings));
    chunks.push(String.raw`
本轮抽取结果:
  主题元素: "${themeAuditText(combo, settings)}"
  展现形式: "${combo.formats.map(x => `【${x.id} ${x.title}】`).join(' + ') || '无'}"
`);

    if (settings.uiAudit) chunks.push(UI_AUDIT_PROTOCOL);
    if (settings.avoidRepeat) {
        chunks.push(String.raw`
最近视觉签名摘要【避让对象，不得模仿，不得复用其 UI 骨架；只来自已经实际生成成功的历史，不预抽未来轮次】:
${shortVisualAvoidance(combo, 3)}
`);
        chunks.push(VISUAL_FAMILY_COOLDOWN_RULES);
    }

    if (settings.uiAudit) {
        chunks.push(String.raw`
本轮 UI审查重点:
  note: "只用于自检，不得变成可见标题、标签、固定组件或固定版式。"
  value: "${uiReviewFocus}"
`);
    }

    if (visualSceneryMode) {
        chunks.push(String.raw`
Visual Scenery 动态渐变模式:
  value: true
  rule:
    - "本轮已启用或抽到 Visual Scenery，允许纯 CSS 风景、流动渐变、光影与环境动态；必须按视觉画布优先执行。"
`);
        chunks.push(VISUAL_SCENERY_RULES);
    }

    if (tarotRulesText) chunks.push(TAROT_IMAGE_RULES);
    chunks.push(RENDER_SAFE_HTML_RULE);
    chunks.push(STRUCTURE_INTEGRITY_RULES);
    chunks.push(OUTPUT_FORMAT_LIMIT);
    chunks.push(CSS_SCOPE_RULES);
    chunks.push(DYNAMIC_VISUAL_RULES);
    chunks.push(DYNAMIC_COMMITMENT_RULES);

    chunks.push(String.raw`
本轮边界:
  enforcement_level: "mandatory"
  rule:
    - "不得以任何形式干预或改写主线叙事的内容。"
    - "主线叙事与兔子洞必须保持模块边界，不得互相包裹或破坏。"
`);

    chunks.push(themeSection(combo, settings, selectedThemes));
    chunks.push(String.raw`
本轮随机展现形式:
  enforcement_level: "mandatory"
  rule: "必须执行；以下为按 ID 从母本检索的对应完整描述。"
${selectedFormats}
`);

    chunks.push(thinkingBlock(combo, getLastCombo(), settings, directive));
    if (settings.userDirectivePriority && directive) {
        chunks.push(String.raw`
用户指令状态:
  value: "插件已在最后一条用户输入中匹配到抽取池内点播条目，必须优先执行用户点播；未被用户指定的部分可由插件随机补足。"
`);
    }
    if (settings.showCot) chunks.push(thinkingPipeline(settings));
    else chunks.push(String.raw`
执行管线:
  enforcement_level: "mandatory"
  rule:
    - "严禁输出 <thinking> 块。"
    - "严禁输出 Markdown 代码块、自然语言解释、规则说明或调试信息。"
    - "直接输出完整闭合的 HTML。"
`);

    chunks.push(String.raw`
最终输出硬性要求:
  enforcement_level: "mandatory"
  rule:
    - "【输出位置最高优先级】必须先完整生成主回复正文；正文全部结束后，才能追加兔子洞模块。兔子洞必须是本轮 assistant 消息的最后一个可见内容。"
    - '小剧场最外层必须完整包裹在 <toto data-rabbit-hole="true" style="display:block;"> 与 </toto> 之间，禁止遗漏闭合标签；<toto> 内部必须使用 <details> 折叠模块，并用 <summary> 显示【兔子洞：本次标题】。'
    - "内部 HTML 不提供固定模板；必须首先落实本轮展现形式，并通过 UI审查重点。经典模式还必须自然融合本轮主题元素；仅展现形式模式不得自行补造主题元素。"
    - "所有 HTML 样式使用 inline style；必须执行自适配、文字安全、复杂度硬指标、展现形式优先与状态栏隔离。"
    - "${cooldownWindow ? `严禁复用最近 ${cooldownWindow} 轮内已经实际出现过的完全相同主题、展现形式或近似视觉观感；不得自行回到近期模板。` : `本轮未启用冷却窗口，但仍不得生成通用模板或与本轮展现形式无关的偷懒 UI。`}"
    - "${tarotRequirement}"
    - "不要解释你正在遵守规则，直接输出最终可渲染 HTML。"
    - '最终必须输出完整 <toto data-rabbit-hole="true" style="display:block;">...</toto>。'
    - "禁止把兔子洞最外层写成裸 <div>；如果已写出 <div> 主容器，必须把它整体放进 <toto data-rabbit-hole=\"true\" style=\"display:block;\"><details>...</details></toto> 内部。"
    - "<toto> 内部必须包含一个完整 <details> 折叠模块。"
    - "<summary> 必须包含【兔子洞：标题】。"
    - "禁止遗漏 </details> 或 </toto>。"
`);
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

    const selectedThemes = formatItems(combo.themes, 'theme');
    const selectedFormats = formatItems(combo.formats, 'presentation');
    const visualSceneryMode = !!(settings.forceVisualScenery || hasVisualScenery(combo));
    const cooldownWindow = settings.avoidRepeat ? Math.max(1, Number(settings.cooldownRounds) || 10) : 0;
    const tarotRulesText = isTarotRelated(combo) ? TAROT_IMAGE_RULES : '';
    const tarotRequirement = tarotRulesText ? '如本轮使用塔罗牌图片，必须遵守已注入的【塔罗牌图片规则】计算图片地址。' : '本轮未注入塔罗图片规则；不要自行扩展塔罗图片编号规则。';
    const uiReviewFocus = formatUiReviewFocus(combo);
    const payload = { combo, settings, selectedThemes, selectedFormats, visualSceneryMode, tarotRulesText, tarotRequirement, uiReviewFocus, cooldownWindow, directive };
    const prompt = settings.injectionMode === 'full' ? buildFullPrompt(payload) : buildLitePrompt(payload);

    if (settings.debug) {
        console.debug('[RabbitHole] generationType:', generationType, 'mode:', settings.injectionMode || 'lite', 'combo:', combo, 'prompt chars:', prompt.length);
    }
    return prompt;
}
