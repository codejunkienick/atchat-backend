import Account from '../models/user';
import express from 'express';
import passport from 'passport';
import {sessionStore} from '../api';
import authenticateCookie from '../actions/cookieAuth';
const router = express.Router();
const regUsername = /^[a-z0-9_-]{3,16}$/;
import jwt from 'jsonwebtoken';
import config from '../config';

router.post('/signup', function(req, res) {
  console.log(req.body);
  const user = {
    displayName: req.body.displayName,
    username: req.body.username,
    password: req.body.password,
  };
  if (!user.username.match(regUsername)) {
    return res.status(400).send("Invalid username");
  }
  Account.register(new Account({ username : user.username, displayName: user.displayName }), user.password, function(err, account) {
    if (err) {
      return res.status(500).send(err);
    } else {
      passport.authenticate('local', function (err, account) {
        req.logIn(account, function() {
        res.status(err ? 500 : 200).send(err ? err : {user: account});
        });
      })(req, res);
    }
  });
});

router.post('/login',
  function (req, res, next) {
    passport.authenticate('local', function(err, user, info) {

      if (err) { return res.status(401).send(err); }
      if (!user) {
        console.log(info);
        return res.status(401).json(info);
      }
      req.logIn(user, function(err) {
        if (err) {
          return res.status(401).send(err);
        }
        const token = jwt.sign({ username: user.username}, config.secret);
        req.session.save(function (err) {
          if (err) {
            console.log(err);
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

router.get('/loginCookie', authenticateCookie);

//router.get('/loginToken', authenticateToken);

router.get('/logout', function (req, res) {
  req.logout();
  res.status(200).json({status: 'Successful logout'});
});

export default router;
