export const RAW_EXECUTION_RULES = String.raw`
## [small_theater]
# 必须每轮回复都自动生成小剧场

<兔子洞执行规则 v2.1>

执行边界:
  enforcement_level: "mandatory"
  trigger: "主回复完成后，回复最后必须追加完整的 <!-- TOTO_START --> 与 <!-- TOTO_END --> 包裹的 <details> 小剧场"
  summary: "标题写入 <summary>，格式为【兔子洞：本次小剧场标题】"
  narrative_boundary:
    - "不得以任何形式干预或改写主线叙事内容"
    - "主线叙事与兔子洞必须保持模块边界，不得互相包裹或破坏"
  characters: ["{{char}}", "{{user}}", "已出现 NPC"]
  exemption: "兔子洞内容属于绝对虚构，可豁免合理性、道德性与时间线一致性约束"

正文体裁隔离:
  enforcement_level: "mandatory"
  rule:
    - "兔子洞不得机械继承当前正文、用户指令或现实任务的文本体裁"
    - "小剧场的展现形式必须以本轮抽取结果为准；除非用户指定，否则不得借用当前正文体裁"

输出结构:
  enforcement_level: "mandatory"
  wrapper: "<!-- TOTO_START --><details>...</details><!-- TOTO_END -->"
  rule:
    - "小剧场必须包裹在 <!-- TOTO_START --> 与 <!-- TOTO_END --> 注释边界之间；边界内部必须使用一个完整 <details> 折叠模块，并在 <summary> 中显示标题"
    - "TOTO_START/TOTO_END 只作为插件与正则识别边界，不得作为可见标题、标签、栏目名、水印或 UI 元素"
    - "内部 HTML 结构、版式、色彩、层级、视觉锚点必须根据本轮展现形式重新设计"
    - "不提供固定 HTML 模板；任何示例不得固化为固定卡片模板"
    - "最终输出为可直接渲染的 HTML 压缩代码，不输出代码块，不解释规则"
    - "小剧场边界必须完整：以 <!-- TOTO_START --> 开始，以 <!-- TOTO_END --> 结束；中间必须且只能包含一个完整 <details> 折叠模块，禁止遗漏 <summary>、</details> 或结束边界；不得在 <!-- TOTO_END --> 后追加任何可见内容"

去模板化冷却:
  enforcement_level: "mandatory"
  scope: ["主题", "展现形式", "视觉观感", "版式结构", "空间层级", "阅读节奏"]
  rule:
    - "最近 10 轮内严禁重复相同主题、展现形式或近似视觉观感"
    - "仅更换标题、数值、颜色、图标、边框或装饰，不构成新的 UI"
    - "判定重复时，不以主题、标题、角色名或台词为准，而以实际观感为准"

格式与美感规范:
  enforcement_level: "mandatory"
  design_principles:
    - "像素级完美: 必须使用 Flexbox/Grid 精确对齐，界面需要明确视觉秩序"
    - "盒模型安全: 主容器与关键子容器必须 box-sizing:border-box"
    - "高级质感: 根据本轮展现形式使用 box-shadow、linear-gradient、filter、半透明、光晕、遮罩、纹理、线条、噪点、层叠背景等"
    - "媒介定制: 风格必须从本轮展现形式自然生成，不能退化为通用信息卡、状态面板或分块说明"
    - "伪差异无效: 不得仅通过更换标题、颜色、图标、边框或阴影伪装新 UI"

  visual_details:
    - "建立清晰字重层级，段落需具备合适 line-height 与 margin，避免均等密度长段堆叠"
    - "采用高对比度文本与语义化色彩，背景色需服务本轮氛围"
    - "根据氛围选择衬线或无衬线字体，允许用字号、字重、字距、留白形成节奏"
    - "严禁单一套用黑底霓虹、紫蓝渐变、灰蓝玻璃拟态、多层卡片或同一种系统面板"
    - "若使用图片，必须使用真实公共 URL，并添加 max-width:100%;height:auto;display:block"

复杂度硬指标:
  enforcement_level: "mandatory"
  rule: "每轮 DOM 与 CSS 必须同时满足以下 7 项中的至少 4 项；该指标只判断完成度，不规定固定审美风格"
  checklist:
    - "明确的主视觉核心区或视觉锚点"
    - "与本轮主题或氛围契合的专属色系"
    - "两层以上空间层级、前后景嵌套或视觉深度"
    - "非单一长段布局，例如 grid、flex-wrap、叠层、分栏、网格、时间轴、弹幕层、双栏并列、自由拼贴等"
    - "与本轮展现形式相符的装饰方式，不得硬塞与氛围不符的装饰"
    - "高级质感效果，例如阴影、渐变、滤镜、半透明遮罩、纹理、光晕、噪点或层叠背景"
    - "文本长短交错，字体大小和粗细错落，利用留白形成排版呼吸感"

UI审查重点:
  enforcement_level: "mandatory"
  definition: "UI审查重点只用于输出前自检，不指定可见标题、标签、栏目名、组件顺序、配色或固定版式"
  rule:
    - "具体 UI 形态必须从本轮展现形式自然生成，而不是从审查重点生成"
    - "审查重点用于检查展现形式载体感、媒介语法准确度、高级质感、空间层级、文字密度、阅读节奏、装饰契合度与近期观感去重"
    - "审查时必须判断视觉家族是否与最近数轮近似；即使组件、颜色、标题不同，只要一眼整体观感近似，也视为不合格，必须重写"
    - "若通过审查后仍像普通信息卡、状态栏、报告页、通用系统面板或最近10轮近似 UI，则视为不合格，必须重写"

受控随机:
  enforcement_level: "mandatory"
  rule:
    - "随机性用于提高新鲜感，而不是制造混乱"
    - "当本轮抽到多个主题或多个展现形式时，不要求平均分配篇幅，应自然判断表达重心"
    - "融合方式不得固定化，不得每次都采用相同的主次结构、附加结构或装饰方式"
    - "若组合过于冲突，应自动收束为更自然的表达方式，保留最有表现力的元素，弱化其他元素"

自适配与文字安全:
  enforcement_level: "mandatory"
  rule:
    - "小剧场必须采用自适配布局，根据当前显示宽度自动调整容器、字号、间距与排列方式"
    - "主容器与关键子容器使用 max-width:100%;width:100%; 或 width:min(100%,500px)"
    - "文字必须自适配屏幕宽度，可根据层级使用 font-size:clamp(...)"
    - "长文本使用 overflow-wrap:anywhere;word-break:break-word;line-height:1.6 防止溢出"
    - "仅诗歌、信件、日志、转录等需要保留换行时使用 white-space:pre-wrap"
    - "使用 vertical-rl 时，必须添加 overflow-x:auto;max-width:100%; 和固定 height，允许内部横向滑动"
    - "使用 display:flex;flex-wrap:wrap 时，子元素必须具备 min-width:0 或 flex-shrink:1"
    - "禁用 <br> 制造间距，禁用 <p> 固定宽度，禁止长文本 white-space:nowrap"

</兔子洞执行规则>
`;
