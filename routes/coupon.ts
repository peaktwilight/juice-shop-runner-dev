/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { type Request, type Response, type NextFunction } from 'express'
import { BasketModel } from '../models/basket'
import * as security from '../lib/insecurity'

export function applyCoupon () {
  return async ({ params }: Request, res: Response, next: NextFunction) => {
    try {
      const id = params.id
      let coupon: string | undefined | null = params.coupon ? decodeURIComponent(params.coupon) : undefined
      const discount = security.discountFromCoupon(coupon)
      const acceptedDiscount = typeof discount === 'number' && Number.isInteger(discount) && discount >= 1 && discount <= 15 ? discount : undefined
      coupon = acceptedDiscount !== undefined ? coupon : null

      const basket = await BasketModel.findByPk(id)
      if (!basket) {
        next(new Error(`Basket with id=${id} does not exist.`))
        return
      }

      await basket.update({ coupon: coupon?.toString() })
      if (acceptedDiscount !== undefined) {
        return res.json({ discount: acceptedDiscount })
      } else {
        return res.status(404).send('Invalid coupon.')
      }
    } catch (error) {
      next(error)
    }
  }
}
