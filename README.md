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
- 앱에서 "추적 종료" 하면 링크도 비활성화

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
│   └── vercel.json
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

### 3. 앱에서 최초 사용
1. 환영 → 시작하기
2. 이름 + 연락처 입력 후 저장
3. 메인 화면에서 테스트

## 제약 사항

- **Expo Go 모드는 앱 포그라운드일 때만 위치 업데이트됨**. 화면 꺼지거나 앱 백그라운드 가면 중단.
- iOS 는 정책상 SMS 자동 발송 불가 → 매번 "보내기" 한 번 탭 필요.
- 수신자가 링크를 한 번 열어두면 이후 자동 업데이트되므로, SMS 는 처음 1회만 발송됨.
- 진짜 백그라운드 동작 원하면 Phase 2 (EAS 빌드, 개발자 계정 필요) 필요.

## 라이선스 / 데이터
- Supabase 에 저장되는 정보: `short_code`, 사용자 이름, 위도/경도, 타임스탬프
- 24시간 지난 데이터는 수동 정리 가능 (schema.sql 참고)
- 개인 사용이 아닌 배포용이면 개인정보처리방침 별도 작성 필요
