const { timerSnapshot,secondsOf } = require('./plan-timer')

function timerResult(checkin,plan,serverTime = new Date()) {
  const snapshot = timerSnapshot(checkin,plan,serverTime)
  return { checkin,snapshot:{
    status:snapshot.status,effectiveSeconds:secondsOf(snapshot.effectiveMs),
    totalSeconds:secondsOf(snapshot.totalMs),pausedSeconds:secondsOf(snapshot.pausedMs),
    reachedTarget:snapshot.reachedTarget
  },serverTime }
}
module.exports = { timerResult }
