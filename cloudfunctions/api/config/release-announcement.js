/**
 * 版本更新广播：
 * 1. 每次发布时修改 id、version、title 和 content。
 * 2. enabled=true 后，用户下次打开“今日”页时会收到一次消息中心通知。
 * 3. 同一个 id 不会重复发送；若要重新广播，必须更换 id。
 */
module.exports = Object.freeze({
  enabled: true,
  id: '2026-09-17-plan-focus-timer',
  version: '1.3.0',
  title: '计划专注计时上线',
  content: '计划现已支持正计时和倒计时，可暂停、继续与结束，并自动统计有效时间、总用时和暂停时间。完成后会同步到对应的学习或运动记录。'
})
