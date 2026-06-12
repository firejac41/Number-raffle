import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { code, admin_password, action, spinner_result } = req.body

  // 세션 확인 + 비밀번호 검증
  const { data: session } = await supabase.from('sessions').select('*').eq('id', code).single()
  if (!session) return res.status(404).json({ error: '세션 없음' })
  if (session.admin_password !== admin_password) return res.status(401).json({ error: '비밀번호 틀림' })

  const now = new Date().toISOString()
  let update = {}

  if (action === 'start') update = { status: 'countdown', started_at: now }
  else if (action === 'open') update = { status: 'open' }
  else if (action === 'end') update = { status: 'ended', ended_at: now }
  else if (action === 'spin') update = { status: 'spinning' }
  else if (action === 'result') update = { status: 'result', spinner_result }
  else if (action === 'close') update = { status: 'closed', ended_at: now }
  else return res.status(400).json({ error: '알 수 없는 action' })

  const { error } = await supabase.from('sessions').update(update).eq('id', code)
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ ok: true })
}
