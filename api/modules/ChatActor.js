import _ from 'lodash';
import {CronJob} from 'cron';
import config from '../config';
const Immutable = require('immutable');
// TODO: add support for multiple locales

class ChatStorage {
  constructor() {

  }
}

export default class ChatActor {
  constructor(handlers, options = {}) {
    this.options = {
      startChatCronTime: (options.startChatCronTime) ? options.startChatCronTime : '* * * * * *',
      endChatCronTime: (options.endChatCronTime) ? options.endChatCronTime : '* * * * * *',
      endExchangeCronTime: (options.endChatCronTime) ? options.endExchangeCronTime : '* * * * * *'
    };

    this.locks = {
      startChatInProgress: false
    };

    this.handlers = {
      onStartChat: handlers.onStartChat,
      onEndChat: handlers.onEndChat,
      onEndExchange: handlers.onEndExchange
    };
    this.currentChats = Immutable.Stack();
    this.exchangeChats = Immutable.Stack();

    this.connectionMap = Immutable.Map();
    this.exchangeMap = Immutable.Map();

    this.usersSearchingIds = Immutable.Set();

    this.usersInSearch = Immutable.Map({
      'ru': Immutable.Set(),
      'en': Immutable.Set(),
      'de': Immutable.Set(),
      'undefined': Immutable.Set()
    });

  }

  emptyLocale(locale) {
    this.usersInSearch = this.usersInSearch.set(locale, Immutable.Set());
  }

  updateLocale(locale, users) {
    this.usersInSearch = this.usersInSearch.set(locale, this.usersInSearch.get(locale).union(users))
  }

  addSearchingUser(socket) {
    const locale = socket.locale || socket.user.locale || 'undefined';
    this.usersSearchingIds = this.usersSearchingIds.add(socket.user._id);
    this.usersInSearch = this.usersInSearch.set(locale, this.usersInSearch.get(locale).add(socket))
  }

  removeSearchingUser(socket) {
    const locale = socket.locale || socket.user.locale || 'undefined';
    this.usersSearchingIds = this.usersSearchingIds.remove(socket.user._id);
    this.usersInSearch = this.usersInSearch.set(locale, this.usersInSearch.get(locale).remove(socket))
  }

  getSearchingUserArray(locale = 'undefined') {
    return this.usersInSearch.get(locale).toArray();
  }

  getConnectedUser(socket) {
    return this.connectionMap.get(socket.user._id);
  }

  getExchangeUser(socket) {
    return this.exchangeMap.get(socket.user._id);
  }

  isUserSearching(socket) {
    return (this.usersSearchingIds.has(socket.user._id));
  }

  /*Chat stage functionality*/
  isChatAborted(userId1, userId2) {
    return (!this.connectionMap.has(userId1) || !this.connectionMap.has(userId2));
  }

  isChatValid(userId1, userId2) {
    return (
    !this.isChatAborted(userId1, userId2)
    && this.connectionMap.get(userId1).user._id == userId2
    && this.connectionMap.get(userId2).user._id == userId1)
  }
  countActiveChats() {
    return this.currentChats.size;
  }
  addChat(socket1, socket2) {
    const endTime = new Date(new Date().getTime() + config.chatDuration).getTime();
    this.currentChats = this.currentChats.push({
      socket1,
      socket2,
      endTime
    });
    this.connectionMap = this.connectionMap.set(socket1.user._id, socket2);
    this.connectionMap = this.connectionMap.set(socket2.user._id, socket1);
  }

  endChat(chat) {
    this.connectionMap = this.connectionMap.delete(chat.socket1.user._id);
    this.connectionMap = this.connectionMap.delete(chat.socket2.user._id);
    this.currentChats = this.currentChats.pop();
  }

  /*Exchange functionality*/
  addExchange(socket1, socket2) {
    const exchangeTime = new Date(new Date().getTime() + config.exchangeDuration).getTime();
    this.exchangeChats = this.exchangeChats.push({
      exchangeTime,
      socket1,
      socket2
    });
    this.exchangeMap = this.exchangeMap.set(socket1.user._id, {status: 'PENDING', socket: socket2});
    this.exchangeMap = this.exchangeMap.set(socket2.user._id, {status: 'PENDING', socket: socket1});
  }

