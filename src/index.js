import https from 'https'
import fs from 'fs'
import socket from 'socket.io'
import { getConnection } from './blockchain'
import { decryptMessage } from './decryptMessage'
import { getConnection as setDbConnection } from './utils/CouchDBStorage'
import { handleSignupReward } from './handleSignupReward'
import { handleReferralReward } from './handleReferralReward'
import { handleFaucetTransfer } from './handleFaucetTransfer'
import { isFn } from './utils/utils'

// Environment variables
const {
    CouchDB_URL = '',
    FAUCET_CERT_PATH = './sslcert/fullchain.pemx',
    FAUCET_KEY_PATH = './sslcert/privkey.pem',
    FAUCET_PORT = 3002,
    NODE_URL = 'wss://node1.totem.live',
} = process.env
// Setup server to use SSL certificate
const server = https.createServer({
    cert: fs.readFileSync(FAUCET_CERT_PATH),
    key: fs.readFileSync(FAUCET_KEY_PATH)
})
const io = socket(server)

// Authentication middleware: prevent conneting if authentication fails
// ToDo: use signed message and verify?
// io.use((socket, next) => {
//     let token = socket.handshake.query.token //socket.handshake.headers['x-auth-token']
//     if (token === 'this_is_a_test_token') { //isValid(token)
//         console.log('Authentication success. Token', token)
//         return next()
//     }
//     console.log('Authentication failed. Token', token)
//     return next(new Error('authentication error'))
// })

const decryptCb = (eventName, handler) => async function decryptCb(encryptedMsg, nonce, callback) {
    try {
        if (!isFn(callback)) return
        // decrypt mesasge and then invoke callback with decrypted message and callback
        const [decryptErr, decryptedMsg] = await decryptMessage(encryptedMsg, nonce)
        if (decryptErr) return callback(decryptErr)
        await handler(decryptedMsg, callback)
    } catch (error) {
        isFn(callback) && callback(`${error}`)
        console.log({ eventName, error })
    }
}
const handlers = {
    'signup-reward': handleSignupReward,
    'referral-reward': handleReferralReward,
}
Object.keys(handlers)
    .forEach(name =>
        handlers[name] = decryptCb(name, handlers[name])
    )

// Setup websocket request handlers
io.on('connection', client => {
    console.log('Connected to', client.id)
    client.on('disonnect', () => { console.log('Client disconnected', client.id) })

    // Keep legacy faucet requsts active until production messaging serivce is updated to latest 
    client.on('faucet', handleFaucetTransfer) //(_1, _2, cb) => isFn(cb) && cb('Deprecated'))

    Object.keys(handlers)
        .forEach(eventName =>
            client.on(eventName, handlers[eventName])
        )
})
// Start server
server.listen(FAUCET_PORT, () => {
    console.log('\nFaucet server websocket listening on port ', FAUCET_PORT)
})

getConnection(NODE_URL)
    .catch((err) => {
        console.error('Blockchain connection failed! Error:\n', err)
        exist(1)
    })
    .finally(() => {
    })

setDbConnection(CouchDB_URL, true)
    .catch(err => console.log('CouchDB setup failed', err))
