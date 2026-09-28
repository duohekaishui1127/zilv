const api=require('../../utils/api')
Page({data:{gate:null},onLoad(){this.load()},async load(){try{this.setData({gate:await api.call('getLegalGate',{}, {silent:true})})}catch(e){}}})
