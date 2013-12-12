/*!
 * node-imager
 * Copyright(c) 2012 Madhusudhan Srinivasa <madhums8@gmail.com>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var gm = require('gm').subClass({ imageMagick: true })
    , fs = require('fs')
    , path = require('path')
    , mime = require('mime')
    , async = require('async')
    , os = require('os')
    , _ = require('underscore')
    , storage = require('./storage');

var debug, config;
var tempDir = path.normalize(os.tmpDir() + path.sep);
var contentType = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif'
};

var variants = [
    "original",
    "crop",
    "resize",
    "resizeAndCrop"
];
/**
 * Initialize Imager with config
 *
 * @param {Object} config
 * @param {Array} storage
 * @return {Imager}
 * @api public
 */

var Imager = module.exports = function Imager(config, storageTypes) {
    if (!config || typeof config !== 'object') {
        throw new Error('Please provide the config');
    }

    if (!config.storage) {
        throw new Error('Please specify a storage');
    }

    if (typeof storageTypes === 'undefined') {
        throw new Error('Please specify the storage');
    }

    if (typeof storageTypes === 'string') {
        storageTypes = [storageTypes];
    }

    this.storage = [];
    storageTypes.forEach(function(storageType){
        if (!config.storage[storageType]) {
            throw new Error('The storage you have specified does not exist');
        } else {
            var store = storage.factory(storageType, config.storage);
            store.debug = config.debug;
            this.storage.push(store);
        }
    }, this);

    debug = config.debug;

    this.config = config;
    this.uploadedFiles = [];
};


