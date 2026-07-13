import { initRabbitMirrorUI } from './src/ui.js';
import { rabbitMirrorGenerateInterceptor, clearRabbitMirrorPrompt } from './src/injector.js';
import { clearLastCombo } from './src/storage.js';
import { initVisualScanner } from './src/visualScanner.js';
import { initOutputSanitizer } from './src/outputSanitizer.js';

// SillyTavern reads this global function name from manifest.json -> generate_interceptor.
globalThis.rabbitMirrorTestGenerateInterceptor = rabbitMirrorGenerateInterceptor;

jQuery(async () => {
    try {
        const migrationKey = 'rabbitMirrorTestVisualReset:0.31.76';
        if (!localStorage.getItem(migrationKey)) {
            clearLastCombo();
            localStorage.setItem(migrationKey, '1');
        }
    } catch {}
    initRabbitMirrorUI();
    initOutputSanitizer();
    initVisualScanner();
    console.log('[RabbitMirror] loaded');
});

export function onDisable() {
    clearRabbitMirrorPrompt();
}

export function onClean() {
    clearRabbitMirrorPrompt();
    clearLastCombo();
}
