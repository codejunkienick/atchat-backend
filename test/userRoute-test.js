import 'babel-polyfill';
1
import chai from 'chai';
import config from '../api/config';
import {Account, Exchange} from '../api/models';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import supertest from 'supertest';

const server = supertest.agent('http://127.0.0.1:3001');
chai.should();

const registeredUser = {username: 'test1', password: 'Password2'};
const user2 = {username: 'test2', password: 'Password2'};
const registeredFriend = {username: 'testFriend', password: 'Password2'};

describe('Testing user interactions with api', function () {
  let token1;
  let token2;

  function removeUsers() {
    return new Promise(function (resolve) {
      Account.remove({username: registeredUser.username}, function (err) {
        Account.remove({username: registeredFriend.username}, function (err) {
          Account.remove({username: user2.username}, function (err) {
            resolve();
          });
        });
      });
    });
  }

  function populateUsers() {
    return new Promise(function (resolve) {
      Account.register(new Account({
        username: registeredUser.username,
        displayName: registeredUser.username
      }), registeredUser.password, function (err, account) {
        token1 = jwt.sign({_id: account._id}, config.secret);
        Account.register(new Account({
          username: registeredFriend.username,
          displayName: registeredFriend.username
        }), registeredFriend.password, async function (err, account) {
          resolve();
        });
      });
    })
  }

  function populateExchanges() {
    //TODO: Add dummy data to exchanges
    return new Promise(async function (resolve) {
      const u1 = await Account.findOne({username: registeredUser.username});
      const fr = await Account.findOne({username: registeredFriend.username});
      const ex1 = new Exchange({
        user1: u1,
        user2: fr,
        result: 'SUCCESS',
        date: Date.parse('March 7, 2014')
      });
      const ex2 = new Exchange({
        user1: fr,
        user2: u1,
        result: 'FAILURE',
        date: Date.parse('March 12, 2015')
      });
      const ex3 = new Exchange({
        user1: u1,
        user2: fr,
        result: 'SUCCESS',
        date: Date.parse('March 7, 2016')
      });
      await ex1.save();
      await ex2.save();
      await ex3.save();
      resolve([{_id: ex1._id}, {_id: ex2._id}, {_id: ex3._id}]);
    });
  }


  before(async function (done) {
    mongoose.Promise = Promise;
    mongoose.connect(config.server.databaseURL);
    await removeUsers();
    await populateUsers();
    const u = await Account.findOne({username: registeredUser.username});
    u.friends.push(await Account.findOne({username: registeredFriend.username}));
    u.save(() => done());
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
        .post('/auth/signup')
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
    it('should not sign up with incorrect username', function (done) {
      server
        .post('/auth/signup')
        .send({username: 'Invalid^*(*AS', password: 'passWithDigits1', displayName: user2.username})
        .expect(400)
        .end(function (err, res) {
          if (err || res.body.error) return done();
        })
    });
    it('should not sign up with weak password', function (done) {
      server
        .post('/auth/signup')
        .send({username: 'testWeakPassword', password: 'passWithoutDigits', displayName: user2.username})
        .expect(400)
        .end(function (err, res) {
          if (err || res.body.error) return done();
        })
    });
    it('should login user', function (done) {
      server
        .post('/auth/signin')
        .send(registeredUser)
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
        .expect("Content-type", /json/)
        .end(function (err, res) {
          if (err) return done(err);
          res.body.user.username.should.equal(registeredUser.username);
          done()
        })
    });
    it('should update user displayName', function (done) {
      const newDisplayName = 'John Doe';
      server
        .post('/user/profile')
        .set('Authorization', 'JWT ' + token1)
        .send({displayName: newDisplayName})
        .expect(200)
        .expect("Content-type", /json/)
        .end(function (err, res) {
          if (err) return done(err);
          res.body.user.displayName.should.equal(newDisplayName);
          done()
        })
    });
    it('should upload user avatar and update', function (done) {
      server
        .post('/user/profile')
        .set('Content-Type', 'multipart/form-data')
        .set('Authorization', 'JWT ' + token1)
        .attach('avatar', __dirname + '/test_files/avatar.png')
        .expect(200)
        .expect("Content-type", /json/)
        .end(function (err, res) {
          if (err) return done(err);
          res.body.user.avatar.should.exist;
          server
            .post('/user/profile')
            .set('Content-Type', 'multipart/form-data')
            .set('Authorization', 'JWT ' + token1)
            .attach('avatar', __dirname + '/test_files/avatar.png')
            .expect(200)
            .expect("Content-type", /json/)
            .end(function (err, res) {
              if (err) return done(err);
              done()
              res.body.user.avatar.should.exist;
            })
        })
    });
    it('should return user friends', function (done) {
      server
        .get('/user/friends')
        .set('Authorization', 'JWT ' + token1)
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          res.body.friends[0].username.should.equal(registeredFriend.username);
          done();
        })
    });
    it('should return user exchange history', async function (done) {
      const ids = await populateExchanges();
      server
        .get('/user/exchanges')
        .set('Authorization', 'JWT ' + token1)
        .expect(200)
        .end(async function (err, res) {
          if (err) return done(err);
          res.body.exchanges.should.exist;
          res.body.exchanges.length.should.equal(ids.length);
          await Exchange.remove(ids).exec();
          done();
        })
    });
    it('should return user exchange history from date', async function (done) {
      const ids = await populateExchanges();
      server
        .get('/user/exchanges' + '?date=' + encodeURIComponent(Date.parse('March 12, 2015')))
        .set('Authorization', 'JWT ' + token1)
        .expect(200)
        .end(async function (err, res) {
          if (err) return done(err);
          res.body.exchanges.should.exist;
          res.body.exchanges.length.should.equal(2);
          await Exchange.remove(ids).exec();
          done();
        })
    });
  });

  describe('Testing report route', function () {
    it('should app report to db', async function (done) {
      const reported = await Account.findOne({username: registeredFriend.username});
      const reason = "SPAM";
      server
        .post('/report')
        .set('Authorization', 'JWT ' + token1)
        .send({reported: reported._id, reason})
        .expect(200)
        .end(done)
    });
  })
});