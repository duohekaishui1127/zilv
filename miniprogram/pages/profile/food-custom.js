const api=require('../../utils/api')
Page({
 data:{name:'',brand:'',energyKcalPer100:'',proteinPer100:'',carbPer100:'',fatPer100:'',saving:false},
 input(e){this.setData({[e.currentTarget.dataset.key]:e.detail.value})},
 async save(){
   if(this.data.saving)return
   if(!this.data.name.trim())return wx.showToast({title:'请输入食物名称',icon:'none'})
   const keys=['energyKcalPer100','proteinPer100','carbPer100','fatPer100']
   for(const key of keys){const n=Number(this.data[key]);if(!Number.isFinite(n)||n<0)return wx.showToast({title:'请完整填写营养数据',icon:'none'})}
   this.setData({saving:true})
   try{
     await api.call('createCustomFood',{food:{name:this.data.name.trim(),brand:this.data.brand.trim(),energyKcalPer100:Number(this.data.energyKcalPer100),proteinPer100:Number(this.data.proteinPer100),carbPer100:Number(this.data.carbPer100),fatPer100:Number(this.data.fatPer100)}})
     wx.showToast({title:'已添加',icon:'success'});this.setData({name:'',brand:'',energyKcalPer100:'',proteinPer100:'',carbPer100:'',fatPer100:''})
   }finally{this.setData({saving:false})}
 }
})
