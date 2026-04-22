import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { ethers, artifacts, network } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`[deploy] network=${network.name} deployer=${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`[deploy] balance=${ethers.formatEther(balance)} (native)`);

  const Factory = await ethers.getContractFactory('TicketNFT');
  const contract = await Factory.deploy(deployer.address);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`[deploy] TicketNFT deployed at ${address}`);

  // ABI를 백엔드로 복사.
  const artifact = await artifacts.readArtifact('TicketNFT');
  const abiOut = path.resolve(__dirname, '../backend/src/abi/TicketNFT.json');
  fs.mkdirSync(path.dirname(abiOut), { recursive: true });
  fs.writeFileSync(
    abiOut,
    JSON.stringify(
      {
        contractName: 'TicketNFT',
        address,
        network: network.name,
        abi: artifact.abi,
      },
      null,
      2,
    ),
  );
  console.log(`[deploy] wrote ABI -> ${abiOut}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
