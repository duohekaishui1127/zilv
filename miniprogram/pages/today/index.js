const api = require('../../utils/api')
const fmt = require('../../utils/format')
const reminderRenewal = require('../../utils/reminder-renewal')
const { CATEGORY_LABELS, MOODS, MOOD_LABELS, MOOD_ICONS } = require('../../utils/constants')

const COUNT_UP_REST_SECONDS = 2.5 * 60 * 60

function emptyEditor() {
  return {
    visible: false, planId: '', planName: '', note: '', timed: false,
    actualValue: '', unit: '', quantitative: false,
    timerEffectiveDisplay: '', timerTotalDisplay: '', timerPausedDisplay: ''
  }
}

function presentGoal(goal) {
  if (goal.goalType === 'DEADLINE') {
    const daysRemaining=Number(goal.daysRemaining || 0)
    const dueToday=daysRemaining <= 0
    const countdownTone=daysRemaining <= 7 ? 'danger' : (daysRemaining <= 30 ? 'warning' : 'normal')
    return {
      ...goal,typeLabel:'考试计划',isDeadline:true,
      primaryText:`考试日 ${goal.deadlineDate}`,
      countdownLabel:dueToday ? '考试日' : '倒计时',
      countdownValue:dueToday ? '' : Math.abs(daysRemaining),
      countdownUnit:dueToday ? '' : '天',countdownTone,
      showRecentProgress:Number(goal.recentProgress?.total || 0) > 0,
      recentProgressText:`关联任务近7天 ${goal.recentProgress?.completed || 0}/${goal.recentProgress?.total || 0}`
    }
  }
  if (goal.goalType === 'HABIT') return {
    ...goal, typeLabel:'习惯养成', primaryText:`连续 ${goal.currentValue}/${goal.targetValue} 天`, progressText:`${goal.progressPct}%`, showProgress:true
  }
  return {
    ...goal,typeLabel:'数量积累',primaryText:goal.unlimited
      ? `已累计 ${goal.currentValue}${goal.unit}`
      : `${goal.currentValue}/${goal.targetValue}${goal.unit} · 剩余 ${goal.remainingValue}${goal.unit}`,
    progressText:goal.unlimited ? `完成 ${goal.totalCompletedCount} 次` : `${goal.progressPct}%`, showProgress:!goal.unlimited
  }
}

const HOME_CARDS = Object.freeze(['LONG_TERM', 'PLANS', 'ENERGY'])
const CARD_DRAG_DISTANCE = 6
const CARD_DRAG_SETTLE_MS = 180

function cardOrders(preferences) {
  const order = Array.isArray(preferences?.cardOrder) ? preferences.cardOrder : HOME_CARDS
  return Object.fromEntries(HOME_CARDS.map(key => [key, order.indexOf(key) < 0 ? HOME_CARDS.indexOf(key) : order.indexOf(key)]))
}

function emptyCardDrag() {
  return {
    active:false,key:'',settling:false,moved:false,targetIndex:-1,
    offsets:{ LONG_TERM:0,PLANS:0,ENERGY:0 }
  }
}

function reorderedKeys(keys,sourceIndex,targetIndex) {
  const result=[...keys]
  const [active]=result.splice(sourceIndex,1)
  result.splice(targetIndex,0,active)
  return result
}

function mergeVisibleOrder(cardOrder,visibleOrder) {
  let index=0
  const visible=new Set(visibleOrder)
  return cardOrder.map(key => visible.has(key) ? visibleOrder[index++] : key)
}

function dragOffsets(items,sourceIndex,targetIndex,activeOffset) {
  const keys=items.map(item => item.key)
  const nextOrder=reorderedKeys(keys,sourceIndex,targetIndex)
  const gaps=items.slice(0,-1).map((item,index) => Math.max(0,items[index + 1].top - item.bottom))
  const gap=gaps.length ? gaps.reduce((total,value) => total + value,0) / gaps.length : 0
  const topByKey={}
  let top=items[0]?.top || 0
  nextOrder.forEach(key => {
    topByKey[key]=top
    const item=items.find(candidate => candidate.key === key)
    top += item.height + gap
  })
  const offsets={ LONG_TERM:0,PLANS:0,ENERGY:0 }
  items.forEach((item,index) => {
    offsets[item.key]=index === sourceIndex ? activeOffset : Math.round(topByKey[item.key] - item.top)
  })
  return { nextOrder,offsets,settledOffset:Math.round(topByKey[items[sourceIndex].key] - items[sourceIndex].top) }
}

