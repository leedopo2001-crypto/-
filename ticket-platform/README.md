# NFT 티켓 플랫폼

암표방지 NFT 티켓 플랫폼 — 공연 티켓을 Polygon Mumbai 위의 ERC-721 NFT로 발급하고, 앱 안에서만 정가로 양도/재판매할 수 있게 한다.

- **가격 정가 고정**: 리스팅/전송 시 면가(face price) 초과 불가 (스마트컨트랙트 + 서버 이중 검증)
- **플랫폼 내 거래만**: 외부 지갑에서 `transferFrom` 직접 호출 차단 (`ExternalTransferForbidden`)
- **플랫폼 수수료 5%**: 판매 금액의 5%가 자동 차감되어 `Transaction`에 기록
- **토스페이먼츠 샌드박스 결제**
- **QR 30초 자동 갱신**: HMAC-SHA256 서명 토큰, 캡처 공격 무력화
- **실명인증(Mock) + 서버 지갑**: 1인 1번호 강제, 개인키는 AES-256-GCM으로 DB 저장

## 진행 상황

- [x] **1단계** 프로젝트 초기화 (폴더 구조, 프론트/백/Prisma/Hardhat 스캐폴딩)
- [x] **2단계** 스마트컨트랙트 (TicketNFT.sol) — 컴파일 및 ABI 추출 완료
- [x] **3단계** 실명인증 Mock + 서버사이드 지갑 자동 생성 + JWT + 온보딩 화면
- [x] **4단계** 공연 등록 + NFT 일괄 민팅 (어드민)
- [x] **5단계** 내 티켓 목록 + 동적 QR(30초, HMAC-SHA256) + 스태프 카메라 스캔/소각
- [x] **6단계** 토스페이먼츠 샌드박스 결제 + 수수료 5% 정산
- [x] **7단계** 재판매 마켓 등록/구매/취소
- [x] **8단계** 모바일 UI 마무리 + 전체 시나리오 검증 + 문서

## 기술 스택

- **프론트엔드**: React 18, Vite, TailwindCSS, React Router
- **백엔드**: Node.js, Express, TypeScript, Prisma(SQLite), ethers v6, JWT, qrcode
- **블록체인**: Polygon Mumbai, Solidity 0.8.24, OpenZeppelin v5, Hardhat
- **결제**: 토스페이먼츠 (샌드박스)
- **스캐너**: jsQR + getUserMedia (모바일 후면 카메라)

## 폴더 구조

```
ticket-platform/
├── contracts/TicketNFT.sol           # 스마트컨트랙트 (ERC-721 + Burnable + Ownable)
├── hardhat.config.ts                 # Polygon Mumbai 네트워크 설정
├── scripts/
│   ├── compile.ts                    # solc-js 기반 standalone 컴파일러
│   └── deploy.ts                     # Hardhat 배포 스크립트 (Mumbai)
├── backend/
│   ├── prisma/schema.prisma          # User/Event/SeatGrade/Ticket/Listing/Transaction/Order
│   └── src/
│       ├── app.ts
│       ├── abi/TicketNFT.json        # 컴파일 산출물
│       ├── lib/{prisma,wallet,jwt}.ts
│       ├── middleware/{auth,admin}.ts
│       ├── services/
│       │   ├── blockchain.ts         # ethers + mock 폴백
│       │   ├── qr.ts                 # HMAC-SHA256 30s 토큰
│       │   ├── toss.ts               # 토스 confirm API
│       │   └── market.ts             # 정산 (transfer + fee + tx 기록)
│       └── routes/{auth,admin,tickets,qr,payment,market}.ts
└── frontend/
    └── src/
        ├── App.tsx                   # RequireAuth 가드 + 라우팅
        ├── lib/{api,auth,toss}.ts    # 프론트 HTTP + 세션 + 토스 SDK 로더
        ├── components/{BottomNav,QRDisplay,TicketCard}.tsx
        └── pages/
            ├── Onboarding.tsx        # 실명인증 + 자동 지갑 생성
            ├── Home.tsx              # 내 티켓 + 하단 탭
            ├── Ticket.tsx            # 상세 + 30초 QR + 마켓 등록
            ├── Market.tsx            # 전체/내판매 + 구매(토스)
            ├── Admin.tsx             # 공연 등록 + 일괄 민팅
            ├── Staff.tsx             # 카메라 스캐너 + 입장 승인/거부
            ├── Profile.tsx           # 지갑/통계 + 로그아웃
            └── PaymentResult.tsx     # /payment/success, /payment/fail
```

