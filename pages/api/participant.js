import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

function getIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  )
}

export default async function handler(req, res) {
  const ip = getIP(req)

  // 참가자 입장
  if (req.method === 'POST') {
    const { session_id, nickname } = req.body
    if (!session_id || !nickname) return res.status(400).json({ error: '필수값 누락' })

    const { data: session } = await supabase.from('sessions').select('*').eq('id', session_id).single()
    if (!session) return res.status(404).json({ error: '세션 없음' })
    if (session.status === 'closed') return res.status(403).json({ error: '종료된 세션' })

    // 현재 참가자 수 확인 (정원 초과 방지)
    const { count } = await supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', session_id)

    if (count >= session.max_num) return res.status(403).json({ error: '자리가 다 찼습니다. 다음 기회에!' })

    // 닉네임 중복 확인
    const { data: dupNick } = await supabase
      .from('participants')
      .select('id')
      .eq('session_id', session_id)
      .ilike('nickname', nickname.trim())
      .single()
    if (dupNick) return res.status(409).json({ error: '이미 사용 중인 닉네임입니다.' })

    // IP 중복 확인
    const { data: dupIP } = await supabase
      .from('participants')
      .select('id')
      .eq('session_id', session_id)
      .eq('ip', ip)
      .single()
    if (dupIP) return res.status(409).json({ error: '이미 이 기기에서 참가한 세션입니다.' })

    const pid = `${session_id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const { data, error } = await supabase.from('participants').insert({
      id: pid,
      session_id,
      nickname: nickname.trim(),
      ip
    }).select().single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ participant: data })
  }

  // 번호 선택
  if (req.method === 'PATCH') {
    const { participant_id, session_id, number } = req.body

    const { data: session } = await supabase.from('sessions').select('*').eq('id', session_id).single()
    if (!session || session.status !== 'open') return res.status(403).json({ error: '번호 선택 불가 상태' })

    // 번호 중복 확인
    const { data: taken } = await supabase
      .from('participants')
      .select('id')
      .eq('session_id', session_id)
      .eq('number', number)
      .single()
    if (taken) return res.status(409).json({ error: '이미 선택된 번호' })

    // 이미 번호 선택했는지 확인
    const { data: me } = await supabase
      .from('participants')
      .select('number')
      .eq('id', participant_id)
      .single()
    if (me?.number) return res.status(409).json({ error: '이미 번호를 선택했습니다.' })

    const { error } = await supabase
      .from('participants')
      .update({ number, picked_at: new Date().toISOString() })
      .eq('id', participant_id)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  // 번호 반납 (네트워크 변경 감지 시)
  if (req.method === 'DELETE') {
    const { participant_id } = req.body
    await supabase.from('participants').update({ number: null, picked_at: null }).eq('id', participant_id)
    return res.status(200).json({ ok: true })
  }

  res.status(405).json({ error: 'Method not allowed' })
}
