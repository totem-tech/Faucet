import uuid from 'uuid'
import { BehaviorSubject } from 'rxjs'
import { ApiPromise, WsProvider } from '@polkadot/api'
import { getTxFee, keyring, query, signAndSend } from './utils/polkadotHelper'
import types from './utils/totem-polkadot-js-types'
import CouchDBStorage from './utils/CouchDBStorage'
import DataStorage from './utils/DataStorage'
import { generateHash, isFn, isValidNumber } from './utils/utils'
import PromisE from './utils/PromisE'
import { subjectAsPromise } from './utils/rx'
import { bytesToHex } from './utils/convert'

// Environment variables
export const dbHistory = new CouchDBStorage(null, 'faucet_history')
export const sendersIgnored = new Map(
    new DataStorage('addresses-ignored.json')
        .toArray()
        .map(([address, ignore]) => ignore && [address, ignore])
        .filter(Boolean)
)
let connectionPromise = null
export const senderAddresses = []
const senderBalances = []
const senderFails = []
const senderNonce = {}
const senderPairs = {}
let senderInUse = []
let api, currentBlock, provider, readyPromise, txFee
const maxTxPerAddress = parseInt(process.env.MaxTxPerAddress) || 1
const maxFailCount = parseInt(process.env.MaxFailCount) || 3
export const silectExecution = (process.env.SILENT_EXECUTION || '').toLowerCase() === 'yes'
export const saveOnly = (process.env.SAVE_ONLY || '').toLowerCase() === 'yes'

export const log = (...args) => console.log(new Date().toISOString(), ...args)

const addressLock = index => {
    const subject = senderInUse[index]
    if (!subject) return

    subject.next((subject.value || 0) + 1)
}

const addressRelease = index => {
    const subject = senderInUse[index]
    if (!subject) return

    subject.next(subject.value - 1)
}

const addressAwaitRelease = async () => {
    const promises = senderInUse.map((subject, i) =>
        subjectAsPromise(
            subject,
            // resolves when address becomes available
            numTx => !numTx || numTx < maxTxPerAddress,
        )
    )
    // wait for any address to become available
    await Promise.any(promises.map(([promise]) => promise))
    promises.forEach(([_, unsubscribe]) => unsubscribe())
}

