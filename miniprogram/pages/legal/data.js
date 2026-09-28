const api=require('../../utils/api')
const ACTIONS={
  ACTIVITY:{title:'清空执行历史',desc:'删除打卡、专注/完成记录和学习执行历史；不会删除任务定义。'},
  HEALTH:{title:'清空身体与运动数据',desc:'删除体重、体脂、围度、运动与营养计算记录。'},
  DIET:{title:'清空饮食数据',desc:'删除饮食记录、饮食照片和自定义食物。'},
  NOTES:{title:'清空我的历程',desc:'删除笔记及其图片附件。'},
  ACCOUNT:{title:'永久注销账号',desc:'删除或匿名化账号关联数据；你再次打开小程序时将视为新用户。'}
}
Page({
  data:{loading:true,summary:{},contact:'',confirmType:'',confirmTitle:'',confirmDesc:'',phraseDraft:'',submitting:false},
  onShow(){this.load()},
  async load(){
    try{const d=await api.call('getDataManagementSummary',{}, {silent:true});this.setData({summary:d.summary||{},contact:d.contact||'',loading:false})}
    catch(error){this.setData({loading:false});wx.showToast({title:api.messageOf(error),icon:'none'})}
  },
  start(e){const type=e.currentTarget.dataset.type;const cfg=ACTIONS[type];this.setData({confirmType:type,confirmTitle:cfg.title,confirmDesc:cfg.desc,phraseDraft:''})},
  cancel(){this.setData({confirmType:'',phraseDraft:''})},
  input(e){this.setData({phraseDraft:e.detail.value})},
  async confirm(){
    if(this.data.submitting)return
    const type=this.data.confirmType
    const required=type==='ACCOUNT'?'永久注销':'确认清空'
    if(this.data.phraseDraft.trim()!==required)return wx.showToast({title:`请输入“${required}”`,icon:'none'})
    this.setData({submitting:true})
    try{
      if(type==='ACCOUNT'){
        await api.call('deleteAccount',{confirmPhrase:required})
        try{wx.clearStorageSync()}catch(e){}
        wx.showModal({title:'账号已注销',content:'相关数据已按规则处理。再次进入时将作为新用户开始。',showCancel:false,success:()=>{if(wx.exitMiniProgram)wx.exitMiniProgram({})}})
        return
      }
      await api.call('deletePersonalDataCategory',{type,confirmPhrase:required})
      wx.showToast({title:'已清空',icon:'success'})
      this.cancel();await this.load()
    }catch(error){wx.showToast({title:api.messageOf(error),icon:'none'})}
    finally{this.setData({submitting:false})}
  }
})
