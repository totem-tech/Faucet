import { getConnection, setupKeyring } from './blockchain'
import {
    decrypt,
    encryptionKeypair,
    newSignature,
    signingKeyPair,
    verifySignature,
    keyInfoFromKeyData,
} from './utils/naclHelper'

let keyData,
    wallet,
    serverName,
    external_publicKey,
    external_signPublicKey,
    external_serverName,
    encryption_keypair,
    signature_keypair
const printSensitiveData = process.env.printSensitiveData === "YES"
// Reads environment variables and generate keys if needed
const setupVariables = () => {

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
const err = setupVariables()
if (err) throw new Error(err)

if (printSensitiveData) {
    console.log('serverName: ', serverName, '\n')
    console.log('keyData: ', keyData, '\n')
    console.log('wallet.address: ', wallet.address, '\n')
    console.log('Encryption KeyPair base64 encoded: \n' + JSON.stringify(encryption_keypair, null, 4), '\n')
    console.log('Signature KeyPair base64 encoded: \n' + JSON.stringify(signature_keypair, null, 4), '\n')
    console.log('external_serverName: ', external_serverName)
    console.log('external_publicKey base64 encoded: ', external_publicKey, '\n')
}

console.log('Setting up keyring')
setupKeyring(wallet)

/**
 * @name    decryptMessage
 * @summary decrypt and verify signatures of websocket event messages
 * 
 * @param   {String} encryptedMsg 
 * @param   {String} nonce 
 * 
 * @returns {Array} [errorMsg, decryptedMsg]
 */
export const decryptMessage = async (encryptedMsg, nonce) => {
    let err = setupVariables()
    if (err) throw new Error(err)

    const decrypted = decrypt(
        encryptedMsg,
        nonce,
        external_publicKey,
        encryption_keypair.secretKey
    )
    if (!decrypted) return ['Decryption failed']

    printSensitiveData && console.log('\ndecrypted', decrypted)

    // verify signature
    const minLength = 9
    const decryptedArr = decrypted.split('')
    const dataStart = minLength + serverName.length
    const num = decryptedArr
        .slice(0, minLength)
        .join('')
    const sigStart = dataStart + parseInt(num)
    const msgServerName = decryptedArr.slice(minLength, dataStart).join('')

    if (serverName !== msgServerName) return ['Invalid server']

    const signature = decryptedArr
        .slice(sigStart)
        .join('')
    const decryptedMsg = decryptedArr
        .slice(dataStart, sigStart)
        .join('')
    if (printSensitiveData) console.log({
        signature,
        external_signPublicKey,
        decryptedMsg,
    })

    const verified = verifySignature(
        decryptedMsg,
        signature,
        external_signPublicKey,
    )
    if (!verified) return ['Signature verification failed']

    return [null, decryptedMsg]
}

export const handleFaucetTransfer = (encryptedMsg, nonce, callback) => {
    // console.log('\n\n---New faucet request received---')
    // if (typeof callback !== 'function') return;
    // if (!api || !api.rpc) return callback('Not connected to node')
    // const err = setupVariables()
    // if (err) return callback(err) | console.error(err);
    // const decrypted = decrypt(
    //     encryptedMsg,
    //     nonce,
    //     external_publicKey,
    //     encryption_keypair.secretKey
    // )
    // printSensitiveData && console.log('\ndecrypted', decrypted)
    // if (!decrypted) return callback('Decryption failed')

    // const minLength = 9
    // const decryptedArr = decrypted.split('')
    // const dataStart = minLength + serverName.length
    // const sigStart = dataStart + parseInt(decryptedArr.slice(0, minLength).join(''))
    // const msgServerName = decryptedArr.slice(minLength, dataStart).join('')
    // if (serverName !== msgServerName) return callback('Invalid data', msgServerName, serverName)
    // const signature = decryptedArr.slice(sigStart).join('')
    // printSensitiveData && console.log('\nSignature:\n', signature)
    // printSensitiveData && console.log('\nexternal_signPublicKey:\n', external_signPublicKey)
    // const data = decryptedArr.slice(dataStart, sigStart).join('')
    // printSensitiveData && console.log('\nData:\n', data)

    // if (!verifySignature(data, signature, external_signPublicKey)) throw callback('Signature verification failed')

    // const { address: recipientAddress, funded } = JSON.parse(data)
    // if (funded) return callback('Request already funded')
    // if (!recipientAddress) return callback('Invalid address')

    // console.log('Faucet request:', JSON.stringify({ address: recipientAddress, amount }))
    // transfer(recipientAddress, amount, wallet.secretKey, wallet.publicKey, api)
    //     .then(hash => callback(null, hash))
    //     .catch(err => console.error('handleTx error: ', err) | callback(err))
}
