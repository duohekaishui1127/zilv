const api = require('../../utils/api')
const { drawLineChart } = require('../../utils/chart')

const PERIODS = [
  { value:'WEEK',label:'周报' },
  { value:'MONTH',label:'月报' },
  { value:'QUARTER',label:'90天' }
]

function hoursText(minutes) {
  const value=Math.max(0,Number(minutes || 0))
  if(value < 60)return `${Math.round(value)}分`
  const hours=Math.floor(value / 60)
  const minutesRest=Math.round(value % 60)
  return minutesRest ? `${hours}h ${minutesRest}m` : `${hours}h`
}

function deltaText(value,unit='') {
  const number=Number(value || 0)
  if(!number)return '持平'
  return `${number > 0 ? '+' : ''}${number}${unit}`
}

function deltaTone(value) {
  const number=Number(value || 0)
  return number > 0 ? 'up' : number < 0 ? 'down' : 'same'
}

function present(result) {
  if(result.locked)return result
  const report=result.current
  const comparison=result.comparison || {}
  return {
    ...result,
    current:{
      ...report,
      summary:{
        ...report.summary,
        focusText:hoursText(report.summary.focusMinutes),
        workoutText:hoursText(report.summary.workoutMinutes),
        studyText:hoursText(report.summary.studyMinutes)
      }
    },
    comparisonView:[
      { label:'行动天数',text:deltaText(comparison.activeDays,'天'),tone:deltaTone(comparison.activeDays) },
      { label:'完成计划',text:deltaText(comparison.completedTasks,'项'),tone:deltaTone(comparison.completedTasks) },
      { label:'专注时长',text:deltaText(Math.round(Number(comparison.focusMinutes || 0)),'分'),tone:deltaTone(comparison.focusMinutes) },
      { label:'完成率',text:comparison.completionRate == null ? '暂无对比' : deltaText(comparison.completionRate,'%'),tone:deltaTone(comparison.completionRate) }
    ]
  }
}

