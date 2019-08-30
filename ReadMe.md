# Totem Faucet Server

This server is used to distribute funding for Totem on the Totem Meccano Testnet and eventually the mainnet. 

The architecture is such that the faucet server can and should only receive funding requests from a known sending server.

Both the faucet server and the sending server must therefore be configured in advance.

This is achieved through a couple of steps:

1. The sending server must sign the data it sends using it's own private signature key. The signature digest will be included in an encrypted message to the faucet server. 

2. The sending server will encrypt a message plus the signature digest using the faucet server's public encryption key and send the cipher to the faucet server. In other words the sending server must also be aware of this server's public encryption key in advance.

3. The faucet server will decrypt the cipher and verify the signature digest contained therin using a public signing key already known to the faucet server.

### Environmental Variables
Environmental variables are the selected method for configuring both the sending server and the faucet server. They can be changed at any time, but only some variables require a server restart. 

The variables have the following format:

| Description | Environmental variable name (uppercase = restart required, upon change of value) | Envirnmental variable type encoding | Faucet Server | Value Faucet Server|
|---|---|---|---|---|
| Amount of funds to be transferred in the smallest unit | amount | int| x | 10000|
| Chat server public encryption key| external_publicKey | 32Bytes base64 encoded | x | FfqAbYJ3EGdw1V+kZnyORTHC6hwvKLpIRkbbQJWuFkU= |
| Chat server name | external_serverName| string | x | bob|
| Chat server public signing key | external_signPublicKey | 32Bytes base64 encoded | x | T30ZcusVAz4c3C+Nc/zlIbn8c2BxNKUpEIYwZdofo1A= |
| Faucet SSL certificate path| FAUCET_CERT_PATH | string | x | ./sslcert/fullchain.pem|
| Faucet SSL key path| FAUCET_KEY_PATH| string | x | ./sslcert/privkey.pem|
| Faucet server port | FAUCET_PORT| string | x | 3002 |
| Faucet wallet Secret Key Data (to determine the signing and encryption keys) | keyData| 32 Bytes Hex | x | 98319d4f f8a9508c 4bb0cf0b 5a78d760 a0b2082c02775e6e82370816fedfff48 925a225d97aa00682d6a59b95b18780c 10d7032336e88f3442b42361 f4a66011d43593c715fdd31c 61141abd04a99fd6822c8558 854ccde39a5684e7a56da27d |
| Server startup command | n/a| n/a| x | yarn run faucet|
| Totem blockchain node URL| NODE_URL | Websocket URL| x | wss://your.totem.blockchain_node:port |
| This server name (this is the Faucet server) | serverName | string | x | alice|
| Secret mnemonic| uri| URI mnemonic phrase| x | //Alice|

It is up to you how hyou manage setting up the environmental variables (recommended is using `npm dotenv` and `.env`) however for testing you may do the following :

```shell
$ git clone https://gitlab.com/totem-tech/faucet.git

$ cd faucet

$ touch start.sh
```

Then add something like the following code to `start.sh` using your favourite text editor (or you can just type "open -e .start.sh" to open it in TextEdit) and save:

```shell
amount="100000" \
uri="//Alice" \
keyData="98319d4ff8a9508c4bb0cf0b5a78d760a0b2082c02775e6e82370816fedfff48925a225d97aa00682d6a59b95b18780c10d7032336e88f3442b42361f4a66011d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d" \
serverName="alice" \
external_publicKey="FfqAbYJ3EGdw1V+kZnyORTHC6hwvKLpIRkbbQJWuFkU=" \
external_serverName="bob" \
external_signPublicKey="T30ZcusVAz4c3C+Nc/zlIbn8c2BxNKUpEIYwZdofo1A=" \
FAUCET_PORT="3002" \
FAUCET_CERT_PATH="./sslcert/fullchain.pem" \
FAUCET_KEY_PATH="./sslcert/privkey.pem" \
NODE_URL="wss://your.totem.blockchain_node:port \
yarn run faucet
```

Now you can start the faucet server issuing:

    $ ./start.sh


## Medium Term
The long-term plan is that this development will be enhanced to distribute funds following a payment of cryptocurency by monitoring other blockchains for incoming payments to deterministic addresses communicated to the requesting client via the chat service, and could integrate other client specific requests.

