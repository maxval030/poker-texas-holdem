export type Locale = 'en' | 'th'

export type MessageKey =
  | 'brand'
  | 'home.tagline'
  | 'home.solo'
  | 'home.create'
  | 'home.join'
  | 'home.demo'
  | 'home.onlineStats'
  | 'create.title'
  | 'create.subtitle'
  | 'create.name'
  | 'create.smallBlind'
  | 'create.clock'
  | 'create.buyIn'
  | 'create.submit'
  | 'create.creating'
  | 'create.tooManyOpen'
  | 'join.title'
  | 'join.subtitle'
  | 'join.name'
  | 'join.code'
  | 'join.codeError'
  | 'join.submit'
  | 'join.joining'
  | 'name.tooShort'
  | 'name.tooLong'
  | 'name.placeholder'
  | 'name.hint'
  | 'name.gateTitle'
  | 'name.gateSubtitle'
  | 'name.continue'
  | 'table.blinds'
  | 'table.pot'
  | 'table.sit'
  | 'table.emote'
  | 'table.connecting'
  | 'table.waitHand'
  | 'table.waitTurn'
  | 'table.fold'
  | 'table.check'
  | 'table.call'
  | 'table.callAllIn'
  | 'table.bet'
  | 'table.raise'
  | 'table.raiseTo'
  | 'table.halfPot'
  | 'table.potPreset'
  | 'table.allIn'
  | 'table.allInBadge'
  | 'table.folded'
  | 'table.sittingOut'
  | 'table.away'
  | 'table.dealer'
  | 'table.addBot'
  | 'table.deal'
  | 'table.closeTable'
  | 'table.closeConfirm'
  | 'closing.session'
  | 'closing.idle'
  | 'closing.dormant'
  | 'status.connecting'
  | 'status.open'
  | 'status.reconnecting'
  | 'status.closed'
  | 'emote.niceHand'
  | 'emote.thanks'
  | 'emote.wow'
  | 'emote.thinking'
  | 'emote.chips'
  | 'emote.oops'
  | 'result.winner'
  | 'result.splitWinners'
  | 'result.youWin'
  | 'result.show'
  | 'result.muck'
  | 'hand.straightFlush'
  | 'hand.fourOfAKind'
  | 'hand.fullHouse'
  | 'hand.flush'
  | 'hand.straight'
  | 'hand.threeOfAKind'
  | 'hand.twoPair'
  | 'hand.onePair'
  | 'hand.highCard'
  | 'assist.madeHand'
  | 'assist.handChart'
  | 'assist.close'
  | 'solo.subtitle'
  | 'solo.opponents'
  | 'solo.difficulty'
  | 'solo.diff.easy'
  | 'solo.diff.normal'
  | 'solo.diff.hard'
  | 'solo.buyIn'
  | 'solo.buyInAmount'
  | 'solo.start'
  | 'seconds'

