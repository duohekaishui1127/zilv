const { loadAchievements } = require('../services/achievements')
const { membershipOf } = require('../domain/membership')

async function getAchievements({ user, localDate }) {
  const membership = membershipOf(user)
  const achievements = await loadAchievements(user,localDate)
  const badges = achievements.badges.map(item => {
    if (!item.pro || membership.isPro) return { ...item,detailLocked:false }
    const { id,title,symbol,earnedAt,unlocked,pro } = item
    return { id,title,symbol,earnedAt,unlocked,pro,detailLocked:true,subtitle:'长期里程碑 · Pro 详情' }
  })
  return { ...achievements,badges,membership,identityCode:user.identityCode }
}

module.exports = { getAchievements }
