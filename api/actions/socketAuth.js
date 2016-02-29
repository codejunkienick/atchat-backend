import cookieParser from 'cookie-parser';
import config from '../config';
import Account from '../models/user';
import jwt from 'jsonwebtoken';
export function authenticateSocket(token, callback) {
  jwt.verify(token, config.secret, function(err, decoded) {
    console.log(decoded);
    return Account.findOne({username: decoded.username}, (err, user) => {
        if (err) {
          return callback(err, null);
        }
        return callback(null, user);
    });
  });
}

