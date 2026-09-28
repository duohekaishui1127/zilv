const { shouldRequestMakeupReminderRenewal, shouldAutomaticallyRenewReminder } = require('./reminder-renewal')

const clients = new WeakMap()

function createClient(platform, api) {
  const preferences = new Map()
  const attempts = new Map()
  const pending = new Map()

  function refresh(templateId) {
    if (!templateId || typeof platform.getSetting !== 'function') return Promise.resolve()
    return new Promise(resolve => {
      try {
        platform.getSetting({
          withSubscriptions: true,
          success(result) {
            const settings = result.subscriptionsSetting || {}
            preferences.set(templateId, {
              mainSwitch: settings.mainSwitch !== false,
              rememberedChoice: settings.itemSettings?.[templateId] || ''
            })
            resolve()
          },
          fail: () => resolve()
        })
      } catch (error) { resolve() }
    })
  }

  function storageKey(templateId) { return `zilv:checkin-reminder-prompt:${templateId}` }

  function promptedToday(templateId) {
    let stored = ''
    try { stored = platform.getStorageSync?.(storageKey(templateId)) || '' } catch (error) {}
    return attempts.get(templateId) === api.localDate() || stored === api.localDate()
  }

  function recordAttempt(templateId) {
    const date = api.localDate()
    attempts.set(templateId, date)
    try { platform.setStorageSync?.(storageKey(templateId), date) } catch (error) {}
  }

  function renew(settings, { force = false } = {}) {
    if (!shouldRequestMakeupReminderRenewal(settings)) return Promise.resolve(false)
    const templateId = settings.templateId
    if (pending.has(templateId)) return pending.get(templateId)
    const preference = preferences.get(templateId) || {}
    if (!force && !shouldAutomaticallyRenewReminder({
      settings, ...preference, promptedToday: promptedToday(templateId)
    })) return Promise.resolve(false)
    if (typeof platform.requestSubscribeMessage !== 'function') return Promise.resolve(false)

    recordAttempt(templateId)
    // This constructor runs immediately in the user's tap/confirm callback.
    // Never await getSetting or a cloud request before invoking the native API.
    const authorization = new Promise(resolve => {
      try {
        platform.requestSubscribeMessage({
          tmplIds: [templateId],
          success(result) {
            const accepted = ['accept', 'acceptWithAudio'].includes(result[templateId])
            if (!accepted) preferences.set(templateId, { ...preference, rememberedChoice: '' })
            refresh(templateId)
            resolve(accepted)
          },
          fail: () => resolve(false)
        })
      } catch (error) { resolve(false) }
    })
    const renewal = authorization.then(async authorized => {
      if (!authorized) return false
      const result = await api.call('renewCheckinReminderSubscription', { authorized: true }, { silent: true })
      return Boolean(result.renewed || result.alreadyAvailable)
    }).catch(error => {
      console.warn('[checkin-reminder-renewal]', error?.message || error?.errMsg || error)
      return false
    }).finally(() => pending.delete(templateId))
    pending.set(templateId, renewal)
    return renewal
  }

  return { refresh, renew }
}

function getCheckinReminderClient(platform, api) {
  if (!clients.has(platform)) clients.set(platform, createClient(platform, api))
  return clients.get(platform)
}

module.exports = { getCheckinReminderClient }
