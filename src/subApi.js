import { getSettings, updateSubApiSettings } from './settings.js';
import { buildStandaloneRabbitHolePrompt } from './promptBuilder.js';

let subApiInitialized = false;
let processing = false;
const processedSignatures = new Set();
const pendingSignatures = new Set();
let initialLatestSignature = '';

const TOTO_BLOCK_REGEX = /<!--\s*TOTO_START\s*-->[\s\S]*?<!--\s*TOTO_END\s*-->/gi;
const TOTO_BLOCK_REGEX_ONCE = /<!--\s*TOTO_START\s*-->[\s\S]*?<!--\s*TOTO_END\s*-->/i;
const LEGACY_TOTO_BLOCK_REGEX = /<toto\b[^>]*>[\s\S]*?<\/toto>/gi;
const LEGACY_TOTO_BLOCK_REGEX_ONCE = /<toto\b[^>]*>[\s\S]*?<\/toto>/i;
function hasTotoBlock(text) {
    const value = String(text || '');
    return TOTO_BLOCK_REGEX_ONCE.test(value) || LEGACY_TOTO_BLOCK_REGEX_ONCE.test(value);
}
function wrapTotoDetails(details) { return `<!-- TOTO_START -->\n${String(details || '').trim()}\n<!-- TOTO_END -->`; }

function getContext() {
    try {
        return globalThis.SillyTavern?.getContext?.() || null;
    } catch {
        return null;
    }
}

function getChat() {
    return getContext()?.chat || [];
}

function getRoleName(message) {
    if (message?.is_user) return '用户';
    if (message?.name) return message.name;
    return 'AI';
}

function stripTotoBlocks(text) {
    return String(text || '').replace(TOTO_BLOCK_REGEX, '').replace(LEGACY_TOTO_BLOCK_REGEX, '').trim();
}

function stripInternalMarkers(text) {
    return String(text || '')
        .replace(/<!--\s*rabbit-hole-subapi-done\s*-->/gi, '')
        .trim();
}

function cleanAssistantText(text) {
    return stripInternalMarkers(stripTotoBlocks(text)).trim();
}

