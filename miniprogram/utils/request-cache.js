const TTL = Object.freeze({ dashboard:15000,getPlans:15000,getActivityCalendar:30000,getDayReview:30000,getReviewReport:60000,getProgressGoals:30000,getProgressGoal:30000,getAchievements:30000,getMembershipOverview:30000,getFriendRequestSummary:10000,getActiveTimer:2000 })
const READ_ONLY = /^(get|list|search|dashboard$)/
const copy = value => value == null ? value : JSON.parse(JSON.stringify(value))

function createRequestCache(clock = () => Date.now()) {
  let generation = 0
  const entries = new Map(), jobs = new Map()
  function clear() { generation++; entries.clear(); jobs.clear() }
  async function run(action, payload, fetch, options = {}) {
    const ttl = TTL[action]
    const mutation = !READ_ONLY.test(action)
    if (mutation) clear()
    if (!ttl || options.noCache) {
      try { return await fetch() } finally { if (mutation) clear() }
    }
    const key = JSON.stringify([action,payload])
    const hit = entries.get(key)
    if (!options.fresh && hit && hit.expires > clock()) return copy(hit.value)
    const pending = jobs.get(key)
    if (!options.fresh && pending) return copy(await pending.promise)
    const epoch = generation, token = {}
    const promise = Promise.resolve().then(fetch).then(value => {
      if (epoch === generation && jobs.get(key)?.token === token) {
        if (entries.size >= 32) entries.delete(entries.keys().next().value)
        entries.set(key,{ value:copy(value),expires:clock() + ttl })
      }
      return value
    }).finally(() => { if (jobs.get(key)?.token === token) jobs.delete(key) })
    jobs.set(key,{ token,promise })
    return copy(await promise)
  }
  return { run,clear }
}

module.exports = { createRequestCache }
