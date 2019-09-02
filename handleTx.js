import Keyring from '@polkadot/keyring/'
// import hexToU8a from '@polkadot/util/hex/toU8a'
// import u8aToHex from '@polkadot/util/u8a/toHex'

export async function handleTx(api, uri, toAddress, amount, keyData) {
    // create an instance of our testing keyring
    // If you're using ES6 module imports instead of require, just change this line to:
    const keyring = new Keyring({ type: 'sr25519' })

    // Restore funding wallet 
    // Use first 32 byte secret key as hex......................
    // const sender = keyring.addFromUri(keyData.slice(0, 32), undefined, 'sr25519')
    const sender = keyring.addFromUri(uri, undefined, 'sr25519')
    console.log('Funding wallet:', sender.address)
    console.log('Requested wallet:', sender.address)
    const sourceBalance = await api.query.balances.freeBalance(sender.address)
    const destBalance = await api.query.balances.freeBalance(toAddress)
    console.log(`Balance before transfer: \nFunding wallet: ${sourceBalance}\nRequested wallet: ${destBalance}`)

    if (sourceBalance <= amount) throw new Error('Insufficient balance')

     // Create a extrinsic, transferring @amount units to @toAddress
    const transfer = api.tx.balances.transfer(toAddress, amount)

    // Sign and send the transaction using @sender account
    const hash = await transfer.signAndSend(sender)
    const hashStr = hash.toHex()
    console.log('Transfer sent with hash', hashStr)
    return hashStr
}
// Make sure to catch errors:
// handleTx().catch(console.error)

// Solves problem with queueing
export async function handleTxV2(api, uri, toAddress, amount) {
    const keyring = new Keyring({ type: 'sr25519' })
    const sender = keyring.addFromUri(uri)
    console.log('Funding wallet:', sender.address)
    console.log('Requested wallet:', sender.address)
    
    const sourceBalance = await api.query.balances.freeBalance(sender.address)
    const destBalance = await api.query.balances.freeBalance(toAddress)
    console.log(`\nBalance before transfer: \nFunding wallet: ${sourceBalance}\nRequested wallet: ${destBalance}\n`)

    if (sourceBalance <= amount) throw new Error('Insufficient balance')

    const nonce = await api.query.system.accountNonce(sender.address)
    console.log(`Nonce: ${nonce}`)

    return new Promise(( resolve, reject) => api.tx.balances
        .transfer(toAddress, amount)
        .sign(sender, { nonce })
        .send(async ({ events = [], status }) => {
            console.log('Transaction status:', status.type)

            if (!status.isFinalized) return 
            const hash = status.asFinalized.toHex()
            console.log('Completed at block hash', hash)
            resolve(hash)

            const sourceBalance = await api.query.balances.freeBalance(sender.address)
            const destBalance = await api.query.balances.freeBalance(toAddress)
            console.log(`\nBalance after transfer: \nFunding wallet: ${sourceBalance}\nRequested wallet: ${destBalance}\n`)
        })
    )
}