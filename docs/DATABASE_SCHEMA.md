# 云数据库集合设计（应用 1.6.0 / Schema 10）

> Schema 10 新增群监督计划变更申请；本人担任群主的群自动批准，其余群组的计划修改、停用、删除和解绑仍需对应群主审核。

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
daily_reviews
study_sessions
friendships
friend_settings
privacy_settings
groups
group_members
plan_group_bindings
group_plan_change_requests
group_events
group_event_likes
special_cares
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

共 33 个集合。

## 好友资料与权限

- `friendships`: `status` 支持 `PENDING`、`ACCEPTED`、`REJECTED`、`CANCELLED`；`requestVersion` 用于重复申请时通知去重；`requestMessage` 保存最多 60 字的选填申请备注。
- `friend_settings`: `userId`、`friendUserId`、仅本人可见的 `remark`、`pinned`、`pinnedAt`、`privacyMode` 与 `privacyOverrides`；`pinned` 只影响本人好友列表排序，新置顶项按 `pinnedAt` 优先。
- `privacy_settings`: 保存对所有好友生效的默认规则；`friend_settings` 只在 `CUSTOM` 模式覆盖指定好友。
- 单好友例外只能决定“我向对方公开什么”，不能扩大对方授予我的权限；特别关心同样不能绕过被关注人的可见规则。

## 社交鼓励与撤回

- `group_events`: 增加 `completionVersion`、`status`、`likeCount`，撤回后原完成动态标记为 `REVOKED`。
- `group_event_likes`: `eventId`、`groupId`、`userId`、`createdAt`，每名群成员对每条有效完成动态最多一条。
- `special_cares`: `userId`、`targetUserId`、`enabled`、`wechatEnabled`、授权时间；解除好友后自动停用。
- `groups.joinApprovalRequired`、`autoRemoveInactiveDays`、`blockRejoinAfterAutoRemove`: 分别控制入群审批、连续未打卡自动移出天数和自动移出后的重新加入限制。
- `groups.status`: 新群为 `ACTIVE`；群主解散后为 `DISBANDED`，并记录 `disbandedAt` 与 `disbandedBy`。解散群会从所有成员列表消失，拒绝再次加入。
- `group_members.status`: 支持 `PENDING`、`ACTIVE`、`LEFT`、`REJECTED`、`AUTO_REMOVED`、`KICKED`、`DISBANDED`；自动移出记录 `autoRemovedAt`、`autoRemovedDate` 与 `removalReason`，群主手动移出记录 `kickedAt`、`kickedBy` 与 `rejoinBlocked`。
- `group_members.joinedDate`: 成员最近一次正式入群的本地日期；历史数据缺失时由 `joinedAt` 兼容推导。成员日历只显示该日期至当前日期的打卡。
- `group_members.remark`、`pinned`、`pinnedAt`: 当前成员私有的群聊备注和置顶状态，只影响本人看到的群名与群组列表顺序；新置顶项排在已有置顶项之前。
- `group_members.wechatCheckinEnabled`: 当前群组微信打卡提醒偏好；长期模板发送后保留，一次性模板发送或确认无授权后关闭。
- 群组邀请复用 `notifications`，类型为 `GROUP_INVITATION`，包含 `groupId`、`inviteCode` 与确认加入页面；无需新增集合。
- `plan_group_bindings.commitment` 保存绑定时可公开的计划承诺快照；不包含计划描述、备注、心情、小记和计时执行详情。
- `group_plan_change_requests`: 保存绑定计划的 `UPDATE`、`SET_ENABLED`、`DELETE`、`UNBIND` 申请；计划发布者本人担任群主的群自动写入 `approvedGroupIds`，其余受影响群组的群主同意后才执行，任一待审批群主拒绝则终止申请。群主接口只返回计划名称、目标与重复规则等监督字段，不返回计划内容。
- 计划变更实际生效后，每个相关群写入一条 `PLAN_CHANGED` 群动态，并为除操作者外的当前成员写入去重的 `GROUP_PLAN_CHANGED` 站内消息；广播只包含计划名称、目标和变更类型等监督字段。
- 群成员日历只组合 `plan_group_bindings`、`plans` 和 `checkins` 的群组任务状态；显示计划名称、逐项完成状态和 `完成数 / 总数`，当天所有群绑定计划完成后才显示绿色对号，不读取 `daily_reviews`、`notes` 或任务备注字段。
- 好友日历只组合经过好友隐私规则过滤后的 `plans` 与 `checkins`；显示获准公开的计划名称、逐项完成状态和 `完成数 / 总数`，当天所有可见计划完成后才显示绿色对号，不返回心情、小记、任务描述、任务备注和计时详情。
- `checkins.completionVersion`: 同一任务撤回后再次完成时递增，用于动态与消息去重。
- `daily_reviews.status`: `ACTIVE` / `REVOKED`；撤回时保留原心情与小记，重新完成全部任务后恢复。

## 整日打卡与进食时间流

- `daily_reviews`: `userId`、`date`、可稍后补充的 `mood`、`note`、`completedPlanCount`、`totalPlanCount`、`checkedInAt`。
- `meals.recordedAt`: 本次进食的服务端时间戳。
- `meals.note`: 本次进食的可选文字。
- `meals.photoFileIds`: 最多三张饮食照片的云文件 ID。

## 用户反馈与版本广播

feedbacks 保存用户建议：userId、category、content、images、contact、status、deviceInfo、clientMutationId、createdAt、updatedAt。

反馈管理员由 api 云函数环境变量 FEEDBACK_ADMIN_SHARE_CODES 指定。版本公告文案位于 cloudfunctions/api/config/release-announcement.js，同一个公告 id 对每名用户只投递一次。

## 计划提醒字段

`plans` 增加：`reminderEnabled`、`reminderTime`、`reminderTimezoneOffset`、`reminderPushEnabled`、`lastReminderNotificationDate`。

计划提醒模板类型由 `api` 和 `reminder-dispatch` 的 `PLAN_REMINDER_SUBSCRIPTION_TYPE` 共同配置；长期模板发送成功后保留 `reminderPushEnabled`，一次性模板发送成功或微信返回无授权时关闭。

`notifications` 保存站内消息及推送结果：`userId`、`planId`、`recordDate`、`status`、`pushStatus`、`pushErrorCode`、`createdAt`、`readAt`。每名用户只保留按 `createdAt` 排序的最新 20 条。

`users.lastReleaseAnnouncementId` 和 `plans.lastReminderNotificationDate` 是轻量投递凭证。它们与通知展示记录分离，保证旧通知清理后版本公告和同日计划提醒不会重复创建。

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
- `checkins`: `userId + planId + date`；`userId + date`；`userId + completed + completedAt desc`
- `daily_reviews`: `userId + date`
- `study_sessions`: `userId + recordDate`；`userId + planId + recordDate`
- `friendships`: `userA + userB`；`userA + status`；`userB + status`
- `friend_settings`: `userId + friendUserId`（建议唯一）
- `privacy_settings`: `userId`
- `group_members`: `groupId + userId + status`；`userId + status`
- `plan_group_bindings`: `planId + groupId + userId`
- `group_plan_change_requests`: `userId + planId + status`；`status`
- `group_events`: `groupId + createdAt desc`；`groupId + checkinId + eventType + completionVersion`
- `group_event_likes`: `eventId + userId`（建议唯一）；`groupId + userId`
- `special_cares`: `userId + targetUserId`（建议唯一）；`targetUserId + enabled`
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
