# This is an example file of how to create your scripts file for both development and production environments.

# Store the `start.sh` file in the root directory of the faucet server and execute using `./start.sh`.




# _______________DYNAMIC_VARIABLES_BELOW_______________="Changes to variables below DO NOT REQUIRE server restart" \
# amount="int: amount of funds to transfer. Default: 100000" \
# uri="string: funding wallet URI" \
# keyData="string: (96 bytes hex without 0x) exactly as found in the oo7-substrate's secretStore" \
# serverName="string: any name for the server" \
# external_publicKey="string-base64-encoded: 32 byte public encryption key from the UI/Chat server" \
# external_serverName="string: UI/Chat server's name" \
# external_signPublicKey="string-base64-encoded: 32 byte public signing key from the UI/Chat server" \
# printSensitiveData="string: enable or disable printing of keypair and other sensitive data. To Enable set value to 'YES' (case-sensitive)" \
# _______________STATIC_VARIABLES_BELOW_______________="Changes to below variables DO REQUIRE server restart" \
# FAUCET_PORT="int: port number" \
# FAUCET_CERT_PATH="string: ./path/to/ssl/certificate/key/file" \
# FAUCET_KEY_PATH="string: ./path/to/ssl/certificate/private/key/file" \
# NODE_URL="string: wss://host.ext.....  Default: 'wss://node1.totem.live'" \
# yarn run faucet



#______________TYPICAL_EXAMPLE_OF_FILE_______________

# amount="100000" \
# uri="//Alice" \
# keyData="98319d4ff8a9508c4bb0cf0b5a78d760a0b2082c02775e6e82370816fedfff48925a225d97aa00682d6a59b95b18780c10d7032336e88f3442b42361f4a66011d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d" \
# serverName="alice" \
# external_publicKey="FfqAbYJ3EGdw1V+kZnyORTHC6hwvKLpIRkbbQJWuFkU=" \
# external_serverName="bob" \
# external_signPublicKey="T30ZcusVAz4c3C+Nc/zlIbn8c2BxNKUpEIYwZdofo1A=" \
# printSensitiveData="YES" \
# FAUCET_PORT="3002" \
# FAUCET_CERT_PATH="./sslcert/fullchain.pem" \
# FAUCET_KEY_PATH="./sslcert/privkey.pem" \
# NODE_URL="wss://node1.totem.live" \
# yarn run faucet