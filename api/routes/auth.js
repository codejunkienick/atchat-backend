import Account from '../models/account';
import express from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import config from '../config';

const router = express.Router();
const regUsername = /^[a-z0-9_-]{3,16}$/;
const regPassword = /(?=^.{6,}$)(?=.*\d)(?=.*[!@#$%^&*]*)(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/;

const siginMiddleware = (req, res, next) => {
  return (error, user, info) => {
    if (error) {
      return res.status(401).send({error: error});
    }
    if (!user) {
      return res.status(401).json(info);
    }
    const token = jwt.sign({_id: user._id}, config.secret);
    res.status(200).json({user, token});
  };
};

router.post('/facebook', function (req, res, next) {
    passport.authenticate('facebook-token', {session: false}, siginMiddleware(req, res,next))(req, res,next);
  }
);

router.post('/vkontakte', function (req, res, next) {
    passport.authenticate('vkontakte-token', {session: false}, siginMiddleware(req, res,next))(req, res, next);
  }
);

router.post('/signin', function (req, res, next) {
  passport.authenticate('local', {session: false}, siginMiddleware(req, res,next))(req, res, next)
});

router.post('/signup', function (req, res) {
  const user = {
    displayName: req.body.displayName,
    username: req.body.username.toLowerCase(),
    password: req.body.password,
  };
  if (!user.username.match(regUsername)) {
    return res.status(400).send({error: "Invalid username"});
  }
  if (!user.password.match(regPassword)) {
    return res.status(400).send({error: "Weak password. Must contain at least 6 character and at least 1 digit, 1 lowercase letter, 1 uppercase letter"});
  }
  Account.register(new Account({
    username: user.username,
    displayName: user.displayName
  }), user.password, function (err, account) {
    if (err) {
      return res.status(500).send(err);
    } else {
      passport.authenticate('local',function (err, account) {
        req.logIn(user, {session: false}, function () {
          const token = jwt.sign({_id: user._id}, config.secret);
          res.status(err ? 500 : 200).send(err ? err : {
            user,
            token
          });
        });
      })(req, res);
    }
  });
});


export default router;
