const api = require('../../utils/api')

const CARD_META = Object.freeze({
  LONG_TERM: { label:'长期目标',description:'倒计时、习惯和累计进度' },
  PLANS: { label:'今日任务',description:'当天需要完成的执行任务' },
  ENERGY: { label:'今日能量',description:'摄入、消耗和营养目标' }
})

function cardViews(preferences) {
  return preferences.cardOrder.map(key => ({
    key, ...CARD_META[key], locked:key === 'PLANS',
    visible:key === 'PLANS' || (key === 'ENERGY' ? preferences.showEnergy : preferences.showLongTermGoals)
  }))
}

Page({
  data: {
    preferences: { showEnergy:true,showLongTermGoals:true,cardOrder:['LONG_TERM','PLANS','ENERGY'] },
    cards: [], saving: false
  },
  async onLoad() {
    const profile = await api.call('getProfile')
    const preferences = { ...this.data.preferences, ...(profile.user.homePreferences || {}) }
    this.setData({ preferences, cards:cardViews(preferences) })
  },
  toggle(e) {
    const key=e.currentTarget.dataset.key
    const field=key === 'ENERGY' ? 'showEnergy' : 'showLongTermGoals'
    const preferences={ ...this.data.preferences,[field]:Boolean(e.detail.value) }
    this.setData({ preferences,cards:cardViews(preferences) })
  },
  move(e) {
    const index=Number(e.currentTarget.dataset.index)
    const offset=Number(e.currentTarget.dataset.offset)
    const target=index + offset
    if(target < 0 || target >= this.data.preferences.cardOrder.length)return
    const cardOrder=[...this.data.preferences.cardOrder]
    ;[cardOrder[index],cardOrder[target]]=[cardOrder[target],cardOrder[index]]
    const preferences={ ...this.data.preferences,cardOrder }
    this.setData({ preferences,cards:cardViews(preferences) })
  },
  async save() {
    if (this.data.saving) return
    this.setData({ saving:true })
    try {
      await api.call('updateHomePreferences',{ preferences:this.data.preferences })
      wx.showToast({ title:'已保存',icon:'success' })
      setTimeout(() => wx.navigateBack(),350)
    } finally { this.setData({ saving:false }) }
  }
})
