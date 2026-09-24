# 云数据库集合设计（应用 1.6.0 / Schema 16）

> Schema 16 增加昨日补签卡、月度赠送和补签来源字段；不新增集合。

## 执行任务与长期目标

- `plans.planType`: `EXECUTION` / `LONG_TERM`；旧记录缺失时按 `EXECUTION` 处理。
- 执行任务增加 `executionTime` 和 `longTermGoalIds`；`repeatType=ONE_TIME` 时仅在 `startDate` 执行。
- 长期目标使用 `goalType=DEADLINE/HABIT/ACCUMULATION`，分别保存 `deadlineDate`、`habitDays`、`targetValue/unlimited/unit/accumulationDeadlineDate`。
- 长期目标使用 `goalStatus=ACTIVE/COMPLETED`；习惯和有上限的累计目标达成后自动归档，考试目标在考试日自动结束备考并归档，不进入逾期状态。
- `plans.deadlineReminderDaysSent` 保存已投递节点。考试目标在剩余 200、100、30、7、1 天的当地上午 09:00 后自动提醒；习惯达成后先提醒再归档。长期目标消息中心提醒始终生效，不提供开关，也不使用微信订阅消息；旧记录中的 `reminderEnabled`、`wechatReminderEnabled` 字段会被忽略。
- 考试归档在 `plans.archiveSnapshot` 冻结创建日期、考试日期、准备天数、关联任务、打卡次数、学习时长和完成率；`linkedPlanHistory` 保留曾经绑定过的执行任务。`examResultStatus=PENDING/PASSED/FAILED/ABSENT` 与 `examScore`、`examReview` 保存后续结果和复盘。待出分满 60 天后默认生成一次消息中心提醒。
- 考试和习惯目标不直接创建 `checkins`，其进度由用户主动关联的执行任务打卡计算。
- 数量积累目标创建时自动生成唯一托管执行任务：目标保存 `managedExecutionPlanId`，子任务保存 `managedByGoalId` 和 `managedPlanType=ACCUMULATION`。普通任务不能手动绑定数量目标，托管任务不能单独启停、删除或改绑其他长期目标。
- 有上限数量目标按“剩余数量 ÷ 截止日前剩余执行次数”更新托管任务的 `targetValue`；无上限目标使用用户设置的每次默认量，实际进度始终累计打卡的 `actualValue`。
- Schema 15 将旧数量目标已有绑定任务的累计值、完成次数和用时冻结到 `accumulationBaseline*` 字段，解除旧绑定并创建托管任务，历史成果不会丢失。
- 数量目标达成或主动结束后，目标以 `AUTOMATIC` 或 `TERMINATED` 模式归档，托管任务同步软删除；`archiveSnapshot` 冻结累计成果、打卡次数、用时和配套任务信息，供“我的进步”读取。
- 长期目标固定 `privacyLevel=PRIVATE`，API 禁止其绑定群组，并在好友、特别关心、群日历、群动态和提醒中再次过滤。
- `users.homePreferences` 增加 `showLongTermGoals` 与 `cardOrder`，只影响今日页展示，不删除业务数据。

## 计划专注计时字段

- `plans.timerMode`: `NONE` / `COUNT_UP` / `COUNT_DOWN`。
- `plans.timerDurationMinutes`: 倒计时目标分钟数。
- `checkins.timerStatus`: `RUNNING` / `PAUSED` / `FINISHED`。
- `checkins.timerStartedAt`、`timerResumedAt`、`timerPausedAt`、`timerEndedAt`: 服务端计时时间点。
- `checkins.timerAccumulatedMs`: 已累计的有效毫秒数，用于暂停后继续。
- `checkins.timerEffectiveSeconds`、`timerTotalSeconds`、`timerPausedSeconds`: 结束后的统计快照。
- `checkins.timerReminderPushEnabled`: 本次计时是否持有一次微信提醒额度。
- `checkins.timerRestReminderAt`: 正计时累计 2.5 小时休息提醒的触发时间，用于防止重复提醒。
- `users.countUpReminderPushEnabled`: 上一次完成正计时任务时保留或补充的下一次提醒额度。
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

