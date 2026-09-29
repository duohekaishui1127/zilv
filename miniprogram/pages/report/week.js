const api = require('../../utils/api')
const { drawLineChart } = require('../../utils/chart')

const PERIODS = [{ value:'WEEK',label:'周报' },{ value:'MONTH',label:'月报' },{ value:'QUARTER',label:'90天' }]
function hoursText(minutes) {
  const value = Math.max(0,Math.round(Number(minutes || 0)))
  if (value < 60) return `${value}分`
  return `${Math.floor(value/60)}小时${value%60 ? `${value%60}分` : ''}`
}
function deltaText(value,unit) { return value == null ? '暂无对比' : Number(value) === 0 ? '持平' : `${value > 0 ? '+' : ''}${value}${unit}` }
function present(result) {
  if (result.locked) return result
  const s = result.current.summary, c = result.comparison || {}
  const details = result.current.details || {}
  return {
    ...result,
    current:{ ...result.current,summary:{ ...s,focusText:hoursText(s.focusMinutes),studyText:hoursText(s.studyMinutes),workoutText:hoursText(s.workoutMinutes) } },
    details:{ ...details,weeks:(details.weeks || []).map(item => ({ ...item,focusText:hoursText(item.focusMinutes) })),contributions:(details.contributions || []).map(item => ({ ...item,durationText:hoursText(item.durationMinutes) })) },
    comparisonView:[
      { label:'任务完成次数',text:deltaText(c.completedTasks,'次') },
      { label:'完成率',text:deltaText(c.completionRate,'个百分点') },
      { label:'日均专注',text:deltaText(c.averageFocusMinutes,'分') },
      { label:'日均完成',text:deltaText(c.averageCompletedTasks,'次') }
    ],
    tasks:(result.current.tasks || []).slice(0,8),
    tasksMore:(result.current.tasks || []).length > 8
  }
}

