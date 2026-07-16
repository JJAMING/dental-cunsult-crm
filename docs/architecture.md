# Dental Consult CRM Architecture

## MVP

1. 상담일지
   - 날짜, 환자, 차트번호, 신환/구환, 상담사, 원장님, 내원경로, 진료분류를 기록합니다.
   - 상담치아/동의치아, 상담결과, 상담금액/동의금액, 비동의사유, 상담내용을 저장합니다.

2. 리콜 관리
   - 비동의 상담을 1차 리콜 대상으로 전환합니다.
   - 2차, 3차, 종결 문자까지 진행상태를 관리합니다.
   - 상담사별 오늘 예정, 지연, 예약됨 상태를 봅니다.

3. 리포트
   - 월별 상담건수, 동의건수, 동의율, 동의금액을 집계합니다.
   - 진료분류, 내원경로, 상담사, 원장님, 환자구분, 비동의사유 기준으로 분석합니다.

## App Structure

```txt
src
├─ app
│  ├─ (auth)/login
│  ├─ (app)
│  │  ├─ dashboard
│  │  ├─ consultations
│  │  ├─ recalls
│  │  ├─ reports
│  │  └─ settings
│  ├─ layout.tsx
│  └─ page.tsx
├─ components
│  ├─ layout
│  ├─ reports
│  └─ ui
├─ lib
│  ├─ supabase
│  ├─ demo-data.ts
│  └─ format.ts
└─ types
```

## Database

Core tables:

- `clinics`
- `profiles`
- `staff`
- `patients`
- `consultations`
- `recalls`
- `visit_channels`
- `treatment_categories`
- `disagreement_reasons`

Analytics views:

- `monthly_consultation_stats`
- `treatment_category_stats`
- `visit_channel_stats`
- `disagreement_reason_stats`
- `recall_progress_stats`

RLS is enabled on every public table. Authenticated users can access rows only when their `profiles.clinic_id` matches the target row's `clinic_id`.
