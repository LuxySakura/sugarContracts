# Sugar Contracts

基于最新版 Hardhat 3 初始化的 Solidity 合约仓库，已经整理好你当前的 `SugarCoin` 和 `Presale` 合约，并补好了测试与部署骨架。

## 当前技术栈

- Hardhat `3.2.0`
- viem
- TypeScript 配置文件与测试
- OpenZeppelin Contracts `5.6.1`
- 内置 Chainlink `AggregatorV3Interface` 接口
- Ignition 部署模块

## 目录结构

```text
contracts/
  Presale.sol
  SugarCoin.sol
  mocks/
ignition/modules/
test/
hardhat.config.ts
```

## 常用命令

```bash
pnpm install
pnpm build
pnpm test
```

启动本地 Hardhat 节点：

```bash
pnpm node
```

## 网络配置

配置文件里已经预留了 `sepolia` 网络。你可以用以下任一方式提供配置变量：

- 用环境变量设置 `SEPOLIA_RPC_URL` 和 `SEPOLIA_PRIVATE_KEY`
- 或使用 Hardhat keystore：

```bash
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
```

## 已包含内容

- `test/SugarCoin.ts`：覆盖初始铸币和交易开关限制
- `test/Presale.ts`：覆盖轮次开启与 USDT 购买流程
- `ignition/modules/SugarCoin.ts`：`SugarCoin` 部署模块
- `ignition/modules/Presale.ts`：`Presale` 部署模块

如果你后面要继续加合约，直接放进 `contracts/`，然后补测试到 `test/` 即可。
