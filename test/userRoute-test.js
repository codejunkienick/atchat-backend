import 'babel-polyfill';
import io from 'socket.io-client';
import chai from 'chai';
import config from '../api/config';
import {Account} from '../api/models';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import supertest from 'supertest';

const server = supertest.agent('http://127.0.0.1:3001');
chai.should();

const user1 = {username: 'test1', password: 'password'};
const user2 = {username: 'test2', password: 'password'};
const friend = {username: 'testFriend', password: 'password'};

describe('Testing user route', function () {
  let token1;
  let token2;

  function removeUsers() {
    return new Promise(function (resolve) {
      Account.remove({username: user1.username}, function (err) {
        Account.remove({username: friend.username}, function (err) {
          resolve();
        });
      });
    });
  }

  before(async function (done) {
    mongoose.Promise = Promise;
    mongoose.connect(config.server.databaseURL);
    await removeUsers();
    Account.register(new Account({
      username: user1.username,
      displayName: user1.username
    }), user1.password, function (err, account) {
      token1 = jwt.sign({_id: account._id}, config.secret);
      Account.register(new Account({
        username: friend.username,
        displayName: friend.username
      }), friend.password, async function (err, account) {
        const u = await Account.findOne({username: user1.username});
        u.friends.push(await Account.findOne({username: friend.username}));
        u.save(() => done());
      });
    });
  });
  after(async function (done) {
    await removeUsers();
    mongoose.disconnect();
    done();
  });

  beforeEach(function (done) {
    done();
  });

  afterEach(function (done) {
    done();
  });

  describe('User Route test suite', function () {
    it('should register user', function (done) {
      server
        .post('/user/signup')
        .send({...user2, displayName: user2.username})
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          res.body.user.username.should.be.equal(user2.username);
          res.body.token.should.exist;
          Account.remove({username: user2.username}, function (err) {
            done();
          });
        })
    });
    it('should login user', function (done) {
      server
        .post('/user/login')
        .send(user1)
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          done()
        })
    });
    it('should get an access to user profile', function (done) {
      server
        .get('/user/profile')
        .set('Authorization', 'JWT ' + token1)
        .expect(200)
        .expect("Content-type",/json/)
        .end(function (err, res) {
          if (err) return done(err);
          res.body.user.username.should.equal(user1.username);
          done()
        })
    })

    it('should return user friends', function (done) {
      server
        .get('/user/friends')
        .set('Authorization', 'JWT ' + token1)
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          res.body.friends[0].username.should.equal(friend.username);
          done();
        })
    })
  });
});