Page({
  data:{ periods:PERIODS,selectedPeriod:'WEEK',offset:0,report:null,loading:true,error:'',promptKey:'',posterPath:'',posterRendering:false,chartMode:'FOCUS',hasFocus:false,hasWeight:false,hasActivity:false,hasWellbeing:false,expanded:{ execution:false,goals:false,trends:false,wellbeing:false } },
  onLoad(options) {
    this._alive = true
    const period = PERIODS.some(item => item.value === options.period) ? options.period : 'WEEK'
    this.setData({ selectedPeriod:period,promptKey:decodeURIComponent(options.promptKey || '') })
    this.loadReport()
  },
  onUnload() { this._alive = false; this._reportLoadId = Number(this._reportLoadId || 0) + 1 },
  selectPeriod(e) {
    const period = e.currentTarget.dataset.period
    if (period === this.data.selectedPeriod || this.data.posterRendering) return
    this.setData({ selectedPeriod:period,offset:0,promptKey:'' })
    this.loadReport()
  },
  historyChange(e) {
    const offset = Number(e.detail.value)
    if (offset === this.data.offset || this.data.posterRendering) return
    this.setData({ offset,promptKey:'' })
    this.loadReport()
  },
  async loadReport() {
    const id = Number(this._reportLoadId || 0) + 1
    this._reportLoadId = id
    const period = this.data.selectedPeriod, offset = this.data.offset
    this.setData({ loading:true,error:'',report:null,posterPath:'',expanded:{ execution:false,goals:false,trends:false,wellbeing:false } })
    try {
      const raw = await api.call('getReviewReport',{ period,offset },{ silent:true })
      if (id !== this._reportLoadId || this._alive === false) return
      const report = present(raw), daily = report.current?.daily || []
      this.setData({ report,hasFocus:daily.some(day => day.focusMinutes),chartMode:daily.some(day => day.focusMinutes) ? 'FOCUS' : 'ACTIVITY',hasWeight:daily.some(day => day.weightKg != null),hasActivity:daily.some(day => day.workoutMinutes || day.studyMinutes),hasWellbeing:daily.some(day => day.mood || day.mealTracked) })
      const key = this.data.promptKey || raw.period?.key
      if (!raw.locked && offset === 0 && key) api.call('markReviewSeen',{ period,key },{ silent:true }).catch(() => {})
    } catch (error) {
      if (id === this._reportLoadId && this._alive !== false) this.setData({ error:api.messageOf(error) })
    } finally {
      if (id === this._reportLoadId && this._alive !== false) this.setData({ loading:false })
    }
  },
  retry() { this.loadReport() },
  goProgress() { wx.navigateTo({ url:'/pages/progress/index' }) },
  goPro() { wx.navigateTo({ url:'/pages/pro/index' }) },
  openGoal(e) { wx.navigateTo({ url:`/pages/progress/detail?id=${e.currentTarget.dataset.id}` }) },
  toggleSection(e) {
    const section = e.currentTarget.dataset.section
    if (!Object.prototype.hasOwnProperty.call(this.data.expanded,section)) return
    const expanded = !this.data.expanded[section]
    this.setData({ [`expanded.${section}`]:expanded },() => {
      if (section === 'trends' && expanded) this.drawCharts()
    })
  },
  showAllTasks() { this.setData({ 'report.tasks':this.data.report.current.tasks,'report.tasksMore':false }) },
  selectChart(e) {
    const mode = e.currentTarget.dataset.mode
    if (!['FOCUS','ACTIVITY'].includes(mode)) return
    this.setData({ chartMode:mode },() => this.drawCharts())
  },
  drawCharts() {
    const report = this.data.report?.current
    if (!report?.daily?.length) return
    const labels = { startLabel:report.startDate.slice(5),endLabel:report.endDate.slice(5) }
    if (this.data.hasFocus || this.data.hasActivity) drawLineChart(this,'#activityChart',this.data.chartMode === 'FOCUS' ? [
      { values:report.daily.map(day => day.focusMinutes),color:'#315f4a' }
    ] : [
      { values:report.daily.map(day => day.studyMinutes),color:'#45658a' },
      { values:report.daily.map(day => day.workoutMinutes),color:'#875f43' }
    ],{ ...labels,unit:'分',zeroBaseline:true })
    if (this.data.hasWeight) drawLineChart(this,'#weightChart',[{ values:report.daily.map(day => day.weightKg),color:'#315f4a',connectNulls:true }],{ ...labels,unit:'kg' })
  },
  async ensurePoster() {
    const report = this.data.report
    if (!report || report.locked || report.basic) return ''
    if (this.data.posterPath) return this.data.posterPath
    if (this._posterJob) return this._posterJob
    const key = report.period.key
    this.setData({ posterRendering:true })
    const valid = () => this._alive !== false && this.data.report?.period.key === key
    this._posterJob = new Promise(resolve => {
      wx.createSelectorQuery().in(this).select('#reportPoster').fields({ node:true,size:true }).exec(result => {
        const target = result?.[0]
        if (!valid() || !target?.node || !target.width) return resolve('')
        try {
          const canvas = target.node, ctx = canvas.getContext('2d')
          const ratio = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio
          canvas.width = target.width * ratio; canvas.height = target.height * ratio
          ctx.scale(ratio,ratio)
          this.drawPoster(ctx,target.width,target.height,report)
          wx.canvasToTempFilePath({ canvas,fileType:'png',quality:1,
            success:res => { if (valid()) this.setData({ posterPath:res.tempFilePath }); resolve(valid() ? res.tempFilePath : '') },
            fail:() => resolve('')
          })
        } catch (error) { resolve('') }
      })
    }).catch(() => '').finally(() => {
      this._posterJob = null
      if (this._alive !== false) this.setData({ posterRendering:false })
    })
    return this._posterJob
  },
  drawPoster(ctx,width,height,report) {
    const s = report.current.summary
    ctx.fillStyle = '#f2f4f3'; ctx.fillRect(0,0,width,height)
    ctx.fillStyle = '#fff'; ctx.fillRect(18,18,width-36,height-36)
    ctx.strokeStyle = '#111827'; ctx.lineWidth = 2; ctx.strokeRect(18,18,width-36,height-36)
    ctx.fillStyle = '#315f4a'; ctx.fillRect(18,18,width-36,12)
    ctx.textAlign = 'left'; ctx.fillStyle = '#6b7280'; ctx.font = '700 11px monospace'; ctx.fillText('MY PROGRESS / ZILV',34,57)
    ctx.fillStyle = '#111827'; ctx.font = '800 23px sans-serif'; ctx.fillText(report.period.label,34,95)
    ctx.fillStyle = '#8a8f98'; ctx.font = '12px sans-serif'; ctx.fillText(`${report.period.startDate} — ${report.period.endDate}`,34,121)
    const metrics = [[`${s.reviewDays}`,'天打卡'],[`${s.completedTasks}`,'次任务完成'],[s.focusText,'累计专注'],[`${report.completedGoals.length}`,'个归档目标']]
    metrics.forEach(([value,label],index) => {
      const x = 34 + index % 2 * (width-68) / 2, y = 152 + Math.floor(index/2) * 91
      ctx.fillStyle = '#f6f7f9'; ctx.fillRect(x,y,(width-80)/2,78)
      ctx.fillStyle = '#111827'; ctx.font = '800 20px sans-serif'; ctx.fillText(value,x+12,y+32)
      ctx.fillStyle = '#6b7280'; ctx.font = '12px sans-serif'; ctx.fillText(label,x+12,y+57)
    })
    ctx.fillStyle = '#315f4a'; ctx.font = '700 15px sans-serif'
    this.wrapText(ctx,report.posterQuote,34,366,width-68,24,3)
    ctx.fillStyle = '#8a8f98'; ctx.font = '10px sans-serif'; ctx.fillText('自律 ZILV · 把长期目标，落实到今天',34,height-41)
  },
  wrapText(ctx,text,x,y,maxWidth,lineHeight,maxLines) {
    let line = '', row = 0
    for (const char of String(text || '')) {
      if (ctx.measureText(line+char).width > maxWidth && line) {
        ctx.fillText(line,x,y+row*lineHeight); row++; line = ''
        if (row >= maxLines) return
      }
      line += char
    }
    if (line) ctx.fillText(line,x,y+row*lineHeight)
  },
  async savePoster() {
    const path = await this.ensurePoster()
    if (!path) return wx.showToast({ title:'海报生成失败，请重试',icon:'none' })
    try { await wx.saveImageToPhotosAlbum({ filePath:path }); wx.showToast({ title:'已保存到相册',icon:'success' }) }
    catch (error) {
      if (/auth|authorize|permission|deny/i.test(error?.errMsg || '')) {
        const result = await wx.showModal({ title:'需要相册权限',content:'保存海报需要允许写入相册。',confirmText:'去设置' })
        if (result.confirm) wx.openSetting()
      } else wx.showToast({ title:'保存失败，请稍后重试',icon:'none' })
    }
  },
  async sharePoster() {
    const path = await this.ensurePoster()
    if (!path) return wx.showToast({ title:'海报生成失败，请重试',icon:'none' })
    if (!wx.showShareImageMenu) return this.savePoster()
    try { await wx.showShareImageMenu({ path }) }
    catch (error) { if (!/cancel/i.test(error?.errMsg || '')) wx.showToast({ title:'分享失败，请重试',icon:'none' }) }
  },
  onShareAppMessage() {
    const report = this.data.report
    return { title:!report || report.locked ? '我的自律记录' : `${report.period.label}｜留下 ${report.current.summary.reviewDays} 天打卡记录`,path:'/pages/calendar/index',...(this.data.posterPath ? { imageUrl:this.data.posterPath } : {}) }
  }
})
