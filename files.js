       /////////////////////////////////
      /// user files handling module ///
     //////////////////////////////////

/*
requires the relevant modules
*/
const formidable = require('formidable'); // handles file uploads and json msgs
const database = require('./database');
const path = require('path');
const fs = require('fs');
var curr_num_of_files = 0;


/*
func upload, to upload files, by request from the clientץ
write the relevant file to the path of the user directory,
and update the meta-data file of this user.
*/
exports.upload = async function (req, res) {
  if (debug) debugPrint('upload', req.session.uname);
  var json = {};
  var form = new formidable.IncomingForm();
  form.multiples = true;  // maybe more than one file
  form.uploadDir = path.join(__dirname, '/uploads/'+req.session.uname);
  fs.stat(form.uploadDir, function (err,stats) {    
    if (err) console.log(red(err.message));
  });

  form.on('field', function(field, value) {
    json[field] = value;
  });

  form.on('error', function(err) {
    if (err) console.log(red('An error has occured: \n' + err));
  });

  form.on('end', async function(err) {
    if (err) console.log(red('An error has occured: \n' + err));
    var keys = Object.keys(json);
    var json_len = keys.length;
    for (var i = 0; i < json_len; i++) {
      var index1 = await find_available_index(req.session.uname);
      var index2 = json[keys[i]].newf;
      if (index1 != index2) {
        console.log(red('files->upload: ERROR\n\tindex1 != index2\t'+index1+' != '+index2));
        return;
      }
      var index = index1;
      try {
        await asyncWriteFile(form.uploadDir+'/'+index, JSON.stringify(json[keys[i]].data));
      } catch(e) {console.log(red(e.message));}
      if (i == json_len-1)
        await updateMetaFile(req.session.uname, JSON.stringify(json[keys[i]].metaf), json[keys[i]].metaf_mac);
    }
    res.send('OK');
  });

  form.parse(req, function (err) {
    if (err) console.log(red(err.message));
  });
}; 

/*
finds an available index for a new file upload
*/
async function find_available_index(uname) {
  if (debug) debugPrint('find_available_index', uname);
  var curr_path = path.join(__dirname, '/uploads/'+uname);
  var num_of_files;
  var ans = -1;
  var items;
  try {
    items = await asyncReaddir(curr_path);
  } catch (err) {
      console.log(red('files: find index ERROR\n'+err.message));
      return ans;
  }
  num_of_files = items.length;
  for (var i = 0; i<items.length; i++) {
    for (var j = 0; j<items.length; j++) {
      if (i.toString() == items[j]) break;
      else if (j == items.length-1) ans = i;
    }
    if (ans>=0) return ans;
  }
  if (ans<0) return num_of_files;
  else {
    console.log(red('files: find index ERROR'));
    return ans;
  }
}

