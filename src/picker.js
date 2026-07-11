import { THEMATIC_CATEGORIES } from '../data/structured/thematicIndex.js';
import { PRESENTATION_FORMATS } from '../data/structured/presentationIndex.js';
import { getLastCombo, getRecentIds, setLastCombo } from './storage.js';

function randomInt(min, max) {
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    return Math.floor(Math.random() * (high - low + 1)) + low;
}

function shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function weightedThemeCount(settings) {
    const min = Number(settings.themesMin) || 1;
    const max = Number(settings.themesMax) || 3;
    const r = Math.random();
    const count = r < 0.75 ? 1 : r < 0.97 ? 2 : 3;
    return clamp(count, min, max);
}

function weightedFormatCount(settings) {
    const min = Number(settings.formatsMin) || 1;
    const max = Number(settings.formatsMax) || 2;
    const count = Math.random() < 0.85 ? 1 : 2;
    return clamp(count, min, max);
}


const UI_REVIEW_FOCUS = [
    '展现形式载体感',
    '媒介语法准确度',
    '非通用卡片化',
    '高级质感',
    '空间层级与视觉深度',
    '主视觉锚点明确',
    '文字密度服从载体',
    '文本长短错落',
    '阅读路径有节奏',
    '装饰方式与氛围契合',
    '配色服务本轮氛围',
    '避免状态栏化',
    '避免报告卡化',
    '避免普通信息面板化',
    '近期10轮观感去重'
];

function pickUiReviewFocus(count = 4) {
    const n = Math.max(3, Math.min(Number(count) || 4, UI_REVIEW_FOCUS.length));
    const mustHave = ['展现形式载体感', '媒介语法准确度', '近期10轮观感去重'];
    const rest = UI_REVIEW_FOCUS.filter(x => !mustHave.includes(x));
    return [...mustHave, ...shuffle(rest).slice(0, Math.max(0, n - mustHave.length))];
}

let cachedPick = null;

function getChatTurnKey() {
    try {
        const context = SillyTavern?.getContext?.();
        const chat = context?.chat || [];
        const lastUserIndex = [...chat].map((m, i) => ({ m, i })).reverse().find(x => x.m?.is_user)?.i ?? -1;
        const lastUserMessage = lastUserIndex >= 0 ? String(chat[lastUserIndex]?.mes || '') : '';
        return `${chat.length}|${lastUserIndex}|${lastUserMessage.slice(0, 500)}`;
    } catch (_error) {
        return `fallback|${getLastUserMessage().slice(0, 500)}`;
    }
}

function isRichPresentation(item) {
    const tags = new Set(item?.tags || []);
    const text = `${item?.id || ''} ${item?.title || ''} ${item?.summary || ''} ${item?.raw || ''}`;
    if ([...tags].some(tag => ['visual', 'digital', 'interactive', 'game', 'mysticism', 'media'].includes(tag))) return true;
    return /(界面|接口|面板|图|图表|时间轴|票据|相册|壁纸|直播|弹幕|游戏|抽卡|牌阵|星盘|命盘|黄历|符咒|视觉|可视化|Scenery|播放器|排行榜|审批|日历|Bingo|四格|分镜|海报|菜单|小组件|票根|坐标)/i.test(text);
}


function isReportLikePresentation(item) {
    const text = `${item?.id || ''} ${item?.title || ''} ${item?.summary || ''}`;
    // 随机抽取时默认排除容易把 UI 拉回“报告页 / 信息面板 / 档案卡”的高风险形式。
    // 用户明确点播时不受此限制。
    return /(报告|报表|诊断书|诊断|审查表|检查表|观察记录|记录卡|分析报告|身体状态报告|状态栏|角色面板|属性页|任务日志|系统面板|控制台|后台|监控台|档案)/i.test(text);
}


function isRemovedRegionalTheme(item) {
    // Removed from random and directive pools by ID. Text keywords are intentionally not kept here.
    return item?.id === 'G.3.5' || item?.id === 'G.3.11';
}

