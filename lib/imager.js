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
  , cloudfiles = require('cloudfiles')
  , knox = require('knox')
  , async = require('async')
  , os = require('os')
  , _ = require('underscore');

var debug, config, storage, uploadedFiles = [];
var tempDir = path.normalize(os.tmpDir() + path.sep);
var contentType = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif'
};

/**
 * Initialize Imager with config
 *
 * @param {Object} config
 * @param {String} storage
 * @return {Imager}
 * @api public
 */

var Imager = module.exports = function Imager (config, storage) {
  if (typeof config !== 'object') {
    throw new Error('Please provide the config');
  } else if (!config) {
    throw new Error('Please provide the config');
  }

  if (typeof storage === 'undefined') {
    throw new Error('Please specify the storage');
  }

  if (config.storage && config.storage[storage] === undefined) {
    throw new Error('The storage you have specified does not exist');
  } else if (!config.storage) {
    throw new Error('Please specify a storage');
  }

  debug = config.debug;

  this.config = config;
  this.storage = storage;
  this.uploadedFiles = [];
};


Imager.prototype = {

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

    // to check if the files are local
    if (Array.isArray(files) && typeof files[0] === 'string') {
      async.map(files, getFileInfo, function (err, result) {
        files = result;
      });
    } else if (!Array.isArray(files) && typeof files === 'string') {
      files = files.split();
      async.map(files, getFileInfo, function (err, result) {
        files = result;
      });
    }

    if (!variant) {
      variant = callback
      callback = function () {}
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

    var prepare = function (file, fn) {
      var filename = Math.round(new Date().getTime());
      self.prepareUpload(file, filename, variant, fn);
    };

    async.forEach(files, prepare, function (err) {
      if (err) return callback(err);
      callback(null, self.cdnUri, self.uploadedFiles);
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
      variant = callback
      callback = function () {}
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
      self.prepareRemove(file, fn, variant);
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

    var variants = this.config.variants[variant];
    var asyncArr = [];
    var self = this;

    if (variants.resize) {
      Object.keys(variants.resize).forEach(function (name) {
        var processFiles = function (cb) {
          var preset = {
            name: name,
            size: variants.resize[name]
          };
          self.resizeFile(file, preset, filename, cb);
        };
        asyncArr.push(processFiles);
      });
    }

    if (variants.crop) {
      Object.keys(variants.crop).forEach(function (name) {
        var processFiles = function (cb) {
          var preset = {
            name: name,
            size: variants.crop[name]
          };
          self.cropFile(file, preset, filename, cb);
        };
        asyncArr.push(processFiles);
      });
    }

    if (variants.resizeAndCrop) {
      Object.keys(variants.resizeAndCrop).forEach(function (name) {
        var processFiles = function (cb) {
          var preset = {
            name: name,
            type: variants.resizeAndCrop[name]
          };
          self.resizeAndCropFile(file, preset, filename, cb);
        };
        asyncArr.push(processFiles);
      });
    }

    async.parallel(asyncArr, function (err, results) {
      if (err) console.error(err);
      var f = _.uniq(results).toString();

      f = f.indexOf(',') === -1
        ? f
        : f.slice(0, f.length - 1);

      self.uploadedFiles.push(f);
      log(self.uploadedFiles);
      fn(err);
    });
  },

  /**
   * Resize file
   *
   * @param {Object} file
   * @param {Object} preset
   * @param {String} fname
   * @param {Function} cb
   * @return {Imager}
   * @api public
   */

  resizeFile: function (file, preset, fname, cb) {
    var filename = fname + contentType[file['type']];
    var self = this;
    var remoteFile = preset.name + '_' + filename;
    var dest = tempDir + remoteFile;

    gm(file['path'])
      .autoOrient()
      .resize(preset.size.split('x')[0], preset.size.split('x')[1])
      .write(dest, function (err) {
        if (err) return cb(err);
        self['pushTo' + self.storage](dest, remoteFile, filename, file['type'], cb);
      });
  },

  /**
   * Crop file
   *
   * @param {Object} file
   * @param {Object} preset
   * @param {String} fname
   * @param {Function} cb
   * @return {Imager}
   * @api public
   */

  cropFile: function (file, preset, fname, cb) {
    var filename = fname + contentType[file['type']];
    var self = this;
    var remoteFile = preset.name + '_' + filename;
    var dest = tempDir + remoteFile;

    gm(file['path'])
      .autoOrient()
      .crop(preset.size.split('x')[0], preset.size.split('x')[1])
      .write(dest, function (err) {
        if (err) return cb(err);
        self['pushTo' + self.storage](dest, remoteFile, filename, file['type'], cb);
      });
  },

  /**
   * Resize and crop file
   *
   * @param {Object} file
   * @param {Object} preset
   * @param {String} fname
   * @param {Function} cb
   * @return {Imager}
   * @api public
   */

  resizeAndCropFile: function (file, preset, fname, cb) {
    var filename = fname + contentType[file['type']];
    var self = this;
    var remoteFile = preset.name + '_' + filename;
    var dest = tempDir + remoteFile;

    gm(file['path'])
      .autoOrient()
      .resize(preset.type.resize.split('x')[0], preset.type.resize.split('x')[1])
      .gravity('Center')
      .crop(preset.type.crop.split('x')[0], preset.type.crop.split('x')[1])
      .write(dest, function (err) {
        if (err) return cb(err);
        self['pushTo' + self.storage](dest, remoteFile, filename, file['type'], cb);
      });
  },

  /**
   * Upload all the variants to Rackspace
   *
   * @param {Object} file
   * @param {String} remoteFile
   * @param {String} filename
   * @param {String} type
   * @param {Function} cb
   * @return {Imager}
   * @api public
   */

  pushToRackspace: function (file, remoteFile, filename, type, cb) {
    var self = this;
    var client = cloudfiles.createClient(this.config['storage'][this.storage]);
    var rsContainer = this.config['storage'][this.storage].container;

    fs.readFile(file, function (err, buf) {
      if (err) return cb(err);

      var onUploadToContainer = function (err, uploaded) {
        if (err) return cb(err);
        if (uploaded) {
          log(remoteFile + ' uploaded');
          // remove the file after successful upload
          fs.unlink(tempDir + remoteFile);
          cb(null, filename);
        }
      };

      var addFileToContainer = function (err, container) {
        if (err) return cb(err);
        var options = {
          remote: remoteFile,
          headers: {
            'Content-Type': type,
            'Content-Length': buf.length
          },
          local: file
        };

        self.cdnUri = container.cdnUri;
        client.addFile(rsContainer, options, onUploadToContainer);
      };

      client.setAuth(function () {
        client.getContainer(rsContainer, true, addFileToContainer);
      });
    });
  },

  /**
   * Upload all the variants to Amazon S3
   *
   * @param {Object} file
   * @param {String} remoteFile
   * @param {String} filename
   * @param {String} type
   * @param {Function} cb
   * @return {Imager}
   * @api public
   */

  pushToS3: function (file, remoteFile, filename, type, cb) {
    var self = this;
    var client = knox.createClient(this.config['storage'][this.storage]);
    var directory = this.config['storage']['uploadDirectory'] || '';

    client.putFile(file, directory + remoteFile, { 'x-amz-acl': 'public-read', 'x-amz-storage-class': this.config['storage'][this.storage]['storageClass'] }, function (err, res) {
      if (err) return cb(err);
      log(remoteFile + ' uploaded');
      // remove the file after successful upload
      fs.unlink(tempDir + remoteFile);
      self.cdnUri = 'http://' + client.endpoint;
      cb(err, filename);
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
    var variants = this.config.variants[variant];
    var asyncArr = [];
    var self = this;

    if (variants.resize) {
      Object.keys(variants.resize).forEach(function (preset) {
        var removeFiles = function (cb) {
          self['removeFrom' + self.storage](file, preset, cb);
        };
        asyncArr.push(removeFiles);
      });
    }

    if (variants.crop) {
      Object.keys(variants.crop).forEach(function (preset) {
        var removeFiles = function (cb) {
          self['removeFrom' + self.storage](file, preset, cb);
        };
        asyncArr.push(removeFiles);
      });
    }

    if (variants.resizeAndCrop) {
      Object.keys(variants.resizeAndCrop).forEach(function (preset) {
        var removeFiles = function (cb) {
          self['removeFrom' + self.storage](file, preset, cb);
        };
        asyncArr.push(removeFiles);
      });
    }

    async.parallel(asyncArr, function (err, results) {
      fn(err);
    });
  },

  /**
   * Remove all the variants from Rackspace
   *
   * @param {Object} file
   * @param {Object} preset
   * @param {Function} cb
   * @return {Imager}
   * @api public
   */

  removeFromRackspace: function (file, preset, cb) {
    var self = this;
    var client = cloudfiles.createClient(this.config['storage'][this.storage]);
    var rsContainer = this.config['storage'][this.storage].container;
    var remoteFile = preset + '_' + file;

    client.setAuth(function () {
      client.getContainer(rsContainer, true, function (err, container) {
        if (err) return callback(err);

        container.removeFile(remoteFile, function (err) {
          log(remoteFile + ' removed');
          if (err) console.error(err);
          cb(err);
        });
      });
    });
  },

  /**
   * Remove all the variants from Amazon S3
   *
   * @param {Object} file
   * @param {Object} preset
   * @param {Function} cb
   * @return {Imager}
   * @api public
   */

  removeFromS3: function (file, preset, cb) {
    var self = this;
    var client = knox.createClient(this.config['storage'][this.storage]);
    var remoteFile = preset + '_' + file;
    var directory = this.config['storage']['uploadDirectory'] || '';

    client.deleteFile(directory + remoteFile, function (err, res) {
      log(remoteFile + ' removed');
      if (err) console.error(err);
      cb(err);
    });
  }
};

/**
 * Log
 *
 * @param {String} str
 * @api private
 */

function log (str) {
  if (debug) {
    console.info(str);
  }
}

/**
 * Get file info
 *
 * @param {String} file
 * @param {Function} cb
 * @api private
 */

function getFileInfo (file, cb) {
  var f = {
    size: fs.statSync(file).size,
    type: mime.lookup(file),
    name: file.split('/')[file.split('/').length - 1],
    path: file
  };
  file = f;
  cb(null, file);
};
