import {FetchAtomic} from '../types/atomichub'
import fetch from 'node-fetch'

export function getFetchAtomic(): FetchAtomic {
  return fetch as unknown as FetchAtomic
}
