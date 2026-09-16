const api = require('../../utils/api')

const FALLBACK_TYPES = [
  {key:'WALK',name:'步行',category:'CARDIO'}, {key:'BRISK_WALK',name:'快走',category:'CARDIO'},
  {key:'JOG',name:'慢跑',category:'CARDIO'}, {key:'RUN',name:'跑步',category:'CARDIO'},
  {key:'CYCLING',name:'骑行',category:'CARDIO'}, {key:'STRENGTH',name:'力量训练',category:'STRENGTH'},
  {key:'HIIT',name:'HIIT',category:'CARDIO'}, {key:'YOGA',name:'瑜伽',category:'OTHER'}
]

Page({
  data: {
    types: FALLBACK_TYPES, typeIndex: 5, isStrength: true, durationMinutes: '', weightKg: '', reps: '', setsCount: '', note: '', workouts: [], summary: {}, saving: false,
    plans:[{_id:'',name:'不关联计划'}],planIndex:0
  },
  onShow() { this.load() },
  changeType(e) {
    const i = Number(e.detail.value)
    const type = this.data.types[i] || FALLBACK_TYPES[0]
    this.setData({ typeIndex: i, isStrength: type.category === 'STRENGTH' })
  },
  input(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }) },
  plan(e){this.setData({planIndex:Number(e.detail.value)})},
  async load() {
    const [daily,plans,exerciseData]=await Promise.all([
      api.call('getDailyWorkouts'),
      api.call('getTodayPlans'),
      api.call('getExercises', {}, { silent: true }).catch(() => ({ exercises: FALLBACK_TYPES }))
    ])
    const types=(exerciseData.exercises||[]).length ? exerciseData.exercises : FALLBACK_TYPES
    const currentKey=this.data.types[this.data.typeIndex]?.key || 'STRENGTH'
    let typeIndex=Math.max(0,types.findIndex(x=>x.key===currentKey))
    if (typeIndex < 0) typeIndex=0
    const workoutPlans=[{_id:'',name:'不关联计划'},...plans.plans.filter(p=>p.category==='WORKOUT'&&!p.completed)]
    this.setData({
      workouts: daily.workouts, summary: daily.summary, plans:workoutPlans, planIndex:0, types, typeIndex,
      isStrength: (types[typeIndex]?.category || '') === 'STRENGTH'
    })
  },
  writeNote(e) {
    const id = e.currentTarget.dataset.id
    const title = encodeURIComponent(`${e.currentTarget.dataset.title || '训练'}复盘`)
    wx.navigateTo({ url: `/pages/notes/edit?type=WORKOUT&relatedType=WORKOUT_SESSION&relatedId=${id}&title=${title}` })
  },
  async save() {
    if (this.data.saving) return
    const duration = Number(this.data.durationMinutes)
    if (!Number.isFinite(duration) || duration <= 0) return wx.showToast({ title: '请输入有效运动时长', icon: 'none' })
    const type = this.data.types[this.data.typeIndex]
    const sets = this.data.isStrength ? [{
      weightKg: Number(this.data.weightKg || 0), reps: Number(this.data.reps || 0), setsCount: Number(this.data.setsCount || 0)
    }] : []
    const selected=this.data.plans[this.data.planIndex]
    this.setData({ saving: true })
    try {
      const result=await api.call('addWorkout', {
        exerciseKey: type.key, exerciseName: type.name, category: type.category || (this.data.isStrength ? 'STRENGTH' : 'CARDIO'),
        met: type.metValue, durationMinutes: duration, note: this.data.note, sets, planId:selected?selected._id:''
      })
      wx.showToast({ title: result.planAutoCompleted?'已记录并完成计划':'已记录', icon: 'success' })
      this.setData({ durationMinutes:'', weightKg:'', reps:'', setsCount:'', note:'' })
      await this.load()
    } finally { this.setData({ saving: false }) }
  }
})
