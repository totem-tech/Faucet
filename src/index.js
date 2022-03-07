import https from 'https'
import fs from 'fs'
import socket from 'socket.io'
import { decryptMessage, setupVariables } from './decryptMessage'
import { getConnection as setDbConnection } from './utils/CouchDBStorage'
import { isFn } from './utils/utils'
import { handleRewardPayment } from './handleRewardPayment'

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
const clients = new Map()
const log = (...args) => console.log(new Date().toISOString(), ...args)

// Authentication middleware: prevent conneting if authentication fails
// ToDo: use signed message and verify?
// io.use((socket, next) => {
//     let token = socket.handshake.query.token //socket.handshake.headers['x-auth-token']
//     if (token === 'this_is_a_test_token') { //isValid(token)
//         log('Authentication success. Token', token)
//         return next()
//     }
//     log('Authentication failed. Token', token)
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
        log({ eventName, error })
    }
}
const handlers = {
    'reward-payment': handleRewardPayment,
    'test-decrypt': (msg, callback) => {
        isFn(callback) && callback(null, JSON.parse(msg))
    }
}
Object.keys(handlers)
    .forEach(name =>
        handlers[name] = decryptCb(name, handlers[name])
    )

// Setup websocket request handlers
io.on('connection', client => {
    clients.set(client.id, client)
    log(`[WSClient] Connected: ${client.id} | Total: ${clients.size}`)
    client.on('disconnect', () => {
        clients.delete(client.id)
        log(`[WSClient] Disconnected: ${client.id} | Total: ${clients.size}`)
    })

    // Keep legacy faucet requsts active until production messaging serivce is updated to latest 
    client.on('faucet', (_1, _2, cb) => isFn(cb) && cb('Deprecated'))

    Object.keys(handlers)
        .forEach(eventName =>
            client.on(eventName, handlers[eventName])
        )
})

// setup CouchDB connection
setDbConnection(CouchDB_URL, true)
    .catch(err => Promise.reject('CouchDB setup failed' + err.message))

// connect to blockchain
// Set variables on start
setupVariables(NODE_URL)
    .then(() => {
        // Start server
        server.listen(FAUCET_PORT, () => {
            console.log('------------------------\nFaucet server websocket listening on port ', FAUCET_PORT)
        })
    })