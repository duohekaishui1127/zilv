const api = require('../../utils/api')
const { LONG_TERM_GOAL_TYPES,PLAN_CATEGORIES,REPEAT_TYPES } = require('../../utils/constants')

function futureDate(days = 90) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return api.localDate(date)
}

const ACCUMULATION_REPEATS=REPEAT_TYPES.filter(item => item.value !== 'ONE_TIME')
function indexOfValue(list,value,fallback=0) { const index=list.findIndex(item => item.value === value);return index >= 0 ? index : fallback }

Page({
  data: {
    id: '', editMode: false, loading: false, saving: false,
    name: '', description: '', goalTypes: LONG_TERM_GOAL_TYPES,
    goalType: 'DEADLINE', deadlineDate: futureDate(), habitDays: 21,
    targetValue:5000,unit:'词',unlimited:false,accumulationDeadlineDate:futureDate(99),
    categories:PLAN_CATEGORIES.map(item => item.label),categoryValues:PLAN_CATEGORIES.map(item => item.value),categoryIndex:0,
    repeatTypes:ACCUMULATION_REPEATS.map(item => item.label),repeatValues:ACCUMULATION_REPEATS.map(item => item.value),repeatIndex:0,
    isSpecificDays:false,isWeeklyCount:false,weeklyCount:3,executionTargetValue:1,
    executionTime:'08:00',hasExecutionTime:false,managedExecutionPlanId:'',
    weekdays:[1,2,3,4,5,6,7].map((value,index) => ({ value,label:['一','二','三','四','五','六','日'][index],selected:false }))
  },
  onLoad(options) {
    if (!options.id) return
    this.setData({ id: options.id, editMode: true })
    wx.setNavigationBarTitle({ title: '编辑长期目标' })
    this.load()
  },
  async load() {
    this.setData({ loading: true })
    try {
      const { plan } = await api.call('getPlan', { planId: this.data.id })
      const next={
        name: plan.name || '', description: plan.description || '', goalType: plan.goalType || 'DEADLINE',
        deadlineDate: plan.deadlineDate || futureDate(), habitDays: plan.habitDays || 21,
        targetValue:plan.targetValue || 5000,unit:plan.unit || '次',unlimited:Boolean(plan.unlimited),
        accumulationDeadlineDate:plan.accumulationDeadlineDate || futureDate(99),
        managedExecutionPlanId:plan.managedExecutionPlanId || ''
      }
      this.setData(next)
      if(plan.goalType === 'ACCUMULATION' && plan.managedExecutionPlanId)await this.loadManagedPlan(plan.managedExecutionPlanId)
    } finally { this.setData({ loading: false }) }
  },
  async loadManagedPlan(planId) {
    const { plan }=await api.call('getPlan',{ planId })
    const selected=new Set(plan.repeatConfig?.weekdays || [])
    const repeatIndex=indexOfValue(ACCUMULATION_REPEATS,plan.repeatType)
    this.setData({
      categoryIndex:indexOfValue(PLAN_CATEGORIES,plan.category),repeatIndex,
      isSpecificDays:plan.repeatType === 'SPECIFIC_WEEKDAYS',isWeeklyCount:plan.repeatType === 'WEEKLY_COUNT',
      weeklyCount:plan.repeatConfig?.weeklyCount || 3,executionTargetValue:plan.targetValue || 1,
      executionTime:plan.executionTime || '08:00',hasExecutionTime:Boolean(plan.executionTime),
      weekdays:this.data.weekdays.map(item => ({ ...item,selected:selected.has(item.value) }))
    })
  },
  chooseType(e) {
    if(this.data.editMode)return wx.showToast({ title:'目标类型创建后不能修改',icon:'none' })
    this.setData({ goalType:e.currentTarget.dataset.value })
  },
  input(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }) },
  dateChange(e) { this.setData({ deadlineDate: e.detail.value }) },
  accumulationDateChange(e) { this.setData({ accumulationDeadlineDate:e.detail.value }) },
  toggleUnlimited(e) { this.setData({ unlimited: Boolean(e.detail.value) }) },
  category(e) { this.setData({ categoryIndex:Number(e.detail.value) }) },
  repeat(e) {
    const repeatIndex=Number(e.detail.value)
    const value=this.data.repeatValues[repeatIndex]
    this.setData({ repeatIndex,isSpecificDays:value === 'SPECIFIC_WEEKDAYS',isWeeklyCount:value === 'WEEKLY_COUNT' })
  },
  toggleDay(e) {
    const day=Number(e.currentTarget.dataset.day)
    this.setData({ weekdays:this.data.weekdays.map(item => item.value === day ? { ...item,selected:!item.selected } : item) })
  },
  timeChange(e) { this.setData({ executionTime:e.detail.value }) },
  toggleExecutionTime(e) { this.setData({ hasExecutionTime:Boolean(e.detail.value) }) },
  async save() {
    if (this.data.saving) return
    const name = this.data.name.trim()
    if (!name) return wx.showToast({ title: '请输入目标名称', icon: 'none' })
    const repeatType=this.data.repeatValues[this.data.repeatIndex]
    const weekdays=this.data.weekdays.filter(item => item.selected).map(item => item.value)
    if(this.data.goalType === 'ACCUMULATION') {
      if(!this.data.unit.trim())return wx.showToast({ title:'请输入累计单位',icon:'none' })
      if(!this.data.unlimited && Number(this.data.targetValue) <= 0)return wx.showToast({ title:'总目标必须大于0',icon:'none' })
      if(repeatType === 'SPECIFIC_WEEKDAYS' && !weekdays.length)return wx.showToast({ title:'请至少选择一天',icon:'none' })
      if(repeatType === 'WEEKLY_COUNT' && (Number(this.data.weeklyCount) < 1 || Number(this.data.weeklyCount) > 7))return wx.showToast({ title:'每周次数应为1到7次',icon:'none' })
    }
    const goal = {
      name, description: this.data.description.trim(), goalType: this.data.goalType,
      deadlineDate: this.data.deadlineDate, habitDays: Number(this.data.habitDays || 21),
      targetValue:Number(this.data.targetValue || 0),unit:this.data.unit.trim(),unlimited:this.data.unlimited,
      accumulationDeadlineDate:this.data.accumulationDeadlineDate,
      executionPlan:{
        category:this.data.categoryValues[this.data.categoryIndex],repeatType,
        repeatConfig:{ weekdays,weeklyCount:Number(this.data.weeklyCount || 1) },
        targetValue:Number(this.data.executionTargetValue || 1),
        executionTime:this.data.hasExecutionTime ? this.data.executionTime : ''
      }
    }
    this.setData({ saving: true })
    try {
      const result = this.data.editMode
        ? await api.call('updateLongTermGoal', { goalId: this.data.id, goal })
        : await api.call('createLongTermGoal', { goal })
      wx.showToast({ title: result.achievedGoals?.length ? '长期目标已达成' : (this.data.editMode ? '目标已更新' : '目标已创建'), icon: 'success' })
      setTimeout(() => wx.navigateBack(), 350)
    } finally { this.setData({ saving: false }) }
  }
})
