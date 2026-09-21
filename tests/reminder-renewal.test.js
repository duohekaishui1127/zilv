const test=require('node:test')
const assert=require('node:assert/strict')
const {
  completesAllTasks,shouldRequestReminderRenewal,shouldOfferManualRenewal
}=require('../miniprogram/utils/reminder-renewal')

function input(overrides={}) {
  return {
    dashboard:{
      completion:{ total:3,completed:2 },
      user:{
        checkinReminderEnabled:true,
        checkinReminderPushEnabled:false,
        reminderRenewedToday:false
      }
    },
    plan:{ completed:false },
    config:{ configured:true,subscriptionType:'ONE_TIME' },
    ...overrides
  }
}

test('完成最后一项且提醒额度已消耗时才申请续订', () => {
  const state=input()
  assert.equal(completesAllTasks(state.dashboard,state.plan),true)
  assert.equal(shouldRequestReminderRenewal(state),true)
})

test('未消耗的提醒额度跨天保留，不重复申请续订', () => {
  const state=input()
  state.dashboard.user.checkinReminderPushEnabled=true
  assert.equal(shouldRequestReminderRenewal(state),false)
})

test('未完成全部任务或当天已申请时不重复续订', () => {
  const notLast=input()
  notLast.dashboard.completion.completed=1
  assert.equal(shouldRequestReminderRenewal(notLast),false)
  assert.equal(shouldRequestReminderRenewal({ ...input(),promptedToday:true }),false)
})

test('自动完成后仅在额度为空时显示手动补充入口', () => {
  const state=input()
  state.dashboard.completion.completed=3
  assert.equal(shouldOfferManualRenewal(state),true)
  state.dashboard.user.checkinReminderPushEnabled=true
  assert.equal(shouldOfferManualRenewal(state),false)
})
