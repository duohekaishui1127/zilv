const { db, _, C } = require('../lib/db')
const { DEFAULT_PRIVACY } = require('../lib/constants')
const { now, fail } = require('../lib/utils')
const { normalizedMonth, monthDates, buildCheckinCalendar } = require('../domain/checkin-calendar')
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

async function getFriendDetail({ user, event, localDate }) {
  const friendUserId = String(event.friendUserId || '')
  await acceptedFriend(user._id, friendUserId)
  const month = normalizedMonth(event.month)
  const dates = monthDates(month)
  const [friend, mySettings, inbound, outbound, care] = await Promise.all([
    getUserById(friendUserId),
    friendSettingsOf(user._id, friendUserId),
    visibilityFor(friendUserId, user._id),
    visibilityFor(user._id, friendUserId),
    db.collection(C.SPECIAL_CARES).where({ userId: user._id, targetUserId: friendUserId }).limit(1).get()
  ])
  if (!friend) throw fail('NOT_FOUND', '好友不存在')
  const calendarVisible = Boolean(inbound.effective.showPlanStatusToFriends)
  const queryEnd = localDate < dates[dates.length - 1] ? localDate : dates[dates.length - 1]
  const [monthCheckins, plans] = calendarVisible ? await Promise.all([
    dates[0] <= queryEnd
      ? db.collection(C.CHECKINS).where({ userId: friendUserId, date: _.gte(dates[0]).and(_.lte(queryEnd)) }).get()
      : Promise.resolve({ data: [] }),
    db.collection(C.PLANS).where({ userId: friendUserId }).limit(100).get()
  ]) : [{ data: [] }, { data: [] }]
  const visiblePlans = plans.data.filter(plan => !plan.deletedAt && canSharePlanWithFriend(plan, inbound.effective))
  const calendar = buildCheckinCalendar(month, visiblePlans, monthCheckins.data, { endDate: localDate })
  const specialCare = care.data[0] || null
  return {
    friend: publicUser(friend, mySettings),
    calendarVisible,
    calendar,
    settings: {
      remark: mySettings?.remark || '',
      pinned: Boolean(mySettings?.pinned),
      pinnedAt: mySettings?.pinnedAt || null,
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
  const pinned = event.pinned === undefined ? Boolean(existing?.pinned) : Boolean(event.pinned)
  const timestamp = now()
  const data = {
    remark: String(event.remark || '').trim().slice(0, 30),
    pinned,
    pinnedAt: pinned ? (existing?.pinned && existing?.pinnedAt ? existing.pinnedAt : timestamp) : null,
    privacyMode,
    privacyOverrides: privacyMode === 'CUSTOM' ? normalizedOverrides(event.privacy) : {},
    updatedAt: timestamp
  }
  if (existing) await db.collection(C.FRIEND_SETTINGS).doc(existing._id).update({ data })
  else await db.collection(C.FRIEND_SETTINGS).add({ data: {
    userId: user._id, friendUserId, ...data, createdAt: now()
  } })
  return { settings: data }
}

module.exports = { getFriendDetail, updateFriendSettings }
