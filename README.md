## v0.31.34 兔子镜强制生成修正版

基于 v0.31.33 修复：

- 修复 `src/promptBuilder.js` 未实际注入 `RAW_EXECUTION_RULES` 的问题。
- 恢复完整 `<兔子镜执行规则 v2.1>` 到每轮自动注入内容中，强化“主回复结束后必须追加兔子镜”的强制生成。
- 保留 v0.31.33 的外语可见文字规则与交互可点击成立规则。
- UI 标识更新为 `Toto v0.31.34`。

建议至少替换：

```txt
manifest.json
README.md
src/ui.js
src/promptBuilder.js
data/raw/rawExecutionRules.js
```

如果刚替换后仍不生成，请在插件设置里确认“兔子镜自动注入”已勾选，并点击“清空当前注入”或重启 SillyTavern 后再测试。
