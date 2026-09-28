function completesAllTasks(dashboard, plan) {
  const completion=dashboard?.completion
  return Boolean(plan && !plan.completed && completion?.total > 0 &&
    completion.completed === completion.total - 1)
}

function shouldRequestReminderRenewal({ dashboard,plan,config,promptedToday=false }) {
  return Boolean(
    config?.configured && config.subscriptionType === 'ONE_TIME' &&
    dashboard?.user?.checkinReminderEnabled && !dashboard.user.checkinReminderPushEnabled &&
    !promptedToday && completesAllTasks(dashboard,plan)
  )
}

function shouldOfferManualRenewal({ dashboard,config }) {
  const completion=dashboard?.completion
  const allComplete=Boolean(completion?.total) && completion.completed === completion.total
  return Boolean(
    config?.configured && config.subscriptionType === 'ONE_TIME' && allComplete &&
    dashboard?.user?.checkinReminderEnabled && !dashboard.user.checkinReminderPushEnabled
  )
}

function shouldRequestMakeupReminderRenewal(settings) {
  return Boolean(settings?.configured && settings.templateId &&
    settings.subscriptionType === 'ONE_TIME' && settings.enabled && !settings.pushEnabled)
}

function shouldAutomaticallyRenewReminder({ settings,rememberedChoice='',mainSwitch=true,promptedToday=false }) {
  if (!shouldRequestMakeupReminderRenewal(settings) || !mainSwitch) return false
  if (['reject','ban','filter'].includes(rememberedChoice)) return false
  const rememberedAccepted = ['accept','acceptWithAudio'].includes(rememberedChoice)
  return rememberedAccepted || !promptedToday
}

module.exports={ completesAllTasks,shouldRequestReminderRenewal,shouldOfferManualRenewal,shouldRequestMakeupReminderRenewal,shouldAutomaticallyRenewReminder }
