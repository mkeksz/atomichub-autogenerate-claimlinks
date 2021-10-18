import AtomicGenerator from './src/AtomicGenerator'

async function start() {
  const atomic = new AtomicGenerator('', '', true, true)
  const assetPages = await atomic.getAssetIDs(undefined, 2, 3)
  for (const assetIDs of assetPages) {
    await atomic.generateClaimLinks(assetIDs)
  }
}

start().then()
