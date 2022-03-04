import { log, transfer } from './blockchain'
import { isFn } from './utils/utils'
import { TYPES, validateObj } from './utils/validator'

// reward amounts for each valid reward
const rewardAmounts = {
    'referral-reward': process.env.referralRewardAmount,
    'referral-twitter-reward': process.env.referralTwitterRewardAmount,
    'signup-reward': process.env.signupRewardAmount,
    'signup-twitter-reward': process.env.signupTwitterRewardAmount,
}

// number of maximum reward payout per address for specific reward types
// 0 means unlimited
const rewardLimits = {
    'referral-reward': parseInt(process.env.referralRewardLimit) || 0,
    'referral-twitter-reward': parseInt(process.env.referralTwitterRewardLimit) || 0,
    'signup-reward': 1,
    'signup-twitter-reward': 1,
}
const validationConf = {
    address: {
        required: true,
        type: TYPES.identity,
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
    if (!isFn(callback)) return

    try {
        const data = JSON.parse(decryptedData)
        const err = validateObj(data, validationConf, true, true)
        if (err) return callback(err)

        const { address, rewardId, rewardType } = data
        const amount = parseInt(rewardAmounts[rewardType])
        // if reward amount is 0 or lower => assume reward type is inactive
        if (!amount || amount < 0) return callback('Reward type no longer available')

        log(rewardId, { address, amount, rewardType })
        const { status, txId, txHash } = await transfer(
            address,
            amount,
            rewardId,
            rewardType,
            rewardLimits[rewardType],
        )
        callback(null, { amount, status, txId, txHash })
    } catch (err) {
        log(rewardId, err)
        callback(err.message || err, {})
    }
}