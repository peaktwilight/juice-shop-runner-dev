/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { type Request, type Response, type NextFunction } from 'express'
import { BasketModel } from '../models/basket'
import * as security from '../lib/insecurity'

export function applyCoupon () {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id
      const user = security.authenticatedUsers.from(req)
      let coupon: string | undefined | null = req.params.coupon ? decodeURIComponent(req.params.coupon) : undefined
      const discount = security.discountFromCoupon(coupon)
      coupon = discount ? coupon : null

      const basket = await BasketModel.findOne({ where: { id, UserId: user?.data.id } })
      if (!basket) {
        res.status(404).send('Basket not found.')
        return
      }

      await basket.update({ coupon: coupon?.toString() })
      if (discount) {
        return res.json({ discount })
      } else {
        return res.status(404).send('Invalid coupon.')
      }
    } catch (error) {
      next(error)
    }
  }
}
