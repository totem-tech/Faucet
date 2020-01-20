import Keyring from '@polkadot/keyring/'
import createPair from '@polkadot/keyring/pair'
// import hexToU8a from '@polkadot/util/hex/toU8a'
// import u8aToHex from '@polkadot/util/u8a/toHex'

export async function handleTx(api, toAddress, amount, secretKey, publicKey, printInfo) {
    // create an instance of our testing keyring
    // If you're using ES6 module imports instead of require, just change this line to:
    const keyring = new Keyring({ type: 'sr25519' })

    // Restore funding wallet
    printInfo && console.log('Secret:', secretKey)
    printInfo && console.log('public', publicKey)
    
    const pair  = createPair('sr25519', { secretKey: secretKey, publicKey: publicKey })
    keyring.addPair(pair)

    printInfo && console.log('Pair: \n' + JSON.stringify(pair.address, null, 4), '\n')
    
    const sender = keyring.getPair(pair.address)
    printInfo && console.log('sender.address:', sender.address)

    const sourceBalance = await api.query.balances.freeBalance(sender.address)
    const destBalance = await api.query.balances.freeBalance(toAddress)
    printInfo && console.log(`Balance before transfer: \nFunding wallet: ${sourceBalance}\nRequested wallet: ${destBalance}`)

    if (sourceBalance <= amount) throw new Error('Insufficient balance')

     // Create a extrinsic, transferring @amount units to @toAddress
    const transfer = api.tx.balances.transfer(toAddress, amount)

    // Sign and send the transaction using @sender account
    const hash = await transfer.signAndSend(sender)
    const hashStr = hash.toHex()
    printInfo && console.log('Transfer sent with hash', hashStr)
    return hashStr
}
// Make sure to catch errors:
// handleTx().catch(console.error)

// Solves problem with queueing
export async function handleTxV2(api, toAddress, amount, secretKey, publicKey, printInfo) {
    const keyring = new Keyring({ type: 'sr25519' })
    const pair  = createPair('sr25519', { secretKey: secretKey, publicKey: publicKey })
    keyring.addPair(pair)

    const sender = keyring.getPair(pair.address)

    printInfo && console.log('Funding wallet:', sender.address)
    printInfo && console.log('Requested wallet:', toAddress)
    
    const sourceBalance = await api.query.balances.freeBalance(sender.address)
    const destBalance = await api.query.balances.freeBalance(toAddress)
    printInfo && console.log(`\nBalance before transfer: \nFunding wallet: ${sourceBalance}\nRequested wallet: ${destBalance}\n`)

    if (sourceBalance <= amount) throw new Error('Insufficient balance')

    const nonce = await api.query.system.accountNonce(sender.address)
    printInfo && console.log(`Nonce: ${nonce}`)

    return new Promise(( resolve, reject) => api.tx.balances
        .transfer(toAddress, amount)
        .sign(sender, { nonce })
        .send(async ({ events = [], status }) => {
            printInfo && console.log('Transaction status:', status.type)

            if (!status.isFinalized) return 
            const hash = status.asFinalized.toHex()
            printInfo && console.log('Completed at block hash', hash)
            resolve(hash)

            const sourceBalance = await api.query.balances.freeBalance(sender.address)
            const destBalance = await api.query.balances.freeBalance(toAddress)
            printInfo && console.log(`\nBalance after transfer: \nFunding wallet: ${sourceBalance}\nRequested wallet: ${destBalance}\n`)
        })
    )
}