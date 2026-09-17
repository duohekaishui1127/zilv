const api=require('../../utils/api')
Page({
 data:{nickname:'',sexOptions:['男','女'],sexValues:['MALE','FEMALE'],sexIndex:0,birthday:'1995-01-01',heightCm:'',goalOptions:['减脂','维持','增肌'],goalValues:['FAT_LOSS','MAINTAIN','MUSCLE_GAIN'],goalIndex:0,activityOptions:['久坐/普通日常','轻度活动','中等日常活动'],activityValues:['SEDENTARY','LIGHT','MODERATE'],activityIndex:0,proteinRatio:1.6,fatRatio:0.8,targetCalorieAdjustment:-300,saving:false},
 onLoad(){this.load()},
 input(e){this.setData({[e.currentTarget.dataset.key]:e.detail.value})},date(e){this.setData({birthday:e.detail.value})},sex(e){this.setData({sexIndex:Number(e.detail.value)})},goal(e){const i=Number(e.detail.value);this.setData({goalIndex:i,targetCalorieAdjustment:[-300,0,200][i]})},activity(e){this.setData({activityIndex:Number(e.detail.value)})},
 async load(){const d=await api.call('getProfile');const u=d.user,p=d.nutritionProfile||{};this.setData({nickname:u.nickname||'',birthday:u.birthday||'1995-01-01',heightCm:u.heightCm||'',sexIndex:Math.max(0,this.data.sexValues.indexOf(u.sex)),goalIndex:Math.max(0,this.data.goalValues.indexOf(p.goalType)),activityIndex:Math.max(0,this.data.activityValues.indexOf(p.baseActivityLevel)),proteinRatio:p.proteinRatio||1.6,fatRatio:p.fatRatio||0.8,targetCalorieAdjustment:p.targetCalorieAdjustment??-300})},
 async save(){
   if(this.data.saving)return
   const height=Number(this.data.heightCm),protein=Number(this.data.proteinRatio),fat=Number(this.data.fatRatio),adjust=Number(this.data.targetCalorieAdjustment)
   if(!this.data.nickname.trim())return wx.showToast({title:'请输入昵称',icon:'none'})
   if(!Number.isFinite(height)||height<80||height>250)return wx.showToast({title:'请输入有效身高',icon:'none'})
   if(!Number.isFinite(protein)||protein<0.5||protein>4)return wx.showToast({title:'蛋白质比例不合理',icon:'none'})
   if(!Number.isFinite(fat)||fat<0.2||fat>3)return wx.showToast({title:'脂肪比例不合理',icon:'none'})
   if(!Number.isFinite(adjust)||adjust<-1500||adjust>1500)return wx.showToast({title:'热量调整范围过大',icon:'none'})
   this.setData({saving:true})
   try{
     await api.call('updateProfile',{profile:{nickname:this.data.nickname.trim(),sex:this.data.sexValues[this.data.sexIndex],birthday:this.data.birthday,heightCm:height},nutritionProfile:{goalType:this.data.goalValues[this.data.goalIndex],baseActivityLevel:this.data.activityValues[this.data.activityIndex],proteinRatio:protein,fatRatio:fat,targetCalorieAdjustment:adjust}})
     wx.showToast({title:'已保存',icon:'success'});setTimeout(()=>wx.navigateBack(),350)
   }finally{this.setData({saving:false})}
 }
})
