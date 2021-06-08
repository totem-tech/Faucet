import uuid from 'uuid'
import { ApiPromise, WsProvider } from '@polkadot/api'
import { keyring, query, signAndSend } from './utils/polkadotHelper'
import types from './utils/totem-polkadot-js-types'
import CouchDBStorage from './utils/CouchDBStorage'
import { generateHash } from './utils/utils'

// Environment variables
const NODE_URL = 'wss://node1.totem.live'
const dbRewardsHistory = new CouchDBStorage(null, 'rewards_history')
let connectionPromise = null
let walletAddress = null

const connect = async (nodeUrl) => {
    console.log('Connecting to Totem Blockchain Network...')
    // API provider
    const provider = new WsProvider(nodeUrl)

    // Create the API and wait until ready
    const api = await ApiPromise.create({ provider, types })

    // Retrieve the chain & node information information via rpc calls
    const [chain, nodeName, nodeVersion] = await Promise.all([
        api.rpc.system.chain(),
        api.rpc.system.name(),
        api.rpc.system.version()
    ])

    console.log(`Connected to "${chain}" using "${nodeName}" v${nodeVersion}`)
    return {
        api,
        provider,
    }
}

export const getConnection = async (nodeUrl = NODE_URL) => {
    if (!connectionPromise) {
        connectionPromise = await connect(nodeUrl)
    }
    return await connectionPromise
}

/**
 * @name randomHex
 * @summary generates a hash using the supplied address and a internally generated time based UUID as seed.
 * 
 * @param {String} address 
 * 
 * @returns {String} hash
 */
export const randomHex = address => generateHash(`${address}${uuid.v1()}`)

export const transfer = async (recipient, amount, rewardId, type) => {
    // connect to blockchain
    const { api } = await getConnection()
    const doc = await dbRewardsHistory.get(rewardId) || {
        amount,
        recipient,
        status: 'pending',
        type,
    }

    if (!!doc.txId) {
        // Check if previously initiated tx was successful
        const success = await query(
            api,
            api.query
                .bonsai
                .isSuccessful,
            doc.txId,
        )
        doc.status = !!success
            ? 'success'
            : status
        !!success && await dbRewardsHistory.set(rewardId, doc)
    }

    if (doc.status === 'success') return doc

    // construct a transaction
    doc.txId = randomHex(recipient, 'blake2', 256)
    const tx = await api.tx.transfer.networkCurrency(recipient, amount, doc.txId)

    // save record with pending status
    await dbRewardsHistory.set(rewardId, doc)

    // execute the transaction
    const [txHash] = await signAndSend(api, walletAddress, tx)
    doc.txHash = txHash
    doc.status = 'success'

    await dbRewardsHistory.set(rewardId, doc)
    return doc
}

/**
 * @name    setupKeyring
 * @summary add public and private key pair to keyring
 * 
 * @param   {Object}    wallet 
 * @param   {String}    wallet.address
 * @param   {String}    wallet.secretkey
 * @param   {String}    wallet.secretkey
 * 
 * @returns {Boolean}
 */
export const setupKeyring = async (wallet = {}) => {
    await keyring.add([wallet])
    const { address } = wallet
    walletAddress = address
    return keyring.contains(address)
}