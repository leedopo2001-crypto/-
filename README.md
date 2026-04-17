# here 🆘

긴급 SOS React Native (Expo) 앱.

## 기능
- 화면 중앙의 큰 빨간 원형 SOS 버튼
- 2초 길게 눌러야 전송 (실수 방지) — 원형 프로그레스로 시각적 피드백
- 도중에 손을 떼면 취소
- 현재 GPS 좌표 기반 구글맵 링크를 포함한 문자를 모든 연락처에 동시 전송
- 메시지: `🆘 [here] 긴급상황! 현재 위치: https://maps.google.com/?q={위도},{경도}`
- GPS 취득 실패 시 `위치 없음` 으로 대체
- 전송 중 버튼 비활성화 (중복 전송 방지)
- 전송 완료 시 초록색 토스트 표시

## 실행

```bash
npm install
npx expo start
```

Expo Go 앱으로 QR 코드를 스캔해서 실행할 수 있습니다.

## 연락처 변경
`App.js` 상단의 `EMERGENCY_CONTACTS` 상수를 수정하세요.

```js
const EMERGENCY_CONTACTS = [
  "+821012345678",
  "+821087654321",
];
```

## 권한
- 위치(Location): 앱 실행 시 요청
- SMS: 문자 발송 시 OS 기본 문자 앱이 열립니다 (expo-sms)

## 참고
- `expo-sms`는 Expo Go에서 네이티브 SMS 컴포저를 호출합니다. 실기기에서 테스트하세요.
- iOS/Android 시뮬레이터에서는 SMS 전송이 불가합니다.
