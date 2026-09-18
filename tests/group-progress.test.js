const test = require('node:test')
const assert = require('node:assert/strict')
const { sortGroupMemberProgress } = require('../cloudfunctions/api/domain/group-progress')

test('群成员按未完成比例升序、无计划、已完成的顺序排列', () => {
  const sorted=sortGroupMemberProgress([
    { _id:'done',nickname:'完成',completed:2,total:2 },
    { _id:'half',nickname:'一半',completed:1,total:2 },
    { _id:'empty',nickname:'无计划',completed:0,total:0 },
    { _id:'low',nickname:'较低',completed:1,total:4 }
  ])
  assert.deepEqual(sorted.map(item => item._id),['low','half','empty','done'])
  assert.equal(sorted[0].progressState,'INCOMPLETE')
  assert.equal(sorted[3].completedAll,true)
})
