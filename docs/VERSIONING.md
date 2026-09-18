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

## 发布时必须同步检查

1. 根目录 `VERSION`；
2. 根目录 `package.json` 与 `package-lock.json`；
3. `miniprogram/config/version.js`；
4. `cloudfunctions/api/package.json`；
5. `cloudfunctions/admin-init/package.json`；
6. `cloudfunctions/reminder-dispatch/package.json`；
7. `cloudfunctions/api/lib/version.js`；
8. `cloudfunctions/admin-init/index.js` 中应用/Schema 版本；
9. `CHANGELOG.md`；
10. 如果持久化结构变化，提高 `SCHEMA_VERSION` 并新增 migration；
11. 执行 `npm run verify`，通过后再打 tag。

`tools/static-check.js` 会自动检查上述主要版本值是否一致，并禁止云函数依赖使用 `latest`/`*`。

## Migration 原则

- 已发布 migration 永不删除、永不修改其语义；
- migration 必须可重复检查，初始化逻辑应保持幂等；
- 先在开发云环境验证，再迁移体验/真实数据环境；
- 数据结构迁移必须早于依赖该结构的新客户端大范围使用；
- 重要迁移前应导出或备份真实数据。

当前版本：

```text
APP_VERSION    1.6.0
SCHEMA_VERSION 7
```
