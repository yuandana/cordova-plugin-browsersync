var path = require('path');

var Patcher = require('./utils/Patcher');
var browserSyncServer = require('./utils/browserSyncServer');

function parseOptions(opts) {
    var result = {};
    opts = opts || [];
    opts.forEach(function(opt) {
        var parts = opt.split(/=/);
        result[parts[0].replace(/^-+/, '')] = parts[1] || true;
    });
    return result;
}

module.exports = function(context) {
    var Q = require('q');
    var deferral = new Q.defer();

    var options = parseOptions(context.opts.options.argv);
    options['index'] = typeof options['index'] !== 'undefined' ? options['index'] : 'index.html';

    if (typeof options['live-reload'] === 'undefined') {
        return;
    }
    var enableCors = typeof options['enable-cors'] !== 'undefined';

    var ignoreOptions = {};
    if (typeof options['ignore'] !== 'undefined') {
        ignoreOptions = {ignored: options['ignore']};
    }

    // TODO - Enable live reload servers

    var platforms = ['android', 'ios', 'browser'];
    var patcher = new Patcher(context.opts.projectRoot, platforms);
    patcher.prepatch();
    var changesBuffer = [];
    var changesTimeout;
    var serversFromCallback=[];
    var bs = browserSyncServer(function(defaults) {
        if (enableCors){
            defaults.middleware = function (req, res, next) {
              res.setHeader('Access-Control-Allow-Origin', '*');
              next();
            }
        }
        defaults.files.push({
            match: ['www/**/*.*'],
            fn: function(event, file) {
                if (event === 'change') {
                    changesBuffer.push(file);
                    if(changesTimeout){
                      clearTimeout(changesTimeout);
                    }
                    changesTimeout = setTimeout(function(){
                        // const cordovaCommon = context.requireCordovaModule('cordova-common');
                        context.cordova.prepare().then(function() {
                            patcher.addCSP({
                                index: options.index,
                                servers: serversFromCallback, //need this for building proper CSP
                            });
                            console.info(changesBuffer);
                            bs.reload(changesBuffer);
                            changesBuffer = [];
                        });
                    },200);
                }
            },
            options: ignoreOptions
        });

        defaults.server = {
            baseDir: context.opts.projectRoot,
            routes: {}
        };

        if (typeof options['host'] !== 'undefined') {
            defaults.host = options['host'];
        }

        if (typeof options['port'] !== 'undefined') {
            defaults.port = options['port'];
        }

        if (typeof options['online'] !== 'undefined') {
            defaults.online = options['online'].toLocaleLowerCase() !== 'false';
        }

        if (typeof options['https'] !== 'undefined') {
            defaults.https = true;
        }

        platforms.forEach(function(platform) {
            var www = patcher.getWWWFolder(platform);
            defaults.server.routes['/' + www.replace('\\','/')] = path.join(context.opts.projectRoot, www);
        });

        return defaults;
    }, function(err, servers) {
        serversFromCallback=servers;
        patcher.patch({
            servers: servers,
            index: options.index
        });
        deferral.resolve();
    });

    return deferral.promise;
};
