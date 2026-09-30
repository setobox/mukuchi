import type { z } from 'zod'
import type { ArticleReference, AssistantBlock, SignedTurn, TurnRequest, TurnResponse } from '../../../shared/assistant/model'
import type { AssistantCredentials, AssistantSettings } from '../../../shared/assistant/settings'
import type { ModelMessage, ToolCall } from '../../../shared/assistant/tools'
import type { PublicContent } from './content'
import type { AssistantRepository } from './repository'
import { z as schema } from 'zod'
import { AssistantError, assistantLimits, assistantMessageSchema, historyText, referenceSchema, turnRequestSchema, visibleText } from '../../../shared/assistant/model'
import { modelMessageSchema, toolCallSchema, toolInputs } from '../../../shared/assistant/tools'
import { digest, seal, signTurn, unseal, verifyHistory } from './crypto'
import { AliyunModerationError, moderate } from './moderation'
import { callModel, modelBody, modelCharge, modelReservation } from './provider'

const stateSchema = schema.object({
  request: turnRequestSchema.omit({ turnstileToken: true }),
  groups: schema.array(schema.array(modelMessageSchema)).max(8),
  knownArticles: schema.array(schema.string()).max(100),
  references: schema.array(referenceSchema).max(8),
  taxonomyRead: schema.array(schema.enum(['category', 'tag', 'all'])).max(8),
  contextLimited: schema.boolean(),
  navigation: schema.string().nullable(),
  historyExhausted: schema.boolean(),
  historyCursor: schema.object({ id: schema.uuid(), createdAt: schema.number() }).nullable(),
}).strict()
type EngineState = z.infer<typeof stateSchema>
const continuationSchema = schema.object({
  state: stateSchema,
  nonce: schema.uuid(),
  expiresAt: schema.number(),
  call: toolCallSchema,
}).strict()
export interface EngineDependencies {
  repository: AssistantRepository
  content: PublicContent
  settings: AssistantSettings
  credentials: AssistantCredentials
  secret: string
  actor: string
  signal: AbortSignal
  configVersion?: number
  now?: () => number
  model?: typeof callModel
  moderation?: typeof moderate
}
export function contextMessages(state: Pick<EngineState, 'request' | 'groups'>) {
  const history = [...state.request.history]
  const groups = [...state.groups]
  let limited = false
  const make = (): ModelMessage[] => [{ role: 'user', content: JSON.stringify({ question: state.request.text, page: state.request.page, history: history.map(historyText), limited }) }, ...groups.flat()]
  let messages = make()
  while (JSON.stringify(messages).length > assistantLimits.contextLength) {
    limited = true
    if (history.length)
      history.shift()
    else if (groups.length > 1)
      groups.shift()
    else throw new AssistantError(400, 'context_limit', '本次材料超出安全检查范围，请指定较短的章节或缩小问题')
    messages = make()
  }
  return { messages, limited }
}
export function createAssistantEngine(dependencies: EngineDependencies) {
  const { repository, content, settings, credentials, secret, actor, signal } = dependencies
  const now = dependencies.now ?? Date.now
  const model = dependencies.model ?? callModel
  const moderation = dependencies.moderation ?? moderate
  async function active(requestId: string) {
    signal.throwIfAborted()
    if (dependencies.configVersion !== undefined) {
      const latest = await repository.settings()
      if (!latest.settings.enabled || latest.version !== dependencies.configVersion || !latest.verifiedHash)
        throw new AssistantError(503, 'configuration_changed', '助手配置已变化，本次处理已停止')
    }
    return repository.assertActive(requestId, actor, now())
  }
  async function bill<T>(requestId: string, kind: 'model' | 'moderation', amount: number, operation: () => Promise<{ value: T, actual: number | null }>): Promise<T> {
    await active(requestId)
    const id = crypto.randomUUID()
    await repository.reserve({ id, requestId, actor, kind, amount }, settings.dailyBudgetMicros, now())
    let actual: number | null = null
    try {
      const result = await operation()
      actual = result.actual
      await active(requestId)
      return result.value
    }
    catch (error) {
      if (kind === 'moderation' && error instanceof AliyunModerationError && error.unbilled)
        actual = 0
      throw error
    }
    finally { await repository.settle(id, actual) }
  }
  async function check(requestId: string, text: string, direction: 'input' | 'output') {
    if (settings.moderationPriceMicros === null)
      throw new AssistantError(503, 'missing_prices', '安全检查价格尚未配置')
    const allowed = await bill(requestId, 'moderation', settings.moderationPriceMicros, async () => ({ value: await moderation(text, direction, settings, credentials, signal), actual: settings.moderationPriceMicros }))
    if (!allowed)
      throw new AssistantError(400, 'moderation_rejected', '本次内容未通过安全检查，请调整问题后重试')
  }
  function known(state: EngineState, articleId: string) {
    if (!state.knownArticles.includes(articleId))
      throw new AssistantError(400, 'unknown_article', '未能确定文章，请先搜索或选择文章')
  }
  async function execute(state: EngineState, call: ToolCall): Promise<unknown> {
    let args: unknown
    try {
      args = JSON.parse(call.function.arguments)
    }
    catch { throw new AssistantError(503, 'invalid_tool', '工具参数无效，请重新提问') }
    await repository.countCall(state.request.requestId, actor, 'tool', now())
    switch (call.function.name) {
      case 'get_site_info': {
        const input = toolInputs.get_site_info.parse(args)
        return content.siteInfo(input.scope)
      }
      case 'get_taxonomy': {
        const input = toolInputs.get_taxonomy.parse(args)
        state.taxonomyRead.push(input.kind)
        return { items: await content.taxonomy(input.kind), limited: true }
      }
      case 'search_articles': {
        const input = toolInputs.search_articles.parse(args)
        const articles = await content.search(input.query, input)
        state.knownArticles = [...new Set([...state.knownArticles, ...articles.map(article => article.articleId)])]
        return { articles, purpose: '候选摘要，不是正文阅读依据' }
      }
      case 'get_article': {
        const input = toolInputs.get_article.parse(args)
        known(state, input.articleId)
        const reading = await content.read(input.articleId, input.sectionId)
        if (!reading)
          return { missing: true }
        const reference = content.reference(reading)
        if (!state.references.some(ref => ref.articleId === reference.articleId && ref.sectionId === reference.sectionId))
          state.references.push(reference)
        state.contextLimited ||= reading.partial
        return reading
      }
      case 'navigate_to_article': {
        const input = toolInputs.navigate_to_article.parse(args)
        known(state, input.articleId)
        if (!await content.article(input.articleId))
          return { missing: true }
        state.navigation = input.articleId
        return { proposal: true, articleId: input.articleId, message: '尚未跳转，应用将确认用户意图后提供导航。' }
      }
      case 'get_history': {
        toolInputs.get_history.parse(args)
        return { unavailable: true, message: '没有更多可验证的本地历史，请勿编造。' }
      }
    }
  }
  async function run(state: EngineState): Promise<TurnResponse> {
    const { request } = state
    try {
      while (true) {
        await active(request.requestId)
        const context = contextMessages(state)
        state.contextLimited ||= context.limited
        await check(request.requestId, JSON.stringify(context.messages), 'input')
        await repository.countCall(request.requestId, actor, 'model', now())
        const body = modelBody(settings, context.messages)
        const result = await bill(request.requestId, 'model', modelReservation(settings, body), async () => {
          const value = await model(settings, credentials, body, signal)
          return { value, actual: value.usage ? modelCharge(settings, value.usage.prompt_tokens, value.usage.completion_tokens) : null }
        })
        if (result.kind === 'tools') {
          // Audit the complete proposal before running any tool, including read-only tools.
          const proposal = JSON.stringify(result.calls)
          if (proposal.length > assistantLimits.contextLength)
            throw new AssistantError(400, 'context_limit', '本次工具请求过长，请缩小问题范围')
          for (const call of result.calls) {
            let args: unknown
            try {
              args = JSON.parse(call.function.arguments)
            }
            catch { throw new AssistantError(503, 'invalid_tool', '模型工具请求无效，请重试') }
            toolInputs[call.function.name].parse(args)
          }
          if (new Set(result.calls.map(call => call.id)).size !== result.calls.length)
            throw new AssistantError(503, 'invalid_tool', '模型工具标识重复，请重试')
          await check(request.requestId, proposal, 'output')
          const historyCall = result.calls.find(call => call.function.name === 'get_history')
          if (historyCall && !state.historyExhausted) {
            // Parallel history requests cannot be resumed safely; require the single-tool protocol.
            if (result.calls.length !== 1)
              throw new AssistantError(503, 'invalid_tool', '历史查询必须单独执行，请重试')
            await repository.countCall(request.requestId, actor, 'history', now())
            await repository.countCall(request.requestId, actor, 'tool', now())
            const nonce = crypto.randomUUID()
            const token = await seal(secret, actor, 'continuation', { state, call: historyCall, nonce, expiresAt: now() + 60_000 })
            await repository.waitForHistory(request.requestId, actor, nonce, now())
            return { kind: 'needs_history', requestId: request.requestId, conversationId: request.conversationId, continuation: token, historyRequest: { before: state.historyCursor?.id ?? null, limit: toolInputs.get_history.parse(JSON.parse(historyCall.function.arguments)).limit } }
          }
          const group: ModelMessage[] = [{ role: 'assistant', content: null, tool_calls: result.calls }]
          for (const call of result.calls) {
            await active(request.requestId)
            group.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(await execute(state, call)) })
          }
          state.groups.push(group)
          continue
        }
        const { intent } = result
        const blocks: AssistantBlock[] = [{ type: 'text', text: intent.text }]
        if (intent.articles.length) {
          const cards = []
          for (const articleId of new Set(intent.articles)) {
            known(state, articleId)
            const card = await content.article(articleId)
            if (card)
              cards.push(card)
          }
          if (cards.length)
            blocks.push({ type: 'article_list', items: cards })
        }
        if (intent.taxonomy) {
          if (!state.taxonomyRead.includes(intent.taxonomy) && !state.taxonomyRead.includes('all'))
            throw new AssistantError(400, 'invalid_reference', '分类信息尚未读取，请重试')
          const items = await content.taxonomy(intent.taxonomy)
          if (items.length)
            blocks.push({ type: 'taxonomy_list', items })
        }
        const references: ArticleReference[] = []
        for (const item of intent.references) {
          const reference = state.references.find(ref => ref.articleId === item.articleId && (ref.sectionId ?? null) === item.sectionId)
          if (!reference || !await content.article(item.articleId))
            throw new AssistantError(400, 'invalid_reference', '文章引用无法验证，请重新提问')
          references.push(reference)
        }
        const id = crypto.randomUUID()
        let actionId: string | undefined
        let authorized = false
        if (state.navigation) {
          const article = await content.article(state.navigation)
          if (!article)
            throw new AssistantError(400, 'unknown_article', '文章已不可访问，请重新选择')
          actionId = crypto.randomUUID()
          // Conservative explicit intent; generic yes is handled only by a current pending action.
          authorized = /^(?:请|帮我|请帮我)?\s*(?:打开|跳转到|带我去|open\b)/i.test(request.text.trim())
            && (request.text.includes(article.title) || request.text.includes(article.path) || (state.navigation === request.page.path && /这篇|当前|此文/.test(request.text)))
          blocks.push({ type: 'navigation_confirmation', actionId, target: { articleId: article.articleId, path: article.path, title: article.title }, expiresAt: now() + 300_000 })
        }
        const message = assistantMessageSchema.parse({ id, role: 'assistant', blocks, references })
        const text = visibleText(message)
        if (text.length > assistantLimits.visibleLength)
          throw new AssistantError(400, 'output_limit', '回答内容过长，请缩小问题范围后重试')
        await check(request.requestId, text, 'output')
        if (actionId && state.navigation)
          await repository.createAction({ id: actionId, actor, conversationId: request.conversationId, messageId: id, articleId: state.navigation, authorized }, now())
        const record = await signTurn(secret, actor, { id: request.requestId, conversationId: request.conversationId, user: request.text, createdAt: now(), assistant: message })
        await repository.end(request.requestId, actor, 'completed')
        return { kind: 'completed', record, contextLimited: state.contextLimited, ...(authorized && actionId ? { navigate: actionId } : {}) }
      }
    }
    catch (error) {
      await repository.end(request.requestId, actor, 'failed')
      throw error
    }
  }
  return {
    async start(input: TurnRequest): Promise<TurnResponse> {
      const request = turnRequestSchema.parse(input)
      request.history = await verifyHistory(secret, actor, request.conversationId, request.history, now())
      const confirmation = /^(?:yes|ok|好|好的|是|是的|打开|打开吧|确认|可以)[！!。.\s]*$/i.test(request.text)
      const pending = request.pendingActionId && request.history.at(-1)?.assistant.blocks.some(block => block.type === 'navigation_confirmation' && block.actionId === request.pendingActionId)
      if (confirmation && pending && request.pendingActionId) {
        const action = await repository.action(request.pendingActionId, actor, request.conversationId, now())
        const article = action?.status === 'pending' ? await content.article(action.article_id) : null
        if (action && article) {
          const message = assistantMessageSchema.parse({ id: crypto.randomUUID(), role: 'assistant', references: [], blocks: [
            { type: 'text', text: `准备打开《${article.title}》。` },
            { type: 'navigation_confirmation', actionId: action.id, target: { articleId: article.articleId, path: article.path, title: article.title }, expiresAt: action.expires_at },
          ] })
          const context = contextMessages({ request, groups: [] })
          await check(request.requestId, JSON.stringify(context.messages), 'input')
          await check(request.requestId, visibleText(message), 'output')
          if (!await repository.authorizeAction(action.id, actor, request.conversationId, now()))
            throw new AssistantError(409, 'action_expired', '操作已失效，请重新选择')
          const record = await signTurn(secret, actor, { id: request.requestId, conversationId: request.conversationId, user: request.text, createdAt: now(), assistant: message })
          await repository.end(request.requestId, actor, 'completed')
          return { kind: 'completed', record, contextLimited: context.limited, navigate: action.id }
        }
      }
      await repository.cancelPendingActions(actor, request.conversationId)
      const knownArticles = new Set(request.history.flatMap(turn => [
        ...turn.assistant.references.map(ref => ref.articleId),
        ...turn.assistant.blocks.flatMap(block => block.type === 'article_list' ? block.items.map(item => item.articleId) : []),
      ]))
      if (request.page.path && await content.article(request.page.path))
        knownArticles.add(request.page.path)
      const safeRequest = turnRequestSchema.omit({ turnstileToken: true }).parse({ requestId: request.requestId, conversationId: request.conversationId, text: request.text, page: request.page, history: request.history, pendingActionId: request.pendingActionId })
      const first = request.history[0]
      return run({ request: safeRequest, groups: [], knownArticles: [...knownArticles], references: [], taxonomyRead: [], contextLimited: false, navigation: null, historyExhausted: false, historyCursor: first ? { id: first.id, createdAt: first.createdAt } : null })
    },
    async resume(token: string, values: SignedTurn[]): Promise<TurnResponse> {
      const payload = await unseal(secret, actor, 'continuation', token, continuationSchema)
      if (payload.expiresAt <= now())
        throw new AssistantError(409, 'invalid_continuation', '继续对话的凭据已过期，请重新提问')
      const { state } = payload
      const older = await verifyHistory(secret, actor, state.request.conversationId, values, now())
      const first = state.historyCursor
      const limit = toolInputs.get_history.parse(JSON.parse(payload.call.function.arguments)).limit
      if (older.length > limit || older.some(turn => state.request.history.some(existing => existing.id === turn.id) || (first && turn.createdAt >= first.createdAt)))
        throw new AssistantError(400, 'invalid_history', '历史消息顺序无法验证')
      await repository.resume(state.request.requestId, actor, payload.nonce, now())
      state.historyExhausted = older.length < limit
      state.groups.push([{ role: 'assistant', content: null, tool_calls: [payload.call] }, { role: 'tool', tool_call_id: payload.call.id, content: JSON.stringify({ history: older.map(historyText), hasMore: !state.historyExhausted }) }])
      // Older records live in the tool result; keep recent conversation context intact.
      if (older[0])
        state.historyCursor = { id: older[0].id, createdAt: older[0].createdAt }
      return run(state)
    },
    fingerprint: (request: TurnRequest) => digest(JSON.stringify({ conversationId: request.conversationId, text: request.text, page: request.page, history: request.history.map(item => item.proof), pendingActionId: request.pendingActionId })),
  }
}
