import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import css from './PaintToolCard.module.css'

interface PaintMeta {
  url?: string
  model?: string
  prompt?: string
}

/** Parse the `[paint-result]` block emitted by the paint tool's render. */
function parsePaintResult(text: string): PaintMeta | null {
  if (!text.includes('[paint-result]')) return null
  const meta: PaintMeta = {}
  const url = /url:\s*(\/api\/dsh-nai-artist\/gallery\/[\w.-]+\.png)/u.exec(text)
  if (url !== null) meta.url = url[1]
  const model = /^model:\s*(.+)$/mu.exec(text)
  if (model !== null) meta.model = model[1].trim()
  const prompt = /^prompt:\s*(.+)$/mu.exec(text)
  if (prompt !== null) meta.prompt = prompt[1].trim()
  return meta
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`
}

export function PaintToolCard({ block }: ToolCallViewProps) {
  if ('kind' in block && block.kind === 'tool-result') {
    const text = block.content
      .filter((content): content is { type: 'text'; text: string } => content.type === 'text')
      .map((content) => content.text)
      .join('\n')
    const meta = parsePaintResult(text)
    if (meta?.url !== undefined) {
      return (
        <figure className={css.card} data-paint-result>
          <img className={css.image} src={meta.url} alt="paint result" />
          <figcaption className={css.caption}>
            {meta.model !== undefined && meta.model !== '' && <span className={css.model}>{meta.model}</span>}
            {meta.prompt !== undefined && meta.prompt !== '' && (
              <span className={css.prompt} title={meta.prompt}>{truncate(meta.prompt, 160)}</span>
            )}
          </figcaption>
        </figure>
      )
    }
    return <div className={`${css.card} ${css.error}`} data-paint-error>{text !== '' ? text : '绘画失败（无结果）'}</div>
  }
  return <div className={`${css.card} ${css.running}`} data-paint-running>🎨 绘画中…</div>
}
