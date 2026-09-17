# 自律 1.3.0 架构设计

## 1. 架构风格

采用 **模块化单体（Modular Monolith）+ 云函数 BFF**。

当前目标用户为自己和少量朋友，业务量并不需要微服务。微服务会引入分布式事务、服务发现、部署和监控复杂度，反而降低可修改性和可用性。

## 2. 分层规则

```text
Page / Component
      ↓
Client API Adapter
      ↓
Cloud API Entry
      ↓
Feature Action
      ↓
Service / Domain
      ↓
Cloud Database / Storage
```

### Page
负责展示、用户输入与轻量交互，不承担跨用户权限判断和核心计算。

### Client API Adapter
集中封装云函数调用、错误提示、诊断信息、图片上传与文件清理。页面不得直接 `wx.cloud.callFunction()`。

### Action
按功能模块划分，负责一个用例的编排和权限入口。目标是保持短小，不变成新的 God Object。

### Service
负责可复用的应用级行为，例如营养目标、计划查询、群组事件、日志附件同步。

### Domain
纯业务规则，不依赖微信 SDK 和数据库，便于单测和算法替换。

## 3. 当前模块边界

```text
Identity/Profile      用户、营养档案
Body                  身体数据、指标偏好
Nutrition/Food        食物、饮食、营养计算
Workout               运动与能量估算
Study                 学习记录
Plan                  计划与打卡
Friend                好友弱监督
Group                 群组强监督
Notes                 私密日志、笔记、附件
Reports               7/30/90天趋势、月度活跃日历
System                版本和诊断
Notification          站内提醒、已读状态、微信推送结果
```

计划提醒由独立的 `reminder-dispatch` 定时云函数执行，不依赖用户打开小程序：

```text
Timer（每5分钟）
      ↓
计划周期 / 时区 / 打卡状态检查
      ↓
notifications 幂等写入
      ↓
可选发送微信一次性订阅消息
```

## 4. 变化热点隔离

- 营养算法 → `domain/nutrition-calculator.js`
- 运动消耗算法 → `domain/exercise-calculator.js`
- 计划周期 → `domain/plan-schedule.js`
- 日志字段规则 → `domain/note.js`
- 趋势聚合规则 → `domain/progress-report.js`
- 身体指标种类 → `body_metric_defs` 数据集合
- 用户记录详细度 → `body_metric_preferences`
- 环境 → `miniprogram/config/env.js`
- 版本 → `VERSION + version.js + system_meta`

## 5. 不做的过度设计

当前版本不引入：

- 微服务；
- 消息队列；
- 独立 API Gateway；
- Redux 类全局状态框架；
- 复杂 Repository/ORM；
- 对少量数据不必要的缓存集群。

只有在真实规模和质量场景证明需要时再引入。
