# 数据库 ER 关系设计（1.2.0）

```mermaid
erDiagram
    USER ||--o{ BODY_RECORD : records
    USER ||--o| BODY_METRIC_PREFERENCE : configures
    BODY_METRIC_DEF }o--o{ BODY_METRIC_PREFERENCE : selects
    USER ||--|| NUTRITION_PROFILE : owns
    USER ||--o{ NUTRITION_TARGET : receives
    USER ||--o{ FOOD : creates_custom
    USER ||--o{ MEAL : creates
    MEAL ||--o{ MEAL_ITEM : contains
    FOOD ||--o{ MEAL_ITEM : referenced_by
    USER ||--o{ WORKOUT_SESSION : performs
    USER ||--o{ STUDY_SESSION : studies
    USER ||--o{ PLAN : owns
    PLAN ||--o{ CHECKIN : completed_as
    PLAN o|--o{ WORKOUT_SESSION : links
    PLAN o|--o{ STUDY_SESSION : links
    USER ||--|| PRIVACY_SETTING : controls
    USER ||--o{ FRIENDSHIP : participates
    USER ||--o{ GROUP_MEMBER : joins
    GROUP ||--o{ GROUP_MEMBER : has
    PLAN ||--o{ PLAN_GROUP_BINDING : binds
    GROUP ||--o{ PLAN_GROUP_BINDING : supervises
    CHECKIN ||--o{ GROUP_EVENT : emits
    USER ||--o{ NOTE : writes
    NOTE ||--o{ NOTE_ATTACHMENT : contains
    BODY_RECORD o|--o{ NOTE : relates
    STUDY_SESSION o|--o{ NOTE : relates
    WORKOUT_SESSION o|--o{ NOTE : relates
    USER ||--o{ NOTIFICATION : receives
    PLAN ||--o{ NOTIFICATION : triggers
```

## 关键边界

1. **BodyRecord** 永远保存历史，不覆盖旧值。
2. **BodyMetricPreference** 只决定用户希望看到/录入哪些可选指标，不改变历史结构。
3. **NutritionTarget** 版本化保存，周报按历史日期寻找当时有效目标。
4. **MealItem** 保存营养快照，避免食物库改变后历史数据漂移。
5. **PlanGroupBinding** 是群组强监督边界；群组不自动拥有用户其他隐私数据。
6. **Note** 是统一长期记录模型，通过 `relatedType + relatedId` 关联 Body/Study/Workout/Plan。
7. **NoteAttachment** 独立存储文件元数据，实际图片进入云存储。
8. Notes 在当前版本固定为 PRIVATE；好友/群组读取链路不存在。
9. Notification 使用用户、计划和日期生成确定性 ID，承载站内未读状态及微信推送结果。
