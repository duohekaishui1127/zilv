// 当前开发版、体验版和正式版统一使用已初始化的云环境；后续拆分环境时分别替换。
const CLOUD_ENVS = Object.freeze({
  develop: 'cloud1-d5gqve1w118b45d47',
  trial: 'cloud1-d5gqve1w118b45d47',
  release: 'cloud1-d5gqve1w118b45d47'
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
