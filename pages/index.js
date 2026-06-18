import { useState, useEffect, useRef, useCallback } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'

// 관리자 진입 코드 (하드코딩)
const ADMIN_PORTAL_CODE = 'donquixote12'

const C = {
  bg: '#0D0F1A', card: '#1E2235', border: '#2A2F4A',
  accent: '#6C63FF', gold: '#FFD166', goldGlow: 'rgba(255,209,102,0.3)',
  danger: '#EF476F', text: '#E8EAF6', muted: '#7B80A0',
}
const gs = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@400;500;600&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{background:${C.bg};color:${C.text};font-family:'Inter',sans-serif}
  @keyframes spin2{to{transform:rotate(360deg)}}
  @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
  @keyframes winnerPop{0%{transform:scale(0.5);opacity:0}60%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}
  @keyframes marquee{0%{top:-60px}100%{top:110vh}}
  .numBtn:hover{border-color:#6C63FF !important}
`

export default function Home() {
  const router = useRouter()
  const [screen, setScreen] = useState('code')
  const [code, setCode] = useState('')
  const [nick, setNick] = useState('')
  const [pid, setPid] = useState('')
  const [session, setSession] = useState(null)
  const [participants, setParticipants] = useState([])
  const [myNumber, setMyNumber] = useState(null)
  const [countdown, setCountdown] = useState(3)
  const [err, setErr] = useState('')
  const [numErr, setNumErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [winner, setWinner] = useState(null)
  const [spinAngle, setSpinAngle] = useState(0)
  const [showSpin, setShowSpin] = useState(false)

  // 관리자 포탈 관련
  const [showAdminPortal, setShowAdminPortal] = useState(false)
  const [adminCode, setAdminCode] = useState('')
  const [adminCodeErr, setAdminCodeErr] = useState('')

  const pollRef = useRef(null)
  const prevStatus = useRef(null)
  const cdDone = useRef(false)
  const sessionCode = useRef('')
  const spinRAF = useRef(null)
  const spinTriggered = useRef(false)

  function runSpinAnimation(onDone) {
    setShowSpin(true)
    let startTime = null
    const duration = 4000
    const totalRot = 1440
    const step = (now) => {
      if (!startTime) startTime = now
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3)
      setSpinAngle((ease * totalRot) % 360)
      if (progress < 1) {
        spinRAF.current = requestAnimationFrame(step)
      } else {
        if (onDone) onDone()
      }
    }
    cancelAnimationFrame(spinRAF.current)
    spinRAF.current = requestAnimationFrame(step)
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

    if (prev === 'waiting' && st === 'open' && !cdDone.current) {
      cdDone.current = true
      setScreen('countdown')
      let n = 3; setCountdown(n)
      const t = setInterval(() => {
        n--; setCountdown(n)
        if (n <= 0) { clearInterval(t); setScreen('open') }
      }, 1000)
    }

    if (st === 'ended' && (prev === 'open' || prev === 'waiting')) setScreen('ended')

    if (st === 'result' && !spinTriggered.current) {
      spinTriggered.current = true
      const w = p?.find(x => x.number === s.spinner_result)
      setScreen('spinning')
      setWinner(null)
      runSpinAnimation(() => {
        if (w) setWinner(w)
        setScreen('result')
      })
    }

    // closed: about:blank 대신 closed 화면 유지
    if (st === 'closed' && prev !== 'closed') setScreen('closed')

    prevStatus.current = st
  }, [])

  useEffect(() => {
    if (['waiting', 'open', 'done', 'ended', 'spinning', 'result', 'closed'].includes(screen)) {
      poll()
      pollRef.current = setInterval(poll, 500)
    }
    return () => clearInterval(pollRef.current)
  }, [screen])

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
    setNumErr('')
    setMyNumber(num)
    setScreen('done')
    const r = await fetch('/api/participant', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participant_id: pid, session_id: sessionCode.current, number: num })
    })
    const data = await r.json()
    if (!r.ok) {
      setMyNumber(null)
      setScreen('open')
      if (data.error?.includes('이미 선택된')) {
        setNumErr(`${num}번은 방금 다른 분이 선택했습니다. 다른 번호를 골라주세요!`)
      }
      poll()
    }
  }

  // 관리자 포탈 코드 확인
  function tryAdminPortal() {
    if (adminCode === ADMIN_PORTAL_CODE) {
      setShowAdminPortal(false)
      setAdminCode('')
      setAdminCodeErr('')
      router.push('/admin')
    } else {
      setAdminCodeErr('코드가 틀렸습니다.')
    }
  }

  const takenNums = new Set(participants.filter(p => p.number).map(p => p.number))
  const picked = participants.filter(p => p.number)

  return (
    <>
      <Head><title>실시간 추첨기</title></Head>
      <style>{gs}</style>
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 24, position: 'relative', overflow: 'hidden' }}>

        {/* 당첨자 축하 흘러내리는 텍스트 */}
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

        {/* 코드 입력 화면 - 제목/부제 추가 */}
        {screen === 'code' && (
          <Card>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontFamily: 'Syne', fontSize: 30, fontWeight: 800, color: C.accent, letterSpacing: '-0.5px' }}>
                🎰 실시간 추첨기
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: 13, color: C.muted, marginTop: 6 }}>
                주작없는 실시간 추첨
              </div>
            </div>
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
                1~{session.max_num < 999 ? session.max_num : '?'} 중 하나 선택 · 중복 불가
              </div>
              {numErr && (
                <div style={{ marginTop: 10, color: C.danger, fontWeight: 600, fontSize: 14 }}>
                  ⚠️ {numErr}
                </div>
              )}
            </div>

            {/* max_num 설정된 경우: 그리드 / 미설정: 직접 입력 */}
            {session.max_num < 999 ? (
              <NumberGrid max={session.max_num} taken={takenNums} myNum={myNumber}
                onPick={screen === 'open' ? pickNumber : null} />
            ) : (
              <NumberInput onPick={screen === 'open' ? pickNumber : null} myNum={myNumber} />
            )}

            <div style={{ marginTop: 16, color: C.muted, fontSize: 13, textAlign: 'center' }}>
              선택됨: {takenNums.size} / {session.max_num < 999 ? session.max_num : '?'}
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
            <div style={{ marginTop: 20, color: C.gold, fontFamily: 'Syne', fontSize: 16, fontWeight: 700 }}>
              곧 추첨이 시작됩니다! 🎡
            </div>
          </div>
        )}

        {/* 세션 종료 화면 - about:blank 대신 이 화면 유지 */}
        {screen === 'closed' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 60, marginBottom: 20 }}>🎊</div>
            <div style={{ fontFamily: 'Syne', fontSize: 26, fontWeight: 800, color: C.text, marginBottom: 12 }}>
              추첨이 종료되었습니다
            </div>
            {myNumber
              ? <div style={{ color: C.muted, fontSize: 16 }}>내 번호: <span style={{ color: C.gold, fontWeight: 700 }}>#{myNumber}</span></div>
              : <div style={{ color: C.muted, fontSize: 16 }}>번호를 선택하지 못했습니다.</div>}
            <div style={{ color: C.muted, fontSize: 14, marginTop: 16 }}>이용해주셔서 감사합니다. 🙏</div>
          </div>
        )}

        {screen === 'full' && (
          <Card>
            <div style={{ fontSize: 50, textAlign: 'center', marginBottom: 16 }}>😢</div>
            <Title>자리가 다 찼습니다</Title>
            <Sub>다음 기회에!</Sub>
          </Card>
        )}

        {/* 관리자 포탈 버튼 - 우측 하단 고정 */}
        <button
          onClick={() => { setShowAdminPortal(true); setAdminCode(''); setAdminCodeErr('') }}
          style={{
            position: 'fixed', bottom: 16, right: 16,
            background: 'transparent', border: `1px solid ${C.border}`,
            color: C.muted, borderRadius: 8, padding: '6px 12px',
            fontSize: 11, cursor: 'pointer', opacity: 0.35,
            fontFamily: 'Inter',
          }}
        >관리자</button>

        {/* 관리자 코드 입력 모달 */}
        {showAdminPortal && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
              padding: 32, maxWidth: 360, width: '90%', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Syne', fontSize: 20, fontWeight: 800, color: C.accent, marginBottom: 8 }}>
                🔐 관리자 인증
              </div>
              <div style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>관리자 코드를 입력하세요</div>
              <input
                type="password"
                placeholder="코드 입력"
                value={adminCode}
                onChange={e => setAdminCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && tryAdminPortal()}
                style={{
                  width: '100%', background: '#161928', border: `1px solid ${C.border}`,
                  borderRadius: 8, color: C.text, padding: '10px 14px',
                  fontSize: 15, outline: 'none', fontFamily: 'Inter',
                  marginBottom: 12, textAlign: 'center',
                }}
              />
              {adminCodeErr && <div style={{ color: C.danger, fontSize: 13, marginBottom: 10 }}>{adminCodeErr}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowAdminPortal(false)}
                  style={{ flex: 1, background: C.border, color: C.text, border: 'none',
                    borderRadius: 8, padding: '10px', fontFamily: 'Syne', fontWeight: 700,
                    fontSize: 14, cursor: 'pointer' }}>취소</button>
                <button onClick={tryAdminPortal}
                  style={{ flex: 1, background: C.accent, color: '#fff', border: 'none',
                    borderRadius: 8, padding: '10px', fontFamily: 'Syne', fontWeight: 700,
                    fontSize: 14, cursor: 'pointer' }}>확인</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  )
}

// max_num 미설정 시 번호 직접 입력 컴포넌트
function NumberInput({ onPick, myNum }) {
  const [val, setVal] = useState('')
  if (myNum) return (
    <div style={{ textAlign: 'center', fontSize: 80, fontFamily: 'Syne',
      fontWeight: 800, color: '#FFD166', textShadow: '0 0 30px rgba(255,209,102,0.3)' }}>
      ✓ {myNum}번
    </div>
  )
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
      <input type="number" min="1" value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && val && onPick(parseInt(val))}
        placeholder="번호 입력"
        style={{ width: 130, background: '#161928', border: '1px solid #2A2F4A',
          borderRadius: 8, color: '#E8EAF6', padding: '12px 14px', fontSize: 22,
          textAlign: 'center', outline: 'none', fontFamily: 'Syne', fontWeight: 700 }} />
      <button onClick={() => val && onPick(parseInt(val))}
        style={{ background: '#6C63FF', color: '#fff', border: 'none',
          borderRadius: 8, padding: '12px 24px', fontFamily: 'Syne',
          fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>선택</button>
    </div>
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
  if (participants.length === 1) {
    return (
      <svg width={size} height={size} style={{ display: 'block', margin: '0 auto' }}>
        <circle cx={cx} cy={cy} r={r} fill="hsl(260,65%,55%)" stroke="#0D0F1A" strokeWidth={2} />
        <text x={cx} y={cy - 10} textAnchor="middle" dominantBaseline="middle" fontSize={22} fontWeight="700" fill="#fff">{participants[0].number}번</text>
        <text x={cx} y={cy + 16} textAnchor="middle" dominantBaseline="middle" fontSize={13} fill="#fff">{participants[0].nickname}</text>
        <polygon points={`${cx},${cy-r-2} ${cx-9},${cy-r+12} ${cx+9},${cy-r+12}`} fill="#FFD166" />
      </svg>
    )
  }
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
        const tx = cx + r * 0.65 * Math.cos(mid), ty = cy + r * 0.65 * Math.sin(mid)
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

function Card({ children }) { return <div style={{ background: '#1E2235', border: '1px solid #2A2F4A', borderRadius: 16, padding: 32, maxWidth: 420, width: '100%' }}>{children}</div> }
function Title({ children }) { return <div style={{ fontFamily: 'Syne', fontSize: 28, fontWeight: 800, color: '#6C63FF', marginBottom: 8, textAlign: 'center' }}>{children}</div> }
function Sub({ children }) { return <div style={{ color: '#7B80A0', fontSize: 14, marginBottom: 24, textAlign: 'center' }}>{children}</div> }
function Input({ value, onChange, placeholder, onKeyDown, maxLength, center }) {
  return <input value={value} onChange={onChange} placeholder={placeholder} onKeyDown={onKeyDown} maxLength={maxLength}
    style={{ width: '100%', background: '#161928', border: '1px solid #2A2F4A', borderRadius: 8,
      color: '#E8EAF6', padding: '10px 14px', fontSize: 16, outline: 'none', fontFamily: 'Inter',
      marginBottom: 12, textAlign: center ? 'center' : 'left' }} />
}
function Err({ children }) { return <div style={{ color: '#EF476F', fontSize: 13, marginBottom: 10, textAlign: 'center' }}>{children}</div> }
function Btn({ children, onClick, loading, full }) {
  return <button onClick={onClick} disabled={loading} style={{ width: full ? '100%' : 'auto', background: '#6C63FF', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', fontFamily: 'Syne', fontWeight: 700, fontSize: 15, cursor: loading ? 'wait' : 'pointer' }}>{loading ? '...' : children}</button>
}
function Spinner() {
  return <div style={{ width: 48, height: 48, border: '4px solid #2A2F4A', borderTopColor: '#6C63FF', borderRadius: '50%', animation: 'spin2 0.9s linear infinite', margin: '0 auto' }} />
}
