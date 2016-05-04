import FBtStrategy from 'passport-facebook-token';
import VKtStrategy from 'passport-vkontakte-token';
import {Strategy as JavaWebTokenStrategy, ExtractJwt} from 'passport-jwt';
import {Membership, Account} from '../models';
import config from '../config';

export function JwtStategy() {
  return new JavaWebTokenStrategy({
    jwtFromRequest: ExtractJwt.fromAuthHeader(),
    secretOrKey: config.secret
  }, function (jwt_payload, done) {
    Account.findOne({_id: jwt_payload._id}, function (err, user) {
      if (err) {
        return done(err, false);
      }
      if (user) {
        done(null, user);
      } else {
        done(null, false);
      }
    });
  })
}

export function FacebookTokenStrategy() {
  return new FBtStrategy({
      clientID: config.facebook.key,
      clientSecret: config.facebook.secret
    },
    async function (accessToken, refreshToken, profile, done) {
      //check user table for anyone with a facebook ID of profile.id
      try {
        //console.log(profile);
        const membershipData = await Membership.findOne({providerUserId: profile.id, provider: profile.provider});
        if (!membershipData) {
          const account = new Account({
            displayName: profile.displayName,
            social: {
              facebook: {id: profile.id}
            }
          });
          const membership = new Membership({
            provider: profile.provider,
            providerUserId: profile.id,
            accessToken: accessToken,
            user: account
          });
          account.social.facebook.membership = membership;
          await account.save();
          await membership.save();
          return done(null, account);
        } else {
          const user = await Account.findOne({_id: membershipData.user});
          if (!membershipData.user) {
            return done(null, false);
          }
          return done(null, user);
        }
      } catch (err) {
        return done(err);
      }
    }
  )
}

export function VkontakteTokenStrategy() {
  return new VKtStrategy({
      clientID: config.vk.clientId,
      clientSecret: config.vk.secret
    },
    async function (accessToken, refreshToken, profile, done) {
      //check user table for anyone with a facebook ID of profile.id
      try {
        const membershipData = await Membership.findOne({providerUserId: profile.id, provider: profile.provider});
        if (!membershipData) {
          const account = new Account({
            displayName: profile.displayName,
            social: {
              vk: {id: profile.id}
            }
          });
          const membership = new Membership({
            provider: profile.provider,
            providerUserId: profile.id,
            accessToken: accessToken,
            user: account
          });
          account.social.vk.membership = membership;
          account.save(function (err) {
            if (err) console.log(err);
            membership.save(function (err) {
              if (err) console.log(err);
              return done(null, account);
            });
          });
        } else {
          const user = await Account.findOne({_id: membershipData.user});
          if (!membershipData.user) {
            return done(null, false);
          }
          return done(null, user);
        }
      } catch (err) {
        console.log(err);
        return done(err);
      }
    }
  )
}