function filterRemovedRegionalThemes(pool) {
    return pool.filter(item => !isRemovedRegionalTheme(item));
}

function filterReportLikePresentations(pool, settings) {
    if (settings?.allowReportLikeRandom) return pool;
    const filtered = pool.filter(item => !isReportLikePresentation(item));
    return filtered.length >= Math.max(12, Math.floor(pool.length * 0.45)) ? filtered : pool;
}

function enrichFormatPool(pool, settings, count) {
    if (!settings?.richFormatBias) return pool;
    const rich = pool.filter(isRichPresentation);
    if (rich.length >= Math.min(count, 1)) {
        // 重复几次富版式候选，提高抽中概率，但不完全排除文学/信件等文本美学格式。
        return [...rich, ...rich, ...pool];
    }
    return pool;
}

function allowByMode(_item, mode) {
    if (mode === 'off') return false;
    return true;
}

function weightedSample(pool, count, recentIds = [], recentGroups = [], avoidRepeat = true) {
    const recent = new Set(recentIds || []);
    const groups = new Set(recentGroups || []);
    let candidates = [...pool];

    // 完全相同子项优先从候选池中移除；候选不足时才回退。
    if (avoidRepeat) {
        const filtered = candidates.filter(x => !recent.has(x.id));
        if (filtered.length >= count) candidates = filtered;
    }

    const selected = [];
    const used = new Set();
    while (selected.length < count && used.size < candidates.length) {
        const weighted = candidates
            .filter(item => !used.has(item.id))
            .map(item => {
                let weight = 1;
                // 最近 10 轮同父类不绝对禁止，只降权，让随机更丰富但不容易疲劳。
                if (avoidRepeat && groups.has(item.group)) weight *= 0.35;
                // 很久没出现的项目保留基础权重，避免总是抽到熟悉格式。
                return { item, weight };
            });
        const total = weighted.reduce((sum, x) => sum + x.weight, 0);
        let roll = Math.random() * total;
        let chosen = weighted[weighted.length - 1]?.item;
        for (const entry of weighted) {
            roll -= entry.weight;
            if (roll <= 0) {
                chosen = entry.item;
                break;
            }
        }
        if (!chosen) break;
        selected.push(chosen);
        used.add(chosen.id);
    }
    return selected.length ? selected : shuffle(candidates).slice(0, Math.max(1, Math.min(count, candidates.length)));
}

