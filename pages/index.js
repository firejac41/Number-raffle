import { useState, useEffect, useRef, useCallback } from 'react'
import Head from 'next/head'

const C = {
  bg: '#0D0F1A', card: '#1E2235', border: '#2A2F4A',
  accent: '#6C63FF', gold: '#FFD166', goldGlow: 'rgba(255,209,102,0.3)',
  danger: '#EF476F', text: '#E8EAF6', muted: '#7B80A0',
  taken: '#2A2F4A', takenText: '#4A4F6A',
}

const gs = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@400;500;600&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{background:${C.bg};color:${C.text};font-family:'Inter',sans-serif}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
  @keyframes winnerPop{0%{transform:scale(0.5);opacity:0}60%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}
  @keyframes marquee{0%{top:-60px}100%{top:110vh}}
  .numBtn:hover{border-color:#6C63FF !important}
`

const SPIN_DURATION = 4000
const TOTAL_ROTATION = 2520

export default function Home() {
  const [screen, setScreen] = useState('code')
  const [code, setCode] = useState('')
  const [nick, setNick] = useState('')
  const [pid, setPid] = useState('')
  const [session, setSession] = useState(null)
  const [participants, setParticipants] = useState([])
  const [myNumber, setMyNumber] = useState(null)
  const [countdown, setCountdown] = useState(3)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [closeCountdown, setCloseCountdown] = useState(5)
  const [winner, setWinner] = useState(null)
  const [spinAngle, setSpinAngle] = useState(0)
  const [isSpinning, setIsSpinning] = useState(false)
  const pollRef = useRef(null)
  const prevStatus = useRef(null)
  const cdDone = useRef(false)
  const sessionCode = useRef('')
  const spinRAF = useRef(null)

  // 서버의 spin_started_at 기준으로 관리자와 완전히 동일한 각도 계산
  function startSpinSync(spinStartedAt, onDone) {
    setIsSpinning(true)
    cancelAnimationFrame(spinRAF.current)
    const serverStart = new Date(spinStartedAt).getTime()

    const animate = (now) => {
      const elapsed = now - serverStart
      const progress = Math.min(elapsed / SPIN_DURATION, 1)
      const ease = 1 - Math.pow(1 - progress, 3)
      setSpinAngle((ease * TOTAL_ROTATION) % 360)
      if (progress < 1) {
        spinRAF.current = requestAnimationFrame(animate)
      } else {
        setIsSpinning(false)
        if (onDone) onDone()
      }
    }
    spinRAF.current = requestAnimationFrame(animate)
  }

  const poll = useCallback(async () => {
    const c = sessionCode.current
    if (!c) return
    const r = await fetch(`/api/session?code=${c}`)
    if (!r.ok) return
    const { session: s, participants: p } = await r.json()
    setSession(s)
    setParticipants(p || [])

    const st = s.status
    const prev = prevStatus.current

    // 대기 → 오픈: 카운트다운
    if (prev === 'waiting' && st === 'open' && !cdDone.current) {
      cdDone.current = true
      setScreen('countdown')
      let n = 3
      setCountdown(n)
      const t = setInterval(() => {
        n--
        setCountdown(n)
        if (n <= 0) { clearInterval(t); setScreen('open') }
      }, 1000)
    }

    // 추첨 시작 - 서버 시각 기준으로 동기화
    if (st === 'spinning' && prev !== 'spinning' && s.spin_started_at) {
      setScreen('spinning')
      setWinner(null)
      startSpinSync(s.spin_started_at)
    }

    // 당첨 결과 - 돌림판 멈추고 당첨자 표시
    if (st === 'result' && prev !== 'result') {
      const w = p?.find(x => x.number === s.spinner_result)
      cancelAnimationFrame(spinRAF.current)
      setScreen('spinning')
      // 이미 spin_started_at 기준으로 맞춰서 돌리다가 끝나면 당첨자 표시
      if (s.spin_started_at) {
        startSpinSync(s.spin_started_at, () => {
          if (w) setWinner(w)
          setScreen('result')
        })
      } else {
        if (w) setWinner(w)
        setScreen('result')
      }
    }

    if (st === 'closed' && prev !== 'closed') setScreen('closing')
    if (st === 'ended' && !['done', 'closing', 'result', 'spinning'].includes(prev)) setScreen('ended')

    prevStatus.current = st
  }, [])

  useEffect(() => {
    if (['waiting', 'open', 'done', 'spinning', 'result', 'ended'].includes(screen)) {
      poll()
      pollRef.current = setInterval(poll, 1500)
    }
    return () => clearInterval(pollRef.current)
  }, [screen])

  useEffect(() => {
    if (screen !== 'closing') return
    let sec = 5
    setCloseCountdown(sec)
    const t = setInterval(() => {
      sec--
      setCloseCountdown(sec)
      if (sec <= 0) { clearInterval(t); window.close() }
    }, 1000)
    return () => clearInterval(t)
  }, [screen])

  useEffect(() => {
    if (!pid || !myNumber) return
    const release = () => navigator.sendBeacon('/api/participant', JSON.stringify({ participant_id: pid }))
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
    sessionCode.current = code.toUpperCase().trim()
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
    prevStatus.current = 'waiting'
    setScreen('waiting')
  }

  async function pickNumber(num) {
    if (myNumber) return
    // 즉시 UI 반응
    setMyNumber(num)
    setScreen('done')
    const r = await fetch('/api/participant', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participant_id: pid, session_id: sessionCode.current, number: num })
    })
    if (!r.ok) {
      // 실패시 롤백
      setMyNumber(null)
      setScreen('open')
      poll()
    }
  }

  const takenNums = new Set(participants.filter(p => p.number).map(p => p.number))
  const picked = participants.filter(p => p.number)

  return (
    <>
      <Head><title>번호뽑기</title></Head>
      <style>{gs}</style>
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 24, position: 'relative', overflow: 'hidden' }}>

        {/* 당첨자 흘러내리는 텍스트 */}
        {screen === 'result' && winner && [...Array(6)].map((_, i) => (
          <div key={i} style={{
            position: 'fixed', left: `${5 + i * 16}%`, top: -60,
            fontFamily: 'Syne', fontWeight: 800, fontSize: 20,
            color: C.gold, textShadow: `0 0 12px ${C.goldGlow}`,
            animation: `marquee ${2.5 + i * 0.4}s linear infinite`,
            animationDelay: `${i * 0.5}s`,
            whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 999,
          }}>🎉 {winner.nickname}님이 당첨되셨습니다!</div>
        ))}

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
            <div style={{ fontFamily: 'Syne', fontSize: 24, color: C.muted, marginBottom: 20 }}>
              추첨번호 뽑기를 시작합니다!
            </div>
            <div style={{ fontFamily: 'Syne', fontSize: 120, fontWeight: 800, color: C.gold,
              textShadow: `0 0 40px ${C.goldGlow}`, lineHeight: 1,
              animation: 'pulse 0.8s ease-in-out infinite' }}>
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
            <NumberGrid max={session.max_num} taken={takenNums} myNum={myNumber}
              onPick={screen === 'open' ? pickNumber : null} />
            <div style={{ marginTop: 16, color: C.muted, fontSize: 13, textAlign: 'center' }}>
              선택됨: {takenNums.size} / {session.max_num}
            </div>
          </div>
        )}

        {screen === 'spinning' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'Syne', fontSize: 24, fontWeight: 800, marginBottom: 24, color: C.text }}>
              🎡 추첨 중...
            </div>
            <SpinWheel participants={picked} angle={spinAngle} />
          </div>
        )}

        {screen === 'result' && winner && (
          <div style={{ textAlign: 'center', animation: 'winnerPop 0.6s ease', zIndex: 10, position: 'relative' }}>
            <div style={{ fontSize: 70, marginBottom: 16 }}>🎉</div>
            <div style={{ fontFamily: 'Syne', fontSize: 32, fontWeight: 800, color: C.gold,
              textShadow: `0 0 20px ${C.goldGlow}` }}>
              {winner.number}번 {winner.nickname}님
            </div>
            <div style={{ fontSize: 24, marginTop: 12, color: C.text }}>당첨을 축하합니다!</div>
          </div>
        )}

        {screen === 'ended' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 50, marginBottom: 16 }}>🔒</div>
            <div style={{ fontFamily: 'Syne', fontSize: 22, fontWeight: 800, color: C.danger }}>
              번호 선택이 종료되었습니다
            </div>
            {myNumber
              ? <div style={{ color: C.muted, marginTop: 12 }}>내 번호: <span style={{ color: C.gold, fontWeight: 700 }}>#{myNumber}</span></div>
              : <div style={{ color: C.muted, marginTop: 12 }}>번호를 선택하지 못했습니다.</div>}
          </div>
        )}

        {screen === 'closing' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'Syne', fontSize: 26, fontWeight: 700, color: C.text, marginBottom: 16 }}>
              {closeCountdown}초 후 추첨세션이 종료됩니다.
            </div>
            <div style={{ color: C.muted, fontSize: 16 }}>이용해주셔서 감사합니다. 🙏</div>
          </div>
        )}

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

function NumberGrid({ max, taken, myNum, onPick }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))', gap: 8 }}>
      {Array.from({ length: max }, (_, i) => i + 1).map(n => {
        const isTaken = taken.has(n)
        const isMe = myNum === n
        return (
          <button key={n} className="numBtn" onClick={() => onPick && !isTaken && onPick(n)} style={{
            padding: '13px 0', fontFamily: 'Syne', fontWeight: 700, fontSize: 17,
            borderRadius: 10, border: `2px solid ${isMe ? '#FFD166' : '#2A2F4A'}`,
            cursor: onPick && !isTaken ? 'pointer' : 'default',
            background: isMe ? '#FFD166' : isTaken ? '#2A2F4A' : '#1E2235',
            color: isMe ? '#0D0F1A' : isTaken ? '#4A4F6A' : '#E8EAF6',
            boxShadow: isMe ? '0 0 12px rgba(255,209,102,0.3)' : 'none',
            transition: 'all 0.1s',
          }}>
            {isMe ? `✓${n}` : isTaken ? '■' : n}
          </button>
        )
      })}
    </div>
  )
}

function SpinWheel({ participants, angle }) {
  const size = 280, cx = size / 2, cy = size / 2, r = cx - 12
  if (participants.length === 0) return null
  const sliceAngle = 360 / participants.length
  return (
    <svg width={size} height={size} style={{ display: 'block', margin: '0 auto' }}>
      {participants.map((p, i) => {
        const start = (i * sliceAngle + angle - 90) * Math.PI / 180
        const end = ((i + 1) * sliceAngle + angle - 90) * Math.PI / 180
        const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start)
        const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end)
        const large = sliceAngle > 180 ? 1 : 0
        const hue = i * 360 / participants.length
        const mid = (start + end) / 2
        const tx = cx + r * 0.65 * Math.cos(mid)
        const ty = cy + r * 0.65 * Math.sin(mid)
        return (
          <g key={p.id}>
            <path d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`}
              fill={`hsl(${hue},65%,55%)`} stroke="#0D0F1A" strokeWidth={1.5} />
            {participants.length <= 30 && (
              <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle"
                fontSize={participants.length > 20 ? 8 : 11} fontWeight="700" fill="#fff"
                transform={`rotate(${(i + 0.5) * sliceAngle + angle},${tx},${ty})`}>
                {p.number}
              </text>
            )}
          </g>
        )
      })}
      <circle cx={cx} cy={cy} r={10} fill="#fff" />
      <polygon points={`${cx},${cy-r-2} ${cx-9},${cy-r+12} ${cx+9},${cy-r+12}`} fill="#FFD166" />
    </svg>
  )
}

