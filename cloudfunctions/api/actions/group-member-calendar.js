const { db, _, C } = require('../lib/db')
const { dateOnly, fail } = require('../lib/utils')
const { isBasePlanDue } = require('../domain/plan-schedule')
const { getUserById } = require('../services/users')
const { isGroupMember } = require('../services/social')

function normalizedMonth(value) {
  const month=String(value || '')
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : dateOnly().slice(0,7)
}

function monthDates(month) {
  const [year,value]=month.split('-').map(Number)
  const count=new Date(year,value,0).getDate()
  return Array.from({ length:count },(_,index) => `${month}-${String(index + 1).padStart(2,'0')}`)
}

function dayView(date, plans, checkinMap) {
  const tasks=[]
  plans.forEach(plan => {
    const checkin=checkinMap.get(`${plan._id}:${date}`)
    const flexible=plan.repeatType === 'WEEKLY_COUNT'
    if (flexible && !checkin?.completed) return
    if (!flexible && (!plan.enabled || !isBasePlanDue(plan,date))) return
    tasks.push({ planId:plan._id,name:plan.name || '计划',category:plan.category || 'CUSTOM',completed:Boolean(checkin?.completed) })
  })
  const completed=tasks.filter(item => item.completed).length
  const total=tasks.length
  return {
    date,day:Number(date.slice(-2)),completed,total,tasks,
    status:!total ? 'NONE' : (completed === total ? 'COMPLETE' : (completed ? 'PARTIAL' : 'PENDING'))
  }
}

async function getGroupMemberCalendar({ user, event }) {
  const groupId=String(event.groupId || '')
  const memberUserId=String(event.memberUserId || '')
  const [viewerMembership,targetMembership] = await Promise.all([
    isGroupMember(groupId,user._id),isGroupMember(groupId,memberUserId)
  ])
  if (!viewerMembership || !targetMembership) throw fail('GROUP_PERMISSION_DENIED','只能查看同群成员的监督进度')
  const month=normalizedMonth(event.month)
  const dates=monthDates(month)
  const startDate=dates[0]
  const endDate=dates[dates.length - 1]
  const [member,bindings,checkins] = await Promise.all([
    getUserById(memberUserId),
    db.collection(C.PLAN_GROUPS).where({ groupId,userId:memberUserId,enabled:true }).get(),
    db.collection(C.CHECKINS).where({ userId:memberUserId,date:_.gte(startDate).and(_.lte(endDate)) }).get()
  ])
  if (!member) throw fail('NOT_FOUND','群成员不存在')
  const plans=(await Promise.all(bindings.data.map(binding => db.collection(C.PLANS).doc(binding.planId).get()
    .then(result => result.data).catch(() => null)))).filter(plan => plan && !plan.deletedAt)
  const allowedIds=new Set(plans.map(plan => plan._id))
  const checkinMap=new Map(checkins.data.filter(item => allowedIds.has(item.planId))
    .map(item => [`${item.planId}:${item.date}`,item]))
  const days=dates.map(date => dayView(date,plans,checkinMap))
  return {
    member:{ _id:member._id,nickname:member.nickname,avatar:member.avatar,role:targetMembership.role },
    month,days,
    summary:{
      completedDays:days.filter(day => day.status === 'COMPLETE').length,
      completedTasks:days.reduce((sum,day) => sum + day.completed,0),
      totalTasks:days.reduce((sum,day) => sum + day.total,0)
    }
  }
}

module.exports = { getGroupMemberCalendar }
