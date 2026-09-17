/**
 * 版本更新广播：
 * 1. 每次发布时修改 id、version、title 和 content。
 * 2. enabled=true 后，用户下次打开“今日”页时会收到一次消息中心通知。
 * 3. 同一个 id 不会重复发送；若要重新广播，必须更换 id。
 */
module.exports = Object.freeze({
  enabled: true,
  id: '2026-09-17-feedback-and-today',
  version: '1.2.0',
  title: '自律功能更新',
  content: '本次更新优化了今日计划与能量展示，并新增“意见与建议”。欢迎把使用感受和希望改进的地方告诉我们。'
})
