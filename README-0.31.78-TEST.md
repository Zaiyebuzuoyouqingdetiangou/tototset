# RabbitMirror 0.31.78 测试版

修复测试仓库中 `src/ui.js` 被旧兔子洞文件覆盖，导致 `index.js` 导入不存在的 `initRabbitMirrorUI`、整个扩展模块加载失败、设置面板完全不显示的问题。

本版未修改 Prompt、视觉规则、动态规则、清洗器或交互急救逻辑。
