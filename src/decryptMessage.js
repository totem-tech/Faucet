import { getConnection, setupKeyring, transfer } from './blockchain'
import { strToHex } from './utils/convert'
import {
    decrypt,
    encryptionKeypair,
    newSignature,
    signingKeyPair,
    verifySignature,
    keyInfoFromKeyData,
} from './utils/naclHelper'
import { arrUnique, generateHash, isFn } from './utils/utils'

let amount,
    keyData,
    serverName,
    external_publicKey,
    external_signPublicKey,
    external_serverName,
    encryption_keypair,
    signature_keypair
const printSensitiveData = process.env.printSensitiveData === "YES"
// Reads environment variables and generate keys if needed
export const setupVariables = (nodeUrl) => {
    amount = eval(process.env.amount) || 100000

    serverName = process.env.serverName
    if (!serverName) return 'Missing environment variable: "serverName"'

    external_publicKey = process.env.external_publicKey
    external_signPublicKey = process.env.external_signPublicKey
    external_serverName = process.env.external_serverName
    if (!external_publicKey || !external_serverName || !external_signPublicKey) {
        return 'Missing environment variable(s): "external_publicKey", "external_signPublicKey" or "external_serverName"'
    }

    if (!process.env.seeds) return 'Missing environment variable: "seeds"'
    // Key pairs of this server
    const seeds = arrUnique(`${process.env.seeds || ''}`.split(','))
        .filter(Boolean)
    if (!seeds.length) throw new Error('Missing variable "seeds"')

    if (!process.env.keyData) return 'Missing environment variable: "keyData"'
    // setup was done before
    if (process.env.keyData === keyData) return
    keyData = process.env.keyData.split(',')[0]

    signature_keypair = signingKeyPair(keyData)
    encryption_keypair = encryptionKeypair(keyData)
    if (printSensitiveData) {
        console.log('serverName: ', serverName, '\n')
        console.log('keyData: ', keyData, '\n')
        console.log('Encryption KeyPair base64 encoded: \n' + JSON.stringify(encryption_keypair, null, 4), '\n')
        console.log('Signature KeyPair base64 encoded: \n' + JSON.stringify(signature_keypair, null, 4), '\n')
        console.log('external_serverName: ', external_serverName)
        console.log('external_publicKey base64 encoded: ', external_publicKey, '\n')
    }
    if (nodeUrl) return getConnection(nodeUrl)
        .then(() => {
            console.log('Setting up keyring')
            return setupKeyring(seeds)
        })
        .catch((err) => {
            console.error('Blockchain connection failed! Error:\n', err)
            process.exit(1)
        })

}

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

export const handleFaucetTransfer = async (encryptedMsg, nonce, callback) => {
    try {
        console.log('\n\n---New faucet request received---')
        if (!isFn(callback)) return

        const err = setupVariables()
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

        if (!verifySignature(data, signature, external_signPublicKey)) throw callback('Signature verification failed')

        const { address: recipientAddress, funded } = JSON.parse(data)
        if (funded) return callback('Request already funded')
        if (!recipientAddress) return callback('Invalid address')

        console.log('Faucet request:', JSON.stringify({ address: recipientAddress, amount }))
        const id = generateHash()
        const doc = await transfer(
            recipientAddress,
            amount,
            id,
            'faucet-request',
            true,
            id
        )
        callback(null, doc)
    } catch (err) {
        console.log('handleFaucetTransfer error: ', err)
        callback(`${err}`)
    }
}
