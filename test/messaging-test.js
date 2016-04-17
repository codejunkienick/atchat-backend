import 'babel-polyfill';
import io from 'socket.io-client';
import chai from 'chai';
import config from '../api/config';
import {Account} from '../api/models';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
chai.should();
const user1 = {username: 'test1', password: 'password'};
const user2 = {username: 'test2', password: 'password'};



describe('Testing messaging', function() {
  let clientSocket1;
  let clientSocket2;
  let token1;
  let token2;
  function removeUsers() {
    return new Promise(function (resolve) {
      Account.remove({username: user1.username}, function(err) {
        Account.remove({username: user2.username}, function(err2) {
          resolve();
        });
      });
    });
  }
  before(async function (done) {
    mongoose.Promise = Promise;
    mongoose.connect(config.server.databaseURL);
    await removeUsers();
    Account.register(new Account({ username : user1.username, displayName: user1.username }), user1.password, function(err, account) {
      if (err) console.log(err);
      token1 = jwt.sign({_id: account._id}, config.secret);
      Account.register(new Account({ username : user2.username, displayName: user2.username }), user2.password, function(err, account2) {
        if (err) console.log(err);
        token2 = jwt.sign({_id: account2._id}, config.secret);
        done();
      });
    });
  });
  after(async function (done) {
    await removeUsers();
    mongoose.disconnect();
    done();
  });

  beforeEach(function(done) {
    // Setup
    clientSocket1 = io.connect('http://' + config.apiHost + ':' + config.apiPort, {
      'reconnection delay' : 0
      , 'reopen delay' : 0
      , 'force new connection' : true
    });
    clientSocket1.emit('authenticate', {token: token1});

    clientSocket2 = io.connect('http://' + config.apiHost + ':' + config.apiPort, {
      'reconnection delay' : 0
      , 'reopen delay' : 0
      , 'force new connection' : true
    });
    clientSocket2.emit('authenticate', {token: token2});
    let lock1 = true;
    let lock2 = true;
    clientSocket1.on('authenticated', function () {
      lock1 = false;
      if (!lock2) done();
    });
    clientSocket2.on('authenticated', function () {
      lock2 = false;
      if (!lock1) done();
    });
  });

  afterEach(function(done) {
    if (clientSocket1.connected) {
      clientSocket1.disconnect();
    }
    if (clientSocket2.connected) {
      clientSocket2.disconnect();
    }
    done();
  });

  describe('Messaging test suite', function() {
    this.timeout(config.exchangeDuration + config.chatDuration + 4000);

    it('Check multiple search err', function(done) {
      clientSocket1.emit('findBuddy', {locale: 'ru'});
      clientSocket1.emit('findBuddy', {locale: 'ru'});

      clientSocket1.on('chat.error', function(data) {
        data.should.to.exist;
        data.error.should.equal('MultipleSearch');
        done();
      });
    });


    it('Check no locale err', function(done) {
      clientSocket1.emit('findBuddy');

      clientSocket1.on('chat.error', function(data) {
        data.should.to.exist;
        data.error.should.to.equal('NoLocale');
        done();
      });
    });

    it('Check connecting users', function (done) {
      clientSocket1.emit('findBuddy', {locale: 'ru'});
      clientSocket2.emit('findBuddy', {locale: 'ru'});

      clientSocket1.on('startChat', function (data) {
        data.receiver.username.should.to.equal(user2.username);
        done();
      });
    });

    it('Check messaging and disconnecting users', function(done) {
      clientSocket1.emit('findBuddy', {locale: 'ru'});
      clientSocket2.emit('findBuddy', {locale: 'ru'});
      const testMessage = 'Test message';
      let chatEnded = false;
      clientSocket2.on('startChat', function (data) {
        data.receiver.username.should.to.equal(user1.username);
        clientSocket2.emit('newMessage', {
          message: testMessage,
          sender: user2.username,
          time: new Date()
        });
      });
      clientSocket1.on('newMessage', function (data) {
        data.message.should.to.equal(testMessage);
        data.sender.should.to.equal(user2.username);
      });
      clientSocket1.on('endChat', function () {
        chatEnded = true;
      });
      clientSocket1.on('endExchange', function () {
        if (!chatEnded) done('Exchange ended without ending chat');
        done();
      })
    });

    it('Expect chat termination', function (done) {
      clientSocket1.emit('findBuddy', {locale: 'ru'});
      clientSocket2.emit('findBuddy', {locale: 'ru'});
      clientSocket2.on('startChat', function (data) {
        clientSocket1.disconnect();
      });
      clientSocket2.on('abortTalk', function () {
        done();
      })
    });

    it('Expect typingMessage event', function (done) {
      clientSocket1.emit('findBuddy', {locale: 'ru'});
      clientSocket2.emit('findBuddy', {locale: 'ru'});
      clientSocket2.on('startChat', function (data) {
        clientSocket1.emit('typingMessage');
      });
      clientSocket2.on('typingMessage', function () {
        done();
      })
    });

    it('Expect to deny exchange user info after chat', function (done) {
      clientSocket1.emit('findBuddy', {locale: 'ru'});
      clientSocket2.emit('findBuddy', {locale: 'ru'});
      clientSocket1.on('endChat', function () {
        clientSocket1.emit('denyExchange');
      });
      clientSocket2.on('exchangeFailure', function () {
        done();
      })
    });

    it('Expect to successful exchange user info after chat', function (done) {
      clientSocket1.emit('findBuddy', {locale: 'ru'});
      clientSocket2.emit('findBuddy', {locale: 'ru'});
      clientSocket1.on('endChat', function() {
        clientSocket1.emit('exchange');
        clientSocket2.emit('exchange');
      });

      clientSocket1.on('exchangeSuccess', async function () {
        const userFromDb = await Account.findOne({username: user1.username}).populate('friends');
        console.log(userFromDb);
        userFromDb.friends[0].username.should.be.equal(user2.username);
        done();
      });
    })
  });

});