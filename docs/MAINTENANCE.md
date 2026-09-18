# 1.6.0 维护说明

## Feature Actions

```text
dashboard.js   今日看板
profile.js     用户与营养档案
body.js        身体记录与用户指标偏好
food.js        食物与饮食
workouts.js    运动
study.js       学习
plans.js       计划与打卡
privacy.js     隐私设置
friends.js     好友
groups.js      群组
notes.js       日志与附件
notifications.js 站内提醒与微信订阅配置
reports.js     趋势与活跃日历入口
system.js      版本与诊断
```

`cloudfunctions/reminder-dispatch` 独立负责定时扫描、未打卡复核、消息幂等写入和微信订阅消息发送。

趋势报告的数据读取集中在 `services/progress.js`，按日期聚合规则集中在无数据库依赖的 `domain/progress-report.js`。

原则：一个 Action 文件如果开始接近 160~220 行，应重新检查是否存在新的职责边界。质量门禁会对此提示/阻止。

## 业务规则

易变化规则优先进入 Domain，而不是散落到页面和数据库操作里。

新增算法时：

1. 先建立纯函数；
2. 写单测；
3. Service/Action 调用纯函数；
4. 历史计算如需重算，必须增加算法版本或 migration。

## Schema 变化

任何数据库结构变化都需要：

1. 增加 `SCHEMA_VERSION`；
2. 更新 `admin-init`；
3. 增加 `migration_history` 项；
4. 更新 `DATABASE_SCHEMA.md`；
5. 先升级数据库，再发布客户端。

## 排错

用户反馈错误时优先收集：

- “关于与诊断”复制内容；
- 云函数日志中的 requestId；
- action / errorCode；
- 发生时间。

不要要求用户把体重、饮食、日志正文等隐私数据当作普通日志发送。
