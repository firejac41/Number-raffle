import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export default async function handler(req, res) {

  // 세션 생성
  if (req.method === 'POST') {
    const { admin_password, max_num } = req.body
    if (!admin_password) return res.status(400).json({ error: '필수값 누락' })

    let code, exists
    do {
      code = generateCode()
      const { data } = await supabase.from('sessions').select('id').eq('id', code).single()
      exists = !!data
    } while (exists)

    const { data, error } = await supabase.from('sessions').insert({
      id: code,
      admin_password,
      max_num: parseInt(max_num) || 999,
      status: 'waiting'
    }).select().single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ session: data })
  }

  // 최대번호 변경
  if (req.method === 'PUT') {
    const { code, admin_password, max_num } = req.body
    const { data: session } = await supabase.from('sessions').select('*').eq('id', code).single()
    if (!session) return res.status(404).json({ error: '세션 없음' })
    if (session.admin_password !== admin_password) return res.status(401).json({ error: '비밀번호 틀림' })

    const { error } = await supabase.from('sessions').update({ max_num: parseInt(max_num) }).eq('id', code)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  // 세션 조회
  if (req.method === 'GET') {
    const { code } = req.query
    if (!code) return res.status(400).json({ error: '코드 누락' })

    const { data, error } = await supabase.from('sessions').select('*').eq('id', code).single()
    if (error || !data) return res.status(404).json({ error: '세션 없음' })

    const { data: participants } = await supabase
      .from('participants')
      .select('id, nickname, number, picked_at')
      .eq('session_id', code)
      .order('number', { ascending: true, nullsFirst: false })

    return res.status(200).json({ session: data, participants: participants || [] })
  }

  res.status(405).json({ error: 'Method not allowed' })
}
