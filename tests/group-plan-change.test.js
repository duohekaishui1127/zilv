const test = require('node:test')
const assert = require('node:assert/strict')
const { approvalGroups, planChangeAnnouncement } = require('../cloudfunctions/api/domain/group-plan-change')

test('计划发布者担任群主的群自动批准', () => {
  assert.deepEqual(approvalGroups(['owned-a','owned-b'],['owned-a','owned-b']),{
    groupIds:['owned-a','owned-b'],approvedGroupIds:['owned-a','owned-b'],requiredGroupIds:[],approvalRequired:false
  })
})

test('计划同时绑定他人群组时只等待其他群主审批', () => {
  assert.deepEqual(approvalGroups(['owned','other'],['owned']),{
    groupIds:['owned','other'],approvedGroupIds:['owned'],requiredGroupIds:['other'],approvalRequired:true
  })
})

test('计划修改广播只包含公开监督字段', () => {
  const message=planChangeAnnouncement({
    type:'UPDATE',currentPlan:{ name:'晨跑' },proposedPlan:{ name:'晨跑进阶',targetValue:5,unit:'公里',description:'私密内容' }
  },'小林')
  assert.equal(message.title,'群监督计划已修改')
  assert.equal(message.content,'小林将「晨跑」更新为「晨跑进阶」，目标 5公里')
  assert.equal(message.content.includes('私密内容'),false)
})
