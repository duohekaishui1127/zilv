# 1.1.0 代码结构说明

## 从“能运行”到“可长期修改”

首版围绕变化热点划分模块边界，避免业务增长后形成单体大文件。

### Action 继续拆分

业务 Action 按职责拆分为：

```text
privacy.js
friends.js
groups.js
workouts.js
study.js
body.js
```

质量门禁限制 Action 文件重新膨胀。

### 数据驱动身体指标

身体围度使用数据驱动结构：

```text
body_metric_defs            系统支持哪些指标
body_metric_preferences     某用户选择哪些指标
```

页面统一渲染，新增指标不再需要复制 WXML 输入框。

### Domain 隔离

当前纯业务规则：

```text
nutrition-calculator
exercise-calculator
plan-schedule
note
```

数据库和微信 SDK 不进入 Domain，便于测试和算法替换。

### Notes 采用通用模型

没有建立 `body_notes / study_notes / workout_notes` 三套结构，而是统一：

```text
notes
note_attachments
relatedType + relatedId
```

这样未来增加饮食复盘、计划总结等不需要新建一套 CRUD。

### 可靠性

新建日志使用 `clientMutationId`。当上传完成而云函数响应超时时，草稿保留 fileId，用户重试复用同一 mutationId 和云文件，降低重复记录与重复上传。

### 质量门禁

`tools/static-check.js` 现在除语法检查外还检查：

- 版本一致；
- Schema 一致；
- 页面四件套；
- API Action 契约；
- 固定依赖；
- 页面禁止直接 callFunction；
- Action 模块体量。
