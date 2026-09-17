const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const C = Object.freeze({
  USERS: 'users',
  BODY: 'body_records',
  NUTRITION_PROFILES: 'nutrition_profiles',
  NUTRITION_TARGETS: 'nutrition_targets',
  FOODS: 'foods',
  MEALS: 'meals',
  MEAL_ITEMS: 'meal_items',
  WORKOUTS: 'workout_sessions',
  PLANS: 'plans',
  CHECKINS: 'checkins',
  DAILY_REVIEWS: 'daily_reviews',
  STUDY: 'study_sessions',
  FRIENDSHIPS: 'friendships',
  PRIVACY: 'privacy_settings',
  GROUPS: 'groups',
  GROUP_MEMBERS: 'group_members',
  PLAN_GROUPS: 'plan_group_bindings',
  GROUP_EVENTS: 'group_events',
  EXERCISES: 'exercises',
  BODY_METRICS: 'body_metric_defs',
  APP_CONFIG: 'app_config',
  SYSTEM_META: 'system_meta',
  AUDIT_LOGS: 'audit_logs',
  MIGRATION_HISTORY: 'migration_history',
  NOTES: 'notes',
  NOTE_ATTACHMENTS: 'note_attachments',
  BODY_METRIC_PREFS: 'body_metric_preferences',
  NOTIFICATIONS: 'notifications',
  FEEDBACKS: 'feedbacks'
})

module.exports = { cloud, db, _, C }
