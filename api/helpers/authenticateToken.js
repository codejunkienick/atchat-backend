import config from '../config';
import Account from '../models/account';
import Membership from '../models/membership';
import jwt from 'jsonwebtoken';
export default function authenticateSocket(token) {
  return new Promise(async (resolve, reject) => {
    jwt.verify(token, config.secret, async function(err, decoded) {
      if (err) return reject(err);
      try {
        const user = await Account.findOne({_id: decoded._id});
        if (!user) reject();
        resolve({
          _id: user._id,
          username: user.username
        });
      } catch (mongoErr) {
        return reject(mongoErr);
      }
    });
  });
}

