import {AssetsSort, OrderParam} from 'atomicassets/build/API/Explorer/Enums'
import {LIMIT_ASSETS_ON_PAGE, MS_TIMEOUT_API_ATOMICHUB} from '@/config'
import {AssetsApiParams} from 'atomicassets/build/API/Explorer/Params'
import {IAsset} from 'atomicassets/build/API/Explorer/Objects'
import {getFetchAtomic} from '@/src/util/fetch'
import {ExplorerApi} from 'atomicassets'
import {sleep} from '@/src/util/sleep'
import {JsSignatureProvider} from 'eosjs/dist/eosjs-jssig'
import {Api, JsonRpc} from 'eosjs'
import * as waxjs from '@waxio/waxjs/dist'
import {Action} from 'eosjs/dist/eosjs-serialize'
import {ClaimLinkData} from '@/src/types/atomichub'
import {getRandomKeys} from '@/src/util/keys'
import {KeyPair} from './types/eos'

export default class AtomicGenerator {
  private readonly logging: boolean
  private readonly testnet: boolean
  private readonly URLAPIAtomicAssets: string
  private readonly RPCWax: string
  private readonly privateKey?: string
  private account?: string
  private wax?: waxjs.WaxJS

  public constructor(account?: string, privateKey?: string, logging = false, testnet = false) {
    this.logging = logging
    this.account = account
    this.privateKey = privateKey
    this.testnet = testnet
    this.URLAPIAtomicAssets = testnet ? 'https://test.wax.api.atomicassets.io' : 'https://wax.api.atomicassets.io'
    this.RPCWax = testnet ? 'https://testnet.wax.pink.gg' : 'https://wax.pink.gg'
  }

  public async login(): Promise<string> {
    if (this.account) return this.account
    this.wax = new waxjs.WaxJS({rpcEndpoint: this.RPCWax, tryAutoLogin: false})
    this.account = String(await this.wax.login())
    return this.account
  }

  public async getAssetIDs(name?: string, limit = LIMIT_ASSETS_ON_PAGE, maxPage?: number): Promise<number[][]> {
    if (!this.account) throw new Error('Before call this method login or add account and privateKey to constructor')
    const api = new ExplorerApi(this.URLAPIAtomicAssets, 'atomicassets', {fetch: getFetchAtomic()})
    const options: AssetsApiParams = {
      owner: this.account,
      burned: false,
      hide_offers: true,
      sort: AssetsSort.AssetId,
      order: OrderParam.Desc,
      match: name ?? ''
    }

    const assetPages: IAsset[][] = []
    let page = 1
    let loop = true

    while (loop) {
      const resultAssets = await api.getAssets(options, page, limit)
      const assetsToConcat: IAsset[] = []
      for (const asset of resultAssets) {
        if (name && asset.name.replace('\t','') !== name) continue
        const targetAsset = assetPages.findIndex(assetsPage => {
          let has = false
          for (const assetPage of assetsPage) {
            if (assetPage.asset_id === asset.asset_id) {
              has = true
              break
            }
          }
          return has
        })
        if (targetAsset === -1) assetsToConcat.push(asset)
      }
      assetPages.push(assetsToConcat)
      const allAssets = assetPages.reduce((previous, current) => previous.concat(current))
      if (resultAssets.length < limit) loop = false
      else {
        if (this.logging) console.log('Getting assets...', 'Total assets:', allAssets.length)
        if (page === maxPage) loop = false
        page++
        await sleep(MS_TIMEOUT_API_ATOMICHUB)
      }
    }
    const allAssets = assetPages.reduce((previous, current) => previous.concat(current))
    if (this.logging) console.log('Completed getting assets!', 'Total assets:', allAssets.length)
    return assetPages.map(assetPage => assetPage.map(asset => Number(asset.asset_id)))
  }

  public async generateClaimLinks(assetIDs: number[]): Promise<string[]> {
    if (!this.account) throw new Error('Before call this method login or add account and privateKey to constructor')
    if (assetIDs.length === 0) return []
    if (this.logging) console.log('Getting data claim links...')
    const claimLinkData: {assetID: number; keypair: KeyPair}[] = await Promise.all(assetIDs.map(async assetID => {
      const keypair = await getRandomKeys()
      return {assetID, keypair: keypair}
    }))
    if (this.logging) console.log('Generating actions transact...')
    const actions = this.getAllActionsForGenerateClaimLinks(claimLinkData)
    const api = this.getWaxAPI()
    const transactOptions = {blocksBehind: 3, expireSeconds: 30}
    if (this.logging) console.log('Sending transact...')
    const resultTransact = await api.transact({actions}, transactOptions)

    let traceLinksData: {link_id: number, key: string}[]
    if ('processed' in resultTransact) {
      const filterActionTraces = resultTransact.processed.action_traces.filter(trace => trace.receiver === 'atomictoolsx')
      traceLinksData = filterActionTraces.map(trace => trace.inline_traces![0].act.data as {link_id: number, key: string})
    } else throw new Error(`not processed: ${resultTransact}`)

    if (this.logging) console.log('Transact completed!', '\nGetting claim links...')
    const links = traceLinksData.map(traceLinkData => {
      const targetClaimLinkData = claimLinkData.find(claimLinkDatum => claimLinkDatum.keypair.public === traceLinkData.key)
      if (!targetClaimLinkData) throw new Error('Wrong generate key of links')
      const privateKey = targetClaimLinkData.keypair.private
      return `https://${this.testnet ? 'wax-test' : 'wax'}.atomichub.io/trading/link/${traceLinkData.link_id}?key=${privateKey}`
    })
    if (this.logging) console.log('Claim links successfully created!\n', links)
    return links
  }

  private getAllActionsForGenerateClaimLinks(claimLinkData: ClaimLinkData[]): Action[] {
    const allActions: Action[] = []
    for (const claimLinkDatum of claimLinkData) {
      const actions = this.getActionsForGenerateClaimLink(claimLinkDatum)
      for (const action of actions) {
        allActions.push(action)
      }
    }
    return allActions
  }

  private getActionsForGenerateClaimLink(claimLinkData: ClaimLinkData): Action[] {
    return [
      {
        account: 'atomictoolsx',
        name: 'announcelink',
        authorization: [{
          actor: this.account!,
          permission: 'active',
        }],
        data: {
          creator: this.account,
          key: claimLinkData.keypair.public,
          asset_ids: [claimLinkData.assetID],
          memo: ''
        }
      },
      {
        account: 'atomicassets',
        name: 'transfer',
        authorization: [{
          actor: this.account!,
          permission: 'active',
        }],
        data: {
          from: this.account,
          to: 'atomictoolsx',
          asset_ids: [claimLinkData.assetID],
          memo: 'link'
        }
      }
    ]
  }

  private getWaxAPI(): Api {
    if (this.privateKey) {
      const signatureProvider = new JsSignatureProvider([this.privateKey])
      const rpc = new JsonRpc(this.RPCWax, {fetch: getFetchAtomic()})
      return new Api({rpc, signatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder()})
    }
    if (!this.wax || !this.account) throw new Error('Before call this method login or add account and privateKey to constructor')
    return this.wax.api
  }
}
