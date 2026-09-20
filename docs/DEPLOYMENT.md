# 1.6.0 部署步骤

1. 将 `project.config.json` 中 `appid` 替换为真实小程序 AppID。
2. 开通云开发，推荐分别创建开发环境和真实体验环境。
3. 在 `miniprogram/config/env.js` 填写 develop / trial / release 对应环境 ID。
4. 上传部署 `cloudfunctions/admin-init`（云端安装依赖）。
5. 调用 `admin-init` 一次，确认 `success: true`、`appVersion: 1.6.0`、`schemaVersion: 10`。
6. 按 `DATABASE_SCHEMA.md` 创建推荐索引。
7. 在微信公众平台选择打卡提醒模板，并按 `REMINDERS.md` 配置模板字段。
8. 为 `api` 和 `reminder-dispatch` 同时配置 `PLAN_REMINDER_TEMPLATE_ID`；另为 `api` 配置 `SOCIAL_CHECKIN_TEMPLATE_ID` 及对应模板字段。
9. 在小程序“我的”复制作者账号的好友码，并为 `api` 配置 `FEEDBACK_ADMIN_SHARE_CODES`；多个管理员好友码用英文逗号分隔。
10. 按需修改 `cloudfunctions/api/config/release-announcement.js` 的公告 id、版本和文案。
11. 上传部署 `cloudfunctions/api` 和 `cloudfunctions/reminder-dispatch`（云端安装依赖）。
12. 确认 `reminder-dispatch/config.json` 的每 5 分钟定时触发器已经创建。
13. 根目录执行 `npm run verify`。
14. 编译运行并在“我的 → 关于与诊断”确认客户端/服务端版本均为 1.6.0、Schema 均为 10。
15. 真机测试反馈提交、作者消息提醒、反馈状态通知、版本公告、订阅授权和消息中心。
16. 初始化完成后停用/删除 `admin-init`，或配置 `ADMIN_INIT_TOKEN`。

## 发布顺序

- 先部署 `admin-init` 并执行一次；
- 确认 33 个集合、种子数据和十条 Schema migration 已就绪；
- 再部署 `api`；
- 部署 `reminder-dispatch` 并确认定时触发器；
- 最后上传小程序体验版并完成真机验收。

不要先发布客户端再初始化 Schema，否则 API 会返回 `DATABASE_NOT_INITIALIZED`。