Imager.prototype = {

    getCdnUri: function() {
        if (!this.cdnUri) {
            var self = this;
            this.storage.every(function(storage){
                return typeof(self.cdnUri = storage.cdnUri) === 'undefined';
            });
        }
        return this.cdnUri;
    },


    /**
     * Uploads variants to the provided storage
     *
     * @param {Array} files
     * @param {Function} callback
     * @param {String} variant
     * @return {Imager}
     * @api public
     */

    upload: function (files, callback, variant) {
        var self = this;

        if (!variant) {
            variant = callback;
            callback = function () {
            };
        }

        if (typeof variant !== 'string' && !this.config.variants.default) {
            throw new Error('Please specify a proper variant OR provide a default');
        }

        if (!variant && this.config.variants.default) {
            variant = 'default';
        }

        if (typeof variant === 'string' && !this.config.variants[variant]) {
            throw new Error('Please provide a variant which you have specified in the config file');
        }

        if (!files) {
            throw new Error('Please provide the files to upload.');
        } else if (typeof files === 'string') {
            files = [files];
        }

        variant = this.config.variants[variant];

        async.map(files, getFileInfo, function (err, files) {
            if (err) return callback(err);

            var prepare = function (file, fn) {
                var ct = file.type;
                var filename = variant.keepNames ? path.basename(file.name) :
                    Math.round(new Date().getTime()) + contentType[ct];

                self.prepareUpload(file, filename, variant, fn);
            };

            async.forEach(files, prepare, function (err) {
                if (err) return callback(err);
                callback(null, self.getCdnUri(), self.uploadedFiles);
            });
        });

        return this;
    },

    /**
     * Remove all variants from the provided storage
     *
     * @param {String|Array} files
     * @param {Function} callback
     * @param {String} variant
     * @return {Imager}
     * @api public
     */

    remove: function (files, callback, variant) {
        if (!variant) {
            variant = callback;
            callback = function () {
            };
        }

        if (typeof variant !== 'string' && !this.config.variants.default) {
            throw new Error('Please specify a proper variant to remove the files');
        }

        if (!variant && this.config.variants.default) {
            variant = 'default';
        }

        if (typeof variant === 'string' && !this.config.variants[variant]) {
            throw new Error('Please provide a variant which you have specified in the config file');
        }

        var self = this;

        if (!Array.isArray(files) && typeof files === 'string') {
            files = files.split();
        }

        var prepareRemove = function (file, fn) {
            self.prepareRemove(file, fn, self.config.variants[variant]);
        };

        async.forEach(files, prepareRemove, function (err) {
            if (err) return callback(err);
            callback(null);
        });

        return this;
    },

    /**
     * Prepare upload
     *
     * @param {Object} file
     * @param {String} filename
     * @param {String} variant
     * @param {Function} fn
     * @return {Imager}
     * @api public
     */

    prepareUpload: function (file, filename, variant, fn) {
        if (!file.size) return fn();

        var asyncArr = [];
        var self = this;

        variants.forEach(function (type){
            var fn = type + 'File';
            if (variant[type] && typeof self[fn] === 'function') {
                Object.keys(variant[type]).forEach(function(name) {
                    var processFiles = function (cb) {
                        var preset = {
                            name: name,
                            size: variant[type][name],
                            sep: variant.separator || '_'
                        };
                        self[fn](file, preset, filename, cb);
                    };
                    asyncArr.push(processFiles);
                });
            }
        });

        async.parallel(asyncArr, function (err, results) {
            var f = _.uniq(results).toString();

            f = f.indexOf(',') === -1
                ? f
                : f.slice(0, f.length - 1);

            self.uploadedFiles.push(f);
            fn(err);
        });
    },

    /**
     * Original file
     *
     * @param {Object} file
     * @param {Object} preset
     * @param {String} filename
     * @param {Function} cb
     * @return {Imager}
     * @api public
     */
    originalFile: function (file, preset, filename, cb) {
        var self = this;
        var ct = file.type;
        var remoteFile = preset.name + preset.sep + filename;
        var tempFile = file['path'];

        async.each(self.storage, function (storage, callback) {
            storage.upload(tempFile, remoteFile, filename, ct, callback);
        }, function (err) {
            removeOnFinish(err, tempFile, filename, cb);
        });
    },

    /**
     * Resize file
     *
     * @param {Object} file
     * @param {Object} preset
     * @param {String} filename
     * @param {Function} cb
     * @return {Imager}
     * @api public
     */

    resizeFile: function (file, preset, filename, cb) {
        var self = this;
        var ct = file.type;
        var remoteFile = preset.name + preset.sep + filename;
        var tempFile = path.join(tempDir, 'imager_' +
            Math.round(new Date().getTime()) + '_' +
            Math.floor(Math.random() * 1000) + contentType[ct]);

        gm(file['path'])
            .autoOrient()
            .resize(preset.size.split('x')[0], preset.size.split('x')[1])
            .write(tempFile, function (err) {
                if (err) return cb(err);
                async.each(self.storage, function (storage, callback) {
                    storage.upload(tempFile, remoteFile, filename, ct, callback);
                }, function (err) {
                    removeOnFinish(err, tempFile, filename, cb);
                });
            });
    },

    /**
     * Crop file
     *
     * @param {Object} file
     * @param {Object} preset
     * @param {String} filename
     * @param {Function} cb
     * @return {Imager}
     * @api public
     */

    cropFile: function (file, preset, filename, cb) {
        var self = this;
        var ct = file.type;
        var remoteFile = preset.name + preset.sep + filename;
        var tempFile = path.join(tempDir, 'imager_' +
            Math.round(new Date().getTime()) + '_' +
            Math.floor(Math.random() * 1000) + contentType[ct]);

        gm(file['path'])
            .autoOrient()
            .crop(preset.size.split('x')[0], preset.size.split('x')[1])
            .write(tempFile, function (err) {
                if (err) return cb(err);
                async.each(self.storage, function (storage, callback) {
                    storage.upload(tempFile, remoteFile, filename, ct, callback);
                }, function (err) {
                    removeOnFinish(err, tempFile, filename, cb);
                });
            });
    },

    /**
     * Resize and crop file
     *
     * @param {Object} file
     * @param {Object} preset
     * @param {String} filename
     * @param {Function} cb
     * @return {Imager}
     * @api public
     */

    resizeAndCropFile: function (file, preset, filename, cb) {
        var self = this;
        var ct = file.type;
        var remoteFile = preset.name + preset.sep + filename;
        var tempFile = path.join(tempDir, 'imager_' +
            Math.round(new Date().getTime()) + '_' +
            Math.floor(Math.random() * 1000) + contentType[ct]);

        gm(file['path'])
            .autoOrient()
            .resize(preset.size.resize.split('x')[0], preset.size.resize.split('x')[1])
            .gravity('Center')
            .crop(preset.size.crop.split('x')[0], preset.size.crop.split('x')[1])
            .write(tempFile, function (err) {
                if (err) return cb(err);
                async.each(self.storage, function (storage, callback) {
                    storage.upload(tempFile, remoteFile, filename, ct, callback);
                }, function (err) {
                    removeOnFinish(err, tempFile, filename, cb);
                });
            });
    },

    /**
     * Prepare removing of all the variants
     *
     * @param {Object} file
     * @param {Function} fn
     * @param {String} variant
     * @return {Imager}
     * @api public
     */

    prepareRemove: function (file, fn, variant) {
        var asyncArr = [];
        var self = this;

        variants.forEach(function(variantName) {
            if (variant[variantName]) {
                Object.keys(variant[variantName]).forEach(function (name) {
                    var removeFiles = function (cb) {
                        var preset = {
                            name: name,
                            size: variant[variantName][name],
                            sep: variant.separator || '_'
                        };
                        async.each(self.storage, function (storage, cb) {
                            storage.remove(file, preset, cb);
                        }, cb);
                    };
                    asyncArr.push(removeFiles);
                });
            }
        });

        async.parallel(asyncArr, function (err, results) {
            fn(err);
        });
    }

};

/**
 * Get file info
 *
 * @param {String} file
 * @param {Function} cb
 * @api private
 */

function getFileInfo(file, cb) {
    var f;
    if (typeof(file) === 'string') {
        f = {
            size: fs.statSync(file).size,
            type: mime.lookup(file),
            name: file.split('/')[file.split('/').length - 1],
            path: file
        };
    } else {
        f = {
            size: file.size,
            type: file.type,
            name: file.name,
            path: file.path
        };
        if (!f.type) {
            if (typeof(file.headers) !== 'undefined') {
                f.type = file.headers['content-type'];
            }
            if (!f.type) {
                f.type = mime.lookup(file.path)
            }
        }
    }
    file = f;
    cb(null, file);
}

function removeOnFinish(err, tempFile, filename, cb) {
    fs.unlink(tempFile, function (err) {
        if (err) console.error(err);
    });
    if (err) cb(err);
    else cb(null, filename);
}
