# 整日打卡提醒与微信订阅消息

## 行为边界

- 入口统一位于“我的 → 打卡提醒”，提醒属于整日打卡，不属于某一个计划或群组。
- 站内消息：开启打卡提醒后持续生效，到点时只要今日应执行任务没有全部完成，就写入一条消息中心提醒；每名用户只保留最近 20 条。
- 微信提醒：默认使用一次性订阅消息，一次用户授权只对应一次发送机会。未发送的机会跨天保留，不会每天重复申请；只有上一条微信提醒已经实际发送、当前机会为空时，才借由用户点击完成当天最后一项计划申请下一次。
- 服务端不能在无用户操作时静默增加一次性订阅次数；倒计时在用户点击“开始”时申请本次到点提醒授权。
- 倒计时在前台归零时只振动并结束计时；在后台归零时写入消息中心，并在本次已授权时发送微信订阅消息。两种情况都不会自动完成任务或触发整日打卡，用户仍需点击任务右侧圆圈。
- 正计时首次开始时准备一次提醒额度；累计有效计时达到 2.5 小时仍在运行时，前台振动并提示休息，后台写入消息中心并发送已授权的微信提醒，计时不会自动停止。
- 正计时任务由用户手动结束并完成。若 2.5 小时提醒已消耗额度，完成点击会申请下一次正计时提醒；未消耗的额度直接保留，不重复弹窗。
- 手机是否弹出通知由微信和手机系统设置决定，小程序不能保证系统弹窗。
- 拒绝订阅或发送失败不会影响站内消息。
- 单项任务完成后仍照常广播到关联群组；群组详情不再提供微信打卡提醒开关。特别关心逻辑保持独立。
- 长期目标的消息中心提醒默认生效且不提供关闭开关。考试目标在剩余 200、100、30、7、1 天时写入消息中心，考试日自动归档；归档后仍待出分满 60 天时提醒补充结果和复盘。习惯达到连续天数时先发送达成消息，再归档到“我的进步”。
- 长期目标不申请、不消耗也不发送微信订阅消息，创建和编辑目标不会弹出订阅授权。

## 执行流程

```text
用户设置提醒时间
    ↓
用户主动授权一次性微信提醒
    ↓
reminder-dispatch 每分钟扫描
    ↓
按用户提醒时区汇总今日全部应执行任务，并校验每周目标
    ↓
幂等写入 notifications
    ↓
存在一次性订阅时发送微信服务通知
    ↓
提醒机会已被实际发送消耗后，用户完成下一天全部任务时借由完成点击续订下一次
```

同一用户、日期使用确定性通知 ID。即使定时触发器重复执行，也只会建立一条整日提醒；多个未完成计划不会分别消耗订阅次数。

## 微信公众平台配置

当前使用微信公众平台模板 `日程提醒`（模板编号 571），字段映射为：

| 用途 | 默认字段 |
|---|---|
| 提醒时间 | `time30` |
| 提醒内容 | `thing2` |

如果实际模板字段不同，通过下方环境变量覆盖，不要直接修改业务代码。

## 云函数环境变量

`api`：

```text
PLAN_REMINDER_TEMPLATE_ID=NvYH1zhsy9zwqhbgh6gZIXpXk0ndSDY0leulECtekUI
PLAN_REMINDER_SUBSCRIPTION_TYPE=ONE_TIME
SOCIAL_CHECKIN_TEMPLATE_ID=NvYH1zhsy9zwqhbgh6gZIXpXk0ndSDY0leulECtekUI
SOCIAL_CHECKIN_SUBSCRIPTION_TYPE=ONE_TIME
SOCIAL_TEMPLATE_TIME_KEY=time30
SOCIAL_TEMPLATE_CONTENT_KEY=thing2
SOCIAL_MINIPROGRAM_STATE=trial
```

以上 `SOCIAL_*` 配置需要同时设置到 `api` 和 `reminder-dispatch`。任务完成时群动态和消息中心立即写入，微信订阅消息进入后台投递，通常在下一次每分钟调度时发送；临时失败最多自动重试三次，任务在发送前撤回则取消推送。

`reminder-dispatch`：

```text
PLAN_REMINDER_TEMPLATE_ID=NvYH1zhsy9zwqhbgh6gZIXpXk0ndSDY0leulECtekUI
PLAN_REMINDER_SUBSCRIPTION_TYPE=ONE_TIME
REMINDER_TEMPLATE_TIME_KEY=time30
REMINDER_TEMPLATE_CONTENT_KEY=thing2
REMINDER_MESSAGE_PAGE=pages/today/index
REMINDER_MINIPROGRAM_STATE=trial
GOAL_REMINDER_TIME=09:00
```

体验环境使用 `trial`，正式环境改为 `formal`，开发环境可用 `developer`。`GOAL_REMINDER_TIME` 是考试节点提醒的当地触发时间，未配置时默认 09:00，不需要用户每天设置。

