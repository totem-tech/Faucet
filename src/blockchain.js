import uuid from 'uuid'
import { ApiPromise, WsProvider } from '@polkadot/api'
import { getTxFee, keyring, query, signAndSend } from './utils/polkadotHelper'
import types from './utils/totem-polkadot-js-types'
import CouchDBStorage from './utils/CouchDBStorage'
import { generateHash, isValidNumber } from './utils/utils'
import PromisE from './utils/PromisE'

// Environment variables
const dbHistory = new CouchDBStorage(null, 'faucet_history')
let connectionPromise = null
const senderAddresses = []
const senderBalances = []
const senderInUse = []
let lastIndex = -1
let api, provider, txFee

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

    await api.isReady
    log(`Connected to "${chain}" using "${nodeName}" v${nodeVersion}`)
    return {
        api,
        provider,
    }
}

/**
 * @name    checkTxStatus
 * 
 * @param   {ApiPromise} api 
 * @param   {String}     txId 
 * 
 * @returns {String}    failed | started | success
 */
const checkTxStatus = async (api, txId) => {
    const [blockStarted = 0, blockSuccess = 0] = await query(
        api,
        api.queryMulti,
        [[
            [api.query.bonsai.isStarted, txId],
            [api.query.bonsai.isSuccessful, txId],
        ]],
    )

    const status = !blockSuccess
        ? blockStarted
            ? 'started'
            : 'failed'
        : 'success'
    return [status, blockStarted, blockSuccess]
}

export const getConnection = async (nodeUrl) => {
    connectionPromise = connectionPromise || connect(nodeUrl)
    return await connectionPromise
}

/**
 * @name    getCurrentBlock
 * @summary get current block number
 * 
 * @param   {Function} callback (optional) to subscribe to block number changes
 * 
 * @returns {Number|Function} latest block number if `@callback` not supplied, otherwise, function to unsubscribe
 */
export const getCurrentBlock = async (callback) => {
    if (!api) await connectionPromise
    if (!isFn(callback)) {
        const res = await query(api, 'api.rpc.chain.getBlock')
        try {
            return res.block.header.number
        } catch (e) {
            log('Unexpected error reading block number', e)
            return 0
        }
    }
    return query(api, 'api.rpc.chain.subscribeNewHeads', [res => callback(res.number)])
}

const getSender = async (amountToSend, retry = senderAddresses.length) => {
    await getConnection()

    const len = senderAddresses.length
    if (len === 0) throw new Error('No sender wallet found!')

    lastIndex = len === 1
        || lastIndex === -1
        || lastIndex + 1 >= len
        ? 0
        : lastIndex + 1
    // console.log({ lastIndex })
    let address = senderAddresses[lastIndex]
    // get an estimated txFee for transfer amounts
    if (!txFee) {
        txFee = getTxFee(
            api,
            address,
            await api.tx.transfer.networkCurrency(
                address,
                1000000,
                randomHex(),
            ),
        )
    }
    const amountRequired = amountToSend + await txFee
    const balance = await senderBalances[lastIndex]
    const gotBalance = balance > amountRequired
    // console.log({ txFee, amountRequired, balance, address })
    if (!gotBalance) {
        address = null
        if (retry > 1) {
            address = await getSender(amountToSend, --retry)
        }
    }
    if (!address && !retry) throw new Error('Faucet server: insufficient funds')
    return address
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
            {
                recipient,
                type: rewardType
            },
            limitPerType,
            0,
            false,
        )
        const limitReached = docs
            .filter(({ _id }) => _id != rewardId)
            .length >= limitPerType
        if (limitReached) return {}
    }

    if (doc.status === 'success') return doc
    if (!!doc.txId) {
        let [txStatus, blockStarted] = await checkTxStatus(api, doc.txId)

        // transaction already started. Wait 15 seconds to check if it was successful
        if (txStatus === 'started') {
            const currentBlock = await getCurrentBlock(api)
            // re-attempted too quickly
            if (blockStarted === currentBlock) {
                // wait 15 seconds
                await PromisE.delay(15000)
                // get status again
                txStatus = (await checkTxStatus(api, doc.txId))[0]
            } else {
                txStatus = 'failed'
            }
        }

        // transaction was previously successful
        if (txStatus === 'success') {
            doc.status = txStatus
            await dbHistory.set(rewardId, doc)
            return doc
        }
        //continue to re-execute the transaction
    }

    // construct a transaction
    doc.txId = randomHex(recipient, 'blake2', 256)

    // seta new temporary status so that these can be searched and executed later
    doc.status = 'todo' // 'pending'
    // save record with pending status
    await dbHistory.set(rewardId, doc)
    // return doc

    const senderAddress = await getSender()
    const balance = await query(api, api.query.balances.freeBalance, [senderAddress])
    log(rewardId, {
        amount,
        senderAddress,
        balance: senderBalances[senderAddresses.indexOf(senderAddress)],
    })
    // execute the treansaction
    const tx = await api.tx.transfer.networkCurrency(recipient, amount, doc.txId)


    // execute the transaction
    const [txHash] = await signAndSend(api, sender, tx)
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
    if (senderAddresses.indexOf(wallet.address) >= 0) return
    console.log(wallet.address)
    await keyring.add([wallet])
    const { address } = wallet
    const index = senderAddresses.push(address) - 1

    // subscribe to keep track of address balances
    await getConnection()
    let balance
    senderBalances[index] = new Promise(async (resolve) => {
        do {
            await PromisE.delay(1000)
        } while (!isValidNumber(balance))
        resolve(balance)
    })
    await query(
        api,
        api.query.balances.freeBalance,
        [
            address,
            newBalance => {
                if (!!balance) getSender(100000).then(console.log)
                balance = newBalance
                senderBalances[index] = balance
            },
        ])
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
        },
        {
            index: { fields: ['status'] },
            name: 'status-index',
        },
    ]
    const db = await dbHistory.getDB()
    indexDefs.forEach(def => db.createIndex(def).catch(() => { }))
})