# Totem Faucet Server

This server is used to distribute funding for Totem on the Totem Meccano Testnet and eventually the mainnet. 

The architecture is such that the faucet server can and should only receive funding requests from a known sending server.

Both the faucet server and the sending server must therefore be configured in advance. (This requires some playing around, and watch out for those pesky copy paste issues.)

This is achieved through a couple of steps:

1. The sending server must sign the data it sends using it's own private signature key. The signature digest will be included in an encrypted message to the faucet server. 

2. The sending server will encrypt a message plus the signature digest using the faucet server's public encryption key and send the cipher to the faucet server. In other words the sending server must also be aware of this server's public encryption key in advance.

3. The faucet server will decrypt the cipher and verify the signature digest contained therin using a public signing key already known to the faucet server.

### Environmental Variables
Environmental variables are the selected method for configuring both the sending server and the faucet server. They can be changed at any time, but only some variables require a server restart. 

The variables have the following format:

| Description | Environmental variable name (uppercase = restart required, upon change of value) | Envirnmental variable type encoding | Faucet Server | Value Faucet Server|
|---|---|---|---|---|
| Print keys to console converts true false | printSensitiveData | string | x | YES |
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

```bash
git clone https://gitlab.com/totem-tech/faucet.git
cd faucet
yarn install

## create empty script file
touch start.sh

## Make it executable
sudo chmod +x start.sh
```

Then add something like the following code to `start.sh` using your favourite text editor (or you can just type "open -e .start.sh" to open it in TextEdit) and save:

```bash
printSensitiveData="YES" \
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
### Updating git submodules

In order for the faucet to run properly you will need to configure your repo to use the type definitions for Totem which are stored in a common repo for all totem applications.

```bash
cd faucet
git config --file=.gitmodules submodule.src/utils.url https://gitlab.com/totem-tech/common-utils.git

```

You can check the contents of the modules file:

```bash
nano .gitmodules
```

It should look like this:

```bash 
[submodule "src/utils"]
        path = src/utils
        url = https://gitlab.com/totem-tech/common-utils.git
        branch = dev
```

Change the branch to master and initialise the utils folder. This will pull the files directly:

```bash
git config --file=.gitmodules submodule.src/utils.branch master
git submodule update --init --recursive --remote
```

To allow you to automatically pull any changes when the server is restarted you can add the following lines to the top of your `start.sh` script. 

```bash
    git pull && git submodule update --recursive --remote && \
````

**Note that this is for convenience, and should not be used on a live production server.**

Now you can start the faucet server issuing:

```bash
./start.sh
```

## Medium Term
The medium-term plan is that this development will be enhanced to distribute funds following a payment of cryptocurency by monitoring other blockchains for incoming payments to deterministic addresses communicated to the requesting client via the chat service, and could integrate other client specific requests.