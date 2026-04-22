import 'dotenv/config';
import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || '';
const RPC_URL = process.env.POLYGON_RPC_URL || 'https://rpc-mumbai.maticvigil.com';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  paths: {
    sources: './contracts',
    artifacts: './artifacts',
    cache: './cache',
  },
  networks: {
    hardhat: {},
    localhost: { url: 'http://127.0.0.1:8545' },
    mumbai: {
      url: RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 80001,
    },
  },
};

export default config;
