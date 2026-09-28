const { C } = require('../lib/db')
const { allMatches, longTermContext } = require('./long-term-goals')
const { buildAchievements } = require('../domain/achievements')

async function loadAchievements(user, localDate) {
  const [checkins, dailyReviews, context] = await Promise.all([
    allMatches(C.CHECKINS, { userId: user._id, completed: true }),
    allMatches(C.DAILY_REVIEWS, { userId: user._id }),
    longTermContext(user._id, localDate)
  ])
  return buildAchievements({ user, checkins, dailyReviews, goals: context.goals, localDate })
}

module.exports = { loadAchievements }
