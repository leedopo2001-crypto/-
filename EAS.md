# EAS 빌드 준비물

Expo Go 로는 못 하는 것들(백그라운드 추적, 위젯, 볼륨키 트리거, 문자 자동
발송)을 하려면 **개발 빌드**가 필요합니다. 이 문서는 그 전에 무엇을 준비해야
하는지만 정리합니다. 실제 코드 작업은 준비가 끝난 뒤에 합니다.

---

## 먼저 — 앞서 드린 설명을 바로잡습니다

지금까지 "Android $25, iOS $99/년" 이라고 말씀드렸는데, 정확하지 않았습니다.
그 금액은 **스토어에 출시할 때** 드는 비용입니다.

| | 내 폰에 설치해서 쓰기 | 스토어 출시 |
|---|---|---|
| **Android** | **무료** | Google Play $25 (일회) |
| **iOS** | Apple Developer $99/년 | 같은 계정 |

**Android 는 지금 당장 한 푼도 안 들이고 시작할 수 있습니다.** APK 를 만들어
폰에 직접 설치하면 되고, 구글 계정도 필요 없습니다.

iOS 는 사정이 다릅니다. 자기 폰에 설치하는 것만으로도 Apple Developer
Program 가입이 필요합니다. 애플이 프로비저닝 프로파일을 그렇게 묶어놨습니다.

→ **Android 부터 하시길 권합니다.** 공짜인데다, iOS 에서는 정책상 영원히
안 되는 문자 자동 발송이 여기서는 됩니다.

---

## 준비물 체크리스트

### 1. Expo 계정 (무료, 2분)

https://expo.dev 에서 가입. GitHub 로그인 가능합니다.
빌드가 여기 서버에서 돌고, 결과물을 여기서 내려받습니다.

### 2. EAS CLI

따로 설치할 필요 없습니다. `npx eas-cli` 로 그때그때 받아 씁니다.

```powershell
cd C:\dev\here
npx eas-cli login
```

> ⚠️ Vercel CLI 에서 겪었던 **PC 이름 한글 문제**가 여기서도 날 수 있습니다.
> 나면 `npx eas-cli login` 대신 https://expo.dev/settings/access-tokens 에서
> 토큰을 만들어 `set EXPO_TOKEN=토큰` 으로 넘기면 됩니다.

### 3. Android 폰

- **개발자 옵션** 켜기: 설정 → 휴대전화 정보 → 빌드번호 **7번 연타**
- **알 수 없는 앱 설치** 허용: APK 를 직접 설치할 때 뜨는 안내를 따라가면 됩니다
- USB 케이블은 필요 없습니다. 빌드가 끝나면 링크나 QR 로 폰에서 바로 받습니다

### 4. Supabase 키를 EAS 에 알려주기 ⚠️ 놓치기 쉬운 부분

`.env` 는 `.gitignore` 에 있어서 **EAS 빌드 서버로 안 올라갑니다.**
이걸 모르고 빌드하면 앱이 켜지긴 하는데 서버 기능이 전부 죽은 채로 나옵니다.

두 가지 방법 중 하나를 쓰세요.

**방법 A — `eas.json` 에 직접 적기 (간단)**

`eas.json` 의 `env` 세 칸을 채웁니다. `anon` 키는 원래 공개되는 값이라
커밋해도 안전합니다 (웹 뷰어의 `config.js` 와 같은 논리).

```json
"env": {
  "EXPO_PUBLIC_SUPABASE_URL": "https://xxxx.supabase.co",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY": "eyJhbGci...",
  "EXPO_PUBLIC_WEB_VIEWER_URL": "https://web-snowy-three-34.vercel.app"
}
```

**방법 B — EAS 에 따로 저장 (커밋 안 됨)**

```powershell
npx eas-cli env:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://xxxx.supabase.co"
```

### 5. Supabase SQL 3개 실행

아직 안 하셨다면 [SETUP.md](./SETUP.md) 를 따라 세 파일을 순서대로 실행하세요.
빌드해봤자 서버가 안 맞으면 확인할 수 있는 게 없습니다.

---

## 무엇이 달라지나

| | Expo Go (지금) | 개발 빌드 |
|---|---|---|
| 설치 | QR 스캔 | APK 한 번 설치 |
| JS 수정 | 저장하면 즉시 반영 | **똑같음** |
| 네이티브 모듈 추가 | 불가 | 다시 빌드 필요 |
| 앱 아이콘 | Expo Go 아이콘 | **우리 `h` 마크** |
| 백그라운드 | ✗ | ✓ |

**JS 개발 흐름은 그대로입니다.** `npx expo start` 하고 저장하면 바로 반영되는
건 똑같고, 다만 Expo Go 대신 우리 앱으로 붙습니다. 다시 빌드해야 하는 건
네이티브 모듈을 새로 넣을 때뿐입니다.

---

## 현실적인 부분

- **빌드 시간**: 무료 티어는 대기열이 있어 10~30분. 유료는 몇 분.
- **무료 한도**: 월 빌드 개수에 제한이 있습니다. 현재 기준은
  https://expo.dev/pricing 에서 확인하세요. 개발 중에 하루 몇 번씩
  네이티브 모듈을 갈아끼우면 금방 닿을 수 있습니다.
- **APK 용량**: 60~90MB 정도.
- **로컬 빌드**(`--local`)로 대기열과 한도를 피할 수 있지만, Android SDK 를
  깔아야 해서 10GB 정도 듭니다. Windows + 한글 사용자명 조합에서 도구
  경로 문제가 나기 쉬워서, 클라우드 빌드를 권합니다.

---

## 빌드 후에 만들 것 (참고용)

준비가 끝나면 이 순서로 작업합니다.

| 기능 | 필요한 것 | 비고 |
|---|---|---|
| **백그라운드 추적** | `expo-task-manager`, 백그라운드 위치 권한, Android 포그라운드 서비스 알림 | 밤 모드가 여기서 제 값을 합니다 — "앱을 켜둬야 한다"는 제약이 사라집니다 |
| **낙상 감지** | 가속도계 고빈도 샘플링 | 앱이 떠 있으면 Expo Go 에서도 되지만, 주머니 속에서 동작하려면 백그라운드가 먼저 |
| **볼륨키 트리거** | 네이티브 모듈 | 폰을 보지 않고 발동. 납치 상황을 상정한 기능 |
| **문자 자동 발송** | `SEND_SMS` + 네이티브 모듈 | **Android 만.** iOS 는 정책상 영구 불가. 개인용 빌드는 문제없지만 Play 출시는 별도 심사 |
| **위젯** | `react-native-android-widget` | 잠금화면에서 바로 |

---

## 순서

1. Expo 가입 → `npx eas-cli login`
2. `eas.json` 의 `env` 세 칸 채우기
3. Supabase SQL 3개 실행 (아직이라면)
4. `npx eas-cli build --profile development --platform android`
5. 10~30분 뒤 링크로 APK 받아 폰에 설치
6. `npx expo start --dev-client` 로 붙여서 확인
7. 여기까지 되면 백그라운드 추적부터 코드 작업 시작

**1~3번까지가 사용자님 몫이고, 4번부터는 같이 하면 됩니다.**

---

## 안 해도 되는 것

- Google Play 개발자 등록 — 출시할 때만
- Apple Developer — iOS 를 할 때만
- Android Studio — 클라우드 빌드를 쓰면 불필요
- 신용카드 — 무료 티어 안에서는 등록 안 해도 됩니다
