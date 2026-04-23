/**
 * Blockchain service with a mock fallback.
 *
 * Real mode activates when DEPLOYER_PRIVATE_KEY and POLYGON_RPC_URL are set.
 * Otherwise we run in mock mode: addresses, tokenIds and txHashes are fabricated
 * deterministically so the rest of the platform (DB, QR, transfer) still works
 * for demos without testnet MATIC. Failures in real mode fall back to mock
 * with a warning rather than blocking the demo.
 */
import crypto from 'node:crypto';
import { ethers, type InterfaceAbi } from 'ethers';
import fs from 'node:fs';
import path from 'node:path';

// Resolve ABI relative to the backend project root (cwd when running `npm run dev`).
const artifactPath = path.resolve(process.cwd(), 'src/abi/TicketNFT.json');
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as {
  abi: InterfaceAbi;
  bytecode?: string;
};
export const TICKET_NFT_ABI: InterfaceAbi = artifact.abi;
const BUNDLED_BYTECODE = (artifact.bytecode ?? '').trim();
const ENV_BYTECODE = (process.env.TICKET_NFT_BYTECODE ?? '').trim();
const TICKET_NFT_BYTECODE = ENV_BYTECODE || BUNDLED_BYTECODE;

function hasCreds(): boolean {
  return Boolean(
    process.env.DEPLOYER_PRIVATE_KEY &&
      process.env.POLYGON_RPC_URL &&
      TICKET_NFT_BYTECODE.length > 0,
  );
}

function getSigner(): ethers.Wallet {
  const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL!);
  return new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
}

function mockAddress(seed: string): string {
  const h = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 40);
  return ethers.getAddress('0x' + h);
}

function mockTxHash(seed: string): string {
  return '0xmock' + crypto.createHash('sha256').update(seed).digest('hex').slice(0, 60);
}

export interface DeployResult {
  address: string;
  txHash: string;
  mocked: boolean;
}

export async function deployTicketNFT(eventId: string): Promise<DeployResult> {
  if (!hasCreds()) {
    return {
      address: mockAddress('contract:' + eventId),
      txHash: mockTxHash('deploy:' + eventId),
      mocked: true,
    };
  }
  try {
    const signer = getSigner();
    const factory = new ethers.ContractFactory(TICKET_NFT_ABI, TICKET_NFT_BYTECODE, signer);
    const contract = await factory.deploy(signer.address);
    const receipt = await contract.deploymentTransaction()?.wait();
    return {
      address: await contract.getAddress(),
      txHash: receipt?.hash ?? '',
      mocked: false,
    };
  } catch (err) {
    console.warn('[blockchain] real deploy failed, falling back to mock:', err);
    return {
      address: mockAddress('contract:' + eventId),
      txHash: mockTxHash('deploy:' + eventId),
      mocked: true,
    };
  }
}

export interface BatchMintInput {
  contractAddress: string;
  recipients: string[]; // wallet addresses
  eventIdOnChain: number; // uint256 mirror of DB id index (we hash DB uuid to uint)
  seatIds: number[];
  price: number;
  lockDate: number; // unix seconds
}

export interface BatchMintResult {
  tokenIds: string[];
  txHash: string;
  mocked: boolean;
}

export async function batchMint(input: BatchMintInput): Promise<BatchMintResult> {
  const { contractAddress, recipients, eventIdOnChain, seatIds, price, lockDate } = input;
  if (recipients.length !== seatIds.length) {
    throw new Error('recipients/seatIds length mismatch');
  }
  if (!hasCreds()) {
    const tokenIds = recipients.map((r, i) =>
      BigInt(
        '0x' +
          crypto
            .createHash('sha256')
            .update(`${contractAddress}:${r}:${seatIds[i]}:${Date.now()}:${i}`)
            .digest('hex')
            .slice(0, 12),
      ).toString(),
    );
    return {
      tokenIds,
      txHash: mockTxHash('mint:' + contractAddress + ':' + recipients.join(',')),
      mocked: true,
    };
  }
  try {
    const signer = getSigner();
    const contract = new ethers.Contract(contractAddress, TICKET_NFT_ABI, signer);
    const tx = await contract.batchMint(recipients, eventIdOnChain, seatIds, price, lockDate);
    const receipt = await tx.wait();
    const tokenIds: string[] = [];
    for (const log of receipt.logs ?? []) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed && parsed.name === 'TicketMinted') {
          tokenIds.push(String(parsed.args.tokenId));
        }
      } catch {
        // ignore non-matching log
      }
    }
    return { tokenIds, txHash: receipt.hash, mocked: false };
  } catch (err) {
    console.warn('[blockchain] real mint failed, falling back to mock:', err);
    const tokenIds = recipients.map((r, i) =>
      BigInt(
        '0x' +
          crypto
            .createHash('sha256')
            .update(`${contractAddress}:${r}:${seatIds[i]}:${Date.now()}:${i}:fallback`)
            .digest('hex')
            .slice(0, 12),
      ).toString(),
    );
    return {
      tokenIds,
      txHash: mockTxHash('mint:' + contractAddress + ':' + recipients.join(',')),
      mocked: true,
    };
  }
}

export async function platformTransfer(
  contractAddress: string,
  tokenId: string,
  to: string,
  pricePaid: number,
): Promise<{ txHash: string; mocked: boolean }> {
  if (!hasCreds()) {
    return {
      txHash: mockTxHash(`transfer:${contractAddress}:${tokenId}:${to}:${pricePaid}`),
      mocked: true,
    };
  }
  try {
    const signer = getSigner();
    const contract = new ethers.Contract(contractAddress, TICKET_NFT_ABI, signer);
    const tx = await contract.platformTransfer(tokenId, to, pricePaid);
    const receipt = await tx.wait();
    return { txHash: receipt.hash, mocked: false };
  } catch (err) {
    console.warn('[blockchain] real transfer failed, falling back to mock:', err);
    return {
      txHash: mockTxHash(`transfer:${contractAddress}:${tokenId}:${to}:${pricePaid}`),
      mocked: true,
    };
  }
}

export async function burnTicket(
  contractAddress: string,
  tokenId: string,
): Promise<{ txHash: string; mocked: boolean }> {
  if (!hasCreds()) {
    return { txHash: mockTxHash(`burn:${contractAddress}:${tokenId}`), mocked: true };
  }
  try {
    const signer = getSigner();
    const contract = new ethers.Contract(contractAddress, TICKET_NFT_ABI, signer);
    const tx = await contract.burnByPlatform(tokenId);
    const receipt = await tx.wait();
    return { txHash: receipt.hash, mocked: false };
  } catch (err) {
    console.warn('[blockchain] real burn failed, falling back to mock:', err);
    return { txHash: mockTxHash(`burn:${contractAddress}:${tokenId}`), mocked: true };
  }
}

/** Deterministic uint mirror of a UUID, used when the contract needs a numeric eventId. */
export function eventIdToUint(uuid: string): number {
  const h = crypto.createHash('sha256').update(uuid).digest('hex').slice(0, 10);
  return Number.parseInt(h, 16);
}
