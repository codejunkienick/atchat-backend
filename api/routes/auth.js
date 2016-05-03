import Account from '../models/account';
import express from 'express';
import passport from 'passport';
const router = express.Router();
import jwt from 'jsonwebtoken';
import config from '../config';

router.post('/facebook',
  function (req, res, next) {
    passport.authenticate('facebook-token', {session: false}, (error, user, info) => {
      const token = jwt.sign({_id: user._id}, config.secret);
      if (user) {
        res.status(200).json({user, token});
      } else {
        res.send(401);
      }
    })(req, res,next);
  }
);

router.post('/vkontakte',
  function (req, res, next) {
    passport.authenticate('vkontakte-token', {session: false}, (error, user, info) => {
      if (error) next(error);
      const token = jwt.sign({_id: user._id}, config.secret);
      console.log('TOKEN: ' + token);
      if (user) {
        res.status(200).json({user, token});
      } else {
        res.send(401);
      }
    })(req, res,next);
  }
);


export default router;
