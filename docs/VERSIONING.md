# 版本与发布管理

项目采用语义化版本（Semantic Versioning）：`主版本.次版本.修订版本`。

- `1.2.0 -> 1.3.0`：新增向后兼容功能；
- `1.2.0 -> 1.2.1`：向后兼容的缺陷修复；
- `1.x -> 2.0.0`：存在需要明确迁移的不兼容接口或数据调整。

应用版本与数据库 Schema 版本是两个概念：应用小版本不一定修改 Schema；只有持久化结构或初始化数据需要迁移时才递增 `SCHEMA_VERSION`。

## Git 建议

首次发布 1.0.0 时：

```bash
git init
git add .
git commit -m "release: zilu v1.0.0"
git tag v1.0.0
```

日常分支建议：

```text
main        可部署、可回滚版本
feature/*   新功能
fix/*       缺陷修复
refactor/*  不改变外部行为的重构
```

提交信息建议：

```text
feat: add body photo comparison
fix: prevent duplicate note mutation
refactor: split group action module
test: cover weekly plan schedule
chore: bump schema version
```

## 发布时修改版本和更新内容

根目录 `VERSION` 是版本号与消息中心更新公告的唯一配置源。每次发布只需要修改：

```json
{
  "version": "1.7.0",
  "title": "本次更新标题",
  "content": [
    "第一项更新内容",
    "第二项更新内容"
  ],
  "enabled": true
}
```

仓库当前 `VERSION` 中的 `legacyAnnouncementIds` 仅用于兼容旧公告，日常发布不需要修改或删除；只编辑 `version`、`title`、`content` 和按需调整 `enabled`。

修改后依次运行：

```bash
npm run release:sync
npm run verify
```

`release:sync` 会同步根目录和三个云函数的 package 版本、客户端与服务端 `APP_VERSION`、`admin-init` 版本，并生成 `cloudfunctions/api/config/release-announcement.js`。不要直接修改生成文件。

`static-check` 会验证所有生成结果与 `VERSION` 完全一致。持久化结构变化时仍需单独提高 `SCHEMA_VERSION` 并新增 migration；普通功能发布不要修改 Schema 版本。最后按需更新 `CHANGELOG.md`，再提交和打 tag。

## Migration 原则

- 已发布 migration 永不删除、永不修改其语义；
- migration 必须可重复检查，初始化逻辑应保持幂等；
- 先在开发云环境验证，再迁移体验/真实数据环境；
- 数据结构迁移必须早于依赖该结构的新客户端大范围使用；
- 重要迁移前应导出或备份真实数据。

当前版本：

```text
APP_VERSION    1.6.0
SCHEMA_VERSION 10
```
