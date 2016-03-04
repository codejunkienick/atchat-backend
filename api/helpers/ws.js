import Account from '../models/account';
export default async function handleUserSocket(chatActor, socket) {
    function abortTalk(receiverSocket, msg = "abortTalk", data = {}) {
      chatActor.terminateChat(socket, receiverSocket);
      receiverSocket.emit(msg, data);
    }
    try {
      const user = socket.user;
      socket.on('findBuddy', (data) => {
        if (chatActor.isUserSearching(socket)) {
          console.log('[SOCKET] User ' + user.username + ' multiple search ');
          return;
        }
        console.log("[SOCKET] User " + user.username + " started searching");
        chatActor.addSearchingUser(socket)
      });

      socket.on('denyExchange', () => {
        const receiver = chatActor.getChatUser(socket);
        abortTalk(socket, receiver.socket, "exchangeFailure");
      });
      socket.on('exchange', () => {
        const receiver = chatActor.getExchangeUser(socket);
        if (receiver) {
          const {status} = receiver;
          console.log(status + " " + receiver.socket.user.username);
          switch (status) {
            case "PENDING":
              chatActor.acceptExchange(receiver.socket);
              break;
            case "ACCEPT":
              console.log("YAY");
              abortTalk(receiver.socket, "exchangeSuccess", receiver.socket.user);
              Account.addFriend(user.username, receiver.socket.user.username);
              break;
            default:
              break;
          }
        }
      });

      socket.on('stopFindingBuddy', () => {
        console.log('[SOCKET] User ' + user.username + ' stopped searching');
        chatActor.removeSearchingUser(socket);
      });

      socket.on('newMessage', (data) => {
        console.log('[SOCKET] User ' + user.username + ' sends message to User ' + data.username);
        let receiver = chatActor.getChatUser(socket);
        receiver.emit("newMessage", data.message);
      });

      socket.on('disconnect', () => {
        console.log('[SOCKET] ' + user.username + ' disconnected from ws');
        chatActor.removeSearchingUser(socket);
        const messageReceiver = chatActor.getChatUser(socket);
        const exchangeReceiver = chatActor.getExchangeUser(socket);
        if (messageReceiver) {
          abortTalk(socket, messageReceiver);
        }
        if (exchangeReceiver) {
          abortTalk(socket, exchangeReceiver.socket);
        }
        socket.disconnect();
      });
    } catch (err) {
      console.log(err);
    }
}