const { getCloudEnv } = require('./config/env')
const { APP_VERSION } = require('./config/version')
const api = require('./utils/api')

App({
  globalData: { appVersion: APP_VERSION, focusTimerPlanId: '', legalGate: null },

  onLaunch() {
    if (!wx.cloud) {
      wx.showModal({ title: '提示', content: '请使用支持云开发的微信基础库', showCancel: false })
      return
    }
    const env = getCloudEnv()
    wx.cloud.init({ ...(env ? { env } : {}), traceUser: true })
  },

  async ensureLegalGate() {
    if (this._legalGatePromise) return this._legalGatePromise
    this._legalGatePromise = (async () => {
      try {
        const gate = await api.call('getLegalGate', {}, { silent: true })
        this.globalData.legalGate = gate
        if (gate.accepted) return true
        const pages = getCurrentPages()
        const route = pages.length ? pages[pages.length - 1].route : ''
        if (!route.startsWith('pages/legal/')) {
          setTimeout(() => wx.reLaunch({ url: '/pages/legal/consent' }), 0)
        }
        return false
      } catch (error) {
        console.warn('[legal-gate]', api.diagnosticOf(error, 'getLegalGate'))
        return false
      } finally {
        this._legalGatePromise = null
      }
    })()
    return this._legalGatePromise
  },

  async onShow() {
    if (!wx.cloud) return
    if (!(await this.ensureLegalGate())) return
    try {
      const result = await api.call('getFriendRequestSummary', {}, { silent: true })
      if (result.pendingCount) wx.showTabBarRedDot({ index: 3 })
      else wx.hideTabBarRedDot({ index: 3 })
    } catch (error) {
      console.warn('[friend-request-summary]', api.diagnosticOf(error, 'getFriendRequestSummary'))
    }
  }
})
