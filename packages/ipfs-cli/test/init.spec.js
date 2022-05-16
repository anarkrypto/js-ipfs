/* eslint-env mocha */

import { expect } from 'aegir/chai'
import path from 'path'
import fs from 'fs'
import { nanoid } from 'nanoid'
import os from 'os'
import { unmarshalPrivateKey, supportedKeys } from '@libp2p/crypto/keys'
import { clean } from './utils/clean.js'
import { ipfsExec } from './utils/ipfs-exec.js'
import tempWrite from 'temp-write'
import { peerIdFromKeys } from '@libp2p/peer-id'
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'

describe('init', function () {
  let repoPath
  let ipfs

  const repoExistsSync = (p) => fs.existsSync(path.join(repoPath, p))

  const repoDirSync = (p) => {
    return fs.readdirSync(path.join(repoPath, p)).filter((f) => {
      return !f.startsWith('.')
    })
  }

  const repoConfSync = (p) => {
    return JSON.parse(fs.readFileSync(path.join(repoPath, 'config')))
  }

  beforeEach(() => {
    repoPath = os.tmpdir() + '/ipfs-' + nanoid()
    ipfs = ipfsExec(repoPath)
  })

  afterEach(() => clean(repoPath))

  it('basic', async function () {
    const out = await ipfs('init')
    expect(repoDirSync('blocks')).to.have.length.above(2)
    expect(repoExistsSync('config')).to.equal(true)
    expect(repoExistsSync('version')).to.equal(true)

    // Test that the following was written when init-ing the repo
    // jsipfs cat /ipfs/QmfGBRT6BbWJd7yUc2uYdaUZJBbnEFvTqehPFoSMQ6wgdr/readme
    const command = out.substring(out.indexOf('cat'), out.length - 2 /* omit the newline char */)
    const out2 = await ipfs(command)
    expect(out2).to.include('Hello and Welcome to IPFS!')
  })

  it('algorithm', async function () {
    await ipfs('init --algorithm ed25519')
    const buf = uint8ArrayFromString(repoConfSync().Identity.PrivKey, 'base64pad')
    const key = await unmarshalPrivateKey(buf)
    const peerId = await peerIdFromKeys(key.public.bytes, key.bytes)
    const privateKey = await unmarshalPrivateKey(peerId.privateKey)
    expect(privateKey).is.instanceOf(supportedKeys.ed25519.Ed25519PrivateKey)
  })

  it('bits', async function () {
    await ipfs('init --bits 1024')
    expect(repoDirSync('blocks')).to.have.length.above(2)
    expect(repoExistsSync('config')).to.equal(true)
    expect(repoExistsSync('version')).to.equal(true)
  })

  it('empty', async function () {
    await ipfs('init --bits 1024 --empty-repo true')
    expect(repoDirSync('blocks')).to.have.length(2)
    expect(repoExistsSync('config')).to.equal(true)
    expect(repoExistsSync('version')).to.equal(true)
  })

  it('profile', async function () {
    await ipfs('init --profile lowpower')
    expect(repoConfSync().Swarm.ConnMgr.LowWater).to.equal(20)
  })

  it('profile multiple', async function () {
    await ipfs('init --profile server,lowpower')
    expect(repoConfSync().Discovery.MDNS.Enabled).to.equal(false)
    expect(repoConfSync().Swarm.ConnMgr.LowWater).to.equal(20)
  })

  it('profile non-existent', async function () {
    await expect(ipfs('init --profile doesnt-exist'))
      .to.eventually.be.rejected()
      .and.to.have.property('stderr').that.includes('Could not find profile')
  })

  it('should present ipfs path help when option help is received', async function () {
    const res = await ipfs('init --help')
    expect(res).to.have.string('export IPFS_PATH=')
  })

  it('default config argument', async () => {
    const configPath = tempWrite.sync('{"Addresses": {"API": "/ip4/127.0.0.1/tcp/9999"}}', 'config.json')
    await ipfs(`init ${configPath}`)
    const configRaw = fs.readFileSync(path.join(repoPath, 'config')).toString()
    const config = JSON.parse(configRaw)
    expect(config.Addresses.API).to.be.eq('/ip4/127.0.0.1/tcp/9999')
  })
})
