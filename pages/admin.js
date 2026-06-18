import { useState, useEffect, useRef, useCallback } from 'react'
import Head from 'next/head'

const C = {
  bg: '#0D0F1A', card: '#1E2235', border: '#2A2F4A',
  accent: '#6C63FF', gold: '#FFD166', goldGlow: 'rgba(255,209,102,0.3)',
  success: '#06D6A0', danger: '#EF476F', text: '#E8EAF6', muted: '#7B80A0',
}
const gs = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@400;500;600&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{background:${C.bg};color:${C.text};font-family:'Inter',sans-serif}
  @keyframes spin2{to{transform:rotate(360deg)}}
  @keyframes winnerPop{0%{transform:scale(0.5);opacity:0}60%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}
`

export default function Admin() {
  const [screen, setScreen] = useState('login')
  const [pw, setPw] = useState('')
  const [pwErr, setPwErr] = useState('')
  const [session, setSession] = useState(null)
  const [participants, setParticipants] = useState([])
  const [adminPw, setAdminPw] = useState('')
  const [copied, setCopied] = useState(false)
  const [spinAngle, setSpinAngle] = useState(0)
  const [winner, setWinner] = useState(null)
  const [isSpinning, setIsSpinning] = useState(false)
  const [showSpin, setShowSpin] = useState(false)
  const [editMaxNum, setEditMaxNum] = useState('')
  const [kickTarget, setKickTarget] = useState(null)  // { id, nickname }
  const [kickReason, setKickReason] = useState('')
  const pollRef = useRef(null)
  const spinRAF = useRef(null)
  const sessionIdRef = useRef('')
  const adminPwRef = useRef('')

  function runSpinAnimation(onDone) {
    setIsSpinning(true)
    setShowSpin(true)
    let startTime = null
    const duration = 4000
    const totalRot = 1440 + Math.random() * 360
    const step = (now) => {
      if (!startTime) startTime = now
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3)
      setSpinAngle((ease * totalRot) % 360)
      if (progress < 1) {
        spinRAF.current = requestAnimationFrame(step)
      } else {
        setIsSpinning(false)
        if (onDone) onDone()
      }
    }
    cancelAnimationFrame(spinRAF.current)
    spinRAF.current = requestAnimationFrame(step)
  }

  const poll = useCallback(async () => {
    const code = sessionIdRef.current
    if (!code) return
    const r = await fetch(`/api/session?code=${code}`)
    if (!r.ok) return
    const { session: s, participants: p } = await r.json()
    setSession(s)
    setParticipants(p || [])
  }, [])

  useEffect(() => {
    if (screen === 'dashboard') {
      poll()
      pollRef.current = setInterval(poll, 1500)
    }
    return () => clearInterval(pollRef.current)
  }, [screen])

  async function createSession() {
    if (!pw.trim()) return setPwErr('비밀번호를 입력하세요.')
    const r = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_password: pw, max_num: 999 })
    })
    const { session: s } = await r.json()
    adminPwRef.current = pw
    sessionIdRef.current = s.id
    setAdminPw(pw)
    setSession(s)
    setParticipants([])
    setWinner(null)
    setShowSpin(false)
    setScreen('dashboard')
  }

  async function updateMaxNum(newMax) {
    if (!newMax || newMax < 1) return
    await fetch('/api/session', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: sessionIdRef.current, admin_password: adminPwRef.current, max_num: parseInt(newMax) })
    })
    await poll()
  }

  async function control(action, extra = {}) {
    await fetch('/api/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: sessionIdRef.current, admin_password: adminPwRef.current, action, ...extra })
    })
    await poll()
  }

  async function startSpin() {
    const picked = participants.filter(p => p.number)
    if (picked.length === 0) return alert('번호를 선택한 참가자가 없습니다.')

    // ✅ 서버에 spin 요청 → 서버가 당첨자 결정 (관리자 조작 불가)
    await control('spin')

    // 서버가 결정한 결과 가져오기
    const r = await fetch(`/api/session?code=${sessionIdRef.current}`)
    const { session: s, participants: p } = await r.json()
    setSession(s)
    setParticipants(p || [])
    const w = p.find(x => x.number === s.spinner_result)

    setWinner(null)
    // 애니메이션 실행 후 당첨자 발표
    runSpinAnimation(async () => {
      setWinner(w)
      // 상태를 result로 변경 (참가자 화면에도 결과 표시)
      await control('result')
    })
  }

  function copyLink() {
    const url = `${window.location.origin}/?code=${sessionIdRef.current}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // 강퇴 모달 열기
  function openKickModal(p) {
    setKickTarget({ id: p.id, nickname: p.nickname })
    setKickReason('')
  }

  // 강퇴 실행
  async function confirmKick() {
    if (!kickTarget) return
    await fetch('/api/participant', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participant_id: kickTarget.id,
        kick: true,
        kick_reason: kickReason.trim() || '관리자에 의해 강퇴되었습니다.'
      })
    })
    setKickTarget(null)
    setKickReason('')
    await poll()
  }

  const picked = participants.filter(p => p.number)
  const st = session?.status

  return (
    <>
      <Head><title>관리자 | 실시간 추첨기</title></Head>
      <style>{gs}</style>
      <div style={{ minHeight: '100vh', padding: '32px 20px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>

          {screen === 'login' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
              <div style={card()}>
                {/* 제목 */}
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                  <div style={{ fontFamily: 'Syne', fontSize: 26, fontWeight: 800, color: C.accent }}>
                    🎰 실시간 추첨기
                  </div>
                  <div style={{ fontFamily: 'Inter', fontSize: 12, color: C.muted, marginTop: 4 }}>
                    주작없는 실시간 추첨
                  </div>
                </div>
                <div style={{ fontFamily: 'Syne', fontSize: 18, fontWeight: 700, color: C.text, textAlign: 'center', marginBottom: 6 }}>
                  🔐 관리자 로그인
                </div>
                <div style={{ color: C.muted, fontSize: 14, marginBottom: 24, textAlign: 'center' }}>
                  세션 비밀번호를 설정하고 시작하세요
                </div>
                <input type="password" placeholder="세션 비밀번호 설정" value={pw}
                  onChange={e => setPw(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createSession()}
                  style={{ ...inp(), width: '100%', marginBottom: 12, textAlign: 'center' }} />
                {pwErr && <div style={{ color: C.danger, fontSize: 13, marginBottom: 10 }}>{pwErr}</div>}
                <button onClick={createSession} style={btn(C.accent, true)}>새 세션 생성</button>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 12, textAlign: 'center' }}>
                  * 최대 번호는 참가자 현황 보고 나중에 설정 가능합니다
                </div>
              </div>
            </div>
          )}

          {screen === 'dashboard' && session && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
                <div>
                  <div style={{ fontFamily: 'Syne', fontSize: 26, fontWeight: 800, color: C.accent }}>🎯 관리자 대시보드</div>
                  <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>세션 코드: <b style={{ color: C.gold }}>{session.id}</b></div>
                </div>
                <StatusBadge status={st} />
              </div>

              {/* 링크 */}
              <div style={{ ...card(), marginBottom: 16 }}>
                <div style={cardTitle()}>🔗 참가자 링크</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, background: C.bg, borderRadius: 8, padding: '10px 14px',
                    fontSize: 13, color: C.muted, border: `1px solid ${C.border}`, wordBreak: 'break-all' }}>
                    {typeof window !== 'undefined' ? `${window.location.origin}/?code=${session.id}` : ''}
                  </div>
                  <button onClick={copyLink} style={btn(copied ? C.success : C.accent)}>
                    {copied ? '✓ 복사됨' : '복사'}
                  </button>
                </div>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>
                  초대코드: <b style={{ color: C.gold, fontSize: 16 }}>{session.id}</b>
                </div>
              </div>

              {/* 최대 번호 설정 */}
              <div style={{ ...card(), marginBottom: 16 }}>
                <div style={cardTitle()}>⚙️ 번호 범위 설정</div>
                <div style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>
                  현재 접속자: <b style={{ color: C.text }}>{participants.length}명</b>
                  {session.max_num < 999 && <span> · 현재 최대: <b style={{ color: C.gold }}>{session.max_num}번</b></span>}
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                  <input type="number" min={1} max={999}
                    placeholder={session.max_num < 999 ? String(session.max_num) : '최대 번호 입력'}
                    value={editMaxNum} onChange={e => setEditMaxNum(e.target.value)}
                    style={{ ...inp(), width: 160 }} />
                  <button onClick={() => { updateMaxNum(editMaxNum); setEditMaxNum('') }}
                    style={btn(C.accent)}>설정</button>
                </div>
              </div>

              {/* 제어 */}
              <div style={{ ...card(), marginBottom: 16 }}>
                <div style={cardTitle()}>🎮 제어</div>
                <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                  {st === 'waiting' && (
                    <button onClick={() => control('start')} style={btn(C.success, true)}>▶ 번호뽑기 시작</button>
                  )}
                  {st === 'open' && (
                    <button onClick={() => control('end')} style={btn(C.danger, true)}>⏹ 번호뽑기 종료</button>
                  )}
                  {(st === 'ended' || st === 'result') && !isSpinning && (
                    <button onClick={startSpin} style={btn(C.gold, true)}>🎡 추첨 돌림판 시작</button>
                  )}
                  {st !== 'closed' && (
                    <button onClick={() => control('close')} style={btn(C.danger)}>🔒 세션 종료</button>
                  )}
                  <button onClick={() => {
                    clearInterval(pollRef.current)
                    sessionIdRef.current = ''
                    adminPwRef.current = ''
                    setSession(null)
                    setPw('')
                    setScreen('login')
                  }} style={btn(C.muted)}>새 세션</button>
                </div>
              </div>

              {/* 돌림판 */}
              {showSpin && (
                <div style={{ ...card(), marginBottom: 16, textAlign: 'center' }}>
                  <div style={cardTitle()}>🎡 추첨 돌림판</div>
                  <div style={{ marginTop: 20 }}>
                    <SpinWheel participants={picked} angle={spinAngle} />
                  </div>
                  {winner && !isSpinning && (
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
                  <div style={cardTitle()}>📋 번호 현황 ({picked.length} / {session.max_num < 999 ? session.max_num : '미설정'})</div>
                  <div style={{ fontSize: 13, color: C.muted }}>빈 자리: {session.max_num < 999 ? session.max_num - picked.length : '-'}개</div>
                </div>
                {session.max_num < 999 ? (
                  <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))', gap: 6 }}>
                    {Array.from({ length: session.max_num }, (_, i) => i + 1).map(n => {
                      const p = participants.find(x => x.number === n)
                      return (
                        <div key={n} title={p ? p.nickname : '빈 자리'} style={{
                          padding: '8px 4px', borderRadius: 8, textAlign: 'center',
                          background: p ? C.accent + '33' : C.bg,
                          border: `1px solid ${p ? C.accent : C.border}`,
                          fontSize: 12, fontWeight: 700, color: p ? C.accent : C.muted,
                        }}>
                          {p ? '■' : n}
                          {p && <div style={{ fontSize: 9, color: C.muted, overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px' }}>
                            {p.nickname}
                          </div>}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ color: C.muted, fontSize: 13, marginTop: 12 }}>번호 범위를 설정하면 현황판이 표시됩니다.</div>
                )}
              </div>

              {/* 참가자 목록 + 강퇴 버튼 */}
              <div style={card()}>
                <div style={cardTitle()}>👥 참가자 목록 ({picked.length}명 선택 / 전체 {participants.length}명 접속)</div>
                {participants.length === 0
                  ? <div style={{ color: C.muted, fontSize: 14, marginTop: 16 }}>아직 아무도 입장하지 않았습니다.</div>
                  : <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[...participants].sort((a, b) => (a.number || 9999) - (b.number || 9999)).map(p => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', padding: '10px 14px', background: C.bg,
                        borderRadius: 8, border: `1px solid ${C.border}` }}>
                        <span style={{ fontSize: 14 }}>{p.nickname}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {p.number
                            ? <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 18,
                                color: C.gold, textShadow: `0 0 8px ${C.goldGlow}` }}>#{p.number}</span>
                            : <span style={{ fontSize: 12, color: C.muted }}>미선택</span>
                          }
                          {/* 강퇴 버튼 - 세션이 열려있을 때만 표시 */}
                          {(st === 'waiting' || st === 'open') && (
                            <button
                              onClick={() => openKickModal(p)}
                              style={{ background: C.danger + '22', color: C.danger, border: `1px solid ${C.danger}44`,
                                borderRadius: 6, padding: '3px 8px', fontSize: 11,
                                cursor: 'pointer', fontFamily: 'Inter' }}>
                              강퇴
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                }
              </div>

              {/* 강퇴 사유 입력 모달 */}
              {kickTarget && (
                <div style={{
                  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
                    padding: 32, maxWidth: 380, width: '90%', textAlign: 'center' }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>🚫</div>
                    <div style={{ fontFamily: 'Syne', fontSize: 18, fontWeight: 800, color: C.danger, marginBottom: 6 }}>
                      강퇴 확인
                    </div>
                    <div style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>
                      <b style={{ color: C.text }}>{kickTarget.nickname}</b>님을 강퇴합니다.
                    </div>
                    <div style={{ textAlign: 'left', marginBottom: 8 }}>
                      <div style={{ color: C.muted, fontSize: 13, marginBottom: 6 }}>강퇴 사유 (선택)</div>
                      <input
                        type="text"
                        placeholder="예: 닉네임 불일치, 도배 등"
                        value={kickReason}
                        onChange={e => setKickReason(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && confirmKick()}
                        style={{ ...inp(), width: '100%' }}
                      />
                    </div>
                    <div style={{ color: C.muted, fontSize: 12, marginBottom: 20 }}>
                      입력하지 않으면 기본 메시지가 표시됩니다.
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setKickTarget(null)}
                        style={{ flex: 1, background: C.border, color: C.text, border: 'none',
                          borderRadius: 8, padding: '10px', fontFamily: 'Syne', fontWeight: 700,
                          fontSize: 14, cursor: 'pointer' }}>취소</button>
                      <button onClick={confirmKick}
                        style={{ flex: 1, background: C.danger, color: '#fff', border: 'none',
                          borderRadius: 8, padding: '10px', fontFamily: 'Syne', fontWeight: 700,
                          fontSize: 14, cursor: 'pointer' }}>강퇴</button>
                    </div>
                  </div>
                </div>
              )}

            </>
          )}
        </div>
      </div>
    </>
  )
}

function SpinWheel({ participants, angle }) {
  const size = 280, cx = size / 2, cy = size / 2, r = cx - 12
  if (participants.length === 0) return null

  if (participants.length === 1) {
    return (
      <svg width={size} height={size} style={{ display: 'block', margin: '0 auto' }}>
        <circle cx={cx} cy={cy} r={r} fill="hsl(260,65%,55%)" stroke="#0D0F1A" strokeWidth={2} />
        <text x={cx} y={cy - 10} textAnchor="middle" dominantBaseline="middle"
          fontSize={22} fontWeight="700" fill="#fff">{participants[0].number}번</text>
        <text x={cx} y={cy + 16} textAnchor="middle" dominantBaseline="middle"
          fontSize={13} fill="#fff">{participants[0].nickname}</text>
        <circle cx={cx} cy={cy} r={10} fill="#fff" />
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

function StatusBadge({ status }) {
  const map = {
    waiting: ['대기중', '#7B80A0'], open: ['진행중', '#06D6A0'],
    ended: ['종료됨', '#EF476F'], spinning: ['추첨중', '#FFD166'],
    result: ['당첨발표', '#FFD166'], closed: ['세션종료', '#EF476F']
  }
  const [label, color] = map[status] || ['알수없음', '#7B80A0']
  return <span style={{ padding: '4px 12px', borderRadius: 99, background: color + '22', color, fontSize: 12, fontWeight: 700 }}>{label}</span>
}

function card() { return { background: '#1E2235', border: '1px solid #2A2F4A', borderRadius: 14, padding: 24 } }
function cardTitle() { return { fontFamily: 'Syne', fontSize: 15, fontWeight: 700, color: '#E8EAF6' } }
function inp() { return { background: '#161928', border: '1px solid #2A2F4A', borderRadius: 8, color: '#E8EAF6', padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'Inter' } }
function btn(bg, big = false) { return { background: bg, color: bg === '#FFD166' ? '#0D0F1A' : '#fff', border: 'none', borderRadius: 8, padding: big ? '12px 24px' : '8px 16px', fontFamily: 'Syne', fontWeight: 700, fontSize: big ? 15 : 13, cursor: 'pointer' } }
