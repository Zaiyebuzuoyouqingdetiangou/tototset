import { setExtensionPrompt, extension_prompt_types, extension_prompt_roles } from '../../../../../script.js';
import { MODULE_NAME, getSettings } from './settings.js';
import { buildRabbitMirrorPrompt } from './promptBuilder.js';

const INJECT_KEY = `${MODULE_NAME}:auto_injection`;

export function clearRabbitMirrorPrompt() {
    try {
        setExtensionPrompt(INJECT_KEY, '', extension_prompt_types.IN_CHAT, 0, false, extension_prompt_roles.SYSTEM);
    } catch (error) {
        console.warn('[RabbitMirror] Failed to clear extension prompt:', error);
    }
}

export async function rabbitMirrorGenerateInterceptor(_chat, _contextSize, _abort, type) {
    const settings = getSettings();

    const skipQuiet = settings.skipQuiet && type === 'quiet';
    const skipImpersonate = settings.skipImpersonate && type === 'impersonate';

    if (!settings.enabled || !settings.autoRabbitMirrorInjection || settings.mode === 'off' || skipQuiet || skipImpersonate) {
        clearRabbitMirrorPrompt();
        return;
    }

    const prompt = buildRabbitMirrorPrompt(settings, type);
    if (!prompt) {
        clearRabbitMirrorPrompt();
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
