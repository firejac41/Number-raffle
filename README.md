# 🎰 실시간 추첨기
> 주작없는 실시간 번호 추첨 웹앱

라이브 방송, 이벤트, 모임에서 **번호 추첨을 공정하게** 진행할 수 있는 웹앱입니다.
당첨자는 서버에서 직접 뽑기 때문에 관리자도 결과를 조작할 수 없습니다.

---

## ✨ 주요 기능
- 참가자 실시간 입장 및 번호 선택
- **서버사이드 추첨** (관리자 조작 불가)
- 돌림판 애니메이션
- 관리자 대시보드 (참가자 현황, 강퇴)
- IP / 닉네임 중복 방지

---

## 🛠 기술 스택
- **Next.js** — 웹사이트 프레임워크
- **Supabase** — 실시간 데이터베이스
- **Vercel** — 웹사이트 배포 및 호스팅

---

## 🚀 배포 방법

> ⚠️ **코딩을 모르신다면** 아래 [👶 초보자 가이드](#-초보자-가이드-처음부터-끝까지)를 읽어주세요.

### ⚡ 숙련자 요약

```
1. 이 레포 Fork
2. Supabase 프로젝트 생성 후 아래 SQL 실행
3. Vercel에 Fork한 레포 연결
4. 환경변수 4개 설정
5. 배포 완료
```

**환경변수**
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

**Supabase SQL**
```sql
create table sessions (
  id text primary key,
  admin_password text,
  max_num integer default 999,
  status text default 'waiting',
  started_at timestamptz,
  ended_at timestamptz,
  spin_started_at timestamptz,
  spinner_result integer
);

create table participants (
  id text primary key,
  session_id text references sessions(id) on delete cascade,
  nickname text,
  ip text,
  number integer,
  picked_at timestamptz
);

create unique index on participants(session_id, number);
```

**관리자 포탈 코드** (`pages/index.js` 1번째 줄)
```js
const ADMIN_PORTAL_CODE = 'donquixote12'  // ← 원하는 코드로 변경
```

---

## 👶 초보자 가이드 (처음부터 끝까지)

코딩을 몰라도 괜찮아요. 아래 순서대로만 따라하면 나만의 추첨 사이트가 생깁니다.

---

### 🧩 먼저 알아야 할 것: 세 가지 서비스가 하는 역할

| 서비스 | 역할 | 비유 |
|--------|------|------|
| **GitHub** | 코드를 저장하는 곳 | 레시피 책 |
| **Supabase** | 참가자 데이터를 저장하는 데이터베이스 | 냉장고 |
| **Vercel** | 웹사이트를 인터넷에 올려주는 곳 | 식당 |

세 개 다 **무료**로 사용 가능하고, **GitHub 계정 하나로 모두 가입**할 수 있어요.

---

### 1단계: GitHub 가입 및 코드 복사

1. [github.com](https://github.com) 접속 → 회원가입
2. 이 페이지 상단 오른쪽 **Fork** 버튼 클릭
3. **"Create fork"** 클릭 → 내 계정에 코드가 복사됨

---

### 2단계: Supabase 가입 및 데이터베이스 만들기

> Supabase = 참가자 번호, 세션 정보 등을 저장하는 **냉장고** 역할

1. [supabase.com](https://supabase.com) 접속
2. **"Start your project"** → **GitHub으로 로그인**
3. **"New project"** 클릭
   - Project name: `number-raffle` (아무 이름이나 가능)
   - Database Password: 아무 비밀번호 입력 후 저장해두기
   - Region: **Northeast Asia (Seoul)** 선택
4. 프로젝트 생성 완료까지 1~2분 기다리기
5. 왼쪽 메뉴에서 **SQL Editor** 클릭
6. 아래 코드를 복사해서 붙여넣기 후 **Run** 클릭

```sql
create table sessions (
  id text primary key,
  admin_password text,
  max_num integer default 999,
  status text default 'waiting',
  started_at timestamptz,
  ended_at timestamptz,
  spin_started_at timestamptz,
  spinner_result integer
);

create table participants (
  id text primary key,
  session_id text references sessions(id) on delete cascade,
  nickname text,
  ip text,
  number integer,
  picked_at timestamptz
);

create unique index on participants(session_id, number);
```

7. 왼쪽 메뉴 **Project Settings → API** 클릭
8. 아래 두 값을 메모장에 복사해두기
   - **Project URL** (`https://xxxx.supabase.co` 형태)
   - **anon public** 키 (긴 문자열)

---

### 3단계: Vercel 가입 및 배포

> Vercel = 만든 사이트를 **인터넷에 올려주는** 역할

1. [vercel.com](https://vercel.com) 접속
2. **"Start Deploying"** → **GitHub으로 로그인**
3. **"Add New Project"** 클릭
4. Fork한 `number-raffle` 레포 찾아서 **Import** 클릭
5. **Environment Variables** 항목에 아래 두 줄 추가
   - `NEXT_PUBLIC_SUPABASE_URL` → 2단계에서 복사한 Project URL 붙여넣기
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → 2단계에서 복사한 anon key 붙여넣기
6. **Deploy** 클릭
7. 배포 완료! 🎉 `https://내프로젝트이름.vercel.app` 주소로 접속 가능

---

### 4단계: 관리자 코드 변경 (선택사항)

기본 관리자 코드는 `donquixote12`입니다. 바꾸고 싶다면:

1. GitHub에서 내 레포의 `pages/index.js` 파일 클릭
2. 오른쪽 상단 ✏️ 연필 아이콘 클릭
3. 맨 위 줄에서 `donquixote12` 부분을 원하는 코드로 수정
4. 아래 **"Commit changes"** 클릭 → Vercel이 자동으로 재배포

---

### ✅ 완료! 사용 방법

1. 사이트 접속 → 관리자 버튼(우측 하단) → 관리자 코드 입력
2. 세션 비밀번호 설정 후 세션 생성
3. 참가자에게 초대 링크 또는 코드 공유
4. 참가자 입장 확인 후 번호뽑기 시작
5. 번호 선택 종료 후 돌림판 추첨!

---

## 📄 라이선스
MIT License — 자유롭게 사용, 수정, 배포 가능합니다.
