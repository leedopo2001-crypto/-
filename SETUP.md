# here 실시간 위치 공유 - 설정 가이드

이 문서는 **Phase 1 (Expo Go에서 동작하는 포그라운드 실시간 위치 공유)** 를 처음부터 끝까지 세팅하는 절차입니다.

총 소요시간: 약 **30분**.

---

## 📋 준비물

- GitHub 계정 (Supabase, Vercel 로그인용)
- Node.js 18+ 설치된 PC
- iPhone/Android + Expo Go 앱
- 현재 프로젝트를 받은 로컬 폴더

---

> ### 📌 이미 세팅을 끝내셨다면 — 스키마 v2 업데이트
> `supabase/schema.sql` 이 바뀌었습니다 (배터리·흔들림·전송주기 공유).
> **SQL Editor 에 새 `schema.sql` 을 통째로 다시 붙여넣고 Run 하시면 됩니다.**
> 몇 번을 다시 실행해도 안전하고, 기존 세션·위치 데이터는 그대로 남습니다.
> (v1 이 깔린 DB 에 v2 를 덮어쓰는 시나리오를 실제 PostgreSQL 로 검증했습니다)

## 1단계. Supabase 프로젝트 만들기 (10분)

1. https://supabase.com 접속 → **Start your project** → GitHub으로 로그인
2. **New project** 클릭
   - Project name: `here`
   - Database Password: 아무거나 (나중에 쓸 일 별로 없음, 잃어버리지 않게 메모)
   - Region: **Northeast Asia (Seoul)** 또는 Tokyo
   - Plan: **Free**
3. 프로젝트 생성까지 2~3분 대기
4. 왼쪽 사이드바 **"SQL Editor"** 클릭 → **"New query"**
5. 프로젝트 내 `supabase/schema.sql` 파일 전체 내용을 복사해서 붙여넣기
6. 우측 상단 **"Run"** 버튼 클릭 → 초록색 "Success" 뜨면 OK
7. 왼쪽 사이드바 **"Project Settings"** (톱니바퀴) → **"API"** 이동
8. 다음 두 값을 메모장에 복사:
   - **Project URL**: `https://xxxxxxxxxxxx.supabase.co`
   - **Project API keys → anon public**: `eyJhbGci...` (엄청 긴 문자열)

> ⚠️ `service_role` 키는 **절대 복사/공유하지 마세요.** `anon public` 만 쓰면 됩니다.

### `anon` 키를 공개해도 괜찮은 이유

`anon` 키는 웹페이지에 그대로 들어가므로 누구나 볼 수 있습니다. 그래서 이 스키마는
**anon 에게 테이블 접근 권한을 아예 주지 않습니다.** 모든 동작은 함수(RPC)를 통해서만
가능하고, 각 함수는 값을 알아야만 통과합니다.

| 하려는 것 | 필요한 것 |
|---|---|
| 위치 조회 | `short_code` (링크에 들어있음) |
| 위치 올리기 / 추적 종료 | `short_code` **+** `owner_token` |

`owner_token` 은 세션을 만든 기기에만 반환되고 **링크에는 들어가지 않습니다.**
따라서 링크를 받은 사람도 남의 위치를 조작하거나 추적을 중단시킬 수 없습니다.
`short_code` 는 8자리(31^8 ≈ 8500억 가지)라 추측으로 찾는 것도 사실상 불가능합니다.

---

## 2단계. 웹 뷰어를 Vercel에 배포 (10분)

### 2-1. GitHub에 푸시되어 있는 상태 확인
이 프로젝트가 이미 GitHub에 있으므로 그대로 Vercel에 연결합니다.

### 2-2. Vercel 가입 & 프로젝트 연결
1. https://vercel.com → GitHub으로 로그인
2. **"Add New..." → "Project"** 클릭
3. 이 repo 선택 → **"Import"**
4. **Configure Project** 설정:
   - **Framework Preset**: `Other`
   - **Root Directory**: `web` ← **꼭 web 폴더로 지정**
   - Build and Output Settings: 기본값 그대로
5. **"Deploy"** 클릭 → 1~2분 대기
6. 배포 완료되면 URL 확인: `https://your-project.vercel.app` 같은 형태

### 2-3. Supabase 키 주입
배포된 웹 뷰어가 Supabase에 연결되도록 `web/config.js` 를 편집합니다.

**방법 A (간단):** `web/config.js` 를 직접 편집한 뒤 다시 commit/push.

```js
// web/config.js
window.HERE_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxxxxxx.supabase.co',        // 복사해둔 값
  SUPABASE_ANON_KEY: 'eyJhbGci...(엄청 긴 키)',            // 복사해둔 값
};
```

푸시하면 Vercel이 자동으로 재배포합니다.

