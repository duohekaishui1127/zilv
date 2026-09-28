const TERMS_VERSION = '1.0'
const PRIVACY_VERSION = '1.0'

function clean(value, fallback = '') { return String(value == null ? fallback : value).trim() }

function legalConfig() {
  const operatorName = clean(process.env.LEGAL_OPERATOR_NAME, '请在上线前填写运营者真实姓名')
  const privacyContact = clean(process.env.LEGAL_PRIVACY_CONTACT, '请在上线前填写隐私联系邮箱或其他有效联系方式')
  const serviceContact = clean(process.env.LEGAL_SERVICE_CONTACT, privacyContact)
  const effectiveDate = clean(process.env.LEGAL_EFFECTIVE_DATE, '2026-09-28')
  const productionReady = !/请在上线前/.test(operatorName) && !/请在上线前/.test(privacyContact)
  return {
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    operatorName,
    privacyContact,
    serviceContact,
    effectiveDate,
    productionReady
  }
}

function legalAccepted(user = {}) {
  return Boolean(user.legalAcceptedAt
    && String(user.termsVersionAccepted || '') === TERMS_VERSION
    && String(user.privacyVersionAccepted || '') === PRIVACY_VERSION)
}

function acceptanceFields(at = new Date()) {
  return {
    termsVersionAccepted: TERMS_VERSION,
    privacyVersionAccepted: PRIVACY_VERSION,
    legalAcceptedAt: at,
    updatedAt: at
  }
}

module.exports = { TERMS_VERSION, PRIVACY_VERSION, legalConfig, legalAccepted, acceptanceFields }
