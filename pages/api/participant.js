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

    if (session.status === 'open' || session.status === 'ended' || session.status === 'spinning' || session.status === 'result') {
      return res.status(403).json({ error: '자리 마감! 다음 기회에' })
    }

    const { count } = await supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', session_id)
    if (session.max_num < 999 && count >= session.max_num) {
      return res.status(403).json({ error: '자리가 다 찼습니다. 다음 기회에!' })
    }

    const { data: dupNick } = await supabase
      .from('participants')
      .select('id')
      .eq('session_id', session_id)
      .ilike('nickname', nickname.trim())
      .single()
    if (dupNick) return res.status(409).json({ error: '이미 사용 중인 닉네임입니다.' })

    const { data: dupIP } = await supabase
      .from('participants')
      .select('id')
      .eq('session_id', session_id)
      .eq('ip', ip)
      .single()
    if (dupIP) return res.status(409).json({ error: '이미 이 기기에서 참가한 세션입니다.' })

    const pid = `${session_id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const { data, error } = await supabase.from('participants').insert({
      id: pid, session_id, nickname: nickname.trim(), ip
    }).select().single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ participant: data })
  }

  // 번호 선택
  if (req.method === 'PATCH') {
    const { participant_id, session_id, number } = req.body

    const { data: session } = await supabase.from('sessions').select('*').eq('id', session_id).single()
    if (!session || session.status !== 'open') return res.status(403).json({ error: '번호 선택 불가 상태' })

    if (number < 1 || number > session.max_num) {
      return res.status(400).json({ error: `1~${session.max_num} 사이의 번호만 선택 가능합니다.` })
    }

    const { data: me } = await supabase
      .from('participants').select('number').eq('id', participant_id).single()
    if (me?.number) return res.status(409).json({ error: '이미 번호를 선택했습니다.' })

    const { data: taken } = await supabase
      .from('participants').select('id').eq('session_id', session_id).eq('number', number).single()
    if (taken) return res.status(409).json({ error: '이미 선택된 번호' })

    const { error } = await supabase
      .from('participants')
      .update({ number, picked_at: new Date().toISOString() })
      .eq('id', participant_id)

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: '이미 선택된 번호' })
      return res.status(500).json({ error: error.message })
    }
    return res.status(200).json({ ok: true })
  }

  // 강퇴(kick) 또는 번호 반납
  if (req.method === 'DELETE') {
    const { participant_id, kick } = req.body

    if (kick) {
      // ✅ 강퇴: 참가자 DB에서 완전 삭제
      const { error } = await supabase.from('participants').delete().eq('id', participant_id)
      if (error) return res.status(500).json({ error: error.message })
    } else {
      // 번호 반납: 번호만 null로
      await supabase.from('participants').update({ number: null, picked_at: null }).eq('id', participant_id)
    }

    return res.status(200).json({ ok: true })
  }

  res.status(405).json({ error: 'Method not allowed' })
}
