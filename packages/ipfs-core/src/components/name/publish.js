
import debug from 'debug'
import parseDuration from 'parse-duration'
import crypto from 'libp2p-crypto'
import errcode from 'err-code'
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'
import { toString as uint8ArrayToString } from 'uint8arrays/to-string'
import { OFFLINE_ERROR, normalizePath } from '../../utils.js'
import { withTimeoutOption } from 'ipfs-core-utils/with-timeout-option'
import { resolvePath } from './utils.js'

const log = Object.assign(debug('ipfs:name:publish'), {
  error: debug('ipfs:name:publish:error')
})

/**
 * IPNS - Inter-Planetary Naming System
 *
 * @param {Object} config
 * @param {import('../ipns').IPNSAPI} config.ipns
 * @param {import('ipfs-repo').IPFSRepo} config.repo
 * @param {import('ipfs-core-utils/multicodecs').Multicodecs} config.codecs
 * @param {import('peer-id')} config.peerId
 * @param {import('ipfs-core-types/src/root').API["isOnline"]} config.isOnline
 * @param {import('libp2p/src/keychain')} config.keychain
 */
export function createPublish ({ ipns, repo, codecs, peerId, isOnline, keychain }) {
  /**
   * @param {string} keyName
   */
  const lookupKey = async keyName => {
    if (keyName === 'self') {
      return peerId.privKey
    }

    try {
      // We're exporting and immediately importing the key, so we can just use a throw away password
      const pem = await keychain.exportKey(keyName, 'temp')
      const privateKey = await crypto.keys.import(pem, 'temp')
      return privateKey
    } catch (/** @type {any} */ err) {
      log.error(err)
      throw errcode(err, 'ERR_CANNOT_GET_KEY')
    }
  }

  /**
   * @type {import('ipfs-core-types/src/name').API["publish"]}
   */
  async function publish (value, options = {}) {
    const resolve = !(options.resolve === false)
    const lifetime = options.lifetime || '24h'
    const key = options.key || 'self'

    if (!isOnline()) {
      throw errcode(new Error(OFFLINE_ERROR), 'OFFLINE_ERROR')
    }

    // TODO: params related logic should be in the core implementation
    // Normalize path value
    try {
      value = normalizePath(value)
    } catch (/** @type {any} */ err) {
      log.error(err)
      throw err
    }

    let pubLifetime = 0
    try {
      pubLifetime = parseDuration(lifetime) || 0

      // Calculate lifetime with nanoseconds precision
      pubLifetime = parseFloat(pubLifetime.toFixed(6))
    } catch (/** @type {any} */ err) {
      log.error(err)
      throw err
    }

    // TODO: ttl human for cache
    const results = await Promise.all([
      // verify if the path exists, if not, an error will stop the execution
      lookupKey(key),
      // if resolving, do a get so we make sure we have the blocks
      resolve ? resolvePath({ ipns, repo, codecs }, value) : Promise.resolve()
    ])

    const bytes = uint8ArrayFromString(value)

    // Start publishing process
    const result = await ipns.publish(results[0], bytes, pubLifetime)

    return {
      name: result.name,
      value: uint8ArrayToString(result.value)
    }
  }

  return withTimeoutOption(publish)
}
