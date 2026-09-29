const crypto = require('crypto')

function executionCheckinId(userId,planId,date) {
  return crypto.createHash('sha256').update(`execution:${userId}:${planId}:${date}`).digest('hex').slice(0,32)
}
async function txRead(transaction,collection,id) {
  try { return (await transaction.collection(collection).doc(id).get()).data || null }
  catch (error) {
    if (/not exist|not found|不存在|does not exist/i.test(String(error?.message || error?.errMsg || ''))) return null
    throw error
  }
}
async function saveExecutionCheckin({ db,C,userId,planId,date,existingId,build,allowManagedArchive = false }) {
  const id = existingId || executionCheckinId(userId,planId,date)
  const output = await db.runTransaction(async transaction => {
    const existing = await txRead(transaction,C.CHECKINS,id)
    if (existing && (existing.userId !== userId || existing.planId !== planId || existing.date !== date)) {
      throw { success:false,code:'INVALID_PARAMETER',message:'任务记录不匹配' }
    }
    const plan = await txRead(transaction,C.PLANS,planId)
    const recoverable = allowManagedArchive && plan?.managedByGoalId && plan.managedLifecycleStatus === 'COMPLETED'
    if (!plan || plan.userId !== userId || plan.deletedAt && !recoverable) throw { success:false,code:'PLAN_NOT_FOUND',message:'计划不存在' }
    const data = build(existing,plan)
    if (data === null) return { checkin:existing,wasCompleted:Boolean(existing?.completed),changed:false }
    const ref = transaction.collection(C.CHECKINS).doc(id)
    if (existing) await ref.update({ data })
    else await ref.set({ data:{ userId,planId,date,createdAt:data.updatedAt,...data } })
    return { checkin:{ ...(existing || { userId,planId,date }),...data,_id:id },wasCompleted:Boolean(existing?.completed),changed:true }
  })
  return output?.result || output
}

module.exports = { executionCheckinId,saveExecutionCheckin,txRead }
