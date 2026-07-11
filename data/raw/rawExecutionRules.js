export const RAW_EXECUTION_RULES = String.raw`
<兔子镜执行规则 v2.1>

执行边界:
  enforcement_level: "mandatory"
  trigger: "主回复完成后，回复最后必须追加完整 <toto data-rabbit-hole="true" style="display:block;"> 包裹的 <details> 小剧场"
  summary: "标题写入 <summary>，格式为【兔子镜：本次小剧场标题】"
  narrative_boundary:
    - "不得以任何形式干预或改写主线叙事内容"
    - "主线叙事与兔子镜必须保持模块边界，不得互相包裹或破坏"
  characters: ["{{char}}", "{{user}}", "已出现 NPC"]
  exemption: "兔子镜内容属于绝对虚构，可豁免合理性、道德性与时间线一致性约束"

正文体裁隔离:
  enforcement_level: "mandatory"
  rule:
    - "兔子镜不得机械继承当前正文、用户指令或现实任务的文本体裁"
    - "小剧场的展现形式必须以本轮抽取结果为准；除非用户指定，否则不得借用当前正文体裁"

输出结构:
  enforcement_level: "mandatory"
  wrapper: "<toto data-rabbit-hole="true" style="display:block;"><details>...</details></toto>"
  rule:
    - "小剧场最外层必须使用 <toto data-rabbit-hole="true" style="display:block;"> 作为插件识别边界，内部再使用 <details> 折叠模块，并在 <summary> 中显示标题"
    - "<toto> 只作为插件与正则识别边界，不得作为可见标题、标签、栏目名、水印或 UI 元素"
    - "内部 HTML 结构、版式、色彩、层级、视觉锚点必须根据本轮展现形式重新设计"
    - "不提供固定 HTML 模板；任何示例不得固化为固定结构"
    - "最终输出为可直接渲染的紧凑 HTML，不输出代码块，不解释规则"
    - "小剧场最外层必须完整包裹在 <toto data-rabbit-hole="true" style="display:block;"> 与 </toto> 之间，禁止遗漏闭合标签；不得在 </toto> 后追加任何可见内容"

视觉指纹变化:
  enforcement_level: "mandatory"
  rule:
    - "每轮必须形成真实视觉指纹：layout / material / color / type / interaction / hierarchy"
    - "与上一轮相比，六项中至少四项必须变化，并真实体现在 DOM/CSS 的结构、材质、配色、字体层级、交互入口与内容组织中"
    - "不得只换标题、颜色、图标、边框或局部装饰；若整体骨架、阅读路径或内容承载方式仍近似上一轮，必须重写"

格式与美感规范:
  enforcement_level: "mandatory"
  design_principles:
    - "像素级完美: 必须使用 Flexbox/Grid 精确对齐，界面需要明确视觉秩序"
    - "盒模型安全: 主容器与关键子容器必须 box-sizing:border-box"
    - "高级质感: 根据本轮展现形式使用 box-shadow、linear-gradient、filter、半透明、光晕、遮罩、纹理、线条、噪点、层叠背景等"
    - "媒介定制: 风格必须从本轮展现形式自然生成，不能退化为普通内容承载区域或浅层说明"
    - "伪差异无效: 不得仅通过更换标题、颜色、图标、边框或阴影伪装新 UI"

  visual_details:
    - "建立清晰字重层级，段落需具备合适 line-height 与 margin，避免均等密度长段堆叠"
    - "采用高对比度文本与语义化色彩，背景色需服务本轮氛围"
    - "根据氛围选择衬线或无衬线字体，允许用字号、字重、字距、留白形成节奏"
    - "严禁单一套用固定底盘、固定材质组合或同一种视觉骨架"
    - "若使用图片，必须使用真实公共 URL，并添加 max-width:100%;height:auto;display:block"

复杂度硬指标:
  enforcement_level: "mandatory"
  rule: "每轮 DOM 与 CSS 必须同时满足以下 7 项中的至少 4 项；该指标只判断完成度，不规定固定审美风格"
  checklist:
    - "明确的主视觉核心区或视觉锚点"
    - "与本轮主题或氛围契合的专属色系"
    - "两层以上空间层级、前后景嵌套或视觉深度"
    - "非单一长段布局：必须出现不同层级、不同尺度或不同阅读方向的内容组织；不得只把多个相似内容区域排列成固定队列来冒充复杂布局"
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
    - "若通过审查后整体骨架、阅读路径、信息承载方式或视觉层级仍与近期输出近似，视为不合格，必须重写"

受控随机:
  enforcement_level: "mandatory"
  rule:
    - "随机性用于提高新鲜感，而不是制造混乱"
    - "当本轮抽到多个主题或多个展现形式时，不要求平均分配篇幅，应自然判断表达重心"
    - "融合方式不得固定化，不得每次都采用相同的主次结构、附加结构或装饰方式"
    - "若组合过于冲突，应自动收束为更自然的表达方式，保留最有表现力的元素，弱化其他元素"

外语可见文字规则:
  enforcement_level: "mandatory"
  rule:
    - "兔子镜内若出现外语可见文字，必须立即在其后附加自然简体中文释义，格式为外语 [中文释义]"
    - "标题、按钮、标签、角标、状态、台词、说明、提示语等所有用户可见文字均适用"
    - "HTML/CSS 标签、属性、URL、class/id、data 属性、代码内部标识不适用，不得为了翻译破坏渲染"

交互可点击成立:
  enforcement_level: "mandatory"
  rule:
    - "交互必须使用无 JS 的原生可操作结构；禁止依赖 onclick、button 或需要脚本才能生效的伪交互"
    - "可点击层必须不被 absolute 背景、遮罩、光效或装饰层覆盖；装饰层必要时使用 pointer-events:none"
    - "若使用 checkbox/radio 状态切换，必须具备唯一 id 与 label for 绑定；若使用 summary，必须具备 cursor:pointer 与 list-style:none"

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

</兔子镜执行规则>
`;
