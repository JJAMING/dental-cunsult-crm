# Dental Consult CRM

치과 상담일지, 동의율 리포트, 비동의 리콜 관리를 스프레드시트에서 웹앱으로 옮기는 MVP입니다.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS v4
- Supabase Auth/Postgres/RLS
- Vercel
- GitHub

## Local Setup

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 열면 `/dashboard`로 이동합니다.

## Environment

`.env.example`을 참고해서 `.env.local`을 만드세요.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY`는 서버 전용으로만 사용합니다.

## Supabase

Supabase CLI는 프로젝트 dev dependency로 설치되어 있습니다.

```bash
npm run supabase -- --version
npm run supabase:start
npm run db:reset
```

원격 프로젝트 적용 순서:

1. Supabase 프로젝트를 생성합니다.
2. `npx supabase login`으로 인증합니다.
3. `npx supabase link --project-ref <project-ref>`로 원격 프로젝트를 연결합니다.
4. `npx supabase db push`로 `supabase/migrations`의 모든 migration을 적용합니다.
5. 필요하면 `supabase/seed.sql`을 실행해 기본 옵션 데이터를 넣습니다.
6. 웹앱에서 첫 로그인 후 상담일지를 열면 `ensure_user_clinic` 함수가 현재 앱의 치과 키를 Supabase `clinics/profiles`에 연결합니다.

현재 상담일지 저장 순서는 다음과 같습니다.

1. 치과 내부 API 서버(local.db)가 연결되어 있으면 내부 API에 저장합니다.
2. 내부 API가 없고 Supabase 환경변수와 로그인 세션이 있으면 Supabase에 저장합니다.
3. 둘 다 사용할 수 없으면 브라우저 저장소에 임시 저장합니다.

새 migration은 CLI로 생성합니다.

```bash
npm run db:migration:new -- migration_name
```

## Routes

- `/dashboard`: 월별 상담/동의 현황, 리콜 대상, 최근 상담일지
- `/consultations`: 상담 등록 폼과 상담 목록
- `/recalls`: 비동의 후속관리 큐
- `/reports`: 진료분류/내원경로/상담사/원장님별 리포트
- `/settings`: 환경변수, 배포 체크리스트, DB 구조
- `/login`: Supabase Auth 연결 전 로그인 화면

## Design

`DESIGN.md`의 monday.com 스타일 토큰을 기준으로 밝은 생산성 앱 화면을 구성했습니다. 앱은 마케팅 랜딩이 아니라 실제 업무 화면을 첫 화면으로 보여줍니다.
