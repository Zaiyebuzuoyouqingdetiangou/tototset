import { initRabbitMirrorUI } from './src/ui.js';
import { rabbitMirrorGenerateInterceptor, clearRabbitMirrorPrompt } from './src/injector.js';
import { clearLastCombo } from './src/storage.js';
import { initVisualScanner } from './src/visualScanner.js';
import { initOutputSanitizer } from './src/outputSanitizer.js';

// SillyTavern reads this global function name from manifest.json -> generate_interceptor.
globalThis.rabbitMirrorTestGenerateInterceptor = rabbitMirrorGenerateInterceptor;

let rabbitMirrorTestStarted = false;
function startRabbitMirrorTest() {
    if (rabbitMirrorTestStarted) return;
    rabbitMirrorTestStarted = true;
    try {
        const migrationKey = 'rabbitMirrorTestVisualReset:0.31.78';
        if (!localStorage.getItem(migrationKey)) {
            clearLastCombo();
            localStorage.setItem(migrationKey, '1');
        }
    } catch {}
    try { initRabbitMirrorUI(); } catch (error) { console.error('[RabbitMirror Test] UI init failed', error); }
    try { initOutputSanitizer(); } catch (error) { console.error('[RabbitMirror Test] sanitizer init failed', error); }
    try { initVisualScanner(); } catch (error) { console.error('[RabbitMirror Test] scanner init failed', error); }
    console.log('[RabbitMirror Test] loaded');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startRabbitMirrorTest, { once: true });
} else {
    startRabbitMirrorTest();
}
try { jQuery(startRabbitMirrorTest); } catch {}

export function onDisable() {
    clearRabbitMirrorPrompt();
}

export function onClean() {
    clearRabbitMirrorPrompt();
    clearLastCombo();
}
