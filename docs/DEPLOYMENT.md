# 1.7.1 部署步骤

1. 将 `project.config.json` 中 `appid` 替换为真实小程序 AppID。
2. 开通云开发，推荐分别创建开发环境和真实体验环境。
3. 在 `miniprogram/config/env.js` 填写 develop / trial / release 对应环境 ID。
4. 上传部署 `cloudfunctions/admin-init`（云端安装依赖）。
5. 调用 `admin-init` 一次，确认 `success: true`、`appVersion: 1.7.1`、`schemaVersion: 18`，并检查 `friendshipDeduplication` 结果。
6. 按 `DATABASE_SCHEMA.md` 创建推荐索引。
7. 在微信公众平台选择打卡提醒模板，并按 `REMINDERS.md` 配置模板字段。
8. 为 `api` 和 `reminder-dispatch` 同时配置 `PLAN_REMINDER_TEMPLATE_ID`、`PLAN_REMINDER_SUBSCRIPTION_TYPE`、`SOCIAL_CHECKIN_TEMPLATE_ID`、`SOCIAL_CHECKIN_SUBSCRIPTION_TYPE`、`SOCIAL_TEMPLATE_TIME_KEY`、`SOCIAL_TEMPLATE_CONTENT_KEY` 与 `SOCIAL_MINIPROGRAM_STATE`。普通模板填 `ONE_TIME`，微信后台明确标记为长期订阅的模板才填 `LONG_TERM`。社交消息中心即时写入，微信推送由 `reminder-dispatch` 后台投递。
9. 在小程序“我的”复制作者账号的好友码，并为 `api` 配置 `FEEDBACK_ADMIN_SHARE_CODES`；多个管理员好友码用英文逗号分隔。
10. 修改根目录 `VERSION` 的版本号、标题和更新内容，执行 `npm run release:sync`；不要直接编辑生成的 `release-announcement.js`。
11. 上传部署 `cloudfunctions/api` 和 `cloudfunctions/reminder-dispatch`（云端安装依赖）。
12. 确认 `reminder-dispatch/config.json` 的每分钟定时触发器已经创建。
13. 根目录执行 `npm run verify`。
14. 编译运行并在“我的 → 关于与诊断”确认客户端/服务端版本均为 1.7.1、Schema 均为 18。
15. 真机测试反馈提交、作者消息提醒、反馈状态通知、版本公告、订阅授权和消息中心。
16. 初始化完成后停用/删除 `admin-init`，或配置 `ADMIN_INIT_TOKEN`。

## 发布顺序

- 先部署 `admin-init` 并执行一次；
- 确认 33 个集合、种子数据和十八条 Schema migration 已就绪；
- 再部署 `api`；
- 部署 `reminder-dispatch` 并确认定时触发器；
- 最后上传小程序体验版并完成真机验收。

不要先发布客户端再初始化 Schema，否则 API 会返回 `DATABASE_NOT_INITIALIZED`。

## 1.7.1 额外检查

- 在 `api` 云函数配置真实 `LEGAL_OPERATOR_NAME`、`LEGAL_PRIVACY_CONTACT`、`LEGAL_SERVICE_CONTACT`、`LEGAL_EFFECTIVE_DATE`。
- 在微信公众平台完成《小程序用户隐私保护指引》，并与 `docs/PRIVACY_AND_RELEASE.md` 中扫描到的实际权限保持一致。
- `DEFAULT_ADMIN_FRIEND_ENABLED` 保持 `false`；Schema 18 会解除旧版默认管理员好友的保护标记，用户可自行删除。
- 公测期保持 `BETA_ENROLLMENT_ENABLED=true`；停止招募后设为 `false`。
- 在正式接入并验收微信官方虚拟支付前，保持 `PRO_PURCHASE_ENABLED=false`。
- 真机验证首次协议确认、拒绝退出、协议版本更新、部分数据清理和永久注销。

- `api` 云函数默认会为首次进入 1.7.1 的用户发放 90 天 Beta Pro；公测结束后设置环境变量 `BETA_ENROLLMENT_ENABLED=false`。
- 真机检查“成长复盘 → 保存海报”，确认相册授权链路和小程序后台对应的隐私/能力声明已配置。
- 真机检查“分享海报”和“分享小程序”；不支持图片分享菜单的客户端会保留保存海报能力。
- 周报回顾上一完整自然周，月报回顾上一完整自然月，90 天复盘回顾截至昨天的最近 90 天。
