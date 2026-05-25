Fill the `.json5` files in this directory before deploying.

Files:
- `sugar-price-oracle.base-sepolia.json5`: SugarPriceOracle deployment parameters for Base Sepolia
- `sugar-token.base-sepolia.json5`: SugarCommodityToken deployment parameters for Base Sepolia
- `sugar-coin.base.json5`: SugarCoin deployment parameters for Base mainnet
- `sugar-price-oracle.base.json5`: SugarPriceOracle deployment parameters for Base mainnet
- `sugar-token.base.json5`: SugarCommodityToken deployment parameters for Base mainnet

Notes:
- Ignition expects bigint values as strings ending with `n`, for example `"1000n"`.
- `nativeUsdFeedAddress` should be the official Chainlink ETH/USD feed address for the target network.
- `oracleAddress` in the SugarToken parameters must be the address of the deployed SugarPriceOracle.
- `usdcAddress` in the SugarToken parameters must be the official USDC token address for the target network.
- `usdtAddress` in the SugarToken parameters must be the official USDT token address for the target network.
- `updaterAddress` should normally be your backend hot wallet, not the admin multisig.

Deploy commands:
- `pnpm run ignition:deploy:base-sepolia:sugar-oracle`
- `pnpm run ignition:deploy:base-sepolia:sugar-token`
- `pnpm run ignition:deploy:base:sugar-coin`
- `pnpm run ignition:deploy:base:sugar-oracle`
- `pnpm run ignition:deploy:base:sugar-token`

Verify commands:
- `pnpm run ignition:verify:base:sugar-oracle`