Page({
  data:{
    periods:PERIODS,selectedPeriod:'MONTH',report:null,loading:true,error:'',promptKey:'',posterPath:'',posterRendering:false,
    hasWeight:false,hasBodyFat:false,hasActivity:false,hasBalance:false
  },
  onLoad(options){
    const period=PERIODS.some(item => item.value === options.period) ? options.period : 'MONTH'
    this.setData({ selectedPeriod:period,promptKey:decodeURIComponent(options.promptKey || '') })
    this.loadReport()
  },
  selectPeriod(e){
    const period=e.currentTarget.dataset.period
    if(period === this.data.selectedPeriod || this.data.loading)return
    this.setData({ selectedPeriod:period,report:null,error:'',posterPath:'',promptKey:'' },() => this.loadReport())
  },
  async loadReport(){
    this.setData({loading:true,error:''})
    try{
      const raw=await api.call('getReviewReport',{ period:this.data.selectedPeriod },{ silent:true })
      const report=present(raw)
      const daily=report.current?.daily || []
      this.setData({
        report,
        hasWeight:daily.some(day => day.weightKg != null),
        hasBodyFat:daily.some(day => day.bodyFat != null),
        hasActivity:daily.some(day => day.workoutMinutes || day.studyMinutes),
        hasBalance:daily.some(day => day.calorieBalance != null)
      },() => {
        if(!report.locked)setTimeout(() => { this.drawCharts();this.renderPoster() },60)
      })
      const seenKey=this.data.promptKey || raw.period?.key
      if(seenKey)api.call('markReviewSeen',{ period:this.data.selectedPeriod,key:seenKey },{ silent:true }).catch(() => {})
    }catch(error){this.setData({error:api.messageOf(error)})}
    finally{this.setData({loading:false})}
  },
  retry(){this.loadReport()},
  goProgress(){wx.navigateTo({url:'/pages/progress/index'})},
  goPro(){wx.navigateTo({url:'/pages/pro/index'})},
  drawCharts(){
    const report=this.data.report?.current
    if(!report?.daily?.length)return
    const labels={startLabel:report.startDate.slice(5),endLabel:report.endDate.slice(5)}
    if(this.data.hasWeight)drawLineChart(this,'#weightChart',[{values:report.daily.map(day => day.weightKg),color:'#315f4a',connectNulls:true}],{...labels,unit:'kg'})
    if(this.data.hasActivity)drawLineChart(this,'#activityChart',[
      {values:report.daily.map(day => day.workoutMinutes),color:'#875f43'},
      {values:report.daily.map(day => day.studyMinutes),color:'#45658a'}
    ],{...labels,unit:'分',zeroBaseline:true})
  },
  async renderPoster(){
    if(this.data.posterRendering || this.data.report?.locked || !this.data.report)return ''
    this.setData({posterRendering:true})
    try{
      return await new Promise(resolve => {
        wx.createSelectorQuery().in(this).select('#reportPoster').fields({node:true,size:true}).exec(result => {
          const target=result?.[0]
          if(!target?.node || !target.width || !target.height){this.setData({posterRendering:false});return resolve('')}
          const canvas=target.node
          const ctx=canvas.getContext('2d')
          const ratio=wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio
          canvas.width=target.width * ratio
          canvas.height=target.height * ratio
          ctx.scale(ratio,ratio)
          this.drawPoster(ctx,target.width,target.height)
          wx.canvasToTempFilePath({canvas,destWidth:target.width * ratio,destHeight:target.height * ratio,fileType:'png',quality:1,
            success:res => {this.setData({posterPath:res.tempFilePath,posterRendering:false});resolve(res.tempFilePath)},
            fail:() => {this.setData({posterRendering:false});resolve('')}
          })
        })
      })
    }catch(error){this.setData({posterRendering:false});return ''}
  },
  drawPoster(ctx,width,height){
    const report=this.data.report
    const s=report.current.summary
    ctx.fillStyle='#f2f4f3';ctx.fillRect(0,0,width,height)
    ctx.fillStyle='#ffffff';ctx.fillRect(18,18,width-36,height-36)
    ctx.strokeStyle='#111827';ctx.lineWidth=2;ctx.strokeRect(18,18,width-36,height-36)
    ctx.fillStyle='#315f4a';ctx.fillRect(18,18,width-36,14)
    ctx.fillStyle='#6b7280';ctx.font='700 12px monospace';ctx.textAlign='left';ctx.fillText('MY PROGRESS / ZILV',38,62)
    ctx.fillStyle='#111827';ctx.font='800 28px sans-serif';ctx.fillText(report.period.label,38,103)
    ctx.fillStyle='#8a8f98';ctx.font='13px sans-serif';ctx.fillText(`${report.period.startDate}  —  ${report.period.endDate}`,38,130)

    const metrics=[
      [`${s.activeDays}`,'天有行动'],
      [`${s.completedTasks}`,'项计划完成'],
      [s.focusText,'累计专注'],
      [`${report.completedGoals.length}`,'个长期目标']
    ]
    metrics.forEach((item,index) => {
      const col=index % 2,row=Math.floor(index / 2)
      const x=38 + col * ((width - 92) / 2)
      const y=190 + row * 120
      ctx.fillStyle='#f6f7f9';ctx.fillRect(x,y,(width - 110) / 2,94)
      ctx.strokeStyle='#d7dbe0';ctx.lineWidth=1;ctx.strokeRect(x,y,(width - 110) / 2,94)
      ctx.fillStyle='#111827';ctx.font='900 30px monospace';ctx.fillText(String(item[0]),x+14,y+42)
      ctx.fillStyle='#6b7280';ctx.font='12px sans-serif';ctx.fillText(item[1],x+14,y+70)
    })

    ctx.fillStyle='#111827';ctx.font='800 14px sans-serif';ctx.fillText('这段时间，我想记住',38,452)
    ctx.fillStyle='#374151';ctx.font='13px sans-serif'
    let y=482
    ;(report.highlights || []).slice(0,3).forEach((line,index) => {
      ctx.fillStyle='#315f4a';ctx.fillRect(39,y-11,6,6)
      ctx.fillStyle='#374151';this.drawWrappedText(ctx,line,55,y,width-100,20,2);y += 50
    })

    ctx.strokeStyle='#cfd4d8';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(38,height-180);ctx.lineTo(width-38,height-180);ctx.stroke();ctx.setLineDash([])
    ctx.fillStyle='#315f4a';ctx.font='800 16px sans-serif';this.drawWrappedText(ctx,`“${report.posterQuote}”`,38,height-145,width-76,24,2)
    ctx.fillStyle='#8a8f98';ctx.font='11px monospace';ctx.fillText(`${report.identityCode || ''}  ·  自律 ZILV`,38,height-58)
    ctx.textAlign='right';ctx.fillText('把长期目标，落实到今天',width-38,height-58)
    ctx.textAlign='left'
  },
  drawWrappedText(ctx,text,x,y,maxWidth,lineHeight,maxLines){
    const chars=String(text || '').split('')
    let line='',lineIndex=0
    for(const char of chars){
      const next=line + char
      if(ctx.measureText(next).width > maxWidth && line){
        ctx.fillText(line,x,y + lineIndex * lineHeight);line=char;lineIndex++
        if(lineIndex >= maxLines)return
      }else line=next
    }
    if(lineIndex < maxLines && line)ctx.fillText(line,x,y + lineIndex * lineHeight)
  },
  async ensurePoster(){return this.data.posterPath || await this.renderPoster()},
  async savePoster(){
    const path=await this.ensurePoster()
    if(!path)return wx.showToast({title:'海报生成失败，请重试',icon:'none'})
    try{
      await wx.saveImageToPhotosAlbum({filePath:path})
      wx.showToast({title:'已保存到相册',icon:'success'})
    }catch(error){
      if(/auth|authorize|permission|deny/i.test(error?.errMsg || '')){
        const result=await wx.showModal({title:'需要相册权限',content:'保存总结海报需要允许写入相册，你可以在设置中开启。',confirmText:'去设置'})
        if(result.confirm)wx.openSetting()
      }else wx.showToast({title:'保存失败，请稍后重试',icon:'none'})
    }
  },
  async sharePoster(){
    const path=await this.ensurePoster()
    if(!path)return wx.showToast({title:'海报生成失败，请重试',icon:'none'})
    if(wx.showShareImageMenu){
      try{return await wx.showShareImageMenu({path})}catch(error){if(!/cancel/i.test(error?.errMsg || ''))wx.showToast({title:'分享失败，请重试',icon:'none'})}
    }else this.savePoster()
  },
  onShareAppMessage(){
    const report=this.data.report
    return {
      title:report?.locked ? '我的自律记录' : `${report.period.label}｜我有 ${report.current.summary.activeDays} 天留下行动`,
      path:'/pages/calendar/index',
      ...(this.data.posterPath ? {imageUrl:this.data.posterPath} : {})
    }
  }
})
