// Pure JavaScript shim for iconv-lite
// Compatible with Cloudflare Workers
// Assigns to globalThis so it can be required by other modules

(function () {
    "use strict";

    // Use global Buffer if available, otherwise create a minimal one
    var Buffer;
    try {
        if (typeof globalThis !== 'undefined' && globalThis.Buffer) {
            Buffer = globalThis.Buffer;
        }
    } catch (e) {}

    // Minimal Buffer implementation for Workers
    if (!Buffer) {
        Buffer = function Buffer(data) {
            this.data = new Uint8Array(data || []).subarray(0);
            this.length = this.data.length;
        };
        Buffer.prototype = {
            write: function write(string, offset, length, encoding, callback) {
                if (typeof string === 'string') {
                    var start = offset || 0;
                    var end = (offset + length) || string.length;
                    for (var i = start; i < Math.min(end, string.length); i++) {
                        this.data[i] = string.charCodeAt(i) & 0xFF;
                    }
                    this.length = Math.max(this.length, end);
                    if (callback) callback(null, end - start);
                }
                return this.length - (offset || 0);
            },
            toString: function toString(encoding, start, end) {
                encoding = encoding || 'utf8';
                start = start || 0;
                end = end || this.length;
                var str = '';
                for (var i = start; i < end; i++) {
                    str += String.fromCharCode(this.data[i]);
                }
                return str;
            }
        };
        Buffer.poolSize = 8192;
    }

    // iconv object with essential encoding methods
    var iconv = {
        encodings: null,
        defaultCharUnicode: '�',
        defaultCharSingleByte: '?',

        // Encode a string to a buffer
        encode: function encode(str, encoding) {
            if (typeof str !== 'string') {
                str = '' + str;
            }
            if (encoding === undefined || encoding === 'utf8' || encoding === 'UTF-8') {
                var result = [];
                for (var i = 0; i < str.length; i++) {
                    var codePoint = str.codePointAt(i);
                    if (codePoint < 0x80) {
                        result.push(codePoint);
                    } else if (codePoint < 0x800) {
                        result.push(0xC0 | (codePoint >>> 6));
                        result.push(0x80 | (codePoint & 0x3F));
                    } else if (codePoint < 0x10000) {
                        result.push(0xE0 | (codePoint >>> 12));
                        result.push(0x80 | ((codePoint >>> 6) & 0x3F));
                        result.push(0x80 | (codePoint & 0x3F));
                    } else {
                        // Supplemental characters (4-byte UTF-8)
                        result.push(0xF0 | (codePoint >>> 18));
                        result.push(0x80 | ((codePoint >>> 12) & 0x3F));
                        result.push(0x80 | ((codePoint >>> 6) & 0x3F));
                        result.push(0x80 | (codePoint & 0x3F));
                    }
                }
                // Create a Buffer-like object
                var buf = new Buffer(result.length);
                for (var j = 0; j < result.length; j++) {
                    buf[j] = result[j];
                }
                return buf;
            }
            // For other encodings, return a minimal buffer
            return new Buffer(str ? str.length : 0);
        },

        // Decode a buffer to a string
        decode: function decode(buf, encoding) {
            if (buf === null || buf === undefined) {
                return '';
            }
            // If buf is already a string, return as-is
            if (typeof buf === 'string') {
                return buf;
            }
            // If buf has a data property (our Buffer-like)
            if (buf.data !== undefined) {
                buf = buf.data;
            }
            // Ensure buf is array-like with length
            var arr = typeof buf === 'object' && buf.length !== undefined ? buf : new Uint8Array(1).subarray(0);

            if (encoding === undefined || encoding === 'utf8' || encoding === 'UTF-8') {
                var utf8str = '';
                for (var i = 0; i < arr.length; i++) {
                    var byte = arr[i];
                    if (byte < 0x80) {
                        utf8str += String.fromCharCode(byte);
                    } else if (byte >= 0xC0 && byte < 0xE0) {
                        // 2-byte UTF-8 sequence
                        if (i + 1 < arr.length) {
                            var charCode = ((byte & 0x1F) << 6) | (arr[i + 1] & 0x3F);
                            utf8str += String.fromCharCode(charCode);
                            i++;
                        } else {
                            utf8str += '�';
                        }
                    } else if (byte >= 0xE0 && byte < 0xF0) {
                        // 3-byte UTF-8 sequence
                        if (i + 2 < arr.length) {
                            var charCode = ((byte & 0x0F) << 12) | ((arr[i + 1] & 0x3F) << 6) | (arr[i + 2] & 0x3F);
                            utf8str += String.fromCharCode(charCode);
                            i += 2;
                        } else {
                            utf8str += '�';
                        }
                    } else if (byte >= 0xF0 && byte < 0xF8) {
                        // 4-byte UTF-8 sequence
                        if (i + 3 < arr.length) {
                            var charCode = ((byte & 0x0F) << 18) | ((arr[i + 1] & 0x3F) << 12) | ((arr[i + 2] & 0x3F) << 6) | (arr[i + 3] & 0x3F);
                            utf8str += String.fromCharCode(charCode);
                            i += 3;
                        } else {
                            utf8str += '�';
                        }
                    } else {
                        utf8str += '�';
                    }
                }
                return utf8str;
            }
            // For other encodings, return a simple string
            return '' + buf;
        },

        // Check if an encoding exists (always returns true)
        encodingExists: function encodingExists(enc) {
            return true;
        },

        // Get an encoder function
        getEncoder: function getEncoder(encoding) {
            return function encodeStr(str) {
                return iconv.encode(str, encoding);
            };
        },

        // Get a decoder function
        getDecoder: function getDecoder(encoding) {
            return function decodeBuf(buf) {
                return iconv.decode(buf, encoding);
            };
        }
    };

    // Assign iconv to globalThis for require() compatibility
    globalThis.iconv = iconv;

    // Also try exports for compatibility
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = iconv;
    }
})();