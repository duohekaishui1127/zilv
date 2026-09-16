const { getCloudEnv } = require('./config/env')
const { APP_VERSION } = require('./config/version')

App({
  globalData: { appVersion: APP_VERSION },

  onLaunch() {
    if (!wx.cloud) {
      wx.showModal({ title: '提示', content: '请使用支持云开发的微信基础库', showCancel: false })
      return
    }
    const env = getCloudEnv()
    wx.cloud.init({ ...(env ? { env } : {}), traceUser: true })
  }
})
