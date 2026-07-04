import { getSettings, updateSettings, updateSubApiSettings, resetSettings } from './settings.js';
import { clearLastCombo } from './storage.js';
import { clearRabbitHolePrompt } from './injector.js';
import { fetchSubApiModels, saveFetchedModel } from './subApi.js';

function checked(id, value) {
    $(id).prop('checked', !!value);
}

function value(id, value) {
    $(id).val(value ?? '');
}

function toggleSubApiPanel() {
    const settings = getSettings();
    $('#rh_sub_api_panel').toggle(settings.generationMode === 'sub_api');
}


function closeModelPicker() {
    $('#rh_model_picker_overlay').remove();
}

function openModelPicker(models) {
    const uniqueModels = [...new Set(models)].filter(Boolean);
    if (!uniqueModels.length) return;
    closeModelPicker();

    const current = $('#rh_sub_api_model').val() || uniqueModels[0];
    const options = uniqueModels.map(model => `<option value="${String(model).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}" ${model === current ? 'selected' : ''}>${String(model).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</option>`).join('');
    const html = `
<div id="rh_model_picker_overlay" style="position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;">
  <div style="width:min(92vw,560px);max-height:82vh;overflow:auto;background:var(--SmartThemeBlurTintColor, var(--SmartThemeBodyColor, #222));color:var(--SmartThemeTextColor, #fff);border:1px solid var(--SmartThemeBorderColor,#777);border-radius:12px;padding:14px;box-shadow:0 16px 48px rgba(0,0,0,.35);box-sizing:border-box;">
    <div style="font-weight:700;font-size:16px;margin-bottom:8px;">选择副 API 模型</div>
    <div style="opacity:.75;font-size:12px;line-height:1.45;margin-bottom:10px;">已拉取 ${uniqueModels.length} 个模型。选择后点击“保存模型”。</div>
    <input id="rh_model_picker_filter" class="text_pole" type="text" placeholder="筛选模型名" style="width:100%;box-sizing:border-box;margin-bottom:8px;">
    <select id="rh_model_picker_select" class="text_pole" size="12" style="width:100%;box-sizing:border-box;min-height:220px;">${options}</select>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap;">
      <button id="rh_model_picker_save" class="menu_button" type="button">保存模型</button>
      <button id="rh_model_picker_cancel" class="menu_button" type="button">取消</button>
    </div>
  </div>
</div>`;
    $('body').append(html);

    $('#rh_model_picker_cancel').on('click', closeModelPicker);
    $('#rh_model_picker_overlay').on('click', (event) => {
        if (event.target?.id === 'rh_model_picker_overlay') closeModelPicker();
    });
    $('#rh_model_picker_filter').on('input', e => {
        const q = String(e.target.value || '').toLowerCase();
        const filtered = uniqueModels.filter(model => String(model).toLowerCase().includes(q));
        $('#rh_model_picker_select').empty();
        for (const model of filtered) $('#rh_model_picker_select').append($('<option>').attr('value', model).text(model));
    });
    $('#rh_model_picker_select').on('dblclick', () => $('#rh_model_picker_save').trigger('click'));
    $('#rh_model_picker_save').on('click', () => {
        const model = $('#rh_model_picker_select').val();
        if (!model) {
            toastr?.warning?.('请选择模型');
            return;
        }
        $('#rh_sub_api_model').val(model);
        saveFetchedModel(model);
        $('#rh_fetch_models_status').text(`已保存模型：${model}`);
        toastr?.success?.('已保存副 API 模型');
        closeModelPicker();
    });
}

