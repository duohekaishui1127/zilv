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
  FRIEND_SETTINGS: 'friend_settings',
  PRIVACY: 'privacy_settings',
  GROUPS: 'groups',
  GROUP_MEMBERS: 'group_members',
  PLAN_GROUPS: 'plan_group_bindings',
  GROUP_PLAN_CHANGES: 'group_plan_change_requests',
  GROUP_EVENTS: 'group_events',
  GROUP_EVENT_LIKES: 'group_event_likes',
  SPECIAL_CARES: 'special_cares',
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
