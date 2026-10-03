import { z } from 'zod'

export const taskStageSchema = z.enum(['task', 'review', 'reply', 'done'])
export const taskStatusSchema = z.enum(['running', 'waiting', 'completed', 'failed', 'cancelled'])
export const taskErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  status: z.number().nullable(),
  upstreamStatus: z.number().nullable(),
  upstreamCode: z.string().nullable(),
  requestId: z.string().nullable(),
})
export type TaskError = z.infer<typeof taskErrorSchema>
export type TaskStage = z.infer<typeof taskStageSchema>
export const taskSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['conversation', 'test']),
  configVersion: z.number(),
  status: taskStatusSchema,
  stage: taskStageSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
  finishedAt: z.number().nullable(),
  deadline: z.number(),
  error: taskErrorSchema.nullable(),
  modelCalls: z.number(),
  toolCalls: z.number(),
  historyCalls: z.number(),
})
export const taskStepSchema = z.object({
  id: z.uuid(),
  stage: taskStageSchema.exclude(['done']),
  label: z.string(),
  status: taskStatusSchema.exclude(['waiting']),
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
  error: taskErrorSchema.nullable(),
})
export const taskDetailSchema = taskSchema.extend({ steps: z.array(taskStepSchema) })
export const taskListSchema = z.object({ tasks: z.array(taskSchema), total: z.number(), page: z.number(), pageSize: z.number() })
export const taskQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  kind: z.enum(['conversation', 'test']).optional(),
  status: taskStatusSchema.optional(),
}).strict()
export type AssistantTask = z.infer<typeof taskSchema>
export type AssistantTaskDetail = z.infer<typeof taskDetailSchema>
export const taskStatusLabels = { running: '进行中', waiting: '等待历史', completed: '完成', failed: '失败', cancelled: '已取消' }