export function initRabbitHoleUI() {
    const settings = getSettings();
    const noSendRegex = String.raw`/<!--\s*TOTO_START\s*-->[\s\S]*?<!--\s*TOTO_END\s*-->\s*/gi`;
    if ($('#rabbit_hole_theater_settings').length) return;

    const html = `
<div id="rabbit_hole_theater_settings" class="rabbit-hole-settings">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>兔子洞小剧场 / Rabbit Hole Theater</b><span class="rabbit-hole-toto-watermark">Toto v0.22</span>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <label class="checkbox_label"><input id="rh_enabled" type="checkbox"> 启用兔子洞自动注入</label>

      <label for="rh_generation_mode" class="flex-container alignitemscenter" style="gap:8px;flex-wrap:wrap;margin:8px 0;">
        <span>兔子洞生成模式</span>
        <select id="rh_generation_mode" class="text_pole" style="max-width:260px;">
          <option value="main">跟随主模型生成</option>
          <option value="sub_api">使用副 API 独立生成</option>
        </select>
      </label>

      <div id="rh_sub_api_panel" style="margin:10px 0;padding:10px;border:1px solid var(--SmartThemeBorderColor);border-radius:8px;">
        <div style="font-weight:600;margin-bottom:8px;">副 API 设置</div>

        <label for="rh_sub_api_type" class="flex-container alignitemscenter" style="gap:8px;flex-wrap:wrap;margin:6px 0;">
          <span>API 类型</span>
          <select id="rh_sub_api_type" class="text_pole" style="max-width:220px;">
            <option value="openai">OpenAI 兼容</option>
            <option value="gemini">Gemini 兼容</option>
            <option value="anthropic">Claude / Anthropic 兼容</option>
            <option value="custom">自定义 / 手动填写模型</option>
          </select>
        </label>

        <label style="display:block;margin:6px 0;">API 地址
          <input id="rh_sub_api_endpoint" class="text_pole" type="text" placeholder="例如：https://api.example.com/v1" style="width:100%;box-sizing:border-box;">
        </label>

        <label style="display:block;margin:6px 0;">API Key
          <input id="rh_sub_api_key" class="text_pole" type="password" placeholder="保存在本地设置中" style="width:100%;box-sizing:border-box;">
        </label>

        <label style="display:block;margin:6px 0;">模型名
          <input id="rh_sub_api_model" class="text_pole" type="text" list="rh_sub_api_models" placeholder="可手动填写，也可点击拉取模型列表" style="width:100%;box-sizing:border-box;">
          <datalist id="rh_sub_api_models"></datalist>
        </label>

        <div class="flex-container alignitemscenter" style="gap:8px;flex-wrap:wrap;margin:6px 0;">
          <button id="rh_fetch_models" class="menu_button" type="button">拉取模型列表</button>
          <span id="rh_fetch_models_status" style="opacity:.75;font-size:12px;"></span>
        </div>

        <label for="rh_sub_api_temperature" class="flex-container alignitemscenter" style="gap:8px;flex-wrap:wrap;margin:6px 0;">
          <span>温度</span>
          <input id="rh_sub_api_temperature" class="text_pole" type="number" min="0" max="2" step="0.05" style="max-width:100px;">
        </label>

        <label for="rh_sub_api_max_tokens" class="flex-container alignitemscenter" style="gap:8px;flex-wrap:wrap;margin:6px 0;">
          <span>最大输出 token</span>
          <input id="rh_sub_api_max_tokens" class="text_pole" type="number" min="512" max="32768" step="512" style="max-width:130px;">
        </label>
        <div style="opacity:.72;font-size:12px;line-height:1.45;margin-top:-2px;margin-bottom:6px;">默认 16000，适合复杂 HTML 小剧场。实际上限取决于副 API 和模型。</div>

        <label for="rh_sub_api_context" class="flex-container alignitemscenter" style="gap:8px;flex-wrap:wrap;margin:6px 0;">
          <span>副 API 参考上下文</span>
          <select id="rh_sub_api_context" class="text_pole" style="max-width:240px;">
            <option value="current">仅本轮正文</option>
            <option value="current_plus_1">本轮正文 + 最近1轮聊天</option>
            <option value="current_plus_3">本轮正文 + 最近3轮聊天</option>
            <option value="current_plus_5">本轮正文 + 最近5轮聊天</option>
          </select>
        </label>
        <div style="opacity:.72;font-size:12px;line-height:1.45;">默认推荐最近5轮。</div>
      </div>

      <label for="rh_sampling_mode" class="flex-container alignitemscenter" style="gap:8px;flex-wrap:wrap;margin:8px 0;">
        <span>抽取模式</span>
        <select id="rh_sampling_mode" class="text_pole" style="max-width:260px;">
          <option value="classic">主题元素 + 展现形式（经典模式）</option>
          <option value="format_only">仅展现形式</option>
        </select>
      </label>

      <label class="checkbox_label"><input id="rh_show_cot" type="checkbox"> 输出 &lt;thinking&gt; 执行摘要</label>
      <label class="checkbox_label"><input id="rh_user_directive" type="checkbox"> 正文指令优先</label>
      <label class="checkbox_label"><input id="rh_force_visual_scenery" type="checkbox"> Visual Scenery 动态渐变模式</label>
      <label class="checkbox_label"><input id="rh_ui_audit" type="checkbox"> UI 自查优化 / 丰富版式</label>
      <label class="checkbox_label"><input id="rh_avoid_repeat" type="checkbox"> 10轮冷却：避免重复主题/展现形式/近似视觉观感</label>
      <label class="checkbox_label"><input id="rh_skip_quiet" type="checkbox"> 跳过 quiet 后台生成</label>
      <label class="checkbox_label"><input id="rh_skip_impersonate" type="checkbox"> 跳过 impersonate 生成</label>
      <label class="checkbox_label"><input id="rh_debug" type="checkbox"> 控制台调试日志</label>

      <div class="rabbit-hole-regex-helper" style="margin:10px 0;padding:10px;border:1px solid var(--SmartThemeBorderColor);border-radius:8px;line-height:1.55;">
        <div style="font-weight:600;margin-bottom:6px;">不发送小剧场正则</div>
        <div style="opacity:.82;font-size:12px;margin-bottom:8px;">设置：替换留空／勾选 AI输出／勾选 仅格式提示词</div>
        <button id="rh_copy_regex" class="menu_button" type="button">复制推荐正则</button>
      </div>

      <div class="rabbit-hole-actions">
        <button id="rh_clear_last" class="menu_button">清除上轮组合记录</button>
        <button id="rh_clear_injection" class="menu_button">清空当前注入</button>
        <button id="rh_reset" class="menu_button">恢复默认设置</button>
      </div>
    </div>
  </div>
</div>`;

    $('#extensions_settings2').append(html);

    checked('#rh_enabled', settings.enabled);
    value('#rh_generation_mode', settings.generationMode || 'main');
    value('#rh_sub_api_type', settings.subApi?.apiType || 'openai');
    value('#rh_sub_api_endpoint', settings.subApi?.endpoint || '');
    value('#rh_sub_api_key', settings.subApi?.apiKey || '');
    value('#rh_sub_api_model', settings.subApi?.model || '');
    value('#rh_sub_api_temperature', settings.subApi?.temperature ?? 0.95);
    value('#rh_sub_api_max_tokens', settings.subApi?.maxTokens ?? 16000);
    value('#rh_sub_api_context', settings.subApi?.contextMode || 'current_plus_5');
    $('#rh_sampling_mode').val(settings.samplingMode || 'classic');
    checked('#rh_show_cot', settings.showCot);
    checked('#rh_user_directive', settings.userDirectivePriority);
    checked('#rh_force_visual_scenery', settings.forceVisualScenery);
    checked('#rh_ui_audit', settings.uiAudit);
    checked('#rh_avoid_repeat', settings.avoidRepeat);
    checked('#rh_skip_quiet', settings.skipQuiet);
    checked('#rh_skip_impersonate', settings.skipImpersonate);
    checked('#rh_debug', settings.debug);
    toggleSubApiPanel();

    $('#rh_enabled').on('change', e => updateSettings({ enabled: e.target.checked, mode: e.target.checked ? 'integrated' : 'off' }));
    $('#rh_generation_mode').on('change', e => { updateSettings({ generationMode: e.target.value }); toggleSubApiPanel(); });
    $('#rh_sub_api_type').on('change', e => updateSubApiSettings({ apiType: e.target.value }));
    $('#rh_sub_api_endpoint').on('input', e => updateSubApiSettings({ endpoint: e.target.value }));
    $('#rh_sub_api_key').on('input', e => updateSubApiSettings({ apiKey: e.target.value }));
    $('#rh_sub_api_model').on('input', e => updateSubApiSettings({ model: e.target.value }));
    $('#rh_sub_api_temperature').on('input', e => updateSubApiSettings({ temperature: Number(e.target.value) }));
    $('#rh_sub_api_max_tokens').on('input', e => updateSubApiSettings({ maxTokens: Number(e.target.value) }));
    $('#rh_sub_api_context').on('change', e => updateSubApiSettings({ contextMode: e.target.value }));

    $('#rh_sampling_mode').on('change', e => updateSettings({ samplingMode: e.target.value }));
    $('#rh_show_cot').on('change', e => updateSettings({ showCot: e.target.checked }));
    $('#rh_user_directive').on('change', e => updateSettings({ userDirectivePriority: e.target.checked }));
    $('#rh_force_visual_scenery').on('change', e => updateSettings({ forceVisualScenery: e.target.checked }));
    $('#rh_ui_audit').on('change', e => updateSettings({ uiAudit: e.target.checked }));
    $('#rh_avoid_repeat').on('change', e => updateSettings({ avoidRepeat: e.target.checked }));
    $('#rh_skip_quiet').on('change', e => updateSettings({ skipQuiet: e.target.checked }));
    $('#rh_skip_impersonate').on('change', e => updateSettings({ skipImpersonate: e.target.checked }));
    $('#rh_debug').on('change', e => updateSettings({ debug: e.target.checked }));

    $('#rh_fetch_models').on('click', async () => {
        $('#rh_fetch_models_status').text('拉取中...');
        try {
            const models = await fetchSubApiModels(getSettings());
            const uniqueModels = [...new Set(models)].filter(Boolean).slice(0, 500);
            $('#rh_sub_api_models').empty();
            for (const model of uniqueModels) {
                $('#rh_sub_api_models').append($('<option>').attr('value', model));
            }
            if (uniqueModels.length) {
                $('#rh_fetch_models_status').text(`已拉取 ${uniqueModels.length} 个模型，请在弹窗中选择并保存`);
                toastr?.success?.('已拉取模型列表');
                openModelPicker(uniqueModels);
            } else {
                $('#rh_fetch_models_status').text('未找到模型，请手动填写模型名');
                toastr?.warning?.('未找到模型，请手动填写模型名');
            }
        } catch (error) {
            $('#rh_fetch_models_status').text('拉取失败，请手动填写模型名');
            toastr?.error?.(`拉取模型失败：${error.message || error}`);
        }
    });

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
