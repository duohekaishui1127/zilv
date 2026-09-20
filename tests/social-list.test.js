const test = require('node:test')
const assert = require('node:assert/strict')
const { pinnedFirst } = require('../cloudfunctions/api/domain/social-list')
const { pinnedFirst:clientPinnedFirst } = require('../miniprogram/utils/social-list')

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

test('新置顶的好友或群聊排在已有置顶项之前', () => {
  const items = [
    { id:'normal',pinned:false },
    { id:'older',pinned:true,pinnedAt:'2026-09-18T08:00:00.000Z' },
    { id:'newer',pinned:true,pinnedAt:'2026-09-20T08:00:00.000Z' },
    { id:'legacy',pinned:true }
  ]
  assert.deepEqual(pinnedFirst(items).map(item => item.id),[
    'newer','older','legacy','normal'
  ])
  assert.deepEqual(clientPinnedFirst(items).map(item => item.id),[
    'newer','older','legacy','normal'
  ])
})
