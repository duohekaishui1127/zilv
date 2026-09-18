/**
 * 版本更新广播：
 * 1. 每次发布时修改 id、version、title 和 content。
 * 2. enabled=true 后，用户下次打开“日历”或“今日”页时会收到一次消息中心通知。
 * 3. 同一个 id 不会重复发送；若要重新广播，必须更换 id。
 */
module.exports = Object.freeze({
  enabled: true,
  id: '2026-09-18-friend-profiles',
  version: '1.6.0',
  title: '好友资料与隐私设置上线',
  content: '好友申请现在支持消息与红点提醒、接受、拒绝和撤回。点击好友可查看对方允许公开的打卡记录，并在右上角设置仅自己可见的备注、特别关心，以及基于全局好友隐私的单好友例外。'
})
