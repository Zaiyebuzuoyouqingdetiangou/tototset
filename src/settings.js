import { extension_settings } from '../../../../extensions.js';
import { saveSettingsDebounced } from '../../../../../script.js';

export const MODULE_NAME = 'rabbit_hole_theater_test';

export const defaultSettings = Object.freeze({
    enabled: true,

    // 一体化模式：不再把 Independent / Canon 拆成用户可选项。
    // 插件内部会根据本轮抽到的主题/展现形式自动判断：
    // - 抽到 canon 相关条目时，允许正文衍生；
    // - 否则按独立兔子洞执行。
    mode: 'integrated',

    // 兔子洞生成模式：main=跟随主模型生成；sub_api=使用副 API 独立生成。
    generationMode: 'main',

    // 副 API 设置。默认复杂优先，maxTokens 给高一点；实际可用上限以上游 API / 模型为准。
    subApi: {
        apiType: 'openai', // openai | gemini | anthropic | custom
        endpoint: '',
        apiKey: '',
        model: '',
        temperature: 0.95,
        maxTokens: 16000,
        contextMode: 'current_plus_5', // current | current_plus_1 | current_plus_3 | current_plus_5
    },

    // 抽取模式：classic=主题元素+展现形式；format_only=仅展现形式。
    samplingMode: 'classic',

    // 默认不每轮塞完整大库，避免 token 爆炸；完整原文仍保存在 data/raw/。
    // 这个选项不再暴露在 UI 里，除非你自己改代码。
    rawPolicy: 'balanced',

    // 原规则是“每轮自动生成”，所以这些保持默认打开。
    showCot: false,
    // 安全补丁不再默认启用；用户原预设/主提示自行处理边界。
    includeSafetyPatch: false,
    avoidRepeat: true,
    // 冷却扩大到 10 轮：避免同一主题、展现形式或近似视觉观感在短时间内反复出现。
    cooldownRounds: 10,
    // 增强版式多样性：随机时更偏向带界面结构/视觉锚点的展现形式，减少纯文字类连续出现。
    richFormatBias: true,
    // 强制启动增强：将小剧场作为本轮输出格式的一部分，而不是可选附加项。
    hardStartup: true,
    // 语言锁定增强：所有可见 UI 文案也必须为简体中文，禁止英文承担主要界面标签。
    hardChineseLock: true,
    // 勾选后，最后一条用户消息里的“兔子洞：xxx / 兔子洞主题：xxx / 兔子洞格式：xxx”等会优先生效。
    userDirectivePriority: true,

    // 勾选后，每轮强制把 10.2.2 Visual Scenery 纳入本轮展现形式。
    forceVisualScenery: false,

    // 勾选后，每轮额外注入 UI 自查与去模板化要求，减少相似黑框/记录卡。
    uiAudit: true,

    // 原规则要求 1-3 个主题、1-2 个展现形式，作为固定协议，不再拆成 UI 设置。
    themesMin: 1,
    themesMax: 3,
    formatsMin: 1,
    formatsMax: 2,

    // 注入位置固定为 system / depth 0，减少用户误改导致失效。
    depth: 0,
    role: 'system',

    skipQuiet: true,
    skipImpersonate: true,
    debug: false,
});

function mergeSubApiSettings(settings) {
    if (!settings.subApi || typeof settings.subApi !== 'object') {
        settings.subApi = structuredClone(defaultSettings.subApi);
    }
    for (const [key, value] of Object.entries(defaultSettings.subApi)) {
        if (settings.subApi[key] === undefined) settings.subApi[key] = value;
    }
    if (!['openai', 'gemini', 'anthropic', 'custom'].includes(settings.subApi.apiType)) {
        settings.subApi.apiType = defaultSettings.subApi.apiType;
    }
    if (!['current', 'current_plus_1', 'current_plus_3', 'current_plus_5'].includes(settings.subApi.contextMode)) {
        settings.subApi.contextMode = defaultSettings.subApi.contextMode;
    }
    settings.subApi.temperature = Number(settings.subApi.temperature);
    if (!Number.isFinite(settings.subApi.temperature)) settings.subApi.temperature = defaultSettings.subApi.temperature;
    settings.subApi.temperature = Math.max(0, Math.min(2, settings.subApi.temperature));

    settings.subApi.maxTokens = Math.floor(Number(settings.subApi.maxTokens) || defaultSettings.subApi.maxTokens);
    settings.subApi.maxTokens = Math.max(512, Math.min(32768, settings.subApi.maxTokens));
}

export function getSettings() {
    if (!extension_settings[MODULE_NAME] || typeof extension_settings[MODULE_NAME] !== 'object') {
        extension_settings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    const settings = extension_settings[MODULE_NAME];
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (settings[key] === undefined) {
            settings[key] = structuredClone(value);
        }
    }

    // 旧版用户设置迁移：如果之前选过 independent / canon，也统一归并为 integrated。
    if (settings.mode === 'independent' || settings.mode === 'canon' || settings.mode === 'off') {
        settings.mode = settings.mode === 'off' ? 'off' : 'integrated';
    }

    if (!['main', 'sub_api'].includes(settings.generationMode)) settings.generationMode = defaultSettings.generationMode;
    mergeSubApiSettings(settings);

    // 旧版 showWonderland 迁移为 showCot，并删除旧字段以免 UI 混乱。
    if (settings.showCot === undefined && settings.showWonderland !== undefined) {
        settings.showCot = !!settings.showWonderland;
    }
    if (settings.showWonderland !== undefined) {
        delete settings.showWonderland;
    }

    settings.themesMin = Number(settings.themesMin) || defaultSettings.themesMin;
    settings.themesMax = Number(settings.themesMax) || defaultSettings.themesMax;
    settings.formatsMin = Number(settings.formatsMin) || defaultSettings.formatsMin;
    settings.formatsMax = Number(settings.formatsMax) || defaultSettings.formatsMax;
    settings.cooldownRounds = Math.max(1, Number(settings.cooldownRounds) || defaultSettings.cooldownRounds);
    if (!['classic', 'format_only'].includes(settings.samplingMode)) settings.samplingMode = defaultSettings.samplingMode;
    settings.depth = Number(settings.depth) || 0;
    return settings;
}

export function updateSettings(patch) {
    Object.assign(getSettings(), patch);
    saveSettingsDebounced();
}

export function updateSubApiSettings(patch) {
    const settings = getSettings();
    settings.subApi = { ...settings.subApi, ...patch };
    mergeSubApiSettings(settings);
    saveSettingsDebounced();
}

export function resetSettings() {
    extension_settings[MODULE_NAME] = structuredClone(defaultSettings);
    saveSettingsDebounced();
}
