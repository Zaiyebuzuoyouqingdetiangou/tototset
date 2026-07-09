import { initRabbitHoleUI } from './src/ui.js';
import { rabbitHoleGenerateInterceptor, clearRabbitHolePrompt } from './src/injector.js';
import { clearLastCombo } from './src/storage.js';
import { initVisualScanner } from './src/visualScanner.js';
import { initOutputSanitizer } from './src/outputSanitizer.js';

// SillyTavern reads this global function name from manifest.json -> generate_interceptor.
globalThis.rabbitHoleGenerateInterceptor = rabbitHoleGenerateInterceptor;

jQuery(async () => {
    initRabbitHoleUI();
    initOutputSanitizer();
    initVisualScanner();
    console.log('[RabbitHole] loaded');
});

export function onDisable() {
    clearRabbitHolePrompt();
}

export function onClean() {
    clearRabbitHolePrompt();
    clearLastCombo();
}
