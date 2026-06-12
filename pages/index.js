import { useState, useEffect, useRef, useCallback } from 'react'
import Head from 'next/head'

const C = {
  bg: '#0D0F1A', surface: '#161928', card: '#1E2235', border: '#2A2F4A',
  accent: '#6C63FF', gold: '#FFD166', goldGlow: 'rgba(255,209,102,0.3)',
  success: '#06D6A0', danger: '#EF476F', text: '#E8EAF6', muted: '#7B80A0',
  taken: '#2A2F4A', takenText: '#4A4F6A',
}

const gs = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@400;500;600&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{background:${C.bg};color:${C.text};font-family:'Inter',sans-serif}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
  @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes winnerPop{0%{transform:scale(0.5);opacity:0}60%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}
`

export default function Home() {
  const [screen, setScreen] = useState('code')   // code|nick|waiting|countdown|open|done|spinning|result|ended|closed|full
  const [code, setCode] = useState('')
  const [nick, setNick] = useState('')
  const [pid, setPid] = useState('')
  const [session, setSession] = useState(null)
  const [participants, setParticipants] = useState([])
  const [myNumber, setMyNumber] = useState(null)
  const [countdown, setCountdown] = useState(3)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const pollRef = useRef(null)
  const prevStatus = useRef(null)
  const cdDone = useRef(false)

  const poll = useCallback(async () => {
    if (!code) return
    const r = await fetch(`/api/session?code=${code}`)
    if (!r.ok) return
    const { session: s, participants: p } = await r.json()
    setSession(s)
    setParticipants(p || [])

    const st = s.status
    const prev = prevStatus.current

    if (prev === 'countdown' && st === 'open' && !cdDone.current) {
      cdDone.current = true
      setCountdown(3)
      setScreen('countdown')
      let c = 3
      const t = setInterval(() => {
        c--
        setCountdown(c)
        if (c <= 0) { clearInterval(t); setScreen('open') }
      }, 1000)
    }
    if (st === 'open' && prev === 'waiting') setScreen('open')
    if (st === 'spinning') setScreen('spinning')
    if (st === 'result') setScreen('result')
    if (st === 'closed') setScreen('closed')
    if (st === 'ended' && screen !== 'done') setScreen('ended')

    prevStatus.current = st
  }, [code, screen])

  useEffect(() => {
    if (['waiting', 'open', 'spinning', 'result'].includes(screen)) {
      poll()
      pollRef.current = setInterval(poll, 1500)
    }
    return () => clearInterval(pollRef.current)
  }, [screen, poll])

  // 네트워크 변경 감지 → 번호 반납
  useEffect(() => {
    if (!pid || !myNumber) return
    const release = () => {
      navigator.sendBeacon('/api/participant', JSON.stringify({ participant_id: pid }))
    }
    window.addEventListener('beforeunload', release)
    return () => window.removeEventListener('beforeunload', release)
  }, [pid, myNumber])

  async function enterCode() {
    setErr(''); setLoading(true)
    const r = await fetch(`/api/session?code=${code.toUpperCase().trim()}`)
    setLoading(false)
    if (!r.ok) return setErr('존재하지 않는 코드입니다.')
    const { session: s } = await r.json()
    if (s.status === 'closed') return setErr('이미 종료된 세션입니다.')
    setSession(s)
    setScreen('nick')
  }

  async function enterNick() {
    setErr(''); setLoading(true)
    const r = await fetch('/api/participant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: code.toUpperCase().trim(), nickname: nick })
    })
    const data = await r.json()
    setLoading(false)
    if (!r.ok) {
      if (data.error?.includes('다 찼')) return setScreen('full')
      return setErr(data.error || '오류 발생')
    }
    setPid(data.participant.id)
    prevStatus.current = session?.status || 'waiting'
    setScreen('waiting')
  }

  async function pickNumber(num) {
    if (myNumber) return
    const r = await fetch('/api/participant', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participant_id: pid, session_id: code.toUpperCase().trim(), number: num })
    })
    if (!r.ok) { poll(); return }
    setMyNumber(num)
    setScreen('done')
  }

  const takenNums = new Set(participants.filter(p => p.number).map(p => p.number))
  const winner = session?.spinner_result
    ? participants.find(p => p.number === session.spinner_result)
    : null

  return (
    <>
      <Head><title>번호뽑기</title></Head>
      <style>{gs}</style>
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>

        {screen === 'code' && (
          <Card>
            <Title>🎰 번호뽑기</Title>
            <Sub>관리자에게 받은 초대코드를 입력하세요</Sub>
            <Input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="예: AB3K9Z" onKeyDown={e => e.key === 'Enter' && enterCode()} maxLength={6} center />
            {err && <Err>{err}</Err>}
            <Btn onClick={enterCode} loading={loading} full>입장하기</Btn>
          </Card>
        )}

        {screen === 'nick' && (
          <Card>
            <Title>👤 닉네임 입력</Title>
            <Sub>방송 채팅 닉네임과 동일하게 입력하세요</Sub>
            <Input value={nick} onChange={e => setNick(e.target.value)}
              placeholder="닉네임 입력..." onKeyDown={e => e.key === 'Enter' && enterNick()} center />
            {err && <Err>{err}</Err>}
            <Btn onClick={enterNick} loading={loading} full>확인</Btn>
          </Card>
        )}

        {screen === 'waiting' && (
          <div style={{ textAlign: 'center' }}>
            <Spinner />
            <div style={{ fontFamily: 'Syne', fontSize: 22, fontWeight: 700, marginTop: 24 }}>대기 중입니다</div>
            <div style={{ color: C.muted, fontSize: 14, marginTop: 8 }}>관리자가 시작을 누르기 전까지 기다려주세요.</div>
            <div style={{ marginTop: 16, fontSize: 12, color: C.border }}>닉네임: {nick}</div>
          </div>
        )}

        {screen === 'countdown' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'Syne', fontSize: 20, color: C.muted, marginBottom: 20 }}>추첨번호 뽑기를 시작합니다!</div>
            <div style={{ fontFamily: 'Syne', fontSize: 120, fontWeight: 800, color: C.gold,
              textShadow: `0 0 40px ${C.goldGlow}`, lineHeight: 1, animation: 'pulse 0.8s ease-in-out infinite' }}>
              {countdown}
            </div>
          </div>
        )}

        {(screen === 'open' || screen === 'done') && session && (
          <div style={{ maxWidth: 720, width: '100%' }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontFamily: 'Syne', fontSize: 24, fontWeight: 800 }}>
                {screen === 'done' ? `✅ ${myNumber}번 선택 완료!` : '번호를 선택하세요!'}
              </div>
              <div style={{ color: C.muted, fontSize: 13, marginTop: 6 }}>
                1~{session.max_num} 중 하나 선택 · 중복 불가
              </div>
            </div>
            <NumberGrid max={session.max_num} taken={takenNums} myNum={myNumber} onPick={screen === 'open' ? pickNumber : null} />
            <div style={{ marginTop: 16, color: C.muted, fontSize: 13, textAlign: 'center' }}>
              선택됨: {takenNums.size} / {session.max_num}
            </div>
          </div>
        )}

        {screen === 'spinning' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'Syne', fontSize: 24, fontWeight: 800, marginBottom: 24 }}>🎡 추첨 중...</div>
            <SpinnerWheel participants={participants} />
          </div>
        )}

        {screen === 'result' && winner && (
          <div style={{ textAlign: 'center', animation: 'winnerPop 0.6s ease' }}>
            <div style={{ fontSize: 60, marginBottom: 16 }}>🎉</div>
            <div style={{ fontFamily: 'Syne', fontSize: 28, fontWeight: 800, color: C.gold,
              textShadow: `0 0 20px ${C.goldGlow}` }}>
              {winner.number}번 {winner.nickname}님
            </div>
            <div style={{ fontSize: 22, marginTop: 12, color: C.text }}>당첨을 축하합니다!</div>
          </div>
        )}

        {screen === 'ended' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 50, marginBottom: 16 }}>🔒</div>
            <div style={{ fontFamily: 'Syne', fontSize: 22, fontWeight: 800, color: C.danger }}>번호 선택이 종료되었습니다</div>
            {myNumber
              ? <div style={{ color: C.muted, marginTop: 12 }}>내 번호: <span style={{ color: C.gold, fontWeight: 700 }}>#{myNumber}</span></div>
              : <div style={{ color: C.muted, marginTop: 12 }}>번호를 선택하지 못했습니다.</div>}
          </div>
        )}

        {screen === 'closed' && <ClosedScreen />}
        {screen === 'full' && (
          <Card>
            <div style={{ fontSize: 50, textAlign: 'center', marginBottom: 16 }}>😢</div>
            <Title>자리가 다 찼습니다</Title>
            <Sub>다음 기회에!</Sub>
          </Card>
        )}
      </div>
    </>
  )
}

function ClosedScreen() {
  const [sec, setSec] = useState(5)
  useEffect(() => {
    const t = setInterval(() => setSec(s => {
      if (s <= 1) { clearInterval(t); window.close(); }
      return s - 1
    }), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'Syne', fontSize: 20, color: C.muted }}>
        {sec}초 후 추첨세션이 종료됩니다.<br />이용해주셔서 감사합니다.
      </div>
    </div>
  )
}

function NumberGrid({ max, taken, myNum, onPick }) {
  const nums = Array.from({ length: max }, (_, i) => i + 1)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))', gap: 8 }}>
      {nums.map(n => {
        const isTaken = taken.has(n)
        const isMe = myNum === n
        return (
          <button key={n} onClick={() => onPick && !isTaken && onPick(n)} style={{
            padding: '13px 0', fontFamily: 'Syne', fontWeight: 700, fontSize: 17,
            borderRadius: 10, border: `2px solid ${isMe ? C.gold : isTaken ? C.border : C.border}`,
            cursor: onPick && !isTaken ? 'pointer' : 'not-allowed',
            background: isMe ? C.gold : isTaken ? C.taken : C.card,
            color: isMe ? C.bg : isTaken ? C.takenText : C.text,
            boxShadow: isMe ? `0 0 12px ${C.goldGlow}` : 'none',
            transition: 'all 0.12s',
            title: isTaken ? '선택됨' : '',
          }}>
            {isMe ? `✓${n}` : isTaken ? '■' : n}
          </button>
        )
      })}
    </div>
  )
}

function SpinnerWheel({ participants }) {
  const picked = participants.filter(p => p.number)
  const [angle, setAngle] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setAngle(a => a + 15), 50)
    return () => clearInterval(t)
  }, [])
  const size = 260
  const cx = size / 2, cy = size / 2, r = cx - 10
  const sliceAngle = picked.length > 0 ? 360 / picked.length : 360
  return (
    <svg width={size} height={size} style={{ display: 'block', margin: '0 auto' }}>
      {picked.map((p, i) => {
        const start = (i * sliceAngle + angle) % 360
        const end = start + sliceAngle
        const s = (a) => ({ x: cx + r * Math.cos(a * Math.PI / 180), y: cy + r * Math.sin(a * Math.PI / 180) })
        const sp = s(start - 90), ep = s(end - 90)
        const large = sliceAngle > 180 ? 1 : 0
        const hue = (i * 360 / picked.length)
        return (
          <g key={p.id}>
            <path d={`M${cx},${cy} L${sp.x},${sp.y} A${r},${r} 0 ${large},1 ${ep.x},${ep.y} Z`}
              fill={`hsl(${hue},70%,55%)`} stroke="#0D0F1A" strokeWidth={1} />
          </g>
        )
      })}
      <circle cx={cx} cy={cy} r={8} fill="#fff" />
      <polygon points={`${cx},${cy - r + 5} ${cx - 8},${cy - r - 10} ${cx + 8},${cy - r - 10}`} fill={C.gold} />
    </svg>
  )
}

function Card({ children }) {
  return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32, maxWidth: 420, width: '100%' }}>{children}</div>
}
function Title({ children }) {
  return <div style={{ fontFamily: 'Syne', fontSize: 28, fontWeight: 800, color: C.accent, marginBottom: 8, textAlign: 'center' }}>{children}</div>
}
function Sub({ children }) {
  return <div style={{ color: C.muted, fontSize: 14, marginBottom: 24, textAlign: 'center' }}>{children}</div>
}
function Input({ value, onChange, placeholder, onKeyDown, maxLength, center }) {
  return <input value={value} onChange={onChange} placeholder={placeholder} onKeyDown={onKeyDown} maxLength={maxLength}
    style={{ width: '100%', background: '#161928', border: `1px solid ${C.border}`, borderRadius: 8,
      color: C.text, padding: '10px 14px', fontSize: 16, outline: 'none', fontFamily: 'Inter',
      marginBottom: 12, textAlign: center ? 'center' : 'left' }} />
}
function Err({ children }) {
  return <div style={{ color: C.danger, fontSize: 13, marginBottom: 10, textAlign: 'center' }}>{children}</div>
}
function Btn({ children, onClick, loading, full }) {
  return (
    <button onClick={onClick} disabled={loading} style={{
      width: full ? '100%' : 'auto', background: C.accent, color: '#fff', border: 'none',
      borderRadius: 8, padding: '12px 24px', fontFamily: 'Syne', fontWeight: 700, fontSize: 15,
      cursor: loading ? 'wait' : 'pointer',
    }}>{loading ? '...' : children}</button>
  )
}
function Spinner() {
  return <div style={{ width: 48, height: 48, border: `4px solid ${C.border}`, borderTopColor: C.accent,
    borderRadius: '50%', animation: 'spin 0.9s linear infinite', margin: '0 auto' }} />
}
