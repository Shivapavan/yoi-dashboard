'use client'

import { useEffect, useRef, useState } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  type?: 'success' | 'error'
  hidden?: boolean
}

function renderText(text: string): React.ReactNode {
  return text.split('\n').map((line, li, arr) => {
    const parts = line.split(/\*\*(.*?)\*\*/g)
    const rendered = parts.map((p, i) =>
      i % 2 === 1 ? <strong key={i}>{p}</strong> : p
    )
    return <span key={li}>{rendered}{li < arr.length - 1 && <br />}</span>
  })
}

function getQuickReplies(lastBotMsg: string): string[] {
  const l = lastBotMsg.toLowerCase()
  if (l.includes('date') || l.includes('when') || l.includes('dine with')) {
    return ['Today', 'Tomorrow', 'This Saturday', 'This Sunday']
  }
  if (l.includes('how many') || l.includes('party') || l.includes('people') || l.includes('guests')) {
    return ['2', '4', '6', '8', '10']
  }
  if (l.includes('time') || l.includes('prefer')) {
    return ['12:00 PM', '6:30 PM', '7:00 PM', '7:30 PM', '8:00 PM']
  }
  return []
}

function getToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
}

function parseConfirm(text: string) {
  const m = text.match(/\{[\s\S]*"action"\s*:\s*"confirm"[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

const DARK_BG   = '#08090a'
const CARD_BG   = 'rgba(255,255,255,0.04)'
const CARD_BORDER = '1px solid rgba(251,146,60,0.18)'
const ORANGE    = '#f97316'
const ORANGE_DIM = 'rgba(249,115,22,0.12)'

const WELCOME = "Welcome to Yum of India! 🙏 I'm here to help you reserve a table. May I start with your name?"

export default function ReservePage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: WELCOME },
  ])
  const [input, setInput]       = useState('')
  const [busy, setBusy]         = useState(false)
  const [booked, setBooked]     = useState(false)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function sendMessage(text: string) {
    if (busy || booked || !text.trim()) return
    const userMsg: Message = { role: 'user', content: text.trim() }
    const history = [...messages, userMsg]
    setMessages(history)
    setInput('')
    if (inputRef.current) { inputRef.current.style.height = 'auto' }
    setBusy(true)

    try {
      const r = await fetch('/api/public/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.filter(m => !m.hidden).map(m => ({ role: m.role, content: m.content })),
          today: getToday(),
        }),
      })
      const data = await r.json()
      if (data.error) throw new Error(data.error)

      const reply: string = data.reply || ''
      const confirm = parseConfirm(reply)

      if (confirm) {
        const dt = new Date(confirm.date + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        })
        const summary = [
          "✅ You're all set!",
          '',
          `📅  ${dt}`,
          `🕐  ${confirm.time}`,
          `👥  Party of ${confirm.party_size}`,
          `👤  ${confirm.name}`,
          `📞  ${confirm.phone}`,
          ...(confirm.notes ? [`📝  ${confirm.notes}`] : []),
          '',
          "We'll call you to confirm. See you soon! 🙏",
        ].join('\n')

        setMessages(prev => [...prev, { role: 'assistant', content: summary, type: 'success' }])
        setBooked(true)

        fetch('/api/public/reservations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: confirm.name, date: confirm.date, time: confirm.time,
            party_size: confirm.party_size, phone: confirm.phone, notes: confirm.notes || null,
          }),
        }).catch(() => {})
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: reply }])
        setTimeout(() => inputRef.current?.focus(), 50)
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Something went wrong. Please call us at (469) 310-4969.',
        type: 'error',
      }])
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const trigger: Message = { role: 'user', content: 'Hello', hidden: true }
    fetch('/api/public/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }], today: getToday() }),
    })
      .then(r => r.json())
      .then(data => {
        const reply = data.reply
        if (reply && reply !== WELCOME) {
          setMessages([trigger, { role: 'assistant', content: reply }])
        } else {
          setMessages(prev => [trigger, ...prev.filter(m => !m.hidden)])
        }
        inputRef.current?.focus()
      })
      .catch(() => {
        setMessages(prev => [trigger, ...prev.filter(m => !m.hidden)])
      })
      .finally(() => setBusy(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visible = messages.filter(m => !m.hidden)
  const lastBot = [...visible].reverse().find(m => m.role === 'assistant')?.content ?? ''
  const chips   = booked || busy ? [] : getQuickReplies(lastBot)

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: DARK_BG, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* ── Orange glow blobs ── */}
      <div className="fixed pointer-events-none" style={{
        bottom: '-120px', left: '-80px', width: '500px', height: '500px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(249,115,22,0.18) 0%, transparent 70%)',
        filter: 'blur(20px)', zIndex: 0,
      }} />
      <div className="fixed pointer-events-none" style={{
        top: '-100px', right: '30%', width: '400px', height: '400px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(249,115,22,0.07) 0%, transparent 70%)',
        filter: 'blur(30px)', zIndex: 0,
      }} />

      {/* ── Left Hero Panel ── */}
      <aside className="hidden lg:flex lg:w-[44%] xl:w-[42%] flex-col relative z-10 overflow-hidden px-10 xl:px-14 py-10"
        style={{ borderRight: '1px solid rgba(251,146,60,0.12)' }}>

        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/yum_logo.png" alt="Yum of India"
          className="w-full object-contain mb-6"
          style={{ maxHeight: '140px', filter: 'drop-shadow(0 0 18px rgba(249,115,22,0.4))' }} />

        {/* Location pill */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: ORANGE }} />
          <span className="text-xs font-bold tracking-[0.25em] uppercase" style={{ color: ORANGE }}>
            McKinney, Texas
          </span>
        </div>

        {/* Big headline */}
        <div className="mb-8">
          <div className="font-black uppercase leading-none text-white"
            style={{ fontSize: 'clamp(52px, 5.5vw, 76px)', letterSpacing: '-0.02em' }}>
            RESERVE
          </div>
          <div className="font-black uppercase leading-none"
            style={{ fontSize: 'clamp(52px, 5.5vw, 76px)', letterSpacing: '-0.02em', color: ORANGE,
              textShadow: `0 0 60px rgba(249,115,22,0.5)` }}>
            YOUR TABLE
          </div>
        </div>

        <p className="text-sm leading-relaxed mb-10" style={{ color: 'rgba(255,255,255,0.45)', maxWidth: '300px' }}>
          Pure · Authentic · Indian. Let our AI assistant secure your spot in seconds.
        </p>

        {/* Info glass cards */}
        <div className="space-y-3 flex-1">
          {[
            {
              icon: '📍',
              label: 'Location',
              value: '1480 S Independence Pkwy, Suite 280\nMcKinney, TX 75072',
            },
            {
              icon: '📞',
              label: 'Phone',
              value: '(469) 310-4969',
            },
            {
              icon: '🕐',
              label: 'Hours',
              value: 'Mon–Thu  10 AM–3 PM & 5–11 PM\nFri  10 AM–3 PM & 5 PM–1 AM\nSat  10 AM–3 PM & 5 PM–12 AM\nSun  10 AM–3 PM & 5–10 PM',
            },
          ].map(({ icon, label, value }) => (
            <div key={label} className="rounded-2xl px-4 py-3.5 flex items-start gap-3"
              style={{ background: CARD_BG, border: CARD_BORDER, backdropFilter: 'blur(8px)' }}>
              <span className="text-lg flex-shrink-0 mt-0.5">{icon}</span>
              <div>
                <div className="text-[10px] uppercase tracking-widest mb-0.5 font-semibold"
                  style={{ color: ORANGE }}>
                  {label}
                </div>
                <div className="text-xs leading-relaxed whitespace-pre-line"
                  style={{ color: 'rgba(255,255,255,0.65)' }}>
                  {value}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Online badge */}
        <div className="mt-8 flex items-center gap-2 self-start rounded-full px-4 py-2"
          style={{ background: CARD_BG, border: CARD_BORDER }}>
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>AI Assistant Online</span>
        </div>
      </aside>

      {/* ── Right Chat Panel ── */}
      <main className="flex-1 flex flex-col relative z-10 min-w-0" style={{ background: 'rgba(0,0,0,0.4)' }}>

        {/* Mobile header */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: '1px solid rgba(251,146,60,0.12)', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/yum_logo.png" alt="Yum of India" className="h-10 w-auto object-contain"
            style={{ filter: 'drop-shadow(0 0 10px rgba(249,115,22,0.4))' }} />
          <div>
            <div className="font-bold text-white text-sm">Reserve a Table</div>
            <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Yum of India · McKinney, TX</div>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#22c55e' }} />
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Online</span>
          </div>
        </div>

        {/* Desktop chat header */}
        <div className="hidden lg:flex items-center justify-between px-8 py-5"
          style={{ borderBottom: '1px solid rgba(251,146,60,0.1)', background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(12px)' }}>
          <div>
            <h2 className="font-bold text-white text-base">Table Reservation</h2>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>AI-powered · Instant confirmation</p>
          </div>
          <div className="flex items-center gap-2 rounded-full px-3 py-1.5"
            style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
            <span className="text-xs font-medium" style={{ color: '#4ade80' }}>Online</span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 lg:px-8 py-6 space-y-4">
          {visible.map((m, i) => {
            if (m.role === 'user') {
              return (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[75%] px-4 py-3 rounded-2xl rounded-br-sm text-sm text-white"
                    style={{
                      background: `linear-gradient(135deg, ${ORANGE}, #ea580c)`,
                      boxShadow: `0 4px 20px rgba(249,115,22,0.3)`,
                    }}>
                    {renderText(m.content)}
                  </div>
                </div>
              )
            }

            const isSuccess = m.type === 'success'
            const isError   = m.type === 'error'

            return (
              <div key={i} className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm"
                  style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)', boxShadow: '0 0 12px rgba(249,115,22,0.2)' }}>
                  🍛
                </div>
                <div className={`max-w-[75%] px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed`}
                  style={
                    isSuccess
                      ? { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#86efac' }
                      : isError
                      ? { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }
                      : { background: CARD_BG, border: CARD_BORDER, color: 'rgba(255,255,255,0.8)' }
                  }>
                  {renderText(m.content)}
                </div>
              </div>
            )
          })}

          {busy && (
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm"
                style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)' }}>
                🍛
              </div>
              <div className="px-4 py-3.5 rounded-2xl rounded-tl-sm" style={{ background: CARD_BG, border: CARD_BORDER }}>
                <div className="flex gap-1.5 items-center">
                  {[0, 0.18, 0.36].map((d, i) => (
                    <div key={i} className="w-2 h-2 rounded-full animate-bounce"
                      style={{ background: ORANGE, animationDelay: `${d}s`, opacity: 0.7 }} />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Quick reply chips */}
        {chips.length > 0 && (
          <div className="px-4 lg:px-8 pb-3 flex gap-2 flex-wrap">
            {chips.map(c => (
              <button key={c} onClick={() => sendMessage(c)}
                className="text-xs px-3.5 py-1.5 rounded-full font-medium transition-all hover:scale-105 active:scale-95"
                style={{ background: ORANGE_DIM, border: `1px solid rgba(249,115,22,0.3)`, color: '#fdba74' }}>
                {c}
              </button>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="px-4 lg:px-8 py-4"
          style={{ borderTop: '1px solid rgba(251,146,60,0.1)', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)' }}>
          <div className="flex gap-3 items-end">
            <textarea
              ref={inputRef}
              className="flex-1 rounded-2xl px-4 py-3 text-sm resize-none outline-none text-white placeholder-white/30 transition-all"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                minHeight: '44px', maxHeight: '120px',
              }}
              rows={1}
              placeholder={booked ? 'Reservation complete 🎉' : 'Type your message…'}
              value={input}
              disabled={busy || booked}
              onChange={e => {
                setInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
              }}
              onFocus={e => { e.target.style.border = `1px solid rgba(249,115,22,0.5)`; e.target.style.boxShadow = `0 0 0 3px rgba(249,115,22,0.08)` }}
              onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none' }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) } }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={busy || booked || !input.trim()}
              className="flex-shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
              style={{ background: `linear-gradient(135deg, ${ORANGE}, #ea580c)`, boxShadow: `0 4px 20px rgba(249,115,22,0.4)` }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
              </svg>
            </button>
          </div>
          <p className="text-center mt-2.5 text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
            Yum of India · McKinney, TX · (469) 310-4969
          </p>
        </div>
      </main>
    </div>
  )
}
