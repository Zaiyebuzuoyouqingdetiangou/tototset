import { getSettings, updateSettings, resetSettings } from './settings.js';
import { clearLastCombo } from './storage.js';
import { clearRabbitMirrorPrompt } from './injector.js';
import { triggerCodeBlockRescue, triggerInteractionRescue } from './outputSanitizer.js';

function checked(id, value) {
    $(id).prop('checked', !!value);
}

function findSettingsMount() {
    const selectors = [
        '#extensions_settings2',
        '#extensions_settings',
        '#extensions_settings_content',
        '.extensions_settings',
        '#extensions-settings',
    ];
    for (const selector of selectors) {
        const node = document.querySelector(selector);
        if (node) return node;
    }
    return null;
}

function mountRabbitMirrorUI() {
    const settings = getSettings();
    const noSendRegex = '/```(?:html|xml|HTML|XML)?\\s*<toto\\b[^>]*>[\\s\\S]*?<\\/toto>\\s*```|<toto\\b[^>]*>[\\s\\S]*?<\\/toto>\\s*/gi';
    if ($('#rabbit_mirror_theater_test_settings').length) return;

    const html = `
<div id="rabbit_mirror_theater_test_settings" class="rabbit-mirror-settings">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>兔子镜小剧场 / Rabbit Mirror Theater</b><span class="rabbit-mirror-toto-watermark">Toto TEST v0.31.78</span>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <label class="checkbox_label"><input id="rht_enabled" type="checkbox"> 兔子镜自动注入</label>
      <div class="rabbit-mirror-subnote" style="margin:-2px 0 6px 26px;opacity:.72;font-size:12px;line-height:1.45;">开启后每轮自动追加兔子镜规则。</div>

      <label for="rht_sampling_mode" class="flex-container alignitemscenter" style="gap:8px;flex-wrap:wrap;margin:8px 0;">
        <span>抽取模式</span>
        <select id="rht_sampling_mode" class="text_pole" style="max-width:260px;">
          <option value="classic">主题元素 + 展现形式（经典模式）</option>
          <option value="format_only">仅展现形式</option>
        </select>
      </label>

      <label class="checkbox_label"><input id="rht_creative_expansion" type="checkbox"> 发散孵化模式（测试版）</label>
      <div class="rabbit-mirror-subnote" style="margin:-2px 0 6px 26px;opacity:.72;font-size:12px;line-height:1.45;">开启后，主题元素与展现形式只作为灵感基底，允许根据正文氛围发散出元素库之外的新内容、新媒介、新细节与新结构。</div>

      <label class="checkbox_label"><input id="rht_force_visual_scenery" type="checkbox"> 动态视觉模式</label>
      <div class="rabbit-mirror-subnote" style="margin:-2px 0 6px 26px;opacity:.72;font-size:12px;line-height:1.45;">开启后画面主体必须包含打开即自动持续运行、肉眼可见的 CSS 动画；点击或悬停变化不能代替。</div>

      <label class="checkbox_label"><input id="rht_force_interactive" type="checkbox"> 每轮可交互模式（测试版）</label>
      <div class="rabbit-mirror-subnote" style="margin:-2px 0 6px 26px;opacity:.72;font-size:12px;line-height:1.45;">开启后内部每轮必须包含无需 JS 即可生效的真实交互；关闭时不强制内部交互，只保留外层折叠。</div>

      <label class="checkbox_label"><input id="rht_user_directive" type="checkbox"> 用户指令优先（正文/兔子镜点播）</label>

      <label class="checkbox_label"><input id="rht_ui_audit" type="checkbox"> UI 自查优化 / 丰富版式</label>
      <label class="checkbox_label"><input id="rht_avoid_repeat" type="checkbox"> 10轮冷却：避免重复主题/展现形式/近似视觉观感</label>
      <div class="rabbit-mirror-subnote" style="margin:-2px 0 6px 26px;opacity:.72;font-size:12px;line-height:1.45;">仅记录已经实际生成成功的兔子镜；不会第一轮预抽未来 10 轮。</div>

      <div class="rabbit-mirror-emergency rabbit-mirror-emergency-prominent" style="margin:12px 0 10px 0;padding:10px;border:1px solid var(--SmartThemeBorderColor);border-radius:8px;line-height:1.55;">
        <label class="checkbox_label" style="font-weight:600;"><input id="rht_codeblock_rescue" type="checkbox"> 代码块急救模式</label>
        <div class="rabbit-mirror-subnote" style="margin:-2px 0 8px 26px;opacity:.78;font-size:12px;line-height:1.45;">兔子镜变成代码块时临时开启；先恢复为真实 DOM，不改已有主容器 UI。</div>
        <label class="checkbox_label" style="font-weight:600;"><input id="rht_interaction_rescue" type="checkbox"> 智能交互急救（实验版）</label>
        <div class="rabbit-mirror-subnote" style="margin:-2px 0 0 26px;opacity:.78;font-size:12px;line-height:1.45;">自动识别 checked、hover、嵌套 details 与 :target 交互并选择对应修复路径；可与代码块急救同时开启，固定先恢复代码、再修交互。</div>
      </div>

      <div class="rabbit-mirror-regex-helper" style="margin:10px 0;padding:10px;border:1px solid var(--SmartThemeBorderColor);border-radius:8px;line-height:1.55;">
        <div style="font-weight:600;margin-bottom:6px;">不发送小剧场正则</div>
        <div style="opacity:.82;font-size:12px;margin-bottom:8px;">设置：替换留空／勾选 AI输出／勾选 仅格式提示词</div>
        <button id="rht_copy_regex" class="menu_button" type="button">复制推荐正则</button>
      </div>

      <div class="rabbit-mirror-actions">
        <button id="rht_clear_last" class="menu_button">清除历史与冷却记录</button>
        <button id="rht_clear_injection" class="menu_button">清空当前注入</button>
        <button id="rht_reset" class="menu_button">恢复默认设置</button>
      </div>
    </div>
  </div>
</div>`;

    const mount = findSettingsMount();
    if (!mount) return false;
    mount.insertAdjacentHTML('beforeend', html);

    checked('#rht_enabled', settings.autoRabbitMirrorInjection !== false && settings.enabled !== false);
    checked('#rht_codeblock_rescue', settings.codeBlockRescueMode);
    checked('#rht_interaction_rescue', settings.interactionRescueMode);
    $('#rht_sampling_mode').val(settings.samplingMode || 'classic');
    checked('#rht_user_directive', settings.userDirectivePriority);
    checked('#rht_creative_expansion', settings.creativeExpansionMode);
    checked('#rht_force_visual_scenery', settings.forceVisualScenery);
    checked('#rht_force_interactive', settings.forceInteractiveMode);
    checked('#rht_ui_audit', settings.uiAudit);
    checked('#rht_avoid_repeat', settings.avoidRepeat);

    $('#rht_enabled').on('change', e => updateSettings({ enabled: e.target.checked, autoRabbitMirrorInjection: e.target.checked, mode: e.target.checked ? 'integrated' : 'off' }));
    $('#rht_codeblock_rescue').on('change', e => {
        updateSettings({ codeBlockRescueMode: e.target.checked });
        if (e.target.checked) {
            toastr?.info?.('已开启代码块急救模式：正在尝试修复当前聊天中的代码块兔子镜。查看完成后建议关闭，以免影响后续 UI 发挥。');
            setTimeout(() => triggerCodeBlockRescue(), 80);
            setTimeout(() => triggerCodeBlockRescue(), 350);
            setTimeout(() => triggerCodeBlockRescue(), 900);
        } else {
            toastr?.success?.('已关闭代码块急救模式：后续兔子镜将恢复自由渲染。');
        }
    });
    $('#rht_interaction_rescue').on('change', e => {
        updateSettings({ interactionRescueMode: e.target.checked });
        if (e.target.checked) {
            toastr?.info?.('已开启智能交互急救：正在识别当前兔子镜的交互类型并选择修复路径；与代码块急救同时开启时，会先恢复代码再修交互。');
            const runRescueChain = () => getSettings().codeBlockRescueMode
                ? triggerCodeBlockRescue()
                : triggerInteractionRescue();
            setTimeout(runRescueChain, 80);
            setTimeout(runRescueChain, 350);
            setTimeout(runRescueChain, 900);
        } else {
            toastr?.success?.('已关闭智能交互急救：后续不再处理尚未急救的新兔子镜；已救过的旧消息仍会保持修复。');
        }
    });
    $('#rht_sampling_mode').on('change', e => updateSettings({ samplingMode: e.target.value }));
    $('#rht_user_directive').on('change', e => updateSettings({ userDirectivePriority: e.target.checked }));
    $('#rht_creative_expansion').on('change', e => updateSettings({ creativeExpansionMode: e.target.checked }));
    $('#rht_force_visual_scenery').on('change', e => updateSettings({ forceVisualScenery: e.target.checked }));
    $('#rht_force_interactive').on('change', e => updateSettings({ forceInteractiveMode: e.target.checked }));
    $('#rht_ui_audit').on('change', e => updateSettings({ uiAudit: e.target.checked }));
    $('#rht_avoid_repeat').on('change', e => updateSettings({ avoidRepeat: e.target.checked }));

    $('#rht_copy_regex').on('click', async () => {
        try {
            await navigator.clipboard.writeText(noSendRegex);
            toastr?.success?.('已复制推荐正则');
        } catch (error) {
            const textarea = document.createElement('textarea');
            textarea.value = noSendRegex;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            document.execCommand('copy');
            textarea.remove();
            toastr?.success?.('已复制推荐正则');
        }
    });

    $('#rht_clear_last').on('click', () => {
        clearLastCombo();
        toastr?.success?.('已清除兔子镜上轮组合记录');
    });
    $('#rht_clear_injection').on('click', () => {
        clearRabbitMirrorPrompt();
        toastr?.success?.('已清空当前兔子镜注入');
    });
    $('#rht_reset').on('click', () => {
        resetSettings();
        location.reload();
    });
    return true;
}

export function initRabbitMirrorUI() {
    if (document.getElementById('rabbit_mirror_theater_test_settings')) return;

    let attempts = 0;
    const tryMount = () => {
        attempts += 1;
        try {
            if (mountRabbitMirrorUI()) {
                console.log('[RabbitMirror Test] settings panel mounted');
                return true;
            }
        } catch (error) {
            console.error('[RabbitMirror Test] settings panel mount failed', error);
            try { globalThis.toastr?.error?.('兔子镜测试版设置面板加载失败，请查看浏览器控制台。'); } catch {}
            return true;
        }
        return false;
    };

    if (tryMount()) return;
    const timer = setInterval(() => {
        if (tryMount() || attempts >= 40) {
            clearInterval(timer);
            if (attempts >= 40 && !document.getElementById('rabbit_mirror_theater_test_settings')) {
                console.error('[RabbitMirror Test] no compatible extension settings mount found');
                try { globalThis.toastr?.error?.('兔子镜测试版已启用，但未找到扩展设置容器。请刷新页面后重试。'); } catch {}
            }
        }
    }, 250);
}

