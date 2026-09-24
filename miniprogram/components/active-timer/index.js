const api = require('../../utils/api')

function formatSeconds(value) {
  const seconds = Math.max(0, Math.floor(Number(value || 0)))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  const pair = number => String(number).padStart(2, '0')
  return hours ? `${pair(hours)}:${pair(minutes)}:${pair(rest)}` : `${pair(minutes)}:${pair(rest)}`
}

Component({
  data: { timer:null,display:'',todayDate:api.localDate() },
  lifetimes: {
    attached() { this._attached=true; this._visible=true; this.refresh() },
    detached() { this._attached=false; this._visible=false; this.stopTicker() }
  },
  pageLifetimes: {
    show() { this._visible=true; this.refresh() },
    hide() { this._visible=false; this.stopTicker() }
  },
  methods: {
    async refresh() {
      const requestId=Number(this._requestId || 0) + 1
      this._requestId=requestId
      try {
        const result=await api.call('getActiveTimer',{}, { silent:true })
        if (!this._attached || requestId !== this._requestId) return
        this._clockOffset=new Date(result.serverTime).getTime() - Date.now()
        this.setData({ timer:result.timer || null,todayDate:api.localDate() },() => {
          this.tick()
          this.startTicker()
          this.triggerEvent('timerchange',{ timer:result.timer || null })
        })
      } catch (error) {
        console.warn('[active-timer]',api.diagnosticOf(error,'getActiveTimer'))
      }
    },
    startTicker() {
      this.stopTicker()
      if (this._visible && this.data.timer?.status === 'RUNNING') this._ticker=setInterval(() => this.tick(),1000)
    },
    stopTicker() {
      if (this._ticker) clearInterval(this._ticker)
      this._ticker=null
    },
    tick() {
      const timer=this.data.timer
      if (!timer) return
      const checkin=timer.checkin || {}
      const resumedAt=new Date(checkin.timerResumedAt || 0).getTime()
      const runningMs=timer.status === 'RUNNING' && Number.isFinite(resumedAt)
        ? Math.max(0,Date.now() + Number(this._clockOffset || 0) - resumedAt) : 0
      const effectiveMs=Math.max(0,Number(checkin.timerAccumulatedMs || 0) + runningMs)
      const targetSeconds=Number(checkin.timerTargetSeconds || 0)
      const seconds=timer.mode === 'COUNT_DOWN'
        ? Math.ceil(Math.max(0,targetSeconds - effectiveMs / 1000))
        : Math.floor(effectiveMs / 1000)
      const display=formatSeconds(seconds)
      if (display !== this.data.display) this.setData({ display })
      if (timer.mode === 'COUNT_DOWN' && timer.status === 'RUNNING' && seconds === 0 && !this._finishing) {
        this._finishing=true
        api.call('finishPlanTimer',{ planId:timer.planId,checkinId:timer.checkinId },{ silent:true })
          .then(() => this.refresh())
          .catch(error => console.warn('[active-timer-finish]',api.diagnosticOf(error,'finishPlanTimer')))
          .finally(() => { this._finishing=false })
      }
      if (timer.mode === 'COUNT_UP' && timer.status === 'RUNNING' && this._visible
        && effectiveMs >= 2.5 * 60 * 60 * 1000 && !checkin.timerRestReminderAt
        && !this._restNotifying && Date.now() >= Number(this._restReminderRetryAt || 0)) {
        this._restNotifying=true
        api.call('acknowledgeCountUpRestReminder',{ planId:timer.planId,checkinId:timer.checkinId },{ silent:true })
          .then(async result => {
            await this.refresh()
            if (!result.newlyReminded || !this._visible) return
            if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ fail: () => {} })
            wx.showToast({ title:'专注很久了，休息一下吧',icon:'none',duration:2500 })
            this.triggerEvent('restreminder')
          })
          .catch(error => {
            this._restReminderRetryAt=Date.now() + 60000
            console.warn('[active-timer-rest]',api.diagnosticOf(error,'acknowledgeCountUpRestReminder'))
          })
          .finally(() => { this._restNotifying=false })
      }
    },
    openTimer() {
      const timer=this.data.timer
      if (!timer) return
      getApp().globalData.focusTimerPlanId=timer.planId
      const page=getCurrentPages().slice(-1)[0]
      if (page?.route === 'pages/today/index') this.triggerEvent('focus',{ planId:timer.planId })
      else wx.switchTab({ url:'/pages/today/index' })
    }
  }
})
