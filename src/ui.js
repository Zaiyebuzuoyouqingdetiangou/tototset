import { getSettings, updateSettings, resetSettings } from './settings.js';
import { clearLastCombo } from './storage.js';
import { clearRabbitHolePrompt } from './injector.js';
import { triggerCodeBlockRescue } from './outputSanitizer.js';

function checked(id, value) {
    $(id).prop('checked', !!value);
}

export function initRabbitHoleUI() {
    const settings = getSettings();
    const noSendRegex = '/```(?:html|xml|HTML|XML)?\\s*<toto\\b[^>]*>[\\s\\S]*?<\\/toto>\\s*```|<toto\\b[^>]*>[\\s\\S]*?<\\/toto>\\s*/gi';
    if ($('#rabbit_hole_theater_settings').length) return;

    const html = `
<div id="rabbit_hole_theater_settings" class="rabbit-hole-settings">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>兔子洞小剧场 / Rabbit Hole Theater</b><span class="rabbit-hole-toto-watermark">Toto v0.31.23-test</span>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <label class="checkbox_label"><input id="rh_enabled" type="checkbox"> 兔子洞自动注入</label>
      <div class="rabbit-hole-subnote" style="margin:-2px 0 6px 26px;opacity:.72;font-size:12px;line-height:1.45;">开启后每轮自动追加兔子洞规则。</div>

      <label for="rh_injection_mode" class="flex-container alignitemscenter" style="gap:8px;flex-wrap:wrap;margin:8px 0;">
        <span>兔子洞注入模式</span>
        <select id="rh_injection_mode" class="text_pole" style="max-width:260px;">
          <option value="lite">轻量规则模式</option>
          <option value="full">完整规则模式</option>
        </select>
      </label>
      <div class="rabbit-hole-subnote" style="margin:-4px 0 8px 0;opacity:.72;font-size:12px;line-height:1.45;">轻量模式更省 token、重点更集中；完整模式为测试用压缩审美核心，不再塞入冗长重复规则。</div>

      <label class="checkbox_label"><input id="rh_user_directive" type="checkbox"> 用户指令优先（正文/兔子洞点播）</label>

      <label for="rh_sampling_mode" class="flex-container alignitemscenter" style="gap:8px;flex-wrap:wrap;margin:8px 0;">
        <span>抽取模式</span>
        <select id="rh_sampling_mode" class="text_pole" style="max-width:260px;">
          <option value="classic">主题元素 + 展现形式（经典模式）</option>
          <option value="format_only">仅展现形式</option>
        </select>
      </label>

      <label class="checkbox_label"><input id="rh_creative_expansion" type="checkbox"> 发散孵化模式（测试版）</label>
      <div class="rabbit-hole-subnote" style="margin:-2px 0 6px 26px;opacity:.72;font-size:12px;line-height:1.45;">开启后，主题元素与展现形式只作为灵感基底，允许根据正文氛围发散出元素库之外的新内容、新媒介、新细节与新结构。</div>

      <label class="checkbox_label"><input id="rh_force_visual_scenery" type="checkbox"> 动态渐变模式</label>
      <div class="rabbit-hole-subnote" style="margin:-2px 0 6px 26px;opacity:.72;font-size:12px;line-height:1.45;">开启后允许生成纯 CSS 风景与流动渐变效果。</div>

      <label class="checkbox_label"><input id="rh_ui_audit" type="checkbox"> UI 自查优化 / 丰富版式</label>
      <label class="checkbox_label"><input id="rh_avoid_repeat" type="checkbox"> 10轮冷却：避免重复主题/展现形式/近似视觉观感</label>
      <div class="rabbit-hole-subnote" style="margin:-2px 0 6px 26px;opacity:.72;font-size:12px;line-height:1.45;">仅记录已经实际生成成功的兔子洞；不会第一轮预抽未来 10 轮。</div>

      <div class="rabbit-hole-emergency rabbit-hole-emergency-prominent" style="margin:12px 0 10px 0;padding:10px;border:1px solid var(--SmartThemeBorderColor);border-radius:8px;line-height:1.55;">
        <label class="checkbox_label" style="font-weight:600;"><input id="rh_codeblock_rescue" type="checkbox"> 代码块急救模式</label>
        <div class="rabbit-hole-subnote" style="margin:-2px 0 0 26px;opacity:.78;font-size:12px;line-height:1.45;">兔子洞变成代码块时临时开启，查看渲染效果后请关闭；平时开启可能让 UI 变普通。</div>
      </div>

      <div class="rabbit-hole-regex-helper" style="margin:10px 0;padding:10px;border:1px solid var(--SmartThemeBorderColor);border-radius:8px;line-height:1.55;">
        <div style="font-weight:600;margin-bottom:6px;">不发送小剧场正则</div>
        <div style="opacity:.82;font-size:12px;margin-bottom:8px;">设置：替换留空／勾选 AI输出／勾选 仅格式提示词</div>
        <button id="rh_copy_regex" class="menu_button" type="button">复制推荐正则</button>
      </div>

      <div class="rabbit-hole-actions">
        <button id="rh_clear_last" class="menu_button">清除历史与冷却记录</button>
        <button id="rh_clear_injection" class="menu_button">清空当前注入</button>
        <button id="rh_reset" class="menu_button">恢复默认设置</button>
      </div>
    </div>
  </div>
</div>`;

    $('#extensions_settings2').append(html);

    checked('#rh_enabled', settings.autoRabbitHoleInjection !== false && settings.enabled !== false);
    checked('#rh_codeblock_rescue', settings.codeBlockRescueMode);
    $('#rh_injection_mode').val(settings.injectionMode || 'lite');
    $('#rh_sampling_mode').val(settings.samplingMode || 'classic');
    checked('#rh_user_directive', settings.userDirectivePriority);
    checked('#rh_creative_expansion', settings.creativeExpansionMode);
    checked('#rh_force_visual_scenery', settings.forceVisualScenery);
    checked('#rh_ui_audit', settings.uiAudit);
    checked('#rh_avoid_repeat', settings.avoidRepeat);

    $('#rh_enabled').on('change', e => updateSettings({ enabled: e.target.checked, autoRabbitHoleInjection: e.target.checked, mode: e.target.checked ? 'integrated' : 'off' }));
    $('#rh_codeblock_rescue').on('change', e => {
        updateSettings({ codeBlockRescueMode: e.target.checked });
        if (e.target.checked) {
            toastr?.info?.('已开启代码块急救模式：正在尝试修复当前聊天中的代码块兔子洞。查看完成后建议关闭，以免影响后续 UI 发挥。');
            setTimeout(() => triggerCodeBlockRescue(), 80);
            setTimeout(() => triggerCodeBlockRescue(), 350);
            setTimeout(() => triggerCodeBlockRescue(), 900);
        } else {
            toastr?.success?.('已关闭代码块急救模式：后续兔子洞将恢复自由渲染。');
        }
    });
    $('#rh_injection_mode').on('change', e => updateSettings({ injectionMode: e.target.value }));
    $('#rh_sampling_mode').on('change', e => updateSettings({ samplingMode: e.target.value }));
    $('#rh_user_directive').on('change', e => updateSettings({ userDirectivePriority: e.target.checked }));
    $('#rh_creative_expansion').on('change', e => updateSettings({ creativeExpansionMode: e.target.checked }));
    $('#rh_force_visual_scenery').on('change', e => updateSettings({ forceVisualScenery: e.target.checked }));
    $('#rh_ui_audit').on('change', e => updateSettings({ uiAudit: e.target.checked }));
    $('#rh_avoid_repeat').on('change', e => updateSettings({ avoidRepeat: e.target.checked }));

    $('#rh_copy_regex').on('click', async () => {
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

    $('#rh_clear_last').on('click', () => {
        clearLastCombo();
        toastr?.success?.('已清除兔子洞上轮组合记录');
    });
    $('#rh_clear_injection').on('click', () => {
        clearRabbitHolePrompt();
        toastr?.success?.('已清空当前兔子洞注入');
    });
    $('#rh_reset').on('click', () => {
        resetSettings();
        location.reload();
    });
}