function getLastUserMessage() {
    try {
        const context = SillyTavern?.getContext?.();
        const chat = context?.chat || [];
        const lastUser = [...chat].reverse().find(m => m?.is_user && typeof m?.mes === 'string');
        return lastUser?.mes || '';
    } catch (_error) {
        return '';
    }
}

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[\s`*_【】\[\]（）()「」『』:：,，.。;；/\\|+\-—_]/g, '');
}

function splitDirectiveText(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .split(/[+＋、,，;；\n]/)
        .map(x => x.trim())
        .filter(Boolean);
}

function itemHaystack(item) {
    return normalizeText([
        item.id,
        item.title,
        item.summary,
        item.raw,
        ...(item.tags || []),
    ].join(' '));
}

function matchOne(pool, query) {
    const q = normalizeText(query);
    if (!q) return null;

    let best = null;
    let bestScore = 0;
    for (const item of pool) {
        const id = normalizeText(item.id);
        const title = normalizeText(item.title);
        const summary = normalizeText(item.summary);
        const raw = normalizeText(item.raw);
        const haystack = itemHaystack(item);

        let score = 0;
        if (id === q) score = 100;
        else if (title === q) score = 95;
        else if (id.includes(q) || q.includes(id)) score = Math.max(score, 80);
        else if (title.includes(q) || q.includes(title)) score = Math.max(score, 75);
        else if (summary.includes(q)) score = Math.max(score, 55);
        else if (raw.includes(q)) score = Math.max(score, 50);
        else if (haystack.includes(q)) score = Math.max(score, 40);

        if (score > bestScore) {
            best = item;
            bestScore = score;
        }
    }
    return bestScore >= 40 ? best : null;
}

function uniqueById(items) {
    const seen = new Set();
    const result = [];
    for (const item of items) {
        if (!item || seen.has(item.id)) continue;
        seen.add(item.id);
        result.push(item);
    }
    return result;
}

function extractAfterPatterns(message, patterns) {
    const results = [];
    for (const pattern of patterns) {
        const regex = new RegExp(pattern, 'ig');
        let match;
        while ((match = regex.exec(message)) !== null) {
            const value = (match[1] || '').trim();
            if (value) results.push(value);
        }
    }
    return results;
}

function parseUserDirective(message) {
    if (!message || !/(兔子镜|小剧场)/.test(message)) return null;

    if (/((?:兔子镜|小剧场)\s*(关闭|关掉|不要|禁用|停止|off)|不要\s*(?:兔子镜|小剧场)|关闭\s*(?:兔子镜|小剧场)|本轮不(?:要|用)\s*(?:兔子镜|小剧场))/i.test(message)) {
        return { disabled: true, reason: '用户正文指令关闭本轮兔子镜' };
    }

    const themeTexts = extractAfterPatterns(message, [
        '(?:兔子镜|小剧场)(?:主题|元素|题材|theme)\s*[:：]\s*([^\n。；;]+)',
    ]);
    const formatTexts = extractAfterPatterns(message, [
        '(?:兔子镜|小剧场)(?:展现形式|展示形式|表现形式|格式|形式|format|ui|UI)\s*[:：]\s*([^\n。；;]+)',
    ]);
    const generalTexts = extractAfterPatterns(message, [
        '(?:兔子镜|小剧场)\s*[:：]\s*([^\n。；;]+)',
        '(?:兔子镜|小剧场)\s*(?:想看|想要|来|要|指定|换成)\s*([^\n。；;]+)',
        '(?:下一个|下次|这次|本轮)?\s*(?:兔子镜|小剧场)\s*(?:想看|想要|来|要|指定|换成)\s*([^\n。；;]+)',
    ]).filter(x => !/^(主题|元素|题材|展现形式|展示形式|表现形式|格式|形式)\s*[:：]/.test(x));

    const themeQueries = splitDirectiveText(themeTexts.join('、'));
    const formatQueries = splitDirectiveText(formatTexts.join('、'));
    const generalQueries = splitDirectiveText(generalTexts.join('、'));

    const themes = [];
    const formats = [];

    for (const query of themeQueries) {
        const matched = matchOne(THEMATIC_CATEGORIES, query);
        if (matched) themes.push(matched);
    }
    for (const query of formatQueries) {
        const matched = matchOne(PRESENTATION_FORMATS, query);
        if (matched) formats.push(matched);
    }
    for (const query of generalQueries) {
        const format = matchOne(PRESENTATION_FORMATS, query);
        const theme = matchOne(THEMATIC_CATEGORIES, query);
        // 一般“兔子镜：xxx”里，像法甜剖面图/短信体更常是展现形式；两边都能匹配时都保留。
        if (format) formats.push(format);
        if (theme) themes.push(theme);
    }

    const uniqueThemes = uniqueById(themes);
    const uniqueFormats = uniqueById(formats);
    if (!uniqueThemes.length && !uniqueFormats.length) return null;

    return {
        disabled: false,
        themes: uniqueThemes,
        formats: uniqueFormats,
        source: '最后一条用户消息中的兔子镜正文指令',
        raw: message,
    };
}

function getVisualSceneryFormat() {
    return PRESENTATION_FORMATS.find(item => item.id === '10.2.2' || normalizeText(item.title) === normalizeText('Visual Scenery')) || null;
}

function applyDirectiveOrRandom({ settings, themePool, formatPool, themeCount, formatCount, last, recent }) {
    const directive = settings.userDirectivePriority ? parseUserDirective(getLastUserMessage()) : null;
    if (directive?.disabled) {
        return { disabled: true, directive };
    }

    const pickedThemes = weightedSample(themePool, themeCount, recent.themeIds, recent.themeGroups, settings.avoidRepeat);
    const weightedFormatPool = enrichFormatPool(formatPool, settings, formatCount);
    const pickedFormats = weightedSample(weightedFormatPool, formatCount, recent.formatIds, recent.formatGroups, settings.avoidRepeat);
    const visualSceneryFormat = getVisualSceneryFormat();
    const forcedFormats = settings.forceVisualScenery && visualSceneryFormat ? [visualSceneryFormat] : [];
    const directiveFormats = directive?.formats || [];
    const directiveWantsVisualScenery = directiveFormats.some(item => item?.id === '10.2.2');

    const formatOnly = settings.samplingMode === 'format_only';
    const themes = formatOnly
        ? []
        : uniqueById([...(directive?.themes || []), ...pickedThemes]).slice(0, Math.max(themeCount, directive?.themes?.length || 0));

    let formats;
    if (forcedFormats.length) {
        // Visual Scenery 动态模式开启时，展现形式锁定为 10.2.2；是否抽主题由抽取模式决定。
        formats = forcedFormats;
    } else if (directiveWantsVisualScenery) {
        // 用户正文明确指定 Visual Scenery 时，也让它成为本轮核心展现形式，避免被随机格式稀释。
        formats = uniqueById(directiveFormats);
    } else {
        formats = uniqueById([...directiveFormats, ...pickedFormats]).slice(0, Math.max(formatCount, directiveFormats.length));
    }

    return { themes, formats, directive, forcedFormats };
}

export function pickCombination(settings) {
    const turnKey = getChatTurnKey();
    if (cachedPick?.turnKey === turnKey) {
        return cachedPick.payload;
    }

    const last = getLastCombo();
    const recent = getRecentIds(settings.cooldownRounds || 10);
    const themeCount = weightedThemeCount(settings);
    const formatCount = weightedFormatCount(settings);

    let themePool = filterRemovedRegionalThemes(THEMATIC_CATEGORIES).filter(item => allowByMode(item, settings.mode));
    let formatPool = PRESENTATION_FORMATS.filter(item => allowByMode(item, settings.mode));
    formatPool = filterReportLikePresentations(formatPool, settings);

    if (!themePool.length) themePool = filterRemovedRegionalThemes(THEMATIC_CATEGORIES);
    if (!formatPool.length) formatPool = filterReportLikePresentations(PRESENTATION_FORMATS, settings);

    const result = applyDirectiveOrRandom({ settings, themePool, formatPool, themeCount, formatCount, last, recent });
    if (result.disabled) {
        const payload = { disabled: true, directive: result.directive, combo: null, last };
        cachedPick = { turnKey, payload };
        return payload;
    }

    const combo = {
        themes: result.themes,
        formats: result.formats,
        themeIds: result.themes.map(x => x.id),
        formatIds: result.formats.map(x => x.id),
        themeGroups: result.themes.map(x => x.group).filter(Boolean),
        formatGroups: result.formats.map(x => x.group).filter(Boolean),
        mode: settings.mode,
        samplingMode: settings.samplingMode || 'classic',
        directive: result.directive || null,
        forcedVisualScenery: !!settings.forceVisualScenery,
        cooldownRounds: settings.cooldownRounds || 10,
        uiReviewFocus: pickUiReviewFocus(5),
        recentUiReviewFocus: recent.uiReviewFocus || [],
    };

    setLastCombo(combo);
    const payload = { combo, last, directive: result.directive || null };
    cachedPick = { turnKey, payload };
    return payload;
}
