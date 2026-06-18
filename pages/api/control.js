import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { code, admin_password, action, spinner_result } = req.body

  const { data: session } = await supabase.from('sessions').select('*').eq('id', code).single()
  if (!session) return res.status(404).json({ error: '세션 없음' })
  if (session.admin_password !== admin_password) return res.status(401).json({ error: '비밀번호 틀림' })

  const now = new Date().toISOString()
  let update = {}

  if (action === 'start') {
    update = { status: 'open', started_at: now }

  } else if (action === 'end') {
    update = { status: 'ended', ended_at: now }

  } else if (action === 'spin') {
    // ✅ 서버에서 직접 당첨자 뽑기 (관리자 조작 불가)
    // 번호를 선택한 참가자 목록을 DB에서 가져옴
    const { data: pickedList } = await supabase
      .from('participants')
      .select('id, nickname, number')
      .eq('session_id', code)
      .not('number', 'is', null) // 번호 선택한 사람만

    if (!pickedList || pickedList.length === 0) {
      return res.status(400).json({ error: '번호를 선택한 참가자가 없습니다.' })
    }

    // 서버에서 랜덤으로 당첨자 결정
    const winner = pickedList[Math.floor(Math.random() * pickedList.length)]

    update = {
      status: 'spinning',
      spin_started_at: now,
      spinner_result: winner.number, // 결과를 spin 시점에 바로 저장
    }

  } else if (action === 'result') {
    // spin에서 이미 spinner_result가 저장되므로, result 액션은 상태만 변경
    update = { status: 'result' }

  } else if (action === 'close') {
    update = { status: 'closed', ended_at: now }

  } else {
    return res.status(400).json({ error: '알 수 없는 action' })
  }

  const { error } = await supabase.from('sessions').update(update).eq('id', code)
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ ok: true })
}
