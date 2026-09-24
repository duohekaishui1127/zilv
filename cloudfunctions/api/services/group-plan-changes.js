const { db, C } = require('../lib/db')
const { now, fail } = require('../lib/utils')
const { assertNoActiveTimer } = require('./plans')
const { approvalGroups } = require('../domain/group-plan-change')

const CHANGE_TYPES = Object.freeze(['UPDATE','SET_ENABLED','DELETE','UNBIND'])

function publicCommitment(plan = {}) {
  return {
    name:plan.name || '计划', category:plan.category || 'CUSTOM',
    targetType:plan.targetType || 'BOOLEAN', targetValue:Number(plan.targetValue || 1), unit:plan.unit || '',
    repeatType:plan.repeatType || 'DAILY', repeatConfig:plan.repeatConfig || {},
    startDate:plan.startDate || '', endDate:plan.endDate || null,
    timerMode:plan.timerMode || 'NONE', timerDurationMinutes:plan.timerDurationMinutes || null
  }
}

async function allMatches(collection, where) {
  const records=[]
  while(true) {
    const result=await db.collection(collection).where(where).skip(records.length).limit(100).get()
    records.push(...result.data)
    if(result.data.length < 100)return records
  }
}

async function activeBindings(planId, userId) {
  return allMatches(C.PLAN_GROUPS,{ planId,userId,enabled:true })
}

async function ownedGroupIds(userId) {
  const memberships=await allMatches(C.GROUP_MEMBERS,{ userId,role:'OWNER',status:'ACTIVE' })
  return memberships.map(item => item.groupId)
}

function requestSummary(type, plan, payload) {
  if (type === 'UPDATE') return `申请修改群监督计划「${plan.name || '计划'}」`
  if (type === 'SET_ENABLED') return `申请${payload.enabled ? '启用' : '停用'}计划「${plan.name || '计划'}」`
  if (type === 'DELETE') return `申请删除计划「${plan.name || '计划'}」`
  return `申请将计划「${plan.name || '计划'}」解除群绑定`
}

async function requestGroupPlanChange({ userId, plan, type, payload = {}, groupId = '' }) {
  if (!CHANGE_TYPES.includes(type)) throw fail('INVALID_PARAMETER', '计划变更类型不合法')
  const bindings = await activeBindings(plan._id, userId)
  const affected = type === 'UNBIND' ? bindings.filter(item => item.groupId === groupId) : bindings
  const approval=approvalGroups(affected.map(item => item.groupId),await ownedGroupIds(userId))
  const timestamp = now()
  const data = {
    userId,planId:plan._id,type,payload,
    groupIds:approval.groupIds,approvedGroupIds:approval.approvedGroupIds,rejectedGroupIds:[],
    currentPlan:publicCommitment(plan),proposedPlan:type === 'UPDATE' ? publicCommitment(payload.plan) : null,
    summary:requestSummary(type,plan,payload),status:approval.approvalRequired ? 'PENDING' : 'APPROVED',
    createdAt:timestamp,updatedAt:timestamp
  }
  if (affected.length) {
    const existing = await db.collection(C.GROUP_PLAN_CHANGES).where({ userId,planId:plan._id,status:'PENDING' }).limit(1).get()
    if (existing.data.length) throw fail('GROUP_PLAN_CHANGE_PENDING', '该计划已有待审核的变更申请')
  }
  if (!affected.length || !approval.approvalRequired) return { approvalRequired:false,change:data }
  const added = await db.collection(C.GROUP_PLAN_CHANGES).add({ data })
  return { approvalRequired:true,request:{ _id:added._id,...data } }
}

async function applyPlanChange(change, localDate) {
  const plan = await db.collection(C.PLANS).doc(change.planId).get().then(x => x.data).catch(() => null)
  if (!plan || plan.userId !== change.userId) throw fail('PLAN_NOT_FOUND', '待变更计划不存在')
  if (plan.deletedAt) {
    if (change.type === 'DELETE') return { deleted:true }
    throw fail('PLAN_NOT_FOUND', '待变更计划不存在')
  }
  if(plan.managedByGoalId && ['DELETE','SET_ENABLED'].includes(change.type)) {
    throw fail('INVALID_PARAMETER','该任务由数量积累目标管理，不能单独停用或删除')
  }
  if (change.type === 'UPDATE' || change.type === 'DELETE' || (change.type === 'SET_ENABLED' && !change.payload.enabled)) {
    await assertNoActiveTimer(plan.userId,plan._id,localDate)
  }
  const timestamp=now()
  if(change.type === 'UPDATE') {
    const data={ ...change.payload.plan,updatedAt:timestamp }
    await db.collection(C.PLANS).doc(plan._id).update({ data })
    const bindings=await activeBindings(plan._id,plan.userId)
    const commitment=publicCommitment(change.payload.plan)
    await Promise.all(bindings.map(item => db.collection(C.PLAN_GROUPS).doc(item._id).update({ data:{ commitment,updatedAt:timestamp } })))
    return { plan:{ ...plan,...data } }
  }
  if(change.type === 'SET_ENABLED') {
    const enabled=Boolean(change.payload.enabled)
    await db.collection(C.PLANS).doc(plan._id).update({ data:{ enabled,updatedAt:timestamp } })
    return { enabled }
  }
  if(change.type === 'DELETE') {
    await db.collection(C.PLANS).doc(plan._id).update({ data:{ enabled:false,deletedAt:timestamp,updatedAt:timestamp } })
    const bindings=await activeBindings(plan._id,plan.userId)
    await Promise.all(bindings.map(item => db.collection(C.PLAN_GROUPS).doc(item._id).update({ data:{ enabled:false,updatedAt:timestamp } })))
    return { deleted:true }
  }
  const bindings=await activeBindings(plan._id,plan.userId)
  const targetGroupId=change.groupIds?.[0]
  await Promise.all(bindings.filter(item => item.groupId === targetGroupId).map(item =>
    db.collection(C.PLAN_GROUPS).doc(item._id).update({ data:{ enabled:false,updatedAt:timestamp } })))
  return { unbound:true }
}

async function pendingChangesForGroup(groupId) {
  const pending=[]
  while (true) {
    const result=await db.collection(C.GROUP_PLAN_CHANGES).where({ status:'PENDING' }).skip(pending.length).limit(100).get()
    pending.push(...result.data)
    if (result.data.length < 100) break
  }
  return pending.filter(item => Array.isArray(item.groupIds) && item.groupIds.includes(groupId) &&
    !(item.approvedGroupIds || []).includes(groupId))
}

module.exports = { publicCommitment, activeBindings, requestGroupPlanChange, applyPlanChange, pendingChangesForGroup }
