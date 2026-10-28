import { plain } from '../placeNames.js'

export const redact = (text) => String(text).replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]').replace(/(?:\+?84|0)(?:[\s.-]?\d){8,10}/g, '[phone]')

/** Bounded, untrusted context. Never forward account cards or hand-off details. */
export function conversationHistory(messages) {
  if (!Array.isArray(messages)) return []
  return messages.slice(-12).filter((m) => m && !m.account && !m.handedOff && !m.signIn)
    .map((m) => ({ role: m.role ?? (m.from === 'user' ? 'user' : m.from === 'bot' ? 'assistant' : ''), text: m.text ?? m.reply?.text }))
    .filter((m) => ['user', 'assistant'].includes(m.role) && typeof m.text === 'string' && m.text.trim())
    .map((m) => ({ role: m.role, text: redact(m.text).slice(0, 600) }))
}

/** Expand only explicit short references, so a new topic never inherits a booking question. */
export function contextualQuestion(message, history = []) {
  const t = plain(message).replace(/[?!.]+$/g, '').trim()
  if (!/^(?:vay |the |con |so |and )?(?:bao lau|mat bao lau|lam sao|nhu the nao|the nao|o dau|how long|how do i do that|where)(?: (?:thi sao|vay|nhi|a|nhe))?$/.test(t)) return message
  const last = [...conversationHistory(history)].reverse().find((m) => m.role === 'user')
  return last ? `${last.text.replace(/[?!.]+$/g, '')}: ${message}`.slice(0, 600) : message
}

export function repairReply(message, lang = 'vi') {
  if (!/\b(khong dung y|sai roi|khong hieu|may moc|lap lai|tra loi sai|not what i meant|you misunderstood|wrong answer)\b/.test(plain(message))) return null
  return { text: lang === 'vi'
    ? 'Có vẻ mình hiểu lệch ý bạn. Bạn muốn mình sửa phần nào trong câu vừa rồi? Bạn có thể nói ngắn như “mình hỏi tiền ăn thôi” hoặc “mình muốn đổi điểm đến”.'
    : 'I may have misunderstood. Which part should I change? For example, “I only meant food costs” or “I want a different destination”.', links: [] }
}
