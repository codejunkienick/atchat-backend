import Account from '../models/account';
import express from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import config from '../config';

const router = express.Router();
const regUsername = /^[a-z0-9_-]{3,16}$/;

router.post('/signup', function (req, res) {
  console.log(req.body);
  const user = {
    displayName: req.body.displayName,
    username: req.body.username,
    password: req.body.password,
  };
  if (!user.username.match(regUsername)) {
    return res.status(400).send("Invalid username");
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

router.post('/login',
  function (req, res, next) {
    passport.authenticate('local', {session: false}, function (err, user, info) {

      if (err) {
        return res.status(401).send(err);
      }
      if (!user) {
        console.log(info);
        return res.status(401).json(info);
      }
      req.logIn(user, {session: false}, function (err) {
        if (err) {
          return res.status(401).send(err);
        }
        const token = jwt.sign({_id: user._id}, config.secret);
        req.session.save(function (err) {
          if (err) {
            return res.status(401).send(err);
          }
          res.status(200).json({
            user,
            token
          });
        });
      });
    })(req, res, next)
  });

router.get('/profile', passport.authenticate('jwt', {session: false}), function (req, res) {
  res.status(200).send({user: req.user});
});

router.get('/friends', passport.authenticate('jwt', {session: false}), async function (req, res) {
  const userWithFriends = await req.user.populate('friends').execPopulate();
  res.status(200).send({friends: userWithFriends.friends});
});

export default router;