function hashString(input) {
    const text = String(input || '');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function buildMessageSignature(index, text) {
    const clean = cleanAssistantText(text);
    return `${index}|${hashString(clean)}|${clean.length}`;
}

function rememberProcessedSignature(signature) {
    if (!signature) return;
    processedSignatures.add(signature);
    if (processedSignatures.size > 80) {
        const first = processedSignatures.values().next().value;
        processedSignatures.delete(first);
    }
}

function getContextMessageCount(mode) {
    if (mode === 'current_plus_1') return 2;
    if (mode === 'current_plus_3') return 6;
    if (mode === 'current_plus_5') return 10;
    return 0;
}

function buildReferenceContext(chat, assistantIndex, mode) {
    const count = getContextMessageCount(mode);
    if (!count) return '';

    const before = chat.slice(0, assistantIndex).filter(m => typeof m?.mes === 'string' && m.mes.trim());
    const selected = before.slice(-count);
    return selected.map(m => `【${getRoleName(m)}】\n${stripTotoBlocks(m.mes)}`).join('\n\n');
}

function getLatestAssistantIndex() {
    const chat = getChat();
    for (let i = chat.length - 1; i >= 0; i--) {
        const message = chat[i];
        if (!message?.is_user && typeof message?.mes === 'string' && message.mes.trim()) return i;
    }
    return -1;
}

function safeJsonParse(text) {
    try { return JSON.parse(text); } catch { return null; }
}

function normalizeEndpoint(endpoint = '') {
    return String(endpoint || '').trim().replace(/\/+$/, '');
}

function stripKnownOpenAiPath(endpoint) {
    let url = normalizeEndpoint(endpoint);
    url = url.replace(/\/chat\/completions$/i, '');
    url = url.replace(/\/responses$/i, '');
    url = url.replace(/\/models$/i, '');
    return url;
}

function uniqueList(items) {
    return [...new Set(items.filter(Boolean))];
}

function buildOpenAiChatUrls(endpoint) {
    const raw = normalizeEndpoint(endpoint);
    if (/\/chat\/completions$/i.test(raw)) return [raw];
    const base = stripKnownOpenAiPath(raw);
    const urls = [`${base}/chat/completions`];
    if (!/\/v1$/i.test(base)) urls.push(`${base}/v1/chat/completions`);
    return uniqueList(urls);
}

function buildOpenAiModelsUrls(endpoint) {
    const base = stripKnownOpenAiPath(endpoint);
    const urls = [`${base}/models`];
    if (!/\/v1$/i.test(base)) urls.push(`${base}/v1/models`);
    return uniqueList(urls);
}

function buildAnthropicMessagesUrl(endpoint) {
    const raw = normalizeEndpoint(endpoint);
    if (/\/messages$/i.test(raw)) return raw;
    const base = raw.replace(/\/models$/i, '');
    return `${base}/messages`;
}

function buildAnthropicModelsUrl(endpoint) {
    const raw = normalizeEndpoint(endpoint).replace(/\/messages$/i, '').replace(/\/models$/i, '');
    return `${raw}/models`;
}

function buildGeminiModelsUrl(endpoint, apiKey) {
    const raw = normalizeEndpoint(endpoint || 'https://generativelanguage.googleapis.com/v1beta');
    const base = raw.replace(/\/models\/[^/]+:generateContent$/i, '').replace(/\/models$/i, '').replace(/\:generateContent$/i, '');
    const join = base.includes('?') ? '&' : '?';
    return `${base}/models${apiKey ? `${join}key=${encodeURIComponent(apiKey)}` : ''}`;
}

function buildGeminiGenerateUrl(endpoint, apiKey, model) {
    const raw = normalizeEndpoint(endpoint || 'https://generativelanguage.googleapis.com/v1beta');
    if (/\:generateContent$/i.test(raw)) {
        const join = raw.includes('?') ? '&' : '?';
        return `${raw}${apiKey ? `${join}key=${encodeURIComponent(apiKey)}` : ''}`;
    }
    const base = raw.replace(/\/models$/i, '').replace(/\/models\/[^/]+$/i, '');
    const safeModel = String(model || '').replace(/^models\//, '');
    const join = base.includes('?') ? '&' : '?';
    return `${base}/models/${encodeURIComponent(safeModel)}:generateContent${apiKey ? `${join}key=${encodeURIComponent(apiKey)}` : ''}`;
}

function extractTextFromResponse(apiType, data) {
    if (!data) return '';
    if (apiType === 'gemini') {
        return (data.candidates || [])
            .flatMap(c => c?.content?.parts || [])
            .map(p => p?.text || '')
            .join('\n')
            .trim();
    }
    if (apiType === 'anthropic') {
        if (Array.isArray(data.content)) return data.content.map(x => x?.text || '').join('\n').trim();
        return String(data.completion || data.text || '').trim();
    }
    return String(data.choices?.[0]?.message?.content || data.choices?.[0]?.text || data.output_text || data.content || '').trim();
}

function normalizeTotoOutput(text) {
    let output = String(text || '').trim();
    output = output.replace(/^```(?:html)?\s*/i, '').replace(/```$/i, '').trim();
    const block = output.match(TOTO_BLOCK_REGEX_ONCE)?.[0];
    if (block) return block.trim();
    // 兼容旧版 <toto> 输出，将其转换为注释边界，避免自定义标签影响 <details> 交互。
    const legacyToto = output.match(/<toto\b[^>]*>([\s\S]*?)<\/toto>/i)?.[1];
    if (legacyToto) {
        const legacyDetails = legacyToto.match(/<details\b[^>]*>[\s\S]*?<\/details>/i)?.[0];
        if (legacyDetails) return wrapTotoDetails(legacyDetails);
    }
    const details = output.match(/<details\b[^>]*>[\s\S]*?<\/details>/i)?.[0];
    if (details) return wrapTotoDetails(details);
    return wrapTotoDetails(`<details><summary>【兔子洞：副 API 小剧场】</summary>${output}</details>`);
}

async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const text = await response.text();
    const data = safeJsonParse(text);
    if (!response.ok) {
        const message = data?.error?.message || data?.message || text || `${response.status} ${response.statusText}`;
        throw new Error(message);
    }
    return data ?? text;
}

async function fetchJsonCandidates(urls, options) {
    let lastError = null;
    for (const url of urls) {
        try {
            return await fetchJson(url, options);
        } catch (error) {
            lastError = error;
            if (getSettings().debug) console.debug('[RabbitHole] endpoint candidate failed:', url, error);
        }
    }
    throw lastError || new Error('请求失败');
}

export async function fetchSubApiModels(settings = getSettings()) {
    const sub = settings.subApi || {};
    const apiType = sub.apiType || 'openai';
    const endpoint = normalizeEndpoint(sub.endpoint);
    const apiKey = sub.apiKey || '';
    if (!endpoint && apiType !== 'gemini') throw new Error('请先填写副 API 地址');

    if (apiType === 'gemini') {
        const data = await fetchJson(buildGeminiModelsUrl(endpoint, apiKey), { method: 'GET' });
        return (data.models || []).map(m => m.name || m.id).filter(Boolean);
    }

    if (apiType === 'anthropic') {
        const data = await fetchJson(buildAnthropicModelsUrl(endpoint), {
            method: 'GET',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'accept': 'application/json',
            },
        });
        return (data.data || data.models || []).map(m => m.id || m.name).filter(Boolean);
    }

    const data = await fetchJsonCandidates(buildOpenAiModelsUrls(endpoint), {
        method: 'GET',
        headers: {
            'Authorization': apiKey ? `Bearer ${apiKey}` : '',
            'accept': 'application/json',
        },
    });
    return (data.data || data.models || []).map(m => m.id || m.name).filter(Boolean);
}

