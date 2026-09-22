const { db,C }=require('../lib/db')
const { now,fail }=require('../lib/utils')
const { normalizePlan }=require('../domain/plan-definition')
const { MANAGED_REPEAT_TYPES,recommendedTargetValue,managedPlanOf }=require('../domain/accumulation-plan')
const { publicCommitment }=require('./group-plan-changes')

async function allMatches(collection,where) {
  const records=[]
  while(true) {
    const result=await db.collection(collection).where(where).skip(records.length).limit(100).get()
    records.push(...result.data)
    if(result.data.length < 100)return records
  }
}

function executionSource(input) {
  if(input?.goalType)return input.executionPlan || {}
  return input?.executionPlan || input || {}
}

async function syncGroupCommitments(plan,timestamp=now()) {
  const bindings=(await allMatches(C.PLAN_GROUPS,{ planId:plan._id })).filter(item => item.enabled)
  const commitment=publicCommitment(plan)
  await Promise.all(bindings.map(binding => db.collection(C.PLAN_GROUPS).doc(binding._id).update({ data:{ commitment,updatedAt:timestamp } })))
}

function managedPlanData(goal,input,localDate,existing={},checkins=[]) {
  const source=executionSource(input)
  const repeatType=source.repeatType || existing.repeatType || 'DAILY'
  if(!MANAGED_REPEAT_TYPES.includes(repeatType))throw fail('INVALID_PARAMETER','数量积累任务需要选择重复执行规则')
  const provisionalTarget=Number(source.targetValue || existing.targetValue || goal.executionTargetValue || 1)
  const normalized=normalizePlan({
    ...source,name:goal.name,category:source.category || existing.category || 'CUSTOM',
    targetType:'VALUE',targetValue:provisionalTarget,unit:goal.unit,
    repeatType,startDate:existing.startDate || goal.startDate || localDate,endDate:null,
    privacyLevel:existing.privacyLevel || 'FRIENDS'
  },localDate,existing)
  const draft={
    ...normalized,name:goal.name,targetType:'VALUE',unit:goal.unit,endDate:null,
    longTermGoalIds:[goal._id],managedByGoalId:goal._id,managedPlanType:'ACCUMULATION',
    managedLifecycleStatus:'ACTIVE'
  }
  return { ...draft,targetValue:recommendedTargetValue(goal,draft,checkins,localDate) }
}

async function completedCheckins(userId,planId) {
  return (await allMatches(C.CHECKINS,{ userId,planId })).filter(item => item.completed)
}

function currentValue(goal,checkins) {
  return Number(goal.accumulationBaselineValue || 0)
    + checkins.reduce((sum,item) => sum + Number(item.actualValue || 0),0)
}

async function ensureManagedAccumulationPlan(userId,goal,input,localDate) {
  let existing=null
  if(goal.managedExecutionPlanId) {
    existing=await db.collection(C.PLANS).doc(goal.managedExecutionPlanId).get().then(result => result.data).catch(() => null)
  }
  if(!existing) {
    const candidates=await db.collection(C.PLANS).where({ managedByGoalId:goal._id }).limit(1).get()
    existing=candidates.data.find(item => item.userId === userId) || null
  }
  const checkins=existing ? await completedCheckins(userId,existing._id) : []
  const decorated={ ...goal,currentValue:goal.currentValue == null ? currentValue(goal,checkins) : goal.currentValue }
  const data={ userId,...managedPlanData(decorated,input,localDate,existing || {},checkins),updatedAt:now() }
  let plan
  if(existing) {
    await db.collection(C.PLANS).doc(existing._id).update({ data })
    plan={ ...existing,...data }
    await syncGroupCommitments(plan,data.updatedAt)
  } else {
    data.enabled=true
    data.createdAt=data.updatedAt
    const added=await db.collection(C.PLANS).add({ data })
    plan={ _id:added._id,...data }
  }
  if(goal.managedExecutionPlanId !== plan._id) {
    const history=Array.isArray(goal.linkedPlanHistory) ? goal.linkedPlanHistory : []
    const update={ managedExecutionPlanId:plan._id,updatedAt:now() }
    if(!history.some(item => item.planId === plan._id))update.linkedPlanHistory=[...history,{
      planId:plan._id,name:plan.name,category:plan.category,boundAt:now(),managed:true
    }].slice(-50)
    await db.collection(C.PLANS).doc(goal._id).update({ data:update })
  }
  return plan
}

async function prepareManagedAccumulationPlanUpdate(userId,plan,normalized,localDate) {
  const goal=await db.collection(C.PLANS).doc(plan.managedByGoalId).get().then(result => result.data).catch(() => null)
  if(!goal || goal.userId !== userId || goal.goalStatus !== 'ACTIVE')throw fail('PLAN_NOT_FOUND','所属数量积累目标已结束')
  const checkins=await completedCheckins(userId,plan._id)
  const decorated={ ...goal,currentValue:currentValue(goal,checkins) }
  return managedPlanData(decorated,normalized,localDate,plan,checkins)
}

async function syncManagedAccumulationTargets(context,localDate) {
  const updates=[]
  for(const goal of context.goals.filter(item => item.goalType === 'ACCUMULATION' && item.goalStatus === 'ACTIVE')) {
    const plan=managedPlanOf(goal,context.allExecutionPlans || context.plans)
    if(!plan || plan.deletedAt || plan.enabled === false)continue
    const targetValue=recommendedTargetValue(goal,plan,context.checkins,localDate)
    goal.recommendedValue=targetValue
    if(Number(targetValue) === Number(plan.targetValue))continue
    plan.targetValue=targetValue
    const timestamp=now()
    updates.push(Promise.all([
      db.collection(C.PLANS).doc(plan._id).update({ data:{ targetValue,updatedAt:timestamp } }),
      syncGroupCommitments({ ...plan,targetValue },timestamp)
    ]))
  }
  await Promise.all(updates)
}

async function archiveManagedAccumulationPlan(goal,status,timestamp=now()) {
  if(!goal.managedExecutionPlanId)return
  const bindings=(await allMatches(C.PLAN_GROUPS,{ planId:goal.managedExecutionPlanId })).filter(item => item.enabled)
  await Promise.all([
    db.collection(C.PLANS).doc(goal.managedExecutionPlanId).update({ data:{
      enabled:false,deletedAt:timestamp,managedLifecycleStatus:status,updatedAt:timestamp
    } }).catch(() => null),
    ...bindings.map(binding => db.collection(C.PLAN_GROUPS).doc(binding._id).update({ data:{
      enabled:false,managedArchivedAt:timestamp,updatedAt:timestamp
    } }))
  ])
}

async function reopenManagedAccumulationPlan(goal,timestamp=now()) {
  if(!goal.managedExecutionPlanId)return
  const bindings=await allMatches(C.PLAN_GROUPS,{ planId:goal.managedExecutionPlanId })
  await Promise.all([
    db.collection(C.PLANS).doc(goal.managedExecutionPlanId).update({ data:{
      enabled:true,deletedAt:null,managedLifecycleStatus:'ACTIVE',updatedAt:timestamp
    } }).catch(() => null),
    ...bindings.filter(binding => binding.managedArchivedAt).map(binding =>
      db.collection(C.PLAN_GROUPS).doc(binding._id).update({ data:{ enabled:true,managedArchivedAt:null,updatedAt:timestamp } }))
  ])
}

module.exports={
  managedPlanData,ensureManagedAccumulationPlan,prepareManagedAccumulationPlanUpdate,
  syncManagedAccumulationTargets,archiveManagedAccumulationPlan,reopenManagedAccumulationPlan
}