### 2-4. URL 형식 확인
- 메인: `https://your-project.vercel.app/`
- 추적 링크 예: `https://your-project.vercel.app/t/a7k3x9`

`vercel.json` 의 rewrite 덕분에 `/t/xxx` 경로가 모두 index.html로 연결됩니다.

---

## 3단계. 앱에 Supabase 연결 (5분)

프로젝트 루트에 `.env` 파일 생성 (`.env.example` 참고):

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...(엄청 긴 키)
EXPO_PUBLIC_WEB_VIEWER_URL=https://your-project.vercel.app
```

> `.env` 파일은 `.gitignore` 에 이미 포함돼 있어 GitHub에 올라가지 않습니다.

앱 재실행:

```powershell
npx expo start -c
```

`-c` 는 캐시 초기화. 환경 변수 변경 후에는 꼭 `-c` 로 실행.

---

## 4단계. 테스트 (5분)

### 4-1. 앱 실행 & 설정
1. Expo Go로 QR 스캔
2. (최초 실행이면) 온보딩 → 설정에서 이름 + 연락처 추가
3. 설정에서 **"실시간 추적 주기"** 를 `1분` 으로 설정 (테스트용)
4. 저장 → 메인으로 돌아옴

### 4-2. 즉시 SOS 테스트
- 빨간 SOS 버튼 2초 홀드 → 문자 컴포저 열림 → 자기 번호로 보내기
- 메시지 확인: `🆘 [홍길동] 긴급상황! 현재 위치: https://maps.google.com/?q=...`

### 4-3. 실시간 추적 테스트
1. 메인에서 **"📍 실시간 위치 추적"** 탭
2. "시작" 확인
3. 문자 컴포저에서 자기 번호로 링크 문자 발송
4. 앱은 추적 화면으로 전환 → "실시간 추적 중" 상태
5. 문자에 온 링크를 PC/다른 기기 브라우저에서 열기
6. 지도에 빨간 마커가 현재 위치에 표시됨
7. 1분 뒤 자동으로 새 위치로 이동 (걸어다니면서 테스트하면 확인됨)
8. 테스트 끝나면 앱에서 **"🛑 추적 종료"** 탭

### 4-4. 브라우저 쪽 확인 포인트
- 초록색 점이 깜빡이면 "실시간 추적 중"
- "마지막 업데이트: N초 전" 표시
- 업데이트 횟수 증가
- 앱에서 종료하면 "추적 종료됨" 회색 점으로 변경

---

## 🐛 문제 해결

### "Supabase가 아직 설정되지 않았습니다"
`.env` 를 만든 뒤 `npx expo start -c` 로 캐시 초기화 후 재시작.

### 웹 뷰어에 "설정 필요" 메시지
`web/config.js` 에 Supabase URL/키 입력 후 푸시하면 Vercel 자동 재배포.

### 링크 열었는데 "세션을 찾을 수 없습니다"
- 추적 시작이 성공했는지 앱에서 확인
- Supabase Dashboard → Table Editor → `sessions` 테이블에 해당 `short_code` 가 있는지 확인

### 지도에 마커가 안 보임
- Supabase Dashboard → `locations` 테이블에 데이터가 쌓이는지 확인
- 브라우저 DevTools 콘솔 (F12) 에서 에러 확인
- Supabase Dashboard → Database → Functions 에 `here_get_locations` 등 6개 함수가 있는지 확인
- 없다면 `supabase/schema.sql` 실행이 중간에 실패한 것이므로 다시 실행

### "Network request failed" (앱에서)
- Wi-Fi 연결 확인
- 회사/학교 방화벽이면 `npx expo start --tunnel` 로 실행

---

## 🚀 Phase 2 (선택) - 백그라운드 동작

현재는 **앱을 켜둬야** 위치가 전송됩니다. 앱을 닫아도 동작하게 하려면:

1. `expo-task-manager` + `expo-location` 백그라운드 권한 추가
2. `eas build --profile development` 로 개발 빌드 생성 (Expo Go 아님)
3. iOS는 Apple Developer 계정($99/년) 필요
4. Android는 Google Play Developer 계정($25, 일회) 필요

자세한 Phase 2 진행은 Phase 1 잘 돌아가는 거 확인한 뒤에 진행 추천.

---

## 💰 비용 정리

| 항목 | 이 프로젝트 비용 |
|---|---|
| Supabase Free Tier | $0 (DB 500MB, 월 50k MAU) |
| Vercel Hobby | $0 (개인 사용) |
| 도메인 | $0 (vercel.app 무료 서브도메인 사용) |
| **합계** | **$0 / 월** |

수백 명이 쓰더라도 이 조합이면 당분간 무료. 트래픽 늘면 Supabase Pro($25/월) 고려.