`PLAN_REMINDER_TEMPLATE_ID` 和 `PLAN_REMINDER_SUBSCRIPTION_TYPE` 不是密钥，但两个云函数必须保持一致。普通模板保留 `ONE_TIME`；只有微信后台明确将该模板标记为长期订阅时才设置 `LONG_TERM`。错误地把一次性模板配置为长期模板并不能绕过微信限制，后续发送仍会被微信拒绝并自动关闭提醒。AppSecret 不应放入小程序前端或仓库。

特别关心可复用同一个“日程提醒”模板：`time30` 显示完成时间，`thing2` 组合显示成员、计划名称与打卡状态。群组只保留应用内动态和消息中心广播，不再提供群组微信提醒开关。`api/config.json` 已声明 `subscribeMessage.send` 权限，部署后仍需在云开发控制台确认权限生效。

`SOCIAL_CHECKIN_SUBSCRIPTION_TYPE` 默认且建议保持 `ONE_TIME`。只有微信后台明确显示该模板为长期订阅时才设置为 `LONG_TERM`；代码会在成功发送后保留群组和特别关心开关。该配置不能把一次性模板变成长效模板。

## 定时触发器

`cloudfunctions/reminder-dispatch/config.json` 已配置每分钟触发一次，以便处理倒计时到点提醒：

```text
0 * * * * * *
```

同一配置文件也声明了 `subscribeMessage.send` OpenAPI 权限。部署后需要在云开发控制台确认权限和触发器都已经实际创建。提醒允许最多约 9 分钟的调度宽限，并通过幂等 ID 防止重复。扫描使用分页读取，不受单次查询 100 条上限影响。

## 数据结构

用户提醒字段：

```text
checkinReminderEnabled
checkinReminderTime
checkinReminderTimezoneOffset
checkinReminderPushEnabled
lastCheckinReminderNotificationDate
countUpReminderPushEnabled
```

计时记录使用 `timerReminderPushEnabled` 保存本次计时的提醒额度，`timerRestReminderAt` 记录正计时的 2.5 小时休息提醒已经触发，避免重复振动或发送消息。

`users.lastReminderRenewalDate` 记录最近一次通过“完成最后任务/手动续订”登记授权的业务日期，防止同一天重复弹出续订请求。旧用户缺失该字段时按尚未续订处理。

长期目标消息中心提醒属于系统默认能力，不保存用户开关，也不消费微信订阅额度；旧记录中的 `reminderEnabled` 字段会被忽略。

`notifications` 保存：用户、业务日期、目标节点、当日完成进度、未读状态、微信推送状态和错误码。消息中心只允许当前用户读取和修改自己的消息；新增第 21 条时自动清理最旧记录，用户文档上的日期凭证及目标节点确定性 ID 继续负责防止重复提醒。

## 验收建议

1. 在“我的”页直接开启“打卡提醒”，点击时间并设置为 5 分钟后；开关和时间均自动保存。
2. 开启时同意一次性微信订阅。
3. 不打卡，等待定时触发器运行。
4. 确认消息中心只出现一条消息。
5. 确认微信服务通知到达并可跳转到“今日”。
6. 再次运行云函数，确认不会重复生成或发送。
7. 一次性提醒发送后完成当天最后一项任务，确认微信订阅授权由该次点击触发；任务完成提示只显示“今日打卡完成”。
8. 提醒尚未发送、机会仍可用时，跨天完成任务也不重复申请。
9. 启动一个短倒计时并同意订阅：前台到点只振动且任务保持未完成；再次启动后退到后台，到点后收到订阅消息，回到“今日”点击右侧圆圈才完成任务。
10. 启动正计时并同意订阅，构造累计有效时间达到 2.5 小时：前台确认只振动且继续计时；后台确认收到措辞为休息建议的订阅消息。手动结束任务时确认已消耗额度会续订、未消耗额度不会重复申请。
11. 创建新的测试日期且不打卡，确认整天只收到一条微信提醒和一条站内提醒。
12. 创建考试目标并把日期分别调整为剩余 200、100、30、7、1 天，确认每个节点只生成一条站内消息，且创建、编辑和触发目标提醒均不弹出微信订阅授权。
13. 将每日任务绑定到 21 天习惯目标，连续完成第 21 天后确认先生成达成消息，目标随后进入“我的 → 我的进步”。

微信接口说明：[订阅消息](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/subscribe-message.html)、[`wx.requestSubscribeMessage`](https://developers.weixin.qq.com/miniprogram/dev/api/open-api/subscribe-message/wx.requestSubscribeMessage.html)、[服务端发送接口](https://developers.weixin.qq.com/miniprogram/dev/server/API/mp-message-management/subscribe-message/api_sendmessage.html)。
