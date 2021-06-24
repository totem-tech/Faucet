# This is an example file of how to create your scripts file for both development and production environments.

# Store the `start.sh` file in the root directory of the faucet server and execute using `./start.sh`.

# _______________DYNAMIC_VARIABLES_BELOW_______________="Changes to variables below DO NOT REQUIRE server restart" \
# keyData="string: PolkadotJS(encoded) or oo7(keyData) identity information" \
# amount="integer: (to be deprecated)" \
# CouchDB_URL="string: CouchDB connection URL including username and password. https://user:password@1.2.3.4:1234" \
# external_serverName="string: name of the messaging server" \
# external_publicKey="string(hex): messaging server's encryption public key" \
# external_signPublicKey="string(hex): messaging server's signature public key" \
# FAUCET_PORT="integer: port number to use when starting the websocket server. Default: 3002" \
# FAUCET_CERT_PATH="string: path to SSL certificate. Default: './sslcert/fullchain.pem'" \
# FAUCET_KEY_PATH="string: path to SSL certificate key. Default: './sslcert/privkey.pem'" \
# NODE_URL="string: substrate blockchain node URL. Default: 'wss://node1.totem.live'" \
# printSensitiveData="string: (optional) CAUTION: always leave it turned off when in production mode or loggin is enabled. Only when you know what you are doing, use 'YES' to enable printing of private keys in the console. " \
# referralRewardAmount="integer: amount to be rewarded for referrals" \
# referralTwitterRewardAmount="integer: amount to be rewarded when referred user posts on Twitter" \
# serverName="string: a name for this server" \
# signupRewardAmount="integer: amount to be rewarded to newly registered users" \
# signupTwitterRewardAmount="integer: amount to be rewarded when user posts on Twitter" \
# yarn run faucet