function emptyDailyReviewEditor() { return { visible: false, mood: '', note: '' } }

function timeMs(value) {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

function formatTimer(totalSeconds) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds || 0)))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  const short = `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
  return hours ? `${String(hours).padStart(2, '0')}:${short}` : short
}

function timerView(plan, nowMs) {
  const checkin = plan.checkin || {}
  const status = checkin.timerStatus || ''
  const timerMode = checkin.timerMode || plan.timerMode || 'NONE'
  if (timerMode === 'NONE') return { timerEnabled: false }

  const startedAt = timeMs(checkin.timerStartedAt)
  const resumedAt = timeMs(checkin.timerResumedAt)
  const accumulatedMs = Math.max(0, Number(checkin.timerAccumulatedMs || 0))
  let effectiveMs = accumulatedMs
  if (status === 'RUNNING' && resumedAt != null) effectiveMs += Math.max(0, nowMs - resumedAt)
  if (status === 'FINISHED') effectiveMs = Math.max(0, Number(checkin.timerEffectiveSeconds || 0) * 1000)

  const targetSeconds = Number(checkin.timerTargetSeconds || (timerMode === 'COUNT_DOWN' ? Number(plan.timerDurationMinutes || 0) * 60 : 0))
  const reachedTarget = timerMode === 'COUNT_DOWN' && targetSeconds > 0 && effectiveMs >= targetSeconds * 1000
  if (reachedTarget) effectiveMs = targetSeconds * 1000

  const totalMs = status === 'FINISHED'
    ? Math.max(0, Number(checkin.timerTotalSeconds || 0) * 1000)
    : (startedAt == null ? 0 : Math.max(0, nowMs - startedAt))
  const pausedMs = status === 'FINISHED'
    ? Math.max(0, Number(checkin.timerPausedSeconds || 0) * 1000)
    : Math.max(0, totalMs - effectiveMs)
  const effectiveSeconds = Math.floor(effectiveMs / 1000)
  const displaySeconds = timerMode === 'COUNT_DOWN'
    ? Math.max(0, Math.ceil(targetSeconds - effectiveMs / 1000))
    : effectiveSeconds
  const statusLabels = { RUNNING: '专注中', PAUSED: '已暂停', FINISHED: '计时结束' }

  return {
    timerEnabled: true,
    timerMode,
    timerModeLabel: timerMode === 'COUNT_DOWN' ? '倒计时' : '正计时',
    timerStatus: status,
    timerStatusLabel: statusLabels[status] || '尚未开始',
    timerDisplay: formatTimer(displaySeconds),
    timerEffectiveDisplay: formatTimer(effectiveSeconds),
    timerTotalDisplay: formatTimer(Math.floor(totalMs / 1000)),
    timerPausedDisplay: formatTimer(Math.floor(pausedMs / 1000)),
    timerExpired: status === 'RUNNING' && reachedTarget,
    timerRestDue: timerMode === 'COUNT_UP' && status === 'RUNNING'
      && effectiveSeconds >= COUNT_UP_REST_SECONDS && !checkin.timerRestReminderAt
  }
}

function decoratePlan(plan, nowMs) {
  return {
    ...plan,
    categoryLabel: CATEGORY_LABELS[plan.category] || '计划',
    checkin: plan.checkin ? { ...plan.checkin } : null,
    ...timerView(plan, nowMs)
  }
}

Page({
  data: {
    loading: true,
    error: '',
    dashboard: null,
    plansExpanded: true,
    energyExpanded: false,
    completionPct: 0,
    proteinPct: 0,
    carbPct: 0,
    fatPct: 0,
    energyState: { deficit: 0, surplus: 0, isDeficit: false, isSurplus: false },
    cardOrders: cardOrders(),
    cardDrag: emptyCardDrag(),
    moods: MOODS,
    completionEditor: emptyEditor(),
    dailyReviewEditor: emptyDailyReviewEditor(),
    completionSaving: false,
    manualCheckinSaving: false,
    timerBusyPlanId: '',
    reminderConfig:null,
    reminderRenewalAvailable:false,
    renewingReminder:false
  },
  onShow() { this._visible = true; this.loadReminderConfig(); this.load() },
  onHide() { this._visible = false; this.stopTicker(); this.cancelCardDrag() },
  onUnload() { this._visible = false; this.stopTicker(); this.cancelCardDrag() },
  onPageScroll(e) {
    this._pageScrollTop=Number(e.scrollTop || 0)
    if(this.data.cardDrag.active && !this.data.cardDrag.settling && this._cardDragState?.lastClientY != null) {
      this.updateCardDrag(this._cardDragState.lastClientY)
    }
  },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },
  serverNow() { return Date.now() + Number(this._clockOffset || 0) },
  async loadReminderConfig() {
    if (this.data.reminderConfig) return
    try {
      const reminderConfig = await api.call('getCheckinReminderSettings',{}, { silent:true })
      this.setData({ reminderConfig },() => this.updateReminderRenewalState())
    } catch (error) {
      this.setData({ reminderConfig:{ configured:false,templateId:'',subscriptionType:'ONE_TIME' } })
    }
  },
  updateReminderRenewalState() {
    const dashboard=this.data.dashboard
    const config=this.data.reminderConfig
    this.setData({
      reminderRenewalAvailable:reminderRenewal.shouldOfferManualRenewal({ dashboard,config })
    })
  },
  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const d = await api.call('dashboard', {}, { silent: true })
      const serverMs = timeMs(d.serverTime)
      this._clockOffset = serverMs == null ? 0 : serverMs - Date.now()
      const target = d.nutritionTarget || {}
      d.homePreferences = { showEnergy:true,showLongTermGoals:true,cardOrder:HOME_CARDS, ...(d.homePreferences || {}) }
      d.plans = (d.plans || []).map(plan => decoratePlan(plan, this.serverNow()))
      d.longTermGoals = (d.longTermGoals || []).map(presentGoal).slice(0, 3)
      if (d.dailyReview) d.dailyReview = {
        ...d.dailyReview,
        moodIcon: MOOD_ICONS[d.dailyReview.mood] || '',
        moodLabel: MOOD_LABELS[d.dailyReview.mood] || ''
      }
      this.setData({
        dashboard: d,
        completionPct: fmt.pct(d.completion.completed, d.completion.total),
        proteinPct: fmt.pct(d.nutrition.proteinIntake, target.proteinGram),
        carbPct: fmt.pct(d.nutrition.carbIntake, target.carbGram),
        fatPct: fmt.pct(d.nutrition.fatIntake, target.fatGram),
        energyState: fmt.energyState(d.energy.estimatedCalorieBalance),
        cardOrders:cardOrders(d.homePreferences)
      },() => this.updateReminderRenewalState())
      this.startTicker()
      this.maybePromptDailyReview(d)
      this.finishExpiredCountdown()
      this.notifyCountUpRest()
    } catch (error) {
      this.setData({ error: api.messageOf(error) })
    } finally {
      this.setData({ loading: false })
    }
  },
  startTicker() {
    this.stopTicker()
    if (!this._visible) return
    const plans = this.data.dashboard?.plans || []
    if (!plans.some(plan => ['RUNNING', 'PAUSED'].includes(plan.timerStatus))) return
    this._timerTicker = setInterval(() => this.tickTimers(), 1000)
  },
  stopTicker() {
    if (this._timerTicker) clearInterval(this._timerTicker)
    this._timerTicker = null
  },
  tickTimers() {
    if (!this.data.dashboard) return
    const plans = this.data.dashboard.plans.map(plan => decoratePlan(plan, this.serverNow()))
    this.setData({ 'dashboard.plans': plans })
    this.finishExpiredCountdown()
    this.notifyCountUpRest()
  },
  async finishExpiredCountdown() {
    const plan = this.data.dashboard?.plans?.find(item => item.timerExpired)
    if (!plan || this._autoFinishingTimer) return
    this._autoFinishingTimer = plan._id
    try {
      await api.call('finishPlanTimer', { planId: plan._id }, { silent: true })
      await this.load()
      if (this._visible && typeof wx.vibrateLong === 'function') {
        wx.vibrateLong({ fail: () => {} })
      }
      wx.showToast({ title: '时间到，完成后请打卡', icon: 'none' })
    } catch (error) {
      wx.showToast({ title: api.messageOf(error), icon: 'none' })
    } finally {
      this._autoFinishingTimer = ''
    }
  },
  async notifyCountUpRest() {
    const plan = this.data.dashboard?.plans?.find(item => item.timerRestDue)
    if (!plan || this._restReminderNotifying) return
    this._restReminderNotifying = plan._id
    try {
      await api.call('acknowledgeCountUpRestReminder', { planId: plan._id }, { silent: true })
      await this.load()
      if (this._visible && typeof wx.vibrateLong === 'function') {
        wx.vibrateLong({ fail: () => {} })
      }
      wx.showToast({ title: '专注很久了，休息一下吧', icon: 'none', duration: 2500 })
    } catch (error) {
      wx.showToast({ title: api.messageOf(error), icon: 'none' })
    } finally {
      this._restReminderNotifying = ''
    }
  },
  retry() { this.load() },
  maybePromptDailyReview(dashboard) {
    const review = dashboard?.dailyReview
    if (!review || review.mood || !dashboard.completion?.total || dashboard.completion.completed !== dashboard.completion.total) return
    if (this._promptedDailyReviewDate === review.date || this._dailyPromptScheduledDate === review.date) return
    this._dailyPromptScheduledDate = review.date
    setTimeout(() => {
      if (this._visible && this.data.dashboard?.dailyReview?.date === review.date && !this.data.dashboard.dailyReview.mood) {
        this._promptedDailyReviewDate = review.date
        this.openDailyReview()
      }
      if (this._dailyPromptScheduledDate === review.date) this._dailyPromptScheduledDate = ''
    }, 300)
  },
  togglePlans() { this.setData({ plansExpanded: !this.data.plansExpanded }) },
  toggleEnergy() { this.setData({ energyExpanded: !this.data.energyExpanded }) },
  goFood() { wx.navigateTo({ url: '/pages/record/food' }) },
  goNotifications() { wx.navigateTo({ url: '/pages/notifications/index' }) },
  goTasks() { wx.switchTab({ url: '/pages/plan/index' }) },
  async saveCardPreferences(preferences) {
    await api.call('updateHomePreferences',{ preferences })
    this.setData({ 'dashboard.homePreferences':preferences,cardOrders:cardOrders(preferences) })
  },
  rememberCardTouch(e) {
    const touch=e.touches?.[0]
    const key=e.currentTarget.dataset.card
    if(key && Number.isFinite(Number(touch?.clientY)))this._cardTouchStart={ key,clientY:Number(touch.clientY) }
  },
  startCardDrag(e) {
    if(this.data.cardDrag.active || !this.data.dashboard)return
    const key=e.currentTarget.dataset.card
    const touch=e.touches?.[0] || e.changedTouches?.[0]
    const startClientY=Number(touch?.clientY ?? (this._cardTouchStart?.key === key ? this._cardTouchStart.clientY : NaN))
    if(!key || !Number.isFinite(startClientY))return
    const query=wx.createSelectorQuery().in(this)
    const pending={ ended:false }
    this._cardDragPending=pending
    query.selectAll('.today-card').fields({ id:true,dataset:true,rect:true,size:true })
    query.select('.container').boundingClientRect()
    query.selectViewport().scrollOffset()
    query.exec(result => {
      if(this._cardDragPending !== pending || pending.ended || this.data.cardDrag.active) {
        if(this._cardDragPending === pending)this._cardDragPending=null
        return
      }
      this._cardDragPending=null
      const items=(result[0] || []).map(rect => ({
        key:rect.dataset?.card || String(rect.id || '').replace('today-card-',''),
        top:Number(rect.top),bottom:Number(rect.bottom),height:Number(rect.height)
      })).filter(item => HOME_CARDS.includes(item.key) && Number.isFinite(item.top) && item.height > 0).sort((a,b) => a.top - b.top)
      const sourceIndex=items.findIndex(item => item.key === key)
      if(sourceIndex < 0)return
      const scrollTop=Number(result[2]?.scrollTop || this._pageScrollTop || 0)
      const windowHeight=typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo().windowHeight : wx.getSystemInfoSync().windowHeight
      const maxScrollTop=Math.max(0,scrollTop + Number(result[1]?.bottom || windowHeight) - windowHeight)
      this._pageScrollTop=scrollTop
      this._cardDragState={
        key,items,sourceIndex,targetIndex:sourceIndex,
        startClientY,lastClientY:startClientY,
        startScrollTop:scrollTop,maxScrollTop,lastTravel:0,nextOrder:items.map(item => item.key)
      }
      this.setData({ cardDrag:{ ...emptyCardDrag(),active:true,key,targetIndex:sourceIndex } })
      if(typeof wx.vibrateShort === 'function')wx.vibrateShort({ type:'light',fail:() => {} })
    })
  },
  moveCardDrag(e) {
    if(!this.data.cardDrag.active || this.data.cardDrag.settling)return
    const touch=e.touches?.[0] || e.changedTouches?.[0]
    if(!touch)return
    const clientY=Number(touch.clientY)
    this._cardDragState.lastClientY=clientY
    this.updateCardDrag(clientY)
    this.updateCardAutoScroll(clientY)
  },
  updateCardDrag(clientY) {
    const state=this._cardDragState
    if(!state || !this.data.cardDrag.active)return
    const scrollDelta=Number(this._pageScrollTop || 0) - state.startScrollTop
    const travel=clientY - state.startClientY + scrollDelta
    const pointerY=clientY + scrollDelta
    let targetIndex=state.sourceIndex
    if(travel < 0) {
      for(let index=state.sourceIndex - 1;index >= 0;index--) {
        const item=state.items[index]
        if(pointerY < item.top + item.height / 2)targetIndex=index
      }
    } else if(travel > 0) {
      for(let index=state.sourceIndex + 1;index < state.items.length;index++) {
        const item=state.items[index]
        if(pointerY > item.top + item.height / 2)targetIndex=index
      }
    }
    const targetChanged=targetIndex !== state.targetIndex
    const layout=dragOffsets(state.items,state.sourceIndex,targetIndex,Math.round(travel))
    state.targetIndex=targetIndex
    state.lastTravel=travel
    state.nextOrder=layout.nextOrder
    state.settledOffset=layout.settledOffset
    this.setData({ cardDrag:{
      active:true,key:state.key,settling:false,
      moved:Math.abs(travel) >= CARD_DRAG_DISTANCE,targetIndex,offsets:layout.offsets
    } })
    if(targetChanged && typeof wx.vibrateShort === 'function')wx.vibrateShort({ type:'light',fail:() => {} })
  },
  updateCardAutoScroll(clientY) {
    const windowHeight=typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo().windowHeight : wx.getSystemInfoSync().windowHeight
    const edge=Math.min(90,windowHeight * 0.16)
    const direction=clientY < edge ? -1 : (clientY > windowHeight - edge ? 1 : 0)
    if(direction === this._cardAutoScrollDirection)return
    this.stopCardAutoScroll()
    if(!direction)return
    this._cardAutoScrollDirection=direction
    this._cardAutoScrollTimer=setInterval(() => {
      if(!this.data.cardDrag.active || this.data.cardDrag.settling)return this.stopCardAutoScroll()
      const maxScrollTop=Number(this._cardDragState?.maxScrollTop || 0)
      const next=Math.min(maxScrollTop,Math.max(0,Number(this._pageScrollTop || 0) + direction * 14))
      if(next === this._pageScrollTop)return this.stopCardAutoScroll()
      this._pageScrollTop=next
      wx.pageScrollTo({ scrollTop:next,duration:0 })
      if(this._cardDragState?.lastClientY != null)this.updateCardDrag(this._cardDragState.lastClientY)
    },32)
  },
  stopCardAutoScroll() {
    if(this._cardAutoScrollTimer)clearInterval(this._cardAutoScrollTimer)
    this._cardAutoScrollTimer=null
    this._cardAutoScrollDirection=0
  },
  cancelCardDrag() {
    this.stopCardAutoScroll()
    this._cardDragPending=null
    if(!this.data.cardDrag.active || this.data.cardDrag.settling)return
    this._cardDragState=null
    this.setData({ cardDrag:emptyCardDrag() })
  },
  endCardDrag(e) {
    if(!this.data.cardDrag.active) {
      if(this._cardDragPending)this._cardDragPending.ended=true
      this._cardTouchStart=null
      return
    }
    if(this.data.cardDrag.settling)return
    this.stopCardAutoScroll()
    const touch=e.changedTouches?.[0]
    if(touch && this._cardDragState) {
      this._cardDragState.lastClientY=Number(touch.clientY)
      this.updateCardDrag(Number(touch.clientY))
    }
    const state=this._cardDragState
    this._cardTouchStart=null
    if(!state)return this.setData({ cardDrag:emptyCardDrag() })
    const reordered=state.targetIndex !== state.sourceIndex
    if(!reordered) {
      const shouldManage=Math.abs(state.lastTravel) < CARD_DRAG_DISTANCE
      const key=state.key
      this._cardDragState=null
      return this.setData({ cardDrag:emptyCardDrag() },() => {
        if(shouldManage)this.manageCardVisibility(key)
      })
    }
    const offsets={ ...this.data.cardDrag.offsets,[state.key]:state.settledOffset }
    this.setData({ cardDrag:{ ...this.data.cardDrag,settling:true,moved:true,offsets } })
    setTimeout(() => this.commitCardDrag(state),CARD_DRAG_SETTLE_MS)
  },
  async commitCardDrag(state) {
    if(this._cardDragState !== state)return
    const previous={ ...this.data.dashboard.homePreferences,cardOrder:[...this.data.dashboard.homePreferences.cardOrder] }
    const cardOrder=mergeVisibleOrder(previous.cardOrder,state.nextOrder)
    const preferences={ ...previous,cardOrder }
    this._cardDragState=null
    this.setData({
      'dashboard.homePreferences':preferences,
      cardOrders:cardOrders(preferences),
      cardDrag:emptyCardDrag()
    })
    try {
      await api.call('updateHomePreferences',{ preferences })
      wx.showToast({ title:'卡片位置已保存',icon:'none' })
    } catch (error) {
      this.setData({ 'dashboard.homePreferences':previous,cardOrders:cardOrders(previous) })
      wx.showToast({ title:'保存失败，已恢复原顺序',icon:'none' })
    }
  },
  async manageCardVisibility(key) {
    if(key === 'PLANS')return wx.showToast({ title:'按住并上下拖动可调整位置',icon:'none' })
    try {
      const result=await wx.showActionSheet({ itemList:['暂时隐藏这张卡片'] })
      if(result.tapIndex !== 0)return
      const preferences={ ...this.data.dashboard.homePreferences,cardOrder:[...this.data.dashboard.homePreferences.cardOrder] }
      if(key === 'ENERGY')preferences.showEnergy=false
      if(key === 'LONG_TERM')preferences.showLongTermGoals=false
      await this.saveCardPreferences(preferences)
      wx.showToast({ title:'已暂时隐藏',icon:'none' })
    } catch (error) {}
  },
  async restoreCards() {
    const preferences={ ...this.data.dashboard.homePreferences,cardOrder:[...this.data.dashboard.homePreferences.cardOrder] }
    const hidden=[]
    if(!preferences.showLongTermGoals)hidden.push({ key:'LONG_TERM',label:'恢复长期目标' })
    if(!preferences.showEnergy)hidden.push({ key:'ENERGY',label:'恢复今日能量' })
    if(!hidden.length)return wx.showToast({ title:'没有隐藏的卡片',icon:'none' })
    try {
      const result=await wx.showActionSheet({ itemList:hidden.map(item => item.label) })
      const key=hidden[result.tapIndex].key
      if(key === 'LONG_TERM')preferences.showLongTermGoals=true
      if(key === 'ENERGY')preferences.showEnergy=true
      await this.saveCardPreferences(preferences)
      wx.showToast({ title:'卡片已恢复',icon:'success' })
    } catch (error) {}
  },
  planFromEvent(e) { return this.data.dashboard?.plans?.[Number(e.currentTarget.dataset.index)] },
  completesAllTasks(plan) { return reminderRenewal.completesAllTasks(this.data.dashboard,plan) },
  shouldRenewAfter(plan) {
    return reminderRenewal.shouldRequestReminderRenewal({
      dashboard:this.data.dashboard,plan,config:this.data.reminderConfig,
      promptedToday:this._renewalPromptDate === api.localDate()
    })
  },
  async requestNextReminder(plan, force = false) {
    if (!force && !this.shouldRenewAfter(plan)) return false
    if (this.data.dashboard?.user?.checkinReminderPushEnabled) return false
    const config=this.data.reminderConfig
    if (!config?.configured || !config.templateId || config.subscriptionType !== 'ONE_TIME') return false
    this._renewalPromptDate=api.localDate()
    try {
      const result=await wx.requestSubscribeMessage({ tmplIds:[config.templateId] })
      return ['accept','acceptWithAudio'].includes(result[config.templateId])
    } catch (error) {
      console.warn('[reminder-renew-request]',error?.errMsg || error?.message || error)
      return false
    }
  },
  async saveReminderRenewal(authorized) {
    if (!authorized) return false
    try {
      const result=await api.call('renewCheckinReminderSubscription',{ authorized:true },{ silent:true })
      return Boolean(result.renewed || result.alreadyRenewed || result.alreadyAvailable)
    } catch (error) {
      console.warn('[reminder-renew-save]',api.diagnosticOf(error,'renewCheckinReminderSubscription'))
      return false
    }
  },
  async renewReminderFromButton() {
    if (this.data.renewingReminder) return
    this.setData({ renewingReminder:true })
    try {
      const accepted=await this.requestNextReminder(null,true)
      const renewed=await this.saveReminderRenewal(accepted)
      wx.showToast({ title:renewed ? '已续订下次提醒' : '未续订微信提醒',icon:'none' })
      if (renewed) await this.load()
    } finally { this.setData({ renewingReminder:false }) }
  },
  openCompletion(e) {
    const plan = this.planFromEvent(e)
    if (!plan) return
    if (plan.completed) return this.showCompletion(plan)
    if (plan.timerStatus === 'FINISHED') return wx.showToast({ title: '点击右侧圆圈完成', icon: 'none' })
    wx.showToast({ title: plan.timerEnabled ? '请使用计时按钮完成' : '点击右侧圆圈即可完成', icon: 'none' })
  },
  async revokeCompletion(plan) {
    this._quickCompleting = true
    try {
      await api.call('revokePlanCompletion', { planId: plan._id })
      this._promptedDailyReviewDate = ''
      this._dailyPromptScheduledDate = ''
      wx.showToast({ title: '已撤回', icon: 'success', duration: 1000 })
      await this.load()
    } finally {
      this._quickCompleting = false
    }
  },
  showCompletion(plan) {
    const checkin = plan.checkin || {}
    const timed = !!checkin.timerStatus
    this.setData({
      completionEditor: {
        visible: true,
        planId: plan._id,
        planName: plan.name,
        note: checkin.note || '',
        actualValue: checkin.actualValue == null ? plan.targetValue : checkin.actualValue,
        unit: plan.unit || '', quantitative: plan.targetType !== 'BOOLEAN',
        timed,
        timerEffectiveDisplay: plan.timerEffectiveDisplay,
        timerTotalDisplay: plan.timerTotalDisplay,
        timerPausedDisplay: plan.timerPausedDisplay
      }
    })
  },
  async quickComplete(e) {
    const plan = this.planFromEvent(e)
    if (!plan || this._quickCompleting) return
    if (plan.completed) return this.revokeCompletion(plan)
    if (plan.timerEnabled) {
      if (plan.timerStatus === 'FINISHED') return this.completeFinishedTimer(plan)
      return wx.showToast({ title: plan.timerStatus ? '请先结束计时' : '请使用计时按钮开始', icon: 'none' })
    }
    this._quickCompleting = true
    try {
      const completesToday=this.completesAllTasks(plan)
      const reminderAccepted=await this.requestNextReminder(plan)
      const payload = { planId: plan._id, actualValue: Number(plan.targetValue) }
      const result=await api.call('completePlan', payload)
      await this.saveReminderRenewal(reminderAccepted)
      wx.showToast({ title:result.achievedGoals?.length ? '长期目标已达成' : (completesToday ? '今日打卡完成' : '任务已完成'), icon:'success' })
      await this.load()
    } finally {
      this._quickCompleting = false
    }
  },
  async timerAction(action, e) {
    const plan = this.planFromEvent(e)
    if (!plan || this.data.timerBusyPlanId) return
    this.setData({ timerBusyPlanId: plan._id })
    try {
      await api.call(action, { planId: plan._id })
      await this.load()
    } finally {
      this.setData({ timerBusyPlanId: '' })
    }
  },
  async requestTimerReminder() {
    const config = this.data.reminderConfig
    if (!config?.configured || !config.templateId) return false
    try {
      const result = await wx.requestSubscribeMessage({ tmplIds: [config.templateId] })
      return ['accept', 'acceptWithAudio'].includes(result[config.templateId])
    } catch (error) {
      console.warn('[timer-reminder-request]', error?.errMsg || error?.message || error)
      return false
    }
  },
  shouldRenewCountUpReminder(plan) {
    return plan?.timerMode === 'COUNT_UP'
      && !plan.checkin?.timerReminderPushEnabled
      && !this.data.dashboard?.user?.countUpReminderPushEnabled
  },
  async completionReminderAuthorizations(plan) {
    if (this.shouldRenewCountUpReminder(plan)) {
      return { timerReminderAuthorized: await this.requestTimerReminder(), checkinReminderAuthorized: false }
    }
    return {
      timerReminderAuthorized: false,
      checkinReminderAuthorized: await this.requestNextReminder(plan)
    }
  },
  async startTimer(e) {
    const plan = this.planFromEvent(e)
    if (!plan || this.data.timerBusyPlanId) return
    this.setData({ timerBusyPlanId: plan._id })
    try {
      const needsTimerReminder = plan.timerMode === 'COUNT_DOWN'
        || (plan.timerMode === 'COUNT_UP' && !this.data.dashboard?.user?.countUpReminderPushEnabled)
      const timerReminderAuthorized = needsTimerReminder ? await this.requestTimerReminder() : false
      await api.call('startPlanTimer', { planId: plan._id, timerReminderAuthorized })
      await this.load()
    } finally {
      this.setData({ timerBusyPlanId: '' })
    }
  },
  pauseTimer(e) { return this.timerAction('pausePlanTimer', e) },
  resumeTimer(e) { return this.timerAction('resumePlanTimer', e) },
  async completeFinishedTimer(plan) {
    if (!plan || this.data.timerBusyPlanId) return
    this.setData({ timerBusyPlanId: plan._id })
    try {
      const completesToday=this.completesAllTasks(plan)
      const authorizations=await this.completionReminderAuthorizations(plan)
      const result=await api.call('finishAndCompletePlanTimer', {
        planId: plan._id,
        timerReminderAuthorized: authorizations.timerReminderAuthorized
      })
      await this.saveReminderRenewal(authorizations.checkinReminderAuthorized)
      wx.showToast({ title:result.achievedGoals?.length ? '长期目标已达成' : (completesToday ? '今日打卡完成' : '任务已完成'),icon:'success' })
      await this.load()
    } finally {
      this.setData({ timerBusyPlanId: '' })
    }
  },
  async finishTimer(e) {
    const plan = this.planFromEvent(e)
    if (!plan || this.data.timerBusyPlanId) return
    if (!await api.confirm('结束后将停止计时，并直接完成这项计划。', '结束计时')) return
    this.setData({ timerBusyPlanId: plan._id })
    try {
      const completesToday=this.completesAllTasks(plan)
      const authorizations=await this.completionReminderAuthorizations(plan)
      const result=await api.call('finishAndCompletePlanTimer', {
        planId: plan._id,
        timerReminderAuthorized: authorizations.timerReminderAuthorized
      })
      await this.saveReminderRenewal(authorizations.checkinReminderAuthorized)
      wx.showToast({ title:result.achievedGoals?.length ? '长期目标已达成' : (completesToday ? '今日打卡完成' : '任务已完成'),icon:'success' })
      await this.load()
    } finally {
      this.setData({ timerBusyPlanId: '' })
    }
  },
  closeCompletion() {
    if (!this.data.completionSaving) this.setData({ completionEditor: emptyEditor() })
  },
  noop() {},
  editorInput(e) {
    this.setData({ [`completionEditor.${e.currentTarget.dataset.key}`]: e.detail.value })
  },
  async saveCompletion() {
    if (this.data.completionSaving) return
    const editor = this.data.completionEditor
    const plan = this.data.dashboard.plans.find(item => item._id === editor.planId)
    if (!plan) return

    this.setData({ completionSaving: true })
    try {
      await api.call('completePlan', {
        planId: editor.planId,
        note: editor.note,
        actualValue: editor.quantitative && editor.actualValue !== '' ? Number(editor.actualValue) : undefined
      })
      this.setData({ completionEditor: emptyEditor() })
      wx.showToast({ title: '备注已保存', icon: 'success' })
      await this.load()
    } finally {
      this.setData({ completionSaving: false })
    }
  },
  openDailyReview() {
    const review = this.data.dashboard?.dailyReview
    if (!review) return
    this.setData({ dailyReviewEditor: { visible: true, mood: review?.mood || '', note: review?.note || '' } })
  },
  async manualDailyCheckin() {
    if (this.data.manualCheckinSaving) return
    this.setData({ manualCheckinSaving: true })
    try {
      await api.call('manualDailyCheckin')
      await this.load()
      this.openDailyReview()
    } finally {
      this.setData({ manualCheckinSaving: false })
    }
  },
  closeDailyReview() { if (!this.data.completionSaving) this.setData({ dailyReviewEditor: emptyDailyReviewEditor() }) },
  chooseDailyMood(e) { this.setData({ 'dailyReviewEditor.mood': e.currentTarget.dataset.value }) },
  dailyReviewInput(e) { this.setData({ 'dailyReviewEditor.note': e.detail.value }) },
  async saveDailyReview() {
    const editor = this.data.dailyReviewEditor
    if (!editor.mood) return wx.showToast({ title: '请选择今天的心情', icon: 'none' })
    this.setData({ completionSaving: true })
    try {
      await api.call('saveDailyReview', { mood: editor.mood, note: editor.note })
      this.setData({ dailyReviewEditor: emptyDailyReviewEditor() })
      wx.showToast({ title: '心情与小记已保存', icon: 'success' })
      await this.load()
    } finally { this.setData({ completionSaving: false }) }
  }
})
