# 整日打卡提醒与微信订阅消息

## 行为边界

- 入口统一位于“我的 → 打卡提醒”，提醒属于整日打卡，不属于某一个计划或群组。
- 站内消息：开启打卡提醒后持续生效，到点时只要今日应执行任务没有全部完成，就写入一条消息中心提醒；每名用户只保留最近 20 条。
- 微信提醒：默认使用一次性订阅消息，一次用户授权只对应一次发送机会。用户点击完成当天最后一项计划时，小程序会借由该次点击调用微信订阅接口；全部完成成功后，把获准的一次机会登记为下一次未打卡提醒。
- 服务端不能在无用户操作时静默增加一次性订阅次数；自动倒计时或其他非点击完成场景会在今日页提供“续订”按钮作为合规补充入口。
- 手机是否弹出通知由微信和手机系统设置决定，小程序不能保证系统弹窗。
- 拒绝订阅或发送失败不会影响站内消息。
- 单项任务完成后仍照常广播到关联群组；群组详情不再提供微信打卡提醒开关。特别关心逻辑保持独立。

## 执行流程

```text
用户设置提醒时间
    ↓
用户主动授权一次性微信提醒
    ↓
reminder-dispatch 每5分钟扫描
    ↓
按用户提醒时区汇总今日全部应执行任务，并校验每周目标
    ↓
幂等写入 notifications
    ↓
存在一次性订阅时发送微信服务通知
    ↓
用户完成下一天全部任务时，借由完成点击续订下一次
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

`reminder-dispatch`：

```text
PLAN_REMINDER_TEMPLATE_ID=NvYH1zhsy9zwqhbgh6gZIXpXk0ndSDY0leulECtekUI
PLAN_REMINDER_SUBSCRIPTION_TYPE=ONE_TIME
REMINDER_TEMPLATE_TIME_KEY=time30
REMINDER_TEMPLATE_CONTENT_KEY=thing2
REMINDER_MESSAGE_PAGE=pages/today/index
REMINDER_MINIPROGRAM_STATE=trial
```

体验环境使用 `trial`，正式环境改为 `formal`，开发环境可用 `developer`。

`PLAN_REMINDER_TEMPLATE_ID` 和 `PLAN_REMINDER_SUBSCRIPTION_TYPE` 不是密钥，但两个云函数必须保持一致。普通模板保留 `ONE_TIME`；只有微信后台明确将该模板标记为长期订阅时才设置 `LONG_TERM`。错误地把一次性模板配置为长期模板并不能绕过微信限制，后续发送仍会被微信拒绝并自动关闭提醒。AppSecret 不应放入小程序前端或仓库。

特别关心可复用同一个“日程提醒”模板：`time30` 显示完成时间，`thing2` 组合显示成员、计划名称与打卡状态。群组只保留应用内动态和消息中心广播，不再提供群组微信提醒开关。`api/config.json` 已声明 `subscribeMessage.send` 权限，部署后仍需在云开发控制台确认权限生效。

`SOCIAL_CHECKIN_SUBSCRIPTION_TYPE` 默认且建议保持 `ONE_TIME`。只有微信后台明确显示该模板为长期订阅时才设置为 `LONG_TERM`；代码会在成功发送后保留群组和特别关心开关。该配置不能把一次性模板变成长效模板。

## 定时触发器

`cloudfunctions/reminder-dispatch/config.json` 已配置每 5 分钟触发一次：

```text
0 */5 * * * * *
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
```

`users.lastReminderRenewalDate` 记录最近一次通过“完成最后任务/手动续订”登记授权的业务日期，防止同一天重复弹出续订请求。旧用户缺失该字段时按尚未续订处理。

`notifications` 保存：用户、业务日期、当日完成进度、未读状态、微信推送状态和错误码。消息中心只允许当前用户读取和修改自己的消息；新增第 21 条时自动清理最旧记录，用户文档上的日期凭证继续负责防止同日重复提醒。

## 验收建议

1. 在“我的”页直接开启“打卡提醒”，点击时间并设置为 5 分钟后；开关和时间均自动保存。
2. 开启时同意一次性微信订阅。
3. 不打卡，等待定时触发器运行。
4. 确认消息中心只出现一条消息。
5. 确认微信服务通知到达并可跳转到“今日”。
6. 再次运行云函数，确认不会重复生成或发送。
7. 一次性提醒发送后完成当天最后一项任务，确认微信订阅授权由该次点击触发，授权成功后显示“已完成并续订提醒”。
8. 当天重复进入或重复编辑已完成任务时不自动重复申请；自动倒计时完成时可通过今日页“续订”按钮补充下一次机会。
9. 创建新的测试日期且不打卡，确认整天只收到一条微信提醒和一条站内提醒。

微信接口说明：[订阅消息](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/subscribe-message.html)、[`wx.requestSubscribeMessage`](https://developers.weixin.qq.com/miniprogram/dev/api/open-api/subscribe-message/wx.requestSubscribeMessage.html)、[服务端发送接口](https://developers.weixin.qq.com/miniprogram/dev/server/API/mp-message-management/subscribe-message/api_sendmessage.html)。
