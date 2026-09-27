import { useState } from 'react'
import css from './PaintEntryButton.module.css'

/** Quick entry for the NAI Artist workbench: a button that opens the WebUI in a side drawer. */
export function PaintEntryButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        className={css.button}
        type="button"
        title="打开 NAI 绘画工作台"
        aria-label="打开 NAI 绘画工作台"
        onClick={() => setOpen(true)}
      >
        🎨
      </button>
      {open && (
        <div className={css.overlay} onClick={() => setOpen(false)}>
          <div className={css.drawer} role="dialog" aria-label="NAI 绘画工作台" onClick={(event) => event.stopPropagation()}>
            <div className={css.bar}>
              <span className={css.title}>NAI 绘画工作台</span>
              <button className={css.close} type="button" onClick={() => setOpen(false)} aria-label="关闭">✕</button>
            </div>
            <iframe className={css.frame} src="/nai-artist" title="NAI Artist" />
          </div>
        </div>
      )}
    </>
  )
}
