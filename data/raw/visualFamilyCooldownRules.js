export const VISUAL_FAMILY_COOLDOWN_RULES = String.raw`
视觉家族冷却原则:
  enforcement_level: "mandatory"
  core_concept: "拒绝连续近似的一眼整体观感；本规则只用于一票否决，不提供固定模板或可选类型"
  anti_inertia_protocol:
    veto_conditions: "连续复用一眼相似的整体观感即视为重复。即使组件、颜色、标题不同，只要媒介感、材质、空间逻辑、阅读方式或文本密度近似，一律判为不合格，必须重写"
    reappearance_rule: "若最近数轮已出现近似视觉家族，本轮必须从媒介、材质、空间逻辑、阅读方式与整体气质上明显切换"
    false_difference_invalid: "严禁只通过更换颜色、标题、边框、图标、阴影、字段名或术语来伪装差异"
`;
