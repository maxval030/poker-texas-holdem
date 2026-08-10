import type { Emote } from '@holdem/protocol'
import type { MessageKey } from '../i18n/messages.ts'

/** Classic table glyphs — brass marks on cream, not emoji stickers. */
export const EMOTE_MARK: Record<Emote, string> = {
  'nice-hand': '★',
  thanks: '✓',
  wow: '!',
  thinking: '…',
  chips: '◎',
  oops: '×',
}

export const EMOTE_LABEL_KEY: Record<Emote, MessageKey> = {
  'nice-hand': 'emote.niceHand',
  thanks: 'emote.thanks',
  wow: 'emote.wow',
  thinking: 'emote.thinking',
  chips: 'emote.chips',
  oops: 'emote.oops',
}
