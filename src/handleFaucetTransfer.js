import { decrypt, encryptionKeypair, newSignature, signingKeyPair, verifySignature, keyInfoFromKeyData } from './utils/naclHelper'
import { transfer } from './utils/polkadotHelper'


let api,
    amount,
    keyData,
    wallet, serverName,
    external_publicKey,
    external_signPublicKey,
    external_serverName,
    encryption_keypair,
    signature_keypair,
    printSensitiveData

export const setApi = polkadotApi => api = polkadotApi

// Reads environment variables and generate keys if needed
const setVariables = () => {
    amount = eval(process.env.amount) || 100000

    serverName = process.env.serverName
    if (!serverName) return 'Missing environment variable: "serverName"'

    external_publicKey = process.env.external_publicKey
    external_signPublicKey = process.env.external_signPublicKey
    external_serverName = process.env.external_serverName
    if (!external_publicKey || !external_serverName || !external_signPublicKey) {
        return 'Missing environment variable(s): "external_publicKey", "external_signPublicKey" or "external_serverName"'
    }

    // Key data must be 96 bytes hex
    if (!process.env.keyData) return 'Missing environment variable: "keyData"'

    // Prevent generating keys when not needed
    if (keyData === process.env.keyData) return

    // Key pairs of this server
    keyData = process.env.keyData
    wallet = keyInfoFromKeyData(keyData)
    encryption_keypair = encryptionKeypair(keyData)
    signature_keypair = signingKeyPair(keyData)
}
// Set variables on start
const err = setVariables()
if (err) throw new Error(err)

printSensitiveData = process.env.printSensitiveData === "YES"

if (printSensitiveData) {
    console.log('serverName: ', serverName, '\n')
    console.log('keyData: ', keyData, '\n')
    console.log('wallet.address: ', wallet.address, '\n')
    console.log('Encryption KeyPair base64 encoded: \n' + JSON.stringify(encryption_keypair, null, 4), '\n')
    console.log('Signature KeyPair base64 encoded: \n' + JSON.stringify(signature_keypair, null, 4), '\n')
    console.log('external_serverName: ', external_serverName)
    console.log('external_publicKey base64 encoded: ', external_publicKey, '\n')
}

export const handleFaucetTransfer = (encryptedMsg, nonce, callback) => {
    console.log('\n\n---New faucet request received---')
    if (typeof callback !== 'function') return;
    if (!api || !api.rpc) return callback('Not connected to node')
    const err = setVariables()
    if (err) return callback(err) | console.error(err);
    const decrypted = decrypt(
        encryptedMsg,
        nonce,
        external_publicKey,
        encryption_keypair.secretKey
    )
    printSensitiveData && console.log('\ndecrypted', decrypted)
    if (!decrypted) return callback('Decryption failed')

    const minLength = 9
    const decryptedArr = decrypted.split('')
    const dataStart = minLength + serverName.length
    const sigStart = dataStart + parseInt(decryptedArr.slice(0, minLength).join(''))
    const msgServerName = decryptedArr.slice(minLength, dataStart).join('')
    if (serverName !== msgServerName) return callback('Invalid data', msgServerName, serverName)
    const signature = decryptedArr.slice(sigStart).join('')
    printSensitiveData && console.log('\nSignature:\n', signature)
    printSensitiveData && console.log('\nexternal_signPublicKey:\n', external_signPublicKey)
    const data = decryptedArr.slice(dataStart, sigStart).join('')
    printSensitiveData && console.log('\nData:\n', data)

    if (!verifySignature(data, signature, external_signPublicKey)) return callback('Signature verification failed')

    const { address: recipientAddress, funded } = JSON.parse(data)
    if (funded) return callback('Request already funded')
    if (!recipientAddress) return callback('Invalid address')

    console.log('Faucet request:', JSON.stringify({ address: recipientAddress, amount }))
    transfer(recipientAddress, amount, wallet.secretKey, wallet.publicKey, api)
        .then(hash => callback(null, hash))
        .catch(err => console.error('handleTx error: ', err) | callback(err))
}