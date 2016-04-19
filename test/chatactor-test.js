import 'babel-polyfill';
import io from 'socket.io-client';
import chai from 'chai';
import config from '../api/config';
import {Account} from '../api/models';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import ChatActor from '../api/helpers/ChatActor';
chai.should();
const user1 = {username: 'test1', password: 'password'};
const user2 = {username: 'test2', password: 'password'};


describe('Testing ChatActor', function () {
  let clientSocket1;
  let clientSocket2;
  let userData1;
  let userData2;
  let token1;
  let token2;
  let chatActor;

  function removeUsers() {
    return new Promise(function (resolve) {
      Account.remove({username: user1.username}, function (err) {
        Account.remove({username: user2.username}, function (err2) {
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
      if (err) console.log(err);
      userData1 = account.toObject();
      token1 = jwt.sign({_id: account._id}, config.secret);
      Account.register(new Account({
        username: user2.username,
        displayName: user2.username
      }), user2.password, function (err, account2) {
        if (err) console.log(err);
        userData2 = account2.toObject();
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

  beforeEach(function (done) {
    // Setup
    chatActor = new ChatActor({
      onStartChat: (socket1, socket2) => {
        const syncTime = Date.now();
        const dataForFirst = {
          receiver: {
            displayName: socket2.user.displayName,
            username: socket2.user.username,
          },
          time: syncTime
        };
        const dataForSecond = {
          receiver: {
            displayName: socket1.user.displayName,
            username: socket1.user.username,
          },
          time: syncTime
        };
        console.log("starting chat");
        socket1.emit('startChat', dataForFirst);
        socket2.emit('startChat', dataForSecond);
      },
      onEndChat: (socket1, socket2) => {
        console.log("endingchat");
        socket1.emit('endChat');
        socket2.emit('endChat');
      },
      onEndExchange: (socket1, socket2) => {
        console.log('end exchange');
        socket1.emit('endExchange');
        socket2.emit('endExchange');
      }
    });
    clientSocket1 = io.connect('http://' + config.apiHost + ':' + config.apiPort, {
      'reconnection delay': 0
      , 'reopen delay': 0
      , 'force new connection': true
    });
    clientSocket1.emit('authenticate', {token: token1});
    clientSocket2 = io.connect('http://' + config.apiHost + ':' + config.apiPort, {
      'reconnection delay': 0
      , 'reopen delay': 0
      , 'force new connection': true
    });

    clientSocket2.emit('authenticate', {token: token2});
    let lock1 = true;
    let lock2 = true;
    clientSocket1.on('authenticated', function () {
      lock1 = false;
      clientSocket1.user = userData1;
      if (!lock2) done();
    });
    clientSocket2.on('authenticated', function () {
      lock2 = false;
      clientSocket2.user = userData2;
      if (!lock1) done();
    });
  });

  afterEach(function (done) {
    if (clientSocket1.connected) {
      clientSocket1.disconnect();
    }
    if (clientSocket2.connected) {
      clientSocket2.disconnect();
    }
    done();
  });

  describe('Messaging test suite', function () {
    this.timeout(config.exchangeDuration + config.chatDuration + 4000);

    it('Expect to create valid chat', function (done) {
      clientSocket1.locale = 'ru';
      clientSocket2.locale = 'ru';

      chatActor.addSearchingUser(clientSocket1);
      chatActor.addSearchingUser(clientSocket2);
      const [someSocket1, someSocket2] = chatActor.getSearchingUserArray('ru');
      someSocket1.should.to.exist;
      someSocket2.should.to.exist;
      someSocket1.user.username.should.not.equal(someSocket2.user.username);
      chatActor.addChat(someSocket1, someSocket2);
      chatActor.getConnectedUser(someSocket1).should.to.equal(someSocket2);
      done();
    });
    it('Expect to remove first user from search', function (done) {
      clientSocket1.locale = 'ru';
      clientSocket2.locale = 'ru';

      chatActor.addSearchingUser(clientSocket1);
      chatActor.addSearchingUser(clientSocket2);
      chatActor.removeSearchingUser(clientSocket1);
      const arr = chatActor.getSearchingUserArray('ru');
      arr.length.should.to.equal(1);
      const [someSocket] = arr;
      someSocket.user.username.should.to.equal(clientSocket2.user.username);
      done();
    });
  });

});