import { initRabbitHoleUI } from './src/ui.js';
import { rabbitHoleGenerateInterceptor, clearRabbitHolePrompt } from './src/injector.js';
import { clearLastCombo } from './src/storage.js';
import { initSubApiGenerator } from './src/subApi.js';

// SillyTavern reads this global function name from manifest.json -> generate_interceptor.
globalThis.rabbitHoleTestGenerateInterceptor = rabbitHoleGenerateInterceptor;

jQuery(async () => {
    initRabbitHoleUI();
    initSubApiGenerator();
    console.log('[RabbitHoleTest] loaded');
});

export function onDisable() {
    clearRabbitHolePrompt();
}

export function onClean() {
    clearRabbitHolePrompt();
    clearLastCombo();
}
