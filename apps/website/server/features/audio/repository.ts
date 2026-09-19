import type { AudioArticle, AudioJob, AudioKind, AudioManifest, AudioSettings } from '../../../shared/audio/model'
import type { AdminDatabase, SqlValue, Statement } from '../admin/database'
import { AdminError } from '../../../shared/admin/model'
import { digest } from '../../../shared/ai/model'
import { audioConfigHash, audioDay, audioJobSchema, audioKinds, audioSettingsSchema, defaultAudioSettings, kindEnabled } from '../../../shared/audio/model'
import { podcastProgressSchema } from './podcast'

export function canResumeAudio(job: AudioJob) {
  if (!['failed', 'unknown'].includes(job.status) || !job.providerId || job.phase === 'pending')
    return false
  if (job.phase === 'generated' || job.phase === 'stored' || job.kind === 'narration')
    return true
  const progress = podcastProgressSchema.safeParse(JSON.parse(job.progress || '{}'))
  return progress.success && progress.data.lastRound >= 0 && progress.data.resumes < 2
}

const selectJob = `SELECT id,path,title,kind,input_hash AS inputHash,config_hash AS configHash,config,input,status,publication,phase,attempt,version,provider_id AS providerId,result_url AS resultUrl,object_key AS objectKey,size,progress,message,created_at AS createdAt,updated_at AS updatedAt FROM audio_jobs`
export function createAudioRepository(db: AdminDatabase) {
  const query = async (sql: string, params: SqlValue[] = []) => (await db.batch([{ sql, params }]))[0]!
  const repo = {
    query,
    async settings() {
      const row = (await query('SELECT config,encrypted_key,version FROM audio_settings WHERE id = 1'))[0]
      return row ? { settings: audioSettingsSchema.parse(JSON.parse(String(row.config))), encryptedKey: String(row.encrypted_key), version: Number(row.version) } : { settings: { ...defaultAudioSettings }, encryptedKey: '', version: 0 }
    },
    async saveSettings(settings: AudioSettings, encryptedKey: string, version: number) {
      const rows = version === 0
        ? await query('INSERT INTO audio_settings(id,config,encrypted_key,version) VALUES(1,?,?,1) ON CONFLICT DO NOTHING RETURNING id', [JSON.stringify(settings), encryptedKey])
        : await query('UPDATE audio_settings SET config = ?,encrypted_key = ?,version = version + 1 WHERE id = 1 AND version = ? RETURNING id', [JSON.stringify(settings), encryptedKey, version])
      if (!rows.length)
        throw new AdminError(409, '音频设置已修改，请刷新后重试')
    },
    async job(id: string) {
      const row = (await query(`${selectJob} WHERE id = ?`, [id]))[0]
      if (!row)
        throw new AdminError(404, '音频任务不存在')
      return audioJobSchema.parse(row)
    },
    async jobs() {
      return (await query(`${selectJob} ORDER BY created_at DESC LIMIT 500`)).map(row => audioJobSchema.parse(row))
    },
    async statusJobs(hashes: Record<AudioKind, string>) {
      // One relevant job per article/kind, independent of the recent-history limit.
      return (await query(`${selectJob} WHERE id IN (
        SELECT id FROM (
          SELECT j.id, ROW_NUMBER() OVER (PARTITION BY j.path,j.kind ORDER BY
            (j.input_hash = a.input_hash AND j.config_hash = CASE j.kind WHEN 'narration' THEN ? ELSE ? END) DESC,
            j.created_at DESC,j.id DESC) AS position
          FROM audio_jobs j LEFT JOIN audio_articles a ON a.path = j.path
        ) WHERE position = 1
      )`, [hashes.narration, hashes.podcast])).map(row => audioJobSchema.parse(row))
    },
    async enqueue(article: AudioArticle, kind: AudioKind, settings: AudioSettings) {
      if (!kindEnabled(settings, kind) || !article[`${kind}Enabled`])
        return null
      const configHash = await audioConfigHash(settings, kind)
      const id = await digest(JSON.stringify([article.path, article.inputHash, configHash, kind]))
      const input = article[kind]
      const length = Array.from(input).length
      const limit = kind === 'narration' ? 100_000 : 32_000
      const message = length > limit ? `输入超过 ${limit.toLocaleString('en-US')} 字符，未提交供应商；请调整文章或关闭此音频类型。` : ''
      const now = new Date().toISOString()
      await query(`INSERT INTO audio_jobs(id,path,title,kind,input_hash,config_hash,config,input,status,message,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET status = excluded.status,phase = 'pending',attempt = audio_jobs.attempt + 1,version = audio_jobs.version + 1,message = excluded.message,updated_at = excluded.updated_at
        WHERE audio_jobs.status = 'cancelled' AND audio_jobs.provider_id = ''`, [id, article.path, article.title, kind, article.inputHash, configHash, JSON.stringify(settings), input, message ? 'failed' : 'queued', message, now, now])
      return repo.job(id)
    },
    async synchronize(manifest: AudioManifest, baseline = false) {
      const { settings } = await repo.settings()
      const previous = await query('SELECT path,input_hash FROM audio_articles')
      const old = new Map(previous.map(row => [String(row.path), String(row.input_hash)]))
      // Insert jobs before advancing the baseline: a failed sync can always be replayed.
      if (settings.enabled && !baseline) {
        for (const article of manifest.articles) {
          if (old.get(article.path) !== article.inputHash) {
            for (const kind of audioKinds) await repo.enqueue(article, kind, settings)
          }
        }
      }
      const statements: Statement[] = manifest.articles.map(article => ({
        sql: 'INSERT INTO audio_articles(path,input_hash,revision,narration_enabled,podcast_enabled) VALUES(?,?,?,?,?) ON CONFLICT(path) DO UPDATE SET input_hash = excluded.input_hash,revision = excluded.revision,narration_enabled = excluded.narration_enabled,podcast_enabled = excluded.podcast_enabled',
        params: [article.path, article.inputHash, manifest.revision, Number(article.narrationEnabled), Number(article.podcastEnabled)],
      }))
      // Keep each batch under D1's bound parameter limit, including on larger blogs.
      for (let offset = 0; offset < statements.length; offset += 40)
        await db.batch(statements.slice(offset, offset + 40))
      await query('DELETE FROM audio_articles WHERE revision <> ?', [manifest.revision])
      await query('UPDATE audio_jobs SET status = \'cancelled\',message = \'文章已更新、关闭音频或删除\',version = version + 1 WHERE status = \'queued\' AND NOT EXISTS (SELECT 1 FROM audio_articles a WHERE a.path = audio_jobs.path AND a.input_hash = audio_jobs.input_hash)')
    },
    async usage(now = Date.now()) {
      const row = (await query('SELECT narration_characters AS narrationCharacters,podcasts FROM audio_usage WHERE day = ?', [audioDay(now)]))[0]
      return { day: audioDay(now), narrationCharacters: Number(row?.narrationCharacters ?? 0), podcasts: Number(row?.podcasts ?? 0) }
    },
    async claim(now = Date.now()): Promise<AudioJob | null> {
      const { settings } = await repo.settings()
      if (!settings.enabled)
        return null
      const running = (await query(`${selectJob} WHERE status = 'running' LIMIT 1`))[0]
      if (running)
        return audioJobSchema.parse(running)
      const day = audioDay(now)
      const time = new Date(now).toISOString()
      const narrationHash = await audioConfigHash(settings, 'narration')
      const podcastHash = await audioConfigHash(settings, 'podcast')
      const rows = await db.batch([
        { sql: 'INSERT INTO audio_usage(day) VALUES(?) ON CONFLICT DO NOTHING', params: [day] },
        { sql: `UPDATE audio_jobs SET status = 'running',updated_at = ?,version = version + 1 WHERE id = (
          SELECT j.id FROM audio_jobs j JOIN audio_articles a ON a.path = j.path AND a.input_hash = j.input_hash
          WHERE j.status = 'queued' AND ((j.kind = 'narration' AND a.narration_enabled = 1 AND j.config_hash = ? AND ? = 1 AND (j.phase <> 'pending' OR length(j.input) + (SELECT narration_characters FROM audio_usage WHERE day = ?) <= ?))
          OR (j.kind = 'podcast' AND a.podcast_enabled = 1 AND j.config_hash = ? AND ? = 1 AND (j.phase <> 'pending' OR (SELECT podcasts FROM audio_usage WHERE day = ?) < ?))) ORDER BY j.created_at,j.id LIMIT 1)
          AND NOT EXISTS(SELECT 1 FROM audio_jobs WHERE status = 'running') RETURNING id`, params: [time, narrationHash, settings.narrationEnabled ? 1 : 0, day, settings.dailyNarrationCharacters, podcastHash, settings.podcastEnabled ? 1 : 0, day, settings.dailyPodcasts] },
        { sql: `UPDATE audio_usage SET narration_characters = narration_characters + COALESCE((SELECT length(input) FROM audio_jobs WHERE status = 'running' AND phase = 'pending' AND kind = 'narration' AND updated_at = ?),0),
          podcasts = podcasts + (SELECT count(*) FROM audio_jobs WHERE status = 'running' AND phase = 'pending' AND kind = 'podcast' AND updated_at = ?)
          WHERE day = ? AND changes() > 0`, params: [time, time, day] },
      ])
      return rows[1]?.[0] ? repo.job(String(rows[1][0].id)) : null
    },
    async checkpoint(job: AudioJob, update: { phase?: AudioJob['phase'], providerId?: string, resultUrl?: string, progress?: string }) {
      const assignments: string[] = []
      const params: SqlValue[] = []
      const columns = { phase: 'phase', providerId: 'provider_id', resultUrl: 'result_url', progress: 'progress' } as const
      for (const key of Object.keys(columns) as (keyof typeof columns)[]) {
        if (update[key] !== undefined) {
          assignments.push(`${columns[key]} = ?`)
          params.push(update[key]!)
        }
      }
      params.push(new Date().toISOString(), job.id, job.attempt)
      const rows = await query(`UPDATE audio_jobs SET ${assignments.join(',')},updated_at = ?,version = version + 1 WHERE id = ? AND attempt = ? AND status = 'running' RETURNING id`, params)
      if (!rows.length)
        throw new AdminError(409, '任务执行版本已变化')
    },
    async finish(job: AudioJob, objectKey: string, size: number) {
      await query(`UPDATE audio_jobs SET status = 'succeeded',phase = 'stored',object_key = ?,size = ?,result_url = '',
        publication = CASE WHEN kind = 'narration' AND EXISTS(SELECT 1 FROM audio_articles a WHERE a.path = audio_jobs.path AND a.input_hash = audio_jobs.input_hash AND a.narration_enabled = 1) THEN 'public' ELSE 'review' END,
        updated_at = ?,version = version + 1,message = '' WHERE id = ? AND attempt = ? AND status = 'running'`, [objectKey, size, new Date().toISOString(), job.id, job.attempt])
    },
    async fail(job: AudioJob, status: 'failed' | 'unknown' | 'cancelled', message: string) {
      await query('UPDATE audio_jobs SET status = ?,message = ?,updated_at = ?,version = version + 1 WHERE id = ? AND attempt = ? AND version = ? AND status = \'running\'', [status, message, new Date().toISOString(), job.id, job.attempt, job.version])
    },
    async publish(id: string, version: number, visible: boolean, article: AudioArticle | undefined) {
      const job = await repo.job(id)
      if (visible && (!article || article.inputHash !== job.inputHash || !article[`${job.kind}Enabled`]))
        throw new AdminError(409, '文章已更新或关闭音频，请重新生成并试听')
      const rows = await query(`UPDATE audio_jobs SET publication = ?,version = version + 1 WHERE id = ? AND version = ? AND status = 'succeeded'
        AND (? = 0 OR EXISTS(SELECT 1 FROM audio_articles a WHERE a.path = audio_jobs.path AND a.input_hash = audio_jobs.input_hash AND CASE audio_jobs.kind WHEN 'narration' THEN a.narration_enabled ELSE a.podcast_enabled END = 1)) RETURNING id`, [visible ? 'public' : 'hidden', id, version, Number(visible)])
      if (!rows.length)
        throw new AdminError(409, '音频任务已更新，请刷新后重试')
    },
    async resume(id: string, version: number) {
      const job = await repo.job(id)
      if (!canResumeAudio(job))
        throw new AdminError(409, '任务没有可恢复进度，请先检查原任务')
      const rows = await query('UPDATE audio_jobs SET status = \'queued\',attempt = attempt + 1,version = version + 1,message = \'\' WHERE id = ? AND version = ? AND status IN (\'failed\',\'unknown\') RETURNING id', [id, version])
      if (!rows.length)
        throw new AdminError(409, '任务已更新，请刷新后重试')
    },
    async retry(id: string, version: number, acknowledgeCost: boolean) {
      const job = await repo.job(id)
      if (job.status === 'unknown' && !acknowledgeCost)
        throw new AdminError(409, '此前请求可能已经计费；重新生成前请确认可能产生额外费用')
      const rows = await query('UPDATE audio_jobs SET status = \'queued\',phase = \'pending\',publication = \'private\',attempt = attempt + 1,version = version + 1,provider_id = \'\',result_url = \'\',object_key = \'\',progress = \'\',message = \'\',size = 0 WHERE id = ? AND version = ? AND status IN (\'failed\',\'unknown\') RETURNING id', [id, version])
      if (!rows.length)
        throw new AdminError(409, '任务已更新或不可重试')
    },
  }
  return repo
}
export type AudioRepository = ReturnType<typeof createAudioRepository>