function Card({ children }) {
  return <div style={{ background: '#1E2235', border: '1px solid #2A2F4A', borderRadius: 16, padding: 32, maxWidth: 420, width: '100%' }}>{children}</div>
}
function Title({ children }) {
  return <div style={{ fontFamily: 'Syne', fontSize: 28, fontWeight: 800, color: '#6C63FF', marginBottom: 8, textAlign: 'center' }}>{children}</div>
}
function Sub({ children }) {
  return <div style={{ color: '#7B80A0', fontSize: 14, marginBottom: 24, textAlign: 'center' }}>{children}</div>
}
function Input({ value, onChange, placeholder, onKeyDown, maxLength, center }) {
  return <input value={value} onChange={onChange} placeholder={placeholder} onKeyDown={onKeyDown} maxLength={maxLength}
    style={{ width: '100%', background: '#161928', border: '1px solid #2A2F4A', borderRadius: 8,
      color: '#E8EAF6', padding: '10px 14px', fontSize: 16, outline: 'none', fontFamily: 'Inter',
      marginBottom: 12, textAlign: center ? 'center' : 'left' }} />
}
function Err({ children }) {
  return <div style={{ color: '#EF476F', fontSize: 13, marginBottom: 10, textAlign: 'center' }}>{children}</div>
}
function Btn({ children, onClick, loading, full }) {
  return (
    <button onClick={onClick} disabled={loading} style={{
      width: full ? '100%' : 'auto', background: '#6C63FF', color: '#fff', border: 'none',
      borderRadius: 8, padding: '12px 24px', fontFamily: 'Syne', fontWeight: 700, fontSize: 15,
      cursor: loading ? 'wait' : 'pointer',
    }}>{loading ? '...' : children}</button>
  )
}
function Spinner() {
  return <div style={{ width: 48, height: 48, border: '4px solid #2A2F4A', borderTopColor: '#6C63FF',
    borderRadius: '50%', animation: 'spin 0.9s linear infinite', margin: '0 auto' }} />
}
