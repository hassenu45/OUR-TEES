function mkdirP(p, opts, f, made) {
    if (typeof opts === 'function') {
        f = opts;
        opts = {};
    }
    else if (!opts || typeof opts !== 'object') {
        opts = { mode: opts };
    }
    
    var mode = opts.mode;
    var xfs = opts.fs || require('fs');
    
    if (mode === undefined) {
        mode = parseInt('0777', 8);
    }
    if (!made) made = null;
    
    var cb = f || function () {};
    p = require('path').resolve(p);
    
    xfs.mkdir(p, mode, function (er) {
        if (!er) {
            made = made || p;
            return cb(null, made);
        }
        switch (er.code) {
            case 'ENOENT':
                if (require('path').dirname(p) === p) return cb(er);
                mkdirP(require('path').dirname(p), opts, function (er, made) {
                    if (er) cb(er, made);
                    else mkdirP(p, opts, cb, made);
                });
                break;
            default:
                xfs.stat(p, function (er2, stat) {
                    if (er2 || !stat.isDirectory()) cb(er, made);
                    else cb(null, made);
                });
                break;
        }
    });
}

mkdirP.sync = function sync(p, opts, made) {
    if (!opts || typeof opts !== 'object') {
        opts = { mode: opts };
    }
    
    var mode = opts.mode;
    var xfs = opts.fs || require('fs');
    
    if (mode === undefined) {
        mode = parseInt('0777', 8);
    }
    if (!made) made = null;
    
    p = require('path').resolve(p);
    
    try {
        xfs.mkdirSync(p, mode);
        made = made || p;
    }
    catch (err0) {
        switch (err0.code) {
            case 'ENOENT' : made = sync(require('path').dirname(p), opts, made);
                sync(p, opts, made);
                break;
            default:
                var stat;
                try { stat = xfs.statSync(p); }
                catch (err1) { throw err0; }
                if (!stat.isDirectory()) throw err0;
                break;
        }
    }
    return made;
};

module.exports = mkdirP;