export async function callSubApi(prompt, settings = getSettings()) {
    const sub = settings.subApi || {};
    const apiType = sub.apiType || 'openai';
    const endpoint = normalizeEndpoint(sub.endpoint);
    const apiKey = sub.apiKey || '';
    const model = String(sub.model || '').trim();
    const temperature = Number(sub.temperature ?? 0.95);
    const maxTokens = Math.floor(Number(sub.maxTokens) || 16000);

    if (!model) throw new Error('请填写副 API 模型名');
    if (!endpoint && apiType !== 'gemini') throw new Error('请填写副 API 地址');

    if (apiType === 'gemini') {
        const data = await fetchJson(buildGeminiGenerateUrl(endpoint, apiKey, model), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { temperature, maxOutputTokens: maxTokens },
            }),
        });
        return normalizeTotoOutput(extractTextFromResponse(apiType, data));
    }

    if (apiType === 'anthropic') {
        const data = await fetchJson(buildAnthropicMessagesUrl(endpoint), {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model,
                max_tokens: maxTokens,
                temperature,
                messages: [{ role: 'user', content: prompt }],
            }),
        });
        return normalizeTotoOutput(extractTextFromResponse(apiType, data));
    }

    const data = await fetchJsonCandidates(buildOpenAiChatUrls(endpoint), {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'authorization': apiKey ? `Bearer ${apiKey}` : '',
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature,
            max_tokens: maxTokens,
        }),
    });
    return normalizeTotoOutput(extractTextFromResponse(apiType, data));
}

function markMessageSaved() {
    const context = getContext();
    try { context?.saveChat?.(); } catch {}
    try { context?.saveChatConditional?.(); } catch {}
    try { globalThis.saveChatConditional?.(); } catch {}
}

function refreshChatView(index) {
    const context = getContext();
    try { context?.eventSource?.emit?.(context?.event_types?.MESSAGE_UPDATED, index); } catch {}
    try { context?.reloadCurrentChat?.(); } catch {}
}


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForStableAssistantText(index, { checks = 3, interval = 700 } = {}) {
    let stable = 0;
    let previous = '';
    while (stable < checks) {
        const message = getChat()[index];
        if (!message || message.is_user) return '';
        const current = cleanAssistantText(message.mes || '');
        if (!current || hasTotoBlock(message.mes || '')) return '';
        if (current === previous) {
            stable += 1;
        } else {
            previous = current;
            stable = 1;
        }
        await sleep(interval);
    }
    return previous;
}