const en = {
  brand: "Texas Hold'em",
  'home.tagline': 'Play money. Private tables. No download.',
  'home.solo': 'Play against bots',
  'home.create': 'Create a private table',
  'home.join': 'Join with a code',
  'home.demo': 'Layout preview',
  'home.onlineStats': '{rooms} tables live · {players} players online',
  'create.title': 'Create a private table',
  'create.subtitle': 'Friends join with the code. No public lobby.',
  'create.name': 'Display name',
  'create.smallBlind': 'Small blind',
  'create.clock': 'Action clock',
  'create.buyIn': 'Buy-in {min} – {max} · unlimited rebuy',
  'create.submit': 'Create table',
  'create.creating': 'Creating…',
  'create.tooManyOpen': 'You already have the maximum number of open tables. Close one to create another.',
  'join.title': 'Join a table',
  'join.subtitle': 'Enter the code a friend sent you.',
  'join.name': 'Display name',
  'join.code': 'Invite code',
  'join.codeError': 'Enter the invite code',
  'join.submit': 'Join table',
  'join.joining': 'Joining…',
  'name.tooShort': 'Name must be at least 3 characters',
  'name.tooLong': 'Name must be at most 20 characters',
  'name.placeholder': 'Your name',
  'name.hint': 'A short random tag is added so names stay unique',
  'name.gateTitle': 'Choose a display name',
  'name.gateSubtitle': 'Before you join room {code}',
  'name.continue': 'Continue to table',
  'table.blinds': 'Blinds {sb} / {bb}',
  'table.pot': 'Pot {amount}',
  'table.sit': 'Sit here',
  'table.emote': 'Emote',
  'table.connecting': 'Connecting…',
  'table.waitHand': 'Waiting for the next hand',
  'table.waitTurn': 'Waiting for your turn',
  'table.fold': 'Fold',
  'table.check': 'Check',
  'table.call': 'Call {amount}',
  'table.callAllIn': 'Call all in {amount}',
  'table.bet': 'Bet',
  'table.raise': 'Raise',
  'table.raiseTo': '{kind} {amount}',
  'table.halfPot': '½ pot',
  'table.potPreset': 'Pot',
  'table.allIn': 'All in',
  'table.allInBadge': 'ALL IN',
  'table.folded': 'FOLD',
  'table.sittingOut': 'SITTING OUT',
  'table.away': 'AWAY',
  'table.dealer': 'dealer button',
  'table.addBot': 'Add bot',
  'table.deal': 'Deal',
  'table.closeTable': 'Close table',
  'table.closeConfirm': 'Close this table for everyone? This cannot be undone.',
  'closing.session': 'Session ends in {time} — this table will close',
  'closing.idle': 'No activity — table closes in {time}. Make a move to stay.',
  'closing.dormant': 'No one connected — table closes in {time}',
  'status.connecting': 'connecting',
  'status.open': 'open',
  'status.reconnecting': 'reconnecting',
  'status.closed': 'closed',
  'emote.niceHand': 'Nice hand',
  'emote.thanks': 'Thanks',
  'emote.wow': 'Wow',
  'emote.thinking': 'Thinking',
  'emote.chips': 'Chips',
  'emote.oops': 'Oops',
  'result.winner': '{name} wins',
  'result.splitWinners': '{names} split',
  'result.youWin': 'You win',
  'result.show': 'Show',
  'result.muck': 'Muck',
  'hand.straightFlush': 'Straight flush',
  'hand.fourOfAKind': 'Four of a kind',
  'hand.fullHouse': 'Full house',
  'hand.flush': 'Flush',
  'hand.straight': 'Straight',
  'hand.threeOfAKind': 'Three of a kind',
  'hand.twoPair': 'Two pair',
  'hand.onePair': 'One pair',
  'hand.highCard': 'High card',
  'assist.madeHand': 'Hand help',
  'assist.handChart': 'Hand chart',
  'assist.close': 'Close',
  'solo.subtitle': 'Everything runs on this device. Nothing is sent anywhere.',
  'solo.opponents': 'Opponents: {n}',
  'solo.difficulty': 'Difficulty',
  'solo.diff.easy': 'Easy',
  'solo.diff.normal': 'Normal',
  'solo.diff.hard': 'Hard',
  'solo.buyIn': 'Buy-in {min} – {max}',
  'solo.buyInAmount': 'Buy-in amount',
  'solo.start': 'Sit down with {amount} chips',
  seconds: '{n} seconds',
} as const satisfies Record<MessageKey, string>

