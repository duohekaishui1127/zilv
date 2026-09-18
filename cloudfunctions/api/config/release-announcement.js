/**
 * 版本更新广播：
 * 1. 每次发布时修改 id、version、title 和 content。
 * 2. enabled=true 后，用户下次打开“日历”或“今日”页时会收到一次消息中心通知。
 * 3. 同一个 id 不会重复发送；若要重新广播，必须更换 id。
 */
module.exports = Object.freeze({
  enabled: true,
  id: '2026-09-18-friends-and-groups',
  version: '1.6.0',
  title: '好友资料与群组邀请上线',
  content: '好友申请新增消息和红点提醒，好友资料支持备注、隐私与特别关心。群组现在可复制 ID 和邀请用户，成员按待完成进度排序，并可查看仅含群组任务的当月打卡日历。'
})
