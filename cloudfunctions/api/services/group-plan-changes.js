const { db, C } = require('../lib/db')
const { now, fail } = require('../lib/utils')

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

async function activeBindings(planId, userId) {
  const result = await db.collection(C.PLAN_GROUPS).where({ planId,userId,enabled:true }).get()
  return result.data
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
  if (!affected.length) return null
  const existing = await db.collection(C.GROUP_PLAN_CHANGES).where({ userId,planId:plan._id,status:'PENDING' }).limit(1).get()
  if (existing.data.length) throw fail('GROUP_PLAN_CHANGE_PENDING', '该计划已有待审核的变更申请')
  const timestamp = now()
  const data = {
    userId,planId:plan._id,type,payload,
    groupIds:[...new Set(affected.map(item => item.groupId))],approvedGroupIds:[],rejectedGroupIds:[],
    currentPlan:publicCommitment(plan),proposedPlan:type === 'UPDATE' ? publicCommitment(payload.plan) : null,
    summary:requestSummary(type,plan,payload),status:'PENDING',createdAt:timestamp,updatedAt:timestamp
  }
  const added = await db.collection(C.GROUP_PLAN_CHANGES).add({ data })
  return { _id:added._id,...data }
}

async function pendingChangesForGroup(groupId) {
  const result = await db.collection(C.GROUP_PLAN_CHANGES).where({ status:'PENDING' }).limit(100).get()
  return result.data.filter(item => Array.isArray(item.groupIds) && item.groupIds.includes(groupId) &&
    !(item.approvedGroupIds || []).includes(groupId))
}

module.exports = { publicCommitment, activeBindings, requestGroupPlanChange, pendingChangesForGroup }
