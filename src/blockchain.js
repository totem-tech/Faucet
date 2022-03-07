import uuid from 'uuid'
import { BehaviorSubject } from 'rxjs'
import { ApiPromise, WsProvider } from '@polkadot/api'
import { getTxFee, keyring, query, signAndSend } from './utils/polkadotHelper'
import types from './utils/totem-polkadot-js-types'
import CouchDBStorage from './utils/CouchDBStorage'
import { generateHash, isFn, isValidNumber } from './utils/utils'
import PromisE from './utils/PromisE'
import { subjectAsPromise } from './utils/reactHelper'

// Environment variables
const dbHistory = new CouchDBStorage(null, 'faucet_history')
let connectionPromise = null
const senderAddresses = []
const senderBalances = []
const senderFails = []
let senderInUse
let readyPromise, currentBlock
let api, provider, txFee
const maxTxPerAddress = parseInt(process.env.MaxTxPerAddress) || 1
const maxFailCount = parseInt(process.env.MaxFailCount) || 3
const senderNonce = []

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
            numTx => numTx < maxTxPerAddress && numTx,
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
    // none of the addresses has enough funds
    if (!gotBalance) throw new Error('Faucet server: insufficient funds')

    const allBanned = senderFails.filter(c => c >= maxFailCount).length === senderAddresses.length
    if (allBanned) throw new Error('Faucet server: no useable sender addresses available')

    await addressAwaitRelease()
    const availableIndexes = senderInUse
        .map((subject, i) =>
            senderFails[i] >= maxFailCount // prevent using an address if it failed 3 transactions
                ? null
                : subject.value < maxTxPerAddress
                    ? i
                    : null
        )
        .filter(x =>
            x !== null
            && senderBalances[x] > amountRequired
        )
    const index = availableIndexes[randomIndex(availableIndexes.length)]
    let address = senderAddresses[index]
    if (!address) return await getSender(amountToSend)
    addressLock(index)
    return address
}

setTimeout(() =>
    getConnection().then(() =>
        readyPromise.then(() => getSender(100))
    ), 2000
)


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

export const transfer = async (recipient, amount, rewardId, rewardType, limitPerType = 0) => {
    // connect to blockchain
    const { api } = await getConnection()
    const doc = await dbHistory.get(rewardId) || {
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
            if (blockStarted === currentBlock) {
                doc.status = 'todo'
                await dbHistory.set(rewardId, doc)
                log(rewardId, 'Re-attempt to quickly', { blockStarted, currentBlock })
                return
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

    // construct a transaction
    doc.txId = randomHex(recipient, 'blake2', 256)

    // seta new temporary status so that these can be searched and executed later
    doc.status = 'pending'
    // save record with pending status
    await dbHistory.set(rewardId, doc)

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
        const tx = await api.tx.transfer.networkCurrency(recipient, amount, doc.txId)
        const [txHash] = await signAndSend(api, senderAddress, tx, nonce)
            .catch(err => {
                const count = (senderFails[senderIndex] || 0) + 1
                senderFails[senderIndex] = count
                if (count >= maxFailCount) log('Sender failed too many subsequent transactions', senderAddress, count)
                return Promise.reject(err)
            })
        // reset fail count
        senderFails[senderIndex] = 0
        doc.txHash = txHash
        doc.status = 'success'
        await dbHistory.set(rewardId, doc)
    }

    // execute the transaction
    const sendPromise = execute()
    await sendPromise
        .finally(() => addressRelease(senderIndex))
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
export const setupKeyring = async (wallets = []) => {
    if (setupKeyring.done) return
    setupKeyring.done = true
    let ready = {}
    const total = wallets.length
    senderInUse = new Array(wallets.length)
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
    for (let i = 0; i < total; i++) {
        if (senderAddresses.includes(address)) return

        const wallet = wallets[i]
        if (senderAddresses.indexOf(wallet.address) >= 0) return
        await keyring.add([wallet])
        const { address } = wallet
        ready[address] = {
            balance: false,
            nonce: false,
        }
        const index = senderAddresses.push(address) - 1

        // subscribe to keep track of address balances
        await query(
            api,
            api.query.balances.freeBalance,
            [
                address,
                balance => {
                    senderBalances[index] = balance
                    ready[address].balance = true
                    log(`Wallet balance ready ${i + 1}/${total} ${address}`, balance)
                },
            ])
        const nonce = await query(
            api,
            api.query.system.accountNonce,
            [address],
        )

        senderNonce[index] = nonce || 0
        ready[address].nonce = true
        log(`Wallet nonce ready ${i + 1}/${total} ${address}`, nonce)
    }

    // Test address release and locking mechanism
    // readyPromise.then(() => {
    //     new Array(50)
    //         .fill(0)
    //         .forEach(async (_, i) => {
    //             const sender = await getSender(10000)
    //             const index = senderAddresses.indexOf(sender)
    //             setTimeout(() => addressRelease(index), randomIndex(60000))
    //             console.log(i, senderBalances[index], sender)
    //         })
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