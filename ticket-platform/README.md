# NFT 티켓 플랫폼

암표방지 NFT 티켓 플랫폼. 공연 티켓을 Polygon Mumbai 위의 ERC-721 NFT로 발급하고, 앱 안에서만 정가로 양도/재판매할 수 있게 한다.

## 구성

```
ticket-platform/
├── contracts/              # 스마트컨트랙트 (TicketNFT.sol) — Hardhat 프로젝트는 루트
├── backend/                # Node.js + Express + TypeScript + Prisma(SQLite)
├── frontend/               # React + Vite + TailwindCSS
├── hardhat.config.ts
└── package.json            # Hardhat 전용
```

## 스택

- 프론트엔드: React 18, Vite, TailwindCSS, React Router
- 백엔드: Node.js, Express, TypeScript, Prisma(SQLite), ethers v6, JWT, qrcode
- 블록체인: Polygon Mumbai, Solidity 0.8.24, Hardhat
- 결제: 토스페이먼츠 (샌드박스)

## 진행 상황

- [x] **1단계** 프로젝트 초기화 (폴더 구조, 프론트/백/Prisma/Hardhat 스캐폴딩)
- [x] **2단계** 스마트컨트랙트 (TicketNFT.sol) — 컴파일 및 ABI 추출 완료
- [x] **3단계** 실명인증 Mock + 서버사이드 지갑 자동 생성 + JWT + 온보딩 화면
- [ ] 4단계 공연 등록 / 민팅 (어드민)
- [ ] 5단계 내 티켓 + 동적 QR(30초) + 스태프 스캔
- [ ] 6단계 토스페이먼츠 결제
- [ ] 7단계 재판매 마켓
- [ ] 8단계 마무리

## 로컬 실행

```bash
# 백엔드
cd ticket-platform/backend
cp .env.example .env            # 필요 시 값 수정
npm install
npx prisma migrate dev
npm run dev                     # http://localhost:3000

# 프론트엔드 (새 터미널)
cd ticket-platform/frontend
npm install
npm run dev                     # http://localhost:5173
```

## 컨트랙트

ERC-721 기반, 플랫폼 운영자(owner)만 민팅/전송/소각 가능. 외부 EOA가 `transferFrom`을 직접 호출하면 `ExternalTransferForbidden()`로 revert. 전송 시 `pricePaid > price` 또는 `block.timestamp >= lockDate`면 revert.

```bash
cd ticket-platform
npm install

# 번들된 solc-js로 컴파일 (샌드박스/오프라인에서도 동작).
# artifacts/ 에 결과물이, backend/src/abi/TicketNFT.json 에 ABI가 나온다.
npm run compile

# Polygon Mumbai 배포 (DEPLOYER_PRIVATE_KEY 필요)
npx hardhat run scripts/deploy.ts --network mumbai
```

주요 외부 함수:

| 함수 | 설명 |
| --- | --- |
| `mint(to, eventId, seatId, price, lockDate)` | 티켓 NFT 발행 (owner 전용) |
| `batchMint(recipients[], eventId, seatIds[], price, lockDate)` | 일괄 민팅 |
| `platformTransfer(tokenId, to, pricePaid)` | 정가 초과/lockDate 검증하고 이전 |
| `burnByPlatform(tokenId)` | 입장 후 소각 |
| `setLockDate(tokenId, lockDate)` | 공연 일정 변경 대응 |
| `getTicketInfo(tokenId)` | `(eventId, seatId, price, lockDate, mintedAt)` |
