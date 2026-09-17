# 自律 · 微信小程序 1.2.0

面向自己与少量好友长期使用的身体管理、饮食营养、运动记录、计划打卡、群组监督与个人历程小程序。

首个正式版聚焦个人长期自律记录，并兼顾 **可修改性、可测试性、可靠性、安全性、性能与易用性**。

## 主要能力

- 身体数据：体重、体脂、围度历史；围度项目由数据库定义，用户自己选择需要跟踪的详细程度。
- 营养目标：根据身体档案和最新体重估算 BMR、基础日常消耗、目标热量与三大营养素。
- 饮食：食物 + 克数自动计算热量、蛋白质、碳水、脂肪；支持自定义食物。
- 运动：运动时长、力量训练数据和预计热量消耗；热量算法独立为可测试 Domain。
- 计划：每天、工作日、周末、指定星期、每周 N 次；支持自动打卡。
- 提醒：计划可设置未打卡提醒时间；支持站内消息中心和一次性微信订阅消息。
- 趋势与复盘：支持 7/30/90 天身体、能量、运动和学习趋势，以及月度活跃日历。
- 好友：好友码、请求、隐私控制。
- 群组：计划群组绑定、强监督、完成后自动产生群组事件。
- 日志与笔记：日常、体态、学习、训练、饮食五类记录；支持文字、标签和最多 9 张图片。
- 体态照片：可标记正面 / 侧面 / 背面；默认严格私密。
- 学习/训练记录可直接关联笔记，方便长期复盘。
- 我的历程：按时间轴和类型筛选历史日志。
- 关于与诊断：显示客户端/服务端版本、Schema 和运行环境，方便排错。

## 架构重点

```text
微信小程序页面
    ↓
统一 API Client / 文件上传适配层
    ↓
云函数 api/index.js
    ↓
结构化日志 + requestId + 审计
    ↓
Feature Actions
    ↓
Services / Domain
    ↓
云数据库 / 云存储

定时触发器 → reminder-dispatch → 未打卡检查 → 站内消息 / 微信订阅消息
```

Action 已按业务边界拆分：

```text
dashboard / profile / body / food / workouts / study / plans
privacy / friends / groups / notes / reports / system
notifications
```

纯业务规则放在 Domain：

```text
nutrition-calculator.js
plan-schedule.js
exercise-calculator.js
note.js
progress-report.js
```

## 可修改性设计

- 身体围度采用 `body_metric_defs + body_metric_preferences`，新增指标优先改数据而不是改页面。
- 日志是通用 `notes + note_attachments` 模型，而不是分别建立体态备注、学习备注、训练备注。
- 日志通过 `relatedType + relatedId` 关联已有业务记录，避免业务表不断增加备注字段。
- App/Schema/算法版本集中管理。
- `admin-init` 负责幂等建库、种子数据和 migration 记录。
- 静态质量门禁检查版本一致性、页面完整性、Action 契约、固定依赖与模块体量。

## 可靠性设计

- API 统一返回错误码和 `requestId`。
- 日志新建采用 `clientMutationId`，网络超时重试时复用同一记录，降低重复写入风险。
- 日志删除采用软删除，附件同步时清理云存储。
- 图片在上传后写入草稿，网络失败后可以继续重试。
- 关键写操作写入 `audit_logs`，但不记录敏感 payload。

## 隐私原则

- 体重、体脂、围度、饮食明细、日志与体态照片默认私密。
- 当前 Notes API 只允许本人读取和修改。
- 群组强监督只覆盖“绑定到群组的计划执行结果”，不会让群成员读取体态照片或笔记。
- 所有跨用户读取必须经过服务端权限判断。

## 数据库初始化

运行 `admin-init` 后会自动创建当前版本所需的 **28 个集合**，并幂等写入：

- 63 条基础食物；
- 15 个运动项目；
- 12 个身体指标定义；
- 7 项系统配置；
- `schemaVersion = 5`；
- Schema 1~5 migration 记录。

真实微信云环境仍需要你部署后调用一次 `admin-init`；工程本身无法代替你的微信账号授权。

## 工程结构

```text
zilu-miniapp/
├─ miniprogram/
│  ├─ config/                 环境与版本
│  ├─ pages/                  页面
│  └─ utils/                  API、上传、格式化
├─ cloudfunctions/
│  ├─ api/
│  │  ├─ actions/             Feature Action
│  │  ├─ services/            应用服务
│  │  ├─ domain/              纯业务规则
│  │  └─ lib/                 DB/校验/日志/版本/错误
│  ├─ admin-init/             初始化与 Schema 升级
│  └─ reminder-dispatch/      定时检查未打卡并发送提醒
├─ data/                      种子数据
├─ tests/                     Domain 单元测试
├─ tools/static-check.js      架构/静态质量门禁
├─ docs/
├─ VERSION
└─ CHANGELOG.md
```

## 本地质量门禁

```bash
npm run verify
```

会检查：

- 所有 JS 语法；
- 所有 JSON；
- 页面四件套完整；
- 客户端 `api.call()` 与后端 Action 契约；
- 客户端不得绕过 API Client 调云函数；
- App / Cloud / 初始化函数版本和 Schema 一致；
- 云函数依赖不能使用 `latest`；
- Action 模块不得重新膨胀为巨型文件；
- Domain 单元测试。

详细设计见：`docs/ARCHITECTURE.md`、`docs/QUALITY_ATTRIBUTES.md`、`docs/NOTES_DESIGN.md`、`docs/REMINDERS.md`。

## 医疗与营养说明

BMR、日常消耗、运动热量、食物营养值和热量平衡均属于估算/通用参考，用于个人趋势记录，不等同于医学检测或专业营养诊疗。包装食品建议优先录入产品营养标签。
