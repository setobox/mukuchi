import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const cwd = fileURLToPath(new URL('../../../', import.meta.url))
const git = (args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim()
assert.equal(git(['status', '--porcelain', '--untracked-files=normal']), '', '请从干净的提交或发布工作区构建并发布')
const ignoredContent = git(['ls-files', '--others', '--ignored', '--exclude-standard', '--', 'content'])
  .split('\n')
  .filter(path => path.endsWith('.md'))
assert.equal(ignoredContent.length, 0, '发布工作区包含被 Git 忽略的 Markdown；请使用干净的 worktree，不能上传本地示例')
console.log('发布工作区检查通过。')
