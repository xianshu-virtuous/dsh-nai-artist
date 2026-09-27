import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the `conversation.input.right` slot declaration.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls ui-tool's `tool.call.toolview` slot declaration.
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import { PaintToolCard } from './PaintToolCard.tsx'
import { PaintEntryButton } from './PaintEntryButton.tsx'

export const inject = ['slots', 'conversation']

export function apply(ctx: ClientContext): void {
  // In-conversation image card for the paint tool (sticker-style rendering).
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
    { name: 'tool.call.toolview', key: 'paint' }, PaintToolCard,
  ))
  // Quick entry button next to the input box, opening the WebUI drawer.
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register(
    { name: 'conversation.input.right', id: 'nai-artist-entry', order: 20 }, PaintEntryButton,
  ))
}
