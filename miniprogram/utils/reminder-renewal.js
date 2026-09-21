function completesAllTasks(dashboard, plan) {
  const completion=dashboard?.completion
  return Boolean(plan && !plan.completed && completion?.total > 0 &&
    completion.completed === completion.total - 1)
}

function shouldRequestReminderRenewal({ dashboard,plan,config,promptedToday=false }) {
  return Boolean(
    config?.configured && config.subscriptionType === 'ONE_TIME' &&
    dashboard?.user?.checkinReminderEnabled && !dashboard.user.checkinReminderPushEnabled &&
    !dashboard.user.reminderRenewedToday && !promptedToday && completesAllTasks(dashboard,plan)
  )
}

function shouldOfferManualRenewal({ dashboard,config }) {
  const completion=dashboard?.completion
  const allComplete=Boolean(completion?.total) && completion.completed === completion.total
  return Boolean(
    config?.configured && config.subscriptionType === 'ONE_TIME' && allComplete &&
    dashboard?.user?.checkinReminderEnabled && !dashboard.user.checkinReminderPushEnabled &&
    !dashboard.user.reminderRenewedToday
  )
}

module.exports={ completesAllTasks,shouldRequestReminderRenewal,shouldOfferManualRenewal }
