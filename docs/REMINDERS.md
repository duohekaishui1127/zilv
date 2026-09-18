# 计划提醒与微信订阅消息

## 行为边界

- 站内消息：开启计划提醒后持续生效，到点且未打卡时写入消息中心；每名用户只保留最近 20 条。
- 微信提醒：使用一次性订阅消息。用户每同意一次，通常只可发送一条对应模板消息。
- 手机是否弹出通知由微信和手机系统设置决定，小程序不能保证系统弹窗。
- 拒绝订阅或发送失败不会影响站内消息。
- 群组打卡和特别关心动态始终写入应用内；对应微信提醒同样是一次性订阅，成功发送后自动关闭开关。

## 执行流程

```text
用户设置提醒时间
    ↓
用户可主动订阅下一次微信提醒
    ↓
reminder-dispatch 每5分钟扫描
    ↓
校验计划周期、时区、当天打卡、每周目标
    ↓
幂等写入 notifications
    ↓
存在一次性订阅时发送微信服务通知
```

同一用户、计划、日期使用确定性通知 ID。即使定时触发器重复执行，也不会重复建立站内消息。

## 微信公众平台配置

在微信公众平台的“订阅消息”中选择或申请打卡提醒模板。默认代码期望模板包含：

| 用途 | 默认字段 |
|---|---|
| 计划名称 | `thing1` |
| 提醒时间 | `time2` |
| 完成状态 | `thing3` |

如果实际模板字段不同，通过下方环境变量覆盖，不要直接修改业务代码。

## 云函数环境变量

`api`：

```text
PLAN_REMINDER_TEMPLATE_ID=模板ID
SOCIAL_CHECKIN_TEMPLATE_ID=好友/群成员打卡模板ID
SOCIAL_TEMPLATE_MEMBER_KEY=thing1
SOCIAL_TEMPLATE_PLAN_KEY=thing2
SOCIAL_TEMPLATE_TIME_KEY=time3
SOCIAL_MINIPROGRAM_STATE=trial
```

`reminder-dispatch`：

```text
PLAN_REMINDER_TEMPLATE_ID=与 api 相同的模板ID
REMINDER_TEMPLATE_PLAN_KEY=thing1
REMINDER_TEMPLATE_TIME_KEY=time2
REMINDER_TEMPLATE_STATUS_KEY=thing3
REMINDER_MESSAGE_PAGE=pages/today/index
REMINDER_MINIPROGRAM_STATE=trial
```

体验环境使用 `trial`，正式环境改为 `formal`，开发环境可用 `developer`。

`PLAN_REMINDER_TEMPLATE_ID` 不是密钥，但两个云函数必须保持一致。AppSecret 不应放入小程序前端或仓库。

社交打卡模板默认依次使用成员、计划、完成时间三个字段。实际模板字段不同，只需调整 `SOCIAL_TEMPLATE_*_KEY`。`api/config.json` 已声明 `subscribeMessage.send` 权限，部署后仍需在云开发控制台确认权限生效。

## 定时触发器

`cloudfunctions/reminder-dispatch/config.json` 已配置每 5 分钟触发一次：

```text
0 */5 * * * * *
```

同一配置文件也声明了 `subscribeMessage.send` OpenAPI 权限。部署后需要在云开发控制台确认权限和触发器都已经实际创建。提醒允许最多约 9 分钟的调度宽限，并通过幂等 ID 防止重复。

## 数据结构

计划新增字段：

```text
reminderEnabled
reminderTime
reminderTimezoneOffset
reminderPushEnabled
```

`notifications` 保存：用户、计划、业务日期、未读状态、微信推送状态和错误码。消息中心只允许当前用户读取和修改自己的消息；新增第 21 条时自动清理最旧记录，计划上的日期凭证继续负责防止同日重复提醒。

## 验收建议

1. 在体验版创建一个 5 分钟后提醒的每日计划。
2. 点击“订阅下一次微信提醒”并同意。
3. 不打卡，等待定时触发器运行。
4. 确认消息中心只出现一条消息。
5. 确认微信服务通知到达并可跳转到“今日”。
6. 再次运行云函数，确认不会重复生成或发送。
7. 完成计划后创建新的测试日期，确认不会产生提醒。

微信接口说明：[订阅消息](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/subscribe-message.html)、[`wx.requestSubscribeMessage`](https://developers.weixin.qq.com/miniprogram/dev/api/open-api/subscribe-message/wx.requestSubscribeMessage.html)、[服务端发送接口](https://developers.weixin.qq.com/miniprogram/dev/server/API/mp-message-management/subscribe-message/api_sendmessage.html)。
