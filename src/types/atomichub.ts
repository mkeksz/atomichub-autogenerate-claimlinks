import {KeyPair} from './eos'

export type FetchAtomic = (input?: Request | string, init?: RequestInit) => Promise<Response>
export type ClaimLinkData = {assetID: number, keypair: KeyPair}
