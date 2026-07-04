const STORAGE_KEY = 'rabbit_hole_theater:last_combo:v7';
const MAX_STORED = 20;

function readHistory() {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        if (Array.isArray(raw)) return raw;
        if (raw && typeof raw === 'object') return [raw];
        return [];
    } catch {
        return [];
    }
}

function signatureOf(combo) {
    return JSON.stringify({
        themeIds: combo?.themeIds || [],
        formatIds: combo?.formatIds || [],
        samplingMode: combo?.samplingMode || 'classic',
        forcedVisualScenery: !!combo?.forcedVisualScenery,
    });
}

export function getComboHistory(limit = 10) {
    const history = readHistory();
    return history.slice(-Math.max(1, Number(limit) || 10));
}

export function getLastCombo() {
    const history = readHistory();
    return history[history.length - 1] || {};
}

export function getRecentIds(limit = 10) {
    const history = getComboHistory(limit);
    const themeIds = new Set();
    const formatIds = new Set();
    const themeGroups = new Set();
    const formatGroups = new Set();
    const uiReviewFocus = [];

    for (const combo of history) {
        for (const id of combo?.themeIds || []) themeIds.add(id);
        for (const id of combo?.formatIds || []) formatIds.add(id);
        for (const id of combo?.themeGroups || []) themeGroups.add(id);
        for (const id of combo?.formatGroups || []) formatGroups.add(id);
        if (Array.isArray(combo?.uiReviewFocus) && combo.uiReviewFocus.length) {
            uiReviewFocus.push(combo.uiReviewFocus.join('；'));
        }
    }

    return {
        themeIds: [...themeIds],
        formatIds: [...formatIds],
        themeGroups: [...themeGroups],
        formatGroups: [...formatGroups],
        uiReviewFocus: uiReviewFocus.slice(-limit),
    };
}

export function setLastCombo(combo) {
    try {
        const history = readHistory();
        const now = Date.now();
        const sig = signatureOf(combo);
        const last = history[history.length - 1];
        // SillyTavern 可能在真正生成前多次构建 prompt。相同组合短时间内只记录一次，避免第一轮就塞满 10 轮历史。
        if (last?.signature === sig && now - Number(last?.ts || 0) < 120000) {
            return;
        }
        history.push({ ...combo, signature: sig, ts: now });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_STORED)));
    } catch (error) {
        console.warn('[RabbitHole] Failed to store combo history:', error);
    }
}

export function clearLastCombo() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        // 清理旧版 key，防止旧记录混淆。
        localStorage.removeItem('rabbit_hole_theater:last_combo:v3');
        localStorage.removeItem('rabbit_hole_theater:last_combo:v4');
        localStorage.removeItem('rabbit_hole_theater:last_combo:v5');
        localStorage.removeItem('rabbit_hole_theater:last_combo:v6');
    } catch {}
}
