import uuid from 'uuid'
import { ApiPromise, WsProvider } from '@polkadot/api'
import { keyring, query, signAndSend } from './utils/polkadotHelper'
import types from './utils/totem-polkadot-js-types'
import CouchDBStorage from './utils/CouchDBStorage'
import { generateHash } from './utils/utils'
import PromisE from './utils/PromisE'

// Environment variables
const dbHistory = new CouchDBStorage(null, 'faucet_history')
let connectionPromise = null
let walletAddress = null
let api, provider

export const log = (...args) => console.log(new Date().toISOString(), ...args)

const connect = async (nodeUrl) => {
    log('Connecting to Totem Blockchain Network...')
    // API provider
    provider = provider || new WsProvider(nodeUrl, true)

    // Create the API and wait until ready
    api = api || await ApiPromise.create({ provider, types })

    // Retrieve the chain & node information information via rpc calls
    const [chain, nodeName, nodeVersion] = await Promise.all([
        api.rpc.system.chain(),
        api.rpc.system.name(),
        api.rpc.system.version()
    ])

    log(`Connected to "${chain}" using "${nodeName}" v${nodeVersion}`)
    return {
        api,
        provider,
    }
}

export const getConnection = async (nodeUrl) => {
    if (!connectionPromise) {
        connectionPromise = await connect(nodeUrl)
    }
    await api.isReady
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

export const transfer = async (recipient, amount, rewardId, rewardType, limitPerType = 0) => {
    // connect to blockchain
    const { api } = await getConnection()
    const doc = await dbHistory.get(rewardId) || {
        amount,
        recipient,
        status: 'pending',
        type: rewardType,
    }

    // new entry
    if (!doc._id && limitPerType > 0) {
        const docs = await dbHistory.search(
            { recipient, type: rewardType },
            limitPerType,
            0,
            false,
        )
        const limitReached = docs
            .filter(({ _id }) => _id != rewardId)
            .length >= limitPerType
        if (limitReached) return {}
    }
    const balance = query(api.query.balances.freeBalance, walletAddress)
    if (balance < amount + 1000) throw new Error('Faucet server: insufficient funds')

    if (!!doc.txId) {
        // check transaction status
        const isStarted = await query(
            api,
            api.query
                .bonsai
                .isStarted,
            doc.txId,
        )

        // transaction already started. Wait 15 seconds to check if it was successful
        if (isStarted) await PromisE.delay(15000)

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
            : doc.status
        !!success && await dbHistory.set(rewardId, doc)
    }

    if (doc.status === 'success') return doc

    // construct a transaction
    doc.txId = randomHex(recipient, 'blake2', 256)
    const tx = await api.tx.transfer.networkCurrency(recipient, amount, doc.txId)

    // save record with pending status
    await dbHistory.set(rewardId, doc)

    // execute the transaction
    const [txHash] = await signAndSend(api, walletAddress, tx)
    doc.txHash = txHash
    doc.status = 'success'

    await dbHistory.set(rewardId, doc)
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


// initialize
setTimeout(async () => {
    // create an indexes, ignores if already exists
    const indexDefs = [
        {
            index: { fields: ['recipient', 'type'] },
            name: 'recipient-type-index',
        },
        {
            index: { fields: ['recipient'] },
            name: 'recipient-index',
        }
    ]
    const db = await dbHistory.getDB()
    indexDefs.forEach(def => db.createIndex(def).catch(() => { }))
})