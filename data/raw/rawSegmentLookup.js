import { RAW_THEMATIC_CATEGORIES } from './rawThematicCategories.js';
import { RAW_PRESENTATION_FORMATS } from './rawPresentationFormats.js';

function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function leadingSpaces(line) {
    const match = line.match(/^\s*/);
    return match ? match[0].length : 0;
}

function isBulletLike(line) {
    return /^\s*(?:[-*]|\d+[.)])\s+/.test(line);
}

function isHeading(line) {
    return /^\s*#{1,6}\s+/.test(line);
}

function hasIdMarker(line, id) {
    if (!id) return false;
    const escaped = escapeRegExp(id);
    const patterns = [
        new RegExp(`\\*\\*\\s*${escaped}(?:\\s|[：:（(]|$)`),
        new RegExp(`\\*\\*\\s*[·•]?${escaped}(?:\\s|[：:（(]|$)`),
        new RegExp(`(?:^|\\s)${escaped}(?:\\s|[：:（(]|$)`),
    ];
    return patterns.some(pattern => pattern.test(line));
}

function hasTitleMarker(line, title) {
    if (!title) return false;
    const normalizedTitle = String(title).replace(/\s+/g, '').toLowerCase();
    const normalizedLine = String(line).replace(/\s+/g, '').toLowerCase();
    return normalizedTitle.length >= 2 && normalizedLine.includes(normalizedTitle);
}

function findStartLine(lines, item) {
    let index = lines.findIndex(line => hasIdMarker(line, item.id));
    if (index >= 0) return index;

    // Some custom items do not have numeric ids in the raw document, e.g. Lookus / Bingo / 直白翻译机.
    index = lines.findIndex(line => isBulletLike(line) && hasTitleMarker(line, item.title));
    if (index >= 0) return index;

    // Last fallback: title anywhere in a non-empty line.
    return lines.findIndex(line => line.trim() && hasTitleMarker(line, item.title));
}

function collectSegment(lines, startIndex) {
    if (startIndex < 0) return '';

    const startLine = lines[startIndex];
    const baseIndent = leadingSpaces(startLine);
    const segment = [startLine];

    for (let i = startIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed) {
            segment.push(line);
            continue;
        }

        const indent = leadingSpaces(line);
        const startsNewSiblingOrParent = indent <= baseIndent && (isBulletLike(line) || isHeading(line));
        if (startsNewSiblingOrParent) break;

        segment.push(line);
    }

    return segment.join('\n').trim();
}

function findRawSegment(rawText, item) {
    const lines = String(rawText || '').split(/\r?\n/);
    const start = findStartLine(lines, item);
    const segment = collectSegment(lines, start);
    return segment || item.raw || `【${item.id} ${item.title}】${item.summary || ''}`;
}

export function resolveThemeRaw(item) {
    return findRawSegment(RAW_THEMATIC_CATEGORIES, item);
}

export function resolvePresentationRaw(item) {
    return findRawSegment(RAW_PRESENTATION_FORMATS, item);
}

export function resolveRawForItem(item, kind) {
    if (kind === 'theme') return resolveThemeRaw(item);
    if (kind === 'presentation') return resolvePresentationRaw(item);
    return item.raw || `【${item.id} ${item.title}】${item.summary || ''}`;
}
