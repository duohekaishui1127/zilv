const { db, C } = require('../lib/db')
const { DEFAULT_PRIVACY } = require('../lib/constants')
const { now, fail } = require('../lib/utils')
const { getUserById } = require('../services/users')
const { friendshipBetween } = require('../services/social')
const {
  friendSettingsOf, normalizedOverrides, visibilityFor, canSharePlanWithFriend
} = require('../services/friend-visibility')

async function acceptedFriend(userId, friendUserId) {
  const friendship = await friendshipBetween(userId, friendUserId)
  if (!friendship || friendship.status !== 'ACCEPTED') throw fail('NOT_FOUND', '好友关系不存在')
  return friendship
}

function publicUser(user, settings) {
  return {
    _id: user._id,
    nickname: user.nickname,
    avatar: user.avatar,
    shareCode: user.shareCode,
    remark: settings?.remark || '',
    displayName: settings?.remark || user.nickname
  }
}

function recordView(checkin, plan, privacy) {
  const canShowDuration = plan.category === 'STUDY'
    ? privacy.showStudyDetailsToFriends
    : (plan.category === 'WORKOUT' && privacy.showWorkoutDetailsToFriends)
  return {
    _id: checkin._id,
    date: checkin.date,
    planName: plan.name || '已完成计划',
    category: plan.category || 'CUSTOM',
    completedAt: checkin.completedAt,
    durationMinutes: canShowDuration ? checkin.durationMinutes : null,
    timerEffectiveSeconds: canShowDuration ? Number(checkin.timerEffectiveSeconds || 0) : 0
  }
}

async function getFriendDetail({ user, event }) {
  const friendUserId = String(event.friendUserId || '')
  await acceptedFriend(user._id, friendUserId)
  const [friend, mySettings, inbound, outbound, care, checkins, plans] = await Promise.all([
    getUserById(friendUserId),
    friendSettingsOf(user._id, friendUserId),
    visibilityFor(friendUserId, user._id),
    visibilityFor(user._id, friendUserId),
    db.collection(C.SPECIAL_CARES).where({ userId: user._id, targetUserId: friendUserId }).limit(1).get(),
    db.collection(C.CHECKINS).where({ userId: friendUserId, completed: true }).orderBy('completedAt', 'desc').limit(100).get(),
    db.collection(C.PLANS).where({ userId: friendUserId }).limit(100).get()
  ])
  if (!friend) throw fail('NOT_FOUND', '好友不存在')
  const planMap = new Map(plans.data.map(plan => [plan._id, plan]))
  const records = checkins.data.map(checkin => ({ checkin, plan: planMap.get(checkin.planId) || {} }))
    .filter(item => canSharePlanWithFriend(item.plan, inbound.effective))
    .map(item => recordView(item.checkin, item.plan, inbound.effective))
    .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0))
    .slice(0, 50)
  const specialCare = care.data[0] || null
  return {
    friend: publicUser(friend, mySettings),
    records,
    recordsVisible: Boolean(inbound.effective.showPlanStatusToFriends),
    settings: {
      remark: mySettings?.remark || '',
      privacyMode: outbound.privacyMode,
      privacy: Object.fromEntries(Object.keys(DEFAULT_PRIVACY).map(key => [key, Boolean(outbound.effective[key])])),
      specialCare: Boolean(specialCare?.enabled),
      specialCareWechat: Boolean(specialCare?.enabled && specialCare?.wechatEnabled)
    }
  }
}

async function updateFriendSettings({ user, event }) {
  const friendUserId = String(event.friendUserId || '')
  await acceptedFriend(user._id, friendUserId)
  const existing = await friendSettingsOf(user._id, friendUserId)
  const privacyMode = event.privacyMode === 'CUSTOM' ? 'CUSTOM' : 'DEFAULT'
  const data = {
    remark: String(event.remark || '').trim().slice(0, 30),
    privacyMode,
    privacyOverrides: privacyMode === 'CUSTOM' ? normalizedOverrides(event.privacy) : {},
    updatedAt: now()
  }
  if (existing) await db.collection(C.FRIEND_SETTINGS).doc(existing._id).update({ data })
  else await db.collection(C.FRIEND_SETTINGS).add({ data: {
    userId: user._id, friendUserId, ...data, createdAt: now()
  } })
  return { settings: data }
}

module.exports = { getFriendDetail, updateFriendSettings }
