const { db, C } = require('../lib/db')
const { round1, now } = require('../lib/utils')
const { latestWeight, currentNutritionTarget, recalcNutritionTarget } = require('../services/nutrition')
const { getTodayPlans: getTodayPlansService } = require('../services/plans')
const { nutritionSummary, workoutSummary, studySummary } = require('../services/summaries')
const { homePreferencesOf } = require('../services/preferences')
const { ensureReleaseAnnouncement } = require('../services/release-announcements')
const { ensureDailyReviewAfterCompletion, dailyReviewStreak } = require('../services/daily-reviews')
const { notificationWindow } = require('../services/notification-retention')
const { longTermContext } = require('../services/long-term-goals')

async function dashboard({ user, localDate }) {
  await ensureReleaseAnnouncement(user).catch(error => console.warn('[release-announcement]', error?.message || error))
  const [weight, plans, nutrition, workout, study, notifications, dailyReviewResult, goalContext] = await Promise.all([
    latestWeight(user._id),
    getTodayPlansService(user._id, localDate),
    nutritionSummary(user._id, localDate),
    workoutSummary(user._id, localDate),
    studySummary(user._id, localDate),
    notificationWindow(user._id),
    db.collection(C.DAILY_REVIEWS).where({ userId: user._id, date: localDate }).limit(1).get(),
    longTermContext(user._id, localDate)
  ])
  let target = await currentNutritionTarget(user._id)
  if (!target && weight) target = await recalcNutritionTarget(user, localDate)
  const base = Number(target?.baseDailyExpenditure || 0)
  const totalExpenditure = round1(base + workout.estimatedCalories)
  const balance = round1(nutrition.calorieIntake - totalExpenditure)
  let dailyReview = dailyReviewResult.data.find(item => item.status !== 'REVOKED') || null
  if (!dailyReview) dailyReview = await ensureDailyReviewAfterCompletion(user._id, localDate, plans).catch(error => {
    console.warn('[auto-daily-review]', error?.message || error)
    return null
  })
  const currentStreak = dailyReview ? await dailyReviewStreak(user._id, localDate).catch(error => {
    console.warn('[daily-review-streak]', error?.message || error)
    return 1
  }) : 0
  return {
    serverTime: now(),
    user: {
      _id:user._id,nickname:user.nickname,avatar:user.avatar,shareCode:user.shareCode,
      reminderRenewedToday:user.lastReminderRenewalDate === localDate,
      checkinReminderEnabled:Boolean(user.checkinReminderEnabled),
      checkinReminderPushEnabled:Boolean(user.checkinReminderPushEnabled),
      countUpReminderPushEnabled:Boolean(user.countUpReminderPushEnabled)
    },
    homePreferences: homePreferencesOf(user),
    nutritionTarget: target,
    plans,
    longTermGoals: goalContext.goals.filter(goal => goal.goalStatus === 'ACTIVE'),
    nutrition,
    workout,
    study,
    unreadNotificationCount: notifications.unreadCount,
    dailyReview,
    currentStreak,
    energy: {
      baseDailyExpenditure: base,
      exerciseExpenditure: workout.estimatedCalories,
      estimatedTotalExpenditure: totalExpenditure,
      calorieIntake: nutrition.calorieIntake,
      estimatedCalorieBalance: balance,
      estimatedDeficit: balance < 0 ? Math.abs(balance) : 0,
      estimatedSurplus: balance > 0 ? balance : 0
    },
    completion: { total: plans.length, completed: plans.filter(plan => plan.completed).length }
  }
}

async function getTodayPlansAction({ user, localDate }) {
  return { plans: await getTodayPlansService(user._id, localDate) }
}

module.exports = { dashboard, getTodayPlans: getTodayPlansAction }
