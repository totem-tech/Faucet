import { getConnection, transfer } from './blockchain'
import { isHash } from './utils/utils'

const { referralRewardAmount } = process.env

//ToDo: deprecate
export const handleReferralReward = async (decryptedData, callback) => {
    const { address, rewardId } = JSON.parse(decryptedData)
    if (!address) return callback('Invalid address')
    if (!referralRewardAmount) return callback('Invalid referral reward amount')
    if (!isHash(rewardId)) return callback('Invalid rewardId')

    console.log({ address, referralRewardAmount })
    const { txId, txHash } = await transfer(
        address,
        parseInt(referralRewardAmount),
        rewardId,
        'referral-reward',
    )
    callback(null, {
        amount: referralRewardAmount,
        txId,
        txHash,
    })
}