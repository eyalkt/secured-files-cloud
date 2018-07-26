
       //////////////////////////   
      /// server main module ///    
     //////////////////////////     

/* general modules requires */
const path = require('path');
const readline = require('readline');     // server cli

/* express.js requires and configs */
const express = require('express');
const app = express();
const session = require('express-session');
const bodyParser = require('body-parser');  //easy url args retrive
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({secret: '61843c21b87ccc2c6999b314c39c2940998ffafd9bd78059da0a26060c0feadd', 
                  resave: false, saveUninitialized: false}));
app.use('/libs', express.static(path.join(__dirname + '/libs')));
app.use('/client/styles', express.static(path.join(__dirname + '/client/styles')));

/* local modules requires and system vars */
const database = require('./database');
const files = require('./files');
const port = 8002;
// const hostname = '127.0.0.1';
var client_inside_path = path.join(__dirname + '/client/inside.html');
var client_index_path = path.join(__dirname + '/client/index.html');
debug = 0; // global

////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////


database.initialize();

// Welcome page
/*
send the client to the client-index-path => index.html
*/
app.get('/', (req, res) => {
  if (req.session.loggedIn) res.sendFile(client_inside_path);
  else res.sendFile(client_index_path);
});

// registration
/*
add user to the database, by username and password
and, create user directory, for uploading the files.
*/
app.post('/register', async function(req, res) {
  if (debug) debugPrint('register', req.session.uname);
  var success = await database.addUser(req.body.username, req.body.psw);
  if (success) {  // assuming only reason for failure is 'usr already exists' (UAE)
    req.session.loggedIn = true;
    req.session.uname = req.body.username;
    files.createUserDir(res, req.session.uname);
  }
  else res.send('UAE'); // User Already Exists
});

// login
/*
request to login from the client,
check if there is such user, and the password is correct,
if there is a match => send user to inside.html (client-inside-path),
otherwise, send the relevant "error".
*/
app.post('/login', async function (req, res) { //check credentials
  if (debug) debugPrint('login', req.session.uname);
  if (req.session.loggedIn) {
    res.sendFile(client_inside_path);
    return;
  }
  let ans = await database.checkCredentials(req.body.username, req.body.psw);
  switch (ans) {
    case NO_SUCH_USER:
      res.send('WID'); // wrong id
      break;
    case WRONG_PASS:
      res.send('WPS'); // wrong pass
      break;
    case OK:
      req.session.loggedIn = true;
      req.session.uname = req.body.username;
      res.sendFile(client_inside_path);
      break;
    default:
      console.log(red('wwhat?')); // should not get here
  }
});

/*
when first login, we want to create the meta-data-file
in this user directory.
*/
app.post('/first_login', async function (req, res) {
  if (debug) debugPrint('first_login', req.session.uname);
  if (!req.session.loggedIn) res.end('NOT LOGGED IN');
  else await files.newClientUpdateMetaMac(req, res);
});

/*
this request receives a list of files OR "all", 
which are infected OR suspected to be infected,
and handels them.
this implementation handling is deleting the files, but -
this is a place for a future more sophisticated (not learned in class) solution. 
*/
app.post('/quarantine_files', async function (req, res) {
  if (debug) debugPrint('quarantine_files', req.session.uname);
  if (!req.session.loggedIn) res.end('NOT LOGGED IN');
  else {
    if (req.body.files == 'all') await files.deleteFiles(req, res, null);
    else await files.deleteFiles(req, res, req.body.files.split(','));
    await files.onlytUpdateMetaFile(req.session.uname, req.body.meta, req.body.mac);
    res.send('OK');
  }
});

// logout
/*
handles logout requests, turns off the loggedIn bit,
and sends the client to the index.html page
*/
app.post('/logout', function (req, res) {
  if (debug) debugPrint('logout', req.session.uname);
  if (!req.session.loggedIn) res.end('NOT LOGGED IN');
  else {
    req.session.loggedIn = false; 
    res.sendFile(client_index_path); 
  }
});

// upload request
/*
handles upload file request.
*/
app.post('/upload', async function (req, res) {
  if (debug) debugPrint('upload', req.session.uname);
  if (!req.session.loggedIn) res.end('NOT LOGGED IN');
  else {
    await files.upload(req,res);
  }
});

// download request
/*
handles download file request
*/
app.post('/download_file', function (req, res) {
  if (debug) debugPrint('download_file', req.session.uname);
  if (!req.session.loggedIn) res.end('NOT LOGGED IN');
  else files.download(req, res);
});

// get files list request
/*
sends back the meta-data file of this user.
*/
app.post('/get_files', async function (req, res) {
  if (debug) debugPrint('get_files', req.session.uname);
  if (!req.session.loggedIn) res.end('NOT LOGGED IN');
  else await files.getFiles(req,res);
});

// delete file request
/*
handles a request to delete a specific file
*/
app.post('/delete_file', async function (req, res) {
  if (debug) debugPrint('delete_file', req.session.uname);
  if (!req.session.loggedIn) res.end('NOT LOGGED IN');
  else {
    await files.deleteFile(req, res);
  }
});

//rename
/*
request to rename a specific file
*/
app.post('/rename', async function (req, res) {
  if (debug) debugPrint('rename', req.session.uname);
  if (!req.session.loggedIn) res.end('NOT LOGGED IN');
  else { 
    await files.renameFile(req, res);
  }
});

/*
request to update the meta-data file, 
after a client detection that files were removed (by an server intruder)
*/
app.post('/bad_rem_from_meta', async function (req, res) {
  if (debug) debugPrint('bad_rem_from_meta', req.session.uname);
  if (!req.session.loggedIn) res.end('NOT LOGGED IN');
  else {
    await files.onlytUpdateMetaFile(req.session.uname, req.body.meta, req.body.mac);
    res.send('OK');
  }
});

// server start
/*
server start, here is the "prompt" of the server
*/
var server = app.listen(port, () => {
  console.log('server is listening on port: '+port+' ...');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  });
  rl.prompt();
  rl.on('line', async function(input) {
    var splitted_line = input.split(' ');
    switch (splitted_line[0]) {
      case 'quit':
        console.log(`Closing Server ...`);
        rl.close();
        server.close();
        database.close();
        return;
        
      case 'users': 
        await database.printUsers();
        break; 
      
      case 'debug':
        if (!debug) debug = 1;
        else debug = 0;
        break;
        
      default:
        break;
    }
    rl.prompt();
  });
});

/*
func to build simple HTML code,
to send simple messeges to the client
*/
function simpleHTML(res, msg) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end(msg);
}

red = function(msg) {return '\x1b[41m'+msg+'\x1b[0m'} // global

function yellow(msg) {return '\x1b[33m'+msg+'\x1b[0m'}

function debugPrint(msg, uname) {
  console.log(yellow('Request received:\t'+msg+' ,\tuser:\t'+uname));
}
