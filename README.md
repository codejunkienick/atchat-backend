# Atchat API. 
Backend implementation for atchat application.

### Reqirements
 * MongoDB 3.*
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
  

## SocketIO events
Will write this eventually 

## REST API
### URL example
* Get current authenticated user profile:
  * GET http://localhost/user/profile
* Update current user profile:
  * POST http://localhost/user/profile
* Get current authenticated user friends:
  * GET http://localhost/user/profile

