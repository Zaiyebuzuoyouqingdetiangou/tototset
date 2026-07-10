# Rabbit Hole Theater v0.31.29

## 0.31.29

- 基于 0.31.28。
- 保持短 Prompt + JS 真实审查路线。
- 不恢复旧版长 Prompt。
- 不审浅色/白色/米黄本身，只审重复视觉骨架与信息页降级。
- 给短 Prompt 加回最小视觉完成度核心：Flexbox/Grid、box-sizing:border-box、视觉锚点、空间层级、材质质感、box-shadow、linear-gradient、filter、SVG、轻量 CSS 动效。
- 代码块急救仍为本地工具，默认关闭，不进 Prompt。
- 香港/粤语相关元素保持删除。

### 手机上传 GitHub

如果你已经是 0.31.28，只替换这些文件即可：

- src/promptBuilder.js
- src/ui.js
- manifest.json
- README.md

如果不确定当前版本，直接解压整包覆盖仓库根目录。
