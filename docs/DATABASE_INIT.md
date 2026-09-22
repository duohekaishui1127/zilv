# 1.6.0 数据库初始化（Schema 13）

`cloudfunctions/admin-init` 是一次性管理函数。

执行后：

- 自动确保 33 个集合存在；
- 幂等写入 63 条基础食物；
- 幂等写入 15 个运动项目；
- 幂等写入 12 个身体指标；
- 幂等写入 7 项应用配置；
- 将 `system_meta.schemaVersion` 更新为 13；
- 写入 Schema 1 至 12 的 migration 记录。

重复执行不会无限新增同名系统数据。

Schema 13 不新增集合。长期目标、执行时间、目标绑定和提醒授权保存在现有 `plans` 中，今日卡片设置保存在 `users.homePreferences` 中；旧计划缺少 `planType` 时自动按执行任务处理，无需批量回填。初始化还会按无向用户对清理历史重复好友关系：保留优先级最高的一条，其余记录标记为 `DUPLICATE`，不会物理删除。

## 安全建议

初始化完成后：

1. 最推荐：停用或删除 `admin-init`；
2. 如果需要保留，配置环境变量 `ADMIN_INIT_TOKEN`，调用时携带 token。

业务客户端永远不需要直接调用 admin-init。
