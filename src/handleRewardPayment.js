import { transfer } from './blockchain'
import { TYPES, validateObj } from './utils/validator'

const { signupTwitterRewardAmount } = process.env

// reward amounts for each valid reward
const rewardAmounts = {
    'referral-reward': process.env.referralRewardAmount,
    'referral-twitter-reward': process.env.referralTwitterRewardAmount,
    'signup-reward': process.env.signupRewardAmount,
    'signup-twitter-reward': process.env.signupTwitterRewardAmount,
}
const validationConf = {
    address: {
        required: true,
        type: TYPES.address,
    },
    rewardId: {
        required: true,
        type: TYPES.hash,
    },
    rewardType: {
        accept: Object.keys(rewardAmounts),
        required: true,
        type: TYPES.string,
    },
}
export const handleRewardPayment = async (decryptedData, callback) => {
    const data = JSON.parse(decryptedData)
    const err = validateObj(data, validationConf, true, true)
    if (err) return callback(err)

    const { address, rewardId, rewardType } = data
    const amount = parseInt(rewardAmounts[rewardType])
    // if reward amount is 0 or lower => assume reward type is inactive
    if (!amount || amount < 0) return callback('Reward type no longer available')

    console.log({ address, amount, rewardType })
    const { txId, txHash } = await transfer(
        address,
        amount,
        rewardId,
        rewardType,
    )
    callback(null, { amount: signupTwitterRewardAmount, txId, txHash })
}