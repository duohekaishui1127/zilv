const api=require('../../utils/api')
Page({data:{name:'',description:''},input(e){this.setData({[e.currentTarget.dataset.key]:e.detail.value})},async save(){const d=await api.call('createGroup',{name:this.data.name,description:this.data.description});wx.showModal({title:'创建成功',content:`邀请码：${d.group.inviteCode}\n把它发给朋友即可加入。`,showCancel:false,success:()=>wx.navigateBack()})}})
