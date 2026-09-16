const api = require('../../utils/api')
Page({
  data: { report:null, error:'' },
  onLoad() { this.load() },
  async load() {
    try {
      const d = await api.call('getWeeklyReport', {}, { silent:true })
      this.setData({ report:d, error:'' })
    } catch (e) { this.setData({ error:api.messageOf(e) }) }
  }
})
