import Account from '../models/user';
import express from 'express';
import passport from 'passport';

const router = express.Router();
const regUsername = /^[a-z0-9_-]{3,16}$/;

router.post('/signup', function(req, res) {
  console.log(req.body);
  const user = {
    displayName: req.body.displayName,
    username: req.body.username,
    password: req.body.password,
  };
  if (!regUsername.match(user.username)) {
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

router.post('/signin',
  passport.authenticate('local'),
  function(req, res) {
    req.session.save(function (err) {
      if (err) {
        return next(err);
      }
      res.status(200).send({user: req.user});
    });
  });

export default router;