- `friendships`: `status` 支持 `PENDING`、`ACCEPTED`、`REJECTED`、`CANCELLED`、`DUPLICATE`；`requestVersion` 用于重复申请时通知去重；`requestMessage` 保存最多 60 字的选填申请备注。Schema 13 为历史重复关系写入 `duplicateOf`、`deduplicatedAt`，好友接口也按对端用户即时去重。
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
- `group_members.wechatCheckinEnabled`: 历史兼容字段，新版不再提供群组微信提醒开关，也不再读取该字段。
- 群组邀请复用 `notifications`，类型为 `GROUP_INVITATION`，包含 `groupId`、`inviteCode` 与确认加入页面；无需新增集合。
- `plan_group_bindings.commitment` 保存绑定时可公开的计划承诺快照；不包含计划描述、备注、心情、小记和计时执行详情。
- `group_plan_change_requests`: 保存绑定计划的 `UPDATE`、`SET_ENABLED`、`DELETE`、`UNBIND` 申请；计划发布者本人担任群主的群自动写入 `approvedGroupIds`，其余受影响群组的群主同意后才执行，任一待审批群主拒绝则终止申请。群主接口只返回计划名称、目标与重复规则等监督字段，不返回计划内容。
- 计划变更实际生效后，每个相关群写入一条 `PLAN_CHANGED` 群动态，并为除操作者外的当前成员写入去重的 `GROUP_PLAN_CHANGED` 站内消息；广播只包含计划名称、目标和变更类型等监督字段。
- 群成员日历只组合 `plan_group_bindings`、`plans` 和 `checkins` 的群组任务状态；显示计划名称、逐项完成状态和 `完成数 / 总数`，当天所有群绑定计划完成后才显示绿色对号，不读取 `daily_reviews`、`notes` 或任务备注字段。
- 好友日历只组合经过好友隐私规则过滤后的 `plans` 与 `checkins`；显示获准公开的计划名称、逐项完成状态和 `完成数 / 总数`，当天所有可见计划完成后才显示绿色对号，不返回心情、小记、任务描述、任务备注和计时详情。
- `checkins.completionVersion`: 同一任务撤回后再次完成时递增，用于动态与消息去重。
- `daily_reviews.status`: `ACTIVE` / `REVOKED`；`REVOKED` 仅为旧数据兼容状态。新版自动打卡和点击打卡生成相同的日记录，撤回任务不会删除记录、心情或小记，只把任务完成状态更新为未完成。

## 整日打卡与进食时间流

- `daily_reviews`: `userId`、`date`、可稍后补充的 `mood`、`note`、`completedPlanCount`、`totalPlanCount`、`checkedInAt`；`checkinMode=AUTO/MANUAL/MAKEUP` 区分创建方式，`allPlansCompleted` 保存打卡对应的任务完成状态。旧记录按自动完成兼容。
- `users.makeupCardBalance` 与 `makeupCardGrantMonth` 保存补签卡余额和上次月度赠送月份；新用户初始 3 张，每月补充 1 张，最多保留 3 张。`makeupCardInitialGrantVersion` 标记旧用户一次性补足，避免重复加卡。
- 昨日补签的 `daily_reviews.makeupAt`、`makeupCardSpent=1` 与任务 `checkins.completionSource=MAKEUP`、`makeupAt` 保留实际操作时间和补签来源；服务端事务同步扣卡、写入任务及整日记录。
- 仅服务器认定的昨天可补签。已打卡日期不能再消耗补签卡；跨天计时可以继续和结束，但完成昨天任务须从日历补签。
- `meals.recordedAt`: 本次进食的服务端时间戳。
- `meals.note`: 本次进食的可选文字。
- `meals.photoFileIds`: 最多三张饮食照片的云文件 ID。

## 用户反馈与版本广播

feedbacks 保存用户建议：userId、category、content、images、contact、status、deviceInfo、clientMutationId、adminReply、repliedAt、repliedBy、replyVersion、createdAt、updatedAt。

反馈管理员由 api 云函数环境变量 FEEDBACK_ADMIN_SHARE_CODES 指定。普通用户只能提交和读取自己的反馈；管理员只读取其他用户的反馈，可以使用快捷或自定义回复。回复保存后通过消息中心通知反馈提交者。版本公告以根目录 `VERSION` 为唯一配置源，同一个版本对每名用户只投递一次。

## 整日打卡提醒字段

`users` 增加：`checkinReminderEnabled`、`checkinReminderTime`、`checkinReminderTimezoneOffset`、`checkinReminderPushEnabled`、`lastCheckinReminderNotificationDate`。

打卡提醒模板类型由 `api` 和 `reminder-dispatch` 的 `PLAN_REMINDER_SUBSCRIPTION_TYPE` 共同配置；一次性模板发送成功或微信返回无授权时关闭 `checkinReminderPushEnabled`。

`notifications` 保存站内消息及推送结果：`userId`、`recordDate`、`status`、`pushStatus`、`pushErrorCode`、`createdAt`、`readAt`。目标提醒类型为 `GOAL_DEADLINE_REMINDER` / `GOAL_ACHIEVED` / `GOAL_RESULT_REMINDER`，使用目标和节点生成确定性 ID。每名用户只保留按 `createdAt` 排序的最新 20 条。

`users.lastReleaseAnnouncementId` 和 `users.lastCheckinReminderNotificationDate` 是轻量投递凭证。它们与通知展示记录分离，保证旧通知清理后版本公告和同日打卡提醒不会重复创建。

`users.lastReminderRenewalDate` 是一次性微信提醒的客户端续订日期凭证；它不代表微信授权本身，只用于避免同一业务日期重复触发续订体验。

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
- `plans`: `userId + enabled`；`planType`；`managedByGoalId`
- `checkins`: `userId + planId + date`；`userId + date`；`userId + completed + completedAt desc`；计时查询建议建立 `userId + timerStatus` 和 `userId + timerStatus + completed + date` 组合索引。
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
