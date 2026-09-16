# 日志 / 笔记 / 体态照片设计

## 数据模型

```text
notes
  _id
  userId
  clientMutationId
  type: GENERAL | BODY | STUDY | WORKOUT | DIET
  title
  content
  tags[]
  recordDate
  relatedType
  relatedId
  visibility: PRIVATE
  attachmentCount
  status: ACTIVE | DELETED
  createdAt / updatedAt / deletedAt

note_attachments
  _id
  noteId
  userId
  fileId
  mediaType: IMAGE
  poseType: FRONT | SIDE | BACK | OTHER
  sort
  createdAt / updatedAt
```

## 关联关系

支持关联：

- BODY_RECORD
- STUDY_SESSION
- WORKOUT_SESSION
- PLAN

服务端会验证 relatedId 必须属于当前用户，不能通过手工构造请求关联其他用户数据。

## 隐私

当前版本不提供好友/群组读取 Note 的 API。`visibility` 固定写为 PRIVATE，字段为未来扩展保留。

## 幂等

新建 Note 时客户端生成 `clientMutationId`。若网络超时导致用户重试，服务端先按 `userId + clientMutationId` 查找已有记录，再更新同一 Note，避免重复创建。

## 图片一致性

- 选择图片时保留本地临时路径；
- 保存时上传云存储并把 fileId 写回本地草稿；
- API 失败时保留草稿和 fileId，重试不再次上传；
- 编辑时删除附件会在服务端同步删除数据库附件记录和云文件；
- Note 删除采用业务软删除，同时清理附件。

极端情况下（图片上传成功但从未成功调用 API）可能形成孤儿云文件，未来可增加定期垃圾回收任务。
