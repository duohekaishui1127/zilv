/**
 * 版本更新广播：
 * 1. 每次发布时修改 id、version、title 和 content。
 * 2. enabled=true 后，用户下次打开“日历”或“今日”页时会收到一次消息中心通知。
 * 3. 同一个 id 不会重复发送；若要重新广播，必须更换 id。
 */
module.exports = Object.freeze({
  enabled: true,
  id: '2026-09-17-plan-driven-daily-review',
  version: '1.4.0',
  title: '计划驱动的今日与整日打卡上线',
  content: '底部导航已调整为日历、今日、计划、圈子和我的。任务完成不再强制填写心情，完成全部今日计划后可统一记录整日心情与小记；日历会用这份心情印记当天。饮食新增时间流、文字和照片记录，身体数据入口已移至“我的”。'
})