/*
func asynchReaddir, got path,
and create new promise, then read the directory of this path,
and resolve the data.
*/
function asyncReaddir(path) {
  return new Promise(function(resolve, reject) {
    fs.readdir(path, {encoding:'utf8'}, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

/*
func asyncReadFile, fot path-to-file,
and create new promise, read the file, parse the data to JSON object,
and resolve the JSON object.
*/
function asyncReadFile(path_to_file) {
  return new Promise(function(resolve, reject) {
    fs.readFile(path_to_file, {encoding:'utf8'}, (err, data) => {
      if (err) reject(err);
      else resolve(JSON.parse(data));
    });
  });
}

/*
func asynchWriteFile got data, and path-to-file,
and write the data to the file, with new promise.
*/
function asyncWriteFile(path_to_file, data) {
  return new Promise(function(resolve, reject) {
    fs.writeFile(path_to_file, data, (err, data) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/*
func asynchFileStat got path-to-file,
and got stat of this file, with promise
*/
function asyncFileStat(path_to_file) {
  return new Promise(function(resolve, reject) {
    fs.stat(path_to_file, (err, stats) => {
      if (err) reject(err);
      else resolve(stats);
    });
  });
}

/*
func asynchDeleteFile, got path-to-file,
and delete this file with promise
*/
function asyncDeleteFile(path_to_file) {
  return new Promise(function(resolve, reject) {
    fs.unlink(path_to_file, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/*
sends to the user his meta-data file, 
along with received metafile mac (from last metafile update - by the cilent),
and the user file indexes that are in use (these are used in the client-side,
to detemine which files were removed - in case an intruder removed file(s))
*/
exports.getFiles = function (req, res) {
  if (debug) debugPrint('getFiles', req.session.uname);
  var uname = req.session.uname;
  var curr_path = path.join(__dirname, '/uploads/'+uname);
  var meta, meta_mac, meta_keys, ans;
  fs.stat(curr_path, (err,stats) => { 
    if (err && err.code=='ENOENT') {console.log(red('ERROR: files - getFiles\t'+err.message));}
    else {
      fs.readdir(curr_path, async function(err, items) {
        if (err) {
          console.log(red('ERROR: files - getFiles\t'+err.message));
          return;
        }
        curr_num_of_files = items.length - 1; // minus meta
        meta = await asyncReadFile(curr_path+'/m');
   
        items.pop();
        for (var i = 0; i < items.length; i++) {
          var file_stats;
          try {
            file_stats = await asyncFileStat(curr_path+'/'+items[i]);
          } catch(e) {console.log(red(e.message));}
          items[i] = {name: items[i], size: (file_stats.size).toString()};
        }
        meta_keys = Object.keys(meta);
        meta_mac = await database.getMac(uname);
        ans = {metaf: meta, mac: meta_mac, files_on_server: items};
        if (meta_keys.length == 2 && meta.toString() == "{}") {
          res.send(ans);
          return;
        }
        res.send(ans);
      });
    }
  });
};


/*
deletes the relevant files from the server. 
used in (bad) cases were more than one file needs to be deleted.
regular delete requests are handled by the deleteFile function below.
*/
exports.deleteFiles = async function (req, res, files) {
  if (debug) debugPrint('deleteFiles', req.session.uname);
  var file_path = path.join(__dirname, '/uploads/'+req.session.uname);
  var items;
  try {
    items = await asyncReaddir(file_path);
  } catch (e) {console.log(red(e.message));}
  for (const file of items) {
    if (!files || (files && isInList(file, files))) {
      try {
        await asyncDeleteFile(path.join(file_path, file));
      } catch (e) {console.log(red(e.message));}
    }
  }
};

/*
given an item and items-list,
checks if item is in items-list, if is inside => return true,
otherwise, if the item is not in itmes-list => return false.
*/
function isInList(item, items_list) {
  for (var i = 0; i < items_list.length; i++) if (items_list[i] == item) return true;
  return false;
}

/*
deletes the file from the server, and, update the meta-data file
of this user.
*/
exports.deleteFile = async function (req, res, file_meta) {
  if (debug) debugPrint('deleteFile', req.session.uname);
  var file_path = path.join(__dirname, '/uploads/'+req.session.uname+'/');
  var form = new formidable.IncomingForm();
  var json = {};
  form.on('field', function(field, value) {
    json[field] = value;
  });
  form.on('error', function(err) {
    if (err) console.log(red('An error has occured: \n' + err));
  });
  form.on('end', async function(err) {
    if (err) console.log(red('An error has occured: \n' + err));
    else {
      await updateMetaFile(req.session.uname, JSON.stringify(json.metaf), json.metaf_mac);
      try {
        await asyncDeleteFile(file_path+json.index);
      } catch (e) {console.log(red(e.message));}
      res.send('OK');
    }
  });
  form.parse(req, function (err) {
    if (err) console.log(red(err.message));
  });
};

/*
creates user files upload directory , 
and creats the user metafile.
*/
exports.createUserDir = async function (res, uname) {
  if (debug) debugPrint('createUserDir', uname);
  var user_dir = path.join(__dirname, '/uploads/'+uname);
  fs.mkdir(user_dir, async function (err) {
    if (err) if (err.code!='EEXIST') console.log(red(err.message));
    await updateMetaFile(uname, '{}', '0');
  });
  res.send('{}');
};

/*
an export of the updateMetaFile function
*/
exports.onlytUpdateMetaFile = async function (uname, newdata, newmac) {
  if (debug) debugPrint('onlytUpdateMetaFile', uname);
  await updateMetaFile(uname, newdata.replace(/ /g, '+'), newmac);
};

/*
updates the meta-data file of this user, creats one if not present.
updates/creates mac file ("m") and adds the metafile mac (received
from the client) to the database.
*/
async function updateMetaFile(uname, newdata, newmac) {
  if (debug) debugPrint('updateMetaFile', uname);
  var user_dir = path.join(__dirname, '/uploads/'+uname);
  try {
    await asyncWriteFile(user_dir+'/m', newdata);
  } catch(e) {console.log(red(e.message));}
  return await database.addMAC(uname, newmac);
};

/*
renames file of user, by updating the meta-data file
of this user (received from the client)
*/
exports.renameFile = async function (req, res) {
  if (debug) debugPrint('renameFile', req.session.uname);
  var form = new formidable.IncomingForm();
  var json = {};
  form.on('field', function(field, value) {
    json[field] = value;
  });
  form.on('error', function(err) {
    if (err) console.log(red('An error has occured: \n' + err));
  });
  form.on('end', async function(err) {
    if (err) console.log(red('An error has occured: \n' + err));
    else {
      await updateMetaFile(req.session.uname, JSON.stringify(json.metaf), json.metaf_mac);
      res.send('OK');
    }
  });
  form.parse(req, function (err) {
    if (err) console.log(red(err.message));
  });

};

/*
handles download requests from the client.
*/
exports.download = async function (req, res) {
  if (debug) debugPrint('download', req.session.uname);
  var file_path = path.join(__dirname, '/uploads/'+req.session.uname+'/'+req.body.file);
  res.download(file_path);
};

/*
only updates the metafile's mac - used once - on registarion.
*/
exports.newClientUpdateMetaMac = async function (req, res) {
  if (debug) debugPrint('newClientUpdateMetaMac', req.session.uname);
  await database.addMAC(req.session.uname, req.body.mac);
  res.send('OK');
};

function green(msg) {return '\x1b[32m'+msg+'\x1b[0m'}

function debugPrint(msg, uname) {
  console.log(green('File Operation:\t'+msg+' ,\tuser:\t'+uname));
}
