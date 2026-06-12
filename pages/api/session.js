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
    if (!admin_password || !max_num) return res.status(400).json({ error: '필수값 누락' })

    let code, exists
    do {
      code = generateCode()
      const { data } = await supabase.from('sessions').select('id').eq('id', code).single()
      exists = !!data
    } while (exists)

    const { data, error } = await supabase.from('sessions').insert({
      id: code,
      admin_password,
      max_num: parseInt(max_num),
      status: 'waiting'
    }).select().single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ session: data })
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
      .order('number', { ascending: true })

    return res.status(200).json({ session: data, participants: participants || [] })
  }

  res.status(405).json({ error: 'Method not allowed' })
}