## 로컬 실행

### 1) 백엔드

```bash
cd ticket-platform/backend
cp .env.example .env                    # 필요 시 키 교체
npm install
npx prisma migrate dev                  # SQLite 스키마 동기화
npm run dev                             # http://localhost:3000
```

### 2) 프론트엔드 (새 터미널)

```bash
cd ticket-platform/frontend
npm install
npm run dev                             # http://localhost:5173 (API는 /api/* 프록시)
```

### 3) 스마트컨트랙트 (선택)

```bash
cd ticket-platform
npm install
npm run compile                         # solc-js, 오프라인 OK → artifacts/ + backend/src/abi/
npx hardhat run scripts/deploy.ts --network mumbai   # DEPLOYER_PRIVATE_KEY 필요
```

## 환경변수 (`backend/.env`)

| 이름 | 설명 |
| --- | --- |
| `JWT_SECRET` | JWT 서명 비밀키 |
| `QR_HMAC_SECRET` | QR 토큰 HMAC 비밀키 |
| `WALLET_ENC_KEY` | 개인키 AES 암호화 키 (64자 hex 또는 패스프레이즈) |
| `DATABASE_URL` | `file:./database.sqlite` (기본) |
| `POLYGON_RPC_URL` | 예: `https://rpc-mumbai.maticvigil.com` |
| `DEPLOYER_PRIVATE_KEY` | 운영자 지갑 개인키 (미설정 시 mock 모드) |
| `TICKET_NFT_BYTECODE` | 선택. 지정 시 이 바이트코드로 배포, 아니면 `src/abi/TicketNFT.json` 사용 |
| `TOSS_CLIENT_KEY` / `TOSS_SECRET_KEY` | 토스페이먼츠 테스트 키 |
| `TOSS_MOCK` | `"1"`이면 confirm API 호출 건너뜀 (데모용). `paymentKey`가 `mock_`로 시작해도 같은 효과 |
| `ADMIN_PHONE` | 어드민 판별용 전화번호 (digits only 매칭) |
| `PLATFORM_FEE_RATE` | 기본 `0.05` |
| `PORT` | 기본 `3000` |

## 어드민 접근

`ADMIN_PHONE`에 설정한 번호로 가입/로그인한 사용자만 `/api/admin/*` 및 `/admin` 화면에 접근 가능. 외의 계정은 `Admin.tsx`에서 친절한 안내를 표시하고 403을 반환한다.

## 블록체인 실/모의 모드

블록체인 서비스는 다음 조건을 모두 충족하면 실거래 모드로 동작:

- `DEPLOYER_PRIVATE_KEY` 설정됨
- `POLYGON_RPC_URL` 설정됨
- `src/abi/TicketNFT.json`에 `bytecode` 존재 (또는 `TICKET_NFT_BYTECODE` 주입)

실거래 중 네트워크 오류 등으로 실패하면 자동으로 mock으로 폴백하고 경고 로그만 남긴다. Mock 모드에서도 주소/토큰ID/tx hash가 결정적으로 생성되어 이후 플로우(QR, 양도, 소각)가 그대로 동작한다.

## API 요약

