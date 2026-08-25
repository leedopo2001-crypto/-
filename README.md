# here 🆘

긴급 SOS + 실시간 위치 공유 React Native (Expo) 앱.

## 기능

### 📨 즉시 SOS
- 화면 중앙의 큰 빨간 원형 SOS 버튼
- 2초 길게 눌러야 전송 (실수 방지) — 원형 프로그레스로 시각적 피드백
- 현재 GPS 좌표 기반 구글맵 링크를 저장된 모든 연락처에 문자 전송
- 메시지 문구는 **설정에서 자유롭게 수정 가능** (`{이름}`, `{위치}` 치환 지원)

### 📍 실시간 위치 공유 (Phase 1)
- **링크 한 번만 보내면** 수신자가 실시간으로 위치를 확인
- N분(1/5/10/15) 마다 자동으로 새 위치가 Supabase 로 업로드됨
- 수신자는 웹 브라우저에서 Leaflet 지도로 실시간 추적
- **지나온 경로가 선으로 그려지고**, 총 이동 거리와 최근 속도가 표시됨
- **튀는 GPS 신호를 자동으로 걸러냄** (오차 100m 초과 · 멀리 갔다 즉시 복귀하는 점)
- 마커가 대권 경로를 따라 부드럽게 이동 (따라가기 / 전체 경로 보기 토글)
- **▶ 경로 재생** — 기록된 동선을 처음부터 애니메이션으로 되돌려 봄
  (진행률을 점 개수가 아니라 **누적 거리**에 매핑해서, 점이 몰린 구간에서
  느려지지 않고 일정한 속도로 재생됨)
- 앱에서 "추적 종료" 하면 링크도 비활성화

### 🌐 웹 지원
- 앱 전체가 브라우저에서도 실행됨 (`npm run web`)
- 웹에서는 문자 API 가 없으므로, 나갈 문구를 그대로 보여주는 미리보기 + 복사 버튼 제공

### ⚙ 설정
- 내 이름 (메시지에 사용)
- 긴급 연락처 (이름 + 전화번호, 자동 국제번호 변환)
- 즉시 SOS 문구 커스텀
- 실시간 추적 문구 커스텀
- 추적 주기 (1/5/10/15분)

## 프로젝트 구조

```
here/
├── App.js                       ← 화면 라우팅
├── src/
│   ├── api/
│   │   └── supabase.js          ← Supabase 클라이언트 + 세션/위치 API
│   ├── components/
│   │   └── MessagePreviewModal.js  ← 웹에서 문자 대신 띄우는 미리보기
│   ├── sms.js                   ← 네이티브/웹 공통 문자 발송 래퍼
│   ├── storage.js               ← AsyncStorage + 템플릿 렌더링
│   └── screens/
│       ├── OnboardingScreen.js
│       ├── SettingsScreen.js
│       ├── HomeScreen.js        ← SOS + 추적 진입
│       └── TrackingScreen.js    ← 실시간 추적 중 화면
├── web/                         ← Vercel 에 배포하는 실시간 지도 뷰어
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── config.js
│   ├── vercel.json
│   └── lib/                     ← geo/이상치/이징 (google-timeline-visualizer 기반)
│       ├── geo.js
│       ├── outlier.js
│       ├── animation.js
│       ├── replay.js            ← 누적거리 기반 경로 재생
│       ├── demo-route.js        ← ?demo=1 용 예시 경로
│       └── ATTRIBUTION.md
├── scripts/
│   └── serve-viewer.mjs         ← npm run viewer (로컬에서 뷰어 띄우기)
├── supabase/
│   └── schema.sql               ← Supabase SQL Editor 에 실행
├── .env.example
└── SETUP.md                     ← 전체 배포 가이드 (여기 먼저 읽기)
```

## 빠른 시작

### 1. Supabase + Vercel 세팅 (30분, 한번만)
**[SETUP.md](./SETUP.md)** 를 그대로 따라 하세요.

### 2. 앱 실행
```bash
npm install
cp .env.example .env
# .env 파일을 Supabase 키로 채우기
npx expo start -c
```

Expo Go 로 QR 스캔.

### 3. 브라우저에서 바로 보기 (앱 설치 없이)
```bash
npm run web          # 개발 서버, 브라우저가 자동으로 열린다
npm run build:web    # dist/ 에 정적 파일로 내보내기
```

온보딩 → 설정 → 홈 → 추적까지 전 화면을 브라우저에서 그대로 확인할 수 있습니다.
단, 웹에는 문자 발송 API 가 없으므로 SOS 를 누르면 **실제로 나갈 문구와 수신자를
보여주는 미리보기 창**이 뜨고, 복사 버튼으로 내용을 가져갈 수 있습니다.

### 4. 지도 뷰어를 설정 없이 바로 보기
```bash
npm run viewer       # http://localhost:4173/?demo=1
```

Supabase 없이도 예시 경로(서울시청 → 남산)가 지도에 그려집니다.
**▶ 경로 재생** 버튼을 누르면 동선이 처음부터 애니메이션으로 재생됩니다.
예시 데이터에는 일부러 넣은 이상치가 하나 있어서, GPS 필터가 동작하는 것도
눈으로 확인할 수 있습니다.

`npm run viewer` 는 Vercel 의 `/t/:code` rewrite 를 그대로 재현하므로,
실제 공유 링크와 같은 경로로도 테스트할 수 있습니다.

### 5. 앱에서 최초 사용
1. 환영 → 시작하기
2. 이름 + 연락처 입력 후 저장
3. 메인 화면에서 테스트

## 제약 사항

- **Expo Go 모드는 앱 포그라운드일 때만 위치 업데이트됨**. 화면 꺼지거나 앱 백그라운드 가면 중단.
- iOS 는 정책상 SMS 자동 발송 불가 → 매번 "보내기" 한 번 탭 필요.
- 수신자가 링크를 한 번 열어두면 이후 자동 업데이트되므로, SMS 는 처음 1회만 발송됨.
- 진짜 백그라운드 동작 원하면 Phase 2 (EAS 빌드, 개발자 계정 필요) 필요.

## 보안 / 데이터
- Supabase 에 저장되는 정보: `short_code`, `owner_token`, 사용자 이름, 위도/경도, 타임스탬프
- `anon` 키는 웹페이지에 노출되므로, **테이블 직접 접근은 전부 차단**하고 RPC 로만 연다
  - 조회: `short_code` 필요 (링크에 포함)
  - 위치 올리기 / 추적 종료: `owner_token` 까지 필요 (추적 기기에만 있음, 링크에 없음)
- `short_code` 는 8자리 (31^8 ≈ 8500억) 라 열거·추측이 불가능
- `here_purge_old()` 로 24시간 지난 세션 정리 (Supabase Cron 에 걸 수 있음)
- 개인 사용이 아닌 배포용이면 개인정보처리방침 별도 작성 필요

## 서드파티 출처
`web/lib/` 의 거리 계산 · GPS 이상치 필터 · 이징 함수는
[mahlernim/google-timeline-visualizer](https://github.com/mahlernim/google-timeline-visualizer)
(MIT License, © 2025 mahlernim) 를 기반으로 실시간 추적용으로 다시 맞춘 것입니다.
자세한 내역은 [web/lib/ATTRIBUTION.md](./web/lib/ATTRIBUTION.md) 참고.
