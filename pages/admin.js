import { useState, useEffect, useRef, useCallback } from 'react'
import Head from 'next/head'

const C = {
  bg: '#0D0F1A', surface: '#161928', card: '#1E2235', border: '#2A2F4A',
  accent: '#6C63FF', gold: '#FFD166', goldGlow: 'rgba(255,209,102,0.3)',
  success: '#06D6A0', danger: '#EF476F', text: '#E8EAF6', muted: '#7B80A0',
}
const gs = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@400;500;600&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{background:${C.bg};color:${C.text};font-family:'Inter',sans-serif}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}
  @keyframes winnerPop{0%{transform:scale(0.5);opacity:0}60%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}
`

export default function Admin() {
  const [screen, setScreen] = useState('login')  // login|dashboard
  const [pw, setPw] = useState('')
  const [pwErr, setPwErr] = useState('')
  const [maxNum, setMaxNum] = useState(30)
  const [session, setSession] = useState(null)
  const [participants, setParticipants] = useState([])
  const [adminPw, setAdminPw] = useState('')
  const [copied, setCopied] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [spinAngle, setSpinAngle] = useState(0)
  const [winner, setWinner] = useState(null)
  const spinRef = useRef(null)
  const pollRef = useRef(null)

  const poll = useCallback(async () => {
    if (!session) return
    const r = await fetch(`/api/session?code=${session.id}`)
    if (!r.ok) return
    const { session: s, participants: p } = await r.json()
    setSession(s)
    setParticipants(p || [])
  }, [session])

  useEffect(() => {
    if (screen === 'dashboard' && session) {
      poll()
      pollRef.current = setInterval(poll, 1500)
    }
    return () => clearInterval(pollRef.current)
  }, [screen, session?.id, poll])

  async function createSession() {
    if (!pw.trim()) return setPwErr('비밀번호를 입력하세요.')
    const r = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_password: pw, max_num: maxNum })
    })
    const { session: s } = await r.json()
    setAdminPw(pw)
    setSession(s)
    setParticipants([])
    setWinner(null)
    setScreen('dashboard')
  }

  async function control(action, extra = {}) {
    await fetch('/api/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: session.id, admin_password: adminPw, action, ...extra })
    })
    await poll()
  }

  async function startSpin() {
    const picked = participants.filter(p => p.number)
    if (picked.length === 0) return
    await control('spin')
    setSpinning(true)
    setWinner(null)

    const totalRotation = 1800 + Math.random() * 720
    const duration = 4000
    const start = performance.now()
    let lastAngle = 0

    const animate = (now) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3)
      const angle = ease * totalRotation
      lastAngle = angle
      setSpinAngle(angle % 360)
      if (progress < 1) { spinRef.current = requestAnimationFrame(animate) }
      else {
        setSpinning(false)
        const finalAngle = lastAngle % 360
        const sliceAngle = 360 / picked.length
        const idx = Math.floor(((360 - finalAngle % 360) % 360) / sliceAngle) % picked.length
        const w = picked[idx]
        setWinner(w)
        control('result', { spinner_result: w.number })
      }
    }
    spinRef.current = requestAnimationFrame(animate)
  }

  function copyLink() {
    const url = `${window.location.origin}?code=${session.id}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const picked = participants.filter(p => p.number)
  const empty = session ? Array.from({ length: session.max_num }, (_, i) => i + 1).filter(n => !picked.find(p => p.number === n)) : []
  const st = session?.status

  return (
    <>
      <Head><title>관리자 | 번호뽑기</title></Head>
      <style>{gs}</style>
      <div style={{ minHeight: '100vh', padding: '32px 20px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>

          {screen === 'login' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
              <div style={card()}>
                <div style={title()}>🔐 관리자 로그인</div>
                <div style={{ color: C.muted, fontSize: 14, marginBottom: 24, textAlign: 'center' }}>
                  이 세션에서만 사용할 비밀번호를 설정하세요
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                  <label style={{ color: C.muted, fontSize: 14, whiteSpace: 'nowrap' }}>번호 범위: 1 ~</label>
                  <input type="number" min={2} max={500} value={maxNum} onChange={e => setMaxNum(Number(e.target.value))}
                    style={inp()} />
                </div>
                <input type="password" placeholder="세션 비밀번호 설정" value={pw}
                  onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && createSession()}
                  style={{ ...inp(), width: '100%', marginBottom: 12, textAlign: 'center' }} />
                {pwErr && <div style={{ color: C.danger, fontSize: 13, marginBottom: 10 }}>{pwErr}</div>}
                <button onClick={createSession} style={btn(C.accent, true)}>새 세션 생성</button>
              </div>
            </div>
          )}

          {screen === 'dashboard' && session && (
            <>
              {/* 헤더 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
                <div>
                  <div style={{ fontFamily: 'Syne', fontSize: 26, fontWeight: 800, color: C.accent }}>🎯 관리자 대시보드</div>
                  <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>세션 코드: <b style={{ color: C.gold }}>{session.id}</b></div>
                </div>
                <StatusBadge status={st} />
              </div>

              {/* 세션 링크 */}
              <div style={{ ...card(), marginBottom: 16 }}>
                <div style={cardTitle()}>🔗 참가자 링크</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, background: C.bg, borderRadius: 8, padding: '10px 14px', fontSize: 13,
                    color: C.muted, border: `1px solid ${C.border}`, wordBreak: 'break-all' }}>
                    {typeof window !== 'undefined' ? `${window.location.origin}?code=${session.id}` : ''}
                  </div>
                  <button onClick={copyLink} style={btn(copied ? C.success : C.accent)}>
                    {copied ? '✓ 복사됨' : '복사'}
                  </button>
                </div>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>
                  또는 초대코드: <b style={{ color: C.gold, fontSize: 16 }}>{session.id}</b> 를 방송에 공유하세요
                </div>
              </div>

              {/* 제어 버튼 */}
              <div style={{ ...card(), marginBottom: 16 }}>
                <div style={cardTitle()}>🎮 제어</div>
                <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                  {st === 'waiting' && (
                    <button onClick={() => control('start')} style={btn(C.success, true)}>▶ 번호뽑기 시작</button>
                  )}
                  {st === 'countdown' && (
                    <button disabled style={{ ...btn(C.muted), cursor: 'wait' }}>카운트다운 중...</button>
                  )}
                  {st === 'open' && (
                    <button onClick={() => control('end')} style={btn(C.danger, true)}>⏹ 번호뽑기 종료</button>
                  )}
                  {(st === 'ended' || st === 'result') && !spinning && (
                    <button onClick={startSpin} style={btn(C.gold, true)}>🎡 추첨 돌림판 시작</button>
                  )}
                  {st !== 'closed' && (
                    <button onClick={() => control('close')} style={btn(C.danger)}>🔒 세션 종료</button>
                  )}
                  <button onClick={() => { setScreen('login'); setSession(null); setPw('') }} style={btn(C.muted)}>
                    새 세션
                  </button>
                </div>
              </div>

              {/* 돌림판 */}
              {(st === 'spinning' || st === 'result') && (
                <div style={{ ...card(), marginBottom: 16, textAlign: 'center' }}>
                  <div style={cardTitle()}>🎡 추첨 돌림판</div>
                  <div style={{ marginTop: 20 }}>
                    <SpinWheel participants={picked} angle={spinAngle} />
                  </div>
                  {winner && (
                    <div style={{ marginTop: 24, animation: 'winnerPop 0.6s ease' }}>
                      <div style={{ fontFamily: 'Syne', fontSize: 28, fontWeight: 800, color: C.gold,
                        textShadow: `0 0 20px ${C.goldGlow}` }}>
                        🎉 {winner.number}번 {winner.nickname}님 당첨!
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 현황판 */}
              <div style={{ ...card(), marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={cardTitle()}>📋 번호 현황 ({picked.length}/{session.max_num})</div>
                  <div style={{ fontSize: 13, color: C.muted }}>빈 자리: {empty.length}개</div>
                </div>
                <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))', gap: 6 }}>
                  {Array.from({ length: session.max_num }, (_, i) => i + 1).map(n => {
                    const p = participants.find(x => x.number === n)
                    return (
                      <div key={n} title={p ? p.nickname : '빈 자리'} style={{
                        padding: '8px 0', borderRadius: 8, textAlign: 'center',
                        background: p ? C.accent + '33' : C.bg,
                        border: `1px solid ${p ? C.accent : C.border}`,
                        fontSize: 13, fontWeight: 700, color: p ? C.accent : C.takenText,
                        cursor: 'default',
                      }}>
                        {p ? `■` : n}
                        {p && <div style={{ fontSize: 9, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px' }}>{p.nickname}</div>}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 참가자 목록 */}
              <div style={card()}>
                <div style={cardTitle()}>👥 참가자 목록 ({picked.length}명 선택완료)</div>
                {picked.length === 0
                  ? <div style={{ color: C.muted, fontSize: 14, marginTop: 16 }}>아직 아무도 선택하지 않았습니다.</div>
                  : <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[...picked].sort((a, b) => a.number - b.number).map(p => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 14px', background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                        <span style={{ fontSize: 14 }}>{p.nickname}</span>
                        <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 18, color: C.gold,
                          textShadow: `0 0 8px ${C.goldGlow}` }}>#{p.number}</span>
                      </div>
                    ))}
                  </div>
                }
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

function SpinWheel({ participants, angle }) {
  const size = 280
  const cx = size / 2, cy = size / 2, r = cx - 12
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
        const hue = (i * 360 / participants.length)
        const mid = (start + end) / 2
        const tx = cx + (r * 0.65) * Math.cos(mid)
        const ty = cy + (r * 0.65) * Math.sin(mid)
        return (
          <g key={p.id}>
            <path d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`}
              fill={`hsl(${hue},65%,55%)`} stroke="#0D0F1A" strokeWidth={1.5} />
            <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle"
              fontSize={participants.length > 20 ? 8 : 11} fontWeight="700" fill="#fff"
              transform={`rotate(${(i + 0.5) * sliceAngle + angle},${tx},${ty})`}>
              {p.number}
            </text>
          </g>
        )
      })}
      <circle cx={cx} cy={cy} r={10} fill="#fff" />
      <polygon points={`${cx},${cy - r - 2} ${cx - 9},${cy - r + 12} ${cx + 9},${cy - r + 12}`}
        fill="#FFD166" />
    </svg>
  )
}

function StatusBadge({ status }) {
  const map = { waiting: ['대기중', C.muted], countdown: ['카운트다운', C.gold], open: ['진행중', C.success], ended: ['종료됨', C.danger], spinning: ['추첨중', C.gold], result: ['당첨발표', C.gold], closed: ['세션종료', C.danger] }
  const [label, color] = map[status] || ['알수없음', C.muted]
  return <span style={{ padding: '4px 12px', borderRadius: 99, background: color + '22', color, fontSize: 12, fontWeight: 700 }}>{label}</span>
}

function card() { return { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 } }
function cardTitle() { return { fontFamily: 'Syne', fontSize: 15, fontWeight: 700, color: C.text } }
function title() { return { fontFamily: 'Syne', fontSize: 24, fontWeight: 800, color: C.accent, textAlign: 'center', marginBottom: 8 } }
function inp() { return { background: '#161928', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'Inter' } }
function btn(bg, big = false) { return { background: bg, color: bg === C.gold ? C.bg : '#fff', border: 'none', borderRadius: 8, padding: big ? '12px 24px' : '8px 16px', fontFamily: 'Syne', fontWeight: 700, fontSize: big ? 15 : 13, cursor: 'pointer' } }
