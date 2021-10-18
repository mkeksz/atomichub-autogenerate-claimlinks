import {KeyPair} from '@/src/types/eos'
import {Keygen} from 'eosjs-keygen'

export async function getRandomKeys(): Promise<KeyPair> {
  const keypair = await Keygen.generateMasterKeys()
  return {public: keypair.publicKeys.active, private: keypair.privateKeys.active}
}