const th: Record<MessageKey, string> = {
  brand: 'เท็กซัสโฮลเอ็ม',
  'home.tagline': 'เงินสมมติ · โต๊ะส่วนตัว · ไม่ต้องโหลดแอป',
  'home.solo': 'เล่นกับบอท',
  'home.create': 'สร้างโต๊ะส่วนตัว',
  'home.join': 'เข้าด้วยรหัส',
  'home.demo': 'ดูเลย์เอาต์',
  'home.onlineStats': '{rooms} โต๊ะเล่น · {players} คนออนไลน์',
  'create.title': 'สร้างโต๊ะส่วนตัว',
  'create.subtitle': 'เพื่อนเข้าด้วยรหัส ไม่มีล็อบบี้สาธารณะ',
  'create.name': 'ชื่อที่แสดง',
  'create.smallBlind': 'บลายด์เล็ก',
  'create.clock': 'นาฬิกาแอ็กชัน',
  'create.buyIn': 'บายอิน {min} – {max} · รีบายไม่จำกัด',
  'create.submit': 'สร้างโต๊ะ',
  'create.creating': 'กำลังสร้าง…',
  'create.tooManyOpen': 'คุณมีโต๊ะที่เปิดอยู่ครบแล้ว ปิดโต๊ะเดิมก่อนสร้างใหม่',
  'join.title': 'เข้าร่วมโต๊ะ',
  'join.subtitle': 'ใส่รหัสที่เพื่อนส่งมา',
  'join.name': 'ชื่อที่แสดง',
  'join.code': 'รหัสเชิญ',
  'join.codeError': 'ใส่รหัสเชิญ',
  'join.submit': 'เข้าโต๊ะ',
  'join.joining': 'กำลังเข้า…',
  'name.tooShort': 'ชื่อต้องมีอย่างน้อย 3 ตัวอักษร',
  'name.tooLong': 'ชื่อยาวได้ไม่เกิน 20 ตัวอักษร',
  'name.placeholder': 'ชื่อของคุณ',
  'name.hint': 'ระบบจะเติมแท็กสั้น ๆ ท้ายชื่อให้อัตโนมัติ',
  'name.gateTitle': 'ตั้งชื่อที่แสดง',
  'name.gateSubtitle': 'ก่อนเข้าห้อง {code}',
  'name.continue': 'ไปที่โต๊ะ',
  'table.blinds': 'บลายด์ {sb} / {bb}',
  'table.pot': 'พอต {amount}',
  'table.sit': 'นั่งที่นี่',
  'table.emote': 'อีโมต',
  'table.connecting': 'กำลังเชื่อมต่อ…',
  'table.waitHand': 'รอมือถัดไป',
  'table.waitTurn': 'รอตาของคุณ',
  'table.fold': 'โฟลด์',
  'table.check': 'เช็ค',
  'table.call': 'คอล {amount}',
  'table.callAllIn': 'คอลออลอิน {amount}',
  'table.bet': 'เบท',
  'table.raise': 'เรส',
  'table.raiseTo': '{kind} {amount}',
  'table.halfPot': '½ พอต',
  'table.potPreset': 'พอต',
  'table.allIn': 'ออลอิน',
  'table.allInBadge': 'ออลอิน',
  'table.folded': 'โฟลด์',
  'table.sittingOut': 'พักเล่น',
  'table.away': 'ไม่อยู่',
  'table.dealer': 'ปุ่มดีลเลอร์',
  'table.addBot': 'เพิ่มบอท',
  'table.deal': 'แจกไพ่',
  'table.closeTable': 'ปิดโต๊ะ',
  'table.closeConfirm': 'ปิดโต๊ะนี้สำหรับทุกคน? ทำแล้วย้อนกลับไม่ได้',
  'closing.session': 'เซสชันจบใน {time} — โต๊ะจะปิด',
  'closing.idle': 'ไม่มีการเล่น — โต๊ะจะปิดใน {time} เล่นต่อเพื่ออยู่ต่อ',
  'closing.dormant': 'ไม่มีใครเชื่อมต่อ — โต๊ะจะปิดใน {time}',
  'status.connecting': 'กำลังเชื่อม',
  'status.open': 'พร้อม',
  'status.reconnecting': 'เชื่อมใหม่',
  'status.closed': 'ปิด',
  'emote.niceHand': 'มือสวย',
  'emote.thanks': 'ขอบคุณ',
  'emote.wow': 'ว้าว',
  'emote.thinking': 'คิดอยู่',
  'emote.chips': 'ชิป',
  'emote.oops': 'อุ๊ย',
  'result.winner': '{name} ชนะ',
  'result.splitWinners': '{names} แบ่งพอต',
  'result.youWin': 'คุณชนะ',
  'result.show': 'โชว์',
  'result.muck': 'ไม่โชว์',
  'hand.straightFlush': 'สเตรทฟลัช',
  'hand.fourOfAKind': 'โฟร์ออฟอะไคนด์',
  'hand.fullHouse': 'ฟูลเฮาส์',
  'hand.flush': 'ฟลัช',
  'hand.straight': 'สเตรท',
  'hand.threeOfAKind': 'ทรีออฟอะไคนด์',
  'hand.twoPair': 'ทูแพร์',
  'hand.onePair': 'วันแพร์',
  'hand.highCard': 'ไฮการ์ด',
  'assist.madeHand': 'ช่วยอ่านมือ',
  'assist.handChart': 'ตารางมือ',
  'assist.close': 'ปิด',
  'solo.subtitle': 'เล่นบนเครื่องนี้ทั้งหมด ไม่ส่งข้อมูลไปไหน',
  'solo.opponents': 'คู่แข่ง: {n}',
  'solo.difficulty': 'ระดับความยาก',
  'solo.diff.easy': 'ง่าย',
  'solo.diff.normal': 'ปกติ',
  'solo.diff.hard': 'ยาก',
  'solo.buyIn': 'บายอิน {min} – {max}',
  'solo.buyInAmount': 'จำนวนบายอิน',
  'solo.start': 'นั่งด้วย {amount} ชิป',
  seconds: '{n} วินาที',
}

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { en, th }

export function formatMessage(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  let text = MESSAGES[locale][key] ?? MESSAGES.en[key] ?? key
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
  }
  return text
}
