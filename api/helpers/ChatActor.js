import _ from 'lodash';
import {CronJob} from 'cron';
import config from '../config';
const Immutable = require('immutable');
// TODO: add support for multiple locales
export default class ChatActor {
  constructor(handlers, options = {}) {
    this.options = {
      startChatCronTime: (options.startChatCronTime) ? options.startChatCronTime : '* * * * * *',
      endChatCronTime: (options.endChatCronTime) ? options.endChatCronTime : '* * * * * *',
      endExchangeCronTime: (options.endChatCronTime) ? options.endExchangeCronTime : '* * * * * *'
    };

    this.handlers = {
      onStartChat: handlers.onStartChat,
      onEndChat: handlers.onEndChat,
      onEndExchange: handlers.onEndExchange
    };
    this.currentChats = Immutable.Stack();
    this.exchangeChats = Immutable.Stack();

    this.connectionMap = new Map();
    this.exchangeMap = new Map();

    this.usersSearchingIds = Immutable.Set();
    this.usersSearchingSet = Immutable.Set();
  }
  addSearchingUser(socket) {
    this.usersSearchingIds = this.usersSearchingIds.add(socket.user.username);
    this.usersSearchingSet = this.usersSearchingSet.add(socket);
  }
  removeSearchingUser(socket) {
    this.usersSearchingIds = this.usersSearchingIds.remove(socket.user.username);
    this.usersSearchingSet = this.usersSearchingSet.remove(socket);
  }
  getChatUser(socket) {
    return this.connectionMap.get(socket.user.username);
  }
  getExchangeUser(socket) {
    return this.exchangeMap.get(socket.user.username);
  }
  isUserSearching(socket) {
    return (this.usersSearchingIds.has(socket.user.username));
  }

  /*Chat stage functionality*/
  isChatAborted(username1, username2) {
    return (!this.connectionMap.has(username1) || !this.connectionMap.has(username2));
  }
  isChatValid(username1, username2) {
    return (
    !this.isChatAborted(username1, username2)
    && this.connectionMap.get(username1).user.username == username2
    && this.connectionMap.get(username2).user.username == username1)
  }
  addChat(socket1, socket2) {
    const endTime = new Date(new Date().getTime() + config.chatDuration).getTime();
    this.currentChats = this.currentChats.push({
      socket1,
      socket2,
      endTime
    });
    this.connectionMap.set(socket1.user.username, socket2);
    this.connectionMap.set(socket2.user.username, socket1);
  }
  endChat(chat) {
    this.connectionMap.delete(chat.socket1.user.username);
    this.connectionMap.delete(chat.socket2.user.username);
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
    this.exchangeMap.set(socket1.user.username, { status: 'PENDING', socket: socket2 });
    this.exchangeMap.set(socket2.user.username, { status: 'PENDING', socket: socket1 });
    console.log('added exchange');
  }
  endExchange(username1, username2) {
    this.exchangeMap.delete(username1);
    this.exchangeMap.delete(username2);
    this.exchangeChats = this.exchangeChats.pop();
  }
  isExchangeAborted(username1, username2) {
    return (!this.exchangeMap.has(username1) || !this.exchangeMap.has(username2))
  }
  isExchangeValid(username1, username2) {
    return (
    !this.isExchangeAborted(username1, username2)
    && this.exchangeMap.get(username1).socket.user.username == username2
    && this.exchangeMap.get(username2).socket.user.username == username1)
  }
  acceptExchange(socket, receiverSocket) {
    this.exchangeMap.set(receiverSocket.user.username, {status: "ACCEPT", socket: socket});
  }

  // Make any current stage for two sockets invalid to remove it in cron afterwards
  terminateChat(socket1, socket2) {
    this.connectionMap.delete(socket1.user.username);
    this.connectionMap.delete(socket2.user.username);
    this.exchangeMap.delete(socket1.user.username);
    this.exchangeMap.delete(socket2.user.username);
  }
  /* Cron jobs for:
  * - Creating chats between users
  * - Ending chats
  * - Ending exchange between users
  */
  get startChatCronJob() {
    let startChatInProgress = false;
    return new CronJob(this.options.startChatCronTime, () => {
      if (startChatInProgress || this.usersSearchingSet.size < 2) return;
      startChatInProgress = true;
      let usersSearching = this.usersSearchingSet.toArray();
      usersSearching = _.shuffle(usersSearching);
      while (usersSearching.length >= 2) {
        const socket1 = usersSearching.pop();
        const socket2 = usersSearching.pop();
        if (!socket1 || !socket2) {
          console.log('[ERR] Internal bug with connecting users' );
          return;
        }
        this.handlers.onStartChat(socket1, socket2);
        this.addChat(socket1, socket2);
      }
      this.usersSearchingSet = Immutable.Set(usersSearching);
      startChatInProgress = false;
    }, null, false);
  }

  get endChatCronJob() {
    let endChatInProgress = false;

    return new CronJob(this.options.endChatCronTime, () => {
      if ( !this.currentChats.first() || this.currentChats.first() == undefined || endChatInProgress) return;
      endChatInProgress = true;
      while (true) {
        const chat = this.currentChats.first();
        if (!chat || chat.endTime - new Date().getTime() > 0) {
          break;
        }
        const {socket1, socket2} = chat;
        const username1 = socket1.user.username;
        const username2 = socket2.user.username;
        if (!this.isChatValid(username1, username2)) {
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

        const username1 = socket1.user.username;
        const username2 = socket2.user.username;
        if (!this.isExchangeValid(username1, username2)) {
          //This means talk was aborted and we no longer need to process it
          this.exchangeChats = this.exchangeChats.pop();
          continue;
        }
        this.handlers.onEndExchange(socket1, socket2);
        this.endExchange(username1, username2)
      }
      endExchageInProgress = false;
    }, null, false);
  }

  run() {
    console.log('Running ChatActor cron jobs');
    this.startChatCronJob.start();
    this.endChatCronJob.start();
    this.endExchangeCronJob.start();
  }
}