const STORAGE_KEY = 'rabbit_hole_theater:last_combo:test_v10';
const PENDING_KEY = 'rabbit_hole_theater:pending_combo:test_v10';
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
    return history.slice(-Math.max(0, Number(limit) || 10));
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

export function setPendingCombo(combo) {
    try {
        if (!combo) return;
        const pending = { ...combo, signature: signatureOf(combo), pendingTs: Date.now() };
        localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    } catch (error) {
        console.warn('[RabbitHole] Failed to store pending combo:', error);
    }
}

export function commitPendingCombo(visualSignature = '', visualSkeleton = '') {
    try {
        const raw = localStorage.getItem(PENDING_KEY);
        if (!raw) return;
        const pending = JSON.parse(raw);
        if (!pending || typeof pending !== 'object') return;

        const history = readHistory();
        const now = Date.now();
        const sig = pending.signature || signatureOf(pending);
        const last = history[history.length - 1];
        if (last?.signature === sig && now - Number(last?.ts || 0) < 120000) {
            if (visualSignature) last.visualSignature = String(visualSignature).slice(0, 280);
            if (visualSkeleton) last.visualSkeleton = String(visualSkeleton).slice(0, 360);
            last.visualSignatureTs = now;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_STORED)));
            localStorage.removeItem(PENDING_KEY);
            return;
        }

        history.push({
            ...pending,
            signature: sig,
            ts: now,
            visualSignature: visualSignature ? String(visualSignature).slice(0, 280) : pending.visualSignature,
            visualSkeleton: visualSkeleton ? String(visualSkeleton).slice(0, 360) : pending.visualSkeleton,
            visualSignatureTs: visualSignature || visualSkeleton ? now : undefined,
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_STORED)));
        localStorage.removeItem(PENDING_KEY);
    } catch (error) {
        console.warn('[RabbitHole] Failed to commit pending combo:', error);
    }
}

// 兼容旧调用：0.31.21 起不再在 prompt 构建时直接写入“最近历史”，只暂存为 pending。
export function setLastCombo(combo) {
    setPendingCombo(combo);
}

export function clearLastCombo() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(PENDING_KEY);
        // 清理旧版 key，防止旧记录混淆。
        localStorage.removeItem('rabbit_hole_theater:last_combo:v3');
        localStorage.removeItem('rabbit_hole_theater:last_combo:v4');
        localStorage.removeItem('rabbit_hole_theater:last_combo:v5');
        localStorage.removeItem('rabbit_hole_theater:last_combo:v6');
        localStorage.removeItem('rabbit_hole_theater:last_combo:v7');
        localStorage.removeItem('rabbit_hole_theater:last_combo:v8');
        localStorage.removeItem('rabbit_hole_theater:pending_combo:v8');
    } catch {}
}

export function updateLatestVisualSignature(visualSignature, visualSkeleton = '') {
    if (!visualSignature && !visualSkeleton) return;
    try {
        commitPendingCombo(visualSignature, visualSkeleton);
        const history = readHistory();
        if (!history.length) return;
        const last = history[history.length - 1];
        if (visualSignature) last.visualSignature = String(visualSignature).slice(0, 280);
        if (visualSkeleton) last.visualSkeleton = String(visualSkeleton).slice(0, 360);
        last.visualSignatureTs = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_STORED)));
    } catch (error) {
        console.warn('[RabbitHole] Failed to store visual signature:', error);
    }
}
