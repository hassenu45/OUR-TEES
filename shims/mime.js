var path = require('path');
var fs = require('fs');

function Mime() {
  this.types = Object.create(null);
  this.extensions = Object.create(null);
}
Mime.prototype.define = function(map) {
  for (var type in map) {
    var exts = map[type];
    for (var i = 0; i < exts.length; i++) {
      this.types[exts[i]] = type;
    }
    if (!this.extensions[type]) {
      this.extensions[type] = exts[0];
    }
  }
};
Mime.prototype.load = function(file) {
  this._loading = file;
  var map = {}, content = fs.readFileSync(file, 'ascii'),
      lines = content.split(/[\r\n]+/);
  lines.forEach(function(line) {
    var fields = line.replace(/\s*#.*|^\s*|\s*$/g, '').split(/\s+/);
    map[fields.shift()] = fields;
  });
  this.define(map);
  this._loading = null;
};
Mime.prototype.lookup = function(p, fallback) {
  var ext = p.replace(/^.*[\.\/\\]/, '').toLowerCase();
  return this.types[ext] || fallback;
};
Mime.prototype.extension = function(mimeType) {
  var type = mimeType.match(/^\s*([^;\s]*)(?:;|\s|$)/)[1].toLowerCase();
  return this.extensions[type];
};

module.exports = new Mime();