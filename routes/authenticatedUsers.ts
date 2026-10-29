/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */
import { type Request, type Response, type NextFunction } from 'express'
import { UserModel } from '../models/user'
import { decode } from 'jsonwebtoken'
import * as security from '../lib/insecurity'

async function retrieveUserList (req: Request, res: Response, next: NextFunction) {
  try {
    const authenticatedUser = security.authenticatedUsers.from(req)
    const user = authenticatedUser?.data?.email
      ? await UserModel.findOne({ where: { email: authenticatedUser.data.email }, attributes: ['role'] })
      : null
    if (user?.role !== security.roles.admin) {
      res.status(403).json({ error: 'You are not allowed to access this resource.' })
      return
    }

    const users = await UserModel.findAll()

    res.json({
      status: 'success',
      data: users.map((user) => {
        const userToken = security.authenticatedUsers.tokenOf(user)
        let lastLoginTime: number | null = null
        if (userToken) {
          const parsedToken = decode(userToken, { json: true })
          lastLoginTime = parsedToken ? Math.floor(new Date(parsedToken?.iat ?? 0 * 1000).getTime()) : null
        }

        return {
          ...user.dataValues,
          password: user.password?.replace(/./g, '*'),
          totpSecret: user.totpSecret?.replace(/./g, '*'),
          lastLoginTime
        }
      })
    })
  } catch (error) {
    next(error)
  }
}

export default () => retrieveUserList