  endExchange(userId1, userId2) {
    this.exchangeMap.delete(userId1);
    this.exchangeMap.delete(userId2);
    this.exchangeChats = this.exchangeChats.pop();
  }

  isExchangeAborted(userId1, userId2) {
    return (!this.exchangeMap.has(userId1) || !this.exchangeMap.has(userId2))
  }

  isExchangeValid(userId1, userId2) {
    return (
    !this.isExchangeAborted(userId1, userId2)
    && this.exchangeMap.get(userId1).socket.user._id == userId2
    && this.exchangeMap.get(userId2).socket.user._id == userId1)
  }

  acceptExchange(socket, receiverSocket) {
    this.exchangeMap = this.exchangeMap.set(receiverSocket.user._id, {status: "ACCEPT", socket: socket});
  }

  // Make any current stage for two sockets invalid to remove it in cron afterwards
  terminateChat(socket1, socket2) {
    this.connectionMap = this.connectionMap.delete(socket1.user._id);
    this.connectionMap = this.connectionMap.delete(socket2.user._id);
    this.exchangeMap = this.exchangeMap.delete(socket1.user._id);
    this.exchangeMap = this.exchangeMap.delete(socket2.user._id);
  }

  /* Cron jobs for:
   * - Creating chats between users
   * - Ending chats
   * - Ending exchange between users
   */
  startChatCronJob(locale) {
    return new CronJob(this.options.startChatCronTime, () => {
      let userSet = this.usersInSearch.get(locale);
      if (this.locks.startChatInProgress || userSet.size < 2) return;
      this.locks.startChatInProgress = true;
      this.emptyLocale(locale);
      let userArray = userSet.toArray();
      userArray = _.shuffle(userArray);

      while (userArray.length >= 2) {
        const socket1 = userArray.pop();
        const socket2 = userArray.pop();
        if (!socket1 || !socket2) {
          console.log('[ERR] Internal bug with connecting users');
          return;
        }
        this.handlers.onStartChat(socket1, socket2);
        this.addChat(socket1, socket2);
      }
      this.updateLocale(locale, userArray);
      this.locks.startChatInProgress = false;
    }, null, false);
  }

  get endChatCronJob() {
    let endChatInProgress = false;

    return new CronJob(this.options.endChatCronTime, () => {
      if (!this.currentChats.first() || this.currentChats.first() == undefined || endChatInProgress) return;
      endChatInProgress = true;
      while (true) {
        const chat = this.currentChats.first();
        if (!chat || chat.endTime - new Date().getTime() > 0) {
          break;
        }
        const {socket1, socket2} = chat;
        const userId1 = socket1.user._id;
        const userId2 = socket2.user._id;
        if (!this.isChatValid(userId1, userId2)) {
          this.endChat(chat);
          continue;
        }
        this.handlers.onEndChat(socket1, socket2);
        this.endChat(chat);
        this.addExchange(socket1, socket2);
      }
      endChatInProgress = false;
    }, null, false);
  }

  get endExchangeCronJob() {
    let endExchageInProgress = false;
    return new CronJob(this.options.endExchangeCronTime, () => {
      if (!this.exchangeChats.first() || this.exchangeChats.first() == undefined || endExchageInProgress) return;
      endExchageInProgress = true;
      while (true) {
        const lastExchange = this.exchangeChats.first();
        if (!lastExchange || lastExchange.exchangeTime - new Date().getTime() > 0) {
          break;
        }
        const {socket1, socket2} = lastExchange;

        const userId1 = socket1.user._id;
        const userId2 = socket2.user._id;
        if (!this.isExchangeValid(userId1, userId2)) {
          //This means talk was aborted and we no longer need to process it
          this.exchangeChats = this.exchangeChats.pop();
          continue;
        }
        this.handlers.onEndExchange(socket1, socket2);
        this.endExchange(userId1, userId2)
      }
      endExchageInProgress = false;
    }, null, false);
  }

  run() {
    console.log('Running ChatActor cron jobs');
    for (let locale of this.usersInSearch.keys()) {
      console.log('Running start chat for locale: ' + locale);
      this.startChatCronJob(locale).start();
    }
    this.endChatCronJob.start();
    this.endExchangeCronJob.start();
  }
}