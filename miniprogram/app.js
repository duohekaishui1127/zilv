const { getCloudEnv } = require('./config/env')
const { APP_VERSION } = require('./config/version')
const api = require('./utils/api')

App({
  globalData: { appVersion: APP_VERSION, focusTimerPlanId: '' },

  onLaunch() {
    if (!wx.cloud) {
      wx.showModal({ title: '提示', content: '请使用支持云开发的微信基础库', showCancel: false })
      return
    }
    const env = getCloudEnv()
    wx.cloud.init({ ...(env ? { env } : {}), traceUser: true })
  },

  async onShow() {
    if (!wx.cloud) return
    try {
      const result = await api.call('getFriendRequestSummary', {}, { silent: true })
      if (result.pendingCount) wx.showTabBarRedDot({ index: 3 })
      else wx.hideTabBarRedDot({ index: 3 })
    } catch (error) {
      console.warn('[friend-request-summary]', api.diagnosticOf(error, 'getFriendRequestSummary'))
    }
  }
})
