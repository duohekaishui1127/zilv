const test = require('node:test')
const assert = require('node:assert/strict')
const { pinnedFirst } = require('../cloudfunctions/api/domain/social-list')

test('好友和群聊列表把置顶项提前并保持原有顺序', () => {
  const items = [
    { id:'normal-a',pinned:false },
    { id:'pinned-a',pinned:true },
    { id:'normal-b' },
    { id:'pinned-b',pinned:true }
  ]
  assert.deepEqual(pinnedFirst(items).map(item => item.id),[
    'pinned-a','pinned-b','normal-a','normal-b'
  ])
})