| Method | Path | 설명 |
| --- | --- | --- |
| `POST` | `/api/auth/register` | 실명인증 Mock + 지갑 생성 + JWT |
| `POST` | `/api/auth/login` | 이름+번호 로그인 |
| `GET`  | `/api/auth/me` | 세션 복원 |
| `GET`  | `/api/tickets/my` | 내 티켓 목록 |
| `GET`  | `/api/tickets/:id` | 티켓 상세 |
| `GET`  | `/api/tickets/:id/qr` | 30초 동적 QR 발급 |
| `POST` | `/api/qr/verify` | 스태프 스캔 — 검증 + 소각 + `used` 마킹 |
| `GET`  | `/api/market` | 판매중 리스팅 (공개) |
| `GET`  | `/api/market/my` | 내 판매글 |
| `POST` | `/api/market/list` | 판매 등록 (가격은 서버가 정가로 강제) |
| `POST` | `/api/market/buy/:id` | 구매 시작 → 토스 위젯 파라미터 |
| `DELETE` | `/api/market/:id` | 판매 취소 |
| `GET`  | `/api/payment/config` | 토스 클라이언트 키 |
| `POST` | `/api/payment/confirm` | `{paymentKey,orderId,amount}` → 토스 승인 + 정산 |
| `POST` | `/api/payment/fail` | 결제 실패/취소 기록 |
| `POST` | `/api/admin/events` | 공연 등록 + 컨트랙트 배포 |
| `GET`  | `/api/admin/events` | 어드민 공연 목록 |
| `POST` | `/api/admin/events/:id/mint` | 지갑 배열에 일괄 민팅 |

## 시나리오 검증 (스펙 7단계)

`backend/`에 백엔드 띄운 뒤 다음을 HTTP로 돌려 전체 플로우를 자동 검증할 수 있다.

1. 어드민 가입/로그인 → `POST /api/admin/events` → `POST /api/admin/events/:id/mint`
2. 팬A 가입 → 어드민이 팬A 지갑 주소로 민팅
3. 팬A `GET /api/tickets/:id/qr` 재호출 시 토큰 서명/`iat` 갱신 확인
4. 팬A `POST /api/market/list` 호출 시 `price:1` 같은 조작 페이로드를 보내도 서버가 `ticket.price`로 덮어씀. 리스팅 중 QR 요청은 `409 ticket_listed_for_sale`
5. 팬B 가입 → `POST /api/market/buy/:id` → `POST /api/payment/confirm`(mock 경로) → `Transaction.fee = floor(price × 0.05)`, 소유자 교체
6. 팬B QR → 스태프 `POST /api/qr/verify` → `ok:true` + `holderNameMasked`, 재스캔 → `already_used`
7. 과거 `lockDate`로 공연을 만들고 민팅 → 판매 등록 시 `409 lock_passed`

실제 토스 위젯 화면까지 포함한 플로우는 프론트엔드 dev 서버(`npm run dev`)에서 Onboarding → Home → Ticket → Market 순으로 확인할 수 있다. 위젯이 `successUrl=/payment/success`로 리다이렉트하면 자동으로 `/api/payment/confirm`이 호출된다.

## 보안 요약

- 개인키는 서버가 보관하되 `WALLET_ENC_KEY`로 AES-256-GCM 암호화 후 저장
- QR 토큰은 `base64url(payload).base64url(HMAC-SHA256)` 구조, 검증은 `crypto.timingSafeEqual`
- JWT는 30일 만료, `Authorization: Bearer`로만 인증 라우트 접근 가능
- 스마트컨트랙트가 외부 EOA의 `transferFrom`을 `_update` 훅에서 revert — 앱 우회 불가
- 컨트랙트가 `pricePaid > face`를 revert → 정가 이상 불가
- 서버 `market.ts`가 동일한 정가/락일시/판매자≠구매자 검증을 한 번 더 수행
- 결제 confirm 단계에서 `Order.amount`와 실제 금액이 일치하지 않으면 400 → 금액 변조 방지

## 알려진 제약

- 샌드박스 환경에서 `binaries.soliditylang.org` 접근이 막힐 수 있어 `hardhat compile` 대신 번들된 solc-js를 사용하는 `npm run compile` 스크립트를 제공
- 토스 위젯 자체는 브라우저가 필요하므로 서버 단독 스모크 테스트에서는 `TOSS_MOCK=1` 또는 `paymentKey="mock_*"` 경로로 확인
- 스캐너(`/staff`)는 카메라 권한이 필요 → 로컬 개발은 `http://localhost:5173`에서만 동작
