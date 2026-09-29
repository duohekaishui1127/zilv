const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const { createRequire } = require('node:module')

function page(relative,api,platform = {},chart = {}) {
  const filename = path.join(__dirname,'../miniprogram/pages',relative), realRequire = createRequire(filename)
  let result
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{
    require:name => name === '../../utils/api' ? api : name === '../../utils/chart' ? chart : realRequire(name),
    wx:{ canIUse:() => false,...platform },Page:value => { result = value },console,setTimeout,clearTimeout,setInterval,clearInterval
  },{ filename })
  result.data = JSON.parse(JSON.stringify(result.data))
  result.setData = (values,callback) => {
    for (const [key,value] of Object.entries(values)) {
      const parts = key.split('.'); let target = result.data
      for (const part of parts.slice(0,-1)) target = target[part]
      target[parts.at(-1)] = value
    }
    callback?.()
  }
  return result
}
function report(label = '周报') {
  return {
    locked:false,basic:false,period:{ label,key:label,startDate:'2026-09-21',endDate:'2026-09-27' },
    current:{ startDate:'2026-09-21',endDate:'2026-09-27',summary:{ completedTasks:1,focusMinutes:60 },daily:[{ date:'2026-09-21',focusMinutes:60,studyMinutes:60 }],details:{ weeks:[] } },
    completedGoals:[],highlights:[],comparison:{ completionRate:8 }
  }
}
test('进入报告不生成海报或绘制折叠图表；展开趋势后才绘制', async () => {
  let drawings = 0, canvases = 0
  const instance = page('report/week.js',{
    call:async action => action === 'getReviewReport' ? report() : {},messageOf:error => error.message
  },{ createSelectorQuery() { canvases++; throw new Error('must not render poster') } },{ drawLineChart() { drawings++ } })
  await instance.loadReport()
  assert.equal(drawings,0)
  assert.equal(canvases,0)
  assert.equal(Object.values(instance.data.expanded).some(Boolean),false)
  assert.equal(instance.data.report.comparisonView[1].text,'+8个百分点')
  instance.toggleSection({ currentTarget:{ dataset:{ section:'trends' } } })
  assert.equal(drawings,1)
  instance.toggleSection({ currentTarget:{ dataset:{ section:'trends' } } })
  assert.equal(drawings,1)
})
test('快速切换报告忽略旧请求，旧请求不能提前结束新页面的加载状态', async () => {
  const pending = []
  const instance = page('report/week.js',{
    call:action => action === 'getReviewReport' ? new Promise(resolve => pending.push(resolve)) : Promise.resolve({}),messageOf:error => error.message
  })
  const first = instance.loadReport()
  instance.data.selectedPeriod = 'MONTH'
  const second = instance.loadReport()
  pending[0](report('旧周报')); await first
  assert.equal(instance.data.report,null)
  assert.equal(instance.data.loading,true)
  pending[1](report('新月报')); await second
  assert.equal(instance.data.report.period.label,'新月报')
  assert.equal(instance.data.loading,false)
})
test('Free 周度概览可直接查看，但不会生成 Pro 海报或健康图表', async () => {
  let nativeRequests = 0
  const payload = { ...report(),basic:true,current:{ summary:{ completedTasks:1,focusMinutes:0,reviewDays:1,longestStreak:1 } } }
  const instance = page('report/week.js',{ call:async () => payload },{ createSelectorQuery() { nativeRequests++ } })
  await instance.loadReport()
  assert.equal(instance.data.report.basic,true)
  assert.equal(instance.data.hasWeight,false)
  assert.equal(instance.data.hasFocus,false)
  assert.equal(await instance.ensurePoster(),'')
  assert.equal(nativeRequests,0)
})
test('报告关闭后晚到的请求不更新页面', async () => {
  let finish
  const instance = page('report/week.js',{ call:() => new Promise(resolve => { finish = resolve }) })
  const request = instance.loadReport()
  instance.onUnload(); finish(report()); await request
  assert.equal(instance.data.report,null)
})
test('Free 开启消息中心提醒不申请微信订阅；只有主动点击 Pro 入口才跳转', async () => {
  const calls = [], navigations = []
  const instance = page('profile/index.js',{
    call:async (action,event) => { calls.push(action); return { enabled:event.enabled,time:'10:00',wechatAllowed:false,configured:true,pushEnabled:false } },
    messageOf:error => error.message,localDate:() => '2026-09-29'
  },{ requestSubscribeMessage() { throw new Error('Free must not authorize') },navigateTo:options => navigations.push(options.url) })
  instance.data.profile = { user:{ checkinReminderEnabled:false },membership:{ isPro:false } }
  instance.data.reminderConfig = { configured:true,templateId:'daily',wechatAllowed:false }
  await instance.reminderToggle({ detail:{ value:true } })
  assert.equal(instance.data.profile.user.checkinReminderEnabled,true)
  assert.equal(calls.length,1)
  assert.equal(navigations.length,0)
  await instance.renewReminderFromSettings()
  assert.equal(navigations[0],'/pages/pro/index')
})
test('好友微信提醒先检查权益，Free 不会先弹订阅框再要求升级', async () => {
  let nativeRequests = 0, navigation = ''
  const instance = page('circle/friend-detail.js',{ localDate:() => '2026-09-29' },{
    requestSubscribeMessage() { nativeRequests++ },navigateTo:options => { navigation = options.url }
  })
  instance.data.settings = { specialCare:true,specialCareWechat:false }
  instance.data.notificationConfig = { configured:true,wechatAllowed:false }
  await instance.specialWechatChange({ detail:{ value:true } })
  assert.equal(nativeRequests,0)
  assert.equal(navigation,'/pages/pro/index')
})
test('今日页持有旧 Pro 提醒配置时，新仪表盘的 Free 状态仍阻止手动续订', async () => {
  const instance = page('today/index.js',{ localDate:() => '2026-09-29' })
  instance.data.dashboard = { membership:{ isPro:false } }
  instance.data.reminderConfig = { configured:true,wechatAllowed:true }
  assert.equal(await instance.beginReminderRenewal(null,{ manual:true,force:true }),false)
})
