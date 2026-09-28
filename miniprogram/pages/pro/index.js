const api=require('../../utils/api')
const FREE=[
  ['任务与长期目标','创建、执行、完成与基础归档'],
  ['今日与计时','基础正计时 / 倒计时与完成记录'],
  ['日历与打卡','基础打卡、连续记录和补签'],
  ['基础成长纪念','查看普通纪念章与获得日期'],
  ['好友与群组','自愿加入的监督和计划共享'],
  ['数据控制','隐私设置、数据清理与账号注销']
]
const PRO_BASE=[
  ['深度复盘','周报、月报、90 天总结与周期对比'],
  ['总结海报','大数字成长海报、保存与分享'],
  ['高级趋势','更长周期的完成、专注和成长趋势'],
  ['完整成长档案','稀有纪念章、完整背面故事与长期里程碑'],
  ['Recovery+',''],
  ['未来 Pro 增强','后续高级主题和复盘能力优先进入 Pro']
]

function proFeatures(rules={}){
  const recovery=rules.recovery || {}
  const free=recovery.free || {cap:3,monthlyGrant:1}
  const pro=recovery.pro || {cap:6,monthlyGrant:2}
  return PRO_BASE.map(([title,copy]) => [
    title,
    title === 'Recovery+'
      ? `补签卡最多 ${pro.cap} 张、每月恢复 ${pro.monthlyGrant} 张；Free 为最多 ${free.cap} 张、每月恢复 ${free.monthlyGrant} 张`
      : copy
  ])
}

Page({
  data:{loading:true,membership:null,offer:null,rules:null,experienceDays:90,freeFeatures:FREE,proFeatures:proFeatures()},
  onShow(){this.load()},
  async load(){
    try{
      const d=await api.call('getMembershipOverview',{}, {silent:true})
      this.setData({...d,experienceDays:d.membership?.betaGrantedDays || d.membership?.configuredTrialDays || d.rules?.beta?.trialDays || 90,proFeatures:proFeatures(d.rules),loading:false})
    }catch(error){this.setData({loading:false});wx.showToast({title:api.messageOf(error),icon:'none'})}
  },
  purchase(){
    const offer=this.data.offer||{}
    const membership=this.data.membership||{}
    const trialDays=membership.configuredTrialDays || this.data.rules?.beta?.trialDays || 90
    if(!offer.purchaseEnabled)return wx.showModal({title:'公测期间无需购买',content:`永久 Pro 支付入口暂未开放。新用户当前默认获得 ${trialDays} 天 Beta Pro；到期后会平滑回到 Free，历史数据不会删除；正式支付接入后可直接永久解锁。`,showCancel:false})
    wx.showModal({title:'支付接口已预留',content:'当前代码只启用了 Pro 商品配置开关，正式收款前还需要接入微信小程序虚拟支付并完成真实订单验收。',showCancel:false})
  }
})
