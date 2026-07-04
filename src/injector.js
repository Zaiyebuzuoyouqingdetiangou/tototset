import { setExtensionPrompt, extension_prompt_types, extension_prompt_roles } from '../../../../../script.js';
import { MODULE_NAME, getSettings } from './settings.js';
import { buildRabbitHolePrompt } from './promptBuilder.js';

const INJECT_KEY = `${MODULE_NAME}:auto_injection`;

export function clearRabbitHolePrompt() {
    try {
        setExtensionPrompt(INJECT_KEY, '', extension_prompt_types.IN_CHAT, 0, false, extension_prompt_roles.SYSTEM);
    } catch (error) {
        console.warn('[RabbitHole] Failed to clear extension prompt:', error);
    }
}

export async function rabbitHoleGenerateInterceptor(_chat, _contextSize, _abort, type) {
    const settings = getSettings();

    const skipQuiet = settings.skipQuiet && type === 'quiet';
    const skipImpersonate = settings.skipImpersonate && type === 'impersonate';

    if (!settings.enabled || settings.mode === 'off' || skipQuiet || skipImpersonate) {
        clearRabbitHolePrompt();
        return;
    }

    const prompt = buildRabbitHolePrompt(settings, type);
    if (!prompt) {
        clearRabbitHolePrompt();
        return;
    }
    const role = settings.role === 'user' ? extension_prompt_roles.USER : settings.role === 'assistant' ? extension_prompt_roles.ASSISTANT : extension_prompt_roles.SYSTEM;

    setExtensionPrompt(
        INJECT_KEY,
        prompt,
        extension_prompt_types.IN_CHAT,
        Number(settings.depth) || 0,
        false,
        role,
    );
}