const connect = async (nodeUrl) => {
    log('Connecting to Totem Blockchain Network:', nodeUrl)
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

    // get an estimated txFee for transfer amounts
    if (!txFee) {
        const alice = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'
        txFee = await getTxFee(
            api,
            alice,
            await api.tx.transfer.networkCurrency(
                alice,
                1000000,
                randomHex(),
            ),
            '//Alice'
        )
    }
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
    const blockSuccess = await query(
        api,
        api.query.bonsai.isSuccessful,
        [txId],
    )
    const blockStarted = blockSuccess || await query(
        api,
        api.query.bonsai.isStarted,
        [txId],
    )

    const status = blockSuccess
        ? 'success'
        : blockStarted
            ? 'started'
            : 'failed'
    return [status, blockStarted || 0, blockSuccess || 0]
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

/**
 * @name    getSender
 * 
 * @param   {*} amountToSend 
 * 
 * @returns {String}
 */
const getSender = async (amountToSend) => {
    await getConnection()
    const amountRequired = amountToSend + (txFee || 0)
    const gotBalance = senderBalances.find(balance => balance > amountRequired)
    await readyPromise
    // none of the addresses has enough funds
    if (!gotBalance) throw new Error('Faucet server: insufficient funds')

    const numBanned = senderFails
        .filter(c => maxFailCount && c >= maxFailCount)
        .length
    const allBanned = numBanned === senderAddresses.length
    if (allBanned) throw new Error('Faucet server: no useable sender addresses available')

    await addressAwaitRelease()
    const availableIndexes = senderInUse
        .map((subject, i) =>
            maxFailCount && senderFails[i] >= maxFailCount // prevent using an address if it failed 3 transactions
                ? null
                : subject.value < maxTxPerAddress
                    ? i
                    : null
        )
        .filter(x =>
            x !== null
            && senderBalances[x] > amountRequired
        )
    const index = availableIndexes[randomIndex(availableIndexes.length - 1)]
    let address = senderAddresses[index]
    if (!address) return await getSender(amountToSend)
    addressLock(index)
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

const randomIndex = max => parseInt(Math.random(max) * max)

export const transfer = async (recipient, amount, rewardId, rewardType, doExecuteTx = false, txId) => {
    // connect to blockchain
    const { api } = await getConnection()
    const doc = rewardId && await dbHistory.get(rewardId) || {
        amount,
        recipient,
        status: 'pending',
        type: rewardType,
    }

    if (process.env.TEST_RCIPIENT) {
        recipient = process.env.TEST_RCIPIENT
        doc.recipient = recipient
    }

    // new entry => check if reward limit per address has already reached
    // if (!doc._id && limitPerType > 0) {
    //     const docs = await dbHistory.search(
    //         {
    //             recipient,
    //             type: rewardType
    //         },
    //         limitPerType,
    //         0,
    //         false,
    //     )
    //     const limitReached = docs
    //         .filter(({ _id }) => _id != rewardId)
    //         .length >= limitPerType
    //     if (limitReached) {
    //         return {}
    //     }
    // }

    if (doc.status === 'success') {
        log(rewardId, 'rewards previously completed')
        return doc
    }
    if (!!doc.txId) {
        log(rewardId, 'Checking existing tx status')
        let [txStatus, blockStarted] = await checkTxStatus(api, doc.txId)

        // transaction already started. Wait 15 seconds to check if it was successful
        if (txStatus === 'started') {
            // re-attempted too quickly
            if (blockStarted <= currentBlock + 100) {
                doc.status = 'todo'
                await dbHistory.set(rewardId, doc)
                log(rewardId, 'Re-attempted to quickly', { blockStarted, currentBlock })
                return doc
            } else {
                txStatus = 'failed'
            }
        }

        // transaction was previously successful
        if (txStatus === 'success') {
            doc.status = txStatus
            await dbHistory.set(rewardId, doc)
            log(rewardId, 'TX previously completed')
            return doc
        }
        //continue to re-execute the transaction
    }

    // new transaction ID
    doc.txId = txId || randomHex(recipient, 'blake2', 256)

    // seta new temporary status so that these can be searched and executed later
    doc.status = saveOnly || silectExecution
        ? 'todo'
        : 'pending'
    // save record with pending status
    await dbHistory.set(rewardId, doc)
    if (!doExecuteTx && saveOnly) return doc

    log(rewardId, 'Awaiting sender allocation')
    const senderAddress = await getSender(amount)
    const senderIndex = senderAddresses.indexOf(senderAddress)
    const nonce = undefined
    log(rewardId, 'Sender allocated', {
        amount,
        balance: senderBalances[senderIndex],
        nonce,
        senderAddress,
        recipient,
    })
    const execute = async () => {
        // execute the treansaction
        const tx = await api.tx.transfer.networkCurrency(
            recipient,
            amount,
            doc.txId
        )
        const [txHash] = await signAndSend(
            api,
            senderAddress,
            tx,
            nonce,
            null,
            senderAddress
        ).catch(err => {
            const count = `${err}`.includes('Priority')
                ? maxFailCount
                : (senderFails[senderIndex] || 0) + 1
            senderFails[senderIndex] = count
            if (count >= maxFailCount) log('Sender failed too many subsequent transactions', senderAddress, count)
            return []
        })
        // reset fail count
        doc.txHash = txHash
        doc.status = !!txHash
            ? 'success'
            : 'error'
        senderFails[senderIndex] = doc.status !== 'success'
            ? senderFails[senderIndex]
            : 0
        await dbHistory.set(rewardId, doc)
    }

    // execute the transaction
    const executePromise = execute()
    // wait 1 second after execution before releasing the address
    executePromise.finally(() => addressRelease(senderIndex), 1000)

    // if silent mode is enabled, immediately return so that messaging server does not wait for a response
    if (!silectExecution) await executePromise
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
export const setupKeyring = async (seeds = []) => {
    if (setupKeyring.done) return
    setupKeyring.done = true
    let ready = {}
    let pairs = seeds.map(seed => keyring.keyring.addFromUri(seed))
    if (sendersIgnored.size > 0) {
        pairs = pairs.filter(p => !sendersIgnored.get(p.address))
    }
    const total = pairs.length
    senderInUse = new Array(total)
        .fill(0)
        .map(() => new BehaviorSubject(0))

    readyPromise = new Promise(async (resolve) => {
        let readyCount = 0
        do {
            await PromisE.delay(1000)
            readyCount = Object
                .values(ready)
                .flat()
                .filter(Boolean)
        } while (readyCount < total * 2)
        resolve(true)
    })

    getCurrentBlock(num => currentBlock = num)

    console.log('Total sender addresses:', total)

    // fetch nonces
    const addresses = pairs.map(x => x.address)
    const nonces = await query(
        api,
        api.query.system.accountNonce.multi,
        [addresses],
    )
    nonces.forEach((nonce, i) => {
        const address = addresses[i]
        senderNonce[address] = nonce || 0
        ready[address] = {
            balance: false,
            nonce: true,
        }
    })

    // subscribe & fetch balances
    for (let i = 0;i < total;i++) {
        const pair = pairs[i]
        if (!pair) throw new Error('Failed to add pair', pair)

        const { address } = pair
        senderPairs[address] = pair
        // already added
        if (senderAddresses.includes(address)) continue

        const index = senderAddresses.push(address) - 1
        // subscribe to keep track of address balances
        await query(
            api,
            api.query.balances.freeBalance,
            [
                address,
                balance => {
                    const changed = isValidNumber(senderBalances[index])
                    senderBalances[index] = balance
                    ready[address].balance = true
                    !changed && log(`Wallet balance ready ${i + 1}/${total} ${address}`, balance)
                },
            ])
    }

    // Test address release and locking mechanism as well as test transaction
    // readyPromise.then(() => {
    //     setTimeout(() => {
    //         new Array(1)
    //             .fill(0)
    //             .forEach(async (_, i) => {
    //                 const { api } = await getConnection()
    //                 const amount = 10
    //                 const sender = await getSender(amount)
    //                 const index = senderAddresses.indexOf(sender)
    //                 const alice = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'
    //                 const txId = generateHash()
    //                 const pair = senderPairs[sender]
    //                 const tx = await api.tx.transfer.networkCurrency(
    //                     alice,
    //                     amount,
    //                     txId
    //                 )
    //                 await signAndSend(
    //                     api,
    //                     sender,
    //                     tx,
    //                 )
    //                 setTimeout(() => {
    //                     console.log('Releasing sender', sender)
    //                     addressRelease(index)
    //                 }, randomIndex(6000))
    //             })
    //     }, 2000)
    // })
    return await readyPromise
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