/**
 * 版本更新广播：
 * 1. 每次发布时修改 id、version、title 和 content。
 * 2. enabled=true 后，用户下次打开“日历”或“今日”页时会收到一次消息中心通知。
 * 3. 同一个 id 不会重复发送；若要重新广播，必须更换 id。
 */
module.exports = Object.freeze({
  enabled: true,
  id: '2026-09-17-plan-focus-timer',
  version: '1.3.0',
  title: '自律日历与计划计时上线',
  content: '新增默认日历首页，用黑白像素心情记录每一天；点击日期可直接查看小记和折叠的完成任务。计划现已支持正计时、倒计时、暂停与有效时间统计。'
})
