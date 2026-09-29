const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

function setup({ broken = false } = {}) {
  const callbacks = [], texts = []
  let page, exports = 0
  const ctx = { scale() {},fillRect() {},strokeRect() {},fillText(value) { texts.push(String(value)) },measureText:value => ({ width:String(value).length * 7 }) }
  const platform = {
    getWindowInfo:() => ({ pixelRatio:1 }),
    createSelectorQuery() { return { in() { return this },select() { return this },fields() { return this },exec(callback) { callbacks.push(callback) } } },
    canvasToTempFilePath(request) { exports++; request.success({ tempFilePath:'/tmp/test-poster.png' }) }
  }
  vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/pages/report/week.js'),'utf8'),{
    require:() => ({}),wx:platform,Page:definition => { page = definition },console
  })
  page.data = JSON.parse(JSON.stringify(page.data))
  page.setData = values => Object.assign(page.data,values)
  page.data.report = {
    period:{ key:'WEEK:2026-09-21',label:'周报',startDate:'2026-09-21',endDate:'2026-09-27' },
    current:{ summary:{ completedTasks:1,reviewDays:1,focusText:'1小时',weightKg:70,mood:'PRIVATE_MOOD' } },
    completedGoals:[{ name:'PRIVATE_GOAL' }],posterQuote:'把远方拆成今天',note:'PRIVATE_NOTE',tasks:[{ name:'PRIVATE_TASK' }]
  }
  const finish = () => callbacks.shift()([{ node:{ getContext() { if (broken) throw new Error('canvas failure'); return ctx } },width:325,height:490 }])
  return { page,callbacks,texts,finish,exports:() => exports }
}
test('海报按需生成、重复点击合并同一次工作，成功后复用缓存', async () => {
  const state = setup()
  const first = state.page.ensurePoster(), second = state.page.ensurePoster()
  assert.equal(state.callbacks.length,1)
  state.finish()
  assert.equal(await first,'/tmp/test-poster.png')
  assert.equal(await second,'/tmp/test-poster.png')
  assert.equal(await state.page.ensurePoster(),'/tmp/test-poster.png')
  assert.equal(state.exports(),1)
  assert.equal(state.page.data.posterRendering,false)
  assert.equal(state.texts.some(text => /PRIVATE_/.test(text)),false)
})
test('海报生成途中周期发生变化时，不把旧海报写入新报告', async () => {
  const state = setup()
  const rendering = state.page.ensurePoster()
  state.page.data.report.period = { ...state.page.data.report.period,key:'MONTH:2026-09' }
  state.finish()
  assert.equal(await rendering,'')
  assert.equal(state.page.data.posterPath,'')
  assert.equal(state.exports(),0)
})
test('Canvas 异常时结束加载状态，允许用户再次尝试而不会一直卡住', async () => {
  const state = setup({ broken:true })
  const rendering = state.page.ensurePoster()
  state.finish()
  assert.equal(await rendering,'')
  assert.equal(state.page.data.posterRendering,false)
  assert.equal(state.page._posterJob,null)
})
