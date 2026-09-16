const api=require('../../utils/api')
Page({
 data:{inviteCode:'',groups:[]},
 onShow(){this.load()},
 input(e){this.setData({inviteCode:e.detail.value.toUpperCase()})},
 async load(){const d=await api.call('getGroups');this.setData({groups:d.groups})},
 create(){wx.navigateTo({url:'/pages/circle/group-create'})},
 detail(e){wx.navigateTo({url:`/pages/circle/group-detail?id=${e.currentTarget.dataset.id}`})},
 async join(){
   const code=this.data.inviteCode.trim();if(!code)return wx.showToast({title:'请输入邀请码',icon:'none'})
   await api.call('joinGroup',{inviteCode:code});wx.showToast({title:'已加入',icon:'success'});this.setData({inviteCode:''});await this.load()
 }
})
