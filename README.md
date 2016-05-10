# Atchat API. 
Backend implementation for atchat application.

Written with latest ES6/ES6 features.

### Reqirements
 * MongoDB 3.*
 * Node 4.*
## Instalation
1. Clone repository
2.  ```bash
    $ npm install 
    ```
## Usage
Running production mode on port 3001
```bash
    $ npm run start-prod-api
```
Running development mode on port 3001
```bash
    $ npm run start-dev-api
```

## Features
  * Token based authentication
  * Support VK, Facebook token oAuth
  * Supports multiple user locales
  * Connects users randomly based on their locale and rating(WIP)
  * Disconnects users after set period of time(2 min default)
  * Users can exchange their profiles after chat
  * Users can rate each other after chat(TBD)
  * Supports user reporting(WIP)
  
## API folder structure
  * Models &mdash; Mongoose models
  * Helpers &mdash; Reusable functions
  * Routes &mdash; Express routers
  * Modules &mdash; Separate classes that may go to separate npm modules
  
## SocketIO events
Will write this eventually 

### Events emited only by server
  * startChat
    - emited data: receiverObject, syncTime
  * endChat
  * endExchange
  * exchangeSuccess
  * exchangeFailure

### Client events
  * newMessage
  * typingMessage
  * exchange
  * denyExchange
    - requested data: locale
  * findBuddy
    - requested data: locale
  * stopFindingBuddy
    - requested data: none

## REST API
### URL example
* Get current authenticated user profile:
  * GET http://localhost/user/profile
* Update current user profile:
  * POST http://localhost/user/profile
* Get current authenticated user friends:
  * GET http://localhost/user/profile
* Send report on user
  * POST http://localhost/report
* Register user
  * POST http://localhost/auth/signup
* Sign in user. Returns token and user object
  * POST http://localhost/auth/signin
* Sign up user with facebook token
  * POST http://localhost/auth/facebook
* Sign up user with vkontakte token
  * POST http://localhost/auth/vkontakte
* Sign up user with instagram token **WIP**
  * POST http://localhost/auth/instagram
* Sign up user with twitter token **WIP**
  * POST http://localhost/auth/twitter
