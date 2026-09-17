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
  var map = {}, content = 'text/plain html htm xml json js css txt\n',
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

var m = new Mime();

m.define({
  'application/json': ['json', 'map'],
  'application/javascript': ['js', 'mjs', 'jsx'],
  'application/xml': ['xml', 'rss', 'atom'],
  'application/octet-stream': ['bin', 'exe', 'dll', 'so', 'apk', 'obj', 'mtl'],
  'application/pdf': ['pdf'],
  'application/zip': ['zip'],
  'application/x-www-form-urlencoded': ['form'],
  'audio/mpeg': ['mp3'],
  'audio/wav': ['wav'],
  'font/woff': ['woff'],
  'font/woff2': ['woff2'],
  'image/gif': ['gif'],
  'image/jpeg': ['jpg', 'jpeg', 'jpe'],
  'image/png': ['png'],
  'image/svg+xml': ['svg', 'svgz'],
  'image/webp': ['webp'],
  'image/x-icon': ['ico'],
  'text/css': ['css'],
  'text/csv': ['csv'],
  'text/html': ['html', 'htm', 'shtml'],
  'text/plain': ['txt', 'text', 'log'],
  'text/markdown': ['md'],
  'text/xml': ['xsl'],
  'video/mp4': ['mp4'],
  'video/webm': ['webm'],
});

// charsets lookup (used by the 'send' module)
var charsets = {
  lookup: function(type) {
    if (/json|text|xml|javascript|html|css|form/.test(type)) return 'UTF-8';
    return null;
  }
};
m.charsets = charsets;

module.exports = m;
