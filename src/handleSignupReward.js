import { transfer } from './blockchain'
import { isHash } from './utils/utils'

const { signupRewardAmount } = process.env

//ToDo: deprecate
export const handleSignupReward = async (decryptedData, callback) => {
    const { address, rewardId } = JSON.parse(decryptedData)
    if (!address) return callback('Invalid address')
    if (!signupRewardAmount) return callback('Invalid signup reward amount')
    if (!isHash(rewardId)) return callback('Invalid rewardId')

    console.log({ address, signupRewardAmount })
    const { txId, txHash } = await transfer(
        address,
        parseInt(signupRewardAmount),
        rewardId,
        'signup-reward',
    )
    callback(null, { amount: signupRewardAmount, txId, txHash })
}