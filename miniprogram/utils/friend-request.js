const api = require('./api')

async function promptFriendRequest(targetUserId, nickname) {
  const modal = await wx.showModal({
    title: `添加${nickname || '对方'}为好友`,
    content: '',
    editable: true,
    placeholderText: '填写申请备注（选填，最多60字）',
    confirmText: '发送申请'
  })
  if (!modal.confirm) return null
  return api.call('sendFriendRequest', {
    targetUserId,
    requestMessage: String(modal.content || '').trim().slice(0, 60)
  })
}

module.exports = { promptFriendRequest }
