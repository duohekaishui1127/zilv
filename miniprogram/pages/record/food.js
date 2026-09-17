const api = require('../../utils/api')
const debounce = require('../../utils/debounce')

Page({
  data: {
    keyword: '', foods: [], selected: null, amountGram: '', preview: null,
    mealTypes: ['早餐', '午餐', '晚餐', '加餐'], mealValues: ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'], mealIndex: 0,
    items: [], summary: {}, target: null, loading: false
  },
  onLoad() {
    this._debouncedSearch = debounce(() => this.search(true), 350)
  },
  onShow() { this.loadDaily(); this.search(true) },
  async loadDaily() {
    const d = await api.call('getDailyMeals')
    this.setData({ items: d.items, summary: d.summary, target: d.target })
  },
  onKeyword(e) {
    this.setData({ keyword: e.detail.value })
    this._debouncedSearch()
  },
  async search(silent = false) {
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      const d = await api.call('searchFood', { keyword: this.data.keyword }, { silent })
      this.setData({ foods: d.foods })
    } finally {
      this.setData({ loading: false })
    }
  },
  select(e) {
    const selected = this.data.foods.find(x => x._id === e.currentTarget.dataset.id) || null
    this.setData({ selected }, () => this.updatePreview())
  },
  amount(e) { this.setData({ amountGram: e.detail.value }, () => this.updatePreview()) },
  meal(e) { this.setData({ mealIndex: Number(e.detail.value) }) },
  updatePreview() {
    const { selected, amountGram } = this.data
    const amount = Number(amountGram)
    if (!selected || !Number.isFinite(amount) || amount <= 0) return this.setData({ preview: null })
    const ratio = amount / 100
    this.setData({ preview: {
      kcal: Math.round(selected.energyKcalPer100 * ratio * 10) / 10,
      protein: Math.round(selected.proteinPer100 * ratio * 10) / 10,
      carb: Math.round(selected.carbPer100 * ratio * 10) / 10,
      fat: Math.round(selected.fatPer100 * ratio * 10) / 10
    } })
  },
  async add() {
    if (!this.data.selected) return wx.showToast({ title: '请先选择食物', icon: 'none' })
    const amount = Number(this.data.amountGram)
    if (!Number.isFinite(amount) || amount <= 0) return wx.showToast({ title: '请输入有效食用克数', icon: 'none' })
    await api.call('addMealItem', {
      foodId: this.data.selected._id,
      amountGram: amount,
      mealType: this.data.mealValues[this.data.mealIndex]
    })
    wx.showToast({ title: '已添加', icon: 'success' })
    this.setData({ selected: null, amountGram: '', preview: null })
    await this.loadDaily()
  },
  async remove(e) {
    if (!await api.confirm('删除这条饮食记录？')) return
    await api.call('deleteMealItem', { itemId: e.currentTarget.dataset.id })
    await this.loadDaily()
  },
  custom() { wx.navigateTo({ url: '/pages/profile/food-custom' }) }
})
