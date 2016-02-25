import Account from '../models/user';
import {sessionStore} from '../api';
export default function authenticateCookie(req, res) {
    console.log(req.signedCookies);
    if (!req.signedCookies) {
      return res.status(400).send("No secureCookies found");
    }
    sessionStore.get(req.signedCookies.usersid, async function(err, session){
      if ((!err && !session) || !session.passport) err = new Error('session not found');
      if (err) {
        res.status(401).send(err);
      } else {
        try {
          let user = await Account.findOne({username: session.passport.user});
          req.user = user;
          res.status(200).json(user);
        } catch (err) {
          res.status(401).send(err);
        }
      }
    });
}