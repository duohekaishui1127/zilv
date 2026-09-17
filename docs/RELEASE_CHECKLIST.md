# 1.4.0 发布检查清单

## 代码质量

- [ ] `npm run verify` 全部通过
- [ ] 没有 `latest` / `*` 云函数依赖
- [ ] APP_VERSION 与各 package/version 文件一致
- [ ] SCHEMA_VERSION 在客户端、API、admin-init 中一致
- [ ] 新增 Action 已注册且客户端调用可解析
- [ ] 没有页面直接绕过 `utils/api.js` 调用业务云函数

## 数据库

- [ ] 在开发环境先运行 `admin-init`
- [ ] 确认 `system_meta.schemaVersion = 7`
- [ ] 配置 `FEEDBACK_ADMIN_SHARE_CODES` 并验证作者可以打开反馈管理页
- [ ] 修改并核对 `cloudfunctions/api/config/release-announcement.js`
- [ ] 确认 `004_plan_reminders` migration 已记录
- [ ] 确认 `notes`、`note_attachments`、`body_metric_preferences`、`notifications` 已创建
- [ ] 按 `DATABASE_SCHEMA.md` 建议建立索引
- [ ] 真实数据升级前完成备份

## 隐私与安全

- [ ] 笔记/体态照片仅本人可读取
- [ ] 群组只公开绑定计划的执行结果
- [ ] 好友读取仍受隐私配置约束
- [ ] 云存储规则不允许陌生用户枚举体态照片
- [ ] 日志中没有记录体重、饮食正文、笔记正文等敏感 payload

## 可用性

- [ ] 新建日志后可返回时间轴并立即看到记录
- [ ] 拍照/相册取消不会报错
- [ ] 网络失败后草稿可以恢复并重试
- [ ] 重复保存同一新日志不会产生重复记录
- [ ] 身体指标选择保存后，下次进入仍保持
- [ ] 空状态、加载失败与重试入口可见
- [ ] 7/30/90 天趋势图在真机高像素密度屏幕上清晰显示
- [ ] 月度活跃日历可前后切换月份
- [ ] 未记录饮食的日期不会产生虚假的热量缺口

## 环境与发布

- [ ] develop 使用开发云环境
- [ ] trial/release 使用预期云环境
- [ ] 先部署 `admin-init` 并完成迁移
- [ ] 再部署 `api`
- [ ] `api` 与 `reminder-dispatch` 配置相同的 `PLAN_REMINDER_TEMPLATE_ID`
- [ ] 订阅消息模板字段名与 `REMINDER_TEMPLATE_*_KEY` 一致
- [ ] 部署 `reminder-dispatch` 并确认每 5 分钟触发器生效
- [ ] 体验版使用 `REMINDER_MINIPROGRAM_STATE=trial`，正式版使用 `formal`
- [ ] 编译小程序并完成核心回归测试
- [ ] `CHANGELOG.md` 已更新
- [ ] Git commit / tag 已创建