export async function generateRabbitHoleForLatestMessage(options = {}) {
    const settings = getSettings();
    if (!settings.enabled || settings.mode === 'off' || settings.generationMode !== 'sub_api') return;
    if (processing) return;

    const index = getLatestAssistantIndex();
    if (index < 0) return;

    const assistantText = await waitForStableAssistantText(index);
    if (!assistantText) return;

    const chat = getChat();
    const message = chat[index];
    if (!message?.mes || hasTotoBlock(message.mes)) return;

    const signature = buildMessageSignature(index, assistantText);

    // 页面加载、切换设置、保存设置、普通消息刷新时，不要给既有旧回复补生成。
    // 如果本次是从“生成开始 -> 生成结束”链路触发，且最后一条 AI 消息和生成开始前完全一样，说明正文没有新增/重说完成，跳过。
    if (signature === initialLatestSignature) return;
    if (options.startSignature && signature === options.startSignature) {
        if (settings.debug) console.debug('[RabbitHole] skip: latest assistant message did not change after generation event');
        return;
    }
    if (processedSignatures.has(signature) || pendingSignatures.has(signature)) return;

    const contextText = buildReferenceContext(chat, index, settings.subApi?.contextMode || 'current_plus_5');
    const prompt = buildStandaloneRabbitHolePrompt(settings, { assistantText, contextText }, 'sub_api');
    if (!prompt) return;

    processing = true;
    pendingSignatures.add(signature);
    try {
        const toto = await callSubApi(prompt, settings);
        if (!toto) throw new Error('副 API 未返回内容');

        const latest = getChat()[index];
        if (!latest?.mes || hasTotoBlock(latest.mes)) return;

        const latestText = cleanAssistantText(latest.mes);
        const latestSignature = buildMessageSignature(index, latestText);
        if (latestSignature !== signature) {
            if (settings.debug) console.debug('[RabbitHole] message changed while sub API was generating; skip stale append', { signature, latestSignature });
            setTimeout(() => generateRabbitHoleForLatestMessage({ retry: true }), 800);
            return;
        }

        latest.mes = `${latestText}\n\n${toto}`;
        rememberProcessedSignature(signature);
        markMessageSaved();
        refreshChatView(index);
        if (settings.debug) console.debug('[RabbitHole] sub API appended rabbit hole block to message', index);
    } catch (error) {
        console.warn('[RabbitHole] sub API generation failed:', error);
        // 只有真实生成链路触发时才弹窗；避免页面刷新/设置保存造成的后台误报连续打扰。
        if (options.userVisible !== false) {
            toastr?.error?.(`兔子洞副 API 生成失败：${error.message || error}`);
        }
    } finally {
        pendingSignatures.delete(signature);
        processing = false;
    }
}

export function initSubApiGenerator() {
    if (subApiInitialized) return;
    subApiInitialized = true;

    const context = getContext();
    const initialIndex = getLatestAssistantIndex();
    if (initialIndex >= 0) {
        const initialMessage = getChat()[initialIndex];
        initialLatestSignature = buildMessageSignature(initialIndex, initialMessage?.mes || '');
    }
    const eventSource = context?.eventSource;
    const eventTypes = context?.event_types || {};

    let pendingTimer = null;
    let generationStartSignature = initialLatestSignature;

    const captureGenerationStart = () => {
        const index = getLatestAssistantIndex();
        const message = index >= 0 ? getChat()[index] : null;
        generationStartSignature = index >= 0 ? buildMessageSignature(index, message?.mes || '') : '';
        if (getSettings().debug) console.debug('[RabbitHole] capture generation start signature:', generationStartSignature);
    };

    const scheduleAfterGeneration = (reason = 'generation') => {
        clearTimeout(pendingTimer);
        const startSignature = generationStartSignature;
        pendingTimer = setTimeout(() => {
            generateRabbitHoleForLatestMessage({ reason, startSignature, userVisible: true });
        }, 2200);
    };

    if (eventSource?.on) {
        // 只在“真正发生生成/重说”的链路后触发副 API。
        // 不再监听 MESSAGE_UPDATED，也不再轮询，避免还没开始生成正文时反复给旧消息补生成并弹失败。
        const startEvents = [
            eventTypes.GENERATION_STARTED,
            eventTypes.GENERATE_AFTER_DATA,
            eventTypes.MESSAGE_SENT,
        ].filter(Boolean);
        for (const eventName of [...new Set(startEvents)]) {
            try { eventSource.on(eventName, captureGenerationStart); } catch {}
        }

        const finishEvents = [
            eventTypes.MESSAGE_RECEIVED,
            eventTypes.GENERATION_ENDED,
            eventTypes.GENERATION_STOPPED,
        ].filter(Boolean);
        for (const eventName of [...new Set(finishEvents)]) {
            try { eventSource.on(eventName, () => scheduleAfterGeneration(eventName)); } catch {}
        }
    }
}

export function saveFetchedModel(model) {
    updateSubApiSettings({ model });
}
