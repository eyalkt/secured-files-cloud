      ///////////////////////
      /// database module ///
      ///////////////////////
/*
requires
*/
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
 OK = 0;
 NO_SUCH_USER = 1;
 WRONG_PASS = 2; 

var db_mem_loc = ':memory:';
var hashAlg = 'sha256';
var db;

/*  SQL quires - users table */
var create_users_table_sql = `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY ON CONFLICT ROLLBACK NOT NULL, salt TEXT NOT NULL, pass TEXT NOT NULL)`;
function add_usr_insert_sql(id, salt, hsp) {return `INSERT INTO users(id, salt, pass) VALUES('`+id+`', '`+salt+`', '`+hsp+`')`;} 

/* SQL queries - users meta-mac table */
var create_users_MACs_sql = `CREATE TABLE IF NOT EXISTS macs (id TEXT PRIMARY KEY ON CONFLICT REPLACE NOT NULL, mac TEXT NOT NULL)`;
function add_usr_MAC_sql(id, mac) {return `INSERT INTO macs(id, mac) VALUES('`+id+`', '`+mac+`')`;} 
function get_mac_sql(id) {return `SELECT mac FROM macs WHERE id = '`+id+`' `;}



/*
init the d.b
*/
exports.initialize = () => {
  db = new sqlite3.Database(db_mem_loc, (err) => {
    if (err) {
      console.error(red(err.message));
    }
  });
  // promise
  db.runAsync = (sql) => {
    var that = this;
    return new Promise(function (resolve, reject) {
        db.run(sql, (err) => {
            if (err) reject(err.message);
            else resolve();
        });
    });
  };
  db.getAsync = (sql) => {
    var that = this;
    return new Promise(function (resolve, reject) {
        db.get(sql, (err, row) => {
            if (err) reject(err.message); 
            else resolve(row);
        });
    });
  };
  db.allAsync = (sql) => {
    var that = this;
    return new Promise(function (resolve, reject) {
        db.all(sql, (err, rows) => {
            if (err) reject(err.message); 
            else resolve(rows);
        });
    });
  };
  // create tables
  db.run(create_users_table_sql);
  db.run(create_users_MACs_sql);
  return db;
}; 

/*
close the d.b
*/
exports.close = () => {
  db.close();
};

  
       ///////////////////
      /// users table ///
     ///////////////////

/*
adds a new user to the d.b.
calculates salt, and hash of salted pass, adds to the users table.
adds a temporary metafile mac - 0 - to the metafiles mac table.
this mac will be replaced implicitly and automatically before the client is -
logged in for the first time.
*/
exports.addUser = async function (id, pass) {
  if (debug) debugPrint('addUser', id);
  var salt = createSalt();
  var hSaltPass = await calcSaltedHash(salt, pass);
  var insert_sql = add_usr_insert_sql(id, salt, hSaltPass);
  var addMAC_sql = add_usr_MAC_sql(id, 0);
  
  try {
    await db.runAsync(insert_sql);
  } catch (e) {
    console.log(red(e));
    return false;
  }
  
  try {
    await db.runAsync(addMAC_sql);
  } catch (e) {
    console.log(red(e));
    return false;
  }
  
  return true;  // returns true iff user added successfully
};

/*
func to print users data in DB to the console.
called by the server manager by running the command 'users' .
if debug is on - prints id, salt, salted-hashed-pass
else prints users id.
*/
exports.printUsers = async function() {
  var select_sql = `SELECT id FROM users ORDER BY id ASC`;
  var debug_sel_sql = `SELECT id, salt, pass FROM users ORDER BY id ASC`;   
  if (debug) select_sql = debug_sel_sql;
  var ans;
  
  try {
    ans = await db.allAsync(select_sql)
  } catch(e) {console.log(red('printUsers ERROR:\t'+e));}
  
  if (debug) console.log(blue('id\tsalt\tsalted-hashed-pass'));
  else console.log(blue('users id'));
  ans.forEach((row) => {
    if (debug) console.log(blue(row.id+'\t'+row.salt+'\t'+row.pass));
    else console.log(blue(row.id));
  });
};

/*
func to createSalt,
using crypto library.
*/
function createSalt() {
  return crypto.randomBytes(16)
            .toString('hex'); /** convert to hexadecimal format */
}

/*
func to calc salted hashed pass.
*/
async function calcSaltedHash(salt, pass) {
  let iterations = 100000;
  let key_length = 64;
  var ans;
  try {
    ans = await hashAsync(pass, salt, iterations, key_length);
  } catch (e) {
    console.log(red(e));
    return 0;
  }

  return ans;
}

/*
func to hash a given pass with a given salt,
using crypto library, by a promise (async).
*/
function hashAsync(pass, salt, iter, len) {
  return new Promise(function(resolve, reject) {
    crypto.pbkdf2(pass, salt, iter, len, hashAlg, (err, derivedKey) => {
      if (err) reject(err.message);
      else resolve(derivedKey.toString('hex'));
    });
  });
}

/*
func to check if a given id and pass, match a users table entry.
retrives the user salt, calculate hash(given pass with user salt),
compares the hashed value with the value in users table.
return => if id not found => NO_SUCH_USER,
          if the entry doesn't match the received id-pass => WRONG_PASS
          if match => OK.
*/
exports.checkCredentials = async function (id, pass) {
  if (debug) debugPrint('checkCredentials', id);
  var salt, ans, received_pass_hash;
  var get_salt_sql = `SELECT salt, pass FROM users WHERE users.id = '`+id+`'`;
  
  try {
    ans = await db.getAsync(get_salt_sql);
  } catch (e) { 
    console.log(red(e));
  }
  
  if (typeof ans == 'undefined') return NO_SUCH_USER;
  else salt = ans.salt;
  
  received_pass_hash = await calcSaltedHash(salt, pass);
  if (ans.pass == received_pass_hash) return OK;
  else return WRONG_PASS;
};

  
       ///////////////////////
      /// user files table ///
     ////////////////////////

/*
func addMac, gets id and mac,
and adds/updates id and mac to the relevant table
*/
exports.addMAC = async function (id, mac) {
  if (debug) debugPrint('addMAC', id);
  var insert_sql = add_usr_MAC_sql(id, mac);
  try {
    await db.runAsync(insert_sql);
  } catch (e) {console.log(red(e));}
};

/*
returns metafile mac of uname.
*/
exports.getMac = async function (uname) {
  if (debug) debugPrint('getMac', uname);
  var mac_sql = get_mac_sql(uname);
  var ans;
  try {
    ans = await db.getAsync(mac_sql);
  } catch (e) {console.log(red(e));}
  return ans.mac;
};

function blue(msg) {return '\x1b[36m'+msg+'\x1b[0m'}

function debugPrint(msg, uname) {
  console.log(blue('Database Operation:\t'+msg+' ,\tuser:\t'+uname));
}
