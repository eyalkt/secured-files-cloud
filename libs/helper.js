/*
add item to META file.
json is the new item
index is the new item index
*/
function addToMetaFile(json, index) {
  files_meta = JSON.parse(files_meta);
  var new_index = findAvailableIndex();
  files_meta = JSON.stringify(files_meta);
  files_meta = addElementsToJSON(files_meta, {element: '_'+new_index, value: json});
  return new_index;
}

/*
func to find the new available index for a file in the user's metafile.
*/
function findAvailableIndex() { // excepts files_meta to be OBJECT
  var keys = Object.keys(files_meta);
  var len = keys.length;
  for (var k = 0; k < len; k++) {
    if (keys[k] != '_'+k) break;
  }
  return k;
}

/* 
func to delete meta-data from the meta-file.
index - the meta-data index to delete.
*/
function deleteFromMetaFile(index) {
  files_meta = deleteElementFromJSON(files_meta, '_'+index);
}

/*
looks for specific filename in the metafile of this user
*/
function lookforName(name) {
  if (files_meta == null) return {ans: false, index: -1};
  files_meta = JSON.parse(files_meta);
  var keys = Object.keys(files_meta);
  var files_len = keys.length;
  var file, file_name;
  for (var j = 0; j < files_len; j++) {
    var curr_key = keys[j];
    var real_j = parseInt(curr_key[1]);
    file = files_meta[curr_key];
    file_name = dec(JSON.stringify(file.fname));
    if (file_name == name) {
      files_meta = JSON.stringify(files_meta);
      return {ans: true, index: real_j};
    }
  }
  files_meta = JSON.stringify(files_meta);
  return {ans: false, index: -1};
}

/*
func to delete element from json_str
*/
function deleteElementFromJSON(json_str, element) {
  let obj = JSON.parse(json_str);
  delete obj[element];
  return JSON.stringify(obj);
}

/*
func to add element to json_str
*/
function addElementsToJSON(json_str, element_value) {
  var json_obj = JSON.parse(json_str);
  for (i = 1; i < arguments.length; i++) {
    json_obj[arguments[i].element] = arguments[i].value;
  }
  return JSON.stringify(json_obj);
}

/*
func to encrypt text using sjcl library, encrypt_key, and parameters.
*/
function enc(text) {
  var password = sessionStorage.enc_key;
  var parameters = { "iter" : 1000 };
  var rp = {};
  var cipherTextJson = {};
  sjcl.misc.cachedPbkdf2(password, parameters);
  cipherTextJson = sjcl.encrypt(password, text, parameters, rp);
  return cipherTextJson;
}

/*
func to encrypt and mac, 
returns an object with encrypted JSON, and calculated mac.
*/
function encAndMAC(str) {
  var data_JSON = enc(str);
  var dmac = mac(data_JSON);
  return {JSON: data_JSON, mac: dmac};
}

/*
func to decrypt data, using sjcl library
*/
function dec(encrypted_text) {
  var key = sessionStorage.enc_key;
  var decryptedText = sjcl.decrypt(key, encrypted_text);
  return decryptedText;
}

/*
func to calculate mac for a given msg, using sjcl library
*/
function mac(msg) {
  var key = sjcl.codec.utf8String.toBits(sessionStorage.auth_key);
  var out = (new sjcl.misc.hmac(key, sjcl.hash.sha256)).mac(msg);
  var hmac = sjcl.codec.hex.fromBits(out)
  return hmac;
}

/*
parses data sting to a file and prompts the user with a saveAs popup,
uses the FileSaver library.
*/
function strToFileSave(str_json, file_type, file_name) {
  function str2bytes (str) {
    var bytes = new Uint8Array(str.length);
    for (var i=0; i<str.length; i++) {
        bytes[i] = str.charCodeAt(i);
    }
    return bytes;
  }
  var blob = new Blob([str2bytes(str_json)], {type: file_type});
  saveAs(blob, file_name); 
  return;
}

/*
func to display data to the html page - debuging purpose
*/
function display(msg) {
  document.getElementById('display').innerHTML = msg;
}

/*
func for debug, to dispay msg on the html page - debuging purpose
*/
function debug_display(msg) {
  document.getElementById('debug_display').innerHTML += msg + '<br>';
}

/*
bubble sorting the files table according to a given column index.
*/
function sort(column_index) {
  var table, rows, switchcount = 0;
  var switching = true, shouldSwitch;
  var asc_sort_direction = true;
  table = document.getElementById('files_list');
  while (switching) {
    switching = false;
    rows = table.getElementsByTagName('tr');
    var curr_row;
    for (curr_row = 1; curr_row < (rows.length - 1); curr_row++) {
      shouldSwitch = false;
      var curr_row_creteria_value = (rows[curr_row].getElementsByTagName('td')[column_index]).innerHTML.toLowerCase();
      var next_row_creteria_value = (rows[curr_row + 1].getElementsByTagName('td')[column_index]).innerHTML.toLowerCase();
      if (asc_sort_direction) {
        if (column_index == 2) {
          if (curr_row_creteria_value.length > next_row_creteria_value.length || 
            (curr_row_creteria_value.length == next_row_creteria_value.length && curr_row_creteria_value > next_row_creteria_value)) {
              shouldSwitch = true;
              break;
            }
        }
        else if (curr_row_creteria_value > next_row_creteria_value) {
          shouldSwitch = true;
          break;
        }
      } 
      else { // descending order
        if (column_index == 2) {
          if (curr_row_creteria_value.length < next_row_creteria_value.length || 
            (curr_row_creteria_value.length == next_row_creteria_value.length && curr_row_creteria_value < next_row_creteria_value)) {
              shouldSwitch = true;
              break;
            }
        }
        else if (curr_row_creteria_value < next_row_creteria_value) {
          shouldSwitch = true;
          break;
        }
      }
    }
    if (shouldSwitch) {
      rows[curr_row].parentNode.insertBefore(rows[curr_row + 1], rows[curr_row]);
      switching = true;
      switchcount ++;
    } 
    else {
      if (switchcount == 0 && asc_sort_direction) {
        asc_sort_direction = false;
        switching = true;
      }
    }
  }
}
