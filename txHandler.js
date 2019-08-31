import Keyring from '@polkadot/keyring/'
// import hexToU8a from '@polkadot/util/hex/toU8a'

export async function txHandler(api, toAddress, amount, secretKey, printSensitiveData) {
    // create an instance of our testing keyring
    // If you're using ES6 module imports instead of require, just change this line to:
    const keyring = new Keyring({ type: 'sr25519' })

    // Restore funding wallet 
    // Use first 32 byte secret key
    
    printSensitiveData && console.log('secret key:', secretKey)
    const sender = keyring.addFromUri(secretKey, null, 'sr25519')
    printSensitiveData && console.log('sender.address:', sender.address)
    showBalance(api, sender.address, toAddress, printSensitiveData)
    let balance = await api.query.balances.freeBalance(sender.address)
    if (balance <= amount) throw new Error('Insufficient balance')
    
    // Create a extrinsic, transferring 12345 units to Bob
    const transfer = api.tx.balances.transfer(toAddress, amount);

    // Sign and send the transaction using our account
    const hash = await transfer.signAndSend(sender);

    printSensitiveData && console.log('Transfer sent with hash', hash.toHex());
    printSensitiveData && console.log('Balance after transfer:')
    showBalance(api, sender.address, toAddress, printSensitiveData)
}
// Make sure to catch errors
// txHandler().catch(console.error)

async function showBalance(api, from, to, printSensitiveData) {
    let balance = await api.query.balances.freeBalance(from)
    let balance2 = await api.query.balances.freeBalance(to)
    printSensitiveData && console.log(`Sender balance: ${balance}`)
    printSensitiveData && console.log(`Recipient balance: ${balance2}`)
}