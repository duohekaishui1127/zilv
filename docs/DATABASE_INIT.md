# 1.6.0 数据库初始化（Schema 9）

`cloudfunctions/admin-init` 是一次性管理函数。

执行后：

- 自动确保 32 个集合存在；
- 幂等写入 63 条基础食物；
- 幂等写入 15 个运动项目；
- 幂等写入 12 个身体指标；
- 幂等写入 7 项应用配置；
- 将 `system_meta.schemaVersion` 更新为 9；
- 写入 Schema 1 至 9 的 migration 记录。

重复执行不会无限新增同名系统数据。

## 安全建议

初始化完成后：

1. 最推荐：停用或删除 `admin-init`；
2. 如果需要保留，配置环境变量 `ADMIN_INIT_TOKEN`，调用时携带 token。

业务客户端永远不需要直接调用 admin-init。
