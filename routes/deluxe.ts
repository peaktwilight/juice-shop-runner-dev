/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { type Request, type Response, type NextFunction } from 'express'
import { literal, Op } from 'sequelize'

import * as challengeUtils from '../lib/challengeUtils'
import { WalletModel } from '../models/wallet'
import { challenges } from '../data/datacache'
import * as security from '../lib/insecurity'
import { UserModel } from '../models/user'
import { CardModel } from '../models/card'
import * as utils from '../lib/utils'

export function upgradeToDeluxe () {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await UserModel.findOne({ where: { id: req.body.UserId, role: security.roles.customer } })
      if (user == null) {
        throw new Error('CUSTOMER_NOT_ELIGIBLE')
      }

      if (req.body.paymentMode === 'card') {
        const card = await CardModel.findOne({ where: { id: req.body.paymentId, UserId: req.body.UserId } })
        if ((card == null) || card.expYear < new Date().getFullYear() || (card.expYear === new Date().getFullYear() && card.expMonth - 1 < new Date().getMonth())) {
          throw new Error('INVALID_CARD')
        }
      }

      // Claim the one-time membership transition atomically before charging. Concurrent
      // requests using the same customer token must not each charge the wallet.
      const [claimed] = await UserModel.update(
        { role: security.roles.deluxe, deluxeToken: security.deluxeToken(user.email) },
        { where: { id: req.body.UserId, role: security.roles.customer } }
      )
      if (claimed !== 1) {
        throw new Error('CUSTOMER_NOT_ELIGIBLE')
      }

      if (req.body.paymentMode === 'wallet') {
        const [debited] = await WalletModel.update(
          { balance: literal('balance - 49') },
          { where: { UserId: req.body.UserId, balance: { [Op.gte]: 49 } } }
        )
        if (debited !== 1) {
          await UserModel.update(
            { role: security.roles.customer, deluxeToken: '' },
            { where: { id: req.body.UserId, role: security.roles.deluxe } }
          )
          throw new Error('INSUFFICIENT_WALLET_FUNDS')
        }
      }

      const updatedUser = await UserModel.findByPk(req.body.UserId)
      if (updatedUser == null) {
        throw new Error('CUSTOMER_NOT_ELIGIBLE')
      }

      challengeUtils.solveIf(challenges.freeDeluxeChallenge, () => {
        return security.verify(utils.jwtFrom(req)) && req.body.paymentMode !== 'wallet' && req.body.paymentMode !== 'card'
      })
      const userWithStatus = utils.queryResultToJson(updatedUser)
      const updatedToken = security.authorize(userWithStatus)
      security.authenticatedUsers.put(updatedToken, userWithStatus)
      res.status(200).json({ status: 'success', data: { confirmation: 'Congratulations! You are now a deluxe member!', token: updatedToken } })
    } catch (err: unknown) {
      const message = utils.getErrorMessage(err)
      if (message === 'INSUFFICIENT_WALLET_FUNDS') {
        res.status(400).json({ status: 'error', error: 'Insuffienct funds in Wallet' })
      } else if (message === 'INVALID_CARD') {
        res.status(400).json({ status: 'error', error: 'Invalid Card' })
      } else if (message === 'CUSTOMER_NOT_ELIGIBLE') {
        res.status(400).json({ status: 'error', error: 'Something went wrong. Please try again!' })
      } else {
        res.status(400).json({ status: 'error', error: 'Something went wrong: ' + message })
      }
    }
  }
}

export function deluxeMembershipStatus () {
  return (req: Request, res: Response, next: NextFunction) => {
    if (security.isCustomer(req)) {
      res.status(200).json({ status: 'success', data: { membershipCost: 49 } })
    } else if (security.isDeluxe(req)) {
      res.status(400).json({ status: 'error', error: 'You are already a deluxe member!' })
    } else {
      res.status(400).json({ status: 'error', error: 'You are not eligible for deluxe membership!' })
    }
  }
}
