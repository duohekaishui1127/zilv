// 建议分别创建开发与真实数据环境。留空时使用开发者工具当前选择的云环境。
const CLOUD_ENVS = Object.freeze({
  develop: '',
  trial: '',
  release: ''
})

function getEnvVersion() {
  try {
    return wx.getAccountInfoSync()?.miniProgram?.envVersion || 'develop'
  } catch (e) {
    return 'develop'
  }
}

function getCloudEnv() {
  return CLOUD_ENVS[getEnvVersion()] || ''
}

module.exports = { CLOUD_ENVS, getEnvVersion, getCloudEnv }
