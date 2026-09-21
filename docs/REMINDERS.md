# 计划提醒与微信订阅消息

## 行为边界

- 站内消息：开启计划提醒后持续生效，到点且未打卡时写入消息中心；每名用户只保留最近 20 条。
- 微信提醒：默认使用一次性订阅消息，一次用户授权只对应一次发送机会。用户点击完成当天最后一项计划时，小程序会借由该次点击调用微信订阅接口；全部完成成功后，把获准的一次机会登记为下一次未打卡提醒。
- 服务端不能在无用户操作时静默增加一次性订阅次数；自动倒计时或其他非点击完成场景会在今日页提供“续订”按钮作为合规补充入口。
- 手机是否弹出通知由微信和手机系统设置决定，小程序不能保证系统弹窗。
- 拒绝订阅或发送失败不会影响站内消息。
- 群组打卡和特别关心动态始终写入应用内和消息中心。长期模板发送后保持开关；一次性模板发送成功后自动关闭。

## 执行流程

```text
用户设置提醒时间
    ↓
用户主动授权一次性微信提醒
    ↓
reminder-dispatch 每5分钟扫描
    ↓
校验计划周期、时区、当天打卡、每周目标
    ↓
幂等写入 notifications
    ↓
存在一次性订阅时发送微信服务通知
    ↓
用户完成下一天全部任务时，借由完成点击续订下一次
```

同一用户、计划、日期使用确定性通知 ID。即使定时触发器重复执行，也不会重复建立站内消息。同一轮扫描中每名用户最多尝试发送一条微信提醒，避免多个未完成计划同时消耗多次授权。

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
SOCIAL_CHECKIN_TEMPLATE_ID=好友/群成员打卡模板ID
SOCIAL_CHECKIN_SUBSCRIPTION_TYPE=ONE_TIME
SOCIAL_TEMPLATE_MEMBER_KEY=thing1
SOCIAL_TEMPLATE_PLAN_KEY=thing2
SOCIAL_TEMPLATE_TIME_KEY=time3
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

社交打卡模板默认依次使用成员、计划、完成时间三个字段。实际模板字段不同，只需调整 `SOCIAL_TEMPLATE_*_KEY`。`api/config.json` 已声明 `subscribeMessage.send` 权限，部署后仍需在云开发控制台确认权限生效。

`SOCIAL_CHECKIN_SUBSCRIPTION_TYPE` 默认且建议保持 `ONE_TIME`。只有微信后台明确显示该模板为长期订阅时才设置为 `LONG_TERM`；代码会在成功发送后保留群组和特别关心开关。该配置不能把一次性模板变成长效模板。

## 定时触发器

`cloudfunctions/reminder-dispatch/config.json` 已配置每 5 分钟触发一次：

```text
0 */5 * * * * *
```

同一配置文件也声明了 `subscribeMessage.send` OpenAPI 权限。部署后需要在云开发控制台确认权限和触发器都已经实际创建。提醒允许最多约 9 分钟的调度宽限，并通过幂等 ID 防止重复。扫描使用分页读取，不受单次查询 100 条上限影响。

## 数据结构

计划新增字段：

```text
reminderEnabled
reminderTime
reminderTimezoneOffset
reminderPushEnabled
```

`users.lastReminderRenewalDate` 记录最近一次通过“完成最后任务/手动续订”登记授权的业务日期，防止同一天重复弹出续订请求。旧用户缺失该字段时按尚未续订处理。

`notifications` 保存：用户、计划、业务日期、未读状态、微信推送状态和错误码。消息中心只允许当前用户读取和修改自己的消息；新增第 21 条时自动清理最旧记录，计划上的日期凭证继续负责防止同日重复提醒。

## 验收建议

1. 在体验版创建一个 5 分钟后提醒的每日计划。
2. 一次性模板点击“订阅下一次微信提醒”；长期模板点击“开启长期微信提醒”并同意。
3. 不打卡，等待定时触发器运行。
4. 确认消息中心只出现一条消息。
5. 确认微信服务通知到达并可跳转到“今日”。
6. 再次运行云函数，确认不会重复生成或发送。
7. 一次性提醒发送后完成当天最后一项任务，确认微信订阅授权由该次点击触发，授权成功后显示“已完成并续订提醒”。
8. 当天重复进入或重复编辑已完成任务时不自动重复申请；自动倒计时完成时可通过今日页“续订”按钮补充下一次机会。
9. 创建新的测试日期且不打卡，确认只收到一条微信提醒；站内消息仍可按各计划生成。

微信接口说明：[订阅消息](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/subscribe-message.html)、[`wx.requestSubscribeMessage`](https://developers.weixin.qq.com/miniprogram/dev/api/open-api/subscribe-message/wx.requestSubscribeMessage.html)、[服务端发送接口](https://developers.weixin.qq.com/miniprogram/dev/server/API/mp-message-management/subscribe-message/api_sendmessage.html)。
