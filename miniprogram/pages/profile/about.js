const api = require('../../utils/api')
const { APP_VERSION, SCHEMA_VERSION } = require('../../config/version')
const { getEnvVersion, getCloudEnv } = require('../../config/env')

Page({
  data: { info: null, loading: true, local: { appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION, envVersion: '', cloudEnv: '' } },
  onLoad() { this.load() },
  async load() {
    const local = { appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION, envVersion: getEnvVersion(), cloudEnv: getCloudEnv() || '当前开发者工具环境' }
    this.setData({ local, loading: true })
    try {
      this.setData({ info: await api.call('getSystemInfo', {}, { silent: true }) })
    } catch (error) {
      this.setData({ info: null })
    } finally { this.setData({ loading: false }) }
  },
  copy() {
    const info = this.data.info || {}
    const text = [
      `自律 ${this.data.local.appVersion}`,
      `客户端 schema: ${this.data.local.schemaVersion}`,
      `服务端版本: ${info.appVersion || '未知'}`,
      `服务端 schema: ${info.schemaVersion || '未知'}`,
      `环境: ${this.data.local.envVersion}`,
      `云环境: ${this.data.local.cloudEnv}`,
      `营养算法: ${info.nutritionAlgorithmVersion || '未知'}`
    ].join('\n')
    wx.setClipboardData({ data: text })
  }
})
