# 1.0.0 首次部署步骤

1. 将 `project.config.json` 中 `appid` 替换为真实小程序 AppID。
2. 开通云开发，推荐分别创建开发环境和真实体验环境。
3. 在 `miniprogram/config/env.js` 填写 develop / trial / release 对应环境 ID。
4. 上传部署 `cloudfunctions/admin-init`（云端安装依赖）。
5. 调用 `admin-init` 一次，确认 `success: true`、`appVersion: 1.0.0`、`schemaVersion: 3`。
6. 按 `DATABASE_SCHEMA.md` 创建推荐索引。
7. 上传部署 `cloudfunctions/api`（云端安装依赖）。
8. 根目录执行 `npm run verify`。
9. 编译运行并在“我的 → 关于与诊断”确认客户端/服务端版本均为 1.0.0、Schema 均为 3。
10. 真机测试拍照、图片上传、日志编辑和删除。
11. 初始化完成后停用/删除 `admin-init`，或配置 `ADMIN_INIT_TOKEN`。

## 发布顺序

- 先部署 `admin-init` 并执行一次；
- 确认 26 个集合、种子数据和三条 Schema migration 已就绪；
- 再部署 `api`；
- 最后上传小程序体验版并完成真机验收。

不要先发布客户端再初始化 Schema，否则 API 会返回 `DATABASE_NOT_INITIALIZED`。
