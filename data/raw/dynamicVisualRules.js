export const DYNAMIC_VISUAL_RULES = String.raw`
视觉复杂度保持:
  enforcement_level: "guidance"
  core_concept: "紧凑 HTML 只限制源码排版方式，不限制视觉复杂度、DOM/CSS 嵌套层级、动态效果或媒介质感"

  rule:
    - "不得因为禁止缩进、注释或 Markdown 代码块，而主动简化 UI、减少层级、删减视觉锚点、降低媒介质感或削弱必要的动态效果"
    - "若本轮展现形式需要动态感、光影感、空间感或媒介质感，可自然使用多层渐变、流动背景、光晕、阴影、纹理、遮罩、filter、backdrop-filter、transform、animation 或 @keyframes 等 CSS 效果"
    - "未开启动态视觉时，动态可按本轮展现形式决定；开启动态视觉时，必须服从 Visual Scenery 的每轮自动持续动画要求"
    - "视觉复杂度必须服务本轮展现形式，不得退化为通用卡片、系统面板或装饰性乱闪"
`;
