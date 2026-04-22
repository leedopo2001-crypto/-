// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Burnable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TicketNFT — 암표방지 티켓 NFT
/// @notice
///   - mint: 운영자(owner)만 호출. 공연/좌석/정가를 기록하면서 티켓 NFT 발행.
///   - transfer: 플랫폼 운영자 계정을 통해서만 이전 가능(앱 내부 거래만 허용).
///     lockDate 이후 전송 불가. 정가(price)는 컨트랙트 바깥 가격 검증에도
///     쓰이도록 on-chain에 기록하고, 이전 시 플랫폼이 제출한 price가
///     정가를 초과하면 revert.
///   - burn: 입장 완료 후 운영자가 소각.
///   - getTicketInfo: 티켓 상세 조회.
contract TicketNFT is ERC721, ERC721Burnable, Ownable {
    struct TicketInfo {
        uint256 eventId;
        uint256 seatId;
        uint256 price;     // 정가 (wei 단위 아님, 플랫폼에서 KRW 등 원화 정가를 기록)
        uint256 lockDate;  // 전송 잠김 시각 (unix seconds)
        uint256 mintedAt;
    }

    uint256 private _nextTokenId = 1;

    mapping(uint256 => TicketInfo) private _ticketInfo;

    event TicketMinted(uint256 indexed tokenId, address indexed to, uint256 indexed eventId, uint256 seatId, uint256 price);
    event TicketTransferred(uint256 indexed tokenId, address indexed from, address indexed to, uint256 pricePaid);
    event TicketBurned(uint256 indexed tokenId);
    event LockDateSet(uint256 indexed tokenId, uint256 lockDate);

    error PriceAboveFace(uint256 face, uint256 paid);
    error TransferLocked(uint256 lockDate, uint256 nowTs);
    error ExternalTransferForbidden();
    error TicketNotFound(uint256 tokenId);

    constructor(address initialOwner) ERC721("TicketNFT", "TIX") Ownable(initialOwner) {}

    /// @notice 티켓 민팅. 플랫폼 운영자만.
    function mint(
        address to,
        uint256 eventId,
        uint256 seatId,
        uint256 price,
        uint256 lockDate
    ) external onlyOwner returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        _ticketInfo[tokenId] = TicketInfo({
            eventId: eventId,
            seatId: seatId,
            price: price,
            lockDate: lockDate,
            mintedAt: block.timestamp
        });
        _safeMint(to, tokenId);
        emit TicketMinted(tokenId, to, eventId, seatId, price);
    }

    /// @notice 배치 민팅. 가스 절약용.
    function batchMint(
        address[] calldata recipients,
        uint256 eventId,
        uint256[] calldata seatIds,
        uint256 price,
        uint256 lockDate
    ) external onlyOwner returns (uint256[] memory tokenIds) {
        require(recipients.length == seatIds.length, "length mismatch");
        tokenIds = new uint256[](recipients.length);
        for (uint256 i = 0; i < recipients.length; i++) {
            uint256 tokenId = _nextTokenId++;
            _ticketInfo[tokenId] = TicketInfo({
                eventId: eventId,
                seatId: seatIds[i],
                price: price,
                lockDate: lockDate,
                mintedAt: block.timestamp
            });
            _safeMint(recipients[i], tokenId);
            emit TicketMinted(tokenId, recipients[i], eventId, seatIds[i], price);
            tokenIds[i] = tokenId;
        }
    }

    /// @notice 플랫폼 운영자가 호출하는 거래 전송. 정가 초과/lockDate 검증.
    /// @dev 앱 외부(EOA가 직접 transferFrom)로는 막고, 플랫폼이 owner 권한으로만 이전.
    function platformTransfer(uint256 tokenId, address to, uint256 pricePaid) external onlyOwner {
        TicketInfo memory info = _ticketInfo[tokenId];
        if (info.mintedAt == 0) revert TicketNotFound(tokenId);
        if (pricePaid > info.price) revert PriceAboveFace(info.price, pricePaid);
        if (info.lockDate != 0 && block.timestamp >= info.lockDate) {
            revert TransferLocked(info.lockDate, block.timestamp);
        }
        address from = ownerOf(tokenId);
        _transfer(from, to, tokenId);
        emit TicketTransferred(tokenId, from, to, pricePaid);
    }

    /// @notice 입장 완료 후 운영자가 소각.
    function burnByPlatform(uint256 tokenId) external onlyOwner {
        if (_ticketInfo[tokenId].mintedAt == 0) revert TicketNotFound(tokenId);
        _burn(tokenId);
        delete _ticketInfo[tokenId];
        emit TicketBurned(tokenId);
    }

    /// @notice lockDate 업데이트 (공연 일정 변경 대응).
    function setLockDate(uint256 tokenId, uint256 lockDate) external onlyOwner {
        if (_ticketInfo[tokenId].mintedAt == 0) revert TicketNotFound(tokenId);
        _ticketInfo[tokenId].lockDate = lockDate;
        emit LockDateSet(tokenId, lockDate);
    }

    /// @notice 티켓 정보 조회.
    function getTicketInfo(uint256 tokenId) external view returns (TicketInfo memory) {
        TicketInfo memory info = _ticketInfo[tokenId];
        if (info.mintedAt == 0) revert TicketNotFound(tokenId);
        return info;
    }

    // --- 외부 전송 차단 (운영자 경유만 허용) ------------------------------

    /// @dev ERC-721 표준 진입점을 가로채 외부 직접 전송을 금지하고,
    ///      운영자(owner)가 _transfer로 호출하는 경로만 허용한다.
    ///      OpenZeppelin v5의 _update 훅에서 판별.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721)
        returns (address)
    {
        address from = _ownerOf(tokenId);
        // 민팅(from==0)과 소각(to==0) 및 운영자 경유 호출은 허용.
        // 외부 EOA가 transferFrom/safeTransferFrom으로 직접 호출하면 auth != 0
        // 이면서 auth != owner() 인 경우이므로 차단한다.
        if (from != address(0) && to != address(0) && auth != address(0) && auth != owner()) {
            revert ExternalTransferForbidden();
        }
        return super._update(to, tokenId, auth);
    }
}
