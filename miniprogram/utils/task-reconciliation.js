function reconcileTask(incoming,local,completing,revoking,authoritative = false) {
  if (!local || incoming.checkin?.date && local.checkin?.date && incoming.checkin.date !== local.checkin.date) return incoming
  if (completing && local.completed || revoking && !local.completed) return { ...incoming,completed:local.completed,checkin:local.checkin,syncing:true }
  if (authoritative) return incoming
  const saved = new Date(local.checkin?.updatedAt || '').getTime()
  const received = new Date(incoming.checkin?.updatedAt || '').getTime()
  if (!local.checkin?.optimistic && Number.isFinite(saved) && (!Number.isFinite(received) || saved > received)) {
    return { ...incoming,completed:local.completed,checkin:local.checkin }
  }
  return incoming
}
function reconcileDailyReview(incoming,local,completion) {
  let review = incoming || local
  if (incoming && local?.date === incoming.date && new Date(local.updatedAt) > new Date(incoming.updatedAt)) review = local
  if (!review) return null
  const completed = completion.total > 0 && completion.completed === completion.total
  return { ...review,totalPlanCount:completion.total,completedPlanCount:completion.completed,allPlansCompleted:completed,checkinState:completed ? 'COMPLETE' : 'INCOMPLETE' }
}
module.exports = { reconcileTask,reconcileDailyReview }
