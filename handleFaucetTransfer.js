import { decrypt, encryptionKeypair, signingKeyPair, verifySignature, keyInfoFromKeyData } from './src/utils/naclHelper'
import { txHandler } from './txHandler'

// Queue transactions
let api;
let amount, keyData, walletAddress, serverName, external_publicKey, external_signPublicKey, external_serverName, encryption_keypair, signature_keypair, printSensitiveData
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
    const keyDataBytes = keyInfoFromKeyData(keyData)
    const encryptionKeyPair = encryptionKeypair(keyData)
    const signatureKeyPair = signingKeyPair(keyData)
    walletAddress = keyDataBytes.walletAddress
    encryption_keypair = encryptionKeyPair
    signature_keypair = signatureKeyPair
}
// Set variables on start
const err = setVariables()
if (err) throw new Error(err)

printSensitiveData = process.env.printSensitiveData === "YES"

if (printSensitiveData) {
    console.log('serverName: ', serverName, '\n')
    console.log('keyData: ', keyData, '\n')
    console.log('walletAddress: ', walletAddress, '\n')
    console.log('Encryption KeyPair base64 encoded: \n' + JSON.stringify(encryption_keypair, null, 4), '\n')
    console.log('Signature KeyPair base64 encoded: \n' + JSON.stringify(signature_keypair, null, 4), '\n')
    console.log('external_serverName: ', external_serverName,)
    console.log('external_publicKey base64 encoded: ', external_publicKey, '\n')
}

export const setApi = polkadotApi => api = polkadotApi

export const handleFaucetTransfer = (encryptedMsg, nonce, callback) => {
    if (typeof callback !== 'function') return;
    if (!api || !api.rpc) return callback('Not connected to node')
    const err = setVariables()
    if (err) return callback(err) | console.error(err);
    const decrypted = decrypt(
        encryptedMsg,
        nonce,
        external_publicKey,
        secretKey
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

    const faucetRequest = JSON.parse(data)
    if (faucetRequest.funded) return callback('Request already funded')
    if (!faucetRequest.address) return callback('Invalid address')

    txHandler(api, faucetRequest.address, amount, keyInfoFromKeyData(keyData).first32Bytes, printSensitiveData)
        .catch(err => console.error('txHandler error: ', err) | callback(err))
    callback()
}