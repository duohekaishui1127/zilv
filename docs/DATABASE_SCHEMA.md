# 云数据库集合设计（应用 1.3.0 / Schema 6）

> Schema 6 新增的计时字段均为向后兼容的可选字段，不需要新建集合：`plans.timerMode`、`plans.timerDurationMinutes`，以及 `checkins`、学习记录和运动记录中的计时状态与有效/总/暂停时长。

## 计划专注计时字段

- `plans.timerMode`: `NONE` / `COUNT_UP` / `COUNT_DOWN`。
- `plans.timerDurationMinutes`: 倒计时目标分钟数。
- `checkins.timerStatus`: `RUNNING` / `PAUSED` / `FINISHED`。
- `checkins.timerStartedAt`、`timerResumedAt`、`timerPausedAt`、`timerEndedAt`: 服务端计时时间点。
- `checkins.timerAccumulatedMs`: 已累计的有效毫秒数，用于暂停后继续。
- `checkins.timerEffectiveSeconds`、`timerTotalSeconds`、`timerPausedSeconds`: 结束后的统计快照。
- 学习/运动分类记录保存三个统计秒数字段，便于在“记录”中展示同一份完成结果。

## 核心业务

```text
users
body_records
body_metric_preferences
nutrition_profiles
nutrition_targets
foods
meals
meal_items
workout_sessions
plans
checkins
study_sessions
friendships
privacy_settings
groups
group_members
plan_group_bindings
group_events
notes
note_attachments
notifications
feedbacks
```

## 系统与工程

```text
exercises
body_metric_defs
app_config
system_meta
migration_history
audit_logs
```

共 28 个集合。

## 用户反馈与版本广播

feedbacks 保存用户建议：userId、category、content、images、contact、status、deviceInfo、clientMutationId、createdAt、updatedAt。

反馈管理员由 api 云函数环境变量 FEEDBACK_ADMIN_SHARE_CODES 指定。版本公告文案位于 cloudfunctions/api/config/release-announcement.js，同一个公告 id 对每名用户只投递一次。

## 计划提醒字段

`plans` 增加：`reminderEnabled`、`reminderTime`、`reminderTimezoneOffset`、`reminderPushEnabled`。

`notifications` 保存站内消息及推送结果：`userId`、`planId`、`recordDate`、`status`、`pushStatus`、`pushErrorCode`、`createdAt`、`readAt`。

## 推荐索引

- `users`: `openid`；`shareCode`
- `body_records`: `userId + recordDate desc`
- `body_metric_preferences`: `userId`
- `nutrition_profiles`: `userId`
- `nutrition_targets`: `userId + effectiveFrom desc`
- `foods`: `ownerType + enabled + name`；`ownerUserId + enabled + name`
- `meals`: `userId + recordDate + mealType`
- `meal_items`: `userId + recordDate`；`mealId`
- `workout_sessions`: `userId + recordDate`；`userId + planId + recordDate`
- `plans`: `userId + enabled`
- `checkins`: `userId + planId + date`；`userId + date`
- `study_sessions`: `userId + recordDate`；`userId + planId + recordDate`
- `friendships`: `userA + userB`
- `privacy_settings`: `userId`
- `group_members`: `groupId + userId + status`；`userId + status`
- `plan_group_bindings`: `planId + groupId + userId`
- `group_events`: `groupId + createdAt desc`；`groupId + checkinId + eventType`
- `notes`: `userId + status + createdAt desc`；`userId + type + status + createdAt desc`；`userId + clientMutationId + status`；`userId + recordDate + status`
- `note_attachments`: `noteId + sort`；`userId + noteId`
- `notifications`: `userId + createdAt desc`；`userId + status + createdAt desc`；`userId + planId + recordDate`
- `feedbacks`: `userId + createdAt desc`；`userId + clientMutationId`
- `exercises`: `key`
- `body_metric_defs`: `code`
- `app_config`: `key`
- `system_meta`: `key`
- `migration_history`: `migrationId`
- `audit_logs`: `userId + createdAt desc`；`requestId`

## 权限

客户端不直接查询业务数据库。跨用户可见性由云函数 API 统一控制。Notes 在当前版本中仅本人可访问。
