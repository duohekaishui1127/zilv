const { db,C } = require('../lib/db')
const { now,fail } = require('../lib/utils')
const { revokePlanCategoryRecord } = require('../services/plan-records')
const { revokeDailyReview } = require('../services/daily-reviews')
const { emitGroupEventsForRevocation } = require('../services/social')
const { syncLongTermGoalAchievements } = require('../services/long-term-goals')
const { todayForUser } = require('../domain/makeup-cards')
const { getTodayPlans } = require('../services/plans')
const { saveExecutionCheckin } = require('../services/checkin-storage')

async function revokePlanCompletion({ user,event,localDate }) {
  if (localDate !== todayForUser(user)) throw fail('MAKEUP_REQUIRED','历史打卡不能在今日页撤回')
  const result = await db.collection(C.CHECKINS).where({ userId:user._id,planId:event.planId,date:localDate }).limit(1).get()
  if (!result.data[0]?.completed) return { revoked:false }
  const plan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
  const recoverable = plan?.managedByGoalId && plan.managedLifecycleStatus === 'COMPLETED'
  if (!plan || plan.userId !== user._id || plan.deletedAt && !recoverable) throw fail('PLAN_NOT_FOUND','计划不存在')
  const timestamp = now()
  const saved = await saveExecutionCheckin({ db,C,userId:user._id,planId:plan._id,date:localDate,existingId:result.data[0]._id,allowManagedArchive:Boolean(recoverable),
    build:checkin => checkin?.completed ? { completed:false,revokedAt:timestamp,updatedAt:timestamp } : null
  })
  if (!saved.changed) return { revoked:false,checkin:saved.checkin }
  const [state,goalSync] = await Promise.all([
    getTodayPlans(user._id,localDate).then(async plans => ({ plans,dailyReview:await revokeDailyReview(user._id,localDate,plan._id,plans) })).catch(error => {
      console.warn('[revoke-daily-state]',error?.message || error)
      return { plans:null,dailyReview:null }
    }),
    syncLongTermGoalAchievements(user._id,localDate,{ allowReopen:true,plan }).catch(error => {
      console.warn('[long-term-goal-reopen]',error?.message || error); return {}
    }),
    revokePlanCategoryRecord({ user,plan,localDate }).catch(error => console.warn('[category-revoke]',error?.message || error)),
    emitGroupEventsForRevocation(user,plan,saved.checkin).catch(error => console.warn('[social-revoke]',error?.message || error))
  ])
  return { revoked:true,checkin:saved.checkin,...state,updatedGoals:goalSync.updatedGoals,reopenedGoalIds:goalSync.reopenedGoalIds }
}

module.exports = { revokePlanCompletion }
